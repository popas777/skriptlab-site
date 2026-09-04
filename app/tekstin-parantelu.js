(function () {
    "use strict";

    const rootConfig = window.SKRIPTLAB_CONFIG || {};
    const API_BASE = String(rootConfig.API_BASE_URL || "").replace(/\/$/, "") + "/api";
    const ACTIVE_PROJECT_KEY = "skriptlab_active_project_id";
    const MODE_KEY = "skriptlab_text_improvement_mode";
    const MANUAL_SELECTION_MAX_CHARACTERS = 12000;
    const CHAPTER_PART_MAX_CHARACTERS = 12000;
    const $ = (id) => document.getElementById(id);
    const storedUser = (() => {
        try {
            return JSON.parse(localStorage.getItem("skriptlab_auth_user") || "null");
        } catch (error) {
            return null;
        }
    })();
    const allowedModules = Array.isArray(storedUser?.allowed_modules)
        ? storedUser.allowed_modules.map((value) => String(value || ""))
        : null;
    const canUseTranslations = allowedModules === null
        || allowedModules.includes("translations")
        || allowedModules.includes("translation_workspace");
    const canImportBilingual = allowedModules === null
        || allowedModules.includes("translation_workspace");

    const state = {
        mode: localStorage.getItem(MODE_KEY) === "translation" && canUseTranslations
            ? "translation"
            : "normal",
        canUseTranslations,
        canImportBilingual,
        projects: [],
        project: null,
        chapterIndex: 0,
        normalSelection: null,
        translations: [],
        translation: null,
        segmentIndex: 0,
        translationSelection: null,
        suggestion: null,
        chapterRun: null,
        chapterRunRevision: 0,
        busy: false,
        busyReturnFocus: null,
        focusAfterBusy: null,
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

    async function api(path, options) {
        const requestOptions = Object.assign({}, options || {});
        const headers = Object.assign({}, requestOptions.headers || {});
        const token = authToken();
        if (token) headers.Authorization = "Bearer " + token;
        requestOptions.headers = headers;

        const controller = new AbortController();
        const longRequest = path === "/proofread/improve-selection";
        const timeout = window.setTimeout(() => controller.abort(), longRequest ? 180000 : 45000);
        if (!requestOptions.signal) requestOptions.signal = controller.signal;

        try {
            const response = await fetch(API_BASE + path, requestOptions);
            if (response.status === 401) {
                localStorage.removeItem("skriptlab_auth_token");
                localStorage.removeItem("skriptlab_auth_user");
                window.top.location.replace("login.html");
                throw new Error("Kirjautuminen on vanhentunut.");
            }
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
            if (error && error.name === "AbortError") {
                throw new Error("Pyyntö kesti liian kauan. Tekstiä ei muutettu.");
            }
            throw error;
        } finally {
            window.clearTimeout(timeout);
        }
    }

    function toast(message) {
        const element = $("ti-toast");
        element.textContent = String(message || "");
        element.hidden = false;
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => {
            element.hidden = true;
        }, 4200);
    }

    function setStatus(message) {
        $("ti-status").textContent = String(message || "");
    }

    function setBusy(show, label) {
        if (show) {
            const active = document.activeElement;
            state.busyReturnFocus = active instanceof HTMLElement
                && ($("ti-header").contains(active) || $("ti-editor-grid").contains(active))
                ? active
                : null;
            state.focusAfterBusy = null;
        }
        state.busy = Boolean(show);
        $("ti-working").hidden = !show;
        $("ti-header").inert = Boolean(show);
        $("ti-editor-grid").inert = Boolean(show);
        if (label) $("ti-working-label").textContent = label;
        updateActionStates();
        if (!show) {
            const preferred = state.focusAfterBusy;
            const fallback = state.busyReturnFocus;
            state.focusAfterBusy = null;
            state.busyReturnFocus = null;
            window.requestAnimationFrame(() => {
                const target = preferred?.isConnected && !preferred.disabled
                    ? preferred
                    : (fallback?.isConnected && !fallback.disabled ? fallback : null);
                target?.focus({ preventScroll: true });
            });
        }
    }

    function wordCount(value) {
        return String(value || "").trim().split(/\s+/).filter(Boolean).length;
    }

    function splitParagraphs(value) {
        const normalized = String(value || "").replace(/\r\n?/g, "\n").trim();
        if (!normalized) return [""];
        const paragraphs = normalized.split(/\n\s*\n+/).map((item) => item.trim());
        return paragraphs.length ? paragraphs : [normalized];
    }

    function paragraphModel(value) {
        const text = String(value || "").replace(/\r\n?/g, "\n");
        const paragraphs = [];
        const separators = [];
        const pattern = /\n(?:[ \t]*\n)+/g;
        let cursor = 0;
        let match = pattern.exec(text);
        while (match) {
            paragraphs.push(text.slice(cursor, match.index));
            separators.push(match[0]);
            cursor = match.index + match[0].length;
            match = pattern.exec(text);
        }
        paragraphs.push(text.slice(cursor));
        return { text, paragraphs, separators };
    }

    function selectionRangeInParagraphModel(model, selection) {
        if (!model || !selection || !Array.isArray(model.paragraphs) || !model.paragraphs.length) {
            return { start: 0, end: 0 };
        }
        const startParagraph = Math.max(0, Math.min(selection.startParagraph, model.paragraphs.length - 1));
        const endParagraph = Math.max(startParagraph, Math.min(selection.endParagraph, model.paragraphs.length - 1));
        let start = 0;
        for (let index = 0; index < startParagraph; index += 1) {
            start += model.paragraphs[index].length + (model.separators[index] || "").length;
        }
        start += Math.max(0, Math.min(selection.startOffset, model.paragraphs[startParagraph].length));
        let end = 0;
        for (let index = 0; index < endParagraph; index += 1) {
            end += model.paragraphs[index].length + (model.separators[index] || "").length;
        }
        end += Math.max(0, Math.min(selection.endOffset, model.paragraphs[endParagraph].length));
        return { start, end: Math.max(start, end) };
    }

    function selectionTextFromParagraphModel(model, selection) {
        const range = selectionRangeInParagraphModel(model, selection);
        return String(model?.text || "").slice(range.start, range.end);
    }

    function replaceSelectionInParagraphModel(model, selection, replacement) {
        if (!model || !selection || !Array.isArray(model.paragraphs)) return model?.text || "";
        const range = selectionRangeInParagraphModel(model, selection);
        return model.text.slice(0, range.start) + replacement + model.text.slice(range.end);
    }

    function paragraphModelFromParagraphs(paragraphs) {
        const values = Array.isArray(paragraphs)
            ? paragraphs.map((value) => String(value || ""))
            : [];
        return {
            text: values.join("\n\n"),
            paragraphs: values,
            separators: values.slice(0, -1).map(() => "\n\n"),
        };
    }

    function contextAroundSelection(model, selection, maxCharacters) {
        if (!model || !selection || !Array.isArray(model.paragraphs) || !model.paragraphs.length) {
            return { before: "", after: "" };
        }
        const limit = Math.max(0, Number(maxCharacters) || 0);
        if (!limit) return { before: "", after: "" };
        const range = selectionRangeInParagraphModel(model, selection);
        return {
            before: model.text.slice(0, range.start).slice(-limit),
            after: model.text.slice(range.end, range.end + limit),
        };
    }

    function chapterTitle(chapter, index) {
        return String(chapter?.toc_title || chapter?.title || "Luku " + (index + 1));
    }

    function currentChapter() {
        return state.project?.chapters?.[state.chapterIndex] || null;
    }

    function translationChunks(item) {
        return (Array.isArray(item?.chunk_details) ? item.chunk_details : [])
            .map((chunk, rawIndex) => Object.assign({ _tiRawIndex: rawIndex }, chunk))
            .filter((chunk) => {
                return Boolean(sourceTextForChunk(chunk).trim() && translationTextForChunk(chunk).trim());
            });
    }

    function currentChunk() {
        return translationChunks(state.translation)[state.segmentIndex] || null;
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

    function selectionText(paragraphs, selection) {
        if (!selection || !Array.isArray(paragraphs) || !paragraphs.length) return "";
        const startParagraph = Math.max(0, Math.min(selection.startParagraph, paragraphs.length - 1));
        const endParagraph = Math.max(startParagraph, Math.min(selection.endParagraph, paragraphs.length - 1));
        const parts = [];
        for (let index = startParagraph; index <= endParagraph; index += 1) {
            const paragraph = String(paragraphs[index] || "");
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
        const text = String(paragraphs[safeIndex] || "");
        return {
            startParagraph: safeIndex,
            endParagraph: safeIndex,
            startOffset: 0,
            endOffset: text.length,
            text,
        };
    }

    function boundedSelection(paragraphs, maxCharacters) {
        const values = Array.isArray(paragraphs)
            ? paragraphs.map((value) => String(value || ""))
            : [];
        if (!values.length) return null;
        const firstIndex = Math.max(0, values.findIndex((value) => value.trim()));
        let endParagraph = firstIndex;
        let endOffset = Math.min(values[firstIndex].length, maxCharacters);
        let used = endOffset;
        while (endParagraph + 1 < values.length) {
            const nextLength = values[endParagraph + 1].length;
            if (used + 2 + nextLength > maxCharacters) break;
            used += 2 + nextLength;
            endParagraph += 1;
            endOffset = nextLength;
        }
        const selection = {
            startParagraph: firstIndex,
            endParagraph,
            startOffset: 0,
            endOffset,
        };
        selection.text = selectionText(values, selection);
        return selection;
    }

    function boundedSelectionFromParagraphModel(model, maxCharacters) {
        const values = Array.isArray(model?.paragraphs)
            ? model.paragraphs.map((value) => String(value || ""))
            : [];
        if (!values.length) return null;
        const firstIndex = Math.max(0, values.findIndex((value) => value.trim()));
        let endParagraph = firstIndex;
        let endOffset = Math.min(values[firstIndex].length, maxCharacters);
        let used = endOffset;
        while (endParagraph + 1 < values.length) {
            const separatorLength = String(model.separators?.[endParagraph] || "").length;
            const nextLength = values[endParagraph + 1].length;
            const available = maxCharacters - used - separatorLength;
            if (available < 0 || (available === 0 && nextLength > 0)) break;
            const take = Math.min(nextLength, Math.max(0, available));
            used += separatorLength + take;
            endParagraph += 1;
            endOffset = take;
            if (take < nextLength) break;
        }
        const selection = {
            startParagraph: firstIndex,
            endParagraph,
            startOffset: 0,
            endOffset,
        };
        selection.text = selectionTextFromParagraphModel(model, selection);
        return selection;
    }

    function normalizedChapterCursor(paragraphs, cursor) {
        const values = Array.isArray(paragraphs)
            ? paragraphs.map((value) => String(value || ""))
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
        const value = String(text || "");
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
        const whitespace = /\s+/g;
        if (!usefulCut) {
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

    function chapterPartSelection(paragraphs, cursor, maxCharacters) {
        const values = Array.isArray(paragraphs)
            ? paragraphs.map((value) => String(value || ""))
            : [];
        const limit = Math.max(1, Number(maxCharacters) || CHAPTER_PART_MAX_CHARACTERS);
        const start = normalizedChapterCursor(values, cursor);
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
            ? paragraphs.map((value) => String(value || ""))
            : [];
        if (!selection || !values.length) return null;
        const endParagraph = Math.max(0, Math.min(selection.endParagraph, values.length - 1));
        const endOffset = Math.max(0, Math.min(selection.endOffset, values[endParagraph].length));
        return normalizedChapterCursor(values, endOffset < values[endParagraph].length
            ? { paragraph: endParagraph, offset: endOffset }
            : { paragraph: endParagraph + 1, offset: 0 });
    }

    function exactReplacementParagraphs(replacement, selection) {
        const expectedCount = Math.max(
            1,
            (Number(selection?.endParagraph) || 0) - (Number(selection?.startParagraph) || 0) + 1
        );
        const values = String(replacement ?? "").replace(/\r\n?/g, "\n").split("\n\n");
        if (values.length !== expectedCount) {
            throw new Error("Muokattu teksti ei voi lisätä tai poistaa kappalerajoja.");
        }
        return values;
    }

    function cursorAfterReplacement(paragraphs, selection, replacement, preserveParagraphSlots) {
        const values = Array.isArray(paragraphs)
            ? paragraphs.map((value) => String(value || ""))
            : [];
        if (!selection || !values.length) return null;
        const startParagraph = Math.max(0, Math.min(selection.startParagraph, values.length - 1));
        const startOffset = Math.max(0, Math.min(selection.startOffset, values[startParagraph].length));
        const replacementParagraphs = preserveParagraphSlots
            ? exactReplacementParagraphs(replacement, selection)
            : paragraphModel(replacement).paragraphs;
        return {
            paragraph: startParagraph + replacementParagraphs.length - 1,
            offset: (replacementParagraphs.length === 1 ? startOffset : 0)
                + String(replacementParagraphs[replacementParagraphs.length - 1] || "").length,
        };
    }

    function countChapterParts(paragraphs, maxCharacters, startCursor) {
        let count = 0;
        let cursor = normalizedChapterCursor(
            paragraphs,
            startCursor || { paragraph: 0, offset: 0 }
        );
        const safetyLimit = Math.max(1, (Array.isArray(paragraphs) ? paragraphs.length : 0) * 2 + 10000);
        while (cursor && count < safetyLimit) {
            const selection = chapterPartSelection(paragraphs, cursor, maxCharacters);
            if (!selection) break;
            count += 1;
            cursor = cursorAfterSelection(paragraphs, selection);
            if (!cursor) break;
        }
        return count;
    }

    function firstUsefulSelection(paragraphs) {
        const index = Math.max(0, paragraphs.findIndex((paragraph) => String(paragraph || "").trim()));
        const selection = selectionForWholeParagraph(paragraphs, index);
        if (selection.text.length > MANUAL_SELECTION_MAX_CHARACTERS) {
            selection.endOffset = MANUAL_SELECTION_MAX_CHARACTERS;
            selection.text = selectionText(paragraphs, selection);
        }
        return selection;
    }

    function applyReplacement(paragraphs, selection, replacement, preserveParagraphSlots) {
        const source = paragraphs.map((paragraph) => String(paragraph || ""));
        if (!selection || !source.length) return source;
        const startParagraph = Math.max(0, Math.min(selection.startParagraph, source.length - 1));
        const endParagraph = Math.max(startParagraph, Math.min(selection.endParagraph, source.length - 1));
        const startOffset = Math.max(0, Math.min(selection.startOffset, source[startParagraph].length));
        const endOffset = Math.max(0, Math.min(selection.endOffset, source[endParagraph].length));
        const prefix = source[startParagraph].slice(0, startOffset);
        const suffix = source[endParagraph].slice(endOffset);
        const replacements = preserveParagraphSlots
            ? exactReplacementParagraphs(replacement, selection)
            : paragraphModel(replacement).paragraphs;
        replacements[0] = prefix + replacements[0];
        replacements[replacements.length - 1] += suffix;
        source.splice(startParagraph, endParagraph - startParagraph + 1, ...replacements);
        return source;
    }

    function replacementWithBoundaryWhitespace(original, replacement) {
        const source = String(original || "");
        let result = String(replacement || "");
        const leading = source.match(/^[ \t]+/)?.[0] || "";
        const trailing = source.match(/[ \t]+$/)?.[0] || "";
        if (leading && !/^[ \t]/.test(result)) result = leading + result;
        if (trailing && !/[ \t]$/.test(result)) result += trailing;
        return result;
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
        const paragraph = element?.closest?.("[data-ti-paragraph]") || null;
        return paragraph && reader.contains(paragraph) ? paragraph : null;
    }

    function selectionFromReader(reader, paragraphs) {
        const browserSelection = window.getSelection();
        if (!browserSelection || !browserSelection.rangeCount || browserSelection.isCollapsed) return null;
        const range = browserSelection.getRangeAt(0);
        const startElement = paragraphElementForNode(range.startContainer, reader);
        const endElement = paragraphElementForNode(range.endContainer, reader);
        if (!startElement || !endElement) return null;
        const startParagraph = Number(startElement.dataset.tiParagraph);
        const endParagraph = Number(endElement.dataset.tiParagraph);
        if (!Number.isInteger(startParagraph) || !Number.isInteger(endParagraph)) return null;
        const startOffset = textOffsetInside(startElement, range.startContainer, range.startOffset);
        const endOffset = textOffsetInside(endElement, range.endContainer, range.endOffset);
        const normalized = {
            startParagraph,
            endParagraph,
            startOffset,
            endOffset,
        };
        normalized.text = selectionText(paragraphs, normalized);
        return normalized.text ? normalized : null;
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

    function renderParagraphs(reader, paragraphs, selection, options) {
        const settings = options || {};
        const previousScroll = settings.keepScroll ? reader.scrollTop : 0;
        reader.replaceChildren();
        paragraphs.forEach((value, index) => {
            const text = String(value || "");
            const paragraph = document.createElement("p");
            paragraph.dataset.tiParagraph = String(index);
            const selected = selection
                && index >= selection.startParagraph
                && index <= selection.endParagraph;
            if (settings.selectable) {
                paragraph.tabIndex = selected && index === selection.startParagraph ? 0 : -1;
                paragraph.setAttribute("role", "button");
                paragraph.setAttribute("aria-pressed", selected ? "true" : "false");
                paragraph.title = "Valitse kappale " + (index + 1) + " parannettavaksi. Nuolinäppäimet vaihtavat kappaletta.";
            }
            if (settings.numbered) {
                paragraph.dataset.lineNumber = settings.numberPrefix
                    ? settings.numberPrefix + (paragraphs.length > 1 ? "." + (index + 1) : "")
                    : String(index + 1);
            }
            if (settings.linked) paragraph.classList.add("ti-source-linked");
            if (selected) {
                paragraph.classList.add("is-selected");
                const start = index === selection.startParagraph ? selection.startOffset : 0;
                const end = index === selection.endParagraph ? selection.endOffset : text.length;
                appendHighlightedText(paragraph, text, start, end);
            } else {
                paragraph.textContent = text || " ";
            }
            reader.appendChild(paragraph);
        });
        if (settings.keepScroll) reader.scrollTop = previousScroll;
        else reader.scrollTop = 0;
    }

    function renderReaderMessage(reader, title, detail) {
        reader.replaceChildren();
        const box = document.createElement("div");
        box.className = "ti-reader-message";
        const heading = document.createElement("h3");
        heading.textContent = title;
        const paragraph = document.createElement("p");
        paragraph.textContent = detail;
        box.append(heading, paragraph);
        reader.appendChild(box);
    }

    function normalParagraphs() {
        return (currentChapter()?.paragraphs || []).map((paragraph) => String(paragraph || ""));
    }

    function translationParagraphs() {
        return paragraphModel(translationTextForChunk(currentChunk())).paragraphs;
    }

    function currentSelection() {
        return state.mode === "translation" ? state.translationSelection : state.normalSelection;
    }

    function clearSuggestion() {
        state.suggestion = null;
    }

    function keepOpenSuggestionForReview() {
        if (!state.suggestion) return false;
        toast("Hyväksy tai hylkää avoin ehdotus ennen tekstin, luvun tai välilehden vaihtamista.");
        window.requestAnimationFrame(() => $("ti-suggestion-text")?.focus({ preventScroll: true }));
        return true;
    }

    function cancelChapterRun() {
        state.chapterRunRevision += 1;
        state.chapterRun = null;
    }

    function currentChapterRun() {
        const run = state.chapterRun;
        if (!run || state.mode !== "normal") return null;
        if (
            String(run.projectId || "") !== String(state.project?.id || "")
            || run.chapterIndex !== state.chapterIndex
        ) return null;
        return run;
    }

    function paragraphSnapshotsMatch(left, right) {
        const first = Array.isArray(left) ? left.map((value) => String(value || "")) : [];
        const second = Array.isArray(right) ? right.map((value) => String(value || "")) : [];
        return first.length === second.length
            && first.every((paragraph, index) => paragraph === second[index]);
    }

    function chapterHasImprovementText() {
        return state.mode === "normal"
            && normalParagraphs().some((paragraph) => paragraph.trim());
    }

    function updateChapterProgressBar(run) {
        const progressbar = $("ti-chapter-progressbar");
        const fill = progressbar.querySelector("span");
        const maximum = Math.max(1, Number(run?.totalParts) || 1);
        const completed = run?.status === "complete"
            ? maximum
            : Math.max(0, Math.min(maximum, (Number(run?.partNumber) || 1) - 1));
        progressbar.setAttribute("aria-valuemax", String(maximum));
        progressbar.setAttribute("aria-valuenow", String(completed));
        progressbar.setAttribute(
            "aria-valuetext",
            run
                ? (run.status === "complete"
                    ? "Luku käsitelty"
                    : completed + " / " + maximum + " osaa käsitelty")
                : "Ei aloitettu"
        );
        fill.style.width = ((completed / maximum) * 100) + "%";
    }

    function renderChapterControls() {
        const controls = $("ti-chapter-controls");
        const button = $("ti-chapter-generate");
        const progress = $("ti-chapter-progress");
        const available = state.mode === "normal" && Boolean(currentChapter());
        controls.hidden = !available;
        if (!available) {
            updateChapterProgressBar(null);
            return;
        }

        const run = currentChapterRun();
        updateChapterProgressBar(run);
        if (!run) {
            if (!chapterHasImprovementText()) {
                button.textContent = "Luvussa ei ole tekstiä";
                progress.textContent = "Valittu luku on tyhjä, joten sille ei voi luoda parannusehdotusta.";
                return;
            }
            button.textContent = "Paranna koko luku";
            progress.textContent = "Lyhyt luku käsitellään kerralla. Yli 12 000 merkin luku jaetaan kappalerajoilla osiin.";
            return;
        }
        if (run.status === "complete") {
            button.textContent = "Paranna luku uudelleen";
            progress.textContent = run.totalParts === 1
                ? "Luku on käsitelty."
                : "Luvun kaikki " + run.totalParts + " osaa on käsitelty.";
            return;
        }
        if (run.status === "review") {
            button.textContent = "Käsittele ehdotus ensin";
            progress.textContent = "Luvun osa " + run.partNumber + " / " + run.totalParts + " odottaa hyväksyntää tai hylkäystä.";
            return;
        }
        if (run.status === "requesting") {
            button.textContent = "Luodaan osaa " + run.partNumber + " / " + run.totalParts;
            progress.textContent = "Luvun osan " + run.partNumber + " / " + run.totalParts + " ehdotusta valmistellaan.";
            return;
        }
        button.textContent = run.partNumber === 1
            ? "Yritä osaa 1 uudelleen"
            : "Jatka osaan " + run.partNumber;
        progress.textContent = "Luvun osa " + run.partNumber + " / " + run.totalParts + " on valmis paranneltavaksi.";
    }

    function updateActionStates() {
        const selection = currentSelection();
        const hasSelection = Boolean(selection?.text?.trim());
        const chapterRun = currentChapterRun();
        const reviewing = Boolean(state.suggestion);
        $("ti-generate").disabled = state.busy
            || !hasSelection
            || reviewing
            || chapterRun?.status === "requesting"
            || chapterRun?.status === "review";
        $("ti-chapter-generate").disabled = state.busy
            || state.mode !== "normal"
            || !currentChapter()
            || !chapterHasImprovementText()
            || Boolean(state.suggestion)
            || chapterRun?.status === "requesting"
            || chapterRun?.status === "review";
        $("ti-previous").disabled = state.busy || reviewing || !canMove(-1);
        $("ti-next").disabled = state.busy || reviewing || !canMove(1);
        $("ti-project-select").disabled = state.busy || reviewing;
        $("ti-translation-project-select").disabled = state.busy || reviewing || !state.canUseTranslations;
        $("ti-translation-select").disabled = state.busy || reviewing || !state.canUseTranslations || !state.translations.length;
        document.querySelectorAll("[data-ti-mode]").forEach((button) => {
            button.disabled = state.busy
                || reviewing
                || (button.dataset.tiMode === "translation" && !state.canUseTranslations);
        });
        $("ti-import-button").disabled = state.busy || reviewing;
        $("ti-bilingual-button").disabled = state.busy || reviewing || !state.canImportBilingual;
        $("ti-empty-bilingual-button").disabled = state.busy || reviewing || !state.canImportBilingual;
        const editedSuggestion = state.suggestion ? $("ti-suggestion-text").value.trim() : "";
        $("ti-accept").disabled = state.busy || !state.suggestion || !editedSuggestion;
        $("ti-reject").disabled = state.busy || !state.suggestion;
        updateKeyboardSelectionStatus();
    }

    function keyboardSelectionParagraph() {
        const selection = currentSelection();
        const paragraphs = state.mode === "translation" ? translationParagraphs() : normalParagraphs();
        if (!selection || !paragraphs.length) return null;
        const paragraphIndex = Math.max(0, Math.min(selection.startParagraph, paragraphs.length - 1));
        return {
            mode: state.mode,
            paragraphIndex,
            text: String(paragraphs[paragraphIndex] || ""),
            selection,
        };
    }

    function keyboardSelectionLength() {
        const textarea = $("ti-keyboard-selection-text");
        if (textarea.disabled) return 0;
        return Math.max(0, textarea.selectionEnd - textarea.selectionStart);
    }

    function updateKeyboardSelectionStatus() {
        const textarea = $("ti-keyboard-selection-text");
        const button = $("ti-use-keyboard-selection");
        const status = $("ti-keyboard-selection-status");
        const length = keyboardSelectionLength();
        button.disabled = state.busy
            || Boolean(state.suggestion)
            || textarea.disabled
            || length < 1
            || length > MANUAL_SELECTION_MAX_CHARACTERS;
        if (textarea.disabled) {
            status.textContent = "Valitse ensin kappale tekstistä.";
        } else if (!length) {
            status.textContent = "Ei tarkkaa valintaa. Valitse sana tai virke Vaihto + nuolinäppäimillä.";
        } else if (length > MANUAL_SELECTION_MAX_CHARACTERS) {
            status.textContent = "Valinta on " + length + " merkkiä. Enimmäispituus on 12 000 merkkiä.";
        } else {
            const chosen = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
            status.textContent = wordCount(chosen) + " sanaa ja " + length + " merkkiä valmiina käyttöön.";
        }
    }

    function renderKeyboardSelection() {
        const textarea = $("ti-keyboard-selection-text");
        const active = keyboardSelectionParagraph();
        if (!active || !active.text) {
            textarea.value = "";
            textarea.disabled = true;
            delete textarea.dataset.tiMode;
            delete textarea.dataset.tiParagraph;
            updateKeyboardSelectionStatus();
            return;
        }
        textarea.disabled = false;
        textarea.value = active.text;
        textarea.dataset.tiMode = active.mode;
        textarea.dataset.tiParagraph = String(active.paragraphIndex);
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

    function renderInspector() {
        const selection = currentSelection();
        const isTranslation = state.mode === "translation";
        const chapterRun = currentChapterRun();
        const chapterSuggestion = state.suggestion?.chapterRun;
        $("ti-inspector-title").textContent = isTranslation
            ? "Paranna valittua käännöstä"
            : (chapterSuggestion
                ? "Luvun osa " + chapterSuggestion.partNumber + " / " + chapterSuggestion.totalParts
                : "Paranna valittua kohtaa");
        $("ti-instructions").placeholder = isTranslation
            ? "Esim. tee suomesta luontevampaa säilyttäen merkitys ja sävy"
            : "Esim. tiivistä, kirkasta rytmiä tai säilytä puhekielinen ääni";
        $("ti-selection-help").textContent = selection?.text
            ? (chapterRun
                ? wordCount(selection.text) + " sanaa luvun osassa " + chapterRun.partNumber + " / " + chapterRun.totalParts + "."
                : wordCount(selection.text) + " sanaa valittuna. Voit maalata tai rajata näppäimistöllä lyhyemmän kohdan.")
            : (isTranslation
                ? "Valitse bilingual ja parannettava käännöskohta."
                : "Valitse tekstistä sana, virke tai kappale.");
        $("ti-original-label").textContent = isTranslation ? "Nykyinen käännös" : "Alkuperäinen";
        $("ti-reason-label").textContent = isTranslation ? "Vertailu alkutekstiin" : "Miksi tämä toimii";

        const hasSuggestion = Boolean(state.suggestion);
        $("ti-suggestion-empty").hidden = hasSuggestion;
        $("ti-suggestion").hidden = !hasSuggestion;
        $("ti-inspector-actions").hidden = !hasSuggestion;
        if (hasSuggestion) {
            $("ti-original").textContent = state.suggestion.original;
            $("ti-suggestion-text").value = state.suggestion.edited;
            $("ti-reason").textContent = state.suggestion.reason
                || "Ehdotus noudattaa antamaasi lisäohjetta ja säilyttää kohdan merkityksen.";
        }
        renderChapterControls();
        renderKeyboardSelection();
        updateActionStates();
    }

    function renderNormal() {
        const project = state.project;
        const chapters = Array.isArray(project?.chapters) ? project.chapters : [];
        const chapter = currentChapter();
        if (!project || !chapter) {
            renderReaderMessage(
                $("ti-normal-reader"),
                "Valitse parannettava käsikirjoitus",
                "Voit käyttää olemassa olevaa tekstiä tai tuoda uuden tiedoston."
            );
            $("ti-unit-title").textContent = "Ei valittua tekstiä";
            $("ti-unit-position").textContent = "0 / 0";
            $("ti-word-count").textContent = "0 sanaa";
            state.normalSelection = null;
            return;
        }

        const paragraphs = normalParagraphs();
        if (!state.normalSelection || !selectionText(paragraphs, state.normalSelection)) {
            state.normalSelection = firstUsefulSelection(paragraphs);
        } else {
            state.normalSelection.text = selectionText(paragraphs, state.normalSelection);
        }
        renderParagraphs($("ti-normal-reader"), paragraphs, state.normalSelection, { selectable: true });
        $("ti-unit-title").textContent = chapterTitle(chapter, state.chapterIndex);
        $("ti-unit-position").textContent = "Luku " + (state.chapterIndex + 1) + " / " + chapters.length;
        $("ti-word-count").textContent = wordCount(paragraphs.join(" ")) + " sanaa";
    }

    function chunkLocationTitle(chunk) {
        const location = chunk?.book_location && typeof chunk.book_location === "object"
            ? chunk.book_location
            : {};
        return String(
            location.chapter_title
            || location.title
            || location.primary_chapter?.title
            || location.chapter_span
            || chunk?.chapter_title
            || "Käännössegmentti " + (state.segmentIndex + 1)
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

    function renderTranslation() {
        const chunks = translationChunks(state.translation);
        const hasAlignedTranslation = Boolean(state.translation && chunks.length);
        $("ti-translation-empty").hidden = hasAlignedTranslation;
        if (!hasAlignedTranslation) {
            $("ti-source-reader").replaceChildren();
            $("ti-target-reader").replaceChildren();
            $("ti-unit-title").textContent = "Ei bilingual-aineistoa";
            $("ti-unit-position").textContent = "0 / 0";
            state.translationSelection = null;
            return;
        }

        state.segmentIndex = Math.max(0, Math.min(state.segmentIndex, chunks.length - 1));
        const chunk = chunks[state.segmentIndex];
        const sourceParagraphs = splitParagraphs(sourceTextForChunk(chunk));
        const targetModel = paragraphModel(translationTextForChunk(chunk));
        const targetParagraphs = targetModel.paragraphs;
        if (!state.translationSelection || !selectionTextFromParagraphModel(targetModel, state.translationSelection).trim()) {
            state.translationSelection = boundedSelectionFromParagraphModel(targetModel, MANUAL_SELECTION_MAX_CHARACTERS);
        } else {
            state.translationSelection.text = selectionTextFromParagraphModel(targetModel, state.translationSelection);
        }
        const segmentNumber = String(state.segmentIndex + 1);
        renderParagraphs($("ti-source-reader"), sourceParagraphs, null, {
            numbered: true,
            numberPrefix: segmentNumber,
            linked: Boolean(state.translationSelection),
        });
        renderParagraphs($("ti-target-reader"), targetParagraphs, state.translationSelection, {
            numbered: true,
            numberPrefix: segmentNumber,
            selectable: true,
        });
        $("ti-unit-title").textContent = chunkLocationTitle(chunk);
        $("ti-unit-position").textContent = "Segmentti " + (state.segmentIndex + 1) + " / " + chunks.length;

        const sourceLanguage = state.project?.analysis?.source_language
            || state.project?.analysis?.bilingual_import?.source_language
            || "auto";
        const targetLanguage = state.translation?.target_language || "fi";
        const sourceLabel = languageLabel(sourceLanguage, "alkukieli");
        const targetLabel = languageLabel(targetLanguage, state.translation?.target_language_label || "kohdekieli");
        $("ti-language-direction").textContent = sourceLabel + " → " + targetLabel;
        $("ti-source-label").textContent = sourceLabel;
        $("ti-target-label").textContent = targetLabel;
    }

    function renderMode() {
        const isTranslation = state.mode === "translation";
        $("ti-normal-toolbar").hidden = isTranslation;
        $("ti-translation-toolbar").hidden = !isTranslation;
        $("ti-normal-docs").hidden = isTranslation;
        $("ti-translation-docs").hidden = !isTranslation;
        $("ti-editor-grid").dataset.mode = state.mode;
        document.querySelectorAll("[data-ti-mode]").forEach((button) => {
            const active = button.dataset.tiMode === state.mode;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-selected", String(active));
            button.tabIndex = active ? 0 : -1;
        });
        if (isTranslation) renderTranslation();
        else renderNormal();
        renderInspector();
    }

    function renderProjectHeader() {
        $("ti-project-name").textContent = state.project
            ? (state.project.title || "Nimetön käsikirjoitus") + " · " + (state.project.author || "Tuntematon")
            : "Valitse käsikirjoitus tai tuo tiedosto.";
        $("ti-project-select").value = state.project?.id ? String(state.project.id) : "";
        $("ti-translation-project-select").value = state.project?.id ? String(state.project.id) : "";
    }

    function renderAll() {
        renderProjectHeader();
        renderMode();
    }

    function populateProjectSelect() {
        [$("ti-project-select"), $("ti-translation-project-select")].forEach((select) => {
            const previous = state.project?.id ? String(state.project.id) : select.value;
            select.replaceChildren();
            const placeholder = document.createElement("option");
            placeholder.value = "";
            placeholder.textContent = "Vaihda tekstiä";
            select.appendChild(placeholder);
            state.projects.forEach((project) => {
                const option = document.createElement("option");
                option.value = String(project.id);
                option.textContent = project.title || "Nimetön käsikirjoitus";
                select.appendChild(option);
            });
            if (previous && state.projects.some((project) => String(project.id) === previous)) {
                select.value = previous;
            }
        });
    }

    function populateTranslationSelect() {
        const select = $("ti-translation-select");
        const previous = state.translation?.id ? String(state.translation.id) : "";
        select.replaceChildren();
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = state.translations.length ? "Vaihda käännöstä" : "Ei tallennettuja käännöksiä";
        select.appendChild(placeholder);
        state.translations.forEach((translation) => {
            const option = document.createElement("option");
            option.value = String(translation.id);
            const target = translation.target_language_label || languageLabel(translation.target_language, "kohdekieli");
            option.textContent = (state.project?.title || "Käännös") + " · " + target;
            select.appendChild(option);
        });
        if (previous && state.translations.some((translation) => String(translation.id) === previous)) {
            select.value = previous;
        } else if (state.translation?.id) {
            select.value = String(state.translation.id);
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

    async function refreshProjects() {
        const projects = await api("/projects?summary=true");
        state.projects = Array.isArray(projects) ? projects : [];
        populateProjectSelect();
    }

    async function loadTranslations(preferredId) {
        const requestRevision = ++state.translationLoadRevision;
        const requestedProjectId = String(state.project?.id || "");
        state.translations = [];
        state.translation = null;
        state.segmentIndex = 0;
        state.translationSelection = null;
        populateTranslationSelect();
        if (!requestedProjectId) {
            renderMode();
            return;
        }
        try {
            const items = await api("/projects/" + encodeURIComponent(requestedProjectId) + "/translations");
            if (
                requestRevision !== state.translationLoadRevision
                || String(state.project?.id || "") !== requestedProjectId
            ) return;
            state.translations = (Array.isArray(items) ? items : []).filter((item) => item?.id);
            const wanted = String(preferredId || "");
            state.translation = state.translations.find((item) => String(item.id) === wanted)
                || state.translations.find((item) => translationChunks(item).length)
                || state.translations[0]
                || null;
            populateTranslationSelect();
            renderMode();
        } catch (error) {
            if (
                requestRevision !== state.translationLoadRevision
                || String(state.project?.id || "") !== requestedProjectId
            ) return;
            populateTranslationSelect();
            renderMode();
            setStatus("Käännöksiä ei voitu avata");
            if (state.mode === "translation") toast(error.message);
        }
    }

    async function loadProject(projectId, options) {
        const settings = options || {};
        const requestRevision = ++state.projectLoadRevision;
        cancelChapterRun();
        if (!projectId) {
            state.translationLoadRevision += 1;
            state.project = null;
            state.normalSelection = null;
            state.translations = [];
            state.translation = null;
            clearSuggestion();
            renderAll();
            if (state.busy) setBusy(false);
            return;
        }
        setBusy(true, "Avataan käsikirjoitusta…");
        try {
            const project = await api("/projects/" + encodeURIComponent(projectId));
            if (requestRevision !== state.projectLoadRevision) return;
            rememberProject(project, Boolean(settings.notifyParent));
            state.chapterIndex = 0;
            state.normalSelection = null;
            state.segmentIndex = 0;
            state.translationSelection = null;
            clearSuggestion();
            renderAll();
            if (state.canUseTranslations) await loadTranslations(settings.translationId);
            else {
                state.translations = [];
                state.translation = null;
                populateTranslationSelect();
            }
            if (requestRevision !== state.projectLoadRevision) return;
            setStatus("Valmis");
        } catch (error) {
            if (requestRevision !== state.projectLoadRevision) return;
            setStatus("Käsikirjoituksen avaaminen epäonnistui");
            toast(error.message);
        } finally {
            if (requestRevision === state.projectLoadRevision) setBusy(false);
        }
    }

    async function chooseTranslation(translationId) {
        const requestRevision = ++state.translationLoadRevision;
        const requestedProjectId = String(state.project?.id || "");
        if (!translationId) {
            state.translation = null;
            state.translationSelection = null;
            state.segmentIndex = 0;
            clearSuggestion();
            renderMode();
            return;
        }
        setBusy(true, "Avataan bilingual-aineistoa…");
        try {
            let translation = state.translations.find((item) => String(item.id) === String(translationId));
            if (!translation || !translationChunks(translation).length) {
                translation = await api("/translations/" + encodeURIComponent(translationId));
            }
            if (
                requestRevision !== state.translationLoadRevision
                || String(state.project?.id || "") !== requestedProjectId
            ) return;
            state.translation = translation;
            const index = state.translations.findIndex((item) => String(item.id) === String(translation.id));
            if (index >= 0) state.translations[index] = translation;
            else state.translations.unshift(translation);
            state.segmentIndex = 0;
            state.translationSelection = null;
            clearSuggestion();
            populateTranslationSelect();
            renderMode();
            setStatus("Valmis");
        } catch (error) {
            if (
                requestRevision !== state.translationLoadRevision
                || String(state.project?.id || "") !== requestedProjectId
            ) return;
            setStatus("Käännöksen avaaminen epäonnistui");
            toast(error.message);
        } finally {
            if (
                requestRevision === state.translationLoadRevision
                && String(state.project?.id || "") === requestedProjectId
            ) setBusy(false);
        }
    }

    async function setMode(mode, focusTab) {
        const next = mode === "translation" ? "translation" : "normal";
        if (next === "translation" && !state.canUseTranslations) {
            toast("Käännöksen parantelu vaatii käännöstyötilan käyttöoikeuden.");
            return;
        }
        if (state.mode !== next && keepOpenSuggestionForReview()) return;
        if (state.mode !== next) cancelChapterRun();
        state.mode = next;
        localStorage.setItem(MODE_KEY, next);
        clearSuggestion();
        renderMode();
        if (next === "translation" && state.project && !state.translations.length) {
            if (state.canUseTranslations) {
                const showLoading = !state.busy;
                const projectRevision = state.projectLoadRevision;
                const expectedTranslationRevision = state.translationLoadRevision + 1;
                if (showLoading) setBusy(true, "Avataan bilingual-aineistoa…");
                try {
                    await loadTranslations();
                } finally {
                    if (
                        showLoading
                        && projectRevision === state.projectLoadRevision
                        && expectedTranslationRevision === state.translationLoadRevision
                    ) setBusy(false);
                }
            }
        }
        if (focusTab) $(next === "translation" ? "ti-tab-translation" : "ti-tab-normal").focus();
    }

    function canMove(direction) {
        if (state.mode === "translation") {
            const count = translationChunks(state.translation).length;
            return direction < 0 ? state.segmentIndex > 0 : state.segmentIndex < count - 1;
        }
        const count = state.project?.chapters?.length || 0;
        return direction < 0 ? state.chapterIndex > 0 : state.chapterIndex < count - 1;
    }

    function moveUnit(direction) {
        if (!canMove(direction)) return;
        if (keepOpenSuggestionForReview()) return;
        cancelChapterRun();
        clearSuggestion();
        if (state.mode === "translation") {
            state.segmentIndex += direction;
            state.translationSelection = null;
        } else {
            state.chapterIndex += direction;
            state.normalSelection = null;
            if (state.project?.id) {
                localStorage.setItem(
                    "skriptlab_text_improvement_chapter_" + state.project.id,
                    String(state.chapterIndex)
                );
            }
        }
        renderMode();
    }

    function handleReaderSelection(mode, event) {
        if (keepOpenSuggestionForReview()) return;
        const reader = mode === "translation" ? $("ti-target-reader") : $("ti-normal-reader");
        const paragraphs = mode === "translation" ? translationParagraphs() : normalParagraphs();
        let nextSelection = selectionFromReader(reader, paragraphs);
        if (!nextSelection && event?.type === "pointerup") {
            const paragraph = event.target?.closest?.("[data-ti-paragraph]");
            if (paragraph && reader.contains(paragraph)) {
                nextSelection = selectionForWholeParagraph(paragraphs, Number(paragraph.dataset.tiParagraph));
            }
        }
        if (mode === "translation" && nextSelection) {
            nextSelection.text = selectionTextFromParagraphModel(
                paragraphModel(translationTextForChunk(currentChunk())),
                nextSelection
            );
        }
        if (!nextSelection?.text) return;
        if (nextSelection.text.length > MANUAL_SELECTION_MAX_CHARACTERS) {
            toast("Valitse enintään 12 000 merkkiä kerrallaan.");
            return;
        }
        cancelChapterRun();
        if (mode === "translation") state.translationSelection = nextSelection;
        else state.normalSelection = nextSelection;
        clearSuggestion();
        const scrollTop = reader.scrollTop;
        renderMode();
        reader.scrollTop = scrollTop;
        window.getSelection()?.removeAllRanges();
    }

    function handleReaderKeyboardSelection(mode, event) {
        if (!event || !["Enter", " ", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        if (keepOpenSuggestionForReview()) {
            event.preventDefault();
            return;
        }
        const reader = mode === "translation" ? $("ti-target-reader") : $("ti-normal-reader");
        const paragraph = event.target?.closest?.("[data-ti-paragraph]");
        if (!paragraph || !reader.contains(paragraph)) return;
        event.preventDefault();
        const paragraphs = mode === "translation" ? translationParagraphs() : normalParagraphs();
        const currentIndex = Number(paragraph.dataset.tiParagraph);
        let nextIndex = currentIndex;
        if (event.key === "ArrowUp") nextIndex = Math.max(0, currentIndex - 1);
        if (event.key === "ArrowDown") nextIndex = Math.min(paragraphs.length - 1, currentIndex + 1);
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = paragraphs.length - 1;
        const selection = selectionForWholeParagraph(
            paragraphs,
            nextIndex
        );
        if (mode === "translation") {
            selection.text = selectionTextFromParagraphModel(
                paragraphModel(translationTextForChunk(currentChunk())),
                selection
            );
        }
        if (selection.text.length > MANUAL_SELECTION_MAX_CHARACTERS) {
            selection.endOffset = selection.startOffset + MANUAL_SELECTION_MAX_CHARACTERS;
            selection.text = selectionText(paragraphs, selection);
            toast("Kappaleesta valittiin ensimmäiset 12 000 merkkiä.");
        }
        cancelChapterRun();
        if (mode === "translation") state.translationSelection = selection;
        else state.normalSelection = selection;
        clearSuggestion();
        renderMode();
        reader.querySelector(`[data-ti-paragraph="${selection.startParagraph}"]`)?.focus();
    }

    function applyKeyboardSelection() {
        if (keepOpenSuggestionForReview()) return;
        const textarea = $("ti-keyboard-selection-text");
        const mode = textarea.dataset.tiMode;
        const paragraphIndex = Number(textarea.dataset.tiParagraph);
        const startOffset = textarea.selectionStart;
        const endOffset = textarea.selectionEnd;
        if (mode !== state.mode || !Number.isInteger(paragraphIndex) || endOffset <= startOffset) {
            updateKeyboardSelectionStatus();
            toast("Valitse tekstikentästä ensin sana tai virke.");
            return;
        }
        const paragraphs = mode === "translation" ? translationParagraphs() : normalParagraphs();
        const selection = {
            startParagraph: paragraphIndex,
            endParagraph: paragraphIndex,
            startOffset,
            endOffset,
        };
        if (mode === "translation") {
            selection.text = selectionTextFromParagraphModel(
                paragraphModel(translationTextForChunk(currentChunk())),
                selection
            );
        } else {
            selection.text = selectionText(paragraphs, selection);
        }
        if (!selection.text || selection.text.length > MANUAL_SELECTION_MAX_CHARACTERS) {
            updateKeyboardSelectionStatus();
            toast(selection.text ? "Valitse enintään 12 000 merkkiä kerrallaan." : "Valitse tekstikentästä ensin sana tai virke.");
            return;
        }
        cancelChapterRun();
        if (mode === "translation") state.translationSelection = selection;
        else state.normalSelection = selection;
        clearSuggestion();
        renderMode();
        const updatedTextarea = $("ti-keyboard-selection-text");
        updatedTextarea.focus({ preventScroll: true });
        updatedTextarea.setSelectionRange(startOffset, endOffset);
        setStatus("Tarkka tekstikohta valittu");
    }

    function contextForNormalSelection() {
        return contextAroundSelection(
            paragraphModelFromParagraphs(normalParagraphs()),
            state.normalSelection,
            3000
        );
    }

    function contextForTranslationSelection() {
        return contextAroundSelection(
            paragraphModel(translationTextForChunk(currentChunk())),
            state.translationSelection,
            3000
        );
    }

    function revealNormalSelection(selection) {
        if (!selection) return;
        window.requestAnimationFrame(() => {
            $("ti-normal-reader")
                .querySelector(`[data-ti-paragraph="${selection.startParagraph}"]`)
                ?.scrollIntoView({ block: "center", behavior: "auto" });
        });
    }

    function advanceChapterRun(suggestion, paragraphs, nextCursor) {
        const run = currentChapterRun();
        if (!suggestion?.chapterRun || !run || run.id !== suggestion.chapterRun.id) {
            return { inRun: false, hasMore: false };
        }
        const normalizedCursor = normalizedChapterCursor(paragraphs, nextCursor);
        const nextSelection = chapterPartSelection(
            paragraphs,
            normalizedCursor,
            CHAPTER_PART_MAX_CHARACTERS
        );
        if (!normalizedCursor || !nextSelection) {
            run.status = "complete";
            run.nextCursor = null;
            run.totalParts = suggestion.chapterRun.partNumber;
            run.partNumber = suggestion.chapterRun.partNumber;
            return { inRun: true, hasMore: false };
        }
        run.nextCursor = normalizedCursor;
        run.partNumber = suggestion.chapterRun.partNumber + 1;
        run.totalParts = (run.partNumber - 1) + countChapterParts(
            paragraphs,
            CHAPTER_PART_MAX_CHARACTERS,
            normalizedCursor
        );
        run.status = "ready";
        state.normalSelection = nextSelection;
        return { inRun: true, hasMore: true };
    }

    async function generateNextChapterSuggestion() {
        if (state.mode !== "normal" || !state.project?.id || !currentChapter()) {
            toast("Valitse ensin paranneltava luku.");
            return;
        }

        let run = currentChapterRun();
        if (!run || run.status === "complete") {
            cancelChapterRun();
            const paragraphs = normalParagraphs();
            const totalParts = countChapterParts(paragraphs, CHAPTER_PART_MAX_CHARACTERS);
            const nextCursor = normalizedChapterCursor(paragraphs, { paragraph: 0, offset: 0 });
            if (!totalParts || !nextCursor) {
                renderInspector();
                toast("Luvussa ei ole paranneltavaa tekstiä.");
                return;
            }
            run = {
                id: ++state.chapterRunRevision,
                projectId: state.project.id,
                chapterIndex: state.chapterIndex,
                partNumber: 1,
                totalParts,
                nextCursor,
                status: "ready",
            };
            state.chapterRun = run;
        }
        if (run.status === "review") {
            toast("Hyväksy tai hylkää nykyinen ehdotus ennen jatkamista.");
            return;
        }

        const runId = run.id;
        run.status = "requesting";
        renderInspector();
        setStatus("Tarkistetaan luvun ajantasaisuutta");
        let latest;
        try {
            latest = await api("/projects/" + encodeURIComponent(state.project.id));
        } catch (error) {
            const activeRun = currentChapterRun();
            if (activeRun?.id === runId) activeRun.status = "ready";
            renderInspector();
            setStatus("Luvun tarkistus epäonnistui");
            toast(error.message);
            return;
        }
        const activeRun = currentChapterRun();
        if (!activeRun || activeRun.id !== runId || activeRun.status !== "requesting") return;
        const latestChapter = latest?.chapters?.[run.chapterIndex];
        if (!latestChapter) {
            cancelChapterRun();
            renderAll();
            setStatus("Lukua ei enää löytynyt");
            toast("Valittua lukua ei enää löytynyt. Valitse paranneltava luku uudelleen.");
            return;
        }
        const paragraphs = (latestChapter.paragraphs || []).map((paragraph) => String(paragraph || ""));
        if (!paragraphSnapshotsMatch(normalParagraphs(), paragraphs)) {
            rememberProject(latest, false);
            state.chapterIndex = Math.min(run.chapterIndex, (latest.chapters || []).length - 1);
            state.normalSelection = null;
            cancelChapterRun();
            clearSuggestion();
            renderAll();
            setStatus("Luku muuttui · aloita luvun parantelu uudelleen");
            toast("Luku muuttui toisessa näkymässä. Päivitetty teksti ladattiin; aloita luvun parantelu uudelleen.");
            return;
        }
        rememberProject(latest, false);
        const selection = chapterPartSelection(
            paragraphs,
            run.nextCursor,
            CHAPTER_PART_MAX_CHARACTERS
        );
        if (!selection) {
            run.status = "complete";
            run.nextCursor = null;
            renderInspector();
            return;
        }
        state.normalSelection = selection;
        clearSuggestion();
        renderMode();
        revealNormalSelection(selection);
        await generateSuggestion({
            chapterRun: {
                id: run.id,
                partNumber: run.partNumber,
                totalParts: run.totalParts,
            },
        });
    }

    async function generateSuggestion(options) {
        const chapterRunRequest = options?.chapterRun || null;
        if (state.suggestion) {
            keepOpenSuggestionForReview();
            return;
        }
        if (state.busy) return;
        const activeChapterRun = currentChapterRun();
        if (!chapterRunRequest && activeChapterRun?.status === "requesting") {
            toast("Odota, että luvun osan ehdotus valmistuu.");
            return;
        }
        if (!chapterRunRequest && activeChapterRun) cancelChapterRun();
        const selection = currentSelection();
        if (!selection?.text?.trim()) {
            toast("Valitse ensin parannettava tekstikohta.");
            return;
        }
        const requestMode = state.mode;
        const isTranslation = requestMode === "translation";
        const requestSelection = Object.assign({}, selection, { text: selection.text });
        const requestProjectId = state.project?.id || null;
        const requestChapterIndex = state.chapterIndex;
        const requestSegmentIndex = state.segmentIndex;
        const requestChunk = isTranslation ? currentChunk() : null;
        const requestTranslationId = isTranslation ? state.translation?.id || null : null;
        const requestChapterSnapshot = isTranslation ? null : normalParagraphs();
        const context = isTranslation ? contextForTranslationSelection() : contextForNormalSelection();
        const sourceText = isTranslation ? sourceTextForChunk(requestChunk).slice(0, 30000) : "";
        setBusy(true, isTranslation ? "Verrataan käännöstä alkutekstiin…" : "Muotoillaan uutta versiota…");
        setStatus("Tekoäly valmistelee ehdotusta");
        try {
            const result = await api("/proofread/improve-selection", jsonOptions("POST", {
                text: requestSelection.text,
                instructions: $("ti-instructions").value.trim(),
                source_text: sourceText,
                context_before: context.before,
                context_after: context.after,
                model: null,
            }));
            const returnedEdit = String(result?.edited_text ?? "");
            const returnedEditTrimmed = returnedEdit.trim();
            if (!returnedEditTrimmed) throw new Error("Mallilta ei saatu tekstiehdotusta.");
            const offersOriginalForManualEditing = returnedEdit === requestSelection.text;
            const edited = offersOriginalForManualEditing
                ? requestSelection.text
                : returnedEditTrimmed;
            const sourceChanged = state.mode !== requestMode
                || String(state.project?.id || "") !== String(requestProjectId || "")
                || (!isTranslation && state.chapterIndex !== requestChapterIndex)
                || (isTranslation && (
                    state.segmentIndex !== requestSegmentIndex
                    || String(state.translation?.id || "") !== String(requestTranslationId || "")
                ))
                || (chapterRunRequest && (
                    currentChapterRun()?.id !== chapterRunRequest.id
                    || currentChapterRun()?.status !== "requesting"
                ));
            if (sourceChanged) {
                throw new Error("Aineisto vaihtui ehdotuksen luonnin aikana. Tee ehdotus uudelleen nykyiseen kohtaan.");
            }
            const activeRun = chapterRunRequest ? currentChapterRun() : null;
            if (activeRun) activeRun.status = "review";
            state.suggestion = {
                mode: requestMode,
                original: requestSelection.text,
                edited,
                manualFallback: offersOriginalForManualEditing,
                manualEdited: false,
                reason: offersOriginalForManualEditing
                    ? [
                        "Automaattinen tarkistus ei löytänyt muutettavaa. Voit muokata ehdotusta itse ennen hyväksymistä.",
                        result.notes,
                    ]
                        .map((value) => String(value || "").trim())
                        .filter(Boolean)
                        .join(" ")
                    : [result.reason, result.notes]
                        .map((value) => String(value || "").trim())
                        .filter(Boolean)
                        .join(" "),
                selection: requestSelection,
                chapterIndex: requestChapterIndex,
                segmentIndex: requestSegmentIndex,
                rawChunkIndex: requestChunk?._tiRawIndex ?? requestSegmentIndex,
                translationId: requestTranslationId,
                chapterRun: chapterRunRequest,
                chapterSnapshot: requestChapterSnapshot,
            };
            renderInspector();
            state.focusAfterBusy = $("ti-suggestion-text");
            setStatus(offersOriginalForManualEditing
                ? "Valittu teksti valmis muokattavaksi · hyväksy tai hylkää"
                : "Ehdotus valmis · hyväksy tai hylkää");
        } catch (error) {
            const activeRun = chapterRunRequest ? currentChapterRun() : null;
            if (activeRun?.id === chapterRunRequest?.id) activeRun.status = "ready";
            renderInspector();
            state.focusAfterBusy = chapterRunRequest ? $("ti-chapter-generate") : $("ti-generate");
            setStatus("Ehdotuksen luominen epäonnistui");
            toast(error.message);
        } finally {
            setBusy(false);
        }
    }

    async function acceptNormalSuggestion(suggestion) {
        if (!state.project?.id) throw new Error("Käsikirjoitusta ei ole valittu.");
        const latest = await api("/projects/" + encodeURIComponent(state.project.id));
        const chapter = latest?.chapters?.[suggestion.chapterIndex];
        if (!chapter) throw new Error("Valittua lukua ei enää löytynyt.");
        const paragraphs = (chapter.paragraphs || []).map((paragraph) => String(paragraph || ""));
        if (
            Array.isArray(suggestion.chapterSnapshot)
            && !paragraphSnapshotsMatch(paragraphs, suggestion.chapterSnapshot)
        ) {
            throw new Error("Luku on muuttunut ehdotuksen luonnin jälkeen. Hylkää ehdotus ja luo se uudelleen ajantasaisesta tekstistä.");
        }
        const current = selectionText(paragraphs, suggestion.selection);
        if (current !== suggestion.original) {
            throw new Error("Tekstikohta on muuttunut ehdotuksen luonnin jälkeen. Päivitä näkymä ja tee ehdotus uudelleen.");
        }
        const editedReplacement = suggestion.edited;
        if (!editedReplacement.trim()) throw new Error("Ehdotus ei voi olla tyhjä.");
        const replacement = replacementWithBoundaryWhitespace(suggestion.original, editedReplacement);
        if (replacement === suggestion.original) {
            rememberProject(latest, false);
            state.project = latest;
            state.chapterIndex = Math.min(suggestion.chapterIndex, (latest.chapters || []).length - 1);
            if (suggestion.chapterRun) {
                const progress = advanceChapterRun(
                    suggestion,
                    paragraphs,
                    cursorAfterSelection(paragraphs, suggestion.selection)
                );
                return Object.assign(progress, { unchanged: true });
            }
            state.normalSelection = null;
            return { inRun: false, hasMore: false, unchanged: true };
        }
        const preserveParagraphSlots = Boolean(suggestion.manualFallback);
        const chapterContinuationCursor = suggestion.chapterRun
            ? cursorAfterReplacement(
                paragraphs,
                suggestion.selection,
                replacement,
                preserveParagraphSlots
            )
            : null;
        const nextChapter = Object.assign({}, chapter, {
            paragraphs: applyReplacement(
                paragraphs,
                suggestion.selection,
                replacement,
                preserveParagraphSlots
            ),
        });
        const saved = await api(
            "/projects/" + encodeURIComponent(latest.id) + "/chapters/" + suggestion.chapterIndex,
            jsonOptions("PATCH", {
                chapter: nextChapter,
                expected_paragraphs: paragraphs,
            })
        );
        rememberProject(saved, true);
        state.project = saved;
        state.chapterIndex = Math.min(suggestion.chapterIndex, (saved.chapters || []).length - 1);
        if (suggestion.chapterRun) {
            const savedParagraphs = (saved.chapters?.[state.chapterIndex]?.paragraphs || [])
                .map((paragraph) => String(paragraph || ""));
            return advanceChapterRun(suggestion, savedParagraphs, chapterContinuationCursor);
        }
        state.normalSelection = null;
        return { inRun: false, hasMore: false };
    }

    async function acceptTranslationSuggestion(suggestion) {
        if (!suggestion.translationId) throw new Error("Käännöstä ei ole valittu.");
        const latest = await api("/translations/" + encodeURIComponent(suggestion.translationId));
        const rawChunks = Array.isArray(latest?.chunk_details) ? latest.chunk_details : [];
        const rawChunkIndex = Number.isInteger(suggestion.rawChunkIndex)
            ? suggestion.rawChunkIndex
            : suggestion.segmentIndex;
        const chunk = rawChunks[rawChunkIndex];
        if (!chunk) throw new Error("Valittua käännössegmenttiä ei enää löytynyt.");
        const model = paragraphModel(translationTextForChunk(chunk));
        const paragraphs = model.paragraphs;
        const current = selectionTextFromParagraphModel(model, suggestion.selection);
        if (current !== suggestion.original) {
            throw new Error("Käännöskohta on muuttunut ehdotuksen luonnin jälkeen. Päivitä näkymä ja tee ehdotus uudelleen.");
        }
        const editedReplacement = suggestion.edited;
        if (!editedReplacement.trim()) throw new Error("Ehdotus ei voi olla tyhjä.");
        const replacement = replacementWithBoundaryWhitespace(suggestion.original, editedReplacement);
        if (replacement === suggestion.original) {
            state.translation = latest;
            const translationIndex = state.translations.findIndex((item) => String(item.id) === String(latest.id));
            if (translationIndex >= 0) state.translations[translationIndex] = latest;
            state.segmentIndex = Math.min(suggestion.segmentIndex, translationChunks(latest).length - 1);
            state.translationSelection = null;
            populateTranslationSelect();
            return { inRun: false, hasMore: false, unchanged: true };
        }
        const updatedText = replaceSelectionInParagraphModel(model, suggestion.selection, replacement);
        const saved = await api(
            "/translations/" + encodeURIComponent(suggestion.translationId) + "/chunks/" + rawChunkIndex,
            jsonOptions("PATCH", {
                translation: updatedText,
                expected_translation: String(chunk?.translation || ""),
            })
        );
        state.translation = saved;
        const translationIndex = state.translations.findIndex((item) => String(item.id) === String(saved.id));
        if (translationIndex >= 0) state.translations[translationIndex] = saved;
        state.segmentIndex = Math.min(suggestion.segmentIndex, translationChunks(saved).length - 1);
        state.translationSelection = null;
        populateTranslationSelect();
    }

    async function acceptSuggestion() {
        if (!state.suggestion) return;
        const edited = state.suggestion.manualFallback && !state.suggestion.manualEdited
            ? state.suggestion.original
            : $("ti-suggestion-text").value;
        const suggestion = Object.assign({}, state.suggestion, {
            edited,
        });
        setBusy(true, "Tallennetaan hyväksyttyä muutosta…");
        setStatus("Tallennetaan muutosta");
        try {
            let chapterProgress = { inRun: false, hasMore: false, unchanged: false };
            if (suggestion.mode === "translation") {
                chapterProgress = await acceptTranslationSuggestion(suggestion) || chapterProgress;
            } else {
                chapterProgress = await acceptNormalSuggestion(suggestion);
            }
            clearSuggestion();
            renderAll();
            const reader = suggestion.mode === "translation" ? $("ti-target-reader") : $("ti-normal-reader");
            state.focusAfterBusy = chapterProgress.inRun
                ? $("ti-chapter-generate")
                : (reader.querySelector('[tabindex="0"]') || reader);
            if (chapterProgress.inRun && chapterProgress.hasMore) {
                revealNormalSelection(state.normalSelection);
                setStatus("Luvun osa tallennettu · jatka seuraavaan osaan");
                toast(chapterProgress.unchanged
                    ? "Luvun osa hyväksyttiin ilman muutoksia. Jatka seuraavaan osaan."
                    : "Luvun osa hyväksyttiin ja tallennettiin. Jatka seuraavaan osaan.");
            } else if (chapterProgress.inRun) {
                setStatus("Koko luku käsitelty");
                toast(chapterProgress.unchanged
                    ? "Luvun viimeinen osa hyväksyttiin ilman muutoksia. Koko luku on käsitelty."
                    : "Luvun viimeinen osa hyväksyttiin. Koko luku on käsitelty.");
            } else if (chapterProgress.unchanged) {
                setStatus("Teksti hyväksytty ilman muutoksia");
                toast("Teksti hyväksyttiin ilman muutoksia.");
            } else {
                setStatus("Muutos tallennettu");
                toast("Muutos hyväksyttiin ja tallennettiin.");
            }
        } catch (error) {
            state.focusAfterBusy = $("ti-suggestion-text");
            setStatus("Tallennus epäonnistui");
            toast(error.message);
        } finally {
            setBusy(false);
        }
    }

    async function rejectSuggestion() {
        if (!state.suggestion) return;
        const suggestion = state.suggestion;
        let chapterProgress = { inRun: false, hasMore: false };
        if (suggestion.chapterRun) {
            const projectId = String(state.project?.id || "");
            const chapterIndex = suggestion.chapterIndex;
            setBusy(true, "Varmistetaan luvun ajantasaisuus…");
            setStatus("Varmistetaan hylkäystä");
            try {
                const latest = await api("/projects/" + encodeURIComponent(projectId));
                if (
                    state.suggestion !== suggestion
                    || state.mode !== "normal"
                    || String(state.project?.id || "") !== projectId
                    || state.chapterIndex !== chapterIndex
                    || currentChapterRun()?.id !== suggestion.chapterRun.id
                ) {
                    throw new Error("Aineisto vaihtui ehdotuksen hylkäyksen aikana.");
                }
                const chapter = latest?.chapters?.[chapterIndex] || null;
                const paragraphs = (chapter?.paragraphs || []).map((paragraph) => String(paragraph || ""));
                if (
                    !chapter
                    || !Array.isArray(suggestion.chapterSnapshot)
                    || !paragraphSnapshotsMatch(paragraphs, suggestion.chapterSnapshot)
                ) {
                    rememberProject(latest, false);
                    state.chapterIndex = Math.min(
                        chapterIndex,
                        Math.max(0, (latest?.chapters || []).length - 1)
                    );
                    state.normalSelection = null;
                    clearSuggestion();
                    cancelChapterRun();
                    renderAll();
                    state.focusAfterBusy = $("ti-normal-reader");
                    setStatus("Ajantasainen luku ladattu");
                    toast("Luku muuttui toisessa näkymässä. Ajantasainen teksti ladattiin; aloita luvun parantelu uudelleen.");
                    return;
                }
                rememberProject(latest, false);
                state.chapterIndex = chapterIndex;
                chapterProgress = advanceChapterRun(
                    suggestion,
                    paragraphs,
                    cursorAfterSelection(paragraphs, suggestion.selection)
                );
            } catch (error) {
                state.focusAfterBusy = $("ti-suggestion-text");
                setStatus("Hylkäyksen varmistus epäonnistui");
                toast(error.message);
                return;
            } finally {
                setBusy(false);
            }
        }
        clearSuggestion();
        renderMode();
        if (chapterProgress.inRun && chapterProgress.hasMore) {
            revealNormalSelection(state.normalSelection);
            setStatus("Luvun osa hylätty · jatka seuraavaan osaan");
            toast("Ehdotus hylättiin. Alkuperäinen osa säilyi; voit jatkaa seuraavaan osaan.");
        } else if (chapterProgress.inRun) {
            setStatus("Koko luku käsitelty");
            toast("Viimeinen ehdotus hylättiin. Koko luku on käsitelty.");
        } else {
            setStatus("Ehdotus hylätty · alkuperäinen teksti säilyi");
            toast("Ehdotus hylättiin. Tekstiä ei muutettu.");
        }
        if (chapterProgress.inRun) {
            $("ti-chapter-generate").focus({ preventScroll: true });
        } else {
            $("ti-generate").focus({ preventScroll: true });
        }
    }

    async function importProjectFile(file) {
        if (!file) return;
        cancelChapterRun();
        const form = new FormData();
        form.append("file", file);
        setBusy(true, "Tuodaan tiedostoa käsikirjoitukseksi…");
        setStatus("Tuodaan tiedostoa");
        try {
            const result = await api("/projects/import", { method: "POST", body: form });
            rememberProject(result.project, true);
            state.project = result.project;
            state.chapterIndex = 0;
            state.normalSelection = null;
            clearSuggestion();
            await refreshProjects();
            if (state.canUseTranslations) await loadTranslations();
            renderAll();
            state.focusAfterBusy = $("ti-normal-reader").querySelector('[tabindex="0"]') || $("ti-project-select");
            const warnings = Array.isArray(result.warnings) ? result.warnings.filter(Boolean) : [];
            setStatus("Tiedosto tuotu");
            toast(warnings[0] || "Tiedosto tuotiin ja tallennettiin käsikirjoitukseksi.");
        } catch (error) {
            state.focusAfterBusy = $("ti-import-button");
            setStatus("Tiedoston tuonti epäonnistui");
            toast(error.message);
        } finally {
            $("ti-import-file").value = "";
            setBusy(false);
        }
    }

    async function importBilingualFile(file) {
        if (!file) return;
        if (!state.canImportBilingual) {
            toast("Bilingual-tuonti vaatii käännöstyötilan käyttöoikeuden.");
            return;
        }
        cancelChapterRun();
        const form = new FormData();
        form.append("file", file);
        form.append("source_language", "auto");
        form.append("target_language", "fi");
        form.append("style", "faithful");
        setBusy(true, "Kohdistetaan alkutekstiä ja käännöstä…");
        setStatus("Tuodaan bilingual-aineistoa");
        try {
            const result = await api("/translations/import-bilingual", { method: "POST", body: form });
            rememberProject(result.project, true);
            state.project = result.project;
            state.translations = [result.translation];
            state.translation = result.translation;
            state.segmentIndex = 0;
            state.translationSelection = null;
            clearSuggestion();
            await refreshProjects();
            populateTranslationSelect();
            await setMode("translation");
            state.focusAfterBusy = $("ti-target-reader").querySelector('[tabindex="0"]') || $("ti-translation-select");
            setStatus(result.segments_count + " segmenttiä tuotu");
            const warnings = Array.isArray(result.warnings) ? result.warnings.filter(Boolean) : [];
            toast(warnings[0] || "Bilingual-aineisto on valmis käännöksen paranteluun.");
        } catch (error) {
            state.focusAfterBusy = $("ti-bilingual-button");
            setStatus("Bilingual-tuonti epäonnistui");
            toast(error.message);
        } finally {
            $("ti-bilingual-file").value = "";
            setBusy(false);
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
        document.querySelectorAll("[data-ti-mode]").forEach((button, index, buttons) => {
            button.addEventListener("click", () => setMode(button.dataset.tiMode));
            button.addEventListener("keydown", (event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                let nextIndex = index;
                if (event.key === "ArrowLeft") nextIndex = (index - 1 + buttons.length) % buttons.length;
                if (event.key === "ArrowRight") nextIndex = (index + 1) % buttons.length;
                if (event.key === "Home") nextIndex = 0;
                if (event.key === "End") nextIndex = buttons.length - 1;
                setMode(buttons[nextIndex].dataset.tiMode, true);
            });
        });

        $("ti-project-select").addEventListener("change", (event) => {
            if (event.target.value) loadProject(event.target.value, { notifyParent: true });
        });
        $("ti-translation-project-select").addEventListener("change", (event) => {
            if (event.target.value) loadProject(event.target.value, { notifyParent: true });
        });
        $("ti-translation-select").addEventListener("change", (event) => chooseTranslation(event.target.value));
        $("ti-import-button").addEventListener("click", () => $("ti-import-file").click());
        $("ti-import-file").addEventListener("change", (event) => importProjectFile(event.target.files?.[0]));
        $("ti-bilingual-button").addEventListener("click", () => $("ti-bilingual-file").click());
        $("ti-empty-bilingual-button").addEventListener("click", () => $("ti-bilingual-file").click());
        $("ti-bilingual-file").addEventListener("change", (event) => importBilingualFile(event.target.files?.[0]));

        $("ti-previous").addEventListener("click", () => moveUnit(-1));
        $("ti-next").addEventListener("click", () => moveUnit(1));
        $("ti-normal-reader").addEventListener("pointerup", (event) => handleReaderSelection("normal", event));
        $("ti-normal-reader").addEventListener("keyup", (event) => {
            if (event.shiftKey) handleReaderSelection("normal", event);
        });
        $("ti-normal-reader").addEventListener("keydown", (event) => {
            handleReaderKeyboardSelection("normal", event);
        });
        $("ti-target-reader").addEventListener("pointerup", (event) => handleReaderSelection("translation", event));
        $("ti-target-reader").addEventListener("keyup", (event) => {
            if (event.shiftKey) handleReaderSelection("translation", event);
        });
        $("ti-target-reader").addEventListener("keydown", (event) => {
            handleReaderKeyboardSelection("translation", event);
        });
        $("ti-source-reader").addEventListener("scroll", () => syncScroll($("ti-source-reader"), $("ti-target-reader")));
        $("ti-target-reader").addEventListener("scroll", () => syncScroll($("ti-target-reader"), $("ti-source-reader")));

        $("ti-instructions").addEventListener("input", (event) => {
            $("ti-instructions-count").textContent = String(event.target.value.length);
        });
        $("ti-keyboard-selection-text").addEventListener("select", updateKeyboardSelectionStatus);
        $("ti-keyboard-selection-text").addEventListener("keyup", updateKeyboardSelectionStatus);
        $("ti-keyboard-selection-text").addEventListener("keydown", (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                applyKeyboardSelection();
            }
        });
        $("ti-use-keyboard-selection").addEventListener("click", applyKeyboardSelection);
        $("ti-instructions").addEventListener("keydown", (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                generateSuggestion();
            }
        });
        $("ti-generate").addEventListener("click", () => generateSuggestion());
        $("ti-chapter-generate").addEventListener("click", generateNextChapterSuggestion);
        $("ti-suggestion-text").addEventListener("input", (event) => {
            if (state.suggestion) {
                state.suggestion.edited = event.target.value;
                state.suggestion.manualEdited = true;
            }
            updateActionStates();
        });
        $("ti-accept").addEventListener("click", acceptSuggestion);
        $("ti-reject").addEventListener("click", rejectSuggestion);

        window.addEventListener("message", (event) => {
            if (event.origin !== window.location.origin) return;
            if (event.data?.type === "skriptlab:text-improvement-opened") {
                const projectId = String(event.data.projectId || "");
                if (!projectId) {
                    loadProject("", { notifyParent: false });
                } else if (String(state.project?.id || "") !== projectId) {
                    loadProject(projectId, { notifyParent: false });
                }
            }
        });
    }

    async function initialize() {
        bindEvents();
        if (!state.canUseTranslations) {
            $("ti-tab-translation").title = "Vaatii käännöstyötilan käyttöoikeuden";
            $("ti-tab-translation").setAttribute("aria-disabled", "true");
        }
        if (!state.canImportBilingual) {
            $("ti-bilingual-button").title = "Bilingual-tuonti vaatii käännöstyötilan käyttöoikeuden";
            $("ti-empty-bilingual-button").title = "Bilingual-tuonti vaatii käännöstyötilan käyttöoikeuden";
        }
        renderAll();
        setBusy(true, "Ladataan tekstityötilaa…");
        try {
            await refreshProjects();
            const params = new URLSearchParams(window.location.search);
            const projectId = params.get("project") || localStorage.getItem(ACTIVE_PROJECT_KEY) || "";
            if (projectId) {
                await loadProject(projectId, { notifyParent: false });
                const savedChapter = Number(localStorage.getItem("skriptlab_text_improvement_chapter_" + projectId));
                if (Number.isInteger(savedChapter) && savedChapter >= 0 && savedChapter < (state.project?.chapters?.length || 0)) {
                    state.chapterIndex = savedChapter;
                    state.normalSelection = null;
                }
            }
            renderAll();
            setStatus("Valmis");
        } catch (error) {
            setStatus("Työtilan lataus epäonnistui");
            toast(error.message);
        } finally {
            setBusy(false);
        }
    }

    window.SkriptLabTextImprovementTestHooks = {
        splitParagraphs,
        paragraphModel,
        paragraphModelFromParagraphs,
        contextAroundSelection,
        chapterPartSelection,
        cursorAfterSelection,
        cursorAfterReplacement,
        countChapterParts,
        selectionText,
        selectionTextFromParagraphModel,
        applyReplacement,
        replacementWithBoundaryWhitespace,
        replaceSelectionInParagraphModel,
        translationChunks,
    };

    initialize();
})();
