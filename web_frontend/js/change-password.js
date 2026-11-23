/**
 * "Change Password" tab, shared by the admin panel (admin.js) and the
 * security-guard panel (user.js) - both include this file after data.js and
 * api.js. Calls POST /api/auth/change-password via changePasswordViaApi().
 *
 *   changePasswordSectionHtml(sectionHead)  -> HTML string for the tab
 *   attachChangePasswordHandlers(user)      -> wires up the form (call after the HTML is in the page)
 *
 * The rules below mirror the server's (routes/auth.js) so the person gets
 * instant feedback; the server re-checks everything independently.
 */

function changePasswordSectionHtml(sectionHead) {
  return `
    ${sectionHead('Change Password', 'Update the password you use to log in.')}
    <div class="card" style="max-width:420px;">
      <form id="cpForm" novalidate autocomplete="off">
        <div class="field">
          <label for="cpCurrent">Current Password</label>
          <div class="input-icon"><svg class="field-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg><input id="cpCurrent" type="password" autocomplete="current-password" placeholder="Enter current password" /></div>
        </div>
        <div class="field">
          <label for="cpNew">New Password</label>
          <div class="input-icon"><svg class="field-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/><circle cx="12" cy="16" r="1"/></svg><input id="cpNew" type="password" autocomplete="new-password" placeholder="Enter new password" maxlength="64" /></div>
        </div>
        <div class="field">
          <label for="cpConfirm">Confirm New Password</label>
          <div class="input-icon"><svg class="field-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg><input id="cpConfirm" type="password" autocomplete="new-password" placeholder="Re-enter new password" maxlength="64" /></div>
        </div>

        <ul id="cpRules" class="cp-rules" style="list-style:none; padding:0; margin:0 0 12px; font-size:12.5px; color:var(--ink-500);">
          <li data-rule="len"><svg class="rule-ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/></svg><span>More than 6 characters</span></li>
          <li data-rule="upper"><svg class="rule-ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/></svg><span>Contains uppercase letter</span></li>
          <li data-rule="num"><svg class="rule-ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/></svg><span>Contains a number</span></li>
          <li data-rule="special"><svg class="rule-ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/></svg><span>Contains special character</span></li>
        </ul>

        <label style="display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--ink-500); margin-bottom:8px; cursor:pointer;">
          <input type="checkbox" id="cpShow" /> <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg><span>Show passwords</span>
        </label>

        <div class="error-text" id="cpError"></div>
        <div class="fp-success-text" id="cpSuccess"></div>
        <button type="submit" class="btn btn-primary btn-with-icon" id="cpSubmit" style="margin-top:8px; width:100%; justify-content:center;"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3M16 7l3 3M14 9l2 2"/></svg><span>Change Password</span></button>
      </form>
    </div>
  `;
}

// Blocking "success" popup. It has no close-by-clicking-outside: the only way
// forward is OK (or Enter), which clears the session and goes to the login page.
function showPasswordChangedPopup(message) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';
  overlay.style.zIndex = '10000';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:380px; text-align:center;">
      <div style="width:54px; height:54px; border-radius:50%; background:rgba(76,175,109,0.15); color:#3fbf6f; font-size:30px; line-height:54px; margin:0 auto 14px;">✓</div>
      <h3 style="margin-bottom:8px;">Password Changed</h3>
      <p style="color:var(--ink-500); font-size:13.5px; margin-bottom:18px;">${message || 'Password changed successfully.'}<br>Please log in again with your new password.</p>
      <button type="button" class="btn btn-primary" id="cpPopupOk">OK</button>
    </div>`;
  document.body.appendChild(overlay);

  const ok = document.getElementById('cpPopupOk');
  ok.focus();
  ok.addEventListener('click', () => logout());
}

function attachChangePasswordHandlers(user) {
  const form = document.getElementById('cpForm');
  if (!form) return;
  const cur = document.getElementById('cpCurrent');
  const nw = document.getElementById('cpNew');
  const conf = document.getElementById('cpConfirm');
  const errBox = document.getElementById('cpError');
  const okBox = document.getElementById('cpSuccess');
  const btn = document.getElementById('cpSubmit');

  const rules = {
    len: (p) => p.length > 6,
    upper: (p) => /[A-Z]/.test(p),
    num: (p) => /[0-9]/.test(p),
    special: (p) => /[^A-Za-z0-9\s]/.test(p),
  };

  function paintRules() {
    document.querySelectorAll('#cpRules li').forEach((li) => {
      const ok = rules[li.dataset.rule](nw.value);
      li.style.color = ok ? '#3fbf6f' : '';
      const ic = li.querySelector('.rule-ic');
      if (ic) {
        ic.innerHTML = ok
          ? '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>'
          : '<circle cx="12" cy="12" r="9"/>';
      }
    });
  }
  nw.addEventListener('input', paintRules);
  paintRules();

  document.getElementById('cpShow').addEventListener('change', (e) => {
    const type = e.target.checked ? 'text' : 'password';
    [cur, nw, conf].forEach((i) => { i.type = type; });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.textContent = '';
    okBox.textContent = '';

    if (!cur.value || !nw.value || !conf.value) {
      errBox.textContent = 'Please fill in all three fields.';
      return;
    }
    if (nw.value.length > 64) {
      errBox.textContent = 'Password must be at most 64 characters.';
      return;
    }
    if (!Object.values(rules).every((fn) => fn(nw.value))) {
      errBox.textContent = 'Password must have more than 6 characters, an uppercase letter, a number and a special character.';
      return;
    }
    if (nw.value !== conf.value) {
      errBox.textContent = 'New password and confirm password do not match.';
      return;
    }
    if (nw.value === cur.value) {
      errBox.textContent = 'New password must be different from the current password.';
      return;
    }

    btn.disabled = true;
    const label = btn.innerHTML;
    btn.textContent = 'Saving...';
    try {
      const res = await changePasswordViaApi(user.roll_no, cur.value, nw.value, conf.value);
      form.reset();
      paintRules();
      // The old password no longer works, so the session is ended and the
      // person logs in again with the new one (logout() is in data.js).
      showPasswordChangedPopup(res.message);
    } catch (err) {
      errBox.textContent = err.message || 'Could not change the password.';
    } finally {
      btn.disabled = false;
      btn.innerHTML = label;
    }
  });
}
