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


/**
 * Validates parsed bulk-upload rows (same rules as the "New account" form and
 * the server). Returns { valid: [{ row, line }], invalid: [{ line, roll_no, reason }] }
 * where `line` is the line number in the file (1 = header row).
 * Gender must be Male / Female / Other (capital first letter) or blank;
 * role must be admin or security.
 */
function validateBulkRows(rows) {
  const GENDERS = ['Male', 'Female', 'Other'];
  const ROLES = ['admin', 'security'];
  const valid = [];
  const invalid = [];
  const seen = new Set();

  rows.forEach((r, idx) => {
    const line = idx + 2;
    const roll = String(r.roll_no || '').trim();
    const pwd = String(r.password || '');
    const name = String(r.first_name || '').trim().replace(/\s+/g, ' ');
    const gender = String(r.gender || '').trim();
    const des = String(r.designation || '').trim();
    const mob = String(r.mobile || '').trim();
    const role = String(r.role || '').trim();
    const p = [];

    if (!roll) p.push('roll_no is required');
    else if (!/^[A-Za-z0-9_-]{2,20}$/.test(roll)) p.push('roll_no must be 2-20 letters, numbers, - or _ (no spaces)');
    else if (seen.has(roll)) p.push('duplicate roll_no in this file');

    if (!pwd) p.push('password is required');
    else if (/\s/.test(pwd)) p.push('password cannot contain spaces');
    else if (pwd.length < 7) p.push('password must be at least 7 characters');
    else if (!/[A-Z]/.test(pwd)) p.push('password needs an uppercase letter');
    else if (!/[0-9]/.test(pwd)) p.push('password needs a number');
    else if (!/[^A-Za-z0-9\s]/.test(pwd)) p.push('password needs a special character');

    if (!name) p.push('first_name is required');
    else if (name.length < 2) p.push('first_name must be at least 2 characters');
    else if (!/^[A-Za-z][A-Za-z .'-]*$/.test(name)) p.push("first_name can contain letters, spaces, . ' or - only");

    if (gender && !GENDERS.includes(gender)) {
      p.push(GENDERS.some(g => g.toLowerCase() === gender.toLowerCase())
        ? `gender "${gender}" must start with a capital letter (Male, Female or Other)`
        : `gender "${gender}" must be Male, Female or Other`);
    }

    if (des && des.length < 2) p.push('designation must be at least 2 characters');

    if (!mob) p.push('mobile is required');
    else if (!/^\d+$/.test(mob)) p.push('mobile must contain digits only');
    else if (mob.length !== 10) p.push('mobile must be exactly 10 digits');
    else if (!/^[6-9]/.test(mob)) p.push('mobile must start with 6, 7, 8 or 9');

    if (!role) p.push('role is required');
    else if (!ROLES.includes(role)) p.push(`role "${role}" must be admin or security (lowercase)`);

    if (p.length) {
      invalid.push({ line, roll_no: roll, reason: p.join('; ') + '.' });
    } else {
      seen.add(roll);
      valid.push({ row: r, line });
    }
  });
  return { valid, invalid };
}
