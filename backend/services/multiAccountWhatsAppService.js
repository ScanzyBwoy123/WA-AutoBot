'use strict';

const {
  Client,
  LocalAuth
} = require('whatsapp-web.js');

const fs = require('fs');
const path = require('path');

const multiAccountService = require('./multiAccountService');

class MultiAccountWhatsAppService {
  constructor() {
    this.clients = new Map();
    this.connecting = new Set();

    // phone -> latest pairing code
    this.pairingCodes = new Map();

    // phone -> last error
    this.errors = new Map();

    // phone -> Map(messageId -> cached message)
    this.messageStores = new Map();

    // phone -> status automation state
    this.statusStates = new Map();

    // phone -> timers
    this.statusTimers = new Map();

    this.sessionsDir = path.join(
      process.cwd(),
      '.wwebjs_multi_accounts'
    );

    this.maxRetries = 5;
    this.retryTimers = new Map();

    this.ensureSessionDirectory();

    console.log(
      '[MultiAccountWhatsApp] Engine initialized'
    );
  }

  /*
   * ============================================================
   * BASIC HELPERS
   * ============================================================
   */

  normalizeNumber(number) {
    return String(number || '').replace(/\D/g, '');
  }

  getSessionId(phone) {
    return `customer-${this.normalizeNumber(phone)}`;
  }

  ensureSessionDirectory() {
    try {
      fs.mkdirSync(this.sessionsDir, {
        recursive: true
      });
    } catch (error) {
      console.error(
        '[MultiAccountWhatsApp] Session directory error:',
        error.message
      );
    }
  }

  getClient(phone) {
    return this.clients.get(
      this.normalizeNumber(phone)
    );
  }

  isConnected(phone) {
    const client = this.getClient(phone);

    return Boolean(
      client &&
      client.info &&
      client.info.wid
    );
  }

  /*
   * ============================================================
   * CHROME
   * ============================================================
   */

  getChromePath() {
    const candidates = [
      process.env.CHROME_BIN,
      process.env.PUPPETEER_EXECUTABLE_PATH,
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser'
    ].filter(Boolean);

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          console.log(
            `[MultiAccountWhatsApp] Chrome: ${candidate}`
          );

          return candidate;
        }
      } catch (_) {}
    }

    /*
     * Render/Puppeteer fallback.
     *
     * If Puppeteer downloaded Chrome into its cache,
     * search recursively.
     */
    const roots = [
      process.env.PUPPETEER_CACHE_DIR,
      path.join(process.cwd(), '.cache'),
      path.join(process.cwd(), '.puppeteer'),
      '/opt/render/.cache/puppeteer',
      '/opt/render/project/src/.puppeteer'
    ].filter(Boolean);

    const search = (dir) => {
      try {
        if (!fs.existsSync(dir)) {
          return null;
        }

        const entries = fs.readdirSync(
          dir,
          { withFileTypes: true }
        );

        for (const entry of entries) {
          const full = path.join(
            dir,
            entry.name
          );

          if (
            entry.isFile() &&
            entry.name === 'chrome'
          ) {
            try {
              fs.accessSync(
                full,
                fs.constants.X_OK
              );

              return full;
            } catch (_) {}
          }
        }

        for (const entry of entries) {
          if (!entry.isDirectory()) {
            continue;
          }

          const result = search(
            path.join(
              dir,
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
      const found = search(root);

      if (found) {
        console.log(
          `[MultiAccountWhatsApp] Chrome: ${found}`
        );

        return found;
      }
    }

    throw new Error(
      'Chrome executable not found. Install Chromium/Chrome or set CHROME_BIN.'
    );
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

    for (const file of candidates) {
      try {
        if (!fs.existsSync(file)) {
          continue;
        }

        delete require.cache[
          require.resolve(file)
        ];

        const router = require(file);

        if (
          router &&
          typeof router.execute === 'function'
        ) {
          return router;
        }
      } catch (error) {
        console.error(
          `[Commands] Failed loading ${file}:`,
          error.message
        );
      }
    }

    return null;
  }

  async safeReply(message, text) {
    try {
      if (
        message &&
        typeof message.reply === 'function'
      ) {
        await message.reply(String(text));
        return true;
      }
    } catch (error) {
      console.error(
        '[MultiAccountWhatsApp] Reply error:',
        error.message
      );
    }

    return false;
  }

  /*
   * ============================================================
   * COMMAND HANDLING
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

      const router =
        this.getCommandRouter();

      if (!router) {
        console.error(
          '[Commands] Command router not found.'
        );

        return;
      }

      const client =
        this.getClient(phone);

      const context = {
        client,
        message,
        phone,
        from: message.from,
        chatId: message.from,
        service: this,
        multiAccountService
      };

      console.log(
        `📥 AUTHORIZED COMMAND from ${phone}: ${body}`
      );

      /*
       * IMPORTANT:
       *
       * Your command system expects:
       *
       * execute(input, context)
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
          response
        );
      }

      console.log(
        `✅ Command completed for ${phone}: ${body}`
      );
    } catch (error) {
      console.error(
        `[Commands] Failed for ${phone}:`,
        error
      );

      await this.safeReply(
        message,
        `❌ Error: ${
          error.message || 'Unknown error'
        }`
      );
    }
  }

  /*
   * ============================================================
   * MESSAGE CACHE
   * ============================================================
   *
   * Anti-delete depends on seeing the original message BEFORE
   * WhatsApp replaces it with a revoke message.
   */

  getMessageStore(phone) {
    const normalized =
      this.normalizeNumber(phone);

    if (!this.messageStores.has(normalized)) {
      this.messageStores.set(
        normalized,
        new Map()
      );
    }

    return this.messageStores.get(
      normalized
    );
  }

  async cacheMessage(phone, message) {
    try {
      if (!message) {
        return;
      }

      /*
       * Do not cache status messages as normal messages.
       */
      if (
        message.from ===
          'status@broadcast' ||
        message.to ===
          'status@broadcast'
      ) {
        return;
      }

      const store =
        this.getMessageStore(phone);

      const id =
        message.id?._serialized ||
        message.id?.id;

      if (!id) {
        return;
      }

      let media = null;

      /*
       * Save media immediately.
       *
       * This is important because after a message is deleted,
       * WhatsApp may no longer make the media available.
       */
      if (
        message.hasMedia === true
      ) {
        try {
          media =
            await message.downloadMedia();
        } catch (error) {
          console.log(
            `[AntiDelete] Media cache failed for ${phone}:`,
            error.message
          );
        }
      }

      store.set(id, {
        id,
        body:
          message.body || '',
        from:
          message.from || '',
        to:
          message.to || '',
        author:
          message.author || '',
        type:
          message.type || '',
        hasMedia:
          message.hasMedia === true,
        media,
        timestamp:
          message.timestamp || Date.now(),
        cachedAt:
          Date.now()
      });

      /*
       * Maximum cache size.
       */
      while (store.size > 2000) {
        const oldest =
          store.keys().next().value;

        if (!oldest) {
          break;
        }

        store.delete(oldest);
      }
    } catch (error) {
      console.error(
        `[AntiDelete] Cache error for ${phone}:`,
        error.message
      );
    }
  }

  /*
   * ============================================================
   * ANTI DELETE
   * ============================================================
   */

  async handleMessageRevoke(
    phone,
    message,
    revokedMessage
  ) {
    try {
      const account =
        multiAccountService.getAccount(
          phone
        );

      /*
       * Only run if the account has anti-delete enabled.
       */
      if (
        !account ||
        account.antiDelete !== true
      ) {
        return;
      }

      /*
       * whatsapp-web.js gives us:
       *
       * message       = revoked/current message
       * revokedMessage = original message when available
       *
       * The official documentation notes that revokedMessage
       * can be undefined, so we use our own cache as fallback.
       */

      const store =
        this.getMessageStore(phone);

      const id =
        revokedMessage?.id?._serialized ||
        message?.id?._serialized ||
        message?.protocolMessageKey?._serialized;

      let cached =
        id ? store.get(id) : null;

      /*
       * Prefer the original message supplied by
       * whatsapp-web.js when available.
       */
      if (revokedMessage) {
        cached = {
          id,
          body:
            revokedMessage.body || '',
          from:
            revokedMessage.from || '',
          to:
            revokedMessage.to || '',
          author:
            revokedMessage.author || '',
          type:
            revokedMessage.type || '',
          hasMedia:
            revokedMessage.hasMedia === true,
          media: null,
          timestamp:
            revokedMessage.timestamp ||
            Date.now(),
          cachedAt:
            Date.now()
        };

        if (
          revokedMessage.hasMedia === true
        ) {
          try {
            cached.media =
              await revokedMessage.downloadMedia();
          } catch (_) {}
        }
      }

      if (!cached) {
        console.log(
          `[AntiDelete] Original message unavailable for ${phone}`
        );

        return;
      }

      const ownerJid =
        this.getOwnerJid(
          phone
        );

      if (!ownerJid) {
        console.log(
          `[AntiDelete] Owner JID unavailable for ${phone}`
        );

        return;
      }

      const sender =
        cached.author ||
        cached.from ||
        'unknown';

      const senderNumber =
        String(sender)
          .split('@')[0];

      const text =
        `🛡️ *ANTI-DELETE*\n\n` +
        `👤 *Sender:* @${senderNumber}\n` +
        `💬 *Message:* ${
          cached.body ||
          '[Media / No text]'
        }`;

      if (
        cached.media
      ) {
        await this.getClient(phone)
          .sendMessage(
            ownerJid,
            cached.media,
            {
              caption: text,
              mentions: [sender]
            }
          );
      } else {
        await this.getClient(phone)
          .sendMessage(
            ownerJid,
            text,
            {
              mentions: [sender]
            }
          );
      }

      console.log(
        `🛡️ Anti-delete recovered message for ${phone}`
      );

      if (id) {
        store.delete(id);
      }
    } catch (error) {
      console.error(
        `[AntiDelete] Failed for ${phone}:`,
        error.message
      );
    }
  }

  getOwnerJid(phone) {
    const normalized =
      this.normalizeNumber(phone);

    const account =
      multiAccountService.getAccount(
        normalized
      );

    if (
      account &&
      account.ownerJid
    ) {
      return account.ownerJid;
    }

    const client =
      this.getClient(normalized);

    if (
      client &&
      client.info &&
      client.info.wid
    ) {
      return client.info.wid._serialized;
    }

    return null;
  }

  /*
   * ============================================================
   * VIEW ONCE
   * ============================================================
   */

  isViewOnce(message) {
    try {
      if (!message) {
        return false;
      }

      if (
        message._data &&
        (
          message._data.isViewOnce === true ||
          message._data.isViewOnceV2 === true
        )
      ) {
        return true;
      }

      const raw =
        message.rawData ||
        message._data;

      const json =
        JSON.stringify(
          raw || {}
        );

      return (
        json.includes('viewOnceMessage') ||
        json.includes('viewOnceMessageV2') ||
        json.includes('viewOnceMessageV2Extension')
      );
    } catch (_) {
      return false;
    }
  }

  async handleViewOnce(
    phone,
    message
  ) {
    try {
      const account =
        multiAccountService.getAccount(
          phone
        );

      if (
        !account ||
        account.viewOnceDownload !== true
      ) {
        return;
      }

      if (
        !message ||
        message.hasMedia !== true
      ) {
        return;
      }

      if (
        !this.isViewOnce(message)
      ) {
        return;
      }

      console.log(
        `📸 View-once media detected for ${phone}`
      );

      const media =
        await message.downloadMedia();

      if (!media) {
        console.log(
          `[ViewOnce] Media unavailable for ${phone}`
        );

        return;
      }

      const ownerJid =
        this.getOwnerJid(phone);

      if (!ownerJid) {
        return;
      }

      const sender =
        message.author ||
        message.from ||
        '';

      const senderNumber =
        String(sender)
          .split('@')[0];

      const caption =
        `📸 *VIEW-ONCE RECOVERED*\n\n` +
        `👤 *Sender:* @${senderNumber}`;

      await this.getClient(phone)
        .sendMessage(
          ownerJid,
          media,
          {
            caption,
            mentions: sender
              ? [sender]
              : []
          }
        );

      console.log(
        `✅ View-once media forwarded to owner for ${phone}`
      );
    } catch (error) {
      console.error(
        `[ViewOnce] Failed for ${phone}:`,
        error.message
      );
    }
  }

  /*
   * ============================================================
   * STATUS SETTINGS
   * ============================================================
   */

  getStatusConfig(phone) {
    const account =
      multiAccountService.getAccount(
        phone
      );

    return {
      autoView:
        account?.autoViewStatus === true ||
        account?.statusView === true,

      autoLike:
        account?.autoLike === true,

      emoji:
        account?.statusReactionEmoji ||
        account?.reactionEmoji ||
        '❤️'
    };
  }

  /*
   * ============================================================
   * STATUS AUTOMATION
   * ============================================================
   *
   * IMPORTANT:
   *
   * There is NO getBroadcasts() here.
   *
   * We process status messages received through the normal
   * whatsapp-web.js event pipeline.
   */

  startStatusMonitor(phone) {
    const normalized =
      this.normalizeNumber(phone);

    const client =
      this.getClient(normalized);

    if (!client) {
      return false;
    }

    this.stopStatusMonitor(
      normalized
    );

    const config =
      this.getStatusConfig(
        normalized
      );

    if (
      !config.autoView &&
      !config.autoLike
    ) {
      console.log(
        `[StatusService] Status automation disabled for ${normalized}`
      );

      return false;
    }

    this.statusStates.set(
      normalized,
      {
        running: true,
        autoView:
          config.autoView,
        autoLike:
          config.autoLike,
        emoji:
          config.emoji
      }
    );

    /*
     * message event receives incoming status messages.
     */
    const messageHandler =
      async (message) => {
        try {
          if (!message) {
            return;
          }

          const isStatus =
            message.isStatus === true ||
            message.from ===
              'status@broadcast';

          if (!isStatus) {
            return;
          }

          const current =
            this.statusStates.get(
              normalized
            );

          if (
            !current ||
            current.running !== true
          ) {
            return;
          }

          console.log(
            `📡 Status received for ${normalized}`
          );

          /*
           * Auto-view.
           *
           * sendSeen('status@broadcast') is used instead of
           * getBroadcasts().
           */
          if (
            current.autoView
          ) {
            try {
              await client.sendSeen(
                'status@broadcast'
              );

              console.log(
                `👀 Status viewed for ${normalized}`
              );
            } catch (error) {
              console.error(
                `[StatusService] Auto-view failed for ${normalized}:`,
                error.message
              );
            }
          }

          /*
           * Auto-like.
           */
          if (
            current.autoLike
          ) {
            try {
              if (
                typeof message.react ===
                'function'
              ) {
                await message.react(
                  current.emoji
                );
              } else if (
                message.id
              ) {
                await client.sendReaction(
                  message.id._serialized,
                  current.emoji
                );
              }

              console.log(
                `❤️ Status reacted for ${normalized}`
              );
            } catch (error) {
              console.error(
                `[StatusService] Auto-like failed for ${normalized}:`,
                error.message
              );
            }
          }
        } catch (error) {
          console.error(
            `[StatusService] Status handler error for ${normalized}:`,
            error.message
          );
        }
      };

    client.on(
      'message',
      messageHandler
    );

    /*
     * Save handler so it can be removed later.
     */
    const state =
      this.statusStates.get(
        normalized
      );

    state.messageHandler =
      messageHandler;

    this.statusStates.set(
      normalized,
      state
    );

    console.log(
      `👀 Status automation worker started for ${normalized}`
    );

    return true;
  }

  stopStatusMonitor(phone) {
    const normalized =
      this.normalizeNumber(phone);

    const client =
      this.getClient(normalized);

    const state =
      this.statusStates.get(
        normalized
      );

    if (
      client &&
      state?.messageHandler
    ) {
      try {
        client.removeListener(
          'message',
          state.messageHandler
        );
      } catch (_) {}
    }

    this.statusStates.delete(
      normalized
    );

    const timer =
      this.statusTimers.get(
        normalized
      );

    if (timer) {
      clearInterval(timer);
      this.statusTimers.delete(
        normalized
      );
    }

    console.log(
      `[StatusService] Status worker stopped for ${normalized}`
    );

    return true;
  }

  /*
   * ============================================================
   * STATUS STATUS
   * ============================================================
   */

  getStatusAutomation(phone) {
    const normalized =
      this.normalizeNumber(phone);

    const state =
      this.statusStates.get(
        normalized
      );

    return {
      running:
        state?.running === true,

      autoView:
        state?.autoView === true,

      autoLike:
        state?.autoLike === true,

      emoji:
        state?.emoji || '❤️'
    };
  }

  /*
   * ============================================================
   * EVENT HANDLERS
   * ============================================================
   */

  setupEvents(
    phone,
    client
  ) {
    /*
     * ----------------------------------------------------------
     * COMMANDS
     * ----------------------------------------------------------
     */

    client.on(
      'message_create',
      async (message) => {
        try {
          /*
           * Only the linked account can execute bot commands.
           */
          if (
            message?.fromMe !== true
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

          /*
           * Never route status messages as commands.
           */
          if (
            message.from ===
              'status@broadcast' ||
            message.to ===
              'status@broadcast'
          ) {
            return;
          }

          const account =
            multiAccountService.getAccount(
              phone
            );

          if (
            !account ||
            account.active !== true
          ) {
            return;
          }

          await this.handleCommand(
            message,
            phone
          );
        } catch (error) {
          console.error(
            `[Commands] message_create error for ${phone}:`,
            error.message
          );
        }
      }
    );

    /*
     * ----------------------------------------------------------
     * MESSAGE CACHE + VIEW ONCE
     * ----------------------------------------------------------
     */

    client.on(
      'message',
      async (message) => {
        try {
          await this.cacheMessage(
            phone,
            message
          );

          await this.handleViewOnce(
            phone,
            message
          );
        } catch (error) {
          console.error(
            `[Messages] Handler error for ${phone}:`,
            error.message
          );
        }
      }
    );

    /*
     * ----------------------------------------------------------
     * ANTI DELETE
     * ----------------------------------------------------------
     *
     * Official event:
     *
     * message_revoke_everyone
     *
     * Parameters:
     *   message
     *   revokedMessage
     *
     * The second parameter may contain the original message.
     */

    client.on(
      'message_revoke_everyone',
      async (
        message,
        revokedMessage
      ) => {
        await this.handleMessageRevoke(
          phone,
          message,
          revokedMessage
        );
      }
    );

    /*
     * ----------------------------------------------------------
     * QR
     * ----------------------------------------------------------
     */

    client.on(
      'qr',
      () => {
        console.log(
          `ℹ️ QR received for ${phone}; pairing-code mode is active.`
        );
      }
    );

    /*
     * ----------------------------------------------------------
     * PAIRING CODE
     * ----------------------------------------------------------
     *
     * whatsapp-web.js 1.34.7 emits "code".
     *
     * NOT "pairing-code".
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
          phone,
          pairingCode
        );

        try {
          multiAccountService.setPairingCode(
            phone,
            pairingCode
          );
        } catch (_) {}

        console.log(
          `🔑 PAIRING CODE FOR ${phone}: ${pairingCode}`
        );

        console.log(
          `📱 Enter ${pairingCode} in WhatsApp > Linked Devices > Link with phone number`
        );
      }
    );

    /*
     * ----------------------------------------------------------
     * AUTHENTICATED
     * ----------------------------------------------------------
     */

    client.on(
      'authenticated',
      () => {
        console.log(
          `🔐 Customer authenticated: ${phone}`
        );

        this.connecting.delete(
          phone
        );
      }
    );

    /*
     * ----------------------------------------------------------
     * READY
     * ----------------------------------------------------------
     */

    client.on(
      'ready',
      () => {
        console.log(
          `✅ Customer WhatsApp READY: ${phone}`
        );

        this.connecting.delete(
          phone
        );

        this.errors.delete(
          phone
        );

        this.pairingCodes.delete(
          phone
        );

        try {
          multiAccountService.clearPairingCode(
            phone
          );

          multiAccountService.setConnected(
            phone,
            true
          );
        } catch (_) {}

        /*
         * Start status automation AFTER ready.
         */
        this.startStatusMonitor(
          phone
        );
      }
    );

    /*
     * ----------------------------------------------------------
     * AUTH FAILURE
     * ----------------------------------------------------------
     */

    client.on(
      'auth_failure',
      (error) => {
        console.error(
          `❌ Authentication failure for ${phone}:`,
          error
        );

        this.connecting.delete(
          phone
        );

        this.errors.set(
          phone,
          String(error)
        );

        this.stopStatusMonitor(
          phone
        );

        try {
          multiAccountService.setConnected(
            phone,
            false
          );
        } catch (_) {}
      }
    );

    /*
     * ----------------------------------------------------------
     * DISCONNECTED
     * ----------------------------------------------------------
     */

    client.on(
      'disconnected',
      (reason) => {
        console.log(
          `📴 Customer WhatsApp disconnected: ${phone}`,
          reason
        );

        this.connecting.delete(
          phone
        );

        this.pairingCodes.delete(
          phone
        );

        this.errors.set(
          phone,
          String(
            reason ||
              'Disconnected'
          )
        );

        this.stopStatusMonitor(
          phone
        );

        try {
          multiAccountService.setConnected(
            phone,
            false
          );

          multiAccountService.clearPairingCode(
            phone
          );
        } catch (_) {}

        this.clients.delete(
          phone
        );
      }
    );

    /*
     * ----------------------------------------------------------
     * STATE
     * ----------------------------------------------------------
     */

    client.on(
      'change_state',
      (state) => {
        console.log(
          `📡 WhatsApp state for ${phone}: ${state}`
        );
      }
    );
  }

  /*
   * ============================================================
   * PAIRING
   * ============================================================
   */

  async requestPairingCode(
    phone,
    attempts = 3
  ) {
    const normalized =
      this.normalizeNumber(phone);

    const client =
      this.getClient(normalized);

    if (!client) {
      throw new Error(
        'WhatsApp client has not been created yet.'
      );
    }

    /*
     * If already connected, don't request a new code.
     */
    if (
      this.isConnected(normalized)
    ) {
      return {
        success: true,
        connected: true,
        pairingCode: null
      };
    }

    let lastError = null;

    for (
      let attempt = 1;
      attempt <= attempts;
      attempt++
    ) {
      try {
        console.log(
          `🔑 Requesting pairing code for ${normalized} (attempt ${attempt}/${attempts})`
        );

        /*
         * IMPORTANT:
         *
         * requestPairingCode() requires the WhatsApp Web
         * page to be initialized.
         *
         * We intentionally wait for the page instead of
         * immediately calling it after initialize().
         */
        await this.waitForPairingReady(
          client,
          30000
        );

        const code =
          await client.requestPairingCode(
            normalized,
            true,
            180000
          );

        if (code) {
          const pairingCode =
            String(code);

          this.pairingCodes.set(
            normalized,
            pairingCode
          );

          try {
            multiAccountService.setPairingCode(
              normalized,
              pairingCode
            );
          } catch (_) {}

          console.log(
            `🔑 PAIRING CODE FOR ${normalized}: ${pairingCode}`
          );

          return {
            success: true,
            connected: false,
            pairingCode
          };
        }

        throw new Error(
          'WhatsApp returned an empty pairing code.'
        );
      } catch (error) {
        lastError = error;

        console.error(
          `❌ Pairing attempt ${attempt} failed for ${normalized}:`,
          error.message
        );

        if (
          attempt < attempts
        ) {
          await this.sleep(
            3000
          );
        }
      }
    }

    throw (
      lastError ||
      new Error(
        'Unable to generate pairing code.'
      )
    );
  }

  async waitForPairingReady(
    client,
    timeoutMs = 30000
  ) {
    const start =
      Date.now();

    while (
      Date.now() - start <
      timeoutMs
    ) {
      try {
        /*
         * If the client already has a page,
         * pairing can proceed.
         */
        if (
          client.pupPage &&
          !client.pupPage.isClosed()
        ) {
          /*
           * Wait until WhatsApp Web has loaded enough
           * for the pairing API to exist.
           */
          const ready =
            await client.pupPage.evaluate(
              () => {
                return Boolean(
                  window.AuthStore &&
                  window.AuthStore.PairingCodeLinkUtils
                );
              }
            ).catch(
              () => false
            );

          if (ready) {
            return true;
          }
        }
      } catch (_) {}

      /*
       * If ready event has already fired, we're definitely
       * initialized.
       */
      if (
        client.info &&
        client.info.wid
      ) {
        return true;
      }

      await this.sleep(
        500
      );
    }

    throw new Error(
      'WhatsApp Web did not become ready for pairing within 30 seconds.'
    );
  }

  sleep(ms) {
    return new Promise(
      resolve =>
        setTimeout(
          resolve,
          ms
        )
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

    const account =
      multiAccountService.getAccount(
        normalized
      );

    if (
      !account
    ) {
      throw new Error(
        'Account has not been registered.'
      );
    }

    if (
      account.active !== true
    ) {
      throw new Error(
        'Your trial or subscription is not active.'
      );
    }

    /*
     * Already connected.
     */
    const existing =
      this.getClient(normalized);

    if (
      existing &&
      this.isConnected(normalized)
    ) {
      return {
        success: true,
        connected: true,
        pairingCode: null,
        message:
          'WhatsApp account is already connected.'
      };
    }

    /*
     * Already connecting.
     */
    if (
      this.connecting.has(
        normalized
      )
    ) {
      const current =
        this.getPairingCode(
          normalized
        );

      return {
        success: true,
        connecting: true,
        connected: false,
        pairingCode:
          current.pairingCode,
        message:
          current.pairingCode
            ? 'Pairing code is ready.'
            : 'WhatsApp is connecting. Please wait for the pairing code.'
      };
    }

    this.connecting.add(
      normalized
    );

    this.errors.delete(
      normalized
    );

    /*
     * Destroy stale client if one exists.
     */
    if (existing) {
      try {
        await existing.destroy();
      } catch (_) {}

      this.clients.delete(
        normalized
      );
    }

    try {
      const chromePath =
        this.getChromePath();

      console.log(
        `🚀 Starting WhatsApp account ${normalized}`
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
              '--disable-hang-monitor',
              '--disable-ipc-flooding-protection',
              '--disable-popup-blocking',
              '--disable-renderer-backgrounding',
              '--disable-sync',
              '--metrics-recording-only',
              '--mute-audio'
            ],

            timeout: 120000
          },

          qrMaxRetries: 5,

          takeoverOnConflict: true,

          takeoverTimeoutMs: 60000
        });

      this.clients.set(
        normalized,
        client
      );

      /*
       * Attach events BEFORE initialize().
       */
      this.setupEvents(
        normalized,
        client
      );

      /*
       * Start initialization.
       */
      console.log(
        `🌐 Initializing WhatsApp Web for ${normalized}...`
      );

      await client.initialize();

      /*
       * IMPORTANT PAIRING FIX:
       *
       * Do NOT check client.info here.
       *
       * client.info is not the correct way to determine
       * whether pairing is required.
       *
       * Request the pairing code after initialize() and
       * after the pairing API becomes available.
       */
      if (
        !this.isConnected(normalized)
      ) {
        try {
          await this.requestPairingCode(
            normalized,
            3
          );
        } catch (error) {
          console.error(
            `❌ Could not generate pairing code for ${normalized}:`,
            error.message
          );

          this.errors.set(
            normalized,
            error.message
          );

          /*
           * Do NOT immediately destroy the client.
           *
           * WhatsApp Web may still be loading and the
           * pairing code event can arrive shortly afterwards.
           */
        }
      }

      return {
        success: true,
        connected:
          this.isConnected(
            normalized
          ),
        connecting: true,
        pairingCode:
          this.getPairingCode(
            normalized
          ).pairingCode,
        message:
          this.getPairingCode(
            normalized
          ).pairingCode
            ? 'Pairing code generated. Enter it in WhatsApp.'
            : 'WhatsApp initialization started. Waiting for pairing code.'
      };
    } catch (error) {
      console.error(
        `[MultiAccountWhatsApp] Start failed for ${normalized}:`,
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
        multiAccountService.setConnected(
          normalized,
          false
        );
      } catch (_) {}

      const client =
        this.clients.get(
          normalized
        );

      if (client) {
        try {
          await client.destroy();
        } catch (_) {}
      }

      this.clients.delete(
        normalized
      );

      throw error;
    }
  }

  /*
   * ============================================================
   * PAIRING CODE GETTER
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
      this.getClient(
        normalized
      );

    const pairing =
      this.getPairingCode(
        normalized
      );

    const automation =
      this.getStatusAutomation(
        normalized
      );

    let status =
      'Disconnected';

    if (
      this.isConnected(
        normalized
      )
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

      statusWorker:
        automation.running,

      autoView:
        automation.autoView,

      autoLike:
        automation.autoLike,

      reactionEmoji:
        automation.emoji
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

    const retryTimer =
      this.retryTimers.get(
        normalized
      );

    if (retryTimer) {
      clearTimeout(
        retryTimer
      );

      this.retryTimers.delete(
        normalized
      );
    }

    const client =
      this.getClient(
        normalized
      );

    if (client) {
      try {
        await client.destroy();
      } catch (error) {
        console.error(
          `[MultiAccountWhatsApp] Destroy error for ${normalized}:`,
          error.message
        );
      }
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

    this.messageStores.delete(
      normalized
    );

    try {
      multiAccountService.setConnected(
        normalized,
        false
      );

      multiAccountService.clearPairingCode(
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
   * CONNECTED ACCOUNTS
   * ============================================================
   */

  getConnectedAccounts() {
    return Array.from(
      this.clients.entries()
    )
      .filter(
        ([phone]) =>
          this.isConnected(phone)
      )
      .map(
        ([phone]) => phone
      );
  }

  getStats() {
    return {
      activeConnections:
        this.getConnectedAccounts()
          .length,

      clients:
        this.clients.size,

      connecting:
        this.connecting.size,

      pairingCodes:
        this.pairingCodes.size,

      errors:
        this.errors.size,

      statusWorkers:
        Array.from(
          this.statusStates.values()
        ).filter(
          state =>
            state.running
        ).length,

      antiDeleteCaches:
        this.messageStores.size
    };
  }
}

module.exports =
  new MultiAccountWhatsAppService();
