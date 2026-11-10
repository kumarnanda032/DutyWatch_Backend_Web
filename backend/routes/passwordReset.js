/**
 * Forgot-password flow, mounted at /api/auth/forgot-password (see server.js).
 *
 *   POST /send-otp    { roll_no }
 *       Checks the Emp ID exists, texts a 6-digit OTP to the mobile number on
 *       that account. Call it again to resend (after the cooldown).
 *       -> { message, mobile: "******3261", resend_in: 60, expires_in: 300 }
 *
 *   POST /verify-otp  { roll_no, otp }
 *       Checks the OTP. On success the app goes to the "Set New Password"
 *       screen, carrying the one-time reset_token it gets back.
 *       -> { message, reset_token, expires_in: 600 }
 *
 *   POST /reset       { roll_no, reset_token, new_password, confirm_password? }
 *       Saves the new (bcrypt-hashed) password. The app then goes back to the
 *       login screen.
 *       -> { message }
 *
 * Errors are { error: "..." } with a matching HTTP status, same as the rest of
 * this API. 429s also carry `retry_after` (seconds).
 *
 * Why a reset_token: without it, /reset would be "set the password for Emp ID
 * X" with nothing proving the OTP was ever entered, so anyone who knows an Emp
 * ID could take the account over. /verify-otp is the only thing that issues
 * one, it lasts 10 minutes, and it can be used once.
 *
 * Settings (all optional, see .env.example): SMS_USERNAME, SMS_PASSWORD,
 * SMS_SENDER, SMS_API_URL, SMS_OTP_TEMPLATE, SMS_DRY_RUN, OTP_EXPIRY_MINUTES,
 * OTP_RESEND_SECONDS, OTP_MAX_SENDS_PER_HOUR, OTP_MAX_ATTEMPTS,
 * RESET_TOKEN_MINUTES.
 */

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const PasswordReset = require('../models/PasswordReset');

const router = express.Router();

// ---------------------------------------------------------------- settings
const positive = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const OTP_EXPIRY_MS = positive(process.env.OTP_EXPIRY_MINUTES, 5) * 60 * 1000;
const RESEND_MS = positive(process.env.OTP_RESEND_SECONDS, 60) * 1000;
const MAX_SENDS_PER_HOUR = positive(process.env.OTP_MAX_SENDS_PER_HOUR, 5);
const MAX_ATTEMPTS = positive(process.env.OTP_MAX_ATTEMPTS, 5);
const RESET_TOKEN_MS = positive(process.env.RESET_TOKEN_MINUTES, 10) * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const SMS_TIMEOUT_MS = 10 * 1000;
const MAX_PASSWORD_LENGTH = 64; // bcrypt silently ignores everything past 72 bytes

// Default wording is the text this SMS account already sends. If your SMS
// provider needs DLT-approved templates (India), the message has to match an
// approved one exactly - change it with SMS_OTP_TEMPLATE ({name} and {otp}).
const DEFAULT_OTP_TEMPLATE =
  'Dear {name}, Your OTP to reset the password of Technical Hub app is {otp}. ADITYA';

if (process.env.SMS_DRY_RUN === 'true') {
  console.warn(
    '[forgot-password] SMS_DRY_RUN is on: OTPs are printed in this server log instead of being texted. Do not use this in production.'
  );
}

// ----------------------------------------------------------------- helpers
class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function fail(res, err, logLabel) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...err.extra });
  }
  console.error(`${logLabel}:`, err);
  return res.status(500).json({ error: 'Server error. Please try again.' });
}

// Same normalisation as /api/auth/login. String() also means a body like
// { "roll_no": { "$ne": null } } can't be used to inject a query operator.
const cleanRollNo = (value) => String(value ?? '').trim();

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000)); // always 6 digits
}

// "9876543261" -> "******3261"
function maskMobile(mobile) {
  const digits = String(mobile);
  const visible = digits.slice(-4);
  return '*'.repeat(Math.max(0, digits.length - 4)) + visible;
}

// The four rules shown on the Set New Password screen. Returns the ones that
// are NOT met (empty = password is fine).
function passwordProblems(password) {
  const problems = [];
  if (password.length <= 6) problems.push('More than 6 characters');
  if (!/[A-Z]/.test(password)) problems.push('Contains uppercase letter');
  if (!/[0-9]/.test(password)) problems.push('Contains a number');
  if (!/[^A-Za-z0-9\s]/.test(password)) problems.push('Contains special character');
  return problems;
}

async function sendOtpSms({ rollNo, mobile, firstName, otp }) {
  if (process.env.SMS_DRY_RUN === 'true') {
    console.log(`[SMS_DRY_RUN] OTP for Emp ID ${rollNo} (${maskMobile(mobile)}): ${otp}`);
    return;
  }

  const { SMS_USERNAME, SMS_PASSWORD } = process.env;
  if (!SMS_USERNAME || !SMS_PASSWORD) {
    console.error('[forgot-password] SMS_USERNAME / SMS_PASSWORD are not set.');
    throw new HttpError(503, 'OTP service is not available right now. Contact an administrator.');
  }

  const template = process.env.SMS_OTP_TEMPLATE || DEFAULT_OTP_TEMPLATE;
  const text = template.replace(/\{name\}/g, () => firstName).replace(/\{otp\}/g, () => otp);
  const params = new URLSearchParams({
    username: SMS_USERNAME,
    password: SMS_PASSWORD,
    unicode: 'false',
    from: process.env.SMS_SENDER || 'ADIUNV',
    to: mobile,
    text,
  });
  const url = `${process.env.SMS_API_URL || 'https://pgapi.vispl.in/fe/api/v1/multiSend'}?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SMS_TIMEOUT_MS);
  try {
    const response = await fetch(url, { method: 'POST', signal: controller.signal });
    const data = await response.json().catch(() => null);
    const accepted = data && data.submitResponses && data.submitResponses[0] && data.submitResponses[0].statusCode === 200;
    if (!accepted) {
      // Never log `url` - it carries the SMS account's credentials.
      console.error('[forgot-password] SMS provider rejected the message:', response.status, JSON.stringify(data));
      throw new HttpError(502, 'Could not send the OTP SMS. Please try again.');
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error('[forgot-password] SMS request failed:', err.name === 'AbortError' ? 'timed out' : err.message);
    throw new HttpError(502, 'Could not send the OTP SMS. Please try again.');
  } finally {
    clearTimeout(timer);
  }
}

// Two simultaneous send-otp calls for one Emp ID would both pass the cooldown
// check before either is saved and text the person twice - so only one is
// allowed through at a time (per server process).
const sendsInFlight = new Set();

// ------------------------------------------------------------------ step 1
router.post('/send-otp', async (req, res) => {
  const rollNo = cleanRollNo(req.body && req.body.roll_no);
  if (!rollNo) {
    return res.status(400).json({ error: 'Emp ID is required.' });
  }
  if (sendsInFlight.has(rollNo)) {
    return res.status(429).json({ error: 'An OTP request is already in progress. Please wait a moment.', retry_after: 5 });
  }
  sendsInFlight.add(rollNo);

  try {
    const user = await User.findOne({ roll_no: rollNo });
    if (!user) throw new HttpError(404, 'No account found for this Emp ID.');
    if (user.blocked) throw new HttpError(403, 'This account has been blocked. Contact an administrator.');

    const mobile = String(user.mobile || '').trim();
    if (!mobile) {
      throw new HttpError(400, 'No mobile number is registered for this account. Contact an administrator.');
    }

    const now = Date.now();
    const record = await PasswordReset.findOne({ roll_no: rollNo });

    // Resend cooldown (the "Resend available in 00:56" timer on the OTP screen).
    if (record && record.lastSentAt) {
      const waitMs = RESEND_MS - (now - record.lastSentAt.getTime());
      if (waitMs > 0) {
        const seconds = Math.ceil(waitMs / 1000);
        throw new HttpError(429, `Please wait ${seconds} seconds before requesting another OTP.`, { retry_after: seconds });
      }
    }

    // Cap on texts per hour, so the endpoint can't be used to spam someone's phone.
    const windowStart =
      record && record.sendWindowStartedAt && now - record.sendWindowStartedAt.getTime() < HOUR_MS
        ? record.sendWindowStartedAt
        : null;
    const sendCount = windowStart ? record.sendCount : 0;
    if (sendCount >= MAX_SENDS_PER_HOUR) {
      const seconds = Math.ceil((windowStart.getTime() + HOUR_MS - now) / 1000);
      throw new HttpError(
        429,
        `Too many OTP requests. Try again in ${Math.ceil(seconds / 60)} minute(s).`,
        { retry_after: seconds }
      );
    }

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);

    // Text first, save after: if the SMS fails nothing is stored, so the
    // failed attempt doesn't use up the cooldown or the hourly allowance.
    await sendOtpSms({ rollNo, mobile, firstName: user.first_name, otp });

    const doc = record || new PasswordReset({ roll_no: rollNo });
    doc.otpHash = otpHash;
    doc.otpExpiresAt = new Date(now + OTP_EXPIRY_MS);
    doc.attempts = 0;
    doc.lastSentAt = new Date(now);
    doc.sendWindowStartedAt = windowStart || new Date(now);
    doc.sendCount = sendCount + 1;
    // A new OTP voids any reset session from an earlier one.
    doc.resetTokenHash = null;
    doc.resetTokenExpiresAt = null;
    doc.expiresAt = new Date(now + HOUR_MS);
    await doc.save();

    return res.json({
      message: 'OTP sent successfully.',
      mobile: maskMobile(mobile),
      resend_in: Math.round(RESEND_MS / 1000),
      expires_in: Math.round(OTP_EXPIRY_MS / 1000),
    });
  } catch (err) {
    return fail(res, err, 'send-otp error');
  } finally {
    sendsInFlight.delete(rollNo);
  }
});

// ------------------------------------------------------------------ step 2
router.post('/verify-otp', async (req, res) => {
  try {
    const rollNo = cleanRollNo(req.body && req.body.roll_no);
    const otp = String((req.body && req.body.otp) ?? '').trim();
    if (!rollNo || !otp) {
      throw new HttpError(400, 'Emp ID and OTP are required.');
    }
    if (!/^\d{6}$/.test(otp)) {
      throw new HttpError(400, 'Enter the 6-digit OTP.');
    }

    // Count this try *before* checking it, in one atomic step, so a burst of
    // parallel guesses can't slip past the attempt limit.
    const record = await PasswordReset.findOneAndUpdate(
      { roll_no: rollNo, otpHash: { $ne: null } },
      { $inc: { attempts: 1 } },
      { new: true }
    );
    if (!record) {
      throw new HttpError(400, 'No OTP is pending for this Emp ID. Please request a new OTP.');
    }

    const invalidateOtp = () =>
      PasswordReset.updateOne({ roll_no: rollNo }, { otpHash: null, otpExpiresAt: null });

    if (!record.otpExpiresAt || record.otpExpiresAt.getTime() < Date.now()) {
      await invalidateOtp();
      throw new HttpError(400, 'This OTP has expired. Please request a new one.');
    }
    if (record.attempts > MAX_ATTEMPTS) {
      await invalidateOtp();
      throw new HttpError(429, 'Too many incorrect attempts. Please request a new OTP.');
    }

    const matches = await bcrypt.compare(otp, record.otpHash);
    if (!matches) {
      const left = MAX_ATTEMPTS - record.attempts;
      if (left <= 0) {
        await invalidateOtp();
        throw new HttpError(401, 'Incorrect OTP. Too many incorrect attempts - please request a new OTP.');
      }
      throw new HttpError(401, `Incorrect OTP. ${left} attempt${left === 1 ? '' : 's'} left.`, { attempts_left: left });
    }

    // Correct: the OTP is spent, and a one-time reset token takes its place.
    const resetToken = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    await PasswordReset.updateOne(
      { roll_no: rollNo },
      {
        otpHash: null,
        otpExpiresAt: null,
        attempts: 0,
        resetTokenHash: sha256(resetToken),
        resetTokenExpiresAt: new Date(now + RESET_TOKEN_MS),
        expiresAt: new Date(now + HOUR_MS),
      }
    );

    return res.json({
      message: 'OTP verified successfully.',
      reset_token: resetToken,
      expires_in: Math.round(RESET_TOKEN_MS / 1000),
    });
  } catch (err) {
    return fail(res, err, 'verify-otp error');
  }
});

// ------------------------------------------------------------------ step 3
router.post('/reset', async (req, res) => {
  try {
    const body = req.body || {};
    const rollNo = cleanRollNo(body.roll_no);
    const resetToken = String(body.reset_token ?? '').trim();
    const newPassword = body.new_password;
    const confirmPassword = body.confirm_password;

    if (!rollNo || !resetToken || typeof newPassword !== 'string' || !newPassword) {
      throw new HttpError(400, 'Emp ID, reset token and new password are required.');
    }

    // The token check comes first, so nobody without one learns anything else.
    const record = await PasswordReset.findOne({ roll_no: rollNo });
    const tokenOk =
      record &&
      record.resetTokenHash &&
      record.resetTokenExpiresAt &&
      record.resetTokenExpiresAt.getTime() >= Date.now() &&
      crypto.timingSafeEqual(Buffer.from(sha256(resetToken)), Buffer.from(record.resetTokenHash));
    if (!tokenOk) {
      throw new HttpError(401, 'Your reset session has expired. Please verify the OTP again.');
    }

    if (confirmPassword !== undefined && confirmPassword !== newPassword) {
      throw new HttpError(400, 'New password and confirm password do not match.');
    }
    if (newPassword.length > MAX_PASSWORD_LENGTH) {
      throw new HttpError(400, `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`);
    }
    const problems = passwordProblems(newPassword);
    if (problems.length) {
      throw new HttpError(
        400,
        'Password must have more than 6 characters, an uppercase letter, a number and a special character.',
        { requirements_not_met: problems }
      );
    }

    const user = await User.findOne({ roll_no: rollNo });
    if (!user) throw new HttpError(404, 'No account found for this Emp ID.');
    if (user.blocked) throw new HttpError(403, 'This account has been blocked. Contact an administrator.');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await User.updateOne({ _id: user._id }, { password: passwordHash });

    // Spend the token (it works once). The send counters stay, so the hourly
    // OTP limit still applies if someone keeps going.
    await PasswordReset.updateOne({ roll_no: rollNo }, { resetTokenHash: null, resetTokenExpiresAt: null });

    return res.json({ message: 'Password updated successfully. Please log in with your new password.' });
  } catch (err) {
    return fail(res, err, 'reset error');
  }
});

module.exports = router;
