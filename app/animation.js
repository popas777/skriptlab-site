(function () {
  'use strict';

  const ACTIVE = new Set(['queued', 'running']);
  const REQUEST_KEY = 'skriptlab_animation_request_v1_';
  const IMAGE_DATA = /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/]+=*$/i;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const PRESETS = {
    original: '',
    watercolor: 'Restyle this exact scene as a cinematic hand-painted watercolor animation frame. Translucent pigment, delicate paper texture, soft natural lighting and a consistent restrained color palette. Preserve every character’s identity, age, facial features, costume, pose, scene action and composition. Keep clear readable silhouettes. No text, letters, captions, logos or watermarks.',
    anime: 'Restyle this exact scene as a beautifully hand-drawn 2D animated film frame. Clean expressive linework, soft cel shading, richly painted backgrounds and cohesive cinematic colors. Preserve every character’s identity, age, facial features, costume, pose, scene action and composition. No text, letters, captions, logos or watermarks.',
    three_d: 'Restyle this exact scene as a stylized cinematic 3D animated film frame. Soft sculpted forms, tactile materials, gentle global illumination and a cohesive warm color palette. Preserve every character’s identity, age, recognizable facial features, costume, pose, scene action and composition. No text, letters, captions, logos or watermarks.',
    paper: 'Restyle this exact scene as a handcrafted layered paper-cut animation frame. Distinct paper layers, subtle tactile paper grain, elegant simplified shapes and soft dimensional shadows. Use a consistent cinematic palette. Preserve character identities, ages, costumes, poses, scene action and composition. No text, letters, captions, logos or watermarks.',
    comic: 'Restyle this exact scene as a cinematic graphic-novel illustration. Confident clean ink contours, sophisticated flat colors, subtle halftone texture and expressive controlled lighting. Preserve every character’s identity, age, facial features, costume, pose, scene action and composition. A single continuous image without panels, speech bubbles, text, letters, captions, logos or watermarks.',
    custom: '',
  };
  const DEFAULTS = { title: '', aspect_ratio: '16:9', resolution: 720, style_preset: 'original', style_prompt: '', language: 'fi', voice_name: 'Kore', tts_model: '', delivery: 'natural', narration_enabled: true, show_text: true, text_position: 'bottom', scenes: [] };
  const state = { projectId: null, manifest: null, revision: 0, jobs: [], selectedId: null, selected: new Set(), view: 'scenes', dirty: false, conflict: false, loading: false, busy: false, seq: 0, generation: 0, saveTimer: null, savePromise: null, pollTimer: null, job: null, pending: null, noticeAction: null, models: { text: [], image: [] }, options: null, assets: new Map(), assetRequests: new Map(), observer: null, videoUrl: '', videoJobId: '', downloading: false, previewTimer: null, playing: false };
  const el = (name) => document.getElementById(`animation-${name}`);
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const positive = (value) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const workspacePath = (suffix = '') => `/api/projects/${state.projectId}/animation${suffix}`;
  const scenes = () => state.manifest?.scenes || [];
  const enabledScenes = () => scenes().filter((scene) => scene.enabled !== false);
  const currentScene = () => scenes().find((scene) => scene.id === state.selectedId) || null;
  const locked = () => state.loading || state.busy || state.conflict || Boolean(state.pending) || ACTIVE.has(state.job?.status);
  const batchScenes = () => enabledScenes().filter((scene) => !state.selected.size || state.selected.has(scene.id));
  const imageId = (scene) => positive(scene?.use_styled_image !== false && scene?.styled_asset_id ? scene.styled_asset_id : scene?.source_asset_id);
  const json = (body) => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const captionPreview = { pages: [], index: 0 };

  function captionPages(text, measure, maxWidth) {
    const lines = [];
    for (const paragraph of String(text).split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (measure(candidate) <= maxWidth) { line = candidate; continue; }
        if (line) { lines.push(line); line = ''; }
        for (const character of word) {
          if (line && measure(line + character) > maxWidth) { lines.push(line); line = ''; }
          line += character;
        }
      }
      if (line) lines.push(line);
    }
    const pages = [];
    for (let index = 0; index < lines.length; index += 2) pages.push(lines.slice(index, index + 2).join('\n'));
    return pages;
  }

  function captionPageAt(pages, progress) {
    const weights = pages.map((page) => Math.max(1, Array.from(page.replace(/\s/g, '')).length));
    const target = clamp(progress, 0, 1) * weights.reduce((sum, weight) => sum + weight, 0);
    let end = 0;
    for (let index = 0; index < weights.length; index += 1) {
      end += weights[index];
      if (target < end) return index;
    }
    return Math.max(0, pages.length - 1);
  }

  function showCaptionPage(index) {
    captionPreview.index = clamp(index, 0, Math.max(0, captionPreview.pages.length - 1));
    el('stage-caption').textContent = captionPreview.pages[captionPreview.index] || '';
    el('caption-controls').hidden = !captionPreview.pages.length;
    el('caption-count').textContent = `Tekstijakso ${captionPreview.index + 1} / ${captionPreview.pages.length}`;
    el('caption-previous').disabled = !captionPreview.index;
    el('caption-next').disabled = captionPreview.index >= captionPreview.pages.length - 1;
  }

  function errorText(payload, fallback) {
    const detail = payload?.detail;
    if (Array.isArray(detail)) return detail.map((item) => item.msg || '').join(' ') || fallback;
    return String(typeof detail === 'object' && detail ? detail.message || fallback : detail || payload?.message || fallback);
  }

  async function api(path, options = {}) {
    let response;
    try { response = await window.SkriptLabAuth.fetch(path, options); }
    catch (cause) { const error = new Error('Yhteys palvelimeen katkesi. Tarkista verkkoyhteys ja yritä uudelleen.'); error.network = true; error.cause = cause; throw error; }
    const payload = await response.json().catch(() => null);
    if (!response.ok) { const error = new Error(errorText(payload, `Pyyntö epäonnistui (${response.status}).`)); error.status = response.status; error.payload = payload; throw error; }
    return payload;
  }

  function notice(message = '', mode = '', label = '', action = null) {
    el('notice').hidden = !message;
    el('notice').dataset.mode = mode;
    el('notice-text').textContent = message;
    el('notice-action').hidden = !label || !action;
    el('notice-action').textContent = label;
    state.noticeAction = action;
  }

  function saveLabel(label, error = false) {
    el('save-state').textContent = label;
    el('save-state').dataset.state = error ? 'error' : 'ready';
  }

  function markDirty() {
    state.dirty = true;
    state.seq += 1;
    saveLabel('Tallennetaan…');
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => flushSave(), 650);
    renderGuide();
    renderReadiness();
    syncControls();
  }

  async function flushSave() {
    clearTimeout(state.saveTimer);
    if (state.savePromise) { await state.savePromise; if (state.dirty && !state.conflict) return flushSave(); return !state.dirty; }
    if (!state.dirty) return true;
    if (state.conflict || !state.manifest || state.pending || ACTIVE.has(state.job?.status)) return false;
    const generation = state.generation;
    const sequence = state.seq;
    const body = { base_revision: state.revision, manifest: copy(state.manifest) };
    state.savePromise = (async () => {
      try {
        const payload = await api(workspacePath(), { method: 'PUT', ...json(body) });
        if (generation !== state.generation) return false;
        state.revision = Number(payload.revision);
        state.dirty = sequence !== state.seq;
        saveLabel(state.dirty ? 'Tallennetaan…' : 'Tallennettu');
        return true;
      } catch (error) {
        if (generation !== state.generation) return false;
        saveLabel('Tallennus odottaa', true);
        if (error.status === 409) {
          state.conflict = true;
          notice('Työpöytä on muuttunut toisessa näkymässä. Omat tallentamattomat muutokset ovat yhä tässä näkymässä. Lataa palvelimen versio jatkaaksesi; se korvaa nämä muutokset.', 'error', 'Lataa palvelimen versio', () => loadProject(state.projectId, true));
        } else notice(error.message, 'error', 'Yritä tallentaa', () => flushSave());
        syncControls();
        return false;
      } finally { if (generation === state.generation) state.savePromise = null; }
    })();
    const saved = await state.savePromise;
    if (saved && state.dirty && generation === state.generation) return flushSave();
    return saved;
  }

  function normalizeManifest(value) {
    const result = { ...DEFAULTS, ...(value || {}) };
    result.scenes = Array.isArray(result.scenes) ? result.scenes.map((scene) => ({ enabled: true, text: '', motion: 'zoom_in', focus_x: .5, focus_y: .5, zoom_percent: 8, duration_s: 8, use_styled_image: true, ...scene })) : [];
    return result;
  }

  function applyWorkspace(payload) {
    state.manifest = normalizeManifest(payload.manifest);
    state.revision = Number(payload.revision) || 0;
    state.jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
    if (!scenes().some((scene) => scene.id === state.selectedId)) state.selectedId = scenes()[0]?.id || null;
    state.selected = new Set([...state.selected].filter((id) => scenes().some((scene) => scene.id === id)));
    state.dirty = false;
    state.conflict = false;
    saveLabel('Tallennettu');
  }

  function readPending(projectId) {
    try {
      const value = JSON.parse(sessionStorage.getItem(REQUEST_KEY + projectId) || 'null');
      const body = value?.body;
      if (value?.projectId !== projectId || !UUID.test(body?.client_request_id || '') || !['narration', 'style', 'render'].includes(body?.operation) || !Number.isInteger(body.base_revision) || !Array.isArray(body.scene_ids)) return null;
      return value;
    } catch (_) { return null; }
  }

  function writePending(value) {
    state.pending = value;
    try { if (value) sessionStorage.setItem(REQUEST_KEY + state.projectId, JSON.stringify(value)); else sessionStorage.removeItem(REQUEST_KEY + state.projectId); } catch (_) { /* Server jobs remain discoverable if session storage is unavailable. */ }
    syncControls();
  }

  function uuid() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    const bytes = new Uint8Array(16); window.crypto.getRandomValues(bytes); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function modelValue(model) { return model.provider && model.model_name ? `${model.provider}:${model.model_name}` : model.id || model.model_name || ''; }

  function fillOptions(select, models, preferred, fallback) {
    const old = preferred || select.value;
    const list = models.map((model) => Object.assign(document.createElement('option'), { value: modelValue(model), textContent: model.display_name || model.name || model.model_name || model.id }));
    if (!list.length) list.push(Object.assign(document.createElement('option'), { value: '', textContent: fallback }));
    select.replaceChildren(...list);
    select.value = list.some((option) => option.value === old) ? old : (models.find((model) => model.is_default) ? modelValue(models.find((model) => model.is_default)) : list[0].value);
  }

  async function loadModels() {
    const generation = state.generation;
    const optionsPath = workspacePath('/options');
    const results = await Promise.allSettled([api('/api/models/text?purpose=video_screenplay'), api('/api/models/image'), api(optionsPath)]);
    if (generation !== state.generation) return;
    state.models.text = results[0].status === 'fulfilled' && Array.isArray(results[0].value) ? results[0].value : [];
    state.models.image = results[1].status === 'fulfilled' && Array.isArray(results[1].value) ? results[1].value.filter((model) => String(model.model_name || '').toLowerCase().includes('gemini') && !String(model.model_name || '').toLowerCase().includes('imagen')) : [];
    state.options = results[2].status === 'fulfilled' ? results[2].value : null;
    fillOptions(el('text-model'), state.models.text, '', 'Tekstimallit eivät ole käytettävissä');
    fillOptions(el('image-model'), state.models.image, '', 'Kuvaviitteitä käyttävää Gemini-mallia ei löytynyt');
    fillOptions(el('voice'), state.options?.voices || [], state.manifest?.voice_name, 'Ääniä ei saatu ladattua');
    fillOptions(el('tts-model'), state.options?.models || [], state.manifest?.tts_model || state.options?.default_model, 'Puhemallit eivät ole käytettävissä');
    el('voice-help').textContent = state.options?.configured ? 'Puhe luodaan videon koonnissa. Muuttumaton puhe käytetään uudelleen. Kohtauksen kesto mukautuu puheen pituuteen.' : 'Puhepalvelu ei ole käytettävissä. Päivitä mallit ja äänet tai poista kertojan ääni käytöstä tehdäksesi äänettömän videon.';
    syncControls(); renderReadiness();
  }

  function setView(view, focus = false) {
    if (view !== 'scenes' && typeof window !== "undefined" && window.SkriptLabBookAccess && !window.SkriptLabBookAccess.guardTab("module.video")) return;
    if (!['scenes', 'style', 'output'].includes(view)) return;
    state.view = view;
    document.querySelectorAll('[data-view]').forEach((button) => { const active = button.dataset.view === view; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
    document.querySelectorAll('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== view; });
    stopPreview();
    if (view === 'scenes') updatePreview();
    if (focus) el(`${view}-tab`).focus({ preventScroll: true });
  }

  function renderGuide() {
    const included = enabledScenes();
    const missingImages = included.filter((scene) => !imageId(scene)).length;
    const missingText = included.filter((scene) => !scene.text.trim()).length;
    let title = 'Viimeistele ääni ja koosta video';
    let label = 'Ääni ja video';
    let next = () => setView('output', true);
    if (!scenes().length) { title = 'Tuo käsikirjoituksen kohtaukset'; label = 'Tuo kohtaukset'; next = importScreenplay; }
    else if (!included.length) { title = 'Valitse vähintään yksi kohtaus videoon'; label = 'Valitse kohtaukset'; next = () => setView('scenes', true); }
    else if (missingImages) { title = `Täydennä ${missingImages} puuttuvaa kohtauskuvaa`; label = 'Avaa käsikirjoitus'; next = openScreenplay; }
    else if (missingText && (state.manifest.narration_enabled || state.manifest.show_text)) { title = 'Viimeistele kohtauksille kertojatekstit'; label = 'Muokkaa tekstejä'; next = () => { setView('scenes'); el('text-batch').scrollIntoView({ block: 'center', behavior: 'smooth' }); }; }
    el('next-step').textContent = title;
    el('next-action').textContent = label;
    el('next-action').onclick = next;
    const styled = included.filter((scene) => scene.styled_asset_id && scene.use_styled_image !== false).length;
    el('readiness').textContent = scenes().length ? `${included.length} kohtausta mukana · ${included.length - missingImages} kuvaa · ${included.length - missingText} kertojatekstiä · ${styled} tyyliteltyä kuvaa` : 'Kohtauskuvat, kevyt liike, kertojan ääni ja teksti. Ei AI-videogenerointia.';
  }

  async function loadAsset(id) {
    if (state.assets.has(id)) { const data = state.assets.get(id); state.assets.delete(id); state.assets.set(id, data); return data; }
    if (state.assetRequests.has(id)) return state.assetRequests.get(id);
    const generation = state.generation;
    const request = api(`/api/projects/${state.projectId}/graphic-assets/${id}`).then((asset) => {
      if (generation !== state.generation) return '';
      const data = IMAGE_DATA.test(asset?.data_url || '') ? asset.data_url : '';
      if (data) { state.assets.set(id, data); while (state.assets.size > 12) state.assets.delete(state.assets.keys().next().value); }
      return data;
    }).finally(() => { if (generation === state.generation) state.assetRequests.delete(id); });
    state.assetRequests.set(id, request);
    return request;
  }

  async function showAsset(container, id, title, editor = false) {
    container.dataset.assetId = id ? String(id) : '';
    const generation = state.generation;
    container.replaceChildren();
    if (!id) { if (editor) { el('stage-empty').hidden = false; el('stage-empty').textContent = 'Tältä kohtaukselta puuttuu kuva. Luo tai valitse kuva käsikirjoituksessa.'; } return; }
    try {
      const data = await loadAsset(id);
      if (generation !== state.generation || container.dataset.assetId !== String(id) || !container.isConnected) return;
      if (!data) throw new Error('Kuvaa ei saatu ladattua.');
      const image = document.createElement('img'); image.src = data; image.alt = title || 'Kohtauskuva'; image.decoding = 'async';
      container.replaceChildren(image);
      if (editor) el('stage-empty').hidden = true;
    } catch (_) {
      if (generation !== state.generation || container.dataset.assetId !== String(id)) return;
      container.textContent = '▧';
      if (editor) { el('stage-empty').hidden = false; el('stage-empty').textContent = 'Kuvan lataus epäonnistui. Valitse kohtaus uudelleen yrittääksesi uudestaan.'; }
    }
  }

  function observeThumbnails() {
    state.observer?.disconnect();
    if (!('IntersectionObserver' in window)) { document.querySelectorAll('.scene-thumb').forEach((node) => showAsset(node, positive(node.dataset.assetId), node.dataset.title)); return; }
    state.observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      const node = entry.target;
      if (entry.isIntersecting) showAsset(node, positive(node.dataset.imageId), node.dataset.title);
      else { node.dataset.assetId = ''; node.replaceChildren(); }
    }), { rootMargin: '100px' });
    document.querySelectorAll('.scene-thumb').forEach((node) => state.observer.observe(node));
  }

  function renderSceneList() {
    const focused = document.activeElement;
    const focusData = focused && el('scene-list').contains(focused) ? { ...focused.dataset } : null;
    el('scene-count').textContent = `${scenes().length} kohtausta`;
    const nodes = scenes().map((scene, index) => {
      const card = document.createElement('article'); card.className = `scene-item${scene.id === state.selectedId ? ' is-selected' : ''}${scene.enabled === false ? ' is-excluded' : ''}`; card.dataset.sceneId = scene.id;
      const check = document.createElement('input'); check.type = 'checkbox'; check.checked = state.selected.has(scene.id); check.dataset.batchSelect = scene.id; check.setAttribute('aria-label', `Valitse massagenerointiin: ${scene.title || `Kohtaus ${index + 1}`}`);
      const thumbnail = document.createElement('div'); thumbnail.className = 'scene-thumb'; thumbnail.dataset.imageId = imageId(scene) || ''; thumbnail.dataset.title = scene.title || '';
      const select = document.createElement('button'); select.type = 'button'; select.className = 'scene-select'; select.dataset.selectScene = scene.id; select.setAttribute('aria-pressed', String(scene.id === state.selectedId));
      const title = document.createElement('strong'); title.textContent = `${index + 1}. ${scene.title || 'Nimetön kohtaus'}`;
      const detail = document.createElement('small'); detail.textContent = `${scene.enabled === false ? 'Ei mukana' : !imageId(scene) ? 'Kuva puuttuu' : scene.styled_asset_id && scene.use_styled_image !== false ? 'Tyylitelty kuva' : 'Alkuperäinen kuva'} · ${scene.text.trim() ? 'Teksti valmis' : 'Teksti puuttuu'}`;
      select.append(title, detail);
      const order = document.createElement('div'); order.className = 'scene-order';
      [-1, 1].forEach((direction) => { const button = document.createElement('button'); button.type = 'button'; button.dataset.moveScene = scene.id; button.dataset.direction = direction; button.textContent = direction < 0 ? '↑' : '↓'; button.setAttribute('aria-label', `Siirrä ${scene.title || 'kohtaus'} ${direction < 0 ? 'aikaisemmaksi' : 'myöhemmäksi'}`); button.dataset.boundary = String(direction < 0 ? index === 0 : index === scenes().length - 1); order.append(button); });
      card.append(check, thumbnail, select, order); return card;
    });
    el('scene-list').replaceChildren(...nodes);
    const selectedCount = scenes().filter((scene) => state.selected.has(scene.id)).length;
    el('select-all').checked = Boolean(scenes().length && selectedCount === scenes().length);
    el('select-all').indeterminate = selectedCount > 0 && selectedCount < scenes().length;
    observeThumbnails(); syncControls(); renderBatchSummary();
    if (focusData) {
      const replacement = [...el('scene-list').querySelectorAll('button, input')].find((node) => Object.entries(focusData).every(([key, value]) => node.dataset[key] === value));
      replacement?.focus({ preventScroll: true });
    }
  }

  function updateSceneListStatus() {
    const scene = currentScene();
    if (!scene) return;
    const card = [...el('scene-list').children].find((node) => node.dataset.sceneId === scene.id);
    if (!card) return;
    card.classList.toggle('is-excluded', scene.enabled === false);
    card.querySelector('strong').textContent = `${scenes().indexOf(scene) + 1}. ${scene.title || 'Nimetön kohtaus'}`;
    card.querySelector('small').textContent = `${scene.enabled === false ? 'Ei mukana' : !imageId(scene) ? 'Kuva puuttuu' : scene.styled_asset_id && scene.use_styled_image !== false ? 'Tyylitelty kuva' : 'Alkuperäinen kuva'} · ${scene.text.trim() ? 'Teksti valmis' : 'Teksti puuttuu'}`;
  }

  function renderEditor() {
    stopPreview();
    const scene = currentScene();
    el('scene-workbench').hidden = !scene;
    if (!scene) return;
    el('scene-number').textContent = `Kohtaus ${scenes().indexOf(scene) + 1} / ${scenes().length}`;
    el('scene-heading').textContent = scene.title || 'Nimetön kohtaus';
    document.querySelectorAll('[data-scene-field]').forEach((input) => { const value = scene[input.dataset.sceneField]; if (input.type === 'checkbox') input.checked = Boolean(value); else input.value = value == null ? '' : value; });
    el('image-choices').hidden = !scene.styled_asset_id;
    el('image-status').textContent = scene.use_styled_image === false ? 'Alkuperäinen kuva käytössä' : 'Tyylitelty kuva käytössä';
    el('stage-empty').hidden = false;
    el('stage-empty').textContent = 'Ladataan kuvaa…';
    showAsset(el('stage-image'), imageId(scene), scene.title, true);
    updatePreview(); syncControls();
  }

  function updatePreview() {
    const scene = currentScene(); if (!scene) return;
    const stage = el('motion-stage');
    stage.style.aspectRatio = state.manifest.aspect_ratio.replace(':', ' / ');
    stage.dataset.motion = scene.motion;
    stage.style.setProperty('--focus-x', `${scene.focus_x * 100}%`);
    stage.style.setProperty('--focus-y', `${scene.focus_y * 100}%`);
    stage.style.setProperty('--zoom', 1 + scene.zoom_percent / 100);
    stage.style.setProperty('--pan', `${scene.zoom_percent / 4}%`);
    stage.style.setProperty('--duration', `${scene.duration_s}s`);
    el('focus-marker').style.left = `${scene.focus_x * 100}%`;
    el('focus-marker').style.top = `${scene.focus_y * 100}%`;
    el('focus-marker').hidden = !imageId(scene) || scene.motion === 'still';
    el('stage-caption').dataset.position = state.manifest.text_position;
    const caption = el('stage-caption');
    const style = getComputedStyle(caption);
    const context = document.createElement('canvas').getContext('2d');
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    // Measure the stage even when an empty caption has display:none.
    const width = stage.clientWidth * .86 - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 4;
    captionPreview.pages = state.manifest.show_text && width > 0 ? captionPages(scene.text, (text) => context.measureText(text).width, width) : [];
    showCaptionPage(0);
    el('text-count').textContent = `${scene.text.length} / 800`;
    el('zoom-value').textContent = `${scene.zoom_percent} %`;
    el('focus-x-value').textContent = `${Math.round(scene.focus_x * 100)} %`;
    el('focus-y-value').textContent = `${Math.round(scene.focus_y * 100)} %`;
  }

  function stopPreview() {
    clearInterval(state.previewTimer); state.playing = false;
    el('motion-stage').classList.remove('is-playing');
    el('preview-motion').textContent = '▶ Kokeile liikettä ja tekstiä';
    el('preview-motion').setAttribute('aria-pressed', 'false');
  }

  function previewMotion() {
    if (state.playing) { stopPreview(); return; }
    state.playing = true;
    showCaptionPage(0);
    el('motion-stage').classList.add('is-playing');
    el('preview-motion').textContent = '■ Pysäytä'; el('preview-motion').setAttribute('aria-pressed', 'true');
    const start = performance.now();
    const duration = (Number(currentScene()?.duration_s) || 8) * 1000;
    state.previewTimer = setInterval(() => {
      const progress = Math.min(1, (performance.now() - start) / duration);
      showCaptionPage(captionPageAt(captionPreview.pages, progress));
      if (progress >= 1) stopPreview();
    }, 80);
  }

  function renderBatchSummary() {
    const target = batchScenes();
    const prefix = state.selected.size ? `${target.length} valittua, videoon sisältyvää kohtausta.` : `Kaikki ${target.length} videoon sisältyvää kohtausta.`;
    el('text-batch-summary').textContent = `${prefix} ${target.filter((scene) => !scene.text.trim()).length} kertojatekstiä puuttuu. Tekstejä voi muokata myös itse.`;
    el('style-batch-summary').textContent = `${prefix} ${target.filter((scene) => scene.styled_asset_id).length} on jo tyylitelty. Uudet kuvat tallennetaan alkuperäisten rinnalle.`;
    el('generate-text').textContent = el('replace-text').checked ? 'Luo kertojatekstit uudelleen' : 'Luo puuttuvat kertojatekstit';
  }

  function renderReadiness() {
    const included = enabledScenes();
    const missingImages = included.filter((scene) => !imageId(scene)).length;
    const missingText = included.filter((scene) => !scene.text.trim()).length;
    const messages = [
      [Boolean(included.length), `${included.length} kohtausta mukana videossa`],
      [Boolean(included.length && !missingImages), missingImages ? `${missingImages} kohtaukselta puuttuu kuva` : 'Kaikilla kohtauksilla on kuva'],
      [!missingText || (!state.manifest?.narration_enabled && !state.manifest?.show_text), missingText ? `${missingText} kohtaukselta puuttuu kertojateksti${!state.manifest?.narration_enabled && !state.manifest?.show_text ? ' · ei tarvita ilman ääntä ja tekstiä' : ''}` : 'Kertojatekstit valmiina'],
      [!state.manifest?.narration_enabled || Boolean(state.options?.configured && el('tts-model').value), state.manifest?.narration_enabled ? state.options?.configured ? `Kertojan ääni · ${el('voice').value || state.manifest.voice_name}` : 'Puhepalvelu ei ole käytettävissä' : 'Video ilman puhetta'],
      [true, `${state.manifest?.aspect_ratio || '16:9'} · ${state.manifest?.resolution || '720'}p · ${state.manifest?.show_text ? 'teksti kuvan päällä' : 'ei tekstiä kuvassa'}`],
    ];
    el('render-readiness').replaceChildren(...messages.map(([ready, text]) => { const item = document.createElement('li'); if (!ready) item.className = 'is-missing'; item.textContent = text; return item; }));
  }

  function renderResult() {
    const lastRender = state.jobs.find((job) => job.operation === 'render');
    const uncertainSpeech = lastRender?.status === 'failed' && lastRender?.error_code === 'animation_speech_uncertain';
    el('speech-retry').hidden = !uncertainSpeech || !state.manifest?.narration_enabled;
    const latest = state.jobs.filter((job) => job.operation === 'render' && job.status === 'completed' && job.download_url).sort((a, b) => String(b.completed_at || b.created_at).localeCompare(String(a.completed_at || a.created_at)))[0];
    el('video-result').hidden = !latest;
    if (!latest) return;
    const stamp = latest.completed_at || latest.created_at;
    const time = stamp ? new Date(stamp).toLocaleString('fi-FI') : '';
    el('video-version').textContent = `${time ? `Luotu ${time}. ` : ''}Video vastaa sen koontihetken kohtauksia ja asetuksia. Muutosten jälkeen luo uusi MP4.`;
    el('load-video').dataset.jobId = latest.id;
    if (state.videoJobId && state.videoJobId !== latest.id) revokeVideo();
    el('load-video').hidden = state.videoJobId === latest.id && Boolean(state.videoUrl);
  }

  function renderAll() {
    el('project-name').textContent = state.manifest.title || `Kirjaprojekti ${state.projectId}`;
    document.querySelectorAll('[data-manifest-field]').forEach((input) => { const value = state.manifest[input.dataset.manifestField]; if (input.type === 'checkbox') input.checked = Boolean(value); else input.value = value == null ? '' : String(value); });
    if (state.options) {
      fillOptions(el('voice'), state.options.voices || [], state.manifest.voice_name, 'Ääniä ei saatu ladattua');
      fillOptions(el('tts-model'), state.options.models || [], state.manifest.tts_model || state.options.default_model, 'Puhemalleja ei saatu ladattua');
    }
    el('scenes-empty').hidden = Boolean(scenes().length);
    el('text-batch').hidden = !scenes().length;
    renderGuide(); renderSceneList(); renderEditor(); renderBatchSummary(); renderReadiness(); renderResult(); syncControls();
  }

  function syncControls() {
    const isLocked = locked();
    const target = batchScenes();
    document.querySelectorAll('[data-manifest-field], [data-scene-field], [data-batch-select], [data-move-scene]').forEach((input) => { input.disabled = isLocked || input.dataset.boundary === 'true'; });
    ['import', 'import-empty', 'select-all', 'replace-text', 'replace-images', 'center-focus'].forEach((name) => { el(name).disabled = isLocked; });
    el('next-action').disabled = isLocked && !scenes().length;
    el('text-model').disabled = isLocked || !state.models.text.length;
    el('image-model').disabled = isLocked || !state.models.image.length || state.manifest?.style_preset === 'original';
    el('generate-text').disabled = isLocked || !el('text-model').value || !target.length || (!el('replace-text').checked && target.every((scene) => scene.text.trim()));
    el('generate-style').disabled = isLocked || !el('image-model').value || !target.some((scene) => scene.source_asset_id && (el('replace-images').checked || !scene.styled_asset_id)) || state.manifest?.style_preset === 'original' || !state.manifest?.style_prompt?.trim();
    el('style-prompt').disabled = isLocked || state.manifest?.style_preset === 'original';
    el('voice-settings').hidden = !state.manifest?.narration_enabled;
    el('text-position-field').hidden = !state.manifest?.show_text;
    el('tts-model').disabled = isLocked || !state.options?.configured || !state.options?.models?.length;
    el('voice').disabled = isLocked || !state.options?.voices?.length;
    const included = enabledScenes();
    const needsText = state.manifest?.narration_enabled || state.manifest?.show_text;
    el('render').disabled = isLocked || !included.length || included.some((scene) => !imageId(scene) || (needsText && !scene.text.trim())) || (state.manifest?.narration_enabled && (!state.options?.configured || !el('tts-model').value));
    el('retry-speech').disabled = el('render').disabled;
    el('preview-motion').disabled = !imageId(currentScene());
    el('reload-models').disabled = state.loading || state.busy;
    el('load-video').disabled = state.downloading;
    el('cancel-job').hidden = !ACTIVE.has(state.job?.status) || Boolean(state.job?.cancel_requested);
  }

  async function importScreenplay() {
    if (locked() || !state.projectId) return;
    state.busy = true; syncControls();
    const generation = state.generation;
    try {
      if (!await flushSave()) return;
      notice('Tuodaan käsikirjoituksen uudet kohtaukset…');
      const before = scenes().length;
      const missingBefore = new Set(scenes().filter((scene) => !scene.source_asset_id).map((scene) => scene.id));
      const payload = await api(workspacePath('/import-screenplay'), { method: 'POST', ...json({ base_revision: state.revision }) });
      if (generation !== state.generation) return;
      applyWorkspace(payload); renderAll(); setView('scenes');
      const added = scenes().length - before;
      const filled = scenes().filter((scene) => missingBefore.has(scene.id) && scene.source_asset_id).length;
      notice(added || filled ? `${added} uutta kohtausta tuotu${filled ? ` ja ${filled} puuttuvaa kuvaa täydennetty` : ''}. Voit nyt muokata tekstejä ja liikettä tai valita kuville yhteisen tyylin.` : 'Uusia kohtauksia tai puuttuvia kuvia ei löytynyt. Nykyiset animaatiokohtaukset ja muokkauksesi säilyivät ennallaan.', 'success');
    } catch (error) { if (generation === state.generation) { if (error.status === 409) conflictNotice(error); else notice(error.message, 'error', 'Yritä tuontia uudelleen', importScreenplay); } }
    finally { if (generation === state.generation) { state.busy = false; syncControls(); } }
  }

  function conflictNotice(error) {
    state.conflict = true;
    notice(error?.message || 'Työpöytä on muuttunut toisessa näkymässä.', 'error', 'Lataa palvelimen versio', () => loadProject(state.projectId, true));
  }

  async function startJob(operation, retryFailedSpeech = false) {
    if (locked() || !state.projectId) return;
    state.busy = true; syncControls(); stopPreview();
    const generation = state.generation;
    try {
      if (operation === 'render' && state.manifest.narration_enabled) {
        const tts = el('tts-model').value;
        const voice = el('voice').value;
        if (tts && state.manifest.tts_model !== tts) { state.manifest.tts_model = tts; markDirty(); }
        if (voice && state.manifest.voice_name !== voice) { state.manifest.voice_name = voice; markDirty(); }
      }
      if (!await flushSave() || generation !== state.generation) return;
      const body = { client_request_id: uuid(), base_revision: state.revision, operation, scene_ids: operation === 'render' || !state.selected.size ? [] : batchScenes().map((scene) => scene.id), replace_existing: operation === 'style' ? el('replace-images').checked : operation === 'narration' ? el('replace-text').checked : false };
      if (operation === 'render' && retryFailedSpeech) body.retry_failed_speech = true;
      if (operation === 'style') body.model = el('image-model').value;
      if (operation === 'narration') body.model = el('text-model').value;
      writePending({ projectId: state.projectId, body });
      await submitPending();
    } finally { if (generation === state.generation) { state.busy = false; syncControls(); } }
  }

  function uncertain(error) { return error.network || !error.status || error.status === 408 || error.status >= 500; }

  async function submitPending() {
    if (!state.pending) return;
    const generation = state.generation;
    const request = copy(state.pending);
    state.busy = true; syncControls();
    notice('Lähetetään työ palvelimelle…');
    try {
      const payload = await api(workspacePath('/jobs'), { method: 'POST', ...json(request.body) });
      if (generation !== state.generation) return;
      writePending(null); state.job = payload;
      state.jobs = [payload, ...state.jobs.filter((job) => job.id !== payload.id)];
      await handleJob(payload);
    } catch (error) {
      if (generation !== state.generation) return;
      if (uncertain(error)) notice('Palvelimen kuittausta ei saatu. Työ on voinut jo käynnistyä. Tarkista tai jatka samalla työpyynnöllä; uutta työtä ei luoda.', 'error', 'Tarkista sama työ', reconcilePending);
      else { writePending(null); if (error.status === 409) conflictNotice(error); else notice(error.message, 'error'); }
    } finally { if (generation === state.generation) { state.busy = false; syncControls(); } }
  }

  async function reconcilePending() {
    if (!state.pending || state.busy) return;
    state.busy = true; syncControls();
    const generation = state.generation;
    try {
      const payload = await api(workspacePath());
      if (generation !== state.generation) return;
      const found = (payload.jobs || []).find((job) => job.client_request_id === state.pending.body.client_request_id);
      if (found) { writePending(null); await handleJob(found); }
      else await submitPending();
    } catch (error) { if (generation === state.generation) notice(error.message, 'error', 'Tarkista sama työ', reconcilePending); }
    finally { if (generation === state.generation) { state.busy = false; syncControls(); } }
  }

  function renderJob(job) {
    const names = { narration: 'Luodaan kertojatekstejä', style: 'Muunnetaan kohtauskuvien tyyliä', render: 'Koostetaan animaatiovideota' };
    el('job-panel').hidden = !ACTIVE.has(job?.status);
    if (!ACTIVE.has(job?.status)) return;
    el('job-title').textContent = names[job.operation] || 'Työ on käynnissä';
    el('job-progress').value = clamp(job.progress_percent, 0, 100);
    el('job-detail').textContent = job.cancel_requested ? 'Keskeytystä pyydetty. Odotetaan käynnissä olevan vaiheen päättymistä.' : `${job.status === 'queued' ? 'Jonossa. ' : ''}${Number(job.completed_scenes) || 0} / ${Number(job.total_scenes) || 0} kohtausta · ${Math.round(Number(job.progress_percent) || 0)} %. Voit palata tähän myöhemmin.`;
    syncControls();
  }

  async function handleJob(job) {
    clearTimeout(state.pollTimer);
    if (!ACTIVE.has(job.status)) state.busy = true;
    state.job = job;
    state.jobs = [job, ...state.jobs.filter((item) => item.id !== job.id)];
    renderJob(job); syncControls();
    if (ACTIVE.has(job.status)) { notice(); state.pollTimer = setTimeout(() => pollJob(job.id), 2400); return; }
    const generation = state.generation;
    try {
      const payload = await api(workspacePath());
      if (generation !== state.generation) return;
      applyWorkspace(payload); renderAll();
      if (job.status === 'completed') {
        notice(job.operation === 'render' ? 'MP4-video on valmis. Avaa se ja tarkista ääni, tekstit ja rajaukset ennen lataamista.' : job.operation === 'style' ? 'Kuvien tyylimuunnos valmistui. Tyylitellyt kuvat ovat käytössä; voit vaihtaa kohtauskohtaisesti alkuperäiseen.' : 'Kertojatekstit ovat valmiit. Tarkista ja muokkaa tekstejä ennen videon koontia.', 'success');
        if (job.operation === 'render') setView('output');
      } else notice(job.error || (job.status === 'cancelled' ? 'Työ keskeytettiin. Jo valmistuneet tekstit ja kuvat säilyivät.' : 'Työ epäonnistui. Jo valmistuneet tekstit ja kuvat säilyivät. Voit tarkistaa asetukset ja käynnistää uuden työn.'), job.status === 'failed' ? 'error' : '');
    } catch (error) { if (generation === state.generation) { state.conflict = true; notice('Työn tila päivittyi, mutta uusimpia kohtauksia ei saatu ladattua. Päivitä työpöytä ennen muokkaamista.', 'error', 'Päivitä työpöytä', () => loadProject(state.projectId, true)); } }
    finally { if (generation === state.generation) { state.busy = false; syncControls(); } }
  }

  async function pollJob(id) {
    const generation = state.generation;
    try { const job = await api(workspacePath(`/jobs/${encodeURIComponent(id)}`)); if (generation === state.generation) await handleJob(job); }
    catch (error) { if (generation === state.generation) { notice('Työn tilaa ei saatu haettua. Työ voi silti jatkua palvelimella.', 'error', 'Tarkista työn tila', () => pollJob(id)); state.pollTimer = setTimeout(() => pollJob(id), 12000); } }
  }

  async function cancelJob() {
    if (!ACTIVE.has(state.job?.status)) return;
    const generation = state.generation;
    el('cancel-job').disabled = true;
    try { const job = await api(workspacePath(`/jobs/${encodeURIComponent(state.job.id)}/cancel`), { method: 'POST' }); if (generation === state.generation) await handleJob(job); }
    catch (error) { if (generation === state.generation) notice(error.message, 'error', 'Tarkista työn tila', () => pollJob(state.job.id)); }
    finally { el('cancel-job').disabled = false; }
  }

  function revokeVideo() {
    el('result-video').pause(); el('result-video').removeAttribute('src'); el('result-video').load(); el('result-video').hidden = true;
    el('download-video').removeAttribute('href'); el('download-video').hidden = true;
    if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
    state.videoUrl = ''; state.videoJobId = '';
  }

  async function downloadVideo() {
    const jobId = el('load-video').dataset.jobId;
    if (!jobId || state.downloading) return;
    const generation = state.generation;
    state.downloading = true; el('load-video').textContent = 'Ladataan videota…'; syncControls();
    try {
      const response = await window.SkriptLabAuth.fetch(workspacePath(`/jobs/${encodeURIComponent(jobId)}/download`));
      if (!response.ok) throw new Error(errorText(await response.json().catch(() => null), `Videon lataus epäonnistui (${response.status}).`));
      const blob = await response.blob();
      if (generation !== state.generation) return;
      if (!blob.size || !(response.headers.get('content-type') || '').toLowerCase().includes('video/')) throw new Error('Palvelin ei palauttanut toistettavaa videotiedostoa.');
      revokeVideo(); state.videoUrl = URL.createObjectURL(blob); state.videoJobId = jobId;
      el('result-video').src = state.videoUrl; el('result-video').hidden = false;
      el('download-video').href = state.videoUrl;
      el('download-video').download = `${(state.manifest.title || 'animaatio').replace(/[^\p{L}\p{N}_ -]/gu, '').slice(0, 100) || 'animaatio'}.mp4`;
      el('download-video').hidden = false; el('load-video').hidden = true;
    } catch (error) { if (generation === state.generation) notice(error.message || 'Videon lataus epäonnistui.', 'error', 'Yritä ladata video', downloadVideo); }
    finally { if (generation === state.generation) { state.downloading = false; el('load-video').textContent = 'Avaa valmis video'; syncControls(); } }
  }

  async function loadProject(id, discard = false) {
    if (!discard && state.dirty && !await flushSave()) return;
    clearTimeout(state.saveTimer); clearTimeout(state.pollTimer); stopPreview(); revokeVideo(); state.observer?.disconnect();
    state.generation += 1;
    const generation = state.generation;
    state.projectId = positive(id); state.manifest = null; state.job = null; state.jobs = []; state.selectedId = null; state.selected.clear(); state.assets.clear(); state.assetRequests.clear(); state.conflict = false; state.dirty = false; state.busy = false; state.loading = true; state.savePromise = null; state.options = null; state.downloading = false; state.pending = readPending(state.projectId);
    el('workspace').hidden = true; el('project-empty').hidden = Boolean(state.projectId); el('job-panel').hidden = true;
    if (!state.projectId) { state.loading = false; notice(); saveLabel('Ei projektia'); el('project-name').textContent = 'Valitse kirja pääsovelluksesta'; return; }
    notice('Ladataan animaatiostudion kohtauksia…'); saveLabel('Ladataan…');
    try {
      const payload = await api(workspacePath());
      if (generation !== state.generation) return;
      applyWorkspace(payload);
      const matching = state.pending ? state.jobs.find((job) => job.client_request_id === state.pending.body.client_request_id) : null;
      if (matching) writePending(null);
      state.job = matching || state.jobs.find((job) => ACTIVE.has(job.status)) || null;
      state.loading = false; el('workspace').hidden = false; renderAll();
      loadModels();
      if (state.job) await handleJob(state.job);
      else if (state.pending) notice('Edellisen työpyynnön kuittaus jäi saamatta. Tarkista sama työ ennen uusien muutosten tekemistä.', 'error', 'Tarkista sama työ', reconcilePending);
      else notice();
    } catch (error) { if (generation === state.generation) { state.loading = false; notice(error.message, 'error', 'Yritä ladata uudelleen', () => loadProject(state.projectId, true)); saveLabel('Lataus epäonnistui', true); } }
  }

  function openScreenplay() {
    if (window.parent !== window) window.parent.postMessage({ type: 'skriptlab:video-workspace-tab', tab: 'screenplay' }, window.location.origin);
    else window.location.assign(`screenplay.html${state.projectId ? `?project=${state.projectId}` : ''}`);
  }

  function inputValue(input) { return input.type === 'checkbox' ? input.checked : input.type === 'number' || input.type === 'range' ? Number(input.value) : input.value; }

  function bindEvents() {
    el('notice-action').addEventListener('click', () => state.noticeAction?.());
    document.querySelectorAll('[data-open-screenplay]').forEach((button) => button.addEventListener('click', openScreenplay));
    document.querySelectorAll('[data-go-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.goView, true)));
    document.querySelectorAll('[data-view]').forEach((button) => {
      button.addEventListener('click', () => setView(button.dataset.view));
      button.addEventListener('keydown', (event) => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const views = ['scenes', 'style', 'output']; const index = views.indexOf(state.view); setView(event.key === 'Home' ? views[0] : event.key === 'End' ? views[2] : views[(index + (event.key === 'ArrowRight' ? 1 : 2)) % 3], true); });
    });
    document.querySelectorAll('[data-manifest-field]').forEach((input) => input.addEventListener('input', () => {
      if (locked() || !state.manifest) return;
      const key = input.dataset.manifestField; state.manifest[key] = key === 'resolution' ? Number(input.value) : inputValue(input);
      if (key === 'style_preset') {
        if (input.value !== 'custom') { state.manifest.style_prompt = PRESETS[input.value] || ''; el('style-prompt').value = state.manifest.style_prompt; }
        if (input.value === 'original') { scenes().forEach((scene) => { scene.use_styled_image = false; }); renderSceneList(); renderEditor(); }
      }
      if (key === 'title') el('project-name').textContent = input.value || `Kirjaprojekti ${state.projectId}`;
      stopPreview(); markDirty(); updatePreview(); renderBatchSummary(); renderResult();
    }));
    document.querySelectorAll('[data-scene-field]').forEach((input) => input.addEventListener('input', () => {
      const scene = currentScene(); if (!scene || locked()) return;
      scene[input.dataset.sceneField] = inputValue(input);
      if (input.dataset.sceneField === 'title') el('scene-heading').textContent = input.value || 'Nimetön kohtaus';
      if (input.dataset.sceneField === 'use_styled_image') { renderEditor(); renderSceneList(); }
      stopPreview(); markDirty(); updatePreview(); updateSceneListStatus(); renderBatchSummary();
    }));
    el('motion-stage').addEventListener('click', (event) => {
      const scene = currentScene(); if (!scene || locked() || !imageId(scene) || scene.motion === 'still') return;
      const rect = el('motion-stage').getBoundingClientRect();
      scene.focus_x = Math.round(clamp((event.clientX - rect.left) / rect.width, 0, 1) * 100) / 100;
      scene.focus_y = Math.round(clamp((event.clientY - rect.top) / rect.height, 0, 1) * 100) / 100;
      el('focus-x').value = scene.focus_x; el('focus-y').value = scene.focus_y; stopPreview(); markDirty(); updatePreview();
    });
    el('center-focus').addEventListener('click', () => { const scene = currentScene(); if (!scene || locked()) return; scene.focus_x = .5; scene.focus_y = .5; el('focus-x').value = .5; el('focus-y').value = .5; stopPreview(); markDirty(); updatePreview(); });
    el('preview-motion').addEventListener('click', previewMotion);
    el('caption-previous').addEventListener('click', () => { stopPreview(); showCaptionPage(captionPreview.index - 1); });
    el('caption-next').addEventListener('click', () => { stopPreview(); showCaptionPage(captionPreview.index + 1); });
    window.addEventListener('resize', () => { stopPreview(); updatePreview(); });
    el('scene-list').addEventListener('change', (event) => { if (!event.target.dataset.batchSelect || locked()) return; if (event.target.checked) state.selected.add(event.target.dataset.batchSelect); else state.selected.delete(event.target.dataset.batchSelect); renderSceneList(); });
    el('scene-list').addEventListener('click', (event) => {
      const select = event.target.closest('[data-select-scene]');
      if (select) { state.selectedId = select.dataset.selectScene; renderSceneList(); renderEditor(); return; }
      const move = event.target.closest('[data-move-scene]');
      if (!move || locked()) return;
      const index = scenes().findIndex((scene) => scene.id === move.dataset.moveScene); const target = index + Number(move.dataset.direction);
      if (index < 0 || target < 0 || target >= scenes().length) return;
      const [scene] = scenes().splice(index, 1); scenes().splice(target, 0, scene); markDirty(); renderSceneList(); renderEditor();
    });
    el('select-all').addEventListener('change', () => { state.selected = new Set(el('select-all').checked ? scenes().map((scene) => scene.id) : []); renderSceneList(); });
    ['replace-text', 'replace-images'].forEach((name) => el(name).addEventListener('change', () => { renderBatchSummary(); syncControls(); }));
    ['text-model', 'image-model'].forEach((name) => el(name).addEventListener('change', syncControls));
    el('import').addEventListener('click', importScreenplay); el('import-empty').addEventListener('click', importScreenplay);
    el('generate-text').addEventListener('click', () => startJob('narration')); el('generate-style').addEventListener('click', () => startJob('style')); el('render').addEventListener('click', () => startJob('render'));
    el('cancel-job').addEventListener('click', cancelJob); el('load-video').addEventListener('click', downloadVideo); el('reload-models').addEventListener('click', loadModels);
    el('retry-speech').addEventListener('click', () => startJob('render', true));
    window.addEventListener('message', (event) => { if (event.origin !== window.location.origin || (window.parent !== window && event.source !== window.parent) || event.data?.type !== 'skriptlab:video-project-changed') return; const id = positive(event.data.projectId); if (id !== state.projectId) loadProject(id); });
    window.addEventListener('storage', (event) => { if (event.key === 'skriptlab_active_project_id' && !state.dirty) { const id = positive(event.newValue); if (id !== state.projectId) loadProject(id); } });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { stopPreview(); if (state.dirty) flushSave(); } });
    window.addEventListener('beforeunload', (event) => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });
    window.addEventListener('pagehide', () => { if (state.videoUrl) URL.revokeObjectURL(state.videoUrl); });
  }

  function init() {
    if (!window.SkriptLabAuth?.requireLogin()) return;
    bindEvents();
    const params = new URLSearchParams(window.location.search);
    let stored = ''; try { stored = localStorage.getItem('skriptlab_active_project_id') || ''; } catch (_) { /* URL project selection still works. */ }
    loadProject(positive(params.get('project') || stored));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
