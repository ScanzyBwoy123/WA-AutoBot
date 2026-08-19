// backend/services/statusService.js

'use strict';

/*
|--------------------------------------------------------------------------
| WA-AutoBot Status Automation Service
|--------------------------------------------------------------------------
|
| Handles:
|   • Auto View
|   • Auto Like / Auto React
|   • WhatsApp Status detection
|
| IMPORTANT:
|   This service NEVER calls client.getBroadcasts().
|   This avoids the WWebJS.getAllStatuses() problem.
|
|--------------------------------------------------------------------------
*/

const states = new Map();
const workers = new Map();

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function getState(phone) {
  const id = normalizePhone(phone);

  if (!states.has(id)) {
    states.set(id, {
      autoView: false,
      autoLike: false,
      emoji: '❤️',
      processed: new Set(),
      lastStatusAt: 0,
      detected: 0,
      viewed: 0,
      liked: 0,
      errors: 0
    });
  }

  return states.get(id);
}

/*
|--------------------------------------------------------------------------
| SETTINGS
|--------------------------------------------------------------------------
*/

function setAutoView(phone, enabled) {
  const state = getState(phone);

  state.autoView = Boolean(enabled);

  console.log(
    `[StatusService] Auto View ${
      state.autoView ? 'ENABLED' : 'DISABLED'
    } for ${normalizePhone(phone)}`
  );

  return state.autoView;
}

function setAutoLike(phone, enabled, emoji = '❤️') {
  const state = getState(phone);

  state.autoLike = Boolean(enabled);

  if (emoji) {
    state.emoji = String(emoji);
  }

  console.log(
    `[StatusService] Auto Like ${
      state.autoLike ? 'ENABLED' : 'DISABLED'
    } for ${normalizePhone(phone)}`
  );

  return state.autoLike;
}

function setEmoji(phone, emoji) {
  const state = getState(phone);

  if (emoji) {
    state.emoji = String(emoji);
  }

  return state.emoji;
}

function getStatus(phone) {
  const state = getState(phone);
  const id = normalizePhone(phone);

  return {
    phone: id,
    autoView: state.autoView,
    autoLike: state.autoLike,
    emoji: state.emoji,
    running: workers.has(id),
    detected: state.detected,
    viewed: state.viewed,
    liked: state.liked,
    errors: state.errors,
    processedStatuses: state.processed.size,
    lastStatusAt: state.lastStatusAt
      ? new Date(state.lastStatusAt).toISOString()
      : null
  };
}

/*
|--------------------------------------------------------------------------
| STATUS DETECTION
|--------------------------------------------------------------------------
*/

function isStatusMessage(message) {
  if (!message) {
    return false;
  }

  const from = String(message.from || '');
  const to = String(message.to || '');
  const author = String(message.author || '');

  /*
   * Normal WhatsApp Status identifier.
   */
  if (
    from === 'status@broadcast' ||
    to === 'status@broadcast' ||
    author === 'status@broadcast'
  ) {
    return true;
  }

  /*
   * Some versions expose isStatus.
   */
  if (message.isStatus === true) {
    return true;
  }

  /*
   * Check message ID.
   */
  const serialized =
    String(message.id?._serialized || '');

  const remote =
    String(message.id?.remote || '');

  if (
    serialized.includes('status@broadcast') ||
    remote.includes('status@broadcast')
  ) {
    return true;
  }

  return false;
}

/*
|--------------------------------------------------------------------------
| STATUS ID
|--------------------------------------------------------------------------
*/

function getStatusId(message) {
  if (!message) {
    return null;
  }

  if (message.id?._serialized) {
    return String(message.id._serialized);
  }

  if (message.id?.id) {
    return String(message.id.id);
  }

  return [
    message.from || '',
    message.author || '',
    message.timestamp || '',
    message.body || '',
    message.type || ''
  ].join('|');
}

/*
|--------------------------------------------------------------------------
| MARK PROCESSED
|--------------------------------------------------------------------------
*/

function markProcessed(state, id) {
  if (!id) {
    return;
  }

  state.processed.add(id);

  /*
   * Keep memory under control.
   */
  if (state.processed.size > 5000) {
    const first =
      state.processed.values().next().value;

    if (first) {
      state.processed.delete(first);
    }
  }
}

/*
|--------------------------------------------------------------------------
| AUTO VIEW
|--------------------------------------------------------------------------
*/

async function processAutoView(client, message) {
  if (!client || !message) {
    return false;
  }

  try {
    /*
     * Preferred method.
     */
    if (
      typeof message.getChat === 'function'
    ) {
      try {
        const chat =
          await message.getChat();

        if (
          chat &&
          typeof chat.sendSeen === 'function'
        ) {
          await chat.sendSeen();

          console.log(
            `[Auto View] SUCCESS: status viewed`
          );

          return true;
        }
      } catch (error) {
        console.log(
          `[Auto View] getChat/sendSeen failed: ${error.message}`
        );
      }
    }

    /*
     * Fallback.
     */
    if (
      typeof client.sendSeen === 'function'
    ) {
      const target =
        message.from ||
        message.author;

      if (target) {
        await client.sendSeen(target);

        console.log(
          `[Auto View] SUCCESS using client.sendSeen()`
        );

        return true;
      }
    }

    console.error(
      '[Auto View] No supported viewing method available.'
    );

    return false;
  } catch (error) {
    console.error(
      `[Auto View] FAILED: ${error.message}`
    );

    return false;
  }
}

/*
|--------------------------------------------------------------------------
| AUTO LIKE
|--------------------------------------------------------------------------
*/

async function processAutoLike(
  client,
  message,
  emoji = '❤️'
) {
  if (!client || !message) {
    return false;
  }

  try {
    if (
      typeof message.react !== 'function'
    ) {
      console.error(
        '[Auto Like] Message.react() is unavailable.'
      );

      return false;
    }

    const reaction =
      String(emoji || '❤️');

    await message.react(reaction);

    console.log(
      `[Auto Like] SUCCESS: reacted ${reaction}`
    );

    return true;
  } catch (error) {
    console.error(
      `[Auto Like] FAILED: ${error.message}`
    );

    return false;
  }
}

/*
|--------------------------------------------------------------------------
| PROCESS STATUS
|--------------------------------------------------------------------------
*/

async function processStatus(
  client,
  phone,
  message
) {
  const id =
    normalizePhone(phone);

  const state =
    getState(id);

  try {
    if (!isStatusMessage(message)) {
      return {
        success: false,
        reason: 'NOT_STATUS'
      };
    }

    const statusId =
      getStatusId(message);

    if (!statusId) {
      return {
        success: false,
        reason: 'NO_STATUS_ID'
      };
    }

    /*
     * Prevent duplicate reactions/views.
     */
    if (
      state.processed.has(statusId)
    ) {
      return {
        success: true,
        duplicate: true,
        statusId
      };
    }

    state.detected++;
    state.lastStatusAt = Date.now();

    console.log(
      `[StatusService] STATUS DETECTED for ${id}`
    );

    let viewed = false;
    let liked = false;

    /*
     * AUTO VIEW
     */
    if (state.autoView) {
      viewed =
        await processAutoView(
          client,
          message
        );

      if (viewed) {
        state.viewed++;
      }
    }

    /*
     * AUTO LIKE
     */
    if (state.autoLike) {
      liked =
        await processAutoLike(
          client,
          message,
          state.emoji
        );

      if (liked) {
        state.liked++;
      }
    }

    /*
     * Only mark it processed after
     * an enabled operation succeeds,
     * or if nothing was enabled.
     */
    if (
      viewed ||
      liked ||
      (!state.autoView &&
        !state.autoLike)
    ) {
      markProcessed(
        state,
        statusId
      );
    }

    console.log(
      `[StatusService] Result for ${id}: ` +
      `viewed=${viewed}, liked=${liked}`
    );

    return {
      success: viewed || liked,
      viewed,
      liked,
      statusId
    };
  } catch (error) {
    state.errors++;

    console.error(
      `[StatusService] Status processing error for ${id}:`,
      error.message
    );

    return {
      success: false,
      error: error.message
    };
  }
}

/*
|--------------------------------------------------------------------------
| EVENT HANDLER
|--------------------------------------------------------------------------
*/

async function handleMessage(
  client,
  phone,
  message
) {
  const id =
    normalizePhone(phone);

  const state =
    getState(id);

  if (
    !state.autoView &&
    !state.autoLike
  ) {
    return null;
  }

  if (
    !isStatusMessage(message)
  ) {
    return null;
  }

  return processStatus(
    client,
    id,
    message
  );
}

/*
|--------------------------------------------------------------------------
| INSTALL EVENT LISTENERS
|--------------------------------------------------------------------------
*/

function attachEvent(
  client,
  event,
  handler
) {
  if (
    client &&
    typeof client.on === 'function'
  ) {
    client.on(event, handler);

    return true;
  }

  return false;
}

/*
|--------------------------------------------------------------------------
| START STATUS WORKER
|--------------------------------------------------------------------------
*/

function startStatusWorker(
  client,
  phone
) {
  const id =
    normalizePhone(phone);

  if (!client) {
    console.error(
      `[StatusService] Cannot start worker for ${id}: client missing`
    );

    return false;
  }

  /*
   * Prevent duplicate workers.
   */
  stopStatusWorker(id);

  const handlers = [];

  /*
   * --------------------------------------------------
   * message
   * --------------------------------------------------
   */

  const messageHandler =
    async (message) => {
      try {
        await handleMessage(
          client,
          id,
          message
        );
      } catch (error) {
        console.error(
          `[StatusService] message handler error: ${error.message}`
        );
      }
    };

  if (
    attachEvent(
      client,
      'message',
      messageHandler
    )
  ) {
    handlers.push({
      event: 'message',
      handler: messageHandler
    });
  }

  /*
   * --------------------------------------------------
   * message_create
   * --------------------------------------------------
   */

  const messageCreateHandler =
    async (message) => {
      try {
        await handleMessage(
          client,
          id,
          message
        );
      } catch (error) {
        console.error(
          `[StatusService] message_create handler error: ${error.message}`
        );
      }
    };

  if (
    attachEvent(
      client,
      'message_create',
      messageCreateHandler
    )
  ) {
    handlers.push({
      event: 'message_create',
      handler: messageCreateHandler
    });
  }

  /*
   * --------------------------------------------------
   * Store worker
   * --------------------------------------------------
   */

  workers.set(id, {
    client,
    handlers,
    startedAt: Date.now()
  });

  console.log(
    `[StatusService] Status worker started for ${id}`
  );

  console.log(
    `[StatusService] Listening for WhatsApp Status events for ${id}`
  );

  return true;
}

/*
|--------------------------------------------------------------------------
| STOP STATUS WORKER
|--------------------------------------------------------------------------
*/

function stopStatusWorker(phone) {
  const id =
    normalizePhone(phone);

  const worker =
    workers.get(id);

  if (!worker) {
    return false;
  }

  try {
    if (
      worker.client &&
      typeof worker.client.removeListener ===
        'function'
    ) {
      for (
        const item of worker.handlers
      ) {
        worker.client.removeListener(
          item.event,
          item.handler
        );
      }
    }
  } catch (error) {
    console.error(
      `[StatusService] Failed stopping worker for ${id}:`,
      error.message
    );
  }

  workers.delete(id);

  console.log(
    `[StatusService] Status worker stopped for ${id}`
  );

  return true;
}

/*
|--------------------------------------------------------------------------
| CACHE
|--------------------------------------------------------------------------
*/

function clearProcessed(phone) {
  const state =
    getState(phone);

  state.processed.clear();

  console.log(
    `[StatusService] Status cache cleared for ${normalizePhone(phone)}`
  );

  return true;
}

/*
|--------------------------------------------------------------------------
| RESET
|--------------------------------------------------------------------------
*/

function reset(phone) {
  const id =
    normalizePhone(phone);

  stopStatusWorker(id);

  states.delete(id);

  console.log(
    `[StatusService] State reset for ${id}`
  );

  return true;
}

/*
|--------------------------------------------------------------------------
| MANUAL STATUS PROCESSING
|--------------------------------------------------------------------------
*/

async function processStatusMessage(
  client,
  phone,
  message
) {
  return processStatus(
    client,
    phone,
    message
  );
}

/*
|--------------------------------------------------------------------------
| PUBLIC API
|--------------------------------------------------------------------------
*/

module.exports = {
  setAutoView,
  setAutoLike,
  setEmoji,

  getStatus,

  isStatusMessage,
  getStatusId,

  processAutoView,
  processAutoLike,

  processStatus,
  processStatusMessage,

  handleMessage,

  startStatusWorker,
  stopStatusWorker,

  clearProcessed,
  reset
};
