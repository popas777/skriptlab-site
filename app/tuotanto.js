/* ==========================================================================
   Tuotanto – oheisaineistot, valmis kirja ja taitto
   API-sopimus (production-paketti):
     POST   {api}/misc-tools/run
     GET    {api}/projects/{id}/misc-assets
     POST   {api}/projects/{id}/misc-assets
     PATCH  {api}/projects/{id}/assets/{assetId}      ({include_in_book, sort_order})
     DELETE {api}/projects/{id}/assets/{assetId}
     GET    {api}/projects/{id}/book                  (koottu kirja, yksi totuuden lähde)
     GET    {api}/projects/{id}/layout-assets
     POST   {api}/projects/{id}/layout/run
   Ilman backendiä toimii demotilassa (näyteprojekti muistissa).
   ========================================================================== */

(function () {
  "use strict";

  const CONFIG = window.TUOTANTO_CONFIG || {};
  const API_BASE = (CONFIG.apiBase || "/api").replace(/\/$/, "");
  const doFetch = CONFIG.fetchImpl || ((url, options) => fetch(url, options));

  const TOOLS = [
    ["copyright_page", "Copysivu"],
    ["character_index", "Henkilöhakemisto"],
    ["place_index", "Paikkahakemisto"],
    ["subject_index", "Asiahakemisto"],
    ["bibliography", "Lähdeluettelo"],
  ];
  const TOOL_LABELS = Object.fromEntries(TOOLS);
  const FRONT_KINDS = ["copyright_page"];
  const SIZES = ["A5", "B5", "G5", "Pokkari"];
  const VALID_TABS = new Set(["aineistot", "kirja", "taitto"]);

  let demoMode = CONFIG.demo === true;
  let projectId = CONFIG.projectId;
  let projectTitle = "";
  let tab = VALID_TABS.has(CONFIG.tab) ? CONFIG.tab : "aineistot";
  let selectedTool = "copyright_page";
  let selectedSize = "A5";
  let assets = [];           // GET /misc-assets
  let pendingResult = null;  // { tool, title, result }
  let viewedAsset = null;
  let fontSize = 16;
  let bookTimer = null;

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
    $("working").hidden = !show;
    if (label) $("working-label").textContent = label;
  }

  function decodeDataUrl(dataUrl) {
    try {
      const base64 = String(dataUrl || "").split(",", 2)[1] || "";
      return decodeURIComponent(escape(atob(base64)));
    } catch (e) {
      return "";
    }
  }

  function downloadDataUrl(dataUrl, filename) {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function safeFileName(name, extension) {
    const base = (name || "kirja").toLowerCase()
      .replace(/[åä]/g, "a").replace(/ö/g, "o")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "kirja";
    return base + extension;
  }

  /* ------------------------------------------------------------ demotila */

  const demo = {
    project: {
      id: 0, title: "Meren muisti", author: "Demo Kirjailija",
      chapters: [
        { id: "c1", toc_title: "Aamu satamassa", kind: "main",
          paragraphs: ["Elina katsoi merelle. Sumu makasi veden päällä kuin peitto.",
                       "Laiturilla ei ollut vielä ketään."] },
        { id: "c2", toc_title: "Kirje", kind: "main",
          paragraphs: ["Kirje odotti pöydällä. Elina tiesi keneltä se oli."] },
      ],
    },
    assets: [],
    nextId: 1,

    bookText(includeTitle, includeToc) {
      const parts = [];
      if (includeTitle) parts.push(this.project.author + "\n\n" + this.project.title.toUpperCase());
      for (const asset of this.assets) {
        if (asset.asset_type === "book_misc_material" && FRONT_KINDS.includes(asset.material_kind)) {
          parts.push(asset._text);
        }
      }
      if (includeToc) {
        parts.push("SISÄLLYS\n\n" + this.project.chapters.map((c) => c.toc_title).join("\n"));
      }
      parts.push(this.project.chapters
        .map((c) => c.toc_title + "\n\n" + c.paragraphs.join("\n\n")).join("\n\n\n"));
      const backs = this.assets
        .filter((a) => a.asset_type === "book_misc_material" && !FRONT_KINDS.includes(a.material_kind))
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      for (const asset of backs) parts.push(asset._text);
      return parts.join("\n\n\n***\n\n\n");
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

  async function apiRunMisc(tool, instructions) {
    if (demoMode) {
      await new Promise((r) => setTimeout(r, 500));
      const samples = {
        copyright_page: "Demo Kirjailija: Meren muisti\n\n© 2026 Demo Kirjailija\n\nKustantaja: [TÄYDENNETTÄVÄ]\nISBN [TÄYDENNETTÄVÄ]",
        character_index: "Elina — päähenkilö, satamakaupungin asukas",
        place_index: "Satama — teoksen keskeinen tapahtumapaikka",
        subject_index: "Meri — kerronnan kantava elementti\nMuisti — teoksen pääteema",
        bibliography: "Tekstissä ei mainita lähteitä.",
      };
      return { tool, title: TOOL_LABELS[tool], result: samples[tool] || "",
               warnings: ["Demotila: näyteaineisto ilman tekoälyä."] };
    }
    return api("/misc-tools/run", jsonOptions("POST", {
      project_id: projectId, tool, instructions: instructions || "",
    }));
  }

  async function apiListAssets() {
    if (demoMode) {
      return demo.assets.map((asset) => Object.assign({}, asset, {
        include_in_book: asset.asset_type === "book_misc_material",
        book_section: asset.asset_type === "book_misc_material"
          ? (FRONT_KINDS.includes(asset.material_kind) ? "front" : "back") : "",
      }));
    }
    return api("/projects/" + projectId + "/misc-assets");
  }

  async function apiSaveAsset(title, content, materialKind, includeInBook) {
    if (demoMode) {
      const asset = {
        id: demo.nextId++, title, material_kind: materialKind,
        asset_type: includeInBook ? "book_misc_material" : "misc_material",
        sort_order: demo.nextId, created_at: "", _text: content,
        data_url: "data:text/plain;base64," + btoa(unescape(encodeURIComponent(content))),
      };
      demo.assets.push(asset);
      return asset;
    }
    return api("/projects/" + projectId + "/misc-assets", jsonOptions("POST", {
      title, content, material_kind: materialKind, include_in_book: includeInBook,
    }));
  }

  async function apiUpdateAsset(assetId, changes) {
    if (demoMode) {
      const asset = demo.assets.find((a) => a.id === assetId);
      if (changes.include_in_book != null) {
        asset.asset_type = changes.include_in_book ? "book_misc_material" : "misc_material";
      }
      if (changes.sort_order != null) asset.sort_order = changes.sort_order;
      return asset;
    }
    return api("/projects/" + projectId + "/assets/" + assetId, jsonOptions("PATCH", changes));
  }

  async function apiDeleteAsset(assetId) {
    if (demoMode) {
      demo.assets = demo.assets.filter((a) => a.id !== assetId);
      return {};
    }
    return api("/projects/" + projectId + "/assets/" + assetId, { method: "DELETE" });
  }

  async function apiGetBook() {
    const includeTitle = $("opt-title-page").checked;
    const includeToc = $("opt-toc").checked;
    if (demoMode) {
      const full = demo.bookText(includeTitle, includeToc);
      return { title: demo.project.title, full_text: full,
               word_count: full.split(/\s+/).filter(Boolean).length };
    }
    return api("/projects/" + projectId + "/book?include_title_page=" + includeTitle +
               "&include_toc=" + includeToc);
  }

  async function apiRunLayout() {
    if (demoMode) {
      await new Promise((r) => setTimeout(r, 700));
      const latex = "% Demotila: suppea LaTeX-näyte\n\\documentclass{book}\n\\begin{document}\n" +
        demo.project.title + "\n\\end{document}\n";
      return {
        latex: { asset_type: "layout_latex", title: demo.project.title + " – LaTeX (demo)",
                 mime_type: "application/x-latex",
                 data_url: "data:application/x-latex;base64," + btoa(unescape(encodeURIComponent(latex))) },
        pdf: null, epub: null,
        warnings: ["Demotila: PDF ja EPUB vaativat backendin."],
      };
    }
    return api("/projects/" + projectId + "/layout/run", jsonOptions("POST", {
      layout_style: selectedSize,
      hyphenation_level: $("hyphenation-select").value,
      include_title_page: $("opt-title-page").checked,
      include_toc: $("opt-toc").checked,
    }));
  }

  async function apiListLayoutAssets() {
    if (demoMode) return [];
    return api("/projects/" + projectId + "/layout-assets");
  }

  /* ------------------------------------------------------------ välilehdet */

  function switchTab(next) {
    tab = next;
    for (const name of ["aineistot", "kirja", "taitto"]) {
      $("tab-" + name).classList.toggle("is-active", name === tab);
      $("panel-" + name).hidden = name !== tab;
    }
    if (tab === "kirja") refreshBook();
    if (tab === "taitto") refreshLayoutAssets();
  }

  /* ------------------------------------------------------------ aineistot */

  function renderToolChips() {
    const container = $("tool-chips");
    container.innerHTML = "";
    for (const [kind, label] of TOOLS) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "tool-chip" + (kind === selectedTool ? " is-active" : "");
      chip.textContent = label;
      chip.setAttribute("role", "radio");
      chip.setAttribute("aria-checked", String(kind === selectedTool));
      chip.addEventListener("click", () => { selectedTool = kind; renderToolChips(); });
      container.appendChild(chip);
    }
  }

  async function refreshAssets() {
    try {
      assets = await apiListAssets();
    } catch (error) {
      toast(error.message);
      assets = [];
    }
    renderAssets();
  }

  function renderAssets() {
    const list = $("assets-list");
    list.innerHTML = "";
    $("assets-empty").hidden = assets.length > 0;
    for (const asset of assets) {
      const card = document.createElement("div");
      card.className = "asset-card";

      const head = document.createElement("div");
      head.className = "asset-head";

      const titleBtn = document.createElement("button");
      titleBtn.type = "button";
      titleBtn.className = "asset-title";
      titleBtn.textContent = asset.title || TOOL_LABELS[asset.material_kind] || "Aineisto";
      titleBtn.addEventListener("click", () => openAssetSheet(asset));

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "pill-toggle" + (asset.include_in_book ? " is-on" : "");
      toggle.textContent = asset.include_in_book ? "Kirjassa ✓" : "Ei kirjassa";
      toggle.addEventListener("click", () => toggleInBook(asset));

      head.appendChild(titleBtn);
      head.appendChild(toggle);
      card.appendChild(head);

      const meta = document.createElement("p");
      meta.className = "asset-meta";
      const section = asset.include_in_book
        ? (asset.book_section === "front" ? " · kirjan alkuun" : " · kirjan loppuun") : "";
      meta.textContent = (TOOL_LABELS[asset.material_kind] || asset.material_kind || "aineisto") + section;
      card.appendChild(meta);

      list.appendChild(card);
    }
  }

  async function toggleInBook(asset) {
    try {
      await apiUpdateAsset(asset.id, { include_in_book: !asset.include_in_book });
      await refreshAssets();
      toast(!asset.include_in_book ? "Liitetty kirjaan." : "Poistettu kirjasta (aineisto säilyy).");
    } catch (error) {
      toast(error.message);
    }
  }

  async function runMiscTool() {
    try {
      working(true, "Muodostetaan aineistoa…");
      const result = await apiRunMisc(selectedTool, $("misc-instructions").value);
      pendingResult = { tool: result.tool || selectedTool, title: result.title || TOOL_LABELS[selectedTool] };
      $("result-title").textContent = pendingResult.title;
      $("result-text").value = result.result || "";
      $("result-include").checked = true;
      const warnings = $("result-warnings");
      warnings.hidden = !(result.warnings || []).length;
      warnings.textContent = (result.warnings || []).join("\n");
      openSheet("result-sheet");
    } catch (error) {
      toast(error.message);
    } finally {
      working(false);
    }
  }

  async function savePendingResult() {
    if (!pendingResult) return;
    const content = $("result-text").value.trim();
    if (!content) { toast("Aineisto on tyhjä."); return; }
    try {
      working(true, "Tallennetaan…");
      await apiSaveAsset(pendingResult.title, content, pendingResult.tool, $("result-include").checked);
      pendingResult = null;
      closeSheets();
      await refreshAssets();
      toast("Aineisto tallennettu.");
    } catch (error) {
      toast(error.message);
    } finally {
      working(false);
    }
  }

  function openAssetSheet(asset) {
    viewedAsset = asset;
    $("asset-sheet-title").textContent = asset.title || "Aineisto";
    $("asset-sheet-text").textContent = decodeDataUrl(asset.data_url) || asset._text || "";
    openSheet("asset-sheet");
  }

  async function deleteViewedAsset() {
    if (!viewedAsset) return;
    if (!window.confirm('Poistetaanko "' + (viewedAsset.title || "aineisto") + '" pysyvästi?')) return;
    try {
      working(true, "Poistetaan…");
      await apiDeleteAsset(viewedAsset.id);
      viewedAsset = null;
      closeSheets();
      await refreshAssets();
      toast("Aineisto poistettu.");
    } catch (error) {
      toast(error.message);
    } finally {
      working(false);
    }
  }

  /* ------------------------------------------------------------ kirja */

  function scheduleBookRefresh() {
    clearTimeout(bookTimer);
    bookTimer = setTimeout(refreshBook, 250);
  }

  async function refreshBook() {
    renderIncludedList();
    try {
      const book = await apiGetBook();
      $("book-preview").textContent = book.full_text || "(Kirjassa ei ole vielä sisältöä.)";
      $("book-word-count").textContent = book.word_count ? book.word_count + " sanaa" : "";
    } catch (error) {
      $("book-preview").textContent = "Esikatselun lataus epäonnistui: " + error.message;
    }
  }

  function renderIncludedList() {
    const included = assets.filter((a) => a.include_in_book);
    $("book-included-wrap").hidden = included.length === 0;
    const list = $("book-included-list");
    list.innerHTML = "";
    included.forEach((asset, position) => {
      const card = document.createElement("div");
      card.className = "asset-card";
      const head = document.createElement("div");
      head.className = "asset-head";

      const title = document.createElement("span");
      title.className = "asset-title";
      title.style.cursor = "default";
      title.textContent = asset.title;

      const order = document.createElement("div");
      order.className = "order-btns";
      const up = document.createElement("button");
      up.type = "button"; up.textContent = "↑"; up.disabled = position === 0;
      up.setAttribute("aria-label", "Siirrä ylemmäs");
      up.addEventListener("click", () => moveIncluded(included, position, -1));
      const down = document.createElement("button");
      down.type = "button"; down.textContent = "↓"; down.disabled = position === included.length - 1;
      down.setAttribute("aria-label", "Siirrä alemmas");
      down.addEventListener("click", () => moveIncluded(included, position, 1));
      order.appendChild(up); order.appendChild(down);

      head.appendChild(title);
      head.appendChild(order);
      card.appendChild(head);

      const meta = document.createElement("p");
      meta.className = "asset-meta";
      meta.textContent = asset.book_section === "front" ? "Kirjan alkuun" : "Kirjan loppuun";
      card.appendChild(meta);
      list.appendChild(card);
    });
  }

  async function moveIncluded(included, position, direction) {
    const reordered = included.slice();
    const [moved] = reordered.splice(position, 1);
    reordered.splice(position + direction, 0, moved);
    try {
      working(true, "Järjestetään…");
      for (let i = 0; i < reordered.length; i++) {
        if ((reordered[i].sort_order || 0) !== i + 1) {
          await apiUpdateAsset(reordered[i].id, { sort_order: i + 1 });
        }
      }
      await refreshAssets();
      await refreshBook();
    } catch (error) {
      toast(error.message);
    } finally {
      working(false);
    }
  }

  async function downloadTxt() {
    try {
      const book = await apiGetBook();
      const dataUrl = "data:text/plain;charset=utf-8;base64," +
        btoa(unescape(encodeURIComponent(book.full_text || "")));
      downloadDataUrl(dataUrl, safeFileName(projectTitle, ".txt"));
    } catch (error) {
      toast(error.message);
    }
  }

  /* ------------------------------------------------------------ taitto */

  function renderSizeChips() {
    const container = $("size-chips");
    container.innerHTML = "";
    for (const size of SIZES) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "tool-chip" + (size === selectedSize ? " is-active" : "");
      chip.textContent = size;
      chip.setAttribute("role", "radio");
      chip.setAttribute("aria-checked", String(size === selectedSize));
      chip.addEventListener("click", () => { selectedSize = size; renderSizeChips(); });
      container.appendChild(chip);
    }
  }

  function fileCard(asset) {
    const labels = { layout_latex: ["TEX", "LaTeX-lähde", ".tex"],
                     layout_pdf: ["PDF", "PDF-tarkistusvedos", ".pdf"],
                     layout_epub: ["EPUB", "EPUB-luonnos", ".epub"] };
    const [icon, label, extension] = labels[asset.asset_type] || ["?", asset.asset_type, ".bin"];
    const card = document.createElement("div");
    card.className = "file-card";
    card.innerHTML =
      '<div class="file-icon">' + icon + '</div>' +
      '<div class="file-info"><div class="file-title">' + escapeHtml(asset.title || label) + "</div>" +
      '<div class="file-meta">' + escapeHtml(label) + "</div></div>";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-primary";
    button.style.flex = "none";
    button.textContent = "Lataa";
    button.addEventListener("click", () =>
      downloadDataUrl(asset.data_url, safeFileName(projectTitle, extension)));
    card.appendChild(button);
    return card;
  }

  function renderLayoutFiles(items) {
    const container = $("layout-files");
    container.innerHTML = "";
    const usable = (items || []).filter(Boolean);
    $("layout-empty").hidden = usable.length > 0;
    const order = ["layout_pdf", "layout_epub", "layout_latex"];
    usable.sort((a, b) => order.indexOf(a.asset_type) - order.indexOf(b.asset_type));
    for (const asset of usable) container.appendChild(fileCard(asset));
  }

  async function refreshLayoutAssets() {
    try {
      renderLayoutFiles(await apiListLayoutAssets());
    } catch (error) {
      toast(error.message);
    }
  }

  async function runLayout() {
    try {
      working(true, "Muodostetaan taittotiedostoja…");
      const result = await apiRunLayout();
      const warnings = $("layout-warnings");
      warnings.hidden = !(result.warnings || []).length;
      warnings.textContent = (result.warnings || []).join("\n");
      renderLayoutFiles([result.pdf, result.epub, result.latex]);
      toast("Taittotiedostot valmiit.");
    } catch (error) {
      toast(error.message);
    } finally {
      working(false);
    }
  }

  /* ------------------------------------------------------------ arkit */

  function openSheet(id) {
    $("sheet-backdrop").hidden = false;
    $(id).hidden = false;
  }

  function closeSheets() {
    $("sheet-backdrop").hidden = true;
    $("result-sheet").hidden = true;
    $("asset-sheet").hidden = true;
  }

  /* ------------------------------------------------------------ käynnistys */

  function bindEvents() {
    $("tab-aineistot").addEventListener("click", () => switchTab("aineistot"));
    $("tab-kirja").addEventListener("click", () => switchTab("kirja"));
    $("tab-taitto").addEventListener("click", () => switchTab("taitto"));

    $("btn-run-misc").addEventListener("click", runMiscTool);
    $("btn-save-result").addEventListener("click", savePendingResult);
    $("btn-discard-result").addEventListener("click", () => { pendingResult = null; closeSheets(); });
    $("btn-delete-asset").addEventListener("click", deleteViewedAsset);
    $("btn-close-asset-sheet").addEventListener("click", closeSheets);
    $("sheet-backdrop").addEventListener("click", closeSheets);

    $("opt-title-page").addEventListener("change", scheduleBookRefresh);
    $("opt-toc").addEventListener("change", scheduleBookRefresh);
    $("btn-download-txt").addEventListener("click", downloadTxt);
    $("btn-font-smaller").addEventListener("click", () => setFontSize(fontSize - 1));
    $("btn-font-larger").addEventListener("click", () => setFontSize(fontSize + 1));

    $("btn-run-layout").addEventListener("click", runLayout);

    if (CONFIG.backHref) {
      $("btn-back").hidden = false;
      $("btn-back").addEventListener("click", () => { window.location.href = CONFIG.backHref; });
    }
  }

  function setFontSize(next) {
    fontSize = Math.min(24, Math.max(12, next));
    $("book-preview").style.fontSize = fontSize + "px";
  }

  async function boot() {
    bindEvents();
    renderToolChips();
    renderSizeChips();
    try {
      if (projectId == null) throw new Error("projectId puuttuu");
      working(true, "Avataan projektia…");
      const project = await api("/projects/" + projectId);
      projectTitle = project.title || "Käsikirjoitus";
    } catch (error) {
      demoMode = true;
      projectId = 0;
      projectTitle = demo.project.title;
      $("status-text").textContent = "Demotila";
      toast("Demotila: backendiä ei ole yhdistetty.");
    } finally {
      working(false);
    }
    $("project-title").textContent = projectTitle;
    await refreshAssets();
    switchTab(tab);
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
