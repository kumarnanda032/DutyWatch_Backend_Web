const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * One duty assignment = one guard covering one or more duty places for one
 * duty date. `dutyPlaces` holds the place names (exactly as stored on the
 * DutyPlace documents - the QR code at each place encodes that same text).
 *
 * A guard can only have a single assignment per dateRange - enforced by the
 * unique compound index below - matching the "a duty is unique per user"
 * requirement from the admin dashboard's Assign Duty screen.
 */
// Day Duty covers ONE date ("10-01-2024"); Night Duty runs overnight and covers
// TWO ("10-01-2024_11-01-2024"). Duties saved before duty types existed have no
// dutyType and are treated as Night Duty (they already use the two-date format).
const DUTY_TYPES = ['Day Duty', 'Night Duty'];

const DutyAssignmentSchema = new Schema(
  {
    guardEmpId: { type: String, required: true, trim: true }, // matches User.roll_no
    guardName: { type: String, required: true, trim: true },
    dutyPlaces: { type: [String], required: true },
    dutyType: { type: String, enum: DUTY_TYPES },
    dutyDate: { type: Date, required: true }, // the day the (overnight) shift starts
    dateRange: { type: String, required: true }, // display form, e.g. "10-01-2024_11-01-2024"
    assignedBy: { type: String, default: 'admin' },
  },
  { timestamps: true }
);

DutyAssignmentSchema.index({ guardEmpId: 1, dateRange: 1 }, { unique: true });

module.exports = mongoose.model('DutyAssignment', DutyAssignmentSchema);
