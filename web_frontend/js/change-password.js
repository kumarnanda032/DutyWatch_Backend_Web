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
          <input id="cpCurrent" type="password" autocomplete="current-password" placeholder="Enter current password" />
        </div>
        <div class="field">
          <label for="cpNew">New Password</label>
          <input id="cpNew" type="password" autocomplete="new-password" placeholder="Enter new password" maxlength="64" />
        </div>
        <div class="field">
          <label for="cpConfirm">Confirm New Password</label>
          <input id="cpConfirm" type="password" autocomplete="new-password" placeholder="Re-enter new password" maxlength="64" />
        </div>

        <ul id="cpRules" style="list-style:none; padding:0; margin:0 0 12px; font-size:12.5px; color:var(--ink-500);">
          <li data-rule="len">More than 6 characters</li>
          <li data-rule="upper">Contains uppercase letter</li>
          <li data-rule="num">Contains a number</li>
          <li data-rule="special">Contains special character</li>
        </ul>

        <label style="display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--ink-500); margin-bottom:8px; cursor:pointer;">
          <input type="checkbox" id="cpShow" /> Show passwords
        </label>

        <div class="error-text" id="cpError"></div>
        <div class="fp-success-text" id="cpSuccess"></div>
        <button type="submit" class="btn btn-primary" id="cpSubmit" style="margin-top:8px;">Change Password</button>
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
      li.textContent = (ok ? '✓ ' : '• ') + li.textContent.replace(/^[✓•]\s*/, '');
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
    const label = btn.textContent;
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
      btn.textContent = label;
    }
  });
}
