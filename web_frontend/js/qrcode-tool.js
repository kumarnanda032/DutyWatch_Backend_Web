/**
 * QR code generation with a centered logo.
 *
 * Uses `qrcode-generator` (the `qrcode` global, loaded via CDN in
 * admin.html) purely for the raw module matrix - the QR is then drawn onto
 * a canvas we fully control, so a white backdrop + the Aditya University
 * logo can be composited cleanly into the center. Error correction is
 * fixed at level H (~30% redundancy), which is what keeps the code
 * scannable even with a logo covering the middle.
 *
 * Nothing here is persisted to the database - the QR's payload is derived
 * on the fly from the main place + sub place names, not a stored code.
 */

// Loads an <img> and resolves once it's ready to be drawn onto a canvas.
function loadImageAsync(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image: ${src}`));
    img.src = src;
  });
}

// qrcode-generator's own "auto type" mode (typeNumber 0) is unreliable in
// the minified CDN build - it can throw a bare "Cannot read properties of
// undefined (reading 'length')" instead of picking a size. So instead we
// try increasing type numbers ourselves until one is large enough to hold
// the text at error-correction level H, which is the standard workaround.
// MIN_QR_TYPE: even a short name (e.g. "Academy") is encoded on a finer grid
// (version 6 = 41x41 modules) so the logo's clear zone is a small, tidy circle
// instead of swallowing a big share of a coarse code. Any scanner reads the
// same text from it - only the module size changes.
const MIN_QR_TYPE = 6;
function makeQrCode(text) {
  let lastErr;
  for (let type = MIN_QR_TYPE; type <= 40; type++) {
    try {
      const qr = qrcode(type, 'H');
      qr.addData(text);
      qr.make();
      return qr;
    } catch (err) {
      lastErr = err; // too small for this type - try the next one
    }
  }
  throw lastErr || new Error('Could not generate a QR code for this text.');
}

/**
 * @param {string} text        Data to encode.
 * @param {HTMLImageElement} [logoImg]  Optional logo drawn centered on top.
 * @param {Object} [opts]
 * @param {number} [opts.targetSize=1000] Roughly how wide the canvas should be, in
 *   pixels - drives how crisp the QR (and the embedded logo) look once
 *   scaled into the on-screen preview or a printed PDF. Higher = sharper.
 * @param {number} [opts.marginCells=4] Quiet-zone width, in modules.
 * @param {number} [opts.logoRatio=0.3] Logo width as a fraction of the QR modules area (quiet zone excluded).
 * @returns {HTMLCanvasElement}
 */
function generateQrCanvas(text, logoImg, opts = {}) {
  const targetSize = opts.targetSize || 1000;
  const marginCells = opts.marginCells != null ? opts.marginCells : 4;
  const logoRatio = opts.logoRatio || 0.3;

  const qr = makeQrCode(text);
  const moduleCount = qr.getModuleCount();

  // Round to a whole number of pixels per module so module edges land on
  // exact pixel boundaries - a fractional cell size is what makes a QR
  // (and anything drawn on top of it) look soft/blurry. This also keeps
  // the canvas large (well beyond the ~220px preview size), so the logo
  // is drawn at high resolution and only ever scaled down, never up.
  const cellSize = Math.max(1, Math.round(targetSize / (moduleCount + marginCells * 2)));
  const margin = marginCells * cellSize;
  const size = moduleCount * cellSize + margin * 2;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = '#000000';
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qr.isDark(row, col)) {
        ctx.fillRect(margin + col * cellSize, margin + row * cellSize, cellSize, cellSize);
      }
    }
  }

  if (logoImg) {
    const logoSize = moduleCount * cellSize * logoRatio;
    const cx = size / 2;
    const cy = size / 2;
    // Clear white circle just a little bigger than the logo's own outer ring,
    // so the modules are cut away in a clean round shape right around it.
    const backdropR = logoSize / 2 + cellSize * 0.5;

    ctx.beginPath();
    ctx.arc(cx, cy, backdropR, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // High-quality downscaling for the logo specifically (the 1000+ px
    // source logo image is being shrunk into a small circle - without
    // this the browser can default to a cheap/blurry resize).
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(logoImg, cx - logoSize / 2, cy - logoSize / 2, logoSize, logoSize);
  }

  return canvas;
}

/**
 * Builds a one-page PDF matching the printed-QR-card look: a rounded black
 * frame around the QR, with the place name printed underneath.
 *
 * @param {Object} opts
 * @param {string} opts.dataUrl   PNG data URL from generateQrCanvas(...).toDataURL('image/png')
 * @param {string} opts.caption   Text printed below the QR (the sub place name).
 * @param {string} [opts.subCaption] Optional smaller line printed above the caption (the main place name).
 * @param {string} opts.filename
 */
async function exportQrCodeToPdf({ dataUrl, caption, subCaption, filename, title = 'Duty Place QR Code', logoUrl = 'images/aus_logo.png' }) {
  if (typeof jspdf === 'undefined' || !jspdf.jsPDF) {
    alert('The PDF export library did not load. Check your internet connection and try again.');
    return;
  }

  const doc = new jspdf.jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // ---- Aditya University header: logo (left), title + "Duty Watch" (right), rule ----
  const ORANGE = [244, 123, 32];
  const BLUE = [11, 79, 156];
  const NAVY = [15, 27, 46];
  const marginX = 40;
  const logoW = 215;
  const logoH = logoW * 117 / 900;
  try {
    const logo = await loadImageAsync(logoUrl);
    doc.addImage(logo, 'PNG', marginX, 30, logoW, logoH);
  } catch (err) {
    // logo missing - fall back to coloured text so the header never breaks
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(...ORANGE); doc.text('ADITYA', marginX, 52);
    doc.setTextColor(...BLUE); doc.text('UNIVERSITY', marginX + doc.getTextWidth('ADITYA ') + 4, 52);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...NAVY);
  doc.text(title, pageWidth - marginX, 44, { align: 'right' });
  doc.setFontSize(11);
  const subWords = ['Duty', 'Watch'];
  const subGap = doc.getTextWidth(' ');
  const subWidths = subWords.map((w) => doc.getTextWidth(w));
  let subX = pageWidth - marginX - (subWidths[0] + subWidths[1] + subGap);
  doc.setTextColor(...ORANGE); doc.text(subWords[0], subX, 60);
  subX += subWidths[0] + subGap;
  doc.setTextColor(...BLUE); doc.text(subWords[1], subX, 60);
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(1);
  doc.line(marginX, 76, pageWidth - marginX, 76);

  const qrSize = 260;
  const qrX = (pageWidth - qrSize) / 2;
  const qrY = 324;
  const framePad = 24;
  const frameR = 20;

  doc.setDrawColor(15, 15, 15);
  doc.setLineWidth(7);
  doc.roundedRect(qrX - framePad, qrY - framePad, qrSize + framePad * 2, qrSize + framePad * 2, frameR, frameR, 'S');

  doc.addImage(dataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

  let textY = qrY + qrSize + framePad + 44;
  if (subCaption) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13);
    doc.setTextColor(110, 110, 110);
    doc.text(subCaption, pageWidth / 2, textY, { align: 'center' });
    textY += 26;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(20, 20, 20);
  doc.text(caption, pageWidth / 2, textY, { align: 'center' });

  doc.save(filename);
}
