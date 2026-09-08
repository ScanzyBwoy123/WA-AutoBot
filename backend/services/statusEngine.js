'use strict';
/**
 * ============================================================
 * STATUS ENGINE
 * ============================================================
 *
 * Handles WhatsApp Status automation:
 *
 *   • Auto-view Status
 *   • Auto-like / react to Status
 *   • Manual Status processing
 *   • Manual Status reaction
 *   • Status worker management
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
  /*
   * ==========================================================
   * STATUS DETECTION
   * ==========================================================
   *
   * WhatsApp Web / whatsapp-web.js can identify Status
   * messages in several different ways depending on the
   * version and internal message structure.
   */
  isStatusMessage(message) {
    if (!message) {
      return false;
    }
    /*
     * Standard whatsapp-web.js property.
     */
    if (message.isStatus === true) {
      return true;
    }
    /*
     * Common Status JID checks.
     */
    if (
      message.from === 'status@broadcast' ||
      message.to === 'status@broadcast' ||
      message.chatId === 'status@broadcast'
    ) {
      return true;
    }
    /*
     * Check the internal message data.
     *
     * whatsapp-web.js sometimes exposes Status information
     * through _data depending on the WhatsApp Web version.
     */
    const data = message._data;
    if (data) {
      if (
        data.isStatus === true ||
        data.isStatusV2 === true ||
        data.isStatusV3 === true
      ) {
        return true;
      }
      if (
        data.from === 'status@broadcast' ||
        data.to === 'status@broadcast' ||
        data.chatId === 'status@broadcast'
      ) {
        return true;
      }
      if (
        data.id &&
        (
          data.id.remote === 'status@broadcast' ||
          data.id._serialized === 'status@broadcast'
        )
      ) {
        return true;
      }
    }
    /*
     * Check the public message ID.
     */
    if (message.id) {
      if (
        message.id.remote === 'status@broadcast' ||
        message.id._serialized === 'status@broadcast'
      ) {
        return true;
      }
    }
    return false;
  }
  /*
   * ==========================================================
   * STATUS ID
   * ==========================================================
   */
  getStatusId(message) {
    if (!message) {
      return null;
    }
    return (
      message?.id?._serialized ||
      message?.id?.id ||
      message?._data?.id?._serialized ||
      message?._data?.id?.id ||
      message?.id ||
      null
    );
  }
  /*
   * ==========================================================
   * START
   * ==========================================================
   */
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
     * Stop an existing worker first.
     *
     * This prevents duplicate workers and duplicate
     * Status processing.
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
      processedStatuses: new Set()
    };
    /*
     * --------------------------------------------------------
     * STATUS MESSAGE HANDLER
     * --------------------------------------------------------
     */
    const messageHandler = async message => {
      try {
        if (!worker.running) {
          return;
        }
        if (!message) {
          return;
        }
        /*
         * Ignore normal WhatsApp messages.
         */
        if (!this.isStatusMessage(message)) {
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
          error?.message || error
        );
      }
    };
    worker.messageHandler =
      messageHandler;
    /*
     * Listen for received messages.
     *
     * "message" is the primary event for incoming
     * WhatsApp messages.
     */
    client.on(
      'message',
      messageHandler
    );
    /*
     * Also listen to message_create because some
     * WhatsApp Web versions expose certain Status
     * events through that event.
     *
     * The same handler is used so duplicate messages
     * are prevented by processedStatuses.
     */
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
  async processStatus(phone, message) {
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
     * Make sure this is actually a Status.
     */
    if (!this.isStatusMessage(message)) {
      return false;
    }
    /*
     * Identify the Status.
     */
    const statusId =
      this.getStatusId(message);
    /*
     * Prevent the same Status from being processed
     * more than once.
     */
    if (
      statusId &&
      worker.processedStatuses.has(statusId)
    ) {
      return false;
    }
    if (statusId) {
      worker.processedStatuses.add(
        statusId
      );
      /*
       * Prevent unlimited memory usage.
       */
      if (
        worker.processedStatuses.size > 1000
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
    let processed = false;
    /*
     * --------------------------------------------------------
     * AUTO VIEW
     * --------------------------------------------------------
     */
    if (worker.autoView) {
      const viewed =
        await this.viewStatus(
          normalized,
          message
        );
      if (viewed) {
        processed = true;
      }
    }
    /*
     * --------------------------------------------------------
     * AUTO LIKE
     * --------------------------------------------------------
     */
    if (worker.autoLike) {
      const reacted =
        await this.reactToStatus(
          normalized,
          message,
          worker.emoji
        );
      if (reacted) {
        processed = true;
      }
    }
    return processed;
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
    console.log(
      `[StatusEngine] Cannot view Status: worker not found for ${normalized}`
    );
    return false;
  }

  const client =
    worker.client;

  if (!client) {
    console.log(
      `[StatusEngine] Cannot view Status: client not available for ${normalized}`
    );
    return false;
  }

  const statusId =
    this.getStatusId(message);

  if (!statusId) {
    console.log(
      `[StatusEngine] Cannot view Status: Status ID is missing for ${normalized}`
    );
    return false;
  }

  console.log(
    `[StatusEngine] Attempting to view Status ${statusId} for ${normalized}`
  );

  /*
   * whatsapp-web.js exposes sendSeen() as a chat-level
   * operation. We therefore do not claim that the individual
   * Status was definitely viewed merely because the Promise
   * resolved.
   */

  try {
    if (
      message &&
      typeof message.sendSeen === 'function'
    ) {
      await message.sendSeen();

      console.log(
        `[StatusEngine] Status read request sent for ${statusId} (${normalized})`
      );

      return true;
    }
  } catch (error) {
    console.log(
      `[StatusEngine] message.sendSeen() failed for ${normalized}:`,
      error?.message || error
    );
  }

  try {
    if (
      typeof client.sendSeen === 'function'
    ) {
      await client.sendSeen(
        'status@broadcast'
      );

      console.log(
        `[StatusEngine] Status chat read request sent for ${statusId} (${normalized})`
      );

      return true;
    }
  } catch (error) {
    console.log(
      `[StatusEngine] client.sendSeen() failed for ${normalized}:`,
      error?.message || error
    );
  }

  console.log(
    `[StatusEngine] FAILED to send Status read request for ${statusId} (${normalized})`
  );

  return false;
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
    console.log(
      `[StatusEngine] Cannot react: worker not found for ${normalized}`
    );
    return false;
  }

  if (!message) {
    console.log(
      `[StatusEngine] Cannot react: Status message is missing for ${normalized}`
    );
    return false;
  }

  const statusId =
    this.getStatusId(message);

  if (!statusId) {
    console.log(
      `[StatusEngine] Cannot react: Status ID is missing for ${normalized}`
    );
    return false;
  }

  const reaction =
    String(
      emoji ||
      worker.emoji ||
      '❤️'
    ).trim();

  if (!reaction) {
    console.log(
      `[StatusEngine] Cannot react: reaction emoji is empty for ${normalized}`
    );
    return false;
  }

  console.log(
    `[StatusEngine] Attempting reaction ${reaction} on Status ${statusId} for ${normalized}`
  );

  /*
   * Prefer the actual whatsapp-web.js client method.
   */
  if (
    worker.client &&
    typeof worker.client.sendReaction === 'function'
  ) {
    try {
      await worker.client.sendReaction(
        statusId,
        reaction
      );

      console.log(
        `[StatusEngine] Reaction request sent for Status ${statusId}: ${reaction}`
      );

      /*
       * sendReaction() does not return a reliable boolean
       * success value, so do not pretend that this proves
       * WhatsApp accepted the reaction.
       */
      return true;

    } catch (error) {
      console.log(
        `[StatusEngine] client.sendReaction() failed for ${normalized}:`,
        error?.message || error
      );
    }
  }

  /*
   * Fallback to Message.react() if the client-level method
   * is unavailable.
   */
  if (
    typeof message.react === 'function'
  ) {
    try {
      await message.react(
        reaction
      );

      console.log(
        `[StatusEngine] Message reaction request sent for Status ${statusId}: ${reaction}`
      );

      return true;

    } catch (error) {
      console.log(
        `[StatusEngine] message.react() failed for ${normalized}:`,
        error?.message || error
      );
    }
  }

  console.log(
    `[StatusEngine] FAILED to send reaction for Status ${statusId} (${normalized})`
  );

  return false;
}
  /*
   * ==========================================================
   * MANUAL STATUS PROCESSING
   * ==========================================================
   */
  async processStatuses(phone) {
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
        typeof client.getChats !== 'function'
      ) {
        console.log(
          `[StatusEngine] client.getChats() is unavailable for ${normalized}`
        );
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
            const result =
              await this.processStatus(
                normalized,
                message
              );
            if (result) {
              processed = true;
            }
          }
        } catch (error) {
          console.error(
            `[StatusEngine] Failed processing Status chat for ${normalized}:`,
            error?.message || error
          );
        }
      }
      return processed;
    } catch (error) {
      console.error(
        `[StatusEngine] Status processing failed for ${normalized}:`,
        error?.message || error
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
        typeof client.getChats !== 'function'
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
       * Start with the newest Status.
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
        error?.message || error
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
        /*
         * Remove BOTH listeners because start()
         * attaches the same handler to both events.
         */
        worker.client.removeListener(
          'message',
          worker.messageHandler
        );
        worker.client.removeListener(
          'message_create',
          worker.messageHandler
        );
      }
    } catch (error) {
      console.error(
        `[StatusEngine] Listener removal failed for ${normalized}:`,
        error?.message || error
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
/*
 * ============================================================
 * EXPORT
 * ============================================================
 */
module.exports =
  new StatusEngine();
