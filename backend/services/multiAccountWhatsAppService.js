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
    this.ready = new Set();
    this.authenticated = new Set();
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
            entry.name === 'node_modules' ||
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
    /*
     * Do not create another WhatsApp client
     * if this account is already ready.
     */
    if (
      this.ready.has(normalized)
    ) {
      return {
        success: true,
        message:
          'WhatsApp account is already connected.'
      };
    }
    /*
     * Prevent duplicate startup.
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
    /*
     * Clean up an old broken client first.
     */
    if (
      this.clients.has(normalized)
    ) {
      await this.safeDestroy(
        normalized
      );
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
    this.authenticated.delete(
      normalized
    );
    this.ready.delete(
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
       * Pairing code event.
       */
      client.on(
        'code',
        (code) => {
          if (
            this.authenticated.has(
              normalized
            ) ||
            this.ready.has(
              normalized
            )
          ) {
            return;
          }
          const pairingCode =
            String(code || '').trim();
          if (!pairingCode) {
            return;
          }
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
       * QR is ignored because
       * phone-number pairing is used.
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
       * AUTHENTICATED
       *
       * This event can fire more than once.
       * We therefore make it idempotent.
       */
      client.on(
        'authenticated',
        () => {
          if (
            this.authenticated.has(
              normalized
            )
          ) {
            return;
          }
          console.log(
            `🔐 Customer authenticated: ${normalized}`
          );
          this.authenticated.add(
            normalized
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
          if (
            this.ready.has(
              normalized
            )
          ) {
            return;
          }
          console.log(
            `✅ Customer WhatsApp READY: ${normalized}`
          );
          this.ready.add(
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
          this.ready.delete(
            normalized
          );
          this.authenticated.delete(
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
          this.ready.delete(
            normalized
          );
          this.authenticated.delete(
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
       * ALL incoming/created messages.
       *
       * This is where commands are handled.
       */
      client.on(
        'message_create',
        async (message) => {
          try {
            await this.handleMessage(
              client,
              message,
              normalized
            );
          } catch (error) {
            console.error(
              `[Message Handler Error ${normalized}]`,
              error.message
            );
          }
        }
      );
      /*
       * Initialize WhatsApp Web.
       */
      await client.initialize();
      console.log(
        `🌐 WhatsApp Web initialization completed for ${normalized}`
      );
      /*
       * Give WhatsApp Web time to finish
       * its navigation before requesting pairing.
       *
       * This prevents:
       * "Execution context was destroyed"
       */
      await this.sleep(
        5000
      );
      /*
       * Only request a pairing code if the
       * account has not authenticated already.
       */
      if (
        !this.authenticated.has(
          normalized
        ) &&
        !this.ready.has(
          normalized
        ) &&
        !this.pairingCodes.has(
          normalized
        )
      ) {
        try {
          console.log(
            `🔑 Requesting pairing code for ${normalized}...`
          );
          const code =
            await client.requestPairingCode(
              normalized,
              true,
              180000
            );
          if (
            !this.authenticated.has(
              normalized
            ) &&
            !this.ready.has(
              normalized
            )
          ) {
            const pairingCode =
              String(
                code || ''
              ).trim();
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
          }
        } catch (error) {
          const errorMessage =
            String(
              error?.message ||
              error
            );
          /*
           * Do NOT kill the WhatsApp client
           * because of this navigation race.
           */
          if (
            errorMessage.includes(
              'Execution context was destroyed'
            )
          ) {
            console.warn(
              `⚠️ WhatsApp navigation race detected for ${normalized}; keeping client alive.`
            );
          } else {
            console.error(
              `❌ Pairing code error for ${normalized}:`,
              errorMessage
            );
            this.errors.set(
              normalized,
              errorMessage
            );
          }
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
        String(
          error?.message ||
          error
        )
      );
      multiAccountService.setConnected(
        normalized,
        false
      );
      await this.safeDestroy(
        normalized
      );
      throw error;
    }
  }
  /*
   * MESSAGE HANDLER
   */
  async handleMessage(
    client,
    message,
    phone
  ) {
    try {
      if (!message) {
        return;
      }
      /*
       * WhatsApp status messages.
       */
      if (
        message.from ===
        'status@broadcast'
      ) {
        await this.handleStatus(
          client,
          message,
          phone
        );
        return;
      }
      /*
       * Ignore empty messages.
       */
      const text =
        String(
          message.body ||
          ''
        ).trim();
      if (!text) {
        return;
      }
      /*
       * Ignore our own messages.
       */
      if (
        message.fromMe === true
      ) {
        return;
      }
      /*
       * Commands.
       *
       * Supported:
       * .menu
       * .start
       * .boot
       * .status
       * .boot status
       */
      if (
        text.startsWith('.')
      ) {
        await this.handleCommand(
          client,
          message,
          phone,
          text
        );
        return;
      }
    } catch (error) {
      console.error(
        `[Message Processing Error ${phone}]`,
        error
      );
    }
  }
  /*
   * COMMAND HANDLER
   *
   * This keeps the command system isolated
   * so a command failure cannot kill WhatsApp.
   */
  async handleCommand(
    client,
    message,
    phone,
    text
  ) {
    try {
      console.log(
        `📩 COMMAND from ${phone}: ${text}`
      );
      /*
       * Try the existing command module
       * if the project provides one.
       */
      let commandModule = null;
      try {
        commandModule =
          require('../../commands');
      } catch (error) {
        console.warn(
          '[Commands] Existing commands module not found:',
          error.message
        );
      }
      if (
        commandModule &&
        typeof commandModule.execute ===
          'function'
      ) {
        const context = {
          message,
          client,
          whatsapp: this,
          from: message.from,
          chat: message.from,
          sender:
            message.author ||
            message.from,
          args:
            this.getCommandArgs(
              text
            ),
          isOwner: true,
          isApproved: true,
          reply: async (
            response
          ) => {
            if (
              response ===
                undefined ||
              response === null
            ) {
              return null;
            }
            const replyText =
              String(
                response
              ).trim();
            if (!replyText) {
              return null;
            }
            try {
              return await message.reply(
                replyText
              );
            } catch (error) {
              console.error(
                `[Reply Error ${phone}]`,
                error.message
              );
              return await client.sendMessage(
                message.from,
                replyText
              );
            }
          }
        };
        const result =
          await commandModule.execute(
            text,
            context
          );
        if (
          result !==
            undefined &&
          result !==
            null
        ) {
          const response =
            String(
              result
            ).trim();
          if (response) {
            await context.reply(
              response
            );
          }
        }
        console.log(
          `✅ Command completed for ${phone}: ${text}`
        );
        return;
      }
      /*
       * Fallback commands.
       *
       * These guarantee that basic commands
       * still respond even if the external
       * command module is unavailable.
       */
      const command =
        this.getCommandName(
          text
        );
      if (
        command ===
        'menu'
      ) {
        await message.reply(
          [
            '🤖 WA-AutoBot MENU',
            '',
            '.menu',
            '.start',
            '.boot',
            '.status',
            '.boot status'
          ].join('\n')
        );
        return;
      }
      if (
        command ===
        'start'
      ) {
        await message.reply(
          '✅ WA-AutoBot is active and ready.'
        );
        return;
      }
      if (
        command ===
        'boot'
      ) {
        await message.reply(
          '🚀 WA-AutoBot boot system is active.'
        );
        return;
      }
      if (
        command ===
        'status'
      ) {
        const status =
          this.getStatus(
            phone
          );
        await message.reply(
          [
            '📊 WA-AutoBot STATUS',
            '',
            `WhatsApp: ${status.connected ? 'Connected ✅' : 'Disconnected ❌'}`,
            `Connecting: ${status.connecting ? 'Yes' : 'No'}`,
            `Account: ${phone}`
          ].join('\n')
        );
        return;
      }
      /*
       * .boot status
       */
      if (
        text
          .toLowerCase()
          .trim() ===
        '.boot status'
      ) {
        const status =
          this.getStatus(
            phone
          );
        await message.reply(
          [
            '🚀 BOOT STATUS',
            '',
            `WhatsApp: ${status.connected ? 'ONLINE ✅' : 'OFFLINE ❌'}`,
            `Connection: ${status.status}`,
            `Account: ${phone}`
          ].join('\n')
        );
        return;
      }
      await message.reply(
        '❓ Unknown command. Type .menu to see available commands.'
      );
    } catch (error) {
      console.error(
        `[Command Handler Error ${phone}]`,
        error
      );
      try {
        await message.reply(
          '❌ The command could not be processed.'
        );
      } catch (_) {}
    }
  }
  getCommandName(text) {
    const cleaned =
      String(
        text || ''
      )
        .trim()
        .toLowerCase();
    if (
      cleaned ===
      '.boot status'
    ) {
      return 'boot status';
    }
    return cleaned
      .slice(1)
      .split(/\s+/)[0];
  }
  getCommandArgs(text) {
    const cleaned =
      String(
        text || ''
      )
        .trim()
        .slice(1)
        .trim();
    const parts =
      cleaned
        ? cleaned.split(
            /\s+/
          )
        : [];
    parts.shift();
    return parts;
  }
  /*
   * STATUS HANDLER
   */
  async handleStatus(
    client,
    message,
    phone
  ) {
    try {
      console.log(
        `👀 New WhatsApp status detected for customer ${phone}`
      );
      /*
       * Ask WhatsApp to mark the status
       * chat as seen.
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
            `👁️ Status seen request sent for ${phone}`
          );
        }
      } catch (error) {
        console.warn(
          `⚠️ Status seen request failed for ${phone}:`,
          error.message
        );
      }
      /*
       * Request a heart reaction.
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
        console.warn(
          `⚠️ Status reaction request failed for ${phone}:`,
          error.message
        );
      }
      console.log(
        `✅ WhatsApp status handling completed for ${phone}`
      );
    } catch (error) {
      console.error(
        `[Status Handler Error ${phone}]`,
        error
      );
    }
  }
  getPairingCode(phone) {
    const normalized =
      this.normalizeNumber(
        phone
      );
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
      this.normalizeNumber(
        phone
      );
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
      this.ready.has(
        normalized
      ) ||
      (client &&
        client.info)
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
  async disconnectAccount(
    phone
  ) {
    const normalized =
      this.normalizeNumber(
        phone
      );
    await this.safeDestroy(
      normalized
    );
    this.connecting.delete(
      normalized
    );
    this.pairingCodes.delete(
      normalized
    );
    this.authenticated.delete(
      normalized
    );
    this.ready.delete(
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
  async safeDestroy(
    phone
  ) {
    const normalized =
      this.normalizeNumber(
        phone
      );
    const client =
      this.clients.get(
        normalized
      );
    if (!client) {
      return;
    }
    try {
      await client.destroy();
    } catch (error) {
      console.warn(
        `[MultiAccountWhatsApp] Client destroy warning for ${normalized}:`,
        error.message
      );
    }
    this.clients.delete(
      normalized
    );
  }
  async expireAccount(
    phone
  ) {
    const normalized =
      this.normalizeNumber(
        phone
      );
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
      this.ready
    );
  }
  getStats() {
    return {
      activeConnections:
        this.ready.size,
      connecting:
        this.connecting.size,
      pairingCodes:
        this.pairingCodes.size,
      errors:
        this.errors.size
    };
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
          for (
            const account of accounts
          ) {
            if (
              !account ||
              !account.phone
            ) {
              continue;
            }
            const checked =
              multiAccountService.checkAccount(
                account.phone
              );
            if (
              checked.exists &&
              checked.expired &&
              this.clients.has(
                account.phone
              )
            ) {
              await this.safeDestroy(
                account.phone
              );
              this.connecting.delete(
                account.phone
              );
              this.pairingCodes.delete(
                account.phone
              );
              this.authenticated.delete(
                account.phone
              );
              this.ready.delete(
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
      60 * 1000
    );
  }
  sleep(ms) {
    return new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          ms
        )
    );
  }
}
module.exports =
  new MultiAccountWhatsAppService();
