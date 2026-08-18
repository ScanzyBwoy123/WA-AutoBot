getCommandRouter() {
  /*
   * multiAccountWhatsAppService.js is located at:
   *
   * backend/services/multiAccountWhatsAppService.js
   *
   * commands/index.js is located at:
   *
   * commands/index.js
   *
   * Therefore the correct path is:
   * ../../commands/index.js
   */

  const candidates = [
    path.resolve(
      __dirname,
      '../../commands/index.js'
    ),

    path.resolve(
      __dirname,
      '../commands/index.js'
    ),

    path.resolve(
      process.cwd(),
      'commands/index.js'
    ),

    path.resolve(
      process.cwd(),
      'backend/commands/index.js'
    )
  ];

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) {
        continue;
      }

      console.log(
        `[Commands] Loading command router: ${candidate}`
      );

      delete require.cache[
        require.resolve(candidate)
      ];

      const router = require(candidate);

      if (
        router &&
        typeof router.execute === 'function'
      ) {
        console.log(
          `[Commands] Command router loaded successfully: ${candidate}`
        );

        return router;
      }

      console.error(
        `[Commands] Invalid command router: ${candidate}`
      );
    } catch (error) {
      console.error(
        `[Commands] Failed loading ${candidate}:`,
        error.message
      );
    }
  }

  throw new Error(
    `Command router not found. Searched:\n${candidates.join('\n')}`
  );
}
