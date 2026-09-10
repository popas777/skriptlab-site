(function () {
  "use strict";
  const A = window.SkriptLabBookAccess;
  if (!A) return;
  const $ = id => document.getElementById(id);
  const e = A.escape;
  let productionState = null, stateProject = null, selectedCover = null, coverFormProject = null, previewUrl = null, proofreadRun = null;
  const handlers = {};
  const usage = action => `<span class="book-basic-usage" data-access-usage="${action}"></span>`;
  const button = (id, title, action, secondary = false) => `<button type="button" id="${id}"${action ? ` data-access-action="${action}"` : ""}${secondary ? ' class="secondary"' : ""}>${title}</button>`;
  const status = id => `<p id="${id}" class="book-basic-status" role="status" aria-live="polite"></p>`;
  function on(id, callback) { $(id)?.addEventListener("click", callback); }
  function tell(id, text) { if ($(id)) $(id).textContent = text; }
  function projectPath(suffix) { const id = A.projectId(); if (!id) throw new Error("Valitse ensin teos Tekstini-moduulista."); return "/projects/" + id + suffix; }
  async function savedProject() {
    const host = window.parent !== window ? window.parent : window;
    await host.SkriptLabBasicHooks?.flush?.();
    return A.request(projectPath(""));
  }
  function assetUrl(asset) {
    const value = asset?.data_url || asset?.url || asset?.file_url || asset?.download_url || "";
    if (/^data:(?:image\/(?:png|jpeg|webp)|application\/(?:epub\+zip|pdf|octet-stream));base64,/i.test(value)) return value;
    if (!value) return "";
    try { const url = new URL(value, String(window.SKRIPTLAB_CONFIG?.API_BASE_URL || window.location.origin) + "/"); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch (_) { return ""; }
  }
  function assetTitle(asset) { return asset?.title || asset?.filename || "Kansikuva"; }
  async function work(buttonId, statusId, message, callback) {
    const control = $(buttonId); if (control) control.disabled = true;
    tell(statusId, message);
    try { await callback(); }
    catch (error) { tell(statusId, error.message || "Toiminto epäonnistui. Voit yrittää uudelleen."); }
    finally { if (control) control.disabled = control.dataset.bookRunning === "true"; A.refresh(true); }
  }
  function cardIntro(title, copy) { return `<p class="book-basic-plan" data-access-plan></p><h2>${title}</h2><p class="book-basic-intro">${copy}</p>`; }
  function wrap(root, name, advancedAction, content, options = {}) {
    if (!root || root.dataset.bookBasicMounted) return null;
    root.dataset.bookBasicMounted = "true";
    const advanced = document.createElement("section"); advanced.id = "book-basic-advanced-" + name;
    advanced.className = "book-basic-panel"; advanced.hidden = true; advanced.setAttribute("role", "tabpanel");
    while (root.firstChild) advanced.append(root.firstChild);
    const tabs = document.createElement("div"); tabs.className = "book-basic-tabs"; tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "Työkalut");
    tabs.innerHTML = `<button type="button" role="tab" id="book-basic-tab-${name}" aria-selected="true" aria-controls="book-basic-${name}">${options.title || (name === "cover" ? "Kansi" : name === "epub" ? "E-kirja" : name === "publish" ? "Julkaisu kirjastoon" : "Oikoluku")}</button><button type="button" role="tab" id="book-advanced-tab-${name}" aria-selected="false" aria-controls="${advanced.id}" tabindex="-1" data-access-action="${advancedAction}">${options.toolsTitle || "Lisätyökalut"}</button>`;
    const basic = document.createElement("section"); basic.className = "book-basic book-basic-panel"; basic.id = "book-basic-" + name; basic.setAttribute("role", "tabpanel"); basic.setAttribute("aria-labelledby", "book-basic-tab-" + name); basic.innerHTML = content;
    advanced.setAttribute("aria-labelledby", "book-advanced-tab-" + name);
    root.append(tabs, basic, advanced);
    const select = async advancedSelected => {
      if (advancedSelected && !(await A.ensure(advancedAction, { tab: true }))) return;
      basic.hidden = advancedSelected; advanced.hidden = !advancedSelected;
      tabs.querySelectorAll("button").forEach((tab, index) => { const active = index === Number(advancedSelected); tab.setAttribute("aria-selected", String(active)); tab.tabIndex = active ? 0 : -1; });
      if (advancedSelected) options.onTools?.();
    };
    tabs.children[0].addEventListener("click", () => select(false)); tabs.children[1].addEventListener("click", () => select(true));
    tabs.addEventListener("keydown", event => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const items = Array.from(tabs.children); const current = items.indexOf(event.target); const index = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length; items[index].click(); items[index].focus(); });
    document.addEventListener("skriptlab:access", () => {
      if (!advanced.hidden && !A.tabAccessDecision(A.getSnapshot(), advancedAction).allowed) select(false);
    });
    return basic;
  }
  function mountModuleIntroductions() {
    const introductions = [
      ["view-oheisaineistot", "support_materials", "Oheisaineistot", "Täydennä kirjaasi copysivulla, hakemistoilla ja lähdeluettelolla. Voit antaa taustatiedot, muokata luonnosta ja liittää valmiin aineiston kirjan taittoon."],
      ["view-markkinointi", "marketing", "Markkinointi", "Valmistele kirjallesi esittelytekstejä ja kampanja-aineistoja teoksen omien tietojen pohjalta."],
      ["view-suomentaja", "translations", "Räätälöidyt käännökset", "Työstä kirjasi käännöstä valitulla kielisuunnalla ja teoskohtaisilla ohjeilla."],
      ["view-kaannostyotila", "translation_workspace", "Automaattikäännökset", "Muodosta kirjasta käännös ja seuraa sen valmistumista osissa."],
      ["view-monikielinen-julkaisu", "multilingual_publication", "Kieliversiot", "Kokoa ja tarkista teoksen eri kieliversioiden julkaisuaineistot."],
      ["view-ai-tyonkulku", "ai_workflow", "Työnkulkustudio", "Yhdistä tekstin käsittelyn vaiheita omaan työskentelyysi sopivaksi kokonaisuudeksi."],
      ["view-elamakerta", "biography", "Elämäkerta", "Kokoa muistoja ja haastatteluja sekä työstä niistä elämäkerran käsikirjoitusta."],
      ["view-video", "video", "Videostudio", "Valmistele teoksesi pohjalta käsikirjoituksia ja visuaalisia aineistoja videoihin."],
      ["view-3d-studio", "world_studio", "3D-studio", "Hahmottele teoksen tapahtumapaikkoja ja maailmaa kolmiulotteisesti."],
      ["view-julkaise", "publish", "Painatus ja kustantaminen", "Valmistele painetun kirjan tuotantoa ja sen tarvitsemia tietoja."],
      ["view-sopimukset", "contracts", "Sopimukset", "Kokoa teoksen sopimuksiin liittyvät tiedot ja tarkasteltavat asiakirjat yhteen."],
      ["view-aikajana", "timeline", "Aikajana", "Jäsennä teoksen tapahtumia ja niiden ajallisia yhteyksiä."],
      ["view-korjaukset", "correction_reprints", "Korjaukset ja uusintapainokset", "Valmistele julkaistun teoksen korjaukset ja uuden painoksen aineistot."],
      ["view-skill", "skill", "Skill", "Kokoa teoksen keskeiset tiedot ja ohjeet myöhempää työskentelyä varten."],
      ["view-notebooklm", "notebooklm", "NotebookLM", "Työstä teoksen lähteitä ja muistiinpanoja NotebookLM-yhteyden avulla."]
    ];
    for (const [viewId, moduleKey, title, copy] of introductions) {
      const root = $(viewId); if (!root) continue;
      const name = "intro-" + moduleKey, action = "module." + moduleKey;
      const navView = viewId === "view-suomentaja" ? "view-kaannokset" : viewId;
      const basic = wrap(root, name, action,
        `<h2>${title}</h2><p class="book-basic-intro">${copy}</p><p class="book-basic-usage" id="${name}-availability"></p><div class="book-basic-actions"><button type="button" id="${name}-open">Avaa työkalut</button></div>`,
        { title: "Esittely", toolsTitle: "Työkalut", onTools: () => {
          document.querySelector(`#nav-menu [data-view="${navView}"]`)?.click();
        } });
      if (!basic) continue;
      root.dataset.bookIntro = "book-basic-advanced-" + name;
      on(name + "-open", () => $("book-advanced-tab-" + name).click());
      const update = () => {
        const snapshot = A.getSnapshot();
        const allowed = A.tabAccessDecision(snapshot, action).allowed;
        $(name + "-open").textContent = !snapshot ? "Tarkista käyttöoikeus" : allowed ? "Avaa työkalut" : "Hanki lisäpalveluna";
        $(name + "-availability").textContent = !snapshot ? "Käyttöoikeuksia ladataan…" : allowed ? "Työkalut ovat käytössäsi." : "Saat tämän moduulin käyttöösi lisäpalveluna.";
      };
      document.addEventListener("skriptlab:access", update); update();
    }
  }
  async function loadState(force = false) {
    const id = A.projectId(); if (!id) return null;
    if (!force && productionState && stateProject === id) return productionState;
    const data = await A.request(projectPath("/basic-production/state"));
    if (id !== A.projectId()) return null;
    productionState = data; stateProject = id;
    if (!selectedCover && data.selected_cover) {
      try { selectedCover = JSON.parse(data.selected_cover.prompt || "{}").settings?.cover_asset_id || null; } catch (_) { /* legacy cover */ }
    }
    renderCovers(); renderPublication(); return data;
  }
  function renderCovers() {
    const list = $("book-cover-candidates");
    const candidates = (productionState?.cover_candidates || []).filter(item => item.material_kind !== "basic_selected_cover");
    const selection = productionState?.selected_cover;
    const batch = productionState?.latest_cover_batch;
    if ($("book-cover-generate")) {
      const control = $("book-cover-generate");
      control.disabled = ["queued", "running", "pending"].includes(batch?.status);
      control.dataset.bookRunning = String(control.disabled);
      if ($("book-cover-prompt")) $("book-cover-prompt").disabled = control.disabled || batch?.can_resume === true;
      if (batch?.can_resume) {
        delete control.dataset.accessAction; control.removeAttribute("aria-disabled"); control.classList.remove("book-access-locked");
        control.textContent = "Jatka kansiehdotusten luontia";
      } else { control.dataset.accessAction = "cover.generate_batch"; control.textContent = "Luo kolme kansiehdotusta"; }
    }
    if (list) {
      list.replaceChildren();
      const all = [...candidates];
      for (const asset of productionState?.uploaded_covers || []) if (!all.some(item => item.id === asset.id)) all.push(asset);
      if (!all.length) list.textContent = "Luo kolme ehdotusta tai tuo oma kuva.";
      all.forEach((asset, index) => {
        const item = document.createElement("article"); item.className = "book-basic-cover" + (Number(selectedCover) === Number(asset.id) ? " is-selected" : "");
        const image = document.createElement("img"); image.alt = assetTitle(asset); image.src = assetUrl(asset); image.loading = "lazy";
        const select = document.createElement("button"); select.type = "button"; select.textContent = Number(selectedCover) === Number(asset.id) ? "Valittu" : "Valitse kansi " + (index + 1);
        select.addEventListener("click", () => { selectedCover = asset.id; renderCovers(); tell("book-cover-status", "Kansi valittu. Sommittele nimi ja tekijä ja tallenna kansi."); });
        item.append(image, select); list.append(item);
      });
    }
    if (selection && $("book-cover-composed")) {
      $("book-cover-composed").src = assetUrl(selection); $("book-cover-composed").hidden = !assetUrl(selection);
    }
    const project = window.manuscriptData;
    if ($("book-cover-title") && project?.id && coverFormProject !== project.id) {
      let settings = {}; try { settings = JSON.parse(selection?.prompt || "{}").settings || {}; } catch (_) { /* older cover */ }
      $("book-cover-title").value = settings.title || project.title || ""; $("book-cover-author").value = settings.author || project.author || "";
      $("book-cover-title-position").value = settings.title_position || "top"; $("book-cover-author-position").value = settings.author_position || "bottom";
      $("book-cover-font").value = settings.font_family || "serif"; $("book-cover-color").value = settings.text_color || "#ffffff";
      coverFormProject = project.id;
    }
  }
  function mountCover() {
    const root = $("view-kuvitus"); if (!root) return;
    wrap(root, "cover", "module.cover_illustration", `${cardIntro("Kansi kirjallesi", "Luo kolme kansiehdotusta, valitse suosikkisi ja sommittele kirjan nimi sekä tekijä. Voit myös tuoda oman kuvan.")}
      <section class="book-basic-card"><h3>1. Valitse kansikuva</h3><label>Kuvaile kannen tunnelmaa <textarea id="book-cover-prompt" rows="3" maxlength="3000" placeholder="Voit jättää tämän tyhjäksi ja käyttää teoksen analyysiä."></textarea></label><div class="book-basic-actions">${button("book-cover-generate", "Luo kolme kansiehdotusta", "cover.generate_batch")}${usage("cover.generate_batch")}${button("book-cover-upload", "Tuo oma kuva", "cover.upload", true)}<input id="book-cover-file" type="file" accept="image/png,image/jpeg,image/webp" hidden></div>${status("book-cover-status")}<div id="book-cover-candidates" class="book-basic-covers"></div></section>
      <section class="book-basic-card"><h3>2. Sommittele nimi ja tekijä</h3><div class="book-basic-grid"><label>Kirjan nimi<input id="book-cover-title" maxlength="250"></label><label>Tekijä<input id="book-cover-author" maxlength="250"></label><label>Nimen paikka<select id="book-cover-title-position"><option value="top">Ylhäällä</option><option value="center">Keskellä</option><option value="bottom">Alhaalla</option></select></label><label>Tekijän paikka<select id="book-cover-author-position"><option value="bottom">Alhaalla</option><option value="top">Ylhäällä</option></select></label><label>Kirjasin<select id="book-cover-font"><option value="serif">Kirjallinen</option><option value="sans">Selkeä</option></select></label><label>Tekstin väri<input id="book-cover-color" type="color" value="#ffffff"></label></div><div class="book-basic-actions">${button("book-cover-compose", "Tallenna sommiteltu kansi", "cover.compose")}${button("book-cover-download", "Lataa kansi", null, true)}</div>${status("book-cover-compose-status")}<img id="book-cover-composed" class="book-basic-preview" alt="Sommiteltu kansi" hidden></section>`);
    on("book-cover-generate", () => work("book-cover-generate", "book-cover-status", "Luodaan kolme kansiehdotusta. Tämä voi kestää muutaman minuutin…", async () => {
      await savedProject(); const current = await loadState(true);
      const previous = current?.latest_cover_batch;
      const identity = A.keyForRun("cover.generate_batch", "candidates", previous);
      const result = await A.request(projectPath("/basic-production/cover-candidates"), { method: "POST", body: { idempotency_key: identity,
        prompt: previous?.can_resume ? previous.request?.prompt || "" : $("book-cover-prompt").value.trim() } });
      await pollCover(result.id, identity);
    }));
    on("book-cover-upload", () => $("book-cover-file").click());
    $("book-cover-file").addEventListener("change", () => work("book-cover-upload", "book-cover-status", "Tallennetaan oma kansikuva…", async () => {
      const file = $("book-cover-file").files[0]; if (!file) return;
      await savedProject(); const form = new FormData(); form.append("file", file); form.append("cover_side", "front");
      const result = await A.request(projectPath("/cover-images/upload"), { method: "POST", body: form });
      selectedCover = result.asset?.id || result.id; await loadState(true); if (selectedCover) selectedCover = result.asset?.id || result.id; renderCovers();
      tell("book-cover-status", "Oma kuva tallennettu. Sommittele sille nimi ja tekijä."); $("book-cover-file").value = "";
    }));
    on("book-cover-compose", () => work("book-cover-compose", "book-cover-compose-status", "Sommitellaan kansi…", async () => {
      if (!selectedCover) throw new Error("Valitse ensin kansikuva.");
      const result = await A.request(projectPath("/basic-production/cover-composition"), { method: "POST", body: {
        cover_asset_id: Number(selectedCover), title: $("book-cover-title").value.trim(), author: $("book-cover-author").value.trim(),
        title_position: $("book-cover-title-position").value, author_position: $("book-cover-author-position").value,
        text_color: $("book-cover-color").value, font_family: $("book-cover-font").value
      } });
      await loadState(true); if (result.asset) { productionState.selected_cover = result.asset; renderCovers(); }
      tell("book-cover-compose-status", "Kansi tallennettu. E-kirja ja julkaisu käyttävät tätä kantta.");
    }));
    on("book-cover-download", () => downloadAsset(productionState?.selected_cover, "kansi.png", "book-cover-compose-status"));
    const printStudio = root.querySelector(".cover-layout-studio");
    if (printStudio) {
      printStudio.classList.remove("showcase-hidden");
      const printPanel = document.createElement("section"); printPanel.id = "book-basic-print-cover"; printPanel.className = "book-basic-panel"; printPanel.hidden = true; printPanel.setAttribute("role", "tabpanel"); printPanel.setAttribute("aria-labelledby", "book-print-cover-tab"); printPanel.append(printStudio); root.append(printPanel);
      const tabs = root.querySelector(".book-basic-tabs"); const printTab = document.createElement("button"); printTab.type = "button"; printTab.id = "book-print-cover-tab"; printTab.textContent = "Painokansi"; printTab.dataset.accessAction = "cover.print"; printTab.setAttribute("role", "tab"); printTab.setAttribute("aria-selected", "false"); printTab.setAttribute("aria-controls", printPanel.id); printTab.tabIndex = -1;
      Array.from(tabs.children).forEach(tab => tab.addEventListener("click", () => { printPanel.hidden = true; }));
      printTab.addEventListener("click", async () => { if (!(await A.ensure("cover.print", { tab: true }))) return; $("book-basic-cover").hidden = true; $("book-basic-advanced-cover").hidden = true; printPanel.hidden = false; Array.from(tabs.children).forEach(tab => { const active = tab === printTab; tab.setAttribute("aria-selected", String(active)); tab.tabIndex = active ? 0 : -1; }); window.SkriptLabBasicHooks?.reloadGraphics?.(); });
      tabs.append(printTab);
    }
    handlers["view-kuvitus"] = async () => {
      try { const state = await loadState(true); if (["running", "queued"].includes(state?.latest_cover_batch?.status)) await pollCover(state.latest_cover_batch.id); }
      catch (error) { tell("book-cover-status", error.message); }
    };
  }
  let coverPollTimer = null;
  async function pollCover(id, identity) {
    clearTimeout(coverPollTimer);
    const run = await A.request(projectPath("/basic-production/runs/" + id));
    await loadState(true);
    tell("book-cover-status", run.status === "completed" ? "Kolme ehdotusta on valmis. Valitse niistä kansi." : `${run.completed_count || 0}/3 ehdotusta valmis. ${run.error || "Kuvia luodaan…"}`);
    if (["running", "queued", "pending"].includes(run.status)) coverPollTimer = setTimeout(() => pollCover(id, identity).catch(error => tell("book-cover-status", error.message)), 4000);
    else { if (run.status === "completed") A.completeKey(identity); await A.refresh(true); }
  }
  async function downloadAsset(asset, name, statusId) {
    const url = assetUrl(asset); if (!url) { tell(statusId, "Muodosta tiedosto ensin."); return; }
    try {
      const token = localStorage.getItem("skriptlab_auth_token");
      const backendOrigin = new URL(String(window.SKRIPTLAB_CONFIG?.API_BASE_URL || window.location.origin)).origin;
      const response = await fetch(url, { headers: token && new URL(url).origin === backendOrigin ? { Authorization: "Bearer " + token } : {} });
      if (!response.ok) throw new Error("Tiedoston lataaminen epäonnistui.");
      const objectUrl = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = objectUrl; link.download = asset.filename || name; link.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    } catch (error) { tell(statusId, error.message); }
  }
  function mountEpub() {
    if (!window.location.pathname.endsWith("tuotanto.html") || new URLSearchParams(location.search).get("module") !== "taitto") return;
    wrap($("production-screen"), "epub", "layout.print", `${cardIntro("E-kirjan taitto", "Muodosta EPUB tallennetusta tekstistäsi ja valitsemastasi kannesta. Voit päivittää e-kirjan aina, kun olet korjannut tekstiä.")}<section class="book-basic-card"><h3>Muodosta e-kirja</h3><p>EPUB mukautuu lukulaitteen kokoon. Painokirjan taitto ja painokansi ovat lisäpalveluja.</p><div class="book-basic-actions">${button("book-epub-run", "Muodosta EPUB", "layout.epub")}${usage("layout.epub")}${button("book-epub-print", "Painotaitto", "layout.print", true)}</div>${status("book-epub-status")}<div id="book-epub-files"></div></section>`);
    $("book-advanced-tab-epub").textContent = "Painotaitto";
    async function renderFiles() {
      const result = await A.request(projectPath("/layout-assets")); const items = Array.isArray(result) ? result : result.items || result.assets || [];
      $("book-epub-files").replaceChildren(); items.filter(item => item.asset_type === "layout_epub" || item.type === "layout_epub" || item.kind === "layout_epub").forEach(item => {
        const link = document.createElement("button"); link.type = "button"; link.className = "secondary"; link.textContent = "Lataa " + (item.title || "EPUB"); link.addEventListener("click", () => downloadAsset(item, "kirja.epub", "book-epub-status")); $("book-epub-files").append(link);
      });
    }
    on("book-epub-run", () => work("book-epub-run", "book-epub-status", "Muodostetaan EPUB…", async () => {
      await savedProject(); const current = await loadState(true);
      const result = await A.request(projectPath("/layout/run"), { method: "POST", body: { output_formats: ["epub"], cover_asset_id: current?.selected_cover?.id || null, layout_style: "A5", hyphenation_level: "none" } });
      tell("book-epub-status", "EPUB valmis." + (result.warnings?.length ? " " + result.warnings.join(" ") : "")); await renderFiles();
    }));
    on("book-epub-print", () => $("book-advanced-tab-epub").click());
    if (A.projectId()) renderFiles().catch(error => tell("book-epub-status", error.message));
  }
  function mountAudio() {
    const parent = $("audio-production-panel"); if (!parent) return;
    const panel = document.createElement("section"); panel.className = "book-basic";
    panel.innerHTML = `<section class="book-basic-card"><h3>Kokeile ääntä omalla tekstillä</h3><p>Valitse tuotantomalli ja lukijaääni alta. Lyhyt testi käyttää oman äänitestikerran. Valmiin äänikirjan luonti on erillinen käyttökerta.</p><label>Testiteksti <textarea id="book-audio-test-text" rows="4" maxlength="500" placeholder="Enintään 500 merkkiä teoksestasi."></textarea></label><div class="book-basic-actions">${button("book-audio-use-text", "Poimi alku teoksesta", null, true)}${button("book-audio-test", "Kuuntele oma teksti", "audio.preview")}${usage("audio.preview")}</div>${status("book-audio-status")}<audio id="book-audio-player" controls hidden></audio></section>`;
    parent.prepend(panel);
    const productionUsage = document.createElement("p"); productionUsage.className = "book-basic-usage"; productionUsage.dataset.accessUsage = "audio.produce"; $("audio-production-start-btn")?.after(productionUsage);
    on("book-audio-use-text", async () => {
      try { const project = await savedProject(); const paragraphs = (project.chapters || []).flatMap(ch => ch.paragraphs || []); $("book-audio-test-text").value = Array.from(paragraphs.join("\n\n")).slice(0, 500).join(""); }
      catch (error) { tell("book-audio-status", error.message); }
    });
    on("book-audio-test", () => work("book-audio-test", "book-audio-status", "Luodaan lyhyt ääninäyte…", async () => {
      const payload = window.SkriptLabBasicHooks?.audioPayload?.();
      if (!payload) throw new Error("Valitse ensin tuotantomalli ja lukijaääni.");
      const text = $("book-audio-test-text").value.trim(); if (!text) throw new Error("Lisää testiteksti ensin.");
      const gemini = payload.provider === "gemini";
      const blob = await A.request(gemini ? "/audio/gemini-tts-preview" : "/audio/tts-preview", { method: "POST", blob: true,
        body: { project_id: A.projectId(), text, model_id: payload.model_id, ...(gemini ? { voice_name: payload.voice_name || payload.voice_id } : { voice_id: payload.voice_id }), delivery: "natural" } });
      if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = URL.createObjectURL(blob);
      $("book-audio-player").src = previewUrl; $("book-audio-player").hidden = false;
      tell("book-audio-status", "Ääninäyte valmis. Kuuntele se ja vaihda ääntä tarvittaessa ennen koko kirjan luontia.");
    }));
    // Repairs are part of the common first surface; detailed production settings stay on later tabs.
    const repairs = document.createElement("section"); repairs.className = "book-basic";
    repairs.innerHTML = `<section class="book-basic-card"><h3>Korjaa valmis äänikirjan osa</h3><p>Voit tehdä enintään 2 500 merkin osan uudelleen samalla tekstillä. Muuttunut käsikirjoitus tarvitsee uuden tuotannon.</p><div class="book-basic-actions">${button("book-audio-load-parts", "Näytä äänikirjan osat", null, true)}${usage("audio.repair")}</div>${status("book-audio-repair-status")}<div id="book-audio-repairs"></div></section>`;
    parent.append(repairs);
    on("book-audio-load-parts", () => work("book-audio-load-parts", "book-audio-repair-status", "Ladataan äänikirjan osia…", async () => {
      const latest = await A.request("/audio/productions/latest?project_id=" + A.projectId()); const production = latest.production || latest;
      if (!production?.id || !["completed", "complete", "ready"].includes(production.status)) throw new Error("Luo äänikirja valmiiksi ennen osien korjaamista.");
      const result = await A.request("/audio/productions/" + production.id + "/parts");
      $("book-audio-repairs").replaceChildren();
      (result.parts || []).forEach(part => {
        const article = document.createElement("article"); article.className = "book-basic-card";
        const text = document.createElement("p"); text.textContent = `Osa ${Number(part.index) + 1}: ${String(part.text || "").slice(0, 150)}…`;
        const control = document.createElement("button"); control.type = "button"; control.textContent = "Tee osa uudelleen"; control.dataset.accessAction = "audio.repair";
        control.addEventListener("click", async () => {
          if (!(await A.ensure("audio.repair"))) return;
          if (String(part.text || "").length > 2500 && A.getSnapshot()?.max_words) { tell("book-audio-repair-status", "Tämä osa ylittää pakettiin sisältyvän 2 500 merkin korjausrajan."); return; }
          control.disabled = true;
          try { await A.request(`/audio/productions/${production.id}/parts/${part.index}/regenerate`, { method: "POST", body: { text: part.text, expected_source_checksum: part.source_checksum, expected_attempts: Math.max(0, Number(part.attempts || 0)) } }); tell("book-audio-repair-status", "Osan korjaus käynnistetty. Päivitä tuotannon tila ennen julkaisua."); }
          catch (error) { tell("book-audio-repair-status", error.message); }
          finally { control.disabled = false; }
        }); article.append(text, control); $("book-audio-repairs").append(article);
      }); A.decorate(); tell("book-audio-repair-status", "Osat ladattu.");
    }));
  }
  function renderPublication() {
    const cover = productionState?.selected_cover;
    if ($("book-publish-cover")) { $("book-publish-cover").src = assetUrl(cover); $("book-publish-cover").hidden = !assetUrl(cover); }
    tell("book-publish-source", productionState ? `Tallennettu lähdeversio ${productionState.source_revision ?? ""}. ${cover ? "Sommiteltu kansi valittu." : "Valitse kansi Kansi ja grafiikka -moduulista."}` : "Valitse teos ensin.");
    const previous = productionState?.latest_publication;
    if (previous?.status === "completed") tell("book-publish-status", "Teos on julkaistu omaan kirjastoosi. Voit avata sen Kirjastosta.");
  }
  function mountPublish() {
    const root = $("view-julkaisupaketti"); if (!root) return;
    wrap(root, "publish", "module.publication_package", `${cardIntro("Julkaise kirjastoon", "Julkaise valmis teos omaan SkriptLab-kirjastoosi. Samasta lähdeversiosta muodostetaan e-kirja, ja halutessasi mukaan liitetään valmis äänikirja.")}<section class="book-basic-card"><h3>Valmista julkaisu</h3><p id="book-publish-source"></p><img id="book-publish-cover" class="book-basic-preview" alt="Julkaisuun valittu kansi" hidden><label class="book-basic-check"><input id="book-publish-audio" type="checkbox">Liitä valmis äänikirja. Sen tekstin tulee vastata julkaistavaa versiota.</label><label class="book-basic-check"><input id="book-publish-rights" type="checkbox">Minulla on oikeus julkaista teksti ja valittu kansikuva.</label><div class="book-basic-actions">${button("book-publish-refresh", "Päivitä valmius", null, true)}${button("book-publish-run", "Julkaise omaan kirjastoon", "publication.publish")}${button("book-publish-library", "Avaa kirjasto", null, true)}</div>${status("book-publish-status")}<p class="book-access-note">Julkaisu tulee omaan SkriptLab-kirjastoosi. Jakelu ulkoisiin kirjakauppoihin on erillinen palvelu.</p></section>`);
    on("book-publish-refresh", () => work("book-publish-refresh", "book-publish-status", "Tarkistetaan tallennettu versio…", async () => { await savedProject(); await loadState(true); tell("book-publish-status", "Valmius päivitetty."); }));
    on("book-publish-run", () => work("book-publish-run", "book-publish-status", "Muodostetaan e-kirja ja julkaistaan sama lähdeversio kirjastoon…", async () => {
      if (!$("book-publish-rights").checked) throw new Error("Vahvista ensin oikeutesi julkaista teksti ja kansi.");
      await savedProject(); const current = await loadState(true); if (!current?.selected_cover?.id) throw new Error("Sommittele ja tallenna kansi ensin Kansi ja grafiikka -moduulissa.");
      const includeAudio = $("book-publish-audio").checked;
      let audio = null; if (includeAudio) { const value = await A.request("/audio/productions/latest?project_id=" + A.projectId()); audio = value.production || value; if (!audio?.id) throw new Error("Valmista äänikirjaa ei löytynyt."); }
      const identity = A.keyFor("publication.publish", String(current.source_hash) + ":" + current.selected_cover.id + ":" + includeAudio);
      const result = await A.request(projectPath("/basic-production/publish"), { method: "POST", body: { idempotency_key: identity, source_revision: current.source_revision,
        source_hash: current.source_hash, cover_asset_id: current.selected_cover.id, include_epub: true, include_audio: includeAudio, audio_production_id: audio?.id || null, rights_confirmed: true } });
      tell("book-publish-status", result.status === "completed" ? "Teos julkaistu omaan kirjastoosi." : "Julkaisu käsitellään. Päivitä valmius nähdäksesi tilanteen.");
      await loadState(true);
    }));
    on("book-publish-library", () => window.SkriptLabBasicHooks?.openModule?.("view-kirjasto"));
    handlers["view-julkaisupaketti"] = () => loadState(true).catch(error => tell("book-publish-status", error.message));
  }
  function mountProofread() {
    if (!location.pathname.endsWith("kaannoksen-viimeistely.html")) return;
    const root = document.querySelector(".ti-app"); if (!root) return;
    wrap(root, "proofread", "module.translation_finishing", `${cardIntro("Koko kirjan oikoluku", "Tarkista tallennettu käsikirjoitus yhdellä ajolla. Käy ehdotukset läpi ja hyväksy vain muutokset, jotka sopivat tekstiisi.")}<section class="book-basic-card"><div class="book-basic-actions">${button("book-proofread-run", "Oikolue koko kirja", "proofread.run")}${usage("proofread.run")}${button("book-proofread-refresh", "Päivitä tulokset", null, true)}${button("book-proofread-download", "Lataa palaute", null, true)}</div>${status("book-proofread-status")}<div id="book-proofread-results" class="book-basic-results"></div></section>`);
    let pollTimer = null;
    async function poll() {
      let id = proofreadRun?.id || sessionStorage.getItem("skriptlab_proofread_run:" + A.projectId());
      if (!id) { const current = await loadState(true); id = current?.latest_proofread?.id; }
      if (!id) { tell("book-proofread-status", "Oikolukua ei ole vielä tehty."); return; }
      const result = await A.request(projectPath("/proofread/runs/" + encodeURIComponent(id))); proofreadRun = result; render();
      clearTimeout(pollTimer); if (["queued", "running", "pending"].includes(result.status)) pollTimer = setTimeout(() => poll().catch(error => tell("book-proofread-status", error.message)), 4000);
      else { if (result.status === "completed") A.completeKey(A.keyFor("proofread.run", "whole-book")); await A.refresh(true); }
    }
    function render() {
      if (!proofreadRun) return;
      const control = $("book-proofread-run"); control.disabled = ["running", "queued", "pending"].includes(proofreadRun.status);
      control.dataset.bookRunning = String(control.disabled);
      if (proofreadRun.can_resume) { delete control.dataset.accessAction; control.removeAttribute("aria-disabled"); control.classList.remove("book-access-locked"); control.textContent = "Jatka samaa oikolukua"; }
      else { control.dataset.accessAction = "proofread.run"; control.textContent = "Oikolue koko kirja"; }
      tell("book-proofread-status", `${proofreadRun.completed_count ?? proofreadRun.current ?? 0}/${proofreadRun.total_count ?? proofreadRun.total ?? 0} lukua tarkistettu. ${proofreadRun.status === "completed" ? "Oikoluku valmis." : ["failed", "interrupted"].includes(proofreadRun.status) ? proofreadRun.can_resume ? "Oikoluku keskeytyi. Voit jatkaa samalla painikkeella." : "Oikoluku keskeytyi ja lähdeteksti on muuttunut. Uusi ajo tarvitsee käyttökerran." : "Oikoluku käynnissä."}`);
      const list = $("book-proofread-results"); list.replaceChildren();
      (proofreadRun.chapters || []).forEach(chapter => {
        const section = document.createElement("section"); const title = document.createElement("h3"); title.textContent = chapter.title || chapter.chapter_title || "Luku " + ((chapter.index ?? chapter.chapter_index) + 1); section.append(title);
        (chapter.suggestions || []).forEach(suggestion => {
          const article = document.createElement("article");
          const original = document.createElement("p"); original.textContent = "Alkuperäinen: " + suggestion.original;
          const replacement = document.createElement("p"); replacement.textContent = "Ehdotus: " + suggestion.replacement;
          const reason = document.createElement("p"); reason.textContent = suggestion.reason || "";
          article.append(original, replacement, reason);
          if (["accepted", "rejected"].includes(suggestion.status)) { const state = document.createElement("p"); state.textContent = suggestion.status === "accepted" ? "Hyväksytty" : "Hylätty"; article.append(state); }
          else ["accepted", "rejected"].forEach(decision => {
            const control = document.createElement("button"); control.type = "button"; control.className = decision === "rejected" ? "secondary" : ""; control.textContent = decision === "accepted" ? "Hyväksy" : "Hylkää";
            control.addEventListener("click", async () => {
              control.disabled = true;
              try { await A.request(projectPath(`/proofread/runs/${proofreadRun.id}/suggestions/${encodeURIComponent(suggestion.id)}`), { method: "POST", body: { chapter_index: chapter.index ?? chapter.chapter_index, status: decision } }); await poll(); await window.parent.SkriptLabBasicHooks?.reloadProject?.(); }
              catch (error) { tell("book-proofread-status", error.message); control.disabled = false; }
            }); article.append(control);
          }); section.append(article);
        });
        if (!(chapter.suggestions || []).length) { const empty = document.createElement("p"); empty.textContent = "Ei muutosehdotuksia."; section.append(empty); }
        list.append(section);
      });
    }
    on("book-proofread-run", () => work("book-proofread-run", "book-proofread-status", "Käynnistetään koko kirjan oikoluku…", async () => {
      await savedProject(); const current = await loadState(true); proofreadRun = current?.latest_proofread || proofreadRun;
      const identity = A.keyForRun("proofread.run", "whole-book", proofreadRun);
      proofreadRun = await A.request(projectPath("/proofread/run"), { method: "POST", body: { idempotency_key: identity } });
      sessionStorage.setItem("skriptlab_proofread_run:" + A.projectId(), proofreadRun.id); render(); await poll();
    }));
    on("book-proofread-refresh", () => poll().catch(error => tell("book-proofread-status", error.message)));
    on("book-proofread-download", () => {
      if (!proofreadRun) { tell("book-proofread-status", "Oikolukutuloksia ei ole vielä."); return; }
      const content = "# Oikoluku\n\n" + (proofreadRun.chapters || []).map(chapter => "## " + (chapter.title || chapter.chapter_title || "Luku " + ((chapter.index ?? chapter.chapter_index) + 1)) + "\n\n" + (chapter.suggestions || []).map(s => `${s.original}\n→ ${s.replacement}\n${s.reason}\nTila: ${s.status || "avoin"}`).join("\n\n")).join("\n\n");
      const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "oikoluku.md"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    });
    if (A.projectId()) poll().catch(error => tell("book-proofread-status", error.message));
  }
  function mountDevelopment() {
    const root = $("view-kehityseditointi"); if (!root) return;
    wrap(root, "development", "module.development_editing", `${cardIntro("Kehityspalaute", "Pyydä koko teoksesta toimituksellinen palaute. Saat arvion rakenteesta, henkilöistä, rytmistä ja tärkeimmistä seuraavista muokkauksista.")}<section class="book-basic-card"><label>Lisäohje kehityseditoijalle <textarea id="book-development-instructions" rows="4" maxlength="4000" placeholder="Esim. tarkastele erityisesti keskiosan rytmiä ja päähenkilön kaarta."></textarea></label><div class="book-basic-actions">${button("book-development-run", "Pyydä kehityspalaute", "development_feedback.run")}${usage("development_feedback.run")}${button("book-development-refresh", "Päivitä tulokset", null, true)}${button("book-development-download", "Lataa palaute", null, true)}</div>${status("book-development-status")}<div id="book-development-results" class="book-basic-results"></div></section>`);
    $("book-basic-tab-development").textContent = "Kehityspalaute";
    let run = null, runProject = null, timer = null, loadedCompleted = null;
    function render() {
      if (!run) return;
      const control = $("book-development-run"); control.dataset.bookRunning = String(["running", "queued", "pending"].includes(run.status)); control.disabled = control.dataset.bookRunning === "true";
      $("book-development-instructions").disabled = control.disabled || run.can_resume;
      if (run.can_resume) { delete control.dataset.accessAction; control.removeAttribute("aria-disabled"); control.classList.remove("book-access-locked"); control.textContent = "Jatka samaa kehityspalautetta"; }
      else { control.dataset.accessAction = "development_feedback.run"; control.textContent = "Pyydä kehityspalaute"; }
      tell("book-development-status", `${run.completed_count || 0}/${run.total_count || 0} osaa käsitelty. ${run.status === "completed" ? "Kehityspalaute valmis." : run.error_message || (run.phase === "synthesizing" ? "Koostetaan koko teoksen palautetta…" : "Teosta luetaan ja palautetta muodostetaan…")}`);
      const target = $("book-development-results"); target.replaceChildren();
      if (run.report) { const report = document.createElement("pre"); report.textContent = run.report; target.append(report); }
      else (run.partials || []).forEach(part => { const section = document.createElement("article"); const title = document.createElement("h3"); title.textContent = part.title || "Osa " + (Number(part.index) + 1); const report = document.createElement("pre"); report.textContent = part.report; section.append(title, report); target.append(section); });
      A.decorate();
    }
    async function poll() {
      if (!run?.id || runProject !== A.projectId()) return;
      run = await A.request(projectPath("/development-feedback/runs/" + run.id)); render(); clearTimeout(timer);
      if (["running", "pending", "queued"].includes(run.status)) timer = setTimeout(() => poll().catch(error => tell("book-development-status", error.message)), 4000);
      else {
        await A.refresh(true);
        if (run.status === "completed") { A.completeKey(A.keyFor("development_feedback.run", "whole-book")); if (loadedCompleted !== run.id) { loadedCompleted = run.id; await window.SkriptLabBasicHooks?.reloadProject?.(); } }
      }
    }
    async function load() {
      if (runProject !== A.projectId()) { run = null; loadedCompleted = null; $("book-development-results").replaceChildren(); }
      const state = await loadState(true); run = state?.latest_development_feedback || null; runProject = A.projectId();
      if (run) { if (run.can_resume) $("book-development-instructions").value = run.request?.instructions || ""; render(); await poll(); }
      else tell("book-development-status", "Kehityspalautetta ei ole vielä pyydetty.");
    }
    on("book-development-run", () => work("book-development-run", "book-development-status", "Käynnistetään koko teoksen kehityspalaute…", async () => {
      await savedProject(); const current = await loadState(true); const previous = current?.latest_development_feedback || run;
      run = await A.request(projectPath("/development-feedback/run"), { method: "POST", body: { idempotency_key: A.keyForRun("development_feedback.run", "whole-book", previous),
        instructions: previous?.can_resume ? previous.request?.instructions || "" : $("book-development-instructions").value.trim() } });
      runProject = A.projectId(); render(); await poll();
    }));
    on("book-development-refresh", () => load().catch(error => tell("book-development-status", error.message)));
    on("book-development-download", () => {
      const report = run?.report || (run?.partials || []).map(part => "## " + part.title + "\n\n" + part.report).join("\n\n");
      if (!report) { tell("book-development-status", "Ladattavaa palautetta ei ole vielä."); return; }
      const url = URL.createObjectURL(new Blob([report], { type: "text/markdown;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "kehityspalaute.md"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    });
    handlers["view-kehityseditointi"] = () => load().catch(error => tell("book-development-status", error.message));
  }
  function mountPlan() {
    const root = $("usage-box") || $("view-library"); if (!root) return;
    const panel = document.createElement("div"); panel.className = "book-basic-card";
    panel.innerHTML = '<p data-access-summary></p><p class="book-access-note">Lukitut toiminnot ja lisää kapasiteettia voi hankkia lisäpalveluna.</p>';
    root.prepend(panel);
    const analysisButton = $("btn-run-analysis");
    if (analysisButton) { const remaining = document.createElement("span"); remaining.className = "book-basic-usage"; remaining.dataset.accessUsage = "analysis.run"; analysisButton.after(remaining); }
  }
  function mountUsageBadges() {
    for (const [id, action] of [["ti-generate", "text.improve"], ["chat-send", "text.improve"], ["development-run-btn", "development_feedback.run"]]) {
      const control = $(id); if (!control) continue;
      const badge = document.createElement("p"); badge.className = "book-basic-usage"; badge.dataset.accessUsage = action; control.after(badge);
    }
  }
  function mountAdmin() {
    if (!location.pathname.endsWith("admin.html")) return;
    const root = $("admin-access-requests-host") || document.querySelector(".main-content") || document.querySelector("main") || document.body;
    const panel = document.createElement("section"); panel.className = "book-basic book-admin-access";
    panel.innerHTML = '<h2>Lisäpalvelupyynnöt ja käyttöoikeudet</h2><p>Myönnä kirjalle lisäkertoja tai avaa toiminto. Pyyntöihin ei liity automaattista maksua.</p><button id="book-admin-refresh" type="button">Päivitä pyynnöt</button><div id="book-admin-requests"></div><section class="book-basic-card"><h3>Myönnä käyttöoikeus</h3><div class="book-basic-grid"><label>Käyttäjän tunniste<input id="book-admin-user" type="number" min="1"></label><label>Teoksen tunniste (valinnainen)<input id="book-admin-project" type="number" min="1"></label><label>Toiminto<select id="book-admin-action"></select></label><label>Lisäkerrat<input id="book-admin-amount" type="number" min="1" value="1"></label></div><label class="book-basic-check"><input id="book-admin-unlimited" type="checkbox">Avaa toiminto ilman kertarajaa</label><label>Peruste<textarea id="book-admin-reason" rows="3" required placeholder="Esim. maksettu lisäpalvelu tai myyntiin perustuva painotaiton avaus."></textarea></label><button id="book-admin-grant" type="button">Myönnä käyttöoikeus</button></section>' + status("book-admin-status");
    root.append(panel);
    let selectedRequest = null;
    async function load() {
      const result = await A.request("/admin/access/requests"); const requests = Array.isArray(result) ? result : result.requests || result.items || [];
      $("book-admin-requests").replaceChildren();
      requests.filter(item => item.status === "pending").forEach(item => {
        const card = document.createElement("article"); card.className = "book-basic-card";
        const copy = document.createElement("p"); copy.textContent = `Käyttäjä ${item.user_id} · teos ${item.project_id || "—"} · ${A.label(item.action)}: ${item.message || ""}`;
        const grant = document.createElement("button"); grant.type = "button"; grant.textContent = "Käsittele pyyntö";
        grant.addEventListener("click", () => { selectedRequest = item.id; $("book-admin-user").value = item.user_id; $("book-admin-project").value = item.project_id || ""; if (!Array.from($("book-admin-action").options).some(option => option.value === item.action)) $("book-admin-action").add(new Option(A.label(item.action), item.action)); $("book-admin-action").value = item.action; $("book-admin-reason").focus(); });
        const decline = document.createElement("button"); decline.type = "button"; decline.className = "secondary"; decline.textContent = "Hylkää perustellen";
        decline.addEventListener("click", async () => { const reason = $("book-admin-reason").value.trim(); if (!reason) { tell("book-admin-status", "Kirjoita hylkäysperuste alla olevaan Peruste-kenttään."); $("book-admin-reason").focus(); return; } try { await A.request(`/admin/access/requests/${item.id}/resolve`, { method: "POST", body: { status: "declined", reason } }); await load(); tell("book-admin-status", "Pyyntö hylätty."); } catch (error) { tell("book-admin-status", error.message); } });
        card.append(copy, grant, decline); $("book-admin-requests").append(card);
      });
      if (!$("book-admin-requests").children.length) $("book-admin-requests").textContent = "Ei avoimia pyyntöjä.";
      const access = await A.refresh(true); const select = $("book-admin-action"); const selected = select.value;
      select.replaceChildren(); Object.keys(access?.actions || {}).sort().forEach(action => select.add(new Option(A.label(action) + " (" + action + ")", action))); if (selected) select.value = selected;
    }
    on("book-admin-refresh", () => load().catch(error => tell("book-admin-status", error.message)));
    on("book-admin-grant", () => work("book-admin-grant", "book-admin-status", "Tallennetaan käyttöoikeus…", async () => {
      const userId = Number($("book-admin-user").value); const reason = $("book-admin-reason").value.trim(); if (!userId || !reason) throw new Error("Anna käyttäjän tunniste ja myöntämisen peruste.");
      await A.request("/admin/access/grants", { method: "POST", body: { user_id: userId, project_id: Number($("book-admin-project").value) || null, action: $("book-admin-action").value,
        amount: Number($("book-admin-amount").value) || 1, unlimited: $("book-admin-unlimited").checked, reason, request_id: selectedRequest } });
      selectedRequest = null; await load(); tell("book-admin-status", "Käyttöoikeus myönnetty.");
    }));
    load().catch(error => tell("book-admin-status", error.message));
  }
  function init() {
    mountCover(); mountEpub(); mountAudio(); mountPublish(); mountProofread(); mountDevelopment(); mountPlan(); mountUsageBadges(); mountAdmin(); mountModuleIntroductions();
    A.registerExisting(); A.decorate();
    document.addEventListener("skriptlab:module-open", event => {
      A.refresh(true);
      if (event.detail?.preview) return;
      handlers[event.detail?.viewId]?.();
      const current = document.getElementById(event.detail?.viewId);
      current?.querySelectorAll("iframe").forEach(frame => frame.contentWindow?.postMessage({ type: "skriptlab:access-refresh" }, window.location.origin));
    });
    document.addEventListener("skriptlab:access", () => { if (stateProject && stateProject !== A.projectId()) { productionState = null; selectedCover = null; renderCovers(); renderPublication(); } });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
