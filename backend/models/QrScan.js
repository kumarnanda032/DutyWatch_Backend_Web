const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * One scan = a guard (or admin) scanning the QR code posted at a sub place.
 * Every scan is validated against that person's own DutyAssignment for
 * today before it's ever saved (see routes/qrScans.js) - scannedSubPlace,
 * mainPlace, dateRange, and guardName are all copied from that assignment
 * at scan time, not trusted from the client, so this record is always
 * consistent with what they were actually assigned.
 *
 * There's no separate `qrCode` field - the sub place's QR encodes its exact
 * name (see qrcode-tool.js in public/js), so scannedSubPlace *is* the
 * decoded QR payload.
 */
const QrScanSchema = new Schema(
  {
    assignmentId: { type: Schema.Types.ObjectId, ref: 'DutyAssignment', required: true },
    guardEmpId: { type: String, required: true, trim: true },
    guardName: { type: String, required: true, trim: true },
    mainPlace: { type: String, required: true, trim: true },
    scannedSubPlace: { type: String, required: true, trim: true },
    dateRange: { type: String, required: true },
    scannedAt: { type: Date, required: true, default: Date.now },
    // Device GPS coordinates captured on the phone at the moment of
    // scanning (see lib/services/location_service.dart in the Flutter app).
    // Both optional - a scan is still saved without them if location
    // permission was denied, the device's location service was off, or the
    // fix simply timed out; location is a supplement to attendance, not a
    // requirement for it.
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
  },
  { timestamps: true }
);

QrScanSchema.index({ guardEmpId: 1, dateRange: 1 });
QrScanSchema.index({ scannedAt: -1 });

module.exports = mongoose.model('QrScan', QrScanSchema);
