require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const os = require('os');
const { seedDatabase } = require('./db/seed');
const { initWebSocket } = require('./websocket');

const deviceRoutes = require('./routes/deviceRoutes');
const waterRoutes = require('./routes/waterRoutes');
const telemetryRoutes = require('./routes/telemetryRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// CORS setup to allow request from React Frontend (local & mobile network)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// API Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    system: 'AuraHome Backend Node.js Service',
    timestamp: new Date().toISOString(),
    database: 'SQLite (aurahome.db)'
  });
});

// Mount Routes
app.use('/api', deviceRoutes);
app.use('/api/water', waterRoutes);
app.use('/api/telemetry', telemetryRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
});

// Create HTTP server
const server = http.createServer(app);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Error: Port ${PORT} is already in use by another process.`);
    console.error(`👉 Solution: Stop any existing running instance or run: Get-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess | Stop-Process\n`);
  } else {
    console.error('❌ Server error:', err);
  }
  process.exit(1);
});

// Attach WebSockets
initWebSocket(server);

// Helper function to get local IPv4 address
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Start Server
async function startServer() {
  try {
    await seedDatabase();

    server.listen(PORT, '0.0.0.0', () => {
      const localIp = getLocalIpAddress();
      console.log('================================================================');
      console.log(' ⚡ AuraHome Node.js Backend & Database Server is LIVE!');
      console.log('================================================================');
      console.log(` On Local PC      : http://localhost:${PORT}`);
      console.log(` On Local Network : http://${localIp}:${PORT}`);
      console.log(` WebSocket URL   : ws://${localIp}:${PORT}`);
      console.log('================================================================');
      console.log(` SQLite Database  : backend/db/aurahome.db`);
      console.log(' Ready to receive requests from Web Dashboard & Raspberry Pi');
      console.log('================================================================');
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
