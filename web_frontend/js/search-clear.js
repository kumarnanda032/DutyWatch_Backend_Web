/**
 * Adds a small "x" button inside every search box so the text can be cleared
 * in one tap. Works for boxes rendered later too (the pages build their
 * content with JavaScript), and fires a normal "input" event after clearing
 * so each page's existing search code reloads the unfiltered data.
 */
(function () {
  var SELECTOR = '.search-field input[type="text"], input.mini-search, input[type="search"]';

  function enhance(input) {
    if (input.dataset.clearable) return;
    input.dataset.clearable = '1';

    var wrap = document.createElement('span');
    wrap.className = 'clear-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'clear-btn';
    btn.setAttribute('aria-label', 'Clear search');
    btn.title = 'Clear';
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    wrap.appendChild(btn);

    function sync() { wrap.classList.toggle('has-value', input.value.length > 0); }

    input.addEventListener('input', sync);
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); }); // keep focus in the box
    btn.addEventListener('click', function () {
      input.value = '';
      sync();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    });
    sync();
  }

  function scan() { document.querySelectorAll(SELECTOR).forEach(enhance); }

  var queued = false;
  function queue() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; scan(); });
  }

  function start() {
    scan();
    new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
