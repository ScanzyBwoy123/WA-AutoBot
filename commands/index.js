'use strict';

const fs = require('fs');
const path = require('path');

const commands = new Map();
const COMMANDS_DIR = __dirname;

/*
|--------------------------------------------------------------------------
| NORMALIZE
|--------------------------------------------------------------------------
*/

function normalizeCommandName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/^\./, '');
}

/*
|--------------------------------------------------------------------------
| LOAD COMMAND FILES
|--------------------------------------------------------------------------
*/

function loadCommands() {
  let files = [];

  try {
    files = fs.readdirSync(COMMANDS_DIR);
  } catch (error) {
    console.error(
      '[Commands] Failed to read commands directory:',
      error.message
    );
    return;
  }

  for (const file of files) {
    if (
      file === 'index.js' ||
      !file.endsWith('.js')
    ) {
      continue;
    }

    const fullPath = path.join(
      COMMANDS_DIR,
      file
    );

    try {
      delete require.cache[
        require.resolve(fullPath)
      ];

      const commandModule =
        require(fullPath);

      if (!commandModule) {
        continue;
      }

      let name =
        commandModule.name ||
        commandModule.command ||
        path.basename(file, '.js');

      name = normalizeCommandName(name);

      if (!name) {
        continue;
      }

      if (commands.has(name)) {
        console.log(
          `ℹ️ Command already registered: .${name} — keeping existing command.`
        );
        continue;
      }

      commands.set(
        name,
        commandModule
      );

      console.log(
        `✅ Command loaded: .${name}`
      );

    } catch (error) {
      console.error(
        `❌ Failed loading command ${file}:`,
        error.message
      );
    }
  }

  console.log(
    `📦 Total commands loaded: ${commands.size}`
  );
}

/*
|--------------------------------------------------------------------------
| COMMAND LIST
|--------------------------------------------------------------------------
*/

function getCommandNames() {
  return Array.from(
    commands.keys()
  ).sort();
}

function getCommandList() {
  return getCommandNames();
}

function getCommands() {
  return Array.from(
    commands.entries()
  );
}

function getCommand(name) {
  return commands.get(
    normalizeCommandName(name)
  );
}

/*
|--------------------------------------------------------------------------
| SERVICE METHOD HELPER
|--------------------------------------------------------------------------
*/

async function callService(
  context,
  methods,
  args = []
) {
  const objects = [
    context?.service,
    context?.statusEngine,
    context?.multiAccountService,
    context?.accountService
  ].filter(Boolean);

  for (const object of objects) {
    for (const method of methods) {
      if (
        typeof object[method] === 'function'
      ) {
        return await object[method](...args);
      }
    }
  }

  return undefined;
}

/*
|--------------------------------------------------------------------------
| MENU
|--------------------------------------------------------------------------
*/

async function menuCommand() {
  const names =
    getCommandNames().filter(
      name => name !== 'menu'
    );

  if (!names.length) {
    return (
      '🤖 *WA-AutoBot*\n\n' +
      '❌ No commands are loaded.'
    );
  }

  let output =
    '🤖 *WA-AutoBot COMMANDS*\n\n';

  for (const name of names) {
    const command =
      commands.get(name);

    const description =
      command?.description ||
      command?.desc ||
      '';

    output +=
      `• *.${name}*` +
      (
        description
          ? ` — ${description}`
          : ''
      ) +
      '\n';
  }

  output +=
    '\n━━━━━━━━━━━━━━━━━━\n' +
    '💡 Commands must start with "."';

  return output;
}

/*
|--------------------------------------------------------------------------
| HELP
|--------------------------------------------------------------------------
*/

async function helpCommand() {
  return menuCommand();
}

/*
|--------------------------------------------------------------------------
| PING
|--------------------------------------------------------------------------
*/

async function pingCommand() {
  return '🏓 Pong! WA-AutoBot is online.';
}

/*
|--------------------------------------------------------------------------
| STATUS
|--------------------------------------------------------------------------
*/

async function statusCommand(context) {
  try {
    const phone =
      context?.phone || '';

    const result =
      await callService(
        context,
        [
          'getStatus',
          'getAccountStatus'
        ],
        [phone]
      ) || {};

    return (
      '📊 *ACCOUNT STATUS*\n\n' +
      `Phone: ${phone}\n` +
      `Connection: ${
        result.status ||
        (
          result.connected
            ? 'Connected'
            : 'Disconnected'
        )
      }\n` +
      `Pairing: ${
        result.pairingCode ||
        'None'
      }\n` +
      `Auto View: ${
        result.autoView !== undefined
          ? (
              result.autoView
                ? 'ON'
                : 'OFF'
            )
          : (
              result.statusMonitor
                ? 'ON'
                : 'OFF'
            )
      }\n` +
      `Auto Like: ${
        result.autoLike !== undefined
          ? (
              result.autoLike
                ? 'ON'
                : 'OFF'
            )
          : 'Unknown'
      }\n` +
      `Reaction: ${
        result.reaction ||
        result.autoLikeReaction ||
        result.reactionEmoji ||
        '❤️'
      }`
    );

  } catch (error) {
    return (
      `❌ Status error: ${
        error?.message ||
        'Unknown error'
      }`
    );
  }
}

/*
|--------------------------------------------------------------------------
| AUTO VIEW
|--------------------------------------------------------------------------
*/

async function autoViewCommand(
  context,
  args = []
) {
  const phone =
    String(
      context?.phone || ''
    ).replace(/\D/g, '');

  const service =
    context?.service;

  const accountService =
    context?.multiAccountService ||
    context?.accountService;

  const action =
    String(
      args?.[0] || 'status'
    ).toLowerCase();

  if (!phone) {
    return (
      '❌ Auto View error: ' +
      'Account phone number is missing.'
    );
  }

  if (!accountService) {
    return (
      '❌ Auto View error: ' +
      'Multi-account service is unavailable.'
    );
  }

  const normalizedAction =
    [
      'start',
      'enable',
      'enabled'
    ].includes(action)
      ? 'on'
      : [
          'stop',
          'disable',
          'disabled'
        ].includes(action)
        ? 'off'
        : action;

  /*
   * --------------------------------------------------------
   * STATUS
   * --------------------------------------------------------
   */

  if (
    normalizedAction === 'status' ||
    normalizedAction === ''
  ) {
    try {
      const account =
        typeof accountService.getAccount ===
        'function'
          ? accountService.getAccount(
              phone
            )
          : null;

      const worker =
        typeof service?.getStatusAutomation ===
        'function'
          ? service.getStatusAutomation(
              phone
            )
          : typeof service?.getStatus ===
              'function'
            ? service.getStatus(phone)
            : null;

      const accountEnabled =
        account?.autoView === true ||
        account?.autoViewStatus === true ||
        account?.statusView === true;

      return (
        '👁️ *AUTO VIEW STATUS*\n\n' +
        `Account setting: ${
          accountEnabled
            ? 'ON ✅'
            : 'OFF 🛑'
        }\n` +
        `Status worker: ${
          worker?.running === true
            ? 'RUNNING ✅'
            : 'STOPPED 🛑'
        }\n` +
        `Auto View engine: ${
          worker?.autoView === true
            ? 'ACTIVE ✅'
            : 'INACTIVE 🛑'
        }`
      );

    } catch (error) {
      return (
        `❌ Auto View status error: ${
          error?.message ||
          'Unknown error'
        }`
      );
    }
  }

  /*
   * --------------------------------------------------------
   * VALIDATE ACTION
   * --------------------------------------------------------
   */

  if (
    ![
      'on',
      'off'
    ].includes(
      normalizedAction
    )
  ) {
    return (
      '👁️ *AUTO VIEW*\n\n' +
      'Use:\n' +
      '• *.autoview on*\n' +
      '• *.autoview off*\n' +
      '• *.autoview start*\n' +
      '• *.autoview stop*\n' +
      '• *.autoview status*'
    );
  }

  const enabled =
    normalizedAction === 'on';

  /*
   * --------------------------------------------------------
   * SAVE + START
   * --------------------------------------------------------
   */

  try {
    const account =
      typeof accountService.getAccount ===
      'function'
        ? accountService.getAccount(
            phone
          )
        : null;

    if (!account) {
      return (
        '❌ Auto View error: ' +
        'Account not found.'
      );
    }

    let saved = false;

    if (
      typeof accountService.setAutoViewStatus ===
      'function'
    ) {
      saved =
        await accountService.setAutoViewStatus(
          phone,
          enabled
        );
    } else {
      account.autoViewStatus =
        enabled;

      account.updatedAt =
        new Date().toISOString();

      if (
        typeof accountService.saveAccounts ===
        'function'
      ) {
        await accountService.saveAccounts();
      }

      saved = true;
    }

    if (!saved) {
      return (
        '❌ Auto View setting could not be changed.'
      );
    }

    const refreshedAccount =
      typeof accountService.getAccount ===
      'function'
        ? accountService.getAccount(
            phone
          )
        : account;

    if (
      typeof service?.startStatusMonitor ===
      'function'
    ) {
      const started =
        await service.startStatusMonitor(
          phone
        );

      if (
        enabled &&
        started === false
      ) {
        return (
          '⚠️ Auto View setting was saved, ' +
          'but the Status monitor could not be started.\n\n' +
          'Make sure the WhatsApp account is connected.'
        );
      }
    }

    if (!enabled) {
      const autoLike =
        refreshedAccount?.autoLike === true;

      const autoView =
        refreshedAccount?.autoViewStatus === true ||
        refreshedAccount?.autoView === true ||
        refreshedAccount?.statusView === true;

      if (
        !autoView &&
        !autoLike &&
        typeof service?.stopStatusMonitor ===
        'function'
      ) {
        await service.stopStatusMonitor(
          phone
        );
      }
    }

    return enabled
      ? (
          '✅ *Auto View enabled!*\n\n' +
          '👀 New WhatsApp statuses will be viewed automatically.'
        )
      : (
          '🛑 *Auto View disabled.*\n\n' +
          'Automatic Status viewing has been stopped.'
        );

  } catch (error) {
    console.error(
      '[AutoView] Error:',
      error
    );

    return (
      `❌ Auto View error: ${
        error?.message ||
        'Unknown error'
      }`
    );
  }
}
/*
|--------------------------------------------------------------------------
| AUTO LIKE
|--------------------------------------------------------------------------
*/

async function autoLikeCommand(
  context,
  args = []
) {
  const phone =
    String(
      context?.phone || ''
    ).replace(/\D/g, '');

  const service =
    context?.service;

  const accountService =
    context?.multiAccountService ||
    context?.accountService;

  if (!phone) {
    return (
      '❌ Could not identify the WhatsApp account.'
    );
  }

  if (!accountService) {
    return (
      '❌ Account service is unavailable.'
    );
  }

  const action =
    String(
      args?.[0] || 'status'
    ).toLowerCase();

  /*
   * --------------------------------------------------------
   * STATUS
   * --------------------------------------------------------
   */

  if (
    action === 'status' ||
    action === ''
  ) {
    try {
      const account =
        typeof accountService.getAccount ===
        'function'
          ? accountService.getAccount(
              phone
            )
          : null;

      const worker =
        typeof service?.getStatusAutomation ===
        'function'
          ? service.getStatusAutomation(
              phone
            )
          : typeof service?.getStatus ===
              'function'
            ? service.getStatus(phone)
            : null;

      return (
        '❤️ *AUTO LIKE STATUS*\n\n' +
        `Account setting: ${
          account?.autoLike === true
            ? 'ON ✅'
            : 'OFF 🛑'
        }\n` +
        `Status worker: ${
          worker?.running === true
            ? 'RUNNING ✅'
            : 'STOPPED 🛑'
        }\n` +
        `Auto Like engine: ${
          worker?.autoLike === true
            ? 'ACTIVE ✅'
            : 'INACTIVE 🛑'
        }\n` +
        `Reaction: ${
          account?.reaction ||
          account?.autoLikeReaction ||
          account?.reactionEmoji ||
          worker?.emoji ||
          '❤️'
        }`
      );

    } catch (error) {
      return (
        `❌ Auto Like status error: ${
          error?.message ||
          'Unknown error'
        }`
      );
    }
  }

  /*
   * --------------------------------------------------------
   * ENABLE
   * --------------------------------------------------------
   */

  if (
    action === 'on' ||
    action === 'enable' ||
    action === 'enabled' ||
    action === 'start'
  ) {
    if (
      typeof accountService.setAutoLike !==
      'function'
    ) {
      return (
        '❌ Auto Like account setting is unavailable.'
      );
    }

    try {
      const saved =
        await accountService.setAutoLike(
          phone,
          true
        );

      if (!saved) {
        return (
          '❌ Could not enable Auto Like.\n' +
          'Make sure the account is active.'
        );
      }

      /*
       * Start/restart the Status worker so
       * the new Auto Like setting is applied.
       */

      if (
        typeof service?.startStatusMonitor ===
        'function'
      ) {
        const started =
          await service.startStatusMonitor(
            phone
          );

        if (started === false) {
          return (
            '⚠️ Auto Like was saved, ' +
            'but the Status worker could not start.\n\n' +
            'Make sure WhatsApp is connected and READY.'
          );
        }
      }

      console.log(
        `[AutoLike] ENABLED for ${phone}`
      );

      return (
        '✅ *Auto Like enabled!*\n\n' +
        '❤️ New WhatsApp statuses will be reacted to automatically.'
      );

    } catch (error) {
      console.error(
        '[AutoLike] Enable error:',
        error
      );

      return (
        `❌ Could not enable Auto Like: ${
          error?.message ||
          'Unknown error'
        }`
      );
    }
  }

  /*
   * --------------------------------------------------------
   * DISABLE
   * --------------------------------------------------------
   */

  if (
    action === 'off' ||
    action === 'disable' ||
    action === 'disabled' ||
    action === 'stop'
  ) {
    if (
      typeof accountService.setAutoLike !==
      'function'
    ) {
      return (
        '❌ Auto Like account setting is unavailable.'
      );
    }

    try {
      const saved =
        await accountService.setAutoLike(
          phone,
          false
        );

      if (!saved) {
        return (
          '❌ Could not disable Auto Like.'
        );
      }

      /*
       * Restart the monitor so it reloads
       * the latest account configuration.
       */

      if (
        typeof service?.startStatusMonitor ===
        'function'
      ) {
        await service.startStatusMonitor(
          phone
        );
      }

      console.log(
        `[AutoLike] DISABLED for ${phone}`
      );

      return (
        '✅ *Auto Like disabled.*\n\n' +
        'Automatic Status reactions have been stopped.'
      );

    } catch (error) {
      console.error(
        '[AutoLike] Disable error:',
        error
      );

      return (
        `❌ Could not disable Auto Like: ${
          error?.message ||
          'Unknown error'
        }`
      );
    }
  }

  /*
   * --------------------------------------------------------
   * INVALID ACTION
   * --------------------------------------------------------
   */

  return (
    '❌ Invalid command.\n\n' +
    'Use:\n' +
    '`.autolike on`\n' +
    '`.autolike off`\n' +
    '`.autolike status`'
  );
}

/*
|--------------------------------------------------------------------------
| REACTION COMMAND
|--------------------------------------------------------------------------
*/

async function reactionCommand(
  context,
  args = []
) {
  const phone =
    String(
      context?.phone || ''
    ).replace(/\D/g, '');

  const service =
    context?.service;

  const accountService =
    context?.multiAccountService ||
    context?.accountService;

  const emoji =
    String(
      args?.[0] || ''
    ).trim();

  if (!phone) {
    return (
      '❌ Could not identify the WhatsApp account.'
    );
  }

  if (!accountService) {
    return (
      '❌ Account service is unavailable.'
    );
  }

  /*
   * No emoji = show current reaction.
   */

  if (!emoji) {
    let account = null;

    if (
      typeof accountService.getAccount ===
      'function'
    ) {
      account =
        accountService.getAccount(phone);
    }

    const current =
      account?.reaction ||
      account?.autoLikeReaction ||
      account?.reactionEmoji ||
      '❤️';

    return (
      '❤️ *STATUS REACTION*\n\n' +
      `Current reaction: ${current}\n\n` +
      'To change it, use:\n' +
      '`.reaction ❤️`\n' +
      '`.reaction 👍`\n' +
      '`.reaction 😂`\n' +
      '`.reaction 🔥`'
    );
  }

  try {
    let saved = false;

    /*
     * Try the known reaction setter methods.
     */

    if (
      typeof accountService.setStatusReactionEmoji ===
      'function'
    ) {
      saved =
        await accountService.setStatusReactionEmoji(
          phone,
          emoji
        );

    } else if (
      typeof accountService.setReactionEmoji ===
      'function'
    ) {
      saved =
        await accountService.setReactionEmoji(
          phone,
          emoji
        );

    } else if (
      typeof accountService.setAutoLikeReaction ===
      'function'
    ) {
      saved =
        await accountService.setAutoLikeReaction(
          phone,
          emoji
        );

    } else {
      /*
       * Last-resort account object update.
       */

      const account =
        typeof accountService.getAccount ===
        'function'
          ? accountService.getAccount(
              phone
            )
          : null;

      if (account) {
        account.statusReactionEmoji =
          emoji;

        account.reactionEmoji =
          emoji;

        account.autoLikeReaction =
          emoji;

        account.reaction =
          emoji;

        account.updatedAt =
          new Date().toISOString();

        if (
          typeof accountService.saveAccounts ===
          'function'
        ) {
          await accountService.saveAccounts();
        }

        saved = true;
      }
    }

    if (!saved) {
      return (
        '❌ Could not save the reaction emoji.'
      );
    }

    /*
     * Restart the status monitor so the
     * worker immediately receives the new emoji.
     */

    if (
      typeof service?.startStatusMonitor ===
      'function'
    ) {
      await service.startStatusMonitor(
        phone
      );
    }

    return (
      `✅ *Reaction updated!*\n\n` +
      `New Status reaction: ${emoji}`
    );

  } catch (error) {
    console.error(
      '[Reaction] Error:',
      error
    );

    return (
      `❌ Could not update reaction: ${
        error?.message ||
        'Unknown error'
      }`
    );
  }
}

/*
|--------------------------------------------------------------------------
| REACT COMMAND
|--------------------------------------------------------------------------
*/

async function reactCommand(
  context,
  args = []
) {
  /*
   * .react is kept as an alias for
   * .reaction.
   */

  return reactionCommand(
    context,
    args
  );
}

/*
|--------------------------------------------------------------------------
| VIEW STATUS COMMAND
|--------------------------------------------------------------------------
*/

async function viewStatusCommand(
  context,
  args = []
) {
  const phone =
    String(
      context?.phone || ''
    ).replace(/\D/g, '');

  const service =
    context?.service;

  if (!phone) {
    return (
      '❌ Could not identify the WhatsApp account.'
    );
  }

  /*
   * No argument means show status.
   */

  const action =
    String(
      args?.[0] || 'status'
    ).toLowerCase();

  if (
    action === 'status'
  ) {
    try {
      const worker =
        typeof service?.getStatusAutomation ===
        'function'
          ? service.getStatusAutomation(
              phone
            )
          : typeof service?.getStatus ===
              'function'
            ? service.getStatus(phone)
            : null;

      return (
        '👀 *STATUS VIEWER*\n\n' +
        `Worker: ${
          worker?.running === true
            ? 'RUNNING ✅'
            : 'STOPPED 🛑'
        }\n` +
        `Auto View: ${
          worker?.autoView === true
            ? 'ON ✅'
            : 'OFF 🛑'
        }\n` +
        `Auto Like: ${
          worker?.autoLike === true
            ? 'ON ✅'
            : 'OFF 🛑'
        }`
      );

    } catch (error) {
      return (
        `❌ Status viewer error: ${
          error?.message ||
          'Unknown error'
        }`
      );
    }
  }

  /*
   * Manual status viewing is delegated to
   * the status service/engine.
   */

  try {
    const result =
      await callService(
        context,
        [
          'viewStatus',
          'viewStatusById',
          'processStatus'
        ],
        [phone, args]
      );

    if (
      result !== undefined &&
      result !== null
    ) {
      return String(result);
    }

    return (
      'ℹ️ Status viewer is running. ' +
      'New statuses will be handled automatically according to your settings.'
    );

  } catch (error) {
    console.error(
      '[ViewStatus] Error:',
      error
    );

    return (
      `❌ Could not process Status: ${
        error?.message ||
        'Unknown error'
      }`
    );
  }
}

/*
|--------------------------------------------------------------------------
| PAIR COMMAND
|--------------------------------------------------------------------------
*/

async function pairCommand(
  context,
  args = []
) {
  const phone =
    String(
      args?.[0] ||
      context?.phone ||
      ''
    ).replace(/\D/g, '');

  const service =
    context?.service;

  if (!phone) {
    return (
      '❌ Please provide a phone number.\n\n' +
      'Example:\n' +
      '`.pair 233XXXXXXXXX`'
    );
  }

  try {
    const result =
      await callService(
        context,
        [
          'pair',
          'requestPairing',
          'pairAccount',
          'startPairing'
        ],
        [phone]
      );

    if (
      result !== undefined &&
      result !== null
    ) {
      if (
        typeof result === 'string'
      ) {
        return result;
      }

      if (
        result.code ||
        result.pairingCode
      ) {
        return (
          '🔐 *PAIRING CODE*\n\n' +
          `Code: ${
            result.code ||
            result.pairingCode
          }`
        );
      }

      return (
        '✅ Pairing request started.'
      );
    }

    /*
     * Some services expose pairing through
     * getPairingCode rather than pair().
     */

    if (
      typeof service?.getPairingCode ===
      'function'
    ) {
      const code =
        await service.getPairingCode(
          phone
        );

      if (code) {
        return (
          '🔐 *PAIRING CODE*\n\n' +
          `Code: ${code}`
        );
      }
    }

    return (
      '⚠️ Pairing request could not be started.'
    );

  } catch (error) {
    console.error(
      '[Pair] Error:',
      error
    );

    return (
      `❌ Pairing error: ${
        error?.message ||
        'Unknown error'
      }`
    );
  }
}

/*
|--------------------------------------------------------------------------
| PAIR CODE
|--------------------------------------------------------------------------
*/

async function pairCodeCommand(
  context,
  args = []
) {
  return pairCommand(
    context,
    args
  );
}

/*
|--------------------------------------------------------------------------
| CONNECT
|--------------------------------------------------------------------------
*/

async function connectCommand(
  context,
  args = []
) {
  const phone =
    String(
      args?.[0] ||
      context?.phone ||
      ''
    ).replace(/\D/g, '');

  if (!phone) {
    return (
      '❌ Please provide a phone number.'
    );
  }

  try {
    const result =
      await callService(
        context,
        [
          'connect',
          'connectAccount',
          'startClient',
          'start'
        ],
        [phone]
      );

    if (
      result !== undefined &&
      result !== null
    ) {
      if (
        typeof result === 'string'
      ) {
        return result;
      }

      return (
        '✅ Connection request started.'
      );
    }

    return (
      '⚠️ Could not start the WhatsApp connection.'
    );

  } catch (error) {
    console.error(
      '[Connect] Error:',
      error
    );

    return (
      `❌ Connection error: ${
        error?.message ||
        'Unknown error'
      }`
    );
  }
}
/*
|--------------------------------------------------------------------------
| DISCONNECT
|--------------------------------------------------------------------------
*/

async function disconnectCommand(
  context,
  args = []
) {
  const phone =
    String(
      args?.[0] ||
      context?.phone ||
      ''
    ).replace(/\D/g, '');

  if (!phone) {
    return (
      '❌ Please provide a phone number.'
    );
  }

  try {
    const result =
      await callService(
        context,
        [
          'disconnect',
          'disconnectAccount',
          'stopClient',
          'stop'
        ],
        [phone]
      );

    if (
      result !== undefined &&
      result !== null
    ) {
      if (
        typeof result === 'string'
      ) {
        return result;
      }

      return (
        '✅ WhatsApp account disconnected.'
      );
    }

    return (
      '⚠️ Could not disconnect the account.'
    );

  } catch (error) {
    console.error(
      '[Disconnect] Error:',
      error
    );

    return (
      `❌ Disconnect error: ${
        error?.message ||
        'Unknown error'
      }`
    );
  }
}

/*
|--------------------------------------------------------------------------
| LOGOUT
|--------------------------------------------------------------------------
*/

async function logoutCommand(
  context,
  args = []
) {
  const phone =
    String(
      args?.[0] ||
      context?.phone ||
      ''
    ).replace(/\D/g, '');

  if (!phone) {
    return (
      '❌ Please provide a phone number.'
    );
  }

  try {
    const result =
      await callService(
        context,
        [
          'logout',
          'logoutAccount',
          'destroy',
          'removeAccount'
        ],
        [phone]
      );

    if (
      result !== undefined &&
      result !== null
    ) {
      if (
        typeof result === 'string'
      ) {
        return result;
      }

      return (
        '✅ WhatsApp account logged out successfully.'
      );
    }

    return (
      '⚠️ Could not log out the account.'
    );

  } catch (error) {
    console.error(
      '[Logout] Error:',
      error
    );

    return (
      `❌ Logout error: ${
        error?.message ||
        'Unknown error'
      }`
    );
  }
}

/*
|--------------------------------------------------------------------------
| SETTINGS
|--------------------------------------------------------------------------
*/

async function settingsCommand(
  context,
  args = []
) {
  const phone =
    String(
      context?.phone || ''
    ).replace(/\D/g, '');

  const accountService =
    context?.multiAccountService ||
    context?.accountService;

  if (!phone) {
    return (
      '❌ Could not identify the WhatsApp account.'
    );
  }

  try {
    const account =
      typeof accountService?.getAccount ===
      'function'
        ? accountService.getAccount(
            phone
          )
        : null;

    if (!account) {
      return (
        '❌ Account not found.'
      );
    }

    const autoView =
      account.autoViewStatus === true ||
      account.autoView === true ||
      account.statusView === true;

    const autoLike =
      account.autoLike === true;

    const reaction =
      account.statusReactionEmoji ||
      account.reactionEmoji ||
      account.autoLikeReaction ||
      account.reaction ||
      '❤️';

    return (
      '⚙️ *ACCOUNT SETTINGS*\n\n' +
      `📱 Phone: ${phone}\n\n` +
      `👀 Auto View: ${
        autoView
          ? 'ON ✅'
          : 'OFF 🛑'
      }\n` +
      `❤️ Auto Like: ${
        autoLike
          ? 'ON ✅'
          : 'OFF 🛑'
      }\n` +
      `💬 Reaction: ${reaction}\n\n` +
      'Commands:\n' +
      '• *.autoview on*\n' +
      '• *.autoview off*\n' +
      '• *.autolike on*\n' +
      '• *.autolike off*\n' +
      '• *.reaction ❤️'
    );

  } catch (error) {
    console.error(
      '[Settings] Error:',
      error
    );

    return (
      `❌ Settings error: ${
        error?.message ||
        'Unknown error'
      }`
    );
  }
}

/*
|--------------------------------------------------------------------------
| ACCOUNT
|--------------------------------------------------------------------------
*/

async function accountCommand(
  context,
  args = []
) {
  const phone =
    String(
      args?.[0] ||
      context?.phone ||
      ''
    ).replace(/\D/g, '');

  const accountService =
    context?.multiAccountService ||
    context?.accountService;

  if (!phone) {
    return (
      '❌ Could not identify the account.'
    );
  }

  try {
    if (
      typeof accountService?.getAccount !==
      'function'
    ) {
      return (
        '❌ Account service is unavailable.'
      );
    }

    const account =
      accountService.getAccount(
        phone
      );

    if (!account) {
      return (
        '❌ Account not found.'
      );
    }

    const autoView =
      account.autoViewStatus === true ||
      account.autoView === true ||
      account.statusView === true;

    const autoLike =
      account.autoLike === true;

    return (
      '👤 *ACCOUNT INFORMATION*\n\n' +
      `📱 Phone: ${phone}\n` +
      `🟢 Active: ${
        account.active === false
          ? 'NO ❌'
          : 'YES ✅'
      }\n` +
      `🔗 Connected: ${
        account.connected === true
          ? 'YES ✅'
          : 'NO 🛑'
      }\n` +
      `👀 Auto View: ${
        autoView
          ? 'ON ✅'
          : 'OFF 🛑'
      }\n` +
      `❤️ Auto Like: ${
        autoLike
          ? 'ON ✅'
          : 'OFF 🛑'
      }\n` +
      `💬 Reaction: ${
        account.statusReactionEmoji ||
        account.reactionEmoji ||
        account.autoLikeReaction ||
        account.reaction ||
        '❤️'
      }`
    );

  } catch (error) {
    console.error(
      '[Account] Error:',
      error
    );

    return (
      `❌ Account error: ${
        error?.message ||
        'Unknown error'
      }`
    );
  }
}

/*
|--------------------------------------------------------------------------
| TRIAL
|--------------------------------------------------------------------------
*/

async function trialCommand(
  context,
  args = []
) {
  const phone =
    String(
      context?.phone || ''
    ).replace(/\D/g, '');

  try {
    const result =
      await callService(
        context,
        [
          'getTrialStatus',
          'startTrial',
          'trial'
        ],
        [phone, args]
      );

    if (
      result !== undefined &&
      result !== null
    ) {
      if (
        typeof result === 'string'
      ) {
        return result;
      }

      return (
        '🎁 *TRIAL STATUS*\n\n' +
        `${JSON.stringify(
          result,
          null,
          2
        )}`
      );
    }

    return (
      '🎁 Trial information is currently unavailable.'
    );

  } catch (error) {
    console.error(
      '[Trial] Error:',
      error
    );

    return (
      `❌ Trial error: ${
        error?.message ||
        'Unknown error'
      }`
    );
  }
}

/*
|--------------------------------------------------------------------------
| SUBSCRIBE
|--------------------------------------------------------------------------
*/

async function subscribeCommand(
  context,
  args = []
) {
  const phone =
    String(
      context?.phone || ''
    ).replace(/\D/g, '');

  try {
    const result =
      await callService(
        context,
        [
          'subscribe',
          'createSubscription',
          'startSubscription'
        ],
        [phone, args]
      );

    if (
      result !== undefined &&
      result !== null
    ) {
      if (
        typeof result === 'string'
      ) {
        return result;
      }

      if (
        result.url ||
        result.link
      ) {
        return (
          '💳 *SUBSCRIPTION*\n\n' +
          'Continue here:\n' +
          `${
            result.url ||
            result.link
          }`
        );
      }

      return (
        '💳 *SUBSCRIPTION*\n\n' +
        `${JSON.stringify(
          result,
          null,
          2
        )}`
      );
    }

    return (
      '💳 Subscription service is currently unavailable.'
    );

  } catch (error) {
    console.error(
      '[Subscribe] Error:',
      error
    );

    return (
      `❌ Subscription error: ${
        error?.message ||
        'Unknown error'
      }`
    );
  }
}

/*
|--------------------------------------------------------------------------
| INFO
|--------------------------------------------------------------------------
*/

async function infoCommand(
  context,
  args = []
) {
  const phone =
    String(
      context?.phone || ''
    ).replace(/\D/g, '');

  const accountService =
    context?.multiAccountService ||
    context?.accountService;

  try {
    const account =
      typeof accountService?.getAccount ===
      'function'
        ? accountService.getAccount(
            phone
          )
        : null;

    return (
      'ℹ️ *WA-AutoBot*\n\n' +
      '🤖 WhatsApp automation bot\n' +
      `📱 Account: ${
        phone || 'Unknown'
      }\n` +
      `📦 Commands loaded: ${
        commands.size
      }\n` +
      `👀 Auto View: ${
        account?.autoViewStatus === true ||
        account?.autoView === true ||
        account?.statusView === true
          ? 'ON'
          : 'OFF'
      }\n` +
      `❤️ Auto Like: ${
        account?.autoLike === true
          ? 'ON'
          : 'OFF'
      }`
    );

  } catch (error) {
    return (
      `❌ Info error: ${
        error?.message ||
        'Unknown error'
      }`
    );
  }
}

/*
|--------------------------------------------------------------------------
| RESTART
|--------------------------------------------------------------------------
*/

async function restartCommand(
  context,
  args = []
) {
  const phone =
    String(
      args?.[0] ||
      context?.phone ||
      ''
    ).replace(/\D/g, '');

  try {
    /*
     * Restart status automation first.
     */

    if (
      phone &&
      typeof context?.service
        ?.startStatusMonitor ===
        'function'
    ) {
      const result =
        await context.service.startStatusMonitor(
          phone
        );

      if (result === false) {
        return (
          '⚠️ Status monitor could not be restarted.\n' +
          'Make sure the WhatsApp account is connected.'
        );
      }
    }

    /*
     * Then try the general restart method.
     */

    const result =
      await callService(
        context,
        [
          'restart',
          'restartAccount',
          'restartClient'
        ],
        [phone]
      );

    if (
      result !== undefined &&
      result !== null
    ) {
      if (
        typeof result === 'string'
      ) {
        return result;
      }

      return (
        '🔄 Account restart initiated.'
      );
    }

    return (
      '🔄 Restart completed.'
    );

  } catch (error) {
    console.error(
      '[Restart] Error:',
      error
    );

    return (
      `❌ Restart error: ${
        error?.message ||
        'Unknown error'
      }`
    );
  }
}

/*
|--------------------------------------------------------------------------
| BUILT-IN COMMAND REGISTRATION
|--------------------------------------------------------------------------
|
| These commands are intentionally registered here.
| If separate command files have the same names,
| loadCommands() will not overwrite these handlers.
|--------------------------------------------------------------------------
*/

commands.set(
  'menu',
  {
    name: 'menu',
    description: 'Show available commands',
    execute: menuCommand
  }
);

commands.set(
  'help',
  {
    name: 'help',
    description: 'Show help',
    execute: helpCommand
  }
);

commands.set(
  'ping',
  {
    name: 'ping',
    description: 'Check bot status',
    execute: pingCommand
  }
);

commands.set(
  'status',
  {
    name: 'status',
    description: 'Show account status',
    execute: statusCommand
  }
);

commands.set(
  'autoview',
  {
    name: 'autoview',
    description: 'Automatically view WhatsApp Status',
    execute: autoViewCommand
  }
);

commands.set(
  'autolike',
  {
    name: 'autolike',
    description: 'Automatically react to WhatsApp Status',
    execute: autoLikeCommand
  }
);

commands.set(
  'reaction',
  {
    name: 'reaction',
    description: 'Set Status reaction emoji',
    execute: reactionCommand
  }
);

commands.set(
  'react',
  {
    name: 'react',
    description: 'Set Status reaction emoji',
    execute: reactCommand
  }
);

commands.set(
  'viewstatus',
  {
    name: 'viewstatus',
    description: 'View Status automation information',
    execute: viewStatusCommand
  }
);

commands.set(
  'pairstatus',
  {
    name: 'pairstatus',
    description: 'Pair WhatsApp account',
    execute: pairCommand
  }
);

commands.set(
  'pair',
  {
    name: 'pair',
    description: 'Pair WhatsApp account',
    execute: pairCommand
  }
);

commands.set(
  'paircode',
  {
    name: 'paircode',
    description: 'Generate pairing code',
    execute: pairCodeCommand
  }
);

commands.set(
  'connect',
  {
    name: 'connect',
    description: 'Connect WhatsApp account',
    execute: connectCommand
  }
);

commands.set(
  'disconnect',
  {
    name: 'disconnect',
    description: 'Disconnect WhatsApp account',
    execute: disconnectCommand
  }
);

commands.set(
  'logout',
  {
    name: 'logout',
    description: 'Log out WhatsApp account',
    execute: logoutCommand
  }
);

commands.set(
  'settings',
  {
    name: 'settings',
    description: 'Show account settings',
    execute: settingsCommand
  }
);

commands.set(
  'account',
  {
    name: 'account',
    description: 'Show account information',
    execute: accountCommand
  }
);

commands.set(
  'trial',
  {
    name: 'trial',
    description: 'Show trial information',
    execute: trialCommand
  }
);

commands.set(
  'subscribe',
  {
    name: 'subscribe',
    description: 'Subscribe to the service',
    execute: subscribeCommand
  }
);

commands.set(
  'info',
  {
    name: 'info',
    description: 'Show bot information',
    execute: infoCommand
  }
);

commands.set(
  'restart',
  {
    name: 'restart',
    description: 'Restart account services',
    execute: restartCommand
  }
);

/*
|--------------------------------------------------------------------------
| LOAD EXTERNAL COMMANDS
|--------------------------------------------------------------------------
*/

loadCommands();
/*
|--------------------------------------------------------------------------
| COMMAND EXECUTOR
|--------------------------------------------------------------------------
*/

async function execute(
  context = {},
  input = ''
) {
  try {
    /*
     * Support both:
     *
     * execute(context, '.autolike on')
     *
     * and:
     *
     * execute({
     *   ...context,
     *   body: '.autolike on'
     * })
     */

    let text = input;

    if (
      !text &&
      typeof context?.body === 'string'
    ) {
      text = context.body;
    }

    if (
      !text &&
      typeof context?.message?.body ===
        'string'
    ) {
      text =
        context.message.body;
    }

    text = String(
      text || ''
    ).trim();

    if (!text) {
      return null;
    }

    /*
     * Commands must begin with a dot.
     */

    if (!text.startsWith('.')) {
      return null;
    }

    /*
     * Split command and arguments.
     *
     * Example:
     * .autolike on
     *
     * command = autolike
     * args = ['on']
     */

    const parts =
      text
        .slice(1)
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (!parts.length) {
      return null;
    }

    const commandName =
      normalizeCommandName(
        parts.shift()
      );

    const args = parts;

    const command =
      commands.get(commandName);

    if (!command) {
      return (
        `❌ Unknown command: *.${commandName}*\n\n` +
        'Use *.menu* to see available commands.'
      );
    }

    /*
     * Every command receives the same context.
     */

    const commandContext = {
      ...context,
      command:
        commandName,
      args
    };

    /*
     * Support several command module formats.
     */

    if (
      typeof command === 'function'
    ) {
      return await command(
        commandContext,
        args
      );
    }

    if (
      typeof command.execute ===
      'function'
    ) {
      return await command.execute(
        commandContext,
        args
      );
    }

    if (
      typeof command.run ===
      'function'
    ) {
      return await command.run(
        commandContext,
        args
      );
    }

    if (
      typeof command.handler ===
      'function'
    ) {
      return await command.handler(
        commandContext,
        args
      );
    }

    return (
      `❌ Command *.${commandName}* has no executable handler.`
    );

  } catch (error) {
    console.error(
      '[Commands] Execution error:',
      error
    );

    return (
      '❌ Command failed.\n\n' +
      `${
        error?.message ||
        'Unknown error'
      }`
    );
  }
}

/*
|--------------------------------------------------------------------------
| RELOAD COMMAND
|--------------------------------------------------------------------------
*/

async function reloadCommand(
  context,
  args = []
) {
  try {
    /*
     * Do not remove the built-in handlers.
     * Only reload external command modules.
     */

    let files = [];

    try {
      files =
        fs.readdirSync(
          COMMANDS_DIR
        );
    } catch (error) {
      return (
        `❌ Could not read commands directory: ${
          error?.message ||
          'Unknown error'
        }`
      );
    }

    let loaded = 0;

    for (const file of files) {
      if (
        file === 'index.js' ||
        !file.endsWith('.js')
      ) {
        continue;
      }

      const fullPath =
        path.join(
          COMMANDS_DIR,
          file
        );

      try {
        delete require.cache[
          require.resolve(
            fullPath
          )
        ];

        const commandModule =
          require(fullPath);

        if (!commandModule) {
          continue;
        }

        let name =
          commandModule.name ||
          commandModule.command ||
          path.basename(
            file,
            '.js'
          );

        name =
          normalizeCommandName(
            name
          );

        if (!name) {
          continue;
        }

        /*
         * Never replace built-in handlers.
         * This is important for the corrected
         * Auto View and Auto Like commands.
         */

        const builtInCommands = [
          'menu',
          'help',
          'ping',
          'status',
          'autoview',
          'autolike',
          'reaction',
          'react',
          'viewstatus',
          'pair',
          'pairstatus',
          'paircode',
          'connect',
          'disconnect',
          'logout',
          'settings',
          'account',
          'trial',
          'subscribe',
          'info',
          'restart',
          'reload'
        ];

        if (
          builtInCommands.includes(
            name
          )
        ) {
          continue;
        }

        commands.set(
          name,
          commandModule
        );

        loaded++;

      } catch (error) {
        console.error(
          `[Commands] Reload failed for ${file}:`,
          error.message
        );
      }
    }

    return (
      '🔄 *COMMANDS RELOADED*\n\n' +
      `✅ Reloaded: ${loaded}\n` +
      `📦 Total available: ${commands.size}`
    );

  } catch (error) {
    console.error(
      '[Commands] Reload error:',
      error
    );

    return (
      `❌ Reload failed: ${
        error?.message ||
        'Unknown error'
      }`
    );
  }
}

/*
|--------------------------------------------------------------------------
| REGISTER RELOAD
|--------------------------------------------------------------------------
*/

commands.set(
  'reload',
  {
    name: 'reload',
    description: 'Reload command files',
    execute: reloadCommand
  }
);

/*
|--------------------------------------------------------------------------
| COMMAND ALIASES
|--------------------------------------------------------------------------
|
| These aliases make the bot more tolerant
| of different command names.
|--------------------------------------------------------------------------
*/

if (!commands.has('autoviewstatus')) {
  commands.set(
    'autoviewstatus',
    {
      name: 'autoviewstatus',
      description: 'Show Auto View Status',
      execute: autoViewCommand
    }
  );
}

if (!commands.has('autolikestatus')) {
  commands.set(
    'autolikestatus',
    {
      name: 'autolikestatus',
      description: 'Show Auto Like Status',
      execute: autoLikeCommand
    }
  );
}

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  commands,

  loadCommands,

  getCommand,

  getCommands,

  getCommandNames,

  getCommandList,

  normalizeCommandName,

  execute,

  /*
   * Export the built-in handlers as well.
   * This is useful for other backend services
   * that may need to call them directly.
   */

  menuCommand,

  helpCommand,

  pingCommand,

  statusCommand,

  autoViewCommand,

  autoLikeCommand,

  reactionCommand,

  reactCommand,

  viewStatusCommand,

  pairCommand,

  pairCodeCommand,

  connectCommand,

  disconnectCommand,

  logoutCommand,

  settingsCommand,

  accountCommand,

  trialCommand,

  subscribeCommand,

  infoCommand,

  restartCommand,

  reloadCommand
};
