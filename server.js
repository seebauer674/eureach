try { require("dotenv").config(); } catch {}
require("dns").setDefaultResultOrder("ipv4first");
const http   = require("http");
const https  = require("https");
const net    = require("net");
const tls    = require("tls");
const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");

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

const PORT = process.env.PORT || 3003;
const ROOT = __dirname;

const USERS_FILE    = path.join(ROOT, "data/users.json");
const SESSIONS_FILE = path.join(ROOT, "data/sessions.json");
const CRM_FILE       = path.join(ROOT, "data/crm.json");
const SEQUENCES_FILE    = path.join(ROOT, "data/sequences.json");
const WHATSAPP_FILE     = path.join(ROOT, "data/whatsapp_templates.json");
const COMPETITOR_FILE   = path.join(ROOT, "data/competitor_tracking.json");
const SAVED_SEARCHES_FILE = path.join(ROOT, "data/competitor-saved-searches.json");
const LEAD_SAVED_SEARCHES_FILE = path.join(ROOT, "data/lead-saved-searches.json");
const OUTREACH_SAVED_LISTS_FILE = path.join(ROOT, "data/outreach-saved-lists.json");
const CRM_SAVED_LISTS_FILE       = path.join(ROOT, "data/crm-saved-lists.json");
const ARTICLE_SAVED_LISTS_FILE = path.join(ROOT, "data/article-saved-lists.json");
const LEAD_SCORES_FILE  = path.join(ROOT, "data/lead_scores.json");
const AUDITS_FILE       = path.join(ROOT, "data/audits.json");
const WP_FILE           = path.join(ROOT, "data/wordpress_connections.json");
const SMTP_FILE              = path.join(ROOT, "data/smtp_connections.json");
const EMAIL_LOG_FILE         = path.join(ROOT, "data/email_log.json");
const OUTREACH_QUEUE_FILE    = path.join(ROOT, "data/outreach-queue.json");
const BUSINESS_PROFILE_FILE  = path.join(ROOT, "data/business-profiles.json");
const SITES_FILE             = path.join(ROOT, "data/user-sites.json");

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
function deductCredits(users, idx, cost) {
  const { creditsLeft, creditsMax } = getCredits(users[idx]);
  if (creditsMax === -1) return { ok: true, creditsLeft: -1, creditsMax: -1 };
  if (creditsLeft < cost) return { ok: false, creditsLeft, creditsMax };
  users[idx].creditsLeft = creditsLeft - cost;
  users[idx].creditsMax  = creditsMax;
  users[idx].creditMonth = currentMonth();
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
  return user.plan === "paid";
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
  if (isTrialActive(user)) return "claude-haiku-4-5-20251001";
  if (isPaidUser(user)) return "claude-sonnet-4-6";
  return "claude-sonnet-4-6"; // free plan users still get sonnet for now
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

  const validPlans = Object.keys(PLAN_LIMITS);
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
  };

  users.push(user);
  writeJSON(USERS_FILE, users);

  const token = createSession(user.id);
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
      message: "Lead Finder is not available during the free trial. Upgrade to €15/month to unlock it.",
      upgradeUrl: "/upgrade",
    });
  }

  const body      = await readBody(req);
  const leadsFound = Math.max(0, parseInt(body.leadsFound) || 0);

  const users = readJSON(USERS_FILE);
  const idx   = users.findIndex(u => u.id === user.id);
  if (idx === -1) return json(res, 404, { error: "User not found." });

  const cost   = PLAN_LIMITS.costs.leadSearch;
  const result = deductCredits(users, idx, cost);
  if (!result.ok) return insufficientCredits(res, result.creditsLeft, result.creditsMax, cost);

  users[idx].searchesDone = (users[idx].searchesDone || 0) + 1;
  users[idx].leadsFound   = (users[idx].leadsFound   || 0) + leadsFound;

  writeJSON(USERS_FILE, users);
  json(res, 200, {
    creditsLeft:  result.creditsLeft,
    creditsMax:   result.creditsMax,
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
    canOutreach:  true,
    canWhatsApp:  true,
    canCompetitors: true,
    crmLeadsMax:  plan.crmLeads,
    canWordPress: plan.wordpress,
    sitesMax:     plan.sites,
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
      leads:       user.monthLeads    || 0,
      leadsMax:    -1,
      articles:    user.monthArticles || 0,
      articlesMax: -1,
      audits:      user.monthAudits   || 0,
      auditsMax:   -1,
      resetDate:   resetDateLabel(),
    },
    creditLog: user.creditLog || [],
  });
}

// ── Support email endpoint ────────────────────────────────────────────────────
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

function callGroq(apiKey, systemPrompt, userMessage, maxTokens = 1024, model = "llama-3.3-70b-versatile") {
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
  const outCost   = PLAN_LIMITS.costs.outreach;
  const outResult = deductCredits(outUsers, outIdx, outCost);
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
  const waCost   = PLAN_LIMITS.costs.whatsapp;
  const waResult = deductCredits(waUsers, waIdx, waCost);
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
  const scoreResult = deductCredits(scoreUsers, scoreIdx, scoreCost);
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

  // Trial article limit (3 total during trial)
  if (isTrialActive(users[idx])) {
    const tu = getTrialUsage(users[idx]);
    if ((tu.articlesGenerated || 0) >= 3) {
      return json(res, 403, {
        success: false, error: "trial_article_limit",
        message: "Your free trial includes 3 articles. Upgrade to €15/month for 6 articles per month.",
        upgradeUrl: "/upgrade",
      });
    }
    tu.articlesGenerated = (tu.articlesGenerated || 0) + 1;
    users[idx].trialUsage = tu;
  }

  const artCost   = PLAN_LIMITS.costs.articleGenerate;
  const artResult = deductCredits(users, idx, artCost);
  if (!artResult.ok) return insufficientCredits(res, artResult.creditsLeft, artResult.creditsMax, artCost);

  writeJSON(USERS_FILE, users);
  json(res, 200, { creditsLeft: artResult.creditsLeft, creditsMax: artResult.creditsMax, resetDate: resetDateLabel() });
}

// ── Competitor audit core ─────────────────────────────────────────────────────

async function runCompetitorAudit(apiKey, name, url, industry, model = "claude-sonnet-4-6") {
  const systemPrompt = `You are an expert AI search visibility analyst. You evaluate businesses for how well they appear in AI-powered search engines: ChatGPT, Perplexity, Google AI Overviews, and similar tools. You assess their digital footprint, content strategy, schema markup signals, local SEO, and citation potential. You produce realistic, differentiated scores — avoid clustering around 70-80. Use the full 0-100 range.

Return ONLY a valid JSON object — no markdown, no explanation, no code fences:
{
  "overall_score": <number 0-100>,
  "breakdown": {
    "ai_visibility": <number 0-100>,
    "content_quality": <number 0-100>,
    "local_seo": <number 0-100>,
    "schema_markup": <number 0-100>,
    "citation_readiness": <number 0-100>
  },
  "strengths": [<2-4 specific strengths>],
  "weaknesses": [<2-4 specific weaknesses>],
  "recommendations": [<3-5 actionable improvements>]
}`;

  const userMessage = `Analyze this business for AI search visibility:
- Name: ${name}
- Website: ${url || "unknown"}
- Industry: ${industry || "general business"}

Base your analysis on what is publicly known or reasonably inferred about businesses of this type and size in this industry. Score each dimension independently and honestly.`;

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

  // Trial competitor search limit (1 total during trial)
  if (isTrialActive(compUsers[compIdx])) {
    const usage = getTrialUsage(compUsers[compIdx]);
    if (usage.competitorSearches >= 1) {
      return json(res, 403, {
        success: false, error: "trial_competitor_limit",
        message: "Your free trial includes 1 competitor search. Upgrade to €15/month for unlimited searches.",
        upgradeUrl: "/upgrade",
      });
    }
  }

  const compCost   = PLAN_LIMITS.costs.competitorCreate;
  const compResult = deductCredits(compUsers, compIdx, compCost);
  if (!compResult.ok) return insufficientCredits(res, compResult.creditsLeft, compResult.creditsMax, compCost);
  writeJSON(USERS_FILE, compUsers);

  const compModel = getModel(compUsers[compIdx]);
  try {
    const result   = await runCompetitorAudit(apiKey, competitorName.trim(), (competitorUrl || "").trim(), (industry || "").trim(), compModel);
    const snapshot = { date: new Date().toISOString(), score: result.overall_score, breakdown: result.breakdown, recommendations: result.recommendations, strengths: result.strengths, weaknesses: result.weaknesses };
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
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });

  const apiKey = getAnthropicKey();
  if (!apiKey) return json(res, 500, { error: "AI service not configured." });

  const recheckUsers  = readJSON(USERS_FILE);
  const recheckUidx   = recheckUsers.findIndex(u => u.id === user.id);
  if (recheckUidx === -1) return json(res, 404, { error: "User not found." });
  const recheckCost   = PLAN_LIMITS.costs.competitorCheck;
  const recheckResult = deductCredits(recheckUsers, recheckUidx, recheckCost);
  if (!recheckResult.ok) return insufficientCredits(res, recheckResult.creditsLeft, recheckResult.creditsMax, recheckCost);
  writeJSON(USERS_FILE, recheckUsers);

  const all = readJSON(COMPETITOR_FILE);
  const idx = all.findIndex(c => c.id === id && c.userId === user.id);
  if (idx === -1) return json(res, 404, { error: "Competitor not found." });

  const comp = all[idx];
  try {
    const result   = await runCompetitorAudit(apiKey, comp.competitorName, comp.competitorUrl, comp.industry, getModel(recheckUsers[recheckUidx]));
    const snapshot = { date: new Date().toISOString(), score: result.overall_score, breakdown: result.breakdown, recommendations: result.recommendations, strengths: result.strengths, weaknesses: result.weaknesses };
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

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return json(res, 503, { error: "no_places_key", message: "Google Places API key not configured. Add GOOGLE_PLACES_API_KEY to .env on the server." });

  const body    = await readBody(req);
  const { niche, city, country } = body;
  if (!niche || !city || !country) return json(res, 400, { error: "niche, city and country are required." });

  const cleanCountry = country.replace(/^\S+\s/, ""); // strip flag emoji
  const query = `${niche} in ${city}, ${cleanCountry}`;

  try {
    const gRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.websiteUri,places.rating,places.userRatingCount,places.nationalPhoneNumber",
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 10, languageCode: "en" }),
    });
    const data = await gRes.json();
    if (!gRes.ok) return json(res, 502, { error: data.error?.message || "Google Places API error." });

    const results = (data.places || []).map(p => ({
      name:    p.displayName?.text   || "",
      address: p.formattedAddress    || "",
      website: (p.websiteUri || "").replace(/^https?:\/\//, "").replace(/\/$/, ""),
      phone:   p.nationalPhoneNumber || "",
      rating:  p.rating              || null,
      reviews: p.userRatingCount     || 0,
    }));
    json(res, 200, { results, query });
  } catch (err) {
    json(res, 502, { error: "Failed to reach Google Places API: " + err.message });
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


/* ── Lead Finder Search ────────────────────────────────── */

async function handleLeadSearch(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  if (!hasAccess(user)) return json(res, 403, {
    error: "trial_lead_limit",
    message: "Lead Finder is not available during the free trial. Upgrade to unlock it.",
    upgradeUrl: "/upgrade",
  });

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return json(res, 503, { error: "no_places_key", message: "Google Places API key not configured." });

  const body = await readBody(req);
  const { subcatLabel, city, country } = body;
  if (!subcatLabel || !city || !country) return json(res, 400, { error: "subcatLabel, city and country are required." });

  const cleanCountry = country.replace(/^\S+\s/, ""); // strip flag emoji
  const query = `${subcatLabel} in ${city}, ${cleanCountry}`;

  try {
    const gRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.websiteUri,places.rating,places.userRatingCount,places.nationalPhoneNumber",
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 20, languageCode: "en" }),
    });
    const data = await gRes.json();
    if (!gRes.ok) return json(res, 502, { error: data.error?.message || "Google Places API error." });

    const leads = (data.places || []).map((p, i) => ({
      id:      i + 1,
      name:    p.displayName?.text   || "",
      address: p.formattedAddress    || "",
      website: (p.websiteUri || "").replace(/^https?:\/\//, "").replace(/\/$/, ""),
      phone:   p.nationalPhoneNumber || null,
      rating:  p.rating              || null,
      reviews: p.userRatingCount     || 0,
      email:   null,
      status:  "new",
    }));
    json(res, 200, { leads, query });
  } catch (err) {
    json(res, 502, { error: "Failed to reach Google Places API: " + err.message });
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
          knownCompetitors, businessType, customerType, pricePositioning, searchScope } = body;
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
  if (role       !== undefined && (role === "admin" || role === "user")) users[idx].role = role;

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

  // Trial audit daily limit (1 per day)
  if (isTrialActive(users[uidx])) {
    const tu = getTrialUsage(users[uidx]);
    const today = new Date().toISOString().slice(0, 10);
    const auditsToday = tu.auditsTodayDate === today ? (tu.auditsToday || 0) : 0;
    if (auditsToday >= 1) {
      return json(res, 403, {
        success: false, error: "trial_audit_limit",
        message: "Your free trial includes 1 AI audit per day. Upgrade to €15/month for 4 audits per month.",
        upgradeUrl: "/upgrade",
      });
    }
  }

  const auditCost   = PLAN_LIMITS.costs.auditCreate;
  const auditResult = deductCredits(users, uidx, auditCost);
  if (!auditResult.ok) return insufficientCredits(res, auditResult.creditsLeft, auditResult.creditsMax, auditCost);

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
  const shareResult = deductCredits(shareUsers, shareUidx, shareCost);
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
function smtpSend({ host, port, username, password, from, fromName, to, subject, body, testOnly = false }) {
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
        const msgParts = [
          `From: ${displayFrom}`,
          `To: ${to}`,
          `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
          `Date: ${new Date().toUTCString()}`,
          `MIME-Version: 1.0`,
          `Content-Type: text/plain; charset=UTF-8`,
          `Content-Transfer-Encoding: 8bit`,
          "",
          ...body.split("\n").map(l => l.startsWith(".") ? "." + l : l),
        ];
        active.write(msgParts.join("\r\n") + "\r\n.\r\n");
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
    const sendResult = deductCredits(sendUsers, sendIdx, sendCost);
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

    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) return json(res, 500, { error: "STRIPE_PRICE_ID not configured." });

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

    users[idx].plan                  = "trial";
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
      `Hi ${user.firstName || "there"},\n\nYour 7-day free trial is now active.\n\nTrial ends: ${trialEndDate}\nIf you don't cancel before then, your card will be charged €15.\n\nWhat to do first:\n→ Run your AI Visibility Audit\n→ Search for your competitors\n→ Generate your first article\n\nCancel anytime at: https://eureach.eu/billing\n\n– The eureach team`
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
        `Your trial ends on ${endDate}.\n\nIf you'd like to continue, no action needed — you'll be charged €15 automatically.\n\nTo cancel: https://eureach.eu/billing → Cancel trial\n\n– The eureach team`
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
          "Welcome to eureach — €15 charged",
          `Your trial has ended and your subscription is now active.\n€15 has been charged to your card ending in ${last4}.\n\nYou now have:\n→ Unlimited competitor searches\n→ Upgraded AI analysis\n→ Full article generation\n\nManage your subscription: https://eureach.eu/billing\n\n– The eureach team`
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
    nextChargeAmount: "€15",
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
    json(res, 200, { success: true, message: "Upgrade initiated. Your card will be charged €15 shortly." });
  } catch (err) {
    console.error("Upgrade now error:", err);
    json(res, 500, { error: "Failed to upgrade: " + (err.message || "Unknown error") });
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

// ── Router ────────────────────────────────────────────────────────────────────

// Paths that must never be served as static files
const BLOCKED_STATIC_PREFIXES = ["/data/", "/config/", "/security/", "/."];
const BLOCKED_STATIC_FILES    = ["/server.js", "/package.json", "/package-lock.json", "/.env"];

// CSRF-exempt endpoints (before session exists)
const CSRF_EXEMPT = ["/api/auth/signup", "/api/auth/signin", "/api/billing/webhook"];

function generateCsrfToken() { return crypto.randomBytes(24).toString("hex"); }

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
      !CSRF_EXEMPT.includes(urlPath)) {
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

  // Trial / Billing routes
  if (urlPath === "/api/trial/start"          && method === "POST") return handleTrialStart(req, res);
  if (urlPath === "/api/trial/cancel"         && method === "POST") return handleTrialCancel(req, res);
  if (urlPath === "/api/billing/webhook"      && method === "POST") return handleBillingWebhook(req, res);
  if (urlPath === "/api/billing/status"       && method === "GET")  return handleBillingStatus(req, res);
  if (urlPath === "/api/billing/update-card"  && method === "POST") return handleBillingUpdateCard(req, res);
  if (urlPath === "/api/billing/upgrade-now"  && method === "POST") return handleBillingUpgradeNow(req, res);
  if (urlPath === "/api/billing/stripe-key"   && method === "GET")  return json(res, 200, { publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null });
  if (urlPath === "/api/leads/search"        && method === "POST") return handleLeadsSearch(req, res);
  if (urlPath === "/api/leads/verify-email" && method === "POST") return handleVerifyEmail(req, res);
  if (urlPath === "/api/leads/score"         && method === "POST") return handleLeadsScore(req, res);
  if (urlPath === "/api/leads/score/cache" && method === "GET")  return handleLeadsScoreCache(req, res);
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
  if (urlPath.startsWith("/api/admin/users/")) {
    const parts = urlPath.slice("/api/admin/users/".length).split("/");
    const uid   = parts[0];
    const sub   = parts[1];
    if (method === "PATCH"  && !sub)            return handleAdminUpdateUser(req, res, uid);
    if (method === "DELETE" && !sub)            return handleAdminDeleteUser(req, res, uid);
    if (method === "POST"   && sub === "biz-edits") return handleAdminSetBizEdits(req, res, uid);
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
  if (urlPath.startsWith("/api/crm/saved-lists/")     && method === "DELETE") return handleCrmSavedListDelete(req, res, urlPath.slice(21));
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
  if (!apiKey) return;
  const all   = readJSON(COMPETITOR_FILE);
  const now   = Date.now();
  let changed = false;
  for (const comp of all) {
    if (!comp.snapshots || !comp.snapshots.length) continue;
    const lastSnap = comp.snapshots[comp.snapshots.length - 1];
    if (now - new Date(lastSnap.date).getTime() < THIRTY_DAYS_MS) continue;
    try {
      const result   = await runCompetitorAudit(apiKey, comp.competitorName, comp.competitorUrl, comp.industry);
      const snapshot = { date: new Date().toISOString(), score: result.overall_score, breakdown: result.breakdown, recommendations: result.recommendations, strengths: result.strengths, weaknesses: result.weaknesses };
      const prevScore = lastSnap.score;
      comp.snapshots.push(snapshot);
      comp.alert = (prevScore - result.overall_score) > 10;
      changed = true;
      console.log(`[scheduler] Re-audited competitor: ${comp.competitorName} → ${result.overall_score}`);
    } catch (err) {
      console.error(`[scheduler] Audit failed for ${comp.competitorName}:`, err.message);
    }
  }
  if (changed) writeJSON(COMPETITOR_FILE, all);
}, 24 * 60 * 60 * 1000);
