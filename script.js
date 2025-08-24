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

// Simple signaling server (you can replace with your own)
const SIGNALING_SERVER = 'wss://signaling-server-example.herokuapp.com';
let signalingSocket = null;

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

// P2P Room Management
function createRoom() {
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
    
    updateRoomUI();
    updateGameStateUI();
    
    // Start economy growth timer
    startEconomyGrowthTimer();
    
    console.log('Created room:', roomCode);
}

function joinRoom(code) {
    if (!currentPlayerId) {
        currentPlayerId = generatePlayerId();
    }
    
    roomCode = code.toUpperCase();
    
    // Check if room exists and player limit
    const roomKey = `europe_room_${roomCode}`;
    const roomData = localStorage.getItem(roomKey);
    if (roomData) {
        const room = JSON.parse(roomData);
        if (Object.keys(room.players).length >= MAX_PLAYERS) {
            alert(`Room is full! Maximum ${MAX_PLAYERS} players allowed.`);
            return;
        }
    }
    
    isHost = false;
    
    // For simplicity, we'll use localStorage as a basic signaling mechanism
    // In a real implementation, you'd use a proper signaling server
    initSimpleP2P();
    
    console.log('Joining room:', roomCode);
}

// Simplified P2P using localStorage for demo (works only on same computer/browser)
// In production, you'd use WebRTC with a proper signaling server
function initSimpleP2P() {
    const roomKey = `europe_room_${roomCode}`;
    
    // Listen for room updates
    const checkRoom = () => {
        const roomData = localStorage.getItem(roomKey);
        if (roomData) {
            try {
                const room = JSON.parse(roomData);
                if (room.gameData) {
                    // Join the existing game
                    gameData = room.gameData;
                    
                    // Ensure all existing players have power and economy (for backward compatibility)
                    Object.values(gameData.players).forEach(player => {
                        if (player.power === undefined) {
                            player.power = 10;
                        }
                        if (player.economy === undefined) {
                            player.economy = 0;
                        }
                    });
                    
                    // Add ourselves if not already in
                    if (!gameData.players[currentPlayerId]) {
                        const usedColors = Object.values(gameData.players).map(p => p.color);
                        const availableColors = PLAYER_COLORS.filter(c => !usedColors.includes(c));
                        const randomColor = availableColors[Math.floor(Math.random() * availableColors.length)] || PLAYER_COLORS[0];
                        
                        gameData.players[currentPlayerId] = {
                            id: currentPlayerId,
                            name: `Player ${currentPlayerId.slice(-4)}`,
                            color: randomColor,
                            selectedCountry: selectedCountry,
                            isHost: false,
                            isReady: false,
                            power: 10,
                            economy: 0
                        };
                        
                        // Update the room
                        saveRoomData();
                    }
                    
                    updateGameStateUI();
                    
                    // Start economy growth timer
                    startEconomyGrowthTimer();
                }
            } catch (error) {
                console.error('Error parsing room data:', error);
            }
        }
    };
    
    // Check immediately and then periodically
    checkRoom();
    setInterval(checkRoom, 1000);
    
    // Listen for storage changes (real-time sync)
    window.addEventListener('storage', (e) => {
        if (e.key === roomKey && e.newValue) {
            try {
                const room = JSON.parse(e.newValue);
                if (room.gameData) {
                    gameData = room.gameData;
                    updateGameStateUI();
                }
            } catch (error) {
                console.error('Error syncing room data:', error);
            }
        }
    });
}

function saveRoomData() {
    if (!roomCode) return;
    
    const roomKey = `europe_room_${roomCode}`;
    const roomData = {
        gameData: gameData,
        lastUpdate: Date.now()
    };
    
    localStorage.setItem(roomKey, JSON.stringify(roomData));
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
    const joinRoomSection = document.querySelector('.join-room-section');
    
    switch (gameData.state) {
        case 'waiting':
            timerDiv.classList.add('hidden');
            countdownDiv.classList.add('hidden');
            
            if (currentPlayerId && gameData.players[currentPlayerId]) {
                // Player is in the room - show lobby controls and player list, hide join options
                lobbySection.style.display = 'block';
                gameControls.style.display = 'block';
                if (roomControls) roomControls.style.display = 'block';
                if (playerList) playerList.style.display = 'block';
                if (createRoomBtn) createRoomBtn.style.display = 'none';
                if (joinRoomSection) joinRoomSection.style.display = 'none';
                
                // Update lobby display
                updateLobbyDisplay();
            } else if (roomCode) {
                // In a room but not joined yet - hide everything except room controls
                lobbySection.style.display = 'none';
                gameControls.style.display = 'none';
                if (roomControls) roomControls.style.display = 'block';
                if (playerList) playerList.style.display = 'none';
                if (createRoomBtn) createRoomBtn.style.display = 'none';
                if (joinRoomSection) joinRoomSection.style.display = 'none';
            } else {
                // Not in any room - show room creation/joining options
                lobbySection.style.display = 'none';
                gameControls.style.display = 'none';
                if (roomControls) roomControls.style.display = 'block';
                if (playerList) playerList.style.display = 'none';
                if (createRoomBtn) createRoomBtn.style.display = 'block';
                if (joinRoomSection) joinRoomSection.style.display = 'flex';
            }
            break;
            
        case 'countdown':
            timerDiv.classList.add('hidden');
            countdownDiv.classList.remove('hidden');
            countdownDiv.textContent = `Game starts in: ${gameData.countdown}`;
            lobbySection.style.display = 'none';
            gameControls.style.display = 'block';
            if (roomControls) roomControls.style.display = 'none';
            if (playerList) playerList.style.display = 'block';
            if (createRoomBtn) createRoomBtn.style.display = 'none';
            if (joinRoomSection) joinRoomSection.style.display = 'none';
            break;
            
        case 'playing':
            countdownDiv.classList.add('hidden');
            timerDiv.classList.remove('hidden');
            updateGameTimer();
            lobbySection.style.display = 'none';
            gameControls.style.display = 'block';
            if (roomControls) roomControls.style.display = 'none';
            if (playerList) playerList.style.display = 'block';
            if (createRoomBtn) createRoomBtn.style.display = 'none';
            if (joinRoomSection) joinRoomSection.style.display = 'none';
            break;
            
        case 'ended':
            timerDiv.classList.add('hidden');
            countdownDiv.classList.add('hidden');
            joinSection.style.display = 'none';
            lobbySection.style.display = 'none';
            gameControls.style.display = 'block';
            if (roomControls) roomControls.style.display = 'block';
            if (playerList) playerList.style.display = 'block';
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
    
    const count = Object.keys(gameData.players).length;
    playerCountDiv.textContent = `Players: ${count} | Room: ${roomCode}`;
}

function updateProvinceDisplay() {
    if (!europeLayer) return;
    
    europeLayer.eachLayer((layer) => {
        const feature = layer.feature;
        if (feature && feature.properties) {
            const countryName = feature.properties.NAME || feature.properties.ADMIN || feature.properties.name || feature.properties.NAME_EN;
            
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
    
    // Auto-assign selected countries as starting provinces
    Object.values(gameData.players).forEach(player => {
        if (player.selectedCountry) {
            gameData.provinces[player.selectedCountry] = player.id;
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
        
        // If host is leaving, shut down the entire room
        if (wasHost) {
            // Clear localStorage for this room
            if (roomCode) {
                localStorage.removeItem(`room_${roomCode}`);
            }
        } else {
            // Save updated game data without this player
            saveRoomData();
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
                            
                            const countryName = feature.properties.NAME || feature.properties.ADMIN || feature.properties.name || feature.properties.NAME_EN;
                            console.log('Clicked country:', countryName, 'Game state:', gameData.state);
                            
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
        
        updateGameStateUI();
        updateProvinceDisplay();
        
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
    
    // Update UI and save state
    updateGameStateUI();
    updatePlayerStatusBar();
    saveRoomData();
    
    // Refresh the country info panel to show new owner
    loadCountryInfo(countryName);
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
    
    // Update UI
    updatePlayerStatusBar();
    saveRoomData();
    loadCountryInfo(countryName);
    
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
    
    // Start economy growth timer (+2% every 5 seconds for all players)
    window.economyTimer = setInterval(() => {
        // First, grow the base GDP of all countries by 2%
        Object.keys(gdpData).forEach(countryName => {
            gdpData[countryName] = gdpData[countryName] * 1.02;
        });
        
        // Then update player economies (their stored growth portion)
        Object.keys(gameData.players).forEach(playerId => {
            const player = gameData.players[playerId];
            
            // Calculate current total economy (base GDP from provinces + stored growth)
            let currentTotalEconomy = player.economy || 0;
            
            // Add base GDP from owned provinces
            Object.keys(gameData.provinces).forEach(provinceName => {
                if (gameData.provinces[provinceName] === playerId) {
                    const gdp = gdpData[provinceName];
                    if (gdp) {
                        currentTotalEconomy += gdp;
                    }
                }
            });
            
            // Calculate 2% growth on total economy
            const growthAmount = currentTotalEconomy * 0.02;
            
            // Add growth to stored economy (this preserves the base GDP while adding growth)
            const oldStoredEconomy = player.economy || 0;
            player.economy = oldStoredEconomy + growthAmount;
            
            console.log(`Player ${player.name} economy grew by ${growthAmount.toFixed(1)} (total: ${(currentTotalEconomy + growthAmount).toFixed(1)})`);
        });
        
        if (roomCode) {
            saveRoomData();
        }
        updatePlayerStatusBar();
        
        // Refresh country info panel if one is currently displayed
        if (currentlyDisplayedCountry) {
            loadCountryInfo(currentlyDisplayedCountry);
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
    
    // Calculate total economy: base GDP from provinces + growth
    let totalEconomy = player ? (player.economy || 0) : 0;
    
    // Add base GDP from owned provinces
    Object.keys(gameData.provinces).forEach(provinceName => {
        if (gameData.provinces[provinceName] === playerId) {
            const gdp = gdpData[provinceName];
            if (gdp) {
                totalEconomy += gdp;
            }
        }
    });
    
    return {
        economy: totalEconomy,
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
                updateGameStateUI();
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