/* ── eureach.eu — i18n engine ─────────────────────────── */
(function () {
  var LANG_KEY = "eureach_lang";

  window.euLang = function () {
    return localStorage.getItem(LANG_KEY) || "el";
  };

  window.setLang = function (lang) {
    if (!["el", "de", "en"].includes(lang)) return;
    localStorage.setItem(LANG_KEY, lang);
    /* persist to user profile silently */
    fetch("/api/auth/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferredLang: lang }),
    }).catch(function () {});
    location.reload();
  };

  document.addEventListener("DOMContentLoaded", function () {
    var lang = window.euLang();
    var T    = window.EUREACH_T;
    if (!T || !T[lang]) return;
    var s = T[lang];

    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (s[key] !== undefined) el.textContent = s[key];
    });

    document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-ph");
      if (s[key] !== undefined) el.placeholder = s[key];
    });

    document.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-html");
      if (s[key] !== undefined) el.innerHTML = s[key];
    });

    document.documentElement.lang = lang;

    document.querySelectorAll(".lang-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.lang === lang);
    });
  });
})();
