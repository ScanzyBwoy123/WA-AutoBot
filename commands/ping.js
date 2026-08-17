module.exports = {
  name: 'ping',
  category: 'System',
  description: 'Check bot response speed',

  async execute(args, context) {
    const start = Date.now();

    const latency = Date.now() - start;

    return `Pong! 🟢 Bot is online.\nResponse: ${latency}ms`;
  }
};
