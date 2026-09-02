(function () {
    "use strict";

    const rootConfig = window.SKRIPTLAB_CONFIG || {};
    const API_BASE = String(rootConfig.API_BASE_URL || "").replace(/\/$/, "") + "/api";
    const ACTIVE_PROJECT_KEY = "skriptlab_active_project_id";
    const $ = (id) => document.getElementById(id);

    const state = {
        projects: [],
        project: null,
        translations: [],
        translation: null,
        segmentIndex: 0,
        reviews: new Map(),
        busy: false,
        projectLoadRevision: 0,
        translationLoadRevision: 0,
        scrollSyncing: false,
    };

    let toastTimer = null;

    function authToken() {
        return localStorage.getItem("skriptlab_auth_token") || "";
    }

    if (!authToken()) {
        window.top.location.replace("login.html");
        return;
    }

    function jsonOptions(method, body) {
        return {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        };
    }

    function apiErrorDetail(value) {
        if (Array.isArray(value)) {
            return value
                .map((item) => String(item?.msg || item?.message || "").trim())
                .filter(Boolean)
                .join(" ");
        }
        if (value && typeof value === "object") {
            return String(value.message || value.msg || "").trim();
        }
        return String(value || "").trim();
    }

    async function authorizedFetch(path, options) {
        const requestOptions = Object.assign({}, options || {});
        const headers = Object.assign({}, requestOptions.headers || {});
        const token = authToken();
        if (token) headers.Authorization = "Bearer " + token;
        requestOptions.headers = headers;
        const response = await fetch(API_BASE + path, requestOptions);
        if (response.status === 401) {
            localStorage.removeItem("skriptlab_auth_token");
            localStorage.removeItem("skriptlab_auth_user");
            window.top.location.replace("login.html");
            throw new Error("Kirjautuminen on vanhentunut.");
        }
        return response;
    }

    async function api(path, options) {
        const controller = new AbortController();
        const longRequest = path.includes("/finishing-suggestions");
        const timeout = window.setTimeout(() => controller.abort(), longRequest ? 180000 : 45000);
        const requestOptions = Object.assign({}, options || {});
        if (!requestOptions.signal) requestOptions.signal = controller.signal;
        try {
            const response = await authorizedFetch(path, requestOptions);
            if (!response.ok) {
                let detail = "";
                try {
                    const body = await response.json();
                    detail = apiErrorDetail(body.detail || body.message || "");
                } catch (error) {
                    detail = "";
                }
                throw new Error(detail || "Pyyntö epäonnistui (" + response.status + ").");
            }
            if (response.status === 204) return null;
            return response.json();
        } catch (error) {
            if (error?.name === "AbortError") {
                throw new Error("Pyyntö kesti liian kauan. Käännöstä ei muutettu.");
            }
            throw error;
        } finally {
            window.clearTimeout(timeout);
        }
    }

    function toast(message) {
        const element = $("kf-toast");
        element.textContent = String(message || "");
        element.hidden = false;
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => {
            element.hidden = true;
        }, 4300);
    }

    function setStatus(message) {
        $("kf-status").textContent = String(message || "");
    }

    function setBusy(show, label) {
        state.busy = Boolean(show);
        $("kf-working").hidden = !show;
        $("kf-header").inert = Boolean(show);
        $("kf-workspace").inert = Boolean(show);
        if (label) $("kf-working-label").textContent = label;
        renderSuggestions();
    }

    function paragraphModel(value) {
        const text = String(value || "").replace(/\r\n?/g, "\n");
        const paragraphs = [];
        const separators = [];
        const pattern = /\n(?:[ \t]*\n)+/g;
        let lastIndex = 0;
        let match;
        while ((match = pattern.exec(text))) {
            paragraphs.push(text.slice(lastIndex, match.index));
            separators.push(match[0]);
            lastIndex = match.index + match[0].length;
        }
        paragraphs.push(text.slice(lastIndex));
        separators.push("");
        return { text, paragraphs, separators };
    }

    function findSuggestionRange(text, suggestion) {
        const model = paragraphModel(text);
        const paragraphIndex = Number(suggestion?.paragraph_index);
        if (!Number.isInteger(paragraphIndex) || paragraphIndex < 0 || paragraphIndex >= model.paragraphs.length) {
            return { error: "Ehdotuksen kappaletta ei enää löytynyt." };
        }
        const original = String(suggestion?.original || "");
        if (!original) return { error: "Ehdotuksen alkuperäinen tekstikohta puuttuu." };
        const paragraph = model.paragraphs[paragraphIndex];
        const localStart = paragraph.indexOf(original);
        if (localStart < 0) return { error: "Tekstikohta on muuttunut tarkistuksen jälkeen." };
        if (paragraph.indexOf(original, localStart + Math.max(1, original.length)) >= 0) {
            return { error: "Sama tekstikohta esiintyy kappaleessa useasti eikä korjausta voi kohdistaa varmasti." };
        }
        let paragraphStart = 0;
        for (let index = 0; index < paragraphIndex; index += 1) {
            paragraphStart += model.paragraphs[index].length + model.separators[index].length;
        }
        const start = paragraphStart + localStart;
        return { start, end: start + original.length };
    }

    function replaceSuggestionRange(text, suggestion, replacement) {
        const normalized = paragraphModel(text).text;
        const range = findSuggestionRange(normalized, suggestion);
        if (range.error) return { text: normalized, error: range.error };
        return {
            text: normalized.slice(0, range.start) + String(replacement ?? "") + normalized.slice(range.end),
            range,
        };
    }

    function wordCount(value) {
        return String(value || "").trim().split(/\s+/).filter(Boolean).length;
    }

    function sourceTextForChunk(chunk) {
        const promptSections = chunk?.prompt_sections && typeof chunk.prompt_sections === "object"
            ? chunk.prompt_sections
            : {};
        return String(chunk?.source_text || promptSections.source_text || "")
            .replace(/^KÄÄNNETTÄVÄ TEKSTI:\s*/i, "")
            .trim();
    }

    function translationTextForChunk(chunk) {
        return String(chunk?.translation || "");
    }

    function translationChunks(item) {
        return (Array.isArray(item?.chunk_details) ? item.chunk_details : [])
            .map((chunk, rawIndex) => Object.assign({ _kfRawIndex: rawIndex }, chunk))
            .filter((chunk) => translationTextForChunk(chunk).trim());
    }

    function currentChunk() {
        return translationChunks(state.translation)[state.segmentIndex] || null;
    }

    function currentReview() {
        const chunk = currentChunk();
        return chunk ? state.reviews.get(chunk._kfRawIndex) || null : null;
    }

    function chunkTitle(chunk, index) {
        const location = chunk?.book_location && typeof chunk.book_location === "object"
            ? chunk.book_location
            : {};
        const primary = location.primary_chapter && typeof location.primary_chapter === "object"
            ? location.primary_chapter
            : {};
        return String(
            location.chapter_span
            || location.title
            || primary.title
            || chunk?.chapter_title
            || "Käännössegmentti " + (index + 1)
        );
    }

    function languageLabel(code, fallback) {
        const labels = {
            fi: "suomi",
            en: "englanti",
            sv: "ruotsi",
            de: "saksa",
            fr: "ranska",
            es: "espanja",
            it: "italia",
            no: "norja",
            da: "tanska",
            et: "viro",
        };
        return labels[String(code || "").toLowerCase()] || fallback;
    }

    function statusLabel(status) {
        return {
            open: "Avoin",
            accepted: "Hyväksytty",
            rejected: "Hylätty",
            stale: "Vanhentunut",
        }[status] || "Avoin";
    }

    function renderReader(reader, text, emptyTitle) {
        reader.replaceChildren();
        const model = paragraphModel(text);
        const hasText = model.paragraphs.some((paragraph) => paragraph.trim());
        if (!hasText) {
            const message = document.createElement("div");
            message.className = "ti-reader-message";
            const title = document.createElement("h3");
            title.textContent = emptyTitle;
            message.appendChild(title);
            reader.appendChild(message);
            return;
        }
        model.paragraphs.forEach((paragraph, index) => {
            const element = document.createElement("p");
            element.dataset.lineNumber = String(index + 1);
            element.textContent = paragraph || " ";
            reader.appendChild(element);
        });
    }

    function renderDocument() {
        const chunks = translationChunks(state.translation);
        const chunk = currentChunk();
        const hasTranslation = Boolean(chunk);
        $("kf-translation-empty").hidden = hasTranslation;
        if (!hasTranslation) {
            $("kf-source-reader").replaceChildren();
            $("kf-target-reader").replaceChildren();
            $("kf-segment-title").textContent = "Ei valittua käännöstä";
            $("kf-segment-position").textContent = "0 / 0";
            $("kf-word-count").textContent = "0 sanaa";
            return;
        }

        state.segmentIndex = Math.max(0, Math.min(state.segmentIndex, chunks.length - 1));
        const sourceText = sourceTextForChunk(chunk);
        const translationText = translationTextForChunk(chunk);
        renderReader($("kf-source-reader"), sourceText, "Alkutekstiä ei ole tallennettu");
        renderReader($("kf-target-reader"), translationText, "Käännössegmentti on tyhjä");
        $("kf-segment-title").textContent = chunkTitle(chunk, state.segmentIndex);
        $("kf-segment-position").textContent = "Segmentti " + (state.segmentIndex + 1) + " / " + chunks.length;
        $("kf-word-count").textContent = wordCount(translationText) + " sanaa käännöksessä";

        const sourceLanguage = state.project?.analysis?.source_language
            || state.project?.analysis?.bilingual_import?.source_language
            || "auto";
        const targetLanguage = state.translation?.target_language || "fi";
        const sourceLabel = languageLabel(sourceLanguage, "alkukieli");
        const targetLabel = languageLabel(
            targetLanguage,
            state.translation?.target_language_label || "kohdekieli"
        );
        $("kf-language-direction").textContent = sourceLabel + " → " + targetLabel;
        $("kf-source-label").textContent = sourceLabel;
        $("kf-target-label").textContent = targetLabel;
    }

    function suggestionCard(item, index) {
        const status = item.status || "open";
        const card = document.createElement("article");
        card.className = "kf-suggestion-card is-" + status;
        card.dataset.suggestionIndex = String(index);

        const heading = document.createElement("div");
        heading.className = "kf-suggestion-heading";
        const type = document.createElement("span");
        type.className = "kf-suggestion-type";
        type.textContent = String(item.type || "oikoluku");
        const stateChip = document.createElement("span");
        stateChip.className = "kf-suggestion-status";
        stateChip.textContent = statusLabel(status);
        heading.append(type, stateChip);

        const originalBlock = document.createElement("div");
        originalBlock.className = "kf-change-block";
        const originalLabel = document.createElement("span");
        originalLabel.textContent = "Nykyinen";
        const original = document.createElement("del");
        original.className = "kf-original";
        original.textContent = String(item.original || "");
        originalBlock.append(originalLabel, original);

        const replacementBlock = document.createElement("label");
        replacementBlock.className = "kf-change-block";
        const replacementLabel = document.createElement("span");
        replacementLabel.textContent = "Ehdotus";
        const replacement = document.createElement("textarea");
        replacement.className = "kf-replacement";
        replacement.rows = 2;
        replacement.value = String(item.edited_replacement ?? item.replacement ?? "");
        replacement.disabled = state.busy || status !== "open";
        replacement.setAttribute("aria-label", "Muokattava korjausehdotus " + (index + 1));
        replacement.addEventListener("input", () => {
            item.edited_replacement = replacement.value;
        });
        replacementBlock.append(replacementLabel, replacement);

        const reason = document.createElement("p");
        reason.className = "kf-reason";
        reason.textContent = item.stale_reason || item.reason || "Selvä kieli- tai ulkoasukorjaus.";

        const actions = document.createElement("div");
        actions.className = "kf-suggestion-actions";
        const reject = document.createElement("button");
        reject.className = "ti-button ti-button-secondary";
        reject.type = "button";
        reject.textContent = "Hylkää";
        reject.disabled = state.busy || status !== "open";
        reject.addEventListener("click", () => rejectSuggestion(index));
        const accept = document.createElement("button");
        accept.className = "ti-button ti-button-primary";
        accept.type = "button";
        accept.textContent = "Hyväksy";
        accept.disabled = state.busy || status !== "open";
        accept.addEventListener("click", () => applySuggestionIndexes([index]));
        actions.append(reject, accept);

        card.append(heading, originalBlock, replacementBlock, reason, actions);
        return card;
    }

    function renderSuggestions() {
        const review = currentReview();
        const suggestions = Array.isArray(review?.suggestions) ? review.suggestions : [];
        const counts = suggestions.reduce((result, item) => {
            const status = item.status || "open";
            result[status] = (result[status] || 0) + 1;
            return result;
        }, {});
        $("kf-open-count").textContent = String(counts.open || 0);
        $("kf-accepted-count").textContent = String(counts.accepted || 0);
        $("kf-rejected-count").textContent = String((counts.rejected || 0) + (counts.stale || 0));

        const warningBox = $("kf-warnings");
        const warnings = Array.isArray(review?.warnings) ? review.warnings.filter(Boolean) : [];
        warningBox.hidden = !warnings.length;
        warningBox.textContent = warnings.join(" ");

        const empty = $("kf-suggestion-empty");
        const emptyTitle = empty.querySelector("h3");
        const emptyText = empty.querySelector("p");
        empty.hidden = suggestions.length > 0;
        if (!review) {
            emptyTitle.textContent = "Tarkista valittu segmentti";
            emptyText.textContent = "Saat yksittäisen listan korjauksista, jotka voit hyväksyä tai hylätä.";
        } else if (!suggestions.length) {
            emptyTitle.textContent = "Ei korjausehdotuksia";
            emptyText.textContent = "Tarkistus ei löytänyt tästä segmentistä selvää kieli- tai ulkoasukorjausta.";
        }

        const list = $("kf-suggestion-list");
        list.replaceChildren();
        suggestions.forEach((item, index) => list.appendChild(suggestionCard(item, index)));
        updateActionStates();
    }

    function renderHeader() {
        $("kf-project-name").textContent = state.project
            ? (state.project.title || "Nimetön teos") + " · " + (state.project.author || "Tuntematon")
            : "Valitse teos ja valmis käännös.";
        $("kf-project-select").value = state.project?.id ? String(state.project.id) : "";
        $("kf-translation-select").value = state.translation?.id ? String(state.translation.id) : "";
    }

    function renderAll() {
        renderHeader();
        renderDocument();
        renderSuggestions();
    }

    function updateActionStates() {
        const chunks = translationChunks(state.translation);
        const review = currentReview();
        const openCount = (review?.suggestions || []).filter((item) => (item.status || "open") === "open").length;
        $("kf-project-select").disabled = state.busy;
        $("kf-translation-select").disabled = state.busy || !state.translations.length;
        $("kf-previous").disabled = state.busy || state.segmentIndex <= 0;
        $("kf-next").disabled = state.busy || state.segmentIndex >= chunks.length - 1;
        $("kf-run").disabled = state.busy || !currentChunk();
        $("kf-accept-all").disabled = state.busy || !openCount;
        $("kf-download-final").disabled = state.busy || !state.translation?.id || !chunks.length;
        $("kf-download-bilingual").disabled = state.busy || !state.translation?.id || !chunks.length;
        $("kf-download-bilingual-docx").disabled = state.busy || !state.translation?.id || !chunks.length;
    }

    function populateProjectSelect() {
        const select = $("kf-project-select");
        const previous = state.project?.id ? String(state.project.id) : select.value;
        select.replaceChildren();
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Valitse teos";
        select.appendChild(placeholder);
        state.projects.forEach((project) => {
            const option = document.createElement("option");
            option.value = String(project.id);
            option.textContent = project.title || "Nimetön teos";
            select.appendChild(option);
        });
        if (previous && state.projects.some((project) => String(project.id) === previous)) {
            select.value = previous;
        }
    }

    function populateTranslationSelect() {
        const select = $("kf-translation-select");
        const previous = state.translation?.id ? String(state.translation.id) : "";
        select.replaceChildren();
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = state.translations.length ? "Valitse käännös" : "Ei tallennettuja käännöksiä";
        select.appendChild(placeholder);
        state.translations.forEach((translation) => {
            const option = document.createElement("option");
            option.value = String(translation.id);
            const target = translation.target_language_label
                || languageLabel(translation.target_language, "kohdekieli");
            const style = String(translation.style_label || translation.style || "käännös");
            const status = {
                completed: "valmis",
                reviewed: "viimeistelty",
                running: "työn alla",
                failed: "epäonnistui",
            }[String(translation.status || "").toLowerCase()] || String(translation.status || "valmis");
            option.textContent = [target, style, status, "versio #" + translation.id].join(" · ");
            select.appendChild(option);
        });
        if (previous && state.translations.some((translation) => String(translation.id) === previous)) {
            select.value = previous;
        }
    }

    function rememberProject(project, notifyParent) {
        state.project = project || null;
        if (!project) return;
        localStorage.setItem(ACTIVE_PROJECT_KEY, String(project.id));
        localStorage.setItem("skriptlab_manuscript", JSON.stringify(project));
        if (notifyParent && window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: "skriptlab:project-selected",
                projectId: String(project.id),
                project,
            }, window.location.origin);
        }
    }

    function rememberTranslation(translation) {
        state.translation = translation || null;
        if (!translation?.id) return;
        const index = state.translations.findIndex((item) => String(item.id) === String(translation.id));
        if (index >= 0) state.translations[index] = translation;
        else state.translations.unshift(translation);
        if (state.project?.id) {
            localStorage.setItem(
                "skriptlab_translation_finishing_translation_" + state.project.id,
                String(translation.id)
            );
        }
    }

    async function refreshProjects() {
        const projects = await api("/projects?summary=true");
        state.projects = Array.isArray(projects) ? projects : [];
        populateProjectSelect();
    }

    async function loadTranslations(preferredId) {
        const requestRevision = ++state.translationLoadRevision;
        const projectId = String(state.project?.id || "");
        state.translations = [];
        state.translation = null;
        state.segmentIndex = 0;
        state.reviews = new Map();
        populateTranslationSelect();
        if (!projectId) {
            renderAll();
            return;
        }
        const items = await api("/projects/" + encodeURIComponent(projectId) + "/translations");
        if (
            requestRevision !== state.translationLoadRevision
            || String(state.project?.id || "") !== projectId
        ) return;
        state.translations = (Array.isArray(items) ? items : []).filter((item) => item?.id);
        const storedId = localStorage.getItem("skriptlab_translation_finishing_translation_" + projectId) || "";
        const wanted = String(preferredId || storedId || "");
        let selected = state.translations.find((item) => String(item.id) === wanted)
            || state.translations.find((item) => translationChunks(item).length)
            || state.translations[0]
            || null;
        if (selected && !translationChunks(selected).length) {
            selected = await api("/translations/" + encodeURIComponent(selected.id));
        }
        if (
            requestRevision !== state.translationLoadRevision
            || String(state.project?.id || "") !== projectId
        ) return;
        rememberTranslation(selected);
        populateTranslationSelect();
        renderAll();
    }

    async function loadProject(projectId, options) {
        const settings = options || {};
        const requestRevision = ++state.projectLoadRevision;
        if (!projectId) {
            state.translationLoadRevision += 1;
            state.project = null;
            state.translations = [];
            state.translation = null;
            state.segmentIndex = 0;
            state.reviews = new Map();
            populateTranslationSelect();
            renderAll();
            return;
        }
        setBusy(true, "Avataan käännösprojektia…");
        try {
            const project = await api("/projects/" + encodeURIComponent(projectId));
            if (requestRevision !== state.projectLoadRevision) return;
            rememberProject(project, Boolean(settings.notifyParent));
            state.segmentIndex = 0;
            state.reviews = new Map();
            await loadTranslations(settings.translationId);
            if (requestRevision !== state.projectLoadRevision) return;
            setStatus(state.translation ? "Valmis viimeistelyyn" : "Projektilla ei ole valmista käännöstä");
        } catch (error) {
            if (requestRevision !== state.projectLoadRevision) return;
            setStatus("Käännösprojektin avaaminen epäonnistui");
            toast(error.message);
        } finally {
            if (requestRevision === state.projectLoadRevision) setBusy(false);
        }
    }

    async function chooseTranslation(translationId) {
        const requestRevision = ++state.translationLoadRevision;
        if (!translationId) {
            state.translation = null;
            state.segmentIndex = 0;
            state.reviews = new Map();
            renderAll();
            return;
        }
        setBusy(true, "Avataan käännöstä…");
        try {
            let translation = state.translations.find((item) => String(item.id) === String(translationId));
            if (!translation || !translationChunks(translation).length) {
                translation = await api("/translations/" + encodeURIComponent(translationId));
            }
            if (requestRevision !== state.translationLoadRevision) return;
            rememberTranslation(translation);
            state.segmentIndex = 0;
            state.reviews = new Map();
            populateTranslationSelect();
            renderAll();
            setStatus("Valmis viimeistelyyn");
        } catch (error) {
            if (requestRevision !== state.translationLoadRevision) return;
            setStatus("Käännöksen avaaminen epäonnistui");
            toast(error.message);
        } finally {
            if (requestRevision === state.translationLoadRevision) setBusy(false);
        }
    }

    function moveSegment(direction) {
        const chunks = translationChunks(state.translation);
        const next = state.segmentIndex + direction;
        if (next < 0 || next >= chunks.length) return;
        state.segmentIndex = next;
        renderAll();
        $("kf-target-reader").focus({ preventScroll: true });
    }

    function setCanonicalChunkText(rawIndex, text) {
        const chunks = Array.isArray(state.translation?.chunk_details)
            ? state.translation.chunk_details
            : [];
        if (chunks[rawIndex]) chunks[rawIndex].translation = String(text || "");
    }

    async function runFinishingSuggestions() {
        const chunk = currentChunk();
        if (!state.translation?.id || !chunk) {
            toast("Valitse ensin tarkistettava käännössegmentti.");
            return;
        }
        const translationId = state.translation.id;
        const rawIndex = chunk._kfRawIndex;
        setBusy(true, "Etsitään kieli- ja ulkoasukorjauksia…");
        setStatus("Oikoluku tarkistaa segmenttiä");
        try {
            const result = await api(
                "/translations/" + encodeURIComponent(translationId) + "/finishing-suggestions",
                jsonOptions("POST", { chunk_index: rawIndex, model: null })
            );
            if (
                String(state.translation?.id || "") !== String(translationId)
                || currentChunk()?._kfRawIndex !== rawIndex
            ) throw new Error("Käännös vaihtui tarkistuksen aikana. Aja tarkistus uudelleen.");
            const canonical = String(result?.expected_translation ?? translationTextForChunk(chunk));
            setCanonicalChunkText(rawIndex, canonical);
            const suggestions = (Array.isArray(result?.suggestions) ? result.suggestions : []).map((item) => ({
                ...item,
                status: "open",
                edited_replacement: String(item.replacement ?? ""),
            }));
            state.reviews.set(rawIndex, {
                expectedTranslation: canonical,
                suggestions,
                warnings: Array.isArray(result?.warnings) ? result.warnings : [],
                generatedBy: String(result?.generated_by || ""),
            });
            renderAll();
            setStatus(suggestions.length
                ? (suggestions.length === 1
                    ? "1 korjausehdotus · hyväksy tai hylkää"
                    : suggestions.length + " korjausehdotusta · hyväksy tai hylkää")
                : "Segmentti tarkistettu · ei korjausehdotuksia");
            if (!suggestions.length) toast("Segmentistä ei löytynyt selvää korjattavaa.");
        } catch (error) {
            setStatus("Viimeistelytarkistus epäonnistui");
            toast(error.message);
        } finally {
            setBusy(false);
        }
    }

    function validateOpenSuggestions(review, text) {
        (review?.suggestions || []).forEach((item) => {
            if ((item.status || "open") !== "open") return;
            const validation = findSuggestionRange(text, item);
            if (validation.error) {
                item.status = "stale";
                item.stale_reason = validation.error;
            }
        });
    }

    async function applySuggestionIndexes(indexes) {
        const chunk = currentChunk();
        const review = currentReview();
        if (!state.translation?.id || !chunk || !review) return;
        const translationId = state.translation.id;
        const rawIndex = chunk._kfRawIndex;
        const expectedTranslation = translationTextForChunk(chunk);
        let nextTranslation = expectedTranslation;
        const applied = [];

        indexes.forEach((index) => {
            const item = review.suggestions[index];
            if (!item || (item.status || "open") !== "open") return;
            const replacement = String(item.edited_replacement ?? item.replacement ?? "");
            const result = replaceSuggestionRange(nextTranslation, item, replacement);
            if (result.error) {
                item.status = "stale";
                item.stale_reason = result.error;
                return;
            }
            nextTranslation = result.text;
            applied.push(index);
        });

        if (!applied.length) {
            renderSuggestions();
            toast("Yhtään ehdotusta ei voitu kohdistaa turvallisesti nykyiseen tekstiin.");
            return;
        }

        setBusy(true, applied.length > 1 ? "Tallennetaan hyväksyttyjä korjauksia…" : "Tallennetaan hyväksytty korjaus…");
        setStatus("Tallennetaan hyväksyntää");
        try {
            const saved = await api(
                "/translations/" + encodeURIComponent(translationId) + "/chunks/" + rawIndex,
                jsonOptions("PATCH", {
                    translation: nextTranslation,
                    expected_translation: expectedTranslation,
                })
            );
            if (String(state.translation?.id || "") !== String(translationId)) {
                throw new Error("Käännös vaihtui tallennuksen aikana.");
            }
            rememberTranslation(saved);
            const savedRawChunk = saved?.chunk_details?.[rawIndex];
            const canonical = translationTextForChunk(savedRawChunk);
            applied.forEach((index) => {
                review.suggestions[index].status = "accepted";
                review.suggestions[index].stale_reason = "";
            });
            review.expectedTranslation = canonical;
            validateOpenSuggestions(review, canonical);
            state.reviews.set(rawIndex, review);
            populateTranslationSelect();
            renderAll();
            setStatus(applied.length === 1
                ? "1 korjaus hyväksytty ja tallennettu"
                : applied.length + " korjausta hyväksytty ja tallennettu");
            toast(applied.length === 1
                ? "Korjaus hyväksyttiin."
                : applied.length + " korjausta hyväksyttiin.");
        } catch (error) {
            setStatus("Korjausten tallennus epäonnistui");
            toast(error.message);
        } finally {
            setBusy(false);
        }
    }

    function rejectSuggestion(index) {
        const review = currentReview();
        const item = review?.suggestions?.[index];
        if (!item || (item.status || "open") !== "open") return;
        item.status = "rejected";
        renderSuggestions();
        setStatus("Ehdotus hylätty · käännös säilyi ennallaan");
        toast("Ehdotus hylättiin. Tekstiä ei muutettu.");
    }

    function contentDispositionFilename(header, fallback) {
        const value = String(header || "");
        const encoded = value.match(/filename\*=UTF-8''([^;]+)/i);
        if (encoded) {
            try {
                return decodeURIComponent(encoded[1].replace(/["']/g, ""));
            } catch (error) {
                return fallback;
            }
        }
        const plain = value.match(/filename="?([^";]+)"?/i);
        return plain?.[1] || fallback;
    }

    async function downloadFinishingExport(format) {
        if (!state.translation?.id) return;
        const exportConfig = {
            final: {
                buttonId: "kf-download-final",
                fallback: "viimeistelty-kaannos.md",
                preparing: "Valmistellaan lopullista teosta",
                success: "Lopullinen teos ladattu",
            },
            bilingual: {
                buttonId: "kf-download-bilingual",
                fallback: "viimeistelty-bilingual.md",
                preparing: "Valmistellaan bilingual-teosta",
                success: "Bilingual-teos ladattu",
            },
            "bilingual-docx": {
                buttonId: "kf-download-bilingual-docx",
                fallback: "viimeistelty-bilingual-rinnakkain.docx",
                preparing: "Valmistellaan kaksipalstaista bilingual-teosta",
                success: "Kaksipalstainen bilingual-teos ladattu",
            },
        }[format];
        if (!exportConfig) return;
        const button = $(exportConfig.buttonId);
        button.disabled = true;
        setStatus(exportConfig.preparing);
        try {
            const query = new URLSearchParams({ format });
            const response = await authorizedFetch(
                "/translations/" + encodeURIComponent(state.translation.id) + "/finishing-export?" + query
            );
            if (!response.ok) {
                let detail = "";
                try {
                    const body = await response.json();
                    detail = apiErrorDetail(body.detail || body.message || "");
                } catch (error) {
                    detail = "";
                }
                throw new Error(detail || "Teoksen lataus epäonnistui.");
            }
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = contentDispositionFilename(
                response.headers.get("Content-Disposition"),
                exportConfig.fallback
            );
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            setStatus(exportConfig.success);
        } catch (error) {
            setStatus("Teoksen lataus epäonnistui");
            toast(error.message);
        } finally {
            updateActionStates();
        }
    }

    function syncScroll(source, target) {
        if (state.scrollSyncing) return;
        const sourceMax = source.scrollHeight - source.clientHeight;
        const targetMax = target.scrollHeight - target.clientHeight;
        if (sourceMax <= 0 || targetMax <= 0) return;
        state.scrollSyncing = true;
        target.scrollTop = (source.scrollTop / sourceMax) * targetMax;
        window.requestAnimationFrame(() => {
            state.scrollSyncing = false;
        });
    }

    function bindEvents() {
        $("kf-project-select").addEventListener("change", (event) => {
            loadProject(event.target.value, { notifyParent: true });
        });
        $("kf-translation-select").addEventListener("change", (event) => {
            chooseTranslation(event.target.value);
        });
        $("kf-previous").addEventListener("click", () => moveSegment(-1));
        $("kf-next").addEventListener("click", () => moveSegment(1));
        $("kf-run").addEventListener("click", runFinishingSuggestions);
        $("kf-accept-all").addEventListener("click", () => {
            const review = currentReview();
            const indexes = (review?.suggestions || [])
                .map((item, index) => ((item.status || "open") === "open" ? index : -1))
                .filter((index) => index >= 0);
            applySuggestionIndexes(indexes);
        });
        $("kf-download-final").addEventListener("click", () => downloadFinishingExport("final"));
        $("kf-download-bilingual").addEventListener("click", () => downloadFinishingExport("bilingual"));
        $("kf-download-bilingual-docx").addEventListener("click", () => downloadFinishingExport("bilingual-docx"));
        $("kf-source-reader").addEventListener("scroll", () => {
            syncScroll($("kf-source-reader"), $("kf-target-reader"));
        });
        $("kf-target-reader").addEventListener("scroll", () => {
            syncScroll($("kf-target-reader"), $("kf-source-reader"));
        });
        window.addEventListener("message", (event) => {
            if (event.origin !== window.location.origin) return;
            if (event.data?.type !== "skriptlab:translation-finishing-opened") return;
            const projectId = String(event.data.projectId || "");
            if (!projectId) loadProject("", { notifyParent: false });
            else loadProject(projectId, {
                notifyParent: false,
                translationId: state.translation?.id || null,
            });
        });
    }

    async function initialize() {
        bindEvents();
        renderAll();
        setBusy(true, "Ladataan viimeistelytyötilaa…");
        try {
            await refreshProjects();
            const params = new URLSearchParams(window.location.search);
            const standaloneProjectId = window.parent === window
                ? localStorage.getItem(ACTIVE_PROJECT_KEY)
                : "";
            const projectId = params.get("project") || standaloneProjectId || "";
            if (projectId) await loadProject(projectId, { notifyParent: false });
            else renderAll();
            setStatus(state.translation ? "Valmis viimeistelyyn" : "Valitse teos ja käännös");
        } catch (error) {
            setStatus("Viimeistelytyötilan lataus epäonnistui");
            toast(error.message);
        } finally {
            setBusy(false);
        }
    }

    window.SkriptLabTranslationFinishingTestHooks = {
        paragraphModel,
        findSuggestionRange,
        replaceSuggestionRange,
        translationChunks,
        contentDispositionFilename,
    };

    initialize();
})();
