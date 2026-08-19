const db = require('../backend/database/db');

module.exports = {
  name: 'autoview',
  category: 'Automation',
  description: 'Toggle auto viewing of WhatsApp Statuses',

  async execute(input, context = {}) {
    try {
      /*
       * Support both:
       *
       * .autoview on
       * .autoview off
       *
       * and routers that pass:
       *
       * execute(args, context)
       * execute(commandText, context)
       */

      let action = 'on';

      if (Array.isArray(input)) {
        action = String(input[0] || 'on').toLowerCase();
      } else {
        const text = String(input || '').trim();

        const parts = text.split(/\s+/);

        // .autoview on
        action = String(
          parts[1] || 'on'
        ).toLowerCase();
      }

      const phone =
        context.phone ||
        context.account?.phone ||
        context.from?.replace(/\D/g, '');

      const service =
        context.service;

      /*
       * ========================================================
       * TURN OFF
       * ========================================================
       */

      if (action === 'off') {
        db.updateSettings({
          autoView: false
        });

        db.logActivity(
          'Auto View disabled',
          'warning'
        );

        /*
         * Stop the worker immediately if the
         * multi-account service is available.
         */
        if (
          service &&
          typeof service.stopStatusMonitor ===
            'function' &&
          phone
        ) {
          try {
            service.stopStatusMonitor(phone);
          } catch (error) {
            console.error(
              '[AutoView] Failed stopping worker:',
              error.message
            );
          }
        }

        return 'Auto View disabled ❌';
      }

      /*
       * ========================================================
       * TURN ON
       * ========================================================
       */

      if (action === 'on') {
        db.updateSettings({
          autoView: true
        });

        db.logActivity(
          'Auto View enabled',
          'success'
        );

        /*
         * IMPORTANT:
         *
         * Start the status worker immediately.
         * Do not wait for another WhatsApp
         * connection or restart.
         */
        if (
          service &&
          typeof service.startStatusMonitor ===
            'function' &&
          phone
        ) {
          try {
            const started =
              service.startStatusMonitor(phone);

            if (started) {
              return (
                'Auto View enabled ✅\n' +
                '👀 Status automation worker started.'
              );
            }

            return (
              'Auto View enabled ✅\n' +
              '⚠️ Setting saved, but the status worker could not start. ' +
              'Make sure your WhatsApp account is connected.'
            );
          } catch (error) {
            console.error(
              '[AutoView] Failed starting worker:',
              error.message
            );

            return (
              'Auto View enabled ✅\n' +
              '⚠️ Setting saved, but the status worker failed to start.'
            );
          }
        }

        /*
         * Fallback if this command is called without
         * the service context.
         */
        return (
          'Auto View enabled ✅\n' +
          '⚠️ Setting saved. Reconnect your WhatsApp account to start automation.'
        );
      }

      return '⚠️ Usage: .autoview on|off';

    } catch (error) {
      console.error(
        '[AutoView] Command error:',
        error
      );

      return (
        '❌ Failed to update Auto View: ' +
        (error.message || 'Unknown error')
      );
    }
  }
};
