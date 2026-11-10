# MongoDB Database Design — Aditya Security Guard

This replaces the Firebase Realtime Database / Firestore structure used in the
original Android app. MongoDB is a document database, so nested Firebase
paths become **collections with references** (by `empId` / `dateRange`)
rather than deeply nested JSON trees — this makes querying and indexing far
more efficient than Firebase's nested-node approach.

No live connection is required for this deliverable — this is the schema
design only, expressed as Mongoose models (`schemas/*.js`) plus sample
documents below. Point a real MongoDB instance (local `mongodb://localhost:27017/security_guard_db`
or Atlas) at these schemas when you're ready to wire up the Node.js backend.

## Collections overview

| Collection | Purpose | Firebase equivalent |
|---|---|---|
| `users` | Login credentials + role (admin/guard) | `users/` |
| `securityguards` | Registered guard profiles | `users/` (role=user subset) |
| `dutyplaces` | Sites and their sub-places (QR points) | `HelperClassAddPlaces` / places node |
| `dutyassignments` | Guard ↔ place ↔ date-range assignment | `Assign_Duty_DateAndPlaces/` |
| `qrscans` | Attendance scan events | `Date_QRScanAndImages/.../Scan_DateAndTime` |
| `uploadedimages` | Site-visit photo evidence (Storage URL) | `Firebase Storage` + DB pointer |
| `dutystatus` | Derived/aggregated completion status per assignment | computed client-side in original app |
| `profiles` | Profile picture + extra profile info | `User_Profile_Picks/` |

## Design notes / improvements over the Firebase version

1. **Passwords are hashed** (`bcrypt`) instead of stored in plaintext — the
   original app compared `password` fields directly.
2. **Relational-style references** (`ObjectId` or `empId` string keys) replace
   Firebase's nested child paths, so you can index and query directly
   (e.g. "all scans for guard X between two dates") instead of walking a tree.
3. **`dateRange` stays a string** (`"10-01-2024_11-01-2024"`) for compatibility
   with the original business logic (night-shift window spanning midnight),
   but is paired with proper `Date` fields (`shiftStart`, `shiftEnd`) so you
   can also query with native Mongo date operators.
4. Indexes are defined on the fields the original app queried most: `username`,
   `empId`, `dateRange`, and compound `(guardEmpId, dateRange)`.

---

## 1. `users`

Authentication + role record.

```json
{
  "_id": "ObjectId",
  "username": "2758",
  "passwordHash": "$2b$10$...",
  "role": "guard",              // "admin" | "guard"
  "name": "Ramesh Yadav",
  "designation": "Security Guard",
  "mobile": "9123456780",
  "createdAt": "2024-01-05T10:00:00Z",
  "updatedAt": "2024-01-05T10:00:00Z"
}
```
Indexes: `{ username: 1 }` unique.

## 2. `securityguards`

Guard-specific roster info (kept separate from `users` so admin can manage
guard records without touching login credentials).

```json
{
  "_id": "ObjectId",
  "empId": "2758",
  "userId": "ObjectId (ref: users)",
  "name": "Ramesh Yadav",
  "mobile": "9123456780",
  "designation": "Security Guard",
  "active": true,
  "createdAt": "2024-01-05T10:00:00Z"
}
```
Indexes: `{ empId: 1 }` unique.

## 3. `dutyplaces`

A site ("main place") with an embedded array of sub-places.

```json
{
  "_id": "ObjectId",
  "mainPlace": "Aditya Towers - Main Gate",
  "subPlaces": [
    { "name": "Gate A" },
    { "name": "Gate B" },
    { "name": "Reception Lobby" }
  ],
  "createdAt": "2024-01-01T09:00:00Z"
}
```
Indexes: `{ mainPlace: 1 }` unique.

## 4. `dutyassignments`

Guard assigned to a place for a given duty date-range (mirrors
`Assign_Duty_DateAndPlaces/{dateRange}/{guardLabel}/{mainPlace}/{subPlace}`).

```json
{
  "_id": "ObjectId",
  "dateRange": "10-01-2024_11-01-2024",
  "shiftStart": "2024-01-10T18:00:00Z",
  "shiftEnd": "2024-01-11T06:00:00Z",
  "guardEmpId": "2758",
  "guardName": "Ramesh Yadav",
  "dutyPlaceId": "ObjectId (ref: dutyplaces)",
  "mainPlace": "Aditya Towers - Main Gate",
  "subPlaces": ["Gate A", "Gate B", "Reception Lobby"],
  "assignedBy": "admin",
  "createdAt": "2024-01-08T12:00:00Z"
}
```
Indexes: `{ guardEmpId: 1, dateRange: 1 }`; `{ dateRange: 1 }`.

## 5. `qrscans`

Individual attendance scan events (mirrors `Scan_DateAndTime`).

```json
{
  "_id": "ObjectId",
  "assignmentId": "ObjectId (ref: dutyassignments)",
  "dateRange": "10-01-2024_11-01-2024",
  "guardEmpId": "2758",
  "guardName": "Ramesh Yadav",
  "scannedSubPlace": "Gate A",
  "qrCode": "GATEA-AT-001",
  "scannedAt": "2024-01-10T18:42:11Z",
  "verifiedByAdmin": true
}
```
Indexes: `{ guardEmpId: 1, dateRange: 1 }`; `{ scannedAt: -1 }`.

## 6. `uploadedimages`

Photo evidence uploaded on-site.

```json
{
  "_id": "ObjectId",
  "guardEmpId": "2758",
  "guardName": "Ramesh Yadav",
  "dateRange": "10-01-2024_11-01-2024",
  "place": "Gate A",
  "imageUrl": "https://storage.example.com/uploads/2758_gate_a_20240110.jpg",
  "uploadedAt": "2024-01-10T18:43:20Z"
}
```
Indexes: `{ guardEmpId: 1, dateRange: 1 }`.

## 7. `dutystatus`

Aggregated per-assignment completion snapshot (can be computed on the fly
with an aggregation pipeline instead of stored, but storing a denormalized
copy speeds up the admin "Duty Finished Status" screen and PDF export).

```json
{
  "_id": "ObjectId",
  "assignmentId": "ObjectId (ref: dutyassignments)",
  "dateRange": "10-01-2024_11-01-2024",
  "guardEmpId": "2758",
  "guardName": "Ramesh Yadav",
  "mainPlace": "Aditya Towers - Main Gate",
  "totalSubPlaces": 3,
  "scannedSubPlaces": 2,
  "isComplete": false,
  "lastUpdated": "2024-01-10T21:05:37Z"
}
```
Indexes: `{ guardEmpId: 1, dateRange: 1 }` unique.

## 8. `profiles`

Profile picture pointer (mirrors `User_Profile_Picks/{empId}`).

```json
{
  "_id": "ObjectId",
  "empId": "2758",
  "imageUrl": "https://storage.example.com/profiles/2758.jpg",
  "updatedAt": "2024-01-05T10:00:00Z"
}
```
Indexes: `{ empId: 1 }` unique.

---

## Suggested query patterns (replacing the original Firebase logic)

- **Login**: `db.users.findOne({ username })`, then `bcrypt.compare()`.
- **Validate a QR scan** (was a linear array search in `ScanqrcodeadminFragment.java`):
  `db.dutyassignments.findOne({ guardEmpId, dateRange, subPlaces: scannedValue })`
  — an indexed query instead of pulling the whole node and looping in Java.
- **Duty finished status per guard**: aggregate `qrscans` grouped by
  `(guardEmpId, dateRange)` and compare the count against `dutyassignments.subPlaces.length`,
  or just read the denormalized `dutystatus` collection.
- **Night-shift date bucketing** (6 PM–6 AM logic from `ScanqrcodeadminFragment.java`)
  is unchanged — it stays application logic in the Node.js API layer, translating
  "now" into the correct `dateRange` bucket before querying.
