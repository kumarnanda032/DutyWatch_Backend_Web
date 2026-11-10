/**
 * MOCK holds static data for everything that is NOT yet wired to MongoDB
 * (QR scans, uploaded images, duty status).
 *
 * Login, user/guard management, duty places and duty assignments (admin
 * Assign Duty screens AND the guard's Home / My Duties pages) now go through
 * the real backend API (see api.js) which is backed by MongoDB - see
 * loginViaApi() / fetchUsersViaApi() / fetchDutyPlacesViaApi() /
 * fetchDutyAssignmentsViaApi() / fetchMyDutiesViaApi() etc. in api.js.
 */

const MOCK = {
  // Fallback list only used by the "Assign Duty" dropdown, which is still
  // static-data driven. The "Get Security Data" screen now reads live from
  // MongoDB instead of this list - see renderers.getSecurityData in admin.js.
  guards: [
    { empId: '2758', name: 'Ramesh Yadav', mobile: '9123456780', designation: 'Security Guard' },
    { empId: '3049', name: 'Suresh Pawar', mobile: '9988776655', designation: 'Security Guard' },
    { empId: '3105', name: 'Vikram Singh', mobile: '9012345678', designation: 'Senior Guard' },
    { empId: '3220', name: 'Mahesh Rao', mobile: '9345612780', designation: 'Security Guard' },
  ],

  // Fallback list only used by the "Assign Duty" dropdown, which is still
  // static-data driven. "Add Duty Places" / "Existing Duty Places" now read
  // and write live MongoDB data instead of this list - see the
  // renderers.addDutyPlaces section in admin.js.
  dutyPlaces: [
    { mainPlace: 'Aditya Towers - Main Gate', subPlaces: ['Gate A', 'Gate B', 'Reception Lobby'] },
    { mainPlace: 'Warehouse Complex', subPlaces: ['Loading Bay 1', 'Loading Bay 2', 'Perimeter Fence'] },
    { mainPlace: 'Parking Structure', subPlaces: ['Level 1', 'Level 2', 'Rooftop'] },
    { mainPlace: 'Corporate Park', subPlaces: ['Block A Entrance', 'Block B Entrance', 'Cafeteria Wing'] },
  ],

  scans: [
    { dateRange: '10-01-2024_11-01-2024', guardLabel: 'Ramesh Yadav ( 2758 )', scannedPlace: 'Gate A', timestamp: '10-01-2024 18:42:11' },
    { dateRange: '10-01-2024_11-01-2024', guardLabel: 'Ramesh Yadav ( 2758 )', scannedPlace: 'Gate B', timestamp: '10-01-2024 21:05:37' },
    { dateRange: '10-01-2024_11-01-2024', guardLabel: 'Suresh Pawar ( 3049 )', scannedPlace: 'Loading Bay 1', timestamp: '10-01-2024 19:15:02' },
  ],

  // Uploaded images are no longer mock data - admin.js's Images section now
  // reads/writes real MongoDB documents via fetchUploadedImagesViaApi() /
  // uploadImageViaApi() in api.js (see routes/uploadedImages.js).
};

/**
 * Session storage for the logged-in user.
 *
 * The browser keeps the profile (asg_user) and the signed login token
 * (asg_token) in sessionStorage - wiped when the tab closes. The password is
 * NEVER stored: it is sent once to the login endpoint over HTTPS and the
 * server answers with a token that every later API call sends in an
 * "Authorization: Bearer ..." header (see apiFetch in api.js). The server
 * checks that token on every request, so hiding a page in the browser is no
 * longer what protects the data.
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function currentUser() {
  try {
    const raw = sessionStorage.getItem('asg_user');
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function getAuthToken() {
  return sessionStorage.getItem('asg_token') || '';
}

/** `token` is optional - pass it at login time; omit it on later updates
 *  (e.g. refreshing the cached profile) to leave the stored one untouched. */
function setCurrentUser(user, token) {
  const profile = Object.assign({}, user);
  delete profile.token;
  sessionStorage.setItem('asg_user', JSON.stringify(profile));
  const newToken = token || (user && user.token);
  if (newToken) sessionStorage.setItem('asg_token', newToken);
}

function clearSession() {
  sessionStorage.removeItem('asg_user');
  sessionStorage.removeItem('asg_token');
  sessionStorage.removeItem('asg_cred'); // left over from older versions
}

function logout() {
  clearSession();
  window.location.href = '/';
}

/**
 * Re-checks the signed-in account against the server: still exists, not
 * blocked, and the stored password still matches what's on the server
 * right now. If it doesn't - most commonly because the password was
 * changed from another device - the session is cleared and the person is
 * sent back to the login page. A transient network/server error does NOT
 * log the person out; only an explicit rejection from the server does.
 *
 * Returns true if the caller should proceed (valid, or inconclusive due to
 * a hiccup), false if the session was invalid and has already been
 * cleared + redirected away from.
 */
async function verifySessionStillValid() {
  const u = currentUser();
  if (!u) return true; // no session at all; requireRole() already sends those to the login page

  if (!getAuthToken()) {
    // A session without a token (e.g. one started before tokens existed)
    // can't be verified, so don't trust it - one fresh login fixes it.
    clearSession();
    alert('Please log in again to continue.');
    window.location.href = '/';
    return false;
  }

  const result = await verifySessionViaApi();
  if (result.ok === false) {
    clearSession();
    alert(result.message || 'Your session is no longer valid. Please log in again.');
    window.location.href = '/';
    return false;
  }
  if (result.ok === true) {
    setCurrentUser(result.user); // keep the cached profile fresh; stored token is untouched
  }
  return true; // valid, or inconclusive (network/server hiccup) - don't punish the user for that
}

function requireRole(role) {
  const u = currentUser();
  if (!u || u.role !== role || !getAuthToken()) {
    window.location.href = '/';
  }
  return u;
}
