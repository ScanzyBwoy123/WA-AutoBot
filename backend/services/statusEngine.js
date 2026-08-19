'use strict';

/**
 * ============================================================
 * STATUS ENGINE
 * ============================================================
 *
 * Responsible for WhatsApp Status automation:
 *
 *   • Auto-view Status
 *   • Auto-like / react to Status
 *   • Manual Status processing
 *   • Manual Status reaction
 *
 * The WhatsApp client is supplied by
 * MultiAccountWhatsAppService.
 */

class StatusEngine {
  constructor() {
    this.workers = new Map();
  }

  /*
   * ==========================================================
   * BASIC HELPERS
   * ==========================================================
   */

  normalizePhone(phone) {
    return String(phone || '')
      .replace(/\D/g, '');
  }

  getWorker(phone) {
    return this.workers.get(
      this.normalizePhone(phone)
    );
  }

  isRunning(phone) {
    const worker =
      this.getWorker(phone);

    return Boolean(
      worker &&
      worker.running === true
    );
  }

  isStatusMessage(message) {
    if (!message) {
      return false;
    }

    return (
      message.isStatus === true ||
      message.from === 'status@broadcast' ||
      message.to === 'status@broadcast' ||
      message.chatId === 'status@broadcast'
    );
  }

  /*
   * ==========================================================
   * START
   * ==========================================================
   */

  start(
    phone,
    client,
    options = {}
  ) {
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
     * Stop an existing worker first.
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
        options.emoji ||
        '❤️',

      messageHandler: null,

      lastStatusId: null,

      processedStatuses:
        new Set()
    };

    /*
     * --------------------------------------------------------
     * MESSAGE HANDLER
     * --------------------------------------------------------
     */

    const messageHandler =
      async message => {
        try {
          if (!worker.running) {
            return;
          }

          if (!message) {
            return;
          }

          if (
            !this.isStatusMessage(
              message
            )
          ) {
            return;
          }

          console.log(
            `[StatusEngine] Status detected for ${normalized}`
          );

          await this.processStatus(
            normalized,
            message
          );
        } catch (error) {
          console.error(
            `[StatusEngine] Worker error for ${normalized}:`,
            error.message
          );
        }
      };

    worker.messageHandler =
      messageHandler;

    /*
     * Attach listener.
     */
    client.on(
      'message',
      messageHandler
    );

    /*
     * Store worker.
     */
    this.workers.set(
      normalized,
      worker
    );

    console.log(
      `[StatusEngine] Worker started for ${normalized}`
    );

    console.log(
      `[StatusEngine] Auto View: ${
        worker.autoView
          ? 'ON'
          : 'OFF'
      }`
    );

    console.log(
      `[StatusEngine] Auto Like: ${
        worker.autoLike
          ? 'ON'
          : 'OFF'
      }`
    );

    console.log(
      `[StatusEngine] Reaction: ${worker.emoji}`
    );

    return true;
  }

  /*
   * ==========================================================
   * PROCESS STATUS
   * ==========================================================
   */

  async processStatus(
    phone,
    message
  ) {
    const normalized =
      this.normalizePhone(phone);

    const worker =
      this.getWorker(normalized);

    if (!worker) {
      return false;
    }

    if (!worker.running) {
      return false;
    }

    /*
     * Try to identify the Status message.
     */
    const statusId =
      message?.id?._serialized ||
      message?.id?.id ||
      message?.id ||
      null;

    /*
     * Prevent processing the exact same Status repeatedly.
     */
    if (
      statusId &&
      worker.processedStatuses.has(
        statusId
      )
    ) {
      return false;
    }

    if (statusId) {
      worker.processedStatuses.add(
        statusId
      );

      /*
       * Keep memory under control.
       */
      if (
        worker.processedStatuses.size >
        1000
      ) {
        const first =
          worker.processedStatuses
            .values()
            .next()
            .value;

        if (first) {
          worker.processedStatuses.delete(
            first
          );
        }
      }
    }

    worker.lastStatusId =
      statusId;

    /*
     * --------------------------------------------------------
     * AUTO VIEW
     * --------------------------------------------------------
     */

    if (worker.autoView) {
      await this.viewStatus(
        normalized,
        message
      );
    }

    /*
     * --------------------------------------------------------
     * AUTO LIKE
     * --------------------------------------------------------
     */

    if (worker.autoLike) {
      await this.reactToStatus(
        normalized,
        message,
        worker.emoji
      );
    }

    return true;
  }

  /*
   * ==========================================================
   * VIEW STATUS
   * ==========================================================
   */

  async viewStatus(
    phone,
    message = null
  ) {
    const normalized =
      this.normalizePhone(phone);

    const worker =
      this.getWorker(normalized);

    if (!worker) {
      return false;
    }

    const client =
      worker.client;

    if (!client) {
      return false;
    }

    try {
      /*
       * First try message-level sendSeen.
       *
       * Some whatsapp-web.js versions expose
       * sendSeen on the message/chat object.
       */

      if (
        message &&
        typeof message.sendSeen ===
          'function'
      ) {
        await message.sendSeen();

        console.log(
          `[StatusEngine] Status viewed using message.sendSeen() for ${normalized}`
        );

        return true;
      }

      /*
       * Try the Status chat directly.
       */

      if (
        typeof client.getChatById ===
          'function'
      ) {
        try {
          const statusChat =
            await client.getChatById(
              'status@broadcast'
            );

          if (
            statusChat &&
            typeof statusChat.sendSeen ===
              'function'
          ) {
            await statusChat.sendSeen();

            console.log(
              `[StatusEngine] Status viewed using status chat for ${normalized}`
            );

            return true;
          }
        } catch (error) {
          console.log(
            `[StatusEngine] Status chat sendSeen unavailable for ${normalized}:`,
            error.message
          );
        }
      }

      /*
       * Final fallback.
       */

      if (
        typeof client.sendSeen ===
          'function'
      ) {
        await client.sendSeen(
          'status@broadcast'
        );

        console.log(
          `[StatusEngine] Status viewed using client.sendSeen() for ${normalized}`
        );

        return true;
      }

      console.log(
        `[StatusEngine] No supported Status-view method for ${normalized}`
      );

      return false;
    } catch (error) {
      console.error(
        `[StatusEngine] View failed for ${normalized}:`,
        error.message
      );

      return false;
    }
  }

  /*
   * ==========================================================
   * REACT TO STATUS
   * ==========================================================
   */

  async reactToStatus(
    phone,
    message,
    emoji = '❤️'
  ) {
    const normalized =
      this.normalizePhone(phone);

    const worker =
      this.getWorker(normalized);

    if (!worker) {
      return false;
    }

    if (!message) {
      return false;
    }

    const reaction =
      String(
        emoji ||
        worker.emoji ||
        '❤️'
      ).trim();

    if (!reaction) {
      return false;
    }

    try {
      /*
       * whatsapp-web.js message.react()
       */
      if (
        typeof message.react ===
          'function'
      ) {
        await message.react(
          reaction
        );

        console.log(
          `[StatusEngine] Status reacted with ${reaction} for ${normalized}`
        );

        return true;
      }

      /*
       * Some versions expose a direct reaction
       * method through the client.
       */
      if (
        typeof worker.client.react ===
          'function'
      ) {
        const statusId =
          message?.id?._serialized ||
          message?.id?.id ||
          message?.id;

        if (statusId) {
          await worker.client.react(
            statusId,
            reaction
          );

          console.log(
            `[StatusEngine] Status reacted through client with ${reaction} for ${normalized}`
          );

          return true;
        }
      }

      console.log(
        `[StatusEngine] No supported Status reaction method for ${normalized}`
      );

      return false;
    } catch (error) {
      console.error(
        `[StatusEngine] Reaction failed for ${normalized}:`,
        error.message
      );

      return false;
    }
  }

  /*
   * ==========================================================
   * MANUAL STATUS PROCESSING
   * ==========================================================
   */

  async processStatuses(
    phone
  ) {
    const normalized =
      this.normalizePhone(phone);

    const worker =
      this.getWorker(normalized);

    if (!worker) {
      return false;
    }

    const client =
      worker.client;

    if (!client) {
      return false;
    }

    try {
      /*
       * Ask WhatsApp Web for Status messages if
       * the installed whatsapp-web.js version
       * exposes the method.
       */

      if (
        typeof client.getChats !==
          'function'
      ) {
        return false;
      }

      const chats =
        await client.getChats();

      const statusChats =
        chats.filter(
          chat =>
            chat &&
            (
              chat.id?._serialized ===
                'status@broadcast' ||
              chat.id?.user ===
                'status'
            )
        );

      if (!statusChats.length) {
        console.log(
          `[StatusEngine] No Status chat found for ${normalized}`
        );

        return false;
      }

      let processed =
        false;

      for (
        const chat of statusChats
      ) {
        try {
          if (
            typeof chat.fetchMessages !==
              'function'
          ) {
            continue;
          }

          const messages =
            await chat.fetchMessages({
              limit: 50
            });

          for (
            const message of messages
          ) {
            if (
              !this.isStatusMessage(
                message
              )
            ) {
              continue;
            }

            await this.processStatus(
              normalized,
              message
            );

            processed = true;
          }
        } catch (error) {
          console.error(
            `[StatusEngine] Failed processing Status chat for ${normalized}:`,
            error.message
          );
        }
      }

      return processed;
    } catch (error) {
      console.error(
        `[StatusEngine] Status processing failed for ${normalized}:`,
        error.message
      );

      return false;
    }
  }

  /*
   * ==========================================================
   * MANUAL REACTION
   * ==========================================================
   */

  async reactToLatestStatus(
    phone,
    emoji = '❤️'
  ) {
    const normalized =
      this.normalizePhone(phone);

    const worker =
      this.getWorker(normalized);

    if (!worker) {
      return false;
    }

    const client =
      worker.client;

    if (!client) {
      return false;
    }

    try {
      if (
        typeof client.getChats !==
          'function'
      ) {
        return false;
      }

      const chats =
        await client.getChats();

      const statusChat =
        chats.find(
          chat =>
            chat &&
            (
              chat.id?._serialized ===
                'status@broadcast' ||
              chat.id?.user ===
                'status'
            )
        );

      if (!statusChat) {
        console.log(
          `[StatusEngine] Status chat not found for ${normalized}`
        );

        return false;
      }

      if (
        typeof statusChat.fetchMessages !==
          'function'
      ) {
        return false;
      }

      const messages =
        await statusChat.fetchMessages({
          limit: 20
        });

      /*
       * Work backwards so we try the newest
       * available Status first.
       */

      for (
        let i = messages.length - 1;
        i >= 0;
        i--
      ) {
        const message =
          messages[i];

        if (
          !this.isStatusMessage(
            message
          )
        ) {
          continue;
        }

        const success =
          await this.reactToStatus(
            normalized,
            message,
            emoji
          );

        if (success) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error(
        `[StatusEngine] Manual reaction failed for ${normalized}:`,
        error.message
      );

      return false;
    }
  }

  /*
   * ==========================================================
   * ALIASES USED BY COMMAND ROUTER
   * ==========================================================
   */

  async reactStatus(
    phone,
    emoji = '❤️'
  ) {
    return this.reactToLatestStatus(
      phone,
      emoji
    );
  }

  async likeStatus(
    phone,
    emoji = '❤️'
  ) {
    return this.reactToLatestStatus(
      phone,
      emoji
    );
  }

  async reactToCurrentStatus(
    phone,
    emoji = '❤️'
  ) {
    return this.reactToLatestStatus(
      phone,
      emoji
    );
  }

  async checkStatuses(
    phone
  ) {
    return this.processStatuses(
      phone
    );
  }

  async viewStatuses(
    phone
  ) {
    return this.processStatuses(
      phone
    );
  }

  async openStatuses(
    phone
  ) {
    return this.processStatuses(
      phone
    );
  }

  /*
   * ==========================================================
   * STOP
   * ==========================================================
   */

  stop(phone) {
    const normalized =
      this.normalizePhone(phone);

    const worker =
      this.workers.get(
        normalized
      );

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

    worker.processedStatuses?.clear();

    this.workers.delete(
      normalized
    );

    console.log(
      `[StatusEngine] Worker stopped for ${normalized}`
    );

    return true;
  }

  /*
   * ==========================================================
   * RESTART
   * ==========================================================
   */

  restart(
    phone,
    client,
    options = {}
  ) {
    this.stop(phone);

    return this.start(
      phone,
      client,
      options
    );
  }

  /*
   * ==========================================================
   * STATUS
   * ==========================================================
   */

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
        worker.emoji ||
        '❤️'
    };
  }

  /*
   * ==========================================================
   * STOP ALL
   * ==========================================================
   */

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
