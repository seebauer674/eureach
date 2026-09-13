(function () {
'use strict';

const state = {
  date: todayStr(),
  siteFilter: null,
  sites: [],
  jobTypes: [],
  jobs: [],
  limit: 1,
  used: 0,
  pendingSeedSiteId: null,
};

function todayStr() {
  const d = new Date();
  return [d.getFullYear(), pad(d.getMonth()+1), pad(d.getDate())].join('-');
}
function pad(n) { return String(n).padStart(2, '0'); }

function shiftDate(ds, delta) {
  const d = new Date(ds + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return [d.getFullYear(), pad(d.getMonth()+1), pad(d.getDate())].join('-');
}

function fmtDate(ds) {
  const d = new Date(ds + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// ── API helpers ──────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), data);
  return data;
}

// ── Init ─────────────────────────────────────────────────
async function init() {
  try {
    const me = await fetch('/api/auth/me').then(r => r.json());
    if (!me || !me.user) {
      location.href = '/signin.html?next=/dashboard.html';
      return;
    }
  } catch { location.href = '/signin.html?next=/dashboard.html'; return; }

  // Wire up UI events
  document.getElementById('db-date-prev').addEventListener('click', () => { state.date = shiftDate(state.date, -1); syncDateInput(); loadJobs(); });
  document.getElementById('db-date-next').addEventListener('click', () => { state.date = shiftDate(state.date, 1); syncDateInput(); loadJobs(); });
  document.getElementById('db-date-input').addEventListener('change', e => { state.date = e.target.value; loadJobs(); });
  document.getElementById('db-today-btn').addEventListener('click', () => { state.date = todayStr(); syncDateInput(); loadJobs(); });
  document.getElementById('db-add-job-btn').addEventListener('click', openAddJobModal);
  document.getElementById('db-new-site-btn').addEventListener('click', openNewSiteModal);

  document.getElementById('modal-new-site-close').addEventListener('click', () => closeModal('modal-new-site'));
  document.getElementById('modal-new-site-cancel').addEventListener('click', () => closeModal('modal-new-site'));
  document.getElementById('modal-new-site-form').addEventListener('submit', submitNewSite);

  document.getElementById('modal-seed-close').addEventListener('click', () => closeModal('modal-seed'));
  document.getElementById('modal-seed-skip').addEventListener('click', () => closeModal('modal-seed'));
  document.getElementById('modal-seed-confirm').addEventListener('click', submitSeed);

  // Seed card selection
  document.querySelectorAll('.db-seed-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.db-seed-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      document.getElementById('modal-seed-selected').value = card.dataset.template;
    });
  });

  document.getElementById('modal-upgrade-close').addEventListener('click', () => closeModal('modal-upgrade'));
  document.getElementById('modal-upgrade-cancel').addEventListener('click', () => closeModal('modal-upgrade'));

  document.getElementById('modal-add-job-close').addEventListener('click', () => closeModal('modal-add-job'));
  document.getElementById('modal-add-job-cancel').addEventListener('click', () => closeModal('modal-add-job'));
  document.getElementById('modal-add-job-form').addEventListener('submit', submitAddJob);

  document.querySelectorAll('.db-modal-overlay').forEach(el => {
    el.addEventListener('click', e => { if (e.target === el) closeModal(el.id); });
  });

  syncDateInput();
  await Promise.all([loadSites(), loadJobTypes()]);
  await loadJobs();
}

function syncDateInput() {
  document.getElementById('db-date-input').value = state.date;
  document.getElementById('db-date-label').textContent = fmtDate(state.date);
}

// ── Data loaders ─────────────────────────────────────────
async function loadSites() {
  try {
    const data = await api('GET', '/api/dashboard/sites');
    state.sites = data.sites || [];
    state.limit = data.limit;
    state.used = data.used;
  } catch (e) { console.error('loadSites', e); }
}

async function loadJobTypes() {
  try {
    const data = await api('GET', '/api/dashboard/job-types');
    state.jobTypes = data.job_types || [];
  } catch (e) { console.error('loadJobTypes', e); }
}

async function loadJobs() {
  document.getElementById('db-jobs-area').innerHTML = '<div class="db-empty"><div class="db-empty-icon">\u23f3</div><div class="db-empty-title">Loading\u2026</div></div>';
  try {
    let url = '/api/jobs?date=' + state.date;
    if (state.siteFilter) url += '&site_id=' + encodeURIComponent(state.siteFilter);
    const data = await api('GET', url);
    state.jobs = data.jobs || [];
    renderAll();
  } catch (e) {
    console.error('loadJobs', e);
    document.getElementById('db-jobs-area').innerHTML = '<div class="db-empty"><div class="db-empty-icon">\u26a0\ufe0f</div><div class="db-empty-title">Could not load jobs</div></div>';
  }
}

// ── Render ───────────────────────────────────────────────
function renderAll() {
  renderRail();
  renderJobs();
  renderCounters();
}

function renderRail() {
  const container = document.getElementById('db-site-list');
  const jobCountBySite = {};
  state.jobs.forEach(j => {
    if (j.status !== 'done') jobCountBySite[j.site_id] = (jobCountBySite[j.site_id] || 0) + 1;
  });

  container.innerHTML = state.sites.map(site => {
    const count = jobCountBySite[site.id] || 0;
    const active = state.siteFilter === site.id ? ' active' : '';
    const initial = (site.display_name || site.domain || '?')[0].toUpperCase();
    return `<div class="db-site-row${active}" data-site-id="${site.id}">
      <div class="db-site-avatar">${escHtml(initial)}</div>
      <div class="db-site-info">
        <div class="db-site-name">${escHtml(site.display_name)}</div>
        <div class="db-site-domain">${escHtml(site.domain)}</div>
      </div>
      <div class="db-site-badge ${count === 0 ? 'zero' : ''}">${count}</div>
    </div>`;
  }).join('');

  container.querySelectorAll('.db-site-row').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.dataset.siteId;
      state.siteFilter = state.siteFilter === id ? null : id;
      loadJobs();
    });
  });

  // Usage line
  const usageEl = document.getElementById('db-usage-line');
  if (state.limit === -1) {
    usageEl.textContent = `${state.used} site${state.used !== 1 ? 's' : ''} (unlimited)`;
  } else if (state.used >= state.limit) {
    usageEl.innerHTML = `${state.used} of ${state.limit} site${state.limit !== 1 ? 's' : ''} used \u2014 <a href="/membership.html">upgrade for more</a>`;
  } else {
    usageEl.textContent = `${state.used} of ${state.limit} site${state.limit !== 1 ? 's' : ''} used`;
  }
}

function renderCounters() {
  const total = state.jobs.length;
  const done = state.jobs.filter(j => j.status === 'done').length;
  const mins = state.jobs.reduce((s, j) => s + (j.est_minutes || 0), 0);
  const pct = total ? Math.round((done / total) * 100) : 0;

  document.getElementById('db-count-jobs').textContent = total;
  document.getElementById('db-count-mins').textContent = mins + ' min';
  document.getElementById('db-progress-fill').style.width = pct + '%';
  document.getElementById('db-progress-text').textContent = done + '/' + total + ' done';
}

function renderJobs() {
  const area = document.getElementById('db-jobs-area');
  if (state.jobs.length === 0) {
    area.innerHTML = `<div class="db-empty">
      <div class="db-empty-icon">\ud83c\udfaf</div>
      <div class="db-empty-title">Nothing due on this day</div>
      <div class="db-empty-sub">Great \u2014 or add a one-off task.</div>
      <button class="db-empty-add" id="db-empty-add-btn">+ Add a task</button>
    </div>`;
    document.getElementById('db-empty-add-btn').addEventListener('click', openAddJobModal);
    return;
  }

  // Group by site
  const siteMap = {};
  state.sites.forEach(s => { siteMap[s.id] = s; });
  const grouped = {};
  state.jobs.forEach(j => {
    const key = j.site_id;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(j);
  });

  const showSiteHeader = !state.siteFilter || Object.keys(grouped).length > 1;

  let html = '';
  for (const siteId of Object.keys(grouped)) {
    const site = siteMap[siteId] || {};
    const jobs = grouped[siteId];
    if (showSiteHeader) {
      html += `<div class="db-site-group">
        <div class="db-group-header">
          <span class="db-group-name">${escHtml(site.display_name || site.domain || siteId)}</span>
          <div class="db-group-divider"></div>
        </div>
        ${jobs.map(j => renderJobCard(j)).join('')}
      </div>`;
    } else {
      html += jobs.map(j => renderJobCard(j)).join('');
    }
  }

  area.innerHTML = html;
  attachCardListeners();
}

function renderJobCard(job) {
  const done = job.status === 'done';
  const actionBtn = buildActionBtn(job);
  const copyBtn = `<button class="db-job-copy-btn" data-job-id="${job.id}">Copy brief</button>`;
  return `<div class="db-job-card ${done ? 'done' : ''}" data-job-id="${job.id}">
    <div class="db-job-check">
      <input type="checkbox" ${done ? 'checked' : ''} data-job-id="${job.id}" aria-label="Mark done">
    </div>
    <div class="db-job-body">
      <div class="db-job-meta">
        <span class="db-job-type-icon">${escHtml(job.job_type_icon || '')}</span>
        <span class="db-job-channel">${escHtml(job.channel)}</span>
        <span class="db-job-mins">${job.est_minutes || 0} min</span>
      </div>
      <div class="db-job-title">${escHtml(job.title)}</div>
      <div class="db-job-actions">
        ${actionBtn}
        ${copyBtn}
      </div>
      <textarea class="db-job-notes" data-job-id="${job.id}" placeholder="Notes\u2026" rows="1">${escHtml(job.notes || '')}</textarea>
    </div>
  </div>`;
}

function buildActionBtn(job) {
  if (!job.action_kind || job.action_kind === 'none' || !job.action_url) return '';
  const isExt = job.action_kind === 'external';
  const cls = 'db-job-action-btn' + (isExt ? ' external' : '');
  const target = isExt ? ' target="_blank" rel="noopener"' : '';
  return `<a href="${escAttr(job.action_url)}" class="${cls}"${target}>${escHtml(job.action_label)}</a>`;
}

function attachCardListeners() {
  document.querySelectorAll('.db-job-check input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', async () => {
      const id = cb.dataset.jobId;
      const newStatus = cb.checked ? 'done' : 'pending';
      try {
        await api('PATCH', '/api/jobs/' + id, { status: newStatus });
        const job = state.jobs.find(j => j.id === id);
        if (job) { job.status = newStatus; job.completed_at = newStatus === 'done' ? new Date().toISOString() : null; }
        const card = document.querySelector(`.db-job-card[data-job-id="${id}"]`);
        if (card) { card.classList.toggle('done', newStatus === 'done'); }
        renderCounters();
        renderRail();
      } catch (e) { console.error('mark done', e); cb.checked = !cb.checked; }
    });
  });

  document.querySelectorAll('.db-job-notes').forEach(ta => {
    let originalValue = ta.value;
    ta.addEventListener('focus', () => { originalValue = ta.value; });
    ta.addEventListener('blur', async () => {
      if (ta.value === originalValue) return;
      const id = ta.dataset.jobId;
      try {
        await api('PATCH', '/api/jobs/' + id, { notes: ta.value });
        const job = state.jobs.find(j => j.id === id);
        if (job) job.notes = ta.value;
        originalValue = ta.value;
      } catch (e) { console.error('save notes', e); }
    });
  });

  document.querySelectorAll('.db-job-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.jobId;
      const job = state.jobs.find(j => j.id === id);
      if (!job) return;
      const text = job.title + (job.notes ? '\n\n' + job.notes : '');
      navigator.clipboard.writeText(text).then(() => {
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      });
    });
  });
}

// ── Modals ───────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function openNewSiteModal() {
  document.getElementById('modal-new-site-form').reset();
  document.getElementById('modal-new-site-error').classList.remove('visible');
  openModal('modal-new-site');
}

async function submitNewSite(e) {
  e.preventDefault();
  const btn = document.getElementById('modal-new-site-submit');
  const errEl = document.getElementById('modal-new-site-error');
  const domain = document.getElementById('ns-domain').value.trim();
  const display_name = document.getElementById('ns-name').value.trim();
  const market = document.getElementById('ns-market').value;
  btn.disabled = true; btn.textContent = 'Saving\u2026';
  errEl.classList.remove('visible');
  try {
    const data = await api('POST', '/api/dashboard/sites', { domain, display_name, market: market || null });
    state.sites.push(data.site);
    state.used = state.sites.length;
    closeModal('modal-new-site');
    state.pendingSeedSiteId = data.site.id;
    openSeedModal();
    renderRail();
  } catch (err) {
    if (err.error === 'site_limit_reached') {
      closeModal('modal-new-site');
      openModal('modal-upgrade');
    } else {
      errEl.textContent = err.message || 'Could not create site.';
      errEl.classList.add('visible');
    }
  } finally { btn.disabled = false; btn.textContent = 'Create site'; }
}

function openSeedModal() {
  document.getElementById('modal-seed-selected').value = '';
  document.querySelectorAll('.db-seed-card').forEach(c => c.classList.remove('selected'));
  const btn = document.getElementById('modal-seed-confirm');
  btn.disabled = false; btn.textContent = 'Use template';
  openModal('modal-seed');
}

async function submitSeed() {
  const template = document.getElementById('modal-seed-selected').value;
  const btn = document.getElementById('modal-seed-confirm');
  if (!template) {
    btn.textContent = 'Pick a template first';
    setTimeout(() => { btn.textContent = 'Use template'; }, 1500);
    return;
  }
  const siteId = state.pendingSeedSiteId;
  if (!siteId) { closeModal('modal-seed'); return; }
  btn.disabled = true; btn.textContent = 'Setting up…';
  try {
    await api('POST', '/api/dashboard/sites/' + siteId + '/seed', { template });
    closeModal('modal-seed');
    // Materialise today+14 days, then jump to nearest day with jobs
    await loadJobs();
    if (state.jobs.length === 0) {
      for (let i = 0; i < 14; i++) {
        state.date = shiftDate(state.date, 1);
        syncDateInput();
        await loadJobs();
        if (state.jobs.length > 0) break;
      }
    }
  } catch (e) {
    console.error('seed error', e);
    closeModal('modal-seed');
  } finally {
    btn.disabled = false; btn.textContent = 'Use template';
  }
}

function openAddJobModal() {
  document.getElementById('modal-add-job-form').reset();
  document.getElementById('modal-add-job-error').classList.remove('visible');
  document.getElementById('aj-date').value = state.date;
  // Populate site selector
  const siteSelect = document.getElementById('aj-site');
  siteSelect.innerHTML = state.sites.map(s =>
    `<option value="${escAttr(s.id)}">${escHtml(s.display_name || s.domain)}</option>`
  ).join('');
  if (state.siteFilter) siteSelect.value = state.siteFilter;
  // Populate job type selector
  const jtSelect = document.getElementById('aj-job-type');
  jtSelect.innerHTML = state.jobTypes.map(jt =>
    `<option value="${escAttr(jt.key)}">${escHtml(jt.label)}</option>`
  ).join('');
  openModal('modal-add-job');
}

async function submitAddJob(e) {
  e.preventDefault();
  const btn = document.getElementById('modal-add-job-submit');
  const errEl = document.getElementById('modal-add-job-error');
  btn.disabled = true; btn.textContent = 'Adding\u2026';
  errEl.classList.remove('visible');
  const body = {
    site_id: document.getElementById('aj-site').value,
    due_date: document.getElementById('aj-date').value,
    job_type: document.getElementById('aj-job-type').value,
    channel: document.getElementById('aj-channel').value.trim(),
    title: document.getElementById('aj-title').value.trim(),
    est_minutes: parseInt(document.getElementById('aj-mins').value) || 30,
  };
  try {
    const data = await api('POST', '/api/jobs', body);
    closeModal('modal-add-job');
    if (data.job.due_date === state.date) {
      // Re-fetch so action URL is resolved
      await loadJobs();
    }
  } catch (err) {
    errEl.textContent = err.message || 'Could not create job.';
    errEl.classList.add('visible');
  } finally { btn.disabled = false; btn.textContent = 'Add task'; }
}

// ── Helpers ──────────────────────────────────────────────
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) { return escHtml(s); }

document.addEventListener('DOMContentLoaded', init);
})();
