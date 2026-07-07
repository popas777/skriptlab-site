/* ==========================================================================
   Kirjoita ja editoi – yhdistetyn moduulin logiikka
   API-sopimus:
     GET    {api}/projects/{id}
     POST   {api}/projects                        (replace_chapters kappalejaon muutoksiin)
     PATCH  {api}/projects/{id}/chapters/{index}
     PATCH  {api}/projects/{id}/structure         (vain otsikot/järjestys/lisäykset)
     POST   {api}/edit/actions                    (improve | italics | restructure)
     POST   {api}/edit                            (fallback vanhaan reittiin)
   Ilman backendiä toimii demotilassa (näytekäsikirjoitus muistissa).
   ========================================================================== */

(function () {
  "use strict";

  const CONFIG = window.TYOSTO_CONFIG || {};
  const API_BASE = (CONFIG.apiBase || "/api").replace(/\/$/, "");
  const doFetch = CONFIG.fetchImpl || ((url, options) => fetch(url, options));
  const ACTIVE_PROJECT_ID_KEY = "skriptlab_active_project_id";
  const initialMode = CONFIG.mode === "editoi" ? "editoi" : "kirjoita";

  let demoMode = CONFIG.demo === true;
  let project = null;
  let cIndex = 0;                 // aktiivinen osio
  let pIndex = 0;                 // aktiivinen kappale (Editoi, scope=paragraph)
  let mode = "kirjoita";          // kirjoita | editoi
  let scope = "paragraph";        // paragraph | chapter
  let massScope = "chapter";      // chapter | book
  let suggestion = null;          // { original, action }
  let writingTimer = null;
  let undoSnapshot = null;        // { chapters, cIndex, label }
  let undoTimer = null;
  let legacyEditOnly = false;     // true jos /edit/actions puuttuu backendistä

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
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  function working(show, label) {
    const el = $("working");
    const labelEl = $("working-label");
    if (!el) return;
    el.hidden = !show;
    el.setAttribute("aria-busy", show ? "true" : "false");
    if (label && labelEl) labelEl.textContent = label;
  }

  function setSaveStatus(text) { $("save-status").textContent = text || ""; }

  function activeProjectId() {
    try {
      return localStorage.getItem(ACTIVE_PROJECT_ID_KEY) || "";
    } catch (error) {
      return "";
    }
  }

  function notifyParent(type, payload) {
    if (!window.parent || window.parent === window) return;
    try {
      window.parent.postMessage(Object.assign({ type }, payload || {}), window.location.origin);
    } catch (error) {
      /* Upotettu parent ei ole pakollinen standalone-käytössä. */
    }
  }

  function setProject(next, options) {
    options = options || {};
    project = next;
    if (project && project.id) {
      try {
        localStorage.setItem(ACTIVE_PROJECT_ID_KEY, String(project.id));
        localStorage.setItem("skriptlab_manuscript", JSON.stringify(project));
      } catch (error) {
        /* localStorage voi olla pois käytöstä upotetussa näkymässä. */
      }
      if (options.notify !== false) {
        notifyParent("skriptlab:project-selected", {
          projectId: String(project.id),
          project,
        });
      }
    }
    return project;
  }

  const textToParagraphs = (text) =>
    String(text || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const paragraphsToText = (paragraphs) => (paragraphs || []).join("\n\n");

  function currentChapter() { return project.chapters[cIndex]; }

  function chapterEditorText(chapter) {
    const title = (chapter.toc_title || chapter.title || "").trim();
    const body = paragraphsToText(chapter.paragraphs);
    if (!title) return body;
    return body ? "# " + title + "\n\n" + body : "# " + title;
  }

  function parseChapterEditorText(chapter, text) {
    const updated = Object.assign({}, chapter);
    const lines = String(text || "").split("\n");
    let bodyStart = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const match = line.match(/^(#{1,4})\s+(.+?)\s*$/);
      if (match) {
        updated.toc_title = match[2].trim();
        if (!chapter.title || chapter.title === chapter.toc_title) updated.title = match[2].trim();
        bodyStart = i + 1;
      }
      break;
    }
    updated.paragraphs = textToParagraphs(lines.slice(bodyStart).join("\n"));
    return updated;
  }

  /* ------------------------------------------------------------ sanadiff */

  function wordDiffHtml(original, edited) {
    const tokenize = (text) => String(text || "").split(/(\s+)/).filter((t) => t.length);
    const a = tokenize(original);
    const b = tokenize(edited);
    if (a.length > 1400 || b.length > 1400) {
      return "<em>Teksti on liian pitkä sanatarkkaan vertailuun. Näet muutokset Ehdotus-välilehdellä.</em>";
    }
    // LCS-taulukko
    const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
    for (let i = a.length - 1; i >= 0; i--) {
      for (let j = b.length - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const parts = [];
    let i = 0, j = 0;
    const flush = (buffer, tag) => {
      if (!buffer.length) return;
      const html = escapeHtml(buffer.join(""));
      parts.push(tag ? "<" + tag + ">" + html + "</" + tag + ">" : html);
      buffer.length = 0;
    };
    const same = [], removed = [], added = [];
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        flush(removed, "del"); flush(added, "ins");
        same.push(a[i]); i++; j++;
      } else {
        flush(same, "");
        if (dp[i + 1][j] >= dp[i][j + 1]) { removed.push(a[i]); i++; }
        else { added.push(b[j]); j++; }
      }
    }
    flush(same, "");
    while (i < a.length) removed.push(a[i++]);
    while (j < b.length) added.push(b[j++]);
    flush(removed, "del"); flush(added, "ins");
    return parts.join("") || "<em>Ei muutoksia.</em>";
  }

  /* ------------------------------------------------------------ demotila */

  const demo = {
    project: {
      id: 0,
      title: "Näytekäsikirjoitus",
      author: "Demo",
      source_filename: "",
      analysis: {},
      chapters: [
        { id: "luku_1", title: "Luku 1", toc_title: "Aamu satamassa", kind: "main",
          paragraphs: [
            "Aamu valkeni satamassa hitaasti, ja  ja sumu makasi veden päällä kuin peitto.",
            "Elina veti takin tiukemmalle ja katsoi laituria pitkin kohti avomerta.",
            "Kukaan ei ollut vielä liikkeellä , vain lokit huusivat jossain korkealla.",
          ] },
        { id: "luku_2", title: "Luku 2", toc_title: "Kirje", kind: "main",
          paragraphs: [
            "Kirje odotti keittiön pöydällä samassa paikassa kuin eilen.",
            "Hän ei ollut avannut sitä, koska tiesi mitä se se sisälsi.",
          ] },
        { id: "luku_3", title: "Kiitokset", toc_title: "Kiitokset", kind: "back",
          paragraphs: ["Kiitos kaikille, jotka lukivat käsikirjoituksen eri vaiheissa."] },
      ],
    },

    improve(text) {
      return text
        .replace(/[ \t]{2,}/g, " ")
        .replace(/ ,/g, ",")
        .replace(/\b(\p{L}+)( \1\b)+/gu, "$1");
    },

    restructure(text) {
      const paragraphs = textToParagraphs(text);
      const out = [];
      paragraphs.forEach((p, index) => {
        if (index % 2 === 0) out.push("# Osio " + (index / 2 + 1));
        out.push(p);
      });
      return out.join("\n\n");
    },
  };

  /* ------------------------------------------------------------ API */

  async function api(path, options) {
    const response = await doFetch(API_BASE + path, options);
    if (!response.ok) {
      let detail = "";
      try { detail = (await response.json()).detail || ""; } catch (e) { /* ohitetaan */ }
      const error = new Error(detail || "Pyyntö epäonnistui (" + response.status + ")");
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  const jsonOptions = (method, body) => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  async function apiGetProject(id) {
    if (demoMode) return JSON.parse(JSON.stringify(demo.project));
    return api("/projects/" + id);
  }

  async function apiPatchChapter(index, chapter) {
    if (demoMode) {
      demo.project.chapters[index] = JSON.parse(JSON.stringify(chapter));
      return JSON.parse(JSON.stringify(demo.project));
    }
    const payload = { id: chapter.id, title: chapter.title, toc_title: chapter.toc_title,
                      kind: chapter.kind || "main", paragraphs: chapter.paragraphs };
    return api("/projects/" + project.id + "/chapters/" + index,
      jsonOptions("PATCH", { chapter: payload }));
  }

  async function apiPatchStructure(chapters) {
    if (demoMode) {
      return apiReplaceChapters(chapters);
    }
    const structure = chapters.map((c) => ({ id: c.id, title: c.title, toc_title: c.toc_title, kind: c.kind || "main" }));
    return api("/projects/" + project.id + "/structure", jsonOptions("PATCH", { chapters: structure }));
  }

  async function apiReplaceChapters(chapters) {
    if (demoMode) {
      demo.project.chapters = JSON.parse(JSON.stringify(chapters));
      return JSON.parse(JSON.stringify(demo.project));
    }
    return api("/projects", jsonOptions("POST", {
      id: project.id, title: project.title, author: project.author,
      replace_chapters: true, chapters,
    }));
  }

  async function apiEditAction(action, text, options) {
    options = options || {};
    if (demoMode) {
      await new Promise((r) => setTimeout(r, 500));
      if (action === "italics") {
        return { edited_text: text, warnings: ["Demotila: kursivointi vaatii backendin, tekstiä ei muutettu."] };
      }
      if (action === "restructure") {
        const edited = demo.restructure(text);
        return { edited_text: edited, chapters: null, warnings: ["Demotila: näytejako ilman tekoälyä."] };
      }
      return { edited_text: demo.improve(text), warnings: [] };
    }
    if (!legacyEditOnly) {
      try {
        return await api("/edit/actions", jsonOptions("POST", {
          action, text,
          instructions: options.instructions || "",
          italics_rules: options.italicsRules || [],
          temperature: options.temperature != null ? options.temperature : 0.3,
        }));
      } catch (error) {
        if (error.status !== 404 && error.status !== 405) throw error;
        legacyEditOnly = true; // backendissä vain vanha /edit
      }
    }
    // Fallback: rakennetaan prompti selaimessa vanhaa reittiä varten.
    const prompts = {
      improve: "Korjaa kielivirheet ja sujuvoita teksti. Säilytä merkitys, tyyli ja kappalejako. " + (options.instructions || ""),
      italics: "Lisää tekstiin *kursivointi*-merkinnät vain perustelluista kohdista. Älä muuta sanoja.",
      restructure: "Jaa teksti osioiksi markdown-otsikoilla (# Otsikko). Älä muuta tai lyhennä sisältöä. " + (options.instructions || ""),
    };
    const result = await api("/edit", jsonOptions("POST", {
      text, prompt: prompts[action], temperature: options.temperature != null ? options.temperature : 0.3,
    }));
    return { edited_text: result.edited_text, warnings: [] };
  }

  /* ------------------------------------------------------------ renderöinti */

  function clampSelection() {
    cIndex = Math.min(Math.max(0, cIndex), project.chapters.length - 1);
    const count = (currentChapter().paragraphs || []).length;
    pIndex = count ? Math.min(Math.max(0, pIndex), count - 1) : 0;
  }

  function renderChapterBar() {
    clampSelection();
    const chapter = currentChapter();
    $("chapter-title-text").textContent = chapter.toc_title || chapter.title || "Nimetön";
    const words = paragraphsToText(chapter.paragraphs).split(/\s+/).filter(Boolean).length;
    $("chapter-title-sub").textContent =
      (KIND_LABELS[chapter.kind || "main"]) + " · osio " + (cIndex + 1) + "/" + project.chapters.length +
      (words ? " · " + words + " sanaa" : "");
    $("btn-prev-chapter").disabled = cIndex === 0;
    $("btn-next-chapter").disabled = cIndex === project.chapters.length - 1;
  }

  function renderWriting() {
    $("writing-text").value = chapterEditorText(currentChapter());
  }

  function renderEditPanel() {
    const chapter = currentChapter();
    const paragraphs = chapter.paragraphs || [];
    $("paragraph-bar").style.display = scope === "paragraph" ? "" : "none";
    if (scope === "paragraph") {
      $("paragraph-status").textContent = paragraphs.length
        ? "Kappale " + (pIndex + 1) + "/" + paragraphs.length
        : "Ei kappaleita";
      $("btn-prev-paragraph").disabled = pIndex === 0;
      $("btn-next-paragraph").disabled = pIndex >= paragraphs.length - 1;
    }
    const original = scope === "paragraph" ? (paragraphs[pIndex] || "") : paragraphsToText(paragraphs);
    $("original-text").textContent = original || "(Osiossa ei ole vielä tekstiä.)";
  }

  function renderActivePanel() {
    renderChapterBar();
    if (mode === "kirjoita") renderWriting();
    else renderEditPanel();
  }

  function switchMode(next) {
    if (next === mode) return;
    if (mode === "kirjoita") flushWritingSave();
    mode = next;
    dismissSuggestion();
    $("mode-kirjoita").classList.toggle("is-active", mode === "kirjoita");
    $("mode-editoi").classList.toggle("is-active", mode === "editoi");
    $("mode-kirjoita").setAttribute("aria-selected", String(mode === "kirjoita"));
    $("mode-editoi").setAttribute("aria-selected", String(mode === "editoi"));
    $("panel-kirjoita").hidden = mode !== "kirjoita";
    $("panel-editoi").hidden = mode !== "editoi";
    renderActivePanel();
  }

  function gotoChapter(nextIndex) {
    if (mode === "kirjoita") flushWritingSave();
    dismissSuggestion();
    cIndex = nextIndex;
    pIndex = 0;
    renderActivePanel();
  }

  /* ------------------------------------------------------------ kirjoita: autosave */

  function scheduleWritingSave() {
    clearTimeout(writingTimer);
    setSaveStatus("Tallennetaan…");
    writingTimer = setTimeout(saveWritingNow, 1200);
  }

  async function saveWritingNow() {
    clearTimeout(writingTimer);
    writingTimer = null;
    const updated = parseChapterEditorText(currentChapter(), $("writing-text").value);
    project.chapters[cIndex] = updated;
    try {
      setProject(await apiPatchChapter(cIndex, updated));
      clampSelection();
      setSaveStatus(demoMode ? "Demotila" : "Tallennettu ✓");
      renderChapterBar();
    } catch (error) {
      setSaveStatus("Tallennus epäonnistui");
      toast(error.message);
    }
  }

  function flushWritingSave() {
    if (writingTimer) saveWritingNow();
  }

  /* ------------------------------------------------------------ kirjoita: muotoilut */

  function applyBlockFormat(prefix) {
    const area = $("writing-text");
    const value = area.value;
    const lineStart = value.lastIndexOf("\n", area.selectionStart - 1) + 1;
    let lineEnd = value.indexOf("\n", area.selectionStart);
    if (lineEnd === -1) lineEnd = value.length;
    const line = value.slice(lineStart, lineEnd).replace(/^#{1,4}\s+/, "");
    const newLine = prefix ? prefix + " " + line : line;
    area.value = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
    area.focus();
    scheduleWritingSave();
  }

  function wrapSelection(before, after, placeholder) {
    const area = $("writing-text");
    const start = area.selectionStart, end = area.selectionEnd;
    const selected = area.value.slice(start, end) || placeholder;
    area.value = area.value.slice(0, start) + before + selected + after + area.value.slice(end);
    area.selectionStart = start + before.length;
    area.selectionEnd = start + before.length + selected.length;
    area.focus();
    scheduleWritingSave();
  }

  /* ------------------------------------------------------------ editoi: AI-ehdotus */

  function selectedEditText() {
    const chapter = currentChapter();
    return scope === "paragraph"
      ? (chapter.paragraphs || [])[pIndex] || ""
      : paragraphsToText(chapter.paragraphs);
  }

  async function runImprove() {
    const original = selectedEditText();
    if (!original.trim()) { toast("Valitussa kohdassa ei ole tekstiä."); return; }
    try {
      working(true, "Tekoäly muokkaa tekstiä…");
      const result = await apiEditAction("improve", original, {
        instructions: $("edit-instructions").value,
        temperature: parseFloat($("edit-temperature").value),
      });
      (result.warnings || []).forEach(toast);
      showSuggestion(original, result.edited_text, "improve");
    } catch (error) {
      toast(error.message);
    } finally {
      working(false);
    }
  }

  function showSuggestion(original, edited, action) {
    suggestion = { original, action };
    $("suggestion-card").hidden = false;
    $("suggestion-text").value = edited;
    $("suggestion-note").textContent = scope === "paragraph"
      ? "Korvaa vain valitun kappaleen. Voit muokata ehdotusta ennen hyväksyntää."
      : "Korvaa koko osion tekstin. Voit muokata ehdotusta ennen hyväksyntää.";
    showSuggestionTab("suggestion");
    $("suggestion-card").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function showSuggestionTab(which) {
    const isDiff = which === "diff";
    $("tab-suggestion").classList.toggle("is-active", !isDiff);
    $("tab-diff").classList.toggle("is-active", isDiff);
    $("suggestion-text").hidden = isDiff;
    $("diff-view").hidden = !isDiff;
    if (isDiff && suggestion) {
      $("diff-view").innerHTML = wordDiffHtml(suggestion.original, $("suggestion-text").value);
    }
  }

  function dismissSuggestion() {
    suggestion = null;
    $("suggestion-card").hidden = true;
  }

  async function acceptSuggestion() {
    if (!suggestion) return;
    const edited = $("suggestion-text").value;
    const chapter = Object.assign({}, currentChapter());
    if (scope === "paragraph") {
      const paragraphs = (chapter.paragraphs || []).slice();
      const pieces = textToParagraphs(edited);
      paragraphs.splice(pIndex, 1, ...(pieces.length ? pieces : [""]));
      chapter.paragraphs = paragraphs.filter(Boolean);
    } else {
      chapter.paragraphs = textToParagraphs(edited);
    }
    try {
      working(true, "Tallennetaan…");
      project.chapters[cIndex] = chapter;
      setProject(await apiPatchChapter(cIndex, chapter));
      clampSelection();
      dismissSuggestion();
      renderActivePanel();
      toast("Teksti korvattu.");
    } catch (error) {
      toast(error.message);
    } finally {
      working(false);
    }
  }

  /* ------------------------------------------------------------ osioarkki */

  function openSheet(id) {
    $("sheet-backdrop").hidden = false;
    $(id).hidden = false;
  }

  function closeSheets() {
    $("sheet-backdrop").hidden = true;
    $("chapter-sheet").hidden = true;
    $("mass-sheet").hidden = true;
  }

  function renderChapterSheet() {
    const container = $("chapter-sheet-list");
    container.innerHTML = "";
    const groups = [["front", []], ["main", []], ["back", []]];
    project.chapters.forEach((chapter, index) => {
      const kind = chapter.kind === "front" || chapter.kind === "back" ? chapter.kind : "main";
      groups.find(([g]) => g === kind)[1].push(index);
    });
    for (const [kind, indices] of groups) {
      if (!indices.length) continue;
      const title = document.createElement("p");
      title.className = "group-title";
      title.textContent = KIND_LABELS[kind];
      container.appendChild(title);
      const list = document.createElement("ul");
      list.className = "sheet-list";
      for (const index of indices) {
        const chapter = project.chapters[index];
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "toc-item" + (index === cIndex ? " is-current" : "");
        btn.dataset.kind = chapter.kind || "main";
        const words = paragraphsToText(chapter.paragraphs).split(/\s+/).filter(Boolean).length;
        btn.innerHTML =
          '<span class="kind-dot" aria-hidden="true"></span>' +
          '<span class="toc-text"><span class="toc-title">' + escapeHtml(chapter.toc_title || chapter.title || "Nimetön") + "</span>" +
          '<span class="toc-meta">' + (words ? words + " sanaa" : "ei tekstiä") + "</span></span>";
        btn.addEventListener("click", () => {
          closeSheets();
          gotoChapter(index);
        });
        li.appendChild(btn);
        list.appendChild(li);
      }
      container.appendChild(list);
    }
  }

  async function addChapter() {
    const kind = $("new-chapter-kind").value;
    const defaultTitle = { main: "Uusi luku", part: "Uusi osa", front: "Esipuhe", back: "Kiitokset" }[kind];
    const title = $("new-chapter-title").value.trim() || defaultTitle;
    const newChapter = {
      id: "luku_" + Date.now(),
      title, toc_title: title, kind, paragraphs: [],
    };
    const chapters = project.chapters.slice();
    chapters.splice(cIndex + 1, 0, newChapter);
    try {
      working(true, "Lisätään osiota…");
      setProject(await apiPatchStructure(chapters));
      clampSelection();
      $("new-chapter-title").value = "";
      cIndex = Math.min(cIndex + 1, project.chapters.length - 1);
      renderChapterSheet();
      renderActivePanel();
      toast("Osio lisätty.");
    } catch (error) {
      toast(error.message);
    } finally {
      working(false);
    }
  }

  async function deleteChapter() {
    if (project.chapters.length <= 1) { toast("Viimeistä osiota ei voi poistaa."); return; }
    const removed = currentChapter();
    // Poisto vaatii replace_chapters-tallennuksen: pelkkä rakenne-PATCH
    // säilyttäisi tekstilliset osiot merge-sääntöjen mukaisesti.
    const snapshot = JSON.parse(JSON.stringify(project.chapters));
    const chapters = project.chapters.filter((_, index) => index !== cIndex);
    try {
      working(true, "Poistetaan osiota…");
      setProject(await apiReplaceChapters(chapters));
      cIndex = Math.max(0, cIndex - 1);
      clampSelection();
      renderChapterSheet();
      renderActivePanel();
      showUndo('Osio "' + (removed.toc_title || removed.title) + '" poistettu.', snapshot);
    } catch (error) {
      toast(error.message);
    } finally {
      working(false);
    }
  }

  function showUndo(label, chaptersSnapshot) {
    undoSnapshot = { chapters: chaptersSnapshot, cIndex };
    $("undo-toast-text").textContent = label;
    $("undo-toast").hidden = false;
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => { $("undo-toast").hidden = true; undoSnapshot = null; }, 7000);
  }

  async function undoLast() {
    if (!undoSnapshot) return;
    const snapshot = undoSnapshot;
    undoSnapshot = null;
    $("undo-toast").hidden = true;
    clearTimeout(undoTimer);
    try {
      working(true, "Palautetaan…");
      setProject(await apiReplaceChapters(snapshot.chapters));
      cIndex = Math.min(snapshot.cIndex, project.chapters.length - 1);
      clampSelection();
      renderChapterSheet();
      renderActivePanel();
      toast("Palautettu.");
    } catch (error) {
      toast(error.message);
    } finally {
      working(false);
    }
  }

  /* ------------------------------------------------------------ massamuutokset */

  function massChapterIndices() {
    return massScope === "book" ? project.chapters.map((_, index) => index) : [cIndex];
  }

  async function runFindReplace() {
    const find = $("fr-find").value;
    if (!find) { toast("Anna etsittävä teksti."); return; }
    const replace = $("fr-replace").value;
    const caseSensitive = $("fr-case").checked;
    const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(escaped, caseSensitive ? "g" : "gi");

    const snapshot = JSON.parse(JSON.stringify(project.chapters));
    let total = 0;
    const chapters = project.chapters.map((chapter, index) => {
      if (!massChapterIndices().includes(index)) return chapter;
      const updated = Object.assign({}, chapter);
      updated.paragraphs = (chapter.paragraphs || []).map((paragraph) => {
        const matches = paragraph.match(pattern);
        total += matches ? matches.length : 0;
        return paragraph.replace(pattern, replace);
      });
      return updated;
    });
    if (!total) { toast("Ei osumia."); return; }

    try {
      working(true, "Korvataan…");
      if (massScope === "book") {
        setProject(await apiReplaceChapters(chapters));
      } else {
        project.chapters = chapters;
        setProject(await apiPatchChapter(cIndex, chapters[cIndex]));
      }
      clampSelection();
      renderActivePanel();
      showUndo(total + " korvausta tehty.", snapshot);
    } catch (error) {
      toast(error.message);
    } finally {
      working(false);
    }
  }

  async function runItalics() {
    const rules = Array.from(document.querySelectorAll("[data-italic]"))
      .filter((el) => el.checked).map((el) => el.dataset.italic);
    if (!rules.length) { toast("Valitse vähintään yksi kursivointiperuste."); return; }
    const indices = massChapterIndices().filter((i) => (project.chapters[i].paragraphs || []).length);
    if (!indices.length) { toast("Valitussa laajuudessa ei ole tekstiä."); return; }

    const snapshot = JSON.parse(JSON.stringify(project.chapters));
    const temperature = parseFloat($("edit-temperature").value);
    try {
      let changed = 0;
      for (let step = 0; step < indices.length; step++) {
        const index = indices[step];
        working(true, "Kursivoidaan osiota " + (step + 1) + "/" + indices.length + "…");
        const chapter = project.chapters[index];
        const result = await apiEditAction("italics", paragraphsToText(chapter.paragraphs),
          { italicsRules: rules, temperature });
        (result.warnings || []).forEach(toast);
        const updated = Object.assign({}, chapter, { paragraphs: textToParagraphs(result.edited_text) });
        if (paragraphsToText(updated.paragraphs) !== paragraphsToText(chapter.paragraphs)) changed++;
        project.chapters[index] = updated;
        setProject(await apiPatchChapter(index, updated));
      }
      clampSelection();
      renderActivePanel();
      if (changed) showUndo("Kursivointi lisätty (" + changed + " osiota muuttui).", snapshot);
      else toast("Kursivoitavaa ei löytynyt.");
    } catch (error) {
      toast(error.message);
    } finally {
      working(false);
    }
  }

  async function runRestructure() {
    const chapter = currentChapter();
    const text = paragraphsToText(chapter.paragraphs);
    if (!text.trim()) { toast("Valitussa osiossa ei ole tekstiä."); return; }
    try {
      working(true, "Tekoäly suunnittelee jakoa…");
      const result = await apiEditAction("restructure", text, {
        instructions: $("restructure-instructions").value,
        temperature: parseFloat($("edit-temperature").value),
      });
      (result.warnings || []).forEach(toast);
      let newChapters = result.chapters;
      if (!newChapters) {
        // Vanha reitti tai demotila: parsitaan markdown-otsikot selaimessa.
        newChapters = parseRestructuredLocal(result.edited_text, chapter.toc_title || chapter.title);
      }
      if (!newChapters.length || newChapters.length === 1) {
        toast("Tekoäly ei ehdottanut uutta jakoa.");
        return;
      }
      const names = newChapters.map((c) => "• " + (c.toc_title || c.title)).join("\n");
      if (!window.confirm("Jaa osio " + newChapters.length + " osioon?\n\n" + names)) return;

      const snapshot = JSON.parse(JSON.stringify(project.chapters));
      const chapters = project.chapters.slice();
      newChapters = newChapters.map((c, offset) => Object.assign({}, c, {
        id: chapter.id + "_j" + (offset + 1), kind: c.kind || "main",
      }));
      chapters.splice(cIndex, 1, ...newChapters);
      working(true, "Tallennetaan jakoa…");
      setProject(await apiReplaceChapters(chapters));
      clampSelection();
      closeSheets();
      renderActivePanel();
      showUndo("Osio jaettu " + newChapters.length + " osioon.", snapshot);
    } catch (error) {
      toast(error.message);
    } finally {
      working(false);
    }
  }

  function parseRestructuredLocal(text, fallbackTitle) {
    const chapters = [];
    let current = null;
    const buffer = [];
    const flush = () => {
      if (buffer.length && current) {
        current.paragraphs.push(...textToParagraphs(buffer.join("\n")));
      }
      buffer.length = 0;
    };
    for (const line of String(text || "").split("\n")) {
      const match = line.trim().match(/^(#{1,4})\s+(.+?)\s*$/);
      if (match) {
        flush();
        current = { id: "", title: match[2].trim(), toc_title: match[2].trim(), kind: "main", paragraphs: [] };
        chapters.push(current);
      } else {
        if (!current) {
          current = { id: "", title: fallbackTitle, toc_title: fallbackTitle, kind: "main", paragraphs: [] };
          chapters.push(current);
        }
        buffer.push(line);
      }
    }
    flush();
    return chapters.filter((c) => c.paragraphs.length || chapters.length === 1);
  }

  /* ------------------------------------------------------------ käynnistys */

  function bindEvents() {
    $("mode-kirjoita").addEventListener("click", () => switchMode("kirjoita"));
    $("mode-editoi").addEventListener("click", () => switchMode("editoi"));

    $("btn-prev-chapter").addEventListener("click", () => gotoChapter(cIndex - 1));
    $("btn-next-chapter").addEventListener("click", () => gotoChapter(cIndex + 1));
    $("btn-chapter-title").addEventListener("click", () => { renderChapterSheet(); openSheet("chapter-sheet"); });
    $("btn-open-chapters").addEventListener("click", () => { renderChapterSheet(); openSheet("chapter-sheet"); });

    $("writing-text").addEventListener("input", scheduleWritingSave);
    $("block-format").addEventListener("change", (e) => { applyBlockFormat(e.target.value); e.target.value = ""; });
    $("btn-bold").addEventListener("click", () => wrapSelection("**", "**", "lihavoitava"));
    $("btn-italic").addEventListener("click", () => wrapSelection("*", "*", "kursivoitava"));
    $("btn-underline").addEventListener("click", () => wrapSelection("_", "_", "alleviivattava"));

    $("scope-paragraph").addEventListener("click", () => setScope("paragraph"));
    $("scope-chapter").addEventListener("click", () => setScope("chapter"));
    $("btn-prev-paragraph").addEventListener("click", () => { pIndex--; dismissSuggestion(); renderEditPanel(); });
    $("btn-next-paragraph").addEventListener("click", () => { pIndex++; dismissSuggestion(); renderEditPanel(); });

    $("edit-temperature").addEventListener("input", (e) => { $("edit-temperature-val").textContent = e.target.value; });
    $("btn-ai-improve").addEventListener("click", runImprove);
    $("tab-suggestion").addEventListener("click", () => showSuggestionTab("suggestion"));
    $("tab-diff").addEventListener("click", () => showSuggestionTab("diff"));
    $("btn-reject-suggestion").addEventListener("click", dismissSuggestion);
    $("btn-accept-suggestion").addEventListener("click", acceptSuggestion);

    $("btn-add-chapter").addEventListener("click", addChapter);
    $("btn-delete-chapter").addEventListener("click", deleteChapter);
    $("btn-close-chapter-sheet").addEventListener("click", closeSheets);

    $("btn-open-mass").addEventListener("click", () => openSheet("mass-sheet"));
    $("btn-close-mass-sheet").addEventListener("click", closeSheets);
    $("sheet-backdrop").addEventListener("click", closeSheets);
    $("mass-scope-chapter").addEventListener("click", () => setMassScope("chapter"));
    $("mass-scope-book").addEventListener("click", () => setMassScope("book"));
    $("btn-run-replace").addEventListener("click", runFindReplace);
    $("btn-run-italics").addEventListener("click", runItalics);
    $("btn-run-restructure").addEventListener("click", runRestructure);

    $("btn-undo").addEventListener("click", undoLast);

    if (CONFIG.backHref) {
      $("btn-back").hidden = false;
      $("btn-back").addEventListener("click", () => { flushWritingSave(); window.location.href = CONFIG.backHref; });
    }

    window.addEventListener("beforeunload", flushWritingSave);
  }

  function setScope(next) {
    scope = next;
    dismissSuggestion();
    $("scope-paragraph").classList.toggle("is-active", scope === "paragraph");
    $("scope-chapter").classList.toggle("is-active", scope === "chapter");
    renderEditPanel();
  }

  function setMassScope(next) {
    massScope = next;
    $("mass-scope-chapter").classList.toggle("is-active", massScope === "chapter");
    $("mass-scope-book").classList.toggle("is-active", massScope === "book");
  }

  async function boot() {
    bindEvents();
    try {
      const projectId = CONFIG.projectId || activeProjectId();
      if (!projectId) throw new Error("projectId puuttuu");
      working(true, "Avataan käsikirjoitusta…");
      setProject(await apiGetProject(projectId), { notify: false });
    } catch (error) {
      demoMode = true;
      setProject(await apiGetProject(0), { notify: false });
      toast("Demotila: backendiä ei ole yhdistetty.");
      setSaveStatus("Demotila");
    } finally {
      working(false);
    }
    $("project-title").textContent = project.title || "Käsikirjoitus";
    clampSelection();
    if (initialMode === "editoi") switchMode("editoi");
    else renderActivePanel();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
