const path = require('path');
const fs = require('fs');

const puppeteer = require('puppeteer');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

class WhatsAppService {
  constructor() {
    this.client = null;
    this.isReady = false;
    this.isConnecting = false;

    console.log('[WhatsAppService] Real WhatsApp service initialized');
  }

  init() {
    console.log('[WhatsAppService] Service initialized');

    return {
      success: true,
      message: 'WhatsApp service initialized.'
    };
  }

  getChromePath() {
    // Use Render/environment Chrome if explicitly provided.
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

    // Use the Chrome installed by Puppeteer.
    const chromePath = puppeteer.executablePath();

    console.log(
      '[WhatsAppService] Puppeteer Chrome:',
      chromePath
    );

    if (chromePath && fs.existsSync(chromePath)) {
      return chromePath;
    }

    throw new Error(
      `Chrome executable not found at: ${chromePath}`
    );
  }

  async connect() {
    // Never start a second browser.
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

      const chromePath = this.getChromePath();

      console.log(
        '[WhatsAppService] Chrome executable:',
        chromePath
      );

      this.client = new Client({
        authStrategy: new LocalAuth({
          dataPath: path.resolve(__dirname, '../.wwebjs_auth')
        }),

        puppeteer: {
          executablePath: chromePath,
          headless: true,

          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',

            // Memory-saving options
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-sync',
            '--disable-default-apps',
            '--no-first-run',
            '--no-zygote',

            // Reduce Chrome memory usage
            '--single-process',
            '--renderer-process-limit=1',
            '--disable-features=Translate,BackForwardCache',
            '--disable-ipc-flooding-protection'
          ]
        }
      });

      this.client.on('qr', (qr) => {
        console.log('');
        console.log('==========================================');
        console.log('📱 WHATSAPP QR CODE RECEIVED');
        console.log('==========================================');

        qrcode.generate(qr, {
          small: true
        });

        console.log('==========================================');
        console.log('Scan this QR code with WhatsApp.');
        console.log('==========================================');
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
        console.log('==========================================');
        console.log('✅ WHATSAPP CLIENT IS READY');
        console.log('==========================================');

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
        this.client = null;
      });

      this.client.on('change_state', (state) => {
        console.log(
          '[WhatsAppService] WhatsApp state:',
          state
        );
      });

      this.client.on('message', async (message) => {
        try {
          console.log(
            `📩 Message from ${message.from}: ${message.body}`
          );

          // Your bot commands can be added here later.
        } catch (error) {
          console.error(
            '[WhatsAppService] Message handler error:',
            error
          );
        }
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

      // Clean up failed client.
      if (this.client) {
        try {
          await this.client.destroy();
        } catch (cleanupError) {
          console.error(
            '[WhatsAppService] Cleanup error:',
            cleanupError
          );
        }
      }

      this.client = null;

      throw error;
    }
  }

  async disconnect() {
    try {
      if (!this.client) {
        this.isReady = false;
        this.isConnecting = false;

        return {
          success: true,
          message: 'WhatsApp is not connected.'
        };
      }

      console.log('🔴 Stopping WhatsApp connection...');

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

      this.client = null;
      this.isReady = false;
      this.isConnecting = false;

      throw error;
    }
  }

  getStatus() {
    let status = 'Disconnected';

    if (this.isReady) {
      status = 'Connected';
    } else if (this.isConnecting) {
      status = 'Connecting';
    }

    return {
      connected: this.isReady,
      connecting: this.isConnecting,
      status
    };
  }
}

module.exports = new WhatsAppService();
