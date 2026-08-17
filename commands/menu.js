const db = require('../backend/database/db');

module.exports = {
  name: 'menu',
  category: 'System',
  description: 'Display available commands and bot information',

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

    let menuText = `╭━━━ 🤖 ${settings.botName} ━━━╮\n`;
    menuText += `│\n`;
    menuText += `│ 👨🏽‍💻 Created by: Junior Dangote\n`;
    menuText += `│ 💎 Automate. Connect. Simplify.\n`;
    menuText += `│\n`;

    for (const [category, categoryCommands] of Object.entries(grouped)) {
      menuText += `│ 📂 ${category}\n`;

      for (const command of categoryCommands) {
        menuText += `│ • ${settings.prefix}${command.name}\n`;
      }

      menuText += `│\n`;
    }

    menuText += `│ ℹ️ .about — About WA-AutoBot\n`;
    menuText += `│ 👑 .owner — Bot creator\n`;
    menuText += `│ 🛠️ .support — Contact support\n`;
    menuText += `│\n`;
    menuText += `╰━━━━━━━━━━━━━━━━━━━━╯\n`;
    menuText += `Prefix: ${settings.prefix}`;

    return menuText;
  }
};
