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

// Nav auth state — runs on every page
(function () {
  document.addEventListener("DOMContentLoaded", function () {
    fetch("/api/auth/me").then(function (r) {
      if (!r.ok) return null;
      return r.json();
    }).then(function (d) {
      if (!d || !d.user) return;
      const u = d.user;

      // Update profile button
      const btn = document.getElementById("nav-profile-btn");
      if (btn) {
        const initials = ((u.firstName || "")[0] || (u.email || "")[0] || "?").toUpperCase();
        btn.textContent = initials;
        btn.title = (u.firstName ? u.firstName + " " + (u.lastName || "") : u.email).trim();
        btn.classList.add("logged-in");
        btn.style.display = "";
      }

      // Hide sign-in and sign-up buttons when logged in
      document.querySelectorAll('a[href="signin.html"]').forEach(function (el) {
        el.style.display = "none";
      });
      document.querySelectorAll('#nav-signup-btn, a[href="signup.html"].btn-primary').forEach(function (el) {
        el.style.display = "none";
      });

      // Replace ⚙ gear btn text with user plan badge, add sign-out
      document.querySelectorAll('.nav-cta a[href="settings.html"].btn-ghost').forEach(function (el) {
        if (el.textContent.trim() === "⚙") el.style.display = "none";
      });

      // Show admin tab in settings if user is admin
      const adminTab = document.getElementById('tab-btn-admin');
      if (adminTab && u.role === 'admin') adminTab.style.display = '';

      // Add Admin link in nav for admin users (skip on admin.html — it has its own nav)
      if (u.role === 'admin' && !document.getElementById('nav-admin-link') && document.body.dataset.page !== 'admin') {
        const cta = document.querySelector('.nav-cta');
        if (cta) {
          const a = document.createElement('a');
          a.id = 'nav-admin-link';
          a.href = 'admin.html';
          a.className = 'btn btn-ghost';
          a.style.cssText = 'font-size:0.78rem;padding:7px 14px;border-color:rgba(124,58,237,0.5);color:#a78bfa;';
          a.textContent = '⚙ Admin';
          cta.insertBefore(a, cta.firstChild);
        }
      }

      // Inject sign-out button if not already there (skip on admin.html)
      const cta = document.querySelector(".nav-cta");
      if (cta && !document.getElementById("nav-signout-btn") && document.body.dataset.page !== 'admin') {
        const so = document.createElement("button");
        so.id = "nav-signout-btn";
        so.className = "btn btn-ghost";
        so.style.cssText = "font-size:0.78rem;padding:7px 14px;cursor:pointer;";
        so.textContent = "Sign out";
        so.addEventListener("click", function () {
          fetch("/api/auth/signout", { method: "POST" }).finally(function () {
            window.location.href = "signin.html";
          });
        });
        cta.insertBefore(so, cta.querySelector('a[href="membership.html"]') || null);
      }
    }).catch(function () {});
  });
})();

// Simple API helper used by YouTuber portal pages
window.api = {
  async get(url) {
    const r = await fetch(url);
    const d = await r.json();
    if (!r.ok) { const e = new Error(d.error || r.statusText); e.status = r.status; throw e; }
    return d;
  },
  async post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) { const e = new Error(d.error || r.statusText); e.status = r.status; throw e; }
    return d;
  },
  async patch(url, body) {
    const r = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) { const e = new Error(d.error || r.statusText); e.status = r.status; throw e; }
    return d;
  },
  async put(url, body) {
    const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) { const e = new Error(d.error || r.statusText); e.status = r.status; throw e; }
    return d;
  },
};
