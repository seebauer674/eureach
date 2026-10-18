/* ── eureach.eu — Article Automation Panel ─────────────── */
(function () {
  "use strict";

  let _articleId   = null;
  let _articleData = {};
  let _selected    = new Set();
  let _results     = {};
  let _root        = null;

  // Add spinner CSS once
  if (!document.getElementById("aa-style")) {
    const s = document.createElement("style");
    s.id = "aa-style";
    s.textContent = "@keyframes aa-spin{to{transform:rotate(360deg)}} .aa-spinner{width:15px;height:15px;border:2px solid #3b82f6;border-top-color:transparent;border-radius:50%;animation:aa-spin .8s linear infinite;flex-shrink:0;display:inline-block;}";
    document.head.appendChild(s);
  }

  const GROUPS = [
    { key: "publish",  label: "PUBLISH",  actions: [
      { key: "eureach_blog",  label: "📝 Eureach Blog" },
      { key: "agora",         label: "🌐 Agora (agora.sos.gr)" },
      { key: "download_pdf",  label: "📄 Download PDF" },
      { key: "save_draft",    label: "💾 Save to drafts" },
    ]},
    { key: "adapt",    label: "ADAPT",    actions: [
      { key: "linkedin",   label: "💼 LinkedIn post" },
      { key: "facebook",   label: "📘 Facebook post" },
      { key: "twitter",    label: "🐦 Twitter/X thread" },
      { key: "instagram",  label: "📸 Instagram caption" },
      { key: "email",      label: "📧 Email newsletter" },
      { key: "gmb",        label: "🗺 Google My Business post" },
    ]},
    { key: "optimise", label: "OPTIMISE", actions: [
      { key: "meta",     label: "🔍 Meta title + description" },
      { key: "schema",   label: "🏗 Schema markup" },
      { key: "hashtags", label: "#️⃣ Social hashtags" },
    ]},
    { key: "expand",   label: "EXPAND",   actions: [
      { key: "translate_en",    label: "🇬🇧 Translate to English" },
      { key: "translate_de",    label: "🇩🇪 Translate to German" },
      { key: "internal_links",  label: "🔗 Internal linking suggestions" },
    ]},
    { key: "track",    label: "TRACK",    actions: [
      { key: "track", label: "📡 Track AI visibility for this article" },
    ]},
  ];

  function esc(s) {
    return (s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  /* ── Public API ─────────────────────────────────────────── */
  window.initAutomationPanel = function (articleId, articleData, containerEl) {
    _articleId   = articleId;
    _articleData = articleData || {};
    _root        = containerEl;
    _selected    = new Set();
    _results     = {};
    renderPanel();
    loadExistingResults();
  };

  window._autoTriggerTranslation = async function (action) {
    const area = document.getElementById("aa-results");
    if (!area) return;
    let card = document.getElementById("aa-card-" + action);
    if (!card) { card = makeCard(action); area.insertBefore(card, area.firstChild); }
    showLoading(action);
    try {
      const result = await runAction(action);
      _results[action] = result;
      showResult(action, result);
    } catch (err) {
      showError(action, err.message);
    }
  };

  /* ── Panel render ───────────────────────────────────────── */
  function renderPanel() {
    _root.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.style.cssText = "margin-top:32px;padding:28px;background:rgba(15,23,42,0.8);border:1px solid var(--border,#1e293b);border-radius:16px;";

    // Title
    const title = document.createElement("div");
    title.style.cssText = "font-size:1rem;font-weight:700;color:var(--text,#e2e8f0);margin-bottom:20px;";
    title.textContent = "⚡ What would you like to do with this article?";
    wrap.appendChild(title);

    // Groups grid
    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:20px 32px;margin-bottom:24px;";

    GROUPS.forEach(group => {
      const col = document.createElement("div");
      if (group.key === "track") {
        col.style.cssText = "grid-column:1/-1;";
      }
      const lbl = document.createElement("div");
      lbl.style.cssText = "font-size:0.7rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;";
      lbl.textContent = group.label;
      col.appendChild(lbl);

      group.actions.forEach(action => {
        const label = document.createElement("label");
        label.style.cssText = "display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;font-size:0.87rem;color:var(--text,#e2e8f0);user-select:none;";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.dataset.action = action.key;
        cb.style.cssText = "width:15px;height:15px;accent-color:#3b82f6;flex-shrink:0;";
        cb.addEventListener("change", () => toggleAction(action.key));
        label.appendChild(cb);
        label.appendChild(document.createTextNode(action.label));
        col.appendChild(label);
      });

      grid.appendChild(col);
    });
    wrap.appendChild(grid);

    // Run bar
    const bar = document.createElement("div");
    bar.style.cssText = "border-top:1px solid var(--border,#1e293b);padding-top:20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;";

    const runBtn = document.createElement("button");
    runBtn.id = "aa-run-btn";
    runBtn.disabled = true;
    runBtn.style.cssText = "background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;border:none;padding:12px 28px;border-radius:10px;font-size:0.95rem;font-weight:600;cursor:pointer;opacity:0.5;transition:opacity .2s;";
    runBtn.textContent = "Select actions above";
    runBtn.addEventListener("click", runSelectedAutomations);
    bar.appendChild(runBtn);

    const clearBtn = document.createElement("button");
    clearBtn.style.cssText = "background:transparent;color:#8b9ab7;border:1px solid #2a3050;padding:11px 20px;border-radius:10px;font-size:0.85rem;cursor:pointer;";
    clearBtn.textContent = "Clear all";
    clearBtn.addEventListener("click", clearSelections);
    bar.appendChild(clearBtn);

    wrap.appendChild(bar);

    // Results area
    const resultsArea = document.createElement("div");
    resultsArea.id = "aa-results";
    resultsArea.style.cssText = "margin-top:24px;display:flex;flex-direction:column;gap:14px;";
    wrap.appendChild(resultsArea);

    // Republish scheduler
    const schedulerEl = document.createElement("div");
    schedulerEl.style.cssText = "margin-top:32px;padding-top:24px;border-top:1px solid var(--border,#1e293b);";
    renderScheduler(schedulerEl);
    wrap.appendChild(schedulerEl);

    _root.appendChild(wrap);
  }

  /* ── Selection ──────────────────────────────────────────── */
  function toggleAction(key) {
    if (_selected.has(key)) _selected.delete(key);
    else _selected.add(key);
    updateRunBtn();
  }

  function updateRunBtn() {
    const btn = document.getElementById("aa-run-btn");
    if (!btn) return;
    const n = _selected.size;
    btn.disabled = n === 0;
    btn.style.opacity = n === 0 ? "0.5" : "1";
    btn.style.cursor  = n === 0 ? "default" : "pointer";
    btn.textContent   = n === 0 ? "Select actions above" : `Run ${n} selected action${n > 1 ? "s" : ""}`;
  }

  function clearSelections() {
    _selected.clear();
    _root.querySelectorAll("[data-action]").forEach(cb => { if (cb.type === "checkbox") cb.checked = false; });
    updateRunBtn();
  }

  /* ── Run automations ────────────────────────────────────── */
  async function runSelectedAutomations() {
    const btn = document.getElementById("aa-run-btn");
    btn.disabled = true;
    btn.textContent = "Running…";

    const actions = Array.from(_selected);
    const area = document.getElementById("aa-results");

    for (const action of actions) {
      let card = document.getElementById("aa-card-" + action);
      if (!card) {
        card = makeCard(action);
        area.insertBefore(card, area.firstChild);
      }
      showLoading(action);
      try {
        const result = await runAction(action);
        _results[action] = result;
        showResult(action, result);
      } catch (err) {
        showError(action, err.message);
      }
    }

    btn.disabled = false;
    btn.style.opacity = "1";
    const n = _selected.size;
    btn.textContent = `Run ${n} selected action${n > 1 ? "s" : ""}`;
  }

  async function runAction(action) {
    const { title, html, lang } = _articleData;
    const base = "/api/articles/" + _articleId + "/automate";

    // Client-only actions
    if (action === "download_pdf") {
      const w = window.open("", "_blank");
      w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(title)}</title><style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;line-height:1.7;color:#111}h1,h2,h3{margin-top:1.5rem}p{margin:.7rem 0}</style></head><body>${html}</body></html>`);
      w.document.close(); w.focus(); setTimeout(() => w.print(), 400);
      return { ok: true, message: "PDF download initiated." };
    }
    if (action === "save_draft") {
      try {
        const saved = JSON.parse(localStorage.getItem("eureach_articles") || "[]");
        saved.unshift({ id: Date.now(), savedAt: new Date().toISOString(), title: title || "Untitled", htmlContent: html || "", lang, isDraft: true });
        localStorage.setItem("eureach_articles", JSON.stringify(saved.slice(0, 100)));
      } catch {}
      return { ok: true, message: "Saved to your article drafts." };
    }
    if (action === "eureach_blog") {
      const r = await fetch("/api/blog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, html, excerpt: "", lang: lang || "en", category: "article" }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Publish failed");
      return { ok: true, message: "Submitted for admin approval." };
    }
    if (action === "agora") {
      const r = await fetch("/api/publish-to-agora", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, html, excerpt: "", lang: lang || "en" }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Agora publish failed");
      return { ok: true, message: "Published to Agora (pending admin review).", slug: d.slug };
    }

    // Server automations
    const bodyMap = {
      linkedin:       { platforms: ["linkedin"] },
      facebook:       { platforms: ["facebook"] },
      twitter:        { platforms: ["twitter"] },
      instagram:      { platforms: ["instagram"] },
      translate_en:   { language: "en" },
      translate_de:   { language: "de" },
    };
    const actionMap = {
      linkedin: "social", facebook: "social", twitter: "social", instagram: "social",
      email: "email", gmb: "gmb", meta: "meta", schema: "schema", hashtags: "hashtags",
      translate_en: "translate", translate_de: "translate",
      internal_links: "internal-links", track: "track-visibility",
    };

    const endpoint = base + "/" + (actionMap[action] || action);
    const body     = Object.assign({ title, html, lang }, bodyMap[action] || {});

    const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Automation failed");
    return d;
  }

  /* ── Result cards ───────────────────────────────────────── */
  function makeCard(action) {
    const card = document.createElement("div");
    card.id = "aa-card-" + action;
    card.style.cssText = "background:rgba(15,23,42,0.7);border:1px solid var(--border,#1e293b);border-radius:12px;overflow:hidden;";
    return card;
  }

  function getLabel(key) {
    for (const g of GROUPS) {
      const a = g.actions.find(a => a.key === key);
      if (a) return a.label;
    }
    return key;
  }

  function showLoading(action) {
    const card = document.getElementById("aa-card-" + action);
    if (!card) return;
    card.innerHTML = `<div style="padding:16px 20px;display:flex;align-items:center;gap:10px;"><span class="aa-spinner"></span><span style="font-size:0.88rem;color:#8b9ab7;">Generating ${esc(getLabel(action))}…</span></div>`;
  }

  function showError(action, msg) {
    const card = document.getElementById("aa-card-" + action);
    if (!card) return;
    card.innerHTML = `<div style="padding:14px 20px;"><span style="color:#f87171;font-size:0.88rem;">❌ ${esc(getLabel(action))}: ${esc(msg)}</span></div>`;
  }

  function showResult(action, result) {
    const card = document.getElementById("aa-card-" + action);
    if (!card) return;
    card.innerHTML = "";

    // Header
    const hdr = document.createElement("div");
    hdr.style.cssText = "padding:12px 18px;background:rgba(59,130,246,0.08);border-bottom:1px solid var(--border,#1e293b);display:flex;align-items:center;justify-content:space-between;cursor:pointer;";
    const toggle = document.createElement("span");
    toggle.style.cssText = "font-size:0.73rem;color:#64748b;";
    toggle.textContent = "▼ Collapse";
    hdr.innerHTML = `<span style="font-size:0.88rem;font-weight:600;color:#60a5fa;">✓ ${esc(getLabel(action))}</span>`;
    hdr.appendChild(toggle);
    card.appendChild(hdr);

    const body = document.createElement("div");
    body.style.cssText = "padding:18px 20px;";
    card.appendChild(body);

    let collapsed = false;
    hdr.addEventListener("click", () => {
      collapsed = !collapsed;
      body.style.display = collapsed ? "none" : "block";
      toggle.textContent = collapsed ? "▶ Expand" : "▼ Collapse";
    });

    renderBody(body, action, result);
  }

  function renderBody(body, action, result) {
    // Simple success message
    if (result && result.ok && result.message && !result.content && !result.tweets && !result.subject && !result.meta_title && !result.schema && !result.linkedin && !result.links && !result.tracking_id) {
      const p = document.createElement("p");
      p.style.cssText = "color:#34d399;margin:0;font-size:0.88rem;";
      p.textContent = result.message;
      body.appendChild(p);
      return;
    }
    switch (action) {
      case "twitter":        renderTweets(body, result.tweets || []); break;
      case "email":          renderEmail(body, result); break;
      case "meta":           renderMeta(body, result); break;
      case "schema":         renderCode(body, result.schema, result.note); break;
      case "hashtags":       renderHashtags(body, result); break;
      case "translate_en":
      case "translate_de":   renderTranslation(body, result); break;
      case "internal_links": renderLinks(body, result.links || []); break;
      case "track":          renderTracking(body, result); break;
      default:               renderText(body, result.content || result.message || ""); break;
    }
  }

  /* ── Result renderers ───────────────────────────────────── */
  function renderText(body, text) {
    const pre = document.createElement("div");
    pre.style.cssText = "white-space:pre-wrap;font-size:0.87rem;line-height:1.65;color:var(--text,#e2e8f0);margin-bottom:12px;";
    pre.setAttribute("contenteditable", "true");
    pre.textContent = text;
    body.appendChild(pre);
    addCopyBtn(body, () => pre.textContent);
  }

  function renderTweets(body, tweets) {
    const tweetEls = [];
    tweets.forEach((tweet, i) => {
      const card = document.createElement("div");
      card.style.cssText = "background:rgba(30,41,59,0.6);border:1px solid #2a3050;border-radius:8px;padding:10px 14px;margin-bottom:8px;";
      const num = document.createElement("div");
      num.style.cssText = "font-size:0.7rem;color:#64748b;margin-bottom:4px;";
      num.textContent = "Tweet " + (i + 1);
      const text = document.createElement("div");
      text.style.cssText = "font-size:0.87rem;color:var(--text,#e2e8f0);white-space:pre-wrap;";
      text.setAttribute("contenteditable", "true");
      text.textContent = tweet;
      const counter = document.createElement("div");
      counter.style.cssText = "font-size:0.7rem;color:#64748b;margin-top:4px;";
      counter.textContent = tweet.length + "/260";
      text.addEventListener("input", () => {
        const len = text.textContent.length;
        counter.textContent = len + "/260";
        counter.style.color = len > 260 ? "#f87171" : "#64748b";
      });
      card.appendChild(num); card.appendChild(text); card.appendChild(counter);
      body.appendChild(card);
      tweetEls.push(text);
    });
    addCopyBtn(body, () => tweetEls.map((el, i) => (i+1) + ". " + el.textContent).join("\n\n"), "📋 Copy all tweets");
  }

  function renderEmail(body, r) {
    const rows = [
      { label: "SUBJECT",      val: r.subject || "" },
      { label: "PREVIEW TEXT", val: r.preview_text || "" },
      { label: "BODY",         val: r.body || "" },
      { label: "CTA",          val: (r.cta_text || "") + (r.cta_note ? " — " + r.cta_note : "") },
    ];
    const textEls = [];
    rows.forEach(row => {
      const wrap = document.createElement("div");
      wrap.style.marginBottom = "10px";
      const lbl = document.createElement("div");
      lbl.style.cssText = "font-size:0.68rem;color:#64748b;margin-bottom:3px;text-transform:uppercase;letter-spacing:.06em;";
      lbl.textContent = row.label;
      const val = document.createElement("div");
      val.style.cssText = "font-size:0.87rem;color:var(--text,#e2e8f0);padding:8px 12px;background:rgba(30,41,59,0.6);border-radius:6px;white-space:pre-wrap;";
      val.setAttribute("contenteditable", "true");
      val.textContent = row.val;
      wrap.appendChild(lbl); wrap.appendChild(val);
      body.appendChild(wrap);
      textEls.push({ label: row.label, el: val });
    });
    addCopyBtn(body, () => textEls.map(t => t.label + ":\n" + t.el.textContent).join("\n\n"));
  }

  function renderMeta(body, r) {
    const preview = document.createElement("div");
    preview.style.cssText = "background:#fff;border-radius:8px;padding:14px 16px;margin-bottom:14px;max-width:560px;";
    preview.innerHTML = `<div style="font-size:0.7rem;color:#4d5156;margin-bottom:3px;">eureach.eu › article</div><div style="font-size:1.05rem;color:#1a0dab;margin-bottom:2px;">${esc(r.meta_title||"")}</div><div style="font-size:0.85rem;color:#4d5156;line-height:1.4;">${esc(r.meta_description||"")}</div>`;
    body.appendChild(preview);
    const fields = [
      { label: "og_title", val: r.og_title || "" },
      { label: "og_description", val: r.og_description || "" },
    ];
    const textEls = [
      { label: "meta_title", val: r.meta_title || "" },
      { label: "meta_description", val: r.meta_description || "" },
    ];
    fields.forEach(f => {
      const row = document.createElement("div");
      row.style.marginBottom = "8px";
      row.innerHTML = `<div style="font-size:0.68rem;color:#64748b;margin-bottom:2px;text-transform:uppercase;">${esc(f.label)}</div><div style="font-size:0.85rem;color:var(--text,#e2e8f0);">${esc(f.val)}</div>`;
      body.appendChild(row);
      textEls.push(f);
    });
    addCopyBtn(body, () => textEls.map(t => t.label + ": " + t.val).join("\n"));
  }

  function renderCode(body, code, note) {
    if (note) {
      const n = document.createElement("div");
      n.style.cssText = "font-size:0.8rem;color:#fbbf24;margin-bottom:8px;";
      n.textContent = "⚠ " + note;
      body.appendChild(n);
    }
    const pre = document.createElement("pre");
    pre.style.cssText = "background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:14px;font-size:0.77rem;color:#7dd3fc;overflow-x:auto;white-space:pre;margin-bottom:12px;";
    pre.textContent = code || "";
    body.appendChild(pre);
    addCopyBtn(body, () => code || "");
  }

  function renderHashtags(body, r) {
    const groups = [
      { label: "💼 LinkedIn", tags: r.linkedin || [], icon: "linkedin" },
      { label: "📸 Instagram", tags: r.instagram || [], icon: "instagram" },
      { label: "🐦 Twitter",  tags: r.twitter || [],   icon: "twitter" },
    ];
    const allTags = [];
    groups.forEach(g => {
      if (!g.tags.length) return;
      const row = document.createElement("div");
      row.style.marginBottom = "12px";
      const lbl = document.createElement("div");
      lbl.style.cssText = "font-size:0.7rem;color:#64748b;margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em;";
      lbl.textContent = g.label;
      row.appendChild(lbl);
      const chips = document.createElement("div");
      chips.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;";
      g.tags.forEach(t => {
        const chip = document.createElement("span");
        chip.style.cssText = "background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.25);border-radius:6px;padding:3px 10px;font-size:0.81rem;color:#60a5fa;cursor:pointer;";
        chip.textContent = "#" + t;
        chip.title = "Click to copy";
        chip.addEventListener("click", () => { navigator.clipboard.writeText("#" + t); chip.style.background = "rgba(52,211,153,0.15)"; chip.style.borderColor = "#34d399"; chip.style.color = "#34d399"; setTimeout(() => { chip.style.background = "rgba(59,130,246,0.12)"; chip.style.borderColor = "rgba(59,130,246,0.25)"; chip.style.color = "#60a5fa"; }, 1200); });
        chips.appendChild(chip);
        allTags.push("#" + t);
      });
      row.appendChild(chips);
      body.appendChild(row);
    });
    addCopyBtn(body, () => allTags.join(" "), "📋 Copy all hashtags");
  }

  function renderTranslation(body, r) {
    const titleEl = document.createElement("div");
    titleEl.style.marginBottom = "10px";
    titleEl.innerHTML = `<div style="font-size:0.68rem;color:#64748b;margin-bottom:3px;text-transform:uppercase;">TRANSLATED TITLE</div><div style="font-size:0.95rem;font-weight:600;color:var(--text,#e2e8f0);" contenteditable="true">${esc(r.title||"")}</div>`;
    body.appendChild(titleEl);
    const contentEl = document.createElement("div");
    contentEl.style.cssText = "font-size:0.85rem;color:var(--text,#e2e8f0);white-space:pre-wrap;background:rgba(30,41,59,0.4);border-radius:8px;padding:12px;margin-bottom:10px;max-height:180px;overflow-y:auto;";
    contentEl.setAttribute("contenteditable", "true");
    contentEl.textContent = r.content || "";
    body.appendChild(contentEl);
    if (r.savedAsDraft) {
      const note = document.createElement("div");
      note.style.cssText = "font-size:0.82rem;color:#34d399;margin-bottom:10px;";
      note.textContent = "✅ Saved as blog draft — Admin → Articles to review";
      body.appendChild(note);
    }
    // Insert image button
    const insertImgBtn = document.createElement("button");
    insertImgBtn.className = "ag-ghost-btn";
    insertImgBtn.style.cssText = "font-size:0.78rem;padding:5px 12px;margin-top:4px;margin-right:8px;";
    insertImgBtn.textContent = "🖼 Insert image";
    insertImgBtn.addEventListener("click", () => {
      const url = prompt("Image URL:", "https://");
      if (!url || url === "https://") return;
      const alt = prompt("Alt text (optional):", "") || "";
      const tag = `<img src="${url}" alt="${alt}" style="width:100%;max-width:100%;height:auto;margin:16px 0">`;
      contentEl.focus();
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        range.collapse(false);
        const frag = document.createRange().createContextualFragment(tag);
        range.insertNode(frag);
      } else {
        contentEl.insertAdjacentHTML("beforeend", tag);
      }
    });
    body.appendChild(insertImgBtn);
    addCopyBtn(body, () => contentEl.innerHTML);
  }

  function renderLinks(body, links) {
    if (!links.length) {
      const p = document.createElement("p");
      p.style.cssText = "color:#8b9ab7;font-size:0.87rem;margin:0;";
      p.textContent = "No internal linking opportunities found in your published articles yet.";
      body.appendChild(p);
      return;
    }
    const tbl = document.createElement("table");
    tbl.style.cssText = "width:100%;border-collapse:collapse;font-size:0.82rem;margin-bottom:12px;";
    tbl.innerHTML = `<thead><tr><th style="text-align:left;padding:7px 8px;color:#64748b;border-bottom:1px solid #1e293b;white-space:nowrap;">Anchor text</th><th style="text-align:left;padding:7px 8px;color:#64748b;border-bottom:1px solid #1e293b;">Target article</th><th style="text-align:left;padding:7px 8px;color:#64748b;border-bottom:1px solid #1e293b;">Why</th></tr></thead><tbody>${links.map(l=>`<tr><td style="padding:7px 8px;color:#60a5fa;border-bottom:1px solid rgba(30,41,59,0.5);">"${esc(l.anchor_text||"")}"</td><td style="padding:7px 8px;border-bottom:1px solid rgba(30,41,59,0.5);"><a href="${esc(l.target_url||"")}" target="_blank" style="color:#a78bfa;text-decoration:none;">${esc(l.target_title||l.target_slug||"")}</a></td><td style="padding:7px 8px;color:#8b9ab7;border-bottom:1px solid rgba(30,41,59,0.5);">${esc(l.reason||"")}</td></tr>`).join("")}</tbody>`;
    body.appendChild(tbl);
  }

  function renderTracking(body, r) {
    const msg = document.createElement("div");
    msg.style.cssText = "color:#34d399;margin-bottom:12px;font-size:0.88rem;";
    msg.textContent = "✅ " + (r.message || "");
    body.appendChild(msg);
    if ((r.queries_to_track || []).length) {
      const lbl = document.createElement("div");
      lbl.style.cssText = "font-size:0.78rem;color:#8b9ab7;margin-bottom:8px;";
      lbl.textContent = "Queries being tracked:";
      body.appendChild(lbl);
      r.queries_to_track.forEach((q, i) => {
        const row = document.createElement("div");
        row.style.cssText = "background:rgba(30,41,59,0.5);border-radius:6px;padding:7px 12px;font-size:0.83rem;color:var(--text,#e2e8f0);margin-bottom:6px;";
        row.innerHTML = `<span style="color:#64748b;margin-right:8px;">${i+1}.</span>${esc(q)}`;
        body.appendChild(row);
      });
    }
    if (r.next_check) {
      const next = document.createElement("div");
      next.style.cssText = "font-size:0.77rem;color:#64748b;margin-top:6px;";
      next.textContent = "Next check: " + new Date(r.next_check).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" });
      body.appendChild(next);
    }
  }

  function addCopyBtn(body, getText, label) {
    const btn = document.createElement("button");
    btn.className = "ag-ghost-btn";
    btn.style.cssText = "font-size:0.81rem;padding:6px 14px;margin-top:4px;";
    btn.textContent = label || "📋 Copy";
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(getText());
      btn.textContent = "✓ Copied!";
      setTimeout(() => btn.textContent = label || "📋 Copy", 1500);
    });
    body.appendChild(btn);
  }

  /* ── Republish scheduler ────────────────────────────────── */
  function renderScheduler(container) {
    container.innerHTML = `
      <div style="font-size:0.9rem;font-weight:600;color:var(--text,#e2e8f0);margin-bottom:10px;">🔁 Auto-republish this article</div>
      <div style="font-size:0.83rem;color:#8b9ab7;margin-bottom:10px;">Remind me to reshare every:</div>
      <div style="display:flex;gap:8px;margin-bottom:14px;" id="aa-intervals">
        <button class="ag-ghost-btn aa-iBtn" data-days="30" style="padding:7px 14px;font-size:0.81rem;">30 days</button>
        <button class="ag-ghost-btn aa-iBtn" data-days="60" style="padding:7px 14px;font-size:0.81rem;background:rgba(59,130,246,0.12);border-color:#3b82f6;color:#60a5fa;">60 days</button>
        <button class="ag-ghost-btn aa-iBtn" data-days="90" style="padding:7px 14px;font-size:0.81rem;">90 days</button>
      </div>
      <div style="font-size:0.83rem;color:#8b9ab7;margin-bottom:8px;">On:</div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px;">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.85rem;color:var(--text,#e2e8f0);"><input type="checkbox" data-plat="linkedin" style="accent-color:#3b82f6;"> 💼 LinkedIn</label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.85rem;color:var(--text,#e2e8f0);"><input type="checkbox" data-plat="facebook" style="accent-color:#3b82f6;"> 📘 Facebook</label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.85rem;color:var(--text,#e2e8f0);"><input type="checkbox" data-plat="twitter"  style="accent-color:#3b82f6;"> 🐦 Twitter</label>
      </div>
      <button id="aa-sched-btn" style="background:rgba(59,130,246,0.12);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);padding:9px 18px;border-radius:8px;font-size:0.85rem;cursor:pointer;font-weight:600;">Set reminder</button>
      <div id="aa-sched-status" style="margin-top:8px;font-size:0.82rem;color:#8b9ab7;min-height:18px;"></div>`;

    let days = 60;
    container.querySelectorAll(".aa-iBtn").forEach(btn => {
      btn.addEventListener("click", () => {
        days = parseInt(btn.dataset.days);
        container.querySelectorAll(".aa-iBtn").forEach(b => { b.style.background=""; b.style.borderColor=""; b.style.color=""; });
        btn.style.background = "rgba(59,130,246,0.12)";
        btn.style.borderColor = "#3b82f6";
        btn.style.color = "#60a5fa";
      });
    });

    container.querySelector("#aa-sched-btn").addEventListener("click", async () => {
      const platforms = Array.from(container.querySelectorAll("[data-plat]:checked")).map(el => el.dataset.plat);
      const statusEl  = container.querySelector("#aa-sched-status");
      if (!platforms.length) { statusEl.textContent = "Select at least one platform."; return; }
      const schedBtn = container.querySelector("#aa-sched-btn");
      schedBtn.disabled = true; schedBtn.textContent = "Saving…";
      try {
        const r = await fetch("/api/articles/" + _articleId + "/automate/schedule-republish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platforms, interval_days: days, title: _articleData.title, html: _articleData.html, lang: _articleData.lang }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        const nextDate = new Date(d.next_publish).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" });
        statusEl.style.color = "#34d399";
        statusEl.textContent = "✅ Reminder set — next prompt: " + nextDate;
      } catch (e) {
        statusEl.style.color = "#f87171";
        statusEl.textContent = "Error: " + e.message;
      }
      schedBtn.disabled = false; schedBtn.textContent = "Set reminder";
    });
  }

  /* ── Restore previous results ───────────────────────────── */
  async function loadExistingResults() {
    try {
      const r = await fetch("/api/articles/" + _articleId + "/automate/results");
      if (!r.ok) return;
      const d = await r.json();
      const results = d.results || {};
      if (!Object.keys(results).length) return;
      const area = document.getElementById("aa-results");
      if (!area) return;
      Object.entries(results).forEach(([action, data]) => {
        let card = document.getElementById("aa-card-" + action);
        if (!card) { card = makeCard(action); area.appendChild(card); }
        _results[action] = data;
        showResult(action, data);
      });
    } catch {}
  }

})();
