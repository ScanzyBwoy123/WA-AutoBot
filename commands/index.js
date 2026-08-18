const fs = require('fs');
const path = require('path');

const commands = new Map();
const COMMANDS_DIR = __dirname;

function normalizeCommandName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/^\./, '');
}

function loadCommands() {
  commands.clear();

  let files = [];

  try {
    files = fs.readdirSync(COMMANDS_DIR);
  } catch (error) {
    console.error(
      '[Commands] Failed to read commands directory:',
      error.message
    );
    return;
  }

  for (const file of files) {
    if (
      file === 'index.js' ||
      !file.endsWith('.js')
    ) {
      continue;
    }

    const fullPath = path.join(
      COMMANDS_DIR,
      file
    );

    try {
      delete require.cache[
        require.resolve(fullPath)
      ];

      const commandModule =
        require(fullPath);

      if (!commandModule) {
        continue;
      }

      let commandName =
        commandModule.name ||
        commandModule.command ||
        path.basename(file, '.js');

      commandName =
        normalizeCommandName(commandName);

      if (!commandName) {
        continue;
      }

      commands.set(
        commandName,
        commandModule
      );

      console.log(
        `✅ Command loaded: .${commandName}`
      );
    } catch (error) {
      console.error(
        `❌ Failed loading command ${file}:`,
        error.message
      );
    }
  }

  console.log(
    `📦 Total commands loaded: ${commands.size}`
  );
}

function getCommandNames() {
  return Array.from(commands.keys()).sort();
}

/*
 * FIX:
 *
 * Some commands, especially .menu,
 * expect getCommandList().
 *
 * The old router only exposed
 * getCommandNames().
 *
 * We now expose BOTH.
 */
function getCommandList() {
  return getCommandNames();
}

/*
 * Execute a command.
 */
async function execute(input, context = {}) {
  const text =
    String(input || '').trim();

  if (!text) {
    return null;
  }

  /*
   * ONLY messages beginning with .
   * are commands.
   *
   * Normal messages are ignored.
   */
  if (!text.startsWith('.')) {
    return null;
  }

  const parts =
    text
      .slice(1)
      .trim()
      .split(/\s+/);

  const commandName =
    normalizeCommandName(
      parts.shift()
    );

  const args = parts;

  if (!commandName) {
    return null;
  }

  /*
   * Reload command files.
   */
  loadCommands();

  let command =
    commands.get(commandName);

  /*
   * Built-in .menu
   *
   * This guarantees .menu works even if
   * there is no menu.js file.
   */
  if (commandName === 'menu') {
    const names =
      getCommandNames();

    if (!names.length) {
      return (
        '📋 *Available Commands*\n\n' +
        'No commands are currently installed.'
      );
    }

    return (
      '📋 *Available Commands*\n\n' +
      names
        .map((name) => `• .${name}`)
        .join('\n') +
      '\n\nType a command exactly as shown.'
    );
  }

  /*
   * Built-in .help
   */
  if (commandName === 'help') {
    return (
      '🤖 *WA AutoBot Help*\n\n' +
      'Use `.menu` to see all available commands.\n\n' +
      'Commands must begin with a dot.\n' +
      'Example: `.menu`'
    );
  }

  /*
   * Built-in .ping
   */
  if (commandName === 'ping') {
    return '🏓 Pong! Bot is online.';
  }

  /*
   * Built-in .status
   */
  if (commandName === 'status') {
    return '🟢 WA AutoBot is online and responding.';
  }

  /*
   * Built-in .react
   *
   * Usage:
   * .react ❤️
   * .react 👍
   * .react 😂
   *
   * If no emoji is supplied, ❤️ is used.
   */
  if (commandName === 'react') {
    const emoji =
      args.join(' ').trim() || '❤️';

    try {
      const message =
        context.message;

      if (
        message &&
        typeof message.react === 'function'
      ) {
        await message.react(emoji);

        return `❤️ Reacted with ${emoji}`;
      }

      return (
        '❌ I cannot react to this message.'
      );
    } catch (error) {
      console.error(
        '[Commands] React error:',
        error
      );

      return (
        `❌ Unable to react: ${
          error.message ||
          'Unknown error'
        }`
      );
    }
  }

  /*
   * Unknown command.
   */
  if (!command) {
    return (
      `❌ Unknown command: .${commandName}\n\n` +
      'Use .menu to see available commands.'
    );
  }

  try {
    /*
     * Function-style command.
     */
    if (
      typeof command === 'function'
    ) {
      return await command(
        context,
        args
      );
    }

    /*
     * execute-style command.
     */
    if (
      typeof command.execute ===
      'function'
    ) {
      return await command.execute(
        context,
        args
      );
    }

    /*
     * run-style command.
     */
    if (
      typeof command.run ===
      'function'
    ) {
      return await command.run(
        context,
        args
      );
    }

    /*
     * handler-style command.
     */
    if (
      typeof command.handler ===
      'function'
    ) {
      return await command.handler(
        context,
        args
      );
    }

    console.error(
      `[Commands] Invalid command module: ${commandName}`
    );

    return (
      `❌ Command .${commandName} is not configured correctly.`
    );
  } catch (error) {
    console.error(
      `[Commands] Error executing .${commandName}:`,
      error
    );

    return (
      `❌ Error running .${commandName}: ${
        error.message ||
        'Unknown error'
      }`
    );
  }
}

/*
 * Initial command loading.
 */
loadCommands();

/*
 * Public API.
 *
 * IMPORTANT:
 * getCommandList() is now included.
 */
module.exports = {
  execute,
  loadCommands,

  getCommands() {
    return Array.from(
      commands.entries()
    );
  },

  getCommandNames,

  getCommandList
};
