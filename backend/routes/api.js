const express = require('express');
const QRCode = require('qrcode');

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
| POST START BOT
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
| BOT STATUS
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
| QR CODE
|--------------------------------------------------------------------------
| Converts the raw WhatsApp QR string into a real QR image.
|--------------------------------------------------------------------------
*/
router.get('/bot/qr', async (req, res) => {
  try {
    const qrData = whatsappService.getQR();

    if (!qrData.available || !qrData.qr) {
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
            }
          </style>
        </head>
        <body>
          <h2>QR code not available</h2>
          <p>Start the bot first, then refresh this page.</p>
        </body>
        </html>
      `);
    }

    /*
     * Generate a real QR code as a data URL.
     */
    const qrImage = await QRCode.toDataURL(qrData.qr, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'M'
    });

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        >

        <title>Connect WhatsApp</title>

        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            min-height: 100vh;
            font-family: Arial, sans-serif;
            background: #f0f2f5;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
          }

          .card {
            width: 100%;
            max-width: 430px;
            background: white;
            border-radius: 20px;
            padding: 30px 20px;
            text-align: center;
            box-shadow: 0 8px 30px rgba(0,0,0,0.12);
          }

          h1 {
            margin-top: 0;
            font-size: 25px;
          }

          .subtitle {
            color: #555;
            line-height: 1.5;
          }

          .qr {
            width: 320px;
            max-width: 100%;
            margin: 20px auto;
            display: block;
            border-radius: 10px;
          }

          .steps {
            text-align: left;
            background: #f7f7f7;
            padding: 18px;
            border-radius: 12px;
            line-height: 1.7;
          }

          .refresh {
            margin-top: 20px;
            padding: 13px 20px;
            border: 0;
            border-radius: 10px;
            background: #128c7e;
            color: white;
            font-size: 16px;
            cursor: pointer;
          }
        </style>
      </head>

      <body>

        <div class="card">

          <h1>📱 Connect WhatsApp</h1>

          <p class="subtitle">
            Scan this QR code with WhatsApp.
          </p>

          <img
            class="qr"
            src="${qrImage}"
            alt="WhatsApp QR Code"
          >

          <div class="steps">
            <strong>On your phone:</strong><br>

            1. Open WhatsApp.<br>
            2. Go to <strong>Settings</strong>.<br>
            3. Tap <strong>Linked Devices</strong>.<br>
            4. Tap <strong>Link a Device</strong>.<br>
            5. Scan the QR code above.<br>
            6. Wait for authentication.
          </div>

          <button
            class="refresh"
            onclick="location.reload()"
          >
            🔄 Refresh QR Code
          </button>

        </div>

      </body>
      </html>
    `);

  } catch (error) {
    console.error('[QR Error]', error);

    res.status(500).json({
      success: false,
      message: 'Failed to generate QR code.',
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
