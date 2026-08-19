'use strict';

const db = require('../backend/database/db');

module.exports = {
  name: 'autoview',
  category: 'Automation',
  description: 'Enable or disable automatic WhatsApp Status viewing',

  async execute(input, context = {}) {
    try {
      let action = 'on';

      if (Array.isArray(input)) {
        action = String(input[0] || 'on').toLowerCase();
      } else {
        const text = String(input || '').trim();
        const parts = text.split(/\s+/);
        action = String(parts[1] || 'on').toLowerCase();
      }

      const phone =
        context.phone ||
        context.account?.phone ||
        String(context.from || '').replace(/\D/g, '');

      const service = context.service;

      if (!phone) {
        return '❌ Could not identify your WhatsApp account.';
      }

      if (action === 'off') {
        db.updateSettings({
          autoView: false
        });

        if (
          service &&
          typeof service.stopStatusMonitor === 'function'
        ) {
          service.stopStatusMonitor(phone);
        }

        return 'Auto View disabled ❌\n👀 Auto-viewing has been stopped immediately.';
      }

      if (action === 'on') {
        db.updateSettings({
          autoView: true
        });

        if (
          service &&
          typeof service.startStatusMonitor === 'function'
        ) {
          const started =
            service.startStatusMonitor(phone);

          if (started) {
            return 'Auto View enabled ✅\n👀 Auto-viewing is now active.';
          }

          return (
            'Auto View saved ✅\n' +
            '⚠️ The worker could not start. Make sure WhatsApp is connected.'
          );
        }

        return (
          'Auto View enabled ✅\n' +
          '⚠️ Reconnect WhatsApp to start the status worker.'
        );
      }

      return '⚠️ Usage: .autoview on|off';
    } catch (error) {
      console.error(
        '[AutoView] Error:',
        error
      );

      return `❌ Auto View error: ${
        error.message || 'Unknown error'
      }`;
    }
  }
};
