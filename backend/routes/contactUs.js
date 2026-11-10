/**
 * Contact Us directory, mounted at /api/contact-us (see server.js).
 *
 *   GET    /api/contact-us?search=&dept=&page=1&limit=50   any logged-in user
 *   GET    /api/contact-us/:id                             any logged-in user
 *   POST   /api/contact-us                                 admin only
 *   PUT    /api/contact-us/:id                             admin only
 *   DELETE /api/contact-us/:id                             admin only
 *
 * Reading is open to guards (the mobile app's Contact Us screen); changing
 * the directory is admin-only. Errors are { error: "..." } like the rest of
 * this API.
 */
const express = require('express');
const mongoose = require('mongoose');
const ContactUs = require('../models/ContactUs');

const { requireRole } = require('../middleware/auth');

const router = express.Router();

const MOBILE_PATTERN = /^\+?[0-9][0-9\s-]{6,17}$/;
const MAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELDS = ['dept', 'name', 'designation', 'role', 'mail', 'mobile'];

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Pulls the six known fields out of a request body as trimmed strings
// (anything that isn't a string is treated as "not sent"), ignoring every
// other key so nothing unexpected is ever written to the collection.
function pickFields(body) {
  const out = {};
  FIELDS.forEach((f) => {
    if (body && typeof body[f] === 'string') out[f] = body[f].trim();
  });
  return out;
}

// Returns an error message, or null when the values are fine. `partial`
// is false for create/replace (name + mobile must be present).
function validate(fields) {
  if (!fields.name) return 'name is required.';
  if (!fields.mobile) return 'mobile is required.';
  if (!MOBILE_PATTERN.test(fields.mobile)) return 'mobile must be a valid phone number.';
  if (fields.mail && !MAIL_PATTERN.test(fields.mail)) return 'mail must be a valid email address.';
  return null;
}

function validId(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ error: 'Invalid contact id.' });
    return false;
  }
  return true;
}

// GET /api/contact-us?search=&dept=&page=1&limit=50
//   search - optional, matches name / designation / role / dept / mail / mobile
//   dept   - optional, exact department (case-insensitive)
// Returns { data, total, page, limit, totalPages }, sorted by name.
router.get('/', async (req, res) => {
  try {
    const filter = {};

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    if (search) {
      const re = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ name: re }, { designation: re }, { role: re }, { dept: re }, { mail: re }, { mobile: re }];
    }

    const dept = typeof req.query.dept === 'string' ? req.query.dept.trim() : '';
    if (dept) {
      filter.dept = new RegExp(`^${escapeRegex(dept)}$`, 'i');
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      ContactUs.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
      ContactUs.countDocuments(filter),
    ]);

    res.json({ data, total, page, limit, totalPages: Math.max(Math.ceil(total / limit), 1) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching contacts.' });
  }
});

// GET /api/contact-us/:id
router.get('/:id', async (req, res) => {
  try {
    if (!validId(req, res)) return;
    const doc = await ContactUs.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Contact not found.' });
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching contact.' });
  }
});

// POST /api/contact-us  { name, mobile, dept?, designation?, role?, mail? }
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const fields = pickFields(req.body);
    const problem = validate(fields);
    if (problem) return res.status(400).json({ error: problem });

    const existing = await ContactUs.findOne({ mobile: fields.mobile });
    if (existing) {
      return res.status(409).json({ error: 'A contact with that mobile number already exists.' });
    }

    const doc = await ContactUs.create(fields);
    res.status(201).json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error creating contact.' });
  }
});

// PUT /api/contact-us/:id  { name, mobile, dept?, designation?, role?, mail? }
// Replaces the editable fields. Optional fields left out are cleared.
router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    if (!validId(req, res)) return;

    const fields = pickFields(req.body);
    const problem = validate(fields);
    if (problem) return res.status(400).json({ error: problem });

    const dupe = await ContactUs.findOne({ _id: { $ne: req.params.id }, mobile: fields.mobile });
    if (dupe) {
      return res.status(409).json({ error: 'Another contact already uses that mobile number.' });
    }

    const update = { dept: '', designation: '', role: '', mail: '', ...fields };
    const doc = await ContactUs.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ error: 'Contact not found.' });
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error updating contact.' });
  }
});

// DELETE /api/contact-us/:id
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    if (!validId(req, res)) return;
    const doc = await ContactUs.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Contact not found.' });
    res.json({ deleted: true, name: doc.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error deleting contact.' });
  }
});

module.exports = router;
