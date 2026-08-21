const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun } = require('../db/database');
const { broadcast } = require('../websocket');

// Get all switchboards
router.get('/boards', async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM boards');
    const result = {};
    rows.forEach((row) => {
      result[row.id] = {
        id: row.id,
        name: row.name,
        floor: row.floor,
        points: JSON.parse(row.points)
      };
    });
    res.json({ success: true, boards: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get specific switchboard by ID
router.get('/boards/:id', async (req, res) => {
  try {
    const row = await dbGet('SELECT * FROM boards WHERE id = ?', [req.params.id]);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Board not found' });
    }
    res.json({
      success: true,
      board: {
        id: row.id,
        name: row.name,
        floor: row.floor,
        points: JSON.parse(row.points)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Toggle/Update a single point/switch in a switchboard
router.patch('/boards/:boardId/points/:pointId', async (req, res) => {
  const { boardId, pointId } = req.params;
  const { state, speed } = req.body;

  try {
    const row = await dbGet('SELECT * FROM boards WHERE id = ?', [boardId]);
    if (!row) {
      return res.status(404).json({ success: false, message: 'Board not found' });
    }

    const points = JSON.parse(row.points);
    let updatedPoint = null;

    const newPoints = points.map((pt) => {
      if (pt.id === pointId) {
        if (typeof state === 'boolean') pt.state = state;
        if (typeof speed === 'number') pt.speed = speed;
        updatedPoint = pt;
      }
      return pt;
    });

    if (!updatedPoint) {
      return res.status(404).json({ success: false, message: 'Point ID not found in board' });
    }

    // Save back to DB
    await dbRun(
      'UPDATE boards SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [JSON.stringify(newPoints), boardId]
    );

    // Queue command for RPi gateway to forward to ESP32
    await dbRun(
      'INSERT INTO commands (board_id, point_id, action, payload, status) VALUES (?, ?, ?, ?, ?)',
      [
        boardId,
        pointId,
        'STATE_CHANGE',
        JSON.stringify({ state: updatedPoint.state, speed: updatedPoint.speed, name: updatedPoint.name, type: updatedPoint.type }),
        'pending'
      ]
    );

    // Broadcast update via WebSocket to connected clients (web UIs, apps, RPi)
    broadcast('POINT_UPDATE', {
      boardId,
      pointId,
      point: updatedPoint
    });

    res.json({
      success: true,
      message: `Point ${pointId} updated successfully`,
      point: updatedPoint
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Pending Commands API for RPi Bridge
router.get('/commands/pending', async (req, res) => {
  try {
    const commands = await dbAll("SELECT * FROM commands WHERE status = 'pending' ORDER BY id ASC");
    res.json({ success: true, count: commands.length, commands });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Acknowledge command completion from RPi
router.post('/commands/:id/ack', async (req, res) => {
  try {
    await dbRun("UPDATE commands SET status = 'executed' WHERE id = ?", [req.params.id]);
    res.json({ success: true, message: `Command ${req.params.id} marked as executed` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
