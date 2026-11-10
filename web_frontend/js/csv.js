/**
 * Minimal CSV helpers for the "Add Security" bulk upload feature.
 * Handles quoted fields (so commas inside a name/designation are safe).
 */

const CSV_HEADERS = ['roll_no', 'password', 'first_name', 'gender', 'designation', 'mobile', 'role'];

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = false; }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields.map(f => f.trim());
}

/**
 * Parses CSV text into an array of row objects keyed by the header row.
 * Blank lines are skipped.
 */
function parseCsv(text) {
  const lines = text.split(/\r\n|\n|\r/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] !== undefined ? values[idx] : ''; });
    rows.push(row);
  }
  return rows;
}

function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsvTemplate() {
  const exampleRow = ['1001', 'Pass@123', 'John Doe', 'Male', 'Security Guard', '9000000000', 'security'];
  const csv = [CSV_HEADERS.join(','), exampleRow.map(csvEscape).join(',')].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'security_upload_template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
