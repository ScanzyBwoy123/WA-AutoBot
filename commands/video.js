const db = require('../backend/database/db');

module.exports = {
  name: 'video',
  category: 'Media',
  description: 'Search video content using the configured media provider',

  async execute(args, context) {
    const query = args.join(' ').trim();

    if (!query) {
      return '⚠️ Usage: .video <video title or supported URL>';
    }

    if (!process.env.MEDIA_API_KEY) {
      db.logActivity(
        `Video search requested: ${query}`,
        'info'
      );

      return `🎬 Video request received: "${query}"\n\nA licensed media provider API key is not configured yet.`;
    }

    return `🎬 Searching for "${query}" using the configured media provider...`;
  }
};
