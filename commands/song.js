const db = require('../backend/database/db');

module.exports = {
  name: 'song',
  aliases: ['music'],
  category: 'Media',
  description: 'Search for a song using the configured media provider',

  async execute(args, context) {
    const query = args.join(' ').trim();

    if (!query) {
      return '⚠️ Usage: .song <song name>';
    }

    if (!process.env.MEDIA_API_KEY) {
      db.logActivity(
        `Song search requested: ${query}`,
        'info'
      );

      return `🎵 Song search received: "${query}"\n\nA licensed media provider API key is not configured yet. Add MEDIA_API_KEY to the backend environment before enabling media results.`;
    }

    return `🎵 Searching for "${query}" using the configured media provider...`;
  }
};
