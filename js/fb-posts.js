/* ── FB Post Agent ──────────────────────────────────────── */
let fbTargets   = [];
let fbTemplates = [];
let targetFilter  = 'all';
let templateFilter = 'all';

const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// ── Init ────────────────────────────────────────────────
(async () => {
  const meRes = await fetch('/api/auth/me').then(r => r.json()).catch(() => ({}));
  if (!meRes.user) { window.location.href = '/signin.html'; return; }
  await Promise.all([loadConnection(), loadTargets(), loadTemplates(), loadBranding()]);
  bindTabs();
  bindFilters();
  bindAddButtons();
  bindAgentRun();
})();

// ── Connection ──────────────────────────────────────────
async function loadConnection() {
  const res = await fetch('/api/fb/connection').then(r => r.json()).catch(() => ({}));
  const notConn = document.getElementById('fb-not-connected');
  const conn    = document.getElementById('fb-connected');

  // Handle ?fb= param from OAuth redirect
  const fbParam = new URLSearchParams(window.location.search).get('fb');
  if (fbParam) {
    window.history.replaceState({}, '', '/fb-posts.html');
    if (fbParam === 'denied') showToast('Facebook connection cancelled.', true);
    else if (fbParam === 'error') showToast('Facebook connection failed. Try again.', true);
    else if (fbParam === 'connected') showToast('\u2713 Facebook connected!');
  }

  if (!res.connected) {
    notConn.style.display = ''; conn.style.display = 'none'; return;
  }

  notConn.style.display = 'none'; conn.style.display = '';
  document.getElementById('fb-conn-name').textContent    = res.fbUserName || 'Facebook User';
  document.getElementById('fb-conn-avatar').textContent  = (res.fbUserName || 'F')[0].toUpperCase();
  const expEl = document.getElementById('fb-conn-expiry');
  if (res.daysLeft !== null) {
    expEl.textContent = res.daysLeft > 5 ? 'Token valid ' + res.daysLeft + ' days' : '\u26a0\ufe0f Expires in ' + res.daysLeft + ' days — re-authorise soon';
    expEl.style.color = res.daysLeft > 5 ? 'var(--muted)' : '#f59e0b';
  }

  const pages = res.pages || [];
  if (pages.length) {
    document.getElementById('fb-conn-pages').style.display = '';
    document.getElementById('fb-conn-pages-list').innerHTML = pages.map(p =>
      '<span class="fb-page-chip">' + esc(p.name) + '</span>'
    ).join('');
  }

  document.getElementById('fb-disconnect-btn').onclick = async () => {
    if (!confirm('Disconnect Facebook?')) return;
    await fetch('/api/fb/connection', { method: 'DELETE' });
    await loadConnection();
  };
}

function showToast(msg, isErr) {
  const t = document.createElement('div');
  t.className = 'fb-toast' + (isErr ? ' fb-toast-err' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('fb-toast-show'), 10);
  setTimeout(() => { t.classList.remove('fb-toast-show'); setTimeout(() => t.remove(), 400); }, 3500);
}

// ── Targets ─────────────────────────────────────────────
async function loadTargets() {
  const res = await fetch('/api/fb/targets').then(r => r.json()).catch(() => ({ targets: [] }));
  fbTargets = res.targets || [];
  document.getElementById('tab-badge-targets').textContent = fbTargets.length;
  renderTargets();
}

function renderTargets() {
  const list = document.getElementById('targets-list');
  const filtered = targetFilter === 'all' ? fbTargets : fbTargets.filter(t => t.type === targetFilter);
  if (!filtered.length) { list.innerHTML = '<div class="fb-empty">No targets yet.</div>'; return; }

  list.innerHTML = filtered.map(t => {
    const lastPost = t.lastPostAt
      ? new Date(t.lastPostAt).toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' })
      : null;
    const daysAgo = t.lastPostAt
      ? Math.floor((Date.now() - new Date(t.lastPostAt)) / 86400000)
      : null;
    const due     = daysAgo === null || daysAgo >= 7;
    const statusCls = t.joinStatus === 'joined' ? 'fb-status-joined' : t.joinStatus === 'requested' ? 'fb-status-requested' : 'fb-status-notjoined';
    const statusLbl = t.joinStatus === 'joined' ? '✓ Joined' : t.joinStatus === 'requested' ? '⏳ Requested' : '✗ Not joined';
    return `<div class="fb-target-row">
      <div class="fb-target-type-icon">${t.type === 'page' ? '📄' : '👥'}</div>
      <div class="fb-target-info">
        <div class="fb-target-name">${esc(t.name)}${t.url ? ` <a href="${esc(t.url)}" target="_blank" class="fb-target-link">↗</a>` : ''}</div>
        <div class="fb-target-meta">
          <span class="${statusCls}">${statusLbl}</span>
          ${t.niche ? `<span class="fb-target-niche">${esc(t.niche)}</span>` : ''}
          ${t.targetId ? `<span class="fb-target-id">ID: ${esc(t.targetId)}</span>` : ''}
        </div>
      </div>
      <div class="fb-target-last">
        ${lastPost ? `<span class="fb-last-post ${due ? 'fb-last-due' : 'fb-last-ok'}">Last: ${lastPost}</span>` : '<span class="fb-last-post fb-last-due">Never posted</span>'}
        <span class="fb-post-count">${(t.postLog || []).length} posts</span>
      </div>
      <div class="fb-target-actions">
        <button class="fb-icon-btn" title="Post now" onclick="openPostNow('${t.id}')">✉</button>
        <button class="fb-icon-btn" title="Edit" onclick="openTargetModal('${t.id}')">✏</button>
        <button class="fb-icon-btn fb-icon-del" title="Delete" onclick="deleteTarget('${t.id}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

// ── Templates ────────────────────────────────────────────
async function loadTemplates() {
  const res = await fetch('/api/fb/templates').then(r => r.json()).catch(() => ({ templates: [] }));
  fbTemplates = res.templates || [];
  document.getElementById('tab-badge-templates').textContent = fbTemplates.length;
  renderTemplates();
}

function renderTemplates() {
  const list = document.getElementById('templates-list');
  const filtered = templateFilter === 'all' ? fbTemplates : fbTemplates.filter(t => t.targetType === templateFilter);
  if (!filtered.length) { list.innerHTML = '<div class="fb-empty">No templates yet.</div>'; return; }

  list.innerHTML = filtered.map(t => `
    <div class="fb-tpl-card">
      <div class="fb-tpl-head">
        <span class="fb-tpl-type ${t.targetType === 'page' ? 'fb-tpl-page' : t.targetType === 'group' ? 'fb-tpl-group' : 'fb-tpl-all'}">${t.targetType === 'page' ? '📄 Page' : t.targetType === 'group' ? '👥 Group' : '🔀 All'}</span>
        <span class="fb-tpl-week">Week ${t.week}</span>
        ${t.niche ? `<span class="fb-tpl-niche">${esc(t.niche)}</span>` : ''}
        <span class="fb-tpl-name">${esc(t.name || '')}</span>
        <div style="margin-left:auto;display:flex;gap:6px">
          <button class="fb-icon-btn" onclick="openTplModal('${t.id}')">✏</button>
          <button class="fb-icon-btn fb-icon-del" onclick="deleteTemplate('${t.id}')">✕</button>
        </div>
      </div>
      <div class="fb-tpl-body">${esc(t.text || t.content)}</div>
    </div>`
  ).join('');
}

// ── Log ──────────────────────────────────────────────────
async function loadLog() {
  const res = await fetch('/api/fb/log').then(r => r.json()).catch(() => ({ log: [] }));
  const log = res.log || [];
  const list = document.getElementById('log-list');
  if (!log.length) { list.innerHTML = '<div class="fb-empty">No posts yet.</div>'; return; }
  list.innerHTML = log.map(e => {
    const dt  = new Date(e.postedAt);
    const ok  = !e.error;
    return `<div class="fb-log-row ${ok ? '' : 'fb-log-err'}">
      <div class="fb-log-icon">${e.type === 'page' ? '📄' : '👥'}</div>
      <div class="fb-log-info">
        <div class="fb-log-name">${esc(e.targetName || '—')}</div>
        <div class="fb-log-content">${esc((e.content || '').slice(0, 100))}…</div>
      </div>
      <div class="fb-log-meta">
        <span class="fb-log-status ${ok ? 'fb-log-ok' : 'fb-log-fail'}">${ok ? '✓ Posted' : '✗ Failed'}</span>
        <span class="fb-log-date">${dt.toLocaleDateString(undefined, { day:'numeric', month:'short' })} ${dt.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' })}</span>
        ${e.error ? `<span class="fb-log-reason">${esc(e.error)}</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ── Tabs ─────────────────────────────────────────────────
function bindTabs() {
  document.querySelectorAll('.fb-tab').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.fb-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.fb-tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'log') loadLog();
    };
  });
}

function bindFilters() {
  document.querySelectorAll('#tab-targets .fb-filter').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#tab-targets .fb-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active'); targetFilter = btn.dataset.filter; renderTargets();
    };
  });
  document.querySelectorAll('#tab-templates .fb-filter').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#tab-templates .fb-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active'); templateFilter = btn.dataset.filter; renderTemplates();
    };
  });
}

// ── Target Modal ─────────────────────────────────────────
let editTargetType = 'group';

function bindAddButtons() {
  document.getElementById('btn-add-target').onclick   = () => openTargetModal(null);
  document.getElementById('btn-add-template').onclick = () => openTplModal(null);
}

function parseFbUrl(raw) {
  try {
    const str = raw.trim().replace(/^(?!https?:\/\/)/, 'https://');
    const u = new URL(str);
    if (!u.hostname.includes('facebook.com')) return null;
    const parts = u.pathname.replace(/\/$/, '').split('/').filter(Boolean);
    if (!parts.length) return null;
    // /groups/ID or /groups/slug
    if (parts[0] === 'groups' && parts[1])
      return { type: 'group', id: parts[1], url: 'https://www.facebook.com/groups/' + parts[1] };
    // /pages/slug/ID
    if (parts[0] === 'pages' && parts[2] && /^\d+$/.test(parts[2]))
      return { type: 'page', id: parts[2], url: 'https://www.facebook.com/pages/' + parts[1] + '/' + parts[2] };
    // /profile.php?id=123
    if (parts[0] === 'profile.php') {
      const id = u.searchParams.get('id');
      if (id) return { type: 'page', id, url: 'https://www.facebook.com/profile.php?id=' + id };
    }
    // /pagename or /pagename/
    if (parts.length >= 1)
      return { type: 'page', id: parts[0], url: 'https://www.facebook.com/' + parts[0] };
  } catch(e) {}
  return null;
}

function slugToName(slug) {
  return slug.replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function setTargetType(type) {
  editTargetType = type;
  document.getElementById('target-type').value = type;
  document.querySelectorAll('#target-modal .fb-type-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.type === type));
}

function openTargetModal(id) {
  const t = id ? fbTargets.find(x => x.id === id) : null;
  document.getElementById('target-modal-title').textContent = t ? 'Edit Target' : 'Add Target';
  document.getElementById('target-edit-id').value    = t ? t.id : '';
  document.getElementById('target-name').value       = t ? t.name       : '';
  document.getElementById('target-id').value         = t ? t.targetId   : '';
  document.getElementById('target-url').value        = t ? t.url        : '';
  document.getElementById('target-niche').value      = t ? t.niche      : '';
  document.getElementById('target-join-status').value = t ? t.joinStatus : 'joined';
  document.getElementById('target-url-paste').value  = '';
  document.getElementById('target-url-detected').style.display = 'none';
  document.getElementById('target-url-paste-wrap').style.display = t ? 'none' : '';
  setTargetType(t ? t.type : 'group');
  document.getElementById('target-err').textContent = '';
  document.getElementById('target-overlay').classList.add('open');
  document.getElementById('target-modal').classList.add('open');
  if (!t) setTimeout(() => document.getElementById('target-url-paste').focus(), 50);
}

function closeTargetModal() {
  document.getElementById('target-overlay').classList.remove('open');
  document.getElementById('target-modal').classList.remove('open');
}

document.getElementById('target-url-paste').addEventListener('input', function() {
  const val = this.value.trim();
  const det = document.getElementById('target-url-detected');
  if (!val) { det.style.display = 'none'; return; }
  const parsed = parseFbUrl(val);
  if (!parsed) { det.style.display = ''; det.style.color = '#f87171'; det.textContent = 'Could not parse URL — fill fields manually below.'; return; }
  setTargetType(parsed.type);
  document.getElementById('target-id').value  = parsed.id;
  document.getElementById('target-url').value = parsed.url;
  if (!document.getElementById('target-name').value)
    document.getElementById('target-name').value = slugToName(parsed.id.replace(/^\d+$/, '') || '');
  det.style.display = '';
  det.style.color = '#4ade80';
  det.textContent = '\u2713 Detected: ' + (parsed.type === 'group' ? '\ud83d\udc65 Group' : '\ud83d\udcc4 Page') + ' — ID: ' + parsed.id;
});

document.querySelectorAll('#target-modal .fb-type-btn').forEach(b => { b.onclick = () => setTargetType(b.dataset.type); });

document.getElementById('target-save-btn').onclick = async () => {
  const id = document.getElementById('target-edit-id').value;
  const payload = {
    type: document.getElementById('target-type').value,
    name: document.getElementById('target-name').value.trim(),
    targetId: document.getElementById('target-id').value.trim(),
    url: document.getElementById('target-url').value.trim(),
    niche: document.getElementById('target-niche').value.trim(),
    joinStatus: document.getElementById('target-join-status').value,
  };
  const errEl = document.getElementById('target-err');
  if (!payload.name) { errEl.textContent = 'Name is required.'; return; }
  const btn = document.getElementById('target-save-btn');
  btn.disabled = true; btn.textContent = 'Saving…';
  const url = id ? `/api/fb/targets/${id}` : '/api/fb/targets';
  const method = id ? 'PUT' : 'POST';
  const res = await fetch(url, { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  const data = await res.json();
  btn.disabled = false; btn.textContent = 'Save';
  if (!res.ok) { errEl.textContent = data.error || 'Failed.'; return; }
  closeTargetModal();
  await loadTargets();
};

async function deleteTarget(id) {
  if (!confirm('Remove this target?')) return;
  await fetch(`/api/fb/targets/${id}`, { method:'DELETE' });
  await loadTargets();
}

// ── Post Now modal (quick post to one target) ────────────
async function openPostNow(targetId) {
  const target = fbTargets.find(t => t.id === targetId);
  if (!target) return;
  const content = prompt(`Post to "${target.name}"\n\nEnter post text (or leave blank to use current week's template):`);
  if (content === null) return;
  let postContent = content.trim();
  if (!postContent) {
    const now = new Date();
    const weekNum = (Math.ceil((now - new Date(now.getFullYear(), 0, 1)) / (7 * 86400000)) % 4) + 1;
    const pool = fbTemplates.filter(t => !t.targetType || t.targetType === target.type);
    const tpl  = pool.find(t => t.week === weekNum) || pool[0];
    if (!tpl) { alert('No template found for this target type. Add one in the Templates tab.'); return; }
    postContent = tpl.text || tpl.content || "";
  }
  const res  = await fetch(`/api/fb/post/${targetId}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ content: postContent }) });
  const data = await res.json();
  if (res.ok) { alert(`✓ Posted! FB Post ID: ${data.postId || 'N/A'}`); await loadTargets(); }
  else { alert('Error: ' + (data.error || 'Unknown error')); }
}

// ── Template Modal ───────────────────────────────────────
let editTplType = 'group';
let editTplWeek = 1;

function openTplModal(id) {
  const t = id ? fbTemplates.find(x => x.id === id) : null;
  document.getElementById('tpl-modal-title').textContent = t ? 'Edit Template' : 'New Template';
  document.getElementById('tpl-edit-id').value   = t ? t.id      : '';
  document.getElementById('tpl-name').value      = t ? t.name    : '';
  document.getElementById('tpl-niche').value     = t ? t.niche   : '';
  document.getElementById('tpl-content').value   = t ? (t.text || t.content || '') : '';
  editTplType = t ? t.targetType : 'group';
  editTplWeek = t ? t.week : 1;
  document.querySelectorAll('#tpl-modal .fb-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === editTplType));
  document.getElementById('tpl-target-type').value = editTplType;
  document.querySelectorAll('.fb-week-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.week) === editTplWeek));
  document.getElementById('tpl-week').value = editTplWeek;
  document.getElementById('tpl-chars').textContent = `${(t ? (t.text || t.content || '') : '').length} / 63206`;
  document.getElementById('tpl-err').textContent = '';
  document.getElementById('tpl-overlay').classList.add('open');
  document.getElementById('tpl-modal').classList.add('open');
}

function closeTplModal() {
  document.getElementById('tpl-overlay').classList.remove('open');
  document.getElementById('tpl-modal').classList.remove('open');
}

document.querySelectorAll('#tpl-modal .fb-type-btn').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('#tpl-modal .fb-type-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); editTplType = b.dataset.type;
    document.getElementById('tpl-target-type').value = editTplType;
  };
});

document.querySelectorAll('.fb-week-btn').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('.fb-week-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); editTplWeek = parseInt(b.dataset.week);
    document.getElementById('tpl-week').value = editTplWeek;
  };
});

document.getElementById('tpl-content').addEventListener('input', function() {
  document.getElementById('tpl-chars').textContent = `${this.value.length} / 63206`;
});

document.getElementById('tpl-save-btn').onclick = async () => {
  const id = document.getElementById('tpl-edit-id').value;
  const payload = {
    targetType: document.getElementById('tpl-target-type').value,
    name:    document.getElementById('tpl-name').value.trim(),
    niche:   document.getElementById('tpl-niche').value.trim(),
    text: document.getElementById('tpl-content').value.trim(),
    week:    parseInt(document.getElementById('tpl-week').value),
  };
  const errEl = document.getElementById('tpl-err');
  if (!payload.text) { errEl.textContent = 'Post content is required.'; return; }
  const btn = document.getElementById('tpl-save-btn');
  btn.disabled = true; btn.textContent = 'Saving…';
  const url = id ? `/api/fb/templates/${id}` : '/api/fb/templates';
  const method = id ? 'PUT' : 'POST';
  const res  = await fetch(url, { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  const data = await res.json();
  btn.disabled = false; btn.textContent = 'Save Template';
  if (!res.ok) { errEl.textContent = data.error || 'Failed.'; return; }
  closeTplModal();
  await loadTemplates();
};

async function deleteTemplate(id) {
  if (!confirm('Delete this template?')) return;
  await fetch(`/api/fb/templates/${id}`, { method:'DELETE' });
  await loadTemplates();
}

// ── Agent Run ────────────────────────────────────────────
function bindAgentRun() {
  document.getElementById('fb-run-btn').onclick = runAgent;
}

async function runAgent() {
  // No FB API call - generate copy/download content from templates and targets
  document.getElementById('run-overlay').classList.add('open');
  document.getElementById('run-modal').classList.add('open');
  document.getElementById('run-modal-title').textContent = '\u2b07 Prepare Posts';
  document.getElementById('run-progress').innerHTML = '<div class="fb-spinner">\u23f3 Loading templates\u2026</div>';
  document.getElementById('run-results').style.display = 'none';
  document.getElementById('run-close-btn').style.display = 'none';

  await loadTemplates();
  await loadTargets();

  const targets   = (fbTargets).filter(t => t.active !== false);
  const templates = (fbTemplates);

  document.getElementById('run-progress').innerHTML = '';

  if (!templates.length) {
    document.getElementById('run-results').innerHTML = '<div class="fb-run-error">No templates found. Add a template first.</div>';
    document.getElementById('run-results').style.display = 'block';
    document.getElementById('run-close-btn').style.display = 'inline-block';
    return;
  }
  if (!targets.length) {
    document.getElementById('run-results').innerHTML = '<div class="fb-run-error">No active targets found. Add targets first.</div>';
    document.getElementById('run-results').style.display = 'block';
    document.getElementById('run-close-btn').style.display = 'inline-block';
    return;
  }

  let allText = '';
  const rows = targets.map(t => {
    const tpl = templates.find(tp => tp.targetType === t.type) || templates[0];
    const msg = tpl ? (tpl.text || tpl.content || tpl.bodyText || '') : '';
    const url = t.type === 'page'
      ? 'https://www.facebook.com/' + t.entityId
      : 'https://www.facebook.com/groups/' + t.entityId;
    allText += '--- ' + t.name + ' ---\n' + msg + '\n\n';
    return '<div class="fb-run-row" style="flex-direction:column;align-items:flex-start;gap:6px;padding:12px 0;border-bottom:1px solid var(--border)">' +
      '<div style="display:flex;align-items:center;gap:8px;width:100%">' +
        '<span style="font-weight:600">' + esc(t.name) + '</span>' +
        '<span class="fb-tpl-type ' + (t.type === 'page' ? 'fb-tpl-page' : 'fb-tpl-group') + '">' + (t.type === 'page' ? '\ud83d\udcc4 Page' : '\ud83d\udc65 Group') + '</span>' +
        '<a href="' + url + '" target="_blank" rel="noopener" style="margin-left:auto;font-size:0.8rem;color:#60a5fa">Open on Facebook \u2197</a>' +
      '</div>' +
      '<textarea readonly style="width:100%;box-sizing:border-box;height:80px;font-size:0.82rem;background:var(--panel);color:var(--fg);border:1px solid var(--border);border-radius:6px;padding:6px;resize:vertical">' + esc(msg) + '</textarea>' +
      '<button onclick="navigator.clipboard.writeText(this.previousElementSibling.value).then(function(){var b=this;b.textContent=\'\u2713 Copied!\';setTimeout(function(){b.textContent=\'Copy text\'},1500)}.bind(this))" style="font-size:0.78rem;padding:4px 12px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer">Copy text</button>' +
      '</div>';
  }).join('');

  const blob   = new Blob([allText], {type:'text/plain'});
  const dlUrl  = URL.createObjectURL(blob);

  document.getElementById('run-modal-title').textContent = '\u2b07 Ready to Post';
  document.getElementById('run-results').innerHTML =
    '<p style="font-size:0.82rem;color:var(--muted);text-align:left;margin-bottom:12px">' +
      'Copy each post text, open the link, and paste it on Facebook. ' +
      'Or <a href="' + dlUrl + '" download="fb-posts.txt" style="color:#60a5fa">download all as .txt</a>.' +
    '</p>' + rows;
  document.getElementById('run-results').style.display = 'block';
  document.getElementById('run-close-btn').style.display = 'inline-block';
}
// ── Group Finder ────────────────────────────────────────
async function searchFbGroups() {
  const keyword = (document.getElementById('finder-keyword').value || '').trim();
  const type    = document.getElementById('finder-type').value;
  const results = document.getElementById('finder-results');
  if (!keyword) { results.innerHTML = '<p style="color:#f87171">Enter a keyword first.</p>'; return; }

  results.innerHTML = '<div class="fb-spinner">\u23f3 Searching\u2026</div>';

  const fbSearchType = type === 'page' ? 'pages' : 'groups';
  const fbUrl = 'https://www.facebook.com/search/' + fbSearchType + '/?q=' + encodeURIComponent(keyword);

  let hereRows = '';
  try {
    const hereRes = await fetch('/api/leads/search', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ subcatLabel: keyword, city: '', country: '' })
    });
    if (hereRes.ok) {
      const hereData = await hereRes.json();
      const leads = (hereData.leads || []).slice(0, 10);
      if (leads.length) {
        hereRows = '<div style="margin-top:20px">' +
          '<div style="font-weight:600;margin-bottom:8px;font-size:0.9rem">\ud83d\udccd Local businesses found (' + leads.length + ')</div>' +
          leads.map(function(l) {
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">' +
              '<div><div style="font-weight:500">' + esc(l.name || '') + '</div>' +
              '<div style="font-size:0.78rem;color:var(--muted)">' + esc(l.address || l.city || '') + '</div></div>' +
              (l.website ? '<a href="' + esc(l.website) + '" target="_blank" rel="noopener" style="font-size:0.78rem;color:#60a5fa;white-space:nowrap">Visit \u2197</a>' : '') +
              '</div>';
          }).join('') + '</div>';
      }
    }
  } catch(e) { /* HERE search failed silently */ }

  results.innerHTML =
    '<div style="background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:16px">' +
      '<div style="font-weight:600;margin-bottom:10px;font-size:0.9rem">\ud83d\udd0d Facebook search results for "<em>' + esc(keyword) + '</em>"</div>' +
      '<p style="font-size:0.82rem;color:var(--muted);margin-bottom:12px">' +
        'Open Facebook and browse the results. Copy the group/page ID from the URL and use "Add Target" to save it.' +
      '</p>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
        '<a href="' + fbUrl + '" target="_blank" rel="noopener" style="display:inline-block;padding:8px 18px;background:#1877f2;color:#fff;border-radius:8px;font-weight:600;text-decoration:none;font-size:0.88rem">' +
          '\ud83d\udd0d Search Facebook ' + (type === 'page' ? 'Pages' : 'Groups') + ' \u2197' +
        '</a>' +
      '</div>' +
      '<div style="margin-top:14px;font-size:0.78rem;color:var(--muted)">' +
        'Tip: In the Facebook URL the group/page ID is the number or name after /groups/ or the page username.' +
      '</div>' +
    '</div>' + hereRows;
}


function closeRunModal() {
  document.getElementById('run-overlay').classList.remove('open');
  document.getElementById('run-modal').classList.remove('open');
}

// ── Helpers ──────────────────────────────────────────────
function setBadge(id, isSet) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent  = isSet ? '✓ Set' : 'Not set';
  el.className    = 'fb-badge ' + (isSet ? 'fb-badge-set' : 'fb-badge-notset');
}

function showMsg(id, msg, isErr) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent  = msg;
  el.style.color  = isErr ? '#f87171' : '#4ade80';
  if (!isErr) setTimeout(() => el.textContent = '', 3000);
}

// ── Manual token form (Connect tab) ─────────────────────
function toggleManualTokenForm() {
  const form = document.getElementById('fb-manual-form');
  form.style.display = form.style.display === 'none' ? '' : 'none';
}

async function submitManualToken() {
  const token = (document.getElementById('fb-manual-token').value || '').trim();
  const name  = (document.getElementById('fb-manual-name').value  || '').trim();
  const errEl = document.getElementById('fb-manual-err');
  const btn   = document.getElementById('fb-manual-save');
  if (!token) { errEl.textContent = 'Please paste a token.'; errEl.style.display = ''; return; }
  errEl.style.display = 'none';
  btn.textContent = 'Connecting\u2026'; btn.disabled = true;
  try {
    const res = await fetch('/api/fb/connection/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, name })
    }).then(r => r.json());
    if (res.error) throw new Error(res.error);
    await loadConnection();
  } catch(e) {
    errEl.textContent = e.message || 'Failed to save token.';
    errEl.style.display = '';
  } finally {
    btn.textContent = '\u2713 Connect with this token'; btn.disabled = false;
  }
}

// ── Search Facebook targets from Add Target modal ────────
async function searchFbTargets() {
  const kw      = (document.getElementById('target-search-kw').value || '').trim();
  const type    = document.getElementById('target-search-type').value; // 'groups' or 'pages'
  const results = document.getElementById('target-search-results');
  if (!kw) { results.innerHTML = '<p style="color:#f87171;font-size:0.82rem">Enter a keyword first.</p>'; return; }

  const btn = document.getElementById('target-search-btn');
  btn.disabled = true; btn.textContent = 'Searching…';
  results.innerHTML = '<div style="font-size:0.82rem;color:var(--muted)">Searching…</div>';

  const fbUrl = 'https://www.facebook.com/search/' + type + '/?q=' + encodeURIComponent(kw);

  // Build result rows
  let rows = '<div style="font-size:0.82rem;color:var(--muted);margin-bottom:8px">'
    + 'Facebook doesn\'t expose search results via API. Open Facebook search, find your group/page, copy the URL and use the paste field below.'
    + '</div>'
    + '<a href="' + fbUrl + '" target="_blank" rel="noopener" '
    + 'style="display:inline-flex;align-items:center;gap:8px;padding:9px 16px;background:#1877f2;color:#fff;border-radius:8px;font-size:0.85rem;font-weight:600;text-decoration:none;margin-bottom:12px">'
    + '<svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>'
    + 'Search &ldquo;' + esc(kw) + '&rdquo; on Facebook &nearr;'
    + '</a>'
    + '<div style="font-size:0.78rem;color:var(--muted)">Tip: Copy the group/page URL from your browser, then paste it in the field below.</div>';

  results.innerHTML = rows;
  btn.disabled = false; btn.textContent = '\ud83d\udd0d Search';
}

// ── Branding Tab ─────────────────────────────────────────
const brandState = {
  name: '', logoUrl: '', logoImg: null,
  bg: '#0d1630', accent: '#2563eb', textColor: '#ffffff',
  fontSize: 30, credit: true
};

async function loadBranding() {
  const res = await fetch('/api/fb/branding').then(r => r.json()).catch(() => ({}));
  const b = res.branding || {};
  if (b.name)      { brandState.name = b.name;           document.getElementById('brand-name').value = b.name; }
  if (b.logoUrl)   { brandState.logoUrl = b.logoUrl;     document.getElementById('brand-logo-url').value = b.logoUrl;
                     const p = document.getElementById('brand-logo-preview'); p.src = b.logoUrl; p.style.display = 'block';
                     loadBrandLogo(b.logoUrl); }
  if (b.bg)        { brandState.bg = b.bg;               syncColor('brand-bg', b.bg); }
  if (b.accent)    { brandState.accent = b.accent;       syncColor('brand-accent', b.accent); }
  if (b.textColor) { brandState.textColor = b.textColor; syncColor('brand-text', b.textColor); }
  if (b.fontSize)  { brandState.fontSize = parseInt(b.fontSize); document.getElementById('brand-fontsize').value = b.fontSize; }
  if (b.credit !== undefined) { brandState.credit = b.credit; document.getElementById('brand-credit').checked = b.credit; }
  renderBrandCanvas();
}

function syncColor(id, val) {
  document.getElementById(id).value = val;
  document.getElementById(id + '-hex').value = val;
}

function loadBrandLogo(url) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload  = () => { brandState.logoImg = img; renderBrandCanvas(); };
  img.onerror = () => { brandState.logoImg = null; renderBrandCanvas(); };
  img.src = url;
}

function renderBrandCanvas() {
  const canvas = document.getElementById('brand-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = 1200, H = 630;

  // Background
  ctx.fillStyle = brandState.bg;
  ctx.fillRect(0, 0, W, H);

  // Accent bar left edge
  ctx.fillStyle = brandState.accent;
  ctx.fillRect(0, 0, 8, H);

  // Subtle gradient overlay
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, 'rgba(255,255,255,0.03)');
  grad.addColorStop(1, 'rgba(0,0,0,0.15)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Logo
  let logoBottom = 60;
  if (brandState.logoImg) {
    const lh = 80, lw = Math.round(brandState.logoImg.width * (lh / brandState.logoImg.height));
    const lx = 60, ly = 50;
    ctx.drawImage(brandState.logoImg, lx, ly, Math.min(lw, 300), lh);
    logoBottom = ly + lh + 24;
  }

  // Brand name
  if (brandState.name) {
    ctx.fillStyle = brandState.accent;
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText(brandState.name, 60, brandState.logoImg ? logoBottom : 80);
    logoBottom = (brandState.logoImg ? logoBottom : 80) + 40;
  }

  // Post text
  const text = (document.getElementById('brand-preview-text') || {}).value || 'Your post text will appear here…';
  ctx.fillStyle = brandState.textColor;
  ctx.font = `${brandState.fontSize}px system-ui, sans-serif`;
  const maxW = W - 120;
  const lineH = brandState.fontSize * 1.5;
  const words = text.split(' ');
  let line = '', y = Math.max(logoBottom + 40, 180);
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, 60, y);
      line = word; y += lineH;
      if (y > H - 120) { ctx.fillText(line + '…', 60, y); line = ''; break; }
    } else { line = test; }
  }
  if (line) ctx.fillText(line, 60, y);

  // Accent bottom bar
  ctx.fillStyle = brandState.accent;
  ctx.fillRect(0, H - 6, W, 6);

  // Footer credit
  if (brandState.credit) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '22px system-ui, sans-serif';
    ctx.fillText('Created by eureach.eu', 60, H - 24);
  }
}

// Wire up all controls
document.addEventListener('DOMContentLoaded', function() {
  // Colour pickers ↔ hex inputs
  [['brand-bg','bg'],['brand-accent','accent'],['brand-text','textColor']].forEach(([id, key]) => {
    document.getElementById(id).addEventListener('input', function() {
      brandState[key] = this.value;
      document.getElementById(id + '-hex').value = this.value;
      renderBrandCanvas();
    });
    document.getElementById(id + '-hex').addEventListener('input', function() {
      if (/^#[0-9a-fA-F]{6}$/.test(this.value)) {
        brandState[key] = this.value;
        document.getElementById(id).value = this.value;
        renderBrandCanvas();
      }
    });
  });

  document.getElementById('brand-name').addEventListener('input', function() {
    brandState.name = this.value; renderBrandCanvas();
  });
  document.getElementById('brand-fontsize').addEventListener('change', function() {
    brandState.fontSize = parseInt(this.value); renderBrandCanvas();
  });
  document.getElementById('brand-credit').addEventListener('change', function() {
    brandState.credit = this.checked; renderBrandCanvas();
  });

  // Logo file upload
  document.getElementById('brand-logo-file').addEventListener('change', function() {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      brandState.logoUrl = e.target.result;
      const p = document.getElementById('brand-logo-preview');
      p.src = e.target.result; p.style.display = 'block';
      loadBrandLogo(e.target.result);
    };
    reader.readAsDataURL(file);
  });

  // Save branding
  document.getElementById('brand-save-btn').addEventListener('click', async function() {
    const btn = this;
    btn.textContent = 'Saving\u2026'; btn.disabled = true;
    const payload = {
      name: document.getElementById('brand-name').value.trim(),
      logoUrl: brandState.logoUrl,
      bg: brandState.bg, accent: brandState.accent, textColor: brandState.textColor,
      fontSize: brandState.fontSize, credit: brandState.credit
    };
    await fetch('/api/fb/branding', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    btn.textContent = 'Save Branding'; btn.disabled = false;
    const msg = document.getElementById('brand-save-msg');
    msg.textContent = '\u2713 Saved'; setTimeout(() => msg.textContent = '', 2500);
  });

  // Download PNG
  document.getElementById('brand-download').addEventListener('click', function() {
    const canvas = document.getElementById('brand-canvas');
    canvas.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'fb-post-' + Date.now() + '.png';
      a.click();
    }, 'image/png');
  });

  loadBranding();
});
