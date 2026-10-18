function t(k,fb){var l=window.euLang?window.euLang():'en';var r=window.EUREACH_T;return(r&&r[l]&&r[l][k])||fb||k;}
const API = window.api;

/* ═══════════════════════════════════════════════════════
   Marketing Creator — marketing.js
   ═══════════════════════════════════════════════════════ */

const MC = {

  state: {
    user: null,
    business: {},
    brand: {},
    brief: {},
    activeTab: 'social',
    activePlatform: 'facebook',
    assets: [],
    generating: false,
    assetLibraryOpen: false,
    savedAssetIds: new Set()
  },

  PLATFORM_CONFIG: {
    social: [
      { id: 'facebook',  label: 'Facebook',  icon: '📘', endpoint: '/api/marketing/generate/facebook' },
      { id: 'instagram', label: 'Instagram', icon: '📸', endpoint: '/api/marketing/generate/instagram' },
      { id: 'tiktok',    label: 'TikTok',    icon: '🎵', endpoint: '/api/marketing/generate/tiktok' },
      { id: 'linkedin',  label: 'LinkedIn',  icon: '💼', endpoint: '/api/marketing/generate/linkedin' },
    ],
    ads: [
      { id: 'meta-ads',    label: 'Meta Ads',    icon: '📢', endpoint: '/api/marketing/generate/meta-ads' },
      { id: 'google-ads',  label: 'Google Ads',  icon: '🔍', endpoint: '/api/marketing/generate/google-ads' },
    ],
    video: [
      { id: 'youtube-short', label: 'YouTube Short', icon: '▶️', endpoint: '/api/marketing/generate/youtube-short' },
      { id: 'video-script',  label: 'Video Script',  icon: '🎬', endpoint: '/api/marketing/generate/video-script' },
    ],
    image: [
      { id: 'image-concept', label: 'Image Concept', icon: '🖼️', endpoint: '/api/marketing/generate/image-concept' },
    ],
    campaign: [
      { id: 'campaign', label: 'Campaign Strategy', icon: '🗺️', endpoint: '/api/marketing/generate/campaign' },
    ],
    article: [],
    orchestrator: []
  },

  // ── Init ─────────────────────────────────────────────

  async init() {
    try {
      const me = await API.get('/api/auth/me');
      if (!me || !me.user) {
        document.getElementById('mc-auth-gate').style.display = '';
        return;
      }
      MC.state.user = me.user;
      MC.state.planLimits = {
        plan:                  me.user.plan || 'expired',
        marketingPostsMax:     me.user.marketingPostsMax     ?? 2,
        marketingCampaignsMax: me.user.marketingCampaignsMax ?? 0,
        creditsMax:            me.user.creditsMax            ?? 150,
      };
      document.getElementById('mc-app').style.display = '';

      // update nav profile
      const btn = document.getElementById('nav-profile-btn');
      if (btn) {
        btn.textContent = (me.user.name || me.user.email || '?')[0].toUpperCase();
        btn.classList.add('logged-in');
      }

      // load everything in parallel
      await Promise.all([
        MC.loadBusinessProfile(),
        MC.loadBrandKit(),
        MC.loadAssets()
      ]);

      // render initial UI
      MC.renderPlatformGrid();
      MC.renderPlanBadge();

      // If navigated from articles.html with an article to convert
      const artTitle   = sessionStorage.getItem('mc_article_title');
      const artContent = sessionStorage.getItem('mc_article_content');
      if (artTitle || artContent) {
        sessionStorage.removeItem('mc_article_title');
        sessionStorage.removeItem('mc_article_content');
        MC.switchTab('article');
        const titleEl   = document.getElementById('brief-article-title');
        const contentEl = document.getElementById('brief-article-content');
        if (titleEl && artTitle)   titleEl.value   = artTitle;
        if (contentEl && artContent) contentEl.value = artContent;
        // scroll to form
        setTimeout(() => { document.getElementById('mc-brief-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 200);
      }
    } catch (err) {
      document.getElementById('mc-auth-gate').style.display = '';
    }
  },

  async loadBusinessProfile() {
    try {
      const data = await API.get('/api/business/profile');
      MC.state.business = data.profile || {};
    } catch(e) {
      MC.state.business = {};
    }
    MC.renderBusinessCard();
  },

  async loadBrandKit() {
    try {
      const data = await API.get('/api/marketing/brand-kit');
      MC.state.brand = data.kit || {};
    } catch(e) {
      MC.state.brand = {};
    }
    MC.renderBrandCard();
  },

  async loadAssets() {
    try {
      const data = await API.get('/api/marketing/assets');
      MC.state.assets = data.assets || [];
    } catch(e) {
      MC.state.assets = [];
    }
    MC.updateAssetBadge();
    MC.renderAssetLibrary();
  },

  updateCredits(left, max) {
    if (left == null) return;
    document.getElementById('nav-credits-val').textContent = left;
    document.getElementById('mc-credits-left').textContent = left;
    if (max != null) {
      document.getElementById('mc-credits-max').textContent = max;
      const pct = max > 0 ? Math.round((left / max) * 100) : 0;
      document.getElementById('mc-credits-bar').style.width = pct + '%';
    }
  },

  // ── Sidebar cards ─────────────────────────────────────

  renderBusinessCard() {
    const el = document.getElementById('mc-business-info');
    const b = MC.state.business;
    if (!b || !b.name) {
      el.innerHTML = `
        <div class="mc-profile-missing">' + t('mc.noProfile','Business profile not set.') + '</div>
        <a href="settings.html" class="mc-profile-link">' + t('mc.addProfile','+ Add profile →') + '</a>
      `;
      return;
    }
    el.innerHTML = `
      <div class="mc-profile-item"><strong>${MC.esc(b.name)}</strong></div>
      ${b.industry ? `<div class="mc-profile-meta">🏷 ${MC.esc(b.industry)}</div>` : ''}
      ${b.location ? `<div class="mc-profile-meta">📍 ${MC.esc(b.location)}</div>` : ''}
      ${b.website  ? `<div class="mc-profile-meta">🌐 ${MC.esc(b.website)}</div>`  : ''}
      <a href="settings.html" class="mc-profile-link">' + t('mc.edit','Edit →') + '</a>
    `;
    // pre-fill brief fields from business profile
    if (b.location) {
      const locField = document.getElementById('brief-location');
      if (locField && !locField.value) locField.value = b.location;
    }
    if (b.name) {
      const whatField = document.getElementById('brief-what');
      if (whatField && !whatField.value) whatField.value = b.name;
    }
  },

  renderBrandCard() {
    const el = document.getElementById('mc-brand-info');
    const k = MC.state.brand;
    if (!k || (!k.slogan && !k.tones && !k.colors)) {
      el.innerHTML = `
        <div class="mc-profile-missing">' + t('mc.noBrandKit','Brand kit not set.') + '</div>
        <a href="settings.html" class="mc-profile-link">' + t('mc.addBrandKit','+ Create brand kit →') + '</a>
      `;
      return;
    }
    let html = '';
    if (k.slogan) html += `<div class="mc-brand-slogan">"${MC.esc(k.slogan)}"</div>`;
    if (k.tones && k.tones.length) {
      html += k.tones.map(t => `<span class="mc-brand-tag">${MC.esc(t)}</span>`).join('');
    } else if (k.tone) {
      html += `<span class="mc-brand-tag">${MC.esc(k.tone)}</span>`;
    }
    if (k.colors && k.colors.length) {
      html += '<div style="margin-top:8px;display:flex;gap:5px;">';
      html += k.colors.map(c => `<span title="${MC.esc(c)}" style="display:inline-block;width:18px;height:18px;border-radius:4px;background:${MC.esc(c)};border:1px solid rgba(255,255,255,0.15)"></span>`).join('');
      html += '</div>';
    }
    el.innerHTML = html || '<div class="mc-profile-missing">' + t('mc.brandKitEmpty','Brand kit empty.') + '</div>';

    // pre-fill tone from brand kit
    if (k.tone) {
      const toneSelect = document.getElementById('brief-tone');
      if (toneSelect) {
        const opts = Array.from(toneSelect.options);
        const match = opts.find(o => o.value.toLowerCase() === k.tone.toLowerCase());
        if (match) toneSelect.value = match.value;
      }
    }
  },

  // ── Tab & Platform ────────────────────────────────────

  switchTab(tab) {
    MC.state.activeTab = tab;
    // Orchestrator tab has its own panel
    const orchPanel = document.getElementById('mc-orchestrator-panel');
    const resultArea = document.getElementById('mc-result-area');
    const briefCard  = document.querySelector('.mc-brief-card');
    const genWrap    = document.querySelector('.mc-generate-wrap');
    const platSec    = document.getElementById('mc-platform-section');
    if (tab === 'orchestrator') {
      // Check if plan allows full campaigns
      const limits = MC.state.planLimits || {};
      if (limits.marketingCampaignsMax === 0) {
        MC.showUpgradeModal(
          'Full Campaign',
          '' + t('mc.upgradeCampaign','Your plan does not include Full Campaign. Upgrade to create complete marketing campaigns.') + ''
        );
        return;
      }
      if (orchPanel)  orchPanel.style.display  = '';
      if (resultArea) resultArea.style.display  = 'none';
      if (genWrap)    genWrap.style.display     = 'none';
      if (platSec)    platSec.style.display     = 'none';
    } else {
      if (orchPanel)  orchPanel.style.display  = 'none';
      if (resultArea) resultArea.style.display  = '';
      if (genWrap)    genWrap.style.display     = '';
    }
    // update tab buttons
    document.querySelectorAll('.mc-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    // show/hide article extra fields
    const artFields = document.getElementById('mc-article-fields');
    if (artFields) artFields.style.display = tab === 'article' ? '' : 'none';
    // update platform grid
    MC.renderPlatformGrid();
    // clear result
    document.getElementById('mc-result-area').innerHTML = '';
    document.getElementById('mc-error-msg').style.display = 'none';
  },

  renderPlatformGrid() {
    const tab = MC.state.activeTab;
    const platforms = MC.PLATFORM_CONFIG[tab] || [];
    const section = document.getElementById('mc-platform-section');
    const grid = document.getElementById('mc-platform-grid');

    if (tab === 'article') {
      section.style.display = 'none';
      return;
    }
    section.style.display = '';

    if (platforms.length === 0) {
      grid.innerHTML = '<span style="font-size:0.82rem;color:var(--muted)">' + t('mc.unifiedCreate','Unified creation') + '</span>';
      return;
    }

    // default to first platform in tab
    if (!platforms.find(p => p.id === MC.state.activePlatform)) {
      MC.state.activePlatform = platforms[0].id;
    }

    grid.innerHTML = platforms.map(p => `
      <button class="mc-platform-btn ${p.id === MC.state.activePlatform ? 'active' : ''}"
              onclick="MC.selectPlatform('${p.id}')">
        <span class="mc-plat-icon">${p.icon}</span>
        <span>${p.label}</span>
      </button>
    `).join('');
  },

  selectPlatform(id) {
    MC.state.activePlatform = id;
    MC.renderPlatformGrid();
    document.getElementById('mc-result-area').innerHTML = '';
    document.getElementById('mc-error-msg').style.display = 'none';
  },

  // ── Brief ─────────────────────────────────────────────

  getBriefFromForm() {
    return {
      what:         document.getElementById('brief-what')?.value.trim() || '',
      product:      document.getElementById('brief-product')?.value.trim() || '',
      benefit:      document.getElementById('brief-benefit')?.value.trim() || '',
      problem:      document.getElementById('brief-problem')?.value.trim() || '',
      objective:    document.getElementById('brief-objective')?.value || '',
      audience:     document.getElementById('brief-audience')?.value.trim() || '',
      location:     document.getElementById('brief-location')?.value.trim() || '',
      offer:        document.getElementById('brief-offer')?.value.trim() || '',
      price:        document.getElementById('brief-price')?.value.trim() || '',
      cta:          document.getElementById('brief-cta')?.value.trim() || '',
      tone:         document.getElementById('brief-tone')?.value || 'Professional',
      language:     document.getElementById('brief-language')?.value || 'Greek',
      instructions: document.getElementById('brief-instructions')?.value.trim() || ''
    };
  },

  // ── Generate ──────────────────────────────────────────

  async generate() {
    if (MC.state.generating) return;

    const brief = MC.getBriefFromForm();
    if (!brief.what && MC.state.activeTab !== 'article') {
      MC.showError('t('mc.fillWhat','Please fill in the "What are you promoting?" field.')');
      return;
    }

    const tab = MC.state.activeTab;
    MC.state.generating = true;
    MC.setGenerating(true);
    MC.hideError();

    try {
      let result, creditsLeft, creditsMax, platform;

      if (tab === 'article') {
        const articleTitle   = document.getElementById('brief-article-title')?.value.trim() || '';
        const articleContent = document.getElementById('brief-article-content')?.value.trim() || '';
        if (!articleTitle && !articleContent) {
          MC.showError('t('mc.fillArticle','Please fill in the article title or content.')');
          MC.state.generating = false;
          MC.setGenerating(false);
          return;
        }
        const res = await API.post('/api/marketing/article-to-campaign', {
          articleTitle, articleContent, brief
        });
        result     = res.result;
        creditsLeft = res.creditsLeft;
        creditsMax  = res.creditsMax;
        platform   = 'article';
      } else {
        const platforms = MC.PLATFORM_CONFIG[tab] || [];
        const platObj = platforms.find(p => p.id === MC.state.activePlatform) || platforms[0];
        if (!platObj) { MC.showError('t('mc.selectPlatform','Please select a platform.')'); MC.state.generating = false; MC.setGenerating(false); return; }

        platform = platObj.id;
        const res = await API.post(platObj.endpoint, { brief, saveToAssets: false });
        result      = res.result;
        creditsLeft = res.creditsLeft;
        creditsMax  = res.creditsMax;
      }

      MC.state.brief = brief;
      MC.updateCredits(creditsLeft, creditsMax);
      MC.showResult(platform, result);

    } catch (err) {
      if (err?.error === 'insufficient_credits' || err?.status === 403) {
        MC.showUpgradeModal('Credits', 'Δεν έχετε αρκετά credits για αυτή την ενέργεια. Αναβαθμίστε το πλάνο σας για περισσότερα credits κάθε μήνα.');
      } else {
        const msg = err?.message || err?.error || 't('mc.genError','An error occurred. Try again.')';
        MC.showError(msg, true);
      }
    } finally {
      MC.state.generating = false;
      MC.setGenerating(false);
    }
  },

  setGenerating(on) {
    const btn     = document.getElementById('mc-generate-btn');
    const label   = document.getElementById('mc-generate-label');
    const spinner = document.getElementById('mc-generate-spinner');
    btn.disabled  = on;
    label.textContent = on ? t('mc.generating','Generating...') : t('mc.generate','✨ Generate');
    spinner.style.display = on ? 'inline-block' : 'none';
  },

  showError(msg, withRetry = false) {
    const el = document.getElementById('mc-error-msg');
    el.innerHTML = `<span>${MC.esc(msg)}</span>${withRetry ? `<button class="mc-error-retry" onclick="MC.generate()">Επανάληψη</button>` : ''}`;
    el.style.display = 'flex';
  },

  hideError() {
    document.getElementById('mc-error-msg').style.display = 'none';
  },

  // ── Render results ────────────────────────────────────

  showResult(platform, result) {
    const area = document.getElementById('mc-result-area');
    if (!result) { area.innerHTML = ''; return; }

    const renderers = {
      facebook:      MC.renderFacebookResult,
      instagram:     MC.renderInstagramResult,
      tiktok:        MC.renderTikTokResult,
      linkedin:      MC.renderLinkedInResult,
      'google-ads':  MC.renderGoogleAdsResult,
      'meta-ads':    MC.renderMetaAdsResult,
      'youtube-short': MC.renderYouTubeShortResult,
      'video-script':  MC.renderVideoScriptResult,
      'image-concept': MC.renderImageConceptResult,
      campaign:        MC.renderCampaignStrategyResult,
      article:         MC.renderCampaignStrategyResult
    };

    const renderer = renderers[platform];
    if (!renderer) {
      area.innerHTML = MC.genericResultCard(platform, JSON.stringify(result, null, 2));
      return;
    }

    const { html, copyText } = renderer(result);
    area.innerHTML = MC.wrapResultCard(platform, html, copyText, result);
    MC.bindVariantTabs(area);
  },

  wrapResultCard(platform, bodyHtml, copyText, result) {
    const cfg = Object.values(MC.PLATFORM_CONFIG).flat().find(p => p.id === platform) || { icon: '📄', label: platform };
    // check for variants
    const hasVariants = result && Array.isArray(result.variants) && result.variants.length > 1;
    const variantTabsHtml = hasVariants ? `
      <div class="mc-variant-tabs">
        ${result.variants.map((_, i) => `
          <button class="mc-variant-tab ${i===0?'active':''}" data-variant="${i}" onclick="MC.switchVariant(this, ${i})">
            ${String.fromCharCode(65+i)}
          </button>`).join('')}
      </div>
    ` : '';

    const safeText = (copyText || '').replace(/`/g, '\\`').replace(/\$/g, '\\$');

    return `
      <div class="mc-result-card">
        <div class="mc-result-header">
          <div class="mc-result-platform">
            <span class="mc-result-platform-icon">${cfg.icon}</span>
            <span>${cfg.label}</span>
          </div>
          <div class="mc-result-actions">
            <button class="mc-result-btn copy" onclick="MC.copyToClipboard(\`${safeText}\`)">
              ' + t('mc.copy','📋 Copy') + '
            </button>
            <button class="mc-result-btn save" id="mc-save-btn" onclick="MC.saveAsset('${platform}', ${JSON.stringify(JSON.stringify(result))})">
              ' + t('mc.save','💾 Save') + '
            </button>
          </div>
        </div>
        ${variantTabsHtml}
        <div class="mc-result-body" id="mc-result-body">
          ${bodyHtml}
        </div>
      </div>
    `;
  },

  bindVariantTabs(area) {
    // tabs are handled inline via onclick; nothing extra needed
  },

  switchVariant(btn, idx) {
    // Update tab active state
    document.querySelectorAll('.mc-variant-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // Show/hide variant panels (idx 0 = primary, idx 1+ = variant sections)
    const card = btn.closest('.mc-result-card');
    if (!card) return;
    if (idx === 0) {
      // Show primary content, hide all variant sections
      const body = card.querySelector('#mc-result-body');
      if (body) body.style.display = '';
      card.querySelectorAll('.mc-variant-sections').forEach(el => el.style.display = 'none');
    } else {
      // Hide primary, show the matching variant section
      const body = card.querySelector('#mc-result-body');
      if (body) body.style.display = 'none';
      // Show the variant sections container
      card.querySelectorAll('.mc-variant-sections').forEach(el => { el.style.display = ''; });
      // Show only the selected variant panel
      card.querySelectorAll('.mc-variant-section').forEach(el => {
        el.style.display = parseInt(el.dataset.variantIdx) === idx ? '' : 'none';
      });
    }
  },

  // ── Platform renderers ────────────────────────────────

  renderFacebookResult(result) {
    const r = result;
    let html = '';
    let copyParts = [];

    if (r.hook) {
      html += `<div class="mc-caption-label">Hook</div><div class="mc-post-block">${MC.nl2br(MC.esc(r.hook))}</div>`;
      copyParts.push('HOOK: ' + r.hook);
    }
    const mainText = r.primary_text || r.post || r.text || '';
    if (mainText) {
      html += `<div class="mc-caption-label">Post</div><div class="mc-post-block">${MC.nl2br(MC.esc(mainText))}</div>`;
      copyParts.push(mainText);
    }
    if (r.headline) {
      html += `<div class="mc-caption-label">Headline</div><div class="mc-post-block" style="font-weight:600">${MC.esc(r.headline)}</div>`;
      copyParts.push('HEADLINE: ' + r.headline);
    }
    if (r.description) {
      html += `<div class="mc-caption-label">Description</div><div class="mc-post-block">${MC.esc(r.description)}</div>`;
    }
    if (r.cta) {
      html += `<div class="mc-caption-label">CTA</div><div class="mc-post-block" style="color:var(--accent)">${MC.esc(r.cta)}</div>`;
      copyParts.push('CTA: ' + r.cta);
    }
    const tags = Array.isArray(r.hashtags) ? r.hashtags.join(' ') : (r.hashtags || '');
    if (tags) {
      html += `<div class="mc-hashtags" style="padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid var(--border)">${MC.esc(tags)}</div>`;
      copyParts.push(tags);
    }
    if (r.visual_concept) {
      html += `<div style="margin-top:12px;font-size:0.78rem;color:var(--muted)">📸 Visual: ${MC.esc(r.visual_concept)}</div>`;
    }

    // Variant panels
    if (Array.isArray(r.variants) && r.variants.length) {
      html += MC._buildVariantPanels(r.variants, 'facebook');
    }

    return { html, copyText: copyParts.join('\n\n') };
  },

  renderInstagramResult(result) {
    const r = result;
    let html = '';
    let copyParts = [];

    const caption = r.caption || r.text || r.post || '';
    const hashtags = r.hashtags || '';
    const hook = r.hook || '';
    const cta = r.cta || '';

    if (hook) {
      html += `<div class="mc-caption-label">Hook</div><div class="mc-post-block">${MC.nl2br(MC.esc(hook))}</div>`;
      copyParts.push(hook);
    }
    if (caption) {
      html += `<div class="mc-caption-label">Caption</div><div class="mc-post-block">${MC.nl2br(MC.esc(caption))}</div>`;
      copyParts.push(caption);
    }
    if (cta) {
      html += `<div class="mc-caption-label">CTA</div><div class="mc-post-block">${MC.nl2br(MC.esc(cta))}</div>`;
      copyParts.push(cta);
    }
    if (hashtags) {
      html += `<div class="mc-caption-label">Hashtags</div><div class="mc-hashtags" style="padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid var(--border)">${MC.esc(hashtags)}</div>`;
      copyParts.push(hashtags);
    }
    // Stories / Reels concepts (from prompt: strings not arrays)
    if (r.reel_concept || r.reels_concepts) {
      const reel = r.reel_concept || (Array.isArray(r.reels_concepts) ? r.reels_concepts[0] : r.reels_concepts) || '';
      if (reel) {
        html += `<div class="mc-caption-label" style="margin-top:12px">🎬 Reel Concept</div><div class="mc-post-block">${MC.nl2br(MC.esc(typeof reel === 'string' ? reel : JSON.stringify(reel)))}</div>`;
      }
    }
    if (r.story_concept || r.stories_ideas) {
      const story = r.story_concept || (Array.isArray(r.stories_ideas) ? r.stories_ideas.join(' / ') : r.stories_ideas) || '';
      if (story) {
        html += `<div class="mc-caption-label" style="margin-top:12px">📖 Story Concept</div><div class="mc-post-block">${MC.nl2br(MC.esc(typeof story === 'string' ? story : JSON.stringify(story)))}</div>`;
      }
    }
    if (r.image_concept) {
      html += `<div style="margin-top:10px;font-size:0.78rem;color:var(--muted)">📸 Image: ${MC.esc(r.image_concept)}</div>`;
    }

    // Variant panels
    if (Array.isArray(r.variants) && r.variants.length) {
      html += MC._buildVariantPanels(r.variants, 'instagram');
    }

    return { html, copyText: copyParts.join('\n\n') };
  },

  renderTikTokResult(result) {
    const r = result;
    let html = '';
    let copyParts = [];

    const hook = r.hook || r.opening_hook || '';
    const scenes = r.scenes || r.script || [];
    const caption = r.caption || '';
    const hashtags = r.hashtags || '';
    const music = r.music_suggestion || r.music || '';

    if (hook) {
      html += `<div class="mc-caption-label">Hook (${r.hook_duration || '0-3s'})</div>
               <div class="mc-post-block">${MC.nl2br(MC.esc(hook))}</div>`;
      copyParts.push('HOOK: ' + hook);
    }

    if (Array.isArray(scenes) && scenes.length) {
      html += `<div class="mc-caption-label" style="margin-top:12px">Script (Scene by Scene)</div>
               <div class="mc-scenes">`;
      scenes.forEach((scene, i) => {
        const text = typeof scene === 'string' ? scene
          : (scene.text || scene.narration || scene.content || scene.action || JSON.stringify(scene));
        const duration = scene.duration || scene.time || '';
        const type = scene.type || scene.visual || '';
        html += `
          <div class="mc-scene-card">
            <div class="mc-scene-num">${i+1}</div>
            <div class="mc-scene-body">
              ${type ? `<div class="mc-scene-label">${MC.esc(type)}</div>` : ''}
              ${MC.nl2br(MC.esc(text))}
              ${duration ? `<div class="mc-scene-duration">⏱ ${MC.esc(duration)}</div>` : ''}
            </div>
          </div>`;
        copyParts.push(`Scene ${i+1}: ${text}`);
      });
      html += '</div>';
    } else if (typeof scenes === 'string' && scenes) {
      html += `<div class="mc-post-block">${MC.nl2br(MC.esc(scenes))}</div>`;
      copyParts.push(scenes);
    }

    if (caption) {
      html += `<div class="mc-caption-label" style="margin-top:12px">Caption</div>
               <div class="mc-post-block">${MC.nl2br(MC.esc(caption))}</div>`;
      copyParts.push('CAPTION: ' + caption);
    }
    if (hashtags) {
      html += `<div class="mc-hashtags" style="margin-top:8px;padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid var(--border)">${MC.esc(hashtags)}</div>`;
      copyParts.push(hashtags);
    }
    if (music) {
      html += `<div style="margin-top:10px;font-size:0.78rem;color:var(--muted)">' + t('mc.music','🎵 Music:') + ' ${MC.esc(music)}</div>`;
    }

    // Variant panels
    if (Array.isArray(r.variants) && r.variants.length) {
      html += MC._buildVariantPanels(r.variants, 'tiktok');
    }

    return { html, copyText: copyParts.join('\n\n') };
  },

  renderLinkedInResult(result) {
    const r = result;
    let html = '';
    let copyParts = [];

    // Prompt returns: hook, body, cta, hashtags, variants
    if (r.hook) {
      html += `<div class="mc-caption-label">Hook</div><div class="mc-post-block">${MC.nl2br(MC.esc(r.hook))}</div>`;
      copyParts.push('HOOK: ' + r.hook);
    }
    const body = r.body || r.post || r.content || r.story || r.insight || '';
    if (body) {
      html += `<div class="mc-caption-label">Post</div><div class="mc-post-block">${MC.nl2br(MC.esc(body))}</div>`;
      copyParts.push(body);
    }
    if (r.cta) {
      html += `<div class="mc-caption-label">CTA</div><div class="mc-post-block" style="color:var(--accent)">${MC.esc(r.cta)}</div>`;
      copyParts.push('CTA: ' + r.cta);
    }
    const tags = Array.isArray(r.hashtags) ? r.hashtags.join(' ') : (r.hashtags || '');
    if (tags) {
      html += `<div class="mc-hashtags" style="padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid var(--border)">${MC.esc(tags)}</div>`;
      copyParts.push(tags);
    }

    if (!html) {
      const fallback = JSON.stringify(r, null, 2);
      html = `<div class="mc-post-block">${MC.nl2br(MC.esc(fallback))}</div>`;
      copyParts.push(fallback);
    }

    // Variant panels
    if (Array.isArray(r.variants) && r.variants.length) {
      html += MC._buildVariantPanels(r.variants, 'linkedin');
    }

    return { html, copyText: copyParts.join('\n\n') };
  },

  // Build hidden variant panels for A/B/C switching
  _buildVariantPanels(variants, platform) {
    if (!variants || !variants.length) return '';
    let html = `<div class="mc-variant-sections">`;
    variants.forEach((v, i) => {
      const label = v.label || `Version ${String.fromCharCode(66 + i)}`;
      const panelHtml = MC._renderVariantPanel(v, platform);
      html += `
        <div class="mc-variant-section" data-variant-idx="${i+1}" style="display:none">
          <div class="mc-variant-section-label">${MC.esc(label)}</div>
          ${panelHtml}
        </div>`;
    });
    html += '</div>';
    return html;
  },

  _renderVariantPanel(variant, platform) {
    if (!variant) return '';
    const v = variant;
    if (platform === 'facebook') {
      const text = v.primary_text || v.post || v.text || '';
      const hook = v.hook || '';
      const cta  = v.cta || '';
      let h = '';
      if (hook) h += `<div class="mc-caption-label">Hook</div><div class="mc-post-block">${MC.nl2br(MC.esc(hook))}</div>`;
      if (text) h += `<div class="mc-caption-label">Post</div><div class="mc-post-block">${MC.nl2br(MC.esc(text))}</div>`;
      if (cta)  h += `<div class="mc-caption-label">CTA</div><div class="mc-post-block" style="color:var(--accent)">${MC.esc(cta)}</div>`;
      return h;
    }
    if (platform === 'instagram') {
      const hook = v.hook || '';
      const cap  = v.caption || v.text || '';
      const cta  = v.cta || '';
      let h = '';
      if (hook) h += `<div class="mc-caption-label">Hook</div><div class="mc-post-block">${MC.nl2br(MC.esc(hook))}</div>`;
      if (cap)  h += `<div class="mc-caption-label">Caption</div><div class="mc-post-block">${MC.nl2br(MC.esc(cap))}</div>`;
      if (cta)  h += `<div class="mc-caption-label">CTA</div><div class="mc-post-block" style="color:var(--accent)">${MC.esc(cta)}</div>`;
      return h;
    }
    if (platform === 'linkedin') {
      const hook = v.hook || '';
      const body = v.body || v.post || v.content || '';
      const cta  = v.cta || '';
      let h = '';
      if (hook) h += `<div class="mc-caption-label">Hook</div><div class="mc-post-block">${MC.nl2br(MC.esc(hook))}</div>`;
      if (body) h += `<div class="mc-caption-label">Post</div><div class="mc-post-block">${MC.nl2br(MC.esc(body))}</div>`;
      if (cta)  h += `<div class="mc-caption-label">CTA</div><div class="mc-post-block" style="color:var(--accent)">${MC.esc(cta)}</div>`;
      return h;
    }
    if (platform === 'tiktok') {
      const hook   = v.hook || v.opening_hook || '';
      const scenes = v.scenes || [];
      let h = '';
      if (hook) h += `<div class="mc-caption-label">Hook</div><div class="mc-post-block">${MC.nl2br(MC.esc(hook))}</div>`;
      if (Array.isArray(scenes) && scenes.length) {
        h += `<div class="mc-caption-label">Script</div><div class="mc-scenes">`;
        scenes.forEach((sc, i) => {
          const text   = typeof sc === 'string' ? sc : (sc.voice_over || sc.on_screen_text || sc.text || sc.narration || JSON.stringify(sc));
          const visual = typeof sc === 'object' ? (sc.visual || '') : '';
          h += `<div class="mc-scene-card"><div class="mc-scene-num">${i+1}</div><div class="mc-scene-body">${visual ? `<div class="mc-scene-label">${MC.esc(visual)}</div>` : ''}${MC.nl2br(MC.esc(text))}</div></div>`;
        });
        h += '</div>';
      }
      return h;
    }
    // Generic
    const fields = ['hook','body','text','post','content','caption','cta'];
    let h = '';
    fields.forEach(f => { if (v[f]) h += `<div class="mc-caption-label">${f}</div><div class="mc-post-block">${MC.nl2br(MC.esc(v[f]))}</div>`; });
    return h || `<div class="mc-post-block">${MC.esc(JSON.stringify(v))}</div>`;
  },

  renderGoogleAdsResult(result) {
    const r = result;
    let html = '';
    let copyParts = [];

    const headlines = r.headlines || r.titles || [];
    const descriptions = r.descriptions || r.desc || [];
    const extensions = r.extensions || r.sitelinks || [];

    if (headlines.length) {
      html += `<div class="mc-ads-section">
        <div class="mc-ads-section-title">Headlines (${headlines.length})</div>`;
      headlines.forEach((h, i) => {
        const text = typeof h === 'string' ? h : (h.text || h.headline || JSON.stringify(h));
        const len = text.length;
        const charClass = len > 30 ? 'warn' : 'ok';
        html += `<div class="mc-ad-headline">
          <span>${MC.esc(text)}</span>
          <span class="mc-ad-chars ${charClass}">${len}/30</span>
        </div>`;
        copyParts.push(`H${i+1}: ${text}`);
      });
      html += '</div>';
    }

    if (descriptions.length) {
      html += `<div class="mc-ads-section">
        <div class="mc-ads-section-title">Descriptions (${descriptions.length})</div>`;
      descriptions.forEach((d, i) => {
        const text = typeof d === 'string' ? d : (d.text || d.description || JSON.stringify(d));
        const len = text.length;
        const charClass = len > 90 ? 'warn' : 'ok';
        html += `<div class="mc-ad-headline">
          <span>${MC.esc(text)}</span>
          <span class="mc-ad-chars ${charClass}">${len}/90</span>
        </div>`;
        copyParts.push(`D${i+1}: ${text}`);
      });
      html += '</div>';
    }

    if (extensions.length) {
      html += `<div class="mc-ads-section">
        <div class="mc-ads-section-title">Extensions / Sitelinks</div>`;
      extensions.forEach(ext => {
        const text = typeof ext === 'string' ? ext : (ext.text || ext.link || JSON.stringify(ext));
        html += `<div class="mc-ad-headline"><span>${MC.esc(text)}</span></div>`;
        copyParts.push(text);
      });
      html += '</div>';
    }

    // Keywords
    if (Array.isArray(r.keywords) && r.keywords.length) {
      html += `<div class="mc-ads-section">
        <div class="mc-ads-section-title">Keywords (${r.keywords.length})</div>
        <div class="mc-keywords-grid">`;
      r.keywords.forEach(kw => {
        html += `<div class="mc-keyword-pill">${MC.esc(typeof kw === 'string' ? kw : JSON.stringify(kw))}</div>`;
      });
      html += `</div></div>`;
      copyParts.push('KEYWORDS:\n' + r.keywords.join(' | '));
    }

    // Search intent + landing page
    if (r.search_intent) {
      html += `<div class="mc-ads-section">
        <div class="mc-ads-section-title">Search Intent</div>
        <div class="mc-post-block" style="font-size:0.85rem">${MC.esc(r.search_intent)}</div>
      </div>`;
      copyParts.push('SEARCH INTENT: ' + r.search_intent);
    }
    if (r.landing_page_suggestion) {
      html += `<div style="margin-top:8px;font-size:0.78rem;color:var(--muted)">🔗 Landing page: ${MC.esc(r.landing_page_suggestion)}</div>`;
      copyParts.push('LANDING PAGE: ' + r.landing_page_suggestion);
    }

    if (!headlines.length && !descriptions.length) {
      const fallback = JSON.stringify(r, null, 2);
      html = `<div class="mc-post-block">${MC.nl2br(MC.esc(fallback))}</div>`;
      copyParts.push(fallback);
    }

    return { html, copyText: copyParts.join('\n') };
  },

  renderMetaAdsResult(result) {
    const r = result;
    let html = '';
    let copyParts = [];

    const hooks = r.hooks || r.hook_variations || (r.hook ? [r.hook] : []);
    const primaryTexts = r.primary_texts || r.copies || r.variations || [];
    const headlines = r.headlines || [];
    const cta = r.cta || r.call_to_action || '';

    if (hooks.length) {
      html += `<div class="mc-ads-section-title">Hooks</div>`;
      hooks.forEach((h, i) => {
        const text = typeof h === 'string' ? h : (h.text || h.hook || JSON.stringify(h));
        html += `<div class="mc-hook-card">
          <div class="mc-hook-label">Hook ${i+1}</div>
          ${MC.nl2br(MC.esc(text))}
        </div>`;
        copyParts.push(`Hook ${i+1}:\n${text}`);
      });
    }

    if (primaryTexts.length) {
      html += `<div class="mc-ads-section-title" style="margin-top:14px">Primary Texts</div>`;
      primaryTexts.forEach((pt, i) => {
        const text  = typeof pt === 'string' ? pt : (pt.text || pt.copy || JSON.stringify(pt));
        const label = typeof pt === 'object' && pt.label ? pt.label : `Variant ${String.fromCharCode(65+i)}`;
        html += `<div class="mc-hook-card">
          <div class="mc-hook-label" style="color:#93c5fd">${MC.esc(label)}</div>
          ${MC.nl2br(MC.esc(text))}
        </div>`;
        copyParts.push(`${label}:\n${text}`);
      });
    }

    if (headlines.length) {
      html += `<div class="mc-ads-section-title" style="margin-top:14px">Headlines</div>`;
      headlines.forEach((h, i) => {
        const text = typeof h === 'string' ? h : (h.text || JSON.stringify(h));
        html += `<div class="mc-ad-headline"><span>${MC.esc(text)}</span><span class="mc-ad-chars ${text.length>40?'warn':'ok'}">${text.length}/40</span></div>`;
        copyParts.push(text);
      });
    }

    // Descriptions
    const descriptions = r.descriptions || [];
    if (descriptions.length) {
      html += `<div class="mc-ads-section-title" style="margin-top:14px">Descriptions</div>`;
      descriptions.forEach((d, i) => {
        const text = typeof d === 'string' ? d : (d.text || d.description || JSON.stringify(d));
        html += `<div class="mc-ad-headline">
          <span>${MC.esc(text)}</span>
          <span class="mc-ad-chars ${text.length > 90 ? 'warn' : 'ok'}">${text.length}/90</span>
        </div>`;
        copyParts.push(`Desc ${i+1}: ${text}`);
      });
    }

    // CTA options
    const ctaOptions = r.cta_options || (r.cta ? [r.cta] : []);
    if (ctaOptions.length) {
      const ctaText = ctaOptions.join(' / ');
      html += `<div style="margin-top:12px;font-size:0.82rem;color:var(--muted)">CTA: <strong style="color:var(--accent)">${MC.esc(ctaText)}</strong></div>`;
      copyParts.push('CTA: ' + ctaText);
    }

    // Visual concept + audience
    if (r.visual_concept) {
      html += `<div class="mc-ads-section" style="margin-top:14px">
        <div class="mc-ads-section-title">Visual Concept</div>
        <div class="mc-post-block" style="font-size:0.85rem">${MC.esc(r.visual_concept)}</div>
      </div>`;
      copyParts.push('VISUAL: ' + r.visual_concept);
    }
    if (r.audience_suggestion) {
      html += `<div style="margin-top:8px;font-size:0.78rem;color:var(--muted)">🎯 Audience: ${MC.esc(r.audience_suggestion)}</div>`;
      copyParts.push('AUDIENCE: ' + r.audience_suggestion);
    }

    if (!hooks.length && !primaryTexts.length) {
      const fallback = JSON.stringify(r, null, 2);
      html = `<div class="mc-post-block">${MC.nl2br(MC.esc(fallback))}</div>`;
      copyParts.push(fallback);
    }

    return { html, copyText: copyParts.join('\n\n') };
  },

  renderYouTubeShortResult(result) {
    return MC.renderTikTokResult(result); // same structure
  },

  renderVideoScriptResult(result) {
    const r = result;
    let html = '';
    let copyParts = [];

    const title = r.title || r.video_title || '';
    const intro = r.intro || r.opening || '';
    const scenes = r.scenes || r.sections || r.script || [];
    const outro = r.outro || r.closing || '';
    const hook = r.hook || '';

    if (title) {
      html += `<div class="mc-caption-label">Τίτλος</div><div class="mc-post-block"><strong>${MC.esc(title)}</strong></div>`;
      copyParts.push('ΤΙΤΛΟΣ: ' + title);
    }
    if (hook) {
      html += `<div class="mc-caption-label" style="margin-top:12px">Hook</div><div class="mc-post-block">${MC.nl2br(MC.esc(hook))}</div>`;
      copyParts.push('HOOK: ' + hook);
    }
    if (intro) {
      html += `<div class="mc-caption-label" style="margin-top:12px">Εισαγωγή</div><div class="mc-post-block">${MC.nl2br(MC.esc(intro))}</div>`;
      copyParts.push('ΕΙΣΑΓΩΓΗ: ' + intro);
    }

    if (Array.isArray(scenes) && scenes.length) {
      html += `<div class="mc-caption-label" style="margin-top:12px">Script</div><div class="mc-scenes">`;
      scenes.forEach((scene, i) => {
        const text = typeof scene === 'string' ? scene
          : (scene.narration || scene.text || scene.content || scene.script || JSON.stringify(scene));
        const visual = scene.visual || scene.camera || '';
        const duration = scene.duration || scene.time || '';
        html += `
          <div class="mc-scene-card">
            <div class="mc-scene-num">${i+1}</div>
            <div class="mc-scene-body">
              ${visual ? `<div class="mc-scene-label">${MC.esc(visual)}</div>` : ''}
              ${MC.nl2br(MC.esc(text))}
              ${duration ? `<div class="mc-scene-duration">⏱ ${MC.esc(duration)}</div>` : ''}
            </div>
          </div>`;
        copyParts.push(`Scene ${i+1}: ${text}`);
      });
      html += '</div>';
    }

    if (outro) {
      html += `<div class="mc-caption-label" style="margin-top:12px">Outro / CTA</div><div class="mc-post-block">${MC.nl2br(MC.esc(outro))}</div>`;
      copyParts.push('OUTRO: ' + outro);
    }

    if (!html) {
      const fallback = JSON.stringify(r, null, 2);
      html = `<div class="mc-post-block">${MC.nl2br(MC.esc(fallback))}</div>`;
      copyParts.push(fallback);
    }

    return { html, copyText: copyParts.join('\n\n') };
  },

  renderImageConceptResult(result) {
    const r = result;
    let html = '';
    let copyParts = [];

    const formats = r.formats || r.concepts || [];
    const square     = r.square     || r['1:1']  || formats.find(f => f.ratio === '1:1' || f.format === 'square') || {};
    const portrait   = r.portrait   || r['4:5']  || formats.find(f => f.ratio === '4:5' || f.format === 'portrait') || {};
    const story      = r.story      || r['9:16'] || formats.find(f => f.ratio === '9:16' || f.format === 'story' || f.format === 'reel') || {};

    const getPrompt = (obj) => obj.prompt || obj.ai_prompt || obj.description || obj.concept || '';
    const getTheme  = (obj) => obj.theme || obj.visual_theme || obj.style || '';

    const formatCards = [
      { ratio: '1:1',  emoji: '⬜', label: 'Square (Feed)', obj: square },
      { ratio: '4:5',  emoji: '📱', label: 'Portrait (4:5)', obj: portrait },
      { ratio: '9:16', emoji: '📲', label: 'Story / Reel (9:16)', obj: story },
    ];

    // If we have direct formats array
    const displayCards = formats.length >= 3
      ? formats.slice(0,3).map((f, i) => ({
          ratio: f.ratio || f.format || ['1:1','4:5','9:16'][i],
          emoji: ['⬜','📱','📲'][i],
          label: f.label || f.format || ['Square','Portrait','Story'][i],
          obj: f
        }))
      : formatCards;

    html += '<div class="mc-image-formats">';
    displayCards.forEach(card => {
      const prompt = getPrompt(card.obj);
      const theme  = getTheme(card.obj);
      if (!prompt && !theme) return;
      const safePrompt = (prompt || theme).replace(/`/g, '\\`').replace(/\$/g, '\\$');
      html += `
        <div class="mc-image-format-card">
          <div class="mc-image-ratio">${card.emoji}</div>
          <div class="mc-image-format-label">${card.ratio} — ${card.label}</div>
          ${theme ? `<div class="mc-image-format-label" style="color:#a78bfa">${MC.esc(theme)}</div>` : ''}
          <div class="mc-image-prompt">${MC.esc(prompt || theme)}</div>
          <button class="mc-image-copy-btn" onclick="MC.copyToClipboard(\`${safePrompt}\`)">📋 Copy Prompt</button>
        </div>`;
      copyParts.push(`${card.ratio}:\n${prompt || theme}`);
    });
    html += '</div>';

    // general concept
    const concept = r.concept || r.main_concept || r.overall_concept || '';
    if (concept) {
      html += `<div class="mc-caption-label" style="margin-top:14px">Γενική ιδέα</div>
               <div class="mc-post-block">${MC.nl2br(MC.esc(concept))}</div>`;
      copyParts.unshift('CONCEPT: ' + concept);
    }

    if (!html.includes('mc-image-format-card') && !concept) {
      const fallback = JSON.stringify(r, null, 2);
      html = `<div class="mc-post-block">${MC.nl2br(MC.esc(fallback))}</div>`;
      copyParts.push(fallback);
    }

    return { html, copyText: copyParts.join('\n\n---\n\n') };
  },

  renderCampaignStrategyResult(result) {
    const r = result;
    let html = '';
    let copyParts = [];

    const name = r.campaign_name || r.name || '';
    if (name) {
      html += `<div class="mc-campaign-name">${MC.esc(name)}</div>`;
      copyParts.push('Campaign: ' + name);
    }

    const coreFields = [
      { key: 'campaign_objective', label: 'Στόχος' },
      { key: 'core_message',       label: 'Κύριο μήνυμα' },
      { key: 'unique_angle',       label: 'Μοναδική γωνία' },
      { key: 'emotional_hook',     label: 'Emotional hook' },
      { key: 'offer',              label: 'Προσφορά' },
      { key: 'cta',                label: 'CTA' },
      { key: 'tone',               label: 'Τόνος' },
    ];
    coreFields.forEach(f => {
      const val = r[f.key];
      if (!val || (typeof val === 'string' && !val.trim())) return;
      html += `<div class="mc-campaign-block">
        <div class="mc-campaign-block-title">${f.label}</div>
        <div class="mc-campaign-text">${MC.nl2br(MC.esc(val))}</div>
      </div>`;
      copyParts.push(f.label + ':\n' + val);
    });

    const aud = r.audience || r.target_audience;
    if (aud && typeof aud === 'object') {
      html += `<div class="mc-campaign-block">
        <div class="mc-campaign-block-title">Κοινό-στόχος</div>
        <div class="mc-campaign-phases">`;
      const audFields = [
        { key: 'primary',    label: 'Πρωτεύον κοινό' },
        { key: 'pain_point', label: 'Πρόβλημα' },
        { key: 'desire',     label: 'Επιθυμία' },
        { key: 'objection',  label: 'Αντίρρηση' },
      ];
      audFields.forEach(af => {
        if (!aud[af.key]) return;
        html += `<div class="mc-phase-card">
          <div class="mc-phase-icon">👤</div>
          <div class="mc-phase-content">
            <div class="mc-phase-name">${af.label}</div>
            <div class="mc-phase-desc">${MC.nl2br(MC.esc(aud[af.key]))}</div>
          </div>
        </div>`;
      });
      html += '</div></div>';
      copyParts.push('Audience: ' + JSON.stringify(aud));
    } else if (typeof aud === 'string' && aud) {
      html += `<div class="mc-campaign-block">
        <div class="mc-campaign-block-title">Κοινό</div>
        <div class="mc-campaign-text">${MC.nl2br(MC.esc(aud))}</div>
      </div>`;
      copyParts.push('Audience: ' + aud);
    }

    const keyMsgs = r.key_messages || r.key_message_list || [];
    if (Array.isArray(keyMsgs) && keyMsgs.length) {
      html += `<div class="mc-campaign-block">
        <div class="mc-campaign-block-title">Key Messages</div>`;
      keyMsgs.forEach((msg, i) => {
        html += `<div class="mc-post-block" style="margin-bottom:6px">${String(i+1)}. ${MC.nl2br(MC.esc(String(msg)))}</div>`;
      });
      html += '</div>';
      copyParts.push('Key Messages:\n' + keyMsgs.map((m, i) => (i+1) + '. ' + m).join('\n'));
    }

    const contentPlan = r.content_plan || r.channel_plan || {};
    const planEntries = Object.entries(contentPlan).filter(([k, v]) => v && typeof v === 'string');
    if (planEntries.length) {
      const platIcons = { facebook:'👥', instagram:'📸', tiktok:'🎵', linkedin:'💼', google_ads:'🔍', video:'🎬', youtube:'▶️' };
      html += `<div class="mc-campaign-block">
        <div class="mc-campaign-block-title">Content Plan</div>
        <div class="mc-campaign-phases">`;
      planEntries.forEach(([platform, desc]) => {
        const icon = platIcons[platform] || '📢';
        html += `<div class="mc-phase-card">
          <div class="mc-phase-icon">${icon}</div>
          <div class="mc-phase-content">
            <div class="mc-phase-name" style="text-transform:capitalize">${platform.replace('_',' ')}</div>
            <div class="mc-phase-desc">${MC.nl2br(MC.esc(desc))}</div>
          </div>
        </div>`;
        copyParts.push(platform.toUpperCase() + ': ' + desc);
      });
      html += '</div></div>';
    }

    const phases = r.phases || r.campaign_phases || r.stages || [];
    if (phases.length) {
      const phaseIcons = ['🚀','📈','🔄','🏁','⚡','🎯'];
      html += `<div class="mc-campaign-block">
        <div class="mc-campaign-block-title">Φάσεις</div>
        <div class="mc-campaign-phases">`;
      phases.forEach((ph, i) => {
        const pname = ph.name || ph.phase || ph.title || ('Phase ' + (i+1));
        const desc  = ph.description || ph.desc || ph.tactics || (typeof ph === 'string' ? ph : '');
        html += `<div class="mc-phase-card">
          <div class="mc-phase-icon">${phaseIcons[i % phaseIcons.length]}</div>
          <div class="mc-phase-content">
            <div class="mc-phase-name">${MC.esc(pname)}</div>
            ${desc ? `<div class="mc-phase-desc">${MC.nl2br(MC.esc(typeof desc === 'string' ? desc : JSON.stringify(desc)))}</div>` : ''}
          </div>
        </div>`;
      });
      html += '</div></div>';
    }

    if (!html) {
      const fallback = JSON.stringify(r, null, 2);
      html = `<div class="mc-post-block">${MC.nl2br(MC.esc(fallback))}</div>`;
      copyParts.push(fallback);
    }

    return { html, copyText: copyParts.join('\n\n') };
  },

  
  // ── Orchestrator ──────────────────────────────────────

  ORCH_PLATFORMS: [
    { id: 'campaign',      label: 'Campaign Strategy', icon: '🗺️', endpoint: '/api/marketing/generate/campaign' },
    { id: 'facebook',      label: 'Facebook',          icon: '📘', endpoint: '/api/marketing/generate/facebook' },
    { id: 'instagram',     label: 'Instagram',         icon: '📸', endpoint: '/api/marketing/generate/instagram' },
    { id: 'tiktok',        label: 'TikTok',            icon: '🎵', endpoint: '/api/marketing/generate/tiktok' },
    { id: 'linkedin',      label: 'LinkedIn',          icon: '💼', endpoint: '/api/marketing/generate/linkedin' },
    { id: 'meta-ads',      label: 'Meta Ads',          icon: '📢', endpoint: '/api/marketing/generate/meta-ads' },
    { id: 'google-ads',    label: 'Google Ads',        icon: '🔍', endpoint: '/api/marketing/generate/google-ads' },
    { id: 'youtube-short', label: 'YouTube Short',     icon: '▶️', endpoint: '/api/marketing/generate/youtube-short' },
    { id: 'video-script',  label: 'Video Script',      icon: '🎬', endpoint: '/api/marketing/generate/video-script' },
    { id: 'image-concept', label: 'Image Concept',     icon: '🖼️', endpoint: '/api/marketing/generate/image-concept' },
  ],

  orchResults: {},   // { platformId: result }
  orchErrors:  {},   // { platformId: errorMessage }

  async orchestrate() {
    const brief = MC.getBriefFromForm();
    if (!brief.what) {
      const errEl = document.getElementById('mc-orch-error');
      errEl.textContent = 't('mc.fillWhat','Please fill in the "What are you promoting?" field.')';
      errEl.style.display = '';
      return;
    }
    document.getElementById('mc-orch-error').style.display = 'none';

    // Reset state
    MC.orchResults = {};
    MC.orchErrors  = {};

    // Disable button
    const startBtn   = document.getElementById('mc-orch-start-btn');
    const startLabel = document.getElementById('mc-orch-start-label');
    const spinner    = document.getElementById('mc-orch-spinner');
    startBtn.disabled  = true;
    startLabel.textContent = 'Δημιουργία...';
    spinner.style.display  = 'inline-block';

    // Show progress panel
    const progressEl = document.getElementById('mc-orch-progress');
    progressEl.style.display = '';
    document.getElementById('mc-orch-results').innerHTML = '';
    document.getElementById('mc-orch-download-wrap').style.display = 'none';

    // Render step list
    const stepsEl = document.getElementById('mc-orch-steps');
    stepsEl.innerHTML = MC.ORCH_PLATFORMS.map(p =>
      `<div class="mc-orch-step" id="orch-step-${p.id}">
        <span class="mc-orch-step-icon">${p.icon}</span>
        <span class="mc-orch-step-label">${p.label}</span>
        <span class="mc-orch-step-status pending" id="orch-status-${p.id}">⏳</span>
      </div>`
    ).join('');

    // Scroll to progress
    progressEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

    let successCount = 0;

    // Generate each platform sequentially
    for (const plat of MC.ORCH_PLATFORMS) {
      MC.orchSetStatus(plat.id, 'generating');
      try {
        const res = await API.post(plat.endpoint, { brief, saveToAssets: false });
        MC.orchResults[plat.id] = res.result;
        MC.updateCredits(res.creditsLeft, res.creditsMax);
        MC.orchSetStatus(plat.id, 'done');
        successCount++;
        // Render result card immediately
        MC.orchAppendResult(plat, res.result);
      } catch (err) {
        const msg = err?.message || err?.error || 'Σφάλμα';
        MC.orchErrors[plat.id] = msg;
        MC.orchSetStatus(plat.id, 'error', msg);
      }
    }

    // Done
    startBtn.disabled  = false;
    startLabel.textContent = '🔄 Δημιουργία ξανά';
    spinner.style.display  = 'none';

    if (successCount > 0) {
      document.getElementById('mc-orch-download-wrap').style.display = 'flex';
    }
  },

  orchSetStatus(platformId, state, errorMsg) {
    const el = document.getElementById(`orch-status-${platformId}`);
    if (!el) return;
    el.className = `mc-orch-step-status ${state}`;
    if (state === 'generating') {
      el.innerHTML = '<span class="mc-orch-spin">⟳</span>';
    } else if (state === 'done') {
      el.textContent = '✅';
    } else if (state === 'error') {
      el.textContent = '❌';
      el.title = errorMsg || 'Σφάλμα';
    }
  },

  orchAppendResult(plat, result) {
    const resultsEl = document.getElementById('mc-orch-results');
    const renderers = {
      facebook:        MC.renderFacebookResult,
      instagram:       MC.renderInstagramResult,
      tiktok:          MC.renderTikTokResult,
      linkedin:        MC.renderLinkedInResult,
      'google-ads':    MC.renderGoogleAdsResult,
      'meta-ads':      MC.renderMetaAdsResult,
      'youtube-short': MC.renderYouTubeShortResult,
      'video-script':  MC.renderVideoScriptResult,
      'image-concept': MC.renderImageConceptResult,
      campaign:        MC.renderCampaignStrategyResult,
    };
    const renderer = renderers[plat.id];
    let bodyHtml = '';
    let copyText = '';
    if (renderer) {
      try {
        const rendered = renderer(result);
        bodyHtml = rendered.html;
        copyText = rendered.copyText;
      } catch (e) {
        bodyHtml = `<div class="mc-post-block">${MC.esc(JSON.stringify(result, null, 2))}</div>`;
      }
    } else {
      bodyHtml = `<div class="mc-post-block">${MC.esc(JSON.stringify(result, null, 2))}</div>`;
    }

    const safeCopy = (copyText || '').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    const card = document.createElement('div');
    card.className = 'mc-orch-result-card';
    card.innerHTML = `
      <div class="mc-orch-result-header" onclick="MC.orchToggle(this)">
        <span class="mc-orch-result-icon">${plat.icon}</span>
        <span class="mc-orch-result-label">${plat.label}</span>
        <span class="mc-orch-result-chevron">▾</span>
        <button class="mc-result-btn copy" style="margin-left:auto;margin-right:8px" onclick="event.stopPropagation();MC.copyToClipboard(\`${safeCopy}\`)">' + t('mc.copy','📋 Copy') + '</button>
        <button class="mc-result-btn save" onclick="event.stopPropagation();MC.saveAsset('${plat.id}', ${JSON.stringify(JSON.stringify(result))})">' + t('mc.save','💾 Save') + '</button>
      </div>
      <div class="mc-orch-result-body">
        ${bodyHtml}
      </div>`;
    resultsEl.appendChild(card);
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  orchToggle(header) {
    const card = header.closest('.mc-orch-result-card');
    card.classList.toggle('collapsed');
  },

  downloadCampaign() {
    const brief = MC.state.brief || {};
    const lines = [`ΠΛΗΡΗΣ ΚΑΜΠΑΝΙΑ — eureach.eu\n${'='.repeat(50)}\n`];
    lines.push(`Προϊόν/Υπηρεσία: ${brief.what || '—'}`);
    lines.push(`Κοινό: ${brief.audience || '—'}`);
    lines.push(`Γλώσσα: ${brief.language || 'Greek'}`);
    lines.push(`\nΔημιουργήθηκε: ${new Date().toLocaleString(window.euLang&&window.euLang()==='el'?'el-GR':window.euLang&&window.euLang()==='de'?'de-DE':'en-GB')}\n`);

    for (const plat of MC.ORCH_PLATFORMS) {
      const result = MC.orchResults[plat.id];
      if (!result) continue;
      lines.push(`\n${'─'.repeat(50)}`);
      lines.push(`${plat.icon} ${plat.label.toUpperCase()}`);
      lines.push(`${'─'.repeat(50)}`);
      // Use plain-text copy from renderer
      const renderers = {
        facebook: MC.renderFacebookResult, instagram: MC.renderInstagramResult,
        tiktok: MC.renderTikTokResult, linkedin: MC.renderLinkedInResult,
        'google-ads': MC.renderGoogleAdsResult, 'meta-ads': MC.renderMetaAdsResult,
        'youtube-short': MC.renderYouTubeShortResult, 'video-script': MC.renderVideoScriptResult,
        'image-concept': MC.renderImageConceptResult, campaign: MC.renderCampaignStrategyResult,
      };
      try {
        const { copyText } = renderers[plat.id](result);
        lines.push(copyText || JSON.stringify(result, null, 2));
      } catch {
        lines.push(JSON.stringify(result, null, 2));
      }
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `campaign-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  },

  saveAllAssets() {
    let count = 0;
    for (const plat of MC.ORCH_PLATFORMS) {
      const result = MC.orchResults[plat.id];
      if (result && !MC.state.savedAssetIds.has(plat.id + '-orch')) {
        MC.saveAsset(plat.id, JSON.stringify(result));
        MC.state.savedAssetIds.add(plat.id + '-orch');
        count++;
      }
    }
    MC.showToast(`${count} assets αποθηκεύτηκαν ✓`);
  },


  // ── Plan gates & upgrade modal ────────────────────────

  renderPlanBadge() {
    const limits  = MC.state.planLimits || {};
    const plan    = limits.plan || 'expired';
    const badgeEl = document.getElementById('mc-plan-badge');
    const upEl    = document.getElementById('mc-upgrade-link');
    if (!badgeEl) return;

    const labels = { expired: 'Expired', trial: 'Trial', beginners: 'Beginners', paid: 'Pro', starter: 'Starter', pro: 'Pro', agency: 'Agency' };
    const colors = { expired: '#94a3b8', trial: '#f59e0b', beginners: '#22c55e', paid: '#7c3aed', starter: '#7c3aed', pro: '#7c3aed', agency: '#10b981' };
    const label = labels[plan] || plan;
    const color = colors[plan] || '#94a3b8';

    badgeEl.innerHTML = `<span style="color:${color};font-weight:700;font-size:0.8rem">${label}</span>`;

    if (upEl) {
      upEl.style.display = (plan === 'trial' || plan === 'expired') ? '' : 'none';
    }

    // Lock orchestrator tab visually for non-paid plans
    if (limits.marketingCampaignsMax === 0) {
      document.querySelectorAll('.mc-tab-btn').forEach(btn => {
        if (btn.dataset.tab === 'orchestrator') {
          btn.innerHTML = '🎯 Full Campaign <span style="font-size:0.7rem;opacity:0.6">🔒</span>';
        }
      });
    }
  },

  showUpgradeModal(featureName, reason) {
    const modal = document.getElementById('mc-upgrade-modal');
    if (!modal) return;
    document.getElementById('mc-upgrade-title').textContent = featureName + ' — Αναβαθμίστε το πλάνο σας';
    document.getElementById('mc-upgrade-reason').textContent = reason || '';
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  },

  closeUpgradeModal() {
    const modal = document.getElementById('mc-upgrade-modal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
  },

  genericResultCard(platform, text) {
    return `<div class="mc-result-card">
      <div class="mc-result-header">
        <div class="mc-result-platform"><span>${platform}</span></div>
      </div>
      <div class="mc-result-body">
        <div class="mc-post-block">${MC.nl2br(MC.esc(text))}</div>
      </div>
    </div>`;
  },

  // ── Copy ──────────────────────────────────────────────

  copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      MC.showToast('✓ Αντιγράφηκε!');
    }).catch(() => {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      MC.showToast('✓ Αντιγράφηκε!');
    });
  },

  showToast(msg) {
    const existing = document.querySelector('.mc-toast');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = 'mc-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  },

  // ── Save asset ────────────────────────────────────────

  async saveAsset(platform, resultJson) {
    const btn = document.getElementById('mc-save-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Αποθήκευση...';
    }
    try {
      const result = JSON.parse(resultJson);
      const brief = MC.state.brief;
      const tab = MC.state.activeTab;
      const platCfg = Object.values(MC.PLATFORM_CONFIG).flat().find(p => p.id === platform);

      await API.post(platCfg ? platCfg.endpoint : '/api/marketing/generate/' + platform, {
        brief,
        saveToAssets: true,
        campaignId: null
      });

      if (btn) {
        btn.classList.add('saved');
        btn.textContent = '✓ Αποθηκεύτηκε';
      }
      MC.showToast('✓ Αποθηκεύτηκε στη βιβλιοθήκη!');
      await MC.loadAssets();

    } catch(err) {
      MC.showToast('⚠ Σφάλμα αποθήκευσης');
      if (btn) {
        btn.disabled = false;
        btn.textContent = '' + t('mc.save','💾 Save') + '';
      }
    }
  },

  // ── Delete asset ──────────────────────────────────────

  async deleteAsset(id) {
    if (!confirm('Διαγραφή αυτού του asset;')) return;
    try {
      await API.delete('/api/marketing/assets/' + id);
      MC.state.assets = MC.state.assets.filter(a => a.id !== id && a._id !== id);
      MC.updateAssetBadge();
      MC.renderAssetLibrary();
      MC.showToast('✓ Διαγράφηκε');
    } catch(e) {
      MC.showToast('⚠ Σφάλμα διαγραφής');
    }
  },

  // ── Asset Library ─────────────────────────────────────

  updateAssetBadge() {
    const badge = document.getElementById('mc-asset-count');
    if (badge) badge.textContent = MC.state.assets.length;
  },

  toggleAssetLibrary() {
    MC.state.assetLibraryOpen = !MC.state.assetLibraryOpen;
    const body   = document.getElementById('mc-asset-body');
    const toggle = document.getElementById('mc-asset-toggle');
    if (body)   body.classList.toggle('open', MC.state.assetLibraryOpen);
    if (toggle) toggle.classList.toggle('open', MC.state.assetLibraryOpen);
  },

  renderAssetLibrary() {
    const grid = document.getElementById('mc-asset-grid');
    if (!grid) return;

    const assets = MC.state.assets;
    if (!assets.length) {
      grid.innerHTML = '<div class="mc-asset-empty">Δεν υπάρχουν αποθηκευμένα assets. Δημιουργήστε περιεχόμενο και πατήστε "Αποθήκευση".</div>';
      return;
    }

    const platformLabels = {
      facebook: { icon: '📘', label: 'Facebook' },
      instagram: { icon: '📸', label: 'Instagram' },
      tiktok: { icon: '🎵', label: 'TikTok' },
      linkedin: { icon: '💼', label: 'LinkedIn' },
      'meta-ads': { icon: '📢', label: 'Meta Ads' },
      'google-ads': { icon: '🔍', label: 'Google Ads' },
      'youtube-short': { icon: '▶️', label: 'YouTube Short' },
      'video-script': { icon: '🎬', label: 'Video Script' },
      'image-concept': { icon: '🖼️', label: 'Image Concept' },
      campaign: { icon: '🗺️', label: 'Campaign' },
      article: { icon: '📝', label: 'Article Campaign' }
    };

    grid.innerHTML = assets.map(asset => {
      const id = asset.id || asset._id || '';
      const plat = (asset.platform || '').toLowerCase().replace(/ /g, '-');
      const cfg = platformLabels[plat] || { icon: '📄', label: plat || 'Unknown' };
      const dateStr = asset.createdAt ? new Date(asset.createdAt).toLocaleDateString(window.euLang&&window.euLang()==='el'?'el-GR':window.euLang&&window.euLang()==='de'?'de-DE':'en-GB') : '';

      // get preview text
      let preview = '';
      const r = asset.result || asset.data || asset;
      if (typeof r === 'object') {
        preview = r.post || r.caption || r.hook || r.summary || r.concept || r.title || JSON.stringify(r).slice(0, 100);
      } else {
        preview = String(r).slice(0, 150);
      }

      const safeCopy = MC.esc(preview).replace(/"/g, '&quot;');

      return `
        <div class="mc-asset-card">
          <div class="mc-asset-card-top">
            <div class="mc-asset-platform">${cfg.icon} ${cfg.label}</div>
            ${dateStr ? `<div class="mc-asset-date">${dateStr}</div>` : ''}
          </div>
          <div class="mc-asset-preview">${MC.esc(preview)}</div>
          <div class="mc-asset-actions">
            <button class="mc-asset-btn" onclick="MC.copyToClipboard(${JSON.stringify(preview)})">📋 Copy</button>
            <button class="mc-asset-btn del" onclick="MC.deleteAsset(${JSON.stringify(id)})">🗑 Διαγραφή</button>
          </div>
        </div>
      `;
    }).join('');
  },

  // ── Utilities ─────────────────────────────────────────

  esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  nl2br(str) {
    return String(str).replace(/\n/g, '<br>');
  }

};

// ── Bootstrap ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await MC.init();
  // Deep-link from start modal: ?tab=social&platform=facebook etc.
  const p = new URLSearchParams(location.search);
  const tab = p.get('tab');
  const platform = p.get('platform');
  if (tab) {
    if (platform) MC.state.activePlatform = platform;
    MC.switchTab(tab);
  }
});
