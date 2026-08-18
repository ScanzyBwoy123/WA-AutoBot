const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class MultiAccountService {
  constructor() {
    this.accounts = new Map();

    this.dataDir = path.join(
      process.cwd(),
      'multi-account-data'
    );

    this.accountsFile = path.join(
      this.dataDir,
      'accounts.json'
    );

    /*
     * Customer trial length.
     */
    this.TRIAL_HOURS = 48;

    /*
     * Paid subscription length.
     */
    this.PAID_DAYS = 30;

    this.ensureStorage();
    this.loadAccounts();

    console.log(
      '[MultiAccountService] Multi-account service initialized'
    );
  }

  /*
   * --------------------------------------------------
   * STORAGE
   * --------------------------------------------------
   */

  ensureStorage() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, {
          recursive: true
        });
      }

      if (!fs.existsSync(this.accountsFile)) {
        fs.writeFileSync(
          this.accountsFile,
          JSON.stringify([], null, 2)
        );
      }
    } catch (error) {
      console.error(
        '[MultiAccountService] Storage error:',
        error.message
      );
    }
  }

  normalizeNumber(number) {
    return String(number || '')
      .replace(/\D/g, '');
  }

  isValidPhoneNumber(number) {
    const normalized =
      this.normalizeNumber(number);

    return (
      normalized.length >= 8 &&
      normalized.length <= 15
    );
  }

  loadAccounts() {
    try {
      if (!fs.existsSync(this.accountsFile)) {
        return;
      }

      const data = JSON.parse(
        fs.readFileSync(
          this.accountsFile,
          'utf8'
        )
      );

      if (!Array.isArray(data)) {
        return;
      }

      for (const account of data) {
        if (!account.phone) {
          continue;
        }

        const phone =
          this.normalizeNumber(
            account.phone
          );

        account.phone = phone;

        this.accounts.set(
          phone,
          account
        );
      }

      console.log(
        `[MultiAccountService] Loaded ${this.accounts.size} account(s)`
      );
    } catch (error) {
      console.error(
        '[MultiAccountService] Failed to load accounts:',
        error.message
      );
    }
  }

  saveAccounts() {
    try {
      fs.writeFileSync(
        this.accountsFile,
        JSON.stringify(
          Array.from(
            this.accounts.values()
          ),
          null,
          2
        )
      );
    } catch (error) {
      console.error(
        '[MultiAccountService] Failed to save accounts:',
        error.message
      );
    }
  }

  /*
   * --------------------------------------------------
   * ACCOUNT CREATION
   * --------------------------------------------------
   */

  createAccount(phone) {
    const normalized =
      this.normalizeNumber(phone);

    if (
      !this.isValidPhoneNumber(
        normalized
      )
    ) {
      return {
        success: false,
        message:
          'Invalid WhatsApp phone number.'
      };
    }

    const existing =
      this.accounts.get(
        normalized
      );

    if (existing) {

      /*
       * If an old trial has already expired,
       * report it as expired instead of
       * silently giving another trial.
       */
      this.checkAccount(
        normalized
      );

      return {
        success: true,
        existing: true,
        account: existing
      };
    }

    const now =
      Date.now();

    const trialExpires =
      now +
      this.TRIAL_HOURS *
      60 *
      60 *
      1000;

    const account = {

      id:
        crypto
          .randomBytes(12)
          .toString('hex'),

      phone:
        normalized,

      status:
        'trial',

      trialStartedAt:
        new Date(now)
          .toISOString(),

      trialExpiresAt:
        new Date(trialExpires)
          .toISOString(),

      paid:
        false,

      subscriptionStartedAt:
        null,

      subscriptionExpiresAt:
        null,

      paymentReference:
        null,

      connected:
        false,

      connecting:
        false,

      pairingCode:
        null,

      createdAt:
        new Date(now)
          .toISOString(),

      updatedAt:
        new Date(now)
          .toISOString()
    };

    this.accounts.set(
      normalized,
      account
    );

    this.saveAccounts();

    console.log(
      `🎁 New ${this.TRIAL_HOURS}-hour trial created for ${normalized}`
    );

    return {
      success: true,
      existing: false,
      account
    };
  }

  /*
   * --------------------------------------------------
   * ACCOUNT LOOKUP
   * --------------------------------------------------
   */

  getAccount(phone) {
    const normalized =
      this.normalizeNumber(
        phone
      );

    return (
      this.accounts.get(
        normalized
      ) || null
    );
  }

  getAllAccounts() {
    return Array.from(
      this.accounts.values()
    );
  }

  /*
   * --------------------------------------------------
   * EXPIRY CHECKS
   * --------------------------------------------------
   */

  isTrialExpired(account) {
    if (!account) {
      return true;
    }

    if (
      account.status !==
      'trial'
    ) {
      return false;
    }

    if (
      !account.trialExpiresAt
    ) {
      return true;
    }

    return (
      Date.now() >=
      new Date(
        account.trialExpiresAt
      ).getTime()
    );
  }

  isSubscriptionExpired(
    account
  ) {
    if (!account) {
      return true;
    }

    if (
      account.status !==
      'paid'
    ) {
      return false;
    }

    if (
      !account.subscriptionExpiresAt
    ) {
      return true;
    }

    return (
      Date.now() >=
      new Date(
        account.subscriptionExpiresAt
      ).getTime()
    );
  }

  /*
   * Return remaining trial/subscription
   * time in milliseconds.
   */
  getRemainingTime(account) {
    if (!account) {
      return 0;
    }

    let expiresAt = null;

    if (
      account.status ===
      'trial'
    ) {
      expiresAt =
        account.trialExpiresAt;
    }

    if (
      account.status ===
      'paid'
    ) {
      expiresAt =
        account.subscriptionExpiresAt;
    }

    if (!expiresAt) {
      return 0;
    }

    const remaining =
      new Date(
        expiresAt
      ).getTime() -
      Date.now();

    return Math.max(
      0,
      remaining
    );
  }

  /*
   * Human-readable remaining time.
   */
  getRemainingTimeText(
    account
  ) {
    const remaining =
      this.getRemainingTime(
        account
      );

    if (
      remaining <= 0
    ) {
      return 'Expired';
    }

    const totalSeconds =
      Math.floor(
        remaining / 1000
      );

    const days =
      Math.floor(
        totalSeconds /
        86400
      );

    const hours =
      Math.floor(
        (totalSeconds %
          86400) /
        3600
      );

    const minutes =
      Math.floor(
        (totalSeconds %
          3600) /
        60
      );

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    }

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }

    return `${minutes}m`;
  }

  /*
   * --------------------------------------------------
   * ACCOUNT STATUS
   * --------------------------------------------------
   */

  checkAccount(phone) {
    const account =
      this.getAccount(
        phone
      );

    if (!account) {
      return {
        exists: false,
        active: false,
        expired: false,
        reason:
          'ACCOUNT_NOT_FOUND'
      };
    }

    /*
     * Trial expired.
     */
    if (
      account.status ===
        'trial' &&
      this.isTrialExpired(
        account
      )
    ) {
      this.markExpired(
        account,
        'TRIAL_EXPIRED'
      );

      return {
        exists: true,
        active: false,
        expired: true,
        reason:
          'TRIAL_EXPIRED',
        account
      };
    }

    /*
     * Paid subscription expired.
     */
    if (
      account.status ===
        'paid' &&
      this.isSubscriptionExpired(
        account
      )
    ) {
      this.markExpired(
        account,
        'SUBSCRIPTION_EXPIRED'
      );

      return {
        exists: true,
        active: false,
        expired: true,
        reason:
          'SUBSCRIPTION_EXPIRED',
        account
      };
    }

    const active =
      account.status ===
        'trial' ||
      account.status ===
        'paid';

    return {
      exists: true,

      active,

      expired:
        !active,

      reason:
        active
          ? 'ACTIVE'
          : 'INACTIVE',

      remainingTime:
        this.getRemainingTimeText(
          account
        ),

      account
    };
  }

  /*
   * --------------------------------------------------
   * ACCESS CONTROL
   * --------------------------------------------------
   */

  isAccountActive(phone) {
    const result =
      this.checkAccount(
        phone
      );

    return (
      result.exists &&
      result.active
    );
  }

  getAccountAccess(phone) {
    const result =
      this.checkAccount(
        phone
      );

    if (
      !result.exists
    ) {
      return {
        allowed: false,
        reason:
          'ACCOUNT_NOT_FOUND',
        message:
          'Account not found.'
      };
    }

    if (
      !result.active
    ) {
      if (
        result.reason ===
        'TRIAL_EXPIRED'
      ) {
        return {
          allowed: false,
          reason:
            'TRIAL_EXPIRED',
          message:
            'Your 48-hour free trial has expired. Please subscribe to continue.'
        };
      }

      if (
        result.reason ===
        'SUBSCRIPTION_EXPIRED'
      ) {
        return {
          allowed: false,
          reason:
            'SUBSCRIPTION_EXPIRED',
          message:
            'Your subscription has expired. Please renew to continue.'
        };
      }

      return {
        allowed: false,
        reason:
          'INACTIVE',
        message:
          'Your account is inactive.'
      };
    }

    return {
      allowed: true,

      reason:
        result.account.status ===
        'paid'
          ? 'PAID'
          : 'TRIAL',

      message:
        result.account.status ===
        'paid'
          ? 'Active subscription.'
          : 'Free trial active.',

      remainingTime:
        this.getRemainingTimeText(
          result.account
        ),

      account:
        result.account
    };
  }

  /*
   * --------------------------------------------------
   * EXPIRATION
   * --------------------------------------------------
   */

  markExpired(
    account,
    reason
  ) {
    account.status =
      'expired';

    account.connected =
      false;

    account.connecting =
      false;

    account.pairingCode =
      null;

    account.expiredReason =
      reason || 'EXPIRED';

    account.expiredAt =
      new Date()
        .toISOString();

    account.updatedAt =
      new Date()
        .toISOString();

    this.saveAccounts();

    console.log(
      `⛔ Account expired: ${account.phone} (${account.expiredReason})`
    );

    return account;
  }

  expireAccount(phone) {
    const account =
      this.getAccount(
        phone
      );

    if (!account) {
      return false;
    }

    this.markExpired(
      account,
      'MANUAL_EXPIRATION'
    );

    return true;
  }

  /*
   * --------------------------------------------------
   * PAIRING
   * --------------------------------------------------
   */

  setPairingCode(
    phone,
    code
  ) {
    const account =
      this.getAccount(
        phone
      );

    if (!account) {
      return false;
    }

    /*
     * Never create a pairing code
     * for an expired account.
     */
    if (
      !this.isAccountActive(
        phone
      )
    ) {
      return false;
    }

    account.pairingCode =
      String(code || '');

    account.connecting =
      true;

    account.updatedAt =
      new Date()
        .toISOString();

    this.saveAccounts();

    return true;
  }

  clearPairingCode(
    phone
  ) {
    const account =
      this.getAccount(
        phone
      );

    if (!account) {
      return false;
    }

    account.pairingCode =
      null;

    account.updatedAt =
      new Date()
        .toISOString();

    this.saveAccounts();

    return true;
  }

  setConnected(
    phone,
    connected
  ) {
    const account =
      this.getAccount(
        phone
      );

    if (!account) {
      return false;
    }

    /*
     * Do not allow an expired
     * account to remain connected.
     */
    if (
      connected &&
      !this.isAccountActive(
        phone
      )
    ) {
      account.connected =
        false;

      account.connecting =
        false;

      account.pairingCode =
        null;

      account.updatedAt =
        new Date()
          .toISOString();

      this.saveAccounts();

      return false;
    }

    account.connected =
      Boolean(
        connected
      );

    account.connecting =
      false;

    if (connected) {
      account.pairingCode =
        null;
    }

    account.updatedAt =
      new Date()
        .toISOString();

    this.saveAccounts();

    return true;
  }

  /*
   * --------------------------------------------------
   * PAYMENTS / SUBSCRIPTIONS
   * --------------------------------------------------
   */

  activateSubscription(
    phone,
    paymentReference
  ) {
    const account =
      this.getAccount(
        phone
      );

    if (!account) {
      return {
        success: false,
        message:
          'Account not found.'
      };
    }

    const now =
      Date.now();

    /*
     * If the customer renews before
     * expiry, extend from the current
     * expiration date.
     */
    let startTime =
      now;

    if (
      account.status ===
        'paid' &&
      account.subscriptionExpiresAt
    ) {
      const currentExpiry =
        new Date(
          account.subscriptionExpiresAt
        ).getTime();

      if (
        currentExpiry > now
      ) {
        startTime =
          currentExpiry;
      }
    }

    const expires =
      startTime +
      this.PAID_DAYS *
      24 *
      60 *
      60 *
      1000;

    account.status =
      'paid';

    account.paid =
      true;

    account.subscriptionStartedAt =
      new Date(
        now
      ).toISOString();

    account.subscriptionExpiresAt =
      new Date(
        expires
      ).toISOString();

    account.paymentReference =
      paymentReference ||
      null;

    account.expiredReason =
      null;

    account.expiredAt =
      null;

    account.updatedAt =
      new Date()
        .toISOString();

    this.saveAccounts();

    console.log(
      `💳 Subscription activated for ${phone}`
    );

    return {
      success: true,
      account
    };
  }

  /*
   * --------------------------------------------------
   * USER MANAGEMENT
   * --------------------------------------------------
   */

  removeAccount(phone) {
    const normalized =
      this.normalizeNumber(
        phone
      );

    const deleted =
      this.accounts.delete(
        normalized
      );

    if (deleted) {
      this.saveAccounts();

      console.log(
        `🗑️ Account removed: ${normalized}`
      );
    }

    return deleted;
  }

  /*
   * --------------------------------------------------
   * PUBLIC ACCOUNT DATA
   * --------------------------------------------------
   */

  getPublicAccount(
    phone
  ) {
    const account =
      this.getAccount(
        phone
      );

    if (!account) {
      return null;
    }

    return {
      id:
        account.id,

      phone:
        account.phone,

      status:
        account.status,

      connected:
        account.connected,

      connecting:
        account.connecting,

      trialStartedAt:
        account.trialStartedAt,

      trialExpiresAt:
        account.trialExpiresAt,

      subscriptionStartedAt:
        account.subscriptionStartedAt,

      subscriptionExpiresAt:
        account.subscriptionExpiresAt,

      remainingTime:
        this.getRemainingTimeText(
          account
        ),

      paid:
        account.paid,

      expiredReason:
        account.expiredReason ||
        null,

      createdAt:
        account.createdAt
    };
  }

  /*
   * --------------------------------------------------
   * STATISTICS
   * --------------------------------------------------
   */

  getStats() {
    const accounts =
      this.getAllAccounts();

    /*
     * Check expiration before
     * calculating statistics.
     */
    for (
      const account of accounts
    ) {
      if (
        account.status ===
          'trial' &&
        this.isTrialExpired(
          account
        )
      ) {
        this.markExpired(
          account,
          'TRIAL_EXPIRED'
        );
      }

      if (
        account.status ===
          'paid' &&
        this.isSubscriptionExpired(
          account
        )
      ) {
        this.markExpired(
          account,
          'SUBSCRIPTION_EXPIRED'
        );
      }
    }

    const updatedAccounts =
      this.getAllAccounts();

    return {
      total:
        updatedAccounts.length,

      trial:
        updatedAccounts.filter(
          (a) =>
            a.status ===
            'trial'
        ).length,

      paid:
        updatedAccounts.filter(
          (a) =>
            a.status ===
            'paid'
        ).length,

      expired:
        updatedAccounts.filter(
          (a) =>
            a.status ===
            'expired'
        ).length,

      connected:
        updatedAccounts.filter(
          (a) =>
            a.connected
        ).length
    };
  }
}

module.exports =
  new MultiAccountService();
