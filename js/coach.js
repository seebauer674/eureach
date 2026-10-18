function uiLocale(){var l=window.euLang?window.euLang():'en';return l==='el'?'el-GR':l==='de'?'de-DE':'en-GB';}
function t(k,fb){var l=window.euLang?window.euLang():'en';var r=window.EUREACH_T;return(r&&r[l]&&r[l][k])||fb||k;}
(function () {
  'use strict';

  let weekData = null;
  let selectedSuggestionIndex = null;
  let linkedInLang = 'el';
  let completedDays = new Set();

  // ── Init ────────────────────────────────────────────────────────────────────

  async function init() {
    try {
      await loadWeek();
      await loadStreak();
    } catch (e) {
      console.error('[coach]', e);
      document.getElementById('coach-loading').style.display = 'none';
      document.getElementById('coach-error').style.display = 'block';
    }
  }

  // ── Load week content ────────────────────────────────────────────────────────

  async function loadWeek() {
    const res = await fetch('/api/coach/week');
    if (!res.ok) {
      if (res.status === 401) { window.location.href = '/signin.html?next=/coach'; return; }
      throw new Error('API error ' + res.status);
    }
    weekData = await res.json();

    // Set week label
    const d = new Date(weekData.weekStart + 'T00:00:00');
    const opts = { day: 'numeric', month: 'long', year: 'numeric' };
    document.getElementById('coach-week-label').textContent =
      t('coach.weekOf','Week of ') + d.toLocaleDateString(uiLocale(), opts);

    // Restore completions
    for (const c of (weekData.completions || [])) {
      completedDays.add(c.day);
    }

    renderProgress();

    // Render cards
    renderMonday();
    renderWednesday();
    renderFriday();

    document.getElementById('coach-loading').style.display = 'none';
    document.getElementById('coach-cards').style.display = 'flex';
  }

  // ── Progress ─────────────────────────────────────────────────────────────────

  function renderProgress() {
    const total = weekData.isPaid ? 3 : 1;
    const done  = completedDays.size;
    const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
    document.getElementById('progress-fill').style.width = pct + '%';
    document.getElementById('progress-text').textContent = done + t('coach.actionsThisWeek','/3 actions this week');
  }

  // ── Streak ───────────────────────────────────────────────────────────────────

  async function loadStreak() {
    try {
      const res = await fetch('/api/coach/streak');
      if (!res.ok) return;
      const data = await res.json();
      if (data.streak > 0) {
        document.getElementById('streak-count').textContent = data.streak;
        document.getElementById('coach-streak').style.display = 'flex';
      }
    } catch {}
  }

  // ── Monday ───────────────────────────────────────────────────────────────────

  function renderMonday() {
    const c = (weekData.content || []).find(x => x.day === 'monday');
    if (!c) return;

    // Suggestions
    const grid = document.getElementById('suggestions-grid');
    grid.innerHTML = '';
    const sugs = c.content.suggestions || [];
    sugs.forEach((s, i) => {
      const card = document.createElement('div');
      card.className = 'suggestion-card';
      card.innerHTML = `
        <p class="suggestion-title">${esc(s.title)}</p>
        <p class="suggestion-why"><strong>${t('coach.whyHelps','Why it helps')}:</strong> ${esc(s.why)}</p>
        <div class="suggestion-meta">
          <span class="suggestion-angle">${esc(s.angle)}</span>
          <span class="suggestion-time">${esc(s.estimated_read_time)}</span>
        </div>`;
      card.onclick = () => selectSuggestion(i);
      grid.appendChild(card);
    });

    // Facebook post fallback
    document.getElementById('monday-fb-text').textContent = c.content.facebook_post || '';

    // Mark done if already completed
    if (completedDays.has('monday')) markCardDone('monday');
  }

  function selectSuggestion(index) {
    selectedSuggestionIndex = index;
    document.querySelectorAll('.suggestion-card').forEach((card, i) => {
      card.classList.toggle('selected', i === index);
    });
    document.getElementById('open-generator-wrap').style.display = 'block';
  }

  function openArticleGenerator() {
    if (selectedSuggestionIndex === null) return;
    const c = (weekData.content || []).find(x => x.day === 'monday');
    if (!c) return;
    const sugs = c.content.suggestions || [];
    const s = sugs[selectedSuggestionIndex];
    if (!s) return;
    const params = new URLSearchParams({ topic: s.title, angle: s.angle, from: 'coach' });
    window.location.href = '/articles.html?' + params.toString();
  }
  window.openArticleGenerator = openArticleGenerator;

  // ── Wednesday ────────────────────────────────────────────────────────────────

  function renderWednesday() {
    if (!weekData.isPaid) {
      document.getElementById('locked-wednesday').style.display = 'block';
      document.getElementById('wednesday-content').style.display = 'none';
      document.getElementById('done-btn-wednesday').style.display = 'none';
      return;
    }
    const c = (weekData.content || []).find(x => x.day === 'wednesday');
    if (!c) return;

    document.getElementById('locked-wednesday').style.display = 'none';
    document.getElementById('wednesday-content').style.display = 'block';
    document.getElementById('badge-wednesday').style.display = 'none';

    document.getElementById('wed-review-text').textContent = c.content.review_message || '';
    document.getElementById('wed-faq-text').textContent    = c.content.faq_post || '';

    if (completedDays.has('wednesday')) markCardDone('wednesday');
  }

  // ── Friday ───────────────────────────────────────────────────────────────────

  function renderFriday() {
    if (!weekData.isPaid) {
      document.getElementById('locked-friday').style.display = 'block';
      document.getElementById('friday-content').style.display = 'none';
      document.getElementById('done-btn-friday').style.display = 'none';
      return;
    }
    const c = (weekData.content || []).find(x => x.day === 'friday');
    if (!c) return;

    document.getElementById('locked-friday').style.display = 'none';
    document.getElementById('friday-content').style.display = 'block';
    document.getElementById('badge-friday').style.display = 'none';

    document.getElementById('fri-linkedin-text').textContent = c.content.linkedin_post_el || '';

    loadVisibility();

    if (completedDays.has('friday')) {
      markCardDone('friday');
      showWeekSummary();
    }
  }

  // LinkedIn language toggle
  function setLinkedInLang(lang) {
    linkedInLang = lang;
    document.getElementById('li-btn-el').classList.toggle('active', lang === 'el');
    document.getElementById('li-btn-en').classList.toggle('active', lang === 'en');

    const c = (weekData.content || []).find(x => x.day === 'friday');
    if (!c) return;
    const post = lang === 'en' ? c.content.linkedin_post_en : c.content.linkedin_post_el;
    document.getElementById('fri-linkedin-text').textContent = post || '';
  }
  window.setLinkedInLang = setLinkedInLang;

  // Visibility report
  async function loadVisibility() {
    const el = document.getElementById('visibility-report');
    try {
      const res = await fetch('/api/coach/visibility');
      if (!res.ok) throw new Error('no data');
      const data = await res.json();

      if (!data.hasData) {
        el.innerHTML = `<div class="vis-no-data">${t('coach.noVisibilityReport','No visibility report yet.')} <a href="/audit.html" style="color:var(--accent)">${t('coach.firstAudit','Run your first audit →')}</a></div>`;
        return;
      }

      const rows = [
        { label: 'AI Visibility', key: 'ai_visibility' },
        { label: 'Local SEO',     key: 'local_seo' },
        { label: 'Content',       key: 'content_quality' },
        { label: 'Overall',       key: 'overall' },
      ];

      let html = '';
      for (const row of rows) {
        const score = data.scores[row.key] || 0;
        const delta = data.deltas ? data.deltas[row.key] : null;
        const deltaStr = delta === null ? '' : (delta > 0 ? '+' + delta : delta === 0 ? '—' : String(delta));
        const deltaClass = delta === null ? '' : (delta > 0 ? 'up' : delta < 0 ? 'down' : 'same');
        html += `<div class="vis-row">
          <span class="vis-label">${row.label}</span>
          <div class="vis-bar-wrap"><div class="vis-bar-fill" style="width:${score}%"></div></div>
          <span class="vis-score">${score}</span>
          ${delta !== null ? `<span class="vis-delta ${deltaClass}">${deltaStr}</span>` : '<span class="vis-delta same"></span>'}
        </div>`;
      }

      const updated = data.updatedAt ? new Date(data.updatedAt).toLocaleDateString(uiLocale()) : '';
      html += `<p class="vis-note">${t('coach.lastUpdated','Last updated:')} ${updated}${data.deltas ? t('coach.compareNote',' · Compared to previous audit') : t('coach.noCompare',' · No comparison yet')}</p>`;
      html += `<a class="vis-audit-link" href="/audit.html">${t('coach.viewAnalysis','View full analysis →')}</a>`;
      el.innerHTML = html;
    } catch {
      el.innerHTML = `<div class="vis-no-data">${t('coach.noVisibilityData','No visibility data yet.')} <a href="/audit.html" style="color:var(--accent)">${t('coach.startAudit','Start an audit →')}</a></div>`;
    }
  }

  function showWeekSummary() {
    const done  = completedDays.size;
    const total = (weekData.completions || []).length;
    const el    = document.getElementById('week-summary');
    if (!el) return;
    document.getElementById('week-summary-text').textContent =
      t('coach.thisWeekDone','This week you completed: ') + done + '/3 ' + t('coach.actions','actions.');
    document.getElementById('total-summary-text').textContent =
      t('coach.totalDone','Total actions since you started: ') + total + ' ' + t('coach.actions','actions.');
    el.style.display = 'block';
  }

  // ── Mark done ────────────────────────────────────────────────────────────────

  async function markDone(day) {
    const btn = document.getElementById('done-btn-' + day);
    if (btn) btn.disabled = true;
    try {
      const res = await fetch('/api/coach/complete/' + day, { method: 'POST' });
      if (!res.ok) return;
      await res.json();
      completedDays.add(day);
      markCardDone(day);
      renderProgress();
      if (day === 'friday') showWeekSummary();
    } catch {
      if (btn) btn.disabled = false;
    }
  }
  window.markDone = markDone;

  function markCardDone(day) {
    const card = document.getElementById('card-' + day);
    if (card) card.classList.add('done');
    const check = document.getElementById('done-' + day);
    if (check) check.style.display = 'inline';
    const btn = document.getElementById('done-btn-' + day);
    if (btn) btn.disabled = true;
    const msg = document.getElementById('done-msg-' + day);
    if (msg) msg.style.display = 'block';
  }

  // ── Copy / Share ─────────────────────────────────────────────────────────────

  function copyOrShare(elId) {
    const text = (document.getElementById(elId) || {}).textContent || '';
    if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
      navigator.share({ text }).catch(() => fallbackCopy(text, elId));
    } else {
      fallbackCopy(text, elId);
    }
  }
  window.copyOrShare = copyOrShare;

  function fallbackCopy(text, elId) {
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.querySelector(`[onclick="copyOrShare('${elId}')"]`);
      if (btn) {
        btn.textContent = t('coach.copied','Copied!');
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = t('coach.copy','Copy'); btn.classList.remove('copied'); }, 2000);
      }
    }).catch(() => {});
  }

  function shareToFacebook(elId) {
    const text = (document.getElementById(elId) || {}).textContent || '';
    const url = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent('https://eureach.eu') + '&quote=' + encodeURIComponent(text.slice(0, 500));
    window.open(url, '_blank', 'width=600,height=400');
  }
  window.shareToFacebook = shareToFacebook;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function esc(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Start ────────────────────────────────────────────────────────────────────
  init();

  // Expose selectSuggestion for inline onclick
  window.selectSuggestion = selectSuggestion;

})();
