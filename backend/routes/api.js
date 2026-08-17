const express = require('express');
const router = express.Router();

const db = require('../database/db');
const ownerAuth = require('../middleware/ownerAuth');
const whatsappService = require('../services/whatsappService');

const commandRouter = require('../../commands');

// =========================
// BOT STATUS
// =========================

router.get('/bot/status', (req, res) => {
  res.json({
    success: true,
    data: db.getStats()
  });
});

router.post('/bot/start', ownerAuth, async (req, res) => {
  try {
    const result = await whatsappService.connect();

    res.json({
      success: true,
      data: db.getStats(),
      result
    });
  } catch (error) {
    console.error('[Bot Start Error]', error);

    res.status(500).json({
      success: false,
      error: 'Unable to start WhatsApp connection.'
    });
  }
});

router.post('/bot/stop', ownerAuth, async (req, res) => {
  try {
    const result = await whatsappService.disconnect();

    res.json({
      success: true,
      data: db.getStats(),
      result
    });
  } catch (error) {
    console.error('[Bot Stop Error]', error);

    res.status(500).json({
      success: false,
      error: 'Unable to stop WhatsApp connection.'
    });
  }
});

// =========================
// COMMANDS
// =========================

router.post('/commands/execute', ownerAuth, async (req, res) => {
  try {
    const { command, senderNumber } = req.body;

    if (!command || typeof command !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Command is required.'
      });
    }

    const result = await commandRouter.execute(command, {
      sender: senderNumber
    });

    db.incrementCommands();

    res.json({
      success: true,
      data: {
        response: result
      }
    });
  } catch (error) {
    console.error('[Command Error]', error);

    res.status(500).json({
      success: false,
      error: 'Command execution failed.'
    });
  }
});

router.get('/commands', (req, res) => {
  res.json({
    success: true,
    data: commandRouter.getCommandList()
  });
});

// =========================
// SETTINGS
// =========================

router.get('/settings', (req, res) => {
  res.json({
    success: true,
    data: db.getSettings()
  });
});

router.put('/settings', (req, res) => {
  try {
    const updated = db.updateSettings(req.body || {});

    res.json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error('[Settings Error]', error);

    res.status(500).json({
      success: false,
      error: 'Unable to update settings.'
    });
  }
});

// =========================
// MEDIA
// =========================

router.get('/media', (req, res) => {
  res.json({
    success: true,
    data: db.getMedia()
  });
});

// =========================
// ACTIVITY
// =========================

router.get('/activity', (req, res) => {
  res.json({
    success: true,
    data: db.getActivities()
  });
});

module.exports = router;
