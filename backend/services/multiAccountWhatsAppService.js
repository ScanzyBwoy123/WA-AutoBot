const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');

const multiAccountService =
  require('./multiAccountService');

class MultiAccountWhatsAppService {
  constructor() {
    this.clients = new Map();
    this.connecting = new Set();
    this.pairingCodes = new Map();
    this.errors = new Map();

    this.sessionsDir = path.join(
      process.cwd(),
      '.wwebjs_multi_accounts'
    );

    this.ensureSessionDirectory();

    console.log(
      '[MultiAccountWhatsApp] Multi-account engine initialized'
    );
  }

  ensureSessionDirectory() {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, {
        recursive: true
      });
    }
  }

  normalizeNumber(number) {
    return String(number || '')
      .replace(/\D/g, '');
  }

  getSessionId(phone) {
    return `customer-${this.normalizeNumber(phone)}`;
  }

  getSessionPath(phone) {
    return path.join(
      this.sessionsDir,
      this.getSessionId(phone)
    );
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
        return chromePath;
      }
    }

    const roots = [
      process.env.PUPPETEER_CACHE_DIR,
      path.join(
        process.cwd(),
        '.puppeteer'
      ),
      path.join(
        process.cwd(),
        'backend',
        '.puppeteer'
      ),
      '/opt/render/.cache/puppeteer',
      '/opt/render/project/src/.puppeteer',
      '/opt/render/project/src/backend/.puppeteer'
    ].filter(Boolean);

    const findChrome = (directory) => {
      try {
        const entries = fs.readdirSync(
          directory,
          {
            withFileTypes: true
          }
        );

        for (const entry of entries) {
          const fullPath =
            path.join(
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

          const result =
            findChrome(
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
    };

    for (const root of roots) {
      if (!fs.existsSync(root)) {
        continue;
      }

      const chrome =
        findChrome(root);

      if (chrome) {
        return chrome;
      }
    }

    throw new Error(
      'Chrome executable not found.'
    );
  }

  async startAccount(phone) {
    const normalized =
      this.normalizeNumber(phone);

    if (!normalized) {
      throw new Error(
        'Phone number is required.'
      );
    }

    /*
     * Check the customer's trial/payment status
     * before starting WhatsApp.
     */
    const accountCheck =
      multiAccountService.checkAccount(
        normalized
      );

    if (!accountCheck.exists) {
      throw new Error(
        'Account has not been registered.'
      );
    }

    if (!accountCheck.active) {
      throw new Error(
        'Your trial or subscription has expired. Please subscribe to continue.'
      );
    }

    /*
     * Already connected.
     */
    const existing =
      this.clients.get(normalized);

    if (existing) {
      const existingInfo =
        existing.info;

      if (existingInfo) {
        multiAccountService.setConnected(
          normalized,
          true
        );

        return {
          success: true,
          message:
            'WhatsApp account is already connected.'
        };
      }
    }

    /*
     * Prevent duplicate startup requests.
     */
    if (
      this.connecting.has(
        normalized
      )
    ) {
      return {
        success: true,
        message:
          'WhatsApp account is already connecting.'
      };
    }

    this.connecting.add(normalized);
    this.errors.delete(normalized);
    this.pairingCodes.delete(normalized);

    try {
      const chromePath =
        this.getChromePath();

      console.log(
        `🔄 Starting customer WhatsApp account: ${normalized}`
      );

      const client =
        new Client({
          authStrategy:
            new LocalAuth({
              clientId:
                this.getSessionId(
                  normalized
                ),

              dataPath:
                this.sessionsDir
            }),

          puppeteer: {
            executablePath:
              chromePath,

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

      this.clients.set(
        normalized,
        client
      );

      /*
       * Pairing code.
       */
      client.on(
        'code',
        (code) => {
          const pairingCode =
            String(code);

          this.pairingCodes.set(
            normalized,
            pairingCode
          );

          multiAccountService.setPairingCode(
            normalized,
            pairingCode
          );

          console.log(
            `🔑 Pairing code for ${normalized}: ${pairingCode}`
          );
        }
      );

      /*
       * QR is intentionally ignored.
       * Customers will use phone-number pairing.
       */
      client.on(
        'qr',
        () => {
          console.log(
            `ℹ️ QR received for ${normalized}; phone pairing is being used.`
          );
        }
      );

      client.on(
        'authenticated',
        () => {
          console.log(
            `🔐 Customer authenticated: ${normalized}`
          );

          this.pairingCodes.delete(
            normalized
          );

          multiAccountService.clearPairingCode(
            normalized
          );
        }
      );

      /*
       * READY
       */
      client.on(
        'ready',
        () => {
          console.log(
            `✅ Customer WhatsApp READY: ${normalized}`
          );

          this.connecting.delete(
            normalized
          );

          this.pairingCodes.delete(
            normalized
          );

          this.errors.delete(
            normalized
          );

          multiAccountService.setConnected(
            normalized,
            true
          );

          multiAccountService.clearPairingCode(
            normalized
          );
        }
      );

      /*
       * Authentication failure.
       */
      client.on(
        'auth_failure',
        (message) => {
          console.error(
            `❌ Authentication failure for ${normalized}:`,
            message
          );

          this.connecting.delete(
            normalized
          );

          this.pairingCodes.delete(
            normalized
          );

          this.errors.set(
            normalized,
            String(message)
          );

          multiAccountService.setConnected(
            normalized,
            false
          );

          multiAccountService.clearPairingCode(
            normalized
          );
        }
      );

      /*
       * Disconnected.
       */
      client.on(
        'disconnected',
        (reason) => {
          console.log(
            `🔴 Customer WhatsApp disconnected: ${normalized}`,
            reason
          );

          this.connecting.delete(
            normalized
          );

          this.pairingCodes.delete(
            normalized
          );

          this.errors.set(
            normalized,
            String(reason || 'Disconnected')
          );

          multiAccountService.setConnected(
            normalized,
            false
          );

          multiAccountService.clearPairingCode(
            normalized
          );

          this.clients.delete(
            normalized
          );
        }
      );

      /*
       * Automatically view and react to new statuses.
       */
      client.on(
        'message_create',
        async (message) => {
          try {
            if (
              message.from !==
              'status@broadcast'
            ) {
              return;
            }

            console.log(
              `👀 New status for customer ${normalized}`
            );

            /*
             * Mark status as viewed.
             */
            try {
              const chat =
                await message.getChat();

              if (
                chat &&
                typeof chat.sendSeen ===
                  'function'
              ) {
                await chat.sendSeen();

                console.log(
                  `👁️ Status viewed for ${normalized}`
                );
              }
            } catch (error) {
              console.error(
                `❌ Status view error for ${normalized}:`,
                error.message
              );
            }

            /*
             * React with ❤️.
             */
            try {
              if (
                typeof message.react ===
                  'function'
              ) {
                await message.react(
                  '❤️'
                );

                console.log(
                  `❤️ Status reaction sent for ${normalized}`
                );
              }
            } catch (error) {
              console.error(
                `❌ Status reaction error for ${normalized}:`,
                error.message
              );
            }
          } catch (error) {
            console.error(
              '[Customer Status Handler Error]',
              error
            );
          }
        }
      );

      /*
       * Initialize WhatsApp Web.
       */
      await client.initialize();

      /*
       * If the account is not already authenticated,
       * request a phone-number pairing code.
       */
      if (
        !client.info &&
        !this.pairingCodes.has(
          normalized
        )
      ) {
        console.log(
          `🔑 Requesting pairing code for ${normalized}...`
        );

        try {
          const code =
            await client.requestPairingCode(
              normalized,
              true,
              180000
            );

          const pairingCode =
            String(code);

          this.pairingCodes.set(
            normalized,
            pairingCode
          );

          multiAccountService.setPairingCode(
            normalized,
            pairingCode
          );

          console.log(
            `🔑 PAIRING CODE FOR ${normalized}: ${pairingCode}`
          );
        } catch (error) {
          console.error(
            `❌ Pairing code error for ${normalized}:`,
            error
          );

          this.errors.set(
            normalized,
            error.message
          );

          this.connecting.delete(
            normalized
          );

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
        `[MultiAccountWhatsApp] Connection error for ${normalized}:`,
        error
      );

      this.connecting.delete(
        normalized
      );

      this.errors.set(
        normalized,
        error.message
      );

      multiAccountService.setConnected(
        normalized,
        false
      );

      try {
        const client =
          this.clients.get(
            normalized
          );

        if (client) {
          await client.destroy();
        }
      } catch (_) {}

      this.clients.delete(
        normalized
      );

      throw error;
    }
  }

  getPairingCode(phone) {
    const normalized =
      this.normalizeNumber(phone);

    const code =
      this.pairingCodes.get(
        normalized
      ) || null;

    return {
      available: Boolean(code),
      pairingCode: code
    };
  }

  getStatus(phone) {
    const normalized =
      this.normalizeNumber(phone);

    const client =
      this.clients.get(
        normalized
      );

    const account =
      multiAccountService.getAccount(
        normalized
      );

    const pairing =
      this.getPairingCode(
        normalized
      );

    let status =
      'Disconnected';

    if (
      account &&
      account.status ===
        'expired'
    ) {
      status = 'Expired';
    } else if (
      client &&
      client.info
    ) {
      status = 'Connected';
    } else if (
      this.connecting.has(
        normalized
      )
    ) {
      status = 'Connecting';
    }

    return {
      connected:
        status === 'Connected',

      connecting:
        status === 'Connecting',

      status,

      pairingCodeAvailable:
        pairing.available,

      pairingCode:
        pairing.pairingCode,

      error:
        this.errors.get(
          normalized
        ) || null
    };
  }

  async disconnectAccount(phone) {
    const normalized =
      this.normalizeNumber(phone);

    const client =
      this.clients.get(
        normalized
      );

    if (!client) {
      multiAccountService.setConnected(
        normalized,
        false
      );

      return {
        success: true,
        message:
          'Account is already disconnected.'
      };
    }

    try {
      console.log(
        `🔴 Disconnecting customer account: ${normalized}`
      );

      await client.destroy();
    } catch (error) {
      console.error(
        '[MultiAccountWhatsApp] Disconnect error:',
        error.message
      );
    }

    this.clients.delete(
      normalized
    );

    this.connecting.delete(
      normalized
    );

    this.pairingCodes.delete(
      normalized
    );

    multiAccountService.setConnected(
      normalized,
      false
    );

    multiAccountService.clearPairingCode(
      normalized
    );

    return {
      success: true,
      message:
        'WhatsApp account disconnected.'
    };
  }

  async expireAccount(phone) {
    const normalized =
      this.normalizeNumber(phone);

    await this.disconnectAccount(
      normalized
    );

    multiAccountService.expireAccount(
      normalized
    );

    return {
      success: true,
      message:
        'Account expired and disconnected.'
    };
  }

  getConnectedAccounts() {
    return Array.from(
      this.clients.keys()
    );
  }

  getStats() {
    return {
      activeConnections:
        this.clients.size,

      connecting:
        this.connecting.size,

      pairingCodes:
        this.pairingCodes.size,

      errors:
        this.errors.size
    };
  }
}

module.exports =
  new MultiAccountWhatsAppService();
