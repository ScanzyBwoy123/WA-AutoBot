const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');

class WhatsAppService {
  constructor() {
    this.client = null;
    this.isReady = false;
    this.isConnecting = false;
    this.pairingCode = null;
    this.lastError = null;

    console.log('[WhatsAppService] Pairing-code service initialized');
  }

  init() {
    return {
      success: true,
      message: 'WhatsApp service initialized.'
    };
  }

  getChromePath() {
    const candidates = [];

    if (process.env.CHROME_BIN) {
      candidates.push(process.env.CHROME_BIN);
    }

    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      candidates.push(process.env.PUPPETEER_EXECUTABLE_PATH);
    }

    const roots = [
      process.env.PUPPETEER_CACHE_DIR,
      path.join(process.cwd(), '.puppeteer'),
      '/opt/render/project/src/backend/.puppeteer',
      '/opt/render/project/src/.puppeteer',
      '/opt/render/.cache/puppeteer'
    ].filter(Boolean);

    for (const root of roots) {
      if (!fs.existsSync(root)) continue;

      const found = this.findChrome(root);

      if (found) {
        console.log('[WhatsAppService] Chrome found:', found);
        return found;
      }
    }

    const systemChrome = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser'
    ];

    for (const candidate of systemChrome) {
      if (fs.existsSync(candidate)) {
        console.log('[WhatsAppService] Chrome found:', candidate);
        return candidate;
      }
    }

    throw new Error(
      'Chrome executable not found.'
    );
  }

  findChrome(directory) {
    try {
      const entries = fs.readdirSync(directory, {
        withFileTypes: true
      });

      for (const entry of entries) {
        const fullPath = path.join(
          directory,
          entry.name
        );

        if (
          entry.isFile() &&
          entry.name === 'chrome'
        ) {
          try {
            fs.accessSync(
              fullPath,
              fs.constants.X_OK
            );

            return fullPath;
          } catch (_) {}
        }
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        if (
          entry.name === 'node_modules' ||
          entry.name === '.git'
        ) {
          continue;
        }

        const result = this.findChrome(
          path.join(directory, entry.name)
        );

        if (result) return result;
      }
    } catch (_) {}

    return null;
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
    this.pairingCode = null;

    try {
      console.log(
        '🔄 Starting WhatsApp pairing connection...'
      );

      const chromePath = this.getChromePath();

      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: 'wa-autobot',
          dataPath: path.join(
            process.cwd(),
            '.wwebjs_auth'
          )
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
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-sync',
            '--mute-audio',
            '--disable-popup-blocking',
            '--disable-features=Translate,BackForwardCache',
            '--js-flags=--max-old-space-size=256'
          ]
        }
      });

      this.client.on('code', (code) => {
        console.log(
          '🔑 WHATSAPP PAIRING CODE:',
          code
        );

        this.pairingCode = code;
      });

      this.client.on('authenticated', () => {
        console.log(
          '🔐 WhatsApp authenticated'
        );

        this.pairingCode = null;
      });

      this.client.on('ready', () => {
        console.log(
          '✅ WhatsApp client is READY'
        );

        this.isReady = true;
        this.isConnecting = false;
        this.pairingCode = null;
        this.lastError = null;
      });

      this.client.on('auth_failure', (message) => {
        console.error(
          '❌ WhatsApp authentication failure:',
          message
        );

        this.isReady = false;
        this.isConnecting = false;
        this.pairingCode = null;
        this.lastError = String(message);
      });

      this.client.on('disconnected', (reason) => {
        console.log(
          '🔴 WhatsApp disconnected:',
          reason
        );

        this.isReady = false;
        this.isConnecting = false;
        this.pairingCode = null;
      });

      this.client.on('message', async (message) => {
        try {
          console.log(
            `📩 Message from ${message.from}: ${message.body}`
          );
        } catch (error) {
          console.error(
            '[Message Handler Error]',
            error
          );
        }
      });

      await this.client.initialize();

      /*
       * Use the existing OWNER_NUMBER variable.
       *
       * Format:
       * 233XXXXXXXXX
       *
       * No + and no spaces.
       */
      const phoneNumber = String(
        process.env.WHATSAPP_PHONE_NUMBER ||
        process.env.OWNER_NUMBER ||
        ''
      ).replace(/\D/g, '');

      if (!phoneNumber) {
        throw new Error(
          'OWNER_NUMBER environment variable is missing.'
        );
      }

      console.log(
        '[WhatsAppService] Requesting WhatsApp pairing code...'
      );

      const code =
        await this.client.requestPairingCode(
          phoneNumber,
          true,
          180000
        );

      this.pairingCode = code;

      console.log(
        '🔑 WHATSAPP PAIRING CODE:',
        code
      );

      return {
        success: true,
        message: 'WhatsApp pairing code generated.',
        pairingCode: code
      };

    } catch (error) {
      console.error(
        '[WhatsAppService] Connection error:',
        error
      );

      this.isReady = false;
      this.isConnecting = false;
      this.pairingCode = null;
      this.lastError = error.message;

      try {
        if (this.client) {
          await this.client.destroy();
        }
      } catch (_) {}

      this.client = null;

      throw error;
    }
  }

  getPairingCode() {
    return {
      available: !!this.pairingCode,
      pairingCode: this.pairingCode
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
      pairingCodeAvailable: !!this.pairingCode,
      pairingCode: this.pairingCode,
      error: this.lastError
    };
  }

  async disconnect() {
    try {
      if (!this.client) {
        this.isReady = false;
        this.isConnecting = false;
        this.pairingCode = null;

        return {
          success: true,
          message: 'WhatsApp is not connected.'
        };
      }

      console.log(
        '🔴 Stopping WhatsApp connection...'
      );

      await this.client.destroy();

      this.client = null;
      this.isReady = false;
      this.isConnecting = false;
      this.pairingCode = null;

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
      this.pairingCode = null;

      throw error;
    }
  }
}

module.exports = new WhatsAppService();
