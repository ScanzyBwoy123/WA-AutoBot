'use strict';

/*
|--------------------------------------------------------------------------
| WA-AutoBot BACKEND SERVER
|--------------------------------------------------------------------------
| Render-compatible entry point.
|
| IMPORTANT:
| 1. HTTP server starts first.
| 2. WhatsApp restoration runs in the background.
| 3. WhatsApp errors cannot terminate the HTTP server.
|--------------------------------------------------------------------------
*/

const express = require('express');

const multiAccountService =
  require('./services/multiAccountService');

const multiAccountWhatsApp =
  require('./services/multiAccountWhatsAppService');


/*
|--------------------------------------------------------------------------
| EXPRESS APPLICATION
|--------------------------------------------------------------------------
*/

const app = express();

app.use(express.json({
  limit: '10mb'
}));
const path = require('path');

const pairRouter =
  require('./routes/pair');

const frontendDir =
  path.join(__dirname, '..', 'frontend');

app.use(express.static(frontendDir));

app.get('/pair', (req, res) => {
  res.sendFile(
    path.join(frontendDir, 'pair.html')
  );
});

app.use('/api/pair', pairRouter);
app.use(express.urlencoded({
  extended: true,
  limit: '10mb'
}));


/*
|--------------------------------------------------------------------------
| BASIC HEALTH ROUTE
|--------------------------------------------------------------------------
*/

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    name: 'WA-AutoBot',
    status: 'online',
    service: 'backend',
    architecture: 'multi-account',
    timestamp: new Date().toISOString()
  });
});


/*
|--------------------------------------------------------------------------
| HEALTH CHECK
|--------------------------------------------------------------------------
*/

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    uptimeSeconds: Math.floor(
      process.uptime()
    ),
    timestamp: new Date().toISOString()
  });
});


/*
|--------------------------------------------------------------------------
| MULTI-ACCOUNT STATUS
|--------------------------------------------------------------------------
*/

app.get('/api/accounts', (req, res) => {
  try {
    const accounts =
      multiAccountService.getAllAccounts();

    res.status(200).json({
      success: true,
      data: accounts
    });

  } catch (error) {
    console.error(
      '[API] Failed to get accounts:',
      error
    );

    res.status(500).json({
      success: false,
      error: error?.message ||
        'Failed to get accounts'
    });
  }
});


/*
|--------------------------------------------------------------------------
| ACCOUNT STATUS
|--------------------------------------------------------------------------
*/

app.get('/api/account/:phone', (req, res) => {
  try {
    const phone =
      multiAccountService.normalizeNumber(
        req.params.phone
      );

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number'
      });
    }

    const account =
      multiAccountService.getPublicAccount(
        phone
      );

    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Account not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: account
    });

  } catch (error) {
    console.error(
      '[API] Account status error:',
      error
    );

    return res.status(500).json({
      success: false,
      error: error?.message ||
        'Failed to get account'
    });
  }
});


/*
|--------------------------------------------------------------------------
| ACCOUNT STATISTICS
|--------------------------------------------------------------------------
*/

app.get('/api/stats', (req, res) => {
  try {
    const stats =
      multiAccountService.getStats();

    res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error(
      '[API] Stats error:',
      error
    );

    res.status(500).json({
      success: false,
      error: error?.message ||
        'Failed to get statistics'
    });
  }
});


/*
|--------------------------------------------------------------------------
| START ACCOUNT
|--------------------------------------------------------------------------
*/

app.post('/api/accounts/:phone/start', async (req, res) => {
  try {
    const phone =
      multiAccountService.normalizeNumber(
        req.params.phone
      );

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number'
      });
    }

    const access =
      multiAccountService.getAccountAccess(
        phone
      );

    if (!access.allowed) {
      return res.status(403).json({
        success: false,
        error: access.message,
        reason: access.reason
      });
    }

    const result =
      await multiAccountWhatsApp.startAccount(
        phone
      );

    return res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error(
      '[API] Start account error:',
      error
    );

    return res.status(500).json({
      success: false,
      error: error?.message ||
        'Failed to start account'
    });
  }
});


/*
|--------------------------------------------------------------------------
| DISCONNECT ACCOUNT
|--------------------------------------------------------------------------
*/

app.post('/api/accounts/:phone/disconnect', async (req, res) => {
  try {
    const phone =
      multiAccountService.normalizeNumber(
        req.params.phone
      );

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number'
      });
    }

    if (
      typeof multiAccountWhatsApp.disconnectAccount !==
      'function'
    ) {
      return res.status(501).json({
        success: false,
        error:
          'Disconnect operation is not available'
      });
    }

    const result =
      await multiAccountWhatsApp.disconnectAccount(
        phone
      );

    return res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error(
      '[API] Disconnect account error:',
      error
    );

    return res.status(500).json({
      success: false,
      error: error?.message ||
        'Failed to disconnect account'
    });
  }
});


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

    return {
      started: 0,
      skipped: 0,
      error:
        error?.message ||
        'Unknown error'
    };
  }
}


/*
|--------------------------------------------------------------------------
| START HTTP SERVER
|--------------------------------------------------------------------------
|
| THIS IS THE CRITICAL FIX.
|
| Render requires the application to keep an HTTP
| server listening on process.env.PORT.
|--------------------------------------------------------------------------
*/

const PORT =
  Number(process.env.PORT) || 3000;

const HOST =
  '0.0.0.0';

const server =
  app.listen(
    PORT,
    HOST,
    () => {
      console.log(
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
      );

      console.log(
        '🚀 WA-AutoBot backend is ONLINE'
      );

      console.log(
        `🌐 Listening on ${HOST}:${PORT}`
      );

      console.log(
        `📡 Environment: ${
          process.env.NODE_ENV ||
          'production'
        }`
      );

      console.log(
        '🏗️ Architecture: Multi-account'
      );

      console.log(
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
      );

      /*
       * IMPORTANT:
       * Start WhatsApp restoration ONLY
       * after the HTTP server is listening.
       */
      setImmediate(() => {
        restoreWhatsAppAccounts()
          .then(result => {
            console.log(
              '[Startup] WhatsApp restoration finished:',
              result
            );
          })
          .catch(error => {
            console.error(
              '[Startup] WhatsApp restoration crashed:',
              error?.stack ||
              error?.message ||
              error
            );
          });
      });
    }
  );


/*
|--------------------------------------------------------------------------
| SERVER ERROR HANDLING
|--------------------------------------------------------------------------
*/

server.on('error', error => {
  console.error(
    '[Server] HTTP server error:',
    error
  );

  /*
   * Do not silently ignore the error.
   * But do not allow a WhatsApp error to
   * reach this handler either.
   */
});


/*
|--------------------------------------------------------------------------
| GRACEFUL SHUTDOWN
|--------------------------------------------------------------------------
*/

async function shutdown(signal) {
  console.log(
    `[Shutdown] Received ${signal}. Shutting down...`
  );

  try {
    if (
      typeof multiAccountWhatsApp.shutdown ===
      'function'
    ) {
      await multiAccountWhatsApp.shutdown();
    } else if (
      typeof multiAccountWhatsApp.disconnectAll ===
      'function'
    ) {
      await multiAccountWhatsApp.disconnectAll();
    }
  } catch (error) {
    console.error(
      '[Shutdown] WhatsApp shutdown error:',
      error
    );
  }

  server.close(() => {
    console.log(
      '[Shutdown] HTTP server closed.'
    );

    process.exit(0);
  });

  /*
   * Safety timeout.
   */
  setTimeout(() => {
    console.error(
      '[Shutdown] Forced shutdown.'
    );

    process.exit(1);
  }, 10000).unref();
}


process.on(
  'SIGTERM',
  () => shutdown('SIGTERM')
);

process.on(
  'SIGINT',
  () => shutdown('SIGINT')
);


/*
|--------------------------------------------------------------------------
| UNHANDLED ERROR PROTECTION
|--------------------------------------------------------------------------
*/

process.on(
  'unhandledRejection',
  error => {
    console.error(
      '[Process] Unhandled promise rejection:',
      error
    );

    /*
     * IMPORTANT:
     * Do NOT call process.exit().
     *
     * Render must keep the HTTP server alive.
     */
  }
);

process.on(
  'uncaughtException',
  error => {
    console.error(
      '[Process] Uncaught exception:',
      error
    );

    /*
     * Do not intentionally terminate the process here.
     * The server should remain available whenever possible.
     */
  }
);


/*
|--------------------------------------------------------------------------
| PUBLIC API
|--------------------------------------------------------------------------
*/

module.exports = {
  app,
  server,
  restoreWhatsAppAccounts
};
