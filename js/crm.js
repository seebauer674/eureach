/* ── eureach.eu — CRM Pipeline ────────────────────────── */

let entries = [];

/* ── DOM refs — Add Lead modal ───────────────────────── */
const overlay   = document.getElementById("crm-overlay");
const modal     = document.getElementById("crm-modal");
const addBtn    = document.getElementById("crm-add-btn");
const closeBtn  = document.getElementById("crm-modal-close");
const cancelBtn = document.getElementById("crm-modal-cancel");
const saveBtn   = document.getElementById("crm-modal-save");
const modalErr  = document.getElementById("crm-modal-err");

/* ── DOM refs — Outreach modal ───────────────────────── */
const orOverlay     = document.getElementById("or-overlay");
const orModal       = document.getElementById("or-modal");
const orCloseBtn    = document.getElementById("or-modal-close");
const orFormBody    = document.getElementById("or-form-body");
const orLoading     = document.getElementById("or-loading");
const orResultsBody = document.getElementById("or-results-body");
const orMessages    = document.getElementById("or-messages");
const orGenerateBtn = document.getElementById("or-generate-btn");
const orFormCancel  = document.getElementById("or-form-cancel");
const orFormErr     = document.getElementById("or-form-err");
const orRegenBtn    = document.getElementById("or-regen-btn");
const orDoneBtn     = document.getElementById("or-done-btn");

/* ── DOM refs — WhatsApp tab ─────────────────────────── */
const waFormBody    = document.getElementById("wa-form-body");
const waLoading     = document.getElementById("wa-loading");
const waResultsBody = document.getElementById("wa-results-body");
const waCards       = document.getElementById("wa-cards");
const waGenerateBtn = document.getElementById("wa-generate-btn");
const waFormCancel  = document.getElementById("wa-form-cancel");
const waFormErr     = document.getElementById("wa-form-err");
const waRegenBtn    = document.getElementById("wa-regen-btn");
const waDoneBtn     = document.getElementById("wa-done-btn");

// Current lead being outreached
let orCurrentLead = null;

// Score cache (loaded from server)
let crmScoreMap = {};

function crmScoreKey(name, city) {
  return `${(name||"").trim().toLowerCase()}|${(city||"").trim().toLowerCase()}`;
}

function crmTierIcon(tier) {
  return tier === "hot" ? "🔥" : tier === "warm" ? "🌡" : "❄";
}

async function loadCrmScoreCache() {
  try {
    const res = await fetch("/api/leads/score/cache");
    if (!res.ok) return;
    const data = await res.json();
    crmScoreMap = data.cache || {};
    if (Object.keys(crmScoreMap).length) render();
  } catch {}
}

/* ── User limits ─────────────────────────────────────── */
let crmUserCaps = { canOutreach: true, canWhatsApp: true, crmLeadsMax: -1 };

async function loadUserCaps() {
  try {
    const res = await fetch("/api/auth/me");
    if (!res.ok) return;
    const { user } = await res.json();
    if (!user) return;
    crmUserCaps = {
      canOutreach:  user.canOutreach  !== false,
      canWhatsApp:  user.canWhatsApp  !== false,
      crmLeadsMax:  user.crmLeadsMax  ?? -1,
    };
  } catch {}
}

function showLimitModal(feature) {
  const featureLabels = {
    outreach:    "AI Outreach Sequences",
    whatsapp:    "WhatsApp / SMS Templates",
    crm:         "CRM Pipeline (5 lead limit)",
    competitors: "Competitor Tracking",
    articles:    "AI Article Generation",
  };
  const label = featureLabels[feature] || "This feature";
  const el = document.getElementById("crm-limit-modal");
  if (el) {
    el.querySelector(".crm-limit-feature").textContent = label;
    el.classList.add("open");
    document.getElementById("crm-limit-overlay").classList.add("open");
  }
}

function closeLimitModal() {
  const el = document.getElementById("crm-limit-modal");
  if (el) el.classList.remove("open");
  const ov = document.getElementById("crm-limit-overlay");
  if (ov) ov.classList.remove("open");
}

/* ── Load ────────────────────────────────────────────── */
async function loadEntries() {
  try {
    const res = await fetch("/api/crm");
    if (res.status === 401) { showAuthNotice(); return; }
    if (!res.ok) return;
    const data = await res.json();
    entries = data.entries || [];
    render();
  } catch {
    render();
  }
}

/* ── Render board ────────────────────────────────────── */
function render() {
  ["found", "contacted", "replied", "closed"].forEach(status => {
    const col   = document.getElementById("cards-" + status);
    const count = document.getElementById("count-" + status);
    const items = entries.filter(e => e.status === status);
    count.textContent = items.length;
    col.innerHTML = items.length
      ? items.map(cardHTML).join("")
      : `<div class="crm-col-empty">No leads here yet</div>`;
    if (items.length) bindColEvents(col);
  });

  document.getElementById("stat-total").textContent     = entries.length;
  document.getElementById("stat-found").textContent     = entries.filter(e => e.status === "found").length;
  document.getElementById("stat-contacted").textContent = entries.filter(e => e.status === "contacted").length;
  document.getElementById("stat-replied").textContent   = entries.filter(e => e.status === "replied").length;
  document.getElementById("stat-closed").textContent    = entries.filter(e => e.status === "closed").length;
}

function reminderBadgeHTML(reminder) {
  if (!reminder || !reminder.date) return "";
  const today    = new Date().toISOString().slice(0, 10);
  const isToday  = reminder.date === today;
  const isOverdue = reminder.date < today;
  const cls  = isOverdue ? "crm-reminder-badge overdue" : isToday ? "crm-reminder-badge today" : "crm-reminder-badge upcoming";
  const label = isOverdue ? "⚠ Overdue" : isToday ? "🔔 Today" : "🔔 " + reminder.date;
  const tip  = reminder.note ? esc(reminder.note) : "";
  return `<span class="${cls}" title="${tip}">${label}</span>`;
}

function lastCallBadgeHTML(callLog) {
  if (!callLog || !callLog.length) return "";
  const last    = callLog[callLog.length - 1];
  const icons   = { answered: "✅", no_answer: "📵", voicemail: "📱", callback: "🔁" };
  const labels  = { answered: "Answered", no_answer: "No answer", voicemail: "Voicemail", callback: "Callback" };
  const icon    = icons[last.outcome]  || "📞";
  const label   = labels[last.outcome] || last.outcome;
  const dt      = new Date(last.at);
  const diffMs  = Date.now() - dt;
  const diffH   = Math.floor(diffMs / 3600000);
  const timeStr = diffH < 1 ? "just now" : diffH < 24 ? diffH + "h ago" : Math.floor(diffH / 24) + "d ago";
  return `<span class="crm-call-badge" title="${esc(last.notes || "")}">${icon} ${label} · ${timeStr}</span>`;
}

function cardHTML(e) {
  const s = crmScoreMap[crmScoreKey(e.leadName, e.city)];
  const scoreBadge = s
    ? `<div class="crm-score-badge tier-${s.tier}" title="${esc(s.reasoning || "")}">${crmTierIcon(s.tier)} ${s.score}</div>`
    : "";
  const reminderBadge = reminderBadgeHTML(e.reminder);
  const callBadge     = lastCallBadgeHTML(e.callLog);
  const badgesRow     = (reminderBadge || callBadge)
    ? `<div class="crm-badges-row">${callBadge}${reminderBadge}</div>`
    : "";
  return `
  <div class="crm-card" data-id="${e.id}">
    <div class="crm-card-name-row">
      <div class="crm-card-name">${esc(e.leadName)}</div>
      ${scoreBadge}
    </div>
    <div class="crm-card-meta">
      ${e.businessType ? `<div class="crm-card-row"><span>🏢</span>${esc(e.businessType)}</div>` : ""}
      ${e.city         ? `<div class="crm-card-row"><span>📍</span>${esc(e.city)}</div>` : ""}
      ${e.phone        ? `<div class="crm-card-row"><span>📞</span>${esc(e.phone)}</div>` : ""}
      ${e.website      ? `<div class="crm-card-row"><span>🌐</span><a href="https://${esc(e.website)}" target="_blank">${esc(e.website)}</a></div>` : ""}
      ${e.email        ? `<div class="crm-card-row"><span>✉</span><span class="crm-email-val">${esc(e.email)}</span></div>` : ""}
    </div>
    <textarea class="crm-card-notes" data-id="${e.id}" placeholder="Add notes…">${esc(e.notes || "")}</textarea>
    ${badgesRow}
    <div class="crm-card-footer">
      <select class="crm-status-select" data-id="${e.id}">
        <option value="found"     ${e.status === "found"     ? "selected" : ""}>🔵 Found</option>
        <option value="contacted" ${e.status === "contacted" ? "selected" : ""}>🟡 Contacted</option>
        <option value="replied"   ${e.status === "replied"   ? "selected" : ""}>🟣 Replied</option>
        <option value="closed"    ${e.status === "closed"    ? "selected" : ""}>🟢 Closed</option>
      </select>
      <button class="crm-delete-btn" data-id="${e.id}" title="Remove">✕</button>
    </div>
    <div class="crm-action-bar">
      <button class="crm-action-btn crm-call-btn"     data-id="${e.id}">📞 Log Call</button>
      <button class="crm-action-btn crm-reminder-btn" data-id="${e.id}">⏰ Remind me</button>
      <button class="crm-action-btn crm-outreach-btn" data-id="${e.id}">✨ Outreach</button>
    </div>
  </div>`;
}

function bindColEvents(col) {
  col.querySelectorAll(".crm-status-select").forEach(sel => {
    sel.addEventListener("change", () => patchEntry(sel.dataset.id, { status: sel.value }));
  });

  col.querySelectorAll(".crm-card-notes").forEach(ta => {
    ta.addEventListener("blur", () => patchEntry(ta.dataset.id, { notes: ta.value }));
  });

  col.querySelectorAll(".crm-delete-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Remove this lead from the pipeline?")) return;
      await deleteEntry(btn.dataset.id);
    });
  });

  col.querySelectorAll(".crm-outreach-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const lead = entries.find(e => e.id === btn.dataset.id);
      if (lead) openOutreachModal(lead);
    });
  });

  col.querySelectorAll(".crm-call-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const lead = entries.find(e => e.id === btn.dataset.id);
      if (lead) toggleCallPanel(btn, lead);
    });
  });

  col.querySelectorAll(".crm-reminder-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const lead = entries.find(e => e.id === btn.dataset.id);
      if (lead) toggleReminderPanel(btn, lead);
    });
  });
}

/* ── CRM API ─────────────────────────────────────────── */
async function patchEntry(id, data) {
  try {
    const res = await fetch("/api/crm/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) return;
    const { entry } = await res.json();
    const idx = entries.findIndex(e => e.id === id);
    if (idx !== -1) entries[idx] = entry;
    render();
  } catch {}
}

async function deleteEntry(id) {
  try {
    const res = await fetch("/api/crm/" + id, { method: "DELETE" });
    if (!res.ok) return;
    entries = entries.filter(e => e.id !== id);
    render();
  } catch {}
}

async function createEntry(data) {
  try {
    const res = await fetch("/api/crm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (res.status === 403 && body.error === "limit_reached") {
      showLimitModal("crm");
      return null;
    }
    if (!res.ok) return body.error || "Failed to add lead.";
    entries.push(body.entry);
    render();
    return null;
  } catch {
    return "Network error.";
  }
}

/* ── Add Lead modal ──────────────────────────────────── */
function openModal(prefill = {}) {
  document.getElementById("m-name").value    = prefill.leadName     || "";
  document.getElementById("m-type").value    = prefill.businessType || "";
  document.getElementById("m-city").value    = prefill.city         || "";
  document.getElementById("m-phone").value   = prefill.phone        || "";
  document.getElementById("m-website").value = prefill.website      || "";
  document.getElementById("m-notes").value   = prefill.notes        || "";
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

addBtn.addEventListener("click", () => openModal());
closeBtn.addEventListener("click", closeModal);
cancelBtn.addEventListener("click", closeModal);
overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });

saveBtn.addEventListener("click", async () => {
  const leadName = document.getElementById("m-name").value.trim();
  if (!leadName) {
    modalErr.textContent = "Business name is required.";
    modalErr.classList.add("visible");
    document.getElementById("m-name").focus();
    return;
  }
  saveBtn.disabled = true;
  saveBtn.textContent = "Adding…";

  const err = await createEntry({
    leadName,
    businessType: document.getElementById("m-type").value.trim(),
    city:         document.getElementById("m-city").value.trim(),
    phone:        document.getElementById("m-phone").value.trim() || null,
    website:      document.getElementById("m-website").value.trim() || null,
    notes:        document.getElementById("m-notes").value.trim(),
  });

  saveBtn.disabled = false;
  saveBtn.textContent = "Add to Pipeline";

  if (err) {
    modalErr.textContent = err;
    modalErr.classList.add("visible");
    return;
  }
  closeModal();
});

/* ── Language auto-detect from lead ─────────────────── */
function detectLang(lead) {
  const city = (lead.city || "").toLowerCase();
  const greekCities = ["athens","thessaloniki","piraeus","heraklion","patras","larissa","volos","ioannina","chania","rhodes","nicosia","limassol","larnaca"];
  const germanCities = ["berlin","hamburg","munich","münchen","cologne","köln","frankfurt","stuttgart","düsseldorf","dortmund","essen","vienna","wien","graz","linz","salzburg","zurich","zürich","geneva","genf","bern","basel"];
  if (greekCities.some(c => city.includes(c))) return "greek";
  if (germanCities.some(c => city.includes(c))) return "german";
  return "english";
}

/* ── Tab switching ───────────────────────────────────── */
document.getElementById("or-tab-email").addEventListener("click", () => switchOrTab("email"));
document.getElementById("or-tab-wa").addEventListener("click",    () => switchOrTab("wa"));

function switchOrTab(tab) {
  if (tab === "wa" && !crmUserCaps.canWhatsApp) { showLimitModal("whatsapp"); return; }
  document.getElementById("or-tab-email").classList.toggle("or-tab-active", tab === "email");
  document.getElementById("or-tab-wa").classList.toggle("or-tab-active",    tab === "wa");
  document.getElementById("or-content-email").style.display = tab === "email" ? "" : "none";
  document.getElementById("or-content-wa").style.display    = tab === "wa"    ? "" : "none";
}

/* ── Outreach modal ──────────────────────────────────── */
function openOutreachModal(lead) {
  if (!crmUserCaps.canOutreach) { showLimitModal("outreach"); return; }
  orCurrentLead = lead;
  const leadLabel = [lead.leadName, lead.businessType, lead.city].filter(Boolean).join(" · ");
  document.getElementById("or-lead-display").textContent = leadLabel;
  document.getElementById("wa-lead-display").textContent = leadLabel;
  document.getElementById("or-modal-title").textContent  = "Generate Outreach";

  // Auto-set language from city
  const detectedLang = detectLang(lead);
  document.getElementById("or-language").value = detectedLang;
  document.getElementById("wa-language").value = detectedLang;

  // Pre-fill phone if available
  if (lead.phone) document.getElementById("wa-phone").value = lead.phone;

  orFormErr.textContent = "";
  orFormErr.classList.remove("visible");
  waFormErr.textContent = "";
  waFormErr.classList.remove("visible");

  showOrView("form");
  showWaView("form");
  switchOrTab("email");
  orOverlay.classList.add("open");
  orModal.classList.add("open");
}

function closeOutreachModal() {
  orOverlay.classList.remove("open");
  orModal.classList.remove("open");
  orCurrentLead = null;
}

function showOrView(view) {
  orFormBody.style.display    = view === "form"    ? "flex"  : "none";
  orLoading.style.display     = view === "loading" ? "flex"  : "none";
  orResultsBody.style.display = view === "results" ? "block" : "none";
}

function showWaView(view) {
  waFormBody.style.display    = view === "form"    ? "flex"  : "none";
  waLoading.style.display     = view === "loading" ? "flex"  : "none";
  waResultsBody.style.display = view === "results" ? "block" : "none";
}

orCloseBtn.addEventListener("click", closeOutreachModal);
orFormCancel.addEventListener("click", closeOutreachModal);
orDoneBtn.addEventListener("click", closeOutreachModal);
orOverlay.addEventListener("click", e => { if (e.target === orOverlay) closeOutreachModal(); });
waFormCancel.addEventListener("click", closeOutreachModal);
waDoneBtn.addEventListener("click", closeOutreachModal);
waRegenBtn.addEventListener("click", () => showWaView("form"));

orGenerateBtn.addEventListener("click", () => runGenerate());
orRegenBtn.addEventListener("click", () => { showOrView("form"); });
waGenerateBtn.addEventListener("click", () => runWA());

async function runGenerate() {
  if (!orCurrentLead) return;

  const language = document.getElementById("or-language").value;
  const tone     = document.getElementById("or-tone").value;

  orGenerateBtn.disabled = true;
  orGenerateBtn.textContent = "Generating…";
  orFormErr.textContent = "";
  orFormErr.classList.remove("visible");
  showOrView("loading");

  try {
    const res = await fetch("/api/outreach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        crmId:        orCurrentLead.id,
        leadName:     orCurrentLead.leadName,
        businessType: orCurrentLead.businessType || "",
        city:         orCurrentLead.city || "",
        language,
        tone,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      showOrView("form");
      if (res.status === 403 && data.error === "limit_reached") { closeOutreachModal(); showLimitModal("outreach"); return; }
      orFormErr.textContent = data.error || "Failed to generate. Please try again.";
      orFormErr.classList.add("visible");
      return;
    }

    renderSequence(data.sequence);
    showOrView("results");
  } catch {
    showOrView("form");
    orFormErr.textContent = "Network error. Please try again.";
    orFormErr.classList.add("visible");
  } finally {
    orGenerateBtn.disabled = false;
    orGenerateBtn.textContent = "✨ Generate Sequence";
  }
}

async function runWA() {
  if (!orCurrentLead) return;

  const language    = document.getElementById("wa-language").value;
  const messageType = document.getElementById("wa-message-type").value;
  const phone       = document.getElementById("wa-phone").value.trim();

  waGenerateBtn.disabled = true;
  waGenerateBtn.textContent = "Generating…";
  waFormErr.textContent = "";
  waFormErr.classList.remove("visible");
  showWaView("loading");

  try {
    const res = await fetch("/api/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        crmId:        orCurrentLead.id,
        leadName:     orCurrentLead.leadName,
        businessType: orCurrentLead.businessType || "",
        city:         orCurrentLead.city || "",
        phone:        phone || null,
        language,
        messageType,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      showWaView("form");
      if (res.status === 403 && data.error === "limit_reached") { closeOutreachModal(); showLimitModal("whatsapp"); return; }
      waFormErr.textContent = data.error || "Failed to generate. Please try again.";
      waFormErr.classList.add("visible");
      return;
    }

    renderWA(data, phone);
    showWaView("results");
  } catch {
    showWaView("form");
    waFormErr.textContent = "Network error. Please try again.";
    waFormErr.classList.add("visible");
  } finally {
    waGenerateBtn.disabled = false;
    waGenerateBtn.textContent = "✨ Generate Messages";
  }
}

function renderWA(data, phone) {
  const tipEl = document.getElementById("wa-send-tip");
  if (data.sendTimeTip) {
    tipEl.textContent = "⏰ " + data.sendTimeTip;
    tipEl.style.display = "";
  } else {
    tipEl.style.display = "none";
  }

  const cleanPhone = phone ? phone.replace(/\s+/g, "") : "";
  const waLink = cleanPhone
    ? `https://wa.me/${cleanPhone.replace(/^\+/, "")}?text=${encodeURIComponent(data.whatsapp)}`
    : null;

  const cards = [
    { label: "💬 WhatsApp", cls: "whatsapp", text: data.whatsapp, link: waLink },
    { label: "📱 SMS",      cls: "sms",      text: data.sms,      link: null },
  ];

  waCards.innerHTML = cards.map(card => {
    const charCount = (card.text || "").length;
    const overLimit = charCount > 160;
    const openBtn = card.link
      ? `<a class="wa-open-btn" href="${esc(card.link)}" target="_blank" rel="noopener">Open in WhatsApp ↗</a>`
      : `<button class="wa-open-btn disabled" disabled>Enter phone to open WhatsApp</button>`;
    return `
    <div class="wa-msg-card">
      <div class="wa-msg-header">
        <span class="or-channel-badge ${esc(card.cls)}">${esc(card.label)}</span>
        <button class="or-copy-btn" data-copy="${esc(card.text)}">Copy</button>
      </div>
      <div class="wa-msg-body">
        <div class="wa-msg-text">${esc(card.text)}</div>
        <div class="wa-char-counter${overLimit ? " over" : ""}">${charCount} / 160 chars</div>
        ${card.cls === "whatsapp" ? openBtn : ""}
      </div>
    </div>`;
  }).join("");

  waCards.querySelectorAll(".or-copy-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(btn.dataset.copy).then(() => {
        btn.textContent = "✓ Copied";
        btn.classList.add("copied");
        setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 2000);
      }).catch(() => {
        const ta = document.createElement("textarea");
        ta.value = btn.dataset.copy;
        ta.style.cssText = "position:fixed;opacity:0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        btn.textContent = "✓ Copied";
        btn.classList.add("copied");
        setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 2000);
      });
    });
  });
}

function renderSequence(sequence) {
  const stepLabels = ["", "Step 1 — Cold Intro", "Step 2 — Follow-up", "Step 3 — Final Touch"];
  orMessages.innerHTML = sequence.map(msg => {
    const isEmail     = msg.channel === "Email";
    const channelCls  = isEmail ? "email" : "whatsapp";
    const channelIcon = isEmail ? "📧" : "💬";
    const subjectHtml = isEmail && msg.subject
      ? `<div class="or-msg-subject">Subject: <span>${esc(msg.subject)}</span></div>`
      : "";
    const copyData = isEmail && msg.subject
      ? `Subject: ${msg.subject}\n\n${msg.body}`
      : msg.body;
    const sendBtn = isEmail
      ? `<button class="or-send-btn" data-step="${msg.step}">✉ Send</button>`
      : "";
    return `
    <div class="or-msg-card">
      <div class="or-msg-header">
        <span class="or-step-badge">${esc(stepLabels[msg.step] || "Step " + msg.step)}</span>
        <span class="or-channel-badge ${channelCls}">${channelIcon} ${esc(msg.channel)}</span>
        <div class="or-msg-header-right">
          ${sendBtn}
          <button class="or-copy-btn" data-copy="${esc(copyData)}">Copy</button>
        </div>
      </div>
      <div class="or-msg-body">
        ${subjectHtml}
        <div class="or-msg-text">${esc(msg.body)}</div>
      </div>
    </div>`;
  }).join("");

  // Wire copy buttons
  orMessages.querySelectorAll(".or-copy-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const text = btn.dataset.copy;
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = "✓ Copied";
        btn.classList.add("copied");
        setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 2000);
      }).catch(() => {
        const ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
        btn.textContent = "✓ Copied"; btn.classList.add("copied");
        setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 2000);
      });
    });
  });

  // Wire send buttons
  orMessages.querySelectorAll(".or-send-btn").forEach(btn => {
    const step = parseInt(btn.dataset.step);
    const msg  = sequence.find(m => m.step === step);
    if (msg) btn.addEventListener("click", () => openEmailSendForm(btn, msg));
  });
}

function openEmailSendForm(btn, msg) {
  const card = btn.closest(".or-msg-card");
  // Toggle: if form already open, close it
  const existing = card.querySelector(".or-send-form");
  if (existing) { existing.remove(); btn.classList.remove("active"); return; }

  btn.classList.add("active");
  const form = document.createElement("div");
  form.className = "or-send-form";
  const prefillEmail = orCurrentLead?.email || "";
  form.innerHTML = `
    <div class="or-send-form-inner">
      <input type="email" class="or-send-email" placeholder="Recipient email address" autocomplete="email" value="${esc(prefillEmail)}">
      <button class="or-send-confirm">✉ Send now</button>
      <button class="or-send-cancel">Cancel</button>
    </div>
    <div class="or-send-err"></div>`;

  card.appendChild(form);
  form.querySelector(".or-send-email").focus();

  form.querySelector(".or-send-cancel").addEventListener("click", () => {
    form.remove(); btn.classList.remove("active");
  });

  form.querySelector(".or-send-confirm").addEventListener("click", async () => {
    const to = form.querySelector(".or-send-email").value.trim();
    if (!to || !to.includes("@")) {
      form.querySelector(".or-send-err").textContent = "Enter a valid email address."; return;
    }
    const confirmBtn = form.querySelector(".or-send-confirm");
    confirmBtn.disabled = true; confirmBtn.textContent = "Sending…";
    form.querySelector(".or-send-err").textContent = "";

    try {
      const res = await fetch("/api/email/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to, subject: msg.subject || "(no subject)", body: msg.body || "",
          leadId: orCurrentLead?.id || null, sequenceStep: msg.step || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 400 && (data.error || "").includes("SMTP")) {
          form.querySelector(".or-send-err").innerHTML =
            `${esc(data.error)} <a href="settings.html#email" style="color:var(--blue2)">Configure SMTP →</a>`;
        } else {
          form.querySelector(".or-send-err").textContent = data.error || "Send failed.";
        }
        confirmBtn.disabled = false; confirmBtn.textContent = "✉ Send now"; return;
      }
      const t = new Date(data.sentAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      form.innerHTML = `<div class="or-send-success">✅ Sent at ${t}</div>`;
      btn.textContent = "✓ Sent"; btn.disabled = true; btn.classList.add("or-send-btn-done");
    } catch {
      form.querySelector(".or-send-err").textContent = "Network error. Please try again.";
      confirmBtn.disabled = false; confirmBtn.textContent = "✉ Send now";
    }
  });
}

/* ── Call log panel ─────────────────────────────────────── */
function toggleCallPanel(btn, lead) {
  const card = btn.closest(".crm-card");
  const existing = card.querySelector(".crm-call-panel");
  if (existing) { existing.remove(); btn.classList.remove("active"); return; }
  closeAllPanels(card);
  btn.classList.add("active");

  const panel = document.createElement("div");
  panel.className = "crm-call-panel";
  panel.innerHTML = `
    <div class="crm-panel-label">What happened?</div>
    <div class="crm-outcome-btns">
      <button class="crm-outcome-btn" data-outcome="answered">✅ Answered</button>
      <button class="crm-outcome-btn" data-outcome="no_answer">📵 No Answer</button>
      <button class="crm-outcome-btn" data-outcome="voicemail">📱 Voicemail</button>
      <button class="crm-outcome-btn" data-outcome="callback">🔁 Callback</button>
    </div>
    <input type="text" class="crm-panel-input" placeholder="Notes (optional)" maxlength="300">
    <div class="crm-panel-footer">
      <button class="crm-panel-save" disabled>Save</button>
      <button class="crm-panel-cancel">Cancel</button>
    </div>
    <div class="crm-panel-err"></div>`;

  card.appendChild(panel);

  let selectedOutcome = null;
  const saveBtn = panel.querySelector(".crm-panel-save");

  panel.querySelectorAll(".crm-outcome-btn").forEach(ob => {
    ob.addEventListener("click", () => {
      panel.querySelectorAll(".crm-outcome-btn").forEach(x => x.classList.remove("selected"));
      ob.classList.add("selected");
      selectedOutcome = ob.dataset.outcome;
      saveBtn.disabled = false;
    });
  });

  panel.querySelector(".crm-panel-cancel").addEventListener("click", () => {
    panel.remove(); btn.classList.remove("active");
  });

  saveBtn.addEventListener("click", async () => {
    if (!selectedOutcome) return;
    const notes = panel.querySelector(".crm-panel-input").value.trim();
    saveBtn.disabled = true; saveBtn.textContent = "Saving…";
    try {
      const res  = await fetch(`/api/crm/${lead.id}/call`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome: selectedOutcome, notes }),
      });
      const data = await res.json();
      if (!res.ok) { panel.querySelector(".crm-panel-err").textContent = data.error || "Failed."; saveBtn.disabled = false; saveBtn.textContent = "Save"; return; }
      // Update local entry
      const idx = entries.findIndex(e => e.id === lead.id);
      if (idx !== -1) entries[idx].callLog = data.callLog;
      panel.remove(); btn.classList.remove("active");
      render();
      showToast("Call logged ✓");
    } catch { panel.querySelector(".crm-panel-err").textContent = "Network error."; saveBtn.disabled = false; saveBtn.textContent = "Save"; }
  });
}

/* ── Reminder panel ──────────────────────────────────────── */
function toggleReminderPanel(btn, lead) {
  const card = btn.closest(".crm-card");
  const existing = card.querySelector(".crm-reminder-panel");
  if (existing) { existing.remove(); btn.classList.remove("active"); return; }
  closeAllPanels(card);
  btn.classList.add("active");

  const today = new Date().toISOString().slice(0, 10);
  const existing_date = lead.reminder?.date || "";
  const existing_note = lead.reminder?.note || "";

  const panel = document.createElement("div");
  panel.className = "crm-reminder-panel";
  panel.innerHTML = `
    <div class="crm-panel-label">Follow-up reminder</div>
    <div class="crm-panel-row">
      <input type="date" class="crm-panel-date" value="${esc(existing_date)}" min="${today}">
      <input type="text" class="crm-panel-input" placeholder="Note (optional)" value="${esc(existing_note)}" maxlength="200">
    </div>
    <div class="crm-panel-footer">
      <button class="crm-panel-save">Set Reminder</button>
      <button class="crm-panel-cancel">Cancel</button>
      ${existing_date ? '<button class="crm-panel-clear">Clear</button>' : ""}
    </div>
    <div class="crm-panel-err"></div>`;

  card.appendChild(panel);

  const dateInput = panel.querySelector(".crm-panel-date");
  const noteInput = panel.querySelector(".crm-panel-input");
  const saveBtn   = panel.querySelector(".crm-panel-save");
  const errEl     = panel.querySelector(".crm-panel-err");

  panel.querySelector(".crm-panel-cancel").addEventListener("click", () => {
    panel.remove(); btn.classList.remove("active");
  });

  const clearBtn = panel.querySelector(".crm-panel-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      clearBtn.disabled = true; clearBtn.textContent = "Clearing…";
      await saveReminder(lead, null, panel, btn);
    });
  }

  saveBtn.addEventListener("click", async () => {
    const date = dateInput.value;
    if (!date) { errEl.textContent = "Pick a date."; return; }
    saveBtn.disabled = true; saveBtn.textContent = "Saving…";
    await saveReminder(lead, { date, note: noteInput.value.trim() }, panel, btn);
  });
}

async function saveReminder(lead, reminder, panel, btn) {
  const errEl = panel.querySelector(".crm-panel-err");
  try {
    const res  = await fetch(`/api/crm/${lead.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reminder }),
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || "Failed."; return; }
    const idx = entries.findIndex(e => e.id === lead.id);
    if (idx !== -1) entries[idx].reminder = data.entry.reminder;
    panel.remove(); btn.classList.remove("active");
    render();
    showToast(reminder ? "Reminder set ✓" : "Reminder cleared");
  } catch { errEl.textContent = "Network error."; }
}

function closeAllPanels(card) {
  card.querySelectorAll(".crm-call-panel, .crm-reminder-panel").forEach(p => p.remove());
  card.querySelectorAll(".crm-call-btn, .crm-reminder-btn").forEach(b => b.classList.remove("active"));
}

/* ── Auth notice ─────────────────────────────────────── */
function showAuthNotice() {
  document.getElementById("crm-board").innerHTML =
    `<div class="crm-notice">Please <a href="signin.html">sign in</a> to access your CRM pipeline.</div>`;
  document.getElementById("crm-stats").style.display = "none";
}

/* ── Expose for leads.js cross-page push ─────────────── */
window.openCrmModal = openModal;

/* ── Util ────────────────────────────────────────────── */
function esc(s) {
  const d = document.createElement("div");
  d.textContent = String(s || "");
  return d.innerHTML;
}

/* ── Init ────────────────────────────────────────────── */
render();
loadEntries();
loadCrmScoreCache();
loadUserCaps();
