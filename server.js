const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Create HTTP server for serving static files
const server = http.createServer((req, res) => {
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    
    // Security check - prevent directory traversal
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    
    // Get file extension
    const ext = path.extname(filePath).toLowerCase();
    
    // Set content type based on file extension
    const contentTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml'
    };
    
    const contentType = contentTypes[ext] || 'text/plain';
    
    // Check if file exists
    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error');
            }
            return;
        }
        
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Game state
let gameState = {
    state: 'waiting', // 'waiting', 'countdown', 'playing', 'ended'
    players: new Map(),
    provinces: new Map(),
    gameStartTime: null,
    gameEndTime: null,
    countdownStartTime: null,
    gameId: generateGameId()
};

let gameTimer = null;
let countdownTimer = null;

// Available colors for players
const PLAYER_COLORS = [
    '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57',
    '#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3', '#ff9f43',
    '#c44569', '#f8b500', '#6c5ce7', '#a29bfe', '#fd79a8'
];

function generateGameId() {
    return Math.random().toString(36).substr(2, 9);
}

function generatePlayerId() {
    return Math.random().toString(36).substr(2, 9);
}

function getAvailableColor() {
    const usedColors = Array.from(gameState.players.values()).map(p => p.color);
    return PLAYER_COLORS.find(color => !usedColors.includes(color)) || PLAYER_COLORS[0];
}

function broadcastToAll(message) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

function startCountdown() {
    if (gameState.state !== 'waiting') return;
    
    gameState.state = 'countdown';
    gameState.countdownStartTime = Date.now();
    
    let countdown = 5;
    
    broadcastToAll({
        type: 'gameStateUpdate',
        gameState: {
            state: gameState.state,
            countdown: countdown,
            players: Array.from(gameState.players.values()),
            provinces: Object.fromEntries(gameState.provinces)
        }
    });
    
    countdownTimer = setInterval(() => {
        countdown--;
        if (countdown <= 0) {
            clearInterval(countdownTimer);
            startGame();
        } else {
            broadcastToAll({
                type: 'gameStateUpdate',
                gameState: {
                    state: gameState.state,
                    countdown: countdown,
                    players: Array.from(gameState.players.values()),
                    provinces: Object.fromEntries(gameState.provinces)
                }
            });
        }
    }, 1000);
}

function startGame() {
    gameState.state = 'playing';
    gameState.gameStartTime = Date.now();
    gameState.gameEndTime = Date.now() + (10 * 60 * 1000); // 10 minutes
    
    broadcastToAll({
        type: 'gameStateUpdate',
        gameState: {
            state: gameState.state,
            gameStartTime: gameState.gameStartTime,
            gameEndTime: gameState.gameEndTime,
            players: Array.from(gameState.players.values()),
            provinces: Object.fromEntries(gameState.provinces)
        }
    });
    
    // Set game timer
    gameTimer = setTimeout(() => {
        endGame();
    }, 10 * 60 * 1000);
}

function endGame() {
    gameState.state = 'ended';
    
    if (gameTimer) {
        clearTimeout(gameTimer);
        gameTimer = null;
    }
    
    // Calculate winner (player with most provinces)
    const playerScores = Array.from(gameState.players.values()).map(player => ({
        ...player,
        score: Array.from(gameState.provinces.values()).filter(owner => owner === player.id).length
    }));
    
    playerScores.sort((a, b) => b.score - a.score);
    
    broadcastToAll({
        type: 'gameEnded',
        winner: playerScores[0],
        scores: playerScores,
        gameState: {
            state: gameState.state,
            players: Array.from(gameState.players.values()),
            provinces: Object.fromEntries(gameState.provinces)
        }
    });
    
    // Reset game after 30 seconds
    setTimeout(() => {
        resetGame();
    }, 30000);
}

function resetGame() {
    // Clear timers
    if (gameTimer) {
        clearTimeout(gameTimer);
        gameTimer = null;
    }
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
    
    // Reset game state but keep players
    gameState.state = 'waiting';
    gameState.provinces.clear();
    gameState.gameStartTime = null;
    gameState.gameEndTime = null;
    gameState.countdownStartTime = null;
    gameState.gameId = generateGameId();
    
    broadcastToAll({
        type: 'gameReset',
        gameState: {
            state: gameState.state,
            players: Array.from(gameState.players.values()),
            provinces: Object.fromEntries(gameState.provinces),
            gameId: gameState.gameId
        }
    });
}

function removePlayer(playerId) {
    gameState.players.delete(playerId);
    
    // Remove their provinces
    for (const [province, owner] of gameState.provinces.entries()) {
        if (owner === playerId) {
            gameState.provinces.delete(province);
        }
    }
    
    // If no players left, reset game
    if (gameState.players.size === 0) {
        resetGame();
        return;
    }
    
    // If we were waiting and now have fewer than 2 players, stay in waiting
    if (gameState.state === 'countdown' && gameState.players.size < 2) {
        if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
        }
        gameState.state = 'waiting';
    }
    
    broadcastToAll({
        type: 'playerLeft',
        playerId: playerId,
        gameState: {
            state: gameState.state,
            players: Array.from(gameState.players.values()),
            provinces: Object.fromEntries(gameState.provinces)
        }
    });
}

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('New client connected');
    
    let playerId = null;
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received:', data);
            
            switch (data.type) {
                case 'joinGame':
                    playerId = generatePlayerId();
                    const color = getAvailableColor();
                    
                    gameState.players.set(playerId, {
                        id: playerId,
                        name: data.playerName || `Player ${gameState.players.size + 1}`,
                        color: color,
                        selectedCountry: data.selectedCountry,
                        joinTime: Date.now()
                    });
                    
                    // Send player their ID and current game state
                    ws.send(JSON.stringify({
                        type: 'playerJoined',
                        playerId: playerId,
                        gameState: {
                            state: gameState.state,
                            players: Array.from(gameState.players.values()),
                            provinces: Object.fromEntries(gameState.provinces),
                            gameStartTime: gameState.gameStartTime,
                            gameEndTime: gameState.gameEndTime,
                            gameId: gameState.gameId
                        }
                    }));
                    
                    // Broadcast to others
                    broadcastToAll({
                        type: 'gameStateUpdate',
                        gameState: {
                            state: gameState.state,
                            players: Array.from(gameState.players.values()),
                            provinces: Object.fromEntries(gameState.provinces)
                        }
                    });
                    
                    // Start countdown if we have 2+ players and game is waiting
                    if (gameState.players.size >= 2 && gameState.state === 'waiting') {
                        startCountdown();
                    }
                    
                    break;
                    
                case 'claimProvince':
                    if (playerId && gameState.players.has(playerId) && gameState.state === 'playing') {
                        const provinceName = data.provinceName;
                        
                        // Check if province is already claimed
                        if (!gameState.provinces.has(provinceName)) {
                            gameState.provinces.set(provinceName, playerId);
                            
                            broadcastToAll({
                                type: 'provinceClaimedUpdate',
                                provinceName: provinceName,
                                playerId: playerId,
                                playerColor: gameState.players.get(playerId).color,
                                gameState: {
                                    state: gameState.state,
                                    players: Array.from(gameState.players.values()),
                                    provinces: Object.fromEntries(gameState.provinces)
                                }
                            });
                        }
                    }
                    break;
                    
                case 'exitGame':
                    if (playerId) {
                        removePlayer(playerId);
                        playerId = null;
                    }
                    break;
                    
                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('Client disconnected');
        if (playerId) {
            removePlayer(playerId);
        }
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
    
    // Send initial connection response
    ws.send(JSON.stringify({
        type: 'connected',
        gameState: {
            state: gameState.state,
            players: Array.from(gameState.players.values()),
            provinces: Object.fromEntries(gameState.provinces),
            gameStartTime: gameState.gameStartTime,
            gameEndTime: gameState.gameEndTime,
            gameId: gameState.gameId
        }
    }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('WebSocket server is ready for connections');
});
