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
    this.statusMonitor = null;
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
      this.connecting.has(normalized)
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
      const client = new Client({
        authStrategy: new LocalAuth({
          clientId:
            this.getSessionId(normalized),
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
       * PHONE-NUMBER PAIRING CODE
       */
      client.on('code', (code) => {
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
      });
      /*
       * QR IS NOT USED.
       */
      client.on('qr', () => {
        console.log(
          `ℹ️ QR received for ${normalized}; phone-number pairing is being used.`
        );
      });
      /*
       * AUTHENTICATED
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
       * AUTH FAILURE
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
       * DISCONNECTED
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
              reason || 'Disconnected'
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
       * =====================================================
       * NORMAL WHATSAPP MESSAGE HANDLER
       * =====================================================
       *
       * IMPORTANT:
       * We use ONLY message_create here.
       *
       * This prevents the same command from being
       * processed twice.
       *
       * Commands such as:
       *
       * .menu
       * .status
       * .start
       * .boot
       * .boot status
       *
       * are passed into the existing commands system.
       */
      client.on(
        'message_create',
        async (message) => {
          try {
            if (!message) {
              return;
            }
            /*
             * Ignore messages that are not actually
             * associated with this customer session.
             */
            const text =
              String(
                message.body || ''
              ).trim();
            /*
             * STATUS MESSAGE
             */
            if (
              message.from ===
              'status@broadcast'
            ) {
              await this.handleStatus(
                client,
                message,
                normalized
              );
              return;
            }
            /*
             * Ignore empty messages.
             */
            if (!text) {
              return;
            }
            /*
             * Do not process our own normal outgoing
             * messages as customer commands.
             */
            if (
              message.fromMe === true
            ) {
              return;
            }
            /*
             * Only commands beginning with "." are
             * sent to the command system.
             */
            if (
              !text.startsWith('.')
            ) {
              return;
            }
            console.log(
              `📩 COMMAND from ${normalized}: ${text}`
            );
            /*
             * Build command context.
             */
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
              args:
                this.getCommandArgs(text),
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
                } catch (
                  replyError
                ) {
                  console.error(
                    `[Reply Error ${normalized}]`,
                    replyError.message
                  );
                  try {
                    return await client.sendMessage(
                      message.from,
                      replyText
                    );
                  } catch (
                    sendError
                  ) {
                    console.error(
                      `[Send Error ${normalized}]`,
                      sendError.message
                    );
                    throw sendError;
                  }
                }
              }
            };
            /*
             * Execute through the existing command
             * system.
             */
            const result =
              await commands.execute(
                text,
                context
              );
            /*
             * If the command system returns text,
             * send it back.
             */
            if (
              result !==
                undefined &&
              result !== null
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
              `✅ Command completed for ${normalized}: ${text}`
            );
          } catch (error) {
            console.error(
              `[Command Handler Error ${normalized}]`,
              error
            );
            try {
              if (
                message &&
                message.from &&
                message.from !==
                  'status@broadcast'
              ) {
                await message.reply(
                  '❌ Something went wrong while processing that command.'
                );
              }
            } catch (_) {}
          }
        }
      );
      /*
       * INITIALIZE WHATSAPP WEB
       */
      await client.initialize();
      /*
       * REQUEST PHONE-NUMBER PAIRING CODE
       * ONLY WHEN NOT ALREADY AUTHENTICATED.
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
            String(code || '').trim();
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
   * Extract command arguments.
   *
   * Example:
   *
   * .boot status
   *
   * becomes:
   *
   * ['status']
   */
  getCommandArgs(text) {
    return String(text || '')
      .trim()
      .slice(1)
      .trim()
      .split(/\s+/)
      .slice(1);
  }
  /*
   * =====================================================
   * WHATSAPP STATUS HANDLER
   * =====================================================
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
       * Try the actual chat object first.
       *
       * This is the closest normal WhatsApp Web.js
       * operation for marking a status conversation
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
            `👁️ Status seen request sent for ${phone}`
          );
        }
      } catch (error) {
        console.error(
          `❌ Status seen error for ${phone}:`,
          error.message
        );
      }
      /*
       * Do NOT pretend that a status reaction was
       * successfully delivered when WhatsApp Web.js
       * has not confirmed it.
       *
       * message.react() is not reliable for
       * status@broadcast in every WhatsApp Web.js
       * version.
       */
      if (
        typeof message.react ===
        'function'
      ) {
        try {
          await message.react('❤️');
          console.log(
            `❤️ Status reaction request sent for ${phone}`
          );
        } catch (error) {
          console.error(
            `❌ Status reaction failed for ${phone}:`,
            error.message
          );
        }
      }
    } catch (error) {
      console.error(
        `[Status Handler Error ${phone}]`,
        error
      );
    }
  }
  /*
   * =====================================================
   * PAIRING CODE
   * =====================================================
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
   * =====================================================
   * STATUS
   * =====================================================
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
  /*
   * =====================================================
   * DISCONNECT
   * =====================================================
   */
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
        `[Disconnect Error ${normalized}]`,
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
   * =====================================================
   * EXPIRE ACCOUNT
   * =====================================================
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
   * =====================================================
   * AUTOMATIC EXPIRY MONITOR
   * =====================================================
   */
  startExpiryMonitor() {
    if (this.statusMonitor) {
      return;
    }
    console.log(
      '⏱️ Starting automatic account expiry monitor...'
    );
    this.statusMonitor =
      setInterval(
        async () => {
          try {
            const accounts =
              multiAccountService.getAllAccounts();
            for (const account of accounts) {
              if (!account || !account.phone) {
                continue;
              }
              const check =
                multiAccountService.checkAccount(
                  account.phone
                );
              if (
                check.exists &&
                !check.active &&
                account.status !==
                  'expired'
              ) {
                console.log(
                  `⛔ Expiring WhatsApp account: ${account.phone}`
                );
                try {
                  await this.expireAccount(
                    account.phone
                  );
                } catch (
                  error
                ) {
                  console.error(
                    `[Expiry Error ${account.phone}]`,
                    error.message
                  );
                }
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
   * =====================================================
   * CONNECTED ACCOUNTS
   * =====================================================
   */
  getConnectedAccounts() {
    return Array.from(
      this.clients.keys()
    );
  }
  /*
   * =====================================================
   * STATISTICS
   * =====================================================
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
