async function handleViewOnce(client, message, config = {}) {
  try {
    if (!message) return false;

    if (!message.hasMedia) {
      return false;
    }

    const data = message._data || {};

    const isViewOnce =
      data.isViewOnce === true ||
      data.isViewOnceV2 === true ||
      data.viewOnce === true;

    if (!isViewOnce) {
      return false;
    }

    console.log(
      `[ViewOnce] View-once media detected from ${message.from}`
    );

    const media = await message.downloadMedia();

    if (!media) {
      console.warn('[ViewOnce] Media download returned nothing');
      return false;
    }

    const owner =
      config.ownerJid ||
      config.ownerNumber ||
      client.info?.wid?._serialized;

    if (!owner) {
      console.error('[ViewOnce] Owner JID unavailable');
      return false;
    }

    const sender =
      message.author ||
      message.from ||
      'Unknown';

    const senderNumber = sender.split('@')[0];

    const caption =
      `📸 *WA-AutoBot View-Once Recovery*\n\n` +
      `👤 *Sender:* @${senderNumber}\n` +
      `📁 *Type:* ${media.mimetype || 'Unknown'}\n\n` +
      `⚠️ View-once media was recovered.`;

    await client.sendMessage(owner, media, {
      caption,
      mentions: [sender]
    });

    console.log(
      `[ViewOnce] Successfully recovered media from ${sender}`
    );

    return true;
  } catch (error) {
    console.error(
      '[ViewOnce] Recovery failed:',
      error.message
    );

    return false;
  }
}

module.exports = {
  handleViewOnce
};
