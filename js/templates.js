/* ── i18n helper ────────────────────────────────────────── */
function T(k,fb){var l=window.euLang?window.euLang():'en';var t=window.EUREACH_T;return(t&&t[l]&&t[l][k])||fb||k;}

/* ── eureach.eu — Email Templates ───────────────────── */
(function () {

  let currentView = "form";   // "form" | "list"
  let lastGenerated = null;   // last AI result
  let templatesLeft = null;   // null = unknown yet

  /* ── Bootstrap ───────────────────────────────────── */
  async function init() {
    await loadUser();
    bindNav();
    showView("form");
  }

  async function loadUser() {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) return;
      const { user } = await res.json();
      if (!user) return;
      // Update nav sign-in link
      const signInEl = document.getElementById("et-signin-link");
      if (signInEl) {
        signInEl.textContent = user.firstName || "Account";
        signInEl.href = "settings.html";
      }
      // Update credits
      templatesLeft = user.templatesLeft;
      renderCredits();
    } catch {}
  }

  function renderCredits() {
    const el = document.getElementById("et-credits-val");
    if (!el) return;
    if (templatesLeft === -1) {
      el.textContent = "Unlimited";
    } else if (templatesLeft !== null) {
      el.textContent = String(templatesLeft);
    } else {
      el.textContent = "—";
    }
  }

  /* ── View toggling ───────────────────────────────── */
  function bindNav() {
    document.getElementById("et-tab-form").addEventListener("click", () => showView("form"));
    document.getElementById("et-tab-list").addEventListener("click", () => showView("list"));
    document.getElementById("et-new-btn").addEventListener("click", () => showView("form"));
    document.getElementById("et-gate-close").addEventListener("click", () => {
      document.getElementById("et-gate-overlay").classList.remove("open");
    });
    document.getElementById("et-generate-btn").addEventListener("click", onGenerate);
  }

  function showView(v) {
    currentView = v;
    document.getElementById("et-tab-form").classList.toggle("active", v === "form");
    document.getElementById("et-tab-list").classList.toggle("active", v === "list");
    document.getElementById("et-form-section").style.display = v === "form" ? "" : "none";
    document.getElementById("et-list-section").style.display = v === "list" ? "" : "none";
    if (v === "list") loadList();
  }

  /* ── Generate ────────────────────────────────────── */
  async function onGenerate() {
    const name         = document.getElementById("et-name").value.trim();
    const templateType = document.getElementById("et-type").value;
    const purpose      = document.getElementById("et-purpose").value;
    const language     = document.getElementById("et-lang").value;
    const tone         = document.getElementById("et-tone").value;
    const context      = document.getElementById("et-context").value.trim();

    if (!name) { setStatus("et-form-status", "err", T("et.nameRequired","Please enter a template name.")); return; }
    if (!context) { setStatus("et-form-status", "err", T("et.contextRequired","Please enter a business context.")); return; }

    // Check credits
    if (templatesLeft !== null && templatesLeft !== -1 && templatesLeft <= 0) {
      document.getElementById("et-gate-overlay").classList.add("open");
      return;
    }

    setStatus("et-form-status", "", "");
    const btn = document.getElementById("et-generate-btn");
    btn.disabled = true;
    btn.textContent = T("et.generating","Generating…");

    // Show spinner, hide preview
    document.getElementById("et-preview-section").style.display = "none";
    document.getElementById("et-generating").style.display = "flex";

    try {
      const res = await fetch("/api/templates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, templateType, purpose, language, tone, context }),
      });
      const data = await res.json();

      document.getElementById("et-generating").style.display = "none";

      if (!res.ok) {
        if (data.error === "limit_reached") {
          document.getElementById("et-gate-overlay").classList.add("open");
        } else {
          setStatus("et-form-status", "err", data.error || "Generation failed.");
        }
        btn.disabled = false;
        btn.textContent = T("et.generateBtn","✨ Generate Template");
        return;
      }

      lastGenerated = data.template;
      if (data.templatesLeft !== undefined) {
        templatesLeft = data.templatesLeft;
        renderCredits();
      }

      renderPreview(data.template);
      document.getElementById("et-preview-section").style.display = "";
      setStatus("et-form-status", "ok", "Template generated. Review and save below.");
    } catch (err) {
      document.getElementById("et-generating").style.display = "none";
      setStatus("et-form-status", "err", "Network error.");
    }

    btn.disabled = false;
    btn.textContent = T("et.generateBtn","✨ Generate Template");
  }

  function renderPreview(tmpl) {
    document.getElementById("et-preview-name").textContent = tmpl.name;
    document.getElementById("et-preview-subject").textContent = tmpl.subject;
    // Highlight placeholders in body
    const bodyEl = document.getElementById("et-preview-body");
    bodyEl.innerHTML = esc(tmpl.body).replace(
      /\{\{(\w+)\}\}/g,
      '<span class="et-placeholder">{{$1}}</span>'
    );
    // Wire save button
    const saveBtn = document.getElementById("et-save-btn");
    saveBtn.disabled = false;
    saveBtn.textContent = T("et.saved","💾 Template Saved");
    saveBtn.classList.remove("saved");
    saveBtn.onclick = null;
    // Already saved on generate — just show confirmation
    saveBtn.textContent = T("et.saved","✓ Saved");
    saveBtn.disabled = true;

    // Wire discard (new) button
    document.getElementById("et-discard-btn").onclick = () => {
      document.getElementById("et-preview-section").style.display = "none";
      lastGenerated = null;
    };
  }

  /* ── List ────────────────────────────────────────── */
  async function loadList() {
    const container = document.getElementById("et-list-body");
    container.innerHTML = '<div style="color:var(--muted);font-size:0.85rem;padding:20px">${T("et.loading","Loading…")}</div>';
    try {
      const res = await fetch("/api/templates");
      if (res.status === 401) {
        container.innerHTML = '<div class="et-empty"><div class="et-empty-icon">✉</div><div class="et-empty-title">${T("et.signInTitle","Please sign in")}</div><div class="et-empty-sub"><a href="signin.html" style="color:#93c5fd">Sign in</a> to view your templates</div></div>';
        return;
      }
      const data = await res.json();
      const list = data.templates || [];
      if (!list.length) {
        container.innerHTML = '<div class="et-empty"><div class="et-empty-icon">✉</div><div class="et-empty-title">${T("et.noTemplates","No templates yet")}</div><div class="et-empty-sub">${T("et.noTemplatesSub","Generate your first template to get started")}</div></div>';
        return;
      }
      container.innerHTML = '<div class="et-grid-cards">' + list.map(cardHTML).join("") + '</div>';
      container.querySelectorAll(".et-card-del-btn").forEach(btn => {
        btn.addEventListener("click", () => deleteTemplate(btn.dataset.id));
      });
      container.querySelectorAll(".et-card-use-btn").forEach(btn => {
        btn.addEventListener("click", () => copyTemplate(btn.dataset.id, list));
      });
    } catch {
      container.innerHTML = '<div class="et-empty"><div class="et-empty-icon">⚠</div><div class="et-empty-title">${T("et.failedLoad","Failed to load")}</div></div>';
    }
  }

  function cardHTML(t) {
    const date = new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const subjectPreview = t.subject.length > 60 ? t.subject.slice(0, 57) + "…" : t.subject;
    return `
    <div class="et-card" data-id="${esc(t.id)}">
      <div>
        <div class="et-card-name">${esc(t.name)}</div>
        <span class="et-card-type">${esc(t.templateType)}</span>${t.purpose ? ` <span class="et-card-purpose">${esc(t.purpose)}</span>` : ''}
      </div>
      <div class="et-card-subject" title="${esc(t.subject)}">${esc(subjectPreview)}</div>
      <div class="et-card-meta">${esc(t.language)} · ${esc(t.tone)} · ${date}</div>
      <div class="et-card-footer">
        <button class="et-card-use-btn" data-id="${esc(t.id)}">📋 Use</button>
        <button class="et-card-del-btn" data-id="${esc(t.id)}">✕ Delete</button>
      </div>
    </div>`;
  }

  async function deleteTemplate(id) {
    if (!confirm("Delete this template?")) return;
    try {
      const res = await fetch("/api/templates/" + id, { method: "DELETE" });
      if (res.ok) loadList();
    } catch {}
  }

  function copyTemplate(id, list) {
    const tmpl = list.find(t => t.id === id);
    if (!tmpl) return;
    const text = "Subject: " + tmpl.subject + "\n\n" + tmpl.body;
    navigator.clipboard.writeText(text).then(() => {
      showToast("Copied to clipboard");
    }).catch(() => {
      showToast("Subject: " + tmpl.subject.slice(0, 40) + "…");
    });
  }

  /* ── Helpers ─────────────────────────────────────── */
  function esc(s) {
    const d = document.createElement("div");
    d.textContent = String(s || "");
    return d.innerHTML;
  }

  function setStatus(id, type, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.className = "et-status " + type;
  }

  function showToast(msg) {
    let t = document.getElementById("et-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "et-toast";
      t.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:rgba(30,40,70,0.97);border:1px solid var(--border);border-radius:10px;padding:10px 22px;font-size:0.85rem;font-weight:600;color:var(--white);z-index:9999;transition:opacity 0.3s;";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    clearTimeout(t._to);
    t._to = setTimeout(() => { t.style.opacity = "0"; }, 2500);
  }

  init();

})();
