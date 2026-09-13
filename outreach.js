/* ── eureach.eu — Outreach Sequences ─────────────────── */
(function () {
  let allQueue    = [];
  let currentSeq  = null;
  let currentCrmId = null; // generated sequence waiting to be enqueued
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
            <div class="or-card-controls">${pauseBtn}${stopBtn}</div>
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
          crmId:        currentCrmId || null,
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
        city: document.getElementById("nf-city").value.trim(),
        crmId: currentCrmId || null };
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

  // ── Init ───────────────────────────────────────────────
  document.querySelectorAll(".or-tab").forEach(t =>
    t.addEventListener("click", () => switchTab(t.dataset.tab)));
  document.getElementById("or-new-btn").addEventListener("click", () => switchTab("new"));
  document.getElementById("or-search").addEventListener("input", applyFilters);
  document.getElementById("or-status-filter").addEventListener("change", applyFilters);

  checkSmtp();
  loadQueue();

  // Pre-fill from URL params (e.g. launched from Lead Finder)
  const urlP = new URLSearchParams(window.location.search);
  if (urlP.get("name") || urlP.get("email")) {
    if (urlP.get("name"))  document.getElementById("nf-lead-name").value  = urlP.get("name");
    if (urlP.get("email")) document.getElementById("nf-lead-email").value = urlP.get("email");
    if (urlP.get("type"))  document.getElementById("nf-biz-type").value   = urlP.get("type");
    if (urlP.get("city"))  document.getElementById("nf-city").value        = urlP.get("city");
    if (urlP.get("crmId")) currentCrmId = urlP.get("crmId");
    switchTab("new");
  }
})();
