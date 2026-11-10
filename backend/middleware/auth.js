/**
 * Authentication + authorization (JWT).
 *
 *   signToken(user)            -> signed token returned by POST /api/auth/login
 *   requireAuth                -> every protected route: valid token, account
 *                                 still exists, not blocked, password unchanged
 *   requireRole('admin')       -> only that role (role is read from the DB, never
 *                                 from the token or the request body)
 *   ownGuardOrAdmin            -> a guard may only read/write their OWN records
 *                                 (guardEmpId must equal their roll_no); admins
 *                                 may use any guardEmpId
 *   selfOrAdminParam('roll_no')-> same idea for /:roll_no URL parameters
 *
 * Environment:
 *   JWT_SECRET        long random string (required in production). If it is
 *                     missing a random one is generated at start-up, which is
 *                     safe but logs everybody out whenever the server restarts.
 *   JWT_EXPIRES_IN    token lifetime, default "12h" (e.g. "7d" for phones)
 *   AUTH_REQUIRED     "false" turns enforcement OFF (only for a short migration
 *                     window while the mobile app is updated). Default: on.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';
const AUTH_REQUIRED = String(process.env.AUTH_REQUIRED || 'true').toLowerCase() !== 'false';

let SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32) {
  SECRET = crypto.randomBytes(48).toString('hex');
  console.warn(
    '[security] JWT_SECRET is missing or shorter than 32 characters - using a temporary random secret. ' +
    'Everyone will have to log in again after each restart. Set JWT_SECRET in .env / Render Environment.'
  );
}
if (!AUTH_REQUIRED) {
  console.warn('[security] AUTH_REQUIRED=false - API routes are NOT protected. Turn this back on as soon as possible.');
}

// Changes whenever the password changes, so old tokens stop working after a
// password change/reset (same effect the old "re-check password" logic had).
function passwordFingerprint(passwordHash) {
  return crypto.createHash('sha256').update(String(passwordHash)).digest('hex').slice(0, 16);
}

function signToken(user) {
  return jwt.sign(
    { sub: user.roll_no, role: user.role, pv: passwordFingerprint(user.password) },
    SECRET,
    { algorithm: 'HS256', expiresIn: EXPIRES_IN }
  );
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

async function requireAuth(req, res, next) {
  if (!AUTH_REQUIRED) {
    req.user = null;
    return next();
  }
  try {
    const token = bearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Please log in to continue.', code: 'AUTH_REQUIRED' });
    }

    let payload;
    try {
      payload = jwt.verify(token, SECRET, { algorithms: ['HS256'] });
    } catch (err) {
      const expired = err.name === 'TokenExpiredError';
      return res.status(401).json({
        error: expired ? 'Your session has expired. Please log in again.' : 'Invalid session. Please log in again.',
        code: expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
      });
    }

    const user = await User.findOne({ roll_no: String(payload.sub) }).select('roll_no role first_name blocked password');
    if (!user || passwordFingerprint(user.password) !== payload.pv) {
      return res.status(401).json({ error: 'Your session is no longer valid. Please log in again.', code: 'TOKEN_INVALID' });
    }
    if (user.blocked) {
      return res.status(403).json({ error: 'This account has been blocked. Contact an administrator.', code: 'BLOCKED' });
    }

    req.user = { roll_no: user.roll_no, role: user.role, first_name: user.first_name };
    next();
  } catch (err) {
    console.error('Auth check failed:', err);
    res.status(500).json({ error: 'Server error checking your session.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!AUTH_REQUIRED) return next();
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do this.', code: 'FORBIDDEN' });
    }
    next();
  };
}

function isAdmin(req) {
  return !req.user || req.user.role === 'admin';
}

/**
 * Guards: guardEmpId (query or body) must be their own roll_no. When it is
 * left out on a read, it is filled in with their own so they can never
 * list someone else's data. Admins: unrestricted.
 */
function ownGuardOrAdmin(req, res, next) {
  if (!AUTH_REQUIRED || isAdmin(req)) return next();

  const own = req.user.roll_no;
  const holder = req.method === 'GET' || req.method === 'HEAD' ? req.query : (req.body || {});
  const supplied = holder.guardEmpId;

  if (supplied !== undefined && String(supplied).trim() !== own) {
    return res.status(403).json({ error: 'You can only access your own records.', code: 'FORBIDDEN' });
  }
  holder.guardEmpId = own;
  next();
}

/** /:param must be the caller's own roll number (admins: any). */
function selfOrAdminParam(param) {
  return (req, res, next) => {
    if (!AUTH_REQUIRED || isAdmin(req)) return next();
    if (String(req.params[param]).trim() !== req.user.roll_no) {
      return res.status(403).json({ error: 'You can only access your own account.', code: 'FORBIDDEN' });
    }
    next();
  };
}

module.exports = { signToken, requireAuth, requireRole, ownGuardOrAdmin, selfOrAdminParam, AUTH_REQUIRED };
