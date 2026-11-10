const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * One site-visit photo submitted from the "Images" screen (admin.html's
 * Images tab and, once wired up the same way, user.html's Upload Images
 * tab). `guardEmpId` / `guardName` are never trusted from the client body -
 * routes/uploadedImages.js always fills them in from the logged-in user, the
 * same pattern routes/qrScans.js uses for its scans.
 *
 * `comment` is required - the person picking the photo must say what it
 * shows before it can be uploaded (enforced again here as a second line of
 * defense on top of the UI's own check).
 *
 * `imagePath` is where the file actually lives on disk under
 * web_frontend/public (so it's already reachable at `imageUrl` via
 * express.static); `imageSizeBytes` is stored mainly for the admin's own
 * reference and to double check the 10 KB - 2 MB rule server-side.
 */
const UploadedImageSchema = new Schema(
  {
    guardEmpId: { type: String, required: true, trim: true },
    guardName: { type: String, required: true, trim: true },
    comment: { type: String, required: true, trim: true, minlength: 3, maxlength: 500 },

    imageUrl: { type: String, required: true }, // e.g. /uploads/images/169..._a1b2.jpg
    imagePath: { type: String, required: true }, // absolute path on disk, used when deleting
    imageSizeBytes: { type: Number, required: true },
    mimeType: { type: String, required: true },

    // Optional context, kept for parity with the mobile/guard-side upload
    // flow which does know the duty's place + date range - left blank for a
    // plain admin upload.
    place: { type: String, default: '' },
    dateRange: { type: String, default: '' },

    uploadedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

UploadedImageSchema.index({ guardEmpId: 1, uploadedAt: -1 });

module.exports = mongoose.model('UploadedImage', UploadedImageSchema);
