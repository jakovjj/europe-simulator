// Development utilities for testing P2P functionality

window.DevUtils = {
    // Simulate multiple players for testing
    simulatePlayer: function(name, countryName) {
        const playerId = 'sim_' + Math.random().toString(36).substr(2, 9);
        const color = PLAYER_COLORS[Object.keys(gameData.players).length % PLAYER_COLORS.length];
        
        gameData.players[playerId] = {
            id: playerId,
            name: name || `Bot ${playerId.slice(-4)}`,
            color: color,
            selectedCountry: countryName,
            isHost: false,
            isReady: Math.random() > 0.5,
            power: Math.floor(Math.random() * 20) + 10,
            economy: Math.random() * 100
        };
        
        // Sometimes give them a province
        if (countryName && Math.random() > 0.3) {
            gameData.provinces[countryName] = playerId;
        }
        
        updateGameStateUI();
        console.log(`Added simulated player: ${name} (${playerId})`);
    },
    
    // Add multiple bot players quickly
    addBots: function(count = 3) {
        const countries = ['Germany', 'France', 'Italy', 'Spain', 'Poland', 'Netherlands'];
        const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Erik', 'Fiona'];
        
        for (let i = 0; i < count && i < countries.length; i++) {
            this.simulatePlayer(names[i], countries[i]);
        }
    },
    
    // Quick game setup for testing
    quickStart: function() {
        if (!currentPlayerId) {
            currentPlayerId = generatePlayerId();
        }
        
        // Create room
        createRoom();
        
        // Add some bots
        setTimeout(() => {
            this.addBots(2);
            
            // Start game quickly
            setTimeout(() => {
                if (isHost) {
                    // Set all players as ready
                    Object.values(gameData.players).forEach(player => {
                        player.isReady = true;
                    });
                    
                    updateGameStateUI();
                    
                    // Start countdown
                    setTimeout(() => {
                        startCountdown();
                    }, 1000);
                }
            }, 2000);
        }, 1000);
    },
    
    // Test attack on a random country
    testAttack: function() {
        const countries = Object.keys(gdpData);
        const randomCountry = countries[Math.floor(Math.random() * countries.length)];
        
        console.log(`Testing attack on ${randomCountry}`);
        loadCountryInfo(randomCountry);
        
        // Simulate attack after a delay
        setTimeout(() => {
            if (gameData.state === 'playing') {
                attackCountry(randomCountry, 1); // Medium attack
            }
        }, 2000);
    },
    
    // Give current player lots of resources
    cheat: function() {
        if (currentPlayerId && gameData.players[currentPlayerId]) {
            gameData.players[currentPlayerId].economy = 10000;
            gameData.players[currentPlayerId].power = 100;
            updatePlayerStatusBar();
            console.log('Cheat activated: Max resources given!');
        }
    },
    
    // Show current game state
    status: function() {
        console.log('=== Game Status ===');
        console.log('Room Code:', roomCode);
        console.log('Current Player:', currentPlayerId);
        console.log('Game State:', gameData.state);
        console.log('Players:', Object.keys(gameData.players).length);
        console.log('Provinces Owned:', Object.keys(gameData.provinces).length);
        console.log('Connection Status:', 
            document.getElementById('connection-text')?.textContent || 'Unknown'
        );
        
        if (window.FallbackP2P) {
            console.log('Fallback P2P Active:', window.FallbackP2P.isActive);
        }
    },
    
    // Toggle fallback mode for testing
    testFallback: function() {
        if (roomCode && window.FallbackP2P) {
            console.log('Activating fallback P2P for testing...');
            window.FallbackP2P.init(roomCode);
            updateConnectionStatus('connected', 'Fallback Test');
        }
    }
};

// Make dev utils available globally for console testing
window.dev = window.DevUtils;

// Add helpful console messages
console.log(`
🎮 Europe Simulator Dev Utils Loaded!

Quick commands:
- dev.quickStart()     - Create room, add bots, start game
- dev.addBots(3)       - Add 3 bot players
- dev.testAttack()     - Test attack on random country
- dev.cheat()          - Give max resources
- dev.status()         - Show current game status
- dev.testFallback()   - Test fallback P2P mode

Have fun conquering Europe! 🏰
`);

// Auto-enable dev tools in development
if (window.location.hostname === 'localhost' || window.location.protocol === 'file:') {
    console.log('🔧 Development mode detected - Dev utils enabled');
}
