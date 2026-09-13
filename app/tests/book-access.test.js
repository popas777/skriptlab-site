"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const access = require("../book-access.js");

test("existing manuscript saves do not consume a new-book entitlement", () => {
  assert.equal(access.actionForRequest("/api/projects", "POST", { id: 51 }), "manuscript.edit");
  assert.equal(access.actionForRequest("/api/projects", "POST", { title: "New" }), "book.create");
  assert.equal(access.actionForRequest("/api/projects/51", "GET"), null);
});

test("EPUB-only layout is distinct from any print or mixed output request", () => {
  assert.equal(access.actionForRequest("/api/projects/7/layout/run", "POST", { output_formats: ["epub"] }), "layout.epub");
  for (const formats of [["pdf"], ["epub", "pdf"], ["latex"], undefined]) {
    assert.equal(access.actionForRequest("/api/projects/7/layout/run", "POST", { output_formats: formats }), "layout.print");
  }
});

test("single-cover generation cannot masquerade as the three-candidate benefit", () => {
  assert.equal(access.actionForRequest("/api/projects/7/cover-images", "POST", {}), "module.cover_illustration");
  assert.equal(access.actionForRequest("/api/projects/7/basic-production/cover-candidates", "POST", {}), "cover.generate_batch");
  assert.equal(access.actionForRequest("/api/projects/7/cover-images/upload", "POST"), "cover.upload");
  assert.equal(access.actionForRequest("/api/projects/7/cover-layout", "POST", {}), "cover.print");
});

test("preview, production, repairs and parent proofreading remain separate benefits", () => {
  assert.equal(access.actionForRequest("/api/audio/gemini-tts-preview", "POST", {}), "audio.preview");
  assert.equal(access.actionForRequest("/api/audio/productions", "POST", {}), "audio.produce");
  assert.equal(access.actionForRequest("/api/audio/productions/6/parts/2/regenerate", "POST", {}), "audio.repair");
  assert.equal(access.actionForRequest("/api/audio/productions/6/resume", "POST"), null);
  assert.equal(access.actionForRequest("/api/projects/7/proofread/run", "POST", {}), "proofread.run");
  assert.equal(access.actionForRequest("/api/projects/7/development-feedback/run", "POST", {}), "development_feedback.run");
  assert.equal(access.actionForRequest("/api/proofread/improve-selection", "POST", {}), "text.improve");
});

test("all edit transports carry the correct development, analysis or improvement action", () => {
  for (const path of ["/api/edit", "/api/edit/stream", "/api/edit/actions"]) {
    assert.equal(access.actionForRequest(path, "POST", { purpose: "development_editing" }), "development_feedback.run");
    assert.equal(access.actionForRequest(path, "POST", { purpose: "analysis_structure" }), "module.analysis");
    assert.equal(access.actionForRequest(path, "POST", { purpose: "analysis" }), "module.analysis");
    assert.equal(access.actionForRequest(path, "POST", { purpose: "write_edit" }), "text.improve");
  }
});

test("unknown or unloaded entitlements are not interpreted as access", () => {
  assert.equal(access.accessDecision(null, "analysis.run").allowed, false);
  assert.equal(access.accessDecision({ actions: {} }, "analysis.run").allowed, false);
  assert.equal(access.accessDecision({ actions: { "analysis.run": { allowed: false, remaining: 0 } } }, "analysis.run").allowed, false);
  assert.equal(access.accessDecision({ actions: { "analysis.run": { allowed: true, remaining: 1 } } }, "analysis.run").allowed, true);
});

test("a never-included feature is not described as an exhausted benefit", () => {
  assert.match(access.denialMessage("module.cover_illustration", { limit: 0, remaining: 0, reason: "feature_locked" }), /ei sisälly/);
  assert.match(access.denialMessage("analysis.run", { limit: 2, used: 2, remaining: 0, reason: "quota_exhausted" }), /käyttökerrat on käytetty/);
  assert.match(access.denialMessage("audio.produce", { limit: 1, reserved: 1, remaining: 0 }), /käynnissä/);
});

test("a bought campaign keeps its result tabs readable after use without enabling a new campaign", () => {
  const snapshot = { actions: { "module.marketing": { allowed: false, limit: 0, reason: "feature_locked" },
    "marketing.campaign": { allowed: false, limit: 1, used: 1, remaining: 0, reason: "quota_exhausted" } } };
  assert.equal(access.tabAccessDecision(snapshot, "module.marketing").allowed, true);
  assert.equal(access.accessDecision(snapshot, "marketing.campaign").allowed, false);
  assert.equal(access.tabAccessDecision({ actions: {} }, "module.marketing").allowed, false);
});

test("explicit project context and retry identity survive adapter enrichment", () => {
  assert.deepEqual(access.withRequestContext({ text: "Test", project_id: 7, idempotency_key: "original" }, 8, "new"), {
    text: "Test", project_id: 7, idempotency_key: "original"
  });
  assert.deepEqual(access.withRequestContext({ text: "Test" }, "8", "retry"), { text: "Test", project_id: 8, idempotency_key: "retry" });
});

function browserHarness(fetcher, options = {}) {
  const session = new Map(); const local = new Map([["skriptlab_auth_token", "test-token"], ["skriptlab_active_project_id", "7"]]);
  const storage = map => ({ getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) });
  const denials = [], timers = new Map(); let timerId = 0;
  const eventTarget = () => {
    const listeners = new Map(), events = [];
    return {
      events,
      addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); },
      removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
      dispatchEvent(event) { events.push(event); for (const listener of listeners.get(event.type) || []) listener(event); }
    };
  };
  const win = {
    ...eventTarget(),
    document: { ...eventTarget(), readyState: "loading", querySelectorAll: () => [] },
    location: { href: "https://app.example/index.html", origin: "https://app.example", pathname: "/index.html", search: "" },
    SKRIPTLAB_CONFIG: { API_BASE_URL: "https://backend.example" },
    localStorage: options.parent?.localStorage || storage(local), sessionStorage: storage(session), crypto: { randomUUID: (() => { let id = 0; return () => "identity-" + ++id; })() },
    fetch: fetcher,
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; }, clearTimeout: id => timers.delete(id),
    parent: options.parent || { SkriptLabBookAccess: { showUpgrade: (action, detail) => denials.push({ action, detail }) } }
  };
  if (options.parent === "self") win.parent = win;
  const context = vm.createContext({ window: win, module: { exports: {} }, URL, URLSearchParams, Headers, Response, FormData,
    Date: class extends Date { static now() { return options.now?.() ?? Date.now(); } },
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../book-access.js"), "utf8"), context);
  return { win, api: win.SkriptLabBookAccess, denials, timers,
    start: () => win.document.dispatchEvent({ type: "DOMContentLoaded" }),
    async runTimers() { const pending = [...timers.values()]; timers.clear(); await Promise.all(pending.map(callback => callback())); }
  };
}

const accessResponse = (allowed = true) => new Response(JSON.stringify({ actions: { "module.video": { allowed } } }), {
  headers: { "Content-Type": "application/json" }
});
const deferred = () => {
  let resolve; const promise = new Promise(value => { resolve = value; }); return { promise, resolve };
};

test("embedded modules share the shell's pending access request and receive later entitlement changes", async () => {
  const pending = deferred(); let parentRequests = 0, iframeRequests = 0;
  const parent = browserHarness(() => { parentRequests++; return parentRequests === 1 ? pending.promise : accessResponse(false); }, { parent: "self" });
  const childA = browserHarness(() => { iframeRequests++; return accessResponse(); }, { parent: parent.win });
  const childB = browserHarness(() => { iframeRequests++; return accessResponse(); }, { parent: parent.win });
  parent.start(); childA.start(); childB.start();
  const initial = Promise.all([parent.api.refresh(), childA.api.refresh(), childB.api.refresh()]);
  assert.equal(parentRequests, 1);
  assert.equal(iframeRequests, 0);
  pending.resolve(accessResponse()); await initial;
  assert.equal(childA.api.guardTab("module.video"), true);
  assert.equal(childB.api.getSnapshot(), parent.api.getSnapshot());
  await parent.api.refresh(true);
  assert.equal(childA.api.getSnapshot().actions["module.video"].allowed, false);
  assert.equal(childB.win.document.events.filter(event => event.type === "skriptlab:access").at(-1).detail.actions["module.video"].allowed, false);
  assert.equal(parentRequests, 2);
  assert.equal(iframeRequests, 0);
});

test("a newly opened module can immediately read cached access without a loading gate", async () => {
  let requests = 0;
  const parent = browserHarness(() => { requests++; return accessResponse(); }, { parent: "self" });
  await parent.api.refresh();
  const child = browserHarness(() => { throw new Error("An iframe must reuse shell access"); }, { parent: parent.win });
  assert.equal(child.api.guardTab("module.video"), true);
  await child.api.refresh();
  assert.equal(requests, 1);
});

test("module focus reuses recent access and refreshes it after thirty seconds", async () => {
  let now = 1000, requests = 0;
  const parent = browserHarness(() => { requests++; return accessResponse(); }, { parent: "self", now: () => now });
  const child = browserHarness(() => { throw new Error("An iframe must reuse shell access"); }, { parent: parent.win, now: () => now });
  parent.start(); child.start(); await child.api.refresh();
  for (let i = 0; i < 3; i++) { parent.win.dispatchEvent({ type: "focus" }); child.win.dispatchEvent({ type: "focus" }); }
  await parent.api.refresh(); assert.equal(requests, 1);
  now += 30000;
  parent.win.dispatchEvent({ type: "focus" }); child.win.dispatchEvent({ type: "focus" });
  await parent.api.refresh(); assert.equal(requests, 2);
});

test("mutations across embedded modules debounce one shell access refresh", async () => {
  let requests = 0;
  const parent = browserHarness(() => { requests++; return accessResponse(); }, { parent: "self" });
  await parent.api.refresh();
  const childA = browserHarness(async () => new Response("{}"), { parent: parent.win });
  const childB = browserHarness(async () => new Response("{}"), { parent: parent.win });
  const options = { method: "POST", body: JSON.stringify({ text: "Source" }) };
  await Promise.all([childA.win.fetch("https://backend.example/api/edit", options), childB.win.fetch("https://backend.example/api/edit", options)]);
  assert.equal(parent.timers.size, 1);
  assert.equal(childA.timers.size + childB.timers.size, 0);
  await parent.runTimers();
  assert.equal(requests, 2);
});

test("a completed mutation refreshes usage after a previously started access read finishes", async () => {
  const pending = deferred(); let reads = 0;
  const harness = browserHarness(url => {
    if (url.includes("/access/me")) return ++reads === 1 ? pending.promise : accessResponse(false);
    return new Response("{}");
  }, { parent: "self" });
  const initial = harness.api.refresh();
  await harness.win.fetch("https://backend.example/api/edit", { method: "POST", body: JSON.stringify({ text: "Source" }) });
  const update = harness.runTimers();
  assert.equal(reads, 1);
  pending.resolve(accessResponse()); await Promise.all([initial, update]);
  assert.equal(reads, 2);
  assert.equal(harness.api.getSnapshot().actions["module.video"].allowed, false);
});

test("project changes discard old responses without clearing the new project's pending request", async () => {
  const first = deferred(), second = deferred(); let requests = 0;
  const harness = browserHarness(() => (++requests === 1 ? first.promise : second.promise), { parent: "self" });
  const oldRequest = harness.api.refresh();
  harness.win.localStorage.setItem("skriptlab_active_project_id", "8");
  const newRequest = harness.api.refresh();
  first.resolve(accessResponse()); assert.equal(await oldRequest, null);
  const duplicate = harness.api.refresh();
  assert.equal(requests, 2, "completion of an old request must not start a duplicate for the new project");
  assert.equal(harness.api.getSnapshot(), null);
  second.resolve(accessResponse(false)); await Promise.all([newRequest, duplicate]);
  assert.equal(harness.api.getSnapshot().actions["module.video"].allowed, false);
});

test("account changes invalidate cached and pending access even when the project is unchanged", async () => {
  const pending = deferred(); let requests = 0;
  const harness = browserHarness(() => (++requests === 2 ? pending.promise : accessResponse()), { parent: "self" });
  await harness.api.refresh();
  const oldRequest = harness.api.refresh(true);
  harness.win.localStorage.setItem("skriptlab_auth_token", "another-account");
  assert.equal(harness.api.getSnapshot(), null);
  await harness.api.refresh();
  const current = harness.api.getSnapshot();
  pending.resolve(accessResponse(false)); assert.equal(await oldRequest, null);
  assert.equal(harness.api.getSnapshot(), current);
  harness.win.localStorage.removeItem("skriptlab_auth_token");
  assert.equal(harness.api.getSnapshot(), null);
  assert.equal(await harness.api.refresh(), null);
});

test("an iframe with its own project cannot reuse access granted to the shell's project", async () => {
  let requests = 0;
  const parent = browserHarness(() => accessResponse(), { parent: "self" });
  await parent.api.refresh();
  const child = browserHarness(() => { requests++; return accessResponse(false); }, { parent: parent.win });
  child.win.manuscriptData = { id: 8 };
  assert.equal(child.api.getSnapshot(), null);
  await child.api.refresh();
  assert.equal(requests, 1);
  assert.equal(child.api.getSnapshot().actions["module.video"].allowed, false);
  assert.equal(parent.api.getSnapshot().actions["module.video"].allowed, true);
});

test("a transient background refresh failure preserves the current project's loaded controls", async () => {
  let requests = 0;
  const harness = browserHarness(() => { if (++requests > 1) throw new TypeError("Offline"); return accessResponse(); }, { parent: "self" });
  const initial = await harness.api.refresh();
  assert.equal(await harness.api.refresh(true), initial);
  assert.equal(harness.api.guardTab("module.video"), true);
  harness.win.localStorage.setItem("skriptlab_active_project_id", "8");
  assert.equal(await harness.api.refresh(), null, "failed access for another project cannot reuse the old grant");
});

test("an uncertain submission retries with the identical action identity", async () => {
  const requests = [];
  const harness = browserHarness(async (_url, options) => {
    requests.push(JSON.parse(options.body));
    if (requests.length === 1) throw new TypeError("Network interrupted");
    return new Response(JSON.stringify({ edited_text: "Edited" }), { headers: { "Content-Type": "application/json" } });
  });
  const options = { method: "POST", body: JSON.stringify({ text: "Source" }) };
  await assert.rejects(harness.win.fetch("https://backend.example/api/edit", options));
  await harness.win.fetch("https://backend.example/api/edit", options);
  assert.equal(requests[0].idempotency_key, requests[1].idempotency_key);
  assert.equal(requests[1].project_id, 7);
  await harness.win.fetch("https://backend.example/api/edit", options);
  assert.notEqual(requests[2].idempotency_key, requests[1].idempotency_key, "a completed user action permits an intentionally new action");
});

test("failed parent source changes permit a new identity while valid resumes retain theirs", () => {
  const harness = browserHarness(async () => new Response("{}"));
  const original = harness.api.keyForRun("proofread.run", "whole-book", null);
  assert.equal(harness.api.keyForRun("proofread.run", "whole-book", { status: "failed", can_resume: true, idempotency_key: original }), original);
  assert.equal(harness.api.keyForRun("proofread.run", "whole-book", { status: "running", can_resume: false, idempotency_key: original }), original);
  const changed = harness.api.keyForRun("proofread.run", "whole-book", { status: "failed", can_resume: false, idempotency_key: original });
  assert.notEqual(changed, original);
  assert.equal(harness.api.keyForRun("proofread.run", "whole-book", { status: "failed", can_resume: false, idempotency_key: original }), changed);
});

test("structured backend denials open the shared upgrade dialog and stay readable to legacy modules", async () => {
  const harness = browserHarness(async () => new Response(JSON.stringify({ detail: { code: "quota_exhausted", action: "text.improve", message: "Käyttökerrat on käytetty." } }), {
    status: 403, headers: { "Content-Type": "application/json" }
  }));
  const response = await harness.win.fetch("https://backend.example/api/edit", { method: "POST", body: JSON.stringify({ text: "Test" }) });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).detail, "Käyttökerrat on käytetty.");
  assert.equal(harness.denials[0].action, "text.improve");
});

test("external requests are untouched by manuscript request enrichment", async () => {
  let body;
  const harness = browserHarness(async (_url, options) => { body = options.body; return new Response("{}"); });
  const original = JSON.stringify({ text: "Public input" });
  await harness.win.fetch("https://external.example/api/edit", { method: "POST", body: original });
  assert.equal(body, original);
});

test("development SSE reaches the editor before the stream has ended", { timeout: 1000 }, async () => {
  let controller;
  const stream = new ReadableStream({ start(value) { controller = value; value.enqueue(new TextEncoder().encode("data: partial\n\n")); } });
  const harness = browserHarness(async () => new Response(stream, { headers: { "Content-Type": "text/event-stream" } }));
  const response = await harness.win.fetch("https://backend.example/api/edit/stream", { method: "POST", body: JSON.stringify({ purpose: "development_editing", text: "Source" }) });
  const reader = response.body.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), "data: partial\n\n");
  controller.close(); await reader.cancel();
});
