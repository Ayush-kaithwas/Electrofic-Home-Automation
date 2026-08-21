const express = require('express');
const router = express.Router();
const { dbGet, dbRun } = require('../db/database');
const { broadcast } = require('../websocket');

// Get water monitoring status
router.get('/', async (req, res) => {
  try {
    const row = await dbGet('SELECT data FROM water_system WHERE id = "main"');
    if (!row) {
      return res.status(404).json({ success: false, message: 'Water monitoring data not found' });
    }
    res.json({ success: true, water: JSON.parse(row.data) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update water system settings (e.g. pump switch, auto mode toggle)
router.put('/', async (req, res) => {
  try {
    const row = await dbGet('SELECT data FROM water_system WHERE id = "main"');
    if (!row) {
      return res.status(404).json({ success: false, message: 'Water monitoring data not found' });
    }

    const currentData = JSON.parse(row.data);
    const updatedData = { ...currentData, ...req.body };

    await dbRun(
      'UPDATE water_system SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = "main"',
      [JSON.stringify(updatedData)]
    );

    // Broadcast WebSocket update
    broadcast('WATER_UPDATE', updatedData);

    res.json({ success: true, message: 'Water system data updated', water: updatedData });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
