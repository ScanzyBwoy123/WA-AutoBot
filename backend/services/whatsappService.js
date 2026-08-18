
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
    this.pairingRequested = false;
    console.log(
      '[WhatsAppService] Pairing-code WhatsApp service initialized'
    );
  }
  init() {
    console.log('[WhatsAppService] Service initialized');
    return {
      success: true,
      message: 'WhatsApp service initialized.'
    };
  }
  getPhoneNumber() {
    let number =
      process.env.WHATSAPP_PHONE ||
      process.env.OWNER_NUMBER ||
      '';
    number = String(number)
      .replace(/\D/g, '');
    return number;
  }
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
      path.join(process.cwd(), 'backend', '.puppeteer'),
      '/opt/render/project/src/backend/.puppeteer',
      '/opt/render/project/src/.puppeteer',
      '/opt/render/.cache/puppeteer'
    ].filter(Boolean);
    for (const root of cacheRoots) {
      if (!fs.existsSync(root)) {
        continue;
      }
      const found = this.findChromeExecutable(root);
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
        message:
          'WhatsApp connection is already starting.'
      };
    }
    this.isConnecting = true;
    this.lastError = null;
    this.qrCode = null;
    this.pairingCode = null;
    this.pairingRequested = false;
    try {
      console.log(
        '🔄 Starting WhatsApp using phone-number pairing...'
      );
      const phoneNumber =
        this.getPhoneNumber();
      if (!phoneNumber) {
        throw new Error(
          'WHATSAPP_PHONE or OWNER_NUMBER is not configured in Render environment variables.'
        );
      }
      console.log(
        '[WhatsAppService] Pairing phone:',
        `${phoneNumber.slice(0, 3)}******${phoneNumber.slice(-2)}`
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
       * Pairing-code event.
       */
      this.client.on(
        'code',
        (code) => {
          console.log(
            '🔑 WHATSAPP PAIRING CODE:',
            code
          );
          this.pairingCode =
            String(code);
          this.qrCode = null;
        }
      );
      /*
       * QR should not be used.
       */
      this.client.on(
        'qr',
        () => {
          console.log(
            'ℹ️ QR received, but QR mode is disabled. Waiting for pairing code.'
          );
          this.qrCode = null;
        }
      );
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
       * EXISTING COMMAND SYSTEM
       *
       * Incoming WhatsApp DM
       *        ↓
       * commands/index.js
       *        ↓
       * existing .menu, .ping, .owner, etc.
       */
      this.client.on(
        'message',
        async (message) => {
          try {
            console.log(
              `📩 Message from ${message.from}: ${message.body}`
            );
            if (message.fromMe) {
              return;
            }
            const text =
              String(
                message.body || ''
              ).trim();
            if (!text) {
              return;
            }
            /*
             * Your existing commands use ".".
             */
            if (!text.startsWith('.')) {
              return;
            }
            console.log(
              `⚙️ Processing command: ${text}`
            );
            const context = {
              message,
              client: this.client,
              whatsapp: this,
              chat: message.from,
              from: message.from,
              sender:
                message.author ||
                message.from,
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
            let result;
            if (
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
              typeof commandHandler ===
              'function'
            ) {
              result =
                await commandHandler(
                  text,
                  context
                );
            } else {
              console.error(
                '[WhatsAppService] Existing command handler could not be loaded.'
              );
              return;
            }
            /*
             * If execute() returns text,
             * send it to the same WhatsApp DM.
             *
             * If the command already used
             * context.reply(), this won't duplicate
             * anything unless it returned a value.
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
            try {
              await message.reply(
                '❌ An error occurred while processing that command.'
              );
            } catch (_) {}
          }
        }
      );
      /*
       * Start WhatsApp Web.
       */
      await this.client.initialize();
      /*
       * Ask for pairing code AFTER initialization
       * has created the WhatsApp Web page.
       *
       * This is the important part for 1.34.7.
       */
      if (
        !this.isReady &&
        !this.pairingRequested
      ) {
        this.pairingRequested = true;
        try {
          console.log(
            '🔑 Requesting WhatsApp phone-number pairing code...'
          );
          const code =
            await this.client.requestPairingCode(
              phoneNumber,
              true,
              180000
            );
          this.pairingCode =
            String(code);
          console.log(
            '🔑 PAIRING CODE:',
            this.pairingCode
          );
        } catch (pairingError) {
          console.error(
            '[WhatsAppService] Pairing code error:',
            pairingError
          );
          this.pairingRequested = false;
          this.lastError =
            pairingError.message;
          throw pairingError;
        }
      }
      return {
        success: true,
        message:
          'WhatsApp pairing initialization started.'
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
  getQR() {
    return {
      available: false,
      qr: null
    };
  }
  getPairingCode() {
    return {
      available:
        !!this.pairingCode,
      pairingCode:
        this.pairingCode
    };
  }
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
      qrAvailable: false,
      pairingCodeAvailable:
        !!this.pairingCode,
      pairingCode:
        this.pairingCode,
      error:
        this.lastError
    };
  }
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
      this.pairingRequested = false;
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
      this.pairingRequested = false;
      throw error;
    }
  }
}
module.exports = new WhatsAppService();
