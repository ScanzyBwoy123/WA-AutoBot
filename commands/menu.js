const db = require('../backend/database/db');

module.exports = {
  name: 'menu',
  category: 'System',
  description: 'Display available dynamic commands',

  async execute(args, context) {
    const commandRouter = require('./index');
    const commands = commandRouter.getCommandList();
    const settings = db.getSettings();

    const grouped = {};

    for (const command of commands) {
      const category = command.category || 'General';

      if (!grouped[category]) {
        grouped[category] = [];
      }

      grouped[category].push(command);
    }

    let menuText = `╭─── ${settings.botName} ───╮\n`;
    menuText += `│\n`;

    for (const [category, categoryCommands] of Object.entries(grouped)) {
      menuText += `│ 📂 ${category}\n`;

      for (const command of categoryCommands) {
        menuText += `│ • ${settings.prefix}${command.name}\n`;
      }

      menuText += `│\n`;
    }

    menuText += `╰────────────────────╯\n`;
    menuText += `\nPrefix: ${settings.prefix}`;

    return menuText;
  }
};
