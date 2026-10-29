'use strict';
const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const { Pool } = require('pg');
const { sendEmail, isSuppressed } = require('../services/emailService');
const nodemailer = require('nodemailer');

const pool = new Pool({ connectionString: process.env.AGORA_DB_URL });

const nlTransport = nodemailer.createTransport({
  host:   process.env.SYSTEM_EMAIL_HOST || 'smtp-relay.brevo.com',
  port:   parseInt(process.env.SYSTEM_EMAIL_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SYSTEM_EMAIL_USER,
    pass: process.env.SYSTEM_EMAIL_PASS,
  },
});

async function sendViaSMTP({ to, subject, html, fromName }) {
  return nlTransport.sendMail({
    from: `"${fromName || process.env.NEWSLETTER_FROM_NAME || 'Eureach'}" <${process.env.SYSTEM_EMAIL_FROM || process.env.SYSTEM_EMAIL_USER}>`,
    to, subject, html,
  });
}

const TRACKING_SECRET = process.env.TRACKING_SECRET || 'eureach-nl-track-2024';
const TRACKING_PIXEL  = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const APP_URL = process.env.APP_URL || 'https://eureach.eu';

function trackToken(queueId, subscriberId) {
  return crypto.createHmac('sha256', TRACKING_SECRET)
    .update(`${queueId}:${subscriberId}`)
    .digest('hex')
    .slice(0, 16);
}

async function gdprLog(email, subscriberId, action, req, meta = {}) {
  await pool.query(
    `INSERT INTO gdpr_log (email, subscriber_id, action, ip_address, user_agent, metadata)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [email, subscriberId || null, action,
     req?.ip || null, req?.headers?.['user-agent'] || null, JSON.stringify(meta)]
  ).catch(() => {});
}

// ── POST /api/newsletter/subscribe ───────────────────────────────────────────
router.post('/subscribe', async (req, res) => {
  const {
    email, name, firstname, lastname,
    frequency = 'weekly',
    categories = [], cities = [], keywords = [],
    language = 'el', country, source_site, source_page,
    gdpr_consent = false,
  } = req.body;

  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });

  const site = source_site || 'eureach.eu';

  try {
    const suppressedCheck = await isSuppressed(email);
    if (suppressedCheck) return res.status(400).json({ error: 'This email cannot be subscribed' });

    const confirmToken = crypto.randomBytes(32).toString('hex');

    const result = await pool.query(
      `INSERT INTO newsletter_subscribers
         (email, name, firstname, lastname, frequency, categories, cities, keywords,
          language, country, source_site, source_page,
          gdpr_consent, gdpr_ip, gdpr_ua, gdpr_at, confirm_token, status, confirmed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),$16,'pending',false)
       ON CONFLICT (email) DO UPDATE SET
         status='pending', confirmed=false, frequency=$5, categories=$6, cities=$7, keywords=$8,
         source_site=EXCLUDED.source_site, gdpr_consent=$13,
         gdpr_ip=$14, gdpr_ua=$15, gdpr_at=NOW(), unsubscribed_at=NULL,
         confirm_token=$16
       RETURNING id, unsubscribe_token`,
      [email, name || null, firstname || null, lastname || null,
       frequency, categories, cities, keywords,
       language, country || null, site, source_page || null,
       gdpr_consent, req.ip || null, req.headers?.['user-agent'] || null,
       confirmToken]
    );

    const sub = result.rows[0];
    await gdprLog(email, sub.id, 'subscribe', req, { frequency, site, gdpr_consent });

    const confirmUrl = `${APP_URL}/api/newsletter/confirm?token=${confirmToken}`;

    sendEmail({
      to: email,
      subject: 'Confirm your Eureach Newsletter subscription',
      html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:30px;background:#fff;">
        <div style="font-size:2rem;font-weight:900;letter-spacing:-2px;margin-bottom:1.5rem;color:#4f46e5;">eureach<span style="color:#6366f1">.</span>eu</div>
        <h2 style="color:#1a1a2e;margin-bottom:.75rem;">One more step!</h2>
        <p style="color:#555;line-height:1.6;margin-bottom:1.5rem;">Click the button below to confirm your subscription and start receiving the Eureach newsletter.</p>
        <a href="${confirmUrl}" style="display:inline-block;padding:.75rem 2rem;background:#4f46e5;color:#fff;text-decoration:none;border-radius:5px;font-weight:700;font-size:1rem;">Confirm subscription</a>
        <p style="margin-top:2rem;font-size:.8rem;color:#999;">If you did not sign up, ignore this email. The link expires in 48 hours.</p>
      </div>`,
    }).catch(e => console.error('[newsletter] Confirmation email failed:', e.message));

    res.json({ success: true, pending: true });
  } catch (err) {
    console.error('Newsletter subscribe:', err);
    res.status(500).json({ error: 'Subscription failed' });
  }
});

// ── GET /api/newsletter/confirm?token=xxx ────────────────────────────────────
router.get('/confirm', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/newsletter/confirm.html?status=invalid');
  try {
    const result = await pool.query(
      `UPDATE newsletter_subscribers
       SET confirmed=true, confirmed_at=NOW(), status='active', confirm_token=NULL
       WHERE confirm_token=$1 AND status='pending' AND deleted_at IS NULL
       RETURNING id, email, name, frequency, unsubscribe_token`,
      [token]
    );
    if (!result.rows.length) return res.redirect('/newsletter-confirm.html?status=invalid');

    const sub = result.rows[0];
    await gdprLog(sub.email, sub.id, 'confirm', req);

    sendEmail({
      to: sub.email,
      subject: 'Welcome to Eureach Newsletter!',
      html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:30px;background:#fff;">
        <div style="font-size:2rem;font-weight:900;letter-spacing:-2px;margin-bottom:1.5rem;color:#4f46e5;">eureach<span style="color:#6366f1">.</span>eu</div>
        <h2 style="color:#1a1a2e;margin-bottom:.75rem;">Subscription confirmed!</h2>
        <p style="color:#555;line-height:1.6;margin-bottom:1rem;">You will receive ${sub.frequency} updates from Eureach.</p>
        <p style="margin-top:2rem;font-size:.8rem;color:#999;">
          <a href="${APP_URL}/api/newsletter/unsubscribe?token=${sub.unsubscribe_token}" style="color:#4f46e5;">Unsubscribe</a>
        </p>
      </div>`,
    }).catch(() => {});

    res.redirect('/newsletter-confirm.html?status=success');
  } catch (err) {
    console.error('Newsletter confirm:', err);
    res.redirect('/newsletter-confirm.html?status=error');
  }
});

// ── GET /api/newsletter/unsubscribe?token=xxx ─────────────────────────────────
router.get('/unsubscribe', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token required' });
  try {
    const result = await pool.query(
      `UPDATE newsletter_subscribers
       SET status='unsubscribed', unsubscribed_at=NOW()
       WHERE unsubscribe_token=$1 RETURNING id, email`,
      [token]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Token not found' });
    const { id, email } = result.rows[0];
    await gdprLog(email, id, 'unsubscribe', req);
    res.json({ success: true, email });
  } catch (err) { res.status(500).json({ error: 'Unsubscribe failed' }); }
});

// ── DELETE /api/newsletter/subscriber  (GDPR delete) ─────────────────────────
router.delete('/subscriber', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token required' });
  try {
    const result = await pool.query(
      `UPDATE newsletter_subscribers
       SET status='deleted', deleted_at=NOW(), email=CONCAT('deleted_', id, '@deleted')
       WHERE unsubscribe_token=$1 RETURNING id`,
      [token]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    await gdprLog('deleted', result.rows[0].id, 'delete', req);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Delete failed' }); }
});

// ── GET /api/newsletter/export?token=xxx  (GDPR export) ──────────────────────
router.get('/export', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token required' });
  const { rows } = await pool.query(
    `SELECT email, name, firstname, lastname, frequency, status,
            language, country, source_site, categories, cities, keywords,
            gdpr_consent, gdpr_at, subscribed_at, confirmed, confirmed_at
     FROM newsletter_subscribers WHERE unsubscribe_token=$1`,
    [token]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  await gdprLog(rows[0].email, null, 'export', req);
  res.json({ data: rows[0] });
});

// ── POST /api/newsletter/import  (bulk import) ───────────────────────────────
router.post('/import', async (req, res) => {
  const { csv, subscribers: rawSubs = [], source_site = 'eureach.eu',
          frequency: defaultFreq = 'weekly', gdpr_consent = false } = req.body;

  let rows = [];
  if (csv && typeof csv === 'string') {
    const lines = csv.trim().split(/\r?\n/);
    const hasHeader = /^email/i.test(lines[0]);
    const dataLines = hasHeader ? lines.slice(1) : lines;
    rows = dataLines.map(line => {
      const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
      return { email: parts[0], name: parts[1] || null, frequency: parts[2] || defaultFreq };
    });
  } else {
    rows = rawSubs.map(s => ({ email: s.email, name: s.name || null, frequency: s.frequency || defaultFreq }));
  }

  const validFreqs = ['daily', 'weekly', 'monthly'];
  let imported = 0, skipped = 0, suppressed = 0, errors = [];

  for (const row of rows) {
    if (!row.email || !row.email.includes('@')) { errors.push({ email: row.email, reason: 'invalid email' }); continue; }
    const freq = validFreqs.includes(row.frequency) ? row.frequency : 'weekly';

    try {
      if (await isSuppressed(row.email)) { suppressed++; continue; }

      const result = await pool.query(
        `INSERT INTO newsletter_subscribers
           (email, name, frequency, source_site, gdpr_consent, gdpr_at, status, confirmed, confirmed_at)
         VALUES ($1,$2,$3,$4,$5,NOW(),'active',true,NOW())
         ON CONFLICT (email) DO UPDATE SET
           status = CASE WHEN newsletter_subscribers.status IN ('unsubscribed','pending','deleted')
                         THEN 'active' ELSE newsletter_subscribers.status END,
           confirmed = true,
           confirmed_at = COALESCE(newsletter_subscribers.confirmed_at, NOW()),
           frequency = EXCLUDED.frequency,
           source_site = EXCLUDED.source_site
         WHERE newsletter_subscribers.deleted_at IS NULL
         RETURNING id, (xmax = 0) AS inserted`,
        [row.email, row.name, freq, source_site, gdpr_consent]
      );

      if (result.rows.length) {
        await gdprLog(row.email, result.rows[0].id, 'import', req, { source_site });
        imported++;
      } else {
        skipped++;
      }
    } catch (e) {
      errors.push({ email: row.email, reason: e.message });
    }
  }

  res.json({ imported, skipped, suppressed, errors, total: rows.length });
});

// ── GET /api/newsletter/track/open/:queueId/:subscriberId/:token ─────────────
router.get('/track/open/:queueId/:subscriberId/:token', (req, res) => {
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.end(TRACKING_PIXEL);

  const { queueId, subscriberId, token } = req.params;
  if (token !== trackToken(queueId, subscriberId)) return;

  pool.query(
    `INSERT INTO newsletter_events (queue_id, subscriber_id, event_type, ip, ua)
     VALUES ($1,$2,'open',$3,$4) ON CONFLICT (queue_id, subscriber_id, event_type) DO NOTHING`,
    [queueId, subscriberId, req.ip, req.headers['user-agent']]
  ).catch(() => {});
});

// ── GET /api/newsletter/analytics ────────────────────────────────────────────
router.get('/analytics', async (req, res) => {
  try {
    const [growth, sends, statusBreakdown, sources, freqBreakdown] = await Promise.all([
      pool.query(`
        SELECT TO_CHAR(DATE_TRUNC('month', created_at AT TIME ZONE 'Europe/Athens'), 'YYYY-MM') AS month,
               COUNT(*) FILTER (WHERE action='subscribe')   AS subscribed,
               COUNT(*) FILTER (WHERE action='unsubscribe') AS unsubscribed,
               COUNT(*) FILTER (WHERE action='confirm')     AS confirmed
        FROM gdpr_log
        WHERE created_at > NOW() - INTERVAL '12 months'
        GROUP BY month ORDER BY month
      `),
      pool.query(`
        SELECT q.id, q.type, q.subject, q.sent_at, q.sent_count, q.failed_count,
               COUNT(e.id)                    AS opens,
               COUNT(DISTINCT e.subscriber_id) AS unique_opens
        FROM newsletter_queue q
        LEFT JOIN newsletter_events e ON e.queue_id = q.id AND e.event_type = 'open'
        WHERE q.status = 'sent'
        GROUP BY q.id ORDER BY q.sent_at DESC LIMIT 30
      `),
      pool.query(`
        SELECT status, COUNT(*) AS count
        FROM newsletter_subscribers WHERE deleted_at IS NULL
        GROUP BY status ORDER BY count DESC
      `),
      pool.query(`
        SELECT COALESCE(source_site, 'unknown') AS site, COUNT(*) AS count
        FROM newsletter_subscribers WHERE status='active' AND deleted_at IS NULL
        GROUP BY site ORDER BY count DESC
      `),
      pool.query(`
        SELECT frequency, COUNT(*) AS count
        FROM newsletter_subscribers WHERE status='active' AND deleted_at IS NULL
        GROUP BY frequency
      `),
    ]);
    res.json({
      growth: growth.rows,
      sends: sends.rows,
      statusBreakdown: statusBreakdown.rows,
      sources: sources.rows,
      freqBreakdown: freqBreakdown.rows,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/newsletter/stats ─────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [subs, queue, sources] = await Promise.all([
      pool.query(`SELECT
        COUNT(*) FILTER (WHERE status='active')        AS active,
        COUNT(*) FILTER (WHERE status='unsubscribed')  AS unsubscribed,
        COUNT(*) FILTER (WHERE status='bounced')       AS bounced,
        COUNT(*) FILTER (WHERE status='complained')    AS complained,
        COUNT(*) FILTER (WHERE frequency='daily')      AS daily,
        COUNT(*) FILTER (WHERE frequency='weekly')     AS weekly,
        COUNT(*) FILTER (WHERE frequency='monthly')    AS monthly
        FROM newsletter_subscribers WHERE deleted_at IS NULL`),
      pool.query(`SELECT type, status, COUNT(*) AS count, MAX(sent_at) AS last_sent
        FROM newsletter_queue GROUP BY type, status ORDER BY type, status`),
      pool.query(`SELECT source_site, COUNT(*) AS count
        FROM newsletter_subscribers WHERE status='active'
        GROUP BY source_site ORDER BY count DESC`),
    ]);
    res.json({
      subscribers: subs.rows[0],
      queue: queue.rows,
      sources: sources.rows,
    });
  } catch (err) { res.status(500).json({ error: 'Stats failed' }); }
});

// ── GET /api/newsletter/subscribers ──────────────────────────────────────────
router.get('/subscribers', async (req, res) => {
  const { status, site, limit = 100, offset = 0 } = req.query;
  let where = `WHERE deleted_at IS NULL`;
  const params = [];
  if (status) { params.push(status); where += ` AND status=$${params.length}`; }
  if (site)   { params.push(site);   where += ` AND source_site=$${params.length}`; }
  params.push(limit, offset);
  try {
    const { rows } = await pool.query(
      `SELECT id, email, name, frequency, status, source_site,
              categories, subscribed_at, last_sent_at, confirmed, gdpr_consent
       FROM newsletter_subscribers ${where}
       ORDER BY subscribed_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ subscribers: rows });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch subscribers' }); }
});

router.get('/subscribers/emails', async (req, res) => {
  const { site } = req.query;
  try {
    let q = "SELECT email FROM newsletter_subscribers WHERE status = 'active' AND deleted_at IS NULL";
    const params = [];
    if (site) { q += " AND source_site = $1"; params.push(site); }
    q += " ORDER BY subscribed_at DESC";
    const { rows } = await pool.query(q, params);
    res.json({ emails: rows.map(r => r.email), count: rows.length });
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ── GET /api/newsletter/subscriber/:id ───────────────────────────────────────
router.get('/subscriber/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, email, name, firstname, lastname, frequency, status, source_site,
            categories, cities, keywords, language, country,
            confirmed, confirmed_at, subscribed_at, last_sent_at, unsubscribed_at,
            gdpr_consent, gdpr_at, gdpr_ip, user_id
     FROM newsletter_subscribers WHERE id=$1 AND deleted_at IS NULL`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json({ subscriber: rows[0] });
});

// ── PUT /api/newsletter/subscriber/:id ───────────────────────────────────────
router.put('/subscriber/:id', async (req, res) => {
  const { name, firstname, lastname, frequency, status, source_site,
          language, country, categories, cities, keywords, gdpr_consent } = req.body;
  const validFreqs    = ['daily', 'weekly', 'monthly'];
  const validStatuses = ['active', 'pending', 'unsubscribed', 'bounced', 'complained'];
  if (frequency && !validFreqs.includes(frequency))
    return res.status(400).json({ error: 'Invalid frequency' });
  if (status && !validStatuses.includes(status))
    return res.status(400).json({ error: 'Invalid status' });
  try {
    const { rows } = await pool.query(
      `UPDATE newsletter_subscribers SET
         name        = COALESCE($1, name),
         firstname   = COALESCE($2, firstname),
         lastname    = COALESCE($3, lastname),
         frequency   = COALESCE($4, frequency),
         status      = COALESCE($5, status),
         source_site = COALESCE($6, source_site),
         language    = COALESCE($7, language),
         country     = COALESCE($8, country),
         categories  = COALESCE($9, categories),
         cities      = COALESCE($10, cities),
         keywords    = COALESCE($11, keywords),
         gdpr_consent= COALESCE($12, gdpr_consent),
         unsubscribed_at = CASE WHEN $5='unsubscribed' AND status!='unsubscribed'
                                THEN NOW() ELSE unsubscribed_at END
       WHERE id=$13 AND deleted_at IS NULL
       RETURNING id`,
      [name||null, firstname||null, lastname||null, frequency||null, status||null,
       source_site||null, language||null, country||null,
       categories||null, cities||null, keywords||null,
       gdpr_consent??null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /api/newsletter/subscriber/:id  (hard delete by id, admin only) ────
router.delete('/subscriber/:id', async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE newsletter_subscribers
     SET status='deleted', deleted_at=NOW(), email=CONCAT('deleted_',id,'@deleted')
     WHERE id=$1 AND deleted_at IS NULL RETURNING id`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// ── POST /api/newsletter/broadcast  (custom one-off email blast) ─────────────
router.post('/broadcast', async (req, res) => {
  const { subject, html, recipients, fromName } = req.body;
  if (!subject || !html) return res.status(400).json({ error: 'subject and html required' });
  if (!Array.isArray(recipients) || !recipients.length)
    return res.status(400).json({ error: 'recipients array required' });

  const emails = [...new Set(recipients.map(e => e.trim().toLowerCase()).filter(e => e.includes('@')))];
  if (!emails.length) return res.status(400).json({ error: 'No valid email addresses' });

  let sent = 0, failed = 0, suppressed = 0;
  const errors = [];

  const { rows: subRows } = await pool.query(
    `SELECT email, unsubscribe_token FROM newsletter_subscribers WHERE email = ANY($1) AND deleted_at IS NULL`,
    [emails]
  );
  const tokenMap = {};
  for (const row of subRows) tokenMap[row.email] = row.unsubscribe_token;

  for (const email of emails) {
    try {
      const token = tokenMap[email] || '';
      const personalHtml = html
        .replace(/\{\{unsubscribe_url\}\}/g, token)
        .replace(/\{\{name\}\}/g, '');
      await sendViaSMTP({ to: email, subject, html: personalHtml, fromName });
      sent++;
    } catch (e) {
      failed++;
      errors.push({ email, reason: e.message });
    }
    await new Promise(r => setTimeout(r, 75));
  }

  res.json({ success: true, total: emails.length, sent, failed, suppressed, errors });
});


// ── GET /api/newsletter/queue  (recent sends for admin page) ─────────────────
router.get('/queue', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  try {
    const { rows } = await pool.query(
      `SELECT id, type AS frequency, subject, html_body, status, sent_count, failed_count, sent_at, created_at
       FROM newsletter_queue ORDER BY COALESCE(sent_at, created_at) DESC LIMIT $1`,
      [limit]
    );
    res.json({ queue: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ── Newsletter Ads CRUD ────────────────────────────────────────────────────────
router.get('/ads', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, headline, body, image_url, cta_label, cta_url, accent_color, bg_color, status, created_at
       FROM newsletter_ads ORDER BY created_at DESC`
    );
    res.json({ ads: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/ads', async (req, res) => {
  const { name, headline, body, image_url, cta_label, cta_url, accent_color, bg_color } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO newsletter_ads (name, headline, body, image_url, cta_label, cta_url, accent_color, bg_color)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, headline||null, body||null, image_url||null,
       cta_label||'Learn More', cta_url||null,
       accent_color||'#4f46e5', bg_color||'#f0f4ff']
    );
    res.json({ ad: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/ads/:id', async (req, res) => {
  const { name, headline, body, image_url, cta_label, cta_url, accent_color, bg_color, status } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE newsletter_ads SET
        name        = COALESCE($1, name),
        headline    = COALESCE($2, headline),
        body        = COALESCE($3, body),
        image_url   = COALESCE($4, image_url),
        cta_label   = COALESCE($5, cta_label),
        cta_url     = COALESCE($6, cta_url),
        accent_color= COALESCE($7, accent_color),
        bg_color    = COALESCE($8, bg_color),
        status      = COALESCE($9, status),
        updated_at  = NOW()
       WHERE id=$10 RETURNING *`,
      [name||null, headline||null, body||null, image_url||null,
       cta_label||null, cta_url||null, accent_color||null, bg_color||null,
       status||null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ ad: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/ads/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM newsletter_ads WHERE id=$1 RETURNING id`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
