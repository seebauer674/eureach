'use strict';
const nodemailer = require('nodemailer');
const { Pool }   = require('pg');
const { checkAndIncrement } = require('./emailLimit');

const pool = new Pool({ connectionString: process.env.AGORA_DB_URL });

const transport = nodemailer.createTransport({
  host:   '127.0.0.1',
  port:   25,
  secure: false,
  tls:    { rejectUnauthorized: false },
});

async function isSuppressed(email) {
  try {
    const { rows } = await pool.query(
      'SELECT 1 FROM ses_suppressions WHERE email=$1 LIMIT 1',
      [email.toLowerCase()]
    );
    return rows.length > 0;
  } catch { return false; }
}

async function sendEmail({ to, subject, html, text, fromName }) {
  if (!checkAndIncrement()) return { blocked: true, messageId: null };
  if (await isSuppressed(to)) {
    console.warn('[email] Suppressed: ' + to);
    return { suppressed: true, messageId: null };
  }
  const from = ' + (fromName || eureach.eu) +  <hello@eureach.eu>';
  const info  = await transport.sendMail({ from, to, subject, html, text });
  return { messageId: info.messageId };
}

module.exports = { sendEmail, isSuppressed };
