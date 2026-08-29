/* ==========================================================================
   Elämäkerta – itsenäinen elämäkerta-, omaelämäkerta- ja opastyötila
   ========================================================================== */

(function () {
  "use strict";

  const CONFIG = window.ELAMAKERTA_CONFIG || {};
  const API_BASE = (CONFIG.apiBase || "/api").replace(/\/$/, "");
  const doFetch = CONFIG.fetchImpl || ((url, options) => fetch(url, options));
  const MODULE_PROJECT_KEY = "skriptlab_biography_project_id";
  const LEGACY_ANSWERS_SESSION_ID = "legacy_answers_session_v1";
  const LEGACY_ANSWERS_MATERIAL_ID = "legacy_answers_material_v1";
  const LEGACY_ANSWERS_QUESTION = "Aiemmat haastatteluvastaukset";

  const MATERIAL_KINDS = {
    free_text: "Vapaa teksti",
    document_note: "Dokumenttimuistiinpano",
    interview_answer: "Haastatteluvastaus",
    photo_note: "Valokuvamuistiinpano",
    timeline_note: "Aikajanamerkintä",
  };

  const STEPS = [
    { id: "start", label: "Aloitus", done: (state) => Boolean(state.purpose || state.interview_sessions.length || state.materials.length) },
    { id: "interview", label: "Haastattelu", done: (state) => answeredQuestionCount(state) > 0 },
    { id: "materials", label: "Aineisto", done: (state) => state.materials.length > 0 },
    { id: "outline", label: "Rakenne", done: (state) => Boolean(state.analysis_report || state.outline) },
    { id: "chapters", label: "Luvut", done: (state) => state.chapters.some((chapter) => chapter.draft.trim()) },
    { id: "manuscript", label: "Käsikirjoitus", done: (state) => Boolean(state.manuscript_text.trim()) },
  ];
  const STEP_IDS = new Set(STEPS.map((step) => step.id));
  const STEP_ALIASES = {
    aloitus: "start", tavoite: "start", haastattelu: "interview", kysymykset: "interview",
    aineisto: "materials", analyysi: "outline", rakenne: "outline", luvut: "chapters",
    kirjoitus: "chapters", kasikirjoitus: "manuscript", "käsikirjoitus": "manuscript",
    hyvaksynnat: "manuscript",
  };
  const MODE_PRESETS = {
    biography: [
      "Mikä hetki kuvaa päähenkilöä kaikkein parhaiten?",
      "Millainen oli paikka, jossa päähenkilö kasvoi?",
      "Kuka vaikutti hänen elämäänsä ratkaisevasti?",
      "Mikä käänne muutti hänen elämänsä suunnan?",
    ],
    autobiography: [
      "Kerro hetkestä, jota et koskaan unohda.",
      "Millainen oli paikka, jossa kasvoit?",
      "Kuka ihminen muutti sinua ja miten?",
      "Milloin tunsit ensimmäisen kerran olevasi omalla tielläsi?",
    ],
    first_person_guide: [
      "Mikä oma kokemuksesi sai sinut kirjoittamaan tämän oppaan?",
      "Mitä olisit itse halunnut tietää aloittaessasi?",
      "Millainen tilanne havainnollistaa menetelmääsi parhaiten?",
      "Mikä virhe opetti sinulle kaikkein eniten?",
    ],
  };
  const MODE_STARTERS = {
    biography: [
      { label: "Ratkaiseva hetki", question: "Mikä hetki kuvaa päähenkilöä kaikkein parhaiten?", icon: "star" },
      { label: "Kasvuympäristö", question: "Millainen oli paikka, jossa päähenkilö kasvoi?", icon: "map-pin" },
      { label: "Tärkeä ihminen", question: "Kuka vaikutti hänen elämäänsä ratkaisevasti?", icon: "user" },
    ],
    autobiography: [
      { label: "Hetki, jota en unohda", question: "Kerro hetkestä, jota et koskaan unohda.", icon: "star" },
      { label: "Paikka, jossa kasvoin", question: "Millainen oli paikka, jossa kasvoit?", icon: "map-pin" },
      { label: "Ihminen, joka muutti minua", question: "Kuka ihminen muutti sinua ja miten?", icon: "user" },
    ],
    first_person_guide: [
      { label: "Miksi opetan tätä", question: "Mikä oma kokemuksesi sai sinut kirjoittamaan tämän oppaan?", icon: "compass" },
      { label: "Mitä olisin halunnut tietää", question: "Mitä olisit itse halunnut tietää aloittaessasi?", icon: "lightbulb" },
      { label: "Kokemus käytännössä", question: "Millainen tilanne havainnollistaa menetelmääsi parhaiten?", icon: "path" },
    ],
  };

  const TRANSCRIPTION_LANGUAGE_CODE = "fi-FI";
  const TRANSCRIPTION_SAMPLE_RATE = 16000;
  const MAX_RECORDING_SECONDS = 10 * 60;
  const MAX_RECORDING_SAMPLES = TRANSCRIPTION_SAMPLE_RATE * MAX_RECORDING_SECONDS;
  const MAX_AUDIO_FILE_BYTES = 25 * 1024 * 1024;
  const SUPPORTED_AUDIO_EXTENSIONS = new Set(["wav", "mp3", "aiff", "aif", "aac", "ogg", "flac"]);
  const SUPPORTED_AUDIO_MIME_TYPES = new Set([
    "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/aiff",
    "audio/x-aiff", "audio/aac", "audio/ogg", "audio/flac", "audio/x-flac",
  ]);

  const $ = (id) => document.getElementById(id);
  let biographyState = defaultBiographyState();
  let projects = [];
  let activeProject = null;
  let activeProjectId = null;
  let selectedSessionId = null;
  let selectedChapterId = null;
  let editingMaterialId = null;
  let saveTimer = null;
  let stateRevision = 0;
  let dirtyState = false;
  const serializedSaveQueue = createSerialQueue();
  let pendingSaveCount = 0;
  let activeLoad = null;
  let projectSelectionRevision = 0;
  let toastTimer = null;
  let modalReturnFocus = null;
  let transcriptionPhase = "idle";
  let recordingSupported = false;
  let recordingStream = null;
  let recordingContext = null;
  let recordingSource = null;
  let recordingProcessor = null;
  let recordingSilentGain = null;
  let recordingTimer = null;
  let recordingPcmChunks = [];
  let recordingPcmLength = 0;
  let recordingResampler = null;
  let recordingLimitStopRequested = false;
  let transcriptionController = null;

  function defaultBiographyState() {
    return {
      project_mode: "autobiography",
      narrative_perspective: "first_person",
      active_step: "start",
      current_question: "Kerro hetkestä, jota et koskaan unohda.",
      interview_draft: "",
      interview_sessions: [],
      chapters: [],
      manuscript_title: "Minun tarinani",
      manuscript_text: "",
      purpose: "",
      style: "Lämmin ja kerronnallinen",
      target_length: "",
      interpretation_level: "",
      sensitive_handling: "",
      materials: [],
      timeline: "",
      people: "",
      themes: "",
      gaps: "",
      sensitive_topics: "",
      quality_status: "",
      analysis_report: "",
      questions: "",
      answers: "",
      outline: "",
      chapter_title: "",
      chapter_focus: "",
      chapter_plan: "",
      draft: "",
      approval_goal: false,
      approval_timeline: false,
      approval_people: false,
      approval_outline: false,
      approval_sensitive: false,
      approval_final: false,
      approval_notes: "",
      last_generated_action: "",
      last_generated_at: "",
      updated_at: "",
    };
  }

  function stableId(prefix) {
    if (window.crypto?.randomUUID) return `${prefix}_${window.crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function createSerialQueue() {
    let tail = Promise.resolve();
    return {
      add(task) {
        const next = tail.catch(() => null).then(task);
        tail = next;
        return next;
      },
      flush() {
        return tail;
      },
    };
  }

  function applyProjectMode(state, mode) {
    if (!MODE_PRESETS[mode]) return state;
    state.project_mode = mode;
    state.narrative_perspective = mode === "biography" ? "third_person" : "first_person";
    state.current_question = MODE_PRESETS[mode][0];
    return state;
  }

  function rebuildLegacyAnswers(state) {
    state.answers = state.interview_sessions
      .flatMap((session) => session.answers.map((answer) => `${answer.question}\n${answer.text}`.trim()))
      .filter(Boolean)
      .join("\n\n");
    return state.answers;
  }

  function appendInterviewAnswerToState(state, payload) {
    const now = payload.created_at || new Date().toISOString();
    let session = state.interview_sessions.find((item) => item.id === payload.session_id);
    if (!session) {
      session = normalizeSession({
        id: payload.session_id || stableId("session"),
        title: `Istunto ${state.interview_sessions.length + 1}`,
        started_at: now,
      }, state.interview_sessions.length);
      state.interview_sessions.push(session);
    }
    const question = String(payload.question || state.current_question || "");
    const text = String(payload.answer || "").trim();
    if (question && !session.questions.includes(question)) session.questions.push(question);
    if (text && !session.answers.some((answer) => answer.question === question && answer.text === text)) {
      session.answers.push({ question, text, created_at: now });
    }
    session.updated_at = now;
    if (text && !state.materials.some((material) => (
      material.kind === "interview_answer" && material.session_id === session.id
      && material.question === question && material.text === text
    ))) {
      state.materials.push({
        id: payload.material_id || stableId("material"),
        title: truncate(question, 72) || "Haastatteluvastaus",
        kind: "interview_answer",
        text,
        created_at: now,
        session_id: session.id,
        question,
      });
    }
    rebuildLegacyAnswers(state);
    return session;
  }

  function removeMaterialFromState(state, materialId) {
    const material = state.materials.find((item) => item.id === materialId);
    if (!material) return null;
    state.materials = state.materials.filter((item) => item.id !== materialId);
    if (material.kind === "interview_answer" && material.session_id) {
      const session = state.interview_sessions.find((item) => item.id === material.session_id);
      if (session) {
        session.answers = session.answers.filter((answer) => !(
          answer.question === material.question && answer.text === material.text
        ));
        session.updated_at = new Date().toISOString();
      }
      rebuildLegacyAnswers(state);
    }
    return material;
  }

  function updateMaterialInState(state, materialId, updates) {
    const material = state.materials.find((item) => item.id === materialId);
    if (!material) return null;
    const oldText = material.text;
    const linkedSession = material.kind === "interview_answer" && material.session_id
      ? state.interview_sessions.find((session) => session.id === material.session_id)
      : null;
    material.title = String(updates.title || material.title);
    material.text = String(updates.text || "");
    material.kind = linkedSession ? "interview_answer" : (MATERIAL_KINDS[updates.kind] ? updates.kind : material.kind);
    if (linkedSession) {
      const answer = linkedSession.answers.find((item) => item.question === material.question && item.text === oldText);
      if (answer) answer.text = material.text;
      linkedSession.updated_at = new Date().toISOString();
      rebuildLegacyAnswers(state);
    }
    return material;
  }

  function appendChapterToState(state, chapterId, now) {
    const chapter = {
      id: chapterId || stableId("chapter"),
      title: `Luku ${state.chapters.length + 1}`,
      focus: "",
      plan: "",
      draft: "",
      status: "planned",
      order: state.chapters.length,
      updated_at: now || new Date().toISOString(),
    };
    state.chapters.push(chapter);
    return chapter;
  }

  function removeChapterFromState(state, chapterId) {
    const index = state.chapters.findIndex((chapter) => chapter.id === chapterId);
    if (index < 0) return -1;
    state.chapters.splice(index, 1);
    state.chapters.forEach((chapter, order) => { chapter.order = order; });
    return index;
  }

  function resolveInitialProject(allProjects, explicitId, moduleId, legacyId) {
    const find = (id) => allProjects.find((project) => String(project.id) === String(id || "")) || null;
    const compatible = allProjects.filter(isBiographyProject);
    return find(explicitId)
      || find(moduleId)
      || compatible.find((project) => String(project.id) === String(legacyId || ""))
      || compatible[0]
      || null;
  }

  function normalizeStep(value) {
    const raw = String(value || "start").trim().toLowerCase();
    const normalized = STEP_ALIASES[raw] || raw;
    return STEP_IDS.has(normalized) ? normalized : "start";
  }

  function normalizeAnswer(value) {
    if (typeof value === "string") {
      return { question: "", text: value, created_at: new Date().toISOString() };
    }
    const item = value && typeof value === "object" ? value : {};
    return {
      question: String(item.question || ""),
      text: String(item.text || item.answer || ""),
      created_at: String(item.created_at || item.answered_at || new Date().toISOString()),
    };
  }

  function normalizeSession(value, index) {
    const item = value && typeof value === "object" ? value : {};
    const answers = (Array.isArray(item.answers) ? item.answers : []).map(normalizeAnswer).filter((answer) => answer.text);
    return {
      id: String(item.id || `session_${index + 1}`),
      title: String(item.title || `Istunto ${index + 1}`),
      questions: (Array.isArray(item.questions) ? item.questions : []).map(String).filter(Boolean),
      answers,
      started_at: String(item.started_at || item.created_at || new Date().toISOString()),
      completed_at: String(item.completed_at || ""),
      updated_at: String(item.updated_at || item.started_at || new Date().toISOString()),
    };
  }

  function migrateLegacyAnswersToInterview(state, rawAnswers, timestamp) {
    const legacyText = String(rawAnswers == null ? state.answers : rawAnswers).trim();
    if (!legacyText) return false;
    if (state.interview_sessions.some((session) => session.id === LEGACY_ANSWERS_SESSION_ID)) return false;
    if (state.interview_sessions.some((session) => session.answers.length)) return false;
    const createdAt = String(timestamp || new Date().toISOString());
    const existingMaterial = state.materials.find((material) => (
      !material.session_id && material.text.trim() === legacyText
    ));
    if (existingMaterial) {
      existingMaterial.kind = "interview_answer";
      existingMaterial.session_id = LEGACY_ANSWERS_SESSION_ID;
      existingMaterial.question = LEGACY_ANSWERS_QUESTION;
    }
    const session = appendInterviewAnswerToState(state, {
      session_id: LEGACY_ANSWERS_SESSION_ID,
      material_id: existingMaterial?.id || LEGACY_ANSWERS_MATERIAL_ID,
      question: LEGACY_ANSWERS_QUESTION,
      answer: legacyText,
      created_at: createdAt,
    });
    session.title = "Aiemmat vastaukset";
    return true;
  }

  function normalizeLoadedBiographyState(raw) {
    const state = normalizeBiographyState(raw);
    return {
      state,
      migrated: migrateLegacyAnswersToInterview(state, raw?.answers, raw?.updated_at),
    };
  }

  function normalizeChapter(value, index) {
    const item = value && typeof value === "object" ? value : {};
    return {
      id: String(item.id || `chapter_${index + 1}`),
      title: String(item.title || `Luku ${index + 1}`),
      focus: String(item.focus || item.chapter_focus || ""),
      plan: String(item.plan || item.chapter_plan || ""),
      draft: String(item.draft || (Array.isArray(item.paragraphs) ? item.paragraphs.join("\n\n") : "")),
      status: String(item.status || (item.draft ? "draft" : "planned")),
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
      updated_at: String(item.updated_at || new Date().toISOString()),
    };
  }

  function normalizeBiographyState(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const state = Object.assign(defaultBiographyState(), source);
    state.project_mode = ["biography", "autobiography", "first_person_guide"].includes(source.project_mode)
      ? source.project_mode
      : "autobiography";
    state.narrative_perspective = state.project_mode === "biography"
      ? (["first_person", "third_person"].includes(source.narrative_perspective) ? source.narrative_perspective : "third_person")
      : "first_person";
    state.active_step = normalizeStep(source.active_step);
    state.current_question = String(source.current_question || MODE_PRESETS[state.project_mode][0]);
    state.materials = (Array.isArray(source.materials) ? source.materials : [])
      .filter((item) => item && (item.text || item.title))
      .map((item, index) => ({
        id: String(item.id || `material_${index + 1}`),
        title: String(item.title || "Nimetön muisto"),
        kind: MATERIAL_KINDS[item.kind] ? item.kind : "free_text",
        text: String(item.text || ""),
        created_at: String(item.created_at || new Date().toISOString()),
        session_id: String(item.session_id || ""),
        question: String(item.question || ""),
      }));
    state.interview_sessions = (Array.isArray(source.interview_sessions) ? source.interview_sessions : [])
      .map(normalizeSession);
    state.chapters = (Array.isArray(source.chapters) ? source.chapters : [])
      .map(normalizeChapter)
      .sort((left, right) => left.order - right.order)
      .map((chapter, index) => Object.assign(chapter, { order: index }));
    if (!state.chapters.length && (source.chapter_title || source.chapter_plan || source.draft)) {
      state.chapters.push(normalizeChapter({
        id: "legacy_chapter",
        title: source.chapter_title || "Luku 1",
        focus: source.chapter_focus,
        plan: source.chapter_plan,
        draft: source.draft,
      }, 0));
    }
    const stringFields = [
      "manuscript_title", "manuscript_text", "interview_draft", "purpose", "style", "target_length",
      "interpretation_level", "sensitive_handling", "timeline", "people", "themes",
      "gaps", "sensitive_topics", "quality_status", "analysis_report", "questions",
      "answers", "outline", "chapter_title", "chapter_focus", "chapter_plan", "draft",
      "approval_notes", "last_generated_action", "last_generated_at", "updated_at",
    ];
    stringFields.forEach((field) => { state[field] = String(state[field] || ""); });
    if (!state.manuscript_title) state.manuscript_title = activeProject?.title || "Minun tarinani";
    return state;
  }

  function getProjectId() {
    return activeProjectId;
  }

  function isBiographyProject(project) {
    return project?.analysis?.project_kind === "biography" || Boolean(project?.analysis?.biography);
  }

  function requestedProjectId() {
    const queryId = new URLSearchParams(window.location.search).get("project");
    return queryId ? String(queryId) : "";
  }

  function projectById(id) {
    return projects.find((project) => String(project.id) === String(id || "")) || null;
  }

  async function apiListProjects() {
    const response = await doFetch(`${API_BASE}/projects?summary=true`);
    if (!response.ok) throw new Error(`Projektien lataus epäonnistui (${response.status}).`);
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  async function apiCreateProject(title) {
    const response = await doFetch(`${API_BASE}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        author: "Tuntematon",
        chapters: [],
        analysis: { project_kind: "biography" },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `Projektin luonti epäonnistui (${response.status}).`);
    return data;
  }

  async function apiGetState(projectId) {
    const targetProjectId = projectId || getProjectId();
    if (!targetProjectId) return { data: biographyState };
    const response = await doFetch(`${API_BASE}/projects/${encodeURIComponent(targetProjectId)}/biography`);
    if (!response.ok) throw new Error(`Projektin lataus epäonnistui (${response.status}).`);
    return response.json();
  }

  async function apiSaveState(data, projectId, options) {
    const targetProjectId = projectId || getProjectId();
    if (!targetProjectId) return { data };
    const response = await doFetch(`${API_BASE}/projects/${encodeURIComponent(targetProjectId)}/biography`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: options?.serializedBody || JSON.stringify({ data }),
      keepalive: Boolean(options?.keepalive),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || `Tallennus epäonnistui (${response.status}).`);
    return payload;
  }

  async function apiRunAction(action, data, payload) {
    if (!getProjectId()) throw new Error("Valitse tai luo ensin elämäkertaprojekti.");
    const response = await doFetch(`${API_BASE}/projects/${encodeURIComponent(getProjectId())}/biography/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, data, payload: payload || {} }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || `Toiminto epäonnistui (${response.status}).`);
    return result;
  }

  function uniqueProjectTitle(requested) {
    const base = String(requested || "Uusi elämäkerta").trim() || "Uusi elämäkerta";
    const names = new Set(projects.map((project) => String(project.title || "").trim().toLowerCase()));
    if (!names.has(base.toLowerCase())) return base;
    let suffix = 2;
    while (names.has(`${base} ${suffix}`.toLowerCase())) suffix += 1;
    return `${base} ${suffix}`;
  }

  function notifyParentOfProject(project) {
    try {
      window.parent?.postMessage({ type: "skriptlab:project-selected", project }, window.location.origin);
    } catch (error) {
      // Itsenäisessä näkymässä ei ole isäntäikkunaa.
    }
  }

  function rememberProject(project, keepExplicitQuery) {
    activeProject = project || null;
    activeProjectId = project?.id ? String(project.id) : null;
    if (!activeProjectId) return;
    localStorage.setItem(MODULE_PROJECT_KEY, activeProjectId);
    if (!keepExplicitQuery || requestedProjectId() !== activeProjectId) {
      const url = new URL(window.location.href);
      url.searchParams.set("project", activeProjectId);
      window.history.replaceState({}, "", url);
    }
  }

  async function chooseInitialProject() {
    projects = await apiListProjects();
    const explicitId = requestedProjectId();
    const moduleId = localStorage.getItem(MODULE_PROJECT_KEY) || "";
    const legacyId = localStorage.getItem("skriptlab_active_project_id") || "";
    const initial = resolveInitialProject(projects, explicitId, moduleId, legacyId);
    if (initial) rememberProject(initial, Boolean(explicitId && String(initial.id) === explicitId));
    renderProjectMenu();
    if (!initial) {
      biographyState = defaultBiographyState();
      render();
      setSaveStatus("Valitse tai luo projekti", "error");
    }
  }

  async function selectProject(project, options) {
    if (!project?.id) return;
    const selectionRevision = ++projectSelectionRevision;
    await cancelActiveTranscription();
    await flushPendingSave();
    if (selectionRevision !== projectSelectionRevision) return null;
    setSaveStatus("Ladataan projektia…", "saving");
    let response;
    try {
      response = await apiGetState(String(project.id));
    } catch (error) {
      setSaveStatus("Projektin vaihto epäonnistui", "error");
      toast(error.message || "Projektin vaihto epäonnistui.");
      throw error;
    }
    if (selectionRevision !== projectSelectionRevision) return null;
    const loaded = normalizeLoadedBiographyState(response.data);
    rememberProject(project, Boolean(options?.keepExplicitQuery));
    biographyState = loaded.state;
    selectedSessionId = null;
    selectedChapterId = null;
    resetMaterialForm();
    closeProjectMenu();
    render();
    if (loaded.migrated) {
      scheduleSave();
      await flushPendingSave();
    } else {
      setSaveStatus("Tallennettu automaattisesti", "saved");
    }
    if (selectionRevision !== projectSelectionRevision || String(project.id) !== String(getProjectId() || "")) return null;
    renderProjectMenu();
    if (options?.notifyParent) notifyParentOfProject(project);
  }

  async function createProject(event) {
    event.preventDefault();
    const input = $("new-project-title");
    const title = uniqueProjectTitle(input.value);
    const submit = event.currentTarget.querySelector("button[type='submit']");
    submit.disabled = true;
    try {
      await cancelActiveTranscription();
      await flushPendingSave();
      const project = await apiCreateProject(title);
      const initialState = defaultBiographyState();
      initialState.manuscript_title = title;
      await apiSaveState(initialState, String(project.id));
      projects.unshift(project);
      input.value = "";
      await selectProject(project, { notifyParent: true });
      toast(`Projekti “${title}” luotiin.`);
    } catch (error) {
      toast(error.message || "Projektin luonti epäonnistui.");
    } finally {
      submit.disabled = false;
    }
  }

  function setSaveStatus(message, state) {
    const element = $("save-status");
    if (!element) return;
    const label = element.querySelector("span");
    if (label) label.textContent = message;
    element.classList.toggle("is-saving", state === "saving");
    element.classList.toggle("is-error", state === "error");
    const icon = element.querySelector("i");
    if (icon) icon.className = state === "saving" ? "ph ph-circle-notch" : (state === "error" ? "ph ph-warning-circle" : "ph ph-check-circle");
  }

  function toast(message) {
    const element = $("toast");
    if (!element) return;
    element.textContent = message;
    element.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { element.hidden = true; }, 3000);
  }

  function formatDate(value, includeTime) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("fi-FI", includeTime
      ? { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }
      : { day: "numeric", month: "long", year: "numeric" }).format(date);
  }

  function truncate(value, maximum) {
    const text = String(value || "").trim();
    return text.length > maximum ? `${text.slice(0, maximum).trimEnd()}…` : text;
  }

  function answeredQuestionCount(state) {
    return state.interview_sessions.reduce((total, session) => total + session.answers.length, 0);
  }

  function setControlValue(id, value) {
    const element = $(id);
    if (element && document.activeElement !== element) element.value = value == null ? "" : String(value);
  }

  function render() {
    renderHeader();
    renderJourney();
    renderMode();
    renderProgress();
    renderInterview();
    renderMaterials();
    renderOutline();
    renderChapters();
    renderManuscript();
    renderSettings();
    showStep(biographyState.active_step, { save: false, focus: false });
  }

  function renderHeader() {
    $("current-project-title").textContent = activeProject?.title || biographyState.manuscript_title || "Minun tarinani";
  }

  function renderProjectMenu() {
    const list = $("project-list");
    if (!list) return;
    list.replaceChildren();
    const compatible = projects.filter((project) => isBiographyProject(project) || String(project.id) === String(activeProjectId || ""));
    if (!compatible.length) {
      const empty = document.createElement("p");
      empty.className = "project-empty";
      empty.textContent = "Et ole vielä luonut elämäkertaprojektia.";
      list.appendChild(empty);
      return;
    }
    compatible.forEach((project) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `project-list-button${String(project.id) === String(activeProjectId) ? " is-active" : ""}`;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(String(project.id) === String(activeProjectId)));
      const title = document.createElement("span");
      title.textContent = project.title || "Nimetön elämäkerta";
      button.appendChild(title);
      if (String(project.id) === String(activeProjectId)) {
        const icon = document.createElement("i");
        icon.className = "ph ph-check";
        icon.setAttribute("aria-hidden", "true");
        button.appendChild(icon);
      }
      button.addEventListener("click", () => selectProject(project, { notifyParent: true }).catch(() => null));
      list.appendChild(button);
    });
  }

  function renderJourney() {
    const path = $("path-list");
    path.replaceChildren();
    STEPS.forEach((step, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "journey-step";
      if (biographyState.active_step === step.id) button.classList.add("is-active");
      if (step.done(biographyState)) button.classList.add("is-complete");
      button.setAttribute("aria-current", biographyState.active_step === step.id ? "step" : "false");
      const number = document.createElement("span");
      number.className = "journey-number";
      number.textContent = String(index + 1);
      const label = document.createElement("span");
      label.className = "journey-label";
      label.textContent = step.label;
      button.append(number, label);
      button.addEventListener("click", () => showStep(step.id));
      path.appendChild(button);
    });
  }

  function renderMode() {
    document.querySelectorAll("[data-mode]").forEach((button) => {
      const active = button.dataset.mode === biographyState.project_mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const starters = MODE_STARTERS[biographyState.project_mode] || MODE_STARTERS.autobiography;
    document.querySelectorAll("[data-prompt]").forEach((button, index) => {
      const starter = starters[index];
      if (!starter) return;
      button.dataset.prompt = starter.question;
      const label = button.querySelector("span");
      const icon = button.querySelector("i");
      if (label) label.textContent = starter.label;
      if (icon) icon.className = `ph ph-${starter.icon}`;
    });
  }

  function renderProgress() {
    const answered = answeredQuestionCount(biographyState);
    const drafted = biographyState.chapters.filter((chapter) => chapter.draft.trim()).length;
    $("answered-count").textContent = String(answered);
    $("memory-count").textContent = String(biographyState.materials.length);
    $("chapter-count").textContent = String(drafted);
    $("outline-material-count").textContent = String(biographyState.materials.length);
    $("manuscript-chapter-count").textContent = String(biographyState.chapters.length);
    const words = biographyState.manuscript_text.trim() ? biographyState.manuscript_text.trim().split(/\s+/u).length : 0;
    $("manuscript-word-count").textContent = String(words);
    const latest = [...biographyState.interview_sessions].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0];
    $("latest-session-date").textContent = latest ? formatDate(latest.updated_at, true) : "Ei istuntoja vielä";
    $("latest-session-meta").textContent = latest ? `${latest.answers.length} vastausta tallennettu` : "Aloita ensimmäinen haastattelu";
  }

  function currentSession() {
    return biographyState.interview_sessions.find((session) => session.id === selectedSessionId) || null;
  }

  function ensureSession() {
    let session = currentSession();
    if (session) return session;
    session = biographyState.interview_sessions[biographyState.interview_sessions.length - 1] || null;
    if (session) {
      selectedSessionId = session.id;
      return session;
    }
    return addSession();
  }

  function addSession() {
    const now = new Date().toISOString();
    const session = {
      id: stableId("session"),
      title: `Istunto ${biographyState.interview_sessions.length + 1}`,
      questions: [], answers: [], started_at: now, completed_at: "", updated_at: now,
    };
    biographyState.interview_sessions.push(session);
    selectedSessionId = session.id;
    biographyState.current_question = nextPresetQuestion();
    renderInterview();
    renderProgress();
    scheduleSave();
    return session;
  }

  function renderInterview() {
    $("current-question").textContent = biographyState.current_question || MODE_PRESETS[biographyState.project_mode][0];
    setControlValue("m-text", biographyState.interview_draft);
    const list = $("session-list");
    list.replaceChildren();
    $("session-count").textContent = String(biographyState.interview_sessions.length);
    if (!biographyState.interview_sessions.length) {
      const empty = document.createElement("p");
      empty.className = "empty-note";
      empty.textContent = "Ensimmäinen istunto syntyy, kun tallennat vastauksen.";
      list.appendChild(empty);
      return;
    }
    if (!selectedSessionId || !biographyState.interview_sessions.some((session) => session.id === selectedSessionId)) {
      selectedSessionId = biographyState.interview_sessions[biographyState.interview_sessions.length - 1].id;
    }
    biographyState.interview_sessions.slice().reverse().forEach((session) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `session-button${session.id === selectedSessionId ? " is-active" : ""}`;
      const title = document.createElement("strong");
      title.textContent = session.title;
      const meta = document.createElement("span");
      meta.textContent = `${formatDate(session.updated_at, false)} · ${session.answers.length} vastausta`;
      button.append(title, meta);
      button.addEventListener("click", () => { selectedSessionId = session.id; renderInterview(); });
      list.appendChild(button);
    });
  }

  function renderMaterials() {
    const list = $("material-list");
    list.replaceChildren();
    $("material-count").textContent = String(biographyState.materials.length);
    if (!biographyState.materials.length) {
      const item = document.createElement("li");
      item.className = "empty-note";
      item.textContent = "Aineisto on vielä tyhjä. Aloita haastattelusta tai lisää ensimmäinen muisto.";
      list.appendChild(item);
      return;
    }
    biographyState.materials.slice().reverse().forEach((material) => {
      const item = document.createElement("li");
      item.className = "material-item";
      const content = document.createElement("div");
      const kind = document.createElement("span");
      kind.className = "kind";
      kind.textContent = MATERIAL_KINDS[material.kind] || "Aineisto";
      const title = document.createElement("h3");
      title.textContent = material.title;
      const text = document.createElement("p");
      text.textContent = truncate(material.text, 260);
      content.append(kind, title, text);
      const actions = document.createElement("div");
      actions.className = "material-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "icon-button";
      edit.setAttribute("aria-label", `Muokkaa ${material.title}`);
      edit.title = "Muokkaa muistoa";
      const editIcon = document.createElement("i");
      editIcon.className = "ph ph-pencil-simple";
      editIcon.setAttribute("aria-hidden", "true");
      edit.appendChild(editIcon);
      edit.addEventListener("click", () => startMaterialEdit(material.id));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-button danger-outline";
      remove.setAttribute("aria-label", `Poista ${material.title}`);
      remove.title = "Poista muisto";
      const icon = document.createElement("i");
      icon.className = "ph ph-trash";
      icon.setAttribute("aria-hidden", "true");
      remove.appendChild(icon);
      remove.addEventListener("click", () => removeMaterial(material.id, remove));
      actions.append(edit, remove);
      item.append(content, actions);
      list.appendChild(item);
    });
  }

  function renderOutline() {
    const fallback = biographyState.analysis_report || "Analyysiä ei ole vielä ajettu.";
    $("r-timeline").textContent = biographyState.timeline || fallback;
    $("r-people").textContent = biographyState.people || fallback;
    $("r-themes").textContent = biographyState.themes || fallback;
    $("r-gaps").textContent = biographyState.gaps || fallback;
    $("analysis-quality").textContent = biographyState.quality_status || (biographyState.analysis_report ? "Analysoitu" : "Ei analysoitu");
    setControlValue("f-outline", biographyState.outline);
  }

  function currentChapter() {
    return biographyState.chapters.find((chapter) => chapter.id === selectedChapterId) || null;
  }

  function renderChapters() {
    const list = $("chapter-list");
    list.replaceChildren();
    if (!biographyState.chapters.length) {
      selectedChapterId = null;
      const empty = document.createElement("p");
      empty.className = "empty-note";
      empty.textContent = "Lisää ensimmäinen luku plus-painikkeesta.";
      list.appendChild(empty);
    } else {
      if (!selectedChapterId || !biographyState.chapters.some((chapter) => chapter.id === selectedChapterId)) {
        selectedChapterId = biographyState.chapters[0].id;
      }
      biographyState.chapters.forEach((chapter, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `chapter-button${chapter.id === selectedChapterId ? " is-active" : ""}`;
        const number = document.createElement("span");
        number.className = "chapter-number";
        number.textContent = String(index + 1).padStart(2, "0");
        const content = document.createElement("span");
        const title = document.createElement("strong");
        title.textContent = chapter.title || `Luku ${index + 1}`;
        const meta = document.createElement("small");
        meta.textContent = chapter.draft ? "Luonnos" : (chapter.plan ? "Suunniteltu" : "Aloittamatta");
        content.append(title, meta);
        button.append(number, content);
        button.addEventListener("click", () => { selectedChapterId = chapter.id; renderChapters(); });
        list.appendChild(button);
      });
    }
    const chapter = currentChapter();
    setControlValue("f-chapter-title", chapter?.title || "");
    setControlValue("f-chapter-focus", chapter?.focus || "");
    setControlValue("f-chapter-plan", chapter?.plan || "");
    setControlValue("f-draft", chapter?.draft || "");
    $("delete-chapter").disabled = !chapter;
    const chapterIndex = chapter ? biographyState.chapters.findIndex((item) => item.id === chapter.id) : -1;
    $("move-chapter-up").disabled = chapterIndex <= 0;
    $("move-chapter-down").disabled = chapterIndex < 0 || chapterIndex >= biographyState.chapters.length - 1;
  }

  function renderManuscript() {
    setControlValue("manuscript-title", biographyState.manuscript_title || activeProject?.title || "Minun tarinani");
    setControlValue("manuscript-text", biographyState.manuscript_text);
    renderProgress();
  }

  function renderSettings() {
    setControlValue("f-purpose", biographyState.purpose);
    setControlValue("narrative-perspective", biographyState.narrative_perspective);
    setControlValue("f-style", biographyState.style);
    setControlValue("f-target-length", biographyState.target_length);
    setControlValue("f-sensitive", biographyState.sensitive_handling);
    setControlValue("f-interpretation", biographyState.interpretation_level);
    const perspective = $("narrative-perspective");
    perspective.disabled = biographyState.project_mode !== "biography";
    if (perspective.disabled) perspective.value = "first_person";
  }

  function saveSettings() {
    document.querySelectorAll("[data-state-field]").forEach((input) => {
      biographyState[input.dataset.stateField] = input.value;
    });
    if (biographyState.project_mode !== "biography") biographyState.narrative_perspective = "first_person";
    closeModals();
    renderMode();
    scheduleSave();
    toast("Asetukset tallennettiin.");
  }

  function scheduleSave() {
    stateRevision += 1;
    dirtyState = true;
    if (!getProjectId()) {
      setSaveStatus("Valitse tai luo projekti", "error");
      return;
    }
    setSaveStatus("Tallennetaan…", "saving");
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveNow, 750);
  }

  async function saveNow(options) {
    if (!getProjectId()) return biographyState;
    window.clearTimeout(saveTimer);
    saveTimer = null;
    const projectId = String(getProjectId());
    const revision = stateRevision;
    const snapshot = JSON.parse(JSON.stringify(biographyState));
    const serializedBody = JSON.stringify({ data: snapshot });
    const canKeepAlive = Boolean(options?.keepalive)
      && new TextEncoder().encode(serializedBody).byteLength <= 60 * 1024;
    dirtyState = false;
    setSaveStatus("Tallennetaan…", "saving");
    pendingSaveCount += 1;
    return serializedSaveQueue.add(async () => {
      try {
        const response = await apiSaveState(snapshot, projectId, { serializedBody, keepalive: canKeepAlive });
        if (projectId !== String(getProjectId()) || revision !== stateRevision) return biographyState;
        const activeStep = biographyState.active_step;
        const sessionId = selectedSessionId;
        const chapterId = selectedChapterId;
        biographyState = normalizeBiographyState(response.data);
        biographyState.active_step = activeStep;
        selectedSessionId = sessionId;
        selectedChapterId = chapterId;
        setSaveStatus("Tallennettu automaattisesti juuri nyt", "saved");
        renderJourney();
        renderProgress();
        return biographyState;
      } catch (error) {
        if (projectId === String(getProjectId())) {
          dirtyState = true;
          setSaveStatus("Tallennus epäonnistui", "error");
          toast(error.message || "Tallennus epäonnistui.");
        }
        throw error;
      } finally {
        pendingSaveCount = Math.max(0, pendingSaveCount - 1);
      }
    });
  }

  async function flushPendingSave(options) {
    try {
      if (saveTimer || dirtyState) await saveNow({ keepalive: Boolean(options?.keepalive) });
      await serializedSaveQueue.flush();
    } catch (error) {
      if (!options?.bestEffort) throw error;
    }
  }

  function shouldWarnBeforeUnload(isDirty, timer, pendingCount) {
    return Boolean(isDirty || timer || pendingCount > 0);
  }

  function hasPendingPersistence() {
    return shouldWarnBeforeUnload(dirtyState, saveTimer, pendingSaveCount);
  }

  function handleBeforeUnload(event) {
    if (!hasPendingPersistence()) return undefined;
    event.preventDefault();
    event.returnValue = "";
    return "";
  }

  function loadState() {
    const projectId = String(getProjectId() || "");
    if (!projectId) {
      biographyState = defaultBiographyState();
      render();
      return Promise.resolve(biographyState);
    }
    if (activeLoad?.projectId === projectId) return activeLoad.promise;
    if (hasPendingPersistence()) return Promise.resolve(biographyState);

    const requestRevision = stateRevision;
    const requestState = JSON.parse(JSON.stringify(biographyState));
    const load = { projectId, promise: null };
    setSaveStatus("Ladataan projektia…", "saving");
    load.promise = (async () => {
      try {
        const response = await apiGetState(projectId);
        const responseIsCurrent = projectId === String(getProjectId() || "")
          && requestRevision === stateRevision
          && !hasPendingPersistence()
          && stateValuesEqual(biographyState, requestState);
        if (!responseIsCurrent) return biographyState;
        const loaded = normalizeLoadedBiographyState(response.data);
        biographyState = loaded.state;
        if (!biographyState.manuscript_title) biographyState.manuscript_title = activeProject?.title || "Minun tarinani";
        render();
        if (loaded.migrated) {
          scheduleSave();
        } else {
          setSaveStatus("Tallennettu automaattisesti", "saved");
        }
        return biographyState;
      } catch (error) {
        if (projectId === String(getProjectId() || "")) {
          setSaveStatus("Projektin lataus epäonnistui", "error");
          toast(error.message || "Projektin lataus epäonnistui.");
        }
        return biographyState;
      } finally {
        if (activeLoad === load) activeLoad = null;
      }
    })();
    activeLoad = load;
    return load.promise;
  }

  function showStep(stepId, options) {
    const normalized = normalizeStep(stepId);
    if (normalized !== "interview") cancelRecordingForNavigation();
    biographyState.active_step = normalized;
    document.querySelectorAll(".step-view").forEach((view) => {
      const active = view.dataset.step === normalized;
      view.hidden = !active;
      view.classList.toggle("is-active", active);
    });
    renderJourney();
    if (options?.save !== false) scheduleSave();
    if (options?.focus !== false) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      const heading = document.querySelector(`#view-${normalized} h1`);
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    }
  }

  function setMode(mode) {
    if (!MODE_PRESETS[mode]) return;
    applyProjectMode(biographyState, mode);
    renderMode();
    renderInterview();
    renderSettings();
    scheduleSave();
  }

  function selectPrompt(question) {
    biographyState.current_question = question;
    showStep("interview");
    window.setTimeout(() => $("m-text").focus(), 50);
  }

  function nextPresetQuestion() {
    const presets = MODE_PRESETS[biographyState.project_mode] || MODE_PRESETS.autobiography;
    const currentIndex = presets.indexOf(biographyState.current_question);
    return presets[(currentIndex + 1 + presets.length) % presets.length];
  }

  function refreshQuestion() {
    biographyState.current_question = nextPresetQuestion();
    $("current-question").textContent = biographyState.current_question;
    scheduleSave();
  }

  async function submitInterviewAnswer() {
    const editor = $("m-text");
    const text = editor.value.trim();
    if (!text) {
      toast("Kirjoita tai litteroi ensin vastaus.");
      editor.focus();
      return;
    }
    const question = biographyState.current_question || MODE_PRESETS[biographyState.project_mode][0];
    const now = new Date().toISOString();
    const session = ensureSession();
    appendInterviewAnswerToState(biographyState, {
      session_id: session.id,
      question,
      answer: text,
      created_at: now,
    });
    editor.value = "";
    biographyState.interview_draft = "";
    renderInterview();
    renderMaterials();
    renderProgress();
    try {
      await saveNow();
      await runAction("interview_followup", { session_id: session.id, question, answer: text }, { showResult: false });
      toast("Vastaus tallennettiin. Seuraava kysymys on valmis.");
    } catch (error) {
      biographyState.current_question = nextPresetQuestion();
      renderInterview();
      scheduleSave();
    }
  }

  function addManualMaterial(event) {
    event.preventDefault();
    const title = $("material-title").value.trim();
    const text = $("material-text").value.trim();
    if (!title || !text) return;
    if (editingMaterialId) {
      updateMaterialInState(biographyState, editingMaterialId, {
        title,
        kind: $("material-kind").value,
        text,
      });
      resetMaterialForm();
      toast("Muiston muutokset tallennettiin.");
    } else {
      biographyState.materials.push({
        id: stableId("material"), title, kind: $("material-kind").value,
        text, created_at: new Date().toISOString(), session_id: "", question: "",
      });
      event.currentTarget.reset();
      toast("Muisto lisättiin aineistoon.");
    }
    renderMaterials();
    renderInterview();
    renderProgress();
    scheduleSave();
  }

  function removeMaterial(id, trigger) {
    const material = biographyState.materials.find((item) => item.id === id);
    if (!material) return false;
    const visibleIndex = biographyState.materials.slice().reverse().findIndex((item) => item.id === id);
    const linkedWarning = material.kind === "interview_answer" && material.session_id
      ? " Myös haastatteluistunnon vastaus poistetaan."
      : "";
    const confirmed = window.confirm(
      `Poistetaanko muisto “${material.title || "Nimetön muisto"}”?${linkedWarning} Tätä ei voi kumota.`,
    );
    if (!confirmed) {
      trigger?.focus();
      return false;
    }
    removeMaterialFromState(biographyState, id);
    if (editingMaterialId === id) resetMaterialForm();
    renderMaterials();
    renderInterview();
    renderProgress();
    scheduleSave();
    toast("Muisto poistettiin.");
    const remainingItems = document.querySelectorAll("#material-list .material-item");
    const nextItem = remainingItems[Math.min(visibleIndex, remainingItems.length - 1)];
    const nextAction = nextItem?.querySelector(".icon-button");
    if (nextAction) nextAction.focus(); else $("material-title")?.focus();
    return true;
  }

  function startMaterialEdit(id) {
    const material = biographyState.materials.find((item) => item.id === id);
    if (!material) return;
    editingMaterialId = id;
    $("material-title").value = material.title;
    $("material-kind").value = material.kind;
    $("material-kind").disabled = Boolean(material.session_id);
    $("material-text").value = material.text;
    $("save-material-label").textContent = "Tallenna muutokset";
    $("btn-save-material").querySelector("i").className = "ph ph-check";
    $("btn-cancel-material-edit").hidden = false;
    $("material-title").focus();
    $("material-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetMaterialForm() {
    editingMaterialId = null;
    $("material-form").reset();
    $("material-kind").disabled = false;
    $("save-material-label").textContent = "Lisää muisto";
    $("btn-save-material").querySelector("i").className = "ph ph-plus";
    $("btn-cancel-material-edit").hidden = true;
  }

  function addChapter() {
    const chapter = appendChapterToState(biographyState);
    selectedChapterId = chapter.id;
    renderChapters();
    renderProgress();
    scheduleSave();
    $("f-chapter-title").focus();
    $("f-chapter-title").select();
  }

  function deleteChapter() {
    const chapter = currentChapter();
    if (!chapter) return;
    if (!window.confirm(`Poistetaanko luku “${chapter.title || "Nimetön luku"}”? Tätä ei voi kumota.`)) return;
    const index = removeChapterFromState(biographyState, chapter.id);
    selectedChapterId = biographyState.chapters[Math.min(index, biographyState.chapters.length - 1)]?.id || null;
    renderChapters();
    renderProgress();
    scheduleSave();
    toast("Luku poistettiin.");
  }

  function moveChapter(direction) {
    const chapter = currentChapter();
    if (!chapter) return;
    const currentIndex = biographyState.chapters.findIndex((item) => item.id === chapter.id);
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= biographyState.chapters.length) return;
    const [moved] = biographyState.chapters.splice(currentIndex, 1);
    biographyState.chapters.splice(targetIndex, 0, moved);
    biographyState.chapters.forEach((item, order) => { item.order = order; });
    renderChapters();
    scheduleSave();
    toast(direction < 0 ? "Luku siirrettiin ylöspäin." : "Luku siirrettiin alaspäin.");
  }

  function updateChapterField(event) {
    const chapter = currentChapter();
    if (!chapter) return;
    const field = event.currentTarget.dataset.chapterField;
    chapter[field] = event.currentTarget.value;
    chapter.status = chapter.draft ? "draft" : (chapter.plan ? "planned" : "new");
    chapter.updated_at = new Date().toISOString();
    biographyState.chapter_title = chapter.title;
    biographyState.chapter_focus = chapter.focus;
    biographyState.chapter_plan = chapter.plan;
    biographyState.draft = chapter.draft;
    if (field === "title") renderChapters();
    renderProgress();
    scheduleSave();
  }

  function compileLocally() {
    return biographyState.chapters
      .filter((chapter) => chapter.title || chapter.draft)
      .map((chapter) => `${chapter.title || "Luku"}\n\n${chapter.draft || "[TÄYDENNETTÄVÄ]"}`)
      .join("\n\n\n");
  }

  function stateValuesEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function applyActionScalar(liveState, requestState, responseState, field) {
    if (!Object.prototype.hasOwnProperty.call(responseState, field)) return false;
    if (!stateValuesEqual(liveState[field], requestState[field])) return false;
    liveState[field] = responseState[field];
    return true;
  }

  function actionChapter(state, payload) {
    const chapterId = String(payload?.chapter_id || "");
    if (chapterId) return state.chapters.find((chapter) => chapter.id === chapterId) || null;
    const title = String(payload?.chapter_title || "").trim().toLocaleLowerCase("fi-FI");
    return title
      ? state.chapters.find((chapter) => chapter.title.trim().toLocaleLowerCase("fi-FI") === title) || null
      : null;
  }

  function mergeChapterAction(liveState, requestState, responseState, action, payload) {
    const liveChapter = actionChapter(liveState, payload);
    const requestChapter = actionChapter(requestState, payload);
    const responseChapter = actionChapter(responseState, payload);
    if (!liveChapter || !requestChapter || !responseChapter) return false;
    const field = action === "chapter_plan" ? "plan" : "draft";
    if (!stateValuesEqual(liveChapter[field], requestChapter[field])) return false;
    liveChapter[field] = responseChapter[field];
    if (stateValuesEqual(liveChapter.status, requestChapter.status)) {
      liveChapter.status = responseChapter.status;
    }
    if (stateValuesEqual(liveChapter.updated_at, requestChapter.updated_at)) {
      liveChapter.updated_at = responseChapter.updated_at;
    }
    const legacyField = action === "chapter_plan" ? "chapter_plan" : "draft";
    applyActionScalar(liveState, requestState, responseState, legacyField);
    return true;
  }

  function mergeInterviewAction(liveState, requestState, responseState, payload) {
    const questionApplied = applyActionScalar(
      liveState,
      requestState,
      responseState,
      "current_question",
    );
    const sessionId = String(payload?.session_id || "");
    if (!sessionId) return questionApplied;
    const liveSession = liveState.interview_sessions.find((session) => session.id === sessionId);
    const requestSession = requestState.interview_sessions.find((session) => session.id === sessionId);
    const responseSession = responseState.interview_sessions.find((session) => session.id === sessionId);
    if (!liveSession || !requestSession || !responseSession) return questionApplied;
    responseSession.questions.forEach((question) => {
      if (!liveSession.questions.includes(question)) liveSession.questions.push(question);
    });
    if (stateValuesEqual(liveSession.updated_at, requestSession.updated_at)) {
      liveSession.updated_at = responseSession.updated_at || liveSession.updated_at;
    }
    return true;
  }

  function mergeActionResponseState(liveState, requestState, responseState, action, payload) {
    let applied = false;
    const scalarFields = {
      analyze: [
        "analysis_report", "timeline", "people", "themes", "gaps",
        "sensitive_topics", "quality_status",
      ],
      questions: ["questions"],
      outline: ["outline"],
      compile_manuscript: ["manuscript_title", "manuscript_text"],
    };
    (scalarFields[action] || []).forEach((field) => {
      applied = applyActionScalar(liveState, requestState, responseState, field) || applied;
    });
    if (["chapter_plan", "draft"].includes(action)) {
      applied = mergeChapterAction(liveState, requestState, responseState, action, payload) || applied;
    }
    if (action === "interview_followup") {
      applied = mergeInterviewAction(liveState, requestState, responseState, payload) || applied;
    }
    ["last_generated_action", "last_generated_at"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(responseState, field)) liveState[field] = responseState[field];
    });
    return { state: liveState, applied };
  }

  const WORKING_LABELS = {
    analyze: "Jäsennän aineistoa…",
    outline: "Suunnittelen tarinan rakennetta…",
    chapter_plan: "Suunnittelen lukua…",
    draft: "Kirjoitan lukuluonnosta…",
    interview_followup: "Muotoilen seuraavaa kysymystä…",
    compile_manuscript: "Kokoan käsikirjoitusta…",
  };

  async function runAction(action, suppliedPayload, options) {
    const actionProjectId = String(getProjectId() || "");
    let chapter = currentChapter();
    if (["chapter_plan", "draft"].includes(action) && !chapter) {
      toast("Lisää ensin luku.");
      return null;
    }
    if (["chapter_plan", "draft"].includes(action) && !chapter.title.trim()) {
      toast("Anna luvulle ensin otsikko.");
      $("f-chapter-title").focus();
      return null;
    }
    if (action === "compile_manuscript" && !biographyState.chapters.length) {
      toast("Lisää ensin vähintään yksi luku.");
      return null;
    }
    await flushPendingSave();
    if (actionProjectId !== String(getProjectId() || "")) return null;
    chapter = currentChapter();
    if (["chapter_plan", "draft"].includes(action) && !chapter) return null;
    if (chapter) {
      biographyState.chapter_title = chapter.title;
      biographyState.chapter_focus = chapter.focus;
      biographyState.chapter_plan = chapter.plan;
      biographyState.draft = chapter.draft;
    }
    const payload = suppliedPayload || (chapter ? {
      chapter_id: chapter.id, chapter_title: chapter.title, chapter_focus: chapter.focus,
    } : {});
    const requestRevision = stateRevision;
    const requestState = JSON.parse(JSON.stringify(biographyState));
    $("working-label").textContent = WORKING_LABELS[action] || "Työstän tarinaasi…";
    $("working").hidden = false;
    document.querySelectorAll("[data-run]").forEach((button) => { button.disabled = true; });
    try {
      const response = await apiRunAction(action, biographyState, payload);
      if (actionProjectId !== String(getProjectId() || "")) return response;
      const liveChangedDuringRun = stateRevision !== requestRevision
        || !stateValuesEqual(biographyState, requestState);
      const responseState = normalizeBiographyState(response.data);
      mergeActionResponseState(biographyState, requestState, responseState, action, payload);
      render();
      if (liveChangedDuringRun) {
        scheduleSave();
      } else {
        setSaveStatus("Tallennettu automaattisesti juuri nyt", "saved");
      }
      if (options?.showResult !== false && !["compile_manuscript"].includes(action)) {
        openSheet(response.title || "Tulos", response.result || "", response.warnings);
      }
      return response;
    } catch (error) {
      if (actionProjectId !== String(getProjectId() || "")) return null;
      if (action === "compile_manuscript") {
        if (stateValuesEqual(biographyState.manuscript_text, requestState.manuscript_text)) {
          biographyState.manuscript_text = compileLocally();
        }
        renderManuscript();
        scheduleSave();
        toast("Käsikirjoitus koottiin lukuluonnoksista.");
        return null;
      }
      toast(error.message || "Toiminto epäonnistui.");
      throw error;
    } finally {
      $("working").hidden = true;
      document.querySelectorAll("[data-run]").forEach((button) => { button.disabled = false; });
    }
  }

  function openProjectMenu() {
    const menu = $("project-menu");
    menu.hidden = false;
    $("project-trigger").setAttribute("aria-expanded", "true");
    renderProjectMenu();
  }

  function closeProjectMenu() {
    $("project-menu").hidden = true;
    $("project-trigger").setAttribute("aria-expanded", "false");
  }

  function openModal(id) {
    modalReturnFocus = document.activeElement;
    $("modal-backdrop").hidden = false;
    $(id).hidden = false;
    $("workspace").setAttribute("aria-hidden", "true");
    const focusTarget = $(id).querySelector("input, textarea, select, button");
    if (focusTarget) focusTarget.focus();
  }

  function closeModals() {
    $("modal-backdrop").hidden = true;
    document.querySelectorAll(".modal, .result-sheet").forEach((modal) => { modal.hidden = true; });
    $("workspace").removeAttribute("aria-hidden");
    renderSettings();
    if (modalReturnFocus && document.contains(modalReturnFocus)) modalReturnFocus.focus();
    modalReturnFocus = null;
  }

  function openSheet(title, content, warning) {
    modalReturnFocus = document.activeElement;
    $("sheet-title").textContent = title;
    $("sheet-content").textContent = content;
    $("sheet-warning").hidden = !warning;
    $("sheet-warning").textContent = warning || "";
    $("modal-backdrop").hidden = false;
    $("result-sheet").hidden = false;
    $("workspace").setAttribute("aria-hidden", "true");
    $("sheet-close").focus();
  }

  function exportManuscriptText() {
    const title = (biographyState.manuscript_title || "Minun tarinani").trim();
    const text = (biographyState.manuscript_text || $("manuscript-text").value).trim();
    if (!text) return "";
    const firstLine = (text.split("\n", 1)[0] || "").replace(/^#\s*/, "").trim();
    return firstLine.localeCompare(title, "fi", { sensitivity: "base" }) === 0 ? text : `${title}\n\n${text}`.trim();
  }

  async function copyManuscript() {
    const text = exportManuscriptText();
    if (!text.trim()) { toast("Käsikirjoitus on vielä tyhjä."); return; }
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.className = "visually-hidden";
      document.body.appendChild(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
    }
    toast("Käsikirjoitus kopioitiin leikepöydälle.");
  }

  function downloadManuscript() {
    const title = biographyState.manuscript_title || "Minun tarinani";
    const text = exportManuscriptText();
    if (!text.trim()) { toast("Käsikirjoitus on vielä tyhjä."); return; }
    const safeName = title.toLowerCase().replace(/[^a-z0-9åäö]+/giu, "-").replace(/^-|-$/g, "") || "kasikirjoitus";
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeName}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function previewManuscript() {
    const text = exportManuscriptText();
    $("manuscript-preview").textContent = text || "Käsikirjoitus on vielä tyhjä.";
    openModal("preview-modal");
  }

  /* ------------------------------------------------------------ puheesta tekstiksi */

  function formatAudioDuration(seconds) {
    const safeSeconds = Math.max(0, Math.min(MAX_RECORDING_SECONDS, Math.floor(Number(seconds) || 0)));
    const minutes = Math.floor(safeSeconds / 60);
    const remainder = safeSeconds % 60;
    return `${minutes}:${String(remainder).padStart(2, "0")}`;
  }

  function setTranscriptionError(message) {
    const error = $("transcription-error");
    if (!error) return;
    error.textContent = message || "";
    error.hidden = !message;
  }

  function setTranscriptionPhase(phase, message) {
    transcriptionPhase = phase;
    const panel = $("transcription-panel");
    const feedback = $("transcription-feedback");
    const recordButton = $("btn-record-audio");
    const uploadButton = $("btn-upload-audio");
    const fileInput = $("audio-file-input");
    const cancelButton = $("btn-cancel-transcription");
    const progress = $("transcription-progress");
    const timer = $("recording-timer");
    const status = $("transcription-status");
    const busy = ["requesting", "recording", "preparing", "transcribing"].includes(phase);
    const recording = phase === "recording";
    const indeterminate = ["requesting", "preparing", "transcribing"].includes(phase);

    if (panel) panel.dataset.transcriptionState = phase;
    if (feedback) feedback.setAttribute("aria-busy", String(indeterminate));
    if (status && message) status.textContent = message;
    if (recordButton) {
      recordButton.disabled = !recording && (busy || !recordingSupported);
      recordButton.setAttribute("aria-pressed", String(recording));
    }
    if ($("record-audio-label")) {
      $("record-audio-label").textContent = recording ? "Lopeta ja litteroi" : "Aloita äänitys";
    }
    if (uploadButton) uploadButton.disabled = busy;
    if (fileInput) fileInput.disabled = busy;
    if ($("btn-add-material")) $("btn-add-material").disabled = busy;
    if (cancelButton) {
      cancelButton.hidden = !busy;
      cancelButton.textContent = phase === "transcribing" ? "Peruuta litterointi" : "Peruuta äänitys";
    }
    if (timer) timer.hidden = !recording;
    if (progress) {
      progress.hidden = !(recording || indeterminate);
      if (recording) {
        progress.max = MAX_RECORDING_SECONDS;
        progress.value = Math.min(MAX_RECORDING_SECONDS, recordingPcmLength / TRANSCRIPTION_SAMPLE_RATE);
      } else if (indeterminate) {
        progress.removeAttribute("value");
      } else {
        progress.max = MAX_RECORDING_SECONDS;
        progress.value = 0;
      }
    }
  }

  function failTranscription(message) {
    setTranscriptionPhase("error", "Litterointi ei onnistunut.");
    setTranscriptionError(message || "Yritä uudelleen hetken kuluttua.");
  }

  function pcmSampleToInt16(sample) {
    const clamped = Math.max(-1, Math.min(1, Number(sample) || 0));
    return clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }

  function resamplePcmChunk(input, state) {
    if (!input || !input.length) return new Int16Array(0);
    const chunkStart = state.inputSamplesSeen;
    const chunkEnd = chunkStart + input.length;
    const sourceStep = state.inputSampleRate / TRANSCRIPTION_SAMPLE_RATE;
    const output = [];

    while (state.nextOutputSourceIndex < chunkEnd - 1) {
      const relativeIndex = state.nextOutputSourceIndex - chunkStart;
      const lowerIndex = Math.floor(relativeIndex);
      const fraction = relativeIndex - lowerIndex;
      let lowerSample;
      let upperSample;

      if (lowerIndex < 0) {
        if (!state.hasPreviousSample) break;
        lowerSample = state.previousSample;
        upperSample = input[0];
      } else {
        lowerSample = input[lowerIndex];
        upperSample = input[lowerIndex + 1];
      }
      output.push(pcmSampleToInt16(lowerSample + (upperSample - lowerSample) * fraction));
      state.nextOutputSourceIndex += sourceStep;
    }

    state.inputSamplesSeen = chunkEnd;
    state.previousSample = input[input.length - 1];
    state.hasPreviousSample = true;
    return Int16Array.from(output);
  }

  function updateRecordingProgress() {
    const seconds = Math.min(MAX_RECORDING_SECONDS, recordingPcmLength / TRANSCRIPTION_SAMPLE_RATE);
    const progress = $("transcription-progress");
    const timer = $("recording-timer");
    if (progress && transcriptionPhase === "recording") progress.value = seconds;
    if (timer) timer.textContent = `${formatAudioDuration(seconds)} / ${formatAudioDuration(MAX_RECORDING_SECONDS)}`;
  }

  function storeRecordingChunk(input) {
    if (transcriptionPhase !== "recording" || !recordingResampler) return;
    const encoded = resamplePcmChunk(input, recordingResampler);
    const remaining = MAX_RECORDING_SAMPLES - recordingPcmLength;
    if (encoded.length && remaining > 0) {
      const kept = encoded.length > remaining ? encoded.slice(0, remaining) : encoded;
      recordingPcmChunks.push(kept);
      recordingPcmLength += kept.length;
    }
    updateRecordingProgress();

    if (recordingPcmLength >= MAX_RECORDING_SAMPLES && !recordingLimitStopRequested) {
      recordingLimitStopRequested = true;
      Promise.resolve().then(() => finishAudioRecording(true));
    }
  }

  function clearRecordingBuffer() {
    recordingPcmChunks = [];
    recordingPcmLength = 0;
    recordingResampler = null;
    recordingLimitStopRequested = false;
    updateRecordingProgress();
  }

  async function closeRecordingResources() {
    window.clearInterval(recordingTimer);
    recordingTimer = null;
    const processor = recordingProcessor;
    const source = recordingSource;
    const silentGain = recordingSilentGain;
    const stream = recordingStream;
    const context = recordingContext;
    recordingProcessor = null;
    recordingSource = null;
    recordingSilentGain = null;
    recordingStream = null;
    recordingContext = null;

    if (processor) {
      processor.onaudioprocess = null;
      try { processor.disconnect(); } catch (error) { /* yhteys on jo suljettu */ }
    }
    if (source) {
      try { source.disconnect(); } catch (error) { /* yhteys on jo suljettu */ }
    }
    if (silentGain) {
      try { silentGain.disconnect(); } catch (error) { /* yhteys on jo suljettu */ }
    }
    if (stream) stream.getTracks().forEach((track) => track.stop());
    if (context && context.state !== "closed") {
      try { await context.close(); } catch (error) { /* selain sulki kontekstin */ }
    }
  }

  function writeWaveText(view, offset, value) {
    for (let index = 0; index < value.length; index++) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  }

  function createRecordingWavFile(chunks, sampleCount) {
    const buffer = new ArrayBuffer(44 + sampleCount * 2);
    const view = new DataView(buffer);
    writeWaveText(view, 0, "RIFF");
    view.setUint32(4, 36 + sampleCount * 2, true);
    writeWaveText(view, 8, "WAVE");
    writeWaveText(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, TRANSCRIPTION_SAMPLE_RATE, true);
    view.setUint32(28, TRANSCRIPTION_SAMPLE_RATE * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeWaveText(view, 36, "data");
    view.setUint32(40, sampleCount * 2, true);

    let byteOffset = 44;
    chunks.forEach((chunk) => {
      for (let index = 0; index < chunk.length; index++) {
        view.setInt16(byteOffset, chunk[index], true);
        byteOffset += 2;
      }
    });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return new File([buffer], `elamakerta-aanitys-${timestamp}.wav`, { type: "audio/wav" });
  }

  function appendTranscriptToEditor(transcript) {
    const textarea = $("m-text");
    if (!textarea) return;
    const existing = textarea.value.trimEnd();
    textarea.value = existing ? `${existing}\n\n${transcript}` : transcript;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  async function transcriptionErrorMessage(response) {
    try {
      const payload = await response.json();
      if (payload && payload.detail) return String(payload.detail);
    } catch (error) {
      // Palvelin ei palauttanut JSON-virhettä.
    }
    if (response.status === 413) return "Äänitiedosto on liian suuri litteroitavaksi.";
    if (response.status === 415) return "Äänitiedoston muotoa ei tueta.";
    return `Litterointipalvelu palautti virheen (${response.status}).`;
  }

  function throwIfTranscriptionCancelled(controller) {
    if (!controller.signal.aborted && transcriptionPhase === "transcribing") return;
    const error = new Error("Litterointi peruttiin.");
    error.name = "AbortError";
    throw error;
  }

  async function transcribeAudioFile(file, sourceLabel) {
    const projectId = getProjectId();
    if (!projectId) {
      failTranscription("Valitse ensin elämäkertaprojekti.");
      return;
    }
    if (!file || !file.size) {
      failTranscription("Äänitiedosto on tyhjä.");
      return;
    }
    if (file.size > MAX_AUDIO_FILE_BYTES) {
      failTranscription("Äänitiedosto on liian suuri. Valitse enintään 25 Mt:n tiedosto.");
      return;
    }

    setTranscriptionError("");
    setTranscriptionPhase("transcribing", `${sourceLabel || "Ääni"} lähetetään ja litteroidaan…`);
    const controller = new AbortController();
    transcriptionController = controller;
    const formData = new FormData();
    formData.append("file", file, file.name || "elamakerta-audio.wav");
    formData.append("language_code", TRANSCRIPTION_LANGUAGE_CODE);

    try {
      const response = await doFetch(
        `${API_BASE}/projects/${encodeURIComponent(projectId)}/biography/transcribe`,
        { method: "POST", body: formData, signal: controller.signal },
      );
      throwIfTranscriptionCancelled(controller);
      if (!response.ok) {
        const message = await transcriptionErrorMessage(response);
        throwIfTranscriptionCancelled(controller);
        throw new Error(message);
      }
      const payload = await response.json();
      throwIfTranscriptionCancelled(controller);
      if (String(projectId) !== String(getProjectId())) {
        const projectChangedError = new Error("Projekti vaihtui litteroinnin aikana.");
        projectChangedError.name = "AbortError";
        throw projectChangedError;
      }
      const transcript = String(
        payload.text || payload.transcript || payload.data?.text || payload.data?.transcript || "",
      ).trim();
      if (!transcript) throw new Error("Litterointipalvelu ei palauttanut tekstiä.");
      appendTranscriptToEditor(transcript);
      setTranscriptionPhase(
        "success",
        "Litterointi valmis. Tarkista Sisältö-kenttä ja paina vasta sitten Lisää aineistoon.",
      );
      toast("Litterointi lisättiin tarkistettavaksi.");
    } catch (error) {
      if (error && error.name === "AbortError") {
        setTranscriptionPhase("idle", "Litterointi peruttiin. Ääntä tai tekstiä ei lisätty aineistoon.");
      } else {
        failTranscription(error?.message || "Litterointi epäonnistui. Yritä uudelleen.");
      }
    } finally {
      if (transcriptionController === controller) transcriptionController = null;
    }
  }

  function microphoneErrorMessage(error) {
    if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
      return "Mikrofonin käyttöä ei sallittu. Salli mikrofoni selaimen asetuksista tai tuo äänitiedosto.";
    }
    if (error?.name === "NotFoundError") return "Laitteelta ei löytynyt mikrofonia.";
    if (error?.name === "NotReadableError") return "Mikrofoni on toisen sovelluksen käytössä.";
    return "Mikrofonin käynnistäminen epäonnistui. Voit yrittää uudelleen tai tuoda äänitiedoston.";
  }

  async function startAudioRecording() {
    if (!getProjectId()) {
      failTranscription("Valitse ensin elämäkertaprojekti ennen äänitystä.");
      return;
    }
    if (!recordingSupported) {
      failTranscription("Tämä selain ei tue mikrofonin PCM-äänitystä. Voit tuoda valmiin äänitiedoston.");
      return;
    }

    setTranscriptionError("");
    setTranscriptionPhase("requesting", "Pyydetään mikrofonin käyttöoikeutta…");
    clearRecordingBuffer();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (transcriptionPhase !== "requesting") {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      recordingStream = stream;
      recordingContext = new AudioContextClass({ latencyHint: "interactive" });
      if (recordingContext.state === "suspended") await recordingContext.resume();
      if (transcriptionPhase !== "requesting" || !recordingContext) {
        await closeRecordingResources();
        return;
      }
      if (typeof recordingContext.createScriptProcessor !== "function") {
        throw new Error("Selain ei tue PCM-äänityksessä tarvittavaa Web Audio -toimintoa.");
      }
      recordingSource = recordingContext.createMediaStreamSource(stream);
      recordingProcessor = recordingContext.createScriptProcessor(4096, 1, 1);
      recordingSilentGain = recordingContext.createGain();
      recordingSilentGain.gain.value = 0;
      recordingResampler = {
        inputSampleRate: recordingContext.sampleRate,
        inputSamplesSeen: 0,
        nextOutputSourceIndex: 0,
        previousSample: 0,
        hasPreviousSample: false,
      };
      recordingProcessor.onaudioprocess = (event) => {
        storeRecordingChunk(event.inputBuffer.getChannelData(0));
      };
      recordingSource.connect(recordingProcessor);
      recordingProcessor.connect(recordingSilentGain);
      recordingSilentGain.connect(recordingContext.destination);
      setTranscriptionPhase("recording", "Äänitys käynnissä. Puhu rauhallisesti ja lopeta, kun olet valmis.");
      updateRecordingProgress();
      recordingTimer = window.setInterval(updateRecordingProgress, 250);
    } catch (error) {
      await closeRecordingResources();
      clearRecordingBuffer();
      if (["cancelling", "idle"].includes(transcriptionPhase)) return;
      const permissionOrDeviceError = [
        "NotAllowedError", "SecurityError", "NotFoundError", "NotReadableError",
      ].includes(error?.name);
      failTranscription(
        permissionOrDeviceError
          ? microphoneErrorMessage(error)
          : (error?.message || microphoneErrorMessage(error)),
      );
    }
  }

  async function finishAudioRecording(limitReached = false) {
    if (transcriptionPhase !== "recording") return;
    setTranscriptionPhase(
      "preparing",
      limitReached
        ? "10 minuutin enimmäisaika täyttyi. Valmistellaan ääntä litteroitavaksi…"
        : "Äänitys valmis. Valmistellaan ääntä litteroitavaksi…",
    );
    await closeRecordingResources();
    if (transcriptionPhase !== "preparing") return;
    if (!recordingPcmLength) {
      clearRecordingBuffer();
      failTranscription("Äänityksestä ei saatu ääntä. Tarkista mikrofoni ja yritä uudelleen.");
      return;
    }

    const wavFile = createRecordingWavFile(recordingPcmChunks, recordingPcmLength);
    clearRecordingBuffer();
    if (transcriptionPhase !== "preparing") return;
    await transcribeAudioFile(wavFile, "Äänitys");
  }

  async function cancelActiveTranscription() {
    const activePhase = transcriptionPhase;
    if (!["requesting", "recording", "preparing", "transcribing"].includes(activePhase)) return;
    transcriptionPhase = "cancelling";
    if (transcriptionController) transcriptionController.abort();
    await closeRecordingResources();
    clearRecordingBuffer();
    if (activePhase !== "transcribing") {
      setTranscriptionPhase("idle", "Äänitys peruttiin. Ääntä tai tekstiä ei lisätty aineistoon.");
    }
    setTranscriptionError("");
  }

  function audioFileIsSupported(file) {
    const extension = String(file?.name || "").split(".").pop().toLowerCase();
    const mimeType = String(file?.type || "").split(";")[0].toLowerCase();
    return SUPPORTED_AUDIO_EXTENSIONS.has(extension) || SUPPORTED_AUDIO_MIME_TYPES.has(mimeType);
  }

  async function handleAudioFileSelection(event) {
    const input = event.currentTarget;
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    if (!audioFileIsSupported(file)) {
      failTranscription("Valitse WAV-, MP3-, AIFF-, AAC-, OGG- tai FLAC-äänitiedosto.");
      return;
    }
    await transcribeAudioFile(file, `Tiedosto ${file.name}`);
  }

  function setupTranscription() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    recordingSupported = Boolean(navigator.mediaDevices?.getUserMedia && AudioContextClass);
    const recordButton = $("btn-record-audio");
    const uploadButton = $("btn-upload-audio");
    const fileInput = $("audio-file-input");
    const cancelButton = $("btn-cancel-transcription");

    recordButton.addEventListener("click", () => {
      if (transcriptionPhase === "recording") finishAudioRecording(false);
      else if (!["requesting", "preparing", "transcribing"].includes(transcriptionPhase)) startAudioRecording();
    });
    uploadButton.addEventListener("click", () => {
      if (!uploadButton.disabled) fileInput.click();
    });
    fileInput.addEventListener("change", handleAudioFileSelection);
    cancelButton.addEventListener("click", cancelActiveTranscription);
    setTranscriptionPhase(
      "idle",
      recordingSupported
        ? "Valitse äänitys tai tuo WAV-, MP3-, AIFF-, AAC-, OGG- tai FLAC-tiedosto."
        : "Mikrofoniäänitys ei ole tuettu tässä selaimessa. Voit tuoda äänitiedoston.",
    );
  }

  function cancelRecordingForNavigation() {
    if (["requesting", "recording", "preparing", "transcribing"].includes(transcriptionPhase)) {
      cancelActiveTranscription();
    }
  }

  function disposeTranscription() {
    if (transcriptionController) transcriptionController.abort();
    closeRecordingResources();
    clearRecordingBuffer();
  }

  function trapModalFocus(event) {
    if (event.key !== "Tab") return;
    const dialog = Array.from(document.querySelectorAll(".modal, .result-sheet")).find((item) => !item.hidden);
    if (!dialog) return;
    const focusable = Array.from(dialog.querySelectorAll(
      "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
    )).filter((item) => !item.hidden);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function bindEvents() {
    $("project-trigger").addEventListener("click", () => {
      if ($("project-menu").hidden) openProjectMenu(); else closeProjectMenu();
    });
    $("close-project-menu").addEventListener("click", closeProjectMenu);
    $("new-project-form").addEventListener("submit", createProject);
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".project-switcher") && !$("project-menu").hidden) closeProjectMenu();
    });
    document.querySelectorAll("[data-step-link]").forEach((button) => {
      button.addEventListener("click", (event) => { event.preventDefault(); showStep(button.dataset.stepLink); });
    });
    document.querySelectorAll("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.mode));
    });
    document.querySelectorAll("[data-prompt]").forEach((button) => {
      button.addEventListener("click", () => selectPrompt(button.dataset.prompt));
    });
    $("start-writing").addEventListener("click", () => selectPrompt(biographyState.current_question));
    $("start-speaking").addEventListener("click", () => {
      selectPrompt(biographyState.current_question);
      window.setTimeout(startAudioRecording, 60);
    });
    $("new-session").addEventListener("click", addSession);
    $("refresh-question").addEventListener("click", refreshQuestion);
    $("btn-add-material").addEventListener("click", submitInterviewAnswer);
    $("m-text").addEventListener("input", (event) => {
      biographyState.interview_draft = event.currentTarget.value;
      scheduleSave();
    });
    $("material-form").addEventListener("submit", addManualMaterial);
    $("btn-cancel-material-edit").addEventListener("click", resetMaterialForm);
    $("add-chapter").addEventListener("click", addChapter);
    $("delete-chapter").addEventListener("click", deleteChapter);
    $("move-chapter-up").addEventListener("click", () => moveChapter(-1));
    $("move-chapter-down").addEventListener("click", () => moveChapter(1));
    document.querySelectorAll("[data-chapter-field]").forEach((input) => input.addEventListener("input", updateChapterField));
    $("f-outline").addEventListener("input", (event) => { biographyState.outline = event.currentTarget.value; scheduleSave(); });
    $("manuscript-title").addEventListener("input", (event) => { biographyState.manuscript_title = event.currentTarget.value; scheduleSave(); });
    $("manuscript-text").addEventListener("input", (event) => { biographyState.manuscript_text = event.currentTarget.value; renderProgress(); scheduleSave(); });
    document.querySelectorAll("[data-run]").forEach((button) => {
      button.addEventListener("click", () => runAction(button.dataset.run).catch(() => null));
    });
    $("open-settings").addEventListener("click", () => { renderSettings(); openModal("settings-modal"); });
    $("save-settings").addEventListener("click", saveSettings);
    document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", closeModals));
    $("modal-backdrop").addEventListener("click", closeModals);
    $("sheet-close").addEventListener("click", closeModals);
    $("preview-manuscript").addEventListener("click", previewManuscript);
    $("copy-manuscript").addEventListener("click", copyManuscript);
    $("download-manuscript").addEventListener("click", downloadManuscript);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { closeProjectMenu(); closeModals(); }
      trapModalFocus(event);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushPendingSave({ bestEffort: true });
    });
  }

  window.ElamakertaModule = {
    loadState,
    render,
    deactivate: cancelActiveTranscription,
    getState: () => biographyState,
    selectProject: (projectId) => {
      const project = projectById(projectId);
      return project ? selectProject(project, { notifyParent: false }) : Promise.reject(new Error("Projektia ei löytynyt."));
    },
    __test: {
      defaultBiographyState,
      normalizeBiographyState,
      normalizeLoadedBiographyState,
      resolveInitialProject,
      applyProjectMode,
      migrateLegacyAnswersToInterview,
      appendInterviewAnswerToState,
      updateMaterialInState,
      removeMaterialFromState,
      rebuildLegacyAnswers,
      appendChapterToState,
      removeChapterFromState,
      createSerialQueue,
      uniqueProjectTitle,
      mergeActionResponseState,
      shouldWarnBeforeUnload,
    },
  };

  document.addEventListener("DOMContentLoaded", async () => {
    bindEvents();
    setupTranscription();
    try {
      await chooseInitialProject();
      if (getProjectId()) await loadState();
    } catch (error) {
      biographyState = defaultBiographyState();
      render();
      setSaveStatus("Projektien lataus epäonnistui", "error");
      toast(error.message || "Projektien lataus epäonnistui.");
    }
  });
  window.addEventListener("beforeunload", handleBeforeUnload);
  window.addEventListener("pagehide", () => { flushPendingSave({ bestEffort: true, keepalive: true }); });
  window.addEventListener("pagehide", disposeTranscription);
})();
