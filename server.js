const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Create HTTP server for serving static files
const server = http.createServer((req, res) => {
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    
    // Handle different file types
    const extname = path.extname(filePath);
    let contentType = 'text/html';
    
    switch (extname) {
        case '.js':
            contentType = 'text/javascript';
            break;
        case '.css':
            contentType = 'text/css';
            break;
        case '.json':
            contentType = 'application/json';
            break;
        case '.html':
            contentType = 'text/html';
            break;
    }
    
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// Create WebSocket server for signaling
const wss = new WebSocket.Server({ server });

// Store active rooms and their participants
const rooms = new Map();
const playerConnections = new Map(); // playerId -> WebSocket

// Room class to manage game rooms
class GameRoom {
    constructor(roomCode, hostId) {
        this.roomCode = roomCode;
        this.hostId = hostId;
        this.players = new Map(); // playerId -> playerInfo
        this.connections = new Map(); // playerId -> WebSocket
        this.gameState = {
            state: 'waiting',
            players: {},
            provinces: {},
            gameStartTime: null,
            gameEndTime: null,
            countdown: 5
        };
        this.createdAt = Date.now();
    }
    
    addPlayer(playerId, playerInfo, ws) {
        this.players.set(playerId, playerInfo);
        this.connections.set(playerId, ws);
        this.gameState.players[playerId] = playerInfo;
        
        console.log(`Player ${playerId} joined room ${this.roomCode}`);
        this.broadcastToRoom('player_joined', { playerId, playerInfo });
        this.sendGameState(playerId);
    }
    
    removePlayer(playerId) {
        if (this.players.has(playerId)) {
            this.players.delete(playerId);
            this.connections.delete(playerId);
            delete this.gameState.players[playerId];
            
            // Remove their provinces
            Object.keys(this.gameState.provinces).forEach(province => {
                if (this.gameState.provinces[province] === playerId) {
                    delete this.gameState.provinces[province];
                }
            });
            
            console.log(`Player ${playerId} left room ${this.roomCode}`);
            
            // If host left, close the room
            if (playerId === this.hostId) {
                this.closeRoom();
                return true; // Room closed
            }
            
            this.broadcastToRoom('player_left', { playerId });
            return false; // Room still active
        }
        return false;
    }
    
    updateGameState(newState) {
        this.gameState = { ...this.gameState, ...newState };
        this.broadcastToRoom('game_state_update', this.gameState);
    }
    
    broadcastToRoom(type, data) {
        const message = JSON.stringify({ type, data });
        
        this.connections.forEach((ws, playerId) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(message);
            }
        });
    }
    
    sendGameState(playerId) {
        const ws = this.connections.get(playerId);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'game_state',
                data: this.gameState
            }));
        }
    }
    
    closeRoom() {
        console.log(`Closing room ${this.roomCode}`);
        this.broadcastToRoom('room_closed', { reason: 'Host disconnected' });
        
        // Close all connections
        this.connections.forEach((ws) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        });
        
        // Remove from rooms map
        rooms.delete(this.roomCode);
    }
    
    getPlayerList() {
        return Array.from(this.players.values());
    }
    
    isEmpty() {
        return this.players.size === 0;
    }
}

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('New client connected');
    let currentPlayerId = null;
    let currentRoom = null;
    
    ws.on('message', (message) => {
        try {
            const { type, data } = JSON.parse(message);
            console.log(`Received message: ${type}`, data);
            
            switch (type) {
                case 'create_room':
                    handleCreateRoom(ws, data);
                    break;
                    
                case 'join_room':
                    handleJoinRoom(ws, data);
                    break;
                    
                case 'leave_room':
                    handleLeaveRoom(ws, data);
                    break;
                    
                case 'update_game_state':
                    handleUpdateGameState(ws, data);
                    break;
                    
                case 'webrtc_offer':
                    handleWebRTCOffer(ws, data);
                    break;
                    
                case 'webrtc_answer':
                    handleWebRTCAnswer(ws, data);
                    break;
                    
                case 'webrtc_ice_candidate':
                    handleWebRTCIceCandidate(ws, data);
                    break;
                    
                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;
                    
                default:
                    console.log(`Unknown message type: ${type}`);
            }
        } catch (error) {
            console.error('Error parsing message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                data: { message: 'Invalid message format' }
            }));
        }
    });
    
    function handleCreateRoom(ws, data) {
        const { playerId, playerInfo, roomCode } = data;
        
        if (rooms.has(roomCode)) {
            ws.send(JSON.stringify({
                type: 'error',
                data: { message: 'Room code already exists' }
            }));
            return;
        }
        
        const room = new GameRoom(roomCode, playerId);
        rooms.set(roomCode, room);
        
        currentPlayerId = playerId;
        currentRoom = room;
        
        room.addPlayer(playerId, playerInfo, ws);
        playerConnections.set(playerId, ws);
        
        ws.send(JSON.stringify({
            type: 'room_created',
            data: { roomCode, hostId: playerId }
        }));
        
        console.log(`Room ${roomCode} created by ${playerId}`);
    }
    
    function handleJoinRoom(ws, data) {
        const { playerId, playerInfo, roomCode } = data;
        
        const room = rooms.get(roomCode);
        if (!room) {
            ws.send(JSON.stringify({
                type: 'error',
                data: { message: 'Room not found' }
            }));
            return;
        }
        
        if (room.players.size >= 10) { // Max 10 players
            ws.send(JSON.stringify({
                type: 'error',
                data: { message: 'Room is full' }
            }));
            return;
        }
        
        currentPlayerId = playerId;
        currentRoom = room;
        
        room.addPlayer(playerId, playerInfo, ws);
        playerConnections.set(playerId, ws);
        
        ws.send(JSON.stringify({
            type: 'room_joined',
            data: { roomCode, hostId: room.hostId }
        }));
        
        console.log(`Player ${playerId} joined room ${roomCode}`);
    }
    
    function handleLeaveRoom(ws, data) {
        const { playerId } = data;
        
        if (currentRoom) {
            const roomClosed = currentRoom.removePlayer(playerId);
            playerConnections.delete(playerId);
            
            if (!roomClosed && currentRoom.isEmpty()) {
                rooms.delete(currentRoom.roomCode);
                console.log(`Empty room ${currentRoom.roomCode} deleted`);
            }
            
            currentRoom = null;
            currentPlayerId = null;
        }
    }
    
    function handleUpdateGameState(ws, data) {
        if (currentRoom && currentPlayerId) {
            currentRoom.updateGameState(data.gameState);
            console.log(`Game state updated in room ${currentRoom.roomCode}`);
        }
    }
    
    function handleWebRTCOffer(ws, data) {
        const { targetPlayerId, offer } = data;
        const targetWs = playerConnections.get(targetPlayerId);
        
        if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify({
                type: 'webrtc_offer',
                data: { fromPlayerId: currentPlayerId, offer }
            }));
        }
    }
    
    function handleWebRTCAnswer(ws, data) {
        const { targetPlayerId, answer } = data;
        const targetWs = playerConnections.get(targetPlayerId);
        
        if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify({
                type: 'webrtc_answer',
                data: { fromPlayerId: currentPlayerId, answer }
            }));
        }
    }
    
    function handleWebRTCIceCandidate(ws, data) {
        const { targetPlayerId, candidate } = data;
        const targetWs = playerConnections.get(targetPlayerId);
        
        if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify({
                type: 'webrtc_ice_candidate',
                data: { fromPlayerId: currentPlayerId, candidate }
            }));
        }
    }
    
    ws.on('close', () => {
        console.log('Client disconnected');
        
        if (currentPlayerId && currentRoom) {
            const roomClosed = currentRoom.removePlayer(currentPlayerId);
            playerConnections.delete(currentPlayerId);
            
            if (!roomClosed && currentRoom.isEmpty()) {
                rooms.delete(currentRoom.roomCode);
                console.log(`Empty room ${currentRoom.roomCode} deleted`);
            }
        }
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Clean up empty rooms periodically
setInterval(() => {
    const now = Date.now();
    const roomsToDelete = [];
    
    rooms.forEach((room, roomCode) => {
        // Delete rooms older than 2 hours with no activity
        if (room.isEmpty() && (now - room.createdAt) > 2 * 60 * 60 * 1000) {
            roomsToDelete.push(roomCode);
        }
    });
    
    roomsToDelete.forEach(roomCode => {
        console.log(`Cleaning up old empty room: ${roomCode}`);
        rooms.delete(roomCode);
    });
}, 60000); // Check every minute

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Europe Simulator server running on port ${PORT}`);
    console.log(`WebSocket signaling server ready for P2P connections`);
});
