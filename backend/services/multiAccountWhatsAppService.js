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
    this.statusProcessing = new Set();

    this.sessionsDir = path.join(
      process.cwd(),
      '.wwebjs_multi_accounts'
    );

    this.ensureSessionDirectory();

    console.log(
      '[MultiAccountWhatsApp] Multi-account engine initialized'
    );

    this.startExpiryMonitor();
  }

  ensureSessionDirectory() {
    try {
      if (!fs.existsSync(this.sessionsDir)) {
        fs.mkdirSync(this.sessionsDir, {
          recursive: true
        });
      }
    } catch (error) {
      console.error(
        '[MultiAccountWhatsApp] Session directory error:',
        error.message
      );
    }
  }

  normalizeNumber(number) {
    return String(number || '').replace(/\D/g, '');
  }

  getSessionId(phone) {
    return `customer-${this.normalizeNumber(phone)}`;
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
          '[MultiAccountWhatsApp] Chrome:',
          chromePath
        );

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
        const entries =
          fs.readdirSync(
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

          if (
            entry.name ===
              'node_modules' ||
            entry.name === '.git'
          ) {
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
        console.log(
          '[MultiAccountWhatsApp] Chrome:',
          chrome
        );

        return chrome;
      }
    }

    throw new Error(
      'Chrome executable not found.'
    );
  }

  /*
   * Try to mark an actual WhatsApp Status
   * as seen.
   *
   * Important:
   * whatsapp-web.js does not expose a
   * guaranteed public "view status" API.
   *
   * We therefore use the available WhatsApp
   * Web client/chat APIs and report exactly
   * what succeeds or fails.
   */
  async markStatusAsSeen(
    client,
    message,
    phone
  ) {
    let lastError = null;

    /*
     * Method 1:
     * Use the WhatsApp client sendSeen()
     * against status@broadcast.
     */
    try {
      if (
        typeof client.sendSeen ===
        'function'
      ) {
        await client.sendSeen(
          'status@broadcast'
        );

        console.log(
          `👁️ Status seen request sent for ${phone} using client.sendSeen()`
        );

        return {
          success: true,
          method: 'client.sendSeen'
        };
      }
    } catch (error) {
      lastError = error;

      console.error(
        `⚠️ client.sendSeen() failed for ${phone}:`,
        error.message
      );
    }

    /*
     * Method 2:
     * Ask the status chat to mark itself
     * as seen.
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
          `👁️ Status seen request sent for ${phone} using chat.sendSeen()`
        );

        return {
          success: true,
          method: 'chat.sendSeen'
        };
      }
    } catch (error) {
      lastError = error;

      console.error(
        `⚠️ chat.sendSeen() failed for ${phone}:`,
        error.message
      );
    }

    throw (
      lastError ||
      new Error(
        'No WhatsApp status viewing method is available.'
      )
    );
  }

  /*
   * Handle a newly received WhatsApp Status.
   */
  async handleStatus(
    client,
    message,
    phone
  ) {
    const statusId =
      message?.id?._serialized ||
      message?.id?.id ||
      `${phone}-${Date.now()}`;

    const processingKey =
      `${phone}:${statusId}`;

    if (
      this.statusProcessing.has(
        processingKey
      )
    ) {
      return;
    }

    this.statusProcessing.add(
      processingKey
    );

    try {
      if (
        message.from !==
        'status@broadcast'
      ) {
        return;
      }

      const accountCheck =
        multiAccountService.checkAccount(
          phone
        );

      if (
        !accountCheck.exists ||
        !accountCheck.active
      ) {
        console.log(
          `⛔ Ignoring status for inactive account ${phone}`
        );

        return;
      }

      console.log(
        `👀 New WhatsApp status detected for customer ${phone}`
      );

      /*
       * Give WhatsApp Web a moment to fully
       * load the status message.
       */
      await new Promise(
        (resolve) =>
          setTimeout(resolve, 1000)
      );

      /*
       * Try up to three times.
       */
      let viewed = false;

      for (
        let attempt = 1;
        attempt <= 3 && !viewed;
        attempt++
      ) {
        try {
          await this.markStatusAsSeen(
            client,
            message,
            phone
          );

          viewed = true;

          console.log(
            `✅ WhatsApp status view request completed for ${phone}`
          );
        } catch (error) {
          console.error(
            `❌ Status view attempt ${attempt} failed for ${phone}:`,
            error.message
          );

          if (attempt < 3) {
            await new Promise(
              (resolve) =>
                setTimeout(
                  resolve,
                  1500
                )
            );
          }
        }
      }

      if (!viewed) {
        console.error(
          `❌ Unable to mark status as seen for ${phone}`
        );

        return;
      }

      /*
       * Give WhatsApp a moment before
       * attempting the reaction.
       */
      await new Promise(
        (resolve) =>
          setTimeout(resolve, 800)
      );

      /*
       * React to the Status.
       *
       * This is separate from viewing.
       */
      try {
        if (
          typeof message.react !==
          'function'
        ) {
          console.log(
            `⚠️ message.react() is unavailable for ${phone}`
          );

          return;
        }

        await message.react(
          '❤️'
        );

        console.log(
          `❤️ Status reaction request sent for ${phone}`
        );
      } catch (error) {
        console.error(
          `❌ Status reaction failed for ${phone}:`,
          error.message
        );
      }
    } catch (error) {
      console.error(
        `[Customer Status Handler Error] ${phone}:`,
        error
      );
    } finally {
      /*
       * Prevent the same status from being
       * processed repeatedly.
       */
      setTimeout(
        () => {
          this.statusProcessing.delete(
            processingKey
          );
        },
        60000
      );
    }
  }

  /*
   * Attach the Status monitor to a
   * customer's WhatsApp client.
   */
  attachStatusMonitor(
    client,
    normalized
  ) {
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

          await this.handleStatus(
            client,
            message,
            normalized
          );
        } catch (error) {
          console.error(
            `[Status Monitor Error] ${normalized}:`,
            error.message
          );
        }
      }
    );
  }

  /*
   * Start one customer's WhatsApp account.
   */
  async startAccount(phone) {
    const normalized =
      this.normalizeNumber(phone);

    if (!normalized) {
      throw new Error(
        'Phone number is required.'
      );
    }

    /*
     * Check trial/subscription.
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
      this.clients.get(
        normalized
      );

    if (
      existing &&
      existing.info
    ) {
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

    /*
     * Prevent duplicate starts.
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

    this.connecting.add(
      normalized
    );

    this.errors.delete(
      normalized
    );

    this.pairingCodes.delete(
      normalized
    );

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
       * QR is ignored because we use
       * phone-number pairing.
       */
      client.on(
        'qr',
        () => {
          console.log(
            `ℹ️ QR received for ${normalized}; phone-number pairing is being used.`
          );
        }
      );

      /*
       * Authenticated.
       */
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
       * Ready.
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

          console.log(
            `👁️ Status monitor active for ${normalized}`
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
            String(
              reason ||
              'Disconnected'
            )
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
       * IMPORTANT:
       * Attach the status monitor once.
       */
      this.attachStatusMonitor(
        client,
        normalized
      );

      /*
       * Start WhatsApp Web.
       */
      await client.initialize();

      /*
       * Request pairing code when needed.
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

  /*
   * Get pairing code.
   */
  getPairingCode(phone) {
    const normalized =
      this.normalizeNumber(phone);

    const code =
      this.pairingCodes.get(
        normalized
      ) || null;

    return {
      available:
        Boolean(code),

      pairingCode:
        code
    };
  }

  /*
   * Get account WhatsApp status.
   */
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
      status =
        'Expired';
    } else if (
      client &&
      client.info
    ) {
      status =
        'Connected';
    } else if (
      this.connecting.has(
        normalized
      )
    ) {
      status =
        'Connecting';
    }

    return {
      connected:
        status ===
        'Connected',

      connecting:
        status ===
        'Connecting',

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

  /*
   * Disconnect account.
   */
  async disconnectAccount(
    phone
  ) {
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

    this.errors.delete(
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

  /*
   * Expire and disconnect account.
   */
  async expireAccount(
    phone
  ) {
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

  /*
   * Automatic trial/subscription
   * expiry monitor.
   */
  startExpiryMonitor() {
    console.log(
      '⏱️ Starting automatic account expiry monitor...'
    );

    this.expiryMonitor =
      setInterval(
        async () => {
          try {
            const accounts =
              multiAccountService.getAllAccounts();

            for (
              const account of accounts
            ) {
              if (
                !account ||
                !account.phone
              ) {
                continue;
              }

              if (
                account.status !==
                  'trial' &&
                account.status !==
                  'paid'
              ) {
                continue;
              }

              const check =
                multiAccountService.checkAccount(
                  account.phone
                );

              if (
                !check.active &&
                check.expired
              ) {
                console.log(
                  `⛔ Expired account detected by monitor: ${account.phone}`
                );

                await this.expireAccount(
                  account.phone
                );
              }
            }
          } catch (error) {
            console.error(
              '[MultiAccountWhatsApp] Expiry monitor error:',
              error.message
            );
          }
        },
        60000
      );

    /*
     * Do not allow the timer to prevent
     * Node from shutting down.
     */
    if (
      this.expiryMonitor &&
      typeof this.expiryMonitor.unref ===
        'function'
    ) {
      this.expiryMonitor.unref();
    }
  }

  /*
   * Get connected accounts.
   */
  getConnectedAccounts() {
    return Array.from(
      this.clients.keys()
    );
  }

  /*
   * Statistics.
   */
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
