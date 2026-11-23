/**
 * Excel (.xlsx) export helper.
 *
 * Uses SheetJS (the `XLSX` global, loaded via CDN in admin.html) so no
 * bundler or backend dependency is needed - everything happens client-side
 * from data already fetched from the API.
 */

/**
 * @param {Array<Object>} rows    Plain objects; each key becomes a column header.
 * @param {Object} opts
 * @param {string} opts.filename  Download filename, e.g. "duty_places.xlsx".
 * @param {string} [opts.sheetName]
 */
function exportRowsToExcel(rows, { filename, sheetName = 'Sheet1' } = {}) {
  if (typeof XLSX === 'undefined') {
    alert('The Excel export library did not load. Check your internet connection and try again.');
    return;
  }
  if (!rows || !rows.length) {
    alert('Nothing to export.');
    return;
  }

  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  XLSX.writeFile(workbook, filename);
}

/**
 * PDF export helper.
 *
 * Uses jsPDF + the jspdf-autotable plugin (both the `jspdf` global, loaded
 * via CDN in admin.html) so no bundler or backend dependency is needed -
 * everything happens client-side from data already fetched from the API.
 *
 * @param {Array<Object>} columns  [{ header: 'Guard', key: 'guard' }, ...]
 * @param {Array<Object>} rows     Plain objects keyed to match `columns[].key`.
 * @param {Object} opts
 * @param {string} opts.filename   Download filename, e.g. "duties.pdf".
 * @param {string} [opts.title]    Optional heading printed above the table.
 */
async function exportRowsToPdf(columns, rows, { filename, title, header, columnStyles, didParseCell } = {}) {
  if (typeof jspdf === 'undefined' || !jspdf.jsPDF) {
    alert('The PDF export library did not load. Check your internet connection and try again.');
    return;
  }
  if (!rows || !rows.length) {
    alert('Nothing to export.');
    return;
  }

  const doc = new jspdf.jsPDF({ orientation: 'landscape', format: 'a4' });
  let startY = 10;
  if (header) {
    // Aditya University report header ({ title, subtitle, meta }) - see drawAusReportHeader
    startY = await drawAusReportHeader(doc, header);
  } else if (title) {
    doc.setFontSize(14);
    doc.text(title, 14, 15);
    startY = 22;
  }

  doc.autoTable({
    startY,
    theme: 'grid',
    head: [columns.map((c) => c.header)],
    body: rows.map((r) => columns.map((c) => (r[c.key] ?? ''))),
    styles: { fontSize: 8, lineWidth: 0.1, lineColor: [38, 56, 90], valign: 'middle' },
    headStyles: { fillColor: [18, 33, 58] },
    ...(columnStyles ? { columnStyles } : {}),
    ...(didParseCell ? { didParseCell } : {}),
  });

  doc.save(filename);
}

/**
 * Aditya University report header for jsPDF (logo on the left, report title on
 * the right, a rule, then a grid of "Label: value" summary items).
 *
 *   const startY = await drawAusReportHeader(doc, {
 *     title: 'Security Guard QR Scan Report',
 *     subtitle: ['Duty', 'Watch'],             // orange + blue words
 *     meta: [['Date', '2026-11-23'], ...],     // laid out 4 per row
 *   });
 *   doc.autoTable({ startY, ... });
 *
 * Returns the Y position (mm) where the table should start.
 */
async function drawAusReportHeader(doc, { title, subtitle = [], meta = [], logoUrl = 'images/aus_logo.png' } = {}) {
  const ORANGE = [244, 123, 32];
  const BLUE = [11, 79, 156];
  const NAVY = [15, 27, 46];
  const GREY = [75, 85, 99];
  const pageW = doc.internal.pageSize.getWidth();
  const left = 14;
  const right = pageW - 14;

  // Logo (900x117 source). If it fails to load, fall back to coloured text.
  const logoW = 78;
  const logoH = logoW * 117 / 900;
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('logo not found'));
      el.src = logoUrl;
    });
    doc.addImage(img, 'PNG', left, 9, logoW, logoH);
  } catch (err) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...ORANGE); doc.text('ADITYA', left, 18);
    doc.setTextColor(...BLUE); doc.text('UNIVERSITY', left + doc.getTextWidth('ADITYA ') + 2, 18);
  }

  // Title (right aligned)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...NAVY);
  doc.text(title || '', right, 15, { align: 'right' });

  // Coloured subtitle words, e.g. "Duty" (orange) + "Watch" (blue)
  if (subtitle.length) {
    doc.setFontSize(12);
    const gap = doc.getTextWidth(' ');
    const widths = subtitle.map((w) => doc.getTextWidth(w));
    let x = right - (widths.reduce((a, b) => a + b, 0) + gap * (subtitle.length - 1));
    subtitle.forEach((w, i) => {
      doc.setTextColor(...(i % 2 === 0 ? ORANGE : BLUE));
      doc.text(w, x, 22);
      x += widths[i] + gap;
    });
  }

  // Rule
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.7);
  doc.line(left, 26, right, 26);

  // Summary grid: 4 items per row
  const perRow = 4;
  const colW = (right - left) / perRow;
  let y = 33;
  meta.forEach(([label, value], i) => {
    const col = i % perRow;
    if (i > 0 && col === 0) y += 7;
    const x = left + col * colW;
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...GREY);
    const lbl = `${label}:`;
    doc.text(lbl, x, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...NAVY);
    doc.text(String(value ?? ''), x + doc.getTextWidth(lbl) + 3, y);
  });

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  return y + 6;
}

/**
 * Loads an image URL (e.g. a guard's profile_pic) and returns it as a square
 * JPEG data URL, cropped/centered like CSS "object-fit: cover" - so every
 * photo comes out the same shape for the PDF regardless of its original
 * aspect ratio. Resolves to null (never rejects) if the image can't be
 * loaded, so one broken photo doesn't stop the whole export.
 */
function loadSquareImageAsDataUrl(url, size = 128) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
        const w = img.naturalWidth * scale;
        const h = img.naturalHeight * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch (err) {
        resolve(null); // e.g. a CORS-tainted canvas
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Security Information (guard/admin accounts) as a PDF table with each
 * person's profile photo. Uses jsPDF + jspdf-autotable (loaded via CDN in
 * admin.html), same as exportRowsToPdf, but the Photo column is hand-drawn
 * in didDrawCell instead of printed as text - autoTable/jsPDF can only place
 * text or images that are already loaded, so every photo is fetched and
 * pre-converted to a data URL first.
 *
 * @param {Array<Object>} users  User docs from GET /api/users (must include
 *   _id, first_name, roll_no, role, gender, mobile, designation, blocked, createdAt,
 *   profile_pic).
 * @param {Object} opts
 * @param {string} opts.filename
 * @param {string} [opts.title]
 */
async function exportSecurityDataToPdf(users, { filename, title = 'Security Information Report', generatedBy = '', search = '' } = {}) {
  if (typeof jspdf === 'undefined' || !jspdf.jsPDF) {
    alert('The PDF export library did not load. Check your internet connection and try again.');
    return;
  }
  if (!users || !users.length) {
    alert('Nothing to export.');
    return;
  }

  // Fetch every photo in parallel up front - autoTable draws the whole table
  // synchronously, so nothing can be loaded lazily once drawing starts.
  const photos = await Promise.all(
    users.map((u) => (u.profile_pic ? loadSquareImageAsDataUrl(u.profile_pic) : Promise.resolve(null)))
  );

  const PHOTO_COLUMN = 1;
  const ROW_HEIGHT = 16; // mm - fixed so every photo has the same box to sit in

  const body = users.map((u, i) => [
    String(i + 1),
    // Photo is drawn manually in didDrawCell below. The user's index rides
    // along on the cell itself so didDrawCell never has to trust
    // data.row.index to find the right person.
    { content: '', userIndex: i },
    u.first_name,
    u.roll_no,
    u.role,
    u.gender || '-',
    u.mobile,
    u.designation,
    u.blocked ? 'Blocked' : 'Active',
    formatDateTime(u.createdAt),
  ]);

  const doc = new jspdf.jsPDF({ orientation: 'landscape' });

  const adminCount = users.filter((u) => u.role === 'admin').length;
  const guardCount = users.filter((u) => u.role === 'security').length;
  const blockedCount = users.filter((u) => u.blocked).length;
  const startY = await drawAusReportHeader(doc, {
    title,
    subtitle: ['Duty', 'Watch'],
    meta: [
      ['Total Accounts', users.length],
      ['Admins', adminCount],
      ['Generated On', formatDateTime(new Date().toISOString())],
      ['Generated By', generatedBy || '—'],
      ['Security Guards', guardCount],
      ['Active', users.length - blockedCount],
      ['Blocked', blockedCount],
      ['Search', search ? `"${search}"` : 'All accounts'],
    ],
  });

  doc.autoTable({
    startY,
    theme: 'grid',
    head: [['#', 'Photo', 'Name', 'Roll No', 'Role', 'Gender', 'Mobile', 'Designation', 'Status', 'Added On']],
    body,
    styles: { fontSize: 8, lineWidth: 0.1, minCellHeight: ROW_HEIGHT, valign: 'middle' },
    headStyles: { fillColor: [18, 33, 58] },
    columnStyles: { [PHOTO_COLUMN]: { cellWidth: ROW_HEIGHT } },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== PHOTO_COLUMN) return;
      const userIndex = data.cell.raw && data.cell.raw.userIndex;
      const u = users[userIndex];
      if (!u) return; // nothing sensible to draw - skip rather than throw
      const dataUrl = photos[userIndex];
      const { x, y, width, height } = data.cell;
      const size = Math.min(width, height) - 3;
      const px = x + (width - size) / 2;
      const py = y + (height - size) / 2;

      if (dataUrl) {
        try {
          doc.addImage(dataUrl, 'JPEG', px, py, size, size);
          return;
        } catch (err) {
          // fall through to the initial-letter avatar below
        }
      }
      // No photo (or it failed to load) - the same amber circle + initial
      // the guard panel itself falls back to when profile_pic is empty.
      doc.setFillColor(232, 163, 61);
      doc.circle(px + size / 2, py + size / 2, size / 2, 'F');
      doc.setFontSize(10);
      doc.setTextColor(20, 20, 20);
      doc.text(u.first_name.charAt(0).toUpperCase(), px + size / 2, py + size / 2 + 1.3, { align: 'center' });
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
    },
  });

  doc.save(filename);
}
