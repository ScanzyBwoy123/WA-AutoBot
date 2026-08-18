const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');

const multiAccountService = require('./multiAccountService');
const statusService = require('./statusService');

class MultiAccountWhatsAppService {
  constructor() {
    this.clients = new Map();
    this.connecting = new Set();
    this.pairingCodes = new Map();
    this.errors = new Map();

    /*
     * Status automation is now handled by statusService.
     *
     * IMPORTANT:
     * We no longer use client.getBroadcasts().
     */
    this.statusMonitors = new Map();

    this.sessionsDir = path.join(
      process.cwd(),
      '.wwebjs_multi_accounts'
    );

    this.ensureSessionDirectory();

    console.log(
      '[MultiAccountWhatsApp] Multi-account engine initialized'
    );
  }

  /*
   * ============================================================
   * SESSION DIRECTORY
   * ============================================================
   */

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

  /*
   * ============================================================
   * NUMBER HELPERS
   * ============================================================
   */

  normalizeNumber(number) {
    return String(number || '').replace(/\D/g, '');
  }

  getSessionId(phone) {
    return `customer-${this.normalizeNumber(phone)}`;
  }

  /*
   * ============================================================
   * CHROME
   * ============================================================
   */

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
      try {
        if (fs.existsSync(chromePath)) {
          console.log(
            `[MultiAccountWhatsApp] Chrome: ${chromePath}`
          );

          return chromePath;
        }
      } catch (_) {}
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

    const findChrome = (directory) => {
      try {
        if (!fs.existsSync(directory)) {
          return null;
        }

        const entries =
          fs.readdirSync(directory, {
            withFileTypes: true
          });

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
      const chrome =
        findChrome(root);

      if (chrome) {
        console.log(
          `[MultiAccountWhatsApp] Chrome: ${chrome}`
        );

        return chrome;
      }
    }

    throw new Error(
      'Chrome executable not found.'
    );
  }

  /*
   * ============================================================
   * SAFE REPLY
   * ============================================================
   */

  async safeReply(message, text) {
    try {
      if (
        message &&
        typeof message.reply ===
          'function'
      ) {
        await message.reply(text);
        return true;
      }

      return false;
    } catch (error) {
      console.error(
        '[MultiAccountWhatsApp] Reply error:',
        error.message
      );

      return false;
    }
  }

  /*
   * ============================================================
   * COMMAND ROUTER
   * ============================================================
   */

  getCommandRouter() {
    const candidates = [
      path.resolve(
        __dirname,
        '../../commands/index.js'
      ),
      path.resolve(
        __dirname,
        '../commands/index.js'
      ),
      path.resolve(
        process.cwd(),
        'commands/index.js'
      ),
      path.resolve(
        process.cwd(),
        'backend/commands/index.js'
      )
    ];

    for (const candidate of candidates) {
      try {
        if (!fs.existsSync(candidate)) {
          continue;
        }

        delete require.cache[
          require.resolve(candidate)
        ];

        const router =
          require(candidate);

        if (
          router &&
          typeof router.execute ===
            'function'
        ) {
          return router;
        }
      } catch (error) {
        console.error(
          `[Commands] Failed loading ${candidate}:`,
          error.message
        );
      }
    }

    throw new Error(
      `Command router not found. Searched:\n${candidates.join('\n')}`
    );
  }

  /*
   * ============================================================
   * COMMAND HANDLER
   * ============================================================
   */

  async handleCommand(
    message,
    phone
  ) {
    try {
      if (!message) {
        return;
      }

      const body =
        String(
          message.body || ''
        ).trim();

      if (
        !body ||
        !body.startsWith('.')
      ) {
        return;
      }

      if (
        message.from ===
          'status@broadcast' ||
        message.to ===
          'status@broadcast'
      ) {
        return;
      }

      const router =
        this.getCommandRouter();

      const client =
        this.clients.get(phone);

      const context = {
        client,
        message,
        phone,
        from: message.from,
        chatId: message.from,

        account:
          multiAccountService.getAccount(
            phone
          ),

        service: this,

        multiAccountService,

        statusService
      };

      console.log(
        `📥 AUTHORIZED COMMAND from ${phone}: ${body}`
      );

      /*
       * IMPORTANT:
       *
       * The router API is:
       *
       * execute(input, context)
       *
       * Do not reverse context and args here.
       */

      const response =
        await router.execute(
          body,
          context
        );

      if (
        response !== undefined &&
        response !== null &&
        String(response).trim()
      ) {
        await this.safeReply(
          message,
          String(response)
        );
      }

      console.log(
        `✅ Command completed for ${phone}: ${body}`
      );
    } catch (error) {
      console.error(
        `[Commands] Command handling failed for ${phone}:`,
        error
      );

      if (
        message &&
        String(
          message.body || ''
        )
          .trim()
          .startsWith('.')
      ) {
        await this.safeReply(
          message,
          `❌ Error running command: ${
            error.message ||
            'Unknown error'
          }`
        );
      }
    }
  }

  /*
   * ============================================================
   * STATUS AUTOMATION
   * ============================================================
   *
   * The old implementation used:
   *
   *     client.getBroadcasts()
   *
   * That method is intentionally removed.
   *
   * statusService is now responsible for Status automation.
   */

  startStatusMonitor(phone) {
    const normalized =
      this.normalizeNumber(phone);

    const client =
      this.clients.get(
        normalized
      );

    if (!client) {
      console.log(
        `[StatusService] Client unavailable for ${normalized}`
      );

      return false;
    }

    this.stopStatusMonitor(
      normalized
    );

    try {
      /*
       * Start the Status worker.
       *
       * It listens directly to WhatsApp events
       * instead of calling getBroadcasts().
       */
      const started =
        statusService.startStatusWorker(
          client,
          normalized
        );

      if (started) {
        this.statusMonitors.set(
          normalized,
          true
        );

        console.log(
          `👀 Status automation worker started for ${normalized}`
        );
      }

      return started;
    } catch (error) {
      console.error(
        `[StatusService] Failed starting worker for ${normalized}:`,
        error.message
      );

      return false;
    }
  }

  stopStatusMonitor(phone) {
    const normalized =
      this.normalizeNumber(phone);

    try {
      statusService.stopStatusWorker(
        normalized
      );
    } catch (error) {
      console.error(
        `[StatusService] Failed stopping worker for ${normalized}:`,
        error.message
      );
    }

    this.statusMonitors.delete(
      normalized
    );

    return true;
  }

  /*
   * ============================================================
   * START ACCOUNT
   * ============================================================
   */

  async startAccount(phone) {
    const normalized =
      this.normalizeNumber(phone);

    if (!normalized) {
      throw new Error(
        'Phone number is required.'
      );
    }

    const accountCheck =
      multiAccountService.checkAccount(
        normalized
      );

    if (
      !accountCheck ||
      !accountCheck.exists
    ) {
      throw new Error(
        'Account has not been registered.'
      );
    }

    if (!accountCheck.active) {
      throw new Error(
        'Your trial or subscription has expired. Please subscribe to continue.'
      );
    }

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

      this.startStatusMonitor(
        normalized
      );

      return {
        success: true,
        message:
          'WhatsApp account is already connected.'
      };
    }

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
       * ========================================================
       * AUTHORIZED COMMANDS
       * ========================================================
       */

      client.on(
        'message_create',
        async (message) => {
          try {
            if (!message) {
              return;
            }

            /*
             * Only messages sent by the linked
             * WhatsApp account can execute commands.
             */
            if (
              message.fromMe !== true
            ) {
              return;
            }

            /*
             * Status messages are handled by
             * statusService, not command router.
             */
            if (
              message.from ===
                'status@broadcast' ||
              message.to ===
                'status@broadcast'
            ) {
              return;
            }

            const body =
              String(
                message.body || ''
              ).trim();

            if (
              !body ||
              !body.startsWith('.')
            ) {
              return;
            }

            const check =
              multiAccountService.checkAccount(
                normalized
              );

            if (
              !check ||
              !check.exists
            ) {
              console.log(
                `🚫 COMMAND BLOCKED: ${normalized} is not registered.`
              );

              return;
            }

            if (
              check.active !== true
            ) {
              console.log(
                `🚫 COMMAND BLOCKED: ${normalized} account is inactive.`
              );

              return;
            }

            console.log(
              `📤 AUTHORIZED COMMAND from linked account ${normalized}: ${body}`
            );

            await this.handleCommand(
              message,
              normalized
            );
          } catch (error) {
            console.error(
              `❌ Authorized command handler error for ${normalized}:`,
              error.message
            );
          }
        }
      );

      /*
       * ========================================================
       * QR
       * ========================================================
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
       * ========================================================
       * AUTHENTICATED
       * ========================================================
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
       * ========================================================
       * READY
       * ========================================================
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

          /*
           * Start the new Status automation engine.
           *
           * NO getBroadcasts().
           */
          this.startStatusMonitor(
            normalized
          );
        }
      );

      /*
       * ========================================================
       * AUTH FAILURE
       * ========================================================
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

          this.stopStatusMonitor(
            normalized
          );
        }
      );

      /*
       * ========================================================
       * DISCONNECTED
       * ========================================================
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

          this.stopStatusMonitor(
            normalized
          );

          this.clients.delete(
            normalized
          );
        }
      );

      /*
       * ========================================================
       * STATE
       * ========================================================
       */

      client.on(
        'change_state',
        (state) => {
          console.log(
            `📡 WhatsApp state for ${normalized}: ${state}`
          );
        }
      );

      /*
       * ========================================================
       * INITIALIZE
       * ========================================================
       */

      await client.initialize();

      /*
       * ========================================================
       * PAIRING CODE
       * ========================================================
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
            String(code || '');

          if (pairingCode) {
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
          }
        } catch (error) {
          console.error(
            `❌ Pairing code error for ${normalized}:`,
            error.message
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

      this.stopStatusMonitor(
        normalized
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
   * ============================================================
   * PAIRING CODE
   * ============================================================
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
   * ============================================================
   * ACCOUNT STATUS
   * ============================================================
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

    let automation = {};

    try {
      automation =
        statusService.getStatus(
          normalized
        );
    } catch (_) {}

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
        ) || null,

      statusMonitor:
        this.statusMonitors.has(
          normalized
        ),

      autoView:
        automation.autoView === true,

      autoLike:
        automation.autoLike === true,

      reactionEmoji:
        automation.emoji ||
        '❤️',

      statusWorker:
        automation.running === true
    };
  }

  /*
   * ============================================================
   * DISCONNECT
   * ============================================================
   */

  async disconnectAccount(phone) {
    const normalized =
      this.normalizeNumber(phone);

    this.stopStatusMonitor(
      normalized
    );

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

    this.statusMonitors.delete(
      normalized
    );

    multiAccountService.setConnected(
      normalized,
      false
    );

    multiAccountService.clearPairingCode(
      normalized
    );

    try {
      statusService.reset(
        normalized
      );
    } catch (_) {}

    return {
      success: true,
      message:
        'WhatsApp account disconnected.'
    };
  }

  /*
   * ============================================================
   * EXPIRE ACCOUNT
   * ============================================================
   */

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

  /*
   * ============================================================
   * CONNECTED ACCOUNTS
   * ============================================================
   */

  getConnectedAccounts() {
    return Array.from(
      this.clients.keys()
    );
  }

  /*
   * ============================================================
   * STATISTICS
   * ============================================================
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
        this.errors.size,

      statusMonitors:
        this.statusMonitors.size
    };
  }
}

module.exports =
  new MultiAccountWhatsAppService();
