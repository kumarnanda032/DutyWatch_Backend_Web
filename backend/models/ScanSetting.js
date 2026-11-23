const mongoose = require('mongoose');
const { Schema } = mongoose;

// Stored as 24-hour "HH:mm" (e.g. "18:00"), not 12-hour + AM/PM - that
// keeps comparisons/validation simple; the admin UI converts to and from
// 12-hour + AM/PM only for display (see js/admin.js).
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const DUTY_TYPES = ['Day Duty', 'Night Duty'];

/**
 * Windows during which QR scans are accepted (e.g. 07:00-18:00 for Day Duty,
 * 19:30-06:30 for Night Duty). Up to three documents live in this collection:
 *   dutyType 'Day Duty'   - the Day window
 *   dutyType 'Night Duty'  - the Night window
 *   (no dutyType)          - the original single/general window saved before
 *                            Day/Night existed; kept so nothing already saved
 *                            is lost and older app versions keep working.
 */
const ScanSettingSchema = new Schema(
  {
    dutyType: { type: String, enum: DUTY_TYPES },
    from: { type: String, required: true, match: TIME_PATTERN },
    to: { type: String, required: true, match: TIME_PATTERN },
  },
  { timestamps: true }
);

// One window per duty type (documents without a dutyType are not constrained).
ScanSettingSchema.index(
  { dutyType: 1 },
  { unique: true, partialFilterExpression: { dutyType: { $type: 'string' } } }
);

module.exports = mongoose.model('ScanSetting', ScanSettingSchema);
