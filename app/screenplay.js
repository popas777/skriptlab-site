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
    assets: new Map(),
    assetRequests: new Map(),
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
      'screenplay-export-panel', 'screenplay-text-model', 'screenplay-world-image-model',
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
    return {
      id: stringValue(raw?.id, 80) || `scene-${index + 1}`,
      order: clampInteger(raw?.order, 0, 10000, index),
      title: stringValue(raw?.title, 500),
      source: deepClone(raw?.source && typeof raw.source === 'object' ? raw.source : {}),
      summary: stringValue(raw?.summary, 4000),
      screenplay_text: String(raw?.screenplay_text || '').slice(0, 12000),
      character_ids: [...new Set((Array.isArray(raw?.character_ids) ? raw.character_ids : []).map((value) => stringValue(value, 80)).filter(Boolean))].slice(0, 16),
      ...(stringValue(raw?.location_id, 80) ? { location_id: stringValue(raw.location_id, 80) } : {}),
      duration_s: clampInteger(raw?.duration_s, 2, 120, 8),
      continuity_note: stringValue(raw?.continuity_note, 2000),
      image_prompt: stringValue(raw?.image_prompt, 4000),
      video_prompt: stringValue(raw?.video_prompt, 2000),
      image_prompt_source: normalizePromptSource(raw?.image_prompt_source),
      video_prompt_source: normalizePromptSource(raw?.video_prompt_source),
      ...(assetId ? { keyframe_asset_id: assetId } : {}),
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
    const next = ['world', 'scenes', 'export'].includes(view) ? view : 'world';
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
    setFieldValue(elements['screenplay-image-ratio'], manifest.aspect_ratio);
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
    scenes.forEach((item) => { if (positiveInteger(item.keyframe_asset_id)) assetIds.add(Number(item.keyframe_asset_id)); });
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
          option.textContent = `${model.display_name || model.model_name} · ${model.model_name}`;
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
    const select = elements['screenplay-image-size'];
    const previous = select.value;
    select.replaceChildren(...sizes.map((size) => Object.assign(document.createElement('option'), { value: size, textContent: size })));
    select.value = sizes.includes(previous) ? previous : sizes[0];
  }

  function renderTextModels() {
    const select = elements['screenplay-text-model'];
    const defaultModel = state.textModels.find((model) => model.is_default) || null;
    const options = [Object.assign(document.createElement('option'), { value: '', textContent: 'Järjestelmän oletus' })];
    state.textModels.forEach((model) => {
      const option = document.createElement('option');
      option.value = imageModelValue(model);
      option.textContent = `${model.display_name || model.model_name} · ${model.model_name}`;
      options.push(option);
    });
    select.replaceChildren(...options);
    select.value = defaultModel ? imageModelValue(defaultModel) : '';
    select.disabled = false;
  }

  async function loadModels(generation) {
    const [images, texts] = await Promise.all([
      api('/api/models/image').catch(() => []),
      api('/api/models/text').catch(() => []),
    ]);
    if (generation !== state.loadGeneration) return;
    state.imageModels = Array.isArray(images) ? images : [];
    state.textModels = Array.isArray(texts) ? texts : [];
    renderImageModels();
    renderTextModels();
    syncControls();
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
  }

  function syncControls() {
    const scene = selectedScene();
    const hasProject = Boolean(state.projectId);
    const busy = state.operationActive || state.imageBusy;
    const documentLocked = state.operationActive || state.conflict;
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
    elements['screenplay-text-model'].disabled = documentLocked;
    elements['screenplay-world-entities'].querySelectorAll('[data-entity-field], [data-entity-asset-select]').forEach((field) => {
      field.disabled = documentLocked;
    });
    elements['screenplay-scene-characters'].querySelectorAll('input').forEach((field) => {
      field.disabled = documentLocked;
    });
    elements['screenplay-generate-world'].disabled = !hasProject || busy || state.conflict;
    elements['screenplay-generate-chapter'].disabled = !selectedChapter() || busy || state.conflict;
    elements['screenplay-generate-scene-image'].disabled = !scene
      || !stringValue(scene.image_prompt)
      || !selectedImageModelValue()
      || busy
      || state.conflict;
    elements['screenplay-export-scene'].disabled = !elements['screenplay-export-scene-select']?.value || busy || state.dirty || state.conflict;
    elements['screenplay-export-all'].disabled = !(state.manifest?.scenes?.length) || busy || state.dirty || state.conflict;
    document.querySelectorAll('[data-entity-generate]').forEach((button) => {
      const card = button.closest('[data-entity-kind]');
      const entity = entityFromCard(card);
      button.disabled = !entity || !stringValue(entity.image_prompt) || !selectedImageModelValue() || busy || state.conflict;
    });
    document.querySelectorAll('[data-image-model-select]').forEach((select) => {
      select.disabled = !state.imageModels.length || state.imageBusy || state.operationActive || state.conflict;
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

  async function generateImageFor(kind, entity = null, button = null) {
    if (state.imageBusy || state.operationActive || state.conflict) return;
    const scene = kind === 'scene' ? selectedScene() : null;
    const prompt = kind === 'scene' ? sceneImageRequestPrompt(scene) : entityImageRequestPrompt(kind, entity);
    const chapterCustomId = imageChapterCustomId(scene);
    if (!prompt) {
      setNotice('Kirjoita ensin englanninkielinen kuvaprompti.', 'warning');
      return;
    }
    if (!chapterCustomId) {
      setNotice('Kuvagenerointi tarvitsee kirjan luvun. Valitse luku ja yritä uudelleen.', 'error');
      return;
    }
    if (!selectedImageModelValue()) {
      setNotice('Valitse käytettävä kuvamalli.', 'warning');
      return;
    }
    const originalLabel = button?.textContent || '';
    const projectId = state.projectId;
    const generation = state.loadGeneration;
    state.imageBusy = true;
    state.imageController?.abort();
    state.imageController = new AbortController();
    if (button) button.textContent = 'Generoidaan oikeaa kuvaa…';
    syncControls();
    setNotice('Kuvapyyntö lähetettiin valitulle kuvamallille. Valmis kuva tallennetaan projektin assetiksi.', 'loading');
    try {
      const payload = await api(`/api/projects/${encodeURIComponent(projectId)}/visual-images`, jsonOptions({
        model: selectedImageModelValue(),
        visual_kind: kind,
        section_label: kind === 'scene' ? (scene?.title || 'Kohtaus') : (entity?.name || (kind === 'character' ? 'Hahmo' : 'Paikka')),
        chapter_custom_id: chapterCustomId,
        prompt,
        aspect_ratio: kind === 'character'
          ? '3:4'
          : kind === 'scene'
            ? (elements['screenplay-image-ratio']?.value || state.manifest.aspect_ratio || '16:9')
            : (state.manifest.aspect_ratio || '16:9'),
        image_size: elements['screenplay-image-size']?.value || '1K',
        use_analysis: true,
        use_project_memory: true,
        without_text: state.manifest.without_text !== false,
      }, { method: 'POST', signal: state.imageController.signal }));
      if (generation !== state.loadGeneration || projectId !== state.projectId) return;
      const assetId = positiveInteger(payload?.id);
      if (!assetId) throw new Error('Kuvapalvelu ei palauttanut tallennetun assetin tunnistetta.');
      state.assets.set(assetId, payload);
      if (kind === 'scene') scene.keyframe_asset_id = assetId;
      else if (kind === 'character') entity.reference_asset_id = assetId;
      else entity.background_asset_id = assetId;
      markDirty();
      const saved = await flushSave();
      if (kind === 'scene') {
        renderSceneList();
        renderSceneEditor();
      } else {
        renderWorldEntities();
        renderSelectedReferences(selectedScene());
      }
      setNotice(
        saved
          ? 'Kuva generoitiin, tallennettiin projektin assetiksi ja liitettiin käsikirjoitukseen.'
          : 'Kuva generoitiin ja tallennettiin projektiin, mutta liitoksen tallennus odottaa uutta yritystä.',
        saved ? 'ready' : 'warning',
      );
    } catch (error) {
      if (error?.name === 'AbortError' || generation !== state.loadGeneration) return;
      setNotice(error.message || 'Kuvan generointi epäonnistui.', 'error');
    } finally {
      if (generation === state.loadGeneration) {
        state.imageBusy = false;
        state.imageController = null;
        if (button) button.textContent = originalLabel;
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
        applyWorkspace(payload);
        clearPendingJob(clientRequestId);
        state.operationActive = false;
        renderAll();
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
    const model = selectedTextModelValue();
    if (model) common.model = model;
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
    loadModels(generation);
    try {
      const payload = await api(workspacePath(), { signal: state.loadController.signal });
      if (generation !== state.loadGeneration) return;
      applyWorkspace(payload);
      renderAll();
      loadAssetLibrary(generation);
      const persisted = readPendingJob();
      const activeId = ACTIVE_JOB_STATES.has(stringValue(payload?.status)) ? stringValue(payload?.client_request_id) : '';
      if (activeId) {
        savePendingJob(persisted?.clientRequestId === activeId ? persisted : { clientRequestId: activeId, kind: payload?.operation || 'unknown' });
        monitorJob(activeId, payload);
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
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const tabs = ['world', 'scenes', 'export'];
        const current = tabs.indexOf(state.activeView);
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        setActiveView(tabs[(current + direction + tabs.length) % tabs.length], { focus: true });
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
      renderSelectedReferences(scene);
      renderCompiledPrompts(scene);
      markDirty();
    });
    elements['screenplay-scene-characters'].addEventListener('change', () => {
      const scene = selectedScene();
      if (!scene) return;
      scene.character_ids = [...elements['screenplay-scene-characters'].querySelectorAll('input:checked')].map((input) => input.value);
      renderSelectedReferences(scene);
      renderCompiledPrompts(scene);
      markDirty();
    });
    elements['screenplay-scene-asset-select'].addEventListener('change', (event) => {
      const scene = selectedScene();
      if (!scene) return;
      const assetId = positiveInteger(event.currentTarget.value);
      if (assetId) scene.keyframe_asset_id = assetId;
      else delete scene.keyframe_asset_id;
      renderAsset(elements['screenplay-scene-asset'], assetId, scene.title || 'Kohtauskuva');
      renderSceneList();
      markDirty();
    });
    elements['screenplay-export-scene-select'].addEventListener('change', (event) => {
      state.selectedSceneId = event.currentTarget.value || state.selectedSceneId;
      syncControls();
    });

    document.querySelectorAll('[data-image-model-select]').forEach((select) => {
      select.addEventListener('change', (event) => syncImageModelSelects(event.currentTarget.value));
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
