// Fallback P2P system using PeerJS (no server required)
// This provides basic P2P functionality without needing Node.js

// Add PeerJS CDN if not running with server
if (window.location.protocol === 'file:' || !window.location.port) {
    // Load PeerJS from CDN for fallback
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/peerjs@1.5.0/dist/peerjs.min.js';
    script.onload = initFallbackP2P;
    document.head.appendChild(script);
} else {
    // Use the full WebRTC implementation
    console.log('Using full WebRTC P2P implementation');
}

function initFallbackP2P() {
    console.log('Initializing fallback P2P with PeerJS');
    
    // Simple PeerJS-based P2P for demo purposes
    let peer = null;
    let connections = new Map();
    
    window.createRoomFallback = function() {
        if (!peer) {
            peer = new Peer();
            peer.on('open', (id) => {
                roomCode = id.slice(-4).toUpperCase();
                console.log('Fallback room created:', roomCode);
                updateRoomUI();
            });
            
            peer.on('connection', (conn) => {
                setupPeerConnection(conn);
            });
        }
    };
    
    window.joinRoomFallback = function(code) {
        if (!peer) {
            peer = new Peer();
            peer.on('open', () => {
                // Try to find peer with ID ending in the room code
                // This is a simplified approach - in practice you'd need a discovery mechanism
                alert('Fallback P2P: Ask the host for their full Peer ID');
            });
        }
    };
    
    function setupPeerConnection(conn) {
        connections.set(conn.peer, conn);
        
        conn.on('data', (data) => {
            console.log('Received fallback P2P data:', data);
            // Handle P2P messages
        });
        
        conn.on('close', () => {
            connections.delete(conn.peer);
        });
    }
    
    // Override the main functions if PeerJS is available
    if (window.Peer) {
        console.log('PeerJS fallback ready');
    }
}
