/* ── i18n helper ─────────────────────────────────────────── */
function T(k,fb){var l=window.euLang?window.euLang():'en';var t=window.EUREACH_T;return(t&&t[l]&&t[l][k])||fb||k;}

/* ── Pipeline JS ────────────────────────────────────────── */
function STAGES() { return [
  { key: "new",       label: T("pl.stageNew","New"),             color: "#6366f1" },
  { key: "contacted", label: T("pl.stageContacted","Contacted"), color: "#3b82f6" },
  { key: "replied",   label: T("pl.stageReplied","Replied"),     color: "#8b5cf6" },
  { key: "audited",   label: T("pl.stageAudited","Audited"),     color: "#f59e0b" },
  { key: "proposal",  label: T("pl.stageProposal","Proposal"),   color: "#ec4899" },
  { key: "won",       label: T("pl.stageWon","Won"),             color: "#22c55e" },
  { key: "lost",      label: T("pl.stageLost","Lost"),           color: "#6b7280" },
]; }

let leads = [];
let activeLead = null;

const board    = document.getElementById("pl-board");
const stats    = document.getElementById("pl-stats");
const overlay  = document.getElementById("pl-overlay");
const panel    = document.getElementById("pl-panel");
const panelName = document.getElementById("pl-panel-name");
const panelBody = document.getElementById("pl-panel-body");
document.getElementById("pl-panel-close").addEventListener("click", closePanel);
overlay.addEventListener("click", closePanel);

/* ── Load ──────────────────────────────────────────────── */
async function loadPipeline() {
  try {
    const res = await fetch("/api/pipeline");
    if (res.status === 401) {
      board.innerHTML = `<div class="pl-loading" style="gap:12px">
        <div style="font-size:1.1rem">🔒</div>
        <div>${T("pl.signIn","Sign in to view your pipeline")}</div>
        <a href="signin.html" class="pl-btn pl-btn-primary" style="margin-top:8px">Sign in</a>
      </div>`;
      return;
    }
    leads = await res.json();
    renderBoard();
    renderStats();
  } catch (e) {
    board.innerHTML = `<div class="pl-loading">${T("pl.failed","Failed to load pipeline. Please refresh.")}</div>`;
  }
}

/* ── Render board ──────────────────────────────────────── */
function renderBoard() {
  board.innerHTML = "";
  for (const stage of STAGES()) {
    const stageleads = leads.filter(l => l.stage === stage.key);
    const col = document.createElement("div");
    col.className = "pl-col";
    col.innerHTML = `
      <div class="pl-col-header">
        <div class="pl-col-dot" style="background:${stage.color}"></div>
        <div class="pl-col-name">${stage.label}</div>
        <div class="pl-col-count">${stageleads.length}</div>
      </div>
      <div class="pl-col-cards" id="col-${stage.key}">
        ${stageleads.length === 0 ? `<div class="pl-col-empty">${T("pl.noLeads","No leads")}${stage.key === "new" ? '<br><a href="leads.html" class="pl-find-leads-link">🔍 Find Leads →</a>' : ""}</div>` : ""}
        ${stageleads.map(l => cardHTML(l, stage)).join("")}
      </div>`;
    board.appendChild(col);
  }
  board.querySelectorAll(".pl-card").forEach(card => {
    card.addEventListener("click", () => {
      const id = card.dataset.id;
      activeLead = leads.find(l => l.id === id);
      if (activeLead) openPanel(activeLead);
    });
  });
}

function cardHTML(l, stage) {
  const days = Math.floor((Date.now() - new Date(l.history[l.history.length - 1]?.date || l.addedAt).getTime()) / 86400000);
  const fu = l.followUpDate ? `<div class="pl-card-followup">📅 ${fmtDate(l.followUpDate)}</div>` : "";
  return `
  <div class="pl-card" data-id="${l.id}">
    <div class="pl-card-name">${esc(l.name)}</div>
    <div class="pl-card-meta">
      ${l.city ? `<span>📍 ${esc(l.city)}</span>` : ""}
      ${l.category ? `<span>🏷 ${esc(l.category)}</span>` : ""}
      ${l.rating ? `<span>★ ${l.rating}</span>` : ""}
    </div>
    <div class="pl-card-footer">
      ${l.phone   ? `<span class="pl-card-tag">📞</span>` : ""}
      ${l.website ? `<span class="pl-card-tag">🌐</span>` : ""}
      ${l.email   ? `<span class="pl-card-tag">📧</span>` : ""}
      ${fu}
      <span class="pl-card-days">${days}d</span>
    </div>
  </div>`;
}

/* ── Stats bar ─────────────────────────────────────────── */
function renderStats() {
  const won  = leads.filter(l => l.stage === "won").length;
  const lost = leads.filter(l => l.stage === "lost").length;
  const conv = won + lost > 0 ? Math.round(won / (won + lost) * 100) : 0;
  stats.innerHTML = STAGES().map(s => {
    const count = leads.filter(l => l.stage === s.key).length;
    return `<div class="pl-stat">
      <div class="pl-stat-count" style="color:${s.color}">${count}</div>
      <div class="pl-stat-label">${s.label}</div>
    </div>`;
  }).join("") + `<div class="pl-stat">
    <div class="pl-stat-count pl-stat-conversion">${conv}%</div>
    <div class="pl-stat-label">${T("pl.winRate","Win rate")}</div>
  </div>`;
}

/* ── Panel ─────────────────────────────────────────────── */
function openPanel(lead) {
  panelName.textContent = lead.name;
  renderPanelBody(lead);
  overlay.classList.add("open");
  panel.classList.add("open");
}

function closePanel() {
  overlay.classList.remove("open");
  panel.classList.remove("open");
  activeLead = null;
}

function renderPanelBody(lead) {
  const stage = STAGES().find(s => s.key === lead.stage);
  panelBody.innerHTML = `
    <!-- Info -->
    <div class="pl-section">
      <div class="pl-section-title">${T("pl.bizInfo","Business Info")}</div>
      ${lead.city     ? `<div class="pl-info-row"><span class="pl-info-ico">📍</span>${esc(lead.city)}</div>` : ""}
      ${lead.category ? `<div class="pl-info-row"><span class="pl-info-ico">🏷</span>${esc(lead.category)}</div>` : ""}
      ${lead.phone    ? `<div class="pl-info-row"><span class="pl-info-ico">📞</span>${esc(lead.phone)}</div>` : ""}
      ${lead.email    ? `<div class="pl-info-row"><span class="pl-info-ico">📧</span>${esc(lead.email)}</div>` : ""}
      ${lead.website  ? `<div class="pl-info-row"><span class="pl-info-ico">🌐</span><a href="https://${esc(lead.website)}" target="_blank">${esc(lead.website)}</a></div>` : ""}
      ${lead.rating   ? `<div class="pl-info-row"><span class="pl-info-ico">★</span>${lead.rating} (${lead.reviews} reviews)</div>` : ""}
    </div>

    <!-- Stage -->
    <div class="pl-section">
      <div class="pl-section-title">${T("pl.stage","Stage")}</div>
      <select class="pl-stage-select" id="pl-stage-sel">
        ${STAGES().map(s => `<option value="${s.key}" ${s.key === lead.stage ? "selected" : ""}>${s.label}</option>`).join("")}
      </select>
    </div>

    <!-- Follow-up -->
    <div class="pl-section">
      <div class="pl-section-title">${T("pl.followUp","Follow-up Date")}</div>
      <input type="date" class="pl-date-input" id="pl-followup-date" value="${lead.followUpDate || ""}">
      <button class="pl-btn" id="pl-save-followup" style="margin-top:4px">${T("pl.saveDate","Save date")}</button>
    </div>

    <!-- AI Email -->
    <div class="pl-section">
      <div class="pl-section-title">${T("pl.outreachEmail","Outreach Email")}</div>
      <button class="pl-btn pl-btn-ai" id="pl-gen-email">${T("pl.genEmail","✨ Generate Greek Email")}</button>
      <div id="pl-email-area"></div>
    </div>

    <!-- Notes -->
    <div class="pl-section">
      <div class="pl-section-title">${T("pl.notes","Notes")}</div>
      <div class="pl-notes-list" id="pl-notes-list">
        ${lead.notes.length === 0 ? `<div style="font-size:0.75rem;color:var(--muted)">${T("pl.noNotes","No notes yet")}</div>` : ""}
        ${lead.notes.map(n => `
          <div class="pl-note">${esc(n.text)}<div class="pl-note-date">${fmtDateTime(n.date)}</div></div>
        `).join("")}
      </div>
      <textarea class="pl-note-input" id="pl-note-input" placeholder="Add a note…"></textarea>
      <button class="pl-btn pl-btn-primary" id="pl-add-note" style="margin-top:4px">${T("pl.addNote","Add Note")}</button>
    </div>

    <!-- History -->
    <div class="pl-section">
      <div class="pl-section-title">${T("pl.stageHistory","Stage History")}</div>
      <div class="pl-history">
        ${[...lead.history].reverse().map(h => {
          const s = STAGES().find(st => st.key === h.stage);
          return `<div class="pl-history-item">
            <div class="pl-history-dot" style="background:${s?.color || "#666"}"></div>
            <span style="color:var(--white)">${s?.label || h.stage}</span>
            <span style="margin-left:auto">${fmtDateTime(h.date)}</span>
          </div>`;
        }).join("")}
      </div>
    </div>

    <!-- Delete -->
    <div class="pl-section" style="padding-bottom:8px">
      <button class="pl-btn pl-btn-danger" id="pl-delete-lead">${T("pl.remove","🗑 Remove from Pipeline")}</button>
    </div>`;

  // Stage change
  document.getElementById("pl-stage-sel").addEventListener("change", async e => {
    const newStage = e.target.value;
    const res = await fetch(`/api/pipeline/${lead.id}/stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: newStage }),
    });
    if (res.ok) {
      const updated = await res.json();
      const idx = leads.findIndex(l => l.id === lead.id);
      if (idx !== -1) leads[idx] = updated;
      activeLead = updated;
      renderBoard();
      renderStats();
      renderPanelBody(updated);
    }
  });

  // Follow-up
  document.getElementById("pl-save-followup").addEventListener("click", async () => {
    const date = document.getElementById("pl-followup-date").value || null;
    const res = await fetch(`/api/pipeline/${lead.id}/followup`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ followUpDate: date }),
    });
    if (res.ok) {
      const updated = await res.json();
      const idx = leads.findIndex(l => l.id === lead.id);
      if (idx !== -1) leads[idx] = updated;
      activeLead = updated;
      renderBoard();
      showToast(T("pl.followupSaved","Follow-up date saved"));
    }
  });

  // Generate email
  document.getElementById("pl-gen-email").addEventListener("click", async () => {
    const area = document.getElementById("pl-email-area");
    area.innerHTML = `<div class="pl-email-loading"><div class="pl-spinner" style="width:18px;height:18px;border-width:2px"></div>${T("pl.generating","Generating…")}</div>`;
    try {
      const res = await fetch("/api/pipeline/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: lead.name, category: lead.category, city: lead.city, website: lead.website }),
      });
      if (res.ok) {
        const { email } = await res.json();
        area.innerHTML = `
          <div class="pl-email-modal">${esc(email)}</div>
          <button class="pl-btn" style="margin-top:6px" onclick="copyEmail(this)">${T("pl.copy","📋 Copy")}</button>`;
        area._emailText = email;
      } else {
        area.innerHTML = `<div style="color:#ef4444;font-size:0.78rem">${T("pl.emailFailed","Failed to generate email.")}</div>`;
      }
    } catch {
      area.innerHTML = `<div style="color:#ef4444;font-size:0.78rem">${T("pl.emailFailed","Error generating email.")}</div>`;
    }
  });

  // Add note
  document.getElementById("pl-add-note").addEventListener("click", async () => {
    const input = document.getElementById("pl-note-input");
    const text = input.value.trim();
    if (!text) return;
    const res = await fetch(`/api/pipeline/${lead.id}/note`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const updated = await res.json();
      const idx = leads.findIndex(l => l.id === lead.id);
      if (idx !== -1) leads[idx] = updated;
      activeLead = updated;
      renderPanelBody(updated);
    }
  });

  // Delete
  document.getElementById("pl-delete-lead").addEventListener("click", async () => {
    if (!confirm(`Remove "${lead.name}" from your pipeline?`)) return;
    const res = await fetch(`/api/pipeline/${lead.id}`, { method: "DELETE" });
    if (res.ok) {
      leads = leads.filter(l => l.id !== lead.id);
      closePanel();
      renderBoard();
      renderStats();
    }
  });
}

function copyEmail(btn) {
  const area = document.getElementById("pl-email-area");
  const text = area?._emailText || area?.querySelector(".pl-email-modal")?.textContent || "";
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = "✓";
    setTimeout(() => { btn.textContent = T("pl.copy","📋 Copy"); }, 2000);
  });
}

/* ── Helpers ───────────────────────────────────────────── */
function esc(s) {
  const d = document.createElement("div");
  d.textContent = String(s || "");
  return d.innerHTML;
}
function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("el-GR", { day: "2-digit", month: "short" });
}
function fmtDateTime(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("el-GR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function showToast(msg) {
  const t = document.createElement("div");
  t.style.cssText = "position:fixed;bottom:20px;right:20px;background:#1a1a2e;border:1px solid var(--accent);color:var(--white);padding:10px 18px;border-radius:8px;font-size:0.82rem;z-index:9999;animation:fadeIn 0.2s";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

loadPipeline();
