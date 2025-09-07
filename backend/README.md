# Tune Race Backend

Real-time multiplayer music guessing game backend server.

## Features

- **Express HTTP Server** on port 3000
- **Socket.IO** real-time multiplayer functionality
- **CORS** enabled for React frontend
- **In-memory room management** with unique room IDs
- **Player management** (socket ID, name, score, solved status)
- **Skip voting system** requiring all unsolved players to vote
- **Game state management** (waiting, playing, finished)
- **Comprehensive logging** for all events

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   # or
   npm run dev
   # or
   node server.js
   ```

3. **Server will be available at:**
   - Main server: `http://localhost:3000`
   - Health check: `http://localhost:3000/`

## Socket.IO Events

### Client to Server

- `create_room` - Create a new room and become host
- `join_room` - Join an existing room
- `make_guess` - Submit a song title guess
- `vote_skip` - Vote to skip current track
- `start_game` - Start the game (host only)

### Server to Client

- `room_created` - Room creation confirmation
- `room_joined` - Room join confirmation  
- `room_updated` - Real-time room state updates
- `guess_result` - Result of guess attempt
- `correct_guess` - Broadcast when someone guesses correctly
- `track_skipped` - Track was skipped by vote
- `game_started` - Game has begun

## Room Structure

Each room contains:
- **roomId** - Unique 6-character identifier
- **players** - Map of connected players with scores and status
- **currentTrackIndex** - Current song in playlist
- **playlist** - Array of placeholder songs
- **skipVotes** - Set of players who voted to skip
- **gameState** - Current state (waiting/playing/finished)

## Placeholder Data

Currently includes 5 classic songs for testing:
1. The Beatles - "Hey Jude"
2. Queen - "Bohemian Rhapsody" 
3. Led Zeppelin - "Stairway to Heaven"
4. Pink Floyd - "Wish You Were Here"
5. The Rolling Stones - "Paint It Black"

Ready for Spotify API integration!

## Architecture

- **397 lines** of well-documented code
- **47 socket events, logging, and emit calls**
- Modular Room class for game state management
- Clean separation of concerns
- Comprehensive error handling