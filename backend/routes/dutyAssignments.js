const express = require('express');
const DutyAssignment = require('../models/DutyAssignment');

const { requireRole, ownGuardOrAdmin, selfOrAdminParam } = require('../middleware/auth');

const router = express.Router();

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toDDMMYYYY(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

// Duty shifts run overnight, so the display range is "start day_next day",
// e.g. "10-01-2024_11-01-2024" - matching the format already used elsewhere
// in the app. Returns null if dutyDateStr isn't a valid date.
function computeDateRange(dutyDateStr) {
  const start = new Date(dutyDateStr);
  if (isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return `${toDDMMYYYY(start)}_${toDDMMYYYY(end)}`;
}

// Returns the [start, end) UTC bounds of the calendar day named by a
// "YYYY-MM-DD" string, matching how `new Date('YYYY-MM-DD')` (used when a
// dutyDate is first saved) is always parsed as UTC midnight - so filtering
// with these bounds correctly finds "all assignments on this day" regardless
// of the server's own timezone. Returns null if dateStr isn't a valid date.
function dayBoundsUTC(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

// "completed" / "today" / "upcoming" for a dutyDate, using the same UTC-day
// rule as isCompleted() below (a duty is completed once its dutyDate is
// strictly before today). Used by the guard dashboard.
function dutyStatus(dutyDate) {
  const bounds = dayBoundsUTC(new Date().toISOString().slice(0, 10));
  const d = new Date(dutyDate);
  if (d < bounds.start) return 'completed';
  if (d < bounds.end) return 'today';
  return 'upcoming';
}

// GET /api/duty-assignments?search=&date=&page=1&limit=10
//   search - optional, matches guard name, main place, or any sub-place
// GET /api/duty-assignments/stats
// Two counts for the admin Home dashboard's "Active assignments" card:
// how many duty assignments exist in total, and how many sub places those
// assignments cover between them (each assignment's subPlaces.length,
// summed) - e.g. 12 assignments might cover 37 sub places between them.
// Not date-scoped, matching the existing "Active assignments" total.
router.get('/stats', requireRole('admin'), async (req, res) => {
  try {
    const [totalAssignments, subPlaceAgg] = await Promise.all([
      DutyAssignment.countDocuments({}),
      DutyAssignment.aggregate([
        { $project: { subPlaceCount: { $size: { $ifNull: ['$subPlaces', []] } } } },
        { $group: { _id: null, total: { $sum: '$subPlaceCount' } } },
      ]),
    ]);
    const totalSubPlaces = subPlaceAgg.length ? subPlaceAgg[0].total : 0;
    res.json({ totalAssignments, totalSubPlaces });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching assignment stats.' });
  }
});

//   date   - optional, "YYYY-MM-DD"; restricts to assignments whose dutyDate
//            falls on that calendar day (used by the "Show Assigned Duties"
//            date filter and by the Assign Duty board to look up what's
//            already scheduled for a chosen date)
router.get('/', requireRole('admin'), async (req, res) => {
  try {
    const filter = {};
    const search = (req.query.search || '').trim();
    if (search) {
      const re = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ guardName: re }, { guardEmpId: re }, { mainPlace: re }, { subPlaces: re }];
    }

    const dateStr = (req.query.date || '').trim();
    if (dateStr) {
      const bounds = dayBoundsUTC(dateStr);
      if (bounds) {
        filter.dutyDate = { $gte: bounds.start, $lt: bounds.end };
      }
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 10000);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      DutyAssignment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      DutyAssignment.countDocuments(filter),
    ]);

    res.json({ data, total, page, limit, totalPages: Math.max(Math.ceil(total / limit), 1) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching duty assignments.' });
  }
});

// GET /api/duty-assignments/mine?guardEmpId=2758&date=YYYY-MM-DD
// Powers the guard dashboard (Home). Returns ONLY the duties whose
// guardEmpId exactly equals the given roll number (the admin's "Assign Duty"
// screen stores the guard's roll_no there), oldest date first, each tagged
// with status: 'completed' | 'today' | 'upcoming'.
// Exact match on purpose - the admin list's `search` is a partial regex match,
// so "27" would also match guard "2758".
// `date` is optional - when given, restricts the result to the (at most one)
// duty whose dutyDate falls on that calendar day, powering the Home screen's
// date picker (today or an earlier date).
router.get('/mine', ownGuardOrAdmin, async (req, res) => {
  try {
    // typeof check: Express parses ?guardEmpId[$ne]=x into an object, which
    // would otherwise be passed straight into the Mongo query.
    const guardEmpId = typeof req.query.guardEmpId === 'string' ? req.query.guardEmpId.trim() : '';
    if (!guardEmpId) {
      return res.status(400).json({ error: 'guardEmpId is required.' });
    }

    const filter = { guardEmpId };
    const dateStr = typeof req.query.date === 'string' ? req.query.date.trim() : '';
    if (dateStr) {
      const bounds = dayBoundsUTC(dateStr);
      if (!bounds) {
        return res.status(400).json({ error: 'Invalid date.' });
      }
      filter.dutyDate = { $gte: bounds.start, $lt: bounds.end };
    }

    const docs = await DutyAssignment.find(filter).sort({ dutyDate: 1 }).lean();
    const data = docs.map((d) => ({ ...d, status: dutyStatus(d.dutyDate) }));

    res.json({ data, total: data.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching your duties.' });
  }
});

// POST /api/duty-assignments/bulk
//   { dutyDate, assignments: [ { guardEmpId, guardName, dutyPlaceId, mainPlace, subPlaces }, ... ] }
// Used by the drag-and-drop "Assign Duty to Guard" screen to submit every
// duty card built in one batch. Each row is validated and inserted
// independently (same pattern as /api/users/bulk) - one bad or duplicate
// row does not stop the rest. A guard can appear only once per batch, and
// only once per dateRange across the whole database.
router.post('/bulk', requireRole('admin'), async (req, res) => {
  try {
    const dateRange = computeDateRange(req.body.dutyDate);
    if (!dateRange) {
      return res.status(400).json({ error: 'A valid duty date is required.' });
    }

    const chosenBounds = dayBoundsUTC(req.body.dutyDate);
    const todayBounds = dayBoundsUTC(new Date().toISOString().slice(0, 10));
    if (chosenBounds && todayBounds && chosenBounds.start < todayBounds.start) {
      return res.status(400).json({ error: 'Duty date cannot be in the past. Choose today or a later date.' });
    }

    const items = Array.isArray(req.body.assignments) ? req.body.assignments : [];
    if (items.length === 0) {
      return res.status(400).json({ error: 'No duty assignments to submit.' });
    }

    const seenGuards = new Set();
    const results = [];
    let insertedCount = 0;

    for (let i = 0; i < items.length; i++) {
      const row = items[i] || {};
      const guardEmpId = String(row.guardEmpId || '').trim();
      const guardName = String(row.guardName || '').trim();
      const mainPlace = String(row.mainPlace || '').trim();
      const subPlaces = Array.isArray(row.subPlaces) ? row.subPlaces.map((s) => String(s).trim()).filter(Boolean) : [];

      if (!guardEmpId || !guardName || !mainPlace || subPlaces.length === 0) {
        results.push({ index: i, guardName, status: 'skipped', reason: 'Missing guard, main place, or sub places.' });
        continue;
      }
      if (seenGuards.has(guardEmpId)) {
        results.push({ index: i, guardName, status: 'skipped', reason: 'This guard already has a duty in this batch.' });
        continue;
      }

      try {
        const existing = await DutyAssignment.findOne({ guardEmpId, dateRange });
        if (existing) {
          results.push({ index: i, guardName, status: 'skipped', reason: `${guardName} already has a duty assigned for ${dateRange}.` });
          continue;
        }

        await DutyAssignment.create({
          guardEmpId,
          guardName,
          dutyPlaceId: row.dutyPlaceId || undefined,
          mainPlace,
          subPlaces,
          dutyDate: new Date(req.body.dutyDate),
          dateRange,
        });
        seenGuards.add(guardEmpId);
        insertedCount += 1;
        results.push({ index: i, guardName, status: 'inserted' });
      } catch (rowErr) {
        if (rowErr.code === 11000) {
          results.push({ index: i, guardName, status: 'skipped', reason: `${guardName} already has a duty assigned for ${dateRange}.` });
        } else {
          results.push({ index: i, guardName, status: 'skipped', reason: rowErr.message || 'Unknown error.' });
        }
      }
    }

    res.status(207).json({ insertedCount, skippedCount: results.length - insertedCount, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error submitting duty assignments.' });
  }
});

// A duty is "completed" once its dutyDate is strictly before today - the
// overnight shift has already happened. Completed duties are locked: no
// edits, no deletes (requirement: only upcoming/in-progress duties can be
// changed). Mirrors the same rule the frontend uses to grey out those
// row actions in the "Show Assigned Duties" table.
function isCompleted(dutyDate) {
  const bounds = dayBoundsUTC(new Date().toISOString().slice(0, 10));
  return bounds ? new Date(dutyDate) < bounds.start : false;
}

// PUT /api/duty-assignments/:id  { guardEmpId, guardName, dutyPlaceId, mainPlace, subPlaces, dutyDate }
router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    const guardEmpId = String(req.body.guardEmpId || '').trim();
    const guardName = String(req.body.guardName || '').trim();
    const mainPlace = String(req.body.mainPlace || '').trim();
    const subPlaces = Array.isArray(req.body.subPlaces) ? req.body.subPlaces.map((s) => String(s).trim()).filter(Boolean) : [];
    const dateRange = computeDateRange(req.body.dutyDate);

    if (!guardEmpId || !guardName || !mainPlace || subPlaces.length === 0 || !dateRange) {
      return res.status(400).json({ error: 'Guard, main place, sub places, and a valid duty date are all required.' });
    }

    const doc = await DutyAssignment.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ error: 'Duty assignment not found.' });
    }
    if (isCompleted(doc.dutyDate)) {
      return res.status(409).json({ error: 'This duty has already been completed and can no longer be edited.' });
    }

    const chosenBounds = dayBoundsUTC(req.body.dutyDate);
    const todayBounds = dayBoundsUTC(new Date().toISOString().slice(0, 10));
    if (chosenBounds && todayBounds && chosenBounds.start < todayBounds.start) {
      return res.status(400).json({ error: 'Duty date cannot be moved into the past. Choose today or a later date.' });
    }

    const dupe = await DutyAssignment.findOne({ _id: { $ne: doc._id }, guardEmpId, dateRange });
    if (dupe) {
      return res.status(409).json({ error: `${guardName} already has a duty assigned for ${dateRange}.` });
    }

    doc.guardEmpId = guardEmpId;
    doc.guardName = guardName;
    if (req.body.dutyPlaceId) doc.dutyPlaceId = req.body.dutyPlaceId;
    doc.mainPlace = mainPlace;
    doc.subPlaces = subPlaces;
    doc.dutyDate = new Date(req.body.dutyDate);
    doc.dateRange = dateRange;

    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error(err);
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Duplicate duty for this guard and date.' });
    }
    res.status(500).json({ error: 'Server error updating duty assignment.' });
  }
});

// DELETE /api/duty-assignments/:id
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const doc = await DutyAssignment.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ error: 'Duty assignment not found.' });
    }
    if (isCompleted(doc.dutyDate)) {
      return res.status(409).json({ error: 'This duty has already been completed and can no longer be deleted.' });
    }
    await doc.deleteOne();
    res.json({ deleted: true, guardName: doc.guardName, mainPlace: doc.mainPlace });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error deleting duty assignment.' });
  }
});

module.exports = router;
