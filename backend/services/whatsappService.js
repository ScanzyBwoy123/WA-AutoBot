
const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const commands = require('../../commands');
class WhatsAppService {
  constructor() {
    this.client = null;
    this.isReady = false;
    this.isConnecting = false;
    this.pairingCode = null;
    this.lastError = null;
    this.pairingRequested = false;
    console.log(
      '[WhatsAppService] Stable Render WhatsApp service initialized'
    );
  }
  init() {
    return {
      success: true,
      message: 'WhatsApp service initialized.'
    };
  }
  getPhoneNumber() {
    return String(
      process.env.WHATSAPP_PHONE ||
      process.env.OWNER_NUMBER ||
      ''
    ).replace(/\D/g, '');
  }
  findChromeExecutable(directory) {
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
        const result =
          this.findChromeExecutable(
            path.join(
              directory,
              entry.name
            )
          );
        if (result) return result;
      }
    } catch (_) {}
    return null;
  }
  getChromePath() {
    const directPaths = [
      process.env.CHROME_BIN,
      process.env.PUPPETEER_EXECUTABLE_PATH,
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser'
    ].filter(Boolean);
    for (const chromePath of directPaths) {
      if (fs.existsSync(chromePath)) {
        console.log(
          '[WhatsAppService] Chrome:',
          chromePath
        );
        return chromePath;
      }
    }
    const roots = [
      process.env.PUPPETEER_CACHE_DIR,
      path.join(process.cwd(), '.puppeteer'),
      path.join(
        process.cwd(),
        'backend',
        '.puppeteer'
      ),
      '/opt/render/.cache/puppeteer',
      '/opt/render/project/src/.puppeteer',
      '/opt/render/project/src/backend/.puppeteer'
    ].filter(Boolean);
    for (const root of roots) {
      if (!fs.existsSync(root)) continue;
      const chrome =
        this.findChromeExecutable(root);
      if (chrome) {
        console.log(
          '[WhatsAppService] Chrome:',
          chrome
        );
        return chrome;
      }
    }
    throw new Error(
      'Chrome executable not found.'
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
        message:
          'WhatsApp connection is already starting.'
      };
    }
    this.isConnecting = true;
    this.lastError = null;
    this.pairingCode = null;
    this.pairingRequested = false;
    try {
      const phoneNumber =
        this.getPhoneNumber();
      if (!phoneNumber) {
        throw new Error(
          'WHATSAPP_PHONE or OWNER_NUMBER is missing.'
        );
      }
      console.log(
        '🔄 Starting WhatsApp connection...'
      );
      const chromePath =
        this.getChromePath();
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
            '--disable-renderer-backgrounding',
            '--disable-sync',
            '--metrics-recording-only',
            '--mute-audio',
            '--js-flags=--max-old-space-size=256'
          ]
        }
      });
      this.client.on(
        'code',
        (code) => {
          this.pairingCode =
            String(code);
          console.log(
            '🔑 WhatsApp pairing code:',
            this.pairingCode
          );
        }
      );
      this.client.on(
        'qr',
        () => {
          /*
           * QR intentionally ignored.
           * This bot uses phone-number pairing.
           */
          console.log(
            'ℹ️ QR received and ignored.'
          );
        }
      );
      this.client.on(
        'authenticated',
        () => {
          console.log(
            '🔐 WhatsApp authenticated'
          );
          this.pairingCode = null;
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
          this.pairingCode = null;
          this.lastError = null;
        }
      );
      this.client.on(
        'auth_failure',
        (message) => {
          console.error(
            '❌ WhatsApp auth failure:',
            message
          );
          this.isReady = false;
          this.isConnecting = false;
          this.pairingCode = null;
          this.lastError =
            String(message);
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
          this.pairingCode = null;
        }
      );
      /*
       * MAIN COMMAND HANDLER
       */
      this.client.on(
        'message',
        async (message) => {
          try {
            /*
             * Ignore WhatsApp Status.
             */
            if (
              message.from ===
              'status@broadcast'
            ) {
              return;
            }
            /*
             * Ignore our own messages.
             */
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
             * Only process bot commands.
             */
            if (!text.startsWith('.')) {
              return;
            }
            console.log(
              `📩 Command from ${message.from}: ${text}`
            );
            const context = {
              message,
              client: this.client,
              whatsapp: this,
              from: message.from,
              chat: message.from,
              sender:
                message.author ||
                message.from,
              reply: async (response) => {
                if (
                  response === undefined ||
                  response === null
                ) {
                  return null;
                }
                const replyText =
                  String(response);
                if (!replyText.trim()) {
                  return null;
                }
                /*
                 * Use message.reply first.
                 */
                try {
                  return await message.reply(
                    replyText
                  );
                } catch (replyError) {
                  console.error(
                    '[WhatsApp Reply Error]',
                    replyError.message
                  );
                  /*
                   * Fallback to direct client.sendMessage.
                   */
                  try {
                    return await this.client.sendMessage(
                      message.from,
                      replyText
                    );
                  } catch (sendError) {
                    console.error(
                      '[WhatsApp Send Error]',
                      sendError.message
                    );
                    throw sendError;
                  }
                }
              }
            };
            /*
             * Execute existing commands.
             */
            const result =
              await commands.execute(
                text,
                context
              );
            /*
             * Send returned command response.
             *
             * IMPORTANT:
             * commands/index.js returns the text.
             */
            if (
              result !== undefined &&
              result !== null
            ) {
              const response =
                String(result).trim();
              if (response) {
                await context.reply(
                  response
                );
              }
            }
            console.log(
              `✅ Command completed: ${text}`
            );
          } catch (error) {
            console.error(
              '[Command Handler Error]',
              error
            );
            /*
             * Don't let command errors
             * terminate the WhatsApp client.
             */
            try {
              await message.reply(
                '❌ Something went wrong while processing that command.'
              );
            } catch (_) {}
          }
        }
      );
      /*
       * Initialize WhatsApp.
       */
      await this.client.initialize();
      /*
       * Request pairing code.
       */
      if (
        !this.isReady &&
        !this.pairingRequested
      ) {
        this.pairingRequested = true;
        console.log(
          '🔑 Requesting phone-number pairing code...'
        );
        try {
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
        } catch (error) {
          console.error(
            '[Pairing Code Error]',
            error
          );
          this.pairingRequested = false;
          this.lastError =
            error.message;
          throw error;
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
      this.pairingCode = null;
      this.pairingRequested = false;
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
      this.pairingCode = null;
      this.pairingRequested = false;
      throw error;
    }
  }
}
module.exports = new WhatsAppService();
