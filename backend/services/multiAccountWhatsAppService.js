/*
 * ------------------------------------------------
 * AUTOMATIC STATUS VIEW + REACTION
 * ------------------------------------------------
 */

async markStatusAsSeen(client, message, phone) {
  const methods = [
    async () => {
      if (typeof client.sendSeen !== 'function') {
        throw new Error('client.sendSeen() unavailable');
      }

      return await client.sendSeen(
        'status@broadcast'
      );
    },

    async () => {
      const chat =
        await message.getChat();

      if (
        !chat ||
        typeof chat.sendSeen !== 'function'
      ) {
        throw new Error(
          'status chat sendSeen() unavailable'
        );
      }

      return await chat.sendSeen();
    }
  ];

  let lastError = null;

  for (let i = 0; i < methods.length; i++) {
    try {
      const result =
        await methods[i]();

      console.log(
        `👁️ Status seen request accepted for ${phone} using method ${i + 1}`
      );

      return {
        success: true,
        result
      };
    } catch (error) {
      lastError = error;

      console.error(
        `⚠️ Status view method ${i + 1} failed for ${phone}:`,
        error.message
      );
    }
  }

  throw (
    lastError ||
    new Error(
      'Unable to mark WhatsApp status as seen.'
    )
  );
}


async handleStatus(
  client,
  message,
  phone
) {
  try {
    if (
      message.from !==
      'status@broadcast'
    ) {
      return;
    }

    console.log(
      `👀 New WhatsApp status detected for customer ${phone}`
    );

    /*
     * Wait briefly for WhatsApp Web
     * to finish processing the status.
     */
    await new Promise(
      (resolve) =>
        setTimeout(resolve, 500)
    );

    /*
     * Try to mark the ACTUAL status
     * broadcast as seen.
     */
    let viewed = false;

    for (
      let attempt = 1;
      attempt <= 3 && !viewed;
      attempt++
    ) {
      try {
        await this.markStatusAsSeen(
          client,
          message,
          phone
        );

        viewed = true;

        console.log(
          `✅ WhatsApp accepted status view for ${phone}`
        );
      } catch (error) {
        console.error(
          `❌ Status view attempt ${attempt} failed for ${phone}:`,
          error.message
        );

        if (attempt < 3) {
          await new Promise(
            (resolve) =>
              setTimeout(
                resolve,
                1200
              )
          );
        }
      }
    }

    if (!viewed) {
      console.error(
        `❌ Could not get WhatsApp to accept the status view for ${phone}`
      );

      return;
    }

    /*
     * Give WhatsApp time to process
     * the view before reacting.
     */
    await new Promise(
      (resolve) =>
        setTimeout(resolve, 700)
    );

    /*
     * React with ❤️.
     */
    try {
      if (
        typeof message.react !==
        'function'
      ) {
        console.error(
          `❌ message.react() is unavailable for ${phone}`
        );

        return;
      }

      await message.react('❤️');

      console.log(
        `❤️ WhatsApp accepted status reaction for ${phone}`
      );
    } catch (error) {
      console.error(
        `❌ Status reaction failed for ${phone}:`,
        error.message
      );
    }

  } catch (error) {
    console.error(
      `[Customer Status Handler Error] ${phone}:`,
      error
    );
  }
}


/*
 * Listen for new WhatsApp statuses.
 */
client.on(
  'message_create',
  async (message) => {
    try {
      if (
        message.from !==
        'status@broadcast'
      ) {
        return;
      }

      const access =
        this.getAccountAccess(
          normalized
        );

      if (
        !access.allowed
      ) {
        console.log(
          `⛔ Ignoring status for inactive account ${normalized}`
        );

        return;
      }

      await this.handleStatus(
        client,
        message,
        normalized
      );

    } catch (error) {
      console.error(
        `[Status Monitor Error] ${normalized}:`,
        error.message
      );
    }
  }
);
