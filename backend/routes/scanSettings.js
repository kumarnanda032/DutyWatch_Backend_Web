const express = require('express');
const ScanSetting = require('../models/ScanSetting');

const { requireRole } = require('../middleware/auth');

const router = express.Router();

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// request "type" -> the dutyType stored in MongoDB.
const DUTY_TYPE = { day: 'Day Duty', night: 'Night Duty' };

const win = (doc) => ({ from: (doc && doc.from) || null, to: (doc && doc.to) || null });

async function readAll() {
  const docs = await ScanSetting.find({});
  const general = docs.find((d) => !d.dutyType);
  return {
    // Top-level from/to = the original general window (older clients unchanged).
    ...win(general),
    day: win(docs.find((d) => d.dutyType === 'Day Duty')),
    night: win(docs.find((d) => d.dutyType === 'Night Duty')),
  };
}

// GET /api/scan-settings
//   -> { from, to, day: { from, to }, night: { from, to } }  (nulls if never saved)
router.get('/', async (req, res) => {
  try {
    res.json(await readAll());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching the scan time window.' });
  }
});

// PUT /api/scan-settings  { type: "day" | "night", from: "HH:mm", to: "HH:mm" }
//   Saves that duty type's window (created on first save, overwritten after).
//   Without `type` it saves the original general window (older clients).
router.put('/', requireRole('admin'), async (req, res) => {
  try {
    const { type, from, to } = req.body || {};
    if (typeof from !== 'string' || typeof to !== 'string' || !TIME_PATTERN.test(from) || !TIME_PATTERN.test(to)) {
      return res.status(400).json({ error: 'from and to must both be 24-hour times in HH:mm form.' });
    }
    if (type !== undefined && !Object.prototype.hasOwnProperty.call(DUTY_TYPE, type)) {
      return res.status(400).json({ error: 'type must be "day" or "night".' });
    }

    const filter = type ? { dutyType: DUTY_TYPE[type] } : { dutyType: { $exists: false } };
    const update = type ? { from, to, dutyType: DUTY_TYPE[type] } : { from, to };
    const doc = await ScanSetting.findOneAndUpdate(filter, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
    res.json(type ? { type, ...win(doc) } : win(doc));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error saving the scan time window.' });
  }
});

module.exports = router;
