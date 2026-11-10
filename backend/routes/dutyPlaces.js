const express = require('express');
const DutyPlace = require('../models/DutyPlace');

const { requireRole } = require('../middleware/auth');

const router = express.Router();

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// De-dupes and trims a list of sub-place names, dropping blanks. Only
// leading/trailing whitespace is touched - the name itself (spaces,
// casing) is kept exactly as the user typed it.
function normalizeNames(list) {
  const seen = new Set();
  const out = [];
  (Array.isArray(list) ? list : []).forEach((n) => {
    const name = String(n || '').trim();
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      out.push(name);
    }
  });
  return out;
}

// GET /api/duty-places?search=&page=1&limit=10
//   search - optional, matches mainPlace or any sub-place name (case-insensitive, partial)
// Returns { data, total, page, limit, totalPages }
router.get('/', async (req, res) => {
  try {
    const filter = {};
    const search = (req.query.search || '').trim();
    if (search) {
      const re = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ mainPlace: re }, { 'subPlaces.name': re }];
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 10000);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      DutyPlace.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      DutyPlace.countDocuments(filter),
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
    res.status(500).json({ error: 'Server error fetching duty places.' });
  }
});

// GET /api/duty-places/stats
// Two counts for the admin Home dashboard's "Main locations" and "Sub
// places" cards, both read straight from the DutyPlace collection (the
// master list of sites), not from DutyAssignment - so the numbers reflect
// every sub-place that exists, whether or not a guard is currently assigned
// to it.
router.get('/stats', async (req, res) => {
  try {
    const [totalMainPlaces, subPlaceAgg] = await Promise.all([
      DutyPlace.countDocuments({}),
      DutyPlace.aggregate([
        { $project: { subPlaceCount: { $size: { $ifNull: ['$subPlaces', []] } } } },
        { $group: { _id: null, total: { $sum: '$subPlaceCount' } } },
      ]),
    ]);
    const totalSubPlaces = subPlaceAgg.length ? subPlaceAgg[0].total : 0;
    res.json({ totalMainPlaces, totalSubPlaces });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching duty place stats.' });
  }
});

// GET /api/duty-places/options
// Lightweight, unpaginated list (sorted alphabetically) used to populate the
// "Add Sub Places" main-place dropdown and similar pickers.
router.get('/options', async (req, res) => {
  try {
    const data = await DutyPlace.find({}).sort({ mainPlace: 1 }).select('mainPlace subPlaces createdAt');
    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching duty place options.' });
  }
});

// POST /api/duty-places  { mainPlace, subPlaces: [name, ...] }
// Creates a new main place with one or more sub-places.
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const mainPlace = String(req.body.mainPlace || '').trim();
    const names = normalizeNames(req.body.subPlaces);

    if (!mainPlace) {
      return res.status(400).json({ error: 'Main place is required.' });
    }
    if (names.length === 0) {
      return res.status(400).json({ error: 'At least one sub place is required.' });
    }

    const existing = await DutyPlace.findOne({ mainPlace: new RegExp(`^${escapeRegex(mainPlace)}$`, 'i') });
    if (existing) {
      return res.status(409).json({ error: 'That main place already exists.' });
    }

    const subPlaces = names.map((name) => ({ name }));
    const doc = await DutyPlace.create({ mainPlace, subPlaces });
    res.status(201).json(doc);
  } catch (err) {
    console.error(err);
    if (err.code === 11000) {
      return res.status(409).json({ error: 'That main place already exists.' });
    }
    res.status(500).json({ error: 'Server error creating duty place.' });
  }
});

// POST /api/duty-places/:id/sub-places  { subPlaces: [name, ...] }
// Adds one or more new sub-places to an existing main place.
router.post('/:id/sub-places', requireRole('admin'), async (req, res) => {
  try {
    const names = normalizeNames(req.body.subPlaces);
    if (names.length === 0) {
      return res.status(400).json({ error: 'At least one sub place is required.' });
    }

    const doc = await DutyPlace.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ error: 'Duty place not found.' });
    }

    const existingLower = new Set(doc.subPlaces.map((s) => s.name.toLowerCase()));
    const toAdd = names.filter((n) => !existingLower.has(n.toLowerCase()));
    if (toAdd.length === 0) {
      return res.status(409).json({ error: 'All of those sub places already exist for this location.' });
    }

    toAdd.forEach((name) => doc.subPlaces.push({ name }));
    await doc.save();
    res.status(201).json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error adding sub places.' });
  }
});

// PUT /api/duty-places/:id  { mainPlace, subPlaces: [name, ...] }
// Edits the main place name and/or its full list of sub-place names.
router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    const mainPlace = String(req.body.mainPlace || '').trim();
    const names = normalizeNames(req.body.subPlaces);

    if (!mainPlace) {
      return res.status(400).json({ error: 'Main place is required.' });
    }
    if (names.length === 0) {
      return res.status(400).json({ error: 'At least one sub place is required.' });
    }

    const doc = await DutyPlace.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ error: 'Duty place not found.' });
    }

    const dupe = await DutyPlace.findOne({
      _id: { $ne: doc._id },
      mainPlace: new RegExp(`^${escapeRegex(mainPlace)}$`, 'i'),
    });
    if (dupe) {
      return res.status(409).json({ error: 'Another duty place already uses that main place name.' });
    }

    doc.mainPlace = mainPlace;
    doc.subPlaces = names.map((name) => ({ name }));

    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error(err);
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Another duty place already uses that main place name.' });
    }
    res.status(500).json({ error: 'Server error updating duty place.' });
  }
});

// DELETE /api/duty-places/:id
// Removes the main place and all of its sub-places.
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const doc = await DutyPlace.findByIdAndDelete(req.params.id);
    if (!doc) {
      return res.status(404).json({ error: 'Duty place not found.' });
    }
    res.json({ deleted: true, mainPlace: doc.mainPlace });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error deleting duty place.' });
  }
});

module.exports = router;
