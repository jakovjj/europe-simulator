// Fallback P2P implementation using browser storage for local testing
// This provides basic multiplayer functionality without a server

window.FallbackP2P = {
    isActive: false,
    storageKey: null,
    updateInterval: null,
    
    // Initialize fallback P2P if server connection fails
    init: function(roomCode) {
        this.isActive = true;
        this.storageKey = `europe_fallback_${roomCode}`;
        
        // Save initial game state immediately
        this.saveGameState(gameData);
        
        // Listen for storage changes from other tabs/windows
        window.addEventListener('storage', (e) => {
            if (e.key === this.storageKey && e.newValue) {
                try {
                    const data = JSON.parse(e.newValue);
                    this.handleStorageUpdate(data);
                } catch (error) {
                    console.error('Error parsing fallback storage data:', error);
                }
            }
        });
        
        // Periodic sync for same-tab updates
        this.updateInterval = setInterval(() => {
            this.syncFromStorage();
        }, 1000);
        
        console.log('Fallback P2P initialized for room:', roomCode);
    },
    
    // Save current game state to localStorage
    saveGameState: function(gameData) {
        if (!this.isActive || !this.storageKey) return;
        
        try {
            const data = {
                gameData: gameData,
                lastUpdate: Date.now(),
                playerId: currentPlayerId
            };
            localStorage.setItem(this.storageKey, JSON.stringify(data));
        } catch (error) {
            console.error('Error saving fallback game state:', error);
        }
    },
    
    // Load game state from localStorage
    syncFromStorage: function() {
        if (!this.isActive || !this.storageKey) return;
        
        try {
            const data = localStorage.getItem(this.storageKey);
            if (data) {
                const parsed = JSON.parse(data);
                this.handleStorageUpdate(parsed);
            }
        } catch (error) {
            console.error('Error syncing from fallback storage:', error);
        }
    },
    
    // Handle storage updates from other instances
    handleStorageUpdate: function(data) {
        if (!data.gameData || data.playerId === currentPlayerId) return;
        
        // Merge game state carefully
        if (data.gameData.players) {
            gameData.players = { ...gameData.players, ...data.gameData.players };
        }
        if (data.gameData.provinces) {
            gameData.provinces = { ...gameData.provinces, ...data.gameData.provinces };
        }
        if (data.gameData.state) {
            gameData.state = data.gameData.state;
        }
        
        // Update UI
        if (window.updateGameStateUI) {
            updateGameStateUI();
        }
    },
    
    // Check if room exists
    roomExists: function(roomCode) {
        const storageKey = `europe_fallback_${roomCode}`;
        const data = localStorage.getItem(storageKey);
        return !!data;
    },
    
    // Join existing room
    joinExistingRoom: function(roomCode) {
        const storageKey = `europe_fallback_${roomCode}`;
        const data = localStorage.getItem(storageKey);
        
        if (data) {
            try {
                const parsed = JSON.parse(data);
                if (parsed.gameData) {
                    // Load existing game state
                    gameData = { ...gameData, ...parsed.gameData };
                    
                    // Add current player if not already in
                    if (!gameData.players[currentPlayerId]) {
                        const usedColors = Object.values(gameData.players).map(p => p.color);
                        const availableColors = PLAYER_COLORS.filter(c => !usedColors.includes(c));
                        const randomColor = availableColors[Math.floor(Math.random() * availableColors.length)] || PLAYER_COLORS[0];
                        
                        gameData.players[currentPlayerId] = {
                            id: currentPlayerId,
                            name: `Player ${currentPlayerId.slice(-4)}`,
                            color: randomColor,
                            selectedCountry: null,
                            isHost: false,
                            isReady: false,
                            power: 10,
                            economy: 0
                        };
                    }
                    
                    this.init(roomCode);
                    return true;
                }
            } catch (error) {
                console.error('Error joining fallback room:', error);
            }
        }
        return false;
    },
    
    // Cleanup fallback P2P
    cleanup: function() {
        this.isActive = false;
        this.storageKey = null;
        
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        
        console.log('Fallback P2P cleaned up');
    }
};
