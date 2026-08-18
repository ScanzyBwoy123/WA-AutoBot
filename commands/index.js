const fs = require('fs');
const path = require('path');

const commands = new Map();

function loadCommands() {
  commands.clear();

  const commandFiles = fs
    .readdirSync(__dirname)
    .filter(
      (file) =>
        file.endsWith('.js') &&
        file !== 'index.js'
    );

  for (const file of commandFiles) {
    try {
      const filePath = path.join(
        __dirname,
        file
      );

      delete require.cache[
        require.resolve(filePath)
      ];

      const command = require(filePath);

      if (
        !command ||
        typeof command !== 'object' ||
        !command.name ||
        typeof command.execute !== 'function'
      ) {
        console.warn(
          `[Commands] Skipping invalid command: ${file}`
        );
        continue;
      }

      const name =
        String(command.name)
          .trim()
          .toLowerCase();

      if (!name) {
        continue;
      }

      commands.set(
        name,
        command
      );

      if (
        Array.isArray(command.aliases)
      ) {
        for (
          const alias of command.aliases
        ) {
          const aliasName =
            String(alias)
              .trim()
              .toLowerCase();

          if (aliasName) {
            commands.set(
              aliasName,
              command
            );
          }
        }
      }

      console.log(
        `✅ Command loaded: ${name}`
      );
    } catch (error) {
      console.error(
        `[Commands] Failed to load ${file}:`,
        error
      );
    }
  }

  console.log(
    `✅ Command system loaded ${commands.size} command/alias entries`
  );
}

function getCommandList() {
  const uniqueCommands =
    new Map();

  for (
    const command of commands.values()
  ) {
    const name =
      String(command.name)
        .trim()
        .toLowerCase();

    if (!uniqueCommands.has(name)) {
      uniqueCommands.set(
        name,
        command
      );
    }
  }

  return Array.from(
    uniqueCommands.values()
  ).map((command) => ({
    name: command.name,
    aliases:
      Array.isArray(command.aliases)
        ? command.aliases
        : [],
    category:
      command.category ||
      'General',
    description:
      command.description ||
      ''
  }));
}

function normalizeInput(input) {
  let text =
    String(input || '')
      .trim();

  if (!text) {
    return {
      name: '',
      args: []
    };
  }

  /*
   * Support:
   *
   * .menu
   * menu
   * .ping
   * ping
   * .autoview on
   * autoview on
   */

  if (text.startsWith('.')) {
    text =
      text
        .slice(1)
        .trim();
  }

  const parts =
    text.split(/\s+/);

  const name =
    String(parts.shift() || '')
      .trim()
      .toLowerCase();

  return {
    name,
    args: parts
  };
}

async function execute(
  input,
  context = {}
) {
  if (
    input === undefined ||
    input === null
  ) {
    return '⚠️ Please enter a command.';
  }

  const {
    name,
    args
  } = normalizeInput(input);

  if (!name) {
    return '⚠️ Please enter a command.';
  }

  /*
   * Reload commands if the command map
   * somehow became empty.
   */

  if (commands.size === 0) {
    loadCommands();
  }

  const command =
    commands.get(name);

  if (!command) {
    return (
      `❌ Unknown command: ${name}\n` +
      `Use .menu to see available commands.`
    );
  }

  try {
    const response =
      await command.execute(
        args,
        context
      );

    return response;
  } catch (error) {
    console.error(
      `[Commands] ${name} failed:`,
      error
    );

    return (
      `❌ Command failed: ${
        error.message ||
        'Unknown error'
      }`
    );
  }
}

/*
 * Load all commands when the
 * command system starts.
 */
loadCommands();

module.exports = {
  execute,
  getCommandList,
  loadCommands
};
