const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * A duty place is a main site ("main place") containing one or more
 * sub-places. Names are stored exactly as entered (only leading/trailing
 * whitespace is trimmed - internal spaces and casing are left untouched).
 *
 * `timestamps: true` gives every document createdAt / updatedAt, which the
 * admin UI shows as "Added On" in the Existing Duty Places tab.
 */
const SubPlaceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const DutyPlaceSchema = new Schema(
  {
    mainPlace: { type: String, required: true, unique: true, trim: true },
    subPlaces: { type: [SubPlaceSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DutyPlace', DutyPlaceSchema);
