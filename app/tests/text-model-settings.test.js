const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.join(__dirname, '..');
const componentSource = fs.readFileSync(path.join(appRoot, 'text-model-settings.js'), 'utf8');

const catalog = [
  {
    provider: 'gemini',
    model_name: 'gemini-3.5-flash-lite',
    display_name: 'Gemini 3.5 Flash-Lite',
    model_tier: 'flash',
    is_default: false,
    is_demanding_default: false,
  },
  {
    provider: 'gemini',
    model_name: 'gemini-3.8-flash',
    display_name: 'Gemini 3.8 Flash',
    model_tier: 'flash',
    is_default: true,
    is_demanding_default: true,
  },
  ...[
    ['gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview', 'pro'],
  ].map(([model_name, display_name, model_tier]) => ({
    provider: 'gemini', model_name, display_name, model_tier, is_default: false,
  })),
  {
    provider: '',
    model_name: 'missing-provider',
    display_name: 'Virheellinen katalogirivi',
  },
];

class FakeElement {
  constructor(tagName, document) {
    this.tagName = String(tagName || '').toUpperCase();
    this.ownerDocument = document;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.open = false;
    this.parentNode = null;
    this._id = '';
  }

  get id() {
    return this._id;
  }

  set id(value) {
    this._id = String(value || '');
    if (this._id) this.ownerDocument.elements.set(this._id, this);
  }

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
  }

  getAttribute(name) {
    return this.attributes.has(String(name)) ? this.attributes.get(String(name)) : null;
  }

  removeAttribute(name) {
    this.attributes.delete(String(name));
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parentNode = this;
      this.children.push(node);
    }
  }

  appendChild(node) {
    this.append(node);
    return node;
  }

  replaceChildren(...nodes) {
    this.children.forEach((node) => { node.parentNode = null; });
    this.children = [];
    this.append(...nodes);
    if (this.tagName === 'SELECT' && !nodes.some((node) => node.value === this.value)) {
      this.value = nodes[0]?.value || '';
    }
  }

  querySelector(selector) {
    const attribute = /^\[([^\]]+)\]$/.exec(selector);
    if (!attribute) return null;
    return this.find((node) => node.attributes.has(attribute[1]));
  }

  find(predicate) {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const nested = child.find(predicate);
      if (nested) return nested;
    }
    return null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, init = {}) {
    const event = Object.assign({ type, target: this }, init);
    for (const listener of this.listeners.get(type) || []) listener(event);
  }

  click() {
    this.dispatch('click');
  }

  showModal() {
    this.open = true;
  }

  close() {
    this.open = false;
    this.dispatch('close');
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }
}

function createHarness(options = {}) {
  const elements = new Map();
  const document = {
    elements,
    activeElement: null,
    createElement(tagName) {
      return new FakeElement(tagName, document);
    },
    getElementById(id) {
      return elements.get(String(id)) || null;
    },
  };
  document.body = document.createElement('body');

  const triggerId = options.triggerId || 'model-settings';
  let trigger = null;
  if (options.includeTrigger !== false) {
    trigger = document.createElement('button');
    trigger.id = triggerId;
    const current = document.createElement('span');
    current.setAttribute('data-text-model-current', '');
    current.textContent = 'Malli: automaattinen';
    trigger.append(current);
    document.body.append(trigger);
  }

  const storage = new Map(Object.entries(options.storage || {}));
  const localStorage = {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(String(key), String(value));
    },
    removeItem(key) {
      storage.delete(String(key));
    },
  };

  const fetchCalls = [];
  const windowListeners = new Map();
  const sandbox = {
    document,
    localStorage,
    AbortController,
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame(callback) {
      callback();
    },
    addEventListener(type, listener) {
      const listeners = windowListeners.get(type) || [];
      listeners.push(listener);
      windowListeners.set(type, listeners);
    },
    async fetch(url, requestOptions) {
      fetchCalls.push({ url: String(url), options: requestOptions || {} });
      if (options.fetchError) throw new Error(options.fetchError);
      return {
        ok: true,
        json: async () => options.catalog || catalog,
      };
    },
    SKRIPTLAB_CONFIG: { API_BASE_URL: 'https://api.example.test' },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.runInNewContext(componentSource, sandbox, { filename: 'text-model-settings.js' });

  function findByClass(className) {
    return document.body.find((node) => String(node.className || '').split(/\s+/).includes(className));
  }

  function emitStorage(key, newValue) {
    for (const listener of windowListeners.get('storage') || []) {
      listener({ key, newValue });
    }
  }

  return {
    api: sandbox.SkriptLabTextModelSettings,
    document,
    emitStorage,
    fetchCalls,
    findByClass,
    storage,
    trigger,
    triggerId,
  };
}

test('all three text modules load and mount the shared model settings control', () => {
  const modules = [
    ['tekstin-parantelu', 'ti-model-settings', 'demanding'],
    ['kaannoksen-viimeistely', 'kf-model-settings', 'demanding'],
    ['kirjoita-editoi', 'write-model-settings', 'standard'],
  ];

  for (const [name, triggerId, defaultKind] of modules) {
    const html = fs.readFileSync(path.join(appRoot, `${name}.html`), 'utf8');
    const js = fs.readFileSync(path.join(appRoot, `${name}.js`), 'utf8');
    assert.match(html, /text-model-settings\.css\?v=\d+/);
    assert.match(
      html,
      new RegExp(`<button\\b(?=[^>]*\\bid=["']${triggerId}["'])(?=[^>]*\\bclass=["'][^"']*text-model-settings-trigger)[^>]*>`),
    );
    assert.match(html, /data-text-model-current/);
    const sharedScript = html.indexOf('text-model-settings.js');
    const moduleScript = html.indexOf(`${name}.js`, sharedScript + 1);
    assert.ok(sharedScript >= 0 && moduleScript > sharedScript, `${name} loads shared settings before its module`);
    assert.match(js, new RegExp(`triggerId:\\s*["']${triggerId}["']`));
    assert.match(js, new RegExp(`defaultKind:\\s*["']${defaultKind}["']`));
  }
});

test('catalog loading is authenticated, accessible and returns only a saved catalog model', async () => {
  const userId = '17';
  const storageKey = `skriptlab_text_tool_model_${userId}`;
  const harness = createHarness({
    triggerId: 'ti-model-settings',
    storage: {
      skriptlab_auth_token: 'secret-token',
      skriptlab_auth_user: JSON.stringify({ id: userId }),
      [storageKey]: 'gemini:gemini-3.5-flash-lite',
    },
  });
  const settings = harness.api.mount({
    triggerId: harness.triggerId,
    defaultKind: 'demanding',
  });

  assert.equal(await settings.load(false), true);
  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(harness.fetchCalls[0].url, 'https://api.example.test/api/models/text');
  assert.equal(harness.fetchCalls[0].options.headers.Authorization, 'Bearer secret-token');
  assert.equal(settings.getModel(), 'gemini:gemini-3.5-flash-lite');

  const trigger = harness.trigger;
  const dialog = harness.document.getElementById('ti-model-settings-dialog');
  const status = harness.findByClass('text-model-settings-status');
  const close = harness.findByClass('text-model-settings-close');
  assert.equal(trigger.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(trigger.getAttribute('aria-controls'), dialog.id);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(dialog.tagName, 'DIALOG');
  assert.equal(dialog.getAttribute('aria-labelledby'), `${dialog.id}-title`);
  assert.equal(dialog.getAttribute('aria-describedby'), `${dialog.id}-description`);
  assert.ok(harness.document.getElementById(`${dialog.id}-title`));
  assert.ok(harness.document.getElementById(`${dialog.id}-description`));
  assert.equal(status.getAttribute('role'), 'status');
  assert.equal(status.getAttribute('aria-live'), 'polite');
  assert.equal(close.getAttribute('aria-label'), 'Sulje malliasetukset');

  trigger.click();
  assert.equal(dialog.open, true);
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');

  const select = harness.document.getElementById(`${dialog.id}-select`);
  assert.deepEqual(
    Array.from(select.children, (option) => option.value),
    ['', 'gemini:gemini-3.5-flash-lite', 'gemini:gemini-3.8-flash', 'gemini:gemini-3.1-pro-preview'],
  );
  select.value = 'gemini:gemini-3.8-flash';
  select.dispatch('change');
  harness.findByClass('text-model-settings-save').click();
  assert.equal(settings.getModel(), 'gemini:gemini-3.8-flash');
  assert.equal(harness.storage.get(storageKey), 'gemini:gemini-3.8-flash');

  trigger.click();
  select.value = 'anthropic:not-in-catalog';
  harness.findByClass('text-model-settings-save').click();
  assert.equal(settings.getModel(), 'gemini:gemini-3.8-flash');
  assert.equal(harness.storage.get(storageKey), 'gemini:gemini-3.8-flash');
  assert.match(status.textContent, /ei ole enää käytettävissä/i);
});

test('stale stored choices are cleared and storage events synchronize only catalog values', async () => {
  const userId = '88';
  const storageKey = `skriptlab_text_tool_model_${userId}`;
  const harness = createHarness({
    storage: {
      skriptlab_auth_token: 'token-88',
      skriptlab_auth_user: JSON.stringify({ id: userId }),
      [storageKey]: 'openai:removed-model',
    },
  });
  const settings = harness.api.mount({
    triggerId: harness.triggerId,
    defaultKind: 'demanding',
  });

  await settings.load(false);
  assert.equal(settings.getModel(), null);
  assert.equal(harness.storage.has(storageKey), false);
  assert.match(settings.getLabel(), /^Automaattinen · Gemini 3\.8 Flash$/);
  assert.match(harness.findByClass('text-model-settings-status').textContent, /Vaihdettiin automaattiseen oletukseen/);

  harness.emitStorage(storageKey, 'gemini:gemini-3.5-flash-lite');
  assert.equal(settings.getModel(), 'gemini:gemini-3.5-flash-lite');

  harness.emitStorage(storageKey, 'openai:still-not-in-catalog');
  assert.equal(settings.getModel(), null);
});

test('catalog failure and a missing trigger safely fall back to automatic model selection', async () => {
  const harness = createHarness({
    fetchError: 'verkko poikki',
    storage: {
      skriptlab_auth_token: 'fallback-token',
      skriptlab_auth_user: JSON.stringify({ id: '99' }),
    },
  });
  const settings = harness.api.mount({ triggerId: harness.triggerId, defaultKind: 'demanding' });

  assert.equal(await settings.load(false), false);
  assert.equal(settings.getModel(), null);
  assert.equal(settings.getLabel(), 'Automaattinen');
  assert.match(harness.trigger.getAttribute('aria-label'), /Käytössä: Automaattinen/);
  assert.match(
    harness.findByClass('text-model-settings-status').textContent,
    /Automaattinen malli on edelleen käytettävissä/,
  );

  const missing = harness.api.mount({ triggerId: 'missing-trigger' });
  assert.equal(missing.getModel(), null);
  assert.equal(missing.getLabel(), 'Automaattinen');
  assert.equal(await missing.load(), false);
});
