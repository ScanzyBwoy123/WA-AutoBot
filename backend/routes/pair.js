const express = require('express');

const router = express.Router();

const multiAccountService =
  require('../services/multiAccountService');

const multiAccountWhatsApp =
  require('../services/multiAccountWhatsAppService');


/*
 * Register customer and start WhatsApp pairing.
 */
router.post('/register', async (req, res) => {
  try {
    const { phone } = req.body || {};

    if (!phone) {
      return res.status(400).json({
        success: false,
        message:
          'WhatsApp phone number is required.'
      });
    }

    const result =
      multiAccountService.createAccount(
        phone
      );

    if (!result.success) {
      return res.status(400).json(
        result
      );
    }

    const normalized =
      multiAccountService.normalizeNumber(
        phone
      );

    /*
     * Start this customer's WhatsApp session.
     */
    try {
      await multiAccountWhatsApp.startAccount(
        normalized
      );
    } catch (error) {
      console.error(
        '[Pair API] WhatsApp start error:',
        error.message
      );

      /*
       * The account was still created.
       * The customer can check the pairing
       * status again.
       */
    }

    return res.json({
      success: true,

      message:
        result.existing
          ? 'Account found. Pairing has been started.'
          : '48-hour free trial created. Pairing has been started.',

      data:
        multiAccountService.getPublicAccount(
          normalized
        )
    });

  } catch (error) {
    console.error(
      '[Pair API] Register error:',
      error
    );

    return res.status(500).json({
      success: false,
      message:
        'Unable to start WhatsApp pairing.'
    });
  }
});


/*
 * Get pairing code.
 */
router.get(
  '/pairing-code/:phone',
  (req, res) => {
    try {
      const phone =
        multiAccountService.normalizeNumber(
          req.params.phone
        );

      const account =
        multiAccountService.checkAccount(
          phone
        );

      if (!account.exists) {
        return res.status(404).json({
          success: false,
          message:
            'Account not found.'
        });
      }

      if (!account.active) {
        return res.status(403).json({
          success: false,
          message:
            'Your free trial or subscription has expired.',
          data: account
        });
      }

      const pairing =
        multiAccountWhatsApp.getPairingCode(
          phone
        );

      return res.json({
        success: true,
        data: {
          phone,
          available:
            pairing.available,
          pairingCode:
            pairing.pairingCode
        }
      });

    } catch (error) {
      console.error(
        '[Pair API] Pairing code error:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to retrieve pairing code.'
      });
    }
  }
);


/*
 * Get WhatsApp connection status.
 */
router.get(
  '/status/:phone',
  (req, res) => {
    try {
      const phone =
        multiAccountService.normalizeNumber(
          req.params.phone
        );

      const account =
        multiAccountService.checkAccount(
          phone
        );

      if (!account.exists) {
        return res.status(404).json({
          success: false,
          message:
            'Account not found.'
        });
      }

      const whatsappStatus =
        multiAccountWhatsApp.getStatus(
          phone
        );

      return res.json({
        success: true,

        data: {
          account:
            multiAccountService.getPublicAccount(
              phone
            ),

          whatsapp:
            whatsappStatus
        }
      });

    } catch (error) {
      console.error(
        '[Pair API] Status error:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to check account status.'
      });
    }
  }
);


/*
 * Disconnect a customer's WhatsApp.
 */
router.post(
  '/disconnect',
  async (req, res) => {
    try {
      const { phone } =
        req.body || {};

      if (!phone) {
        return res.status(400).json({
          success: false,
          message:
            'Phone number is required.'
        });
      }

      const normalized =
        multiAccountService.normalizeNumber(
          phone
        );

      const result =
        await multiAccountWhatsApp
          .disconnectAccount(
            normalized
          );

      return res.json(result);

    } catch (error) {
      console.error(
        '[Pair API] Disconnect error:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to disconnect account.'
      });
    }
  }
);


/*
 * Development/admin statistics.
 */
router.get(
  '/stats',
  (req, res) => {
    try {
      return res.json({
        success: true,

        data: {
          accounts:
            multiAccountService.getStats(),

          whatsapp:
            multiAccountWhatsApp.getStats()
        }
      });

    } catch (error) {
      console.error(
        '[Pair API] Stats error:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to load statistics.'
      });
    }
  }
);


/*
 * Development/admin account list.
 *
 * We will protect this endpoint with
 * owner authentication before launch.
 */
router.get(
  '/accounts',
  (req, res) => {
    try {
      return res.json({
        success: true,

        data:
          multiAccountService.getAllAccounts()
      });

    } catch (error) {
      console.error(
        '[Pair API] Accounts error:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to load accounts.'
      });
    }
  }
);


module.exports = router;
