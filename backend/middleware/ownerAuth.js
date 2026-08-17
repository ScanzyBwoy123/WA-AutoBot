const db = require('../database/db');

module.exports = function ownerAuth(req, res, next) {
  const { senderNumber } = req.body;

  const configuredOwner =
    process.env.OWNER_NUMBER || db.getSettings().ownerNumber;

  const sanitizedSender = String(senderNumber || '').replace(
    /[^0-9]/g,
    ''
  );

  const sanitizedOwner = String(configuredOwner || '').replace(
    /[^0-9]/g,
    ''
  );

  if (
    sanitizedSender &&
    sanitizedOwner &&
    sanitizedSender === sanitizedOwner
  ) {
    return next();
  }

  return res.status(403).json({
    success: false,
    error: 'Unauthorized: command execution restricted to bot owner.'
  });
};
