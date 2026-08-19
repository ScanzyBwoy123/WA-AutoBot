'use strict';
/**
 * Status Engine
 *
 * Responsible only for WhatsApp Status automation:
 * - Auto-view statuses
 * - Auto-like/react to statuses
 *
 * The WhatsApp client is supplied by MultiAccountWhatsAppService.
 */
class StatusEngine {
  constructor() {
    this.workers = new Map();
  }
  normalizePhone(phone) {
    return String(phone || '').replace(/\D/g, '');
  }
  getWorker(phone) {
    return this.workers.get(
      this.normalizePhone(phone)
    );
  }
  isRunning(phone) {
    const worker = this.getWorker(phone);
    return Boolean(
      worker &&
      worker.running === true
    );
  }
  start(phone, client, options = {}) {
    const normalized =
      this.normalizePhone(phone);
    if (!normalized) {
      throw new Error(
        'WhatsApp account number is required.'
      );
    }
    if (!client) {
      throw new Error(
        'WhatsApp client is not available.'
      );
    }
    /*
     * Never create duplicate workers.
     */
    this.stop(normalized);
    const worker = {
      phone: normalized,
      client,
      running: true,
      autoView:
        options.autoView === true,
      autoLike:
        options.autoLike === true,
      emoji:
        options.emoji || '❤️',
      messageHandler: null
    };
    const messageHandler = async (message) => {
      try {
        if (!worker.running) {
          return;
        }
        if (!message) {
          return;
        }
        const isStatus =
          message.isStatus === true ||
          message.from === 'status@broadcast' ||
          message.to === 'status@broadcast';
        if (!isStatus) {
          return;
        }
        console.log(
          `[StatusEngine] Status detected for ${normalized}`
        );
        /*
         * VIEW
         */
        if (worker.autoView) {
          try {
            if (
              typeof client.sendSeen === 'function'
            ) {
              await client.sendSeen(
                'status@broadcast'
              );
              console.log(
                `[StatusEngine] Status viewed for ${normalized}`
              );
            }
          } catch (error) {
            console.error(
              `[StatusEngine] View failed for ${normalized}:`,
              error.message
            );
          }
        }
        /*
         * LIKE / REACT
         */
        if (worker.autoLike) {
          try {
            if (
              typeof message.react === 'function'
            ) {
              await message.react(
                worker.emoji
              );
              console.log(
                `[StatusEngine] Status reacted with ${worker.emoji} for ${normalized}`
              );
            }
          } catch (error) {
            console.error(
              `[StatusEngine] Reaction failed for ${normalized}:`,
              error.message
            );
          }
        }
      } catch (error) {
        console.error(
          `[StatusEngine] Worker error for ${normalized}:`,
          error.message
        );
      }
    };
    worker.messageHandler =
      messageHandler;
    client.on(
      'message',
      messageHandler
    );
    this.workers.set(
      normalized,
      worker
    );
    console.log(
      `[StatusEngine] Worker started for ${normalized}`
    );
    return true;
  }
  stop(phone) {
    const normalized =
      this.normalizePhone(phone);
    const worker =
      this.workers.get(normalized);
    if (!worker) {
      return true;
    }
    worker.running = false;
    try {
      if (
        worker.client &&
        worker.messageHandler
      ) {
        worker.client.removeListener(
          'message',
          worker.messageHandler
        );
      }
    } catch (error) {
      console.error(
        `[StatusEngine] Listener removal failed for ${normalized}:`,
        error.message
      );
    }
    this.workers.delete(
      normalized
    );
    console.log(
      `[StatusEngine] Worker stopped for ${normalized}`
    );
    return true;
  }
  restart(phone, client, options = {}) {
    this.stop(phone);
    return this.start(
      phone,
      client,
      options
    );
  }
  getStatus(phone) {
    const worker =
      this.getWorker(phone);
    if (!worker) {
      return {
        running: false,
        autoView: false,
        autoLike: false,
        emoji: '❤️'
      };
    }
    return {
      running:
        worker.running === true,
      autoView:
        worker.autoView === true,
      autoLike:
        worker.autoLike === true,
      emoji:
        worker.emoji || '❤️'
    };
  }
  stopAll() {
    for (
      const phone of this.workers.keys()
    ) {
      this.stop(phone);
    }
  }
}
module.exports =
  new StatusEngine();
