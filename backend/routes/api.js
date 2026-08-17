const express = require('express');
const router = express.Router();

const whatsappService = require('../services/whatsappService');

/*
|--------------------------------------------------------------------------
| GET /api/bot/start
|--------------------------------------------------------------------------
| Allows you to start the WhatsApp bot directly from Safari.
|
| Open:
| https://wa-autobot.onrender.com/api/bot/start
|--------------------------------------------------------------------------
*/
router.get('/bot/start', async (req, res) => {
  try {
    console.log('🔄 Starting WhatsApp bot from browser...');

    const result = await whatsappService.connect();

    res.json({
      success: true,
      message: 'WhatsApp bot start request sent successfully.',
      data: result
    });

  } catch (error) {
    console.error('[Bot Start Error]', error);

    res.status(500).json({
      success: false,
      message: 'Failed to start WhatsApp bot.',
      error: error.message
    });
  }
});


/*
|--------------------------------------------------------------------------
| POST /api/bot/start
|--------------------------------------------------------------------------
| Keeps the original POST endpoint working too.
|--------------------------------------------------------------------------
*/
router.post('/bot/start', async (req, res) => {
  try {
    console.log('🔄 Starting WhatsApp bot...');

    const result = await whatsappService.connect();

    res.json({
      success: true,
      message: 'WhatsApp bot start request sent successfully.',
      data: result
    });

  } catch (error) {
    console.error('[Bot Start Error]', error);

    res.status(500).json({
      success: false,
      message: 'Failed to start WhatsApp bot.',
      error: error.message
    });
  }
});


/*
|--------------------------------------------------------------------------
| GET /api/bot/status
|--------------------------------------------------------------------------
| Check WhatsApp bot status from Safari.
|--------------------------------------------------------------------------
*/
router.get('/bot/status', async (req, res) => {
  try {
    const status = whatsappService.getStatus();

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('[Bot Status Error]', error);

    res.status(500).json({
      success: false,
      message: 'Failed to get bot status.',
      error: error.message
    });
  }
});


/*
|--------------------------------------------------------------------------
| GET /api/bot/stop
|--------------------------------------------------------------------------
| Allows you to stop the bot directly from Safari.
|--------------------------------------------------------------------------
*/
router.get('/bot/stop', async (req, res) => {
  try {
    const result = await whatsappService.disconnect();

    res.json({
      success: true,
      message: 'WhatsApp bot stopped.',
      data: result
    });

  } catch (error) {
    console.error('[Bot Stop Error]', error);

    res.status(500).json({
      success: false,
      message: 'Failed to stop WhatsApp bot.',
      error: error.message
    });
  }
});


module.exports = router;
