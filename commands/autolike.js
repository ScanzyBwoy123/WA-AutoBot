'use strict';

module.exports = {
  name: 'autolike',
  category: 'Automation',
  description: 'Toggle automatic reactions to WhatsApp Statuses',

  async execute(context, args) {
    const phone = String(
      context?.phone || ''
    ).replace(/\D/g, '');

    const service =
      context?.service;

    const accountService =
      context?.multiAccountService ||
      context?.accountService;

    const action = String(
      args?.[0] || 'status'
    ).toLowerCase();

    if (!phone) {
      return '❌ Could not identify the WhatsApp account.';
    }

    if (!accountService) {
      return '❌ Account service is unavailable.';
    }

    /*
     * STATUS
     */
    if (
      action === 'status' ||
      action === ''
    ) {
      const account =
        typeof accountService.getAccount === 'function'
          ? accountService.getAccount(phone)
          : null;

      const worker =
        typeof service?.getStatusAutomation === 'function'
          ? service.getStatusAutomation(phone)
          : null;

      return (
        '❤️ *AUTO LIKE STATUS*\n\n' +
        `Account setting: ${
          account?.autoLike === true
            ? 'ON ✅'
            : 'OFF 🛑'
        }\n` +
        `Status worker: ${
          worker?.running === true
            ? 'RUNNING ✅'
            : 'STOPPED 🛑'
        }\n` +
        `Auto Like engine: ${
          worker?.autoLike === true
            ? 'ACTIVE ✅'
            : 'INACTIVE 🛑'
        }\n` +
        `Reaction: ${
          account?.reaction ||
          account?.autoLikeReaction ||
          worker?.emoji ||
          '❤️'
        }`
      );
    }

    /*
     * ENABLE
     */
    if (
      action === 'on' ||
      action === 'enable' ||
      action === 'enabled' ||
      action === 'start'
    ) {
      if (
        typeof accountService.setAutoLike !== 'function'
      ) {
        return '❌ Auto Like account setting is unavailable.';
      }

      const saved =
        accountService.setAutoLike(
          phone,
          true
        );

      if (!saved) {
        return (
          '❌ Could not enable Auto Like.\n' +
          'Make sure the account is active.'
        );
      }

      /*
       * Restart StatusEngine with the new configuration.
       */
      if (
        typeof service?.startStatusMonitor === 'function'
      ) {
        const started =
          service.startStatusMonitor(phone);

        if (!started) {
          return (
            '⚠️ Auto Like was saved, but the Status worker could not start.\n' +
            'Make sure WhatsApp is connected and READY.'
          );
        }
      }

      console.log(
        `[AutoLike] ENABLED for ${phone}`
      );

      return (
        '✅ *Auto Like enabled!*\n\n' +
        '❤️ New WhatsApp statuses will be reacted to automatically.'
      );
    }

    /*
     * DISABLE
     */
    if (
      action === 'off' ||
      action === 'disable' ||
      action === 'disabled' ||
      action === 'stop'
    ) {
      if (
        typeof accountService.setAutoLike !== 'function'
      ) {
        return '❌ Auto Like account setting is unavailable.';
      }

      const saved =
        accountService.setAutoLike(
          phone,
          false
        );

      if (!saved) {
        return '❌ Could not disable Auto Like.';
      }

      /*
       * Reconfigure worker. If Auto View is still enabled,
       * the StatusEngine remains alive for Auto View.
       */
      if (
        typeof service?.startStatusMonitor === 'function'
      ) {
        service.startStatusMonitor(phone);
      }

      console.log(
        `[AutoLike] DISABLED for ${phone}`
      );

      return (
        '✅ *Auto Like disabled.*\n\n' +
        'Automatic Status reactions have been stopped.'
      );
    }

    return (
      '❌ Invalid command.\n\n' +
      'Use:\n' +
      '`.autolike on`\n' +
      '`.autolike off`\n' +
      '`.autolike status`'
    );
  }
};
