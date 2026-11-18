const express = require('express');

const router = express.Router();

const multiAccountService =
  require('../services/multiAccountService');

const multiAccountWhatsApp =
  require('../services/multiAccountWhatsAppService');

/*
 * TEMPORARILY PAUSE NEW REGISTRATIONS.
 * Registration will reopen after trial and
 * browser startup corrections are complete.
 */
router.post('/register', (req, res) => {
  return res.status(503).json({
    success: false,
    paused: true,
    message:
      'New registrations are temporarily paused while WA-AutoBot is being tested.'
  });
});

/*
 * Get pairing code.
 */
router.get('/pairing-code/:phone', (req, res) => {
  try {
    const phone =
      multiAccountService.normalizeNumber(
        req.params.phone
      );

    const account =
      multiAccountService.checkAccount(phone);

    if (!account.exists) {
      return res.status(404).json({
        success: false,
        message: 'Account not found.'
      });
    }

    if (!account.active) {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive.',
        data: account
      });
    }

    const pairing =
      multiAccountWhatsApp.getPairingCode(phone);

    return res.json({
      success: true,
      data: {
        phone,
        available: pairing.available,
        pairingCode: pairing.pairingCode
      }
    });

  } catch (error) {
    console.error(
      '[Pair API] Pairing code error:',
      error?.stack || error
    );

    return res.status(500).json({
      success: false,
      message: 'Unable to retrieve pairing code.'
    });
  }
});

/*
 * Get WhatsApp connection status.
 */
router.get('/status/:phone', (req, res) => {
  try {
    const phone =
      multiAccountService.normalizeNumber(
        req.params.phone
      );

    const account =
      multiAccountService.checkAccount(phone);

    if (!account.exists) {
      return res.status(404).json({
        success: false,
        message: 'Account not found.'
      });
    }

    const whatsappStatus =
      multiAccountWhatsApp.getStatus(phone);

    return res.json({
      success: true,
      data: {
        account:
          multiAccountService.getPublicAccount(phone),
        whatsapp: whatsappStatus
      }
    });

  } catch (error) {
    console.error(
      '[Pair API] Status error:',
      error?.stack || error
    );

    return res.status(500).json({
      success: false,
      message: 'Unable to check account status.'
    });
  }
});

/*
 * Disconnect a WhatsApp account.
 */
router.post('/disconnect', async (req, res) => {
  try {
    const { phone } = req.body || {};

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required.'
      });
    }

    const normalized =
      multiAccountService.normalizeNumber(phone);

    const result =
      await multiAccountWhatsApp.disconnectAccount(
        normalized
      );

    return res.json(result);

  } catch (error) {
    console.error(
      '[Pair API] Disconnect error:',
      error?.stack || error
    );

    return res.status(500).json({
      success: false,
      message: 'Unable to disconnect account.'
    });
  }
});

/*
 * Development statistics.
 */
router.get('/stats', (req, res) => {
  try {
    return res.json({
      success: true,
      data: {
        accounts: multiAccountService.getStats(),
        whatsapp: multiAccountWhatsApp.getStats()
      }
    });

  } catch (error) {
    console.error(
      '[Pair API] Stats error:',
      error?.stack || error
    );

    return res.status(500).json({
      success: false,
      message: 'Unable to load statistics.'
    });
  }
});

/*
 * Development account list.
 */
router.get('/accounts', (req, res) => {
  try {
    return res.json({
      success: true,
      data: multiAccountService.getAllAccounts()
    });

  } catch (error) {
    console.error(
      '[Pair API] Accounts error:',
      error?.stack || error
    );

    return res.status(500).json({
      success: false,
      message: 'Unable to load accounts.'
    });
  }
});

module.exports = router;
