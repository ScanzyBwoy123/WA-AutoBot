'use strict';

/**
 * .video command
 *
 * Usage:
 *   .video <search query>
 *
 * The command accepts either:
 *   execute(args, context)
 * or:
 *   execute(context, args)
 *
 * This makes it compatible with the command router.
 */

async function execute(arg1, arg2) {
  let args;
  let context;

  /*
   * Detect which argument is the command arguments
   * and which one is the command context.
   */
  if (Array.isArray(arg1)) {
    args = arg1;
    context = arg2 || {};
  } else if (Array.isArray(arg2)) {
    context = arg1 || {};
    args = arg2;
  } else {
    context = arg1 || {};
    args = [];
  }

  /*
   * Always make args an array.
   */
  if (!Array.isArray(args)) {
    args = String(args || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  const query = args.join(' ').trim();

  /*
   * No search term.
   */
  if (!query) {
    return (
      '🎬 *VIDEO SEARCH*\n\n' +
      'Usage:\n' +
      '*.video <video name>*\n\n' +
      'Example:\n' +
      '*.video Ghana music*'
    );
  }

  console.log(
    `🎬 Video search requested: ${query}`
  );

  /*
   * Use the existing media engine when available.
   */
  const mediaEngine =
    context?.mediaEngine ||
    context?.service?.getMediaEngine?.();

  if (
    mediaEngine &&
    typeof mediaEngine.searchVideo === 'function'
  ) {
    try {
      const result =
        await mediaEngine.searchVideo(
          query,
          context
        );

      if (result !== undefined && result !== null) {
        return result;
      }
    } catch (error) {
      console.error(
        '[Video] MediaEngine search failed:',
        error.message
      );
    }
  }

  /*
   * If the project has a video service,
   * try the common method names.
   */
  const videoService =
    context?.videoService ||
    context?.service?.videoService;

  if (videoService) {
    const methods = [
      'searchVideo',
      'search',
      'findVideo'
    ];

    for (const method of methods) {
      if (
        typeof videoService[method] !==
        'function'
      ) {
        continue;
      }

      try {
        const result =
          await videoService[method](
            query,
            context
          );

        if (
          result !== undefined &&
          result !== null
        ) {
          return result;
        }
      } catch (error) {
        console.error(
          `[Video] ${method} failed:`,
          error.message
        );
      }
    }
  }

  /*
   * Do not pretend that a video was downloaded
   * when no working provider is configured.
   */
  return (
    `🎬 *VIDEO SEARCH*\n\n` +
    `🔎 Query: *${query}*\n\n` +
    `⚠️ The video search provider is not configured yet.\n\n` +
    `Your WhatsApp command system is working correctly.`
  );
}

module.exports = {
  execute
};
