(function (root, factory) {
  "use strict";
  const access = factory(root);
  if (typeof module === "object" && module.exports) module.exports = access;
  if (root) root.SkriptLabBookAccess = access;
})(typeof window !== "undefined" ? window : null, function (win) {
  "use strict";
  const labels = {
    "book.create": "Toinen kirja", "analysis.run": "Analyysi", "development_feedback.run": "Kehityspalaute",
    "proofread.run": "Koko kirjan oikoluku", "text.improve": "Tekstin parantelu", "cover.generate_batch": "Kolme kansiehdotusta",
    "cover.upload": "Oman kansikuvan tuonti", "cover.compose": "Kannen tekstien sommittelu", "cover.print": "Painokansi",
    "layout.epub": "E-kirjan taitto", "layout.print": "Painotaitto", "audio.produce": "Äänikirja", "audio.preview": "Äänitesti",
    "audio.repair": "Äänikirjan osan korjaus", "publication.publish": "Julkaisu kirjastoon", "marketing.campaign": "Kampanja",
    "translation.run": "Käännökset", "manuscript.edit": "Tekstin muokkaus", "versions.manage": "Versiot"
  };
  const moduleLabels = { manuscripts: "Tekstini", analysis: "Analyysin lisätyökalut", development_editing: "Kehityspalautteen lisätyökalut",
    write_edit: "Editorin lisätyökalut", proofread: "Tekstin parantelu", translation_finishing: "Viimeistelyn lisätyökalut",
    cover_illustration: "Grafiikan lisätyökalut", book_layout: "Taiton lisätyökalut", publication_package: "Tiedostopaketit",
    audio: "Audion lisätyökalut", marketing: "Markkinointi", translations: "Käännökset", translation_workspace: "Automaattikäännökset",
    skill: "Skill", video: "Videostudio", world_studio: "3D-studio", notebooklm: "NotebookLM", biography: "Elämäkerta",
    contracts: "Sopimukset", timeline: "Aikajana", support_materials: "Oheisaineistot", ai_workflow: "Työnkulkustudio",
    multilingual_publication: "Kieliversiot", published_library: "Kirjasto", correction_reprints: "Uusintapainokset", publish: "Painatus" };
  const views = {
    "view-kirjani": "manuscripts", "view-analyysi": "analysis", "view-kehityseditointi": "development_editing",
    "view-kirjoita-editoi": "write_edit", "view-mobiilieditori": "write_edit", "view-oikoluku": "proofread",
    "view-kaannoksen-viimeistely": "translation_finishing", "view-kuvitus": "cover_illustration", "view-taitto": "book_layout",
    "view-oheisaineistot": "support_materials", "view-julkaisupaketti": "publication_package", "view-audio": "audio",
    "view-markkinointi": "marketing", "view-kaannokset": "translations", "view-suomentaja": "translations",
    "view-kaannostyotila": "translation_workspace", "view-skill": "skill", "view-video": "video", "view-3d-studio": "world_studio",
    "view-notebooklm": "notebooklm", "view-elamakerta": "biography", "view-sopimukset": "contracts", "view-aikajana": "timeline",
    "view-ai-tyonkulku": "ai_workflow", "view-monikielinen-julkaisu": "multilingual_publication", "view-julkaise": "publish"
  };
  function label(action) { return labels[action] || moduleLabels[String(action).replace(/^module\./, "")] || "Lisätoiminto"; }
  function actionForRequest(path, method, body) {
    if (!["POST", "PUT", "PATCH"].includes(String(method || "GET").toUpperCase())) return null;
    path = String(path).split("?")[0].replace(/^.*\/api\//, "/");
    if (/^\/access\//.test(path) || /^\/admin\//.test(path)) return null;
    if (path === "/projects") return body?.id ? "manuscript.edit" : "book.create";
    if (/\/projects\/import(?:-file)?$/.test(path)) return "book.create";
    if (/\/basic-production\/cover-candidates$/.test(path)) return "cover.generate_batch";
    if (/\/basic-production\/cover-composition$/.test(path)) return "cover.compose";
    if (/\/basic-production\/publish$/.test(path)) return "publication.publish";
    if (/\/cover-images\/upload$/.test(path)) return "cover.upload";
    if (/\/cover-images$/.test(path)) return "module.cover_illustration";
    if (/\/cover-layout$/.test(path)) return "cover.print";
    if (/\/layout\/run$/.test(path)) return Array.isArray(body?.output_formats) && body.output_formats.every(f => f === "epub") ? "layout.epub" : "layout.print";
    if (/\/publication-package\/build$/.test(path)) return "module.publication_package";
    if (/^\/analyze(?:\/jobs)?$/.test(path)) return "analysis.run";
    if (/\/development-editing(?:\/run)?$/.test(path)) return "development_feedback.run";
    if (/\/development-feedback\/run$/.test(path)) return "development_feedback.run";
    if (/\/proofread\/run$/.test(path)) return "proofread.run";
    if (["/edit", "/edit/stream", "/edit/actions"].includes(path)) {
      if (body?.purpose === "development_editing") return "development_feedback.run";
      if (["analysis", "analysis_structure"].includes(body?.purpose)) return "module.analysis";
      return body?.proofread_run_id ? null : "text.improve";
    }
    if (path === "/write-editor/chat" || path === "/proofread/improve-selection" || /\/text-improvement\//.test(path)) return body?.proofread_run_id ? null : "text.improve";
    if (/\/audio\/(?:gemini-tts-preview|tts-preview)$/.test(path)) return "audio.preview";
    if (path === "/audio/narration-prompt") return "module.audio";
    if (path === "/audio/productions") return "audio.produce";
    if (/\/audio\/productions\/\d+\/parts\/\d+\/regenerate$/.test(path)) return "audio.repair";
    if (/^\/marketing\//.test(path) && !/\/context$/.test(path)) return "marketing.campaign";
    if (/^\/(?:translate|translations)(?:\/|$)/.test(path) && !/(?:download|export|cancel|resume)$/.test(path)) return "translation.run";
    return null;
  }
  function accessDecision(snapshot, action) {
    if (!snapshot) return { allowed: false, reason: "loading" };
    const item = snapshot.actions?.[action];
    return item || { allowed: false, reason: "feature_locked" };
  }
  function denialMessage(action, decision = {}) {
    if (decision.message) return decision.message;
    const reason = decision.code || decision.reason;
    if (reason === "feature_locked" || decision.limit === 0) return label(action) + " ei sisälly nykyiseen pakettiisi.";
    if (reason === "job_in_progress" || decision.reserved > 0) return label(action) + ": käyttökerta on käynnissä. Voit seurata tai jatkaa samaa työtä sen omassa näkymässä.";
    if (reason === "quota_exhausted" || decision.remaining === 0) return label(action) + ": pakettiin sisältyvät käyttökerrat on käytetty.";
    return label(action) + " ei sisälly nykyiseen pakettiisi.";
  }
  function tabAccessDecision(snapshot, action) {
    const direct = accessDecision(snapshot, action);
    if (direct.allowed) return direct;
    const includedWith = { "module.marketing": "marketing.campaign", "module.translations": "translation.run", "module.translation_workspace": "translation.run", "module.translation_finishing": "translation.run" };
    const purchased = accessDecision(snapshot, includedWith[action] || action);
    // A consumed add-on still exposes its existing results. New operations keep
    // using accessDecision and the authoritative server usage guard.
    return purchased.allowed || (Number(purchased.limit) > 0 && [null, undefined, "quota_exhausted", "job_in_progress"].includes(purchased.reason))
      ? { ...purchased, allowed: true } : direct;
  }
  function withRequestContext(body, projectId, key) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return body;
    return { ...body, ...(projectId && !body.project_id ? { project_id: Number(projectId) } : {}),
      ...(key && !body.idempotency_key ? { idempotency_key: key } : {}) };
  }
  const api = { label, actionForRequest, accessDecision, tabAccessDecision, denialMessage, withRequestContext, views };
  if (!win) return api;
  const doc = win.document;
  const rawFetch = win.fetch.bind(win);
  let snapshot = null, loadedProject = null, refreshing = null, refreshTimer = null, modal = null, modalReturn = null;
  const keys = new Map();
  const projectId = () => {
    let parentId = null;
    try { if (win.parent !== win) parentId = win.parent.manuscriptData?.id; } catch (_) { /* standalone cross-origin embedding */ }
    return Number(win.manuscriptData?.id || parentId || win.localStorage.getItem("skriptlab_active_project_id") || new URLSearchParams(win.location.search).get("project")) || null;
  };
  const apiRoot = () => String(win.SKRIPTLAB_CONFIG?.API_BASE_URL || "").replace(/\/$/, "");
  function keyFor(action, scope = "") {
    const storageKey = "skriptlab_action:" + projectId() + ":" + action + ":" + scope;
    let value = win.sessionStorage.getItem(storageKey);
    if (!value) { value = win.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2); win.sessionStorage.setItem(storageKey, value); }
    keys.set(value, storageKey);
    return value;
  }
  function completeKey(key) { const storageKey = keys.get(key); if (storageKey) win.sessionStorage.removeItem(storageKey); keys.delete(key); }
  function keyForRun(action, scope, previous) {
    if (previous?.can_resume && previous.idempotency_key) return previous.idempotency_key;
    let identity = keyFor(action, scope);
    if (previous?.can_resume === false && ["failed", "interrupted"].includes(previous.status) && previous.idempotency_key === identity) {
      completeKey(identity); identity = keyFor(action, scope);
    }
    return identity;
  }
  function escape(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function fetchApi(path, options) {
    return win.SkriptLabAuth?.fetch
      ? win.SkriptLabAuth.fetch("/api" + path, options)
      : win.fetch(apiRoot() + "/api" + path, options);
  }
  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const token = win.localStorage.getItem("skriptlab_auth_token");
    if (token) headers.set("Authorization", "Bearer " + token);
    if (options.body && typeof options.body !== "string" && !(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json"); options = { ...options, body: JSON.stringify(options.body) };
    }
    const response = await fetchApi(path, { ...options, headers });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})); const detail = body.detail;
      const error = new Error(typeof detail === "string" ? detail : detail?.message || "Pyyntö epäonnistui.");
      error.status = response.status;
      error.code = "HTTP_ERROR";
      error.retryable = [429, 502, 503, 504].includes(response.status);
      throw error;
    }
    if (options.blob) return response.blob();
    return response.status === 204 ? null : response.json();
  }
  async function refresh(force = false) {
    const id = projectId();
    if (!win.localStorage.getItem("skriptlab_auth_token")) return null;
    if (refreshing && loadedProject === id) return refreshing;
    if (!force && snapshot && loadedProject === id) return snapshot;
    if (loadedProject !== id) snapshot = null;
    loadedProject = id;
    refreshing = (async () => {
      try {
        const response = await fetchApi("/access/me" + (id ? "?project_id=" + id : ""), {
          headers: { Authorization: "Bearer " + win.localStorage.getItem("skriptlab_auth_token") }
        });
        if (!response.ok) throw new Error("Käyttöoikeuksien lataaminen epäonnistui.");
        const data = await response.json();
        if (id !== projectId()) return null;
        snapshot = data; decorate(); doc.dispatchEvent(new CustomEvent("skriptlab:access", { detail: data }));
        return snapshot;
      } catch (error) {
        if (id === projectId()) { snapshot = null; decorate(); }
        return null;
      } finally { refreshing = null; }
    })();
    return refreshing;
  }
  function scheduleRefresh() { win.clearTimeout(refreshTimer); refreshTimer = win.setTimeout(() => refresh(true), 250); }
  async function ensure(action, options = {}) {
    await refresh();
    const decision = options.tab ? tabAccessDecision(snapshot, action) : accessDecision(snapshot, action);
    if (decision.allowed) return true;
    showUpgrade(action, decision); return false;
  }
  function closeUpgrade() { if (!modal) return; modal.close(); modalReturn?.focus?.(); }
  function showUpgrade(action, detail = {}) {
    if (win.parent !== win && win.parent.SkriptLabBookAccess) { win.parent.SkriptLabBookAccess.showUpgrade(action, detail); return; }
    if (!modal) {
      modal = doc.createElement("dialog"); modal.className = "book-access-dialog"; modal.setAttribute("aria-labelledby", "book-access-title");
      modal.innerHTML = '<form method="dialog"><button class="book-access-close" aria-label="Sulje">×</button></form><p class="book-access-eyebrow">Käyttöoikeudet</p><h2 id="book-access-title">Päivitä tilauksesi</h2><p id="book-access-explanation"></p><p class="book-access-note">Voit pyytää lisätoiminnon tai laajemman tilauksen ylläpidolta. Pyyntö ei ole ostos eikä siitä veloiteta.</p><label>Lisätieto <textarea id="book-access-message" rows="3" maxlength="2000" placeholder="Kerro tarvittaessa, mitä tarvitset."></textarea></label><div class="book-access-buttons"><button type="button" id="book-access-request">Pyydä lisätoimintoa</button><button type="button" id="book-access-plan">Pyydä tilauksen päivitystä</button></div><p id="book-access-request-status" role="status" aria-live="polite"></p>';
      doc.body.append(modal);
      modal.addEventListener("close", () => modalReturn?.focus?.());
      modal.addEventListener("click", event => { if (event.target === modal) closeUpgrade(); });
      for (const [id, upgrade] of [["book-access-request", false], ["book-access-plan", true]]) doc.getElementById(id).addEventListener("click", async () => {
        const button = doc.getElementById(id); const status = doc.getElementById("book-access-request-status"); button.disabled = true;
        try {
          await request("/access/requests", { method: "POST", body: { project_id: projectId(), action: modal.dataset.action,
            message: (upgrade ? "Pyydän laajempaa tilausta. " : "") + doc.getElementById("book-access-message").value.trim() } });
          status.textContent = "Pyyntö lähetetty ylläpidolle. Voit jatkaa teoksesi työstämistä.";
          doc.getElementById("book-access-request").disabled = true; doc.getElementById("book-access-plan").disabled = true;
        } catch (error) { status.textContent = error.message; button.disabled = false; }
      });
    }
    modalReturn = doc.activeElement; modal.dataset.action = action;
    const decision = snapshot?.actions?.[action] || detail;
    const unavailable = (!snapshot && !detail.code && !detail.message) || detail.reason === "loading";
    doc.getElementById("book-access-title").textContent = unavailable ? "Käyttöoikeuksia ei saatu ladattua" : "Päivitä tilauksesi";
    doc.getElementById("book-access-explanation").textContent = unavailable
      ? "Päivitä näkymä ja yritä uudelleen. Tekstisi ja aiemmat tulokset säilyvät."
      : detail.message || denialMessage(action, decision);
    doc.getElementById("book-access-message").value = ""; doc.getElementById("book-access-request-status").textContent = "";
    doc.getElementById("book-access-request").disabled = unavailable; doc.getElementById("book-access-plan").disabled = unavailable;
    if (!modal.open) modal.showModal();
  }
  function decorate() {
    doc.querySelectorAll("[data-access-action]").forEach(element => {
      const decision = element.getAttribute("role") === "tab" ? tabAccessDecision(snapshot, element.dataset.accessAction) : accessDecision(snapshot, element.dataset.accessAction);
      element.classList.toggle("book-access-locked", Boolean(snapshot && !decision.allowed));
      if (snapshot && !decision.allowed) { element.setAttribute("aria-disabled", "true"); element.title = label(element.dataset.accessAction) + " · päivitä tilauksesi"; }
      else { element.removeAttribute("aria-disabled"); if (element.title?.includes("päivitä tilauksesi")) element.removeAttribute("title"); }
    });
    doc.querySelectorAll("[data-access-usage]").forEach(element => {
      const item = snapshot?.actions?.[element.dataset.accessUsage];
      element.textContent = !snapshot ? "Käyttöoikeuksia ladataan…" : !item ? "Lisäpalvelu" : item.limit == null ? (item.allowed ? "Sisältyy pakettiin" : "Lisäpalvelu")
        : `${item.remaining ?? 0}/${item.limit} käyttökertaa jäljellä${item.reserved ? " · työ käynnissä" : ""}`;
    });
    doc.querySelectorAll("[data-access-summary]").forEach(element => {
      element.textContent = !snapshot ? "Ladataan pakettia…" : snapshot.max_words
        ? `Perustoiminnot käytössä enintään ${Number(snapshot.max_words).toLocaleString("fi-FI").replace(/\u00a0/g, " ")} sanan tekstille.`
        : snapshot.plan_name;
    });
    doc.querySelectorAll("[data-access-plan]").forEach(element => {
      element.textContent = snapshot ? `${snapshot.plan_name}${snapshot.max_words ? " · enintään " + Number(snapshot.max_words).toLocaleString("fi-FI") + " sanaa" : ""}` : "Ladataan pakettia…";
    });
  }
  // Every request still reaches the server's authoritative entitlement guard.
  // This adapter supplies retry identities and turns structured denials into the same dialog in every iframe.
  win.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input?.url || String(input);
    const config = { ...(init || {}) };
    const method = String(config.method || input?.method || "GET").toUpperCase();
    let payload = null, action = null, identity = null;
    if (typeof config.body === "string") { try { payload = JSON.parse(config.body); } catch (_) { /* non-JSON bodies are untouched */ } }
    let requestPath = "";
    try { const parsed = new URL(url, win.location.href); const backend = new URL(apiRoot() || win.location.origin, win.location.href); if (parsed.origin === backend.origin) requestPath = parsed.pathname; } catch (_) { /* non-URL inputs are untouched */ }
    if (requestPath.startsWith("/api/")) action = actionForRequest(requestPath, method, payload);
    if (action && payload) {
      identity = payload.idempotency_key || keyFor(action, requestPath + ":" + hash(JSON.stringify(payload)));
      const routeProject = requestPath.match(/\/projects\/(\d+)(?:\/|$)/)?.[1];
      config.body = JSON.stringify(withRequestContext(payload, routeProject || projectId(), identity));
    }
    const response = await rawFetch(input, config);
    if (requestPath.startsWith("/api/") && !response.ok && [402, 403, 409, 422, 429].includes(response.status)) {
      const data = await response.clone().json().catch(() => null);
      const detail = data?.detail;
      if (detail && typeof detail === "object" && ["feature_locked", "quota_exhausted", "book_limit_reached", "input_limit"].includes(detail.code)) {
        if (!["GET", "HEAD"].includes(method)) showUpgrade(detail.action || action || "book.create", detail);
        scheduleRefresh();
        return new Response(JSON.stringify({ ...data, detail: detail.message || label(detail.action) + ": käyttöoikeus puuttuu.", access_error: detail }), {
          status: response.status, statusText: response.statusText, headers: response.headers
        });
      }
    }
    if (action && response.ok) {
      const streaming = /text\/event-stream|application\/x-ndjson/i.test(response.headers.get("Content-Type") || "");
      const data = /application\/json/i.test(response.headers.get("Content-Type") || "")
        ? await response.clone().json().catch(() => null) : null;
      // Never consume an SSE body before returning it to the streaming editor.
      if (!streaming && (!data || !["pending", "queued", "running"].includes(data.status || data.job?.status))) completeKey(identity);
      scheduleRefresh();
    }
    return response;
  };
  function hash(value) { let result = 2166136261; for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619); return (result >>> 0).toString(36); }
  function mark(selector, action) { doc.querySelectorAll(selector).forEach(el => { el.dataset.accessAction = action; }); }
  function guardTab(action) {
    if (tabAccessDecision(snapshot, action).allowed) return true;
    if (snapshot) showUpgrade(action);
    return false;
  }
  function registerExisting() {
    const controls = {
      "#btn-upload, #btn-new-empty, #manuscript-upload-btn": "book.create",
      "#btn-run-analysis, #run-analysis-btn": "analysis.run", "#development-run-btn": "development_feedback.run",
      "#knowledge-extract-btn": "module.development_editing", "#cover-generate-btn": "module.cover_illustration",
      "#cover-upload-btn": "cover.upload", "#cover-layout-generate-btn": "cover.print",
      "#tab-kirja, #tab-taitto": "layout.print",
      "#audio-production-start-btn, #audio-production-batch-start-btn": "audio.produce",
      "#audio-production-chunks-toggle, #audio-production-script-open-btn": "module.audio",
      "#audio-gemini-test-btn, #audio-test-voice-btn, #audio-narration-test-btn": "audio.preview",
      "#audio-narration-suggest-btn": "module.audio",
      "#publication-package-build-btn": "module.publication_package", "#chat-send, [data-task], #ti-generate": "text.improve",
      "#ti-chapter-generate": "module.proofread",
      "#analysis-tab-knowledge, #analysis-tab-metadata, #analysis-open-knowledge": "module.analysis",
      '[data-assistant-tab="tasks"]': "module.write_edit", '[data-ti-mode="translation"]': "translation.run",
      '[data-kf-mode="translation"]': "translation.run", ".graphics-tab:not(:first-child)": "module.cover_illustration",
      ".audio-workspace-tab:not(:first-child)": "module.audio", ".marketing-workspace-tab:not(:first-child)": "module.marketing",
      ".video-workspace-tabs button:not(:first-child)": "module.video", ".suomentaja-tab:not(:first-child)": "module.translations",
      ".translation-workspace-stage:not(:first-child)": "module.translation_workspace", ".biography-tab:not(:first-child)": "module.biography",
      "#marketing-generate-btn, #marketing-campaign-generate-btn, #marketing-html-generate-btn": "marketing.campaign"
    };
    Object.entries(controls).forEach(([selector, action]) => mark(selector, action));
    const iframeModules = { "manuskripti.html": "analysis", "kirjoita-editoi.html": "write_edit", "tekstin-parantelu.html": "proofread",
      "kaannoksen-viimeistely.html": "translation_finishing", "tuotanto.html": "book_layout", "animation.html": "video",
      "screenplay.html": "video", "video.html": "video", "shorts.html": "video", "world-studio.html": "world_studio",
      "elamakerta.html": "biography", "notebooklm.html": "notebooklm", "sopimukset.html": "contracts" };
    doc.querySelectorAll("[role=tablist]").forEach(list => {
      const moduleKey = views[list.closest(".view-section")?.id] || iframeModules[win.location.pathname.split("/").pop()];
      if (!moduleKey) return;
      Array.from(list.querySelectorAll('[role="tab"]')).slice(1).forEach(tab => { if (!tab.dataset.accessAction) tab.dataset.accessAction = "module." + moduleKey; });
    });
    decorate();
  }
  function init() {
    doc.addEventListener("click", async event => {
      const control = event.target.closest?.("[data-access-action]");
      if (!control || control.dataset.accessReplaying === "true") return;
      const action = control.dataset.accessAction;
      const tab = control.getAttribute("role") === "tab";
      if (snapshot && (tab ? tabAccessDecision(snapshot, action) : accessDecision(snapshot, action)).allowed) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (await ensure(action, { tab })) { control.dataset.accessReplaying = "true"; control.click(); delete control.dataset.accessReplaying; }
    }, true);
    doc.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const control = event.target.closest?.('[role="tab"]'); const list = control?.closest('[role="tablist"]');
      if (!list) return;
      const tabs = Array.from(list.querySelectorAll('[role="tab"]')).filter(tab => !tab.hidden);
      const i = tabs.indexOf(control);
      const next = tabs[event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (i + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
      if (next?.dataset.accessAction && !tabAccessDecision(snapshot, next.dataset.accessAction).allowed) {
        event.preventDefault(); event.stopImmediatePropagation(); next.focus(); showUpgrade(next.dataset.accessAction);
      }
    }, true);
    registerExisting(); refresh();
    win.addEventListener("storage", event => { if (["skriptlab_active_project_id", "skriptlab_auth_user"].includes(event.key)) refresh(true); });
    win.addEventListener("focus", () => refresh(true));
    win.addEventListener("message", event => { if (event.origin === win.location.origin && event.data?.type === "skriptlab:access-refresh") refresh(true); });
  }
  Object.assign(api, { request, refresh, ensure, showUpgrade, closeUpgrade, decorate, mark, guardTab, registerExisting, keyFor, keyForRun, completeKey,
    projectId, escape, getSnapshot: () => snapshot, isBasic: () => snapshot?.plan_key === "writer_basic" });
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init); else init();
  return api;
});
