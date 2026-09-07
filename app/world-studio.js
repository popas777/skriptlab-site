const byId = name => document.getElementById(`world-${name}`);
const KIND_LABELS = { building: 'Rakennus', tower: 'Torni', tree: 'Puu', rock: 'Kallio', water: 'Vesistö', path: 'Reitti', character: 'Henkilö', prop: 'Esine' };
const ORIGIN_LABELS = { source: 'Teoksesta tunnistettu kohde', inferred: 'Luonnosta täydentävä ehdotus', user: 'Käyttäjän määrittelemä kohde' };
const FILE_LABELS = { world: 'maailman tiedot', locations: 'paikat', characters: 'henkilöt', brief: 'mallinnusohje', scene: '3D-näkymä', unreal: 'Unreal-tuontiskripti' };
const state = { projectId: null, revision: 0, worldRevision: 0, world: null, files: [], source: {}, title: '', tab: 'demo', selectedId: null, loading: false, busy: false, generation: 0, controller: null, viewer: null, viewerPromise: null, renderedRevision: null, active: true, retry: null, urls: new Set() };
const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const locked = () => state.loading || state.busy || !state.projectId;
const workspacePath = (suffix = '') => `/api/projects/${state.projectId}/world-studio${suffix}`;
const json = body => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const node = (tag, text = '', className = '') => { const el = document.createElement(tag); el.textContent = text; if (className) el.className = className; return el; };
const sizeLabel = size => Number(size) < 1024 ? `${Number(size) || 0} tavua` : Number(size) < 1048576 ? `${(Number(size) / 1024).toLocaleString('fi-FI', { maximumFractionDigits: 1 })} kt` : `${(Number(size) / 1048576).toLocaleString('fi-FI', { maximumFractionDigits: 1 })} Mt`;

function errorText(payload, fallback) {
  const detail = payload?.detail;
  if (Array.isArray(detail)) return detail.map(item => item.msg || '').join(' ') || fallback;
  return String(typeof detail === 'object' && detail ? detail.message || fallback : detail || fallback);
}

async function api(path, options = {}, binary = false) {
  let response;
  try { response = await window.SkriptLabAuth.fetch(path, { signal: state.controller?.signal, ...options }); }
  catch (error) { if (error.name === 'AbortError') throw error; throw new Error('Yhteys palvelimeen katkesi. Tarkista yhteys ja lataa projektin tilanne uudelleen.'); }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const error = new Error(errorText(payload, `Pyyntö epäonnistui (${response.status}).`));
    error.status = response.status;
    throw error;
  }
  return binary ? response.blob() : response.json();
}

function notice(message = '', error = false, retry = null, label = 'Lataa tilanne uudelleen') {
  byId('notice').hidden = !message;
  byId('notice-text').textContent = message;
  byId('notice').dataset.error = String(error);
  byId('retry').hidden = !retry;
  byId('retry').textContent = label;
  state.retry = retry;
}

function saveState(text, error = false) { byId('save-state').textContent = text; byId('save-state').dataset.error = String(error); }

function syncControls() {
  const busy = locked();
  byId('generate-form').querySelectorAll('input,select,textarea,button').forEach(el => { el.disabled = busy; });
  byId('file-types').disabled = busy || !state.world;
  byId('create-files').disabled = busy || !state.world || !document.querySelector('input[name="file-kind"]:checked');
  byId('download-zip').disabled = busy || !state.files.length;
  byId('file-list').querySelectorAll('button').forEach(button => { button.disabled = busy; });
  byId('generate').textContent = state.busy && byId('stage-loading').hidden === false ? 'Luodaan luonnosta…' : state.tab === 'files' && !state.world ? 'Luo maailman pohja' : state.world ? 'Luo demo uudelleen' : 'Luo demo';
  byId('replace-note').hidden = !state.world;
  byId('reset-camera').disabled = !state.world;
  byId('workspace').setAttribute('aria-busy', String(state.busy || state.loading));
}

function sourceModeChanged() {
  const textMode = byId('source-mode').value === 'text';
  byId('source-text-field').hidden = !textMode;
  byId('source-text').required = textMode;
}

function placeSourceForm() {
  const filesNeedsSource = state.tab === 'files' && !state.world;
  const target = byId(filesNeedsSource ? 'files-settings' : 'demo-settings');
  target.append(byId('source-settings'));
  byId('source-settings').hidden = false;
  byId('files-settings').hidden = !filesNeedsSource;
}

function setTab(tab, focus = false) {
  state.tab = tab === 'files' ? 'files' : 'demo';
  for (const name of ['demo', 'files']) {
    const active = name === state.tab;
    byId(`${name}-panel`).hidden = !active;
    byId(`${name}-tab`).setAttribute('aria-selected', String(active));
    byId(`${name}-tab`).tabIndex = active ? 0 : -1;
  }
  placeSourceForm();
  state.viewer?.setActive(state.active && state.tab === 'demo');
  if (state.tab === 'demo' && state.world) showWorld();
  syncControls();
  if (focus) byId(`${state.tab}-tab`).focus();
}

function applyPayload(payload) {
  state.revision = Number(payload.revision) || 0;
  state.worldRevision = Number(payload.world_revision) || 0;
  state.world = payload.world || null;
  state.files = Array.isArray(payload.files) ? payload.files : [];
  state.source = payload.source || {};
  state.title = payload.title || state.world?.title || `Teos ${state.projectId}`;
  if (!state.world?.entities?.some(entity => entity.id === state.selectedId)) state.selectedId = null;
}

function renderEntities() {
  const entities = state.world?.entities || [];
  byId('entity-list').replaceChildren();
  byId('entities-section').hidden = !entities.length;
  byId('entity-count').textContent = `${entities.length} kohdetta`;
  byId('description').textContent = state.world?.description || '';
  for (const entity of entities) {
    const row = node('button', '', 'entity-row'); row.type = 'button'; row.dataset.entityId = entity.id;
    row.setAttribute('aria-pressed', String(entity.id === state.selectedId));
    const dot = node('span', '', 'entity-dot'); dot.setAttribute('aria-hidden', 'true');
    if (/^#[0-9a-f]{6}$/i.test(entity.color || '')) dot.style.backgroundColor = entity.color;
    row.append(dot, node('span', entity.name), node('small', KIND_LABELS[entity.kind] || 'Kohde'));
    byId('entity-list').append(row);
  }
  renderEntityDetail();
}

function renderEntityDetail() {
  const detail = byId('entity-detail'); detail.replaceChildren();
  const entity = state.world?.entities?.find(item => item.id === state.selectedId);
  if (!entity) { detail.append(node('h3', 'Valitse kohde'), node('p', 'Valitse kohde näkymästä tai luettelosta nähdäksesi sen yhteyden teokseen.')); return; }
  detail.append(node('p', ORIGIN_LABELS[entity.origin] || 'Luonnosehdotus', 'entity-origin'), node('h3', entity.name), node('p', entity.description || KIND_LABELS[entity.kind] || ''));
  for (const ref of (entity.source_refs || []).slice(0, 2)) {
    if (!ref.quote) continue;
    const quote = node('blockquote', ref.quote);
    quote.append(node('cite', ref.chapter_id ? `Lähde: ${ref.chapter_id}${ref.paragraph_id ? ` · ${ref.paragraph_id}` : ''}` : 'Lähde: käytetty teksti'));
    detail.append(quote);
  }
  detail.append(node('p', 'Sijainti, väri ja mittasuhteet ovat tämän 3D-luonnoksen toteutusvalintoja.', 'layout-note'));
}

function selectEntity(entity, moveCamera = false) {
  state.selectedId = entity?.id || null;
  for (const row of byId('entity-list').querySelectorAll('[data-entity-id]')) row.setAttribute('aria-pressed', String(row.dataset.entityId === state.selectedId));
  renderEntityDetail();
  if (moveCamera && entity) state.viewer?.focusEntity(entity.id);
}

function renderError(error) {
  byId('render-error').hidden = false;
  byId('render-error-text').textContent = error?.message || 'Selaimen 3D-tukea ei saatu käyttöön. Voit jatkaa Tiedostot-välilehdellä.';
  byId('stage-toolbar').hidden = true;
}

async function showWorld() {
  if (!state.world || state.tab !== 'demo') return;
  const generation = state.generation;
  try {
    if (!state.viewer) {
      if (!state.viewerPromise) state.viewerPromise = import('./world-studio-viewer.js?v=1');
      const { WorldStudioViewer } = await state.viewerPromise;
      if (generation !== state.generation || !state.world) return;
      if (!state.viewer) state.viewer = new WorldStudioViewer(byId('canvas'), { onSelect: entity => selectEntity(entity), onError: renderError });
    }
    state.viewer.setActive(state.active && state.tab === 'demo');
    if (state.renderedRevision !== state.worldRevision) {
      byId('render-error').hidden = true;
      if (state.viewer.load(state.world) === false) return;
      state.renderedRevision = state.worldRevision;
      byId('canvas').dataset.worldRevision = String(state.worldRevision);
    }
    byId('stage-toolbar').hidden = !byId('render-error').hidden;
    byId('stage-title').textContent = state.world.title || 'Maailman luonnos';
  } catch (error) { if (generation === state.generation) { state.viewerPromise = null; renderError(error); } }
}

function icon(kind) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.6'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', kind === 'download' ? 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5' : kind === 'delete' ? 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7' : 'M5 2h9l5 5v15H5V2Zm9 0v6h5M9 13h6m-6 4h6');
  svg.append(path); return svg;
}

function renderFiles() {
  const list = byId('file-list'); list.replaceChildren();
  byId('files-empty').hidden = state.files.length > 0;
  byId('file-count').hidden = state.files.length === 0;
  byId('file-count').textContent = String(state.files.length);
  byId('files-total').textContent = state.files.length ? `${state.files.length} tiedostoa` : '';
  byId('stale-note').hidden = !state.files.some(file => file.stale);
  byId('files-source').textContent = state.world ? `Luonnos: ${state.world.title} · versio ${state.worldRevision}` : 'Luo ensin maailman pohja teoksesta tai omasta tekstikatkelmasta.';
  byId('zip-summary').textContent = state.files.length ? `Pakettiin tulee ${state.files.length} luotua tiedostoa sekä sisältöluettelo ja käyttöohje.` : 'Luo ensin tiedostoja pakettia varten.';
  for (const file of state.files) {
    const row = node('div', '', 'file-row'); row.dataset.fileId = file.id;
    const main = node('div', '', 'file-row-main');
    const name = node('button', file.name, 'file-name'); name.type = 'button'; name.dataset.action = 'preview'; name.dataset.fileId = file.id; name.title = `Näytä ${file.name}`;
    main.append(name, node('small', `${sizeLabel(file.size_bytes)} · luonnos ${file.world_revision}${file.stale ? ' · aiempi versio' : ''}`));
    const actions = node('div', '', 'file-row-actions');
    for (const action of ['download', 'delete']) {
      const button = node('button', '', 'icon-button'); button.type = 'button'; button.dataset.action = action; button.dataset.fileId = file.id;
      button.setAttribute('aria-label', `${action === 'download' ? 'Lataa' : 'Poista paketista'} ${file.name}`); button.title = button.getAttribute('aria-label'); button.append(icon(action)); actions.append(button);
    }
    row.append(icon('file'), main, actions); list.append(row);
  }
}

function render() {
  byId('project-name').textContent = state.title;
  byId('source-summary').textContent = state.source.available ? `Kirjan teksti ja kontekstimuisti${state.source.location_count ? ` · ${state.source.location_count} paikkaa` : ''}${state.source.character_count ? ` · ${state.source.character_count} henkilöä` : ''}` : 'Lisää teokseen tekstiä tai käytä omaa tekstikatkelmaa.';
  byId('demo-empty').hidden = Boolean(state.world);
  byId('stage-toolbar').hidden = !state.world;
  placeSourceForm(); renderEntities(); renderFiles(); syncControls();
  if (state.world) showWorld();
}

async function loadProject(id) {
  const draft = state.projectId && state.projectId === positiveId(id) ? Object.fromEntries(['source-mode', 'source-text', 'instructions', 'biome', 'time-of-day'].map(name => [name, byId(name).value])) : null;
  state.controller?.abort(); state.controller = new AbortController();
  state.generation += 1;
  const generation = state.generation;
  state.viewer?.destroy(); state.viewer = null; state.viewerPromise = null; state.renderedRevision = null;
  for (const url of state.urls) URL.revokeObjectURL(url); state.urls.clear();
  byId('preview').close();
  state.projectId = positiveId(id); state.revision = 0; state.worldRevision = 0; state.world = null; state.files = []; state.source = {}; state.selectedId = null; state.busy = false; state.loading = true;
  byId('generate-form').reset(); sourceModeChanged();
  byId('workspace').hidden = true; byId('project-empty').hidden = Boolean(state.projectId); byId('stage-loading').hidden = true; byId('render-error').hidden = true;
  byId('file-list').replaceChildren(); byId('preview-content').textContent = ''; byId('file-count').hidden = true;
  if (!state.projectId) { state.loading = false; byId('project-name').textContent = 'Valitse teos'; saveState('Ei projektia'); notice(); return; }
  notice('Ladataan teoksen maailmaa…'); saveState('Ladataan…');
  try {
    const payload = await api(workspacePath());
    if (generation !== state.generation) return;
    applyPayload(payload); state.loading = false;
    if (!state.source.available || state.world?.source?.kind === 'text') byId('source-mode').value = 'text';
    if (state.world?.environment) { byId('biome').value = state.world.environment.biome || 'auto'; byId('time-of-day').value = state.world.environment.time_of_day || 'day'; }
    if (draft) for (const [name, value] of Object.entries(draft)) byId(name).value = value;
    sourceModeChanged(); byId('workspace').hidden = false; render(); notice(); saveState(state.world ? 'Tallennettu' : 'Valmis luomaan');
  } catch (error) {
    if (generation !== state.generation || error.name === 'AbortError') return;
    state.loading = false; saveState('Lataus epäonnistui', true); notice(error.message, true, () => loadProject(state.projectId));
  }
}

async function refreshSnapshot() {
  if (locked()) return;
  const generation = state.generation, revision = state.revision;
  try {
    const payload = await api(workspacePath());
    if (generation !== state.generation || state.busy || revision !== state.revision) return;
    applyPayload(payload); render();
  } catch (error) { if (generation === state.generation && error.name !== 'AbortError') notice(error.message, true, () => loadProject(state.projectId)); }
}

async function mutationFailure(error, generation) {
  if (generation !== state.generation || error.name === 'AbortError') return;
  saveState('Tarkista tilanne', true);
  notice(error.status === 409 ? 'Projektin luonnos on muuttunut toisessa näkymässä. Lataa uusin tilanne ennen jatkamista.' : error.message, true, () => loadProject(state.projectId));
}

async function generateWorld(event) {
  event?.preventDefault(); if (locked()) return;
  const sourceText = byId('source-mode').value === 'text' ? byId('source-text').value.trim() : '';
  if (byId('source-mode').value === 'text' && !sourceText) { byId('source-text').focus(); notice('Liitä ensin tekstikatkelma maailman lähtökohdaksi.', true); return; }
  const generation = state.generation;
  state.busy = true; byId('stage-loading').hidden = false; syncControls(); saveState('Luodaan…'); notice('Kootaan teoksen tiedot ja rakennetaan luonnos.');
  try {
    const payload = await api(workspacePath('/generate'), { method: 'POST', ...json({ base_revision: state.revision, source_text: sourceText, instructions: byId('instructions').value.trim(), biome: byId('biome').value, time_of_day: byId('time-of-day').value }) });
    if (generation !== state.generation) return;
    applyPayload(payload); render(); saveState('Tallennettu'); notice('Maailman luonnos on luotu ja tallennettu. Voit tutkia kohteita tai jatkaa tiedostoihin.');
  } catch (error) { await mutationFailure(error, generation); }
  finally { if (generation === state.generation) { state.busy = false; byId('stage-loading').hidden = true; syncControls(); } }
}

async function createFiles() {
  if (locked() || !state.world) return;
  const kinds = [...document.querySelectorAll('input[name="file-kind"]:checked')].map(input => input.value);
  if (!kinds.length) return;
  const generation = state.generation; state.busy = true; syncControls();
  let completed = 0;
  try {
    for (const kind of kinds) {
      notice(`Luodaan ${FILE_LABELS[kind]} (${completed + 1}/${kinds.length})…`); saveState('Luodaan tiedostoja…');
      const payload = await api(workspacePath('/files'), { method: 'POST', ...json({ base_revision: state.revision, kind, entity_ids: [] }) });
      if (generation !== state.generation) return;
      applyPayload(payload); completed += 1; renderFiles();
    }
    saveState('Tallennettu'); notice(`${completed} tiedostoa luotu. Voit tarkistaa sisällön tiedoston nimestä tai ladata koko ZIP-paketin.`);
  } catch (error) { if (completed) error.message = `${completed} tiedostoa tallennettiin. ${error.message}`; await mutationFailure(error, generation); }
  finally { if (generation === state.generation) { state.busy = false; syncControls(); } }
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob); state.urls.add(url);
  const link = node('a'); link.href = url; link.download = filename; link.hidden = true;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => { URL.revokeObjectURL(url); state.urls.delete(url); }, 30000);
}

async function fileAction(action, fileId) {
  if (locked()) return;
  const file = state.files.find(item => String(item.id) === String(fileId)); if (!file) return;
  const generation = state.generation; state.busy = true; syncControls();
  try {
    if (action === 'delete') {
      const payload = await api(workspacePath(`/files/${encodeURIComponent(file.id)}?base_revision=${state.revision}`), { method: 'DELETE' });
      if (generation !== state.generation) return;
      applyPayload(payload); renderFiles(); notice(`${file.name} poistettiin paketista. Voit luoda tiedoston uudelleen.`); saveState('Tallennettu');
    } else {
      const blob = await api(workspacePath(`/files/${encodeURIComponent(file.id)}/download`), {}, true);
      if (generation !== state.generation) return;
      if (action === 'preview') {
        const content = await blob.text(); if (generation !== state.generation) return;
        byId('preview-title').textContent = file.name;
        byId('preview-content').textContent = content.slice(0, 18000);
        byId('preview-note').textContent = content.length > 18000 ? 'Esikatselussa näytetään ensimmäiset 18 000 merkkiä. Lataus sisältää koko tiedoston.' : `${sizeLabel(file.size_bytes)} · luonnoksen versio ${file.world_revision}`;
        byId('preview').showModal();
      } else { saveBlob(blob, file.name); notice(`Lataus aloitettu: ${file.name}`); }
    }
  } catch (error) { await mutationFailure(error, generation); }
  finally { if (generation === state.generation) { state.busy = false; syncControls(); } }
}

async function downloadZip() {
  if (locked() || !state.files.length) return;
  const generation = state.generation; state.busy = true; syncControls(); notice('Kootaan ZIP-pakettia…');
  try {
    const blob = await api(workspacePath('/export'), {}, true);
    if (generation !== state.generation) return;
    saveBlob(blob, `skriptlab-maailma-${state.projectId}.zip`); notice('ZIP-paketin lataus on aloitettu. Tiedostot säilyvät myös projektissa.');
  } catch (error) { await mutationFailure(error, generation); }
  finally { if (generation === state.generation) { state.busy = false; syncControls(); } }
}

function init() {
  if (!window.SkriptLabAuth?.requireLogin()) return;
  byId('generate-form').addEventListener('submit', generateWorld);
  byId('source-mode').addEventListener('change', sourceModeChanged);
  byId('create-files').addEventListener('click', createFiles);
  byId('file-types').addEventListener('change', syncControls);
  byId('download-zip').addEventListener('click', downloadZip);
  byId('retry').addEventListener('click', () => state.retry?.());
  byId('reset-camera').addEventListener('click', () => state.viewer?.resetView());
  byId('retry-render').addEventListener('click', () => { state.viewer?.destroy(); state.viewer = null; state.viewerPromise = null; state.renderedRevision = null; showWorld(); });
  byId('close-preview').addEventListener('click', () => byId('preview').close());
  byId('entity-list').addEventListener('click', event => { const row = event.target.closest('[data-entity-id]'); if (row) selectEntity(state.world?.entities?.find(entity => entity.id === row.dataset.entityId), true); });
  byId('file-list').addEventListener('click', event => { const button = event.target.closest('[data-action]'); if (button) fileAction(button.dataset.action, button.dataset.fileId); });
  document.querySelectorAll('[data-go-tab]').forEach(button => button.addEventListener('click', () => setTab(button.dataset.goTab, true)));
  document.querySelectorAll('[data-tab]').forEach(button => {
    button.addEventListener('click', () => setTab(button.dataset.tab));
    button.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); setTab(event.key === 'Home' ? 'demo' : event.key === 'End' ? 'files' : state.tab === 'demo' ? 'files' : 'demo', true); });
  });
  window.addEventListener('message', event => {
    if (event.origin !== window.location.origin || event.source !== window.parent) return;
    if (event.data?.type === 'skriptlab:world-studio-project-changed') {
      const next = positiveId(event.data.projectId);
      state.active = event.data.active !== false;
      if (next !== state.projectId) { setTab('demo'); loadProject(next); }
      else { state.viewer?.setActive(state.active && state.tab === 'demo'); if (state.active) refreshSnapshot(); }
    } else if (event.data?.type === 'skriptlab:world-studio-active') {
      state.active = event.data.active === true; state.viewer?.setActive(state.active && state.tab === 'demo');
    }
  });
  window.addEventListener('storage', event => {
    if (event.key === 'skriptlab_auth_token' && !event.newValue) { state.controller?.abort(); state.viewer?.destroy(); window.location.replace('login.html'); }
    if (event.key === 'skriptlab_active_project_id') { const next = positiveId(event.newValue); if (next !== state.projectId) { setTab('demo'); loadProject(next); } }
  });
  window.addEventListener('pagehide', () => { state.controller?.abort(); state.viewer?.destroy(); for (const url of state.urls) URL.revokeObjectURL(url); state.urls.clear(); });
  window.addEventListener('pageshow', event => { if (event.persisted) loadProject(state.projectId); });
  const params = new URLSearchParams(window.location.search);
  let stored = ''; try { stored = localStorage.getItem('skriptlab_active_project_id') || ''; } catch { /* URL works without storage. */ }
  setTab('demo'); loadProject(positiveId(params.has('project') ? params.get('project') : stored));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
