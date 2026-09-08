'use strict';

/**
 * ============================================================
 * STATUS ENGINE
 * ============================================================
 *
 * Handles:
 *   • Auto-view WhatsApp Status
 *   • Auto-like / reaction to WhatsApp Status
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

  sleep(ms) {
    return new Promise(resolve =>
      setTimeout(resolve, ms)
    );
  }

  /*
   * ==========================================================
   * STATUS DETECTION
   * ==========================================================
   */

  isStatusMessage(message) {
    if (!message) {
      return false;
    }

    /*
     * Official whatsapp-web.js property.
     */
    if (message.isStatus === true) {
      return true;
    }

    /*
     * Standard Status JID.
     */
    if (
      message.from === 'status@broadcast' ||
      message.to === 'status@broadcast' ||
      message.chatId === 'status@broadcast'
    ) {
      return true;
    }

    /*
     * Internal WhatsApp data.
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

      if (data.id) {
        if (
          data.id.remote === 'status@broadcast' ||
          data.id._serialized === 'status@broadcast'
        ) {
          return true;
        }
      }
    }

    /*
     * Public message ID.
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
      message?._data?.id?._serialized ||
      message?.id?.id ||
      message?._data?.id?.id ||
      (
        typeof message.id === 'string'
          ? message.id
          : null
      ) ||
      null
    );
  }

  getStatusRawId(message) {
    if (!message) {
      return null;
    }

    return (
      message?.id?.id ||
      message?._data?.id?.id ||
      null
    );
  }

  getStatusParticipant(message) {
    if (!message) {
      return null;
    }

    const participant =
      message?.author ||
      message?._data?.author ||
      message?._data?.id?.participant ||
      message?.id?.participant ||
      null;

    if (
      typeof participant === 'object'
    ) {
      return (
        participant?._serialized ||
        participant?.user
          ? `${participant.user}@c.us`
          : null
      );
    }

    return participant;
  }

  /*
   * ==========================================================
   * START WORKER
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
     * Remove an existing worker first.
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
        String(
          options.emoji ||
          '❤️'
        ).trim() || '❤️',

      messageHandler: null,

      /*
       * Prevent duplicate processing.
       */
      processedStatuses: new Set(),

      lastStatusId: null,

      startedAt: Date.now()
    };

    /*
     * --------------------------------------------------------
     * STATUS EVENT HANDLER
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

          const statusId =
            this.getStatusId(
              message
            );

          console.log(
            `[StatusEngine] Status detected for ${normalized}` +
            `${statusId ? `: ${statusId}` : ''}`
          );

          await this.processStatus(
            normalized,
            message
          );
        } catch (error) {
          console.error(
            `[StatusEngine] Worker error for ${normalized}:`,
            error?.message ||
            error
          );
        }
      };

    worker.messageHandler =
      messageHandler;

    /*
     * IMPORTANT:
     *
     * Listen to BOTH events.
     *
     * Some WhatsApp Web message flows expose Status
     * messages through message_create.
     */
    client.on(
      'message',
      messageHandler
    );

    client.on(
      'message_create',
      messageHandler
    );

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
   * PROCESS ONE STATUS
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

    if (
      !this.isStatusMessage(
        message
      )
    ) {
      return false;
    }

    const statusId =
      this.getStatusId(message);

    /*
     * Ignore duplicate events.
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

    let processed = false;

    /*
     * --------------------------------------------------------
     * AUTO VIEW
     * --------------------------------------------------------
     */

    if (worker.autoView) {
      try {
        const viewed =
          await this.viewStatus(
            normalized,
            message
          );

        if (viewed) {
          processed = true;
        }
      } catch (error) {
        console.error(
          `[StatusEngine] Auto View failed for ${normalized}:`,
          error?.message ||
          error
        );
      }
    }

    /*
     * --------------------------------------------------------
     * AUTO LIKE
     * --------------------------------------------------------
     */

    if (worker.autoLike) {
      try {
        const reacted =
          await this.reactToStatus(
            normalized,
            message,
            worker.emoji
          );

        if (reacted) {
          processed = true;
        }
      } catch (error) {
        console.error(
          `[StatusEngine] Auto Like failed for ${normalized}:`,
          error?.message ||
          error
        );
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

    if (
      !worker ||
      !worker.client
    ) {
      console.log(
        `[StatusEngine] Cannot view Status: client unavailable for ${normalized}`
      );

      return false;
    }

    const client =
      worker.client;

    const participant =
      this.getStatusParticipant(
        message
      );

    if (!participant) {
      console.log(
        `[StatusEngine] Cannot resolve Status owner for ${normalized}`
      );

      return false;
    }

    const rawStatusId =
      this.getStatusRawId(
        message
      );

    const serializedStatusId =
      this.getStatusId(
        message
      );

    if (
      !rawStatusId &&
      !serializedStatusId
    ) {
      console.log(
        `[StatusEngine] Cannot resolve Status ID for ${normalized}`
      );

      return false;
    }

    try {
      /*
       * ------------------------------------------------------
       * First try the Broadcast model.
       * ------------------------------------------------------
       */

      if (
        typeof client.getBroadcastById ===
        'function'
      ) {
        try {
          const broadcast =
            await client.getBroadcastById(
              participant
            );

          if (broadcast) {
            const statuses =
              Array.isArray(
                broadcast.msgs
              )
                ? broadcast.msgs
                : [];

            console.log(
              `[StatusEngine] Broadcast ${participant}: ` +
              `${statuses.length} status message(s)`
            );

            /*
             * Find the exact Status first.
             */
            let target =
              statuses.find(
                status => {
                  const id =
                    status?.id?._serialized ||
                    status?._data?.id?._serialized ||
                    null;

                  const raw =
                    status?.id?.id ||
                    status?._data?.id?.id ||
                    null;

                  return (
                    id ===
                      serializedStatusId ||
                    raw ===
                      rawStatusId
                  );
                }
              );

            /*
             * If exact match isn't available,
             * use an unread Status.
             */
            if (!target) {
              target =
                statuses.find(
                  status =>
                    status?.viewed !== true &&
                    status?._data?.viewed !== true
                );
            }

            /*
             * Last fallback.
             */
            if (!target) {
              target =
                statuses[
                  statuses.length - 1
                ];
            }

            if (target) {
              const success =
                await this.markStatusAsRead(
                  client,
                  participant,
                  target
                );

              if (success) {
                console.log(
                  `✅ [StatusEngine] Status viewed for ${normalized}`
                );

                return true;
              }
            }
          }
        } catch (error) {
          console.log(
            `[StatusEngine] Broadcast view attempt failed for ${normalized}:`,
            error?.message ||
            error
          );
        }
      }

      /*
       * ------------------------------------------------------
       * Direct internal WhatsApp Web fallback.
       * ------------------------------------------------------
       */

      const fallback =
        await this.markStatusAsReadDirect(
          client,
          participant,
          rawStatusId,
          serializedStatusId
        );

      if (fallback) {
        console.log(
          `✅ [StatusEngine] Direct Status view succeeded for ${normalized}`
        );

        return true;
      }

      console.log(
        `⚠️ [StatusEngine] Could not verify Status view for ${normalized}`
      );

      return false;

    } catch (error) {
      console.error(
        `[StatusEngine] Status view error for ${normalized}:`,
        error?.message ||
        error
      );

      return false;
    }
  }

  /*
   * ==========================================================
   * MARK STATUS AS READ
   * ==========================================================
   */

  async markStatusAsRead(
    client,
    participant,
    target
  ) {
    if (
      !client ||
      !target
    ) {
      return false;
    }

    /*
     * If already viewed, consider it successful.
     */
    if (
      target?.viewed === true ||
      target?._data?.viewed === true
    ) {
      return true;
    }

    if (
      !client.pupPage ||
      typeof client.pupPage.evaluate !==
        'function'
    ) {
      return false;
    }

    const rawStatusId =
      target?.id?.id ||
      target?._data?.id?.id ||
      null;

    const serializedStatusId =
      target?.id?._serialized ||
      target?._data?.id?._serialized ||
      null;

    const statusMessageKey =
      serializedStatusId &&
      serializedStatusId.startsWith(
        'false_status@broadcast_'
      )
        ? serializedStatusId
        : rawStatusId
          ? `false_status@broadcast_${rawStatusId}_${participant}`
          : serializedStatusId;

    try {
      const result =
        await client.pupPage.evaluate(
          async ({
            participant,
            statusMessageKey,
            rawStatusId,
            serializedStatusId
          }) => {
            try {
              if (
                !window.require
              ) {
                return {
                  ok: false,
                  reason:
                    'window.require unavailable'
                };
              }

              const collections =
                window.require(
                  'WAWebCollections'
                );

              if (
                !collections ||
                !collections.Status
              ) {
                return {
                  ok: false,
                  reason:
                    'WAWebCollections.Status unavailable'
                };
              }

              let status =
                null;

              try {
                status =
                  collections.Status.get(
                    participant
                  );
              } catch (_) {}

              if (
                !status &&
                typeof collections.Status.find ===
                  'function'
              ) {
                try {
                  status =
                    await collections.Status.find(
                      participant
                    );
                } catch (_) {}
              }

              if (!status) {
                return {
                  ok: false,
                  reason:
                    'Status owner not found'
                };
              }

              if (
                typeof status.sendReadStatus !==
                'function'
              ) {
                return {
                  ok: false,
                  reason:
                    'sendReadStatus unavailable'
                };
              }

              const messages =
                status.msgs;

              if (!messages) {
                return {
                  ok: false,
                  reason:
                    'Status messages unavailable'
                };
              }

              let targetMessage =
                null;

              /*
               * Exact collection lookup.
               */
              if (
                typeof messages.get ===
                'function'
              ) {
                try {
                  targetMessage =
                    messages.get(
                      statusMessageKey
                    );
                } catch (_) {}
              }

              /*
               * Search models.
               */
              if (
                !targetMessage &&
                Array.isArray(
                  messages.models
                )
              ) {
                targetMessage =
                  messages.models.find(
                    msg => {
                      const id =
                        msg?.id;

                      const serialized =
                        id?._serialized ||
                        null;

                      const raw =
                        id?.id ||
                        null;

                      return (
                        serialized ===
                          statusMessageKey ||
                        serialized ===
                          serializedStatusId ||
                        raw ===
                          rawStatusId
                      );
                    }
                  );
              }

              /*
               * Some builds expose an array.
               */
              if (
                !targetMessage &&
                Array.isArray(
                  messages
                )
              ) {
                targetMessage =
                  messages.find(
                    msg => {
                      const id =
                        msg?.id;

                      const serialized =
                        id?._serialized ||
                        null;

                      const raw =
                        id?.id ||
                        null;

                      return (
                        serialized ===
                          statusMessageKey ||
                        serialized ===
                          serializedStatusId ||
                        raw ===
                          rawStatusId
                      );
                    }
                  );
              }

              if (!targetMessage) {
                return {
                  ok: false,
                  reason:
                    'Status message not found'
                };
              }

              const mediaKeyTimestamp =
                targetMessage.mediaKeyTimestamp ||
                targetMessage?._data
                  ?.mediaKeyTimestamp ||
                null;

              await status.sendReadStatus(
                targetMessage,
                mediaKeyTimestamp
              );

              return {
                ok: true,
                viewed:
                  targetMessage.viewed === true ||
                  targetMessage?._data?.viewed ===
                    true
              };

            } catch (error) {
              return {
                ok: false,
                reason:
                  error?.message ||
                  String(error)
              };
            }
          },
          {
            participant,
            statusMessageKey,
            rawStatusId,
            serializedStatusId
          }
        );

      console.log(
        `[StatusEngine] Status read result: ${JSON.stringify(result)}`
      );

      if (
        result?.ok === true
      ) {
        return true;
      }

      return false;

    } catch (error) {
      console.log(
        `[StatusEngine] Direct Status read failed:`,
        error?.message ||
        error
      );

      return false;
    }
  }

  /*
   * ==========================================================
   * DIRECT STATUS READ FALLBACK
   * ==========================================================
   */

  async markStatusAsReadDirect(
    client,
    participant,
    rawStatusId,
    serializedStatusId
  ) {
    if (
      !client ||
      !client.pupPage
    ) {
      return false;
    }

    if (
      !rawStatusId &&
      !serializedStatusId
    ) {
      return false;
    }

    try {
      const fakeTarget = {
        id: {
          id: rawStatusId,
          _serialized:
            serializedStatusId
        },
        _data: {
          id: {
            id: rawStatusId,
            _serialized:
              serializedStatusId
          }
        }
      };

      return await this.markStatusAsRead(
        client,
        participant,
        fakeTarget
      );

    } catch (error) {
      console.log(
        `[StatusEngine] Direct Status fallback failed:`,
        error?.message ||
        error
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
        `[StatusEngine] Worker not found for ${normalized}`
      );

      return false;
    }

    if (!worker.client) {
      console.log(
        `[StatusEngine] Client unavailable for ${normalized}`
      );

      return false;
    }

    if (!message) {
      console.log(
        `[StatusEngine] Status message missing for ${normalized}`
      );

      return false;
    }

    if (
      !this.isStatusMessage(
        message
      )
    ) {
      console.log(
        `[StatusEngine] Message is not a Status for ${normalized}`
      );

      return false;
    }

    const statusId =
      this.getStatusId(message);

    if (!statusId) {
      console.log(
        `[StatusEngine] Status ID missing for ${normalized}`
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
      return false;
    }

    console.log(
      `[StatusEngine] Reacting ${reaction} to ${statusId} for ${normalized}`
    );

    /*
     * --------------------------------------------------------
     * Method 1: Client.sendReaction
     * --------------------------------------------------------
     */

    if (
      typeof worker.client.sendReaction ===
      'function'
    ) {
      try {
        await worker.client.sendReaction(
          statusId,
          reaction
        );

        console.log(
          `✅ [StatusEngine] Reaction request sent with client.sendReaction()`
        );

        return true;

      } catch (error) {
        console.log(
          `[StatusEngine] client.sendReaction() failed:`,
          error?.message ||
          error
        );
      }
    }

    /*
     * --------------------------------------------------------
     * Method 2: Message.react
     * --------------------------------------------------------
     */

    if (
      typeof message.react ===
      'function'
    ) {
      try {
        await message.react(
          reaction
        );

        console.log(
          `✅ [StatusEngine] Reaction request sent with message.react()`
        );

        return true;

      } catch (error) {
        console.log(
          `[StatusEngine] message.react() failed:`,
          error?.message ||
          error
        );
      }
    }

    console.log(
      `❌ [StatusEngine] All reaction methods failed for ${statusId}`
    );

    return false;
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

      if (
        !statusChats.length
      ) {
        console.log(
          `[StatusEngine] No Status chat found for ${normalized}`
        );

        return false;
      }

      let processed = false;

      for (
        const chat of statusChats
      ) {
        if (
          typeof chat.fetchMessages !==
          'function'
        ) {
          continue;
        }

        try {
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

            /*
             * For manual processing, temporarily process
             * the Status regardless of whether another event
             * already saw it.
             */
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
            `[StatusEngine] Status chat processing failed:`,
            error?.message ||
            error
          );
        }
      }

      return processed;

    } catch (error) {
      console.error(
        `[StatusEngine] Status processing failed for ${normalized}:`,
        error?.message ||
        error
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
       * Newest first.
       */
      for (
        let i =
          messages.length - 1;
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
        error?.message ||
        error
      );

      return false;
    }
  }

  /*
   * ==========================================================
   * ALIASES
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
         * Remove BOTH listeners.
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
        `[StatusEngine] Listener cleanup failed for ${normalized}:`,
        error?.message ||
        error
      );
    }

    try {
      worker.processedStatuses?.clear();
    } catch (_) {}

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
        '❤️',

      lastStatusId:
        worker.lastStatusId ||
        null,

      processedCount:
        worker.processedStatuses?.size ||
        0,

      startedAt:
        worker.startedAt ||
        null
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
