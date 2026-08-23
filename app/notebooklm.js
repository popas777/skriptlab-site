(function () {
  'use strict';

  const ACTIVE_PROJECT_KEY = 'skriptlab_active_project_id';
  const READY_STATES = new Set(['ready', 'completed', 'complete', 'succeeded', 'available']);
  const ACTIVE_STATES = new Set(['queued', 'pending', 'started', 'syncing', 'uploading', 'generating', 'processing', 'running', 'in_progress']);
  const ERROR_STATES = new Set(['failed', 'error', 'cancelled', 'canceled']);
  const POLL_DELAY_MS = 5000;

  const FALLBACK_ARTIFACT_TYPES = Object.freeze([
    Object.freeze({ type: 'audio', label: 'Äänikatsaus', description: 'Keskusteleva kuunneltava yhteenveto käsikirjoituksesta.', default_format: 'm4a', download_formats: ['m4a'] }),
    Object.freeze({ type: 'video', label: 'Videoesitys', description: 'Selittävä video käsikirjoituksen keskeisistä aiheista.', default_format: 'mp4', download_formats: ['mp4'] }),
    Object.freeze({ type: 'cinematic', label: 'Elokuvallinen video', description: 'Elokuvallinen tulkinta teoksen tunnelmasta ja sisällöstä.', default_format: 'mp4', download_formats: ['mp4'] }),
    Object.freeze({ type: 'slides', label: 'Diaesitys', description: 'Esityskelpoinen diasarja teoksen pääkohdista.', default_format: 'pdf', download_formats: ['pdf', 'pptx'] }),
    Object.freeze({ type: 'report', label: 'Raportti', description: 'Jäsennelty kirjallinen raportti valitusta näkökulmasta.', default_format: 'md', download_formats: ['md'] }),
    Object.freeze({ type: 'study-guide', label: 'Opinto-opas', description: 'Kysymyksiä ja nostoja teoksen syvälliseen tarkasteluun.', default_format: 'md', download_formats: ['md'] }),
    Object.freeze({ type: 'quiz', label: 'Tietovisa', description: 'Käsikirjoitukseen perustuva kysymyskokonaisuus.', default_format: 'json', download_formats: ['json', 'markdown', 'html'] }),
    Object.freeze({ type: 'flashcards', label: 'Muistikortit', description: 'Keskeiset käsitteet helposti kerrattavina kortteina.', default_format: 'json', download_formats: ['json', 'markdown', 'html'] }),
    Object.freeze({ type: 'mind-map', label: 'Miellekartta', description: 'Visuaalinen rakenne aiheiden ja suhteiden hahmottamiseen.', default_format: 'json', download_formats: ['json'] }),
    Object.freeze({ type: 'infographic', label: 'Infografiikka', description: 'Yhden kuvan tiivistys teoksen tärkeimmistä havainnoista.', default_format: 'png', download_formats: ['png'] }),
    Object.freeze({ type: 'data-table', label: 'Datataulukko', description: 'Ohjeen mukaan koottu rakenteinen taulukko.', default_format: 'csv', download_formats: ['csv'] }),
  ]);

  const STATUS_LABELS = Object.freeze({
    ready: 'Valmis',
    completed: 'Valmis',
    complete: 'Valmis',
    succeeded: 'Valmis',
    available: 'Valmis',
    queued: 'Jonossa',
    pending: 'Odottaa',
    started: 'Käynnistyy',
    syncing: 'Synkronoidaan',
    uploading: 'Siirretään',
    generating: 'Luodaan',
    processing: 'Käsitellään',
    running: 'Käynnissä',
    in_progress: 'Käynnissä',
    failed: 'Epäonnistui',
    error: 'Virhe',
    cancelled: 'Keskeytetty',
    canceled: 'Keskeytetty',
    stale: 'Päivitys tarvitaan',
  });

  const TYPE_MARKS = Object.freeze({
    audio: 'AUDIO',
    video: 'VIDEO',
    cinematic: 'CINE',
    slides: 'SLIDE',
    report: 'DOC',
    'study-guide': 'GUIDE',
    quiz: 'QUIZ',
    flashcards: 'CARD',
    'mind-map': 'MAP',
    infographic: 'INFO',
    'data-table': 'DATA',
  });

  const elements = {};
  const state = {
    projectId: null,
    projectTitle: 'Teos',
    frontendConfigured: false,
    loaded: false,
    loading: false,
    operation: '',
    requestRevision: 0,
    pollTimer: null,
    response: null,
    connection: null,
    notebook: null,
    jobs: [],
    artifacts: [],
    artifactTypes: FALLBACK_ARTIFACT_TYPES.slice(),
    loadError: '',
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function collectElements() {
    [
      'notebooklm-project-name', 'notebooklm-experimental', 'notebooklm-connection-dot',
      'notebooklm-connection-badge', 'notebooklm-connection-message', 'notebooklm-notice',
      'notebooklm-notice-text', 'notebooklm-notice-action', 'notebooklm-overview',
      'notebooklm-notebook-heading', 'notebooklm-notebook-description', 'notebooklm-notebook-status',
      'notebooklm-source-size', 'notebooklm-synced-at', 'notebooklm-open', 'notebooklm-sync',
      'notebooklm-sync-label', 'notebooklm-stale', 'notebooklm-consent-panel',
      'notebooklm-consent', 'notebooklm-artifact-form', 'notebooklm-artifact-fieldset',
      'notebooklm-artifact-types', 'notebooklm-artifact-type-help', 'notebooklm-instructions',
      'notebooklm-create-help', 'notebooklm-generate', 'notebooklm-refresh', 'notebooklm-jobs',
      'notebooklm-jobs-empty', 'notebooklm-artifacts', 'notebooklm-artifacts-empty',
      'notebooklm-artifact-count',
    ].forEach((id) => { elements[id] = byId(id); });
  }

  function projectIdFromPage() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('project') || params.get('project_id') || localStorage.getItem(ACTIVE_PROJECT_KEY) || '';
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  function localProject() {
    try {
      const project = JSON.parse(localStorage.getItem('skriptlab_manuscript') || 'null');
      if (!project || typeof project !== 'object') return null;
      if (state.projectId && project.id && Number(project.id) !== state.projectId) return null;
      return project;
    } catch (_error) {
      return null;
    }
  }

  function endpoint(suffix = '') {
    return `/api/projects/${encodeURIComponent(state.projectId)}/notebooklm${suffix}`;
  }

  function jsonBody(payload) {
    return {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    };
  }

  async function jsonRequest(path, options = {}) {
    if (!state.frontendConfigured) {
      const error = new Error('Sovelluksen API-osoite puuttuu.');
      error.code = 'frontend_config_missing';
      throw error;
    }
    const response = await window.SkriptLabAuth.fetch(path, options);
    const contentType = response.headers?.get?.('content-type') || '';
    let payload = null;
    if (response.status !== 204) {
      try {
        payload = contentType.includes('json') ? await response.json() : await response.text();
      } catch (_error) {
        payload = null;
      }
    }
    if (!response.ok) {
      const detail = payload && typeof payload === 'object'
        ? (payload.detail || payload.message || payload.error)
        : payload;
      const message = Array.isArray(detail)
        ? detail.map((item) => item?.msg || String(item)).join(' ')
        : (detail || `Pyyntö epäonnistui (${response.status}).`);
      const error = new Error(String(message));
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function safeToken(value) {
    const token = String(value || '').toLowerCase().trim();
    return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(token) ? token : '';
  }

  function uniqueFormats(values, fallback) {
    const formats = (Array.isArray(values) ? values : [])
      .map(safeToken)
      .filter(Boolean);
    const normalizedFallback = safeToken(fallback);
    if (!formats.length && normalizedFallback) formats.push(normalizedFallback);
    return Array.from(new Set(formats));
  }

  function normalizeArtifactTypes(rawTypes) {
    const serverTypes = new Map();
    (Array.isArray(rawTypes) ? rawTypes : []).forEach((raw) => {
      const type = safeToken(raw?.type);
      if (type) serverTypes.set(type, raw);
    });
    return FALLBACK_ARTIFACT_TYPES.map((fallback) => {
      const raw = serverTypes.get(fallback.type) || {};
      const defaultFormat = safeToken(raw.default_format) || fallback.default_format;
      return {
        type: fallback.type,
        label: String(raw.label || fallback.label),
        description: String(raw.description || fallback.description),
        default_format: defaultFormat,
        download_formats: uniqueFormats(raw.download_formats || raw.formats || fallback.download_formats, defaultFormat || fallback.default_format),
      };
    });
  }

  function normalizeResponse(payload) {
    const root = payload?.data && typeof payload.data === 'object' ? payload.data : (payload || {});
    const project = root.project && typeof root.project === 'object' ? root.project : {};
    const connection = root.connection && typeof root.connection === 'object' ? root.connection : {};
    return {
      raw: root,
      connection: {
        configured: Boolean(connection.configured),
        authenticated: Boolean(connection.authenticated),
        experimental: Boolean(connection.experimental),
        message: String(connection.message || ''),
      },
      project: {
        id: Number(project.id || state.projectId) || state.projectId,
        title: String(project.title || localProject()?.title || state.projectTitle || 'Teos'),
      },
      notebook: root.notebook && typeof root.notebook === 'object' ? root.notebook : null,
      jobs: Array.isArray(root.jobs) ? root.jobs : [],
      artifacts: Array.isArray(root.artifacts) ? root.artifacts : [],
      artifactTypes: normalizeArtifactTypes(root.artifact_types),
    };
  }

  function statusOf(item) {
    return String(item?.status || item?.state || '').toLowerCase().trim();
  }

  function statusLabel(value, fallback = 'Ei aloitettu') {
    const status = String(value || '').toLowerCase().trim();
    return STATUS_LABELS[status] || (status ? status.replace(/[_-]+/g, ' ') : fallback);
  }

  function isActive(item) {
    return ACTIVE_STATES.has(statusOf(item));
  }

  function isReady(item) {
    const status = statusOf(item);
    return READY_STATES.has(status) || (!status && Boolean(item));
  }

  function isError(item) {
    return ERROR_STATES.has(statusOf(item)) || Boolean(item?.error && !isActive(item));
  }

  function isSyncJob(job) {
    const kind = String(job?.kind || job?.job_type || job?.type || '').toLowerCase();
    return kind.includes('sync') || kind.includes('source') || (!job?.artifact_type && !job?.artifactType && kind === 'notebook');
  }

  function hasActiveJobs() {
    return state.jobs.some(isActive) || isActive(state.notebook);
  }

  function connectionReady() {
    return Boolean(state.frontendConfigured && state.connection?.configured && state.connection?.authenticated);
  }

  function safeExternalUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'https:' && url.hostname === 'notebooklm.google.com' ? url.href : '';
    } catch (_error) {
      return '';
    }
  }

  function formatDateTime(value) {
    const timestamp = Date.parse(value || '');
    if (!Number.isFinite(timestamp)) return '—';
    return new Intl.DateTimeFormat('fi-FI', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(timestamp));
  }

  function formatCharacterCount(value) {
    const count = Number(value);
    if (!Number.isFinite(count) || count < 0) return '—';
    return `${new Intl.NumberFormat('fi-FI').format(count)} merkkiä`;
  }

  function showNotice(message = '', tone = 'info', actionLabel = '', action = null) {
    const notice = elements['notebooklm-notice'];
    notice.hidden = !message;
    notice.className = `module-notice${tone ? ` is-${tone}` : ''}`;
    notice.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    elements['notebooklm-notice-text'].textContent = String(message || '');
    const button = elements['notebooklm-notice-action'];
    button.hidden = !actionLabel;
    button.textContent = actionLabel || 'Yritä uudelleen';
    button.onclick = typeof action === 'function' ? action : null;
  }

  function flashNotice(message, tone = 'success') {
    showNotice(message, tone);
    window.setTimeout(() => {
      if (elements['notebooklm-notice-text'].textContent === message) showNotice('');
    }, 3200);
  }

  function renderConnection() {
    const summary = elements['notebooklm-connection-badge'].closest('.connection-summary');
    summary.classList.remove('is-ready', 'is-warning', 'is-error');
    elements['notebooklm-experimental'].hidden = !state.connection?.experimental;

    if (!state.frontendConfigured) {
      summary.classList.add('is-error');
      elements['notebooklm-connection-badge'].textContent = 'API-asetukset puuttuvat';
      elements['notebooklm-connection-message'].textContent = 'Tarkista SkriptLabin config.js.';
      return;
    }
    if (!state.projectId) {
      elements['notebooklm-connection-badge'].textContent = 'Odottaa projektia';
      elements['notebooklm-connection-message'].textContent = 'Valitse käsiteltävä teos työtilasta.';
      return;
    }
    if (!state.loaded) {
      elements['notebooklm-connection-badge'].textContent = 'Tarkistetaan…';
      elements['notebooklm-connection-message'].textContent = 'Luetaan palvelun asetuksia.';
      return;
    }
    if (state.loadError) {
      summary.classList.add('is-error');
      elements['notebooklm-connection-badge'].textContent = 'Yhteysvirhe';
      elements['notebooklm-connection-message'].textContent = 'NotebookLM-tilaa ei saatu palvelimelta.';
      return;
    }
    if (!state.connection?.configured) {
      summary.classList.add('is-error');
      elements['notebooklm-connection-badge'].textContent = 'Ei määritetty';
      elements['notebooklm-connection-message'].textContent = state.connection?.message || 'NotebookLM-yhteyden asetukset puuttuvat.';
      return;
    }
    if (!state.connection?.authenticated) {
      summary.classList.add('is-warning');
      elements['notebooklm-connection-badge'].textContent = 'Kirjautuminen puuttuu';
      elements['notebooklm-connection-message'].textContent = state.connection?.message || 'NotebookLM-istunto pitää uusia palvelimella.';
      return;
    }
    summary.classList.add('is-ready');
    elements['notebooklm-connection-badge'].textContent = 'Yhdistetty';
    elements['notebooklm-connection-message'].textContent = state.connection?.message || 'NotebookLM on valmis käsittelemään aineistoa.';
  }

  function overviewState() {
    if (!state.projectId) return 'empty';
    if (state.loadError) return 'error';
    if (!connectionReady()) return 'error';
    if (state.notebook?.stale) return 'stale';
    if (isError(state.notebook)) return 'error';
    if (isActive(state.notebook) || state.jobs.some(isActive)) return 'working';
    if (state.notebook) return 'ready';
    return 'empty';
  }

  function renderOverview() {
    const overview = elements['notebooklm-overview'];
    const notebook = state.notebook;
    const currentState = overviewState();
    overview.dataset.state = currentState;
    elements['notebooklm-project-name'].textContent = state.projectId
      ? state.projectTitle
      : 'Ei valittua teosta';

    if (!state.projectId) {
      elements['notebooklm-notebook-heading'].textContent = 'Valitse ensin käsikirjoitus';
      elements['notebooklm-notebook-description'].textContent = 'NotebookLM-artifactit liitetään aina yhteen SkriptLab-projektiin.';
    } else if (state.loadError) {
      elements['notebooklm-notebook-heading'].textContent = 'NotebookLM-tietoja ei saatu ladattua';
      elements['notebooklm-notebook-description'].textContent = 'Yhteys SkriptLabin palvelimeen katkesi. Yritä hetken kuluttua uudelleen.';
    } else if (!state.frontendConfigured || (state.loaded && !state.connection?.configured)) {
      elements['notebooklm-notebook-heading'].textContent = 'NotebookLM ei ole vielä käytettävissä';
      elements['notebooklm-notebook-description'].textContent = 'Palveluyhteyden asetukset puuttuvat. Ota yhteys SkriptLabin ylläpitoon.';
    } else if (state.loaded && !state.connection?.authenticated) {
      elements['notebooklm-notebook-heading'].textContent = 'NotebookLM-yhteys pitää uusia';
      elements['notebooklm-notebook-description'].textContent = 'Palvelimen NotebookLM-istunto ei ole tällä hetkellä voimassa.';
    } else if (!state.loaded || state.loading) {
      elements['notebooklm-notebook-heading'].textContent = 'Valmistellaan työtilaa';
      elements['notebooklm-notebook-description'].textContent = 'Tarkistamme, onko aktiivinen käsikirjoitus jo yhdistetty NotebookLM:ään.';
    } else if (!notebook) {
      elements['notebooklm-notebook-heading'].textContent = 'Luo käsikirjoitukselle notebook';
      elements['notebooklm-notebook-description'].textContent = 'Ensimmäinen synkronointi luo NotebookLM-notebookin ja lisää käsikirjoituksen sen lähteeksi.';
    } else if (notebook.stale) {
      elements['notebooklm-notebook-heading'].textContent = String(notebook.title || state.projectTitle);
      elements['notebooklm-notebook-description'].textContent = 'Notebook on käytettävissä, mutta sen lähde ei vastaa käsikirjoituksen uusinta versiota.';
    } else if (isActive(notebook)) {
      elements['notebooklm-notebook-heading'].textContent = String(notebook.title || state.projectTitle);
      elements['notebooklm-notebook-description'].textContent = 'Käsikirjoitusta siirretään ja valmistellaan NotebookLM:ssä. Voit jättää tämän näkymän auki.';
    } else if (isError(notebook)) {
      elements['notebooklm-notebook-heading'].textContent = String(notebook.title || state.projectTitle);
      elements['notebooklm-notebook-description'].textContent = String(notebook.error || 'Notebookin käsittelyssä tapahtui virhe. Yritä synkronointia uudelleen.');
    } else {
      elements['notebooklm-notebook-heading'].textContent = String(notebook.title || state.projectTitle);
      elements['notebooklm-notebook-description'].textContent = 'Käsikirjoitus on NotebookLM:n käytettävissä. Voit luoda siitä uusia artifacteja.';
    }

    elements['notebooklm-notebook-status'].textContent = notebook?.stale
      ? STATUS_LABELS.stale
      : statusLabel(notebook?.status, notebook ? 'Valmis' : 'Ei luotu');
    elements['notebooklm-source-size'].textContent = formatCharacterCount(notebook?.source_char_count);
    elements['notebooklm-synced-at'].textContent = formatDateTime(notebook?.synced_at);
    elements['notebooklm-stale'].hidden = !Boolean(notebook?.stale);

    const externalUrl = safeExternalUrl(notebook?.web_url);
    elements['notebooklm-open'].hidden = !externalUrl;
    if (externalUrl) elements['notebooklm-open'].href = externalUrl;
    else elements['notebooklm-open'].removeAttribute('href');

    const firstSync = !notebook;
    elements['notebooklm-consent-panel'].hidden = !state.projectId || !firstSync;
  }

  function selectedArtifactType() {
    return document.querySelector('input[name="notebooklm-artifact-type"]:checked')?.value || '';
  }

  function artifactType(type) {
    return state.artifactTypes.find((item) => item.type === type)
      || FALLBACK_ARTIFACT_TYPES.find((item) => item.type === type)
      || { type, label: type || 'Artifact', description: '', default_format: '', download_formats: [] };
  }

  function renderArtifactTypes() {
    const container = elements['notebooklm-artifact-types'];
    const signature = JSON.stringify(state.artifactTypes);
    if (container.dataset.catalogSignature === signature && container.childElementCount) return;
    const selected = selectedArtifactType() || state.artifactTypes[0]?.type || '';
    container.replaceChildren();
    state.artifactTypes.forEach((item, index) => {
      const label = document.createElement('label');
      label.className = 'artifact-type-option';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'notebooklm-artifact-type';
      input.value = item.type;
      input.checked = item.type === selected || (!selected && index === 0);
      input.addEventListener('change', () => {
        elements['notebooklm-artifact-type-help'].textContent = `${item.label}: ${item.description}`;
        syncControls();
      });
      const title = document.createElement('strong');
      title.textContent = item.label;
      const description = document.createElement('small');
      description.textContent = item.description;
      const formats = document.createElement('small');
      formats.className = 'artifact-format-hint';
      formats.textContent = item.download_formats.map((format) => format.toUpperCase()).join(' / ');
      label.append(input, title, description, formats);
      container.append(label);
    });
    container.dataset.catalogSignature = signature;
    const current = artifactType(selectedArtifactType());
    elements['notebooklm-artifact-type-help'].textContent = current.description
      ? `${current.label}: ${current.description}`
      : 'Valitse käsikirjoituksesta luotava aineisto.';
  }

  function progressValue(job) {
    const raw = Number(job?.progress_percent ?? job?.progress ?? job?.percent);
    if (!Number.isFinite(raw) || raw < 0) return null;
    const percent = raw > 0 && raw <= 1 ? raw * 100 : raw;
    return Math.max(0, Math.min(100, Math.round(percent)));
  }

  function jobTitle(job) {
    const type = safeToken(job?.artifact_type || job?.artifactType);
    if (type) return artifactType(type).label;
    if (isSyncJob(job)) return 'Käsikirjoituksen synkronointi';
    return String(job?.title || job?.name || 'NotebookLM-työ');
  }

  function jobDetail(job) {
    if (job?.error) return String(job.error);
    const created = formatDateTime(job?.created_at || job?.started_at || job?.updated_at);
    return created === '—' ? 'NotebookLM käsittelee pyyntöä.' : `Käynnistetty ${created}`;
  }

  function renderJobs() {
    const list = elements['notebooklm-jobs'];
    list.replaceChildren();
    const jobs = state.jobs.slice(0, 12);
    jobs.forEach((job) => {
      const article = document.createElement('article');
      article.className = 'job-card';
      const active = isActive(job);
      const failed = isError(job);
      article.classList.toggle('is-active', active);
      article.classList.toggle('is-error', failed);

      const symbol = document.createElement('span');
      symbol.className = 'job-symbol';
      symbol.setAttribute('aria-hidden', 'true');
      symbol.textContent = isSyncJob(job) ? 'SYNC' : (TYPE_MARKS[safeToken(job?.artifact_type || job?.artifactType)] || 'JOB');

      const copy = document.createElement('div');
      copy.className = 'job-copy';
      const title = document.createElement('strong');
      title.textContent = jobTitle(job);
      const detail = document.createElement('small');
      detail.textContent = jobDetail(job);
      copy.append(title, detail);

      const status = document.createElement('span');
      status.className = 'job-status';
      status.textContent = statusLabel(statusOf(job), active ? 'Käynnissä' : 'Valmis');
      article.append(symbol, copy, status);

      if (active) {
        const progress = document.createElement('span');
        progress.className = 'job-progress';
        progress.setAttribute('role', 'progressbar');
        progress.setAttribute('aria-label', `${jobTitle(job)} – eteneminen`);
        progress.setAttribute('aria-valuemin', '0');
        progress.setAttribute('aria-valuemax', '100');
        const bar = document.createElement('span');
        const value = progressValue(job);
        if (value === null) {
          progress.classList.add('is-indeterminate');
        } else {
          progress.setAttribute('aria-valuenow', String(value));
          bar.style.width = `${value}%`;
        }
        progress.append(bar);
        article.append(progress);
      }
      list.append(article);
    });
    elements['notebooklm-jobs-empty'].hidden = jobs.length > 0;
    list.setAttribute('aria-busy', String(state.loading || state.jobs.some(isActive)));
  }

  function artifactDownloadFormats(artifact, type) {
    const spec = artifactType(type);
    const direct = artifact?.download_formats || artifact?.formats;
    const format = safeToken(artifact?.format || artifact?.output_format);
    return uniqueFormats(direct || spec.download_formats, format || spec.default_format)
      .filter((value) => spec.download_formats.includes(value) || (!spec.download_formats.length && value));
  }

  function artifactTitle(artifact, spec) {
    return String(artifact?.title || artifact?.name || `${spec.label} · ${state.projectTitle}`);
  }

  function renderArtifacts() {
    const list = elements['notebooklm-artifacts'];
    list.replaceChildren();
    const artifacts = state.artifacts.filter((artifact) => isReady(artifact));
    artifacts.forEach((artifact) => {
      const type = safeToken(artifact?.artifact_type || artifact?.type);
      const spec = artifactType(type);
      const article = document.createElement('article');
      article.className = 'artifact-card';

      const symbol = document.createElement('span');
      symbol.className = 'artifact-symbol';
      symbol.setAttribute('aria-hidden', 'true');
      symbol.textContent = TYPE_MARKS[type] || 'FILE';

      const copy = document.createElement('div');
      copy.className = 'artifact-copy';
      const title = document.createElement('strong');
      title.textContent = artifactTitle(artifact, spec);
      const kind = document.createElement('span');
      kind.textContent = spec.label;
      const meta = document.createElement('small');
      const createdAt = formatDateTime(artifact?.completed_at || artifact?.created_at || artifact?.updated_at);
      meta.textContent = createdAt === '—' ? 'Valmis ladattavaksi' : `Valmis · ${createdAt}`;
      copy.append(title, kind, meta);

      const actions = document.createElement('div');
      actions.className = 'download-actions';
      const artifactId = String(artifact?.id || artifact?.artifact_id || '');
      artifactDownloadFormats(artifact, type).forEach((format) => {
        const button = document.createElement('button');
        button.className = 'download-action';
        button.type = 'button';
        button.textContent = `Lataa ${format.toUpperCase()}`;
        button.disabled = !artifactId || Boolean(state.operation);
        button.addEventListener('click', () => downloadArtifact(artifact, type, format));
        actions.append(button);
      });
      if (!actions.childElementCount) {
        const unavailable = document.createElement('span');
        unavailable.className = 'job-status';
        unavailable.textContent = 'Ei ladattavaa tiedostoa';
        actions.append(unavailable);
      }
      article.append(symbol, copy, actions);
      list.append(article);
    });
    const count = artifacts.length;
    elements['notebooklm-artifact-count'].textContent = count === 1 ? '1 artifact' : `${count} artifactia`;
    elements['notebooklm-artifacts-empty'].hidden = count > 0;
    list.setAttribute('aria-busy', String(state.loading));
  }

  function canGenerateArtifact() {
    return Boolean(
      state.projectId
      && connectionReady()
      && state.notebook
      && isReady(state.notebook)
      && !state.notebook.stale
      && !state.operation
      && selectedArtifactType()
    );
  }

  function syncControls() {
    const firstSync = !state.notebook;
    const consentGiven = elements['notebooklm-consent'].checked;
    const activeSync = state.jobs.some((job) => isActive(job) && isSyncJob(job)) || isActive(state.notebook);
    const canSync = Boolean(
      state.projectId
      && connectionReady()
      && !state.operation
      && !state.loading
      && !activeSync
      && (!firstSync || consentGiven)
    );
    elements['notebooklm-sync'].disabled = !canSync;
    elements['notebooklm-sync'].classList.toggle('is-working', state.operation === 'sync' || activeSync);
    elements['notebooklm-sync-label'].textContent = state.operation === 'sync' || activeSync
      ? 'Synkronoidaan…'
      : (state.notebook?.stale ? 'Päivitä käsikirjoitus' : (state.notebook ? 'Synkronoi uudelleen' : 'Luo ja synkronoi'));
    elements['notebooklm-consent'].disabled = Boolean(state.operation) || !connectionReady();

    const canGenerate = canGenerateArtifact();
    elements['notebooklm-artifact-fieldset'].disabled = !canGenerate;
    elements['notebooklm-instructions'].disabled = !canGenerate;
    elements['notebooklm-generate'].disabled = !canGenerate;
    if (!state.projectId) {
      elements['notebooklm-create-help'].textContent = 'Valitse ensin käsiteltävä teos.';
    } else if (!connectionReady()) {
      elements['notebooklm-create-help'].textContent = 'NotebookLM-yhteys ei ole käytettävissä.';
    } else if (!state.notebook) {
      elements['notebooklm-create-help'].textContent = 'Synkronoi käsikirjoitus ensin.';
    } else if (state.notebook.stale) {
      elements['notebooklm-create-help'].textContent = 'Päivitä käsikirjoitus ennen uuden artifactin luomista.';
    } else if (isActive(state.notebook)) {
      elements['notebooklm-create-help'].textContent = 'Odota, että synkronointi valmistuu.';
    } else {
      elements['notebooklm-create-help'].textContent = 'Luontikieli on suomi. Työ jatkuu taustalla.';
    }
    elements['notebooklm-refresh'].disabled = !state.projectId || !state.frontendConfigured || Boolean(state.operation) || state.loading;
    elements['notebooklm-refresh'].classList.toggle('is-working', state.loading);
    document.querySelectorAll('.download-action').forEach((button) => {
      button.disabled = Boolean(state.operation);
    });
  }

  function render() {
    renderConnection();
    renderOverview();
    renderArtifactTypes();
    renderJobs();
    renderArtifacts();
    syncControls();
  }

  function clearPoll() {
    window.clearTimeout(state.pollTimer);
    state.pollTimer = null;
  }

  function schedulePoll() {
    clearPoll();
    if (!hasActiveJobs() || !state.projectId) return;
    state.pollTimer = window.setTimeout(() => loadNotebook({ quiet: true, includeRemote: false }), POLL_DELAY_MS);
  }

  function applyResponse(payload) {
    const normalized = normalizeResponse(payload);
    state.response = normalized.raw;
    state.connection = normalized.connection;
    state.notebook = normalized.notebook;
    state.jobs = normalized.jobs;
    state.artifacts = normalized.artifacts;
    state.artifactTypes = normalized.artifactTypes;
    state.projectTitle = normalized.project.title;
    state.loaded = true;
    state.loadError = '';
  }

  async function loadNotebook(options = {}) {
    clearPoll();
    const revision = ++state.requestRevision;
    const includeRemote = options.includeRemote !== false;
    if (!state.projectId) {
      state.loaded = false;
      state.loading = false;
      state.connection = null;
      state.notebook = null;
      state.jobs = [];
      state.artifacts = [];
      render();
      showNotice('Valitse ensin käsikirjoitus SkriptLabin työtilasta.', 'warning');
      return;
    }
    if (!state.frontendConfigured) {
      state.loaded = true;
      state.loading = false;
      state.connection = { configured: false, authenticated: false, experimental: false, message: 'Sovelluksen API-osoite puuttuu.' };
      render();
      showNotice('NotebookLM-moduulin API-asetukset puuttuvat. Tarkista config.js.', 'error');
      return;
    }
    state.loadError = '';
    state.loading = true;
    if (!options.quiet) showNotice('Ladataan NotebookLM-työtilaa…', 'loading');
    render();
    try {
      const payload = await jsonRequest(endpoint(`?include_remote=${includeRemote ? 'true' : 'false'}`));
      if (revision !== state.requestRevision) return;
      applyResponse(payload);
      if (!options.quiet) {
        if (!state.connection.configured) {
          showNotice(state.connection.message || 'NotebookLM-yhteyttä ei ole määritetty.', 'error');
        } else if (!state.connection.authenticated) {
          showNotice(state.connection.message || 'NotebookLM-kirjautuminen ei ole voimassa.', 'warning');
        } else if (state.notebook?.error) {
          showNotice(`Notebookin käsittely epäonnistui: ${state.notebook.error}`, 'error', 'Yritä uudelleen', syncNotebook);
        } else {
          showNotice('');
        }
      }
    } catch (error) {
      if (revision !== state.requestRevision) return;
      state.loaded = true;
      state.loadError = String(error.message || 'Tuntematon yhteysvirhe');
      showNotice(`NotebookLM-työtilaa ei saatu ladattua: ${error.message}`, 'error', 'Yritä uudelleen', () => loadNotebook());
    } finally {
      if (revision === state.requestRevision) {
        state.loading = false;
        render();
        schedulePoll();
      }
    }
  }

  async function syncNotebook() {
    if (!state.projectId || state.operation || !connectionReady()) return;
    if (!state.notebook && !elements['notebooklm-consent'].checked) {
      showNotice('Hyväksy käsikirjoituksen lähettäminen NotebookLM:ään ennen ensimmäistä synkronointia.', 'warning');
      elements['notebooklm-consent'].focus();
      return;
    }
    clearPoll();
    state.operation = 'sync';
    syncControls();
    showNotice('Käsikirjoituksen synkronointi käynnistetään…', 'loading');
    try {
      await jsonRequest(endpoint('/sync'), {
        method: 'POST',
        ...jsonBody({ confirmed_external_processing: true }),
      });
      await loadNotebook({ quiet: true, includeRemote: true });
      flashNotice('Synkronointi käynnistyi. NotebookLM käsittelee käsikirjoitusta taustalla.');
    } catch (error) {
      showNotice(`Synkronointi epäonnistui: ${error.message}`, 'error', 'Yritä uudelleen', syncNotebook);
    } finally {
      state.operation = '';
      render();
      schedulePoll();
    }
  }

  async function createArtifact(event) {
    event?.preventDefault();
    if (!canGenerateArtifact()) return;
    const artifactTypeValue = selectedArtifactType();
    const instructions = String(elements['notebooklm-instructions'].value || '').trim();
    clearPoll();
    state.operation = 'generate';
    syncControls();
    showNotice(`${artifactType(artifactTypeValue).label} lähetetään luotavaksi…`, 'loading');
    try {
      await jsonRequest(endpoint('/artifacts'), {
        method: 'POST',
        ...jsonBody({
          artifact_type: artifactTypeValue,
          language: 'fi',
          instructions,
          options: {},
        }),
      });
      elements['notebooklm-instructions'].value = '';
      await loadNotebook({ quiet: true, includeRemote: true });
      flashNotice(`${artifactType(artifactTypeValue).label} on lisätty työjonoon.`);
    } catch (error) {
      showNotice(`Artifactin luominen epäonnistui: ${error.message}`, 'error');
    } finally {
      state.operation = '';
      render();
      schedulePoll();
    }
  }

  function filenameFromResponse(response, artifact, type, format) {
    const disposition = response.headers?.get?.('content-disposition') || '';
    const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    const basic = disposition.match(/filename="?([^";]+)"?/i);
    let serverName = '';
    try {
      serverName = utf8?.[1] ? decodeURIComponent(utf8[1]) : (basic?.[1] || '');
    } catch (_error) {
      serverName = basic?.[1] || '';
    }
    const fallbackBase = artifactTitle(artifact, artifactType(type)) || `${state.projectTitle}-${type}`;
    const raw = serverName || `${fallbackBase}.${format}`;
    return String(raw).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').slice(0, 180) || `notebooklm-artifact.${format}`;
  }

  async function downloadArtifact(artifact, type, format) {
    const artifactId = String(artifact?.id || artifact?.artifact_id || '');
    const safeType = safeToken(type);
    const safeFormat = safeToken(format);
    if (!artifactId || !safeType || !safeFormat || state.operation) return;
    state.operation = 'download';
    syncControls();
    showNotice(`${artifactType(safeType).label} valmistellaan ladattavaksi…`, 'loading');
    try {
      const params = new URLSearchParams();
      params.set('type', safeType);
      params.set('format', safeFormat);
      const response = await window.SkriptLabAuth.fetch(
        `${endpoint(`/artifacts/${encodeURIComponent(artifactId)}/download`)}?${params.toString()}`,
      );
      if (!response.ok) {
        let detail = '';
        try {
          const payload = await response.json();
          detail = payload?.detail || payload?.message || '';
        } catch (_error) {
          detail = '';
        }
        throw new Error(detail || `Lataus epäonnistui (${response.status}).`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filenameFromResponse(response, artifact, safeType, safeFormat);
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      flashNotice(`${artifactType(safeType).label} ladattiin (${safeFormat.toUpperCase()}).`);
    } catch (error) {
      showNotice(`Artifactin lataaminen epäonnistui: ${error.message}`, 'error');
    } finally {
      state.operation = '';
      syncControls();
    }
  }

  function resetProjectState() {
    clearPoll();
    state.requestRevision += 1;
    state.loaded = false;
    state.loading = false;
    state.operation = '';
    state.response = null;
    state.connection = null;
    state.notebook = null;
    state.jobs = [];
    state.artifacts = [];
    state.artifactTypes = FALLBACK_ARTIFACT_TYPES.slice();
    state.loadError = '';
    elements['notebooklm-artifact-types'].removeAttribute('data-catalog-signature');
    elements['notebooklm-consent'].checked = false;
    elements['notebooklm-instructions'].value = '';
  }

  async function loadWorkspace() {
    resetProjectState();
    state.projectId = projectIdFromPage();
    state.projectTitle = String(localProject()?.title || 'Teos');
    render();
    await loadNotebook({ includeRemote: true });
  }

  function bindEvents() {
    elements['notebooklm-consent'].addEventListener('change', syncControls);
    elements['notebooklm-sync'].addEventListener('click', syncNotebook);
    elements['notebooklm-artifact-form'].addEventListener('submit', createArtifact);
    elements['notebooklm-refresh'].addEventListener('click', () => loadNotebook({ includeRemote: true }));
    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'skriptlab:notebooklm-project-changed') return;
      const nextId = Number(event.data.projectId || 0) || null;
      if (nextId === state.projectId) {
        loadNotebook({ includeRemote: true });
        return;
      }
      const url = new URL(window.location.href);
      if (nextId) url.searchParams.set('project', String(nextId));
      else url.searchParams.delete('project');
      window.history.replaceState({}, '', url);
      loadWorkspace();
    });
    window.addEventListener('beforeunload', clearPoll);
  }

  async function init() {
    collectElements();
    state.frontendConfigured = Boolean(window.SKRIPTLAB_CONFIG?.API_BASE_URL);
    renderArtifactTypes();
    if (!window.SkriptLabAuth?.requireLogin) {
      state.loaded = true;
      render();
      showNotice('SkriptLabin autentikointia ei voitu alustaa.', 'error');
      return;
    }
    if (!window.SkriptLabAuth.requireLogin()) return;
    bindEvents();
    await loadWorkspace();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
