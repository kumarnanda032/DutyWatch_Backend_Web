/**
 * Contact Us page, shared by admin.html and user.html (admin and security
 * logins show the same directory). The entries come from the backend:
 * GET /api/contact-us  (see fetchContactsViaApi in api.js).
 *
 * Used by both dashboards like this:
 *   renderers.contact  -> contactSectionHtml()   (placeholder card)
 *   attachHandlers('contact') -> loadContactUs() (fetches and fills it in)
 */

const CONTACT_ICON_MAIL = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>';
const CONTACT_ICON_PHONE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8 9.9a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z"/></svg>';
const CONTACT_ICON_DEPT = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18M6 21V5a1 1 0 011-1h7a1 1 0 011 1v16M15 9h3a1 1 0 011 1v11M9 8h2M9 12h2M9 16h2"/></svg>';

// Contact data comes from the database - escape it before it goes into HTML.
function contactEsc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// "9000443261" -> label "+91 9000443261", link "tel:+919000443261".
// Anything that isn't a plain 10-digit number is shown exactly as stored.
function contactPhone(mobile) {
  const raw = String(mobile || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (/^\d{10}$/.test(digits)) return { label: '+91 ' + digits, href: 'tel:+91' + digits };
  return { label: raw, href: 'tel:' + raw.replace(/[^\d+]/g, '') };
}

function contactPersonHtml(c) {
  const roleLine = [c.designation, c.role].filter(Boolean).map(contactEsc).join(' | ');
  const phone = c.mobile ? contactPhone(c.mobile) : null;
  return `
      <p class="contact-name">${contactEsc(c.name)}</p>
      ${roleLine ? `<p class="contact-role">${roleLine}</p>` : ''}
      ${c.mail ? `<p class="contact-line">${CONTACT_ICON_MAIL}<a href="mailto:${contactEsc(c.mail)}">${contactEsc(c.mail)}</a></p>` : ''}
      ${phone ? `<p class="contact-line">${CONTACT_ICON_PHONE}<a href="${contactEsc(phone.href)}">${contactEsc(phone.label)}</a></p>` : ''}
      ${c.dept ? `<p class="contact-line">${CONTACT_ICON_DEPT}<span>${contactEsc(c.dept)}</span></p>` : ''}`;
}

// One card per department; the people in it are separated by a divider.
function contactGroupsHtml(contacts) {
  const groups = new Map();
  contacts.forEach(c => {
    const key = c.dept || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  });

  return Array.from(groups.entries()).map(([dept, people]) => `
    <div class="card contact-card">
      <h3 class="contact-title">Contact Us</h3>
      ${dept ? `<p class="contact-dept">${contactEsc(dept)}</p>` : ''}
      <div class="contact-divider"></div>
      ${people.map(contactPersonHtml).join('<div class="contact-divider"></div>')}
    </div>`).join('');
}

function contactNoticeHtml(message, withRetry) {
  return `
    <div class="card contact-card">
      <h3 class="contact-title">Contact Us</h3>
      <p class="contact-dept">${contactEsc(message)}</p>
      ${withRetry ? '<button class="btn btn-outline" id="retryContactBtn" type="button" style="width:auto; padding:8px 18px; margin-top:12px;">Retry</button>' : ''}
    </div>`;
}

function contactSectionHtml() {
  return `<div class="contact-list" id="contactList">${contactNoticeHtml('Loading contacts…', false)}</div>`;
}

async function loadContactUs() {
  if (!document.getElementById('contactList')) return;
  try {
    const res = await fetchContactsViaApi({ limit: 500 });
    const box = document.getElementById('contactList');
    if (!box) return; // the person has already moved to another page
    box.innerHTML = res.data.length
      ? contactGroupsHtml(res.data)
      : contactNoticeHtml('No contacts have been added yet.', false);
  } catch (err) {
    const box = document.getElementById('contactList');
    if (!box) return;
    box.innerHTML = contactNoticeHtml(err.message || 'Could not load contacts.', true);
    const retry = document.getElementById('retryContactBtn');
    if (retry) {
      retry.addEventListener('click', () => {
        box.innerHTML = contactNoticeHtml('Loading contacts…', false);
        loadContactUs();
      });
    }
  }
}
