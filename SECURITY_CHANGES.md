# Security changes (functionality unchanged)

## What was wrong
Every API route was public: anyone who knew a URL such as `/api/users` could read,
change or delete data without logging in. The web app also kept the password in
the browser (base64) to re-check the session.

## What changed

### Backend
- **Login tokens (JWT).** `POST /api/auth/login` returns the same fields as before **plus `token`**.
  Every other `/api/*` route (except login, change-password and forgot-password) needs
  `Authorization: Bearer <token>`. Tokens stop working after a password change, when the
  account is blocked/deleted, or after `JWT_EXPIRES_IN` (default 12h).
- **Roles enforced on the server** (role comes from the database, never from the request):
  - admin only: create/edit/delete/block users, duty places, duty assignments, scan time,
    list all QR scans, list all duty assignments.
  - guards: only their own duties, scans, images, profile and photo (`guardEmpId` must be
    their own roll number). They can still read the user list (Contacts) and duty places.
- `GET /api/auth/me` - session re-check used by the web app.
- Login / change-password: max 10 failed attempts per 15 min per IP + roll number (429 after).
  Forgot-password and the whole API have generous per-IP caps.
- `helmet` security headers, `x-powered-by` removed, only `/uploads` is served publicly.
- Mongo-operator injection blocked (`$ne`, `$where` ... in bodies; `a[$ne]=x` in queries).
- `<` and `>` rejected in text fields (names/places are shown inside HTML) - passwords exempt.
- Clean JSON errors for bad JSON / oversized bodies.
- `.gitignore` added so `.env` can't be committed.

### Web front end
- Sends the token on every API call (`apiFetch` in `js/api.js`); expired/invalid session -> login page.
- **Password is no longer stored in the browser** - only the token (sessionStorage).
- Data from the database is HTML-escaped everywhere it is placed into the page (admin.js).

## Deploy steps
1. `cd backend && npm install` (new packages: jsonwebtoken, helmet, express-rate-limit).
2. Add to `backend/.env` locally **and** to Render > Environment:
   `JWT_SECRET=<long random string>` - generate with
   `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
   (optional: `JWT_EXPIRES_IN=7d` so phones stay signed in longer).
3. Redeploy backend, then web front end.
4. **Flutter app must send the token** (see below) - until it does, the app's API calls get 401.
   For a short transition you can set `AUTH_REQUIRED=false` on the backend (turns protection OFF).

## Flutter (DutyWatch app) - what to add
```dart
// after login: final token = body['token'];  -> store it (flutter_secure_storage is best)
Map<String, String> authHeaders(String token, {bool json = true}) => {
  if (json) 'Content-Type': 'application/json',
  'Authorization': 'Bearer $token',
};
// use on every request except /api/auth/login and /api/auth/forgot-password/*
// For multipart uploads: request.headers['Authorization'] = 'Bearer $token';
// If any response is 401 -> clear the token and go to the login screen.
```

## Still recommended (outside the code)
- **Rotate** the MongoDB password and SMS credentials (the `.env` was inside the zip you shared),
  keep them only in Render Environment, and restrict MongoDB Atlas network access/user rights.
- Add response headers on the front-end host (Render Static Site > Headers):
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`.
- Uploaded photos (`/uploads/...`) stay public because `<img>` tags can't send a token; their
  names are random, but treat them as "unlisted", not private.
