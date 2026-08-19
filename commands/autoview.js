'use strict';
const db = require('../backend/database/db');
function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}
module.exports = {
  name: 'autoview',
  category: 'Automation',
  description: 'Enable or disable automatic WhatsApp Status viewing',
  /*
   * IMPORTANT:
   * commands/index.js calls:
   *
   * command.execute(context, args)
   *
   * Therefore the first argument is CONTEXT
   * and the second argument is ARGS.
   */
  async execute(context = {}, args = []) {
    try {
      const action = String(
        args?.[0] || 'on'
      )
        .trim()
        .toLowerCase();
      const phone = normalizePhone(
        context?.phone ||
        context?.account?.phone ||
        context?.message?.from ||
        context?.chatId ||
        context?.from ||
        ''
      );
      const service =
        context?.service ||
        context?.multiAccountWhatsApp ||
        context?.whatsappService ||
        context?.accountService;
      console.log(
        `[AutoView] action=${action} phone=${phone || 'UNKNOWN'}`
      );
      if (!phone) {
        return (
          '❌ Could not identify your WhatsApp account.\n' +
          '⚠️ The command context did not contain a phone number.'
        );
      }
      if (!service) {
        return (
          '❌ WhatsApp service context is unavailable.'
        );
      }
      /*
       * ============================================================
       * OFF
       * ============================================================
       */
      if (
        action === 'off' ||
        action === 'disable'
      ) {
        db.updateSettings({
          autoView: false
        });
        if (
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
       * ============================================================
       * ON
       * ============================================================
       */
      if (
        action === 'on' ||
        action === 'enable'
      ) {
        db.updateSettings({
          autoView: true
        });
        if (
          typeof service.startStatusMonitor !==
          'function'
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
          '⚠️ Auto View was saved, but the Status worker could not start.\n' +
          'Make sure your WhatsApp account is connected and READY.'
        );
      }
      /*
       * ============================================================
       * STATUS
       * ============================================================
       */
      if (action === 'status') {
        let result = null;
        if (
          typeof service.getStatusAutomation ===
          'function'
        ) {
          result =
            service.getStatusAutomation(phone);
        }
        return (
          '👀 Auto View: ' +
          (
            result?.running &&
            result?.autoView
              ? 'ON ✅'
              : 'OFF ❌'
          )
        );
      }
      return (
        '⚠️ Usage:\n' +
        '.autoview on\n' +
        '.autoview off\n' +
        '.autoview status'
      );
    } catch (error) {
      console.error(
        '[AutoView] Command error:',
        error
      );
      return (
        '❌ Auto View error: ' +
        (error?.message || 'Unknown error')
      );
    }
  }
};
