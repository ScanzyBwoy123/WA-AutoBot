'use strict';

/**
 * MediaEngine
 *
 * Responsible for media-related WhatsApp automation.
 *
 * Current feature:
 * - View-once media detection
 * - View-once media downloading
 * - Forward recovered media to the owner
 */

class MediaEngine {
  constructor() {
    this.clients = new Map();

    console.log('[MediaEngine] Initialized');
  }

  normalizePhone(phone) {
    return String(phone || '').replace(/\D/g, '');
  }

  registerClient(phone, client) {
    const normalized =
      this.normalizePhone(phone);

    if (!normalized || !client) {
      return false;
    }

    this.clients.set(
      normalized,
      client
    );

    return true;
  }

  unregisterClient(phone) {
    const normalized =
      this.normalizePhone(phone);

    this.clients.delete(
      normalized
    );
  }

  getClient(phone) {
    return this.clients.get(
      this.normalizePhone(phone)
    );
  }

  isViewOnce(message) {
    try {
      if (!message) {
        return false;
      }

      if (
        message._data &&
        (
          message._data.isViewOnce === true ||
          message._data.isViewOnceV2 === true
        )
      ) {
        return true;
      }

      const raw =
        message.rawData ||
        message._data ||
        {};

      const json =
        JSON.stringify(raw);

      return (
        json.includes('viewOnceMessage') ||
        json.includes('viewOnceMessageV2') ||
        json.includes('viewOnceMessageV2Extension')
      );
    } catch (_) {
      return false;
    }
  }

  async handleViewOnce(
    phone,
    message,
    ownerJid
  ) {
    const normalized =
      this.normalizePhone(phone);

    if (!message) {
      return {
        success: false,
        message: 'Message unavailable.'
      };
    }

    if (!this.isViewOnce(message)) {
      return {
        success: false,
        message: 'Message is not view-once media.'
      };
    }

    if (message.hasMedia !== true) {
      return {
        success: false,
        message: 'View-once message has no media.'
      };
    }

    const client =
      this.getClient(normalized);

    if (!client) {
      return {
        success: false,
        message: 'WhatsApp client unavailable.'
      };
    }

    if (!ownerJid) {
      return {
        success: false,
        message: 'Owner WhatsApp account unavailable.'
      };
    }

    try {
      console.log(
        `[MediaEngine] View-once media detected for ${normalized}`
      );

      const media =
        await message.downloadMedia();

      if (!media) {
        return {
          success: false,
          message: 'Unable to download view-once media.'
        };
      }

      const sender =
        message.author ||
        message.from ||
        '';

      const senderNumber =
        String(sender)
          .split('@')[0];

      const caption =
        `📸 *VIEW-ONCE RECOVERED*\n\n` +
        `👤 *Sender:* @${senderNumber}`;

      await client.sendMessage(
        ownerJid,
        media,
        {
          caption,
          mentions:
            sender
              ? [sender]
              : []
        }
      );

      console.log(
        `[MediaEngine] View-once media forwarded for ${normalized}`
      );

      return {
        success: true,
        forwarded: true
      };
    } catch (error) {
      console.error(
        `[MediaEngine] View-once handling failed for ${normalized}:`,
        error.message
      );

      return {
        success: false,
        message:
          error.message ||
          'View-once handling failed.'
      };
    }
  }
}

module.exports =
  new MediaEngine();
