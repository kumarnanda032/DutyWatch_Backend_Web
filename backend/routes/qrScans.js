const express = require('express');
const QrScan = require('../models/QrScan');
const DutyAssignment = require('../models/DutyAssignment');
const ScanSetting = require('../models/ScanSetting');

// India doesn't observe DST, so a fixed UTC+5:30 offset is always correct -
// matches the tzOffset convention already used for duty-date bounds
// elsewhere in this app. The admin's "Set Scan Time" window and every
// guard's phone are both assumed to be on IST wall-clock time.
const IST_OFFSET_MINUTES = 330;

// "HH:mm" -> minutes since midnight.
function minutesOf(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Whether the current moment falls inside the admin-configured scan window
// (handles a window that crosses midnight, e.g. "21:00" - "05:00"). Returns
// true (open) if no window has been saved yet - the admin hasn't chosen to
// restrict scanning, so the server shouldn't invent a restriction. Takes the
// ScanSetting doc rather than querying for it itself, so the POST /
// handler below can reuse the same doc to build its error message.
function isWithinScanWindow(setting) {
  if (!setting) return true;

  const nowIst = new Date(Date.now() + IST_OFFSET_MINUTES * 60000);
  const nowMin = nowIst.getUTCHours() * 60 + nowIst.getUTCMinutes();
  const fromMin = minutesOf(setting.from);
  const toMin = minutesOf(setting.to);
  if (fromMin === toMin) return true; // from == to -> treat as "no restriction"

  return fromMin < toMin
    ? nowMin >= fromMin && nowMin < toMin // same-day window
    : nowMin >= fromMin || nowMin < toMin; // overnight window
}

// "21:00" -> "9:00 PM", for the rejection message below.
function formatHHmm(hhmm) {
  const [hStr, minute] = hhmm.split(':');
  let h = parseInt(hStr, 10);
  const amPm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${minute} ${amPm}`;
}

const { requireRole, ownGuardOrAdmin, selfOrAdminParam } = require('../middleware/auth');

const router = express.Router();

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// [start, end) UTC bounds of today's calendar day - the same rule
// routes/dutyAssignments.js uses to decide what counts as "today".
function todayBoundsUTC() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

// Same as todayBoundsUTC() but for an arbitrary "YYYY-MM-DD" string, matching
// routes/dutyAssignments.js's dayBoundsUTC() - used by /coverage to look up a
// chosen date rather than always today. Returns null if dateStr is invalid.
// "completed" / "today" / "upcoming" for a dutyDate - same rule as the admin
// duty-assignments route.
function dutyStatus(dutyDate) {
  const bounds = todayBoundsUTC();
  const d = new Date(dutyDate);
  if (d < bounds.start) return 'completed';
  if (d < bounds.end) return 'today';
  return 'upcoming';
}

function dayBoundsUTC(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

// GET /api/qr-scans?search=&date=&page=1&limit=10
//   search - optional, matches guard name/employee ID, main place, or sub place
//   date   - optional, "YYYY-MM-DD"; restricts to scans made on that
//            calendar day - used by the admin Home page's "QR scans today"
//            stat (?date=<today>&limit=1, reading just `total`).
// Every scan recorded by every guard - the admin's "Get QR Code Data"
// screen.
router.get('/', requireRole('admin'), async (req, res) => {
  try {
    const filter = {};
    const search = (req.query.search || '').trim();
    if (search) {
      const re = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ guardName: re }, { guardEmpId: re }, { mainPlace: re }, { scannedSubPlace: re }];
    }

    const dateStr = (req.query.date || '').trim();
    if (dateStr) {
      const bounds = dayBoundsUTC(dateStr);
      if (bounds) filter.scannedAt = { $gte: bounds.start, $lt: bounds.end };
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 10000);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      QrScan.find(filter).sort({ scannedAt: -1 }).skip(skip).limit(limit),
      QrScan.countDocuments(filter),
    ]);

    res.json({ data, total, page, limit, totalPages: Math.max(Math.ceil(total / limit), 1) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching scans.' });
  }
});

// GET /api/qr-scans/mine?guardEmpId=2758&date=YYYY-MM-DD
// One guard's own scan history, most recent first - the mobile app's
// "Get QR Code Data" screen and the web guard panel's "Logs/Data" tab.
//   date - optional, "YYYY-MM-DD" = the DUTY date. Returns every scan made
//          on the duty that starts that day (DutyAssignment.dutyDate is "the
//          day the overnight shift starts"), so a 6 PM - 6 AM shift keeps
//          its after-midnight scans under the day it began - the same rule
//          the admin's date picker (/coverage) uses. Leave it out for the
//          guard's full history ("All").
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
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return res.status(400).json({ error: 'Invalid date. Use YYYY-MM-DD.' });
      }
      const bounds = dayBoundsUTC(dateStr);
      if (!bounds) {
        return res.status(400).json({ error: 'Invalid date.' });
      }
      const assignments = await DutyAssignment.find({
        guardEmpId,
        dutyDate: { $gte: bounds.start, $lt: bounds.end },
      }).select('_id').lean();
      if (assignments.length === 0) {
        return res.json({ data: [], total: 0 });
      }
      filter.assignmentId = { $in: assignments.map((a) => a._id) };
    }

    const data = await QrScan.find(filter).sort({ scannedAt: -1 }).lean();
    res.json({ data, total: data.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching your scans.' });
  }
});

// GET /api/qr-scans/coverage?date=YYYY-MM-DD&guardEmpId=2758
//   date        - "YYYY-MM-DD"; which calendar day's duties to check.
//                 Required, EXCEPT when guardEmpId is given - then leaving it
//                 out returns EVERY duty ever assigned to that guard (past,
//                 today and upcoming), each tagged with a "completed" /
//                 "today" / "upcoming" status - the guard panel's Home page
//                 "My Duties" table and Logs/Data "All" view.
//   guardEmpId  - optional; when given, only that guard's own duty for the
//                 day (the mobile app's guard "Get QR Code Data" screen).
//                 When omitted, every duty assigned that day (the admin
//                 screen), one entry per guard.
//
// For each matching DutyAssignment, returns its sub places each tagged with
// whether a QrScan exists for it on that duty - this is what lets a screen
// highlight a sub place nobody scanned. Every scan of that sub place is
// included (oldest first), not just the most recent one, so a screen can
// show the full visit history with serial numbers.
router.get('/coverage', ownGuardOrAdmin, async (req, res) => {
  try {
    const dateStr = (req.query.date || '').trim();
    // typeof check: Express parses ?guardEmpId[$ne]=x into an object, which
    // would otherwise be passed straight into the Mongo query.
    const guardEmpId = typeof req.query.guardEmpId === 'string' ? req.query.guardEmpId.trim() : '';

    let filter;
    if (dateStr) {
      const bounds = dayBoundsUTC(dateStr);
      if (!bounds) {
        return res.status(400).json({ error: 'Invalid date.' });
      }
      filter = { dutyDate: { $gte: bounds.start, $lt: bounds.end } };
      if (guardEmpId) filter.guardEmpId = guardEmpId;
    } else if (guardEmpId) {
      filter = { guardEmpId }; // every duty this guard has - past, today and upcoming
    } else {
      return res.status(400).json({ error: 'date is required (YYYY-MM-DD).' });
    }

    const assignments = await DutyAssignment.find(filter).sort({ dutyDate: -1, mainPlace: 1 }).lean();
    if (assignments.length === 0) {
      return res.json({ data: [], total: 0 });
    }

    const scans = await QrScan.find({
      assignmentId: { $in: assignments.map((a) => a._id) },
    })
      .sort({ scannedAt: 1 })
      .lean();

    // assignmentId -> (subPlace name -> every scan of it, oldest first)
    const byAssignment = new Map();
    for (const scan of scans) {
      const key = String(scan.assignmentId);
      if (!byAssignment.has(key)) byAssignment.set(key, new Map());
      const bySubPlace = byAssignment.get(key);
      if (!bySubPlace.has(scan.scannedSubPlace)) bySubPlace.set(scan.scannedSubPlace, []);
      bySubPlace.get(scan.scannedSubPlace).push(scan);
    }

    const data = assignments.map((a) => {
      const bySubPlace = byAssignment.get(String(a._id)) || new Map();
      return {
        guardEmpId: a.guardEmpId,
        guardName: a.guardName,
        mainPlace: a.mainPlace,
        dateRange: a.dateRange,
        dutyDate: a.dutyDate,
        status: dutyStatus(a.dutyDate),
        subPlaces: a.subPlaces.map((name) => {
          const subScans = bySubPlace.get(name) || [];
          return {
            name,
            scanned: subScans.length > 0,
            // Just the timestamps (what older clients already read)...
            scans: subScans.map((x) => x.scannedAt),
            // ...and the same scans, in the same order, with where the phone
            // was at the time. latitude/longitude are null for a scan saved
            // without a GPS fix.
            scanDetails: subScans.map((x) => ({
              scannedAt: x.scannedAt,
              latitude: x.latitude ?? null,
              longitude: x.longitude ?? null,
            })),
          };
        }),
      };
    });

    res.json({ data, total: data.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching scan coverage.' });
  }
});

// POST /api/qr-scans  { guardEmpId, scannedSubPlace }
// The mobile app's Scan QR Code screen calls this once someone taps Submit
// on a scanned code. Nothing is trusted from the client beyond *who* is
// scanning and *what text* their camera read - guardName, mainPlace and
// dateRange are all pulled from that person's own DutyAssignment for today,
// and the scan is rejected outright unless the scanned text exactly matches
// one of that assignment's sub places. This is the "only store it if that
// sub place is actually assigned to this user today" rule.
router.post('/', ownGuardOrAdmin, async (req, res) => {
  try {
    const guardEmpId = String(req.body.guardEmpId || '').trim();
    const scannedSubPlace = String(req.body.scannedSubPlace || '').trim();

    if (!guardEmpId) {
      return res.status(400).json({ error: 'guardEmpId is required.' });
    }
    if (!scannedSubPlace) {
      return res.status(400).json({ error: 'No QR data to submit.' });
    }

    // Optional device GPS coordinates from the phone (OpenStreetMap-style -
    // raw lat/lng, no Google API key involved). Left out of the saved scan
    // entirely when missing or out of range, rather than saved as some
    // placeholder value, so "no location" stays genuinely distinguishable
    // from "at 0,0".
    let latitude, longitude;
    if (req.body.latitude != null && req.body.longitude != null) {
      const lat = Number(req.body.latitude);
      const lng = Number(req.body.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        latitude = lat;
        longitude = lng;
      }
    }

    const scanSetting = await ScanSetting.findOne({});
    if (!isWithinScanWindow(scanSetting)) {
      return res.status(400).json({
        error: `Scanning is only accepted between ${formatHHmm(scanSetting.from)} and ${formatHHmm(scanSetting.to)}.`,
      });
    }

    const { start, end } = todayBoundsUTC();
    const assignment = await DutyAssignment.findOne({
      guardEmpId,
      dutyDate: { $gte: start, $lt: end },
    });

    if (!assignment) {
      return res.status(404).json({ error: 'You have no duty assigned for today.' });
    }

    const isAssigned = assignment.subPlaces.some((s) => s === scannedSubPlace);
    if (!isAssigned) {
      return res.status(400).json({
        error: `"${scannedSubPlace}" is not part of your assigned duty today (${assignment.mainPlace}).`,
      });
    }

    const scan = await QrScan.create({
      assignmentId: assignment._id,
      guardEmpId: assignment.guardEmpId,
      guardName: assignment.guardName,
      mainPlace: assignment.mainPlace,
      scannedSubPlace,
      dateRange: assignment.dateRange,
      scannedAt: new Date(),
      // Only set when the phone sent a valid fix (see above).
      ...(latitude !== undefined ? { latitude, longitude } : {}),
    });

    res.status(201).json(scan);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error saving the scan.' });
  }
});

module.exports = router;
