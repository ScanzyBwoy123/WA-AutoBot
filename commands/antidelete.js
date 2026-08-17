const db = require('../backend/database/db');

module.exports = {
  name: 'antidelete',
  category: 'Automation',
  description: 'Toggle anti-delete message handling',

  async execute(args, context) {
    const action = (args[0] || 'on').toLowerCase();

    if (action === 'off') {
      db.updateSettings({
        antiDelete: false
      });

      db.logActivity(
        'Anti-Delete disabled',
        'warning'
      );

      return 'Anti-Delete disabled ❌';
    }

    if (action === 'on') {
      db.updateSettings({
        antiDelete: true
      });

      db.logActivity(
        'Anti-Delete enabled',
        'success'
      );

      return 'Anti-Delete enabled ✅';
    }

    return '⚠️ Usage: .antidelete on|off';
  }
};
