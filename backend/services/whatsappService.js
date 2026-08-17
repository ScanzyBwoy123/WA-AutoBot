
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const puppeteer = require('puppeteer');

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

      // Let Puppeteer find the Chrome installed during npm install.
      const chromePath = puppeteer.executablePath();

      console.log(
        '[WhatsAppService] Puppeteer Chrome path:',
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
            '--disable-extensions'
          ]
        }
      });

      this.client.on('qr', (qr) => {
        console.log('📱 WHATSAPP QR CODE RECEIVED');

        qrcode.generate(qr, {
          small: true
        });
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
        console.log('✅ WhatsApp client is READY');

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
