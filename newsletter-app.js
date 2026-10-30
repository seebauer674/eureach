'use strict';
require('dotenv').config();
const express = require('express');
const app     = express();
const path    = require('path');
const fs      = require('fs');

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.set('trust proxy', 1);

// Inject req.session from eureach's file-based sessions (used by nl-lists requireAuth)
const SESSIONS_FILE = path.join(__dirname, 'data', 'sessions.json');
const USERS_FILE    = path.join(__dirname, 'data', 'users.json');

function parseCookies(h) {
  const out = {};
  (h || '').split(';').forEach(p => {
    const [k, ...v] = p.trim().split('=');
    if (k) out[k.trim()] = decodeURIComponent(v.join('=').trim());
  });
  return out;
}

app.use((req, _res, next) => {
  try {
    const cookies  = parseCookies(req.headers.cookie);
    const sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    const session  = sessions.find(s => s.token === cookies.session && s.expiresAt > Date.now());
    if (session) {
      const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      const user  = users.find(u => u.id === session.userId) || null;
      req.session = { userId: user ? user.id : null, user };
    } else {
      req.session = { userId: null, user: null };
    }
  } catch {
    req.session = { userId: null, user: null };
  }
  next();
});

// newsletter.js first — public routes (subscribe, confirm, unsubscribe, track, stats, subscribers)
app.use('/api/newsletter', require('./routes/newsletter'));
// nl-lists second — authenticated list management (lists, import, contacts, broadcast, presets, ai-generate)
app.use('/api/newsletter', require('./routes/nl-lists'));

module.exports = app;
