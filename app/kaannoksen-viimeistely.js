(function () {
    "use strict";

    const rootConfig = window.SKRIPTLAB_CONFIG || {};
    const API_BASE = String(rootConfig.API_BASE_URL || "").replace(/\/$/, "") + "/api";
    const ACTIVE_PROJECT_KEY = "skriptlab_active_project_id";
    const MODE_KEY = "skriptlab_text_translation_finishing_mode";
    const CHAPTER_KEY_PREFIX = "skriptlab_text_finishing_chapter_";
    const REVIEW_PART_MAX_CHARACTERS = 12000;
    const $ = (id) => document.getElementById(id);

    const state = {
        mode: localStorage.getItem(MODE_KEY) === "translation" ? "translation" : "text",
        projects: [],
        project: null,
        chapterIndex: 0,
        translations: [],
        translation: null,
        segmentIndex: 0,
        textSelection: null,
        translationSelection: null,
        textReviews: new Map(),
        translationReviews: new Map(),
        unitRun: null,
        unitRunRevision: 0,
        busy: false,
        projectLoadRevision: 0,
        translationLoadRevision: 0,
        scrollSyncing: false,
        textScrollContextKey: null,
        translationScrollContextKey: null,
        translationScrollRatio: 0,
    };

    let toastTimer = null;

    function authToken() {
        return localStorage.getItem("skriptlab_auth_token") || "";
    }

    if (!authToken()) {
        window.top.location.replace("login.html");
        return;
    }

    const modelSettings = window.SkriptLabTextModelSettings
        ? window.SkriptLabTextModelSettings.mount({
            triggerId: "kf-model-settings",
            defaultKind: "demanding",
            description: "Valitse seuraavissa viimeistely- ja oikolukupyynnöissä käytettävä kielimalli.",
        })
        : {
            getModel: () => null,
            labelFor: (value) => String(value || ""),
            load: async () => false,
        };

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
                throw new Error("Pyyntö kesti liian kauan. Tekstiä ei muutettu.");
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

    function selectionText(paragraphs, selection) {
        if (!selection || !Array.isArray(paragraphs) || !paragraphs.length) return "";
        const startParagraph = Math.max(0, Math.min(selection.startParagraph, paragraphs.length - 1));
        const endParagraph = Math.max(startParagraph, Math.min(selection.endParagraph, paragraphs.length - 1));
        const parts = [];
        for (let index = startParagraph; index <= endParagraph; index += 1) {
            const paragraph = String(paragraphs[index] || "").replace(/\r\n?/g, "\n");
            const start = index === startParagraph ? Math.max(0, selection.startOffset) : 0;
            const end = index === endParagraph
                ? Math.max(start, Math.min(selection.endOffset, paragraph.length))
                : paragraph.length;
            parts.push(paragraph.slice(start, end));
        }
        return parts.join("\n\n");
    }

    function selectionForWholeParagraph(paragraphs, index) {
        const safeIndex = Math.max(0, Math.min(Number(index) || 0, paragraphs.length - 1));
        const text = String(paragraphs[safeIndex] || "").replace(/\r\n?/g, "\n");
        return {
            startParagraph: safeIndex,
            endParagraph: safeIndex,
            startOffset: 0,
            endOffset: text.length,
            text,
        };
    }

    function normalizedUnitCursor(paragraphs, cursor) {
        const values = Array.isArray(paragraphs)
            ? paragraphs.map((value) => String(value || "").replace(/\r\n?/g, "\n"))
            : [];
        let paragraph = Math.max(0, Number(cursor?.paragraph) || 0);
        let offset = Math.max(0, Number(cursor?.offset) || 0);
        while (paragraph < values.length) {
            offset = Math.min(offset, values[paragraph].length);
            if (values[paragraph].slice(offset).trim()) return { paragraph, offset };
            paragraph += 1;
            offset = 0;
        }
        return null;
    }

    function safeParagraphCut(text, startOffset, maxCharacters) {
        const value = String(text || "").replace(/\r\n?/g, "\n");
        const start = Math.max(0, Math.min(Number(startOffset) || 0, value.length));
        const limit = Math.max(1, Number(maxCharacters) || 1);
        if (value.length - start <= limit) return value.length;
        const candidate = value.slice(start, start + limit);
        const minimumUsefulCut = Math.floor(limit * 0.7);
        let match;
        let usefulCut = 0;
        const sentenceBoundary = /[.!?…]["'”’»)]*(?:\s+|$)/g;
        while ((match = sentenceBoundary.exec(candidate))) {
            const matchEnd = match.index + match[0].length;
            if (matchEnd >= minimumUsefulCut) usefulCut = matchEnd;
        }
        if (!usefulCut) {
            const whitespace = /\s+/g;
            while ((match = whitespace.exec(candidate))) {
                const matchEnd = match.index + match[0].length;
                if (matchEnd >= minimumUsefulCut) usefulCut = matchEnd;
            }
        }
        let cut = start + (usefulCut || limit);
        const previousCode = value.charCodeAt(cut - 1);
        const nextCode = value.charCodeAt(cut);
        if (
            previousCode >= 0xD800 && previousCode <= 0xDBFF
            && nextCode >= 0xDC00 && nextCode <= 0xDFFF
        ) cut -= 1;
        if (cut <= start) {
            const firstCodePoint = value.codePointAt(start);
            return start + (firstCodePoint > 0xFFFF ? 2 : 1);
        }
        return cut;
    }

    function unitPartSelection(paragraphs, cursor, maxCharacters) {
        const values = Array.isArray(paragraphs)
            ? paragraphs.map((value) => String(value || "").replace(/\r\n?/g, "\n"))
            : [];
        const limit = Math.max(1, Number(maxCharacters) || REVIEW_PART_MAX_CHARACTERS);
        const start = normalizedUnitCursor(values, cursor);
        if (!start) return null;

        const firstText = values[start.paragraph];
        const firstRemaining = firstText.length - start.offset;
        let endParagraph = start.paragraph;
        let endOffset = firstText.length;
        let used = firstRemaining;
        if (firstRemaining > limit) {
            endOffset = safeParagraphCut(firstText, start.offset, limit);
        } else {
            while (endParagraph + 1 < values.length) {
                const nextText = values[endParagraph + 1];
                const nextLength = 2 + nextText.length;
                if (used + nextLength > limit) break;
                used += nextLength;
                endParagraph += 1;
                endOffset = nextText.length;
            }
        }
        const selection = {
            startParagraph: start.paragraph,
            endParagraph,
            startOffset: start.offset,
            endOffset,
        };
        selection.text = selectionText(values, selection);
        return selection.text.trim() ? selection : null;
    }

    function cursorAfterSelection(paragraphs, selection) {
        const values = Array.isArray(paragraphs)
            ? paragraphs.map((value) => String(value || "").replace(/\r\n?/g, "\n"))
            : [];
        if (!selection || !values.length) return null;
        const endParagraph = Math.max(0, Math.min(selection.endParagraph, values.length - 1));
        const endOffset = Math.max(0, Math.min(selection.endOffset, values[endParagraph].length));
        return normalizedUnitCursor(values, endOffset < values[endParagraph].length
            ? { paragraph: endParagraph, offset: endOffset }
            : { paragraph: endParagraph + 1, offset: 0 });
    }

    function countUnitParts(paragraphs, maxCharacters, startCursor) {
        let count = 0;
        let cursor = normalizedUnitCursor(paragraphs, startCursor || { paragraph: 0, offset: 0 });
        const safetyLimit = Math.max(1, (Array.isArray(paragraphs) ? paragraphs.length : 0) * 2 + 10000);
        while (cursor && count < safetyLimit) {
            const selection = unitPartSelection(paragraphs, cursor, maxCharacters);
            if (!selection) break;
            count += 1;
            cursor = cursorAfterSelection(paragraphs, selection);
        }
        return count;
    }

    function cloneSelection(selection) {
        return selection ? {
            startParagraph: selection.startParagraph,
            endParagraph: selection.endParagraph,
            startOffset: selection.startOffset,
            endOffset: selection.endOffset,
            text: String(selection.text || ""),
        } : null;
    }

    function exactSelectionBounds(paragraphs, selection) {
        const values = Array.isArray(paragraphs)
            ? paragraphs.map((value) => String(value || "").replace(/\r\n?/g, "\n"))
            : [];
        const startParagraph = Number(selection?.startParagraph);
        const endParagraph = Number(selection?.endParagraph);
        const startOffset = Number(selection?.startOffset);
        const endOffset = Number(selection?.endOffset);
        if (
            !values.length
            || !Number.isInteger(startParagraph)
            || !Number.isInteger(endParagraph)
            || !Number.isInteger(startOffset)
            || !Number.isInteger(endOffset)
            || startParagraph < 0
            || endParagraph < startParagraph
            || endParagraph >= values.length
            || startOffset < 0
            || startOffset > values[startParagraph].length
            || endOffset < 0
            || endOffset > values[endParagraph].length
            || (startParagraph === endParagraph && endOffset < startOffset)
        ) {
            return { error: "Valittu tekstialue ei enää vastaa nykyistä tekstiä." };
        }
        const normalizedSelection = {
            startParagraph,
            endParagraph,
            startOffset,
            endOffset,
        };
        normalizedSelection.text = selectionText(values, normalizedSelection);
        return { values, selection: normalizedSelection, text: normalizedSelection.text };
    }

    function manualFallbackSuggestion(selection) {
        const text = String(selection?.text || "");
        return {
            type: "oma muokkaus",
            paragraph_index: Number(selection?.startParagraph) || 0,
            original: text,
            replacement: text,
            edited_replacement: text,
            reason: "Automaattinen tarkistus ei löytänyt korjattavaa. Voit muokata valittua tekstiä itse.",
            manual_fallback: true,
            paragraph_count: Math.max(
                1,
                (Number(selection?.endParagraph) || 0) - (Number(selection?.startParagraph) || 0) + 1
            ),
            status: "open",
        };
    }

    function findSuggestionInParagraphs(paragraphs, suggestion, scope) {
        const values = Array.isArray(paragraphs)
            ? paragraphs.map((value) => String(value || "").replace(/\r\n?/g, "\n"))
            : [];
        const paragraphIndex = Number(suggestion?.paragraph_index);
        if (!Number.isInteger(paragraphIndex) || paragraphIndex < 0 || paragraphIndex >= values.length) {
            return { error: "Ehdotuksen kappaletta ei enää löytynyt." };
        }
        if (scope && (paragraphIndex < scope.startParagraph || paragraphIndex > scope.endParagraph)) {
            return { error: "Ehdotus ei enää kuulu tarkistettuun tekstialueeseen." };
        }
        const original = String(suggestion?.original || "");
        if (!original) return { error: "Ehdotuksen alkuperäinen tekstikohta puuttuu." };
        const paragraph = values[paragraphIndex];
        const searchStart = scope && paragraphIndex === scope.startParagraph
            ? Math.max(0, Math.min(scope.startOffset, paragraph.length))
            : 0;
        const searchEnd = scope && paragraphIndex === scope.endParagraph
            ? Math.max(searchStart, Math.min(scope.endOffset, paragraph.length))
            : paragraph.length;
        const scopedText = paragraph.slice(searchStart, searchEnd);
        const localStart = scopedText.indexOf(original);
        if (localStart < 0) return { error: "Tekstikohta on muuttunut tarkistuksen jälkeen." };
        if (scopedText.indexOf(original, localStart + Math.max(1, original.length)) >= 0) {
            return {
                error: scope
                    ? "Sama tekstikohta esiintyy valitulla alueella useasti eikä korjausta voi kohdistaa varmasti."
                    : "Sama tekstikohta esiintyy kappaleessa useasti eikä korjausta voi kohdistaa varmasti.",
            };
        }
        const start = searchStart + localStart;
        return { paragraphIndex, start, end: start + original.length };
    }

    function findSuggestionRange(text, suggestion, scope) {
        const model = paragraphModel(text);
        if (suggestion?.manual_fallback) {
            const bounds = exactSelectionBounds(model.paragraphs, scope);
            if (bounds.error) return bounds;
            if (bounds.text !== String(suggestion.original || "")) {
                return { error: "Valittu tekstikohta on muuttunut tarkistuksen jälkeen." };
            }
            const start = absoluteOffsetForCursor(model, {
                paragraph: bounds.selection.startParagraph,
                offset: bounds.selection.startOffset,
            });
            const end = absoluteOffsetForCursor(model, {
                paragraph: bounds.selection.endParagraph,
                offset: bounds.selection.endOffset,
            });
            return {
                start,
                end,
                paragraphIndex: bounds.selection.startParagraph,
                paragraphStart: bounds.selection.startOffset,
                paragraphEnd: bounds.selection.endOffset,
            };
        }
        const localRange = findSuggestionInParagraphs(model.paragraphs, suggestion, scope);
        if (localRange.error) return localRange;
        let paragraphStart = 0;
        for (let index = 0; index < localRange.paragraphIndex; index += 1) {
            paragraphStart += model.paragraphs[index].length + model.separators[index].length;
        }
        return {
            start: paragraphStart + localRange.start,
            end: paragraphStart + localRange.end,
            paragraphIndex: localRange.paragraphIndex,
            paragraphStart: localRange.start,
            paragraphEnd: localRange.end,
        };
    }

    function replaceSuggestionRange(text, suggestion, replacement, scope) {
        const normalized = paragraphModel(text).text;
        const replacementText = suggestion?.manual_fallback
            ? String(replacement ?? "").replace(/\r\n?/g, "\n")
            : String(replacement ?? "");
        if (suggestion?.manual_fallback) {
            const replacementError = editableReplacementError(suggestion, replacementText);
            if (replacementError) return { text: normalized, error: replacementError };
        }
        const range = findSuggestionRange(normalized, suggestion, scope);
        if (range.error) return { text: normalized, error: range.error };
        return {
            text: normalized.slice(0, range.start) + replacementText + normalized.slice(range.end),
            range,
            delta: replacementText.length - (range.end - range.start),
        };
    }

    function paragraphBoundaryCount(value) {
        return Math.max(0, paragraphModel(value).paragraphs.length - 1);
    }

    function replacementParagraphBoundaryError(suggestion, replacement) {
        if (paragraphBoundaryCount(suggestion?.original) === paragraphBoundaryCount(replacement)) return "";
        return "Korjausehdotus ei voi lisätä tai poistaa kappalerajaa. Muokkaa ehdotusta niin, että kappalerajojen määrä vastaa nykyistä tekstikohtaa.";
    }

    function editableReplacementError(suggestion, replacement) {
        if (suggestion?.manual_fallback && !String(replacement || "").trim()) {
            return "Muokattava teksti ei voi olla tyhjä. Kirjoita teksti tai hylkää oma muokkaus.";
        }
        if (suggestion?.manual_fallback) {
            const expectedParagraphs = Math.max(1, Number(suggestion.paragraph_count) || 1);
            const replacementParagraphs = String(replacement ?? "")
                .replace(/\r\n?/g, "\n")
                .split("\n\n");
            if (replacementParagraphs.length === expectedParagraphs) return "";
            return "Korjausehdotus ei voi lisätä tai poistaa kappalerajaa. Muokkaa ehdotusta niin, että kappalerajojen määrä vastaa nykyistä tekstikohtaa.";
        }
        return replacementParagraphBoundaryError(suggestion, replacement);
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

    function clampUnitIndex(index, count) {
        const maximum = Math.max(0, (Number(count) || 0) - 1);
        return Math.max(0, Math.min(Number(index) || 0, maximum));
    }

    function currentChapter() {
        return state.project?.chapters?.[state.chapterIndex] || null;
    }

    function chapterParagraphs(chapter) {
        return (Array.isArray(chapter?.paragraphs) ? chapter.paragraphs : [])
            .map((paragraph) => String(paragraph || ""));
    }

    function chapterTitle(chapter, index) {
        return String(chapter?.toc_title || chapter?.title || "Luku " + (index + 1));
    }

    function currentChunk() {
        return translationChunks(state.translation)[state.segmentIndex] || null;
    }

    function currentReview() {
        if (state.mode === "text") {
            return currentChapter() ? state.textReviews.get(state.chapterIndex) || null : null;
        }
        const chunk = currentChunk();
        return chunk ? state.translationReviews.get(chunk._kfRawIndex) || null : null;
    }

    function currentSelection() {
        return state.mode === "translation" ? state.translationSelection : state.textSelection;
    }

    function currentUnitParagraphs() {
        return state.mode === "translation"
            ? paragraphModel(translationTextForChunk(currentChunk())).paragraphs
            : chapterParagraphs(currentChapter());
    }

    function setCurrentSelection(selection) {
        if (state.mode === "translation") state.translationSelection = selection;
        else state.textSelection = selection;
    }

    function currentUnitRun() {
        const run = state.unitRun;
        if (!run || run.mode !== state.mode) return null;
        if (run.mode === "text") {
            return String(run.projectId || "") === String(state.project?.id || "")
                && run.chapterIndex === state.chapterIndex
                ? run
                : null;
        }
        return String(run.translationId || "") === String(state.translation?.id || "")
            && run.rawChunkIndex === currentChunk()?._kfRawIndex
            ? run
            : null;
    }

    function cancelUnitRun() {
        state.unitRunRevision += 1;
        state.unitRun = null;
    }

    function paragraphSnapshotsMatch(left, right) {
        const first = Array.isArray(left) ? left.map((value) => String(value || "")) : [];
        const second = Array.isArray(right) ? right.map((value) => String(value || "")) : [];
        return first.length === second.length
            && first.every((paragraph, index) => paragraph === second[index]);
    }

    function openSuggestionCount(review) {
        return (review?.suggestions || []).filter((item) => (item.status || "open") === "open").length;
    }

    function hasOpenReview() {
        return openSuggestionCount(currentReview()) > 0;
    }

    function keepOpenReviewForDecision() {
        if (!hasOpenReview()) return false;
        toast("Hyväksy tai hylkää avoimet ehdotukset ennen tekstin, luvun, segmentin tai välilehden vaihtamista.");
        window.requestAnimationFrame(() => {
            document.querySelector(".kf-replacement:not(:disabled)")?.focus({ preventScroll: true });
        });
        return true;
    }

    function replaceTextSuggestion(paragraphs, suggestion, replacement, scope) {
        const nextParagraphs = paragraphs.map((paragraph) => String(paragraph || ""));
        if (suggestion?.manual_fallback) {
            const bounds = exactSelectionBounds(nextParagraphs, scope);
            if (bounds.error) return { paragraphs: nextParagraphs, error: bounds.error };
            if (bounds.text !== String(suggestion.original || "")) {
                return {
                    paragraphs: nextParagraphs,
                    error: "Valittu tekstikohta on muuttunut tarkistuksen jälkeen.",
                };
            }
            const replacementText = paragraphModel(replacement).text;
            const replacementError = editableReplacementError(suggestion, replacementText);
            if (replacementError) return { paragraphs: nextParagraphs, error: replacementError };
            const replacementParagraphs = replacementText.split("\n\n");
            const replacedParagraphCount = bounds.selection.endParagraph
                - bounds.selection.startParagraph + 1;
            if (replacementParagraphs.length !== replacedParagraphCount) {
                return {
                    paragraphs: nextParagraphs,
                    error: "Muokatun tekstin kappalerajat eivät vastaa valittua tekstialuetta.",
                };
            }

            const firstIndex = bounds.selection.startParagraph;
            const lastIndex = bounds.selection.endParagraph;
            const prefix = bounds.values[firstIndex].slice(0, bounds.selection.startOffset);
            const suffix = bounds.values[lastIndex].slice(bounds.selection.endOffset);
            const inserted = replacementParagraphs.slice();
            if (inserted.length === 1) {
                inserted[0] = prefix + inserted[0] + suffix;
            } else {
                inserted[0] = prefix + inserted[0];
                inserted[inserted.length - 1] += suffix;
            }
            nextParagraphs.splice(firstIndex, replacedParagraphCount, ...inserted);
            const nextSelection = {
                startParagraph: firstIndex,
                endParagraph: lastIndex,
                startOffset: bounds.selection.startOffset,
                endOffset: replacementParagraphs.length === 1
                    ? bounds.selection.startOffset + replacementParagraphs[0].length
                    : replacementParagraphs[replacementParagraphs.length - 1].length,
            };
            nextSelection.text = selectionText(nextParagraphs, nextSelection);
            return {
                paragraphs: nextParagraphs,
                range: {
                    paragraphIndex: firstIndex,
                    start: bounds.selection.startOffset,
                    end: bounds.selection.endOffset,
                    selection: nextSelection,
                },
                delta: replacementText.length - bounds.text.length,
            };
        }
        const range = findSuggestionInParagraphs(nextParagraphs, suggestion, scope);
        if (range.error) return { paragraphs: nextParagraphs, error: range.error };
        const paragraph = nextParagraphs[range.paragraphIndex].replace(/\r\n?/g, "\n");
        nextParagraphs[range.paragraphIndex] = paragraph.slice(0, range.start)
            + String(replacement ?? "")
            + paragraph.slice(range.end);
        return {
            paragraphs: nextParagraphs,
            range,
            delta: String(replacement ?? "").length - (range.end - range.start),
        };
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

    function appendHighlightedText(paragraph, text, start, end) {
        const safeStart = Math.max(0, Math.min(start, text.length));
        const safeEnd = Math.max(safeStart, Math.min(end, text.length));
        if (safeStart > 0) paragraph.appendChild(document.createTextNode(text.slice(0, safeStart)));
        if (safeEnd > safeStart) {
            const mark = document.createElement("mark");
            mark.textContent = text.slice(safeStart, safeEnd);
            paragraph.appendChild(mark);
        }
        if (safeEnd < text.length) paragraph.appendChild(document.createTextNode(text.slice(safeEnd)));
    }

    function readerScrollRatio(reader) {
        const maximum = Math.max(0, Number(reader?.scrollHeight || 0) - Number(reader?.clientHeight || 0));
        if (!maximum) return 0;
        return Math.max(0, Math.min(1, Number(reader?.scrollTop || 0) / maximum));
    }

    function applyReaderScrollRatio(reader, ratio) {
        if (!reader) return;
        const maximum = Math.max(0, Number(reader.scrollHeight || 0) - Number(reader.clientHeight || 0));
        reader.scrollTop = maximum * Math.max(0, Math.min(1, Number(ratio) || 0));
    }

    function restoreAlignedReaderScroll(sourceReader, targetReader, ratio) {
        const normalizedRatio = Math.max(0, Math.min(1, Number(ratio) || 0));
        state.translationScrollRatio = normalizedRatio;
        state.scrollSyncing = true;
        applyReaderScrollRatio(sourceReader, normalizedRatio);
        applyReaderScrollRatio(targetReader, normalizedRatio);
        window.requestAnimationFrame(() => {
            state.scrollSyncing = false;
        });
    }

    function resetReaderScrollContext(mode) {
        if (!mode || mode === "text") state.textScrollContextKey = null;
        if (!mode || mode === "translation") {
            state.translationScrollContextKey = null;
            state.translationScrollRatio = 0;
        }
    }

    function renderParagraphs(reader, paragraphs, selection, options) {
        const settings = options || {};
        const previousScroll = settings.keepScroll ? reader.scrollTop : 0;
        const firstReadableParagraph = Math.max(
            0,
            paragraphs.findIndex((value) => String(value || "").trim())
        );
        const keyboardParagraph = selection
            ? Math.max(0, Math.min(selection.startParagraph, paragraphs.length - 1))
            : firstReadableParagraph;
        reader.replaceChildren();
        paragraphs.forEach((value, index) => {
            const text = String(value || "").replace(/\r\n?/g, "\n");
            const element = document.createElement("p");
            element.dataset.lineNumber = String(index + 1);
            element.dataset.kfParagraph = String(index);
            const selected = selection
                && index >= selection.startParagraph
                && index <= selection.endParagraph;
            if (settings.selectable) {
                element.tabIndex = index === keyboardParagraph ? 0 : -1;
                element.setAttribute("role", "button");
                element.setAttribute("aria-pressed", String(Boolean(selected)));
                element.title = "Valitse kappale " + (index + 1) + " tarkistettavaksi. Nuolinäppäimet vaihtavat kappaletta.";
            }
            if (selected) {
                element.classList.add("is-selected");
                const start = index === selection.startParagraph ? selection.startOffset : 0;
                const end = index === selection.endParagraph ? selection.endOffset : text.length;
                appendHighlightedText(element, text, start, end);
            } else {
                element.textContent = text || " ";
            }
            reader.appendChild(element);
        });
        if (settings.keepScroll) reader.scrollTop = previousScroll;
        else reader.scrollTop = 0;
    }

    function renderReader(reader, text, emptyTitle, selection, options) {
        const previousScroll = options?.keepScroll ? reader.scrollTop : 0;
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
        renderParagraphs(reader, model.paragraphs, selection, Object.assign({}, options, { keepScroll: false }));
        if (options?.keepScroll) reader.scrollTop = previousScroll;
    }

    function renderTextDocument() {
        const chapters = Array.isArray(state.project?.chapters) ? state.project.chapters : [];
        state.chapterIndex = Math.max(0, Math.min(state.chapterIndex, Math.max(0, chapters.length - 1)));
        const chapter = currentChapter();
        const paragraphs = chapterParagraphs(chapter);
        const hasChapter = Boolean(chapter);
        const scrollContextKey = hasChapter
            ? String(state.project?.id || "") + ":" + state.chapterIndex
            : null;
        const keepScroll = Boolean(scrollContextKey && state.textScrollContextKey === scrollContextKey);
        $("kf-text-empty").hidden = hasChapter;
        $("kf-text-reader").inert = !hasChapter;
        $("kf-text-reader").tabIndex = hasChapter ? 0 : -1;
        if (!hasChapter) {
            $("kf-text-reader").replaceChildren();
            $("kf-text-reader").scrollTop = 0;
            state.textScrollContextKey = null;
            $("kf-segment-title").textContent = "Ei valittua teosta";
            $("kf-segment-position").textContent = "0 / 0";
            $("kf-text-word-count").textContent = "0 sanaa";
            return;
        }
        if (!paragraphs.some((paragraph) => paragraph.trim())) {
            renderReader($("kf-text-reader"), "", "Luku on tyhjä");
        } else {
            renderParagraphs($("kf-text-reader"), paragraphs, state.textSelection, {
                selectable: true,
                keepScroll,
            });
        }
        state.textScrollContextKey = scrollContextKey;
        $("kf-segment-title").textContent = chapterTitle(chapter, state.chapterIndex);
        $("kf-segment-position").textContent = "Luku " + (state.chapterIndex + 1) + " / " + chapters.length;
        $("kf-text-word-count").textContent = wordCount(paragraphs.join(" ")) + " sanaa";
    }

    function renderTranslationDocument() {
        const chunks = translationChunks(state.translation);
        const previousSegmentIndex = state.segmentIndex;
        state.segmentIndex = clampUnitIndex(state.segmentIndex, chunks.length);
        if (state.segmentIndex !== previousSegmentIndex) {
            state.translationSelection = null;
            cancelUnitRun();
            resetReaderScrollContext("translation");
        }
        const chunk = chunks[state.segmentIndex] || null;
        const hasTranslation = Boolean(chunk);
        const sourceReader = $("kf-source-reader");
        const targetReader = $("kf-target-reader");
        $("kf-translation-empty").hidden = hasTranslation;
        [$("kf-source-reader"), $("kf-target-reader")].forEach((reader) => {
            reader.inert = !hasTranslation;
            reader.tabIndex = hasTranslation ? 0 : -1;
        });
        if (!hasTranslation) {
            sourceReader.replaceChildren();
            targetReader.replaceChildren();
            sourceReader.scrollTop = 0;
            targetReader.scrollTop = 0;
            resetReaderScrollContext("translation");
            $("kf-segment-title").textContent = "Ei valittua käännöstä";
            $("kf-segment-position").textContent = "0 / 0";
            $("kf-word-count").textContent = "0 sanaa";
            return;
        }

        const scrollContextKey = String(state.translation?.id || "") + ":" + chunk._kfRawIndex;
        const keepScroll = state.translationScrollContextKey === scrollContextKey;
        const scrollRatio = keepScroll ? state.translationScrollRatio : 0;
        const sourceText = sourceTextForChunk(chunk);
        const translationText = translationTextForChunk(chunk);
        renderReader(sourceReader, sourceText, "Alkutekstiä ei ole tallennettu");
        renderReader(
            targetReader,
            translationText,
            "Käännössegmentti on tyhjä",
            state.translationSelection,
            { selectable: true }
        );
        state.translationScrollContextKey = scrollContextKey;
        restoreAlignedReaderScroll(sourceReader, targetReader, scrollRatio);
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
        const isManualFallback = Boolean(item.manual_fallback);
        const card = document.createElement("article");
        card.className = "kf-suggestion-card is-" + status
            + (isManualFallback ? " is-manual-fallback" : "");
        card.dataset.suggestionIndex = String(index);

        const heading = document.createElement("div");
        heading.className = "kf-suggestion-heading";
        const type = document.createElement("span");
        type.className = "kf-suggestion-type";
        type.textContent = String(item.type || (isManualFallback ? "oma muokkaus" : "oikoluku"));
        const stateChip = document.createElement("span");
        stateChip.className = "kf-suggestion-status";
        stateChip.textContent = statusLabel(status);
        heading.append(type, stateChip);

        const originalBlock = document.createElement("div");
        originalBlock.className = "kf-change-block";
        const originalLabel = document.createElement("span");
        originalLabel.textContent = isManualFallback ? "Valittu teksti" : "Nykyinen";
        const original = document.createElement(isManualFallback ? "div" : "del");
        original.className = "kf-original";
        original.textContent = String(item.original || "");
        originalBlock.append(originalLabel, original);

        const replacementBlock = document.createElement("label");
        replacementBlock.className = "kf-change-block";
        const replacementLabel = document.createElement("span");
        replacementLabel.textContent = isManualFallback ? "Muokkaa tekstiä" : "Ehdotus";
        const replacement = document.createElement("textarea");
        replacement.className = "kf-replacement";
        replacement.rows = isManualFallback ? 7 : 2;
        replacement.value = String(item.edited_replacement ?? item.replacement ?? "");
        replacement.disabled = state.busy || status !== "open";
        replacement.setAttribute(
            "aria-label",
            isManualFallback
                ? "Muokattava valittu teksti"
                : "Muokattava korjausehdotus " + (index + 1)
        );
        replacement.addEventListener("input", () => {
            item.edited_replacement = replacement.value;
            item.replacement_error = "";
            reason.classList.remove("is-error");
            reason.textContent = item.stale_reason || item.reason || "Selvä kieli- tai ulkoasukorjaus.";
        });
        replacementBlock.append(replacementLabel, replacement);

        const reason = document.createElement("p");
        reason.className = "kf-reason" + (item.replacement_error ? " is-error" : "");
        reason.textContent = item.replacement_error
            || item.stale_reason
            || item.reason
            || "Selvä kieli- tai ulkoasukorjaus.";

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
        const isTranslation = state.mode === "translation";
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

        const usedModel = $("kf-used-model");
        if (usedModel) {
            const generatedBy = String(review?.generatedBy || "").trim();
            usedModel.hidden = !generatedBy;
            usedModel.textContent = generatedBy
                ? "Käytetty malli: " + modelSettings.labelFor(generatedBy)
                : "";
        }

        const warningBox = $("kf-warnings");
        const warnings = Array.isArray(review?.warnings) ? review.warnings.filter(Boolean) : [];
        warningBox.hidden = !warnings.length;
        warningBox.textContent = warnings.join(" ");

        const empty = $("kf-suggestion-empty");
        const emptyTitle = empty.querySelector("h3");
        const emptyText = empty.querySelector("p");
        empty.hidden = suggestions.length > 0;
        if (!review) {
            emptyTitle.textContent = "Valitse ensin tarkistettava kohta";
            emptyText.textContent = "Saat yksittäisen listan korjauksista, jotka voit hyväksyä tai hylätä.";
        } else if (!suggestions.length) {
            emptyTitle.textContent = "Ei korjausehdotuksia";
            const run = review.unitRun ? currentUnitRun() : null;
            emptyText.textContent = !review.unitRun
                ? "Tarkistus ei löytänyt valitusta kohdasta selvää kieli- tai ulkoasukorjausta."
                : run?.status === "complete"
                    ? "Tarkistus ei löytänyt tästä osasta selvää kieli- tai ulkoasukorjausta. Koko tarkistus on valmis."
                    : "Tarkistus ei löytänyt tästä osasta selvää kieli- tai ulkoasukorjausta. Voit jatkaa seuraavaan osaan.";
        }

        const list = $("kf-suggestion-list");
        list.replaceChildren();
        suggestions.forEach((item, index) => list.appendChild(suggestionCard(item, index)));
        updateActionStates();
    }

    function keyboardSelectionParagraph() {
        const selection = currentSelection();
        const paragraphs = currentUnitParagraphs();
        if (!selection || !paragraphs.length) return null;
        const paragraphIndex = Math.max(0, Math.min(selection.startParagraph, paragraphs.length - 1));
        return {
            mode: state.mode,
            paragraphIndex,
            text: String(paragraphs[paragraphIndex] || "").replace(/\r\n?/g, "\n"),
            selection,
        };
    }

    function keyboardSelectionLength() {
        const textarea = $("kf-keyboard-selection-text");
        if (textarea.disabled) return 0;
        return Math.max(0, textarea.selectionEnd - textarea.selectionStart);
    }

    function updateKeyboardSelectionStatus() {
        const textarea = $("kf-keyboard-selection-text");
        const button = $("kf-use-keyboard-selection");
        const status = $("kf-keyboard-selection-status");
        const length = keyboardSelectionLength();
        button.disabled = state.busy
            || hasOpenReview()
            || textarea.disabled
            || length < 1
            || length > REVIEW_PART_MAX_CHARACTERS;
        if (textarea.disabled) {
            status.textContent = "Valitse ensin kappale tekstistä.";
        } else if (!length) {
            status.textContent = "Ei tarkkaa valintaa. Valitse sana tai virke Vaihto + nuolinäppäimillä.";
        } else if (length > REVIEW_PART_MAX_CHARACTERS) {
            status.textContent = "Valinta on " + length + " merkkiä. Enimmäispituus on 12 000 merkkiä.";
        } else {
            const chosen = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
            status.textContent = wordCount(chosen) + " sanaa ja " + length + " merkkiä valmiina tarkistukseen.";
        }
    }

    function renderSelectionTools() {
        const selection = currentSelection();
        const paragraphs = currentUnitParagraphs();
        const selectedText = selection ? selectionText(paragraphs, selection) : "";
        if (selection) selection.text = selectedText;
        $("kf-selection-help").textContent = selectedText.trim()
            ? wordCount(selectedText) + " sanaa ja " + selectedText.length + " merkkiä valittuna."
            : "Valitse tekstistä sana, virke tai kappale.";

        const textarea = $("kf-keyboard-selection-text");
        const active = keyboardSelectionParagraph();
        if (!active || !active.text) {
            textarea.value = "";
            textarea.disabled = true;
            delete textarea.dataset.kfMode;
            delete textarea.dataset.kfParagraph;
            updateKeyboardSelectionStatus();
            return;
        }
        textarea.disabled = false;
        textarea.value = active.text;
        textarea.dataset.kfMode = active.mode;
        textarea.dataset.kfParagraph = String(active.paragraphIndex);
        const exactSingleParagraph = active.selection.startParagraph === active.paragraphIndex
            && active.selection.endParagraph === active.paragraphIndex;
        const start = exactSingleParagraph ? active.selection.startOffset : 0;
        const end = exactSingleParagraph ? active.selection.endOffset : active.text.length;
        textarea.setSelectionRange(
            Math.max(0, Math.min(start, active.text.length)),
            Math.max(0, Math.min(end, active.text.length))
        );
        updateKeyboardSelectionStatus();
    }

    function unitHasText() {
        return currentUnitParagraphs().some((paragraph) => String(paragraph || "").trim());
    }

    function updateUnitProgressBar(run) {
        const progressbar = $("kf-unit-progressbar");
        const fill = progressbar.querySelector("span");
        const maximum = Math.max(1, Number(run?.totalParts) || 1);
        const completed = run?.status === "complete"
            ? maximum
            : Math.max(0, Math.min(maximum, (Number(run?.partNumber) || 1) - 1));
        progressbar.setAttribute("aria-valuemax", String(maximum));
        progressbar.setAttribute("aria-valuenow", String(completed));
        progressbar.setAttribute("aria-valuetext", run
            ? (run.status === "complete"
                ? (run.mode === "translation" ? "Segmentti käsitelty" : "Luku käsitelty")
                : completed + " / " + maximum + " osaa käsitelty")
            : "Ei aloitettu");
        fill.style.width = ((completed / maximum) * 100) + "%";
    }

    function renderUnitControls() {
        const isTranslation = state.mode === "translation";
        const controls = $("kf-unit-controls");
        const button = $("kf-run-unit");
        const progress = $("kf-unit-progress");
        const title = $("kf-unit-controls-title");
        const available = Boolean(isTranslation ? currentChunk() : currentChapter());
        controls.hidden = !available;
        title.textContent = isTranslation ? "Koko segmentin tarkistus" : "Koko luvun tarkistus";
        $("kf-unit-progressbar").setAttribute(
            "aria-label",
            isTranslation ? "Koko segmentin tarkistuksen eteneminen" : "Koko luvun tarkistuksen eteneminen"
        );
        if (!available) {
            updateUnitProgressBar(null);
            return;
        }

        const unitName = isTranslation ? "segmentti" : "luku";
        const run = currentUnitRun();
        updateUnitProgressBar(run);
        if (!run) {
            if (!unitHasText()) {
                button.textContent = isTranslation ? "Segmentissä ei ole tekstiä" : "Luvussa ei ole tekstiä";
                progress.textContent = "Valittu " + unitName + " on tyhjä, joten sitä ei voi tarkistaa.";
                return;
            }
            button.textContent = isTranslation ? "Tarkista koko segmentti" : "Tarkista koko luku";
            progress.textContent = "Enintään 12 000 merkin " + unitName
                + " tarkistetaan kerralla. Pitkä " + unitName + " jaetaan kappalerajoilla osiin.";
            return;
        }
        if (run.status === "complete") {
            button.textContent = isTranslation ? "Tarkista segmentti uudelleen" : "Tarkista luku uudelleen";
            progress.textContent = run.totalParts === 1
                ? (isTranslation ? "Segmentti on käsitelty." : "Luku on käsitelty.")
                : "Kaikki " + run.totalParts + " osaa on käsitelty.";
            return;
        }
        if (run.status === "review") {
            button.textContent = "Ratkaise avoimet ehdotukset";
            progress.textContent = "Osa " + run.partNumber + " / " + run.totalParts
                + " odottaa kaikkien ehdotusten hyväksyntää tai hylkäystä.";
            return;
        }
        if (run.status === "requesting") {
            button.textContent = "Tarkistetaan osaa " + run.partNumber + " / " + run.totalParts;
            progress.textContent = "Osan " + run.partNumber + " / " + run.totalParts + " ehdotuksia valmistellaan.";
            return;
        }
        if (run.status === "retry") {
            button.textContent = "Yritä osaa " + run.partNumber + " uudelleen";
            progress.textContent = "Osan " + run.partNumber + " / " + run.totalParts
                + " tarkistus ei tuottanut luotettavaa vastausta. Sama osa odottaa uutta yritystä.";
            return;
        }
        button.textContent = run.partNumber === 1
            ? "Yritä osaa 1 uudelleen"
            : "Jatka osaan " + run.partNumber;
        progress.textContent = "Osa " + run.partNumber + " / " + run.totalParts + " on valmis tarkistettavaksi.";
    }

    function renderHeader() {
        $("kf-project-name").textContent = state.project
            ? (state.project.title || "Nimetön teos") + " · " + (state.project.author || "Tuntematon")
            : (state.mode === "translation" ? "Valitse teos ja valmis käännös." : "Valitse viimeisteltävä teos.");
        $("kf-text-project-select").value = state.project?.id ? String(state.project.id) : "";
        $("kf-project-select").value = state.project?.id ? String(state.project.id) : "";
        $("kf-translation-select").value = state.translation?.id ? String(state.translation.id) : "";
    }

    function renderMode() {
        const isTranslation = state.mode === "translation";
        $("kf-text-toolbar").hidden = isTranslation;
        $("kf-translation-toolbar").hidden = !isTranslation;
        $("kf-text-panel").hidden = isTranslation;
        $("kf-translation-panel").hidden = !isTranslation;
        $("kf-navigator").setAttribute("aria-label", isTranslation ? "Käännössegmenttien selaus" : "Lukujen selaus");
        document.querySelectorAll("[data-kf-mode]").forEach((button) => {
            const active = button.dataset.kfMode === state.mode;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-selected", String(active));
            button.tabIndex = active ? 0 : -1;
        });
        $("kf-review-title").textContent = isTranslation
            ? "Käännöksen kieli- ja ulkoasuehdotukset"
            : "Tekstin kieli- ja ulkoasuehdotukset";
        $("kf-review-description").textContent = isTranslation
            ? "Oikoluku etsii käännöksestä selvät kieli-, typografia- ja tekstin ulkoasun korjaukset. Teksti muuttuu vain hyväksynnällä."
            : "Oikoluku etsii käsikirjoituksesta selvät kieli-, typografia- ja tekstin ulkoasun korjaukset. Teksti muuttuu vain hyväksynnällä.";
        $("kf-run-label").textContent = "Tarkista valittu kohta";
        $("kf-review-footer-note").textContent = isTranslation
            ? "Hylätyt ja avoimet ehdotukset eivät päädy ladattavaan teokseen."
            : "Hylätyt ja avoimet ehdotukset eivät muuta käsikirjoitusta.";
        if (isTranslation) renderTranslationDocument();
        else renderTextDocument();
        renderSelectionTools();
        renderUnitControls();
        renderSuggestions();
    }

    function renderAll() {
        renderHeader();
        renderMode();
    }

    function updateActionStates() {
        const isTranslation = state.mode === "translation";
        const chunks = translationChunks(state.translation);
        const chapterCount = state.project?.chapters?.length || 0;
        const selection = currentSelection();
        const selectedText = selection ? selectionText(currentUnitParagraphs(), selection) : "";
        const validSelection = Boolean(selectedText.trim()) && selectedText.length <= REVIEW_PART_MAX_CHARACTERS;
        const review = currentReview();
        const openCount = openSuggestionCount(review);
        const reviewing = openCount > 0;
        const run = currentUnitRun();
        $("kf-text-project-select").disabled = state.busy || reviewing;
        $("kf-project-select").disabled = state.busy || reviewing;
        $("kf-translation-select").disabled = state.busy || reviewing || !state.translations.length;
        document.querySelectorAll("[data-kf-mode]").forEach((button) => {
            button.disabled = state.busy || reviewing;
        });
        $("kf-previous").disabled = state.busy || reviewing || (isTranslation ? state.segmentIndex <= 0 : state.chapterIndex <= 0);
        $("kf-next").disabled = state.busy || reviewing || (isTranslation
            ? state.segmentIndex >= chunks.length - 1
            : state.chapterIndex >= chapterCount - 1);
        $("kf-run").disabled = state.busy
            || reviewing
            || !validSelection
            || run?.status === "requesting"
            || run?.status === "review";
        $("kf-run-unit").disabled = state.busy
            || reviewing
            || !(isTranslation ? currentChunk() : currentChapter())
            || !unitHasText()
            || run?.status === "requesting"
            || run?.status === "review";
        $("kf-accept-all").disabled = state.busy || !openCount;
        $("kf-download-final").disabled = state.busy || !isTranslation || !state.translation?.id || !chunks.length;
        $("kf-download-bilingual").disabled = state.busy || !isTranslation || !state.translation?.id || !chunks.length;
        $("kf-download-bilingual-docx").disabled = state.busy || !isTranslation || !state.translation?.id || !chunks.length;
        updateKeyboardSelectionStatus();
    }

    function populateProjectSelect() {
        [$("kf-text-project-select"), $("kf-project-select")].forEach((select) => {
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
        });
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
        cancelUnitRun();
        resetReaderScrollContext("translation");
        state.translations = [];
        state.translation = null;
        state.segmentIndex = 0;
        state.translationSelection = null;
        state.translationReviews = new Map();
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
            cancelUnitRun();
            resetReaderScrollContext();
            state.translationLoadRevision += 1;
            state.project = null;
            state.chapterIndex = 0;
            state.textSelection = null;
            state.translations = [];
            state.translation = null;
            state.segmentIndex = 0;
            state.translationSelection = null;
            state.textReviews = new Map();
            state.translationReviews = new Map();
            populateTranslationSelect();
            renderAll();
            return;
        }
        setBusy(true, state.mode === "translation" ? "Avataan käännösprojektia…" : "Avataan käsikirjoitusta…");
        try {
            const project = await api("/projects/" + encodeURIComponent(projectId));
            if (requestRevision !== state.projectLoadRevision) return;
            rememberProject(project, Boolean(settings.notifyParent));
            const savedChapter = Number(localStorage.getItem(CHAPTER_KEY_PREFIX + projectId));
            state.chapterIndex = Number.isInteger(savedChapter)
                && savedChapter >= 0
                && savedChapter < (project?.chapters?.length || 0)
                ? savedChapter
                : 0;
            state.segmentIndex = 0;
            state.textSelection = null;
            state.translationSelection = null;
            cancelUnitRun();
            resetReaderScrollContext();
            state.textReviews = new Map();
            state.translationReviews = new Map();
            state.translationLoadRevision += 1;
            state.translations = [];
            state.translation = null;
            populateTranslationSelect();
            if (state.mode === "translation") await loadTranslations(settings.translationId);
            else renderAll();
            if (requestRevision !== state.projectLoadRevision) return;
            setStatus(state.mode === "translation"
                ? (state.translation ? "Valmis viimeistelyyn" : "Projektilla ei ole valmista käännöstä")
                : (currentChapter() ? "Valmis viimeistelyyn" : "Projektilla ei ole tarkistettavia lukuja"));
        } catch (error) {
            if (requestRevision !== state.projectLoadRevision) return;
            renderAll();
            setStatus(state.mode === "translation"
                ? "Käännösprojektin avaaminen epäonnistui"
                : "Käsikirjoituksen avaaminen epäonnistui");
            toast(error.message);
        } finally {
            if (requestRevision === state.projectLoadRevision) setBusy(false);
        }
    }

    async function chooseTranslation(translationId) {
        const requestRevision = ++state.translationLoadRevision;
        if (!translationId) {
            cancelUnitRun();
            resetReaderScrollContext("translation");
            state.translation = null;
            state.segmentIndex = 0;
            state.translationSelection = null;
            state.translationReviews = new Map();
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
            state.translationSelection = null;
            cancelUnitRun();
            resetReaderScrollContext("translation");
            state.translationReviews = new Map();
            populateTranslationSelect();
            renderAll();
            setStatus("Valmis viimeistelyyn");
        } catch (error) {
            if (requestRevision !== state.translationLoadRevision) return;
            renderAll();
            setStatus("Käännöksen avaaminen epäonnistui");
            toast(error.message);
        } finally {
            if (requestRevision === state.translationLoadRevision) setBusy(false);
        }
    }

    async function setMode(mode, focusTab) {
        const next = mode === "translation" ? "translation" : "text";
        if (next !== state.mode && keepOpenReviewForDecision()) return;
        if (next !== state.mode) cancelUnitRun();
        state.mode = next;
        localStorage.setItem(MODE_KEY, next);
        renderAll();
        if (next === "translation" && state.project && !state.translations.length) {
            const projectRevision = state.projectLoadRevision;
            setBusy(true, "Avataan käännöksiä…");
            try {
                await loadTranslations();
                if (projectRevision === state.projectLoadRevision) {
                    setStatus(state.translation ? "Valmis viimeistelyyn" : "Projektilla ei ole valmista käännöstä");
                }
            } catch (error) {
                if (projectRevision === state.projectLoadRevision) {
                    setStatus("Käännösten avaaminen epäonnistui");
                    toast(error.message);
                }
            } finally {
                if (projectRevision === state.projectLoadRevision) setBusy(false);
            }
        } else {
            setStatus(next === "translation"
                ? (state.translation ? "Valmis viimeistelyyn" : "Valitse teos ja käännös")
                : (currentChapter() ? "Valmis viimeistelyyn" : "Valitse teos"));
        }
        if (focusTab) $(next === "translation" ? "kf-tab-translation" : "kf-tab-text").focus();
    }

    function clearCurrentReview() {
        if (state.mode === "translation") {
            const chunk = currentChunk();
            if (chunk) state.translationReviews.delete(chunk._kfRawIndex);
        } else if (currentChapter()) {
            state.textReviews.delete(state.chapterIndex);
        }
    }

    function textOffsetInside(paragraph, node, offset) {
        const range = document.createRange();
        range.selectNodeContents(paragraph);
        try {
            range.setEnd(node, offset);
        } catch (error) {
            return 0;
        }
        return range.toString().length;
    }

    function paragraphElementForNode(node, reader) {
        const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
        const paragraph = element?.closest?.("[data-kf-paragraph]") || null;
        return paragraph && reader.contains(paragraph) ? paragraph : null;
    }

    function selectionFromReader(reader, paragraphs) {
        const browserSelection = window.getSelection();
        if (!browserSelection || !browserSelection.rangeCount || browserSelection.isCollapsed) return null;
        const range = browserSelection.getRangeAt(0);
        const startElement = paragraphElementForNode(range.startContainer, reader);
        const endElement = paragraphElementForNode(range.endContainer, reader);
        if (!startElement || !endElement) return null;
        const startParagraph = Number(startElement.dataset.kfParagraph);
        const endParagraph = Number(endElement.dataset.kfParagraph);
        if (!Number.isInteger(startParagraph) || !Number.isInteger(endParagraph)) return null;
        const normalized = {
            startParagraph,
            endParagraph,
            startOffset: textOffsetInside(startElement, range.startContainer, range.startOffset),
            endOffset: textOffsetInside(endElement, range.endContainer, range.endOffset),
        };
        normalized.text = selectionText(paragraphs, normalized);
        return normalized.text ? normalized : null;
    }

    function revealCurrentSelection(selection) {
        if (!selection) return;
        const reader = state.mode === "translation" ? $("kf-target-reader") : $("kf-text-reader");
        window.requestAnimationFrame(() => {
            reader.querySelector(`[data-kf-paragraph="${selection.startParagraph}"]`)
                ?.scrollIntoView({ block: "center", behavior: "auto" });
        });
    }

    function handleReaderSelection(mode, event) {
        if (mode !== state.mode || keepOpenReviewForDecision()) return;
        const reader = mode === "translation" ? $("kf-target-reader") : $("kf-text-reader");
        const paragraphs = currentUnitParagraphs();
        let nextSelection = selectionFromReader(reader, paragraphs);
        if (!nextSelection && event?.type === "pointerup") {
            const paragraph = event.target?.closest?.("[data-kf-paragraph]");
            if (paragraph && reader.contains(paragraph)) {
                nextSelection = selectionForWholeParagraph(paragraphs, Number(paragraph.dataset.kfParagraph));
            }
        }
        if (!nextSelection?.text) return;
        if (nextSelection.text.length > REVIEW_PART_MAX_CHARACTERS) {
            toast("Valitse enintään 12 000 merkkiä kerrallaan.");
            return;
        }
        cancelUnitRun();
        clearCurrentReview();
        setCurrentSelection(nextSelection);
        const scrollTop = reader.scrollTop;
        renderMode();
        reader.scrollTop = scrollTop;
        window.getSelection()?.removeAllRanges();
    }

    function handleReaderKeyboardSelection(mode, event) {
        if (!event || !["Enter", " ", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        if (mode !== state.mode || keepOpenReviewForDecision()) {
            event.preventDefault();
            return;
        }
        const reader = mode === "translation" ? $("kf-target-reader") : $("kf-text-reader");
        const paragraph = event.target?.closest?.("[data-kf-paragraph]") || null;
        if (paragraph && !reader.contains(paragraph)) return;
        if (!paragraph && event.target !== reader) return;
        event.preventDefault();
        const paragraphs = currentUnitParagraphs();
        if (!paragraphs.length) return;
        let nextIndex;
        if (!paragraph) {
            nextIndex = event.key === "End" || event.key === "ArrowUp"
                ? paragraphs.length - 1
                : 0;
        } else {
            const currentIndex = Number(paragraph.dataset.kfParagraph);
            nextIndex = currentIndex;
            if (event.key === "ArrowUp") nextIndex = Math.max(0, currentIndex - 1);
            if (event.key === "ArrowDown") nextIndex = Math.min(paragraphs.length - 1, currentIndex + 1);
            if (event.key === "Home") nextIndex = 0;
            if (event.key === "End") nextIndex = paragraphs.length - 1;
        }
        const selection = selectionForWholeParagraph(paragraphs, nextIndex);
        if (selection.text.length > REVIEW_PART_MAX_CHARACTERS) {
            selection.endOffset = safeParagraphCut(selection.text, 0, REVIEW_PART_MAX_CHARACTERS);
            selection.text = selectionText(paragraphs, selection);
            toast("Kappaleesta valittiin ensimmäiset 12 000 merkkiä.");
        }
        cancelUnitRun();
        clearCurrentReview();
        setCurrentSelection(selection);
        renderMode();
        reader.querySelector(`[data-kf-paragraph="${selection.startParagraph}"]`)?.focus();
    }

    function applyKeyboardSelection() {
        if (keepOpenReviewForDecision()) return;
        const textarea = $("kf-keyboard-selection-text");
        const mode = textarea.dataset.kfMode;
        const paragraphIndex = Number(textarea.dataset.kfParagraph);
        const startOffset = textarea.selectionStart;
        const endOffset = textarea.selectionEnd;
        if (mode !== state.mode || !Number.isInteger(paragraphIndex) || endOffset <= startOffset) {
            updateKeyboardSelectionStatus();
            toast("Valitse tekstikentästä ensin sana tai virke.");
            return;
        }
        const paragraphs = currentUnitParagraphs();
        const selection = {
            startParagraph: paragraphIndex,
            endParagraph: paragraphIndex,
            startOffset,
            endOffset,
        };
        selection.text = selectionText(paragraphs, selection);
        if (!selection.text || selection.text.length > REVIEW_PART_MAX_CHARACTERS) {
            updateKeyboardSelectionStatus();
            toast(selection.text
                ? "Valitse enintään 12 000 merkkiä kerrallaan."
                : "Valitse tekstikentästä ensin sana tai virke.");
            return;
        }
        cancelUnitRun();
        clearCurrentReview();
        setCurrentSelection(selection);
        renderMode();
        const updatedTextarea = $("kf-keyboard-selection-text");
        updatedTextarea.focus({ preventScroll: true });
        updatedTextarea.setSelectionRange(startOffset, endOffset);
        setStatus("Tarkka tekstikohta valittu");
    }

    function canMove(direction) {
        const count = state.mode === "translation"
            ? translationChunks(state.translation).length
            : state.project?.chapters?.length || 0;
        const index = state.mode === "translation" ? state.segmentIndex : state.chapterIndex;
        return direction < 0 ? index > 0 : index < count - 1;
    }

    function moveUnit(direction) {
        if (!canMove(direction)) return;
        if (keepOpenReviewForDecision()) return;
        cancelUnitRun();
        resetReaderScrollContext(state.mode);
        if (state.mode === "translation") {
            state.segmentIndex += direction;
            state.translationSelection = null;
        } else {
            state.chapterIndex += direction;
            state.textSelection = null;
            if (state.project?.id) {
                localStorage.setItem(CHAPTER_KEY_PREFIX + state.project.id, String(state.chapterIndex));
            }
        }
        renderAll();
        $(state.mode === "translation" ? "kf-target-reader" : "kf-text-reader").focus({ preventScroll: true });
    }

    function reviewSuggestions(result) {
        return (Array.isArray(result?.suggestions) ? result.suggestions : []).map((item) => ({
            ...item,
            status: "open",
            edited_replacement: String(item.replacement ?? ""),
        }));
    }

    function finishingWarnings(result) {
        return (Array.isArray(result?.warnings) ? result.warnings : [])
            .map((warning) => String(warning || "").trim())
            .filter(Boolean);
    }

    function hasUnreliableEmptySuggestionResult(result, suggestions) {
        if ((Array.isArray(suggestions) ? suggestions : []).length) return false;
        return finishingWarnings(result).some((warning) => (
            /mallin vastausta ei saatu jäsennettyä/i.test(warning)
            || /(?:jäsentäminen|jäsennys)[^.!?]*(?:epäonnist|virhe)/i.test(warning)
        ));
    }

    function selectionRequestPayload(selection, paragraphs) {
        return {
            start_paragraph: selection.startParagraph,
            end_paragraph: selection.endParagraph,
            start_offset: selection.startOffset,
            end_offset: selection.endOffset,
            expected_text: selectionText(paragraphs, selection),
        };
    }

    function requestContext(unitRunRequest) {
        const chunk = currentChunk();
        return {
            mode: state.mode,
            projectId: state.project?.id || null,
            chapterIndex: state.chapterIndex,
            translationId: state.translation?.id || null,
            segmentIndex: state.segmentIndex,
            rawChunkIndex: chunk?._kfRawIndex ?? null,
            chapterSnapshot: state.mode === "text" ? chapterParagraphs(currentChapter()) : null,
            translationSnapshot: state.mode === "translation" ? translationTextForChunk(chunk) : null,
            unitRun: unitRunRequest || null,
        };
    }

    function requestContextIsCurrent(context) {
        if (state.mode !== context.mode) return false;
        if (context.mode === "text") {
            if (
                String(state.project?.id || "") !== String(context.projectId || "")
                || state.chapterIndex !== context.chapterIndex
            ) return false;
        } else if (
            String(state.translation?.id || "") !== String(context.translationId || "")
            || state.segmentIndex !== context.segmentIndex
            || currentChunk()?._kfRawIndex !== context.rawChunkIndex
        ) return false;
        return !context.unitRun || (
            currentUnitRun()?.id === context.unitRun.id
            && currentUnitRun()?.status === "requesting"
        );
    }

    function canonicalChangedError(message) {
        const error = new Error(message);
        error.canonicalChanged = true;
        return error;
    }

    async function fetchCanonicalUnit(context) {
        if (context.mode === "text") {
            const latest = await api("/projects/" + encodeURIComponent(context.projectId));
            if (!requestContextIsCurrent(context)) {
                throw new Error("Käsikirjoitus vaihtui tarkistuksen aikana. Aja tarkistus uudelleen.");
            }
            const chapter = latest?.chapters?.[context.chapterIndex];
            if (!chapter) {
                rememberProject(latest, false);
                state.chapterIndex = Math.max(
                    0,
                    Math.min(context.chapterIndex, (latest?.chapters || []).length - 1)
                );
                state.textSelection = null;
                state.textReviews.delete(context.chapterIndex);
                cancelUnitRun();
                populateProjectSelect();
                renderAll();
                throw canonicalChangedError(
                    "Valittua lukua ei enää löytynyt. Ajantasainen käsikirjoitus ladattiin; valitse uusi kohta tai aloita koko luvun tarkistus uudelleen."
                );
            }
            const paragraphs = chapterParagraphs(chapter);
            if (!paragraphSnapshotsMatch(context.chapterSnapshot, paragraphs)) {
                rememberProject(latest, false);
                state.chapterIndex = Math.max(0, Math.min(context.chapterIndex, (latest.chapters || []).length - 1));
                state.textSelection = null;
                state.textReviews.delete(context.chapterIndex);
                cancelUnitRun();
                renderAll();
                throw canonicalChangedError(
                    "Lukua muutettiin toisessa näkymässä. Päivitetty teksti ladattiin; valitse kohta tai aloita koko luvun tarkistus uudelleen."
                );
            }
            rememberProject(latest, false);
            return { paragraphs, expectedParagraphs: paragraphs.slice() };
        }

        const latest = await api("/translations/" + encodeURIComponent(context.translationId));
        if (!requestContextIsCurrent(context)) {
            throw new Error("Käännös vaihtui tarkistuksen aikana. Aja tarkistus uudelleen.");
        }
        const rawChunks = Array.isArray(latest?.chunk_details) ? latest.chunk_details : [];
        const chunk = rawChunks[context.rawChunkIndex];
        if (!chunk) {
            rememberTranslation(latest);
            state.segmentIndex = Math.max(
                0,
                Math.min(context.segmentIndex, translationChunks(latest).length - 1)
            );
            state.translationSelection = null;
            state.translationReviews.delete(context.rawChunkIndex);
            cancelUnitRun();
            populateTranslationSelect();
            renderAll();
            throw canonicalChangedError(
                "Valittua käännössegmenttiä ei enää löytynyt. Ajantasainen käännös ladattiin; valitse uusi kohta tai aloita koko segmentin tarkistus uudelleen."
            );
        }
        const canonicalTranslation = translationTextForChunk(chunk);
        if (canonicalTranslation !== context.translationSnapshot) {
            rememberTranslation(latest);
            state.segmentIndex = Math.max(0, Math.min(context.segmentIndex, translationChunks(latest).length - 1));
            state.translationSelection = null;
            state.translationReviews.delete(context.rawChunkIndex);
            cancelUnitRun();
            populateTranslationSelect();
            renderAll();
            throw canonicalChangedError(
                "Käännössegmenttiä muutettiin toisessa näkymässä. Päivitetty teksti ladattiin; valitse kohta tai aloita koko segmentin tarkistus uudelleen."
            );
        }
        rememberTranslation(latest);
        return {
            paragraphs: paragraphModel(canonicalTranslation).paragraphs,
            expectedTranslation: canonicalTranslation,
        };
    }

    function storeReview(context, review) {
        if (context.mode === "translation") {
            state.translationReviews.set(context.rawChunkIndex, review);
        } else {
            state.textReviews.set(context.chapterIndex, review);
        }
    }

    function advanceUnitRun(review, paragraphs) {
        const run = currentUnitRun();
        if (!review?.unitRun || !run || run.id !== review.unitRun.id) {
            return { inRun: false, hasMore: false };
        }
        const nextCursor = cursorAfterSelection(paragraphs, review.selection);
        const nextSelection = unitPartSelection(paragraphs, nextCursor, REVIEW_PART_MAX_CHARACTERS);
        if (!nextCursor || !nextSelection) {
            run.status = "complete";
            run.nextCursor = null;
            run.totalParts = review.unitRun.partNumber;
            run.partNumber = review.unitRun.partNumber;
            return { inRun: true, hasMore: false };
        }
        run.nextCursor = nextCursor;
        run.partNumber = review.unitRun.partNumber + 1;
        run.totalParts = (run.partNumber - 1)
            + countUnitParts(paragraphs, REVIEW_PART_MAX_CHARACTERS, nextCursor);
        run.status = "ready";
        setCurrentSelection(nextSelection);
        return { inRun: true, hasMore: true };
    }

    async function generateFinishingSuggestions(selection, unitRunRequest) {
        if (state.busy || keepOpenReviewForDecision()) return;
        if (!unitRunRequest) {
            await modelSettings.load(false);
            if (state.busy || keepOpenReviewForDecision()) return;
        }
        const requestModel = unitRunRequest
            ? String(unitRunRequest.model || "").trim() || null
            : modelSettings.getModel();
        const context = requestContext(unitRunRequest);
        const isTranslation = context.mode === "translation";
        if (
            (!isTranslation && (!context.projectId || !currentChapter()))
            || (isTranslation && (!context.translationId || !currentChunk()))
        ) {
            toast(isTranslation
                ? "Valitse ensin tarkistettava käännössegmentti."
                : "Valitse ensin tarkistettava käsikirjoituksen luku.");
            return;
        }
        const selectedText = selectionText(currentUnitParagraphs(), selection);
        if (!selectedText.trim() || selectedText.length > REVIEW_PART_MAX_CHARACTERS) {
            toast(selectedText
                ? "Valitse enintään 12 000 merkkiä kerrallaan."
                : "Valitse ensin tarkistettava tekstikohta.");
            return;
        }

        setBusy(true, "Etsitään kieli- ja ulkoasukorjauksia…");
        setStatus(isTranslation ? "Oikoluku tarkistaa käännöstä" : "Oikoluku tarkistaa tekstiä");
        let focusUnitButton = Boolean(unitRunRequest);
        try {
            const canonical = await fetchCanonicalUnit(context);
            if (!requestContextIsCurrent(context)) {
                throw new Error("Aineisto vaihtui tarkistuksen aikana. Aja tarkistus uudelleen.");
            }
            const canonicalSelection = cloneSelection(selection);
            canonicalSelection.text = selectionText(canonical.paragraphs, canonicalSelection);
            if (!canonicalSelection.text.trim()) {
                throw canonicalChangedError("Valittu tekstikohta ei enää sisällä tarkistettavaa tekstiä.");
            }
            const body = {
                model: requestModel,
                selection: selectionRequestPayload(canonicalSelection, canonical.paragraphs),
            };
            let result;
            if (isTranslation) {
                body.chunk_index = context.rawChunkIndex;
                result = await api(
                    "/translations/" + encodeURIComponent(context.translationId) + "/finishing-suggestions",
                    jsonOptions("POST", body)
                );
            } else {
                result = await api(
                    "/projects/" + encodeURIComponent(context.projectId) + "/chapters/"
                        + context.chapterIndex + "/finishing-suggestions",
                    jsonOptions("POST", body)
                );
            }
            if (!requestContextIsCurrent(context)) {
                throw new Error("Aineisto vaihtui tarkistuksen aikana. Aja tarkistus uudelleen.");
            }
            const suggestions = reviewSuggestions(result);
            const warnings = finishingWarnings(result);
            if (hasUnreliableEmptySuggestionResult(result, suggestions)) {
                throw new Error(warnings.join(" ") + " Yritä samaa osaa uudelleen.");
            }
            const usesManualFallback = suggestions.length === 0;
            if (usesManualFallback) suggestions.push(manualFallbackSuggestion(canonicalSelection));
            const review = {
                expectedParagraphs: canonical.expectedParagraphs || null,
                expectedTranslation: canonical.expectedTranslation ?? null,
                selection: canonicalSelection,
                suggestions,
                warnings,
                generatedBy: String(result?.generated_by || ""),
                unitRun: unitRunRequest || null,
            };
            storeReview(context, review);
            if (unitRunRequest) {
                const run = currentUnitRun();
                if (run?.id === unitRunRequest.id) {
                    run.status = "review";
                }
            }
            renderAll();
            if (usesManualFallback) {
                focusUnitButton = false;
                setStatus("Korjattavaa ei löytynyt · muokkaa tekstiä itse tai hylkää");
                toast("Valittu teksti avattiin muokattavaksi ilman automaattisia muutoksia.");
            } else {
                focusUnitButton = false;
                setStatus(suggestions.length === 1
                    ? "1 korjausehdotus · hyväksy tai hylkää"
                    : suggestions.length + " korjausehdotusta · hyväksy tai hylkää");
            }
        } catch (error) {
            const run = unitRunRequest ? currentUnitRun() : null;
            if (run?.id === unitRunRequest?.id) run.status = "retry";
            renderAll();
            setStatus(error.canonicalChanged ? "Aineisto muuttui" : "Viimeistelytarkistus epäonnistui");
            toast(error.message);
        } finally {
            setBusy(false);
            window.requestAnimationFrame(() => {
                if (focusUnitButton) $("kf-run-unit")?.focus({ preventScroll: true });
                else document.querySelector(".kf-replacement:not(:disabled)")?.focus({ preventScroll: true });
            });
        }
    }

    function runSelectedFinishingSuggestions() {
        if (keepOpenReviewForDecision()) return;
        const selection = currentSelection();
        if (!selection?.text?.trim()) {
            toast("Valitse ensin tarkistettava tekstikohta.");
            return;
        }
        cancelUnitRun();
        clearCurrentReview();
        renderAll();
        return generateFinishingSuggestions(selection, null);
    }

    async function generateNextUnitReview() {
        if (keepOpenReviewForDecision()) return;
        if (!(state.mode === "translation" ? currentChunk() : currentChapter()) || !unitHasText()) {
            toast(state.mode === "translation"
                ? "Valitse ensin tarkistettava käännössegmentti."
                : "Valitse ensin tarkistettava käsikirjoituksen luku.");
            return;
        }
        let run = currentUnitRun();
        if (!run || run.status === "complete") {
            await modelSettings.load(false);
            if (state.busy || currentUnitRun()?.status === "requesting") return;
            cancelUnitRun();
            const paragraphs = currentUnitParagraphs();
            const totalParts = countUnitParts(paragraphs, REVIEW_PART_MAX_CHARACTERS);
            const nextCursor = normalizedUnitCursor(paragraphs, { paragraph: 0, offset: 0 });
            if (!totalParts || !nextCursor) {
                renderAll();
                toast("Valitussa kohteessa ei ole tarkistettavaa tekstiä.");
                return;
            }
            run = {
                id: ++state.unitRunRevision,
                mode: state.mode,
                projectId: state.project?.id || null,
                chapterIndex: state.chapterIndex,
                translationId: state.translation?.id || null,
                rawChunkIndex: currentChunk()?._kfRawIndex ?? null,
                model: modelSettings.getModel(),
                partNumber: 1,
                totalParts,
                nextCursor,
                status: "ready",
            };
            state.unitRun = run;
        }
        if (run.status === "review") {
            toast("Ratkaise kaikki nykyisen osan ehdotukset ennen jatkamista.");
            return;
        }
        const selection = unitPartSelection(currentUnitParagraphs(), run.nextCursor, REVIEW_PART_MAX_CHARACTERS);
        if (!selection) {
            run.status = "complete";
            run.nextCursor = null;
            renderAll();
            return;
        }
        clearCurrentReview();
        setCurrentSelection(selection);
        run.status = "requesting";
        renderAll();
        revealCurrentSelection(selection);
        return generateFinishingSuggestions(selection, {
            id: run.id,
            model: run.model,
            partNumber: run.partNumber,
            totalParts: run.totalParts,
        });
    }

    function validateOpenSuggestions(review, text) {
        (review?.suggestions || []).forEach((item) => {
            if ((item.status || "open") !== "open") return;
            const validation = findSuggestionRange(text, item, review.selection);
            if (validation.error) {
                item.status = "stale";
                item.stale_reason = validation.error;
            }
        });
    }

    function validateOpenTextSuggestions(review, paragraphs) {
        (review?.suggestions || []).forEach((item) => {
            if ((item.status || "open") !== "open") return;
            const validation = replaceTextSuggestion(paragraphs, item, item.replacement, review.selection);
            if (validation.error) {
                item.status = "stale";
                item.stale_reason = validation.error;
            }
        });
    }

    function adjustParagraphSelection(selection, range, delta, paragraphs) {
        if (range?.selection) return cloneSelection(range.selection);
        const next = cloneSelection(selection);
        if (!next || !range || !delta) return next;
        if (range.paragraphIndex === next.endParagraph && range.start < next.endOffset) {
            next.endOffset = Math.max(next.startParagraph === next.endParagraph ? next.startOffset : 0, next.endOffset + delta);
        }
        next.text = selectionText(paragraphs, next);
        return next;
    }

    function absoluteOffsetForCursor(model, cursor) {
        if (!model?.paragraphs?.length || !cursor) return 0;
        const paragraphIndex = Math.max(0, Math.min(cursor.paragraph, model.paragraphs.length - 1));
        let absolute = 0;
        for (let index = 0; index < paragraphIndex; index += 1) {
            absolute += model.paragraphs[index].length + String(model.separators[index] || "").length;
        }
        return absolute + Math.max(0, Math.min(cursor.offset, model.paragraphs[paragraphIndex].length));
    }

    function cursorForAbsoluteOffset(model, absoluteOffset) {
        const paragraphs = Array.isArray(model?.paragraphs) ? model.paragraphs : [];
        if (!paragraphs.length) return { paragraph: 0, offset: 0 };
        const target = Math.max(0, Math.min(Number(absoluteOffset) || 0, String(model.text || "").length));
        let position = 0;
        for (let index = 0; index < paragraphs.length; index += 1) {
            const paragraphEnd = position + paragraphs[index].length;
            if (target <= paragraphEnd) return { paragraph: index, offset: target - position };
            const separatorEnd = paragraphEnd + String(model.separators[index] || "").length;
            if (target < separatorEnd && index + 1 < paragraphs.length) {
                return { paragraph: index + 1, offset: 0 };
            }
            position = separatorEnd;
        }
        return { paragraph: paragraphs.length - 1, offset: paragraphs[paragraphs.length - 1].length };
    }

    function adjustStringSelection(beforeText, afterText, selection, range, delta) {
        const beforeModel = paragraphModel(beforeText);
        const startAbsolute = absoluteOffsetForCursor(beforeModel, {
            paragraph: selection.startParagraph,
            offset: selection.startOffset,
        });
        const endAbsolute = absoluteOffsetForCursor(beforeModel, {
            paragraph: selection.endParagraph,
            offset: selection.endOffset,
        });
        const adjustedStart = startAbsolute + (range.end <= startAbsolute ? delta : 0);
        const adjustedEnd = endAbsolute + (range.start < endAbsolute ? delta : 0);
        const afterModel = paragraphModel(afterText);
        const start = cursorForAbsoluteOffset(afterModel, adjustedStart);
        const end = cursorForAbsoluteOffset(afterModel, adjustedEnd);
        const next = {
            startParagraph: start.paragraph,
            endParagraph: Math.max(start.paragraph, end.paragraph),
            startOffset: start.offset,
            endOffset: end.offset,
        };
        next.text = selectionText(afterModel.paragraphs, next);
        return next;
    }

    function finishResolvedUnitPart(review, paragraphs) {
        if (!review?.unitRun || openSuggestionCount(review)) {
            return { inRun: false, hasMore: false };
        }
        return advanceUnitRun(review, paragraphs);
    }

    function unchangedManualSuggestionItems(review, indexes) {
        const items = (Array.isArray(indexes) ? indexes : [])
            .map((index) => review?.suggestions?.[index])
            .filter((item) => item && (item.status || "open") === "open");
        if (
            !items.length
            || items.some((item) => (
                !item.manual_fallback
                || String(item.edited_replacement ?? item.replacement ?? "") !== String(item.original || "")
            ))
        ) return null;
        return items;
    }

    async function acceptUnchangedManualSuggestions(review, indexes) {
        const items = unchangedManualSuggestionItems(review, indexes);
        if (!items) return false;
        const context = requestContext(null);
        setBusy(true, "Varmistetaan tekstin ajantasaisuus…");
        setStatus("Varmistetaan muuttumatonta hyväksyntää");
        try {
            const canonical = await fetchCanonicalUnit(context);
            if (currentReview() !== review || !requestContextIsCurrent(context)) {
                throw new Error("Aineisto vaihtui hyväksynnän aikana. Aja tarkistus uudelleen.");
            }
            if (context.mode === "text") {
                review.expectedParagraphs = canonical.expectedParagraphs.slice();
            } else {
                review.expectedTranslation = canonical.expectedTranslation;
            }
            items.forEach((item) => {
                item.status = "accepted";
                item.stale_reason = "";
            });
            const result = {
                count: items.length,
                progress: finishResolvedUnitPart(review, canonical.paragraphs),
            };
            renderUnchangedManualAcceptance(result);
        } catch (error) {
            setStatus(error.canonicalChanged ? "Aineisto muuttui" : "Hyväksynnän varmistus epäonnistui");
            toast(error.message);
        } finally {
            setBusy(false);
        }
        return true;
    }

    function renderUnchangedManualAcceptance(result) {
        renderAll();
        const completedMessage = resolvedUnitMessage(result.progress);
        setStatus(completedMessage?.status || "Valittu teksti hyväksytty ilman muutoksia");
        toast(completedMessage?.toast || "Teksti hyväksyttiin ilman muutoksia.");
        window.requestAnimationFrame(() => {
            if (result.progress.inRun) $("kf-run-unit")?.focus({ preventScroll: true });
        });
    }

    function resolvedUnitMessage(progress) {
        if (!progress.inRun) return null;
        if (progress.hasMore) {
            return {
                status: "Osa käsitelty · jatka seuraavaan osaan",
                toast: "Osan kaikki ehdotukset on käsitelty. Voit jatkaa seuraavaan osaan.",
            };
        }
        return {
            status: state.mode === "translation" ? "Koko segmentti käsitelty" : "Koko luku käsitelty",
            toast: "Kaikki osat ja ehdotukset on käsitelty.",
        };
    }

    async function reconcileTextPatchFailure(projectId, chapterIndex, expectedParagraphs) {
        let latest;
        try {
            latest = await api("/projects/" + encodeURIComponent(projectId));
        } catch (error) {
            return false;
        }
        if (
            state.mode !== "text"
            || String(state.project?.id || "") !== String(projectId || "")
            || state.chapterIndex !== chapterIndex
        ) return false;
        const latestChapter = latest?.chapters?.[chapterIndex] || null;
        const canonicalParagraphs = chapterParagraphs(latestChapter);
        if (latestChapter && paragraphSnapshotsMatch(canonicalParagraphs, expectedParagraphs)) {
            return false;
        }
        rememberProject(latest, false);
        state.chapterIndex = clampUnitIndex(chapterIndex, latest?.chapters?.length || 0);
        state.textSelection = null;
        state.textReviews = new Map();
        cancelUnitRun();
        populateProjectSelect();
        renderAll();
        return true;
    }

    async function reconcileTranslationPatchFailure(translationId, rawIndex, expectedTranslation) {
        let latest;
        try {
            latest = await api("/translations/" + encodeURIComponent(translationId));
        } catch (error) {
            return false;
        }
        if (
            state.mode !== "translation"
            || String(state.translation?.id || "") !== String(translationId || "")
        ) return false;
        const latestChunk = Array.isArray(latest?.chunk_details)
            ? latest.chunk_details[rawIndex] || null
            : null;
        const canonicalTranslation = translationTextForChunk(latestChunk);
        if (latestChunk && canonicalTranslation === expectedTranslation) return false;
        rememberTranslation(latest);
        const chunks = translationChunks(latest);
        const matchingIndex = chunks.findIndex((chunk) => chunk._kfRawIndex === rawIndex);
        state.segmentIndex = matchingIndex >= 0
            ? matchingIndex
            : clampUnitIndex(state.segmentIndex, chunks.length);
        state.translationSelection = null;
        state.translationReviews = new Map();
        cancelUnitRun();
        populateTranslationSelect();
        renderAll();
        return true;
    }

    async function applyTextSuggestionIndexes(indexes) {
        const chapter = currentChapter();
        const review = currentReview();
        if (!state.project?.id || !chapter || !review) return;
        const projectId = state.project.id;
        const chapterIndex = state.chapterIndex;
        const expectedParagraphs = chapterParagraphs(chapter);
        if (
            Array.isArray(review.expectedParagraphs)
            && !paragraphSnapshotsMatch(review.expectedParagraphs, expectedParagraphs)
        ) {
            toast("Luku on muuttunut ehdotusten luonnin jälkeen. Aja tarkistus uudelleen ajantasaisesta tekstistä.");
            return;
        }
        if (await acceptUnchangedManualSuggestions(review, indexes)) return;
        let nextParagraphs = expectedParagraphs.slice();
        let workingSelection = cloneSelection(review.selection);
        const applied = [];
        const blockedIndexes = [];

        indexes.forEach((index) => {
            const item = review.suggestions[index];
            if (!item || (item.status || "open") !== "open") return;
            const replacement = String(item.edited_replacement ?? item.replacement ?? "");
            const replacementError = editableReplacementError(item, replacement);
            if (replacementError) {
                item.replacement_error = replacementError;
                blockedIndexes.push(index);
                return;
            }
            item.replacement_error = "";
            const result = replaceTextSuggestion(nextParagraphs, item, replacement, workingSelection);
            if (result.error) {
                item.status = "stale";
                item.stale_reason = result.error;
                return;
            }
            nextParagraphs = result.paragraphs;
            workingSelection = adjustParagraphSelection(
                workingSelection,
                result.range,
                result.delta,
                nextParagraphs
            );
            applied.push(index);
        });

        if (!applied.length) {
            const progress = finishResolvedUnitPart(review, expectedParagraphs);
            renderAll();
            toast(blockedIndexes.length
                ? review.suggestions[blockedIndexes[0]].replacement_error
                : "Yhtään ehdotusta ei voitu kohdistaa turvallisesti nykyiseen tekstiin.");
            if (progress.inRun) $("kf-run-unit")?.focus({ preventScroll: true });
            else if (blockedIndexes.length) {
                window.requestAnimationFrame(() => {
                    document.querySelector(
                        `[data-suggestion-index="${blockedIndexes[0]}"] .kf-replacement`
                    )?.focus({ preventScroll: true });
                });
            }
            return;
        }

        setBusy(true, applied.length > 1 ? "Tallennetaan hyväksyttyjä korjauksia…" : "Tallennetaan hyväksytty korjaus…");
        setStatus("Tallennetaan hyväksyntää");
        let progress = { inRun: false, hasMore: false };
        try {
            const nextChapter = Object.assign({}, chapter, { paragraphs: nextParagraphs });
            const saved = await api(
                "/projects/" + encodeURIComponent(projectId) + "/chapters/" + chapterIndex,
                jsonOptions("PATCH", {
                    chapter: nextChapter,
                    expected_paragraphs: expectedParagraphs,
                })
            );
            if (
                state.mode !== "text"
                || String(state.project?.id || "") !== String(projectId)
                || state.chapterIndex !== chapterIndex
            ) throw new Error("Käsikirjoitus vaihtui tallennuksen aikana.");
            rememberProject(saved, true);
            const canonical = chapterParagraphs(saved?.chapters?.[chapterIndex]);
            applied.forEach((index) => {
                review.suggestions[index].status = "accepted";
                review.suggestions[index].stale_reason = "";
            });
            review.expectedParagraphs = canonical;
            review.selection = workingSelection;
            review.selection.text = selectionText(canonical, review.selection);
            validateOpenTextSuggestions(review, canonical);
            state.textSelection = review.selection;
            progress = finishResolvedUnitPart(review, canonical);
            state.textReviews.set(chapterIndex, review);
            populateProjectSelect();
            renderAll();
            const completedMessage = resolvedUnitMessage(progress);
            setStatus(completedMessage?.status || (applied.length === 1
                ? "1 korjaus hyväksytty ja tallennettu"
                : applied.length + " korjausta hyväksytty ja tallennettu"));
            toast(completedMessage?.toast || (applied.length === 1
                ? "Korjaus hyväksyttiin."
                : applied.length + " korjausta hyväksyttiin."));
        } catch (error) {
            const reconciled = await reconcileTextPatchFailure(
                projectId,
                chapterIndex,
                expectedParagraphs
            );
            setStatus(reconciled ? "Ajantasainen teksti ladattu" : "Korjausten tallennus epäonnistui");
            toast(reconciled
                ? "Palvelimelta ladattiin ajantasainen käsikirjoitus. Tarkistus päätettiin, jotta korjausta ei tallenneta kahdesti."
                : error.message);
        } finally {
            setBusy(false);
            window.requestAnimationFrame(() => {
                if (progress.inRun) $("kf-run-unit")?.focus({ preventScroll: true });
                else document.querySelector(".kf-replacement:not(:disabled)")?.focus({ preventScroll: true });
            });
        }
    }

    async function applyTranslationSuggestionIndexes(indexes) {
        const chunk = currentChunk();
        const review = currentReview();
        if (!state.translation?.id || !chunk || !review) return;
        const translationId = state.translation.id;
        const rawIndex = chunk._kfRawIndex;
        const expectedTranslation = translationTextForChunk(chunk);
        if (
            review.expectedTranslation !== null
            && review.expectedTranslation !== undefined
            && review.expectedTranslation !== expectedTranslation
        ) {
            toast("Käännössegmentti on muuttunut ehdotusten luonnin jälkeen. Aja tarkistus uudelleen ajantasaisesta tekstistä.");
            return;
        }
        if (await acceptUnchangedManualSuggestions(review, indexes)) return;
        let nextTranslation = expectedTranslation;
        let workingSelection = cloneSelection(review.selection);
        const applied = [];
        const blockedIndexes = [];

        indexes.forEach((index) => {
            const item = review.suggestions[index];
            if (!item || (item.status || "open") !== "open") return;
            const replacement = String(item.edited_replacement ?? item.replacement ?? "");
            const replacementError = editableReplacementError(item, replacement);
            if (replacementError) {
                item.replacement_error = replacementError;
                blockedIndexes.push(index);
                return;
            }
            item.replacement_error = "";
            const beforeTranslation = nextTranslation;
            const result = replaceSuggestionRange(nextTranslation, item, replacement, workingSelection);
            if (result.error) {
                item.status = "stale";
                item.stale_reason = result.error;
                return;
            }
            nextTranslation = result.text;
            workingSelection = adjustStringSelection(
                beforeTranslation,
                nextTranslation,
                workingSelection,
                result.range,
                result.delta
            );
            applied.push(index);
        });

        if (!applied.length) {
            const progress = finishResolvedUnitPart(review, paragraphModel(expectedTranslation).paragraphs);
            renderAll();
            toast(blockedIndexes.length
                ? review.suggestions[blockedIndexes[0]].replacement_error
                : "Yhtään ehdotusta ei voitu kohdistaa turvallisesti nykyiseen tekstiin.");
            if (progress.inRun) $("kf-run-unit")?.focus({ preventScroll: true });
            else if (blockedIndexes.length) {
                window.requestAnimationFrame(() => {
                    document.querySelector(
                        `[data-suggestion-index="${blockedIndexes[0]}"] .kf-replacement`
                    )?.focus({ preventScroll: true });
                });
            }
            return;
        }

        setBusy(true, applied.length > 1 ? "Tallennetaan hyväksyttyjä korjauksia…" : "Tallennetaan hyväksytty korjaus…");
        setStatus("Tallennetaan hyväksyntää");
        let progress = { inRun: false, hasMore: false };
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
            review.selection = workingSelection;
            const canonicalParagraphs = paragraphModel(canonical).paragraphs;
            review.selection.text = selectionText(canonicalParagraphs, review.selection);
            validateOpenSuggestions(review, canonical);
            state.translationSelection = review.selection;
            progress = finishResolvedUnitPart(review, canonicalParagraphs);
            state.translationReviews.set(rawIndex, review);
            populateTranslationSelect();
            renderAll();
            const completedMessage = resolvedUnitMessage(progress);
            setStatus(completedMessage?.status || (applied.length === 1
                ? "1 korjaus hyväksytty ja tallennettu"
                : applied.length + " korjausta hyväksytty ja tallennettu"));
            toast(completedMessage?.toast || (applied.length === 1
                ? "Korjaus hyväksyttiin."
                : applied.length + " korjausta hyväksyttiin."));
        } catch (error) {
            const reconciled = await reconcileTranslationPatchFailure(
                translationId,
                rawIndex,
                expectedTranslation
            );
            setStatus(reconciled ? "Ajantasainen käännös ladattu" : "Korjausten tallennus epäonnistui");
            toast(reconciled
                ? "Palvelimelta ladattiin ajantasainen käännös. Tarkistus päätettiin, jotta korjausta ei tallenneta kahdesti."
                : error.message);
        } finally {
            setBusy(false);
            window.requestAnimationFrame(() => {
                if (progress.inRun) $("kf-run-unit")?.focus({ preventScroll: true });
                else document.querySelector(".kf-replacement:not(:disabled)")?.focus({ preventScroll: true });
            });
        }
    }

    function applySuggestionIndexes(indexes) {
        return state.mode === "translation"
            ? applyTranslationSuggestionIndexes(indexes)
            : applyTextSuggestionIndexes(indexes);
    }

    async function rejectSuggestion(index) {
        const review = currentReview();
        const item = review?.suggestions?.[index];
        if (!item || (item.status || "open") !== "open") return;
        let paragraphs = currentUnitParagraphs();
        if (review.unitRun) {
            const context = requestContext(null);
            setBusy(true, "Varmistetaan tekstin ajantasaisuus…");
            setStatus("Varmistetaan hylkäystä");
            try {
                const canonical = await fetchCanonicalUnit(context);
                if (currentReview() !== review || !requestContextIsCurrent(context)) {
                    throw new Error("Aineisto vaihtui hylkäyksen aikana. Aja tarkistus uudelleen.");
                }
                paragraphs = canonical.paragraphs;
                if (context.mode === "text") {
                    review.expectedParagraphs = canonical.expectedParagraphs.slice();
                } else {
                    review.expectedTranslation = canonical.expectedTranslation;
                }
            } catch (error) {
                setStatus(error.canonicalChanged ? "Aineisto muuttui" : "Hylkäyksen varmistus epäonnistui");
                toast(error.message);
                setBusy(false);
                return;
            }
        }
        item.status = "rejected";
        const progress = finishResolvedUnitPart(review, paragraphs);
        if (review.unitRun) setBusy(false);
        renderAll();
        const completedMessage = resolvedUnitMessage(progress);
        setStatus(completedMessage?.status || (state.mode === "translation"
            ? "Ehdotus hylätty · käännös säilyi ennallaan"
            : "Ehdotus hylätty · käsikirjoitus säilyi ennallaan"));
        toast(completedMessage?.toast || "Ehdotus hylättiin. Tekstiä ei muutettu.");
        window.requestAnimationFrame(() => {
            if (progress.inRun) $("kf-run-unit")?.focus({ preventScroll: true });
            else document.querySelector(".kf-replacement:not(:disabled)")?.focus({ preventScroll: true });
        });
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
        state.translationScrollRatio = readerScrollRatio(source);
        if (sourceMax <= 0 || targetMax <= 0) return;
        state.scrollSyncing = true;
        target.scrollTop = state.translationScrollRatio * targetMax;
        window.requestAnimationFrame(() => {
            state.scrollSyncing = false;
        });
    }

    function bindEvents() {
        document.querySelectorAll("[data-kf-mode]").forEach((button, index, buttons) => {
            button.addEventListener("click", () => setMode(button.dataset.kfMode, true));
            button.addEventListener("keydown", (event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                let nextIndex = index;
                if (event.key === "ArrowLeft") nextIndex = (index - 1 + buttons.length) % buttons.length;
                if (event.key === "ArrowRight") nextIndex = (index + 1) % buttons.length;
                if (event.key === "Home") nextIndex = 0;
                if (event.key === "End") nextIndex = buttons.length - 1;
                setMode(buttons[nextIndex].dataset.kfMode, true);
            });
        });
        $("kf-text-project-select").addEventListener("change", (event) => {
            if (keepOpenReviewForDecision()) return;
            loadProject(event.target.value, { notifyParent: true });
        });
        $("kf-project-select").addEventListener("change", (event) => {
            if (keepOpenReviewForDecision()) return;
            loadProject(event.target.value, { notifyParent: true });
        });
        $("kf-translation-select").addEventListener("change", (event) => {
            if (keepOpenReviewForDecision()) return;
            chooseTranslation(event.target.value);
        });
        $("kf-previous").addEventListener("click", () => moveUnit(-1));
        $("kf-next").addEventListener("click", () => moveUnit(1));
        $("kf-text-reader").addEventListener("pointerup", (event) => handleReaderSelection("text", event));
        $("kf-text-reader").addEventListener("keyup", (event) => {
            if (event.shiftKey) handleReaderSelection("text", event);
        });
        $("kf-text-reader").addEventListener("keydown", (event) => handleReaderKeyboardSelection("text", event));
        $("kf-target-reader").addEventListener("pointerup", (event) => handleReaderSelection("translation", event));
        $("kf-target-reader").addEventListener("keyup", (event) => {
            if (event.shiftKey) handleReaderSelection("translation", event);
        });
        $("kf-target-reader").addEventListener("keydown", (event) => handleReaderKeyboardSelection("translation", event));
        $("kf-keyboard-selection-text").addEventListener("select", updateKeyboardSelectionStatus);
        $("kf-keyboard-selection-text").addEventListener("keyup", updateKeyboardSelectionStatus);
        $("kf-keyboard-selection-text").addEventListener("keydown", (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                applyKeyboardSelection();
            }
        });
        $("kf-use-keyboard-selection").addEventListener("click", applyKeyboardSelection);
        $("kf-run").addEventListener("click", runSelectedFinishingSuggestions);
        $("kf-run-unit").addEventListener("click", generateNextUnitReview);
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
            if (keepOpenReviewForDecision()) return;
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
            setStatus(state.mode === "translation"
                ? (state.translation ? "Valmis viimeistelyyn" : "Valitse teos ja käännös")
                : (currentChapter() ? "Valmis viimeistelyyn" : "Valitse teos"));
        } catch (error) {
            setStatus("Viimeistelytyötilan lataus epäonnistui");
            toast(error.message);
        } finally {
            setBusy(false);
        }
    }

    window.SkriptLabTranslationFinishingTestHooks = {
        paragraphModel,
        paragraphBoundaryCount,
        replacementParagraphBoundaryError,
        selectionText,
        safeParagraphCut,
        unitPartSelection,
        cursorAfterSelection,
        countUnitParts,
        clampUnitIndex,
        findSuggestionInParagraphs,
        findSuggestionRange,
        replaceSuggestionRange,
        replaceTextSuggestion,
        adjustParagraphSelection,
        absoluteOffsetForCursor,
        cursorForAbsoluteOffset,
        adjustStringSelection,
        readerScrollRatio,
        applyReaderScrollRatio,
        hasUnreliableEmptySuggestionResult,
        translationChunks,
        contentDispositionFilename,
    };

    initialize();
})();
