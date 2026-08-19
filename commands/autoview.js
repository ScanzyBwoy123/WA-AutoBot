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
      /*
       * Use the customer's actual account settings.
       */
      let accountService;
      try {
        accountService = require('../backend/services/multiAccountService');
      } catch (error) {
        console.error(
          '[AutoView] Failed loading account service:',
          error.message
        );
        return '❌ Account service unavailable.';
      }
      const account =
        accountService.getAccount(phone);
      if (!account) {
        return '❌ WhatsApp account not found.';
      }
      /*
       * ========================================================
       * OFF
       * ========================================================
       */
      if (action === 'off') {
        account.autoView = false;
        account.autoViewStatus = false;
        account.updatedAt =
          new Date().toISOString();
        accountService.saveAccounts();
        db.updateSettings({
          autoView: false
        });
        if (
          service &&
          typeof service.stopStatusMonitor ===
            'function'
        ) {
          service.stopStatusMonitor(phone);
        }
        return (
          'Auto View disabled ❌\n' +
          '👀 Auto-viewing has been stopped immediately.'
        );
      }
      /*
       * ========================================================
       * ON
       * ========================================================
       */
      if (action === 'on') {
        account.autoView = true;
        account.autoViewStatus = true;
        account.updatedAt =
          new Date().toISOString();
        accountService.saveAccounts();
        db.updateSettings({
          autoView: true
        });
        if (
          service &&
          typeof service.startStatusMonitor ===
            'function'
        ) {
          const started =
            service.startStatusMonitor(phone);
          if (started) {
            return (
              'Auto View enabled ✅\n' +
              '👀 Auto-viewing is now active.'
            );
          }
          return (
            'Auto View saved ✅\n' +
            '⚠️ Worker could not start. Make sure WhatsApp is connected.'
          );
        }
        return (
          'Auto View enabled ✅\n' +
          '⚠️ Setting saved, but the status worker is unavailable.'
        );
      }
      return '⚠️ Usage: .autoview on|off';
    } catch (error) {
      console.error(
        '[AutoView] Error:',
        error
      );
      return (
        '❌ Auto View error: ' +
        (error.message || 'Unknown error')
      );
    }
  }
};
