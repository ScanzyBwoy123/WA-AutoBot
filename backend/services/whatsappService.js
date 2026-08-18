
const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const commandHandler = require('../../commands');
class WhatsAppService {
  constructor() {
    this.client = null;
    this.isReady = false;
    this.isConnecting = false;
    this.qrCode = null;
    this.pairingCode = null;
    this.lastError = null;
    console.log(
      '[WhatsAppService] Render WhatsApp service initialized'
    );
  }
  init() {
    console.log(
      '[WhatsAppService] Service initialized'
    );
    return {
      success: true,
      message: 'WhatsApp service initialized.'
    };
  }
  /*
  |--------------------------------------------------------------------------
  | FIND CHROME
  |--------------------------------------------------------------------------
  */
  getChromePath() {
    const candidates = [];
    if (process.env.CHROME_BIN) {
      candidates.push(process.env.CHROME_BIN);
    }
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      candidates.push(
        process.env.PUPPETEER_EXECUTABLE_PATH
      );
    }
    const cacheRoots = [
      process.env.PUPPETEER_CACHE_DIR,
      path.join(process.cwd(), '.puppeteer'),
      path.join(
        process.cwd(),
        'backend',
        '.puppeteer'
      ),
      '/opt/render/project/src/backend/.puppeteer',
      '/opt/render/project/src/.puppeteer',
      '/opt/render/.cache/puppeteer'
    ].filter(Boolean);
    for (const root of cacheRoots) {
      if (!fs.existsSync(root)) {
        continue;
      }
      const found =
        this.findChromeExecutable(root);
      if (found) {
        console.log(
          '[WhatsAppService] Chrome found:',
          found
        );
        return found;
      }
    }
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser'
    );
    for (const candidate of candidates) {
      if (
        candidate &&
        fs.existsSync(candidate)
      ) {
        console.log(
          '[WhatsAppService] Chrome found:',
          candidate
        );
        return candidate;
      }
    }
    throw new Error(
      'Chrome executable not found.'
    );
  }
  findChromeExecutable(directory) {
    try {
      const entries = fs.readdirSync(
        directory,
        {
          withFileTypes: true
        }
      );
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
        if (!entry.isDirectory()) {
          continue;
        }
        if (
          entry.name === 'node_modules' ||
          entry.name === '.git'
        ) {
          continue;
        }
        const result =
          this.findChromeExecutable(
            path.join(
              directory,
              entry.name
            )
          );
        if (result) {
          return result;
        }
      }
    } catch (_) {}
    return null;
  }
  /*
  |--------------------------------------------------------------------------
  | START WHATSAPP
  |--------------------------------------------------------------------------
  */
  async connect() {
    if (this.isReady) {
      return {
        success: true,
        message:
          'WhatsApp is already connected.'
      };
    }
    if (this.isConnecting) {
      return {
        success: true,
        message:
          'WhatsApp connection is already starting.'
      };
    }
    this.isConnecting = true;
    this.lastError = null;
    this.qrCode = null;
    this.pairingCode = null;
    try {
      console.log(
        '🔄 Starting WhatsApp connection...'
      );
      const chromePath =
        this.getChromePath();
      console.log(
        '[WhatsAppService] Using Chrome:',
        chromePath
      );
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
            '--js-flags=--max-old-space-size=256'
          ]
        }
      });
      /*
       |--------------------------------------------------------------------------
       | QR CODE
       |--------------------------------------------------------------------------
       */
      this.client.on(
        'qr',
        (qr) => {
          console.log(
            '📱 WHATSAPP QR CODE RECEIVED'
          );
          this.qrCode = qr;
          console.log(
            '✅ QR code is available.'
          );
        }
      );
      /*
       |--------------------------------------------------------------------------
       | AUTHENTICATED
       |--------------------------------------------------------------------------
       */
      this.client.on(
        'authenticated',
        () => {
          console.log(
            '🔐 WhatsApp authenticated'
          );
          this.qrCode = null;
          this.pairingCode = null;
        }
      );
      /*
       |--------------------------------------------------------------------------
       | AUTH FAILURE
       |--------------------------------------------------------------------------
       */
      this.client.on(
        'auth_failure',
        (message) => {
          console.error(
            '❌ WhatsApp authentication failure:',
            message
          );
          this.isReady = false;
          this.isConnecting = false;
          this.qrCode = null;
          this.pairingCode = null;
          this.lastError =
            String(message);
        }
      );
      /*
       |--------------------------------------------------------------------------
       | READY
       |--------------------------------------------------------------------------
       */
      this.client.on(
        'ready',
        () => {
          console.log(
            '✅ WhatsApp client is READY'
          );
          this.isReady = true;
          this.isConnecting = false;
          this.qrCode = null;
          this.pairingCode = null;
          this.lastError = null;
        }
      );
      /*
       |--------------------------------------------------------------------------
       | DISCONNECTED
       |--------------------------------------------------------------------------
       */
      this.client.on(
        'disconnected',
        (reason) => {
          console.log(
            '🔴 WhatsApp disconnected:',
            reason
          );
          this.isReady = false;
          this.isConnecting = false;
          this.qrCode = null;
          this.pairingCode = null;
        }
      );
      /*
       |--------------------------------------------------------------------------
       | WHATSAPP MESSAGE → EXISTING COMMAND SYSTEM
       |--------------------------------------------------------------------------
       */
      this.client.on(
        'message',
        async (message) => {
          try {
            console.log(
              `📩 Message from ${message.from}: ${message.body}`
            );
            const text =
              String(
                message.body || ''
              ).trim();
            if (!text) {
              return;
            }
            /*
             * Ignore messages sent by the bot itself.
             */
            if (message.fromMe) {
              return;
            }
            /*
             * Only process commands beginning
             * with the existing "." prefix.
             *
             * Examples:
             * .menu
             * .ping
             * .owner
             * .status
             * .play song
             */
            if (!text.startsWith('.')) {
              return;
            }
            console.log(
              `⚙️ Processing command: ${text}`
            );
            /*
             * Build a context for the existing
             * command system.
             */
            const context = {
              message,
              client: this.client,
              whatsapp: this,
              chat: message.from,
              sender: message.author || message.from,
              from: message.from,
              reply: async (replyText) => {
                if (
                  replyText === undefined ||
                  replyText === null
                ) {
                  return;
                }
                await message.reply(
                  String(replyText)
                );
              }
            };
            /*
             * Try the existing command handler.
             *
             * Different command-handler versions
             * may expose different methods.
             */
            let result = null;
            if (
              commandHandler &&
              typeof commandHandler.handle ===
                'function'
            ) {
              result =
                await commandHandler.handle(
                  text,
                  context
                );
            } else if (
              commandHandler &&
              typeof commandHandler.execute ===
                'function'
            ) {
              result =
                await commandHandler.execute(
                  text,
                  context
                );
            } else if (
              typeof commandHandler ===
              'function'
            ) {
              result =
                await commandHandler(
                  text,
                  context
                );
            } else {
              console.log(
                '[WhatsAppService] Command handler does not expose handle(), execute(), or function interface.'
              );
              return;
            }
            /*
             * If the command system returns text,
             * send it back to the same DM.
             */
            if (
              result !== undefined &&
              result !== null &&
              String(result).trim() !== ''
            ) {
              await message.reply(
                String(result)
              );
            }
            console.log(
              `✅ Command processed: ${text}`
            );
          } catch (error) {
            console.error(
              '[Command Handler Error]',
              error
            );
            /*
             * Send a friendly error to the
             * same WhatsApp conversation.
             */
            try {
              await message.reply(
                '❌ Sorry, an error occurred while processing that command.'
              );
            } catch (_) {}
          }
        }
      );
      /*
       |--------------------------------------------------------------------------
       | INITIALIZE
       |--------------------------------------------------------------------------
       */
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
      this.pairingCode = null;
      this.lastError =
        error.message;
      try {
        if (this.client) {
          await this.client.destroy();
        }
      } catch (_) {}
      this.client = null;
      throw error;
    }
  }
  /*
  |--------------------------------------------------------------------------
  | QR
  |--------------------------------------------------------------------------
  */
  getQR() {
    return {
      available: !!this.qrCode,
      qr: this.qrCode
    };
  }
  /*
  |--------------------------------------------------------------------------
  | PAIRING CODE
  |--------------------------------------------------------------------------
  */
  getPairingCode() {
    return {
      available:
        !!this.pairingCode,
      pairingCode:
        this.pairingCode
    };
  }
  /*
  |--------------------------------------------------------------------------
  | STATUS
  |--------------------------------------------------------------------------
  */
  getStatus() {
    let status =
      'Disconnected';
    if (this.isReady) {
      status = 'Connected';
    } else if (
      this.isConnecting
    ) {
      status = 'Connecting';
    }
    return {
      connected:
        this.isReady,
      connecting:
        this.isConnecting,
      status,
      qrAvailable:
        !!this.qrCode,
      pairingCodeAvailable:
        !!this.pairingCode,
      pairingCode:
        this.pairingCode,
      error:
        this.lastError
    };
  }
  /*
  |--------------------------------------------------------------------------
  | DISCONNECT
  |--------------------------------------------------------------------------
  */
  async disconnect() {
    try {
      if (!this.client) {
        this.isReady = false;
        this.isConnecting = false;
        this.qrCode = null;
        this.pairingCode = null;
        return {
          success: true,
          message:
            'WhatsApp is not connected.'
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
      this.pairingCode = null;
      console.log(
        '🔴 WhatsApp connection stopped'
      );
      return {
        success: true,
        message:
          'WhatsApp connection stopped.'
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
      this.pairingCode = null;
      throw error;
    }
  }
}
module.exports = new WhatsAppService();
