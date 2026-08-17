const db = require('../backend/database/db');

module.exports = {
  name: 'vv',
  aliases: ['viewonce'],
  category: 'Media',
  description: 'Handle view-once media received by the bot',

  async execute(args, context) {
    db.logActivity(
      'View-once media command requested',
      'info'
    );

    return '📸 View-once media handling is ready, but WhatsApp media reception is not connected yet.';
  }
};
