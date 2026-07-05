import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { Room, Player, Stroke, ChatMessage, SocketMessage, RoomStatus } from './src/types.js';

import fs from 'fs';

// Setup environment
import dotenv from 'dotenv';
dotenv.config();

const logFile = path.join(process.cwd(), 'server.log');
function logToFile(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(logFile, line);
  console.log(msg);
}

// Clear log file on startup
try { fs.writeFileSync(logFile, ''); } catch (e) {}

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Standard health API
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Dictionary pool for scribble drawing words
const WORD_POOL = [
  'Apple', 'Banana', 'Cat', 'House', 'Tree', 'Pizza', 'Car', 'Sun', 'Ocean', 'Mountain',
  'Robot', 'Rocket', 'Snowman', 'Cake', 'Dog', 'Book', 'Bicycle', 'Spider', 'Dinosaur',
  'Guitar', 'Trumpet', 'Elephant', 'Giraffe', 'Turtle', 'Ice Cream', 'Hamburger', 'Taco',
  'Cloud', 'Umbrella', 'Sword', 'Crown', 'Key', 'Lock', 'Fish', 'Moon', 'Star', 'Boat',
  'Train', 'Airplane', 'Clock', 'Flower', 'Hat', 'Shoe', 'Glasses', 'Ring', 'Hammer',
  'Spoon', 'Fork', 'Knife', 'Ladder', 'Chair', 'Table', 'Bed', 'Door', 'Window', 'Mirror',
  'Computer', 'Phone', 'Camera', 'Pencil', 'Brush', 'Palette', 'Bucket', 'Balloon', 'Flag',
  'Monkey', 'Lion', 'Duck', 'Frog', 'Sheep', 'Cow', 'Horse', 'Rabbit', 'Mouse', 'Heart'
];

// In-memory server-authoritative state
const rooms: Record<string, Room> = {};
const roomStrokes: Record<string, Stroke[]> = {};
const roomIntervals: Record<string, NodeJS.Timeout> = {};
const roomWordSelectionTimeout: Record<string, NodeJS.Timeout> = {};

// Grace period timeouts
const playerDisconnectTimeouts: Record<string, NodeJS.Timeout> = {};
const roomCleanupTimeouts: Record<string, NodeJS.Timeout> = {};

// Sockets mapping
const activeConnections: Record<string, { socket: WebSocket; playerId: string; roomId: string | null }> = {};

// Generate helper IDs
function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getRandomWords(count: number): string[] {
  const shuffled = [...WORD_POOL].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

// Broadcast helper
function broadcastToRoom(roomId: string, message: SocketMessage, excludePlayerId?: string) {
  const room = rooms[roomId];
  if (!room) return;

  Object.keys(room.players).forEach((playerId) => {
    if (playerId === excludePlayerId) return;
    const connection = activeConnections[playerId];
    if (connection && connection.socket.readyState === WebSocket.OPEN) {
      connection.socket.send(JSON.stringify(message));
    }
  });
}

// System chat message helper
function addSystemMessage(roomId: string, text: string) {
  const message: ChatMessage = {
    id: Math.random().toString(36).substring(2, 9),
    senderId: null,
    senderName: 'System',
    text,
    isSystem: true,
    isCorrectGuess: false,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
  broadcastToRoom(roomId, { type: 'send_message', payload: message });
}

// Start Game Loop
function startRound(roomId: string) {
  const room = rooms[roomId];
  if (!room) return;

  // Clear drawing state
  roomStrokes[roomId] = [];

  // Determine who is the drawer
  const playerIds = Object.keys(room.players);
  if (playerIds.length === 0) return;

  // Find index of current drawer, then select next
  let nextDrawerIndex = 0;
  if (room.currentDrawerId) {
    const currentIndex = playerIds.indexOf(room.currentDrawerId);
    nextDrawerIndex = (currentIndex + 1) % playerIds.length;
    // If we've cycled back to index 0, check if we need to advance the round counter
    if (nextDrawerIndex === 0) {
      room.round += 1;
    }
  }

  // Check if we reached max rounds
  if (room.round > room.maxRounds) {
    endGame(roomId);
    return;
  }

  const nextDrawerId = playerIds[nextDrawerIndex];
  room.currentDrawerId = nextDrawerId;

  // Reset player guess states for the new round
  playerIds.forEach((pid) => {
    room.players[pid].isDrawer = (pid === nextDrawerId);
    room.players[pid].guessed = false;
    room.players[pid].roundScore = 0;
  });

  // Pick word options
  room.status = 'WORD_SELECTION';
  room.wordChoices = getRandomWords(3);
  room.currentWord = '';
  room.timeRemaining = 15; // 15 seconds to pick a word

  // Clear drawing canvas state
  broadcastToRoom(roomId, { type: 'clear_canvas', payload: null });
  broadcastToRoom(roomId, { type: 'sync_state', payload: { room, strokes: [] } });

  addSystemMessage(roomId, `${room.players[nextDrawerId].name} is choosing a word...`);

  // Setup word selection countdown timer
  if (roomWordSelectionTimeout[roomId]) {
    clearTimeout(roomWordSelectionTimeout[roomId]);
  }
  if (roomIntervals[roomId]) {
    clearInterval(roomIntervals[roomId]);
  }

  roomIntervals[roomId] = setInterval(() => {
    const r = rooms[roomId];
    if (!r || r.status !== 'WORD_SELECTION') {
      clearInterval(roomIntervals[roomId]);
      return;
    }

    r.timeRemaining -= 1;
    if (r.timeRemaining <= 0) {
      clearInterval(roomIntervals[roomId]);
      // Host or system selects first choice automatically if they timed out
      const autoWord = r.wordChoices[0] || 'Apple';
      selectWord(roomId, autoWord);
    } else {
      broadcastToRoom(roomId, { type: 'sync_state', payload: { room: r, strokes: [] } });
    }
  }, 1000);
}

function selectWord(roomId: string, word: string) {
  const room = rooms[roomId];
  if (!room || room.status !== 'WORD_SELECTION') return;

  if (roomIntervals[roomId]) {
    clearInterval(roomIntervals[roomId]);
  }

  room.status = 'DRAWING';
  room.currentWord = word;
  room.timeRemaining = room.roundDuration;

  addSystemMessage(roomId, `The round has started! Good luck drawing and guessing.`);

  broadcastToRoom(roomId, { type: 'sync_state', payload: { room, strokes: [] } });

  // Start Drawing Phase Countdown
  roomIntervals[roomId] = setInterval(() => {
    const r = rooms[roomId];
    if (!r || r.status !== 'DRAWING') {
      clearInterval(roomIntervals[roomId]);
      return;
    }

    r.timeRemaining -= 1;

    // Check if everyone (who is not drawing) has guessed correctly
    const guessers = Object.values(r.players).filter(p => !p.isDrawer);
    const correctGuessers = guessers.filter(p => p.guessed);
    const allGuessed = guessers.length > 0 && correctGuessers.length === guessers.length;

    if (r.timeRemaining <= 0 || allGuessed) {
      clearInterval(roomIntervals[roomId]);
      endRound(roomId);
    } else {
      broadcastToRoom(roomId, { type: 'sync_state', payload: { room: r, strokes: roomStrokes[roomId] || [] } });
    }
  }, 1000);
}

function endRound(roomId: string) {
  const room = rooms[roomId];
  if (!room) return;

  room.status = 'ROUND_END';
  room.timeRemaining = 8; // 8 seconds to display results

  // Give drawer a score bonus based on how many people guessed their drawing
  if (room.currentDrawerId && room.players[room.currentDrawerId]) {
    const totalGuessers = Object.values(room.players).filter(p => !p.isDrawer).length;
    const correctGuessersCount = Object.values(room.players).filter(p => !p.isDrawer && p.guessed).length;
    if (totalGuessers > 0 && correctGuessersCount > 0) {
      const drawerBonus = Math.round((correctGuessersCount / totalGuessers) * 250);
      room.players[room.currentDrawerId].roundScore = drawerBonus;
      room.players[room.currentDrawerId].score += drawerBonus;
    }
  }

  addSystemMessage(roomId, `Round ended! The word was: "${room.currentWord}".`);

  broadcastToRoom(roomId, { type: 'sync_state', payload: { room, strokes: roomStrokes[roomId] || [] } });

  roomIntervals[roomId] = setTimeout(() => {
    startRound(roomId);
  }, 8000);
}

function endGame(roomId: string) {
  const room = rooms[roomId];
  if (!room) return;

  room.status = 'GAME_OVER';
  room.currentDrawerId = null;

  // Find winner
  const playersArray = Object.values(room.players);
  if (playersArray.length > 0) {
    const winner = playersArray.reduce((prev, current) => (prev.score > current.score) ? prev : current);
    room.winner = winner;
    addSystemMessage(roomId, `Game over! 👑 ${winner.name} won with ${winner.score} points!`);
  } else {
    room.winner = null;
  }

  broadcastToRoom(roomId, { type: 'sync_state', payload: { room, strokes: [] } });
}

function getLevenshteinDistance(a: string, b: string): number {
  const tmp: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    tmp[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1, // deletion
        tmp[i][j - 1] + 1, // insertion
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1) // substitution
      );
    }
  }
  return tmp[a.length][b.length];
}

function isCloseWord(guess: string, target: string): boolean {
  const g = guess.trim().toLowerCase();
  const t = target.trim().toLowerCase();
  if (g === t) return false; // Handled separately as correct guess
  if (t.length < 3) return false;
  
  // If Levenshtein distance is 1 (e.g. 1 char off), it's close
  const dist = getLevenshteinDistance(g, t);
  if (dist === 1) return true;
  
  return false;
}

// WebSocket connection handling
const wss = new WebSocketServer({ noServer: true });

// Attach WebSockets server to node HTTP upgrade event
server.on('upgrade', (request, socket, head) => {
  const url = request.url || '';
  logToFile(`UPGRADE REQUEST: ${url}`);
  
  if (url.startsWith('/ws')) {
    try {
      wss.handleUpgrade(request, socket, head, (ws) => {
        logToFile(`UPGRADE SUCCESSFUL: ${url}`);
        wss.emit('connection', ws, request);
      });
    } catch (err: any) {
      logToFile(`UPGRADE ERROR: ${err?.message || err}`);
    }
  } else {
    logToFile(`UPGRADE IGNORED (Not /ws): ${url}`);
  }
});

wss.on('connection', (socket: WebSocket, request) => {
  let currentConnectPlayerId = 'p_' + Math.random().toString(36).substring(2, 9);
  logToFile(`CONNECTION OPENED: Player ID = ${currentConnectPlayerId}, URL = ${request.url}`);
  activeConnections[currentConnectPlayerId] = { socket, playerId: currentConnectPlayerId, roomId: null };

  // Send player their assigned ID immediately
  socket.send(JSON.stringify({
    type: 'init_player',
    payload: { playerId: currentConnectPlayerId }
  }));

  socket.on('message', (messageBuffer) => {
    try {
      const playerId = currentConnectPlayerId;
      const messageText = messageBuffer.toString();
      const message: SocketMessage = JSON.parse(messageText);

      switch (message.type) {
        case 'join_room': {
          const { name, color, roomId: requestedRoomId, playerId: rejoiningPlayerId } = message.payload;
          let roomId = requestedRoomId?.toUpperCase().trim();

          // Check if rejoining an existing room/session
          if (roomId && rooms[roomId] && rejoiningPlayerId && rooms[roomId].players[rejoiningPlayerId]) {
            const room = rooms[roomId];
            const rejoiningPlayer = room.players[rejoiningPlayerId];

            // Re-map socket to the existing playerId
            delete activeConnections[currentConnectPlayerId];
            currentConnectPlayerId = rejoiningPlayerId;
            activeConnections[currentConnectPlayerId] = { socket, playerId: currentConnectPlayerId, roomId };

            // Mark player active
            rejoiningPlayer.disconnected = false;

            // Clear player grace timeout
            if (playerDisconnectTimeouts[currentConnectPlayerId]) {
              clearTimeout(playerDisconnectTimeouts[currentConnectPlayerId]);
              delete playerDisconnectTimeouts[currentConnectPlayerId];
              logToFile(`Player grace timeout cancelled: Player ID = ${currentConnectPlayerId}`);
            }

            // Clear room cleanup timeout (if any)
            if (roomCleanupTimeouts[roomId]) {
              clearTimeout(roomCleanupTimeouts[roomId]);
              delete roomCleanupTimeouts[roomId];
              logToFile(`Room cleanup timeout cancelled for Room: ${roomId}`);
            }

            // Confirm join to client
            socket.send(JSON.stringify({
              type: 'join_success',
              payload: { roomId, player: rejoiningPlayer, room, strokes: roomStrokes[roomId] }
            }));

            // Notify room of player's reconnection
            addSystemMessage(roomId, `${rejoiningPlayer.name} reconnected to the room.`);
            broadcastToRoom(roomId, { type: 'sync_state', payload: { room, strokes: roomStrokes[roomId] } });
            break;
          }

          // If no room is specified or room doesn't exist, create a new one, keeping user specified code if provided
          if (!roomId || !rooms[roomId]) {
            const finalId = roomId || generateRoomCode();
            roomId = finalId;
            rooms[roomId] = {
              id: roomId,
              players: {},
              status: 'LOBBY',
              round: 1,
              maxRounds: 3,
              roundDuration: 80,
              timeRemaining: 0,
              currentDrawerId: null,
              currentWord: '',
              wordChoices: [],
              winner: null,
            };
            roomStrokes[roomId] = [];
            
            // Clear room cleanup timeout if re-creating/claiming a code (safeguard)
            if (roomCleanupTimeouts[roomId]) {
              clearTimeout(roomCleanupTimeouts[roomId]);
              delete roomCleanupTimeouts[roomId];
            }
          }

          // Clear room cleanup timeout if any player joins a room that was empty but still alive
          if (roomCleanupTimeouts[roomId]) {
            clearTimeout(roomCleanupTimeouts[roomId]);
            delete roomCleanupTimeouts[roomId];
            logToFile(`Room cleanup timeout cancelled for Room: ${roomId}`);
          }

          const room = rooms[roomId];
          const isHost = Object.keys(room.players).length === 0;

          const newPlayer: Player = {
            id: currentConnectPlayerId,
            name: name || `Player ${Object.keys(room.players).length + 1}`,
            color: color || '#FF5733',
            score: 0,
            roundScore: 0,
            isDrawer: false,
            guessed: false,
            isHost,
            hasCamera: false,
            hasMic: false,
          };

          room.players[currentConnectPlayerId] = newPlayer;
          activeConnections[currentConnectPlayerId].roomId = roomId;

          // Confirm join to client
          socket.send(JSON.stringify({
            type: 'join_success',
            payload: { roomId, player: newPlayer, room, strokes: roomStrokes[roomId] }
          }));

          // Notify room
          addSystemMessage(roomId, `${newPlayer.name} joined the room!`);
          broadcastToRoom(roomId, { type: 'sync_state', payload: { room, strokes: roomStrokes[roomId] } });
          break;
        }

        case 'update_settings': {
          const connection = activeConnections[playerId];
          if (!connection || !connection.roomId) return;
          const room = rooms[connection.roomId];
          if (!room || !room.players[playerId]?.isHost) return;

          const { maxRounds, roundDuration } = message.payload;
          room.maxRounds = Number(maxRounds) || 3;
          room.roundDuration = Number(roundDuration) || 80;

          broadcastToRoom(connection.roomId, { type: 'sync_state', payload: { room, strokes: roomStrokes[connection.roomId] } });
          addSystemMessage(connection.roomId, `Lobby settings updated: Rounds = ${room.maxRounds}, Draw Time = ${room.roundDuration}s.`);
          break;
        }

        case 'start_game': {
          const connection = activeConnections[playerId];
          if (!connection || !connection.roomId) return;
          const room = rooms[connection.roomId];
          if (!room || !room.players[playerId]?.isHost) return;

          room.round = 1;
          room.currentDrawerId = null;
          Object.values(room.players).forEach(p => {
            p.score = 0;
            p.roundScore = 0;
          });

          addSystemMessage(connection.roomId, `The host has started the scribble game!`);
          startRound(connection.roomId);
          break;
        }

        case 'force_end_game': {
          const connection = activeConnections[playerId];
          if (!connection || !connection.roomId) return;
          const room = rooms[connection.roomId];
          if (!room || !room.players[playerId]?.isHost) return;

          addSystemMessage(connection.roomId, `🚨 The host forced the game to end!`);
          endGame(connection.roomId);
          break;
        }

        case 'select_word': {
          const connection = activeConnections[playerId];
          if (!connection || !connection.roomId) return;
          const room = rooms[connection.roomId];
          if (!room || room.status !== 'WORD_SELECTION' || room.currentDrawerId !== playerId) return;

          selectWord(connection.roomId, message.payload);
          break;
        }

        case 'draw_stroke': {
          const connection = activeConnections[playerId];
          if (!connection || !connection.roomId) return;
          const room = rooms[connection.roomId];
          if (!room || room.status !== 'DRAWING' || room.currentDrawerId !== playerId) return;

          const stroke: Stroke = message.payload;
          
          const existingIndex = roomStrokes[connection.roomId].findIndex(s => s.id === stroke.id);
          if (existingIndex >= 0) {
            roomStrokes[connection.roomId][existingIndex] = stroke;
          } else {
            roomStrokes[connection.roomId].push(stroke);
          }

          // Real-time broadcast the drawing action to all other peers
          broadcastToRoom(connection.roomId, { type: 'draw_stroke', payload: stroke }, playerId);
          break;
        }

        case 'clear_canvas': {
          const connection = activeConnections[playerId];
          if (!connection || !connection.roomId) return;
          const room = rooms[connection.roomId];
          if (!room || room.status !== 'DRAWING' || room.currentDrawerId !== playerId) return;

          roomStrokes[connection.roomId] = [];
          broadcastToRoom(connection.roomId, { type: 'clear_canvas', payload: null });
          break;
        }

        case 'undo_stroke': {
          const connection = activeConnections[playerId];
          if (!connection || !connection.roomId) return;
          const room = rooms[connection.roomId];
          if (!room || room.status !== 'DRAWING' || room.currentDrawerId !== playerId) return;

          if (roomStrokes[connection.roomId].length > 0) {
            roomStrokes[connection.roomId].pop();
            broadcastToRoom(connection.roomId, { type: 'undo_stroke', payload: null });
          }
          break;
        }

        case 'send_message': {
          const connection = activeConnections[playerId];
          if (!connection || !connection.roomId) return;
          const room = rooms[connection.roomId];
          if (!room) return;

          const player = room.players[playerId];
          if (!player) return;

          const text: string = (message.payload || '').trim();
          if (!text) return;

          const lowerText = text.toLowerCase();
          const targetWord = (room.currentWord || '').toLowerCase();

          // Check if guessing is active and player is trying to guess
          if (room.status === 'DRAWING' && !player.isDrawer && !player.guessed && lowerText === targetWord) {
            // Correct Guess!
            player.guessed = true;
            // High speed guesser gets higher score bonus
            const maxPoints = 500;
            const percentageTime = room.timeRemaining / room.roundDuration;
            const pointsGained = Math.round(percentageTime * maxPoints) + 100;

            player.roundScore = pointsGained;
            player.score += pointsGained;

            // Notify everyone
            addSystemMessage(connection.roomId, `🎉 ${player.name} guessed the word correctly (+${pointsGained} pts)!`);
            broadcastToRoom(connection.roomId, { type: 'sync_state', payload: { room, strokes: roomStrokes[connection.roomId] } });
          } else if (room.status === 'DRAWING' && !player.isDrawer && !player.guessed && isCloseWord(lowerText, targetWord)) {
            // Close Guess! Do not show to other teammates
            const chatMsg: ChatMessage = {
              id: Math.random().toString(36).substring(2, 9),
              senderId: playerId,
              senderName: player.name,
              text,
              isSystem: false,
              isCorrectGuess: false,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };

            const systemMsg: ChatMessage = {
              id: Math.random().toString(36).substring(2, 9),
              senderId: 'system',
              senderName: 'System',
              text: `⚠️ "${text}" is extremely close! Keep guessing!`,
              isSystem: true,
              isCorrectGuess: false,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };

            // Send to the guesser (the client who sent it)
            socket.send(JSON.stringify({ type: 'send_message', payload: chatMsg }));
            socket.send(JSON.stringify({ type: 'send_message', payload: systemMsg }));

            // Also send to the drawer (since they already know the target word, they can safely see who is close)
            const drawerId = room.currentDrawerId;
            if (drawerId && drawerId !== playerId) {
              const drawerConn = activeConnections[drawerId];
              if (drawerConn && drawerConn.socket.readyState === WebSocket.OPEN) {
                drawerConn.socket.send(JSON.stringify({ type: 'send_message', payload: chatMsg }));
              }
            }
          } else {
            // Normal message delivery
            const chatMsg: ChatMessage = {
              id: Math.random().toString(36).substring(2, 9),
              senderId: playerId,
              senderName: player.name,
              text,
              isSystem: false,
              isCorrectGuess: false,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };

            // Spoiling safety logic:
            // If the sender has already guessed, don't show the message to players who haven't guessed yet
            if (room.status === 'DRAWING' && player.guessed) {
              // Only broadcast to other players who have already guessed or the drawer
              Object.keys(room.players).forEach((pid) => {
                const targetPlayer = room.players[pid];
                if (pid === playerId || targetPlayer.isDrawer || targetPlayer.guessed) {
                  const conn = activeConnections[pid];
                  if (conn && conn.socket.readyState === WebSocket.OPEN) {
                    conn.socket.send(JSON.stringify({ type: 'send_message', payload: chatMsg }));
                  }
                }
              });
            } else {
              // Regular message: send to everyone in the room
              broadcastToRoom(connection.roomId, { type: 'send_message', payload: chatMsg });
            }
          }
          break;
        }

        case 'webrtc_signal': {
          // Relaying peer-to-peer WebRTC signals between participants
          const connection = activeConnections[currentConnectPlayerId];
          if (!connection || !connection.roomId) return;

          const { targetId, signal } = message.payload;
          const targetConnection = activeConnections[targetId];

          if (targetConnection && targetConnection.socket.readyState === WebSocket.OPEN) {
            targetConnection.socket.send(JSON.stringify({
              type: 'webrtc_signal',
              payload: {
                senderId: currentConnectPlayerId,
                signal
              }
            }));
          }
          break;
        }

        case 'toggle_media': {
          const connection = activeConnections[currentConnectPlayerId];
          if (!connection || !connection.roomId) return;
          const room = rooms[connection.roomId];
          if (!room || !room.players[currentConnectPlayerId]) return;

          const { hasCamera, hasMic } = message.payload;
          room.players[currentConnectPlayerId].hasCamera = !!hasCamera;
          room.players[currentConnectPlayerId].hasMic = !!hasMic;

          broadcastToRoom(connection.roomId, { type: 'sync_state', payload: { room, strokes: roomStrokes[connection.roomId] } });
          break;
        }

        default:
          console.warn(`Unknown websocket event: ${message.type}`);
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  });

  socket.on('close', () => {
    const connection = activeConnections[currentConnectPlayerId];
    
    // CRITICAL: Only perform disconnect cleanup if the active connection's socket
    // matches this specific socket instance that is closing (reconnect/reload safety).
    if (connection && connection.socket === socket) {
      const { roomId } = connection;
      if (roomId && rooms[roomId]) {
        const room = rooms[roomId];
        const leavingPlayer = room.players[currentConnectPlayerId];
        const leavingPlayerName = leavingPlayer ? leavingPlayer.name : 'A player';

        // Mark player disconnected but don't delete immediately
        if (leavingPlayer) {
          leavingPlayer.disconnected = true;
          logToFile(`Player disconnected: Player ID = ${currentConnectPlayerId}, Name = ${leavingPlayerName}. Starting 40s grace timeout.`);
          addSystemMessage(roomId, `${leavingPlayerName} disconnected.`);
        }

        // Notify other clients in the room to disconnect this peer stream
        broadcastToRoom(roomId, { type: 'peer_disconnected', payload: { peerId: currentConnectPlayerId } });

        // Update other clients to show offline state
        broadcastToRoom(roomId, { type: 'sync_state', payload: { room, strokes: roomStrokes[roomId] || [] } });

        // Start player disconnect timeout
        const pid = currentConnectPlayerId;
        playerDisconnectTimeouts[pid] = setTimeout(() => {
          logToFile(`Player grace timeout expired: Player ID = ${pid}`);
          delete playerDisconnectTimeouts[pid];

          const r = rooms[roomId];
          if (r && r.players[pid]) {
            const pName = r.players[pid].name;
            const pWasHost = r.players[pid].isHost;
            const pWasDrawer = r.currentDrawerId === pid;

            delete r.players[pid];
            addSystemMessage(roomId, `${pName} left the room (connection timeout).`);

            const remaining = Object.keys(r.players);
            if (remaining.length > 0) {
              if (pWasHost) {
                const nextHostId = remaining[0];
                r.players[nextHostId].isHost = true;
                addSystemMessage(roomId, `${r.players[nextHostId].name} is now the host.`);
              }
              if (pWasDrawer) {
                addSystemMessage(roomId, `The drawer disconnected! Moving to next round...`);
                if (roomIntervals[roomId]) clearInterval(roomIntervals[roomId]);
                endRound(roomId);
              } else {
                broadcastToRoom(roomId, { type: 'sync_state', payload: { room: r, strokes: roomStrokes[roomId] || [] } });
              }
            }
          }
        }, 40000);

        // Check if all players in the room are now disconnected
        const activePlayersCount = Object.values(room.players).filter(p => !p.disconnected).length;
        if (activePlayersCount === 0) {
          logToFile(`All players disconnected from Room ${roomId}. Starting 60s room cleanup grace timer.`);
          roomCleanupTimeouts[roomId] = setTimeout(() => {
            logToFile(`Room cleanup timeout expired for Room ${roomId}. Destroying room.`);
            delete roomCleanupTimeouts[roomId];

            // Cleanup timers
            if (roomIntervals[roomId]) clearInterval(roomIntervals[roomId]);
            if (roomWordSelectionTimeout[roomId]) clearTimeout(roomWordSelectionTimeout[roomId]);

            // Clear player timeouts of any players in this room
            if (rooms[roomId]) {
              Object.keys(rooms[roomId].players).forEach(pId => {
                if (playerDisconnectTimeouts[pId]) {
                  clearTimeout(playerDisconnectTimeouts[pId]);
                  delete playerDisconnectTimeouts[pId];
                }
              });
            }

            delete rooms[roomId];
            delete roomStrokes[roomId];
            delete roomIntervals[roomId];
            delete roomWordSelectionTimeout[roomId];
          }, 60000);
        }
      }
      
      // Re-check to ensure we don't delete a new connection that was re-mapped to this playerId
      const currentConnectionObj = activeConnections[currentConnectPlayerId];
      if (currentConnectionObj && currentConnectionObj.socket === socket) {
        delete activeConnections[currentConnectPlayerId];
      }
    }
  });
});

// Vite server development / production integration
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    logToFile(`Server successfully started and listening on port ${PORT}`);
  });
}

startServer();
