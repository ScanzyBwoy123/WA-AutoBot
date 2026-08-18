// backend/services/statusService.js

const statusState = new Map();
const runningWorkers = new Map();

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function getState(phone) {
  const normalized = normalizePhone(phone);

  if (!statusState.has(normalized)) {
    statusState.set(normalized, {
      autoView: false,
      autoLike: false,
      emoji: '❤️',
      processed: new Set(),
      lastRun: 0
    });
  }

  return statusState.get(normalized);
}

function setAutoView(phone, enabled) {
  const state = getState(phone);
  state.autoView = Boolean(enabled);

  console.log(
    `[StatusService] Auto View ${state.autoView ? 'ENABLED' : 'DISABLED'} for ${normalizePhone(phone)}`
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
    `[StatusService] Auto Like ${state.autoLike ? 'ENABLED' : 'DISABLED'} for ${normalizePhone(phone)}`
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

  return {
    autoView: state.autoView,
    autoLike: state.autoLike,
    emoji: state.emoji,
    processedStatuses: state.processed.size,
    running: runningWorkers.has(normalizePhone(phone))
  };
}

/*
|--------------------------------------------------------------------------
| STATUS MESSAGE DETECTION
|--------------------------------------------------------------------------
*/

function isStatusMessage(message) {
  if (!message) {
    return false;
  }

  if (
    message.from === 'status@broadcast' ||
    message.to === 'status@broadcast'
  ) {
    return true;
  }

  if (message.isStatus === true) {
    return true;
  }

  if (
    message.id &&
    String(message.id.remote || '').includes('status@broadcast')
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
  try {
    if (!message) {
      return null;
    }

    if (
      message.id &&
      message.id._serialized
    ) {
      return message.id._serialized;
    }

    if (
      message.id &&
      message.id.id
    ) {
      return String(message.id.id);
    }

    return [
      message.from || '',
      message.author || '',
      message.timestamp || '',
      message.body || ''
    ].join(':');
  } catch (_) {
    return null;
  }
}

/*
|--------------------------------------------------------------------------
| AUTO VIEW
|--------------------------------------------------------------------------
*/

async function processAutoView(client, statusMessage) {
  try {
    if (!client || !statusMessage) {
      return false;
    }

    if (!isStatusMessage(statusMessage)) {
      return false;
    }

    /*
     * The old implementation called:
     *
     * client.getBroadcasts()
     *
     * That is intentionally NOT used here.
     */

    try {
      if (
        typeof statusMessage.getChat === 'function'
      ) {
        const chat =
          await statusMessage.getChat();

        if (
          chat &&
          typeof chat.sendSeen === 'function'
        ) {
          await chat.sendSeen();

          console.log(
            `[Auto View] Status viewed successfully`
          );

          return true;
        }
      }
    } catch (error) {
      console.log(
        `[Auto View] getChat/sendSeen failed: ${error.message}`
      );
    }

    /*
     * Fallback: use client.sendSeen when available.
     */

    try {
      if (
        typeof client.sendSeen === 'function' &&
        statusMessage.from
      ) {
        await client.sendSeen(
          statusMessage.from
        );

        console.log(
          `[Auto View] Status viewed using client.sendSeen()`
        );

        return true;
      }
    } catch (error) {
      console.log(
        `[Auto View] client.sendSeen failed: ${error.message}`
      );
    }

    return false;
  } catch (error) {
    console.error(
      '[Auto View Error]:',
      error.message
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
  statusMessage,
  customEmoji = '❤️'
) {
  try {
    if (!client || !statusMessage) {
      return false;
    }

    if (!isStatusMessage(statusMessage)) {
      return false;
    }

    if (
      typeof statusMessage.react !== 'function'
    ) {
      console.error(
        '[Auto Like] Message.react() is unavailable.'
      );

      return false;
    }

    const emoji =
      String(customEmoji || '❤️');

    await statusMessage.react(
      emoji
    );

    console.log(
      `[Auto Like] Reacted ${emoji} to Status`
    );

    return true;
  } catch (error) {
    console.error(
      '[Auto Like Error]:',
      error.message
    );

    return false;
  }
}

/*
|--------------------------------------------------------------------------
| PROCESS ONE STATUS
|--------------------------------------------------------------------------
*/

async function processStatus(
  client,
  phone,
  message
) {
  try {
    const normalized =
      normalizePhone(phone);

    const state =
      getState(normalized);

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
     * Prevent duplicate processing.
     */

    if (
      state.processed.has(statusId)
    ) {
      return {
        success: true,
        alreadyProcessed: true
      };
    }

    let viewed = false;
    let liked = false;

    /*
     * Auto View
     */

    if (state.autoView) {
      viewed =
        await processAutoView(
          client,
          message
        );
    }

    /*
     * Auto Like
     *
     * Only attempt reaction when enabled.
     */

    if (state.autoLike) {
      liked =
        await processAutoLike(
          client,
          message,
          state.emoji
        );
    }

    /*
     * Mark processed only after attempting
     * the enabled automation.
     */

    if (
      viewed ||
      liked ||
      (!state.autoView &&
        !state.autoLike)
    ) {
      state.processed.add(
        statusId
      );
    }

    /*
     * Keep memory under control.
     */

    if (
      state.processed.size > 5000
    ) {
      const first =
        state.processed.values()
          .next().value;

      if (first) {
        state.processed.delete(
          first
        );
      }
    }

    return {
      success: viewed || liked,
      viewed,
      liked,
      statusId
    };
  } catch (error) {
    console.error(
      `[StatusService] Failed processing Status for ${phone}:`,
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
| MESSAGE EVENT HANDLER
|--------------------------------------------------------------------------
*/

async function handleMessage(
  client,
  phone,
  message
) {
  try {
    const normalized =
      normalizePhone(phone);

    const state =
      getState(normalized);

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

    console.log(
      `[StatusService] Status detected for ${normalized}`
    );

    return await processStatus(
      client,
      normalized,
      message
    );
  } catch (error) {
    console.error(
      '[StatusService] Message handler error:',
      error.message
    );

    return null;
  }
}

/*
|--------------------------------------------------------------------------
| WORKER
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| This worker does NOT use getBroadcasts().
|
| It simply remains attached to the WhatsApp
| client and processes Status messages received
| through the event pipeline.
|--------------------------------------------------------------------------
*/

function startStatusWorker(
  client,
  phone
) {
  const normalized =
    normalizePhone(phone);

  stopStatusWorker(normalized);

  if (!client) {
    return false;
  }

  const state =
    getState(normalized);

  /*
   * Listen for messages created/received
   * by this WhatsApp Web client.
   */

  const handler =
    async (message) => {
      try {
        await handleMessage(
          client,
          normalized,
          message
        );
      } catch (error) {
        console.error(
          `[StatusService] Worker error for ${normalized}:`,
          error.message
        );
      }
    };

  client.on(
    'message_create',
    handler
  );

  runningWorkers.set(
    normalized,
    {
      client,
      handler,
      startedAt: Date.now()
    }
  );

  state.lastRun =
    Date.now();

  console.log(
    `[StatusService] Status worker started for ${normalized}`
  );

  return true;
}

/*
|--------------------------------------------------------------------------
| STOP WORKER
|--------------------------------------------------------------------------
*/

function stopStatusWorker(phone) {
  const normalized =
    normalizePhone(phone);

  const worker =
    runningWorkers.get(
      normalized
    );

  if (!worker) {
    return false;
  }

  try {
    if (
      worker.client &&
      typeof worker.client.removeListener ===
        'function'
    ) {
      worker.client.removeListener(
        'message_create',
        worker.handler
      );
    }
  } catch (error) {
    console.error(
      `[StatusService] Failed stopping worker for ${normalized}:`,
      error.message
    );
  }

  runningWorkers.delete(
    normalized
  );

  console.log(
    `[StatusService] Status worker stopped for ${normalized}`
  );

  return true;
}

/*
|--------------------------------------------------------------------------
| CLEAR PROCESSED STATUS CACHE
|--------------------------------------------------------------------------
*/

function clearProcessed(phone) {
  const state =
    getState(phone);

  state.processed.clear();

  return true;
}

/*
|--------------------------------------------------------------------------
| RESET ACCOUNT
|--------------------------------------------------------------------------
*/

function reset(phone) {
  const normalized =
    normalizePhone(phone);

  stopStatusWorker(
    normalized
  );

  statusState.delete(
    normalized
  );

  return true;
}

/*
|--------------------------------------------------------------------------
| EXPORTS
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
  handleMessage,

  startStatusWorker,
  stopStatusWorker,

  clearProcessed,
  reset
};
