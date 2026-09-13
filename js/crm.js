/* ── i18n helper ────────────────────────────────────────── */
function T(k,fb){var l=window.euLang?window.euLang():'en';var t=window.EUREACH_T;return(t&&t[l]&&t[l][k])||fb||k;}

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
    const signInBtn  = document.querySelector('a[href="signin.html"].btn-ghost');
    const profileBtn = document.getElementById("nav-profile-btn");
    if (!res.ok) {
      if (profileBtn) profileBtn.style.display = "none";
      return;
    }
    const { user } = await res.json();
    if (!user) { if (profileBtn) profileBtn.style.display = "none"; return; }

    // Nav auth state
    if (signInBtn)  signInBtn.style.display  = "none";
    if (profileBtn) profileBtn.textContent   = (user.firstName?.[0] || user.email?.[0] || "U").toUpperCase();

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
    const saveBtn = document.getElementById("crm-save-btn");
    if (saveBtn) saveBtn.style.display = entries.length ? "" : "none";
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

function cardHTML(e) {
  const s = crmScoreMap[crmScoreKey(e.leadName, e.city)];
  const scoreBadge = s
    ? `<div class="crm-score-badge tier-${s.tier}" title="${esc(s.reasoning || "")}">${crmTierIcon(s.tier)} ${s.score}</div>`
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
    </div>
    <textarea class="crm-card-notes" data-id="${e.id}" placeholder="Add notes…">${esc(e.notes || "")}</textarea>
    <div class="crm-card-footer">
      <select class="crm-status-select" data-id="${e.id}">
        <option value="found"     ${e.status === "found"     ? "selected" : ""}>🔵 Found</option>
        <option value="contacted" ${e.status === "contacted" ? "selected" : ""}>🟡 Contacted</option>
        <option value="replied"   ${e.status === "replied"   ? "selected" : ""}>🟣 Replied</option>
        <option value="closed"    ${e.status === "closed"    ? "selected" : ""}>🟢 Closed</option>
      </select>
      <button class="crm-delete-btn" data-id="${e.id}" title="Remove">✕</button>
    </div>
    <button class="crm-outreach-btn" data-id="${e.id}">✨ Generate Outreach</button>
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
    modalErr.textContent = T("crm.nameRequired","Business name is required.");
    modalErr.classList.add("visible");
    document.getElementById("m-name").focus();
    return;
  }
  saveBtn.disabled = true;
  saveBtn.textContent = T("crm.adding","Adding…");

  const err = await createEntry({
    leadName,
    businessType: document.getElementById("m-type").value.trim(),
    city:         document.getElementById("m-city").value.trim(),
    phone:        document.getElementById("m-phone").value.trim() || null,
    website:      document.getElementById("m-website").value.trim() || null,
    notes:        document.getElementById("m-notes").value.trim(),
  });

  saveBtn.disabled = false;
  saveBtn.textContent = T("crm.addBtn","Add to Pipeline");

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
  document.getElementById("or-modal-title").textContent  = T("crm.genOutreach","Generate Outreach");

  // Auto-set language from city
  const detectedLang = detectLang(lead);
  document.getElementById("or-language").value = detectedLang;
  document.getElementById("wa-language").value = detectedLang;
  handleOrLangChange(detectedLang);

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

function handleOrLangChange(lang) {
  const row  = document.getElementById("or-gdpr-row");
  const chk  = document.getElementById("or-gdpr");
  const info = document.getElementById("or-gdpr-info");
  if (!row) return;
  if (lang === "german") {
    row.style.display = "block";
    if (chk) chk.checked = true;
    if (info) info.style.display = "block";
  } else {
    row.style.display = lang === "english" ? "none" : "block";
    if (info) info.style.display = "none";
  }
}

orGenerateBtn.addEventListener("click", () => runGenerate());
orRegenBtn.addEventListener("click", () => { showOrView("form"); });
waGenerateBtn.addEventListener("click", () => runWA());

async function runGenerate() {
  if (!orCurrentLead) return;

  const language     = document.getElementById("or-language").value;
  const tone         = document.getElementById("or-tone").value;
  const gdprCompliant = document.getElementById("or-gdpr")?.checked || false;

  orGenerateBtn.disabled = true;
  orGenerateBtn.textContent = T("crm.generating","Generating…");
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
        gdprCompliant,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      showOrView("form");
      if (res.status === 403 && data.error === "insufficient_credits") { closeOutreachModal(); showLimitModal("outreach"); return; }
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
    orGenerateBtn.textContent = T("crm.genSeq","✨ Generate Sequence");
  }
}

async function runWA() {
  if (!orCurrentLead) return;

  const language    = document.getElementById("wa-language").value;
  const messageType = document.getElementById("wa-message-type").value;
  const phone       = document.getElementById("wa-phone").value.trim();

  waGenerateBtn.disabled = true;
  waGenerateBtn.textContent = T("crm.generating","Generating…");
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
      if (res.status === 403 && data.error === "insufficient_credits") { closeOutreachModal(); showLimitModal("whatsapp"); return; }
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
    waGenerateBtn.textContent = T("crm.genMsgs","✨ Generate Messages");
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
  form.innerHTML = `
    <div class="or-send-form-inner">
      <input type="email" class="or-send-email" placeholder="Recipient email address" autocomplete="email">
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

/* ── Save pipeline list ──────────────────────────────── */
document.getElementById("crm-save-btn").addEventListener("click", saveCrmList);

async function saveCrmList() {
  if (!entries.length) return;
  const btn = document.getElementById("crm-save-btn");
  btn.disabled = true;
  btn.textContent = "Saving…";
  const label = "Pipeline snapshot · " + new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const results = entries.map(e => ({
    leadName: e.leadName, businessType: e.businessType || "",
    city: e.city || "", phone: e.phone || "", website: e.website || "",
    status: e.status, notes: e.notes || "",
  }));
  try {
    const res = await fetch("/api/crm/saved-lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, results }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Save failed."); return; }
    btn.textContent = "✓ Saved!";
    setTimeout(() => { btn.textContent = "💾 Save List"; btn.disabled = false; }, 2500);
    loadCrmSavedLists();
  } catch {
    alert("Network error. Please try again.");
  } finally {
    btn.disabled = false;
  }
}

/* ── Saved CRM lists view ────────────────────────────── */
async function loadCrmSavedLists() {
  try {
    const res = await fetch("/api/crm/saved-lists");
    if (!res.ok) return;
    const { savedLists } = await res.json();
    renderCrmSavedLists(savedLists || []);
  } catch {}
}

function renderCrmSavedLists(lists) {
  const section = document.getElementById("crm-saved-section");
  const grid    = document.getElementById("crm-saved-grid");
  const count   = document.getElementById("crm-saved-count");
  if (!section) return;
  if (!lists.length) { section.style.display = "none"; return; }
  section.style.display = "";
  if (count) count.textContent = lists.length;
  grid.innerHTML = "";
  [...lists].reverse().forEach(s => {
    const card = document.createElement("div");
    card.className = "ct-saved-card";
    card.innerHTML = `
      <div class="ct-saved-card-head">
        <div class="ct-saved-card-info">
          <div class="ct-saved-card-label">${esc(s.label)}</div>
          <div class="ct-saved-card-meta">${s.results.length} leads · Saved ${new Date(s.savedAt).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}</div>
        </div>
        <div class="ct-saved-card-actions">
          <button class="ct-saved-toggle ct-btn">▾ Show</button>
          <button class="ct-saved-delete ct-btn ct-btn-danger">✕</button>
        </div>
      </div>
      <div class="ct-saved-results" style="display:none">
        ${s.results.map(r => `
        <div class="ct-result-card">
          <div class="ct-result-info">
            <div class="ct-result-name">${esc(r.leadName)}</div>
            <div class="ct-result-meta">
              ${r.businessType ? `<span>🏢 ${esc(r.businessType)}</span>` : ""}
              ${r.city         ? `<span>📍 ${esc(r.city)}</span>` : ""}
              ${r.phone        ? `<span>📞 ${esc(r.phone)}</span>` : ""}
              ${r.website      ? `<span>🌐 ${esc(r.website)}</span>` : ""}
              <span class="crm-status-tag crm-status-${esc(r.status)}">${esc(r.status)}</span>
            </div>
          </div>
        </div>`).join("")}
      </div>`;
    card.querySelector(".ct-saved-toggle").addEventListener("click", function () {
      const res = card.querySelector(".ct-saved-results");
      const open = res.style.display !== "none";
      res.style.display = open ? "none" : "";
      this.textContent = open ? "▾ Show" : "▴ Hide";
    });
    card.querySelector(".ct-saved-delete").addEventListener("click", () => deleteCrmSavedList(s.id));
    grid.appendChild(card);
  });
}

async function deleteCrmSavedList(id) {
  if (!confirm("Delete this saved list?")) return;
  try {
    const res = await fetch(`/api/crm/saved-lists/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    loadCrmSavedLists();
  } catch {}
}

/* ── Init ────────────────────────────────────────────── */
render();
loadEntries();
loadCrmScoreCache();
loadUserCaps();
loadCrmSavedLists();
