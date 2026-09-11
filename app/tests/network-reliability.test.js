"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function harness(fetcher, { access = false, auth = true, autoTimers = true, now = Date.now() } = {}) {
  const requests = [], delays = [], redirects = [], timers = new Map();
  const local = new Map([
    ["skriptlab_auth_token", "test-token"], ["skriptlab_auth_user", '{"id":7}'],
    ["skriptlab_active_project_id", "7"], ["skriptlab_manuscript", "saved"], ["skriptlab_raw_text", "source"]
  ]);
  const storage = values => ({ getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) });
  let timerId = 0;
  const win = {
    Headers, Response, FormData, URL, URLSearchParams, DOMException,
    Date: class extends Date { static now() { return now; } },
    CustomEvent: class {},
    document: { readyState: "loading", addEventListener() {}, querySelectorAll: () => [], dispatchEvent() {} },
    location: { href: "https://app.example/index.html", origin: "https://app.example", pathname: "/index.html", search: "", replace: value => redirects.push(value) },
    localStorage: storage(local), sessionStorage: storage(new Map()),
    SKRIPTLAB_CONFIG: { API_BASE_URL: "https://backend.example" },
    crypto: { randomUUID: () => "retry-identity" },
    apiUrl: value => "https://backend.example" + value,
    fetch: async (url, options) => { requests.push({ url, options }); return fetcher(url, options, requests.length); },
    setTimeout(callback, delay) {
      const id = ++timerId; timers.set(id, callback); delays.push(delay);
      // Access refresh timers are unrelated to the transport retry under test.
      if (autoTimers && delay !== 250) queueMicrotask(() => {
        if (timers.delete(id)) callback();
      });
      return id;
    },
    clearTimeout: id => timers.delete(id),
  };
  win.window = win; win.parent = win;
  const context = vm.createContext(win);
  function load(file) { vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context); }
  if (auth) load("auth.js");
  if (access) load("book-access.js");
  return { win, api: win.SkriptLabAuth, access: win.SkriptLabBookAccess, requests, delays, redirects, local, timers, load };
}

test("a transient GET network failure recovers with the original signal and credentials", async () => {
  const controller = new AbortController();
  const h = harness((_url, _options, count) => {
    if (count === 1) throw new TypeError("Failed to fetch");
    return new Response('{"status":"running"}');
  });
  const response = await h.api.fetch("/api/jobs/1", { signal: controller.signal });
  assert.deepEqual(await response.json(), { status: "running" });
  assert.equal(h.requests.length, 2);
  assert.deepEqual(h.delays, [500]);
  for (const request of h.requests) {
    assert.equal(request.url, "https://backend.example/api/jobs/1");
    assert.equal(request.options.signal, controller.signal);
    assert.equal(request.options.headers.get("Authorization"), "Bearer test-token");
  }
});

test("GET gives up after exactly two retries with a readable, classified network error", async () => {
  const cause = new TypeError("Failed to fetch");
  const h = harness(() => { throw cause; });
  await assert.rejects(h.api.fetch("/api/jobs/1"), error => {
    assert.match(error.message, /^Yhteys palvelimeen katkesi/);
    assert.equal(error.code, "NETWORK_ERROR");
    assert.equal(error.retryable, true);
    assert.equal(error.cause, cause);
    return true;
  });
  assert.equal(h.requests.length, 3);
  assert.deepEqual(h.delays, [500, 1000]);
});

for (const status of [429, 502, 503, 504]) {
  test(`GET retries HTTP ${status} but returns the final response intact`, async () => {
    const responses = [];
    const h = harness(() => {
      const response = new Response('{"detail":"Unavailable"}', { status });
      responses.push(response); return response;
    });
    const response = await h.api.fetch("/api/jobs/1");
    assert.equal(h.requests.length, 3);
    assert.equal(response, responses[2]);
    assert.deepEqual(await response.json(), { detail: "Unavailable" });
    assert.equal(responses[0].bodyUsed, true, "discarded response bodies are released");
  });
}

test("HEAD and lowercase get use the same bounded read retry policy", async () => {
  for (const method of ["HEAD", "get"]) {
    const h = harness((_url, _options, count) => new Response(null, { status: count === 1 ? 503 : 200 }));
    assert.equal((await h.api.fetch("/api/jobs/1", { method })).status, 200);
    assert.equal(h.requests.length, 2);
  }
});

test("Retry-After seconds and HTTP dates are honored within a five-second bound", async () => {
  const now = Date.parse("2026-09-11T10:00:00Z");
  for (const [value, delay] of [["2", 2000], ["10000", 5000], ["Fri, 11 Sep 2026 10:00:03 GMT", 3000], ["invalid", 500], ["0", 500]]) {
    const h = harness((_url, _options, count) => new Response(null, {
      status: count === 1 ? 429 : 200, headers: { "Retry-After": value }
    }), { now });
    await h.api.fetch("/api/jobs/1");
    assert.deepEqual(h.delays, [delay], value);
  }
});

test("mutating methods are never retried for network errors or temporary HTTP responses", async () => {
  for (const method of ["POST", "PATCH", "DELETE", "PUT"]) {
    const cause = new TypeError("Failed to fetch");
    const h = harness(() => { throw cause; });
    await assert.rejects(h.api.fetch("/api/audio/productions", { method, body: "{}" }), error => error.code === "NETWORK_ERROR" && error.cause === cause);
    assert.equal(h.requests.length, 1, method);
    assert.deepEqual(h.delays, []);
    for (const status of [429, 502, 503, 504]) {
      const failed = new Response(null, { status });
      const http = harness(() => failed);
      assert.equal(await http.api.fetch("/api/audio/productions", { method, body: "{}" }), failed);
      assert.equal(http.requests.length, 1, `${method} ${status}`);
    }
  }
});

test("ordinary HTTP failures and application errors are not retried", async () => {
  for (const status of [400, 403, 404, 409, 422, 500]) {
    const h = harness(() => new Response(null, { status }));
    assert.equal((await h.api.fetch("/api/jobs/1")).status, status);
    assert.equal(h.requests.length, 1);
  }
  const error = new Error("Application failure");
  const h = harness(() => { throw error; });
  await assert.rejects(h.api.fetch("/api/jobs/1"), actual => actual === error);
  assert.equal(h.requests.length, 1);
});

test("401 immediately clears the session and redirects once", async () => {
  const h = harness(() => new Response(null, { status: 401 }));
  assert.equal((await h.api.fetch("/api/jobs/1")).status, 401);
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.redirects, ["login.html"]);
  assert.equal(h.local.size, 0);
  assert.deepEqual(h.delays, []);
});

test("AbortSignal cancels a pending backoff without sending another request", async () => {
  const controller = new AbortController();
  const h = harness(() => { throw new TypeError("Failed to fetch"); }, { autoTimers: false });
  const pending = h.api.fetch("/api/jobs/1", { signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.delays, [500]);
  controller.abort();
  await assert.rejects(pending, error => error === controller.signal.reason);
  assert.equal(h.requests.length, 1);
  assert.equal(h.timers.size, 0);
});

test("an already aborted request and a native AbortError are never retried or reclassified", async () => {
  const controller = new AbortController(); controller.abort();
  const h = harness(() => new Response(null));
  await assert.rejects(h.api.fetch("/api/jobs/1", { signal: controller.signal }), error => error === controller.signal.reason);
  assert.equal(h.requests.length, 0);
  const aborted = new DOMException("Cancelled", "AbortError");
  const active = harness(() => { throw aborted; });
  await assert.rejects(active.api.fetch("/api/jobs/1"), error => error === aborted);
  assert.equal(active.requests.length, 1);
  assert.deepEqual(active.delays, []);
});

test("an explicit AbortSignal reason is preserved even when it is null", async () => {
  const controller = new AbortController(); controller.abort(null);
  const h = harness(() => new Response(null));
  let rejected = false;
  try { await h.api.fetch("/api/jobs/1", { signal: controller.signal }); }
  catch (error) { rejected = true; assert.equal(error, null); }
  assert.equal(rejected, true);
  assert.equal(h.requests.length, 0);
});

test("plain, tuple and Headers inputs retain headers without mutating the caller", async () => {
  for (const input of [{ "X-Test": "value", authorization: "old" }, [["X-Test", "value"], ["Authorization", "old"]], new Headers({ "X-Test": "value", Authorization: "old" })]) {
    const before = Array.from(new Headers(input).entries());
    const h = harness(() => new Response(null));
    const options = { headers: input, cache: "no-store" };
    await h.api.fetch("/api/jobs/1", options);
    assert.equal(h.requests[0].options.headers.get("X-Test"), "value");
    assert.equal(h.requests[0].options.headers.get("Authorization"), "Bearer test-token");
    assert.equal(h.requests[0].options.cache, "no-store");
    assert.equal(options.headers, input);
    assert.deepEqual(Array.from(new Headers(input).entries()), before);
  }
});

test("Basic request and access refresh recover through auth without adapter recursion", async () => {
  const h = harness((_url, _options, count) => {
    if (count === 1 || count === 3) throw new TypeError("Failed to fetch");
    return new Response('{"status":"running","actions":{}}', { headers: { "Content-Type": "application/json" } });
  }, { access: true });
  assert.equal((await h.access.request("/audio/productions/7")).status, "running");
  assert.equal((await h.access.refresh()).status, "running");
  assert.equal(h.requests.length, 4);
  assert.equal(h.requests[0].url, "https://backend.example/api/audio/productions/7");
  assert.equal(h.requests[2].url, "https://backend.example/api/access/me?project_id=7");
});

test("Basic HTTP errors expose status and retryability after bounded auth retries", async () => {
  for (const status of [429, 502, 503, 504, 403]) {
    const h = harness(() => new Response('{"detail":"Service failed"}', { status }), { access: true });
    await assert.rejects(h.access.request("/audio/productions/7"), error => {
      assert.equal(error.status, status);
      assert.equal(error.code, "HTTP_ERROR");
      assert.equal(error.retryable, status !== 403);
      assert.equal(error.message, "Service failed");
      return true;
    });
    assert.equal(h.requests.length, status === 403 ? 1 : 3);
  }
});

test("Basic creation keeps access identity and does not repeat an uncertain submission", async () => {
  const cause = new TypeError("Failed to fetch");
  const h = harness(() => { throw cause; }, { access: true });
  const body = { text: "A short story" };
  await assert.rejects(h.access.request("/audio/productions", { method: "POST", body }), error => error.code === "NETWORK_ERROR" && error.cause === cause);
  assert.equal(h.requests.length, 1);
  const sent = JSON.parse(h.requests[0].options.body);
  assert.equal(sent.project_id, 7);
  assert.equal(sent.idempotency_key, "retry-identity");
  assert.equal(h.requests[0].options.headers.get("Content-Type"), "application/json");
  assert.deepEqual(body, { text: "A short story" });
});

test("Basic adapter resolves auth at call time and works when auth is unavailable", async () => {
  const h = harness(() => new Response('{"status":"running"}'), { access: true, auth: false });
  assert.equal((await h.access.request("/audio/productions/7")).status, "running");
  h.load("auth.js");
  let delegated = 0;
  const transport = h.api = h.win.SkriptLabAuth;
  const original = transport.fetch;
  transport.fetch = function (...args) { delegated += 1; return original.apply(this, args); };
  await h.access.request("/audio/productions/7");
  await h.access.refresh();
  assert.equal(delegated, 2);
  assert.equal(h.requests.length, 3);
});
