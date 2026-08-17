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
      const command = require(path.join(__dirname, file));

      if (!command || !command.name || typeof command.execute !== 'function') {
        console.warn(`[Commands] Skipping invalid command: ${file}`);
        continue;
      }

      commands.set(command.name.toLowerCase(), command);

      if (Array.isArray(command.aliases)) {
        for (const alias of command.aliases) {
          commands.set(alias.toLowerCase(), command);
        }
      }
    } catch (error) {
      console.error(`[Commands] Failed to load ${file}:`, error.message);
    }
  }
}

function getCommandList() {
  const uniqueCommands = new Map();

  for (const command of commands.values()) {
    uniqueCommands.set(command.name, command);
  }

  return Array.from(uniqueCommands.values()).map((command) => ({
    name: command.name,
    aliases: command.aliases || [],
    category: command.category || 'General',
    description: command.description || ''
  }));
}

async function execute(input, context = {}) {
  if (!input || typeof input !== 'string') {
    return '⚠️ Please enter a command.';
  }

  const trimmed = input.trim();

  if (!trimmed) {
    return '⚠️ Please enter a command.';
  }

  const prefix = '.';

  const commandText = trimmed.startsWith(prefix)
    ? trimmed.slice(prefix.length).trim()
    : trimmed;

  if (!commandText) {
    return '⚠️ Please enter a command.';
  }

  const parts = commandText.split(/\s+/);
  const commandName = parts.shift().toLowerCase();
  const args = parts;

  const command = commands.get(commandName);

  if (!command) {
    return `❌ Unknown command: ${commandName}\nUse .menu to see available commands.`;
  }

  try {
    return await command.execute(args, context);
  } catch (error) {
    console.error(`[Commands] ${commandName} failed:`, error);

    return `❌ Command failed: ${error.message || 'Unknown error'}`;
  }
}

loadCommands();

module.exports = {
  execute,
  getCommandList,
  loadCommands
};
