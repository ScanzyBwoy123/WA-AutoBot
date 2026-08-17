const db = require('../backend/database/db');

module.exports = {
  name: 'autoview',
  category: 'Automation',
  description: 'Toggle auto viewing of WhatsApp Statuses',

  async execute(args, context) {
    const action = (args[0] || 'on').toLowerCase();

    if (action === 'off') {
      db.updateSettings({
        autoView: false
      });

      db.logActivity(
        'Auto View disabled',
        'warning'
      );

      return 'Auto View disabled ❌';
    }

    if (action === 'on') {
      db.updateSettings({
        autoView: true
      });

      db.logActivity(
        'Auto View enabled',
        'success'
      );

      return 'Auto View enabled ✅';
    }

    return '⚠️ Usage: .autoview on|off';
  }
};
