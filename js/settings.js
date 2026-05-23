/* ── eureach.eu — Settings: My Sites ────────────────── */
const MAX_SITES = 3;
const STORE_KEY = "eureach_sites";

function loadSites() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); } catch { return []; }
}
function saveSites(sites) {
  localStorage.setItem(STORE_KEY, JSON.stringify(sites));
}

/* ── Render site cards ───────────────────────────────── */
function renderSites() {
  const sites = loadSites();
  const grid  = document.getElementById("st-sites-grid");
  const addBtn = document.getElementById("st-add-btn");

  addBtn.disabled = sites.length >= MAX_SITES;
  addBtn.title    = sites.length >= MAX_SITES ? `Limit of ${MAX_SITES} sites reached on Pro plan` : "";

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
        <button class="st-site-btn st-site-btn-danger" onclick="deleteSite(${s.id})">🗑 Remove</button>
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
  const sites = loadSites();
  editingId = id || null;

  const form  = document.getElementById("st-site-form");
  const title = document.getElementById("st-modal-title");

  // reset
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
    // default: check English
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
function saveSite(e) {
  e.preventDefault();
  const sites = loadSites();

  const langs = [...document.querySelectorAll("#st-lang-chips input:checked")].map(c => c.value);
  if (!langs.length) {
    alert("Please select at least one language.");
    return;
  }

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
    addedAt:   editingId ? (sites.find(s => s.id === editingId)?.addedAt || new Date().toISOString()) : new Date().toISOString(),
  };

  if (editingId) {
    const idx = sites.findIndex(s => s.id === editingId);
    if (idx !== -1) sites[idx] = site;
  } else {
    if (sites.length >= MAX_SITES) {
      alert(`You can only add up to ${MAX_SITES} sites on the Pro plan.`);
      return;
    }
    sites.push(site);
  }

  saveSites(sites);
  closeModal();
  renderSites();
  showToast(editingId ? "Site updated" : "Site added");
}

/* ── Delete site ─────────────────────────────────────── */
function deleteSite(id) {
  const sites = loadSites();
  const site  = sites.find(s => s.id === id);
  if (!site) return;
  if (!confirm(`Remove "${site.name || site.domain}" from your sites?`)) return;
  saveSites(sites.filter(s => s.id !== id));
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

/* ── Init ────────────────────────────────────────────── */
renderSites();
