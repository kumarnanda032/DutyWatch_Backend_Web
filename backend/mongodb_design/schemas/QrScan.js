const mongoose = require('mongoose');
const { Schema } = mongoose;

const QrScanSchema = new Schema(
  {
    assignmentId: { type: Schema.Types.ObjectId, ref: 'DutyAssignment' },
    dateRange: { type: String, required: true },
    guardEmpId: { type: String, required: true },
    guardName: { type: String, required: true },
    scannedSubPlace: { type: String, required: true },
    qrCode: { type: String, required: true },
    scannedAt: { type: Date, required: true, default: Date.now },
    verifiedByAdmin: { type: Boolean, default: false },
  },
  { timestamps: true }
);

QrScanSchema.index({ guardEmpId: 1, dateRange: 1 });
QrScanSchema.index({ scannedAt: -1 });

module.exports = mongoose.model('QrScan', QrScanSchema);
