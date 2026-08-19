'use strict';
const db = require('../backend/database/db');
function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}
function getPhone(context = {}) {
  return normalizePhone(
    context.phone ||
    context.account?.phone ||
    context.message?.from ||
    context.chatId ||
    context.from ||
    ''
  );
}
module.exports = {
  name: 'autoview',
  category: 'Automation',
  description: 'Enable or disable automatic WhatsApp Status viewing',
  async execute(input, context = {}) {
    try {
      let action = 'on';
      if (Array.isArray(input)) {
        action = String(input[0] || 'on')
          .trim()
          .toLowerCase();
      } else {
        const text = String(input || '').trim();
        const parts = text.split(/\s+/);
        action = String(parts[1] || 'on')
          .trim()
          .toLowerCase();
      }
      const phone = getPhone(context);
      const service = context.service;
      console.log(
        `[AutoView] Command=${action} phone=${phone || 'UNKNOWN'}`
      );
      if (!phone) {
        return '❌ Could not identify your WhatsApp account.';
      }
      if (!service) {
        return '❌ WhatsApp service context is unavailable.';
      }
      // =========================
      // TURN OFF
      // =========================
      if (action === 'off') {
        db.updateSettings({
          autoView: false
        });
        if (
          typeof service.stopStatusMonitor === 'function'
        ) {
          service.stopStatusMonitor(phone);
        }
        return (
          'Auto View disabled ❌\n' +
          '👀 Auto-viewing has been stopped immediately.'
        );
      }
      // =========================
      // TURN ON
      // =========================
      if (action === 'on') {
        db.updateSettings({
          autoView: true
        });
        if (
          typeof service.startStatusMonitor !== 'function'
        ) {
          return (
            '❌ Status automation service is unavailable.'
          );
        }
        const started =
          service.startStatusMonitor(phone);
        if (started) {
          return (
            'Auto View enabled ✅\n' +
            '👀 Auto-viewing is now active.'
          );
        }
        return (
          '⚠️ Auto View could not start.\n' +
          'Make sure your WhatsApp account is connected and READY.'
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
