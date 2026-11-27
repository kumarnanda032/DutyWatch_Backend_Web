/* =====================================================================
   Pages with tabs (Images, Security Data, Duty Places, Assign Duty,
   Personal Data): shows which action is open under the page title,
   e.g. "Upload Image" or "Existing Duty Places".

   On desktop the in-page tab strip is hidden (the header's hover menu
   replaces it), so nothing told the user which of the two they were on.
   This adds a small centered label that follows the real active tab.
   Nothing about the tabs themselves is changed.
   ===================================================================== */
(function () {
  'use strict';
  var content = document.getElementById('content');
  if (!content) return;

  function update() {
    var tabs = content.querySelector('.tabs[id$="Tabs"]');
    var head = content.querySelector('.section-head');
    var chip = content.querySelector('.tab-indicator');
    if (!tabs || !head) { if (chip) chip.remove(); return; }

    var active = tabs.querySelector('.tab-btn.active');
    if (!active) return;
    var label = (active.querySelector('span') || active).textContent.trim();
    var icon = active.querySelector('svg');

    if (!chip) {
      chip = document.createElement('div');
      chip.className = 'tab-indicator';
      chip.setAttribute('aria-live', 'polite');
      head.insertAdjacentElement('afterend', chip);
    }
    // only touch the class when it is missing: classList.add() rewrites the
    // attribute even when nothing changes, which would re-fire this observer forever
    if (!head.classList.contains('has-indicator')) head.classList.add('has-indicator');
    // line up with the page title (centered titles get a centered label)
    var centered = getComputedStyle(head).textAlign === 'center';
    if (chip.classList.contains('is-centered') !== centered) chip.classList.toggle('is-centered', centered);
    var key = active.getAttribute('data-tab') + '|' + label;
    if (chip.getAttribute('data-key') === key) return;
    chip.setAttribute('data-key', key);
    chip.innerHTML = '';
    if (icon) chip.appendChild(icon.cloneNode(true));
    var t = document.createElement('span');
    t.textContent = label;
    chip.appendChild(t);
  }

  new MutationObserver(update).observe(content, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['class']
  });
  update();
})();
