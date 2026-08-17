const db = require('../backend/database/db');

module.exports = {
  name: 'autolike',
  category: 'Automation',
  description: 'Toggle auto reacting to WhatsApp Statuses',

  async execute(args, context) {
    const action = (args[0] || 'on').toLowerCase();

    if (action === 'off') {
      db.updateSettings({
        autoLike: false
      });

      db.logActivity(
        'Auto Like disabled',
        'warning'
      );

      return 'Auto Like disabled ❌';
    }

    if (action === 'on') {
      db.updateSettings({
        autoLike: true
      });

      db.logActivity(
        'Auto Like enabled',
        'success'
      );

      return 'Auto Like enabled ❤️';
    }

    return '⚠️ Usage: .autolike on|off';
  }
};
