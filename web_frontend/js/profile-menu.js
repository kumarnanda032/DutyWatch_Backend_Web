/* =====================================================================
   Admin header: hover menu on the user profile (top right).
   Pointing at the profile shows "Contact Us" and "Logout". Choosing one
   presses the real (hidden) nav item, so every existing behaviour -
   the Contact page, the logout confirmation - runs exactly as before.
   ===================================================================== */
(function () {
  'use strict';
  var brand = document.querySelector('.sidebar .brand');
  var contact = document.querySelector('.nav-link[data-section="contact"]');
  var logout = document.getElementById('logoutBtn');
  if (!brand || !contact || !logout) return;
  var desktop = function () { return window.matchMedia('(min-width: 901px)').matches; };

  var ICON = {
    contact: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8 9.9a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z"/></svg>',
    logout: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>'
  };

  var panel = document.createElement('div');
  panel.className = 'profilemenu';
  panel.setAttribute('role', 'menu');
  panel.hidden = true;
  panel.innerHTML =
    '<button type="button" class="profilemenu-item" role="menuitem" data-act="contact">' + ICON.contact + '<span>Contact Us</span></button>' +
    '<button type="button" class="profilemenu-item is-danger" role="menuitem" data-act="logout">' + ICON.logout + '<span>Logout</span></button>';
  document.body.appendChild(panel);

  var timer = null;
  function show() {
    if (!desktop()) return;
    clearTimeout(timer);
    panel.hidden = false;
    var r = brand.getBoundingClientRect();
    var w = panel.offsetWidth;
    panel.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + 'px';
    panel.style.top = (r.bottom + 6) + 'px';
    panel.classList.add('is-open');
    brand.setAttribute('aria-expanded', 'true');
  }
  function hide() {
    clearTimeout(timer);
    panel.classList.remove('is-open');
    panel.hidden = true;
    brand.setAttribute('aria-expanded', 'false');
  }
  function hideSoon() { clearTimeout(timer); timer = setTimeout(hide, 180); }

  brand.setAttribute('tabindex', '0');
  brand.setAttribute('aria-haspopup', 'menu');
  brand.setAttribute('aria-expanded', 'false');
  brand.addEventListener('mouseenter', show);
  brand.addEventListener('mouseleave', hideSoon);
  brand.addEventListener('focus', show);
  brand.addEventListener('click', function () { panel.hidden ? show() : hide(); });
  brand.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); var f = panel.querySelector('button'); if (f) f.focus(); }
  });
  panel.addEventListener('mouseenter', function () { clearTimeout(timer); });
  panel.addEventListener('mouseleave', hideSoon);

  panel.addEventListener('click', function (e) {
    var item = e.target.closest('.profilemenu-item');
    if (!item) return;
    var act = item.getAttribute('data-act');
    hide();
    (act === 'logout' ? logout : contact).click();   // real handlers run
  });

  // pointing at any other header item closes it
  document.querySelectorAll('.nav-link[data-section], .theme-toggle').forEach(function (el) {
    el.addEventListener('mouseenter', hide);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
  document.addEventListener('click', function (e) {
    if (!panel.hidden && !e.target.closest('.profilemenu') && !e.target.closest('.sidebar .brand')) hide();
  });
  window.addEventListener('resize', hide);
})();
