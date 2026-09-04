(function () {
  'use strict';

  const SAVE_DELAY_MS = 750;
  const JOB_POLL_MS = 2400;
  const IMAGE_PROMPT_LIMIT = 2000;
  const ACTIVE_JOB_STATES = new Set(['queued', 'running']);
  const TERMINAL_JOB_STATES = new Set(['ready', 'failed']);
  const IMAGE_MIME_PATTERN = /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/]+=*$/i;
  const NO_TEXT_GUARD = 'No visible text, letters, subtitles, captions, logos, or watermarks.';
  const JOB_STORAGE_PREFIX = 'skriptlab_screenplay_job_v1_';
  const IMAGE_REQUEST_STORAGE_PREFIX = 'skriptlab_screenplay_image_request_v1_';
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const elements = {};
  const state = {
    projectId: null,
    workspace: null,
    manifest: null,
    revision: 0,
    chapters: [],
    staleSceneIds: new Set(),
    imageModels: [],
    textModels: [],
    textModelsLoading: false,
    textModelLoadError: '',
    assets: new Map(),
    assetRequests: new Map(),
    previewAssetObserver: null,
    selectedChapterId: null,
    selectedSceneId: null,
    activeView: 'world',
    dirty: false,
    conflict: false,
    changeSequence: 0,
    saveTimer: null,
    savePromise: null,
    saveController: null,
    loadGeneration: 0,
    loadController: null,
    generationController: null,
    imageController: null,
    pollController: null,
    pollTimer: null,
    operationActive: false,
    imageBusy: false,
    imageBusySceneId: null,
    pendingImageRequest: null,
    pendingJob: null,
    noticeAction: null,
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function collectElements() {
    [
      'screenplay-app', 'screenplay-open-video', 'screenplay-project-name',
      'screenplay-save-state', 'screenplay-save-label', 'screenplay-notice',
      'screenplay-notice-text', 'screenplay-notice-action', 'screenplay-project-empty',
      'screenplay-workspace', 'screenplay-world-panel', 'screenplay-scenes-panel',
      'screenplay-preview-panel', 'screenplay-export-panel', 'screenplay-text-model', 'screenplay-world-image-model',
      'screenplay-text-model-retry',
      'screenplay-style-hint', 'screenplay-adaptation-goal', 'screenplay-without-text',
      'screenplay-generate-world', 'screenplay-style-section', 'screenplay-manifest-title',
      'screenplay-logline', 'screenplay-synopsis', 'screenplay-style-prompt',
      'screenplay-cinematography-prompt', 'screenplay-aspect-ratio',
      'screenplay-world-entities', 'screenplay-characters-section',
      'screenplay-character-count', 'screenplay-character-list',
      'screenplay-locations-section', 'screenplay-location-count',
      'screenplay-location-list', 'screenplay-source-warning',
      'screenplay-scenes-summary', 'screenplay-chapter-select', 'screenplay-scene-count',
      'screenplay-replace-scenes', 'screenplay-generate-chapter', 'screenplay-scene-list',
      'screenplay-scenes-empty', 'screenplay-editor-empty', 'screenplay-scene-editor',
      'screenplay-scene-kicker', 'screenplay-scene-title', 'screenplay-scene-duration',
      'screenplay-scene-source-label', 'screenplay-scene-source-excerpt',
      'screenplay-scene-summary', 'screenplay-scene-script', 'screenplay-scene-continuity',
      'screenplay-scene-image-prompt', 'screenplay-scene-video-prompt',
      'screenplay-compiled-image-prompt', 'screenplay-compiled-video-prompt',
      'screenplay-scene-location', 'screenplay-scene-characters',
      'screenplay-selected-references', 'screenplay-image-model',
      'screenplay-image-size', 'screenplay-image-ratio', 'screenplay-scene-asset-select',
      'screenplay-image-request-prompt',
      'screenplay-scene-asset', 'screenplay-generate-scene-image',
      'screenplay-preview-image-model', 'screenplay-preview-image-size',
      'screenplay-preview-image-ratio', 'screenplay-preview-list', 'screenplay-preview-empty',
      'screenplay-export-stats', 'screenplay-export-scene-select',
      'screenplay-export-scene', 'screenplay-export-all', 'screenplay-entity-template',
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

  function stringValue(value, maximum = 0) {
    const text = String(value == null ? '' : value).trim();
    return maximum > 0 ? text.slice(0, maximum) : text;
  }

  function positiveInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
  }

  function clampInteger(value, minimum, maximum, fallback) {
    const number = Math.round(Number(value));
    return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
  }

  function deepClone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function createClientRequestId() {
    if (typeof window.crypto?.randomUUID === 'function') return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (typeof window.crypto?.getRandomValues === 'function') {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((part) => part.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function jsonOptions(payload, options = {}) {
    return {
      ...options,
      headers: { ...(options.headers || {}), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    };
  }

  function errorMessage(payload, fallback) {
    const detail = payload?.detail;
    if (Array.isArray(detail)) return detail.map((item) => item?.msg || String(item)).join(' ');
    if (detail && typeof detail === 'object') return stringValue(detail.message || fallback);
    return stringValue(detail || payload?.message || fallback);
  }

  async function api(path, options = {}) {
    let response;
    try {
      response = await window.SkriptLabAuth.fetch(path, options);
    } catch (cause) {
      if (cause?.name === 'AbortError') throw cause;
      const error = new Error('Yhteys SkriptLabin palvelimeen katkesi ennen vastausta. Tarkista verkkoyhteys ja yritä uudelleen.');
      error.isNetworkError = true;
      error.path = path;
      error.cause = cause;
      throw error;
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(errorMessage(payload, `Pyyntö epäonnistui (${response.status}).`));
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function setNotice(message, mode = 'ready', actionLabel = '', action = null) {
    const notice = elements['screenplay-notice'];
    if (!notice) return;
    notice.hidden = !message;
    notice.className = `screenplay-notice is-${mode}`;
    elements['screenplay-notice-text'].textContent = message || '';
    const button = elements['screenplay-notice-action'];
    state.noticeAction = typeof action === 'function' ? action : null;
    button.hidden = !actionLabel || !state.noticeAction;
    button.textContent = actionLabel || 'Yritä uudelleen';
  }

  function setSaveState(mode, label) {
    const container = elements['screenplay-save-state'];
    if (!container) return;
    container.className = `save-state${mode ? ` is-${mode}` : ''}`;
    elements['screenplay-save-label'].textContent = label;
  }

  function emptyManifest() {
    return {
      schema_version: 1,
      prompt_language: 'en',
      adaptation_language: 'fi',
      title: '',
      logline: '',
      synopsis: '',
      aspect_ratio: '16:9',
      without_text: true,
      visual_style_prompt: '',
      cinematography_prompt: '',
      visual_style_prompt_source: 'manual',
      cinematography_prompt_source: 'manual',
      characters: [],
      locations: [],
      scenes: [],
    };
  }

  function normalizePromptSource(value) {
    return value === 'generated' ? 'generated' : 'manual';
  }

  function normalizeCharacter(raw, index) {
    const assetId = positiveInteger(raw?.reference_asset_id);
    return {
      id: stringValue(raw?.id, 80) || `character-${index + 1}`,
      name: stringValue(raw?.name, 240),
      role: stringValue(raw?.role, 500),
      description: stringValue(raw?.description, 4000),
      visual_description: stringValue(raw?.visual_description, 4000),
      continuity_prompt: stringValue(raw?.continuity_prompt, 4000),
      image_prompt: stringValue(raw?.image_prompt, 4000),
      continuity_prompt_source: normalizePromptSource(raw?.continuity_prompt_source),
      image_prompt_source: normalizePromptSource(raw?.image_prompt_source),
      ...(assetId ? { reference_asset_id: assetId } : {}),
    };
  }

  function normalizeLocation(raw, index) {
    const assetId = positiveInteger(raw?.background_asset_id);
    return {
      id: stringValue(raw?.id, 80) || `location-${index + 1}`,
      name: stringValue(raw?.name, 240),
      description: stringValue(raw?.description, 4000),
      visual_description: stringValue(raw?.visual_description, 4000),
      continuity_prompt: stringValue(raw?.continuity_prompt, 4000),
      image_prompt: stringValue(raw?.image_prompt, 4000),
      continuity_prompt_source: normalizePromptSource(raw?.continuity_prompt_source),
      image_prompt_source: normalizePromptSource(raw?.image_prompt_source),
      ...(assetId ? { background_asset_id: assetId } : {}),
    };
  }

  function normalizeScene(raw, index) {
    const assetId = positiveInteger(raw?.keyframe_asset_id);
    const variantAssetIds = [...new Set((Array.isArray(raw?.image_variant_asset_ids) ? raw.image_variant_asset_ids : [])
      .map(positiveInteger)
      .filter((id) => id && id !== assetId))].slice(0, 12);
    return {
      id: stringValue(raw?.id, 80) || `scene-${index + 1}`,
      order: clampInteger(raw?.order, 0, 10000, index),
      title: stringValue(raw?.title, 500),
      source: deepClone(raw?.source && typeof raw.source === 'object' ? raw.source : {}),
      summary: stringValue(raw?.summary, 4000),
      screenplay_text: String(raw?.screenplay_text || '').slice(0, 12000),
      character_ids: [...new Set((Array.isArray(raw?.character_ids) ? raw.character_ids : []).map((value) => stringValue(value, 80)).filter(Boolean))].slice(0, 16),
      ...(stringValue(raw?.location_id, 80) ? { location_id: stringValue(raw.location_id, 80) } : {}),
      assignments_initialized: raw?.assignments_initialized === true,
      duration_s: clampInteger(raw?.duration_s, 2, 120, 8),
      continuity_note: stringValue(raw?.continuity_note, 2000),
      image_prompt: stringValue(raw?.image_prompt, 4000),
      video_prompt: stringValue(raw?.video_prompt, 2000),
      image_prompt_source: normalizePromptSource(raw?.image_prompt_source),
      video_prompt_source: normalizePromptSource(raw?.video_prompt_source),
      ...(assetId ? { keyframe_asset_id: assetId } : {}),
      image_variant_asset_ids: variantAssetIds,
    };
  }

  function normalizeManifest(raw) {
    const source = raw && typeof raw === 'object' ? raw : emptyManifest();
    const ratio = ['16:9', '9:16', '1:1'].includes(source.aspect_ratio) ? source.aspect_ratio : '16:9';
    return {
      schema_version: 1,
      prompt_language: 'en',
      adaptation_language: stringValue(source.adaptation_language, 35) || 'fi',
      title: stringValue(source.title, 500),
      logline: stringValue(source.logline, 2000),
      synopsis: stringValue(source.synopsis, 12000),
      aspect_ratio: ratio,
      without_text: source.without_text !== false,
      visual_style_prompt: stringValue(source.visual_style_prompt, 4000),
      cinematography_prompt: stringValue(source.cinematography_prompt, 2000),
      visual_style_prompt_source: normalizePromptSource(source.visual_style_prompt_source),
      cinematography_prompt_source: normalizePromptSource(source.cinematography_prompt_source),
      characters: (Array.isArray(source.characters) ? source.characters : []).slice(0, 64).map(normalizeCharacter),
      locations: (Array.isArray(source.locations) ? source.locations : []).slice(0, 64).map(normalizeLocation),
      scenes: (Array.isArray(source.scenes) ? source.scenes : []).slice(0, 240).map(normalizeScene),
    };
  }

  function automaticEntityContinuityPrompt(kind, entity) {
    const name = stringValue(entity?.name, 240) || (kind === 'character' ? 'this character' : 'this location');
    const visualContext = stringValue(entity?.visual_description || entity?.description, 1200);
    const rule = kind === 'character'
      ? `Keep ${name}'s facial features, apparent age, hairstyle, body proportions, wardrobe, materials, colour palette, and identifying details consistent across every shot.`
      : `Keep ${name}'s layout, architecture, materials, season, weather, lighting direction, and colour palette consistent across every shot.`;
    return [rule, visualContext ? `Reference traits from the book analysis: ${visualContext}` : ''].filter(Boolean).join('\n');
  }

  function automaticEntityImagePrompt(kind, entity) {
    const context = [
      entity?.name ? `Name: ${stringValue(entity.name, 240)}` : '',
      kind === 'character' && entity?.role ? `Narrative role: ${stringValue(entity.role, 500)}` : '',
      entity?.visual_description ? `Visual description: ${stringValue(entity.visual_description, 1600)}` : '',
      entity?.description ? `Story context: ${stringValue(entity.description, 1200)}` : '',
    ].filter(Boolean).join('\n');
    const direction = kind === 'character'
      ? 'Create a consistent cinematic character reference portrait for a short-film adaptation. Show one clearly identifiable person in a natural, neutral pose with readable facial features, realistic anatomy, and wardrobe suitable for continuity across later shots.'
      : 'Create a cinematic environment reference frame for a short-film adaptation. Establish the location clearly with repeatable geography, architecture, materials, light, weather, season, and colour palette for continuity across later shots.';
    return [
      direction,
      'Use the source context only for narrative and visual facts; do not render the context as written text in the image.',
      context ? `SOURCE CONTEXT (may be in the book's language)\n${context}` : '',
    ].filter(Boolean).join('\n\n').slice(0, 4000).trim();
  }

  function automaticScenePrompt(scene, purpose) {
    const duration = clampInteger(scene?.duration_s, 2, 120, 8);
    const context = [
      scene?.title ? `Scene title: ${stringValue(scene.title, 500)}` : '',
      scene?.summary ? `Scene summary: ${stringValue(scene.summary, 1400)}` : '',
      scene?.screenplay_text ? `Screenplay excerpt: ${stringValue(scene.screenplay_text, 1200)}` : '',
      scene?.source?.excerpt ? `Book excerpt: ${stringValue(scene.source.excerpt, 1200)}` : '',
    ].filter(Boolean).join('\n');
    const direction = purpose === 'video'
      ? `Create a ${duration}-second cinematic shot for this short-film scene. Describe continuous subject movement, camera movement, pacing, environmental motion, and a clear final frame. Preserve the story facts and avoid adding new events.`
      : 'Create a cinematic opening keyframe for this short-film scene. Depict one decisive, filmable moment with clear subject placement, environment, lighting, depth, and emotional focus. Preserve the story facts and avoid adding new events.';
    const maximum = purpose === 'video' ? 2000 : 4000;
    return [
      direction,
      'Use the source context only for narrative and visual facts; do not render the context as written text in the image.',
      context ? `SOURCE CONTEXT (may be in the book's language)\n${context}` : '',
    ].filter(Boolean).join('\n\n').slice(0, maximum).trim();
  }

  function ensureAutomaticPrompts(manifest = state.manifest) {
    if (!manifest) return 0;
    let created = 0;
    (manifest.characters || []).forEach((entity) => {
      if (!stringValue(entity.continuity_prompt)) {
        entity.continuity_prompt = automaticEntityContinuityPrompt('character', entity);
        entity.continuity_prompt_source = 'generated';
        created += 1;
      }
      if (!stringValue(entity.image_prompt)) {
        entity.image_prompt = automaticEntityImagePrompt('character', entity);
        entity.image_prompt_source = 'generated';
        created += 1;
      }
    });
    (manifest.locations || []).forEach((entity) => {
      if (!stringValue(entity.continuity_prompt)) {
        entity.continuity_prompt = automaticEntityContinuityPrompt('location', entity);
        entity.continuity_prompt_source = 'generated';
        created += 1;
      }
      if (!stringValue(entity.image_prompt)) {
        entity.image_prompt = automaticEntityImagePrompt('location', entity);
        entity.image_prompt_source = 'generated';
        created += 1;
      }
    });
    (manifest.scenes || []).forEach((scene) => {
      if (!stringValue(scene.image_prompt)) {
        scene.image_prompt = automaticScenePrompt(scene, 'image');
        scene.image_prompt_source = 'generated';
        created += 1;
      }
      if (!stringValue(scene.video_prompt)) {
        scene.video_prompt = automaticScenePrompt(scene, 'video');
        scene.video_prompt_source = 'generated';
        created += 1;
      }
    });
    return created;
  }

  function searchableText(value) {
    return stringValue(value)
      .normalize('NFKC')
      .toLocaleLowerCase('fi')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function escapeRegularExpression(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function entityNameOccurs(name, text) {
    const needle = searchableText(name);
    const haystack = searchableText(text);
    if (!needle || !haystack) return false;
    // World-bible names use the nominative form while Finnish prose commonly
    // inflects them. Keep suffixes explicit so Aino does not match Ainola.
    const suffix = '(?:n|a|ä|an|än|en|in|on|ön|un|yn|ssa|ssä|sta|stä|lla|llä|lta|ltä|lle|ksi|na|nä|tta|ttä|ineen)?';
    const pattern = `(?<![\\p{L}\\p{N}_])${escapeRegularExpression(needle)}${suffix}(?![\\p{L}\\p{N}_])`;
    try {
      if (new RegExp(pattern, 'u').test(haystack)) return true;
    } catch (_error) {
      // The current browser targets support Unicode properties. For an older
      // embedded browser, exact containment remains safe for non-Latin names.
    }
    return !/[a-zåäö]/iu.test(needle) && haystack.includes(needle);
  }

  function sceneSearchText(scene) {
    return searchableText([
      scene?.title,
      scene?.summary,
      scene?.screenplay_text,
      scene?.source?.excerpt,
      scene?.image_prompt,
      scene?.video_prompt,
    ].filter(Boolean).join(' '));
  }

  function ensureSceneAssignments(manifest = state.manifest) {
    if (!manifest) return 0;
    const characters = manifest.characters || [];
    const locations = manifest.locations || [];
    const characterIds = new Set(characters.map((item) => item.id));
    const locationIds = new Set(locations.map((item) => item.id));
    let changed = 0;
    (manifest.scenes || []).forEach((scene) => {
      const validCharacters = (scene.character_ids || []).filter((id) => characterIds.has(id));
      if (validCharacters.length !== (scene.character_ids || []).length) {
        scene.character_ids = validCharacters;
        changed += 1;
      }
      if (scene.location_id && !locationIds.has(scene.location_id)) {
        delete scene.location_id;
        changed += 1;
      }
      if (scene.assignments_initialized === true) return;
      const haystack = sceneSearchText(scene);
      if (!scene.character_ids.length && characters.length) {
        const mentioned = characters.filter((character) => entityNameOccurs(character.name, haystack));
        scene.character_ids = (mentioned.length ? mentioned : [characters[0]]).map((item) => item.id).slice(0, 16);
        changed += 1;
      }
      if (!scene.location_id && locations.length) {
        const mentioned = locations.find((location) => entityNameOccurs(location.name, haystack));
        scene.location_id = (mentioned || locations[0]).id;
        changed += 1;
      }
      if (characters.length || locations.length) {
        scene.assignments_initialized = true;
        changed += 1;
      }
    });
    return changed;
  }

  function queueAutomaticPromptSave(created) {
    if (!created || !state.projectId || !state.manifest || state.conflict) return;
    state.dirty = true;
    state.changeSequence += 1;
    setSaveState('dirty', `${created} automaattista täydennystä tallennetaan…`);
    window.clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(() => { flushSave(); }, SAVE_DELAY_MS);
    renderExport();
  }

  function workspacePath(suffix = '') {
    return `/api/projects/${encodeURIComponent(state.projectId)}/screenplay${suffix}`;
  }

  function pendingStorageKey(projectId = state.projectId) {
    return projectId ? `${JOB_STORAGE_PREFIX}${projectId}` : '';
  }

  function savePendingJob(job) {
    state.pendingJob = job;
    const key = pendingStorageKey();
    if (!key) return;
    try {
      if (job?.clientRequestId) sessionStorage.setItem(key, JSON.stringify(job));
      else sessionStorage.removeItem(key);
    } catch (_error) {
      // Session storage is optional; the authoritative active id also comes from GET state.
    }
  }

  function readPendingJob() {
    const key = pendingStorageKey();
    if (!key) return null;
    try {
      const parsed = JSON.parse(sessionStorage.getItem(key) || 'null');
      const clientRequestId = stringValue(parsed?.clientRequestId);
      return clientRequestId ? { ...parsed, clientRequestId } : null;
    } catch (_error) {
      return null;
    }
  }

  function clearPendingJob(clientRequestId = '') {
    if (clientRequestId && state.pendingJob?.clientRequestId !== clientRequestId) return;
    savePendingJob(null);
  }

  function pendingImageStorageKey(projectId = state.projectId) {
    return projectId ? `${IMAGE_REQUEST_STORAGE_PREFIX}${projectId}` : '';
  }

  function normalizePendingImageRequest(raw, projectId = state.projectId) {
    if (!raw || typeof raw !== 'object' || Number(raw.projectId) !== Number(projectId)) return null;
    const clientRequestId = stringValue(raw.clientRequestId, 80);
    const requestBody = raw.requestBody && typeof raw.requestBody === 'object' ? raw.requestBody : null;
    const target = raw.target && typeof raw.target === 'object' ? raw.target : null;
    const kind = stringValue(target?.kind, 20);
    const targetId = stringValue(target?.id, 80);
    const attachMode = target?.attachMode === 'variant' ? 'variant' : 'current';
    if (
      !UUID_PATTERN.test(clientRequestId)
      || !requestBody
      || requestBody.client_request_id !== clientRequestId
      || !['scene', 'character', 'location'].includes(kind)
      || !targetId
      || stringValue(requestBody.visual_kind, 20) !== kind
      || !stringValue(requestBody.model, 240)
      || !stringValue(requestBody.chapter_custom_id, 240)
      || !stringValue(requestBody.prompt, IMAGE_PROMPT_LIMIT)
      || !['16:9', '9:16', '1:1', '3:4'].includes(requestBody.aspect_ratio)
      || !['512', '1K', '2K', '4K'].includes(stringValue(requestBody.image_size).toUpperCase())
    ) return null;
    return {
      projectId: Number(projectId),
      clientRequestId,
      createdAt: stringValue(raw.createdAt, 80),
      target: { kind, id: targetId, attachMode },
      requestBody: {
        client_request_id: clientRequestId,
        model: stringValue(requestBody.model, 240),
        visual_kind: kind,
        section_label: stringValue(requestBody.section_label, 240),
        chapter_custom_id: stringValue(requestBody.chapter_custom_id, 240),
        prompt: stringValue(requestBody.prompt, IMAGE_PROMPT_LIMIT),
        aspect_ratio: requestBody.aspect_ratio,
        image_size: stringValue(requestBody.image_size).toUpperCase(),
        use_analysis: requestBody.use_analysis === true,
        use_project_memory: requestBody.use_project_memory === true,
        without_text: requestBody.without_text !== false,
      },
    };
  }

  function savePendingImageRequest(record) {
    const normalized = normalizePendingImageRequest(record, state.projectId);
    const key = pendingImageStorageKey();
    if (!normalized || !key) return false;
    try {
      sessionStorage.setItem(key, JSON.stringify(normalized));
      state.pendingImageRequest = normalized;
      return true;
    } catch (_error) {
      state.pendingImageRequest = null;
      return false;
    }
  }

  function readPendingImageRequest(projectId = state.projectId) {
    const key = pendingImageStorageKey(projectId);
    if (!key) return null;
    try {
      const parsed = JSON.parse(sessionStorage.getItem(key) || 'null');
      const normalized = normalizePendingImageRequest(parsed, projectId);
      if (!normalized && parsed) sessionStorage.removeItem(key);
      return normalized;
    } catch (_error) {
      try { sessionStorage.removeItem(key); } catch (_storageError) { /* Storage is optional. */ }
      return null;
    }
  }

  function clearPendingImageRequest(clientRequestId = '') {
    if (clientRequestId && state.pendingImageRequest?.clientRequestId !== clientRequestId) return;
    const key = pendingImageStorageKey();
    state.pendingImageRequest = null;
    if (!key) return;
    try { sessionStorage.removeItem(key); } catch (_error) { /* Storage is optional. */ }
  }

  function applyWorkspace(payload, options = {}) {
    const previousSceneId = state.selectedSceneId;
    const previousChapterId = state.selectedChapterId;
    state.workspace = payload && typeof payload === 'object' ? payload : {};
    state.revision = Math.max(0, Number(state.workspace.revision || 0));
    state.manifest = normalizeManifest(state.workspace.manifest);
    state.chapters = (Array.isArray(state.workspace.chapters) ? state.workspace.chapters : [])
      .map((chapter, index) => ({
        id: positiveInteger(chapter?.id),
        custom_id: stringValue(chapter?.custom_id),
        title: stringValue(chapter?.title) || `Luku ${index + 1}`,
        order: clampInteger(chapter?.order, 0, 100000, index + 1),
        paragraph_count: Math.max(0, Number(chapter?.paragraph_count || 0)),
        checksum: stringValue(chapter?.checksum),
      }))
      .filter((chapter) => chapter.id && chapter.custom_id)
      .sort((left, right) => left.order - right.order);
    state.staleSceneIds = new Set((Array.isArray(state.workspace.stale_scene_ids) ? state.workspace.stale_scene_ids : []).map(String));
    state.selectedChapterId = state.chapters.some((chapter) => chapter.id === Number(previousChapterId))
      ? Number(previousChapterId)
      : state.chapters[0]?.id || null;
    state.selectedSceneId = state.manifest.scenes.some((scene) => scene.id === previousSceneId)
      ? previousSceneId
      : firstSceneForSelectedChapter()?.id || state.manifest.scenes[0]?.id || null;
    state.dirty = false;
    state.conflict = false;
    if (!options.preserveSaveState) setSaveState('saved', `Tallennettu · revisio ${state.revision}`);
    return ensureAutomaticPrompts(state.manifest) + ensureSceneAssignments(state.manifest);
  }

  function selectedChapter() {
    return state.chapters.find((chapter) => chapter.id === Number(state.selectedChapterId)) || null;
  }

  function sceneChapterId(scene) {
    return positiveInteger(scene?.source?.chapter_id);
  }

  function scenesForSelectedChapter() {
    const chapterId = Number(state.selectedChapterId);
    const scenes = [...(state.manifest?.scenes || [])].sort((left, right) => left.order - right.order);
    return chapterId ? scenes.filter((scene) => sceneChapterId(scene) === chapterId) : scenes;
  }

  function firstSceneForSelectedChapter() {
    return scenesForSelectedChapter()[0] || null;
  }

  function selectedScene() {
    return state.manifest?.scenes?.find((scene) => scene.id === state.selectedSceneId) || null;
  }

  function selectedImageModelValue() {
    return stringValue(elements['screenplay-image-model']?.value || elements['screenplay-world-image-model']?.value);
  }

  function selectedImageSizeValue() {
    return stringValue(elements['screenplay-preview-image-size']?.value || elements['screenplay-image-size']?.value) || '1K';
  }

  function selectedImageRatioValue() {
    return stringValue(elements['screenplay-preview-image-ratio']?.value || elements['screenplay-image-ratio']?.value)
      || state.manifest?.aspect_ratio
      || '16:9';
  }

  function selectedTextModelValue() {
    return stringValue(elements['screenplay-text-model']?.value);
  }

  function hasWorld() {
    const manifest = state.manifest || emptyManifest();
    return Boolean(
      state.workspace?.status !== 'empty'
      || manifest.visual_style_prompt
      || manifest.cinematography_prompt
      || manifest.characters.length
      || manifest.locations.length
      || manifest.scenes.length
    );
  }

  function setActiveView(view, options = {}) {
    const next = ['world', 'scenes', 'preview', 'export'].includes(view) ? view : 'world';
    if (next !== 'preview') disconnectPreviewAssetObserver();
    state.activeView = next;
    elements['screenplay-app'].dataset.activeView = next;
    document.querySelectorAll('[data-screenplay-view]').forEach((button) => {
      const active = button.dataset.screenplayView === next;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('[data-screenplay-panel]').forEach((panel) => {
      const active = panel.dataset.screenplayPanel === next;
      panel.hidden = !active;
      panel.setAttribute('aria-hidden', String(!active));
    });
    if (next === 'preview') renderPreview();
    if (next === 'export') renderExport();
    if (options.focus) byId(`screenplay-${next}-tab`)?.focus();
    if (options.scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateProjectVisibility() {
    const hasProject = Boolean(state.projectId);
    elements['screenplay-project-empty'].hidden = hasProject;
    elements['screenplay-workspace'].hidden = !hasProject;
    if (!hasProject) {
      elements['screenplay-project-name'].textContent = 'Valitse projekti SkriptLabin työtilasta';
      setSaveState('', 'Ei tallennettavaa');
    }
  }

  function setFieldValue(element, value) {
    if (!element) return;
    element.value = value == null ? '' : String(value);
  }

  function renderManifestFields() {
    const manifest = state.manifest || emptyManifest();
    setFieldValue(elements['screenplay-manifest-title'], manifest.title);
    setFieldValue(elements['screenplay-logline'], manifest.logline);
    setFieldValue(elements['screenplay-synopsis'], manifest.synopsis);
    setFieldValue(elements['screenplay-style-prompt'], manifest.visual_style_prompt);
    setFieldValue(elements['screenplay-cinematography-prompt'], manifest.cinematography_prompt);
    setFieldValue(elements['screenplay-aspect-ratio'], manifest.aspect_ratio);
    document.querySelectorAll('[data-image-ratio-select]').forEach((select) => setFieldValue(select, manifest.aspect_ratio));
    elements['screenplay-without-text'].checked = manifest.without_text !== false;
    const visible = hasWorld();
    elements['screenplay-style-section'].hidden = !visible;
    elements['screenplay-world-entities'].hidden = !visible;
    elements['screenplay-project-name'].textContent = manifest.title || `Projekti ${state.projectId}`;
  }

  function assetIdForEntity(kind, entity) {
    return positiveInteger(kind === 'character' ? entity?.reference_asset_id : entity?.background_asset_id);
  }

  function assetLabel(asset) {
    const kind = stringValue(asset?.material_kind);
    const model = [asset?.model_provider, asset?.model_name].filter(Boolean).join(':');
    return [asset?.title || `Kuva ${asset?.id || ''}`, kind, model].filter(Boolean).join(' · ');
  }

  function populateAssetSelect(select, selectedId, preferredKind = '') {
    if (!select) return;
    const currentId = positiveInteger(selectedId);
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'Ei valittua kuvaa';
    const items = [...state.assets.values()].filter((asset) => asset?.id).sort((left, right) => {
      const leftPreferred = stringValue(left.material_kind) === preferredKind ? 0 : 1;
      const rightPreferred = stringValue(right.material_kind) === preferredKind ? 0 : 1;
      return leftPreferred - rightPreferred || Number(right.id) - Number(left.id);
    });
    const options = [empty];
    items.forEach((asset) => {
      const option = document.createElement('option');
      option.value = String(asset.id);
      option.textContent = assetLabel(asset);
      options.push(option);
    });
    if (currentId && !items.some((asset) => Number(asset.id) === currentId)) {
      const missing = document.createElement('option');
      missing.value = String(currentId);
      missing.textContent = `Tallennettu kuva #${currentId}`;
      options.push(missing);
    }
    select.replaceChildren(...options);
    select.value = currentId ? String(currentId) : '';
  }

  function compactAssetFallback(container, label) {
    container.replaceChildren();
    container.textContent = stringValue(label).slice(0, 1).toUpperCase() || '·';
  }

  function assetEmptyContent(message, compact = false) {
    if (compact) return null;
    const wrapper = document.createElement('div');
    wrapper.className = 'asset-empty';
    const mark = document.createElement('span');
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = '◇';
    const title = document.createElement('strong');
    title.textContent = message || 'Ei vielä generoitua kuvaa';
    const note = document.createElement('p');
    note.textContent = 'Tässä näytetään vain palvelimelle tallennettu oikea kuva-assetti.';
    wrapper.append(mark, title, note);
    return wrapper;
  }

  function realImageDataUrl(asset) {
    const url = stringValue(asset?.data_url);
    return IMAGE_MIME_PATTERN.test(url) ? url : '';
  }

  async function loadAssetDetail(assetId) {
    const id = positiveInteger(assetId);
    if (!id || !state.projectId) return null;
    const existing = state.assets.get(id);
    if (realImageDataUrl(existing)) return existing;
    if (state.assetRequests.has(id)) return state.assetRequests.get(id);
    const projectId = state.projectId;
    const generation = state.loadGeneration;
    const request = api(`/api/projects/${encodeURIComponent(projectId)}/graphic-assets/${id}`)
      .then((asset) => {
        if (generation !== state.loadGeneration || projectId !== state.projectId) return null;
        const merged = { ...(existing || {}), ...(asset || {}) };
        state.assets.set(id, merged);
        return merged;
      })
      .finally(() => state.assetRequests.delete(id));
    state.assetRequests.set(id, request);
    return request;
  }

  async function renderAsset(container, assetId, label, compact = false) {
    if (!container) return;
    const id = positiveInteger(assetId);
    container.dataset.assetId = id ? String(id) : '';
    if (!id) {
      if (compact) compactAssetFallback(container, label);
      else container.replaceChildren(assetEmptyContent('Ei vielä generoitua kuvaa'));
      return;
    }
    if (compact) compactAssetFallback(container, label);
    else container.replaceChildren(assetEmptyContent('Ladataan tallennettua kuvaa…'));
    let asset;
    try {
      asset = await loadAssetDetail(id);
    } catch (_error) {
      asset = null;
    }
    if (!container.isConnected || container.dataset.assetId !== String(id)) return;
    const dataUrl = realImageDataUrl(asset);
    if (!dataUrl) {
      if (compact) compactAssetFallback(container, label);
      else container.replaceChildren(assetEmptyContent('Kuva-assetin esikatselua ei saatu'));
      return;
    }
    const image = document.createElement('img');
    image.src = dataUrl;
    image.alt = label || asset?.title || 'Tallennettu kuva';
    image.loading = 'lazy';
    container.replaceChildren(image);
    if (!compact) {
      const caption = document.createElement('div');
      caption.className = 'asset-caption';
      const text = document.createElement('span');
      text.textContent = assetLabel(asset);
      const download = document.createElement('a');
      download.href = dataUrl;
      download.download = imageFileName(asset, label);
      download.textContent = 'Lataa kuva';
      caption.append(text, download);
      container.appendChild(caption);
    }
  }

  function disconnectPreviewAssetObserver() {
    state.previewAssetObserver?.disconnect();
    state.previewAssetObserver = null;
  }

  function preparePreviewAssetObserver() {
    disconnectPreviewAssetObserver();
    if (typeof window.IntersectionObserver !== 'function') return null;
    state.previewAssetObserver = new window.IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        if (!entry.target.isConnected || state.activeView !== 'preview') return;
        const id = positiveInteger(entry.target.dataset.assetId);
        const label = stringValue(entry.target.dataset.previewAssetLabel, 500);
        renderAsset(entry.target, id, label);
      });
    }, { rootMargin: '320px 0px', threshold: 0.01 });
    return state.previewAssetObserver;
  }

  function renderDeferredPreviewAsset(container, assetId, label) {
    const id = positiveInteger(assetId);
    container.dataset.assetId = id ? String(id) : '';
    container.dataset.previewAssetLabel = stringValue(label, 500);
    if (!id) {
      renderAsset(container, null, label);
      return;
    }
    container.replaceChildren(assetEmptyContent('Kuva ladataan, kun se tulee näkyviin…'));
    container.dataset.previewAssetPending = 'true';
  }

  function observeDeferredPreviewAssets(list) {
    list.querySelectorAll('[data-preview-asset-pending="true"]').forEach((container) => {
      delete container.dataset.previewAssetPending;
      if (state.previewAssetObserver) state.previewAssetObserver.observe(container);
      else renderAsset(
        container,
        positiveInteger(container.dataset.assetId),
        stringValue(container.dataset.previewAssetLabel, 500),
      );
    });
  }

  function safeFileStem(value, fallback = 'kuva') {
    const normalized = stringValue(value).toLowerCase()
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return normalized || fallback;
  }

  function imageFileName(asset, label) {
    const mime = stringValue(asset?.mime_type).toLowerCase();
    const extension = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png';
    return `${safeFileStem(label || asset?.title)}.${extension}`;
  }

  function renderEntityList(kind, items, container) {
    container.replaceChildren();
    items.forEach((entity) => {
      const fragment = elements['screenplay-entity-template'].content.cloneNode(true);
      const card = fragment.querySelector('.entity-card');
      card.dataset.entityKind = kind;
      card.dataset.entityId = entity.id;
      card.querySelectorAll('[data-character-only]').forEach((field) => { field.hidden = kind !== 'character'; });
      card.querySelector('[data-entity-name-label]').textContent = kind === 'character' ? 'Hahmon nimi' : 'Paikan nimi';
      card.querySelector('[data-entity-asset-label]').textContent = kind === 'character' ? 'Olemassa oleva hahmokuva' : 'Olemassa oleva taustakuva';
      card.querySelectorAll('[data-entity-field]').forEach((field) => {
        field.value = entity[field.dataset.entityField] || '';
      });
      const select = card.querySelector('[data-entity-asset-select]');
      populateAssetSelect(select, assetIdForEntity(kind, entity), kind);
      card.querySelector('[data-entity-request-prompt]').value = entityImageRequestPrompt(kind, entity);
      const thumb = card.querySelector('[data-entity-asset]');
      renderAsset(thumb, assetIdForEntity(kind, entity), entity.name, true);
      container.appendChild(fragment);
    });
  }

  function renderWorldEntities() {
    const characters = state.manifest?.characters || [];
    const locations = state.manifest?.locations || [];
    elements['screenplay-character-count'].textContent = String(characters.length);
    elements['screenplay-location-count'].textContent = String(locations.length);
    renderEntityList('character', characters, elements['screenplay-character-list']);
    renderEntityList('location', locations, elements['screenplay-location-list']);
  }

  function renderChapters() {
    const select = elements['screenplay-chapter-select'];
    const options = [];
    if (!state.chapters.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Kirjassa ei ole lukuja';
      options.push(option);
    } else {
      state.chapters.forEach((chapter, index) => {
        const option = document.createElement('option');
        option.value = String(chapter.id);
        option.textContent = `${String(index + 1).padStart(2, '0')} · ${chapter.title} · ${chapter.paragraph_count} kappaletta`;
        options.push(option);
      });
    }
    select.replaceChildren(...options);
    select.value = state.selectedChapterId ? String(state.selectedChapterId) : '';
  }

  function renderSceneList() {
    const scenes = scenesForSelectedChapter();
    const list = elements['screenplay-scene-list'];
    list.replaceChildren();
    scenes.forEach((scene, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `scene-card${scene.id === state.selectedSceneId ? ' is-selected' : ''}`;
      button.dataset.sceneId = scene.id;
      button.setAttribute('aria-pressed', String(scene.id === state.selectedSceneId));
      const number = document.createElement('span');
      number.className = 'scene-index';
      number.textContent = String(Number(scene.order) + 1).padStart(2, '0');
      const copy = document.createElement('span');
      copy.className = 'scene-card-copy';
      const title = document.createElement('strong');
      title.textContent = scene.title || `Kohtaus ${Number(scene.order) + 1}`;
      const source = document.createElement('small');
      source.textContent = stringValue(scene.source?.chapter_title) || selectedChapter()?.title || 'Lähde ei tiedossa';
      copy.append(title, source);
      const meta = document.createElement('span');
      meta.className = 'scene-card-meta';
      const duration = document.createElement('span');
      duration.textContent = `${scene.duration_s || 0} s`;
      const asset = document.createElement('span');
      asset.className = `asset-dot${positiveInteger(scene.keyframe_asset_id) ? ' has-asset' : ''}`;
      asset.title = positiveInteger(scene.keyframe_asset_id) ? 'Kohtauskuva tallennettu' : 'Ei kohtauskuvaa';
      meta.append(duration, asset);
      if (state.staleSceneIds.has(scene.id)) {
        const stale = document.createElement('span');
        stale.textContent = 'Lähde muuttunut';
        stale.className = 'scene-stale';
        meta.appendChild(stale);
      }
      button.append(number, copy, meta);
      list.appendChild(button);
    });
    elements['screenplay-scenes-empty'].hidden = scenes.length > 0;
    list.hidden = scenes.length === 0;
    const total = state.manifest?.scenes?.length || 0;
    elements['screenplay-scenes-summary'].textContent = total
      ? `${total} kohtausta · ${state.staleSceneIds.size} lähteeltään muuttunutta`
      : 'Valitse luku ja luo sen kohtaukset.';
  }

  function renderSceneAssignments(scene) {
    const locationSelect = elements['screenplay-scene-location'];
    const locationOptions = [Object.assign(document.createElement('option'), { value: '', textContent: 'Ei valittua paikkaa' })];
    (state.manifest?.locations || []).forEach((location) => {
      const option = document.createElement('option');
      option.value = location.id;
      option.textContent = location.name || location.id;
      locationOptions.push(option);
    });
    locationSelect.replaceChildren(...locationOptions);
    locationSelect.value = scene?.location_id || '';

    const characterContainer = elements['screenplay-scene-characters'];
    characterContainer.replaceChildren();
    (state.manifest?.characters || []).forEach((character) => {
      const label = document.createElement('label');
      label.className = 'character-chip';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = character.id;
      input.checked = Boolean(scene?.character_ids?.includes(character.id));
      const text = document.createElement('span');
      text.textContent = character.name || character.id;
      label.append(input, text);
      characterContainer.appendChild(label);
    });
  }

  function referencedCharacters(scene) {
    const byId = new Map((state.manifest?.characters || []).map((character) => [character.id, character]));
    return (scene?.character_ids || []).map((id) => byId.get(id)).filter(Boolean);
  }

  function referencedLocation(scene) {
    return (state.manifest?.locations || []).find((location) => location.id === scene?.location_id) || null;
  }

  function compiledPrompt(scene, purpose) {
    if (!scene || !state.manifest) return '';
    const sections = [];
    if (state.manifest.visual_style_prompt) sections.push(`VISUAL STYLE\n${state.manifest.visual_style_prompt}`);
    if (state.manifest.cinematography_prompt) sections.push(`CINEMATOGRAPHY\n${state.manifest.cinematography_prompt}`);
    const continuity = referencedCharacters(scene)
      .map((character) => character.continuity_prompt)
      .filter(Boolean);
    const location = referencedLocation(scene);
    if (location?.continuity_prompt) continuity.push(location.continuity_prompt);
    if (continuity.length) sections.push(`CONTINUITY\n${continuity.map((value) => `- ${value}`).join('\n')}`);
    const raw = purpose === 'video' ? scene.video_prompt : scene.image_prompt;
    if (raw) sections.push(`${purpose === 'video' ? 'SCENE MOTION' : 'SCENE KEYFRAME'}\n${raw}`);
    let prompt = sections.join('\n\n').trim();
    if (state.manifest.without_text !== false && !prompt.toLowerCase().includes(NO_TEXT_GUARD.toLowerCase())) {
      prompt = `${prompt.replace(/\.+$/, '')}\n\n${NO_TEXT_GUARD}`.trim();
    }
    return prompt;
  }

  function limitedImageRequest(contextSections, primarySection) {
    const guard = state.manifest?.without_text !== false ? NO_TEXT_GUARD : '';
    const tailBudget = IMAGE_PROMPT_LIMIT - (guard ? guard.length + 2 : 0);
    const primary = stringValue(primarySection).slice(0, Math.max(0, tailBudget)).trim();
    const tail = [primary, guard].filter(Boolean);
    const tailText = tail.join('\n\n');
    const prefixBudget = Math.max(0, IMAGE_PROMPT_LIMIT - tailText.length - (tailText ? 2 : 0));
    const context = contextSections.filter(Boolean).join('\n\n').slice(0, prefixBudget).trim();
    return [context, tailText].filter(Boolean).join('\n\n').slice(0, IMAGE_PROMPT_LIMIT).trim();
  }

  function sceneImageRequestPrompt(scene) {
    if (!scene || !state.manifest) return '';
    const contexts = [];
    if (state.manifest.visual_style_prompt) contexts.push(`VISUAL STYLE\n${state.manifest.visual_style_prompt}`);
    if (state.manifest.cinematography_prompt) contexts.push(`CINEMATOGRAPHY\n${state.manifest.cinematography_prompt}`);
    const continuity = referencedCharacters(scene).map((character) => character.continuity_prompt).filter(Boolean);
    const location = referencedLocation(scene);
    if (location?.continuity_prompt) continuity.push(location.continuity_prompt);
    if (continuity.length) contexts.push(`CONTINUITY\n${continuity.map((value) => `- ${value}`).join('\n')}`);
    return limitedImageRequest(contexts, `SCENE KEYFRAME\n${scene.image_prompt || ''}`);
  }

  function renderCompiledPrompts(scene = selectedScene()) {
    setFieldValue(elements['screenplay-compiled-image-prompt'], compiledPrompt(scene, 'image'));
    setFieldValue(elements['screenplay-compiled-video-prompt'], compiledPrompt(scene, 'video'));
    setFieldValue(elements['screenplay-image-request-prompt'], sceneImageRequestPrompt(scene));
  }

  function createReferenceCard(kind, entity) {
    const card = document.createElement('article');
    card.className = 'reference-card';
    const media = document.createElement('div');
    media.className = 'reference-card-media';
    const copy = document.createElement('div');
    copy.className = 'reference-card-copy';
    const title = document.createElement('strong');
    title.textContent = entity.name || entity.id;
    const note = document.createElement('small');
    note.textContent = kind === 'character' ? (entity.role || 'Hahmo') : 'Paikka';
    copy.append(title, note);
    card.append(media, copy);
    renderAsset(media, assetIdForEntity(kind, entity), entity.name, true);
    return card;
  }

  function renderSelectedReferences(scene) {
    const container = elements['screenplay-selected-references'];
    container.replaceChildren();
    const location = referencedLocation(scene);
    if (location) container.appendChild(createReferenceCard('location', location));
    referencedCharacters(scene).forEach((character) => container.appendChild(createReferenceCard('character', character)));
    if (!container.children.length) {
      const note = document.createElement('p');
      note.className = 'prompt-note';
      note.textContent = 'Valitse kohtaukselle hahmot ja paikka. Niiden jatkuvuuspromptit liitetään valmiisiin generointipromptteihin.';
      container.appendChild(note);
    }
  }

  function renderSceneEditor() {
    const scene = selectedScene();
    elements['screenplay-editor-empty'].hidden = Boolean(scene);
    elements['screenplay-scene-editor'].hidden = !scene;
    if (!scene) {
      renderSceneAssignments(null);
      renderSelectedReferences(null);
      renderCompiledPrompts(null);
      populateAssetSelect(elements['screenplay-scene-asset-select'], null, 'scene');
      renderAsset(elements['screenplay-scene-asset'], null, 'Kohtauskuva');
      syncControls();
      return;
    }
    elements['screenplay-scene-kicker'].textContent = `Kohtaus ${String(Number(scene.order) + 1).padStart(2, '0')}`;
    setFieldValue(elements['screenplay-scene-title'], scene.title);
    setFieldValue(elements['screenplay-scene-duration'], scene.duration_s);
    elements['screenplay-scene-source-label'].textContent = [
      scene.source?.chapter_title,
      scene.source?.paragraph_start != null && scene.source?.paragraph_end != null
        ? `kappaleet ${scene.source.paragraph_start}–${scene.source.paragraph_end}`
        : '',
    ].filter(Boolean).join(' · ') || 'Lähdeviite ei ole saatavilla';
    elements['screenplay-scene-source-excerpt'].textContent = stringValue(scene.source?.excerpt) || 'Lähdekatkelmaa ei ole tallennettu.';
    setFieldValue(elements['screenplay-scene-summary'], scene.summary);
    setFieldValue(elements['screenplay-scene-script'], scene.screenplay_text);
    setFieldValue(elements['screenplay-scene-continuity'], scene.continuity_note);
    setFieldValue(elements['screenplay-scene-image-prompt'], scene.image_prompt);
    setFieldValue(elements['screenplay-scene-video-prompt'], scene.video_prompt);
    renderSceneAssignments(scene);
    renderSelectedReferences(scene);
    renderCompiledPrompts(scene);
    populateAssetSelect(elements['screenplay-scene-asset-select'], scene.keyframe_asset_id, 'scene');
    renderAsset(elements['screenplay-scene-asset'], scene.keyframe_asset_id, scene.title || 'Kohtauskuva');
    syncControls();
  }

  function sceneVariantAssetIds(scene) {
    const currentId = positiveInteger(scene?.keyframe_asset_id);
    return [...new Set((Array.isArray(scene?.image_variant_asset_ids) ? scene.image_variant_asset_ids : [])
      .map(positiveInteger)
      .filter((id) => id && id !== currentId))].slice(0, 12);
  }

  function addSceneVariantAsset(scene, assetId) {
    const id = positiveInteger(assetId);
    if (!scene || !id || id === positiveInteger(scene.keyframe_asset_id)) return false;
    scene.image_variant_asset_ids = [...new Set([id, ...sceneVariantAssetIds(scene)])].slice(0, 12);
    return true;
  }

  function setSceneKeyframeAsset(scene, assetId) {
    if (!scene) return false;
    const nextId = positiveInteger(assetId);
    const previousId = positiveInteger(scene.keyframe_asset_id);
    if (nextId === previousId) return false;
    const alternatives = [...new Set([
      previousId,
      ...sceneVariantAssetIds(scene),
    ].filter((id) => id && id !== nextId))].slice(0, 12);
    if (nextId) scene.keyframe_asset_id = nextId;
    else delete scene.keyframe_asset_id;
    scene.image_variant_asset_ids = alternatives;
    return true;
  }

  function sceneAssignmentSummary(scene) {
    const location = referencedLocation(scene)?.name || 'Ei valittua paikkaa';
    const characters = referencedCharacters(scene).map((item) => item.name || item.id);
    return `Paikka: ${location} · Hahmot: ${characters.length ? characters.join(', ') : 'ei valittuja hahmoja'}`;
  }

  function createPreviewAsset(scene, assetId, current = false) {
    const item = document.createElement('article');
    item.className = `preview-asset${current ? ' is-current' : ''}`;
    const heading = document.createElement('div');
    heading.className = 'preview-asset-heading';
    const label = document.createElement('strong');
    label.textContent = current ? 'Käytössä' : 'Vaihtoehto';
    heading.appendChild(label);
    if (current) {
      const badge = document.createElement('span');
      badge.textContent = 'Viedään tuotantoon';
      heading.appendChild(badge);
    }
    const frame = document.createElement('div');
    frame.className = 'asset-frame preview-asset-frame';
    renderDeferredPreviewAsset(
      frame,
      assetId,
      `${scene.title || 'Kohtaus'} – ${current ? 'käytössä oleva kuva' : 'kuvavaihtoehto'}`,
    );
    item.append(heading, frame);
    if (!current) {
      const select = document.createElement('button');
      select.type = 'button';
      select.className = 'secondary-action preview-select-action';
      select.dataset.previewSelect = '';
      select.dataset.sceneId = scene.id;
      select.dataset.assetId = String(assetId);
      select.textContent = 'Ota käyttöön';
      select.setAttribute('aria-label', `Ota kuvavaihtoehto käyttöön kohtauksessa ${scene.title || Number(scene.order) + 1}`);
      item.appendChild(select);
    }
    return item;
  }

  function renderPreview() {
    const list = elements['screenplay-preview-list'];
    if (!list) return;
    disconnectPreviewAssetObserver();
    if (state.activeView !== 'preview') {
      list.replaceChildren();
      return;
    }
    preparePreviewAssetObserver();
    const scenes = [...(state.manifest?.scenes || [])].sort((left, right) => left.order - right.order);
    list.replaceChildren();
    elements['screenplay-preview-empty'].hidden = scenes.length > 0;
    list.hidden = scenes.length === 0;
    scenes.forEach((scene) => {
      const card = document.createElement('article');
      card.className = 'preview-scene-card';
      card.dataset.previewSceneId = scene.id;

      const header = document.createElement('header');
      header.className = 'preview-scene-heading';
      const headingCopy = document.createElement('div');
      const kicker = document.createElement('p');
      kicker.className = 'eyebrow';
      kicker.textContent = `Kohtaus ${String(Number(scene.order) + 1).padStart(2, '0')} · ${scene.duration_s || 0} s`;
      const title = document.createElement('h3');
      title.textContent = scene.title || `Kohtaus ${Number(scene.order) + 1}`;
      headingCopy.append(kicker, title);
      const assignments = document.createElement('p');
      assignments.className = 'preview-assignments';
      assignments.textContent = sceneAssignmentSummary(scene);
      header.append(headingCopy, assignments);

      const promptDetails = document.createElement('details');
      promptDetails.className = 'preview-prompt-details';
      const promptSummary = document.createElement('summary');
      promptSummary.textContent = 'Näytä ja muokkaa kuvapromptia (EN)';
      const promptContent = document.createElement('div');
      promptContent.className = 'preview-prompt-content';
      const scenePromptLabel = document.createElement('label');
      scenePromptLabel.className = 'prompt-field';
      const scenePromptTitle = document.createElement('span');
      scenePromptTitle.textContent = 'Scene image prompt (EN)';
      const scenePrompt = document.createElement('textarea');
      scenePrompt.rows = 6;
      scenePrompt.maxLength = 4000;
      scenePrompt.lang = 'en';
      scenePrompt.spellcheck = false;
      scenePrompt.dataset.previewImagePrompt = '';
      scenePrompt.dataset.sceneId = scene.id;
      scenePrompt.value = scene.image_prompt || '';
      scenePromptLabel.append(scenePromptTitle, scenePrompt);
      const requestPromptLabel = document.createElement('label');
      requestPromptLabel.className = 'prompt-field';
      const requestPromptTitle = document.createElement('span');
      requestPromptTitle.textContent = 'API:lle lähetettävä koottu käyttäjäprompti (EN · max 2000)';
      const requestPrompt = document.createElement('textarea');
      requestPrompt.rows = 7;
      requestPrompt.lang = 'en';
      requestPrompt.spellcheck = false;
      requestPrompt.readOnly = true;
      requestPrompt.dataset.previewRequestPrompt = '';
      requestPrompt.value = sceneImageRequestPrompt(scene);
      requestPromptLabel.append(requestPromptTitle, requestPrompt);
      const promptNote = document.createElement('p');
      promptNote.className = 'prompt-note';
      promptNote.textContent = 'Palvelin lisää alempaan koosteeseen vielä valitun luvun, kirja-analyysin ja projektimuistin lähdekontekstiksi. Muokkaa yllä olevaa kohtauspromptia; muutokset tallennetaan ennen kuvan generointia.';
      promptContent.append(scenePromptLabel, requestPromptLabel, promptNote);
      promptDetails.append(promptSummary, promptContent);

      const comparison = document.createElement('div');
      comparison.className = 'preview-comparison';
      const currentColumn = document.createElement('div');
      currentColumn.className = 'preview-current-column';
      currentColumn.appendChild(createPreviewAsset(scene, positiveInteger(scene.keyframe_asset_id), true));

      const alternativesColumn = document.createElement('section');
      alternativesColumn.className = 'preview-alternatives-column';
      const actions = document.createElement('div');
      actions.className = 'preview-alternatives-heading';
      const alternativesTitle = document.createElement('strong');
      const alternativeIds = sceneVariantAssetIds(scene);
      alternativesTitle.textContent = `Vaihtoehdot (${alternativeIds.length})`;
      const generate = document.createElement('button');
      generate.type = 'button';
      generate.className = 'secondary-action preview-generate-action';
      generate.dataset.previewGenerate = '';
      generate.dataset.sceneId = scene.id;
      const generating = state.imageBusy && state.imageBusySceneId === scene.id;
      generate.textContent = generating ? 'Generoidaan vaihtoehtoa…' : 'Generoi uusi vaihtoehto';
      generate.setAttribute('aria-busy', String(generating));
      generate.setAttribute('aria-label', `Generoi uusi kuvavaihtoehto kohtaukselle ${scene.title || Number(scene.order) + 1}`);
      actions.append(alternativesTitle, generate);
      alternativesColumn.appendChild(actions);

      const alternatives = document.createElement('div');
      alternatives.className = 'preview-alternative-list';
      alternativeIds.forEach((id) => alternatives.appendChild(createPreviewAsset(scene, id, false)));
      if (!alternativeIds.length) {
        const note = document.createElement('p');
        note.className = 'preview-no-alternatives';
        note.textContent = 'Ei vielä vaihtoehtoja. Nykyinen kuva säilyy, kun generoit uuden.';
        alternatives.appendChild(note);
      }
      alternativesColumn.appendChild(alternatives);
      comparison.append(currentColumn, alternativesColumn);
      card.append(header, promptDetails, comparison);
      list.appendChild(card);
    });
    observeDeferredPreviewAssets(list);
    syncControls();
  }

  function renderExport() {
    const scenes = [...(state.manifest?.scenes || [])].sort((left, right) => left.order - right.order);
    const select = elements['screenplay-export-scene-select'];
    const previous = select.value || state.selectedSceneId || '';
    const options = [];
    if (!scenes.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Ei kohtauksia';
      options.push(option);
    } else {
      scenes.forEach((scene, index) => {
        const option = document.createElement('option');
        option.value = scene.id;
        option.textContent = `${String(Number(scene.order) + 1).padStart(2, '0')} · ${scene.title || 'Nimetön kohtaus'}`;
        options.push(option);
      });
    }
    select.replaceChildren(...options);
    select.value = scenes.some((scene) => scene.id === previous) ? previous : scenes[0]?.id || '';
    const assetIds = new Set();
    (state.manifest?.characters || []).forEach((item) => { if (positiveInteger(item.reference_asset_id)) assetIds.add(Number(item.reference_asset_id)); });
    (state.manifest?.locations || []).forEach((item) => { if (positiveInteger(item.background_asset_id)) assetIds.add(Number(item.background_asset_id)); });
    scenes.forEach((item) => {
      if (positiveInteger(item.keyframe_asset_id)) assetIds.add(Number(item.keyframe_asset_id));
      sceneVariantAssetIds(item).forEach((id) => assetIds.add(id));
    });
    const values = [scenes.length, assetIds.size, state.revision];
    elements['screenplay-export-stats'].querySelectorAll('dd').forEach((item, index) => { item.textContent = String(values[index] || 0); });
    syncControls();
  }

  function renderAll() {
    updateProjectVisibility();
    if (!state.projectId || !state.manifest) return;
    renderManifestFields();
    renderWorldEntities();
    renderChapters();
    renderSceneList();
    renderSceneEditor();
    renderPreview();
    renderExport();
    elements['screenplay-source-warning'].hidden = state.staleSceneIds.size === 0;
    setActiveView(state.activeView);
    syncControls();
  }

  function imageModelValue(model) {
    return `${stringValue(model?.provider)}:${stringValue(model?.model_name)}`;
  }

  function renderImageModels(preferred = '') {
    const defaultModel = state.imageModels.find((model) => model.is_default) || state.imageModels[0] || null;
    const selected = preferred || selectedImageModelValue() || (defaultModel ? imageModelValue(defaultModel) : '');
    document.querySelectorAll('[data-image-model-select]').forEach((select) => {
      const options = [];
      if (!state.imageModels.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Ei käytettävissä olevia kuvamalleja';
        options.push(option);
      } else {
        state.imageModels.forEach((model) => {
          const option = document.createElement('option');
          option.value = imageModelValue(model);
          option.textContent = `${model.display_name || model.model_name} · ${model.model_name}${model.is_default ? ' · suositeltu kuten kansissa' : ''}`;
          options.push(option);
        });
      }
      select.replaceChildren(...options);
      select.value = options.some((option) => option.value === selected) ? selected : options[0]?.value || '';
      select.disabled = !state.imageModels.length;
    });
    syncImageSizes();
  }

  function syncImageModelSelects(value) {
    document.querySelectorAll('[data-image-model-select]').forEach((select) => {
      if ([...select.options].some((option) => option.value === value)) select.value = value;
    });
    syncImageSizes();
  }

  function syncImageSizes() {
    const model = state.imageModels.find((item) => imageModelValue(item) === selectedImageModelValue());
    const supported = (Array.isArray(model?.supported_image_sizes) ? model.supported_image_sizes : ['1K'])
      .map((value) => stringValue(value).toUpperCase().replace(/\s*PX$/, ''))
      .filter((value, index, values) => ['512', '1K', '2K', '4K'].includes(value) && values.indexOf(value) === index);
    const sizes = supported.length ? supported : ['1K'];
    const selected = selectedImageSizeValue();
    document.querySelectorAll('[data-image-size-select]').forEach((select) => {
      select.replaceChildren(...sizes.map((size) => Object.assign(document.createElement('option'), { value: size, textContent: size })));
      select.value = sizes.includes(selected) ? selected : sizes[0];
    });
  }

  function syncImageSizeSelects(value) {
    document.querySelectorAll('[data-image-size-select]').forEach((select) => {
      if ([...select.options].some((option) => option.value === value)) select.value = value;
    });
  }

  function syncImageRatioSelects(value) {
    document.querySelectorAll('[data-image-ratio-select]').forEach((select) => {
      if ([...select.options].some((option) => option.value === value)) select.value = value;
    });
  }

  function renderTextModels() {
    const select = elements['screenplay-text-model'];
    const currentValue = stringValue(select.value);
    const options = [];
    if (state.textModelsLoading) {
      options.push(Object.assign(document.createElement('option'), {
        value: '',
        textContent: 'Ladataan hyväksyttyjä käsikirjoitusmalleja…',
      }));
    } else if (state.textModelLoadError) {
      options.push(Object.assign(document.createElement('option'), {
        value: '',
        textContent: 'Tekstimallien lataus epäonnistui',
      }));
    } else if (!state.textModels.length) {
      options.push(Object.assign(document.createElement('option'), {
        value: '',
        textContent: 'Ei hyväksyttyjä käsikirjoitusmalleja käytettävissä',
      }));
    }
    state.textModels.forEach((model) => {
      const option = document.createElement('option');
      option.value = imageModelValue(model);
      option.textContent = `${model.display_name || model.model_name} · ${model.model_name} · varmennettu käsikirjoitukseen`;
      options.push(option);
    });
    select.replaceChildren(...options);
    select.value = options.some((option) => option.value === currentValue)
      ? currentValue
      : options[0]?.value || '';
    select.disabled = state.textModelsLoading || !state.textModels.length;
    syncTextModelRetry();
  }

  function syncTextModelRetry() {
    const button = elements['screenplay-text-model-retry'];
    if (!button) return;
    button.hidden = !state.textModelLoadError;
    button.disabled = state.textModelsLoading || state.operationActive || state.conflict;
    button.setAttribute('aria-busy', String(state.textModelsLoading));
  }

  async function loadTextModels(generation) {
    if (state.textModelsLoading) return false;
    state.textModelsLoading = true;
    state.textModels = [];
    renderTextModels();
    syncControls();
    try {
      const texts = await api('/api/models/text?purpose=video_screenplay', {
        signal: state.loadController?.signal,
      });
      if (generation !== state.loadGeneration) return false;
      state.textModels = Array.isArray(texts) ? texts : [];
      state.textModelLoadError = '';
      return true;
    } catch (error) {
      if (error?.name === 'AbortError' || generation !== state.loadGeneration) return false;
      state.textModels = [];
      state.textModelLoadError = error.message || 'Tekstimallien lataus epäonnistui.';
      return false;
    } finally {
      if (generation === state.loadGeneration) {
        state.textModelsLoading = false;
        renderTextModels();
        syncControls();
      }
    }
  }

  function showTextModelLoadError() {
    setNotice(
      'Hyväksyttyjen käsikirjoitusmallien lataus epäonnistui. Tarkista yhteys ja yritä uudelleen.',
      'error',
      'Yritä uudelleen',
      retryTextModels,
    );
  }

  async function retryTextModels() {
    if (
      !state.textModelLoadError
      || state.textModelsLoading
      || state.operationActive
      || state.conflict
    ) return;
    const generation = state.loadGeneration;
    const projectId = state.projectId;
    setNotice('Ladataan hyväksyttyjä käsikirjoitusmalleja uudelleen…', 'loading');
    const loaded = await loadTextModels(generation);
    if (generation !== state.loadGeneration || projectId !== state.projectId) return;
    if (!loaded) {
      showTextModelLoadError();
      return;
    }
    if (!state.textModels.length) {
      setNotice('Palvelin ei palauttanut yhtään käsikirjoitusgenerointiin hyväksyttyä tekstimallia.', 'warning');
      return;
    }
    setNotice('Hyväksytyt käsikirjoitusmallit ladattiin. Generointi on taas käytettävissä.', 'ready');
  }

  async function loadModels(generation) {
    const textModelsPromise = loadTextModels(generation);
    const images = await api('/api/models/image').catch(() => []);
    if (generation !== state.loadGeneration) return false;
    state.imageModels = Array.isArray(images) ? images : [];
    renderImageModels();
    syncControls();
    return textModelsPromise;
  }

  async function loadAssetLibrary(generation) {
    if (!state.projectId) return;
    const projectId = state.projectId;
    const collected = [];
    let cursor = '';
    for (let page = 0; page < 5; page += 1) {
      const params = new URLSearchParams({ asset_type: 'book_visual_image', limit: '24' });
      if (cursor) params.set('cursor', cursor);
      let result;
      try {
        result = await api(`/api/projects/${encodeURIComponent(projectId)}/graphic-assets?${params.toString()}`);
      } catch (_error) {
        return;
      }
      if (generation !== state.loadGeneration || projectId !== state.projectId) return;
      collected.push(...(Array.isArray(result?.items) ? result.items : []));
      cursor = stringValue(result?.next_cursor);
      if (!cursor) break;
    }
    if (generation !== state.loadGeneration) return;
    const detailed = [...state.assets.values()].filter((asset) => realImageDataUrl(asset));
    state.assets.clear();
    collected.forEach((asset) => { if (positiveInteger(asset?.id)) state.assets.set(Number(asset.id), asset); });
    detailed.forEach((asset) => state.assets.set(Number(asset.id), { ...(state.assets.get(Number(asset.id)) || {}), ...asset }));
    renderWorldEntities();
    renderSceneEditor();
    renderPreview();
  }

  function syncControls() {
    const scene = selectedScene();
    const hasProject = Boolean(state.projectId);
    const pendingImage = Boolean(state.pendingImageRequest);
    const busy = state.operationActive || state.imageBusy || pendingImage;
    const documentLocked = state.operationActive || state.imageBusy || pendingImage || state.conflict;
    const hasTextModel = Boolean(state.textModels.length && selectedTextModelValue());
    [
      'screenplay-style-hint', 'screenplay-adaptation-goal', 'screenplay-without-text',
      'screenplay-manifest-title', 'screenplay-logline', 'screenplay-synopsis',
      'screenplay-style-prompt', 'screenplay-cinematography-prompt', 'screenplay-aspect-ratio',
      'screenplay-chapter-select', 'screenplay-scene-count', 'screenplay-replace-scenes',
      'screenplay-scene-title', 'screenplay-scene-duration', 'screenplay-scene-summary',
      'screenplay-scene-script', 'screenplay-scene-continuity',
      'screenplay-scene-image-prompt', 'screenplay-scene-video-prompt',
      'screenplay-scene-location', 'screenplay-scene-asset-select',
    ].forEach((id) => {
      if (elements[id] && !elements[id].readOnly) elements[id].disabled = documentLocked;
    });
    elements['screenplay-text-model'].disabled = documentLocked || state.textModelsLoading || !state.textModels.length;
    syncTextModelRetry();
    elements['screenplay-world-entities'].querySelectorAll('[data-entity-field], [data-entity-asset-select]').forEach((field) => {
      field.disabled = documentLocked;
    });
    elements['screenplay-scene-characters'].querySelectorAll('input').forEach((field) => {
      field.disabled = documentLocked;
    });
    elements['screenplay-generate-world'].disabled = !hasProject || !hasTextModel || busy || state.conflict;
    elements['screenplay-generate-chapter'].disabled = !selectedChapter() || !hasTextModel || busy || state.conflict;
    elements['screenplay-generate-scene-image'].disabled = !scene
      || !selectedImageModelValue()
      || busy
      || state.conflict;
    document.querySelectorAll('[data-preview-generate]').forEach((button) => {
      const targetScene = state.manifest?.scenes?.find((item) => item.id === button.dataset.sceneId);
      button.disabled = !targetScene || !selectedImageModelValue() || busy || state.conflict;
    });
    document.querySelectorAll('[data-preview-select]').forEach((button) => {
      const targetScene = state.manifest?.scenes?.find((item) => item.id === button.dataset.sceneId);
      const targetAssetId = positiveInteger(button.dataset.assetId);
      button.disabled = !targetScene || !targetAssetId || busy || state.conflict;
    });
    elements['screenplay-preview-list']?.querySelectorAll('[data-preview-image-prompt]').forEach((field) => {
      field.disabled = documentLocked || state.imageBusy;
    });
    elements['screenplay-export-scene'].disabled = !elements['screenplay-export-scene-select']?.value || busy || state.dirty || state.conflict;
    elements['screenplay-export-all'].disabled = !(state.manifest?.scenes?.length) || busy || state.dirty || state.conflict;
    document.querySelectorAll('[data-entity-generate]').forEach((button) => {
      const card = button.closest('[data-entity-kind]');
      const entity = entityFromCard(card);
      button.disabled = !entity || !selectedImageModelValue() || busy || state.conflict;
    });
    document.querySelectorAll('[data-image-model-select]').forEach((select) => {
      select.disabled = !state.imageModels.length || documentLocked;
    });
    document.querySelectorAll('[data-image-size-select], [data-image-ratio-select]').forEach((select) => {
      select.disabled = !state.imageModels.length || documentLocked;
    });
  }

  function markDirty() {
    if (!state.projectId || !state.manifest || state.conflict) return;
    state.dirty = true;
    state.changeSequence += 1;
    setSaveState('dirty', 'Tallentamattomia muutoksia');
    window.clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(() => { flushSave(); }, SAVE_DELAY_MS);
    renderExport();
  }

  async function flushSave() {
    window.clearTimeout(state.saveTimer);
    state.saveTimer = null;
    if (state.conflict) return false;
    if (state.savePromise) {
      const previous = await state.savePromise;
      if (!previous || !state.dirty) return previous;
      return flushSave();
    }
    if (!state.dirty || !state.projectId || !state.manifest) return true;
    const generation = state.loadGeneration;
    const projectId = state.projectId;
    const baseRevision = state.revision;
    const sequence = state.changeSequence;
    const manifest = normalizeManifest(state.manifest);
    state.dirty = false;
    setSaveState('saving', 'Tallennetaan…');
    let saveSucceeded = false;
    state.saveController?.abort();
    state.saveController = new AbortController();
    let requestPromise;
    requestPromise = (async () => {
      try {
        const payload = await api(workspacePath(), jsonOptions(
          { base_revision: baseRevision, manifest },
          { method: 'PUT', signal: state.saveController.signal },
        ));
        if (generation !== state.loadGeneration || projectId !== state.projectId) return false;
        state.workspace = { ...(state.workspace || {}), ...(payload || {}), manifest: state.manifest };
        state.revision = Math.max(baseRevision + 1, Number(payload?.revision || 0));
        saveSucceeded = true;
        if (state.changeSequence === sequence) {
          state.dirty = false;
          setSaveState('saved', `Tallennettu · revisio ${state.revision}`);
        } else {
          state.dirty = true;
          setSaveState('dirty', 'Uusia muutoksia odottaa');
        }
        return true;
      } catch (error) {
        if (error?.name === 'AbortError' || generation !== state.loadGeneration) return false;
        state.dirty = true;
        if (error?.status === 409) {
          state.conflict = true;
          setSaveState('error', 'Tallennusristiriita');
          setNotice(
            'Palvelimella on uudempi revisio. Paikalliset muutokset ovat yhä tässä näkymässä, eikä niitä ylikirjoitettu.',
            'error',
            'Lataa palvelimen versio',
            () => loadProject(state.projectId),
          );
        } else {
          setSaveState('error', 'Tallennus epäonnistui');
          setNotice(error.message || 'Tallennus epäonnistui.', 'error', 'Yritä tallentaa', () => flushSave());
        }
        return false;
      } finally {
        if (state.savePromise === requestPromise) state.savePromise = null;
        if (generation === state.loadGeneration) state.saveController = null;
        if (saveSucceeded && state.dirty && !state.conflict) {
          state.saveTimer = window.setTimeout(() => { flushSave(); }, SAVE_DELAY_MS);
        }
        syncControls();
      }
    })();
    state.savePromise = requestPromise;
    return requestPromise;
  }

  function entityFromCard(card) {
    const kind = card?.dataset?.entityKind;
    const id = card?.dataset?.entityId;
    const collection = kind === 'character' ? state.manifest?.characters : kind === 'location' ? state.manifest?.locations : null;
    return collection?.find((item) => item.id === id) || null;
  }

  function entityByKindAndId(kind, id) {
    const collection = kind === 'character' ? state.manifest?.characters : state.manifest?.locations;
    return collection?.find((item) => item.id === id) || null;
  }

  function applyManifestInput(element) {
    const manifest = state.manifest;
    if (!manifest) return;
    const mapping = {
      'screenplay-manifest-title': 'title',
      'screenplay-logline': 'logline',
      'screenplay-synopsis': 'synopsis',
      'screenplay-style-prompt': 'visual_style_prompt',
      'screenplay-cinematography-prompt': 'cinematography_prompt',
      'screenplay-aspect-ratio': 'aspect_ratio',
    };
    const key = mapping[element.id];
    if (!key && element.id !== 'screenplay-without-text') return;
    if (element.id === 'screenplay-without-text') manifest.without_text = element.checked;
    else manifest[key] = element.value;
    if (key === 'visual_style_prompt') manifest.visual_style_prompt_source = 'manual';
    if (key === 'cinematography_prompt') manifest.cinematography_prompt_source = 'manual';
    if (key === 'title') elements['screenplay-project-name'].textContent = manifest.title || `Projekti ${state.projectId}`;
    if (['visual_style_prompt', 'cinematography_prompt'].includes(key) || element.id === 'screenplay-without-text') {
      renderCompiledPrompts();
      refreshEntityRequestPrompts();
    }
    markDirty();
  }

  function applySceneInput(element) {
    const scene = selectedScene();
    if (!scene) return;
    const mapping = {
      'screenplay-scene-title': 'title',
      'screenplay-scene-duration': 'duration_s',
      'screenplay-scene-summary': 'summary',
      'screenplay-scene-script': 'screenplay_text',
      'screenplay-scene-continuity': 'continuity_note',
      'screenplay-scene-image-prompt': 'image_prompt',
      'screenplay-scene-video-prompt': 'video_prompt',
    };
    const key = mapping[element.id];
    if (!key) return;
    scene[key] = key === 'duration_s' ? clampInteger(element.value, 2, 120, scene.duration_s || 8) : element.value;
    if (key === 'image_prompt') scene.image_prompt_source = 'manual';
    if (key === 'video_prompt') scene.video_prompt_source = 'manual';
    if (['continuity_note', 'image_prompt', 'video_prompt'].includes(key)) renderCompiledPrompts(scene);
    if (['title', 'duration_s'].includes(key)) renderSceneList();
    markDirty();
  }

  function applyEntityInput(element) {
    const card = element.closest('[data-entity-kind]');
    const entity = entityFromCard(card);
    const field = element.dataset.entityField;
    if (!entity || !field) return;
    entity[field] = element.value;
    if (field === 'image_prompt') entity.image_prompt_source = 'manual';
    if (field === 'continuity_prompt') entity.continuity_prompt_source = 'manual';
    if (field === 'name') {
      const thumb = card.querySelector('[data-entity-asset]');
      if (!assetIdForEntity(card.dataset.entityKind, entity)) compactAssetFallback(thumb, entity.name);
    }
    if (selectedScene()?.character_ids?.includes(entity.id) || selectedScene()?.location_id === entity.id) {
      renderSelectedReferences(selectedScene());
      renderCompiledPrompts(selectedScene());
    }
    const requestPrompt = card.querySelector('[data-entity-request-prompt]');
    if (requestPrompt) requestPrompt.value = entityImageRequestPrompt(card.dataset.entityKind, entity);
    markDirty();
  }

  function copyText(text, sourceElement = null) {
    const value = String(text || '');
    if (!value.trim()) {
      setNotice('Kopioitavaa promptia ei ole vielä luotu.', 'warning');
      return Promise.resolve(false);
    }
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(value).then(() => {
        setNotice('Prompti kopioitiin leikepöydälle.', 'ready');
        return true;
      }).catch(() => fallbackCopy(value, sourceElement));
    }
    return Promise.resolve(fallbackCopy(value, sourceElement));
  }

  function fallbackCopy(value, sourceElement) {
    const textarea = sourceElement instanceof HTMLTextAreaElement ? sourceElement : document.createElement('textarea');
    const temporary = textarea !== sourceElement;
    if (temporary) {
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
    }
    textarea.focus();
    textarea.select();
    const copied = typeof document.execCommand === 'function' && document.execCommand('copy');
    if (temporary) textarea.remove();
    setNotice(copied ? 'Prompti kopioitiin leikepöydälle.' : 'Valitse prompti ja kopioi se käsin.', copied ? 'ready' : 'warning');
    return copied;
  }

  function entityPrompt(entity) {
    const sections = [];
    if (state.manifest?.visual_style_prompt) sections.push(`VISUAL STYLE\n${state.manifest.visual_style_prompt}`);
    if (state.manifest?.cinematography_prompt) sections.push(`CINEMATOGRAPHY\n${state.manifest.cinematography_prompt}`);
    if (entity?.continuity_prompt) sections.push(`CONTINUITY\n${entity.continuity_prompt}`);
    if (entity?.image_prompt) sections.push(`IMAGE\n${entity.image_prompt}`);
    if (state.manifest?.without_text !== false) sections.push(NO_TEXT_GUARD);
    return sections.join('\n\n').trim();
  }

  function entityImageRequestPrompt(kind, entity) {
    if (!entity || !state.manifest) return '';
    const contexts = [];
    if (state.manifest.visual_style_prompt) contexts.push(`VISUAL STYLE\n${state.manifest.visual_style_prompt}`);
    if (state.manifest.cinematography_prompt) contexts.push(`CINEMATOGRAPHY\n${state.manifest.cinematography_prompt}`);
    if (entity.continuity_prompt) contexts.push(`CONTINUITY\n- ${entity.continuity_prompt}`);
    const label = kind === 'character' ? 'CHARACTER PORTRAIT' : 'LOCATION KEYFRAME';
    return limitedImageRequest(contexts, `${label}\n${entity.image_prompt || ''}`);
  }

  function refreshEntityRequestPrompts() {
    document.querySelectorAll('[data-entity-kind]').forEach((card) => {
      const entity = entityFromCard(card);
      const target = card.querySelector('[data-entity-request-prompt]');
      if (target && entity) target.value = entityImageRequestPrompt(card.dataset.entityKind, entity);
    });
  }

  function imageChapterCustomId(scene = null) {
    const direct = stringValue(scene?.source?.chapter_custom_id);
    if (direct) return direct;
    return selectedChapter()?.custom_id || state.chapters[0]?.custom_id || '';
  }

  function resolvePendingImageTarget(record) {
    const kind = record?.target?.kind;
    const id = record?.target?.id;
    if (kind === 'scene') {
      const scene = state.manifest?.scenes?.find((item) => item.id === id) || null;
      return scene ? { kind, scene, entity: null, keepAsVariant: record.target.attachMode === 'variant' } : null;
    }
    const entity = entityByKindAndId(kind, id);
    return entity ? { kind, scene: null, entity, keepAsVariant: false } : null;
  }

  function renderImageAttachment(target) {
    if (target?.kind === 'scene') {
      renderSceneList();
      if (target.scene.id === state.selectedSceneId) renderSceneEditor();
      renderPreview();
    } else {
      renderWorldEntities();
      renderSelectedReferences(selectedScene());
    }
  }

  async function attachPendingImageResult(record, payload) {
    const assetId = positiveInteger(payload?.id);
    if (!assetId) throw new Error('Kuvapalvelu ei palauttanut tallennetun assetin tunnistetta.');
    state.assets.set(assetId, payload);
    const target = resolvePendingImageTarget(record);
    if (!target) {
      clearPendingImageRequest(record.clientRequestId);
      renderWorldEntities();
      renderSceneEditor();
      renderPreview();
      return { assetId, saved: true, targetMissing: true, target: null };
    }
    let changed = false;
    if (target.kind === 'scene' && target.keepAsVariant) changed = addSceneVariantAsset(target.scene, assetId);
    else if (target.kind === 'scene') changed = setSceneKeyframeAsset(target.scene, assetId);
    else if (target.kind === 'character' && positiveInteger(target.entity.reference_asset_id) !== assetId) {
      target.entity.reference_asset_id = assetId;
      changed = true;
    } else if (target.kind === 'location' && positiveInteger(target.entity.background_asset_id) !== assetId) {
      target.entity.background_asset_id = assetId;
      changed = true;
    }
    if (changed) markDirty();
    renderImageAttachment(target);
    const saved = await flushSave();
    if (saved) clearPendingImageRequest(record.clientRequestId);
    return { assetId, saved, targetMissing: false, target };
  }

  function isImageRequestStillProcessing(error) {
    return error?.status === 409 && /jo käsittelyssä/i.test(stringValue(error.message));
  }

  function shouldKeepPendingImageRequest(error) {
    if (error?.name === 'AbortError' || error?.isNetworkError) return true;
    const status = Number(error?.status);
    if (status === 408 || (status >= 500 && status <= 599)) return true;
    return status === 409 && /(jo käsittelyssä|käsittelyvaraus siirtyi)/i.test(stringValue(error.message));
  }

  function showPendingImageNotice(message = '') {
    if (!state.pendingImageRequest) return;
    setNotice(
      message || 'Aiemman kuvapyynnön vastaus jäi epäselväksi. Tarkista sama pyyntö turvallisesti ennen uuden kuvan generointia.',
      'warning',
      'Tarkista aiempi kuvapyyntö',
      replayPendingImageRequest,
    );
    syncControls();
  }

  function handlePendingImageError(error, record, generation, projectId) {
    if (generation !== state.loadGeneration || projectId !== state.projectId) return;
    if (error?.name === 'AbortError' || error?.isNetworkError) {
      showPendingImageNotice(
        'Kuvapyynnön vastaus katkesi. Emme voi vielä varmistaa, valmistuiko kuva. Tarkista sama pyyntö ennen uutta generointia.',
      );
      return;
    }
    if (isImageRequestStillProcessing(error)) {
      showPendingImageNotice('Samaa kuvapyyntöä käsitellään vielä. Tarkista tulos hetken kuluttua.');
      return;
    }
    if (shouldKeepPendingImageRequest(error)) {
      showPendingImageNotice(
        Number(error?.status) === 409
          ? 'Samaa kuvapyyntöä käsitellään vielä. Tarkista tulos hetken kuluttua.'
          : 'Kuvapalvelu palautti tilapäisen palvelinvirheen. Pyynnön lopputulos voi silti olla tallentunut; tarkista sama pyyntö ennen uutta generointia.',
      );
      return;
    }
    if (Number.isInteger(error?.status)) {
      clearPendingImageRequest(record?.clientRequestId || '');
      setNotice(error?.message || 'Kuvan generointi epäonnistui.', 'error');
      syncControls();
      return;
    }
    showPendingImageNotice(
      error?.message
        ? `${error.message} Pyynnön tila jäi epäselväksi, joten tarkista sama pyyntö ennen uutta generointia.`
        : 'Kuvapyynnön tila jäi epäselväksi. Tarkista sama pyyntö ennen uuden kuvan generointia.',
    );
  }

  async function submitPendingImageRequest(record) {
    const projectId = state.projectId;
    const generation = state.loadGeneration;
    state.imageController?.abort();
    state.imageController = new AbortController();
    setNotice('Tarkistetaan kuvapyyntö samalla turvallisella tunnisteella…', 'loading');
    const payload = await api(`/api/projects/${encodeURIComponent(projectId)}/visual-images`, jsonOptions(
      deepClone(record.requestBody),
      { method: 'POST', signal: state.imageController.signal },
    ));
    if (generation !== state.loadGeneration || projectId !== state.projectId) return null;
    return attachPendingImageResult(record, payload);
  }

  function showImageRequestResult(result, record) {
    if (!result) return;
    if (result.targetMissing) {
      setNotice('Aiempi kuvapyyntö löytyi, mutta sen alkuperäistä kohtausta, hahmoa tai paikkaa ei enää ole. Kuva säilyy projektin kuvakirjastossa.', 'warning');
      return;
    }
    if (result.saved) {
      setNotice(
        record.target.attachMode === 'variant'
          ? 'Uusi kuvavaihtoehto tallennettiin nykyisen rinnalle. Nykyinen kuva säilyi käytössä.'
          : 'Kuva generoitiin, tallennettiin projektin assetiksi ja liitettiin käsikirjoitukseen.',
        'ready',
      );
    } else if (!state.conflict) {
      showPendingImageNotice('Kuva löytyi samalla tunnisteella, mutta sen liitoksen tallennus odottaa uutta yritystä.');
    }
  }

  async function replayPendingImageRequest() {
    if (state.imageBusy || state.operationActive || state.conflict) return;
    const record = state.pendingImageRequest || readPendingImageRequest();
    if (!record) {
      clearPendingImageRequest();
      setNotice('Aiemmin kesken jäänyttä kuvapyyntöä ei löytynyt.', 'warning');
      syncControls();
      return;
    }
    const projectId = state.projectId;
    const generation = state.loadGeneration;
    state.pendingImageRequest = record;
    state.imageBusy = true;
    state.imageBusySceneId = record.target.kind === 'scene' ? record.target.id : null;
    syncControls();
    try {
      const result = await submitPendingImageRequest(record);
      showImageRequestResult(result, record);
    } catch (error) {
      handlePendingImageError(error, record, generation, projectId);
    } finally {
      if (generation === state.loadGeneration && projectId === state.projectId) {
        state.imageBusy = false;
        state.imageBusySceneId = null;
        state.imageController = null;
        renderPreview();
        syncControls();
      }
    }
  }

  async function generateImageFor(kind, entity = null, button = null) {
    if (state.pendingImageRequest) {
      showPendingImageNotice();
      return;
    }
    if (state.imageBusy || state.operationActive || state.conflict) return;
    const scene = kind === 'scene'
      ? (entity && state.manifest?.scenes?.includes(entity) ? entity : selectedScene())
      : null;
    const keepAsVariant = kind === 'scene' && Boolean(button?.hasAttribute('data-preview-generate'));
    if (kind === 'scene' && !scene) return;
    const originalLabel = button?.textContent || '';
    const projectId = state.projectId;
    const generation = state.loadGeneration;
    let selectedModelLabel = 'valittu kuvamalli';
    let pendingRecord = null;

    // Take the lock before prompt autosave: a second tap must not reach either
    // the revisioned PUT or the paid image request while this run is pending.
    state.imageBusy = true;
    state.imageBusySceneId = scene?.id || null;
    if (button) button.textContent = 'Valmistellaan kuvapyyntöä…';
    syncControls();

    try {
      let created = 0;
      if (kind === 'scene' && scene) {
        if (!stringValue(scene.image_prompt)) {
          scene.image_prompt = automaticScenePrompt(scene, 'image');
          scene.image_prompt_source = 'generated';
          created += 1;
        }
        if (!stringValue(scene.video_prompt)) {
          scene.video_prompt = automaticScenePrompt(scene, 'video');
          scene.video_prompt_source = 'generated';
          created += 1;
        }
      } else if (entity) {
        if (!stringValue(entity.continuity_prompt)) {
          entity.continuity_prompt = automaticEntityContinuityPrompt(kind, entity);
          entity.continuity_prompt_source = 'generated';
          created += 1;
        }
        if (!stringValue(entity.image_prompt)) {
          entity.image_prompt = automaticEntityImagePrompt(kind, entity);
          entity.image_prompt_source = 'generated';
          created += 1;
        }
      }
      if (created) {
        if (kind === 'scene') {
          if (scene.id === state.selectedSceneId) renderSceneEditor();
          renderPreview();
        } else {
          renderWorldEntities();
        }
        // Entity rendering replaces its buttons, so reapply the active lock
        // before autosave yields control back to the browser.
        syncControls();
        queueAutomaticPromptSave(created);
        const saved = await flushSave();
        if (!saved) {
          if (!state.conflict) {
            setNotice(
              'Automaattinen englanninkielinen prompti luotiin näkyviin, mutta sitä ei saatu tallennettua. Tarkista prompti ja yritä uudelleen.',
              'warning',
              'Yritä tallentaa',
              () => flushSave(),
            );
          }
          return;
        }
      }

      const preflightSaved = await flushSave();
      if (!preflightSaved) {
        if (!state.conflict) {
          setNotice(
            'Kuvan generointia ei käynnistetty, koska näkyvää promptia ja valintoja ei saatu ensin tallennettua.',
            'warning',
            'Yritä tallentaa',
            () => flushSave(),
          );
        }
        return;
      }

      const prompt = kind === 'scene' ? sceneImageRequestPrompt(scene) : entityImageRequestPrompt(kind, entity);
      const chapterCustomId = imageChapterCustomId(scene);
      if (!prompt) {
        setNotice('Englanninkielistä kuvapromptia ei saatu muodostettua. Lisää lähdekuvaus tai kirjoita prompti ja yritä uudelleen.', 'warning');
        return;
      }
      if (!chapterCustomId) {
        setNotice('Kuvagenerointi tarvitsee kirjan luvun. Valitse luku ja yritä uudelleen.', 'error');
        return;
      }
      const selectedModelValue = selectedImageModelValue();
      const selectedModel = state.imageModels.find((model) => imageModelValue(model) === selectedModelValue) || null;
      if (!selectedModel) {
        setNotice('Valitse käytettävä kuvamalli. Suositeltu oletus on sama Gemini-kuvamalli kuin kansien generoinnissa.', 'warning');
        return;
      }

      selectedModelLabel = selectedModel.display_name || selectedModel.model_name;
      const clientRequestId = createClientRequestId();
      const requestBody = {
        client_request_id: clientRequestId,
        model: imageModelValue(selectedModel),
        visual_kind: kind,
        section_label: stringValue(
          kind === 'scene'
            ? (scene?.title || 'Kohtaus')
            : (entity?.name || (kind === 'character' ? 'Hahmo' : 'Paikka')),
          240,
        ),
        chapter_custom_id: chapterCustomId,
        prompt,
        aspect_ratio: kind === 'character'
          ? '3:4'
          : kind === 'scene'
            ? selectedImageRatioValue()
            : (state.manifest.aspect_ratio || '16:9'),
        image_size: selectedImageSizeValue(),
        use_analysis: true,
        use_project_memory: true,
        without_text: state.manifest.without_text !== false,
      };
      pendingRecord = {
        projectId,
        clientRequestId,
        createdAt: new Date().toISOString(),
        target: {
          kind,
          id: kind === 'scene' ? scene.id : entity.id,
          attachMode: keepAsVariant ? 'variant' : 'current',
        },
        requestBody,
      };
      if (!savePendingImageRequest(pendingRecord)) {
        setNotice(
          'Kuvapyyntöä ei käynnistetty, koska sen turvallista uudelleenyritystunnistetta ei voitu tallentaa tähän selainistuntoon.',
          'error',
        );
        return;
      }
      pendingRecord = state.pendingImageRequest;
      syncControls();
      if (button) button.textContent = 'Generoidaan oikeaa kuvaa…';
      setNotice(`Kuvapyyntö lähetettiin mallille ${selectedModelLabel}. Valmis kuva tallennetaan projektin assetiksi.`, 'loading');
      const result = await submitPendingImageRequest(pendingRecord);
      showImageRequestResult(result, pendingRecord);
    } catch (error) {
      if (generation !== state.loadGeneration || projectId !== state.projectId) return;
      if (pendingRecord) handlePendingImageError(error, pendingRecord, generation, projectId);
      else if (error?.name !== 'AbortError') setNotice(error.message || `Kuvan generointi mallilla ${selectedModelLabel} epäonnistui.`, 'error');
    } finally {
      if (generation === state.loadGeneration) {
        state.imageBusy = false;
        state.imageBusySceneId = null;
        state.imageController = null;
        if (button) button.textContent = originalLabel;
        if (kind === 'scene') renderPreview();
        syncControls();
      }
    }
  }

  function generationLabel(payload, fallback) {
    if (payload?.operation === 'world') return 'Luodaan maailmaa, hahmoja ja paikkoja…';
    if (payload?.operation === 'chapter_scenes') return 'Luodaan valitun luvun kohtauksia…';
    return fallback || 'AI-työ on käynnissä…';
  }

  async function monitorJob(clientRequestId, initialPayload = null) {
    const projectId = state.projectId;
    const generation = state.loadGeneration;
    let payload = initialPayload;
    state.operationActive = true;
    syncControls();
    while (generation === state.loadGeneration && projectId === state.projectId) {
      if (!payload) {
        state.pollController?.abort();
        state.pollController = new AbortController();
        try {
          payload = await api(`${workspacePath('/jobs/')}${encodeURIComponent(clientRequestId)}`, { signal: state.pollController.signal });
        } catch (error) {
          if (error?.name === 'AbortError' || generation !== state.loadGeneration) return;
          const confirmedMissing = error.status === 404;
          if (confirmedMissing) clearPendingJob(clientRequestId);
          state.operationActive = !confirmedMissing;
          syncControls();
          setNotice(
            confirmedMissing
              ? 'Palvelin vahvisti, ettei samalla tunnisteella ole käynnissä työtä. Voit lähettää pyynnön uudelleen.'
              : error.message,
            confirmedMissing ? 'warning' : 'error',
            confirmedMissing ? '' : 'Tarkista ajo',
            confirmedMissing ? null : () => monitorJob(clientRequestId),
          );
          return;
        }
      }
      const status = stringValue(payload?.status);
      if (status === 'ready') {
        const createdPrompts = applyWorkspace(payload);
        clearPendingJob(clientRequestId);
        state.operationActive = false;
        renderAll();
        queueAutomaticPromptSave(createdPrompts);
        loadAssetLibrary(generation);
        setNotice(payload?.operation === 'world' ? 'Maailma on valmis. Valitse seuraavaksi luku Kohtaukset-välilehdeltä.' : 'Luvun kohtaukset ovat valmiit ja muokattavissa.', 'ready');
        return;
      }
      if (status === 'failed') {
        clearPendingJob(clientRequestId);
        state.operationActive = false;
        syncControls();
        setNotice(stringValue(payload?.error) || 'Generointi epäonnistui.', 'error');
        return;
      }
      if (!ACTIVE_JOB_STATES.has(status)) {
        state.operationActive = false;
        syncControls();
        setNotice('Generointityön tilaa ei voitu tulkita. Tarkista työ samalla tunnisteella.', 'warning', 'Tarkista ajo', () => monitorJob(clientRequestId));
        return;
      }
      setNotice(generationLabel(payload), 'loading');
      payload = null;
      await new Promise((resolve) => {
        state.pollTimer = window.setTimeout(resolve, JOB_POLL_MS);
      });
    }
  }

  async function startGeneration(kind) {
    if (!state.projectId || state.operationActive || state.conflict) return;
    if (state.pendingJob?.clientRequestId) {
      setNotice('Aiemman pyynnön tila tarkistetaan samalla tunnisteella. Uutta ajoa ei lähetetty.', 'warning');
      await monitorJob(state.pendingJob.clientRequestId);
      return;
    }
    if (!selectedTextModelValue()) {
      setNotice('Käsikirjoitusgenerointiin hyväksyttyä tekstimallia ei ole käytettävissä.', 'error');
      return;
    }
    const saved = await flushSave();
    if (!saved) return;
    const chapter = selectedChapter();
    if (kind === 'chapter' && !chapter) {
      setNotice('Valitse ensin kirjan luku.', 'warning');
      return;
    }
    const clientRequestId = createClientRequestId();
    const projectId = state.projectId;
    const generation = state.loadGeneration;
    const endpoint = kind === 'world'
      ? workspacePath('/world/generate')
      : workspacePath(`/chapters/${encodeURIComponent(chapter.id)}/scenes/generate`);
    const common = {
      client_request_id: clientRequestId,
      base_revision: state.revision,
      style_hint: stringValue(elements['screenplay-style-hint']?.value, 700),
      adaptation_goal: stringValue(elements['screenplay-adaptation-goal']?.value, 2000),
    };
    common.model = selectedTextModelValue();
    const body = kind === 'chapter'
      ? {
        ...common,
        scene_count: clampInteger(elements['screenplay-scene-count'].value, 1, 12, 3),
        replace_existing: Boolean(elements['screenplay-replace-scenes'].checked),
      }
      : common;
    savePendingJob({ clientRequestId, kind, chapterId: chapter?.id || null, createdAt: new Date().toISOString() });
    state.operationActive = true;
    state.generationController?.abort();
    state.generationController = new AbortController();
    syncControls();
    setNotice(kind === 'world' ? 'Lähetetään maailman generointi…' : `Lähetetään luvun “${chapter.title}” kohtausgenerointi…`, 'loading');
    try {
      const payload = await api(endpoint, jsonOptions(body, { method: 'POST', signal: state.generationController.signal }));
      if (generation !== state.loadGeneration || projectId !== state.projectId) return;
      state.generationController = null;
      await monitorJob(clientRequestId, payload);
    } catch (error) {
      if (error?.name === 'AbortError' || generation !== state.loadGeneration || projectId !== state.projectId) return;
      state.generationController = null;
      state.operationActive = false;
      syncControls();
      if (error?.isNetworkError) {
        setNotice('Generointipyynnön vastaus katkesi. Uutta pyyntöä ei lähetetä; tarkistetaan sama ajo tunnisteella.', 'warning');
        await monitorJob(clientRequestId);
        return;
      }
      clearPendingJob(clientRequestId);
      setNotice(error.message || 'Generoinnin käynnistys epäonnistui.', 'error');
    }
  }

  async function downloadExport(sceneId = '') {
    if (!state.projectId || state.conflict) return;
    const saved = await flushSave();
    if (!saved) {
      setNotice('Tallennus pitää ratkaista ennen vientiä, jotta ZIP vastaa näkyvää versiota.', 'warning');
      return;
    }
    const query = sceneId ? `?${new URLSearchParams({ scene_id: sceneId }).toString()}` : '';
    const fallback = sceneId
      ? `${safeFileStem(state.manifest?.title || 'elokuva')}-${safeFileStem(selectedScene()?.title || 'kohtaus')}.zip`
      : `${safeFileStem(state.manifest?.title || 'elokuva')}-tuotantopaketti.zip`;
    state.operationActive = true;
    syncControls();
    setNotice('Kootaan ZIP-pakettia palvelimella…', 'loading');
    try {
      const response = await window.SkriptLabAuth.fetch(`${workspacePath('/export')}${query}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(errorMessage(payload, `Vienti epäonnistui (${response.status}).`));
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error('Palvelin palautti tyhjän vientipaketin.');
      const disposition = stringValue(response.headers.get('Content-Disposition'));
      const match = disposition.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
      const filename = match ? decodeURIComponent(match[1].replace(/^\"|\"$/g, '')) : fallback;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      setNotice(sceneId ? 'Kohtauspaketin lataus käynnistyi.' : 'Koko tuotantopaketin lataus käynnistyi.', 'ready');
    } catch (error) {
      setNotice(error.message || 'Vienti epäonnistui.', 'error');
    } finally {
      state.operationActive = false;
      syncControls();
    }
  }

  function cancelProjectWork() {
    state.loadGeneration += 1;
    state.loadController?.abort();
    state.saveController?.abort();
    state.generationController?.abort();
    state.imageController?.abort();
    state.pollController?.abort();
    window.clearTimeout(state.pollTimer);
    window.clearTimeout(state.saveTimer);
    disconnectPreviewAssetObserver();
    state.loadController = null;
    state.saveController = null;
    state.generationController = null;
    state.imageController = null;
    state.pollController = null;
    state.pollTimer = null;
    state.saveTimer = null;
    state.savePromise = null;
    state.operationActive = false;
    state.imageBusy = false;
    state.imageBusySceneId = null;
    // Keep the project-scoped sessionStorage record intact so an ambiguous
    // paid image request can be reconciled after navigation or a reload.
    state.pendingImageRequest = null;
    state.textModelsLoading = false;
    state.textModelLoadError = '';
    state.assetRequests.clear();
  }

  async function loadProject(projectId = projectIdFromPage()) {
    const previousProjectId = state.projectId;
    cancelProjectWork();
    state.projectId = positiveInteger(projectId);
    state.workspace = null;
    state.manifest = null;
    state.revision = 0;
    state.chapters = [];
    state.staleSceneIds = new Set();
    state.assets.clear();
    state.selectedChapterId = null;
    state.selectedSceneId = null;
    state.dirty = false;
    state.conflict = false;
    state.pendingJob = null;
    state.pendingImageRequest = readPendingImageRequest(state.projectId);
    if (previousProjectId !== state.projectId) {
      setFieldValue(elements['screenplay-style-hint'], '');
      setFieldValue(elements['screenplay-adaptation-goal'], '');
      setFieldValue(elements['screenplay-scene-count'], '3');
      elements['screenplay-replace-scenes'].checked = false;
    }
    updateProjectVisibility();
    if (!state.projectId) {
      setNotice('Käsikirjoitus tarvitsee aktiivisen projektin. Valitse kirja pääsovelluksesta.', 'warning');
      return;
    }
    const generation = state.loadGeneration;
    state.loadController = new AbortController();
    setNotice('Ladataan käsikirjoitustyöpöytää palvelimelta…', 'loading');
    setSaveState('', 'Ladataan…');
    const modelsPromise = loadModels(generation);
    try {
      const payload = await api(workspacePath(), { signal: state.loadController.signal });
      if (generation !== state.loadGeneration) return;
      const createdPrompts = applyWorkspace(payload);
      const activeId = ACTIVE_JOB_STATES.has(stringValue(payload?.status)) ? stringValue(payload?.client_request_id) : '';
      if (activeId) {
        // Lock the document before the first render. Waiting for either model
        // registry request here would briefly expose editable fields and allow
        // an autosave to supersede the already-running paid generation.
        state.operationActive = true;
        const persisted = readPendingJob();
        savePendingJob(persisted?.clientRequestId === activeId
          ? persisted
          : { clientRequestId: activeId, kind: payload?.operation || 'unknown' });
      }
      renderAll();
      loadAssetLibrary(generation);
      if (activeId) monitorJob(activeId, payload);
      await modelsPromise;
      if (generation !== state.loadGeneration) return;
      if (activeId) {
        return;
      } else if (state.pendingImageRequest) {
        clearPendingJob();
        showPendingImageNotice();
      } else if (state.textModelLoadError) {
        clearPendingJob();
        showTextModelLoadError();
      } else if (!state.textModels.length) {
        clearPendingJob();
        setNotice('Palvelin ei palauttanut yhtään käsikirjoitusgenerointiin hyväksyttyä tekstimallia.', 'warning');
      } else if (payload?.status === 'failed') {
        clearPendingJob();
        setNotice(stringValue(payload.error) || 'Edellinen generointi epäonnistui. Voit korjata asetukset ja yrittää uudelleen.', 'error');
      } else if (payload?.status === 'empty') {
        clearPendingJob();
        setNotice('Luo ensin elokuvan maailma. Kohtaukset tehdään sen jälkeen valitusta luvusta.', 'ready');
      } else {
        clearPendingJob();
        setNotice('Käsikirjoitustyöpöytä ladattiin. Kaikki muutokset tallentuvat palvelimelle revisioina.', 'ready');
      }
      if (!activeId) queueAutomaticPromptSave(createdPrompts);
    } catch (error) {
      if (error?.name === 'AbortError' || generation !== state.loadGeneration) return;
      state.manifest = emptyManifest();
      renderAll();
      setSaveState('error', 'Lataus epäonnistui');
      setNotice(error.message || 'Käsikirjoitustyöpöytää ei voitu ladata.', 'error', 'Yritä uudelleen', () => loadProject(state.projectId));
    }
  }

  function bindEvents() {
    elements['screenplay-notice-action'].addEventListener('click', () => state.noticeAction?.());
    elements['screenplay-text-model-retry'].addEventListener('click', retryTextModels);
    elements['screenplay-open-video'].addEventListener('click', () => {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'skriptlab:video-workspace-tab', tab: 'video' }, window.location.origin);
      } else {
        const query = state.projectId ? `?project=${encodeURIComponent(state.projectId)}` : '';
        window.location.assign(`index.html${query}`);
      }
    });
    document.querySelectorAll('[data-screenplay-view]').forEach((button) => {
      button.addEventListener('click', () => setActiveView(button.dataset.screenplayView, { scroll: true }));
      button.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const tabs = ['world', 'scenes', 'preview', 'export'];
        const current = tabs.indexOf(state.activeView);
        let nextView;
        if (event.key === 'Home') nextView = tabs[0];
        else if (event.key === 'End') nextView = tabs[tabs.length - 1];
        else {
          const direction = event.key === 'ArrowRight' ? 1 : -1;
          nextView = tabs[(current + direction + tabs.length) % tabs.length];
        }
        setActiveView(nextView, { focus: true });
      });
    });
    document.querySelectorAll('[data-open-view]').forEach((button) => {
      button.addEventListener('click', () => setActiveView(button.dataset.openView, { scroll: true }));
    });
    elements['screenplay-generate-world'].addEventListener('click', () => startGeneration('world'));
    elements['screenplay-generate-chapter'].addEventListener('click', () => startGeneration('chapter'));
    elements['screenplay-generate-scene-image'].addEventListener('click', (event) => generateImageFor('scene', null, event.currentTarget));
    elements['screenplay-export-scene'].addEventListener('click', () => downloadExport(elements['screenplay-export-scene-select'].value));
    elements['screenplay-export-all'].addEventListener('click', () => downloadExport(''));

    [
      'screenplay-manifest-title', 'screenplay-logline', 'screenplay-synopsis',
      'screenplay-style-prompt', 'screenplay-cinematography-prompt',
    ].forEach((id) => elements[id].addEventListener('input', (event) => applyManifestInput(event.currentTarget)));
    elements['screenplay-aspect-ratio'].addEventListener('change', (event) => {
      applyManifestInput(event.currentTarget);
      elements['screenplay-image-ratio'].value = event.currentTarget.value;
    });
    elements['screenplay-without-text'].addEventListener('change', (event) => applyManifestInput(event.currentTarget));

    [
      'screenplay-scene-title', 'screenplay-scene-summary', 'screenplay-scene-script',
      'screenplay-scene-continuity', 'screenplay-scene-image-prompt', 'screenplay-scene-video-prompt',
    ].forEach((id) => elements[id].addEventListener('input', (event) => applySceneInput(event.currentTarget)));
    elements['screenplay-scene-duration'].addEventListener('change', (event) => {
      applySceneInput(event.currentTarget);
      event.currentTarget.value = selectedScene()?.duration_s || 8;
    });

    elements['screenplay-chapter-select'].addEventListener('change', (event) => {
      state.selectedChapterId = positiveInteger(event.currentTarget.value);
      const scenes = scenesForSelectedChapter();
      if (!scenes.some((scene) => scene.id === state.selectedSceneId)) state.selectedSceneId = scenes[0]?.id || null;
      renderSceneList();
      renderSceneEditor();
    });
    elements['screenplay-scene-list'].addEventListener('click', (event) => {
      const card = event.target.closest('[data-scene-id]');
      if (!card) return;
      state.selectedSceneId = card.dataset.sceneId;
      renderSceneList();
      renderSceneEditor();
    });
    elements['screenplay-scene-location'].addEventListener('change', (event) => {
      const scene = selectedScene();
      if (!scene) return;
      const value = stringValue(event.currentTarget.value);
      if (value) scene.location_id = value;
      else delete scene.location_id;
      scene.assignments_initialized = true;
      renderSelectedReferences(scene);
      renderCompiledPrompts(scene);
      renderPreview();
      markDirty();
    });
    elements['screenplay-scene-characters'].addEventListener('change', () => {
      const scene = selectedScene();
      if (!scene) return;
      scene.character_ids = [...elements['screenplay-scene-characters'].querySelectorAll('input:checked')].map((input) => input.value);
      scene.assignments_initialized = true;
      renderSelectedReferences(scene);
      renderCompiledPrompts(scene);
      renderPreview();
      markDirty();
    });
    elements['screenplay-scene-asset-select'].addEventListener('change', (event) => {
      const scene = selectedScene();
      if (!scene) return;
      const assetId = positiveInteger(event.currentTarget.value);
      if (!setSceneKeyframeAsset(scene, assetId)) return;
      renderAsset(elements['screenplay-scene-asset'], assetId, scene.title || 'Kohtauskuva');
      renderSceneList();
      renderPreview();
      markDirty();
    });
    elements['screenplay-export-scene-select'].addEventListener('change', (event) => {
      state.selectedSceneId = event.currentTarget.value || state.selectedSceneId;
      syncControls();
    });

    document.querySelectorAll('[data-image-model-select]').forEach((select) => {
      select.addEventListener('change', (event) => syncImageModelSelects(event.currentTarget.value));
    });
    document.querySelectorAll('[data-image-size-select]').forEach((select) => {
      select.addEventListener('change', (event) => syncImageSizeSelects(event.currentTarget.value));
    });
    document.querySelectorAll('[data-image-ratio-select]').forEach((select) => {
      select.addEventListener('change', (event) => syncImageRatioSelects(event.currentTarget.value));
    });
    elements['screenplay-preview-list'].addEventListener('input', (event) => {
      const field = event.target.closest('[data-preview-image-prompt]');
      if (!field || state.operationActive || state.conflict) return;
      const scene = state.manifest?.scenes?.find((item) => item.id === field.dataset.sceneId);
      if (!scene) return;
      scene.image_prompt = field.value;
      scene.image_prompt_source = 'manual';
      const card = field.closest('[data-preview-scene-id]');
      const requestPrompt = card?.querySelector('[data-preview-request-prompt]');
      if (requestPrompt) requestPrompt.value = sceneImageRequestPrompt(scene);
      if (scene.id === state.selectedSceneId) {
        setFieldValue(elements['screenplay-scene-image-prompt'], scene.image_prompt);
        renderCompiledPrompts(scene);
      }
      markDirty();
    });
    elements['screenplay-preview-list'].addEventListener('click', async (event) => {
      const generate = event.target.closest('[data-preview-generate]');
      if (generate) {
        const scene = state.manifest?.scenes?.find((item) => item.id === generate.dataset.sceneId);
        if (scene) await generateImageFor('scene', scene, generate);
        return;
      }
      const select = event.target.closest('[data-preview-select]');
      if (!select || state.operationActive || state.imageBusy || state.conflict) return;
      const scene = state.manifest?.scenes?.find((item) => item.id === select.dataset.sceneId);
      const assetId = positiveInteger(select.dataset.assetId);
      if (!scene || !assetId || !setSceneKeyframeAsset(scene, assetId)) return;
      markDirty();
      renderSceneList();
      if (scene.id === state.selectedSceneId) renderSceneEditor();
      renderPreview();
      const saved = await flushSave();
      if (scene.keyframe_asset_id === assetId && saved) {
        setNotice('Kuvavaihtoehto otettiin käyttöön. Aiempi kuva jäi vaihtoehdoksi.', 'ready');
      } else if (scene.keyframe_asset_id === assetId && !state.conflict) {
        setNotice(
          'Kuva vaihdettiin tässä näkymässä, mutta valinnan tallennus odottaa uutta yritystä.',
          'warning',
          'Yritä tallentaa',
          () => flushSave(),
        );
      }
    });
    elements['screenplay-world-entities'].addEventListener('input', (event) => {
      if (event.target.matches('[data-entity-field]')) applyEntityInput(event.target);
    });
    elements['screenplay-world-entities'].addEventListener('change', (event) => {
      const select = event.target.closest('[data-entity-asset-select]');
      if (!select) return;
      const card = select.closest('[data-entity-kind]');
      const entity = entityFromCard(card);
      if (!entity) return;
      const assetId = positiveInteger(select.value);
      const key = card.dataset.entityKind === 'character' ? 'reference_asset_id' : 'background_asset_id';
      if (assetId) entity[key] = assetId;
      else delete entity[key];
      renderAsset(card.querySelector('[data-entity-asset]'), assetId, entity.name, true);
      renderSelectedReferences(selectedScene());
      markDirty();
    });
    elements['screenplay-world-entities'].addEventListener('click', (event) => {
      const card = event.target.closest('[data-entity-kind]');
      if (!card) return;
      const entity = entityFromCard(card);
      if (event.target.closest('[data-entity-copy]')) {
        copyText(entityPrompt(entity));
      } else {
        const generate = event.target.closest('[data-entity-generate]');
        if (generate) generateImageFor(card.dataset.entityKind, entity, generate);
      }
    });
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-copy-target]');
      if (!button) return;
      const target = byId(button.dataset.copyTarget);
      copyText(target?.value || target?.textContent, target);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && state.dirty && !state.conflict) flushSave();
    });
    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin) return;
      if (window.parent && window.parent !== window && event.source !== window.parent) return;
      if (event.data?.type !== 'skriptlab:video-project-changed') return;
      const projectId = positiveInteger(event.data.projectId);
      if (projectId === state.projectId) return;
      loadProject(projectId);
    });
    window.addEventListener('storage', (event) => {
      if (event.key !== 'skriptlab_active_project_id' || state.dirty || state.operationActive) return;
      const projectId = positiveInteger(event.newValue);
      if (projectId !== state.projectId) loadProject(projectId);
    });
  }

  function init() {
    collectElements();
    bindEvents();
    setActiveView('world');
    loadProject();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
