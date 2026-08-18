const express = require('express');

const router = express.Router();

const multiAccountService =
  require('../services/multiAccountService');

/*
 * Create or retrieve a customer's account.
 *
 * This does NOT connect WhatsApp yet.
 * It only creates the customer's 48-hour trial
 * account and prepares the account for pairing.
 */
router.post('/register', (req, res) => {
  try {
    const { phone } = req.body || {};

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'WhatsApp phone number is required.'
      });
    }

    const result =
      multiAccountService.createAccount(phone);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json({
      success: true,
      message: result.existing
        ? 'Account already exists.'
        : '48-hour free trial created.',
      data:
        multiAccountService.getPublicAccount(
          phone
        )
    });
  } catch (error) {
    console.error(
      '[Pair API] Register error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Unable to create account.'
    });
  }
});

/*
 * Check account/trial/subscription status.
 */
router.get('/status/:phone', (req, res) => {
  try {
    const result =
      multiAccountService.checkAccount(
        req.params.phone
      );

    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error(
      '[Pair API] Status error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Unable to check account status.'
    });
  }
});

/*
 * Return all customer accounts.
 *
 * This endpoint is temporary for development.
 * We will protect it with owner authentication
 * before launch.
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
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Unable to load accounts.'
    });
  }
});

/*
 * Return service statistics.
 */
router.get('/stats', (req, res) => {
  try {
    return res.json({
      success: true,
      data: multiAccountService.getStats()
    });
  } catch (error) {
    console.error(
      '[Pair API] Stats error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Unable to load statistics.'
    });
  }
});

module.exports = router;
