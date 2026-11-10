/**
 * Calls to the Express + MongoDB backend (see server.js, routes/auth.js,
 * routes/users.js). Everything else in the app still reads from MOCK in
 * data.js - only auth and user/guard management go through here.
 */

/**
 * Reads a fetch Response as JSON, but fails with a clear error instead of
 * a cryptic "Unexpected token '<'..." if the server returned HTML (e.g. an
 * unmatched route, a proxy error page, or the server needing a restart
 * after a code change) instead of JSON.
 */
async function readJsonResponse(res) {
  const text = await res.text();
  const contentType = res.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    const snippet = text.replace(/\s+/g, ' ').slice(0, 120);
    throw new Error(
      `Server returned a non-JSON response (HTTP ${res.status}). This usually means the API route ` +
      `wasn't found or the server needs restarting. Response started with: "${snippet}"`
    );
  }

  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(body.error || `Request failed (HTTP ${res.status}).`);
  }
  return body;
}

/**
 * fetch() for every protected endpoint: adds the login token and, if the
 * server says the session is no longer valid (expired, password changed,
 * account blocked), clears it and sends the person back to the login page.
 * Login / change-password / forgot-password use plain fetch() on purpose.
 */
let _sessionEnding = false;
async function apiFetch(url, options) {
  const opts = Object.assign({}, options);
  const headers = new Headers(opts.headers || {});
  const token = getAuthToken();
  if (token) headers.set('Authorization', 'Bearer ' + token);
  opts.headers = headers;

  const res = await fetch(url, opts);
  if (token && !_sessionEnding) {
    let ended = res.status === 401;
    if (res.status === 403) {
      // 403 also means "not allowed to do this" - only a blocked account ends the session.
      try { ended = (await res.clone().json()).code === 'BLOCKED'; } catch (err) { ended = false; }
    }
    if (ended) {
      _sessionEnding = true;
      clearSession();
      alert('Your session has expired or the account is no longer active. Please log in again.');
      window.location.href = '/';
    }
  }
  return res;
}

async function loginViaApi(roll_no, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roll_no, password }),
  });
  return readJsonResponse(res); // { roll_no, first_name, designation, mobile, role }
}

/**
 * Re-checks the current login token against the server WITHOUT throwing -
 * used to silently revalidate an existing session (is the account still
 * active, was the password changed elsewhere), as opposed to loginViaApi()
 * which is for the interactive login form and throws so the form can show
 * the error inline.
 *
 * Returns:
 *   { ok: true,  user }     - still valid; `user` is the fresh profile
 *   { ok: false, message }  - rejected by the server (token expired, password
 *                             changed, or account blocked)
 *   { ok: null }            - inconclusive (server/network hiccup) - the
 *                             caller should NOT log the person out for this,
 *                             only for an explicit { ok: false }
 */
async function verifySessionViaApi() {
  let res;
  try {
    res = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + getAuthToken() } });
  } catch (err) {
    return { ok: null }; // network error - can't confirm either way
  }

  let body = {};
  try {
    const text = await res.text();
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json') && text) body = JSON.parse(text);
  } catch (err) {
    return { ok: null }; // unparseable response - can't confirm either way
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, message: body.error || 'Your session is no longer valid. Please log in again.' };
  }
  if (!res.ok) {
    return { ok: null }; // some other server error - inconclusive
  }
  return { ok: true, user: body };
}

async function fetchUsersViaApi({ role, search, page = 1, limit = 10 } = {}) {
  const params = new URLSearchParams();
  if (role) params.set('role', role);
  if (search) params.set('search', search);
  params.set('page', page);
  params.set('limit', limit);

  const res = await apiFetch(`/api/users?${params.toString()}`);
  return readJsonResponse(res); // { data, total, page, limit, totalPages }
}

async function addUserViaApi(payload) {
  const res = await apiFetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return readJsonResponse(res);
}

async function bulkAddUsersViaApi(users) {
  const res = await apiFetch('/api/users/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ users }),
  });
  return readJsonResponse(res); // { insertedCount, skippedCount, results }
}

async function updateUserViaApi(id, payload) {
  const res = await apiFetch(`/api/users/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return readJsonResponse(res);
}

async function toggleBlockUserViaApi(id) {
  const res = await apiFetch(`/api/users/${encodeURIComponent(id)}/toggle-block`, { method: 'PATCH' });
  return readJsonResponse(res); // { _id, roll_no, blocked }
}

async function deleteUserViaApi(id) {
  const res = await apiFetch(`/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return readJsonResponse(res);
}

/**
 * Duty places (see routes/dutyPlaces.js, models/DutyPlace.js).
 */

async function fetchDutyPlacesViaApi({ search, page = 1, limit = 10 } = {}) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  params.set('page', page);
  params.set('limit', limit);

  const res = await apiFetch(`/api/duty-places?${params.toString()}`);
  return readJsonResponse(res); // { data, total, page, limit, totalPages }
}

async function fetchDutyPlaceOptionsViaApi() {
  const res = await apiFetch('/api/duty-places/options');
  return readJsonResponse(res); // { data }
}

/**
 * Home dashboard's "Main locations" and "Sub places" cards: both counts come
 * straight from the DutyPlace collection (see GET /api/duty-places/stats),
 * so "Sub places" reflects every sub-place on record, not just the ones
 * currently covered by a duty assignment.
 */
async function fetchDutyPlaceStatsViaApi() {
  const res = await apiFetch('/api/duty-places/stats');
  return readJsonResponse(res); // { totalMainPlaces, totalSubPlaces }
}

async function addDutyPlaceViaApi(payload) {
  const res = await apiFetch('/api/duty-places', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return readJsonResponse(res);
}

async function addSubPlacesViaApi(id, subPlaces) {
  const res = await apiFetch(`/api/duty-places/${encodeURIComponent(id)}/sub-places`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subPlaces }),
  });
  return readJsonResponse(res);
}

async function updateDutyPlaceViaApi(id, payload) {
  const res = await apiFetch(`/api/duty-places/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return readJsonResponse(res);
}

async function deleteDutyPlaceViaApi(id) {
  const res = await apiFetch(`/api/duty-places/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return readJsonResponse(res);
}

/**
 * Duty assignments (see routes/dutyAssignments.js, models/DutyAssignment.js).
 */

async function fetchDutyAssignmentsViaApi({ search, date, page = 1, limit = 10 } = {}) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (date) params.set('date', date);
  params.set('page', page);
  params.set('limit', limit);

  const res = await apiFetch(`/api/duty-assignments?${params.toString()}`);
  return readJsonResponse(res); // { data, total, page, limit, totalPages }
}

/**
 * Home dashboard's "Active assignments" card: total duty assignments, and
 * how many sub places those assignments cover between them (see
 * GET /api/duty-assignments/stats).
 */
async function fetchDutyAssignmentStatsViaApi() {
  const res = await apiFetch('/api/duty-assignments/stats');
  return readJsonResponse(res); // { totalAssignments, totalSubPlaces }
}

async function bulkAssignDutiesViaApi(payload) {
  const res = await apiFetch('/api/duty-assignments/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return readJsonResponse(res); // { insertedCount, skippedCount, results }
}

async function updateDutyAssignmentViaApi(id, payload) {
  const res = await apiFetch(`/api/duty-assignments/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return readJsonResponse(res);
}

async function deleteDutyAssignmentViaApi(id) {
  const res = await apiFetch(`/api/duty-assignments/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return readJsonResponse(res);
}

/**
 * The logged-in guard's own duties (see GET /api/duty-assignments/mine).
 * Only assignments whose guardEmpId equals this roll number are returned,
 * each tagged with status: 'completed' | 'today' | 'upcoming'.
 */
async function fetchMyDutiesViaApi(guardEmpId) {
  const params = new URLSearchParams({ guardEmpId });
  const res = await apiFetch(`/api/duty-assignments/mine?${params.toString()}`);
  return readJsonResponse(res); // { data, total }
}

/**
 * QR scans (see routes/qrScans.js, models/QrScan.js).
 */

async function fetchQrScansViaApi({ search, date, page = 1, limit = 10 } = {}) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (date) params.set('date', date);
  params.set('page', page);
  params.set('limit', limit);

  const res = await apiFetch(`/api/qr-scans?${params.toString()}`);
  return readJsonResponse(res); // { data, total, page, limit, totalPages }
}

/**
 * One guard's own scans (GET /api/qr-scans/mine). Pass date ("YYYY-MM-DD") for the
 * duty that starts on that day, or leave it out for everything.
 */
async function fetchMyQrScansViaApi({ guardEmpId, date } = {}) {
  const params = new URLSearchParams();
  params.set('guardEmpId', guardEmpId);
  if (date) params.set('date', date);
  const res = await apiFetch(`/api/qr-scans/mine?${params.toString()}`);
  return readJsonResponse(res); // { data, total }
}

/**
 * Per-guard scan coverage for a given date (see GET /api/qr-scans/coverage).
 * One entry per guard who has a duty assigned that day, with every one of
 * their sub places tagged as scanned/not-scanned (plus every scan
 * timestamp) - powers the admin Home page's "Recent QR scans" card, where
 * tapping a guard on the left shows their main place + sub-place scan
 * detail on the right.
 */
async function fetchQrScanCoverageViaApi({ date, guardEmpId } = {}) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (guardEmpId) params.set('guardEmpId', guardEmpId);

  const res = await apiFetch(`/api/qr-scans/coverage?${params.toString()}`);
  return readJsonResponse(res); // { data, total }
}

/**
 * Uploaded site-visit images (see routes/uploadedImages.js, models/UploadedImage.js).
 */

// file, comment, guardEmpId and guardName are required by the server too -
// see routes/uploadedImages.js. Sent as multipart/form-data (not JSON)
// since it carries a real file.
async function uploadImageViaApi({ file, comment, guardEmpId, guardName }) {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('comment', comment);
  formData.append('guardEmpId', guardEmpId);
  formData.append('guardName', guardName);

  const res = await apiFetch('/api/uploaded-images', { method: 'POST', body: formData });
  return readJsonResponse(res);
}

// Pass guardEmpId to get only that guard's images (guard panel); leave it out
// for everyone's images (admin panel).
async function fetchUploadedImagesViaApi({ search, guardEmpId, page = 1, limit = 20 } = {}) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (guardEmpId) params.set('guardEmpId', guardEmpId);
  params.set('page', page);
  params.set('limit', limit);

  const res = await apiFetch(`/api/uploaded-images?${params.toString()}`);
  return readJsonResponse(res); // { data, total, page, limit, totalPages }
}

/**
 * Guard profile photo. Sent as multipart/form-data; returns { profile_pic }
 * (the public URL of the saved photo).
 */
async function uploadProfilePicViaApi(rollNo, file) {
  const formData = new FormData();
  formData.append('image', file);
  const res = await apiFetch(`/api/users/by-roll/${encodeURIComponent(rollNo)}/profile-pic`, {
    method: 'POST',
    body: formData,
  });
  return readJsonResponse(res);
}

/**
 * The single global QR-scan time window (see routes/scanSettings.js,
 * models/ScanSetting.js). Both ends are 24-hour "HH:mm" strings; the admin
 * UI (Assign Duty -> Set Scan Time) converts to/from 12-hour + AM/PM only
 * for display.
 */
async function fetchScanTimeViaApi() {
  const res = await apiFetch('/api/scan-settings');
  return readJsonResponse(res); // { from, to } - both null if never saved
}

async function saveScanTimeViaApi(from, to) {
  const res = await apiFetch('/api/scan-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to }),
  });
  return readJsonResponse(res); // { from, to }
}

/**
 * Forgot password (see routes/auth.js). Three steps:
 *  1. sendForgotPasswordOtpViaApi(roll_no)              -> { message, mobile, resend_in, expires_in }
 *  2. verifyForgotPasswordOtpViaApi(roll_no, otp)       -> { message, reset_token, expires_in }
 *  3. resetForgotPasswordViaApi(roll_no, reset_token, new_password, confirm_password) -> { message }
 */
async function sendForgotPasswordOtpViaApi(roll_no) {
  const res = await fetch('/api/auth/forgot-password/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roll_no }),
  });
  return readJsonResponse(res);
}

async function verifyForgotPasswordOtpViaApi(roll_no, otp) {
  const res = await fetch('/api/auth/forgot-password/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roll_no, otp }),
  });
  return readJsonResponse(res);
}

async function resetForgotPasswordViaApi(roll_no, reset_token, new_password, confirm_password) {
  const res = await fetch('/api/auth/forgot-password/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roll_no, reset_token, new_password, confirm_password }),
  });
  return readJsonResponse(res);
}

/**
 * Change password for an already logged-in user - admin OR security
 * (see POST /api/auth/change-password in routes/auth.js). The current
 * password is required by the server as proof of identity.
 *   -> { message }
 * On a weak password the server's error also carries requirements_not_met,
 * but the message itself is already user-readable.
 */
async function changePasswordViaApi(roll_no, current_password, new_password, confirm_password) {
  const res = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roll_no, current_password, new_password, confirm_password }),
  });
  return readJsonResponse(res);
}

/**
 * Contact Us directory (GET /api/contact-us) - readable by admin and
 * security logins alike. Rendered by js/contact.js.
 *   -> { data: [{ _id, name, designation, role, dept, mail, mobile }], total, page, limit, totalPages }
 */
async function fetchContactsViaApi({ search, dept, page = 1, limit = 500 } = {}) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (dept) params.set('dept', dept);
  params.set('page', page);
  params.set('limit', limit);

  const res = await apiFetch(`/api/contact-us?${params.toString()}`);
  return readJsonResponse(res);
}
