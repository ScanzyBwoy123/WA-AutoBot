const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const db = require('../database/db');

function findChromeExecutable() {
  const possiblePaths = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/opt/render/project/src/backend/.cache/puppeteer',
    '/opt/render/.cache/puppeteer',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);

  for (const basePath of possiblePaths) {
    try {
      if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) {
        return basePath;
      }
    } catch (error) {
      // Ignore invalid paths
    }
  }

  function searchDirectory(directory, depth = 0) {
    if (depth > 5) return null;

    try {
      if (!fs.existsSync(directory)) return null;

      const entries = fs.readdirSync(directory, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);

        if (
          entry.isFile() &&
          (entry.name === 'chrome' ||
            entry.name === 'chrome.exe' ||
            entry.name === 'google-chrome')
        ) {
          return fullPath;
        }

        if (entry.isDirectory()) {
          const found = searchDirectory(fullPath, depth + 1);
          if (found) return found;
        }
      }
    } catch (error) {
      // Ignore directories that cannot be accessed
    }

    return null;
  }

  const searchLocations = [
    '/opt/render/.cache/puppeteer',
    '/opt/render/project/src/backend/.cache/puppeteer'
  ];

  for (const location of searchLocations) {
    const found = searchDirectory(location);
    if (found) return found;
  }

  return null;
}

class WhatsAppService {
  constructor() {
    this.client = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;

    const chromePath = findChromeExecutable();

    console.log(
      '[WhatsAppService] Chrome executable:',
      chromePath || 'NOT FOUND'
    );

    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: '/var/data/whatsapp-session'
      }),

      puppeteer: {
        headless: true,

        ...(chromePath
          ? {
              executablePath: chromePath
            }
          : {}),

        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--single-process'
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
      db.logActivity(
        'WhatsApp authentication failed',
        'error'
      );
    });

    this.client.on('disconnected', (reason) => {
      console.log('🔴 WhatsApp disconnected:', reason);
      db.setBotStatus('Disconnected');
      db.logActivity(
        'WhatsApp client disconnected',
        'warning'
      );
    });

    this.client.on('message', async (message) => {
      db.incrementCommands();

      console.log(
        `📩 Message received from ${message.from}: ${message.body}`
      );
    });

    this.initialized = true;

    console.log(
      '[WhatsAppService] Real WhatsApp service initialized'
    );
  }

  async connect() {
    if (!this.client) {
      this.init();
    }

    console.log('🔄 Starting WhatsApp connection...');

    const chromePath = findChromeExecutable();

    if (!chromePath) {
      throw new Error(
        'Chrome executable was not found on the Render server.'
      );
    }

    console.log(
      '[WhatsAppService] Using Chrome:',
      chromePath
    );

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
