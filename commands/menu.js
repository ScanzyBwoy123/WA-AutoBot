const db = require('../backend/database/db');

module.exports = {
  name: 'menu',
  aliases: ['help', 'commands', 'cmds', '?'],
  category: 'System',
  description: 'Display all available WA-AutoBot commands',
  usage: '.menu [category]',
  cooldown: 5,
  permissions: [],
  botPermissions: [],

  async execute(context = {}, args = []) {
    try {
      const commandRouter = require('./index');

      if (
        !commandRouter ||
        typeof commandRouter.getCommands !== 'function'
      ) {
        return (
          '❌ Command system is temporarily unavailable.'
        );
      }

      const settings = this.getSettings();

      const categoryFilter =
        String(args[0] || '')
          .trim()
          .toLowerCase() || null;

      const commands =
        this.getValidCommands(
          commandRouter,
          context
        );

      const grouped =
        this.groupCommands(
          commands,
          settings
        );

      return this.buildMenu(
        grouped,
        settings,
        categoryFilter
      );
    } catch (error) {
      console.error(
        '[Menu] Failed generating menu:',
        error
      );

      return (
        '❌ Failed to generate the command menu.\n\n' +
        'Please try again.'
      );
    }
  },

  /*
  |--------------------------------------------------------------------------
  | SETTINGS
  |--------------------------------------------------------------------------
  */

  getSettings() {
    const defaults = {
      botName: 'WA-AutoBot v1.0',
      prefix: '.',
      owner: 'Junior Dangote',
      website: '',
      supportGroup: '',
      version: '1.0.0'
    };

    try {
      if (
        db &&
        typeof db.getSettings === 'function'
      ) {
        const databaseSettings =
          db.getSettings();

        if (
          databaseSettings &&
          typeof databaseSettings === 'object'
        ) {
          return {
            ...defaults,
            ...databaseSettings
          };
        }
      }
    } catch (error) {
      console.warn(
        '[Menu] Could not load database settings:',
        error.message
      );
    }

    return defaults;
  },

  /*
  |--------------------------------------------------------------------------
  | GET COMMANDS
  |--------------------------------------------------------------------------
  */

  getValidCommands(
    commandRouter,
    context = {}
  ) {
    const result = [];

    try {
      const entries =
        commandRouter.getCommands();

      if (!Array.isArray(entries)) {
        return result;
      }

      for (const entry of entries) {
        if (
          !Array.isArray(entry) ||
          entry.length < 2
        ) {
          continue;
        }

        const [
          registeredName,
          command
        ] = entry;

        if (
          !this.isValidCommand(
            registeredName,
            command,
            context
          )
        ) {
          continue;
        }

        const commandName =
          this.getCommandName(
            registeredName,
            command
          );

        if (!commandName) {
          continue;
        }

        result.push({
          name: commandName,
          command
        });
      }
    } catch (error) {
      console.error(
        '[Menu] Failed reading commands:',
        error.message
      );
    }

    return result;
  },

  /*
  |--------------------------------------------------------------------------
  | VALIDATE COMMAND
  |--------------------------------------------------------------------------
  */

  isValidCommand(
    name,
    command,
    context = {}
  ) {
    if (
      !name ||
      !command
    ) {
      return false;
    }

    /*
     * Commands can be exported as:
     *
     * module.exports = {
     *   execute() {}
     * }
     *
     * or:
     *
     * module.exports = async function() {}
     */

    const isFunction =
      typeof command === 'function';

    const isObject =
      typeof command === 'object';

    if (
      !isFunction &&
      !isObject
    ) {
      return false;
    }

    /*
     * Do not display the menu command itself.
     */

    if (
      String(name)
        .toLowerCase() === 'menu'
    ) {
      return false;
    }

    /*
     * Hidden commands should not appear.
     */

    if (
      command.hidden === true
    ) {
      return false;
    }

    /*
     * Disabled commands should not appear.
     */

    if (
      command.enabled === false
    ) {
      return false;
    }

    /*
     * Owner-only commands.
     *
     * These remain hidden from normal users.
     */

    if (
      command.ownerOnly === true &&
      !this.isOwner(context)
    ) {
      return false;
    }

    /*
     * Make sure the command actually
     * has an executable handler.
     */

    if (isFunction) {
      return true;
    }

    return (
      typeof command.execute === 'function' ||
      typeof command.run === 'function' ||
      typeof command.handler === 'function' ||
      typeof command.handle === 'function' ||
      typeof command.action === 'function'
    );
  },

  /*
  |--------------------------------------------------------------------------
  | COMMAND NAME
  |--------------------------------------------------------------------------
  */

  getCommandName(
    registeredName,
    command
  ) {
    let name =
      command?.name ||
      command?.command ||
      registeredName;

    name =
      String(name || '')
        .trim()
        .replace(/^\./, '')
        .toLowerCase();

    /*
     * Protect against the .undefined problem.
     */

    if (
      !name ||
      name === 'undefined' ||
      name === 'null'
    ) {
      return null;
    }

    return name;
  },

  /*
  |--------------------------------------------------------------------------
  | OWNER CHECK
  |--------------------------------------------------------------------------
  */

  isOwner(context = {}) {
    try {
      const ownerNumbers =
        String(
          process.env.OWNER_NUMBERS || ''
        )
          .split(',')
          .map(number =>
            number
              .replace(/\D/g, '')
              .trim()
          )
          .filter(Boolean);

      if (!ownerNumbers.length) {
        return false;
      }

      const possibleNumbers = [
        context.sender,
        context.from,
        context.author,
        context.phone
      ];

      for (
        const number of possibleNumbers
      ) {
        if (!number) {
          continue;
        }

        const normalized =
          String(number)
            .replace(/\D/g, '');

        if (
          ownerNumbers.includes(
            normalized
          )
        ) {
          return true;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  },

  /*
  |--------------------------------------------------------------------------
  | GROUP COMMANDS
  |--------------------------------------------------------------------------
  */

  groupCommands(
    commands,
    settings
  ) {
    const grouped = {};

    const prefix =
      settings?.prefix || '.';

    for (
      const item of commands
    ) {
      const command =
        item.command;

      const name =
        item.name;

      if (!name) {
        continue;
      }

      const category =
        String(
          command?.category ||
          'General'
        ).trim() || 'General';

      const description =
        String(
          command?.description ||
          command?.desc ||
          'No description'
        ).trim();

      const usage =
        command?.usage ||
        `${prefix}${name}`;

      const aliases =
        Array.isArray(
          command?.aliases
        )
          ? command.aliases
          : [];

      if (!grouped[category]) {
        grouped[category] = [];
      }

      grouped[category].push({
        name,
        description,
        usage,
        aliases
      });
    }

    /*
     * Sort commands alphabetically.
     */

    for (
      const category of Object.keys(
        grouped
      )
    ) {
      grouped[category].sort(
        (a, b) =>
          a.name.localeCompare(
            b.name
          )
      );
    }

    return grouped;
  },

  /*
  |--------------------------------------------------------------------------
  | BUILD MENU
  |--------------------------------------------------------------------------
  */

  buildMenu(
    grouped,
    settings,
    categoryFilter = null
  ) {
    const prefix =
      settings?.prefix || '.';

    const botName =
      settings?.botName ||
      'WA-AutoBot v1.0';

    const owner =
      settings?.owner ||
      'Junior Dangote';

    const version =
      settings?.version ||
      '1.0.0';

    let categories =
      Object.keys(grouped)
        .sort();

    /*
     * Category filtering.
     */

    if (categoryFilter) {
      categories =
        categories.filter(
          category =>
            category
              .toLowerCase()
              .includes(
                categoryFilter
              )
        );
    }

    /*
     * Count real commands.
     */

    const totalCommands =
      Object.values(grouped)
        .reduce(
          (total, commands) =>
            total +
            commands.length,
          0
        );

    /*
     * Header.
     */

    let menu = '';

    menu +=
      `╭━━━ 🤖 ${botName} ━━━╮\n`;

    menu += '│\n';

    menu +=
      `│ 👨🏽‍💻 Created by: ${owner}\n`;

    menu +=
      '│ 💎 Automate. Connect. Simplify.\n';

    menu += '│\n';

    /*
     * No commands.
     */

    if (!categories.length) {
      menu +=
        categoryFilter
          ? `│ ❌ No commands found for category: ${categoryFilter}\n`
          : '│ ❌ No commands are currently loaded.\n';

      menu += '│\n';
    } else {
      /*
       * Display categories.
       */

      for (
        const category of categories
      ) {
        const commandList =
          grouped[category];

        menu +=
          `│ 📂 ${category}\n`;

        for (
          const command
            of commandList
        ) {
          /*
           * NEVER allow undefined
           * to appear in the menu.
           */

          if (
            !command.name ||
            command.name ===
              'undefined'
          ) {
            continue;
          }

          menu +=
            `│ • ${prefix}${command.name}`;

          if (
            command.description &&
            command.description !==
              'No description'
          ) {
            menu +=
              ` — ${this.truncate(
                command.description,
                55
              )}`;
          }

          menu += '\n';
        }

        menu += '│\n';
      }
    }

    /*
     * Built-in commands.
     *
     * These are shown separately because
     * they are controlled by the bot system.
     */

    menu +=
      '│ ℹ️ *System Commands*\n';

    menu +=
      `│ • ${prefix}menu — Show all commands\n`;

    menu +=
      `│ • ${prefix}help — Show command menu\n`;

    menu +=
      `│ • ${prefix}status — Show account status\n`;

    menu +=
      `│ • ${prefix}pair — Show pairing code\n`;

    menu +=
      `│ • ${prefix}autoview on/off — Automatic Status viewing\n`;

    menu +=
      `│ • ${prefix}autolike on/off — Automatic Status reactions\n`;

    menu +=
      `│ • ${prefix}react — React to a Status\n`;

    menu += '│\n';

    /*
     * Footer.
     */

    menu +=
      '╰━━━━━━━━━━━━━━━━━━━━╯\n';

    menu +=
      `📊 Total Commands: ${totalCommands}\n`;

    menu +=
      `🔧 Prefix: ${prefix}\n`;

    menu +=
      `📦 Version: v${version}`;

    /*
     * Optional website.
     */

    if (
      settings?.website
    ) {
      menu +=
        `\n🌐 ${settings.website}`;
    }

    /*
     * Optional support group.
     */

    if (
      settings?.supportGroup
    ) {
      menu +=
        `\n💬 ${settings.supportGroup}`;
    }

    return menu;
  },

  /*
  |--------------------------------------------------------------------------
  | TRUNCATE
  |--------------------------------------------------------------------------
  */

  truncate(
    text,
    maxLength
  ) {
    const value =
      String(text || '');

    if (
      value.length <=
      maxLength
    ) {
      return value;
    }

    return (
      value.substring(
        0,
        maxLength - 3
      ) + '...'
    );
  }
};
