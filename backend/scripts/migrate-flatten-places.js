/**
 * One-time migration: main place / sub place  ->  single "duty place".
 *
 *   node scripts/migrate-flatten-places.js          # dry run (prints what would change, writes nothing)
 *   node scripts/migrate-flatten-places.js --apply  # actually writes the changes
 *
 * BACK UP THE DATABASE FIRST (mongodump). Uses MONGO_* / MONGO_URI from .env.
 *
 * What it does
 *   dutyplaces       { mainPlace, subPlaces:[{name}] }  ->  one { place } document per sub place.
 *                    The old main-place documents are removed. If two sub places share
 *                    a name (case-insensitive) only one duty place is kept.
 *   dutyassignments  { mainPlace, subPlaces:[..], dutyPlaceId } -> { dutyPlaces:[..] }
 *   qrscans          { mainPlace, scannedSubPlace } -> { scannedDutyPlace }
 *
 * Sub-place names are kept exactly, so QR codes already printed (which encode the
 * sub-place name) keep working. Main-place names are dropped.
 * Safe to re-run: documents already in the new shape are left alone.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const APPLY = process.argv.includes('--apply');

(async () => {
  await connectDB();
  const db = mongoose.connection.db;
  console.log(APPLY ? '*** APPLY MODE - writing changes ***' : '--- DRY RUN - nothing will be written ---');

  // ---- dutyplaces ----
  const places = db.collection('dutyplaces');
  const oldPlaces = await places.find({ mainPlace: { $exists: true } }).toArray();
  const wanted = new Map(); // lowercase name -> { place, createdAt }
  for (const p of oldPlaces) {
    for (const s of p.subPlaces || []) {
      const name = String((s && s.name) || '').trim();
      if (name && !wanted.has(name.toLowerCase())) {
        wanted.set(name.toLowerCase(), { place: name, createdAt: p.createdAt || new Date() });
      }
    }
  }
  const existingNew = new Set(
    (await places.find({ place: { $exists: true } }).toArray()).map((p) => String(p.place).toLowerCase())
  );
  const toInsert = [...wanted.values()].filter((w) => !existingNew.has(w.place.toLowerCase()));
  console.log(`dutyplaces: ${oldPlaces.length} old main-place docs -> ${toInsert.length} new duty places`);

  // ---- dutyassignments ----
  const assignments = db.collection('dutyassignments');
  const oldAssignments = await assignments.find({ subPlaces: { $exists: true } }).toArray();
  console.log(`dutyassignments: ${oldAssignments.length} to convert`);

  // ---- qrscans ----
  const scans = db.collection('qrscans');
  const oldScanCount = await scans.countDocuments({ scannedSubPlace: { $exists: true } });
  console.log(`qrscans: ${oldScanCount} to convert`);

  if (!APPLY) {
    console.log('\nDry run finished. Re-run with --apply to write the changes.');
    return mongoose.disconnect();
  }

  // The old unique index on mainPlace would reject new documents (mainPlace null).
  try { await places.dropIndex('mainPlace_1'); console.log('dropped index mainPlace_1'); }
  catch (e) { console.log('index mainPlace_1 not dropped:', e.codeName || e.message); }

  if (toInsert.length) {
    await places.insertMany(toInsert.map((w) => ({ place: w.place, createdAt: w.createdAt, updatedAt: new Date() })));
  }
  if (oldPlaces.length) {
    await places.deleteMany({ _id: { $in: oldPlaces.map((p) => p._id) } });
  }
  await places.createIndex({ place: 1 }, { unique: true });

  await assignments.updateMany(
    { subPlaces: { $exists: true } },
    [
      { $set: { dutyPlaces: '$subPlaces' } },
      { $unset: ['subPlaces', 'mainPlace', 'dutyPlaceId'] },
    ]
  );
  await scans.updateMany(
    { scannedSubPlace: { $exists: true } },
    [
      { $set: { scannedDutyPlace: '$scannedSubPlace' } },
      { $unset: ['scannedSubPlace', 'mainPlace'] },
    ]
  );

  console.log('Migration complete.');
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
