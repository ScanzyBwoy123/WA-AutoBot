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

    if (!Array.isArray(accounts) || accounts.length === 0) {
      console.log(
        '[Startup] No saved WhatsApp accounts found.'
      );
      return;
    }

    let started = 0;
    let skipped = 0;

    for (const account of accounts) {
      try {
        const phone =
          multiAccountService.normalizeNumber(
            account.phone
          );

        if (!phone) {
          skipped++;
          continue;
        }

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

        await multiAccountWhatsApp.startAccount(
          phone
        );

        started++;

      } catch (error) {
        console.error(
          `[Startup] Failed restoring account ${account.phone}:`,
          error.message
        );
      }
    }

    console.log(
      `[Startup] Account restoration complete. Started: ${started}, Skipped: ${skipped}`
    );

  } catch (error) {
    console.error(
      '[Startup] Account restoration failed:',
      error
    );
  }
}


/*
|--------------------------------------------------------------------------
| STARTUP
|--------------------------------------------------------------------------
|
| IMPORTANT:
| Call restoreWhatsAppAccounts() AFTER your
| Express server has been created/configured.
|
|--------------------------------------------------------------------------
*/

restoreWhatsAppAccounts().catch(
  error => {
    console.error(
      '[Startup] WhatsApp restoration error:',
      error
    );
  }
);
