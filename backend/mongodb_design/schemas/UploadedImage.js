const mongoose = require('mongoose');
const { Schema } = mongoose;

const UploadedImageSchema = new Schema(
  {
    guardEmpId: { type: String, required: true },
    guardName: { type: String, required: true },
    comment: { type: String, required: true, minlength: 3, maxlength: 500 }, // required at pick-time in the UI
    dateRange: { type: String, default: '' },
    place: { type: String, default: '' },
    imageUrl: { type: String, required: true },
    imagePath: { type: String, required: true },
    imageSizeBytes: { type: Number, required: true }, // enforced server-side: 10 KB - 2 MB
    mimeType: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

UploadedImageSchema.index({ guardEmpId: 1, dateRange: 1 });

module.exports = mongoose.model('UploadedImage', UploadedImageSchema);
