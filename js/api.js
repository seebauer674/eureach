// CSRF double-submit: reads csrf_token cookie, adds X-CSRF-Token header to all mutating requests
(function () {
  function getCsrf() {
    const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  const _fetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const method = ((init && init.method) || "GET").toUpperCase();
    if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
      init = init || {};
      init.headers = Object.assign({}, init.headers, { "X-CSRF-Token": getCsrf() });
    }
    return _fetch(input, init);
  };
})();

// Inactivity auto-logout — 5 min, hidden, with 1-min warning toast
(function () {
  const SKIP = ['/signin.html', '/signup.html', '/', '/index.html', '/solo', '/audit-share.html'];
  const p    = window.location.pathname;
  if (SKIP.some(s => p === s || p.startsWith('/solo'))) return;

  const TIMEOUT_MS  = 5 * 60 * 1000;   // 5 minutes
  const WARN_MS     = 1 * 60 * 1000;   // warn 1 min before expiry

  let logoutTimer, warnTimer, toastEl;

  function getCsrf() {
    const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function removeToast() {
    if (toastEl) { toastEl.remove(); toastEl = null; }
  }

  function doLogout() {
    removeToast();
    fetch('/api/auth/signout', { method: 'POST', headers: { 'X-CSRF-Token': getCsrf() } })
      .finally(() => { window.location.href = '/signin.html?expired=1'; });
  }

  function showWarning() {
    removeToast();
    toastEl = document.createElement('div');
    toastEl.style.cssText = [
      'position:fixed', 'bottom:24px', 'right:24px', 'z-index:99999',
      'background:#0f172a', 'border:1px solid rgba(245,158,11,0.5)',
      'color:#fbbf24', 'padding:14px 18px', 'border-radius:10px',
      'font-size:0.84rem', 'box-shadow:0 8px 32px rgba(0,0,0,0.5)',
      'display:flex', 'align-items:center', 'gap:12px', 'max-width:320px',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
    ].join(';');
    toastEl.innerHTML =
      '<span>⏱ Session expires in <strong>1 minute</strong> due to inactivity.</span>' +
      '<button onclick="this.parentElement.remove()" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:1.1rem;flex-shrink:0">✕</button>';
    document.body.appendChild(toastEl);
  }

  function reset() {
    clearTimeout(logoutTimer);
    clearTimeout(warnTimer);
    removeToast();
    warnTimer   = setTimeout(showWarning, TIMEOUT_MS - WARN_MS);
    logoutTimer = setTimeout(doLogout,    TIMEOUT_MS);
  }

  // Reset on any user interaction
  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(ev => {
    document.addEventListener(ev, reset, { passive: true });
  });

  // Show "session expired" notice on signin page if redirected here
  if (p === '/signin.html' && new URLSearchParams(window.location.search).get('expired') === '1') {
    document.addEventListener('DOMContentLoaded', function () {
      const notice = document.createElement('div');
      notice.style.cssText = 'background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);color:#fbbf24;padding:10px 16px;border-radius:8px;font-size:0.84rem;margin-bottom:16px;text-align:center;';
      notice.textContent = 'You were logged out due to 5 minutes of inactivity.';
      const form = document.querySelector('form') || document.querySelector('.signin-form') || document.querySelector('.auth-box');
      if (form) form.insertBefore(notice, form.firstChild);
    });
  }

  // Only start timer for non-admin users
  fetch('/api/auth/me').then(r => r.json()).then(d => {
    if (d.user && d.user.role === 'admin') return;
    reset();
  }).catch(() => reset());
})();
