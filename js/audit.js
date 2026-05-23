/* ── eureach.eu — AI Visibility Audit ──────────────────── */

let audits       = [];
let currentAudit = null;
let shareLang    = "el";

const BREAKDOWN_LABELS = {
  ai_visibility:      "AI Visibility",
  content_quality:    "Content Quality",
  local_seo:          "Local SEO",
  schema_markup:      "Schema Markup",
  citation_readiness: "Citation Readiness",
};

const OUTREACH_MSGS = {
  el: url => `Έτρεξα το AI visibility score της επιχείρησής σας — δείτε πού βρίσκεστε:\n${url}`,
  en: url => `I ran an AI visibility audit for your business — see where you stand:\n${url}`,
  de: url => `Ich habe einen AI-Sichtbarkeits-Audit für Ihr Unternehmen durchgeführt — sehen Sie, wie Sie abschneiden:\n${url}`,
};

/* ── DOM refs ────────────────────────────────────────────── */
const form      = document.getElementById("au-form");
const bizName   = document.getElementById("au-name");
const bizUrl    = document.getElementById("au-url");
const bizIndustry = document.getElementById("au-industry");
const runBtn    = document.getElementById("au-run-btn");
const formErr   = document.getElementById("au-form-err");
const mainEl    = document.getElementById("au-main");
const histList  = document.getElementById("au-history-list");
const limitBanner = document.getElementById("au-limit-banner");

/* ── Helpers ────────────────────────────────────────────── */
function esc(s) {
  const d = document.createElement("div");
  d.textContent = String(s || "");
  return d.innerHTML;
}

function scoreColor(n) {
  if (n >= 70) return "score-green";
  if (n >= 40) return "score-orange";
  return "score-red";
}

function scoreBlurb(n) {
  if (n >= 80) return "Strong AI search visibility. This business is well-positioned to appear in ChatGPT, Perplexity, and Google AI results.";
  if (n >= 60) return "Moderate AI visibility. Targeted improvements could significantly boost presence in AI-powered search results.";
  if (n >= 40) return "Limited AI visibility. Clear opportunities exist to improve how AI search engines discover and cite this business.";
  return "Weak AI visibility. This business is largely invisible to AI-powered search engines. Immediate action is recommended.";
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function copyText(text) {
  return navigator.clipboard.writeText(text).catch(() => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  });
}

/* ── Load audits ─────────────────────────────────────────── */
async function loadAudits() {
  try {
    const res  = await fetch("/api/audit");
    if (res.status === 401) { showAuthNotice(); return; }
    if (!res.ok) return;
    const data = await res.json();
    audits = data.audits || [];
    audits.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    renderHistory();
  } catch {
    renderHistory();
  }
}

/* ── Load user caps (audit limit) ────────────────────────── */
async function loadUserCaps() {
  try {
    const res  = await fetch("/api/auth/me");
    if (!res.ok) return;
    const { user } = await res.json();
    if (!user) return;
    if (user.auditsLeft === 0) {
      limitBanner.style.display = "";
      runBtn.disabled = true;
      runBtn.textContent = "Upgrade to Run Audit";
    }
  } catch {}
}

/* ── Render history ──────────────────────────────────────── */
function renderHistory() {
  if (!audits.length) {
    histList.innerHTML = `<div class="au-history-empty">No audits yet.<br>Run your first audit above.</div>`;
    return;
  }
  histList.innerHTML = "";
  audits.forEach(a => {
    const cls  = scoreColor(a.score);
    const item = document.createElement("div");
    item.className = "au-history-item" + (currentAudit && currentAudit.id === a.id ? " active" : "");
    item.dataset.id = a.id;

    const viewsHtml = a.shareEnabled && a.shareViews > 0
      ? `<span class="au-hist-views">👁 ${a.shareViews}</span>`
      : "";

    item.innerHTML = `
      <div class="au-hist-score ${cls}">${a.score}</div>
      <div class="au-hist-info">
        <div class="au-hist-name">${esc(a.businessName)}</div>
        <div class="au-hist-meta">${fmtDate(a.createdAt)}</div>
      </div>
      ${viewsHtml}
      <button class="au-hist-delete" data-id="${esc(a.id)}" title="Delete">✕</button>`;

    item.addEventListener("click", e => {
      if (e.target.classList.contains("au-hist-delete")) return;
      currentAudit = a;
      renderHistory();
      renderReport(a);
    });
    item.querySelector(".au-hist-delete").addEventListener("click", e => {
      e.stopPropagation();
      deleteAudit(a.id, a.businessName);
    });

    histList.appendChild(item);
  });
}

/* ── Run audit ───────────────────────────────────────────── */
form.addEventListener("submit", async e => {
  e.preventDefault();
  const name = bizName.value.trim();
  if (!name) {
    formErr.textContent = "Business name is required.";
    formErr.classList.add("visible");
    bizName.focus();
    return;
  }
  formErr.classList.remove("visible");
  runBtn.disabled = true;
  runBtn.textContent = "Analyzing…";

  showLoading(name);

  try {
    const res = await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessName: name,
        businessUrl:  bizUrl.value.trim(),
        industry:     bizIndustry.value,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      if (res.status === 403 && data.error === "limit_reached") {
        showLimitError();
      } else {
        showMainError(data.error || "Audit failed. Please try again.");
      }
      return;
    }

    currentAudit = data.audit;
    audits.unshift(data.audit);
    renderHistory();
    renderReport(data.audit);
    bizName.value = "";
    bizUrl.value  = "";
    bizIndustry.value = "";

    // Refresh caps (decrement counter)
    loadUserCaps();
  } catch {
    showMainError("Network error. Please try again.");
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = "Run Audit →";
  }
});

/* ── Delete audit ────────────────────────────────────────── */
async function deleteAudit(id, name) {
  if (!confirm(`Delete audit for "${name}"?`)) return;
  try {
    const res = await fetch(`/api/audit/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    audits = audits.filter(a => a.id !== id);
    if (currentAudit && currentAudit.id === id) {
      currentAudit = null;
      showEmpty();
    }
    renderHistory();
  } catch {}
}

/* ── Render report ───────────────────────────────────────── */
function renderReport(audit) {
  const cls   = scoreColor(audit.score);
  const bd    = audit.breakdown || {};

  const breakdownRows = Object.keys(BREAKDOWN_LABELS).filter(k => bd[k] !== undefined).map(k => {
    const val = bd[k];
    const c   = scoreColor(val);
    return `
    <div class="au-bd-row">
      <span class="au-bd-label">${BREAKDOWN_LABELS[k]}</span>
      <div class="au-bd-track"><div class="au-bd-fill ${c}" style="width:${val}%"></div></div>
      <span class="au-bd-val ${c}">${val}</span>
    </div>`;
  }).join("");

  const listHTML = (arr, clsName) => arr && arr.length
    ? `<ul class="au-list ${clsName}">${arr.map(s => `<li>${esc(s)}</li>`).join("")}</ul>`
    : "";

  const industryLabel = audit.industry
    ? `<span class="au-meta-tag">${esc(audit.industry.replace(/_/g, " "))}</span>`
    : "";

  mainEl.innerHTML = `
  <div class="au-report" id="au-report">
    <div class="au-report-header">
      <div class="au-report-biz-name">${esc(audit.businessName)}</div>
      ${audit.businessUrl ? `<div class="au-report-biz-url"><a href="https://${esc(audit.businessUrl)}" target="_blank" rel="noopener">${esc(audit.businessUrl)} ↗</a></div>` : ""}
      <div class="au-report-meta">
        ${industryLabel}
        <span class="au-meta-tag">Audited ${fmtDate(audit.createdAt)}</span>
      </div>
    </div>

    <div class="au-score-hero">
      <div class="au-score-circle ${cls}">
        <span class="au-score-num ${cls}">${audit.score}</span>
        <span class="au-score-denom">/100</span>
      </div>
      <div class="au-score-desc">
        <div class="au-score-label">AI Visibility Score</div>
        <div class="au-score-blurb">${scoreBlurb(audit.score)}</div>
      </div>
    </div>

    ${breakdownRows ? `<div class="au-section"><div class="au-section-title">Score Breakdown</div>${breakdownRows}</div>` : ""}

    ${(audit.strengths || []).length ? `<div class="au-section"><div class="au-section-title">Strengths</div>${listHTML(audit.strengths, "au-strengths")}</div>` : ""}
    ${(audit.weaknesses || []).length ? `<div class="au-section"><div class="au-section-title">Weaknesses</div>${listHTML(audit.weaknesses, "au-weaknesses")}</div>` : ""}
    ${(audit.recommendations || []).length ? `<div class="au-section"><div class="au-section-title">Recommendations</div>${listHTML(audit.recommendations, "au-recs")}</div>` : ""}

    <div class="au-share-panel" id="au-share-panel">
      <div class="au-share-panel-title">🔗 Share This Report</div>

      <div class="au-share-pre" id="au-share-pre" ${audit.shareEnabled ? 'style="display:none"' : ""}>
        <button class="au-share-btn" id="au-share-create-btn">Create Share Link</button>
        <span style="font-size:0.8rem;color:var(--muted)">Send to prospects — they don't need an account</span>
      </div>

      <div class="au-share-active${audit.shareEnabled ? " visible" : ""}" id="au-share-active">
        <div class="au-share-url-row">
          <input type="text" class="au-share-url-input" id="au-share-url-input"
            value="${audit.shareEnabled ? `https://eureach.eu/audit/share/${esc(audit.shareToken)}` : ""}"
            readonly>
          <button class="au-copy-btn" id="au-copy-url-btn">Copy</button>
        </div>
        <div class="au-share-meta">
          <div class="au-view-badge">👁 Viewed <strong id="au-view-count">${audit.shareViews || 0}</strong> times</div>
          <button class="au-disable-btn" id="au-disable-share-btn">Disable sharing</button>
        </div>
        <div class="au-outreach-box">
          <div class="au-outreach-box-title">Pre-written outreach message</div>
          <div class="au-lang-toggle">
            <button class="au-lang-btn${shareLang === "el" ? " active" : ""}" data-lang="el">🇬🇷 Greek</button>
            <button class="au-lang-btn${shareLang === "en" ? " active" : ""}" data-lang="en">🇬🇧 English</button>
            <button class="au-lang-btn${shareLang === "de" ? " active" : ""}" data-lang="de">🇩🇪 German</button>
          </div>
          <div class="au-outreach-text" id="au-outreach-text"></div>
          <button class="au-copy-btn" id="au-copy-outreach-btn">Copy Message</button>
        </div>
      </div>
    </div>
  </div>`;

  // Wire share buttons
  const createBtn  = document.getElementById("au-share-create-btn");
  const copyUrlBtn = document.getElementById("au-copy-url-btn");
  const disableBtn = document.getElementById("au-disable-share-btn");
  const outreachEl = document.getElementById("au-outreach-text");
  const copyMsgBtn = document.getElementById("au-copy-outreach-btn");

  if (createBtn) createBtn.addEventListener("click", () => createShare(audit.id));

  if (copyUrlBtn) {
    copyUrlBtn.addEventListener("click", () => {
      copyText(document.getElementById("au-share-url-input").value).then(() => {
        copyUrlBtn.textContent = "✓ Copied!";
        copyUrlBtn.classList.add("copied");
        setTimeout(() => { copyUrlBtn.textContent = "Copy"; copyUrlBtn.classList.remove("copied"); }, 2000);
      });
    });
  }

  if (disableBtn) disableBtn.addEventListener("click", () => disableShare(audit.id));

  // Lang toggle & outreach message
  if (outreachEl) updateOutreachMsg(outreachEl, audit);
  document.querySelectorAll(".au-lang-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      shareLang = btn.dataset.lang;
      document.querySelectorAll(".au-lang-btn").forEach(b => b.classList.toggle("active", b.dataset.lang === shareLang));
      if (outreachEl) updateOutreachMsg(outreachEl, audit);
    });
  });

  if (copyMsgBtn) {
    copyMsgBtn.addEventListener("click", () => {
      copyText(outreachEl.textContent).then(() => {
        copyMsgBtn.textContent = "✓ Copied!";
        copyMsgBtn.classList.add("copied");
        setTimeout(() => { copyMsgBtn.textContent = "Copy Message"; copyMsgBtn.classList.remove("copied"); }, 2000);
      });
    });
  }
}

function updateOutreachMsg(el, audit) {
  const url     = audit.shareToken ? `https://eureach.eu/audit/share/${audit.shareToken}` : "[share link]";
  const fn      = OUTREACH_MSGS[shareLang] || OUTREACH_MSGS.en;
  el.textContent = fn(url);
}

/* ── Create share link ───────────────────────────────────── */
async function createShare(id) {
  const btn = document.getElementById("au-share-create-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Generating…"; }

  try {
    const res  = await fetch(`/api/audit/${id}/share`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      if (btn) { btn.disabled = false; btn.textContent = "Create Share Link"; }
      return;
    }

    // Update local record
    const idx = audits.findIndex(a => a.id === id);
    if (idx !== -1) {
      audits[idx].shareToken   = data.shareToken;
      audits[idx].shareEnabled = true;
      audits[idx].shareViews   = data.shareViews || 0;
      currentAudit = audits[idx];
    }

    // Show active panel
    const pre    = document.getElementById("au-share-pre");
    const active = document.getElementById("au-share-active");
    const urlIn  = document.getElementById("au-share-url-input");
    if (pre)    pre.style.display = "none";
    if (active) active.classList.add("visible");
    if (urlIn)  urlIn.value = data.shareUrl;

    // Update outreach message
    const outEl = document.getElementById("au-outreach-text");
    if (outEl && currentAudit) updateOutreachMsg(outEl, currentAudit);

    renderHistory();
  } catch {
    if (btn) { btn.disabled = false; btn.textContent = "Create Share Link"; }
  }
}

/* ── Disable sharing ─────────────────────────────────────── */
async function disableShare(id) {
  if (!confirm("Disable sharing? The share link will stop working.")) return;
  try {
    const res = await fetch(`/api/audit/${id}/share`, { method: "DELETE" });
    if (!res.ok) return;
    const idx = audits.findIndex(a => a.id === id);
    if (idx !== -1) {
      audits[idx].shareToken   = null;
      audits[idx].shareEnabled = false;
      currentAudit = audits[idx];
    }
    renderReport(currentAudit);
    renderHistory();
  } catch {}
}

/* ── UI states ───────────────────────────────────────────── */
function showEmpty() {
  mainEl.innerHTML = `
  <div class="au-empty">
    <div class="au-empty-icon">🔭</div>
    <div class="au-empty-title">Run your first AI Visibility Audit</div>
    <div class="au-empty-sub">Enter any business name and we'll score how visible they are in ChatGPT, Perplexity, and Google AI results.</div>
  </div>`;
}

function showLoading(name) {
  mainEl.innerHTML = `
  <div class="au-loading">
    <div class="au-loading-spinner"></div>
    <div class="au-loading-title">Analyzing AI visibility…</div>
    <div class="au-loading-sub">Scoring ${esc(name)} across 5 AI search dimensions</div>
  </div>`;
}

function showMainError(msg) {
  mainEl.innerHTML = `
  <div class="au-empty">
    <div class="au-empty-icon">⚠️</div>
    <div class="au-empty-title">Audit failed</div>
    <div class="au-empty-sub">${esc(msg)}</div>
  </div>`;
}

function showLimitError() {
  mainEl.innerHTML = `
  <div class="au-empty">
    <div class="au-empty-icon">🔒</div>
    <div class="au-empty-title">Audit limit reached</div>
    <div class="au-empty-sub">Free plan includes 1 lifetime audit. <a href="membership.html" style="color:var(--blue2)">Upgrade to run more →</a></div>
  </div>`;
  runBtn.disabled = true;
  runBtn.textContent = "Upgrade to Run More";
  if (limitBanner) limitBanner.style.display = "";
}

function showAuthNotice() {
  mainEl.innerHTML = `
  <div class="au-empty">
    <div class="au-empty-icon">🔒</div>
    <div class="au-empty-title">Sign in to run audits</div>
    <div class="au-empty-sub"><a href="signin.html" style="color:var(--blue2)">Sign in</a> to access the AI Visibility Audit.</div>
  </div>`;
  form.querySelector("button").disabled = true;
}

/* ── Init ────────────────────────────────────────────── */
showEmpty();
loadAudits();
loadUserCaps();
