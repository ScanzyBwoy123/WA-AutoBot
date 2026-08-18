const express = require('express');
const router = express.Router();

const whatsappService = require('../services/whatsappService');


/*
|--------------------------------------------------------------------------
| START BOT
|--------------------------------------------------------------------------
*/

router.get('/bot/start', async (req, res) => {
  try {
    console.log(
      '🔄 Starting WhatsApp bot from browser...'
    );

    const result =
      await whatsappService.connect();

    res.json({
      success: true,
      message:
        'WhatsApp bot start request sent successfully.',
      data: result
    });

  } catch (error) {
    console.error(
      '[Bot Start Error]',
      error
    );

    res.status(500).json({
      success: false,
      message:
        'Failed to start WhatsApp bot.',
      error: error.message
    });
  }
});


/*
|--------------------------------------------------------------------------
| START BOT - POST
|--------------------------------------------------------------------------
*/

router.post('/bot/start', async (req, res) => {
  try {
    console.log(
      '🔄 Starting WhatsApp bot...'
    );

    const result =
      await whatsappService.connect();

    res.json({
      success: true,
      message:
        'WhatsApp bot start request sent successfully.',
      data: result
    });

  } catch (error) {
    console.error(
      '[Bot Start Error]',
      error
    );

    res.status(500).json({
      success: false,
      message:
        'Failed to start WhatsApp bot.',
      error: error.message
    });
  }
});


/*
|--------------------------------------------------------------------------
| GET PAIRING CODE
|--------------------------------------------------------------------------
*/

router.get('/bot/pair', (req, res) => {
  try {
    const result =
      whatsappService.getPairingCode();

    res.json({
      success: true,
      message: result.available
        ? 'WhatsApp pairing code available.'
        : 'Pairing code is not available yet.',
      data: result
    });

  } catch (error) {
    console.error(
      '[Pairing Code Error]',
      error
    );

    res.status(500).json({
      success: false,
      message:
        'Failed to get WhatsApp pairing code.',
      error: error.message
    });
  }
});


/*
|--------------------------------------------------------------------------
| BOT STATUS
|--------------------------------------------------------------------------
*/

router.get('/bot/status', (req, res) => {
  try {
    const status =
      whatsappService.getStatus();

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error(
      '[Bot Status Error]',
      error
    );

    res.status(500).json({
      success: false,
      message:
        'Failed to get bot status.',
      error: error.message
    });
  }
});


/*
|--------------------------------------------------------------------------
| STOP BOT
|--------------------------------------------------------------------------
*/

router.get('/bot/stop', async (req, res) => {
  try {
    const result =
      await whatsappService.disconnect();

    res.json({
      success: true,
      message:
        'WhatsApp bot stopped.',
      data: result
    });

  } catch (error) {
    console.error(
      '[Bot Stop Error]',
      error
    );

    res.status(500).json({
      success: false,
      message:
        'Failed to stop WhatsApp bot.',
      error: error.message
    });
  }
});


module.exports = router;
