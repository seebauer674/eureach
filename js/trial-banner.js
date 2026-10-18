// Trial banner — include on all app pages after DOMContentLoaded
(function () {
  'use strict';

  async function initTrialBanner() {
    let status;
    try {
      const res = await fetch('/api/billing/status');
      if (!res.ok) return;
      status = await res.json();
    } catch { return; }

    if (status.plan !== 'trial' || status.trialStatus !== 'active') return;

    const days    = status.daysRemaining;
    const dateStr = status.nextChargeDate || '';

    const bgColor = days <= 1
      ? 'rgba(239,68,68,0.15)'
      : days <= 3
      ? 'rgba(245,158,11,0.15)'
      : 'rgba(34,197,94,0.1)';

    const borderColor = days <= 1
      ? 'rgba(239,68,68,0.4)'
      : days <= 3
      ? 'rgba(245,158,11,0.4)'
      : 'rgba(34,197,94,0.3)';

    const dot = days <= 1 ? '🔴' : days <= 3 ? '🟡' : '🟢';

    const banner = document.createElement('div');
    banner.id = 'trial-banner';
    banner.style.cssText = `
      position: fixed; top: 52px; left: 0; right: 0; z-index: 900;
      background: ${bgColor}; border-bottom: 1px solid ${borderColor};
      padding: 8px 16px; display: flex; align-items: center; gap: 12px;
      font-size: 0.82rem; color: var(--white, #fff); backdrop-filter: blur(8px);
    `;
    banner.innerHTML = `
      <span>${dot}</span>
      <span style="flex:1">
        <strong>Free trial</strong> — ${days} day${days !== 1 ? 's' : ''} remaining ·
        Next charge: €15 on ${dateStr}
      </span>
      <a href="/billing" style="color:var(--blue2,#60a5fa);text-decoration:none;white-space:nowrap">Manage billing</a>
      <span style="color:var(--border,#334155);margin:0 4px">|</span>
      <button id="trial-cancel-btn" style="
        background:none;border:1px solid rgba(239,68,68,0.4);border-radius:6px;
        color:#f87171;padding:3px 10px;font-size:0.78rem;cursor:pointer;
      ">Cancel trial</button>
    `;
    document.body.prepend(banner);

    // Push page content down
    var BANNER_TOP = parseInt(banner.style.top) || 52;
    var BANNER_BOTTOM = BANNER_TOP + 36;
    ["main", ".main", "#main", ".ag-page", ".db-body"].forEach(function(sel) {
      var el = document.querySelector(sel);
      if (el) { var cur = parseInt(window.getComputedStyle(el).paddingTop) || 0; el.style.paddingTop = Math.max(cur, BANNER_BOTTOM) + "px"; }
    });
    var rail = document.querySelector(".db-rail");
    if (rail) { rail.style.top = BANNER_BOTTOM + "px"; rail.style.height = "calc(100vh - " + BANNER_BOTTOM + "px)"; }

    document.getElementById('trial-cancel-btn').addEventListener('click', async () => {
      if (!confirm('Cancel your trial? Your account will be downgraded immediately and you will not be charged.')) return;
      try {
        const csrf = document.cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=')[1] || '';
        const r = await fetch('/api/trial/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
          body: JSON.stringify({}),
        });
        const d = await r.json();
        if (d.success) { alert('Trial cancelled. You will not be charged.'); location.href = '/'; }
        else alert(d.error || 'Failed to cancel trial.');
      } catch { alert('Failed to cancel trial. Please try again.'); }
    });
  }

  // Trial expired overlay
  function showExpiredOverlay() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:9999;background:rgba(2,8,23,0.95);
      display:flex;align-items:center;justify-content:center;
    `;
    overlay.innerHTML = `
      <div style="
        max-width:420px;text-align:center;padding:40px 32px;
        background:linear-gradient(145deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02));
        border:1px solid rgba(255,255,255,0.1);border-radius:16px;
      ">
        <div style="font-size:2rem;margin-bottom:16px">⏱</div>
        <h2 style="font-size:1.3rem;font-weight:800;margin-bottom:8px">Ihr Testzeitraum ist abgelaufen</h2>
        <h2 style="font-size:1.3rem;font-weight:800;margin-bottom:20px;color:rgba(255,255,255,0.7)">Your trial has ended</h2>
        <p style="color:rgba(255,255,255,0.6);font-size:0.9rem;margin-bottom:28px">
          Continue with eureach for <strong style="color:#fff">€15 / month</strong>
        </p>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
          <a href="/upgrade" style="
            padding:12px 24px;background:linear-gradient(135deg,#2563eb,#7c3aed);
            color:#fff;border-radius:10px;font-weight:700;text-decoration:none;font-size:0.95rem;
          ">Upgrade now →</a>
          <a href="/api/trial/cancel" style="
            padding:12px 24px;background:transparent;
            color:rgba(255,255,255,0.5);border:1px solid rgba(255,255,255,0.2);
            border-radius:10px;font-size:0.9rem;text-decoration:none;
          " onclick="return cancelAccount()">Cancel account</a>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    window.cancelAccount = function () {
      const csrf = document.cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=')[1] || '';
      if (!confirm('Cancel your account? This cannot be undone.')) return false;
      fetch('/api/trial/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({}),
      }).then(() => { location.href = '/'; });
      return false;
    };
  }

  // Intercept 402 (trial expired) and 403 trial limits on all fetch calls
  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await _fetch(...args);
    if (res.status === 402 || res.status === 403) {
      const clone = res.clone();
      clone.json().then(d => {
        if (res.status === 402 && d.error === 'trial_expired' && !document.getElementById('trial-expired-overlay')) {
          showExpiredOverlay();
        }
        if (res.status === 403 && d.error && d.error.startsWith('trial_') && typeof window.showTrialLimitModal === 'function') {
          window.showTrialLimitModal(d.error);
        }
      }).catch(() => {});
    }
    return res;
  };

  // Show upgrade modal for trial limit errors
  window.showTrialLimitModal = function (errorCode) {
    const modal = document.getElementById('trial-limit-modal');
    if (modal) modal.remove();

    const configs = {
      trial_competitor_limit: {
        icon: '🔍',
        title: "You've used your 1 trial competitor search",
        benefits: ['Unlimited competitor searches', 'Full AI analysis (upgraded model)', '6 articles per month', '4 audits per month'],
      },
      trial_article_limit: {
        icon: '✍️',
        title: "You've used your 3 trial articles",
        benefits: ['6 articles per month', 'Upgraded AI model for better quality', 'Unlimited competitor searches', '4 audits per month'],
      },
      trial_audit_limit: {
        icon: '📊',
        title: "You've used today's free audit",
        benefits: ['4 audits per month (paid)', 'Upgraded AI analysis', 'Unlimited competitor searches', '6 articles per month'],
      },
      trial_lead_limit: {
        icon: '🎯',
        title: 'Lead Finder requires a paid plan',
        benefits: ['Full Lead Finder access', 'Unlimited competitor searches', '6 articles per month', '4 audits per month'],
      },
    };

    const cfg = configs[errorCode] || {
      icon: '🔒', title: 'Upgrade to continue',
      benefits: ['All features unlocked', 'Upgraded AI model', 'Priority support'],
    };

    const el = document.createElement('div');
    el.id = 'trial-limit-modal';
    el.style.cssText = `
      position:fixed;inset:0;z-index:9000;background:rgba(2,8,23,0.8);
      display:flex;align-items:center;justify-content:center;padding:24px;
    `;
    el.innerHTML = `
      <div style="
        max-width:400px;width:100%;
        background:linear-gradient(145deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02));
        border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:32px 28px;
      ">
        <div style="font-size:1.8rem;margin-bottom:12px">${cfg.icon}</div>
        <h3 style="font-size:1.1rem;font-weight:800;margin-bottom:16px">${cfg.title}</h3>
        <p style="color:rgba(255,255,255,0.6);font-size:0.85rem;margin-bottom:12px">Upgrade to €15/month for:</p>
        <ul style="list-style:none;padding:0;margin:0 0 24px;display:flex;flex-direction:column;gap:8px">
          ${cfg.benefits.map(b => `<li style="color:rgba(255,255,255,0.8);font-size:0.85rem">→ ${b}</li>`).join('')}
        </ul>
        <div style="display:flex;gap:10px">
          <a href="/upgrade" style="
            flex:1;text-align:center;padding:11px;
            background:linear-gradient(135deg,#2563eb,#7c3aed);
            color:#fff;border-radius:10px;font-weight:700;text-decoration:none;font-size:0.9rem;
          ">Upgrade now — €15/month</a>
          <button onclick="document.getElementById('trial-limit-modal').remove()" style="
            padding:11px 16px;background:transparent;border:1px solid rgba(255,255,255,0.15);
            border-radius:10px;color:rgba(255,255,255,0.5);font-size:0.85rem;cursor:pointer;
          ">Continue</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el) el.remove(); });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTrialBanner);
  } else {
    initTrialBanner();
  }
})();
