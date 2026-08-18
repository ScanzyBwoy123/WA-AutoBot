this.client.on('message', async (message) => {
  try {
    // Ignore WhatsApp Status messages
    if (message.from === 'status@broadcast') {
      return;
    }

    const text = String(message.body || '').trim();

    // Ignore empty/non-command messages
    if (!text || !text.startsWith('.')) {
      return;
    }

    // ==========================================
    // OWNER / ACCESS CONTROL
    // ==========================================

    const ownerNumber = String(
      process.env.OWNER_NUMBER || process.env.WHATSAPP_PHONE || ''
    ).replace(/\D/g, '');

    const normalizeNumber = (value) =>
      String(value || '').replace(/\D/g, '');

    const senderNumber = normalizeNumber(message.from);
    const authorNumber = normalizeNumber(message.author);

    /*
     * WhatsApp can represent the owner's own chat using
     * an @lid address, so also check the connected account.
     */
    let connectedNumber = '';

    try {
      connectedNumber = normalizeNumber(
        this.client?.info?.wid?.user
      );
    } catch (_) {
      connectedNumber = '';
    }

    const isOwner =
      ownerNumber &&
      (
        senderNumber === ownerNumber ||
        authorNumber === ownerNumber ||
        connectedNumber === ownerNumber
      );

    /*
     * IMPORTANT:
     * Do NOT block owner messages just because message.fromMe === true.
     */
    if (message.fromMe && !isOwner) {
      return;
    }

    // ==========================================
    // APPROVED USERS
    // ==========================================

    if (!this.approvedUsers) {
      this.approvedUsers = new Set();
    }

    // Always make OWNER_NUMBER an approved user.
    if (ownerNumber) {
      this.approvedUsers.add(ownerNumber);
    }

    const isApproved =
      isOwner ||
      this.approvedUsers.has(senderNumber) ||
      this.approvedUsers.has(authorNumber);

    // ==========================================
    // PRIVATE BOT
    // ==========================================

    if (!isApproved) {
      console.log(
        `🚫 Blocked command from ${message.from}: ${text}`
      );

      try {
        await message.reply(
          '🔒 Access denied.\n\n' +
          'This bot is private. Your WhatsApp number has not been approved by the owner.'
        );
      } catch (error) {
        console.error(
          '[Access Denied Reply Error]',
          error.message
        );
      }

      return;
    }

    console.log(
      `📩 ${isOwner ? 'OWNER' : 'APPROVED USER'} command from ${message.from}: ${text}`
    );

    // ==========================================
    // PARSE COMMAND
    // ==========================================

    const parts = text
      .slice(1)
      .trim()
      .split(/\s+/);

    const commandName = (
      parts.shift() || ''
    ).toLowerCase();

    const args = parts;

    // ==========================================
    // OWNER-ONLY COMMANDS
    // ==========================================

    const ownerOnlyCommands = [
      'adduser',
      'removeuser',
      'users',
      'pair'
    ];

    if (
      ownerOnlyCommands.includes(commandName) &&
      !isOwner
    ) {
      await message.reply(
        '👑 This command is available to the bot owner only.'
      );
      return;
    }

    // ==========================================
    // .adduser NUMBER
    // ==========================================

    if (commandName === 'adduser') {
      const number = normalizeNumber(args[0]);

      if (!number) {
        await message.reply(
          '❌ Usage:\n.adduser 233XXXXXXXXX'
        );
        return;
      }

      this.approvedUsers.add(number);

      if (typeof this.saveApprovedUsers === 'function') {
        this.saveApprovedUsers();
      }

      await message.reply(
        `✅ User approved.\n\n📱 ${number}\n\nThey can now use the bot.`
      );

      console.log(
        `✅ User approved by owner: ${number}`
      );

      return;
    }

    // ==========================================
    // .removeuser NUMBER
    // ==========================================

    if (commandName === 'removeuser') {
      const number = normalizeNumber(args[0]);

      if (!number) {
        await message.reply(
          '❌ Usage:\n.removeuser 233XXXXXXXXX'
        );
        return;
      }

      if (number === ownerNumber) {
        await message.reply(
          '❌ You cannot remove the bot owner.'
        );
        return;
      }

      this.approvedUsers.delete(number);

      if (typeof this.saveApprovedUsers === 'function') {
        this.saveApprovedUsers();
      }

      await message.reply(
        `✅ User removed.\n\n📱 ${number}\n\nThey can no longer use the bot.`
      );

      console.log(
        `🚫 User removed by owner: ${number}`
      );

      return;
    }

    // ==========================================
    // .users
    // ==========================================

    if (commandName === 'users') {
      const users = Array.from(
        this.approvedUsers
      );

      const list = users.length
        ? users
            .map((number, index) =>
              `${index + 1}. ${number}`
            )
            .join('\n')
        : 'No approved users.';

      await message.reply(
        `👥 *APPROVED USERS*\n\n${list}`
      );

      return;
    }

    // ==========================================
    // .pair
    // ==========================================

    if (commandName === 'pair') {
      if (this.pairingCode) {
        await message.reply(
          `🔑 *CURRENT PAIRING CODE*\n\n` +
          `${this.pairingCode}\n\n` +
          `Use WhatsApp → Settings → Linked Devices → Link a Device → Link with phone number instead.`
        );
        return;
      }

      if (this.isReady) {
        await message.reply(
          '✅ WhatsApp is already connected.'
        );
        return;
      }

      await message.reply(
        '⏳ No pairing code is currently available.\n\nStart the bot from the dashboard first.'
      );

      return;
    }

    // ==========================================
    // NORMAL COMMANDS
    // ==========================================

    const context = {
      message,
      client: this.client,
      whatsapp: this,

      from: message.from,
      chat: message.from,
      sender: message.author || message.from,

      isOwner,
      isApproved,

      args,

      reply: async (response) => {
        if (
          response === undefined ||
          response === null
        ) {
          return null;
        }

        const replyText = String(response).trim();

        if (!replyText) {
          return null;
        }

        try {
          return await message.reply(
            replyText
          );
        } catch (replyError) {
          console.error(
            '[WhatsApp Reply Error]',
            replyError.message
          );

          try {
            return await this.client.sendMessage(
              message.from,
              replyText
            );
          } catch (sendError) {
            console.error(
              '[WhatsApp Send Error]',
              sendError.message
            );

            throw sendError;
          }
        }
      }
    };

    // ==========================================
    // RUN EXISTING COMMAND SYSTEM
    // ==========================================

    const result = await commands.execute(
      text,
      context
    );

    if (
      result !== undefined &&
      result !== null
    ) {
      const response =
        String(result).trim();

      if (response) {
        await context.reply(response);
      }
    }

    console.log(
      `✅ Command completed: ${text}`
    );

  } catch (error) {
    console.error(
      '[Command Handler Error]',
      error
    );

    try {
      await message.reply(
        '❌ Something went wrong while processing that command.'
      );
    } catch (_) {}
  }
});
