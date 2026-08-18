const express = require('express');
const cors = require('cors');
require('dotenv').config();

const apiRoutes = require('./routes/api');
const pairRoutes = require('./routes/pair');
const whatsappService = require('./services/whatsappService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'WA-AutoBot backend is running',
    pairing: true
  });
});

/*
 * Existing bot API
 */
app.use('/api', apiRoutes);

/*
 * New multi-account pairing API
 *
 * Examples:
 * POST /api/pair/register
 * GET  /api/pair/status/233XXXXXXXXX
 * GET  /api/pair/accounts
 * GET  /api/pair/stats
 */
app.use('/api/pair', pairRoutes);

app.use((err, req, res, next) => {
  console.error('[Server Error]', err);

  res.status(500).json({
    success: false,
    error: 'Internal Server Error'
  });
});

/*
 * Start the existing WhatsApp bot.
 */
whatsappService.init();

app.listen(PORT, () => {
  console.log(
    `🟢 WA-AutoBot backend running on port ${PORT}`
  );

  console.log(
    `🔗 Multi-account pairing API: /api/pair`
  );
});
