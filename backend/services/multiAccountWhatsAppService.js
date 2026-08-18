const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');

const multiAccountService = require('./multiAccountService');

class MultiAccountWhatsAppService {
  constructor() {
    this.clients = new Map();
    this.connecting = new Set();
    this.pairingCodes = new Map();
    this.errors = new Map();

    this.statusMonitors = new Map();
    this.statusSeen = new Map();
    this.statusBusy = new Set();

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
      path.join(process.cwd(), 'backend', '.puppeteer'),
      '/opt/render/.cache/puppeteer',
      '/opt/render/project/src/.puppeteer',
      '/opt/render/project/src/backend/.puppeteer'
    ].filter(Boolean);

    const findChrome = (directory) => {
      try {
        if (!fs.existsSync(directory)) {
          return null;
        }

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
          if (!entry.isDirectory()) {
            continue;
          }

          const result = findChrome(
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
      const chrome = findChrome(root);

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

  async safeReply(message, text) {
    try {
      if (
        message &&
        typeof message.reply === 'function'
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

        console.log(
          `[Commands] Loading command router: ${candidate}`
        );

        delete require.cache[
          require.resolve(candidate)
        ];

        const router = require(candidate);

        if (
          router &&
          typeof router.execute === 'function'
        ) {
          console.log(
            `[Commands] Command router loaded successfully: ${candidate}`
          );

          return router;
        }

        console.error(
          `[Commands] Invalid command router: ${candidate}`
        );
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

  async handleCommand(message, phone) {
    try {
      if (!message) {
        return;
      }

      const body = String(
        message.body || ''
      ).trim();

      if (!body) {
        return;
      }

      if (
        message.from === 'status@broadcast'
      ) {
        return;
      }

      console.log(
        `📥 Command received from ${phone}: ${body}`
      );

      const commandRouter =
        this.getCommandRouter();

      if (
        !commandRouter ||
        typeof commandRouter.execute !== 'function'
      ) {
        await this.safeReply(
          message,
          '❌ Command system is not configured correctly.'
        );

        return;
      }

      const context = {
        client: this.clients.get(phone),
        message,
        phone,
        from: message.from,
        chatId: message.from,

        account:
          multiAccountService.getAccount(
            phone
          ),

        service: this,

        multiAccountService
      };

      const response =
        await commandRouter.execute(
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

      await this.safeReply(
        message,
        `❌ Command failed: ${
          error.message || 'Unknown error'
        }`
      );
    }
  }

  async openStatus(client, broadcast, phone) {
    try {
      if (!client || !broadcast) {
        return {
          success: false,
          reason: 'INVALID_STATUS'
        };
      }

      const broadcastId =
        broadcast.id &&
        broadcast.id._serialized
          ? broadcast.id._serialized
          : String(
              broadcast.id || ''
            );

      console.log(
        `👁️ Opening WhatsApp Status internally for ${phone}: ${broadcastId}`
      );

      let chat = null;

      try {
        if (
          typeof broadcast.getChat === 'function'
        ) {
          chat =
            await broadcast.getChat();
        }
      } catch (error) {
        console.log(
          `ℹ️ broadcast.getChat() unavailable for ${phone}: ${error.message}`
        );
      }

      if (!chat) {
        try {
          if (
            broadcast.id &&
            broadcast.id._serialized &&
            typeof client.getChatById === 'function'
          ) {
            chat =
              await client.getChatById(
                broadcast.id._serialized
              );
          }
        } catch (error) {
          console.log(
            `ℹ️ getChatById() unavailable for ${phone}: ${error.message}`
          );
        }
      }

      if (!chat) {
        return {
          success: false,
          reason: 'CHAT_UNAVAILABLE'
        };
      }

      try {
        if (
          typeof client.sendSeen === 'function' &&
          chat.id &&
          chat.id._serialized
        ) {
          const result =
            await client.sendSeen(
              chat.id._serialized
            );

          if (result) {
            console.log(
              `✅ WhatsApp Status chat marked seen for ${phone}`
            );

            return {
              success: true,
              method: 'sendSeen'
            };
          }
        }
      } catch (error) {
        console.log(
          `ℹ️ sendSeen() could not mark Status seen for ${phone}: ${error.message}`
        );
      }

      return {
        success: false,
        reason: 'STORE_UNAVAILABLE'
      };
    } catch (error) {
      console.error(
        `❌ Status view failed for ${phone}:`,
        error.message
      );

      return {
        success: false,
        reason:
          error.message ||
          'UNKNOWN_ERROR'
      };
    }
  }

  async reactToStatus(
    broadcast,
    phone
  ) {
    try {
      if (!broadcast) {
        return false;
      }

      const messages =
        Array.isArray(broadcast.msgs)
          ? broadcast.msgs
          : [];

      if (!messages.length) {
        return false;
      }

      let reacted = false;

      for (const statusMessage of messages) {
        try {
          if (
            !statusMessage ||
            typeof statusMessage.react !==
              'function'
          ) {
            continue;
          }

          await statusMessage.react('❤️');

          reacted = true;

          console.log(
            `❤️ Actual WhatsApp Status reaction sent for ${phone}`
          );
        } catch (error) {
          console.error(
            `❌ Status reaction failed for ${phone}:`,
            error.message
          );
        }
      }

      return reacted;
    } catch (error) {
      console.error(
        `❌ Status reaction handler failed for ${phone}:`,
        error.message
      );

      return false;
    }
  }

  async checkStatuses(phone) {
    const client =
      this.clients.get(phone);

    if (!client || !client.info) {
      return;
    }

    if (this.statusBusy.has(phone)) {
      return;
    }

    this.statusBusy.add(phone);

    try {
      const account =
        multiAccountService.getAccount(
          phone
        );

      if (!account) {
        return;
      }

      let settings = null;

      try {
        const db =
          require(
            path.join(
              process.cwd(),
              'backend',
              'database',
              'db'
            )
          );

        if (
          db &&
          typeof db.getSettings ===
            'function'
        ) {
          settings =
            db.getSettings();
        }
      } catch (_) {}

      const autoView =
        !settings ||
        settings.autoView !== false;

      if (!autoView) {
        return;
      }

      if (
        typeof client.getBroadcasts !==
        'function'
      ) {
        console.log(
          `⚠️ getBroadcasts() is unavailable for ${phone}`
        );

        return;
      }

      let broadcasts = [];

      try {
        broadcasts =
          await client.getBroadcasts();
      } catch (error) {
        console.error(
          `❌ getBroadcasts() failed for ${phone}:`,
          error.message
        );

        return;
      }

      if (
        !Array.isArray(broadcasts) ||
        broadcasts.length === 0
      ) {
        return;
      }

      for (const broadcast of broadcasts) {
        try {
          if (!broadcast) {
            continue;
          }

          const broadcastId =
            broadcast.id &&
            broadcast.id._serialized
              ? broadcast.id._serialized
              : String(
                  broadcast.id || ''
                );

          const unreadCount =
            Number(
              broadcast.unreadCount || 0
            );

          const totalCount =
            Number(
              broadcast.totalCount || 0
            );

          if (
            unreadCount <= 0 &&
            totalCount <= 0
          ) {
            continue;
          }

          const previous =
            this.statusSeen.get(
              phone
            ) || new Set();

          if (
            broadcastId &&
            previous.has(broadcastId)
          ) {
            continue;
          }

          console.log(
            `👀 Actual WhatsApp Status detected for customer ${phone}`
          );

          console.log(
            `📊 Status ${broadcastId}: unread=${unreadCount}, total=${totalCount}`
          );

          const result =
            await this.openStatus(
              client,
              broadcast,
              phone
            );

          if (result.success) {
            console.log(
              `✅ WhatsApp Status view confirmed for ${phone}`
            );

            previous.add(
              broadcastId
            );

            this.statusSeen.set(
              phone,
              previous
            );

            await new Promise(
              (resolve) =>
                setTimeout(
                  resolve,
                  1200
                )
            );

            await this.reactToStatus(
              broadcast,
              phone
            );
          } else {
            console.log(
              `⚠️ Status detected but WhatsApp Web did not confirm the view for ${phone}:`,
              result
            );
          }
        } catch (error) {
          console.error(
            `❌ Individual Status processing error for ${phone}:`,
            error.message
          );
        }
      }
    } catch (error) {
      console.error(
        `❌ Status monitor error for ${phone}:`,
        error.message
      );
    } finally {
      this.statusBusy.delete(phone);
    }
  }

  startStatusMonitor(phone) {
    this.stopStatusMonitor(phone);

    console.log(
      `👀 Starting real WhatsApp Status monitor for ${phone}`
    );

    const timer =
      setInterval(
        () => {
          this.checkStatuses(phone)
            .catch((error) => {
              console.error(
                `❌ Background Status check failed for ${phone}:`,
                error.message
              );
            });
        },
        15000
      );

    this.statusMonitors.set(
      phone,
      timer
    );

    setTimeout(
      () => {
        this.checkStatuses(phone)
          .catch((error) => {
            console.error(
              `❌ Initial Status check failed for ${phone}:`,
              error.message
            );
          });
      },
      3000
    );
  }

  stopStatusMonitor(phone) {
    const timer =
      this.statusMonitors.get(phone);

    if (timer) {
      clearInterval(timer);

      this.statusMonitors.delete(phone);
    }

    this.statusBusy.delete(phone);
  }

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

    const existing =
      this.clients.get(normalized);

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
      this.connecting.has(normalized)
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

      client.on(
        'code',
        (code) => {
          const pairingCode =
            String(code || '');

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

      client.on(
        'qr',
        () => {
          console.log(
            `ℹ️ QR received for ${normalized}; phone-number pairing is being used.`
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

      client.on(
        'message',
        async (message) => {
          try {
            await this.handleCommand(
              message,
              normalized
            );
          } catch (error) {
            console.error(
              `❌ Message handler error for ${normalized}:`,
              error.message
            );
          }
        }
      );

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

          this.startStatusMonitor(
            normalized
          );
        }
      );

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

      client.on(
        'change_state',
        (state) => {
          console.log(
            `📡 WhatsApp state for ${normalized}: ${state}`
          );
        }
      );

      await client.initialize();

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
        ) || null,

      statusMonitor:
        this.statusMonitors.has(
          normalized
        )
    };
  }

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

    this.statusSeen.delete(
      normalized
    );

    this.statusBusy.delete(
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
        this.errors.size,

      statusMonitors:
        this.statusMonitors.size
    };
  }
}

module.exports =
  new MultiAccountWhatsAppService();
