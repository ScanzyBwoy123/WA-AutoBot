const express = require('express');
const cors = require('cors');
const path = require('path');

require('dotenv').config();

const apiRoutes = require('./routes/api');
const pairRoutes = require('./routes/pair');
const whatsappService =
  require('./services/whatsappService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/*
 * ==========================================
 * HEALTH CHECK
 * ==========================================
 */

app.get('/health', (req, res) => {
  res.json({
    success: true,
    message:
      'WA-AutoBot backend is running',
    pairing: true
  });
});


/*
 * ==========================================
 * ONLINE CUSTOMER PAIRING PAGE
 * ==========================================
 *
 * Customers will eventually open:
 *
 * https://YOUR-RENDER-URL/pair
 *
 * The HTML file is stored in:
 *
 * frontend/pair.html
 */

app.get('/pair', (req, res) => {
  res.sendFile(
    path.join(
      process.cwd(),
      '..',
      'frontend',
      'pair.html'
    ),
    (error) => {
      if (error) {
        console.error(
          '[Pair Page Error]',
          error
        );

        /*
         * Fallback for deployments where the
         * working directory is the project root.
         */
        res.sendFile(
          path.join(
            process.cwd(),
            'frontend',
            'pair.html'
          ),
          (fallbackError) => {
            if (fallbackError) {
              console.error(
                '[Pair Page Fallback Error]',
                fallbackError
              );

              return res.status(404).send(
                'Pairing page is not available yet.'
              );
            }
          }
        );
      }
    }
  );
});


/*
 * ==========================================
 * EXISTING BOT API
 * ==========================================
 */

app.use('/api', apiRoutes);


/*
 * ==========================================
 * MULTI-ACCOUNT PAIRING API
 * ==========================================
 *
 * POST /api/pair/register
 *
 * GET /api/pair/pairing-code/:phone
 *
 * GET /api/pair/status/:phone
 *
 * POST /api/pair/disconnect
 */

app.use(
  '/api/pair',
  pairRoutes
);


/*
 * ==========================================
 * ERROR HANDLER
 * ==========================================
 */

app.use(
  (err, req, res, next) => {
    console.error(
      '[Server Error]',
      err
    );

    res.status(500).json({
      success: false,
      error:
        'Internal Server Error'
    });
  }
);


/*
 * ==========================================
 * EXISTING OWNER WHATSAPP BOT
 * ==========================================
 *
 * This remains separate from the
 * multi-account customer system.
 */

whatsappService.init();


/*
 * ==========================================
 * START SERVER
 * ==========================================
 */

app.listen(
  PORT,
  () => {
    console.log(
      `🟢 WA-AutoBot backend running on port ${PORT}`
    );

    console.log(
      `🌐 Customer pairing page: /pair`
    );

    console.log(
      `🔗 Multi-account API: /api/pair`
    );
  }
);
