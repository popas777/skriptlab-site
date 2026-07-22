/* ==========================================================================
   Käsikirjoitukset – mobiilikäyttöliittymän logiikka
   API-sopimus (manuscript-paketti):
     GET    {api}/projects
     POST   {api}/projects                       (luonti/päivitys, replace_chapters)
     POST   {api}/projects/import                (multipart file)
     GET    {api}/projects/{id}
     DELETE {api}/projects/{id}
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
  const ACTIVE_PROJECT_ID_KEY = "skriptlab_active_project_id";

  let demoMode = CONFIG.demo === true;
  let projects = [];
  let project = null;          // aktiivinen projekti (ProjectSchema)
  let projectStageAssets = { misc: [], covers: [], layout: [] };
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

  function activeProjectId() {
    try {
      return localStorage.getItem(ACTIVE_PROJECT_ID_KEY) || "";
    } catch (error) {
      return "";
    }
  }

  function rememberActiveProject(selected) {
    if (!selected || !selected.id) return;
    try {
      localStorage.setItem(ACTIVE_PROJECT_ID_KEY, String(selected.id));
      localStorage.setItem("skriptlab_manuscript", JSON.stringify(selected));
    } catch (error) {
      /* localStorage voi olla pois käytöstä upotetussa näkymässä. */
    }
    notifyParent("skriptlab:project-selected", {
      projectId: String(selected.id),
      project: selected,
    });
  }

  function forgetActiveProject(projectId) {
    if (!projectId || String(activeProjectId()) !== String(projectId)) return;
    try {
      localStorage.removeItem(ACTIVE_PROJECT_ID_KEY);
      localStorage.removeItem("skriptlab_manuscript");
      localStorage.removeItem("skriptlab_raw_text");
    } catch (error) {
      /* ohitetaan */
    }
  }

  function notifyParent(type, payload) {
    if (!window.parent || window.parent === window) return;
    try {
      window.parent.postMessage(Object.assign({ type }, payload || {}), window.location.origin);
    } catch (error) {
      /* Parent-ikkunaa ei ole pakko olla. */
    }
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

  function structureTitle(chapter, index) {
    return String((chapter && (chapter.toc_title || chapter.title)) || "Luku " + (index + 1)).trim();
  }

  function projectTextWithHeadings(sourceProject) {
    return (sourceProject.chapters || []).map((chapter, index) => {
      const title = structureTitle(chapter, index);
      return [title].concat(chapter.paragraphs || []).filter(Boolean).join("\n\n");
    }).join("\n\n");
  }

  function kindFromHeading(title) {
    const text = String(title || "").trim().toLocaleLowerCase("fi-FI");
    if (/^(osa|part)\s+[\divxlcdm]+/.test(text)) return "part";
    if (/^(sisällysluettelo|sisallysluettelo|nimiölehti|nimiolehti|tekijänoikeus|tekijanoikeus|omistuskirjoitus|epigrafi|esipuhe|johdanto)\b/.test(text)) return "front";
    if (/^(jälkisanat|jalkisanat|liitteet|liite|sanasto|bibliografia|kiitokset|tietoja kirjailijasta|huomautukset|hakemisto|kolofoni)\b/.test(text)) return "back";
    return "main";
  }

  function headingFromLine(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text || text.length > 150) return "";
    if (/^(luku|chapter)\s+(?:\d+|[ivxlcdm]+)\b(?:\s*[:.\-–)]?\s*[^.!?]{0,110})?$/i.test(text)) return text;
    if (/^(osa|part)\s+(?:\d+|[ivxlcdm]+)\b(?:\s*[:.\-–)]?\s*[^.!?]{0,110})?$/i.test(text)) return text;
    if (/^(prologi|epilogi|esipuhe|johdanto|sisällysluettelo|sisallysluettelo|jälkisanat|jalkisanat|kiitokset|sanasto|bibliografia|hakemisto|kolofoni)$/i.test(text)) return text;
    return "";
  }

  function splitTrailingHeading(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    const match = text.match(/\b(?:luku|chapter|osa|part)\s+(?:\d+|[ivxlcdm]+)\b(?:\s*[:.\-–)]?\s*[^.!?]{0,110})?$/i);
    if (!match || match.index <= 0) return null;
    const before = text.slice(0, match.index).trim();
    const heading = headingFromLine(match[0]);
    if (!before || !heading || !/[.!?…:;)"”’]$/.test(before)) return null;
    return { before, heading };
  }

  function splitBlockToStructureParts(block) {
    const parts = [];
    const lines = String(block || "").split("\n").map((line) => line.trim()).filter(Boolean);
    const sourceLines = lines.length ? lines : [String(block || "").trim()].filter(Boolean);
    let textLines = [];
    const pushText = () => {
      const text = textLines.join("\n").trim();
      if (text) parts.push({ type: "text", text });
      textLines = [];
    };
    sourceLines.forEach((line) => {
      const heading = headingFromLine(line);
      if (heading) {
        pushText();
        parts.push({ type: "heading", text: heading });
        return;
      }
      const trailing = splitTrailingHeading(line);
      if (trailing) {
        textLines.push(trailing.before);
        pushText();
        parts.push({ type: "heading", text: trailing.heading });
        return;
      }
      textLines.push(line);
    });
    pushText();
    return parts;
  }

  function splitProjectByVisibleHeadings(sourceProject) {
    const blocks = textToParagraphs(projectTextWithHeadings(sourceProject));
    const chapters = [];
    let current = null;
    let chapterCounter = 0;
    let metaCounter = 0;

    const pushCurrent = () => {
      if (!current) return;
      if ((current.paragraphs || []).some((p) => String(p || "").trim()) || current.kind !== "main") {
        chapters.push(current);
      }
    };
    const startSection = (title) => {
      pushCurrent();
      const kind = kindFromHeading(title);
      if (kind === "main") chapterCounter += 1;
      else metaCounter += 1;
      const prefix = kind === "part" ? "osa" : kind === "front" ? "alku" : kind === "back" ? "loppu" : "luku";
      current = {
        id: prefix + "_" + (kind === "main" ? chapterCounter : metaCounter),
        title,
        toc_title: title,
        kind,
        paragraphs: [],
      };
    };

    blocks.forEach((block) => {
      splitBlockToStructureParts(block).forEach((part) => {
        if (part.type === "heading") {
          startSection(part.text);
          return;
        }
        if (!current) startSection("Luku 1");
        current.paragraphs.push(part.text);
      });
    });
    pushCurrent();
    return chapters.length ? chapters : [{ id: "luku_1", title: "Luku 1", toc_title: "Luku 1", kind: "main", paragraphs: blocks }];
  }

  function cloneChaptersForMetadata(chapters) {
    return (chapters || []).map((chapter, index) => ({
      id: chapter.id || "luku_" + (index + 1),
      title: structureTitle(chapter, index),
      toc_title: structureTitle(chapter, index),
      kind: chapter.kind || "main",
      paragraphs: (chapter.paragraphs || []).slice(),
    }));
  }

  function metadataOnlyProposal(rawProposal) {
    const current = cloneChaptersForMetadata(project.chapters || []);
    const incoming = rawProposal && Array.isArray(rawProposal.chapters) ? rawProposal.chapters : [];
    const byId = new Map(incoming.map((chapter) => [String(chapter.id || ""), chapter]));
    const sameLength = incoming.length === current.length;
    const chapters = current.map((chapter, index) => {
      const suggested = byId.get(String(chapter.id || "")) || (sameLength ? incoming[index] : null);
      if (!suggested) return chapter;
      const title = structureTitle(suggested, index) || structureTitle(chapter, index);
      return Object.assign({}, chapter, {
        toc_title: title,
        kind: suggested.kind || chapter.kind || "main",
        paragraphs: (chapter.paragraphs || []).slice(),
      });
    });
    const warnings = (rawProposal && rawProposal.warnings ? rawProposal.warnings.slice() : []);
    if (incoming.length !== current.length) {
      warnings.push("AI-ehdotus sisälsi eri määrän osioita kuin nykyinen käsikirjoitus. Lisätyt tai puuttuvat osiot ohitettiin, jotta teksti ei muutu.");
    }
    return {
      source: rawProposal && rawProposal.source === "ai" ? "ai" : "rule_based",
      mode: "metadata",
      chapters,
      requires_chapter_replacement: false,
      warnings,
    };
  }

  function paragraphSequence(chapters) {
    return (chapters || []).flatMap((chapter) => (chapter.paragraphs || []).map((paragraph) => String(paragraph || "")));
  }

  function sameParagraphSequence(leftChapters, rightChapters) {
    const left = paragraphSequence(leftChapters);
    const right = paragraphSequence(rightChapters);
    return left.length === right.length && left.every((paragraph, index) => paragraph === right[index]);
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

  async function apiListProjectStageAssets(projectId) {
    if (demoMode) return { misc: [], covers: [], layout: [] };
    const [misc, covers, layout] = await Promise.allSettled([
      api("/projects/" + projectId + "/misc-assets"),
      api("/projects/" + projectId + "/cover-images"),
      api("/projects/" + projectId + "/layout-assets"),
    ]);
    return {
      misc: misc.status === "fulfilled" && Array.isArray(misc.value) ? misc.value : [],
      covers: covers.status === "fulfilled" && Array.isArray(covers.value) ? covers.value : [],
      layout: layout.status === "fulfilled" && Array.isArray(layout.value) ? layout.value : [],
    };
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
    if (demoMode) {
      const target = demo.projects.find((p) => p.id === projectId);
      if (!target) throw new Error("Projektia ei löydy.");
      const byId = new Map((target.chapters || []).map((chapter) => [String(chapter.id || ""), chapter]));
      target.chapters = chapters.map((item, index) => {
        const existing = byId.get(String(item.id || "")) || target.chapters[index] || {};
        return Object.assign({}, existing, {
          id: item.id || existing.id || "luku_" + (index + 1),
          title: item.title || item.toc_title || existing.title || "Luku " + (index + 1),
          toc_title: item.toc_title || item.title || existing.toc_title || existing.title || "Luku " + (index + 1),
          kind: item.kind || existing.kind || "main",
          paragraphs: (existing.paragraphs || []).slice(),
        });
      });
      return JSON.parse(JSON.stringify(target));
    }
    const structure = chapters.map((c) => ({ id: c.id, title: c.title, toc_title: c.toc_title, kind: c.kind }));
    return api("/projects/" + projectId + "/structure", jsonOptions("PATCH", { chapters: structure }));
  }

  async function apiPatchMetadata(projectId, analysis) {
    if (demoMode) return apiSaveProject({ id: projectId, analysis });
    return api("/projects/" + projectId + "/metadata", jsonOptions("PATCH", { analysis }));
  }

  async function apiRenameProject(projectId, title) {
    if (demoMode) {
      const target = demo.projects.find((p) => String(p.id) === String(projectId));
      if (!target) throw new Error("Projektia ei löydy.");
      target.title = title;
      return JSON.parse(JSON.stringify(target));
    }
    return api("/projects/" + projectId + "/metadata", jsonOptions("PATCH", { title }));
  }

  async function apiDeleteProject(projectId) {
    if (demoMode) {
      const before = demo.projects.length;
      demo.projects = demo.projects.filter((p) => String(p.id) !== String(projectId));
      if (demo.projects.length === before) throw new Error("Projektia ei löydy.");
      return { status: "ok" };
    }
    return api("/projects/" + projectId, { method: "DELETE" });
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
      const [loadedProject, loadedAssets] = await Promise.all([
        apiGetProject(id),
        apiListProjectStageAssets(id),
      ]);
      project = loadedProject;
      projectStageAssets = loadedAssets;
      rememberActiveProject(project);
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

  function canDeleteProject(item) {
    const level = item.access_level || "";
    return !level || level === "owner" || level === "admin";
  }

  function canRenameProject(item) {
    const level = item.access_level || "";
    return !level || level === "owner" || level === "admin" || level === "shared_edit";
  }

  async function renameProjectFromLibrary(item, form) {
    const input = form.querySelector(".project-title-edit");
    const status = form.querySelector(".project-rename-status");
    const saveBtn = form.querySelector(".project-rename-save");
    const title = String(input?.value || "").trim();
    if (!title) {
      if (status) status.textContent = "Nimi ei voi olla tyhjä.";
      input?.focus();
      return;
    }

    try {
      if (saveBtn) saveBtn.disabled = true;
      if (status) status.textContent = "Tallennetaan nimeä…";
      const updated = await apiRenameProject(item.id, title);
      item.title = updated.title || title;
      item.author = updated.author || item.author;
      const listItem = projects.find((projectItem) => String(projectItem.id) === String(item.id));
      if (listItem) Object.assign(listItem, item);
      if (project && String(project.id) === String(item.id)) {
        project.title = item.title;
        project.author = item.author;
        rememberActiveProject(project);
        renderProject();
      }
      notifyParent("skriptlab:project-renamed", {
        projectId: String(item.id),
        title: item.title,
        project: updated,
      });
      if (status) status.textContent = "Nimi tallennettu.";
      form.hidden = true;
      renderLibrary();
    } catch (error) {
      if (status) status.textContent = error.message || "Nimen tallennus epäonnistui.";
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  async function deleteProjectFromLibrary(item) {
    if (!item || !item.id) return;
    const title = item.title || "Nimetön käsikirjoitus";
    const confirmed = confirm('Poistetaanko käsikirjoitus "' + title + '" pysyvästi?\n\nTätä ei voi perua.');
    if (!confirmed) return;

    try {
      working(true, "Poistetaan käsikirjoitusta…");
      await apiDeleteProject(item.id);
      if (project && String(project.id) === String(item.id)) {
        project = null;
        proposal = null;
        showScreen("library");
      }
      forgetActiveProject(item.id);
      notifyParent("skriptlab:project-deleted", { projectId: String(item.id) });
      await renderLibrary();
      toast("Käsikirjoitus poistettu.");
    } catch (error) {
      toast(error.message || "Poisto epäonnistui.");
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
    const activeId = activeProjectId();
    for (const item of items) {
      const li = document.createElement("li");
      li.className = "project-card" + (String(item.id) === String(activeId) ? " is-active" : "");

      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "project-open";
      const status = item.analysis_status === "completed" ? '<span class="badge done">Analysoitu</span>'
        : item.analysis_status === "partial" ? '<span class="badge">Osittainen analyysi</span>' : "";
      const current = String(item.id) === String(activeId) ? '<span class="badge current">Valittuna</span>' : "";
      openBtn.innerHTML =
        "<h3>" + escapeHtml(item.title) + "</h3>" +
        '<span class="meta">' + escapeHtml(item.author || "Tekijä puuttuu") + " · " +
        item.chapter_count + " lukua</span> " + current + status;
      openBtn.addEventListener("click", () => openProject(item.id));
      li.appendChild(openBtn);

      const canRename = canRenameProject(item);
      const canDelete = canDeleteProject(item);
      if (canRename || canDelete) {
        const actions = document.createElement("div");
        actions.className = "project-card-actions";
        let renameForm = null;
        if (canRename) {
          const renameBtn = document.createElement("button");
          renameBtn.type = "button";
          renameBtn.className = "project-rename-toggle";
          renameBtn.textContent = "Nimeä";
          renameBtn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!renameForm) return;
            renameForm.hidden = !renameForm.hidden;
            if (!renameForm.hidden) {
              const input = renameForm.querySelector(".project-title-edit");
              input.focus();
              input.select();
            }
          });
          actions.appendChild(renameBtn);
        }
        if (canDelete) {
          const deleteBtn = document.createElement("button");
          deleteBtn.type = "button";
          deleteBtn.className = "project-delete";
          deleteBtn.textContent = "Poista";
          deleteBtn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            deleteProjectFromLibrary(item);
          });
          actions.appendChild(deleteBtn);
        }
        li.appendChild(actions);

        if (canRename) {
          renameForm = document.createElement("form");
          renameForm.className = "project-rename-form";
          renameForm.hidden = true;
          renameForm.innerHTML =
            '<label class="field-label" for="rename-project-' + escapeHtml(item.id) + '">Uusi nimi</label>' +
            '<input id="rename-project-' + escapeHtml(item.id) + '" class="project-title-edit" type="text" value="' + escapeHtml(item.title || "") + '">' +
            '<div class="project-rename-actions">' +
              '<button class="project-rename-cancel" type="button">Peruuta</button>' +
              '<button class="project-rename-save" type="submit">Tallenna</button>' +
            '</div>' +
            '<p class="project-rename-status" role="status" aria-live="polite"></p>';
          renameForm.addEventListener("submit", (event) => {
            event.preventDefault();
            event.stopPropagation();
            renameProjectFromLibrary(item, renameForm);
          });
          renameForm.querySelector(".project-rename-cancel")?.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            renameForm.hidden = true;
            const input = renameForm.querySelector(".project-title-edit");
            if (input) input.value = item.title || "";
          });
          li.appendChild(renameForm);
        }
      }

      list.appendChild(li);
    }
  }

  /* ------------------------------------------------------------ projektin polku */

  function projectHasText() {
    return (project?.chapters || []).some((chapter) =>
      (chapter.paragraphs || []).some((paragraph) => String(paragraph || "").trim())
    );
  }

  function projectStageStatus(done, progress) {
    if (done) return "done";
    if (progress) return "progress";
    return "todo";
  }

  function projectStageStatusLabel(status) {
    if (status === "done") return "Valmis ✓";
    if (status === "progress") return "Kesken";
    return "Aloittamatta";
  }

  function hasSavedAnalysis(analysis) {
    if (!analysis || typeof analysis !== "object") return false;
    return ANALYSIS_SECTIONS.concat(META_SECTIONS).some(([field]) => String(analysis[field] || "").trim());
  }

  function structureIsDone(analysis) {
    return analysis.structure_completed === true
      || ["accepted", "accepted_metadata", "accepted_reparse"].includes(analysis.structure_status);
  }

  function structureIsStarted(analysis) {
    return Boolean(
      structureIsDone(analysis)
      || analysis.structure_status
      || analysis.structure_completed_at
      || (project?.chapters || []).length > 1
    );
  }

  function hasMiscAssets() {
    return (projectStageAssets.misc || []).some((asset) =>
      ["misc_material", "book_misc_material"].includes(asset.asset_type)
    );
  }

  function hasCoverAssets() {
    return (projectStageAssets.covers || []).some((asset) =>
      ["cover_image", "back_cover_image", "full_cover_image"].includes(asset.asset_type)
    );
  }

  function hasLayoutAssets() {
    return (projectStageAssets.layout || []).some((asset) =>
      ["layout_latex", "layout_pdf", "layout_epub"].includes(asset.asset_type)
    );
  }

  function pathSteps() {
    const analysis = project.analysis || {};
    const analysisDone = analysis.analysis_status === "completed" || (!analysis.analysis_status && hasSavedAnalysis(analysis));
    const analysisProgress = analysis.analysis_status === "partial" || (analysis.analysis_status && analysis.analysis_status !== "completed");
    const coverPromptStarted = Boolean(analysis.cover_prompt || analysis.cover_prompts || analysis.cover_image_note);
    return [
      { id: "kasikirjoitus", num: 1, name: "Käsikirjoitus", desc: (project.chapters || []).length + " lukua",
        status: projectStageStatus(projectHasText(), false) },
      { id: "analyysi", num: 2, name: "Analyysi", desc: "Arvio, synopsis ja metatiedot",
        status: projectStageStatus(analysisDone, analysisProgress) },
      { id: "rakenne", num: 3, name: "Rakenne", desc: "Sisällysluettelo ja osajako",
        status: projectStageStatus(structureIsDone(analysis), structureIsStarted(analysis)) },
      { id: "oheisaineistot", num: 4, name: "Oheisaineistot", desc: "Nimiölehti, copysivu ja hakemistot",
        status: projectStageStatus(hasMiscAssets(), false), moduleView: "view-muut-toiminnot" },
      { id: "kansi", num: 5, name: "Kansi", desc: "Etukansi, takakansi tai koko kansi",
        status: projectStageStatus(hasCoverAssets(), coverPromptStarted), moduleView: "view-kuvitus" },
      { id: "taitto", num: 6, name: "Taitto", desc: "PDF, LaTeX ja EPUB",
        status: projectStageStatus(hasLayoutAssets(), false), moduleView: "view-kirja" },
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
      btn.className = "path-step is-" + step.status;
      btn.innerHTML =
        '<span class="step-name"><span class="step-num">' + step.num + "</span>" + escapeHtml(step.name) + "</span>" +
        '<span class="step-status">' + escapeHtml(projectStageStatusLabel(step.status)) + "</span>" +
        '<span class="step-desc">' + escapeHtml(step.desc) + "</span>";
      btn.addEventListener("click", () => openPathStep(step));
      path.appendChild(btn);
    }
  }

  function openPathStep(step) {
    if (["kasikirjoitus", "analyysi", "rakenne"].includes(step.id)) {
      renderStepView(step.id);
      showScreen(step.id);
      return;
    }
    if (step.moduleView) {
      notifyParent("skriptlab:open-module", { viewId: step.moduleView });
      toast("Avataan moduuli pääsovelluksessa.");
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

    $("proposal-note").textContent = proposal.mode === "reparse"
      ? "Hyväksyntä tallentaa uuden osiojaon näkyvien otsikkorivien perusteella."
      : "Hyväksyntä päivittää vain osioiden nimet ja metatiedot – teksti ei muutu.";
  }

  async function createProposal(useAi) {
    try {
      working(true, useAi ? "Tekoäly ehdottaa metatietoja…" : "Jaetaan näkyvien otsikoiden mukaan…");
      if (useAi) {
        const rawProposal = await apiProposal(project.id, true, $("f-structure-instructions").value);
        proposal = metadataOnlyProposal(rawProposal);
      } else {
        proposal = {
          source: "rule_based",
          mode: "reparse",
          chapters: splitProjectByVisibleHeadings(project),
          requires_chapter_replacement: true,
          warnings: [],
        };
      }
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
      const acceptedMode = proposal.mode === "reparse" ? "reparse" : "metadata";
      working(true, "Tallennetaan rakennetta…");
      if (acceptedMode === "reparse") {
        project = await apiSaveProject({
          id: project.id, title: project.title, author: project.author,
          replace_chapters: true, chapters: proposal.chapters,
        });
      } else {
        if (!sameParagraphSequence(project.chapters, proposal.chapters)) {
          throw new Error("Rakenne-ehdotus yritti muuttaa tekstikappaleita. Käytä tekstin jakamiseen Jaa otsikoiden mukaan -toimintoa.");
        }
        project = await apiPatchStructure(project.id, proposal.chapters);
      }
      await apiPatchMetadata(project.id, {
        structure_completed: true,
        structure_status: acceptedMode === "reparse" ? "accepted_reparse" : "accepted_metadata",
        structure_completed_at: new Date().toISOString(),
      });
      project = await apiGetProject(project.id);
      proposal = null;
      renderStructure();
      renderProject();
      toast(acceptedMode === "reparse" ? "Uusi osiojako hyväksytty." : "Metatiedot hyväksytty.");
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
          if (projectId && (pendingInitialStep || requestedProjectId)) await openProject(projectId);
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
