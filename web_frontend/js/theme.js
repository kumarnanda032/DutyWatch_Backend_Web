/**
 * Light / Dark mode for the admin and security panels.
 *
 * Loaded in <head> so the saved theme is applied before the page paints (no
 * flash of the wrong theme). When the page has a sidebar footer, a small
 * Light | Dark switch is added just above the Logout button.
 *
 * The choice is remembered in localStorage ("theme": "light" | "dark") and
 * defaults to dark, the original look. All colours come from CSS variables,
 * so switching only changes the data-theme attribute on <html>.
 */
(function () {
  var KEY = 'theme';

  function saved() {
    try {
      return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
    } catch (e) {
      return 'dark'; // storage blocked: fall back to the default look
    }
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  apply(saved());

  var SUN =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>';

  // Topbar toggle (admin page): one button that flips between Light and Dark.
  function buildTopbarToggle(btn) {
    function paint() {
      var dark = document.documentElement.getAttribute('data-theme') !== 'light';
      // Shows the mode you will switch TO.
      btn.innerHTML = (dark ? SUN : MOON) + '<span class="theme-toggle-text">' + (dark ? 'Light' : 'Dark') + '</span>';
      btn.setAttribute('aria-pressed', dark ? 'false' : 'true');
    }
    btn.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      apply(next);
      try { localStorage.setItem(KEY, next); } catch (err) { /* not remembered, still applied */ }
      paint();
    });
    paint();
  }

  function build() {
    var topBtn = document.getElementById('themeToggle');
    if (topBtn) { buildTopbarToggle(topBtn); return; }

    var footer = document.querySelector('.sidebar-footer');
    var logout = document.getElementById('logoutBtn');
    if (!footer || !logout || document.getElementById('themeSwitch')) return;

    var sun =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
    var moon =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>';

    var wrap = document.createElement('div');
    wrap.id = 'themeSwitch';
    wrap.className = 'theme-switch';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Colour theme');
    wrap.innerHTML =
      '<button type="button" data-theme-choice="light">' + sun + ' Light</button>' +
      '<button type="button" data-theme-choice="dark">' + moon + ' Dark</button>';
    footer.insertBefore(wrap, logout);

    function paint() {
      var current = document.documentElement.getAttribute('data-theme');
      wrap.querySelectorAll('button').forEach(function (b) {
        var on = b.getAttribute('data-theme-choice') === current;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    wrap.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-theme-choice]');
      if (!btn) return;
      var theme = btn.getAttribute('data-theme-choice');
      apply(theme);
      try { localStorage.setItem(KEY, theme); } catch (err) { /* not remembered, still applied */ }
      paint();
    });
    paint();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
