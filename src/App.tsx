import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Player, Room, Stroke, ChatMessage, SocketMessage } from './types.js';
import DrawingCanvas from './components/DrawingCanvas.js';
import AudioVideoRoom from './components/AudioVideoRoom.js';
import CelebrationOverlay, { SoundEffects } from './components/CelebrationOverlay.js';
import DrawnLogo from './components/DrawnLogo.js';
import {
  Play,
  Copy,
  Check,
  Send,
  Sparkles,
  User,
  Plus,
  LogIn,
  Settings,
  Crown,
  LogOut,
  MessageSquare,
  Award,
  Clock,
  HelpCircle,
  ShieldAlert,
  RefreshCw,
  Volume2,
  VolumeX,
  Palette,
  Users
} from 'lucide-react';

const SWATCH_COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#f59e0b', // Yellow
  '#10b981', // Emerald
  '#3b82f6', // Blue
  '#6366f1', // Indigo
  '#a855f7', // Purple
  '#ec4899', // Pink
];

export default function App() {
  // Connection states
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [socketStatus, setSocketStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [playerId, setPlayerId] = useState<string>('');
  const [roomId, setRoomId] = useState<string>('');
  const [player, setPlayer] = useState<Player | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Form states
  const [nickname, setNickname] = useState<string>(() => {
    return typeof window !== 'undefined' ? window.sessionStorage.getItem('drawn_username') || '' : '';
  });
  const [formError, setFormError] = useState<string>('');
  const [avatarColor, setAvatarColor] = useState<string>(() => {
    return typeof window !== 'undefined' ? window.sessionStorage.getItem('drawn_avatar') || SWATCH_COLORS[0] : SWATCH_COLORS[0];
  });
  const [inputRoomCode, setInputRoomCode] = useState<string>('');
  const [chatInput, setChatInput] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Lobby Settings (Host only)
  const [maxRounds, setMaxRounds] = useState<number>(3);
  const [roundDuration, setRoundDuration] = useState<number>(80);

  // WebRTC Triggers
  const [existingPlayerIds, setExistingPlayerIds] = useState<string[]>([]);
  const [lastWebRtcSignal, setLastWebRtcSignal] = useState<{ senderId: string; signal: any } | null>(null);
  const [lastDisconnectedPeerId, setLastDisconnectedPeerId] = useState<string | null>(null);

  // Responsive mobile active tabs & rules toggles
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth < 640);
  const [activeMobileTab, setActiveMobileTab] = useState<'canvas' | 'chats' | 'players'>('canvas');
  const [pipWidth, setPipWidth] = useState<number>(140);
  const [pipPos, setPipPos] = useState({ x: 16, y: 110 }); // Offsets from bottom-right
  const [lastReadMessageCount, setLastReadMessageCount] = useState<number>(0);

  // Clear unread messages notification dot when opening chats
  useEffect(() => {
    if (activeMobileTab === 'chats') {
      setLastReadMessageCount(messages.length);
    }
  }, [messages.length, activeMobileTab]);

  const dragStartRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const resizeStartRef = useRef<{ startX: number; startWidth: number; startPosX: number; startPosY: number } | null>(null);

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartRef.current = {
      startX: clientX,
      startY: clientY,
      startPosX: pipPos.x,
      startPosY: pipPos.y,
    };
  };

  const handleDragMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!dragStartRef.current) return;
    if (e.cancelable) e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const deltaX = clientX - dragStartRef.current.startX;
    const deltaY = clientY - dragStartRef.current.startY;

    const newX = Math.max(8, dragStartRef.current.startPosX - deltaX);
    const newY = Math.max(8, dragStartRef.current.startPosY - deltaY);

    const maxPosX = window.innerWidth - pipWidth - 8;
    const maxPosY = window.innerHeight - (pipWidth * 0.75) - 8;

    setPipPos({
      x: Math.min(newX, maxPosX),
      y: Math.min(newY, maxPosY),
    });
  };

  const handleDragEnd = () => {
    dragStartRef.current = null;
  };

  const handleResizeStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    resizeStartRef.current = {
      startX: clientX,
      startWidth: pipWidth,
      startPosX: pipPos.x,
      startPosY: pipPos.y,
    };
  };

  const handleResizeMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!resizeStartRef.current) return;
    if (e.cancelable) e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const deltaX = clientX - resizeStartRef.current.startX;

    const newWidth = Math.max(100, Math.min(260, resizeStartRef.current.startWidth - deltaX));
    setPipWidth(newWidth);
  };

  const handleResizeEnd = () => {
    resizeStartRef.current = null;
  };

  const [showScoringRules, setShowScoringRules] = useState<boolean>(false);
  const [showHostSettings, setShowHostSettings] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    return typeof window !== 'undefined' && window.localStorage.getItem('scribble_sound_enabled') !== 'false';
  });

  const toggleSound = () => {
    const newVal = !soundEnabled;
    setSoundEnabled(newVal);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('scribble_sound_enabled', String(newVal));
    }
    if (newVal) {
      SoundEffects.playSelect();
    }
  };

  // Celebration triggers
  const [correctGuessTrigger, setCorrectGuessTrigger] = useState<number>(0);
  const [roundEndTrigger, setRoundEndTrigger] = useState<number>(0);
  const [gameOverTrigger, setGameOverTrigger] = useState<number>(0);
  const [guesserName, setGuesserName] = useState<string>('');

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Refs to store current details for automatic silent reconnection rejoins
  const nicknameRef = useRef<string>('');
  const roomIdRef = useRef<string>('');
  const avatarColorRef = useRef<string>('');

  useEffect(() => { nicknameRef.current = nickname; }, [nickname]);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);
  useEffect(() => { avatarColorRef.current = avatarColor; }, [avatarColor]);

  // Keep a ref to playerId because setPlayerId is async, and we need playerId in onmessage etc.
  const playerIdRef = useRef<string>('');
  useEffect(() => { playerIdRef.current = playerId; }, [playerId]);

  // Ref to track last timer tick audio warning played
  const lastTickTimeRef = useRef<number | null>(null);

  // Parse room code from query URL parameters if sharing link is clicked
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    if (roomFromUrl) {
      setInputRoomCode(roomFromUrl.toUpperCase());
    }
  }, []);

  // Update isMobile state on window resize
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize Socket connection with self-healing automatic reconnection
  useEffect(() => {
    let active = true;
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    function connect() {
      if (!active) return;
      console.log('Connecting to server...');
      setSocketStatus('connecting');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (!active) return;
        console.log('Successfully connected to server');
        setSocketStatus('connected');
        setFormError('');

        // If we have sessionStorage details (from page reload), trigger auto-rejoin immediately!
        const storedRoomId = typeof window !== 'undefined' ? window.sessionStorage.getItem('drawn_room_id') : null;
        const storedUsername = typeof window !== 'undefined' ? window.sessionStorage.getItem('drawn_username') : null;
        const storedAvatar = typeof window !== 'undefined' ? window.sessionStorage.getItem('drawn_avatar') : null;
        const storedPlayerId = typeof window !== 'undefined' ? window.sessionStorage.getItem('drawn_player_id') : null;

        const activeRoomId = roomIdRef.current || storedRoomId;
        const activeName = nicknameRef.current || storedUsername;
        const activeColor = avatarColorRef.current || storedAvatar || SWATCH_COLORS[0];

        if (activeRoomId && activeName) {
          // Pre-populate input fields if rejoining on reload
          if (!roomIdRef.current) setRoomId(activeRoomId);
          if (!nicknameRef.current) setNickname(activeName);
          if (avatarColorRef.current !== activeColor) setAvatarColor(activeColor);

          ws?.send(
            JSON.stringify({
              type: 'join_room',
              payload: {
                name: activeName,
                color: activeColor,
                roomId: activeRoomId,
                playerId: storedPlayerId || undefined,
              },
            })
          );
        }
      };

      ws.onmessage = (event) => {
        if (!active) return;
        try {
          const msg: SocketMessage = JSON.parse(event.data);

          switch (msg.type) {
            case 'init_player':
              setPlayerId(msg.payload.playerId);
              break;

            case 'join_success': {
              const { roomId: newRoomId, player: me, room: initialRoom, strokes: initialStrokes } = msg.payload;
              setRoomId(newRoomId);
              setPlayerId(me.id);
              setPlayer(me);
              setRoom(initialRoom);
              setStrokes(initialStrokes || []);

              // Save session data to sessionStorage for resume support on reloads
              if (typeof window !== 'undefined') {
                window.sessionStorage.setItem('drawn_room_id', newRoomId);
                window.sessionStorage.setItem('drawn_player_id', me.id);
                window.sessionStorage.setItem('drawn_username', me.name);
                window.sessionStorage.setItem('drawn_avatar', me.color);
              }

              // Identify all other players currently in the lobby to call them via WebRTC
              const otherIds = Object.keys(initialRoom.players).filter((id) => id !== me.id);
              setExistingPlayerIds(otherIds);

              // Update sharing URL in address bar without reloading
              window.history.replaceState(null, '', `?room=${newRoomId}`);
              break;
            }

            case 'sync_state': {
              const { room: updatedRoom, strokes: updatedStrokes } = msg.payload;
              
              if (updatedRoom) {
                if (updatedRoom.status === 'DRAWING') {
                  const tr = updatedRoom.timeRemaining;
                  if (tr > 0 && tr <= 10 && tr !== lastTickTimeRef.current) {
                    console.log(`[Timer Warning] Playing tick sound. Time remaining: ${tr}s. Urgent: ${tr <= 5}`);
                    SoundEffects.playTick(tr <= 5);
                    lastTickTimeRef.current = tr;
                  }
                } else {
                  lastTickTimeRef.current = null;
                }
              }
              
              setRoom((prevRoom) => {
                if (prevRoom && updatedRoom) {
                  const oldPlayers = prevRoom.players;
                  const newPlayers = updatedRoom.players;

                  // Check if anyone newly guessed correctly
                  Object.keys(newPlayers).forEach((id) => {
                    const oldP = oldPlayers[id];
                    const newP = newPlayers[id];
                    if (newP && newP.guessed && (!oldP || !oldP.guessed)) {
                      setGuesserName(newP.name);
                      setCorrectGuessTrigger((prev) => prev + 1);
                    }
                  });

                  // Check for transition to ROUND_END
                  if (updatedRoom.status === 'ROUND_END' && prevRoom.status !== 'ROUND_END') {
                    setRoundEndTrigger((prev) => prev + 1);
                  }

                  // Check for transition to GAME_OVER
                  if (updatedRoom.status === 'GAME_OVER' && prevRoom.status !== 'GAME_OVER') {
                    setGameOverTrigger((prev) => prev + 1);
                  }
                }
                return updatedRoom;
              });

              if (updatedStrokes !== undefined) {
                setStrokes(updatedStrokes);
              }
              if (updatedRoom.maxRounds) {
                setMaxRounds(updatedRoom.maxRounds);
              }
              if (updatedRoom.roundDuration) {
                setRoundDuration(updatedRoom.roundDuration);
              }
              // Update my local player context if matched
              if (playerIdRef.current && updatedRoom.players[playerIdRef.current]) {
                setPlayer(updatedRoom.players[playerIdRef.current]);
              }
              break;
            }

            case 'draw_stroke': {
              const stroke: Stroke = msg.payload;
              setStrokes((prev) => {
                const index = prev.findIndex((s) => s.id === stroke.id);
                if (index >= 0) {
                  const updated = [...prev];
                  updated[index] = stroke;
                  return updated;
                } else {
                  return [...prev, stroke];
                }
              });
              break;
            }

            case 'clear_canvas':
              setStrokes([]);
              break;

            case 'undo_stroke':
              setStrokes((prev) => prev.slice(0, -1));
              break;

            case 'send_message': {
              const chatMsg: ChatMessage = msg.payload;
              setMessages((prev) => [...prev, chatMsg]);
              break;
            }

            case 'webrtc_signal':
              setLastWebRtcSignal(msg.payload);
              break;

            case 'peer_disconnected':
              setLastDisconnectedPeerId(msg.payload.peerId);
              break;

            default:
              console.log('Unrecognized socket type:', msg.type);
          }
        } catch (err) {
          console.error('Error reading socket message data:', err);
        }
      };

      ws.onclose = () => {
        if (!active) return;
        console.log('Disconnected from server, queueing reconnect...');
        setSocketStatus('disconnected');
        setSocket(null);

        reconnectTimeout = setTimeout(() => {
          connect();
        }, 2000);
      };

      ws.onerror = (err) => {
        if (!active) return;
        console.error('WebSocket error:', err);
        setSocketStatus('disconnected');
      };

      setSocket(ws);
    }

    connect();

    return () => {
      active = false;
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  // Scroll chat messages to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle Create or Join Room Submission
  const handleJoinOrCreate = (e: React.FormEvent, forceCreate = false) => {
    e.preventDefault();
    setFormError('');

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setFormError('Not connected to the server yet. Please wait a brief moment or try refreshing.');
      return;
    }

    const trimmedNickname = nickname.trim();
    if (!trimmedNickname) {
      setFormError('Please enter a nickname before joining or creating a room.');
      return;
    }

    const storedPlayerId = typeof window !== 'undefined' ? window.sessionStorage.getItem('drawn_player_id') : null;
    const storedRoomId = typeof window !== 'undefined' ? window.sessionStorage.getItem('drawn_room_id') : null;
    
    const targetRoomCode = inputRoomCode.trim().toUpperCase();
    const useStoredSession = storedPlayerId && storedRoomId && targetRoomCode === storedRoomId;

    const payload = {
      name: trimmedNickname,
      color: avatarColor,
      roomId: targetRoomCode || undefined,
      playerId: useStoredSession ? storedPlayerId : undefined,
    };

    socket.send(
      JSON.stringify({
        type: 'join_room',
        payload,
      })
    );
  };

  // Host Action: Updates Settings
  const handleUpdateSettings = () => {
    if (!socket || !roomId) return;
    socket.send(
      JSON.stringify({
        type: 'update_settings',
        payload: { maxRounds, roundDuration },
      })
    );
  };

  // Host Action: Start Game Loop
  const handleStartGame = () => {
    if (!socket || !roomId) return;
    SoundEffects.playSelect();
    socket.send(
      JSON.stringify({
        type: 'start_game',
        payload: null,
      })
    );
  };

  // Host Action: Force End Game Loop
  const handleForceEndGame = () => {
    if (!socket || !roomId) return;
    SoundEffects.playSelect();
    socket.send(
      JSON.stringify({
        type: 'force_end_game',
        payload: null,
      })
    );
    setShowHostSettings(false);
  };

  // Drawer Action: Select word to draw
  const handleSelectWord = (word: string) => {
    if (!socket || !roomId) return;
    SoundEffects.playSelect();
    socket.send(
      JSON.stringify({
        type: 'select_word',
        payload: word,
      })
    );
  };

  // Drawer Action: Draw single stroke line
  const handleDrawStroke = (stroke: Stroke) => {
    if (!socket || !roomId) return;
    
    // Update local strokes state immediately so drawer has high-fidelity real-time rendering
    setStrokes((prev) => {
      const index = prev.findIndex((s) => s.id === stroke.id);
      if (index >= 0) {
        const updated = [...prev];
        updated[index] = stroke;
        return updated;
      } else {
        return [...prev, stroke];
      }
    });

    socket.send(
      JSON.stringify({
        type: 'draw_stroke',
        payload: stroke,
      })
    );
  };

  // Drawer Action: Clear the canvas
  const handleClearCanvas = () => {
    if (!socket || !roomId) return;
    setStrokes([]);
    socket.send(
      JSON.stringify({
        type: 'clear_canvas',
        payload: null,
      })
    );
  };

  // Drawer Action: Undo the last stroke
  const handleUndoStroke = () => {
    if (!socket || !roomId) return;
    setStrokes((prev) => prev.slice(0, -1));
    socket.send(
      JSON.stringify({
        type: 'undo_stroke',
        payload: null,
      })
    );
  };

  // Chat message submission
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || !socket || !roomId) return;

    socket.send(
      JSON.stringify({
        type: 'send_message',
        payload: text,
      })
    );
    setChatInput('');
  };

  // Action: Copy shared room invite url
  const copyInviteLink = () => {
    const inviteUrl = `${window.location.origin}?room=${roomId}`;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  // Leave active room
  const handleLeaveRoom = () => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem('drawn_room_id');
      window.sessionStorage.removeItem('drawn_player_id');
    }
    window.location.href = window.location.origin;
  };

  // Compute word reveal hint masking for guessers
  const maskedWord = useMemo(() => {
    if (!room || !room.currentWord) return '';
    const isDrawer = room.currentDrawerId === playerId;
    if (isDrawer) return room.currentWord.toUpperCase();

    // Gradually reveal letters based on remaining seconds
    const percentElapsed = (room.roundDuration - room.timeRemaining) / room.roundDuration;
    let revealCount = 0;
    if (percentElapsed > 0.5) revealCount = 1;
    if (percentElapsed > 0.75 && room.currentWord.length > 4) revealCount = 2;

    const uppercaseWord = room.currentWord.toUpperCase();
    const len = uppercaseWord.length;

    return uppercaseWord
      .split('')
      .map((char, index) => {
        if (char === ' ') return ' ';
        if (index === 0 && revealCount >= 1) return char;
        if (index === Math.floor(len / 2) && revealCount >= 2) return char;
        return '_';
      })
      .join(' ');
  }, [room, playerId]);

  // Determine if I am the active drawer
  const isMyTurnToDraw = room?.status === 'DRAWING' && room.currentDrawerId === playerId;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col overflow-hidden" id="app-root">
      {/* 1. LOGIN/JOIN SCREEN VIEW */}
      {!room ? (
        <div className="flex flex-col items-center justify-center min-h-screen px-4 py-12 bg-slate-50" id="lobby-join-view">
          <div className="w-full max-w-md bg-white border border-slate-200/80 shadow-drawn-lg rounded-3xl p-8 text-slate-800 animate-fade-in" id="lobby-card-box">
            <div className="text-center mb-8">
              <div className="relative inline-block mb-2 w-full" id="lobby-logo-wrapper">
                <DrawnLogo showTagline={true} animated={true} className="w-full" />
                {/* Visual live pulse indicator for WebSocket status */}
                <span className={`absolute top-4 right-12 sm:right-16 w-3.5 h-3.5 rounded-full border-2 border-white shadow-drawn-xs ${
                  socketStatus === 'connected' ? 'bg-brand-success' : socketStatus === 'connecting' ? 'bg-brand-warning animate-pulse' : 'bg-brand-error'
                }`} title={`Connection: ${socketStatus}`} />
              </div>
              <p className="text-[10px] text-brand-primary font-black uppercase tracking-widest mt-1" id="lobby-sub-text">
                {socketStatus === 'connected' ? 'Connected & Ready • DRAWN Lobby' : socketStatus === 'connecting' ? 'Connecting to DRAWN...' : 'Offline - Reconnecting...'}
              </p>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 text-brand-error rounded-xl text-xs font-semibold text-center animate-fade-in" id="lobby-error-banner">
                {formError}
              </div>
            )}

            <form onSubmit={(e) => handleJoinOrCreate(e)} className="space-y-6" id="join-form">
              {/* Nickname field */}
              <div id="nickname-section">
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-2" htmlFor="nickname-field">
                  Your Nickname
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    id="nickname-field"
                    type="text"
                    required
                    maxLength={15}
                    placeholder="Enter nickname..."
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="w-full pl-9.5 pr-4 h-12 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-brand-primary focus:bg-white text-slate-850 text-xs font-semibold shadow-xs"
                  />
                </div>
              </div>

              {/* Avatar swatches */}
              <div id="avatar-color-section">
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-2">
                  Select Theme Color
                </label>
                <div className="grid grid-cols-8 gap-2" id="color-swatches-grid">
                  {SWATCH_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setAvatarColor(color)}
                      style={{ backgroundColor: color }}
                      className={`h-7 rounded-full border border-slate-200 transition-transform active:scale-95 cursor-pointer ${
                        avatarColor === color ? 'ring-2 ring-brand-primary ring-offset-2 ring-offset-white scale-110' : 'hover:scale-105'
                      }`}
                      aria-label={`Select theme color ${color}`}
                    />
                  ))}
                </div>
              </div>

              {/* Divider lines */}
              <div className="relative flex py-1 items-center" id="form-separator">
                <div className="flex-grow border-t border-slate-100" />
                <span className="flex-shrink mx-4 text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Rooms Setup</span>
                <div className="flex-grow border-t border-slate-100" />
              </div>

              {/* Lobby Code Inputs */}
              <div className="flex flex-col gap-3" id="join-room-actions">
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={5}
                    placeholder="ROOM CODE (OPTIONAL)"
                    value={inputRoomCode}
                    onChange={(e) => setInputRoomCode(e.target.value.toUpperCase())}
                    className="flex-1 uppercase text-center font-mono tracking-widest text-xs h-12 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-brand-primary focus:bg-white text-slate-800 font-bold"
                  />
                  <button
                    type="submit"
                    className="px-5 h-12 bg-brand-primary hover:bg-brand-primary-hover active:scale-[0.97] text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-drawn-sm inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>Join</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={(e) => handleJoinOrCreate(e, true)}
                  className="w-full h-12 bg-white hover:bg-indigo-50/50 text-brand-primary border border-brand-primary font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all active:scale-[0.97] inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-drawn-sm"
                >
                  <Plus className="w-4 h-4 text-brand-primary" />
                  <span>Create a New Private Room</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : (
        /* 2. MAIN ACTIVE ROOM & GAMEPLAY VIEW */
        <div className="flex flex-col h-screen h-[100dvh] overflow-hidden bg-slate-50 text-slate-800 animate-fade-in" id="active-game-view">
          {/* Connection Lost Alert Banner */}
          {socketStatus !== 'connected' && (
            <div className="bg-red-600 text-white text-xs font-bold text-center py-2 px-4 flex items-center justify-center gap-2 animate-pulse z-50 shrink-0 shadow-lg">
              <ShieldAlert className="w-4 h-4 text-white animate-bounce" />
              <span>Network Connection Lost. Attempting to restore session automatically...</span>
            </div>
          )}

          {/* Top Elegant Navigation Panel */}
          <header className="h-16 flex-none bg-white border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between shadow-xs" id="game-header-bar">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center justify-center" id="header-brand-logo">
                <DrawnLogo showTagline={false} animated={true} className="h-12 w-28 sm:w-32 -my-2" />
              </div>
              <div className="hidden sm:flex border-l border-slate-200 pl-3 h-8 flex-col justify-center">
                <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider leading-none mb-1">
                  Room #{roomId}
                </p>
                <p className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider leading-none">
                  {Object.keys(room.players).length} Players
                </p>
              </div>
            </div>

            {/* Middle Word / Banner Panel during Round drawing */}
            {room.status === 'DRAWING' && (
              <div className="flex-1 sm:flex-none flex justify-center mx-1 sm:mx-2 min-w-0" id="drawing-banner-reveal">
                <div className={`px-2 sm:px-6 py-1.5 sm:py-2 rounded-full border flex items-center gap-1.5 sm:gap-4 transition-all ${
                  room.timeRemaining <= 15
                    ? 'bg-red-50 border-red-200 animate-pulse shadow-xs'
                    : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className="text-[11px] xs:text-sm sm:text-xl font-black tracking-[0.1em] xs:tracking-[0.2em] sm:tracking-[0.4em] text-slate-850 font-mono uppercase truncate" id="masked-word-display">
                    {isMyTurnToDraw ? room.currentWord.toUpperCase() : maskedWord}
                  </span>
                  <div className={`h-4 sm:h-6 w-px ${room.timeRemaining <= 15 ? 'bg-red-200' : 'bg-slate-200'}`}></div>
                  <span className={`font-mono font-black text-xs sm:text-xl ${
                    room.timeRemaining <= 15
                      ? 'text-red-600'
                      : 'text-amber-600'
                  }`}>
                    00:{room.timeRemaining < 10 ? `0${room.timeRemaining}` : room.timeRemaining}
                  </span>
                </div>
              </div>
            )}

            {room.status === 'WORD_SELECTION' && (
              <div className="text-center px-3 sm:px-6 py-1 bg-amber-50 border border-amber-200 rounded-full shadow-xs" id="word-selection-banner">
                <span className="text-[9px] sm:text-xs font-black text-amber-700 animate-pulse uppercase tracking-wider">Choosing Word...</span>
              </div>
            )}

            {room.status === 'ROUND_END' && (
              <div className="text-center px-3 sm:px-6 py-1 bg-emerald-50 border border-emerald-200 rounded-full shadow-xs" id="round-end-banner">
                <span className="text-[9px] sm:text-xs font-black text-emerald-700 uppercase tracking-wider">Round Over!</span>
              </div>
            )}

            {/* Header control triggers */}
            <div className="flex items-center gap-1 sm:gap-2">
              {player?.isHost && room.status !== 'LOBBY' && (
                <button
                  onClick={() => setShowHostSettings(true)}
                  className="h-9 px-2.5 sm:px-4 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-[10px] sm:text-xs font-black text-white border border-indigo-700 transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 shadow-xs shrink-0"
                  title="Open Host Settings Panel"
                  id="host-settings-trigger-btn"
                >
                  <Settings className="w-4 h-4 text-white" />
                  <span className="hidden sm:inline">HOST PANEL</span>
                </button>
              )}
              <button
                onClick={toggleSound}
                className="h-9 px-2.5 sm:px-4 bg-slate-50 hover:bg-slate-100 rounded-xl text-[10px] sm:text-xs font-bold border border-slate-200 text-slate-600 transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 shadow-xs shrink-0"
                title={soundEnabled ? 'Mute game sounds' : 'Unmute game sounds'}
                id="toggle-game-sounds-btn"
              >
                {soundEnabled ? (
                  <>
                    <Volume2 className="w-4 h-4 text-emerald-600 animate-pulse" />
                    <span className="hidden xs:inline text-slate-700">SOUND: ON</span>
                  </>
                ) : (
                  <>
                    <VolumeX className="w-4 h-4 text-slate-400" />
                    <span className="hidden xs:inline text-slate-400">SOUND: OFF</span>
                  </>
                )}
              </button>
              <button
                onClick={() => setShowScoringRules(true)}
                className="hidden sm:inline-flex h-9 px-3 sm:px-4 bg-amber-50 hover:bg-amber-100 rounded-xl text-[10px] sm:text-xs font-bold border border-amber-200 text-amber-700 transition-all items-center justify-center gap-1.5 shadow-xs shrink-0"
                title="View Transparent Scoring Rules"
                id="scoring-rules-trigger-btn"
              >
                <Award className="w-4 h-4 text-amber-600" />
                <span className="hidden sm:inline">SCORING RULES</span>
              </button>
              <button
                onClick={copyInviteLink}
                className="inline-flex h-9 px-2.5 sm:px-4 bg-white hover:bg-slate-50 rounded-xl text-[10px] sm:text-xs font-bold border border-slate-200 text-slate-700 transition-all items-center justify-center gap-1.5 shadow-xs shrink-0 cursor-pointer"
                title="Copy Shared Invite Link"
              >
                {copiedLink ? <Check className="w-4 h-4 text-emerald-600 animate-pulse" /> : <Copy className="w-4 h-4 text-indigo-600" />}
                <span className="hidden sm:inline">INVITE LINK</span>
              </button>
              <button
                onClick={handleLeaveRoom}
                className="h-9 px-2.5 sm:px-4 bg-red-600 hover:bg-red-700 rounded-xl text-[10px] sm:text-xs font-black text-white border border-red-750 transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 shadow-xs shrink-0"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">LEAVE</span>
              </button>
            </div>
          </header>

          {/* Canvas is persistently visible on both mobile and desktop */}

          {/* Core Gameplay Grid Frame */}
          <main className="flex-1 flex flex-col overflow-hidden p-3 sm:p-4 gap-3 bg-slate-50 relative animate-fade-in" id="game-arena-body">
            {/* TOP ROW: Party Video feeds (Widescreen, highly prominent, always visible on all devices!) */}
            <section className={`w-full shrink-0 ${isMobile && activeMobileTab !== 'players' ? 'hidden' : 'block'}`} id="top-audio-video-section">
              <AudioVideoRoom
                socket={socket}
                roomId={roomId}
                playerId={playerId}
                players={room.players}
                existingPlayerIds={existingPlayerIds}
                lastWebRtcSignal={lastWebRtcSignal}
                lastDisconnectedPeerId={lastDisconnectedPeerId}
              />
            </section>

            {/* BOTTOM SECTION: Two-Column split (Drawing board + Chat panel stacked on mobile/narrow view, side-by-side on desktop/tablet) */}
            <div className="flex-1 flex flex-col sm:flex-row overflow-hidden gap-3 min-h-0" id="arena-split-container">
              {/* COLUMN 1: Drawing Canvas or Lobby rules (Left/Top - Flex-[1.8] on mobile, Flex-[1.6] on desktop/tablet) */}
              <section
                className={`${isMobile && activeMobileTab !== 'canvas' ? 'hidden' : 'flex'} flex-col sm:h-full overflow-hidden min-h-0 flex-[1.8] sm:flex-[1.6]`}
                id="center-arena-section"
              >
              {/* LOBBY VIEW before game active */}
              {room.status === 'LOBBY' && (
                <div className="flex flex-col items-center justify-center flex-1 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 max-w-2xl mx-auto my-auto shadow-xl text-slate-850 overflow-y-auto w-full" id="lobby-setup-panel">
                  <div className="text-center mb-6">
                    <Crown className="w-12 h-12 text-amber-500 mx-auto mb-2 animate-bounce" />
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-800">Room Setup Lobby</h3>
                    <p className="text-xs text-slate-500 mt-1">Configure rounds and wait for players to turn on their media.</p>
                  </div>

                  {/* Settings dashboard */}
                  <div className="w-full max-w-md space-y-4 bg-slate-50 border border-slate-200/80 rounded-2xl p-5 mb-6" id="lobby-settings-form">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 inline-flex items-center gap-1.5">
                        <Settings className="w-4 h-4 text-indigo-600" />
                        <span>Maximum Rounds</span>
                      </label>
                      <select
                        disabled={!player?.isHost}
                        value={maxRounds}
                        onChange={(e) => {
                          setMaxRounds(Number(e.target.value));
                          setTimeout(handleUpdateSettings, 100);
                        }}
                        className="py-1 px-2.5 bg-white border border-slate-250 text-slate-850 text-xs font-bold rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-xs"
                      >
                        <option value={2}>2 Rounds</option>
                        <option value={3}>3 Rounds</option>
                        <option value={5}>5 Rounds</option>
                        <option value={8}>8 Rounds</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 inline-flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-indigo-600" />
                        <span>Drawing Time limit</span>
                      </label>
                      <select
                        disabled={!player?.isHost}
                        value={roundDuration}
                        onChange={(e) => {
                          setRoundDuration(Number(e.target.value));
                          setTimeout(handleUpdateSettings, 100);
                        }}
                        className="py-1 px-2.5 bg-white border border-slate-250 text-slate-850 text-xs font-bold rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-xs"
                      >
                        <option value={40}>40 Seconds</option>
                        <option value={60}>60 Seconds</option>
                        <option value={80}>80 Seconds</option>
                        <option value={120}>120 Seconds</option>
                        <option value={150}>150 Seconds</option>
                      </select>
                    </div>
                  </div>

                  {/* Action launcher triggers */}
                  {player?.isHost ? (
                    <button
                      onClick={handleStartGame}
                      className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-95 inline-flex items-center gap-2 cursor-pointer"
                      id="start-game-btn"
                    >
                      <Play className="w-4 h-4 fill-current text-white" />
                      <span>Start Scribble Showdown</span>
                    </button>
                  ) : (
                    <div className="text-center py-2 px-6 bg-slate-50 border border-slate-100 rounded-full text-[10px] font-black uppercase tracking-wider text-slate-400 animate-pulse" id="waiting-host-note">
                      Waiting for host to initiate the game...
                    </div>
                  )}
                </div>
              )}

              {/* WORD SELECTION PHASE BOARD */}
              {room.status === 'WORD_SELECTION' && (
                <div className="flex flex-col items-center justify-center flex-1 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 max-w-xl mx-auto my-auto shadow-xl text-slate-800 animate-fade-in w-full" id="word-selection-picker">
                  {room.currentDrawerId === playerId ? (
                    <div className="text-center" id="picker-role-drawer">
                      <Sparkles className="w-12 h-12 text-indigo-600 mx-auto mb-3 animate-bounce" />
                      <h3 className="text-sm font-black uppercase tracking-wider text-slate-850">It is your turn to draw!</h3>
                      <p className="text-xs text-slate-500 mt-1 mb-6">Select a word below to start sketching:</p>

                      <div className="flex flex-col sm:flex-row gap-4 justify-center items-stretch w-full mt-2" id="word-options-list">
                        {room.wordChoices.map((word, idx) => (
                          <button
                            key={word}
                            onClick={() => handleSelectWord(word)}
                            className="flex-1 min-w-[140px] p-5 sm:p-7 bg-indigo-50/40 hover:bg-indigo-50 border-2 border-indigo-100 hover:border-indigo-500 text-slate-800 font-extrabold text-sm sm:text-base tracking-widest rounded-2xl transition-all hover:-translate-y-1 hover:shadow-md cursor-pointer text-center flex flex-col items-center justify-center gap-2 overflow-hidden relative group active:scale-[0.98]"
                          >
                            <div className="absolute top-0 right-0 px-2.5 py-0.5 bg-indigo-100 text-indigo-700 text-[8px] font-bold rounded-bl-lg uppercase tracking-widest group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                              Option {idx + 1}
                            </div>
                            <span className="text-2xl sm:text-3xl animate-pulse group-hover:scale-110 transition-transform">🎨</span>
                            <span className="uppercase text-indigo-950 font-black leading-tight text-center">{word}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center" id="picker-role-guesser">
                      <HelpCircle className="w-12 h-12 text-indigo-500 mx-auto mb-3 animate-spin" />
                      <h3 className="text-sm font-bold uppercase tracking-widest text-slate-800">
                        {room.players[room.currentDrawerId || '']?.name || 'The drawer'} is choosing a word...
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">Get your keyboards and microphones ready!</p>
                    </div>
                  )}
                </div>
              )}

              {/* ACTIVE BOARD CANVAS DRAWING PHASE */}
              {room.status === 'DRAWING' && (
                <div className="flex-1 flex flex-col h-full min-h-0" id="gameplay-drawing-canvas">
                  <div className="flex-1 min-h-0" id="drawing-canvas-mount">
                    <DrawingCanvas
                      isDrawer={isMyTurnToDraw}
                      strokes={strokes}
                      onDrawStroke={handleDrawStroke}
                      onClearCanvas={handleClearCanvas}
                      onUndoStroke={handleUndoStroke}
                      isPip={false}
                    />
                  </div>
                </div>
              )}

              {/* ROUND RESULTS INTERMEDIATE PANEL */}
              {room.status === 'ROUND_END' && (
                <div className="flex flex-col items-center justify-center flex-1 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 max-w-xl mx-auto my-auto shadow-xl text-slate-800 overflow-y-auto w-full animate-fade-in" id="round-results-board">
                  <div className="text-center mb-6">
                    <Award className="w-12 h-12 text-emerald-500 mx-auto mb-2 animate-pulse" />
                    <h3 className="text-sm font-black uppercase tracking-wider text-slate-800">Round Over!</h3>
                    <p className="text-xs text-slate-500 mt-0.5">The word was:</p>
                    <div className="text-2xl font-black text-emerald-600 uppercase tracking-widest mt-1.5 font-mono">
                      "{room.currentWord}"
                    </div>
                  </div>

                  {/* High score roster this round */}
                  <div className="w-full max-w-sm space-y-2" id="round-scores-list">
                    <span className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest text-center mb-3">Round Points Gained</span>
                    {(Object.values(room.players) as Player[])
                      .sort((a, b) => b.roundScore - a.roundScore)
                      .map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-150 rounded-xl text-xs shadow-xs"
                        >
                          <span className="font-extrabold text-slate-700">{p.name}</span>
                          <span className="font-black text-emerald-600">+{p.roundScore} PTS</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* GAME OVER CROWN WINNER VIEW */}
              {room.status === 'GAME_OVER' && (
                <div className="flex flex-col items-center justify-center flex-1 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 max-w-xl mx-auto my-auto shadow-xl text-slate-800 overflow-y-auto w-full animate-fade-in" id="game-over-podium">
                  <div className="text-center mb-8">
                    <div className="relative inline-block mb-3" id="podium-crown-wrapper">
                      <Crown className="w-16 h-16 text-amber-500 animate-bounce" />
                    </div>
                    <h3 className="text-base font-black uppercase tracking-widest text-slate-850">Scribble Champion Crowned!</h3>
                    <p className="text-xs text-slate-500 mt-1">Congratulations to our spectacular drawer and guesser!</p>
                  </div>

                  {/* Champion Display card */}
                  {room.winner && (
                    <div className="w-full max-w-sm bg-gradient-to-r from-amber-500/5 to-orange-500/5 border border-amber-200 rounded-2xl p-6 text-center shadow-xs mb-6" id="champion-card">
                      <span className="text-[10px] font-extrabold text-amber-600 uppercase tracking-widest">Grand Winner</span>
                      <h4 className="text-2xl font-black text-amber-700 mt-1">{room.winner.name}</h4>
                      <div className="text-xs font-black text-orange-600 mt-1.5 font-mono uppercase tracking-wider">Total score: {room.winner.score} points</div>
                    </div>
                  )}

                  {/* Roster list */}
                  <div className="w-full max-w-sm space-y-2 mb-6" id="final-leaderboard-list">
                    {(Object.values(room.players) as Player[])
                      .sort((a, b) => b.score - a.score)
                      .map((p, idx) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-150 rounded-xl text-xs shadow-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-400">#{idx + 1}</span>
                            <span className="font-extrabold text-slate-700">{p.name}</span>
                          </div>
                          <span className="font-black text-indigo-600">{p.score} PTS</span>
                        </div>
                      ))}
                  </div>

                  {/* Rematch & action buttons */}
                  <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm justify-center mt-4" id="game-over-actions">
                    {player?.isHost ? (
                      <>
                        <button
                          onClick={handleStartGame}
                          className="flex-1 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                          id="host-rematch-btn"
                        >
                          <Play className="w-4 h-4 text-white fill-current" />
                          <span>Rematch</span>
                        </button>
                        <button
                          onClick={handleLeaveRoom}
                          className="flex-1 px-5 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-750 font-bold text-xs uppercase tracking-wider rounded-xl transition-all border border-slate-200 shadow-xs cursor-pointer"
                          id="host-leave-btn"
                        >
                          Leave Room
                        </button>
                      </>
                    ) : (
                      <div className="text-center w-full space-y-3 animate-fade-in" id="guest-game-over-actions">
                        <p className="text-[10px] font-black text-indigo-650 uppercase tracking-widest animate-pulse">
                          Waiting for host to trigger rematch...
                        </p>
                        <button
                          onClick={handleLeaveRoom}
                          className="w-full px-5 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-all border border-slate-200 shadow-xs cursor-pointer"
                          id="guest-leave-btn"
                        >
                          Leave Room
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* COLUMN 3: Live chat log / guesses (Right - Stacked on mobile/narrow view, 280px/320px sidebar on desktop/tablet) */}
            <section className={`${isMobile && activeMobileTab !== 'chats' ? 'hidden' : 'flex'} flex-col bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden min-h-0 flex-1 sm:flex-none sm:w-80`} id="right-chat-section">
              <div className="flex items-center justify-between p-3.5 border-b border-slate-200 bg-white" id="chat-header-panel">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-indigo-600" />
                  <span className="text-[10px] sm:text-xs font-black text-slate-700 uppercase tracking-widest">Room Chat</span>
                </div>
                <span className="text-[9px] font-bold font-mono text-slate-400 bg-slate-50 px-2.5 py-1 border border-slate-150 rounded-full">
                  {messages.length} MSG
                </span>
              </div>

              {/* Chat history list */}
              <div className="flex-1 p-3 overflow-y-auto space-y-3 text-xs bg-slate-50/40" id="chat-history-log">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 select-none text-center p-4">
                    <MessageSquare className="w-8 h-8 opacity-40 mb-1.5 text-indigo-400" />
                    <span className="text-[10px] uppercase font-black tracking-wider text-slate-500">No messages yet</span>
                    <span className="text-[9px] text-slate-400 mt-0.5">Start guessing or chatting!</span>
                  </div>
                ) : (
                  messages.map((msg) => {
                    if (msg.isSystem) {
                      const isGuessed = msg.text.toLowerCase().includes('guessed') || msg.text.toLowerCase().includes('correct');
                      return (
                        <div
                          key={msg.id}
                          className={`my-1.5 px-3 py-1.5 rounded-xl text-center leading-relaxed text-[10.5px] font-extrabold uppercase tracking-widest border transition-all ${
                            isGuessed
                              ? 'bg-emerald-50/90 border-emerald-200 text-emerald-700 animate-pulse shadow-xs'
                              : 'bg-indigo-50/70 border-indigo-100 text-indigo-700'
                          }`}
                          id={`chat-msg-${msg.id}`}
                        >
                          {isGuessed ? '🎉 ' : '⚙️ '} {msg.text}
                        </div>
                      );
                    }

                    const isSelf = msg.senderId === playerId;
                    const senderPlayer = msg.senderId ? room.players[msg.senderId] : null;
                    const senderColor = senderPlayer?.color || '#4f46e5';

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'} gap-0.5`}
                        id={`chat-msg-${msg.id}`}
                      >
                        {/* Sender info label */}
                        <div className="flex items-center gap-1.5 px-1.5 text-[10px] text-slate-400 font-extrabold select-none">
                          {!isSelf && (
                            <span
                              className="w-1.5 h-1.5 rounded-full inline-block shadow-xs shrink-0"
                              style={{ backgroundColor: senderColor }}
                            />
                          )}
                          <span>{isSelf ? 'You' : msg.senderName}</span>
                          <span className="opacity-40">•</span>
                          <span className="font-mono text-[9px] font-bold opacity-60">{msg.timestamp}</span>
                        </div>

                        {/* Message text bubble */}
                        <div
                          className={`max-w-[85%] px-3.5 py-1.5 rounded-2xl text-[11px] font-semibold leading-relaxed break-words shadow-xs ${
                            isSelf
                              ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-tr-none'
                              : 'bg-white text-slate-800 border border-slate-200/60 rounded-tl-none'
                          }`}
                        >
                          {msg.text}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input panel */}
              <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-slate-150" id="chat-composer-form">
                <div className="relative">
                  <input
                    type="text"
                    required
                    disabled={room.status === 'DRAWING' && isMyTurnToDraw}
                    placeholder={
                      room.status === 'DRAWING'
                        ? isMyTurnToDraw
                          ? 'Drawers cannot guess!'
                          : 'Type guess here...'
                        : 'Send a message...'
                    }
                    value={chatInput}
                    onChange={(e) => {
                      setChatInput(e.target.value);
                    }}
                    className="w-full pl-3 pr-10 h-10 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:bg-white text-slate-800 text-xs disabled:opacity-50 disabled:bg-slate-50 shadow-inner transition-all duration-200"
                    id="chat-input-field"
                  />
                  <button
                    type="submit"
                    disabled={room.status === 'DRAWING' && isMyTurnToDraw}
                    className="absolute right-2 top-2 p-1 text-indigo-600 hover:text-indigo-500 disabled:opacity-50 transition-colors cursor-pointer"
                    id="chat-send-btn"
                    aria-label="Send message"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </section>
          </div> {/* Closing #arena-split-container */}

          {/* Draggable & Resizable Floating PiP Canvas (Mobile only, when not in canvas tab during a drawing round) */}
          {isMobile && activeMobileTab !== 'canvas' && room.status === 'DRAWING' && (
            <div
              style={{
                position: 'fixed',
                right: `${pipPos.x}px`,
                bottom: `${pipPos.y}px`,
                width: `${pipWidth}px`,
                height: `${pipWidth * 0.75}px`,
                zIndex: 40,
              }}
              className="bg-white border-2 border-indigo-600 rounded-2xl shadow-2xl overflow-hidden cursor-move select-none flex flex-col"
              id="floating-pip-card"
              onTouchStart={handleDragStart}
              onTouchMove={handleDragMove}
              onTouchEnd={handleDragEnd}
              onMouseDown={handleDragStart}
              onMouseMove={handleDragMove}
              onMouseUp={handleDragEnd}
            >
              {/* Canvas view inside PiP (interactivity disabled for guessers/spectators in PiP mode) */}
              <div className="flex-1 pointer-events-none min-h-0 relative bg-white">
                <DrawingCanvas
                  isDrawer={false}
                  strokes={strokes}
                  onDrawStroke={handleDrawStroke}
                  onClearCanvas={handleClearCanvas}
                  onUndoStroke={handleUndoStroke}
                  isPip={true}
                />
              </div>

              {/* Resize Handle Button (Top-Left corner) */}
              <div
                style={{
                  position: 'absolute',
                  top: '4px',
                  left: '4px',
                  width: '24px',
                  height: '24px',
                  zIndex: 50,
                }}
                className="bg-indigo-600 text-white rounded-lg flex items-center justify-center cursor-nwse-resize shadow-md active:scale-95 touch-none"
                onTouchStart={handleResizeStart}
                onTouchMove={handleResizeMove}
                onTouchEnd={handleResizeEnd}
                onMouseDown={handleResizeStart}
                onMouseMove={handleResizeMove}
                onMouseUp={handleResizeEnd}
                title="Drag to resize canvas"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-white fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
                </svg>
              </div>

              {/* Switch back to Canvas on click */}
              <div 
                onClick={() => {
                  setActiveMobileTab('canvas');
                  if (soundEnabled) SoundEffects.playSelect();
                }}
                className="bg-slate-950/80 text-white text-[8px] font-black text-center py-1 uppercase tracking-widest cursor-pointer select-none shrink-0"
              >
                Expand Canvas
              </div>
            </div>
          )}
        </main>

        {/* Mobile Navigation Segmented Tabs Bar (shown at the bottom) */}
        {isMobile && (
          <div className="bg-white border-t border-slate-200 p-2 shrink-0 w-full flex gap-1 z-30" id="mobile-tabs-bar">
            <button
              onClick={() => {
                setActiveMobileTab('canvas');
                if (soundEnabled) SoundEffects.playSelect();
              }}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 rounded-xl transition-all cursor-pointer ${
                activeMobileTab === 'canvas'
                  ? 'bg-indigo-600 text-white shadow-sm font-black'
                  : 'text-slate-500 hover:bg-slate-50 font-bold'
              }`}
            >
              <Palette className="w-5 h-5 mb-0.5" />
              <span className="text-[9px] uppercase tracking-wider">Canvas</span>
            </button>
            
            <button
              onClick={() => {
                setActiveMobileTab('chats');
                if (soundEnabled) SoundEffects.playSelect();
              }}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 rounded-xl transition-all cursor-pointer relative ${
                activeMobileTab === 'chats'
                  ? 'bg-indigo-600 text-white shadow-sm font-black'
                  : 'text-slate-500 hover:bg-slate-50 font-bold'
              }`}
            >
              <MessageSquare className="w-5 h-5 mb-0.5" />
              <span className="text-[9px] uppercase tracking-wider">Chats</span>
              {messages.length > lastReadMessageCount && activeMobileTab !== 'chats' && (
                <span className="absolute top-1.5 right-6 w-2.5 h-2.5 rounded-full bg-red-500 border border-white animate-pulse" />
              )}
            </button>

            <button
              onClick={() => {
                setActiveMobileTab('players');
                if (soundEnabled) SoundEffects.playSelect();
              }}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 rounded-xl transition-all cursor-pointer ${
                activeMobileTab === 'players'
                  ? 'bg-indigo-600 text-white shadow-sm font-black'
                  : 'text-slate-500 hover:bg-slate-50 font-bold'
              }`}
            >
              <Users className="w-5 h-5 mb-0.5" />
              <span className="text-[9px] uppercase tracking-wider">Players</span>
            </button>
          </div>
        )}

          {/* Transparent Scoring Rules explanation modal */}
          {showScoringRules && (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in" id="scoring-rules-modal-overlay">
              <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full shadow-2xl relative text-slate-800" id="scoring-rules-modal">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-850 flex items-center gap-2 mb-4">
                  <Award className="w-5 h-5 text-amber-500" />
                  <span>Transparent Scoring Logic</span>
                </h3>
                
                <div className="space-y-4 text-slate-600 text-xs leading-relaxed" id="scoring-rules-modal-content">
                  <div className="p-3 bg-slate-50 border border-slate-150 rounded-xl">
                    <span className="block font-extrabold text-amber-600 uppercase tracking-wider text-[10px] mb-1">💡 For Guessers</span>
                    <p>Points are awarded based on how fast you find the secret word:</p>
                    <ul className="list-disc pl-4 mt-1.5 space-y-1 font-semibold text-[11px] text-slate-700">
                      <li><strong className="text-slate-900">Up to 500 Speed Points</strong>: Scaled proportionally with the time remaining.</li>
                      <li><strong className="text-slate-900">100 Guaranteed Base Points</strong>: Awarded for any correct guess.</li>
                      <li><em className="text-indigo-600 font-mono">Formula: Math.round((TimeRemaining / RoundDuration) * 500) + 100</em></li>
                    </ul>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-150 rounded-xl">
                    <span className="block font-extrabold text-indigo-600 uppercase tracking-wider text-[10px] mb-1">For Drawers</span>
                    <p>Earn a bonus based on how well you communicate your drawing:</p>
                    <ul className="list-disc pl-4 mt-1.5 space-y-1 font-semibold text-[11px] text-slate-700">
                      <li><strong className="text-slate-900">Up to 250 Bonus Points</strong>: Proportional to the percentage of other players who successfully guess your word.</li>
                      <li><em className="text-indigo-600 font-mono">Formula: Math.round((CorrectGuessers / TotalGuessers) * 250)</em></li>
                    </ul>
                  </div>
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setShowScoringRules(false)}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-colors cursor-pointer shadow-sm"
                    id="close-rules-btn"
                  >
                    Got It!
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Host Controls & Live Settings modal */}
          {showHostSettings && (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in" id="host-settings-modal-overlay">
              <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full shadow-2xl relative text-slate-800" id="host-settings-modal">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-850 flex items-center gap-2 mb-4">
                  <Settings className="w-5 h-5 text-indigo-600" />
                  <span>Host Cockpit Controls</span>
                </h3>
                
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Live Session Management</p>

                <div className="space-y-4" id="host-settings-modal-content">
                  {/* Change rounds count in-game */}
                  <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-150 rounded-xl">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 inline-flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-indigo-600" />
                      <span>Maximum Rounds</span>
                    </span>
                    <select
                      value={maxRounds}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setMaxRounds(val);
                        // Send updated settings message immediately to update on server
                        setTimeout(() => {
                          if (socket && roomId) {
                            socket.send(
                              JSON.stringify({
                                type: 'update_settings',
                                payload: { maxRounds: val, roundDuration },
                              })
                            );
                          }
                        }, 50);
                      }}
                      className="py-1 px-2.5 bg-white border border-slate-200 text-slate-800 text-xs font-bold rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-xs"
                    >
                      <option value={2}>2 Rounds</option>
                      <option value={3}>3 Rounds</option>
                      <option value={5}>5 Rounds</option>
                      <option value={8}>8 Rounds</option>
                    </select>
                  </div>

                  {/* Change round duration limit in-game */}
                  <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-150 rounded-xl">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 inline-flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-indigo-600" />
                      <span>Drawing Time limit</span>
                    </span>
                    <select
                      value={roundDuration}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setRoundDuration(val);
                        // Send updated settings message immediately to update on server
                        setTimeout(() => {
                          if (socket && roomId) {
                            socket.send(
                              JSON.stringify({
                                type: 'update_settings',
                                payload: { maxRounds, roundDuration: val },
                              })
                            );
                          }
                        }, 50);
                      }}
                      className="py-1 px-2.5 bg-white border border-slate-200 text-slate-800 text-xs font-bold rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer shadow-xs"
                    >
                      <option value={30}>30 Seconds</option>
                      <option value={45}>45 Seconds</option>
                      <option value={60}>60 Seconds</option>
                      <option value={80}>80 Seconds</option>
                      <option value={120}>120 Seconds</option>
                    </select>
                  </div>

                  {/* Rematch Game */}
                  <button
                    onClick={() => {
                      handleStartGame();
                      setShowHostSettings(false);
                    }}
                    className="w-full py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                  >
                    <RefreshCw className="w-4 h-4 text-indigo-600" />
                    <span>Trigger Rematch / Restart</span>
                  </button>

                  {/* Force End Game button */}
                  <button
                    onClick={handleForceEndGame}
                    className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <ShieldAlert className="w-4 h-4" />
                    <span>Force End Game Immediately</span>
                  </button>
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setShowHostSettings(false)}
                    className="px-5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-colors cursor-pointer shadow-xs"
                    id="close-host-settings-btn"
                  >
                    Close Panel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Real-time Game Celebration Confetti & Particle Overlay */}
          <CelebrationOverlay
            correctGuessTrigger={correctGuessTrigger}
            roundEndTrigger={roundEndTrigger}
            gameOverTrigger={gameOverTrigger}
            guesserName={guesserName}
            winnerName={room?.winner?.name || ''}
          />

          {/* Footer Status Bar */}
          <footer className="h-8 flex-none bg-white border-t border-slate-200 px-6 hidden sm:flex items-center justify-between text-[10px] font-bold text-slate-400 font-mono">
            <div className="flex gap-4">
              <span>LATENCY: 14MS</span>
              <span>REGION: HOST-COCKPIT</span>
              <span>CLIENT: V.2.2.0-HYPER</span>
            </div>
            <div className="flex gap-4">
              <span className="text-indigo-600/30">PRIVACY SECURED</span>
              <span className="text-indigo-600/30">SUPPORT</span>
            </div>
          </footer>
        </div>
      )}
    </div>
  );
}
