const http   = require("http");
const https  = require("https");
const net    = require("net");
const tls    = require("tls");
const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");

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
const LEAD_SCORES_FILE  = path.join(ROOT, "data/lead_scores.json");
const AUDITS_FILE       = path.join(ROOT, "data/audits.json");
const CREDIT_LOG_FILE   = path.join(ROOT, "data/credit_log.json");
const WP_FILE           = path.join(ROOT, "data/wordpress_connections.json");
const SMTP_FILE         = path.join(ROOT, "data/smtp_connections.json");
const GMAIL_FILE        = path.join(ROOT, "data/gmail_connections.json");
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI  = "https://eureach.eu/api/auth/gmail/callback";
const EMAIL_LOG_FILE    = path.join(ROOT, "data/email_log.json");
const PIPELINE_FILE     = path.join(ROOT, "data/pipeline.json");

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
const IDLE_LOGIN_CHARGE = 3; // credits charged on 3rd+ login per day with no action taken

const PLAN_LIMITS = require("./config/limits");

// Returns "YYYY-MM" for current month
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Returns usage object, resetting leads/articles if month changed (audits are lifetime)
function getUserUsage(user) {
  const month = currentMonth();
  if (!user.usage || user.usage.month !== month) {
    return { month, leads: 0, articles: 0, audits: (user.usage && user.usage.audits) || 0 };
  }
  return { ...user.usage };
}

// Returns remaining uses: -1 = unlimited, else max - used (floored at 0)
function computeLeft(max, used) {
  if (max === -1) return -1;
  return Math.max(0, max - used);
}

// Next month reset date string e.g. "June 1"
function resetDateLabel() {
  const d = new Date();
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return next.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

// 403 limit_reached response
function limitReached(res, feature, current, max) {
  return json(res, 403, { error: "limit_reached", feature, current, max, upgradeUrl: "/pricing" });
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

function logCreditTransaction(userId, delta, reason, newBalance) {
  const log = readJSON(CREDIT_LOG_FILE);
  log.push({ id: generateId(), userId, delta, reason, balance: newBalance, createdAt: new Date().toISOString() });
  // Keep last 500 entries per user (prune oldest)
  const kept = log.slice(-2000);
  writeJSON(CREDIT_LOG_FILE, kept);
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
    if (!stored || typeof stored !== 'string') return resolve(false);
    const [salt, expected] = stored.split(':');
    if (!salt || !expected || expected.length !== SCRYPT_PARAMS.keylen * 2) return resolve(false);
    crypto.scrypt(password, salt, SCRYPT_PARAMS.keylen, SCRYPT_PARAMS, (err, hash) => {
      if (err) { reject(err); return; }
      try { resolve(crypto.timingSafeEqual(Buffer.from(expected, 'hex'), hash)); }
      catch (e) { resolve(false); }
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
  const { passwordHash, dailyActivity, ...safe } = user;
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
  const limits       = PLAN_LIMITS[chosenPlan];

  const month = currentMonth();
  const user = {
    id:           generateId(),
    email:        email.toLowerCase().trim(),
    firstName:    first_name.trim(),
    lastName:     (last_name || "").trim(),
    passwordHash,
    plan:         chosenPlan,
    articlesLeft: limits.articles,
    searchesLeft: limits.searches,
    usage:        { month, leads: 0, articles: 0, audits: 0 },
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

  // Daily login tracking — charge IDLE_LOGIN_CHARGE on 3rd+ login with no action taken
  const _today = new Date().toISOString().slice(0, 10);
  const _uidx  = users.findIndex(u => u.id === user.id);
  if (_uidx !== -1) {
    const da    = users[_uidx].dailyActivity || {};
    const fresh = da.date !== _today;
    const count = fresh ? 1 : (da.loginCount || 0) + 1;
    const acted = fresh ? false : !!da.hasActed;
    if (!acted && count >= 3 && users[_uidx].role !== 'admin') {
      const _prevCr = users[_uidx].credits || 0;
      users[_uidx].credits = Math.max(0, _prevCr - IDLE_LOGIN_CHARGE);
      logCreditTransaction(users[_uidx].id, -IDLE_LOGIN_CHARGE, 'Idle login (3rd login with no action)', users[_uidx].credits);
      logEvent('idle_login_charge', user.email, ip);
    }
    users[_uidx].dailyActivity = { date: _today, loginCount: count, hasActed: acted };
    writeJSON(USERS_FILE, users);
  }

  const token    = createSession(user.id);
  const _outUser = _uidx !== -1 ? users[_uidx] : user;
  json(res, 200, { user: safeUser(_outUser) }, { "Set-Cookie": sessionCookie(token) });
}

async function handleLeadsSearch(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });

  const body      = await readBody(req);
  const leadsFound = Math.max(0, parseInt(body.leadsFound) || 0);

  const users = readJSON(USERS_FILE);
  const idx   = users.findIndex(u => u.id === user.id);
  if (idx === -1) return json(res, 404, { error: "User not found." });

  const limits = PLAN_LIMITS[users[idx].plan] || PLAN_LIMITS.free;
  const usage  = getUserUsage(users[idx]);
  const max    = limits.searches;

  if (max !== -1 && usage.leads >= max) {
    return limitReached(res, "leads", usage.leads, max);
  }

  if (max !== -1) usage.leads += 1;
  users[idx].usage        = usage;
  users[idx].searchesLeft = computeLeft(max, usage.leads);
  users[idx].searchesDone = (users[idx].searchesDone || 0) + 1;
  users[idx].leadsFound   = (users[idx].leadsFound   || 0) + leadsFound;
  users[idx].creditsUsed  = (users[idx].creditsUsed  || 0) + 1;

  writeJSON(USERS_FILE, users);
  json(res, 200, {
    searchesLeft: users[idx].searchesLeft,
    searchesMax:  max,
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
  const { firstName, lastName, email, currentPassword, newPassword } = body;

  const users = readJSON(USERS_FILE);
  const idx   = users.findIndex(u => u.id === user.id);
  if (idx === -1) return json(res, 404, { error: "User not found." });

  if (email && email.toLowerCase() !== user.email) {
    if (users.find(u => u.id !== user.id && u.email === email.toLowerCase().trim())) {
      return json(res, 409, { error: "That email is already in use." });
    }
    users[idx].email = email.toLowerCase().trim();
  }

  if (firstName !== undefined) users[idx].firstName = firstName.trim();
  if (lastName  !== undefined) users[idx].lastName  = lastName.trim();

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
  const limits  = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;
  const usage   = getUserUsage(user);
  const rd      = resetDateLabel();
  const computed = {
    searchesLeft:    computeLeft(limits.searches,    usage.leads),
    searchesMax:     limits.searches,
    articlesLeft:    computeLeft(limits.articles,    usage.articles),
    articlesMax:     limits.articles,
    auditsLeft:      computeLeft(limits.audits,      usage.audits),
    auditsMax:       limits.audits,
    resetDate:       rd,
    canOutreach:     limits.outreach    !== 0,
    canWhatsApp:     limits.whatsapp    !== 0,
    canCompetitors:  limits.competitors !== 0,
    crmLeadsMax:     limits.crmLeads,
  };
  json(res, 200, { user: { ...safeUser(user), usage, ...computed } });
}

// ── Anthropic helpers ─────────────────────────────────────────────────────────

function getAnthropicKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const cfg = JSON.parse(fs.readFileSync(SOSBOARD_TOKENS, "utf8"));
    return cfg.anthropic?.apiKey || null;
  } catch { return null; }
}

function callClaude(apiKey, systemPrompt, userMessage, maxTokens = 2048) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "claude-sonnet-4-6",
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

  const limits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;
  if (limits.outreach === 0) return limitReached(res, "outreach", 0, 0);

  const apiKey = getAnthropicKey();
  if (!apiKey) return json(res, 500, { error: "AI service not configured." });

  const body = await readBody(req);
  const { crmId, leadName, businessType, city, language, tone } = body;

  if (!leadName) return json(res, 400, { error: "leadName is required." });

  const langMap  = { greek: "Greek", english: "English", german: "German" };
  const toneMap  = { formal: "formal and professional", friendly: "warm and friendly", direct: "direct and concise" };
  const langLabel = langMap[language]  || "English";
  const toneLabel = toneMap[tone]      || "friendly";

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
- Subject lines must be specific and curiosity-inducing, not generic.`;

  const userMessage = `Generate a 3-step outreach sequence for this lead:
- Business Name: ${leadName}
- Business Type: ${businessType || "local business"}
- City: ${city || "Europe"}`;

  try {
    const aiRes = await callClaude(apiKey, systemPrompt, userMessage);

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

  const limits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;
  if (limits.whatsapp === 0) return limitReached(res, "whatsapp", 0, 0);

  const apiKey = getAnthropicKey();
  if (!apiKey) return json(res, 500, { error: "AI service not configured." });

  const body = await readBody(req);
  const { crmId, leadName, businessType, city, phone, language, messageType } = body;

  if (!leadName) return json(res, 400, { error: "leadName is required." });

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
    const aiRes = await callClaude(apiKey, systemPrompt, userMessage);
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

  const body = await readBody(req);
  const { leadName, businessType, city, phone, website, notes } = body;
  if (!leadName || !leadName.trim()) return json(res, 400, { error: "leadName is required." });

  const crm   = readJSON(CRM_FILE);
  const clim  = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;
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
  if (!apiKey) return json(res, 500, { error: "AI service not configured." });

  const body  = await readBody(req);
  const leads = Array.isArray(body.leads) ? body.leads.slice(0, 30) : [];
  if (!leads.length) return json(res, 400, { error: "leads array is required." });

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
      const aiRes = await callClaude(apiKey, systemPrompt, userMessage, 2048);
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
  const mine   = all.filter(c => c.userId === user.id);
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

  const limits = PLAN_LIMITS[users[idx].plan] || PLAN_LIMITS.free;
  const usage  = getUserUsage(users[idx]);
  const max    = limits.articles;

  if (max !== -1 && usage.articles >= max) {
    return limitReached(res, "articles", usage.articles, max);
  }

  if (max !== -1) usage.articles += 1;
  users[idx].usage        = usage;
  users[idx].articlesLeft = computeLeft(max, usage.articles);
  writeJSON(USERS_FILE, users);

  json(res, 200, { articlesLeft: users[idx].articlesLeft, articlesMax: max, resetDate: resetDateLabel() });
}

// ── Competitor audit core ─────────────────────────────────────────────────────

async function runCompetitorAudit(apiKey, name, url, industry) {
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

  const aiRes = await callClaude(apiKey, systemPrompt, userMessage, 1024);
  if (aiRes.error) throw new Error(aiRes.error.message || "AI error");

  const raw = aiRes.content?.[0]?.text || "";
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

  const complim = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;
  if (complim.competitors === 0) return limitReached(res, "competitors", 0, 0);
  if (complim.competitors !== -1) {
    const existing = readJSON(COMPETITOR_FILE).filter(c => c.userId === user.id).length;
    if (existing >= complim.competitors) return limitReached(res, "competitors", existing, complim.competitors);
  }

  const apiKey = getAnthropicKey();
  if (!apiKey) return json(res, 500, { error: "AI service not configured." });

  const body = await readBody(req);
  const { competitorName, competitorUrl, industry } = body;
  if (!competitorName || !competitorName.trim()) return json(res, 400, { error: "competitorName is required." });

  try {
    const result   = await runCompetitorAudit(apiKey, competitorName.trim(), (competitorUrl || "").trim(), (industry || "").trim());
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

  const all = readJSON(COMPETITOR_FILE);
  const idx = all.findIndex(c => c.id === id && c.userId === user.id);
  if (idx === -1) return json(res, 404, { error: "Competitor not found." });

  const comp = all[idx];
  try {
    const result   = await runCompetitorAudit(apiKey, comp.competitorName, comp.competitorUrl, comp.industry);
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
  const all = readJSON(COMPETITOR_FILE);
  const filtered = all.filter(c => !(c.id === id && c.userId === user.id));
  if (filtered.length === all.length) return json(res, 404, { error: "Competitor not found." });
  writeJSON(COMPETITOR_FILE, filtered);
  json(res, 200, { ok: true });
}

function handleCompetitorShare(req, res, token) {
  const all  = readJSON(COMPETITOR_FILE);
  const comp = all.find(c => c.shareToken === token);
  if (!comp) return json(res, 404, { error: "Share link not found." });
  const { userId, shareToken, ...pub } = comp;
  json(res, 200, { competitor: pub });
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

  const limits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;
  if (limits.wordpress === 0) return limitReached(res, "wordpress", 0, 0);

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

  const limits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;
  const users  = readJSON(USERS_FILE);
  const uidx   = users.findIndex(u => u.id === user.id);
  if (uidx === -1) return json(res, 404, { error: "User not found." });

  // Lifetime audit limit check
  if (limits.audits !== -1) {
    const usage = getUserUsage(users[uidx]);
    if (usage.audits >= limits.audits) {
      return limitReached(res, "audits", usage.audits, limits.audits);
    }
  }

  const apiKey = getAnthropicKey();
  if (!apiKey) return json(res, 500, { error: "AI service not configured." });

  const body = await readBody(req);
  const { businessName, businessUrl, industry } = body;
  if (!businessName || !businessName.trim()) return json(res, 400, { error: "businessName is required." });

  try {
    const result = await runCompetitorAudit(apiKey, businessName.trim(), (businessUrl || "").trim(), (industry || "").trim());

    // Increment lifetime audit counter
    const usage = getUserUsage(users[uidx]);
    usage.audits = (usage.audits || 0) + 1;
    users[uidx].usage = usage;
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

// ── Gmail OAuth helpers ──────────────────────────────────────────────────────

function googlePost(urlStr, params) {
  return new Promise((resolve, reject) => {
    const body    = new URLSearchParams(params).toString();
    const parsed  = new URL(urlStr);
    const options = {
      hostname: parsed.hostname,
      path:     parsed.pathname,
      method:   "POST",
      headers:  { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) },
    };
    const req = https.request(options, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, body: data }); } });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function googleGet(urlStr, accessToken) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(urlStr);
    const options = {
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      method:   "GET",
      headers:  { "Authorization": "Bearer " + accessToken },
    };
    const req = https.request(options, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, body: data }); } });
    });
    req.on("error", reject);
    req.end();
  });
}

function googleJsonPost(urlStr, bodyObj, accessToken) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(urlStr);
    const bodyStr = JSON.stringify(bodyObj);
    const options = {
      hostname: parsed.hostname,
      path:     parsed.pathname,
      method:   "POST",
      headers:  { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bodyStr), "Authorization": "Bearer " + accessToken },
    };
    const req = https.request(options, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, body: data }); } });
    });
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

async function gmailGetAccessToken(userId) {
  const conn = readJSON(GMAIL_FILE).find(c => c.userId === userId);
  if (!conn) return null;
  let refreshToken;
  try { refreshToken = decryptStr(conn.refreshTokenEnc); } catch { return null; }
  const r = await googlePost("https://oauth2.googleapis.com/token", {
    client_id:     GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type:    "refresh_token",
  });
  if (r.status !== 200 || !r.body.access_token) return null;
  return { accessToken: r.body.access_token, email: conn.email };
}

function buildRfc2822(fromEmail, fromName, to, subject, bodyText) {
  const fromHeader = fromName ? `"${fromName.replace(/["\\]/g, "")}" <${fromEmail}>` : fromEmail;
  return [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    bodyText,
  ].join("\r\n");
}

async function gmailSendMessage({ userId, to, subject, body, fromName }) {
  const tok = await gmailGetAccessToken(userId);
  if (!tok) throw new Error("Gmail not connected");
  const raw     = buildRfc2822(tok.email, fromName || null, to, subject, body);
  const encoded = Buffer.from(raw).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const r = await googleJsonPost(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    { raw: encoded },
    tok.accessToken
  );
  if (r.status !== 200) throw new Error("Gmail API error: " + JSON.stringify(r.body));
  return r.body;
}

// ── Gmail OAuth handlers ──────────────────────────────────────────────────────

async function handleGmailConnect(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) { res.writeHead(302, { Location: "/signin.html" }); return res.end(); }
  if (!GOOGLE_CLIENT_ID) return json(res, 503, { error: "Gmail OAuth not configured on this server." });
  const state = crypto.createHmac("sha256", WP_ENCRYPT_KEY).update(cookies.session).digest("hex").slice(0, 32);
  const params = new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    redirect_uri:  GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope:         "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email",
    access_type:   "offline",
    prompt:        "consent",
    state,
  });
  res.writeHead(302, { Location: "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString() });
  res.end();
}

async function handleGmailCallback(req, res) {
  const urlObj   = new URL("https://eureach.eu" + req.url);
  const code     = urlObj.searchParams.get("code");
  const state    = urlObj.searchParams.get("state");
  const errParam = urlObj.searchParams.get("error");

  if (errParam || !code || !state) {
    res.writeHead(302, { Location: "/settings.html?gmail=denied#email" });
    return res.end();
  }

  // Find the session whose HMAC matches the state
  const sessions = readJSON(SESSIONS_FILE);
  let matchedUser = null;
  for (const sess of sessions) {
    if (sess.expiresAt <= Date.now()) continue;
    const expected = crypto.createHmac("sha256", WP_ENCRYPT_KEY).update(sess.token).digest("hex").slice(0, 32);
    if (expected === state) {
      const users = readJSON(USERS_FILE);
      matchedUser = users.find(u => u.id === sess.userId) || null;
      break;
    }
  }

  if (!matchedUser) {
    res.writeHead(302, { Location: "/settings.html?gmail=error#email" });
    return res.end();
  }

  const tokenRes = await googlePost("https://oauth2.googleapis.com/token", {
    code,
    client_id:     GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri:  GOOGLE_REDIRECT_URI,
    grant_type:    "authorization_code",
  });

  if (tokenRes.status !== 200 || !tokenRes.body.refresh_token) {
    res.writeHead(302, { Location: "/settings.html?gmail=error#email" });
    return res.end();
  }

  const infoRes  = await googleGet("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", tokenRes.body.access_token);
  const gmailEmail = infoRes.body?.email || "";

  const conns = readJSON(GMAIL_FILE).filter(c => c.userId !== matchedUser.id);
  conns.push({
    userId:          matchedUser.id,
    email:           gmailEmail,
    refreshTokenEnc: encryptStr(tokenRes.body.refresh_token),
    connectedAt:     new Date().toISOString(),
  });
  writeJSON(GMAIL_FILE, conns);

  res.writeHead(302, { Location: "/settings.html?gmail=connected#email" });
  res.end();
}

async function handleGmailDisconnect(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  writeJSON(GMAIL_FILE, readJSON(GMAIL_FILE).filter(c => c.userId !== user.id));
  return json(res, 200, { ok: true });
}

async function handleGmailStatus(req, res) {
  const cookies = parseCookies(req);
  const user = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: "Not authenticated." });
  const conn = readJSON(GMAIL_FILE).find(c => c.userId === user.id);
  if (!conn) return json(res, 200, { connected: false });
  return json(res, 200, { connected: true, email: conn.email, connectedAt: conn.connectedAt });
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
  const raw2       = await readBody(req);
  const to         = sanitizeEmail(raw2.to || "");
  const subject    = sanitizeString(raw2.subject || "", 200);
  const body       = sanitizeString(raw2.body || "", 10000);
  const leadId     = sanitizeString(raw2.leadId || "", 50);
  const sequenceStep = sanitizeInteger(raw2.sequenceStep, 0, 10) || null;
  if (!to || !subject || !body) return json(res, 400, { error: "to, subject, and body are required." });
  if (!to.includes("@")) return json(res, 400, { error: "Enter a valid email address." });
  // Try Gmail OAuth first, fall back to SMTP
  const gmailConn = readJSON(GMAIL_FILE).find(c => c.userId === user.id);
  const smtpConn  = readJSON(SMTP_FILE).find(c => c.userId === user.id);
  if (!gmailConn && !smtpConn) return json(res, 400, { error: "No email connection configured. Go to Settings → Email to connect Gmail or SMTP." });
  try {
    if (gmailConn) {
      await gmailSendMessage({ userId: user.id, to, subject, body });
    } else {
      let password;
      try { password = decryptStr(smtpConn.passwordEnc); }
      catch { return json(res, 500, { error: "Failed to decrypt SMTP credentials. Please reconnect in Settings." }); }
      await smtpSend({ host: smtpConn.host, port: smtpConn.port, username: smtpConn.username, password, from: smtpConn.from, fromName: smtpConn.fromName || "", to, subject, body });
    }
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
  const log = readJSON(EMAIL_LOG_FILE)
    .filter(e => e.userId === user.id)
    .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
  return json(res, 200, { log });
}

// ── Pipeline (Lead CRM) ───────────────────────────────────────────────────────

function getPipelineLeads(userId) {
  return readJSON(PIPELINE_FILE).filter(l => l.userId === userId);
}

function savePipelineLeads(userId, leads) {
  const all = readJSON(PIPELINE_FILE).filter(l => l.userId !== userId);
  writeJSON(PIPELINE_FILE, [...all, ...leads]);
}

async function handlePipelineList(req, res) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: "Unauthorized." });
  return json(res, 200, getPipelineLeads(user.id));
}

async function handlePipelineAdd(req, res) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: "Unauthorized." });
  const body = await readBody(req);
  const { name, category, city, phone, website, email, rating, reviews, address } = body;
  if (!name) return json(res, 400, { error: "name required" });
  const leads = getPipelineLeads(user.id);
  if (leads.find(l => l.name === name && l.city === city)) {
    return json(res, 409, { error: "Already in pipeline" });
  }
  const lead = {
    id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36),
    userId: user.id,
    name, category: category || "", city: city || "",
    phone: phone || "", website: website || "", email: email || "",
    address: address || "", rating: rating || 0, reviews: reviews || 0,
    stage: "new",
    notes: [],
    history: [{ stage: "new", date: new Date().toISOString() }],
    followUpDate: null,
    addedAt: new Date().toISOString()
  };
  leads.push(lead);
  savePipelineLeads(user.id, leads);
  return json(res, 201, lead);
}

async function handlePipelineStage(req, res, id) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: "Unauthorized." });
  const body = await readBody(req);
  const { stage } = body;
  const STAGES = ["new", "contacted", "replied", "audited", "proposal", "won", "lost"];
  if (!STAGES.includes(stage)) return json(res, 400, { error: "Invalid stage" });
  const leads = getPipelineLeads(user.id);
  const lead = leads.find(l => l.id === id);
  if (!lead) return json(res, 404, { error: "Not found" });
  lead.stage = stage;
  lead.history.push({ stage, date: new Date().toISOString() });
  savePipelineLeads(user.id, leads);
  return json(res, 200, lead);
}

async function handlePipelineNote(req, res, id) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: "Unauthorized." });
  const body = await readBody(req);
  const { text } = body;
  if (!text) return json(res, 400, { error: "text required" });
  const leads = getPipelineLeads(user.id);
  const lead = leads.find(l => l.id === id);
  if (!lead) return json(res, 404, { error: "Not found" });
  lead.notes.push({ text, date: new Date().toISOString() });
  savePipelineLeads(user.id, leads);
  return json(res, 200, lead);
}

async function handlePipelineFollowup(req, res, id) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: "Unauthorized." });
  const body = await readBody(req);
  const leads = getPipelineLeads(user.id);
  const lead = leads.find(l => l.id === id);
  if (!lead) return json(res, 404, { error: "Not found" });
  lead.followUpDate = body.followUpDate || null;
  savePipelineLeads(user.id, leads);
  return json(res, 200, lead);
}

async function handlePipelineDelete(req, res, id) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: "Unauthorized." });
  const leads = getPipelineLeads(user.id);
  const idx = leads.findIndex(l => l.id === id);
  if (idx === -1) return json(res, 404, { error: "Not found" });
  leads.splice(idx, 1);
  savePipelineLeads(user.id, leads);
  return json(res, 200, { ok: true });
}

async function handlePipelineGenerateEmail(req, res) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { error: "Unauthorized." });
  const body = await readBody(req);
  const { name, category, city, website } = body;
  if (!name) return json(res, 400, { error: "name required" });
  const apiKey = getAnthropicKey();
  if (!apiKey) return json(res, 500, { error: "AI key not configured" });
  const prompt = `Γράψε ένα σύντομο, επαγγελματικό email προσέγγισης στα Ελληνικά για μια επιχείρηση.

Στοιχεία επιχείρησης:
- Όνομα: ${name}
- Κατηγορία: ${category || "—"}
- Πόλη: ${city || "—"}
- Website: ${website || "—"}

Το email πρέπει:
1. Να είναι σύντομο (3-4 παράγραφοι)
2. Να αναφέρει ότι είδαμε την επιχείρησή τους online
3. Να προτείνει βοήθεια με digital marketing / SEO / web presence
4. Να έχει φιλικό αλλά επαγγελματικό τόνο
5. Να τελειώνει με CTA για ένα σύντομο τηλεφώνημα ή email απάντηση

Γράψε ΜΟΝΟ το κείμενο του email (θέμα + σώμα), χωρίς εξηγήσεις.`;
  try {
    const result = await callClaude(apiKey, "You are a professional Greek digital marketing consultant writing outreach emails.", prompt, 800);
    const text = result?.content?.[0]?.text || result?.text || String(result);
    return json(res, 200, { email: text });
  } catch (e) {
    return json(res, 500, { error: "AI generation failed" });
  }
}

// ── Solo vertical ─────────────────────────────────────────────────────────────

const SOLO_PROFILES_DIR   = path.join(ROOT, "data/solo_profiles");
const SOLO_AUDITS_DIR     = path.join(ROOT, "data/solo_audits");
const SOLO_CHECKLISTS_DIR = path.join(ROOT, "data/solo_checklists");
const SOLO_ARTICLES_DIR   = path.join(ROOT, "data/solo_articles");

for (const dir of [SOLO_PROFILES_DIR, SOLO_AUDITS_DIR, SOLO_CHECKLISTS_DIR, SOLO_ARTICLES_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getSoloProfile(userId) {
  const file = path.join(SOLO_PROFILES_DIR, `${userId}.json`);
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function saveSoloProfile(userId, data) {
  fs.writeFileSync(path.join(SOLO_PROFILES_DIR, `${userId}.json`), JSON.stringify(data, null, 2), "utf8");
}

function checkSoloLimit(res, user, feature) {
  const limits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;
  const max = limits[feature];
  if (max === undefined || max === 0) {
    json(res, 403, { success: false, error: "limit_reached", feature, upgradeUrl: "/solo#pricing" });
    return false;
  }
  if (max === -1) return true;
  const month = currentMonth();
  const usage = (user.soloUsage && user.soloUsage.month === month) ? user.soloUsage : { month, solo_audits: 0, solo_articles: 0 };
  const used = usage[feature] || 0;
  if (used >= max) {
    json(res, 403, { success: false, error: "limit_reached", feature, current: used, max, upgradeUrl: "/solo#pricing" });
    return false;
  }
  return true;
}

function incrementSoloUsage(userId, feature) {
  const users = readJSON(USERS_FILE);
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return;
  const month = currentMonth();
  const usage = (users[idx].soloUsage && users[idx].soloUsage.month === month)
    ? { ...users[idx].soloUsage }
    : { month, solo_audits: 0, solo_articles: 0 };
  usage[feature] = (usage[feature] || 0) + 1;
  users[idx].soloUsage = usage;
  writeJSON(USERS_FILE, users);
}

function handleSoloProfileGet(req, res) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { success: false, error: "Not authenticated." });
  json(res, 200, { success: true, data: getSoloProfile(user.id) || null });
}

async function handleSoloProfileSave(req, res) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { success: false, error: "Not authenticated." });
  const body = await readBody(req);
  const allowed = ["businessName","trade","city","region","phone","website","workingHours","serviceArea","description","languages"];
  const profile = { userId: user.id };
  for (const k of allowed) {
    if (body[k] !== undefined) {
      profile[k] = (typeof body[k] === "string") ? sanitizeString(body[k], 500) : body[k];
    }
  }
  const existing = getSoloProfile(user.id);
  profile.createdAt = existing ? existing.createdAt : new Date().toISOString();
  profile.updatedAt = new Date().toISOString();
  saveSoloProfile(user.id, profile);
  json(res, 200, { success: true, data: profile });
}

async function handleSoloAuditRun(req, res) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { success: false, error: "Not authenticated." });
  if (!checkAiRateLimit(res, user.id)) return;
  if (!checkSoloLimit(res, user, "solo_audits")) return;
  const profile = getSoloProfile(user.id);
  if (!profile || !profile.businessName) return json(res, 400, { success: false, error: "Complete your business profile first." });
  const apiKey = getAnthropicKey();
  if (!apiKey) return json(res, 503, { success: false, error: "AI service temporarily unavailable." });

  const systemPrompt = `You are an AI visibility consultant for small Greek businesses. Respond ONLY in valid JSON, no markdown, no preamble.`;
  const userMessage = `Audit the AI and online visibility of this business:
Business name: ${profile.businessName}
Trade/profession: ${profile.trade || ""}
City: ${profile.city || ""}
Region: ${profile.region || ""}
Website: ${profile.website || ""}
Description: ${profile.description || ""}

Check:
1. Would ChatGPT, Gemini, and Perplexity know this business exists and recommend it?
2. Is the business likely listed on Google Maps, Google Business Profile?
3. Does the business have enough online presence to appear in AI search results?
4. What are the 3 most urgent improvements needed?

Respond with this exact JSON structure:
{
  "score": <integer 0-100>,
  "summary": "<2 sentences in Greek summarizing visibility status>",
  "findings": [
    {"area": "<area name in Greek>", "status": "good|warning|critical", "detail": "<explanation in Greek>"}
  ],
  "actions": [
    {"priority": 1, "action": "<specific action in Greek>", "effort": "low|medium|high", "impact": "low|medium|high"}
  ]
}
Return exactly 4 findings and exactly 4 actions. findings and actions must be in Greek.`;

  try {
    const aiRes = await callClaude(apiKey, systemPrompt, userMessage, 2000);
    if (aiRes.error) return json(res, 503, { success: false, error: "AI service temporarily unavailable." });
    const raw = aiRes.content?.[0]?.text || "";
    let result;
    try { result = JSON.parse(raw); }
    catch { const m = raw.match(/\{[\s\S]*\}/); if (!m) return json(res, 503, { success: false, error: "AI returned unexpected format." }); result = JSON.parse(m[0]); }
    const entry = { id: generateId(), userId: user.id, score: result.score, summary: result.summary, findings: result.findings, actions: result.actions, createdAt: new Date().toISOString() };
    fs.writeFileSync(path.join(SOLO_AUDITS_DIR, `${user.id}_${Date.now()}.json`), JSON.stringify(entry, null, 2), "utf8");
    incrementSoloUsage(user.id, "solo_audits");
    json(res, 200, { success: true, data: entry });
  } catch (err) {
    console.error("Solo audit error:", err);
    json(res, 503, { success: false, error: "AI service temporarily unavailable." });
  }
}

function handleSoloAuditsList(req, res) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { success: false, error: "Not authenticated." });
  try {
    const files = fs.readdirSync(SOLO_AUDITS_DIR).filter(f => f.startsWith(user.id + "_") && f.endsWith(".json")).sort().reverse().slice(0, 10);
    const audits = files.map(f => { try { return JSON.parse(fs.readFileSync(path.join(SOLO_AUDITS_DIR, f), "utf8")); } catch { return null; } }).filter(Boolean);
    json(res, 200, { success: true, data: audits });
  } catch { json(res, 200, { success: true, data: [] }); }
}

async function handleSoloChecklistGet(req, res) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { success: false, error: "Not authenticated." });
  const month = currentMonth();
  const file = path.join(SOLO_CHECKLISTS_DIR, `${user.id}_${month}.json`);
  if (fs.existsSync(file)) {
    try { return json(res, 200, { success: true, data: JSON.parse(fs.readFileSync(file, "utf8")) }); } catch {}
  }
  const profile = getSoloProfile(user.id);
  if (!profile || !profile.trade) return json(res, 400, { success: false, error: "Complete your business profile first." });
  let lastScore = 50;
  try {
    const aFiles = fs.readdirSync(SOLO_AUDITS_DIR).filter(f => f.startsWith(user.id + "_")).sort().reverse();
    if (aFiles.length) lastScore = JSON.parse(fs.readFileSync(path.join(SOLO_AUDITS_DIR, aFiles[0]), "utf8")).score || 50;
  } catch {}
  const apiKey = getAnthropicKey();
  if (!apiKey) return json(res, 503, { success: false, error: "AI service temporarily unavailable." });
  const monthNames = ["Ιανουάριος","Φεβρουάριος","Μάρτιος","Απρίλιος","Μάιος","Ιούνιος","Ιούλιος","Αύγουστος","Σεπτέμβριος","Οκτώβριος","Νοέμβριος","Δεκέμβριος"];
  const d = new Date();
  const monthYear = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
  const systemPrompt = `You are a digital marketing assistant for solo Greek professionals. Respond ONLY in valid JSON, no markdown, no preamble.`;
  const userMessage = `Generate a monthly visibility checklist for:
Trade: ${profile.trade}
City: ${profile.city || ""}
Website: ${profile.website || ""}
Current month: ${monthYear}
Last audit score: ${lastScore} / 100

Return exactly 6 actionable tasks for this month. Each task must be something a non-technical person can do in under 30 minutes. Tasks should be in Greek. Mix: Google Business Profile, social media, review management, content publishing, local community.

JSON format:
{
  "month": "${month}",
  "items": [
    {"id": "1", "task": "<task in Greek>", "category": "google|social|reviews|content|local", "estimatedMinutes": <integer>, "done": false}
  ]
}`;
  try {
    const aiRes = await callClaude(apiKey, systemPrompt, userMessage, 800);
    if (aiRes.error) return json(res, 503, { success: false, error: "AI service temporarily unavailable." });
    const raw = aiRes.content?.[0]?.text || "";
    let result;
    try { result = JSON.parse(raw); }
    catch { const m = raw.match(/\{[\s\S]*\}/); if (!m) return json(res, 503, { success: false, error: "AI returned unexpected format." }); result = JSON.parse(m[0]); }
    fs.writeFileSync(file, JSON.stringify(result, null, 2), "utf8");
    json(res, 200, { success: true, data: result });
  } catch (err) {
    console.error("Solo checklist error:", err);
    json(res, 503, { success: false, error: "AI service temporarily unavailable." });
  }
}

async function handleSoloChecklistComplete(req, res) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { success: false, error: "Not authenticated." });
  const body = await readBody(req);
  const { itemId } = body;
  if (!itemId) return json(res, 400, { success: false, error: "itemId is required." });
  const month = currentMonth();
  const file = path.join(SOLO_CHECKLISTS_DIR, `${user.id}_${month}.json`);
  if (!fs.existsSync(file)) return json(res, 404, { success: false, error: "No checklist for this month." });
  try {
    const checklist = JSON.parse(fs.readFileSync(file, "utf8"));
    const item = checklist.items.find(i => i.id === String(itemId));
    if (!item) return json(res, 404, { success: false, error: "Item not found." });
    item.done = true;
    fs.writeFileSync(file, JSON.stringify(checklist, null, 2), "utf8");
    json(res, 200, { success: true, data: checklist });
  } catch { json(res, 500, { success: false, error: "Failed to update." }); }
}

async function handleSoloArticleGenerate(req, res) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { success: false, error: "Not authenticated." });
  if (!checkAiRateLimit(res, user.id)) return;
  if (!checkSoloLimit(res, user, "solo_articles")) return;
  const profile = getSoloProfile(user.id);
  if (!profile || !profile.businessName) return json(res, 400, { success: false, error: "Complete your business profile first." });
  const body = await readBody(req);
  const { articleType, language = "el" } = body;
  const validTypes = ["why_hire_me","my_services","emergency_available","local_expert","faq"];
  if (!validTypes.includes(articleType)) return json(res, 400, { success: false, error: "Invalid articleType." });
  const apiKey = getAnthropicKey();
  if (!apiKey) return json(res, 503, { success: false, error: "AI service temporarily unavailable." });
  const langLabel = language === "el" ? "Greek" : "English";
  const trade = profile.trade || "professional";
  const city  = profile.city  || "Greece";
  const typeLabels = {
    why_hire_me: `"Why choose a local ${trade} in ${city}" — builds trust and local authority`,
    my_services: `"Complete guide to ${trade} services in ${city}" — covers all service offerings`,
    emergency_available: `"24/7 ${trade} in ${city} — what to do in an emergency" — for tradespeople with emergency services`,
    local_expert: `"${trade} in ${city} — local knowledge that matters" — emphasizes local expertise`,
    faq: `"Frequently asked questions about ${trade} services in ${city}" — FAQ format for AI visibility`,
  };
  const systemPrompt = `You are an SEO copywriter writing self-promotion content for a solo Greek professional. Write in ${langLabel}. Output ONLY the article text — no JSON, no preamble, no markdown wrapper. Include an H1 title, 3-4 subheadings (H2), and 600-900 words total.`;
  const userMessage = `Write a "${articleType}" article for:
Business: ${profile.businessName}
Trade: ${trade}
City: ${city}
Region: ${profile.region || ""}
Phone: ${profile.phone || ""}
Website: ${profile.website || ""}
Description: ${profile.description || ""}

Article type: ${typeLabels[articleType]}

Write in ${langLabel}. Target: Greek residents searching for ${trade} services locally and via AI assistants.`;
  try {
    const aiRes = await callClaude(apiKey, systemPrompt, userMessage, 1500);
    if (aiRes.error) return json(res, 503, { success: false, error: "AI service temporarily unavailable." });
    const text = aiRes.content?.[0]?.text || "";
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const entry = { id: generateId(), userId: user.id, articleType, language, text, wordCount, createdAt: new Date().toISOString() };
    fs.writeFileSync(path.join(SOLO_ARTICLES_DIR, `${user.id}_${Date.now()}.json`), JSON.stringify(entry, null, 2), "utf8");
    incrementSoloUsage(user.id, "solo_articles");
    json(res, 200, { success: true, data: entry });
  } catch (err) {
    console.error("Solo article error:", err);
    json(res, 503, { success: false, error: "AI service temporarily unavailable." });
  }
}

function handleSoloArticlesList(req, res) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { success: false, error: "Not authenticated." });
  try {
    const files = fs.readdirSync(SOLO_ARTICLES_DIR).filter(f => f.startsWith(user.id + "_") && f.endsWith(".json")).sort().reverse().slice(0, 20);
    const articles = files.map(f => { try { const a = JSON.parse(fs.readFileSync(path.join(SOLO_ARTICLES_DIR, f), "utf8")); return { id: a.id, articleType: a.articleType, language: a.language, wordCount: a.wordCount, createdAt: a.createdAt }; } catch { return null; } }).filter(Boolean);
    json(res, 200, { success: true, data: articles });
  } catch { json(res, 200, { success: true, data: [] }); }
}

function handleSoloArticleGet(req, res, id) {
  const user = getSessionUser(parseCookies(req).session);
  if (!user) return json(res, 401, { success: false, error: "Not authenticated." });
  try {
    const files = fs.readdirSync(SOLO_ARTICLES_DIR).filter(f => f.startsWith(user.id + "_") && f.endsWith(".json"));
    for (const f of files) {
      try { const a = JSON.parse(fs.readFileSync(path.join(SOLO_ARTICLES_DIR, f), "utf8")); if (a.id === id) return json(res, 200, { success: true, data: a }); } catch {}
    }
    json(res, 404, { success: false, error: "Not found." });
  } catch { json(res, 404, { success: false, error: "Not found." }); }
}


// ── Router ────────────────────────────────────────────────────────────────────

// Paths that must never be served as static files
const BLOCKED_STATIC_PREFIXES = ["/data/", "/config/", "/security/", "/."];
const BLOCKED_STATIC_FILES    = ["/server.js", "/package.json", "/package-lock.json", "/.env"];

// CSRF-exempt endpoints (before session exists)
const CSRF_EXEMPT = ["/api/auth/signup", "/api/auth/signin"];

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


  // ── Suspension & feature restriction check ────────────────────────────────────
  if (urlPath.startsWith('/api/') && !urlPath.startsWith('/api/auth/') && !urlPath.startsWith('/api/admin/')) {
    const _sc = parseCookies(req);
    const _su = getSessionUser(_sc.session);
    if (_su && _su.role !== 'admin') {
      if (_su.suspended)
        return json(res, 403, { error: 'Your account has been suspended. Please contact support.' });
      const RMAP = {
        leads: '/api/leads/', articles: '/api/articles/', audits: '/api/audit',
        outreach: '/api/outreach', whatsapp: '/api/whatsapp', crm: '/api/crm',
        pipeline: '/api/pipeline', competitors: '/api/competitor/',
      };
      if (_su.restrictions && _su.restrictions.length)
        for (const [feat, prefix] of Object.entries(RMAP))
          if (_su.restrictions.includes(feat) && urlPath.startsWith(prefix))
            return json(res, 403, { error: `The '${feat}' feature is restricted on your account.` });
    }
  }


  // ── Daily activity marker — mark hasActed when user hits a billable endpoint ──
  {
    const _ABILL = ['/api/leads/search','/api/articles/deduct','/api/audit','/api/outreach','/api/whatsapp','/api/pipeline/generate-email','/api/competitor/track','/api/solo/audit/run','/api/solo/articles/generate','/api/solo/checklist/complete'];
    if (method === 'POST' && _ABILL.some(p => urlPath === p || urlPath.startsWith(p + '/'))) {
      const _ac = parseCookies(req);
      const _au = getSessionUser(_ac.session);
      if (_au) {
        const _at  = new Date().toISOString().slice(0, 10);
        const _aus = readJSON(USERS_FILE);
        const _ai  = _aus.findIndex(u => u.id === _au.id);
        if (_ai !== -1 && _aus[_ai].dailyActivity?.date === _at && !_aus[_ai].dailyActivity.hasActed) {
          _aus[_ai].dailyActivity.hasActed = true;
          writeJSON(USERS_FILE, _aus);
        }
      }
    }
  }

  // Auth API routes
  if (urlPath === "/api/auth/signup"  && method === "POST")  return handleSignup(req, res);
  if (urlPath === "/api/auth/signin"  && method === "POST")  return handleSignin(req, res);
  if (urlPath === "/api/auth/signout" && method === "POST")  return handleSignout(req, res);
  if (urlPath === "/api/auth/me"      && method === "GET")   return handleMe(req, res);
  if (urlPath === "/api/auth/profile" && method === "PATCH") return handleUpdateProfile(req, res);
  if (urlPath === "/api/leads/search"      && method === "POST") return handleLeadsSearch(req, res);
  if (urlPath === "/api/leads/score"       && method === "POST") return handleLeadsScore(req, res);
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
  // Gmail OAuth routes
  if (urlPath === "/api/auth/gmail/connect"    && method === "GET")    return handleGmailConnect(req, res);
  if (urlPath === "/api/auth/gmail/callback"   && method === "GET")    return handleGmailCallback(req, res);
  if (urlPath === "/api/auth/gmail/disconnect" && method === "DELETE") return handleGmailDisconnect(req, res);
  if (urlPath === "/api/auth/gmail/status"     && method === "GET")    return handleGmailStatus(req, res);

  // Outreach API routes
  if (urlPath === "/api/outreach"  && method === "POST") return handleOutreach(req, res);
  if (urlPath === "/api/outreach"  && method === "GET")  return handleSequencesList(req, res);
  if (urlPath === "/api/whatsapp"  && method === "POST") return handleWhatsApp(req, res);

  // CRM API routes
  if (urlPath === "/api/crm"                       && method === "GET")    return handleCrmList(req, res);
  if (urlPath === "/api/crm"                       && method === "POST")   return handleCrmCreate(req, res);
  if (urlPath.startsWith("/api/crm/")              && method === "PATCH")  return handleCrmUpdate(req, res, urlPath.slice(9));
  if (urlPath.startsWith("/api/crm/")              && method === "DELETE") return handleCrmDelete(req, res, urlPath.slice(9));

  // Pipeline API routes
  if (urlPath === "/api/pipeline"                              && method === "GET")    return handlePipelineList(req, res);
  if (urlPath === "/api/pipeline"                              && method === "POST")   return handlePipelineAdd(req, res);
  if (urlPath === "/api/pipeline/generate-email"               && method === "POST")   return handlePipelineGenerateEmail(req, res);
  if (urlPath.startsWith("/api/pipeline/") && urlPath.endsWith("/stage")    && method === "PATCH")  return handlePipelineStage(req, res, urlPath.slice(14, -6));
  if (urlPath.startsWith("/api/pipeline/") && urlPath.endsWith("/note")     && method === "POST")   return handlePipelineNote(req, res, urlPath.slice(14, -5));
  if (urlPath.startsWith("/api/pipeline/") && urlPath.endsWith("/followup") && method === "PATCH")  return handlePipelineFollowup(req, res, urlPath.slice(14, -9));
  if (urlPath.startsWith("/api/pipeline/")                     && method === "DELETE") return handlePipelineDelete(req, res, urlPath.slice(14));

  // Competitor tracking API routes
  if (urlPath === "/api/competitor/track"          && method === "GET")    return handleCompetitorList(req, res);
  if (urlPath === "/api/competitor/track"          && method === "POST")   return handleCompetitorCreate(req, res);
  if (urlPath.startsWith("/api/competitor/track/") && method === "DELETE") return handleCompetitorDelete(req, res, urlPath.slice(24));
  if (urlPath.startsWith("/api/competitor/track/") && method === "POST"  ) {
    const parts = urlPath.slice(24).split("/");
    if (parts[1] === "check") return handleCompetitorCheck(req, res, parts[0]);
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


  // Solo HTML pages
  if (urlPath === "/solo" || urlPath === "/solo/") return fs.readFile(path.join(ROOT, "solo/index.html"), (e,d) => { if(e){res.writeHead(404);res.end("Not found");return;} res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});res.end(d); });
  if (urlPath === "/solo/profile")   return fs.readFile(path.join(ROOT, "solo/profile.html"),   (e,d) => { if(e){res.writeHead(404);res.end("Not found");return;} res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});res.end(d); });
  if (urlPath === "/solo/audit")     return fs.readFile(path.join(ROOT, "solo/audit.html"),     (e,d) => { if(e){res.writeHead(404);res.end("Not found");return;} res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});res.end(d); });
  if (urlPath === "/solo/checklist") return fs.readFile(path.join(ROOT, "solo/checklist.html"), (e,d) => { if(e){res.writeHead(404);res.end("Not found");return;} res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});res.end(d); });
  if (urlPath === "/solo/articles")  return fs.readFile(path.join(ROOT, "solo/articles.html"),  (e,d) => { if(e){res.writeHead(404);res.end("Not found");return;} res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});res.end(d); });

  // Solo API routes
  if (urlPath === "/api/solo/profile"             && method === "GET")  return handleSoloProfileGet(req, res);
  if (urlPath === "/api/solo/profile"             && method === "POST") return handleSoloProfileSave(req, res);
  if (urlPath === "/api/solo/audit/run"           && method === "POST") return handleSoloAuditRun(req, res);
  if (urlPath === "/api/solo/audits"              && method === "GET")  return handleSoloAuditsList(req, res);
  if (urlPath === "/api/solo/checklist"           && method === "GET")  return handleSoloChecklistGet(req, res);
  if (urlPath === "/api/solo/checklist/complete"  && method === "POST") return handleSoloChecklistComplete(req, res);
  if (urlPath === "/api/solo/articles/generate"   && method === "POST") return handleSoloArticleGenerate(req, res);
  if (urlPath === "/api/solo/articles"            && method === "GET")  return handleSoloArticlesList(req, res);
  if (urlPath.startsWith("/api/solo/articles/")   && method === "GET")  return handleSoloArticleGet(req, res, urlPath.slice(20));



  if (urlPath === '/api/profile' && method === 'GET') return handleProfile(req, res);

  // Admin API routes
  if (urlPath === '/api/admin/users' && method === 'GET')    return handleAdminListUsers(req, res);
  if (urlPath === '/api/admin/users' && method === 'POST')   return handleAdminCreateUser(req, res);
  if (urlPath.startsWith('/api/admin/users/') && urlPath.endsWith('/reset-password') && method === 'POST')
    return handleAdminResetPassword(req, res, urlPath.slice(18, -15));
  if (urlPath.startsWith('/api/admin/users/') && method === 'PATCH')
    return handleAdminUpdateUser(req, res, urlPath.slice(18));
  if (urlPath.startsWith('/api/admin/users/') && method === 'DELETE')
    return handleAdminDeleteUser(req, res, urlPath.slice(18));

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



// ── User profile / activity handler ──────────────────────────────────────────

async function handleProfile(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user) return json(res, 401, { error: 'Not authenticated.' });

  const users  = readJSON(USERS_FILE);
  const fresh  = users.find(u => u.id === user.id);
  if (!fresh) return json(res, 404, { error: 'User not found.' });

  const limits = PLAN_LIMITS[fresh.plan] || PLAN_LIMITS.free;
  const usage  = getUserUsage(fresh);

  // Credit transaction log for this user (last 50)
  const allLog = readJSON(CREDIT_LOG_FILE);
  const myLog  = allLog.filter(e => e.userId === user.id).slice(-50).reverse();

  // Lifetime stats
  const stats = {
    searchesDone:  fresh.searchesDone  || 0,
    leadsFound:    fresh.leadsFound    || 0,
    creditsUsed:   fresh.creditsUsed   || 0,
    credits:       fresh.credits       || 0,
  };

  // Month usage
  const month = {
    leads:    usage.leads    || 0,
    articles: usage.articles || 0,
    audits:   usage.audits   || 0,
    leadsMax:    limits.searches,
    articlesMax: limits.articles,
    auditsMax:   limits.audits,
    resetDate:   resetDateLabel(),
  };

  json(res, 200, { stats, month, creditLog: myLog, plan: fresh.plan, role: fresh.role || 'user' });
}

// ── Admin backoffice handlers ──────────────────────────────────────────────────

function requireAdmin(req, res) {
  const cookies = parseCookies(req);
  const user    = getSessionUser(cookies.session);
  if (!user)                 { json(res, 401, { error: 'Not authenticated.' });     return null; }
  if (user.role !== 'admin') { json(res, 403, { error: 'Admin access required.' }); return null; }
  return user;
}

async function handleAdminListUsers(req, res) {
  if (!requireAdmin(req, res)) return;
  const users = readJSON(USERS_FILE).map(u => { const { passwordHash, ...s } = u; return s; });
  json(res, 200, { users });
}

async function handleAdminCreateUser(req, res) {
  if (!requireAdmin(req, res)) return;
  const body = await readBody(req);
  const { email, password, firstName, lastName, plan = 'free', role = 'user' } = body;
  if (!email || !password || !firstName)
    return json(res, 400, { error: 'email, password and firstName are required.' });
  const users = readJSON(USERS_FILE);
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase()))
    return json(res, 409, { error: 'Email already in use.' });
  const passwordHash = await hashPassword(password);
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  const user = {
    id:           generateId(),
    email:        email.toLowerCase().trim(),
    firstName:    firstName.trim(),
    lastName:     (lastName || '').trim(),
    passwordHash,
    role:         role === 'admin' ? 'admin' : 'user',
    plan,
    articlesLeft: limits.articles === -1 ? 99999 : limits.articles,
    searchesLeft: limits.searches === -1 ? 99999 : limits.searches,
    usage:        { month: currentMonth(), leads: 0, articles: 0, audits: 0 },
    sites:        [],
    suspended:    false,
    restrictions: [],
    createdAt:    new Date().toISOString(),
  };
  users.push(user);
  writeJSON(USERS_FILE, users);
  const { passwordHash: _ph, ...safe } = user;
  json(res, 201, { user: safe });
}

async function handleAdminUpdateUser(req, res, userId) {
  if (!requireAdmin(req, res)) return;
  const users = readJSON(USERS_FILE);
  const idx   = users.findIndex(u => u.id === userId);
  if (idx === -1) return json(res, 404, { error: 'User not found.' });
  const body = await readBody(req);
  const { plan, role, suspended, restrictions, addArticles, addSearches, addAudits, firstName, lastName, email } = body;
  if (plan !== undefined && Object.keys(PLAN_LIMITS).includes(plan)) users[idx].plan = plan;
  if (role !== undefined)         users[idx].role         = role === 'admin' ? 'admin' : 'user';
  if (suspended !== undefined)    users[idx].suspended    = !!suspended;
  if (restrictions !== undefined) users[idx].restrictions = Array.isArray(restrictions) ? restrictions : [];
  if (firstName !== undefined)    users[idx].firstName    = firstName.trim();
  if (lastName  !== undefined)    users[idx].lastName     = lastName.trim();
  if (email !== undefined) {
    const el = email.toLowerCase().trim();
    if (users.find(u => u.id !== userId && u.email === el))
      return json(res, 409, { error: 'Email already in use.' });
    users[idx].email = el;
  }
  if (addArticles) users[idx].articlesLeft = Math.max(0, (users[idx].articlesLeft || 0) + parseInt(addArticles));
  if (addSearches) users[idx].searchesLeft = Math.max(0, (users[idx].searchesLeft || 0) + parseInt(addSearches));
  if (addAudits)   users[idx].auditsLeft   = Math.max(0, (users[idx].auditsLeft   || 0) + parseInt(addAudits));
  if (body.addCredits !== undefined) {
    const _delta = parseInt(body.addCredits);
    users[idx].credits = Math.max(0, (users[idx].credits || 0) + _delta);
    if (_delta !== 0) logCreditTransaction(userId, _delta, 'Admin adjustment', users[idx].credits);
  }
  if (body.setCredits !== undefined) {
    const _prev = users[idx].credits || 0;
    users[idx].credits = Math.max(0, parseInt(body.setCredits));
    const _delta2 = users[idx].credits - _prev;
    if (_delta2 !== 0) logCreditTransaction(userId, _delta2, 'Admin set balance', users[idx].credits);
  }
  writeJSON(USERS_FILE, users);
  const { passwordHash, ...safe } = users[idx];
  json(res, 200, { user: safe });
}

async function handleAdminDeleteUser(req, res, userId) {
  const admin = requireAdmin(req, res);
  if (!admin) return;
  if (admin.id === userId) return json(res, 400, { error: 'Cannot delete your own account.' });
  const users = readJSON(USERS_FILE);
  const idx   = users.findIndex(u => u.id === userId);
  if (idx === -1) return json(res, 404, { error: 'User not found.' });
  users.splice(idx, 1);
  writeJSON(USERS_FILE, users);
  json(res, 200, { ok: true });
}

async function handleAdminResetPassword(req, res, userId) {
  if (!requireAdmin(req, res)) return;
  const body = await readBody(req);
  const { password } = body;
  if (!password || password.length < 6)
    return json(res, 400, { error: 'Password must be at least 6 characters.' });
  const users = readJSON(USERS_FILE);
  const idx   = users.findIndex(u => u.id === userId);
  if (idx === -1) return json(res, 404, { error: 'User not found.' });
  users[idx].passwordHash = await hashPassword(password);
  writeJSON(USERS_FILE, users);
  json(res, 200, { ok: true });
}

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
