'use strict';
const crypto     = require('crypto');
const nodemailer = require('nodemailer');
const { Pool }   = require('pg');

const pool = new Pool({ connectionString: process.env.AGORA_DB_URL });

const _smtp = nodemailer.createTransport({
  host:   process.env.SYSTEM_EMAIL_HOST || 'smtp-relay.brevo.com',
  port:   parseInt(process.env.SYSTEM_EMAIL_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SYSTEM_EMAIL_USER,
    pass: process.env.SYSTEM_EMAIL_PASS,
  },
});

async function _sendViaSMTP({ to, subject, html, fromName }) {
  return _smtp.sendMail({
    from: '"' + (fromName || process.env.NEWSLETTER_FROM_NAME || 'Newsletter') + '" <' +
          (process.env.SYSTEM_EMAIL_FROM || process.env.SYSTEM_EMAIL_USER) + '>',
    to, subject, html,
  });
}

function _listUnsubToken(ownerUserId, email) {
  const secret = process.env.UNSUBSCRIBE_SECRET || 'change-me-unsub-secret';
  return crypto.createHmac('sha256', secret)
    .update(String(ownerUserId) + ':' + email.toLowerCase())
    .digest('hex')
    .slice(0, 32);
}

const router = require('express').Router();
const { parseBuffer, extractContacts, parsePastedEmails } = require('../services/csvParser');
const limits = require('../config/newsletter-limits');

// Session is injected by newsletter-app.js

// ── Public: list unsubscribe (no auth required) ───────────────────────────────
router.get('/lists/unsubscribe', async (req, res) => {
  const { t: token, e: email, o: ownerIdStr } = req.query;
  const ownerId = parseInt(ownerIdStr);
  if (!token || !email || !ownerId) {
    return res.status(400).send('<p style="font-family:sans-serif">Invalid link.</p>');
  }
  const expected = _listUnsubToken(ownerId, email);
  if (token !== expected) {
    return res.status(400).send('<p style="font-family:sans-serif">Invalid or expired link.</p>');
  }
  try {
    await pool.query(
      `INSERT INTO newsletter_suppressions (owner_user_id, email, reason)
       VALUES ($1, $2, 'unsubscribed') ON CONFLICT (owner_user_id, email) DO NOTHING`,
      [ownerId, email.toLowerCase()]
    );
    await pool.query(
      `UPDATE newsletter_contacts SET excluded = true
       WHERE owner_user_id = $1 AND LOWER(email) = $2`,
      [ownerId, email.toLowerCase()]
    );
    res.send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Unsubscribed</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f7fa}
  .card{background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.09);padding:2.5rem 3rem;max-width:420px;text-align:center}
  .icon{font-size:3rem;margin-bottom:1rem}
  h1{font-size:1.3rem;color:#1a1a2e;margin:0 0 .75rem}
  p{color:#666;font-size:.9rem;line-height:1.6;margin:0}
</style>
</head>
<body>
<div class="card">
  <div class="icon">&#10003;</div>
  <h1>Unsubscribed successfully</h1>
  <p>The address <strong>${email}</strong> will no longer receive emails from this sender.</p>
</div>
</body>
</html>`);
  } catch (e) {
    console.error('[unsub]', e);
    res.status(500).send('<p style="font-family:sans-serif">Error. Please try again later.</p>');
  }
});


function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Authentication required' });
  next();
}
router.use(requireAuth);

// ── Stubs for existing frontend calls ────────────────────────────────────────
router.get('/stats', (_req, res) =>
  res.json({ subscribers: { active: 0, daily: 0, weekly: 0, monthly: 0, unsubscribed: 0 }, queue: [] })
);
router.get('/subscribers', (_req, res) => res.json({ subscribers: [] }));
router.get('/subscribers/emails', (_req, res) => res.json({ emails: [] }));
router.post('/trigger', (_req, res) => res.json({ success: true, message: 'No subscribers yet.' }));
router.post('/broadcast', (_req, res) => res.json({ success: true, sent: 0, failed: 0, suppressed: 0 }));

// ── Lists ─────────────────────────────────────────────────────────────────────
router.get('/lists', async (req, res) => {
  const uid = req.session.userId;
  try {
    const { rows } = await pool.query(`
      SELECT l.id, l.name, l.source_filename, l.created_at, l.updated_at,
        COUNT(c.id)::int AS total,
        COUNT(c.id) FILTER (
          WHERE c.excluded = false
          AND NOT EXISTS (
            SELECT 1 FROM newsletter_suppressions s
            WHERE s.owner_user_id = $1 AND s.email = c.email
          )
        )::int AS active_recipients
      FROM newsletter_lists l
      LEFT JOIN newsletter_contacts c ON c.list_id = l.id
      WHERE l.owner_user_id = $1
      GROUP BY l.id
      ORDER BY l.created_at DESC
    `, [uid]);
    res.json({ lists: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/lists', async (req, res) => {
  const uid = req.session.userId;
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'List name is required' });
  try {
    const { rows: cnt } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM newsletter_lists WHERE owner_user_id = $1', [uid]
    );
    if (cnt[0].n >= limits.maxListsPerUser)
      return res.status(400).json({ error: `Maximum lists reached: ${limits.maxListsPerUser}` });

    const { rows } = await pool.query(
      `INSERT INTO newsletter_lists (owner_user_id, name, consent_confirmed_at)
       VALUES ($1, $2, now()) RETURNING id, name, created_at`,
      [uid, name.trim()]
    );
    res.status(201).json({ list: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'A list with this name already exists' });
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

router.patch('/lists/:id', async (req, res) => {
  const uid    = req.session.userId;
  const listId = parseInt(req.params.id);
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  try {
    const { rows } = await pool.query(
      `UPDATE newsletter_lists SET name = $1, updated_at = now()
       WHERE id = $2 AND owner_user_id = $3 RETURNING id, name`,
      [name.trim(), listId, uid]
    );
    if (!rows.length) return res.status(404).json({ error: 'List not found' });
    res.json({ list: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'A list with this name already exists' });
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

router.delete('/lists/:id', async (req, res) => {
  const uid    = req.session.userId;
  const listId = parseInt(req.params.id);
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM newsletter_lists WHERE id = $1 AND owner_user_id = $2',
      [listId, uid]
    );
    if (!rowCount) return res.status(404).json({ error: 'List not found' });
    res.status(204).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── Import: preview (parse CSV, no DB write) ──────────────────────────────────
router.post('/import/preview', async (req, res) => {
  try {
    if (!req.body || !req.body.data) return res.status(400).json({ error: 'No file found' });
    const buf = Buffer.from(req.body.data, 'base64');
    const maxBytes = limits.maxImportMb * 1024 * 1024;
    if (buf.length > maxBytes)
      return res.status(400).json({ error: `File exceeds ${limits.maxImportMb} MB` });
    const { headers, preview, totalDataRows, colMap } = parseBuffer(buf);
    if (totalDataRows > limits.maxImportRows)
      return res.status(400).json({ error: `File exceeds ${limits.maxImportRows.toLocaleString()} rows` });
    res.json({ headers, preview, totalDataRows, colMap });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message || 'File parse error' });
  }
});

// ── Import: create list (if needed) + insert contacts (atomic) ────────────────
router.post('/import', async (req, res) => {
  const uid = req.session.userId;
  const { newListName, listId, consentAt, filename } = req.body;

  if (!newListName && !listId) return res.status(400).json({ error: 'List name or selection required' });
  if (!consentAt) return res.status(400).json({ error: 'Consent required' });

  let contacts, invalidRows = [];
  try {
    if (req.body.pasteText) {
      const r = parsePastedEmails(req.body.pasteText);
      contacts = r.valid; invalidRows = r.invalid;
    } else if (req.body.data) {
      const buf = Buffer.from(req.body.data, 'base64');
      if (buf.length > limits.maxImportMb * 1024 * 1024)
        return res.status(400).json({ error: `File > ${limits.maxImportMb} MB` });
      const parsed = parseBuffer(buf);
      const emailCol   = req.body.emailCol   !== undefined ? parseInt(req.body.emailCol)   : parsed.colMap.email;
      const nameCol    = req.body.nameCol    !== undefined ? parseInt(req.body.nameCol)    : parsed.colMap.name;
      const companyCol = req.body.companyCol !== undefined ? parseInt(req.body.companyCol) : parsed.colMap.company;
      const r = extractContacts(
        parsed.dataRows,
        parsed.headers,
        { email: emailCol, name: nameCol, company: companyCol },
        companyCol < 0
      );
      contacts = r.valid; invalidRows = r.invalid;
    } else {
      return res.status(400).json({ error: 'No data found' });
    }
  } catch (e) {
    return res.status(400).json({ error: e.message || 'Parse error' });
  }

  if (!contacts.length && !invalidRows.length)
    return res.status(400).json({ error: 'No contacts found' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let targetListId;
    if (newListName) {
      const { rows: cnt } = await client.query(
        'SELECT COUNT(*)::int AS n FROM newsletter_lists WHERE owner_user_id = $1', [uid]
      );
      if (cnt[0].n >= limits.maxListsPerUser)
        throw new Error(`Maximum lists reached: ${limits.maxListsPerUser}`);

      const { rows } = await client.query(
        `INSERT INTO newsletter_lists (owner_user_id, name, source_filename, consent_confirmed_at)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [uid, newListName.trim(), filename || null, consentAt]
      );
      targetListId = rows[0].id;
    } else {
      const { rows } = await client.query(
        'SELECT id FROM newsletter_lists WHERE id = $1 AND owner_user_id = $2',
        [parseInt(listId), uid]
      );
      if (!rows.length) {
        const err = new Error('List not found'); err.status = 404; throw err;
      }
      targetListId = rows[0].id;
      await client.query(
        `UPDATE newsletter_lists
         SET consent_confirmed_at = $1,
             source_filename = COALESCE($2, source_filename),
             updated_at = now()
         WHERE id = $3`,
        [consentAt, filename || null, targetListId]
      );
    }

    const { rows: existCnt } = await client.query(
      'SELECT COUNT(*)::int AS n FROM newsletter_contacts WHERE list_id = $1', [targetListId]
    );
    if (existCnt[0].n + contacts.length > limits.maxContactsPerList)
      throw new Error(`List would exceed the limit of ${limits.maxContactsPerList.toLocaleString()} contacts`);

    let imported = 0, duplicates = 0;
    const BATCH = 500;
    for (let i = 0; i < contacts.length; i += BATCH) {
      const batch = contacts.slice(i, i + BATCH);
      const ph  = batch.map((_, j) => `($${j*5+1},$${j*5+2},$${j*5+3},$${j*5+4},$${j*5+5})`).join(',');
      const vals = batch.flatMap(c => [targetListId, uid, c.email, c.name, c.company]);
      const result = await client.query(
        `INSERT INTO newsletter_contacts (list_id,owner_user_id,email,name,company)
         VALUES ${ph} ON CONFLICT (list_id,email) DO NOTHING`,
        vals
      );
      imported  += result.rowCount;
      duplicates += batch.length - result.rowCount;
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      listId:     targetListId,
      imported,
      duplicates,
      invalid:    invalidRows.length,
      invalidRows: invalidRows.slice(0, 100),
    });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return res.status(409).json({ error: 'A list with this name already exists' });
    console.error(e);
    res.status(e.status || 500).json({ error: e.message || 'Database error' });
  } finally {
    client.release();
  }
});

// ── Contacts for a list (search + filter + pagination) ───────────────────────
router.get('/lists/:id/contacts', async (req, res) => {
  const uid    = req.session.userId;
  const listId = parseInt(req.params.id);
  const page   = Math.max(1, parseInt(req.query.page) || 1);
  const search = (req.query.search || '').trim().slice(0, 200);
  const filter = ['all','active','excluded','suppressed'].includes(req.query.filter)
    ? req.query.filter : 'all';
  const offset = (page - 1) * 50;
  try {
    const { rows: listCheck } = await pool.query(
      'SELECT id FROM newsletter_lists WHERE id = $1 AND owner_user_id = $2', [listId, uid]
    );
    if (!listCheck.length) return res.status(404).json({ error: 'List not found' });

    const baseVals  = [listId, uid];
    const suppCond  = 'EXISTS(SELECT 1 FROM newsletter_suppressions s WHERE s.owner_user_id = $2 AND s.email = c.email)';
    const extraConds = [];
    const searchVals = [];

    if (search) {
      searchVals.push('%' + search + '%');
      const p = baseVals.length + searchVals.length;
      extraConds.push(
        '(c.email ILIKE $' + p + ' OR COALESCE(c.name,\'\') ILIKE $' + p + ' OR COALESCE(c.company,\'\') ILIKE $' + p + ')'
      );
    }
    if (filter === 'active')       extraConds.push('c.excluded = false AND NOT ' + suppCond);
    else if (filter === 'excluded')     extraConds.push('c.excluded = true');
    else if (filter === 'suppressed')   extraConds.push(suppCond);

    const allVals = [...baseVals, ...searchVals];
    const extra   = extraConds.length ? ' AND ' + extraConds.join(' AND ') : '';

    const [dataQ, countQ, statsQ] = await Promise.all([
      pool.query(
        'SELECT c.id, c.email, c.name, c.company, c.excluded, c.created_at, ' + suppCond + ' AS suppressed' +
        ' FROM newsletter_contacts c WHERE c.list_id = $1' + extra +
        ' ORDER BY c.created_at ASC LIMIT 50 OFFSET $' + (allVals.length + 1),
        [...allVals, offset]
      ),
      pool.query(
        'SELECT COUNT(*)::int AS n FROM newsletter_contacts c WHERE c.list_id = $1' + extra,
        allVals
      ),
      pool.query(
        'SELECT COUNT(*)::int AS total,' +
        ' COUNT(*) FILTER (WHERE c.excluded=false AND NOT ' + suppCond + ')::int AS active_count,' +
        ' COUNT(*) FILTER (WHERE c.excluded=true)::int AS excluded_count,' +
        ' COUNT(*) FILTER (WHERE ' + suppCond + ')::int AS suppressed_count' +
        ' FROM newsletter_contacts c WHERE c.list_id = $1',
        baseVals
      )
    ]);
    const s = statsQ.rows[0];
    res.json({
      contacts:        dataQ.rows,
      total:           s.total,
      totalFiltered:   countQ.rows[0].n,
      activeCount:     s.active_count,
      excludedCount:   s.excluded_count,
      suppressedCount: s.suppressed_count,
      page,
      perPage: 50
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── Update a single contact (excluded, name, company) ─────────────────────────
router.patch('/lists/:id/contacts/:cid', async (req, res) => {
  const uid    = req.session.userId;
  const listId = parseInt(req.params.id);
  const cid    = parseInt(req.params.cid);
  const { excluded, name, company } = req.body;
  try {
    const { rows: listCheck } = await pool.query(
      'SELECT id FROM newsletter_lists WHERE id = $1 AND owner_user_id = $2', [listId, uid]
    );
    if (!listCheck.length) return res.status(404).json({ error: 'List not found' });

    const sets = []; const vals = [];
    if (excluded !== undefined) { sets.push('excluded = $' + (vals.length+1)); vals.push(!!excluded); }
    if (name     !== undefined) { sets.push('name = $'     + (vals.length+1)); vals.push(name    || null); }
    if (company  !== undefined) { sets.push('company = $'  + (vals.length+1)); vals.push(company || null); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

    vals.push(cid, listId);
    const { rows } = await pool.query(
      'UPDATE newsletter_contacts SET ' + sets.join(', ') +
      ' WHERE id = $' + (vals.length-1) + ' AND list_id = $' + vals.length +
      ' RETURNING id, email, name, company, excluded',
      vals
    );
    if (!rows.length) return res.status(404).json({ error: 'Contact not found' });
    res.json({ contact: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── Delete a single contact ───────────────────────────────────────────────────
router.delete('/lists/:id/contacts/:cid', async (req, res) => {
  const uid    = req.session.userId;
  const listId = parseInt(req.params.id);
  const cid    = parseInt(req.params.cid);
  try {
    const { rows: listCheck } = await pool.query(
      'SELECT id FROM newsletter_lists WHERE id = $1 AND owner_user_id = $2', [listId, uid]
    );
    if (!listCheck.length) return res.status(404).json({ error: 'List not found' });
    const { rowCount } = await pool.query(
      'DELETE FROM newsletter_contacts WHERE id = $1 AND list_id = $2', [cid, listId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Contact not found' });
    res.status(204).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── Bulk action on contacts ───────────────────────────────────────────────────
router.post('/lists/:id/contacts/bulk', async (req, res) => {
  const uid    = req.session.userId;
  const listId = parseInt(req.params.id);
  const { action, ids } = req.body;
  if (!['exclude','include','delete'].includes(action))
    return res.status(400).json({ error: 'Unknown action' });
  if (!Array.isArray(ids) || !ids.length)
    return res.status(400).json({ error: 'No contacts selected' });
  try {
    const { rows: listCheck } = await pool.query(
      'SELECT id FROM newsletter_lists WHERE id = $1 AND owner_user_id = $2', [listId, uid]
    );
    if (!listCheck.length) return res.status(404).json({ error: 'List not found' });

    const idInts = ids.map(Number).filter(Boolean);
    const ph     = idInts.map((_, i) => '$' + (i + 2)).join(',');
    let affected;
    if (action === 'delete') {
      const r = await pool.query(
        'DELETE FROM newsletter_contacts WHERE list_id = $1 AND id IN (' + ph + ')',
        [listId, ...idInts]
      );
      affected = r.rowCount;
    } else {
      const r = await pool.query(
        'UPDATE newsletter_contacts SET excluded = $1 WHERE list_id = $2 AND id IN (' +
          idInts.map((_, i) => '$' + (i + 3)).join(',') + ')',
        [action === 'exclude', listId, ...idInts]
      );
      affected = r.rowCount;
    }
    res.json({ affected });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── POST /lists/:id/broadcast ─────────────────────────────────────────────────
router.post('/lists/:id/broadcast', async (req, res) => {
  const uid    = req.session.userId;
  const listId = parseInt(req.params.id);
  const { subject, html, fromName } = req.body;

  if (!subject || !html)
    return res.status(400).json({ error: 'subject and html required' });

  try {
    const { rows: listCheck } = await pool.query(
      'SELECT id, name FROM newsletter_lists WHERE id = $1 AND owner_user_id = $2',
      [listId, uid]
    );
    if (!listCheck.length) return res.status(404).json({ error: 'List not found' });

    const { rows: contacts } = await pool.query(
      `SELECT c.email, c.name FROM newsletter_contacts c
       WHERE c.list_id = $1
         AND c.excluded = false
         AND NOT EXISTS (
           SELECT 1 FROM newsletter_suppressions s
           WHERE s.owner_user_id = $2 AND LOWER(s.email) = LOWER(c.email)
         )`,
      [listId, uid]
    );
    if (!contacts.length)
      return res.status(400).json({ error: 'No active recipients in this list' });

    const APP_URL = process.env.APP_URL || 'https://eureach.eu';
    let sent = 0, failed = 0;
    const errors = [];

    for (const contact of contacts) {
      try {
        const token    = _listUnsubToken(uid, contact.email);
        const unsubUrl = APP_URL + '/api/newsletter/lists/unsubscribe?t=' + token +
                         '&e=' + encodeURIComponent(contact.email) + '&o=' + uid;
        const personalHtml = html
          .replace(/https?:\/\/[^"]*\/newsletter\/unsubscribe\?token=\{\{unsubscribe_url\}\}/g, unsubUrl)
          .replace(/\{\{unsubscribe_url\}\}/g, unsubUrl)
          .replace(/\{\{name\}\}/g, contact.name || '');
        await _sendViaSMTP({ to: contact.email, subject, html: personalHtml, fromName });
        sent++;
      } catch (e) {
        failed++;
        errors.push({ email: contact.email, reason: e.message });
      }
      await new Promise(r => setTimeout(r, 60));
    }

    console.log('[list-broadcast] list=' + listId + ' sent=' + sent + ' failed=' + failed);
    res.json({ success: true, total: contacts.length, sent, failed, errors: errors.slice(0, 30) });
  } catch (e) {
    console.error('[list-broadcast]', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

// ── Header presets ────────────────────────────────────────────────────────────
router.get('/header-presets', async (req, res) => {
  const uid = req.session.userId;
  try {
    const { rows } = await pool.query(
      'SELECT id, name, config, is_default, created_at FROM newsletter_header_presets WHERE owner_user_id = $1 ORDER BY created_at ASC',
      [uid]
    );
    res.json({ presets: rows });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Database error' }); }
});

router.post('/header-presets', async (req, res) => {
  const uid = req.session.userId;
  const { name, config } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO newsletter_header_presets (owner_user_id, name, config)
       VALUES ($1, $2, $3)
       ON CONFLICT (owner_user_id, name) DO UPDATE
         SET config = $3, updated_at = now()
       RETURNING id, name, config, is_default, created_at`,
      [uid, name.trim(), JSON.stringify(config || {})]
    );
    res.status(201).json({ preset: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

router.put('/header-presets/:id', async (req, res) => {
  const uid = req.session.userId;
  const id  = parseInt(req.params.id);
  const { name, config } = req.body;
  try {
    const sets = []; const vals = [];
    if (name   !== undefined) { sets.push('name = $'   + (vals.length+1)); vals.push(name.trim()); }
    if (config !== undefined) { sets.push('config = $' + (vals.length+1)); vals.push(JSON.stringify(config)); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
    sets.push('updated_at = now()');
    vals.push(id, uid);
    const { rows } = await pool.query(
      'UPDATE newsletter_header_presets SET ' + sets.join(', ') +
      ' WHERE id = $' + (vals.length-1) + ' AND owner_user_id = $' + vals.length +
      ' RETURNING id, name, config, is_default',
      vals
    );
    if (!rows.length) return res.status(404).json({ error: 'Preset not found' });
    res.json({ preset: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Preset name already exists' });
    console.error(e);
    res.status(500).json({ error: 'Database error' });
  }
});

router.delete('/header-presets/:id', async (req, res) => {
  const uid = req.session.userId;
  const id  = parseInt(req.params.id);
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM newsletter_header_presets WHERE id = $1 AND owner_user_id = $2',
      [id, uid]
    );
    if (!rowCount) return res.status(404).json({ error: 'Preset not found' });
    res.status(204).end();
  } catch (e) { console.error(e); res.status(500).json({ error: 'Database error' }); }
});

router.post('/header-presets/:id/default', async (req, res) => {
  const uid = req.session.userId;
  const id  = parseInt(req.params.id);
  try {
    await pool.query(
      'UPDATE newsletter_header_presets SET is_default = false WHERE owner_user_id = $1', [uid]
    );
    const { rows } = await pool.query(
      'UPDATE newsletter_header_presets SET is_default = true WHERE id = $1 AND owner_user_id = $2 RETURNING id',
      [id, uid]
    );
    if (!rows.length) return res.status(404).json({ error: 'Preset not found' });
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Database error' }); }
});

// ── AI Generate ───────────────────────────────────────────────────────────────
const Groq = require('groq-sdk');
let _groqClient = null;
function _getGroq() {
  if (!_groqClient) _groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groqClient;
}

router.post('/ai-generate', async (req, res) => {
  const { prompt, tone = 'friendly', genSubject = true } = req.body;
  if (!prompt || !prompt.trim()) return res.status(400).json({ error: 'Prompt required' });

  const toneMap = {
    friendly:     'friendly and warm',
    professional: 'professional',
    urgent:       'urgent and compelling'
  };
  const toneDesc = toneMap[tone] || toneMap.friendly;

  const systemPrompt = `You are an expert email newsletter writer. Write in the language of the user's prompt. Return ONLY valid JSON with fields: "subject" (if requested) and "html" (content without html/body tags). The HTML should be clean and ready for email.`;

  const userPrompt = `Write an email newsletter with a ${toneDesc} tone.${genSubject ? '\nAlso create a subject line for the email.' : ''}
Instructions: ${prompt}

JSON response: { ${genSubject ? '"subject": "...", ' : ''}"html": "..." }`;

  try {
    const groq = _getGroq();
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 2048,
      response_format: { type: 'json_object' }
    });
    const text = completion.choices[0].message.content;
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (_) {
      const m = text.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : { html: text };
    }
    res.json(parsed);
  } catch (e) {
    console.error('AI generate error:', e);
    res.status(500).json({ error: 'AI error: ' + e.message });
  }
});


// ── Email Templates ───────────────────────────────────────────────────────────
router.get('/templates', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, slug, name, category, site, active, language, created_at, updated_at
       FROM email_templates WHERE (site = 'eureach.eu' OR site IS NULL)
       ORDER BY category, name`
    );
    res.json({ templates: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function buildAdsSidebarHtml(db) {
  const { rows: ads } = await db.query("SELECT * FROM newsletter_ads WHERE status = 'active' ORDER BY id ASC");
  if (!ads.length) return '<p style="font-size:11px;color:#94a3b8;text-align:center;padding:20px 0;">No active ads</p>';
  const label = '<p style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin:0 0 14px;">Sponsors</p>';
  const adHtml = ads.map((ad, i) => {
    const color = ad.accent_color || '#4f46e5';
    const mb = i < ads.length - 1 ? 'margin-bottom:14px;' : '';
    return '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="' + mb + 'border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">' +
      '<tr><td style="background:' + color + ';padding:8px 12px;"><div style="font-size:12px;font-weight:700;color:#fff;">' + (ad.headline || ad.name) + '</div></td></tr>' +
      '<tr><td style="padding:10px 12px 12px;background:' + (ad.bg_color || '#fff') + ';">' +
      (ad.body ? '<p style="margin:0 0 10px;font-size:11px;color:#475569;line-height:1.5;">' + ad.body + '</p>' : '') +
      (ad.cta_url ? '<a href="' + ad.cta_url + '" style="display:inline-block;background:' + color + ';color:#fff;text-decoration:none;font-size:11px;font-weight:700;padding:6px 14px;border-radius:5px;">' + (ad.cta_label || 'Learn More') + '</a>' : '') +
      '</td></tr></table>';
  }).join('');
  return label + adHtml;
}

router.get('/templates/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM email_templates WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const tpl = { ...rows[0] };
    if (tpl.html_body && tpl.html_body.includes('{{ADS_SIDEBAR}}')) {
      tpl.html_body = tpl.html_body.replace('{{ADS_SIDEBAR}}', await buildAdsSidebarHtml(pool));
    }
    res.json({ template: tpl });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/templates', async (req, res) => {
  const { slug, name, category = 'transactional', html_body, plain_body, variables = [], language = 'en' } = req.body;
  if (!slug || !name) return res.status(400).json({ error: 'slug and name required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO email_templates (slug, name, category, html_body, plain_body, variables, site, language)
       VALUES ($1,$2,$3,$4,$5,$6,'eureach.eu',$7) RETURNING *`,
      [slug, name, category, html_body || '', plain_body || '', JSON.stringify(variables), language || 'en']
    );
    res.status(201).json({ template: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Slug already exists' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/templates/:id', async (req, res) => {
  const { name, category, html_body, plain_body, variables, active, language } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE email_templates SET
         name       = COALESCE($1, name),
         category   = COALESCE($2, category),
         html_body  = COALESCE($3, html_body),
         plain_body = COALESCE($4, plain_body),
         variables  = COALESCE($5, variables),
         active     = COALESCE($6, active),
         language   = COALESCE($7, language),
         updated_at = now()
       WHERE id = $8 RETURNING *`,
      [name||null, category||null, html_body||null, plain_body||null,
       variables ? JSON.stringify(variables) : null, active??null, language||null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ template: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/templates/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM email_templates WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

