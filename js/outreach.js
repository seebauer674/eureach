/* ── eureach.eu — Outreach Sequences ─────────────────── */
(function () {
  let allQueue    = [];
  let currentSeq  = null; // generated sequence waiting to be enqueued
  let smtpOk      = false;

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = String(s || "");
    return d.innerHTML;
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" })
      + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  function isToday(iso) {
    if (!iso) return false;
    const d = new Date(iso);
    const now = new Date();
    return d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate();
  }

  function isPast(iso) {
    return iso && new Date(iso) <= new Date();
  }

  // ── Stats ──────────────────────────────────────────────
  function renderStats() {
    const active    = allQueue.filter(q => q.status === "active").length;
    const completed = allQueue.filter(q => q.status === "completed").length;
    const sent      = allQueue.reduce((n, q) => n + q.steps.filter(s => s.status === "sent" && s.channel === "Email").length, 0);
    const due       = allQueue.filter(q => q.status === "active" && q.steps.some(s => s.status === "pending" && isPast(s.scheduledFor))).length;
    document.getElementById("stat-active").textContent = active;
    document.getElementById("stat-sent").textContent   = sent;
    document.getElementById("stat-due").textContent    = due;
    document.getElementById("stat-done").textContent   = completed;
  }

  // ── Queue rendering ───────────────────────────────────
  function renderQueue(rows) {
    const wrap = document.getElementById("or-queue-wrap");
    if (!rows.length) {
      wrap.innerHTML = `
        <div class="or-empty">
          <div class="or-empty-icon">📨</div>
          <div class="or-empty-title">No sequences yet</div>
          <div class="or-empty-sub">Generate a sequence for a lead and add it to the send queue.</div>
          <button class="btn btn-primary" onclick="switchTab('new')" style="margin-top:16px;font-size:0.85rem">+ New Sequence</button>
        </div>`;
      return;
    }

    wrap.innerHTML = rows.map(entry => {
      const stepsDone  = entry.steps.filter(s => s.status === "sent").length;
      const totalEmail = entry.steps.filter(s => s.channel === "Email").length;
      const pct        = Math.round((stepsDone / entry.steps.length) * 100);

      const nextStep   = entry.steps.find(s => s.status === "pending");
      const nextDue    = nextStep ? nextStep.scheduledFor : null;
      const isDue      = nextDue && isPast(nextDue) && entry.status === "active";

      const statusBadge = {
        active:    '<span class="or-badge or-badge-active">Active</span>',
        paused:    '<span class="or-badge or-badge-paused">Paused</span>',
        completed: '<span class="or-badge or-badge-done">Completed</span>',
        stopped:   '<span class="or-badge or-badge-stopped">Stopped</span>',
      }[entry.status] || "";

      const stepsHtml = entry.steps.map(s => {
        const cls = s.status === "sent" ? "or-step-done"
                  : (isPast(s.scheduledFor) && entry.status === "active") ? "or-step-due"
                  : "or-step-pending";
        const icon = s.channel === "Email" ? "✉" : "💬";
        const label = s.status === "sent" ? `Sent ${fmtDate(s.sentAt)}`
                    : `${s.channel} · ${isPast(s.scheduledFor) ? "Due now" : fmtDate(s.scheduledFor)}`;
        const sendBtn = s.status !== "sent" && entry.status === "active"
          ? `<button class="or-send-btn ${isPast(s.scheduledFor) ? "or-send-due" : ""}"
               onclick="sendStep('${esc(entry.id)}', ${s.step}, this)"
               title="Send now">${s.channel === "Email" ? "Send now" : "Mark sent"}</button>` : "";
        return `<div class="or-step-row ${cls}">
          <span class="or-step-icon">${icon}</span>
          <span class="or-step-label">Step ${s.step} · ${esc(label)}</span>
          ${sendBtn}
        </div>`;
      }).join("");

      const pauseBtn = entry.status === "active"
        ? `<button class="or-ctrl-btn" onclick="updateStatus('${esc(entry.id)}','pause',this)">⏸ Pause</button>`
        : entry.status === "paused"
        ? `<button class="or-ctrl-btn" onclick="updateStatus('${esc(entry.id)}','resume',this)">▶ Resume</button>`
        : "";
      const stopBtn = (entry.status === "active" || entry.status === "paused")
        ? `<button class="or-ctrl-btn or-ctrl-stop" onclick="updateStatus('${esc(entry.id)}','stop',this)">✕ Stop</button>`
        : "";

      return `
        <div class="or-card" id="card-${esc(entry.id)}">
          <div class="or-card-head">
            <div class="or-card-info">
              <div class="or-card-name">${esc(entry.leadName)}</div>
              <div class="or-card-meta">${esc(entry.leadEmail)}${entry.businessType ? " · " + esc(entry.businessType) : ""}${entry.city ? " · " + esc(entry.city) : ""}</div>
            </div>
            <div class="or-card-right">
              ${statusBadge}
              ${isDue ? '<span class="or-due-flag">⚡ Due now</span>' : ""}
            </div>
          </div>
          <div class="or-progress-bar">
            <div class="or-progress-fill" style="width:${pct}%"></div>
          </div>
          <div class="or-steps-wrap">${stepsHtml}</div>
          <div class="or-card-foot">
            <span class="or-card-date">Started ${fmtDate(entry.createdAt)}</span>
            <div class="or-card-controls">${pauseBtn}${stopBtn}
              <button class="or-ctrl-btn or-ctrl-pipeline"
                onclick="addOutreachToPipeline('${esc(entry.id)}','${esc(entry.leadName)}','${esc(entry.leadEmail)}','${esc(entry.businessType||'')}','${esc(entry.city||'')}',this)"
                title="Add to Pipeline">📊 Pipeline</button></div>
          </div>
        </div>`;
    }).join("");
  }

  function applyFilters() {
    const q      = (document.getElementById("or-search").value || "").toLowerCase();
    const status = document.getElementById("or-status-filter").value;
    const rows   = allQueue.filter(e => {
      const matchQ = !q || (e.leadName || "").toLowerCase().includes(q) || (e.leadEmail || "").toLowerCase().includes(q);
      const matchS = !status || e.status === status;
      return matchQ && matchS;
    });
    renderQueue(rows);
  }

  // ── Tab switching ──────────────────────────────────────
  window.switchTab = function (name) {
    document.querySelectorAll(".or-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    document.getElementById("tab-queue").style.display = name === "queue" ? "" : "none";
    document.getElementById("tab-new").style.display   = name === "new"   ? "" : "none";
  };

  // ── Send a step ────────────────────────────────────────
  window.sendStep = async function (queueId, step, btn) {
    if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
    try {
      const res  = await fetch("/api/outreach/send-step", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": window._csrf || "" },
        body: JSON.stringify({ queueId, step }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Send failed");
        if (btn) { btn.disabled = false; btn.textContent = step === 3 ? "Mark sent" : "Send now"; }
        return;
      }
      await loadQueue();
    } catch {
      if (btn) { btn.disabled = false; btn.textContent = "Send now"; }
    }
  };

  // ── Pause / resume / stop ──────────────────────────────
  window.updateStatus = async function (queueId, action, btn) {
    if (btn) btn.disabled = true;
    try {
      const res  = await fetch("/api/outreach/update", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": window._csrf || "" },
        body: JSON.stringify({ queueId, action }),
      });
      if (res.ok) await loadQueue();
    } catch {}
    if (btn) btn.disabled = false;
  };

  // ── Load queue ─────────────────────────────────────────
  async function loadQueue() {
    try {
      const res  = await fetch("/api/outreach/queue");
      if (res.status === 401) { showAuthNotice(); return; }
      const data = await res.json();
      allQueue   = data.queue || [];
      renderStats();
      applyFilters();
      const saveBtn = document.getElementById("or-save-list-btn");
      if (saveBtn) saveBtn.style.display = allQueue.length ? "" : "none";
    } catch {
      document.getElementById("or-queue-wrap").innerHTML =
        `<div class="or-empty"><div class="or-empty-icon">⚠</div><div class="or-empty-title">Failed to load</div></div>`;
    }
  }

  // ── Check SMTP ─────────────────────────────────────────
  async function checkSmtp() {
    try {
      const res  = await fetch("/api/email/smtp");
      if (!res.ok) return;
      const data = await res.json();
      smtpOk = !!data.connected;
      document.getElementById("or-no-smtp").style.display = smtpOk ? "none" : "";
    } catch {}
  }

  // ── Generate sequence ──────────────────────────────────
  document.getElementById("nf-generate-btn").addEventListener("click", async function () {
    const leadName = document.getElementById("nf-lead-name").value.trim();
    const email    = document.getElementById("nf-lead-email").value.trim();
    if (!leadName) { alert("Please enter a lead name."); return; }
    if (!email || !email.includes("@")) { alert("Please enter a valid email address."); return; }
    if (!smtpOk) { alert("Please connect your SMTP email first in Settings → Email."); return; }

    const btn = this;
    btn.disabled = true;
    btn.textContent = "✦ Generating…";

    try {
      const res  = await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": window._csrf || "" },
        body: JSON.stringify({
          leadName,
          businessType: document.getElementById("nf-biz-type").value.trim(),
          city:         document.getElementById("nf-city").value.trim(),
          language:     document.getElementById("nf-lang").value,
          tone:         document.getElementById("nf-tone").value,
          gdprCompliant: document.getElementById("nf-gdpr").checked,
        }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Generation failed"); return; }

      currentSeq = { sequenceId: data.sequenceId, sequence: data.sequence, leadName, leadEmail: email,
        businessType: document.getElementById("nf-biz-type").value.trim(),
        city: document.getElementById("nf-city").value.trim() };
      renderPreview(data.sequence);
      document.getElementById("nf-preview-wrap").style.display = "";
    } catch {
      alert("Failed to generate sequence. Try again.");
    } finally {
      btn.disabled = false;
      btn.textContent = "✦ Generate sequence with AI";
    }
  });

  function renderPreview(sequence) {
    const wrap = document.getElementById("nf-steps-preview");
    const labels = { 1: "Cold introduction", 2: "Follow-up (Day 3)", 3: "WhatsApp (Day 7)" };
    wrap.innerHTML = sequence.map((s, i) => `
      <div class="or-preview-step">
        <div class="or-preview-step-head">
          <span class="or-preview-num">Step ${s.step}</span>
          <span class="or-preview-channel">${esc(s.channel)}</span>
          <span class="or-preview-label">${labels[s.step] || ""}</span>
        </div>
        ${s.subject ? `<div class="or-preview-subject">Subject: <strong>${esc(s.subject)}</strong></div>` : ""}
        <div class="or-preview-body">${esc(s.body)}</div>
      </div>`).join("");
  }

  // ── Enqueue ────────────────────────────────────────────
  document.getElementById("nf-enqueue-btn").addEventListener("click", async function () {
    if (!currentSeq) return;
    const btn = this;
    btn.disabled = true;
    btn.textContent = "Adding to queue…";
    try {
      const res  = await fetch("/api/outreach/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": window._csrf || "" },
        body: JSON.stringify(currentSeq),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Failed to enqueue"); return; }
      currentSeq = null;
      document.getElementById("nf-preview-wrap").style.display = "none";
      document.getElementById("nf-lead-name").value  = "";
      document.getElementById("nf-lead-email").value = "";
      document.getElementById("nf-biz-type").value   = "";
      document.getElementById("nf-city").value        = "";
      document.getElementById("nf-steps-preview").innerHTML = "";
      await loadQueue();
      switchTab("queue");
    } catch {
      alert("Failed to add to queue. Try again.");
    } finally {
      btn.disabled = false;
      btn.textContent = "📨 Add to send queue";
    }
  });

  function showAuthNotice() {
    document.getElementById("or-queue-wrap").innerHTML =
      `<div class="or-empty"><div class="or-empty-icon">🔒</div>
       <div class="or-empty-title">Please <a href="signin.html">sign in</a> to use Outreach.</div></div>`;
  }

  // ── Nav auth state ────────────────────────────────────
  async function loadNavState() {
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
      if (signInBtn)  signInBtn.style.display  = "none";
      if (profileBtn) profileBtn.textContent   = (user.firstName?.[0] || user.email?.[0] || "U").toUpperCase();
    } catch {}
  }

  // ── Save outreach list ────────────────────────────────
  document.getElementById("or-save-list-btn").addEventListener("click", saveOutreachList);

  async function saveOutreachList() {
    const filtered = getFilteredQueue();
    if (!filtered.length) return;
    const btn = document.getElementById("or-save-list-btn");
    btn.disabled = true;
    btn.textContent = "Saving…";
    const statusFilter = document.getElementById("or-status-filter").value;
    const label = (statusFilter ? statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1) + " sequences" : "All sequences")
      + " · " + new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const results = filtered.map(e => ({
      leadName: e.leadName, leadEmail: e.leadEmail,
      businessType: e.businessType || "", city: e.city || "",
      status: e.status, stepsDone: e.steps.filter(s => s.status === "sent").length,
      totalSteps: e.steps.length,
    }));
    try {
      const res = await fetch("/api/outreach/saved-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": window._csrf || "" },
        body: JSON.stringify({ label, results }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Save failed."); return; }
      btn.textContent = "✓ Saved!";
      setTimeout(() => { btn.textContent = "💾 Save List"; btn.disabled = false; }, 2500);
      loadSavedOutreachLists();
    } catch {
      alert("Network error. Please try again.");
    } finally {
      btn.disabled = false;
    }
  }

  function getFilteredQueue() {
    const q      = (document.getElementById("or-search").value || "").toLowerCase();
    const status = document.getElementById("or-status-filter").value;
    return allQueue.filter(e => {
      const matchQ = !q || (e.leadName || "").toLowerCase().includes(q) || (e.leadEmail || "").toLowerCase().includes(q);
      const matchS = !status || e.status === status;
      return matchQ && matchS;
    });
  }

  // ── Saved lists view ───────────────────────────────────
  async function loadSavedOutreachLists() {
    try {
      const res = await fetch("/api/outreach/saved-lists");
      if (!res.ok) return;
      const { savedLists } = await res.json();
      renderSavedOutreachLists(savedLists || []);
    } catch {}
  }

  function renderSavedOutreachLists(lists) {
    const section = document.getElementById("or-saved-section");
    const grid    = document.getElementById("or-saved-grid");
    const count   = document.getElementById("or-saved-count");
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
            <div class="ct-saved-card-meta">${s.results.length} contacts · Saved ${fmtDate2(s.savedAt)}</div>
          </div>
          <div class="ct-saved-card-actions">
            <button class="ct-saved-toggle ct-btn">▾ Show</button>
            <button class="ct-saved-delete ct-btn ct-btn-danger" data-id="${esc(s.id)}">✕</button>
          </div>
        </div>
        <div class="ct-saved-results" style="display:none">
          ${s.results.map(r => `
          <div class="ct-result-card">
            <div class="ct-result-info">
              <div class="ct-result-name">${esc(r.leadName)}</div>
              <div class="ct-result-meta">
                ${r.leadEmail ? `<span>✉ ${esc(r.leadEmail)}</span>` : ""}
                ${r.businessType ? `<span>🏢 ${esc(r.businessType)}</span>` : ""}
                ${r.city ? `<span>📍 ${esc(r.city)}</span>` : ""}
                <span>Status: ${esc(r.status)} · ${r.stepsDone}/${r.totalSteps} steps</span>
              </div>
            </div>
          </div>`).join("")}
        </div>`;
      card.querySelector(".ct-saved-toggle").addEventListener("click", function () {
        const results = card.querySelector(".ct-saved-results");
        const open = results.style.display !== "none";
        results.style.display = open ? "none" : "";
        this.textContent = open ? "▾ Show" : "▴ Hide";
      });
      card.querySelector(".ct-saved-delete").addEventListener("click", () => deleteSavedOutreachList(s.id));
      grid.appendChild(card);
    });
  }

  async function deleteSavedOutreachList(id) {
    if (!confirm("Delete this saved list?")) return;
    try {
      const res = await fetch(`/api/outreach/saved-lists/${id}`, {
        method: "DELETE",
        headers: { "X-CSRF-Token": window._csrf || "" },
      });
      if (!res.ok) return;
      loadSavedOutreachLists();
    } catch {}
  }

  function fmtDate2(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }


  // ── Add outreach contact to pipeline ─────────────────
  window.addOutreachToPipeline = async function(queueId, leadName, leadEmail, businessType, city, btn) {
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window._csrf || '' },
        body: JSON.stringify({
          name:     leadName,
          city:     city         || '',
          category: businessType || '',
          email:    leadEmail    || null,
          stage:    'contacted',
        }),
      });
      if (res.status === 409) {
        if (btn) { btn.textContent = '✓ In Pipeline'; btn.disabled = true; }
        return;
      }
      if (!res.ok) {
        const d = await res.json();
        alert(d.error || 'Failed to add to pipeline');
        if (btn) { btn.disabled = false; btn.textContent = '📊 Pipeline'; }
        return;
      }
      if (btn) { btn.textContent = '✓ Added'; btn.disabled = true; btn.style.background = '#22c55e22'; }
    } catch {
      if (btn) { btn.disabled = false; btn.textContent = '📊 Pipeline'; }
    }
  };


  // ── Add all outreach contacts to pipeline ────────────
  async function addAllOutreachToPipeline() {
    const btn = document.getElementById('or-add-all-pipeline-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
    let added = 0, skipped = 0;
    for (const entry of allQueue) {
      try {
        const res = await fetch('/api/pipeline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window._csrf || '' },
          body: JSON.stringify({
            name:     entry.leadName,
            city:     entry.city         || '',
            category: entry.businessType || '',
            email:    entry.leadEmail    || null,
            stage:    'contacted',
          }),
        });
        if (res.status === 409) { skipped++; } else if (res.ok) { added++; }
      } catch {}
    }
    if (btn) { btn.disabled = false; btn.textContent = '📊 Add All to Pipeline'; }
    alert(added + ' added to pipeline' + (skipped ? ', ' + skipped + ' already there.' : '.'));
  }

  // ── Init ───────────────────────────────────────────────
  document.querySelectorAll(".or-tab").forEach(t =>
    t.addEventListener("click", () => switchTab(t.dataset.tab)));
  document.getElementById("or-new-btn").addEventListener("click", () => switchTab("new"));
  document.getElementById("or-search").addEventListener("input", applyFilters);
  document.getElementById("or-status-filter").addEventListener("change", applyFilters);

  loadNavState();
  checkSmtp();
  loadQueue();
  loadSavedOutreachLists();
})();
