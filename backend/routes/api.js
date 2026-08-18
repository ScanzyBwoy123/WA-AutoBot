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
| START BOT - POST
|--------------------------------------------------------------------------
*/

router.post('/bot/start', async (req, res) => {
  try {
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
| QR CODE
|--------------------------------------------------------------------------
|
| Open this in Safari:
|
| https://wa-autobot.onrender.com/api/bot/qr
|
*/

router.get('/bot/qr', (req, res) => {
  const result = whatsappService.getQR();

  if (!result.available) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>WhatsApp QR</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 40px;
            background: #f5f5f5;
          }

          .box {
            max-width: 500px;
            margin: auto;
            background: white;
            padding: 30px;
            border-radius: 20px;
          }

          button {
            padding: 14px 25px;
            border: none;
            border-radius: 10px;
            background: #25D366;
            color: white;
            font-size: 18px;
          }
        </style>
      </head>

      <body>
        <div class="box">
          <h1>WhatsApp QR Code</h1>

          <p>QR code is not available yet.</p>

          <p>
            Start the bot first, then refresh this page.
          </p>

          <button onclick="location.reload()">
            Refresh
          </button>
        </div>
      </body>
      </html>
    `);
  }

  res.send(`
    <!DOCTYPE html>
    <html>

    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1">

      <title>Connect WhatsApp</title>

      <style>
        body {
          margin: 0;
          font-family: Arial, sans-serif;
          background: #e9edef;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          text-align: center;
        }

        .container {
          background: white;
          padding: 30px;
          border-radius: 20px;
          max-width: 420px;
          width: 90%;
          box-shadow: 0 5px 30px rgba(0,0,0,0.15);
        }

        h1 {
          color: #128C7E;
        }

        img {
          width: 300px;
          max-width: 100%;
          border-radius: 10px;
        }

        .instructions {
          text-align: left;
          line-height: 1.7;
        }
      </style>
    </head>

    <body>

      <div class="container">

        <h1>📱 Connect WhatsApp</h1>

        <p>Scan this QR code with WhatsApp.</p>

        <img src="${result.qr}" alt="WhatsApp QR Code">

        <div class="instructions">

          <h3>On your phone:</h3>

          <ol>
            <li>Open WhatsApp.</li>
            <li>Go to <b>Settings</b>.</li>
            <li>Tap <b>Linked Devices</b>.</li>
            <li>Tap <b>Link a Device</b>.</li>
            <li>Scan the QR code above.</li>
          </ol>

        </div>

        <p>
          After scanning, wait for WhatsApp to authenticate.
        </p>

      </div>

    </body>
    </html>
  `);
});


/*
|--------------------------------------------------------------------------
| STATUS
|--------------------------------------------------------------------------
*/

router.get('/bot/status', (req, res) => {
  try {
    res.json({
      success: true,
      data: whatsappService.getStatus()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get bot status.',
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
