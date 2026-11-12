const mongoose = require('mongoose');
const { Schema } = mongoose;

const DutyAssignmentSchema = new Schema(
  {
    dateRange: { type: String, required: true }, // e.g. "10-01-2024_11-01-2024"
    shiftStart: { type: Date, required: true },
    shiftEnd: { type: Date, required: true },
    guardEmpId: { type: String, required: true },
    guardName: { type: String, required: true },
    dutyPlaces: { type: [String], required: true },
    assignedBy: { type: String, default: 'admin' },
  },
  { timestamps: true }
);

DutyAssignmentSchema.index({ guardEmpId: 1, dateRange: 1 });

module.exports = mongoose.model('DutyAssignment', DutyAssignmentSchema);
