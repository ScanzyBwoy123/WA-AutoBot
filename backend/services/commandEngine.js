'use strict';

/**
 * CommandService
 *
 * Central command layer.
 *
 * Commands eventually handled here:
 * .autoview
 * .autolike
 * .reaction
 * .react
 * .vv
 */

class CommandService {
  constructor() {
    console.log('[CommandService] Initialized');
  }

  normalizePhone(phone) {
    return String(phone || '').replace(/\D/g, '');
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

    const {
      phone,
      client
    } = context;

    const normalized =
      this.normalizePhone(phone);

    console.log(
      `[CommandService] ${parsed.command} from ${normalized || 'UNKNOWN'}`
    );

    /*
     * The actual command implementations
     * will be connected after the three
     * architecture files are created.
     */

    return {
      success: false,
      command: parsed.command,
      message:
        'Command engine initialized. Command handler not connected yet.'
    };
  }
}

module.exports =
  new CommandService();
