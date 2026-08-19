'use strict';

const states = new Map();
const workers = new Map();

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
      detected: 0,
      viewed: 0,
      liked: 0,
      errors: 0,
      lastStatusAt: 0
    });
  }

  return states.get(id);
}

/*
 * ============================================================
 * SETTINGS
 * ============================================================
 */

function setAutoView(phone, enabled) {
  const state = getState(phone);

  state.autoView = Boolean(enabled);

  return state.autoView;
}

function setAutoLike(phone, enabled, emoji = '❤️') {
  const state = getState(phone);

  state.autoLike = Boolean(enabled);

  if (emoji) {
    state.emoji = String(emoji);
  }

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
  const id = normalizePhone(phone);
  const state = getState(id);

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
 * ============================================================
 * STATUS DETECTION
 * ============================================================
 */

function isStatusMessage(message) {
  if (!message) {
    return false;
  }

  if (message.isStatus === true) {
    return true;
  }

  const from = String(message.from || '');
  const to = String(message.to || '');
  const author = String(message.author || '');

  if (
    from === 'status@broadcast' ||
    to === 'status@broadcast' ||
    author === 'status@broadcast'
  ) {
    return true;
  }

  const serialized =
    String(message.id?._serialized || '');

  const remote =
    String(message.id?.remote || '');

  return (
    serialized.includes('status@broadcast') ||
    remote.includes('status@broadcast')
  );
}

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
    message.type || ''
  ].join('|');
}

function markProcessed(state, id) {
  if (!id) {
    return;
  }

  state.processed.add(id);

  if (state.processed.size > 5000) {
    const first =
      state.processed.values().next().value;

    if (first) {
      state.processed.delete(first);
    }
  }
}

/*
 * ============================================================
 * AUTO VIEW
 * ============================================================
 */

async function processAutoView(client, message) {
  try {
    if (!client || !message) {
      return false;
    }

    /*
     * Try the Status chat first.
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
            '[AutoView] Status viewed successfully.'
          );

          return true;
        }
      } catch (error) {
        console.log(
          `[AutoView] chat.sendSeen failed: ${error.message}`
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
          '[AutoView] Status viewed using client.sendSeen().'
        );

        return true;
      }
    }

    return false;
  } catch (error) {
    console.error(
      `[AutoView] View failed: ${error.message}`
    );

    return false;
  }
}

/*
 * ============================================================
 * AUTO LIKE
 * ============================================================
 */

async function processAutoLike(
  client,
  message,
  emoji = '❤️'
) {
  try {
    if (
      !message ||
      typeof message.react !== 'function'
    ) {
      return false;
    }

    await message.react(
      String(emoji || '❤️')
    );

    return true;
  } catch (error) {
    console.error(
      `[AutoLike] Failed: ${error.message}`
    );

    return false;
  }
}

/*
 * ============================================================
 * PROCESS STATUS
 * ============================================================
 */

async function processStatus(
  client,
  phone,
  message
) {
  const id = normalizePhone(phone);
  const state = getState(id);

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

  if (
    state.processed.has(statusId)
  ) {
    return {
      success: true,
      duplicate: true
    };
  }

  state.detected++;
  state.lastStatusAt = Date.now();

  let viewed = false;
  let liked = false;

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

  return {
    success: viewed || liked,
    viewed,
    liked,
    statusId
  };
}

/*
 * ============================================================
 * EVENT HANDLER
 * ============================================================
 */

async function handleMessage(
  client,
  phone,
  message
) {
  const id = normalizePhone(phone);
  const state = getState(id);

  if (
    !state.autoView &&
    !state.autoLike
  ) {
    return null;
  }

  if (!isStatusMessage(message)) {
    return null;
  }

  return processStatus(
    client,
    id,
    message
  );
}

/*
 * ============================================================
 * START WORKER
 * ============================================================
 */

function startStatusWorker(
  client,
  phone
) {
  const id = normalizePhone(phone);

  if (!client) {
    console.error(
      `[StatusService] Client missing for ${id}`
    );

    return false;
  }

  /*
   * Remove any old worker first.
   */
  stopStatusWorker(id);

  const state = getState(id);

  /*
   * Make sure the worker knows Auto View
   * is enabled when it was requested.
   */
  if (!state.autoView) {
    console.log(
      `[StatusService] Auto View is disabled for ${id}`
    );

    return false;
  }

  const handlers = [];

  const handler = async (message) => {
    try {
      await handleMessage(
        client,
        id,
        message
      );
    } catch (error) {
      state.errors++;

      console.error(
        `[StatusService] Handler error for ${id}:`,
        error.message
      );
    }
  };

  if (
    typeof client.on === 'function'
  ) {
    client.on(
      'message',
      handler
    );

    handlers.push({
      event: 'message',
      handler
    });

    client.on(
      'message_create',
      handler
    );

    handlers.push({
      event: 'message_create',
      handler
    });
  }

  workers.set(id, {
    client,
    handlers,
    startedAt: Date.now()
  });

  console.log(
    `[StatusService] Auto-view worker STARTED for ${id}`
  );

  return true;
}

/*
 * ============================================================
 * STOP WORKER
 * ============================================================
 */

function stopStatusWorker(phone) {
  const id = normalizePhone(phone);

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
      for (const item of worker.handlers) {
        worker.client.removeListener(
          item.event,
          item.handler
        );
      }
    }
  } catch (error) {
    console.error(
      `[StatusService] Stop error for ${id}:`,
      error.message
    );
  }

  workers.delete(id);

  console.log(
    `[StatusService] Auto-view worker STOPPED for ${id}`
  );

  return true;
}

/*
 * ============================================================
 * CACHE / RESET
 * ============================================================
 */

function clearProcessed(phone) {
  const state = getState(phone);

  state.processed.clear();

  return true;
}

function reset(phone) {
  const id = normalizePhone(phone);

  stopStatusWorker(id);
  states.delete(id);

  return true;
}

/*
 * ============================================================
 * EXPORT
 * ============================================================
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
  processStatusMessage: processStatus,

  handleMessage,

  startStatusWorker,
  stopStatusWorker,

  clearProcessed,
  reset
};
