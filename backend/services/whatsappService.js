const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const db = require('../database/db');

class WhatsAppService {
  constructor() {
    this.client = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;

    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: '/var/data/whatsapp-session'
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      }
    });

    this.client.on('qr', (qr) => {
      console.log('\n📱 Scan this QR code with WhatsApp:\n');
      qrcode.generate(qr, { small: true });
    });

    this.client.on('ready', () => {
      console.log('🟢 WhatsApp client is ready!');
      db.setBotStatus('Connected');
      db.logActivity('WhatsApp client connected', 'success');
    });

    this.client.on('authenticated', () => {
      console.log('🔐 WhatsApp authentication successful');
    });

    this.client.on('auth_failure', (message) => {
      console.error('❌ WhatsApp authentication failed:', message);
      db.setBotStatus('Disconnected');
      db.logActivity('WhatsApp authentication failed', 'error');
    });

    this.client.on('disconnected', (reason) => {
      console.log('🔴 WhatsApp disconnected:', reason);
      db.setBotStatus('Disconnected');
      db.logActivity('WhatsApp client disconnected', 'warning');
    });

    this.client.on('message', async (message) => {
      db.incrementCommands();
      console.log(`📩 Message received from ${message.from}: ${message.body}`);
    });

    this.initialized = true;

    console.log('[WhatsAppService] Real WhatsApp service initialized');
  }

  async connect() {
    if (!this.client) {
      this.init();
    }

    console.log('🔄 Starting WhatsApp connection...');

    await this.client.initialize();

    return {
      success: true,
      status: 'Connecting'
    };
  }

  async disconnect() {
    if (this.client) {
      await this.client.logout();
      db.setBotStatus('Disconnected');
    }

    return {
      success: true,
      status: db.getStats().status
    };
  }

  getStatus() {
    return db.getStats().status;
  }
}

module.exports = new WhatsAppService();
