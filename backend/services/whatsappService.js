
const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');

class WhatsAppService {
  constructor() {
    this.client = null;
    this.isReady = false;
    this.isConnecting = false;
    this.qrCode = null;
    this.lastError = null;

    console.log('[WhatsAppService] Render-optimized WhatsApp service initialized');
  }

  init() {
    console.log('[WhatsAppService] Service initialized');

    return {
      success: true,
      message: 'WhatsApp service initialized.'
    };
  }

  /*
   * Find the Chrome installed by Puppeteer.
   *
   * We deliberately do NOT hard-code a Chrome version.
   */
  getChromePath() {
    const candidates = [];

    // Explicit environment variables first.
    if (process.env.CHROME_BIN) {
      candidates.push(process.env.CHROME_BIN);
    }

    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      candidates.push(process.env.PUPPETEER_EXECUTABLE_PATH);
    }

    // Puppeteer cache locations.
    const cacheRoots = [
      process.env.PUPPETEER_CACHE_DIR,
      path.join(process.cwd(), '.puppeteer'),
      '/opt/render/project/src/backend/.puppeteer',
      '/opt/render/project/src/.puppeteer',
      '/opt/render/.cache/puppeteer'
    ].filter(Boolean);

    /*
     * Search recursively for the actual Chrome executable.
     * This avoids depending on Chrome 146, 148, or any future version.
     */
    for (const root of cacheRoots) {
      if (!fs.existsSync(root)) {
        continue;
      }

      const found = this.findChromeExecutable(root);

      if (found) {
        candidates.push(found);
      }
    }

    // Common system Chrome locations.
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser'
    );

    for (const candidate of candidates) {
      if (candidate && fs.existsSync(candidate)) {
        console.log('[WhatsAppService] Chrome found:', candidate);
        return candidate;
      }
    }

    throw new Error(
      'Chrome executable not found. Puppeteer installed Chrome, but the executable could not be located.'
    );
  }

  /*
   * Recursively search for a file named "chrome".
   */
  findChromeExecutable(directory) {
    try {
      const entries = fs.readdirSync(directory, {
        withFileTypes: true
      });

      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);

        if (
          entry.isFile() &&
          entry.name === 'chrome'
        ) {
          try {
            fs.accessSync(fullPath, fs.constants.X_OK);
            return fullPath;
          } catch (_) {
            // Not executable; continue searching.
          }
        }
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        /*
         * Don't search unnecessarily large/unrelated directories.
         */
        if (
          entry.name === 'node_modules' ||
          entry.name === '.git'
        ) {
          continue;
        }

        const result = this.findChromeExecutable(
          path.join(directory, entry.name)
        );

        if (result) {
          return result;
        }
      }
    } catch (error) {
      console.log(
        '[WhatsAppService] Could not inspect:',
        directory
      );
    }

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
    this.qrCode = null;

    try {
      console.log('🔄 Starting WhatsApp connection...');

      const chromePath = this.getChromePath();

      console.log(
        '[WhatsAppService] Using Chrome:',
        chromePath
      );

      /*
       * Only create one client.
       */
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

          /*
           * Memory-conscious Chromium configuration
           * for small Render instances.
           */
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
            '--disable-backgrounding-occluded-windows',
            '--disable-breakpad',
            '--disable-component-extensions-with-background-pages',
            '--disable-features=Translate,BackForwardCache',
            '--disable-hang-monitor',
            '--disable-ipc-flooding-protection',
            '--disable-popup-blocking',
            '--disable-prompt-on-repost',
            '--disable-renderer-backgrounding',

            '--disable-sync',
            '--metrics-recording-only',

            '--mute-audio',

            /*
             * Keep Chromium's renderer footprint smaller.
             */
            '--js-flags=--max-old-space-size=256'
          ]
        }
      });

      this.client.on('qr', (qr) => {
        console.log('📱 WHATSAPP QR CODE RECEIVED');

        /*
         * Store only the raw QR string.
         * Do NOT convert it into a large base64 data URL.
         */
        this.qrCode = qr;

        console.log(
          '✅ QR code is available.'
        );
      });

      this.client.on('authenticated', () => {
        console.log('🔐 WhatsApp authenticated');

        this.qrCode = null;
      });

      this.client.on('auth_failure', (message) => {
        console.error(
          '❌ WhatsApp authentication failure:',
          message
        );

        this.isReady = false;
        this.isConnecting = false;
        this.qrCode = null;
        this.lastError = String(message);
      });

      this.client.on('ready', () => {
        console.log(
          '✅ WhatsApp client is READY'
        );

        this.isReady = true;
        this.isConnecting = false;
        this.qrCode = null;
        this.lastError = null;
      });

      this.client.on('disconnected', async (reason) => {
        console.log(
          '🔴 WhatsApp disconnected:',
          reason
        );

        this.isReady = false;
        this.isConnecting = false;
        this.qrCode = null;

        /*
         * Do not automatically create another browser.
         * Automatic reconnect loops can cause Render
         * memory exhaustion.
         */
      });

      /*
       * Keep message handling lightweight.
       */
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
      this.qrCode = null;
      this.lastError = error.message;

      /*
       * Destroy the failed client so that a failed
       * Chromium process is not left consuming RAM.
       */
      try {
        if (this.client) {
          await this.client.destroy();
        }
      } catch (_) {
        // Ignore cleanup errors.
      }

      this.client = null;

      throw error;
    }
  }

  /*
   * Return the current QR information.
   */
  getQR() {
    return {
      available: !!this.qrCode,
      qr: this.qrCode
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
      qrAvailable: !!this.qrCode,
      error: this.lastError
    };
  }

  async disconnect() {
    try {
      if (!this.client) {
        this.isReady = false;
        this.isConnecting = false;
        this.qrCode = null;

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
      this.qrCode = null;

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

      this.client = null;
      this.isReady = false;
      this.isConnecting = false;
      this.qrCode = null;

      throw error;
    }
  }
}

module.exports = new WhatsAppService();
