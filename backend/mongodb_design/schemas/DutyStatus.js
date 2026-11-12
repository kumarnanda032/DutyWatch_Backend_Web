const mongoose = require('mongoose');
const { Schema } = mongoose;

const DutyStatusSchema = new Schema(
  {
    assignmentId: { type: Schema.Types.ObjectId, ref: 'DutyAssignment' },
    dateRange: { type: String, required: true },
    guardEmpId: { type: String, required: true },
    guardName: { type: String, required: true },
    totalDutyPlaces: { type: Number, required: true },
    scannedDutyPlaces: { type: Number, default: 0 },
    isComplete: { type: Boolean, default: false },
    lastUpdated: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

DutyStatusSchema.index({ guardEmpId: 1, dateRange: 1 }, { unique: true });

module.exports = mongoose.model('DutyStatus', DutyStatusSchema);
