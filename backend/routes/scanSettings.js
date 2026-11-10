const express = require('express');
const ScanSetting = require('../models/ScanSetting');

const { requireRole } = require('../middleware/auth');

const router = express.Router();

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// GET /api/scan-settings  ->  the saved window, or { from: null, to: null }
// if the admin has never saved one yet. Powers the "Set Scan Time" tab
// showing the previously-saved time when it loads.
router.get('/', async (req, res) => {
  try {
    const doc = await ScanSetting.findOne({});
    res.json({ from: doc ? doc.from : null, to: doc ? doc.to : null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching the scan time window.' });
  }
});

// PUT /api/scan-settings  { from: "HH:mm", to: "HH:mm" }  ->  saves the
// window, creating it on the first save and overwriting it after that -
// there is only ever one of these documents.
router.put('/', requireRole('admin'), async (req, res) => {
  try {
    const { from, to } = req.body;
    if (!TIME_PATTERN.test(from) || !TIME_PATTERN.test(to)) {
      return res.status(400).json({ error: 'from and to must both be 24-hour times in HH:mm form.' });
    }
    const doc = await ScanSetting.findOneAndUpdate(
      {},
      { from, to },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ from: doc.from, to: doc.to });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error saving the scan time window.' });
  }
});

module.exports = router;
