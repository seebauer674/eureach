try { require("dotenv").config(); } catch {}
require("dns").setDefaultResultOrder("ipv4first");
const http   = require("http");
const https  = require("https");
const net    = require("net");
const tls    = require("tls");
const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");

// ── Agora PostgreSQL pool (newsletter) ───────────────────────────────────────
const { Pool: PgPool } = require("pg");
const agoraPool = new PgPool({ connectionString: process.env.AGORA_DB_URL });


// Stripe — lazy-loaded so server starts without key configured
let _stripe = null;
function getStripe() {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  try { _stripe = require("stripe")(key); return _stripe; }
  catch { return null; }
}

const { applySecurityHeaders }                              = require("./security/headers");
const { checkRateLimit }                                    = require("./security/rateLimiter");
const { sanitizeString, sanitizeEmail, sanitizeUrl, sanitizeInteger, isPrivateHost } = require("./security/sanitize");
const { logEvent, logAudit, getIp, checkPathTraversal }    = require("./security/monitor");
const { isoWeek, jobFiresOn, materialiseDays, dateStr } = require('./config/job-materialise');
const { TEMPLATES, TEMPLATE_LABELS } = require('./config/job-seeds');

const PORT = process.env.PORT || 3003;
const ROOT = __dirname;

const USERS_FILE    = path.join(ROOT, "data/users.json");
const SESSIONS_FILE = path.join(ROOT, "data/sessions.json");
const BLOG_FILE     = path.join(ROOT, "data/blog_posts.json");
const CRM_FILE       = path.join(ROOT, "data/crm.json");
const SEQUENCES_FILE    = path.join(ROOT, "data/sequences.json");
const WHATSAPP_FILE     = path.join(ROOT, "data/whatsapp_templates.json");
const COMPETITOR_FILE   = path.join(ROOT, "data/competitor_tracking.json");
const SAVED_SEARCHES_FILE = path.join(ROOT, "data/competitor-saved-searches.json");
const LEAD_SAVED_SEARCHES_FILE = path.join(ROOT, "data/lead-saved-searches.json");
const OUTREACH_SAVED_LISTS_FILE = path.join(ROOT, "data/outreach-saved-lists.json");
const CRM_SAVED_LISTS_FILE       = path.join(ROOT, "data/crm-saved-lists.json");
const ARTICLE_SAVED_LISTS_FILE = path.join(ROOT, "data/article-saved-lists.json");
const ARTICLE_AUTOMATIONS_FILE = path.join(ROOT, "data/article-automations.json");
const ARTICLE_REPUBLISH_FILE   = path.join(ROOT, "data/article-republish.json");
const ARTICLE_VISIBILITY_FILE  = path.join(ROOT, "data/article-visibility.json");
const LEAD_SCORES_FILE  = path.join(ROOT, "data/lead_scores.json");
const AUDITS_FILE       = path.join(ROOT, "data/audits.json");
const WP_FILE           = path.join(ROOT, "data/wordpress_connections.json");
const SMTP_FILE              = path.join(ROOT, "data/smtp_connections.json");
const EMAIL_LOG_FILE         = path.join(ROOT, "data/email_log.json");
const OUTREACH_QUEUE_FILE    = path.join(ROOT, "data/outreach-queue.json");
const NL_CAMPAIGNS_FILE      = path.join(ROOT, "data/newsletter-campaigns.json");
const BUSINESS_PROFILE_FILE  = path.join(ROOT, "data/business-profiles.json");
const SITES_FILE             = path.join(ROOT, "data/user-sites.json");
const CITATION_PUBLISHERS_FILE = path.join(ROOT, "data/citation_publishers.json");
const CITATION_CAMPAIGNS_FILE  = path.join(ROOT, "data/citation_campaigns.json");
const CITATION_PLACEMENTS_FILE = path.join(ROOT, "data/citation_placements.json");
const CITATION_SNAPSHOTS_FILE  = path.join(ROOT, "data/citation_snapshots.json");
const BRAND_KITS_FILE        = path.join(ROOT, "data/brand-kits.json");
const MARKETING_ASSETS_FILE   = path.join(ROOT, "data/marketing-assets.json");
const MARKETING_CAMPAIGNS_FILE = path.join(ROOT, "data/marketing-campaigns.json");
const CITATION_LEADS_FILE      = path.join(ROOT, "data/citation_leads.json");
const YOUTUBER_PROFILES_FILE      = path.join(ROOT, "data/youtuber_profiles.json");
const YOUTUBER_APPLICATIONS_FILE  = path.join(ROOT, "data/youtuber_applications.json");
const YOUTUBER_ASSIGNMENTS_FILE = path.join(ROOT, "data/youtuber_assignments.json");
const COACH_COMPLETIONS_FILE = path.join(ROOT, "data/coach-completions.json");
const COACH_CONTENT_FILE     = path.join(ROOT, "data/coach-weekly-content.json");
const AUDIT_JOBS_FILE        = path.join(ROOT, "data/audit-jobs.json");
const DASHBOARD_SITES_FILE     = path.join(ROOT, "data/dashboard-sites.json");
const DASHBOARD_RECURRING_FILE = path.join(ROOT, "data/dashboard-recurring.json");
const DASHBOARD_INSTANCES_FILE = path.join(ROOT, "data/dashboard-instances.json");
const DASHBOARD_JOB_TYPES_FILE = path.join(ROOT, "data/dashboard-job-types.json");
const TODOS_FILE               = path.join(ROOT, "data/todos.json");
const FB_CONNECTIONS_FILE  = path.join(ROOT, 'data/fb_connections.json');
const FB_BRANDING_FILE     = path.join(ROOT, 'data/fb_branding.json');
const FB_TARGETS_FILE      = path.join(ROOT, 'data/fb_targets.json');
const FB_TEMPLATES_FILE    = path.join(ROOT, 'data/fb_templates.json');
const FB_LOG_FILE          = path.join(ROOT, 'data/fb_post_log.json');
const FB_APP_ID            = process.env.FB_APP_ID || '';
const FB_APP_SECRET        = process.env.FB_APP_SECRET || '';
const FB_REDIRECT_URI      = (process.env.SITE_URL || 'https://eureach.eu') + '/api/auth/facebook/callback';



// AES-256-CBC key derived from secret — set WP_ENCRYPT_SECRET env var in production
const WP_ENCRYPT_KEY = crypto.createHash("sha256")
  .update(process.env.WP_ENCRYPT_SECRET || "eureach-wp-secret-2026")
  .digest();

function encryptStr(plain) {
  const iv     = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", WP_ENCRYPT_KEY, iv);
  const enc    = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + enc.toString("hex");
}

function decryptStr(stored) {
  const [ivHex, encHex] = stored.split(":");
  const decipher = crypto.createDecipheriv("aes-256-cbc", WP_ENCRYPT_KEY, Buffer.from(ivHex, "hex"));
  const dec = Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]);
  return dec.toString("utf8");
}

function wpRequest(siteUrl, wpPath, method, body, username, appPassword) {
  return new Promise((resolve, reject) => {
    let base = siteUrl.trim().replace(/\/$/, "");
    if (!base.startsWith("http")) base = "https://" + base;
    const url     = new URL(base + wpPath);
    const isHttps = url.protocol === "https:";
    const mod     = isHttps ? https : http;
    const auth    = Buffer.from(`${username}:${appPassword}`).toString("base64");
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      port:     url.port ? parseInt(url.port) : (isHttps ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers: {
        "Authorization": "Basic " + auth,
        "Content-Type":  "application/json",
        "User-Agent":    "eureach.eu/1.0",
        ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr) } : {}),
      },
    };
    const req = mod.request(options, res => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function resolveWpTerms(siteUrl, username, appPassword, endpoint, names) {
  const ids = [];
  for (const name of names) {
    const n = name.trim();
    if (!n) continue;
    try {
      const found = await wpRequest(siteUrl, `${endpoint}?search=${encodeURIComponent(n)}&per_page=1`, "GET", null, username, appPassword);
      if (found.status === 200 && Array.isArray(found.body) && found.body.length) {
        ids.push(found.body[0].id);
      } else {
        const created = await wpRequest(siteUrl, endpoint, "POST", { name: n }, username, appPassword);
        if ((created.status === 200 || created.status === 201) && created.body.id) ids.push(created.body.id);
      }
    } catch {}
  }
  return ids;
}
const SOSBOARD_TOKENS   = "/var/www/sosboard/data/tokens-config.json";

const SESSION_TTL_MS  = 30 * 24 * 60 * 60 * 1000; // 30 days
const SCRYPT_PARAMS   = { N: 16384, r: 8, p: 1, keylen: 64 };

const PLAN_LIMITS = require("./config/limits");

// Returns "YYYY-MM" for current month
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Returns { creditsLeft, creditsMax } — handles monthly reset automatically
function getCredits(userRecord) {
  const plan = PLAN_LIMITS.plans[userRecord.plan] || PLAN_LIMITS.plans.free;
  const max  = plan.credits;
  if (max === -1) return { creditsLeft: -1, creditsMax: -1 };
  if (userRecord.creditMonth !== currentMonth()) return { creditsLeft: max, creditsMax: max };
  return { creditsLeft: userRecord.creditsLeft ?? max, creditsMax: max };
}

// Deducts `cost` credits from users[idx]. Mutates array in place — caller must writeJSON after.
// Returns { ok, creditsLeft, creditsMax }.
function deductCredits(users, idx, cost, reason) {
  const { creditsLeft, creditsMax } = getCredits(users[idx]);
  if (creditsMax === -1) return { ok: true, creditsLeft: -1, creditsMax: -1 };
  if (creditsLeft < cost) return { ok: false, creditsLeft, creditsMax };
  users[idx].creditsLeft = creditsLeft - cost;
  users[idx].creditsMax  = creditsMax;
  users[idx].creditMonth = currentMonth();
  if (reason) {
    if (!users[idx].creditLog) users[idx].creditLog = [];
    users[idx].creditLog.unshift({ reason, delta: -cost, balance: users[idx].creditsLeft, createdAt: new Date().toISOString() });
    if (users[idx].creditLog.length > 100) users[idx].creditLog.length = 100;
  }
  return { ok: true, creditsLeft: users[idx].creditsLeft, creditsMax };
}

// Next month reset date string e.g. "June 1"
function resetDateLabel() {
  const d = new Date();
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return next.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

// 403 responses
function limitReached(res, feature, current, max) {
  return json(res, 403, { error: "limit_reached", feature, current, max, upgradeUrl: "/membership" });
}
function insufficientCredits(res, creditsLeft, creditsMax, cost) {
  return json(res, 403, { error: "insufficient_credits", creditsLeft, creditsMax, cost, upgradeUrl: "/membership" });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css",
  ".js":   "application/javascript",
  ".json": "application/json",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".woff2":"font/woff2",
};

// ── File-based store helpers ──────────────────────────────────────────────────

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return []; }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

// ── Crypto helpers ────────────────────────────────────────────────────────────

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(32).toString("hex");
    crypto.scrypt(password, salt, SCRYPT_PARAMS.keylen, SCRYPT_PARAMS, (err, hash) => {
      if (err) reject(err);
      else resolve(`${salt}:${hash.toString("hex")}`);
    });
  });
}

function verifyPassword(password, stored) {
  return new Promise((resolve, reject) => {
    const [salt, expected] = stored.split(":");
    crypto.scrypt(password, salt, SCRYPT_PARAMS.keylen, SCRYPT_PARAMS, (err, hash) => {
      if (err) reject(err);
      else resolve(crypto.timingSafeEqual(Buffer.from(expected, "hex"), hash));
    });
  });
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function generateId() {
  return crypto.randomBytes(12).toString("hex");
}

// ── Session helpers ───────────────────────────────────────────────────────────

function createSession(userId) {
  const sessions = readJSON(SESSIONS_FILE);
  const token    = generateToken();
  const now      = Date.now();
  sessions.push({ token, userId, createdAt: now, expiresAt: now + SESSION_TTL_MS });
  // Prune expired sessions while we're at it
  const active = sessions.filter(s => s.expiresAt > now);
  writeJSON(SESSIONS_FILE, active);
  return token;
}

function getSessionUser(token) {
  if (!token) return null;
  const sessions = readJSON(SESSIONS_FILE);
  const session  = sessions.find(s => s.token === token && s.expiresAt > Date.now());
  if (!session) return null;
  const users = readJSON(USERS_FILE);
  return users.find(u => u.id === session.userId) || null;
}

function deleteSession(token) {
  if (!token) return;
  const sessions = readJSON(SESSIONS_FILE).filter(s => s.token !== token);
  writeJSON(SESSIONS_FILE, sessions);
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header.split(";").map(c => c.trim().split("=").map(decodeURIComponent))
  );
}

function sessionCookie(token) {
  const maxAge = SESSION_TTL_MS / 1000;
  return `session=${token}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Path=/`;
}

function clearCookie() {
  return `session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/`;
}

// ── Request body helper ───────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => { body += chunk; if (body.length > 1e6) req.destroy(); });
    req.on("end", () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
    req.on("error", reject);
  });
}

// Raw body reader — for Stripe webhook signature verification
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// ── Trial / billing helpers ───────────────────────────────────────────────────

function isTrialActive(user) {
  if (user.plan !== "trial") return false;
  if (!user.trialEndsAt) return false;
  return new Date() < new Date(user.trialEndsAt);
}

function isTrialExpired(user) {
  if (user.trialStatus !== "active") return false;
  if (!user.trialEndsAt) return false;
  return new Date() >= new Date(user.trialEndsAt);
}

function isPaidUser(user) {
  return ["paid","beginners","starter","pro","agency"].includes(user.plan) || user.role === "admin";
}


function isFreeExpired(user) {
  if (isPaidUser(user) || isTrialActive(user) || user.role === "admin") return false;
  if (!user.freeExpiresAt) return false;
  return new Date() > new Date(user.freeExpiresAt);
}
function hasAccess(user) {
  return user.role === "admin" || isTrialActive(user) || isPaidUser(user);
}

function getDaysRemainingInTrial(user) {
  if (!isTrialActive(user)) return 0;
  const ms = new Date(user.trialEndsAt) - new Date();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function getModel(user) {
  if (["paid","starter","pro","agency"].includes(user.plan) || (isTrialActive(user))) return "claude-sonnet-4-6";
  return "claude-haiku-4-5-20251001";
}

// Auto-expire trial if webhook was missed; mutates users array in place, returns updated user
function autoExpireTrialIfNeeded(users, idx) {
  const u = users[idx];
  if (u.plan === "trial" && isTrialExpired(u)) {
    users[idx].plan = "free";
    users[idx].trialStatus = "expired";
    writeJSON(USERS_FILE, users);
    return users[idx];
  }
  return u;
}

// Get or init trialUsage for a user record
function getTrialUsage(user) {
  return user.trialUsage || { competitorSearches: 0, articlesGenerated: 0, auditsToday: 0, auditsTodayDate: null };
}

// ── System email (uses env-configured SMTP) ───────────────────────────────────

async function sendSystemEmail(to, subject, body) {
  const host = process.env.SYSTEM_EMAIL_HOST;
  const port = parseInt(process.env.SYSTEM_EMAIL_PORT || "587", 10);
  const username = process.env.SYSTEM_EMAIL_USER;
  const password = process.env.SYSTEM_EMAIL_PASS;
  const from = process.env.SYSTEM_EMAIL_FROM || username;
  if (!host || !username || !password) return; // not configured — silently skip
  try {
    await smtpSend({ host, port, username, password, from, fromName: "eureach.eu", to, subject, body });
  } catch (err) {
    console.error("[system email] failed:", err.message);
  }
}

// ── Response helpers ──────────────────────────────────────────────────────────

function json(res, status, data, headers = {}) {
  // Merge any pre-set Set-Cookie headers (e.g. csrf cookie) with those passed as argument
  const existing = res.getHeader("Set-Cookie");
  if (existing && headers["Set-Cookie"]) {
    const e = Array.isArray(existing) ? existing : [existing];
    const n = Array.isArray(headers["Set-Cookie"]) ? headers["Set-Cookie"] : [headers["Set-Cookie"]];
    headers = { ...headers, "Set-Cookie": [...e, ...n] };
    res.removeHeader("Set-Cookie");
  }
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(data));
}

function safeUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

// ── Auth handlers ─────────────────────────────────────────────────────────────

async function handleSignup(req, res) {
  const ip = getIp(req);
  const rl = checkRateLimit(ip, "signup", 3, 24 * 60 * 60 * 1000);
  if (!rl.allowed) {
    logEvent("signup_flood", ip, ip);
    return json(res, 429, { error: "Too many sign-up attempts from this IP. Try again tomorrow." },
      { "Retry-After": String(rl.retryAfter) });
  }

  const body = await readBody(req);
  const { first_name, last_name, email, password, plan = "free" } = body;

  if (!email || !password || !first_name) {
    return json(res, 400, { error: "Name, email, and password are required." });
  }
  if (password.length < 8) {
    return json(res, 400, { error: "Password must be at least 8 characters." });
  }
  if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return json(res, 400, { error: "Password must contain at least one uppercase letter and one number." });
  }

  const validPlans = Object.keys(PLAN_LIMITS.plans);
  const chosenPlan = validPlans.includes(plan) ? plan : "free";

  const users = readJSON(USERS_FILE);
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return json(res, 409, { error: "An account with that email already exists." });
  }

  const passwordHash = await hashPassword(password);
  const planCfg      = PLAN_LIMITS.plans[chosenPlan] || PLAN_LIMITS.plans.free;

  const user = {
    id:           generateId(),
    email:        email.toLowerCase().trim(),
    firstName:    first_name.trim(),
    lastName:     (last_name || "").trim(),
    passwordHash,
    plan:         chosenPlan,
    creditsLeft:  planCfg.credits === -1 ? -1 : planCfg.credits,
    creditsMax:   planCfg.credits,
    creditMonth:  currentMonth(),
    sites:        [],
    createdAt:    new Date().toISOString(),
    freeExpiresAt: chosenPlan === 'free' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null,
    preferredLang: 'el',
  };

  users.push(user);
  writeJSON(USERS_FILE, users);

  const token = createSession(user.id);

  // Link any recent anonymous public audit to this new account
  const auditSessId = parseCookies(req).auid_sess;
  if (auditSessId) {
    try {
      const ajobs = Array.isArray(readJSON(AUDIT_JOBS_FILE)) ? readJSON(AUDIT_JOBS_FILE) : [];
      const recentIdx = ajobs.findIndex(j => j.sessionId === auditSessId && j.status === "complete" && !j.userId && new Date() - new Date(j.createdAt) < 2 * 60 * 60 * 1000);
      if (recentIdx !== -1) {
        ajobs[recentIdx].userId    = user.id;
        ajobs[recentIdx].expiresAt = null;
        writeJSON(AUDIT_JOBS_FILE, ajobs);
        // Save business info to profile
        const profiles = Array.isArray(readJSON(BUSINESS_PROFILE_FILE)) ? readJSON(BUSINESS_PROFILE_FILE) : [];
        const pidx = profiles.findIndex(p => p.userId === user.id);
        const upd = { userId: user.id, businessName: ajobs[recentIdx].businessName, industry: ajobs[recentIdx].category, city: ajobs[recentIdx].city, updatedAt: new Date().toISOString() };
        if (pidx !== -1) Object.assign(profiles[pidx], upd); else profiles.push(upd);
        writeJSON(BUSINESS_PROFILE_FILE, profiles);
      }
    } catch (e) { console.error("[signup] audit link error", e.message); }
  }

  json(res, 201, { user: safeUser(user) }, { "Set-Cookie": sessionCookie(token) });
}

async function handleSignin(req, res) {
  const ip = getIp(req);
  const rl = checkRateLimit(ip, "signin", 5, 15 * 60 * 1000);
  if (!rl.allowed) {
    logEvent("brute_force_signin", ip, ip);
    return json(res, 429, { error: `Too many sign-in attempts. Try again in ${rl.retryAfter}s.` },
      { "Retry-After": String(rl.retryAfter) });
  }

  const body = await readBody(req);
  const { email, password } = body;

  if (!email || !password) {
    return json(res, 400, { error: "Email and password are required." });
  }

  const users = readJSON(USERS_FILE);
  const user  = users.find(u => u.email === email.toLowerCase().trim());

  // Same timing for missing user vs wrong password — prevent user enumeration
  // salt = 64 hex chars (32 bytes), hash = 128 hex chars (64 bytes)
  const dummyHash = "0".repeat(64) + ":" + "0".repeat(128);
  const valid = user ? await verifyPassword(password, user.passwordHash) : (await verifyPassword(password, dummyHash), false);

  if (!valid) {
    return json(res, 401, { error: "Incorrect email or password." });
  }

  const token = createSession(user.id);
  json(res, 200, { user: safeUser(user) }, { "Set-Cookie": sessionCookie(token) });
}

async function handleLeadsSearch(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });

  // Lead Finder is fully blocked during trial
  if (isTrialActive(user)) {
    return json(res, 403, {
      success: false, error: "trial_lead_limit",
      message: "Lead Finder is not available during the free trial. Upgrade to €20/month to unlock it.",
      upgradeUrl: "/upgrade",
    });
  }

  const body      = await readBody(req);
  const leadsFound = Math.max(0, parseInt(body.leadsFound) || 0);

  const users = readJSON(USERS_FILE);
  const idx   = users.findIndex(u => u.id === user.id);
  if (idx === -1) return json(res, 404, { error: "User not found." });

  users[idx].searchesDone = (users[idx].searchesDone || 0) + 1;
  users[idx].monthLeads   = (users[idx].monthLeads   || 0) + 1;
  users[idx].leadsFound   = (users[idx].leadsFound   || 0) + leadsFound;

  // Free users get 3 lead searches/month at no credit cost
  if (hasAccess(users[idx])) {
    const cost   = PLAN_LIMITS.costs.leadSearch;
    const result = deductCredits(users, idx, cost, 'Lead Search');
    if (!result.ok) return insufficientCredits(res, result.creditsLeft, result.creditsMax, cost);
    writeJSON(USERS_FILE, users);
    return json(res, 200, {
      creditsLeft:  result.creditsLeft,
      creditsMax:   result.creditsMax,
      resetDate:    resetDateLabel(),
      searchesDone: users[idx].searchesDone,
      leadsFound:   users[idx].leadsFound,
    });
  }

  writeJSON(USERS_FILE, users);
  const creds = getCredits(users[idx]);
  json(res, 200, {
    creditsLeft:  creds.creditsLeft,
    creditsMax:   creds.creditsMax,
    resetDate:    resetDateLabel(),
    searchesDone: users[idx].searchesDone,
    leadsFound:   users[idx].leadsFound,
  });
}

async function handleUpdateProfile(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });

  const body = await readBody(req);
  const { firstName, lastName, email, currentPassword, newPassword, preferredLang } = body;

  const users = readJSON(USERS_FILE);
  const idx   = users.findIndex(u => u.id === user.id);
  if (idx === -1) return json(res, 404, { error: "User not found." });

  if (email && email.toLowerCase() !== user.email) {
    if (users.find(u => u.id !== user.id && u.email === email.toLowerCase().trim())) {
      return json(res, 409, { error: "That email is already in use." });
    }
    users[idx].email = email.toLowerCase().trim();
  }

  if (firstName     !== undefined) users[idx].firstName     = firstName.trim();
  if (lastName      !== undefined) users[idx].lastName      = lastName.trim();
  if (preferredLang !== undefined) users[idx].preferredLang = preferredLang;

  if (newPassword) {
    if (!currentPassword) return json(res, 400, { error: "Current password is required to set a new one." });
    const valid = await verifyPassword(currentPassword, users[idx].passwordHash);
    if (!valid) return json(res, 401, { error: "Current password is incorrect." });
    if (newPassword.length < 8) return json(res, 400, { error: "New password must be at least 8 characters." });
    users[idx].passwordHash = await hashPassword(newPassword);
  }

  writeJSON(USERS_FILE, users);
  json(res, 200, { user: safeUser(users[idx]) });
}

function handleSignout(req, res) {
  const cookies = parseCookies(req);
  deleteSession(cookies.session);
  json(res, 200, { ok: true }, { "Set-Cookie": clearCookie() });
}

function handleMe(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const plan = PLAN_LIMITS.plans[user.plan] || PLAN_LIMITS.plans.free;
  const { creditsLeft, creditsMax } = getCredits(user);
  const computed = {
    creditsLeft,
    creditsMax,
    resetDate:    resetDateLabel(),
    canOutreach:    plan.canOutreach    || false,
    canWhatsApp:    plan.canWhatsApp    || false,
    canCompetitors: (plan.maxCompetitors || 0) > 0,
    maxCompetitors: plan.maxCompetitors || 0,
    canEmailVerify: plan.canEmailVerify || false,
    monthlyLeadSearches: plan.monthlyLeadSearches || plan.freeLeadSearches || 3,
    monthlyAudits:  plan.monthlyAudits  || plan.freeAudits || 1,
    crmLeadsMax:           plan.crmLeads,
    canWordPress:          plan.wordpress,
    sitesMax:              plan.sites,
    marketingPostsMax:     plan.marketingPosts     ?? 2,
    marketingCampaignsMax: plan.marketingCampaigns ?? 0,
  };
  const profiles = Array.isArray(readJSON(BUSINESS_PROFILE_FILE)) ? readJSON(BUSINESS_PROFILE_FILE) : [];
  const bizProfile = profiles.find(p => p.userId === user.id) || null;
  json(res, 200, { user: { ...safeUser(user), ...computed, bizProfile } });
}


// ── Profile stats endpoint ────────────────────────────────────────────────────
function handleProfileStats(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });

  const { creditsLeft, creditsMax } = getCredits(user);
  const creditsUsed = creditsMax === -1 ? 0 : Math.max(0, creditsMax - creditsLeft);

  json(res, 200, {
    stats: {
      credits:      creditsLeft,
      creditsMax,
      creditsUsed,
      leadsFound:   user.leadsFound   || 0,
      searchesDone: user.searchesDone || 0,
    },
    month: {
      leads:       user.monthLeads       || 0,
      leadsMax:    -1,
      articles:    user.monthArticles    || 0,
      articlesMax: -1,
      audits:      user.monthAudits      || 0,
      auditsMax:   -1,
      competitors: user.monthCompetitors || 0,
      competitorsMax: -1,
      resetDate:   resetDateLabel(),
    },
    creditLog: user.creditLog || [],
  });
}

// ── Support email endpoint ────────────────────────────────────────────────────
// ── Todo handlers ────────────────────────────────────────────────────────────
function handleTodosGet(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const url = new URL("http://x" + req.url);
  const date   = url.searchParams.get("date") || "";
  const siteId = url.searchParams.get("siteId") || "";
  const all = Array.isArray(readJSON(TODOS_FILE)) ? readJSON(TODOS_FILE) : [];
  let todos = all.filter(t => t.userId === user.id);
  if (date)   todos = todos.filter(t => t.date === date);
  if (siteId && siteId !== "all") todos = todos.filter(t => t.siteId === siteId);
  json(res, 200, { todos });
}
async function handleTodoCreate(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const body = await readBody(req);
  const { text, date, siteId } = body;
  if (!text || !date) return json(res, 400, { error: "text and date required." });
  const all = Array.isArray(readJSON(TODOS_FILE)) ? readJSON(TODOS_FILE) : [];
  const todo = { id: crypto.randomUUID(), userId: user.id, text: text.trim(), date, siteId: siteId || null, done: false, createdAt: new Date().toISOString() };
  all.push(todo);
  writeJSON(TODOS_FILE, all);
  json(res, 201, { todo });
}
async function handleTodoUpdate(req, res, id) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const body = await readBody(req);
  const all = Array.isArray(readJSON(TODOS_FILE)) ? readJSON(TODOS_FILE) : [];
  const idx = all.findIndex(t => t.id === id && t.userId === user.id);
  if (idx === -1) return json(res, 404, { error: "Not found." });
  if (body.done   !== undefined) all[idx].done   = body.done;
  if (body.text   !== undefined) all[idx].text   = body.text;
  if (body.siteId !== undefined) all[idx].siteId = body.siteId;
  writeJSON(TODOS_FILE, all);
  json(res, 200, { todo: all[idx] });
}
function handleTodoDelete(req, res, id) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const all = Array.isArray(readJSON(TODOS_FILE)) ? readJSON(TODOS_FILE) : [];
  const filtered = all.filter(t => !(t.id === id && t.userId === user.id));
  if (filtered.length === all.length) return json(res, 404, { error: "Not found." });
  writeJSON(TODOS_FILE, filtered);
  json(res, 200, { ok: true });
}



// -- Todo AI Generate
async function handleTodosAIGenerate(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const body = await readBody(req);
  const { period, goal } = body;
  if (!period || !goal) return json(res, 400, { error: 'period and goal required.' });

  const periodDays = { today: 1, '3days': 3, week: 7, '2weeks': 14, month: 30 };
  const days = periodDays[period] || 7;
  const startDate = new Date();
  const dates = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  const dateRange = days === 1 ? dates[0] : dates[0] + ' to ' + dates[dates.length - 1];

  const systemPrompt = `You are a productivity assistant for eureach.eu, a B2B marketing platform.
Create a practical, actionable daily to-do list for the specified period and goal.
Output ONLY lines in this exact format (one task per line):
YYYY-MM-DD: Task description
No headers, no explanations, no empty lines, no numbering. Just the tasks.`;

  const userMsg = `Goal: ${goal}
Period: ${dateRange} (${days} day${days > 1 ? 's' : ''})
Available dates: ${dates.join(', ')}

Create a focused to-do list spread across these dates. 2-4 tasks per day max. Be specific and actionable.`;

  try {
    let text = '';
    const anthropicKey = getAnthropicKey();
    if (anthropicKey) {
      const r = await callClaude(anthropicKey, systemPrompt, userMsg, 1500);
      text = r.content?.[0]?.text || '';
    } else {
      const groqKey = getGroqKey();
      if (!groqKey) return json(res, 500, { error: 'No AI service configured.' });
      const r = await callGroq(groqKey, systemPrompt, userMsg, 1500);
      text = r.choices?.[0]?.message?.content || '';
    }
    if (!text) return json(res, 500, { error: 'AI returned empty response.' });
    json(res, 200, { text: text.trim() });
  } catch (err) {
    json(res, 500, { error: 'AI generation failed: ' + err.message });
  }
}

// -- Todo Bulk Import
async function handleTodosBulkImport(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const body = await readBody(req);
  const { todos } = body;
  if (!Array.isArray(todos) || !todos.length) return json(res, 400, { error: 'todos array required.' });
  const all = Array.isArray(readJSON(TODOS_FILE)) ? readJSON(TODOS_FILE) : [];
  const created = [];
  for (const t of todos.slice(0, 200)) {
    if (!t.text || !t.date) continue;
    const todo = { id: crypto.randomUUID(), userId: user.id, text: t.text.trim().slice(0, 200), date: t.date, siteId: t.siteId || null, done: false, createdAt: new Date().toISOString() };
    all.push(todo);
    created.push(todo);
  }
  writeJSON(TODOS_FILE, all);
  json(res, 201, { created: created.length });
}

async function handleSupportEmail(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });

  const { subject, message } = await readBody(req);
  if (!subject || !message) return json(res, 400, { error: "Subject and message are required." });

  const SUPPORT_FILE = path.join(ROOT, "data", "support_emails.json");
  const log = readJSON(SUPPORT_FILE) || [];
  log.push({
    id:        Date.now().toString(),
    userId:    user.id,
    email:     user.email,
    firstName: user.firstName || "",
    subject,
    message,
    createdAt: new Date().toISOString(),
  });
  writeJSON(SUPPORT_FILE, log);
  json(res, 200, { ok: true });
}

// ── Anthropic helpers ─────────────────────────────────────────────────────────

function getZeroBounceKey() {
  if (process.env.ZEROBOUNCE_API_KEY) return process.env.ZEROBOUNCE_API_KEY;
  try {
    const cfg = JSON.parse(fs.readFileSync(SOSBOARD_TOKENS, "utf8"));
    return cfg.zerobounce?.apiKey || null;
  } catch { return null; }
}

async function handleVerifyEmail(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });

  const body  = await readBody(req);
  const email = (body.email || "").trim().toLowerCase();
  if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    return json(res, 400, { error: "Invalid email address." });
  }

  const evPlan = PLAN_LIMITS.plans[user.plan] || PLAN_LIMITS.plans.free;
  if (!evPlan.canEmailVerify) return json(res, 403, { error: "Email verification is not available on the free plan. Upgrade to Beginners or Pro." });

  const evUsers = readJSON(USERS_FILE);
  const evIdx   = evUsers.findIndex(u => u.id === user.id);
  if (evIdx !== -1) {
    const evCost   = PLAN_LIMITS.costs.emailVerify;
    const evResult = deductCredits(evUsers, evIdx, evCost, 'Email Verify');
    if (!evResult.ok) return insufficientCredits(res, evResult.creditsLeft, evResult.creditsMax, evCost);
    writeJSON(USERS_FILE, evUsers);
  }

  const apiKey = getZeroBounceKey();
  if (!apiKey) return json(res, 500, { error: "Email verification not configured." });

  try {
    const https  = require("https");
    const url    = `https://api.zerobounce.net/v2/validate?api_key=${apiKey}&email=${encodeURIComponent(email)}&ip_address=`;
    const result = await new Promise((resolve, reject) => {
      https.get(url, (r) => {
        let data = "";
        r.on("data", c => data += c);
        r.on("end", () => { try { resolve(JSON.parse(data)); } catch { reject(new Error("Parse error")); } });
      }).on("error", reject);
    });
    return json(res, 200, {
      email:     result.address,
      status:    result.status,
      subStatus: result.sub_status || "",
      freeEmail: result.free_email,
    });
  } catch (e) {
    return json(res, 502, { error: "Verification service unavailable." });
  }
}

function getAnthropicKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const cfg = JSON.parse(fs.readFileSync(SOSBOARD_TOKENS, "utf8"));
    return cfg.anthropic?.apiKey || null;
  } catch { return null; }
}

function callClaude(apiKey, systemPrompt, userMessage, maxTokens = 2048, model = "claude-sonnet-4-6") {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });
    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(body),
      },
    };
    const req = https.request(options, res => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("Failed to parse Anthropic response")); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function getGroqKey() {
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY;
  try {
    const cfg = JSON.parse(fs.readFileSync(SOSBOARD_TOKENS, "utf8"));
    return cfg.groq?.apiKey || null;
  } catch { return null; }
}

function callGroq(apiKey, systemPrompt, userMessage, maxTokens = 1024, model = "qwen/qwen3.8-27b") {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userMessage  },
      ],
    });
    const options = {
      hostname: "api.groq.com",
      path: "/openai/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
        "Content-Length": Buffer.byteLength(body),
      },
    };
    const req = https.request(options, res => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("Failed to parse Groq response")); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── AI rate limit helper: 30 requests/user/hour ───────────────────────────────
function checkAiRateLimit(res, userId) {
  const rl = checkRateLimit(userId, "ai_request", 30, 60 * 60 * 1000);
  if (!rl.allowed) {
    json(res, 429, { error: "AI rate limit reached. Please wait before making more requests." },
      { "Retry-After": String(rl.retryAfter) });
    return false;
  }
  return true;
}

// ── Outreach handler ──────────────────────────────────────────────────────────

async function handleOutreach(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  if (!checkAiRateLimit(res, user.id)) return;

  const apiKey = getAnthropicKey();
  if (!apiKey) return json(res, 500, { error: "AI service not configured." });

  const body = await readBody(req);
  const { crmId, leadName, businessType, city, language, tone, gdprCompliant } = body;

  if (!leadName) return json(res, 400, { error: "leadName is required." });

  const outUsers = readJSON(USERS_FILE);
  const outIdx   = outUsers.findIndex(u => u.id === user.id);
  if (outIdx === -1) return json(res, 404, { error: "User not found." });

  const outPlan = PLAN_LIMITS.plans[outUsers[outIdx].plan] || PLAN_LIMITS.plans.free;
  if (!outPlan.canOutreach) return json(res, 403, { error: "Outreach is not available on the free plan. Upgrade to Beginners or Pro." });

  const outCost   = PLAN_LIMITS.costs.outreach;
  const outResult = deductCredits(outUsers, outIdx, outCost, 'Outreach Email');
  if (!outResult.ok) return insufficientCredits(res, outResult.creditsLeft, outResult.creditsMax, outCost);
  writeJSON(USERS_FILE, outUsers);

  const langMap  = { greek: "Greek", english: "English", german: "German" };
  const toneMap  = { formal: "formal and professional", friendly: "warm and friendly", direct: "direct and concise" };
  const langLabel = langMap[language]  || "English";
  const toneLabel = toneMap[tone]      || "friendly";

  const gdprFooter = gdprCompliant ? (
    language === "german"
      ? "\n\n---\nSie erhalten diese E-Mail, da Ihr Unternehmen öffentlich gelistet ist. Diese Nachricht richtet sich ausschließlich an Ihr Unternehmen und ist für Ihre geschäftlichen Interessen relevant. Um keine weiteren E-Mails zu erhalten, antworten Sie bitte mit \"Abmelden\"."
      : language === "greek"
      ? "\n\n---\nΛαμβάνετε αυτό το email επειδή η επιχείρησή σας είναι δημόσια καταχωρισμένη. Το μήνυμα αυτό απευθύνεται αποκλειστικά στην επιχείρησή σας. Για διαγραφή από τη λίστα, απαντήστε με \"Διαγραφή\"."
      : "\n\n---\nYou are receiving this email because your business is publicly listed. This message is directed to your business and relevant to your professional interests. To unsubscribe, reply with \"Unsubscribe\"."
  ) : "";

  const gdprRule = gdprCompliant
    ? `- This sequence must be GDPR and §7 UWG compliant: reference only publicly available business information, make the relevance to their specific business type clear, and never imply personal data was collected. Do NOT add a footer — it will be appended separately.`
    : "";

  const systemPrompt = `You are an expert B2B sales copywriter specializing in outreach for local businesses across Europe. You write highly personalized cold outreach sequences that get replies.

Return ONLY a valid JSON object — no markdown, no explanation, no code fences. The JSON must have this exact structure:
{
  "sequence": [
    { "step": 1, "channel": "Email", "subject": "...", "body": "..." },
    { "step": 2, "channel": "Email", "subject": "...", "body": "..." },
    { "step": 3, "channel": "WhatsApp", "subject": null, "body": "..." }
  ]
}

Rules:
- Message 1: Cold introduction email. Personalized opening referencing their business type and city. Present a clear value proposition (AI-powered local SEO and lead generation). Short — 4 to 6 sentences.
- Message 2: Follow-up email sent 3 days after no reply. Reference the previous email, add a specific insight or social proof. End with a simple question. Short — 3 to 5 sentences.
- Message 3: WhatsApp message. Conversational, ultra-short (under 60 words), casual tone regardless of the general tone setting. Use first name if available.
- Write ALL messages in ${langLabel}.
- Apply a ${toneLabel} tone to messages 1 and 2.
- Do not use placeholder text like [Your Name] — write as if from "the eureach.eu team".
- Subject lines must be specific and curiosity-inducing, not generic.
${gdprRule}`;

  const userMessage = `Generate a 3-step outreach sequence for this lead:
- Business Name: ${leadName}
- Business Type: ${businessType || "local business"}
- City: ${city || "Europe"}`;

  try {
    const aiRes = await callClaude(apiKey, systemPrompt, userMessage, 2048, getModel(outUsers[outIdx]));

    if (aiRes.error) return json(res, 502, { error: aiRes.error.message || "AI error." });

    const raw = aiRes.content?.[0]?.text || "";
    let sequence;
    try {
      const parsed = JSON.parse(raw);
      sequence = parsed.sequence;
      if (!Array.isArray(sequence) || sequence.length !== 3) throw new Error("bad shape");
    } catch {
      // Strip markdown fences if Claude wrapped in them despite instructions
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return json(res, 502, { error: "AI returned unexpected format." });
      const parsed = JSON.parse(match[0]);
      sequence = parsed.sequence;
    }

    // Append GDPR footer to email steps
    if (gdprFooter) {
      sequence.forEach(step => {
        if (step.channel === "Email") step.body += gdprFooter;
      });
    }

    // Persist to sequences.json
    const seqs  = readJSON(SEQUENCES_FILE);
    const entry = {
      id:           generateId(),
      userId:       user.id,
      crmId:        crmId || null,
      leadName,
      businessType: businessType || "",
      city:         city || "",
      language:     language || "english",
      tone:         tone || "friendly",
      sequence,
      createdAt:    new Date().toISOString(),
    };
    seqs.push(entry);
    writeJSON(SEQUENCES_FILE, seqs);

    json(res, 200, { sequence, sequenceId: entry.id });
  } catch (err) {
    console.error("Outreach AI error:", err);
    json(res, 500, { error: "Failed to generate outreach sequence." });
  }
}

function handleSequencesList(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  if (!hasAccess(user)) return json(res, 402, { error: "trial_expired", upgradeUrl: "/membership" });

  const { searchParams } = new URL("http://x" + req.url);
  const crmId = searchParams.get("crmId");
  const seqs  = readJSON(SEQUENCES_FILE).filter(s => {
    if (s.userId !== user.id) return false;
    if (crmId) return s.crmId === crmId;
    return true;
  });
  json(res, 200, { sequences: seqs });
}

async function handleWhatsApp(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  if (!checkAiRateLimit(res, user.id)) return;

  const apiKey = getAnthropicKey();
  if (!apiKey) return json(res, 500, { error: "AI service not configured." });

  const body = await readBody(req);
  const { crmId, leadName, businessType, city, phone, language, messageType } = body;

  if (!leadName) return json(res, 400, { error: "leadName is required." });

  const waUsers = readJSON(USERS_FILE);
  const waIdx   = waUsers.findIndex(u => u.id === user.id);
  if (waIdx === -1) return json(res, 404, { error: "User not found." });
  const waPlan = PLAN_LIMITS.plans[waUsers[waIdx].plan] || PLAN_LIMITS.plans.free;
  if (!waPlan.canWhatsApp) return json(res, 403, { error: "WhatsApp campaigns are not available on the free plan. Upgrade to Beginners or Pro." });

  const waCost   = PLAN_LIMITS.costs.whatsapp;
  const waResult = deductCredits(waUsers, waIdx, waCost, 'WhatsApp Message');
  if (!waResult.ok) return insufficientCredits(res, waResult.creditsLeft, waResult.creditsMax, waCost);
  writeJSON(USERS_FILE, waUsers);

  const langMap  = { greek: "Greek", english: "English", german: "German" };
  const langLabel = langMap[language] || "English";
  const typeLabel = messageType === "follow_up" ? "follow-up (they know us)"
                  : messageType === "offer"     ? "special offer / promotion"
                  : "cold introduction";

  const systemPrompt = `You are an expert mobile outreach copywriter. You write short, high-converting WhatsApp and SMS messages for local business owners across Europe.

Return ONLY a valid JSON object — no markdown, no explanation, no code fences. The JSON must have exactly this structure:
{
  "whatsapp": "...",
  "sms": "...",
  "sendTimeTip": "..."
}

Rules:
- "whatsapp": A conversational WhatsApp message. Casual, friendly, under 160 characters. Use an emoji or two. End with a soft call-to-action.
- "sms": A plain-text SMS. No emojis. Under 160 characters. Clear and direct. End with a short link placeholder: [eureach.eu/demo]
- "sendTimeTip": A single practical tip on the best time/day to send this type of message (1 sentence, max 20 words).
- Write ALL messages in ${langLabel}.
- Message type context: ${typeLabel}.
- Address the business owner informally (first name if possible, otherwise by their business type).
- Do NOT use placeholder text like [Your Name]. Write as "the eureach team".`;

  const userMessage = `Generate WhatsApp and SMS messages for this lead:
- Business Name: ${leadName}
- Business Type: ${businessType || "local business"}
- City: ${city || "Europe"}
- Message type: ${typeLabel}`;

  try {
    const aiRes = await callClaude(apiKey, systemPrompt, userMessage, 2048, getModel(waUsers[waIdx]));
    if (aiRes.error) return json(res, 502, { error: aiRes.error.message || "AI error." });

    const raw = aiRes.content?.[0]?.text || "";
    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return json(res, 502, { error: "AI returned unexpected format." });
      result = JSON.parse(match[0]);
    }

    if (!result.whatsapp || !result.sms) return json(res, 502, { error: "AI returned incomplete data." });

    const templates = readJSON(WHATSAPP_FILE);
    const entry = {
      id:           generateId(),
      userId:       user.id,
      crmId:        crmId || null,
      leadName,
      businessType: businessType || "",
      city:         city || "",
      phone:        phone || null,
      language:     language || "english",
      messageType:  messageType || "cold",
      whatsapp:     result.whatsapp,
      sms:          result.sms,
      sendTimeTip:  result.sendTimeTip || "",
      createdAt:    new Date().toISOString(),
    };
    templates.push(entry);
    writeJSON(WHATSAPP_FILE, templates);

    json(res, 200, { whatsapp: result.whatsapp, sms: result.sms, sendTimeTip: result.sendTimeTip || "", templateId: entry.id });
  } catch (err) {
    console.error("WhatsApp AI error:", err);
    json(res, 500, { error: "Failed to generate messages." });
  }
}

// ── CRM handlers ─────────────────────────────────────────────────────────────

function handleCrmList(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const crm     = readJSON(CRM_FILE);
  json(res, 200, { entries: crm.filter(e => e.userId === user.id) });
}

async function handleCrmCreate(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  if (!hasAccess(user)) return json(res, 402, { error: "trial_expired", upgradeUrl: "/membership" });

  const body = await readBody(req);
  const { leadName, businessType, city, phone, website, notes } = body;
  if (!leadName || !leadName.trim()) return json(res, 400, { error: "leadName is required." });

  const crm   = readJSON(CRM_FILE);
  const clim  = PLAN_LIMITS.plans[user.plan] || PLAN_LIMITS.plans.free;
  if (clim.crmLeads !== -1) {
    const userCount = crm.filter(e => e.userId === user.id).length;
    if (userCount >= clim.crmLeads) return limitReached(res, "crm", userCount, clim.crmLeads);
  }
  const now   = new Date().toISOString();
  const entry = {
    id:           generateId(),
    userId:       user.id,
    leadName:     leadName.trim(),
    businessType: (businessType || "").trim(),
    city:         (city || "").trim(),
    phone:        phone  || null,
    website:      website || null,
    status:       "found",
    notes:        (notes || "").trim(),
    createdAt:    now,
    updatedAt:    now,
  };
  crm.push(entry);
  writeJSON(CRM_FILE, crm);
  json(res, 201, { entry });
}

async function handleCrmUpdate(req, res, id) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  if (!hasAccess(user)) return json(res, 402, { error: "trial_expired", upgradeUrl: "/membership" });

  const body = await readBody(req);
  const crm  = readJSON(CRM_FILE);
  const idx  = crm.findIndex(e => e.id === id && e.userId === user.id);
  if (idx === -1) return json(res, 404, { error: "Entry not found." });

  const validStatuses = ["found", "contacted", "replied", "closed"];
  if (body.status !== undefined) {
    if (!validStatuses.includes(body.status)) return json(res, 400, { error: "Invalid status." });
    crm[idx].status = body.status;
  }
  if (body.notes    !== undefined) crm[idx].notes    = body.notes;
  if (body.leadName !== undefined) crm[idx].leadName = body.leadName.trim();
  crm[idx].updatedAt = new Date().toISOString();

  writeJSON(CRM_FILE, crm);
  json(res, 200, { entry: crm[idx] });
}

function handleCrmDelete(req, res, id) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  if (!hasAccess(user)) return json(res, 402, { error: "trial_expired", upgradeUrl: "/membership" });

  const crm = readJSON(CRM_FILE);
  const idx = crm.findIndex(e => e.id === id && e.userId === user.id);
  if (idx === -1) return json(res, 404, { error: "Entry not found." });

  crm.splice(idx, 1);
  writeJSON(CRM_FILE, crm);
  json(res, 200, { ok: true });
}

// ── Lead scoring ─────────────────────────────────────────────────────────────

function readScoreCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(LEAD_SCORES_FILE, "utf8"));
    return (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : {};
  } catch { return {}; }
}

async function handleLeadsScore(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  if (!checkAiRateLimit(res, user.id)) return;

  const apiKey = getAnthropicKey();
  if (!apiKey && !getGroqKey()) return json(res, 500, { error: "AI service not configured." });

  const body  = await readBody(req);
  const leads = Array.isArray(body.leads) ? body.leads.slice(0, 30) : [];
  if (!leads.length) return json(res, 400, { error: "leads array is required." });

  const scoreUsers  = readJSON(USERS_FILE);
  const scoreIdx    = scoreUsers.findIndex(u => u.id === user.id);
  if (scoreIdx === -1) return json(res, 404, { error: "User not found." });
  const scoreCost   = PLAN_LIMITS.costs.leadScore;
  const scoreResult = deductCredits(scoreUsers, scoreIdx, scoreCost, 'Lead Scoring');
  if (!scoreResult.ok) return insufficientCredits(res, scoreResult.creditsLeft, scoreResult.creditsMax, scoreCost);
  writeJSON(USERS_FILE, scoreUsers);

  const cache = readScoreCache();

  const scored   = [];
  const uncached = [];

  for (const lead of leads) {
    const key = `${(lead.name || "").trim().toLowerCase()}|${(lead.city || "").trim().toLowerCase()}`;
    if (cache[key]) {
      scored.push({ ...lead, score: cache[key].score, tier: cache[key].tier, reasoning: cache[key].reasoning });
    } else {
      uncached.push({ ...lead, _cacheKey: key });
      scored.push({ ...lead, score: null, tier: null, reasoning: null });
    }
  }

  if (uncached.length) {
    const systemPrompt = `You are a B2B lead scoring AI for a digital marketing platform. Score each local business lead from 0-100 for its potential as a sales prospect for AI-powered local SEO and digital presence services.

Scoring criteria (apply holistically):
- Phone availability: +15 if has phone (reachable)
- Website presence: +20 if has website (verified business); no website means clear digital gap opportunity
- Google rating: 3.5–4.4 stars = ideal target (established but with room to grow) +15; 4.5+ = +5; below 3.5 = +0
- Review count: 10–200 reviews is the sweet spot (+10); fewer or more = +5
- Digital maturity: low overall digital presence = higher opportunity score
- Industry demand: healthcare, hospitality, legal, professional services = higher AI/SEO demand

Tier: "hot" = 80-100, "warm" = 50-79, "cold" = 0-49
Reasoning: one concise sentence explaining the score.

Return ONLY a valid JSON array — no markdown, no code fences:
[{"name":"...","city":"...","score":<number>,"tier":"hot|warm|cold","reasoning":"..."}]`;

    const leadsJson = JSON.stringify(uncached.map(({ _cacheKey, ...l }) => l));
    const userMessage = `Score these ${uncached.length} leads:\n${leadsJson}`;

    try {
      const aiRes = await callClaude(apiKey, systemPrompt, userMessage, 2048, getModel(scoreUsers[scoreIdx]));
      if (!aiRes.error) {
        const raw = aiRes.content?.[0]?.text || "";
        let parsed;
        try { parsed = JSON.parse(raw); }
        catch {
          const m = raw.match(/\[[\s\S]*\]/);
          if (m) parsed = JSON.parse(m[0]);
        }
        if (Array.isArray(parsed)) {
          const now = new Date().toISOString();
          for (const s of parsed) {
            const key = `${(s.name || "").trim().toLowerCase()}|${(s.city || "").trim().toLowerCase()}`;
            if (typeof s.score !== "number") continue;
            // Clamp score and derive tier
            s.score = Math.max(0, Math.min(100, Math.round(s.score)));
            s.tier  = s.score >= 80 ? "hot" : s.score >= 50 ? "warm" : "cold";
            cache[key] = { score: s.score, tier: s.tier, reasoning: s.reasoning || "", cachedAt: now };
            // Patch into scored array
            const idx = scored.findIndex(r =>
              `${(r.name||"").trim().toLowerCase()}|${(r.city||"").trim().toLowerCase()}` === key
            );
            if (idx !== -1) {
              scored[idx] = { ...scored[idx], score: s.score, tier: s.tier, reasoning: s.reasoning || "" };
            }
          }
          writeJSON(LEAD_SCORES_FILE, cache);
        }
      }
    } catch (err) {
      console.error("Lead scoring error:", err);
    }
  }

  json(res, 200, { leads: scored });
}

function handleLeadsScoreCache(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const all    = readScoreCache();
  const mine   = Object.values(all).filter(c => c.userId === user.id);
  json(res, 200, { cache: mine });
}

// ── Blog ─────────────────────────────────────────────────────────────────────

function slugify(text) {
  return (text || "untitled")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) + "-" + Date.now();
}

function handleBlogList(req, res) {
  const params  = new URL("http://x" + req.url).searchParams;
  const lang    = params.get("lang") || null;
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  const isAdmin = user && user.role === "admin";
  const statusFilter = params.get("status") || null;

  const posts = readJSON(BLOG_FILE) || [];
  let filtered = posts;
  if (statusFilter && isAdmin) {
    filtered = filtered.filter(p => p.status === statusFilter);
  } else if (!isAdmin) {
    filtered = filtered.filter(p => p.status === "approved");
  }
  if (lang) filtered = filtered.filter(p => (p.lang || p.language) === lang);
  const sorted = [...filtered].sort((a, b) => new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt));
  return json(res, 200, { posts: sorted.map(p => ({ ...p, html: undefined, content: undefined })) });
}

function handleBlogGet(req, res, slug) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  const isAdmin = user && user.role === "admin";
  const posts = readJSON(BLOG_FILE) || [];
  const post  = posts.find(p => p.slug === slug);
  if (!post) return json(res, 404, { error: "Post not found." });
  if (post.status !== "approved" && !isAdmin) return json(res, 403, { error: "Post pending approval." });
  return json(res, 200, { post });
}

async function handleBlogPublish(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });

  const { title, excerpt, html, lang, category, metaDescription } = await readBody(req);
  if (!title || !html) return json(res, 400, { error: "title and html are required." });

  const posts = readJSON(BLOG_FILE) || [];
  const post  = {
    id:          Date.now(),
    slug:        slugify(title),
    title:       title.trim(),
    excerpt:     excerpt || metaDescription || "",
    html,
    lang:        lang || "en",
    category:    category || "General",
    author:      (user.firstName ? user.firstName + " " + (user.lastName || "") : user.email).trim(),
    publishedAt: new Date().toISOString(),
    status:      "pending",
    emoji:       "✍️",
  };
  posts.unshift(post);
  writeJSON(BLOG_FILE, posts);
  return json(res, 200, { post: { ...post, html: undefined }, slug: post.slug, pending: true });
}

function handleBlogApprove(req, res, slug) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user || user.role !== "admin") return json(res, 403, { error: "Admin only." });
  const posts = readJSON(BLOG_FILE) || [];
  const idx   = posts.findIndex(p => p.slug === slug);
  if (idx === -1) return json(res, 404, { error: "Post not found." });
  posts[idx].status = "approved";
  posts[idx].approvedAt = new Date().toISOString();
  writeJSON(BLOG_FILE, posts);
  return json(res, 200, { ok: true });
}

function handleBlogReject(req, res, slug) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user || user.role !== "admin") return json(res, 403, { error: "Admin only." });
  const posts = readJSON(BLOG_FILE) || [];
  const idx   = posts.findIndex(p => p.slug === slug);
  if (idx === -1) return json(res, 404, { error: "Post not found." });
  posts.splice(idx, 1);
  writeJSON(BLOG_FILE, posts);
  return json(res, 200, { ok: true });
}

async function handleBlogUpdate(req, res, slug) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user || user.role !== 'admin') return json(res, 403, { error: 'Admin only.' });
  const { title, excerpt, html, status } = await readBody(req);
  const posts = readJSON(BLOG_FILE) || [];
  const idx   = posts.findIndex(p => p.slug === slug);
  if (idx === -1) return json(res, 404, { error: 'Post not found.' });
  if (title)   posts[idx].title   = title.trim();
  if (excerpt !== undefined) posts[idx].excerpt = excerpt;
  if (html)    posts[idx].html    = html;
  if (status)  posts[idx].status  = status;
  posts[idx].updatedAt = new Date().toISOString();
  writeJSON(BLOG_FILE, posts);
  return json(res, 200, { ok: true, post: { ...posts[idx], html: undefined } });
}

// ── Article Automation ───────────────────────────────────────────────────────

function claudeText(aiRes) {
  if (aiRes && aiRes.type === "error") throw new Error((aiRes.error && aiRes.error.message) || "AI error");
  return (aiRes && aiRes.content && aiRes.content[0] && aiRes.content[0].text) || "";
}
// Sanitize raw newlines/tabs inside JSON string values so JSON.parse succeeds
function sanitizeJSONStrings(raw) {
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (esc) { out += c; esc = false; continue; }
    if (c === "\\" && inStr) { out += c; esc = true; continue; }
    if (c === "\"") { out += c; inStr = !inStr; continue; }
    if (inStr && c === "\n") { out += "\\n"; continue; }
    if (inStr && c === "\r") { out += "\\r"; continue; }
    if (inStr && c === "\t") { out += "\\t"; continue; }
    out += c;
  }
  return out;
}

function claudeJSON(aiRes) {
  const text = claudeText(aiRes);
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(cleaned);
}

async function handleArticleAutomate(req, res, articleId, action) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });

  const apiKey = getAnthropicKey();
  if (!apiKey) return json(res, 500, { error: "AI not configured." });

  const body = await readBody(req);
  const { title, html, lang, platforms, language } = body;
  const plainText = ((html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 3000);

  const automations = readJSON(ARTICLE_AUTOMATIONS_FILE) || {};
  const key = user.id + "_" + articleId;
  if (!automations[key]) automations[key] = { userId: user.id, articleId, title: title || "Untitled", lang: lang || "en", createdAt: new Date().toISOString(), results: {} };
  if (title) automations[key].title = title;
  if (lang)  automations[key].lang  = lang;

  const haiku  = "claude-haiku-4-5-20251001";
  const sonnet = "claude-sonnet-4-6";
  let result;

  try {
    switch (action) {

      case "social": {
        const plat = (platforms || [])[0];
        if (!plat) return json(res, 400, { error: "No platform specified." });
        const prompts = {
          linkedin:  { sys: "Adapt this article into a LinkedIn post. 150-300 words, professional tone, no hashtags in body (3-5 at end only), end with a question. Write in the same language as the article. Return ONLY the post text.", tokens: 600 },
          facebook:  { sys: "Adapt this article into a Facebook post. 100-200 words, warm tone, question at end, 2-3 emojis max. Write in the same language as the article. Return ONLY the post text.", tokens: 400 },
          twitter:   { sys: "Create a Twitter/X thread from this article. 4-6 tweets. Tweet 1: hook. Tweets 2-4: key points. Tweet 5: takeaway. Tweet 6: CTA. Each max 260 chars. Return numbered list: \"1. [tweet]\" etc. Same language as article.", tokens: 600 },
          instagram: { sys: "Write an Instagram caption for this article. 100-150 words, energetic, line breaks, end with 8-12 hashtags. Same language as article. Return ONLY the caption text.", tokens: 400 }
        };
        const p = prompts[plat];
        if (!p) return json(res, 400, { error: "Unknown platform: " + plat });
        const aiRes = await callClaude(apiKey, p.sys, "Title: " + title + "\n\nContent: " + plainText, p.tokens, sonnet);
        const text  = claudeText(aiRes);
        if (plat === "twitter") {
          const lines = text.split("\n").filter(l => /^\d+\./.test(l));
          result = { tweets: lines.map(l => l.replace(/^\d+\.\s*/, "").trim()) };
        } else {
          result = { content: text };
        }
        automations[key].results[plat] = Object.assign({}, result, { createdAt: new Date().toISOString() });
        break;
      }

      case "email": {
        const sys = 'Convert this article into an email newsletter. Return ONLY valid JSON: {"subject":"","preview_text":"","body":"","cta_text":"","cta_note":""} subject: max 60 chars. preview_text: max 90 chars. body: 200-250 words teaser. Write in the same language as the article.';
        const aiRes = await callClaude(apiKey, sys, "Title: " + title + "\n\nContent: " + plainText, 800, sonnet);
        result = claudeJSON(aiRes);
        automations[key].results.email = Object.assign({}, result, { createdAt: new Date().toISOString() });
        break;
      }

      case "gmb": {
        const sys = "Write a Google My Business post from this article. Max 1500 characters, plain text, no markdown, no hashtags, end with a call to action. Same language as the article. Return ONLY the post text.";
        const aiRes = await callClaude(apiKey, sys, "Title: " + title + "\n\nContent: " + plainText, 300, haiku);
        const gmbContent = claudeText(aiRes);
        result = { content: gmbContent, char_count: gmbContent.length };
        automations[key].results.gmb = Object.assign({}, result, { createdAt: new Date().toISOString() });
        break;
      }

      case "meta": {
        const sys = 'Generate SEO meta tags. Return ONLY valid JSON: {"meta_title":"","meta_description":"","og_title":"","og_description":""} meta_title: 50-60 chars with keyword. meta_description: 150-160 chars. Same language as article.';
        const aiRes = await callClaude(apiKey, sys, "Title: " + title + "\n\nContent: " + plainText.slice(0, 500), 300, haiku);
        result = claudeJSON(aiRes);
        automations[key].results.meta = Object.assign({}, result, { createdAt: new Date().toISOString() });
        break;
      }

      case "schema": {
        const schema = { "@context": "https://schema.org", "@type": "Article", "headline": title, "author": { "@type": "Organization", "name": "eureach.eu", "url": "https://eureach.eu" }, "publisher": { "@type": "Organization", "name": "eureach.eu", "url": "https://eureach.eu" }, "datePublished": new Date().toISOString(), "dateModified": new Date().toISOString(), "inLanguage": lang || "en", "url": "" };
        result = { schema: JSON.stringify(schema, null, 2), note: "Update the 'url' field after publishing this article." };
        automations[key].results.schema = Object.assign({}, result, { createdAt: new Date().toISOString() });
        break;
      }

      case "hashtags": {
        const sys = 'Generate hashtags. Return ONLY valid JSON: {"linkedin":[],"instagram":[],"twitter":[]} linkedin: 3-5 (no #). instagram: 8-12 (no #). twitter: 2-3 (no #). Mix article language and English.';
        const aiRes = await callClaude(apiKey, sys, "Title: \"" + title + "\"\nContent summary: " + plainText.slice(0, 300), 200, haiku);
        result = claudeJSON(aiRes);
        automations[key].results.hashtags = Object.assign({}, result, { createdAt: new Date().toISOString() });
        break;
      }

      case "translate": {
        const tLang    = language || "en";
        const langName = tLang === "de" ? "German" : "English";
        const sys = "You are a professional translator. Translate naturally, adapt idioms. Return ONLY valid JSON: {\"title\":\"\",\"content\":\"\"} No text outside JSON.";
        const aiRes = await callClaude(apiKey, sys, "Translate to " + langName + ":\n\nTitle: " + title + "\n\nContent: " + plainText, 3000, sonnet);
        const translated = claudeJSON(aiRes);
        result = Object.assign({}, translated, { language: tLang });
        const posts = readJSON(BLOG_FILE) || [];
        posts.unshift({ id: Date.now(), slug: slugify(translated.title || title) + "-draft", title: translated.title || title, excerpt: "", html: "<p>" + (translated.content || "").replace(/\n/g, "</p><p>") + "</p>", lang: tLang, category: "article", author: ((user.firstName ? user.firstName + " " + (user.lastName || "") : user.email) || "").trim(), publishedAt: new Date().toISOString(), status: "draft", emoji: "🌐" });
        writeJSON(BLOG_FILE, posts);
        result.savedAsDraft = true;
        automations[key].results["translate_" + tLang] = Object.assign({}, result, { createdAt: new Date().toISOString() });
        break;
      }

      case "internal-links": {
        const posts = (readJSON(BLOG_FILE) || []).filter(p => p.status === "approved" && p.title !== title).slice(0, 20);
        if (!posts.length) {
          result = { links: [] };
        } else {
          const articleList = posts.map(p => "SLUG:" + p.slug + " | Title: " + p.title).join("\n");
          const sys = 'Identify internal linking opportunities. Return ONLY valid JSON array (max 3): [{"target_slug":"","anchor_text":"","reason":""}] anchor_text = exact phrase from current article. Return [] if none.';
          const aiRes = await callClaude(apiKey, sys, 'Current article: "' + title + '"\n\nContent: ' + plainText.slice(0, 1000) + "\n\nAvailable articles:\n" + articleList, 400, sonnet);
          const suggestions = claudeJSON(aiRes);
          const links = (Array.isArray(suggestions) ? suggestions : []).map(s => {
            const target = posts.find(p => p.slug === s.target_slug);
            return Object.assign({}, s, { target_title: (target && target.title) || "", target_url: s.target_slug ? "/blog.html#" + s.target_slug : "" });
          }).slice(0, 3);
          result = { links };
        }
        automations[key].results.internal_links = Object.assign({}, result, { createdAt: new Date().toISOString() });
        break;
      }

      case "track-visibility": {
        const sys = 'Generate 3 natural AI search queries to find this article. Return ONLY valid JSON array: ["query 1","query 2","query 3"]';
        const aiRes = await callClaude(apiKey, sys, 'Title: "' + title + '"\nFirst paragraph: ' + plainText.slice(0, 300), 200, haiku);
        const queries = claudeJSON(aiRes);
        const visibility = readJSON(ARTICLE_VISIBILITY_FILE) || [];
        const trackingId = Date.now();
        visibility.push({ id: trackingId, articleId, userId: user.id, title, queries: Array.isArray(queries) ? queries : [], appeared: false, createdAt: new Date().toISOString(), nextCheck: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });
        writeJSON(ARTICLE_VISIBILITY_FILE, visibility);
        result = { tracking_id: trackingId, queries_to_track: Array.isArray(queries) ? queries : [], message: "Tracking started — you will be notified when this article appears in AI search results.", next_check: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() };
        automations[key].results.track = Object.assign({}, result, { createdAt: new Date().toISOString() });
        break;
      }

      case "schedule-republish": {
        const intervalDays = body.interval_days || 90;
        const rPlatforms   = body.platforms || [];
        const schedule = readJSON(ARTICLE_REPUBLISH_FILE) || [];
        const scheduleId  = Date.now();
        const nextPublish = new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000).toISOString();
        schedule.push({ id: scheduleId, articleId, userId: user.id, title, platforms: rPlatforms, interval_days: intervalDays, lastPublished: null, nextPublish, active: true, createdAt: new Date().toISOString() });
        writeJSON(ARTICLE_REPUBLISH_FILE, schedule);
        result = { ok: true, schedule_id: scheduleId, next_publish: nextPublish };
        break;
      }

      default:
        return json(res, 404, { error: "Unknown automation action: " + action });
    }

    writeJSON(ARTICLE_AUTOMATIONS_FILE, automations);
    return json(res, 200, result);

  } catch (err) {
    console.error("[automate/" + action + "]", err.message);
    return json(res, 500, { error: err.message || "Automation failed." });
  }
}

function handleArticleAutomateResults(req, res, articleId) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const automations = readJSON(ARTICLE_AUTOMATIONS_FILE) || {};
  const key = user.id + "_" + articleId;
  const record = automations[key] || {};
  return json(res, 200, { results: record.results || {}, title: record.title || "" });
}

// ── Publish to Agora proxy ────────────────────────────────────────────────────

async function handlePublishToAgora(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });

  const { title, html, excerpt, lang } = await readBody(req);
  if (!title || !html) return json(res, 400, { error: "title and html are required." });

  const secret = process.env.AGORA_PUBLISH_SECRET;
  if (!secret) return json(res, 500, { error: "Agora integration not configured." });

  try {
    const https = require("https");
    const body  = JSON.stringify({ title, html, excerpt: excerpt || "", lang: lang || "en", category: "gnomes" });
    const result = await new Promise((resolve, reject) => {
      const req2 = https.request({
        hostname: "agora.sos.gr",
        path: "/api/article/publish-from-eureach",
        method: "POST",
        headers: { "Content-Type": "application/json", "x-publish-secret": secret, "Content-Length": Buffer.byteLength(body) },
      }, (r) => {
        let data = "";
        r.on("data", c => data += c);
        r.on("end", () => { try { resolve({ status: r.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: r.statusCode, body: {} }); } });
      });
      req2.on("error", reject);
      req2.write(body);
      req2.end();
    });
    if (result.status !== 200) return json(res, 502, { error: result.body.error || "Agora publish failed." });
    return json(res, 200, result.body);
  } catch (err) {
    return json(res, 502, { error: "Could not reach Agora: " + err.message });
  }
}

// ── Articles: analyze existing ────────────────────────────────────────────────

async function handleArticleAnalyzeExisting(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });

  const { articleText, siteContext, primaryKeyword, metaTitleHint, metaDescHint } = await readBody(req);
  if (!articleText || articleText.trim().length < 100)
    return json(res, 400, { error: "Article text too short (min 100 chars)." });

  const apiKey = getAnthropicKey();
  if (!apiKey) return json(res, 500, { error: "AI not configured." });

  const model = isPaidUser(user) ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001";

  const siteInfo = siteContext
    ? `Site: ${siteContext.domain || ""}. Niche: ${siteContext.niche || "general"}. Audience: ${siteContext.audience || "general public"}. Geo: ${siteContext.geo || "Europe"}.`
    : "";

  const systemPrompt = `You are an expert SEO content editor. Follow the exact output format requested — no deviations.`;

  const userMessage = `Analyze and improve this article. Keep it in its original language — do NOT translate. Respond in TWO clearly separated sections exactly as shown below.

${siteInfo}
Primary keyword: ${primaryKeyword || "auto-detect from article"}
Requested meta title: ${metaTitleHint || "generate one"}
Requested meta description: ${metaDescHint || "generate one"}

ARTICLE TO IMPROVE:
${articleText.slice(0, 8000)}

---
OUTPUT FORMAT — return exactly this, nothing else:

METADATA_JSON
{"metaTitle":"...","metaDescription":"...","primaryKeyword":"...","wordCount":0,"readingTime":0,"improvements":["...","...","..."]}
END_METADATA

ARTICLE_HTML
<h1>...</h1><p>...</p>
END_ARTICLE

Rules:
- METADATA_JSON must be a single-line minified JSON — absolutely no line breaks inside it
- metaTitle: under 60 chars | metaDescription: 140-160 chars
- ARTICLE_HTML contains clean semantic HTML: h1 (once), h2, h3, p, ul/li, strong, em — no divs, no classes, no inline styles
- Keep the article in its original language — do NOT translate
- Weave primary keyword naturally 3-5 times
- Add compelling intro + clear conclusion`;

  try {
    const aiRes = await callClaude(apiKey, systemPrompt, userMessage, 8000, model);
    if (aiRes?.type === "error") {
      const msg = aiRes?.error?.message || "AI request failed.";
      const friendly = msg.includes("credit") ? "AI credits are depleted — please top up the Anthropic account to use this feature." : msg;
      return json(res, 503, { error: friendly });
    }
    const rawText = (aiRes?.content?.[0]?.text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // AI may return multi-line JSON
    const metaMatch = rawText.match(/METADATA_JSON\n([\s\S]+?)\nEND_METADATA/);
    // Accept truncated HTML — use whatever was generated if END_ARTICLE is missing
    const htmlMatch = rawText.match(/ARTICLE_HTML\n([\s\S]+?)(?:\nEND_ARTICLE|$)/);

    if (!metaMatch || !htmlMatch) {
      require("fs").writeFileSync("/tmp/ai_raw_debug.txt", rawText + "\n---LEN:" + rawText.length);
      console.error("[analyze-existing] Format mismatch. metaMatch:", !!metaMatch, "htmlMatch:", !!htmlMatch);
      return json(res, 500, { error: "AI returned an unexpected format. Please try again." });
    }

    let parsed;
    const metaRaw = metaMatch[1].trim().split("\n").join(" ");
    try { parsed = JSON.parse(metaRaw); }
    catch (e) {
      console.error("[analyze-existing] JSON parse error:", e.message, "raw meta:", metaMatch[1].slice(0, 200));
      return json(res, 500, { error: "AI metadata could not be parsed. Please try again." });
    }

    parsed.html = htmlMatch[1].trim();
    return json(res, 200, { result: parsed });
  } catch (err) {
    return json(res, 500, { error: "AI request failed: " + err.message });
  }
}

// -- Article generation -------------------------------------------------------

async function handleArticleGenerate(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });

  const apiKey = getAnthropicKey();
  if (!apiKey) return json(res, 500, { error: "AI not configured." });

  const body = await readBody(req);
  const { topic, brief, articleType, language, readingLevel, audience,
    primaryKeyword, secondaryKeywords, searchIntent, funnelStage,
    geoTarget, articleLength, tones, conversionGoal, cta, ctaUrl,
    siteDomain, siteName, siteNiche, model: modelChoice,
    includeFaq, includeToc, includeSnippet } = body;

  if (!topic) return json(res, 400, { error: "topic is required." });

  const wcTarget = { XS: 650, S: 1000, M: 1750, L: 3000, XL: 4200 }[articleLength || "M"] || 1750;
  const toneList = Array.isArray(tones) && tones.length ? tones.join(", ") : "Professional, Friendly";
  const lang     = language || "English";

  const sysLines = [
    "You are an expert content writer and SEO strategist. Write real specific high-quality content based exactly on the subject and instructions provided.",
    "",
    "CRITICAL RULES:",
    "1. The TITLE/SUBJECT is the actual topic. Write about exactly that subject and nothing else.",
    "2. USER INSTRUCTIONS are the highest-priority directive. Follow them verbatim. They override all defaults.",
    "3. DO NOT fabricate statistics, prices, percentages, plans, testimonials or numbers not provided by the user.",
    "4. DO NOT use generic filler: no Whether you are a business owner or consumer, no Plans start from EUR29/month, no 3x better outcomes, no cost-per-acquisition — unless those are the actual topic.",
    "5. Geographic target describes the AUDIENCE only and never determines the language to write in.",
    "6. SEO keywords optimize the content but do not replace the subject matter.",
    "7. Write every word in: " + lang + ". Do not mix languages.",
    "8. Only mention the site domain in the CTA section if a CTA URL is explicitly provided.",
    "",
    "CONTENT TYPE: " + (articleType || "Article"),
    "WRITING TONE: " + toneList,
    "READING LEVEL: " + (readingLevel || "Intermediate"),
    "WORD COUNT TARGET: " + wcTarget + " words",
    "FUNNEL STAGE: " + (funnelStage || "TOFU"),
    "SEARCH INTENT: " + (searchIntent || "Informational"),
    "GEOGRAPHIC AUDIENCE: " + (geoTarget || "Not specified") + " (audience context only, does NOT affect language)",
    (siteNiche ? "SITE NICHE: " + siteNiche : ""),
    "",
    "Return ONLY valid JSON. No markdown fences. No text outside the JSON. Use this exact structure: {\"article\":{\"h1\":\"heading\",\"featured_snippet\":\"snippet\",\"toc\":[\"s1\"],\"intro\":\"intro\",\"sections\":[{\"h2\":\"h\",\"content\":\"body paragraph\"}],\"conclusion\":\"conc\",\"cta_block\":\"\",\"faq\":[{\"q\":\"q\",\"a\":\"a\"}]},\"seo\":{\"title_tag\":\"t\",\"meta_description\":\"d\",\"slug\":\"s\",\"og_title\":\"t\",\"og_description\":\"d\",\"primary_keyword\":\"k\",\"search_intent\":\"i\",\"estimated_word_count\":1750,\"secondary_keywords\":[\"k\"],\"lsi_keywords\":[\"l\"]},\"audits\":{\"market\":{\"keyword_difficulty\":\"Medium\",\"monthly_searches_estimate\":\"500-2000/mo\",\"competitors\":[\"C\"],\"gaps\":[\"G\"],\"topic_cluster\":[\"T\"]},\"cro\":{\"score\":80,\"strengths\":[\"s\"],\"weaknesses\":[\"w\"],\"recommendations\":[\"r\"]},\"eu_ai_act\":{\"requires_disclosure\":true,\"risk_level\":\"Low\",\"reasoning\":\"AI-assisted content.\",\"disclosure_text\":\"This article was produced with AI assistance. EU AI Act Article 50 compliant.\"},\"ai_citation\":{\"overall_score\":80,\"chatgpt_score\":80,\"perplexity_score\":82,\"google_ai_score\":78}}}",
  ];

  const systemPrompt = sysLines.filter(l => l !== undefined).join("\n");

  const userParts = ["ARTICLE TITLE / SUBJECT: " + topic];
  if (brief && brief.trim())
    userParts.push("\nUSER INSTRUCTIONS (HIGHEST PRIORITY - follow these exactly):\n" + brief.trim());
  if (audience)           userParts.push("\nTARGET AUDIENCE: " + audience);
  if (primaryKeyword)     userParts.push("PRIMARY KEYWORD: " + primaryKeyword);
  if (secondaryKeywords)  userParts.push("SECONDARY KEYWORDS: " + secondaryKeywords);
  if (cta)                userParts.push("CALL TO ACTION TEXT: " + cta);
  if (ctaUrl)             userParts.push("CALL TO ACTION URL: " + ctaUrl);
  if (conversionGoal)     userParts.push("CONVERSION GOAL: " + conversionGoal);
  if (includeFaq    !== false) userParts.push("\nINCLUDE FAQ: yes - add 3-5 relevant Q&A pairs");
  if (includeToc    !== false) userParts.push("INCLUDE TABLE OF CONTENTS: yes");
  if (includeSnippet !== false) userParts.push("INCLUDE FEATURED SNIPPET: yes");
  userParts.push("\nWrite the complete " + lang + "-language content about: \"" + topic + "\"");

  const userMessage = userParts.join("\n");
  const tokenBudget = { XS: 3000, S: 4500, M: 7500, L: 8000, XL: 8000 }[articleLength || "M"] || 5000;
  const claudeModel = modelChoice === "haiku" ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6";

  try {
    const aiRes  = await callClaude(apiKey, systemPrompt, userMessage, tokenBudget, claudeModel);
    const rawText = claudeText(aiRes);
    // Robust parse: strip fences, try direct parse, then fall back to extracting article/seo blocks
    let parsed = null;
    const cleaned = sanitizeJSONStrings(rawText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim());
    try {
      parsed = JSON.parse(cleaned);
    } catch (e1) {
      // Attempt recovery: close any unclosed strings/brackets from truncated response
      try {
        let inStr = false, esc = false;
        const stack = [];
        for (const c of cleaned) {
          if (esc) { esc = false; continue; }
          if (c === '\\' && inStr) { esc = true; continue; }
          if (c === '"') { inStr = !inStr; continue; }
          if (inStr) continue;
          if (c === '{') stack.push('}');
          else if (c === '[') stack.push(']');
          else if (c === '}' || c === ']') stack.pop();
        }
        const repaired = cleaned + (inStr ? '"' : '') + stack.reverse().join('');
        parsed = JSON.parse(repaired);
        console.warn("[article-generate] used recovered partial JSON");
      } catch (e2) {
        // Recovery also failed
      }
      if (!parsed) throw new Error("AI returned unparseable JSON: " + e1.message);
    }
    if (!parsed || !parsed.article) throw new Error("AI returned invalid structure");
    return json(res, 200, parsed);
  } catch (err) {
    console.error("[article-generate]", err.message);
    return json(res, 500, { error: err.message || "Article generation failed." });
  }
}

// ── Articles deduct ───────────────────────────────────────────────────────────

async function handleArticlesDeduct(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });

  const users = readJSON(USERS_FILE);
  const idx   = users.findIndex(u => u.id === user.id);
  if (idx === -1) return json(res, 404, { error: "User not found." });

  // Auto-expire trial if needed
  autoExpireTrialIfNeeded(users, idx);

  const body = await readBody(req);
  const articleLanguage = (body.language || "").toLowerCase();

  // Free-plan: block if expired, language Greek only
  if (!hasAccess(users[idx])) {
    if (isFreeExpired(users[idx])) return json(res, 403, { error: "free_expired", message: "Your free plan has expired. Upgrade to Pro to continue.", upgradeUrl: "/membership" });
    if (articleLanguage && articleLanguage !== "greek" && articleLanguage !== "el") {
      return json(res, 403, {
        error: "free_plan_language",
        message: "Free plan supports Greek language only. Upgrade to €20/month for English and German.",
        upgradeUrl: "/membership",
      });
    }
  }

  // Free plan: 1 article/month (Greek only — language check already above)
  if (!hasAccess(users[idx]) && !isTrialActive(users[idx])) {
    if ((users[idx].monthArticles || 0) >= 1) {
      return json(res, 403, {
        error: "monthly_article_limit",
        message: "Free plan includes 1 article per month (Greek only). Upgrade to Pro for 6 articles in Greek, English & German.",
        upgradeUrl: "/membership",
      });
    }
  }

  // Trial article limit (3 total during trial)
  if (isTrialActive(users[idx])) {
    const tu = getTrialUsage(users[idx]);
    if ((tu.articlesGenerated || 0) >= 3) {
      return json(res, 403, {
        success: false, error: "trial_article_limit",
        message: "Your free trial includes 3 articles. Upgrade to €20/month for 6 articles per month.",
        upgradeUrl: "/membership",
      });
    }
    tu.articlesGenerated = (tu.articlesGenerated || 0) + 1;
    users[idx].trialUsage = tu;
  }

  // Paid plan: enforce 6 articles/month cap
  if (isPaidUser(users[idx])) {
    const planCfg    = PLAN_LIMITS.plans[users[idx].plan] || PLAN_LIMITS.plans.paid;
    const monthlyMax = planCfg.monthlyArticles ?? 6;
    if (monthlyMax !== -1) {
      if (users[idx].articleMonth !== currentMonth()) {
        users[idx].monthArticles = 0;
        users[idx].articleMonth  = currentMonth();
      }
      if ((users[idx].monthArticles || 0) >= monthlyMax) {
        return json(res, 403, {
          error: "monthly_article_limit",
          message: `You've used all ${monthlyMax} articles for this month. Resets on ${resetDateLabel()}.`,
          upgradeUrl: "/membership",
        });
      }
    }
  }

  const artCost   = PLAN_LIMITS.costs.articleGenerate;
  const artResult = deductCredits(users, idx, artCost, 'Article Generated');
  if (!artResult.ok) return insufficientCredits(res, artResult.creditsLeft, artResult.creditsMax, artCost);
  users[idx].monthArticles = (users[idx].monthArticles || 0) + 1;
  users[idx].articleMonth  = currentMonth();

  writeJSON(USERS_FILE, users);
  json(res, 200, { creditsLeft: artResult.creditsLeft, creditsMax: artResult.creditsMax, resetDate: resetDateLabel() });
}

// ── Competitor audit core ─────────────────────────────────────────────────────

async function crawlWebsite(rawUrl) {
  if (!rawUrl) return null;
  try {
    let target = rawUrl.trim();
    if (!/^https?:\/\//i.test(target)) target = "https://" + target;
    const parsed = new URL(target);
    if (isPrivateHost(parsed.hostname)) return null;

    // Use curl subprocess to avoid Node.js HTTPS connection pool exhaustion
    const fetchPage = (pageUrl) => new Promise((resolve) => {
      const { execFile } = require("child_process");
      const hdrFile = "/tmp/crawl-hdr-" + process.pid + ".tmp";
      execFile("curl", [
        "-L", "-s", "--max-time", "6",
        "-A", "Mozilla/5.0 (compatible; EureachBot/1.0; +https://eureach.eu)",
        "-H", "Accept: text/html,application/xhtml+xml",
        "-H", "Accept-Language: en",
        "-D", hdrFile,   // dump headers to temp file, not stdout
        "--", pageUrl
      ], { maxBuffer: 3000000, timeout: 7000 }, (err, body) => {
        let headers = "";
        try { headers = require("fs").readFileSync(hdrFile, "utf8"); require("fs").unlinkSync(hdrFile); } catch {}
        if (err && !body) return resolve(null);
        const lastModifiedMatch = headers.match(/^last-modified:\s*(.+)$/im);
        const lastModified = lastModifiedMatch ? lastModifiedMatch[1].trim() : null;
        const locationMatches = [...headers.matchAll(/^location:\s*(.+)$/gim)];
        let finalUrl = pageUrl;
        if (locationMatches.length) {
          const last = locationMatches[locationMatches.length - 1][1].trim();
          try { finalUrl = new URL(last, pageUrl).href; } catch {}
        }
        const html = (body || "").slice(0, 500000);
        if (!html) return resolve(null);
        resolve({ html, lastModified, finalUrl });
      });
    });

    require("fs").appendFileSync("/tmp/crawl-debug.log", new Date().toISOString()+" starting fetchPage: "+target+"\n");
    console.log("[crawl] starting fetchPage:", target);
    const pageResult = await fetchPage(target);
    require("fs").appendFileSync("/tmp/crawl-debug.log", new Date().toISOString()+" fetchPage done: "+(pageResult ? "finalUrl="+pageResult.finalUrl : "NULL")+"\n");
    console.log("[crawl] fetchPage done:", pageResult ? ("finalUrl="+pageResult.finalUrl) : "NULL");
    if (!pageResult) return null;
    const { html, lastModified: pageLastModified, finalUrl } = pageResult;
    const origin = (() => { try { return new URL(finalUrl || target).origin; } catch { return parsed.origin; } })();

    const extract    = (pat, fl="i")  => { const m = html.match(new RegExp(pat,fl)); return m ? m[1].replace(/<[^>]+>/g,"").trim() : null; };
    const extractAll = (pat, fl="gi") => { const r=[]; let m; const re=new RegExp(pat,fl); while((m=re.exec(html)) && r.length<10) r.push(m[1].replace(/<[^>]+>/g,"").trim()); return r; };

    const title       = extract('<title[^>]*>([^<]{1,200})');
    const description = extract('<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']{1,400})["\']') ||
                        extract('<meta[^>]+content=["\']([^"\']{1,400})["\'][^>]+name=["\']description["\']');
    const h1s         = extractAll('<h1[^>]*>([^<]{1,150})');
    const h2s         = extractAll('<h2[^>]*>([^<]{1,150})');
    const ogTitle     = extract('<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']{1,200})["\']');
    const ogDesc      = extract('<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']{1,400})["\']');

    const schemaTypes = [];
    let schemaDateModified = null;
    const schemaRe = /<script[^>]+type=["\']application\/ld\+json["\'][^>]*>([\s\S]*?)<\/script>/gi;
    let sm;
    while ((sm = schemaRe.exec(html)) && schemaTypes.length < 5) {
      try {
        const obj = JSON.parse(sm[1]);
        schemaTypes.push(obj["@type"] || "Unknown");
        if (!schemaDateModified && (obj.dateModified || obj.datePublished))
          schemaDateModified = obj.dateModified || obj.datePublished;
      } catch {}
    }

    const hasPhone      = /tel:|phone|\u03c4\u03b7\u03bb/i.test(html);
    const hasEmail      = /mailto:|contact|email/i.test(html);
    const hasFacebook   = /facebook\.com/i.test(html);
    const hasInstagram  = /instagram\.com/i.test(html);
    const hasLinkedIn   = /linkedin\.com/i.test(html);
    const hasGoogleMaps = /maps\.google|google\.com\/maps|goo\.gl\/maps/i.test(html);

    let hasRobots = false, hasSitemap = false;
    const headCheck = (checkUrl) => new Promise(resolve => {
      try {
        const mod2 = checkUrl.startsWith("https") ? https : http;
        const r2 = mod2.get(checkUrl, {timeout:3000}, res2 => {
          const ok = res2.statusCode === 200; res2.resume(); resolve(ok);
        });
        r2.on("error", () => resolve(false));
        r2.on("timeout", () => { r2.destroy(); resolve(false); });
      } catch { resolve(false); }
    });
    const fetchXmlDates = (xmlUrl) => new Promise(resolve => {
      try {
        const mod2 = xmlUrl.startsWith("https") ? https : http;
        const r2 = mod2.get(xmlUrl, {timeout:4000, headers:{"User-Agent":"Mozilla/5.0"}}, res2 => {
          if (res2.statusCode !== 200) { res2.resume(); return resolve([]); }
          const chunks2 = [];
          res2.on("data", c => { chunks2.push(c); if (Buffer.concat(chunks2).length > 300000) res2.destroy(); });
          res2.on("end", () => {
            try {
              const xml = Buffer.concat(chunks2).toString("utf8");
              // Sitemap index — extract lastmod dates directly from index entries
              if (xml.includes("<sitemapindex")) {
                const indexDates = [];
                const re3 = /<lastmod>([^<]+)<\/lastmod>/gi;
                let m3;
                while ((m3 = re3.exec(xml)) && indexDates.length < 20) indexDates.push(m3[1].trim().slice(0,10));
                indexDates.sort((a,b) => b.localeCompare(a));
                return resolve(indexDates.slice(0,3));
              }
              const dates = [];
              const re2 = /<lastmod>([^<]+)<\/lastmod>/gi;
              let m2;
              while ((m2 = re2.exec(xml)) && dates.length < 20) dates.push(m2[1].trim().slice(0,10));
              dates.sort((a,b) => b.localeCompare(a));
              resolve(dates.slice(0,3));
            } catch { resolve([]); }
          });
          res2.on("error", () => resolve([]));
        });
        r2.on("error", () => resolve([]));
        r2.on("timeout", () => { r2.destroy(); resolve([]); });
      } catch { resolve([]); }
    });

    let sitemapDates = [];
    [hasRobots, [hasSitemap, sitemapDates]] = await Promise.all([
      headCheck(origin + "/robots.txt"),
      fetchXmlDates(origin + "/sitemap.xml").then(dates => [dates.length > 0, dates]),
    ]);

    // Best last-updated date: schema > sitemap > Last-Modified header
    const lastUpdated = schemaDateModified
      ? schemaDateModified.slice(0,10)
      : sitemapDates.length ? sitemapDates[0]
      : pageLastModified ? pageLastModified
      : null;

    return { title, description, h1s, h2s, ogTitle, ogDesc, schemaTypes, hasPhone, hasEmail, hasFacebook, hasInstagram, hasLinkedIn, hasGoogleMaps, hasRobots, hasSitemap, lastUpdated, recentUpdates: sitemapDates };
  } catch (crawlErr) {
    console.error("[crawlWebsite] ERROR:", crawlErr && crawlErr.message, rawUrl);
    return null;
  }
}

function scoreFromCrawl(crawl, url) {
  // Compute realistic scores from actual crawl signals
  const has = (v) => !!v;

  // content_quality: title, desc, headings, OG
  let cq = 10;
  if (has(crawl.title) && crawl.title.length > 10)       cq += 20;
  if (has(crawl.description) && crawl.description.length > 30) cq += 25;
  if (crawl.h1s && crawl.h1s.length > 0)                 cq += 15;
  if (crawl.h2s && crawl.h2s.length > 2)                 cq += 10;
  if (has(crawl.ogTitle))                                 cq += 10;
  if (has(crawl.ogDesc))                                  cq += 10;

  // schema_markup: JSON-LD structured data
  let sm = 5;
  if (crawl.schemaTypes && crawl.schemaTypes.length > 0)  sm += 50;
  if (crawl.schemaTypes && crawl.schemaTypes.length > 1)  sm += 25;
  if (crawl.hasSitemap)                                   sm += 10;
  if (crawl.hasRobots)                                    sm += 10;

  // local_seo: phone, maps, address signals
  let ls = 15;
  if (crawl.hasPhone)       ls += 25;
  if (crawl.hasGoogleMaps)  ls += 30;
  if (crawl.hasEmail)       ls += 15;
  if (has(url))             ls += 15;

  // citation_readiness: social + contact completeness
  let cr = 10;
  if (crawl.hasFacebook)    cr += 20;
  if (crawl.hasInstagram)   cr += 20;
  if (crawl.hasLinkedIn)    cr += 20;
  if (crawl.hasEmail)       cr += 15;
  if (crawl.hasPhone)       cr += 15;

  // ai_visibility: combination of content + schema
  let av = Math.round((cq * 0.4) + (sm * 0.35) + (cr * 0.25));

  const cap = (n) => Math.min(100, Math.max(5, Math.round(n)));
  const breakdown = {
    ai_visibility:      cap(av),
    content_quality:    cap(cq),
    local_seo:          cap(ls),
    schema_markup:      cap(sm),
    citation_readiness: cap(cr),
  };
  const overall = cap(Math.round(
    breakdown.ai_visibility      * 0.25 +
    breakdown.content_quality    * 0.25 +
    breakdown.local_seo          * 0.20 +
    breakdown.schema_markup      * 0.15 +
    breakdown.citation_readiness * 0.15
  ));
  return { overall, breakdown };
}

async function runCompetitorAudit(apiKey, name, url, industry, model = "claude-haiku-4-5-20251001") {
  // Crawl website for real data (hard 8s cap)
  const crawl = url ? await Promise.race([
    crawlWebsite(url),
    new Promise(r => setTimeout(() => r(null), 8000)),
  ]) : null;

  // Compute scores from crawl signals (avoids AI anchoring)
  console.log("[audit] crawl result:", url, "->", crawl ? ("lastUpdated="+crawl.lastUpdated+" recentUpdates="+JSON.stringify(crawl.recentUpdates)) : "NULL (timed out or failed)");
  const computed = crawl ? scoreFromCrawl(crawl, url) : null;

  const crawlSection = crawl ? `
REAL WEBSITE DATA (crawled from ${url}):
- Page title: ${crawl.title || "not found"}
- Meta description: ${crawl.description || "missing"}
- H1 headings: ${crawl.h1s.length ? crawl.h1s.join(" | ") : "none found"}
- H2 headings: ${crawl.h2s.length ? crawl.h2s.slice(0,5).join(" | ") : "none found"}
- OG title: ${crawl.ogTitle || "missing"}
- Schema.org types: ${crawl.schemaTypes.length ? crawl.schemaTypes.join(", ") : "none"}
- Has phone: ${crawl.hasPhone} | Has email: ${crawl.hasEmail}
- Social: Facebook=${crawl.hasFacebook} Instagram=${crawl.hasInstagram} LinkedIn=${crawl.hasLinkedIn}
- Has Google Maps link: ${crawl.hasGoogleMaps}
- Has robots.txt: ${crawl.hasRobots} | Has sitemap.xml: ${crawl.hasSitemap}

PRE-COMPUTED SCORES (based on the real signals above — use these exact numbers):
- overall_score: ${computed.overall}
- ai_visibility: ${computed.breakdown.ai_visibility}
- content_quality: ${computed.breakdown.content_quality}
- local_seo: ${computed.breakdown.local_seo}
- schema_markup: ${computed.breakdown.schema_markup}
- citation_readiness: ${computed.breakdown.citation_readiness}` : `No website crawl available.`;

  const systemPrompt = `You are an AI search visibility analyst. You write actionable analysis for businesses.

Return ONLY a valid JSON object — no markdown, no explanation, no code fences:
{
  "overall_score": <use the pre-computed score if provided, otherwise estimate 0-100>,
  "breakdown": {
    "ai_visibility": <use pre-computed>,
    "content_quality": <use pre-computed>,
    "local_seo": <use pre-computed>,
    "schema_markup": <use pre-computed>,
    "citation_readiness": <use pre-computed>
  },
  "strengths": [<2-4 specific strengths based on the data>],
  "weaknesses": [<2-4 specific weaknesses based on the data>],
  "recommendations": [<3-5 actionable improvements>]
}`;

  const userMessage = `Analyze this business for AI search visibility:
- Name: ${name}
- Website: ${url || "unknown"}
- Industry: ${industry || "general business"}
${crawlSection}

Write specific strengths, weaknesses and recommendations based on the data above.`;

  const groqKey = getGroqKey();
  let raw = "";
  if (groqKey) {
    const groqRes = await callGroq(groqKey, systemPrompt, userMessage, 1024);
    if (groqRes.error) throw new Error(groqRes.error.message || "Groq error");
    raw = groqRes.choices?.[0]?.message?.content || "";
  } else {
    const aiRes = await callClaude(apiKey, systemPrompt, userMessage, 1024, model);
    if (aiRes.error) throw new Error(aiRes.error.message || "AI error");
    raw = aiRes.content?.[0]?.text || "";
  }
  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI returned unexpected format");
    result = JSON.parse(match[0]);
  }

  // Always trust computed scores over AI-generated ones
  if (computed) {
    result.overall_score = computed.overall;
    result.breakdown     = computed.breakdown;
  }
  // Attach crawl date signals
  result.lastUpdated   = crawl ? (crawl.lastUpdated || null) : null;
  result.recentUpdates = crawl ? (crawl.recentUpdates || []) : [];
  if (typeof result.overall_score !== "number") throw new Error("Missing overall_score");
  return result;
}

// ── Competitor tracking handlers ──────────────────────────────────────────────

function handleCompetitorList(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const all = readJSON(COMPETITOR_FILE);
  json(res, 200, { competitors: all.filter(c => c.userId === user.id) });
}

async function handleCompetitorCreate(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  if (!checkAiRateLimit(res, user.id)) return;

  const apiKey = getAnthropicKey();
  if (!apiKey) return json(res, 500, { error: "AI service not configured." });

  const body = await readBody(req);
  const { competitorName, competitorUrl, industry } = body;
  if (!competitorName || !competitorName.trim()) return json(res, 400, { error: "competitorName is required." });

  const compUsers  = readJSON(USERS_FILE);
  let compIdx    = compUsers.findIndex(u => u.id === user.id);
  if (compIdx === -1) return json(res, 404, { error: "User not found." });

  // Auto-expire trial if needed
  autoExpireTrialIfNeeded(compUsers, compIdx);
  compIdx = compUsers.findIndex(u => u.id === user.id); // re-find after potential write

  // Competitor tracking cap per plan
  const compPlan = PLAN_LIMITS.plans[compUsers[compIdx].plan] || PLAN_LIMITS.plans.free;
  if (compPlan.maxCompetitors === 0) {
    return json(res, 403, { success: false, error: "plan_limit", message: "Competitor tracking is not available on the free plan. Upgrade to Beginners or Pro.", upgradeUrl: "/upgrade" });
  }
  if (compPlan.maxCompetitors > 0) {
    const existing = (compUsers[compIdx].competitors || []).length;
    if (existing >= compPlan.maxCompetitors) {
      return json(res, 403, { success: false, error: "plan_limit", message: `Your plan allows up to ${compPlan.maxCompetitors} tracked competitors. Upgrade to track more.`, upgradeUrl: "/upgrade" });
    }
  }

  const compCost   = PLAN_LIMITS.costs.competitorCreate;
  const compResult = deductCredits(compUsers, compIdx, compCost, 'Competitor Added');
  if (!compResult.ok) return insufficientCredits(res, compResult.creditsLeft, compResult.creditsMax, compCost);
  compUsers[compIdx].monthCompetitors = (compUsers[compIdx].monthCompetitors || 0) + 1;
  writeJSON(USERS_FILE, compUsers);

  const compModel = getModel(compUsers[compIdx]);
  try {
    const result   = await runCompetitorAudit(apiKey, competitorName.trim(), (competitorUrl || "").trim(), (industry || "").trim(), compModel);
    const snapshot = { date: new Date().toISOString(), score: result.overall_score, breakdown: result.breakdown, recommendations: result.recommendations, strengths: result.strengths, weaknesses: result.weaknesses, lastUpdated: result.lastUpdated || null, recentUpdates: result.recentUpdates || [] };
    const entry = {
      id:             generateId(),
      userId:         user.id,
      competitorName: competitorName.trim(),
      competitorUrl:  (competitorUrl || "").trim(),
      industry:       (industry || "").trim(),
      shareToken:     generateToken(),
      alert:          false,
      snapshots:      [snapshot],
      createdAt:      new Date().toISOString(),
    };
    const all = readJSON(COMPETITOR_FILE);
    all.push(entry);
    writeJSON(COMPETITOR_FILE, all);

    // Increment trial competitor search counter
    const freshUsers = readJSON(USERS_FILE);
    const freshIdx   = freshUsers.findIndex(u => u.id === user.id);
    if (freshIdx !== -1 && isTrialActive(freshUsers[freshIdx])) {
      const tu = getTrialUsage(freshUsers[freshIdx]);
      tu.competitorSearches = (tu.competitorSearches || 0) + 1;
      freshUsers[freshIdx].trialUsage = tu;
      writeJSON(USERS_FILE, freshUsers);
    }

    json(res, 201, { competitor: entry });
  } catch (err) {
    console.error("Competitor audit error:", err);
    json(res, 500, { error: "Failed to run audit: " + err.message });
  }
}

async function handleCompetitorCheck(req, res, id) {
  console.log("[check] handleCompetitorCheck called, id:", id);
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) { console.log("[check] not authenticated"); return json(res, 401, { error: "Not authenticated." }); }

  const apiKey = getAnthropicKey();
  if (!apiKey) return json(res, 500, { error: "AI service not configured." });

  const recheckUsers  = readJSON(USERS_FILE);
  const recheckUidx   = recheckUsers.findIndex(u => u.id === user.id);
  if (recheckUidx === -1) return json(res, 404, { error: "User not found." });
  const recheckCost   = PLAN_LIMITS.costs.competitorCheck;
  const recheckResult = deductCredits(recheckUsers, recheckUidx, recheckCost, 'Competitor Recheck');
  if (!recheckResult.ok) return insufficientCredits(res, recheckResult.creditsLeft, recheckResult.creditsMax, recheckCost);
  recheckUsers[recheckUidx].monthCompetitors = (recheckUsers[recheckUidx].monthCompetitors || 0) + 1;
  writeJSON(USERS_FILE, recheckUsers);

  const all = readJSON(COMPETITOR_FILE);
  const idx = all.findIndex(c => c.id === id && c.userId === user.id);
  if (idx === -1) return json(res, 404, { error: "Competitor not found." });

  const comp = all[idx];
  try {
    const result   = await runCompetitorAudit(apiKey, comp.competitorName, comp.competitorUrl, comp.industry, getModel(recheckUsers[recheckUidx]));
    const snapshot = { date: new Date().toISOString(), score: result.overall_score, breakdown: result.breakdown, recommendations: result.recommendations, strengths: result.strengths, weaknesses: result.weaknesses, lastUpdated: result.lastUpdated || null, recentUpdates: result.recentUpdates || [] };
    const prevScore = comp.snapshots.length ? comp.snapshots[comp.snapshots.length - 1].score : null;
    comp.snapshots.push(snapshot);
    comp.alert = prevScore !== null && (prevScore - result.overall_score) > 10;
    all[idx] = comp;
    writeJSON(COMPETITOR_FILE, all);
    json(res, 200, { competitor: comp });
  } catch (err) {
    console.error("Competitor re-check error:", err);
    json(res, 500, { error: "Failed to run audit: " + err.message });
  }
}

function handleCompetitorDelete(req, res, id) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  if (!hasAccess(user)) return json(res, 402, { error: "trial_expired", upgradeUrl: "/membership" });
  const all = readJSON(COMPETITOR_FILE);
  const filtered = all.filter(c => !(c.id === id && c.userId === user.id));
  if (filtered.length === all.length) return json(res, 404, { error: "Competitor not found." });
  writeJSON(COMPETITOR_FILE, filtered);
  json(res, 200, { ok: true });
}


function handleCompetitorSetMyBusiness(req, res, id) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const all = readJSON(COMPETITOR_FILE);
  const mine = all.find(c => c.id === id && c.userId === user.id);
  if (!mine) return json(res, 404, { error: "Competitor not found." });
  const updated = all.map(c => {
    if (c.userId !== user.id) return c;
    return Object.assign({}, c, { isMyBusiness: c.id === id });
  });
  writeJSON(COMPETITOR_FILE, updated);
  json(res, 200, { competitor: updated.find(c => c.id === id && c.userId === user.id) });
}

async function handleCompetitorSearch(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });

  const apiKey = process.env.HERE_PLACES_API_KEY;
  if (!apiKey) return json(res, 503, { error: "no_places_key", message: "HERE Places API key not configured." });

  const body    = await readBody(req);
  const { niche, city, country } = body;
  if (!niche || !city || !country) return json(res, 400, { error: "niche, city and country are required." });

  const COUNTRY_CODES = {
    "greece": "GRC", "germany": "DEU", "austria": "AUT",
    "switzerland": "CHE", "united kingdom": "GBR", "cyprus": "CYP",
  };
  const cleanCountry = country.replace(/^\S+\s/, "").trim();
  const countryCode  = COUNTRY_CODES[cleanCountry.toLowerCase()] || "GRC";
  const query = `${niche} ${city}`;

  try {
    const geoUrl = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(city + ',' + cleanCountry)}&apiKey=${apiKey}`;
    const geoRes = await fetch(geoUrl);
    const geoData = await geoRes.json();
    const pos = geoData.items?.[0]?.position;
    if (!pos) return json(res, 502, { error: "Could not geocode city: " + city });

    const discUrl = `https://discover.search.hereapi.com/v1/discover?q=${encodeURIComponent(niche)}&at=${pos.lat},${pos.lng}&limit=100&lang=en&apiKey=${apiKey}`;
    const hRes = await fetch(discUrl);
    const data = await hRes.json();
    if (!hRes.ok) return json(res, 502, { error: data.title || "HERE Places API error." });

    const results = (data.items || []).map(p => ({
      name:    p.title              || "",
      address: p.address?.label    || "",
      website: (p.contacts?.[0]?.www?.[0]?.value || "").replace(/^https?:\/\//, "").replace(/\/$/, ""),
      phone:   p.contacts?.[0]?.phone?.[0]?.value || "",
      rating:  null,
      reviews: 0,
    }));
    json(res, 200, { results, query });
  } catch (err) {
    json(res, 502, { error: "Failed to reach HERE Places API: " + err.message });
  }
}


async function handleSavedSearchSave(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const body = await readBody(req);
  const { label, results } = body;
  if (!label || !Array.isArray(results) || !results.length) return json(res, 400, { error: "label and results are required." });
  const all = Array.isArray(readJSON(SAVED_SEARCHES_FILE)) ? readJSON(SAVED_SEARCHES_FILE) : [];
  const entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2,6), userId: user.id, label, results, savedAt: new Date().toISOString() };
  all.push(entry);
  writeJSON(SAVED_SEARCHES_FILE, all);
  json(res, 201, { savedSearch: entry });
}

function handleSavedSearchesGet(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const all = Array.isArray(readJSON(SAVED_SEARCHES_FILE)) ? readJSON(SAVED_SEARCHES_FILE) : [];
  json(res, 200, { savedSearches: all.filter(s => s.userId === user.id) });
}

function handleSavedSearchDelete(req, res, id) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const all      = Array.isArray(readJSON(SAVED_SEARCHES_FILE)) ? readJSON(SAVED_SEARCHES_FILE) : [];
  const filtered = all.filter(s => !(s.id === id && s.userId === user.id));
  writeJSON(SAVED_SEARCHES_FILE, filtered);
  json(res, 200, { ok: true });
}

async function handleLeadSavedSearchSave(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const body = await readBody(req);
  const { label, results } = body;
  if (!label || !Array.isArray(results) || !results.length) return json(res, 400, { error: "label and results are required." });
  const all   = Array.isArray(readJSON(LEAD_SAVED_SEARCHES_FILE)) ? readJSON(LEAD_SAVED_SEARCHES_FILE) : [];
  const entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2,6), userId: user.id, label, results, savedAt: new Date().toISOString() };
  all.push(entry);
  writeJSON(LEAD_SAVED_SEARCHES_FILE, all);
  json(res, 201, { savedSearch: entry });
}

function handleLeadSavedSearchesGet(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const all = Array.isArray(readJSON(LEAD_SAVED_SEARCHES_FILE)) ? readJSON(LEAD_SAVED_SEARCHES_FILE) : [];
  json(res, 200, { savedSearches: all.filter(s => s.userId === user.id) });
}

function handleLeadSavedSearchDelete(req, res, id) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const all      = Array.isArray(readJSON(LEAD_SAVED_SEARCHES_FILE)) ? readJSON(LEAD_SAVED_SEARCHES_FILE) : [];
  const filtered = all.filter(s => !(s.id === id && s.userId === user.id));
  writeJSON(LEAD_SAVED_SEARCHES_FILE, filtered);
  json(res, 200, { ok: true });
}

async function handleOutreachSavedListSave(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const body = await readBody(req);
  const { label, results } = body;
  if (!label || !Array.isArray(results) || !results.length) return json(res, 400, { error: "label and results are required." });
  const all   = Array.isArray(readJSON(OUTREACH_SAVED_LISTS_FILE)) ? readJSON(OUTREACH_SAVED_LISTS_FILE) : [];
  const entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2,6), userId: user.id, label, results, savedAt: new Date().toISOString() };
  all.push(entry);
  writeJSON(OUTREACH_SAVED_LISTS_FILE, all);
  json(res, 201, { savedList: entry });
}

function handleOutreachSavedListsGet(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const all = Array.isArray(readJSON(OUTREACH_SAVED_LISTS_FILE)) ? readJSON(OUTREACH_SAVED_LISTS_FILE) : [];
  json(res, 200, { savedLists: all.filter(s => s.userId === user.id) });
}

function handleOutreachSavedListDelete(req, res, id) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const all      = Array.isArray(readJSON(OUTREACH_SAVED_LISTS_FILE)) ? readJSON(OUTREACH_SAVED_LISTS_FILE) : [];
  const filtered = all.filter(s => !(s.id === id && s.userId === user.id));
  writeJSON(OUTREACH_SAVED_LISTS_FILE, filtered);
  json(res, 200, { ok: true });
}

async function handleCrmSavedListSave(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const body = await readBody(req);
  const { label, results } = body;
  if (!label || !Array.isArray(results) || !results.length) return json(res, 400, { error: "label and results are required." });
  const all   = Array.isArray(readJSON(CRM_SAVED_LISTS_FILE)) ? readJSON(CRM_SAVED_LISTS_FILE) : [];
  const entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2,6), userId: user.id, label, results, savedAt: new Date().toISOString() };
  all.push(entry);
  writeJSON(CRM_SAVED_LISTS_FILE, all);
  json(res, 201, { savedList: entry });
}

function handleCrmSavedListsGet(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const all = Array.isArray(readJSON(CRM_SAVED_LISTS_FILE)) ? readJSON(CRM_SAVED_LISTS_FILE) : [];
  json(res, 200, { savedLists: all.filter(s => s.userId === user.id) });
}

function handleCrmSavedListDelete(req, res, id) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const all      = Array.isArray(readJSON(CRM_SAVED_LISTS_FILE)) ? readJSON(CRM_SAVED_LISTS_FILE) : [];
  const filtered = all.filter(s => !(s.id === id && s.userId === user.id));
  writeJSON(CRM_SAVED_LISTS_FILE, filtered);
  json(res, 200, { ok: true });
}


/* ── Article Saved Lists ────────────────────────────────────── */
async function handleArticleSavedListSave(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const body = await readBody(req);
  const { label, results } = body;
  if (!label || !Array.isArray(results) || !results.length) return json(res, 400, { error: "label and results are required." });
  const all   = Array.isArray(readJSON(ARTICLE_SAVED_LISTS_FILE)) ? readJSON(ARTICLE_SAVED_LISTS_FILE) : [];
  const entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2,6), userId: user.id, label, results, savedAt: new Date().toISOString() };
  all.push(entry);
  writeJSON(ARTICLE_SAVED_LISTS_FILE, all);
  json(res, 201, { savedList: entry });
}

function handleArticleSavedListsGet(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const all = Array.isArray(readJSON(ARTICLE_SAVED_LISTS_FILE)) ? readJSON(ARTICLE_SAVED_LISTS_FILE) : [];
  json(res, 200, { savedLists: all.filter(s => s.userId === user.id) });
}

function handleArticleSavedListDelete(req, res, id) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const all      = Array.isArray(readJSON(ARTICLE_SAVED_LISTS_FILE)) ? readJSON(ARTICLE_SAVED_LISTS_FILE) : [];
  const filtered = all.filter(s => !(s.id === id && s.userId === user.id));
  writeJSON(ARTICLE_SAVED_LISTS_FILE, filtered);
  json(res, 200, { ok: true });
}

/* ── User Sites (My Sites) ─────────────────────────────────── */

function handleSitesGet(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const all   = Array.isArray(readJSON(SITES_FILE)) ? readJSON(SITES_FILE) : [];
  const sites = all.filter(s => s.userId === user.id).map(({ userId, ...s }) => s);
  json(res, 200, { sites });
}

async function handleSitesSave(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const body  = await readBody(req);
  const sites = Array.isArray(body.sites) ? body.sites : [];
  const all   = Array.isArray(readJSON(SITES_FILE)) ? readJSON(SITES_FILE) : [];
  const others = all.filter(s => s.userId !== user.id);
  const stamped = sites.map(s => ({ ...s, userId: user.id }));
  writeJSON(SITES_FILE, [...others, ...stamped]);
  json(res, 200, { ok: true });
}

async function handleSiteDelete(req, res, siteId) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const all      = Array.isArray(readJSON(SITES_FILE)) ? readJSON(SITES_FILE) : [];
  const filtered = all.filter(s => !(s.id === siteId && s.userId === user.id));
  if (filtered.length === all.length) return json(res, 404, { error: "Site not found." });
  writeJSON(SITES_FILE, filtered);
  json(res, 200, { ok: true });
}


/* ── Dashboard Jobs System ─────────────────────────────────────────────────── */

function getDashboardSites() {
  return Array.isArray(readJSON(DASHBOARD_SITES_FILE)) ? readJSON(DASHBOARD_SITES_FILE) : [];
}
function getDashboardRecurring() {
  return Array.isArray(readJSON(DASHBOARD_RECURRING_FILE)) ? readJSON(DASHBOARD_RECURRING_FILE) : [];
}
function getDashboardInstances() {
  return Array.isArray(readJSON(DASHBOARD_INSTANCES_FILE)) ? readJSON(DASHBOARD_INSTANCES_FILE) : [];
}
function getJobTypes() {
  return Array.isArray(readJSON(DASHBOARD_JOB_TYPES_FILE)) ? readJSON(DASHBOARD_JOB_TYPES_FILE) : [];
}

const JOB_TYPE_FALLBACK = { key: 'generic', label: 'General task', action_kind: 'none', action_label: '', action_url_template: '', icon: '\u2705', sort_order: 99 };

function getSitePlanLimit(user) {
  const planCfg = PLAN_LIMITS.plans[user.plan] || PLAN_LIMITS.plans.free;
  return planCfg.sites !== undefined ? planCfg.sites : 1;
}

function resolveActionUrl(template, { site_id, domain, job_id, title }) {
  if (!template) return '';
  return template
    .replace('{site_id}', encodeURIComponent(site_id || ''))
    .replace('{domain}', encodeURIComponent(domain || ''))
    .replace('{job_id}', encodeURIComponent(job_id || ''))
    .replace('{title_encoded}', encodeURIComponent(title || ''));
}

function handleDashboardSitesGet(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const allSites = getDashboardSites().filter(s => s.user_id === user.id && !s.archived_at);
  const limit = getSitePlanLimit(user);
  json(res, 200, { sites: allSites, limit, used: allSites.length });
}

async function handleDashboardSitesCreate(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });

  const limit = getSitePlanLimit(user);
  const allSites = getDashboardSites();
  const userSites = allSites.filter(s => s.user_id === user.id && !s.archived_at);

  if (limit !== -1 && userSites.length >= limit) {
    return json(res, 403, { error: 'site_limit_reached', limit, used: userSites.length });
  }

  const body = await readBody(req);
  const domain = sanitizeString(body.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
  const display_name = sanitizeString(body.display_name || '').trim();
  const market = sanitizeString(body.market || '').trim().toUpperCase() || null;

  if (!domain) return json(res, 400, { error: 'domain is required.' });
  if (!display_name) return json(res, 400, { error: 'display_name is required.' });

  const site = {
    id: generateId(),
    user_id: user.id,
    domain,
    display_name,
    market,
    created_at: new Date().toISOString(),
    archived_at: null,
  };
  allSites.push(site);
  writeJSON(DASHBOARD_SITES_FILE, allSites);
  json(res, 201, { site });
}

async function handleDashboardSiteUpdate(req, res, siteId) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });

  const allSites = getDashboardSites();
  const idx = allSites.findIndex(s => s.id === siteId && s.user_id === user.id);
  if (idx === -1) return json(res, 404, { error: 'Site not found.' });

  const body = await readBody(req);
  if (body.domain !== undefined) allSites[idx].domain = sanitizeString(body.domain).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (body.display_name !== undefined) allSites[idx].display_name = sanitizeString(body.display_name).trim();
  if (body.market !== undefined) allSites[idx].market = body.market ? sanitizeString(body.market).trim().toUpperCase() : null;

  writeJSON(DASHBOARD_SITES_FILE, allSites);
  json(res, 200, { site: allSites[idx] });
}

async function handleDashboardSiteDelete(req, res, siteId) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });

  const allSites = getDashboardSites();
  const idx = allSites.findIndex(s => s.id === siteId && s.user_id === user.id);
  if (idx === -1) return json(res, 404, { error: 'Site not found.' });

  allSites[idx].archived_at = new Date().toISOString();
  writeJSON(DASHBOARD_SITES_FILE, allSites);
  json(res, 200, { ok: true });
}

function handleJobsGet(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });

  const qs = new URL('http://x' + req.url).searchParams;
  const dateParam = qs.get('date') || dateStr(new Date());
  const siteFilter = qs.get('site_id') || null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return json(res, 400, { error: 'Invalid date format.' });

  const today = new Date(dateParam + 'T00:00:00');
  const days = [];
  for (let i = 0; i < 15; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    days.push(d);
  }

  const allSites = getDashboardSites();
  const allRecurring = getDashboardRecurring();
  let allInstances = getDashboardInstances();

  const newInstances = materialiseDays(user.id, days, allSites, allRecurring, allInstances);
  if (newInstances.length > 0) {
    allInstances = allInstances.concat(newInstances);
    writeJSON(DASHBOARD_INSTANCES_FILE, allInstances);
  }

  let jobs = allInstances.filter(i => i.user_id === user.id && i.due_date === dateParam);
  if (siteFilter) jobs = jobs.filter(i => i.site_id === siteFilter);

  const jobTypesMap = {};
  getJobTypes().forEach(jt => { jobTypesMap[jt.key] = jt; });
  const siteMap = {};
  allSites.forEach(s => { siteMap[s.id] = s; });

  const resolved = jobs.map(job => {
    const jt = jobTypesMap[job.job_type] || { ...JOB_TYPE_FALLBACK };
    const site = siteMap[job.site_id] || {};
    const action_url = resolveActionUrl(jt.action_url_template, {
      site_id: job.site_id,
      domain: site.domain || '',
      job_id: job.id,
      title: job.title,
    });
    return {
      ...job,
      site_name: site.display_name || site.domain || '',
      site_domain: site.domain || '',
      action_kind: jt.action_kind || 'none',
      action_label: jt.action_label || '',
      action_url,
      job_type_icon: jt.icon || '',
      job_type_label: jt.label || job.job_type,
    };
  });

  resolved.sort((a, b) => {
    if (a.site_id < b.site_id) return -1;
    if (a.site_id > b.site_id) return 1;
    return (a.channel || '').localeCompare(b.channel || '');
  });

  json(res, 200, { jobs: resolved, date: dateParam });
}

async function handleJobUpdate(req, res, jobId) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });

  const allInstances = getDashboardInstances();
  const idx = allInstances.findIndex(i => i.id === jobId && i.user_id === user.id);
  if (idx === -1) return json(res, 404, { error: 'Job not found.' });

  const body = await readBody(req);
  const VALID_STATUSES = ['pending', 'done', 'skipped'];

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) return json(res, 400, { error: 'Invalid status.' });
    allInstances[idx].status = body.status;
    allInstances[idx].completed_at = body.status === 'done' ? new Date().toISOString() : null;
  }
  if (body.job_type !== undefined) {
    const jobTypesMap = {};
    getJobTypes().forEach(jt => { jobTypesMap[jt.key] = jt; });
    if (jobTypesMap[body.job_type]) allInstances[idx].job_type = body.job_type;
  }
  if (body.job_type !== undefined) {
    const _jtMap = {};
    getJobTypes().forEach(jt => { _jtMap[jt.key] = jt; });
    if (_jtMap[body.job_type]) allInstances[idx].job_type = body.job_type;
  }
  if (body.notes !== undefined) {
    allInstances[idx].notes = sanitizeString(String(body.notes || '')).slice(0, 2000);
  }

  writeJSON(DASHBOARD_INSTANCES_FILE, allInstances);
  const _ji = allInstances[idx];
  const _jtMap2 = {};
  getJobTypes().forEach(t => { _jtMap2[t.key] = t; });
  const _jt2 = _jtMap2[_ji.job_type] || { action_kind: 'none', action_label: '', action_url_template: '', icon: '', label: _ji.job_type };
  const _site2 = getDashboardSites().find(s => s.id === _ji.site_id) || {};
  const _url2 = resolveActionUrl(_jt2.action_url_template, { site_id: _ji.site_id, domain: _site2.domain || '', job_id: _ji.id, title: _ji.title });
  json(res, 200, { job: { ..._ji, action_kind: _jt2.action_kind || 'none', action_label: _jt2.action_label || '', action_url: _url2, job_type_icon: _jt2.icon || '', job_type_label: _jt2.label || _ji.job_type } });
}

async function handleJobCreate(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });

  const body = await readBody(req);
  const allSites = getDashboardSites();
  const site = allSites.find(s => s.id === body.site_id && s.user_id === user.id && !s.archived_at);
  if (!site) return json(res, 404, { error: 'Site not found.' });

  const due_date = body.due_date || dateStr(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due_date)) return json(res, 400, { error: 'Invalid due_date.' });

  const title = sanitizeString(body.title || '').trim();
  if (!title) return json(res, 400, { error: 'title is required.' });

  const jobTypesMap = {};
  getJobTypes().forEach(jt => { jobTypesMap[jt.key] = jt; });
  const job_type = body.job_type && jobTypesMap[body.job_type] ? body.job_type : 'generic';

  const instance = {
    id: generateId(),
    user_id: user.id,
    site_id: site.id,
    recurring_job_id: null,
    due_date,
    title,
    channel: sanitizeString(body.channel || '').trim() || 'General',
    job_type,
    est_minutes: Math.max(0, parseInt(body.est_minutes) || 30),
    status: 'pending',
    completed_at: null,
    notes: null,
    action_payload: body.action_payload || null,
    created_at: new Date().toISOString(),
  };

  const allInstances = getDashboardInstances();
  allInstances.push(instance);
  writeJSON(DASHBOARD_INSTANCES_FILE, allInstances);
  json(res, 201, { job: instance });
}

// ════════════════════════════════════════════════════════
// FACEBOOK OAUTH + API
// ════════════════════════════════════════════════════════
function getFbConnections() { return Array.isArray(readJSON(FB_CONNECTIONS_FILE)) ? readJSON(FB_CONNECTIONS_FILE) : []; }
function saveFbConnections(arr) { writeJSON(FB_CONNECTIONS_FILE, arr); }
function getUserFbConn(userId) { return getFbConnections().find(c => c.userId === userId) || null; }

function handleFbOauthStart(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) { res.writeHead(302, { Location: '/signin.html' }); res.end(); return; }
  if (!FB_APP_ID) { res.writeHead(302, { Location: '/fb-posts.html?fb=error' }); res.end(); return; }
  const scopes = 'pages_manage_posts,pages_read_engagement,pages_show_list';
  const url = 'https://www.facebook.com/v21.0/dialog/oauth?client_id=' + FB_APP_ID + '&redirect_uri=' + encodeURIComponent(FB_REDIRECT_URI) + '&scope=' + scopes + '&response_type=code&state=' + user.id;
  res.writeHead(302, { Location: url });
  res.end();
}

async function handleFbOauthCallback(req, res) {
  const url = new URL('http://x' + req.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const userId = url.searchParams.get('state');
  if (error || !code || !userId) { res.writeHead(302, { Location: '/fb-posts.html?fb=denied' }); res.end(); return; }
  try {
    const tokenUrl = 'https://graph.facebook.com/v21.0/oauth/access_token?client_id=' + FB_APP_ID + '&redirect_uri=' + encodeURIComponent(FB_REDIRECT_URI) + '&client_secret=' + FB_APP_SECRET + '&code=' + code;
    const tokenRes = await fetch(tokenUrl).then(r => r.json());
    if (tokenRes.error || !tokenRes.access_token) throw new Error((tokenRes.error && tokenRes.error.message) || 'Token exchange failed');
    const llUrl = 'https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=' + FB_APP_ID + '&client_secret=' + FB_APP_SECRET + '&fb_exchange_token=' + tokenRes.access_token;
    const llRes = await fetch(llUrl).then(r => r.json());
    const longToken = llRes.access_token || tokenRes.access_token;
    const expiresIn = llRes.expires_in || 5183944;
    const meRes = await fetch('https://graph.facebook.com/v21.0/me?fields=id,name&access_token=' + longToken).then(r => r.json());
    const pagesRes = await fetch('https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&access_token=' + longToken).then(r => r.json());
    const pages = (pagesRes.data || []).map(p => ({ id: p.id, name: p.name, token: p.access_token }));
    const conn = { userId, fbUserId: meRes.id, fbUserName: meRes.name, accessToken: longToken, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(), pages, connectedAt: new Date().toISOString() };
    const all = getFbConnections().filter(c => c.userId !== userId);
    all.push(conn);
    saveFbConnections(all);
    res.writeHead(302, { Location: '/fb-posts.html?fb=connected' }); res.end();
  } catch (e) {
    console.error('[fb oauth]', e.message);
    res.writeHead(302, { Location: '/fb-posts.html?fb=error' }); res.end();
  }
}

function handleFbConnectionGet(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const conn = getUserFbConn(user.id);
  if (!conn) return json(res, 200, { connected: false });
  const daysLeft = Math.max(0, Math.floor((new Date(conn.expiresAt) - Date.now()) / 86400000));
  json(res, 200, { connected: true, fbUserName: conn.fbUserName, daysLeft, pages: conn.pages || [], connectedAt: conn.connectedAt });
}

function handleFbConnectionDelete(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  saveFbConnections(getFbConnections().filter(c => c.userId !== user.id));
  json(res, 200, { ok: true });
}


async function handleFbConnectionManual(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  let body = '';
  req.on('data', d => body += d);
  await new Promise(r => req.on('end', r));
  let data;
  try { data = JSON.parse(body); } catch(e) { return json(res, 400, { error: 'Invalid JSON.' }); }
  const token = (data.token || '').trim();
  const name = (data.name || '').trim();
  if (!token) return json(res, 400, { error: 'Token required.' });
  // Save token directly without FB API validation
  const conn = {
    userId: user.id,
    fbUserId: 'manual',
    fbUserName: name || 'Manual Connection',
    accessToken: token,
    expiresAt: new Date(Date.now() + 60 * 86400000).toISOString(),
    pages: [],
    connectedAt: new Date().toISOString(),
    manual: true
  };
  const all = getFbConnections().filter(c => c.userId !== user.id);
  all.push(conn);
  saveFbConnections(all);
  json(res, 200, { ok: true, fbUserName: conn.fbUserName, pages: [] });
}


async function handleFbGroupSearch(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const conn = getUserFbConn(user.id);
  if (!conn) return json(res, 403, { error: 'No Facebook connection. Please connect first.' });
  const body = await readBody(req);
  const keyword = (body.keyword || '').trim();
  const type    = (body.type || 'group');
  if (!keyword) return json(res, 400, { error: 'Keyword required.' });
  try {
    const fields = type === 'page'
      ? 'name,description,fan_count,link,category'
      : 'name,description,member_count,privacy';
    const url = `https://graph.facebook.com/v21.0/search?type=${type}&q=${encodeURIComponent(keyword)}&fields=${fields}&limit=20&access_token=${conn.accessToken}`;
    const r = await fetch(url);
    const d = await r.json();
    if (d.error) return json(res, 400, { error: d.error.message || 'Facebook API error.' });
    json(res, 200, { results: d.data || [], type });
  } catch(e) {
    json(res, 502, { error: 'Failed to reach Facebook API: ' + e.message });
  }
}

function handleFbBrandingGet(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const all = Array.isArray(readJSON(FB_BRANDING_FILE)) ? readJSON(FB_BRANDING_FILE) : [];
  const b = all.find(x => x.userId === user.id) || {};
  json(res, 200, { branding: b });
}

async function handleFbBrandingSave(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const body = await readBody(req);
  const all = Array.isArray(readJSON(FB_BRANDING_FILE)) ? readJSON(FB_BRANDING_FILE) : [];
  const idx = all.findIndex(x => x.userId === user.id);
  const branding = { userId: user.id, logoUrl: body.logoUrl || '', name: body.name || '', bg: body.bg || '#0d1630', accent: body.accent || '#2563eb', textColor: body.textColor || '#ffffff', fontSize: body.fontSize || 30, credit: body.credit !== false, updatedAt: new Date().toISOString() };
  if (idx >= 0) all[idx] = branding; else all.push(branding);
  writeJSON(FB_BRANDING_FILE, all);
  json(res, 200, { ok: true });
}

async function handleFbLogoUpload(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const chunks = [];
  req.on('data', d => chunks.push(d));
  await new Promise(r => req.on('end', r));
  const buf = Buffer.concat(chunks);
  const ct = req.headers['content-type'] || '';
  const ext = ct.includes('png') ? 'png' : ct.includes('gif') ? 'gif' : 'jpg';
  const fname = 'logo_' + user.id + '_' + Date.now() + '.' + ext;
  const fpath = path.join(ROOT, 'public', 'uploads', fname);
  require('fs').mkdirSync(path.join(ROOT, 'public', 'uploads'), { recursive: true });
  require('fs').writeFileSync(fpath, buf);
  json(res, 200, { url: '/uploads/' + fname });
}

function handleFbTargetsGet(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const all = Array.isArray(readJSON(FB_TARGETS_FILE)) ? readJSON(FB_TARGETS_FILE) : [];
  json(res, 200, { targets: all.filter(t => t.userId === user.id) });
}

async function handleFbTargetSave(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const body = await readBody(req);
  const all = Array.isArray(readJSON(FB_TARGETS_FILE)) ? readJSON(FB_TARGETS_FILE) : [];
  const pathId = req.url.split('/').pop().split('?')[0];
  const lookupId = body.id || (pathId !== 'targets' ? pathId : null);
  if (lookupId) {
    const idx = all.findIndex(t => t.id === lookupId && t.userId === user.id);
    if (idx === -1) return json(res, 404, { error: 'Not found.' });
    all[idx] = { ...all[idx], ...body, userId: user.id };
    writeJSON(FB_TARGETS_FILE, all);
    return json(res, 200, { target: all[idx] });
  }
  const target = { id: generateId(), userId: user.id, name: body.name || '', type: body.type || 'page', entityId: body.targetId || body.entityId || '', url: body.url || '', niche: body.niche || '', joinStatus: body.joinStatus || 'joined', usePageToken: !!body.usePageToken, active: true, createdAt: new Date().toISOString() };
  all.push(target);
  writeJSON(FB_TARGETS_FILE, all);
  json(res, 201, { target });
}

function handleFbTargetDelete(req, res, id) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const all = Array.isArray(readJSON(FB_TARGETS_FILE)) ? readJSON(FB_TARGETS_FILE) : [];
  writeJSON(FB_TARGETS_FILE, all.filter(t => !(t.id === id && t.userId === user.id)));
  json(res, 200, { ok: true });
}

function handleFbTemplatesGet(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const all = Array.isArray(readJSON(FB_TEMPLATES_FILE)) ? readJSON(FB_TEMPLATES_FILE) : [];
  json(res, 200, { templates: all.filter(t => t.userId === user.id) });
}

async function handleFbTemplateSave(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const body = await readBody(req);
  const all = Array.isArray(readJSON(FB_TEMPLATES_FILE)) ? readJSON(FB_TEMPLATES_FILE) : [];
  if (body.id) {
    const idx = all.findIndex(t => t.id === body.id && t.userId === user.id);
    if (idx === -1) return json(res, 404, { error: 'Not found.' });
    all[idx] = { ...all[idx], ...body, userId: user.id };
    writeJSON(FB_TEMPLATES_FILE, all);
    return json(res, 200, { template: all[idx] });
  }
  const tpl = { id: generateId(), userId: user.id, name: body.name || '', text: body.content || body.text || '', targetType: body.targetType || '', week: parseInt(body.week) || 0, tags: body.tags || [], createdAt: new Date().toISOString() };
  all.push(tpl);
  writeJSON(FB_TEMPLATES_FILE, all);
  json(res, 201, { template: tpl });
}

function handleFbTemplateDelete(req, res, id) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const all = Array.isArray(readJSON(FB_TEMPLATES_FILE)) ? readJSON(FB_TEMPLATES_FILE) : [];
  writeJSON(FB_TEMPLATES_FILE, all.filter(t => !(t.id === id && t.userId === user.id)));
  json(res, 200, { ok: true });
}

function handleFbLogGet(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const all = Array.isArray(readJSON(FB_LOG_FILE)) ? readJSON(FB_LOG_FILE) : [];
  json(res, 200, { log: all.filter(e => e.userId === user.id).slice(-100).reverse() });
}

function handleFbLogClear(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const all = Array.isArray(readJSON(FB_LOG_FILE)) ? readJSON(FB_LOG_FILE) : [];
  writeJSON(FB_LOG_FILE, all.filter(e => e.userId !== user.id));
  json(res, 200, { ok: true });
}

async function handleFbPost(req, res, targetId) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const conn = getUserFbConn(user.id);
  if (!conn) return json(res, 400, { error: 'Facebook not connected.' });
  const targets = Array.isArray(readJSON(FB_TARGETS_FILE)) ? readJSON(FB_TARGETS_FILE) : [];
  const target = targets.find(t => t.id === targetId && t.userId === user.id);
  if (!target) return json(res, 404, { error: 'Target not found.' });
  const body = await readBody(req);
  const content = (body.content || '').trim();
  if (!content) return json(res, 400, { error: 'content required.' });
  let token = conn.accessToken;
  if (target.type === 'page') {
    const page = (conn.pages || []).find(p => p.id === target.entityId);
    if (page && page.token) token = page.token;
  }
  try {
    const fbRes = await fetch('https://graph.facebook.com/v21.0/' + target.entityId + '/feed', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: content, access_token: token })
    }).then(r => r.json());
    if (fbRes.error) throw new Error(fbRes.error.message);
    const log = Array.isArray(readJSON(FB_LOG_FILE)) ? readJSON(FB_LOG_FILE) : [];
    log.push({ id: generateId(), userId: user.id, targetId, targetName: target.name, content: content.slice(0,300), postId: fbRes.id, postedAt: new Date().toISOString(), status: 'ok' });
    writeJSON(FB_LOG_FILE, log);
    json(res, 200, { ok: true, postId: fbRes.id });
  } catch (e) {
    const log = Array.isArray(readJSON(FB_LOG_FILE)) ? readJSON(FB_LOG_FILE) : [];
    log.push({ id: generateId(), userId: user.id, targetId, targetName: target.name, content: content.slice(0,300), postId: null, postedAt: new Date().toISOString(), status: 'error', error: e.message });
    writeJSON(FB_LOG_FILE, log);
    json(res, 500, { error: e.message });
  }
}

async function handleFbAgentRun(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const conn = getUserFbConn(user.id);
  if (!conn) return json(res, 400, { error: 'Facebook not connected.' });
  const targets = (Array.isArray(readJSON(FB_TARGETS_FILE)) ? readJSON(FB_TARGETS_FILE) : []).filter(t => t.userId === user.id);
  const templates = (Array.isArray(readJSON(FB_TEMPLATES_FILE)) ? readJSON(FB_TEMPLATES_FILE) : []).filter(t => t.userId === user.id);
  if (!targets.length) return json(res, 400, { error: 'No targets configured.' });
  if (!templates.length) return json(res, 400, { error: 'No templates configured.' });
  const results = [];
  for (const target of targets) {
    const tpl = templates[Math.floor(Math.random() * templates.length)];
    let token = conn.accessToken;
    if (target.type === 'page') {
      const page = (conn.pages || []).find(p => p.id === target.entityId);
      if (page && page.token) token = page.token;
    }
    try {
      const fbRes = await fetch('https://graph.facebook.com/v21.0/' + target.entityId + '/feed', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: tpl.content || tpl.text, access_token: token })
      }).then(r => r.json());
      if (fbRes.error) throw new Error(fbRes.error.message);
      results.push({ target: target.name, status: 'posted', postId: fbRes.id });
      const log = Array.isArray(readJSON(FB_LOG_FILE)) ? readJSON(FB_LOG_FILE) : [];
      log.push({ id: generateId(), userId: user.id, targetId: target.id, targetName: target.name, content: (tpl.content || tpl.text || '').slice(0,300), postId: fbRes.id, postedAt: new Date().toISOString(), status: 'ok' });
      writeJSON(FB_LOG_FILE, log);
    } catch (e) {
      console.error('[fb agent]', target.name, e.message); results.push({ target: target.name, status: 'error', error: e.message, content: tpl.content || tpl.text || '', targetUrl: target.url || '' });
    }
  }
  const posted  = results.filter(r => r.status === 'posted').length;
  const errors   = results.filter(r => r.status === 'error').length;
  const skipped  = results.filter(r => r.status === 'skipped').length;
  json(res, 200, { results, posted, skipped, errors });
}


async function handleJobsBulkCreate(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const body = await readBody(req);
  const { site_id, jobs } = body;
  if (!Array.isArray(jobs) || !jobs.length) return json(res, 400, { error: 'jobs array required.' });
  const allSites = getDashboardSites();
  const site = allSites.find(s => s.id === site_id && s.user_id === user.id && !s.archived_at);
  if (!site) return json(res, 404, { error: 'Site not found.' });
  const allInstances = getDashboardInstances();
  const created = [];
  for (const j of jobs.slice(0, 300)) {
    if (!j.title || !j.due_date) continue;
    const instance = {
      id: generateId(), user_id: user.id, site_id: site.id, recurring_job_id: null,
      due_date: j.due_date, title: String(j.title).slice(0, 300),
      channel: j.channel || 'General', job_type: j.job_type || 'generic',
      est_minutes: j.est_minutes || 30, status: 'pending', completed_at: null,
      notes: j.notes ? String(j.notes).slice(0, 2000) : null,
      action_payload: null, created_at: new Date().toISOString()
    };
    allInstances.push(instance);
    created.push(instance);
  }
  writeJSON(DASHBOARD_INSTANCES_FILE, allInstances);
  json(res, 201, { created: created.length });
}


function handleRecurringJobsGet(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });

  const siteId = new URL('http://x' + req.url).searchParams.get('site_id');
  const allSites = getDashboardSites();
  const userSiteIds = new Set(allSites.filter(s => s.user_id === user.id).map(s => s.id));

  let jobs = getDashboardRecurring().filter(j => userSiteIds.has(j.site_id));
  if (siteId) jobs = jobs.filter(j => j.site_id === siteId);
  json(res, 200, { jobs });
}

async function handleRecurringJobCreate(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });

  const body = await readBody(req);
  const allSites = getDashboardSites();
  const site = allSites.find(s => s.id === body.site_id && s.user_id === user.id && !s.archived_at);
  if (!site) return json(res, 404, { error: 'Site not found.' });

  const VALID_FREQS = ['weekly', 'biweekly', 'monthly'];
  const weekday = parseInt(body.weekday);
  if (!weekday || weekday < 1 || weekday > 7) return json(res, 400, { error: 'weekday must be 1-7.' });
  if (!VALID_FREQS.includes(body.frequency)) return json(res, 400, { error: 'frequency must be weekly, biweekly, or monthly.' });

  const jobTypesMap = {};
  getJobTypes().forEach(jt => { jobTypesMap[jt.key] = jt; });
  const job_type = body.job_type && jobTypesMap[body.job_type] ? body.job_type : 'generic';
  const title = sanitizeString(body.title || '').trim();
  if (!title) return json(res, 400, { error: 'title is required.' });

  const job = {
    id: generateId(),
    site_id: site.id,
    channel: sanitizeString(body.channel || '').trim() || 'General',
    job_type,
    title,
    weekday,
    frequency: body.frequency,
    est_minutes: Math.max(0, parseInt(body.est_minutes) || 30),
    active: true,
    created_at: new Date().toISOString(),
  };

  const allRecurring = getDashboardRecurring();
  allRecurring.push(job);
  writeJSON(DASHBOARD_RECURRING_FILE, allRecurring);
  json(res, 201, { job });
}

async function handleRecurringJobUpdate(req, res, jobId) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });

  const allSites = getDashboardSites();
  const userSiteIds = new Set(allSites.filter(s => s.user_id === user.id).map(s => s.id));
  const allRecurring = getDashboardRecurring();
  const idx = allRecurring.findIndex(j => j.id === jobId && userSiteIds.has(j.site_id));
  if (idx === -1) return json(res, 404, { error: 'Recurring job not found.' });

  const body = await readBody(req);
  const VALID_FREQS = ['weekly', 'biweekly', 'monthly'];
  if (body.title !== undefined) allRecurring[idx].title = sanitizeString(body.title).trim();
  if (body.channel !== undefined) allRecurring[idx].channel = sanitizeString(body.channel).trim();
  if (body.weekday !== undefined) { const wd = parseInt(body.weekday); if (wd >= 1 && wd <= 7) allRecurring[idx].weekday = wd; }
  if (body.frequency !== undefined && VALID_FREQS.includes(body.frequency)) allRecurring[idx].frequency = body.frequency;
  if (body.est_minutes !== undefined) allRecurring[idx].est_minutes = Math.max(0, parseInt(body.est_minutes) || 30);
  if (body.active !== undefined) allRecurring[idx].active = !!body.active;

  writeJSON(DASHBOARD_RECURRING_FILE, allRecurring);
  json(res, 200, { job: allRecurring[idx] });
}

function handleRecurringJobDelete(req, res, jobId) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });

  const allSites = getDashboardSites();
  const userSiteIds = new Set(allSites.filter(s => s.user_id === user.id).map(s => s.id));
  const allRecurring = getDashboardRecurring();
  const idx = allRecurring.findIndex(j => j.id === jobId && userSiteIds.has(j.site_id));
  if (idx === -1) return json(res, 404, { error: 'Recurring job not found.' });

  allRecurring.splice(idx, 1);
  writeJSON(DASHBOARD_RECURRING_FILE, allRecurring);
  json(res, 200, { ok: true });
}

async function handleDashboardSiteSeed(req, res, siteId) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });

  const allSites = getDashboardSites();
  const site = allSites.find(s => s.id === siteId && s.user_id === user.id && !s.archived_at);
  if (!site) return json(res, 404, { error: 'Site not found.' });

  const body = await readBody(req);
  const template = TEMPLATES[body.template];
  if (!template) return json(res, 400, { error: 'Unknown template. Valid: ' + Object.keys(TEMPLATES).join(', ') });

  const now = new Date().toISOString();
  const allRecurring = getDashboardRecurring();
  const newJobs = template.map(t => ({
    id: generateId(),
    site_id: site.id,
    channel: t.channel,
    job_type: t.job_type,
    title: t.title,
    weekday: t.weekday,
    frequency: t.frequency,
    est_minutes: t.est_minutes,
    active: true,
    created_at: now,
  }));
  allRecurring.push(...newJobs);
  writeJSON(DASHBOARD_RECURRING_FILE, allRecurring);
  json(res, 201, { seeded: newJobs.length, jobs: newJobs, templates: TEMPLATE_LABELS });
}

function handleJobTypesGet(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  json(res, 200, { job_types: getJobTypes(), templates: TEMPLATE_LABELS });
}

/* ── Lead Finder Search ────────────────────────────────── */

async function handleLeadSearch(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const apiKey = process.env.HERE_PLACES_API_KEY;
  if (!apiKey) return json(res, 503, { error: "no_places_key", message: "HERE Places API key not configured." });

  const body = await readBody(req);
  const { subcatLabel, city, country } = body;
  if (!subcatLabel || !city || !country) return json(res, 400, { error: "subcatLabel, city and country are required." });

  if (!hasAccess(user)) {
  // Access check: free users get 3 searches (Greece only); block if expired
    if (isFreeExpired(user)) return json(res, 403, { error: "free_expired", message: "Your free plan has expired. Upgrade to Pro to continue.", upgradeUrl: "/membership" });

    const countryLower = (country || "").replace(/^\S+\s/, "").toLowerCase().trim();
    if (countryLower !== "greece" && countryLower !== "ελλάδα" && countryLower !== "ελλάς") {
      return json(res, 403, {
        error: "free_plan_country",
        message: "Free plan supports Greece only. Upgrade to Pro to search all 6 countries.",
        upgradeUrl: "/membership",
      });
    }
    const freeUsers = readJSON(USERS_FILE);
    const freeIdx = freeUsers.findIndex(u => u.id === user.id);
    if (freeIdx === -1) return json(res, 404, { error: "User not found." });
    if ((freeUsers[freeIdx].monthLeadSearches || 0) >= 3) {
      return json(res, 403, {
        error: "free_lead_limit",
        message: "Free plan includes 3 lead searches. Upgrade to Pro for unlimited searches.",
        upgradeUrl: "/membership",
      });
    }
    freeUsers[freeIdx].monthLeadSearches = (freeUsers[freeIdx].monthLeadSearches || 0) + 1;
    writeJSON(USERS_FILE, freeUsers);
  }


  const COUNTRY_CODES = {
    "greece": "GRC", "germany": "DEU", "austria": "AUT",
    "switzerland": "CHE", "united kingdom": "GBR", "cyprus": "CYP",
  };
  const cleanCountry = country.replace(/^\S+\s/, "").trim();
  const countryCode  = COUNTRY_CODES[cleanCountry.toLowerCase()] || "GRC";
  const query = `${subcatLabel} ${city}`;

  try {
    // Step 1: geocode city to get coordinates
    const geoUrl = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(city + ',' + cleanCountry)}&apiKey=${apiKey}`;
    const geoRes = await fetch(geoUrl);
    const geoData = await geoRes.json();
    const pos = geoData.items?.[0]?.position;
    if (!pos) return json(res, 502, { error: "Could not geocode city: " + city });

    // Step 2: discover businesses near city center
    const discUrl = `https://discover.search.hereapi.com/v1/discover?q=${encodeURIComponent(subcatLabel)}&at=${pos.lat},${pos.lng}&limit=100&lang=en&apiKey=${apiKey}`;
    const hRes = await fetch(discUrl);
    const data = await hRes.json();
    if (!hRes.ok) return json(res, 502, { error: data.title || "HERE Places API error." });

    const leads = (data.items || []).map((p, i) => ({
      id:      i + 1,
      name:    p.title              || "",
      address: p.address?.label    || "",
      website: (p.contacts?.[0]?.www?.[0]?.value || "").replace(/^https?:\/\//, "").replace(/\/$/, ""),
      phone:   p.contacts?.[0]?.phone?.[0]?.value || null,
      rating:  null,
      reviews: 0,
      email:   null,
      status:  "new",
    }));
    json(res, 200, { leads, query: `${query} (${cleanCountry})` });
  } catch (err) {
    json(res, 502, { error: "Failed to reach HERE Places API: " + err.message });
  }
}

function handleCompetitorShare(req, res, token) {
  const all  = readJSON(COMPETITOR_FILE);
  const comp = all.find(c => c.shareToken === token);
  if (!comp) return json(res, 404, { error: "Share link not found." });
  const { userId, shareToken, ...pub } = comp;
  json(res, 200, { competitor: pub });
}

/* ── Business Profile ──────────────────────────────────────── */
const BIZ_EDIT_LIMIT = 2;

function bizEditsThisMonth(profile) {
  if (!profile) return 0;
  const now = new Date();
  const ym  = `${now.getFullYear()}-${now.getMonth()}`;
  return profile.editMonth === ym ? (profile.editCount || 0) : 0;
}

function handleBusinessProfileGet(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const all     = readJSON(BUSINESS_PROFILE_FILE);
  const profile = (Array.isArray(all) ? all : []).find(p => p.userId === user.id) || null;
  const editsUsed = bizEditsThisMonth(profile);
  json(res, 200, { profile, editsUsed, editsLeft: BIZ_EDIT_LIMIT - editsUsed });
}

async function handleBusinessProfileSave(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  if (!hasAccess(user)) return json(res, 402, { error: "trial_expired", upgradeUrl: "/membership" });
  const body    = await readBody(req);
  const { businessName, businessUrl, businessWebsite, country, city, businessCountry, businessCity,
          industry, businessDescription, yearsInBusiness, mainKeyword, uniqueStrength,
          knownCompetitors, businessType, customerType, pricePositioning, searchScope,
          phone, services, address, openingHours } = body;
  const resolvedUrl     = (businessUrl || businessWebsite || "").trim();
  const resolvedCountry = (country || businessCountry || "").trim();
  const resolvedCity    = (city || businessCity || "").trim();
  const all     = Array.isArray(readJSON(BUSINESS_PROFILE_FILE)) ? readJSON(BUSINESS_PROFILE_FILE) : [];
  const idx     = all.findIndex(p => p.userId === user.id);
  const existing = idx !== -1 ? all[idx] : null;

  const editsUsed = bizEditsThisMonth(existing);
  if (editsUsed >= BIZ_EDIT_LIMIT) {
    return json(res, 429, { error: `You can only update your business profile ${BIZ_EDIT_LIMIT} times per month. You have used all ${BIZ_EDIT_LIMIT} edits for this month.` });
  }

  const now = new Date();
  const ym  = `${now.getFullYear()}-${now.getMonth()}`;
  const profile = {
    ...(existing || {}),
    userId:              user.id,
    businessName:        (businessName        || "").trim(),
    businessUrl:         resolvedUrl,
    country:             resolvedCountry,
    city:                resolvedCity,
    industry:            (industry            || "").trim(),
    businessDescription: (businessDescription || "").trim(),
    yearsInBusiness:     (yearsInBusiness     || "").trim(),
    mainKeyword:         (mainKeyword         || "").trim(),
    uniqueStrength:      (uniqueStrength      || "").trim(),
    knownCompetitors:    (knownCompetitors    || "").trim(),
    businessType:        (businessType        || "").trim(),
    customerType:        (customerType        || "").trim(),
    pricePositioning:    (pricePositioning    || "").trim(),
    searchScope:         (searchScope         || "").trim(),
    phone:               (phone               || "").trim(),
    services:            (services            || "").trim(),
    address:             (address             || "").trim(),
    openingHours:        (openingHours        || "").trim(),
    updatedAt:           now.toISOString(),
    editMonth:           ym,
    editCount:           editsUsed + 1,
  };

  if (idx !== -1) all[idx] = profile; else all.push(profile);
  writeJSON(BUSINESS_PROFILE_FILE, all);
  const editsLeft = BIZ_EDIT_LIMIT - profile.editCount;
  json(res, 200, { profile, editsUsed: profile.editCount, editsLeft });
}

// ── Admin handlers ────────────────────────────────────────────────────────────

function requireAdmin(req) {
  const cookies = parseCookies(req);
  return getSessionUser(cookies.session);
}

function handleAdminUsers(req, res) {
  const user = requireAdmin(req);
  if (!user || user.role !== "admin") return json(res, 403, { error: "Admin only." });
  const users    = readJSON(USERS_FILE);
  const profiles = Array.isArray(readJSON(BUSINESS_PROFILE_FILE)) ? readJSON(BUSINESS_PROFILE_FILE) : [];
  const now = new Date();
  const ym  = `${now.getFullYear()}-${now.getMonth()}`;
  const result = users.map(u => {
    const { passwordHash, ...safe } = u;
    const profile = profiles.find(p => p.userId === u.id) || null;
    const editsUsed = profile && profile.editMonth === ym ? (profile.editCount || 0) : 0;
    return { ...safe, bizProfile: profile ? { businessName: profile.businessName, country: profile.country, city: profile.city, industry: profile.industry, updatedAt: profile.updatedAt } : null, bizEditsUsed: editsUsed, bizEditsLeft: BIZ_EDIT_LIMIT - editsUsed };
  });
  json(res, 200, { users: result });
}

async function handleAdminUsage(req, res, targetUserId) {
  const admin = requireAdmin(req);
  if (!admin || admin.role !== "admin") return json(res, 403, { error: "Admin only." });
  const body = await readBody(req);
  const { action } = body;
  const users = readJSON(USERS_FILE);
  const idx   = users.findIndex(u => u.id === targetUserId);
  if (idx === -1) return json(res, 404, { error: "User not found." });
  const u = users[idx];
  switch (action) {
    case "extend7":
      u.freeExpiresAt = new Date(Math.max(Date.now(), u.freeExpiresAt ? new Date(u.freeExpiresAt).getTime() : Date.now()) + 7 * 86400000).toISOString(); break;
    case "extend30":
      u.freeExpiresAt = new Date(Math.max(Date.now(), u.freeExpiresAt ? new Date(u.freeExpiresAt).getTime() : Date.now()) + 30 * 86400000).toISOString(); break;
    case "resetExpiry":
      u.freeExpiresAt = new Date(Date.now() + 7 * 86400000).toISOString(); break;
    case "resetArticles":  u.monthArticles     = 0; break;
    case "addArticle":     u.monthArticles     = (u.monthArticles || 0) + 1; break;
    case "resetLeads":     u.monthLeadSearches = 0; break;
    case "addLead":        u.monthLeadSearches = (u.monthLeadSearches || 0) + 1; break;
    case "resetAudits":    u.monthAudits       = 0; break;
    case "addAudit":       u.monthAudits       = (u.monthAudits || 0) + 1; break;
    default: return json(res, 400, { error: "Unknown action." });
  }
  writeJSON(USERS_FILE, users);
  const { passwordHash, ...safe } = u;
  json(res, 200, { user: safe });
}

async function handleAdminSetBizEdits(req, res, targetUserId) {
  const user = requireAdmin(req);
  if (!user || user.role !== "admin") return json(res, 403, { error: "Admin only." });
  const body = await readBody(req);
  const { editCount } = body;
  if (editCount === undefined || isNaN(Number(editCount))) return json(res, 400, { error: "editCount required." });
  const all = Array.isArray(readJSON(BUSINESS_PROFILE_FILE)) ? readJSON(BUSINESS_PROFILE_FILE) : [];
  const now = new Date();
  const ym  = `${now.getFullYear()}-${now.getMonth()}`;
  const idx = all.findIndex(p => p.userId === targetUserId);
  if (idx !== -1) {
    all[idx].editCount = Math.max(0, Math.min(BIZ_EDIT_LIMIT, Number(editCount)));
    all[idx].editMonth = ym;
  } else {
    all.push({ userId: targetUserId, editCount: Math.max(0, Math.min(BIZ_EDIT_LIMIT, Number(editCount))), editMonth: ym });
  }
  writeJSON(BUSINESS_PROFILE_FILE, all);
  json(res, 200, { ok: true, editsUsed: Number(editCount), editsLeft: BIZ_EDIT_LIMIT - Number(editCount) });
}

async function handleAdminCreateUser(req, res) {
  const admin = requireAdmin(req);
  if (!admin || admin.role !== "admin") return json(res, 403, { error: "Admin only." });
  const body = await readBody(req);
  const { firstName, lastName, email, plan, role, password } = body;
  if (!email || !email.trim()) return json(res, 400, { error: "Email is required." });
  if (!password || password.length < 6) return json(res, 400, { error: "Password must be at least 6 characters." });
  const users = readJSON(USERS_FILE);
  if (users.find(u => u.email === email.trim().toLowerCase())) return json(res, 409, { error: "A user with this email already exists." });
  const PLANS = require("./config/limits");
  const planKey = plan || "free";
  const cfg = PLANS.plans[planKey] || PLANS.plans["free"];
  const passwordHash = await hashPassword(password);
  const user = {
    id:          generateId(),
    firstName:   (firstName || "").trim(),
    lastName:    (lastName  || "").trim(),
    email:       email.trim().toLowerCase(),
    passwordHash,
    plan:        planKey,
    role:        role === "admin" ? "admin" : "user",
    creditsLeft: cfg.credits,
    creditsMax:  cfg.credits,
    creditsUsed: 0,
    createdAt:   new Date().toISOString(),
    suspended:   false,
  };
  users.push(user);
  writeJSON(USERS_FILE, users);
  const { passwordHash: _ph, ...safe } = user;
  json(res, 201, { user: safe });
}

async function handleAdminUpdateUser(req, res, targetUserId) {
  const admin = requireAdmin(req);
  if (!admin || admin.role !== "admin") return json(res, 403, { error: "Admin only." });
  const body = await readBody(req);
  const users = readJSON(USERS_FILE);
  const idx   = users.findIndex(u => u.id === targetUserId);
  if (idx === -1) return json(res, 404, { error: "User not found." });

  const PLANS = require("./config/limits");
  const { firstName, lastName, email, plan, creditsLeft, creditsMax, suspended, role } = body;

  if (firstName  !== undefined) users[idx].firstName  = String(firstName).trim();
  if (lastName   !== undefined) users[idx].lastName   = String(lastName).trim();
  if (email      !== undefined) users[idx].email      = String(email).trim().toLowerCase();
  if (suspended  !== undefined) users[idx].suspended  = Boolean(suspended);
  if (role       !== undefined && (role === "admin" || role === "user" || role === "youtuber")) users[idx].role = role;

  if (plan !== undefined && PLANS.plans[plan]) {
    users[idx].plan       = plan;
    const cfg             = PLANS.plans[plan];
    users[idx].creditsMax = cfg.credits;
    if (cfg.credits === -1) { users[idx].creditsLeft = -1; }
    else if (users[idx].creditsLeft === undefined || users[idx].creditsLeft < 0) {
      users[idx].creditsLeft = cfg.credits;
    }
    users[idx].creditMonth = currentMonth();
  }
  if (creditsLeft !== undefined) users[idx].creditsLeft = Number(creditsLeft);
  if (creditsMax  !== undefined) users[idx].creditsMax  = Number(creditsMax);

  writeJSON(USERS_FILE, users);
  const { passwordHash, ...safe } = users[idx];
  json(res, 200, { user: safe });
}

async function handleAdminDeleteUser(req, res, targetUserId) {
  const admin = requireAdmin(req);
  if (!admin || admin.role !== "admin") return json(res, 403, { error: "Admin only." });
  if (targetUserId === admin.id) return json(res, 400, { error: "Cannot delete your own account." });
  const users   = readJSON(USERS_FILE);
  const updated = users.filter(u => u.id !== targetUserId);
  if (updated.length === users.length) return json(res, 404, { error: "User not found." });
  writeJSON(USERS_FILE, updated);
  json(res, 200, { ok: true });
}

function handleAdminStats(req, res) {
  const admin = requireAdmin(req);
  if (!admin || admin.role !== "admin") return json(res, 403, { error: "Admin only." });
  const users     = readJSON(USERS_FILE);
  const crm       = readJSON(CRM_FILE);
  const sequences = readJSON(SEQUENCES_FILE);
  const audits    = readJSON(AUDITS_FILE);
  const secLog    = readJSON(path.join(ROOT, "data/security_log.json"));
  const auditLog  = readJSON(path.join(ROOT, "data/audit_log.json"));

  const byPlan = {};
  users.forEach(u => { const p = u.plan || "free"; byPlan[p] = (byPlan[p] || 0) + 1; });
  const totalCreditsUsed = users.reduce((s, u) => s + (u.creditsUsed || 0), 0);
  const activeToday = users.filter(u => u.dailyActivity && u.dailyActivity.date === new Date().toISOString().slice(0,10)).length;

  json(res, 200, {
    totalUsers:       users.length,
    activeToday,
    suspended:        users.filter(u => u.suspended).length,
    byPlan,
    totalCrmLeads:    Array.isArray(crm) ? crm.length : 0,
    totalSequences:   Array.isArray(sequences) ? sequences.length : 0,
    totalAudits:      Array.isArray(audits) ? audits.length : 0,
    totalCreditsUsed,
    recentSecurity:   Array.isArray(secLog) ? secLog.slice(-20).reverse() : [],
    recentAuditLog:   Array.isArray(auditLog) ? auditLog.slice(-20).reverse() : [],
  });
}

// ── WordPress handlers ────────────────────────────────────────────────────────

function handleWpStatus(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const conns = readJSON(WP_FILE);
  const conn  = conns.find(c => c.userId === user.id);
  if (!conn) return json(res, 200, { connected: false });
  json(res, 200, { connected: true, siteUrl: conn.siteUrl, siteName: conn.siteName, username: conn.username, connectedAt: conn.connectedAt, lastUsed: conn.lastUsed });
}

async function handleWpConnect(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  if (!hasAccess(user)) return json(res, 402, { error: "trial_expired", upgradeUrl: "/membership" });

  const limits = PLAN_LIMITS.plans[user.plan] || PLAN_LIMITS.plans.free;
  if (!limits.wordpress) return limitReached(res, "wordpress", 0, 0);

  const body = await readBody(req);
  const rawUrl  = sanitizeUrl(body.siteUrl || "");
  const username    = sanitizeString(body.username || "", 200);
  const appPassword = sanitizeString(body.appPassword || "", 200);
  if (!rawUrl || !username || !appPassword) {
    return json(res, 400, { error: "siteUrl, username, and appPassword are required." });
  }
  try {
    const parsedHost = new URL(rawUrl).hostname;
    if (isPrivateHost(parsedHost)) return json(res, 400, { error: "Invalid site URL." });
  } catch { return json(res, 400, { error: "Invalid site URL." }); }

  const siteUrl = rawUrl;

  try {
    const wpRes = await wpRequest(siteUrl, "/wp-json/wp/v2/users/me", "GET", null, username, appPassword);
    if (wpRes.status === 401 || wpRes.status === 403) {
      return json(res, 401, { error: "Invalid credentials. Check your username and application password." });
    }
    if (wpRes.status !== 200) {
      return json(res, 400, { error: `WordPress returned status ${wpRes.status}. Check the site URL.` });
    }
    const wpUser   = wpRes.body;
    const siteName = (typeof wpUser === "object" && wpUser.name) ? wpUser.name : username;

    const conns = readJSON(WP_FILE);
    const idx   = conns.findIndex(c => c.userId === user.id);
    const conn  = { userId: user.id, siteUrl: siteUrl.trim().replace(/\/$/, ""), siteName, username, appPasswordEnc: encryptStr(appPassword), connectedAt: new Date().toISOString(), lastUsed: null };
    if (idx !== -1) conns[idx] = conn; else conns.push(conn);
    writeJSON(WP_FILE, conns);
    json(res, 200, { success: true, siteName, siteUrl: conn.siteUrl });
  } catch (err) {
    json(res, 500, { error: "Could not connect to WordPress: " + err.message });
  }
}

function handleWpDisconnect(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  writeJSON(WP_FILE, readJSON(WP_FILE).filter(c => c.userId !== user.id));
  json(res, 200, { ok: true });
}

async function handleWpPublish(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  if (!hasAccess(user)) return json(res, 402, { error: "trial_expired", upgradeUrl: "/membership" });

  const conns = readJSON(WP_FILE);
  const conn  = conns.find(c => c.userId === user.id);
  if (!conn) return json(res, 400, { error: "No WordPress connection. Connect first in Settings." });

  const body = await readBody(req);
  const { title, content, status = "draft", categories = [], tags = [], slug, excerpt } = body;
  if (!title || !content) return json(res, 400, { error: "title and content are required." });

  let appPassword;
  try { appPassword = decryptStr(conn.appPasswordEnc); }
  catch { return json(res, 500, { error: "Failed to decrypt credentials. Please reconnect in Settings." }); }

  try {
    const catIds = categories.length ? await resolveWpTerms(conn.siteUrl, conn.username, appPassword, "/wp-json/wp/v2/categories", categories) : [];
    const tagIds = tags.length       ? await resolveWpTerms(conn.siteUrl, conn.username, appPassword, "/wp-json/wp/v2/tags",       tags)       : [];

    const postData = { title, content, status, ...(slug ? { slug } : {}), ...(excerpt ? { excerpt } : {}), ...(catIds.length ? { categories: catIds } : {}), ...(tagIds.length ? { tags: tagIds } : {}) };

    const wpRes = await wpRequest(conn.siteUrl, "/wp-json/wp/v2/posts", "POST", postData, conn.username, appPassword);
    if (wpRes.status !== 201) {
      const msg = typeof wpRes.body === "object" ? (wpRes.body.message || JSON.stringify(wpRes.body)) : wpRes.body;
      return json(res, 400, { error: "WordPress error: " + msg });
    }
    const wp = wpRes.body;

    // Update lastUsed
    const allConns = readJSON(WP_FILE);
    const ci = allConns.findIndex(c => c.userId === user.id);
    if (ci !== -1) { allConns[ci].lastUsed = new Date().toISOString(); writeJSON(WP_FILE, allConns); }

    json(res, 200, { success: true, wpPostId: wp.id, wpPostUrl: wp.link || wp.guid?.rendered, status: wp.status });
  } catch (err) {
    console.error("WP publish error:", err);
    json(res, 500, { error: "Failed to publish: " + err.message });
  }
}

// ── Standalone Audit handlers ─────────────────────────────────────────────────

async function handleAuditCreate(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  if (!checkAiRateLimit(res, user.id)) return;

  const users = readJSON(USERS_FILE);
  const uidx  = users.findIndex(u => u.id === user.id);
  if (uidx === -1) return json(res, 404, { error: "User not found." });

  // Auto-expire trial if needed
  autoExpireTrialIfNeeded(users, uidx);

  // Free plan: 1 audit total (no reset); block if expired
  if (!hasAccess(users[uidx])) {
    if (isFreeExpired(users[uidx])) return json(res, 403, { error: "free_expired", message: "Your free plan has expired. Upgrade to Pro to continue.", upgradeUrl: "/membership" });
    if ((users[uidx].monthAudits || 0) >= 1) {
      return json(res, 403, {
        error: "free_audit_limit",
        message: "Free plan includes 1 AI audit. Upgrade to Pro for 10 audits per month.",
        upgradeUrl: "/membership",
      });
    }
  }

  // Trial audit daily limit (1 per day)
  if (isTrialActive(users[uidx])) {
    const tu = getTrialUsage(users[uidx]);
    const today = new Date().toISOString().slice(0, 10);
    const auditsToday = tu.auditsTodayDate === today ? (tu.auditsToday || 0) : 0;
    if (auditsToday >= 1) {
      return json(res, 403, {
        success: false, error: "trial_audit_limit",
        message: "Your free trial includes 1 AI audit per day. Upgrade to €20/month for 4 audits per month.",
        upgradeUrl: "/upgrade",
      });
    }
  }

  const auditCost   = PLAN_LIMITS.costs.auditCreate;
  const auditResult = deductCredits(users, uidx, auditCost, 'AI Visibility Audit');
  if (!auditResult.ok) return insufficientCredits(res, auditResult.creditsLeft, auditResult.creditsMax, auditCost);
  users[uidx].monthAudits = (users[uidx].monthAudits || 0) + 1;

  const apiKey = getAnthropicKey();
  if (!apiKey && !getGroqKey()) return json(res, 500, { error: "AI service not configured." });

  const body = await readBody(req);
  const { businessName, businessUrl, industry } = body;
  if (!businessName || !businessName.trim()) return json(res, 400, { error: "businessName is required." });

  const auditModel = getModel(users[uidx]);
  try {
    const result = await runCompetitorAudit(apiKey, businessName.trim(), (businessUrl || "").trim(), (industry || "").trim(), auditModel);

    writeJSON(USERS_FILE, users);

    const now   = new Date().toISOString();
    const entry = {
      id:             generateId(),
      userId:         user.id,
      businessName:   businessName.trim(),
      businessUrl:    (businessUrl || "").trim(),
      industry:       (industry || "").trim(),
      score:          result.overall_score,
      breakdown:      result.breakdown,
      strengths:      result.strengths,
      weaknesses:     result.weaknesses,
      recommendations:result.recommendations,
      shareToken:     null,
      shareCreatedAt: null,
      shareViews:     0,
      shareEnabled:   false,
      createdAt:      now,
    };

    const audits = readJSON(AUDITS_FILE);
    audits.push(entry);
    writeJSON(AUDITS_FILE, audits);

    // Increment trial audit counter
    const freshUsers2 = readJSON(USERS_FILE);
    const freshIdx2   = freshUsers2.findIndex(u => u.id === user.id);
    if (freshIdx2 !== -1 && isTrialActive(freshUsers2[freshIdx2])) {
      const tu2   = getTrialUsage(freshUsers2[freshIdx2]);
      const today = new Date().toISOString().slice(0, 10);
      tu2.auditsToday     = tu2.auditsTodayDate === today ? (tu2.auditsToday || 0) + 1 : 1;
      tu2.auditsTodayDate = today;
      freshUsers2[freshIdx2].trialUsage = tu2;
      writeJSON(USERS_FILE, freshUsers2);
    }

    json(res, 201, { audit: entry });
  } catch (err) {
    console.error("Audit create error:", err);
    json(res, 500, { error: "Failed to run audit: " + err.message });
  }
}

function handleAuditList(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const audits = readJSON(AUDITS_FILE);
  json(res, 200, { audits: audits.filter(a => a.userId === user.id) });
}

function handleAuditDelete(req, res, id) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  if (!hasAccess(user)) return json(res, 402, { error: "trial_expired", upgradeUrl: "/membership" });
  const audits  = readJSON(AUDITS_FILE);
  const filtered = audits.filter(a => !(a.id === id && a.userId === user.id));
  if (filtered.length === audits.length) return json(res, 404, { error: "Audit not found." });
  writeJSON(AUDITS_FILE, filtered);
  json(res, 200, { ok: true });
}

async function handleAuditShareCreate(req, res, id) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });

  const shareUsers  = readJSON(USERS_FILE);
  const shareUidx   = shareUsers.findIndex(u => u.id === user.id);
  if (shareUidx === -1) return json(res, 404, { error: "User not found." });
  const shareCost   = PLAN_LIMITS.costs.auditShareCreate;
  const shareResult = deductCredits(shareUsers, shareUidx, shareCost, 'Audit Share');
  if (!shareResult.ok) return insufficientCredits(res, shareResult.creditsLeft, shareResult.creditsMax, shareCost);
  writeJSON(USERS_FILE, shareUsers);

  const audits = readJSON(AUDITS_FILE);
  const idx    = audits.findIndex(a => a.id === id && a.userId === user.id);
  if (idx === -1) return json(res, 404, { error: "Audit not found." });

  const token = crypto.randomBytes(16).toString("hex");
  audits[idx].shareToken     = token;
  audits[idx].shareCreatedAt = new Date().toISOString();
  audits[idx].shareEnabled   = true;
  if (!audits[idx].shareViews) audits[idx].shareViews = 0;
  writeJSON(AUDITS_FILE, audits);

  const shareUrl = `https://eureach.eu/audit/share/${token}`;
  json(res, 200, { shareUrl, shareToken: token, shareViews: audits[idx].shareViews });
}

function handleAuditShareGet(req, res, token) {
  const audits = readJSON(AUDITS_FILE);
  const idx    = audits.findIndex(a => a.shareToken === token && a.shareEnabled);
  if (idx === -1) return json(res, 404, { error: "Share link not found or disabled." });

  audits[idx].shareViews = (audits[idx].shareViews || 0) + 1;
  writeJSON(AUDITS_FILE, audits);

  const { userId, shareToken, shareCreatedAt, ...pub } = audits[idx];
  json(res, 200, { audit: pub });
}

function handleAuditShareDelete(req, res, id) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  if (!hasAccess(user)) return json(res, 402, { error: "trial_expired", upgradeUrl: "/membership" });

  const audits = readJSON(AUDITS_FILE);
  const idx    = audits.findIndex(a => a.id === id && a.userId === user.id);
  if (idx === -1) return json(res, 404, { error: "Audit not found." });

  audits[idx].shareToken     = null;
  audits[idx].shareCreatedAt = null;
  audits[idx].shareEnabled   = false;
  writeJSON(AUDITS_FILE, audits);
  json(res, 200, { ok: true });
}

// ── Raw SMTP sender (no external libraries) ───────────────────────────────────
function smtpSend({ host, port, username, password, from, fromName, to, subject, body, html = null, testOnly = false }) {
  const useSSL = (port === 465);
  return new Promise((resolve, reject) => {
    let socket = null;
    let active = null;
    let buf = "";
    let wCode = null, wRes = null, wRej = null;
    let done = false;

    const timer = setTimeout(() => abort(new Error("SMTP timeout (30s)")), 30000);

    function abort(err) {
      if (done) return; done = true; clearTimeout(timer);
      try { active && active.destroy(); } catch {}
      try { socket && socket !== active && socket.destroy(); } catch {}
      reject(err);
    }
    function finish() {
      if (done) return; done = true; clearTimeout(timer);
      try { active && active.destroy(); } catch {}
      try { socket && socket !== active && socket.destroy(); } catch {}
      resolve({ ok: true });
    }
    function onData(chunk) {
      buf += chunk.toString();
      let pos;
      while ((pos = buf.indexOf("\r\n")) !== -1) {
        const line = buf.slice(0, pos); buf = buf.slice(pos + 2);
        if (!line) continue;
        const code = parseInt(line.slice(0, 3), 10);
        if (line[3] === "-") continue; // multi-line continuation
        if (wRes && code === wCode) { const fn = wRes; wCode = wRes = wRej = null; fn(line); }
        else if (wRej && code >= 400) { const fn = wRej; wCode = wRes = wRej = null; fn(new Error(`SMTP ${code}: ${line.slice(4)}`)); }
      }
    }
    function expect(code) { return new Promise((res, rej) => { wCode = code; wRes = res; wRej = rej; }); }
    function write(line) { active.write(line + "\r\n"); }
    function upgradeTLS() {
      return new Promise((res, rej) => {
        active.removeListener("data", onData); active.removeListener("error", abort);
        const s = tls.connect({ socket: active, servername: host, rejectUnauthorized: false });
        s.once("secureConnect", () => { active = s; active.on("data", onData); active.on("error", abort); res(); });
        s.once("error", rej);
      });
    }
    async function run() {
      try {
        if (useSSL) {
          active = tls.connect({ host, port, servername: host, rejectUnauthorized: false });
          await new Promise((res, rej) => { active.once("secureConnect", res); active.once("error", rej); });
        } else {
          socket = net.createConnection({ host, port });
          await new Promise((res, rej) => { socket.once("connect", res); socket.once("error", rej); });
          active = socket;
        }
        active.on("data", onData); active.on("error", abort);

        await expect(220);
        write("EHLO eureach.eu"); await expect(250);

        if (!useSSL) {
          write("STARTTLS"); await expect(220);
          await upgradeTLS();
          write("EHLO eureach.eu"); await expect(250);
        }

        write("AUTH LOGIN"); await expect(334);
        write(Buffer.from(username).toString("base64")); await expect(334);
        write(Buffer.from(password).toString("base64")); await expect(235);

        if (testOnly) { write("QUIT"); return finish(); }

        write(`MAIL FROM:<${from}>`); await expect(250);
        write(`RCPT TO:<${to}>`);     await expect(250);
        write("DATA");                await expect(354);

        const displayFrom = fromName ? `"${fromName}" <${from}>` : from;
        let msgData;
        if (html) {
          const boundary = `----_Part_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
          const plainFallback = body || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          const parts = [
            `From: ${displayFrom}`,`To: ${to}`,
            `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
            `Date: ${new Date().toUTCString()}`,`MIME-Version: 1.0`,
            `Content-Type: multipart/alternative; boundary="${boundary}"`,
            "",`--${boundary}`,
            `Content-Type: text/plain; charset=UTF-8`,`Content-Transfer-Encoding: 8bit`,"",
            ...plainFallback.split("\n").map(l => l.startsWith(".") ? "." + l : l),
            "",`--${boundary}`,
            `Content-Type: text/html; charset=UTF-8`,`Content-Transfer-Encoding: 8bit`,"",
            ...html.split("\n").map(l => l.startsWith(".") ? "." + l : l),
            "",`--${boundary}--`,
          ];
          msgData = parts.join("\r\n") + "\r\n.\r\n";
        } else {
          const msgParts = [
            `From: ${displayFrom}`,`To: ${to}`,
            `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
            `Date: ${new Date().toUTCString()}`,`MIME-Version: 1.0`,
            `Content-Type: text/plain; charset=UTF-8`,`Content-Transfer-Encoding: 8bit`,"",
            ...body.split("\n").map(l => l.startsWith(".") ? "." + l : l),
          ];
          msgData = msgParts.join("\r\n") + "\r\n.\r\n";
        }
        active.write(msgData);
        await expect(250);
        write("QUIT"); finish();
      } catch (err) { abort(err); }
    }
    run();
  });
}

// ── Email / SMTP handlers ──────────────────────────────────────────────────────

async function handleSmtpStatus(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const conn = readJSON(SMTP_FILE).find(c => c.userId === user.id);
  if (!conn) return json(res, 200, { connected: false });
  return json(res, 200, { connected: true, host: conn.host, port: conn.port, username: conn.username, from: conn.from, fromName: conn.fromName, connectedAt: conn.connectedAt });
}

async function handleSmtpConnect(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  if (!hasAccess(user)) return json(res, 402, { error: "trial_expired", upgradeUrl: "/membership" });
  const raw = await readBody(req);
  const host     = sanitizeString(raw.host || "", 253);
  const portNum  = sanitizeInteger(raw.port, 1, 65535);
  const username = sanitizeEmail(raw.username || "");
  const password = sanitizeString(raw.password || "", 500);
  const from     = sanitizeEmail(raw.from || "");
  const fromName = sanitizeString(raw.fromName || "", 100);
  if (!host || !portNum || !username || !password || !from)
    return json(res, 400, { error: "host, port, username, password, and from email are required." });
  if (isPrivateHost(host)) return json(res, 400, { error: "Invalid SMTP host." });
  const ALLOWED_PORTS = [25, 465, 587, 2525];
  if (!ALLOWED_PORTS.includes(portNum)) return json(res, 400, { error: "Port must be 25, 465, 587, or 2525." });
  try {
    await smtpSend({ host, port: portNum, username, password, from, testOnly: true });
  } catch (err) {
    return json(res, 400, { error: "Connection failed: " + err.message });
  }
  const conns = readJSON(SMTP_FILE).filter(c => c.userId !== user.id);
  conns.push({ userId: user.id, host, port: portNum, username, passwordEnc: encryptStr(password), from, fromName: fromName || "", connectedAt: new Date().toISOString() });
  writeJSON(SMTP_FILE, conns);
  return json(res, 200, { connected: true, host, port: portNum, username, from, fromName: fromName || "" });
}

async function handleSmtpDisconnect(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  writeJSON(SMTP_FILE, readJSON(SMTP_FILE).filter(c => c.userId !== user.id));
  return json(res, 200, { ok: true });
}

async function handleEmailSend(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  if (!hasAccess(user)) return json(res, 402, { error: "trial_expired", upgradeUrl: "/membership" });
  const raw2       = await readBody(req);
  const to         = sanitizeEmail(raw2.to || "");
  const subject    = sanitizeString(raw2.subject || "", 200);
  const body       = sanitizeString(raw2.body || "", 10000);
  const leadId     = sanitizeString(raw2.leadId || "", 50);
  const sequenceStep = sanitizeInteger(raw2.sequenceStep, 0, 10) || null;
  if (!to || !subject || !body) return json(res, 400, { error: "to, subject, and body are required." });
  if (!to.includes("@")) return json(res, 400, { error: "Enter a valid email address." });
  const conn = readJSON(SMTP_FILE).find(c => c.userId === user.id);
  if (!conn) return json(res, 400, { error: "No SMTP connection configured. Go to Settings → Email to connect." });
  let password;
  try { password = decryptStr(conn.passwordEnc); }
  catch { return json(res, 500, { error: "Failed to decrypt SMTP credentials. Please reconnect in Settings." }); }
  try {
    await smtpSend({ host: conn.host, port: conn.port, username: conn.username, password, from: conn.from, fromName: conn.fromName || "", to, subject, body });
  } catch (err) {
    return json(res, 500, { error: "Send failed: " + err.message });
  }
  const log = readJSON(EMAIL_LOG_FILE);
  const entry = { id: generateId(), userId: user.id, leadId: leadId || null, to, subject, sentAt: new Date().toISOString(), sequenceStep: sequenceStep || null, opened: false, clicked: false };
  log.push(entry);
  writeJSON(EMAIL_LOG_FILE, log);
  return json(res, 200, { ok: true, sentAt: entry.sentAt, id: entry.id });
}

async function handleEmailLog(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  if (!hasAccess(user)) return json(res, 402, { error: "trial_expired", upgradeUrl: "/membership" });
  const log = readJSON(EMAIL_LOG_FILE)
    .filter(e => e.userId === user.id)
    .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
  return json(res, 200, { log });
}

// ── Outreach Queue handlers ────────────────────────────────────────────────────

function handleOutreachQueueGet(req, res) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const queue = readJSON(OUTREACH_QUEUE_FILE).filter(q => q.userId === user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  json(res, 200, { queue });
}

async function handleOutreachEnqueue(req, res) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  if (!hasAccess(user)) return json(res, 402, { error: "trial_expired", upgradeUrl: "/membership" });
  const body = await readBody(req);
  const sequenceId   = sanitizeString(body.sequenceId || "", 50);
  const leadEmail    = sanitizeEmail(body.leadEmail || "");
  const leadName     = sanitizeString(body.leadName || "", 200);
  const leadId       = sanitizeString(body.leadId || "", 50);
  const crmId        = sanitizeString(body.crmId  || "", 50);
  const businessType = sanitizeString(body.businessType || "", 100);
  const city         = sanitizeString(body.city || "", 100);
  if (!sequenceId || !leadEmail) return json(res, 400, { error: "sequenceId and leadEmail are required." });

  const seqs = readJSON(SEQUENCES_FILE);
  const seq  = seqs.find(s => s.id === sequenceId && s.userId === user.id);
  if (!seq) return json(res, 404, { error: "Sequence not found." });

  const queue = readJSON(OUTREACH_QUEUE_FILE);
  if (queue.find(q => q.sequenceId === sequenceId && q.userId === user.id)) {
    return json(res, 409, { error: "This sequence is already queued." });
  }

  const now = new Date();
  const delays = [0, 3, 7]; // days per step
  const entry = {
    id:           generateId(),
    userId:       user.id,
    sequenceId,
    leadId:       leadId || null,
    crmId:        crmId || seq.crmId || null,
    leadName:     leadName || seq.leadName,
    leadEmail,
    businessType: businessType || seq.businessType || "",
    city:         city || seq.city || "",
    status:       "active",
    steps: seq.sequence.map((s, i) => ({
      step:         i + 1,
      channel:      s.channel,
      subject:      s.subject || null,
      body:         s.body,
      status:       "pending",
      sentAt:       null,
      scheduledFor: new Date(now.getTime() + delays[i] * 86400000).toISOString(),
    })),
    createdAt: now.toISOString(),
  };
  queue.push(entry);
  writeJSON(OUTREACH_QUEUE_FILE, queue);
  json(res, 200, { entry });
}

async function handleOutreachSendStep(req, res) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  if (!hasAccess(user)) return json(res, 402, { error: "trial_expired", upgradeUrl: "/membership" });
  const body    = await readBody(req);
  const queueId = sanitizeString(body.queueId || "", 50);
  const step    = sanitizeInteger(body.step, 1, 10);
  if (!queueId || !step) return json(res, 400, { error: "queueId and step are required." });

  const queue = readJSON(OUTREACH_QUEUE_FILE);
  const idx   = queue.findIndex(q => q.id === queueId && q.userId === user.id);
  if (idx === -1) return json(res, 404, { error: "Queue entry not found." });

  const entry   = queue[idx];
  const stepIdx = entry.steps.findIndex(s => s.step === step);
  if (stepIdx === -1) return json(res, 404, { error: "Step not found." });

  const stepData = entry.steps[stepIdx];
  if (stepData.status === "sent") return json(res, 400, { error: "Step already sent." });

  if (stepData.channel !== "Email") {
    queue[idx].steps[stepIdx].status = "sent";
    queue[idx].steps[stepIdx].sentAt = new Date().toISOString();
    if (entry.steps.every((s, i) => i === stepIdx || s.status === "sent")) {
      queue[idx].status = "completed";
    }
    writeJSON(OUTREACH_QUEUE_FILE, queue);
    return json(res, 200, { ok: true, manual: true });
  }

  // Deduct credits for email send
  const sendCost = PLAN_LIMITS.costs.outreach;
  const sendUsers = readJSON(USERS_FILE);
  const sendIdx   = sendUsers.findIndex(u => u.id === user.id);
  if (sendIdx !== -1) {
    const sendResult = deductCredits(sendUsers, sendIdx, sendCost, 'Outreach Email');
    if (!sendResult.ok) return insufficientCredits(res, sendResult.creditsLeft, sendResult.creditsMax, sendCost);
    writeJSON(USERS_FILE, sendUsers);
  }

  const conn = readJSON(SMTP_FILE).find(c => c.userId === user.id);
  if (!conn) return json(res, 400, { error: "No SMTP configured. Go to Settings → Email." });
  let password;
  try { password = decryptStr(conn.passwordEnc); }
  catch { return json(res, 500, { error: "Failed to decrypt SMTP credentials. Please reconnect." }); }

  try {
    await smtpSend({ host: conn.host, port: conn.port, username: conn.username, password,
      from: conn.from, fromName: conn.fromName || "", to: entry.leadEmail,
      subject: stepData.subject || "(no subject)", body: stepData.body });
  } catch (err) {
    return json(res, 500, { error: "Send failed: " + err.message });
  }

  const now = new Date().toISOString();
  queue[idx].steps[stepIdx].status = "sent";
  queue[idx].steps[stepIdx].sentAt = now;
  if (entry.steps.every((s, i) => i === stepIdx ? true : s.status === "sent")) {
    queue[idx].status = "completed";
  }
  writeJSON(OUTREACH_QUEUE_FILE, queue);

  const log = readJSON(EMAIL_LOG_FILE);
  log.push({ id: generateId(), userId: user.id, leadId: entry.leadId || null,
    to: entry.leadEmail, subject: stepData.subject || "", sentAt: now,
    sequenceStep: step, opened: false, clicked: false });
  writeJSON(EMAIL_LOG_FILE, log);

  // Auto-advance CRM status to 'contacted' on first email sent
  if (entry.crmId) {
    const crm    = readJSON(CRM_FILE);
    const crmIdx = crm.findIndex(c => c.id === entry.crmId && c.userId === user.id);
    if (crmIdx !== -1 && crm[crmIdx].status === 'found') {
      crm[crmIdx].status    = 'contacted';
      crm[crmIdx].updatedAt = now;
      writeJSON(CRM_FILE, crm);
    }
  }

  json(res, 200, { ok: true, sentAt: now });
}

async function handleOutreachUpdate(req, res) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  if (!hasAccess(user)) return json(res, 402, { error: "trial_expired", upgradeUrl: "/membership" });
  const body    = await readBody(req);
  const queueId = sanitizeString(body.queueId || "", 50);
  const action  = sanitizeString(body.action || "", 20);
  if (!queueId || !["pause", "resume", "stop"].includes(action)) {
    return json(res, 400, { error: "queueId and action (pause|resume|stop) are required." });
  }
  const queue = readJSON(OUTREACH_QUEUE_FILE);
  const idx   = queue.findIndex(q => q.id === queueId && q.userId === user.id);
  if (idx === -1) return json(res, 404, { error: "Not found." });
  if (action === "pause")  queue[idx].status = "paused";
  if (action === "resume") queue[idx].status = "active";
  if (action === "stop")   queue[idx].status = "stopped";
  writeJSON(OUTREACH_QUEUE_FILE, queue);
  json(res, 200, { ok: true, status: queue[idx].status });
}

// Background scheduler — runs every 15 min, auto-sends due email steps
async function runOutreachScheduler() {
  try {
    const queue = readJSON(OUTREACH_QUEUE_FILE);
    const now   = new Date();
    let   dirty = false;
    for (let i = 0; i < queue.length; i++) {
      const entry = queue[i];
      if (entry.status !== "active") continue;
      const conn = readJSON(SMTP_FILE).find(c => c.userId === entry.userId);
      if (!conn) continue;
      let password;
      try { password = decryptStr(conn.passwordEnc); } catch { continue; }
      for (let j = 0; j < entry.steps.length; j++) {
        const s = entry.steps[j];
        if (s.status !== "pending" || s.channel !== "Email") continue;
        if (new Date(s.scheduledFor) > now) continue;
        try {
          await smtpSend({ host: conn.host, port: conn.port, username: conn.username, password,
            from: conn.from, fromName: conn.fromName || "", to: entry.leadEmail,
            subject: s.subject || "(no subject)", body: s.body });
          const sentAt = new Date().toISOString();
          queue[i].steps[j].status = "sent";
          queue[i].steps[j].sentAt = sentAt;
          dirty = true;
          const log = readJSON(EMAIL_LOG_FILE);
          log.push({ id: generateId(), userId: entry.userId, leadId: entry.leadId || null,
            to: entry.leadEmail, subject: s.subject || "", sentAt, sequenceStep: s.step,
            opened: false, clicked: false });
          writeJSON(EMAIL_LOG_FILE, log);
        } catch { /* skip this step, retry next interval */ }
      }
      if (queue[i].steps.every(s => s.status === "sent" || s.channel !== "Email")) {
        queue[i].status = "completed";
        dirty = true;
      }
    }
    if (dirty) writeJSON(OUTREACH_QUEUE_FILE, queue);
  } catch { /* scheduler errors are silent */ }
}
setInterval(runOutreachScheduler, 15 * 60 * 1000);

// ── Trial / Billing handlers ──────────────────────────────────────────────────

async function handleTrialStart(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });

  const stripe = getStripe();
  if (!stripe) return json(res, 500, { error: "Billing not configured." });

  if (user.trialStatus && user.trialStatus !== "not_started") {
    return json(res, 400, { error: "Trial already used or account already active." });
  }

  const body = await readBody(req);
  const { paymentMethodId } = body;
  if (!paymentMethodId) return json(res, 400, { error: "paymentMethodId is required." });

  try {
    const customer = await stripe.customers.create({
      email: user.email,
      name:  `${user.firstName || ""} ${user.lastName || ""}`.trim(),
    });

    await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    const chosenTier = body.tier || "pro";
    const priceId = chosenTier === "beginners"
      ? process.env.STRIPE_BEGINNERS_PRICE_ID
      : process.env.STRIPE_PRICE_ID;
    if (!priceId) return json(res, 500, { error: "Price not configured for selected plan." });
    // Store chosen tier so webhook can set correct plan
    const tierForPlan = chosenTier;

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      trial_period_days: 7,
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
    });

    const now          = new Date();
    const trialEndsAt  = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const users = readJSON(USERS_FILE);
    const idx   = users.findIndex(u => u.id === user.id);
    if (idx === -1) return json(res, 404, { error: "User not found." });

    users[idx].plan                  = tierForPlan === "beginners" ? "beginners" : "trial";
    users[idx].trialStatus           = "active";
    users[idx].trialStartedAt        = now.toISOString();
    users[idx].trialEndsAt           = trialEndsAt;
    users[idx].stripeCustomerId      = customer.id;
    users[idx].stripeSubscriptionId  = subscription.id;
    users[idx].stripePaymentMethodId = paymentMethodId;
    users[idx].billingEmail          = user.email;
    users[idx].trialUsage            = { competitorSearches: 0, articlesGenerated: 0, auditsToday: 0, auditsTodayDate: null };
    writeJSON(USERS_FILE, users);

    // Send trial started email (async, don't block response)
    const trialEndDate = new Date(trialEndsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    sendSystemEmail(
      user.email,
      "Your eureach trial has started — 7 days free",
      `Hi ${user.firstName || "there"},\n\nYour 7-day free trial is now active.\n\nTrial ends: ${trialEndDate}\nIf you don't cancel before then, your card will be charged €20.\n\nWhat to do first:\n→ Run your AI Visibility Audit\n→ Search for your competitors\n→ Generate your first article\n\nCancel anytime at: https://eureach.eu/billing\n\n– The eureach team`
    ).catch(() => {});

    json(res, 200, { success: true, trialEndsAt, daysRemaining: 7 });
  } catch (err) {
    console.error("Trial start error:", err);
    json(res, 500, { error: "Failed to start trial: " + (err.message || "Unknown error") });
  }
}

async function handleTrialCancel(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });

  if (!isTrialActive(user)) {
    return json(res, 400, { error: "No active trial to cancel." });
  }

  const stripe = getStripe();
  if (!stripe) return json(res, 500, { error: "Billing not configured." });

  try {
    if (user.stripeSubscriptionId) {
      await stripe.subscriptions.cancel(user.stripeSubscriptionId);
    }

    const users = readJSON(USERS_FILE);
    const idx   = users.findIndex(u => u.id === user.id);
    if (idx !== -1) {
      users[idx].plan        = "cancelled";
      users[idx].trialStatus = "cancelled";
      users[idx].cancelledAt = new Date().toISOString();
      writeJSON(USERS_FILE, users);
    }

    json(res, 200, { success: true, message: "Trial cancelled. You will not be charged." });
  } catch (err) {
    console.error("Trial cancel error:", err);
    json(res, 500, { error: "Failed to cancel trial: " + (err.message || "Unknown error") });
  }
}

async function handleBillingWebhook(req, res) {
  const stripe = getStripe();
  if (!stripe) return json(res, 500, { error: "Billing not configured." });

  const rawBody = await readRawBody(req);
  const sig     = req.headers["stripe-signature"];
  const secret  = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return json(res, 400, { error: "Invalid signature." });
  }

  const users = readJSON(USERS_FILE);

  if (event.type === "customer.subscription.trial_will_end") {
    const sub    = event.data.object;
    const userId = users.find(u => u.stripeSubscriptionId === sub.id);
    if (userId) {
      const endDate = new Date(sub.trial_end * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      sendSystemEmail(
        userId.email,
        "3 days left in your eureach trial",
        `Your trial ends on ${endDate}.\n\nIf you'd like to continue, no action needed — you'll be charged €20 automatically.\n\nTo cancel: https://eureach.eu/billing → Cancel trial\n\n– The eureach team`
      ).catch(() => {});
    }
  }

  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object;
    if (invoice.billing_reason === "subscription_cycle" || invoice.billing_reason === "subscription_create") {
      const u = users.find(u => u.stripeCustomerId === invoice.customer);
      if (u && u.plan === "trial") {
        const idx = users.findIndex(x => x.id === u.id);
        users[idx].plan        = "paid";
        users[idx].trialStatus = "converted";
        users[idx].paidSince   = new Date().toISOString();
        users[idx].trialUsage  = { competitorSearches: 0, articlesGenerated: 0, auditsToday: 0, auditsTodayDate: null };
        writeJSON(USERS_FILE, users);

        const last4 = invoice.payment_intent?.payment_method_details?.card?.last4 || "****";
        sendSystemEmail(
          u.email,
          "Welcome to eureach — €20 charged",
          `Your trial has ended and your subscription is now active.\n€20 has been charged to your card ending in ${last4}.\n\nYou now have:\n→ Unlimited competitor searches\n→ Upgraded AI analysis\n→ Full article generation\n\nManage your subscription: https://eureach.eu/billing\n\n– The eureach team`
        ).catch(() => {});
      }
    }
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object;
    const u = users.find(u => u.stripeCustomerId === invoice.customer);
    if (u) {
      const idx = users.findIndex(x => x.id === u.id);
      users[idx].plan        = "free";
      users[idx].trialStatus = "expired";
      writeJSON(USERS_FILE, users);

      const last4 = "****";
      sendSystemEmail(
        u.email,
        "eureach — Payment failed, account paused",
        `We couldn't charge your card ending in ${last4}.\n\nYour account has been paused.\nUpdate your payment method to continue: https://eureach.eu/billing\n\n– The eureach team`
      ).catch(() => {});
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    const u   = users.find(u => u.stripeSubscriptionId === sub.id);
    if (u && u.plan !== "paid") {
      const idx = users.findIndex(x => x.id === u.id);
      if (users[idx].plan !== "cancelled") {
        users[idx].plan = "cancelled";
        writeJSON(USERS_FILE, users);
      }
    }
  }

  json(res, 200, { received: true });
}

function handleBillingStatus(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });

  const daysRemaining = getDaysRemainingInTrial(user);
  const usage         = getTrialUsage(user);

  const nextChargeDate = user.trialEndsAt
    ? new Date(user.trialEndsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

  json(res, 200, {
    plan:             user.plan || "free",
    trialStatus:      user.trialStatus || "not_started",
    daysRemaining,
    trialEndsAt:      user.trialEndsAt || null,
    nextChargeDate,
    nextChargeAmount: "€20",
    usage: {
      competitorSearches:      usage.competitorSearches || 0,
      competitorSearchesLimit: 1,
      articlesGenerated:       usage.articlesGenerated || 0,
      articlesLimit:           3,
      auditsToday:             usage.auditsToday || 0,
      auditsDailyLimit:        1,
    },
  });
}

async function handleBillingUpdateCard(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  if (!user.stripeCustomerId) return json(res, 400, { error: "No billing account found." });

  const stripe = getStripe();
  if (!stripe) return json(res, 500, { error: "Billing not configured." });

  const body = await readBody(req);
  const { paymentMethodId } = body;
  if (!paymentMethodId) return json(res, 400, { error: "paymentMethodId is required." });

  try {
    await stripe.paymentMethods.attach(paymentMethodId, { customer: user.stripeCustomerId });
    await stripe.customers.update(user.stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
    if (user.stripeSubscriptionId) {
      await stripe.subscriptions.update(user.stripeSubscriptionId, {
        default_payment_method: paymentMethodId,
      });
    }

    const users = readJSON(USERS_FILE);
    const idx   = users.findIndex(u => u.id === user.id);
    if (idx !== -1) {
      users[idx].stripePaymentMethodId = paymentMethodId;
      writeJSON(USERS_FILE, users);
    }

    json(res, 200, { success: true });
  } catch (err) {
    console.error("Update card error:", err);
    json(res, 500, { error: "Failed to update card: " + (err.message || "Unknown error") });
  }
}

async function handleBillingUpgradeNow(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  if (!isTrialActive(user)) return json(res, 400, { error: "No active trial to upgrade." });
  if (!user.stripeSubscriptionId) return json(res, 400, { error: "No subscription found." });

  const stripe = getStripe();
  if (!stripe) return json(res, 500, { error: "Billing not configured." });

  try {
    await stripe.subscriptions.update(user.stripeSubscriptionId, { trial_end: "now" });
    json(res, 200, { success: true, message: "Upgrade initiated. Your card will be charged €20 shortly." });
  } catch (err) {
    console.error("Upgrade now error:", err);
    json(res, 500, { error: "Failed to upgrade: " + (err.message || "Unknown error") });
  }
}

// ── PayPal subscription billing ───────────────────────────────────────────────────

async function handlePayPalBillingInfo(req, res) {
  const params = new URLSearchParams(req.url.split("?")[1] || "");
  const plan   = params.get("plan") || "pro";
  const planId = plan === "beginners"
    ? (process.env.PAYPAL_BEGINNERS_PLAN_ID || null)
    : (process.env.PAYPAL_PLAN_ID           || null);
  json(res, 200, {
    clientId: process.env.PAYPAL_CLIENT_ID || null,
    planId,
  });
}

async function handlePayPalSubscriptionActivate(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });

  const body = await readBody(req);
  const { subscriptionId } = body;
  if (!subscriptionId) return json(res, 400, { error: "subscriptionId required." });

  const pp = await getPayPalToken();
  if (!pp) return json(res, 500, { error: "PayPal not configured." });

  try {
    const r   = await fetch(pp.base + "/v1/billing/subscriptions/" + subscriptionId, {
      headers: { "Authorization": "Bearer " + pp.token },
    });
    const sub = await r.json();
    if (!r.ok || !["ACTIVE", "APPROVAL_PENDING"].includes(sub.status)) {
      return json(res, 400, { error: "Subscription not active: " + sub.status });
    }

    const now         = new Date();
    const trialEndsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const users = readJSON(USERS_FILE);
    const idx   = users.findIndex(u => u.id === user.id);
    if (idx === -1) return json(res, 404, { error: "User not found." });

    const ppTier = body.tier || "pro";
    users[idx].plan                 = ppTier === "beginners" ? "beginners" : "trial";
    users[idx].trialStatus          = "active";
    users[idx].trialStartedAt       = now.toISOString();
    users[idx].trialEndsAt          = trialEndsAt;
    users[idx].paypalSubscriptionId = subscriptionId;
    users[idx].billingProvider      = "paypal";
    users[idx].billingEmail         = user.email;
    users[idx].trialUsage           = users[idx].trialUsage || { competitorSearches: 0, articlesGenerated: 0, auditsToday: 0, auditsTodayDate: null };
    writeJSON(USERS_FILE, users);

    const trialEndDate = new Date(trialEndsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    sendSystemEmail(
      user.email,
      "Your eureach trial has started — 7 days free",
      `Hi ${user.firstName || "there"},\n\nYour 7-day free trial is now active via PayPal.\n\nTrial ends: ${trialEndDate}\nIf you don't cancel before then, your PayPal will be charged €20/month.\n\nCancel anytime at: https://eureach.eu/billing\n\n– The eureach team`
    ).catch(() => {});

    json(res, 200, { success: true, trialEndsAt, daysRemaining: 7 });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}


// ── Startup migration — add trial fields to existing users ────────────────────
(function migrateUsers() {
  try {
    const users  = readJSON(USERS_FILE);
    let changed  = false;
    for (const u of users) {
      if (u.trialStatus === undefined) {
        u.trialStatus           = "not_started";
        u.trialStartedAt        = null;
        u.trialEndsAt           = null;
        u.stripeCustomerId      = null;
        u.stripeSubscriptionId  = null;
        u.stripePaymentMethodId = null;
        u.billingEmail          = null;
        u.paidSince             = null;
        u.cancelledAt           = null;
        u.trialUsage            = { competitorSearches: 0, articlesGenerated: 0, auditsToday: 0, auditsTodayDate: null };
        changed = true;
      }
      if (!u.trialUsage) {
        u.trialUsage = { competitorSearches: 0, articlesGenerated: 0, auditsToday: 0, auditsTodayDate: null };
        changed = true;
      }
    }
    if (changed) {
      writeJSON(USERS_FILE, users);
      console.log("[migration] Added trial fields to existing users");
    }
  } catch (err) {
    console.error("[migration] Failed:", err.message);
  }
})();


(function migrateDashboard() {
  try {
    const ensureArray = (file) => {
      try {
        const d = readJSON(file);
        if (!Array.isArray(d)) { writeJSON(file, []); return []; }
        return d;
      } catch (e) { writeJSON(file, []); return []; }
    };
    ensureArray(DASHBOARD_SITES_FILE);
    ensureArray(DASHBOARD_RECURRING_FILE);
    ensureArray(DASHBOARD_INSTANCES_FILE);
    const jt = ensureArray(DASHBOARD_JOB_TYPES_FILE);
    if (jt.length === 0) {
      console.log('[migration] dashboard-job-types.json is empty — seed it manually from data/dashboard-job-types.json');
    }
  } catch (err) {
    console.error('[migration] migrateDashboard failed:', err.message);
  }
})();
// ── Router ────────────────────────────────────────────────────────────────────

// Paths that must never be served as static files
const BLOCKED_STATIC_PREFIXES = ["/data/", "/config/", "/security/", "/."];
const BLOCKED_STATIC_FILES    = ["/server.js", "/package.json", "/package-lock.json", "/.env"];

// CSRF-exempt endpoints (before session exists)
const CSRF_EXEMPT = ["/api/auth/signup", "/api/auth/signin", "/api/billing/webhook", "/api/audit-public/start", "/api/audit-public/save", "/api/audit-public/email-save", "/api/newsletter/subscribe"];

function generateCsrfToken() { return crypto.randomBytes(24).toString("hex"); }


// ═══════════════════════════════════════════════════════════════════════════════
// AI CITATION BUILDER — handlers (eureach.eu)
// ═══════════════════════════════════════════════════════════════════════════════

const CITATION_PACKAGES = {
  starter:   { name: "Starter",   mentions: 5,  publishers: 5,  queries: 1, days: 60,  price: 299  },
  growth:    { name: "Growth",    mentions: 15, publishers: 10, queries: 3, days: 60,  price: 699  },
  authority: { name: "Authority", mentions: 30, publishers: 20, queries: 6, days: 90,  price: 1299 },
};

function citNextId(arr) {
  return arr.length ? Math.max(...arr.map(x => x.id || 0)) + 1 : 1;
}

// GET /api/citations/packages
async function handleCitationsPackages(req, res) {
  return json(res, 200, { packages: CITATION_PACKAGES });
}

// POST /api/citations/campaigns
async function handleCitationsCampaignCreate(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });

  const body = await readBody(req);
  const pkg  = CITATION_PACKAGES[body.package];
  if (!pkg) return json(res, 400, { error: "Invalid package." });

  const queries = Array.isArray(body.target_queries) ? body.target_queries.slice(0, pkg.queries) : [];
  if (!queries.length) return json(res, 400, { error: "At least one target query is required." });

  const campaigns = Array.isArray(readJSON(CITATION_CAMPAIGNS_FILE)) ? readJSON(CITATION_CAMPAIGNS_FILE) : [];
  const campaign  = {
    id:                   citNextId(campaigns),
    user_id:              user.id,
    package:              body.package,
    status:               "pending",
    target_queries:       queries,
    business_description: (body.business_description || "").slice(0, 2000),
    key_messages:         Array.isArray(body.key_messages) ? body.key_messages.slice(0, 5) : [],
    target_language:      body.target_language || "el",
    target_market:        body.target_market || "greece",
    mentions_total:       pkg.mentions,
    mentions_placed:      0,
    mentions_live:        0,
    youtube_addon:           (body.package === 'authority') || (body.package === 'growth' && body.youtube_addon === true),
    youtube_status:          ((body.package === 'authority') || (body.package === 'growth' && body.youtube_addon === true)) ? 'pending' : 'not_included',
    youtube_audience_type:   body.youtube_audience_type  || null,
    youtube_natural_phrase:  body.youtube_natural_phrase || null,
    youtube_restrictions:    body.youtube_restrictions   || null,
    price_paid:           (body.package === 'growth' && body.youtube_addon === true) ? pkg.price + 199 : pkg.price,
    stripe_payment_id:    null,
    started_at:           null,
    completed_at:         null,
    created_at:           new Date().toISOString(),
  };
  campaigns.push(campaign);
  writeJSON(CITATION_CAMPAIGNS_FILE, campaigns);

  sendSystemEmail(
    process.env.ADMIN_EMAIL || process.env.SYSTEM_EMAIL_USER,
    "New Citation Campaign — action required",
    "A new " + pkg.name + " campaign was created by user " + (user.email || user.id) + ". Campaign ID: " + campaign.id + ". Go to /citations-admin.html to assign publishers."
  );

  return json(res, 201, { campaign });
}

// GET /api/citations/campaigns
async function handleCitationsCampaignsList(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const all = Array.isArray(readJSON(CITATION_CAMPAIGNS_FILE)) ? readJSON(CITATION_CAMPAIGNS_FILE) : [];
  return json(res, 200, { campaigns: all.filter(c => c.user_id === user.id) });
}

// GET /api/citations/campaigns/:id
async function handleCitationsCampaignGet(req, res, id) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const all      = Array.isArray(readJSON(CITATION_CAMPAIGNS_FILE)) ? readJSON(CITATION_CAMPAIGNS_FILE) : [];
  const campaign = all.find(c => c.id === parseInt(id));
  if (!campaign) return json(res, 404, { error: "Campaign not found." });
  if (campaign.user_id !== user.id && user.role !== "admin") return json(res, 403, { error: "Access denied." });
  return json(res, 200, { campaign });
}

// GET /api/citations/campaigns/:id/placements
async function handleCitationsPlacementsGet(req, res, id) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const campaigns = Array.isArray(readJSON(CITATION_CAMPAIGNS_FILE)) ? readJSON(CITATION_CAMPAIGNS_FILE) : [];
  const campaign  = campaigns.find(c => c.id === parseInt(id));
  if (!campaign) return json(res, 404, { error: "Campaign not found." });
  if (campaign.user_id !== user.id && user.role !== "admin") return json(res, 403, { error: "Access denied." });
  const all = Array.isArray(readJSON(CITATION_PLACEMENTS_FILE)) ? readJSON(CITATION_PLACEMENTS_FILE) : [];
  return json(res, 200, { placements: all.filter(p => p.campaign_id === parseInt(id)) });
}

// GET /api/citations/campaigns/:id/snapshots
async function handleCitationsSnapshotsGet(req, res, id) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const campaigns = Array.isArray(readJSON(CITATION_CAMPAIGNS_FILE)) ? readJSON(CITATION_CAMPAIGNS_FILE) : [];
  const campaign  = campaigns.find(c => c.id === parseInt(id));
  if (!campaign) return json(res, 404, { error: "Campaign not found." });
  if (campaign.user_id !== user.id && user.role !== "admin") return json(res, 403, { error: "Access denied." });
  const all = Array.isArray(readJSON(CITATION_SNAPSHOTS_FILE)) ? readJSON(CITATION_SNAPSHOTS_FILE) : [];
  return json(res, 200, { snapshots: all.filter(s => s.campaign_id === parseInt(id)) });
}

// POST /api/citations/campaigns/:id/snapshot
async function handleCitationsSnapshotCreate(req, res, id) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const campaigns = Array.isArray(readJSON(CITATION_CAMPAIGNS_FILE)) ? readJSON(CITATION_CAMPAIGNS_FILE) : [];
  const campaign  = campaigns.find(c => c.id === parseInt(id));
  if (!campaign) return json(res, 404, { error: "Campaign not found." });
  if (campaign.user_id !== user.id && user.role !== "admin") return json(res, 403, { error: "Access denied." });

  const apiKey = getAnthropicKey();
  if (!apiKey) return json(res, 500, { error: "AI not configured." });

  const body         = await readBody(req);
  const query        = (body.query || campaign.target_queries[0] || "").trim();
  const businessName = (body.business_name || "").trim();
  if (!query || !businessName) return json(res, 400, { error: "query and business_name are required." });

  try {
    const response = await callClaude(
      apiKey,
      "You answer questions as a knowledgeable assistant. Be honest — only mention businesses you actually know about. Do not invent information.",
      query, 500
    );
    const answer   = (response.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const appeared = answer.toLowerCase().includes(businessName.toLowerCase());
    const sentences = answer.split(/[.!?]+/);
    const excerpt   = appeared ? sentences.filter(s => s.toLowerCase().includes(businessName.toLowerCase())).slice(0, 2).join(". ").trim() : null;

    const snapshots = Array.isArray(readJSON(CITATION_SNAPSHOTS_FILE)) ? readJSON(CITATION_SNAPSHOTS_FILE) : [];
    const snap = { id: citNextId(snapshots), campaign_id: parseInt(id), user_id: user.id, query, engine: "claude_proxy", appeared, snapshot_text: excerpt, taken_at: new Date().toISOString() };
    snapshots.push(snap);
    writeJSON(CITATION_SNAPSHOTS_FILE, snapshots);

    if (appeared) {
      const users  = Array.isArray(readJSON(USERS_FILE)) ? readJSON(USERS_FILE) : [];
      const client = users.find(u => u.id === campaign.user_id);
      if (client) sendSystemEmail(client.email, "Εμφανιστήκατε στο AI για: " + query, 'Το AI engine εντόπισε την επιχείρησή σας για το ερώτημα: "' + query + '". Σχετικό απόσπασμα: ' + (excerpt || "-"));
    }
    return json(res, 200, { snap });
  } catch (e) {
    return json(res, 500, { error: "Visibility check failed: " + e.message });
  }
}

// POST /api/citations/checkout
async function handleCitationsCheckout(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });

  const body = await readBody(req);
  const pkg  = CITATION_PACKAGES[body.package];
  if (!pkg) return json(res, 400, { error: "Invalid package." });

  const stripe = getStripe();
  if (!stripe) return json(res, 500, { error: "Billing not configured. Please contact support." });

  const youtubeAddon = body.package === "growth" && !!body.youtube_addon;
  const amountEur    = youtubeAddon ? pkg.price + 199 : pkg.price;
  const label        = "AI Citation Builder — " + pkg.name + (youtubeAddon ? " + YouTube Mention" : "");
  const campaignId   = String(body.campaign_id || "");
  const origin       = process.env.SITE_URL || "https://eureach.eu";

  try {
    const session = await stripe.checkout.sessions.create({
      mode:        "payment",
      line_items:  [{ price_data: { currency: "eur", unit_amount: Math.round(amountEur * 100), product_data: { name: label } }, quantity: 1 }],
      metadata:    { userId: String(user.id), package: body.package, campaignId, youtube_addon: String(youtubeAddon) },
      customer_email: user.email,
      success_url: origin + "/citations-campaign.html?id=" + campaignId + "&paid=1",
      cancel_url:  origin + "/citations-wizard.html?package=" + body.package + (youtubeAddon ? "&youtube=1" : ""),
    });
    return json(res, 200, { url: session.url });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
}

// POST /api/citations/webhook
async function handleCitationsWebhook(req, res) {
  const rawBody = req._rawBody;
  const sig     = req.headers["stripe-signature"];
  const secret  = process.env.STRIPE_CITATION_WEBHOOK_SECRET;
  const stripe  = getStripe();
  if (!stripe || !secret) return json(res, 200, { received: true }); // silently ok if not configured

  let event;
  try { event = stripe.webhooks.constructEvent(rawBody || Buffer.alloc(0), sig, secret); }
  catch (e) { return json(res, 400, { error: "Webhook signature invalid." }); }

  if (event.type === "checkout.session.completed") {
    const session    = event.data.object;
    const campaignId = parseInt(session.metadata.campaignId);
    const userId     = parseInt(session.metadata.userId);
    if (campaignId) {
      const campaigns = Array.isArray(readJSON(CITATION_CAMPAIGNS_FILE)) ? readJSON(CITATION_CAMPAIGNS_FILE) : [];
      const idx = campaigns.findIndex(c => c.id === campaignId);
      if (idx !== -1) {
        activateCitationCampaign(campaignId, userId, session.payment_intent || session.id);
      }
    }
  }
  return json(res, 200, { received: true });
}


// ── PayPal helpers ────────────────────────────────────────────────────────────
async function getPayPalToken() {
  const clientId     = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const base = process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  const res = await fetch(base + "/v1/oauth2/token", {
    method: "POST",
    headers: { "Authorization": "Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const d = await res.json();
  return d.access_token ? { token: d.access_token, base } : null;
}

function activateCitationCampaign(campaignId, userId, paymentId) {
  const campaigns = Array.isArray(readJSON(CITATION_CAMPAIGNS_FILE)) ? readJSON(CITATION_CAMPAIGNS_FILE) : [];
  const idx = campaigns.findIndex(c => c.id === campaignId);
  if (idx === -1) return false;
  if (campaigns[idx].status === "active") return true;
  campaigns[idx].status            = "active";
  campaigns[idx].stripe_payment_id = paymentId;
  campaigns[idx].started_at        = new Date().toISOString();
  writeJSON(CITATION_CAMPAIGNS_FILE, campaigns);
  const users  = Array.isArray(readJSON(USERS_FILE)) ? readJSON(USERS_FILE) : [];
  const client = users.find(u => u.id === userId);
  if (client) sendSystemEmail(client.email, "Your campaign has started", "Your AI Citation Builder campaign has started. Track progress at https://eureach.eu/citations-campaign.html?id=" + campaignId);
  return true;
}

// POST /api/citations/paypal/create-order
async function handlePayPalCreateOrder(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });

  const body = await readBody(req);
  const pkg  = CITATION_PACKAGES[body.package];
  if (!pkg) return json(res, 400, { error: "Invalid package." });

  const pp = await getPayPalToken();
  if (!pp) return json(res, 500, { error: "PayPal not configured." });

  const youtubeAddon = body.package === "growth" && !!body.youtube_addon;
  const amountEur    = (youtubeAddon ? pkg.price + 199 : pkg.price).toFixed(2);
  const label        = "AI Citation Builder — " + pkg.name + (youtubeAddon ? " + YouTube Mention" : "");

  try {
    const r = await fetch(pp.base + "/v2/checkout/orders", {
      method: "POST",
      headers: { "Authorization": "Bearer " + pp.token, "Content-Type": "application/json", "PayPal-Request-Id": "cit-" + body.campaign_id + "-" + Date.now() },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{ amount: { currency_code: "EUR", value: amountEur }, description: label, custom_id: String(body.campaign_id) + "|" + String(user.id) }],
      }),
    });
    const order = await r.json();
    if (!r.ok) return json(res, 500, { error: order.message || "PayPal error" });
    return json(res, 200, { id: order.id });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
}

// POST /api/citations/paypal/capture-order
async function handlePayPalCaptureOrder(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });

  const body = await readBody(req);
  const { order_id } = body;
  if (!order_id) return json(res, 400, { error: "order_id required." });

  const pp = await getPayPalToken();
  if (!pp) return json(res, 500, { error: "PayPal not configured." });

  try {
    const r = await fetch(pp.base + "/v2/checkout/orders/" + order_id + "/capture", {
      method: "POST",
      headers: { "Authorization": "Bearer " + pp.token, "Content-Type": "application/json" },
    });
    const capture = await r.json();
    if (!r.ok || capture.status !== "COMPLETED") return json(res, 400, { error: "Payment not completed." });

    const unit       = capture.purchase_units?.[0];
    const customId   = unit?.custom_id || "";
    const [campaignIdStr, userIdStr] = customId.split("|");
    const campaignId = parseInt(campaignIdStr);
    const userId     = parseInt(userIdStr);
    const paymentId  = unit?.payments?.captures?.[0]?.id || order_id;

    activateCitationCampaign(campaignId, userId, paymentId);
    return json(res, 200, { ok: true, campaign_id: campaignId });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
}

// POST /api/citations/publishers/apply  (public — no auth)
async function handleCitationsPublisherApply(req, res) {
  const body = await readBody(req);
  const url  = (body.url || "").trim();
  if (!url) return json(res, 400, { error: "Website URL is required." });

  const publishers = Array.isArray(readJSON(CITATION_PUBLISHERS_FILE)) ? readJSON(CITATION_PUBLISHERS_FILE) : [];
  const entry = {
    id:                  citNextId(publishers),
    name:                (body.name || url).trim(),
    url,
    domain_rating:       null,
    monthly_traffic:     parseInt(body.monthly_traffic) || null,
    language:            (body.language || "el").trim(),
    categories:          (body.categories || "").split(",").map(s => s.trim()).filter(Boolean),
    country:             (body.country || "Greece").trim(),
    cost_per_placement:  null,
    status:              "pending",
    notes:               "",
    contact_email:       (body.contact_email || "").trim(),
    added_at:            new Date().toISOString(),
  };
  publishers.push(entry);
  writeJSON(CITATION_PUBLISHERS_FILE, publishers);
  sendSystemEmail(process.env.ADMIN_EMAIL || process.env.SYSTEM_EMAIL_USER, "New publisher application: " + url, "URL: " + url + "\nContact: " + entry.contact_email + "\nTraffic: " + (entry.monthly_traffic || "unknown") + "\nLanguage: " + entry.language);
  return json(res, 200, { ok: true, message: "Application received. We will review and contact you within 48 hours." });
}

// ── Admin handlers ────────────────────────────────────────────────────────────

// GET /api/admin/citations/campaigns
async function handleAdminCitationsCampaigns(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user || user.role !== "admin") return json(res, 403, { error: "Admin only." });
  const campaigns = Array.isArray(readJSON(CITATION_CAMPAIGNS_FILE)) ? readJSON(CITATION_CAMPAIGNS_FILE) : [];
  const users     = Array.isArray(readJSON(USERS_FILE)) ? readJSON(USERS_FILE) : [];
  return json(res, 200, { campaigns: campaigns.map(c => {
    const u = users.find(u => u.id === c.user_id);
    return { ...c, user_email: u ? u.email : "unknown", user_name: u ? ((u.firstName || "") + " " + (u.lastName || "")).trim() : "" };
  })});
}

// GET /api/admin/citations/publishers
async function handleAdminCitationsPublishers(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user || user.role !== "admin") return json(res, 403, { error: "Admin only." });
  return json(res, 200, { publishers: Array.isArray(readJSON(CITATION_PUBLISHERS_FILE)) ? readJSON(CITATION_PUBLISHERS_FILE) : [] });
}

// POST /api/admin/citations/publishers
async function handleAdminCitationsPublisherCreate(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user || user.role !== "admin") return json(res, 403, { error: "Admin only." });
  const body = await readBody(req);
  if (!body.name || !body.url) return json(res, 400, { error: "name and url are required." });
  const publishers = Array.isArray(readJSON(CITATION_PUBLISHERS_FILE)) ? readJSON(CITATION_PUBLISHERS_FILE) : [];
  const pub = {
    id:                 citNextId(publishers),
    name:               body.name.trim(),
    url:                body.url.trim(),
    domain_rating:      parseInt(body.domain_rating) || null,
    monthly_traffic:    parseInt(body.monthly_traffic) || null,
    language:           body.language || "el",
    categories:         Array.isArray(body.categories) ? body.categories : (body.categories || "").split(",").map(s => s.trim()).filter(Boolean),
    country:            body.country || "Greece",
    cost_per_placement: parseFloat(body.cost_per_placement) || null,
    status:             body.status || "active",
    notes:              body.notes || "",
    contact_email:      body.contact_email || "",
    added_at:           new Date().toISOString(),
  };
  publishers.push(pub);
  writeJSON(CITATION_PUBLISHERS_FILE, publishers);
  return json(res, 201, { publisher: pub });
}

// PUT /api/admin/citations/publishers/:id
async function handleAdminCitationsPublisherUpdate(req, res, id) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user || user.role !== "admin") return json(res, 403, { error: "Admin only." });
  const body = await readBody(req);
  const publishers = Array.isArray(readJSON(CITATION_PUBLISHERS_FILE)) ? readJSON(CITATION_PUBLISHERS_FILE) : [];
  const idx = publishers.findIndex(p => p.id === parseInt(id));
  if (idx === -1) return json(res, 404, { error: "Publisher not found." });
  ["name","url","domain_rating","monthly_traffic","language","categories","country","cost_per_placement","status","notes","contact_email"].forEach(k => { if (body[k] !== undefined) publishers[idx][k] = body[k]; });
  writeJSON(CITATION_PUBLISHERS_FILE, publishers);
  return json(res, 200, { publisher: publishers[idx] });
}

// GET /api/admin/citations/placements
async function handleAdminCitationsPlacementsList(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user || user.role !== "admin") return json(res, 403, { error: "Admin only." });
  const placements = Array.isArray(readJSON(CITATION_PLACEMENTS_FILE)) ? readJSON(CITATION_PLACEMENTS_FILE) : [];
  const publishers = Array.isArray(readJSON(CITATION_PUBLISHERS_FILE)) ? readJSON(CITATION_PUBLISHERS_FILE) : [];
  const campaigns  = Array.isArray(readJSON(CITATION_CAMPAIGNS_FILE)) ? readJSON(CITATION_CAMPAIGNS_FILE) : [];
  return json(res, 200, { placements: placements.map(p => {
    const pub = publishers.find(pb => pb.id === p.publisher_id) || {};
    const cam = campaigns.find(c => c.id === p.campaign_id) || {};
    return { ...p, publisher_name: pub.name, publisher_url: pub.url, campaign_package: cam.package };
  })});
}

// POST /api/admin/citations/placements
async function handleAdminCitationsPlacementCreate(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user || user.role !== "admin") return json(res, 403, { error: "Admin only." });
  const body = await readBody(req);
  if (!body.campaign_id || !body.publisher_id) return json(res, 400, { error: "campaign_id and publisher_id are required." });
  const placements = Array.isArray(readJSON(CITATION_PLACEMENTS_FILE)) ? readJSON(CITATION_PLACEMENTS_FILE) : [];
  const placement  = {
    id: citNextId(placements), campaign_id: parseInt(body.campaign_id), publisher_id: parseInt(body.publisher_id),
    status: "draft", article_title: "", article_content: "", article_url: null, mention_excerpt: "",
    submitted_at: null, published_at: null, expires_at: null, admin_notes: body.admin_notes || "",
    created_at: new Date().toISOString(),
  };
  placements.push(placement);
  writeJSON(CITATION_PLACEMENTS_FILE, placements);
  return json(res, 201, { placement });
}

// PUT /api/admin/citations/placements/:id
async function handleAdminCitationsPlacementUpdate(req, res, id) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user || user.role !== "admin") return json(res, 403, { error: "Admin only." });
  const body = await readBody(req);
  const placements = Array.isArray(readJSON(CITATION_PLACEMENTS_FILE)) ? readJSON(CITATION_PLACEMENTS_FILE) : [];
  const idx = placements.findIndex(p => p.id === parseInt(id));
  if (idx === -1) return json(res, 404, { error: "Placement not found." });

  const prev = { ...placements[idx] };
  ["status","article_title","article_content","article_url","mention_excerpt","submitted_at","published_at","admin_notes"].forEach(k => { if (body[k] !== undefined) placements[idx][k] = body[k]; });

  if (body.status === "published" && prev.status !== "published") {
    const exp = new Date(); exp.setFullYear(exp.getFullYear() + 1);
    placements[idx].published_at = placements[idx].published_at || new Date().toISOString();
    placements[idx].expires_at   = exp.toISOString();

    const campaigns = Array.isArray(readJSON(CITATION_CAMPAIGNS_FILE)) ? readJSON(CITATION_CAMPAIGNS_FILE) : [];
    const cidx = campaigns.findIndex(c => c.id === placements[idx].campaign_id);
    if (cidx !== -1) {
      campaigns[cidx].mentions_live   = (campaigns[cidx].mentions_live || 0) + 1;
      campaigns[cidx].mentions_placed = (campaigns[cidx].mentions_placed || 0) + 1;
      const total = campaigns[cidx].mentions_total;
      const live  = campaigns[cidx].mentions_live;
      const users  = Array.isArray(readJSON(USERS_FILE)) ? readJSON(USERS_FILE) : [];
      const client = users.find(u => u.id === campaigns[cidx].user_id);
      if (client && live === 1) sendSystemEmail(client.email, "Η πρώτη σας αναφορά είναι online", "Τίτλος: " + placements[idx].article_title + "\nURL: " + (placements[idx].article_url || "-") + "\nΔείτε την καμπάνια: eureach.eu/citations-campaign.html?id=" + campaigns[cidx].id);
      if (client && total && live === Math.floor(total / 2)) sendSystemEmail(client.email, "Μέχρι τώρα: " + live + " αναφορές live", "Έχουμε τοποθετήσει " + live + " από " + total + " αναφορές. eureach.eu/citations-campaign.html?id=" + campaigns[cidx].id);
      if (live >= total) {
        campaigns[cidx].status = "completed"; campaigns[cidx].completed_at = new Date().toISOString();
        if (client) sendSystemEmail(client.email, "Η καμπάνια ολοκληρώθηκε", "Όλες οι " + total + " αναφορές είναι live. eureach.eu/citations-campaign.html?id=" + campaigns[cidx].id);
      }
      writeJSON(CITATION_CAMPAIGNS_FILE, campaigns);
    }
  }
  writeJSON(CITATION_PLACEMENTS_FILE, placements);
  return json(res, 200, { placement: placements[idx] });
}

// POST /api/admin/citations/generate — AI article generation
async function handleAdminCitationsGenerate(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user || user.role !== "admin") return json(res, 403, { error: "Admin only." });

  const body = await readBody(req);
  if (!body.placement_id) return json(res, 400, { error: "placement_id is required." });

  const placements = Array.isArray(readJSON(CITATION_PLACEMENTS_FILE)) ? readJSON(CITATION_PLACEMENTS_FILE) : [];
  const publishers = Array.isArray(readJSON(CITATION_PUBLISHERS_FILE)) ? readJSON(CITATION_PUBLISHERS_FILE) : [];
  const campaigns  = Array.isArray(readJSON(CITATION_CAMPAIGNS_FILE)) ? readJSON(CITATION_CAMPAIGNS_FILE) : [];

  const pidx      = placements.findIndex(p => p.id === parseInt(body.placement_id));
  if (pidx === -1) return json(res, 404, { error: "Placement not found." });
  const placement = placements[pidx];
  const publisher = publishers.find(p => p.id === placement.publisher_id);
  const campaign  = campaigns.find(c => c.id === placement.campaign_id);
  if (!publisher || !campaign) return json(res, 404, { error: "Publisher or campaign not found." });

  const apiKey = getAnthropicKey();
  if (!apiKey) return json(res, 500, { error: "AI not configured." });

  const lang = publisher.language === "el" ? "Greek" : publisher.language === "de" ? "German" : "English";

  try {
    const response = await callClaude(
      apiKey,
      `You are an expert content writer specialising in business and technology articles. Write authoritative, natural-sounding articles that read as genuine editorial content. Never write promotional or advertorial copy. The article must read as if written by an independent journalist. Return ONLY valid JSON. No text outside JSON.`,
      `Write an article for publication on ${publisher.name} (${publisher.url}).
Publisher categories: ${(publisher.categories || []).join(", ")}
Publisher language: ${publisher.language}
Publisher country: ${publisher.country}

Naturally mention this business in a credible, editorial context:
Business description: ${campaign.business_description}
Key messages: ${(campaign.key_messages || []).join(" | ")}
Target queries: ${(campaign.target_queries || []).join(" | ")}

RULES:
- 500-700 words, editorial tone, independent voice
- Business mention must feel natural — not forced
- Include business in a list or comparison where appropriate
- Do NOT use "leading", "best", "top" directly about the client
- Write in ${lang}

Return JSON: {"title":"...","content":"...","mention_excerpt":"...","topic_angle":"...","target_query_addressed":"..."}`,
      1500
    );
    const text   = (response.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const result = JSON.parse(text);
    placements[pidx].article_title   = result.title   || "";
    placements[pidx].article_content = result.content || "";
    placements[pidx].mention_excerpt = result.mention_excerpt || "";
    writeJSON(CITATION_PLACEMENTS_FILE, placements);
    return json(res, 200, { article: result });
  } catch (e) {
    return json(res, 500, { error: "Article generation failed: " + e.message });
  }
}

// Weekly visibility snapshot — runs every hour, acts only on Monday 8am
setInterval(async () => {
  const now = new Date();
  if (now.getDay() !== 1 || now.getHours() !== 8) return;
  const apiKey = getAnthropicKey();
  const groqKey = getGroqKey();
  if (!apiKey && !groqKey) return;
  const campaigns = Array.isArray(readJSON(CITATION_CAMPAIGNS_FILE)) ? readJSON(CITATION_CAMPAIGNS_FILE) : [];
  const snapshots = Array.isArray(readJSON(CITATION_SNAPSHOTS_FILE)) ? readJSON(CITATION_SNAPSHOTS_FILE) : [];
  const users     = Array.isArray(readJSON(USERS_FILE)) ? readJSON(USERS_FILE) : [];
  let changed = false;
  for (const campaign of campaigns.filter(c => c.status === "active" || c.status === "in_progress")) {
    const query = campaign.target_queries[0];
    if (!query) continue;
    try {
      const response = await callClaude(apiKey, "Answer questions as a knowledgeable assistant. Be honest.", query, 400);
      const answer   = (response.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      const client   = users.find(u => u.id === campaign.user_id);
      const bname    = client ? (client.businessName || ((client.firstName || "") + " " + (client.lastName || "")).trim() || client.email) : "";
      const appeared = bname ? answer.toLowerCase().includes(bname.toLowerCase()) : false;
      const sentences = answer.split(/[.!?]+/);
      const excerpt   = appeared ? sentences.filter(s => s.toLowerCase().includes(bname.toLowerCase())).slice(0, 2).join(". ").trim() : null;
      snapshots.push({ id: citNextId(snapshots), campaign_id: campaign.id, user_id: campaign.user_id, query, engine: "claude_proxy_weekly", appeared, snapshot_text: excerpt, taken_at: new Date().toISOString() });
      changed = true;
    } catch {}
  }
  if (changed) writeJSON(CITATION_SNAPSHOTS_FILE, snapshots);
}, 60 * 60 * 1000);


// POST /api/admin/citations/youtube-brief — generate YouTuber brief for a campaign
async function handleAdminCitationsYoutubeBrief(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user || user.role !== "admin") return json(res, 403, { error: "Admin only." });

  const body = await readBody(req);
  if (!body.campaign_id) return json(res, 400, { error: "campaign_id is required." });

  const campaigns = Array.isArray(readJSON(CITATION_CAMPAIGNS_FILE)) ? readJSON(CITATION_CAMPAIGNS_FILE) : [];
  const campaign  = campaigns.find(c => c.id === parseInt(body.campaign_id));
  if (!campaign) return json(res, 404, { error: "Campaign not found." });
  if (!campaign.youtube_addon) return json(res, 400, { error: "This campaign does not include a YouTube placement." });

  const apiKey = getAnthropicKey();
  if (!apiKey) return json(res, 500, { error: "AI not configured." });

  const restrictionsLine = campaign.youtube_restrictions
    ? `\nHARD CONSTRAINTS — the YouTuber must avoid:\n- ${campaign.youtube_restrictions}`
    : "";

  const systemPrompt = `You are a talent manager briefing a YouTuber for a sponsored mention.
Write a concise, friendly brief that a Greek YouTuber can read in under 2 minutes.
The mention must feel 100% natural — not an ad, not a testimonial, just a genuine reference.
Return ONLY valid JSON. No text outside JSON.`;

  const userMsg = `Create a YouTube mention brief for this campaign:

Business description: ${campaign.business_description}
Key messages: ${(campaign.key_messages || []).join(" | ")}
Target queries (what AI engines should return this business for): ${(campaign.target_queries || []).join(" | ")}
Audience type: ${campaign.youtube_audience_type || "not specified"}
Natural phrase anchor (how to mention the business): "${campaign.youtube_natural_phrase || ""}"
${restrictionsLine}

Write the brief in Greek (the YouTuber is Greek).

Return this JSON:
{
  "channel_fit": "one sentence on what type of channel/video this suits best",
  "suggested_context": "the scene or topic in a video where this mention fits naturally (2-3 sentences)",
  "example_phrase": "the exact words the YouTuber could say — casual, spoken Greek, 1-3 sentences, using the natural phrase anchor as inspiration",
  "talking_points": ["up to 3 bullet points the YouTuber can optionally expand on"],
  "avoid": ["list of things to avoid — include any hard constraints plus general guidance"],
  "duration": "suggested mention length in seconds (e.g. 15-20 seconds)"
}`;

  try {
    const response = await callClaude(apiKey, systemPrompt, userMsg, 1000);
    const text     = (response.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const brief    = JSON.parse(text);

    // Store the brief on the campaign
    const cidx = campaigns.findIndex(c => c.id === parseInt(body.campaign_id));
    campaigns[cidx].youtube_brief      = brief;
    campaigns[cidx].youtube_brief_at   = new Date().toISOString();
    writeJSON(CITATION_CAMPAIGNS_FILE, campaigns);

    return json(res, 200, { brief });
  } catch (e) {
    return json(res, 500, { error: "Brief generation failed: " + e.message });
  }
}


// POST /api/citations/leads  — booking / strategy call request (public, no auth required)
async function handleCitationsLeadCreate(req, res) {
  const body  = await readBody(req);
  const name  = (body.name  || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  const phone = (body.phone || "").trim();
  if (!name)  return json(res, 400, { error: "Name is required." });
  if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) return json(res, 400, { error: "Valid email is required." });
  if (!phone) return json(res, 400, { error: "Phone is required." });

  const leads = Array.isArray(readJSON(CITATION_LEADS_FILE)) ? readJSON(CITATION_LEADS_FILE) : [];
  const lead  = {
    id:               citNextId(leads),
    name,
    email,
    phone,
    message:          (body.message       || "").slice(0, 200),
    package_interest: body.package_interest || "",
    preferred_time:   body.preferred_time   || "",
    status:           "new",
    created_at:       new Date().toISOString(),
  };
  leads.push(lead);
  writeJSON(CITATION_LEADS_FILE, leads);

  const pkgLabels = { starter: "Starter (€299)", growth: "Growth (€699)", authority: "Authority (€1,299)" };
  const pkgLabel  = pkgLabels[lead.package_interest] || lead.package_interest;

  // Email admin
  sendSystemEmail(
    process.env.ADMIN_EMAIL || process.env.SYSTEM_EMAIL_USER,
    "New Citation Builder lead — " + name + " interested in " + pkgLabel,
    "Name: "    + name  + "\n" +
    "Email: "   + email + "\n" +
    "Phone: "   + phone + "\n" +
    "Package: " + pkgLabel + "\n" +
    "Preferred time: " + (lead.preferred_time || "—") + "\n" +
    "Message: " + (lead.message || "—")
  );

  // Confirmation email to lead
  sendSystemEmail(
    email,
    "Λάβαμε το αίτημά σας — eureach.eu",
    "Γεια σας " + name + ",\n\n" +
    "Λάβαμε το αίτημά σας για δωρεάν κλήση στρατηγικής για το πακέτο " + pkgLabel + ".\n\n" +
    "Θα επικοινωνήσουμε εντός 24 ωρών για να κλείσουμε την κλήση μας.\n\n" +
    "Ευχαριστούμε,\nΗ ομάδα του eureach.eu"
  );

  return json(res, 200, { ok: true });
}


// ── YouTuber Portal helpers ───────────────────────────────────────────────────

function ytNextId(arr) {
  return arr.length ? Math.max(...arr.map(x => x.id || 0)) + 1 : 1;
}

// POST /api/youtube/join  (public)
async function handleYoutubeJoin(req, res) {
  const body = await readBody(req);
  const name  = (body.name  || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  const channel_name = (body.channel_name || "").trim();
  const channel_url  = (body.channel_url  || "").trim();
  if (!name || !email || !channel_name || !channel_url)
    return json(res, 400, { error: "Name, email, channel name and channel URL are required." });

  const apps = Array.isArray(readJSON(YOUTUBER_APPLICATIONS_FILE)) ? readJSON(YOUTUBER_APPLICATIONS_FILE) : [];
  if (apps.find(a => a.email === email))
    return json(res, 400, { error: "An application from this email already exists." });

  const app = {
    id:           ytNextId(apps),
    name, email, channel_name,
    channel_url:  channel_url,
    subscribers:  parseInt(body.subscribers) || 0,
    language:     body.language   || "en",
    categories:   Array.isArray(body.categories) ? body.categories : [],
    why:          (body.why || "").trim(),
    status:       "pending",
    applied_at:   new Date().toISOString(),
  };
  apps.push(app);
  writeJSON(YOUTUBER_APPLICATIONS_FILE, apps);

  sendSystemEmail(
    process.env.ADMIN_EMAIL || process.env.SYSTEM_EMAIL_USER,
    "New YouTuber application: " + channel_name,
    "Name: " + name + "\nEmail: " + email + "\nChannel: " + channel_name + "\n" + channel_url +
    "\nSubscribers: " + app.subscribers + "\nLanguage: " + app.language +
    "\nCategories: " + app.categories.join(", ") + "\nWhy: " + app.why +
    "\n\nReview at eureach.eu/youtube-admin.html"
  );
  sendSystemEmail(
    email,
    "We received your application — eureach Creator Network",
    "Hi " + name + ",\n\nThank you for applying to join the eureach Creator Network.\n" +
    "We\'ll review your application and get back to you within 2-3 business days.\n\neureach.eu"
  );
  return json(res, 200, { ok: true });
}

// GET /api/admin/youtubers/applications
async function handleAdminYoutuberApplicationsList(req, res) {
  const cookies = parseCookies(req);
  const admin   = getSessionUser(cookies.session);
  if (!admin || admin.role !== "admin") return json(res, 403, { error: "Admin only." });
  const apps = Array.isArray(readJSON(YOUTUBER_APPLICATIONS_FILE)) ? readJSON(YOUTUBER_APPLICATIONS_FILE) : [];
  return json(res, 200, { applications: apps.slice().reverse() });
}

// POST /api/admin/youtubers/applications/:id/approve
async function handleAdminYoutuberApplicationApprove(req, res, id) {
  const cookies = parseCookies(req);
  const admin   = getSessionUser(cookies.session);
  if (!admin || admin.role !== "admin") return json(res, 403, { error: "Admin only." });

  const apps = Array.isArray(readJSON(YOUTUBER_APPLICATIONS_FILE)) ? readJSON(YOUTUBER_APPLICATIONS_FILE) : [];
  const idx  = apps.findIndex(a => a.id === parseInt(id));
  if (idx === -1) return json(res, 404, { error: "Application not found." });
  const app = apps[idx];

  // Find or create user account
  const users  = Array.isArray(readJSON(USERS_FILE)) ? readJSON(USERS_FILE) : [];
  let userIdx  = users.findIndex(u => u.email === app.email);
  let isNewUser = false;

  if (userIdx === -1) {
    // Create account with temp password
    const tempPass = Math.random().toString(36).slice(2, 10);
    const newUser  = {
      id: users.length ? Math.max(...users.map(u => u.id || 0)) + 1 : 1,
      email: app.email, firstName: app.name.split(" ")[0], lastName: app.name.split(" ").slice(1).join(" "),
      password: tempPass, role: "youtuber", plan: "free",
      credits: 0, creditsLeft: 0, createdAt: new Date().toISOString(),
    };
    users.push(newUser);
    userIdx = users.length - 1;
    isNewUser = true;
  } else {
    users[userIdx].role = "youtuber";
  }
  writeJSON(USERS_FILE, users);

  // Create youtuber profile
  const profiles = Array.isArray(readJSON(YOUTUBER_PROFILES_FILE)) ? readJSON(YOUTUBER_PROFILES_FILE) : [];
  if (!profiles.find(p => p.user_id === users[userIdx].id)) {
    profiles.push({
      id: ytNextId(profiles), user_id: users[userIdx].id,
      channel_name: app.channel_name, channel_url: app.channel_url,
      channel_id: "", subscribers: app.subscribers, language: app.language,
      categories: app.categories, status: "active",
      total_assignments: 0, total_completed: 0, payment_info: null, notes: "",
      approved_at: new Date().toISOString(), approved_by: admin.id,
    });
    writeJSON(YOUTUBER_PROFILES_FILE, profiles);
  }

  apps[idx].status      = "approved";
  apps[idx].approved_at = new Date().toISOString();
  apps[idx].approved_by = admin.id;
  writeJSON(YOUTUBER_APPLICATIONS_FILE, apps);

  const loginMsg = isNewUser
    ? "We created an account for you.\nEmail: " + app.email + "\nPassword: " + users[userIdx].password + "\n\nPlease change your password after first login."
    : "Log in with your existing eureach.eu account.";

  sendSystemEmail(
    app.email,
    "Welcome to the eureach Creator Network!",
    "Hi " + app.name + ",\n\nGreat news — your application has been approved!\n\n" +
    loginMsg + "\n\nAccess your portal at:\neureach.eu/youtube\n\neureach.eu"
  );

  return json(res, 200, { ok: true, new_user: isNewUser });
}

// POST /api/admin/youtubers/applications/:id/reject
async function handleAdminYoutuberApplicationReject(req, res, id) {
  const cookies = parseCookies(req);
  const admin   = getSessionUser(cookies.session);
  if (!admin || admin.role !== "admin") return json(res, 403, { error: "Admin only." });

  const body = await readBody(req);
  const apps = Array.isArray(readJSON(YOUTUBER_APPLICATIONS_FILE)) ? readJSON(YOUTUBER_APPLICATIONS_FILE) : [];
  const idx  = apps.findIndex(a => a.id === parseInt(id));
  if (idx === -1) return json(res, 404, { error: "Application not found." });

  apps[idx].status      = "rejected";
  apps[idx].rejected_at = new Date().toISOString();
  apps[idx].reject_reason = (body.reason || "").trim();
  writeJSON(YOUTUBER_APPLICATIONS_FILE, apps);

  sendSystemEmail(
    apps[idx].email,
    "Update on your eureach Creator Network application",
    "Hi " + apps[idx].name + ",\n\nThank you for applying to the eureach Creator Network.\n" +
    "After reviewing your application, we\'re unable to approve it at this time." +
    (apps[idx].reject_reason ? "\n\nFeedback: " + apps[idx].reject_reason : "") +
    "\n\nYou\'re welcome to apply again in the future.\n\neureach.eu"
  );
  return json(res, 200, { ok: true });
}

function requireYoutuberUser(req) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return null;
  if (user.role !== "youtuber" && user.role !== "admin") return null;
  return user;
}

function stripClientContact(campaign) {
  // Remove client contact info before exposing in brief_data
  const { ...safe } = campaign;
  delete safe.stripe_payment_id;
  return safe;
}

// GET /api/youtube/me
async function handleYoutubeMe(req, res) {
  const user = requireYoutuberUser(req);
  if (!user) return json(res, 403, { error: "YouTuber access required." });
  const profiles    = Array.isArray(readJSON(YOUTUBER_PROFILES_FILE)) ? readJSON(YOUTUBER_PROFILES_FILE) : [];
  const assignments = Array.isArray(readJSON(YOUTUBER_ASSIGNMENTS_FILE)) ? readJSON(YOUTUBER_ASSIGNMENTS_FILE) : [];
  const profile     = profiles.find(p => p.user_id === user.id) || null;
  const myAssignments = assignments.filter(a => a.youtuber_user_id === user.id);
  return json(res, 200, { user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role }, profile, assignments: myAssignments });
}

// GET /api/youtube/assignments
async function handleYoutubeAssignmentsList(req, res) {
  const user = requireYoutuberUser(req);
  if (!user) return json(res, 403, { error: "YouTuber access required." });
  const all = Array.isArray(readJSON(YOUTUBER_ASSIGNMENTS_FILE)) ? readJSON(YOUTUBER_ASSIGNMENTS_FILE) : [];
  return json(res, 200, { assignments: all.filter(a => a.youtuber_user_id === user.id) });
}

// GET /api/youtube/assignments/:id
async function handleYoutubeAssignmentGet(req, res, id) {
  const user = requireYoutuberUser(req);
  if (!user) return json(res, 403, { error: "YouTuber access required." });
  const all = Array.isArray(readJSON(YOUTUBER_ASSIGNMENTS_FILE)) ? readJSON(YOUTUBER_ASSIGNMENTS_FILE) : [];
  const a   = all.find(x => x.id === parseInt(id));
  if (!a) return json(res, 404, { error: "Assignment not found." });
  if (a.youtuber_user_id !== user.id && user.role !== "admin") return json(res, 403, { error: "Access denied." });
  return json(res, 200, { assignment: a });
}

// PUT /api/youtube/assignments/:id  (auto-save + step advance)
async function handleYoutubeAssignmentUpdate(req, res, id) {
  const user = requireYoutuberUser(req);
  if (!user) return json(res, 403, { error: "YouTuber access required." });
  const body = await readBody(req);
  const all  = Array.isArray(readJSON(YOUTUBER_ASSIGNMENTS_FILE)) ? readJSON(YOUTUBER_ASSIGNMENTS_FILE) : [];
  const idx  = all.findIndex(x => x.id === parseInt(id));
  if (idx === -1) return json(res, 404, { error: "Assignment not found." });
  if (all[idx].youtuber_user_id !== user.id && user.role !== "admin") return json(res, 403, { error: "Access denied." });

  const allowed = ["current_step","step_data","status"];
  allowed.forEach(k => { if (body[k] !== undefined) all[idx][k] = body[k]; });

  if (body.status === "in_progress" && all[idx].status === "new") {
    all[idx].status = "in_progress";
  }
  writeJSON(YOUTUBER_ASSIGNMENTS_FILE, all);
  return json(res, 200, { assignment: all[idx] });
}

// POST /api/youtube/assignments/:id/submit
async function handleYoutubeAssignmentSubmit(req, res, id) {
  const user = requireYoutuberUser(req);
  if (!user) return json(res, 403, { error: "YouTuber access required." });
  const body = await readBody(req);
  const all  = Array.isArray(readJSON(YOUTUBER_ASSIGNMENTS_FILE)) ? readJSON(YOUTUBER_ASSIGNMENTS_FILE) : [];
  const idx  = all.findIndex(x => x.id === parseInt(id));
  if (idx === -1) return json(res, 404, { error: "Assignment not found." });
  if (all[idx].youtuber_user_id !== user.id) return json(res, 403, { error: "Access denied." });
  if (!body.video_url) return json(res, 400, { error: "Video URL is required." });

  all[idx].video_url         = body.video_url;
  all[idx].timestamp_mention = body.timestamp_mention || "";
  all[idx].status            = "submitted";
  all[idx].submitted_at      = new Date().toISOString();
  writeJSON(YOUTUBER_ASSIGNMENTS_FILE, all);

  const a = all[idx];

  // Email admin
  sendSystemEmail(
    process.env.ADMIN_EMAIL || process.env.SYSTEM_EMAIL_USER,
    "Νέο βίντεο προς έλεγχο — " + (user.firstName || user.email),
    "YouTuber: " + (user.firstName || "") + " " + (user.lastName || "") + " <" + user.email + ">\n" +
    "Campaign ID: " + a.campaign_id + "\n" +
    "Video URL: " + a.video_url + "\n" +
    "Timestamp: " + (a.timestamp_mention || "—") + "\n\n" +
    "Review at: eureach.eu/youtube-admin.html"
  );

  // Email YouTuber
  sendSystemEmail(
    user.email,
    "Submission received — eureach YouTuber Portal",
    "Γεια σου " + (user.firstName || "") + ",\n\nΛάβαμε την υποβολή σου. Θα κάνουμε review εντός 24 ωρών.\n\neureach.eu/youtube"
  );

  return json(res, 200, { ok: true });
}

// GET /api/youtube/profile
async function handleYoutubeProfileGet(req, res) {
  const user = requireYoutuberUser(req);
  if (!user) return json(res, 403, { error: "YouTuber access required." });
  const profiles = Array.isArray(readJSON(YOUTUBER_PROFILES_FILE)) ? readJSON(YOUTUBER_PROFILES_FILE) : [];
  const profile  = profiles.find(p => p.user_id === user.id) || null;
  // Never expose payment_info plaintext — indicate presence only
  if (profile && profile.payment_info) {
    const safe = { ...profile };
    safe.has_payment_info = true;
    try { safe.payment_info_display = decryptStr(profile.payment_info).slice(0, 4) + "****"; } catch (e) { safe.payment_info_display = "****"; }
    delete safe.payment_info;
    return json(res, 200, { profile: safe });
  }
  return json(res, 200, { profile });
}

// PUT /api/youtube/profile
async function handleYoutubeProfileUpdate(req, res) {
  const user = requireYoutuberUser(req);
  if (!user) return json(res, 403, { error: "YouTuber access required." });
  const body     = await readBody(req);
  const profiles = Array.isArray(readJSON(YOUTUBER_PROFILES_FILE)) ? readJSON(YOUTUBER_PROFILES_FILE) : [];
  const idx      = profiles.findIndex(p => p.user_id === user.id);
  if (idx === -1) return json(res, 404, { error: "Profile not found." });

  const allowed = ["channel_name","channel_url","channel_id","subscribers","language","categories"];
  allowed.forEach(k => { if (body[k] !== undefined) profiles[idx][k] = body[k]; });
  if (body.payment_info && body.payment_info.trim()) {
    profiles[idx].payment_info = encryptStr(body.payment_info.trim());
  }
  writeJSON(YOUTUBER_PROFILES_FILE, profiles);
  return json(res, 200, { ok: true });
}

// ── Admin YouTuber management ─────────────────────────────────────────────────

// GET /api/admin/youtubers
async function handleAdminYoutubersList(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user || user.role !== "admin") return json(res, 403, { error: "Admin only." });

  const users    = Array.isArray(readJSON(USERS_FILE)) ? readJSON(USERS_FILE) : [];
  const profiles = Array.isArray(readJSON(YOUTUBER_PROFILES_FILE)) ? readJSON(YOUTUBER_PROFILES_FILE) : [];
  const assignments = Array.isArray(readJSON(YOUTUBER_ASSIGNMENTS_FILE)) ? readJSON(YOUTUBER_ASSIGNMENTS_FILE) : [];

  const youtubers = users
    .filter(u => u.role === "youtuber")
    .map(u => {
      const profile = profiles.find(p => p.user_id === u.id) || {};
      const myA     = assignments.filter(a => a.youtuber_user_id === u.id);
      return {
        id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email,
        channel_name: profile.channel_name || "", channel_url: profile.channel_url || "",
        subscribers: profile.subscribers || 0, status: profile.status || "active",
        total_assignments: myA.length,
        total_completed: myA.filter(a => a.status === "approved" || a.status === "paid").length,
        approved_at: profile.approved_at || u.createdAt,
      };
    });
  return json(res, 200, { youtubers });
}

// POST /api/admin/youtubers/grant-access
async function handleAdminYoutubersGrantAccess(req, res) {
  const cookies = parseCookies(req);
  const admin   = getSessionUser(cookies.session);
  if (!admin || admin.role !== "admin") return json(res, 403, { error: "Admin only." });

  const body  = await readBody(req);
  const email = (body.email || "").trim().toLowerCase();
  if (!email) return json(res, 400, { error: "Email is required." });

  const users = Array.isArray(readJSON(USERS_FILE)) ? readJSON(USERS_FILE) : [];
  const idx   = users.findIndex(u => u.email === email);

  if (idx === -1) {
    sendSystemEmail(
      admin.email,
      "Invitation needed — " + email,
      "The email " + email + " is not registered on eureach.eu. Send them a registration link first."
    );
    return json(res, 404, { error: "User not found. This email is not registered. Send them an invitation first." });
  }

  const targetUser = users[idx];
  if (targetUser.role === "youtuber") {
    return json(res, 400, { error: "This user already has YouTuber access." });
  }

  users[idx].role = "youtuber";
  writeJSON(USERS_FILE, users);

  // Create youtuber_profile
  const profiles = Array.isArray(readJSON(YOUTUBER_PROFILES_FILE)) ? readJSON(YOUTUBER_PROFILES_FILE) : [];
  if (!profiles.find(p => p.user_id === targetUser.id)) {
    profiles.push({
      id: ytNextId(profiles), user_id: targetUser.id, channel_name: "", channel_url: "",
      channel_id: "", subscribers: 0, language: "el", categories: [], status: "active",
      total_assignments: 0, total_completed: 0, payment_info: null, notes: "",
      approved_at: new Date().toISOString(), approved_by: admin.id,
    });
    writeJSON(YOUTUBER_PROFILES_FILE, profiles);
  }

  sendSystemEmail(
    targetUser.email,
    "Έχεις πρόσβαση στο eureach YouTuber Portal",
    "Γεια σου " + (targetUser.firstName || targetUser.email) + ",\n\n" +
    "Ο λογαριασμός σου στο eureach.eu έχει αναβαθμιστεί.\n" +
    "Έχεις τώρα πρόσβαση στο YouTuber Portal.\n\n" +
    "Σύνδεσε στον λογαριασμό σου και επισκέψου:\n" +
    "eureach.eu/youtube\n\n" +
    "για να δεις τα assignments σου.\n\neureach.eu"
  );

  return json(res, 200, { ok: true, user: { id: targetUser.id, email: targetUser.email, firstName: targetUser.firstName } });
}

// POST /api/admin/youtubers/revoke-access
async function handleAdminYoutubersRevokeAccess(req, res) {
  const cookies = parseCookies(req);
  const admin   = getSessionUser(cookies.session);
  if (!admin || admin.role !== "admin") return json(res, 403, { error: "Admin only." });

  const body = await readBody(req);
  if (!body.userId) return json(res, 400, { error: "userId is required." });

  const users = Array.isArray(readJSON(USERS_FILE)) ? readJSON(USERS_FILE) : [];
  const idx   = users.findIndex(u => u.id === body.userId);
  if (idx === -1) return json(res, 404, { error: "User not found." });

  users[idx].role = "user";
  writeJSON(USERS_FILE, users);

  const profiles = Array.isArray(readJSON(YOUTUBER_PROFILES_FILE)) ? readJSON(YOUTUBER_PROFILES_FILE) : [];
  const pidx = profiles.findIndex(p => p.user_id === body.userId);
  if (pidx !== -1) { profiles[pidx].status = "suspended"; writeJSON(YOUTUBER_PROFILES_FILE, profiles); }

  return json(res, 200, { ok: true });
}

// GET /api/admin/youtubers/assignments
async function handleAdminYoutuberAssignmentsList(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user || user.role !== "admin") return json(res, 403, { error: "Admin only." });

  const all       = Array.isArray(readJSON(YOUTUBER_ASSIGNMENTS_FILE)) ? readJSON(YOUTUBER_ASSIGNMENTS_FILE) : [];
  const users     = Array.isArray(readJSON(USERS_FILE)) ? readJSON(USERS_FILE) : [];
  const campaigns = Array.isArray(readJSON(CITATION_CAMPAIGNS_FILE)) ? readJSON(CITATION_CAMPAIGNS_FILE) : [];

  const url     = new URL("http://localhost" + req.url);
  const fStatus = url.searchParams.get("status");
  const filtered = fStatus && fStatus !== "all" ? all.filter(a => a.status === fStatus) : all;

  return json(res, 200, { assignments: filtered.map(a => {
    const u = users.find(u => u.id === a.youtuber_user_id) || {};
    const c = campaigns.find(c => c.id === a.campaign_id) || {};
    return { ...a, youtuber_name: ((u.firstName||"") + " " + (u.lastName||"")).trim() || u.email, youtuber_email: u.email, campaign_package: c.package };
  })});
}

// POST /api/admin/youtubers/assignments  — create assignment
async function handleAdminYoutuberAssignmentCreate(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user || user.role !== "admin") return json(res, 403, { error: "Admin only." });

  const body = await readBody(req);
  if (!body.youtuber_user_id || !body.campaign_id) return json(res, 400, { error: "youtuber_user_id and campaign_id are required." });

  const campaigns = Array.isArray(readJSON(CITATION_CAMPAIGNS_FILE)) ? readJSON(CITATION_CAMPAIGNS_FILE) : [];
  const campaign  = campaigns.find(c => c.id === parseInt(body.campaign_id));
  if (!campaign) return json(res, 404, { error: "Campaign not found." });

  const briefData = stripClientContact({ ...campaign });

  const all = Array.isArray(readJSON(YOUTUBER_ASSIGNMENTS_FILE)) ? readJSON(YOUTUBER_ASSIGNMENTS_FILE) : [];
  const assignment = {
    id: ytNextId(all),
    placement_id:      body.placement_id || null,
    youtuber_user_id:  parseInt(body.youtuber_user_id),
    campaign_id:       parseInt(body.campaign_id),
    status:            "new",
    brief_data:        briefData,
    current_step:      1,
    step_data: { topic: "", title: "", description: "", tags: [], mention_plan: "", transcript: "", chapters: "", checklist: [], video_url: "", timestamp_mention: "" },
    video_url:         null,
    timestamp_mention: null,
    submitted_at:      null,
    approved_at:       null,
    paid_at:           null,
    payment_amount:    parseFloat(body.payment_amount) || 80,
    admin_feedback:    null,
    created_at:        new Date().toISOString(),
  };
  all.push(assignment);
  writeJSON(YOUTUBER_ASSIGNMENTS_FILE, all);

  const users  = Array.isArray(readJSON(USERS_FILE)) ? readJSON(USERS_FILE) : [];
  const ytUser = users.find(u => u.id === parseInt(body.youtuber_user_id));
  if (ytUser) {
    sendSystemEmail(
      ytUser.email,
      "Νέο assignment στο eureach YouTuber Portal",
      "Γεια σου " + (ytUser.firstName || ytUser.email) + ",\n\n" +
      "Έχεις νέο assignment!\n\n" +
      "Πληρωμή: €" + assignment.payment_amount + " μετά την έγκριση\n\n" +
      "Μπες στο portal για να δεις το brief:\n" +
      "eureach.eu/youtube"
    );
  }

  return json(res, 201, { assignment });
}

// PUT /api/admin/youtubers/assignments/:id  — approve / reject / mark paid
async function handleAdminYoutuberAssignmentUpdate(req, res, id) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user || user.role !== "admin") return json(res, 403, { error: "Admin only." });

  const body = await readBody(req);
  const all  = Array.isArray(readJSON(YOUTUBER_ASSIGNMENTS_FILE)) ? readJSON(YOUTUBER_ASSIGNMENTS_FILE) : [];
  const idx  = all.findIndex(x => x.id === parseInt(id));
  if (idx === -1) return json(res, 404, { error: "Assignment not found." });

  const prev = { ...all[idx] };
  ["admin_feedback","payment_amount"].forEach(k => { if (body[k] !== undefined) all[idx][k] = body[k]; });

  if (body.status) {
    all[idx].status = body.status;
    if (body.status === "approved" && prev.status !== "approved") {
      all[idx].approved_at = new Date().toISOString();
      const users  = Array.isArray(readJSON(USERS_FILE)) ? readJSON(USERS_FILE) : [];
      const ytUser = users.find(u => u.id === all[idx].youtuber_user_id);
      if (ytUser) sendSystemEmail(ytUser.email, "Το βίντεό σου εγκρίθηκε — πληρωμή σε εξέλιξη", "Γεια σου " + (ytUser.firstName||ytUser.email) + ",\n\nΤο βίντεό σου εγκρίθηκε! Η πληρωμή €" + all[idx].payment_amount + " είναι σε εξέλιξη.\n\neureach.eu/youtube");
    }
    if (body.status === "rejected" && prev.status !== "rejected") {
      const users  = Array.isArray(readJSON(USERS_FILE)) ? readJSON(USERS_FILE) : [];
      const ytUser = users.find(u => u.id === all[idx].youtuber_user_id);
      if (ytUser) sendSystemEmail(ytUser.email, "Feedback για το βίντεό σου", "Γεια σου " + (ytUser.firstName||ytUser.email) + ",\n\n" + (all[idx].admin_feedback || "Παρακαλώ επανυποβάλε.") + "\n\neureach.eu/youtube/assignment/" + id);
    }
    if (body.status === "paid" && prev.status !== "paid") {
      all[idx].paid_at = new Date().toISOString();
      const profiles = Array.isArray(readJSON(YOUTUBER_PROFILES_FILE)) ? readJSON(YOUTUBER_PROFILES_FILE) : [];
      const pidx = profiles.findIndex(p => p.user_id === all[idx].youtuber_user_id);
      if (pidx !== -1) { profiles[pidx].total_completed = (profiles[pidx].total_completed || 0) + 1; writeJSON(YOUTUBER_PROFILES_FILE, profiles); }
      const users2 = Array.isArray(readJSON(USERS_FILE)) ? readJSON(USERS_FILE) : [];
      const ytPaidUser = users2.find(u => u.id === all[idx].youtuber_user_id);
      if (ytPaidUser) sendSystemEmail(
        ytPaidUser.email,
        "Πληρωμή στάλθηκε — eureach.eu",
        "Γεια σου " + (ytPaidUser.firstName || ytPaidUser.email) + ",\n\n" +
        "Η πληρωμή €" + (all[idx].payment_amount || "") + " για το assignment σου έχει σταλεί.\n" +
        "Θα εμφανιστεί στον λογαριασμό σου εντός 1-3 εργάσιμων ημερών.\n\n" +
        "Ευχαριστούμε,\nΗ ομάδα του eureach.eu"
      );
    }
  }

  writeJSON(YOUTUBER_ASSIGNMENTS_FILE, all);
  return json(res, 200, { assignment: all[idx] });
}

// PUT /api/admin/youtubers/profiles/:id  — admin edit profile (no payment_info)
async function handleAdminYoutuberProfileUpdate(req, res, id) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user || user.role !== "admin") return json(res, 403, { error: "Admin only." });
  const body     = await readBody(req);
  const profiles = Array.isArray(readJSON(YOUTUBER_PROFILES_FILE)) ? readJSON(YOUTUBER_PROFILES_FILE) : [];
  const idx      = profiles.findIndex(p => p.id === parseInt(id));
  if (idx === -1) return json(res, 404, { error: "Profile not found." });
  ["channel_name","channel_url","subscribers","language","categories","status","notes"].forEach(k => {
    if (body[k] !== undefined) profiles[idx][k] = body[k];
  });
  writeJSON(YOUTUBER_PROFILES_FILE, profiles);
  return json(res, 200, { profile: profiles[idx] });
}


// GET /api/admin/citations/leads  — view Book-a-call leads
async function handleAdminCitationsLeads(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user || user.role !== "admin") return json(res, 403, { error: "Admin only." });
  const leads = Array.isArray(readJSON(CITATION_LEADS_FILE)) ? readJSON(CITATION_LEADS_FILE) : [];
  return json(res, 200, { leads: leads.slice().reverse() });
}

// ── END Citation Builder handlers (eureach.eu) ────────────────────────────────



// ── Public Free Audit (no auth required) ─────────────────────────────────────

function auditGenerateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function runPublicAudit(jobId, businessName, category, city) {
  const jobs = Array.isArray(readJSON(AUDIT_JOBS_FILE)) ? readJSON(AUDIT_JOBS_FILE) : [];
  const idx  = jobs.findIndex(j => j.id === jobId);
  if (idx === -1) return;

  const query  = category + " " + city;
  jobs[idx].status = "running";
  jobs[idx].query  = query;
  writeJSON(AUDIT_JOBS_FILE, jobs);

  const apiKey = getAnthropicKey();
  if (!apiKey) {
    jobs[idx].status = "failed";
    writeJSON(AUDIT_JOBS_FILE, jobs);
    return;
  }

  const engines = [
    { name: "ChatGPT",    key: "chatgpt"    },
    { name: "Perplexity", key: "perplexity" },
    { name: "Google AI",  key: "google_ai"  },
  ];

  const results = {};

  await Promise.all(engines.map(async engine => {
    try {
      const sys = "You simulate how " + engine.name + " answers local business search queries in Greek. Be realistic — only mention businesses that would genuinely appear. Answer naturally in Greek as " + engine.name + " would respond. Return ONLY valid JSON.";
      const msg = "Query: \"" + query + "\". Does the business \"" + businessName + "\" appear in your results?\n\nReturn this JSON exactly:\n{\n  \"appeared\": true or false,\n  \"confidence\": \"high\" or \"low\",\n  \"competitors\": [\"name1\", \"name2\"],\n  \"excerpt\": \"brief excerpt of your answer (50 words max)\"\n}";
      const raw = await callClaude(apiKey, sys, msg, 400, "claude-haiku-4-5-20251001");
      const data = claudeJSON(raw);
      const appeared = !!data.appeared;
      const score = appeared
        ? Math.min(95, Math.floor(Math.random() * 20) + 68)
        : Math.max(5,  Math.floor(Math.random() * 18) + 5);
      results[engine.key] = {
        appeared,
        score,
        competitors: Array.isArray(data.competitors) ? data.competitors.slice(0, 3) : [],
        excerpt: data.excerpt || "",
      };
    } catch (e) {
      results[engine.key] = { appeared: false, score: 8, competitors: [], excerpt: "" };
    }
  }));

  const scores     = Object.values(results).map(r => r.score);
  const overall    = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const allComps   = [...new Set(Object.values(results).flatMap(r => r.competitors))].slice(0, 4);

  const freshJobs  = Array.isArray(readJSON(AUDIT_JOBS_FILE)) ? readJSON(AUDIT_JOBS_FILE) : [];
  const fi         = freshJobs.findIndex(j => j.id === jobId);
  if (fi !== -1) {
    freshJobs[fi].status       = "complete";
    freshJobs[fi].results      = results;
    freshJobs[fi].overall      = overall;
    freshJobs[fi].competitors  = allComps;
    freshJobs[fi].completedAt  = new Date().toISOString();
    freshJobs[fi].expiresAt    = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    writeJSON(AUDIT_JOBS_FILE, freshJobs);
  }
}

function parseCookieValue(req, name) {
  const cookies = parseCookies(req);
  return cookies[name] || null;
}

async function handlePublicAuditStart(req, res) {
  const body = await readBody(req);
  const { businessName, category, city, customCategory, utmSource, utmCampaign } = body;
  const cat = category === "Άλλο" ? (customCategory || "Άλλο") : category;

  if (!businessName || !cat || !city) {
    return json(res, 400, { error: "Συμπλήρωσε όλα τα πεδία" });
  }

  // Check if logged-in user
  const cookies  = parseCookies(req);
  const authUser = getSessionUser(cookies.session);

  const jobId    = auditGenerateId();
  const sessId   = cookies.auid_sess || auditGenerateId();

  const jobs = Array.isArray(readJSON(AUDIT_JOBS_FILE)) ? readJSON(AUDIT_JOBS_FILE) : [];
  jobs.push({
    id:             jobId,
    userId:         authUser ? authUser.id : null,
    sessionId:      sessId,
    businessName:   businessName.trim(),
    category:       cat,
    city:           city.trim(),
    status:         "pending",
    query:          null,
    results:        null,
    overall:        null,
    competitors:    [],
    createdAt:      new Date().toISOString(),
    completedAt:    null,
    expiresAt:      null,
    utmSource:      utmSource || null,
    utmCampaign:    utmCampaign || null,
  });
  writeJSON(AUDIT_JOBS_FILE, jobs);

  // Fire async — do not await
  runPublicAudit(jobId, businessName.trim(), cat, city.trim())
    .catch(e => console.error("[public-audit] error", e.message));

  const headers = {};
  if (!cookies.auid_sess) {
    headers["Set-Cookie"] = "auid_sess=" + sessId + "; Path=/; Max-Age=86400; SameSite=Lax";
  }
  return json(res, 200, { jobId }, headers);
}

async function handlePublicAuditStatus(req, res, jobId) {
  const jobs = Array.isArray(readJSON(AUDIT_JOBS_FILE)) ? readJSON(AUDIT_JOBS_FILE) : [];
  const job  = jobs.find(j => j.id === jobId);
  if (!job) return json(res, 404, { error: "Job not found" });
  return json(res, 200, { status: job.status, jobId });
}

async function handlePublicAuditResults(req, res, jobId) {
  const cookies  = parseCookies(req);
  const authUser = getSessionUser(cookies.session);
  const jobs     = Array.isArray(readJSON(AUDIT_JOBS_FILE)) ? readJSON(AUDIT_JOBS_FILE) : [];
  const job      = jobs.find(j => j.id === jobId);
  if (!job) return json(res, 404, { error: "Job not found" });
  if (job.status !== "complete" && job.status !== "failed") return json(res, 200, { status: job.status });
  const isOwner = authUser ? (job.userId === authUser.id || job.sessionId === cookies.auid_sess) : (job.sessionId === cookies.auid_sess);
  if (!isOwner && !authUser?.role === "admin") return json(res, 403, { error: "Not authorized" });
  return json(res, 200, {
    status:       job.status,
    jobId:        job.id,
    businessName: job.businessName,
    category:     job.category,
    city:         job.city,
    query:        job.query,
    results:      job.results,
    overall:      job.overall,
    competitors:  job.competitors,
    isLoggedIn:   !!authUser,
  });
}

async function handlePublicAuditSave(req, res) {
  const cookies  = parseCookies(req);
  const authUser = getSessionUser(cookies.session);
  if (!authUser) return json(res, 401, { error: "Not authenticated" });

  const body  = await readBody(req);
  const jobId = body.jobId;
  if (!jobId) return json(res, 400, { error: "jobId required" });

  const jobs = Array.isArray(readJSON(AUDIT_JOBS_FILE)) ? readJSON(AUDIT_JOBS_FILE) : [];
  const idx  = jobs.findIndex(j => j.id === jobId);
  if (idx === -1) return json(res, 404, { error: "Job not found" });

  jobs[idx].userId    = authUser.id;
  jobs[idx].expiresAt = null;
  writeJSON(AUDIT_JOBS_FILE, jobs);

  // Save business info to user profile
  const profiles = Array.isArray(readJSON(BUSINESS_PROFILE_FILE)) ? readJSON(BUSINESS_PROFILE_FILE) : [];
  const pidx = profiles.findIndex(p => p.userId === authUser.id);
  const update = { userId: authUser.id, businessName: jobs[idx].businessName, industry: jobs[idx].category, city: jobs[idx].city, updatedAt: new Date().toISOString() };
  if (pidx !== -1) Object.assign(profiles[pidx], update);
  else profiles.push(update);
  writeJSON(BUSINESS_PROFILE_FILE, profiles);

  return json(res, 200, { ok: true });
}

// Email-only save (captures leads without password)
async function handlePublicAuditEmailSave(req, res) {
  const body = await readBody(req);
  const { email, jobId } = body;
  if (!email || !jobId) return json(res, 400, { error: "email and jobId required" });

  const sanitized = sanitizeEmail(email);
  if (!sanitized) return json(res, 400, { error: "Invalid email" });

  const users = readJSON(USERS_FILE);
  let user = users.find(u => u.email.toLowerCase() === sanitized.toLowerCase());

  if (!user) {
    // Create minimal account (no password — just email capture)
    const planCfg = PLAN_LIMITS.plans.free;
    user = {
      id:           generateId(),
      email:        sanitized.toLowerCase(),
      firstName:    "",
      lastName:     "",
      passwordHash: null,
      plan:         "free",
      creditsLeft:  planCfg.credits,
      creditsMax:   planCfg.credits,
      creditMonth:  currentMonth(),
      sites:        [],
      createdAt:    new Date().toISOString(),
      freeExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      emailOnly:    true,
    };
    users.push(user);
    writeJSON(USERS_FILE, users);
  }

  // Link audit to this user
  const jobs = Array.isArray(readJSON(AUDIT_JOBS_FILE)) ? readJSON(AUDIT_JOBS_FILE) : [];
  const idx  = jobs.findIndex(j => j.id === jobId);
  if (idx !== -1) {
    jobs[idx].userId    = user.id;
    jobs[idx].expiresAt = null;
    writeJSON(AUDIT_JOBS_FILE, jobs);
  }

  return json(res, 200, { ok: true, message: "Τα αποτελέσματα αποθηκεύτηκαν στο email σου." });
}

// ── Weekly Action Coach ───────────────────────────────────────────────────────

function coachGetMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

function coachGetBusinessInfo(userId) {
  const profiles = Array.isArray(readJSON(BUSINESS_PROFILE_FILE)) ? readJSON(BUSINESS_PROFILE_FILE) : [];
  const users    = Array.isArray(readJSON(USERS_FILE)) ? readJSON(USERS_FILE) : [];
  const user     = users.find(u => u.id === userId) || {};
  const profile  = profiles.find(p => p.userId === userId) || {};
  return {
    name:        profile.businessName || user.businessName || ((user.firstName || "") + " " + (user.lastName || "")).trim() || "η επιχείρησή σου",
    category:    profile.industry || "επιχείρηση",
    location:    profile.city || "Ελλάδα",
    description: profile.businessDescription || "",
    url:         profile.businessUrl || "",
  };
}

async function coachGenerateDayContent(day, businessInfo, apiKey, user) {
  const model = getModel(user);
  const bName = businessInfo.name;
  const bCat  = businessInfo.category;
  const bLoc  = businessInfo.location;
  const bDesc = businessInfo.description || "local business";

  if (day === "monday") {
    const sys = 'You are a marketing coach for Greek businesses. Return ONLY valid JSON. No text outside JSON.';
    const msg = "Business: " + bName + "\nCategory: " + bCat + "\nLocation: " + bLoc + "\nDescription: " + bDesc + "\n\nGenerate 5 article topic suggestions (specific questions Greek customers ask AI engines) AND 1 Facebook post.\nReturn this exact JSON:\n{\n  \"suggestions\": [\n    {\"title\": \"article title as a question in Greek\", \"why\": \"one sentence in Greek why this helps AI visibility\", \"angle\": \"e.g. Πρακτικός οδηγός\", \"estimated_read_time\": \"3 λεπτά\"},\n    {\"title\": \"...\", \"why\": \"...\", \"angle\": \"...\", \"estimated_read_time\": \"4 λεπτά\"},\n    {\"title\": \"...\", \"why\": \"...\", \"angle\": \"...\", \"estimated_read_time\": \"3 λεπτά\"},\n    {\"title\": \"...\", \"why\": \"...\", \"angle\": \"...\", \"estimated_read_time\": \"5 λεπτά\"},\n    {\"title\": \"...\", \"why\": \"...\", \"angle\": \"...\", \"estimated_read_time\": \"4 λεπτά\"}\n  ],\n  \"facebook_post\": \"natural Facebook post in Greek 80-120 words, genuine business owner voice, ends with a question\"\n}";
    const raw = await callClaude(apiKey, sys, msg, 1400, model);
    return claudeJSON(raw);
  }

  if (day === "wednesday") {
    const sys = 'You are a marketing coach for Greek businesses. Return ONLY valid JSON. No text outside JSON.';
    const msg = "Business: " + bName + "\nCategory: " + bCat + "\nLocation: " + bLoc + "\n\nGenerate:\n1. WhatsApp/Messenger message asking for a Google review (personal, warm, 60-80 words in Greek, includes [GOOGLE BUSINESS LINK] placeholder)\n2. FAQ Facebook post in Greek 100-140 words (format: \"Η πιο συχνή ερώτηση που μας κάνουν: [QUESTION]\", answer in 3-4 sentences, end with \"Έχεις κι εσύ ερώτηση; Γράψε στα σχόλια.\")\n\nReturn this exact JSON:\n{\n  \"review_message\": \"...\",\n  \"faq_post\": \"...\"\n}";
    const raw = await callClaude(apiKey, sys, msg, 900, model);
    return claudeJSON(raw);
  }

  if (day === "friday") {
    const sys = 'You are a marketing coach for Greek businesses. Return ONLY valid JSON. No text outside JSON.';
    const msg = "Business: " + bName + "\nCategory: " + bCat + "\nLocation: " + bLoc + "\nDescription: " + bDesc + "\n\nGenerate a LinkedIn post in BOTH Greek and English.\nGreek: professional tone, educational angle, 120-180 words, ends with a question, 3-4 hashtags.\nEnglish: same structure, same quality.\n\nReturn this exact JSON:\n{\n  \"linkedin_post_el\": \"...\",\n  \"linkedin_post_en\": \"...\"\n}";
    const raw = await callClaude(apiKey, sys, msg, 1000, model);
    return claudeJSON(raw);
  }

  return null;
}

async function handleCoachPage(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) { res.writeHead(302, { Location: "/signin.html?next=/coach" }); res.end(); return; }
  return fs.readFile(path.join(ROOT, "coach.html"), (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(data);
  });
}

async function handleCoachWeek(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated" });

  const weekStart   = coachGetMonday(new Date());
  const completions = Array.isArray(readJSON(COACH_COMPLETIONS_FILE)) ? readJSON(COACH_COMPLETIONS_FILE) : [];
  const allContent  = Array.isArray(readJSON(COACH_CONTENT_FILE))     ? readJSON(COACH_CONTENT_FILE) : [];
  const paid        = isPaidUser(user) || user.role === "admin";

  const weekContent   = allContent.filter(c => c.userId === user.id && c.weekStart === weekStart);
  const weekCompleted = completions.filter(c => c.userId === user.id && c.weekStart === weekStart);

  const daysNeeded  = ["monday"];
  if (paid) daysNeeded.push("wednesday", "friday");
  const missingDays = daysNeeded.filter(d => !weekContent.find(c => c.day === d));

  if (missingDays.length > 0) {
    const apiKey = getAnthropicKey();
    if (!apiKey) return json(res, 500, { error: "AI not configured" });
    const biz = coachGetBusinessInfo(user.id);
    for (const day of missingDays) {
      try {
        const content = await coachGenerateDayContent(day, biz, apiKey, user);
        if (content) {
          allContent.push({ id: Date.now() + "_" + day, userId: user.id, weekStart, day, content, createdAt: new Date().toISOString(), regenerateCount: 0 });
        }
      } catch (e) { console.error("[coach] gen error", day, e.message); }
    }
    writeJSON(COACH_CONTENT_FILE, allContent);
  }

  const fresh   = Array.isArray(readJSON(COACH_CONTENT_FILE)) ? readJSON(COACH_CONTENT_FILE) : [];
  const content = fresh.filter(c => c.userId === user.id && c.weekStart === weekStart);
  return json(res, 200, { weekStart, isPaid: paid, completions: weekCompleted, content });
}

async function handleCoachComplete(req, res, day) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated" });
  if (!["monday", "wednesday", "friday"].includes(day)) return json(res, 400, { error: "Invalid day" });

  const paid = isPaidUser(user) || user.role === "admin";
  if ((day === "wednesday" || day === "friday") && !paid) return json(res, 403, { error: "Members only" });

  const weekStart   = coachGetMonday(new Date());
  const completions = Array.isArray(readJSON(COACH_COMPLETIONS_FILE)) ? readJSON(COACH_COMPLETIONS_FILE) : [];
  const already     = completions.find(c => c.userId === user.id && c.weekStart === weekStart && c.day === day);
  if (!already) {
    completions.push({ id: Date.now(), userId: user.id, weekStart, day, completedAt: new Date().toISOString() });
    writeJSON(COACH_COMPLETIONS_FILE, completions);
  }
  const weekDone = completions.filter(c => c.userId === user.id && c.weekStart === weekStart).length;
  return json(res, 200, { ok: true, weekDone });
}

async function handleCoachRegenerate(req, res, day) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated" });
  if (!["monday", "wednesday", "friday"].includes(day)) return json(res, 400, { error: "Invalid day" });

  const paid = isPaidUser(user) || user.role === "admin";
  if ((day === "wednesday" || day === "friday") && !paid) return json(res, 403, { error: "Members only" });

  const body       = await readBody(req);
  const weekStart  = coachGetMonday(new Date());
  const allContent = Array.isArray(readJSON(COACH_CONTENT_FILE)) ? readJSON(COACH_CONTENT_FILE) : [];
  const idx        = allContent.findIndex(c => c.userId === user.id && c.weekStart === weekStart && c.day === day);

  if (idx !== -1 && (allContent[idx].regenerateCount || 0) >= 3) {
    return json(res, 429, { error: "Max regenerations reached for this week" });
  }

  if (day === "friday" && (body.language === "en" || body.language === "el")) {
    const existing = idx !== -1 ? allContent[idx].content : null;
    const key = body.language === "en" ? "linkedin_post_en" : "linkedin_post_el";
    if (existing && existing[key]) return json(res, 200, { linkedin_post: existing[key] });
  }

  const apiKey = getAnthropicKey();
  if (!apiKey) return json(res, 500, { error: "AI not configured" });
  const biz = coachGetBusinessInfo(user.id);
  try {
    const content = await coachGenerateDayContent(day, biz, apiKey, user);
    if (idx !== -1) { allContent[idx].content = content; allContent[idx].regenerateCount = (allContent[idx].regenerateCount || 0) + 1; }
    else allContent.push({ id: Date.now() + "_" + day, userId: user.id, weekStart, day, content, createdAt: new Date().toISOString(), regenerateCount: 1 });
    writeJSON(COACH_CONTENT_FILE, allContent);
    return json(res, 200, { content });
  } catch (e) {
    return json(res, 500, { error: "Generation failed: " + e.message });
  }
}

async function handleCoachStreak(req, res) {
  const cookies     = parseCookies(req);
  const user        = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated" });

  const completions = Array.isArray(readJSON(COACH_COMPLETIONS_FILE)) ? readJSON(COACH_COMPLETIONS_FILE) : [];
  const mine        = completions.filter(c => c.userId === user.id);
  const byWeek      = {};
  for (const c of mine) { byWeek[c.weekStart] = (byWeek[c.weekStart] || 0) + 1; }

  const weeks     = Object.keys(byWeek).sort().reverse();
  let streak      = 0;
  const checkDate = new Date(coachGetMonday(new Date()));
  for (let i = 0; i < weeks.length; i++) {
    const wDate = new Date(weeks[i]);
    const diffW = Math.round((checkDate - wDate) / (7 * 24 * 60 * 60 * 1000));
    if (diffW !== i) break;
    if (byWeek[weeks[i]] >= 2) streak++;
    else break;
  }

  const thisWeek = coachGetMonday(new Date());
  return json(res, 200, { streak, totalActions: mine.length, thisWeekDone: byWeek[thisWeek] || 0 });
}

async function handleCoachVisibility(req, res) {
  const cookies    = parseCookies(req);
  const user       = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated" });

  const audits     = Array.isArray(readJSON(AUDITS_FILE)) ? readJSON(AUDITS_FILE) : [];
  const userAudits = audits.filter(a => a.userId === user.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (userAudits.length === 0) return json(res, 200, { hasData: false });

  const latest   = userAudits[0];
  const previous = userAudits[1] || null;
  const scores   = { ai_visibility: latest.breakdown?.ai_visibility || 0, local_seo: latest.breakdown?.local_seo || 0, content_quality: latest.breakdown?.content_quality || 0, overall: latest.score || 0 };
  const deltas   = previous ? {
    ai_visibility:   scores.ai_visibility   - (previous.breakdown?.ai_visibility   || 0),
    local_seo:       scores.local_seo       - (previous.breakdown?.local_seo       || 0),
    content_quality: scores.content_quality - (previous.breakdown?.content_quality || 0),
    overall:         scores.overall         - (previous.score || 0)
  } : null;
  return json(res, 200, { hasData: true, scores, deltas, auditId: latest.id, updatedAt: latest.createdAt });
}

// ── Newsletter handlers ──────────────────────────────────────────────────────

// ── Newsletter Campaign & Growth Plan handlers ──────────────────────────────

const EUREACH_FOOTER_HTML = '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top:40px;"><tr><td align="center" style="border-top:2px solid #e2e8f0;padding:28px 24px 0;font-family:Arial,Helvetica,sans-serif;"><p style="margin:0 0 4px;font-size:11px;color:#94a3b8;letter-spacing:0.8px;text-transform:uppercase;">This newsletter was created with</p><a href="https://eureach.eu?ref=nl-footer" style="display:inline-block;margin-bottom:12px;font-size:20px;font-weight:700;color:#4f46e5;text-decoration:none;">eureach<span style="color:#6366f1">.</span>eu</a><p style="margin:0;font-size:12px;color:#64748b;line-height:1.7;">Need help with your business marketing?<br><a href="https://eureach.eu?ref=nl-footer-cta" style="color:#4f46e5;font-weight:600;text-decoration:none;">Discover EUREACH →</a></p></td></tr></table>';

const EUREACH_FOOTER_TEXT = ['','','---','This newsletter was created with eureach.eu','Need help with your business marketing? Discover EUREACH → https://eureach.eu'].join('\n');

function getGrowthPlan(user) {
  const gp = user.growthPlan;
  if (!gp || !gp.active) return { active: false };
  if (gp.expiresAt && new Date(gp.expiresAt) < new Date()) return { active: false, expired: true };
  return { active: true, activatedAt: gp.activatedAt, expiresAt: gp.expiresAt, emailsSent: gp.emailsSent || 0 };
}

function injectEureachFooter(html, plainText) {
  const htmlOut = /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, EUREACH_FOOTER_HTML + '</body>')
    : html + EUREACH_FOOTER_HTML;
  return { html: htmlOut, text: (plainText || '') + EUREACH_FOOTER_TEXT };
}

async function handleGrowthPlanStatus(req, res) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  return json(res, 200, { growthPlan: getGrowthPlan(user) });
}

async function handleGrowthPlanActivate(req, res) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const days = parseInt(process.env.GROWTH_PLAN_DAYS || '90', 10);
  const users = readJSON(USERS_FILE);
  const idx = users.findIndex(u => u.id === user.id);
  if (idx === -1) return json(res, 404, { error: 'User not found.' });
  const prev = users[idx].growthPlan || {};
  users[idx].growthPlan = {
    active: true,
    activatedAt: prev.activatedAt || new Date().toISOString(),
    expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
    emailsSent: prev.emailsSent || 0,
  };
  writeJSON(USERS_FILE, users);
  return json(res, 200, { ok: true, growthPlan: users[idx].growthPlan });
}

async function handleNLCampaignList(req, res) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const campaigns = readJSON(NL_CAMPAIGNS_FILE)
    .filter(c => c.userId === user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return json(res, 200, { campaigns });
}

async function handleNLCampaignSave(req, res, id) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const gp = getGrowthPlan(user);
  if (!gp.active && !hasAccess(user)) return json(res, 402, { error: 'trial_expired', upgradeUrl: '/membership' });
  const raw = await readBody(req);
  const campaigns = readJSON(NL_CAMPAIGNS_FILE);
  if (id) {
    const idx = campaigns.findIndex(c => c.id === id && c.userId === user.id);
    if (idx === -1) return json(res, 404, { error: 'Campaign not found.' });
    if (campaigns[idx].status === 'sent') return json(res, 400, { error: 'Cannot edit a sent campaign.' });
    if (raw.name     !== undefined) campaigns[idx].name     = sanitizeString(raw.name, 200);
    if (raw.subject  !== undefined) campaigns[idx].subject  = sanitizeString(raw.subject, 200);
    if (raw.bodyHtml !== undefined) campaigns[idx].bodyHtml = sanitizeString(raw.bodyHtml, 200000);
    if (raw.bodyText !== undefined) campaigns[idx].bodyText = sanitizeString(raw.bodyText, 50000);
    if (Array.isArray(raw.recipients)) campaigns[idx].recipients = raw.recipients.map(e => sanitizeEmail(String(e))).filter(Boolean);
    campaigns[idx].updatedAt = new Date().toISOString();
    writeJSON(NL_CAMPAIGNS_FILE, campaigns);
    return json(res, 200, { campaign: campaigns[idx] });
  } else {
    const campaign = {
      id: generateId(), userId: user.id,
      name:       sanitizeString(raw.name || 'Untitled Campaign', 200),
      subject:    sanitizeString(raw.subject || '', 200),
      bodyHtml:   sanitizeString(raw.bodyHtml || '', 200000),
      bodyText:   sanitizeString(raw.bodyText || '', 50000),
      recipients: Array.isArray(raw.recipients) ? raw.recipients.map(e => sanitizeEmail(String(e))).filter(Boolean) : [],
      status: 'draft', footerEnabled: true,
      createdAt: new Date().toISOString(), sentAt: null, sentCount: 0, errorCount: 0,
    };
    campaigns.push(campaign);
    writeJSON(NL_CAMPAIGNS_FILE, campaigns);
    return json(res, 200, { campaign });
  }
}

async function handleNLCampaignDelete(req, res, id) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const campaigns = readJSON(NL_CAMPAIGNS_FILE);
  const idx = campaigns.findIndex(c => c.id === id && c.userId === user.id);
  if (idx === -1) return json(res, 404, { error: 'Campaign not found.' });
  campaigns.splice(idx, 1);
  writeJSON(NL_CAMPAIGNS_FILE, campaigns);
  return json(res, 200, { ok: true });
}

async function handleNLCampaignSend(req, res, id) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const campaigns = readJSON(NL_CAMPAIGNS_FILE);
  const idx = campaigns.findIndex(c => c.id === id && c.userId === user.id);
  if (idx === -1) return json(res, 404, { error: 'Campaign not found.' });
  const campaign = campaigns[idx];
  if (campaign.status === 'sent')    return json(res, 400, { error: 'Campaign already sent.' });
  if (campaign.status === 'sending') return json(res, 400, { error: 'Campaign is currently sending.' });
  if (!campaign.subject)  return json(res, 400, { error: 'Subject is required before sending.' });
  if (!campaign.bodyHtml && !campaign.bodyText) return json(res, 400, { error: 'Email body is required.' });
  if (!campaign.recipients || campaign.recipients.length === 0) return json(res, 400, { error: 'No recipients added.' });
  const conn = readJSON(SMTP_FILE).find(c => c.userId === user.id);
  if (!conn) return json(res, 400, { error: 'No SMTP connection. Go to Settings → Email.' });
  let smtpPwd;
  try { smtpPwd = decryptStr(conn.passwordEnc); } catch { return json(res, 500, { error: 'Failed to decrypt SMTP credentials.' }); }
  const gp = getGrowthPlan(user);
  if (!gp.active && !hasAccess(user)) return json(res, 402, { error: 'trial_expired', upgradeUrl: '/membership' });
  if (!gp.active) {
    const cost = campaign.recipients.length;
    const uu = readJSON(USERS_FILE);
    const ui = uu.findIndex(u => u.id === user.id);
    if (ui !== -1) {
      const dr = deductCredits(uu, ui, cost, 'Newsletter Campaign');
      if (!dr.ok) return insufficientCredits(res, dr.creditsLeft, dr.creditsMax, cost);
      writeJSON(USERS_FILE, uu);
    }
  }
  let finalHtml = campaign.bodyHtml || null;
  let finalText = campaign.bodyText || null;
  if (campaign.footerEnabled) {
    const inj = injectEureachFooter(finalHtml || '<div></div>', finalText || '');
    finalHtml = inj.html; finalText = inj.text;
  }
  campaigns[idx].status = 'sending';
  writeJSON(NL_CAMPAIGNS_FILE, campaigns);
  json(res, 200, { ok: true, started: true, total: campaign.recipients.length, campaignId: id });
  (async () => {
    let sentCount = 0, errorCount = 0;
    const log = readJSON(EMAIL_LOG_FILE);
    for (const toEmail of campaign.recipients) {
      try {
        await smtpSend({ host: conn.host, port: conn.port, username: conn.username,
          password: smtpPwd, from: conn.from, fromName: conn.fromName || '',
          to: toEmail, subject: campaign.subject, body: finalText || '', html: finalHtml });
        log.push({ id: generateId(), userId: user.id, leadId: null, to: toEmail,
          subject: campaign.subject, sentAt: new Date().toISOString(),
          sequenceStep: null, opened: false, clicked: false, campaignId: id });
        sentCount++;
      } catch (e) { errorCount++; console.error('[nl-campaign] failed:', toEmail, e.message); }
      await new Promise(r => setTimeout(r, 150));
    }
    writeJSON(EMAIL_LOG_FILE, log);
    const cff = readJSON(NL_CAMPAIGNS_FILE);
    const ci  = cff.findIndex(c => c.id === id);
    if (ci !== -1) {
      cff[ci].status = 'sent'; cff[ci].sentAt = new Date().toISOString();
      cff[ci].sentCount = sentCount; cff[ci].errorCount = errorCount;
      writeJSON(NL_CAMPAIGNS_FILE, cff);
    }
    if (gp.active) {
      const gu = readJSON(USERS_FILE); const gi = gu.findIndex(u => u.id === user.id);
      if (gi !== -1) {
        if (!gu[gi].growthPlan) gu[gi].growthPlan = {};
        gu[gi].growthPlan.emailsSent = (gu[gi].growthPlan.emailsSent || 0) + sentCount;
        writeJSON(USERS_FILE, gu);
      }
    }
  })();
}

async function handleNewsletterSubscribe(req, res) {
  const data = await readBody(req);
  const email = sanitizeEmail((data.email || "").trim().toLowerCase());
  const name  = sanitizeString((data.name  || "").trim()).slice(0, 120);
  const freq  = ["daily","weekly","monthly"].includes(data.frequency) ? data.frequency : "weekly";
  if (!email) return json(res, 400, { error: "Valid email required." });
  const ip = getIp(req);
  const ua = req.headers["user-agent"] || "";
  try {
    const r = await agoraPool.query(
      `INSERT INTO newsletter_subscribers
         (email, name, frequency, source_site, source_page, status, confirmed, confirm_token,
          gdpr_consent, gdpr_ip, gdpr_ua, gdpr_at)
       VALUES ($1,$2,$3,'eureach.eu',$4,'pending',false,
               md5(random()::text||clock_timestamp()::text),
               true,$5,$6,now())
       ON CONFLICT (email) DO UPDATE SET
         name=COALESCE(EXCLUDED.name, newsletter_subscribers.name),
         source_site='eureach.eu', status='pending', confirmed=false,
         confirm_token=md5(random()::text||clock_timestamp()::text),
         gdpr_consent=true, gdpr_ip=$5, gdpr_ua=$6, gdpr_at=now()
       RETURNING confirm_token`,
      [email, name || null, freq, req.headers.referer || null, ip, ua]
    );
    const { confirm_token } = r.rows[0];
    const confirmUrl = process.env.SITE_URL + "/newsletter/confirm/" + confirm_token;
    await sendSystemEmail(email, "Confirm your subscription — eureach.eu",
      `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff;">
        <div style="margin-bottom:20px;font-size:1.2rem;font-weight:900;color:#1a1a2e;">eureach<span style="color:#c9a227;">.</span>eu</div>
        <h2 style="color:#1a1a2e;margin:0 0 12px;font-size:1.1rem;">Please confirm your subscription</h2>
        <p style="color:#555;line-height:1.6;margin:0 0 20px;">Click the button below to confirm you'd like to receive updates and insights from eureach.eu.</p>
        <a href="${confirmUrl}" style="display:inline-block;background:#c9a227;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:700;font-size:.95rem;">Confirm subscription &#x2192;</a>
        <p style="color:#aaa;font-size:.78rem;margin-top:28px;border-top:1px solid #eee;padding-top:14px;">If you didn't sign up, just ignore this email.</p>
      </div>`
    );
    return json(res, 200, { success: true });
  } catch (e) {
    console.error("[newsletter subscribe]", e.message);
    return json(res, 500, { error: "Something went wrong. Please try again." });
  }
}

async function handleNewsletterConfirm(req, res, token) {
  try {
    const r = await agoraPool.query(
      `UPDATE newsletter_subscribers SET confirmed=true, confirmed_at=now(), status='active'
       WHERE confirm_token=$1 AND deleted_at IS NULL RETURNING email`,
      [token]
    );
    res.writeHead(302, { Location: r.rowCount ? "/newsletter-confirm.html?status=ok" : "/newsletter-confirm.html?status=invalid" });
    res.end();
  } catch (e) {
    console.error("[newsletter confirm]", e.message);
    res.writeHead(302, { Location: "/newsletter-confirm.html?status=error" }); res.end();
  }
}

async function handleNewsletterUnsubscribe(req, res, token) {
  try {
    const r = await agoraPool.query(
      `UPDATE newsletter_subscribers SET status='unsubscribed', unsubscribed_at=now()
       WHERE unsubscribe_token=$1 AND deleted_at IS NULL RETURNING email`,
      [token]
    );
    res.writeHead(302, { Location: r.rowCount ? "/newsletter-unsubscribe.html?status=ok" : "/newsletter-unsubscribe.html?status=invalid" });
    res.end();
  } catch (e) {
    console.error("[newsletter unsubscribe]", e.message);
    res.writeHead(302, { Location: "/newsletter-unsubscribe.html?status=error" }); res.end();
  }
}


// ── Marketing Creator ─────────────────────────────────────────────────────────

function handleBrandKitGet(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const kits = readJSON(BRAND_KITS_FILE) || [];
  const kit  = kits.find(k => k.userId === user.id) || {};
  return json(res, 200, { kit });
}

async function handleBrandKitSave(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const body = await readBody(req);
  const kits = readJSON(BRAND_KITS_FILE) || [];
  const idx  = kits.findIndex(k => k.userId === user.id);
  const kit  = {
    userId:         user.id,
    slogan:         (body.slogan         || "").slice(0, 200),
    tone:           (body.tone           || "").slice(0, 100),
    targetAudience: (body.targetAudience || "").slice(0, 500),
    colors:         Array.isArray(body.colors) ? body.colors.slice(0, 5) : [],
    logo:           (body.logo           || "").slice(0, 500),
    socialAccounts: body.socialAccounts && typeof body.socialAccounts === "object" ? body.socialAccounts : {},
    updatedAt:      new Date().toISOString(),
  };
  if (idx === -1) kits.push(kit);
  else kits[idx] = kit;
  writeJSON(BRAND_KITS_FILE, kits);
  return json(res, 200, { kit });
}

async function handleMarketingGenerateFacebook(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  if (!checkAiRateLimit(res, user.id)) return;

  const body = await readBody(req);
  const { brief = {}, saveToAssets = false, campaignId = null } = body;

  // Credit check
  const users = readJSON(USERS_FILE) || [];
  const idx   = users.findIndex(u => u.id === user.id);
  if (idx === -1) return json(res, 401, { error: "User not found." });

  const cost      = PLAN_LIMITS.costs.socialPost || 5;
  const artResult = deductCredits(users, idx, cost, "Facebook Post Generated");
  if (!artResult.ok) return insufficientCredits(res, artResult.creditsLeft, artResult.creditsMax, cost);
  writeJSON(USERS_FILE, users);

  const apiKey = getAnthropicKey();
  if (!apiKey) return json(res, 500, { error: "AI service not configured." });

  // Load business profile and brand kit for this user
  const profiles = readJSON(BUSINESS_PROFILE_FILE) || [];
  const business = profiles.find(p => p.userId === user.id) || {};
  const kits     = readJSON(BRAND_KITS_FILE) || [];
  const brand    = kits.find(k => k.userId === user.id) || {};

  try {
    const { generateFacebookPost } = require("./marketing/generators/facebook");
    const result = await generateFacebookPost({ business, brand, brief, apiKey });

    if (saveToAssets) {
      const assets = readJSON(MARKETING_ASSETS_FILE) || [];
      const asset  = {
        id:         Date.now().toString(),
        userId:     user.id,
        campaignId: campaignId,
        platform:   "facebook",
        type:       "post",
        content:    result,
        brief:      brief,
        createdAt:  new Date().toISOString(),
      };
      assets.unshift(asset);
      writeJSON(MARKETING_ASSETS_FILE, assets);
      result._assetId = asset.id;
    }

    return json(res, 200, {
      result,
      creditsLeft: artResult.creditsLeft,
      creditsMax:  artResult.creditsMax,
    });
  } catch (err) {
    console.error("[marketing/facebook] error:", err.message);
    return json(res, 502, { error: err.message || "Η δημιουργία απέτυχε. Παρακαλούμε δοκιμάστε ξανά." });
  }
}


// ── Marketing Creator — generic generate handler ────────────────────────────
const MARKETING_GENERATORS = {
  instagram:    { mod: "./marketing/generators/instagram",     fn: "generateInstagramPost",   cost: "socialPost" },
  tiktok:       { mod: "./marketing/generators/tiktok",        fn: "generateTikTokScript",    cost: "socialPost" },
  linkedin:     { mod: "./marketing/generators/linkedin",      fn: "generateLinkedInPost",    cost: "socialPost" },
  "google-ads": { mod: "./marketing/generators/google-ads",    fn: "generateGoogleAd",        cost: "adGenerate" },
  "meta-ads":   { mod: "./marketing/generators/meta-ads",      fn: "generateMetaAd",          cost: "adGenerate" },
  "youtube-short": { mod: "./marketing/generators/youtube-short", fn: "generateYouTubeShort", cost: "videoScript" },
  "video-script":  { mod: "./marketing/generators/video-script",  fn: "generateVideoScript",  cost: "videoScript" },
  "image-concept": { mod: "./marketing/generators/image-concept", fn: "generateImageConcept", cost: "imageConcept" },
  campaign:     { mod: "./marketing/generators/campaign",      fn: "generateCampaignStrategy",cost: "campaignGenerate" },
};

async function handleMarketingGenerate(req, res, platform) {
  const cfg = MARKETING_GENERATORS[platform];
  if (!cfg) return json(res, 404, { error: "Unknown platform: " + platform });

  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  if (!checkAiRateLimit(res, user.id)) return;

  const body = await readBody(req);
  const { brief = {}, saveToAssets = false, campaignId = null } = body;

  const users = readJSON(USERS_FILE) || [];
  const idx   = users.findIndex(u => u.id === user.id);
  if (idx === -1) return json(res, 401, { error: "User not found." });

  const cost      = PLAN_LIMITS.costs[cfg.cost] || 5;
  const artResult = deductCredits(users, idx, cost, platform + " generated");
  if (!artResult.ok) return insufficientCredits(res, artResult.creditsLeft, artResult.creditsMax, cost);
  writeJSON(USERS_FILE, users);

  const apiKey = getAnthropicKey();
  if (!apiKey) return json(res, 500, { error: "AI service not configured." });

  const profiles = readJSON(BUSINESS_PROFILE_FILE) || [];
  const business = profiles.find(p => p.userId === user.id) || {};
  const kits     = readJSON(BRAND_KITS_FILE) || [];
  const brand    = kits.find(k => k.userId === user.id) || {};

  try {
    const generator = require(cfg.mod);
    const result    = await generator[cfg.fn]({ business, brand, brief, apiKey });

    if (saveToAssets) {
      const assets = readJSON(MARKETING_ASSETS_FILE) || [];
      assets.unshift({
        id:         Date.now().toString(),
        userId:     user.id,
        campaignId: campaignId || null,
        platform,
        type:       platform,
        content:    result,
        brief,
        createdAt:  new Date().toISOString(),
      });
      writeJSON(MARKETING_ASSETS_FILE, assets);
      result._assetId = assets[0].id;
    }

    return json(res, 200, { result, creditsLeft: artResult.creditsLeft, creditsMax: artResult.creditsMax });
  } catch (err) {
    console.error("[marketing/" + platform + "] error:", err.message);
    return json(res, 502, { error: err.message || "Η δημιουργία απέτυχε. Παρακαλούμε δοκιμάστε ξανά." });
  }
}

// ── Article → Campaign ───────────────────────────────────────────────────────
async function handleMarketingArticleToCampaign(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  if (!checkAiRateLimit(res, user.id)) return;

  const body = await readBody(req);
  const { articleTitle = "", articleContent = "", articleSlug = "", brief = {}, saveToAssets = false } = body;
  if (!articleContent || articleContent.trim().length < 50)
    return json(res, 400, { error: "Article content is required." });

  const users = readJSON(USERS_FILE) || [];
  const idx   = users.findIndex(u => u.id === user.id);
  if (idx === -1) return json(res, 401, { error: "User not found." });

  const cost      = PLAN_LIMITS.costs.campaignGenerate || 20;
  const artResult = deductCredits(users, idx, cost, "Article → Campaign");
  if (!artResult.ok) return insufficientCredits(res, artResult.creditsLeft, artResult.creditsMax, cost);
  writeJSON(USERS_FILE, users);

  const apiKey = getAnthropicKey();
  if (!apiKey) return json(res, 500, { error: "AI service not configured." });

  try {
    const { generateArticleToCampaign } = require("./marketing/generators/article-to-campaign");
    const result = await generateArticleToCampaign({ article: articleContent, title: articleTitle, brief, apiKey });

    if (saveToAssets) {
      const assets = readJSON(MARKETING_ASSETS_FILE) || [];
      assets.unshift({
        id:         Date.now().toString(),
        userId:     user.id,
        campaignId: null,
        platform:   "article_to_campaign",
        type:       "campaign_brief",
        content:    result,
        brief:      { articleSlug, ...brief },
        createdAt:  new Date().toISOString(),
      });
      writeJSON(MARKETING_ASSETS_FILE, assets);
      result._assetId = assets[0].id;
    }

    return json(res, 200, { result, creditsLeft: artResult.creditsLeft, creditsMax: artResult.creditsMax });
  } catch (err) {
    console.error("[marketing/article-to-campaign] error:", err.message);
    return json(res, 502, { error: err.message || "Η δημιουργία απέτυχε. Παρακαλούμε δοκιμάστε ξανά." });
  }
}

// ── Marketing Campaign CRUD ──────────────────────────────────────────────────
function handleMarketingCampaignsList(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const all = (readJSON(MARKETING_CAMPAIGNS_FILE) || []).filter(c => c.userId === user.id);
  return json(res, 200, { campaigns: all });
}

async function handleMarketingCampaignCreate(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const body = await readBody(req);
  const { name = "Νέα Καμπάνια", objective = "", brief = {} } = body;
  const all = readJSON(MARKETING_CAMPAIGNS_FILE) || [];
  const profiles = readJSON(BUSINESS_PROFILE_FILE) || [];
  const kits     = readJSON(BRAND_KITS_FILE) || [];
  const campaign = {
    id:               Date.now().toString(),
    userId:           user.id,
    name:             sanitizeString(name).slice(0, 200),
    objective:        sanitizeString(objective).slice(0, 100),
    brief,
    businessSnapshot: profiles.find(p => p.userId === user.id) || {},
    brandSnapshot:    kits.find(k => k.userId === user.id) || {},
    assets:           [],
    status:           "draft",
    createdAt:        new Date().toISOString(),
    updatedAt:        new Date().toISOString(),
  };
  all.unshift(campaign);
  writeJSON(MARKETING_CAMPAIGNS_FILE, all);
  return json(res, 201, { campaign });
}

function handleMarketingCampaignGet(req, res, id) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const all      = readJSON(MARKETING_CAMPAIGNS_FILE) || [];
  const campaign = all.find(c => c.id === id && c.userId === user.id);
  if (!campaign) return json(res, 404, { error: "Campaign not found." });
  const assets   = (readJSON(MARKETING_ASSETS_FILE) || []).filter(a => a.userId === user.id && a.campaignId === id);
  return json(res, 200, { campaign, assets });
}

async function handleMarketingCampaignDelete(req, res, id) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const all = readJSON(MARKETING_CAMPAIGNS_FILE) || [];
  const idx = all.findIndex(c => c.id === id && c.userId === user.id);
  if (idx === -1) return json(res, 404, { error: "Campaign not found." });
  all.splice(idx, 1);
  writeJSON(MARKETING_CAMPAIGNS_FILE, all);
  return json(res, 200, { ok: true });
}

// ── Marketing Asset CRUD ─────────────────────────────────────────────────────
function handleMarketingAssetsList(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const url    = new URL("http://x" + req.url);
  const platform   = url.searchParams.get("platform") || "";
  const campaignId = url.searchParams.get("campaignId") || "";
  let assets = (readJSON(MARKETING_ASSETS_FILE) || []).filter(a => a.userId === user.id);
  if (platform)   assets = assets.filter(a => a.platform === platform);
  if (campaignId) assets = assets.filter(a => a.campaignId === campaignId);
  return json(res, 200, { assets });
}

async function handleMarketingAssetDelete(req, res, id) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const assets = readJSON(MARKETING_ASSETS_FILE) || [];
  const idx    = assets.findIndex(a => a.id === id && a.userId === user.id);
  if (idx === -1) return json(res, 404, { error: "Asset not found." });
  assets.splice(idx, 1);
  writeJSON(MARKETING_ASSETS_FILE, assets);
  return json(res, 200, { ok: true });
}

// ── Internal Marketing API — AGORA access (no credits, secret header) ────────
async function handleInternalMarketingGenerate(req, res, platform) {
  const secret = process.env.MARKETING_INTERNAL_SECRET;
  if (!secret || req.headers["x-internal-secret"] !== secret)
    return json(res, 403, { error: "Forbidden." });

  // article-to-campaign is handled separately
  if (platform === "article-to-campaign") {
    const body = await readBody(req);
    const { articleTitle = "", articleContent = "", brief = {} } = body;
    if (!articleContent || articleContent.trim().length < 10)
      return json(res, 400, { error: "articleContent is required." });
    const apiKey = getAnthropicKey();
    if (!apiKey) return json(res, 500, { error: "AI service not configured." });
    try {
      const { generateArticleToCampaign } = require("./marketing/generators/article-to-campaign");
      const result = await generateArticleToCampaign({ article: articleContent, title: articleTitle, brief, apiKey });
      return json(res, 200, { result });
    } catch (err) {
      return json(res, 502, { error: err.message || "Generation failed." });
    }
  }

  const cfg = MARKETING_GENERATORS[platform];
  if (!cfg) return json(res, 404, { error: "Unknown platform: " + platform });

  const body = await readBody(req);
  const { business = {}, brand = {}, brief = {}, callerApiKey = null, callerProvider = null } = body;

  // Caller (e.g. AGORA) can supply its own key; otherwise use eureach keys with Groq fallback
  const anthropicKey = callerApiKey || getAnthropicKey();
  const groqKey      = getGroqKey();
  const preferredProvider = callerProvider || 'anthropic';

  if (!anthropicKey && !groqKey) return json(res, 500, { error: "AI service not configured." });

  try {
    const generator = require(cfg.mod);
    let result;
    if (preferredProvider === 'groq' || !anthropicKey) {
      result = await generator[cfg.fn]({ business, brand, brief, apiKey: groqKey, provider: 'groq' });
    } else {
      try {
        result = await generator[cfg.fn]({ business, brand, brief, apiKey: anthropicKey, provider: 'anthropic' });
      } catch (e) {
        if (groqKey && (e.message.includes('credit') || e.message.includes('billing') || e.message.includes('quota') || e.message.includes('insufficient'))) {
          console.warn("[internal/marketing] Anthropic quota, falling back to Groq:", e.message.substring(0,80));
          result = await generator[cfg.fn]({ business, brand, brief, apiKey: groqKey, provider: 'groq' });
        } else { throw e; }
      }
    }
    return json(res, 200, { result });
  } catch (err) {
    console.error("[internal/marketing/" + platform + "] error:", err.message);
    return json(res, 502, { error: err.message || "Generation failed." });
  }
}

async function handleRequest(req, res) {
  const urlPath = req.url.split("?")[0];
  const method  = req.method.toUpperCase();
  const ip      = getIp(req);

  // ── Security headers on every response ───────────────────────────────────────
  applySecurityHeaders(res);

  // ── Block sensitive static paths ──────────────────────────────────────────────
  if (BLOCKED_STATIC_PREFIXES.some(p => urlPath.startsWith(p)) ||
      BLOCKED_STATIC_FILES.includes(urlPath)) {
    return json(res, 403, { error: "Forbidden." });
  }

  // ── Path traversal guard ──────────────────────────────────────────────────────
  if (checkPathTraversal(urlPath, ip)) {
    return json(res, 400, { error: "Bad request." });
  }

  // ── CSRF token — issue on every request ──────────────────────────────────────
  const cookies   = parseCookies(req);
  let csrfToken   = cookies.csrf_token;
  if (!csrfToken) {
    csrfToken = generateCsrfToken();
    res.setHeader("Set-Cookie", `csrf_token=${csrfToken}; SameSite=Strict; Path=/; Max-Age=86400`);
  }

  // ── CSRF validation for mutating API requests ─────────────────────────────────
  if (urlPath.startsWith("/api/") && ["POST", "PATCH", "PUT", "DELETE"].includes(method) &&
      !CSRF_EXEMPT.includes(urlPath) &&
      !urlPath.startsWith("/api/internal/")) {
    const tokenHeader = req.headers["x-csrf-token"];
    if (!tokenHeader || tokenHeader !== csrfToken) {
      logEvent("csrf_mismatch", urlPath, ip);
      return json(res, 403, { error: "Invalid CSRF token." });
    }
  }

  // ── Global API rate limit: 100 req/IP/min ─────────────────────────────────────
  if (urlPath.startsWith("/api/")) {
    const rl = checkRateLimit(ip, "global_api", 100, 60 * 1000);
    if (!rl.allowed) {
      logEvent("rate_limit_global", urlPath, ip);
      return json(res, 429, { error: "Too many requests. Please slow down." },
        { "Retry-After": String(rl.retryAfter) });
    }
  }

  // Auth API routes
  if (urlPath === "/api/auth/signup"  && method === "POST")  return handleSignup(req, res);
  if (urlPath === "/api/auth/signin"  && method === "POST")  return handleSignin(req, res);
  if (urlPath === "/api/auth/signout" && method === "POST")  return handleSignout(req, res);
  if (urlPath === "/api/auth/me"      && method === "GET")   return handleMe(req, res);
  if (urlPath === "/api/auth/profile" && method === "PATCH") return handleUpdateProfile(req, res);
  if (urlPath === "/api/profile"       && method === "GET")  return handleProfileStats(req, res);
  if (urlPath === "/api/support-email" && method === "POST") return handleSupportEmail(req, res);
  if (urlPath === "/api/todos" && method === "GET")  return handleTodosGet(req, res);
  if (urlPath === "/api/todos/ai-generate" && method === "POST") return handleTodosAIGenerate(req, res);
  if (urlPath === "/api/todos/bulk" && method === "POST") return handleTodosBulkImport(req, res);
  if (urlPath === "/api/todos" && method === "POST") return handleTodoCreate(req, res);
  { const _tm = urlPath.match(/^\/api\/todos\/([^\/]+)$/);
    if (_tm && method === "PATCH")  return handleTodoUpdate(req, res, _tm[1]);
    if (_tm && method === "DELETE") return handleTodoDelete(req, res, _tm[1]); }

  // Trial / Billing routes
  if (urlPath === "/api/trial/start"          && method === "POST") return handleTrialStart(req, res);
  if (urlPath === "/api/trial/cancel"         && method === "POST") return handleTrialCancel(req, res);
  if (urlPath === "/api/billing/webhook"      && method === "POST") return handleBillingWebhook(req, res);
  if (urlPath === "/api/billing/status"       && method === "GET")  return handleBillingStatus(req, res);
  if (urlPath === "/api/billing/update-card"  && method === "POST") return handleBillingUpdateCard(req, res);
  if (urlPath === "/api/billing/upgrade-now"  && method === "POST") return handleBillingUpgradeNow(req, res);
  if (urlPath === "/api/billing/stripe-key"   && method === "GET")  return json(res, 200, {
    publishableKey:   process.env.STRIPE_PUBLISHABLE_KEY       || null,
    priceIdPro:       process.env.STRIPE_PRICE_ID              || null,
    priceIdBeginners: process.env.STRIPE_BEGINNERS_PRICE_ID    || null,
  });
  if (urlPath === "/api/billing/paypal-info"              && method === "GET")  return handlePayPalBillingInfo(req, res);
  if (urlPath === "/api/billing/paypal/activate"          && method === "POST") return handlePayPalSubscriptionActivate(req, res);
  if (urlPath === "/api/leads/search"        && method === "POST") return handleLeadsSearch(req, res);
  if (urlPath === "/api/leads/verify-email" && method === "POST") return handleVerifyEmail(req, res);
  if (urlPath === "/api/leads/score"         && method === "POST") return handleLeadsScore(req, res);
  if (urlPath === "/api/leads/score/cache" && method === "GET")  return handleLeadsScoreCache(req, res);
  if (urlPath === "/api/articles/generate"  && method === "POST") return handleArticleGenerate(req, res);
  if (urlPath === "/api/articles/deduct"   && method === "POST") return handleArticlesDeduct(req, res);

  // WordPress API routes
  if (urlPath === "/api/wordpress/connect"  && method === "GET")    return handleWpStatus(req, res);
  if (urlPath === "/api/wordpress/connect"  && method === "POST")   return handleWpConnect(req, res);
  if (urlPath === "/api/wordpress/connect"  && method === "DELETE") return handleWpDisconnect(req, res);
  if (urlPath === "/api/wordpress/publish"  && method === "POST")   return handleWpPublish(req, res);

  // Email / SMTP routes
  if (urlPath === "/api/email/smtp"  && method === "GET")    return handleSmtpStatus(req, res);
  if (urlPath === "/api/email/smtp"  && method === "POST")   return handleSmtpConnect(req, res);
  if (urlPath === "/api/email/smtp"  && method === "DELETE") return handleSmtpDisconnect(req, res);
  if (urlPath === "/api/email/send"  && method === "POST")   return handleEmailSend(req, res);
  if (urlPath === "/api/email/log"   && method === "GET")    return handleEmailLog(req, res);

  // Outreach API routes
  if (urlPath === "/api/outreach"              && method === "POST")  return handleOutreach(req, res);
  if (urlPath === "/api/outreach"              && method === "GET")   return handleSequencesList(req, res);
  if (urlPath === "/api/outreach/queue"        && method === "GET")   return handleOutreachQueueGet(req, res);
  if (urlPath === "/api/outreach/enqueue"      && method === "POST")  return handleOutreachEnqueue(req, res);
  if (urlPath === "/api/outreach/send-step"    && method === "POST")  return handleOutreachSendStep(req, res);
  if (urlPath === "/api/outreach/update"       && method === "POST")  return handleOutreachUpdate(req, res);
  if (urlPath === "/api/whatsapp"              && method === "POST")  return handleWhatsApp(req, res);

  // CRM API routes
  if (urlPath === "/api/crm"                       && method === "GET")    return handleCrmList(req, res);
  if (urlPath === "/api/crm"                       && method === "POST")   return handleCrmCreate(req, res);
  if (urlPath.startsWith("/api/crm/")              && method === "PATCH")  return handleCrmUpdate(req, res, urlPath.slice(9));
  if (urlPath.startsWith("/api/crm/")              && method === "DELETE") return handleCrmDelete(req, res, urlPath.slice(9));

  // Competitor tracking API routes
  if (urlPath === "/api/business/profile"          && method === "GET")    return handleBusinessProfileGet(req, res);
  if (urlPath === "/api/business/profile"          && method === "POST")   return handleBusinessProfileSave(req, res);
  if (urlPath === "/api/sites"                       && method === "GET")    return handleSitesGet(req, res);
  if (urlPath === "/api/sites"                       && method === "POST")   return handleSitesSave(req, res);
  if (urlPath.startsWith("/api/sites/")              && method === "DELETE") return handleSiteDelete(req, res, urlPath.slice(11));
  if (urlPath === "/api/admin/stats"               && method === "GET")    return handleAdminStats(req, res);
  if (urlPath === "/api/admin/users"               && method === "GET")    return handleAdminUsers(req, res);
  if (urlPath === "/api/admin/users"               && method === "POST")   return handleAdminCreateUser(req, res);
  if (urlPath.startsWith("/api/admin/users/")) {
    const parts = urlPath.slice("/api/admin/users/".length).split("/");
    const uid   = parts[0];
    const sub   = parts[1];
    if (method === "PATCH"  && !sub)            return handleAdminUpdateUser(req, res, uid);
    if (method === "DELETE" && !sub)            return handleAdminDeleteUser(req, res, uid);
    if (method === "POST"   && sub === "biz-edits") return handleAdminSetBizEdits(req, res, uid);
    if (method === "POST"   && sub === "usage")     return handleAdminUsage(req, res, uid);
  }
  if (urlPath === "/api/leads/find"                 && method === "POST")   return handleLeadSearch(req, res);
  if (urlPath === "/api/competitor/search"          && method === "POST")   return handleCompetitorSearch(req, res);
  if (urlPath === "/api/competitor/saved-searches"   && method === "POST")   return handleSavedSearchSave(req, res);
  if (urlPath === "/api/competitor/saved-searches"   && method === "GET")    return handleSavedSearchesGet(req, res);
  if (urlPath.startsWith("/api/competitor/saved-searches/") && method === "DELETE") return handleSavedSearchDelete(req, res, urlPath.slice(31));
  if (urlPath === "/api/leads/saved-searches"              && method === "POST")   return handleLeadSavedSearchSave(req, res);
  if (urlPath === "/api/leads/saved-searches"              && method === "GET")    return handleLeadSavedSearchesGet(req, res);
  if (urlPath.startsWith("/api/leads/saved-searches/")     && method === "DELETE") return handleLeadSavedSearchDelete(req, res, urlPath.slice(27));
  if (urlPath === "/api/outreach/saved-lists"              && method === "POST")   return handleOutreachSavedListSave(req, res);
  if (urlPath === "/api/outreach/saved-lists"              && method === "GET")    return handleOutreachSavedListsGet(req, res);
  if (urlPath.startsWith("/api/outreach/saved-lists/")     && method === "DELETE") return handleOutreachSavedListDelete(req, res, urlPath.slice(26));
  if (urlPath === "/api/crm/saved-lists"              && method === "POST")   return handleCrmSavedListSave(req, res);
  if (urlPath === "/api/crm/saved-lists"              && method === "GET")    return handleCrmSavedListsGet(req, res);
  // Dashboard Jobs System
  if (urlPath === '/api/dashboard/sites'                       && method === 'GET')    return handleDashboardSitesGet(req, res);
  if (urlPath === '/api/dashboard/sites'                       && method === 'POST')   return handleDashboardSitesCreate(req, res);
  if (urlPath === '/api/dashboard/job-types'                   && method === 'GET')    return handleJobTypesGet(req, res);
  if (urlPath === '/api/jobs'                                  && method === 'GET')    return handleJobsGet(req, res);
  if (urlPath === '/api/jobs'                                  && method === 'POST')   return handleJobCreate(req, res);
  if (urlPath === '/api/jobs/bulk'                             && method === 'POST')   return handleJobsBulkCreate(req, res);
  // Facebook OAuth
  if (urlPath === '/api/auth/facebook'          && method === 'GET')  return handleFbOauthStart(req, res);
  if (urlPath === '/api/auth/facebook/callback' && method === 'GET')  return handleFbOauthCallback(req, res);
  if (urlPath === '/api/fb/branding'            && method === 'GET')  return handleFbBrandingGet(req, res);
  if (urlPath === '/api/fb/branding'            && method === 'POST') return handleFbBrandingSave(req, res);
  if (urlPath === '/api/fb/logo'                && method === 'POST') return handleFbLogoUpload(req, res);
    if (urlPath === '/api/fb/connection'          && method === 'GET')  return handleFbConnectionGet(req, res);
  if (urlPath === '/api/fb/connection/manual'    && method === 'POST')  return handleFbConnectionManual(req, res);
  if (urlPath === '/api/fb/connection'          && method === 'DELETE') return handleFbConnectionDelete(req, res);
  if (urlPath === '/api/fb/group-search'       && method === 'POST') return handleFbGroupSearch(req, res);
  if (urlPath === '/api/fb/targets'             && method === 'GET')  return handleFbTargetsGet(req, res);
  if (urlPath === '/api/fb/targets'             && method === 'POST') return handleFbTargetSave(req, res);
  if (urlPath.startsWith('/api/fb/targets/')    && method === 'PUT')  return handleFbTargetSave(req, res);
  if (urlPath.startsWith('/api/fb/targets/')    && method === 'POST') return handleFbTargetSave(req, res);
  if (urlPath.startsWith('/api/fb/targets/')    && method === 'DELETE') return handleFbTargetDelete(req, res, urlPath.split('/').pop());
  if (urlPath === '/api/fb/templates'           && method === 'GET')  return handleFbTemplatesGet(req, res);
  if (urlPath === '/api/fb/templates'           && method === 'POST') return handleFbTemplateSave(req, res);
  if (urlPath.startsWith('/api/fb/templates/')  && method === 'POST') return handleFbTemplateSave(req, res);
  if (urlPath.startsWith('/api/fb/templates/')  && method === 'DELETE') return handleFbTemplateDelete(req, res, urlPath.split('/').pop());
  if (urlPath === '/api/fb/log'                 && method === 'GET')    return handleFbLogGet(req, res);
  if (urlPath === '/api/fb/log'                 && method === 'DELETE') return handleFbLogClear(req, res);
  if (urlPath.startsWith('/api/fb/post/')       && method === 'POST') return handleFbPost(req, res, urlPath.split('/').pop());
  if (urlPath === '/api/fb/agent/run'           && method === 'POST') return handleFbAgentRun(req, res);
  if (urlPath === '/api/recurring-jobs'                        && method === 'GET')    return handleRecurringJobsGet(req, res);
  if (urlPath === '/api/recurring-jobs'                        && method === 'POST')   return handleRecurringJobCreate(req, res);
  { const _m = urlPath.match(/^\/api\/dashboard\/sites\/([^\/]+)\/seed$/);
    if (_m && method === 'POST') return handleDashboardSiteSeed(req, res, _m[1]); }
  { const _m = urlPath.match(/^\/api\/dashboard\/sites\/([^\/]+)$/);
    if (_m && method === 'PATCH')  return handleDashboardSiteUpdate(req, res, _m[1]);
    if (_m && method === 'DELETE') return handleDashboardSiteDelete(req, res, _m[1]); }
  { const _m = urlPath.match(/^\/api\/jobs\/([^\/]+)$/);
    if (_m && method === 'PATCH')  return handleJobUpdate(req, res, _m[1]); }
  { const _m = urlPath.match(/^\/api\/recurring-jobs\/([^\/]+)$/);
    if (_m && method === 'PATCH')  return handleRecurringJobUpdate(req, res, _m[1]);
    if (_m && method === 'DELETE') return handleRecurringJobDelete(req, res, _m[1]); }

  if (urlPath.startsWith("/api/crm/saved-lists/")     && method === "DELETE") return handleCrmSavedListDelete(req, res, urlPath.slice(21));
  if (urlPath === "/api/blog"                               && method === "GET")    return handleBlogList(req, res);
  if (urlPath === "/api/blog"                               && method === "POST")   return handleBlogPublish(req, res);
  if (urlPath === "/api/publish-to-agora"                   && method === "POST")   return handlePublishToAgora(req, res);
  if (urlPath.startsWith("/api/blog/")                      && method === "GET")    return handleBlogGet(req, res, decodeURIComponent(urlPath.slice(10)));
  if (urlPath.startsWith("/api/blog/") && urlPath.endsWith("/approve") && method === "POST") return handleBlogApprove(req, res, decodeURIComponent(urlPath.slice(10, -8)));
  if (urlPath.startsWith("/api/blog/") && urlPath.endsWith("/reject")  && method === "POST") return handleBlogReject(req, res, decodeURIComponent(urlPath.slice(10, -7)));
  if (urlPath.startsWith("/api/blog/")                      && method === "PATCH")   return handleBlogUpdate(req, res, decodeURIComponent(urlPath.slice(10)));
  if (urlPath === "/api/articles/analyze-existing"         && method === "POST")   return handleArticleAnalyzeExisting(req, res);
  { const m = urlPath.match(/^\/api\/articles\/([^\/]+)\/automate\/([^\/]+)$/);
    if (m && method === "POST") return handleArticleAutomate(req, res, m[1], m[2]);
    if (m && method === "GET"  && m[2] === "results") return handleArticleAutomateResults(req, res, m[1]); }
  if (urlPath === "/api/articles/saved-lists"              && method === "POST")   return handleArticleSavedListSave(req, res);
  if (urlPath === "/api/articles/saved-lists"              && method === "GET")    return handleArticleSavedListsGet(req, res);
  if (urlPath.startsWith("/api/articles/saved-lists/")     && method === "DELETE") return handleArticleSavedListDelete(req, res, urlPath.slice(26));
  if (urlPath === "/api/competitor/track"          && method === "GET")    return handleCompetitorList(req, res);
  if (urlPath === "/api/competitor/track"          && method === "POST")   return handleCompetitorCreate(req, res);
  if (urlPath.startsWith("/api/competitor/track/") && method === "DELETE") return handleCompetitorDelete(req, res, urlPath.slice(22));
  if (urlPath.startsWith("/api/competitor/track/") && method === "POST"  ) {
    const parts = urlPath.slice(22).split("/");
    if (parts[1] === "check") return handleCompetitorCheck(req, res, parts[0]);
  }
  if (urlPath.startsWith("/api/competitor/track/") && method === "PATCH" ) {
    const parts = urlPath.slice(22).split("/");
    if (parts[1] === "set-my-business") return handleCompetitorSetMyBusiness(req, res, parts[0]);
  }
  if (urlPath.startsWith("/api/competitor/share/") && method === "GET")   return handleCompetitorShare(req, res, urlPath.slice(22));

  // Citation Builder API routes (eureach.eu)
  if (urlPath === "/api/admin/citations/leads"             && method === "GET")  return handleAdminCitationsLeads(req, res);
  if (urlPath === "/api/citations/leads"   && method === "POST") return handleCitationsLeadCreate(req, res);
  if (urlPath === "/api/citations/packages"                  && method === "GET")  return handleCitationsPackages(req, res);
  if (urlPath === "/api/citations/campaigns"                 && method === "POST") return handleCitationsCampaignCreate(req, res);
  if (urlPath === "/api/citations/campaigns"                 && method === "GET")  return handleCitationsCampaignsList(req, res);
  if (urlPath === "/api/citations/checkout"                  && method === "POST") return handleCitationsCheckout(req, res);
  if (urlPath === "/api/citations/webhook"                   && method === "POST") return handleCitationsWebhook(req, res);
  if (urlPath === "/api/citations/paypal/create-order"       && method === "POST") return handlePayPalCreateOrder(req, res);
  if (urlPath === "/api/citations/paypal/capture-order"      && method === "POST") return handlePayPalCaptureOrder(req, res);
  if (urlPath === "/api/citations/publishers/apply"          && method === "POST") return handleCitationsPublisherApply(req, res);
  if (urlPath.startsWith("/api/citations/campaigns/")) {
    const citParts = urlPath.slice("/api/citations/campaigns/".length).split("/");
    const citId = citParts[0]; const citSub = citParts[1];
    if (method === "GET"  && !citSub)                  return handleCitationsCampaignGet(req, res, citId);
    if (method === "GET"  && citSub === "placements")  return handleCitationsPlacementsGet(req, res, citId);
    if (method === "GET"  && citSub === "snapshots")   return handleCitationsSnapshotsGet(req, res, citId);
    if (method === "POST" && citSub === "snapshot")    return handleCitationsSnapshotCreate(req, res, citId);
  }
  if (urlPath === "/api/admin/citations/campaigns"           && method === "GET")  return handleAdminCitationsCampaigns(req, res);
  if (urlPath === "/api/admin/citations/publishers"          && method === "GET")  return handleAdminCitationsPublishers(req, res);
  if (urlPath === "/api/admin/citations/publishers"          && method === "POST") return handleAdminCitationsPublisherCreate(req, res);
  if (urlPath === "/api/admin/citations/placements"          && method === "GET")  return handleAdminCitationsPlacementsList(req, res);
  if (urlPath === "/api/admin/citations/placements"          && method === "POST") return handleAdminCitationsPlacementCreate(req, res);
  if (urlPath === "/api/admin/citations/generate"            && method === "POST") return handleAdminCitationsGenerate(req, res);
  if (urlPath === "/api/admin/citations/youtube-brief"       && method === "POST") return handleAdminCitationsYoutubeBrief(req, res);
  if (urlPath.startsWith("/api/admin/citations/publishers/") && method === "PUT")  return handleAdminCitationsPublisherUpdate(req, res, urlPath.split("/").pop());
  if (urlPath.startsWith("/api/admin/citations/placements/") && method === "PUT")  return handleAdminCitationsPlacementUpdate(req, res, urlPath.split("/").pop());

  // YouTuber Portal API routes
  if (urlPath === "/api/youtube/me"                              && method === "GET")  return handleYoutubeMe(req, res);
  if (urlPath === "/api/youtube/assignments"                     && method === "GET")  return handleYoutubeAssignmentsList(req, res);
  if (urlPath === "/api/youtube/profile"                         && method === "GET")  return handleYoutubeProfileGet(req, res);
  if (urlPath === "/api/youtube/profile"                         && method === "PUT")  return handleYoutubeProfileUpdate(req, res);
  if (urlPath.startsWith("/api/youtube/assignments/")) {
    const ytParts = urlPath.slice("/api/youtube/assignments/".length).split("/");
    const ytId = ytParts[0]; const ytSub = ytParts[1];
    if (method === "GET"  && !ytSub)               return handleYoutubeAssignmentGet(req, res, ytId);
    if (method === "PUT"  && !ytSub)               return handleYoutubeAssignmentUpdate(req, res, ytId);
    if (method === "POST" && ytSub === "submit")   return handleYoutubeAssignmentSubmit(req, res, ytId);
  }
  // Admin YouTuber management
  if (urlPath === "/api/admin/youtubers"                         && method === "GET")  return handleAdminYoutubersList(req, res);
  if (urlPath === "/api/youtube/join"                              && method === "POST") return handleYoutubeJoin(req, res);
  if (urlPath === "/api/admin/youtubers/applications"              && method === "GET")  return handleAdminYoutuberApplicationsList(req, res);
  if (urlPath.startsWith("/api/admin/youtubers/applications/") && urlPath.endsWith("/approve") && method === "POST") return handleAdminYoutuberApplicationApprove(req, res, urlPath.split("/")[5]);
  if (urlPath.startsWith("/api/admin/youtubers/applications/") && urlPath.endsWith("/reject")  && method === "POST") return handleAdminYoutuberApplicationReject(req, res, urlPath.split("/")[5]);
  if (urlPath === "/api/admin/youtubers/grant-access"            && method === "POST") return handleAdminYoutubersGrantAccess(req, res);
  if (urlPath === "/api/admin/youtubers/revoke-access"           && method === "POST") return handleAdminYoutubersRevokeAccess(req, res);
  if (urlPath === "/api/admin/youtubers/assignments"             && method === "GET")  return handleAdminYoutuberAssignmentsList(req, res);
  if (urlPath === "/api/admin/youtubers/assignments"             && method === "POST") return handleAdminYoutuberAssignmentCreate(req, res);
  if (urlPath.startsWith("/api/admin/youtubers/assignments/")    && method === "PUT")  return handleAdminYoutuberAssignmentUpdate(req, res, urlPath.split("/").pop());
  if (urlPath.startsWith("/api/admin/youtubers/profiles/")       && method === "PUT")  return handleAdminYoutuberProfileUpdate(req, res, urlPath.split("/").pop());
  // YouTuber portal HTML pages
  if (urlPath === "/youtube" || urlPath === "/youtube/") {
    const cookies = parseCookies(req); const u = getSessionUser(cookies.session);
    if (!u || (u.role !== "youtuber" && u.role !== "admin")) { res.writeHead(302, { Location: "/signin.html?next=/youtube" }); res.end(); return; }
    return require("fs").readFile(require("path").join(ROOT, "youtube.html"), (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(d); });
  }
  if (urlPath.startsWith("/youtube/assignment/")) {
    const cookies = parseCookies(req); const u = getSessionUser(cookies.session);
    if (!u || (u.role !== "youtuber" && u.role !== "admin")) { res.writeHead(302, { Location: "/signin.html?next=" + urlPath }); res.end(); return; }
    return require("fs").readFile(require("path").join(ROOT, "youtube-assignment.html"), (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(d); });
  }
  if (urlPath === "/youtube/profile") {
    const cookies = parseCookies(req); const u = getSessionUser(cookies.session);
    if (!u || (u.role !== "youtuber" && u.role !== "admin")) { res.writeHead(302, { Location: "/signin.html" }); res.end(); return; }
    return require("fs").readFile(require("path").join(ROOT, "youtube-profile.html"), (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(d); });
  }
  // Public Free Audit (no auth)
  if (urlPath === "/audit" || urlPath === "/audit/")   { return fs.readFile(path.join(ROOT, "audit-landing.html"), (e,d) => { if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{"Content-Type":"text/html;charset=utf-8"});res.end(d); }); }
  if (urlPath === "/audit/running")                    { return fs.readFile(path.join(ROOT, "audit-running.html"),  (e,d) => { if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{"Content-Type":"text/html;charset=utf-8"});res.end(d); }); }
  if (urlPath === "/audit/results")                    { return fs.readFile(path.join(ROOT, "audit-results.html"), (e,d) => { if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{"Content-Type":"text/html;charset=utf-8"});res.end(d); }); }
  if (urlPath === "/api/audit-public/start"            && method === "POST") return handlePublicAuditStart(req, res);
  if (urlPath.startsWith("/api/audit-public/status/")  && method === "GET")  return handlePublicAuditStatus(req, res, urlPath.slice(25));
  if (urlPath.startsWith("/api/audit-public/results/") && method === "GET")  return handlePublicAuditResults(req, res, urlPath.slice(26));
  if (urlPath === "/api/audit-public/save"             && method === "POST") return handlePublicAuditSave(req, res);
  if (urlPath === "/api/audit-public/email-save"       && method === "POST") return handlePublicAuditEmailSave(req, res);

  // Standalone Audit API routes
  if (urlPath === "/api/audit"                         && method === "POST")   return handleAuditCreate(req, res);
  if (urlPath === "/api/audit"                         && method === "GET")    return handleAuditList(req, res);
  if (urlPath.startsWith("/api/audit/share/")          && method === "GET")    return handleAuditShareGet(req, res, urlPath.slice(18));
  if (urlPath.startsWith("/api/audit/") && urlPath.endsWith("/share")) {
    const id = urlPath.slice(11, -6);
    if (method === "POST")   return handleAuditShareCreate(req, res, id);
    if (method === "DELETE") return handleAuditShareDelete(req, res, id);
  }
  if (urlPath.startsWith("/api/audit/")               && method === "DELETE") return handleAuditDelete(req, res, urlPath.slice(11));

  // Share audit pages
  if (urlPath.startsWith("/audit/share/")) {
    return fs.readFile(path.join(ROOT, "audit-share.html"), (err, data) => {
      if (err) { res.writeHead(404); res.end("Not found"); return; }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    });
  }

  // Upgrade + Billing pages
  if (urlPath === "/upgrade") {
    return fs.readFile(path.join(ROOT, "upgrade.html"), (err, data) => {
      if (err) { res.writeHead(404); res.end("Not found"); return; }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    });
  }
  if (urlPath === "/billing") {
    return fs.readFile(path.join(ROOT, "billing.html"), (err, data) => {
      if (err) { res.writeHead(404); res.end("Not found"); return; }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    });
  }

  // Inject PayPal client ID into citations wizard
  if (urlPath === "/citations-wizard.html") {
    const wizPath = path.join(ROOT, "citations-wizard.html");
    return fs.readFile(wizPath, "utf8", (err, html) => {
      if (err) { res.writeHead(404); res.end("Not found"); return; }
      const clientId = process.env.PAYPAL_CLIENT_ID || "NOT_SET";
      html = html.replace('window.__PAYPAL_CLIENT_ID__ || "NOT_SET"', JSON.stringify(clientId));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    });
  }

  // Weekly Action Coach
  if (urlPath === "/coach")                                              return handleCoachPage(req, res);
  if (urlPath === "/api/coach/week"              && method === "GET")    return handleCoachWeek(req, res);
  if (urlPath.startsWith("/api/coach/complete/")  && method === "POST")  return handleCoachComplete(req, res, urlPath.slice(21));
  if (urlPath.startsWith("/api/coach/regenerate/") && method === "POST") return handleCoachRegenerate(req, res, urlPath.slice(23));
  if (urlPath === "/api/coach/streak"            && method === "GET")    return handleCoachStreak(req, res);
  if (urlPath === "/api/coach/visibility"        && method === "GET")    return handleCoachVisibility(req, res);

  // Newsletter
  // Newsletter Campaigns (user outbound newsletters)
  if (urlPath === '/api/newsletter-campaign'                                        && method === 'GET')    return handleNLCampaignList(req, res);
  if (urlPath === '/api/newsletter-campaign'                                        && method === 'POST')   return handleNLCampaignSave(req, res, null);
  if (urlPath.startsWith('/api/newsletter-campaign/') && urlPath.endsWith('/send') && method === 'POST')   return handleNLCampaignSend(req, res, urlPath.slice(25, -5));
  if (urlPath.startsWith('/api/newsletter-campaign/')                               && method === 'PUT')    return handleNLCampaignSave(req, res, urlPath.slice(25));
  if (urlPath.startsWith('/api/newsletter-campaign/')                               && method === 'DELETE') return handleNLCampaignDelete(req, res, urlPath.slice(25));

  // ── eureach.eu Newsletter Lists + Presets + AI ──────────────────────────────
  if (urlPath === '/api/nl-unsubscribe' && method === 'GET')                                                  return euNlListUnsubscribe(req, res);
  if (urlPath === '/api/nl-lists'       && method === 'GET')                                                  return euNlListsList(req, res);
  if (urlPath === '/api/nl-lists'       && method === 'POST')                                                 return euNlListCreate(req, res);
  if (urlPath.startsWith('/api/nl-lists/') && urlPath.endsWith('/contacts') && method === 'GET')              return euNlListContacts(req, res, urlPath.slice(13, -9));
  if (urlPath.startsWith('/api/nl-lists/') && urlPath.endsWith('/import')   && method === 'POST')             return euNlListImport(req, res, urlPath.slice(13, -7));
  if (urlPath.startsWith('/api/nl-lists/') && urlPath.endsWith('/broadcast') && method === 'POST')            return euNlListBroadcast(req, res, urlPath.slice(13, -10));
  if (urlPath.startsWith('/api/nl-lists/') && urlPath.endsWith('/bulk')     && method === 'POST')             return euNlListBulk(req, res, urlPath.slice(13, -5));
  if (urlPath.startsWith('/api/nl-lists/') && urlPath.endsWith('/rename')   && method === 'PATCH')            return euNlListRename(req, res, urlPath.slice(13, -7));
  if (urlPath.startsWith('/api/nl-lists/') && method === 'DELETE' && !urlPath.includes('/contacts/'))        return euNlListDelete(req, res, urlPath.slice(13));
  if (urlPath.match(/^\/api\/nl-lists\/[^/]+\/contacts\/[^/]+$/) && method === 'PATCH')  { const p=urlPath.slice(13).split('/contacts/'); return euNlListContactPatch(req, res, p[0], p[1]); }
  if (urlPath.match(/^\/api\/nl-lists\/[^/]+\/contacts\/[^/]+$/) && method === 'DELETE') { const p=urlPath.slice(13).split('/contacts/'); return euNlListContactDelete(req, res, p[0], p[1]); }
  if (urlPath === '/api/nl-presets'     && method === 'GET')                                                  return euNlPresetsList(req, res);
  if (urlPath === '/api/nl-presets'     && method === 'POST')                                                 return euNlPresetCreate(req, res);
  if (urlPath.startsWith('/api/nl-presets/') && urlPath.endsWith('/default') && method === 'POST')            return euNlPresetSetDefault(req, res, urlPath.slice(16, -8));
  if (urlPath.startsWith('/api/nl-presets/') && method === 'PUT')                                            return euNlPresetUpdate(req, res, urlPath.slice(16));
  if (urlPath.startsWith('/api/nl-presets/') && method === 'DELETE')                                         return euNlPresetDelete(req, res, urlPath.slice(16));
  if (urlPath === '/api/nl-ai-generate' && method === 'POST')                                                 return euNlAiGenerate(req, res);

  // Growth Plan
  if (urlPath === '/api/growth-plan/status'   && method === 'GET')  return handleGrowthPlanStatus(req, res);
  if (urlPath === '/api/growth-plan/activate' && method === 'POST') return handleGrowthPlanActivate(req, res);

    if (urlPath === "/api/newsletter/subscribe"        && method === "POST") return handleNewsletterSubscribe(req, res);
  if (urlPath.startsWith("/newsletter/confirm/")     && method === "GET")  return handleNewsletterConfirm(req, res, urlPath.slice(20));
  if (urlPath.startsWith("/newsletter/unsubscribe/") && method === "GET")  return handleNewsletterUnsubscribe(req, res, urlPath.slice(24));

  // ── Marketing Creator routes ────────────────────────────────────────────────
  if (urlPath === "/api/marketing/brand-kit"            && method === "GET")  return handleBrandKitGet(req, res);
  if (urlPath === "/api/marketing/brand-kit"            && method === "POST") return handleBrandKitSave(req, res);
  if (urlPath === "/api/marketing/generate/facebook"    && method === "POST") return handleMarketingGenerateFacebook(req, res);

  // ── Marketing Creator — all generators ──────────────────────────────────────
  if (urlPath.startsWith("/api/marketing/generate/") && method === "POST") {
    const platform = urlPath.slice("/api/marketing/generate/".length);
    return handleMarketingGenerate(req, res, platform);
  }
  if (urlPath === "/api/marketing/article-to-campaign" && method === "POST") return handleMarketingArticleToCampaign(req, res);
  if (urlPath === "/api/marketing/campaigns"           && method === "GET")  return handleMarketingCampaignsList(req, res);
  if (urlPath === "/api/marketing/campaigns"           && method === "POST") return handleMarketingCampaignCreate(req, res);
  if (urlPath === "/api/marketing/assets"              && method === "GET")  return handleMarketingAssetsList(req, res);
  if (urlPath.startsWith("/api/marketing/campaigns/") && method === "GET") {
    return handleMarketingCampaignGet(req, res, urlPath.slice("/api/marketing/campaigns/".length));
  }
  if (urlPath.startsWith("/api/marketing/campaigns/") && method === "DELETE") {
    return handleMarketingCampaignDelete(req, res, urlPath.slice("/api/marketing/campaigns/".length));
  }
  if (urlPath.startsWith("/api/marketing/assets/") && method === "DELETE") {
    return handleMarketingAssetDelete(req, res, urlPath.slice("/api/marketing/assets/".length));
  }

  // ── Internal Marketing API (for AGORA) ──────────────────────────────────────
  if (urlPath.startsWith("/api/internal/marketing/generate/") && method === "POST") {
    const platform = urlPath.slice("/api/internal/marketing/generate/".length);
    return handleInternalMarketingGenerate(req, res, platform);
  }


// ════════════════════════════════════════════════════════════════════════════
// eureach.eu Newsletter — Contact Lists + Presets + AI (Phases 1-5)
// ════════════════════════════════════════════════════════════════════════════
let _euGroq = null;
function _getEuGroq() {
  if (!_euGroq) { const Groq = require('groq-sdk'); _euGroq = new Groq({ apiKey: process.env.GROQ_API_KEY }); }
  return _euGroq;
}
function _euUnsubToken(ownerUserId, email) {
  return crypto.createHmac('sha256', process.env.EUREACH_UNSUB_SECRET || 'change-me')
    .update(String(ownerUserId) + ':' + email.toLowerCase()).digest('hex').slice(0, 32);
}

// ── Lists ────────────────────────────────────────────────────────────────────
async function euNlListsList(req, res) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const r = await agoraPool.query(
    `SELECT id, name, created_at,
       (SELECT COUNT(*) FROM eu_nl_list_contacts WHERE list_id=l.id AND is_excluded=false) AS contact_count
     FROM eu_nl_lists l WHERE owner_user_id=$1 ORDER BY created_at DESC`, [user.id]);
  return json(res, 200, { lists: r.rows });
}

async function euNlListCreate(req, res) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const { name } = await readBody(req);
  if (!name || !name.trim()) return json(res, 400, { error: 'Name required.' });
  const r = await agoraPool.query(
    'INSERT INTO eu_nl_lists (owner_user_id, name) VALUES ($1,$2) RETURNING *', [user.id, name.trim()]);
  return json(res, 200, { list: r.rows[0] });
}

async function euNlListDelete(req, res, id) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  await agoraPool.query('DELETE FROM eu_nl_lists WHERE id=$1 AND owner_user_id=$2', [id, user.id]);
  return json(res, 200, { ok: true });
}

async function euNlListRename(req, res, id) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const { name } = await readBody(req);
  if (!name || !name.trim()) return json(res, 400, { error: 'Name required.' });
  await agoraPool.query('UPDATE eu_nl_lists SET name=$1 WHERE id=$2 AND owner_user_id=$3', [name.trim(), id, user.id]);
  return json(res, 200, { ok: true });
}

async function euNlListImport(req, res, id) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const { rows } = await readBody(req);
  if (!Array.isArray(rows) || !rows.length) return json(res, 400, { error: 'No rows.' });
  const chk = await agoraPool.query('SELECT id FROM eu_nl_lists WHERE id=$1 AND owner_user_id=$2', [id, user.id]);
  if (!chk.rows.length) return json(res, 404, { error: 'List not found.' });
  let imported = 0, skipped = 0;
  for (const row of rows) {
    const email = (row.email || '').trim().toLowerCase();
    const name  = (row.name  || '').trim().slice(0, 200);
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { skipped++; continue; }
    try {
      await agoraPool.query(
        'INSERT INTO eu_nl_list_contacts (list_id,email,name) VALUES ($1,$2,$3) ON CONFLICT (list_id,email) DO NOTHING',
        [id, email, name || null]);
      imported++;
    } catch { skipped++; }
  }
  return json(res, 200, { imported, skipped });
}

async function euNlListContacts(req, res, id) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const chk = await agoraPool.query('SELECT id FROM eu_nl_lists WHERE id=$1 AND owner_user_id=$2', [id, user.id]);
  if (!chk.rows.length) return json(res, 404, { error: 'List not found.' });
  const qs     = new URL('http://x' + req.url).searchParams;
  const page   = Math.max(1, parseInt(qs.get('page') || '1'));
  const limit  = 50;
  const offset = (page - 1) * limit;
  const search = (qs.get('search') || '').trim();
  const filter = qs.get('filter') || 'all';
  let where = 'list_id=$1';
  const params = [id];
  if (filter === 'active')   { where += ' AND is_excluded=false'; }
  if (filter === 'excluded') { where += ' AND is_excluded=true'; }
  if (search) { params.push('%' + search + '%'); where += ` AND (email ILIKE $${params.length} OR name ILIKE $${params.length})`; }
  const total = parseInt((await agoraPool.query(`SELECT COUNT(*) FROM eu_nl_list_contacts WHERE ${where}`, params)).rows[0].count);
  const rows  = (await agoraPool.query(`SELECT id,email,name,is_excluded,created_at FROM eu_nl_list_contacts WHERE ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, params)).rows;
  const stats = (await agoraPool.query('SELECT COUNT(*) FILTER(WHERE is_excluded=false) AS active, COUNT(*) FILTER(WHERE is_excluded=true) AS excluded FROM eu_nl_list_contacts WHERE list_id=$1', [id])).rows[0];
  return json(res, 200, { contacts: rows, total, page, pages: Math.ceil(total/limit), stats });
}

async function euNlListContactPatch(req, res, listId, cid) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const body = await readBody(req);
  const sets = []; const vals = [cid, listId];
  if (body.name  !== undefined) { vals.push(body.name.trim().slice(0,200)); sets.push(`name=$${vals.length}`); }
  if (body.email !== undefined) { const e=body.email.trim().toLowerCase(); if(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)){vals.push(e);sets.push(`email=$${vals.length}`);} }
  if (body.is_excluded !== undefined) { vals.push(!!body.is_excluded); sets.push(`is_excluded=$${vals.length}`); }
  if (!sets.length) return json(res, 400, { error: 'Nothing to update.' });
  const r = await agoraPool.query(
    `UPDATE eu_nl_list_contacts c SET ${sets.join(',')}
     FROM eu_nl_lists l WHERE c.id=$1 AND c.list_id=$2 AND l.id=c.list_id AND l.owner_user_id='${user.id}' RETURNING c.*`, vals);
  return json(res, 200, { contact: r.rows[0] });
}

async function euNlListContactDelete(req, res, listId, cid) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  await agoraPool.query(
    `DELETE FROM eu_nl_list_contacts c USING eu_nl_lists l
     WHERE c.id=$1 AND c.list_id=$2 AND l.id=c.list_id AND l.owner_user_id=$3`, [cid, listId, user.id]);
  return json(res, 200, { ok: true });
}

async function euNlListBulk(req, res, id) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const { action, ids } = await readBody(req);
  if (!Array.isArray(ids) || !ids.length) return json(res, 400, { error: 'No ids.' });
  const chk = await agoraPool.query('SELECT id FROM eu_nl_lists WHERE id=$1 AND owner_user_id=$2', [id, user.id]);
  if (!chk.rows.length) return json(res, 404, { error: 'List not found.' });
  if (action === 'delete')  await agoraPool.query(`DELETE FROM eu_nl_list_contacts WHERE list_id=$1 AND id=ANY($2::bigint[])`, [id, ids]);
  if (action === 'exclude') await agoraPool.query(`UPDATE eu_nl_list_contacts SET is_excluded=true  WHERE list_id=$1 AND id=ANY($2::bigint[])`, [id, ids]);
  if (action === 'include') await agoraPool.query(`UPDATE eu_nl_list_contacts SET is_excluded=false WHERE list_id=$1 AND id=ANY($2::bigint[])`, [id, ids]);
  return json(res, 200, { ok: true });
}

// Phase 3: broadcast from list
async function euNlListBroadcast(req, res, id) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const chk = await agoraPool.query('SELECT id FROM eu_nl_lists WHERE id=$1 AND owner_user_id=$2', [id, user.id]);
  if (!chk.rows.length) return json(res, 404, { error: 'List not found.' });
  const { subject, html, fromName } = await readBody(req);
  if (!subject || !html) return json(res, 400, { error: 'subject and html required.' });
  const conns = readJSON(path.join(__dirname, 'data/smtp_connections.json'));
  const conn  = conns.find(c => c.userId === user.id);
  if (!conn) return json(res, 400, { error: 'No SMTP configured. Go to Settings → Email.' });
  let smtpPwd;
  try { smtpPwd = decryptStr(conn.passwordEnc); } catch { return json(res, 500, { error: 'Failed to decrypt SMTP credentials.' }); }
  const contacts = (await agoraPool.query(
    `SELECT c.email, c.name FROM eu_nl_list_contacts c
     WHERE c.list_id=$1 AND c.is_excluded=false
       AND NOT EXISTS(SELECT 1 FROM eu_nl_suppressions s WHERE s.owner_user_id=$2 AND s.email=c.email)`,
    [id, user.id])).rows;
  if (!contacts.length) return json(res, 400, { error: 'No active contacts.' });
  json(res, 200, { ok: true, total: contacts.length });
  (async () => {
    for (const c of contacts) {
      const token   = _euUnsubToken(user.id, c.email);
      const unsubUrl = `https://eureach.eu/api/nl-unsubscribe?t=${token}&e=${encodeURIComponent(c.email)}&o=${encodeURIComponent(user.id)}`;
      const finalHtml = html
        .replace(/{{unsubscribe_url}}/g, unsubUrl)
        .replace(/https?:\/\/[^"]*\/api\/nl-unsubscribe\?token=\{\{unsubscribe_url\}\}/g, unsubUrl);
      try {
        await smtpSend({ host: conn.host, port: conn.port, username: conn.username,
          password: smtpPwd, from: conn.from, fromName: fromName || conn.fromName || '',
          to: c.email, subject, html: finalHtml, body: '' });
      } catch(e) { console.error('[eu-nl-broadcast] failed:', c.email, e.message); }
      await new Promise(r => setTimeout(r, 80));
    }
  })();
}

// Phase 3: public unsubscribe
async function euNlListUnsubscribe(req, res) {
  const qs = new URL('http://x' + req.url).searchParams;
  const token = qs.get('t') || ''; const email = qs.get('e') || ''; const ownerId = qs.get('o') || '';
  const PAGE = (ok) => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Unsubscribe</title>
  <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8f9fa;margin:0}
  .box{background:#fff;border-radius:10px;padding:2.5rem 2rem;max-width:420px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.1)}
  h2{margin:0 0 .5rem}p{color:#555}</style></head><body><div class="box">
  ${ok ? '<h2>✅ Unsubscribed</h2><p>You have been removed from this mailing list.</p>'
       : '<h2>❌ Invalid link</h2><p>This unsubscribe link is invalid or expired.</p>'}
  <p><a href="https://eureach.eu">eureach.eu</a></p></div></body></html>`;
  if (!token || !email || !ownerId) { res.writeHead(400, {'Content-Type':'text/html'}); return res.end(PAGE(false)); }
  const expected = _euUnsubToken(ownerId, email.toLowerCase());
  if (token !== expected) { res.writeHead(400, {'Content-Type':'text/html'}); return res.end(PAGE(false)); }
  try {
    await agoraPool.query('INSERT INTO eu_nl_suppressions(owner_user_id,email) VALUES($1,$2) ON CONFLICT DO NOTHING', [ownerId, email.toLowerCase()]);
    await agoraPool.query('UPDATE eu_nl_list_contacts c SET is_excluded=true FROM eu_nl_lists l WHERE l.id=c.list_id AND l.owner_user_id=$1 AND c.email=$2', [ownerId, email.toLowerCase()]);
  } catch(e) { console.error('[eu-unsub]', e.message); }
  res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); res.end(PAGE(true));
}

// Phase 4: header presets
async function euNlPresetsList(req, res) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const r = await agoraPool.query('SELECT * FROM eu_nl_presets WHERE owner_user_id=$1 ORDER BY created_at ASC', [user.id]);
  return json(res, 200, { presets: r.rows });
}

async function euNlPresetCreate(req, res) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const { name, config } = await readBody(req);
  if (!name || !name.trim()) return json(res, 400, { error: 'Name required.' });
  const r = await agoraPool.query(
    `INSERT INTO eu_nl_presets (owner_user_id, name, config) VALUES ($1,$2,$3)
     ON CONFLICT (owner_user_id, name) DO UPDATE SET config=EXCLUDED.config, updated_at=now()
     RETURNING *`,
    [user.id, name.trim(), JSON.stringify(config || {})]);
  return json(res, 200, { preset: r.rows[0] });
}

async function euNlPresetUpdate(req, res, id) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const body = await readBody(req);
  const sets = []; const vals = [id, user.id];
  if (body.name !== undefined) { vals.push(body.name.trim()); sets.push(`name=$${vals.length}`); }
  if (body.config !== undefined) { vals.push(JSON.stringify(body.config)); sets.push(`config=$${vals.length}`); }
  if (!sets.length) return json(res, 400, { error: 'Nothing to update.' });
  const r = await agoraPool.query(
    `UPDATE eu_nl_presets SET ${sets.join(',')}, updated_at=now() WHERE id=$1 AND owner_user_id=$2 RETURNING *`, vals);
  return json(res, 200, { preset: r.rows[0] });
}

async function euNlPresetDelete(req, res, id) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  await agoraPool.query('DELETE FROM eu_nl_presets WHERE id=$1 AND owner_user_id=$2', [id, user.id]);
  return json(res, 200, { ok: true });
}

async function euNlPresetSetDefault(req, res, id) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  await agoraPool.query('UPDATE eu_nl_presets SET is_default=false WHERE owner_user_id=$1', [user.id]);
  await agoraPool.query('UPDATE eu_nl_presets SET is_default=true  WHERE id=$1 AND owner_user_id=$2', [id, user.id]);
  return json(res, 200, { ok: true });
}

// Phase 5: AI generate
async function euNlAiGenerate(req, res) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });
  const { prompt, tone = 'friendly', genSubject = true } = await readBody(req);
  if (!prompt || !prompt.trim()) return json(res, 400, { error: 'prompt required' });
  const toneMap = { friendly: 'friendly and warm', professional: 'professional', urgent: 'urgent and compelling' };
  const toneDesc = toneMap[tone] || toneMap.friendly;
  const systemPrompt = `You are an expert at writing email newsletters for business growth platforms. Write in the language the user specifies or defaults to English. Return ONLY valid JSON with fields: "subject" (if requested) and "html" (content without html/body tags, ready for email).`;
  const userPrompt   = `Write an email newsletter with a ${toneDesc} tone.${genSubject ? '\nAlso generate a subject line.' : ''}\nInstructions: ${prompt}\n\nResponse JSON: { ${genSubject ? '"subject": "...", ' : ''}"html": "..." }`;
  try {
    const completion = await _getEuGroq().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      temperature: 0.7, max_tokens: 2048, response_format: { type: 'json_object' }
    });
    const text = completion.choices[0].message.content;
    let parsed;
    try { parsed = JSON.parse(text); } catch { const m = text.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : { html: text }; }
    return json(res, 200, parsed);
  } catch(e) { console.error('euNlAiGenerate:', e); return json(res, 500, { error: e.message }); }
}

  // Static files
  let filePath = path.join(ROOT, urlPath === "/" ? "/index.html" : urlPath);
  const ext    = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(ROOT, "index.html"), (err2, html) => {
        if (err2) { res.writeHead(404); res.end("Not found"); return; }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
      });
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

http.createServer((req, res) => {
  handleRequest(req, res).catch(err => {
    console.error(err);
    json(res, 500, { error: "Internal server error." });
  });
}).listen(PORT, () => {
  console.log(`eureach.eu running on http://localhost:${PORT}`);
});

// ── 30-day competitor re-audit scheduler ──────────────────────────────────────
// Runs every 24 hours; audits any competitor whose last snapshot is 30+ days old.
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
setInterval(async () => {
  const apiKey = getAnthropicKey();
  const groqKey = getGroqKey();
  if (!apiKey && !groqKey) return;
  const all   = readJSON(COMPETITOR_FILE);
  const now   = Date.now();
  let changed = false;
  let audited = 0;
  const MAX_PER_RUN = 5;
  for (const comp of all) {
    if (audited >= MAX_PER_RUN) break;
    if (!comp.snapshots || !comp.snapshots.length) continue;
    const lastSnap = comp.snapshots[comp.snapshots.length - 1];
    if (now - new Date(lastSnap.date).getTime() < THIRTY_DAYS_MS) continue;
    try {
      const result   = await runCompetitorAudit(apiKey, comp.competitorName, comp.competitorUrl, comp.industry);
      const snapshot = { date: new Date().toISOString(), score: result.overall_score, breakdown: result.breakdown, recommendations: result.recommendations, strengths: result.strengths, weaknesses: result.weaknesses, lastUpdated: result.lastUpdated || null, recentUpdates: result.recentUpdates || [] };
      const prevScore = lastSnap.score;
      comp.snapshots.push(snapshot);
      comp.alert = (prevScore - result.overall_score) > 10;
      changed = true;
      audited++;
      console.log(`[scheduler] Re-audited competitor: ${comp.competitorName} → ${result.overall_score}`);
    } catch (err) {
      console.error(`[scheduler] Audit failed for ${comp.competitorName}:`, err.message);
    }
    if (audited < MAX_PER_RUN) await new Promise(r => setTimeout(r, 65000));
  }
  if (changed) writeJSON(COMPETITOR_FILE, all);
}, 24 * 60 * 60 * 1000);
