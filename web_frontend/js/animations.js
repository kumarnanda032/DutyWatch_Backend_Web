/* Presentation-only helpers for the UI animations (css/animations.css).
   Does not touch app data, API calls, or any existing element's content/handlers. */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var root = document.documentElement;

  document.addEventListener('DOMContentLoaded', function () {
    if (reduce) return;

    // Smooth colour transition when the light/dark toggle is clicked.
    document.addEventListener('click', function (e) {
      if (!e.target.closest || !e.target.closest('#themeToggle, #themeSwitch')) return;
      root.classList.add('theme-fade');
      setTimeout(function () { root.classList.remove('theme-fade'); }, 450);
    }, true);

    // Brief top progress bar when switching sidebar sections.
    var bar = document.createElement('div');
    bar.className = 'nav-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
    var t1, t2;
    document.addEventListener('click', function (e) {
      var link = e.target.closest && e.target.closest('.nav-link[data-section]');
      if (!link) return;
      clearTimeout(t1); clearTimeout(t2);
      bar.className = 'nav-progress';
      void bar.offsetWidth; // restart animation
      bar.className = 'nav-progress run';
      t1 = setTimeout(function () { bar.className = 'nav-progress done'; }, 520);
      t2 = setTimeout(function () { bar.className = 'nav-progress'; }, 900);
    }, true);
  });
})();
