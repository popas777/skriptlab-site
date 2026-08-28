(function () {
  'use strict';

  const PROFILE_META = Object.freeze({
    story: Object.freeze({ ratio: '9:16', label: 'Pystyvideo', channels: 'TikTok, Reels, Shorts' }),
    square: Object.freeze({ ratio: '1:1', label: 'Neliö', channels: 'Instagram feed' }),
    landscape: Object.freeze({ ratio: '16:9', label: 'Vaaka', channels: 'YouTube, verkkosivu' }),
  });
  const CONCEPT_META = Object.freeze({
    presenter: Object.freeze({ label: 'Esittelijä kertoo', source: 'Esittelijän kuva ja markkinointitekstit valmiina' }),
    plot: Object.freeze({ label: 'Juonitraileri', source: 'Kansikuva ja markkinointitekstit valmiina' }),
    cover: Object.freeze({ label: 'Kansi herää', source: 'Kansikuva ja kirjan tiedot valmiina' }),
  });
  const TONE_META = Object.freeze({
    cinematic: Object.freeze({
      label: 'Elokuvallinen',
      hint: 'cinematic, literary, atmospheric, restrained contrast, smooth deliberate camera movement',
    }),
    warm: Object.freeze({
      label: 'Lämmin',
      hint: 'warm, intimate, welcoming, soft natural light, gentle and human camera movement',
    }),
    bold: Object.freeze({
      label: 'Rohkea',
      hint: 'bold, energetic, high-impact composition, confident camera movement, crisp visual rhythm',
    }),
    minimal: Object.freeze({
      label: 'Pelkistetty',
      hint: 'minimal, quiet, graphic, uncluttered, precise composition, almost still camera movement',
    }),
  });
  const ACTIVE_STATES = new Set(['queued', 'preparing', 'generating_clips', 'assembling']);
  const TERMINAL_STATES = new Set(['succeeded', 'failed', 'cancelled']);
  const JOB_LABELS = Object.freeze({
    queued: 'Video on jonossa',
    preparing: 'Valmistellaan videota',
    generating_clips: 'Luodaan videota',
    assembling: 'Koostetaan videota',
    succeeded: 'Video on valmis',
    failed: 'Videon luonti epäonnistui',
    cancelled: 'Videon luonti keskeytettiin',
  });
  const SESSION_PREFIX = 'skriptlab_shorts_session_v1_';

  const elements = {};
  const state = {
    projectId: null,
    context: null,
    presets: null,
    sourceImages: [],
    presenterAsset: null,
    presenterPreviewUrl: '',
    shotlist: null,
    estimate: null,
    job: null,
    stage: 'compose',
    busy: false,
    pollTimer: null,
    pollController: null,
    timingTimer: null,
    previewTimer: null,
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function collectElements() {
    [
      'shorts-open-video', 'shorts-back-label', 'shorts-project-name', 'shorts-steps',
      'shorts-notice', 'shorts-notice-text', 'shorts-notice-action', 'shorts-compose',
      'presenter-source', 'presenter-source-file', 'presenter-source-drop',
      'presenter-source-preview', 'presenter-source-label', 'presenter-source-help',
      'presenter-consent', 'shorts-preview-frame', 'shorts-preview-media',
      'shorts-preview-image', 'shorts-preview-fallback', 'shorts-preview-overlay',
      'shorts-preview-title', 'shorts-preview-author', 'shorts-text-enabled',
      'shorts-voiceover-control', 'shorts-voiceover', 'shorts-voiceover-help',
      'shorts-provider-note', 'shorts-review', 'shorts-review-panel', 'shorts-review-title',
      'shorts-review-preview', 'shorts-review-image', 'shorts-review-fallback',
      'shorts-review-copy', 'shorts-review-cover-title', 'shorts-review-cover-author',
      'shorts-preview-play', 'shorts-player', 'shorts-summary-concept',
      'shorts-summary-tone', 'shorts-summary-profile', 'shorts-summary-text',
      'shorts-source-ready', 'shorts-cost', 'shorts-cost-note', 'shorts-job-progress',
      'shorts-job-label', 'shorts-job-elapsed', 'shorts-progress-track',
      'shorts-progress-value', 'shorts-progress-note', 'shorts-result-actions',
      'shorts-download', 'shorts-retry', 'shorts-edit', 'shorts-cancel',
      'shorts-render', 'shorts-render-label',
    ].forEach((id) => {
      elements[id] = byId(id);
    });
  }

  function projectIdFromPage() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('project') || localStorage.getItem('skriptlab_active_project_id') || '';
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  function jsonBody(payload) {
    return {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    };
  }

  async function api(path, options = {}) {
    const response = await window.SkriptLabAuth.fetch(path, options);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = payload?.detail;
      const message = Array.isArray(detail)
        ? detail.map((item) => item?.msg || String(item)).join(' ')
        : String(detail || payload?.message || `Pyyntö epäonnistui (${response.status}).`);
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function mediaUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^(?:https?:\/\/|data:|blob:)/i.test(raw)) return raw;
    return apiUrl(raw.startsWith('/') ? raw : `/${raw}`);
  }

  function setNotice(message, mode = 'ready', actionLabel = '') {
    const notice = elements['shorts-notice'];
    notice.hidden = !message;
    notice.className = `shorts-notice is-${mode}`;
    elements['shorts-notice-text'].textContent = message || '';
    const action = elements['shorts-notice-action'];
    action.hidden = !actionLabel;
    action.textContent = actionLabel || 'Yritä uudelleen';
  }

  function setBusy(busy, message = '') {
    state.busy = Boolean(busy);
    if (message) setNotice(message, busy ? 'loading' : 'ready');
    syncControls();
  }

  function selectedValue(name, fallback) {
    return document.querySelector(`input[name="${name}"]:checked`)?.value || fallback;
  }

  function selection() {
    return {
      concept: selectedValue('shorts-concept', 'plot'),
      tone: selectedValue('shorts-tone', 'cinematic'),
      profile: selectedValue('shorts-profile', 'story'),
      textEnabled: Boolean(elements['shorts-text-enabled'].checked),
      voiceover: Boolean(elements['shorts-voiceover'].checked && !elements['shorts-voiceover'].disabled),
    };
  }

  function applyRadioValue(name, value) {
    const input = document.querySelector(`input[name="${name}"][value="${String(value || '').replace(/"/g, '\\"')}"]`);
    if (input) input.checked = true;
  }

  function sessionKey() {
    return state.projectId ? `${SESSION_PREFIX}${state.projectId}` : '';
  }

  function readSession() {
    const key = sessionKey();
    if (!key) return null;
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_error) {
      return null;
    }
  }

  function persistSession() {
    const key = sessionKey();
    if (!key) return;
    const selected = selection();
    localStorage.setItem(key, JSON.stringify({
      ...selected,
      presenterReference: state.presenterAsset?.reference || null,
      shotlistId: state.shotlist?.id || null,
      jobId: state.job?.id || null,
      savedAt: new Date().toISOString(),
    }));
  }

  function clearTimers() {
    window.clearTimeout(state.pollTimer);
    state.pollTimer = null;
    if (state.pollController) state.pollController.abort();
    state.pollController = null;
    window.clearInterval(state.timingTimer);
    state.timingTimer = null;
    window.clearTimeout(state.previewTimer);
    state.previewTimer = null;
  }

  function normalizeSourceImage(raw) {
    const id = Number(raw?.id || 0) || null;
    const reference = String(raw?.reference || (id ? `project_asset:${id}` : '')).trim();
    if (!reference) return null;
    return {
      id,
      reference,
      title: String(raw?.title || '').trim(),
      assetType: String(raw?.asset_type || '').trim(),
      url: String(raw?.url || raw?.data_url || raw?.content_data_url || '').trim(),
    };
  }

  function isCoverSource(asset) {
    const type = String(asset?.assetType || '').toLowerCase();
    return asset?.reference === 'cover' || type === 'cover_image' || type === 'full_cover_image';
  }

  function normalizeSourceImages(context) {
    const result = [];
    const seen = new Set();
    (Array.isArray(context?.source_images) ? context.source_images : []).forEach((raw) => {
      const image = normalizeSourceImage(raw);
      if (image && !seen.has(image.reference)) {
        seen.add(image.reference);
        result.push(image);
      }
    });
    const cover = context?.cover || null;
    const coverId = Number(cover?.id || 0) || null;
    const coverUrl = String(cover?.url || cover?.data_url || cover?.content_data_url || '').trim();
    const existingCover = result.find((asset) => (coverId && asset.id === coverId) || isCoverSource(asset));
    if (existingCover) {
      if (!existingCover.url) existingCover.url = coverUrl;
      if (!existingCover.assetType) existingCover.assetType = 'cover_image';
    } else if (coverId || coverUrl) {
      result.unshift({
        id: coverId,
        reference: coverId ? `project_asset:${coverId}` : 'cover',
        title: String(cover?.title || 'Kansi'),
        assetType: 'cover_image',
        url: coverUrl,
      });
    }
    return result;
  }

  function coverSource() {
    return state.sourceImages.find(isCoverSource) || null;
  }

  function sourceForSelection(selected = selection()) {
    return selected.concept === 'presenter' ? state.presenterAsset : coverSource();
  }

  function aiVideoAvailable() {
    return Boolean(
      state.presets?.provider?.ai_video_available
      && Number(state.presets?.max_ai_clips ?? 0) > 0,
    );
  }

  function projectCopy() {
    const project = state.context?.project || {};
    const marketing = state.context?.marketing || {};
    return {
      title: String(project.title || 'Kirjan nimi').trim() || 'Kirjan nimi',
      author: String(project.author || '').trim(),
      tagline: String(marketing.tagline || marketing.short || '').trim(),
    };
  }

  function truncate(value, limit) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text.length <= limit) return text;
    return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
  }

  function overlayForSelection(selected = selection()) {
    if (!selected.textEnabled) {
      return { title: null, subtitle: null, quote: null, cta: null, logo: null, position: 'bottom' };
    }
    const copy = projectCopy();
    if (selected.concept === 'plot') {
      return {
        title: truncate(copy.title, 80) || null,
        subtitle: truncate(copy.tagline || copy.author, 120) || null,
        quote: null,
        cta: 'Tutustu kirjaan',
        logo: null,
        position: 'bottom',
      };
    }
    return {
      title: truncate(copy.title, 80) || null,
      subtitle: truncate(copy.author, 100) || null,
      quote: null,
      cta: truncate(copy.tagline || 'Tutustu kirjaan', 120) || null,
      logo: null,
      position: selected.concept === 'presenter' ? 'bottom' : 'center',
    };
  }

  function motionPromptForSelection(selected = selection()) {
    const tone = TONE_META[selected.tone]?.hint || TONE_META.cinematic.hint;
    const profile = PROFILE_META[selected.profile] || PROFILE_META.story;
    const common = `Visual direction: ${tone}. Keep the important subject safe within a ${profile.ratio} composition. `;
    if (selected.concept === 'presenter') {
      return `${common}Single continuous shot from the provided still image with no cuts. The adult presenter keeps the physical book clearly visible at chest height, looks toward the camera, makes one small natural welcoming gesture, and gently turns the book toward the lens. Preserve the presenter's face, identity, body, clothing, hands, the physical book, cover artwork, and every existing letter exactly. Keep the presenter's lips closed: no talking, lip sync, dialogue, narration, singing, or vocals. Use subtle natural movement only. End with the book facing the camera. Add no people, objects, captions, logos, watermarks, or readable text.`;
    }
    if (selected.concept === 'cover') {
      return `${common}Single continuous premium product shot with no cuts. Keep the supplied book cover as the exact unchanged front face of a physical book. Add a very slow camera push and restrained depth, then give only an already printed fictional illustration a subtle natural movement within the artwork. Preserve the cover layout, artwork, and all existing lettering exactly. Add no people, objects, captions, logos, watermarks, or readable text. End on a calm steady close-up.`;
    }
    return `${common}Single continuous cinematic book-trailer shot with no cuts. Start from the supplied unchanged cover and make a slow, confident push into its illustrated atmosphere using subtle parallax, light, weather, or environmental motion that is already implied by the artwork. Preserve the physical cover, composition, illustration, and every existing letter exactly. Do not invent plot events, people, faces, objects, logos, captions, watermarks, or readable text. End on a compelling steady detail that feels like a brief spoiler-free teaser.`;
  }

  function styleHintForSelection(selected = selection()) {
    const concept = CONCEPT_META[selected.concept]?.label || CONCEPT_META.plot.label;
    const tone = TONE_META[selected.tone]?.label || TONE_META.cinematic.label;
    const profile = PROFILE_META[selected.profile] || PROFILE_META.story;
    return truncate(`Shorts-studio · ${concept} · ${tone} · ${profile.label} ${profile.ratio} · yksi 8 sekunnin kohtaus`, 500);
  }

  function selectedVoiceoverAsset() {
    if (!selection().voiceover) return 'none';
    return String(state.context?.voiceovers?.[0]?.id || 'none');
  }

  function currentPreviewSource() {
    const selected = selection();
    const source = sourceForSelection(selected);
    return state.presenterPreviewUrl && selected.concept === 'presenter'
      ? state.presenterPreviewUrl
      : mediaUrl(source?.url);
  }

  function setImage(element, fallback, source, alt) {
    if (source) {
      if (element.dataset.src !== source) {
        element.src = source;
        element.dataset.src = source;
      }
      element.alt = alt;
      element.hidden = false;
      fallback.hidden = true;
    } else {
      element.removeAttribute('src');
      element.removeAttribute('data-src');
      element.hidden = true;
      fallback.hidden = false;
    }
  }

  function updateStepState(activeStep) {
    const order = ['idea', 'style', 'publish'];
    const activeIndex = Math.max(0, order.indexOf(activeStep));
    elements['shorts-steps'].querySelectorAll('li').forEach((item, index) => {
      item.classList.toggle('is-active', index === activeIndex);
      item.classList.toggle('is-complete', index < activeIndex || state.stage === 'review');
      if (index === activeIndex) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
  }

  function renderSelection() {
    const selected = selection();
    const profile = PROFILE_META[selected.profile] || PROFILE_META.story;
    const copy = projectCopy();
    const previewSource = currentPreviewSource();
    const presenter = selected.concept === 'presenter';

    elements['presenter-source'].hidden = !presenter;
    ['shorts-preview-frame', 'shorts-review-preview'].forEach((id) => {
      const target = elements[id];
      target.classList.remove('profile-story', 'profile-square', 'profile-landscape');
      target.classList.add(`profile-${selected.profile}`);
    });

    setImage(
      elements['shorts-preview-image'],
      elements['shorts-preview-fallback'],
      previewSource,
      presenter ? 'Esittelijän kuvan esikatselu' : `Kirjan ${copy.title} kannen esikatselu`,
    );
    setImage(
      elements['shorts-review-image'],
      elements['shorts-review-fallback'],
      previewSource,
      presenter ? 'Esittelijän kuvan esikatselu' : `Kirjan ${copy.title} kannen esikatselu`,
    );

    elements['shorts-preview-title'].textContent = copy.title;
    elements['shorts-preview-author'].textContent = copy.author || 'Tekijä';
    elements['shorts-review-cover-title'].textContent = copy.title;
    elements['shorts-review-cover-author'].textContent = copy.author || 'Tekijä';
    elements['shorts-preview-overlay'].hidden = !selected.textEnabled;
    elements['shorts-review-copy'].hidden = !selected.textEnabled;
    elements['shorts-summary-concept'].textContent = CONCEPT_META[selected.concept]?.label || CONCEPT_META.plot.label;
    elements['shorts-summary-tone'].textContent = TONE_META[selected.tone]?.label || TONE_META.cinematic.label;
    elements['shorts-summary-profile'].textContent = `${profile.label} · ${profile.channels}`;
    elements['shorts-summary-text'].textContent = selected.textEnabled ? 'Päällä' : 'Pois';
    elements['shorts-source-ready'].lastChild.textContent = ` ${CONCEPT_META[selected.concept]?.source || CONCEPT_META.plot.source}`;
    syncControls();
  }

  function renderContext() {
    const project = state.context?.project || {};
    const copy = projectCopy();
    elements['shorts-project-name'].textContent = project.id
      ? `${copy.title}${copy.author ? ` · ${copy.author}` : ''}`
      : 'Valitse projekti SkriptLabin työtilasta';

    const voiceovers = Array.isArray(state.context?.voiceovers) ? state.context.voiceovers : [];
    const voiceover = voiceovers[0];
    elements['shorts-voiceover'].disabled = !voiceover;
    elements['shorts-voiceover-control'].classList.toggle('is-disabled', !voiceover);
    elements['shorts-voiceover-help'].textContent = voiceover
      ? `${voiceover.label || 'Valmis voiceover'} · ${Number(voiceover.duration_s || 0)} s`
      : 'Ei valmista enintään 35 s voiceoveria';
    if (!voiceover) elements['shorts-voiceover'].checked = false;

    const provider = state.presets?.provider || {};
    const providerName = provider.effective === 'veo'
      ? 'Gemini Veo'
      : provider.effective === 'omni'
        ? 'Gemini Omni'
        : provider.effective === 'higgsfield'
          ? 'Higgsfield'
          : 'paikallinen kuva-animointi';
    elements['shorts-provider-note'].textContent = aiVideoAvailable()
      ? `AI-liike käytössä · automaattinen valinta: ${providerName}. Kuvalähde lähetetään valitulle videopalvelulle vasta luontivaiheessa.`
      : 'Paikallinen kuva-animointi käytössä · kuvalähdettä ei lähetetä ulkoiseen videopalveluun.';
    renderSelection();
  }

  function presenterIsReady() {
    const selected = selection();
    return selected.concept !== 'presenter'
      || Boolean(state.presenterAsset?.reference && elements['presenter-consent'].checked);
  }

  function syncControls() {
    const jobActive = ACTIVE_STATES.has(state.job?.state);
    const retryable = ['failed', 'cancelled'].includes(state.job?.state);
    const projectReady = Boolean(state.projectId && state.context && state.presets);
    elements['shorts-review'].disabled = !projectReady || !presenterIsReady() || state.busy || jobActive;
    elements['shorts-render'].disabled = !state.shotlist?.id
      || (!state.estimate && !retryable)
      || state.busy
      || jobActive
      || state.job?.state === 'succeeded';
    elements['shorts-edit'].disabled = state.busy || jobActive;
    elements['shorts-cancel'].hidden = !jobActive;
    elements['shorts-retry'].hidden = !['failed', 'cancelled'].includes(state.job?.state);
  }

  async function uploadPresenterSource(file) {
    if (!file || !state.projectId || state.busy) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setNotice('Valitse PNG-, JPG- tai WEBP-kuva.', 'error');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setNotice('Kuvan enimmäiskoko on 15 Mt.', 'error');
      return;
    }
    if (state.presenterPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(state.presenterPreviewUrl);
    state.presenterPreviewUrl = URL.createObjectURL(file);
    elements['presenter-source-preview'].style.backgroundImage = `url("${state.presenterPreviewUrl.replace(/"/g, '%22')}")`;
    elements['presenter-source-preview'].classList.add('has-image');
    elements['presenter-source-label'].textContent = file.name;
    elements['presenter-source-help'].textContent = 'Kuvaa tallennetaan turvallisesti projektiin…';
    renderSelection();
    setBusy(true, 'Tallennetaan esittelijän kuvaa projektiin…');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('title', 'Shorts-studion esittelijäkuva');
      const payload = await api(`/api/video/projects/${encodeURIComponent(state.projectId)}/source-images`, {
        method: 'POST',
        body: form,
      });
      const asset = normalizeSourceImage(payload);
      if (!asset) throw new Error('Palvelin ei palauttanut tallennettua kuvaa.');
      state.presenterAsset = asset;
      state.sourceImages = [asset, ...state.sourceImages.filter((item) => item.reference !== asset.reference)];
      elements['presenter-source-help'].textContent = 'Kuva on valmis shortsin luontiin.';
      setNotice('Esittelijän kuva on valmis. Vahvista vielä käyttöoikeus.', 'ready');
      persistSession();
    } catch (error) {
      state.presenterAsset = null;
      elements['presenter-source-help'].textContent = 'Kuvan tallennus epäonnistui. Valitse kuva uudelleen.';
      setNotice(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function buildEditableShotlist(raw, selected = selection()) {
    const source = sourceForSelection(selected);
    const useAi = Boolean(source?.reference && aiVideoAvailable());
    const kind = source?.reference ? (useAi ? 'ai_motion' : 'kenburns') : 'card';
    const originalShot = Array.isArray(raw?.shots) ? raw.shots[0] : null;
    const voiceoverAsset = selectedVoiceoverAsset();
    return {
      project_id: state.projectId,
      schema_version: Number(raw?.schema_version || 1),
      target_duration_s: 8,
      aspect_ratios: [PROFILE_META[selected.profile].ratio],
      language: String(raw?.language || 'fi'),
      style_hint: styleHintForSelection(selected),
      shots: [{
        id: String(originalShot?.id || 'shorts_1'),
        kind,
        source_asset: kind === 'card' ? null : source.reference,
        duration_s: 8,
        motion_prompt: kind === 'card'
          ? 'Hold one clean, restrained literary title card for eight seconds with no generated imagery.'
          : motionPromptForSelection(selected),
        motion_preset: kind === 'ai_motion'
          ? (selected.tone === 'bold' ? 'dolly_in' : selected.tone === 'minimal' ? 'slow_pan_right' : 'dolly_in')
          : kind === 'kenburns' ? 'zoom_in' : null,
        model_name: null,
        model_provider: null,
        motion_strength: selected.tone === 'bold' ? 0.7 : selected.tone === 'minimal' ? 0.28 : 0.48,
        zoom: kind === 'kenburns'
          ? { from: 1, to: selected.tone === 'bold' ? 1.25 : 1.14, focus: 'center' }
          : null,
        overlay: overlayForSelection(selected),
      }],
      audio: {
        voiceover_asset: voiceoverAsset,
        music: raw?.audio?.music || { asset: null, gain_db: -18, duck_under_voice: true },
        subtitles: {
          enabled: selected.voiceover && selected.textEnabled,
          language: 'fi',
          source: 'voiceover_transcript',
        },
      },
      source_checksum: String(raw?.source_checksum || state.context?.source_checksum || ''),
    };
  }

  async function estimateShotlist() {
    if (!state.shotlist?.id) return null;
    const selected = selection();
    const shot = state.shotlist.shots?.[0];
    state.estimate = await api('/api/video/jobs/estimate', {
      method: 'POST',
      ...jsonBody({
        shotlist_id: state.shotlist.id,
        tier: 'final',
        profiles: [selected.profile],
        no_ai: shot?.kind !== 'ai_motion',
      }),
    });
    renderEstimate();
    persistSession();
    return state.estimate;
  }

  function renderEstimate() {
    const amount = Number(state.estimate?.estimated_cost_eur ?? state.estimate?.cost_eur);
    if (!Number.isFinite(amount)) {
      elements['shorts-cost'].textContent = '—';
      elements['shorts-cost-note'].textContent = 'Kustannusarviota ei ole vielä saatavilla.';
      return;
    }
    elements['shorts-cost'].textContent = `${amount.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
    elements['shorts-cost-note'].textContent = amount > 0
      ? 'Arvio perustuu valittuun videomalliin. Sinulta pyydetään vahvistus ennen maksullista työtä.'
      : 'Paikallinen kuva-animointi ei käytä maksullista videomallia.';
  }

  async function prepareReview(event) {
    event?.preventDefault();
    if (!state.projectId || state.busy) return;
    const selected = selection();
    if (selected.concept === 'presenter' && !state.presenterAsset?.reference) {
      setNotice('Lisää ensin esittelijän kuva.', 'error');
      elements['presenter-source'].scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (selected.concept === 'presenter' && !elements['presenter-consent'].checked) {
      setNotice('Vahvista, että sinulla on lupa käyttää kuvan henkilöä.', 'error');
      elements['presenter-consent'].focus();
      return;
    }

    setBusy(true, 'Valmistellaan 8 sekunnin shortsia…');
    try {
      const source = sourceForSelection(selected);
      const initial = await api('/api/video/shotlists', {
        method: 'POST',
        ...jsonBody({
          project_id: state.projectId,
          target_duration_s: 8,
          aspect_ratios: [PROFILE_META[selected.profile].ratio],
          language: 'fi',
          style_hint: styleHintForSelection(selected),
          ai_clip_count: source?.reference && aiVideoAvailable() ? 1 : 0,
          subtitles_enabled: selected.voiceover && selected.textEnabled,
          voiceover_mode: selectedVoiceoverAsset(),
        }),
      });
      if (!initial?.id) throw new Error('Shortsin suunnitelmaa ei voitu tallentaa.');
      const editable = buildEditableShotlist(initial, selected);
      state.shotlist = await api(`/api/video/shotlists/${encodeURIComponent(initial.id)}`, {
        method: 'PUT',
        ...jsonBody(editable),
      });
      state.job = null;
      await estimateShotlist();
      showReview();
      setNotice('Shortsin suunnitelma on valmis tarkistettavaksi.', 'ready');
    } catch (error) {
      setNotice(error.message, 'error', 'Yritä uudelleen');
    } finally {
      setBusy(false);
    }
  }

  function showCompose() {
    if (ACTIVE_STATES.has(state.job?.state)) return;
    state.stage = 'compose';
    elements['shorts-compose'].hidden = false;
    elements['shorts-review-panel'].hidden = true;
    elements['shorts-back-label'].textContent = 'Videostudio';
    elements['shorts-open-video'].setAttribute('aria-label', 'Avaa Videostudio');
    updateStepState('idea');
    renderSelection();
    if (state.context) setNotice('Muokkaa ideaa, tunnelmaa tai julkaisumuotoa ja tarkista uusi versio.', 'ready');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showReview() {
    state.stage = 'review';
    elements['shorts-compose'].hidden = true;
    elements['shorts-review-panel'].hidden = false;
    elements['shorts-back-label'].textContent = 'Muokkaa';
    elements['shorts-open-video'].setAttribute('aria-label', 'Muokkaa valintoja');
    updateStepState('publish');
    renderSelection();
    renderEstimate();
    renderJob();
    persistSession();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function activeJobProgress(job) {
    const explicit = Number(job?.progress_percent);
    if (Number.isFinite(explicit)) return Math.max(0, Math.min(100, Math.round(explicit)));
    if (job?.state === 'queued') return 4;
    if (job?.state === 'preparing') return 14;
    if (job?.state === 'generating_clips') return 48;
    if (job?.state === 'assembling') return 84;
    if (job?.state === 'succeeded') return 100;
    return 0;
  }

  function jobStartedAtMs(job) {
    const raw = job?.started_at || job?.created_at;
    const parsed = raw ? Date.parse(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : Date.now();
  }

  function formatElapsed(ms) {
    const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function updateElapsed() {
    if (!state.job || !ACTIVE_STATES.has(state.job.state)) return;
    elements['shorts-job-elapsed'].textContent = formatElapsed(Date.now() - jobStartedAtMs(state.job));
  }

  function syncTiming() {
    window.clearInterval(state.timingTimer);
    state.timingTimer = null;
    if (!ACTIVE_STATES.has(state.job?.state)) return;
    updateElapsed();
    state.timingTimer = window.setInterval(updateElapsed, 1000);
  }

  function renderJob() {
    const job = state.job;
    const active = ACTIVE_STATES.has(job?.state);
    const progress = activeJobProgress(job);
    elements['shorts-job-progress'].hidden = !job || (!active && job.state !== 'failed' && job.state !== 'cancelled');
    elements['shorts-progress-track'].setAttribute('aria-valuenow', String(progress));
    elements['shorts-progress-value'].style.width = `${progress}%`;
    elements['shorts-job-label'].textContent = `${JOB_LABELS[job?.state] || 'Videota luodaan'}${active ? ` · ${progress} %` : ''}`;
    elements['shorts-progress-note'].textContent = job?.state === 'failed'
      ? (job.error_message || 'Voit yrittää turvallisesti uudelleen.')
      : job?.state === 'cancelled'
        ? 'Kuvakäsikirjoitus säilyi ja voit yrittää uudelleen.'
        : 'Voit jättää tämän näkymän auki.';
    elements['shorts-render-label'].textContent = active
      ? 'Videota luodaan…'
      : job?.state === 'succeeded'
        ? 'Video valmis'
        : ['failed', 'cancelled'].includes(job?.state) ? 'Yritä uudelleen' : 'Luo 8 s video';

    const output = (Array.isArray(job?.outputs) ? job.outputs : []).find((item) => (
      String(item?.profile || '') === selection().profile
    )) || job?.outputs?.[0];
    const ready = job?.state === 'succeeded' && output?.url;
    elements['shorts-result-actions'].hidden = !ready && !['failed', 'cancelled'].includes(job?.state);
    elements['shorts-download'].hidden = !ready;
    elements['shorts-retry'].hidden = !['failed', 'cancelled'].includes(job?.state);
    if (ready) {
      const url = mediaUrl(output.url);
      if (elements['shorts-player'].dataset.src !== url) {
        elements['shorts-player'].src = url;
        elements['shorts-player'].dataset.src = url;
      }
      elements['shorts-player'].hidden = false;
      elements['shorts-review-preview'].hidden = true;
      elements['shorts-download'].href = mediaUrl(output.download_url || output.url);
      elements['shorts-download'].download = output.filename || `skriptlab-shortsi-${selection().profile}.mp4`;
      setNotice('Shortsi on valmis ladattavaksi.', 'ready');
    } else {
      elements['shorts-player'].hidden = true;
      elements['shorts-review-preview'].hidden = false;
      if (job?.state === 'failed') {
        setNotice(job.error_message || 'Videon luonti epäonnistui. Voit yrittää turvallisesti uudelleen.', 'error');
      } else if (job?.state === 'cancelled') {
        setNotice('Videon luonti keskeytettiin. Suunnitelma säilyi.', 'ready');
      } else if (active) {
        setNotice(`${JOB_LABELS[job.state] || 'Videota luodaan'} · ${progress} %`, 'loading');
      }
    }
    syncTiming();
    syncControls();
  }

  async function startJob() {
    if (!state.shotlist?.id || !state.estimate || state.busy || ACTIVE_STATES.has(state.job?.state)) return;
    const amount = Number(state.estimate?.estimated_cost_eur ?? state.estimate?.cost_eur ?? 0);
    const confirmed = amount <= 0 || window.confirm(
      `Videon arvioitu hinta on ${amount.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €. ${String(state.presets?.provider_data_notice || '')} Aloitetaanko luonti?`,
    );
    if (!confirmed) return;
    setBusy(true, 'Käynnistetään videon luontia…');
    try {
      state.job = await api('/api/video/jobs', {
        method: 'POST',
        ...jsonBody({
          shotlist_id: state.shotlist.id,
          tier: 'final',
          profiles: [selection().profile],
          no_ai: state.shotlist.shots?.[0]?.kind !== 'ai_motion',
          confirmed_cost: true,
          confirmed_cost_eur: Number(amount.toFixed(2)),
        }),
      });
      persistSession();
      renderJob();
      startPolling();
    } catch (error) {
      setNotice(error.message, 'error', 'Yritä uudelleen');
    } finally {
      setBusy(false);
    }
  }

  function startPolling() {
    window.clearTimeout(state.pollTimer);
    state.pollTimer = null;
    if (!state.job?.id || TERMINAL_STATES.has(state.job.state)) return;
    state.pollTimer = window.setTimeout(pollJob, 1200);
  }

  async function pollJob() {
    if (!state.job?.id) return;
    const jobId = String(state.job.id);
    const controller = new AbortController();
    state.pollController = controller;
    const abortTimer = window.setTimeout(() => controller.abort(), 12000);
    try {
      const next = await api(`/api/video/jobs/${encodeURIComponent(jobId)}`, { signal: controller.signal });
      if (state.pollController !== controller || String(state.job?.id || '') !== jobId) return;
      state.job = next;
      persistSession();
      renderJob();
      if (!TERMINAL_STATES.has(next.state)) startPolling();
    } catch (error) {
      if (state.pollController !== controller) return;
      setNotice(
        error.name === 'AbortError'
          ? 'Tilakysely aikakatkaistiin. Videotyö voi jatkua taustalla; yritetään uudelleen.'
          : `Työn tilaa ei saatu päivitettyä: ${error.message}`,
        error.status ? 'error' : 'loading',
      );
      state.pollTimer = window.setTimeout(pollJob, 5000);
    } finally {
      window.clearTimeout(abortTimer);
      if (state.pollController === controller) state.pollController = null;
    }
  }

  async function cancelJob() {
    if (!state.job?.id || !ACTIVE_STATES.has(state.job.state)) return;
    if (!window.confirm('Keskeytetäänkö videon luonti? Jo videopalvelulle lähetetty työ voi silti valmistua ja tulla veloitetuksi.')) return;
    setBusy(true, 'Keskeytetään videotyötä…');
    try {
      state.job = await api(`/api/video/jobs/${encodeURIComponent(state.job.id)}/cancel`, { method: 'POST' });
      persistSession();
      renderJob();
      setNotice('Videon luonti keskeytettiin. Suunnitelma säilyi.', 'ready');
    } catch (error) {
      setNotice(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function retryJob() {
    if (!state.job?.id || !['failed', 'cancelled'].includes(state.job.state) || state.busy) return;
    setBusy(true, 'Tarkistetaan uudelleenyrityksen hinta…');
    try {
      const estimate = await api(`/api/video/jobs/${encodeURIComponent(state.job.id)}/retry/estimate`, { method: 'POST' });
      const amount = Number(estimate?.estimated_cost_eur ?? 0);
      const confirmed = amount <= 0 || window.confirm(
        `Uudelleenyrityksen arvioitu hinta on ${amount.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €. Aloitetaanko uudelleen?`,
      );
      if (!confirmed) return;
      state.job = await api(`/api/video/jobs/${encodeURIComponent(state.job.id)}/retry`, {
        method: 'POST',
        ...jsonBody({ confirmed_cost: true, confirmed_cost_eur: Number(amount.toFixed(2)) }),
      });
      persistSession();
      renderJob();
      startPolling();
    } catch (error) {
      setNotice(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function animateStaticPreview() {
    const preview = elements['shorts-review-preview'];
    window.clearTimeout(state.previewTimer);
    preview.classList.remove('is-animating');
    void preview.offsetWidth;
    preview.classList.add('is-animating');
    state.previewTimer = window.setTimeout(() => preview.classList.remove('is-animating'), 8100);
  }

  async function restoreSession() {
    const saved = readSession();
    if (!saved) return false;
    applyRadioValue('shorts-concept', saved.concept);
    applyRadioValue('shorts-tone', saved.tone);
    applyRadioValue('shorts-profile', saved.profile);
    elements['shorts-text-enabled'].checked = saved.textEnabled !== false;
    if (!elements['shorts-voiceover'].disabled) elements['shorts-voiceover'].checked = Boolean(saved.voiceover);
    if (saved.presenterReference) {
      state.presenterAsset = state.sourceImages.find((asset) => asset.reference === saved.presenterReference) || null;
    }
    renderSelection();

    try {
      if (saved.shotlistId) {
        state.shotlist = await api(`/api/video/shotlists/${encodeURIComponent(saved.shotlistId)}`);
      }
      if (saved.jobId) {
        state.job = await api(`/api/video/jobs/${encodeURIComponent(saved.jobId)}`);
      }
    } catch (error) {
      if (error.status !== 404) setNotice(`Aiemman shortsin palautus epäonnistui: ${error.message}`, 'error');
      state.shotlist = null;
      state.job = null;
      return false;
    }
    if (!state.shotlist) return false;
    if (state.job) {
      state.estimate = {
        estimated_cost_eur: Number(state.job.estimated_cost_eur ?? state.job.cost_estimate_eur ?? 0),
      };
    } else {
      await estimateShotlist().catch(() => null);
    }
    showReview();
    if (state.job && !TERMINAL_STATES.has(state.job.state)) startPolling();
    return true;
  }

  async function loadWorkspace() {
    clearTimers();
    if (state.presenterPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(state.presenterPreviewUrl);
    state.presenterPreviewUrl = '';
    elements['presenter-source-preview'].style.backgroundImage = '';
    elements['presenter-source-preview'].classList.remove('has-image');
    elements['presenter-source-label'].textContent = 'Valitse kuva';
    elements['presenter-source-help'].textContent = 'Kuva lähetetään valitulle videopalvelulle vasta videon luonnissa.';
    elements['presenter-consent'].checked = false;
    state.projectId = projectIdFromPage();
    state.context = null;
    state.presets = null;
    state.sourceImages = [];
    state.presenterAsset = null;
    state.shotlist = null;
    state.estimate = null;
    state.job = null;
    state.stage = 'compose';
    if (!state.projectId) {
      elements['shorts-project-name'].textContent = 'Valitse projekti SkriptLabin työtilasta';
      setNotice('Shorts-studio tarvitsee aktiivisen projektin. Valitse projekti sivuvalikosta ja palaa Videostudioon.', 'error');
      syncControls();
      return;
    }

    setBusy(true, 'Ladataan kirjan aineistoja…');
    try {
      const [context, presets] = await Promise.all([
        api(`/api/video/context?project_id=${encodeURIComponent(state.projectId)}`),
        api('/api/video/presets'),
      ]);
      state.context = context;
      state.presets = presets;
      state.sourceImages = normalizeSourceImages(context);
      renderContext();
      const restored = await restoreSession();
      if (!restored) showCompose();
      if (!restored) {
        const sourceNote = coverSource()
          ? 'Kirjan kansi ja markkinointitekstit ovat valmiina.'
          : 'Kansikuva puuttuu. Voit silti tehdä tekstikortin tai lisätä esittelijän kuvan.';
        setNotice(`${sourceNote} Valitse idea, tunnelma ja julkaisumuoto.`, 'ready');
      } else if (state.job?.state === 'succeeded') {
        setNotice('Aiempi shortsi palautettiin ja on valmis ladattavaksi.', 'ready');
      } else if (!state.job && state.shotlist) {
        setNotice('Aiempi shortsin suunnitelma palautettiin tarkistettavaksi.', 'ready');
      }
    } catch (error) {
      setNotice(error.message, 'error', 'Yritä uudelleen');
    } finally {
      setBusy(false);
    }
  }

  function openClassicVideoStudio() {
    if (state.stage === 'review' && !ACTIVE_STATES.has(state.job?.state)) {
      showCompose();
      return;
    }
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'skriptlab:video-workspace-tab', tab: 'video' }, window.location.origin);
      return;
    }
    const params = new URLSearchParams();
    if (state.projectId) params.set('project', String(state.projectId));
    window.location.href = `video.html${params.size ? `?${params}` : ''}`;
  }

  function selectionChanged(event) {
    const name = event?.target?.name;
    if (name === 'shorts-concept') updateStepState('style');
    else if (name === 'shorts-tone') updateStepState('publish');
    else if (name === 'shorts-profile') updateStepState('publish');
    renderSelection();
    persistSession();
  }

  function bindEvents() {
    elements['shorts-open-video'].addEventListener('click', openClassicVideoStudio);
    elements['shorts-notice-action'].addEventListener('click', loadWorkspace);
    elements['shorts-compose'].addEventListener('submit', prepareReview);
    elements['presenter-source-file'].addEventListener('change', (event) => uploadPresenterSource(event.target.files?.[0]));
    elements['presenter-consent'].addEventListener('change', () => {
      syncControls();
      persistSession();
    });
    document.querySelectorAll('input[name="shorts-concept"], input[name="shorts-tone"], input[name="shorts-profile"]')
      .forEach((input) => input.addEventListener('change', selectionChanged));
    elements['shorts-text-enabled'].addEventListener('change', selectionChanged);
    elements['shorts-voiceover'].addEventListener('change', selectionChanged);
    elements['shorts-edit'].addEventListener('click', showCompose);
    elements['shorts-render'].addEventListener('click', () => {
      if (['failed', 'cancelled'].includes(state.job?.state)) retryJob();
      else startJob();
    });
    elements['shorts-cancel'].addEventListener('click', cancelJob);
    elements['shorts-retry'].addEventListener('click', retryJob);
    elements['shorts-preview-play'].addEventListener('click', animateStaticPreview);
    window.addEventListener('beforeunload', clearTimers);
    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'skriptlab:video-project-changed') return;
      const nextProjectId = Number(event.data.projectId || 0) || null;
      if (nextProjectId === state.projectId) return;
      const url = new URL(window.location.href);
      if (nextProjectId) url.searchParams.set('project', String(nextProjectId));
      else url.searchParams.delete('project');
      window.history.replaceState({}, '', url);
      loadWorkspace();
    });
  }

  async function init() {
    collectElements();
    if (!window.SkriptLabAuth?.requireLogin()) return;
    bindEvents();
    renderSelection();
    renderEstimate();
    await loadWorkspace();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
