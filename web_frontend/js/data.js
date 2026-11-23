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


/**
 * Styled replacement for window.alert() on success messages.
 *   showNotice('Image uploaded successfully.');
 *   showNotice('Saved.', { title: 'Done', type: 'success' | 'error' | 'info' });
 *   Pass accent: 'day' | 'night' to tint the popup with the Day / Night duty colour.
 * Closes on OK, Enter, Escape or a click on the dark backdrop.
 */
function showNotice(message, opts) {
  const o = opts || {};
  const type = o.type || 'success';
  const title = o.title || (type === 'error' ? 'Something went wrong' : type === 'info' ? 'Notice' : 'Success');
  const icons = {
    success: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    error: '<path d="M12 8v5M12 16.5v.01"/><circle cx="12" cy="12" r="9"/>',
    info: '<path d="M12 11v5M12 7.5v.01"/><circle cx="12" cy="12" r="9"/>',
  };
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '10000';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="modal-box notice-box${o.accent ? ' duty-themed is-' + o.accent : ''}">
        <div class="notice-icon notice-${type}">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[type] || icons.success}</svg>
        </div>
        <h3>${esc(title)}</h3>
        <p>${esc(message)}</p>
        <button type="button" class="btn btn-primary notice-ok">OK</button>
      </div>`;
    document.body.appendChild(overlay);

    const okBtn = overlay.querySelector('.notice-ok');
    function close() {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve();
    }
    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(); }
    }
    document.addEventListener('keydown', onKey, true);
    okBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    okBtn.focus();
  });
}


/**
 * Styled replacement for window.confirm(). Returns a Promise<boolean>.
 *   if (!(await showConfirm('Delete "Gate 1"? This cannot be undone.',
 *        { title: 'Delete duty place?', confirmText: 'Delete', danger: true }))) return;
 * Escape / backdrop click / Cancel resolve false. For danger dialogs the
 * Cancel button has the focus, so a stray Enter never deletes anything.
 */
function showConfirm(message, opts) {
  const o = opts || {};
  const danger = !!o.danger;
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = danger
    ? '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6"/>'
    : '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/>';

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '10000';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="modal-box notice-box${o.accent ? ' duty-themed confirm-themed is-' + o.accent : ''}">
        <div class="notice-icon ${danger && !o.accent ? 'notice-error' : 'notice-info'}">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>
        </div>
        <h3>${esc(o.title || (danger ? 'Are you sure?' : 'Please confirm'))}</h3>
        ${o.badge ? `<span class="confirm-badge">${esc(o.badge)}</span>` : ''}
        <p>${esc(message)}</p>
        ${Array.isArray(o.chips) && o.chips.length ? `<div class="confirm-chips">${o.chips.map(c => `<span class="chip preserve-space">${esc(c)}</span>`).join('')}</div>` : ''}
        <div class="notice-actions">
          <button type="button" class="btn btn-outline notice-cancel">${esc(o.cancelText || 'Cancel')}</button>
          <button type="button" class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'} notice-confirm">${esc(o.confirmText || 'OK')}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const cancelBtn = overlay.querySelector('.notice-cancel');
    const okBtn = overlay.querySelector('.notice-confirm');
    function done(result) {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(result);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
    }
    document.addEventListener('keydown', onKey, true);
    cancelBtn.addEventListener('click', () => done(false));
    okBtn.addEventListener('click', () => done(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) done(false); });
    (danger ? cancelBtn : okBtn).focus();
  });
}
