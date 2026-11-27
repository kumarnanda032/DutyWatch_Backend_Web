/* =====================================================================
   Admin Home: shows the date filter as "27-Nov-2026" inside a pill.

   The real <input type="date"> stays exactly as it was (same id, same
   events, same value). It is only moved inside the pill and made
   invisible on top of it, so clicking the pill still opens the browser's
   date picker and "change" still reloads the table.
   ===================================================================== */
(function () {
  'use strict';
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var CAL = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
            'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>';

  function fmt(v) {
    var p = (v || '').split('-');
    return p.length === 3 ? p[2] + '-' + MON[(+p[1]) - 1] + '-' + p[0] : '';
  }

  function enhance() {
    var inp = document.getElementById('recentScansDate');
    if (!inp || inp.closest('.date-pill')) return;
    var pill = document.createElement('div');
    pill.className = 'date-pill';
    inp.parentNode.insertBefore(pill, inp);
    var txt = document.createElement('span');
    txt.className = 'date-pill-text';
    pill.appendChild(txt);
    pill.insertAdjacentHTML('beforeend', CAL);
    pill.appendChild(inp);
    function sync() { txt.textContent = fmt(inp.value); }
    sync();
    inp.addEventListener('input', sync);
    inp.addEventListener('change', sync);
  }

  // ---- Day / Night control inside the Home toolbar -------------------------
  // The real #homeDutyToggle stays where it was (admin.js looks it up by id,
  // so it must stay attached). This is a mirror of it: pressing a button here
  // presses the real one, and its look follows the real one.
  function syncProxies() {
    var real = document.getElementById('homeDutyToggle');
    if (!real) return;
    var rb = real.querySelectorAll('.duty-toggle-btn');
    document.querySelectorAll('.duty-toggle-proxy').forEach(function (px) {
      px.querySelectorAll('.duty-toggle-btn').forEach(function (b, i) {
        if (!rb[i]) return;
        b.className = rb[i].className;
        b.setAttribute('aria-pressed', rb[i].getAttribute('aria-pressed') || 'false');
      });
    });
  }
  function ensureProxy() {
    var real = document.getElementById('homeDutyToggle');
    var right = document.querySelector('#content .data-toolbar .toolbar-right');
    // Day/Night duty only applies to the Home scans table, not other pages
    // (Security Data, Duty Places, ...), so it is added on Home only.
    var onHome = !!document.querySelector('.nav-link.active[data-section="home"]');
    if (!onHome) {
      document.querySelectorAll('#content .duty-toggle-proxy').forEach(function (n) { n.remove(); });
      return;
    }
    if (!real || !right || right.querySelector('.duty-toggle-proxy')) return;
    var px = real.cloneNode(true);
    px.removeAttribute('id');
    px.removeAttribute('hidden');
    px.classList.add('duty-toggle-proxy');
    var rb = real.querySelectorAll('.duty-toggle-btn');
    px.querySelectorAll('.duty-toggle-btn').forEach(function (b, i) {
      b.addEventListener('click', function () { if (rb[i]) rb[i].click(); });
    });
    right.insertBefore(px, right.firstChild);
    syncProxies();
  }
  var realToggle = document.getElementById('homeDutyToggle');
  if (realToggle) {
    new MutationObserver(syncProxies).observe(realToggle, { attributes: true, subtree: true, attributeFilter: ['class', 'aria-pressed'] });
  }

  var content = document.getElementById('content');
  if (content) new MutationObserver(function () { enhance(); ensureProxy(); }).observe(content, { childList: true });
  enhance();
  ensureProxy();
})();
