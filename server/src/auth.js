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

  // Telegram signs the RAW URL-encoded form of initData. We must not
  // decode values before building the data-check-string, otherwise
  // reserved characters (e.g. +, /, =, %, Cyrillic, JSON braces) get
  // rewritten and the HMAC won't match.
  //
  // Strategy: take everything before "hash=", parse just the hash,
  // then split the remainder on "&" and sort by key (raw, no decoding).
  const hashMatch = initData.match(/^([^#]*?)(?:#.*)?$/);
  const raw = hashMatch ? hashMatch[1] : initData;

  let hash = null;
  const pairs = [];
  for (const segment of raw.split('&')) {
    if (!segment) continue;
    const eq = segment.indexOf('=');
    if (eq < 0) continue;
    const key = segment.slice(0, eq);
    const value = segment.slice(eq + 1);
    if (key === 'hash') {
      hash = value;
    } else {
      pairs.push([key, value]);
    }
  }
  if (!hash) return { valid: false, user: null };

  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');

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
  let authDate = 0;
  for (const [k, v] of pairs) {
    if (k === 'auth_date') { authDate = Number(v); break; }
  }
  if (!process.env.TESTING) {
    if (!authDate || Date.now() / 1000 - authDate > 60 * 60 * 24) {
      return { valid: false, user: null };
    }
  }

  let user = null;
  for (const [k, v] of pairs) {
    if (k === 'user') {
      try { user = JSON.parse(decodeURIComponent(v)); } catch (_) { user = null; }
      break;
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
