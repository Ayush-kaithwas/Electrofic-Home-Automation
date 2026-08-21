const express = require('express');
const router = express.Router();
const { dbAll, dbRun } = require('../db/database');
const { broadcast } = require('../websocket');

// Post telemetry reading from Raspberry Pi or ESP32
router.post('/', async (req, res) => {
  const { device_id, sensor_type, value, unit } = req.body;

  if (!device_id || !sensor_type || value === undefined) {
    return res.status(400).json({ success: false, message: 'Missing required telemetry fields: device_id, sensor_type, value' });
  }

  try {
    await dbRun(
      'INSERT INTO telemetry_logs (device_id, sensor_type, value, unit) VALUES (?, ?, ?, ?)',
      [device_id, sensor_type, value, unit || '']
    );

    const logEntry = {
      device_id,
      sensor_type,
      value,
      unit: unit || '',
      timestamp: new Date().toISOString()
    };

    // Broadcast via WebSocket
    broadcast('TELEMETRY_LOG', logEntry);

    res.json({ success: true, message: 'Telemetry logged', log: logEntry });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get recent telemetry history
router.get('/', async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const deviceId = req.query.device_id;

  try {
    let sql = 'SELECT * FROM telemetry_logs';
    let params = [];

    if (deviceId) {
      sql += ' WHERE device_id = ?';
      params.push(deviceId);
    }

    sql += ' ORDER BY id DESC LIMIT ?';
    params.push(limit);

    const rows = await dbAll(sql, params);
    res.json({ success: true, count: rows.length, telemetry: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
