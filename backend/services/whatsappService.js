
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

class WhatsAppService {
  constructor() {
    this.client = null;
    this.isReady = false;
    this.isConnecting = false;
    this.qrDataUrl = null;
    this.lastError = null;

    console.log('[WhatsAppService] Real WhatsApp service initialized');
  }

  init() {
    console.log('[WhatsAppService] Service initialized');

    return {
      success: true,
      message: 'WhatsApp service initialized.'
    };
  }

  /*
   * Find the Chrome browser installed by Puppeteer.
   */
  getChromePath() {
    const possiblePaths = [
      process.env.PUPPETEER_EXECUTABLE_PATH,

      process.env.CHROME_BIN,

      path.join(
        process.cwd(),
        '.puppeteer',
        'chrome',
        'linux-148.0.7778.97',
        'chrome-linux64',
        'chrome'
      ),

      '/opt/render/project/src/backend/.puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome',

      '/opt/render/project/src/.puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome',

      '/opt/render/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome'
    ];

    for (const chromePath of possiblePaths) {
      if (chromePath && fs.existsSync(chromePath)) {
        console.log(
          '[WhatsAppService] Chrome found:',
          chromePath
        );

        return chromePath;
      }
    }

    throw new Error(
      'Chrome executable not found. Checked Puppeteer and Render Chrome locations.'
    );
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
        success: true,
        message: 'WhatsApp connection is already starting.'
      };
    }

    this.isConnecting = true;
    this.lastError = null;

    try {
      console.log('🔄 Starting WhatsApp connection...');

      const chromePath = this.getChromePath();

      console.log(
        '[WhatsAppService] Using Chrome:',
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

      this.client.on('qr', async (qr) => {
        console.log('📱 WHATSAPP QR CODE RECEIVED');

        try {
          this.qrDataUrl = await qrcode.toDataURL(qr);

          console.log(
            '✅ QR code available at /api/bot/qr'
          );
        } catch (error) {
          console.error(
            '[QR Error]',
            error
          );

          this.lastError = error.message;
        }
      });

      this.client.on('authenticated', () => {
        console.log('🔐 WhatsApp authenticated');

        this.qrDataUrl = null;
      });

      this.client.on('auth_failure', (message) => {
        console.error(
          '❌ WhatsApp authentication failure:',
          message
        );

        this.isReady = false;
        this.isConnecting = false;
        this.qrDataUrl = null;
        this.lastError = message;
      });

      this.client.on('ready', () => {
        console.log(
          '✅ WhatsApp client is READY'
        );

        this.isReady = true;
        this.isConnecting = false;
        this.qrDataUrl = null;
        this.lastError = null;
      });

      this.client.on('disconnected', (reason) => {
        console.log(
          '🔴 WhatsApp disconnected:',
          reason
        );

        this.isReady = false;
        this.isConnecting = false;
        this.qrDataUrl = null;
      });

      this.client.on('message', async (message) => {
        console.log(
          `📩 Message from ${message.from}: ${message.body}`
        );
      });

      await this.client.initialize();

      return {
        success: true,
        message:
          'WhatsApp connection initialization started.'
      };

    } catch (error) {
      console.error(
        '[WhatsAppService] Connection error:',
        error
      );

      this.isReady = false;
      this.isConnecting = false;
      this.lastError = error.message;

      throw error;
    }
  }

  getQR() {
    return {
      available: !!this.qrDataUrl,
      qr: this.qrDataUrl
    };
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
      status,
      qrAvailable: !!this.qrDataUrl,
      error: this.lastError
    };
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
      this.qrDataUrl = null;

      console.log(
        '🔴 WhatsApp connection stopped'
      );

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
      this.qrDataUrl = null;

      throw error;
    }
  }
}

module.exports = new WhatsAppService();
