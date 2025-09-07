/*
 * Tune Race Backend Server
 * Real-time multiplayer music guessing game
 * 
 * Setup Instructions:
 * 1. Initialize project: npm init -y
 * 2. Install dependencies: npm install express socket.io cors
 * 3. Run server: node backend/server.js
 * 4. Server will be available at http://localhost:3000
 */

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configure CORS to allow React frontend connection
const io = socketIO(server, {
  cors: {
    origin: "http://localhost:5173", // Vite dev server default port
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Enable CORS for Express routes
app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));

app.use(express.json());

// In-memory storage for rooms
const rooms = new Map();

// Placeholder playlist data
const PLACEHOLDER_PLAYLIST = [
  { id: 1, artist: "The Beatles", title: "Hey Jude", answer: "hey jude" },
  { id: 2, artist: "Queen", title: "Bohemian Rhapsody", answer: "bohemian rhapsody" },
  { id: 3, artist: "Led Zeppelin", title: "Stairway to Heaven", answer: "stairway to heaven" },
  { id: 4, artist: "Pink Floyd", title: "Wish You Were Here", answer: "wish you were here" },
  { id: 5, artist: "The Rolling Stones", title: "Paint It Black", answer: "paint it black" }
];

// Generate unique room ID
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Room class to manage room state
class Room {
  constructor(roomId, hostSocketId, hostName) {
    this.roomId = roomId;
    this.players = new Map();
    this.currentTrackIndex = 0;
    this.playlist = [...PLACEHOLDER_PLAYLIST];
    this.skipVotes = new Set();
    this.gameState = 'waiting'; // waiting, playing, finished
    
    // Add host player
    this.addPlayer(hostSocketId, hostName, true);
    
    console.log(`[ROOM ${roomId}] Created with host: ${hostName}`);
  }
  
  addPlayer(socketId, name, isHost = false) {
    this.players.set(socketId, {
      socketId,
      name,
      score: 0,
      solved: false,
      isHost,
      joinedAt: new Date()
    });
    console.log(`[ROOM ${this.roomId}] Player joined: ${name} (${socketId})`);
  }
  
  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (player) {
      this.players.delete(socketId);
      this.skipVotes.delete(socketId);
      console.log(`[ROOM ${this.roomId}] Player left: ${player.name} (${socketId})`);
    }
  }
  
  getCurrentTrack() {
    if (this.currentTrackIndex < this.playlist.length) {
      return this.playlist[this.currentTrackIndex];
    }
    return null;
  }
  
  checkGuess(guess, socketId) {
    const currentTrack = this.getCurrentTrack();
    if (!currentTrack) return false;
    
    const normalizedGuess = guess.toLowerCase().trim();
    const correctAnswer = currentTrack.answer.toLowerCase();
    
    const isCorrect = normalizedGuess === correctAnswer;
    
    if (isCorrect) {
      const player = this.players.get(socketId);
      if (player && !player.solved) {
        player.solved = true;
        player.score += 100; // Award points for correct guess
        console.log(`[ROOM ${this.roomId}] Correct guess by ${player.name}: "${guess}"`);
      }
    } else {
      console.log(`[ROOM ${this.roomId}] Incorrect guess: "${guess}" (correct: "${currentTrack.answer}")`);
    }
    
    return isCorrect;
  }
  
  voteSkip(socketId) {
    const player = this.players.get(socketId);
    if (!player || player.solved) {
      return false; // Already solved players can't vote to skip
    }
    
    this.skipVotes.add(socketId);
    console.log(`[ROOM ${this.roomId}] Skip vote from ${player.name}. Votes: ${this.skipVotes.size}`);
    
    // Check if all unsolved players voted to skip
    const unsolvedPlayers = Array.from(this.players.values()).filter(p => !p.solved);
    const shouldSkip = this.skipVotes.size >= unsolvedPlayers.length && unsolvedPlayers.length > 0;
    
    if (shouldSkip) {
      this.nextTrack();
      return true;
    }
    
    return false;
  }
  
  nextTrack() {
    this.currentTrackIndex++;
    this.skipVotes.clear();
    
    // Reset solved status for all players
    this.players.forEach(player => {
      player.solved = false;
    });
    
    console.log(`[ROOM ${this.roomId}] Moving to next track (index: ${this.currentTrackIndex})`);
    
    if (this.currentTrackIndex >= this.playlist.length) {
      this.gameState = 'finished';
      console.log(`[ROOM ${this.roomId}] Game finished!`);
    }
  }
  
  getRoomState() {
    return {
      roomId: this.roomId,
      players: Array.from(this.players.values()).map(p => ({
        socketId: p.socketId,
        name: p.name,
        score: p.score,
        solved: p.solved,
        isHost: p.isHost
      })),
      currentTrackIndex: this.currentTrackIndex,
      currentTrack: this.gameState === 'playing' ? {
        artist: this.getCurrentTrack()?.artist,
        // Don't send the title or answer to prevent cheating
      } : null,
      gameState: this.gameState,
      skipVotes: this.skipVotes.size,
      totalTracks: this.playlist.length
    };
  }
}

// Basic health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Tune Race Backend Server', 
    status: 'running',
    rooms: rooms.size,
    timestamp: new Date().toISOString()
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`[SOCKET] New connection: ${socket.id}`);
  
  // Create room event
  socket.on('create_room', (data) => {
    const { playerName } = data;
    const roomId = generateRoomId();
    
    // Create new room
    const room = new Room(roomId, socket.id, playerName);
    rooms.set(roomId, room);
    
    // Join socket to room
    socket.join(roomId);
    socket.roomId = roomId;
    
    console.log(`[SOCKET] Room created: ${roomId} by ${playerName}`);
    
    // Send room created confirmation
    socket.emit('room_created', {
      roomId,
      success: true,
      message: 'Room created successfully'
    });
    
    // Broadcast room state to all players in room
    io.to(roomId).emit('room_updated', room.getRoomState());
  });
  
  // Join room event
  socket.on('join_room', (data) => {
    const { roomId, playerName } = data;
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('join_room_error', {
        success: false,
        message: 'Room not found'
      });
      console.log(`[SOCKET] Failed to join room ${roomId}: Room not found`);
      return;
    }
    
    // Add player to room
    room.addPlayer(socket.id, playerName);
    
    // Join socket to room
    socket.join(roomId);
    socket.roomId = roomId;
    
    console.log(`[SOCKET] ${playerName} joined room: ${roomId}`);
    
    // Send join confirmation
    socket.emit('room_joined', {
      roomId,
      success: true,
      message: 'Joined room successfully'
    });
    
    // Broadcast updated room state to all players
    io.to(roomId).emit('room_updated', room.getRoomState());
  });
  
  // Make guess event
  socket.on('make_guess', (data) => {
    const { guess } = data;
    const roomId = socket.roomId;
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('guess_error', { message: 'Room not found' });
      return;
    }
    
    const player = room.players.get(socket.id);
    if (!player) {
      socket.emit('guess_error', { message: 'Player not found in room' });
      return;
    }
    
    if (player.solved) {
      socket.emit('guess_error', { message: 'You have already solved this track' });
      return;
    }
    
    console.log(`[SOCKET] Guess from ${player.name} in room ${roomId}: "${guess}"`);
    
    const isCorrect = room.checkGuess(guess, socket.id);
    
    // Send guess result to the player
    socket.emit('guess_result', {
      guess,
      correct: isCorrect,
      currentScore: player.score
    });
    
    // Broadcast updated room state to all players
    io.to(roomId).emit('room_updated', room.getRoomState());
    
    // If correct, also broadcast the correct guess to room
    if (isCorrect) {
      io.to(roomId).emit('correct_guess', {
        playerName: player.name,
        guess,
        track: room.getCurrentTrack()
      });
    }
  });
  
  // Vote skip event
  socket.on('vote_skip', () => {
    const roomId = socket.roomId;
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('skip_error', { message: 'Room not found' });
      return;
    }
    
    const player = room.players.get(socket.id);
    if (!player) {
      socket.emit('skip_error', { message: 'Player not found in room' });
      return;
    }
    
    console.log(`[SOCKET] Skip vote from ${player.name} in room ${roomId}`);
    
    const skipped = room.voteSkip(socket.id);
    
    if (skipped) {
      // Track was skipped
      io.to(roomId).emit('track_skipped', {
        message: 'Track skipped by vote',
        newTrackIndex: room.currentTrackIndex
      });
    } else {
      // Just update vote count
      socket.emit('skip_vote_recorded', {
        message: 'Skip vote recorded',
        skipVotes: room.skipVotes.size
      });
    }
    
    // Broadcast updated room state
    io.to(roomId).emit('room_updated', room.getRoomState());
  });
  
  // Start game event (host only)
  socket.on('start_game', () => {
    const roomId = socket.roomId;
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('game_error', { message: 'Room not found' });
      return;
    }
    
    const player = room.players.get(socket.id);
    if (!player || !player.isHost) {
      socket.emit('game_error', { message: 'Only the host can start the game' });
      return;
    }
    
    room.gameState = 'playing';
    console.log(`[SOCKET] Game started in room ${roomId} by ${player.name}`);
    
    // Broadcast game started to all players
    io.to(roomId).emit('game_started', {
      message: 'Game has started!',
      currentTrack: room.getCurrentTrack()
    });
    
    // Broadcast updated room state
    io.to(roomId).emit('room_updated', room.getRoomState());
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`[SOCKET] Disconnection: ${socket.id}`);
    
    const roomId = socket.roomId;
    if (roomId) {
      const room = rooms.get(roomId);
      if (room) {
        room.removePlayer(socket.id);
        
        // If room is empty, clean it up
        if (room.players.size === 0) {
          rooms.delete(roomId);
          console.log(`[ROOM ${roomId}] Deleted (empty)`);
        } else {
          // Broadcast updated room state
          io.to(roomId).emit('room_updated', room.getRoomState());
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🎵 Tune Race Backend Server running on port ${PORT}`);
  console.log(`🌐 Frontend should connect to: http://localhost:${PORT}`);
  console.log(`📊 Health check available at: http://localhost:${PORT}/`);
});
