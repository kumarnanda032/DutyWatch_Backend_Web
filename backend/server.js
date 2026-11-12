/**
 * Aditya Security Guard - Backend API server
 *
 * Standalone Express + MongoDB backend. It no longer serves the web
 * dashboard - the web front end runs as its own project on its own port.
 * Connects to MongoDB for authentication, user (admin/guard) management,
 * duty places, duty assignments, QR scans, and
 * uploaded site-visit images / profile photos.
 *
 * Uploaded files (routes/uploadedImages.js, routes/users.js) are stored on
 * local disk under ./public/uploads and served from /uploads/... - that is
 * the only thing express.static serves here.
 *
 * Ports are intentionally separate:
 *   - Backend API: PORT in .env (default 3000)
 *   - Web:         its own project / its own port
 *   - MongoDB:     part of MONGO_URI in .env (default 27017, MongoDB's
 *                  standard port) - it is a completely separate process.
 *
 * First-time setup:
 *   1. Make sure MongoDB is reachable (local server, or Atlas via MONGO_URI)
 *   2. cp .env.example .env   (adjust PORT / MONGO_* if needed)
 *   3. npm install
 *   4. Create the first admin user directly in mongosh - use `npm run hash`
 *      to get a bcrypt hash for your chosen password first.
 *   5. npm start
 */

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const path = require('path');
const connectDB = require('./config/db');
const { requireAuth } = require('./middleware/auth');
const { rejectUnsafeBody, loginLimiter, resetLimiter, apiLimiter } = require('./middleware/security');

const authRoutes = require('./routes/auth');
const passwordResetRoutes = require('./routes/passwordReset');
const userRoutes = require('./routes/users');
const dutyPlaceRoutes = require('./routes/dutyPlaces');
const dutyAssignmentRoutes = require('./routes/dutyAssignments');
const qrScanRoutes = require('./routes/qrScans');
const uploadedImageRoutes = require('./routes/uploadedImages');
const scanSettingRoutes = require('./routes/scanSettings');
const contactUsRoutes = require('./routes/contactUs');
const DutyPlace = require('./models/DutyPlace');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Security hardening ------------------------------------------------
// Behind Render's proxy the real client IP comes from X-Forwarded-For; this is
// needed for the rate limiters to see individual users, not the proxy.
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
// "simple" query parsing: ?guardEmpId[$ne]=x stays a harmless literal key
// instead of becoming a MongoDB operator object.
app.set('query parser', 'simple');
app.use(helmet({
  // Uploaded photos are loaded by the web dashboard / mobile app from here.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(express.json());
app.use(rejectUnsafeBody);
app.use('/api', apiLimiter);

// Only uploaded photos are public (<img> tags cannot send an Authorization
// header). File names are unguessable and nothing else is served.
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads'), {
  index: false,
  dotfiles: 'ignore',
}));

// Brute-force protection on the password-checking routes.
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/change-password', loginLimiter);
app.use('/api/auth/forgot-password', resetLimiter);

// Public: login, change-password (needs the current password) and the
// forgot-password OTP flow. Everything else below needs a valid token.
app.use('/api/auth', authRoutes);
app.use('/api/auth/forgot-password', passwordResetRoutes);
app.use('/api/users', requireAuth, userRoutes);
app.use('/api/duty-places', requireAuth, dutyPlaceRoutes);
app.use('/api/duty-assignments', requireAuth, dutyAssignmentRoutes);
app.use('/api/qr-scans', requireAuth, qrScanRoutes);
app.use('/api/uploaded-images', requireAuth, uploadedImageRoutes);
app.use('/api/scan-settings', requireAuth, scanSettingRoutes);
app.use('/api/contact-us', requireAuth, contactUsRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: 'MongoDB (see /api/health/db for connection state)' });
});

// Any /api/* path that didn't match a route above gets a JSON 404 instead
// of Express's default HTML error page. Without this, a typo'd endpoint or
// an old server process missing a newly-added route returns HTML, and the
// frontend's res.json() call fails with a confusing
// "Unexpected token '<', <!DOCTYPE..." error instead of a clear message.
app.use('/api', (req, res) => {
  res.status(404).json({ error: `No API route: ${req.method} ${req.originalUrl}` });
});

// Final safety net: turn any uncaught error into JSON instead of Express's
// default HTML error page, so the frontend always gets parseable JSON back.
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request is too large.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error.' });
});

// Duty places used to be "main place" + "sub places", with a unique index on
// mainPlace. That concept is gone, but the index can still exist in an older
// database and blocks every new duty place after the first. Drop any leftover
// index on mainPlace (harmless if there is none), then make sure the current
// indexes (unique name) exist.
async function removeLegacyDutyPlaceIndexes() {
  try {
    const indexes = await DutyPlace.collection.indexes();
    for (const idx of indexes) {
      if (idx.key && Object.prototype.hasOwnProperty.call(idx.key, 'mainPlace')) {
        await DutyPlace.collection.dropIndex(idx.name);
        console.log(`Removed old duty place index "${idx.name}".`);
      }
    }
    // The field used to be called `name`. Rename it to `place` on any existing
    // documents and drop the old unique `name_1` index, then build the new one.
    const renamed = await DutyPlace.collection.updateMany(
      { name: { $exists: true }, place: { $exists: false } },
      { $rename: { name: 'place' } }
    );
    if (renamed.modifiedCount) {
      console.log(`Renamed field "name" -> "place" on ${renamed.modifiedCount} duty place(s).`);
    }
    for (const idx of await DutyPlace.collection.indexes()) {
      if (idx.key && Object.prototype.hasOwnProperty.call(idx.key, 'name')) {
        await DutyPlace.collection.dropIndex(idx.name);
        console.log(`Removed old duty place index "${idx.name}".`);
      }
    }
    await DutyPlace.createIndexes();
  } catch (err) {
    // Collection doesn't exist yet (fresh database) or no permission - not fatal.
    if (err && err.codeName !== 'NamespaceNotFound') {
      console.warn('Could not check duty place indexes:', err.message);
    }
  }
}

connectDB().then(removeLegacyDutyPlaceIndexes).then(() => {
  app.listen(PORT, () => {
    console.log(`Aditya Security Guard backend API running at http://localhost:${PORT}`);
  });
});
