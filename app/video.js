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
    minimumDuration: 12,
    maximumDuration: 35,
    minimumShotDuration: 2,
    maximumAiShots: 3,
  });
  const OPENING_SCENE_PROMPTS = Object.freeze([
    'Present the uploaded cover as the unchanged front face of a physical book resting on a simple neutral tabletop or held naturally in one hand, then make a slow, steady camera push toward the cover. Treat all existing lettering only as source-image pixels: do not generate, redraw, rewrite, replace, morph, or animate any text, and add no new readable text.',
    'Continue by pushing through the center of the uploaded cover artwork so the original printed lettering leaves the frame naturally through camera crop while the artwork gains subtle parallax and slow cinematic motion. Do not erase, redraw, rewrite, replace, morph, or generate any letters. Keep the frame free of readable overlay text.',
    'Let the cover artwork decelerate and settle into a completely still end frame. Do not create or render any readable text; the title, author, and campaign copy are added later as deterministic video overlays.',
  ]);

  const elements = {};
  const state = {
    projectId: null,
    context: null,
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
    return {
      id: String(raw?.id || raw?.shot_id || `shot_${index + 1}`),
      order: index,
      kind: ['ai_motion', 'kenburns', 'card'].includes(raw?.kind) ? raw.kind : 'kenburns',
      title: String(raw?.title || raw?.name || overlay.title || ''),
      duration_s: Math.max(2, Math.min(20, Math.round(Number(raw?.duration_s || raw?.duration || 4)))),
      prompt: String(raw?.motion_prompt || raw?.prompt || raw?.visual_prompt || ''),
      overlay_text: String(overlayText),
      source_asset: raw?.source_asset ?? (raw?.kind === 'card' ? null : 'cover'),
      motion_prompt: String(raw?.motion_prompt || raw?.prompt || ''),
      motion_preset: raw?.motion_preset || null,
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
      target_duration_s: Number(data.target_duration_s || elements['video-duration'].value || 20),
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
    if (/^https?:\/\//i.test(raw)) return raw;
    return apiUrl(raw.startsWith('/') ? raw : `/${raw}`);
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

  function canAddShot() {
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
    return Boolean(cover?.id || cover?.url || cover?.data_url || cover?.content_data_url);
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

  function ensureThreeOpeningScenes(shotlist) {
    if (!shotlist?.shots) return false;
    let changed = false;
    while (shotlist.shots.length < 3) {
      const donor = shotlist.shots
        .map((shot, index) => ({ shot, index, spare: shot.duration_s - minimumDurationForShot(shot) }))
        .sort((left, right) => right.spare - left.spare)[0];
      if (!donor || donor.spare < SHOT_LIMITS.minimumShotDuration) break;
      const duration = Math.min(4, donor.spare);
      donor.shot.duration_s -= duration;
      const index = shotlist.shots.length;
      shotlist.shots.push(normalizeShot({
        id: `shot_opening_${Date.now()}_${index + 1}`,
        kind: coverIsAvailable() ? 'kenburns' : 'card',
        source_asset: coverIsAvailable() ? 'cover' : null,
        duration_s: duration,
        motion_prompt: OPENING_SCENE_PROMPTS[index],
        zoom: coverIsAvailable() ? { from: 1.18, to: 1.18, focus: 'center' } : null,
        overlay: {},
      }, index));
      changed = true;
    }
    return changed;
  }

  function applyOpeningSceneDefaults(shotlist) {
    if (!shotlist?.shots?.length || !coverIsAvailable()) return false;
    let changed = ensureThreeOpeningScenes(shotlist);
    const finalOverlay = openingSceneOverlay();
    shotlist.shots.slice(0, 3).forEach((shot, index) => {
      const previous = JSON.stringify(shot);
      const hasCover = coverIsAvailable();
      if (hasCover && shot.kind === 'card') shot.kind = 'kenburns';
      shot.source_asset = shot.kind === 'card' ? null : (shot.source_asset || 'cover');
      shot.prompt = OPENING_SCENE_PROMPTS[index];
      shot.motion_prompt = OPENING_SCENE_PROMPTS[index];
      if (shot.kind === 'kenburns') {
        shot.zoom = index === 0
          ? { from: 1, to: 1.35, focus: 'center' }
          : (index === 1
            ? { from: 1.35, to: 2.35, focus: 'center' }
            : { from: 2.35, to: 2.35, focus: 'center' });
      } else {
        shot.zoom = null;
      }
      if (index < 2) {
        shot.title = '';
        shot.overlay_text = '';
        shot.overlay = { position: 'bottom' };
      } else {
        shot.title = String(finalOverlay.title || '');
        shot.overlay_text = String(finalOverlay.cta || finalOverlay.subtitle || '');
        shot.overlay = finalOverlay;
      }
      shot.order = index;
      changed = changed || previous !== JSON.stringify(shot);
    });
    shotlist.target_duration_s = Math.round(
      shotlist.shots.reduce((sum, shot) => sum + Number(shot.duration_s || 0), 0),
    );
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
    return Boolean(
      state.presets?.provider?.ai_video_available
      && state.shotlist?.shots?.some((shot) => shot.kind === 'ai_motion'),
    );
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
    const jobActive = ACTIVE_STATES.has(state.job?.state);
    elements['video-generate'].disabled = !hasProject || state.busy || jobActive;
    elements['video-regenerate'].disabled = !hasProject || !hasShots || state.busy || jobActive;
    elements['video-add-shot'].disabled = !hasShots || !canAddShot() || state.busy || jobActive;
    elements['video-add-shot'].title = canAddShot()
      ? 'Lisää kohtaus'
      : 'Kohtauksia voi olla enintään 8 ja yhteiskesto voi olla enintään 35 sekuntia.';
    elements['video-preview'].disabled = !validDuration || state.busy || jobActive;
    elements['video-render'].disabled = !validDuration || state.busy || jobActive;
    elements['video-cancel'].hidden = !jobActive;
    [
      'video-duration', 'video-profile', 'video-ai-count', 'video-style',
      'video-subtitles',
    ].forEach((id) => {
      elements[id].disabled = state.busy || jobActive;
    });
    elements['video-final-profiles'].disabled = state.busy || jobActive;
    syncVoiceoverAvailability();
    document.querySelectorAll('.shot-card input, .shot-card select, .shot-card textarea, .shot-card button')
      .forEach((input) => {
        const motionOnly = input.classList.contains('shot-motion-preset');
        const isAiMotion = input.closest('.shot-card')?.querySelector('.shot-kind')?.value === 'ai_motion';
        const shot = state.shotlist?.shots?.find((item) => item.id === input.closest('.shot-card')?.dataset.shotId);
        const cannotDelete = input.classList.contains('shot-delete') && !canRemoveShot(shot);
        input.disabled = state.busy || jobActive || cannotDelete || (motionOnly && !isAiMotion);
        if (input.classList.contains('shot-delete')) {
          input.title = cannotDelete
            ? 'Poisto laskisi videon yhteiskeston alle 12 sekunnin.'
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
    const coverUrl = cover?.url || cover?.data_url || cover?.content_data_url || '';
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

  function syncShotMotionEditor(card, shot) {
    const settings = card.querySelector('.shot-motion-settings');
    const select = card.querySelector('.shot-motion-preset');
    const isAiMotion = shot.kind === 'ai_motion';
    settings.hidden = !isAiMotion;
    select.disabled = !isAiMotion || state.busy || ACTIVE_STATES.has(state.job?.state);
    select.setAttribute('aria-label', `Kohtauksen ${shot.order + 1} AI-liikepresetti`);
  }

  function shotFieldChanged(card) {
    const shot = state.shotlist?.shots.find((item) => item.id === card.dataset.shotId);
    if (!shot) return;
    const kindInput = card.querySelector('.shot-kind');
    const nextKind = kindInput.value;
    const otherAiShots = state.shotlist.shots.filter((item) => item.id !== shot.id && item.kind === 'ai_motion').length;
    if (nextKind === 'ai_motion' && otherAiShots >= SHOT_LIMITS.maximumAiShots) {
      kindInput.value = shot.kind;
      setNotice('Kuvakäsikirjoituksessa voi olla enintään kolme AI-liikekohtausta.', 'error');
      return;
    }
    shot.kind = nextKind;
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
    shot.motion_preset = shot.kind === 'ai_motion'
      ? (card.querySelector('.shot-motion-preset').value || null)
      : shot.motion_preset;
    shot.source_asset = shot.kind === 'card' ? null : (shot.source_asset || 'cover');
    shot.motion_prompt = shot.kind === 'ai_motion'
      ? (shot.prompt || 'Slow cinematic camera movement. Preserve all book-cover typography exactly; no text distortion or morphing.')
      : (shot.prompt || null);
    shot.zoom = shot.kind === 'kenburns' ? (shot.zoom || { from: 1, to: 1.18, focus: 'center' }) : null;
    shot.overlay = shot.kind === 'card'
      ? { ...shot.overlay, title: shot.title || null, cta: shot.overlay_text || null, quote: null, position: 'center' }
      : { ...shot.overlay, title: shot.title || null, quote: shot.overlay_text || null, cta: null, position: shot.overlay?.position || 'bottom' };
    syncShotMotionEditor(card, shot);
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
    const titleInput = card.querySelector('.shot-title');
    titleInput.value = shot.title;
    titleInput.setAttribute('aria-label', `Kohtauksen ${sceneNumber} ruudulla näkyvä otsikko`);
    const promptInput = card.querySelector('.shot-prompt');
    promptInput.value = shot.prompt;
    promptInput.setAttribute('aria-label', `Kohtauksen ${sceneNumber} liike- ja kuvausprompti`);
    const overlayInput = card.querySelector('.shot-overlay');
    overlayInput.value = shot.overlay_text;
    overlayInput.setAttribute('aria-label', `Kohtauksen ${sceneNumber} muu ruudulla näkyvä teksti`);
    card.querySelector('.shot-motion-preset').value = shot.motion_preset || '';
    syncShotMotionEditor(card, shot);
    card.querySelectorAll('input, select, textarea').forEach((input) => {
      input.addEventListener('input', () => shotFieldChanged(card));
      input.addEventListener('change', () => shotFieldChanged(card));
    });
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
      event.preventDefault();
      if (state.draggedShotId && state.draggedShotId !== shot.id) card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', (event) => {
      event.preventDefault();
      card.classList.remove('drag-over');
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
      if (!clip) {
        status.hidden = true;
        status.textContent = '';
        status.removeAttribute('data-state');
        return;
      }
      const failed = Boolean(clip.error) && clip.state !== 'completed';
      const fallback = Boolean(clip.error) && clip.state === 'completed';
      const provider = clip.provider === 'higgsfield'
        ? 'AI-klippi'
        : (clip.provider === 'card' ? 'Tekstikortti' : 'Paikallinen liike');
      const label = fallback
        ? 'Valmis varapolulla'
        : (failed ? 'Epäonnistui' : (CLIP_STATE_LABELS[clip.state] || clip.state));
      status.hidden = false;
      status.dataset.state = failed ? 'failed' : clip.state;
      status.textContent = `${provider} · ${label}`;
      status.title = clip.error || '';
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
    const amount = Number(estimate?.estimated_cost_eur ?? estimate?.cost_eur ?? 0);
    elements['video-cost'].textContent = `${amount.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
    const provider = estimate?.provider || (Number(elements['video-ai-count'].value) > 0 ? 'Higgsfield / paikallinen varapolku' : 'Paikallinen FFmpeg');
    const clipCount = Number(estimate?.billable_clip_count ?? elements['video-ai-count'].value ?? 0);
    const profileCount = Array.isArray(estimate?.profiles) ? estimate.profiles.length : selectedProfilesForTier(state.estimateTier).length;
    const tierLabel = state.estimateTier === 'preview' ? 'AI-esikatselu' : 'Lopullinen renderöinti';
    elements['video-cost-note'].textContent = amount > 0
      ? `${tierLabel}: ${clipCount} maksullista AI-klippiä, ${profileCount} ${profileCount === 1 ? 'formaatti' : 'formaattia'} · ${provider}. Hinta vahvistetaan ennen ajoa; kansikuva ja liikeprompti lähetetään Higgsfieldille.`
      : `${tierLabel}: paikallinen Ken Burns -koostaminen ei käytä maksullista videomallia.`;
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
      const degraded = job.degraded ? ' AI-klippi korvattiin paikallisella liikkeellä.' : '';
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
        source_asset: shot.kind === 'card' ? null : (shot.source_asset || 'cover'),
        duration_s: Math.round(shot.duration_s),
        motion_prompt: shot.kind === 'ai_motion' ? (shot.motion_prompt || shot.prompt) : (shot.motion_prompt || null),
        motion_preset: shot.kind === 'ai_motion' ? (shot.motion_preset || null) : null,
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
      const defaultsApplied = applyOpeningSceneDefaults(state.shotlist);
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
      setNotice('Kohtausten yhteiskeston pitää olla 12–35 sekuntia ennen tallennusta.', 'error');
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
        `${tierLabel} arvioitu kustannus on ${amount.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €. Kansikuva ja liikeprompti lähetetään Higgsfieldille. Aloitetaanko renderöinti?`,
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
        tier,
        profiles: selectedProfilesForTier(tier),
        no_ai: !aiMotionEnabled(),
        confirmed_cost: confirmCost,
      };
      if (!canPromote) request.shotlist_id = state.shotlist.id;
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
    if (!window.confirm('Keskeytetäänkö videon luonti? Valmis kuvakäsikirjoitus säilyy.')) return;
    try {
      state.job = await api(`/api/video/jobs/${encodeURIComponent(state.job.id)}/cancel`, { method: 'POST' });
      renderJob();
    } catch (error) {
      setNotice(error.message, 'error');
    }
  }

  async function retryJob() {
    if (!state.job?.id || state.busy || !['failed', 'cancelled'].includes(state.job.state)) return;
    if (!await refreshEstimate(state.job.tier)) {
      setNotice('Kustannusarviota ei saatu. Uudelleenyritystä ei käynnistetty.', 'error', 'Yritä uudelleen');
      return;
    }
    const amount = Number(state.estimate?.estimated_cost_eur ?? state.estimate?.cost_eur ?? 0);
    const confirmedCost = amount <= 0 || window.confirm(
      `Uudelleenyrityksen arvioitu kustannus on ${amount.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €. Aloitetaanko renderöinti?`,
    );
    if (!confirmedCost) return;
    setBusy(true, 'Käynnistetään epäonnistunut työ uudelleen…');
    try {
      state.job = await api(`/api/video/jobs/${encodeURIComponent(state.job.id)}/retry`, {
        method: 'POST',
        ...jsonBody({ confirmed_cost: confirmedCost }),
      });
      renderJob();
      startPolling();
    } catch (error) {
      setNotice(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  function addShot() {
    if (!state.shotlist) return;
    if (!canAddShot()) {
      setNotice('Kohtausta ei voi lisätä: enimmäismäärä on 8 ja yhteiskeston raja 35 sekuntia.', 'error');
      return;
    }
    const index = state.shotlist.shots.length;
    const duration = Math.min(3, SHOT_LIMITS.maximumDuration - totalDuration());
    const shotId = `shot_${Date.now()}_${index + 1}`;
    state.shotlist.shots.push(normalizeShot({
      id: shotId,
      title: '',
      kind: 'kenburns',
      duration_s: duration,
      prompt: 'Continue the established visual story with a calm cinematic move across the book-cover artwork. Preserve the original artwork and typography exactly; no distortion, melting, morphing, or invented lettering.',
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
      setNotice('Kohtausta ei voi poistaa, jos videon yhteiskesto laskisi alle 12 sekunnin.', 'error');
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
    if (!sourceId || !targetId || sourceId === targetId || !state.shotlist) return;
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

  function settingsChanged() {
    renderFormat();
    if (state.shotlist) {
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
      state.presets = presets;
      state.shotlist = normalizeShotlist(latestShotlist);
      resetSaveState();
      state.job = latestJob?.job || latestJob || null;
      const aiVideoAvailable = Boolean(presets?.provider?.ai_video_available);
      const maxAiClips = aiVideoAvailable ? Math.max(0, Math.min(3, Number(presets?.max_ai_clips ?? 3))) : 0;
      elements['video-ai-count'].querySelectorAll('option').forEach((option) => {
        option.disabled = Number(option.value) > maxAiClips;
      });
      if (Number(elements['video-ai-count'].value) > maxAiClips) {
        elements['video-ai-count'].value = String(maxAiClips);
      }
      if (!aiVideoAvailable || maxAiClips === 0) {
        elements['video-ai-count'].title = 'Ulkoinen AI-videopalvelu ei ole käytössä. Paikallinen Ken Burns -renderöinti on saatavilla.';
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
        elements['video-duration'].value = ['15', '20', '30'].includes(String(state.shotlist.target_duration_s))
          ? String(state.shotlist.target_duration_s)
          : '20';
        elements['video-style'].value = state.shotlist.style_hint || elements['video-style'].value;
        elements['video-subtitles'].checked = state.shotlist.audio?.subtitles?.enabled !== false;
        elements['video-voiceover'].checked = Boolean(availableVoiceoverAsset())
          && !['', 'none', 'null'].includes(String(state.shotlist.audio?.voiceover_asset || '').toLowerCase());
      }
      syncVoiceoverAvailability();
      renderShotlist();
      renderFormat();
      renderJob();
      await refreshEstimate('final');
      if (state.job && ACTIVE_STATES.has(state.job.state)) startPolling();
      else if (!state.shotlist) setNotice('Projektin aineistot ovat valmiit kuvakäsikirjoitusta varten.', 'ready');
      else if (state.job?.state !== 'succeeded') setNotice('Tallennettu kuvakäsikirjoitus ladattiin.', 'ready');
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
