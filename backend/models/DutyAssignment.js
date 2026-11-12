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
const DutyAssignmentSchema = new Schema(
  {
    guardEmpId: { type: String, required: true, trim: true }, // matches User.roll_no
    guardName: { type: String, required: true, trim: true },
    dutyPlaces: { type: [String], required: true },
    dutyDate: { type: Date, required: true }, // the day the (overnight) shift starts
    dateRange: { type: String, required: true }, // display form, e.g. "10-01-2024_11-01-2024"
    assignedBy: { type: String, default: 'admin' },
  },
  { timestamps: true }
);

DutyAssignmentSchema.index({ guardEmpId: 1, dateRange: 1 }, { unique: true });

module.exports = mongoose.model('DutyAssignment', DutyAssignmentSchema);
