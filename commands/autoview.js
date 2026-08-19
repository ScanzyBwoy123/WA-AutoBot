'use strict';
module.exports = {
  name: 'autoview',
  category: 'Automation',
  description: 'Automatically view WhatsApp statuses',
  async execute(args, context) {
    try {
      /*
       * The command router passes:
       *
       * args    = command arguments
       * context = { client, message, phone, service, ... }
       */
      const phone = String(
        context?.phone || ''
      ).replace(/\D/g, '');
      const service = context?.service;
      const multiAccountService =
        context?.multiAccountService;
      if (!phone) {
        console.error(
          '[AutoView] Could not identify WhatsApp account.'
        );
        return '❌ Could not identify your WhatsApp account.';
      }
      if (!service) {
        console.error(
          `[AutoView] WhatsApp service missing for ${phone}`
        );
        return '❌ WhatsApp service is unavailable.';
      }
      /*
       * Normalize command arguments.
       */
      let action = '';
      if (Array.isArray(args)) {
        action = String(
          args[0] || ''
        ).toLowerCase();
      } else {
        action = String(
          args || ''
        )
          .trim()
          .split(/\s+/)[0]
          .toLowerCase();
      }
      console.log(
        `[AutoView] Command=${action || '(none)'} phone=${phone}`
      );
      /*
       * ========================================================
       * STATUS
       * ========================================================
       */
      if (
        action === '' ||
        action === 'status'
      ) {
        if (
          typeof service.getStatusAutomation ===
          'function'
        ) {
          const status =
            service.getStatusAutomation(phone);
          return (
            `👀 *Auto View Status*\n\n` +
            `📱 Account: ${phone}\n` +
            `⚙️ Auto View: ${
              status.autoView
                ? 'ON'
                : 'OFF'
            }\n` +
            `🟢 Worker: ${
              status.running
                ? 'RUNNING'
                : 'STOPPED'
            }`
          );
        }
        return '⚠️ Unable to read Auto View status.';
      }
      /*
       * ========================================================
       * ON
       * ========================================================
       */
      if (
        action === 'on' ||
        action === 'enable' ||
        action === 'enabled'
      ) {
        /*
         * Save Auto View setting.
         */
        let saved = true;
        if (
          multiAccountService &&
          typeof multiAccountService.setAutoViewStatus ===
            'function'
        ) {
          saved =
            multiAccountService.setAutoViewStatus(
              phone,
              true
            );
        } else if (
          multiAccountService &&
          typeof multiAccountService.updateAccount ===
            'function'
        ) {
          await multiAccountService.updateAccount(
            phone,
            {
              autoViewStatus: true
            }
          );
        } else if (
          multiAccountService &&
          typeof multiAccountService.setAccountSettings ===
            'function'
        ) {
          await multiAccountService.setAccountSettings(
            phone,
            {
              autoViewStatus: true
            }
          );
        } else {
          /*
           * The status service reads account settings,
           * so if no setter exists we cannot safely
           * claim the setting was saved.
           */
          saved = false;
        }
        if (!saved) {
          console.error(
            `[AutoView] Could not save setting for ${phone}`
          );
          return (
            '❌ Could not save Auto View setting.'
          );
        }
        /*
         * Make sure the WhatsApp client exists.
         */
        const client =
          typeof service.getClient ===
          'function'
            ? service.getClient(phone)
            : context?.client;
        if (!client) {
          return (
            '⚠️ Auto View was saved, but WhatsApp client was not found.\n\n' +
            'Make sure your WhatsApp account is connected and READY.'
          );
        }
        /*
         * Start the worker immediately.
         */
        let started = false;
        if (
          typeof service.startStatusMonitor ===
          'function'
        ) {
          started =
            service.startStatusMonitor(
              phone
            );
        } else if (
          typeof service.startStatusWorker ===
          'function'
        ) {
          started =
            service.startStatusWorker(
              client,
              phone
            );
        }
        if (!started) {
          console.error(
            `[AutoView] Worker could not start for ${phone}`
          );
          return (
            '⚠️ Auto View was saved, but the Status worker could not start.\n\n' +
            'Make sure your WhatsApp account is connected and READY.'
          );
        }
        console.log(
          `[AutoView] Auto View ENABLED for ${phone}`
        );
        return (
          '✅ *Auto View enabled!*\n\n' +
          '👀 Your WhatsApp statuses will now be viewed automatically.'
        );
      }
      /*
       * ========================================================
       * OFF
       * ========================================================
       */
      if (
        action === 'off' ||
        action === 'disable' ||
        action === 'disabled'
      ) {
        /*
         * Stop worker FIRST.
         */
        if (
          typeof service.stopStatusMonitor ===
          'function'
        ) {
          service.stopStatusMonitor(
            phone
          );
        } else if (
          typeof service.stopStatusWorker ===
          'function'
        ) {
          service.stopStatusWorker(
            phone
          );
        }
        /*
         * Save disabled setting.
         */
        let saved = true;
        if (
          multiAccountService &&
          typeof multiAccountService.setAutoViewStatus ===
            'function'
        ) {
          saved =
            multiAccountService.setAutoViewStatus(
              phone,
              false
            );
        } else if (
          multiAccountService &&
          typeof multiAccountService.updateAccount ===
            'function'
        ) {
          await multiAccountService.updateAccount(
            phone,
            {
              autoViewStatus: false
            }
          );
        } else if (
          multiAccountService &&
          typeof multiAccountService.setAccountSettings ===
            'function'
        ) {
          await multiAccountService.setAccountSettings(
            phone,
            {
              autoViewStatus: false
            }
          );
        } else {
          saved = false;
        }
        if (!saved) {
          return (
            '⚠️ Auto View worker stopped, but the setting could not be saved.'
          );
        }
        console.log(
          `[AutoView] Auto View DISABLED for ${phone}`
        );
        return (
          '✅ *Auto View disabled.*\n\n' +
          '👀 Automatic status viewing has been stopped.'
        );
      }
      /*
       * ========================================================
       * INVALID ARGUMENT
       * ========================================================
       */
      return (
        '❌ Invalid command.\n\n' +
        'Use:\n' +
        '`.autoview on` — Enable Auto View\n' +
        '`.autoview off` — Disable Auto View\n' +
        '`.autoview status` — Check Auto View status'
      );
    } catch (error) {
      console.error(
        '[AutoView] Command error:',
        error
      );
      return (
        `❌ Auto View error: ${
          error.message ||
          'Unknown error'
        }`
      );
    }
  }
};
