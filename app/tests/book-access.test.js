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

function browserHarness(fetcher) {
  const session = new Map(); const local = new Map([["skriptlab_auth_token", "test-token"], ["skriptlab_active_project_id", "7"]]);
  const storage = map => ({ getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) });
  const denials = [];
  const win = {
    document: { readyState: "loading", addEventListener() {}, querySelectorAll: () => [], dispatchEvent() {} },
    location: { href: "https://app.example/index.html", origin: "https://app.example", pathname: "/index.html", search: "" },
    SKRIPTLAB_CONFIG: { API_BASE_URL: "https://backend.example" },
    localStorage: storage(local), sessionStorage: storage(session), crypto: { randomUUID: (() => { let id = 0; return () => "identity-" + ++id; })() },
    fetch: fetcher, setTimeout: () => 1, clearTimeout() {},
    parent: { SkriptLabBookAccess: { showUpgrade: (action, detail) => denials.push({ action, detail }) } }
  };
  const context = vm.createContext({ window: win, module: { exports: {} }, URL, URLSearchParams, Headers, Response, FormData, CustomEvent: class {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../book-access.js"), "utf8"), context);
  return { win, api: win.SkriptLabBookAccess, denials };
}

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
