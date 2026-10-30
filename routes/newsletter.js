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



// ── GET /api/newsletter/upcoming  (next 7 days + welcome) ───────────────────
router.get('/upcoming', async (req, res) => {
  try {
    const now  = new Date();
    const days = [];

    // Next 7 daily sends (01:00 server time)
    for (let i = 1; i <= 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      d.setHours(1, 0, 0, 0);
      const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
      const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      days.push({
        type:        'daily',
        label:       'Daily Newsletter',
        weekday,
        scheduled_at: d.toISOString(),
        date_label:  `${weekday}, ${dateStr}`,
        template_slug: 'growth-tips-el',
      });
    }

    // Welcome (evergreen — sent to every new subscriber)
    days.unshift({
      type:        'welcome',
      label:       'Welcome Email',
      weekday:     'Evergreen',
      scheduled_at: null,
      date_label:  'On every new signup',
      template_slug: 'welcome',
    });

    // Fetch templates for preview
    const slugs = [...new Set(days.map(d => d.template_slug))];
    const { rows: tpls } = await pool.query(
      `SELECT slug, name, html_body FROM email_templates WHERE slug = ANY($1)`,
      [slugs]
    );
    const tplMap = {};
    for (const t of tpls) tplMap[t.slug] = t;

    const result = days.map(d => ({
      ...d,
      template_name: tplMap[d.template_slug]?.name || d.template_slug,
      preview_html:  tplMap[d.template_slug]?.html_body || null,
    }));

    res.json({ upcoming: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Newsletter Ads CRUD ────────────────────────────────────────────────────────
router.get('/ads', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, headline, body, image_url, cta_label, cta_url, accent_color, bg_color, status, placement, created_at
       FROM newsletter_ads ORDER BY created_at DESC`
    );
    res.json({ ads: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/ads', async (req, res) => {
  const { name, headline, body, image_url, cta_label, cta_url, accent_color, bg_color, placement } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO newsletter_ads (name, headline, body, image_url, cta_label, cta_url, accent_color, bg_color, placement)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name, headline||null, body||null, image_url||null,
       cta_label||'Learn More', cta_url||null,
       accent_color||'#4f46e5', bg_color||'#f0f4ff', placement||'newsletter']
    );
    res.json({ ad: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/ads/:id', async (req, res) => {
  const { name, headline, body, image_url, cta_label, cta_url, accent_color, bg_color, status, placement } = req.body;
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
        placement   = COALESCE($10, placement),
        updated_at  = NOW()
       WHERE id=$11 RETURNING *`,
      [name||null, headline||null, body||null, image_url||null,
       cta_label||null, cta_url||null, accent_color||null, bg_color||null,
       status||null, placement||null, req.params.id]
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


router.post('/ads/ai-copy', async (req, res) => {
  const { headline, placement, name } = req.body;
  if (!headline && !name) return res.status(400).json({ error: 'headline or name required' });
  const placementLabels = {
    newsletter: 'email newsletter sidebar',
    kinkdate:   'KinkDate.com website banner',
    facebook:   'Facebook ad',
    linkedin:   'LinkedIn sponsored post',
    reel:       'Instagram/Facebook Reel',
  };
  const where = placementLabels[placement] || placement || 'ad';
  const prompt = `Write 2 short, punchy sentences of ad body copy for a ${where}. Ad name: "${name || headline}". Headline: "${headline || name}". Be concise and persuasive. Return only the body text, no quotes, no labels.`;
  try {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return res.status(500).json({ error: 'AI not configured' });
    const https = require('https');
    const payload = JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 120,
      temperature: 0.8,
    });
    const text = await new Promise((resolve, reject) => {
      const r = https.request({
        hostname: 'api.groq.com', path: '/openai/v1/chat/completions', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + groqKey, 'Content-Length': Buffer.byteLength(payload) }
      }, resp => {
        let d = '';
        resp.on('data', c => d += c);
        resp.on('end', () => { try { resolve(JSON.parse(d).choices?.[0]?.message?.content || ''); } catch { reject(new Error('parse error')); } });
      });
      r.on('error', reject);
      r.write(payload); r.end();
    });
    res.json({ text });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


/* ── Ad Placements ─────────────────────────────────────────── */
const AD_PLACEMENT_COST = 40;
const PAID_PLANS_AP = ['paid','beginners','starter','pro','agency'];
const path_ap = require('path');
const fs_ap   = require('fs');
const USERS_FILE_AP = path_ap.join(__dirname, '../data/users.json');
const SESSIONS_FILE_AP = path_ap.join(__dirname, '../data/sessions.json');

function parseCookies_ap(h) {
  const out = {};
  (h || '').split(';').forEach(p => { const [k,...v]=p.trim().split('='); if(k) out[k.trim()]=decodeURIComponent(v.join('=').trim()); });
  return out;
}
function getUser_ap(req) {
  if (req.session && req.session.user) return req.session.user;
  try {
    const cookies  = parseCookies_ap(req.headers.cookie);
    const sessions = JSON.parse(fs_ap.readFileSync(SESSIONS_FILE_AP, 'utf8'));
    const session  = sessions.find(s => s.token === cookies.session && s.expiresAt > Date.now());
    if (!session) return null;
    const users = JSON.parse(fs_ap.readFileSync(USERS_FILE_AP, 'utf8'));
    return users.find(u => u.id === session.userId) || null;
  } catch { return null; }
}

// POST /api/newsletter/ads/:id/place — user requests placement, deducts 40 credits
router.post('/ads/:id/place', async (req, res) => {
  const user = getUser_ap(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  if (!PAID_PLANS_AP.includes(user.plan) && user.role !== 'admin')
    return res.status(403).json({ error: 'Paid plan required to place ads' });

  const { scheduled_date } = req.body;
  if (!scheduled_date) return res.status(400).json({ error: 'scheduled_date required' });
  const adId = parseInt(req.params.id);

  try {
    // Check ad exists and belongs to user (or admin)
    const { rows: adRows } = await pool.query('SELECT id FROM newsletter_ads WHERE id=$1', [adId]);
    if (!adRows.length) return res.status(404).json({ error: 'Ad not found' });

    // Deduct credits
    const users = JSON.parse(fs_ap.readFileSync(USERS_FILE_AP, 'utf8'));
    const idx   = users.findIndex(u => u.id === user.id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });
    const u = users[idx];
    if (u.role !== 'admin') {
      const creditsLeft = (u.creditsLeft != null ? u.creditsLeft : (u.creditsMax || 0));
      if (creditsLeft < AD_PLACEMENT_COST)
        return res.status(403).json({ error: 'insufficient_credits', creditsLeft, cost: AD_PLACEMENT_COST });
      users[idx].creditsLeft = creditsLeft - AD_PLACEMENT_COST;
      if (!users[idx].creditLog) users[idx].creditLog = [];
      users[idx].creditLog.unshift({ reason: 'Ad placement request', delta: -AD_PLACEMENT_COST, balance: users[idx].creditsLeft, createdAt: new Date().toISOString() });
      fs_ap.writeFileSync(USERS_FILE_AP, JSON.stringify(users, null, 2));
    }

    const { rows } = await pool.query(
      `INSERT INTO ad_placements (ad_id, user_id, user_email, scheduled_date, status, credits_charged)
       VALUES ($1,$2,$3,$4,'pending',$5) RETURNING *`,
      [adId, user.id, user.email, scheduled_date, user.role === 'admin' ? 0 : AD_PLACEMENT_COST]
    );
    res.json({ placement: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/newsletter/ads/:id/placements — list placements for an ad
router.get('/ads/:id/placements', async (req, res) => {
  const user = getUser_ap(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { rows } = await pool.query(
      'SELECT * FROM ad_placements WHERE ad_id=$1 ORDER BY created_at DESC', [req.params.id]
    );
    res.json({ placements: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/newsletter/admin/placements — admin: all pending placements
router.get('/admin/placements', async (req, res) => {
  const user = getUser_ap(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { rows } = await pool.query(
      `SELECT p.*, a.name as ad_name, a.placement, a.headline FROM ad_placements p
       JOIN newsletter_ads a ON a.id=p.ad_id ORDER BY p.created_at DESC`
    );
    res.json({ placements: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/newsletter/admin/placements/:id — admin: approve/reject
router.put('/admin/placements/:id', async (req, res) => {
  const user = getUser_ap(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { status, admin_note } = req.body;
  if (!['approved','rejected'].includes(status)) return res.status(400).json({ error: 'status must be approved or rejected' });
  try {
    const { rows } = await pool.query(
      'UPDATE ad_placements SET status=$1, admin_note=$2, updated_at=NOW() WHERE id=$3 RETURNING *',
      [status, admin_note || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ placement: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});



// POST /api/newsletter/templates/ai-write — admin: generate template HTML from description
router.post('/templates/ai-write', async (req, res) => {
  const user = await getUser_ap(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { description, name, language, category } = req.body;
  if (!description) return res.status(400).json({ error: 'description required' });
  const langLabel = language === 'el' ? 'Greek' : language === 'de' ? 'German' : 'English';
  const prompt = `You are an expert email template designer. Write a complete, professional HTML email template body based on this description:

"${description}"

Template name: ${name || 'Newsletter'}
Language: ${langLabel}
Category: ${category || 'marketing'}

Requirements:
- Write in ${langLabel}
- Responsive HTML using inline styles and tables (email-safe)
- Dark header with brand colors (#1e1b4b / #6366f1)
- Clean white content area with proper padding
- Include a clear CTA button
- Include {{firstName}}, {{email}}, {{plan}} placeholders where natural
- Include {{ADS_SIDEBAR}} as a right sidebar column if it's a marketing/digest email
- Return ONLY the HTML, no explanation, no markdown fences`;

  try {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return res.status(500).json({ error: 'AI not configured' });
    const https = require('https');
    const payload = JSON.stringify({
      model: 'qwen/qwen3.8-27b',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 3000,
      temperature: 0.7,
    });
    const html = await new Promise((resolve, reject) => {
      const r = https.request({
        hostname: 'api.groq.com', path: '/openai/v1/chat/completions', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + groqKey, 'Content-Length': Buffer.byteLength(payload) }
      }, resp => {
        let d = '';
        resp.on('data', c => d += c);
        resp.on('end', () => {
          try {
            let text = JSON.parse(d).choices?.[0]?.message?.content || '';
            // Strip markdown fences if model adds them
            text = text.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
            resolve(text);
          } catch { reject(new Error('parse error')); }
        });
      });
      r.on('error', reject);
      r.write(payload); r.end();
    });
    res.json({ html });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/newsletter/templates/:slug — admin: update template html_body
router.put('/templates/:slug', async (req, res) => {
  const user = await getUser_ap(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { html_body } = req.body;
  if (!html_body) return res.status(400).json({ error: 'html_body required' });
  try {
    const { rowCount } = await pool.query(
      `UPDATE email_templates SET html_body = $1 WHERE slug = $2`,
      [html_body, req.params.slug]
    );
    if (!rowCount) return res.status(404).json({ error: 'Template not found' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
