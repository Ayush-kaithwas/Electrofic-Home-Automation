const WebSocket = require('ws');

let wss = null;

function initWebSocket(server) {
  wss = new WebSocket.Server({ server });

  console.log('⚡ WebSocket server attached to HTTP server.');

  wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`🔌 New WebSocket client connected from ${clientIp}`);

    // Send welcome / ack message
    ws.send(JSON.stringify({
      type: 'INIT',
      message: 'Connected to AuraHome Backend WebSocket Server',
      timestamp: new Date().toISOString()
    }));

    ws.on('message', (message) => {
      try {
        const parsed = JSON.parse(message);
        console.log('📩 Received WS message:', parsed);
        
        // Broadcast to other clients if requested
        if (parsed.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
        }
      } catch (err) {
        console.error('⚠️ Invalid WebSocket JSON message received:', err.message);
      }
    });

    ws.on('close', () => {
      console.log(`❌ WebSocket client disconnected: ${clientIp}`);
    });

    ws.on('error', (err) => {
      console.error(`⚠️ WebSocket error (${clientIp}):`, err.message);
    });
  });
}

/**
 * Broadcast event to all connected WebSocket clients
 * @param {string} eventName - Name of event (e.g., 'BOARD_UPDATE', 'WATER_UPDATE', 'TELEMETRY')
 * @param {object} payload - Data object
 */
function broadcast(eventName, payload) {
  if (!wss) return;

  const data = JSON.stringify({
    event: eventName,
    data: payload,
    timestamp: new Date().toISOString()
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

module.exports = {
  initWebSocket,
  broadcast
};
