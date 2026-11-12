const user = requireRole('admin');

// Formats an ISO date string (e.g. a MongoDB createdAt) as a readable
// "DD-MM-YYYY, hh:mm" local date + time, used wherever we show an "Added On".
function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Escapes a value before dropping it into a template-literal-built innerHTML
// string. Used for the Images tab's comment field specifically, since - unlike
// the guard names/places elsewhere in this file, which admins/guards type
// into fixed forms - a comment is free-form text that gets rendered back to
// every admin viewing "Get Upload Images".
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// "YYYY-MM-DD" for today, in the browser's local time - used as the `min`
// on duty-date pickers so past dates can't be chosen, and as the base for
// completed/upcoming comparisons.
function todayISODate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// A duty is "completed" once its dutyDate is strictly before today - the
// overnight shift has already happened, so it's locked from further edits.
function isPastDutyDate(dutyDateIso) {
  if (!dutyDateIso) return false;
  const d = new Date(dutyDateIso);
  if (isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

// Fills an .avatar element with the logged-in admin's uploaded profile
// photo, or their first initial when they haven't uploaded one yet -
// mirrors user.js's fillAvatar() for the guard side.
function fillAvatar(el) {
  if (!el || !user) return;
  if (user.profile_pic) {
    el.innerHTML = `<img src="${escapeHtml(user.profile_pic)}" alt="${escapeHtml(user.first_name)}">`;
  } else {
    el.textContent = user.first_name.charAt(0);
  }
}

// Topbar "who" strip.
document.getElementById('whoName').textContent = user ? user.first_name : '';
fillAvatar(document.getElementById('avatarInitial'));

// Sidebar brand slot - shows the logged-in user's own name/initial instead
// of a static "ADMIN PANEL" label.
document.getElementById('sidebarUserName').textContent = user ? user.first_name : '';
document.getElementById('sidebarEmpId').textContent = user ? 'Emp ID: ' + user.roll_no : '';
fillAvatar(document.getElementById('sidebarAvatar'));

document.querySelectorAll('.nav-link[data-section]').forEach(el => {
  el.addEventListener('click', () => {
    document.querySelectorAll('.nav-link[data-section]').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
    render(el.dataset.section);
    document.getElementById('sidebar').classList.remove('open');
  });
});

document.getElementById('logoutBtn').addEventListener('click', () => confirmLogout(logout));
// Hamburger: on desktop it collapses/expands the left panel (remembered);
// on mobile it slides the panel over the page.
(function () {
  const shell = document.getElementById('appShell');
  const sidebar = document.getElementById('sidebar');
  const btn = document.getElementById('menuToggle');
  const isMobile = () => window.matchMedia('(max-width: 900px)').matches;
  const KEY = 'sidebarCollapsed';

  try { if (localStorage.getItem(KEY) === '1') shell.classList.add('sidebar-collapsed'); } catch (e) {}

  function syncAria() {
    const open = isMobile() ? sidebar.classList.contains('open') : !shell.classList.contains('sidebar-collapsed');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  btn.addEventListener('click', () => {
    if (isMobile()) {
      sidebar.classList.toggle('open');
    } else {
      const collapsed = shell.classList.toggle('sidebar-collapsed');
      try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch (e) {}
    }
    syncAria();
  });
  const backdrop = document.getElementById('sidebarBackdrop');
  if (backdrop) backdrop.addEventListener('click', () => { sidebar.classList.remove('open'); syncAria(); });
  // First visit on a small laptop/tablet: start with the slim icon rail to give the content room.
  try {
    if (localStorage.getItem(KEY) === null && window.matchMedia('(max-width: 1100px)').matches) {
      shell.classList.add('sidebar-collapsed');
    }
  } catch (e) {}
  window.addEventListener('resize', syncAria);
  syncAria();
})();

// Page never scrolls; only table data does. Tag the wrappers from each
// visible table box up to #content so CSS can hand the table the remaining height.
(function () {
  const content = document.getElementById('content');
  if (!content) return;
  let queued = false;
  function fitTables() {
    queued = false;
    content.querySelectorAll('.fit-chain, .fit-fill').forEach(el => el.classList.remove('fit-chain', 'fit-fill'));
    content.querySelectorAll('.table-scroll').forEach(ts => {
      // skip tables inside hidden tabs/panels
      if (ts.offsetParent === null && getComputedStyle(ts).position !== 'fixed') {
        let hidden = false;
        for (let p = ts.parentElement; p && p !== content; p = p.parentElement) {
          if ((p.getAttribute('style') || '').replace(/\s/g, '').includes('display:none')) { hidden = true; break; }
        }
        if (hidden) return;
      }
      ts.classList.add('fit-fill');
      for (let p = ts.parentElement; p && p !== content; p = p.parentElement) p.classList.add('fit-chain');
    });
  }
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(fitTables); } };
  new MutationObserver(queue).observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  queue();
})();


let _firstRenderDone = false;

function render(section) {
  // Every later page/section switch re-checks the session in the background
  // (not awaited, so navigation stays instant); the very first render is
  // gated on the same check instead - see the bootstrap at the bottom.
  if (_firstRenderDone) verifySessionStillValid();
  _firstRenderDone = true;

  // Page title in the top bar follows the selected sidebar item (display only).
  const _pt = document.getElementById('pageTitle');
  if (_pt) {
    const _lbl = document.querySelector('.nav-link[data-section="' + section + '"] .nav-label');
    _pt.textContent = _lbl ? _lbl.textContent : 'Home';
  }

  document.getElementById('content').innerHTML = renderers[section]();
  attachHandlers(section);
}

function sectionHead(title, sub) {
  return `<div class="section-head"><h2>${title}</h2><p>${sub}</p></div>`;
}

function openModal(html, { maxWidth } = {}) {
  const box = document.getElementById('modalBox');
  box.innerHTML = html;
  box.style.maxWidth = maxWidth || '';
  document.getElementById('modalOverlay').style.display = 'flex';
}
function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
  document.getElementById('modalBox').innerHTML = '';
  document.getElementById('modalBox').style.maxWidth = '';
}
document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'modalOverlay') closeModal();
});

const renderers = {
  home: () => `
    <div class="dash-stats">
      <div class="dash-card">
        <div class="dash-num" id="guardsCountStat">…</div>
        <div class="dash-text">
          <span class="dash-label">Guards Registered</span>
          <div class="dash-sub"><b class="ok">Active roster</b> enrolled</div>
        </div>
        <span class="dash-icon tone-amber"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg></span>
      </div>
      <div class="dash-card">
        <div class="dash-num" id="dutyPlacesCountStat">…</div>
        <div class="dash-text">
          <span class="dash-label">Duty Places</span>
          <div class="dash-sub">Designated checkpoints</div>
        </div>
        <span class="dash-icon tone-purple"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-5.6-6-10.5a6 6 0 0112 0C18 15.4 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.2"/></svg></span>
      </div>
      <div class="dash-card">
        <div class="dash-num" id="qrScansTodayStat">…</div>
        <div class="dash-text">
          <span class="dash-label">QR Scans Today</span>
          <div class="dash-sub" id="qrScansTodayNote">Shift awaiting initial scan</div>
        </div>
        <span class="dash-icon tone-amber"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3"/><path d="M8 12h8"/></svg></span>
      </div>
      <div class="dash-card">
        <div class="dash-num" id="todayDutiesStat">…</div>
        <div class="dash-text">
          <span class="dash-label">Today's Assigned Duties</span>
          <div class="dash-sub" id="todayDutiesNote">Guards on duty today</div>
        </div>
        <span class="dash-icon tone-green"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 14l2 2 4-4"/></svg></span>
      </div>
    </div>
    <div class="card">
      <div class="card-title" style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <span id="recentScansHeading">Today's QR Code Scanned Data</span>
        <input type="date" class="recent-scans-date" id="recentScansDate" value="${todayISODate()}" max="${todayISODate()}">
      </div>
      <div class="data-toolbar">
        <div class="search-field">
          <input type="text" id="recentScansSearch" placeholder="Search by name, emp id or duty place..." />
        </div>
        <div class="toolbar-right">
          <div class="page-size-field">
            <label for="recentScansPageSizeSelect">Rows per page</label>
            <select id="recentScansPageSizeSelect">
              <option value="10" selected>10</option>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
          <select id="recentScansStatusFilter">
            <option value="all" selected>All</option>
            <option value="scanned">Scanned</option>
            <option value="not-scanned">Not scanned</option>
          </select>
          <button class="btn btn-outline" id="downloadRecentScansPdfBtn" type="button">⬇ Download PDF</button>
        </div>
      </div>
      <div class="table-scroll">
        <table class="recent-scans-table">
          <colgroup>
            <col style="width:5%;">
            <col style="width:20%;">
            <col style="width:24%;">
            <col style="width:14%;">
            <col style="width:19%;">
            <col style="width:18%;">
          </colgroup>
          <thead><tr><th class="serial-col">#</th><th>Guard</th><th>Duty Place</th><th class="status-col">Status</th><th>Scanned At (Timeline)</th><th>Geo-Coordinates</th></tr></thead>
          <tbody id="recentScansBody">
            <tr><td colspan="6" style="color:var(--ink-500); font-size:13px;"><span class="spinner" role="status" aria-label="Loading"></span><span class="loader-text">Loading...</span></td></tr>
          </tbody>
        </table>
      </div>
      <div class="pagination-bar">
        <div class="page-info" id="recentScansPageInfo"></div>
        <div class="page-controls">
          <button class="btn btn-outline" id="recentScansPrevBtn" style="padding:8px 16px;" disabled>Previous</button>
          <button class="btn btn-outline" id="recentScansNextBtn" style="padding:8px 16px;" disabled>Next</button>
        </div>
      </div>
    </div>
  `,

  images: () => `
    ${sectionHead('Images', 'Upload site-visit photo evidence and review what has been submitted.')}

    <div class="tabs" id="imagesTabs">
      <button class="tab-btn active" data-tab="uploadImage" type="button">Upload Image</button>
      <button class="tab-btn" data-tab="getUploadImages" type="button">Get Upload Images</button>
    </div>

    <div class="tab-panel" id="tab-uploadImage">
      <div class="card" style="max-width:420px;">
        <div class="image-tile" style="margin-bottom:14px;"><div class="ph" style="height:160px;">🖼</div></div>
        <input type="file" id="imageFileInput" accept=".jpg,.jpeg,.png,image/jpeg,image/png" style="display:none;">
        <div style="display:flex; gap:10px;">
          <button class="btn btn-outline" id="pickImgBtn" style="flex:1;">Pick Image</button>
        </div>
        <div class="field" style="margin-top:14px;">
          <label>Comment <span style="color:var(--amber);">*</span></label>
          <textarea id="imageCommentInput" rows="3" maxlength="500" placeholder="Describe what this photo shows (required, min 3 characters)"></textarea>
          <div style="display:flex; justify-content:flex-end; margin-top:4px;">
            <span id="imageCommentCount" style="font-size:11px; color:var(--ink-500);">0 / 500</span>
          </div>
        </div>
        <button class="btn btn-primary" id="uploadImgBtn" style="width:100%;" disabled>Upload</button>
        <div class="error-text" id="imageUploadError"></div>
        <p style="color:var(--ink-500); font-size:11.5px; margin-top:8px;">
          Accepted formats: JPG, JPEG, PNG only. Size must be between 10 KB and 2 MB. Comment must be 3-500 characters.
        </p>
      </div>
    </div>

    <div class="tab-panel" id="tab-getUploadImages" style="display:none;">
      <div id="uploadedImagesView">
        <p style="color:var(--ink-500); font-size:13px;"><span class="spinner" role="status" aria-label="Loading"></span><span class="loader-text">Loading...</span></p>
      </div>
    </div>
  `,

  securityData: () => `
    ${sectionHead('Security Data', 'Register new accounts and review everyone already registered.')}

    <div class="tabs" id="securityDataTabs">
      <button class="tab-btn active" data-tab="addSecurity" type="button">Add Security</button>
      <button class="tab-btn" data-tab="securityInfo" type="button">Security Information</button>
    </div>

    <div class="tab-panel" id="tab-addSecurity">
      <div class="two-col with-or">
        <div class="card">
          <div class="card-title">New account</div>
          <form id="addGuardForm" novalidate>
            <div class="form-grid">
              <div class="field"><label>Full name</label><input required name="first_name" maxlength="50" autocomplete="off" /><div class="error-text field-error" data-for="first_name"></div></div>
              <div class="field"><label>Roll No</label><input required name="roll_no" maxlength="20" autocomplete="off" /><div class="error-text field-error" data-for="roll_no"></div></div>
              <div class="field"><label>Password</label><input required type="text" name="password" maxlength="64" autocomplete="off" /><div class="error-text field-error" data-for="password"></div></div>
              <div class="field">
                <label>Role</label>
                <select name="role" required>
                  <option value="security" selected>Security Guard</option>
                  <option value="admin">Admin</option>
                </select>
                <div class="error-text field-error" data-for="role"></div>
              </div>
              <div class="field"><label>Mobile</label><input required name="mobile" type="tel" inputmode="numeric" maxlength="10" placeholder="10-digit number" autocomplete="off" /><div class="error-text field-error" data-for="mobile"></div></div>
              <div class="field">
                <label>Gender</label>
                <select name="gender" required>
                  <option value="" selected disabled>Select gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
                <div class="error-text field-error" data-for="gender"></div>
              </div>
              <div class="field" style="grid-column: 1 / -1;"><label>Designation</label><input required name="designation" maxlength="50" placeholder="Security Guard" autocomplete="off" /><div class="error-text field-error" data-for="designation"></div></div>
              <div class="field" style="grid-column: 1 / -1;">
                <label>Profile Pic <span style="color:var(--ink-500); font-weight:400;">(optional)</span></label>
                <div style="display:flex; align-items:center; gap:12px;">
                  <div class="avatar" id="newGuardAvatarPreview" style="width:48px; height:48px; font-size:18px; flex-shrink:0;">＋</div>
                  <input type="file" id="newGuardPicInput" accept=".jpg,.jpeg,.png,image/jpeg,image/png" style="display:none;">
                  <button type="button" class="btn btn-outline" id="newGuardPicBtn" style="width:auto; padding:8px 16px;">Choose Photo</button>
                  <span style="color:var(--ink-500); font-size:11.5px;">JPG or PNG, max 2 MB</span>
                </div>
                <div class="error-text" id="newGuardPicError"></div>
              </div>
            </div>
            <div class="error-text" id="addGuardError" style="margin-bottom:10px;"></div>
            <div id="addGuardSuccess" style="color:var(--success); font-size:13px; margin-bottom:10px;"></div>
            <button class="btn btn-primary" style="width:auto; padding:10px 22px;" type="submit">Add Account</button>
          </form>
        </div>
        <div class="or-divider" aria-hidden="true"><span>OR</span></div>
        <div class="card">
          <div class="card-title">Bulk upload (CSV)</div>
          <p style="color:var(--ink-500); font-size:12.5px; margin-bottom:4px;">
            Columns: <code>roll_no, password, first_name, gender, designation, mobile, role</code> — role must be
            <code>admin</code> or <code>security</code>; gender must be <code>Male</code>, <code>Female</code> or
            <code>Other</code> (may be left blank). First row must be the header row.
          </p>
          <div class="bulk-upload-box">
            <div class="row">
              <button class="btn btn-outline" id="downloadTemplateBtn" type="button">Download CSV Template</button>
              <input type="file" id="csvFileInput" accept=".csv,text/csv" />
              <button class="btn btn-primary" id="uploadCsvBtn" type="button" style="width:auto; padding:10px 18px;" disabled>Upload CSV</button>
            </div>
            <div id="bulkUploadStatus" style="margin-top:10px; font-size:12.5px; color:var(--ink-500);"></div>
            <div id="bulkResultList" class="bulk-result-list"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="tab-panel" id="tab-securityInfo" style="display:none;">
      <div class="card">
        <div class="data-toolbar">
          <div class="search-field">
            <input type="text" id="securitySearchInput" placeholder="Search by name, roll no, mobile, or designation..." />
          </div>
          <div class="toolbar-right">
            <div class="page-size-field">
              <label for="securityPageSizeSelect">Rows per page</label>
              <select id="securityPageSizeSelect">
                <option value="10" selected>10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
            <button class="btn btn-outline" id="downloadSecurityBtn" type="button">⬇ Download Excel</button>
            <button class="btn btn-outline" id="downloadSecurityPdfBtn" type="button">⬇ Download PDF</button>
          </div>
        </div>
        <div id="securityDataTableWrap"><p style="color:var(--ink-500); font-size:13px;"><span class="spinner" role="status" aria-label="Loading"></span><span class="loader-text">Loading...</span></p></div>
        <div class="pagination-bar">
          <div class="page-info" id="securityPageInfo"></div>
          <div class="page-controls">
            <button class="btn btn-outline" id="securityPrevBtn" style="padding:8px 16px;" disabled>Previous</button>
            <button class="btn btn-outline" id="securityNextBtn" style="padding:8px 16px;">Next</button>
          </div>
        </div>
      </div>
    </div>
  `,

  addDutyPlaces: () => `
    ${sectionHead('Duty Places', 'Add the places guards are assigned to. Each duty place has its own QR code.')}

    <div class="tabs" id="dutyPlaceTabs">
      <button class="tab-btn active" data-tab="newPlace" type="button">Add Duty Place</button>
      <button class="tab-btn" data-tab="existingPlaces" type="button">Existing Duty Places</button>
      <button class="tab-btn" data-tab="generateQr" type="button">Generate QR Code</button>
    </div>

    <div class="tab-panel" id="tab-newPlace">
      <div class="card" style="max-width:520px;">
        <div class="card-title">Add Duty Place</div>
        <div class="field"><label>Duty place</label><input id="dutyPlaceNameInput" placeholder="e.g. North Gate" /></div>
        <div class="error-text" id="newPlaceError"></div>
        <button class="btn btn-primary" id="saveDutyPlaceBtn" style="width:auto; padding:10px 22px;">Add Duty Place</button>
      </div>
    </div>

    <div class="tab-panel" id="tab-existingPlaces" style="display:none;">
      <div class="card">
        <div class="data-toolbar">
          <div class="search-field">
            <input type="text" id="dutyPlaceSearchInput" placeholder="Search duty places..." />
          </div>
          <div class="toolbar-right">
            <div class="page-size-field">
              <label for="dutyPlacePageSizeSelect">Rows per page</label>
              <select id="dutyPlacePageSizeSelect">
                <option value="10" selected>10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
            <button class="btn btn-outline" id="downloadDutyPlacesBtn" type="button">⬇ Download Excel</button>
          </div>
        </div>
        <div id="dutyPlacesTableWrap"><p style="color:var(--ink-500); font-size:13px;"><span class="spinner" role="status" aria-label="Loading"></span><span class="loader-text">Loading...</span></p></div>
        <div class="pagination-bar">
          <div class="page-info" id="dutyPlacesPageInfo"></div>
          <div class="page-controls">
            <button class="btn btn-outline" id="dutyPlacesPrevBtn" style="padding:8px 16px;" disabled>Previous</button>
            <button class="btn btn-outline" id="dutyPlacesNextBtn" style="padding:8px 16px;">Next</button>
          </div>
        </div>
      </div>
    </div>

    <div class="tab-panel" id="tab-generateQr" style="display:none;">
      <div class="card" style="max-width:480px;">
        <div class="card-title">Generate a QR code for a duty place</div>
        <div class="field" style="margin-bottom:0;">
          <label>Duty place</label>
          <select id="qrPlaceSelect"><option value="">Select a duty place</option></select>
        </div>
        <div class="error-text" id="qrGenerateError"></div>
      </div>

      <div class="card" id="qrPreviewCard" style="max-width:420px; display:none; text-align:center;">
        <div class="card-title" style="text-align:left;">Preview</div>
        <div id="qrPreviewWrap" style="display:flex; flex-direction:column; align-items:center; gap:10px;"></div>
        <button class="btn btn-primary" id="downloadQrPdfBtn" type="button" style="width:auto; padding:10px 22px; margin-top:18px;" disabled>⬇ Download as PDF</button>
      </div>
    </div>
  `,

  dutyStatus: () => `
    ${sectionHead('Assign Duty', 'Assign duty to guards, review what is scheduled, and track completion.')}

    <div class="tabs" id="dutyStatusTabs">
      <button class="tab-btn active" data-tab="assignDuty" type="button">Assign Duty to Guard</button>
      <button class="tab-btn" data-tab="showAssigned" type="button">Show Assigned Duties</button>
      <button class="tab-btn" data-tab="scanTime" type="button">Set Scan Time</button>
    </div>

    <div class="tab-panel" id="tab-assignDuty">
      <div class="card" style="max-width:280px;">
        <div class="field" style="margin-bottom:0;"><label>Duty date</label><input type="date" id="assignDutyDate" /></div>
      </div>

      <div class="assign-board">
        <div class="card assign-col">
          <div class="card-title">Guards</div>
          <input type="text" id="assignGuardsSearch" class="mini-search" placeholder="Search guards..." />
          <div class="assign-hint">Drag a guard into the Duty Assignments column</div>
          <div id="assignGuardsList" class="assign-list"><p style="color:var(--ink-500); font-size:13px;">Loading...</p></div>
        </div>
        <div class="card assign-col">
          <div class="card-title">Duty Places</div>
          <input type="text" id="assignPlacesSearch" class="mini-search" placeholder="Search duty places..." />
          <div class="assign-hint">Drag a place onto a guard's card in the Duty Assignments column</div>
          <div id="assignPlacesList" class="assign-list"><p style="color:var(--ink-500); font-size:13px;">Loading...</p></div>
        </div>
        <div class="card assign-col">
          <div class="card-title">Duty Assignments</div>
          <div class="assign-hint">Drop a guard here, then drop one or more duty places onto the guard's card. Pick a duty date above to see what's already assigned for that day.</div>
          <div id="assignDropZone" class="assign-list assign-dropzone"></div>
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <button class="btn btn-outline" id="previewAssignBtn" type="button" style="width:auto; padding:10px 22px;">Show Preview</button>
        <div id="assignPreviewWrap"></div>
      </div>
    </div>

    <div class="tab-panel" id="tab-showAssigned" style="display:none;">
      <div class="card">
        <div class="data-toolbar">
          <div class="search-field">
            <input type="text" id="assignedSearchInput" placeholder="Search by guard or duty place..." />
          </div>
          <div class="toolbar-right">
            <input type="date" id="assignedDateFilter" title="Filter by duty date" value="${todayISODate()}" />
            <div class="page-size-field">
              <label for="assignedPageSizeSelect">Rows per page</label>
              <select id="assignedPageSizeSelect">
                <option value="10" selected>10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
            <button class="btn btn-outline" id="downloadAssignedPdfBtn" type="button">⬇ Download PDF</button>
          </div>
        </div>
        <div id="assignedTableWrap"><p style="color:var(--ink-500); font-size:13px;"><span class="spinner" role="status" aria-label="Loading"></span><span class="loader-text">Loading...</span></p></div>
        <div class="pagination-bar">
          <div class="page-info" id="assignedPageInfo"></div>
          <div class="page-controls">
            <button class="btn btn-outline" id="assignedPrevBtn" style="padding:8px 16px;" disabled>Previous</button>
            <button class="btn btn-outline" id="assignedNextBtn" style="padding:8px 16px;">Next</button>
          </div>
        </div>
      </div>
    </div>

    <div class="tab-panel" id="tab-scanTime" style="display:none;">
      <div class="card" style="max-width:480px;">
        <div class="card-title">Scan Time Window</div>
        <p id="scanTimeCurrent" style="color:var(--ink-500); font-size:13px; margin:-6px 0 16px;">Loading current window...</p>
        <div class="field">
          <label>From</label>
          <div style="display:flex; gap:8px;">
            <select id="scanTimeFromHour" style="flex:1; min-width:0; padding:10px 6px; text-align:center;">
              ${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}
            </select>
            <select id="scanTimeFromMinute" style="flex:1; min-width:0; padding:10px 6px; text-align:center;">
              ${Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0')).map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>
            <select id="scanTimeFromAmPm" style="flex:1; min-width:0; padding:10px 6px; text-align:center;">
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>To</label>
          <div style="display:flex; gap:8px;">
            <select id="scanTimeToHour" style="flex:1; min-width:0; padding:10px 6px; text-align:center;">
              ${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}
            </select>
            <select id="scanTimeToMinute" style="flex:1; min-width:0; padding:10px 6px; text-align:center;">
              ${Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0')).map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>
            <select id="scanTimeToAmPm" style="flex:1; min-width:0; padding:10px 6px; text-align:center;">
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>
        </div>
        <div class="error-text" id="scanTimeError"></div>
        <button class="btn btn-primary" id="saveScanTimeBtn" type="button" style="margin-top:16px; width:auto; padding:10px 22px;">Submit</button>
      </div>
    </div>
  `,

  profile: () => `
    ${sectionHead('Profile', 'View your profile details and update your photo.')}
    <div class="card" style="max-width:420px; text-align:center;">
      <div class="avatar" id="profileAvatar" style="width:80px; height:80px; font-size:28px; margin:0 auto 16px;">${escapeHtml(user.first_name.charAt(0))}</div>
      <input type="file" id="profilePicInput" accept=".jpg,.jpeg,.png,image/jpeg,image/png" style="display:none;">
      <button class="btn btn-outline" id="changePhotoBtn" style="width:auto; padding:8px 18px; margin-bottom:6px;">Change Photo</button>
      <div class="error-text" id="profilePicError"></div>
      <p style="color:var(--ink-500); font-size:11.5px; margin-bottom:18px;">JPG or PNG only, max 2 MB.</p>
      <table style="text-align:left;">
        <tr><td class="pf-label"><svg class="pf-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span>Name</span></td><td>${escapeHtml(user.first_name)}</td></tr>
        <tr><td class="pf-label"><svg class="pf-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="4"/><path d="M9 12v8M6 17h6"/><path d="M15 4h5v5M20 4l-5 5"/></svg><span>Gender</span></td><td>${escapeHtml(user.gender || '—')}</td></tr>
        <tr><td class="pf-label"><svg class="pf-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M3 13h18"/></svg><span>Designation</span></td><td>${escapeHtml(user.designation)}</td></tr>
        <tr><td class="pf-label"><svg class="pf-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.6-1.6 1.8-2.3 3-2.3s2.4.7 3 2.3M15 9h3M15 13h3"/></svg><span>Roll No</span></td><td>${escapeHtml(user.roll_no)}</td></tr>
        <tr><td class="pf-label"><svg class="pf-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg><span>Mobile</span></td><td>${escapeHtml(user.mobile)}</td></tr>
      </table>
    </div>
  `,

  changePassword: () => changePasswordSectionHtml(sectionHead),

  contact: () => contactSectionHtml(),
};

// ---------- Account: Profile / Change Password / Contact Us as three top tabs ----------
renderers.account = () => {
  const strip = (html) => html.replace(/<div class="section-head">[\s\S]*?<\/p>\s*<\/div>/, '');
  return `
    ${sectionHead('Personal Data', 'Your profile details and password.')}
    <div class="tabs" id="accountTabs">
      <button class="tab-btn active" data-tab="accProfile" type="button">Profile</button>
      <button class="tab-btn" data-tab="accPassword" type="button">Change Password</button>
    </div>
    <div class="tab-panel" id="tab-accProfile">${strip(renderers.profile())}</div>
    <div class="tab-panel" id="tab-accPassword" style="display:none;">${strip(renderers.changePassword())}</div>
  `;
};

function attachAccountHandlers() {
  const names = ['accProfile', 'accPassword'];
  document.querySelectorAll('#accountTabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#accountTabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      names.forEach(n => { document.getElementById('tab-' + n).style.display = (n === btn.dataset.tab) ? 'block' : 'none'; });
    });
  });
}

function attachHandlers(section) {
  if (section === 'contact') {
    loadContactUs();
    return;
  }

  if (section === 'account') {
    attachHandlers('profile');
    attachHandlers('changePassword');
    attachAccountHandlers();
    return;
  }

  if (section === 'home') {
    fetchUsersViaApi({ role: 'security', limit: 1 })
      .then(res => { document.getElementById('guardsCountStat').textContent = res.total; })
      .catch(() => { document.getElementById('guardsCountStat').textContent = '—'; });

    fetchDutyPlaceStatsViaApi()
      .then(res => { document.getElementById('dutyPlacesCountStat').textContent = res.totalDutyPlaces; })
      .catch(() => { document.getElementById('dutyPlacesCountStat').textContent = '—'; });

    fetchQrScansViaApi({ date: todayISODate(), limit: 1 })
      .then(res => {
        document.getElementById('qrScansTodayStat').textContent = res.total;
        document.getElementById('qrScansTodayNote').textContent =
          res.total > 0 ? 'Scans recorded today' : 'Shift awaiting initial scan';
      })
      .catch(() => { document.getElementById('qrScansTodayStat').textContent = '—'; });

    // Duties assigned for today's date (GET /api/duty-assignments?date=today).
    fetchDutyAssignmentsViaApi({ date: todayISODate(), limit: 1 })
      .then(res => {
        document.getElementById('todayDutiesStat').textContent = res.total;
        document.getElementById('todayDutiesNote').textContent =
          res.total > 0 ? 'Guards on duty today' : 'No duties assigned yet';
      })
      .catch(() => { document.getElementById('todayDutiesStat').textContent = '—'; });

    // ---------- Recent QR scans: date-scoped table with search + status filter ----------
    // rows are the per-guard coverage data flattened to one row per sub place, so the
    // table shows everything at a glance with no tap needed to drill into a guard.
    const recentScansState = { date: todayISODate(), rows: [], search: '', status: 'all', page: 1, limit: 10 };

    // Every scan of one sub place, oldest first, each with where it was made.
    // The coverage response carries scanDetails: [{ scannedAt, latitude,
    // longitude }] (the position is missing for a scan saved without a GPS
    // fix); if the server only sends bare timestamps in `scans`, the times
    // still show and the position columns just read "—".
    function normalizeScanList(sp) {
      const toCoord = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
      const list = Array.isArray(sp.scanDetails)
        ? sp.scanDetails.map(d => ({ at: d.scannedAt, latitude: toCoord(d.latitude), longitude: toCoord(d.longitude) }))
        : (sp.scans || []).map(t => ({ at: t, latitude: null, longitude: null }));
      return list.sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0));
    }

    // "16.98910", or "—" when there's no position for that scan.
    function formatCoord(v) {
      return v === null ? '—' : v.toFixed(5);
    }

    // Small inline icons for the status pill / timeline / geo chips.
    const SVG_ATTRS = 'viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const ICON_CHECK = `<svg ${SVG_ATTRS}><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
    const ICON_PENDING = `<svg ${SVG_ATTRS}><circle cx="12" cy="12" r="8"/></svg>`;
    const ICON_CLOCK = `<svg ${SVG_ATTRS}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
    const ICON_CHECK_CIRCLE = `<svg ${SVG_ATTRS}><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>`;
    const ICON_PIN = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 4.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z"/></svg>';

    // One chip per scan in a fixed-height slot, so the Scanned At and
    // Geo-Coordinates cells of a sub place line up with each other row by row.
    function scanSlotsHtml(r, chipFor) {
      if (!r.scanned || !r.scanList.length) return '<span class="scan-none">—</span>';
      return r.scanList.map(sc => `<div class="scan-slot">${chipFor(sc)}</div>`).join('');
    }

    // Timeline: a green tick on a scan whose latitude/longitude were captured,
    // a plain clock on one that was saved without a GPS fix.
    function timelineChipHtml(sc) {
      const located = sc.latitude !== null && sc.longitude !== null;
      return `<span class="scan-chip${located ? ' is-located' : ''}">${located ? ICON_CHECK_CIRCLE : ICON_CLOCK}${formatDateTime(sc.at)}</span>`;
    }

    // "16.98158, 82.24340" in a pin chip that opens that exact spot on the map
    // in a new tab; a scan saved without a GPS fix just shows "—".
    function geoChipHtml(sc) {
      if (sc.latitude === null || sc.longitude === null) return '<span class="scan-none">—</span>';
      const url = `https://www.google.com/maps?q=${sc.latitude},${sc.longitude}`;
      return `<a class="scan-chip geo-chip" href="${url}" target="_blank" rel="noopener noreferrer" title="Open this location on the map">${ICON_PIN}${formatCoord(sc.latitude)}, ${formatCoord(sc.longitude)}</a>`;
    }

    function flattenRecentScansCoverage(guards) {
      const rows = [];
      guards.forEach(g => {
        (g.dutyPlaces || []).forEach(sp => {
          const scanList = normalizeScanList(sp);
          rows.push({
            guardName: g.guardName,
            guardEmpId: g.guardEmpId,
            dutyPlace: sp.name,
            scanned: sp.scanned,
            scans: scanList.map(sc => sc.at),
            scanList,
          });
        });
      });
      return rows;
    }

    function matchesRecentScansFilters(row) {
      if (recentScansState.status === 'scanned' && !row.scanned) return false;
      if (recentScansState.status === 'not-scanned' && row.scanned) return false;
      if (recentScansState.search) {
        const haystack = `${row.guardName} ${row.guardEmpId} ${row.dutyPlace}`.toLowerCase();
        if (!haystack.includes(recentScansState.search.toLowerCase())) return false;
      }
      return true;
    }

    // Tags each row with:
    //  - groupIndex: one shared serial number per guard+main-place group
    //    (increments only when the guard or their main place changes)
    //  - subIndex: that sub place's own number *within* its group (resets
    //    to 1 at the start of every new group)
    //  - isNewGuard / isNewGroup: group-boundary flags, used to decide which
    //    rowspan cells to print
    function computeGroupedRecentScans(rows) {
      let groupIndex = 0;
      return rows.map((r, i) => {
        const prev = rows[i - 1];
        const sameGuardAsPrev = prev && prev.guardEmpId === r.guardEmpId;
        if (!sameGuardAsPrev) groupIndex++;
        return { ...r, groupIndex, isNewGuard: !sameGuardAsPrev, isNewGroup: !sameGuardAsPrev };
      });
    }

    // "Showing 1-10 of 139" + Previous/Next state for the table. Counts are
    // the numbered entries in the # column (one per guard + main place), so
    // "10 per page" means #1-#10, and each one's sub places stay together.
    function updateRecentScansPager(total, totalPages) {
      const { page, limit } = recentScansState;
      const from = total === 0 ? 0 : (page - 1) * limit + 1;
      const to = Math.min(page * limit, total);
      document.getElementById('recentScansPageInfo').textContent = total === 0 ? '' : `Showing ${from}-${to} of ${total}`;
      document.getElementById('recentScansPrevBtn').disabled = page <= 1;
      document.getElementById('recentScansNextBtn').disabled = page >= totalPages;
    }

    function renderRecentScansTable() {
      const body = document.getElementById('recentScansBody');
      const filtered = recentScansState.rows.filter(matchesRecentScansFilters);
      if (!filtered.length) {
        const msg = recentScansState.rows.length ? 'No scans match your search/filter.' : 'No duty assigned for this date.';
        body.innerHTML = `<tr><td colspan="6" style="color:var(--ink-500); font-size:13px;">${msg}</td></tr>`;
        updateRecentScansPager(0, 1);
        return;
      }

      // Paginate by the # column: each numbered entry (a guard + main place
      // with all its sub places) counts as one row, so a page of 10 is #1-#10
      // and an entry is never cut in half. Numbering is computed over the whole
      // filtered list first, so page 2 continues at #11 instead of restarting.
      const allGrouped = computeGroupedRecentScans(filtered);
      const totalEntries = allGrouped[allGrouped.length - 1].groupIndex;
      const limit = recentScansState.limit;
      const totalPages = Math.max(1, Math.ceil(totalEntries / limit));
      recentScansState.page = Math.min(Math.max(1, recentScansState.page), totalPages);
      const firstEntry = (recentScansState.page - 1) * limit; // entries before this page
      const pageRows = allGrouped.filter(r => r.groupIndex > firstEntry && r.groupIndex <= firstEntry + limit);
      updateRecentScansPager(totalEntries, totalPages);

      // Rows already come grouped by guard (then by main place), so a repeat
      // guard/main-place/serial only ever shows up on consecutive rows -
      // merge those with rowspan instead of re-printing them on every line.
      // Group boundaries are re-derived within this page (a guard who has two
      // main places could still straddle a page break, and this keeps the
      // merged name cell correct either way).
      const grouped = pageRows.map((r, j) => {
        const prev = pageRows[j - 1];
        const sameGuard = prev && prev.guardEmpId === r.guardEmpId;
        const sameGroup = prev && prev.groupIndex === r.groupIndex;
        return { ...r, isNewGuard: !sameGuard, isNewGroup: !sameGroup };
      });
      const html = [];
      for (let i = 0; i < grouped.length; i++) {
        const r = grouped[i];
        const zebra = r.groupIndex % 2 === 0 ? ' style="background:rgba(255,255,255,0.025);"' : '';
        html.push(`<tr${zebra}>`);

        let groupSpan = 0;
        if (r.isNewGroup) {
          while (grouped[i + groupSpan] && grouped[i + groupSpan].groupIndex === r.groupIndex) groupSpan++;
        }
        let guardSpan = 0;
        if (r.isNewGuard) {
          while (grouped[i + guardSpan] && grouped[i + guardSpan].guardEmpId === r.guardEmpId) guardSpan++;
        }

        if (r.isNewGroup) {
          html.push(`<td class="serial-col grp-first" rowspan="${groupSpan}" style="vertical-align:top;">${r.groupIndex}</td>`);
        }
        if (r.isNewGuard) {
          html.push(`<td rowspan="${guardSpan}" style="vertical-align:top;">${escapeHtml(r.guardName)} ( ${escapeHtml(r.guardEmpId)} )</td>`);
        }

        html.push(`<td class="preserve-space">${escapeHtml(r.dutyPlace)}</td>`);
        html.push(`<td class="status-col"><span class="status-pill ${r.scanned ? 'is-scanned' : 'is-pending'}">${r.scanned ? ICON_CHECK : ICON_PENDING}${r.scanned ? 'Scanned' : 'Not scanned'}</span></td>`);
        html.push(`<td>${scanSlotsHtml(r, timelineChipHtml)}</td>`);
        html.push(`<td>${scanSlotsHtml(r, geoChipHtml)}</td>`);
        html.push('</tr>');
      }
      body.innerHTML = html.join('');
    }

    // "YYYY-MM-DD" -> "DD-MM-YYYY", plain string reorder (no Date parsing,
    // so there's no timezone risk of landing on the wrong day).
    function formatIsoDateDisplay(isoDateStr) {
      const [y, m, d] = isoDateStr.split('-');
      return `${d}-${m}-${y}`;
    }

    function updateRecentScansHeading(date) {
      const heading = document.getElementById('recentScansHeading');
      if (!heading) return;
      heading.textContent = date === todayISODate()
        ? "Today's QR Code Scanned Data"
        : `${formatIsoDateDisplay(date)} QR Code Scanned Data`;
    }

    function loadRecentScans(date) {
      updateRecentScansHeading(date);
      document.getElementById('recentScansBody').innerHTML =
        '<tr><td colspan="6" style="color:var(--ink-500); font-size:13px;"><span class="spinner" role="status" aria-label="Loading"></span><span class="loader-text">Loading...</span></td></tr>';
      updateRecentScansPager(0, 1);

      fetchQrScanCoverageViaApi({ date })
        .then(res => {
          recentScansState.rows = flattenRecentScansCoverage(res.data);
          renderRecentScansTable();
        })
        .catch(err => {
          document.getElementById('recentScansBody').innerHTML =
            `<tr><td colspan="6" style="color:var(--danger); font-size:13px;">Could not load data: ${escapeHtml(err.message)}</td></tr>`;
          updateRecentScansPager(0, 1);
        });
    }

    // Tapping anywhere on the date field - not just the browser's tiny
    // calendar-icon hit target - opens the picker.
    const recentScansDateInput = document.getElementById('recentScansDate');
    recentScansDateInput.addEventListener('click', () => {
      if (typeof recentScansDateInput.showPicker === 'function') {
        try { recentScansDateInput.showPicker(); } catch (err) { /* already open */ }
      }
    });
    recentScansDateInput.addEventListener('change', (e) => {
      recentScansState.date = e.target.value || todayISODate();
      recentScansState.page = 1;
      loadRecentScans(recentScansState.date);
    });

    let recentScansSearchTimer;
    document.getElementById('recentScansSearch').addEventListener('input', (e) => {
      clearTimeout(recentScansSearchTimer);
      recentScansSearchTimer = setTimeout(() => {
        recentScansState.search = e.target.value.trim();
        recentScansState.page = 1;
        renderRecentScansTable();
      }, 250);
    });

    document.getElementById('recentScansStatusFilter').addEventListener('change', (e) => {
      recentScansState.status = e.target.value;
      recentScansState.page = 1;
      renderRecentScansTable();
    });

    document.getElementById('recentScansPageSizeSelect').addEventListener('change', (e) => {
      recentScansState.limit = parseInt(e.target.value, 10);
      recentScansState.page = 1;
      renderRecentScansTable();
    });

    document.getElementById('recentScansPrevBtn').addEventListener('click', () => {
      recentScansState.page -= 1;
      renderRecentScansTable();
    });

    document.getElementById('recentScansNextBtn').addEventListener('click', () => {
      recentScansState.page += 1;
      renderRecentScansTable();
    });

    document.getElementById('downloadRecentScansPdfBtn').addEventListener('click', () => {
      const filtered = recentScansState.rows.filter(matchesRecentScansFilters);
      if (!filtered.length) {
        alert('Nothing to export for this date/search/filter.');
        return;
      }
      if (typeof jspdf === 'undefined' || !jspdf.jsPDF) {
        alert('The PDF export library did not load. Check your internet connection and try again.');
        return;
      }

      // Mirrors the on-screen table exactly: one grid line per cell, and the
      // #/Guard columns merged (via autoTable's rowSpan) across
      // every duty place of that guard.
      const grouped = computeGroupedRecentScans(filtered);
      const body = [];
      for (let i = 0; i < grouped.length; i++) {
        const r = grouped[i];
        const row = [];

        if (r.isNewGroup) {
          let span = 0;
          while (grouped[i + span] && grouped[i + span].groupIndex === r.groupIndex) span++;
          row.push({ content: String(r.groupIndex), rowSpan: span, styles: { valign: 'top' } });
          row.push({ content: `${r.guardName} (${r.guardEmpId})`, rowSpan: span, styles: { valign: 'top' } });
        }

        row.push(r.dutyPlace);
        row.push(r.scanned ? 'Scanned' : 'Not scanned');
        const pdfLines = pick => (r.scanned && r.scanList.length ? r.scanList.map(pick).join('\n') : '—');
        row.push(pdfLines(sc => formatDateTime(sc.at)));
        row.push(pdfLines(sc => (sc.latitude === null || sc.longitude === null ? '—' : `${formatCoord(sc.latitude)}, ${formatCoord(sc.longitude)}`)));
        body.push(row);
      }

      const doc = new jspdf.jsPDF({ orientation: 'landscape' });
      doc.setFontSize(14);
      doc.text(`Date wise Data — ${recentScansState.date}`, 14, 15);
      doc.autoTable({
        startY: 22,
        theme: 'grid',
        head: [['#', 'Guard', 'Duty Place', 'Status', 'Scanned At (Timeline)', 'Geo-Coordinates']],
        body,
        styles: { fontSize: 8, lineWidth: 0.1, lineColor: [38, 56, 90] },
        headStyles: { fillColor: [18, 33, 58] },
        // keep the time and coordinates on one line each (no wrapping mid-value)
        columnStyles: { 4: { cellWidth: 'wrap' }, 5: { cellWidth: 'wrap' } },
      });
      doc.save(`qr_scans_${recentScansState.date}.pdf`);
    });

    loadRecentScans(recentScansState.date);
  }

  if (section === 'images') {
    // ---------- Tab switching ----------
    const imgTabNames = ['uploadImage', 'getUploadImages'];
    document.querySelectorAll('#imagesTabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#imagesTabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        imgTabNames.forEach(t => {
          document.getElementById('tab-' + t).style.display = (t === btn.dataset.tab) ? 'block' : 'none';
        });
        if (btn.dataset.tab === 'getUploadImages') loadUploadedImages();
      });
    });

    // ======================================================================
    // Tab: Upload Image
    //  - jpg/jpeg/png only, checked by both MIME type and file extension
    //    (some browsers/OSes leave `file.type` blank for local files, so the
    //    extension check is the fallback that always works), AND the file
    //    must actually decode as an image (catches a renamed .exe/.txt that
    //    only *looks* like a jpg/png from its name).
    //  - size must be between 10 KB and 2 MB.
    //  - a comment describing the photo is required before Upload unlocks,
    //    and must be 3-500 characters after trimming whitespace.
    // The server (routes/uploadedImages.js) re-checks every one of these
    // rules independently - including the image-signature check - since a
    // browser check alone can always be bypassed.
    // ======================================================================
    const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png'];
    const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png'];
    const MIN_IMAGE_SIZE = 10 * 1024; // 10 KB
    const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2 MB
    const MIN_COMMENT_LENGTH = 3;
    const MAX_COMMENT_LENGTH = 500;

    const fileInput = document.getElementById('imageFileInput');
    const previewTile = document.querySelector('#tab-uploadImage .ph');
    const pickBtn = document.getElementById('pickImgBtn');
    const commentInput = document.getElementById('imageCommentInput');
    const commentCount = document.getElementById('imageCommentCount');
    const uploadBtn = document.getElementById('uploadImgBtn');
    const errBox = document.getElementById('imageUploadError');

    let selectedFile = null;

    function formatKB(bytes) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    // Returns '' when the comment is valid, or an error message otherwise.
    // Centralized so the same rule runs on every keystroke AND again right
    // before the upload actually fires.
    function commentError() {
      const len = commentInput.value.trim().length;
      if (len === 0) return 'Please write a comment describing the photo.';
      if (len < MIN_COMMENT_LENGTH) return `Comment must be at least ${MIN_COMMENT_LENGTH} characters.`;
      if (len > MAX_COMMENT_LENGTH) return `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer.`;
      return '';
    }

    function updateCommentCount() {
      const len = commentInput.value.trim().length;
      commentCount.textContent = `${len} / ${MAX_COMMENT_LENGTH}`;
      commentCount.style.color = (len > 0 && len < MIN_COMMENT_LENGTH) ? '#e2574c' : 'var(--ink-500)';
    }

    // Upload only unlocks once a valid file AND a valid comment are both
    // present - requirement #1 ("at the time of pick image, user needs to
    // write a comment").
    function refreshUploadButton() {
      uploadBtn.disabled = !(selectedFile && !commentError());
    }

    function resetSelection() {
      selectedFile = null;
      fileInput.value = '';
      previewTile.innerHTML = '🖼';
      refreshUploadButton();
    }

    pickBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', () => {
      errBox.textContent = '';
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;

      const ext = (file.name.split('.').pop() || '').toLowerCase();
      const isAllowedType = ALLOWED_IMAGE_TYPES.includes(file.type) || ALLOWED_IMAGE_EXTENSIONS.includes(ext);
      if (!isAllowedType) {
        errBox.textContent = 'Only JPG, JPEG or PNG images are allowed.';
        resetSelection();
        return;
      }

      // Requirement #2: image size must be between 10 KB and 2 MB.
      if (file.size < MIN_IMAGE_SIZE) {
        errBox.textContent = `Image is too small (${formatKB(file.size)}). Minimum size is 10 KB.`;
        resetSelection();
        return;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        errBox.textContent = `Image is too large (${formatKB(file.size)}). Maximum size is 2 MB.`;
        resetSelection();
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        // Confirm the browser can actually decode this as an image before
        // accepting it - a corrupt file or a non-image renamed to .jpg/.png
        // would pass the checks above on name/size alone.
        const probe = new Image();
        probe.onload = () => {
          selectedFile = file;
          previewTile.innerHTML = `<img src="${reader.result}" alt="Selected image" style="width:100%; height:100%; object-fit:cover;">`;
          refreshUploadButton();
        };
        probe.onerror = () => {
          errBox.textContent = 'This file is not a valid image. Please pick a different JPG or PNG.';
          resetSelection();
        };
        probe.src = reader.result;
      };
      reader.onerror = () => {
        errBox.textContent = 'Could not read the selected file. Please try again.';
        resetSelection();
      };
      reader.readAsDataURL(file);
    });

    commentInput.addEventListener('input', () => {
      // Enforce the max length even against a pasted block of text that
      // exceeds the textarea's `maxlength` attribute in older browsers.
      if (commentInput.value.length > MAX_COMMENT_LENGTH) {
        commentInput.value = commentInput.value.slice(0, MAX_COMMENT_LENGTH);
      }
      errBox.textContent = '';
      updateCommentCount();
      refreshUploadButton();
    });

    updateCommentCount();

    uploadBtn.addEventListener('click', async () => {
      if (!selectedFile) {
        errBox.textContent = 'Please pick an image first.';
        return;
      }
      const cErr = commentError();
      if (cErr) {
        errBox.textContent = cErr;
        return;
      }
      const comment = commentInput.value.trim();

      errBox.textContent = '';
      uploadBtn.disabled = true;
      pickBtn.disabled = true;
      uploadBtn.textContent = 'Uploading...';
      try {
        await uploadImageViaApi({
          file: selectedFile,
          comment,
          guardEmpId: user.roll_no,
          guardName: user.first_name,
        });
        alert('Image uploaded successfully.');
        resetSelection();
        commentInput.value = '';
        updateCommentCount();
      } catch (err) {
        errBox.textContent = err.message || 'Could not upload the image.';
        refreshUploadButton();
      } finally {
        uploadBtn.textContent = 'Upload';
        pickBtn.disabled = false;
      }
    });

    // ======================================================================
    // Tab: Get Upload Images - photos grouped by the date they were
    // uploaded. The most recent date's photos are shown straight away (each
    // tagged with who submitted it - name + emp id -, when, and the comment
    // they wrote at pick-time); every earlier date becomes a card with a
    // cover photo and a count. Tapping a date card opens that date's photos
    // on their own page (with a Back button). Tapping a thumbnail opens it
    // full-size in a modal; each tile (and the modal) also has a Download
    // button that saves the original file.
    // ======================================================================
    let uploadedImagesById = new Map();
    let uploadedImagesByDate = new Map(); // 'YYYY-MM-DD' (local) -> images, newest first
    let uploadedDateKeys = [];            // newest date first ('unknown' last)

    function imageFileExt(imageUrl) {
      const dot = imageUrl.lastIndexOf('.');
      return dot === -1 ? '.jpg' : imageUrl.slice(dot);
    }

    function downloadFileName(img) {
      const uploaded = new Date(img.uploadedAt || img.createdAt);
      const stamp = isNaN(uploaded.getTime())
        ? Date.now()
        : uploaded.toISOString().slice(0, 19).replace(/[:T]/g, '-');
      return `${img.guardEmpId}_${stamp}${imageFileExt(img.imageUrl)}`;
    }

    function formatImageDateTime(img) {
      const uploaded = new Date(img.uploadedAt || img.createdAt);
      const dateStr = isNaN(uploaded.getTime())
        ? '—'
        : uploaded.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const timeStr = isNaN(uploaded.getTime())
        ? ''
        : uploaded.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      return { dateStr, timeStr };
    }

    // ----- date helpers (all in the browser's local time, like the rest of the panel) -----
    function localDateKey(d) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function imageDateKey(img) {
      const d = new Date(img.uploadedAt || img.createdAt);
      return isNaN(d.getTime()) ? 'unknown' : localDateKey(d);
    }

    function dateFromKey(key) {
      const [y, m, d] = key.split('-').map(Number);
      return new Date(y, m - 1, d);
    }

    function yesterdayKey() {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return localDateKey(d);
    }

    // "12 Oct 2026"
    function shortDateLabel(key) {
      return key === 'unknown'
        ? 'Unknown date'
        : dateFromKey(key).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    // "Today, 13 Oct 2026" / "Yesterday, 12 Oct 2026" / "12 Oct 2026"
    function friendlyDateLabel(key) {
      if (key === todayISODate()) return `Today, ${shortDateLabel(key)}`;
      if (key === yesterdayKey()) return `Yesterday, ${shortDateLabel(key)}`;
      return shortDateLabel(key);
    }

    function plural(n, word) {
      return `${n} ${word}${n === 1 ? '' : 's'}`;
    }

    // ----- rendering -----
    function imageTileHtml(img) {
      const { dateStr, timeStr } = formatImageDateTime(img);
      return `
        <div class="image-tile">
          <div class="ph viewable" style="height:140px;" data-img-id="${img._id}" title="Tap to view full size">
            <img src="${img.imageUrl}" alt="Uploaded by ${escapeHtml(img.guardName)}" style="width:100%; height:100%; object-fit:cover;">
            <a class="dl-btn" href="${img.imageUrl}" download="${downloadFileName(img)}" title="Download" onclick="event.stopPropagation()">⬇</a>
          </div>
          <div class="meta">
            <b>${escapeHtml(img.guardName)} ( ${escapeHtml(img.guardEmpId)} )</b>
            <span>${dateStr} • ${timeStr}</span>
            <p class="comment">"${escapeHtml(img.comment)}"</p>
          </div>
        </div>`;
    }

    function bindImageTiles(container) {
      container.querySelectorAll('.ph.viewable').forEach(el => {
        el.addEventListener('click', () => openImagePreview(el.dataset.imgId));
      });
    }

    // How the date card's thumbnail mosaic is laid out for N photos, on a
    // 6-column x 2-row grid: [columns to span, rows to span] per thumbnail.
    // Up to 6 thumbnails are shown; with more than 6 photos the last one
    // becomes a "+N" tile for the rest.
    function mosaicSpans(count) {
      if (count <= 1) return [[6, 2]];
      if (count === 2) return [[3, 2], [3, 2]];
      if (count === 3) return [[3, 2], [3, 1], [3, 1]];
      if (count === 4) return [[3, 1], [3, 1], [3, 1], [3, 1]];
      if (count === 5) return [[3, 1], [3, 1], [2, 1], [2, 1], [2, 1]];
      return [[2, 1], [2, 1], [2, 1], [2, 1], [2, 1], [2, 1]];
    }

    function dateCardHtml(key) {
      const imgs = uploadedImagesByDate.get(key);
      const spans = mosaicSpans(imgs.length);
      const hidden = imgs.length - spans.length; // photos that don't fit in the mosaic
      const thumbs = spans.map(([cols, rows], i) => {
        const isMore = hidden > 0 && i === spans.length - 1;
        // when there are more photos than slots, the last slot is "+N" (it
        // stands in for its own photo too, hence hidden + 1)
        return `
          <div class="mosaic-thumb" style="grid-column: span ${cols}; grid-row: span ${rows};">
            <img src="${imgs[i].imageUrl}" alt="" loading="lazy">
            ${isMore ? `<span class="mosaic-more">+${hidden + 1}</span>` : ''}
          </div>`;
      }).join('');
      const weekday = key === 'unknown'
        ? ''
        : (key === yesterdayKey() ? 'Yesterday' : dateFromKey(key).toLocaleDateString('en-IN', { weekday: 'long' }));
      const sub = [weekday, plural(imgs.length, 'image')].filter(Boolean).join(' • ');
      return `
        <button type="button" class="date-card" data-date-key="${key}" title="View ${plural(imgs.length, 'image')} from ${shortDateLabel(key)}">
          <div class="date-card-cover">${thumbs}</div>
          <div class="date-card-body">
            <div><b>${shortDateLabel(key)}</b><span>${sub}</span></div>
            <span class="chev">›</span>
          </div>
        </button>`;
    }

    // Landing view: latest date's photos, then a card per earlier date.
    function renderUploadedImagesList() {
      const view = document.getElementById('uploadedImagesView');
      if (uploadedDateKeys.length === 0) {
        view.innerHTML = '<p style="color:var(--ink-500); font-size:13px;">No images uploaded yet.</p>';
        return;
      }
      const [latestKey, ...olderKeys] = uploadedDateKeys;
      const latest = uploadedImagesByDate.get(latestKey);

      view.innerHTML = `
        <div class="img-date-head">
          <h3>Recent</h3>
          <span>${friendlyDateLabel(latestKey)} • ${plural(latest.length, 'image')}</span>
        </div>
        <div class="image-grid">${latest.map(imageTileHtml).join('')}</div>
        ${olderKeys.length ? `
          <div class="img-date-head" style="margin-top:30px;">
            <h3>Previous dates</h3>
            <span>Tap a date to see its images</span>
          </div>
          <div class="date-card-grid">${olderKeys.map(dateCardHtml).join('')}</div>` : ''}
      `;

      bindImageTiles(view);
      view.querySelectorAll('.date-card').forEach(card => {
        card.addEventListener('click', () => renderUploadedImagesForDate(card.dataset.dateKey));
      });
    }

    // "Another page": every photo from one date, with a Back button.
    function renderUploadedImagesForDate(key) {
      const view = document.getElementById('uploadedImagesView');
      const imgs = uploadedImagesByDate.get(key) || [];
      view.innerHTML = `
        <div class="img-detail-head">
          <button type="button" class="btn btn-outline" id="imagesBackBtn" style="width:auto; padding:8px 16px;">← Back</button>
          <div class="img-date-head" style="margin:0;">
            <h3>${friendlyDateLabel(key)}</h3>
            <span>${plural(imgs.length, 'image')}</span>
          </div>
        </div>
        <div class="image-grid">${imgs.map(imageTileHtml).join('')}</div>
      `;
      document.getElementById('imagesBackBtn').addEventListener('click', () => {
        renderUploadedImagesList();
        window.scrollTo({ top: 0 });
      });
      bindImageTiles(view);
      window.scrollTo({ top: 0 });
    }

    // Tapping a thumbnail (anywhere except its Download button) opens the
    // full-size image plus its guard/date/comment details in the shared
    // modal, with its own Download button alongside.
    function openImagePreview(id) {
      const img = uploadedImagesById.get(id);
      if (!img) return;
      const { dateStr, timeStr } = formatImageDateTime(img);
      openModal(`
        <div class="image-preview-modal">
          <img src="${img.imageUrl}" alt="Uploaded by ${escapeHtml(img.guardName)}">
          <div class="meta">
            <b>${escapeHtml(img.guardName)} ( ${escapeHtml(img.guardEmpId)} )</b>
            <span>${dateStr} • ${timeStr}</span>
            <p class="comment">"${escapeHtml(img.comment)}"</p>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" id="closePreviewBtn">Close</button>
            <a class="btn btn-primary" style="width:auto; padding:10px 20px; text-decoration:none;" href="${img.imageUrl}" download="${downloadFileName(img)}">Download</a>
          </div>
        </div>
      `, { maxWidth: '640px' });
      document.getElementById('closePreviewBtn').addEventListener('click', closeModal);
    }

    // Grouping needs every photo, not just the first page, so keep paging
    // (100 at a time) until the server says there are no more.
    async function fetchAllUploadedImages() {
      const all = [];
      let page = 1;
      let totalPages = 1;
      do {
        const res = await fetchUploadedImagesViaApi({ page, limit: 100 });
        all.push(...res.data);
        totalPages = res.totalPages || 1;
        page += 1;
      } while (page <= totalPages && page <= 50);
      return all;
    }

    async function loadUploadedImages() {
      const view = document.getElementById('uploadedImagesView');
      view.innerHTML = '<p style="color:var(--ink-500); font-size:13px;"><span class="spinner" role="status" aria-label="Loading"></span><span class="loader-text">Loading...</span></p>';
      try {
        const data = await fetchAllUploadedImages();
        const stamp = img => new Date(img.uploadedAt || img.createdAt).getTime() || 0;
        data.sort((a, b) => stamp(b) - stamp(a));

        uploadedImagesById = new Map(data.map(img => [img._id, img]));
        uploadedImagesByDate = new Map();
        data.forEach(img => {
          const key = imageDateKey(img);
          if (!uploadedImagesByDate.has(key)) uploadedImagesByDate.set(key, []);
          uploadedImagesByDate.get(key).push(img);
        });
        uploadedDateKeys = [...uploadedImagesByDate.keys()].sort((a, b) => {
          if (a === 'unknown') return 1;
          if (b === 'unknown') return -1;
          return a < b ? 1 : -1; // newest date first
        });

        renderUploadedImagesList();
      } catch (err) {
        view.innerHTML = `<p style="color:#e2574c; font-size:13px;">${escapeHtml(err.message || 'Could not load uploaded images.')}</p>`;
      }
    }

    loadUploadedImages();
  }

  if (section === 'securityData') {
    // ---------- Tab switching ----------
    const sdTabNames = ['addSecurity', 'securityInfo'];
    document.querySelectorAll('#securityDataTabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#securityDataTabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        sdTabNames.forEach(t => {
          document.getElementById('tab-' + t).style.display = (t === btn.dataset.tab) ? 'block' : 'none';
        });
      });
    });

    // ======================================================================
    // Tab: Add Security (single account form + CSV bulk upload)
    // ======================================================================

    // ---- Optional profile pic on the "New account" form ----
    // jpg/png only, max 2 MB, must decode as a real image - same rules as
    // the Profile tab. Purely optional: if nothing is picked, the
    // account is created with no photo, exactly like before. Not offered for
    // the CSV bulk upload below - that stays text-only, unchanged.
    const ALLOWED_PIC_TYPES = ['image/jpeg', 'image/png'];
    const ALLOWED_PIC_EXTENSIONS = ['jpg', 'jpeg', 'png'];
    const MAX_PIC_SIZE = 2 * 1024 * 1024; // 2 MB

    const newGuardPicInput = document.getElementById('newGuardPicInput');
    const newGuardPicBtn = document.getElementById('newGuardPicBtn');
    const newGuardPicError = document.getElementById('newGuardPicError');
    const newGuardAvatarPreview = document.getElementById('newGuardAvatarPreview');
    let newGuardPicFile = null;

    function resetNewGuardPic() {
      newGuardPicFile = null;
      newGuardPicInput.value = '';
      newGuardAvatarPreview.innerHTML = '＋';
    }

    newGuardPicBtn.addEventListener('click', () => newGuardPicInput.click());

    newGuardPicInput.addEventListener('change', () => {
      newGuardPicError.textContent = '';
      const file = newGuardPicInput.files && newGuardPicInput.files[0];
      if (!file) return;

      const ext = (file.name.split('.').pop() || '').toLowerCase();
      const isAllowedType = ALLOWED_PIC_TYPES.includes(file.type) || ALLOWED_PIC_EXTENSIONS.includes(ext);
      if (!isAllowedType) {
        newGuardPicError.textContent = 'Only JPG, JPEG or PNG images are allowed.';
        resetNewGuardPic();
        return;
      }
      if (file.size > MAX_PIC_SIZE) {
        newGuardPicError.textContent = `Image is too large (${(file.size / 1024).toFixed(1)} KB). Maximum size is 2 MB.`;
        resetNewGuardPic();
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        // Confirm the browser can actually decode this as an image before
        // accepting it - catches a corrupt file or a non-image renamed to
        // .jpg/.png.
        const probe = new Image();
        probe.onload = () => {
          newGuardPicFile = file;
          newGuardAvatarPreview.innerHTML = `<img src="${reader.result}" alt="Preview">`;
        };
        probe.onerror = () => {
          newGuardPicError.textContent = 'This file is not a valid image. Please pick a different JPG or PNG.';
          resetNewGuardPic();
        };
        probe.src = reader.result;
      };
      reader.onerror = () => {
        newGuardPicError.textContent = 'Could not read the selected file. Please try again.';
        resetNewGuardPic();
      };
      reader.readAsDataURL(file);
    });

    // ---- Add-account validation ----
    // Every field is required except the profile photo. Password rules match
    // the Change Password screen (7+ chars, an uppercase letter, a number
    // and a special character); mobile must be a 10-digit Indian number.
    const addGuardForm = document.getElementById('addGuardForm');

    function validateAddGuard(v) {
      const errs = {};
      const name = v.first_name.trim();
      if (!name) errs.first_name = 'Full name is required.';
      else if (name.length < 2) errs.first_name = 'Full name must be at least 2 characters.';
      else if (!/^[A-Za-z][A-Za-z .'-]*$/.test(name)) errs.first_name = 'Use letters, spaces, . \' or - only.';

      const roll = v.roll_no.trim();
      if (!roll) errs.roll_no = 'Roll No is required.';
      else if (!/^[A-Za-z0-9_-]{2,20}$/.test(roll)) errs.roll_no = 'Roll No must be 2-20 letters, numbers, - or _ (no spaces).';

      const pwd = v.password;
      if (!pwd) errs.password = 'Password is required.';
      else if (/\s/.test(pwd)) errs.password = 'Password cannot contain spaces.';
      else if (pwd.length < 7) errs.password = 'Password must be at least 7 characters.';
      else if (!/[A-Z]/.test(pwd)) errs.password = 'Password needs at least one uppercase letter.';
      else if (!/[0-9]/.test(pwd)) errs.password = 'Password needs at least one number.';
      else if (!/[^A-Za-z0-9\s]/.test(pwd)) errs.password = 'Password needs at least one special character (e.g. @ # $ !).';

      if (!v.role) errs.role = 'Please select a role.';

      const mob = v.mobile.trim();
      if (!mob) errs.mobile = 'Mobile number is required.';
      else if (!/^\d+$/.test(mob)) errs.mobile = 'Mobile number must contain digits only.';
      else if (mob.length !== 10) errs.mobile = 'Mobile number must be exactly 10 digits.';
      else if (!/^[6-9]/.test(mob)) errs.mobile = 'Mobile number must start with 6, 7, 8 or 9.';

      if (!v.gender) errs.gender = 'Please select a gender.';

      const des = v.designation.trim();
      if (!des) errs.designation = 'Designation is required.';
      else if (des.length < 2) errs.designation = 'Designation must be at least 2 characters.';
      return errs;
    }

    function showAddGuardErrors(errs) {
      addGuardForm.querySelectorAll('.field-error').forEach((box) => {
        const msg = errs[box.dataset.for] || '';
        box.textContent = msg;
        const input = addGuardForm.elements[box.dataset.for];
        if (input) input.classList.toggle('input-invalid', !!msg);
      });
    }

    function readAddGuard() {
      const f = new FormData(addGuardForm);
      const out = {};
      ['first_name', 'roll_no', 'password', 'role', 'mobile', 'gender', 'designation']
        .forEach((k) => { out[k] = (f.get(k) || '').toString(); });
      return out;
    }

    // Mobile: digits only as you type
    addGuardForm.elements.mobile.addEventListener('input', (ev) => {
      ev.target.value = ev.target.value.replace(/\D/g, '').slice(0, 10);
    });
    // Clear / re-check a field's message live once the user starts fixing it
    addGuardForm.querySelectorAll('input, select').forEach((el) => {
      if (el.type === 'file') return;
      el.addEventListener('input', () => {
        const box = addGuardForm.querySelector(`.field-error[data-for="${el.name}"]`);
        if (!box || !box.textContent) return;
        const msg = validateAddGuard(readAddGuard())[el.name] || '';
        box.textContent = msg;
        el.classList.toggle('input-invalid', !!msg);
      });
    });

    addGuardForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('addGuardError');
      errBox.textContent = '';
      const okPrev0 = document.getElementById('addGuardSuccess');
      if (okPrev0) okPrev0.textContent = '';

      const values = readAddGuard();
      const errs = validateAddGuard(values);
      showAddGuardErrors(errs);
      const firstBad = Object.keys(errs)[0];
      if (firstBad) {
        addGuardForm.elements[firstBad].focus();
        return;
      }

      const payload = {
        first_name: values.first_name.trim().replace(/\s+/g, ' '),
        roll_no: values.roll_no.trim(),
        password: values.password,
        role: values.role,
        mobile: values.mobile.trim(),
        gender: values.gender,
        designation: values.designation.trim(),
      };
      const okPrev = document.getElementById('addGuardSuccess');
      if (okPrev) okPrev.textContent = '';
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        const saved = await addUserViaApi(payload);

        // The photo is a second, independent request against the account
        // we just created - if it fails, the account still exists, it's
        // just left without a photo for now (the admin can add one later by
        // clicking that guard's photo in the Security Information tab).
        if (newGuardPicFile) {
          try {
            const { profile_pic } = await uploadProfilePicViaApi(saved.roll_no, newGuardPicFile);
            saved.profile_pic = profile_pic;
          } catch (picErr) {
            errBox.textContent = `Account created, but the photo could not be uploaded: ${picErr.message}`;
          }
        }

        errBox.textContent = '';
        const okBox = document.getElementById('addGuardSuccess');
        if (okBox) okBox.textContent = `Account created for ${saved.first_name} (${saved.roll_no}).`;
        e.target.reset();
        showAddGuardErrors({});
        resetNewGuardPic();
      } catch (err) {
        errBox.textContent = err.message;
      } finally {
        submitBtn.disabled = false;
      }
    });

    // ---- CSV bulk upload ----
    document.getElementById('downloadTemplateBtn').addEventListener('click', downloadCsvTemplate);

    const fileInput = document.getElementById('csvFileInput');
    const uploadBtn = document.getElementById('uploadCsvBtn');
    const statusBox = document.getElementById('bulkUploadStatus');
    const resultList = document.getElementById('bulkResultList');
    let selectedFile = null;

    fileInput.addEventListener('change', (e) => {
      selectedFile = e.target.files[0] || null;
      uploadBtn.disabled = !selectedFile;
      statusBox.textContent = selectedFile ? `Selected: ${selectedFile.name}` : '';
      resultList.innerHTML = '';
    });

    uploadBtn.addEventListener('click', () => {
      if (!selectedFile) return;
      uploadBtn.disabled = true;
      statusBox.textContent = 'Reading file...';
      resultList.innerHTML = '';

      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const rows = parseCsv(ev.target.result);
          if (!rows.length) {
            statusBox.textContent = 'No data rows found in that file.';
            return;
          }
          statusBox.textContent = `Uploading ${rows.length} row(s)...`;
          const result = await bulkAddUsersViaApi(rows);
          statusBox.innerHTML = `<span class="badge badge-success">${result.insertedCount} added</span> &nbsp; <span class="badge ${result.skippedCount ? 'badge-danger' : 'badge-amber'}">${result.skippedCount} skipped</span>`;
          const skipped = result.results.filter(r => r.status === 'skipped');
          resultList.innerHTML = skipped.length
            ? skipped.map(r => `<div class="row-item"><span>Row ${r.row} (${r.roll_no || '—'})</span><span style="color:var(--danger);">${escapeHtml(r.reason)}</span></div>`).join('')
            : '<div style="color:var(--ink-500); padding:6px 0;">No rows skipped.</div>';
        } catch (err) {
          statusBox.innerHTML = `<span style="color:var(--danger);">${escapeHtml(err.message)}</span>`;
        } finally {
          uploadBtn.disabled = false;
          fileInput.value = '';
          selectedFile = null;
        }
      };
      reader.readAsText(selectedFile);
    });

    // ======================================================================
    // Tab: Security Information (search + pagination + edit/block/delete)
    // ======================================================================
    const state = { search: '', page: 1, limit: 10 };
    let currentRows = []; // cache of the currently-rendered page, for the edit modal

    const renderTable = (res) => {
      currentRows = res.data;
      const wrap = document.getElementById('securityDataTableWrap');
      if (!res.data.length) {
        wrap.innerHTML = `<p style="color:var(--ink-500); font-size:13px;">${state.search ? 'No matching accounts found.' : 'No accounts yet. Add one via "Add Security".'}</p>`;
      } else {
        const startSerial = (res.page - 1) * res.limit;
        wrap.innerHTML = `
          <div class="table-scroll">
            <table>
              <thead><tr><th></th><th>#</th><th>Name</th><th>Roll No</th><th>Role</th><th>Gender</th><th>Mobile</th><th>Designation</th><th>Status</th><th></th></tr></thead>
              <tbody>
                ${res.data.map((u, i) => `
                  <tr data-id="${u._id}">
                    <td>
                      <button type="button" class="avatar-btn" data-id="${u._id}" title="Change photo">
                        <div class="avatar">${u.profile_pic ? `<img src="${escapeHtml(u.profile_pic)}" alt="${escapeHtml(u.first_name)}">` : escapeHtml(u.first_name.charAt(0))}</div>
                      </button>
                    </td>
                    <td class="serial-col">${startSerial + i + 1}</td>
                    <td>${escapeHtml(u.first_name)}</td>
                    <td>${escapeHtml(u.roll_no)}</td>
                    <td><span class="badge ${u.role === 'admin' ? 'badge-amber' : 'badge-success'}">${u.role}</span></td>
                    <td>${escapeHtml(u.gender || '—')}</td>
                    <td>${escapeHtml(u.mobile)}</td>
                    <td>${escapeHtml(u.designation)}</td>
                    <td><span class="badge ${u.blocked ? 'badge-blocked' : 'badge-success'}">${u.blocked ? 'Blocked' : 'Active'}</span></td>
                    <td>
                      <div class="row-actions">
                        <button class="edit-btn" data-id="${u._id}" title="Edit">✏️</button>
                        <button class="${u.blocked ? 'unblock-btn' : 'block-btn'}" data-id="${u._id}" title="${u.blocked ? 'Unblock' : 'Block'}">${u.blocked ? '🔓' : '🚫'}</button>
                        <button class="delete-btn" data-id="${u._id}" title="Delete">🗑</button>
                      </div>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`;
        wireRowActions();
      }
      const from = res.total === 0 ? 0 : (res.page - 1) * res.limit + 1;
      const to = Math.min(res.page * res.limit, res.total);
      document.getElementById('securityPageInfo').textContent = `Showing ${from}-${to} of ${res.total}`;
      document.getElementById('securityPrevBtn').disabled = res.page <= 1;
      document.getElementById('securityNextBtn').disabled = res.page >= res.totalPages;
    };

    const load = () => {
      document.getElementById('securityDataTableWrap').innerHTML = '<p style="color:var(--ink-500); font-size:13px;"><span class="spinner" role="status" aria-label="Loading"></span><span class="loader-text">Loading...</span></p>';
      fetchUsersViaApi({ search: state.search, page: state.page, limit: state.limit })
        .then(renderTable)
        .catch(err => {
          document.getElementById('securityDataTableWrap').innerHTML = `<p style="color:var(--danger); font-size:13px;">Could not load data: ${escapeHtml(err.message)}</p>`;
        });
    };

    function wireRowActions() {
      document.querySelectorAll('#tab-securityInfo .avatar-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const u = currentRows.find(r => r._id === btn.dataset.id);
          if (u) openPhotoModal(u);
        });
      });
      document.querySelectorAll('#tab-securityInfo .edit-btn').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(btn.dataset.id));
      });
      document.querySelectorAll('#tab-securityInfo .block-btn, #tab-securityInfo .unblock-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const u = currentRows.find(r => r._id === btn.dataset.id);
          const verb = u && u.blocked ? 'unblock' : 'block';
          if (!confirm(`Are you sure you want to ${verb} ${u ? u.first_name : 'this account'}?`)) return;
          try {
            await toggleBlockUserViaApi(btn.dataset.id);
            load();
          } catch (err) {
            alert(err.message);
          }
        });
      });
      document.querySelectorAll('#tab-securityInfo .delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const u = currentRows.find(r => r._id === btn.dataset.id);
          if (!confirm(`Delete ${u ? u.first_name : 'this account'} (${u ? u.roll_no : ''})? This cannot be undone.`)) return;
          try {
            await deleteUserViaApi(btn.dataset.id);
            load();
          } catch (err) {
            alert(err.message);
          }
        });
      });
    }

    // Photo upload/change - same validated-file flow as the admin's own
    // "Profile" tab (type/extension check, size check, then a
    // decode probe before it's ever sent), just aimed at whichever guard's
    // row was clicked instead of the logged-in admin.
    function openPhotoModal(u) {
      const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png'];
      const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png'];
      const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2 MB
      const formatKB = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

      openModal(`
        <h3>Change photo — ${escapeHtml(u.first_name)} (${escapeHtml(u.roll_no)})</h3>
        <div style="display:flex; flex-direction:column; align-items:center; gap:14px;">
          <div class="avatar avatar-lg" id="photoModalAvatar" style="width:84px; height:84px; font-size:30px;">
            ${u.profile_pic ? `<img src="${escapeHtml(u.profile_pic)}" alt="${escapeHtml(u.first_name)}">` : escapeHtml(u.first_name.charAt(0))}
          </div>
          <input type="file" id="photoModalInput" accept="image/jpeg,image/png" style="display:none;" />
          <button type="button" class="btn btn-outline" id="photoModalChooseBtn" style="width:auto; padding:8px 18px;">Choose Photo</button>
          <div class="error-text" id="photoModalError"></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" id="photoModalCloseBtn">Close</button>
          </div>
        </div>
      `);

      const input = document.getElementById('photoModalInput');
      const chooseBtn = document.getElementById('photoModalChooseBtn');
      const errBox = document.getElementById('photoModalError');
      const avatarEl = document.getElementById('photoModalAvatar');

      document.getElementById('photoModalCloseBtn').addEventListener('click', closeModal);
      chooseBtn.addEventListener('click', () => input.click());

      input.addEventListener('change', () => {
        errBox.textContent = '';
        const file = input.files && input.files[0];
        if (!file) return;

        const ext = (file.name.split('.').pop() || '').toLowerCase();
        const isAllowedType = ALLOWED_IMAGE_TYPES.includes(file.type) || ALLOWED_IMAGE_EXTENSIONS.includes(ext);
        if (!isAllowedType) {
          errBox.textContent = 'Only JPG, JPEG or PNG images are allowed.';
          input.value = '';
          return;
        }
        if (file.size > MAX_IMAGE_SIZE) {
          errBox.textContent = `Image is too large (${formatKB(file.size)}). Maximum size is 2 MB.`;
          input.value = '';
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          // Confirm the browser can actually decode this as an image before
          // uploading it - catches a corrupt file or a non-image renamed to
          // .jpg/.png.
          const probe = new Image();
          probe.onload = () => uploadPhoto(file);
          probe.onerror = () => {
            errBox.textContent = 'This file is not a valid image. Please pick a different JPG or PNG.';
            input.value = '';
          };
          probe.src = reader.result;
        };
        reader.onerror = () => {
          errBox.textContent = 'Could not read the selected file. Please try again.';
          input.value = '';
        };
        reader.readAsDataURL(file);
      });

      async function uploadPhoto(file) {
        errBox.textContent = '';
        chooseBtn.disabled = true;
        const originalLabel = chooseBtn.textContent;
        chooseBtn.textContent = 'Uploading...';
        try {
          const { profile_pic } = await uploadProfilePicViaApi(u.roll_no, file);
          avatarEl.innerHTML = `<img src="${escapeHtml(profile_pic)}" alt="${escapeHtml(u.first_name)}">`;
          load(); // refresh the table row behind the modal too
        } catch (err) {
          errBox.textContent = err.message || 'Could not upload the photo.';
        } finally {
          input.value = '';
          chooseBtn.disabled = false;
          chooseBtn.textContent = originalLabel;
        }
      }
    }

    function openEditModal(id) {
      const u = currentRows.find(r => r._id === id);
      if (!u) return;
      openModal(`
        <h3>Edit account — ${escapeHtml(u.roll_no)}</h3>
        <form id="editUserForm">
          <div class="field"><label>Full name</label><input required name="first_name" value="${escapeHtml(u.first_name)}" /></div>
          <div class="field">
            <label>Gender</label>
            <select name="gender">
              <option value="" ${!u.gender ? 'selected' : ''}>Not set</option>
              <option value="Male" ${u.gender === 'Male' ? 'selected' : ''}>Male</option>
              <option value="Female" ${u.gender === 'Female' ? 'selected' : ''}>Female</option>
              <option value="Other" ${u.gender === 'Other' ? 'selected' : ''}>Other</option>
            </select>
          </div>
          <div class="field"><label>Designation</label><input name="designation" value="${escapeHtml(u.designation)}" /></div>
          <div class="field"><label>Mobile</label><input required name="mobile" type="tel" inputmode="numeric" maxlength="10" value="${escapeHtml(u.mobile)}" /></div>
          <div class="field">
            <label>Role</label>
            <select name="role">
              <option value="security" ${u.role === 'security' ? 'selected' : ''}>Security Guard</option>
              <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
            </select>
          </div>
          <div class="field"><label>New password (leave blank to keep current)</label><input type="text" name="password" /></div>
          <div class="error-text" id="editUserError"></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" id="cancelEditBtn">Cancel</button>
            <button type="submit" class="btn btn-primary" style="width:auto; padding:10px 20px;">Save Changes</button>
          </div>
        </form>
      `);
      document.getElementById('cancelEditBtn').addEventListener('click', closeModal);
      document.getElementById('editUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const payload = {
          first_name: f.get('first_name'),
          gender: f.get('gender') || '',
          designation: f.get('designation'),
          mobile: f.get('mobile'),
          role: f.get('role'),
        };
        const pwd = f.get('password');
        if (pwd && pwd.trim()) payload.password = pwd.trim();

        const editErr = document.getElementById('editUserError');
        editErr.textContent = '';
        if (!payload.first_name.trim()) { editErr.textContent = 'Full name is required.'; return; }
        if (!/^[6-9]\d{9}$/.test((payload.mobile || '').trim())) { editErr.textContent = 'Mobile must be a 10-digit number starting with 6, 7, 8 or 9.'; return; }
        if (!(payload.designation || '').trim()) { editErr.textContent = 'Designation is required.'; return; }
        if (payload.password && !/^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9\s])\S{7,64}$/.test(payload.password)) {
          editErr.textContent = 'Password needs 7+ characters with an uppercase letter, a number and a special character.'; return;
        }

        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        try {
          await updateUserViaApi(id, payload);
          // Editing your own account: keep the copy saved at login in step,
          // so your own Profile tab shows the new gender.
          if (u.roll_no === user.roll_no) {
            user.gender = payload.gender;
            setCurrentUser(user);
          }
          closeModal();
          load();
        } catch (err) {
          document.getElementById('editUserError').textContent = err.message;
          submitBtn.disabled = false;
        }
      });
    }

    let searchTimer;
    document.getElementById('securitySearchInput').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.search = e.target.value.trim();
        state.page = 1;
        load();
      }, 300);
    });

    document.getElementById('securityPageSizeSelect').addEventListener('change', (e) => {
      state.limit = parseInt(e.target.value, 10) || 10;
      state.page = 1;
      load();
    });

    document.getElementById('securityPrevBtn').addEventListener('click', () => {
      if (state.page > 1) { state.page -= 1; load(); }
    });
    document.getElementById('securityNextBtn').addEventListener('click', () => {
      state.page += 1;
      load();
    });

    document.getElementById('downloadSecurityBtn').addEventListener('click', async () => {
      const btn = document.getElementById('downloadSecurityBtn');
      const originalLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Preparing...';
      try {
        const res = await fetchUsersViaApi({ search: state.search, page: 1, limit: 10000 });
        const rows = res.data.map((u, i) => ({
          '#': i + 1,
          'Name': u.first_name,
          'Roll No': u.roll_no,
          'Role': u.role,
          'Gender': u.gender || '',
          'Mobile': u.mobile,
          'Designation': u.designation,
          'Status': u.blocked ? 'Blocked' : 'Active',
          'Added On': formatDateTime(u.createdAt),
        }));
        exportRowsToExcel(rows, { filename: `security_data_${Date.now()}.xlsx`, sheetName: 'Security Data' });
      } catch (err) {
        alert('Could not export: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = originalLabel;
      }
    });

    document.getElementById('downloadSecurityPdfBtn').addEventListener('click', async () => {
      const btn = document.getElementById('downloadSecurityPdfBtn');
      const originalLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Preparing...';
      try {
        const res = await fetchUsersViaApi({ search: state.search, page: 1, limit: 10000 });
        await exportSecurityDataToPdf(res.data, { filename: `security_data_${Date.now()}.pdf` });
      } catch (err) {
        alert('Could not export: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = originalLabel;
      }
    });

    load();
  }

  if (section === 'addDutyPlaces') {
    // ---------- Tab switching ----------
    const tabNames = ['newPlace', 'existingPlaces', 'generateQr'];
    document.querySelectorAll('#dutyPlaceTabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#dutyPlaceTabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        tabNames.forEach(t => {
          document.getElementById('tab-' + t).style.display = (t === btn.dataset.tab) ? 'block' : 'none';
        });
        if (btn.dataset.tab === 'existingPlaces') loadExistingPlaces();
        if (btn.dataset.tab === 'generateQr') loadQrPlaceOptions();
      });
    });

    // ---------- Tab 1: Add Duty Place ----------
    const nameInput = document.getElementById('dutyPlaceNameInput');
    const saveBtn = document.getElementById('saveDutyPlaceBtn');

    async function saveDutyPlace() {
      const errBox = document.getElementById('newPlaceError');
      errBox.textContent = '';
      const name = nameInput.value.trim();
      if (!name) { errBox.textContent = 'Enter a duty place.'; return; }

      saveBtn.disabled = true;
      try {
        await addDutyPlaceViaApi({ place: name });
        nameInput.value = '';
        alert(`Duty place "${name}" added.`);
      } catch (err) {
        errBox.textContent = err.message;
      } finally {
        saveBtn.disabled = false;
      }
    }
    saveBtn.addEventListener('click', saveDutyPlace);
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); saveDutyPlace(); }
    });

    // ---------- Tab 2: Existing Duty Places ----------
    const state = { search: '', page: 1, limit: 10 };
    let currentPlaces = [];

    function renderPlacesTable(res) {
      currentPlaces = res.data;
      const wrap = document.getElementById('dutyPlacesTableWrap');
      if (!res.data.length) {
        wrap.innerHTML = `<p style="color:var(--ink-500); font-size:13px;">${state.search ? 'No matching duty places found.' : 'No duty places yet. Add one from the "Add Duty Place" tab.'}</p>`;
      } else {
        const startSerial = (res.page - 1) * res.limit;
        wrap.innerHTML = `
          <div class="table-scroll">
            <table>
              <thead><tr><th>#</th><th>Duty Place</th><th>Added On</th><th></th></tr></thead>
              <tbody>
                ${res.data.map((p, i) => `
                  <tr data-id="${p._id}">
                    <td class="serial-col">${startSerial + i + 1}</td>
                    <td><b class="preserve-space">${escapeHtml(p.place)}</b></td>
                    <td style="white-space:nowrap; color:var(--ink-300); font-size:12.5px;">${formatDateTime(p.createdAt)}</td>
                    <td>
                      <div class="row-actions">
                        <button class="edit-place-btn" data-id="${p._id}" title="Edit">✏️</button>
                        <button class="delete-place-btn" data-id="${p._id}" title="Delete">🗑</button>
                      </div>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`;
        wirePlaceRowActions();
      }
      const from = res.total === 0 ? 0 : (res.page - 1) * res.limit + 1;
      const to = Math.min(res.page * res.limit, res.total);
      document.getElementById('dutyPlacesPageInfo').textContent = `Showing ${from}-${to} of ${res.total}`;
      document.getElementById('dutyPlacesPrevBtn').disabled = res.page <= 1;
      document.getElementById('dutyPlacesNextBtn').disabled = res.page >= res.totalPages;
    }

    function loadExistingPlaces() {
      document.getElementById('dutyPlacesTableWrap').innerHTML = '<p style="color:var(--ink-500); font-size:13px;"><span class="spinner" role="status" aria-label="Loading"></span><span class="loader-text">Loading...</span></p>';
      fetchDutyPlacesViaApi({ search: state.search, page: state.page, limit: state.limit })
        .then(renderPlacesTable)
        .catch(err => {
          document.getElementById('dutyPlacesTableWrap').innerHTML = `<p style="color:var(--danger); font-size:13px;">Could not load data: ${escapeHtml(err.message)}</p>`;
        });
    }

    function wirePlaceRowActions() {
      document.querySelectorAll('.edit-place-btn').forEach(btn => {
        btn.addEventListener('click', () => openEditPlaceModal(btn.dataset.id));
      });
      document.querySelectorAll('.delete-place-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const p = currentPlaces.find(r => r._id === btn.dataset.id);
          if (!confirm(`Delete "${p ? p.place : 'this duty place'}"? This cannot be undone.`)) return;
          try {
            await deleteDutyPlaceViaApi(btn.dataset.id);
            loadExistingPlaces();
          } catch (err) {
            alert(err.message);
          }
        });
      });
    }

    function openEditPlaceModal(id) {
      const p = currentPlaces.find(r => r._id === id);
      if (!p) return;
      openModal(`
        <h3>Edit duty place</h3>
        <div class="field"><label>Duty place</label><input id="editPlaceNameInput" value="${escapeHtml(p.place)}" /></div>
        <div class="error-text" id="editPlaceError"></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" id="editCancelBtn">Cancel</button>
          <button type="button" class="btn btn-primary" id="editSaveBtn" style="width:auto; padding:10px 20px;">Save Changes</button>
        </div>
      `);
      document.getElementById('editCancelBtn').addEventListener('click', closeModal);
      document.getElementById('editSaveBtn').addEventListener('click', async () => {
        const errBox = document.getElementById('editPlaceError');
        const name = document.getElementById('editPlaceNameInput').value.trim();
        if (!name) { errBox.textContent = 'Duty place is required.'; return; }
        const btn = document.getElementById('editSaveBtn');
        btn.disabled = true;
        try {
          await updateDutyPlaceViaApi(id, { place: name });
          closeModal();
          loadExistingPlaces();
        } catch (err) {
          errBox.textContent = err.message;
          btn.disabled = false;
        }
      });
    }

    let dutyPlaceSearchTimer;
    document.getElementById('dutyPlaceSearchInput').addEventListener('input', (e) => {
      clearTimeout(dutyPlaceSearchTimer);
      dutyPlaceSearchTimer = setTimeout(() => {
        state.search = e.target.value.trim();
        state.page = 1;
        loadExistingPlaces();
      }, 300);
    });
    document.getElementById('dutyPlacePageSizeSelect').addEventListener('change', (e) => {
      state.limit = parseInt(e.target.value, 10) || 10;
      state.page = 1;
      loadExistingPlaces();
    });
    document.getElementById('dutyPlacesPrevBtn').addEventListener('click', () => { if (state.page > 1) { state.page -= 1; loadExistingPlaces(); } });
    document.getElementById('dutyPlacesNextBtn').addEventListener('click', () => { state.page += 1; loadExistingPlaces(); });

    document.getElementById('downloadDutyPlacesBtn').addEventListener('click', async () => {
      const btn = document.getElementById('downloadDutyPlacesBtn');
      const originalLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Preparing...';
      try {
        const res = await fetchDutyPlacesViaApi({ search: state.search, page: 1, limit: 10000 });
        const rows = res.data.map(p => ({ 'Duty Place': p.place, 'Added On': formatDateTime(p.createdAt) }));
        exportRowsToExcel(rows, { filename: `duty_places_${Date.now()}.xlsx`, sheetName: 'Duty Places' });
      } catch (err) {
        alert('Could not export: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = originalLabel;
      }
    });

    // ---------- Tab 3: Generate QR Code ----------
    let qrPlaceOptions = [];
    let currentQrDataUrl = null;
    let currentQrCaption = { place: '' };

    function resetQrPreview() {
      document.getElementById('qrPreviewCard').style.display = 'none';
      document.getElementById('qrPreviewWrap').innerHTML = '';
      document.getElementById('downloadQrPdfBtn').disabled = true;
      currentQrDataUrl = null;
    }

    async function loadQrPlaceOptions() {
      const select = document.getElementById('qrPlaceSelect');
      const previous = select.value;
      select.innerHTML = '<option value="">Loading...</option>';
      try {
        const res = await fetchDutyPlaceOptionsViaApi();
        qrPlaceOptions = res.data;
        select.innerHTML = '<option value="">Select a duty place</option>' +
          qrPlaceOptions.map(p => `<option value="${p._id}">${escapeHtml(p.place)}</option>`).join('');
        if (previous && qrPlaceOptions.some(p => p._id === previous)) {
          select.value = previous;
        } else {
          resetQrPreview();
        }
      } catch (err) {
        select.innerHTML = '<option value="">Could not load duty places</option>';
      }
    }

    document.getElementById('qrPlaceSelect').addEventListener('change', async (e) => {
      const errBox = document.getElementById('qrGenerateError');
      errBox.textContent = '';
      resetQrPreview();

      const place = qrPlaceOptions.find(p => p._id === e.target.value);
      if (!place) return;

      const previewCard = document.getElementById('qrPreviewCard');
      const previewWrap = document.getElementById('qrPreviewWrap');
      previewCard.style.display = 'block';
      previewWrap.innerHTML = '<p style="color:var(--ink-500); font-size:13px;">Generating...</p>';

      try {
        const logoImg = await loadImageAsync('images/logo.png');
        // The QR holds the raw duty place name exactly as stored (spaces
        // included) - the guard's scan is matched against that exact text.
        const canvas = generateQrCanvas(place.place, logoImg);
        const dataUrl = canvas.toDataURL('image/png');

        currentQrDataUrl = dataUrl;
        currentQrCaption = { place: place.place };

        previewWrap.innerHTML = `
          <div class="qr-frame"><img src="${dataUrl}" alt="QR code" style="display:block; width:220px; height:220px;" /></div>
          <div class="preserve-space" style="font-size:16px; font-weight:700;">${escapeHtml(place.place)}</div>
        `;
        document.getElementById('downloadQrPdfBtn').disabled = false;
      } catch (err) {
        errBox.textContent = err.message;
        previewCard.style.display = 'none';
      }
    });

    document.getElementById('downloadQrPdfBtn').addEventListener('click', () => {
      if (!currentQrDataUrl) return;
      const safeName = currentQrCaption.place.trim().replace(/[^\w\-]+/g, '_') || 'qr_code';
      exportQrCodeToPdf({
        dataUrl: currentQrDataUrl,
        caption: currentQrCaption.place,
        filename: `${safeName}.pdf`,
      });
    });
  }

  if (section === 'dutyStatus') {
    // ---------- Tab switching ----------
    const dsTabNames = ['assignDuty', 'showAssigned', 'scanTime'];
    document.querySelectorAll('#dutyStatusTabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#dutyStatusTabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        dsTabNames.forEach(t => {
          document.getElementById('tab-' + t).style.display = (t === btn.dataset.tab) ? 'block' : 'none';
        });
        if (btn.dataset.tab === 'showAssigned') loadAssignedDuties();
        if (btn.dataset.tab === 'scanTime') loadScanTime();
      });
    });

    // ======================================================================
    // Tab 3: Set Scan Time - a single global window (e.g. 18:00-06:00)
    // during which guards are allowed to submit QR scans. Only one window
    // is ever stored; saving overwrites whatever was there before.
    // ======================================================================
    // 12-hour + "AM"/"PM" (what the three dropdowns show) <-> 24-hour
    // "HH:mm" (what's stored and sent to the server).
    function to24Hour(hour12, minute, amPm) {
      let h = parseInt(hour12, 10) % 12;
      if (amPm === 'PM') h += 12;
      return `${String(h).padStart(2, '0')}:${minute}`;
    }
    function from24Hour(hhmm) {
      const [hStr, minute] = hhmm.split(':');
      let h = parseInt(hStr, 10);
      const amPm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return { hour: String(h), minute, amPm };
    }
    function setTimeFields(prefix, hour, minute, amPm) {
      document.getElementById(`scanTime${prefix}Hour`).value = hour;
      document.getElementById(`scanTime${prefix}Minute`).value = minute;
      document.getElementById(`scanTime${prefix}AmPm`).value = amPm;
    }
    function readTimeFields(prefix) {
      return to24Hour(
        document.getElementById(`scanTime${prefix}Hour`).value,
        document.getElementById(`scanTime${prefix}Minute`).value,
        document.getElementById(`scanTime${prefix}AmPm`).value
      );
    }
    function formatTime12(hhmm) {
      const { hour, minute, amPm } = from24Hour(hhmm);
      return `${hour}:${minute} ${amPm}`;
    }
    // The readable "Current window: ..." line above the dropdowns - kept in
    // sync both when the tab loads and right after a successful save, so
    // the admin can see what's actually saved without having to read six
    // dropdowns.
    function showCurrentWindow(from, to) {
      const el = document.getElementById('scanTimeCurrent');
      el.textContent = (from && to)
        ? `Current window: ${formatTime12(from)} – ${formatTime12(to)}`
        : 'No scan time window set yet.';
    }

    // Shows whatever window is already saved, so reopening this tab doesn't
    // look like it reset to blank defaults.
    async function loadScanTime() {
      const errBox = document.getElementById('scanTimeError');
      errBox.textContent = '';
      try {
        const { from, to } = await fetchScanTimeViaApi();
        showCurrentWindow(from, to);
        if (from) {
          const f = from24Hour(from);
          setTimeFields('From', f.hour, f.minute, f.amPm);
        }
        if (to) {
          const t = from24Hour(to);
          setTimeFields('To', t.hour, t.minute, t.amPm);
        }
      } catch (err) {
        document.getElementById('scanTimeCurrent').textContent = '';
        errBox.textContent = err.message || 'Could not load the saved scan time.';
      }
    }
    loadScanTime();

    document.getElementById('saveScanTimeBtn').addEventListener('click', async () => {
      const errBox = document.getElementById('scanTimeError');
      errBox.textContent = '';
      const btn = document.getElementById('saveScanTimeBtn');
      const from = readTimeFields('From');
      const to = readTimeFields('To');

      btn.disabled = true;
      const originalLabel = btn.textContent;
      btn.textContent = 'Saving...';
      try {
        await saveScanTimeViaApi(from, to);
        alert('Scan time window saved.');
      } catch (err) {
        errBox.textContent = err.message || 'Could not save the scan time window.';
      } finally {
        btn.disabled = false;
        btn.textContent = originalLabel;
      }
    });

    // ======================================================================
    // Tab 1: Assign Duty to Guard (drag main places + guards into a batch)
    // ======================================================================
    let placesData = [];
    let guardsData = [];
    let existingDutiesForDate = []; // already saved in the DB for the picked date
    // New, not yet submitted. One card per guard; a guard can hold many duty places.
    // { clientId, guardId, guardEmpId, guardName, dutyPlaces: [placeText, ...] }
    let pendingDuties = [];
    let clientIdCounter = 0;
    let placesFilter = '';
    let guardsFilter = '';

    // Never allow picking a duty date before today.
    document.getElementById('assignDutyDate').min = todayISODate();

    // Combines what's already saved for this date with what's being built
    // right now, so a guard/place can't be dragged in twice for the same day.
    function usedGuardEmpIds() {
      return new Set([
        ...pendingDuties.map(d => d.guardEmpId),
        ...existingDutiesForDate.map(d => d.guardEmpId),
      ]);
    }
    function usedPlaceKeys() {
      const keys = new Set();
      pendingDuties.forEach(d => d.dutyPlaces.forEach(p => keys.add(String(p).toLowerCase())));
      existingDutiesForDate.forEach(d => (d.dutyPlaces || []).forEach(p => keys.add(String(p).toLowerCase())));
      return keys;
    }

    function renderPlacesList() {
      const box = document.getElementById('assignPlacesList');
      if (!placesData.length) {
        box.innerHTML = '<p style="color:var(--ink-500); font-size:13px;">No duty places yet - add one from Duty Places.</p>';
        return;
      }
      const used = usedPlaceKeys();
      const filtered = placesData.filter(p => p.place.toLowerCase().includes(placesFilter.toLowerCase()));
      if (!filtered.length) {
        box.innerHTML = '<p style="color:var(--ink-500); font-size:13px;">No duty places match that search.</p>';
        return;
      }
      box.innerHTML = filtered.map((p, i) => {
        const isUsed = used.has(p.place.toLowerCase());
        return `
          <div class="assign-item${isUsed ? ' used' : ''}" draggable="${isUsed ? 'false' : 'true'}" data-place-id="${p._id}">
            <span class="idx">${i + 1}.</span> <span class="preserve-space">${escapeHtml(p.place)}</span>
            ${isUsed ? '<span style="margin-left:auto; font-size:10.5px; color:var(--ink-500);">assigned</span>' : ''}
          </div>`;
      }).join('');
    }

    function renderGuardsList() {
      const box = document.getElementById('assignGuardsList');
      if (!guardsData.length) {
        box.innerHTML = '<p style="color:var(--ink-500); font-size:13px;">No guards found - add one from Add Security.</p>';
        return;
      }
      const used = usedGuardEmpIds();
      const filtered = guardsData.filter(g =>
        g.first_name.toLowerCase().includes(guardsFilter.toLowerCase()) ||
        g.roll_no.toLowerCase().includes(guardsFilter.toLowerCase())
      );
      if (!filtered.length) {
        box.innerHTML = '<p style="color:var(--ink-500); font-size:13px;">No guards match that search.</p>';
        return;
      }
      box.innerHTML = filtered.map((g, i) => {
        const isUsed = used.has(g.roll_no);
        return `
          <div class="assign-item${isUsed ? ' used' : ''}" draggable="${isUsed ? 'false' : 'true'}" data-guard-id="${g._id}">
            <span class="idx">${i + 1}.</span> ${escapeHtml(g.first_name)} <span style="color:var(--ink-500);">(${escapeHtml(g.roll_no)})</span>
            ${isUsed ? '<span style="margin-left:auto; font-size:10.5px; color:var(--ink-500);">assigned</span>' : ''}
          </div>`;
      }).join('');
    }

    // Existing (locked) duties for the picked date are shown first, then new
    // pending ones, then a placeholder that's always visible so it's clear
    // there's room to drag in another guard.
    function renderDropZone() {
      const box = document.getElementById('assignDropZone');
      const existingHtml = existingDutiesForDate.map((d, i) => `
        <div class="duty-mini-card existing-duty">
          <div class="existing-badge"><span class="duty-no">${i + 1}</span>Already assigned</div>
          <div class="mini-place preserve-space">${escapeHtml(d.guardName)} (${escapeHtml(d.guardEmpId)})</div>
          <div>${(d.dutyPlaces || []).map(p => `<span class="chip preserve-space">${escapeHtml(p)}</span>`).join('')}</div>
        </div>`).join('');

      const pendingHtml = pendingDuties.map((d, i) => `
        <div class="duty-mini-card" data-client-id="${d.clientId}">
          <button type="button" class="remove-btn" data-client-id="${d.clientId}" title="Remove this duty">✕</button>
          <div class="existing-badge new-badge"><span class="duty-no">${existingDutiesForDate.length + i + 1}</span>New</div>
          <div class="mini-place preserve-space">${escapeHtml(d.guardName)} (${escapeHtml(d.guardEmpId)})</div>
          <div>${d.dutyPlaces.map((p, pi) => `<span class="chip preserve-space">${escapeHtml(p)} <button type="button" class="chip-remove" data-client-id="${d.clientId}" data-index="${pi}" title="Remove this place" style="background:none; border:0; cursor:pointer; padding:0 0 0 4px; color:inherit;">✕</button></span>`).join('')}</div>
          <div class="mini-guard-slot${d.dutyPlaces.length ? ' filled' : ''}" data-client-id="${d.clientId}">${d.dutyPlaces.length ? '+ Drop another duty place here' : 'Drop duty places here'}</div>
        </div>`).join('');

      const hasAny = existingDutiesForDate.length + pendingDuties.length > 0;
      const hintHtml = `<div class="assign-dropzone-hint">${hasAny ? '+ Drag a guard here to add another duty' : 'Drag a guard here to start'}</div>`;

      box.innerHTML = existingHtml + pendingHtml + hintHtml;
      // the batch changed - any earlier preview is now stale
      document.getElementById('assignPreviewWrap').innerHTML = '';
    }

    async function loadAssignBoard() {
      document.getElementById('assignPlacesList').innerHTML = '<p style="color:var(--ink-500); font-size:13px;">Loading...</p>';
      document.getElementById('assignGuardsList').innerHTML = '<p style="color:var(--ink-500); font-size:13px;">Loading...</p>';
      try {
        const [placesRes, guardsRes] = await Promise.all([
          fetchDutyPlaceOptionsViaApi(),
          fetchUsersViaApi({ role: 'security', limit: 1000 }),
        ]);
        placesData = placesRes.data;
        guardsData = guardsRes.data;
        renderPlacesList();
        renderGuardsList();
      } catch (err) {
        document.getElementById('assignPlacesList').innerHTML = `<p style="color:var(--danger); font-size:13px;">Could not load: ${escapeHtml(err.message)}</p>`;
        document.getElementById('assignGuardsList').innerHTML = '';
      }
    }

    async function ensureBoardDataLoaded() {
      if (!placesData.length && !guardsData.length) await loadAssignBoard();
    }

    // When a duty date is picked, look up what's already scheduled for that
    // day so it shows up locked in the Duty Assignments column, and so its
    // places/guards can't be dragged in again.
    async function loadExistingDutiesForDate(dateStr) {
      if (!dateStr) {
        existingDutiesForDate = [];
        renderDropZone();
        renderPlacesList();
        renderGuardsList();
        return;
      }
      try {
        const res = await fetchDutyAssignmentsViaApi({ date: dateStr, limit: 1000 });
        existingDutiesForDate = res.data;
      } catch (err) {
        existingDutiesForDate = [];
        alert(`Could not check existing duties for that date: ${err.message}`);
      }
      renderDropZone();
      renderPlacesList();
      renderGuardsList();
    }

    document.getElementById('assignDutyDate').addEventListener('change', (e) => {
      loadExistingDutiesForDate(e.target.value);
    });

    let placesSearchTimer;
    document.getElementById('assignPlacesSearch').addEventListener('input', (e) => {
      clearTimeout(placesSearchTimer);
      placesSearchTimer = setTimeout(() => { placesFilter = e.target.value.trim(); renderPlacesList(); }, 150);
    });
    let guardsSearchTimer;
    document.getElementById('assignGuardsSearch').addEventListener('input', (e) => {
      clearTimeout(guardsSearchTimer);
      guardsSearchTimer = setTimeout(() => { guardsFilter = e.target.value.trim(); renderGuardsList(); }, 150);
    });

    // A guard dropped into the column becomes a new duty card.
    function addGuardCard(guardId) {
      const guard = guardsData.find(g => g._id === guardId);
      if (!guard) return;
      if (pendingDuties.some(d => d.guardEmpId === guard.roll_no)) {
        alert(`${guard.first_name} already has a duty in this batch. Add more places to that card instead.`);
        return;
      }
      if (existingDutiesForDate.some(d => d.guardEmpId === guard.roll_no)) {
        alert(`${guard.first_name} already has a duty assigned for this date.`);
        return;
      }
      pendingDuties.push({
        clientId: 'd' + (++clientIdCounter),
        guardId: guard._id,
        guardEmpId: guard.roll_no,
        guardName: guard.first_name,
        dutyPlaces: [],
      });
      renderDropZone();
      renderGuardsList();
    }

    // A place dropped onto a guard card is added to that guard's list.
    function addPlaceToCard(placeId, clientId) {
      const place = placesData.find(p => p._id === placeId);
      const target = pendingDuties.find(d => d.clientId === clientId);
      if (!place || !target) return;
      if (usedPlaceKeys().has(place.place.toLowerCase())) {
        alert(`"${place.place}" is already assigned for this date.`);
        return;
      }
      target.dutyPlaces.push(place.place);
      renderDropZone();
      renderPlacesList();
    }

    const placesList = document.getElementById('assignPlacesList');
    const guardsList = document.getElementById('assignGuardsList');
    const dropZone = document.getElementById('assignDropZone');

    placesList.addEventListener('dragstart', (e) => {
      const item = e.target.closest('.assign-item[data-place-id]');
      if (!item || item.classList.contains('used')) { e.preventDefault(); return; }
      e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'place', id: item.dataset.placeId }));
      e.dataTransfer.effectAllowed = 'copy';
    });

    guardsList.addEventListener('dragstart', (e) => {
      const item = e.target.closest('.assign-item[data-guard-id]');
      if (!item || item.classList.contains('used')) { e.preventDefault(); return; }
      e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'guard', id: item.dataset.guardId }));
      e.dataTransfer.effectAllowed = 'copy';
    });

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
      const slot = e.target.closest('.mini-guard-slot');
      dropZone.querySelectorAll('.mini-guard-slot.drag-over').forEach(s => s.classList.remove('drag-over'));
      if (slot) slot.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', (e) => {
      if (e.target === dropZone) dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      dropZone.querySelectorAll('.mini-guard-slot.drag-over').forEach(s => s.classList.remove('drag-over'));

      let payload;
      try { payload = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (err) { return; }

      if (payload.type === 'guard') {
        addGuardCard(payload.id);
        return;
      }

      if (payload.type === 'place') {
        if (pendingDuties.length === 0) {
          alert('Drag a guard into the Duty Assignments column first, then drop duty places onto the guard\'s card.');
          return;
        }
        // Dropped on a specific card -> that card; anywhere else -> the latest card.
        const card = e.target.closest('.duty-mini-card[data-client-id]');
        const clientId = card ? card.dataset.clientId : pendingDuties[pendingDuties.length - 1].clientId;
        addPlaceToCard(payload.id, clientId);
      }
    });

    dropZone.addEventListener('click', (e) => {
      const chipBtn = e.target.closest('.chip-remove');
      if (chipBtn) {
        const duty = pendingDuties.find(d => d.clientId === chipBtn.dataset.clientId);
        if (duty) duty.dutyPlaces.splice(parseInt(chipBtn.dataset.index, 10), 1);
        renderDropZone();
        renderPlacesList();
        return;
      }
      const removeBtn = e.target.closest('.remove-btn');
      if (!removeBtn) return;
      pendingDuties = pendingDuties.filter(d => d.clientId !== removeBtn.dataset.clientId);
      renderDropZone();
      renderGuardsList();
      renderPlacesList();
    });

    // ---------- Preview -> confirm checkbox -> Submit ----------
    document.getElementById('previewAssignBtn').addEventListener('click', () => {
      const dutyDate = document.getElementById('assignDutyDate').value;

      if (!dutyDate) { alert('Pick a duty date first.'); return; }
      if (dutyDate < todayISODate()) { alert('Duty date cannot be in the past. Please choose today or a later date.'); return; }
      if (pendingDuties.length === 0 && existingDutiesForDate.length === 0) {
        alert('Drag at least one guard (and some duty places) into the Duty Assignments column first.');
        return;
      }
      const incomplete = pendingDuties.filter(d => d.dutyPlaces.length === 0);
      if (incomplete.length > 0) { alert(`${incomplete.length} guard card(s) still need at least one duty place dropped onto them before you can preview.`); return; }

      openModal(`
        <div>
          <div class="card-title" style="margin-bottom:10px;">Preview — ${pendingDuties.length} new duty assignment(s) for ${dutyDate}${existingDutiesForDate.length ? ` (${existingDutiesForDate.length} already assigned)` : ''}</div>
          <div class="table-scroll">
            <table>
              <thead><tr><th>#</th><th>Guard</th><th>Duty Places</th><th>Status</th></tr></thead>
              <tbody>
                ${existingDutiesForDate.map((d, i) => `
                  <tr>
                    <td class="serial-col">${i + 1}</td>
                    <td><b>${escapeHtml(d.guardName)}</b> <span style="color:var(--ink-500);">(${escapeHtml(d.guardEmpId)})</span></td>
                    <td>${(d.dutyPlaces || []).map(p => `<span class="chip preserve-space">${escapeHtml(p)}</span>`).join('')}</td>
                    <td><span class="badge badge-neutral">Already assigned</span></td>
                  </tr>`).join('')}
                ${pendingDuties.map((d, i) => `
                  <tr>
                    <td class="serial-col">${existingDutiesForDate.length + i + 1}</td>
                    <td><b>${escapeHtml(d.guardName)}</b> <span style="color:var(--ink-500);">(${escapeHtml(d.guardEmpId)})</span></td>
                    <td>${d.dutyPlaces.map(p => `<span class="chip preserve-space">${escapeHtml(p)}</span>`).join('')}</td>
                    <td><span class="badge badge-amber">New</span></td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          ${pendingDuties.length > 0 ? `
            <label style="display:flex; align-items:center; gap:8px; margin:16px 0; font-size:13px; cursor:pointer;">
              <input type="checkbox" id="confirmAssignCheck" />
              I've reviewed these duty assignments and confirm they are correct.
            </label>
            <div class="error-text" id="assignSubmitError"></div>
            <button class="btn btn-primary" id="submitAssignBtn" style="width:auto; padding:10px 22px;" disabled>Submit</button>
          ` : `
            <p style="color:var(--ink-500); font-size:13px; margin-top:16px;">No new duty assignments to submit - drag a guard into the Duty Assignments column and drop duty places onto the card to add one.</p>
          `}
          <div class="modal-actions" style="margin-top:14px;">
            <button type="button" class="btn btn-outline" id="closeAssignPreviewBtn">Close</button>
          </div>
        </div>`, { maxWidth: '900px' });
      document.getElementById('closeAssignPreviewBtn').addEventListener('click', closeModal);

      if (pendingDuties.length === 0) return;

      document.getElementById('confirmAssignCheck').addEventListener('change', (e) => {
        document.getElementById('submitAssignBtn').disabled = !e.target.checked;
      });

      document.getElementById('submitAssignBtn').addEventListener('click', async () => {
        const btn = document.getElementById('submitAssignBtn');
        const errBox = document.getElementById('assignSubmitError');
        errBox.textContent = '';
        btn.disabled = true;
        const originalLabel = btn.textContent;
        btn.textContent = 'Submitting...';
        try {
          const res = await bulkAssignDutiesViaApi({
            dutyDate,
            assignments: pendingDuties.map(d => ({
              guardEmpId: d.guardEmpId,
              guardName: d.guardName,
              dutyPlaces: d.dutyPlaces,
            })),
          });
          if (res.skippedCount > 0) {
            const reasons = res.results.filter(r => r.status === 'skipped').map(r => `${r.guardName || 'Row'}: ${r.reason}`).join('\n');
            alert(`${res.insertedCount} duty assignment(s) saved.\n${res.skippedCount} skipped:\n${reasons}`);
          } else {
            alert(`${res.insertedCount} duty assignment(s) saved.`);
          }
          pendingDuties = [];
          closeModal();
          await loadExistingDutiesForDate(dutyDate);
        } catch (err) {
          errBox.textContent = err.message;
          btn.disabled = false;
          btn.textContent = originalLabel;
        }
      });
    });

    loadAssignBoard();
    renderDropZone();

    // ======================================================================
    // Tab 2: Show Assigned Duties (list + edit + delete)
    // ======================================================================
    const assignedState = { search: '', date: todayISODate(), page: 1, limit: 10 };
    let currentAssignments = [];

    function renderAssignedTable(res) {
      currentAssignments = res.data;
      const wrap = document.getElementById('assignedTableWrap');
      if (!res.data.length) {
        wrap.innerHTML = `<p style="color:var(--ink-500); font-size:13px;">${assignedState.search || assignedState.date ? 'No matching duty assignments found.' : 'No duty assignments yet. Add one from the "Assign Duty to Guard" tab.'}</p>`;
      } else {
        const startSerial = (res.page - 1) * res.limit;
        wrap.innerHTML = `
          <div class="table-scroll">
            <table>
              <thead><tr><th>#</th><th>Guard</th><th>Duty Places</th><th>Duty Date</th><th>Status</th><th>Added On</th><th></th></tr></thead>
              <tbody>
                ${res.data.map((a, i) => {
                  const completed = isPastDutyDate(a.dutyDate);
                  return `
                  <tr data-id="${a._id}">
                    <td class="serial-col">${startSerial + i + 1}</td>
                    <td><b>${escapeHtml(a.guardName)}</b><br><span style="color:var(--ink-500); font-size:11.5px;">${escapeHtml(a.guardEmpId)}</span></td>
                    <td>${(a.dutyPlaces || []).map(p => `<span class="chip preserve-space">${escapeHtml(p)}</span>`).join('')}</td>
                    <td><span class="badge badge-amber">${escapeHtml(a.dateRange)}</span></td>
                    <td><span class="badge ${completed ? 'badge-neutral' : 'badge-success'}">${completed ? 'Completed' : 'Upcoming'}</span></td>
                    <td style="white-space:nowrap; color:var(--ink-300); font-size:12.5px;">${formatDateTime(a.createdAt)}</td>
                    <td>
                      <div class="row-actions">
                        <button class="edit-btn" data-id="${a._id}" title="${completed ? 'Completed duties cannot be edited' : 'Edit'}" ${completed ? 'disabled' : ''}>✏️</button>
                        <button class="delete-btn" data-id="${a._id}" title="${completed ? 'Completed duties cannot be deleted' : 'Delete'}" ${completed ? 'disabled' : ''}>🗑</button>
                      </div>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`;
        wireAssignedRowActions();
      }
      const from = res.total === 0 ? 0 : (res.page - 1) * res.limit + 1;
      const to = Math.min(res.page * res.limit, res.total);
      document.getElementById('assignedPageInfo').textContent = `Showing ${from}-${to} of ${res.total}`;
      document.getElementById('assignedPrevBtn').disabled = res.page <= 1;
      document.getElementById('assignedNextBtn').disabled = res.page >= res.totalPages;
    }

    function loadAssignedDuties() {
      document.getElementById('assignedTableWrap').innerHTML = '<p style="color:var(--ink-500); font-size:13px;"><span class="spinner" role="status" aria-label="Loading"></span><span class="loader-text">Loading...</span></p>';
      fetchDutyAssignmentsViaApi({ search: assignedState.search, date: assignedState.date, page: assignedState.page, limit: assignedState.limit })
        .then(renderAssignedTable)
        .catch(err => {
          document.getElementById('assignedTableWrap').innerHTML = `<p style="color:var(--danger); font-size:13px;">Could not load data: ${escapeHtml(err.message)}</p>`;
        });
    }

    function wireAssignedRowActions() {
      document.querySelectorAll('#tab-showAssigned .edit-btn:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => openEditAssignmentModal(btn.dataset.id));
      });
      document.querySelectorAll('#tab-showAssigned .delete-btn:not([disabled])').forEach(btn => {
        btn.addEventListener('click', async () => {
          const a = currentAssignments.find(r => r._id === btn.dataset.id);
          if (!confirm(`Remove ${a ? a.guardName : 'this guard'}'s duty${a && a.dutyPlaces ? ` at "${a.dutyPlaces.join(', ')}"` : ''}? This cannot be undone.`)) return;
          try {
            await deleteDutyAssignmentViaApi(btn.dataset.id);
            loadAssignedDuties();
          } catch (err) {
            alert(err.message);
          }
        });
      });
    }

    async function openEditAssignmentModal(id) {
      const a = currentAssignments.find(r => r._id === id);
      if (!a) return;
      await ensureBoardDataLoaded();

      // every existing duty place, plus any already on this duty that has since been renamed/removed
      const selectedKeys = new Set((a.dutyPlaces || []).map(p => String(p).toLowerCase()));
      const editPlaceOptions = placesData.map(p => p.place);
      (a.dutyPlaces || []).forEach(p => {
        if (!editPlaceOptions.some(o => o.toLowerCase() === String(p).toLowerCase())) editPlaceOptions.push(p);
      });

      const dutyDateVal = a.dutyDate ? new Date(a.dutyDate).toISOString().slice(0, 10) : '';

      openModal(`
        <h3>Edit duty assignment</h3>
        <div class="field">
          <label>Guard</label>
          <select id="editAssignGuard">
            <option value="">Select guard</option>
            ${guardsData.map(g => `<option value="${g._id}" data-emp-id="${escapeHtml(g.roll_no)}" data-name="${escapeHtml(g.first_name)}" ${g.roll_no === a.guardEmpId ? 'selected' : ''}>${escapeHtml(g.first_name)} (${escapeHtml(g.roll_no)})</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Duty places</label>
          <div id="editAssignPlaces" class="place-check-list">
            ${editPlaceOptions.map(pl => `
              <label class="place-check-row">
                <input type="checkbox" class="edit-place-check" value="${escapeHtml(pl)}" ${selectedKeys.has(pl.toLowerCase()) ? 'checked' : ''} />
                <span class="preserve-space">${escapeHtml(pl)}</span>
              </label>`).join('') || '<span style="color:var(--ink-500); font-size:12.5px;">No duty places available</span>'}
          </div>
        </div>
        <div class="field"><label>Duty date</label><input type="date" id="editAssignDate" value="${dutyDateVal}" min="${todayISODate()}" /></div>
        <div class="error-text" id="editAssignError"></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" id="editAssignCancelBtn">Cancel</button>
          <button type="button" class="btn btn-primary" id="editAssignSaveBtn" style="width:auto; padding:10px 20px;">Save Changes</button>
        </div>
      `);

      document.getElementById('editAssignCancelBtn').addEventListener('click', closeModal);
      document.getElementById('editAssignSaveBtn').addEventListener('click', async () => {
        const errBox = document.getElementById('editAssignError');
        errBox.textContent = '';

        const guardSelect = document.getElementById('editAssignGuard');
        const guardOpt = guardSelect.options[guardSelect.selectedIndex];
        const chosenPlaces = [...document.querySelectorAll('#editAssignPlaces .edit-place-check:checked')].map(c => c.value);
        const dutyDate = document.getElementById('editAssignDate').value;

        if (!guardSelect.value || chosenPlaces.length === 0 || !dutyDate) {
          errBox.textContent = 'Guard, at least one duty place, and duty date are all required.';
          return;
        }
        if (dutyDate < todayISODate()) {
          errBox.textContent = 'Duty date cannot be moved into the past. Choose today or a later date.';
          return;
        }

        const btn = document.getElementById('editAssignSaveBtn');
        btn.disabled = true;
        try {
          await updateDutyAssignmentViaApi(id, {
            guardEmpId: guardOpt.dataset.empId,
            guardName: guardOpt.dataset.name,
            dutyPlaces: chosenPlaces,
            dutyDate,
          });
          closeModal();
          loadAssignedDuties();
        } catch (err) {
          errBox.textContent = err.message;
          btn.disabled = false;
        }
      });
    }

    let assignedSearchTimer;
    document.getElementById('assignedSearchInput').addEventListener('input', (e) => {
      clearTimeout(assignedSearchTimer);
      assignedSearchTimer = setTimeout(() => {
        assignedState.search = e.target.value.trim();
        assignedState.page = 1;
        loadAssignedDuties();
      }, 300);
    });
    document.getElementById('assignedDateFilter').addEventListener('change', (e) => {
      assignedState.date = e.target.value;
      assignedState.page = 1;
      loadAssignedDuties();
    });
    document.getElementById('assignedPageSizeSelect').addEventListener('change', (e) => {
      assignedState.limit = parseInt(e.target.value, 10) || 10;
      assignedState.page = 1;
      loadAssignedDuties();
    });
    document.getElementById('assignedPrevBtn').addEventListener('click', () => { if (assignedState.page > 1) { assignedState.page -= 1; loadAssignedDuties(); } });
    document.getElementById('assignedNextBtn').addEventListener('click', () => { assignedState.page += 1; loadAssignedDuties(); });

    document.getElementById('downloadAssignedPdfBtn').addEventListener('click', async () => {
      const btn = document.getElementById('downloadAssignedPdfBtn');
      const originalLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Preparing...';
      try {
        const res = await fetchDutyAssignmentsViaApi({ search: assignedState.search, date: assignedState.date, page: 1, limit: 10000 });
        const rows = res.data.map((a, i) => ({
          serial: i + 1,
          guard: `${a.guardName} (${a.guardEmpId})`,
          dutyPlaces: (a.dutyPlaces || []).join(', '),
          dateRange: a.dateRange,
          status: isPastDutyDate(a.dutyDate) ? 'Completed' : 'Upcoming',
          addedOn: formatDateTime(a.createdAt),
        }));
        exportRowsToPdf(
          [
            { header: '#', key: 'serial' },
            { header: 'Guard', key: 'guard' },
            { header: 'Duty Places', key: 'dutyPlaces' },
            { header: 'Duty Date', key: 'dateRange' },
            { header: 'Status', key: 'status' },
            { header: 'Added On', key: 'addedOn' },
          ],
          rows,
          { filename: `assigned_duties_${Date.now()}.pdf`, title: 'Assigned Duties' }
        );
      } catch (err) {
        alert('Could not export: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = originalLabel;
      }
    });
  }

  if (section === 'changePassword') {
    attachChangePasswordHandlers(user);
  }

  if (section === 'profile') {
    // ======================================================================
    // Profile tab (change photo) - jpg/png only, max 2 MB, and must actually decode
    // as an image (same defense-in-depth pattern as the Images tab); the
    // server (routes/users.js, POST /by-roll/:roll_no/profile-pic) re-checks
    // type/size and the real file signature independently.
    // ======================================================================
    const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png'];
    const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png'];
    const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2 MB

    const picInput = document.getElementById('profilePicInput');
    const changeBtn = document.getElementById('changePhotoBtn');
    const errBox = document.getElementById('profilePicError');
    const avatarEl = document.getElementById('profileAvatar');
    fillAvatar(avatarEl); // show the existing photo (if any) instead of just the initial

    function formatKB(bytes) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    changeBtn.addEventListener('click', () => picInput.click());

    picInput.addEventListener('change', () => {
      errBox.textContent = '';
      const file = picInput.files && picInput.files[0];
      if (!file) return;

      const ext = (file.name.split('.').pop() || '').toLowerCase();
      const isAllowedType = ALLOWED_IMAGE_TYPES.includes(file.type) || ALLOWED_IMAGE_EXTENSIONS.includes(ext);
      if (!isAllowedType) {
        errBox.textContent = 'Only JPG, JPEG or PNG images are allowed.';
        picInput.value = '';
        return;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        errBox.textContent = `Image is too large (${formatKB(file.size)}). Maximum size is 2 MB.`;
        picInput.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        // Confirm the browser can actually decode this as an image before
        // uploading it - catches a corrupt file or a non-image renamed to
        // .jpg/.png.
        const probe = new Image();
        probe.onload = () => uploadProfilePic(file);
        probe.onerror = () => {
          errBox.textContent = 'This file is not a valid image. Please pick a different JPG or PNG.';
          picInput.value = '';
        };
        probe.src = reader.result;
      };
      reader.onerror = () => {
        errBox.textContent = 'Could not read the selected file. Please try again.';
        picInput.value = '';
      };
      reader.readAsDataURL(file);
    });

    async function uploadProfilePic(file) {
      errBox.textContent = '';
      changeBtn.disabled = true;
      const originalLabel = changeBtn.textContent;
      changeBtn.textContent = 'Uploading...';
      try {
        const { profile_pic } = await uploadProfilePicViaApi(user.roll_no, file);
        // Keep the in-memory user object, sessionStorage, and every avatar
        // spot on the page (topbar, sidebar, this tab) all in sync.
        user.profile_pic = profile_pic;
        setCurrentUser(user);
        fillAvatar(avatarEl);
        fillAvatar(document.getElementById('avatarInitial'));
        fillAvatar(document.getElementById('sidebarAvatar'));
      } catch (err) {
        errBox.textContent = err.message || 'Could not upload the photo.';
      } finally {
        picInput.value = '';
        changeBtn.disabled = false;
        changeBtn.textContent = originalLabel;
      }
    }
  }
}

// Before ANY page content is shown, confirm with the server that this
// account is still active and the stored password still matches the current
// one (e.g. it hasn't been changed from another browser/device). If not,
// verifySessionStillValid() has already cleared the session and sent the
// person back to the login page, so nothing else is rendered.
(async function bootstrap() {
  document.getElementById('content').innerHTML =
    '<p style="color:var(--ink-500); font-size:13px;">Checking your session…</p>';
  const stillValid = await verifySessionStillValid();
  if (!stillValid) return;
  render('home');
})();
