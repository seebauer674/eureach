'use strict';

const FREE_MAIL_DOMAINS = new Set([
  'gmail.com','yahoo.com','yahoo.gr','yahoo.de','hotmail.com','hotmail.gr','hotmail.de',
  'outlook.com','outlook.gr','outlook.de','icloud.com','protonmail.com','proton.me',
  'mail.com','gmx.com','gmx.de','gmx.net','web.de','live.com','msn.com',
  'ymail.com','aol.com','inbox.com','zoho.com','tutanota.com','pm.me',
  'fastmail.com','hey.com','googlemail.com',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const EMAIL_SYNONYMS   = ['email','e-mail','mail','ηλ. ταχυδρομείο','ηλεκτρονικό ταχυδρομείο','email address','e-mail address','e mail'];
const NAME_SYNONYMS    = ['name','full name','fullname','full_name','όνομα','ονοματεπώνυμο','name'];
const COMPANY_SYNONYMS = ['company','εταιρεία','επιχείρηση','firma','unternehmen','organisation','organization','εταιρια'];

function decodeBuffer(buf) {
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return buf.slice(3).toString('utf8');
  }
  const utf8 = buf.toString('utf8');
  if (!utf8.includes('\uFFFD')) return utf8;
  try {
    return new TextDecoder('windows-1253').decode(buf);
  } catch {
    return buf.toString('latin1');
  }
}

function detectDelimiter(lines) {
  const sample = lines.slice(0, 10).join('\n');
  const counts = {
    ',':  (sample.match(/,/g)  || []).length,
    ';':  (sample.match(/;/g)  || []).length,
    '\t': (sample.match(/\t/g) || []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function splitCsvLine(line, delim) {
  const result = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuote = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === delim) { result.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
  }
  result.push(cur.trim());
  return result;
}

function matchHeader(h) {
  const lower = (h || '').toLowerCase().trim();
  if (EMAIL_SYNONYMS.includes(lower))   return 'email';
  if (NAME_SYNONYMS.includes(lower))    return 'name';
  if (COMPANY_SYNONYMS.includes(lower)) return 'company';
  return null;
}

function deriveCompany(email) {
  const domain = (email.split('@')[1] || '').toLowerCase();
  if (!domain || FREE_MAIL_DOMAINS.has(domain)) return '';
  const parts = domain.replace(/\.(com|gr|de|eu|net|org|io|co\.uk|co|at|ch|nl|fr|it|es|pl|cz|sk|hu|ro|bg|rs|hr|si|ba|mk|me|al|xk|tr|cy|lt|lv|ee|fi|se|no|dk|is|pt|be|lu|ie|mt)$/i, '').split('.');
  return parts[parts.length - 1] || '';
}

function parseBuffer(buf) {
  const text = decodeBuffer(buf);
  const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!rawLines.length) throw new Error('Κενό αρχείο');

  const delim = detectDelimiter(rawLines);
  const rows = rawLines.map(l => splitCsvLine(l, delim));

  const firstRow = rows[0];
  const hasHeader = firstRow.some(cell => matchHeader(cell) !== null);

  let headers, dataRows;
  if (hasHeader) {
    headers = firstRow;
    dataRows = rows.slice(1);
  } else {
    headers = firstRow.map((_, i) => `Στήλη ${i + 1}`);
    dataRows = rows;
  }

  const colMap = { email: -1, name: -1, company: -1 };
  headers.forEach((h, i) => {
    const m = matchHeader(h);
    if (m && colMap[m] === -1) colMap[m] = i;
  });

  if (colMap.email === -1) {
    for (let col = 0; col < headers.length; col++) {
      const samples = dataRows.slice(0, 8).map(r => (r[col] || '').trim());
      if (samples.filter(s => EMAIL_RE.test(s)).length >= Math.min(2, samples.length)) {
        colMap.email = col;
        break;
      }
    }
  }

  const preview = dataRows.slice(0, 10).map(row =>
    headers.map((h, i) => row[i] || '')
  );

  return { headers, preview, totalDataRows: dataRows.length, colMap, dataRows };
}

function extractContacts(dataRows, headers, colMap, deriveCompanyFromDomain) {
  const emailIdx   = typeof colMap.email   === 'number' ? colMap.email   : -1;
  const nameIdx    = typeof colMap.name    === 'number' ? colMap.name    : -1;
  const companyIdx = typeof colMap.company === 'number' ? colMap.company : -1;

  const valid = [], invalid = [], seen = new Set();

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (emailIdx < 0) { invalid.push({ row: i + 2, value: '', reason: 'Δεν ορίστηκε στήλη email' }); continue; }

    const rawEmail = (row[emailIdx] || '').trim().toLowerCase();
    if (!rawEmail)              { invalid.push({ row: i + 2, value: rawEmail, reason: 'Κενό email' }); continue; }
    if (!EMAIL_RE.test(rawEmail)) { invalid.push({ row: i + 2, value: rawEmail, reason: 'Μη έγκυρο email' }); continue; }
    if (seen.has(rawEmail))     { invalid.push({ row: i + 2, value: rawEmail, reason: 'Διπλό εντός αρχείου' }); continue; }
    seen.add(rawEmail);

    const name    = nameIdx    >= 0 ? (row[nameIdx]    || '').trim() : '';
    let   company = companyIdx >= 0 ? (row[companyIdx] || '').trim() : '';
    if (!company && deriveCompanyFromDomain) company = deriveCompany(rawEmail);

    valid.push({ email: rawEmail, name: name || null, company: company || null });
  }

  return { valid, invalid };
}

function parsePastedEmails(text) {
  const tokens = text.split(/[\n,;]+/).map(e => e.trim().toLowerCase()).filter(Boolean);
  const valid = [], invalid = [], seen = new Set();
  for (const e of tokens) {
    if (!EMAIL_RE.test(e)) { invalid.push({ value: e, reason: 'Μη έγκυρο email' }); continue; }
    if (seen.has(e))       { invalid.push({ value: e, reason: 'Διπλό' }); continue; }
    seen.add(e);
    valid.push({ email: e, name: null, company: null });
  }
  return { valid, invalid };
}

module.exports = { parseBuffer, extractContacts, parsePastedEmails, EMAIL_RE };
