const db = require('../database/db');

class WhatsAppService {
  init() {
    console.log('[WhatsAppService] Service initialized');
  }

  connect() {
    db.setBotStatus('Connected');
    db.logActivity('WhatsApp socket connected', 'success');

    return {
      success: true,
      status: db.getStats().status
    };
  }

  disconnect() {
    db.setBotStatus('Disconnected');
    db.logActivity('WhatsApp socket disconnected', 'warning');

    return {
      success: true,
      status: db.getStats().status
    };
  }

  getStatus() {
    return db.getStats().status;
  }
}

module.exports = new WhatsAppService();
