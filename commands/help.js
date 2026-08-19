‘use strict’;

module.exports = {
name: ‘help’,
category: ‘General’,
description: ‘Show all available commands’,

async execute() {
return (
‘📖 WA-AutoBot Help\n\n’ +
‘🤖 General Commands\n’ +
‘.menu - Show the main menu\n’ +
‘.help - Show this help message\n’ +
‘.about - About the bot\n’ +
‘.owner - Show bot owner\n’ +
‘.ping - Check bot response\n’ +
‘.status - Show bot status\n’ +
‘.support - Contact support\n\n’ +

  '⚙️ *Automation*\n' +
  '.autoview on - Automatically view statuses\n' +
  '.autoview off - Stop automatic status viewing\n' +
  '.autolike on - Automatically react to statuses\n' +
  '.autolike off - Stop automatic reactions\n\n' +
  '🎵 *Media*\n' +
  '.play <song> - Play/download a song\n' +
  '.song <song> - Search for a song\n' +
  '.video <query> - Search for a video\n' +
  '.vv - View a view-once message\n\n' +
  '🔐 *Other*\n' +
  '.antidelete - Anti-delete settings\n' +
  '.settings - Bot settings\n\n' +
  '💡 Type *.menu* for the main command menu.'
);

}
};
