export interface Player {
  id: string;
  name: string;
  color: string;
  score: number;
  roundScore: number;
  isDrawer: boolean;
  guessed: boolean;
  isHost: boolean;
  hasCamera: boolean;
  hasMic: boolean;
  disconnected?: boolean;
}

export type RoomStatus = 'LOBBY' | 'WORD_SELECTION' | 'DRAWING' | 'ROUND_END' | 'GAME_OVER';

export interface Room {
  id: string;
  players: Record<string, Player>;
  status: RoomStatus;
  round: number;
  maxRounds: number;
  roundDuration: number;
  timeRemaining: number;
  currentDrawerId: string | null;
  currentWord: string;
  wordChoices: string[];
  winner: Player | null;
}

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  id: string;
  points: Point[];
  color: string;
  thickness: number;
  type?: 'brush' | 'line' | 'rect' | 'circle' | 'fill';
}

export interface ChatMessage {
  id: string;
  senderId: string | null; // null for system messages
  senderName: string;
  text: string;
  isSystem: boolean;
  isCorrectGuess: boolean;
  timestamp: string;
}

// WebSocket message protocols
export type SocketMessageType =
  | 'join_room'
  | 'leave_room'
  | 'start_game'
  | 'select_word'
  | 'draw_stroke'
  | 'clear_canvas'
  | 'undo_stroke'
  | 'send_message'
  | 'webrtc_signal'
  | 'toggle_media'
  | 'sync_state'
  | 'update_settings'
  | 'init_player'
  | 'join_success'
  | 'peer_disconnected'
  | 'force_end_game';

export interface SocketMessage {
  type: SocketMessageType;
  roomId?: string;
  payload: any;
}
