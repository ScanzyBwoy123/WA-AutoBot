/*
|--------------------------------------------------------------------------
| MULTI-ACCOUNT ARCHITECTURE
|--------------------------------------------------------------------------
*/

const multiAccountService =
  require('./services/multiAccountService');

const multiAccountWhatsApp =
  require('./services/multiAccountWhatsAppService');


/*
|--------------------------------------------------------------------------
| RESTORE ACTIVE WHATSAPP ACCOUNTS
|--------------------------------------------------------------------------
*/

async function restoreWhatsAppAccounts() {
  try {
    console.log(
      '[Startup] Restoring active WhatsApp accounts...'
    );

    const accounts =
      multiAccountService.getAllAccounts();

    if (
      !Array.isArray(accounts) ||
      accounts.length === 0
    ) {
      console.log(
        '[Startup] No saved WhatsApp accounts found.'
      );

      return {
        started: 0,
        skipped: 0
      };
    }

    let started = 0;
    let skipped = 0;

    for (const account of accounts) {
      const phone =
        multiAccountService.normalizeNumber(
          account.phone
        );

      if (!phone) {
        skipped++;
        continue;
      }

      try {
        /*
         * Check trial/subscription access
         * before starting WhatsApp.
         */
        const access =
          multiAccountService.getAccountAccess(
            phone
          );

        if (!access.allowed) {
          console.log(
            `[Startup] Skipping ${phone}: ${access.reason}`
          );

          skipped++;
          continue;
        }

        console.log(
          `[Startup] Starting WhatsApp account: ${phone}`
        );

        /*
         * IMPORTANT:
         * Do not allow one broken account
         * to stop the entire server.
         */
        await multiAccountWhatsApp.startAccount(
          phone
        );

        started++;

        console.log(
          `[Startup] WhatsApp account started: ${phone}`
        );

      } catch (error) {
        skipped++;

        console.error(
          `[Startup] Failed restoring account ${phone}:`,
          error?.stack ||
          error?.message ||
          error
        );
      }
    }

    console.log(
      `[Startup] Account restoration complete. Started: ${started}, Skipped: ${skipped}`
    );

    return {
      started,
      skipped
    };

  } catch (error) {
    console.error(
      '[Startup] Account restoration failed:',
      error?.stack ||
      error?.message ||
      error
    );

    /*
     * Do NOT throw here.
     *
     * The HTTP server must remain alive even
     * if WhatsApp restoration fails.
     */
    return {
      started: 0,
      skipped: 0,
      error: error?.message || 'Unknown error'
    };
  }
}


/*
|--------------------------------------------------------------------------
| START WHATSAPP RESTORATION
|--------------------------------------------------------------------------
|
| IMPORTANT:
| This runs in the background.
|
| It must NEVER prevent the HTTP server
| from staying alive.
|--------------------------------------------------------------------------
*/

function startWhatsAppRestoration() {
  setImmediate(() => {
    restoreWhatsAppAccounts()
      .then(result => {
        console.log(
          '[Startup] WhatsApp restoration finished:',
          result
        );
      })
      .catch(error => {
        /*
         * Final safety net.
         *
         * Never allow WhatsApp startup errors
         * to terminate Node.js.
         */
        console.error(
          '[Startup] WhatsApp restoration crashed:',
          error?.stack ||
          error?.message ||
          error
        );
      });
  });
}


/*
|--------------------------------------------------------------------------
| PUBLIC EXPORT
|--------------------------------------------------------------------------
*/

module.exports = {
  restoreWhatsAppAccounts,
  startWhatsAppRestoration
};
