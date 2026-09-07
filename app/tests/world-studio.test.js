const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'world-studio.js'), 'utf8');

function harness(fetchImpl = async () => { throw new Error('Unexpected request'); }) {
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag;
      this.children = [];
      this.dataset = {};
      this.style = {};
      this.attributes = {};
      this.value = '';
      this.textContent = '';
      this.hidden = true;
      this.disabled = false;
    }
    set innerHTML(_value) { throw new Error('World content must be inserted as text'); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name]; }
    querySelectorAll() { return []; }
    addEventListener() {}
    focus() { this.focused = true; }
    reset() {}
    close() { this.open = false; }
    showModal() { this.open = true; }
    click() {}
    remove() {}
  }
  const elements = new Map();
  const get = name => {
    if (!elements.has(name)) elements.set(name, new Element());
    return elements.get(name);
  };
  const selectedKinds = [];
  const document = {
    readyState: 'loading', body: new Element('body'), addEventListener() {},
    getElementById: id => get(id.replace(/^world-/, '')),
    createElement: tag => new Element(tag), createElementNS: (_ns, tag) => new Element(tag),
    querySelector: () => selectedKinds[0] || null,
    querySelectorAll: selector => selector.includes('file-kind') ? selectedKinds : [],
  };
  const context = {
    document, AbortController, URL, URLSearchParams, console,
    setTimeout: () => 1,
    window: {
      SkriptLabAuth: { fetch: fetchImpl },
      location: { origin: 'https://skriptlab.test', search: '' },
      addEventListener() {},
    },
  };
  vm.runInNewContext(source + '\nglobalThis.studio = { state, positiveId, errorText, generateWorld, createFiles, fileAction, loadProject, renderEntityDetail, applyPayload };', context);
  const studio = context.studio;
  Object.assign(studio.state, { projectId: 7, revision: 4, worldRevision: 2, tab: 'files' });
  get('source-mode').value = 'project';
  get('biome').value = 'auto';
  get('time-of-day').value = 'day';
  return { ...studio, get, selectedKinds, context };
}

function snapshot(revision, world = null, files = []) {
  return { revision, world_revision: world ? revision : 0, world, files, source: { available: true }, title: 'Satama' };
}

function success(payload) { return { ok: true, json: async () => payload }; }
function deferred() {
  let resolve;
  const promise = new Promise(res => { resolve = res; });
  return { promise, resolve };
}

test('world studio rejects invalid project ids and flattens API validation errors', () => {
  const studio = harness();
  for (const value of [null, '', 0, -1, 'abc', '1/../../', 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.equal(studio.positiveId(value), null);
  assert.equal(studio.positiveId('42'), 42);
  assert.equal(studio.errorText({ detail: [{ msg: 'Ensimmäinen' }, { msg: 'Toinen' }] }, 'fallback'), 'Ensimmäinen Toinen');
  assert.equal(studio.errorText({ detail: { message: 'Tarkista versio' } }, 'fallback'), 'Tarkista versio');
});

test('world generation excludes pasted text in project mode and sends the current revision', async () => {
  const requests = [];
  const studio = harness(async (url, options) => { requests.push({ url, options }); return success(snapshot(5)); });
  studio.get('source-text').value = 'Private draft from a previous text-mode request';
  studio.get('instructions').value = '  Säilytä vanha torni.  ';
  await studio.generateWorld({ preventDefault() {} });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/projects/7/world-studio/generate');
  assert.equal(requests[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    base_revision: 4, source_text: '', instructions: 'Säilytä vanha torni.', biome: 'auto', time_of_day: 'day',
  });
  assert.equal(studio.state.revision, 5);
  assert.equal(studio.state.busy, false);
});

test('empty custom text stops generation and focuses the missing source', async () => {
  let requests = 0;
  const studio = harness(async () => { requests += 1; });
  studio.get('source-mode').value = 'text';
  studio.get('source-text').value = ' \n ';
  await studio.generateWorld();
  assert.equal(requests, 0);
  assert.equal(studio.get('source-text').focused, true);
  assert.match(studio.get('notice-text').textContent, /Liitä ensin/);
});

test('a completed old-project generation cannot replace the new project or unlock its work', async () => {
  const response = deferred();
  const studio = harness(async () => response.promise);
  const pending = studio.generateWorld();
  assert.equal(studio.state.busy, true);
  Object.assign(studio.state, { generation: 1, projectId: 8, revision: 9, title: 'Uusi teos', busy: true });
  response.resolve(success(snapshot(99, { title: 'Old project result', entities: [] })));
  await pending;
  assert.equal(studio.state.projectId, 8);
  assert.equal(studio.state.revision, 9);
  assert.equal(studio.state.title, 'Uusi teos');
  assert.equal(studio.state.world, null);
  assert.equal(studio.state.busy, true);
});

test('rapid project switching aborts old requests and discards responses even if abort is ignored', async () => {
  const requests = [];
  const studio = harness((url, options) => {
    const response = deferred(); requests.push({ url, options, response }); return response.promise;
  });
  const first = studio.loadProject(11);
  const second = studio.loadProject(12);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.signal.aborted, true);
  requests[1].response.resolve(success({ ...snapshot(3), title: 'Project 12' }));
  await second;
  requests[0].response.resolve(success({ ...snapshot(9), title: 'Project 11' }));
  await first;
  assert.equal(studio.state.projectId, 12);
  assert.equal(studio.state.title, 'Project 12');
  assert.equal(studio.state.revision, 3);
  assert.equal(studio.state.loading, false);
});

test('multiple file formats are created sequentially with the latest server revision', async () => {
  const firstResponse = deferred();
  const requests = [];
  const world = { title: 'Satama', entities: [] };
  const studio = harness(async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    if (requests.length === 1) return firstResponse.promise;
    return success(snapshot(6, world, [{ id: 'f1', name: 'world.json' }, { id: 'f2', name: 'scene.gltf' }]));
  });
  studio.state.world = world;
  studio.selectedKinds.push({ value: 'world' }, { value: 'scene' });
  const pending = studio.createFiles();
  assert.equal(requests.length, 1);
  firstResponse.resolve(success(snapshot(5, world, [{ id: 'f1', name: 'world.json' }])));
  await pending;
  assert.deepEqual(requests.map(item => item.body), [
    { base_revision: 4, kind: 'world', entity_ids: [] },
    { base_revision: 5, kind: 'scene', entity_ids: [] },
  ]);
  assert.equal(studio.state.files.length, 2);
  assert.equal(studio.state.revision, 6);
  assert.equal(studio.state.busy, false);
});

test('file generation stops after a version conflict and keeps already saved files', async () => {
  let requests = 0;
  const world = { title: 'Satama', entities: [] };
  const studio = harness(async () => {
    requests += 1;
    return requests === 1 ? success(snapshot(5, world, [{ id: 'f1', name: 'world.json' }]))
      : { ok: false, status: 409, json: async () => ({ detail: 'Version conflict' }) };
  });
  studio.state.world = world;
  studio.selectedKinds.push({ value: 'world' }, { value: 'scene' }, { value: 'brief' });
  await studio.createFiles();
  assert.equal(requests, 2);
  assert.equal(studio.state.files.length, 1);
  assert.equal(studio.state.files[0].id, 'f1');
  assert.equal(studio.state.revision, 5);
  assert.equal(typeof studio.state.retry, 'function');
  assert.match(studio.get('notice-text').textContent, /muuttunut toisessa/);
  assert.equal(studio.state.busy, false);
});

test('file preview inserts potentially executable content as bounded plain text', async () => {
  const content = '<img src=x onerror="window.compromised=true">' + 'x'.repeat(20000);
  const studio = harness(async () => ({ ok: true, blob: async () => ({ text: async () => content }) }));
  studio.state.files = [{ id: 'f1', name: '<script>unsafe filename</script>.json', size_bytes: content.length, world_revision: 2 }];
  await studio.fileAction('preview', 'f1');
  assert.equal(studio.get('preview-content').textContent, content.slice(0, 18000));
  assert.equal(studio.get('preview-title').textContent, '<script>unsafe filename</script>.json');
  assert.equal(studio.get('preview').open, true);
  assert.match(studio.get('preview-note').textContent, /18 000/);
  assert.equal(studio.context.window.compromised, undefined);
});

test('source-derived entity details retain references and distinguish 3D layout choices', () => {
  const studio = harness();
  studio.state.selectedId = 'tower';
  studio.state.world = { entities: [{
    id: 'tower', name: '<script>tower</script>', description: 'Vanha torni', origin: 'source', kind: 'tower',
    source_refs: [{ chapter_id: 'Luku 1', paragraph_id: 'p3', quote: '<img src=x> Satamasta näkyi torni.' }],
  }] };
  studio.renderEntityDetail();
  const nodes = studio.get('entity-detail').children;
  assert.equal(nodes[0].textContent, 'Teoksesta tunnistettu kohde');
  assert.equal(nodes[1].textContent, '<script>tower</script>');
  assert.equal(nodes.find(node => node.tagName === 'blockquote').textContent, '<img src=x> Satamasta näkyi torni.');
  assert.match(nodes.at(-1).textContent, /toteutusvalintoja/);
});
