const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

// IMPORTANT:
// Keep Puppeteer's Chrome inside the project so Render includes it
// in the deployed build.
const puppeteerCache = path.resolve(__dirname, '../.puppeteer');

process.env.PUPPETEER_CACHE_DIR = puppeteerCache;

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const puppeteer = require('puppeteer');

class WhatsAppService {
  constructor() {
    this.client = null;
    this.isReady = false;
    this.isConnecting = false;

    console.log('[WhatsAppService] Real WhatsApp service initialized');
    console.log('[WhatsAppService] Puppeteer cache:', puppeteerCache);
  }

  init() {
    console.log('[WhatsAppService] Service initialized');

    return {
      success: true,
      message: 'WhatsApp service initialized.'
    };
  }

  getChromePath() {
    // 1. Use CHROME_BIN if Render provides one.
    if (
      process.env.CHROME_BIN &&
      fs.existsSync(process.env.CHROME_BIN)
    ) {
      console.log(
        '[WhatsAppService] Using CHROME_BIN:',
        process.env.CHROME_BIN
      );

      return process.env.CHROME_BIN;
    }

    // 2. Ask Puppeteer where its Chrome is.
    const puppeteerPath = puppeteer.executablePath();

    console.log(
      '[WhatsAppService] Puppeteer executable path:',
      puppeteerPath
    );

    if (puppeteerPath && fs.existsSync(puppeteerPath)) {
      console.log(
        '[WhatsAppService] Chrome found:',
        puppeteerPath
      );

      return puppeteerPath;
    }

    return null;
  }

  installChromeIfNeeded() {
    let chromePath = this.getChromePath();

    if (chromePath) {
      return chromePath;
    }

    console.log(
      '⚠️ Chrome was not found. Installing Chrome into project cache...'
    );

    try {
      fs.mkdirSync(puppeteerCache, {
        recursive: true
      });

      execFileSync(
        'npx',
        [
          'puppeteer',
          'browsers',
          'install',
          'chrome'
        ],
        {
          stdio: 'inherit',
          env: {
            ...process.env,
            PUPPETEER_CACHE_DIR: puppeteerCache
          }
        }
      );

      chromePath = this.getChromePath();

      if (!chromePath) {
        throw new Error(
          'Chrome installation completed but Chrome executable could not be located.'
        );
      }

      console.log(
        '✅ Chrome successfully installed:',
        chromePath
      );

      return chromePath;

    } catch (error) {
      console.error(
        '❌ Chrome installation failed:',
        error
      );

      throw new Error(
        `Unable to install/find Chrome for WhatsApp bot: ${error.message}`
      );
    }
  }

  async connect() {
    if (this.isReady) {
      return {
        success: true,
        message: 'WhatsApp is already connected.'
      };
    }

    if (this.isConnecting) {
      return {
        success: false,
        message: 'WhatsApp connection is already starting.'
      };
    }

    this.isConnecting = true;

    try {
      console.log('🔄 Starting WhatsApp connection...');

      const chromePath = this.installChromeIfNeeded();

      console.log(
        '[WhatsAppService] Final Chrome executable:',
        chromePath
      );

      this.client = new Client({
        authStrategy: new LocalAuth({
          dataPath: './.wwebjs_auth'
        }),

        puppeteer: {
          executablePath: chromePath,
          headless: true,

          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-sync'
          ]
        }
      });

      this.client.on('qr', (qr) => {
        console.log('');
        console.log('========================================');
        console.log('📱 WHATSAPP QR CODE RECEIVED');
        console.log('========================================');

        qrcode.generate(qr, {
          small: true
        });

        console.log('========================================');
      });

      this.client.on('authenticated', () => {
        console.log('🔐 WhatsApp authenticated');
      });

      this.client.on('auth_failure', (message) => {
        console.error(
          '❌ WhatsApp authentication failure:',
          message
        );

        this.isReady = false;
        this.isConnecting = false;
      });

      this.client.on('ready', () => {
        console.log('');
        console.log('========================================');
        console.log('✅ WHATSAPP CLIENT IS READY');
        console.log('========================================');

        this.isReady = true;
        this.isConnecting = false;
      });

      this.client.on('disconnected', (reason) => {
        console.log(
          '🔴 WhatsApp disconnected:',
          reason
        );

        this.isReady = false;
        this.isConnecting = false;
      });

      this.client.on('message', async (message) => {
        console.log(
          `📩 Message from ${message.from}: ${message.body}`
        );
      });

      await this.client.initialize();

      return {
        success: true,
        message: 'WhatsApp connection initialization started.'
      };

    } catch (error) {
      console.error(
        '[WhatsAppService] Connection error:',
        error
      );

      this.isReady = false;
      this.isConnecting = false;

      throw error;
    }
  }

  async disconnect() {
    try {
      if (!this.client) {
        return {
          success: true,
          message: 'WhatsApp is not connected.'
        };
      }

      await this.client.destroy();

      this.client = null;
      this.isReady = false;
      this.isConnecting = false;

      console.log('🔴 WhatsApp connection stopped');

      return {
        success: true,
        message: 'WhatsApp connection stopped.'
      };

    } catch (error) {
      console.error(
        '[WhatsAppService] Disconnect error:',
        error
      );

      this.isReady = false;
      this.isConnecting = false;

      throw error;
    }
  }

  getStatus() {
    return {
      connected: this.isReady,
      connecting: this.isConnecting
    };
  }
}

module.exports = new WhatsAppService();
