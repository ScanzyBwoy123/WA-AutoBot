const db = require('../backend/database/db');

module.exports = {
  name: 'settings',
  category: 'System',
  description: 'View current bot configuration',

  async execute(args, context) {
    const settings = db.getSettings();

    return `⚙️ BOT CONFIGURATION

Command Prefix: ${settings.prefix}
Owner Number: ${settings.ownerNumber}
Bot Name: ${settings.botName}
Auto View: ${settings.autoView ? 'ON' : 'OFF'}
Auto Like: ${settings.autoLike ? 'ON' : 'OFF'}
Anti-Delete: ${settings.antiDelete ? 'ON' : 'OFF'}
Media Storage Limit: ${settings.mediaStorageLimit}`;
  }
};
