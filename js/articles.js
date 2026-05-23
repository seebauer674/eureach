/* ── eureach.eu — Article Generator ─────────────────── */
(function () {

  /* ── i18n ──────────────────────────────────────────── */
  const I18N = {
    en: {
      pageSubtitle:   "AI-powered SEO + GEO + AEO articles · Schema, Audits & Promotion kit included",
      langLabel:      "Content Language",
      writingFor:     "Writing for",
      manageSites:    "⚙ Manage sites",
      addSite:        "+ Add site",
      editProfile:    "Edit profile →",
      newArticle:     "New Article",
      formSub:        "AI-powered SEO + GEO + AEO content generation",
      savedBtn:       "📂 Saved Articles",
      generateBtn:    "✍️ Generate Article",
      creditNote:     "This will use 1 credit",
      gateTitle:      "Add a site to get started",
      gateSub:        "The Article Generator writes content tailored to your specific website — its niche, audience, language, and tone. Register up to 3 sites on your Pro plan.",
      gateBtn:        "⚙ Go to Settings → Add Site",
      gateSaved:      "📂 View Saved Articles",
      secCore:        "Core",
      secAudience:    "Audience",
      secSeo:         "SEO Configuration",
      secAi:          "AI Search Optimization (GEO / AEO)",
      secContent:     "Content Settings",
      secCta:         "Conversion & CTA",
      topic:          "Topic / Title",
      topicPh:        "What is this article about?",
      brief:          "Brief / Instructions",
      briefPh:        "Extra context, angle, specific points to cover, things to avoid…",
      articleType:    "Article Type",
      model:          "AI Model",
      readingLevel:   "Reading Level",
      audience:       "Target Audience",
      audiencePh:     "e.g. Small business owners, Homeowners…",
      primaryKw:      "Primary Keyword",
      primaryKwSub:   "(leave blank to auto-detect)",
      primaryKwPh:    "e.g. emergency plumber Athens",
      secondaryKw:    "Secondary Keywords",
      secondaryKwPh:  "comma-separated",
      searchIntent:   "Search Intent",
      funnelStage:    "Funnel Stage",
      geoTarget:      "Geographic Target",
      geoTargetPh:    "e.g. Athens, Greece · Berlin, Germany · European Union",
      optimizeFor:    "Optimize content for",
      articleLength:  "Article Length",
      tone:           "Tone (pick 1-3)",
      optFaq:         "FAQ section",
      optToc:         "Table of Contents",
      optSchema:      "Schema markup",
      optSnippet:     "Featured snippet block",
      optPromo:       "Promotion kit",
      convGoal:       "Conversion Goal",
      ctaText:        "CTA Text",
      ctaTextPh:      "e.g. Get a free quote today",
      ctaUrl:         "CTA URL",
      readingBasic:   "Basic",
      readingInter:   "Intermediate",
      readingAdv:     "Advanced",
      readingExp:     "Expert",
      generatingTitle:"Generating Article…",
      generatingHint: "This takes 30–90 seconds depending on length and model.",
      backBtn:        "← New Article",
      copyAll:        "Copy All",
      download:       "⬇ Download HTML",
      save:           "💾 Save",
      savedHeading:   "Saved Articles",
      noSaved:        "No saved articles yet",
      noSavedSub:     "Generate an article and click 💾 Save",
      viewBtn:        "👁 View",
      copyHtml:       "Copy HTML",
      preview:        "Preview",
      htmlSource:     "HTML Source",
      copyHtmlBtn:    "Copy HTML",
      progress: [
        "Loading site profile & best practices…",
        "Analysing keywords & search intent…",
        "Designing structure for SEO + AI citation…",
        "Writing article content…",
        "Building schema markup (Article, FAQ, Organization)…",
        "Running market & CRO audit…",
        "Running EU AI Act compliance check…",
        "Scoring AI citation readiness…",
        "Generating promotion kit…",
        "Finalising output…",
      ],
      tabs: ["Article", "SEO", "Schema", "Audits", "Promotion"],
      articleTypes: ["How-to guide", "Listicle", "Comparison", "Case study", "Tutorial", "Review", "Q&A", "Pillar page", "Local landing page", "News", "Opinion"],
      lengths: [
        { value:"XS", label:"XS — 500-800 words"    },
        { value:"S",  label:"S — 800-1,200 words"   },
        { value:"M",  label:"M — 1,500-2,000 words" },
        { value:"L",  label:"L — 2,500-3,500 words" },
        { value:"XL", label:"XL — 4,000+ words"     },
      ],
      intents: ["Informational", "Commercial", "Transactional", "Navigational", "Auto-detect"],
      funnel:  ["TOFU", "MOFU", "BOFU"],
      goals:   ["Email", "Phone", "Form", "Purchase", "Download", "App", "Newsletter", "Booking", "Quote"],
      tones:   ["Professional", "Friendly", "Authoritative", "Conversational", "Urgent", "Inspiring", "Educational", "Direct"],
    },

    el: {
      pageSubtitle:   "Άρθρα με AI · SEO + GEO + AEO · Schema, Αξιολογήσεις & Κιτ Προώθησης",
      langLabel:      "Γλώσσα Περιεχομένου",
      writingFor:     "Γράφω για",
      manageSites:    "⚙ Διαχείριση ιστοσελίδων",
      addSite:        "+ Προσθήκη ιστοσελίδας",
      editProfile:    "Επεξεργασία →",
      newArticle:     "Νέο Άρθρο",
      formSub:        "Δημιουργία περιεχομένου SEO + GEO + AEO με AI",
      savedBtn:       "📂 Αποθηκευμένα Άρθρα",
      generateBtn:    "✍️ Δημιουργία Άρθρου",
      creditNote:     "Θα χρησιμοποιηθεί 1 credit",
      gateTitle:      "Προσθέστε ιστοσελίδα για να ξεκινήσετε",
      gateSub:        "Η Δημιουργία Άρθρων γράφει περιεχόμενο προσαρμοσμένο στην ιστοσελίδα σας — κλάδο, κοινό, γλώσσα και τόνο. Εγγράψτε έως 3 ιστοσελίδες στο Pro πλάν.",
      gateBtn:        "⚙ Μεταβείτε στις Ρυθμίσεις → Προσθήκη Ιστοσελίδας",
      gateSaved:      "📂 Προβολή Αποθηκευμένων",
      secCore:        "Βασικά Στοιχεία",
      secAudience:    "Κοινό",
      secSeo:         "Ρυθμίσεις SEO",
      secAi:          "Βελτιστοποίηση Αναζήτησης AI (GEO / AEO)",
      secContent:     "Ρυθμίσεις Περιεχομένου",
      secCta:         "Μετατροπές & CTA",
      topic:          "Θέμα / Τίτλος",
      topicPh:        "Για τι θέμα είναι το άρθρο;",
      brief:          "Οδηγίες / Σημειώσεις",
      briefPh:        "Επιπλέον πλαίσιο, γωνία, σημεία που πρέπει να καλυφθούν, τι να αποφύγετε…",
      articleType:    "Τύπος Άρθρου",
      model:          "Μοντέλο AI",
      readingLevel:   "Επίπεδο Ανάγνωσης",
      audience:       "Κοινό-Στόχος",
      audiencePh:     "π.χ. Ιδιοκτήτες μικρών επιχειρήσεων, Νοικοκύρηδες…",
      primaryKw:      "Κύρια Λέξη-Κλειδί",
      primaryKwSub:   "(αφήστε κενό για αυτόματη ανίχνευση)",
      primaryKwPh:    "π.χ. υδραυλικός Αθήνα έκτακτη ανάγκη",
      secondaryKw:    "Δευτερεύουσες Λέξεις-Κλειδιά",
      secondaryKwPh:  "χωρισμένες με κόμμα",
      searchIntent:   "Πρόθεση Αναζήτησης",
      funnelStage:    "Στάδιο Funnel",
      geoTarget:      "Γεωγραφικός Στόχος",
      geoTargetPh:    "π.χ. Αθήνα, Ελλάδα · Βερολίνο, Γερμανία · Ευρωπαϊκή Ένωση",
      optimizeFor:    "Βελτιστοποίηση για",
      articleLength:  "Μήκος Άρθρου",
      tone:           "Τόνος (επιλέξτε 1-3)",
      optFaq:         "Ενότητα FAQ",
      optToc:         "Πίνακας Περιεχομένων",
      optSchema:      "Schema Markup",
      optSnippet:     "Μπλοκ Featured Snippet",
      optPromo:       "Κιτ Προώθησης",
      convGoal:       "Στόχος Μετατροπής",
      ctaText:        "Κείμενο CTA",
      ctaTextPh:      "π.χ. Ζητήστε δωρεάν προσφορά σήμερα",
      ctaUrl:         "URL CTA",
      readingBasic:   "Βασικό",
      readingInter:   "Μεσαίο",
      readingAdv:     "Προχωρημένο",
      readingExp:     "Ειδικό",
      generatingTitle:"Δημιουργία Άρθρου…",
      generatingHint: "Αυτό διαρκεί 30–90 δευτερόλεπτα ανάλογα με το μήκος και το μοντέλο.",
      backBtn:        "← Νέο Άρθρο",
      copyAll:        "Αντιγραφή Όλων",
      download:       "⬇ Λήψη HTML",
      save:           "💾 Αποθήκευση",
      savedHeading:   "Αποθηκευμένα Άρθρα",
      noSaved:        "Δεν υπάρχουν αποθηκευμένα άρθρα",
      noSavedSub:     "Δημιουργήστε ένα άρθρο και κάντε κλικ στο 💾 Αποθήκευση",
      viewBtn:        "👁 Προβολή",
      copyHtml:       "Αντιγραφή HTML",
      preview:        "Προεπισκόπηση",
      htmlSource:     "Πηγή HTML",
      copyHtmlBtn:    "Αντιγραφή HTML",
      progress: [
        "Φόρτωση προφίλ ιστοσελίδας…",
        "Ανάλυση λέξεων-κλειδιών & πρόθεσης αναζήτησης…",
        "Σχεδιασμός δομής για SEO + αναφορά AI…",
        "Συγγραφή άρθρου…",
        "Δημιουργία Schema Markup…",
        "Αξιολόγηση αγοράς & CRO…",
        "Έλεγχος συμμόρφωσης EU AI Act…",
        "Βαθμολόγηση ετοιμότητας αναφοράς AI…",
        "Δημιουργία κιτ προώθησης…",
        "Οριστικοποίηση αποτελέσματος…",
      ],
      tabs: ["Άρθρο", "SEO", "Schema", "Αξιολογήσεις", "Προώθηση"],
      articleTypes: ["Οδηγός βήμα-βήμα", "Λίστα", "Σύγκριση", "Case study", "Tutorial", "Κριτική", "Ερωτήσεις & Απαντήσεις", "Pillar page", "Τοπική σελίδα", "Νέα", "Γνώμη"],
      lengths: [
        { value:"XS", label:"XS — 500-800 λέξεις"    },
        { value:"S",  label:"S — 800-1.200 λέξεις"   },
        { value:"M",  label:"M — 1.500-2.000 λέξεις" },
        { value:"L",  label:"L — 2.500-3.500 λέξεις" },
        { value:"XL", label:"XL — 4.000+ λέξεις"     },
      ],
      intents: ["Πληροφοριακή", "Εμπορική", "Συναλλακτική", "Πλοήγηση", "Αυτόματη ανίχνευση"],
      funnel:  ["TOFU", "MOFU", "BOFU"],
      goals:   ["Email", "Τηλέφωνο", "Φόρμα", "Αγορά", "Λήψη", "Εφαρμογή", "Newsletter", "Κράτηση", "Προσφορά"],
      tones:   ["Επαγγελματικός", "Φιλικός", "Αυθεντικός", "Καθημερινός", "Επείγον", "Εμπνευσμένος", "Εκπαιδευτικός", "Άμεσος"],
    },

    de: {
      pageSubtitle:   "KI-gestützte SEO + GEO + AEO Artikel · Schema, Audits & Promotions-Kit inklusive",
      langLabel:      "Inhaltssprache",
      writingFor:     "Schreibe für",
      manageSites:    "⚙ Websites verwalten",
      addSite:        "+ Website hinzufügen",
      editProfile:    "Profil bearbeiten →",
      newArticle:     "Neuer Artikel",
      formSub:        "KI-gestützte SEO + GEO + AEO Inhaltserstellung",
      savedBtn:       "📂 Gespeicherte Artikel",
      generateBtn:    "✍️ Artikel generieren",
      creditNote:     "Dies verbraucht 1 Credit",
      gateTitle:      "Website hinzufügen, um zu starten",
      gateSub:        "Der Artikel-Generator erstellt Inhalte, die auf Ihre Website zugeschnitten sind — Nische, Zielgruppe, Sprache und Tonalität. Registrieren Sie bis zu 3 Websites im Pro-Plan.",
      gateBtn:        "⚙ Zu Einstellungen → Website hinzufügen",
      gateSaved:      "📂 Gespeicherte Artikel anzeigen",
      secCore:        "Grundeinstellungen",
      secAudience:    "Zielgruppe",
      secSeo:         "SEO-Konfiguration",
      secAi:          "KI-Suchoptimierung (GEO / AEO)",
      secContent:     "Inhaltseinstellungen",
      secCta:         "Konversion & CTA",
      topic:          "Thema / Titel",
      topicPh:        "Worum geht es in diesem Artikel?",
      brief:          "Anweisungen / Notizen",
      briefPh:        "Zusätzlicher Kontext, Blickwinkel, zu behandelnde Punkte, was vermieden werden soll…",
      articleType:    "Artikeltyp",
      model:          "KI-Modell",
      readingLevel:   "Lesestufe",
      audience:       "Zielgruppe",
      audiencePh:     "z.B. Kleinunternehmer, Hausbesitzer…",
      primaryKw:      "Haupt-Keyword",
      primaryKwSub:   "(leer lassen für automatische Erkennung)",
      primaryKwPh:    "z.B. Notfall-Klempner Berlin",
      secondaryKw:    "Neben-Keywords",
      secondaryKwPh:  "durch Komma getrennt",
      searchIntent:   "Suchabsicht",
      funnelStage:    "Funnel-Phase",
      geoTarget:      "Geografischer Fokus",
      geoTargetPh:    "z.B. Berlin, Deutschland · Athen, Griechenland · Europäische Union",
      optimizeFor:    "Optimieren für",
      articleLength:  "Artikellänge",
      tone:           "Tonalität (1-3 wählen)",
      optFaq:         "FAQ-Bereich",
      optToc:         "Inhaltsverzeichnis",
      optSchema:      "Schema-Markup",
      optSnippet:     "Featured-Snippet-Block",
      optPromo:       "Promotions-Kit",
      convGoal:       "Konversionsziel",
      ctaText:        "CTA-Text",
      ctaTextPh:      "z.B. Jetzt kostenloses Angebot anfordern",
      ctaUrl:         "CTA-URL",
      readingBasic:   "Grundlegend",
      readingInter:   "Mittel",
      readingAdv:     "Fortgeschritten",
      readingExp:     "Experte",
      generatingTitle:"Artikel wird generiert…",
      generatingHint: "Dies dauert 30–90 Sekunden je nach Länge und Modell.",
      backBtn:        "← Neuer Artikel",
      copyAll:        "Alles kopieren",
      download:       "⬇ HTML herunterladen",
      save:           "💾 Speichern",
      savedHeading:   "Gespeicherte Artikel",
      noSaved:        "Noch keine gespeicherten Artikel",
      noSavedSub:     "Artikel generieren und auf 💾 Speichern klicken",
      viewBtn:        "👁 Anzeigen",
      copyHtml:       "HTML kopieren",
      preview:        "Vorschau",
      htmlSource:     "HTML-Quelltext",
      copyHtmlBtn:    "HTML kopieren",
      progress: [
        "Website-Profil & Best Practices laden…",
        "Keywords & Suchabsicht analysieren…",
        "Struktur für SEO + KI-Zitation entwerfen…",
        "Artikelinhalt schreiben…",
        "Schema-Markup erstellen (Artikel, FAQ, Organisation)…",
        "Markt- & CRO-Audit durchführen…",
        "EU-KI-Gesetz-Compliance prüfen…",
        "KI-Zitationsfähigkeit bewerten…",
        "Promotions-Kit generieren…",
        "Ergebnis finalisieren…",
      ],
      tabs: ["Artikel", "SEO", "Schema", "Audits", "Promotion"],
      articleTypes: ["Anleitungen", "Listen-Artikel", "Vergleich", "Fallstudie", "Tutorial", "Bewertung", "Q&A", "Pillar-Seite", "Lokale Landingpage", "Nachrichten", "Meinung"],
      lengths: [
        { value:"XS", label:"XS — 500-800 Wörter"     },
        { value:"S",  label:"S — 800-1.200 Wörter"    },
        { value:"M",  label:"M — 1.500-2.000 Wörter"  },
        { value:"L",  label:"L — 2.500-3.500 Wörter"  },
        { value:"XL", label:"XL — 4.000+ Wörter"      },
      ],
      intents: ["Informational", "Kommerziell", "Transaktional", "Navigational", "Automatisch"],
      funnel:  ["TOFU", "MOFU", "BOFU"],
      goals:   ["E-Mail", "Telefon", "Formular", "Kauf", "Download", "App", "Newsletter", "Buchung", "Angebot"],
      tones:   ["Professionell", "Freundlich", "Autoritativ", "Gesprächig", "Dringend", "Inspirierend", "Lehrreich", "Direkt"],
    },
  };

  /* ── language → locale key ──────────────────────────── */
  const LANG_MAP = { Greek: "el", English: "en", German: "de" };
  const LOCALE_LANGS = [
    { value: "Greek",   flag: "🇬🇷", key: "el" },
    { value: "English", flag: "🇬🇧", key: "en" },
    { value: "German",  flag: "🇩🇪", key: "de" },
  ];

  /* ── models (always English labels — technical) ─────── */
  const MODELS = [
    { value: "sonnet", label: "Sonnet 4.6 — fast & capable" },
    { value: "opus",   label: "Opus 4.7 — highest quality"  },
  ];

  /* ── state ───────────────────────────────────────────── */
  let currentLang    = "en";   // el | en | de
  let state          = "form"; // form | generating | results | saved
  let formData       = {};
  let result         = null;
  let activeTab      = 0;      // index into t().tabs
  let activeSiteId   = null;
  let selectedTones      = new Set();
  let selectedAiTargets  = new Set(["chatgpt", "perplexity", "google-ai"]);
  let progressStep   = 0;
  let savedArticles  = JSON.parse(localStorage.getItem("eureach_articles") || "[]");
  let wpConnected    = false;
  let wpSiteUrl      = "";

  const root = document.getElementById("ag-root");

  /* ── translation helper ──────────────────────────────── */
  function t(key) { return (I18N[currentLang] || I18N.en)[key]; }

  /* ── sites store ─────────────────────────────────────── */
  function loadSites() {
    try { return JSON.parse(localStorage.getItem("eureach_sites") || "[]"); } catch { return []; }
  }

  /* ── helpers ─────────────────────────────────────────── */
  function esc(s) {
    const d = document.createElement("div");
    d.textContent = String(s || "");
    return d.innerHTML;
  }

  function copyText(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      const orig = btn.textContent;
      btn.textContent = "✓";
      btn.classList.add("ag-copy-ok");
      setTimeout(() => { btn.textContent = orig; btn.classList.remove("ag-copy-ok"); }, 1500);
    });
  }

  function score(n) {
    const c = n >= 75 ? "hi" : n >= 50 ? "mid" : "lo";
    return `<span class="ag-score ag-score-${c}">${n}</span>`;
  }

  function pill(text, cls = "") {
    return `<span class="ag-pill ${cls}">${esc(text)}</span>`;
  }

  function buildChipGroup(items, selected) {
    const wrap = document.createElement("div");
    wrap.className = "ag-chips";
    items.forEach(item => {
      const id  = typeof item === "object" ? item.id : item;
      const lbl = typeof item === "object" ? item.label : item;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ag-chip" + (selected.has(id) ? " active" : "");
      chip.dataset.id = id;
      chip.textContent = lbl;
      chip.addEventListener("click", () => {
        if (selected.has(id)) selected.delete(id);
        else selected.add(id);
        chip.classList.toggle("active", selected.has(id));
      });
      wrap.appendChild(chip);
    });
    return wrap;
  }

  /* ── page subtitle sync ──────────────────────────────── */
  function syncPageSubtitle() {
    const el = document.getElementById("ag-page-subtitle");
    if (el) el.textContent = t("pageSubtitle");
  }

  /* ── render dispatcher ───────────────────────────────── */
  function render() {
    root.innerHTML = "";
    syncPageSubtitle();

    // language selector — always shown at the top
    root.appendChild(buildLangSelector());

    const sites = loadSites();
    if (!sites.length && state !== "saved") { renderNoSites(); return; }

    if (!activeSiteId || !sites.find(s => s.id === activeSiteId)) {
      activeSiteId = sites[0]?.id || null;
    }

    if (state === "form")            renderForm();
    else if (state === "generating") renderGenerating();
    else if (state === "results")    renderResults();
    else if (state === "saved")      renderSaved();
  }

  /* ── Language selector (top bar) ─────────────────────── */
  function buildLangSelector() {
    const bar = document.createElement("div");
    bar.className = "ag-lang-bar";

    const label = document.createElement("span");
    label.className = "ag-lang-bar-label";
    label.textContent = t("langLabel");
    bar.appendChild(label);

    const btns = document.createElement("div");
    btns.className = "ag-lang-btns";
    LOCALE_LANGS.forEach(lang => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ag-lang-bar-btn" + (currentLang === lang.key ? " active" : "");
      btn.innerHTML = `${lang.flag} <span>${lang.value}</span>`;
      btn.addEventListener("click", () => {
        if (currentLang === lang.key) return;
        currentLang = lang.key;
        // reset tones to defaults for new lang
        if (!formData.topic) selectedTones = new Set();
        render();
      });
      btns.appendChild(btn);
    });
    bar.appendChild(btns);
    return bar;
  }

  /* ── No-sites gate ───────────────────────────────────── */
  function renderNoSites() {
    const gate = document.createElement("div");
    gate.className = "ag-gate";
    gate.innerHTML = `
      <div class="ag-gate-icon">🌐</div>
      <h2 class="ag-gate-title">${t("gateTitle")}</h2>
      <p class="ag-gate-sub">${t("gateSub")}</p>
      <a href="settings.html" class="ag-gate-btn">${t("gateBtn")}</a>`;
    const savedBtn = document.createElement("button");
    savedBtn.className = "ag-ghost-btn";
    savedBtn.style.marginTop = "10px";
    savedBtn.textContent = t("gateSaved");
    savedBtn.addEventListener("click", () => { state = "saved"; render(); });
    gate.appendChild(savedBtn);
    root.appendChild(gate);
  }

  /* ── FORM ────────────────────────────────────────────── */
  function renderForm() {
    const sites = loadSites();
    const activeSite = sites.find(s => s.id === activeSiteId) || sites[0];
    const siteLangs  = activeSite?.languages || [];

    // prefill defaults
    const prefillAud = formData.audience  || activeSite?.audience || "";
    const prefillGeo = formData.geoTarget || activeSite?.geo      || "";
    if (!formData.topic && activeSite?.tones?.length) {
      selectedTones = new Set(activeSite.tones.map(tone => {
        // map stored English tone to current-lang equivalent index
        const enIdx = I18N.en.tones.indexOf(tone);
        return enIdx >= 0 ? (t("tones")[enIdx] || tone) : tone;
      }));
    } else if (selectedTones.size === 0) {
      selectedTones = new Set([t("tones")[0]]);
    }

    const wrap = document.createElement("div");
    wrap.className = "ag-form-wrap";

    // header
    const hdr = document.createElement("div");
    hdr.className = "ag-form-hdr";
    hdr.innerHTML = `
      <div>
        <h2 class="ag-form-title">${t("newArticle")}</h2>
        <div class="ag-form-sub">${t("formSub")}</div>
      </div>`;
    const savedBtn = document.createElement("button");
    savedBtn.type = "button";
    savedBtn.className = "ag-ghost-btn";
    savedBtn.textContent = t("savedBtn");
    savedBtn.addEventListener("click", () => { state = "saved"; render(); });
    hdr.appendChild(savedBtn);
    wrap.appendChild(hdr);

    // site selector
    const siteSel = document.createElement("div");
    siteSel.className = "ag-site-selector";
    const siteLabel = document.createElement("span");
    siteLabel.className = "ag-site-sel-label";
    siteLabel.textContent = t("writingFor");
    siteSel.appendChild(siteLabel);

    const tabsWrap = document.createElement("div");
    tabsWrap.className = "ag-site-tabs";
    sites.forEach(site => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ag-site-tab" + (site.id === activeSiteId ? " active" : "");
      btn.innerHTML = `<span class="ag-site-tab-letter">${(site.domain[0] || "?").toUpperCase()}</span>${esc(site.name || site.domain)}`;
      btn.title = site.domain;
      btn.addEventListener("click", () => {
        activeSiteId = site.id;
        formData = {};
        selectedTones = new Set();
        render();
      });
      tabsWrap.appendChild(btn);
    });
    siteSel.appendChild(tabsWrap);

    const manageLink = document.createElement("a");
    manageLink.href = "settings.html";
    manageLink.className = "ag-manage-sites-link";
    manageLink.textContent = sites.length < 3 ? `${t("addSite")} (${sites.length}/3)` : t("manageSites");
    siteSel.appendChild(manageLink);
    wrap.appendChild(siteSel);

    // site profile strip
    if (activeSite) {
      const strip = document.createElement("div");
      strip.className = "ag-site-profile-strip";
      strip.innerHTML = `
        <span class="ag-sps-item">🌐 ${esc(activeSite.domain)}</span>
        ${activeSite.niche     ? `<span class="ag-sps-item">📂 ${esc(activeSite.niche)}</span>` : ""}
        ${siteLangs.length     ? `<span class="ag-sps-item">🗣 ${siteLangs.join(" · ")}</span>` : ""}
        ${activeSite.geo       ? `<span class="ag-sps-item">📍 ${esc(activeSite.geo)}</span>` : ""}
        <a href="settings.html" class="ag-sps-edit">${t("editProfile")}</a>`;
      wrap.appendChild(strip);
    }

    // form
    const form = document.createElement("form");
    form.className = "ag-form";
    form.addEventListener("submit", e => { e.preventDefault(); startGenerate(form, activeSite); });

    // ── Core ──────────────────────────────────────────
    form.appendChild(section(t("secCore"), `
      <div class="ag-field ag-field-full">
        <label>${t("topic")} <span class="ag-req">*</span></label>
        <input type="text" name="topic" placeholder="${t("topicPh")}" required autocomplete="off" value="${esc(formData.topic || "")}">
      </div>
      <div class="ag-field ag-field-full">
        <label>${t("brief")}</label>
        <textarea name="brief" rows="3" placeholder="${t("briefPh")}">${esc(formData.brief || "")}</textarea>
      </div>
      <div class="ag-field">
        <label>${t("articleType")}</label>
        <select name="articleType">${t("articleTypes").map((tp, i) => `<option value="${I18N.en.articleTypes[i]}"${I18N.en.articleTypes[i] === (formData.articleType || "How-to guide") ? " selected" : ""}>${tp}</option>`).join("")}</select>
      </div>
      <div class="ag-field">
        <label>${t("model")}</label>
        <select name="model">${MODELS.map(m => `<option value="${m.value}"${m.value === (formData.model || "sonnet") ? " selected" : ""}>${m.label}</option>`).join("")}</select>
      </div>
    `));

    // ── Audience ──────────────────────────────────────
    form.appendChild(section(t("secAudience"), `
      <div class="ag-field">
        <label>${t("readingLevel")}</label>
        <select name="readingLevel">
          <option value="Basic">${t("readingBasic")}</option>
          <option value="Intermediate" selected>${t("readingInter")}</option>
          <option value="Advanced">${t("readingAdv")}</option>
          <option value="Expert">${t("readingExp")}</option>
        </select>
      </div>
      <div class="ag-field">
        <label>${t("audience")}</label>
        <input type="text" name="audience" placeholder="${t("audiencePh")}" value="${esc(prefillAud)}">
      </div>
    `));

    // ── SEO ───────────────────────────────────────────
    form.appendChild(section(t("secSeo"), `
      <div class="ag-field">
        <label>${t("primaryKw")} <span class="ag-muted">${t("primaryKwSub")}</span></label>
        <input type="text" name="primaryKeyword" placeholder="${t("primaryKwPh")}" value="${esc(formData.primaryKeyword || "")}">
      </div>
      <div class="ag-field">
        <label>${t("secondaryKw")}</label>
        <input type="text" name="secondaryKeywords" placeholder="${t("secondaryKwPh")}" value="${esc(formData.secondaryKeywords || "")}">
      </div>
      <div class="ag-field">
        <label>${t("searchIntent")}</label>
        <select name="searchIntent">${t("intents").map((v, i) => `<option value="${I18N.en.intents[i]}">${v}</option>`).join("")}</select>
      </div>
      <div class="ag-field">
        <label>${t("funnelStage")}</label>
        <select name="funnelStage">${t("funnel").map(f => `<option>${f}</option>`).join("")}</select>
      </div>
      <div class="ag-field ag-field-full">
        <label>${t("geoTarget")}</label>
        <input type="text" name="geoTarget" placeholder="${t("geoTargetPh")}" value="${esc(prefillGeo)}">
      </div>
    `));

    // ── AI Search ─────────────────────────────────────
    const aiSec = section(t("secAi"), "");
    const aiBody = aiSec.querySelector(".ag-section-body");
    const aiLabel = document.createElement("div");
    aiLabel.className = "ag-sublabel";
    aiLabel.textContent = t("optimizeFor");
    aiBody.appendChild(aiLabel);
    aiBody.appendChild(buildChipGroup([
      { id:"chatgpt",    label:"ChatGPT"      },
      { id:"perplexity", label:"Perplexity"   },
      { id:"google-ai",  label:"Google AI"    },
      { id:"claude",     label:"Claude"       },
      { id:"bing",       label:"Bing Copilot" },
    ], selectedAiTargets));
    form.appendChild(aiSec);

    // ── Content Settings ──────────────────────────────
    const contSec = section(t("secContent"), `
      <div class="ag-field">
        <label>${t("articleLength")}</label>
        <select name="articleLength">${t("lengths").map(l => `<option value="${l.value}"${l.value === (formData.articleLength || "M") ? " selected" : ""}>${l.label}</option>`).join("")}</select>
      </div>
    `);
    const contBody = contSec.querySelector(".ag-section-body");
    const toneLabel = document.createElement("div");
    toneLabel.className = "ag-sublabel";
    toneLabel.style.marginTop = "12px";
    toneLabel.textContent = t("tone");
    contBody.appendChild(toneLabel);
    contBody.appendChild(buildChipGroup(t("tones"), selectedTones));

    const opts = document.createElement("div");
    opts.className = "ag-checks-row";
    opts.innerHTML = `
      <label class="ag-check"><input type="checkbox" name="includeFaq" checked> ${t("optFaq")}</label>
      <label class="ag-check"><input type="checkbox" name="includeToc" checked> ${t("optToc")}</label>
      <label class="ag-check"><input type="checkbox" name="includeSchema" checked> ${t("optSchema")}</label>
      <label class="ag-check"><input type="checkbox" name="includeSnippet" checked> ${t("optSnippet")}</label>
      <label class="ag-check"><input type="checkbox" name="includePromo" checked> ${t("optPromo")}</label>`;
    contBody.appendChild(opts);
    form.appendChild(contSec);

    // ── Conversion & CTA ──────────────────────────────
    form.appendChild(section(t("secCta"), `
      <div class="ag-field">
        <label>${t("convGoal")}</label>
        <select name="conversionGoal">${t("goals").map((g, i) => `<option value="${I18N.en.goals[i]}">${g}</option>`).join("")}</select>
      </div>
      <div class="ag-field">
        <label>${t("ctaText")}</label>
        <input type="text" name="cta" placeholder="${t("ctaTextPh")}" value="${esc(formData.cta || "")}">
      </div>
      <div class="ag-field ag-field-full">
        <label>${t("ctaUrl")}</label>
        <input type="text" name="ctaUrl" placeholder="https://…" value="${esc(formData.ctaUrl || "")}">
      </div>
    `));

    // ── Submit ────────────────────────────────────────
    const submitRow = document.createElement("div");
    submitRow.className = "ag-submit-row";
    submitRow.innerHTML = `<div class="ag-credit-note">✦ ${t("creditNote")}</div>`;
    const genBtn = document.createElement("button");
    genBtn.type = "submit";
    genBtn.className = "ag-generate-btn";
    genBtn.textContent = t("generateBtn");
    submitRow.appendChild(genBtn);
    form.appendChild(submitRow);

    wrap.appendChild(form);
    root.appendChild(wrap);
  }

  function section(title, bodyHTML) {
    const sec = document.createElement("details");
    sec.className = "ag-section";
    sec.open = true;
    sec.innerHTML = `
      <summary class="ag-section-title">${title}</summary>
      <div class="ag-section-body ag-grid">${bodyHTML}</div>`;
    return sec;
  }

  /* ── GENERATING ──────────────────────────────────────── */
  function renderGenerating() {
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div class="ag-generating">
        <div class="ag-gen-ring"></div>
        <div class="ag-gen-title">${t("generatingTitle")}</div>
        <div class="ag-gen-steps" id="ag-gen-steps"></div>
        <div class="ag-gen-hint">${t("generatingHint")}</div>
      </div>`;
    root.appendChild(wrap);
    progressStep = 0;
    animateSteps();
  }

  function animateSteps() {
    const stepsEl = document.getElementById("ag-gen-steps");
    if (!stepsEl || state !== "generating") return;
    const steps = t("progress");
    if (progressStep < steps.length) {
      const row = document.createElement("div");
      row.className = "ag-gen-step entering";
      row.innerHTML = `<span class="ag-gen-dot"></span>${steps[progressStep]}`;
      stepsEl.appendChild(row);
      requestAnimationFrame(() => row.classList.remove("entering"));
      progressStep++;
      setTimeout(animateSteps, 950 + Math.random() * 650);
    }
  }

  /* ── RESULTS ─────────────────────────────────────────── */
  function renderResults() {
    if (!result) { state = "form"; render(); return; }
    const { article, seo, schema, audits, promotion } = result;
    const tabs = t("tabs");

    const wrap = document.createElement("div");
    wrap.className = "ag-results-wrap";

    // top bar
    const topBar = document.createElement("div");
    topBar.className = "ag-results-topbar";

    const backBtn = document.createElement("button");
    backBtn.className = "ag-ghost-btn";
    backBtn.textContent = t("backBtn");
    backBtn.addEventListener("click", () => { state = "form"; result = null; render(); });
    topBar.appendChild(backBtn);

    if (audits) {
      const scoresEl = document.createElement("div");
      scoresEl.className = "ag-scores-row";
      scoresEl.innerHTML = `
        <span class="ag-score-badge">✦ AI: ${audits.ai_citation?.overall_score ?? "—"}</span>
        <span class="ag-score-badge">📈 CRO: ${audits.cro?.score ?? "—"}</span>
        <span class="ag-score-badge">${audits.market?.keyword_difficulty ?? "—"} KD</span>
        <span class="ag-score-badge">${seo?.estimated_word_count ?? "—"} ${currentLang === "el" ? "λέξεις" : currentLang === "de" ? "Wörter" : "words"}</span>`;
      topBar.appendChild(scoresEl);
    }

    const actionRow = document.createElement("div");
    actionRow.className = "ag-topbar-actions";

    const copyAllBtn = document.createElement("button");
    copyAllBtn.className = "ag-ghost-btn";
    copyAllBtn.textContent = t("copyAll");
    copyAllBtn.addEventListener("click", () => copyText(buildCopyAll(article, seo), copyAllBtn));
    actionRow.appendChild(copyAllBtn);

    const dlBtn = document.createElement("button");
    dlBtn.className = "ag-ghost-btn";
    dlBtn.textContent = t("download");
    dlBtn.addEventListener("click", () => downloadHTML(article, seo));
    actionRow.appendChild(dlBtn);

    const saveBtn = document.createElement("button");
    saveBtn.className = "ag-ghost-btn";
    saveBtn.textContent = t("save");
    saveBtn.addEventListener("click", () => {
      const sites = loadSites();
      const activeSite = sites.find(s => s.id === activeSiteId);
      const art = {
        id: Date.now(), savedAt: new Date().toISOString(),
        siteId: activeSiteId, siteName: activeSite?.name || activeSite?.domain || "",
        siteDomain: activeSite?.domain || "",
        lang: currentLang,
        title: seo?.title_tag || article?.h1 || formData.topic || "Untitled",
        language: { en: "English", el: "Greek", de: "German" }[currentLang] || "English",
        keyword: seo?.primary_keyword || formData.primaryKeyword || "",
        slug: seo?.slug || "",
        metaDescription: seo?.meta_description || "",
        htmlContent: buildArticleHTML(article, seo),
        plainText: buildCopyAll(article, seo),
        result,
      };
      savedArticles.unshift(art);
      localStorage.setItem("eureach_articles", JSON.stringify(savedArticles.slice(0, 100)));
      saveBtn.textContent = "✅";
      setTimeout(() => { saveBtn.textContent = t("save"); }, 2500);
    });
    actionRow.appendChild(saveBtn);

    const wpBtn = document.createElement("button");
    if (wpConnected) {
      wpBtn.className = "ag-ghost-btn ag-wp-btn";
      wpBtn.textContent = "🚀 WordPress";
      wpBtn.addEventListener("click", () => {
        const sites = loadSites();
        const activeSite = sites.find(s => s.id === activeSiteId);
        const tempArt = {
          title: seo?.title_tag || article?.h1 || formData.topic || "Untitled",
          htmlContent: buildArticleHTML(article, seo),
        };
        openWpPublish(tempArt);
      });
    } else {
      wpBtn.className = "ag-ghost-btn";
      wpBtn.title = "Connect WordPress to publish directly";
      wpBtn.textContent = "🔗 Connect WP";
      wpBtn.addEventListener("click", () => { window.location.href = "settings.html#wordpress"; });
    }
    actionRow.appendChild(wpBtn);

    topBar.appendChild(actionRow);
    wrap.appendChild(topBar);

    // tab bar
    const tabBar = document.createElement("div");
    tabBar.className = "ag-tab-bar";
    tabs.forEach((tab, idx) => {
      const btn = document.createElement("button");
      btn.className = "ag-tab" + (idx === activeTab ? " active" : "");
      btn.textContent = tab;
      btn.addEventListener("click", () => {
        activeTab = idx;
        tabBar.querySelectorAll(".ag-tab").forEach((b, i) => b.classList.toggle("active", i === idx));
        renderTabBody(tabBodyEl, idx, article, seo, schema, audits, promotion);
      });
      tabBar.appendChild(btn);
    });
    wrap.appendChild(tabBar);

    const tabBodyEl = document.createElement("div");
    tabBodyEl.className = "ag-tab-body";
    renderTabBody(tabBodyEl, activeTab, article, seo, schema, audits, promotion);
    wrap.appendChild(tabBodyEl);
    root.appendChild(wrap);
  }

  function renderTabBody(el, idx, article, seo, schema, audits, promotion) {
    el.innerHTML = "";
    if (idx === 0) renderArticleTab(el, article, seo);
    if (idx === 1) renderSeoTab(el, seo);
    if (idx === 2) renderSchemaTab(el, schema);
    if (idx === 3) renderAuditsTab(el, audits);
    if (idx === 4) renderPromotionTab(el, promotion);
  }

  /* ── Article tab ─────────────────────────────────────── */
  function renderArticleTab(el, article, seo) {
    const wrap = document.createElement("div");
    wrap.className = "ag-article-view";
    let viewMode = "preview";

    const toggleRow = document.createElement("div");
    toggleRow.className = "ag-view-toggle";
    const previewBtn = document.createElement("button");
    previewBtn.className = "ag-toggle-btn active"; previewBtn.dataset.mode = "preview";
    previewBtn.textContent = t("preview");
    const htmlBtn = document.createElement("button");
    htmlBtn.className = "ag-toggle-btn"; htmlBtn.dataset.mode = "html";
    htmlBtn.textContent = t("htmlSource");
    toggleRow.appendChild(previewBtn);
    toggleRow.appendChild(htmlBtn);
    toggleRow.addEventListener("click", e => {
      const btn = e.target.closest("[data-mode]");
      if (!btn) return;
      viewMode = btn.dataset.mode;
      toggleRow.querySelectorAll(".ag-toggle-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === viewMode));
      renderArticleContent(contentEl, article, seo, viewMode);
    });
    wrap.appendChild(toggleRow);

    const contentEl = document.createElement("div");
    renderArticleContent(contentEl, article, seo, viewMode);
    wrap.appendChild(contentEl);
    el.appendChild(wrap);
  }

  function renderArticleContent(el, article, seo, mode) {
    const html = buildArticleHTML(article, seo);
    if (mode === "html") {
      el.innerHTML = `
        <div class="ag-code-header">
          <span>HTML</span>
          <button class="ag-copy-btn" id="ag-copy-html">${t("copyHtmlBtn")}</button>
        </div>
        <pre class="ag-code">${esc(html)}</pre>`;
      el.querySelector("#ag-copy-html").addEventListener("click", e => copyText(html, e.target));
    } else {
      el.innerHTML = `<div class="ag-article-preview">${html}</div>`;
    }
  }

  function buildArticleHTML(article, seo) {
    let html = "";
    if (article.featured_snippet) html += `<div class="art-snippet"><p>${esc(article.featured_snippet)}</p></div>\n`;
    if (article.toc?.length) html += `<nav class="art-toc"><h3>Contents</h3><ol>${article.toc.map(t => `<li>${esc(t)}</li>`).join("")}</ol></nav>\n`;
    if (article.h1) html += `<h1>${esc(article.h1)}</h1>\n`;
    if (article.intro) html += `<p class="art-intro">${esc(article.intro)}</p>\n`;
    (article.sections || []).forEach(s => {
      html += `<h2>${esc(s.h2)}</h2>\n`;
      if (s.direct_answer) html += `<p><strong>${esc(s.direct_answer)}</strong></p>\n`;
      if (s.content) s.content.split(/\n\n+/).forEach(p => { if (p.trim()) html += `<p>${esc(p.trim())}</p>\n`; });
    });
    if (article.conclusion) html += `<h2>${currentLang === "el" ? "Συμπέρασμα" : currentLang === "de" ? "Fazit" : "Conclusion"}</h2>\n<p>${esc(article.conclusion)}</p>\n`;
    if (article.cta_block) html += `<div class="art-cta">${esc(article.cta_block)}</div>\n`;
    if (article.faq?.length) {
      const faqH = currentLang === "el" ? "Συχνές Ερωτήσεις" : currentLang === "de" ? "Häufig gestellte Fragen" : "Frequently Asked Questions";
      html += `<h2>${faqH}</h2>\n<div class="art-faq">\n`;
      article.faq.forEach(f => html += `<div class="art-faq-item"><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></div>\n`);
      html += `</div>\n`;
    }
    return html;
  }

  function buildCopyAll(article, seo) {
    let out = "";
    if (seo?.title_tag)        out += `TITLE: ${seo.title_tag}\n`;
    if (seo?.meta_description) out += `META: ${seo.meta_description}\n`;
    if (seo?.slug)             out += `SLUG: ${seo.slug}\n\n---\n\n`;
    if (article?.h1)           out += `# ${article.h1}\n\n`;
    if (article?.featured_snippet) out += `> ${article.featured_snippet}\n\n`;
    if (article?.intro)        out += `${article.intro}\n\n`;
    (article?.sections || []).forEach(s => {
      out += `## ${s.h2}\n`;
      if (s.direct_answer) out += `**${s.direct_answer}**\n\n`;
      if (s.content)       out += `${s.content}\n\n`;
    });
    if (article?.conclusion) out += `## Conclusion\n${article.conclusion}\n\n`;
    if (article?.faq?.length) {
      out += `## FAQ\n`;
      article.faq.forEach(f => out += `**${f.q}**\n${f.a}\n\n`);
    }
    return out;
  }

  function downloadHTML(article, seo) {
    const content = buildArticleHTML(article, seo);
    const full = `<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8">\n  <title>${esc(seo?.title_tag || "Article")}</title>\n</head>\n<body>\n${content}\n</body>\n</html>`;
    const blob = new Blob([full], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (seo?.slug || "article") + ".html";
    a.click();
  }

  /* ── SEO tab ─────────────────────────────────────────── */
  function renderSeoTab(el, seo) {
    if (!seo) { el.innerHTML = `<div class="ag-empty">No SEO data.</div>`; return; }
    const fields = [
      { label: "Title Tag",        value: seo.title_tag,        note: `${(seo.title_tag||"").length} chars (50-60)` },
      { label: "Meta Description", value: seo.meta_description,  note: `${(seo.meta_description||"").length} chars (130-155)` },
      { label: "URL Slug",         value: seo.slug             },
      { label: "OG Title",         value: seo.og_title         },
      { label: "OG Description",   value: seo.og_description   },
      { label: "Primary Keyword",  value: seo.primary_keyword  },
      { label: "Search Intent",    value: seo.search_intent    },
      { label: "Est. Word Count",  value: seo.estimated_word_count ? String(seo.estimated_word_count) : "" },
    ];
    const wrap = document.createElement("div");
    wrap.className = "ag-seo-wrap";
    fields.forEach(f => {
      if (!f.value) return;
      const row = document.createElement("div");
      row.className = "ag-seo-row";
      row.innerHTML = `
        <div class="ag-seo-label">${esc(f.label)}</div>
        <div class="ag-seo-value">${esc(f.value)}${f.note ? `<span class="ag-seo-note"> · ${esc(f.note)}</span>` : ""}</div>
        <button class="ag-copy-btn">Copy</button>`;
      row.querySelector(".ag-copy-btn").addEventListener("click", e => copyText(f.value, e.target));
      wrap.appendChild(row);
    });
    if (seo.secondary_keywords?.length) {
      const row = document.createElement("div");
      row.className = "ag-seo-row";
      row.innerHTML = `<div class="ag-seo-label">Secondary Keywords</div><div class="ag-pills-wrap">${seo.secondary_keywords.map(k => pill(k)).join(" ")}</div>`;
      wrap.appendChild(row);
    }
    el.appendChild(wrap);
  }

  /* ── Schema tab ──────────────────────────────────────── */
  function renderSchemaTab(el, schema) {
    if (!schema) { el.innerHTML = `<div class="ag-empty">No schema data.</div>`; return; }
    const blocks = [
      { label: "Combined @graph (paste in <head>)", key: "combined_graph"      },
      { label: "Article / BlogPosting",             key: "article_jsonld"      },
      { label: "FAQPage",                           key: "faq_jsonld"          },
      { label: "Organization",                      key: "organization_jsonld" },
    ];
    const wrap = document.createElement("div");
    wrap.className = "ag-schema-wrap";
    blocks.forEach(b => {
      const value = schema[b.key];
      if (!value) return;
      const sec = document.createElement("div");
      sec.className = "ag-schema-block";
      sec.innerHTML = `
        <div class="ag-code-header"><span>${esc(b.label)}</span><button class="ag-copy-btn">Copy</button></div>
        <pre class="ag-code">${esc(value)}</pre>`;
      sec.querySelector(".ag-copy-btn").addEventListener("click", e => copyText(value, e.target));
      wrap.appendChild(sec);
    });
    el.appendChild(wrap);
  }

  /* ── Audits tab ──────────────────────────────────────── */
  function renderAuditsTab(el, audits) {
    if (!audits) { el.innerHTML = `<div class="ag-empty">No audit data.</div>`; return; }
    const wrap = document.createElement("div");
    wrap.className = "ag-audits-wrap";
    if (audits.market) {
      const m = audits.market;
      wrap.appendChild(auditCard("Market Analysis", `
        <div class="ag-audit-row"><b>Keyword Difficulty</b>${pill(m.keyword_difficulty, diffCls(m.keyword_difficulty))}</div>
        <div class="ag-audit-row"><b>Monthly Searches</b> ${esc(m.monthly_searches_estimate||"—")}</div>
        ${m.competitors?.length ? `<div class="ag-audit-row"><b>Competitors</b> ${m.competitors.map(c => pill(c)).join(" ")}</div>` : ""}
        ${m.gaps?.length ? `<div class="ag-audit-section"><b>Content Gaps</b><ul>${m.gaps.map(g => `<li>${esc(g)}</li>`).join("")}</ul></div>` : ""}
        ${m.topic_cluster?.length ? `<div class="ag-audit-section"><b>Topic Cluster</b><ul>${m.topic_cluster.map(tp => `<li>${esc(tp)}</li>`).join("")}</ul></div>` : ""}
      `));
    }
    if (audits.cro) {
      const c = audits.cro;
      wrap.appendChild(auditCard("CRO Score", `
        <div class="ag-score-big">${score(c.score)}<span class="ag-score-denom">/100</span></div>
        ${c.strengths?.length ? `<div class="ag-audit-section"><b class="ag-green">✓ Strengths</b><ul>${c.strengths.map(s => `<li>${esc(s)}</li>`).join("")}</ul></div>` : ""}
        ${c.weaknesses?.length ? `<div class="ag-audit-section"><b class="ag-red">✕ Weaknesses</b><ul>${c.weaknesses.map(s => `<li>${esc(s)}</li>`).join("")}</ul></div>` : ""}
        ${c.recommendations?.length ? `<div class="ag-audit-section"><b>Recommendations</b><ul>${c.recommendations.map(r => `<li>${esc(r)}</li>`).join("")}</ul></div>` : ""}
      `));
    }
    if (audits.eu_ai_act) {
      const a = audits.eu_ai_act;
      wrap.appendChild(auditCard("EU AI Act Article 50", `
        <div class="ag-audit-row">
          <b>Disclosure required?</b>
          <span class="ag-badge ${a.requires_disclosure ? "ag-badge-warn" : "ag-badge-ok"}">${a.requires_disclosure ? "YES" : "NO"}</span>
          <span class="ag-badge ag-badge-risk-${(a.risk_level||"low").toLowerCase()}">${esc(a.risk_level||"low")} risk</span>
        </div>
        ${a.reasoning ? `<div class="ag-audit-row"><b>Reasoning</b> ${esc(a.reasoning)}</div>` : ""}
        ${a.requires_disclosure && a.disclosure_text ? `<div class="ag-audit-section"><b>Suggested disclosure</b><div class="ag-disclosure-box">${esc(a.disclosure_text)}</div></div>` : ""}
      `));
    }
    if (audits.ai_citation) {
      const ai = audits.ai_citation;
      wrap.appendChild(auditCard("AI Citation Readiness", `
        <div class="ag-ai-scores">
          <div class="ag-ai-score-item"><span>Overall</span>${score(ai.overall_score)}</div>
          <div class="ag-ai-score-item"><span>ChatGPT</span>${score(ai.chatgpt_score||0)}</div>
          <div class="ag-ai-score-item"><span>Perplexity</span>${score(ai.perplexity_score||0)}</div>
          <div class="ag-ai-score-item"><span>Google AI</span>${score(ai.google_ai_score||0)}</div>
        </div>
        ${ai.recommendations?.length ? `<div class="ag-audit-section"><b>Improvements</b><ul>${ai.recommendations.map(r => `<li>${esc(r)}</li>`).join("")}</ul></div>` : ""}
      `));
    }
    el.appendChild(wrap);
  }

  function auditCard(title, bodyHTML) {
    const card = document.createElement("div");
    card.className = "ag-audit-card";
    card.innerHTML = `<div class="ag-audit-card-title">${esc(title)}</div><div class="ag-audit-card-body">${bodyHTML}</div>`;
    return card;
  }

  function diffCls(d) {
    if (!d) return "";
    const dl = d.toLowerCase();
    if (dl === "easy")   return "ag-pill-green";
    if (dl === "medium") return "ag-pill-yellow";
    return "ag-pill-red";
  }

  /* ── Promotion tab ───────────────────────────────────── */
  function renderPromotionTab(el, promotion) {
    if (!promotion) { el.innerHTML = `<div class="ag-empty">No promotion data.</div>`; return; }
    const items = [
      { label: "Facebook Post",     key: "facebook_post"     },
      { label: "Instagram Caption", key: "instagram_caption" },
      { label: "LinkedIn Post",     key: "linkedin_post"     },
      { label: "Twitter / X",       key: "twitter_post"      },
      { label: "WhatsApp",          key: "whatsapp_message"  },
      { label: "Email Subject",     key: "email_subject"     },
      { label: "Email Body",        key: "email_body"        },
    ];
    const wrap = document.createElement("div");
    wrap.className = "ag-promo-wrap";
    items.forEach(item => {
      const value = promotion[item.key];
      if (!value) return;
      const block = document.createElement("div");
      block.className = "ag-promo-block";
      block.innerHTML = `
        <div class="ag-code-header"><span>${esc(item.label)}</span><button class="ag-copy-btn">Copy</button></div>
        <div class="ag-promo-text">${esc(value)}</div>`;
      block.querySelector(".ag-copy-btn").addEventListener("click", e => copyText(value, e.target));
      wrap.appendChild(block);
    });
    el.appendChild(wrap);
  }

  /* ── SAVED ───────────────────────────────────────────── */
  function renderSaved() {
    const wrap = document.createElement("div");
    wrap.className = "ag-saved-wrap";
    const hdr = document.createElement("div");
    hdr.className = "ag-results-topbar";
    const backBtn = document.createElement("button");
    backBtn.className = "ag-ghost-btn";
    backBtn.textContent = t("backBtn");
    backBtn.addEventListener("click", () => { state = "form"; render(); });
    hdr.appendChild(backBtn);
    const heading = document.createElement("span");
    heading.className = "ag-saved-heading";
    heading.textContent = t("savedHeading");
    hdr.appendChild(heading);
    wrap.appendChild(hdr);

    const listEl = document.createElement("div");
    listEl.className = "ag-saved-list";
    if (!savedArticles.length) {
      listEl.innerHTML = `<div class="ag-empty"><div class="ag-empty-icon">📄</div><div class="ag-empty-title">${t("noSaved")}</div><div class="ag-empty-sub">${t("noSavedSub")}</div></div>`;
    } else {
      savedArticles.forEach((art, idx) => {
        const card = document.createElement("div");
        card.className = "ag-saved-card";
        const date = new Date(art.savedAt).toLocaleDateString(undefined, { year:"numeric", month:"short", day:"numeric" });
        const flag = { Greek:"🇬🇷", English:"🇬🇧", German:"🇩🇪" }[art.language] || "🌐";
        const wpBadge = art.publishedToWP
          ? `<span class="ag-wp-badge">✓ WordPress${art.wpPostUrl ? ` <a href="${esc(art.wpPostUrl)}" target="_blank" rel="noopener">↗</a>` : ""}</span>`
          : "";
        card.innerHTML = `
          <div class="ag-saved-card-main">
            <div class="ag-saved-card-title">${esc(art.title)}${wpBadge}</div>
            <div class="ag-saved-card-meta">${flag} ${esc(art.language||"")}${art.siteDomain ? ` · 🌐 ${esc(art.siteDomain)}` : ""}${art.keyword ? ` · 🔑 ${esc(art.keyword)}` : ""} · <span class="ag-saved-date">${date}</span></div>
            ${art.metaDescription ? `<div class="ag-saved-desc">${esc(art.metaDescription)}</div>` : ""}
          </div>
          <div class="ag-saved-actions">
            <button class="ag-ghost-btn" data-action="view">${t("viewBtn")}</button>
            <button class="ag-ghost-btn" data-action="copy">${t("copyHtml")}</button>
            <button class="ag-ghost-btn" data-action="dl">${t("download")}</button>
            ${wpConnected ? `<button class="ag-ghost-btn ag-wp-btn" data-action="wp">🚀 WP</button>` : ""}
            <button class="ag-ghost-btn ag-delete-btn" data-action="del">🗑</button>
          </div>`;
        card.querySelector("[data-action=view]").addEventListener("click", () => {
          if (!art.result) return;
          result = art.result;
          if (art.lang) currentLang = art.lang;
          activeTab = 0; state = "results"; render();
        });
        card.querySelector("[data-action=copy]").addEventListener("click", e => copyText(art.htmlContent||"", e.target));
        card.querySelector("[data-action=dl]").addEventListener("click", () => downloadHTML(art.result?.article||{}, art.result?.seo||{}));
        const wpCardBtn = card.querySelector("[data-action=wp]");
        if (wpCardBtn) wpCardBtn.addEventListener("click", () => openWpPublish(art));
        card.querySelector("[data-action=del]").addEventListener("click", () => {
          if (!confirm(`Delete "${art.title}"?`)) return;
          savedArticles.splice(idx, 1);
          localStorage.setItem("eureach_articles", JSON.stringify(savedArticles));
          card.remove();
        });
        listEl.appendChild(card);
      });
    }
    wrap.appendChild(listEl);
    root.appendChild(wrap);
  }

  /* ── GENERATE (mock) ─────────────────────────────────── */
  async function startGenerate(form, activeSite) {
    // Check and deduct article credit before starting
    try {
      const chk = await fetch("/api/articles/deduct", { method: "POST" });
      if (!chk.ok) {
        const d = await chk.json();
        if (chk.status === 403 && d.error === "limit_reached") {
          showArticleLimitModal(d.max);
          return;
        }
        if (chk.status === 401) return; // not logged in — let it proceed anyway
      }
    } catch {}

    const fd = new FormData(form);
    formData = {
      topic:             fd.get("topic")           || "",
      brief:             fd.get("brief")           || "",
      articleType:       fd.get("articleType")     || "How-to guide",
      model:             fd.get("model")           || "sonnet",
      language:          { en:"English", el:"Greek", de:"German" }[currentLang] || "English",
      readingLevel:      fd.get("readingLevel")    || "Intermediate",
      audience:          fd.get("audience")        || "",
      primaryKeyword:    fd.get("primaryKeyword")  || "",
      secondaryKeywords: fd.get("secondaryKeywords") || "",
      searchIntent:      fd.get("searchIntent")    || "Informational",
      funnelStage:       fd.get("funnelStage")     || "TOFU",
      geoTarget:         fd.get("geoTarget")       || "",
      articleLength:     fd.get("articleLength")   || "M",
      conversionGoal:    fd.get("conversionGoal")  || "Email",
      cta:               fd.get("cta")             || "",
      ctaUrl:            fd.get("ctaUrl")          || "",
      siteDomain:        activeSite?.domain        || "",
      siteName:          activeSite?.name          || activeSite?.domain || "",
      siteNiche:         activeSite?.niche         || "",
    };
    state = "generating";
    render();
    const delay = 8000 + Math.random() * 4000;
    setTimeout(() => {
      result = buildMockResult(formData);
      activeTab = 0; state = "results"; render();
    }, delay);
  }

  function showArticleLimitModal(max) {
    const existing = document.getElementById("ag-limit-modal");
    if (existing) { existing.style.display = "flex"; return; }
    const el = document.createElement("div");
    el.id = "ag-limit-modal";
    el.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px";
    el.innerHTML = `<div style="background:#1e293b;border:1px solid rgba(255,255,255,0.12);border-radius:16px;max-width:420px;width:100%;padding:36px 28px;text-align:center">
      <div style="font-size:2.2rem;margin-bottom:12px">🔒</div>
      <h2 style="margin:0 0 8px;font-size:1.2rem;color:#f1f5f9">Article Limit Reached</h2>
      <p style="color:#94a3b8;font-size:0.9rem;margin:0 0 20px">Free plan includes ${max || 1} AI article per month. Upgrade for more.</p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
        <a href="membership.html?highlight=starter" style="background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:0.87rem;font-weight:600">⚡ Upgrade Plan</a>
        <button onclick="document.getElementById('ag-limit-modal').style.display='none'" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#94a3b8;padding:10px 20px;border-radius:8px;font-size:0.87rem;cursor:pointer">Maybe later</button>
      </div>
    </div>`;
    document.body.appendChild(el);
  }

  function buildMockResult(fd) {
    const kw       = fd.primaryKeyword || fd.topic;
    const lang     = fd.language;
    const siteName = fd.siteName || fd.siteDomain || "eureach.eu";
    const slug     = fd.topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const wc       = { XS:650, S:1000, M:1750, L:3000, XL:4200 }[fd.articleLength] || 1750;

    const concLabel = lang === "Greek" ? "Συμπέρασμα" : lang === "German" ? "Fazit" : "Conclusion";

    return {
      article: {
        h1: fd.topic,
        featured_snippet: `A concise answer to "${kw}" — optimised for Google featured snippets and AI overviews in ${lang}.`,
        toc: [
          `Introduction to ${fd.topic}`,
          "Key Benefits & Why It Matters",
          "Step-by-Step Guide",
          "Common Mistakes to Avoid",
          "Expert Tips & Best Practices",
          concLabel,
          lang === "Greek" ? "Συχνές Ερωτήσεις" : lang === "German" ? "Häufig gestellte Fragen" : "FAQ",
        ],
        intro: `Whether you're a business owner or consumer, understanding ${fd.topic} can make a significant difference. This comprehensive ${lang} guide covers everything from basics to advanced strategies.`,
        sections: [
          { h2: `Introduction to ${fd.topic}`, direct_answer: `${fd.topic} refers to a structured approach to ${kw} that drives measurable results.`, content: `Many businesses overlook this area, yet it can be the single biggest lever for growth.\n\nResearch shows companies that prioritise this see up to 3× better outcomes.` },
          { h2: "Key Benefits", content: `Three primary reasons this should be at the top of your agenda:\n\n1. Increased visibility at the right moment.\n2. Higher conversion rates from qualified traffic.\n3. Compound growth that reduces cost-per-acquisition over time.` },
          { h2: "Step-by-Step Guide", content: `**Step 1:** Define your goal and target audience.\n**Step 2:** Research keywords and competitor gaps.\n**Step 3:** Create structured, ${lang}-language content.\n**Step 4:** Publish, promote, and measure.\n**Step 5:** Iterate based on data.` },
          { h2: "Expert Tips", content: `Focus on E-E-A-T signals in ${new Date().getFullYear()}: Experience, Expertise, Authoritativeness, Trustworthiness. For ${lang}-language markets, localisation goes beyond translation — cultural nuance and regional examples boost trust.` },
        ],
        conclusion: `Mastering ${fd.topic} doesn't have to be complicated. Start with one action today — measure, learn, and scale.`,
        cta_block: fd.cta ? `${fd.cta}${fd.ctaUrl ? " → " + fd.ctaUrl : ""}` : "",
        faq: [
          { q: `What is ${fd.topic}?`,                  a: `${fd.topic} is a strategic approach to ${kw} that helps businesses achieve measurable growth.` },
          { q: "How long to see results?",              a: "Most see initial results in 4-8 weeks, with compounding growth over 3-6 months." },
          { q: `Suitable for ${fd.geoTarget || "EU"} markets?`, a: `Yes — our multilingual framework is built for Greek, English, and German markets with cultural nuance built in.` },
          { q: "How much does it cost?",                a: "Plans start from €29/month. Contact us for a tailored quote." },
        ],
      },
      seo: {
        title_tag:           `${fd.topic} — Complete Guide (${new Date().getFullYear()}) | ${siteName}`,
        meta_description:    `Everything about ${fd.topic} in ${lang}. Step-by-step guide, expert tips, and strategies for ${fd.geoTarget || "EU"} businesses.`,
        slug,
        og_title:            `${fd.topic} — The Ultimate Guide`,
        og_description:      `A comprehensive ${lang} resource covering ${kw}. Beginner to expert.`,
        primary_keyword:     kw,
        search_intent:       fd.searchIntent,
        estimated_word_count: wc,
        secondary_keywords:  [`${kw} guide`, `how to ${kw}`, `${kw} tips`, `best ${kw} strategies`],
        lsi_keywords:        ["content marketing", "SEO", "lead generation", "ROI", "EU market"],
      },
      schema: {
        combined_graph:      JSON.stringify({ "@context":"https://schema.org", "@graph":[{ "@type":"Article","headline":fd.topic,"inLanguage":lang },{ "@type":"FAQPage","mainEntity":[] },{ "@type":"Organization","name":siteName,"url":`https://${fd.siteDomain||"eureach.eu"}` }]}, null, 2),
        article_jsonld:      JSON.stringify({ "@context":"https://schema.org","@type":"BlogPosting","headline":fd.topic,"inLanguage":lang,"author":{"@type":"Organization","name":siteName}}, null, 2),
        faq_jsonld:          JSON.stringify({ "@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":`What is ${fd.topic}?`,"acceptedAnswer":{"@type":"Answer","text":"..."}}]}, null, 2),
        organization_jsonld: JSON.stringify({ "@context":"https://schema.org","@type":"Organization","name":siteName,"url":`https://${fd.siteDomain||"eureach.eu"}`}, null, 2),
      },
      audits: {
        market: {
          keyword_difficulty:        ["Easy","Medium","Hard"][Math.floor(Math.random()*3)],
          monthly_searches_estimate: `${(Math.floor(Math.random()*8)+1)*100}–${(Math.floor(Math.random()*8)+10)*100}/mo`,
          competitors:               ["Competitor A","Competitor B","Competitor C"],
          gaps:                      ["No video content ranking","Limited local language resources","Weak FAQ coverage"],
          topic_cluster:             [`${fd.topic} for beginners`,`Advanced ${kw} strategies`,`${kw} case studies`],
        },
        cro: {
          score:           Math.floor(Math.random()*20)+70,
          strengths:       ["Clear H1 with primary keyword","FAQ section included","Strong CTA placement"],
          weaknesses:      ["No social proof / testimonials","Missing trust badges"],
          recommendations: ["Add customer logos or reviews","Include a comparison table","Add urgency to CTA"],
        },
        eu_ai_act: {
          requires_disclosure: true, risk_level: "Low",
          reasoning:    "Content was generated with AI assistance for informational purposes.",
          disclosure_text: "This article was produced with AI assistance. EU AI Act Article 50 compliant.",
        },
        ai_citation: {
          overall_score:    Math.floor(Math.random()*15)+75,
          chatgpt_score:    Math.floor(Math.random()*15)+75,
          perplexity_score: Math.floor(Math.random()*15)+78,
          google_ai_score:  Math.floor(Math.random()*15)+72,
          recommendations:  ["Add more statistics with source citations","Include author bio","Strengthen direct-answer paragraphs"],
        },
      },
      promotion: {
        facebook_post:     `📖 New article: ${fd.topic}\n\nEverything about ${kw} — practical steps and expert tips.\n\n👉 Read: [link]\n\n#eureach #business`,
        instagram_caption: `✍️ Just published: "${fd.topic}"\n\nSave this post!\n\n#eureach #contentmarketing`,
        linkedin_post:     `Just published a guide on ${fd.topic}.\n\n✅ Why it matters\n✅ Step-by-step framework\n✅ Common mistakes to avoid\n\nFull article: [link]`,
        twitter_post:      `New guide: ${fd.topic} 🧵\n\n1/ ${fd.topic}\n2/ Key benefits\n3/ Step-by-step\n4/ Expert tips\n\n👇 [link]`,
        whatsapp_message:  `Hey! Just published a new guide on ${fd.topic}. Worth a read: [link]`,
        email_subject:     `📖 New Guide: ${fd.topic}`,
        email_body:        `Hi [Name],\n\nWe published a guide on ${fd.topic}.\n\n• Why it matters\n• Step-by-step approach\n• Expert tips\n\nRead here: [link]\n\nBest,\n${siteName}`,
      },
    };
  }

  /* ── WordPress integration ───────────────────────────── */
  async function loadWpStatus() {
    try {
      const r = await fetch("/api/wordpress/connect");
      if (!r.ok) return;
      const d = await r.json();
      wpConnected = !!d.connected;
      wpSiteUrl   = d.siteUrl || "";
    } catch {}
  }

  function openWpPublish(art) {
    const overlay = document.createElement("div");
    overlay.className = "ag-wp-modal-overlay";

    const modal = document.createElement("div");
    modal.className = "ag-wp-modal";
    modal.innerHTML = `
      <div class="ag-wp-modal-header">
        <span>🚀 Publish to WordPress</span>
        <button class="ag-wp-modal-close">✕</button>
      </div>
      <div style="padding:20px">
        <div class="ag-wp-field">
          <label>Post Title</label>
          <input class="ag-wp-input" id="wp-title-input" type="text" value="${esc(art.title || "")}" placeholder="Post title">
        </div>
        <div class="ag-wp-field">
          <label>Categories <span style="font-weight:400;color:var(--muted)">(comma-separated)</span></label>
          <input class="ag-wp-input" id="wp-cats-input" type="text" placeholder="e.g. Marketing, SEO">
        </div>
        <div class="ag-wp-field">
          <label>Tags <span style="font-weight:400;color:var(--muted)">(comma-separated)</span></label>
          <input class="ag-wp-input" id="wp-tags-input" type="text" placeholder="e.g. AI, Content">
        </div>
        <div class="ag-wp-status-toggle">
          <label>Publish as:</label>
          <select class="ag-wp-input" id="wp-status-select" style="width:auto">
            <option value="draft">📝 Draft</option>
            <option value="publish">🟢 Publish Live</option>
          </select>
        </div>
        <div id="wp-publish-err" style="color:#f87171;font-size:0.82rem;margin-top:8px;display:none"></div>
        <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end">
          <button class="btn btn-ghost ag-wp-cancel-btn" style="font-size:0.82rem;padding:7px 14px">Cancel</button>
          <button class="btn btn-primary ag-wp-publish-btn" style="font-size:0.82rem;padding:7px 16px">Publish</button>
        </div>
        <div id="wp-publish-success" class="ag-wp-success" style="display:none"></div>
      </div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => document.body.removeChild(overlay);
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
    modal.querySelector(".ag-wp-modal-close").addEventListener("click", close);
    modal.querySelector(".ag-wp-cancel-btn").addEventListener("click", close);

    modal.querySelector(".ag-wp-publish-btn").addEventListener("click", async () => {
      const title    = modal.querySelector("#wp-title-input").value.trim();
      const cats     = modal.querySelector("#wp-cats-input").value.trim();
      const tags     = modal.querySelector("#wp-tags-input").value.trim();
      const status   = modal.querySelector("#wp-status-select").value;
      const errEl    = modal.querySelector("#wp-publish-err");
      const pubBtn   = modal.querySelector(".ag-wp-publish-btn");
      const successEl = modal.querySelector("#wp-publish-success");

      if (!title) { errEl.textContent = "Title is required."; errEl.style.display = "block"; return; }
      errEl.style.display = "none";
      pubBtn.textContent = "Publishing…";
      pubBtn.disabled = true;

      try {
        const res = await fetch("/api/wordpress/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            content: art.htmlContent || "",
            status,
            categories: cats ? cats.split(",").map(s => s.trim()).filter(Boolean) : [],
            tags: tags ? tags.split(",").map(s => s.trim()).filter(Boolean) : [],
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          errEl.textContent = data.error || "Publish failed.";
          errEl.style.display = "block";
          pubBtn.textContent = "Publish";
          pubBtn.disabled = false;
          return;
        }
        // Mark article as published
        const saved = savedArticles.find(a => a.id === art.id);
        if (saved) {
          saved.publishedToWP = true;
          saved.wpPostUrl     = data.url || "";
          saved.wpStatus      = data.status || status;
          localStorage.setItem("eureach_articles", JSON.stringify(savedArticles));
        }
        modal.querySelector(".ag-wp-publish-btn").style.display = "none";
        modal.querySelector(".ag-wp-cancel-btn").textContent = "Close";
        successEl.style.display = "block";
        successEl.innerHTML = `✅ ${status === "publish" ? "Published!" : "Saved as draft!"}${data.url ? ` <a href="${esc(data.url)}" target="_blank" rel="noopener" class="ag-wp-post-link">View post →</a>` : ""}`;
      } catch (e) {
        errEl.textContent = "Network error — please try again.";
        errEl.style.display = "block";
        pubBtn.textContent = "Publish";
        pubBtn.disabled = false;
      }
    });
  }

  /* ── init ────────────────────────────────────────────── */
  loadWpStatus();
  render();

})();
