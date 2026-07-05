import React, { useEffect, useRef, useState } from 'react';
import { Player } from '../types.js';
import { Video, VideoOff, Mic, MicOff, Volume2, ShieldAlert, ShieldCheck } from 'lucide-react';

interface AudioVideoRoomProps {
  socket: WebSocket | null;
  roomId: string;
  playerId: string;
  players: Record<string, Player>;
  existingPlayerIds: string[];
  lastWebRtcSignal: { senderId: string; signal: any } | null;
  lastDisconnectedPeerId: string | null;
}

const ICE_SERVERS = {
  iceServers: [
    // Standard STUN servers for direct P2P connections
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' },
    
    // Free Public TURN relay servers (openrelayproject by Metered.ca)
    // Required to traverse Symmetric NAT firewalls when players connect from different cities/networks (e.g. cellular, public Wi-Fi)
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    // Secure TURN (TURNS) running over TLS/SSL (Encrypted, highly reliable, bypasses strict carrier & public firewalls)
    {
      urls: 'turns:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turns:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

interface RemoteVideoProps {
  stream: MediaStream;
  playerId: string;
}

function RemoteVideo({ stream, playerId }: RemoteVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    
    console.log(`Setting remote video srcObject for peer ${playerId}:`, stream, "Tracks:", stream.getTracks().map(t => t.kind));
    videoEl.srcObject = stream;
  }, [stream, playerId]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="absolute inset-0 w-full h-full object-cover"
      id={`remote-stream-${playerId}`}
    />
  );
}

interface RemoteAudioProps {
  stream: MediaStream;
  playerId: string;
}

function RemoteAudio({ stream, playerId }: RemoteAudioProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;
    
    console.log(`Setting remote audio srcObject for peer ${playerId}:`, stream, "Tracks:", stream.getTracks().map(t => t.kind));
    audioEl.srcObject = stream;
  }, [stream, playerId]);

  return (
    <audio
      ref={audioRef}
      autoPlay
      className="absolute w-0 h-0 opacity-0 pointer-events-none"
    />
  );
}

export default function AudioVideoRoom({
  socket,
  roomId,
  playerId,
  players,
  existingPlayerIds,
  lastWebRtcSignal,
  lastDisconnectedPeerId,
}: AudioVideoRoomProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});

  const socketRef = useRef(socket);
  const playerIdRef = useRef(playerId);
  const localStreamRef = useRef(localStream);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  useEffect(() => {
    playerIdRef.current = playerId;
  }, [playerId]);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);
  const [hasCamera, setHasCamera] = useState(false);
  const [hasMic, setHasMic] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  // Keep peer connections in ref to survive re-renders
  const pcsRef = useRef<Record<string, RTCPeerConnection>>({});
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const pendingSignalsRef = useRef<Array<{ senderId: string; signal: any }>>([]);

  // Initialize Local Media Stream
  useEffect(() => {
    let activeStream: MediaStream | null = null;

    async function setupLocalMedia() {
      try {
        // Step 1: Attempt fully enabled audio and video capture
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, frameRate: 15 },
          audio: true,
        });
        activeStream = stream;
        setLocalStream(stream);
        setHasCamera(true);
        setHasMic(true);
        setIsVideoOff(false);
        setIsMuted(false);
        updateMediaStatus(true, true);
      } catch (err) {
        console.warn('Webcam + Mic access failed. Trying audio only...', err);
        try {
          // Step 2: Attempt audio-only backup capture
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          activeStream = stream;
          setLocalStream(stream);
          setHasCamera(false);
          setHasMic(true);
          setIsVideoOff(true);
          setIsMuted(false);
          updateMediaStatus(false, true);
        } catch (audioErr) {
          // Step 3: Gracefully fallback with all devices offline
          console.error('All hardware devices blocked or unavailable:', audioErr);
          setHasCamera(false);
          setHasMic(false);
          setIsVideoOff(true);
          setIsMuted(true);
          updateMediaStatus(false, false);
          setLocalStream(new MediaStream()); // Let WebRTC signaling progress as a receiver
        }
      }
    }

    setupLocalMedia();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [roomId]);

  // Hook local video stream element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Sync local tracks to all existing peer connections when localStream is acquired or updated
  useEffect(() => {
    if (!localStream || !socket || socket.readyState !== WebSocket.OPEN) return;
    
    async function syncAndRenegotiate() {
      for (const [targetId, pc] of Object.entries(pcsRef.current) as Array<[string, RTCPeerConnection]>) {
        let tracksAdded = false;
        localStream.getTracks().forEach((track) => {
          const alreadyAdded = pc.getSenders().some((s) => s.track === track);
          if (!alreadyAdded) {
            try {
              pc.addTrack(track, localStream);
              tracksAdded = true;
            } catch (err) {
              console.warn(`Error adding track to peer connection for ${targetId}:`, err);
            }
          }
        });

        // Initiate renegotiation if new tracks were added to an existing connection
        if (tracksAdded) {
          try {
            console.log(`Initiating WebRTC renegotiation offer to peer: ${targetId}`);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            const activeSocket = socketRef.current;
            if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
              activeSocket.send(
                JSON.stringify({
                  type: 'webrtc_signal',
                  payload: {
                    targetId,
                    signal: { type: 'offer', sdp: pc.localDescription },
                  },
                })
              );
            }
          } catch (negotiateErr) {
            console.error(`Failed initiating WebRTC renegotiation offer to peer: ${targetId}`, negotiateErr);
          }
        }
      }
    }

    syncAndRenegotiate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStream, socket]);

  // Notify server of current media profile
  function updateMediaStatus(camera: boolean, mic: boolean) {
    const activeSocket = socketRef.current;
    if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
      activeSocket.send(
        JSON.stringify({
          type: 'toggle_media',
          payload: { hasCamera: camera, hasMic: mic },
        })
      );
    }
  }

  // Toggle Camera
  const toggleCamera = () => {
    if (!localStream || !hasCamera) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      const nextState = !videoTrack.enabled;
      videoTrack.enabled = nextState;
      setIsVideoOff(!nextState);
      updateMediaStatus(nextState, !isMuted);
    }
  };

  // Toggle Microphone
  const toggleMic = () => {
    if (!localStream || !hasMic) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      const nextState = !audioTrack.enabled;
      audioTrack.enabled = nextState;
      setIsMuted(!nextState);
      updateMediaStatus(!isVideoOff, nextState);
    }
  };

  // Setup Peer Connection Helper
  const createPeerConnection = (targetId: string): RTCPeerConnection => {
    if (pcsRef.current[targetId]) {
      return pcsRef.current[targetId];
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    (pc as any).iceQueue = [];

    // Track state exchanges
    pc.onicecandidate = (e) => {
      const activeSocket = socketRef.current;
      if (e.candidate && activeSocket && activeSocket.readyState === WebSocket.OPEN) {
        activeSocket.send(
          JSON.stringify({
            type: 'webrtc_signal',
            payload: {
              targetId,
              signal: { type: 'candidate', candidate: e.candidate },
            },
          })
        );
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state change for peer ${targetId}: ${pc.connectionState}`);
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE connection state change for peer ${targetId}: ${pc.iceConnectionState}`);
    };

    pc.ontrack = (e) => {
      console.log('OnTrack event received for peer:', targetId, e.streams);
      setRemoteStreams((prev) => {
        const currentStream = prev[targetId];
        let nextStream: MediaStream;
        if (currentStream) {
          if (!currentStream.getTracks().includes(e.track)) {
            currentStream.addTrack(e.track);
          }
          nextStream = new MediaStream(currentStream.getTracks());
        } else {
          nextStream = e.streams[0] ? new MediaStream(e.streams[0].getTracks()) : new MediaStream([e.track]);
        }
        return { ...prev, [targetId]: nextStream };
      });
    };

    // Attach local media tracks if active
    const activeStream = localStreamRef.current;
    if (activeStream) {
      activeStream.getTracks().forEach((track) => {
        pc.addTrack(track, activeStream);
      });
    }

    pcsRef.current[targetId] = pc;
    return pc;
  };

  // Call all existing members when joining as a new member
  useEffect(() => {
    if (!localStream || existingPlayerIds.length === 0 || !socket || socket.readyState !== WebSocket.OPEN) return;

    async function makeCalls() {
      for (const targetId of existingPlayerIds) {
        if (targetId === playerIdRef.current) continue;
        const pc = createPeerConnection(targetId);

        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          const activeSocket = socketRef.current;
          if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
            activeSocket.send(
              JSON.stringify({
                type: 'webrtc_signal',
                payload: {
                  targetId,
                  signal: { type: 'offer', sdp: pc.localDescription, reconnect: true },
                },
              })
            );
          }
        } catch (err) {
          console.error(`Failed initiating WebRTC call to peer: ${targetId}`, err);
        }
      }
    }

    makeCalls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStream, existingPlayerIds, socket]);

  // Process all queued incoming WebRTC signals once local stream is ready
  const processPendingSignals = async () => {
    if (!localStream) return;
    const queue = [...pendingSignalsRef.current];
    pendingSignalsRef.current = [];

    for (const item of queue) {
      const { senderId, signal } = item;
      if (senderId === playerIdRef.current) continue;

      try {
        if (signal.type === 'offer') {
          // Proactively close and remove any existing stale peer connection for this sender only if this is an explicit reconnect
          const stalePc = pcsRef.current[senderId];
          if (stalePc && signal.reconnect) {
            console.log(`Closing stale peer connection for reconnecting peer: ${senderId}`);
            try { stalePc.close(); } catch (e) {}
            delete pcsRef.current[senderId];
            setRemoteStreams((prev) => {
              const next = { ...prev };
              delete next[senderId];
              return next;
            });
          }

          const pc = createPeerConnection(senderId);
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

          // Process queued ICE candidates
          if ((pc as any).iceQueue) {
            for (const cand of (pc as any).iceQueue) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch (candErr) {
                console.warn('Error processing queued ICE candidate:', candErr);
              }
            }
            delete (pc as any).iceQueue;
          }

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          const activeSocket = socketRef.current;
          if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
            activeSocket.send(
              JSON.stringify({
                type: 'webrtc_signal',
                payload: {
                  targetId: senderId,
                  signal: { type: 'answer', sdp: pc.localDescription },
                },
              })
            );
          }
        } else if (signal.type === 'answer') {
          const pc = pcsRef.current[senderId];
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

            // Process queued ICE candidates
            if ((pc as any).iceQueue) {
              for (const cand of (pc as any).iceQueue) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(cand));
                } catch (candErr) {
                  console.warn('Error processing queued ICE candidate:', candErr);
                }
              }
              delete (pc as any).iceQueue;
            }
          }
        } else if (signal.type === 'candidate') {
          // Lazily initialize connection if not already present, to avoid dropping race-condition candidates
          const pc = createPeerConnection(senderId);
          if (pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            } catch (e) {
              console.warn('Failed to add immediate ICE candidate:', e);
            }
          } else {
            if (!(pc as any).iceQueue) {
              (pc as any).iceQueue = [];
            }
            (pc as any).iceQueue.push(signal.candidate);
          }
        }
      } catch (err) {
        console.error(`Error processing WebRTC signal from peer ${senderId}:`, err);
      }
    }
  };

  // Queue incoming signaling messages forwarded by the server
  useEffect(() => {
    if (!lastWebRtcSignal) return;
    pendingSignalsRef.current.push(lastWebRtcSignal);
    processPendingSignals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastWebRtcSignal]);

  // Drain pending signal queue as soon as local media stream is ready
  useEffect(() => {
    if (localStream) {
      processPendingSignals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStream]);

  // Clean up disconnected player's WebRTC channels
  useEffect(() => {
    if (!lastDisconnectedPeerId) return;

    const pc = pcsRef.current[lastDisconnectedPeerId];
    if (pc) {
      pc.close();
      delete pcsRef.current[lastDisconnectedPeerId];
    }

    setRemoteStreams((prev) => {
      const next = { ...prev };
      delete next[lastDisconnectedPeerId];
      return next;
    });
  }, [lastDisconnectedPeerId]);

  // Clean up disconnected player's WebRTC channels dynamically when they go offline during grace period
  useEffect(() => {
    Object.keys(pcsRef.current).forEach((targetId) => {
      const p = players[targetId];
      if (p && p.disconnected) {
        console.log(`Proactively cleaning up stale WebRTC connection for disconnected player: ${targetId}`);
        const pc = pcsRef.current[targetId];
        if (pc) {
          try { pc.close(); } catch (e) {}
          delete pcsRef.current[targetId];
        }
        setRemoteStreams((prev) => {
          if (prev[targetId]) {
            const next = { ...prev };
            delete next[targetId];
            return next;
          }
          return prev;
        });
      }
    });
  }, [players]);

  return (
    <div className="w-full bg-slate-100/60 border border-slate-200 rounded-2xl p-1.5 sm:p-2 shadow-sm shrink-0" id="room-media-panel">
      {/* Grid List of Room Players with Integrated Streams (Horizontal Scrolling Layout) */}
      <div className="flex gap-2 sm:gap-3 overflow-x-auto py-0.5 px-0.5 scrollbar-thin select-none scroll-smooth min-w-0 items-center" id="players-stream-grid">
        
        {/* Media Active Dashboard Control Hub (Sleek, inline space-saving controller) */}
        <div className="flex flex-col items-center justify-center p-1.5 sm:p-2 bg-white border border-slate-200 rounded-xl shrink-0 gap-1.5 w-14 sm:w-15 h-24 shadow-xs" id="media-panel-header">
          <span className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-widest block text-center leading-none select-none">
            MEDIA
          </span>
          <div className="flex flex-col items-center gap-1.5 w-full" id="local-media-triggers">
            <button
              onClick={toggleMic}
              disabled={!hasMic}
              className={`w-7 h-7 rounded-full border transition-all cursor-pointer flex items-center justify-center ${
                isMuted
                  ? 'bg-red-50 border-red-200 text-brand-error hover:bg-red-100 shadow-inner'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 shadow-xs'
              } disabled:opacity-50`}
              title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
              aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={toggleCamera}
              disabled={!hasCamera}
              className={`w-7 h-7 rounded-full border transition-all cursor-pointer flex items-center justify-center ${
                isVideoOff
                  ? 'bg-red-50 border-red-200 text-brand-error hover:bg-red-100 shadow-inner'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 shadow-xs'
              } disabled:opacity-50`}
              title={isVideoOff ? 'Enable Camera' : 'Disable Camera'}
              aria-label={isVideoOff ? 'Turn camera on' : 'Turn camera off'}
            >
              {isVideoOff ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {Object.values(players)
          .sort((a, b) => {
            if (b.score !== a.score) {
              return b.score - a.score;
            }
            return a.name.localeCompare(b.name);
          })
          .map((player) => {
            const isSelf = player.id === playerId;
            const remoteStream = remoteStreams[player.id];
            const showVideo = isSelf ? !isVideoOff : player.hasCamera && remoteStream;

            // Compute true rank based on competition ranking (ties get the same rank)
            const higherScoringCount = Object.values(players).filter((p) => p.score > player.score).length;
            const rank = higherScoringCount + 1;
            const rankBadge = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;

            // Border & Glow settings depending on active game states
            let cardClasses = "relative w-36 h-24 flex-shrink-0 bg-slate-950 border rounded-xl overflow-hidden shadow-sm transition-all duration-300 cursor-default flex-none ";
            if (player.isDrawer) {
              cardClasses += "border-indigo-500 ring-2 ring-indigo-500/40 shadow-[0_0_12px_rgba(99,102,241,0.25)]";
            } else if (player.guessed) {
              cardClasses += "border-emerald-500 ring-2 ring-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.25)]";
            } else {
              cardClasses += "border-slate-200/50 hover:border-slate-300";
            }
            if (player.disconnected) {
              cardClasses += " opacity-45 grayscale-[40%]";
            }

            return (
              <div
                key={player.id}
                className={cardClasses}
                id={`player-card-${player.id}`}
              >
                {/* Background continuous audio player to keep sound playing even if video is toggled off/unmounted */}
                {remoteStream && !isSelf && (
                  <RemoteAudio stream={remoteStream} playerId={player.id} />
                )}

                {/* Media Stream Video */}
                {showVideo ? (
                  isSelf ? (
                    <video
                      ref={(el) => {
                        localVideoRef.current = el;
                        if (el && localStream && el.srcObject !== localStream) {
                          el.srcObject = localStream;
                        }
                      }}
                      autoPlay
                      playsInline
                      muted
                      className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
                      id="local-stream-video"
                    />
                  ) : (
                    <RemoteVideo stream={remoteStream} playerId={player.id} />
                  )
                ) : (
                  // Fallback colored avatar on a beautiful dark gradient background
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-tr from-slate-950 via-slate-900 to-indigo-955">
                    <div
                      className="w-9.5 h-9.5 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-white font-black text-sm sm:text-base shadow-md border border-white/15 animate-pulse"
                      style={{ backgroundColor: player.color }}
                    >
                      {player.name.charAt(0).toUpperCase()}
                    </div>
                  </div>
                )}

                {/* Minimalistic Mic status indicator on Bottom Right */}
                <div className="absolute bottom-1.5 right-1.5 z-10 select-none pointer-events-none">
                  {(player.id === playerId ? isMuted : !player.hasMic) ? (
                    <div className="p-0.5 bg-red-600/90 backdrop-blur-xs rounded-full text-white border border-red-500/30 shadow-xs flex items-center justify-center">
                      <MicOff className="w-2.5 h-2.5" />
                    </div>
                  ) : (
                    <div className="p-0.5 bg-slate-950/50 backdrop-blur-xs rounded-full text-slate-200 border border-white/10 shadow-xs flex items-center justify-center">
                      <Mic className="w-2.5 h-2.5" />
                    </div>
                  )}
                </div>

                {/* Silent background audio element */}
                {!isSelf && remoteStream && (
                  <audio
                    ref={(el) => {
                      if (el && el.srcObject !== remoteStream) {
                        el.srcObject = remoteStream;
                      }
                    }}
                    autoPlay
                    playsInline
                    style={{ display: 'none' }}
                  />
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
