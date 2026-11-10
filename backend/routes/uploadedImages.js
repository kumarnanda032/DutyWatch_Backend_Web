const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const UploadedImage = require('../models/UploadedImage');

const { requireRole, ownGuardOrAdmin, selfOrAdminParam } = require('../middleware/auth');

const router = express.Router();

// ---------------------------------------------------------------------
// Storage: files land in web_frontend/public/uploads/images, which
// express.static already serves (see server.js), so the saved path is
// reachable straight away at /uploads/images/<filename>.
// ---------------------------------------------------------------------
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'images');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MIN_IMAGE_SIZE = 10 * 1024; // 10 KB
const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2 MB
const MIN_COMMENT_LENGTH = 3;
const MAX_COMMENT_LENGTH = 500;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png'];

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// True file "magic numbers" for JPEG/PNG, checked against the bytes actually
// written to disk - this is what stops someone renaming a .exe/.txt to
// photo.jpg and sliding past the extension/mimetype checks above, which only
// look at the *name* the browser reported.
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readFileHeader(filePath, length) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const bytesRead = fs.readSync(fd, buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    fs.closeSync(fd);
  }
}

// Confirms the saved file's real bytes match a JPEG or PNG signature -
// independent of whatever extension/mimetype the browser claimed.
function isGenuineImage(filePath) {
  const header = readFileHeader(filePath, 8);
  return header.subarray(0, 3).equals(JPEG_SIGNATURE) || header.equals(PNG_SIGNATURE);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  },
});

// multer only enforces an upper bound on size (`limits.fileSize`) - the
// 10 KB *minimum* from requirement #2 is checked by hand in the route
// handler below, once we know the file actually finished writing to disk.
const upload = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const isAllowed = ALLOWED_MIME_TYPES.includes(file.mimetype) || ALLOWED_EXTENSIONS.includes(ext);
    if (!isAllowed) {
      return cb(new Error('Only JPG, JPEG or PNG images are allowed.'));
    }
    cb(null, true);
  },
});

// Removes a file that was already written to disk but must not be kept
// (failed the min-size check, or the DB save afterwards failed).
function removeUploadedFile(filePath) {
  if (!filePath) return;
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') console.error('Failed to remove rejected upload:', err);
  });
}

// POST /api/uploaded-images   multipart/form-data:
//   image        - required, the JPG/PNG file, 10 KB - 2 MB
//   comment      - required, non-empty text describing the photo
//   guardEmpId   - required, whoever is logged in and picking the image
//   guardName    - required, ditto
//   place        - optional
//   dateRange    - optional
//
// guardEmpId/guardName are sent by the client (there is no session/JWT in
// this app yet - see routes/auth.js), but every other field the client
// can't fake (the actual file bytes, its real size) is checked here rather
// than trusted from the browser.
router.post('/', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'An image file is required.' });
    }

    const comment = String(req.body.comment || '').trim();
    const guardEmpId = String(req.body.guardEmpId || '').trim();
    const guardName = String(req.body.guardName || '').trim();

    // Validate the "extra" fields first and clean up the file we already
    // wrote to disk if any of them are missing, so nothing orphaned is left
    // behind in public/uploads/images.
    if (!comment) {
      removeUploadedFile(req.file.path);
      return res.status(400).json({ error: 'A comment is required before the image can be uploaded.' });
    }
    if (comment.length < MIN_COMMENT_LENGTH) {
      removeUploadedFile(req.file.path);
      return res.status(400).json({ error: `Comment must be at least ${MIN_COMMENT_LENGTH} characters.` });
    }
    if (comment.length > MAX_COMMENT_LENGTH) {
      removeUploadedFile(req.file.path);
      return res.status(400).json({ error: `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer.` });
    }
    if (!guardEmpId || !guardName) {
      removeUploadedFile(req.file.path);
      return res.status(400).json({ error: 'guardEmpId and guardName are required.' });
    }
    // A guard can only upload as themselves (admins may upload for anyone).
    if (req.user && req.user.role !== 'admin' && guardEmpId !== req.user.roll_no) {
      removeUploadedFile(req.file.path);
      return res.status(403).json({ error: 'You can only upload images as yourself.', code: 'FORBIDDEN' });
    }

    if (req.file.size < MIN_IMAGE_SIZE) {
      removeUploadedFile(req.file.path);
      return res.status(400).json({ error: 'Image is too small - minimum size is 10 KB.' });
    }
    // req.file.size can never exceed MAX_IMAGE_SIZE here - multer's
    // `limits.fileFize` already rejects it before this handler runs (see
    // the LIMIT_FILE_SIZE branch in the error handler below).

    if (!isGenuineImage(req.file.path)) {
      removeUploadedFile(req.file.path);
      return res.status(400).json({ error: 'The uploaded file is not a valid JPG or PNG image.' });
    }

    const doc = await UploadedImage.create({
      guardEmpId,
      guardName,
      comment,
      place: String(req.body.place || '').trim(),
      dateRange: String(req.body.dateRange || '').trim(),
      imageUrl: `/uploads/images/${req.file.filename}`,
      imagePath: req.file.path,
      imageSizeBytes: req.file.size,
      mimeType: req.file.mimetype,
      uploadedAt: new Date(),
    });

    res.status(201).json(doc);
  } catch (err) {
    if (req.file) removeUploadedFile(req.file.path);
    console.error(err);
    res.status(500).json({ error: 'Server error uploading the image.' });
  }
});

// GET /api/uploaded-images?search=&guardEmpId=&page=1&limit=20
//   search     - optional, matches guard name, employee ID or comment
//   guardEmpId - optional, exact employee ID. When present only that
//                guard's photos come back - the guard panel's "Get Images"
//                tab always sends it, so a guard never sees anyone else's.
// Without guardEmpId: every photo from every guard/admin, most recent
// first - the admin's "Get Upload Images" tab.
router.get('/', ownGuardOrAdmin, async (req, res) => {
  try {
    const filter = {};
    const guardEmpId = String(req.query.guardEmpId || '').trim();
    if (guardEmpId) filter.guardEmpId = guardEmpId;

    const search = (req.query.search || '').trim();
    if (search) {
      const re = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ guardName: re }, { guardEmpId: re }, { comment: re }];
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 200);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      UploadedImage.find(filter).sort({ uploadedAt: -1 }).skip(skip).limit(limit).lean(),
      UploadedImage.countDocuments(filter),
    ]);

    res.json({ data, total, page, limit, totalPages: Math.max(Math.ceil(total / limit), 1) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching uploaded images.' });
  }
});

// Turns multer's own errors (wrong file type from fileFilter, too-large
// file from limits.fileSize) into the same JSON error shape as every other
// route, instead of Express's default HTML error page.
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Image is too large - maximum size is 2 MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message || 'Invalid image upload.' });
  }
  next();
});

module.exports = router;
