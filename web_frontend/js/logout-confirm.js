/**
 * Logout confirmation dialog (Yes / No), shared by the admin and security pages.
 * Usage: confirmLogout(logout)  - runs `logout` only if the person picks Yes.
 */
function confirmLogout(onYes) {
  if (document.getElementById('logoutConfirm')) return;

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'logoutConfirm';
  overlay.style.display = 'flex';
  overlay.innerHTML =
    '<div class="modal-box logout-confirm" role="alertdialog" aria-modal="true" aria-labelledby="logoutConfirmTitle" aria-describedby="logoutConfirmMsg">' +
      '<div class="logout-confirm-icon">' +
        '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>' +
      '</div>' +
      '<h3 id="logoutConfirmTitle">Log out?</h3>' +
      '<p id="logoutConfirmMsg">Are you sure you want to log out? You will need to sign in again to continue.</p>' +
      '<div class="modal-actions logout-confirm-actions">' +
        '<button type="button" class="btn btn-outline" id="logoutNoBtn">No</button>' +
        '<button type="button" class="btn" id="logoutYesBtn">Yes, Log out</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  function close() {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  document.getElementById('logoutNoBtn').addEventListener('click', close);
  document.getElementById('logoutYesBtn').addEventListener('click', function () {
    close();
    onYes();
  });
  document.getElementById('logoutNoBtn').focus();
}
