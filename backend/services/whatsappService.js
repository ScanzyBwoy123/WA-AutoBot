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

    this.approvedUsers = new Set();
    this.loadApprovedUsers();

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

  getOwnerNumber() {
    return String(
      process.env.OWNER_NUMBER ||
      process.env.WHATSAPP_PHONE ||
      ''
    ).replace(/\D/g, '');
  }

  getPhoneNumber() {
    return String(
      process.env.WHATSAPP_PHONE ||
      process.env.OWNER_NUMBER ||
      ''
    ).replace(/\D/g, '');
  }

  normalizeNumber(value) {
    return String(value || '').replace(/\D/g, '');
  }

  loadApprovedUsers() {
    try {
      const file = path.join(
        process.cwd(),
        'approved-users.json'
      );

      if (fs.existsSync(file)) {
        const data = JSON.parse(
          fs.readFileSync(file, 'utf8')
        );

        if (Array.isArray(data)) {
          data
            .map((n) => this.normalizeNumber(n))
            .filter(Boolean)
            .forEach((n) => {
              this.approvedUsers.add(n);
            });
        }
      }
    } catch (error) {
      console.error(
        '[Access Control] Failed to load users:',
        error.message
      );
    }

    const owner = this.getOwnerNumber();

    if (owner) {
      this.approvedUsers.add(owner);
    }
  }

  saveApprovedUsers() {
    try {
      const file = path.join(
        process.cwd(),
        'approved-users.json'
      );

      fs.writeFileSync(
        file,
        JSON.stringify(
          Array.from(this.approvedUsers).sort(),
          null,
          2
        )
      );
    } catch (error) {
      console.error(
        '[Access Control] Failed to save users:',
        error.message
      );
    }
  }

  isOwner(message) {
    /*
     * VERY IMPORTANT:
     *
     * message_create also receives messages
     * sent by the bot owner.
     *
     * Therefore message.fromMe is treated as
     * an owner message.
     */
    if (message && message.fromMe === true) {
      return true;
    }

    const owner = this.getOwnerNumber();

    if (!owner) {
      return false;
    }

    const values = [
      message?.from,
      message?.author,
      this.client?.info?.wid?.user
    ];

    return values.some(
      (value) =>
        this.normalizeNumber(value) === owner
    );
  }

  isApproved(message) {
    if (this.isOwner(message)) {
      return true;
    }

    const from =
      this.normalizeNumber(message?.from);

    const author =
      this.normalizeNumber(message?.author);

    return (
      this.approvedUsers.has(from) ||
      this.approvedUsers.has(author)
    );
  }

  findChromeExecutable(directory) {
    try {
      const entries = fs.readdirSync(
        directory,
        {
          withFileTypes: true
        }
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

        const result =
          this.findChromeExecutable(
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

    for (const root of roots) {
      if (!fs.existsSync(root)) {
        continue;
      }

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
        message:
          'WhatsApp is already connected.'
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
       * IMPORTANT:
       *
       * message_create receives both:
       *
       * 1. Incoming messages
       * 2. Messages created/sent by the
       *    connected WhatsApp account
       *
       * This is what allows the owner to
       * use commands from their own DM.
       */
      this.client.on(
        'message_create',
        async (message) => {
          try {
            if (
              message.from ===
              'status@broadcast'
            ) {
              return;
            }

            const text =
              String(
                message.body || ''
              ).trim();

            if (!text) {
              return;
            }

            if (!text.startsWith('.')) {
              return;
            }

            const owner =
              this.isOwner(message);

            const approved =
              this.isApproved(message);

            /*
             * Private bot:
             *
             * Owner = allowed
             * Approved users = allowed
             * Everyone else = blocked
             */
            if (!approved) {
              console.log(
                `🚫 Blocked command from ${message.from}: ${text}`
              );

              /*
               * Don't reply to strangers automatically.
               * This prevents people from using the
               * bot and avoids unnecessary messages.
               */
              return;
            }

            console.log(
              `📩 ${
                owner
                  ? 'OWNER'
                  : 'APPROVED USER'
              } command from ${message.from}: ${text}`
            );

            const parts =
              text
                .slice(1)
                .trim()
                .split(/\s+/);

            const commandName =
              (
                parts.shift() || ''
              ).toLowerCase();

            const args = parts;

            /*
             * OWNER-ONLY COMMANDS
             */
            const ownerOnlyCommands = [
              'adduser',
              'removeuser',
              'users',
              'pair'
            ];

            if (
              ownerOnlyCommands.includes(
                commandName
              ) &&
              !owner
            ) {
              await message.reply(
                '👑 This command is available to the bot owner only.'
              );

              return;
            }

            /*
             * .adduser
             */
            if (
              commandName ===
              'adduser'
            ) {
              const number =
                this.normalizeNumber(
                  args[0]
                );

              if (!number) {
                await message.reply(
                  '❌ Usage:\n.adduser 233XXXXXXXXX'
                );

                return;
              }

              this.approvedUsers.add(
                number
              );

              this.saveApprovedUsers();

              await message.reply(
                `✅ User approved.\n\n📱 ${number}\n\nThey can now use the bot.`
              );

              return;
            }

            /*
             * .removeuser
             */
            if (
              commandName ===
              'removeuser'
            ) {
              const number =
                this.normalizeNumber(
                  args[0]
                );

              if (!number) {
                await message.reply(
                  '❌ Usage:\n.removeuser 233XXXXXXXXX'
                );

                return;
              }

              if (
                number ===
                this.getOwnerNumber()
              ) {
                await message.reply(
                  '❌ You cannot remove the owner.'
                );

                return;
              }

              this.approvedUsers.delete(
                number
              );

              this.saveApprovedUsers();

              await message.reply(
                `✅ User removed.\n\n📱 ${number}`
              );

              return;
            }

            /*
             * .users
             */
            if (
              commandName ===
              'users'
            ) {
              const users =
                Array.from(
                  this.approvedUsers
                );

              const list =
                users.length
                  ? users
                      .map(
                        (number, index) =>
                          `${index + 1}. ${number}`
                      )
                      .join('\n')
                  : 'No approved users.';

              await message.reply(
                `👥 APPROVED USERS\n\n${list}`
              );

              return;
            }

            /*
             * .pair
             */
            if (
              commandName ===
              'pair'
            ) {
              if (
                this.pairingCode
              ) {
                await message.reply(
                  `🔑 CURRENT PAIRING CODE\n\n${this.pairingCode}\n\nUse WhatsApp → Settings → Linked Devices → Link with phone number instead.`
                );

                return;
              }

              if (this.isReady) {
                await message.reply(
                  '✅ WhatsApp is already connected.'
                );

                return;
              }

              await message.reply(
                '⏳ No pairing code is currently available. Start the bot from the dashboard first.'
              );

              return;
            }

            /*
             * EXISTING COMMAND SYSTEM
             */
            const context = {
              message,
              client:
                this.client,
              whatsapp:
                this,

              from:
                message.from,

              chat:
                message.from,

              sender:
                message.author ||
                message.from,

              isOwner:
                owner,

              isApproved:
                approved,

              args,

              reply:
                async (
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

                  if (
                    !replyText
                  ) {
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
                      '[WhatsApp Reply Error]',
                      replyError.message
                    );

                    try {
                      return await this.client.sendMessage(
                        message.from,
                        replyText
                      );
                    } catch (
                      sendError
                    ) {
                      console.error(
                        '[WhatsApp Send Error]',
                        sendError.message
                      );

                      throw sendError;
                    }
                  }
                }
            };

            const result =
              await commands.execute(
                text,
                context
              );

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
              `✅ Command completed: ${text}`
            );

          } catch (error) {
            console.error(
              '[Command Handler Error]',
              error
            );

            try {
              await message.reply(
                '❌ Something went wrong while processing that command.'
              );
            } catch (_) {}
          }
        }
      );

      await this.client.initialize();

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

          this.pairingRequested =
            false;

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
      status =
        'Connected';
    } else if (
      this.isConnecting
    ) {
      status =
        'Connecting';
    }

    return {
      connected:
        this.isReady,

      connecting:
        this.isConnecting,

      status,

      qrAvailable:
        false,

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

module.exports =
  new WhatsAppService();
