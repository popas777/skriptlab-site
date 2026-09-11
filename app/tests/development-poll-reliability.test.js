"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../book-workflow.js"), "utf8");
const mountSource = source.slice(source.indexOf("  function mountDevelopment() {"), source.indexOf("  function mountPlan() {"));
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function job(id, status = "running", extra = {}) { return { id, status, completed_count: status === "completed" ? 2 : 1, total_count: 2, idempotency_key: `key-${id}`, ...extra }; }
function temporary(status = 503) { return Object.assign(new Error("Tilapäinen häiriö"), { status, retryable: true }); }
function network() { return Object.assign(new Error("Yhteys palvelimeen katkesi."), { code: "NETWORK_ERROR", retryable: true }); }

function harness(respond) {
  let project = 1, timerId = 0;
  const nodes = new Map(), timers = new Map(), requests = [], events = new Map(), completed = [], reloads = [], delays = [];
  class Element {
    constructor() { this.dataset = {}; this.disabled = false; this.value = ""; this.textContent = ""; this.children = []; this.classList = { remove() {} }; }
    append(...items) { this.children.push(...items); }
    replaceChildren(...items) { this.children = items; }
    removeAttribute() {}
  }
  const node = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
  const clicks = new Map();
  const A = {
    projectId: () => project,
    request: async (requestPath, options = {}) => {
      requests.push({ path: requestPath, options });
      return respond(requestPath, options, requests);
    },
    keyForRun: (_action, _scope, previous) => previous?.can_resume ? previous.idempotency_key : "new-request-key",
    keyFor: () => "key-11",
    completeKey: key => completed.push(key),
    refresh: async () => ({}), decorate() {},
  };
  const win = { SkriptLabBasicHooks: { reloadProject: async () => reloads.push(project) } };
  const handlers = {};
  const context = vm.createContext({
    A, window: win, handlers,
    document: { createElement: () => new Element(), addEventListener: (name, callback) => events.set(name, callback) },
    $: node,
    wrap(_root, _name, _action, html) { for (const match of html.matchAll(/id="([^"]+)"/g)) node(match[1]); },
    cardIntro: () => "", button: id => `<button id="${id}"></button>`, usage: () => "", status: id => `<p id="${id}"></p>`,
    tell: (id, value) => { node(id).textContent = value; },
    on: (id, callback) => clicks.set(id, callback),
    savedProject: () => A.request(`/projects/${project}`),
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); delays.push(delay); return id; },
    clearTimeout: id => timers.delete(id),
  });
  vm.runInContext(mountSource + "\nmountDevelopment();", context);
  return {
    A, node, timers, requests, completed, reloads, delays,
    status: () => node("book-development-status").textContent,
    report: () => node("book-development-results").children.map(value => value.textContent).join(""),
    open: () => handlers["view-kehityseditointi"](),
    click: id => clicks.get(id)(),
    async switchProject(value) { project = value; events.get("skriptlab:access")(); await flush(); },
    async tick() { const [id, item] = timers.entries().next().value || []; assert.ok(item, "a retry or poll is scheduled"); timers.delete(id); item.callback(); await flush(); },
  };
}

test("development polling survives network failures with capped backoff and resets after recovery", async () => {
  let polls = 0;
  const h = harness(requestPath => {
    if (requestPath.endsWith("/state")) return { latest_development_feedback: job(11) };
    polls += 1;
    if (polls === 1) throw temporary();
    if (polls === 2) throw new TypeError("Failed to fetch");
    if (polls <= 4) throw network();
    return job(11);
  });
  await h.open();
  assert.match(h.status(), /Yhteys palvelimeen katkesi/);
  assert.equal(h.node("book-development-run").disabled, true);
  for (let count = 0; count < 4; count++) await h.tick();
  assert.deepEqual(h.delays, [4000, 8000, 15000, 15000, 4000]);
  assert.match(h.status(), /1\/2 osaa käsitelty/);
  assert.doesNotMatch(h.status(), /Yhteys palvelimeen/);
  assert.ok(h.requests.every(request => !request.options.method));
});

test("authentication, missing jobs and other permanent failures stop polling", async () => {
  for (const status of [401, 403, 404, 409, 422, 500]) {
    const h = harness(requestPath => {
      if (requestPath.endsWith("/state")) return { latest_development_feedback: job(11) };
      throw Object.assign(new Error(`Virhe ${status}`), { status, retryable: status < 500 });
    });
    await h.open();
    assert.equal(h.timers.size, 0, status);
    assert.equal(h.status(), `Virhe ${status}`);
  }
});

test("completion cancels polling, completes the actual request identity and reloads once", async () => {
  let polls = 0;
  const h = harness(requestPath => requestPath.endsWith("/state")
    ? { latest_development_feedback: job(11) }
    : job(11, ++polls === 1 ? "running" : "completed", { report: "Valmis palaute" }));
  await h.open(); await h.tick();
  assert.equal(h.timers.size, 0);
  assert.equal(h.report(), "Valmis palaute");
  assert.equal(h.node("book-development-run").disabled, false);
  assert.deepEqual(h.completed, ["key-11"]);
  assert.deepEqual(h.reloads, [1]);
  await h.click("book-development-refresh");
  assert.deepEqual(h.reloads, [1]);
});

test("a late response from the previous project cannot overwrite or complete the current project", async () => {
  const old = deferred();
  const h = harness(requestPath => {
    if (requestPath === "/projects/1/basic-production/state") return { latest_development_feedback: job(11) };
    if (requestPath === "/projects/1/development-feedback/runs/11") return old.promise;
    if (requestPath === "/projects/2/basic-production/state") return { latest_development_feedback: job(22) };
    return job(22, "completed", { report: "Toisen teoksen palaute" });
  });
  const initial = h.open(); await flush();
  h.A.keyFor = () => "key-22";
  await h.switchProject(2);
  old.resolve(job(11, "completed", { report: "Vanhentunut palaute" })); await initial;
  assert.equal(h.report(), "Toisen teoksen palaute");
  assert.deepEqual(h.completed, ["key-22"]);
  assert.deepEqual(h.reloads, [2]);
  assert.equal(h.timers.size, 0);
});

test("a late failure from an older run cannot replace a newer run's status", async () => {
  const old = deferred(); let reads = 0;
  const h = harness(requestPath => {
    if (requestPath.endsWith("/state")) return { latest_development_feedback: job(++reads === 1 ? 11 : 12) };
    if (requestPath.endsWith("/runs/11")) return old.promise;
    return job(12, "completed", { report: "Uusi palaute" });
  });
  const initial = h.open(); await flush();
  await h.click("book-development-refresh");
  old.reject(network()); await initial;
  assert.equal(h.report(), "Uusi palaute");
  assert.match(h.status(), /Kehityspalaute valmis/);
  assert.equal(h.timers.size, 0);
});

test("manual refresh replaces the existing timer and a project change clears it", async () => {
  const h = harness(requestPath => requestPath.endsWith("/state")
    ? { latest_development_feedback: requestPath.includes("/1/") ? job(11) : null } : job(11));
  await h.open(); const initial = [...h.timers.keys()][0];
  await h.click("book-development-refresh");
  assert.equal(h.timers.size, 1);
  assert.equal(h.timers.has(initial), false);
  await h.switchProject(2);
  assert.equal(h.timers.size, 0);
  assert.equal(h.node("book-development-run").disabled, false);
  assert.match(h.status(), /ei ole vielä pyydetty/);
});

test("an uncertain POST attaches only the run bearing its exact request key without repeating the POST", async () => {
  let reads = 0;
  const h = harness((requestPath, options) => {
    if (requestPath === "/projects/1") return { id: 1 };
    if (requestPath.endsWith("/state")) return { latest_development_feedback: ++reads === 1 ? null : job(11, "running", { idempotency_key: "new-request-key" }) };
    if (options.method === "POST") throw network();
    return job(11, "completed", { idempotency_key: "new-request-key", report: "Palautunut työ" });
  });
  h.node("book-development-instructions").value = "Tarkastele rytmiä.";
  h.A.keyFor = () => "new-request-key";
  await h.click("book-development-run");
  const posts = h.requests.filter(request => request.options.method === "POST");
  assert.equal(posts.length, 1);
  assert.equal(posts[0].options.body.idempotency_key, "new-request-key");
  assert.equal(posts[0].options.body.instructions, "Tarkastele rytmiä.");
  assert.equal(h.report(), "Palautunut työ");
  assert.deepEqual(h.completed, ["new-request-key"]);
});

test("unmatched state never attaches another job and stops after three checks until user action", async () => {
  let matching = false;
  const h = harness((requestPath, options) => {
    if (requestPath === "/projects/1") return { id: 1 };
    if (options.method === "POST") throw network();
    if (requestPath.endsWith("/state")) return { latest_development_feedback: matching
      ? job(11, "running", { idempotency_key: "new-request-key" }) : job(99, "completed") };
    return job(11, "completed", { report: "Oikea palaute", idempotency_key: "new-request-key" });
  });
  await h.click("book-development-run"); await h.tick(); await h.tick();
  assert.equal(h.timers.size, 0);
  assert.equal(h.node("book-development-run").disabled, false);
  assert.equal(h.node("book-development-run").textContent, "Yritä käynnistystä uudelleen");
  assert.equal(h.node("book-development-instructions").disabled, true);
  assert.match(h.status(), /Käynnistyksen tulos on epäselvä/);
  assert.ok(h.requests.every(request => !request.path.includes("/runs/99")));
  assert.equal(h.requests.filter(request => request.path.endsWith("/state")).length, 4, "one preflight and three reconciliation reads");
  matching = true;
  await h.click("book-development-refresh");
  assert.equal(h.report(), "Oikea palaute");
  assert.equal(h.requests.filter(request => request.options.method === "POST").length, 1);
});

test("manual retry after an uncertain start sends the same identity and original instructions without another save", async () => {
  let posts = 0, saved = 0;
  const h = harness((requestPath, options) => {
    if (requestPath === "/projects/1") { saved += 1; return { id: 1 }; }
    if (requestPath.endsWith("/state")) return { latest_development_feedback: null };
    if (options.method === "POST") {
      posts += 1;
      if (posts === 1) throw network();
      return job(11, "running", { idempotency_key: options.body.idempotency_key });
    }
    return job(11, "completed", { idempotency_key: "new-request-key", report: "Uusittu sama pyyntö" });
  });
  h.node("book-development-instructions").value = "Alkuperäinen tarkka ohje";
  await h.click("book-development-run"); await h.tick(); await h.tick();
  assert.equal(posts, 1, "no automatic second POST");
  assert.equal(h.node("book-development-run").dataset.accessAction, undefined);
  h.node("book-development-instructions").value = "Myöhempi kentän muutos ei muuta alkuperäistä pyyntöä";
  await h.click("book-development-run");
  const sent = h.requests.filter(request => request.options.method === "POST");
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0].options.body, sent[1].options.body);
  assert.equal(sent[1].options.body.instructions, "Alkuperäinen tarkka ohje");
  assert.equal(sent[1].options.body.idempotency_key, "new-request-key");
  assert.equal(saved, 1, "retry does not flush a changed manuscript");
  assert.equal(h.report(), "Uusittu sama pyyntö");
});

function coldAccessKeys(identity) {
  const storageKey = "skriptlab_action:1:development_feedback.run:whole-book";
  const session = new Map([[storageKey, identity]]);
  const local = new Map([["skriptlab_active_project_id", "1"]]);
  const storage = map => ({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) });
  const win = {
    document: { readyState: "loading", addEventListener() {} },
    location: { href: "https://app.example/index.html", search: "" },
    localStorage: storage(local), sessionStorage: storage(session),
    crypto: { randomUUID: () => "new-after-reload" }, fetch: async () => new Response("{}"),
  };
  win.parent = win;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../book-access.js"), "utf8"), { window: win, URL, URLSearchParams, Headers, Response, FormData });
  return { api: win.SkriptLabBookAccess, session, storageKey };
}

test("completion after a cold reload clears the persisted identity so a new user action gets a new job", async () => {
  const cold = coldAccessKeys("key-11");
  let created = false;
  const h = harness((requestPath, options) => {
    if (requestPath.endsWith("/state")) return { latest_development_feedback: job(11, "completed") };
    if (options.method === "POST") { created = true; return job(12, "running", { idempotency_key: options.body.idempotency_key }); }
    return created ? job(12, "completed", { idempotency_key: "new-after-reload", report: "Uusi ajo" }) : job(11, "completed");
  });
  for (const key of ["keyFor", "keyForRun", "completeKey"]) h.A[key] = cold.api[key];
  await h.open();
  assert.equal(cold.session.has(cold.storageKey), false);
  await h.click("book-development-run");
  const sent = h.requests.find(request => request.options.method === "POST");
  assert.equal(sent.options.body.idempotency_key, "new-after-reload");
  assert.equal(h.report(), "Uusi ajo");
});

test("loading an older completed result does not discard a different persisted request identity", async () => {
  const cold = coldAccessKeys("different-pending-key");
  const h = harness(requestPath => requestPath.endsWith("/state") ? { latest_development_feedback: job(11, "completed") } : job(11, "completed"));
  h.A.keyFor = cold.api.keyFor; h.A.completeKey = cold.api.completeKey;
  await h.open();
  assert.equal(cold.session.get(cold.storageKey), "different-pending-key");
});

test("uncertain submission identity survives project changes without affecting the other project", async () => {
  const submitted = deferred(); let reads = 0;
  const h = harness((requestPath, options) => {
    if (requestPath === "/projects/1") return { id: 1 };
    if (options.method === "POST") return submitted.promise;
    if (requestPath === "/projects/2/basic-production/state") return { latest_development_feedback: null };
    if (requestPath.endsWith("/state")) return { latest_development_feedback: ++reads === 1 ? null : job(11, "running", { idempotency_key: "new-request-key" }) };
    return job(11, "completed", { idempotency_key: "new-request-key", report: "Ensimmäisen teoksen palaute" });
  });
  const start = h.click("book-development-run"); await flush();
  await h.switchProject(2);
  submitted.reject(network()); await start;
  assert.match(h.status(), /ei ole vielä pyydetty/);
  assert.equal(h.node("book-development-run").disabled, false);
  await h.switchProject(1);
  assert.equal(h.report(), "Ensimmäisen teoksen palaute");
  assert.equal(h.requests.filter(request => request.options.method === "POST").length, 1);
});

test("a rejected POST is shown as a failure without reconciliation or another submission", async () => {
  const h = harness((requestPath, options) => {
    if (options.method === "POST") throw Object.assign(new Error("Käyttöoikeus puuttuu."), { status: 403, retryable: false });
    return requestPath.endsWith("/state") ? { latest_development_feedback: null } : { id: 1 };
  });
  await h.click("book-development-run");
  assert.equal(h.status(), "Käyttöoikeus puuttuu.");
  assert.equal(h.node("book-development-run").disabled, false);
  assert.equal(h.timers.size, 0);
  assert.equal(h.requests.filter(request => request.path.endsWith("/state")).length, 1);
});

test("a terminal backend failure is not reported as a connection outage", async () => {
  const failed = job(11, "failed", { can_resume: true, error_message: "Palveluntarjoaja hylkäsi tekstin.", request: { instructions: "Alkuperäinen ohje" } });
  const h = harness(requestPath => requestPath.endsWith("/state") ? { latest_development_feedback: failed } : failed);
  await h.open();
  assert.match(h.status(), /Palveluntarjoaja hylkäsi tekstin/);
  assert.doesNotMatch(h.status(), /Yhteys palvelimeen/);
  assert.equal(h.node("book-development-run").textContent, "Jatka samaa kehityspalautetta");
  assert.equal(h.node("book-development-instructions").value, "Alkuperäinen ohje");
  assert.equal(h.timers.size, 0);
});
