(function () {
  // ── Inject sidebar styles immediately (before auth round-trip) ─────────────
  var _topNav = document.querySelector('nav.app-nav');
  if (_topNav) {
    var _style = document.createElement('style');
    _style.id = 'sidebar-styles';
    _style.textContent =
      '#sidebar{position:fixed;top:0;left:0;bottom:0;width:220px;background:#080d1c;border-right:1px solid rgba(255,255,255,0.07);display:flex;flex-direction:column;overflow-y:auto;overflow-x:hidden;z-index:9000;scrollbar-width:thin}' +
      '#sidebar::-webkit-scrollbar{width:3px}#sidebar::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1)}' +
      '.sb-logo-wrap{padding:18px 16px 14px;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:6px;flex-shrink:0}' +
      '.sb-logo{font-size:1.1rem;font-weight:800;color:#fff;text-decoration:none;letter-spacing:-0.5px;display:block}' +
      '.sb-dot{color:#f59e0b}' +
      '.sb-section{padding:0 8px 2px}' +
      '.sb-section-hd{font-size:0.62rem;font-weight:700;color:rgba(255,255,255,0.25);text-transform:uppercase;letter-spacing:1px;padding:10px 8px 3px}' +
      '.sb-item{display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:7px;color:rgba(255,255,255,0.5);text-decoration:none;font-size:0.82rem;font-weight:500;transition:background .15s,color .15s;cursor:pointer;border:none;background:none;width:100%;text-align:left;white-space:nowrap}' +
      '.sb-item:hover{background:rgba(255,255,255,0.07);color:#fff}' +
      '.sb-item.active{background:rgba(37,99,235,0.18);color:#60a5fa;font-weight:600}' +
      '.sb-ic{font-size:0.9rem;width:18px;text-align:center;flex-shrink:0;line-height:1}' +
      '.sb-lbl{overflow:hidden;text-overflow:ellipsis}' +
      '.sb-spacer{flex:1;min-height:8px}' +
      '.sb-bottom{padding:6px 8px 8px;border-top:1px solid rgba(255,255,255,0.06)}' +
      '.sb-lang{display:flex;gap:2px;padding:6px 8px 8px}' +
      '.sb-lb{background:none;border:none;font-size:0.95rem;cursor:pointer;padding:3px 5px;border-radius:4px;opacity:.55;transition:opacity .15s}' +
      '.sb-lb:hover{opacity:1}' +
      '.sb-signout .sb-lbl{color:rgba(239,68,68,0.7)}' +
      '.sb-signout:hover .sb-lbl{color:#ef4444}' +
      'body.has-sidebar{margin-left:220px;overflow-x:hidden}' +
      'body.has-sidebar [class$="-page"],body.has-sidebar [class*="-page "],body.has-sidebar .or-page,body.has-sidebar .ag-page{padding-top:24px!important}' +
      '@media(max-width:700px){#sidebar{width:56px}.sb-lbl,.sb-section-hd,.sb-logo{display:none}.sb-logo-wrap{padding:14px 8px}.sb-item{justify-content:center;padding:10px 0}.sb-ic{width:auto;font-size:1.1rem}body.has-sidebar{margin-left:56px}}';
    document.head.appendChild(_style);
  }

  // ── Auth fetch + sidebar build ─────────────────────────────────────────────
  fetch('/api/auth/me')
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(d) {
      var user     = d && d.user ? d.user : null;
      var role     = user ? (user.role || '') : '';

      // Translation lookup — reads lang from localStorage, falls back to 'en'
      var lang = (typeof localStorage !== 'undefined' && localStorage.getItem('eureach_lang')) || 'en';
      var T    = (window.EUREACH_T && window.EUREACH_T[lang]) || {};
      function t(key, fallback) { return T[key] || fallback; }

      // Legacy creator link in old nav
      var legacyEl = document.getElementById('nav-creator-link');
      if (legacyEl && (role === 'youtuber' || role === 'admin')) legacyEl.style.display = '';

      var topNav = document.querySelector('nav.app-nav');
      if (!topNav) return;

      var cur  = window.location.pathname.split('/').pop() || '';
      var path = window.location.pathname;

      function isActive(href) {
        if (href === '/coach') return path === '/coach' || path.startsWith('/coach/');
        return cur === href;
      }

      function item(href, icon, label) {
        return '<a href="' + href + '" class="sb-item' + (isActive(href) ? ' active' : '') + '">' +
          '<span class="sb-ic">' + icon + '</span>' +
          '<span class="sb-lbl">' + label + '</span>' +
          '</a>';
      }

      function section(title, content) {
        return '<div class="sb-section"><div class="sb-section-hd">' + title + '</div>' + content + '</div>';
      }

      var showCreator = role === 'youtuber' || role === 'admin';

      var sidebar =
        '<div id="sidebar">' +
        '<div class="sb-logo-wrap"><a href="index.html" class="sb-logo">eureach<span class="sb-dot">.</span>eu</a></div>' +

        section(t('sb.findGrow', 'Find &amp; Grow'),
          item('leads.html',       '\ud83d\udd0d', t('sb.leadFinder',  'Lead Finder')) +
          item('competitors.html', '\ud83d\udce1', t('sb.competitors', 'Competitors')) +
          item('citations.html',   '\ud83d\udd17', t('sb.citations',   'Citations')) +
          item('audit.html',       '\ud83d\udd0e', t('sb.aiAudit',     'AI Audit'))
        ) +

        section(t('sb.create', 'Create'),
          item('articles.html',             '\u270d\ufe0f',  t('sb.articles',   'Articles')) +
          item('marketing.html',            '\ud83d\ude80',  t('sb.marketing',  'Marketing')) +
          item('newsletter-campaigns.html', '\ud83d\udce7',  t('sb.newsletter', 'Newsletter')) +
          item('blog.html',                 '\ud83d\udcdd',  t('sb.blog',       'Blog'))
        ) +

        section(t('sb.manage', 'Manage'),
          item('dashboard.html', '📊', t('sb.dashboard', 'Dashboard')) +
          item('crm.html',       '\ud83d\uddc2\ufe0f',  t('sb.crm',       'CRM')) +
          item('pipeline.html',  '\ud83d\udcca',         t('sb.pipeline',  'Pipeline')) +
          item('outreach.html',  '\ud83d\udce4',         t('sb.outreach',  'Outreach')) +
          item('templates.html', '\ud83d\udccb',         t('sb.templates', 'Templates')) +
          item('email_log.html', '\ud83d\udcec',         t('sb.emailLog',  'Email Log'))
        ) +

        section(t('sb.coach', 'Coach'),
          item('/coach', '\ud83c\udfaf', t('sb.weeklyCoach', 'Weekly Coach'))
        ) +

        (showCreator ? section(t('sb.creator', 'Creator'), item('youtube.html', '\ud83c\udfa5', t('sb.creatorHub', 'Creator Hub'))) : '') +

        '<div class="sb-spacer"></div>' +

        '<div class="sb-bottom">' +
          '<div class="sb-lang">' +
            '<button class="sb-lb" onclick="if(typeof setLang===\'function\')setLang(\'el\')" title="\u0395\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac">\ud83c\uddec\ud83c\uddf7</button>' +
            '<button class="sb-lb" onclick="if(typeof setLang===\'function\')setLang(\'de\')" title="Deutsch">\ud83c\udde9\ud83c\uddea</button>' +
            '<button class="sb-lb" onclick="if(typeof setLang===\'function\')setLang(\'en\')" title="English">\ud83c\uddec\ud83c\udde7</button>' +
          '</div>' +
          item('settings.html', '\u2699\ufe0f', t('sb.settings', 'Settings')) +
          (user
            ? '<a href="#" class="sb-item sb-signout" onclick="fetch(\'/api/auth/signout\',{method:\'POST\'}).then(function(){location.href=\'/signin.html\'});return false"><span class="sb-ic">\ud83d\udecb\ufe0f</span><span class="sb-lbl">' + t('sb.signOut', 'Sign out') + '</span></a>'
            : '<a href="signin.html" class="sb-item"><span class="sb-ic">\ud83d\udd11</span><span class="sb-lbl">' + t('sb.signIn', 'Sign in') + '</span></a>'
          ) +
        '</div>' +
        '</div>';

      document.body.insertAdjacentHTML('afterbegin', sidebar);
      topNav.style.display = 'none';
      document.body.classList.add('has-sidebar');
    })
    .catch(function() {});
})();
