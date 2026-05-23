/* ── eureach.eu — Competitor Tracker ──────────────────── */

let competitors = [];

/* ── DOM refs ────────────────────────────────────────── */
const overlay   = document.getElementById("ct-overlay");
const modal     = document.getElementById("ct-modal");
const addBtn    = document.getElementById("ct-add-btn");
const emptyAddBtn = document.getElementById("ct-empty-add-btn");
const closeBtn  = document.getElementById("ct-modal-close");
const cancelBtn = document.getElementById("ct-modal-cancel");
const saveBtn   = document.getElementById("ct-modal-save");
const modalErr  = document.getElementById("ct-modal-err");
const board     = document.getElementById("ct-board");

const reportOverlay = document.getElementById("ct-report-overlay");
const reportModal   = document.getElementById("ct-report-modal");
const reportClose   = document.getElementById("ct-report-close");
const reportDone    = document.getElementById("ct-report-done");
const reportPrint   = document.getElementById("ct-report-print");
const reportBody    = document.getElementById("ct-report-body");
const reportTitle   = document.getElementById("ct-report-title");

/* ── Load ────────────────────────────────────────────── */
async function load() {
  try {
    const res = await fetch("/api/competitor/track");
    if (res.status === 401) { showAuthNotice(); return; }
    if (!res.ok) return;
    const data = await res.json();
    competitors = data.competitors || [];
    render();
  } catch {
    render();
  }
}

/* ── Render board ────────────────────────────────────── */
function render() {
  const empty = document.getElementById("ct-empty");

  // Stats
  document.getElementById("stat-total").textContent  = competitors.length;
  const alerts = competitors.filter(c => c.alert).length;
  document.getElementById("stat-alerts").textContent  = alerts;
  if (competitors.length) {
    const scores = competitors.map(c => latestScore(c)).filter(s => s !== null);
    const avg    = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : "—";
    document.getElementById("stat-avg").textContent = avg;
  } else {
    document.getElementById("stat-avg").textContent = "—";
  }

  if (!competitors.length) {
    board.innerHTML = "";
    board.appendChild(document.getElementById("ct-empty") || createEmpty());
    if (empty) empty.style.display = "";
    return;
  }

  if (empty) empty.style.display = "none";

  // Remove existing cards (preserve empty node)
  Array.from(board.children).forEach(el => { if (!el.id || el.id !== "ct-empty") el.remove(); });

  competitors.forEach(comp => {
    const card = buildCard(comp);
    board.appendChild(card);
  });
}

function latestScore(comp) {
  if (!comp.snapshots || !comp.snapshots.length) return null;
  return comp.snapshots[comp.snapshots.length - 1].score;
}

function latestSnap(comp) {
  if (!comp.snapshots || !comp.snapshots.length) return null;
  return comp.snapshots[comp.snapshots.length - 1];
}

function scoreColor(n) {
  if (n >= 70) return "score-green";
  if (n >= 40) return "score-orange";
  return "score-red";
}

function barColor(n) { return scoreColor(n); }

const BREAKDOWN_LABELS = {
  ai_visibility:     "AI Visibility",
  content_quality:   "Content Quality",
  local_seo:         "Local SEO",
  schema_markup:     "Schema Markup",
  citation_readiness:"Citation Readiness",
};

function buildCard(comp) {
  const card = document.createElement("div");
  card.className = "ct-card" + (comp.alert ? " ct-card-alert" : "");
  card.dataset.id = comp.id;

  const snap    = latestSnap(comp);
  const score   = snap ? snap.score : null;
  const clsNum  = score !== null ? scoreColor(score) : "score-orange";
  const checked = snap ? fmtDate(snap.date) : "Never";

  // Header
  card.innerHTML = `
  <div class="ct-card-header">
    <div>
      <div class="ct-card-name">${esc(comp.competitorName)}</div>
      ${comp.competitorUrl ? `<div class="ct-card-url"><a href="https://${esc(comp.competitorUrl)}" target="_blank" rel="noopener">${esc(comp.competitorUrl)}</a></div>` : ""}
    </div>
    <div class="ct-card-badges">
      ${comp.alert ? `<span class="ct-alert-badge">⚠ Score Drop</span>` : ""}
      ${comp.industry ? `<span class="ct-industry-tag">${esc(comp.industry.replace("_", " "))}</span>` : ""}
    </div>
  </div>

  <div class="ct-score-section">
    <div class="ct-score-big">
      <span class="ct-score-num ${clsNum}">${score !== null ? score : "—"}</span>
      <span class="ct-score-denom">/100</span>
    </div>
    <div class="ct-score-meta">
      <div class="ct-last-checked">Last checked: ${esc(checked)}</div>
    </div>
  </div>

  ${snap && snap.breakdown ? buildBreakdown(snap.breakdown) : ""}
  ${buildChart(comp)}

  <div class="ct-card-footer">
    <button class="ct-btn ct-check-btn" data-id="${esc(comp.id)}">↺ Run Check</button>
    <button class="ct-btn ct-report-btn" data-id="${esc(comp.id)}">📄 Report</button>
    <button class="ct-btn ct-share-btn" data-id="${esc(comp.id)}" data-token="${esc(comp.shareToken || "")}">🔗 Share</button>
    <button class="ct-btn ct-btn-danger ct-delete-btn" data-id="${esc(comp.id)}">✕</button>
  </div>

  <div class="ct-timeline" id="timeline-${esc(comp.id)}">
    <div class="ct-timeline-header" data-id="${esc(comp.id)}">History <span>▾</span></div>
    ${buildTimeline(comp)}
  </div>`;

  // Bind events
  card.querySelector(".ct-check-btn").addEventListener("click", () => runCheck(comp.id));
  card.querySelector(".ct-report-btn").addEventListener("click", () => openReport(comp.id));
  card.querySelector(".ct-share-btn").addEventListener("click", e => copyShare(e.currentTarget));
  card.querySelector(".ct-delete-btn").addEventListener("click", () => deleteComp(comp.id, comp.competitorName));
  card.querySelector(".ct-timeline-header").addEventListener("click", () => {
    const tl = document.getElementById(`timeline-${comp.id}`);
    tl.classList.toggle("open");
    const arrow = card.querySelector(".ct-timeline-header span");
    if (arrow) arrow.textContent = tl.classList.contains("open") ? "▴" : "▾";
  });

  return card;
}

function buildBreakdown(breakdown) {
  const keys = Object.keys(BREAKDOWN_LABELS);
  const rows = keys.filter(k => breakdown[k] !== undefined).map(k => {
    const val = breakdown[k];
    const cls = barColor(val);
    return `
    <div class="ct-breakdown-row">
      <span class="ct-breakdown-label">${BREAKDOWN_LABELS[k]}</span>
      <div class="ct-bar-track"><div class="ct-bar-fill ${cls}" style="width:${val}%"></div></div>
      <span class="ct-breakdown-score ${cls}">${val}</span>
    </div>`;
  }).join("");
  return `<div class="ct-breakdown">${rows}</div>`;
}

function buildChart(comp) {
  if (!comp.snapshots || comp.snapshots.length < 2) {
    return `<div class="ct-chart-wrap"><div class="ct-chart-label">Score Trend</div><div class="ct-chart-single">Only 1 data point — run another check to see the trend</div></div>`;
  }

  const W = 320, H = 56, P = 8;
  const snaps  = comp.snapshots;
  const scores = snaps.map(s => s.score);
  const minS   = Math.max(0,   Math.min(...scores) - 10);
  const maxS   = Math.min(100, Math.max(...scores) + 10);
  const range  = maxS - minS || 1;

  const pts = snaps.map((s, i) => {
    const x = P + (i / (snaps.length - 1)) * (W - P * 2);
    const y = H - P - ((s.score - minS) / range) * (H - P * 2);
    return { x, y, score: s.score };
  });

  const polyline = pts.map(p => `${p.x},${p.y}`).join(" ");
  const areaPath = `M${pts[0].x},${H - P} ` + pts.map(p => `L${p.x},${p.y}`).join(" ") + ` L${pts[pts.length-1].x},${H - P} Z`;

  const lastScore = scores[scores.length - 1];
  const lineColor = lastScore >= 70 ? "#4ade80" : lastScore >= 40 ? "#fbbf24" : "#f87171";

  const dots = pts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${lineColor}" />`).join("");

  return `
  <div class="ct-chart-wrap">
    <div class="ct-chart-label">Score Trend</div>
    <svg class="ct-chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      <defs>
        <linearGradient id="grad-${esc(comp.id)}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="${lineColor}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#grad-${esc(comp.id)})" />
      <polyline points="${polyline}" fill="none" stroke="${lineColor}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
      ${dots}
    </svg>
  </div>`;
}

function buildTimeline(comp) {
  if (!comp.snapshots || !comp.snapshots.length) return `<div class="ct-timeline-row"><span class="ct-timeline-date">No data yet</span></div>`;
  const snaps = [...comp.snapshots].reverse();
  return snaps.map((s, i) => {
    const prev  = snaps[i + 1];
    let delta   = "";
    let deltaCls = "ct-delta-flat";
    if (prev) {
      const diff = s.score - prev.score;
      if (diff > 0)  { delta = `+${diff}`;  deltaCls = "ct-delta-up"; }
      else if (diff < 0) { delta = `${diff}`; deltaCls = "ct-delta-down"; }
      else { delta = "—"; }
    }
    return `
    <div class="ct-timeline-row">
      <span class="ct-timeline-date">${fmtDate(s.date)}</span>
      <span class="ct-timeline-score ${scoreColor(s.score)}">${s.score}</span>
      <span class="ct-timeline-delta ${deltaCls}">${delta}</span>
    </div>`;
  }).join("");
}

/* ── Run manual check ────────────────────────────────── */
async function runCheck(id) {
  const card = document.querySelector(`.ct-card[data-id="${id}"]`);
  const btn  = card ? card.querySelector(".ct-check-btn") : null;
  if (btn) { btn.disabled = true; btn.textContent = "Checking…"; }

  try {
    const res = await fetch(`/api/competitor/track/${id}/check`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Check failed."); return; }
    const idx = competitors.findIndex(c => c.id === id);
    if (idx !== -1) competitors[idx] = data.competitor;
    render();
  } catch {
    alert("Network error. Please try again.");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "↺ Run Check"; }
  }
}

/* ── Delete competitor ───────────────────────────────── */
async function deleteComp(id, name) {
  if (!confirm(`Remove "${name}" from tracking?`)) return;
  try {
    const res = await fetch(`/api/competitor/track/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    competitors = competitors.filter(c => c.id !== id);
    render();
  } catch {}
}

/* ── Copy share link ─────────────────────────────────── */
function copyShare(btn) {
  const token = btn.dataset.token;
  if (!token) { alert("No share token found."); return; }
  const url = `${location.origin}/audit/share/${token}`;
  navigator.clipboard.writeText(url).then(() => {
    const orig = btn.textContent;
    btn.textContent = "✓ Copied!";
    setTimeout(() => { btn.textContent = orig; }, 2000);
  }).catch(() => {
    prompt("Copy this share link:", url);
  });
}

/* ── Add competitor modal ────────────────────────────── */
function openModal() {
  document.getElementById("m-name").value     = "";
  document.getElementById("m-url").value      = "";
  document.getElementById("m-industry").value = "";
  modalErr.textContent = "";
  modalErr.classList.remove("visible");
  overlay.classList.add("open");
  modal.classList.add("open");
  setTimeout(() => document.getElementById("m-name").focus(), 50);
}

function closeModal() {
  overlay.classList.remove("open");
  modal.classList.remove("open");
}

addBtn.addEventListener("click", openModal);
emptyAddBtn.addEventListener("click", openModal);
closeBtn.addEventListener("click", closeModal);
cancelBtn.addEventListener("click", closeModal);
overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });

saveBtn.addEventListener("click", async () => {
  const name = document.getElementById("m-name").value.trim();
  if (!name) {
    modalErr.textContent = "Business name is required.";
    modalErr.classList.add("visible");
    document.getElementById("m-name").focus();
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "Running audit…";
  modalErr.classList.remove("visible");

  try {
    const res = await fetch("/api/competitor/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        competitorName: name,
        competitorUrl:  document.getElementById("m-url").value.trim(),
        industry:       document.getElementById("m-industry").value,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      modalErr.textContent = data.error || "Failed to add competitor.";
      modalErr.classList.add("visible");
      return;
    }
    competitors.push(data.competitor);
    render();
    closeModal();
  } catch {
    modalErr.textContent = "Network error. Please try again.";
    modalErr.classList.add("visible");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Run Audit →";
  }
});

/* ── Report modal ────────────────────────────────────── */
function openReport(id) {
  const comp = competitors.find(c => c.id === id);
  if (!comp) return;
  const snap = latestSnap(comp);
  if (!snap) return;

  reportTitle.textContent = `AI Visibility Report — ${comp.competitorName}`;

  const scoreNum  = snap.score;
  const scoreCls  = scoreColor(scoreNum);
  const bd        = snap.breakdown || {};

  const breakdownRows = Object.keys(BREAKDOWN_LABELS).filter(k => bd[k] !== undefined).map(k => {
    const val = bd[k];
    const cls = scoreColor(val);
    return `
    <div class="ct-report-breakdown-row">
      <span>${BREAKDOWN_LABELS[k]}</span>
      <div class="ct-report-bar-track"><div class="ct-report-bar-fill ${cls}" style="width:${val}%;height:100%;border-radius:3px"></div></div>
      <span class="ct-report-score-val ${cls}">${val}</span>
    </div>`;
  }).join("");

  const listItems = (arr, cls) => (arr || []).map(s => `<li>${esc(s)}</li>`).join("");

  reportBody.innerHTML = `
  <div class="ct-report-content">
    <div class="ct-report-top">
      <div class="ct-report-score-big ${scoreCls}">${scoreNum}</div>
      <div class="ct-report-meta">
        <div class="ct-report-meta-name">${esc(comp.competitorName)}</div>
        ${comp.competitorUrl ? `<div class="ct-report-meta-url">${esc(comp.competitorUrl)}</div>` : ""}
        <div class="ct-report-meta-date">Report generated: ${fmtDate(snap.date)} · Industry: ${esc(comp.industry || "—")}</div>
      </div>
    </div>

    ${breakdownRows ? `<div class="ct-report-section"><div class="ct-report-section-title">Score Breakdown</div>${breakdownRows}</div>` : ""}

    ${(snap.strengths || []).length ? `
    <div class="ct-report-section">
      <div class="ct-report-section-title">Strengths</div>
      <ul class="ct-report-list strengths">${listItems(snap.strengths)}</ul>
    </div>` : ""}

    ${(snap.weaknesses || []).length ? `
    <div class="ct-report-section">
      <div class="ct-report-section-title">Weaknesses</div>
      <ul class="ct-report-list weaknesses">${listItems(snap.weaknesses)}</ul>
    </div>` : ""}

    ${(snap.recommendations || []).length ? `
    <div class="ct-report-section">
      <div class="ct-report-section-title">Recommendations</div>
      <ul class="ct-report-list recs">${listItems(snap.recommendations)}</ul>
    </div>` : ""}

    <div class="ct-report-section" style="font-size:0.72rem;color:var(--muted);padding-top:10px;border-top:1px solid var(--border)">
      Generated by <strong style="color:var(--text)">eureach.eu</strong> AI Visibility Tracker · ${new Date().getFullYear()}
    </div>
  </div>`;

  reportOverlay.classList.add("open");
  reportModal.classList.add("open");
}

function closeReport() {
  reportOverlay.classList.remove("open");
  reportModal.classList.remove("open");
}

reportClose.addEventListener("click", closeReport);
reportDone.addEventListener("click", closeReport);
reportOverlay.addEventListener("click", e => { if (e.target === reportOverlay) closeReport(); });
reportPrint.addEventListener("click", () => window.print());

/* ── Auth notice ─────────────────────────────────────── */
function showAuthNotice() {
  board.innerHTML = `<div class="ct-empty"><div class="ct-empty-icon">🔒</div><div class="ct-empty-title">Sign in to track competitors</div><div class="ct-empty-sub"><a href="signin.html" style="color:var(--blue2)">Sign in</a> to access the Competitor Tracker.</div></div>`;
  document.getElementById("ct-stats").style.display = "none";
}

/* ── Util ────────────────────────────────────────────── */
function esc(s) {
  const d = document.createElement("div");
  d.textContent = String(s || "");
  return d.innerHTML;
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/* ── Init ────────────────────────────────────────────── */
render();
load();
