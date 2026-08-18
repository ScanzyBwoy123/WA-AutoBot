const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const multiAccountService =
  require('./multiAccountService');
const commands =
  require('../../commands');
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
    return String(number || '')
      .replace(/\D/g, '');
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
      path.join(process.cwd(), '.puppeteer'),
      path.join(process.cwd(), 'backend', '.puppeteer'),
      '/opt/render/.cache/puppeteer',
      '/opt/render/project/src/.puppeteer',
      '/opt/render/project/src/backend/.puppeteer'
    ].filter(Boolean);
    const findChrome = (directory) => {
      try {
        const entries = fs.readdirSync(
          directory,
          { withFileTypes: true }
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
      if (!fs.existsSync(root)) {
        continue;
      }
      const chrome = findChrome(root);
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
  startExpiryMonitor() {
    console.log(
      '⏱️ Starting automatic account expiry monitor...'
    );
    setInterval(
      async () => {
        try {
          const accounts =
            multiAccountService.getAllAccounts();
          for (const account of accounts) {
            if (
              !account ||
              !account.phone
            ) {
              continue;
            }
            const phone =
              this.normalizeNumber(
                account.phone
              );
            const checked =
              multiAccountService.checkAccount(
                phone
              );
            if (
              checked.exists &&
              !checked.active &&
              account.status !== 'expired'
            ) {
              console.log(
                `⛔ Expiring WhatsApp account: ${phone}`
              );
              try {
                await this.disconnectAccount(
                  phone
                );
              } catch (_) {}
              multiAccountService.expireAccount(
                phone
              );
            }
          }
        } catch (error) {
          console.error(
            '[Expiry Monitor Error]',
            error.message
          );
        }
      },
      60 * 1000
    );
  }
  /*
   * Handle customer commands.
   *
   * Supported examples:
   *
   * .menu
   * .start
   * .boot
   * .status
   *
   * We also accept commands without the dot:
   *
   * menu
   * start
   * boot
   * status
   *
   * This makes the bot compatible with the
   * previous command system.
   */
  async handleCommand(
    client,
    message,
    phone
  ) {
    try {
      const rawText =
        String(
          message.body || ''
        ).trim();
      if (!rawText) {
        return;
      }
      /*
       * Ignore WhatsApp system messages.
       */
      if (
        message.from ===
        'status@broadcast'
      ) {
        return;
      }
      /*
       * Only process messages that are
       * intended to be commands.
       *
       * We support both:
       *
       * .menu
       * menu
       *
       * but we don't treat arbitrary
       * sentences as commands.
       */
      const withoutDot =
        rawText.startsWith('.')
          ? rawText.slice(1).trim()
          : rawText;
      const parts =
        withoutDot
          .split(/\s+/)
          .filter(Boolean);
      if (!parts.length) {
        return;
      }
      const commandName =
        String(
          parts[0] || ''
        ).toLowerCase();
      const knownCommands = [
        'menu',
        'start',
        'boot',
        'status',
        'help',
        'ping',
        'info',
        'commands',
        'stop',
        'restart',
        'settings',
        'pair',
        'users',
        'adduser',
        'removeuser'
      ];
      /*
       * If the command system has a command
       * not listed above, still allow it when
       * the user explicitly uses the dot.
       */
      const explicitlyCommand =
        rawText.startsWith('.');
      if (
        !explicitlyCommand &&
        !knownCommands.includes(
          commandName
        )
      ) {
        return;
      }
      const args =
        parts.slice(1);
      console.log(
        `📩 Customer command [${phone}]: ${rawText}`
      );
      const reply = async (
        response
      ) => {
        if (
          response === undefined ||
          response === null
        ) {
          return null;
        }
        const text =
          String(response).trim();
        if (!text) {
          return null;
        }
        try {
          return await message.reply(
            text
          );
        } catch (replyError) {
          console.error(
            `[Command Reply Error] ${phone}:`,
            replyError.message
          );
          try {
            return await client.sendMessage(
              message.from,
              text
            );
          } catch (sendError) {
            console.error(
              `[Command Send Error] ${phone}:`,
              sendError.message
            );
            throw sendError;
          }
        }
      };
      const context = {
        message,
        client,
        whatsapp: this,
        from:
          message.from,
        chat:
          message.from,
        sender:
          message.author ||
          message.from,
        isOwner:
          Boolean(
            message.fromMe
          ),
        isApproved:
          true,
        args,
        reply
      };
      /*
       * Send the command into the
       * existing command system.
       */
      let result;
      try {
        result =
          await commands.execute(
            rawText.startsWith('.')
              ? rawText
              : `.${rawText}`,
            context
          );
      } catch (executeError) {
        console.error(
          `[Command Execute Error] ${phone}:`,
          executeError
        );
        /*
         * Some command systems expect
         * the command without a dot.
         * Try once more.
         */
        try {
          result =
            await commands.execute(
              withoutDot,
              context
            );
        } catch (secondError) {
          console.error(
            `[Command Retry Error] ${phone}:`,
            secondError
          );
          await reply(
            '❌ Command could not be processed.'
          );
          return;
        }
      }
      /*
       * If the command system returns
       * a response, send it.
       */
      if (
        result !== undefined &&
        result !== null
      ) {
        const response =
          String(result).trim();
        if (response) {
          await reply(
            response
          );
        }
      }
      console.log(
        `✅ Command completed [${phone}]: ${rawText}`
      );
    } catch (error) {
      console.error(
        `[Customer Command Handler Error] ${phone}:`,
        error
      );
      try {
        await message.reply(
          '❌ Something went wrong while processing that command.'
        );
      } catch (_) {}
    }
  }
  /*
   * Monitor WhatsApp status messages.
   *
   * Important:
   * WhatsApp Web.js exposes status messages
   * differently from normal chats.
   *
   * We use multiple available mechanisms rather
   * than assuming message.getChat().sendSeen()
   * means the status was actually viewed.
   */
  async monitorStatus(
    client,
    message,
    phone
  ) {
    try {
      if (
        !message ||
        message.from !==
          'status@broadcast'
      ) {
        return;
      }
      console.log(
        `👀 New WhatsApp status detected for customer ${phone}`
      );
      /*
       * Attempt 1:
       * Use client.sendSeen() when available.
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
        }
      } catch (error) {
        console.error(
          `❌ client.sendSeen() failed for ${phone}:`,
          error.message
        );
      }
      /*
       * Attempt 2:
       * Mark the status chat as seen.
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
            `👁️ Status chat sendSeen() completed for ${phone}`
          );
        }
      } catch (error) {
        console.error(
          `❌ Status chat sendSeen() failed for ${phone}:`,
          error.message
        );
      }
      /*
       * Attempt 3:
       * React to the status.
       *
       * This is kept separate because a reaction
       * is NOT the same thing as viewing a status.
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
            `❤️ Status reaction request sent for ${phone}`
          );
        }
      } catch (error) {
        console.error(
          `❌ Status reaction failed for ${phone}:`,
          error.message
        );
      }
      console.log(
        `✅ WhatsApp status monitoring completed for ${phone}`
      );
    } catch (error) {
      console.error(
        `[Status Monitor Error] ${phone}:`,
        error
      );
    }
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
      this.clients.get(
        normalized
      );
    if (existing) {
      try {
        if (existing.info) {
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
      } catch (_) {}
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
       * MAIN MESSAGE HANDLER
       *
       * This is the important fix.
       *
       * Status messages go to the status monitor.
       * Normal messages go to the command system.
       */
      client.on(
        'message_create',
        async (message) => {
          try {
            /*
             * STATUS
             */
            if (
              message.from ===
              'status@broadcast'
            ) {
              await this.monitorStatus(
                client,
                message,
                normalized
              );
              return;
            }
            /*
             * NORMAL COMMAND
             */
            await this.handleCommand(
              client,
              message,
              normalized
            );
          } catch (error) {
            console.error(
              `[Message Handler Error] ${normalized}:`,
              error
            );
          }
        }
      );
      /*
       * Also listen for incoming messages.
       *
       * message_create catches messages created
       * by the account, while message catches
       * incoming messages from other users.
       */
      client.on(
        'message',
        async (message) => {
          try {
            if (
              message.from ===
              'status@broadcast'
            ) {
              await this.monitorStatus(
                client,
                message,
                normalized
              );
              return;
            }
            await this.handleCommand(
              client,
              message,
              normalized
            );
          } catch (error) {
            console.error(
              `[Incoming Message Error] ${normalized}:`,
              error
            );
          }
        }
      );
      await client.initialize();
      /*
       * Request phone-number pairing code
       * if the session is not authenticated.
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
