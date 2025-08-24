// Global variables
let map;
let europeLayer;
let currentPlayerId = null;
let selectedCountry = null;
let currentlyDisplayedCountry = null; // Track which country info is currently shown
let gameState = 'loading';
let isLoading = true;

// GDP data for European countries (in billions USD, 2023 estimates)
const gdpData = {
    'Germany': 4259.9,
    'United Kingdom': 3131.0,
    'France': 2937.5,
    'Italy': 2110.0,
    'Spain': 1397.5,
    'Netherlands': 909.9,
    'Switzerland': 807.7,
    'Belgium': 529.6,
    'Austria': 479.8,
    'Poland': 679.4,
    'Sweden': 541.2,
    'Norway': 482.2,
    'Denmark': 390.7,
    'Finland': 297.3,
    'Portugal': 249.9,
    'Czechia': 290.9,
    'Czech Republic': 290.9,
    'Romania': 284.1,
    'Hungary': 181.8,
    'Slovakia': 115.5,
    'Slovenia': 61.7,
    'Luxembourg': 86.3,
    'Croatia': 70.0,
    'Bulgaria': 84.1,
    'Lithuania': 68.0,
    'Latvia': 40.9,
    'Estonia': 38.1,
    'Cyprus': 28.4,
    'Malta': 17.3,
    'Serbia': 63.1,
    'Bosnia and Herzegovina': 24.5,
    'North Macedonia': 13.8,
    'Macedonia': 13.8,
    'Montenegro': 6.2,
    'Albania': 18.3,
    'Moldova': 13.9,
    'Republic of Moldova': 13.9,
    'Ukraine': 170.1,
    'Belarus': 68.2,
    'Ireland': 498.6,
    'Greece': 218.1,
    'Russia': 2240.4
};

// Attack system configuration
const ATTACK_TYPES = [
    { name: 'Weak Attack', cost: 5, baseChance: 0.2, emoji: '🗡️' },
    { name: 'Medium Attack', cost: 20, baseChance: 0.3, emoji: '⚔️' },
    { name: 'Heavy Attack', cost: 100, baseChance: 0.5, emoji: '🏹' },
    { name: 'Massive Attack', cost: 500, baseChance: 0.8, emoji: '💥' }
];

// Fort system configuration
const FORT_UPGRADE_COST = 50; // 50B per upgrade
const MAX_FORT_LEVEL = 100;
const FORT_DEFENSE_PER_LEVEL = 0.005; // 0.5% reduction per level

// Initialize fort levels based on GDP
let countryFortLevels = {};

// Game configuration
const MAX_PLAYERS = 10;

// P2P Multiplayer variables
let isHost = false;
let roomCode = null;
let peers = new Map(); // playerId -> RTCPeerConnection
let dataChannels = new Map(); // playerId -> RTCDataChannel
let playerData = new Map(); // playerId -> player info
let gameData = {
    state: 'waiting',
    players: {},
    provinces: {},
    gameStartTime: null,
    gameEndTime: null,
    countdown: 5
};

// WebRTC Configuration
const rtcConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

// Signaling WebSocket
let signalingSocket = null;
const SIGNALING_SERVER = window.location.origin.replace(/^http/, 'ws');

// Available colors for players
const PLAYER_COLORS = [
    '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
    '#1abc9c', '#e67e22', '#34495e', '#e91e63', '#795548'
];

// Initialize fort levels based on GDP
function initializeFortLevels() {
    Object.keys(gdpData).forEach(countryName => {
        const gdp = gdpData[countryName];
        // GDP / 50 = fortification units, then divide by 2 for starting level
        const fortLevel = Math.floor((gdp / 50) / 2);
        countryFortLevels[countryName] = Math.max(0, fortLevel);
    });
    console.log('Fort levels initialized:', countryFortLevels);
}

// Initialize the map
function initMap() {
    // Initialize map centered on Europe
    map = L.map('map', {
        center: [54.5, 15.0],
        zoom: 4,
        maxZoom: 6,
        minZoom: 4,  // Increased from 3 to 4 to prevent too much zoom out
        maxBounds: [[25, -15], [75, 45]], // Extended south from 30 to 25 for even more southern access
        maxBoundsViscosity: 0.8,
        zoomControl: true,
        attributionControl: true
    });

    // Set view to Europe without any tiles
    map.setView([54.5, 15.0], 4);

    // Load Europe GeoJSON data
    loadEuropeData();
}

// Generate unique room codes
function generateRoomCode() {
    return Math.random().toString(36).substr(2, 4).toUpperCase();
}

function generatePlayerId() {
    return 'player_' + Math.random().toString(36).substr(2, 9);
}

// Quick Play Mode (Single Player)
function quickPlay() {
    // Require country selection before starting quick play
    if (!selectedCountry) {
        alert('You must select a country first! Click on a country on the map to select it.');
        return;
    }
    
    if (!currentPlayerId) {
        currentPlayerId = generatePlayerId();
    }
    
    isHost = true;
    roomCode = 'SOLO'; // Special room code for single player
    
    // Initialize game data
    gameData = {
        state: 'waiting',
        players: {},
        provinces: {},
        gameStartTime: null,
        gameEndTime: null,
        countdown: 5
    };
    
    // Add player to game
    gameData.players[currentPlayerId] = {
        id: currentPlayerId,
        name: `Player ${currentPlayerId.slice(-4)}`,
        color: PLAYER_COLORS[0],
        selectedCountry: selectedCountry,
        isHost: true,
        isReady: true, // Auto-ready for solo play
        power: 10,
        economy: 0
    };
    
    // Immediately activate fallback mode for solo play
    if (window.FallbackP2P) {
        window.FallbackP2P.init(roomCode);
    }
    updateConnectionStatus('connected', 'Solo Mode');
    
    updateRoomUI();
    updateGameStateUI();
    
    // Start economy growth timer
    startEconomyGrowthTimer();
    
    // Auto-start game after short delay
    setTimeout(() => {
        startGame();
    }, 1000);
    
    console.log('Started solo play mode');
}
function createRoom() {
    // Require country selection before creating room
    if (!selectedCountry) {
        alert('You must select a country first! Click on a country on the map to select it.');
        return;
    }
    
    if (!currentPlayerId) {
        currentPlayerId = generatePlayerId();
    }
    
    isHost = true;
    roomCode = generateRoomCode();
    
    // Initialize game data
    gameData = {
        state: 'waiting',
        players: {},
        provinces: {},
        gameStartTime: null,
        gameEndTime: null,
        countdown: 5
    };
    
    // Add host to game
    const usedColors = Object.values(gameData.players).map(p => p.color);
    const availableColors = PLAYER_COLORS.filter(c => !usedColors.includes(c));
    const randomColor = availableColors[Math.floor(Math.random() * availableColors.length)] || PLAYER_COLORS[0];
    
    gameData.players[currentPlayerId] = {
        id: currentPlayerId,
        name: `Host ${currentPlayerId.slice(-4)}`,
        color: randomColor,
        selectedCountry: selectedCountry,
        isHost: true,
        isReady: false,
        power: 10,
        economy: 0
    };
    
    // Try to connect to signaling server, fall back to local storage if it fails
    connectToSignalingServer(() => {
        signalingSocket.send(JSON.stringify({
            type: 'create_room',
            data: {
                playerId: currentPlayerId,
                playerInfo: gameData.players[currentPlayerId],
                roomCode: roomCode
            }
        }));
    });
    
    updateRoomUI();
    updateGameStateUI();
    
    // Start economy growth timer
    startEconomyGrowthTimer();
    
    console.log('Created room:', roomCode);
}

function joinRoom(code) {
    // Require country selection before joining room
    if (!selectedCountry) {
        alert('You must select a country first! Click on a country on the map to select it.');
        return;
    }
    
    if (!currentPlayerId) {
        currentPlayerId = generatePlayerId();
    }
    
    roomCode = code.toUpperCase();
    isHost = false;
    
    // Check if room exists in fallback storage first
    if (window.FallbackP2P && window.FallbackP2P.roomExists(roomCode)) {
        console.log('Found room in fallback storage, joining...');
        
        if (window.FallbackP2P.joinExistingRoom(roomCode)) {
            updateConnectionStatus('connected', 'Fallback Mode');
            updateRoomUI();
            updateGameStateUI();
            startEconomyGrowthTimer();
            return;
        }
    }
    
    // Add player to game data temporarily
    const usedColors = Object.values(gameData.players).map(p => p.color);
    const availableColors = PLAYER_COLORS.filter(c => !usedColors.includes(c));
    const randomColor = availableColors[Math.floor(Math.random() * availableColors.length)] || PLAYER_COLORS[0];
    
    const playerInfo = {
        id: currentPlayerId,
        name: `Player ${currentPlayerId.slice(-4)}`,
        color: randomColor,
        selectedCountry: selectedCountry,
        isHost: false,
        isReady: false,
        power: 10,
        economy: 0
    };
    
    // Connect to signaling server and join room
    connectToSignalingServer(() => {
        signalingSocket.send(JSON.stringify({
            type: 'join_room',
            data: {
                playerId: currentPlayerId,
                playerInfo: playerInfo,
                roomCode: roomCode
            }
        }));
    });
    
    console.log('Joining room:', roomCode);
}

// WebSocket Signaling
function connectToSignalingServer(onConnected) {
    if (signalingSocket && signalingSocket.readyState === WebSocket.OPEN) {
        if (onConnected) onConnected();
        return;
    }
    
    updateConnectionStatus('connecting', 'Connecting...');
    
    // Set up fallback timeout (shorter for better UX)
    const fallbackTimeout = setTimeout(() => {
        console.log('Server connection timeout, using fallback P2P');
        activateFallbackMode(onConnected);
    }, 2000); // Reduced to 2 seconds
    
    try {
        signalingSocket = new WebSocket(SIGNALING_SERVER);
        
        signalingSocket.onopen = () => {
            clearTimeout(fallbackTimeout); // Cancel fallback
            console.log('Connected to signaling server');
            updateConnectionStatus('connected', 'Connected');
            
            // Cleanup fallback if it was initialized
            if (window.FallbackP2P && window.FallbackP2P.isActive) {
                window.FallbackP2P.cleanup();
            }
            
            if (onConnected) onConnected();
            
            // Send ping every 30 seconds to keep connection alive
            setInterval(() => {
                if (signalingSocket && signalingSocket.readyState === WebSocket.OPEN) {
                    signalingSocket.send(JSON.stringify({ type: 'ping' }));
                }
            }, 30000);
        };
        
        signalingSocket.onmessage = (event) => {
            try {
                const { type, data } = JSON.parse(event.data);
                handleSignalingMessage(type, data);
            } catch (error) {
                console.error('Error parsing signaling message:', error);
            }
        };
        
        signalingSocket.onclose = () => {
            console.log('Disconnected from signaling server');
            
            // Activate fallback mode immediately on disconnect
            if (roomCode && currentPlayerId && !window.FallbackP2P.isActive) {
                console.log('Connection lost, switching to fallback mode');
                activateFallbackMode();
            } else {
                updateConnectionStatus('disconnected', 'Disconnected');
            }
            
            // Try to reconnect after 5 seconds if we're in a room and not using fallback
            if (roomCode && currentPlayerId && !window.FallbackP2P.isActive) {
                setTimeout(() => {
                    console.log('Attempting to reconnect...');
                    updateConnectionStatus('connecting', 'Reconnecting...');
                    connectToSignalingServer();
                }, 5000);
            }
        };
        
        signalingSocket.onerror = (error) => {
            console.error('Signaling WebSocket error:', error);
            clearTimeout(fallbackTimeout);
            
            // Use fallback immediately on error
            activateFallbackMode(onConnected);
        };
        
    } catch (error) {
        console.error('Failed to create WebSocket:', error);
        clearTimeout(fallbackTimeout);
        activateFallbackMode(onConnected);
    }
}

function activateFallbackMode(onConnected) {
    if (roomCode && window.FallbackP2P) {
        console.log('Activating fallback P2P mode');
        window.FallbackP2P.init(roomCode);
        updateConnectionStatus('connected', 'Fallback Mode');
        
        if (onConnected) onConnected();
    } else {
        updateConnectionStatus('disconnected', 'Connection Error');
    }
}

function updateConnectionStatus(status, text) {
    const indicator = document.getElementById('connection-indicator');
    const textElement = document.getElementById('connection-text');
    
    if (indicator && textElement) {
        // Remove all status classes
        indicator.className = `connection-indicator ${status}`;
        textElement.textContent = text;
        
        // Update peer count if connected
        if (status === 'connected' && roomCode) {
            const peerCount = dataChannels.size;
            textElement.textContent = `${text} (${peerCount} peers)`;
        }
    }
}

function handleSignalingMessage(type, data) {
    console.log('Signaling message:', type, data);
    
    switch (type) {
        case 'room_created':
            console.log('Room created successfully');
            break;
            
        case 'room_joined':
            console.log('Joined room successfully');
            break;
            
        case 'player_joined':
            handlePlayerJoined(data);
            break;
            
        case 'player_left':
            handlePlayerLeft(data);
            break;
            
        case 'game_state':
            gameData = data;
            updateGameStateUI();
            startEconomyGrowthTimer();
            break;
            
        case 'game_state_update':
            gameData = { ...gameData, ...data };
            updateGameStateUI();
            break;
            
        case 'room_closed':
            alert('Room was closed by the host');
            exitGame();
            break;
            
        case 'webrtc_offer':
            handleWebRTCOffer(data);
            break;
            
        case 'webrtc_answer':
            handleWebRTCAnswer(data);
            break;
            
        case 'webrtc_ice_candidate':
            handleWebRTCIceCandidate(data);
            break;
            
        case 'error':
            console.error('Signaling error:', data.message);
            alert(data.message);
            break;
            
        case 'pong':
            // Keep-alive response
            break;
            
        default:
            console.log('Unknown signaling message:', type);
    }
}

function handlePlayerJoined(data) {
    const { playerId, playerInfo } = data;
    
    // Add player to game data
    gameData.players[playerId] = playerInfo;
    
    // If we're host, initiate WebRTC connection
    if (isHost && playerId !== currentPlayerId) {
        initiateWebRTCConnection(playerId);
    }
    
    updateGameStateUI();
}

function handlePlayerLeft(data) {
    const { playerId } = data;
    
    // Remove player from game data
    delete gameData.players[playerId];
    
    // Remove their provinces
    Object.keys(gameData.provinces).forEach(province => {
        if (gameData.provinces[province] === playerId) {
            delete gameData.provinces[province];
        }
    });
    
    // Close WebRTC connection
    if (peers.has(playerId)) {
        peers.get(playerId).close();
        peers.delete(playerId);
    }
    
    if (dataChannels.has(playerId)) {
        dataChannels.delete(playerId);
    }
    
    updateGameStateUI();
}

// WebRTC P2P Connections
async function initiateWebRTCConnection(targetPlayerId) {
    try {
        const peerConnection = new RTCPeerConnection(rtcConfiguration);
        peers.set(targetPlayerId, peerConnection);
        
        // Create data channel
        const dataChannel = peerConnection.createDataChannel('gameData', {
            ordered: true
        });
        
        setupDataChannel(dataChannel, targetPlayerId);
        
        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                signalingSocket.send(JSON.stringify({
                    type: 'webrtc_ice_candidate',
                    data: {
                        targetPlayerId: targetPlayerId,
                        candidate: event.candidate
                    }
                }));
            }
        };
        
        // Handle incoming data channel
        peerConnection.ondatachannel = (event) => {
            const channel = event.channel;
            setupDataChannel(channel, targetPlayerId);
        };
        
        // Create offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        // Send offer through signaling server
        signalingSocket.send(JSON.stringify({
            type: 'webrtc_offer',
            data: {
                targetPlayerId: targetPlayerId,
                offer: offer
            }
        }));
        
        console.log(`Initiated WebRTC connection to ${targetPlayerId}`);
        
    } catch (error) {
        console.error('Error initiating WebRTC connection:', error);
    }
}

async function handleWebRTCOffer(data) {
    const { fromPlayerId, offer } = data;
    
    try {
        const peerConnection = new RTCPeerConnection(rtcConfiguration);
        peers.set(fromPlayerId, peerConnection);
        
        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                signalingSocket.send(JSON.stringify({
                    type: 'webrtc_ice_candidate',
                    data: {
                        targetPlayerId: fromPlayerId,
                        candidate: event.candidate
                    }
                }));
            }
        };
        
        // Handle incoming data channel
        peerConnection.ondatachannel = (event) => {
            const channel = event.channel;
            setupDataChannel(channel, fromPlayerId);
        };
        
        // Set remote description and create answer
        await peerConnection.setRemoteDescription(offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        // Send answer through signaling server
        signalingSocket.send(JSON.stringify({
            type: 'webrtc_answer',
            data: {
                targetPlayerId: fromPlayerId,
                answer: answer
            }
        }));
        
        console.log(`Handled WebRTC offer from ${fromPlayerId}`);
        
    } catch (error) {
        console.error('Error handling WebRTC offer:', error);
    }
}

async function handleWebRTCAnswer(data) {
    const { fromPlayerId, answer } = data;
    
    try {
        const peerConnection = peers.get(fromPlayerId);
        if (peerConnection) {
            await peerConnection.setRemoteDescription(answer);
            console.log(`Handled WebRTC answer from ${fromPlayerId}`);
        }
    } catch (error) {
        console.error('Error handling WebRTC answer:', error);
    }
}

async function handleWebRTCIceCandidate(data) {
    const { fromPlayerId, candidate } = data;
    
    try {
        const peerConnection = peers.get(fromPlayerId);
        if (peerConnection) {
            await peerConnection.addIceCandidate(candidate);
            console.log(`Added ICE candidate from ${fromPlayerId}`);
        }
    } catch (error) {
        console.error('Error handling ICE candidate:', error);
    }
}

function setupDataChannel(dataChannel, playerId) {
    dataChannels.set(playerId, dataChannel);
    
    dataChannel.onopen = () => {
        console.log(`Data channel opened with ${playerId}`);
        updateConnectionStatus('connected', 'Connected');
    };
    
    dataChannel.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            handleP2PMessage(message, playerId);
        } catch (error) {
            console.error('Error parsing P2P message:', error);
        }
    };
    
    dataChannel.onclose = () => {
        console.log(`Data channel closed with ${playerId}`);
        dataChannels.delete(playerId);
        updateConnectionStatus('connected', 'Connected');
    };
    
    dataChannel.onerror = (error) => {
        console.error(`Data channel error with ${playerId}:`, error);
    };
}

function handleP2PMessage(message, fromPlayerId) {
    const { type, data } = message;
    
    switch (type) {
        case 'game_state_update':
            // Merge game state updates from peers
            gameData = { ...gameData, ...data };
            updateGameStateUI();
            break;
            
        case 'player_action':
            // Handle player actions (attacks, fort upgrades, etc.)
            handlePlayerAction(data, fromPlayerId);
            break;
            
        default:
            console.log('Unknown P2P message type:', type);
    }
}

function handlePlayerAction(actionData, fromPlayerId) {
    const { action, payload } = actionData;
    
    switch (action) {
        case 'attack_country':
            // Verify and process attack from another player
            if (payload.attackerId === fromPlayerId) {
                processAttackAction(payload);
            }
            break;
            
        case 'upgrade_fort':
            // Verify and process fort upgrade from another player
            if (payload.playerId === fromPlayerId) {
                processFortUpgradeAction(payload);
            }
            break;
            
        case 'player_ready':
            // Update player ready status
            if (gameData.players[fromPlayerId]) {
                gameData.players[fromPlayerId].isReady = payload.isReady;
                updateGameStateUI();
            }
            break;
            
        case 'country_selected':
            // Update player's selected country
            if (gameData.players[fromPlayerId]) {
                gameData.players[fromPlayerId].selectedCountry = payload.countryName;
                gameData.players[fromPlayerId].isReady = false; // Reset ready status
                updateGameStateUI();
                updateProvinceDisplay();
            }
            break;
            
        default:
            console.log('Unknown player action:', action);
    }
}

function processAttackAction(payload) {
    const { attackerId, countryName, attackTypeIndex, success, newEconomy } = payload;
    
    // Update attacker's economy
    if (gameData.players[attackerId]) {
        gameData.players[attackerId].economy = newEconomy;
    }
    
    // Apply the attack result
    if (success) {
        // Remove previous owner if any
        const previousOwner = gameData.provinces[countryName];
        
        // Assign country to attacking player
        gameData.provinces[countryName] = attackerId;
        
        console.log(`Player ${attackerId} conquered ${countryName} via P2P`);
    }
    
    // Update UI if this affects current player
    if (attackerId === currentPlayerId) {
        updatePlayerStatusBar();
    }
    
    // Update UI
    updateGameStateUI();
    updateProvinceDisplay();
    
    // Update country info dynamically if it's currently displayed
    if (currentlyDisplayedCountry === countryName) {
        updateCountryInfoDynamic(countryName);
    }
}

function processFortUpgradeAction(payload) {
    const { playerId, countryName, newFortLevel, newEconomy } = payload;
    
    // Apply fort upgrade
    countryFortLevels[countryName] = newFortLevel;
    
    // Update player's economy
    if (gameData.players[playerId]) {
        gameData.players[playerId].economy = newEconomy;
    }
    
    console.log(`Player ${playerId} upgraded fort in ${countryName} to level ${newFortLevel} via P2P`);
    
    // Update UI if this affects current player
    if (playerId === currentPlayerId) {
        updatePlayerStatusBar();
    }
    
    // Update country info dynamically if it's currently displayed
    if (currentlyDisplayedCountry === countryName) {
        updateCountryInfoDynamic(countryName);
    }
}

// Send player action to all peers
function broadcastPlayerAction(action, payload) {
    const actionData = {
        action: action,
        payload: payload
    };
    
    broadcastToP2P('player_action', actionData);
}

// Broadcast to all connected peers
function broadcastToP2P(type, data) {
    const message = JSON.stringify({ type, data });
    
    dataChannels.forEach((channel, playerId) => {
        if (channel.readyState === 'open') {
            try {
                channel.send(message);
            } catch (error) {
                console.error(`Error sending to ${playerId}:`, error);
            }
        }
    });
    
    // Also update through signaling server for backup
    if (signalingSocket && signalingSocket.readyState === WebSocket.OPEN) {
        signalingSocket.send(JSON.stringify({
            type: 'update_game_state',
            data: { gameState: gameData }
        }));
    }
}

// Simplified P2P using localStorage for demo (works only on same computer/browser)
// In production, you'd use WebRTC with a proper signaling server
function initSimpleP2P() {
    // This function is now replaced by the WebRTC implementation above
    // Keeping for backward compatibility, but it's no longer used
    console.log('Using WebRTC P2P instead of localStorage');
}

function saveRoomData() {
    // With WebRTC P2P, we broadcast changes instead of saving to localStorage
    if (roomCode && currentPlayerId) {
        broadcastToP2P('game_state_update', gameData);
        
        // Also save to fallback if active
        if (window.FallbackP2P && window.FallbackP2P.isActive) {
            window.FallbackP2P.saveGameState(gameData);
        }
    }
}

// Game State Management
function updateGameStateUI() {
    updatePlayerList();
    updatePlayerCount();
    updateGameControls();
    updateProvinceDisplay();
    updatePlayerStatusBar();
    
    // Update start game button if function exists
    if (window.updateStartGameButton) {
        window.updateStartGameButton();
    }
    
    // Save room data if we're host or in a room
    if (roomCode) {
        saveRoomData();
    }
}

function updateRoomUI() {
    // Update room display
    const roomDisplay = document.getElementById('room-display');
    if (roomDisplay) {
        if (roomCode) {
            roomDisplay.innerHTML = `
                <div style="background: #e8f5e8; border: 1px solid #27ae60; padding: 10px; border-radius: 5px; margin: 10px 0;">
                    <strong>Room Code: ${roomCode}</strong><br>
                    <small>Share this code with friends to play together!</small>
                </div>
            `;
        } else {
            roomDisplay.innerHTML = '';
        }
    }
}

function updateGameControls() {
    const timerDiv = document.getElementById('game-timer');
    const countdownDiv = document.getElementById('countdown');
    const lobbySection = document.getElementById('lobby-section');
    const gameControls = document.getElementById('game-controls');
    const roomControls = document.getElementById('room-controls');
    const playerList = document.getElementById('player-list');
    const createRoomBtn = document.getElementById('create-room-btn');
    const quickPlayBtn = document.getElementById('quick-play-btn');
    const joinRoomSection = document.querySelector('.join-room-section');
    const playModeInfo = document.querySelector('.play-mode-info');
    
    switch (gameData.state) {
        case 'waiting':
            timerDiv.classList.add('hidden');
            countdownDiv.classList.add('hidden');
            
            if (currentPlayerId && gameData.players[currentPlayerId]) {
                // Player is in the room - show lobby controls and player list, hide join options
                lobbySection.style.display = roomCode === 'SOLO' ? 'none' : 'block'; // Hide lobby for solo mode
                gameControls.style.display = 'block';
                if (roomControls) roomControls.style.display = 'block';
                if (playerList) playerList.style.display = roomCode === 'SOLO' ? 'none' : 'block'; // Hide player list for solo
                if (createRoomBtn) createRoomBtn.style.display = 'none';
                if (quickPlayBtn) quickPlayBtn.style.display = 'none';
                if (joinRoomSection) joinRoomSection.style.display = 'none';
                if (playModeInfo) playModeInfo.style.display = 'none';
                
                // Update lobby display
                if (roomCode !== 'SOLO') {
                    updateLobbyDisplay();
                }
            } else if (roomCode) {
                // In a room but not joined yet - hide everything except room controls
                lobbySection.style.display = 'none';
                gameControls.style.display = 'none';
                if (roomControls) roomControls.style.display = 'block';
                if (playerList) playerList.style.display = 'none';
                if (createRoomBtn) createRoomBtn.style.display = 'none';
                if (quickPlayBtn) quickPlayBtn.style.display = 'none';
                if (joinRoomSection) joinRoomSection.style.display = 'none';
                if (playModeInfo) playModeInfo.style.display = 'none';
            } else {
                // Not in any room - show room creation/joining options
                lobbySection.style.display = 'none';
                gameControls.style.display = 'none';
                if (roomControls) roomControls.style.display = 'block';
                if (playerList) playerList.style.display = 'none';
                if (createRoomBtn) createRoomBtn.style.display = 'block';
                if (quickPlayBtn) quickPlayBtn.style.display = 'block';
                if (joinRoomSection) joinRoomSection.style.display = 'flex';
                if (playModeInfo) playModeInfo.style.display = 'block';
            }
            break;
            
        case 'countdown':
            timerDiv.classList.add('hidden');
            countdownDiv.classList.remove('hidden');
            countdownDiv.textContent = `Game starts in: ${gameData.countdown}`;
            lobbySection.style.display = 'none';
            gameControls.style.display = 'block';
            if (roomControls) roomControls.style.display = 'none';
            if (playerList) playerList.style.display = roomCode === 'SOLO' ? 'none' : 'block';
            if (createRoomBtn) createRoomBtn.style.display = 'none';
            if (quickPlayBtn) quickPlayBtn.style.display = 'none';
            if (joinRoomSection) joinRoomSection.style.display = 'none';
            if (playModeInfo) playModeInfo.style.display = 'none';
            break;
            
        case 'playing':
            countdownDiv.classList.add('hidden');
            timerDiv.classList.remove('hidden');
            updateGameTimer();
            lobbySection.style.display = 'none';
            gameControls.style.display = 'block';
            if (roomControls) roomControls.style.display = 'none';
            if (playerList) playerList.style.display = roomCode === 'SOLO' ? 'none' : 'block';
            if (createRoomBtn) createRoomBtn.style.display = 'none';
            if (quickPlayBtn) quickPlayBtn.style.display = 'none';
            if (joinRoomSection) joinRoomSection.style.display = 'none';
            if (playModeInfo) playModeInfo.style.display = 'none';
            break;
            
        case 'ended':
            timerDiv.classList.add('hidden');
            countdownDiv.classList.add('hidden');
            lobbySection.style.display = 'none';
            gameControls.style.display = 'block';
            if (roomControls) roomControls.style.display = 'block';
            if (playerList) playerList.style.display = roomCode === 'SOLO' ? 'none' : 'block';
            if (playModeInfo) playModeInfo.style.display = 'none';
            break;
    }
}

function updateLobbyDisplay() {
    const selectedCountryLobby = document.getElementById('selected-country-lobby');
    const readyBtn = document.getElementById('ready-btn');
    
    if (currentPlayerId && gameData.players[currentPlayerId]) {
        const player = gameData.players[currentPlayerId];
        
        // Update selected country display
        if (selectedCountryLobby) {
            if (player.selectedCountry) {
                const displayName = normalizeDisplayName(player.selectedCountry);
                const flagEmoji = getCountryFlagEmoji(player.selectedCountry);
                selectedCountryLobby.textContent = `${flagEmoji} ${displayName}`;
                selectedCountryLobby.classList.add('selected');
            } else {
                selectedCountryLobby.textContent = 'Click on a country to select';
                selectedCountryLobby.classList.remove('selected');
            }
        }
        
        // Update ready button
        if (readyBtn) {
            if (player.isReady) {
                readyBtn.textContent = 'Not Ready';
                readyBtn.classList.add('ready');
            } else {
                readyBtn.textContent = 'Ready';
                readyBtn.classList.remove('ready');
            }
        }
    }
}

function updateGameTimer() {
    const timerDiv = document.getElementById('game-timer');
    
    if (!gameData.gameEndTime) {
        timerDiv.textContent = 'Game Time: --:--';
        return;
    }
    
    const updateTimer = () => {
        const now = Date.now();
        const timeLeft = Math.max(0, gameData.gameEndTime - now);
        
        if (timeLeft <= 0) {
            timerDiv.textContent = 'Game Time: 00:00';
            if (isHost) {
                endGame();
            }
            return;
        }
        
        const minutes = Math.floor(timeLeft / 60000);
        const seconds = Math.floor((timeLeft % 60000) / 1000);
        
        timerDiv.textContent = `Game Time: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };
    
    updateTimer();
    if (!window.gameTimerInterval) {
        window.gameTimerInterval = setInterval(updateTimer, 1000);
    }
}

function updatePlayerList() {
    const playersContainer = document.getElementById('players-container');
    const players = Object.values(gameData.players);
    
    if (players.length === 0) {
        playersContainer.innerHTML = '<div class="loading-text" style="color: #7f8c8d; font-style: italic; text-align: center;">No players yet</div>';
        return;
    }
    
    playersContainer.innerHTML = '';
    players.forEach(player => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-item';
        
        const colorSpan = document.createElement('span');
        colorSpan.className = 'player-color';
        colorSpan.style.backgroundColor = player.color;
        
        const infoSpan = document.createElement('span');
        infoSpan.className = 'player-info';
        
        let statusIcon = '';
        if (gameData.state === 'waiting') {
            statusIcon = player.isReady ? ' ✅' : ' ⏳';
        }
        
        let countryDisplay = '';
        if (player.selectedCountry) {
            const displayName = normalizeDisplayName(player.selectedCountry);
            const flagEmoji = getCountryFlagEmoji(player.selectedCountry);
            countryDisplay = ` (${flagEmoji} ${displayName})`;
        }
        
        infoSpan.textContent = `${player.name}${countryDisplay}${player.isHost ? ' 👑' : ''}${statusIcon}`;
        
        playerDiv.appendChild(colorSpan);
        playerDiv.appendChild(infoSpan);
        playersContainer.appendChild(playerDiv);
    });
}

function updatePlayerCount() {
    const playerCountDiv = document.getElementById('player-count');
    
    if (!roomCode) {
        playerCountDiv.textContent = 'No room joined';
        return;
    }
    
    if (roomCode === 'SOLO') {
        playerCountDiv.textContent = 'Solo Mode';
        return;
    }
    
    const count = Object.keys(gameData.players).length;
    playerCountDiv.textContent = `Players: ${count} | Room: ${roomCode}`;
}

function updateProvinceDisplay() {
    if (!europeLayer) return;
    
    europeLayer.eachLayer((layer) => {
        const feature = layer.feature;
        if (feature && feature.properties) {
            const rawCountryName = feature.properties.NAME || feature.properties.ADMIN || feature.properties.name || feature.properties.NAME_EN;
            const countryName = normalizeDisplayName(rawCountryName); // Normalize the country name
            
            // Check if owned (during game)
            if (gameData.provinces[countryName]) {
                const ownerId = gameData.provinces[countryName];
                const owner = gameData.players[ownerId];
                if (owner) {
                    layer.setStyle({
                        fillColor: owner.color,
                        fillOpacity: 0.8,
                        stroke: true,
                        color: '#2c3e50',
                        weight: 2
                    });
                    return;
                }
            }
            
            // Check if selected by a player (during lobby/waiting)
            const playerWithCountry = Object.values(gameData.players).find(
                player => player.selectedCountry === countryName
            );
            
            if (playerWithCountry) {
                layer.setStyle({
                    fillColor: playerWithCountry.color,
                    fillOpacity: 0.6,
                    stroke: true,
                    color: '#2c3e50',
                    weight: 2
                });
            } else {
                // Reset to gray for unowned/unselected provinces
                layer.setStyle({
                    fillColor: '#95a5a6', // Gray color for unowned
                    fillOpacity: 0.7,
                    stroke: true,
                    color: '#2c3e50',
                    weight: 1.5
                });
            }
        }
    });
}

// Game Actions
function startCountdown() {
    if (!isHost || gameData.state !== 'waiting') return;
    
    gameData.state = 'countdown';
    gameData.countdown = 5;
    
    const countdownInterval = setInterval(() => {
        gameData.countdown--;
        updateGameStateUI();
        
        if (gameData.countdown <= 0) {
            clearInterval(countdownInterval);
            startGame();
        }
    }, 1000);
    
    updateGameStateUI();
}

function startGame() {
    if (!isHost) return;
    
    gameData.state = 'playing';
    gameData.gameStartTime = Date.now();
    gameData.gameEndTime = Date.now() + (10 * 60 * 1000); // 10 minutes
    
    // Start power generation timer (1 power every 5 seconds)
    if (window.powerTimer) {
        clearInterval(window.powerTimer);
    }
    window.powerTimer = setInterval(() => {
        Object.values(gameData.players).forEach(player => {
            const oldPower = player.power || 10;
            player.power = oldPower + 1;
            console.log(`Player ${player.name} power increased from ${oldPower} to ${player.power}`);
        });
        saveRoomData();
        updatePlayerStatusBar();
    }, 5000);
    
    // Start economy growth timer (runs all the time for all players)
    startEconomyGrowthTimer();
    
    // Auto-assign selected countries as starting provinces and set initial player economies
    Object.values(gameData.players).forEach(player => {
        if (player.selectedCountry) {
            gameData.provinces[player.selectedCountry] = player.id;
            
            // Initialize player economy to 50% of their selected country's GDP
            const countryGDP = gdpData[player.selectedCountry] || 100;
            player.economy = countryGDP * 0.5;
            console.log(`Player ${player.name} starts with $${player.economy.toFixed(1)}B (50% of ${player.selectedCountry}'s $${countryGDP.toFixed(1)}B GDP)`);
        }
    });
    
    updateGameStateUI();
    updateProvinceDisplay();
    
    // Auto-end game after 10 minutes
    setTimeout(() => {
        if (gameData.state === 'playing') {
            endGame();
        }
    }, 10 * 60 * 1000);
}

function endGame() {
    if (!isHost) return;
    
    gameData.state = 'ended';
    
    // Calculate scores
    const scores = Object.values(gameData.players).map(player => ({
        ...player,
        score: Object.values(gameData.provinces).filter(owner => owner === player.id).length
    }));
    
    scores.sort((a, b) => b.score - a.score);
    
    // Show results
    const resultsText = scores.map((player, index) => 
        `${index + 1}. ${player.name}: ${player.score} provinces`
    ).join('\n');
    
    alert(`Game Over!\n\nWinner: ${scores[0].name}\n\nResults:\n${resultsText}`);
    
    updateGameStateUI();
    
    // Auto-reset after 30 seconds
    setTimeout(() => {
        resetGame();
    }, 30000);
}

function resetGame() {
    if (!isHost) return;
    
    gameData.state = 'waiting';
    gameData.provinces = {};
    gameData.gameStartTime = null;
    gameData.gameEndTime = null;
    gameData.countdown = 5;
    
    if (window.gameTimerInterval) {
        clearInterval(window.gameTimerInterval);
        window.gameTimerInterval = null;
    }
    
    updateGameStateUI();
}

function claimProvince(provinceName) {
    if (!currentPlayerId || gameData.state !== 'playing') {
        return;
    }
    
    // Check if already claimed
    if (gameData.provinces[provinceName]) {
        console.log('Province already claimed');
        return;
    }
    
    // Claim the province
    gameData.provinces[provinceName] = currentPlayerId;
    
    updateGameStateUI();
    
    console.log(`Claimed ${provinceName} for player ${currentPlayerId}`);
}

function exitGame() {
    if (currentPlayerId && gameData.players[currentPlayerId]) {
        const wasHost = gameData.players[currentPlayerId].isHost;
        
        // Remove player from game
        delete gameData.players[currentPlayerId];
        
        // Remove their provinces (turn them neutral/gray)
        Object.keys(gameData.provinces).forEach(province => {
            if (gameData.provinces[province] === currentPlayerId) {
                delete gameData.provinces[province];
            }
        });
        
        // Notify signaling server
        if (signalingSocket && signalingSocket.readyState === WebSocket.OPEN) {
            signalingSocket.send(JSON.stringify({
                type: 'leave_room',
                data: { playerId: currentPlayerId }
            }));
        }
        
        // Close all peer connections
        peers.forEach((peerConnection) => {
            peerConnection.close();
        });
        peers.clear();
        dataChannels.clear();
        
        // Close signaling connection
        if (signalingSocket) {
            signalingSocket.close();
            signalingSocket = null;
        }
    }
    
    // Clear all timers
    if (window.countdownTimer) {
        clearInterval(window.countdownTimer);
        window.countdownTimer = null;
    }
    if (window.gameTimerInterval) {
        clearInterval(window.gameTimerInterval);
        window.gameTimerInterval = null;
    }
    if (window.powerTimer) {
        clearInterval(window.powerTimer);
        window.powerTimer = null;
    }
    if (window.economyTimer) {
        clearInterval(window.economyTimer);
        window.economyTimer = null;
    }
    
    // Reset ALL state to initial values
    gameData = {
        state: 'waiting',
        players: {},
        provinces: {},
        gameStartTime: null,
        gameEndTime: null,
        countdown: 5
    };
    
    roomCode = null;
    isHost = false;
    currentPlayerId = null;
    selectedCountry = null;
    
    // Reset connection status
    updateConnectionStatus('disconnected', 'Offline');
    
    // Reset UI to initial state completely (order matters)
    updateRoomUI();
    updateGameStateUI();
    
    console.log('Completely reset to initial state');
}

function setLoadingComplete() {
    isLoading = false;
    
    // Hide loading status
    const loadingStatus = document.getElementById('loading-status');
    if (loadingStatus) {
        loadingStatus.style.display = 'none';
    }
    
    // Show multiplayer note
    const multiplayerNote = document.getElementById('multiplayer-note');
    if (multiplayerNote) {
        multiplayerNote.classList.remove('hidden');
        multiplayerNote.textContent = '🌐 P2P Multiplayer - Create or join rooms to play with friends!';
    }
    
    // Set initial UI state - hide player list until in room
    const playerList = document.getElementById('player-list');
    if (playerList) {
        playerList.style.display = 'none';
    }
    
    // Initialize connection status
    updateConnectionStatus('disconnected', 'Offline');
    
    console.log('Game data updated:', gameData);
}

// Load Europe GeoJSON data
function loadEuropeData() {
    console.log('Loading Europe data...');
    
    fetch('https://raw.githubusercontent.com/leakyMirror/map-of-europe/master/GeoJSON/europe.geojson')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load map data');
            }
            return response.json();
        })
        .then(data => {
            console.log('Raw GeoJSON loaded:', data);
            
            // Filter for European countries we want
            const europeanCountries = data.features.filter(feature => {
                const countryName = feature.properties.NAME || feature.properties.ADMIN || feature.properties.name || feature.properties.NAME_EN;
                return isEuropeanCountry(countryName);
            });
            
            console.log('European countries found:', europeanCountries.length);
            
            // Create GeoJSON layer with filtered data
            europeLayer = L.geoJSON({ type: 'FeatureCollection', features: europeanCountries }, {
                style: {
                    fillColor: '#95a5a6', // Gray for unowned countries
                    weight: 1.5,
                    opacity: 1,
                    color: '#2c3e50',
                    fillOpacity: 0.7
                },
                onEachFeature: function(feature, layer) {
                    const countryName = feature.properties.NAME || feature.properties.ADMIN || feature.properties.name || feature.properties.NAME_EN;
                    
                    layer.on({
                        mouseover: function(e) {
                            // Add a subtle darkening filter on hover
                            layer.getElement()?.style.setProperty('filter', 'brightness(0.85)');
                        },
                        mouseout: function(e) {
                            // Remove the darkening filter
                            layer.getElement()?.style.removeProperty('filter');
                        },
                        click: function(e) {
                            // Prevent actions during loading
                            if (isLoading) {
                                console.log('Game is still loading, please wait...');
                                return;
                            }
                            
                            // Check if cursor position is within visible European bounds
                            if (!isCursorInVisibleBounds(e.latlng)) {
                                return; // Don't allow click if cursor is outside visible bounds
                            }
                            
                            const rawCountryName = feature.properties.NAME || feature.properties.ADMIN || feature.properties.name || feature.properties.NAME_EN;
                            const countryName = normalizeDisplayName(rawCountryName); // Normalize the country name
                            console.log('Clicked country:', rawCountryName, '->', countryName, 'Game state:', gameData.state);
                            
                            // Handle country selection during waiting phase
                            if (gameData.state === 'waiting' && (!currentPlayerId || !gameData.players[currentPlayerId])) {
                                selectCountry(countryName);
                                loadCountryInfo(countryName);
                                return;
                            }
                            
                            // Handle country changing in lobby
                            if (gameData.state === 'waiting' && currentPlayerId && gameData.players[currentPlayerId]) {
                                changeSelectedCountry(countryName);
                                loadCountryInfo(countryName);
                                return;
                            }
                            
                            // Handle province claiming during game
                            if (gameData.state === 'playing' && currentPlayerId && gameData.players[currentPlayerId]) {
                                // During gameplay, just show country info, don't allow claiming by click
                                loadCountryInfo(countryName);
                                return;
                            }
                            
                            // Always show country info
                            loadCountryInfo(countryName);
                        }
                    });
                }
            }).addTo(map);
            
            // Fit the map to show all European countries
            if (europeanCountries.length > 0) {
                map.fitBounds(europeLayer.getBounds(), { padding: [20, 20] });
            }
            
            console.log('Europe map loaded successfully');
        })
        .catch(error => {
            console.error('Error loading Europe data:', error);
            // Fallback to original source
            loadFallbackEuropeData();
        });
}

function loadFallbackEuropeData() {
    console.log('Loading fallback Europe data...');
    
    fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to load fallback map data');
            }
            return response.json();
        })
        .then(data => {
            console.log('Fallback GeoJSON loaded:', data);
            
            // Filter for European countries
            const europeanCountries = data.features.filter(feature => {
                const countryName = feature.properties.NAME || feature.properties.ADMIN || feature.properties.name || feature.properties.NAME_EN;
                return isEuropeanCountry(countryName);
            });
            
            console.log('European countries found:', europeanCountries.length);
            
            // Create GeoJSON layer with filtered data
            europeLayer = L.geoJSON({ type: 'FeatureCollection', features: europeanCountries }, {
                style: {
                    fillColor: '#95a5a6', // Gray for unowned countries
                    weight: 1.5,
                    opacity: 1,
                    color: '#2c3e50',
                    fillOpacity: 0.7
                },
                onEachFeature: function(feature, layer) {
                    const countryName = feature.properties.NAME || feature.properties.ADMIN || feature.properties.name || feature.properties.NAME_EN;
                    
                    layer.on({
                        mouseover: function(e) {
                            layer.getElement()?.style.setProperty('filter', 'brightness(0.85)');
                        },
                        mouseout: function(e) {
                            layer.getElement()?.style.removeProperty('filter');
                        },
                        click: function(e) {
                            if (isLoading) {
                                console.log('Game is still loading, please wait...');
                                return;
                            }
                            
                            if (!isCursorInVisibleBounds(e.latlng)) {
                                return;
                            }
                            
                            const countryName = feature.properties.NAME || feature.properties.ADMIN || feature.properties.name || feature.properties.NAME_EN;
                            console.log('Clicked country:', countryName, 'Game state:', gameData.state);
                            
                            if (gameData.state === 'waiting' && (!currentPlayerId || !gameData.players[currentPlayerId])) {
                                selectCountry(countryName);
                                loadCountryInfo(countryName);
                                return;
                            }
                            
                            if (gameData.state === 'waiting' && currentPlayerId && gameData.players[currentPlayerId]) {
                                changeSelectedCountry(countryName);
                                loadCountryInfo(countryName);
                                return;
                            }
                            
                            if (gameData.state === 'playing' && currentPlayerId && gameData.players[currentPlayerId]) {
                                loadCountryInfo(countryName);
                                return;
                            }
                            
                            loadCountryInfo(countryName);
                        }
                    });
                }
            }).addTo(map);
            
            if (europeanCountries.length > 0) {
                map.fitBounds(europeLayer.getBounds(), { padding: [20, 20] });
            }
            
            console.log('Fallback Europe map loaded successfully');
        })
        .catch(error => {
            console.error('Error loading fallback Europe data:', error);
            alert('Failed to load map data. Please refresh the page.');
        });
}

function selectCountry(countryName) {
    selectedCountry = countryName;
    
    console.log('Selected country:', countryName);
}

function changeSelectedCountry(countryName) {
    if (currentPlayerId && gameData.players[currentPlayerId]) {
        // Check if another player already selected this country
        const otherPlayerWithCountry = Object.values(gameData.players).find(
            player => player.id !== currentPlayerId && player.selectedCountry === countryName
        );
        
        if (otherPlayerWithCountry) {
            alert(`${countryName} is already selected by ${otherPlayerWithCountry.name}!`);
            return;
        }
        
        // Update player's selected country
        gameData.players[currentPlayerId].selectedCountry = countryName;
        
        // Mark as not ready when changing country
        gameData.players[currentPlayerId].isReady = false;
        
        // Broadcast country selection to all peers
        broadcastPlayerAction('country_selected', {
            countryName: countryName
        });
        
        updateGameStateUI();
        updateProvinceDisplay();
        saveRoomData();
        
        console.log('Changed country to:', countryName);
    }
}

// Check if cursor is within visible European bounds
function isCursorInVisibleBounds(latlng) {
    const bounds = map.getBounds();
    return bounds.contains(latlng);
}

// European countries list
function isEuropeanCountry(countryName) {
    const europeanCountries = [
        'Albania', 'Austria', 'Belarus', 'Belgium', 'Bosnia and Herzegovina',
        'Bulgaria', 'Croatia', 'Cyprus', 'Czechia', 'Czech Republic', 'Denmark', 'Estonia',
        'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Ireland',
        'Italy', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta', 'Moldova', 'Republic of Moldova',
        'Montenegro', 'Netherlands', 'North Macedonia', 'Macedonia', 'FYR Macedonia', 'Norway', 'Poland', 'Portugal',
        'Romania', 'Serbia', 'Slovakia', 'Slovenia', 'Spain', 'Sweden',
        'Switzerland', 'Ukraine', 'United Kingdom', 'Russia'
    ];
    
    return europeanCountries.some(country => 
        countryName && (
            countryName.toLowerCase().includes(country.toLowerCase()) ||
            country.toLowerCase().includes(countryName.toLowerCase())
        )
    );
}

// Get flag emoji for country
function getCountryFlagEmoji(countryName) {
    const flagEmojis = {
        'Albania': '🇦🇱',
        'Austria': '🇦🇹',
        'Belarus': '🇧🇾',
        'Belgium': '🇧🇪',
        'Bosnia and Herzegovina': '🇧🇦',
        'Bulgaria': '🇧🇬',
        'Croatia': '🇭🇷',
        'Cyprus': '🇨🇾',
        'Czechia': '🇨🇿',
        'Czech Republic': '🇨🇿',
        'Denmark': '🇩🇰',
        'Estonia': '🇪🇪',
        'Finland': '🇫🇮',
        'France': '🇫🇷',
        'Germany': '🇩🇪',
        'Greece': '🇬🇷',
        'Hungary': '🇭🇺',
        'Ireland': '🇮🇪',
        'Italy': '🇮🇹',
        'Latvia': '🇱🇻',
        'Lithuania': '🇱🇹',
        'Luxembourg': '🇱🇺',
        'Malta': '🇲🇹',
        'Moldova': '🇲🇩',
        'Republic of Moldova': '🇲🇩',
        'Montenegro': '🇲🇪',
        'Netherlands': '🇳🇱',
        'North Macedonia': '🇲🇰',
        'Macedonia': '🇲🇰',
        'FYR Macedonia': '🇲🇰',
        'Norway': '🇳🇴',
        'Poland': '🇵🇱',
        'Portugal': '🇵🇹',
        'Romania': '🇷🇴',
        'Serbia': '🇷🇸',
        'Slovakia': '🇸🇰',
        'Slovenia': '🇸🇮',
        'Spain': '🇪🇸',
        'Sweden': '🇸🇪',
        'Switzerland': '🇨🇭',
        'Ukraine': '🇺🇦',
        'United Kingdom': '🇬🇧',
        'Russia': '🇷🇺'
    };
    
    return flagEmojis[countryName] || '🏳️';
}

// GDP data for European countries (in billions USD, 2023 estimates)
function getCountryGDP(countryName) {
    const gdp = gdpData[countryName];
    if (!gdp && gdp !== 0) return 'Data not available';
    
    return `$${gdp.toFixed(1)}B`;
}

// Normalize country names for display
function normalizeDisplayName(countryName) {
    const displayMappings = {
        'Czech Republic': 'Czechia',
        'Republic of Moldova': 'Moldova',
        'Macedonia': 'North Macedonia',
        'FYR Macedonia': 'North Macedonia',
        'The former Yugoslav Republic of Macedonia': 'North Macedonia'
    };
    
    return displayMappings[countryName] || countryName;
}

// Normalize country names for API calls
function normalizeCountryName(countryName) {
    const countryMappings = {
        // Map display names to API-friendly names
        'Czechia': 'Czech Republic',
        'Czech Republic': 'Czech Republic',
        'Moldova': 'Moldova',
        'Republic of Moldova': 'Moldova',
        'Netherlands': 'Netherlands',
        'Holland': 'Netherlands',
        'North Macedonia': 'North Macedonia',
        'Macedonia': 'North Macedonia',
        'The former Yugoslav Republic of Macedonia': 'North Macedonia',
        'FYR Macedonia': 'North Macedonia'
    };
    
    return countryMappings[countryName] || countryName;
}

// Country information functionality
function loadCountryInfo(countryName) {
    const panel = document.getElementById('country-info-panel');
    const panelBody = document.getElementById('panel-body');
    
    // Track currently displayed country
    currentlyDisplayedCountry = countryName;
    
    // Show panel
    panel.classList.add('active');
    
    // Update status bar when viewing country info
    updatePlayerStatusBar();
    
    // Show loading state
    panelBody.innerHTML = '<div class="loading">Loading country information...</div>';
    
    // Normalize the country name for API call
    const normalizedName = normalizeCountryName(countryName);
    
    // Fetch country data from REST Countries API
    fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(normalizedName)}?fullText=true`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Country not found');
            }
            return response.json();
        })
        .then(data => {
            if (data && data.length > 0) {
                const country = data[0];
                const displayName = normalizeDisplayName(countryName);
                displayCountryInfo(country, displayName);
            } else {
                throw new Error('No country data found');
            }
        })
        .catch(error => {
            console.error('Error fetching country info with fullText=true:', error);
            // Try with partial matching as fallback
            return fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(normalizedName)}?fullText=false`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Country not found in fallback');
                    }
                    return response.json();
                })
                .then(data => {
                    if (data && data.length > 0) {
                        // For partial matches, try to find the exact match
                        const exactMatch = data.find(country => 
                            country.name.common.toLowerCase() === normalizedName.toLowerCase() ||
                            country.name.official.toLowerCase() === normalizedName.toLowerCase()
                        );
                        if (exactMatch) {
                            const displayName = normalizeDisplayName(countryName);
                            displayCountryInfo(exactMatch, displayName);
                        } else {
                            // Use first result if no exact match found
                            const displayName = normalizeDisplayName(countryName);
                            displayCountryInfo(data[0], displayName);
                        }
                    } else {
                        throw new Error('No country data found in fallback');
                    }
                });
        })
        .catch(error => {
            console.error('Error fetching country info:', error);
            panelBody.innerHTML = `
                <div class="error">
                    <p>Could not load information for ${countryName}</p>
                    <p>This might be due to different naming conventions in our map data.</p>
                </div>
            `;
        });
}

function displayCountryInfo(country, displayName) {
    const panelBody = document.getElementById('panel-body');
    
    // Get owner information (only during gameplay)
    let ownerInfo = '';
    if (gameData.state === 'playing' && gameData.provinces[displayName]) {
        const ownerId = gameData.provinces[displayName];
        const owner = gameData.players[ownerId];
        if (owner) {
            ownerInfo = `
                <div class="detail-item player-owner">
                    <span class="detail-label" data-icon="owner">Owned by:</span>
                    <span class="detail-value" style="color: ${owner.color}">${owner.name}</span>
                </div>
            `;
        }
    }
    
    // Get economy information
    const economyValue = getCountryGDP(displayName);
    
    // Add attack button during gameplay
    let attackButton = '';
    if (gameData.state === 'playing' && currentPlayerId && gameData.players[currentPlayerId]) {
        const player = gameData.players[currentPlayerId];
        const isOwnedBySelf = gameData.provinces[displayName] === currentPlayerId;
        
        if (!isOwnedBySelf) {
            // Create attack buttons for different attack types
            const attackButtons = ATTACK_TYPES.map(attackType => {
                const canAfford = calculatePlayerStats(currentPlayerId).economy >= attackType.cost;
                const buttonClass = canAfford ? 'attack-btn' : 'attack-btn attack-btn-disabled';
                
                return `
                    <button class="${buttonClass}" onclick="attackCountry('${displayName}', ${ATTACK_TYPES.indexOf(attackType)})" ${canAfford ? '' : 'disabled'}>
                        ${attackType.emoji} ${attackType.name}<br>
                        <small>Cost: $${attackType.cost}B | ${(attackType.baseChance * 100)}% base chance</small>
                    </button>
                `;
            }).join('');
            
            attackButton = `
                <div class="country-actions" style="margin-top: 15px;">
                    <div class="attack-buttons">
                        ${attackButtons}
                    </div>
                </div>
            `;
        } else {
            // Show fort upgrade button for owned countries
            const currentFortLevel = countryFortLevels[displayName] || 0;
            const canUpgradeFort = calculatePlayerStats(currentPlayerId).economy >= FORT_UPGRADE_COST && currentFortLevel < MAX_FORT_LEVEL;
            const fortButtonClass = canUpgradeFort ? 'fort-btn' : 'fort-btn fort-btn-disabled';
            
            attackButton = `
                <div class="country-actions" style="margin-top: 15px;">
                    <div class="fort-info">
                        <strong>🏰 Fort Level: ${currentFortLevel}</strong><br>
                        <small>Defense: -${(currentFortLevel * FORT_DEFENSE_PER_LEVEL * 100).toFixed(1)}% attack chance</small>
                    </div>
                    <button class="${fortButtonClass}" onclick="upgradeFort('${displayName}')" ${canUpgradeFort ? '' : 'disabled'}>
                        🏗️ Upgrade Fort<br>
                        <small>Cost: $${FORT_UPGRADE_COST}B | Level ${currentFortLevel + 1}</small>
                    </button>
                </div>
            `;
        }
    }
    
    panelBody.innerHTML = `
        <div class="country-info">
            ${country.flags && country.flags.svg ? `<img src="${country.flags.svg}" alt="${country.name.common} flag" class="country-flag">` : ''}
            <h2 class="country-name">${displayName}</h2>
            
            <div class="country-details">
                <div class="detail-item">
                    <span class="detail-label" data-icon="gdp">Economy:</span>
                    <span class="detail-value">${economyValue}</span>
                </div>
                
                <div class="detail-item">
                    <span class="detail-label" data-icon="fort">🏰 Fort Level:</span>
                    <span class="detail-value">${countryFortLevels[displayName] || 0}</span>
                    <span class="detail-sub">(-${((countryFortLevels[displayName] || 0) * FORT_DEFENSE_PER_LEVEL * 100).toFixed(1)}% attack chance)</span>
                </div>
                
                ${ownerInfo}
            </div>
            
            ${attackButton}
        </div>
    `;
}

// Update only the dynamic parts of country info without reloading
function updateCountryInfoDynamic(countryName) {
    const panel = document.getElementById('country-info-panel');
    const panelBody = document.getElementById('panel-body');
    
    // Only update if the panel is active and showing the same country
    if (!panel.classList.contains('active') || currentlyDisplayedCountry !== countryName) {
        return;
    }
    
    // Find and update dynamic elements
    const countryInfo = panelBody.querySelector('.country-info');
    if (!countryInfo) return;
    
    // Update owner information
    const ownerElement = countryInfo.querySelector('.player-owner');
    if (gameData.state === 'playing' && gameData.provinces[countryName]) {
        const ownerId = gameData.provinces[countryName];
        const owner = gameData.players[ownerId];
        if (owner) {
            if (ownerElement) {
                ownerElement.querySelector('.detail-value').textContent = owner.name;
                ownerElement.querySelector('.detail-value').style.color = owner.color;
            } else {
                // Add owner info if it doesn't exist
                const ownerDiv = document.createElement('div');
                ownerDiv.className = 'detail-item player-owner';
                ownerDiv.innerHTML = `
                    <span class="detail-label" data-icon="owner">Owned by:</span>
                    <span class="detail-value" style="color: ${owner.color}">${owner.name}</span>
                `;
                countryInfo.querySelector('.country-details').appendChild(ownerDiv);
            }
        }
    } else if (ownerElement) {
        // Remove owner info if no longer owned
        ownerElement.remove();
    }
    
    // Update attack buttons and fort info
    const actionsDiv = countryInfo.querySelector('.country-actions');
    if (gameData.state === 'playing' && currentPlayerId && gameData.players[currentPlayerId]) {
        const isOwnedBySelf = gameData.provinces[countryName] === currentPlayerId;
        
        if (!isOwnedBySelf) {
            // Update attack buttons
            const attackButtons = ATTACK_TYPES.map(attackType => {
                const canAfford = calculatePlayerStats(currentPlayerId).economy >= attackType.cost;
                const buttonClass = canAfford ? 'attack-btn' : 'attack-btn attack-btn-disabled';
                
                return `
                    <button class="${buttonClass}" onclick="attackCountry('${countryName}', ${ATTACK_TYPES.indexOf(attackType)})" ${canAfford ? '' : 'disabled'}>
                        ${attackType.emoji} ${attackType.name}<br>
                        <small>Cost: $${attackType.cost}B | ${(attackType.baseChance * 100)}% base chance</small>
                    </button>
                `;
            }).join('');
            
            if (actionsDiv) {
                actionsDiv.innerHTML = `<div class="attack-buttons">${attackButtons}</div>`;
            }
        } else {
            // Update fort upgrade button
            const currentFortLevel = countryFortLevels[countryName] || 0;
            const canUpgradeFort = calculatePlayerStats(currentPlayerId).economy >= FORT_UPGRADE_COST && currentFortLevel < MAX_FORT_LEVEL;
            const fortButtonClass = canUpgradeFort ? 'fort-btn' : 'fort-btn fort-btn-disabled';
            
            if (actionsDiv) {
                actionsDiv.innerHTML = `
                    <div class="fort-info">
                        <strong>🏰 Fort Level: ${currentFortLevel}</strong><br>
                        <small>Defense: -${(currentFortLevel * FORT_DEFENSE_PER_LEVEL * 100).toFixed(1)}% attack chance</small>
                    </div>
                    <button class="${fortButtonClass}" onclick="upgradeFort('${countryName}')" ${canUpgradeFort ? '' : 'disabled'}>
                        🏗️ Upgrade Fort<br>
                        <small>Cost: $${FORT_UPGRADE_COST}B | Level ${currentFortLevel + 1}</small>
                    </button>
                `;
            }
            
            // Also update fort level in the details section
            const fortLevelElement = countryInfo.querySelector('.detail-item:nth-child(2) .detail-value');
            const fortDefenseElement = countryInfo.querySelector('.detail-item:nth-child(2) .detail-sub');
            if (fortLevelElement) {
                fortLevelElement.textContent = currentFortLevel;
            }
            if (fortDefenseElement) {
                fortDefenseElement.textContent = `(-${(currentFortLevel * FORT_DEFENSE_PER_LEVEL * 100).toFixed(1)}% attack chance)`;
            }
        }
    }
}

// Attack functionality
function attackCountry(countryName, attackTypeIndex = 1) {
    if (!currentPlayerId || gameData.state !== 'playing') {
        console.log('Cannot attack: not in game or not playing');
        return;
    }
    
    const player = gameData.players[currentPlayerId];
    if (!player) {
        console.log('Cannot attack: player not found');
        return;
    }
    
    const attackType = ATTACK_TYPES[attackTypeIndex];
    const attackerStats = calculatePlayerStats(currentPlayerId);
    
    // Check if player has enough economy
    if (attackerStats.economy < attackType.cost) {
        alert(`Not enough economy! You need $${attackType.cost}B to use ${attackType.name}. You have $${attackerStats.economy.toFixed(1)}B.`);
        return;
    }
    
    // Check if country is already owned by this player
    if (gameData.provinces[countryName] === currentPlayerId) {
        alert('You already own this country!');
        return;
    }
    
    // Deduct attack cost from stored economy
    const costInStoredEconomy = attackType.cost;
    player.economy = (player.economy || 0) - costInStoredEconomy;
    
    // Calculate success chance
    const baseChance = attackType.baseChance;
    const fortLevel = countryFortLevels[countryName] || 0;
    const fortDefense = fortLevel * FORT_DEFENSE_PER_LEVEL;
    const finalChance = Math.max(0.05, baseChance - fortDefense); // Minimum 5% chance
    
    const success = Math.random() < finalChance;
    
    // Get defender info
    const defendingPlayer = gameData.provinces[countryName];
    let defenderEconomy = 0;
    if (defendingPlayer) {
        const defenderStats = calculatePlayerStats(defendingPlayer);
        defenderEconomy = defenderStats.economy;
    } else {
        defenderEconomy = gdpData[countryName] || 100;
    }
    
    // Show stylized popup
    showAttackResult(success, countryName, attackerStats.economy, defenderEconomy, baseChance, finalChance, defendingPlayer, attackType, fortLevel);
    
    if (success) {
        // Remove previous owner if any
        const previousOwner = gameData.provinces[countryName];
        if (previousOwner) {
            console.log(`${countryName} taken from ${gameData.players[previousOwner]?.name || 'unknown player'}`);
        }
        
        // Assign country to attacking player
        gameData.provinces[countryName] = currentPlayerId;
        console.log(`${player.name} successfully conquered ${countryName}`);
    } else {
        console.log(`${player.name} failed to conquer ${countryName}`);
    }
    
    // Broadcast attack action to all peers
    broadcastPlayerAction('attack_country', {
        attackerId: currentPlayerId,
        countryName: countryName,
        attackTypeIndex: attackTypeIndex,
        success: success,
        newEconomy: player.economy
    });
    
    // Update UI and save state
    updateGameStateUI();
    updatePlayerStatusBar();
    saveRoomData();
    
    // Update the country info panel dynamically to show new owner
    updateCountryInfoDynamic(countryName);
}

// Upgrade fort level for a country
function upgradeFort(countryName) {
    if (!currentPlayerId || gameData.state !== 'playing') {
        return;
    }
    
    const player = gameData.players[currentPlayerId];
    if (!player) return;
    
    // Check if player owns this country
    if (gameData.provinces[countryName] !== currentPlayerId) {
        alert('You can only upgrade forts in countries you own!');
        return;
    }
    
    const currentFortLevel = countryFortLevels[countryName] || 0;
    const attackerStats = calculatePlayerStats(currentPlayerId);
    
    // Check if fort is at max level
    if (currentFortLevel >= MAX_FORT_LEVEL) {
        alert('Fort is already at maximum level!');
        return;
    }
    
    // Check if player has enough economy
    if (attackerStats.economy < FORT_UPGRADE_COST) {
        alert(`Not enough economy! You need $${FORT_UPGRADE_COST}B to upgrade fort. You have $${attackerStats.economy.toFixed(1)}B.`);
        return;
    }
    
    // Deduct cost and upgrade fort
    player.economy = (player.economy || 0) - FORT_UPGRADE_COST;
    countryFortLevels[countryName] = currentFortLevel + 1;
    
    // Broadcast fort upgrade to all peers
    broadcastPlayerAction('upgrade_fort', {
        playerId: currentPlayerId,
        countryName: countryName,
        newFortLevel: countryFortLevels[countryName],
        newEconomy: player.economy
    });
    
    // Update UI
    updatePlayerStatusBar();
    saveRoomData();
    updateCountryInfoDynamic(countryName);
    
    console.log(`${player.name} upgraded fort in ${countryName} to level ${countryFortLevels[countryName]}`);
}

// Show stylized attack result popup
function showAttackResult(success, countryName, attackerEconomy, defenderEconomy, baseChance, finalChance, defendingPlayer, attackType, fortLevel) {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'attack-popup-overlay';
    
    // Create popup
    const popup = document.createElement('div');
    popup.className = 'attack-popup';
    
    // Get defender name
    const defenderName = defendingPlayer ? 
        (gameData.players[defendingPlayer]?.name || 'Unknown Player') : 
        'Unoccupied Territory';
    
    const fortDefense = fortLevel * FORT_DEFENSE_PER_LEVEL * 100;
    
    popup.innerHTML = `
        <div class="attack-popup-icon">${success ? '🎉' : '💥'}</div>
        <div class="attack-popup-title">${success ? 'Victory!' : 'Defeat!'}</div>
        <div class="attack-popup-message">
            ${success ? 
                `You successfully conquered <strong>${countryName}</strong> using ${attackType.name}!` : 
                `<strong>${countryName}</strong> defended against your ${attackType.name}!`
            }
        </div>
        <div class="attack-popup-stats">
            <div><strong>Attack Type:</strong> ${attackType.emoji} ${attackType.name} (Cost: $${attackType.cost}B)</div>
            <div><strong>Base Success:</strong> ${(baseChance * 100).toFixed(1)}%</div>
            <div><strong>Fort Defense:</strong> 🏰 Level ${fortLevel} (-${fortDefense.toFixed(1)}%)</div>
            <div><strong>Final Chance:</strong> ${(finalChance * 100).toFixed(1)}%</div>
            <div><strong>Defender:</strong> ${defenderName} - $${defenderEconomy.toFixed(1)}B</div>
        </div>
        <button class="attack-popup-close">Continue</button>
    `;
    
    // Add to DOM
    document.body.appendChild(overlay);
    document.body.appendChild(popup);
    
    // Show with animation
    setTimeout(() => {
        overlay.classList.add('show');
        popup.classList.add('show');
    }, 10);
    
    // Close popup function
    function closePopup() {
        overlay.classList.remove('show');
        popup.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(overlay);
            document.body.removeChild(popup);
        }, 300);
    }
    
    // Add event listeners
    popup.querySelector('.attack-popup-close').addEventListener('click', closePopup);
    overlay.addEventListener('click', closePopup);
    
    // Auto-close after 5 seconds
    setTimeout(closePopup, 5000);
}

// Economy Growth Timer
function startEconomyGrowthTimer() {
    // Clear existing timer
    if (window.economyTimer) {
        clearInterval(window.economyTimer);
    }
    
    // Start economy growth timer (players gain 2% of total provinces GDP every 5 seconds)
    window.economyTimer = setInterval(() => {
        // Update player economies (gain 2% of total owned provinces GDP)
        Object.keys(gameData.players).forEach(playerId => {
            const player = gameData.players[playerId];
            
            // Calculate total GDP from owned provinces
            let totalProvincesGDP = 0;
            Object.keys(gameData.provinces).forEach(provinceName => {
                if (gameData.provinces[provinceName] === playerId) {
                    const gdp = gdpData[provinceName];
                    if (gdp) {
                        totalProvincesGDP += gdp;
                    }
                }
            });
            
            // Calculate 2% growth on total provinces GDP
            const growthAmount = totalProvincesGDP * 0.02;
            
            // Add growth to player's stored economy
            const oldStoredEconomy = player.economy || 0;
            player.economy = oldStoredEconomy + growthAmount;
            
            if (growthAmount > 0) {
                console.log(`Player ${player.name} gained $${growthAmount.toFixed(1)}B from provinces (total stored: $${player.economy.toFixed(1)}B)`);
            }
        });
        
        if (roomCode) {
            saveRoomData();
        }
        updatePlayerStatusBar();
        
        // Update country info panel dynamically if one is currently displayed
        if (currentlyDisplayedCountry) {
            updateCountryInfoDynamic(currentlyDisplayedCountry);
        }
    }, 5000);
}

// Player Status Bar Functions
function updatePlayerStatusBar() {
    const statusBar = document.getElementById('player-status-bar');
    const economyElement = document.getElementById('player-economy');
    const powerElement = document.getElementById('player-power');
    
    if (!currentPlayerId || !roomCode) {
        statusBar.style.display = 'none';
        return;
    }
    
    // Calculate player's total economy and power
    const playerStats = calculatePlayerStats(currentPlayerId);
    
    economyElement.textContent = `$${playerStats.economy.toFixed(1)}B`;
    powerElement.textContent = playerStats.power;
    
    statusBar.style.display = 'flex';
}

function calculatePlayerStats(playerId) {
    const player = gameData.players[playerId];
    
    // Ensure player has power and economy values (default if not set)
    if (player && player.power === undefined) {
        player.power = 10;
    }
    if (player && player.economy === undefined) {
        player.economy = 0;
    }
    
    // Player's economy is now completely separate from country GDP
    // It's their stored wealth that grows based on provinces they own
    const playerEconomy = player ? (player.economy || 0) : 0;
    
    return {
        economy: playerEconomy,
        power: player ? (player.power || 10) : 10
    };
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Initialize fort levels
    initializeFortLevels();
    
    // Initialize map
    initMap();
    
    // Set up event listeners
    setupEventListeners();
    
    // Complete loading
    setLoadingComplete();
});

function setupEventListeners() {
    // Close panel button
    const closeBtn = document.querySelector('.close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            const panel = document.getElementById('country-info-panel');
            panel.classList.remove('active');
            currentlyDisplayedCountry = null; // Clear tracked country when panel closes
        });
    }
    
    // Quick Play button
    const quickPlayBtn = document.getElementById('quick-play-btn');
    if (quickPlayBtn) {
        quickPlayBtn.addEventListener('click', function() {
            quickPlay();
        });
    }
    
    // Create room button
    const createRoomBtn = document.getElementById('create-room-btn');
    if (createRoomBtn) {
        createRoomBtn.addEventListener('click', function() {
            createRoom();
        });
    }
    
    // Join room button
    const joinRoomBtn = document.getElementById('join-room-btn');
    if (joinRoomBtn) {
        joinRoomBtn.addEventListener('click', function() {
            const roomCodeInput = document.getElementById('room-code-input');
            const code = roomCodeInput.value.trim();
            if (code) {
                joinRoom(code);
            }
        });
    }
    
    // Start game button (host only)
    const startGameBtn = document.getElementById('start-game-btn');
    if (startGameBtn) {
        startGameBtn.addEventListener('click', function() {
            const players = Object.values(gameData.players);
            const readyPlayers = players.filter(p => p.isReady);
            const allReady = players.length >= 1 && readyPlayers.length === players.length;
            
            if (isHost && allReady) {
                startCountdown();
            }
        });
    }
    
    // Update start game button visibility based on host status and player count
    const updateStartGameButton = () => {
        const startGameBtn = document.getElementById('start-game-btn');
        if (startGameBtn) {
            const players = Object.values(gameData.players);
            const readyPlayers = players.filter(p => p.isReady);
            const allReady = players.length >= 1 && readyPlayers.length === players.length;
            
            if (isHost && gameData.state === 'waiting') {
                startGameBtn.style.display = 'block';
                if (allReady) {
                    startGameBtn.textContent = `Start Game (${players.length} player${players.length > 1 ? 's' : ''} ready)`;
                    startGameBtn.disabled = false;
                    startGameBtn.style.opacity = '1';
                    startGameBtn.style.cursor = 'pointer';
                } else {
                    startGameBtn.textContent = `Waiting for ready (${readyPlayers.length}/${players.length})`;
                    startGameBtn.disabled = true;
                    startGameBtn.style.opacity = '0.5';
                    startGameBtn.style.cursor = 'not-allowed';
                }
            } else if (!isHost && gameData.state === 'waiting' && players.length > 0) {
                // Show grayed out button for non-hosts
                startGameBtn.style.display = 'block';
                startGameBtn.textContent = 'Only host can start';
                startGameBtn.disabled = true;
                startGameBtn.style.opacity = '0.3';
                startGameBtn.style.cursor = 'not-allowed';
            } else {
                startGameBtn.style.display = 'none';
                startGameBtn.disabled = false;
                startGameBtn.style.opacity = '1';
                startGameBtn.style.cursor = 'pointer';
            }
        }
    };
    
    // Call this whenever game state updates
    window.updateStartGameButton = updateStartGameButton;
    
    // Ready button
    const readyBtn = document.getElementById('ready-btn');
    if (readyBtn) {
        readyBtn.addEventListener('click', function() {
            if (currentPlayerId && gameData.players[currentPlayerId]) {
                const player = gameData.players[currentPlayerId];
                
                // Require country selection to ready up
                if (!player.selectedCountry) {
                    alert('You must select a country before readying up!');
                    return;
                }
                
                player.isReady = !player.isReady;
                
                // Broadcast ready status to all peers
                broadcastPlayerAction('player_ready', {
                    isReady: player.isReady
                });
                
                updateGameStateUI();
                saveRoomData();
            }
        });
    }
    
    // Exit room button
    const exitBtn = document.getElementById('exit-btn');
    if (exitBtn) {
        exitBtn.addEventListener('click', function() {
            if (currentPlayerId && confirm('Are you sure you want to exit the room?')) {
                exitGame();
            }
        });
    }
}