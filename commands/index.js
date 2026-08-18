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
        path.basename(
          file,
          '.js'
        );
      commandName =
        normalizeCommandName(
          commandName
        );
      if (!commandName) {
        continue;
      }
      commands.set(
        commandName,
        commandModule
      );
      console.log(
        `✅ Command loaded: ${commandName}`
      );
    } catch (error) {
      console.error(
        `❌ Failed loading command ${file}:`,
        error.message
      );
    }
  }
}
function getCommandNames() {
  return Array.from(
    commands.keys()
  ).sort();
}
async function execute(
  input,
  context = {}
) {
  const text =
    String(input || '')
      .trim();
  if (!text) {
    return null;
  }
  /*
   * IMPORTANT:
   *
   * Commands must start with a dot.
   *
   * Ordinary messages such as:
   *
   * hello
   * how are you
   * 😂
   * ❤️
   *
   * are NOT commands.
   *
   * This prevents the bot from replying:
   * "Unknown command"
   * to normal messages.
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
   * Reload commands so newly added commands
   * are detected without restarting the bot.
   */
  loadCommands();
  const command =
    commands.get(
      commandName
    );
  if (!command) {
    return (
      '❌ Unknown command: .' +
      commandName +
      '\n\nUse .menu to see available commands.'
    );
  }
  try {
    /*
     * Support several command formats.
     */
    if (
      typeof command ===
      'function'
    ) {
      return await command(
        context,
        args
      );
    }
    if (
      typeof command.execute ===
      'function'
    ) {
      return await command.execute(
        context,
        args
      );
    }
    if (
      typeof command.run ===
      'function'
    ) {
      return await command.run(
        context,
        args
      );
    }
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
 */
module.exports = {
  execute,
  loadCommands,
  getCommands() {
    return Array.from(
      commands.entries()
    );
  },
  getCommandNames
};
