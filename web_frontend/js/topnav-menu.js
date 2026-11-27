/* =====================================================================
   Top navigation: hover menu for each header item's tabs.

   Pointing at a header item (e.g. "Duty Places") opens a small menu with
   that page's tabs (Add Duty Place / Existing Duty Places / Generate QR
   Code). Choosing one opens that page and then presses the page's own tab
   button, so every existing tab behaviour runs exactly as before.
   The in-page tab strip is hidden on desktop (see topnav.css) and stays
   visible on phones, where there is no hover.
   ===================================================================== */
(function () {
  'use strict';

  var MENUS = {
 "admin": {
  "images": {
   "tabsId": "imagesTabs",
   "items": [
    {
     "tab": "uploadImage",
     "icon": "<svg class=\"tab-icon\" viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M12 16V4M7 9l5-5 5 5M5 20h14\"/></svg>",
     "label": "Upload Image"
    },
    {
     "tab": "getUploadImages",
     "icon": "<svg class=\"tab-icon\" viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><circle cx=\"9\" cy=\"10\" r=\"1.8\"/><path d=\"M21 16l-5-5-8 9\"/></svg>",
     "label": "Get Upload Images"
    }
   ]
  },
  "securityData": {
   "tabsId": "securityDataTabs",
   "items": [
    {
     "tab": "addSecurity",
     "icon": "<svg class=\"tab-icon\" viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/><path d=\"M19 8v6M16 11h6\"/></svg>",
     "label": "Add Security"
    },
    {
     "tab": "securityInfo",
     "icon": "<svg class=\"tab-icon\" viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3 6h18M7 12h10M10 18h4\"/></svg>",
     "label": "Security Information"
    }
   ]
  },
  "addDutyPlaces": {
   "tabsId": "dutyPlaceTabs",
   "items": [
    {
     "tab": "newPlace",
     "icon": "<svg class=\"tab-icon\" viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M12 21s-6-5.6-6-10.5a6 6 0 0112 0C18 15.4 12 21 12 21z\"/><circle cx=\"12\" cy=\"10.5\" r=\"2.2\"/></svg>",
     "label": "Add Duty Place"
    },
    {
     "tab": "existingPlaces",
     "icon": "<svg class=\"tab-icon\" viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01\"/></svg>",
     "label": "Existing Duty Places"
    },
    {
     "tab": "generateQr",
     "icon": "<svg class=\"tab-icon\" viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/><path d=\"M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3\"/></svg>",
     "label": "Generate QR Code"
    }
   ]
  },
  "dutyStatus": {
   "tabsId": "dutyStatusTabs",
   "items": [
    {
     "tab": "assignDuty",
     "icon": "<svg class=\"tab-icon\" viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"5\" y=\"4\" width=\"14\" height=\"17\" rx=\"2\"/><path d=\"M9 4h6v3H9z\"/><path d=\"M9 14l2 2 4-4\"/></svg>",
     "label": "Assign Duty to Guard"
    },
    {
     "tab": "showAssigned",
     "icon": "<svg class=\"tab-icon\" viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M9 6h11M9 12h11M9 18h11\"/><path d=\"M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2\"/></svg>",
     "label": "Show Assigned Duties"
    },
    {
     "tab": "scanTime",
     "icon": "<svg class=\"tab-icon\" viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/></svg>",
     "label": "Set Scan Time"
    }
   ]
  },
  "account": {
   "tabsId": "accountTabs",
   "items": [
    {
     "tab": "accProfile",
     "icon": "<svg class=\"tab-icon\" viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2\"/><circle cx=\"12\" cy=\"7\" r=\"4\"/></svg>",
     "label": "Profile"
    },
    {
     "tab": "accPassword",
     "icon": "<svg class=\"tab-icon\" viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"8\" cy=\"15\" r=\"4\"/><path d=\"M10.8 12.2L20 3M16 7l3 3M14 9l2 2\"/></svg>",
     "label": "Change Password"
    }
   ]
  }
 },
 "user": {
  "images": {
   "tabsId": "imagesTabs",
   "items": [
    {
     "tab": "uploadImage",
     "icon": "<svg class=\"tab-icon\" viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M12 16V4M7 9l5-5 5 5M5 20h14\"/></svg>",
     "label": "Upload Images"
    },
    {
     "tab": "getImages",
     "icon": "<svg class=\"tab-icon\" viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><circle cx=\"9\" cy=\"10\" r=\"1.8\"/><path d=\"M21 16l-5-5-8 9\"/></svg>",
     "label": "Get Images"
    }
   ]
  },
  "account": {
   "tabsId": "accountTabs",
   "items": [
    {
     "tab": "accProfile",
     "icon": "<svg class=\"tab-icon\" viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2\"/><circle cx=\"12\" cy=\"7\" r=\"4\"/></svg>",
     "label": "Profile"
    },
    {
     "tab": "accPassword",
     "icon": "<svg class=\"tab-icon\" viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"4\" y=\"11\" width=\"16\" height=\"10\" rx=\"2\"/><path d=\"M8 11V7a4 4 0 018 0v4\"/></svg>",
     "label": "Change Password"
    }
   ]
  }
 }
};

  var isAdmin = !!document.querySelector('.nav-link[data-section="securityData"]');
  var map = isAdmin ? MENUS.admin : MENUS.user;
  var desktop = function () { return window.matchMedia('(min-width: 901px)').matches; };

  var panel = document.createElement('div');
  panel.className = 'tabmenu';
  panel.setAttribute('role', 'menu');
  panel.hidden = true;
  document.body.appendChild(panel);

  var openFor = null;   // the nav link whose menu is showing
  var closeTimer = null;

  function currentActiveTab(cfg) {
    var el = document.querySelector('#' + cfg.tabsId + ' .tab-btn.active');
    return el ? el.getAttribute('data-tab') : null;
  }

  function show(link) {
    if (!desktop()) return;
    var section = link.getAttribute('data-section');
    var cfg = map[section];
    if (!cfg) return;
    clearTimeout(closeTimer);
    openFor = link;

    var onThisPage = link.classList.contains('active');
    var active = onThisPage ? currentActiveTab(cfg) : null;
    panel.innerHTML = '';
    cfg.items.forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tabmenu-item' + (it.tab === active ? ' is-active' : '');
      b.setAttribute('role', 'menuitem');
      b.setAttribute('data-section', section);
      b.setAttribute('data-tab', it.tab);
      b.innerHTML = it.icon + '<span>' + it.label + '</span>';
      panel.appendChild(b);
    });

    panel.hidden = false;
    var r = link.getBoundingClientRect();
    var w = panel.offsetWidth;
    var left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    panel.style.left = left + 'px';
    panel.style.top = (r.bottom + 8) + 'px';
    panel.classList.add('is-open');
  }

  function hide() {
    clearTimeout(closeTimer);
    openFor = null;
    panel.classList.remove('is-open');
    panel.hidden = true;
  }
  function hideSoon() {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(hide, 180);
  }

  // Mark items that have a menu (draws a small arrow) and wire hover.
  Object.keys(map).forEach(function (section) {
    var link = document.querySelector('.nav-link[data-section="' + section + '"]');
    if (!link) return;
    link.setAttribute('data-has-menu', '');
    link.setAttribute('aria-haspopup', 'menu');
    link.addEventListener('mouseenter', function () { show(link); });
    link.addEventListener('mouseleave', hideSoon);
  });
  // Items without tabs close any open menu as soon as they are pointed at.
  document.querySelectorAll('.nav-link[data-section]').forEach(function (link) {
    if (!map[link.getAttribute('data-section')]) link.addEventListener('mouseenter', hide);
  });

  panel.addEventListener('mouseenter', function () { clearTimeout(closeTimer); });
  panel.addEventListener('mouseleave', hideSoon);

  // Choosing a tab: open its page if needed, then press the real tab button.
  panel.addEventListener('click', function (e) {
    var item = e.target.closest('.tabmenu-item');
    if (!item) return;
    var section = item.getAttribute('data-section');
    var tab = item.getAttribute('data-tab');
    var cfg = map[section];
    var link = document.querySelector('.nav-link[data-section="' + section + '"]');
    hide();
    if (!cfg || !link) return;

    if (!link.classList.contains('active')) link.click();   // renders the page

    var tries = 0;
    (function pressTab() {
      var btn = document.querySelector('#' + cfg.tabsId + ' .tab-btn[data-tab="' + tab + '"]');
      if (btn) { btn.click(); return; }
      if (++tries < 20) requestAnimationFrame(pressTab);
    })();
  });

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
  document.addEventListener('click', function (e) {
    if (!panel.hidden && !e.target.closest('.tabmenu') && !e.target.closest('.nav-link[data-has-menu]')) hide();
  });
  window.addEventListener('resize', hide);
  document.getElementById('content').addEventListener('scroll', hide, { passive: true });
})();
