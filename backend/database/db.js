class Database {
  constructor() {
    this.settings = {
      prefix: '.',
      ownerNumber: process.env.OWNER_NUMBER || '+233554279349',
      botName: 'WA-AutoBot v1.0',
      autoView: true,
      autoLike: true,
      antiDelete: true,
      mediaStorageLimit: '10 GB'
    };

    this.stats = {
      status: 'Disconnected',
      uptimeSeconds: 0,
      messagesProcessed: 0,
      commandsExecuted: 0,
      mediaSaved: 0,
      latency: '0ms'
    };

    this.activities = [];
    this.media = [];

    this.startedAt = null;
  }

  getSettings() {
    return this.settings;
  }

  updateSettings(newSettings = {}) {
    this.settings = {
      ...this.settings,
      ...newSettings
    };

    return this.settings;
  }

  getStats() {
    if (this.startedAt) {
      this.stats.uptimeSeconds = Math.floor(
        (Date.now() - this.startedAt) / 1000
      );
    }

    return this.stats;
  }

  setBotStatus(status) {
    this.stats.status = status;

    if (status === 'Connected') {
      if (!this.startedAt) {
        this.startedAt = Date.now();
      }
    } else {
      this.startedAt = null;
      this.stats.uptimeSeconds = 0;
    }
  }

  incrementCommands() {
    this.stats.commandsExecuted += 1;
    this.stats.messagesProcessed += 1;
  }

  incrementMedia() {
    this.stats.mediaSaved += 1;
  }

  getActivities() {
    return this.activities;
  }

  logActivity(text, status = 'info') {
    this.activities.unshift({
      id: Date.now(),
      text,
      time: 'Just now',
      status
    });

    if (this.activities.length > 50) {
      this.activities.pop();
    }
  }

  getMedia() {
    return this.media;
  }
}

module.exports = new Database();
