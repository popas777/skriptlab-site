/* ==========================================================================
   Käsikirjoitukset – mobiilikäyttöliittymän logiikka
   API-sopimus (manuscript-paketti):
     GET    {api}/projects
     POST   {api}/projects                       (luonti/päivitys, replace_chapters)
     POST   {api}/projects/import                (multipart file)
     GET    {api}/projects/{id}
     PATCH  {api}/projects/{id}/chapters/{index}
     PATCH  {api}/projects/{id}/structure
     PATCH  {api}/projects/{id}/metadata
     POST   {api}/analyze/jobs  +  GET {api}/analyze/jobs/{jobId}
     POST   {api}/projects/{id}/structure/proposal
   Ilman backendiä toimii demotilassa (tila vain muistissa).
   ========================================================================== */

(function () {
  "use strict";

  const CONFIG = window.MANUSKRIPTI_CONFIG || {};
  const API_BASE = (CONFIG.apiBase || "/api").replace(/\/$/, "");
  const doFetch = CONFIG.fetchImpl || ((url, options) => fetch(url, options));

  let demoMode = CONFIG.demo === true;
  let projects = [];
  let project = null;          // aktiivinen projekti (ProjectSchema)
  let proposal = null;         // viimeisin rakenne-ehdotus
  let pollTimer = null;
  let saveTimer = null;
  let sheetContext = null;     // { type: "chapter"|"analysis", ... }
  const params = new URLSearchParams(window.location.search);
  const requestedStep = params.get("step") || "";
  const requestedProjectId = params.get("project") || "";
  let pendingInitialStep = ["kasikirjoitus", "analyysi", "rakenne"].includes(requestedStep) ? requestedStep : "";

  const ANALYSIS_SECTIONS = [
    ["editorial_assessment", "Toimituksellinen arvio"],
    ["synopsis", "Synopsis"],
    ["style", "Tyyli"],
    ["chapter_analysis", "Lukukohtainen erittely"],
    ["glossary", "Sanasto ja nimet"],
    ["marketing_short", "Markkinointiteksti (lyhyt)"],
    ["marketing_long", "Markkinointiteksti (pitkä)"],
    ["backcover", "Takakansiteksti"],
  ];

  const META_SECTIONS = [
    ["audience", "Kohderyhmä"],
    ["genre", "Genre"],
    ["library_class", "Kirjastoluokka"],
    ["thema_classes", "Thema-luokat"],
    ["onix", "ONIX-avainsanat"],
    ["cover_prompt", "Kansikuvakuvaus"],
    ["cover_prompts", "Kansikuvavaihtoehdot"],
  ];

  const KIND_LABELS = { front: "Etusivut", part: "Osa", main: "Pääteksti", back: "Lopputekstit" };

  /* ------------------------------------------------------------ apurit */

  const $ = (id) => document.getElementById(id);

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
  }

  let toastTimer = null;
  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
  }

  function working(show, label) {
    const el = $("working");
    const labelEl = $("working-label");
    if (!el) return;
    el.hidden = !show;
    el.setAttribute("aria-busy", show ? "true" : "false");
    if (label && labelEl) labelEl.textContent = label;
  }

  function wordCount(chapter) {
    return (chapter.paragraphs || []).join(" ").split(/\s+/).filter(Boolean).length;
  }

  function chapterText(chapter) {
    return (chapter.paragraphs || []).join("\n\n");
  }

  function textToParagraphs(text) {
    return String(text || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  }

  /* ------------------------------------------------------------ demotila */

  const demo = {
    projects: [],
    nextId: 1,

    splitChapters(text) {
      const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
      const chapters = [];
      let current = null;
      const isHeading = (line) =>
        line.length <= 80 &&
        (/^(LUKU|Luku|OSA|Osa)\s+\d+/.test(line) ||
          /^(PROLOGI|EPILOGI|ESIPUHE|JOHDANTO)$/i.test(line) ||
          (line === line.toUpperCase() && /[A-ZÅÄÖ]/.test(line) && line.split(/\s+/).length <= 8 && !/[.!?,]$/.test(line)));
      for (const block of blocks) {
        const lines = block.split("\n");
        if (isHeading(lines[0].trim())) {
          current = { id: "luku_" + (chapters.length + 1), title: lines[0].trim(), toc_title: lines[0].trim(), kind: "main", paragraphs: [] };
          chapters.push(current);
          const rest = lines.slice(1).join("\n").trim();
          if (rest) current.paragraphs.push(rest);
        } else {
          if (!current) {
            current = { id: "luku_1", title: "Luku 1", toc_title: "Luku 1", kind: "main", paragraphs: [] };
            chapters.push(current);
          }
          current.paragraphs.push(block);
        }
      }
      return chapters.length ? chapters : [{ id: "luku_1", title: "Luku 1", toc_title: "Luku 1", kind: "main", paragraphs: blocks }];
    },

    demoText(field) {
      return "Demotila: yhdistä backend saadaksesi oikean tekoälytuloksen kenttään \"" + field + "\".";
    },
  };

  /* ------------------------------------------------------------ API */

  async function api(path, options) {
    const response = await doFetch(API_BASE + path, options);
    if (!response.ok) {
      let detail = "";
      try { detail = (await response.json()).detail || ""; } catch (e) { /* ohitetaan */ }
      throw new Error(detail || "Pyyntö epäonnistui (" + response.status + ")");
    }
    return response.json();
  }

  const jsonOptions = (method, body) => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  async function apiListProjects() {
    if (demoMode) {
      return demo.projects.map((p) => ({
        id: p.id, title: p.title, author: p.author, source_filename: p.source_filename,
        chapter_count: p.chapters.length, updated_at: "",
        analysis_status: (p.analysis || {}).analysis_status || "",
      }));
    }
    return api("/projects?summary=true");
  }

  async function apiGetProject(id) {
    if (demoMode) {
      const found = demo.projects.find((p) => p.id === id);
      if (!found) throw new Error("Projektia ei löydy.");
      return JSON.parse(JSON.stringify(found));
    }
    return api("/projects/" + id);
  }

  async function apiSaveProject(data) {
    if (demoMode) {
      let target = data.id ? demo.projects.find((p) => p.id === data.id) : null;
      if (!target) {
        target = { id: demo.nextId++, title: "", author: "", source_filename: "", chapters: [], analysis: {} };
        demo.projects.push(target);
      }
      target.title = data.title || target.title || "Nimetön käsikirjoitus";
      if ("author" in data) target.author = data.author;
      if ("source_filename" in data) target.source_filename = data.source_filename;
      if (data.replace_chapters || (data.chapters || []).length) target.chapters = data.chapters || [];
      if (data.analysis) Object.assign(target.analysis, data.analysis);
      return JSON.parse(JSON.stringify(target));
    }
    return api("/projects", jsonOptions("POST", data));
  }

  async function apiImportFile(file) {
    if (demoMode) {
      const name = file.name.toLowerCase();
      if (!name.endsWith(".txt") && !name.endsWith(".md")) {
        throw new Error("Demotilassa voi tuoda vain txt- ja md-tiedostoja. Docx vaatii backendin.");
      }
      const text = await file.text();
      const created = await apiSaveProject({
        title: file.name.replace(/\.[^.]+$/, ""),
        source_filename: file.name,
        chapters: demo.splitChapters(text),
      });
      return { project: created, warnings: [] };
    }
    const form = new FormData();
    form.append("file", file);
    return api("/projects/import", { method: "POST", body: form });
  }

  async function apiPatchChapter(projectId, index, chapter) {
    if (demoMode) {
      const target = demo.projects.find((p) => p.id === projectId);
      target.chapters[index] = chapter;
      return JSON.parse(JSON.stringify(target));
    }
    return api("/projects/" + projectId + "/chapters/" + index, jsonOptions("PATCH", { chapter }));
  }

  async function apiPatchStructure(projectId, chapters) {
    if (demoMode) return apiSaveProject({ id: projectId, replace_chapters: true, chapters });
    const structure = chapters.map((c) => ({ id: c.id, title: c.title, toc_title: c.toc_title, kind: c.kind }));
    return api("/projects/" + projectId + "/structure", jsonOptions("PATCH", { chapters: structure }));
  }

  async function apiPatchMetadata(projectId, analysis) {
    if (demoMode) return apiSaveProject({ id: projectId, analysis });
    return api("/projects/" + projectId + "/metadata", jsonOptions("PATCH", { analysis }));
  }

  async function apiStartAnalysis(projectId) {
    if (demoMode) return { job_id: 1, status: "queued", current: 0, total: 1 };
    return api("/analyze/jobs", jsonOptions("POST", { project_id: projectId }));
  }

  async function apiPollAnalysis(jobId) {
    if (demoMode) {
      const data = { analysis_status: "completed", analysis_warnings: "Demotila käytössä." };
      for (const [field] of ANALYSIS_SECTIONS.concat(META_SECTIONS)) data[field] = demo.demoText(field);
      await apiPatchMetadata(project.id, data);
      return { status: "completed", current: 1, total: 1, label: "Valmis", data, errors: [] };
    }
    return api("/analyze/jobs/" + jobId);
  }

  async function apiProposal(projectId, useAi, instructions) {
    if (demoMode) {
      const chapters = project.chapters.map((c, i) => ({
        id: c.id, title: c.title, kind: c.kind || "main",
        toc_title: c.kind === "main" || !c.kind ? "Luku " + (i + 1) + ": " + (c.toc_title || c.title) : (c.toc_title || c.title),
        paragraphs: c.paragraphs.slice(),
      }));
      return {
        source: useAi ? "ai" : "rule_based", chapters,
        requires_chapter_replacement: false,
        warnings: useAi ? ["Demotila: tämä on sääntöpohjainen näyte ilman tekoälyä."] : [],
      };
    }
    return api("/projects/" + projectId + "/structure/proposal",
      jsonOptions("POST", { use_ai: useAi, extra_instructions: instructions || "" }));
  }

  /* ------------------------------------------------------------ navigointi */

  function showScreen(name) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("is-active"));
    $("view-" + name).classList.add("is-active");
    window.scrollTo(0, 0);
  }

  async function openProject(id) {
    try {
      working(true, "Avataan käsikirjoitusta…");
      project = await apiGetProject(id);
      proposal = null;
      renderProject();
      if (pendingInitialStep) {
        const step = pendingInitialStep;
        pendingInitialStep = "";
        renderStepView(step);
        showScreen(step);
      } else {
        showScreen("project");
      }
    } catch (error) {
      toast(error.message);
    } finally {
      working(false);
    }
  }

  /* ------------------------------------------------------------ kirjasto */

  async function renderLibrary() {
    let items = [];
    try {
      items = await apiListProjects();
      projects = items;
      $("library-status").textContent = demoMode ? "Demotila – tila vain muistissa." : "";
    } catch (error) {
      if (!demoMode) {
        demoMode = true;
        $("library-status").textContent = "Backend ei vastannut – siirryttiin demotilaan.";
        items = [];
      }
    }
    const list = $("project-list");
    list.innerHTML = "";
    $("library-empty").hidden = items.length > 0;
    for (const item of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "project-card";
      const status = item.analysis_status === "completed" ? '<span class="badge done">Analysoitu</span>'
        : item.analysis_status === "partial" ? '<span class="badge">Osittainen analyysi</span>' : "";
      btn.innerHTML =
        "<h3>" + escapeHtml(item.title) + "</h3>" +
        '<span class="meta">' + escapeHtml(item.author || "Tekijä puuttuu") + " · " +
        item.chapter_count + " lukua</span> " + status;
      btn.addEventListener("click", () => openProject(item.id));
      list.appendChild(btn);
    }
  }

  /* ------------------------------------------------------------ projektin polku */

  function pathSteps() {
    const analysis = project.analysis || {};
    return [
      { id: "kasikirjoitus", num: 1, name: "Käsikirjoitus", desc: (project.chapters || []).length + " lukua",
        done: (project.chapters || []).some((c) => (c.paragraphs || []).length) },
      { id: "analyysi", num: 2, name: "Analyysi", desc: "Arvio, synopsis ja metatiedot",
        done: analysis.analysis_status === "completed" || analysis.analysis_status === "partial" },
      { id: "rakenne", num: 3, name: "Rakenne", desc: "Sisällysluettelo ja osajako",
        done: analysis.structure_status === "accepted" },
    ];
  }

  function renderProject() {
    $("project-title").textContent = project.title || "Nimetön käsikirjoitus";

    const chips = $("project-meta-chips");
    chips.innerHTML = "";
    const analysis = project.analysis || {};
    for (const [field, label] of [["genre", ""], ["library_class", ""], ["audience", ""]]) {
      const value = String(analysis[field] || "").split("\n")[0].trim();
      if (value && !value.startsWith("Demotila")) {
        const span = document.createElement("span");
        span.className = "badge";
        span.textContent = value.length > 40 ? value.slice(0, 40) + "…" : value;
        span.title = label;
        chips.appendChild(span);
      }
    }

    const path = $("project-path");
    path.innerHTML = "";
    for (const step of pathSteps()) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "path-step" + (step.done ? " is-done" : "");
      btn.innerHTML =
        '<span class="step-name"><span class="step-num">' + step.num + "</span>" + escapeHtml(step.name) + "</span>" +
        '<span class="step-status">' + (step.done ? "Valmis ✓" : escapeHtml(step.desc)) + "</span>";
      btn.addEventListener("click", () => { renderStepView(step.id); showScreen(step.id); });
      path.appendChild(btn);
    }
  }

  function renderStepView(stepId) {
    if (stepId === "kasikirjoitus") renderChapters();
    if (stepId === "analyysi") renderAnalysis();
    if (stepId === "rakenne") renderStructure();
  }

  /* ------------------------------------------------------------ luvut */

  function tocItem(chapter, subtitle, onClick) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toc-item";
    btn.dataset.kind = chapter.kind || "main";
    btn.innerHTML =
      '<span class="kind-dot" aria-hidden="true"></span>' +
      '<span class="toc-text"><span class="toc-title">' + escapeHtml(chapter.toc_title || chapter.title || "Nimetön") + "</span>" +
      '<span class="toc-meta">' + escapeHtml(subtitle) + "</span></span>";
    if (onClick) btn.addEventListener("click", onClick);
    else btn.disabled = true;
    li.appendChild(btn);
    return li;
  }

  function renderChapters() {
    $("f-title").value = project.title || "";
    $("f-author").value = project.author || "";
    const list = $("chapter-list");
    list.innerHTML = "";
    $("chapter-count").textContent = String((project.chapters || []).length);
    (project.chapters || []).forEach((chapter, index) => {
      const words = wordCount(chapter);
      const subtitle = KIND_LABELS[chapter.kind || "main"] + (words ? " · " + words + " sanaa" : " · ei tekstiä");
      list.appendChild(tocItem(chapter, subtitle, () => openChapterSheet(index)));
    });
  }

  function openChapterSheet(index) {
    const chapter = project.chapters[index];
    sheetContext = { type: "chapter", index };
    $("sheet-title").textContent = chapter.toc_title || chapter.title || "Luku";
    $("sheet-title-field").hidden = false;
    $("sheet-toc-title").value = chapter.toc_title || chapter.title || "";
    $("sheet-text-label").textContent = "Luvun teksti";
    $("sheet-textarea").value = chapterText(chapter);
    openSheet();
  }

  async function saveChapterSheet() {
    const { index } = sheetContext;
    const chapter = Object.assign({}, project.chapters[index]);
    chapter.toc_title = $("sheet-toc-title").value.trim() || chapter.toc_title;
    chapter.paragraphs = textToParagraphs($("sheet-textarea").value);
    try {
      working(true, "Tallennetaan lukua…");
      project = await apiPatchChapter(project.id, index, chapter);
      renderChapters();
      renderProject();
      toast("Luku tallennettu.");
    } catch (error) {
      toast(error.message);
    } finally {
      working(false);
      closeSheet();
    }
  }

  function scheduleProjectInfoSave() {
    clearTimeout(saveTimer);
    $("save-status").textContent = "Tallennetaan…";
    saveTimer = setTimeout(async () => {
      try {
        project = await apiSaveProject({
          id: project.id,
          title: $("f-title").value.trim() || "Nimetön käsikirjoitus",
          author: $("f-author").value.trim(),
        });
        $("save-status").textContent = demoMode ? "Demotila – tila vain muistissa." : "Tallennettu ✓";
        $("project-title").textContent = project.title;
      } catch (error) {
        $("save-status").textContent = "Tallennus epäonnistui.";
      }
    }, 900);
  }

  /* ------------------------------------------------------------ analyysi */

  function renderAnalysis() {
    const analysis = project.analysis || {};
    const container = $("analysis-sections");
    container.innerHTML = "";
    const hasAny = ANALYSIS_SECTIONS.concat(META_SECTIONS).some(([field]) => analysis[field]);
    $("analysis-empty").hidden = hasAny;

    if (!hasAny) return;

    const buildSection = ([field, label], open) => {
      const details = document.createElement("details");
      details.className = "analysis-section";
      if (open) details.open = true;
      const value = String(analysis[field] || "");
      details.innerHTML =
        "<summary>" + escapeHtml(label) + "</summary>" +
        '<div class="section-body"><div class="result-text">' + escapeHtml(value || "–") + "</div></div>";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "edit-link";
      edit.textContent = "Muokkaa";
      edit.addEventListener("click", () => openAnalysisSheet(field, label));
      details.querySelector(".section-body").appendChild(edit);
      return details;
    };

    ANALYSIS_SECTIONS.forEach((section, i) => container.appendChild(buildSection(section, i === 0)));

    const metaHeading = document.createElement("h3");
    metaHeading.className = "list-title";
    metaHeading.style.margin = "18px 0 10px";
    metaHeading.textContent = "Metatiedot";
    container.appendChild(metaHeading);
    META_SECTIONS.forEach((section) => container.appendChild(buildSection(section, false)));

    if (analysis.analysis_warnings) {
      const warn = document.createElement("div");
      warn.className = "warnings";
      warn.textContent = analysis.analysis_warnings;
      container.appendChild(warn);
    }
  }

  function openAnalysisSheet(field, label) {
    sheetContext = { type: "analysis", field };
    $("sheet-title").textContent = label;
    $("sheet-title-field").hidden = true;
    $("sheet-text-label").textContent = label;
    $("sheet-textarea").value = String((project.analysis || {})[field] || "");
    openSheet();
  }

  async function saveAnalysisSheet() {
    const { field } = sheetContext;
    try {
      working(true, "Tallennetaan…");
      project = await apiPatchMetadata(project.id, { [field]: $("sheet-textarea").value });
      renderAnalysis();
      renderProject();
      toast("Tallennettu.");
    } catch (error) {
      toast(error.message);
    } finally {
      working(false);
      closeSheet();
    }
  }

  async function runAnalysis() {
    $("btn-run-analysis").disabled = true;
    $("analysis-progress").hidden = false;
    $("analysis-empty").hidden = true;
    setAnalysisProgress({ status: "queued", current: 0, total: 0, label: "Analyysi jonossa…" });

    try {
      const job = await apiStartAnalysis(project.id);
      pollAnalysis(job.job_id);
    } catch (error) {
      toast(error.message);
      $("btn-run-analysis").disabled = false;
      $("analysis-progress").hidden = true;
    }
  }

  function setAnalysisProgress(job) {
    const percent = job.total ? Math.round((job.current / job.total) * 100) : 8;
    $("analysis-progress-fill").style.width = Math.max(8, percent) + "%";
    $("analysis-progress-label").textContent = job.label || job.message || "Analyysi käynnissä…";
    $("analysis-progress-detail").textContent = job.total ? "Vaihe " + job.current + " / " + job.total : "";
  }

  function pollAnalysis(jobId) {
    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      try {
        const job = await apiPollAnalysis(jobId);
        setAnalysisProgress(job);
        if (["completed", "partial", "failed"].includes(job.status)) {
          clearInterval(pollTimer);
          $("btn-run-analysis").disabled = false;
          $("analysis-progress").hidden = true;
          if (job.status === "failed") {
            toast("Analyysi epäonnistui: " + ((job.errors || [])[0] || "tuntematon virhe"));
          } else {
            project = await apiGetProject(project.id);
            renderAnalysis();
            renderProject();
            toast(job.status === "partial" ? "Analyysi valmistui osittain." : "Analyysi valmis.");
          }
        }
      } catch (error) {
        clearInterval(pollTimer);
        $("btn-run-analysis").disabled = false;
        toast("Analyysin seuranta katkesi: " + error.message);
      }
    }, 1500);
  }

  /* ------------------------------------------------------------ rakenne */

  function renderStructure() {
    const list = $("structure-toc");
    list.innerHTML = "";
    (project.chapters || []).forEach((chapter) => {
      const words = wordCount(chapter);
      const subtitle = KIND_LABELS[chapter.kind || "main"] + (words ? " · " + words + " sanaa" : " · metarivi");
      list.appendChild(tocItem(chapter, subtitle, null));
    });
    renderProposal();
  }

  function renderProposal() {
    const card = $("proposal-card");
    if (!proposal) { card.hidden = true; return; }
    card.hidden = false;
    $("proposal-source").textContent = proposal.source === "ai" ? "Tekoäly" : "Sääntöpohjainen";

    const warnings = $("proposal-warnings");
    warnings.hidden = !(proposal.warnings || []).length;
    warnings.textContent = (proposal.warnings || []).join("\n");

    const list = $("proposal-list");
    list.innerHTML = "";
    proposal.chapters.forEach((chapter) => {
      const words = wordCount(chapter);
      const subtitle = KIND_LABELS[chapter.kind || "main"] + (words ? " · " + words + " sanaa" : " · metarivi");
      list.appendChild(tocItem(chapter, subtitle, null));
    });

    $("proposal-note").textContent = proposal.requires_chapter_replacement
      ? "Hyväksyntä järjestää kappaleet uudelleen lukuihin."
      : "Hyväksyntä päivittää vain otsikot ja järjestyksen – teksti ei muutu.";
  }

  async function createProposal(useAi) {
    try {
      working(true, useAi ? "Tekoäly suunnittelee rakennetta…" : "Tunnistetaan osioita…");
      proposal = await apiProposal(project.id, useAi, $("f-structure-instructions").value);
      renderProposal();
      $("proposal-card").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      toast(error.message);
    } finally {
      working(false);
    }
  }

  async function acceptProposal() {
    if (!proposal) return;
    try {
      working(true, "Tallennetaan rakennetta…");
      if (proposal.requires_chapter_replacement) {
        project = await apiSaveProject({
          id: project.id, title: project.title, author: project.author,
          replace_chapters: true, chapters: proposal.chapters,
        });
      } else {
        project = await apiPatchStructure(project.id, proposal.chapters);
      }
      await apiPatchMetadata(project.id, {
        structure_completed: true,
        structure_status: "accepted",
        structure_completed_at: new Date().toISOString(),
      });
      project = await apiGetProject(project.id);
      proposal = null;
      renderStructure();
      renderProject();
      toast("Rakenne hyväksytty.");
    } catch (error) {
      toast(error.message);
    } finally {
      working(false);
    }
  }

  /* ------------------------------------------------------------ arkki */

  function openSheet() {
    $("sheet-backdrop").hidden = false;
    $("edit-sheet").hidden = false;
    $("sheet-textarea").focus();
  }

  function closeSheet() {
    $("sheet-backdrop").hidden = true;
    $("edit-sheet").hidden = true;
    sheetContext = null;
  }

  /* ------------------------------------------------------------ käynnistys */

  function bindEvents() {
    $("btn-upload").addEventListener("click", () => $("file-input").click());
    $("file-input").addEventListener("change", async (event) => {
      const file = event.target.files[0];
      event.target.value = "";
      if (!file) return;
      try {
        working(true, "Tuodaan käsikirjoitusta…");
        const result = await apiImportFile(file);
        (result.warnings || []).forEach(toast);
        await renderLibrary();
        await openProject(result.project.id);
      } catch (error) {
        toast(error.message);
      } finally {
        working(false);
      }
    });

    $("btn-new-empty").addEventListener("click", async () => {
      try {
        const created = await apiSaveProject({
          title: "Uusi käsikirjoitus",
          chapters: [{ id: "luku_1", title: "Luku 1", toc_title: "Luku 1", kind: "main", paragraphs: [] }],
        });
        await renderLibrary();
        await openProject(created.id);
      } catch (error) {
        toast(error.message);
      }
    });

    document.querySelectorAll("[data-goto]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const target = btn.dataset.goto;
        if (target === "library") renderLibrary();
        if (target === "project") renderProject();
        if (["kasikirjoitus", "analyysi", "rakenne"].includes(target)) renderStepView(target);
        showScreen(target);
      })
    );

    $("f-title").addEventListener("input", scheduleProjectInfoSave);
    $("f-author").addEventListener("input", scheduleProjectInfoSave);

    $("btn-run-analysis").addEventListener("click", runAnalysis);
    $("btn-rule-proposal").addEventListener("click", () => createProposal(false));
    $("btn-ai-proposal").addEventListener("click", () => createProposal(true));
    $("btn-accept-proposal").addEventListener("click", acceptProposal);
    $("btn-reject-proposal").addEventListener("click", () => { proposal = null; renderProposal(); });

    $("sheet-cancel").addEventListener("click", closeSheet);
    $("sheet-backdrop").addEventListener("click", closeSheet);
    $("sheet-save").addEventListener("click", () => {
      if (!sheetContext) return;
      if (sheetContext.type === "chapter") saveChapterSheet();
      else saveAnalysisSheet();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    working(false);
    bindEvents();
    window.ManuskriptiModule = {
      async loadState() {
        working(false);
        try {
          await renderLibrary();
          const projectId = requestedProjectId || localStorage.getItem("skriptlab_active_project_id") || "";
          if (projectId && pendingInitialStep) await openProject(projectId);
        } catch (error) {
          toast(error.message || "Moduulin lataus epäonnistui.");
        } finally {
          working(false);
        }
      }
    };
    window.ManuskriptiModule.loadState().catch((error) => {
      toast(error.message || "Moduulin lataus epäonnistui.");
      working(false);
    });
  });
})();
