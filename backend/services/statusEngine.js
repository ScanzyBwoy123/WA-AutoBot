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
async viewStatus(phone, message = null) {
  const normalized = this.normalizePhone(phone);
  const worker = this.getWorker(normalized);

  if (!worker || !worker.client) {
    console.log(
      `[StatusEngine] Cannot view Status: worker/client unavailable for ${normalized}`
    );
    return false;
  }

  const client = worker.client;

  const participant =
    message?.author ||
    message?._data?.author ||
    message?._data?.id?.participant ||
    message?.id?.participant ||
    null;

  if (!participant) {
    console.log(
      `[StatusEngine] Cannot resolve Status owner`
    );
    return false;
  }

  try {
    /*
     * First obtain the Broadcast through whatsapp-web.js.
     * This gives us the actual Status messages even when
     * the original message event does not contain an ID.
     */
    const broadcast =
      await client.getBroadcastById(participant);

    if (!broadcast) {
      console.log(
        `[StatusEngine] No Broadcast found for ${participant}`
      );
      return false;
    }

    const statuses =
      Array.isArray(broadcast.msgs)
        ? broadcast.msgs
        : [];

    console.log(
      `[StatusEngine] Broadcast resolved: ${participant} | total=${broadcast.totalCount} | unread=${broadcast.unreadCount} | messages=${statuses.length}`
    );

    if (!statuses.length) {
      console.log(
        `[StatusEngine] No Status messages found for ${participant}`
      );
      return false;
    }

    /*
     * Prefer an unread Status.
     * If none is unread, fall back to the newest Status.
     */
    let target =
      statuses.find(status =>
        status?.viewed !== true &&
        status?._data?.viewed !== true
      ) || statuses[statuses.length - 1];

    const statusId =
      target?.id?._serialized ||
      target?._data?.id?._serialized ||
      target?.id?.id ||
      target?._data?.id?.id ||
      null;

    if (!statusId) {
      console.log(
        `[StatusEngine] Could not resolve the real Status ID`
      );
      return false;
    }

    const beforeViewed =
      target?.viewed === true ||
      target?._data?.viewed === true;

    console.log(
      `[StatusEngine] REAL Status ID: ${statusId}`
    );

    console.log(
      `[StatusEngine] Status viewed BEFORE: ${beforeViewed}`
    );

    /*
     * IMPORTANT:
     * Do NOT use message.sendSeen() here.
     *
     * WhatsApp Statuses use the Status collection's
     * sendReadStatus() operation.
     */
    const result = await client.pupPage.evaluate(
      async ({ participant, statusId }) => {
        try {
          const collections =
            window.require('WAWebCollections');

          let status =
            collections.Status.get(participant);

          if (!status) {
            status =
              await collections.Status.find(participant);
          }

          if (!status) {
            return {
              ok: false,
              reason: 'STATUS_OWNER_NOT_FOUND'
            };
          }

          const messages =
            status.msgs;

          if (!messages) {
            return {
              ok: false,
              reason: 'STATUS_MESSAGES_NOT_FOUND'
            };
          }

          let targetMessage = null;

          /*
           * Try the collection's direct get() first.
           */
          try {
            targetMessage =
              messages.get(statusId);
          } catch (_) {}

          /*
           * If WhatsApp uses a different internal key,
           * search the collection models.
           */
          if (!targetMessage && Array.isArray(messages.models)) {
            targetMessage =
              messages.models.find(msg => {
                const serialized =
                  msg?.id?._serialized ||
                  msg?.id?.id ||
                  null;

                return serialized === statusId;
              });
          }

          /*
           * Some WhatsApp builds expose msgs as an array.
           */
          if (!targetMessage && Array.isArray(messages)) {
            targetMessage =
              messages.find(msg => {
                const serialized =
                  msg?.id?._serialized ||
                  msg?.id?.id ||
                  null;

                return serialized === statusId;
              });
          }

          if (!targetMessage) {
            return {
              ok: false,
              reason: 'STATUS_MESSAGE_NOT_FOUND'
            };
          }

          if (
            typeof status.sendReadStatus !== 'function'
          ) {
            return {
              ok: false,
              reason: 'SEND_READ_STATUS_NOT_AVAILABLE'
            };
          }

          const mediaKeyTimestamp =
            targetMessage.mediaKeyTimestamp ||
            targetMessage._data?.mediaKeyTimestamp ||
            null;

          /*
           * THIS is the actual Status-view operation.
           */
          await status.sendReadStatus(
            targetMessage,
            mediaKeyTimestamp
          );

          return {
            ok: true,
            viewed:
              targetMessage.viewed === true ||
              targetMessage._data?.viewed === true
          };

        } catch (error) {
          return {
            ok: false,
            reason: error?.message || String(error)
          };
        }
      },
      {
        participant,
        statusId
      }
    );

    console.log(
      `[StatusEngine] sendReadStatus result: ${JSON.stringify(result)}`
    );

    /*
     * Give WhatsApp Web time to update the Status model.
     */
    await new Promise(resolve =>
      setTimeout(resolve, 2000)
    );

    /*
     * Reload the Broadcast and verify the result.
     */
    let refreshedBroadcast = null;

    try {
      refreshedBroadcast =
        await client.getBroadcastById(participant);
    } catch (error) {
      console.log(
        `[StatusEngine] Broadcast refresh failed: ${error?.message || error}`
      );
    }

    let refreshedTarget = null;

    if (refreshedBroadcast?.msgs?.length) {
      refreshedTarget =
        refreshedBroadcast.msgs.find(status => {
          const id =
            status?.id?._serialized ||
            status?._data?.id?._serialized ||
            status?.id?.id ||
            status?._data?.id?.id ||
            null;

          return id === statusId;
        });
    }

    const afterViewed =
      refreshedTarget?.viewed === true ||
      refreshedTarget?._data?.viewed === true;

    const unreadAfter =
      refreshedBroadcast?.unreadCount;

    console.log(
      `[StatusEngine] Status viewed AFTER: ${afterViewed}`
    );

    console.log(
      `[StatusEngine] Broadcast unread count AFTER: ${unreadAfter}`
    );

    if (afterViewed) {
      console.log(
        `✅ [StatusEngine] VERIFIED STATUS VIEW: ${statusId}`
      );

      return true;
    }

    console.log(
      `⚠️ [StatusEngine] STATUS VIEW NOT VERIFIED: ${statusId}`
    );

    return false;

  } catch (error) {
    console.error(
      `[StatusEngine] Status view error for ${normalized}:`,
      error?.message || error
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
