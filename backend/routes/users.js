const express = require('express');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const User = require('../models/User');

const { requireRole, ownGuardOrAdmin, selfOrAdminParam } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_ROLES = ['admin', 'security'];
const ALLOWED_GENDERS = ['Male', 'Female', 'Other'];

// Normalizes a gender value from the form / CSV ("male", " FEMALE ", ...) to
// the stored form ("Male", "Female", "Other"). Blank -> '' (gender is
// optional at the API level so older CSVs/clients keep working); anything
// else that isn't one of the three values -> null, meaning "invalid".
function normalizeGender(value) {
  const v = String(value ?? '').trim();
  if (!v) return '';
  const match = ALLOWED_GENDERS.find(g => g.toLowerCase() === v.toLowerCase());
  return match || null;
}

// GET /api/users?role=&search=&page=1&limit=10
//   role   - optional, 'admin' or 'security'
//   search - optional, matches first_name / roll_no / mobile (case-insensitive, partial)
//   page   - 1-based page number (default 1)
//   limit  - page size (default 10)
// Returns { data, total, page, limit, totalPages }
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (typeof req.query.role === 'string' && ALLOWED_ROLES.includes(req.query.role)) {
      filter.role = req.query.role;
    }

    const search = (typeof req.query.search === 'string' ? req.query.search : '').trim();
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ first_name: re }, { roll_no: re }, { mobile: re }, { designation: re }];
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 500);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      User.find(filter).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);

    res.json({
      data,
      total,
      page,
      limit,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching users.' });
  }
});

// GET /api/users/by-roll/:roll_no
// One account looked up by its exact roll number (never includes the password
// hash). Used by the mobile app's Profile screen to show the account's current
// details straight from MongoDB rather than the copy saved at login.
router.get('/by-roll/:roll_no', selfOrAdminParam('roll_no'), async (req, res) => {
  try {
    const user = await User.findOne({ roll_no: String(req.params.roll_no).trim() }).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({
      roll_no: user.roll_no,
      first_name: user.first_name,
      gender: user.gender || '',
      designation: user.designation,
      mobile: user.mobile,
      role: user.role,
      blocked: user.blocked,
      profile_pic: user.profile_pic || '',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching user.' });
  }
});

// ---------------------------------------------------------------------
// Profile photo: POST /api/users/by-roll/:roll_no/profile-pic  (multipart, field "image")
// JPG/PNG only, max 2 MB. Saved under public/uploads/profile (served by
// express.static) and the URL is stored on the user as profile_pic.
// ---------------------------------------------------------------------
const PROFILE_DIR = path.join(__dirname, '..', 'public', 'uploads', 'profile');
fs.mkdirSync(PROFILE_DIR, { recursive: true });

const PROFILE_MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const PROFILE_EXTENSIONS = ['.jpg', '.jpeg', '.png'];
const JPEG_SIG = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isGenuineImage(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(8);
    fs.readSync(fd, buf, 0, 8, 0);
    return buf.subarray(0, 3).equals(JPEG_SIG) || buf.equals(PNG_SIG);
  } finally {
    fs.closeSync(fd);
  }
}

function removeFileQuietly(filePath) {
  fs.unlink(filePath, () => {});
}

const profileUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, PROFILE_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeRoll = String(req.params.roll_no).replace(/[^a-zA-Z0-9_-]/g, '');
      cb(null, `${safeRoll}_${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: PROFILE_MAX_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!PROFILE_EXTENSIONS.includes(ext)) {
      return cb(new Error('Only JPG, JPEG or PNG images are allowed.'));
    }
    cb(null, true);
  },
}).single('image');

router.post('/by-roll/:roll_no/profile-pic', selfOrAdminParam('roll_no'), (req, res) => {
  profileUpload(req, res, async (uploadErr) => {
    if (uploadErr) {
      const msg = uploadErr.code === 'LIMIT_FILE_SIZE'
        ? 'Image is too large. Maximum size is 2 MB.'
        : uploadErr.message || 'Could not upload the image.';
      return res.status(400).json({ error: msg });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Please choose an image to upload.' });
    }

    try {
      if (!isGenuineImage(req.file.path)) {
        removeFileQuietly(req.file.path);
        return res.status(400).json({ error: 'This file is not a valid JPG or PNG image.' });
      }

      const user = await User.findOne({ roll_no: String(req.params.roll_no).trim() });
      if (!user) {
        removeFileQuietly(req.file.path);
        return res.status(404).json({ error: 'User not found.' });
      }

      // Remove the previous photo so old files don't pile up.
      if (user.profile_pic && user.profile_pic.startsWith('/uploads/profile/')) {
        removeFileQuietly(path.join(PROFILE_DIR, path.basename(user.profile_pic)));
      }

      user.profile_pic = `/uploads/profile/${req.file.filename}`;
      await user.save();
      res.json({ profile_pic: user.profile_pic });
    } catch (err) {
      console.error(err);
      removeFileQuietly(req.file.path);
      res.status(500).json({ error: 'Server error saving profile photo.' });
    }
  });
});

// POST /api/users  { roll_no, password, first_name, gender, designation, mobile, role }
// Used by the admin "Add Security" form (single account).
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { roll_no, password, first_name, gender, designation, mobile, role } = req.body;

    if (!roll_no || !password || !first_name || !mobile || !role) {
      return res.status(400).json({ error: 'roll_no, password, first_name, mobile and role are all required.' });
    }
    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ error: "role must be 'admin' or 'security'." });
    }
    const normalizedGender = normalizeGender(gender);
    if (normalizedGender === null) {
      return res.status(400).json({ error: "gender must be 'Male', 'Female' or 'Other'." });
    }

    const existing = await User.findOne({ roll_no: String(roll_no).trim() });
    if (existing) {
      return res.status(409).json({ error: 'That roll number already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      roll_no: String(roll_no).trim(),
      password: passwordHash,
      first_name: first_name.trim(),
      gender: normalizedGender,
      designation: designation?.trim() || 'Security Guard',
      mobile: mobile.trim(),
      role,
    });

    res.status(201).json({
      roll_no: user.roll_no,
      first_name: user.first_name,
      gender: user.gender,
      designation: user.designation,
      mobile: user.mobile,
      role: user.role,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error creating user.' });
  }
});

// POST /api/users/bulk  { users: [ { roll_no, password, first_name, gender, designation, mobile, role }, ... ] }
// Used by the admin "Add Security" CSV bulk upload.
// Each row is validated and inserted independently - one bad row does not
// stop the rest. Returns a per-row summary so the frontend can show exactly
// what happened.
router.post('/bulk', requireRole('admin'), async (req, res) => {
  try {
    const rows = Array.isArray(req.body.users) ? req.body.users : [];
    if (rows.length === 0) {
      return res.status(400).json({ error: 'No rows to import.' });
    }
    if (rows.length > 2000) {
      return res.status(400).json({ error: 'Too many rows in one upload (max 2000).' });
    }

    const results = [];
    let insertedCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // +2 so it matches the CSV line number (1 = header row)
      const { roll_no, password, first_name, gender, designation, mobile, role } = rows[i] || {};

      if (!roll_no || !password || !first_name || !mobile || !role) {
        results.push({ row: rowNum, roll_no: roll_no || '', status: 'skipped', reason: 'Missing required field(s).' });
        continue;
      }
      if (!ALLOWED_ROLES.includes(String(role).trim())) {
        results.push({ row: rowNum, roll_no, status: 'skipped', reason: "role must be 'admin' or 'security'." });
        continue;
      }
      const normalizedGender = normalizeGender(gender);
      if (normalizedGender === null) {
        results.push({ row: rowNum, roll_no, status: 'skipped', reason: "gender must be 'Male', 'Female' or 'Other' (or left blank)." });
        continue;
      }

      try {
        const existing = await User.findOne({ roll_no: String(roll_no).trim() });
        if (existing) {
          results.push({ row: rowNum, roll_no, status: 'skipped', reason: 'Roll number already exists.' });
          continue;
        }

        const passwordHash = await bcrypt.hash(String(password), 10);
        await User.create({
          roll_no: String(roll_no).trim(),
          password: passwordHash,
          first_name: String(first_name).trim(),
          gender: normalizedGender,
          designation: designation ? String(designation).trim() : 'Security Guard',
          mobile: String(mobile).trim(),
          role: String(role).trim(),
        });
        insertedCount += 1;
        results.push({ row: rowNum, roll_no, status: 'inserted' });
      } catch (rowErr) {
        results.push({ row: rowNum, roll_no, status: 'skipped', reason: rowErr.message || 'Unknown error.' });
      }
    }

    res.status(207).json({
      insertedCount,
      skippedCount: results.length - insertedCount,
      results,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during bulk import.' });
  }
});

// PUT /api/users/:id  { first_name, gender?, designation, mobile, role, password? }
// Edits an existing account. roll_no is not editable here (it's the login
// key). password is optional - leave it out to keep the current one.
router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { first_name, gender, designation, mobile, role, password } = req.body;

    if (!first_name || !mobile || !role) {
      return res.status(400).json({ error: 'first_name, mobile and role are required.' });
    }
    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ error: "role must be 'admin' or 'security'." });
    }
    const normalizedGender = normalizeGender(gender);
    if (normalizedGender === null) {
      return res.status(400).json({ error: "gender must be 'Male', 'Female' or 'Other'." });
    }

    const update = {
      first_name: first_name.trim(),
      designation: designation?.trim() || 'Security Guard',
      mobile: mobile.trim(),
      role,
    };
    // Only touch gender when the client actually sent it, so an older client
    // (or the mobile app) editing other fields can't wipe it.
    if (gender !== undefined) update.gender = normalizedGender;
    if (password && password.trim()) {
      update.password = await bcrypt.hash(password.trim(), 10);
    }

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error updating user.' });
  }
});

// PATCH /api/users/:id/toggle-block
// Flips the "blocked" flag. A blocked account can no longer log in
// (see routes/auth.js) but its data is kept.
router.patch('/:id/toggle-block', requireRole('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    user.blocked = !user.blocked;
    await user.save();
    res.json({ _id: user._id, roll_no: user.roll_no, blocked: user.blocked });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error updating block status.' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ deleted: true, roll_no: user.roll_no });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error deleting user.' });
  }
});

module.exports = router;
