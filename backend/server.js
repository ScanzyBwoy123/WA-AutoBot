const express = require('express');
const cors = require('cors');
require('dotenv').config();

const apiRoutes = require('./routes/api');
const whatsappService = require('./services/whatsappService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'WA-AutoBot backend is running'
  });
});

app.use('/api', apiRoutes);

app.use((err, req, res, next) => {
  console.error('[Server Error]', err);

  res.status(500).json({
    success: false,
    error: 'Internal Server Error'
  });
});

whatsappService.init();

app.listen(PORT, () => {
  console.log(`🟢 WA-AutoBot backend running on port ${PORT}`);
});
