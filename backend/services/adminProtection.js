'use strict';

const fs = require('fs');
const path = require('path');

class AdminProtection {
  constructor() {
    this.dataDir = path.join(
      process.cwd(),
      'multi-account-data'
    );

    this.dataFile = path.join(
      this.dataDir,
      'admin-warnings.json'
    );

    this.defaultLimit = 2;

    this.insults = new Set([
      'fool',
      'idiot',
      'stupid',
      'moron',
      'imbecile',
      'dumbass',
      'bastard',
      'asshole',
      'fuck you',
      'fucking idiot',
      'son of a bitch',
      'mumu',
      'kwasia'
    ]);

    this.ensureStorage();
    this.warnings = this.load();
  }

  ensureStorage() {
    try {
      fs.mkdirSync(
        this.dataDir,
        { recursive: true }
      );

      if (!fs.existsSync(this.dataFile)) {
        fs.writeFileSync(
          this.dataFile,
          JSON.stringify({}, null, 2)
        );
      }
    } catch (error) {
      console.error(
        '[AdminProtection] Storage error:',
        error.message
      );
    }
  }

  load() {
    try {
      const data = JSON.parse(
        fs.readFileSync(
          this.dataFile,
          'utf8'
        )
      );

      return (
        data &&
        typeof data === 'object'
      )
        ? data
        : {};
    } catch (error) {
      console.error(
        '[AdminProtection] Load error:',
        error.message
      );

      return {};
    }
  }

  save() {
    try {
      this.ensureStorage();

      fs.writeFileSync(
        this.dataFile,
        JSON.stringify(
          this.warnings,
          null,
          2
        )
      );
    } catch (error) {
      console.error(
        '[AdminProtection] Save error:',
        error.message
      );
    }
  }

  normalize(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[^a-z0-9@'\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  numberFromJid(jid) {
    return String(jid || '')
      .split('@')[0]
      .replace(/\D/g, '');
  }

  isSameIdentity(a, b) {
    const left =
      this.numberFromJid(a);

    const right =
      this.numberFromJid(b);

    return Boolean(
      left &&
      right &&
      left === right
    );
  }

  containsInsult(text) {
    const normalized =
      this.normalize(text);

    if (!normalized) {
      return false;
    }

    for (const insult of this.insults) {
      if (
        normalized === insult ||
        normalized.includes(
          ` ${insult} `
        )
      ) {
        return true;
      }

      if (
        insult.includes(' ') &&
        normalized.includes(insult)
      ) {
        return true;
      }
    }

    return false;
  }

  getKey(phone, sender) {
    return (
      `${this.numberFromJid(phone)}:` +
      `${this.numberFromJid(sender)}`
    );
  }

  getCount(phone, sender) {
    return Number(
      this.warnings[
        this.getKey(phone, sender)
      ] || 0
    );
  }

  increment(phone, sender) {
    const key =
      this.getKey(
        phone,
        sender
      );

    const count =
      this.getCount(
        phone,
        sender
      ) + 1;

    this.warnings[key] = count;

    this.save();

    return count;
  }

  reset(phone, sender) {
    delete this.warnings[
      this.getKey(
        phone,
        sender
      )
    ];

    this.save();
  }

  getLimit() {
    const value =
      Number(
        process.env.ADMIN_WARNING_LIMIT ||
        this.defaultLimit
      );

    return (
      Number.isFinite(value) &&
      value > 0
    )
      ? Math.floor(value)
      : this.defaultLimit;
  }

  async handle({
    client,
    message,
    phone,
    ownerJid,
    enabled = true,
    autoBlock = true
  }) {
    if (
      !enabled ||
      !client ||
      !message
    ) {
      return {
        handled: false,
        reason: 'DISABLED'
      };
    }

    const sender =
      message.author ||
      message.from ||
      '';

    const text =
      message.body || '';

    if (
      !sender ||
      !text ||
      message.fromMe === true
    ) {
      return {
        handled: false,
        reason: 'NOT_APPLICABLE'
      };
    }

    if (
      this.isSameIdentity(
        sender,
        ownerJid
      )
    ) {
      return {
        handled: false,
        reason: 'OWNER'
      };
    }

    if (
      !this.containsInsult(text)
    ) {
      return {
        handled: false,
        reason: 'NO_INSULT'
      };
    }

    const count =
      this.increment(
        phone,
        sender
      );

    const limit =
      this.getLimit();

    if (
      autoBlock &&
      count >= limit
    ) {
      try {
        const contact =
          await client.getContactById(
            sender
          );

        if (
          contact &&
          typeof contact.block ===
            'function'
        ) {
          await contact.block();
        }
      } catch (error) {
        console.error(
          '[AdminProtection] Block failed:',
          error.message
        );
      }

      await this.safeReply(
        message,
        '🚫 You have been blocked for repeated insults or disrespect toward the admin.'
      );

      this.reset(
        phone,
        sender
      );

      console.log(
        `[AdminProtection] ${sender} blocked after ${count} warning(s) for ${phone}`
      );

      return {
        handled: true,
        action: 'BLOCKED',
        count,
        limit
      };
    }

    const remaining =
      Math.max(
        0,
        limit - count
      );

    await this.safeReply(
      message,
      `⚠️ Admin Protection Warning ${count}/${limit}\n\nPlease do not insult or disrespect the admin. Further violations may result in an automatic block.\nWarnings remaining: ${remaining}`
    );

    console.log(
      `[AdminProtection] Warning ${count}/${limit} for ${sender} on ${phone}`
    );

    return {
      handled: true,
      action: 'WARNED',
      count,
      limit
    };
  }

  async safeReply(
    message,
    text
  ) {
    try {
      if (
        typeof message.reply ===
        'function'
      ) {
        await message.reply(
          text
        );

        return true;
      }
    } catch (error) {
      console.error(
        '[AdminProtection] Reply failed:',
        error.message
      );
    }

    return false;
  }
}

module.exports =
  new AdminProtection();
