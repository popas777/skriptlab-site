(function () {
  "use strict";

  const ACTIVE_PROJECT_ID_KEY = "skriptlab_active_project_id";
  const AUTH_TOKEN_KEY = "skriptlab_auth_token";
  const API_BASE = String(window.SKRIPTLAB_CONFIG?.API_BASE_URL || "").replace(/\/$/, "");
  const PROJECT_POLL_INTERVAL_MS = 700;

  const state = {
    projectId: "",
    project: null,
    decision: null,
    busy: false,
    requestSequence: 0,
    projectController: null,
    activePanel: "contracts-decision-panel",
    parentViewVisible: false,
  };

  const elements = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function collectElements() {
    [
      "contracts-project-context",
      "contracts-context-state",
      "contracts-character-count",
      "contracts-word-count",
      "contracts-chapter-count",
      "contracts-analysis-context",
      "contracts-analysis-context-detail",
      "contracts-analysis-guidance",
      "contracts-run-analysis",
      "contracts-status",
      "contracts-analysis-empty",
      "contracts-analysis-result",
      "contracts-verdict-card",
      "contracts-verdict-headline",
      "contracts-verdict-badge",
      "contracts-verdict-summary",
      "contracts-analysis-date",
      "contracts-readiness-score",
      "contracts-readiness-meter",
      "contracts-marketability-score",
      "contracts-marketability-meter",
      "contracts-strengths",
      "contracts-risks",
      "contracts-feedback-kicker",
      "contracts-feedback-title",
      "contracts-feedback-state",
      "contracts-development-feedback",
      "contracts-next-steps",
      "contracts-offer-callout",
      "contracts-open-offer",
      "contracts-tab-count",
      "contracts-document-count",
      "contracts-draft-card",
      "contracts-draft-status",
      "contracts-draft-card-title",
      "contracts-draft-card-meta",
      "contracts-open-draft",
      "contracts-document-status",
      "contracts-document",
      "contracts-document-title",
      "contracts-document-kicker",
      "contracts-document-intro",
      "contracts-draft-stamp",
      "contracts-copy-draft",
      "contracts-download-draft",
      "contracts-print-draft",
    ].forEach((id) => {
      elements[id] = byId(id);
    });
  }

  function safeParent() {
    try {
      if (window.parent !== window && window.parent.location.origin === window.location.origin) {
        return window.parent;
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  function parentProject() {
    const parent = safeParent();
    const project = parent?.manuscriptData;
    return project && typeof project === "object" ? project : null;
  }

  function parentViewIsVisible() {
    const parent = safeParent();
    if (!parent) return !document.hidden;
    const frame = parent.document.getElementById("sopimukset-frame");
    const view = frame?.closest(".view-section");
    return Boolean(view && !view.classList.contains("hidden"));
  }

  function syncParentViewVisibility() {
    const visible = parentViewIsVisible();
    if (visible && !state.parentViewVisible) {
      state.parentViewVisible = true;
      state.decision = null;
      renderDecision(null);
      setStatus("Tarkistetaan käsikirjoituksen ja päätöksen ajantasaisuus…");
      void syncActiveProject({ force: true });
      return;
    }
    state.parentViewVisible = visible;
  }

  function watchParentViewVisibility() {
    const parent = safeParent();
    const view = parent?.document?.getElementById("sopimukset-frame")?.closest(".view-section");
    if (view && typeof MutationObserver !== "undefined") {
      const observer = new MutationObserver(syncParentViewVisibility);
      observer.observe(view, { attributes: true, attributeFilter: ["class"] });
    }
    syncParentViewVisibility();
  }

  function activeProjectId() {
    const directId = parentProject()?.id;
    return String(directId || localStorage.getItem(ACTIVE_PROJECT_ID_KEY) || "");
  }

  function syncParentTheme() {
    const parent = safeParent();
    let theme = "light";
    try {
      theme = parent?.document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    } catch (error) {
      theme = "light";
    }
    document.documentElement.dataset.shellTheme = theme;
  }

  function watchParentTheme() {
    syncParentTheme();
    const parent = safeParent();
    if (!parent?.document?.documentElement || typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(syncParentTheme);
    observer.observe(parent.document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }

  function apiUrl(path) {
    return `${API_BASE}${path}`;
  }

  async function apiFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(apiUrl(path), { ...options, headers });
    if (response.status === 401) {
      const parent = safeParent();
      if (parent) parent.location.replace("login.html");
      else window.location.replace("login.html");
    }
    return response;
  }

  async function responseMessage(response, fallback) {
    const payload = await response.json().catch(() => null);
    return payload?.detail || payload?.message || fallback;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function inlineMarkup(value) {
    return escapeHtml(value)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  }

  function richTextHtml(value) {
    const lines = String(value || "").replace(/\r\n?/g, "\n").split("\n");
    const blocks = [];
    let paragraph = [];
    let listType = "";
    let listItems = [];

    const flushParagraph = () => {
      if (!paragraph.length) return;
      blocks.push(`<p>${inlineMarkup(paragraph.join(" "))}</p>`);
      paragraph = [];
    };
    const flushList = () => {
      if (!listItems.length) return;
      blocks.push(`<${listType}>${listItems.map((item) => `<li>${inlineMarkup(item)}</li>`).join("")}</${listType}>`);
      listItems = [];
      listType = "";
    };

    lines.forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) {
        flushParagraph();
        flushList();
        return;
      }
      const heading = line.match(/^(#{2,4})\s+(.+)$/);
      if (heading) {
        flushParagraph();
        flushList();
        const level = Math.min(4, Math.max(3, heading[1].length));
        blocks.push(`<h${level}>${inlineMarkup(heading[2])}</h${level}>`);
        return;
      }
      const bullet = line.match(/^[-*•]\s+(.+)$/);
      const numbered = line.match(/^\d+[.)]\s+(.+)$/);
      if (bullet || numbered) {
        flushParagraph();
        const nextType = bullet ? "ul" : "ol";
        if (listType && listType !== nextType) flushList();
        listType = nextType;
        listItems.push((bullet || numbered)[1]);
        return;
      }
      flushList();
      paragraph.push(line);
    });
    flushParagraph();
    flushList();
    return blocks.join("") || "<p>Arviota ei ole saatavilla.</p>";
  }

  function projectText(project = state.project) {
    if (!project || !Array.isArray(project.chapters)) return "";
    return project.chapters
      .flatMap((chapter) => [chapter?.title || "", ...(Array.isArray(chapter?.paragraphs) ? chapter.paragraphs : [])])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join("\n\n");
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("fi-FI").format(Math.max(0, Number(value || 0)));
  }

  function wordCount(text) {
    return String(text || "").trim().split(/\s+/u).filter(Boolean).length;
  }

  function clampScore(value) {
    return Math.max(0, Math.min(100, Math.round(Number(value || 0))));
  }

  function substantiveAnalysis(analysis) {
    if (!analysis || typeof analysis !== "object") return false;
    return [
      analysis.editorial_assessment,
      analysis.synopsis,
      analysis.chapter_analysis,
      analysis.genre,
      analysis.audience,
      analysis.development_editing?.feedback_report,
    ].some((value) => String(value || "").trim().length > 40);
  }

  function canEditProject(project) {
    const access = String(project?.access_level || "owner");
    return ["admin", "owner", "shared_edit"].includes(access);
  }

  function normalizedList(value, fallback) {
    const values = Array.isArray(value) ? value : [];
    const clean = values.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8);
    return clean.length ? clean : [fallback];
  }

  function structuredFeedbackText(value) {
    if (typeof value === "string") return value.trim();
    if (!value || typeof value !== "object") return "";
    const sections = [];
    const editorialSummary = String(value.editorial_summary || "").trim();
    if (editorialSummary) sections.push(editorialSummary);
    const priorities = normalizedList(value.priority_actions, "").filter(Boolean);
    if (priorities.length) {
      sections.push(`### Priorisoidut korjaukset\n${priorities.map((item) => `- ${item}`).join("\n")}`);
    }
    [
      ["Rakenne ja rytmi", value.structure],
      ["Henkilöt ja näkökulma", value.characters],
      ["Kieli ja tyyli", value.language_and_style],
      ["Markkina-asemointi", value.market_positioning],
      ["Polku uuteen päätökseen", value.publication_path],
    ].forEach(([heading, content]) => {
      const text = String(content || "").trim();
      if (text) sections.push(`### ${heading}\n${text}`);
    });
    return sections.join("\n\n");
  }

  function normalizeDecision(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (raw.__contractsNormalized === true) return raw;
    const source = raw.publishing_decision && typeof raw.publishing_decision === "object"
      ? raw.publishing_decision
      : raw;
    const rawDecision = String(source.decision || source.outcome || "").toLowerCase();
    const offer = ["contract_offer", "offer", "tarjous", "publish"].includes(rawDecision);
    const feedback = source.developmental_feedback ?? source.development_feedback;
    const feedbackObject = feedback && typeof feedback === "object" ? feedback : null;
    const summary = String(source.summary || "").trim();
    const rationale = String(source.rationale || "").trim();
    return {
      ...source,
      __contractsNormalized: true,
      decision: offer ? "contract_offer" : "development_required",
      readiness_score: clampScore(source.readiness_score ?? source.readinessScore),
      marketability_score: clampScore(source.marketability_score ?? source.marketabilityScore),
      headline: String(source.headline || source.title || (offer ? "Teos voidaan ottaa sopimusneuvotteluun" : "Teos tarvitsee vielä kehityskierroksen")).trim(),
      summary: [summary, rationale && rationale !== summary ? rationale : ""].filter(Boolean).join("\n\n") || "Arvio ei sisältänyt erillistä yhteenvetoa.",
      strengths: normalizedList(source.strengths, "Arvio ei yksilöinyt vahvuuksia."),
      risks: normalizedList(source.risks || source.concerns || source.blocking_issues, "Arvio ei yksilöinyt avoimia riskejä."),
      next_steps: normalizedList(source.next_steps || feedbackObject?.priority_actions, offer ? "Täydennä sopimusluonnoksen osapuoli- ja päivämäärätiedot." : "Tee palautteen mukainen uusi käsikirjoitusversio."),
      developmental_feedback: structuredFeedbackText(feedback) || String(source.report_markdown || "Palaute ei sisältänyt erillistä kehitysosiota.").trim(),
      generated_at: String(source.generated_at || source.updated_at || "").trim(),
      generated_by: String(source.generated_by || "").trim(),
      warnings: Array.isArray(source.warnings) ? source.warnings.map((item) => String(item || "").trim()).filter(Boolean) : [],
    };
  }

  function setStatus(message, isError = false) {
    if (!elements["contracts-status"]) return;
    elements["contracts-status"].textContent = message || "";
    elements["contracts-status"].classList.toggle("is-error", Boolean(isError));
  }

  function setDocumentStatus(message, isError = false) {
    if (!elements["contracts-document-status"]) return;
    elements["contracts-document-status"].textContent = message || "";
    elements["contracts-document-status"].classList.toggle("is-error", Boolean(isError));
  }

  function setBusy(busy) {
    state.busy = Boolean(busy);
    const button = elements["contracts-run-analysis"];
    if (!button) return;
    button.disabled = state.busy || !state.project || !canEditProject(state.project) || projectText().trim().length < 200;
    button.innerHTML = state.busy
      ? '<span class="button-spinner" aria-hidden="true">◌</span> Arvioidaan…'
      : '<span aria-hidden="true">✦</span> Tee minianalyysi';
  }

  function setList(element, values) {
    if (!element) return;
    element.innerHTML = values.map((value) => `<li>${inlineMarkup(value)}</li>`).join("");
  }

  function formatDecisionDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("fi-FI", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function renderContractOfferState(decision = state.decision) {
    const offer = decision?.decision === "contract_offer";
    const hasProject = Boolean(state.project);
    const title = String(state.project?.title || "[teoksen nimi]");
    const author = String(state.project?.author || "[tekijän nimi]");

    document.querySelectorAll("[data-contract-title]").forEach((element) => { element.textContent = title; });
    document.querySelectorAll("[data-contract-author]").forEach((element) => { element.textContent = author; });

    elements["contracts-tab-count"].textContent = "3";
    elements["contracts-document-count"].textContent = "3 asiakirjaa";
    elements["contracts-draft-card"].classList.toggle("is-offer", offer);
    elements["contracts-draft-status"].className = `document-status ${offer ? "is-offer" : "is-waiting"}`;
    elements["contracts-draft-status"].textContent = offer ? "Tarjottu" : "Malli";
    elements["contracts-draft-card-title"].textContent = offer ? `Sopimustarjous: ${title}` : "Tekijänpalkkiosopimus";
    elements["contracts-draft-card-meta"].textContent = offer
      ? "Muodostettu myönteisen kustannuspäätöksen perusteella"
      : (hasProject ? "Odottaa myönteistä kustannuspäätöstä" : "Valitse teos sopimusrungon täydentämiseksi");
    elements["contracts-open-draft"].textContent = offer ? "Tarkastele sopimustarjousta" : "Esikatsele sopimusrunkoa";
    elements["contracts-document-kicker"].textContent = offer ? "Sopimustarjous · neuvotteluversio" : "Neuvottelupohja";
    elements["contracts-document-intro"].textContent = offer
      ? `Tämä sopimustarjous koskee teosta ${title}. Se muuttuu sitovaksi vasta, kun täydennetyt ehdot on hyväksytty ja molemmat osapuolet ovat allekirjoittaneet sopimuksen.`
      : "Tämä on muokattava sopimusrunko, ei sitova tarjous ennen myönteistä kustannuspäätöstä, osapuolten hyväksyntää ja allekirjoituksia.";
    elements["contracts-draft-stamp"].classList.toggle("is-offer", offer);
    elements["contracts-draft-stamp"].textContent = offer ? "TARJOUS" : "LUONNOS";
  }

  function renderDecision(decision = state.decision) {
    const normalized = normalizeDecision(decision);
    state.decision = normalized;
    const empty = elements["contracts-analysis-empty"];
    const result = elements["contracts-analysis-result"];
    if (!normalized) {
      empty.hidden = false;
      result.hidden = true;
      renderContractOfferState(null);
      return;
    }

    const offer = normalized.decision === "contract_offer";
    empty.hidden = true;
    result.hidden = false;
    elements["contracts-verdict-card"].className = `verdict-card surface-card ${offer ? "is-offer" : "is-development"}`;
    elements["contracts-verdict-headline"].textContent = normalized.headline;
    elements["contracts-verdict-badge"].className = `verdict-badge ${offer ? "is-offer" : "is-development"}`;
    elements["contracts-verdict-badge"].textContent = offer ? "Tarjoa sopimusta" : "Kehitä ennen sopimusta";
    elements["contracts-verdict-summary"].innerHTML = richTextHtml(normalized.summary);

    const date = formatDecisionDate(normalized.generated_at);
    const model = normalized.generated_by ? ` · ${normalized.generated_by}` : "";
    elements["contracts-analysis-date"].textContent = date ? `Arvioitu ${date}${model}` : (model ? model.slice(3) : "");
    elements["contracts-readiness-score"].textContent = String(normalized.readiness_score);
    elements["contracts-marketability-score"].textContent = String(normalized.marketability_score);
    elements["contracts-readiness-meter"].style.width = `${normalized.readiness_score}%`;
    elements["contracts-marketability-meter"].style.width = `${normalized.marketability_score}%`;
    setList(elements["contracts-strengths"], normalized.strengths);
    setList(elements["contracts-risks"], normalized.risks);

    elements["contracts-feedback-kicker"].textContent = offer ? "Toimituksellinen jatkopalaute" : "Kehityseditointipalaute";
    elements["contracts-feedback-title"].textContent = offer ? "Mitä viimeistellään ennen tuotantoa" : "Mitä seuraavaan versioon tarvitaan";
    elements["contracts-feedback-state"].className = `feedback-state ${offer ? "is-offer" : "is-development"}`;
    elements["contracts-feedback-state"].textContent = offer ? "Tuotantoon" : "Toimenpiteet";
    elements["contracts-development-feedback"].innerHTML = richTextHtml(normalized.developmental_feedback);
    setList(elements["contracts-next-steps"], normalized.next_steps);
    elements["contracts-offer-callout"].hidden = !offer;
    renderContractOfferState(normalized);
  }

  function renderProject() {
    const project = state.project;
    const text = projectText(project);
    const hasProject = Boolean(project?.id);
    const chapters = Array.isArray(project?.chapters) ? project.chapters.length : 0;
    const analysis = project?.analysis && typeof project.analysis === "object" ? project.analysis : {};
    const hasAnalysis = substantiveAnalysis(analysis);
    const editable = canEditProject(project);

    elements["contracts-project-context"].textContent = hasProject
      ? `${project.title || "Nimetön teos"}${project.author ? ` · ${project.author}` : ""}`
      : "Valitse käsikirjoitus pääsovelluksesta.";
    elements["contracts-context-state"].classList.toggle("is-ready", hasProject);
    elements["contracts-context-state"].textContent = hasProject ? "Aktiivinen teos" : "Ei aktiivista teosta";
    elements["contracts-character-count"].textContent = hasProject ? `${formatNumber(text.length)} merkkiä` : "–";
    elements["contracts-word-count"].textContent = hasProject ? `${formatNumber(wordCount(text))} sanaa` : "Ei aktiivista tekstiä";
    elements["contracts-chapter-count"].textContent = hasProject ? formatNumber(chapters) : "–";
    elements["contracts-analysis-context"].textContent = hasProject ? (hasAnalysis ? "Analyysi + teksti" : "Tekstinäytteet") : "–";
    elements["contracts-analysis-context-detail"].textContent = hasProject
      ? (hasAnalysis ? "Tallennettu teosanalyysi käytössä" : "Alustava arvio ilman laajaa analyysiä")
      : "Odottaa käsikirjoitusta";

    if (!hasProject) {
      elements["contracts-analysis-guidance"].textContent = "Valitse tekstillinen käsikirjoitus. Päätös tallennetaan teoksen yhteyteen ja sen voi päivittää tekstin muuttuessa.";
    } else if (!editable) {
      elements["contracts-analysis-guidance"].textContent = "Teos on katselutilassa. Kustannuspäätösanalyysin käynnistäminen vaatii muokkausoikeuden.";
    } else if (text.trim().length < 200) {
      elements["contracts-analysis-guidance"].textContent = "Käsikirjoituksessa ei ole vielä riittävästi tekstiä minianalyysiin.";
    } else if (!hasAnalysis) {
      elements["contracts-analysis-guidance"].textContent = "Laajaa teosanalyysiä ei ole tallennettu. Minianalyysi voidaan silti tehdä edustavista tekstinäytteistä ja rakennetiedoista.";
    } else {
      elements["contracts-analysis-guidance"].textContent = "Arvio käyttää tallennettua teosanalyysiä sekä käsikirjoituksen alku-, keski- ja loppuosan näytteitä.";
    }

    const savedDecision = analysis.publishing_decision || analysis.contract_decision || null;
    renderDecision(savedDecision);
    setBusy(state.busy);
  }

  function clearProject() {
    state.projectId = "";
    state.project = null;
    state.decision = null;
    state.projectController?.abort();
    state.projectController = null;
    renderProject();
    setStatus("");
  }

  async function loadProject(projectId, options = {}) {
    const requestedId = String(projectId || "");
    if (!requestedId) {
      clearProject();
      return null;
    }
    const sequence = ++state.requestSequence;
    state.projectController?.abort();
    const controller = new AbortController();
    state.projectController = controller;
    if (!options.quiet) setStatus("Ladataan käsikirjoituksen kustannuskontekstia…");
    try {
      const response = await apiFetch(`/api/projects/${encodeURIComponent(requestedId)}`, { signal: controller.signal });
      if (!response.ok) throw new Error(await responseMessage(response, "Käsikirjoituksen lataus epäonnistui."));
      const project = await response.json();
      if (sequence !== state.requestSequence || activeProjectId() !== requestedId) return null;
      state.projectId = requestedId;
      state.project = project;
      renderProject();
      if (!options.quiet) setStatus(state.decision ? "Tallennettu kustannuspäätös ladattu." : "Valmis minianalyysiin.");
      return project;
    } catch (error) {
      if (error?.name === "AbortError") return null;
      if (sequence === state.requestSequence) {
        state.projectId = requestedId;
        state.project = null;
        state.decision = null;
        renderProject();
        setStatus(error.message || "Käsikirjoituksen lataus epäonnistui.", true);
      }
      return null;
    } finally {
      if (state.projectController === controller) state.projectController = null;
    }
  }

  async function syncActiveProject(options = {}) {
    const nextId = activeProjectId();
    if (!nextId) {
      if (state.projectId || state.project) clearProject();
      return;
    }
    if (nextId !== state.projectId || options.force) {
      await loadProject(nextId, { quiet: options.quiet });
      return;
    }

    const parent = parentProject();
    if (parent && state.project) {
      let changed = false;
      ["title", "author"].forEach((key) => {
        if (parent[key] !== undefined && parent[key] !== state.project[key]) {
          state.project[key] = parent[key];
          changed = true;
        }
      });
      if (changed) renderProject();
    }
  }

  async function flushParentEdits() {
    const parent = safeParent();
    if (typeof parent?.flushManuscriptSaveQueue === "function") {
      await parent.flushManuscriptSaveQueue();
    }
  }

  function updateParentDecision(decision) {
    const parent = safeParent();
    const parentData = parent?.manuscriptData;
    if (!parentData || String(parentData.id || "") !== String(state.projectId || "")) return;
    parentData.analysis = parentData.analysis || {};
    parentData.analysis.publishing_decision = decision;
    try {
      localStorage.setItem("skriptlab_manuscript", JSON.stringify(parentData));
    } catch (error) {
      // The server remains the source of truth if the browser cache is unavailable.
    }
  }

  async function runDecisionAnalysis() {
    if (state.busy || !state.project?.id) return;
    const requestedProjectId = String(state.project.id);
    setBusy(true);
    setStatus("Tallennetaan avoimet käsikirjoitusmuutokset…");
    try {
      await flushParentEdits();
      if (activeProjectId() !== requestedProjectId) return;
      await loadProject(requestedProjectId, { quiet: true });
      if (
        String(state.project?.id || "") !== requestedProjectId
        || activeProjectId() !== requestedProjectId
      ) return;
      const runRequestSequence = state.requestSequence;
      setStatus("Kustannustoimittaja arvioi julkaisukuntoa ja markkinakelpoisuutta…");
      const response = await apiFetch(`/api/projects/${encodeURIComponent(requestedProjectId)}/contracts/decision-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (
        state.requestSequence !== runRequestSequence
        || String(state.projectId || "") !== requestedProjectId
        || activeProjectId() !== requestedProjectId
      ) return;
      if (!response.ok) throw new Error(await responseMessage(response, "Kustannuspäätösanalyysi epäonnistui."));
      const payload = await response.json();
      if (
        state.requestSequence !== runRequestSequence
        || String(state.projectId || "") !== requestedProjectId
        || activeProjectId() !== requestedProjectId
      ) return;
      const decision = normalizeDecision(payload);
      if (!decision) throw new Error("Kustannuspäätös ei ollut luettavassa muodossa.");
      state.project.analysis = state.project.analysis || {};
      state.project.analysis.publishing_decision = payload.publishing_decision || payload;
      state.decision = decision;
      updateParentDecision(payload.publishing_decision || payload);
      renderDecision(decision);
      const warning = decision.warnings.length ? ` ${decision.warnings.join(" ")}` : "";
      setStatus(`${decision.decision === "contract_offer" ? "Myönteinen kustannuspäätös valmis." : "Kehityspäätös ja palaute valmis."}${warning}`);
    } catch (error) {
      setStatus(error.message || "Kustannuspäätösanalyysi epäonnistui.", true);
      if (/muuttui|vanhentui|uudelleen/i.test(error.message || "")) {
        await syncActiveProject({ force: true, quiet: true });
      }
    } finally {
      setBusy(false);
    }
  }

  function showPanel(panelId, options = {}) {
    const target = byId(panelId);
    if (!target) return;
    state.activePanel = panelId;
    document.querySelectorAll("[data-contracts-panel]").forEach((button) => {
      const active = button.dataset.contractsPanel === panelId;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll(".contracts-panel").forEach((panel) => {
      const active = panel.id === panelId;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });
    if (options.focusTab) {
      document.querySelector(`[data-contracts-panel="${panelId}"]`)?.focus();
    }
  }

  function openContractDocument(options = {}) {
    showPanel("contracts-list-panel");
    elements["contracts-document"].hidden = false;
    renderContractOfferState();
    if (options.scroll !== false) {
      elements["contracts-document"].scrollIntoView({ behavior: "smooth", block: "start" });
    }
    window.setTimeout(() => elements["contracts-document-title"]?.focus({ preventScroll: true }), 0);
  }

  function contractDraftText() {
    const title = state.project?.title || "[teoksen nimi]";
    const author = state.project?.author || "[tekijän nimi]";
    const offer = state.decision?.decision === "contract_offer";
    const bodyText = elements["contracts-contract-body"]?.innerText?.trim() || "";
    return [
      "TEKIJÄNPALKKIO- JA KUSTANNUSSOPIMUSLUONNOS",
      offer ? "Sopimustarjous – neuvotteluversio" : "Neuvottelupohja – ei sitova tarjous",
      "",
      `Teos: ${title}`,
      `Tekijä: ${author}`,
      "",
      "TÄRKEÄÄ: Täydennä hakasulkeissa olevat kohdat ja tarkastuta luonnos kustannusalan sopimuksiin perehtyneellä juristilla ennen allekirjoittamista.",
      "",
      bodyText,
    ].join("\n");
  }

  async function copyContractDraft() {
    const text = contractDraftText();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setDocumentStatus("Sopimusluonnos kopioitu leikepöydälle.");
    } catch (error) {
      setDocumentStatus("Sopimusluonnoksen kopiointi epäonnistui.", true);
    }
  }

  function fileSlug(value) {
    return String(value || "teos")
      .toLocaleLowerCase("fi-FI")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "teos";
  }

  function downloadContractDraft() {
    const blob = new Blob([contractDraftText()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${fileSlug(state.project?.title)}-tekijapalkkiosopimus-luonnos.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setDocumentStatus("Sopimusluonnos ladattu TXT-tiedostona.");
  }

  function printContractDraft() {
    openContractDocument({ scroll: false });
    setDocumentStatus("Tulostusnäkymä avataan. Valitse tulostusikkunassa Tallenna PDF, jos haluat PDF-tiedoston.");
    window.setTimeout(() => window.print(), 50);
  }

  function bindTabs() {
    const tabs = Array.from(document.querySelectorAll("[data-contracts-panel]"));
    tabs.forEach((button, index) => {
      button.addEventListener("click", () => showPanel(button.dataset.contractsPanel));
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        let nextIndex = index;
        if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = tabs.length - 1;
        showPanel(tabs[nextIndex].dataset.contractsPanel, { focusTab: true });
      });
    });
  }

  function bindActions() {
    elements["contracts-run-analysis"].addEventListener("click", runDecisionAnalysis);
    elements["contracts-open-offer"].addEventListener("click", () => openContractDocument());
    elements["contracts-open-draft"].addEventListener("click", () => openContractDocument());
    elements["contracts-copy-draft"].addEventListener("click", copyContractDraft);
    elements["contracts-download-draft"].addEventListener("click", downloadContractDraft);
    elements["contracts-print-draft"].addEventListener("click", printContractDraft);
    document.querySelectorAll(".existing-contract-download").forEach((button) => {
      button.addEventListener("click", () => {
        setDocumentStatus(`${button.dataset.documentName || "Sopimuksen"} PDF-lataus kytketään sopimusarkistoon seuraavassa vaiheessa.`);
      });
    });
  }

  function bootstrap() {
    collectElements();
    bindTabs();
    bindActions();
    watchParentTheme();
    renderProject();
    watchParentViewVisibility();
    window.setInterval(() => {
      syncParentTheme();
      syncParentViewVisibility();
      syncActiveProject({ quiet: true });
    }, PROJECT_POLL_INTERVAL_MS);
    window.addEventListener("focus", () => syncActiveProject({ force: true, quiet: true }));
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) syncActiveProject({ force: true, quiet: true });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
