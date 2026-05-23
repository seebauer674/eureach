/* ── eureach.eu — Email Log ───────────────────────────── */
(function () {

  let allLog = [];

  const stepLabels = {
    1: "Step 1 — Cold Intro",
    2: "Step 2 — Follow-up",
    3: "Step 3 — Final Touch",
  };

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = String(s || "");
    return d.innerHTML;
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
      + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  function fmtSubject(s) {
    if (!s) return "—";
    return s.length > 60 ? s.slice(0, 60) + "…" : s;
  }

  async function loadLog() {
    try {
      const res = await fetch("/api/email/log");
      if (res.status === 401) { showAuthNotice(); return; }
      if (!res.ok) return;
      const data = await res.json();
      allLog = data.log || [];
      renderStats();
      renderTable(allLog);
    } catch {
      document.getElementById("el-table-wrap").innerHTML =
        `<div class="el-empty"><div class="el-empty-icon">⚠</div><div class="el-empty-title">Failed to load log</div></div>`;
    }
  }

  function renderStats() {
    const now   = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const thisMonth = allLog.filter(e => (e.sentAt || "").startsWith(month));
    const uniqueLeads = new Set(allLog.filter(e => e.leadId).map(e => e.leadId)).size;
    document.getElementById("stat-total").textContent   = allLog.length;
    document.getElementById("stat-month").textContent   = thisMonth.length;
    document.getElementById("stat-leads").textContent   = uniqueLeads;
  }

  function renderTable(rows) {
    const wrap = document.getElementById("el-table-wrap");
    if (!rows.length) {
      wrap.innerHTML = `
        <div class="el-empty">
          <div class="el-empty-icon">📬</div>
          <div class="el-empty-title">No emails sent yet</div>
          <div class="el-empty-sub">Use the Send button on outreach sequences in the CRM to send emails directly.</div>
        </div>`;
      return;
    }

    const tableRows = rows.map(e => `
      <tr class="el-row">
        <td class="el-cell el-cell-to">${esc(e.to)}</td>
        <td class="el-cell el-cell-subject">${esc(fmtSubject(e.subject))}</td>
        <td class="el-cell el-cell-date">${esc(fmtDate(e.sentAt))}</td>
        <td class="el-cell">
          ${e.sequenceStep ? `<span class="el-step-badge">${esc(stepLabels[e.sequenceStep] || "Step " + e.sequenceStep)}</span>` : `<span class="el-step-badge el-step-none">—</span>`}
        </td>
        <td class="el-cell">
          <span class="el-status-badge el-sent">✓ Sent</span>
        </td>
      </tr>`).join("");

    wrap.innerHTML = `
      <table class="el-table">
        <thead>
          <tr>
            <th class="el-th">To</th>
            <th class="el-th">Subject</th>
            <th class="el-th">Sent</th>
            <th class="el-th">Step</th>
            <th class="el-th">Status</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>`;
  }

  function applyFilters() {
    const query = (document.getElementById("el-search").value || "").toLowerCase();
    const step  = document.getElementById("el-step-filter").value;
    const filtered = allLog.filter(e => {
      const matchQ = !query || (e.to || "").toLowerCase().includes(query) || (e.subject || "").toLowerCase().includes(query);
      const matchS = !step  || String(e.sequenceStep) === step;
      return matchQ && matchS;
    });
    renderTable(filtered);
  }

  function showAuthNotice() {
    document.getElementById("el-table-wrap").innerHTML =
      `<div class="el-empty"><div class="el-empty-icon">🔒</div><div class="el-empty-title">Please <a href="signin.html">sign in</a> to view your email log.</div></div>`;
  }

  document.getElementById("el-search").addEventListener("input", applyFilters);
  document.getElementById("el-step-filter").addEventListener("change", applyFilters);

  loadLog();

})();
