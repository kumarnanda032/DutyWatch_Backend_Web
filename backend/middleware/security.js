/**
 * Request hardening shared by the whole API.
 *
 *  - rejectUnsafeBody: blocks Mongo operator keys ($where, $ne ...) anywhere in
 *    a JSON body, and "<" / ">" in text fields. Names/places are rendered into
 *    HTML by the dashboard, so keeping tags out at the door stops stored XSS.
 *    (Password fields are exempt - they may legitimately contain those characters.)
 *  - rate limiters: slow down password guessing and request floods.
 */
const rateLimit = require('express-rate-limit');

const PASSWORD_KEYS = new Set(['password', 'current_password', 'new_password', 'confirm_password']);

function inspect(value, key, depth) {
  if (depth > 6) return 'Request body is too deeply nested.';
  if (typeof value === 'string') {
    if (!PASSWORD_KEYS.has(key) && /[<>]/.test(value)) {
      return 'The characters < and > are not allowed in text fields.';
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const problem = inspect(item, key, depth + 1);
      if (problem) return problem;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) {
      if (k.startsWith('$')) return 'Invalid field name in request.';
      const problem = inspect(value[k], k, depth + 1);
      if (problem) return problem;
    }
  }
  return null;
}

function rejectUnsafeBody(req, res, next) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    const problem = inspect(req.body, '', 0);
    if (problem) return res.status(400).json({ error: problem });
  }
  next();
}

const tooMany = (message) => (req, res) => res.status(429).json({ error: message });

// Failed logins / password changes: 10 wrong attempts per 15 min per IP + account.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX) || 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}|${String((req.body && req.body.roll_no) || '').trim().toLowerCase()}`,
  handler: tooMany('Too many failed attempts. Please wait 15 minutes and try again.'),
});

// OTP / forgot-password routes (they also have their own per-account limits).
const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooMany('Too many requests. Please try again later.'),
});

// Generous overall cap per IP (many guards can share one campus IP).
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.API_RATE_LIMIT_MAX) || 3000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: tooMany('Too many requests. Please slow down.'),
});

module.exports = { rejectUnsafeBody, loginLimiter, resetLimiter, apiLimiter };
