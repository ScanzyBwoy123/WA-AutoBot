const db = require('../backend/database/db');

module.exports = {
  name: 'play',
  category: 'Media',
  description: 'Search audio or video using the configured media provider',

  async execute(args, context) {
    const type = (args[0] || '').toLowerCase();
    const query = args.slice(1).join(' ').trim();

    if (!['audio', 'video'].includes(type) || !query) {
      return `⚠️ Usage:

.play audio <song name>
.play video <video title>`;
    }

    if (!process.env.MEDIA_API_KEY) {
      db.logActivity(
        `Play ${type} request: ${query}`,
        'info'
      );

      return `🎵 ${type === 'audio' ? 'Audio' : 'Video'} request received: "${query}"\n\nA licensed media provider API key is not configured yet.`;
    }

    return `🔎 Searching ${type} for "${query}" using the configured media provider...`;
  }
};
