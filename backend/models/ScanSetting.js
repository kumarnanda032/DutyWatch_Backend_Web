const mongoose = require('mongoose');
const { Schema } = mongoose;

// Stored as 24-hour "HH:mm" (e.g. "18:00"), not 12-hour + AM/PM - that
// keeps comparisons/validation simple; the admin UI converts to and from
// 12-hour + AM/PM only for display (see js/admin.js).
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The single global window during which QR scans are accepted (e.g. guards
 * may only scan between 18:00 and 06:00). There is only ever one document
 * in this collection - routes/scanSettings.js always reads/writes the first
 * one it finds (or creates it on the first save).
 */
const ScanSettingSchema = new Schema(
  {
    from: { type: String, required: true, match: TIME_PATTERN },
    to: { type: String, required: true, match: TIME_PATTERN },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ScanSetting', ScanSettingSchema);
