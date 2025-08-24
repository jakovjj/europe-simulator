# 🌍 Europe Simulator - P2P Multiplayer

A real-time multiplayer strategy game where players compete to conquer European countries. Built with **WebRTC peer-to-peer networking** for direct player connections.

## ✨ Features

- **True P2P Multiplayer**: Direct WebRTC connections between players
- **Room System**: Easy 4-letter codes to create and join games
- **Real-time Combat**: Attack other countries and build fortifications
- **Economy System**: Manage your GDP and grow your economy over time
- **Fallback Mode**: Works even without a server using browser storage
- **Connection Status**: Visual indicators for network health
- **Auto-reconnect**: Automatic reconnection on connection loss

## 🚀 Quick Start

### Option 1: Direct Play (Fallback Mode)
Simply open `index.html` in your browser. This uses browser storage for basic multiplayer functionality.

### Option 2: Full P2P Server Setup

1. **Install Node.js** from [nodejs.org](https://nodejs.org)

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the server:**
   ```bash
   npm start
   ```
   Or double-click `start.bat`

4. **Play the game:**
   Open http://localhost:3000 in your browser

## 🎮 How to Play

1. **Create Room**: Click "Create Room" to start a new game
2. **Share Code**: Give the 4-letter room code to friends
3. **Join Room**: Friends enter the code and click "Join Room"
4. **Select Countries**: Each player clicks on a country to select it
5. **Ready Up**: All players click "Ready" when they're prepared
6. **Start Game**: Host clicks "Start Game" when everyone is ready
7. **Conquer Europe**: Attack other countries and build forts!

### Combat System
- **4 Attack Types**: Weak (🗡️), Medium (⚔️), Heavy (🏹), Massive (💥)
- **Fortifications**: Build forts to defend your territories
- **Economy**: Manage your GDP to fund attacks and upgrades

## 🌐 Network Architecture

```
Player 1 ←→ Signaling Server ←→ Player 2
    ↓                              ↓
Direct P2P Connection (WebRTC)
```

- **Signaling Server**: Helps establish initial connections
- **WebRTC Data Channels**: Direct encrypted communication
- **Fallback System**: Browser storage when server unavailable

## 📁 Project Structure

```
├── index.html          # Main game interface
├── script.js           # Core game logic and P2P networking
├── styles.css          # Game styling
├── server.js           # WebSocket signaling server
├── fallback.js         # Fallback P2P implementation
├── setup.html          # Setup instructions page
├── package.json        # Node.js dependencies
├── start.bat           # Windows start script
└── README.md           # This file
```

## 🔧 Technical Details

### P2P Implementation
- **WebRTC DataChannels** for real-time communication
- **WebSocket signaling** for connection establishment
- **STUN servers** for NAT traversal
- **Automatic fallback** to localStorage-based sync

### Game State Synchronization
- All game actions are broadcast to connected peers
- Conflict resolution through host authority
- Real-time economy and power updates
- Persistent connection monitoring

## 🌍 Deployment

### Local Network
The server works out-of-the-box for LAN play. Share your local IP address with friends.

### Internet Play
For internet play, deploy to:
- **Heroku**: `git push heroku main`
- **Vercel**: Import the GitHub repository
- **Railway**: Connect your GitHub repo
- **Your own VPS**: Run with PM2 or similar

Update the `SIGNALING_SERVER` URL in `script.js` to point to your deployed server.

## 🛠️ Development

### Adding New Features
1. Game logic goes in `script.js`
2. UI styling in `styles.css`
3. Server logic in `server.js`
4. P2P actions use `broadcastPlayerAction()`

### P2P Message Types
- `game_state_update`: Full game state sync
- `player_action`: Individual player actions
- `attack_country`: Combat actions
- `upgrade_fort`: Fortification upgrades
- `player_ready`: Ready status changes

## 🐛 Troubleshooting

**Connection Issues:**
- Check if port 3000 is available
- Disable ad blockers/VPN
- Try fallback mode by opening `index.html` directly

**Game Sync Issues:**
- All players should have the same game version
- Check browser console for errors
- Host has authority in conflicts

## 📋 TODO

- [ ] Spectator mode
- [ ] Game replay system
- [ ] Tournament brackets
- [ ] Voice chat integration
- [ ] Mobile app version
- [ ] Custom map support

## 📄 License

MIT License - Feel free to modify and distribute!

---

**Ready to conquer Europe? 🏰⚔️**
