'use strict';

/**
 * CommandService
 *
 * Central command layer.
 *
 * Receives WhatsApp messages, preserves the
 * sender phone number, and forwards commands
 * to the main command engine.
 */

const commandEngine =
  require('../commands');

class CommandService {
  constructor() {
    console.log('[CommandService] Initialized');
  }

  normalizePhone(phone) {
    return String(phone || '')
      .replace(/\D/g, '');
  }

  parse(body) {
    const text =
      String(body || '').trim();

    if (!text.startsWith('.')) {
      return null;
    }

    const parts =
      text.split(/\s+/);

    const command =
      parts.shift()
        .toLowerCase();

    return {
      command,
      args: parts,
      raw: text
    };
  }

  isCommand(body, command) {
    const parsed =
      this.parse(body);

    if (!parsed) {
      return false;
    }

    return (
      parsed.command ===
      String(command)
        .toLowerCase()
    );
  }

  async execute(
    body,
    context = {}
  ) {
    const parsed =
      this.parse(body);

    if (!parsed) {
      return null;
    }

    /*
     * IMPORTANT:
     * Always normalize and preserve
     * the WhatsApp sender phone number.
     */
    const phone =
      this.normalizePhone(
        context.phone ||
        context.from ||
        context.sender ||
        context.senderPhone
      );

    console.log(
      `📥 COMMAND from ${phone || 'UNKNOWN'}: ${parsed.raw}`
    );

    /*
     * Build the context that is passed
     * to commands/index.js.
     */
    const commandContext = {
      ...context,
      phone
    };

    /*
     * Make sure we have a phone number
     * before account-specific commands
     * are executed.
     */
    if (!phone) {
      console.error(
        '[CommandService] Missing sender phone number.'
      );

      return {
        success: false,
        command: parsed.command,
        message:
          '❌ Could not identify the WhatsApp account.'
      };
    }

    try {
      /*
       * Send the command to the real
       * command engine.
       */
      const result =
        await commandEngine.execute(
          parsed.raw,
          commandContext
        );

      return {
        success: true,
        command: parsed.command,
        result
      };

    } catch (error) {
      console.error(
        `[CommandService] Error executing ${parsed.command}:`,
        error?.stack ||
        error?.message ||
        error
      );

      return {
        success: false,
        command: parsed.command,
        message:
          error?.message ||
          'Command execution failed.'
      };
    }
  }
}

module.exports =
  new CommandService();
