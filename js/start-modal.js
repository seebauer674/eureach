/* ── EUREACH Starting Modal ───────────────────────────────────────────
   Shows once per session after login on profile.html
   ──────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var SESSION_KEY = 'eureach_start_modal_v1';

  var OPTIONS = [
    {
      icon: '📝',
      label: 'Write an article',
      desc: 'AI-powered articles for SEO, GEO and more',
      href: 'articles.html'
    },
    {
      icon: '📧',
      label: 'Create a newsletter',
      desc: 'Build an email campaign for your audience',
      href: 'marketing.html'
    },
    {
      icon: '📘',
      label: 'Create a Facebook post',
      desc: 'Write engaging social media content',
      href: 'marketing.html?tab=social&platform=facebook'
    },
    {
      icon: '📢',
      label: 'Create an advertisement',
      desc: 'Meta Ads and Google Ads copy that converts',
      href: 'marketing.html?tab=ads'
    },
    {
      icon: '💡',
      label: 'Give me marketing ideas',
      desc: 'Get a full campaign strategy from AI',
      href: 'marketing.html?tab=campaign'
    },
    {
      icon: '🔄',
      label: 'Improve my existing text',
      desc: 'Rewrite and enhance your content with AI',
      href: 'articles.html'
    },
    {
      icon: '🌐',
      label: 'Translate / localize my content',
      desc: 'Adapt your content for Greek, English or German markets',
      href: 'articles.html'
    },
    {
      icon: '🎯',
      label: 'Help me promote a product',
      desc: 'Generate a complete multi-platform campaign',
      href: 'marketing.html?tab=orchestrator'
    }
  ];

  var STYLES = [
    '.sm-overlay{position:fixed;inset:0;background:rgba(4,9,25,0.78);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;animation:sm-in 0.22s ease}',
    '@keyframes sm-in{from{opacity:0}to{opacity:1}}',
    '.sm-box{background:linear-gradient(145deg,#0d1630,#080f20);border:1px solid rgba(255,255,255,0.1);border-radius:20px;width:100%;max-width:700px;max-height:92vh;overflow-y:auto;box-shadow:0 30px 80px rgba(0,0,0,0.6),0 0 0 1px rgba(37,99,235,0.15);animation:sm-up 0.26s cubic-bezier(0.34,1.56,0.64,1)}',
    '@keyframes sm-up{from{opacity:0;transform:translateY(16px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}',
    '.sm-header{display:flex;justify-content:space-between;align-items:flex-start;padding:28px 28px 22px;border-bottom:1px solid rgba(255,255,255,0.07)}',
    '.sm-greeting{font-size:0.8rem;color:#64748b;margin:0 0 5px;font-weight:500}',
    '.sm-title{font-size:1.35rem;font-weight:800;color:#e2e8f0;letter-spacing:-0.3px;margin:0;line-height:1.2}',
    '.sm-close{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);color:#64748b;font-size:1.2rem;line-height:1;width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all 0.2s;margin-top:2px;font-family:inherit}',
    '.sm-close:hover{background:rgba(255,255,255,0.14);color:#e2e8f0;border-color:rgba(255,255,255,0.25)}',
    '.sm-body{padding:22px 28px 14px}',
    '.sm-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
    '.sm-option{display:flex;align-items:center;gap:13px;padding:15px 16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:13px;text-decoration:none;color:inherit;transition:all 0.2s cubic-bezier(0.4,0,0.2,1)}',
    '.sm-option:hover{background:rgba(37,99,235,0.12);border-color:rgba(37,99,235,0.4);transform:translateY(-2px);box-shadow:0 8px 24px rgba(37,99,235,0.15)}',
    '.sm-option:focus-visible{outline:2px solid #3b82f6;outline-offset:2px}',
    '.sm-option-icon{font-size:1.4rem;flex-shrink:0;line-height:1}',
    '.sm-option-text{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}',
    '.sm-option-label{font-size:0.85rem;font-weight:700;color:#e2e8f0}',
    '.sm-option-desc{font-size:0.72rem;color:#4b5a6e;line-height:1.4}',
    '.sm-option-arrow{color:#1e293b;font-size:0.95rem;flex-shrink:0;transition:color 0.2s,transform 0.2s}',
    '.sm-option:hover .sm-option-arrow{color:#3b82f6;transform:translateX(3px)}',
    '.sm-footer{padding:14px 28px 26px;display:flex;justify-content:center}',
    '.sm-menu-btn{background:transparent;border:1px solid rgba(255,255,255,0.1);color:#475569;padding:9px 28px;border-radius:10px;font-size:0.82rem;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:inherit}',
    '.sm-menu-btn:hover{border-color:rgba(255,255,255,0.22);color:#94a3b8}',
    '@media(max-width:560px){.sm-grid{grid-template-columns:1fr}.sm-header{padding:20px 18px 16px}.sm-body{padding:16px 14px 10px}.sm-footer{padding:12px 14px 22px}.sm-title{font-size:1.1rem}}'
  ].join('');

  function buildHTML(name) {
    var opts = OPTIONS.map(function (o) {
      return '<a href="' + o.href + '" class="sm-option">'
        + '<span class="sm-option-icon">' + o.icon + '</span>'
        + '<span class="sm-option-text">'
        +   '<span class="sm-option-label">' + o.label + '</span>'
        +   '<span class="sm-option-desc">' + o.desc + '</span>'
        + '</span>'
        + '<span class="sm-option-arrow">→</span>'
        + '</a>';
    }).join('');

    return '<div id="sm-overlay" role="dialog" aria-modal="true" aria-labelledby="sm-title">'
      + '<div class="sm-box" tabindex="-1">'
      +   '<div class="sm-header">'
      +     '<div>'
      +       '<p class="sm-greeting">Hello, ' + name + ' 👋</p>'
      +       '<h2 class="sm-title" id="sm-title">What do you need help with today?</h2>'
      +     '</div>'
      +     '<button class="sm-close" id="sm-close" aria-label="Close">×</button>'
      +   '</div>'
      +   '<div class="sm-body"><div class="sm-grid">' + opts + '</div></div>'
      +   '<div class="sm-footer"><button class="sm-menu-btn" id="sm-menu-btn">Go to Main Menu</button></div>'
      + '</div>'
      + '</div>';
  }

  function closeModal() {
    var el = document.getElementById('sm-overlay');
    if (!el) return;
    el.style.transition = 'opacity 0.18s';
    el.style.opacity = '0';
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 200);
  }

  function bindEvents() {
    document.getElementById('sm-close').addEventListener('click', closeModal);
    document.getElementById('sm-menu-btn').addEventListener('click', closeModal);
    document.getElementById('sm-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });
    function escHandler(e) {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); }
    }
    document.addEventListener('keydown', escHandler);
    // Options are <a> tags — navigation is native; mark session on click
    document.querySelectorAll('.sm-option').forEach(function (a) {
      a.addEventListener('click', function () {
        sessionStorage.setItem(SESSION_KEY, '1');
      });
    });
  }

  async function init() {
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sessionStorage.setItem(SESSION_KEY, '1');

    var name = 'there';
    try {
      var res = await fetch('/api/auth/me');
      if (res.ok) {
        var d = await res.json();
        if (d && d.user) {
          name = d.user.firstName || (d.user.email ? d.user.email.split('@')[0] : 'there');
        }
      }
    } catch (e) {}

    // Inject styles
    var style = document.createElement('style');
    style.textContent = STYLES;
    document.head.appendChild(style);

    // Inject HTML
    document.body.insertAdjacentHTML('beforeend', buildHTML(name));

    bindEvents();

    // Focus modal box for keyboard users
    setTimeout(function () {
      var box = document.querySelector('.sm-box');
      if (box) box.focus();
    }, 60);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
