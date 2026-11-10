const mongoose = require('mongoose');

/**
 * Builds the MongoDB connection URI.
 *
 * If MONGO_URI is set in .env, it's used as-is (full control, including
 * an already-encoded username/password).
 *
 * Otherwise the URI is assembled from the individual MONGO_* pieces below,
 * which is usually easier when the username/password contain special
 * characters that need URI-encoding.
 */
function buildUri() {
  if (process.env.MONGO_URI) {
    return process.env.MONGO_URI;
  }

  const host = process.env.MONGO_HOST || '127.0.0.1';
  const port = process.env.MONGO_PORT || '27017';
  const dbName = process.env.MONGO_DB || 'security_guard_db';
  const user = process.env.MONGO_USER;
  const pass = process.env.MONGO_PASSWORD;
  const authSource = process.env.MONGO_AUTH_SOURCE || 'admin';

  if (user && pass) {
    const encodedUser = encodeURIComponent(user);
    const encodedPass = encodeURIComponent(pass);
    return `mongodb://${encodedUser}:${encodedPass}@${host}:${port}/${dbName}?authSource=${authSource}`;
  }

  // No credentials configured - connects to an unauthenticated local instance.
  return `mongodb://${host}:${port}/${dbName}`;
}

async function connectDB() {
  const uri = buildUri();
  // Hide the password when logging the URI.
  const safeUri = uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');

  try {
    await mongoose.connect(uri);
    console.log(`MongoDB connected -> ${safeUri}`);
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    if (err.message && /auth/i.test(err.message)) {
      console.error('This looks like an authentication error - check MONGO_USER / MONGO_PASSWORD / MONGO_AUTH_SOURCE in .env against the admin user you created in MongoDB.');
    } else {
      console.error('Make sure a local MongoDB server is running, e.g. run `mongod` in another terminal.');
    }
    process.exit(1);
  }
}

module.exports = connectDB;
