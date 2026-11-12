const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * A duty place is a single location a guard can be assigned to and scan a QR
 * code at (e.g. "North Gate", "Reception Lobby"). There are no main places or
 * sub-places - every duty place stands on its own and has its own QR code.
 *
 * The place text is stored exactly as entered (only leading/trailing whitespace is
 * trimmed - internal spaces and casing are left untouched), because the QR
 * code for the place encodes this exact text.
 *
 * `timestamps: true` gives every document createdAt / updatedAt, which the
 * admin UI shows as "Added On" in the Existing Duty Places tab.
 */
const DutyPlaceSchema = new Schema(
  {
    place: { type: String, required: true, unique: true, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DutyPlace', DutyPlaceSchema);
