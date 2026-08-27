/* ==========================================================================
   Elämäkerta – mobiilikäyttöliittymän logiikka
   API-sopimus:
     GET   {apiBase}/projects/{id}/biography
     PATCH {apiBase}/projects/{id}/biography        { data }
     POST  {apiBase}/projects/{id}/biography/transcribe  multipart { file, language_code }
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
  let demoState = null; // demotilan "backend"
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
    if (["requesting", "recording", "preparing"].includes(transcriptionPhase)) {
      cancelActiveTranscription();
    }
  }

  function disposeTranscription() {
    if (transcriptionController) transcriptionController.abort();
    closeRecordingResources();
    clearRecordingBuffer();
  }

  /* ------------------------------------------------------------ aineisto */

  function addMaterial() {
    const title = $("m-title").value.trim();
    const text = $("m-text").value.trim();
    if (!text) { toast("Kirjoita tai litteroi ensin sisältö."); $("m-text").focus(); return; }
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
      btn.addEventListener("click", () => { cancelRecordingForNavigation(); showStep("home"); })
    );
    document.querySelectorAll("[data-goto]").forEach((btn) =>
      btn.addEventListener("click", () => { cancelRecordingForNavigation(); showStep(btn.dataset.goto); })
    );

    // AI-toiminnot
    document.querySelectorAll("[data-run]").forEach((btn) =>
      btn.addEventListener("click", () => runAction(btn.dataset.run))
    );

    // Aineisto
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
    setupTranscription();
    loadState();
  });
  window.addEventListener("pagehide", disposeTranscription);
})();
