const express = require('express');
const DutyPlace = require('../models/DutyPlace');

const { requireRole } = require('../middleware/auth');

const router = express.Router();

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Only leading/trailing whitespace is touched - the name itself (spaces,
// casing) is kept exactly as the user typed it, because the place's QR code
// encodes this exact text.
function cleanName(value) {
  return String(value || '').trim();
}

function sameNameRegex(name) {
  return new RegExp(`^${escapeRegex(name)}$`, 'i');
}

// A duplicate-key error only means "name already exists" when the clash is on
// `place`. Any other index clash is a database problem, not a duplicate name.
function legacyIndexOr409(err, res, message) {
  const keys = Object.keys(err.keyPattern || {});
  if (keys.length && !keys.includes('place')) {
    console.error('Duty place save blocked by an unexpected index on:', keys.join(', '));
    return res.status(500).json({ error: 'Could not save the duty place. Restart the server and try again.' });
  }
  return res.status(409).json({ error: message });
}

// GET /api/duty-places?search=&page=1&limit=10
//   search - optional, matches the duty place name (case-insensitive, partial)
// Returns { data, total, page, limit, totalPages }
router.get('/', async (req, res) => {
  try {
    const filter = {};
    const search = (req.query.search || '').trim();
    if (search) {
      filter.place = new RegExp(escapeRegex(search), 'i');
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
// Count for the admin Home dashboard's "Duty places" card, read straight from
// the DutyPlace collection (the master list of places), not from
// DutyAssignment - so it reflects every place that exists, whether or not a
// guard is currently assigned to it.
router.get('/stats', async (req, res) => {
  try {
    const totalDutyPlaces = await DutyPlace.countDocuments({});
    res.json({ totalDutyPlaces });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching duty place stats.' });
  }
});

// GET /api/duty-places/options
// Lightweight, unpaginated list (sorted alphabetically) used to populate the
// Assign Duty place picker and the Generate QR Code dropdown.
router.get('/options', async (req, res) => {
  try {
    const data = await DutyPlace.find({}).sort({ place: 1 }).select('place createdAt');
    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching duty place options.' });
  }
});

// POST /api/duty-places  { place }  or  { places: [place, ...] }
// Creates one duty place, or several at once. With `places`, each is handled
// independently: new ones are saved, blanks / repeats / names that already
// exist are skipped and reported. Response (places form):
//   201 { added: [doc, ...], skipped: [{ place, reason }, ...] }   (400 if nothing was added)
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    if (Array.isArray(req.body.places || req.body.names)) {
      const added = [];
      const skipped = [];
      const seen = new Set();

      for (const raw of (req.body.places || req.body.names)) {
        const name = cleanName(raw);
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) {
          skipped.push({ place: name, reason: 'Listed more than once.' });
          continue;
        }
        seen.add(key);

        if (await DutyPlace.findOne({ place: sameNameRegex(name) })) {
          skipped.push({ place: name, reason: 'Already exists.' });
          continue;
        }
        try {
          added.push(await DutyPlace.create({ place: name }));
        } catch (rowErr) {
          if (rowErr.code === 11000) {
            const keys = Object.keys(rowErr.keyPattern || {});
            if (keys.length && !keys.includes('place')) throw rowErr; // leftover index - handled below
            skipped.push({ place: name, reason: 'Already exists.' });
          } else {
            skipped.push({ place: name, reason: rowErr.message || 'Could not save.' });
          }
        }
      }

      if (added.length === 0 && skipped.length === 0) {
        return res.status(400).json({ error: 'Duty place name is required.' });
      }
      if (added.length === 0) {
        return res.status(409).json({ error: 'Nothing was added - those duty places already exist.', added, skipped });
      }
      return res.status(201).json({ added, skipped });
    }

    const name = cleanName((req.body.place !== undefined ? req.body.place : req.body.name));
    if (!name) {
      return res.status(400).json({ error: 'Duty place name is required.' });
    }

    const existing = await DutyPlace.findOne({ place: sameNameRegex(name) });
    if (existing) {
      return res.status(409).json({ error: 'That duty place already exists.' });
    }

    const doc = await DutyPlace.create({ place: name });
    res.status(201).json(doc);
  } catch (err) {
    console.error(err);
    if (err.code === 11000) {
      return legacyIndexOr409(err, res, 'That duty place already exists.');
    }
    res.status(500).json({ error: 'Server error creating duty place.' });
  }
});

// PUT /api/duty-places/:id  { place }
// Renames a duty place. Note: existing assignments and scans keep the name
// they were saved with, and a printed QR code still carries the old text.
router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    const name = cleanName((req.body.place !== undefined ? req.body.place : req.body.name));
    if (!name) {
      return res.status(400).json({ error: 'Duty place name is required.' });
    }

    const doc = await DutyPlace.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ error: 'Duty place not found.' });
    }

    const dupe = await DutyPlace.findOne({ _id: { $ne: doc._id }, place: sameNameRegex(name) });
    if (dupe) {
      return res.status(409).json({ error: 'Another duty place already uses that name.' });
    }

    doc.place = name;
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error(err);
    if (err.code === 11000) {
      return legacyIndexOr409(err, res, 'Another duty place already uses that name.');
    }
    res.status(500).json({ error: 'Server error updating duty place.' });
  }
});

// DELETE /api/duty-places/:id
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const doc = await DutyPlace.findByIdAndDelete(req.params.id);
    if (!doc) {
      return res.status(404).json({ error: 'Duty place not found.' });
    }
    res.json({ deleted: true, place: doc.place });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error deleting duty place.' });
  }
});

module.exports = router;
