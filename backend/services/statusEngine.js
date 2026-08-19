'use strict';

/**
 * StatusEngine
 *
 * Responsible only for WhatsApp Status automation.
 *
 * Features:
 * - Auto-view statuses
 * - Auto-react to statuses
 * - Start/stop automation
 * - Prevent duplicate listeners
 *
 * The engine does NOT manage:
 * - WhatsApp pairing
 * - accounts
 * - commands
 * - view-once media
 */

class StatusEngine {
  constructor() {
    this.states = new Map();

    console.log('[StatusEngine] Initialized');
  }

  normalizePhone(phone) {
    return String(phone || '').replace(/\D/g, '');
  }

  getState(phone) {
    const normalized = this.normalizePhone(phone);

    return this.states.get(normalized) || null;
  }

  isRunning(phone) {
    const state = this.getState(phone);

    return Boolean(
      state &&
      state.running === true
    );
  }

  async handleStatus(phone, message) {
    const normalized =
      this.normalizePhone(phone);

    const state =
      this.states.get(normalized);

    if (!state || state.running !== true) {
      return;
    }

    if (!message) {
      return;
    }

    const isStatus =
      message.isStatus === true ||
      message.from === 'status@broadcast';

    if (!isStatus) {
      return;
    }

    console.log(
      `[StatusEngine] Status detected for ${normalized}`
    );

    /*
     * AUTO VIEW
     */
    if (state.autoView) {
      try {
        await state.client.sendSeen(
          'status@broadcast'
        );

        console.log(
          `[StatusEngine] Status viewed for ${normalized}`
        );
      } catch (error) {
        console.error(
          `[StatusEngine] Auto-view failed for ${normalized}:`,
          error.message
        );
      }
    }

    /*
     * AUTO REACTION
     */
    if (state.autoLike) {
      try {
        const emoji =
          state.emoji || '❤️';

        if (
          typeof message.react === 'function'
        ) {
          await message.react(emoji);

          console.log(
            `[StatusEngine] Status reacted for ${normalized}: ${emoji}`
          );
        }
      } catch (error) {
        console.error(
          `[StatusEngine] Auto-reaction failed for ${normalized}:`,
          error.message
        );
      }
    }
  }

  start(phone, client, options = {}) {
    const normalized =
      this.normalizePhone(phone);

    if (!normalized) {
      return {
        success: false,
        message: 'Phone number is required.'
      };
    }

    if (!client) {
      return {
        success: false,
        message: 'WhatsApp client is unavailable.'
      };
    }

    /*
     * Always remove an existing worker first.
     */
    this.stop(normalized);

    const autoView =
      options.autoView === true;

    const autoLike =
      options.autoLike === true;

    const emoji =
      options.emoji || '❤️';

    if (!autoView && !autoLike) {
      return {
        success: false,
        message: 'No status automation is enabled.'
      };
    }

    const messageHandler =
      async (message) => {
        await this.handleStatus(
          normalized,
          message
        );
      };

    client.on(
      'message',
      messageHandler
    );

    this.states.set(
      normalized,
      {
        running: true,
        autoView,
        autoLike,
        emoji,
        client,
        messageHandler,
        startedAt: Date.now()
      }
    );

    console.log(
      `[StatusEngine] Worker started for ${normalized}`
    );

    return {
      success: true,
      running: true,
      autoView,
      autoLike,
      emoji
    };
  }

  stop(phone) {
    const normalized =
      this.normalizePhone(phone);

    const state =
      this.states.get(normalized);

    if (state) {
      try {
        if (
          state.client &&
          state.messageHandler
        ) {
          state.client.removeListener(
            'message',
            state.messageHandler
          );
        }
      } catch (error) {
        console.error(
          `[StatusEngine] Listener removal failed for ${normalized}:`,
          error.message
        );
      }
    }

    this.states.delete(normalized);

    console.log(
      `[StatusEngine] Worker stopped for ${normalized}`
    );

    return true;
  }

  status(phone) {
    const normalized =
      this.normalizePhone(phone);

    const state =
      this.states.get(normalized);

    return {
      running:
        state?.running === true,

      autoView:
        state?.autoView === true,

      autoLike:
        state?.autoLike === true,

      emoji:
        state?.emoji || '❤️'
    };
  }

  stopAll() {
    for (const phone of this.states.keys()) {
      this.stop(phone);
    }
  }
}

module.exports =
  new StatusEngine();
