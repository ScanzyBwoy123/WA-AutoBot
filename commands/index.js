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
  commands.clear();

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

      name =
        normalizeCommandName(name);

      if (!name) {
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
    context?.multiAccountService,
    context?.accountService
  ].filter(Boolean);

  for (const object of objects) {
    for (const method of methods) {
      if (
        typeof object[method] ===
        'function'
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
    getCommandNames()
      .filter(
        (name) =>
          name !== 'menu'
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

async function statusCommand(
  context
) {
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
      );

    if (!result) {
      return (
        '📊 *ACCOUNT STATUS*\n\n' +
        `Phone: ${phone}\n` +
        'Connection: Unknown\n' +
        'Auto View: Unknown\n' +
        'Auto Like: Unknown'
      );
    }

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
  args
) {
  const action =
    String(
      args?.[0] || ''
    ).toLowerCase();

  if (
    action === 'status'
  ) {
    const result =
      await callService(
        context,
        [
          'getStatus',
          'getAccountStatus'
        ],
        [context?.phone]
      );

    return (
      '👁️ Auto View: ' +
      (
        result?.autoView !== undefined
          ? (
              result.autoView
                ? 'ON'
                : 'OFF'
            )
          : (
              result?.statusMonitor
                ? 'ON'
                : 'OFF'
            )
      )
    );
  }

  if (
    ![
      'on',
      'off',
      'enable',
      'disable'
    ].includes(action)
  ) {
    return (
      '👁️ *AUTO VIEW*\n\n' +
      'Use:\n' +
      '• *.autoview on*\n' +
      '• *.autoview off*\n' +
      '• *.autoview status*'
    );
  }

  const enabled =
    action === 'on' ||
    action === 'enable';

  try {
    let result;

    if (enabled) {
      result =
        await callService(
          context,
          [
            'setAutoView',
            'setAutoViewEnabled',
            'enableAutoView'
          ],
          [true]
        );
    } else {
      result =
        await callService(
          context,
          [
            'setAutoView',
            'setAutoViewEnabled',
            'disableAutoView'
          ],
          [false]
        );
    }

    if (result === undefined) {
      return (
        '❌ Auto View could not be changed.\n' +
        'The WhatsApp service does not expose the Auto View setting.'
      );
    }

    return enabled
      ? '✅ Auto View enabled. The Status monitor is now active.'
      : '🛑 Auto View disabled.';
  } catch (error) {
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
  args
) {
  const action =
    String(
      args?.[0] || ''
    ).toLowerCase();

  if (
    action === 'status'
  ) {
    const result =
      await callService(
        context,
        [
          'getStatus',
          'getAccountStatus'
        ],
        [context?.phone]
      );

    return (
      '❤️ Auto Like: ' +
      (
        result?.autoLike !== undefined
          ? (
              result.autoLike
                ? 'ON'
                : 'OFF'
            )
          : 'Unknown'
      )
    );
  }

  if (
    ![
      'on',
      'off',
      'enable',
      'disable'
    ].includes(action)
  ) {
    return (
      '❤️ *AUTO LIKE*\n\n' +
      'Use:\n' +
      '• *.autolike on*\n' +
      '• *.autolike off*\n' +
      '• *.autolike status*'
    );
  }

  const enabled =
    action === 'on' ||
    action === 'enable';

  try {
    let result;

    if (enabled) {
      result =
        await callService(
          context,
          [
            'setAutoLike',
            'setAutoLikeEnabled',
            'enableAutoLike'
          ],
          [true]
        );
    } else {
      result =
        await callService(
          context,
          [
            'setAutoLike',
            'setAutoLikeEnabled',
            'disableAutoLike'
          ],
          [false]
        );
    }

    if (result === undefined) {
      return (
        '❌ Auto Like could not be changed.\n' +
        'The WhatsApp service does not expose the Auto Like setting.'
      );
    }

    return enabled
      ? '❤️ Auto Like enabled. New eligible Status messages will be reacted to.'
      : '🛑 Auto Like disabled.';
  } catch (error) {
    return (
      `❌ Auto Like error: ${
        error?.message ||
        'Unknown error'
      }`
    );
  }
}

/*
|--------------------------------------------------------------------------
| REACTION
|--------------------------------------------------------------------------
*/

async function reactionCommand(
  context,
  args
) {
  const reaction =
    String(
      args?.[0] || ''
    ).trim();

  if (!reaction) {
    const result =
      await callService(
        context,
        [
          'getStatus',
          'getAccountStatus'
        ],
        [context?.phone]
      );

    return (
      `❤️ Current reaction: ${
        result?.reaction ||
        result?.autoLikeReaction ||
        '❤️'
      }\n\n` +
      'Change it with:\n' +
      '*.reaction ❤️*'
    );
  }

  try {
    const result =
      await callService(
        context,
        [
          'setReaction',
          'setAutoLikeReaction',
          'setStatusReaction'
        ],
        [reaction]
      );

    if (result === undefined) {
      return (
        '❌ Reaction could not be saved.'
      );
    }

    return (
      `✅ Automatic Status reaction changed to ${reaction}`
    );
  } catch (error) {
    return (
      `❌ Reaction error: ${
        error?.message ||
        'Unknown error'
      }`
    );
  }
}

/*
|--------------------------------------------------------------------------
| MANUAL REACT
|--------------------------------------------------------------------------
*/

async function reactCommand(
  context,
  args
) {
  const reaction =
    String(
      args?.[0] || '❤️'
    ).trim();

  try {
    const result =
      await callService(
        context,
        [
          'reactToCurrentStatus',
          'reactToLatestStatus',
          'reactToStatus',
          'reactStatus',
          'likeStatus'
        ],
        [reaction]
      );

    if (result === undefined) {
      return (
        '❌ Manual Status reaction is not available from the WhatsApp service.'
      );
    }

    if (result === false) {
      return (
        '⚠️ No eligible Status was found.'
      );
    }

    return (
      `✅ Status reacted with ${reaction}`
    );
  } catch (error) {
    return (
      `❌ Status reaction failed: ${
        error?.message ||
        'Unknown error'
      }`
    );
  }
}

/*
|--------------------------------------------------------------------------
| VIEW STATUS
|--------------------------------------------------------------------------
*/

async function viewStatusCommand(
  context
) {
  try {
    const result =
      await callService(
        context,
        [
          'checkStatuses',
          'viewStatuses',
          'openStatuses',
          'processStatuses'
        ],
        [context?.phone]
      );

    if (result === undefined) {
      return (
        '❌ Status viewing service is not available.'
      );
    }

    return (
      '👁️ Status processing started.'
    );
  } catch (error) {
    return (
      `❌ Status view failed: ${
        error?.message ||
        'Unknown error'
      }`
    );
  }
}

/*
|--------------------------------------------------------------------------
| PAIR
|--------------------------------------------------------------------------
*/

async function pairCommand(
  context,
  args
) {
  const phone =
    String(
      args?.[0] ||
      context?.phone ||
      ''
    ).replace(/\D/g, '');

  if (!phone) {
    return (
      '❌ Phone number required.\n\n' +
      'Example:\n' +
      '*.pair 233XXXXXXXXX*'
    );
  }

  try {
    const result =
      await callService(
        context,
        [
          'startAccount',
          'connectAccount',
          'pairAccount'
        ],
        [phone]
      );

    if (
      result?.pairingCode
    ) {
      return (
        '🔑 *WHATSAPP PAIRING CODE*\n\n' +
        `Phone: ${phone}\n` +
        `Code: *${result.pairingCode}*`
      );
    }

    return (
      '⏳ WhatsApp pairing has been started.\n' +
      'Use *.paircode* to check for the pairing code.'
    );
  } catch (error) {
    return (
      `❌ Pairing failed: ${
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
  context
) {
  try {
    const result =
      await callService(
        context,
        [
          'getPairingCode',
          'getPairCode'
        ],
        [context?.phone]
      );

    if (
      result?.available &&
      result?.pairingCode
    ) {
      return (
        '🔑 *PAIRING CODE*\n\n' +
        `*${result.pairingCode}*`
      );
    }

    return (
      '⏳ No pairing code is currently available.'
    );
  } catch (error) {
    return (
      `❌ Pairing code error: ${
        error?.message ||
        'Unknown error'
      }`
    );
  }
}

/*
|--------------------------------------------------------------------------
| CONNECT
|--------------------------------------------------------------------------
*/

async function connectCommand(
  context,
  args
) {
  const phone =
    String(
      args?.[0] ||
      context?.phone ||
      ''
    ).replace(/\D/g, '');

  if (!phone) {
    return '❌ Phone number required.';
  }

  try {
    const result =
      await callService(
        context,
        [
          'startAccount',
          'connectAccount'
        ],
        [phone]
      );

    return (
      result?.message ||
      '🔄 WhatsApp connection started.'
    );
  } catch (error) {
    return (
      `❌ Connection failed: ${
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
  context
) {
  try {
    const result =
      await callService(
        context,
        [
          'disconnectAccount',
          'disconnect'
        ],
        [context?.phone]
      );

    return (
      result?.message ||
      '🔴 WhatsApp account disconnected.'
    );
  } catch (error) {
    return (
      `❌ Disconnect failed: ${
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
  context
) {
  try {
    const result =
      await callService(
        context,
        [
          'disconnectAccount',
          'logoutAccount',
          'logout'
        ],
        [context?.phone]
      );

    return (
      result?.message ||
      '🔴 WhatsApp session logged out.'
    );
  } catch (error) {
    return (
      `❌ Logout failed: ${
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
  context
) {
  const result =
    await callService(
      context,
      [
        'getStatus',
        'getAccountStatus'
      ],
      [context?.phone]
    );

  return (
    '⚙️ *SETTINGS*\n\n' +
    `Account: ${
      context?.phone ||
      'Unknown'
    }\n` +
    `Connection: ${
      result?.status ||
      'Unknown'
    }\n` +
    `Auto View: ${
      result?.autoView !== undefined
        ? (
            result.autoView
              ? 'ON'
              : 'OFF'
          )
        : 'Unknown'
    }\n` +
    `Auto Like: ${
      result?.autoLike !== undefined
        ? (
            result.autoLike
              ? 'ON'
              : 'OFF'
          )
        : 'Unknown'
    }\n` +
    `Reaction: ${
      result?.reaction ||
      result?.autoLikeReaction ||
      '❤️'
    }`
  );
}

/*
|--------------------------------------------------------------------------
| ACCOUNT
|--------------------------------------------------------------------------
*/

async function accountCommand(
  context
) {
  const result =
    await callService(
      context,
      [
        'getStatus',
        'getAccountStatus'
      ],
      [context?.phone]
    );

  return (
    '👤 *ACCOUNT*\n\n' +
    `Phone: ${
      context?.phone ||
      'Unknown'
    }\n` +
    `Status: ${
      result?.status ||
      'Unknown'
    }\n` +
    `Connected: ${
      result?.connected
        ? 'YES'
        : 'NO'
    }`
  );
}

/*
|--------------------------------------------------------------------------
| TRIAL
|--------------------------------------------------------------------------
*/

async function trialCommand(
  context
) {
  const result =
    await callService(
      context,
      [
        'getTrialStatus',
        'getAccountStatus'
      ],
      [context?.phone]
    );

  return (
    '🎁 *TRIAL STATUS*\n\n' +
    `Status: ${
      result?.trialStatus ||
      result?.subscriptionStatus ||
      'Unknown'
    }\n` +
    `Expires: ${
      result?.trialExpires ||
      result?.expiresAt ||
      'Unknown'
    }`
  );
}

/*
|--------------------------------------------------------------------------
| SUBSCRIBE
|--------------------------------------------------------------------------
*/

async function subscribeCommand() {
  return (
    '💳 *SUBSCRIPTION*\n\n' +
    'Your subscription/payment system is available through the bot dashboard.'
  );
}

/*
|--------------------------------------------------------------------------
| INFO
|--------------------------------------------------------------------------
*/

async function infoCommand() {
  return (
    '🤖 *WA-AutoBot*\n\n' +
    'WhatsApp automation bot with:\n' +
    '• Phone pairing\n' +
    '• Auto View\n' +
    '• Auto Like\n' +
    '• Status reactions\n' +
    '• Account management\n' +
    '• Subscription control'
  );
}

/*
|--------------------------------------------------------------------------
| RESTART
|--------------------------------------------------------------------------
*/

async function restartCommand(
  context
) {
  try {
    await callService(
      context,
      [
        'disconnectAccount'
      ],
      [context?.phone]
    );

    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          1000
        )
    );

    const result =
      await callService(
        context,
        [
          'startAccount'
        ],
        [context?.phone]
      );

    return (
      result?.message ||
      '🔄 WhatsApp account restart initiated.'
    );
  } catch (error) {
    return (
      `❌ Restart failed: ${
        error?.message ||
        'Unknown error'
      }`
    );
  }
}

/*
|--------------------------------------------------------------------------
| REGISTER BUILT-IN COMMANDS
|--------------------------------------------------------------------------
*/

commands.set('menu', {
  name: 'menu',
  description: 'Show all available commands',
  execute: menuCommand
});

commands.set('help', {
  name: 'help',
  description: 'Show command help',
  execute: helpCommand
});

commands.set('ping', {
  name: 'ping',
  description: 'Check whether the bot is online',
  execute: pingCommand
});

commands.set('status', {
  name: 'status',
  description: 'Show WhatsApp account status',
  execute: statusCommand
});

commands.set('pair', {
  name: 'pair',
  description: 'Start WhatsApp phone-number pairing',
  execute: pairCommand
});

commands.set('paircode', {
  name: 'paircode',
  description: 'Show the current WhatsApp pairing code',
  execute: pairCodeCommand
});

commands.set('connect', {
  name: 'connect',
  description: 'Connect the WhatsApp account',
  execute: connectCommand
});

commands.set('disconnect', {
  name: 'disconnect',
  description: 'Disconnect the WhatsApp account',
  execute: disconnectCommand
});

commands.set('logout', {
  name: 'logout',
  description: 'Log out of the WhatsApp session',
  execute: logoutCommand
});

commands.set('autoview', {
  name: 'autoview',
  description: 'Enable or disable automatic Status viewing',
  execute: autoViewCommand
});

commands.set('autolike', {
  name: 'autolike',
  description: 'Enable or disable automatic Status reactions',
  execute: autoLikeCommand
});

commands.set('react', {
  name: 'react',
  description: 'React to a WhatsApp Status',
  execute: reactCommand
});

commands.set('viewstatus', {
  name: 'viewstatus',
  description: 'Manually process available Status messages',
  execute: viewStatusCommand
});

commands.set('reaction', {
  name: 'reaction',
  description: 'Set the automatic Status reaction',
  execute: reactionCommand
});

commands.set('settings', {
  name: 'settings',
  description: 'Show current bot settings',
  execute: settingsCommand
});

commands.set('account', {
  name: 'account',
  description: 'Show account information',
  execute: accountCommand
});

commands.set('subscribe', {
  name: 'subscribe',
  description: 'Show subscription information',
  execute: subscribeCommand
});

commands.set('trial', {
  name: 'trial',
  description: 'Show trial information',
  execute: trialCommand
});

commands.set('restart', {
  name: 'restart',
  description: 'Restart the WhatsApp connection',
  execute: restartCommand
});

commands.set('info', {
  name: 'info',
  description: 'Show information about WA-AutoBot',
  execute: infoCommand
});

/*
|--------------------------------------------------------------------------
| LOAD EXTERNAL COMMAND FILES
|--------------------------------------------------------------------------
*/

loadCommands();

/*
|--------------------------------------------------------------------------
| EXECUTE
|--------------------------------------------------------------------------
*/

async function execute(
  input,
  context = {}
) {
  const text =
    String(input || '')
      .trim();

  if (!text) {
    return null;
  }

  /*
   * IMPORTANT:
   * Ordinary WhatsApp messages are ignored.
   */
  if (!text.startsWith('.')) {
    return null;
  }

  const parts =
    text
      .slice(1)
      .trim()
      .split(/\s+/);

  const commandName =
    normalizeCommandName(
      parts.shift()
    );

  const args = parts;

  if (!commandName) {
    return null;
  }

  const command =
    getCommand(commandName);

  if (!command) {
    return (
      `❌ Unknown command: .${commandName}\n\n` +
      'Use .menu to see available commands.'
    );
  }

  try {
    if (
      typeof command ===
      'function'
    ) {
      return await command(
        context,
        args
      );
    }

    if (
      typeof command.execute ===
      'function'
    ) {
      return await command.execute(
        context,
        args
      );
    }

    if (
      typeof command.run ===
      'function'
    ) {
      return await command.run(
        context,
        args
      );
    }

    if (
      typeof command.handler ===
      'function'
    ) {
      return await command.handler(
        context,
        args
      );
    }

    if (
      typeof command.handle ===
      'function'
    ) {
      return await command.handle(
        context,
        args
      );
    }

    if (
      typeof command.action ===
      'function'
    ) {
      return await command.action(
        context,
        args
      );
    }

    return (
      `❌ Command .${commandName} is not configured correctly.`
    );
  } catch (error) {
    console.error(
      `[Commands] Error executing .${commandName}:`,
      error
    );

    return (
      `❌ Error running .${commandName}: ${
        error?.message ||
        'Unknown error'
      }`
    );
  }
}

/*
|--------------------------------------------------------------------------
| RELOAD
|--------------------------------------------------------------------------
*/

async function reloadCommand() {
  loadCommands();

  return (
    `🔄 Reloaded ${commands.size} commands.`
  );
}

commands.set('reload', {
  name: 'reload',
  description: 'Reload command files',
  execute: reloadCommand
});

/*
|--------------------------------------------------------------------------
| PUBLIC API
|--------------------------------------------------------------------------
*/

module.exports = {
  execute,
  loadCommands,
  getCommand,
  getCommands,
  getCommandNames,
  getCommandList,
  commands
};
