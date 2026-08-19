const messageStore = new Map();

const MAX_MESSAGES = 5000;
const MESSAGE_TTL = 24 * 60 * 60 * 1000;

async function storeMessage(message) {
  try {
    if (!message || !message.id) return;

    let media = null;

    if (message.hasMedia) {
      try {
        media = await message.downloadMedia();
      } catch (error) {
        console.warn(
          '[AntiDelete] Media could not be downloaded:',
          error.message
        );
      }
    }

    const key = message.id._serialized;

    messageStore.set(key, {
      id: key,
      body: message.body || '',
      from: message.from || '',
      author: message.author || message.from || '',
      to: message.to || '',
      timestamp: Date.now(),
      hasMedia: Boolean(message.hasMedia),
      media
    });

    cleanup();

    console.log(`[AntiDelete] Stored message ${key}`);
  } catch (error) {
    console.error('[AntiDelete] Store error:', error.message);
  }
}

async function handleRevoke(client, revokedMessage, originalMessage, config = {}) {
  try {
    if (!revokedMessage) {
      console.warn('[AntiDelete] No revoked message received');
      return false;
    }

    const key = revokedMessage.id?._serialized;

    if (!key) {
      console.warn('[AntiDelete] Revoked message has no ID');
      return false;
    }

    const stored = messageStore.get(key);

    if (!stored) {
      console.warn(`[AntiDelete] Message ${key} was not stored`);
      return false;
    }

    const owner =
      config.ownerJid ||
      config.ownerNumber ||
      client.info?.wid?._serialized;

    if (!owner) {
      console.error('[AntiDelete] Owner JID could not be determined');
      return false;
    }

    const sender =
      stored.author ||
      stored.from ||
      'Unknown';

    const senderNumber = sender.split('@')[0];

    const caption =
      `🛡️ *WA-AutoBot Anti-Delete*\n\n` +
      `🗑️ *Deleted message detected*\n` +
      `👤 *Sender:* @${senderNumber}\n` +
      `💬 *Message:* ${stored.body || '[No text]'}`;

    if (stored.media) {
      await client.sendMessage(owner, stored.media, {
        caption,
        mentions: [sender]
      });
    } else {
      await client.sendMessage(owner, caption, {
        mentions: [sender]
      });
    }

    console.log(
      `[AntiDelete] Recovered deleted message from ${sender}`
    );

    messageStore.delete(key);

    return true;
  } catch (error) {
    console.error(
      '[AntiDelete] Revoke handling failed:',
      error.message
    );

    return false;
  }
}

function cleanup() {
  const now = Date.now();

  for (const [key, message] of messageStore.entries()) {
    if (now - message.timestamp > MESSAGE_TTL) {
      messageStore.delete(key);
    }
  }

  while (messageStore.size > MAX_MESSAGES) {
    const oldest = messageStore.keys().next().value;

    if (oldest) {
      messageStore.delete(oldest);
    } else {
      break;
    }
  }
}

function getStoredMessage(id) {
  return messageStore.get(id);
}

function clearStore() {
  messageStore.clear();
}

module.exports = {
  storeMessage,
  handleRevoke,
  getStoredMessage,
  clearStore
};
