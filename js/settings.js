/* ── eureach.eu — Settings: My Sites ────────────────── */
let MAX_SITES = 3;
let USER_PLAN = 'free';
const STORE_KEY = "eureach_sites"; // used only for one-time migration

let _sites = []; // in-memory cache, always synced to server

/* ── Server API helpers ──────────────────────────────── */
async function serverLoadSites() {
  try {
    const r = await fetch('/api/sites');
    if (!r.ok) return null;
    const d = await r.json();
    return Array.isArray(d.sites) ? d.sites : null;
  } catch { return null; }
}

async function serverSaveSites(sites) {
  await fetch('/api/sites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sites }),
  });
}

async function serverDeleteSite(id) {
  await fetch(`/api/sites/${id}`, { method: 'DELETE' });
}

/* ── Init: load from server, migrate localStorage if empty ── */
async function initSites() {
  // Fetch plan info and sites in parallel
  const [meRes, serverSites] = await Promise.all([
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).catch(() => null),
    serverLoadSites(),
  ]);

  if (meRes?.user) {
    if (meRes.user.sitesMax !== undefined) {
      MAX_SITES = meRes.user.sitesMax === -1 ? 999 : meRes.user.sitesMax;
    }
    USER_PLAN = meRes.user.plan || 'free';
  }

  if (serverSites !== null && serverSites.length > 0) {
    // Server has data — use it, clear stale localStorage
    _sites = serverSites;
    localStorage.removeItem(STORE_KEY);
  } else if (serverSites !== null && serverSites.length === 0) {
    // Server returned empty — migrate from localStorage if anything there
    const local = (() => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); } catch { return []; } })();
    if (local.length > 0) {
      _sites = local;
      await serverSaveSites(_sites);
      localStorage.removeItem(STORE_KEY);
    } else {
      _sites = [];
    }
  } else {
    // Server unreachable — fall back to localStorage temporarily
    try { _sites = JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); } catch { _sites = []; }
  }

  renderSites();
}

/* ── Render site cards ───────────────────────────────── */
function renderSites() {
  const sites  = _sites;
  const grid   = document.getElementById("st-sites-grid");
  const addBtn = document.getElementById("st-add-btn");

  addBtn.disabled = sites.length >= MAX_SITES;
  addBtn.title    = sites.length >= MAX_SITES ? `Site limit reached for your current plan` : "";

  if (!sites.length) {
    grid.innerHTML = `
      <div class="st-empty-sites">
        <div class="st-empty-icon">🌐</div>
        <div class="st-empty-title">No sites added yet</div>
        <div class="st-empty-sub">Add your first website to start generating tailored articles.</div>
        <button class="st-add-btn-inline" onclick="openModal()">+ Add your first site</button>
      </div>`;
    return;
  }

  grid.innerHTML = sites.map((s, i) => `
    <div class="st-site-card" data-id="${s.id}">
      <div class="st-site-card-top">
        <div class="st-site-favicon">${faviconLetter(s.domain)}</div>
        <div class="st-site-info">
          <div class="st-site-name">${esc(s.name || s.domain)}</div>
          <div class="st-site-domain">${esc(s.domain)}</div>
        </div>
        <div class="st-site-badge">Site ${i + 1} of ${MAX_SITES}</div>
      </div>
      <div class="st-site-meta">
        <div class="st-site-meta-row">
          <span class="st-meta-label">Languages</span>
          <span>${(s.languages || []).map(l => langFlag(l) + " " + l).join(" · ") || "—"}</span>
        </div>
        <div class="st-site-meta-row">
          <span class="st-meta-label">Niche</span>
          <span>${esc(s.niche || "—")}</span>
        </div>
        <div class="st-site-meta-row">
          <span class="st-meta-label">Audience</span>
          <span>${esc(s.audience || "—")}</span>
        </div>
        <div class="st-site-meta-row">
          <span class="st-meta-label">Geo Focus</span>
          <span>${esc(s.geo || "—")}</span>
        </div>
        ${s.tones?.length ? `<div class="st-site-meta-row"><span class="st-meta-label">Tone</span><span>${s.tones.map(t => `<span class="st-tone-pill">${esc(t)}</span>`).join("")}</span></div>` : ""}
      </div>
      <div class="st-site-actions">
        <button class="st-site-btn" onclick="openModal(${s.id})">✏ Edit</button>
        <button class="st-site-btn st-site-btn-danger" onclick="deleteSite(${s.id})" ${USER_PLAN === 'free' ? 'disabled title="Upgrade to remove sites"' : ''} style="${USER_PLAN === 'free' ? 'opacity:0.35;cursor:not-allowed' : ''}">🗑 Remove</button>
        <button class="st-site-btn st-site-btn-audit" data-site-id="${s.id}">🔍 Audit</button>
        <button class="st-site-btn st-site-btn-improve" onclick="openImproveModal(${s.id})">💡 How to improve</button>
      </div>
    </div>`).join("");
}

function faviconLetter(domain) {
  const clean = (domain || "").replace(/^www\./, "");
  return (clean[0] || "?").toUpperCase();
}

function langFlag(lang) {
  return { Greek: "🇬🇷", English: "🇬🇧", German: "🇩🇪" }[lang] || "🌐";
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = String(s || "");
  return d.innerHTML;
}

/* ── Modal open / close ──────────────────────────────── */
let editingId = null;

function openModal(id) {
  const sites = _sites;
  editingId = id || null;

  const form  = document.getElementById("st-site-form");
  const title = document.getElementById("st-modal-title");

  form.reset();
  document.querySelectorAll("#st-lang-chips input, #st-tone-chips input").forEach(c => c.checked = false);

  if (id) {
    const site = sites.find(s => s.id === id);
    if (!site) return;
    title.textContent = "Edit Site";
    document.getElementById("st-domain").value   = site.domain || "";
    document.getElementById("st-name").value     = site.name   || "";
    document.getElementById("st-niche").value    = site.niche  || "";
    document.getElementById("st-audience").value = site.audience || "";
    document.getElementById("st-geo").value      = site.geo    || "";
    (site.languages || []).forEach(l => {
      const cb = document.querySelector(`#st-lang-chips input[value="${l}"]`);
      if (cb) cb.checked = true;
    });
    (site.tones || []).forEach(t => {
      const cb = document.querySelector(`#st-tone-chips input[value="${t}"]`);
      if (cb) cb.checked = true;
    });
  } else {
    title.textContent = "Add Site";
    const engCb = document.querySelector('#st-lang-chips input[value="English"]');
    if (engCb) engCb.checked = true;
    const profCb = document.querySelector('#st-tone-chips input[value="Professional"]');
    if (profCb) profCb.checked = true;
  }

  document.getElementById("st-modal").classList.add("open");
  document.getElementById("st-overlay").classList.add("open");
  document.getElementById("st-domain").focus();
}

function closeModal() {
  document.getElementById("st-modal").classList.remove("open");
  document.getElementById("st-overlay").classList.remove("open");
  editingId = null;
}

document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

/* ── Save site ───────────────────────────────────────── */
async function saveSite(e) {
  e.preventDefault();

  const langs = [...document.querySelectorAll("#st-lang-chips input:checked")].map(c => c.value);
  if (!langs.length) { alert("Please select at least one language."); return; }

  const tones = [...document.querySelectorAll("#st-tone-chips input:checked")].map(c => c.value);

  let domain = document.getElementById("st-domain").value.trim();
  domain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");

  const site = {
    id:        editingId || Date.now(),
    domain,
    name:      document.getElementById("st-name").value.trim() || domain,
    languages: langs,
    niche:     document.getElementById("st-niche").value,
    audience:  document.getElementById("st-audience").value.trim(),
    geo:       document.getElementById("st-geo").value.trim(),
    tones,
    addedAt:   editingId ? (_sites.find(s => s.id === editingId)?.addedAt || new Date().toISOString()) : new Date().toISOString(),
  };

  if (editingId) {
    const idx = _sites.findIndex(s => s.id === editingId);
    if (idx !== -1) _sites[idx] = site;
  } else {
    if (_sites.length >= MAX_SITES) {
      alert(`You have reached the site limit for your current plan. Upgrade to add more.`);
      return;
    }
    _sites.push(site);
  }

  await serverSaveSites(_sites);
  closeModal();
  renderSites();
  showToast(editingId ? "Site updated" : "Site added");
}

/* ── Delete site ─────────────────────────────────────── */
async function deleteSite(id) {
  const site = _sites.find(s => s.id === id);
  if (!site) return;
  if (!confirm(`Remove "${site.name || site.domain}" from your sites?`)) return;
  _sites = _sites.filter(s => s.id !== id);
  await serverDeleteSite(id);
  renderSites();
  showToast("Site removed");
}

/* ── Toast ───────────────────────────────────────────── */
function showToast(msg) {
  const t = document.createElement("div");
  t.className = "st-toast";
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2500);
}

/* ── Site Audit ──────────────────────────────────────── */
async function runSiteAudit(site) {
  const panel   = document.getElementById('site-audit-panel');
  const content = document.getElementById('site-audit-content');
  const title   = document.getElementById('site-audit-title');
  if (!panel) return;

  panel.style.display = 'block';
  title.textContent   = site.name || site.domain;
  content.innerHTML   = `<div class="audit-loading"><div class="audit-spinner"></div><div class="audit-loading-text">Analysing ${site.domain}…</div></div>`;
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  try {
    const res  = await fetch('/api/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessName: site.name || site.domain, businessUrl: site.domain, industry: site.niche || '' }) });
    const data = await res.json();
    if (!res.ok) { content.innerHTML = `<div style="color:#f87171;font-size:.82rem;padding:8px 0">${data.error || 'Audit failed.'}</div>`; return; }

    const a = data.audit;
    const scoreColor = a.score >= 70 ? '#4ade80' : a.score >= 45 ? '#fbbf24' : '#f87171';
    const grade = a.score >= 80 ? 'Excellent' : a.score >= 65 ? 'Good' : a.score >= 45 ? 'Average' : 'Needs work';
    const bkLabels = { ai_visibility:'AI Visibility', content_quality:'Content', local_seo:'Local SEO', schema_markup:'Schema', citation_readiness:'Citations' };
    const bkColors = { ai_visibility:'#2563eb', content_quality:'#7c3aed', local_seo:'#0891b2', schema_markup:'#16a34a', citation_readiness:'#d97706' };

    const bkHtml = Object.entries(a.breakdown || {}).map(([k,v]) => `
      <div class="audit-bk-item">
        <div class="audit-bk-top"><span class="audit-bk-lbl">${bkLabels[k]||k}</span><span class="audit-bk-val">${v}</span></div>
        <div class="audit-bk-bar"><div class="audit-bk-fill" style="width:${v}%;background:${bkColors[k]||'#2563eb'}"></div></div>
      </div>`).join('');

    const listHtml = (items, icon, color) => (items||[]).map(s=>`<li><span style="color:${color};flex-shrink:0">${icon}</span>${s}</li>`).join('');

    content.innerHTML = `
      <div class="audit-score-ring">
        <div class="audit-score-circle" style="border-color:${scoreColor}">
          <div class="audit-score-num" style="color:${scoreColor}">${a.score}</div>
          <div class="audit-score-label">/ 100</div>
        </div>
        <div class="audit-score-right">
          <div class="audit-score-grade" style="font-size:.95rem;font-weight:700;color:var(--white)">${grade}</div>
          <div class="audit-score-grade">${site.domain}</div>
        </div>
      </div>
      <div class="audit-breakdown">${bkHtml}</div>
      ${a.strengths?.length ? `<div class="audit-section-title">Strengths</div><ul class="audit-list">${listHtml(a.strengths,'✓','#4ade80')}</ul>` : ''}
      ${a.weaknesses?.length ? `<div class="audit-section-title">Weaknesses</div><ul class="audit-list">${listHtml(a.weaknesses,'✗','#f87171')}</ul>` : ''}
      ${a.recommendations?.length ? `<div class="audit-section-title">Recommendations</div><ul class="audit-list">${listHtml(a.recommendations,'→','#fbbf24')}</ul>` : ''}
      <a href="audit.html" class="audit-view-link">View all audits →</a>`;
  } catch { content.innerHTML = `<div style="color:#f87171;font-size:.82rem;padding:8px 0">Network error. Please try again.</div>`; }
}

document.addEventListener('click', function(e) {
  const btn = e.target.closest('.st-site-btn-audit');
  if (!btn) return;
  const id = Number(btn.dataset.siteId);
  if (!id) return;
  const site = _sites.find(s => s.id === id);
  if (site) runSiteAudit(site);
});

window.runSiteAudit = runSiteAudit;

/* ── How to Improve modal ────────────────────────────── */
const IMPROVE_TIPS = {
  default: [
    { icon: "🤖", title: "Get found in AI search", text: "Run an AI Visibility Audit to see if ChatGPT, Gemini and Perplexity mention your business.", link: "audit.html", linkText: "Run audit →" },
    { icon: "🔍", title: "Track your competitors", text: "See how you score vs competitors and identify gaps in content and visibility.", link: "competitors.html", linkText: "Open Competitor Tracker →" },
    { icon: "✍️", title: "Publish AI-optimised articles", text: "Regular articles in your local language help AI models discover and recommend your business.", link: "articles.html", linkText: "Generate articles →" },
    { icon: "📍", title: "Claim and complete your Google Business Profile", text: "A complete GBP with photos, posts and Q&A is the #1 signal for local AI search." },
    { icon: "⭐", title: "Get more reviews", text: "Ask every satisfied customer for a Google review. Volume and recency both matter for AI visibility." },
    { icon: "🔗", title: "Build local citations", text: "List your business on local directories (Yelp, TripAdvisor, industry-specific sites) with consistent NAP (Name, Address, Phone)." },
    { icon: "🌐", title: "Add schema markup", text: "Add LocalBusiness JSON-LD schema to your website. AI crawlers use structured data to understand your business." },
    { icon: "📱", title: "Make your site mobile-fast", text: "Page speed under 3 seconds on mobile is a key ranking factor. Test at pagespeed.web.dev." },
  ],
  "Restaurant & Dining":    [
    { icon: "🍽️", title: "Add your menu online", text: "Upload your full menu to Google Business Profile and your website. AI recommends restaurants that clearly list dishes and prices." },
    { icon: "📸", title: "Post food photos weekly", text: "Fresh Google Business photos significantly improve AI and local search visibility." },
    { icon: "🗓️", title: "Enable online reservations", text: "Integrate a booking system. AI assistants surface restaurants with easy booking options first." },
  ],
  "Hotel & Accommodation":  [
    { icon: "🏨", title: "Respond to every review", text: "Hotels that respond to reviews rank higher in AI-powered travel recommendations." },
    { icon: "📅", title: "Keep availability updated", text: "Sync your booking calendar across all platforms. Inconsistency kills AI recommendations." },
  ],
  "Digital Marketing":      [
    { icon: "📊", title: "Publish case studies", text: "AI tools recommend agencies that demonstrate measurable results. Publish client case studies on your site." },
    { icon: "🎯", title: "Define your niche clearly", text: "Agencies specialising in a specific industry or service rank better in AI recommendations than generalists." },
  ],
  "SaaS / Software":        [
    { icon: "📖", title: "Invest in documentation", text: "Comprehensive docs and tutorials help AI models understand and recommend your product." },
    { icon: "🔄", title: "Show G2 / Capterra reviews", text: "Software review platforms are heavily weighted by AI assistants. Actively collect reviews there." },
  ],
};

function getImproveTips(niche) {
  return [...(IMPROVE_TIPS[niche] || []), ...IMPROVE_TIPS.default].slice(0, 8);
}

function openImproveModal(siteId) {
  const site = _sites.find(s => String(s.id) === String(siteId));
  if (!site) return;

  const tips = getImproveTips(site.niche || "");
  let existing = document.getElementById("st-improve-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "st-improve-overlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:9000;background:rgba(2,8,23,0.8);display:flex;align-items:center;justify-content:center;padding:20px";
  overlay.innerHTML = `
    <div style="background:#0f172a;border:1px solid rgba(255,255,255,0.1);border-radius:16px;max-width:560px;width:100%;max-height:85vh;display:flex;flex-direction:column;overflow:hidden">
      <div style="padding:20px 24px 16px;border-bottom:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:1rem;font-weight:700;color:#fff">💡 How to improve</div>
          <div style="font-size:0.8rem;color:var(--muted,#64748b);margin-top:2px">${esc(site.name || site.domain)}${site.niche ? ' · ' + esc(site.niche) : ''}</div>
        </div>
        <button onclick="document.getElementById('st-improve-overlay').remove()" style="background:none;border:none;color:#64748b;font-size:1.2rem;cursor:pointer;padding:4px 8px">✕</button>
      </div>
      <div style="overflow-y:auto;padding:20px 24px;display:flex;flex-direction:column;gap:14px">
        ${tips.map(t => `
          <div style="display:flex;gap:14px;align-items:flex-start">
            <div style="font-size:1.4rem;min-width:32px;text-align:center">${t.icon}</div>
            <div>
              <div style="font-size:0.88rem;font-weight:600;color:#e2e8f0;margin-bottom:3px">${esc(t.title)}</div>
              <div style="font-size:0.8rem;color:#94a3b8;line-height:1.5">${esc(t.text)}</div>
              ${t.link ? `<a href="${t.link}" style="font-size:0.78rem;color:var(--blue2,#60a5fa);text-decoration:none;margin-top:4px;display:inline-block">${esc(t.linkText)}</a>` : ""}
            </div>
          </div>`).join("")}
      </div>
    </div>`;
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

window.openImproveModal = openImproveModal;

/* ── Init ────────────────────────────────────────────── */
initSites();
