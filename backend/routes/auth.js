const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login  { roll_no, password }
router.post('/login', async (req, res) => {
  try {
    const { roll_no, password } = req.body;
    if (!roll_no || !password) {
      return res.status(400).json({ error: 'Roll number and password are required.' });
    }
    // Only plain strings: stops {"$ne": ...} style objects reaching Mongo/bcrypt.
    if (typeof roll_no !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Roll number and password must be text.' });
    }

    const user = await User.findOne({ roll_no: String(roll_no).trim() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid roll number or password.' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid roll number or password.' });
    }

    if (user.blocked) {
      return res.status(403).json({ error: 'This account has been blocked. Contact an administrator.' });
    }

    // Same fields as before, plus a signed token that every other API call
    // must send as "Authorization: Bearer <token>".
    res.json({
      roll_no: user.roll_no,
      first_name: user.first_name,
      gender: user.gender || '',
      designation: user.designation,
      mobile: user.mobile,
      role: user.role,
      profile_pic: user.profile_pic || '',
      token: signToken(user),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// GET /api/auth/me  (Authorization: Bearer <token>)
// Lets the web app silently re-check that the session is still valid: the
// account exists, is not blocked and the password has not changed elsewhere.
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findOne({ roll_no: req.user.roll_no }).select('-password');
    if (!user) return res.status(401).json({ error: 'Your session is no longer valid. Please log in again.' });
    res.json({
      roll_no: user.roll_no,
      first_name: user.first_name,
      gender: user.gender || '',
      designation: user.designation,
      mobile: user.mobile,
      role: user.role,
      profile_pic: user.profile_pic || '',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching your account.' });
  }
});

// ---------------------------------------------------------------------
// POST /api/auth/change-password
//   { roll_no, current_password, new_password, confirm_password? }
//
// For a user who is already logged in (admin OR security - both roles live
// in the same User collection, so one endpoint serves both). Only the
// password field is touched; nothing else on the account can change here.
//
// This app has no session/JWT yet, so "logged in" is proven the only way
// available: the caller must supply the account's CURRENT password. Without
// it nobody can change the password just by knowing a roll number.
// ---------------------------------------------------------------------
const MAX_PASSWORD_LENGTH = 64; // bcrypt silently ignores everything past 72 bytes

// Same rules as the forgot-password flow (routes/passwordReset.js).
function passwordProblems(password) {
  const problems = [];
  if (password.length <= 6) problems.push('More than 6 characters');
  if (!/[A-Z]/.test(password)) problems.push('Contains uppercase letter');
  if (!/[0-9]/.test(password)) problems.push('Contains a number');
  if (!/[^A-Za-z0-9\s]/.test(password)) problems.push('Contains special character');
  return problems;
}

router.post('/change-password', async (req, res) => {
  try {
    const body = req.body || {};
    const rollNo = typeof body.roll_no === 'string' ? body.roll_no.trim() : '';
    const currentPassword = body.current_password;
    const newPassword = body.new_password;
    const confirmPassword = body.confirm_password;

    if (
      !rollNo ||
      typeof currentPassword !== 'string' || !currentPassword ||
      typeof newPassword !== 'string' || !newPassword
    ) {
      return res.status(400).json({ error: 'roll_no, current_password and new_password are required.' });
    }
    if (confirmPassword !== undefined && confirmPassword !== newPassword) {
      return res.status(400).json({ error: 'New password and confirm password do not match.' });
    }
    if (newPassword.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters.` });
    }
    const problems = passwordProblems(newPassword);
    if (problems.length) {
      return res.status(400).json({
        error: 'Password must have more than 6 characters, an uppercase letter, a number and a special character.',
        requirements_not_met: problems,
      });
    }

    const user = await User.findOne({ roll_no: rollNo });
    // Same message for "no such user" and "wrong password" so the endpoint
    // can't be used to discover which roll numbers exist.
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    if (user.blocked) {
      return res.status(403).json({ error: 'This account has been blocked. Contact an administrator.' });
    }
    if (await bcrypt.compare(newPassword, user.password)) {
      return res.status(400).json({ error: 'New password must be different from the current password.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await User.updateOne({ _id: user._id }, { password: passwordHash }); // password field only

    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error changing password.' });
  }
});

module.exports = router;
