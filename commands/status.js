const db = require('../backend/database/db');

module.exports = {
  name: 'status',
  category: 'System',
  description: 'Show bot runtime statistics and status',

  async execute(args, context) {
    const stats = db.getStats();
    const settings = db.getSettings();

    const hours = Math.floor(stats.uptimeSeconds / 3600);
    const mins = Math.floor((stats.uptimeSeconds % 3600) / 60);

    return `╭─── BOT STATUS ───╮
│ Status: ${
      stats.status === 'Connected'
        ? '🟢 Online'
        : '🔴 Offline'
    }
│ Uptime: ${hours}h ${mins}m
│ Auto View: ${
      settings.autoView ? 'ON ✅' : 'OFF ❌'
    }
│ Auto Like: ${
      settings.autoLike ? 'ON ❤️' : 'OFF ❌'
    }
│ Anti-Delete: ${
      settings.antiDelete ? 'ON ✅' : 'OFF ❌'
    }
│ Commands Run: ${stats.commandsExecuted}
│ Messages Processed: ${stats.messagesProcessed}
│ Media Saved: ${stats.mediaSaved}
╰────────────────────╯`;
  }
};
