# Aditya Security Guard — Backend API

Standalone Express + MongoDB backend, split out of the combined
`BackendAndWeb/web_frontend` project. It runs on its own port and no longer
serves the web dashboard (the web front end will be its own project/port).

## Run

```bash
cd backend
npm install
# .env is included (copied unchanged from web_frontend). To start fresh: cp .env.example .env
npm start            # -> http://localhost:<PORT>  (PORT in .env, default 3000)
```

Other script: `npm run hash -- <password>` prints a bcrypt hash for creating
the first admin user in mongosh (unchanged from before).

Health check: `GET /api/health`

## API route prefixes (unchanged)

| Prefix                  | File                       |
|-------------------------|----------------------------|
| `/api/auth`             | `routes/auth.js`           |
| `/api/users`            | `routes/users.js`          |
| `/api/duty-places`      | `routes/dutyPlaces.js`     |
| `/api/duty-assignments` | `routes/dutyAssignments.js`|
| `/api/qr-scans`         | `routes/qrScans.js`        |
| `/api/uploaded-images`  | `routes/uploadedImages.js` |
| `/api/contact-us`       | `routes/contactUs.js`      |

## Uploaded files

Site-visit images and profile photos are saved on local disk under
`public/uploads/images` and `public/uploads/profile` and served at
`/uploads/...` (the URLs already stored in MongoDB). This is the only thing
`express.static` serves now. If you already have uploaded files in the old
`web_frontend/public/uploads/`, copy them into the same folders here so
existing image URLs keep working.

## What changed vs. `web_frontend`

Only `server.js` and `package.json` metadata were touched; every route, model
and config file is byte-for-byte identical.

- `server.js`: removed the `GET /` route that sent the web's `index.html`,
  updated the header comment and the startup log text ("backend API running").
- `package.json`: `name` / `description` only.
- Not copied (web only): `public/` HTML, CSS and JS.


## Scan location (latitude / longitude)

`POST /api/qr-scans` accepts two optional extra fields, `latitude` and
`longitude` (the phone's GPS position at the moment of scanning, sent by the
Flutter app). They are stored on the `QrScan` document and returned with it.
Both must be present, numeric, and in range (lat -90..90, lng -180..180);
otherwise they are silently dropped and the scan is still saved without a
location - attendance is never blocked by missing GPS.

`GET /api/qr-scans/coverage` returns, for each sub place, the existing `scans`
(timestamps) plus a parallel `scanDetails` list - `{ scannedAt, latitude,
longitude }` per scan, oldest first, with `latitude`/`longitude` null for a scan
saved without a GPS fix. The Logs / Data screen shows these under each scan time.


## Forgot password (OTP by SMS)

Three endpoints under `/api/auth/forgot-password` (`routes/passwordReset.js`,
state in the `passwordresets` collection - `models/PasswordReset.js`). Failures
are `{ "error": "..." }` with a matching status, like the rest of the API.

| Step | Request | Success response |
|------|---------|------------------|
| 1. Check Emp ID + send OTP | `POST /send-otp` `{ roll_no }` | `{ message, mobile: "******3261", resend_in: 60, expires_in: 300 }` |
| 2. Check OTP | `POST /verify-otp` `{ roll_no, otp }` | `{ message, reset_token, expires_in: 600 }` |
| 3. Set new password | `POST /reset` `{ roll_no, reset_token, new_password, confirm_password? }` | `{ message }` |

- **Resend** = call `/send-otp` again. Before the cooldown ends it answers
  `429` with `retry_after` (seconds) - use it for the "Resend available in
  00:56" timer.
- **`reset_token`** is what lets step 3 know the OTP was really entered. Only
  `/verify-otp` issues it; it lasts 10 minutes and works once. Send it back,
  with the same `roll_no`, to `/reset`.
- **Password rules** (same four as the Set New Password screen): more than 6
  characters, an uppercase letter, a number, a special character. A weak one
  gets `400` with `requirements_not_met`, e.g. `["Contains a number"]`.
- **Limits:** OTP valid 5 min; 5 wrong tries then a new OTP is needed; 60 s
  between sends; 5 sends per Emp ID per hour. Blocked accounts are refused.
- The OTP and the reset token are stored hashed. A new OTP cancels any earlier
  reset token.

SMS settings go in `.env` (see `.env.example`): `SMS_USERNAME`, `SMS_PASSWORD`,
`SMS_SENDER`, optionally `SMS_API_URL` / `SMS_OTP_TEMPLATE`. With no SMS
credentials set, `/send-otp` answers `503`. For local testing set
`SMS_DRY_RUN=true` - no SMS is sent and the OTP is printed in the server log.
Needs Node 18+ (uses the built-in `fetch`).
