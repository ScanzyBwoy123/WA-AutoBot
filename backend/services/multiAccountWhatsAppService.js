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

    // Feature states
    this.statusWorkers = new Map();
    this.autoView = new Map();
    this.autoLike = new Map();
    this.antiDelete = new Map();
    this.viewOnce = new Map();

    // Deleted-message cache
    this.messageStore = new Map();

    this.sessionsDir = path.join(
      process.cwd(),
      '.wwebjs_multi_accounts'
    );

    this.maxRetries = 5;
    this.retryTimers = new Map();

    this.ensureSessionDirectory();

    console.log(
      '[MultiAccountWhatsApp] Multi-account engine initialized'
    );
  }

  /*
   * ============================================================
   * SESSION
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
    const paths = [
      process.env.CHROME_BIN,
      process.env.PUPPETEER_EXECUTABLE_PATH,
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser'
    ].filter(Boolean);

    for (const chromePath of paths) {
      try {
        if (fs.existsSync(chromePath)) {
          console.log(
            `[MultiAccountWhatsApp] Chrome: ${chromePath}`
          );

          return chromePath;
        }
      } catch (_) {}
    }

    // Let Puppeteer find Chrome if no explicit path exists.
    console.log(
      '[MultiAccountWhatsApp] No explicit Chrome executable found; using Puppeteer default.'
    );

    return undefined;
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
        typeof message.reply === 'function'
      ) {
        await message.reply(String(text));
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

        const router = require(candidate);

        if (
          router &&
          typeof router.execute === 'function'
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
      `Command router not found.\nSearched:\n${candidates.join('\n')}`
    );
  }

  /*
   * ============================================================
   * COMMAND HANDLER
   * ============================================================
   */

  async handleCommand(message, phone) {
    try {
      const body = String(
        message?.body || ''
      ).trim();

      if (
        !body ||
        !body.startsWith('.')
      ) {
        return;
      }

      if (
        message.from === 'status@broadcast' ||
        message.to === 'status@broadcast'
      ) {
        return;
      }

      const router = this.getCommandRouter();
      const client = this.clients.get(phone);

      const account =
        multiAccountService.getAccount
          ? multiAccountService.getAccount(phone)
          : null;

      const context = {
        client,
        message,
        phone,
        from: message.from,
        chatId: message.from,
        account,
        service: this,
        multiAccountService,
        statusService: this
      };

      console.log(
        `📥 AUTHORIZED COMMAND from ${phone}: ${body}`
      );

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
          response
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
        `❌ Error running command: ${
          error.message || 'Unknown error'
        }`
      );
    }
  }

  /*
   * ============================================================
   * STATUS AUTOMATION
   * ============================================================
   */

  startStatusMonitor(phone) {
    const normalized =
      this.normalizeNumber(phone);

    if (
      this.statusWorkers.has(normalized)
    ) {
      return true;
    }

    const client =
      this.clients.get(normalized);

    if (!client) {
      console.log(
        `[StatusService] Client unavailable for ${normalized}`
      );

      return false;
    }

    this.statusWorkers.set(
      normalized,
      true
    );

    console.log(
      `[StatusService] Status worker started for ${normalized}`
    );

    return true;
  }

  stopStatusMonitor(phone) {
    const normalized =
      this.normalizeNumber(phone);

    this.statusWorkers.delete(
      normalized
    );

    console.log(
      `[StatusService] Status worker stopped for ${normalized}`
    );

    return true;
  }

  /*
   * ============================================================
   * STATUS MESSAGE
   * ============================================================
   */

  async handleStatusMessage(
    phone,
    client,
    message
  ) {
    const normalized =
      this.normalizeNumber(phone);

    if (
      !this.statusWorkers.has(normalized)
    ) {
      return;
    }

    /*
     * AUTO VIEW
     */

    if (
      this.autoView.get(normalized) === true
    ) {
      try {
        const chat =
          await message.getChat();

        if (
          chat &&
          typeof chat.sendSeen === 'function'
        ) {
          await chat.sendSeen();

          console.log(
            `👀 [AutoView] Status viewed for ${normalized}`
          );
        }
      } catch (error) {
        console.error(
          `❌ [AutoView] Failed for ${normalized}:`,
          error.message
        );
      }
    }

    /*
     * AUTO LIKE
     */

    if (
      this.autoLike.get(normalized) === true
    ) {
      try {
        if (
          typeof message.react === 'function'
        ) {
          await message.react('❤️');

          console.log(
            `❤️ [AutoLike] Status liked for ${normalized}`
          );
        }
      } catch (error) {
        console.error(
          `❌ [AutoLike] Failed for ${normalized}:`,
          error.message
        );
      }
    }
  }

  /*
   * ============================================================
   * ENABLE / DISABLE STATUS FEATURES
   * ============================================================
   */

  setAutoView(phone, enabled) {
    const normalized =
      this.normalizeNumber(phone);

    this.autoView.set(
      normalized,
      Boolean(enabled)
    );

    if (enabled) {
      this.startStatusMonitor(
        normalized
      );
    }

    console.log(
      `[StatusService] AutoView ${enabled ? 'enabled' : 'disabled'} for ${normalized}`
    );

    return true;
  }

  setAutoLike(phone, enabled) {
    const normalized =
      this.normalizeNumber(phone);

    this.autoLike.set(
      normalized,
      Boolean(enabled)
    );

    if (enabled) {
      this.startStatusMonitor(
        normalized
      );
    }

    console.log(
      `[StatusService] AutoLike ${enabled ? 'enabled' : 'disabled'} for ${normalized}`
    );

    return true;
  }

  /*
   * ============================================================
   * ANTI DELETE
   * ============================================================
   */

  setAntiDelete(phone, enabled) {
    const normalized =
      this.normalizeNumber(phone);

    this.antiDelete.set(
      normalized,
      Boolean(enabled)
    );

    console.log(
      `[AntiDelete] ${enabled ? 'enabled' : 'disabled'} for ${normalized}`
    );

    return true;
  }

  async storeMessage(
    phone,
    message
  ) {
    const normalized =
      this.normalizeNumber(phone);

    if (
      this.antiDelete.get(normalized) !== true
    ) {
      return;
    }

    if (!message?.id?._serialized) {
      return;
    }

    try {
      let media = null;

      if (message.hasMedia) {
        try {
          media =
            await message.downloadMedia();
        } catch (error) {
          console.log(
            `[AntiDelete] Media could not be cached: ${error.message}`
          );
        }
      }

      this.messageStore.set(
        `${normalized}:${message.id._serialized}`,
        {
          id: message.id._serialized,
          body: message.body || '',
          from: message.from || '',
          author: message.author || '',
          to: message.to || '',
          timestamp: message.timestamp || Date.now(),
          hasMedia: Boolean(message.hasMedia),
          media
        }
      );

      this.cleanupMessageStore();

    } catch (error) {
      console.error(
        `[AntiDelete] Storage error for ${normalized}:`,
        error.message
      );
    }
  }

  cleanupMessageStore() {
    const MAX_MESSAGES = 5000;

    while (
      this.messageStore.size >
      MAX_MESSAGES
    ) {
      const first =
        this.messageStore.keys().next().value;

      if (!first) {
        break;
      }

      this.messageStore.delete(first);
    }
  }

  async handleMessageRevoke(
    phone,
    client,
    after,
    before
  ) {
    const normalized =
      this.normalizeNumber(phone);

    if (
      this.antiDelete.get(normalized) !== true
    ) {
      return;
    }

    try {
      const id =
        before?.id?._serialized ||
        after?.id?._serialized;

      if (!id) {
        console.log(
          `[AntiDelete] Deleted message detected but no message ID was available.`
        );

        return;
      }

      const cacheKey =
        `${normalized}:${id}`;

      const cached =
        this.messageStore.get(cacheKey);

      /*
       * whatsapp-web.js documents that the second
       * argument may be undefined depending on
       * how the deleted message was captured.
       */
      if (!cached && !before) {
        console.log(
          `[AntiDelete] Deleted message detected, but original message was unavailable.`
        );

        return;
      }

      const original =
        cached || {
          id,
          body:
            before?.body ||
            '[Deleted message]',
          from:
            before?.from ||
            after?.from ||
            '',
          author:
            before?.author ||
            after?.author ||
            '',
          hasMedia:
            before?.hasMedia ||
            false,
          media: null
        };

      const owner =
        this.getOwnerJid(
          normalized,
          client
        );

      if (!owner) {
        console.log(
          `[AntiDelete] Owner JID unavailable for ${normalized}`
        );

        return;
      }

      const sender =
        original.author ||
        original.from ||
        'unknown';

      const senderNumber =
        String(sender)
          .split('@')[0];

      const text =
        `🛡️ *ANTI-DELETE*\n\n` +
        `👤 *Sender:* @${senderNumber}\n` +
        `💬 *Message:* ${
          original.body ||
          '[Media/No text]'
        }`;

      if (
        original.hasMedia &&
        original.media
      ) {
        await client.sendMessage(
          owner,
          original.media,
          {
            caption: text,
            mentions: [
              sender
            ]
          }
        );
      } else {
        await client.sendMessage(
          owner,
          text,
          {
            mentions: [
              sender
            ]
          }
        );
      }

      console.log(
        `🛡️ [AntiDelete] Deleted message recovered for ${normalized}`
      );

      this.messageStore.delete(
        cacheKey
      );
    } catch (error) {
      console.error(
        `[AntiDelete] Recovery error for ${normalized}:`,
        error.message
      );
    }
  }

  getOwnerJid(
    phone,
    client
  ) {
    try {
      const account =
        multiAccountService.getAccount
          ? multiAccountService.getAccount(phone)
          : null;

      if (
        account?.owner_jid
      ) {
        return account.owner_jid;
      }

      if (
        account?.ownerJid
      ) {
        return account.ownerJid;
      }

      if (
        client?.info?.wid?._serialized
      ) {
        return client.info.wid._serialized;
      }

      return `${phone}@c.us`;
    } catch (_) {
      return `${phone}@c.us`;
    }
  }

  /*
   * ============================================================
   * VIEW ONCE
   * ============================================================
   */

  setViewOnce(phone, enabled) {
    const normalized =
      this.normalizeNumber(phone);

    this.viewOnce.set(
      normalized,
      Boolean(enabled)
    );

    console.log(
      `[ViewOnce] ${enabled ? 'enabled' : 'disabled'} for ${normalized}`
    );

    return true;
  }

  isViewOnceMessage(message) {
    try {
      if (!message) {
        return false;
      }

      if (
        message._data?.isViewOnce === true
      ) {
        return true;
      }

      if (
        message.isViewOnce === true
      ) {
        return true;
      }

      if (
        message.rawData?.message?.viewOnceMessage
      ) {
        return true;
      }

      if (
        message.rawData?.message?.viewOnceMessageV2
      ) {
        return true;
      }

      if (
        message.rawData?.message
          ?.viewOnceMessageV2Extension
      ) {
        return true;
      }

      return false;
    } catch (_) {
      return false;
    }
  }

  async handleViewOnce(
    phone,
    client,
    message
  ) {
    const normalized =
      this.normalizeNumber(phone);

    if (
      this.viewOnce.get(normalized) !== true
    ) {
      return;
    }

    if (
      !this.isViewOnceMessage(message)
    ) {
      return;
    }

    try {
      console.log(
        `📸 [ViewOnce] View-once media detected for ${normalized}`
      );

      if (!message.hasMedia) {
        console.log(
          '[ViewOnce] Message has no downloadable media.'
        );

        return;
      }

      const media =
        await message.downloadMedia();

      if (!media) {
        console.log(
          '[ViewOnce] WhatsApp did not provide downloadable media.'
        );

        return;
      }

      /*
       * Send the recovered media to the owner.
       */

      const owner =
        this.getOwnerJid(
          normalized,
          client
        );

      if (!owner) {
        return;
      }

      await client.sendMessage(
        owner,
        media,
        {
          caption:
            '📸 View-once media received.'
        }
      );

      console.log(
        `📸 [ViewOnce] Media forwarded to owner for ${normalized}`
      );
    } catch (error) {
      console.error(
        `[ViewOnce] Failed for ${normalized}:`,
        error.message
      );
    }
  }

  /*
   * ============================================================
   * EVENT HANDLERS
   * ============================================================
   */

  setupMessageHandlers(
    normalized,
    client
  ) {
    /*
     * MESSAGE_CREATE
     *
     * Used for outgoing commands and
     * caching messages for anti-delete.
     */

    client.on(
      'message_create',
      async (message) => {
        try {
          if (!message) {
            return;
          }

          /*
           * Cache outgoing messages too.
           */
          await this.storeMessage(
            normalized,
            message
          );

          /*
           * Commands must come from
           * the linked account.
           */
          if (
            message.fromMe !== true
          ) {
            return;
          }

          const body =
            String(
              message.body || ''
            ).trim();

          if (
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

          const check =
            multiAccountService.checkAccount
              ? multiAccountService.checkAccount(
                  normalized
                )
              : {
                  exists: true,
                  active: true
                };

          if (
            !check ||
            !check.exists ||
            check.active !== true
          ) {
            console.log(
              `🚫 COMMAND BLOCKED for ${normalized}`
            );

            return;
          }

          await this.handleCommand(
            message,
            normalized
          );
        } catch (error) {
          console.error(
            `[Events] message_create error for ${normalized}:`,
            error.message
          );
        }
      }
    );

    /*
     * INCOMING MESSAGES
     */

    client.on(
      'message',
      async (message) => {
        try {
          if (!message) {
            return;
          }

          /*
           * STATUS
           */

          if (
            message.from ===
            'status@broadcast'
          ) {
            await this.handleStatusMessage(
              normalized,
              client,
              message
            );

            return;
          }

          /*
           * CACHE MESSAGE FOR ANTI-DELETE
           */

          await this.storeMessage(
            normalized,
            message
          );

          /*
           * VIEW ONCE
           */

          await this.handleViewOnce(
            normalized,
            client,
            message
          );
        } catch (error) {
          console.error(
            `[Events] message error for ${normalized}:`,
            error.message
          );
        }
      }
    );

    /*
     * MESSAGE_REVOKE_EVERYONE
     *
     * whatsapp-web.js officially exposes this
     * event with (after, before).
     */

    client.on(
      'message_revoke_everyone',
      async (after, before) => {
        await this.handleMessageRevoke(
          normalized,
          client,
          after,
          before
        );
      }
    );

    /*
     * Also watch message_create for status
     * because status events can be exposed
     * through message creation depending on
     * WhatsApp Web state.
     */

    client.on(
      'message_create',
      async (message) => {
        try {
          if (
            message?.from ===
            'status@broadcast'
          ) {
            await this.handleStatusMessage(
              normalized,
              client,
              message
            );
          }
        } catch (error) {
          console.error(
            `[StatusService] Status event error for ${normalized}:`,
            error.message
          );
        }
      }
    );
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

    /*
     * Account validation
     */

    if (
      multiAccountService.checkAccount
    ) {
      const check =
        multiAccountService.checkAccount(
          normalized
        );

      if (
        !check ||
        !check.exists
      ) {
        throw new Error(
          'Account has not been registered.'
        );
      }

      if (
        check.active !== true
      ) {
        throw new Error(
          'Your trial or subscription has expired.'
        );
      }
    }

    /*
     * Already connected
     */

    const existing =
      this.clients.get(normalized);

    if (
      existing &&
      existing.info
    ) {
      this.startStatusMonitor(
        normalized
      );

      return {
        success: true,
        message:
          'WhatsApp account is already connected.'
      };
    }

    /*
     * Already connecting
     */

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

    try {
      console.log(
        `🔄 Starting WhatsApp account: ${normalized}`
      );

      const chromePath =
        this.getChromePath();

      /*
       * IMPORTANT:
       *
       * pairWithPhoneNumber belongs INSIDE
       * Client options.
       *
       * whatsapp-web.js then automatically
       * requests the pairing code and emits
       * the "code" event.
       */

      const clientOptions = {
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
            '--mute-audio'
          ],

          timeout: 60000
        },

        /*
         * PHONE NUMBER PAIRING
         */

        pairWithPhoneNumber: {
          phoneNumber: normalized,
          showNotification: true,
          intervalMs: 180000
        },

        qrMaxRetries: 0,

        takeoverOnConflict: true,

        takeoverTimeoutMs: 60000
      };

      const client =
        new Client(clientOptions);

      this.clients.set(
        normalized,
        client
      );

      /*
       * ========================================================
       * PAIRING CODE
       * ========================================================
       */

      client.on(
        'code',
        (code) => {
          if (!code) {
            return;
          }

          const pairingCode =
            String(code);

          this.pairingCodes.set(
            normalized,
            pairingCode
          );

          try {
            if (
              multiAccountService.setPairingCode
            ) {
              multiAccountService.setPairingCode(
                normalized,
                pairingCode
              );
            }
          } catch (_) {}

          console.log(
            `🔑 PAIRING CODE FOR ${normalized}: ${pairingCode}`
          );

          console.log(
            '📱 WhatsApp → Settings → Linked Devices → Link with phone number'
          );
        }
      );

      /*
       * QR should NOT be used in phone pairing mode.
       */

      client.on(
        'qr',
        () => {
          console.log(
            `⚠️ QR received for ${normalized}. Pairing mode is enabled; this should normally not be needed.`
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

          this.connecting.delete(
            normalized
          );

          this.pairingCodes.delete(
            normalized
          );

          this.errors.delete(
            normalized
          );

          try {
            if (
              multiAccountService.clearPairingCode
            ) {
              multiAccountService.clearPairingCode(
                normalized
              );
            }
          } catch (_) {}
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

          try {
            if (
              multiAccountService.setConnected
            ) {
              multiAccountService.setConnected(
                normalized,
                true
              );
            }

            if (
              multiAccountService.clearPairingCode
            ) {
              multiAccountService.clearPairingCode(
                normalized
              );
            }
          } catch (_) {}

          /*
           * Start status engine.
           */

          this.startStatusMonitor(
            normalized
          );

          console.log(
            `🚀 WhatsApp services ready for ${normalized}`
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
        (error) => {
          console.error(
            `❌ Authentication failure for ${normalized}:`,
            error
          );

          this.connecting.delete(
            normalized
          );

          this.errors.set(
            normalized,
            String(error)
          );

          this.stopStatusMonitor(
            normalized
          );

          try {
            if (
              multiAccountService.setConnected
            ) {
              multiAccountService.setConnected(
                normalized,
                false
              );
            }
          } catch (_) {}
        }
      );

      /*
       * ========================================================
       * DISCONNECTED
       * ========================================================
       */

      client.on(
        'disconnected',
        async (reason) => {
          console.log(
            `🔴 Customer WhatsApp disconnected: ${normalized}`,
            reason
          );

          this.connecting.delete(
            normalized
          );

          this.stopStatusMonitor(
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

          try {
            if (
              multiAccountService.setConnected
            ) {
              multiAccountService.setConnected(
                normalized,
                false
              );
            }
          } catch (_) {}

          this.clients.delete(
            normalized
          );

          /*
           * Do not reconnect LOGOUT automatically.
           */

          if (
            String(reason)
              .toUpperCase() ===
            'LOGOUT'
          ) {
            console.log(
              `🔐 ${normalized} logged out. Re-authentication required.`
            );

            return;
          }

          this.scheduleReconnect(
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
            `📡 WhatsApp state ${normalized}: ${state}`
          );
        }
      );

      /*
       * ========================================================
       * MESSAGE EVENTS
       * ========================================================
       */

      this.setupMessageHandlers(
        normalized,
        client
      );

      /*
       * ========================================================
       * INITIALIZE
       * ========================================================
       */

      await client.initialize();

      console.log(
        `⏳ WhatsApp initialization started for ${normalized}`
      );

      /*
       * IMPORTANT:
       *
       * DO NOT call requestPairingCode()
       * here.
       *
       * pairWithPhoneNumber above handles it.
       */

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

      try {
        if (
          multiAccountService.setConnected
        ) {
          multiAccountService.setConnected(
            normalized,
            false
          );
        }
      } catch (_) {}

      this.stopStatusMonitor(
        normalized
      );

      const client =
        this.clients.get(
          normalized
        );

      try {
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
   * RECONNECT
   * ============================================================
   */

  scheduleReconnect(phone) {
    const normalized =
      this.normalizeNumber(phone);

    if (
      this.retryTimers.has(normalized)
    ) {
      return;
    }

    const delay = 10000;

    console.log(
      `🔄 Scheduling reconnect for ${normalized} in ${delay / 1000}s`
    );

    const timer =
      setTimeout(
        async () => {
          this.retryTimers.delete(
            normalized
          );

          try {
            await this.startAccount(
              normalized
            );
          } catch (error) {
            console.error(
              `❌ Reconnect failed for ${normalized}:`,
              error.message
            );
          }
        },
        delay
      );

    this.retryTimers.set(
      normalized,
      timer
    );
  }

  /*
   * ============================================================
   * PAIRING CODE API
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
   * STATUS
   * ============================================================
   */

  getStatus(phone) {
    const normalized =
      this.normalizeNumber(phone);

    const client =
      this.clients.get(
        normalized
      );

    let account = null;

    try {
      if (
        multiAccountService.getAccount
      ) {
        account =
          multiAccountService.getAccount(
            normalized
          );
      }
    } catch (_) {}

    let status =
      'Disconnected';

    if (
      account?.status ===
      'expired'
    ) {
      status = 'Expired';
    } else if (
      client?.info
    ) {
      status = 'Connected';
    } else if (
      this.connecting.has(
        normalized
      )
    ) {
      status = 'Connecting';
    }

    const pairing =
      this.getPairingCode(
        normalized
      );

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
        this.statusWorkers.has(
          normalized
        ),

      autoView:
        this.autoView.get(
          normalized
        ) === true,

      autoLike:
        this.autoLike.get(
          normalized
        ) === true,

      antiDelete:
        this.antiDelete.get(
          normalized
        ) === true,

      viewOnce:
        this.viewOnce.get(
          normalized
        ) === true
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

    const timer =
      this.retryTimers.get(
        normalized
      );

    if (timer) {
      clearTimeout(timer);

      this.retryTimers.delete(
        normalized
      );
    }

    const client =
      this.clients.get(
        normalized
      );

    if (!client) {
      return {
        success: true,
        message:
          'Account is already disconnected.'
      };
    }

    try {
      await client.destroy();
    } catch (error) {
      console.error(
        `[MultiAccountWhatsApp] Disconnect error for ${normalized}:`,
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

    this.statusWorkers.delete(
      normalized
    );

    this.autoView.delete(
      normalized
    );

    this.autoLike.delete(
      normalized
    );

    this.antiDelete.delete(
      normalized
    );

    this.viewOnce.delete(
      normalized
    );

    try {
      if (
        multiAccountService.setConnected
      ) {
        multiAccountService.setConnected(
          normalized,
          false
        );
      }

      if (
        multiAccountService.clearPairingCode
      ) {
        multiAccountService.clearPairingCode(
          normalized
        );
      }
    } catch (_) {}

    return {
      success: true,
      message:
        'WhatsApp account disconnected.'
    };
  }

  /*
   * ============================================================
   * EXPIRE
   * ============================================================
   */

  async expireAccount(phone) {
    const normalized =
      this.normalizeNumber(phone);

    await this.disconnectAccount(
      normalized
    );

    try {
      if (
        multiAccountService.expireAccount
      ) {
        multiAccountService.expireAccount(
          normalized
        );
      }
    } catch (_) {}

    return {
      success: true,
      message:
        'Account expired and disconnected.'
    };
  }

  /*
   * ============================================================
   * SESSION
   * ============================================================
   */

  clearSession(phone) {
    const normalized =
      this.normalizeNumber(phone);

    const sessionPath =
      path.join(
        this.sessionsDir,
        `session-${this.getSessionId(normalized)}`
      );

    try {
      if (
        fs.existsSync(sessionPath)
      ) {
        fs.rmSync(
          sessionPath,
          {
            recursive: true,
            force: true
          }
        );

        console.log(
          `🗑️ Session cleared for ${normalized}`
        );
      }
    } catch (error) {
      console.error(
        `[Session] Failed clearing ${normalized}:`,
        error.message
      );
    }
  }

  /*
   * ============================================================
   * CONNECTED ACCOUNTS
   * ============================================================
   */

  getClient(phone) {
    return this.clients.get(
      this.normalizeNumber(phone)
    );
  }

  isReady(phone) {
    const client =
      this.getClient(phone);

    return Boolean(
      client &&
      client.info
    );
  }

  getConnectedAccounts() {
    return Array.from(
      this.clients.keys()
    ).filter(
      phone =>
        this.isReady(phone)
    );
  }

  getStats() {
    return {
      activeConnections:
        this.clients.size,

      readyConnections:
        this.getConnectedAccounts().length,

      connecting:
        this.connecting.size,

      pairingCodes:
        this.pairingCodes.size,

      errors:
        this.errors.size,

      statusWorkers:
        this.statusWorkers.size,

      antiDelete:
        Array.from(
          this.antiDelete.values()
        ).filter(Boolean).length,

      viewOnce:
        Array.from(
          this.viewOnce.values()
        ).filter(Boolean).length
    };
  }
}

module.exports =
  new MultiAccountWhatsAppService();
