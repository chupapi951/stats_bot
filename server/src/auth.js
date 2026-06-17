'use strict';

const crypto = require('crypto');

/**
 * Validate Telegram Mini App initData.
 *
 * Spec: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Returns { valid, user } where user is the parsed Telegram user object
 * (or null if validation fails / no user present).
 */
function validateInitData(initData, botToken) {
  if (!initData || typeof initData !== 'string' || !botToken) {
    return { valid: false, user: null };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { valid: false, user: null };

  params.delete('hash');

  // build data-check-string: key=value pairs sorted by key, joined with \n
  const pairs = [];
  for (const [key, value] of [...params.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    pairs.push(`${key}=${value}`);
  }
  const dataCheckString = pairs.join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const computed = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (computed !== hash) {
    return { valid: false, user: null };
  }

  // auth_date freshness check (skip if TESTING=1)
  const authDate = Number(params.get('auth_date'));
  if (!process.env.TESTING) {
    if (!authDate || Date.now() / 1000 - authDate > 60 * 60 * 24) {
      return { valid: false, user: null };
    }
  }

  let user = null;
  const userStr = params.get('user');
  if (userStr) {
    try {
      user = JSON.parse(userStr);
    } catch (_) {
      user = null;
    }
  }

  return { valid: true, user };
}

/**
 * Express middleware. Reads initData from header `x-tg-init-data`,
 * validates it, and attaches `req.tgUser` (Telegram user object) on success.
 *
 * In TESTING mode we accept a fallback `x-tg-user-id` header so the
 * frontend can be developed locally without Telegram.
 */
function authMiddleware(botToken) {
  return (req, res, next) => {
    const initData = req.header('x-tg-init-data') || '';
    const result = validateInitData(initData, botToken);

    if (result.valid && result.user) {
      req.tgUser = result.user;
      return next();
    }

    if (process.env.TESTING) {
      const id = Number(req.header('x-tg-user-id'));
      if (id) {
        req.tgUser = { id, first_name: 'Test', username: 'tester' };
        return next();
      }
    }

    return res.status(401).json({ error: 'unauthorized' });
  };
}

module.exports = { validateInitData, authMiddleware };
