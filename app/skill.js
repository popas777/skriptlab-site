(function () {
  'use strict';

  const ACTIVE_PROJECT_KEY = 'skriptlab_active_project_id';
  const FEATURE_PROMPTS = Object.freeze({
    core_models: 'Mitkä ovat tämän teoksen tärkeimmät ydinmallit?',
    principles: 'Miten skillin periaatteita voi soveltaa käytännössä tähän teokseen?',
    patterns: 'Tarkista teoksen jatkuvuus ja nosta esiin tärkeimmät rakenteelliset kuviot.',
    anti_patterns: 'Mitkä anti-patternit kannattaa tunnistaa ja välttää?',
    glossary: 'Näytä skillin tärkeimmät käsitteet ja niiden selitykset.',
    chapters: 'Kuvaa skillin luvut ja kerro, mitä niistä kannattaa käyttää seuraavaksi.',
  });
  const READY_STATES = new Set(['ready', 'completed', 'complete', 'succeeded']);
  const WORKING_STATES = new Set(['queued', 'pending', 'generating', 'processing', 'running']);

  const elements = {};
  const state = {
    projectId: null,
    projectName: 'Teos',
    response: null,
    messages: [],
    busy: false,
    pollTimer: null,
    requestRevision: 0,
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function collectElements() {
    [
      'skill-notice', 'skill-notice-text', 'skill-notice-action', 'skill-start',
      'skill-project-name', 'skill-generate', 'skill-workspace', 'skill-workspace-name',
      'skill-workspace-lead', 'skill-refresh', 'skill-download', 'skill-stale',
      'skill-messages', 'skill-meta', 'skill-chat-form', 'skill-input', 'skill-send',
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
    return `/api/projects/${encodeURIComponent(state.projectId)}/skill${suffix}`;
  }

  async function jsonRequest(path, options = {}) {
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
      const detail = payload && typeof payload === 'object' ? (payload.detail || payload.message || payload.error) : payload;
      const message = Array.isArray(detail)
        ? detail.map((item) => item?.msg || String(item)).join(' ')
        : (detail || `Pyyntö epäonnistui (${response.status}).`);
      const error = new Error(String(message));
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function jsonBody(payload) {
    return {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    };
  }

  function statusValue(payload) {
    return String(payload?.status || payload?.skill?.status || '').toLowerCase();
  }

  function normalizeSkill(payload) {
    const root = payload?.data && typeof payload.data === 'object' ? payload.data : (payload || {});
    const wrappedSkill = root.skill && typeof root.skill === 'object' ? root.skill : null;
    const manifest = root.manifest || wrappedSkill?.manifest || wrappedSkill || null;
    const status = statusValue(root);
    const name = String(
      root.project_title || root.project?.title || manifest?.project_title || manifest?.title || manifest?.name || localProject()?.title || state.projectName,
    ).replace(/\s+[—-]\s+skill$/i, '').trim() || 'Teos';
    return {
      raw: root,
      status,
      ready: Boolean(root.ready || wrappedSkill?.ready || (manifest && (!status || READY_STATES.has(status))) || READY_STATES.has(status)),
      stale: Boolean(root.stale || wrappedSkill?.stale),
      canChat: root.can_chat !== false && wrappedSkill?.can_chat !== false,
      manifest,
      name,
      updatedAt: root.completed_at || root.updated_at || manifest?.generated_at || manifest?.updated_at || '',
      error: String(root.error || wrappedSkill?.error || ''),
    };
  }

  function showNotice(message = '', tone = 'info', actionLabel = '', action = null) {
    elements['skill-notice'].hidden = !message;
    elements['skill-notice'].classList.toggle('is-error', tone === 'error');
    elements['skill-notice-text'].textContent = message;
    const button = elements['skill-notice-action'];
    button.hidden = !actionLabel;
    button.textContent = actionLabel;
    button.onclick = action;
  }

  function setBusy(busy) {
    state.busy = busy;
    syncControls();
  }

  function syncControls() {
    const hasProject = Boolean(state.projectId);
    const ready = Boolean(state.response?.ready);
    elements['skill-generate'].disabled = state.busy || !hasProject;
    elements['skill-refresh'].disabled = state.busy || !ready;
    elements['skill-download'].disabled = state.busy || !ready || Boolean(state.response?.stale);
    elements['skill-input'].disabled = state.busy || !ready || !state.response?.canChat;
    elements['skill-send'].disabled = state.busy || !ready || !state.response?.canChat;
    document.querySelectorAll('[data-focus]').forEach((button) => {
      button.disabled = state.busy || !ready || !state.response?.canChat;
    });
  }

  function useStartView() {
    elements['skill-start'].hidden = false;
    elements['skill-workspace'].hidden = true;
    elements['skill-project-name'].textContent = state.projectName;
  }

  function artifactCount(value) {
    if (Array.isArray(value)) return value.length;
    if (Array.isArray(value?.items)) return value.items.length;
    if (Array.isArray(value?.entries)) return value.entries.length;
    const count = Number(value?.count || value?.total || 0);
    return Number.isFinite(count) && count > 0 ? count : 0;
  }

  function relativeUpdate(value) {
    const timestamp = Date.parse(value || '');
    if (!Number.isFinite(timestamp)) return 'päivitetty juuri nyt';
    const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
    if (minutes < 2) return 'päivitetty juuri nyt';
    if (minutes < 60) return `päivitetty ${minutes} min sitten`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `päivitetty ${hours} h sitten`;
    return `päivitetty ${new Intl.DateTimeFormat('fi-FI').format(new Date(timestamp))}`;
  }

  function renderMeta() {
    const artifacts = state.response?.manifest?.artifacts || state.response?.manifest || {};
    const chapters = artifactCount(artifacts.chapters);
    const glossary = artifactCount(artifacts.glossary);
    const parts = [];
    if (chapters) parts.push(`${chapters} lukua`);
    if (glossary) parts.push(`${glossary} käsitettä`);
    parts.push(relativeUpdate(state.response?.updatedAt));
    elements['skill-meta'].textContent = parts.join(' · ');
  }

  function appendInlineMarkdown(parent, text) {
    const pattern = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\))/g;
    let cursor = 0;
    for (const match of String(text).matchAll(pattern)) {
      if (match.index > cursor) parent.append(document.createTextNode(text.slice(cursor, match.index)));
      const token = match[0];
      if (token.startsWith('**')) {
        const strong = document.createElement('strong');
        strong.textContent = token.slice(2, -2);
        parent.append(strong);
      } else if (token.startsWith('`')) {
        const code = document.createElement('code');
        code.textContent = token.slice(1, -1);
        parent.append(code);
      } else {
        const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        const href = linkMatch?.[2]?.trim() || '';
        if (linkMatch && /^https?:\/\//i.test(href)) {
          const link = document.createElement('a');
          link.textContent = linkMatch[1];
          link.href = href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          parent.append(link);
        } else {
          parent.append(document.createTextNode(token));
        }
      }
      cursor = match.index + token.length;
    }
    if (cursor < text.length) parent.append(document.createTextNode(text.slice(cursor)));
  }

  function markdownFragment(markdown) {
    const fragment = document.createDocumentFragment();
    const lines = String(markdown || '').replace(/\r/g, '').split('\n');
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) { index += 1; continue; }
      const listMatch = line.match(/^\s*(?:([-*])|(\d+)\.)(?:\s+)(.+)$/);
      if (listMatch) {
        const ordered = Boolean(listMatch[2]);
        const list = document.createElement(ordered ? 'ol' : 'ul');
        while (index < lines.length) {
          const item = lines[index].match(/^\s*(?:([-*])|(\d+)\.)(?:\s+)(.+)$/);
          if (!item || Boolean(item[2]) !== ordered) break;
          const li = document.createElement('li');
          appendInlineMarkdown(li, item[3]);
          list.append(li);
          index += 1;
        }
        fragment.append(list);
        continue;
      }
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        const node = document.createElement(`h${Math.min(heading[1].length + 2, 5)}`);
        appendInlineMarkdown(node, heading[2]);
        fragment.append(node);
        index += 1;
        continue;
      }
      const paragraphLines = [line];
      index += 1;
      while (index < lines.length && lines[index].trim() && !/^\s*(?:[-*]|\d+\.)\s+/.test(lines[index]) && !/^#{1,3}\s+/.test(lines[index])) {
        paragraphLines.push(lines[index]);
        index += 1;
      }
      const paragraph = document.createElement('p');
      appendInlineMarkdown(paragraph, paragraphLines.join('\n'));
      fragment.append(paragraph);
    }
    return fragment;
  }

  function normalizedMessage(raw, fallbackRole = 'assistant') {
    if (typeof raw === 'string') return { role: fallbackRole, content: raw, sources: [] };
    const sources = Array.isArray(raw?.sources) ? raw.sources : [];
    return {
      role: raw?.role === 'user' ? 'user' : fallbackRole,
      content: String(raw?.content || raw?.message || raw?.text || ''),
      sources,
    };
  }

  function renderMessages() {
    const list = elements['skill-messages'];
    list.replaceChildren();
    state.messages.forEach((message) => {
      const article = document.createElement('article');
      article.className = `message ${message.role === 'user' ? 'is-user' : 'is-assistant'}`;
      const body = document.createElement('div');
      body.className = 'message-body';
      const content = document.createElement('div');
      content.className = 'message-content';
      content.append(markdownFragment(message.content));
      body.append(content);
      if (message.sources?.length) {
        const sources = document.createElement('p');
        sources.className = 'message-sources';
        sources.textContent = `Lähteet: ${message.sources.map((source) => source?.title || source?.chapter_id).filter(Boolean).join(', ')}`;
        body.append(sources);
      }
      if (message.role === 'user') {
        article.append(body);
      } else {
        const avatar = document.createElement('span');
        avatar.className = 'message-avatar';
        avatar.setAttribute('aria-hidden', 'true');
        const icon = document.createElement('i');
        icon.className = 'ph ph-book-open-text';
        avatar.append(icon);
        article.append(avatar, body);
      }
      list.append(article);
    });
    window.requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  }

  function showWorkspace(response) {
    state.response = response;
    state.projectName = response.name || state.projectName;
    elements['skill-start'].hidden = true;
    elements['skill-workspace'].hidden = false;
    elements['skill-workspace-name'].textContent = state.projectName;
    elements['skill-stale'].hidden = !response.stale;
    elements['skill-workspace-lead'].textContent = response.stale
      ? 'Skill on käytettävissä, mutta teoksen analyysi on muuttunut.'
      : 'Skill on valmis. Kysy teoksesta tai valitse toiminto.';
    if (!state.messages.length) {
      state.messages.push({
        role: 'assistant',
        content: 'Skill on valmis. Mitä haluat tehdä tämän teoksen tiedolla?',
        sources: [],
      });
    }
    renderMessages();
    renderMeta();
    syncControls();
  }

  function clearPoll() {
    window.clearTimeout(state.pollTimer);
    state.pollTimer = null;
  }

  function schedulePoll() {
    clearPoll();
    state.pollTimer = window.setTimeout(() => loadSkill({ quiet: true }), 1800);
  }

  async function loadSkill(options = {}) {
    const revision = ++state.requestRevision;
    if (!state.projectId) {
      state.projectName = 'Valitse projekti SkriptLabin työtilasta';
      useStartView();
      showNotice('Valitse ensin teos SkriptLabin työtilasta.', 'error');
      syncControls();
      return;
    }
    if (!options.quiet) setBusy(true);
    try {
      const payload = await jsonRequest(endpoint());
      if (revision !== state.requestRevision) return;
      const response = normalizeSkill(payload);
      state.projectName = response.name;
      if (response.ready) {
        clearPoll();
        showWorkspace(response);
        showNotice('');
      } else {
        state.response = response;
        useStartView();
        if (WORKING_STATES.has(response.status)) {
          elements['skill-generate'].querySelector('span').textContent = 'Rakennetaan…';
          showNotice('Skill rakennetaan analyysistä ja käsikirjoituksesta.');
          schedulePoll();
        } else {
          elements['skill-generate'].querySelector('span').textContent = 'Skilliksi';
          showNotice(response.error, response.error ? 'error' : 'info');
        }
      }
    } catch (error) {
      if (revision !== state.requestRevision) return;
      if (error.status === 404) {
        state.response = null;
        useStartView();
        showNotice('');
      } else {
        useStartView();
        showNotice(`Skillin lataaminen epäonnistui: ${error.message}`, 'error', 'Yritä uudelleen', () => loadSkill());
      }
    } finally {
      if (revision === state.requestRevision) setBusy(false);
    }
  }

  async function generateSkill(force) {
    if (!state.projectId || state.busy) return;
    clearPoll();
    setBusy(true);
    elements['skill-generate'].querySelector('span').textContent = 'Rakennetaan…';
    showNotice(force ? 'Skill päivitetään uusimmasta analyysistä…' : 'Skill rakennetaan analyysistä ja käsikirjoituksesta…');
    try {
      const payload = await jsonRequest(endpoint('/generate'), {
        method: 'POST',
        ...jsonBody({ purpose: 'all', model: null, force: Boolean(force) }),
      });
      const response = normalizeSkill(payload);
      state.messages = force ? [] : state.messages;
      if (response.ready) {
        showWorkspace(response);
        showNotice('');
        elements['skill-input'].focus();
      } else {
        state.response = response;
        useStartView();
        schedulePoll();
      }
    } catch (error) {
      showNotice(`Skillin luominen epäonnistui: ${error.message}`, 'error', 'Yritä uudelleen', () => generateSkill(force));
      if (state.response?.ready) showWorkspace(state.response);
      else useStartView();
    } finally {
      elements['skill-generate'].querySelector('span').textContent = 'Skilliksi';
      setBusy(false);
    }
  }

  function setActiveFeature(focus) {
    document.querySelectorAll('[data-focus]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.focus === focus));
    });
  }

  async function sendMessage(message, focus = 'all') {
    const content = String(message || '').trim();
    if (!content || state.busy || !state.response?.ready) return;
    const history = state.messages.slice(-10).map((item) => ({ role: item.role, content: item.content }));
    state.messages.push({ role: 'user', content, sources: [] });
    renderMessages();
    elements['skill-input'].value = '';
    elements['skill-input'].style.height = '';
    setActiveFeature(focus);
    setBusy(true);
    showNotice('Skill vastaa…');
    try {
      const payload = await jsonRequest(endpoint('/chat'), {
        method: 'POST',
        ...jsonBody({ message: content, focus, chapter_id: null, history, model: null }),
      });
      const reply = normalizedMessage(
        payload?.message && typeof payload.message === 'object'
          ? { ...payload.message, sources: payload.sources || payload.message.sources }
          : { message: payload?.message || payload?.answer || payload?.response, sources: payload?.sources },
      );
      if (!reply.content) throw new Error('Palvelin ei palauttanut vastausta.');
      state.messages.push(reply);
      renderMessages();
      showNotice('');
    } catch (error) {
      showNotice(`Vastausta ei saatu: ${error.message}`, 'error');
    } finally {
      setActiveFeature('');
      setBusy(false);
      elements['skill-input'].focus();
    }
  }

  function filenameFromResponse(response) {
    const disposition = response.headers?.get?.('content-disposition') || '';
    const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    const basic = disposition.match(/filename="?([^";]+)"?/i);
    const raw = utf8?.[1] ? decodeURIComponent(utf8[1]) : basic?.[1];
    return String(raw || `${state.projectName || 'teos'}-skill.zip`).replace(/[\\/:*?"<>|]/g, '-');
  }

  async function downloadSkill() {
    if (state.busy || !state.response?.ready) return;
    setBusy(true);
    showNotice('Skill valmistellaan ladattavaksi…');
    try {
      const response = await window.SkriptLabAuth.fetch(endpoint('/download'));
      if (!response.ok) {
        let detail = '';
        try { detail = (await response.json())?.detail || ''; } catch (_error) { /* ei JSON-vastausta */ }
        throw new Error(detail || `Lataus epäonnistui (${response.status}).`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filenameFromResponse(response);
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      showNotice('Skill ladattiin.');
      window.setTimeout(() => showNotice(''), 2200);
    } catch (error) {
      showNotice(`Skillin lataaminen epäonnistui: ${error.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  function resizeInput() {
    const input = elements['skill-input'];
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
  }

  function bindEvents() {
    elements['skill-generate'].addEventListener('click', () => generateSkill(false));
    elements['skill-refresh'].addEventListener('click', () => generateSkill(true));
    elements['skill-download'].addEventListener('click', downloadSkill);
    elements['skill-chat-form'].addEventListener('submit', (event) => {
      event.preventDefault();
      sendMessage(elements['skill-input'].value, 'all');
    });
    elements['skill-input'].addEventListener('input', resizeInput);
    elements['skill-input'].addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        elements['skill-chat-form'].requestSubmit();
      }
    });
    document.querySelectorAll('[data-focus]').forEach((button) => {
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => sendMessage(FEATURE_PROMPTS[button.dataset.focus], button.dataset.focus));
    });
    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'skriptlab:skill-project-changed') return;
      const nextId = Number(event.data.projectId || 0) || null;
      if (nextId === state.projectId) return;
      const url = new URL(window.location.href);
      if (nextId) url.searchParams.set('project', String(nextId));
      else url.searchParams.delete('project');
      window.history.replaceState({}, '', url);
      state.messages = [];
      loadWorkspace();
    });
    window.addEventListener('beforeunload', clearPoll);
  }

  async function loadWorkspace() {
    clearPoll();
    state.projectId = projectIdFromPage();
    state.projectName = String(localProject()?.title || 'Teos');
    elements['skill-project-name'].textContent = state.projectName;
    await loadSkill();
  }

  async function init() {
    collectElements();
    if (!window.SkriptLabAuth?.requireLogin()) return;
    bindEvents();
    await loadWorkspace();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
