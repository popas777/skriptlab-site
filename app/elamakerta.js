/* ==========================================================================
   Elämäkerta – mobiilikäyttöliittymän logiikka
   API-sopimus:
     GET   {apiBase}/projects/{id}/biography
     PATCH {apiBase}/projects/{id}/biography        { data }
     POST  {apiBase}/projects/{id}/biography/run    { action, data, payload }
   Ilman projectId:tä toimii demotilassa (tila vain muistissa).
   ========================================================================== */

(function () {
  "use strict";

  const CONFIG = window.ELAMAKERTA_CONFIG || {};
  const API_BASE = (CONFIG.apiBase || "/api").replace(/\/$/, "");
  const doFetch = CONFIG.fetchImpl || ((url, options) => fetch(url, options));

  function getProjectId() {
    return typeof CONFIG.projectId === "function" ? CONFIG.projectId() : (CONFIG.projectId || null);
  }

  function getProjectTitle() {
    if (typeof CONFIG.projectTitle === "function") return CONFIG.projectTitle();
    return CONFIG.projectTitle || "Elämäkerta";
  }

  const MATERIAL_KINDS = {
    free_text: "Vapaa teksti",
    document_note: "Dokumenttimuistiinpano",
    interview_answer: "Haastatteluvastaus",
    photo_note: "Valokuvamuistiinpano",
    timeline_note: "Aikajanamerkintä",
  };

  const STEPS = [
    { id: "tavoite", name: "Tavoite", desc: "Tarkoitus, tyyli ja rajat", done: (s) => !!s.purpose },
    { id: "aineisto", name: "Aineisto", desc: "Muistot ja muistiinpanot", done: (s) => s.materials.length > 0 },
    { id: "analyysi", name: "Analyysi", desc: "Aikajana, henkilöt, teemat", done: (s) => !!s.analysis_report },
    { id: "kysymykset", name: "Kysymykset", desc: "Aukkojen täydennys", done: (s) => !!s.questions },
    { id: "rakenne", name: "Rakenne", desc: "Lukujen suunnitelma", done: (s) => !!s.outline },
    { id: "kirjoitus", name: "Kirjoittaminen", desc: "Luku kerrallaan", done: (s) => !!s.draft },
    { id: "hyvaksynnat", name: "Hyväksynnät", desc: "Kuittaa valmiit vaiheet", done: (s) => !!s.approval_final },
  ];

  /* ------------------------------------------------------------ tila */

  let biographyState = defaultBiographyState();
  let saveTimer = null;
  let dictation = null;
  let dictationActive = false;
  let demoState = null; // demotilan "backend"

  function defaultBiographyState() {
    return {
      purpose: "", style: "", target_length: "", interpretation_level: "",
      sensitive_handling: "", materials: [], timeline: "", people: "",
      themes: "", gaps: "", sensitive_topics: "", quality_status: "",
      analysis_report: "", questions: "", answers: "", outline: "",
      chapter_title: "", chapter_focus: "", chapter_plan: "", draft: "",
      approval_goal: false, approval_timeline: false, approval_people: false,
      approval_outline: false, approval_sensitive: false, approval_final: false,
      approval_notes: "", last_generated_action: "", last_generated_at: "",
      updated_at: "",
    };
  }

  function normalizeBiographyState(raw) {
    const base = defaultBiographyState();
    if (!raw || typeof raw !== "object") return base;
    for (const key of Object.keys(base)) {
      if (!(key in raw) || raw[key] == null) continue;
      if (key === "materials") {
        base.materials = (Array.isArray(raw.materials) ? raw.materials : [])
          .filter((m) => m && (m.text || m.title))
          .map((m) => ({
            title: String(m.title || "Nimetön aineisto"),
            kind: MATERIAL_KINDS[m.kind] ? m.kind : "free_text",
            text: String(m.text || ""),
            created_at: String(m.created_at || new Date().toISOString()),
          }));
      } else if (typeof base[key] === "boolean") {
        base[key] = !!raw[key];
      } else {
        base[key] = String(raw[key]);
      }
    }
    return base;
  }

  /* ------------------------------------------------------------ API */

  async function apiGetState() {
    const projectId = getProjectId();
    if (!projectId) {
      if (!demoState) demoState = defaultBiographyState();
      return { data: demoState };
    }
    const res = await doFetch(`${API_BASE}/projects/${projectId}/biography`);
    if (!res.ok) throw new Error(`Lataus epäonnistui (${res.status})`);
    return res.json();
  }

  async function apiSaveState(data) {
    const projectId = getProjectId();
    if (!projectId) {
      demoState = normalizeBiographyState(data);
      return { data: demoState };
    }
    const res = await doFetch(`${API_BASE}/projects/${projectId}/biography`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    });
    if (!res.ok) throw new Error(`Tallennus epäonnistui (${res.status})`);
    return res.json();
  }

  async function apiRunAction(action, data, payload) {
    const projectId = getProjectId();
    if (!projectId) return demoRunAction(action, data, payload);
    const res = await doFetch(`${API_BASE}/projects/${projectId}/biography/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, data, payload: payload || {} }),
    });
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.json()).detail || ""; } catch (e) { /* ohitetaan */ }
      throw new Error(detail || `Toiminto epäonnistui (${res.status})`);
    }
    return res.json();
  }

  // Demotila: näyttää käyttöliittymän toiminnan ilman backendiä.
  async function demoRunAction(action, data) {
    await new Promise((r) => setTimeout(r, 900));
    const titles = {
      analyze: "Elämäkerran analyysi", questions: "Tarkentavat kysymykset",
      outline: "Rakennesuunnitelma", chapter_plan: "Lukusuunnitelma", draft: "Lukuluonnos",
    };
    const result = "Demotila: yhdistä backend saadaksesi oikean tekoälytuloksen.\n\n" +
      "Tämä painike kutsuu tuotannossa reittiä POST /projects/{id}/biography/run " +
      `actionilla "${action}".`;
    demoState = normalizeBiographyState(Object.assign({}, demoState, data));
    if (action === "analyze") demoState.analysis_report = result;
    if (action === "questions") demoState.questions = result;
    if (action === "outline") demoState.outline = result;
    if (action === "chapter_plan") demoState.chapter_plan = result;
    if (action === "draft") demoState.draft = result;
    return { title: titles[action], result, data: demoState, warnings: "Demotila käytössä – ei backend-yhteyttä." };
  }

  /* ------------------------------------------------------------ apurit */

  const $ = (id) => document.getElementById(id);

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
  }

  function truncate(text, max) {
    return text.length > max ? text.slice(0, max) + "…" : text;
  }

  let toastTimer = null;
  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  function setSaveStatus(text) {
    $("save-status").textContent = text;
  }

  /* ------------------------------------------------------------ lomake <-> tila */

  const FIELD_MAP = {
    "f-purpose": "purpose", "f-style": "style", "f-target-length": "target_length",
    "f-interpretation": "interpretation_level", "f-sensitive": "sensitive_handling",
    "f-answers": "answers", "f-outline": "outline", "f-chapter-title": "chapter_title",
    "f-chapter-focus": "chapter_focus", "f-draft": "draft", "f-approval-notes": "approval_notes",
  };

  const APPROVAL_MAP = {
    "a-goal": "approval_goal", "a-timeline": "approval_timeline", "a-people": "approval_people",
    "a-outline": "approval_outline", "a-sensitive": "approval_sensitive", "a-final": "approval_final",
  };

  function collectForm() {
    for (const [id, field] of Object.entries(FIELD_MAP)) {
      const el = $(id);
      if (el) biographyState[field] = el.value;
    }
    for (const [id, field] of Object.entries(APPROVAL_MAP)) {
      const el = $(id);
      if (el) biographyState[field] = el.checked;
    }
    return biographyState;
  }

  function render() {
    $("home-project-name").textContent = getProjectTitle();
    for (const [id, field] of Object.entries(FIELD_MAP)) {
      const el = $(id);
      if (el && document.activeElement !== el) el.value = biographyState[field] || "";
    }
    for (const [id, field] of Object.entries(APPROVAL_MAP)) {
      const el = $(id);
      if (el) el.checked = !!biographyState[field];
    }
    renderPath();
    renderMaterials();
    renderAnalysis();
    renderQuestions();
    renderChapterPlan();
    syncChips();
  }

  function renderPath() {
    const list = $("path-list");
    list.innerHTML = "";
    STEPS.forEach((step, index) => {
      const done = step.done(biographyState);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "path-step" + (done ? " is-done" : "");
      btn.innerHTML =
        `<span class="step-name"><span class="step-num">${index + 1}</span>${escapeHtml(step.name)}</span>` +
        `<span class="step-status">${done ? "Valmis ✓" : escapeHtml(step.desc)}</span>`;
      btn.addEventListener("click", () => showStep(step.id));
      list.appendChild(btn);
    });
  }

  function renderMaterials() {
    const list = $("material-list");
    const materials = biographyState.materials || [];
    $("material-count").textContent = String(materials.length);
    list.innerHTML = "";
    materials.forEach((material, index) => {
      const li = document.createElement("li");
      li.className = "material-item";
      li.innerHTML =
        `<h4>${escapeHtml(material.title)}</h4>` +
        `<span class="kind">${escapeHtml(MATERIAL_KINDS[material.kind] || "Aineisto")}</span>` +
        `<p>${escapeHtml(truncate(material.text, 180))}</p>`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "material-remove";
      remove.textContent = "Poista";
      remove.addEventListener("click", () => {
        biographyState.materials.splice(index, 1);
        render();
        scheduleSave();
      });
      li.appendChild(remove);
      list.appendChild(li);
    });
  }

  function renderAnalysis() {
    const has = !!biographyState.analysis_report;
    $("analysis-result").hidden = !has;
    $("analysis-empty").hidden = has;
    $("r-timeline").textContent = biographyState.timeline;
    $("r-people").textContent = biographyState.people;
    $("r-themes").textContent = biographyState.themes;
    $("r-gaps").textContent = biographyState.gaps;
    $("r-sensitive").textContent = biographyState.sensitive_topics;
    $("r-quality").textContent = biographyState.quality_status;
    // Jos osioita ei saatu jäsennettyä, näytetään koko raportti aikajanan paikalla.
    if (has && !biographyState.timeline && !biographyState.themes) {
      $("r-timeline").textContent = biographyState.analysis_report;
    }
  }

  function renderQuestions() {
    const has = !!biographyState.questions;
    $("questions-block").hidden = !has;
    $("questions-empty").hidden = has;
    $("r-questions").textContent = biographyState.questions;
  }

  function renderChapterPlan() {
    const has = !!biographyState.chapter_plan;
    $("plan-block").hidden = !has;
    $("r-chapter-plan").textContent = biographyState.chapter_plan;
  }

  function syncChips() {
    document.querySelectorAll(".chip-row").forEach((row) => {
      const target = $(row.dataset.target);
      row.querySelectorAll(".chip").forEach((chip) => {
        chip.classList.toggle("is-selected", !!target && target.value === chip.dataset.value);
      });
    });
  }

  /* ------------------------------------------------------------ tallennus */

  function scheduleSave() {
    setSaveStatus("Tallennetaan…");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 900);
  }

  async function saveNow() {
    collectForm();
    try {
      const response = await apiSaveState(biographyState);
      biographyState = normalizeBiographyState(response.data);
      setSaveStatus(getProjectId() ? "Kaikki muutokset tallennettu ✓" : "Demotila – tila vain muistissa");
      renderPath();
    } catch (error) {
      setSaveStatus("Tallennus epäonnistui – tarkista yhteys.");
      toast(error.message || "Tallennus epäonnistui.");
    }
  }

  async function loadState() {
    try {
      const response = await apiGetState();
      biographyState = normalizeBiographyState(response.data);
      render();
      setSaveStatus(getProjectId() ? "" : "Demotila – valitse projekti SkriptLabissa.");
    } catch (error) {
      toast("Tilan lataus epäonnistui: " + error.message);
    }
  }

  /* ------------------------------------------------------------ AI-toiminnot */

  const WORKING_LABELS = {
    analyze: "Jäsennän aineistoa…",
    questions: "Laadin kysymyksiä…",
    outline: "Suunnittelen rakennetta…",
    chapter_plan: "Suunnittelen lukua…",
    draft: "Kirjoitan luonnosta…",
  };

  async function runAction(action) {
    collectForm();

    if (action !== "analyze" && !biographyState.materials.length && !biographyState.answers) {
      // Sallitaan silti, mutta muistutetaan.
    }
    if ((action === "chapter_plan" || action === "draft") && !biographyState.chapter_title) {
      toast("Anna ensin luvun otsikko.");
      showStep("kirjoitus");
      $("f-chapter-title").focus();
      return;
    }

    const payload = {
      chapter_title: biographyState.chapter_title,
      chapter_focus: biographyState.chapter_focus,
    };

    $("working-label").textContent = WORKING_LABELS[action] || "Tekoäly työskentelee…";
    $("working").hidden = false;
    document.querySelectorAll("[data-run]").forEach((b) => (b.disabled = true));

    try {
      const response = await apiRunAction(action, biographyState, payload);
      biographyState = normalizeBiographyState(response.data);
      render();
      openSheet(response.title || "Tulos", response.result || "", response.warnings);
    } catch (error) {
      toast(error.message || "Toiminto epäonnistui.");
    } finally {
      $("working").hidden = true;
      document.querySelectorAll("[data-run]").forEach((b) => (b.disabled = false));
    }
  }

  /* ------------------------------------------------------------ tulosarkki */

  function openSheet(title, content, warning) {
    $("sheet-title").textContent = title;
    $("sheet-content").textContent = content;
    const warningEl = $("sheet-warning");
    warningEl.hidden = !warning;
    warningEl.textContent = warning || "";
    $("sheet-backdrop").hidden = false;
    $("result-sheet").hidden = false;
    $("sheet-close").focus();
  }

  function closeSheet() {
    $("sheet-backdrop").hidden = true;
    $("result-sheet").hidden = true;
  }

  /* ------------------------------------------------------------ sanelu */

  function setupDictation() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const btn = $("btn-dictate");
    if (!SpeechRecognition) {
      btn.disabled = true;
      $("dictate-label").textContent = "Sanelu ei ole tuettu tässä selaimessa";
      return;
    }

    btn.addEventListener("click", () => {
      if (dictationActive) { stopDictation(); return; }
      dictation = new SpeechRecognition();
      dictation.lang = "fi-FI";
      dictation.continuous = true;
      dictation.interimResults = false;

      dictation.onresult = (event) => {
        const textarea = $("m-text");
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            const chunk = event.results[i][0].transcript.trim();
            textarea.value = (textarea.value ? textarea.value + " " : "") + chunk;
          }
        }
      };
      dictation.onerror = () => stopDictation("Sanelu keskeytyi.");
      dictation.onend = () => { if (dictationActive) stopDictation(); };

      dictation.start();
      dictationActive = true;
      btn.setAttribute("aria-pressed", "true");
      $("dictate-label").textContent = "Lopeta sanelu";
      $("dictate-hint").hidden = false;
    });
  }

  function stopDictation(message) {
    if (dictation) { try { dictation.stop(); } catch (e) { /* ohitetaan */ } }
    dictationActive = false;
    const btn = $("btn-dictate");
    btn.setAttribute("aria-pressed", "false");
    $("dictate-label").textContent = "Sanele";
    $("dictate-hint").hidden = true;
    if (message) toast(message);
  }

  /* ------------------------------------------------------------ aineisto */

  function addMaterial() {
    const title = $("m-title").value.trim();
    const text = $("m-text").value.trim();
    if (!text) { toast("Kirjoita tai sanele ensin sisältö."); $("m-text").focus(); return; }
    stopDictation();
    biographyState.materials.push({
      title: title || "Nimetön aineisto",
      kind: $("m-kind").value,
      text,
      created_at: new Date().toISOString(),
    });
    $("m-title").value = "";
    $("m-text").value = "";
    render();
    scheduleSave();
    toast("Aineisto lisätty.");
  }

  function answersToMaterials() {
    collectForm();
    const answers = biographyState.answers.trim();
    if (!answers) { toast("Kirjoita ensin vastaukset."); return; }
    biographyState.materials.push({
      title: "Haastatteluvastaukset " + new Date().toLocaleDateString("fi-FI"),
      kind: "interview_answer",
      text: answers,
      created_at: new Date().toISOString(),
    });
    biographyState.answers = "";
    render();
    scheduleSave();
    toast("Vastaukset siirretty aineistoksi.");
  }

  /* ------------------------------------------------------------ navigointi */

  function showStep(stepId) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("is-active"));
    const view = stepId === "home" ? $("view-home") : $("view-" + stepId);
    (view || $("view-home")).classList.add("is-active");
    window.scrollTo(0, 0);
    if (stepId === "home") renderPath();
  }

  /* ------------------------------------------------------------ käynnistys */

  function bindEvents() {
    // Automaattitallennus kaikista kentistä
    for (const id of Object.keys(FIELD_MAP)) {
      const el = $(id);
      if (el) el.addEventListener("input", scheduleSave);
    }
    for (const id of Object.keys(APPROVAL_MAP)) {
      const el = $(id);
      if (el) el.addEventListener("change", () => { collectForm(); renderPath(); scheduleSave(); });
    }

    // Pikavalintachipit
    document.querySelectorAll(".chip-row").forEach((row) => {
      row.addEventListener("click", (event) => {
        const chip = event.target.closest(".chip");
        if (!chip) return;
        const target = $(row.dataset.target);
        target.value = target.value === chip.dataset.value ? "" : chip.dataset.value;
        syncChips();
        scheduleSave();
      });
    });

    // Navigointi
    document.querySelectorAll("[data-back]").forEach((btn) =>
      btn.addEventListener("click", () => { stopDictation(); showStep("home"); })
    );
    document.querySelectorAll("[data-goto]").forEach((btn) =>
      btn.addEventListener("click", () => { stopDictation(); showStep(btn.dataset.goto); })
    );

    // AI-toiminnot
    document.querySelectorAll("[data-run]").forEach((btn) =>
      btn.addEventListener("click", () => runAction(btn.dataset.run))
    );

    // Aineisto ja sanelu
    $("btn-add-material").addEventListener("click", addMaterial);
    $("btn-answers-to-materials").addEventListener("click", answersToMaterials);

    // Tulosarkki
    $("sheet-close").addEventListener("click", closeSheet);
    $("sheet-backdrop").addEventListener("click", closeSheet);
  }

  window.ElamakertaModule = {
    loadState,
    render,
    getState: () => biographyState,
  };

  document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    setupDictation();
    loadState();
  });
})();
