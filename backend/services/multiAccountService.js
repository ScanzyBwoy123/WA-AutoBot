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

    this.TRIAL_HOURS = 48;
    this.PAID_DAYS = 30;

    this.ensureStorage();
    this.loadAccounts();

    console.log(
      '[MultiAccountService] Multi-account service initialized'
    );
  }

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
    const normalized = this.normalizeNumber(number);

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

        this.accounts.set(
          account.phone,
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

  createAccount(phone) {
    const normalized =
      this.normalizeNumber(phone);

    if (!this.isValidPhoneNumber(normalized)) {
      return {
        success: false,
        message: 'Invalid WhatsApp phone number.'
      };
    }

    const existing =
      this.accounts.get(normalized);

    if (existing) {
      return {
        success: true,
        existing: true,
        account: existing
      };
    }

    const now = Date.now();

    const trialExpires =
      now +
      this.TRIAL_HOURS *
      60 *
      60 *
      1000;

    const account = {
      id: crypto
        .randomBytes(12)
        .toString('hex'),

      phone: normalized,

      status: 'trial',

      trialStartedAt:
        new Date(now).toISOString(),

      trialExpiresAt:
        new Date(trialExpires).toISOString(),

      paid: false,

      subscriptionStartedAt: null,

      subscriptionExpiresAt: null,

      connected: false,

      connecting: false,

      pairingCode: null,

      createdAt:
        new Date(now).toISOString(),

      updatedAt:
        new Date(now).toISOString()
    };

    this.accounts.set(
      normalized,
      account
    );

    this.saveAccounts();

    console.log(
      `🎁 New 48-hour trial created for ${normalized}`
    );

    return {
      success: true,
      existing: false,
      account
    };
  }

  getAccount(phone) {
    const normalized =
      this.normalizeNumber(phone);

    return (
      this.accounts.get(normalized) ||
      null
    );
  }

  getAllAccounts() {
    return Array.from(
      this.accounts.values()
    );
  }

  isTrialExpired(account) {
    if (!account) {
      return true;
    }

    if (account.status !== 'trial') {
      return false;
    }

    return (
      Date.now() >=
      new Date(
        account.trialExpiresAt
      ).getTime()
    );
  }

  isSubscriptionExpired(account) {
    if (!account) {
      return true;
    }

    if (
      account.status !== 'paid'
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

  checkAccount(phone) {
    const account =
      this.getAccount(phone);

    if (!account) {
      return {
        exists: false,
        active: false,
        reason: 'ACCOUNT_NOT_FOUND'
      };
    }

    if (
      account.status === 'trial' &&
      this.isTrialExpired(account)
    ) {
      account.status = 'expired';
      account.connected = false;
      account.pairingCode = null;
      account.updatedAt =
        new Date().toISOString();

      this.saveAccounts();

      return {
        exists: true,
        active: false,
        expired: true,
        reason: 'TRIAL_EXPIRED',
        account
      };
    }

    if (
      account.status === 'paid' &&
      this.isSubscriptionExpired(account)
    ) {
      account.status = 'expired';
      account.connected = false;
      account.pairingCode = null;
      account.updatedAt =
        new Date().toISOString();

      this.saveAccounts();

      return {
        exists: true,
        active: false,
        expired: true,
        reason: 'SUBSCRIPTION_EXPIRED',
        account
      };
    }

    const active =
      account.status === 'trial' ||
      account.status === 'paid';

    return {
      exists: true,
      active,
      expired: false,
      reason: active
        ? 'ACTIVE'
        : 'INACTIVE',
      account
    };
  }

  setPairingCode(phone, code) {
    const account =
      this.getAccount(phone);

    if (!account) {
      return false;
    }

    account.pairingCode =
      String(code || '');

    account.connecting = true;

    account.updatedAt =
      new Date().toISOString();

    this.saveAccounts();

    return true;
  }

  clearPairingCode(phone) {
    const account =
      this.getAccount(phone);

    if (!account) {
      return false;
    }

    account.pairingCode = null;

    account.updatedAt =
      new Date().toISOString();

    this.saveAccounts();

    return true;
  }

  setConnected(phone, connected) {
    const account =
      this.getAccount(phone);

    if (!account) {
      return false;
    }

    account.connected =
      Boolean(connected);

    account.connecting = false;

    if (connected) {
      account.pairingCode = null;
    }

    account.updatedAt =
      new Date().toISOString();

    this.saveAccounts();

    return true;
  }

  activateSubscription(
    phone,
    paymentReference
  ) {
    const account =
      this.getAccount(phone);

    if (!account) {
      return {
        success: false,
        message: 'Account not found.'
      };
    }

    const now = Date.now();

    const expires =
      now +
      this.PAID_DAYS *
      24 *
      60 *
      60 *
      1000;

    account.status = 'paid';

    account.paid = true;

    account.subscriptionStartedAt =
      new Date(now).toISOString();

    account.subscriptionExpiresAt =
      new Date(expires).toISOString();

    account.paymentReference =
      paymentReference || null;

    account.updatedAt =
      new Date().toISOString();

    this.saveAccounts();

    console.log(
      `💳 Subscription activated for ${phone}`
    );

    return {
      success: true,
      account
    };
  }

  expireAccount(phone) {
    const account =
      this.getAccount(phone);

    if (!account) {
      return false;
    }

    account.status = 'expired';

    account.connected = false;

    account.connecting = false;

    account.pairingCode = null;

    account.updatedAt =
      new Date().toISOString();

    this.saveAccounts();

    console.log(
      `⛔ Account expired: ${phone}`
    );

    return true;
  }

  removeAccount(phone) {
    const normalized =
      this.normalizeNumber(phone);

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

  getPublicAccount(phone) {
    const account =
      this.getAccount(phone);

    if (!account) {
      return null;
    }

    return {
      id: account.id,
      phone: account.phone,
      status: account.status,
      connected: account.connected,
      connecting: account.connecting,
      trialExpiresAt:
        account.trialExpiresAt,
      subscriptionExpiresAt:
        account.subscriptionExpiresAt,
      paid: account.paid,
      createdAt: account.createdAt
    };
  }

  getStats() {
    const accounts =
      this.getAllAccounts();

    return {
      total: accounts.length,

      trial: accounts.filter(
        (a) => a.status === 'trial'
      ).length,

      paid: accounts.filter(
        (a) => a.status === 'paid'
      ).length,

      expired: accounts.filter(
        (a) => a.status === 'expired'
      ).length,

      connected: accounts.filter(
        (a) => a.connected
      ).length
    };
  }
}

module.exports =
  new MultiAccountService();
