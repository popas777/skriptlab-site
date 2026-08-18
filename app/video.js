(function () {
  'use strict';

  const PROFILE_LABELS = {
    story: { ratio: '9:16', title: 'Story · 1080 × 1920' },
    square: { ratio: '1:1', title: 'Neliö · 1080 × 1080' },
    landscape: { ratio: '16:9', title: 'Vaaka · 1920 × 1080' },
  };
  const TERMINAL_STATES = new Set(['succeeded', 'failed', 'cancelled']);
  const ACTIVE_STATES = new Set(['queued', 'preparing', 'generating_clips', 'assembling']);
  const STATE_LABELS = {
    queued: 'Jonossa',
    preparing: 'Valmistellaan',
    generating_clips: 'Luodaan klippejä',
    assembling: 'Koostetaan',
    succeeded: 'Valmis',
    failed: 'Epäonnistui',
    cancelled: 'Keskeytetty',
  };
  const CLIP_STATE_LABELS = {
    queued: 'Jonossa',
    in_progress: 'Luodaan',
    completed: 'Valmis',
    failed: 'Epäonnistui',
    cancelled: 'Keskeytetty',
  };
  const SHOT_LIMITS = Object.freeze({
    minimumCount: 1,
    maximumCount: 8,
    minimumDuration: 3,
    maximumDuration: 35,
    minimumShotDuration: 2,
    maximumAiShots: 1,
  });
  const SINGLE_SCENE_PILOT = Object.freeze({
    enabled: true,
    renderableShotCount: 1,
    durationS: 8,
  });
  const SINGLE_SCENE_PROMPT = "Single continuous shot with no cuts. Begin with a closed physical book already held steadily in an adult's hand; only the hand and forearm are visible against a simple neutral background. The camera slowly and smoothly zooms in until the front cover fills the frame. As the zoom settles, only the fictional illustrated figure already printed on the cover begins to move: it gently blinks and turns its head slightly, with subtle movement in hair or clothing, while remaining within the printed artwork. Preserve the original book, cover layout, illustration, and all existing lettering exactly. Introduce no additional people, faces, objects, logos, captions, watermarks, or readable text. End on a steady close-up with a calm, family-friendly book-trailer mood and subtle room ambience.";
  const LEGACY_SINGLE_SCENE_PROMPTS = new Set([
    'In one continuous unbroken shot with no cuts, present the uploaded cover as the unchanged front face of a physical book resting on a simple neutral tabletop or held naturally in one hand. Make a slow, steady camera push toward the cover, continue through the center of the cover artwork so the printed lettering leaves the frame naturally through camera crop while the artwork gains subtle parallax, then decelerate into a completely still end frame. Treat all existing lettering only as fixed source-image pixels; do not generate, redraw, rewrite, replace, morph, animate, or add readable text.',
    'In one continuous unbroken shot with no cuts, present the uploaded cover as the unchanged front face of a physical book resting on a simple neutral tabletop or held naturally in one hand. Make a slow, steady camera push toward the cover, then continue through the center of the cover artwork so the printed lettering leaves the frame naturally through camera crop while the artwork gains subtle parallax and restrained cinematic motion. Finally decelerate and settle into a completely still end frame. Treat all existing lettering only as fixed source-image pixels: do not generate, redraw, rewrite, replace, morph, or animate any text, and add no new readable text.',
  ]);
  const LOCAL_ANIMATION_PRESETS = Object.freeze({
    zoom_in: Object.freeze({ from: 1, to: 1.18, focus: 'center' }),
    zoom_out: Object.freeze({ from: 1.18, to: 1, focus: 'center' }),
    pan_left: Object.freeze({ from: 1.18, to: 1.18, focus: 'pan-left' }),
    pan_right: Object.freeze({ from: 1.18, to: 1.18, focus: 'pan-right' }),
    still: Object.freeze({ from: 1, to: 1, focus: 'center' }),
  });
  const FALLBACK_AI_VIDEO_MODELS = Object.freeze([
    Object.freeze({ id: 'veo-3.1-fast-generate-preview', label: 'Gemini Veo 3.1 Fast', provider: 'veo' }),
    Object.freeze({ id: 'veo-3.1-generate-preview', label: 'Gemini Veo 3.1', provider: 'veo' }),
    Object.freeze({ id: 'veo-3.1-lite-generate-preview', label: 'Gemini Veo 3.1 Lite', provider: 'veo' }),
    Object.freeze({ id: 'gemini-omni-flash-preview', label: 'Gemini Omni Flash (Preview)', provider: 'omni' }),
    Object.freeze({ id: 'dop-turbo', label: 'Higgsfield DoP Turbo', provider: 'higgsfield' }),
  ]);
  const PROVIDER_LABELS = Object.freeze({
    veo: 'Gemini Veo',
    omni: 'Gemini Omni',
    higgsfield: 'Higgsfield',
    kenburns: 'Kuva-animointi',
    card: 'Tekstikortti',
  });

  const elements = {};
  const state = {
    projectId: null,
    context: null,
    sourceImages: [],
    presets: null,
    shotlist: null,
    job: null,
    estimate: null,
    busy: false,
    saveTimer: null,
    savePromise: null,
    editRevision: 0,
    savedRevision: 0,
    estimateTimer: null,
    estimateToken: 0,
    estimateTier: 'final',
    pollTimer: null,
    draggedShotId: null,
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function collectElements() {
    [
      'video-project-name', 'video-notice', 'video-notice-text', 'video-notice-action',
      'video-duration', 'video-profile', 'video-ai-count', 'video-style', 'video-subtitles',
      'video-voiceover', 'video-voiceover-help', 'video-final-profiles',
      'video-regenerate', 'video-generate', 'video-shot-list',
      'video-shot-summary', 'video-add-shot', 'video-format-badge', 'video-preview-stage',
      'video-preview-placeholder', 'video-preview-cover', 'video-preview-title',
      'video-preview-author', 'video-preview-caption', 'video-player', 'video-render-progress',
      'video-progress-value', 'video-job-state', 'video-job-tier', 'video-preview-duration',
      'video-result-actions', 'video-download', 'video-retry', 'video-cost', 'video-cost-note',
      'video-cancel', 'video-preview', 'video-render', 'video-shot-template',
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

  async function api(path, options = {}) {
    const response = await window.SkriptLabAuth.fetch(path, options);
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : null;
    if (!response.ok) {
      const detail = payload?.detail || payload?.message;
      const message = response.status === 422 && Array.isArray(detail)
        ? 'Tarkista kuvakäsikirjoituksen kestot, kohtaustyypit ja pakolliset kentät.'
        : (detail || `Pyyntö epäonnistui (${response.status}).`);
      const error = new Error(typeof message === 'string' ? message : JSON.stringify(message));
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function setNotice(message, tone = 'ready', actionLabel = '') {
    const notice = elements['video-notice'];
    notice.classList.toggle('is-loading', tone === 'loading');
    notice.classList.toggle('is-error', tone === 'error');
    elements['video-notice-text'].textContent = message;
    const action = elements['video-notice-action'];
    action.hidden = !actionLabel;
    action.textContent = actionLabel;
  }

  function setBusy(busy, message = '') {
    state.busy = busy;
    if (message) setNotice(message, busy ? 'loading' : 'ready');
    syncControls();
  }

  function normalizeShot(raw, index) {
    const overlay = raw?.overlay && typeof raw.overlay === 'object' ? { ...raw.overlay } : {};
    const overlayText = raw?.overlay_text || overlay.quote || overlay.cta || overlay.subtitle || overlay.title || '';
    const requestedModelName = String(raw?.model_name || '').trim();
    const requestedModelProvider = String(raw?.model_provider || '').trim().toLowerCase();
    return {
      id: String(raw?.id || raw?.shot_id || `shot_${index + 1}`),
      order: index,
      kind: ['ai_motion', 'kenburns', 'card'].includes(raw?.kind) ? raw.kind : 'kenburns',
      title: String(raw?.title || raw?.name || overlay.title || ''),
      duration_s: Math.max(2, Math.min(20, Math.round(Number(raw?.duration_s || raw?.duration || 4)))),
      prompt: String(raw?.motion_prompt || raw?.prompt || raw?.visual_prompt || ''),
      overlay_text: String(overlayText),
      source_asset: raw?.source_asset ?? (raw?.kind === 'card' ? null : defaultSourceReference()),
      motion_prompt: String(raw?.motion_prompt || raw?.prompt || ''),
      motion_preset: raw?.motion_preset || null,
      // Preserve explicit selections even if current credentials or model
      // availability changed. The selector makes stale pairs visible and the
      // backend refuses to send the image to a different provider silently.
      model_name: requestedModelName || null,
      model_provider: requestedModelProvider || null,
      motion_strength: Number(raw?.motion_strength ?? 0.5),
      zoom: raw?.zoom || (raw?.kind === 'kenburns' ? { from: 1, to: 1.18, focus: 'center' } : null),
      overlay,
    };
  }

  function normalizeShotlist(raw) {
    const data = raw?.shotlist || raw;
    if (!data || !Array.isArray(data.shots)) return null;
    return {
      id: data.id || raw?.id || null,
      project_id: Number(data.project_id || state.projectId),
      schema_version: Number(data.schema_version || 1),
      target_duration_s: Number(data.target_duration_s || elements['video-duration'].value || SINGLE_SCENE_PILOT.durationS),
      aspect_ratios: Array.isArray(data.aspect_ratios) ? data.aspect_ratios : [PROFILE_LABELS[elements['video-profile'].value].ratio],
      language: String(data.language || 'fi'),
      style_hint: String(data.style_hint || elements['video-style'].value || ''),
      shots: data.shots.map(normalizeShot),
      audio: {
        voiceover_asset: data.audio?.voiceover_asset || null,
        music: data.audio?.music || { asset: null, gain_db: -18, duck_under_voice: true },
        subtitles: data.audio?.subtitles || { enabled: true, language: 'fi', source: 'voiceover_transcript' },
      },
      generated_by: String(data.generated_by || ''),
      source_checksum: String(data.source_checksum || ''),
    };
  }

  function jsonBody(payload) {
    return {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    };
  }

  function mediaUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^(?:https?:\/\/|data:|blob:)/i.test(raw)) return raw;
    return apiUrl(raw.startsWith('/') ? raw : `/${raw}`);
  }

  function normalizeSourceImage(raw) {
    const id = Number(raw?.id || 0) || null;
    const reference = String(raw?.reference || (id ? `project_asset:${id}` : '')).trim();
    if (!reference) return null;
    return {
      reference,
      id,
      title: String(raw?.title || '').trim(),
      asset_type: String(raw?.asset_type || '').trim(),
      url: String(raw?.url || raw?.data_url || raw?.content_data_url || '').trim(),
    };
  }

  function sourceImageIsCover(asset) {
    const type = String(asset?.asset_type || '').toLowerCase();
    return asset?.reference === 'cover' || type === 'cover_image' || type === 'full_cover_image';
  }

  function sourceImageTypeLabel(asset) {
    const type = String(asset?.asset_type || '').toLowerCase();
    if (sourceImageIsCover(asset)) return 'Kansi';
    if (type === 'back_cover_image') return 'Takakansi';
    if (type === 'book_visual_image') return 'Kuvituksessa luotu';
    if (type === 'infographic') return 'Infografiikka';
    if (type === 'video_source_image') return 'Ladattu kuva';
    return 'Projektikuva';
  }

  function normalizeSourceImages(context) {
    const byReference = new Map();
    (Array.isArray(context?.source_images) ? context.source_images : []).forEach((raw) => {
      const image = normalizeSourceImage(raw);
      if (image) byReference.set(image.reference, image);
    });

    const cover = context?.cover || context?.cover_asset || null;
    const coverId = Number(cover?.id || 0) || null;
    const coverReference = coverId ? `project_asset:${coverId}` : 'cover';
    const coverUrl = String(cover?.url || cover?.data_url || cover?.content_data_url || '').trim();
    const existingCover = Array.from(byReference.values()).find((asset) => (
      (coverId && Number(asset.id) === coverId) || sourceImageIsCover(asset)
    ));
    if (existingCover) {
      if (!existingCover.url && coverUrl) existingCover.url = coverUrl;
      if (!existingCover.title && cover?.title) existingCover.title = String(cover.title);
      if (!existingCover.asset_type) existingCover.asset_type = 'cover_image';
    } else if (coverId || coverUrl) {
      byReference.set(coverReference, {
        reference: coverReference,
        id: coverId,
        title: String(cover?.title || 'Kansi'),
        asset_type: 'cover_image',
        url: coverUrl,
      });
    }

    return sortSourceImages(Array.from(byReference.values()));
  }

  function coverSourceImage() {
    return state.sourceImages.find(sourceImageIsCover) || null;
  }

  function sourceImageForReference(reference) {
    const requested = String(reference || '').trim();
    if (requested === 'cover') return coverSourceImage();
    return state.sourceImages.find((asset) => asset.reference === requested) || null;
  }

  function defaultSourceReference() {
    return coverSourceImage()?.reference || state.sourceImages[0]?.reference || 'cover';
  }

  function sourceImageOptionLabel(asset) {
    const kind = sourceImageTypeLabel(asset);
    const title = String(asset?.title || '').trim();
    return title && title.toLocaleLowerCase('fi-FI') !== kind.toLocaleLowerCase('fi-FI')
      ? `${kind} · ${title}`
      : kind;
  }

  function sortSourceImages(images) {
    return [...images].sort((left, right) => {
      const sourcePriority = (asset) => {
        const type = String(asset?.asset_type || '').toLowerCase();
        if (type === 'cover_image' || asset?.reference === 'cover') return 0;
        if (type === 'full_cover_image') return 1;
        return 2;
      };
      const priorityOrder = sourcePriority(left) - sourcePriority(right);
      if (priorityOrder) return priorityOrder;
      return Number(right.id || 0) - Number(left.id || 0);
    });
  }

  function totalDuration() {
    return (state.shotlist?.shots || []).reduce((sum, shot) => sum + Number(shot.duration_s || 0), 0);
  }

  function minimumDurationForShot(shot) {
    return shot?.kind === 'ai_motion' ? 5 : SHOT_LIMITS.minimumShotDuration;
  }

  function shotlistDurationIsValid() {
    const duration = totalDuration();
    return duration >= SHOT_LIMITS.minimumDuration && duration <= SHOT_LIMITS.maximumDuration;
  }

  function singleScenePilotIsReady() {
    const shots = state.shotlist?.shots || [];
    return !SINGLE_SCENE_PILOT.enabled || (
      shots.length === SINGLE_SCENE_PILOT.renderableShotCount
      && totalDuration() === SINGLE_SCENE_PILOT.durationS
    );
  }

  function canAddShot() {
    if (SINGLE_SCENE_PILOT.enabled) return false;
    const shots = state.shotlist?.shots || [];
    return shots.length < SHOT_LIMITS.maximumCount
      && totalDuration() + SHOT_LIMITS.minimumShotDuration <= SHOT_LIMITS.maximumDuration;
  }

  function canRemoveShot(shot) {
    const shots = state.shotlist?.shots || [];
    return shots.length > SHOT_LIMITS.minimumCount
      && totalDuration() - Number(shot?.duration_s || 0) >= SHOT_LIMITS.minimumDuration;
  }

  function coverIsAvailable() {
    const cover = state.context?.cover;
    return Boolean(
      coverSourceImage()
      || cover?.id
      || cover?.url
      || cover?.data_url
      || cover?.content_data_url,
    );
  }

  function openingSceneOverlay() {
    const project = state.context?.project || {};
    const marketing = state.context?.marketing || {};
    const title = String(project.title || state.context?.title || 'Kirjan nimi').trim();
    const author = String(project.author || state.context?.author || '').trim();
    const tagline = String(marketing.tagline || marketing.short || '').trim();
    return {
      title: title || null,
      subtitle: author || null,
      cta: tagline || null,
      position: 'center',
    };
  }

  function migrateLegacySingleScenePrompt(shotlist) {
    if (!shotlist?.shots?.length || shotlist.shots.length !== 1) return false;
    const shot = shotlist.shots[0];
    const savedPrompt = String(shot.motion_prompt || shot.prompt || '').trim();
    if (savedPrompt && !LEGACY_SINGLE_SCENE_PROMPTS.has(savedPrompt)) return false;
    const changed = shot.prompt !== SINGLE_SCENE_PROMPT || shot.motion_prompt !== SINGLE_SCENE_PROMPT;
    shot.prompt = SINGLE_SCENE_PROMPT;
    shot.motion_prompt = SINGLE_SCENE_PROMPT;
    return changed;
  }

  function applySingleSceneDefaults(shotlist) {
    if (!shotlist?.shots?.length || shotlist.shots.length !== 1) return false;
    let changed = false;
    const shot = shotlist.shots[0];
    const previous = JSON.stringify(shot);
    migrateLegacySingleScenePrompt(shotlist);
    const finalOverlay = openingSceneOverlay();
    const hasCover = coverIsAvailable();
    const paidAiRequested = Number(elements['video-ai-count'].value || 0) > 0;
    if (hasCover && paidAiRequested && ['card', 'kenburns'].includes(shot.kind)) shot.kind = 'ai_motion';
    if (hasCover && !paidAiRequested && shot.kind === 'card') shot.kind = 'kenburns';
    if (!paidAiRequested && shot.kind === 'ai_motion') shot.kind = hasCover ? 'kenburns' : 'card';
    shot.source_asset = shot.kind === 'card' ? null : (shot.source_asset || defaultSourceReference());
    shot.duration_s = SINGLE_SCENE_PILOT.durationS;
    const savedPrompt = String(shot.motion_prompt || shot.prompt || '').trim();
    shot.prompt = savedPrompt || SINGLE_SCENE_PROMPT;
    shot.motion_prompt = shot.prompt;
    shot.zoom = shot.kind === 'kenburns' ? { from: 1, to: 1.35, focus: 'center' } : null;
    shot.title = String(finalOverlay.title || '');
    shot.overlay_text = String(finalOverlay.cta || finalOverlay.subtitle || '');
    shot.overlay = finalOverlay;
    shot.order = 0;
    shotlist.target_duration_s = SINGLE_SCENE_PILOT.durationS;
    changed = previous !== JSON.stringify(shot);
    return changed;
  }

  function selectedProfile() {
    return elements['video-profile'].value;
  }

  function finalProfileInputs() {
    return Array.from(document.querySelectorAll('.video-final-profile'));
  }

  function selectedFinalProfiles() {
    const selected = finalProfileInputs()
      .filter((input) => input.checked)
      .map((input) => input.value)
      .filter((profile) => PROFILE_LABELS[profile]);
    return selected.length ? selected : [selectedProfile()];
  }

  function selectedProfilesForTier(tier) {
    return tier === 'final' ? selectedFinalProfiles() : [selectedProfile()];
  }

  function selectedAspectRatios() {
    return selectedFinalProfiles().map((profile) => PROFILE_LABELS[profile].ratio);
  }

  function profileRatio() {
    return PROFILE_LABELS[selectedProfile()]?.ratio || '9:16';
  }

  function aiMotionEnabled() {
    return Boolean(state.shotlist?.shots?.some((shot) => shot.kind === 'ai_motion'));
  }

  function availableVoiceoverAsset() {
    const asset = state.context?.voiceovers?.[0];
    return asset?.id ? asset : null;
  }

  function syncVoiceoverAvailability() {
    const voiceover = elements['video-voiceover'];
    const asset = availableVoiceoverAsset();
    const unavailable = !asset;
    if (unavailable) voiceover.checked = false;
    voiceover.disabled = state.busy || ACTIVE_STATES.has(state.job?.state) || unavailable;
    voiceover.closest('.toggle-stack')?.classList.toggle('is-disabled', unavailable);
    elements['video-voiceover-help'].textContent = asset
      ? `Käytetään äänitiedostoa: ${asset.label || `Voiceover ${asset.id}`}.`
      : 'Ei käytettävissä: luo ensin enintään 35 sekunnin valmis äänituotanto.';
  }

  function syncControls() {
    const hasProject = Boolean(state.projectId && state.context);
    const hasShots = Boolean(state.shotlist?.shots?.length);
    const validDuration = hasShots && shotlistDurationIsValid();
    const pilotReady = hasShots && singleScenePilotIsReady();
    const jobActive = ACTIVE_STATES.has(state.job?.state);
    elements['video-generate'].disabled = !hasProject || state.busy || jobActive;
    elements['video-regenerate'].disabled = !hasProject || !hasShots || state.busy || jobActive;
    elements['video-add-shot'].disabled = !hasShots || !canAddShot() || state.busy || jobActive;
    elements['video-add-shot'].title = SINGLE_SCENE_PILOT.enabled
      ? 'Monen kohtauksen video avataan myöhemmässä vaiheessa.'
      : (canAddShot()
        ? 'Lisää kohtaus'
        : 'Kohtauksia voi olla enintään 8 ja yhteiskesto voi olla enintään 35 sekuntia.');
    elements['video-preview'].disabled = !validDuration || !pilotReady || state.busy || jobActive;
    elements['video-render'].disabled = !validDuration || !pilotReady || state.busy || jobActive;
    elements['video-cancel'].hidden = !jobActive;
    [
      'video-duration', 'video-profile', 'video-ai-count', 'video-style',
      'video-subtitles',
    ].forEach((id) => {
      elements[id].disabled = state.busy || jobActive;
    });
    elements['video-final-profiles'].disabled = state.busy || jobActive;
    syncVoiceoverAvailability();
    document.querySelectorAll('.shot-card').forEach((card) => {
      card.draggable = !(state.busy || jobActive);
    });
    document.querySelectorAll('.shot-card input, .shot-card select, .shot-card textarea, .shot-card button')
      .forEach((input) => {
        const aiOnly = input.classList.contains('shot-motion-preset') || input.classList.contains('shot-ai-model');
        const animationOnly = input.classList.contains('shot-animation-preset');
        const isAiMotion = input.closest('.shot-card')?.querySelector('.shot-kind')?.value === 'ai_motion';
        const isAnimation = input.closest('.shot-card')?.querySelector('.shot-kind')?.value === 'kenburns';
        const usesImage = input.closest('.shot-card')?.querySelector('.shot-kind')?.value !== 'card';
        const sourceOnly = input.classList.contains('shot-source-select')
          || input.classList.contains('shot-source-upload')
          || input.classList.contains('shot-source-file');
        const regenerateOnly = input.classList.contains('shot-regenerate');
        const shot = state.shotlist?.shots?.find((item) => item.id === input.closest('.shot-card')?.dataset.shotId);
        const canRegenerate = Boolean(
          shot
          && state.job?.state === 'succeeded'
          && state.job?.shotlist_id === state.shotlist?.id
          && (state.job?.clips || []).some((clip) => String(clip?.shot_id) === String(shot.id))
        );
        const cannotDelete = input.classList.contains('shot-delete') && !canRemoveShot(shot);
        input.disabled = state.busy
          || jobActive
          || cannotDelete
          || (aiOnly && !isAiMotion)
          || (animationOnly && !isAnimation)
          || (sourceOnly && !usesImage)
          || (regenerateOnly && !canRegenerate);
        if (input.classList.contains('shot-delete')) {
          input.title = cannotDelete
            ? 'Videossa pitää olla vähintään yksi kohtaus ja vähintään 3 sekuntia.'
            : `Poista kohtaus ${Number(shot?.order || 0) + 1}`;
        }
      });
  }

  function renderContext() {
    const context = state.context || {};
    const title = context.project?.title || context.title || 'Nimetön projekti';
    const author = context.project?.author || context.author || 'Tekijä';
    elements['video-project-name'].textContent = title;
    elements['video-preview-title'].textContent = title;
    elements['video-preview-author'].textContent = author;
    const cover = context.cover || context.cover_asset || null;
    const coverUrl = mediaUrl(coverSourceImage()?.url || cover?.url || cover?.data_url || cover?.content_data_url || '');
    elements['video-preview-cover'].style.backgroundImage = coverUrl ? `url("${String(coverUrl).replace(/"/g, '%22')}")` : '';
    elements['video-preview-cover'].classList.toggle('has-cover', Boolean(coverUrl));
  }

  function renderFormat() {
    const profile = selectedProfile();
    const meta = PROFILE_LABELS[profile];
    elements['video-format-badge'].textContent = meta.ratio;
    elements['video-preview-stage'].className = `preview-stage profile-${profile}`;
    elements['video-preview-duration'].textContent = `${Math.round(totalDuration() || Number(elements['video-duration'].value))} s`;
  }

  function availableAiVideoModels() {
    const configured = state.presets?.provider?.ai_video_models;
    // An empty list from /presets means that no paid provider is available.
    // Use the static catalog only during the short bootstrap before presets
    // have been loaded at all.
    return Array.isArray(configured) ? configured : FALLBACK_AI_VIDEO_MODELS;
  }

  function aiVideoModelById(modelId) {
    const requested = String(modelId || '');
    return availableAiVideoModels().find((model) => String(model.id || '') === requested) || null;
  }

  function providerLabel(provider) {
    const id = String(provider || '').trim().toLowerCase();
    return PROVIDER_LABELS[id] || String(provider || 'AI-video');
  }

  function providerDataNotice() {
    return String(
      state.presets?.provider_data_notice
      || state.presets?.provider?.data_notice
      || 'AI-videossa kohtaukseen valittu kuvalähde ja englanninkielinen liikeprompti lähetetään valitulle videopalvelulle.',
    ).trim();
  }

  function populateAiModelSelect(select, selectedModel, selectedProvider) {
    const models = availableAiVideoModels();
    const automatic = document.createElement('option');
    automatic.value = '';
    const effectiveProvider = String(state.presets?.provider?.effective || '').trim().toLowerCase();
    const automaticProvider = ['veo', 'omni', 'higgsfield'].includes(effectiveProvider)
      ? providerLabel(effectiveProvider)
      : 'AI-video';
    automatic.textContent = `Automaattinen · ${automaticProvider} (suositus)`;
    select.replaceChildren(automatic, ...models.map((model) => {
      const option = document.createElement('option');
      option.value = String(model.id || '');
      option.textContent = String(model.label || model.id || 'AI-videomalli');
      return option;
    }));
    const requestedProvider = String(selectedProvider || '').trim().toLowerCase();
    const requestedModel = String(selectedModel || '').trim();
    const configuredModel = models.find((model) => String(model.id) === String(selectedModel || ''));
    const configuredProvider = String(configuredModel?.provider || '').trim().toLowerCase();
    const validExplicitSelection = Boolean(
      requestedModel
      && requestedProvider
      && configuredModel
      && configuredProvider === requestedProvider,
    );
    if (validExplicitSelection) {
      select.value = String(configuredModel.id);
      delete select.dataset.unavailableSelection;
    } else if (requestedModel || requestedProvider) {
      const unavailable = document.createElement('option');
      unavailable.value = `__unavailable__:${requestedProvider}:${requestedModel}`;
      unavailable.textContent = `Ei käytettävissä · ${providerLabel(requestedProvider || 'AI-video')} · ${requestedModel || 'malli puuttuu'}`;
      unavailable.disabled = true;
      select.appendChild(unavailable);
      select.value = unavailable.value;
      select.dataset.unavailableSelection = 'true';
    } else {
      select.value = '';
      delete select.dataset.unavailableSelection;
    }
  }

  function localAnimationPresetForShot(shot) {
    if (Object.prototype.hasOwnProperty.call(LOCAL_ANIMATION_PRESETS, shot.motion_preset)) {
      return shot.motion_preset;
    }
    const zoom = shot.zoom || {};
    const focus = String(zoom.focus || '').replaceAll('_', '-');
    if (focus === 'pan-left') return 'pan_left';
    if (focus === 'pan-right') return 'pan_right';
    const from = Number(zoom.from ?? zoom.from_ ?? 1);
    const to = Number(zoom.to ?? 1.18);
    if (Math.abs(from - to) < 0.001) return 'still';
    return from > to ? 'zoom_out' : 'zoom_in';
  }

  function zoomForLocalAnimation(preset) {
    return { ...(LOCAL_ANIMATION_PRESETS[preset] || LOCAL_ANIMATION_PRESETS.zoom_in) };
  }

  function populateShotSourceSelect(select, shot) {
    const options = state.sourceImages.map((asset) => {
      const option = document.createElement('option');
      option.value = asset.reference;
      option.textContent = sourceImageOptionLabel(asset);
      return option;
    });
    const requestedReference = String(shot.source_asset || '').trim();
    const selectedReference = requestedReference === 'cover'
      ? (coverSourceImage()?.reference || 'cover')
      : requestedReference;
    if (selectedReference && !options.some((option) => option.value === selectedReference)) {
      const saved = document.createElement('option');
      saved.value = selectedReference;
      saved.textContent = requestedReference === 'cover' ? 'Kansi' : 'Tallennettu kuvalähde';
      options.unshift(saved);
    }
    if (!options.length) {
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'Ei projektikuvia';
      options.push(empty);
    }
    select.replaceChildren(...options);
    select.value = selectedReference || defaultSourceReference();
  }

  function updateShotSourcePreview(card, shot) {
    const thumbnail = card.querySelector('.shot-source-thumbnail');
    const placeholder = card.querySelector('.shot-source-placeholder');
    const asset = sourceImageForReference(shot.source_asset)
      || sourceImageForReference(card.querySelector('.shot-source-select')?.value);
    const url = mediaUrl(asset?.url);
    if (url) {
      if (thumbnail.dataset.src !== url) {
        thumbnail.src = url;
        thumbnail.dataset.src = url;
      }
      thumbnail.alt = `Kohtauksen ${Number(shot.order || 0) + 1} kuvalähde: ${asset.title || sourceImageTypeLabel(asset)}`;
      thumbnail.hidden = false;
      placeholder.hidden = true;
    } else {
      thumbnail.hidden = true;
      thumbnail.removeAttribute('src');
      thumbnail.removeAttribute('data-src');
      thumbnail.alt = '';
      placeholder.hidden = false;
      placeholder.textContent = asset ? 'Esikatselukuvaa ei saatavilla' : 'Tuo tai valitse kuva';
    }
  }

  function syncShotTypeEditors(card, shot) {
    const sourceSettings = card.querySelector('.shot-source-settings');
    const sourceSelect = card.querySelector('.shot-source-select');
    const sourceUpload = card.querySelector('.shot-source-upload');
    const sourceFile = card.querySelector('.shot-source-file');
    const sourceAiHelp = card.querySelector('.shot-source-ai-help');
    const animationSettings = card.querySelector('.shot-animation-settings');
    const animationSelect = card.querySelector('.shot-animation-preset');
    const modelSettings = card.querySelector('.shot-model-settings');
    const modelSelect = card.querySelector('.shot-ai-model');
    const motionSettings = card.querySelector('.shot-motion-settings');
    const motionSelect = card.querySelector('.shot-motion-preset');
    const isAiMotion = shot.kind === 'ai_motion';
    const isAnimation = shot.kind === 'kenburns';
    const usesImage = shot.kind !== 'card';
    const locked = state.busy || ACTIVE_STATES.has(state.job?.state);
    sourceSettings.hidden = !usesImage;
    sourceSelect.disabled = !usesImage || locked;
    sourceUpload.disabled = !usesImage || locked;
    sourceFile.disabled = !usesImage || locked;
    sourceAiHelp.hidden = !isAiMotion;
    animationSettings.hidden = !isAnimation;
    modelSettings.hidden = !isAiMotion;
    motionSettings.hidden = !isAiMotion;
    animationSelect.disabled = !isAnimation || locked;
    modelSelect.disabled = !isAiMotion || locked;
    motionSelect.disabled = !isAiMotion || locked;
    animationSelect.setAttribute('aria-label', `Kohtauksen ${shot.order + 1} kuva-animointi`);
    sourceSelect.setAttribute('aria-label', `Kohtauksen ${shot.order + 1} kuvalähde`);
    sourceUpload.setAttribute('aria-label', `Tuo kuva kohtaukseen ${shot.order + 1}`);
    modelSelect.setAttribute('aria-label', `Kohtauksen ${shot.order + 1} AI-videomalli`);
    motionSelect.setAttribute('aria-label', `Kohtauksen ${shot.order + 1} AI-videon kameraliike`);
  }

  function shotFieldChanged(card, changedInput = null) {
    const shot = state.shotlist?.shots.find((item) => item.id === card.dataset.shotId);
    if (!shot) return;
    const kindInput = card.querySelector('.shot-kind');
    const nextKind = kindInput.value;
    const kindChanged = nextKind !== shot.kind;
    const otherAiShots = state.shotlist.shots.filter((item) => item.id !== shot.id && item.kind === 'ai_motion').length;
    if (nextKind === 'ai_motion' && otherAiShots >= SHOT_LIMITS.maximumAiShots) {
      kindInput.value = shot.kind;
      setNotice('Kokeiluvaiheessa kuvakäsikirjoituksessa voi olla yksi AI-videokohtaus.', 'error');
      return;
    }
    shot.kind = nextKind;
    if (kindChanged && SINGLE_SCENE_PILOT.enabled) {
      elements['video-ai-count'].value = shot.kind === 'ai_motion' ? '1' : '0';
    }
    const durationInput = card.querySelector('.shot-duration');
    const minimum = shot.kind === 'ai_motion' ? 5 : 2;
    const maximum = shot.kind === 'ai_motion' ? 10 : 20;
    durationInput.min = String(minimum);
    durationInput.max = String(maximum);
    shot.duration_s = Math.max(minimum, Math.min(maximum, Math.round(Number(durationInput.value || minimum))));
    durationInput.value = String(shot.duration_s);
    shot.title = card.querySelector('.shot-title').value.trim();
    shot.prompt = card.querySelector('.shot-prompt').value.trim();
    shot.overlay_text = card.querySelector('.shot-overlay').value.trim();
    const selectedSource = card.querySelector('.shot-source-select').value;
    shot.source_asset = shot.kind === 'card'
      ? null
      : (selectedSource || shot.source_asset || defaultSourceReference());
    if (shot.kind === 'ai_motion') {
      const modelSelect = card.querySelector('.shot-ai-model');
      const selectedModelId = modelSelect.value;
      const selectedModel = aiVideoModelById(selectedModelId);
      shot.motion_preset = card.querySelector('.shot-motion-preset').value || null;
      if (!(modelSelect.dataset.unavailableSelection === 'true' && changedInput !== modelSelect)) {
        delete modelSelect.dataset.unavailableSelection;
        shot.model_name = selectedModelId || null;
        shot.model_provider = selectedModelId ? (String(selectedModel?.provider || '').trim() || null) : null;
      }
      shot.motion_prompt = shot.prompt || SINGLE_SCENE_PROMPT;
      shot.zoom = null;
    } else if (shot.kind === 'kenburns') {
      const localPreset = card.querySelector('.shot-animation-preset').value || 'zoom_in';
      shot.motion_preset = localPreset;
      shot.model_name = null;
      shot.model_provider = null;
      shot.motion_prompt = shot.prompt || null;
      if (kindChanged || changedInput?.classList.contains('shot-animation-preset') || !shot.zoom) {
        shot.zoom = zoomForLocalAnimation(localPreset);
      }
    } else {
      shot.motion_preset = null;
      shot.model_name = null;
      shot.model_provider = null;
      shot.motion_prompt = shot.prompt || null;
      shot.zoom = null;
    }
    shot.overlay = shot.kind === 'card'
      ? { ...shot.overlay, title: shot.title || null, cta: shot.overlay_text || null, quote: null, position: 'center' }
      : { ...shot.overlay, title: shot.title || null, quote: shot.overlay_text || null, cta: null, position: shot.overlay?.position || 'bottom' };
    syncShotTypeEditors(card, shot);
    updateShotSourcePreview(card, shot);
    state.shotlist.target_duration_s = Math.round(totalDuration());
    renderSummary();
    renderPreviewCaption();
    syncControls();
    scheduleSave();
    scheduleEstimate();
  }

  function renderShotCard(shot, index) {
    const fragment = elements['video-shot-template'].content.cloneNode(true);
    const card = fragment.querySelector('.shot-card');
    const sceneNumber = index + 1;
    card.dataset.shotId = shot.id;
    card.draggable = !(state.busy || ACTIVE_STATES.has(state.job?.state));
    card.setAttribute('aria-label', `Kohtaus ${sceneNumber}`);
    card.querySelector('.shot-number').textContent = String(sceneNumber).padStart(2, '0');
    card.querySelector('.shot-number').setAttribute('aria-hidden', 'true');
    const kindInput = card.querySelector('.shot-kind');
    kindInput.value = shot.kind;
    kindInput.setAttribute('aria-label', `Kohtauksen ${sceneNumber} tyyppi`);
    const durationInput = card.querySelector('.shot-duration');
    durationInput.min = shot.kind === 'ai_motion' ? '5' : '2';
    durationInput.max = shot.kind === 'ai_motion' ? '10' : '20';
    durationInput.value = String(shot.duration_s);
    durationInput.setAttribute('aria-label', `Kohtauksen ${sceneNumber} kesto sekunteina`);
    const sourceSelect = card.querySelector('.shot-source-select');
    populateShotSourceSelect(sourceSelect, shot);
    const sourceThumbnail = card.querySelector('.shot-source-thumbnail');
    sourceThumbnail.addEventListener('error', () => {
      sourceThumbnail.hidden = true;
      sourceThumbnail.removeAttribute('src');
      sourceThumbnail.removeAttribute('data-src');
      const placeholder = card.querySelector('.shot-source-placeholder');
      placeholder.hidden = false;
      placeholder.textContent = 'Esikatselukuvaa ei voitu ladata';
    });
    const titleInput = card.querySelector('.shot-title');
    titleInput.value = shot.title;
    titleInput.setAttribute('aria-label', `Kohtauksen ${sceneNumber} ruudulla näkyvä otsikko`);
    const promptInput = card.querySelector('.shot-prompt');
    promptInput.value = shot.prompt;
    promptInput.setAttribute('aria-label', `Kohtauksen ${sceneNumber} liike- ja kuvausprompti`);
    const overlayInput = card.querySelector('.shot-overlay');
    overlayInput.value = shot.overlay_text;
    overlayInput.setAttribute('aria-label', `Kohtauksen ${sceneNumber} muu ruudulla näkyvä teksti`);
    card.querySelector('.shot-animation-preset').value = localAnimationPresetForShot(shot);
    populateAiModelSelect(card.querySelector('.shot-ai-model'), shot.model_name, shot.model_provider);
    card.querySelector('.shot-motion-preset').value = shot.kind === 'ai_motion' ? (shot.motion_preset || '') : '';
    syncShotTypeEditors(card, shot);
    updateShotSourcePreview(card, shot);
    card.querySelectorAll('input:not(.shot-source-file), select, textarea').forEach((input) => {
      input.addEventListener('input', () => shotFieldChanged(card, input));
      input.addEventListener('change', () => shotFieldChanged(card, input));
    });
    const sourceFile = card.querySelector('.shot-source-file');
    const uploadButton = card.querySelector('.shot-source-upload');
    uploadButton.addEventListener('click', () => {
      sourceFile.value = '';
      sourceFile.click();
    });
    sourceFile.addEventListener('change', () => {
      const [file] = Array.from(sourceFile.files || []);
      if (file) void uploadShotSource(shot.id, file);
    });
    const regenerateButton = card.querySelector('.shot-regenerate');
    regenerateButton.setAttribute('aria-label', `Tee kohtaus ${sceneNumber} uudelleen`);
    regenerateButton.addEventListener('click', () => regenerateShot(shot.id));
    const deleteButton = card.querySelector('.shot-delete');
    deleteButton.setAttribute('aria-label', `Poista kohtaus ${sceneNumber}`);
    deleteButton.addEventListener('click', () => removeShot(shot.id));
    const dragHandle = card.querySelector('.drag-handle');
    dragHandle.setAttribute('aria-label', `Siirrä kohtausta ${sceneNumber} nuolinäppäimillä`);
    dragHandle.addEventListener('keydown', (event) => {
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const nextIndex = index + (event.key === 'ArrowUp' ? -1 : 1);
      const target = state.shotlist?.shots?.[nextIndex];
      if (!target) return;
      reorderShot(shot.id, target.id);
      window.requestAnimationFrame(() => {
        const moved = Array.from(document.querySelectorAll('.shot-card'))
          .find((item) => item.dataset.shotId === shot.id);
        moved?.querySelector('.drag-handle')?.focus();
      });
    });
    card.addEventListener('dragstart', (event) => {
      if (state.busy || ACTIVE_STATES.has(state.job?.state)) {
        event.preventDefault();
        return;
      }
      state.draggedShotId = shot.id;
      card.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', shot.id);
    });
    card.addEventListener('dragend', () => {
      state.draggedShotId = null;
      card.classList.remove('is-dragging');
      document.querySelectorAll('.shot-card').forEach((item) => item.classList.remove('drag-over'));
    });
    card.addEventListener('dragover', (event) => {
      if (state.busy || ACTIVE_STATES.has(state.job?.state)) return;
      event.preventDefault();
      if (state.draggedShotId && state.draggedShotId !== shot.id) card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', (event) => {
      event.preventDefault();
      card.classList.remove('drag-over');
      if (state.busy || ACTIVE_STATES.has(state.job?.state)) return;
      reorderShot(state.draggedShotId, shot.id);
    });
    return fragment;
  }

  function renderShotlist() {
    const list = elements['video-shot-list'];
    const shots = state.shotlist?.shots || [];
    if (!shots.length) {
      list.innerHTML = `
        <div class="shot-empty">
          <span aria-hidden="true">01</span>
          <h3>Valmis ensimmäiseen leikkaukseen</h3>
          <p>AI tekee kansikuvasta ja projektin markkinointiteksteistä muokattavan kuvakäsikirjoituksen.</p>
          <button class="primary-action" id="video-generate-inline" type="button">Luo kuvakäsikirjoitus</button>
        </div>`;
      byId('video-generate-inline')?.addEventListener('click', generateShotlist);
    } else {
      list.replaceChildren(...shots.map(renderShotCard));
    }
    renderClipStatuses();
    renderSummary();
    renderPreviewCaption();
    syncControls();
  }

  function renderSummary() {
    const count = state.shotlist?.shots?.length || 0;
    const duration = Math.round(totalDuration());
    elements['video-shot-summary'].textContent = `${count} ${count === 1 ? 'kohtaus' : 'kohtausta'} · ${duration} sekuntia`;
    elements['video-preview-duration'].textContent = `${duration || Number(elements['video-duration'].value)} s`;
  }

  function renderPreviewCaption() {
    const firstText = state.shotlist?.shots?.find((shot) => shot.overlay_text)?.overlay_text;
    elements['video-preview-caption'].textContent = firstText || 'Kuvakäsikirjoitus näkyy tässä';
  }

  function renderClipStatuses(job = state.job) {
    const clips = new Map((job?.clips || []).map((clip) => [String(clip.shot_id), clip]));
    document.querySelectorAll('.shot-card').forEach((card) => {
      const status = card.querySelector('.shot-clip-status');
      const clip = clips.get(String(card.dataset.shotId));
      const shot = state.shotlist?.shots?.find((item) => item.id === card.dataset.shotId);
      const regenerateButton = card.querySelector('.shot-regenerate');
      const result = card.querySelector('.shot-clip-result');
      const clipVideo = card.querySelector('.shot-clip-preview');
      const clipDownload = card.querySelector('.shot-clip-download');
      const canRegenerate = Boolean(
        job?.state === 'succeeded'
        && job?.shotlist_id === state.shotlist?.id
        && shot
        && clip,
      );
      regenerateButton.hidden = !canRegenerate;
      regenerateButton.disabled = state.busy || !canRegenerate;

      if (!clip) {
        status.hidden = true;
        status.textContent = '';
        status.removeAttribute('data-state');
      } else {
        const failed = Boolean(clip.error) && clip.state !== 'completed';
        const fallback = Boolean(clip.error) && clip.state === 'completed';
        const provider = providerLabel(clip.provider);
        const label = fallback
          ? 'Valmis varapolulla'
          : (failed ? 'Epäonnistui' : (CLIP_STATE_LABELS[clip.state] || clip.state));
        status.hidden = false;
        status.dataset.state = failed ? 'failed' : clip.state;
        status.textContent = `${provider} · ${label}`;
        status.title = clip.error || '';
      }

      const clipUrl = mediaUrl(clip?.url);
      if (clipUrl) {
        if (clipVideo.dataset.src !== clipUrl) {
          clipVideo.src = clipUrl;
          clipVideo.dataset.src = clipUrl;
        }
        clipVideo.hidden = false;
      } else {
        if (clipVideo.dataset.src) {
          clipVideo.removeAttribute('src');
          clipVideo.removeAttribute('data-src');
          clipVideo.load();
        }
        clipVideo.hidden = true;
      }
      const downloadUrl = mediaUrl(clip?.download_url);
      clipDownload.hidden = !downloadUrl;
      if (downloadUrl) clipDownload.href = downloadUrl;
      else clipDownload.removeAttribute('href');
      result.hidden = clipVideo.hidden && regenerateButton.hidden && clipDownload.hidden;
    });
  }

  function updateSteps(job) {
    let active = 'shotlist';
    if (job?.state === 'generating_clips') active = 'clips';
    if (job?.state === 'assembling') active = 'assembly';
    if (job?.state === 'succeeded') active = 'ready';
    const order = ['shotlist', 'clips', 'assembly', 'ready'];
    const activeIndex = order.indexOf(active);
    document.querySelectorAll('.studio-steps li').forEach((item) => {
      const index = order.indexOf(item.dataset.step);
      item.classList.toggle('is-active', index === activeIndex);
      item.classList.toggle('is-complete', index < activeIndex);
      if (index === activeIndex) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
  }

  function renderEstimate(estimate = state.estimate) {
    if (!estimate) {
      const configurationError = String(state.presets?.provider?.configuration_error || '').trim();
      elements['video-cost'].textContent = '—';
      elements['video-cost-note'].textContent = configurationError
        ? `${configurationError} Kustannusarviota tai AI-videotyötä ei käynnistetty.`
        : 'Kustannusarviota ei ole vielä saatavilla.';
      return;
    }
    const amount = Number(estimate?.estimated_cost_eur ?? estimate?.cost_eur ?? 0);
    elements['video-cost'].textContent = `${amount.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
    const provider = estimate?.provider
      ? providerLabel(estimate.provider)
      : (Number(elements['video-ai-count'].value) > 0 ? 'AI-video / paikallinen varapolku' : 'Paikallinen FFmpeg');
    const clipCount = Number(estimate?.billable_clip_count ?? elements['video-ai-count'].value ?? 0);
    const profileCount = Array.isArray(estimate?.profiles) ? estimate.profiles.length : selectedProfilesForTier(state.estimateTier).length;
    const tierLabel = state.estimateTier === 'preview' ? 'AI-esikatselu' : 'Lopullinen renderöinti';
    elements['video-cost-note'].textContent = amount > 0
      ? `${tierLabel}: ${clipCount} maksullista AI-klippiä, ${profileCount} ${profileCount === 1 ? 'formaatti' : 'formaattia'} · ${provider}. Hinta vahvistetaan ennen ajoa. ${providerDataNotice()}`
      : `${tierLabel}: paikallinen kuva-animointi ei käytä maksullista videomallia.`;
  }

  function jobOutput(job) {
    const outputs = Array.isArray(job?.outputs) ? job.outputs : [];
    return outputs.find((output) => output.profile === selectedProfile()) || outputs[0] || null;
  }

  function renderJob(job = state.job) {
    const isActive = ACTIVE_STATES.has(job?.state);
    const isReady = job?.state === 'succeeded';
    const canRetry = job?.state === 'failed' || job?.state === 'cancelled';
    elements['video-job-state'].textContent = job ? (STATE_LABELS[job.state] || job.state) : 'Ei aloitettu';
    elements['video-job-tier'].textContent = job?.tier === 'final' ? 'Lopullinen' : 'Esikatselu';
    const progress = Math.max(0, Math.min(100, Number(job?.progress_percent || 0)));
    elements['video-render-progress'].hidden = !isActive;
    elements['video-render-progress'].setAttribute('aria-valuenow', String(progress));
    elements['video-progress-value'].style.width = `${progress}%`;
    elements['video-result-actions'].hidden = !isReady && !canRetry;
    elements['video-download'].hidden = !isReady;
    elements['video-retry'].hidden = !canRetry;
    const output = jobOutput(job);
    if (isReady && output?.url) {
      elements['video-player'].src = mediaUrl(output.url);
      elements['video-player'].hidden = false;
      elements['video-preview-placeholder'].hidden = true;
      elements['video-download'].href = mediaUrl(output.download_url || output.url);
      elements['video-download'].download = output.filename || `skriptlab-${selectedProfile()}.mp4`;
    } else if (!isActive && !isReady) {
      elements['video-player'].removeAttribute('src');
      elements['video-player'].load();
      elements['video-player'].hidden = true;
      elements['video-preview-placeholder'].hidden = false;
    }
    if (job?.state === 'failed') {
      setNotice(job.error_message || 'Videon luonti epäonnistui. Voit yrittää turvallisesti uudelleen.', 'error');
    } else if (job?.state === 'cancelled') {
      setNotice('Videon luonti keskeytettiin. Kuvakäsikirjoitus säilyi muokattavana.', 'ready');
    } else if (isReady) {
      const degraded = job.degraded ? ' Vähintään yksi AI-klippi valmistui varapolulla.' : '';
      setNotice(`Video on valmis.${degraded}`, 'ready');
    } else if (isActive) {
      setNotice(`${STATE_LABELS[job.state] || 'Videota luodaan'} · ${progress} %`, 'loading');
    }
    renderClipStatuses(job);
    updateSteps(job);
    syncControls();
  }

  function requestShotlistPayload() {
    const voiceoverAsset = availableVoiceoverAsset();
    return {
      project_id: state.projectId,
      target_duration_s: Number(elements['video-duration'].value),
      aspect_ratios: selectedAspectRatios(),
      language: 'fi',
      style_hint: elements['video-style'].value.trim(),
      ai_clip_count: Number(elements['video-ai-count'].value),
      subtitles_enabled: elements['video-subtitles'].checked,
      voiceover_mode: elements['video-voiceover'].checked
        ? String(voiceoverAsset?.id || 'none')
        : 'none',
    };
  }

  function editableShotlistPayload() {
    const voiceoverAsset = availableVoiceoverAsset();
    return {
      project_id: state.projectId,
      schema_version: state.shotlist?.schema_version || 1,
      target_duration_s: Math.round(totalDuration() || Number(elements['video-duration'].value)),
      aspect_ratios: selectedAspectRatios(),
      language: state.shotlist?.language || 'fi',
      style_hint: elements['video-style'].value.trim(),
      shots: (state.shotlist?.shots || []).map((shot) => ({
        id: shot.id,
        kind: shot.kind,
        source_asset: shot.kind === 'card' ? null : (shot.source_asset || defaultSourceReference()),
        duration_s: Math.round(shot.duration_s),
        motion_prompt: shot.kind === 'ai_motion' ? (shot.motion_prompt || shot.prompt) : (shot.motion_prompt || null),
        motion_preset: ['ai_motion', 'kenburns'].includes(shot.kind) ? (shot.motion_preset || null) : null,
        model_name: shot.kind === 'ai_motion' ? (shot.model_name || null) : null,
        model_provider: shot.kind === 'ai_motion' ? (shot.model_provider || null) : null,
        motion_strength: Number(shot.motion_strength ?? 0.5),
        zoom: shot.kind === 'kenburns' ? (shot.zoom || { from: 1, to: 1.18, focus: 'center' }) : null,
        overlay: shot.overlay || {},
      })),
      audio: {
        voiceover_asset: elements['video-voiceover'].checked
          ? String(voiceoverAsset?.id || 'none')
          : 'none',
        music: state.shotlist?.audio?.music || { asset: null, gain_db: -18, duck_under_voice: true },
        subtitles: {
          ...(state.shotlist?.audio?.subtitles || {}),
          enabled: elements['video-subtitles'].checked,
          language: state.shotlist?.language || 'fi',
          source: 'voiceover_transcript',
        },
      },
      source_checksum: state.shotlist?.source_checksum || '',
    };
  }

  async function generateShotlist() {
    if (!state.projectId || state.busy) return;
    if (state.shotlist?.shots?.length && !window.confirm('Korvataanko nykyinen kuvakäsikirjoitus uudella versiolla?')) return;
    setBusy(true, 'Muodostetaan kuvakäsikirjoitusta projektin aineistoista…');
    try {
      const payload = await api('/api/video/shotlists', {
        method: 'POST',
        ...jsonBody(requestShotlistPayload()),
      });
      state.shotlist = normalizeShotlist(payload);
      if (!state.shotlist?.id) throw new Error('Kuvakäsikirjoitusta ei voitu tallentaa.');
      resetSaveState();
      const defaultsApplied = applySingleSceneDefaults(state.shotlist);
      if (defaultsApplied) state.editRevision += 1;
      renderShotlist();
      if (defaultsApplied && !await saveShotlist()) return;
      await refreshEstimate('final');
      setNotice(payload?.warning || 'Kuvakäsikirjoitus on valmis muokattavaksi.', 'ready');
    } catch (error) {
      setNotice(error.message, 'error', 'Yritä uudelleen');
    } finally {
      setBusy(false);
    }
  }

  function resetSaveState() {
    window.clearTimeout(state.saveTimer);
    state.saveTimer = null;
    state.savePromise = null;
    state.editRevision = 0;
    state.savedRevision = 0;
  }

  async function saveShotlist() {
    window.clearTimeout(state.saveTimer);
    state.saveTimer = null;
    if (!state.shotlist?.id || ACTIVE_STATES.has(state.job?.state)) return false;
    if (!shotlistDurationIsValid()) {
      setNotice('Kohtausten yhteiskeston pitää olla 3–35 sekuntia ennen tallennusta.', 'error');
      syncControls();
      return false;
    }

    if (state.savePromise) {
      const priorSaved = await state.savePromise;
      if (!priorSaved) return false;
    }
    if (state.savedRevision >= state.editRevision) return true;

    const shotlistId = state.shotlist.id;
    const revision = state.editRevision;
    const requestPayload = editableShotlistPayload();
    const saveRequest = (async () => {
      try {
        const payload = await api(`/api/video/shotlists/${encodeURIComponent(shotlistId)}`, {
          method: 'PUT',
          ...jsonBody(requestPayload),
        });
        const sameShotlist = state.shotlist?.id === shotlistId;
        if (sameShotlist && revision <= state.editRevision) {
          state.savedRevision = Math.max(state.savedRevision, revision);
        }
        if (sameShotlist && revision === state.editRevision) {
          const updated = normalizeShotlist(payload);
          if (updated) state.shotlist = updated;
        }
        if (sameShotlist) setNotice('Muutokset tallennettu.', 'ready');
        return sameShotlist;
      } catch (error) {
        setNotice(`Tallennus epäonnistui: ${error.message}`, 'error', 'Yritä uudelleen');
        return false;
      }
    })();
    state.savePromise = saveRequest;
    const saved = await saveRequest;
    if (state.savePromise === saveRequest) state.savePromise = null;
    if (!saved) return false;
    if (state.shotlist?.id === shotlistId && state.savedRevision < state.editRevision) {
      return saveShotlist();
    }
    return state.shotlist?.id === shotlistId;
  }

  function scheduleSave() {
    state.editRevision += 1;
    window.clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(() => {
      state.saveTimer = null;
      void saveShotlist();
    }, 700);
  }

  async function refreshEstimate(tier = 'final') {
    const estimateToken = ++state.estimateToken;
    if (!state.shotlist?.id) {
      state.estimate = null;
      state.estimateTier = tier;
      renderEstimate();
      return false;
    }
    try {
      const estimate = await api('/api/video/jobs/estimate', {
        method: 'POST',
        ...jsonBody({
          shotlist_id: state.shotlist.id,
          tier,
          profiles: selectedProfilesForTier(tier),
          no_ai: !aiMotionEnabled(),
        }),
      });
      if (estimateToken !== state.estimateToken) return false;
      state.estimate = estimate;
      state.estimateTier = tier;
      renderEstimate();
      return true;
    } catch (error) {
      if (estimateToken !== state.estimateToken) return false;
      state.estimate = null;
      state.estimateTier = tier;
      renderEstimate();
      console.warn('Videon kustannusarviota ei voitu päivittää.', error);
      return false;
    }
  }

  function scheduleEstimate() {
    window.clearTimeout(state.estimateTimer);
    state.estimateTimer = window.setTimeout(async () => {
      state.estimateTimer = null;
      if (await saveShotlist()) await refreshEstimate('final');
    }, 850);
  }

  async function startJob(tier) {
    if (!state.shotlist?.id || state.busy) return;
    if (!singleScenePilotIsReady()) {
      setNotice(
        'Kokeiluvaiheessa voidaan renderöidä yksi 8 sekunnin kohtaus. Luo kuvakäsikirjoitus uudelleen.',
        'error',
      );
      return;
    }
    window.clearTimeout(state.saveTimer);
    window.clearTimeout(state.estimateTimer);
    const saveRequest = saveShotlist();
    setBusy(true, 'Varmistetaan kuvakäsikirjoituksen uusin versio…');
    try {
      const saved = await saveRequest;
      if (!saved) return;
      if (!await refreshEstimate(tier)) {
        const label = tier === 'final' ? 'Lopullista renderöintiä' : 'Esikatselua';
        setNotice(`Kustannusarviota ei saatu. ${label} ei käynnistetty.`, 'error', 'Yritä uudelleen');
        return;
      }
      const amount = Number(state.estimate?.estimated_cost_eur ?? state.estimate?.cost_eur ?? 0);
      const tierLabel = tier === 'final' ? 'Lopullisen videon' : 'AI-esikatselun';
      const confirmCost = amount <= 0 || window.confirm(
        `${tierLabel} arvioitu kustannus on ${amount.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €. ${providerDataNotice()} Aloitetaanko renderöinti?`,
      );
      if (!confirmCost) return;
      setNotice(tier === 'final' ? 'Aloitetaan lopullisen videon renderöinti…' : 'Aloitetaan esikatselu…', 'loading');
      const canPromote = tier === 'final'
        && state.job?.tier === 'preview'
        && state.job?.state === 'succeeded'
        && state.job?.shotlist_id === state.shotlist.id;
      const endpoint = canPromote
        ? `/api/video/jobs/${encodeURIComponent(state.job.id)}/promote`
        : '/api/video/jobs';
      const request = {
        profiles: selectedProfilesForTier(tier),
        no_ai: !aiMotionEnabled(),
        confirmed_cost: confirmCost,
        confirmed_cost_eur: Number(amount.toFixed(2)),
      };
      if (!canPromote) {
        request.tier = tier;
        request.shotlist_id = state.shotlist.id;
      }
      state.job = await api(endpoint, {
        method: 'POST',
        ...jsonBody(request),
      });
      renderJob();
      startPolling();
    } catch (error) {
      setNotice(error.message, 'error', 'Yritä uudelleen');
    } finally {
      setBusy(false);
    }
  }

  function stopPolling() {
    window.clearTimeout(state.pollTimer);
    state.pollTimer = null;
  }

  async function pollJob() {
    if (!state.job?.id) return;
    try {
      state.job = await api(`/api/video/jobs/${encodeURIComponent(state.job.id)}`);
      renderJob();
      if (!TERMINAL_STATES.has(state.job.state)) {
        state.pollTimer = window.setTimeout(pollJob, 1400);
      }
    } catch (error) {
      setNotice(`Työn tilaa ei saatu päivitettyä: ${error.message}`, 'error', 'Yritä uudelleen');
      state.pollTimer = window.setTimeout(pollJob, 3500);
    }
  }

  function startPolling() {
    stopPolling();
    if (state.job?.id && !TERMINAL_STATES.has(state.job.state)) pollJob();
  }

  async function cancelJob() {
    if (!state.job?.id || !ACTIVE_STATES.has(state.job.state)) return;
    const paidProviderMayBeRunning = (state.job?.clips || []).some((clip) => (
      ['veo', 'omni', 'higgsfield'].includes(String(clip?.provider || '').trim().toLowerCase())
      && String(clip?.provider_request_id || '').trim()
      && clip?.state !== 'completed'
    ));
    const providerWarning = paidProviderMayBeRunning
      ? ' Jo videopalvelulle lähetetty maksullinen työ voi silti valmistua ja tulla veloitetuksi.'
      : '';
    if (!window.confirm(`Keskeytetäänkö videon luonti? Valmis kuvakäsikirjoitus säilyy.${providerWarning}`)) return;
    try {
      state.job = await api(`/api/video/jobs/${encodeURIComponent(state.job.id)}/cancel`, { method: 'POST' });
      renderJob();
    } catch (error) {
      setNotice(error.message, 'error');
    }
  }

  async function retryJob() {
    if (!state.job?.id || state.busy || !['failed', 'cancelled'].includes(state.job.state)) return;
    let retryEstimate;
    try {
      retryEstimate = await api(
        `/api/video/jobs/${encodeURIComponent(state.job.id)}/retry/estimate`,
        { method: 'POST' },
      );
    } catch (error) {
      setNotice(`Kustannusarviota ei saatu: ${error.message}`, 'error', 'Yritä uudelleen');
      return;
    }
    const amount = Number(retryEstimate?.estimated_cost_eur ?? retryEstimate?.cost_eur ?? 0);
    const resumableProviderClips = (state.job?.clips || []).filter((clip) => (
      ['veo', 'omni', 'higgsfield'].includes(String(clip?.provider || '').trim().toLowerCase())
      && String(clip?.provider_request_id || '').trim()
      && clip?.state !== 'completed'
    ));
    const resumesProviderRequest = resumableProviderClips.length > 0;
    const resumeNotice = resumesProviderRequest
      ? (resumableProviderClips.length === 1
        ? 'Uudelleenyritys jatkaa aiempaa videopalvelun työtä samalla tunnisteella. Sitä ei lähetetä uutena videotyönä, mutta jo käynnistetty työ voi silti tulla veloitetuksi.'
        : 'Uudelleenyritys jatkaa aiempia videopalvelun töitä samoilla tunnisteilla. Niitä ei lähetetä uusina videotöinä, mutta jo käynnistetyt työt voivat silti tulla veloitetuiksi.')
      : '';
    const retryPrompt = amount > 0
      ? `Uudelleenyrityksen arvioitu kustannus on ${amount.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €. ${resumeNotice} ${providerDataNotice()} Aloitetaanko renderöinti?`
      : `${resumeNotice} Jatketaanko uudelleenyritystä?`;
    const confirmedCost = amount <= 0 && !resumesProviderRequest
      ? true
      : window.confirm(retryPrompt.trim());
    if (!confirmedCost) return;
    setBusy(true, 'Käynnistetään epäonnistunut työ uudelleen…');
    try {
      state.job = await api(`/api/video/jobs/${encodeURIComponent(state.job.id)}/retry`, {
        method: 'POST',
        ...jsonBody({
          confirmed_cost: confirmedCost,
          confirmed_cost_eur: Number(amount.toFixed(2)),
        }),
      });
      renderJob();
      startPolling();
    } catch (error) {
      setNotice(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function uploadShotSource(shotId, file) {
    const shot = state.shotlist?.shots?.find((item) => item.id === shotId);
    if (!shot || shot.kind === 'card' || !state.projectId || state.busy) return;
    setBusy(true, `Tuodaan kuvaa kohtaukseen ${Number(shot.order || 0) + 1}…`);
    try {
      const form = new FormData();
      form.append('file', file);
      const payload = await api(`/api/video/projects/${encodeURIComponent(state.projectId)}/source-images`, {
        method: 'POST',
        body: form,
      });
      const sourceImage = normalizeSourceImage(payload);
      if (!sourceImage) throw new Error('Palvelin ei palauttanut tuotua kuvalähdettä.');
      state.sourceImages = sortSourceImages([
        sourceImage,
        ...state.sourceImages.filter((asset) => asset.reference !== sourceImage.reference),
      ]);
      if (state.context) state.context.source_images = state.sourceImages.map((asset) => ({ ...asset }));
      const currentShot = state.shotlist?.shots?.find((item) => item.id === shotId);
      if (!currentShot) return;
      currentShot.source_asset = sourceImage.reference;
      renderShotlist();
      scheduleSave();
      if (!await saveShotlist()) return;
      await refreshEstimate('final');
      setNotice(`Kuva “${sourceImage.title || file.name}” on kohtauksen kuvalähde.`, 'ready');
    } catch (error) {
      setNotice(`Kuvan tuonti epäonnistui: ${error.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function regenerateShot(shotId) {
    const sourceJobId = state.job?.id;
    const shot = state.shotlist?.shots?.find((item) => item.id === shotId);
    if (
      !sourceJobId
      || state.job?.state !== 'succeeded'
      || state.job?.shotlist_id !== state.shotlist?.id
      || !shot
      || !(state.job?.clips || []).some((clip) => String(clip?.shot_id) === String(shotId))
      || state.busy
    ) return;
    window.clearTimeout(state.saveTimer);
    window.clearTimeout(state.estimateTimer);
    setBusy(true, `Valmistellaan kohtauksen ${Number(shot.order || 0) + 1} uudelleenluontia…`);
    try {
      if (!await saveShotlist()) return;
      const basePath = `/api/video/jobs/${encodeURIComponent(sourceJobId)}/clips/${encodeURIComponent(shotId)}`;
      const estimate = await api(`${basePath}/estimate`, { method: 'POST' });
      const amount = Number(estimate?.estimated_cost_eur || 0);
      const requiresConfirmation = estimate?.requires_confirmation == null
        ? amount > 0
        : Boolean(estimate.requires_confirmation);
      const provider = providerLabel(estimate?.provider);
      const model = String(estimate?.model || '').trim();
      const modelLabel = model ? ` · ${model}` : '';
      let confirmedCost = false;
      if (requiresConfirmation) {
        confirmedCost = window.confirm(
          `Kohtauksen uudelleenluonnin arvioitu kustannus on ${amount.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € (${provider}${modelLabel}). ${providerDataNotice()} Luodaanko kohtaus uudelleen?`,
        );
        if (!confirmedCost) {
          setNotice('Kohtauksen uudelleenluonti peruttiin.', 'ready');
          return;
        }
      }
      setNotice(`Luodaan kohtaus ${Number(shot.order || 0) + 1} uudelleen…`, 'loading');
      const payload = await api(`${basePath}/regenerate`, {
        method: 'POST',
        ...jsonBody({
          confirmed_cost: confirmedCost,
          confirmed_cost_eur: Number(amount.toFixed(2)),
        }),
      });
      state.job = payload?.job || payload;
      renderJob();
      startPolling();
    } catch (error) {
      setNotice(`Kohtausta ei voitu luoda uudelleen: ${error.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  function addShot() {
    if (!state.shotlist) return;
    if (!canAddShot()) {
      setNotice(
        SINGLE_SCENE_PILOT.enabled
          ? 'Monen kohtauksen video avataan myöhemmässä vaiheessa. Lisää kohtaus -toiminto on jo valmiina.'
          : 'Kohtausta ei voi lisätä: enimmäismäärä on 8 ja yhteiskeston raja 35 sekuntia.',
        'error',
      );
      return;
    }
    const index = state.shotlist.shots.length;
    const duration = Math.min(3, SHOT_LIMITS.maximumDuration - totalDuration());
    const shotId = `shot_${Date.now()}_${index + 1}`;
    state.shotlist.shots.push(normalizeShot({
      id: shotId,
      title: '',
      kind: 'kenburns',
      source_asset: defaultSourceReference(),
      duration_s: duration,
      prompt: SINGLE_SCENE_PROMPT,
      overlay_text: '',
    }, index));
    renderShotlist();
    scheduleSave();
    scheduleEstimate();
    setNotice(`Kohtaus ${index + 1} lisättiin.`, 'ready');
    window.requestAnimationFrame(() => {
      Array.from(document.querySelectorAll('.shot-card'))
        .find((card) => card.dataset.shotId === shotId)
        ?.querySelector('.shot-prompt')?.focus();
    });
  }

  function removeShot(shotId) {
    if (!state.shotlist) return;
    const removedIndex = state.shotlist.shots.findIndex((shot) => shot.id === shotId);
    const removedShot = state.shotlist.shots[removedIndex];
    if (!removedShot || !canRemoveShot(removedShot)) {
      setNotice('Kohtausta ei voi poistaa, jos video jäisi ilman kohtausta tai alle 3 sekunnin mittaiseksi.', 'error');
      return;
    }
    state.shotlist.shots = state.shotlist.shots.filter((shot) => shot.id !== shotId)
      .map((shot, index) => ({ ...shot, order: index }));
    renderShotlist();
    scheduleSave();
    scheduleEstimate();
    setNotice(`Kohtaus ${removedIndex + 1} poistettiin.`, 'ready');
    window.requestAnimationFrame(() => {
      const nextIndex = Math.min(removedIndex, state.shotlist.shots.length - 1);
      const nextShot = state.shotlist.shots[nextIndex];
      if (nextShot) {
        Array.from(document.querySelectorAll('.shot-card'))
          .find((card) => card.dataset.shotId === nextShot.id)
          ?.querySelector('.drag-handle')?.focus();
      } else {
        elements['video-add-shot'].focus();
      }
    });
  }

  function reorderShot(sourceId, targetId) {
    if (
      state.busy
      || ACTIVE_STATES.has(state.job?.state)
      || !sourceId
      || !targetId
      || sourceId === targetId
      || !state.shotlist
    ) return;
    const shots = [...state.shotlist.shots];
    const from = shots.findIndex((shot) => shot.id === sourceId);
    const to = shots.findIndex((shot) => shot.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = shots.splice(from, 1);
    shots.splice(to, 0, moved);
    state.shotlist.shots = shots.map((shot, index) => ({ ...shot, order: index }));
    renderShotlist();
    scheduleSave();
  }

  function settingsChanged(event) {
    renderFormat();
    if (state.shotlist) {
      if (event?.currentTarget === elements['video-ai-count']) {
        applySingleSceneDefaults(state.shotlist);
        renderShotlist();
      }
      state.shotlist.style_hint = elements['video-style'].value.trim();
      state.shotlist.aspect_ratios = selectedAspectRatios();
      state.shotlist.audio.subtitles = {
        ...(state.shotlist.audio.subtitles || {}),
        enabled: elements['video-subtitles'].checked,
      };
      state.shotlist.audio.voiceover_asset = elements['video-voiceover'].checked
        ? String(availableVoiceoverAsset()?.id || 'none')
        : 'none';
      scheduleSave();
      scheduleEstimate();
    }
  }

  function previewProfileChanged() {
    renderFormat();
    renderJob();
  }

  function finalProfilesChanged(event) {
    if (!finalProfileInputs().some((input) => input.checked)) {
      event.currentTarget.checked = true;
      setNotice('Valitse lopulliseen renderöintiin vähintään yksi formaatti.', 'error');
      return;
    }
    if (state.shotlist) {
      state.shotlist.aspect_ratios = selectedAspectRatios();
      scheduleSave();
      scheduleEstimate();
    } else {
      renderEstimate();
    }
  }

  function restoreFinalProfiles(aspectRatios) {
    const ratios = new Set(Array.isArray(aspectRatios) && aspectRatios.length ? aspectRatios : ['9:16']);
    finalProfileInputs().forEach((input) => {
      input.checked = ratios.has(PROFILE_LABELS[input.value].ratio);
    });
    if (!finalProfileInputs().some((input) => input.checked)) {
      const story = finalProfileInputs().find((input) => input.value === 'story');
      if (story) story.checked = true;
    }
  }

  async function loadWorkspace() {
    stopPolling();
    state.projectId = projectIdFromPage();
    if (!state.projectId) {
      state.context = null;
      state.sourceImages = [];
      elements['video-project-name'].textContent = 'Valitse projekti SkriptLabin työtilasta';
      setNotice('Videostudio tarvitsee aktiivisen projektin. Valitse projekti sivuvalikosta ja palaa tähän näkymään.', 'error');
      syncControls();
      return;
    }
    setBusy(true, 'Ladataan projektin videokontekstia…');
    try {
      const [context, presets, latestShotlist, latestJob] = await Promise.all([
        api(`/api/video/context?project_id=${state.projectId}`),
        api('/api/video/presets'),
        api(`/api/video/shotlists/latest?project_id=${state.projectId}`).catch((error) => error.status === 404 ? null : Promise.reject(error)),
        api(`/api/video/jobs/latest?project_id=${state.projectId}`).catch((error) => error.status === 404 ? null : Promise.reject(error)),
      ]);
      state.context = context;
      state.sourceImages = normalizeSourceImages(context);
      state.presets = presets;
      state.shotlist = normalizeShotlist(latestShotlist);
      resetSaveState();
      state.job = latestJob?.job || latestJob || null;
      const aiVideoAvailable = Boolean(presets?.provider?.ai_video_available);
      const maxAiClips = aiVideoAvailable ? Math.max(0, Math.min(1, Number(presets?.max_ai_clips ?? 1))) : 0;
      elements['video-ai-count'].querySelectorAll('option').forEach((option) => {
        option.disabled = Number(option.value) > maxAiClips;
      });
      if (Number(elements['video-ai-count'].value) > maxAiClips) {
        elements['video-ai-count'].value = String(maxAiClips);
      }
      if (!aiVideoAvailable || maxAiClips === 0) {
        elements['video-ai-count'].title = 'Ulkoinen AI-videopalvelu ei ole käytössä. Paikallinen kuva-animointi on saatavilla.';
      } else {
        elements['video-ai-count'].removeAttribute('title');
      }
      renderContext();
      restoreFinalProfiles(state.shotlist?.aspect_ratios);
      if (state.shotlist) {
        const savedAiCount = state.shotlist.shots.filter((shot) => shot.kind === 'ai_motion').length;
        elements['video-ai-count'].value = String(Math.min(savedAiCount, maxAiClips));
        const savedRatio = state.shotlist.aspect_ratios?.[0];
        const savedProfile = Object.entries(PROFILE_LABELS).find(([, item]) => item.ratio === savedRatio)?.[0];
        if (savedProfile) elements['video-profile'].value = savedProfile;
        elements['video-duration'].value = ['8'].includes(String(state.shotlist.target_duration_s))
          ? String(state.shotlist.target_duration_s)
          : '8';
        elements['video-style'].value = state.shotlist.style_hint || elements['video-style'].value;
        elements['video-subtitles'].checked = state.shotlist.audio?.subtitles?.enabled !== false;
        elements['video-voiceover'].checked = Boolean(availableVoiceoverAsset())
          && !['', 'none', 'null'].includes(String(state.shotlist.audio?.voiceover_asset || '').toLowerCase());
        if (migrateLegacySingleScenePrompt(state.shotlist)) {
          state.editRevision += 1;
          await saveShotlist();
        }
      }
      syncVoiceoverAvailability();
      renderShotlist();
      renderFormat();
      renderJob();
      await refreshEstimate('final');
      const providerConfigurationError = String(presets?.provider?.configuration_error || '').trim();
      const jobIsActive = Boolean(state.job && ACTIVE_STATES.has(state.job.state));
      if (jobIsActive) startPolling();
      if (providerConfigurationError) setNotice(providerConfigurationError, 'error');
      else if (!jobIsActive && !state.shotlist) setNotice('Projektin aineistot ovat valmiit kuvakäsikirjoitusta varten.', 'ready');
      else if (!jobIsActive && !singleScenePilotIsReady()) {
        setNotice(
          'Tallennetussa kuvakäsikirjoituksessa on vanhan version useita kohtauksia tai muu kesto. Luo uusi yhden 8 sekunnin kohtauksen versio.',
          'error',
        );
      } else if (!jobIsActive && state.job?.state !== 'succeeded') setNotice('Tallennettu kuvakäsikirjoitus ladattiin.', 'ready');
    } catch (error) {
      setNotice(error.message, 'error', 'Yritä uudelleen');
    } finally {
      setBusy(false);
    }
  }

  function bindEvents() {
    elements['video-generate']?.addEventListener('click', generateShotlist);
    elements['video-regenerate'].addEventListener('click', generateShotlist);
    elements['video-add-shot'].addEventListener('click', addShot);
    elements['video-preview'].addEventListener('click', () => startJob('preview'));
    elements['video-render'].addEventListener('click', () => startJob('final'));
    elements['video-cancel'].addEventListener('click', cancelJob);
    elements['video-retry'].addEventListener('click', retryJob);
    elements['video-notice-action'].addEventListener('click', loadWorkspace);
    elements['video-profile'].addEventListener('change', previewProfileChanged);
    finalProfileInputs().forEach((input) => input.addEventListener('change', finalProfilesChanged));
    ['video-duration', 'video-ai-count', 'video-style', 'video-subtitles', 'video-voiceover']
      .forEach((id) => {
        elements[id].addEventListener('change', settingsChanged);
        if (id === 'video-style') elements[id].addEventListener('input', settingsChanged);
      });
    window.addEventListener('beforeunload', stopPolling);
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
    renderFormat();
    renderEstimate();
    await loadWorkspace();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
