const API_BASE_URL = (window.SKRIPTLAB_CONFIG && window.SKRIPTLAB_CONFIG.API_BASE_URL) || "http://127.0.0.1:8000";
const apiUrl = (path) => `${API_BASE_URL}${path}`;
const apiFetch = (path, options) => window.SkriptLabAuth.fetch(path, options);
const ACTIVE_PROJECT_ID_KEY = "skriptlab_active_project_id";

if (!window.SkriptLabAuth.requireLogin()) {
    throw new Error("Login required.");
}

window.saveManuscriptToDB = async function(data) {
    if (!data) return;
    try {
        const res = await apiFetch('/api/projects', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        const saved = await res.json();
        if (!res.ok) throw new Error(saved.detail || "Tallennus epäonnistui.");
        Object.assign(data, saved);
        if (data.id) localStorage.setItem(ACTIVE_PROJECT_ID_KEY, String(data.id));
        localStorage.setItem('skriptlab_manuscript', JSON.stringify(data));
        return data;
    } catch (e) {
        console.error("DB Save fail", e);
        localStorage.setItem('skriptlab_manuscript', JSON.stringify(data));
        return data;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const currentUser = window.SkriptLabAuth.getUser();
    let availableProjects = [];
    let translationModels = [];
    let latestTranslationText = '';
    let currentTranslationHistory = [];
    let selectedTranslation = null;
    let syncingTranslationScroll = false;
    let translationTimerInterval = null;
    let latestTranslationEstimate = null;
    const fullWorkspaceRoles = new Set(['admin', 'test_user']);
    const betaCoreViews = new Set(['view-kirjani', 'view-kirjoita', 'view-kirja', 'view-analyysi', 'view-toimitus']);
    const translatorViews = new Set([...betaCoreViews, 'view-kaannokset']);
    const roleLabels = {
        admin: 'Admin',
        test_user: 'Test user',
        org_admin: 'Org admin',
        toimittaja: 'Toimittaja',
        kaantaja: 'Kääntäjä',
        kirjailija: 'Kirjailija'
    };
    const canSeeAllModules = currentUser && fullWorkspaceRoles.has(currentUser.role);
    const usageEls = {
        box: document.getElementById('usage-box'),
        analysisText: document.getElementById('usage-analysis-text'),
        analysisBar: document.getElementById('usage-analysis-bar'),
        analysisChars: document.getElementById('usage-analysis-chars'),
        editText: document.getElementById('usage-edit-text'),
        editBar: document.getElementById('usage-edit-bar'),
        editChars: document.getElementById('usage-edit-chars'),
        status: document.getElementById('usage-status')
    };
    const analysisFields = [
        { key: 'glossary', label: 'Sanasto' },
        { key: 'style', label: 'Tyylianalyysi' },
        { key: 'editorial_assessment', label: 'Toimituksellinen arvio' },
        { key: 'synopsis', label: 'Synopsis' },
        { key: 'chapter_analysis', label: 'Lukutason analyysi' },
        { key: 'marketing_short', label: 'Markkinointiteksti, lyhyt' },
        { key: 'marketing_long', label: 'Markkinointiteksti, pitkä' },
        { key: 'backcover', label: 'Takakansiteksti' }
    ];
    const analysisMetadataFields = [
        { key: 'analysis_status', label: 'Analyysin tila' },
        { key: 'analysis_warnings', label: 'Käsittelyhuomautukset' },
        { key: 'audience', label: 'Kohderyhmä' },
        { key: 'genre', label: 'Genre' },
        { key: 'library_class', label: 'Kirjastoluokka' },
        { key: 'thema_classes', label: 'Thema-luokat' },
        { key: 'cover_prompt', label: 'Ensisijainen kansiprompti' },
        { key: 'cover_prompts', label: 'Kansipromptit' },
        { key: 'onix', label: 'ONIX-metadata' }
    ];
    const translationAnalysisKeys = ['glossary', 'style', 'synopsis', 'chapter_analysis'];
    const canSeeAnalysisMetadata = currentUser && currentUser.role !== 'kirjailija';

    const logoutLink = document.getElementById('logout-link');
    const adminLink = document.getElementById('admin-link');
    const settingsBtn = document.getElementById('settings-btn');
    if (logoutLink) {
        logoutLink.addEventListener('click', () => {
            window.SkriptLabAuth.clearSession();
        });
    }
    if (adminLink && currentUser && currentUser.role === 'admin') {
        adminLink.classList.remove('hidden');
    }

    if (currentUser) {
        const roleBadge = document.getElementById('sidebar-user-role');
        const userName = document.getElementById('sidebar-user-name');
        const userEmail = document.getElementById('sidebar-user-email');
        if (userName) userName.textContent = currentUser.display_name || currentUser.email || 'Käyttäjä';
        if (userEmail) userEmail.textContent = currentUser.email || '';
        if (roleBadge) {
            roleBadge.textContent = `Käyttäjäryhmä: ${roleLabels[currentUser.role] || currentUser.role}`;
        }
    }

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            alert('Asetukset-osio rakennetaan myöhemmin.');
        });
    }

    function formatNumber(value) {
        return Number(value || 0).toLocaleString('fi-FI');
    }

    function usagePercent(used, limit) {
        if (!limit || limit <= 0) return used > 0 ? 100 : 0;
        return Math.min(100, Math.round((used / limit) * 100));
    }

    function formatDuration(seconds) {
        const value = Number(seconds || 0);
        if (value < 60) return `${Math.max(1, Math.round(value))} s`;
        const minutes = Math.round(value / 60);
        if (minutes < 60) return `${minutes} min`;
        const hours = Math.floor(minutes / 60);
        const rest = minutes % 60;
        return rest ? `${hours} h ${rest} min` : `${hours} h`;
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizeWord(value) {
        return String(value || '').toLocaleLowerCase('fi-FI').replace(/[^\p{L}\p{N}]+/gu, '');
    }

    function normalizeText(value) {
        return String(value || '').toLocaleLowerCase('fi-FI').replace(/\s+/g, ' ').trim();
    }

    function tokenizeText(value) {
        return String(value || '').match(/(\s+|[\p{L}\p{N}]+|[^\s\p{L}\p{N}]+)/gu) || [];
    }

    function splitSentences(value) {
        return String(value || '').match(/[^.!?…]+[.!?…]*|[.!?…]+/g) || [];
    }

    function matchedTargetWordIndexes(originalSentence, targetSentence) {
        const originalWords = tokenizeText(originalSentence).map(normalizeWord).filter(Boolean);
        const targetTokens = tokenizeText(targetSentence);
        const targetWords = targetTokens
            .map((token, tokenIndex) => ({ tokenIndex, word: normalizeWord(token) }))
            .filter(item => item.word);
        const targetWordValues = targetWords.map(item => item.word);
        if (originalWords.length * targetWordValues.length > 250000) {
            const originalWordSet = new Set(originalWords);
            const matched = new Set();
            targetWordValues.forEach((word, index) => {
                if (originalWordSet.has(word)) matched.add(index);
            });
            return { matched, targetTokens, targetWords };
        }
        const rows = originalWords.length + 1;
        const cols = targetWordValues.length + 1;
        const dp = Array.from({ length: rows }, () => Array(cols).fill(0));

        for (let i = originalWords.length - 1; i >= 0; i--) {
            for (let j = targetWordValues.length - 1; j >= 0; j--) {
                dp[i][j] = originalWords[i] === targetWordValues[j]
                    ? dp[i + 1][j + 1] + 1
                    : Math.max(dp[i + 1][j], dp[i][j + 1]);
            }
        }

        const matched = new Set();
        let i = 0;
        let j = 0;
        while (i < originalWords.length && j < targetWordValues.length) {
            if (originalWords[i] === targetWordValues[j]) {
                matched.add(j);
                i++;
                j++;
            } else if (dp[i + 1][j] >= dp[i][j + 1]) {
                i++;
            } else {
                j++;
            }
        }

        return { matched, targetTokens, targetWords };
    }

    function sentenceDiffHtml(originalSentence, targetSentence) {
        const changedSentence = normalizeText(originalSentence) !== normalizeText(targetSentence);
        const { matched, targetTokens } = matchedTargetWordIndexes(originalSentence, targetSentence);
        let wordIndex = 0;
        const html = targetTokens.map(token => {
            const normalized = normalizeWord(token);
            if (!normalized) return escapeHtml(token);
            const isChangedWord = changedSentence && !matched.has(wordIndex++);
            return isChangedWord
                ? `<span class="diff-word">${escapeHtml(token)}</span>`
                : escapeHtml(token);
        }).join('');

        return changedSentence
            ? `<span class="diff-sentence">${html}</span>`
            : html;
    }

    function buildDiffHtml(original, target) {
        const originalParagraphs = String(original || '').split(/\n\s*\n/);
        const targetParagraphs = String(target || '').split(/\n\s*\n/);

        return targetParagraphs.map((paragraph, paragraphIndex) => {
            const originalSentences = splitSentences(originalParagraphs[paragraphIndex] || '');
            const targetSentences = splitSentences(paragraph);
            return targetSentences.map((sentence, sentenceIndex) => {
                return sentenceDiffHtml(originalSentences[sentenceIndex] || '', sentence);
            }).join('');
        }).join('\n\n');
    }

    function analysisValue(value) {
        if (value === null || value === undefined) return '';
        if (typeof value === 'string') return value;
        return JSON.stringify(value, null, 2);
    }

    function cleanAnalysisDisplayText(value, labels = []) {
        let text = analysisValue(value)
            .replace(/^\s{0,3}#{1,6}\s+/gm, '')
            .replace(/\*+/g, '')
            .replace(/__+/g, '')
            .trim();
        let changed = true;
        while (changed) {
            changed = false;
            labels.forEach(label => {
                const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const next = text.replace(new RegExp(`^${escaped}(?:\\s+[^:\\n]{1,60})?\\s*:\\s*`, 'i'), '').trim();
                if (next !== text) {
                    text = next;
                    changed = true;
                }
            });
        }
        return text;
    }

    function truncateText(value, maxLength, labels = []) {
        const text = cleanAnalysisDisplayText(value, labels).replace(/\s+/g, ' ').trim();
        if (!text || text.length <= maxLength) return text;
        return `${text.slice(0, maxLength).trim()}...`;
    }

    function paragraphSnippet(value) {
        const text = String(value || '').replace(/\s+/g, ' ').trim();
        return text ? truncateText(text, 54) : 'Tyhjä kappale';
    }

    function chapterPlacement(chapter, index) {
        const label = `${chapter?.id || ''} ${chapter?.title || ''}`.toLocaleLowerCase('fi-FI');
        if (/(epilogi|j[aä]lkisanat|hakemisto|kiitokset|l[aä]hteet|liite|liitteet|sanasto|bibliografia)/i.test(label)) {
            return 'back';
        }
        if (/(alku|nimi[oö]lehti|sis[aä]llysluettelo|sis[aä]llys|omistus|tekij[aä]noikeus|copyright|esipuhe|alkusanat)/i.test(label)) {
            return 'front';
        }
        return 'body';
    }

    function chapterGroupLabel(key) {
        if (key === 'front') return 'Alkuosat';
        if (key === 'back') return 'Loppuosat';
        return 'Luvut';
    }

    function firstBodyChapterIndex(chapters = window.manuscriptData?.chapters || []) {
        const bodyIndex = chapters.findIndex((chapter, index) => chapterPlacement(chapter, index) === 'body');
        return bodyIndex >= 0 ? bodyIndex : 0;
    }

    function isSubchapterTitle(chapter) {
        const title = `${chapter?.id || ''} ${chapter?.title || ''}`.trim();
        return /^(\d+\.\d+|[IVXLC]+\.\d+)\b/i.test(title) || /\baliluku\b/i.test(title);
    }

    function renderChapterParagraphNav(container, activeCIndex, activePIndex, handlers = {}) {
        if (!container) return;
        container.innerHTML = '';
        const chapters = window.manuscriptData?.chapters || [];
        if (!chapters.length) {
            container.innerHTML = '<div style="color:var(--text-secondary); font-size:13px;">Valitse tai lataa käsikirjoitus ensin.</div>';
            return;
        }

        const grouped = { front: [], body: [], back: [] };
        chapters.forEach((chapter, index) => {
            grouped[chapterPlacement(chapter, index)].push({ chapter, index });
        });
        const visibleGroups = ['front', 'body', 'back'].filter(key => grouped[key].length);

        visibleGroups.forEach(groupKey => {
            const groupEl = document.createElement('div');
            groupEl.className = 'chapter-group';

            const label = document.createElement('div');
            label.className = 'chapter-group-label';
            label.textContent = chapterGroupLabel(groupKey);
            groupEl.appendChild(label);

            grouped[groupKey].forEach(({ chapter, index }) => {
                const item = document.createElement('div');
                item.className = 'chapter-nav-item';

                const chapterButton = document.createElement('button');
                chapterButton.type = 'button';
                chapterButton.className = 'chapter-nav-btn';
                chapterButton.classList.toggle('active', index === activeCIndex);
                chapterButton.classList.toggle('subchapter', isSubchapterTitle(chapter));
                const paragraphCount = Array.isArray(chapter.paragraphs) ? chapter.paragraphs.length : 0;
                chapterButton.innerHTML = `
                    <span class="chapter-nav-title">${escapeHtml(chapter.title || `Luku ${index + 1}`)}</span>
                    <span class="chapter-nav-meta">${paragraphCount} kappaletta</span>
                `;
                chapterButton.addEventListener('click', () => {
                    if (handlers.onChapterSelect) handlers.onChapterSelect(index);
                });
                item.appendChild(chapterButton);

                if (index === activeCIndex) {
                    const paragraphList = document.createElement('div');
                    paragraphList.className = 'paragraph-list';
                    (chapter.paragraphs || []).forEach((paragraph, pIndex) => {
                        const paragraphButton = document.createElement('button');
                        paragraphButton.type = 'button';
                        paragraphButton.className = 'paragraph-nav-btn';
                        paragraphButton.classList.toggle('active', pIndex === activePIndex);
                        paragraphButton.dataset.pindex = String(pIndex);
                        paragraphButton.innerHTML = `<span>Kappale ${pIndex + 1}</span><small>${escapeHtml(paragraphSnippet(paragraph))}</small>`;
                        paragraphButton.addEventListener('click', () => {
                            if (handlers.onParagraphSelect) handlers.onParagraphSelect(index, pIndex);
                        });
                        paragraphList.appendChild(paragraphButton);
                    });
                    item.appendChild(paragraphList);
                }

                groupEl.appendChild(item);
            });

            container.appendChild(groupEl);
        });

        const active = container.querySelector('.paragraph-nav-btn.active') || container.querySelector('.chapter-nav-btn.active');
        if (active) active.scrollIntoView({ block: 'nearest' });
    }

    function networkFailureMessage(error) {
        const message = String(error?.message || error || '');
        if (message.includes('Failed to fetch')) {
            return (
                'Yhteys backend-palveluun katkesi ennen kuin vastaus saatiin. '
                + 'Pitkän käsikirjoituksen analyysissä tämä johtuu yleensä siitä, että pyyntö kestää liian kauan, '
                + 'palvelin/proxy katkaisee yhteyden tai backend käynnistyy uudelleen. '
                + 'Teksti ei välttämättä ole virheellinen.'
            );
        }
        return message || 'Tuntematon virhe.';
    }

    function getFullManuscriptText(data = window.manuscriptData) {
        if (!data || !Array.isArray(data.chapters)) return '';
        return data.chapters.map(chapter => {
            const title = chapter.title ? String(chapter.title).trim() : '';
            const paragraphs = Array.isArray(chapter.paragraphs)
                ? chapter.paragraphs.map(p => String(p || '').trim()).filter(Boolean).join('\n\n')
                : '';
            return [title, paragraphs].filter(Boolean).join('\n\n');
        }).filter(Boolean).join('\n\n\n');
    }

    function renderAnalysisSections(analysis) {
        const editor = document.getElementById('analysis-editor');
        const saveBtn = document.getElementById('save-analysis-btn');
        const toggleBtn = document.getElementById('toggle-analysis-editor-btn');
        const metaEditor = document.getElementById('analysis-meta-editor');
        const metaToggleBtn = document.getElementById('toggle-analysis-meta-btn');
        if (!editor || !saveBtn || !toggleBtn || !metaEditor || !metaToggleBtn) return;

        editor.innerHTML = '';
        metaEditor.innerHTML = '';
        const hasAnalysis = analysis && analysisFields.some(field => analysisValue(analysis[field.key]).trim());
        const hasMetadata = analysis && analysisMetadataFields.some(field => analysisValue(analysis[field.key]).trim());
        if (!hasAnalysis) {
            editor.classList.add('hidden');
            metaEditor.classList.add('hidden');
            saveBtn.classList.add('hidden');
            toggleBtn.classList.add('hidden');
            metaToggleBtn.classList.add('hidden');
            return;
        }

        function appendAnalysisField(target, field, datasetName) {
            const section = document.createElement('div');
            section.className = 'analysis-section';

            const label = document.createElement('label');
            label.textContent = field.label;

            const textarea = document.createElement('textarea');
            textarea.dataset[datasetName] = field.key;
            textarea.value = analysisValue(analysis[field.key]);

            section.appendChild(label);
            section.appendChild(textarea);
            target.appendChild(section);
        }

        analysisFields.forEach(field => appendAnalysisField(editor, field, 'analysisKey'));
        analysisMetadataFields.forEach(field => appendAnalysisField(metaEditor, field, 'analysisMetaKey'));
        toggleBtn.classList.remove('hidden');
        metaToggleBtn.classList.toggle('hidden', !canSeeAnalysisMetadata || !hasMetadata);
        setAnalysisEditorOpen(!editor.classList.contains('hidden'));
        setAnalysisMetadataOpen(!metaEditor.classList.contains('hidden'));
    }

    function setAnalysisEditorOpen(isOpen) {
        const editor = document.getElementById('analysis-editor');
        const saveBtn = document.getElementById('save-analysis-btn');
        const toggleBtn = document.getElementById('toggle-analysis-editor-btn');
        if (!editor || !saveBtn || !toggleBtn) return;
        editor.classList.toggle('hidden', !isOpen);
        updateAnalysisSaveButton();
        toggleBtn.textContent = isOpen ? 'Piilota analyysin muokkaus' : 'Muokkaa analyysin tuloksia';
    }

    function setAnalysisMetadataOpen(isOpen) {
        const editor = document.getElementById('analysis-meta-editor');
        const saveBtn = document.getElementById('save-analysis-btn');
        const toggleBtn = document.getElementById('toggle-analysis-meta-btn');
        if (!editor || !saveBtn || !toggleBtn) return;
        editor.classList.toggle('hidden', !isOpen);
        updateAnalysisSaveButton();
        toggleBtn.textContent = isOpen ? 'Piilota muut tiedot' : 'Muokkaa muita tietoja';
    }

    function updateAnalysisSaveButton() {
        const saveBtn = document.getElementById('save-analysis-btn');
        const editor = document.getElementById('analysis-editor');
        const metaEditor = document.getElementById('analysis-meta-editor');
        if (!saveBtn || !editor || !metaEditor) return;
        const isEditing = !editor.classList.contains('hidden') || !metaEditor.classList.contains('hidden');
        saveBtn.classList.toggle('hidden', !isEditing);
    }

    function saveAnalysisFromEditor() {
        if (!window.manuscriptData) {
            alert('Valitse tai lataa käsikirjoitus ensin.');
            return;
        }
        const analysis = Object.assign({}, window.manuscriptData.analysis || {});
        document.querySelectorAll('[data-analysis-key]').forEach(input => {
            analysis[input.dataset.analysisKey] = input.value.trim();
        });
        document.querySelectorAll('[data-analysis-meta-key]').forEach(input => {
            analysis[input.dataset.analysisMetaKey] = input.value.trim();
        });
        window.manuscriptData.analysis = analysis;
        window.saveManuscriptToDB(window.manuscriptData);
        renderAnalysisSummary(analysis);
        alert('Analyysi tallennettu.');
    }

    function renderAnalysisSummary(analysis) {
        const statusText = document.getElementById('mock-analysis-text');
        if (!statusText) return;
        if (!analysis || !analysisFields.some(field => analysisValue(analysis[field.key]).trim())) {
            const results = document.getElementById('analysis-results');
            if (results) results.classList.add('hidden');
            statusText.innerHTML = 'Analyysiä ei ole vielä tallennettu tälle käsikirjoitukselle.';
            renderAnalysisSections(null);
            return;
        }
        const results = document.getElementById('analysis-results');
        if (results) results.classList.remove('hidden');
        const source = window.manuscriptData?.source_filename || window.manuscriptData?.title || 'käsikirjoitus';
        const style = truncateText(analysis.style, 360, ['Tyyli', 'Tyylianalyysi', 'Äänensävy']) || 'Ei vielä sisältöä.';
        const assessment = truncateText(analysis.editorial_assessment, 420, ['Toimituksellinen arvio', 'Toimituksellinen analyysi', 'Arvio']) || 'Ei vielä sisältöä.';
        const synopsis = truncateText(analysis.synopsis, 360, ['Synopsis', 'Synopsisis', 'Tiivistelmä']) || 'Ei vielä sisältöä.';
        const chapterAnalysis = truncateText(analysis.chapter_analysis, 700, ['Lukutason analyysi', 'Lukuanalyysi', 'Luku- tai osatason analyysi']) || 'Ei vielä sisältöä.';
        statusText.innerHTML = `
            <div class="analysis-summary">
                <div class="analysis-summary-title">Analyysi laadittu! (${escapeHtml(source)})</div>
                <div class="analysis-summary-item"><span class="analysis-summary-label">Tyyli:</span> ${escapeHtml(style)}</div>
                <div class="analysis-summary-item"><span class="analysis-summary-label">Toimituksellinen arvio:</span> ${escapeHtml(assessment)}</div>
                <div class="analysis-summary-item"><span class="analysis-summary-label">Synopsis:</span> ${escapeHtml(synopsis)}</div>
                <div class="analysis-summary-item"><span class="analysis-summary-label">Lukutason analyysi:</span> ${escapeHtml(chapterAnalysis)}</div>
            </div>
        `;
        renderAnalysisSections(analysis);
    }

    function hasSavedAnalysis(analysis) {
        return Boolean(analysis && analysisFields.some(field => analysisValue(analysis[field.key]).trim()));
    }

    function analysisStatusLabel(analysis) {
        return hasSavedAnalysis(analysis) ? 'Analysoitu' : 'Odottaa analyysiä';
    }

    function updateAvailableProject(project) {
        if (!project?.id) return;
        const index = availableProjects.findIndex(item => String(item.id) === String(project.id));
        if (index >= 0) {
            availableProjects[index] = Object.assign({}, availableProjects[index], project);
        } else {
            availableProjects.unshift(project);
        }
        renderProjectCards(availableProjects);
    }

    function hasTranslationAnalysis(project) {
        const analysis = project?.analysis || {};
        return translationAnalysisKeys.some(key => analysisValue(analysis[key]).trim());
    }

    async function loadSavedAnalysisForActiveProject(showFeedback = true) {
        if (!window.manuscriptData?.id) {
            if (showFeedback) alert('Valitse ensin käsikirjoitus.');
            return;
        }
        if (!showFeedback && hasSavedAnalysis(window.manuscriptData.analysis)) return;

        const originalText = loadSavedAnalysisBtn?.textContent;
        if (loadSavedAnalysisBtn && showFeedback) {
            loadSavedAnalysisBtn.disabled = true;
            loadSavedAnalysisBtn.textContent = 'Ladataan...';
        }

        try {
            const res = await apiFetch('/api/projects');
            if (!res.ok) throw new Error(await apiErrorMessage(res, 'Tallennetun analyysin lataus epäonnistui.'));
            const projects = await res.json();
            availableProjects = projects || [];
            const latest = availableProjects.find(project => String(project.id) === String(window.manuscriptData.id));
            if (!latest) throw new Error('Aktiivista käsikirjoitusta ei löytynyt tietokannasta.');

            const localAnalysis = window.manuscriptData.analysis || {};
            if (!hasSavedAnalysis(latest.analysis) && hasSavedAnalysis(localAnalysis)) {
                latest.analysis = localAnalysis;
                await window.saveManuscriptToDB(latest);
            }

            window.manuscriptData = Object.assign({}, window.manuscriptData, latest);
            if (!window.manuscriptData.analysis) window.manuscriptData.analysis = {};
            localStorage.setItem('skriptlab_manuscript', JSON.stringify(window.manuscriptData));
            localStorage.setItem('skriptlab_raw_text', getFullManuscriptText(window.manuscriptData));
            updateAvailableProject(window.manuscriptData);
            window.updateDynamicTexts();
            renderAnalysisSummary(window.manuscriptData.analysis);
            renderBookOverview();
            renderWritingView();
            if (window.renderNavList) window.renderNavList();
            updateTranslationProjectSelect();

            if (showFeedback && !hasSavedAnalysis(window.manuscriptData.analysis)) {
                alert('Tälle käsikirjoitukselle ei löytynyt vielä tallennettua analyysiä.');
            }
        } catch (err) {
            if (showFeedback) alert(err.message);
            console.warn('Tallennetun analyysin lataus epäonnistui:', err);
        } finally {
            if (loadSavedAnalysisBtn && showFeedback) {
                loadSavedAnalysisBtn.disabled = false;
                loadSavedAnalysisBtn.textContent = originalText || 'Lataa tallennettu analyysi';
            }
        }
    }

    function applyBookReaderSettings() {
        const textEl = document.getElementById('book-full-text');
        if (!textEl) return;
        const font = document.getElementById('book-font-select')?.value || 'serif';
        const size = document.getElementById('book-font-size-select')?.value || 'medium';
        const width = document.getElementById('book-width-select')?.value || 'medium';
        textEl.classList.remove(
            'book-font-serif',
            'book-font-sans',
            'book-font-mono',
            'book-size-xsmall',
            'book-size-small',
            'book-size-medium',
            'book-size-large',
            'book-size-xlarge',
            'book-width-narrow',
            'book-width-medium',
            'book-width-wide'
        );
        textEl.classList.add(`book-font-${font}`, `book-size-${size}`, `book-width-${width}`);
    }

    function renderBookOverview() {
        const titleEl = document.getElementById('book-preview-title');
        const textEl = document.getElementById('book-full-text');
        if (!titleEl || !textEl) return;
        applyBookReaderSettings();
        if (!window.manuscriptData) {
            titleEl.textContent = 'Ei valittua käsikirjoitusta';
            textEl.textContent = 'Lataa tai valitse käsikirjoitus ensin Käsikirjoitukseni-näkymässä.';
            return;
        }
        const title = window.manuscriptData.title || 'Nimetön käsikirjoitus';
        const author = window.manuscriptData.author || 'Tuntematon';
        titleEl.textContent = `${title} - ${author}`;
        textEl.textContent = getFullManuscriptText() || 'Käsikirjoituksessa ei ole vielä tekstiä.';
    }

    function downloadCurrentBookText() {
        if (!window.manuscriptData) {
            alert('Valitse tai lataa käsikirjoitus ensin.');
            return;
        }
        const text = getFullManuscriptText();
        if (!text.trim()) {
            alert('Käsikirjoituksessa ei ole ladattavaa tekstiä.');
            return;
        }
        const safeTitle = (window.manuscriptData.title || 'kasikirjoitus')
            .toLowerCase()
            .replace(/[^a-z0-9åäö]+/gi, '_')
            .replace(/^_+|_+$/g, '') || 'kasikirjoitus';
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${safeTitle}.txt`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function requestLayoutOffer(serviceName) {
        const title = window.manuscriptData?.title || 'käsikirjoitus';
        const subject = encodeURIComponent(`Taittotarjous: ${serviceName}`);
        const body = encodeURIComponent(`Hei,\n\nHaluaisin pyytää tarjouksen palvelusta: ${serviceName}\nKäsikirjoitus: ${title}\n\nLisätiedot:\n`);
        window.location.href = `mailto:skriptlab@skriptlab.com?subject=${subject}&body=${body}`;
    }

    let writingSelection = { cIndex: null, pIndex: null };

    function persistManuscriptEdits() {
        if (!window.manuscriptData) return;
        window.saveManuscriptToDB(window.manuscriptData);
        localStorage.setItem('skriptlab_raw_text', getFullManuscriptText(window.manuscriptData));
        renderBookOverview();
        if (window.renderNavList) window.renderNavList();
    }

    function renderWritingView() {
        const chapterList = document.getElementById('writing-chapter-list');
        const titleEl = document.getElementById('writing-selection-title');
        const textEl = document.getElementById('writing-text');
        if (!chapterList || !titleEl || !textEl) return;

        chapterList.innerHTML = '';
        if (!window.manuscriptData || !Array.isArray(window.manuscriptData.chapters) || window.manuscriptData.chapters.length === 0) {
            titleEl.textContent = 'Ei käsikirjoitusta';
            textEl.value = '';
            renderChapterParagraphNav(chapterList, null, null);
            return;
        }

        if (writingSelection.cIndex === null || !window.manuscriptData.chapters[writingSelection.cIndex]) {
            const firstChapterIndex = firstBodyChapterIndex(window.manuscriptData.chapters);
            writingSelection = { cIndex: firstChapterIndex, pIndex: 0 };
        }
        const activeChapter = window.manuscriptData.chapters[writingSelection.cIndex];
        if (!Array.isArray(activeChapter.paragraphs)) activeChapter.paragraphs = [];
        if (activeChapter.paragraphs.length === 0) activeChapter.paragraphs.push('');
        if (
            writingSelection.pIndex === null ||
            writingSelection.pIndex === undefined ||
            writingSelection.pIndex < 0 ||
            writingSelection.pIndex >= activeChapter.paragraphs.length
        ) {
            writingSelection.pIndex = 0;
        }

        renderChapterParagraphNav(chapterList, writingSelection.cIndex, writingSelection.pIndex, {
            onChapterSelect: cIndex => {
                saveWritingText(false);
                const nextPIndex = cIndex === writingSelection.cIndex ? writingSelection.pIndex : 0;
                writingSelection = { cIndex, pIndex: nextPIndex };
                renderWritingView();
            },
            onParagraphSelect: (cIndex, pIndex) => {
                saveWritingText(false);
                writingSelection = { cIndex, pIndex };
                renderWritingView();
            }
        });

        const selectedChapter = window.manuscriptData.chapters[writingSelection.cIndex];
        const selectedParagraph = selectedChapter?.paragraphs?.[writingSelection.pIndex] || '';
        titleEl.textContent = selectedChapter
            ? `${selectedChapter.title}, kappale ${writingSelection.pIndex + 1}`
            : 'Valitse kappale';
        textEl.value = selectedParagraph;
    }

    function saveWritingText(showAlert = true) {
        const textEl = document.getElementById('writing-text');
        if (!textEl || !window.manuscriptData) return;
        const chapter = window.manuscriptData.chapters?.[writingSelection.cIndex];
        if (!chapter || writingSelection.pIndex === null) return;
        chapter.paragraphs[writingSelection.pIndex] = textEl.value.trim();
        persistManuscriptEdits();
        if (showAlert) alert('Teksti tallennettu.');
    }

    function addWritingParagraph() {
        if (!window.manuscriptData) {
            alert('Lataa tai valitse käsikirjoitus ensin.');
            return;
        }
        const chapterIndex = writingSelection.cIndex ?? firstBodyChapterIndex(window.manuscriptData.chapters);
        const chapter = window.manuscriptData.chapters[chapterIndex];
        if (!chapter) return;
        chapter.paragraphs.push('');
        writingSelection = { cIndex: chapterIndex, pIndex: chapter.paragraphs.length - 1 };
        renderWritingView();
    }

    function deleteWritingParagraph() {
        if (!window.manuscriptData) {
            alert('Lataa tai valitse käsikirjoitus ensin.');
            return;
        }
        const chapter = window.manuscriptData.chapters?.[writingSelection.cIndex];
        if (!chapter || writingSelection.pIndex === null || writingSelection.pIndex === undefined) {
            alert('Valitse poistettava kappale ensin.');
            return;
        }
        if (!confirm(`Poistetaanko kappale ${writingSelection.pIndex + 1}?`)) return;
        chapter.paragraphs.splice(writingSelection.pIndex, 1);
        if (chapter.paragraphs.length === 0) chapter.paragraphs.push('');
        writingSelection.pIndex = Math.min(writingSelection.pIndex, chapter.paragraphs.length - 1);
        persistManuscriptEdits();
        renderWritingView();
    }

    function updateUsagePanel(data) {
        if (!usageEls.box || !data) return;
        const analysisCountPercent = usagePercent(data.monthly_analysis_used, data.monthly_analysis_limit);
        const analysisCharsPercent = usagePercent(data.monthly_analysis_chars_used, data.monthly_analysis_chars_limit);
        const editCountPercent = usagePercent(data.monthly_paragraph_edit_used, data.monthly_paragraph_edit_limit);
        const editCharsPercent = usagePercent(data.monthly_paragraph_edit_chars_used, data.monthly_paragraph_edit_chars_limit);
        const analysisPercent = Math.max(analysisCountPercent, analysisCharsPercent);
        const editPercent = Math.max(editCountPercent, editCharsPercent);

        usageEls.analysisText.textContent = `${data.monthly_analysis_used}/${data.monthly_analysis_limit}`;
        usageEls.analysisBar.style.width = `${analysisPercent}%`;
        usageEls.analysisChars.textContent = `Max ${formatNumber(data.max_analysis_chars)} merkkiä / analyysi, ${formatNumber(data.monthly_analysis_chars_used)}/${formatNumber(data.monthly_analysis_chars_limit)} merkkiä / kk`;

        usageEls.editText.textContent = `${data.monthly_paragraph_edit_used}/${data.monthly_paragraph_edit_limit}`;
        usageEls.editBar.style.width = `${editPercent}%`;
        usageEls.editChars.textContent = `Max ${formatNumber(data.max_paragraph_edit_chars)} merkkiä / muokkaus, ${formatNumber(data.monthly_paragraph_edit_chars_used)}/${formatNumber(data.monthly_paragraph_edit_chars_limit)} merkkiä / kk`;

        usageEls.status.textContent = analysisPercent >= 100 || editPercent >= 100
            ? 'Kuukausiraja täynnä. Ota yhteys ylläpitoon.'
            : 'Rajat päivittyvät onnistuneiden ajojen jälkeen.';
    }

    async function loadUsage() {
        if (!usageEls.box) return;
        try {
            const res = await apiFetch('/api/usage/me');
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Käyttörajojen lataus epäonnistui.');
            updateUsagePanel(data);
        } catch (err) {
            if (usageEls.status) usageEls.status.textContent = err.message;
        }
    }

    async function apiErrorMessage(res, fallback) {
        const data = await res.json().catch(() => null);
        const detail = data?.detail || fallback;
        if (res.status === 429) {
            return `${detail} Käyttörajasi näkyvät vasemmassa sivupalkissa.`;
        }
        if (res.status === 413) {
            return `${detail} Lyhennä tekstiä tai jaa työ pienempiin osiin.`;
        }
        if (res.status === 422) {
            return `${detail} Voit kokeilla lyhyempää katkelmaa, muotoilla pyynnön toimituksellisemmaksi tai pyytää ylläpitoa kokeilemaan toista sallittua mallia.`;
        }
        if (res.status === 502) {
            return `Palvelu ei juuri nyt vastannut odotetusti. ${detail}`;
        }
        return detail;
    }

    // --- 1. Top Bar Logic ---
    const toggleSidebarBtn = document.getElementById('toggle-sidebar');
    const sidebar = document.getElementById('sidebar');
    
    toggleSidebarBtn.addEventListener('click', () => {
        sidebar.classList.toggle('hidden');
    });

    const toggleThemeBtn = document.getElementById('toggle-theme');
    toggleThemeBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        if(currentTheme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'light');
            toggleThemeBtn.textContent = '☀️';
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            toggleThemeBtn.textContent = '🌓';
        }
    });

    const toggleLangBtn = document.getElementById('toggle-lang');
    toggleLangBtn.addEventListener('click', () => {
        if (toggleLangBtn.textContent === 'FI / ENG') {
            toggleLangBtn.textContent = 'ENG / FI';
        } else {
            toggleLangBtn.textContent = 'FI / ENG';
        }
    });

    const toggleMobileBtn = document.getElementById('toggle-mobile');
    const appWrapper = document.getElementById('app-wrapper');
    toggleMobileBtn.addEventListener('click', () => {
        appWrapper.classList.toggle('mobile-simulate');
    });

    // --- 2. SPA Navigation Logic ---
    const navItems = document.querySelectorAll('#nav-menu li[data-view]');
    const views = document.querySelectorAll('.view-section');

    function isViewAllowed(viewId) {
        if (canSeeAllModules) return true;
        if (currentUser && currentUser.role === 'kaantaja') return translatorViews.has(viewId);
        return betaCoreViews.has(viewId);
    }

    navItems.forEach(item => {
        const viewId = item.getAttribute('data-view');
        if (!isViewAllowed(viewId)) {
            item.hidden = true;
        }
    });

    function openModule(viewId) {
        if (!isViewAllowed(viewId)) {
            viewId = 'view-kirjani';
        }

        views.forEach(v => v.classList.add('hidden'));
        const targetView = document.getElementById(viewId);
        if(targetView) targetView.classList.remove('hidden');

        navItems.forEach(item => {
            if(item.getAttribute('data-view') === viewId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            openModule(item.getAttribute('data-view'));
            if (item.getAttribute('data-view') === 'view-kirja') {
                renderBookOverview();
            }
            if (item.getAttribute('data-view') === 'view-kirjoita') {
                renderWritingView();
            }
            if (item.getAttribute('data-view') === 'view-analyysi') {
                loadSavedAnalysisForActiveProject(false);
            }
            if (item.getAttribute('data-view') === 'view-kaannokset') {
                loadTranslationModels();
                updateTranslationProjectSelect();
                updateTranslationEstimate();
            }
            if(item.getAttribute('data-view') !== 'view-kirjani') {
                document.getElementById('top-book-name').textContent = window.manuscriptData
                    ? `Käsikirjoitus: ${window.manuscriptData.title}`
                    : 'Käsikirjoitus: Valitse projekti...';
            } else {
                document.getElementById('top-book-name').textContent = 'Käsikirjoitus: Valitse projekti...';
            }
        });
    });
    
    // Alistetaan globaaliksi, jotta onclickit HTML:ssä toimivat
    window.openModule = openModule;


    // --- 3. Analysis Simulation Logic ---
    const runAnalysisBtn = document.getElementById('run-analysis-btn');
    const analysisLoader = document.getElementById('analysis-loader');
    const analysisResults = document.getElementById('analysis-results');
    const loadSavedAnalysisBtn = document.getElementById('load-saved-analysis-btn');
    const saveAnalysisBtn = document.getElementById('save-analysis-btn');
    const toggleAnalysisEditorBtn = document.getElementById('toggle-analysis-editor-btn');
    const toggleAnalysisMetaBtn = document.getElementById('toggle-analysis-meta-btn');
    const sidebarStyle = document.getElementById('sidebar-style');
    const sidebarVocab = document.getElementById('sidebar-vocab');

    if (saveAnalysisBtn) {
        saveAnalysisBtn.addEventListener('click', saveAnalysisFromEditor);
    }
    if (toggleAnalysisEditorBtn) {
        toggleAnalysisEditorBtn.addEventListener('click', () => {
            const editor = document.getElementById('analysis-editor');
            if (!editor) return;
            setAnalysisEditorOpen(editor.classList.contains('hidden'));
        });
    }
    if (toggleAnalysisMetaBtn) {
        toggleAnalysisMetaBtn.addEventListener('click', () => {
            const editor = document.getElementById('analysis-meta-editor');
            if (!editor) return;
            setAnalysisMetadataOpen(editor.classList.contains('hidden'));
        });
    }
    if (loadSavedAnalysisBtn) {
        loadSavedAnalysisBtn.addEventListener('click', () => {
            loadSavedAnalysisForActiveProject(true);
        });
    }

    if(runAnalysisBtn) {
        runAnalysisBtn.addEventListener('click', () => {
            runAnalysisBtn.style.display = 'none';
            analysisLoader.classList.remove('hidden');
            
            // Käynnistetään ajastin
            let analysisSeconds = 0;
            const timerEl = document.getElementById('analysis-timer');
            const analysisInterval = setInterval(() => {
                analysisSeconds++;
                const m = Math.floor(analysisSeconds / 60);
                const s = analysisSeconds % 60;
                if(timerEl) timerEl.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
            }, 1000);
            
            // Haetaan ladattu raakateksti lokaalista muistista
            const rawMsText = localStorage.getItem('skriptlab_raw_text') || getFullManuscriptText();
            if(!rawMsText) {
                clearInterval(analysisInterval);
                alert('Käsikirjoitusta ei ole vielä ladattu oikein! Lataa tiedosto Käsikirjoitukseni-näkymästä ensin.');
                analysisLoader.classList.add('hidden');
                runAnalysisBtn.style.display = 'block';
                return;
            }

            Promise.resolve().then(async () => {
                let projectId = window.manuscriptData?.id || null;
                if (!projectId && window.manuscriptData) {
                    const savedProject = await window.saveManuscriptToDB(window.manuscriptData);
                    projectId = savedProject?.id || null;
                    if (savedProject?.id) window.manuscriptData = savedProject;
                }
                return apiFetch('/api/analyze', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({text: rawMsText, project_id: projectId})
                });
            })
            .then(async res => {
                if(!res.ok) {
                    throw new Error(await apiErrorMessage(res, "Analyysi epäonnistui."));
                }
                return res.json();
            })
            .then(async data => {
                clearInterval(analysisInterval);
                analysisLoader.classList.add('hidden');
                analysisResults.classList.remove('hidden');
                
                if(data.status === "success" && data.data) {
                    const r = data.data;
                    if (window.manuscriptData) {
                        window.manuscriptData.analysis = r;
                        const savedProject = await window.saveManuscriptToDB(window.manuscriptData);
                        if (savedProject?.id) {
                            window.manuscriptData = savedProject;
                            updateAvailableProject(savedProject);
                        }
                    }
                    
                    renderAnalysisSummary(r);
                    renderAnalysisSections(r);
                    runAnalysisBtn.style.display = 'block';
                    runAnalysisBtn.textContent = '🔄 Analysoi Uudelleen';
                    
                    // Päivitetään sivupalkin tyyli- ja sanastotiedot
                    sidebarStyle.textContent = r.style ? "Tyyli valmis" : "Virhe";
                    sidebarVocab.textContent = r.glossary ? "Valmis sanasto" : "-";
                    sidebarStyle.style.color = "var(--ai-gradient-start)";
                    sidebarVocab.style.color = "var(--ai-gradient-start)";
                    
                    // Korvataan aiempi lokaali regex-ratkaisu TODELLISELLA RAKENTEELLA!
                    let structData = r.structure;
                    // Jos structure tuli stringinä, yritetään parsia
                    if (typeof structData === 'string' && structData.length > 2) {
                        try {
                            let si = structData.indexOf('[');
                            let ei = structData.lastIndexOf(']');
                            if (si !== -1 && ei !== -1) {
                                structData = JSON.parse(structData.substring(si, ei + 1));
                            }
                        } catch(parseErr) {
                            console.error('Structure-JSON parsinta epäonnistui:', parseErr);
                            structData = null;
                        }
                    }
                    
                    if(structData && Array.isArray(structData) && structData.length > 0) {
                       // Muunnetaan Analyzerin JSON-rakenne meidän Frontend-manuscriptData formaattiin:
                       let freshChapters = structData.map((item, idx) => {
                           let cId = item.id || `luku_${idx}`;
                           // Tuki sekä 'title'/'nimi' kenttänimille
                           let cTitle = item.title || item.nimi || (cId === "alku" ? "Alku / Nimiölehti" : (cId === "sisallys" ? "Sisällysluettelo" : cId));
                           // Tuki sekä 'paragraphs'/'kappaleet' kenttänimille
                           let cParagraphs = item.paragraphs || item.kappaleet || [];
                           let cleanedParagraphs = cParagraphs.map(p => p.replace(/<KAPPALE[\d]+>/gi, '').replace(/<KAPPALE>/gi, '').trim());
                           return {
                               id: cId,
                               title: cTitle,
                               paragraphs: cleanedParagraphs
                           };
                       });
                       if(window.manuscriptData) {
                           window.manuscriptData.chapters = freshChapters;
                       } else {
                           // Fallback
                           window.manuscriptData = { title: "A", author: "B", chapters: freshChapters };
                       }
                       // Tallennetaan pysyvästi
                       const savedProject = await window.saveManuscriptToDB(window.manuscriptData);
                       if (savedProject?.id) {
                           window.manuscriptData = savedProject;
                           updateAvailableProject(savedProject);
                       }
                       renderBookOverview();
                       // Kutsutaan UI refresh
                       if(window.renderNavList) window.renderNavList();
                       loadUsage();
                    } else {
                         alert("Varoitus: Skripti vastasi, mutta ei pystynyt erittelemään kappaleita (structure dict puuttuu)");
                    }
                    
                } else {
                     throw new Error("Data response viallinen");
                }
            })
            .catch(e => {
                clearInterval(analysisInterval);
                alert('Analyysi epäonnistui:\n' + networkFailureMessage(e));
                analysisLoader.classList.add('hidden');
                runAnalysisBtn.style.display = 'block';
                loadUsage();
            });
        });
    }

    // --- 4. Split-Screen Editor Logic ---
    const aiBtn = document.getElementById('ai-improve-btn');
    const editableText = document.getElementById('edited-text');
    const editScopeSelect = document.getElementById('edit-scope');
    const editorWorkspace = document.getElementById('editor-workspace');
    const toggleEditorNavBtn = document.getElementById('toggle-editor-nav-btn');
    const toggleEditorCommentsBtn = document.getElementById('toggle-editor-comments-btn');

    function setAiButtonIdle() {
        if (aiBtn) aiBtn.innerHTML = '<span class="sparkle">✨</span><br>Analysoi ja ehdota';
    }

    function selectedEditText() {
        const sel = window.currentEditSelection || {};
        if (sel.cIndex === null || sel.cIndex === undefined || !window.manuscriptData?.chapters?.[sel.cIndex]) {
            return '';
        }
        const chapter = window.manuscriptData.chapters[sel.cIndex];
        if (editScopeSelect && editScopeSelect.value === 'chapter') {
            return (chapter.paragraphs || []).join('\n\n').trim();
        }
        return (chapter.paragraphs?.[sel.pIndex] || '').trim();
    }

    function refreshEditableTextForScope() {
        if (!editableText) return;
        const text = selectedEditText();
        if (text) setEditableText(text);
    }

    function getEditableText() {
        if (!editableText) return '';
        return (editableText.innerText || editableText.textContent || '').replace(/\u00a0/g, ' ');
    }

    function setEditableText(value) {
        if (!editableText) return;
        editableText.classList.remove('has-diff');
        editableText.textContent = value || '';
    }

    function setEditableDiffText(original, edited) {
        if (!editableText) return;
        if (!edited.trim() || normalizeText(original) === normalizeText(edited)) {
            setEditableText(edited);
            return;
        }
        editableText.innerHTML = buildDiffHtml(original, edited);
        editableText.classList.add('has-diff');
    }

    function renderEditedDiffPreview() {
        if (!editableText) return;
        const original = selectedEditText();
        const edited = getEditableText();
        setEditableDiffText(original, edited);
    }

    function updateEditorGrid() {
        if (!editorWorkspace) return;
        const hideNav = editorWorkspace.classList.contains('hide-editor-nav');
        const hideComments = editorWorkspace.classList.contains('hide-editor-comments');
        const columns = [];
        if (!hideNav) columns.push('220px');
        columns.push('minmax(0, 1fr)', 'minmax(0, 1fr)', '160px');
        if (!hideComments) columns.push('240px');
        editorWorkspace.style.gridTemplateColumns = columns.join(' ');
    }

    const geminiMagicText = `Musta pimeys kietoi ikiaikaisen varjometsän syliinsä, ja puut piirtyivät taivasta vasten kuin sysimustat kynnet. Jokin liikkui äänettömästi aluskasvillisuuden seassa – askeleet olivat huomaamattomat, mutta ilmassa lepäsi odottava jännite. Hahmo oli epäilemättä taikaolennon kaltainen; ehkäpä matkalainen etsimässä loistavaa kiveä.
    
"Totisesti, täällä noitien pimeys on valtaisa," hahmo lausui, ja sen ääni muistutti kuivien lehtien rapinaa.`;

    if(aiBtn) {
        aiBtn.addEventListener('click', () => {
            const sourceText = selectedEditText();
            if (!sourceText || sourceText.length < 5) {
                alert('Valitse ensin luku tai kappale navigoinnista ennen muokkausta.');
                return;
            }
            
            setEditableText('');
            aiBtn.innerHTML = '<span class="sparkle">⏳</span><br>Analysoin...';
            aiBtn.style.pointerEvents = 'none';
            
            const promptEl = document.getElementById('toimitus-prompt');
            const editPrompt = promptEl ? promptEl.value : 'Korjaa virheet ja sujuvoita.';
            const tempEl = document.getElementById('temp-val');
            const temperature = tempEl ? parseFloat(tempEl.textContent) : 0.3;
            renderEditedDiffPreview();
            
            apiFetch('/api/edit', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({text: sourceText, prompt: editPrompt, temperature: temperature})
            })
            .then(async res => {
                if(!res.ok) {
                    throw new Error(await apiErrorMessage(res, 'Toimitus epäonnistui.'));
                }
                return res.json();
            })
            .then(data => {
                if (data.status === 'success' && data.edited_text) {
                    loadUsage();
                    // Typewriter-efekti
                    const geminiResult = data.edited_text;
                    let i = 0;
                    const typeWriter = () => {
                        if (i < geminiResult.length) {
                            editableText.textContent = getEditableText() + geminiResult.charAt(i);
                            i++;
                            setTimeout(typeWriter, 8);
                        } else {
                            setAiButtonIdle();
                            aiBtn.style.pointerEvents = 'auto';
                            editableText.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
                            renderEditedDiffPreview();
                            setTimeout(() => { editableText.style.backgroundColor = 'transparent'; }, 600);
                        }
                    };
                    typeWriter();
                } else {
                    throw new Error('Vastauksessa ei muokattua tekstiä');
                }
            })
            .catch(err => {
                alert('Toimitus epäonnistui: ' + err.message);
                setAiButtonIdle();
                aiBtn.style.pointerEvents = 'auto';
                loadUsage();
            });
        });
    }

    if (editScopeSelect) {
        editScopeSelect.addEventListener('change', refreshEditableTextForScope);
    }

    if (toggleEditorNavBtn && editorWorkspace) {
        toggleEditorNavBtn.addEventListener('click', () => {
            editorWorkspace.classList.toggle('hide-editor-nav');
            const hidden = editorWorkspace.classList.contains('hide-editor-nav');
            toggleEditorNavBtn.textContent = hidden ? 'Näytä navigaatio' : 'Piilota navigaatio';
            updateEditorGrid();
        });
    }

    if (toggleEditorCommentsBtn && editorWorkspace) {
        toggleEditorCommentsBtn.addEventListener('click', () => {
            editorWorkspace.classList.toggle('hide-editor-comments');
            const hidden = editorWorkspace.classList.contains('hide-editor-comments');
            toggleEditorCommentsBtn.textContent = hidden ? 'Näytä kommentit' : 'Piilota kommentit';
            updateEditorGrid();
        });
    }

    // --- Yleiset UI funktiot ---
    window.updateDynamicTexts = function() {
        if (!window.manuscriptData) return;
        const title = window.manuscriptData.title || "Nimetön";
        const author = window.manuscriptData.author || "Tuntematon";
        
        const topBookName = document.getElementById('top-book-name');
        if (topBookName) {
            topBookName.textContent = `Käsikirjoitus: ${title} (${author})`;
        }
        const sidebarCurrentTitle = document.getElementById('sidebar-current-title');
        if (sidebarCurrentTitle) {
            sidebarCurrentTitle.textContent = title;
        }
        const analysis = window.manuscriptData.analysis || {};
        const sidebarStyle = document.getElementById('sidebar-style');
        const sidebarVocab = document.getElementById('sidebar-vocab');
        if (sidebarStyle) {
            sidebarStyle.textContent = hasSavedAnalysis(analysis) ? 'Analyysi valmis' : 'Odottaa analyysiä...';
            sidebarStyle.style.color = hasSavedAnalysis(analysis) ? 'var(--ai-gradient-start)' : '';
        }
        if (sidebarVocab) {
            sidebarVocab.textContent = analysis.glossary ? 'Valmis sanasto' : '-';
            sidebarVocab.style.color = analysis.glossary ? 'var(--ai-gradient-start)' : '';
        }
        
        const th = document.getElementById('toimitus-book-title');
        if (th) th.innerHTML = `${title} <span class="badge">Luonnos</span>`;
        
        document.querySelectorAll('.view-section .header-info p').forEach(p => {
            if (p.id === "toimitus-book-chapter") return; 
            let txt = p.textContent;
            if (txt.startsWith("Käsikirjoitus:") || txt.startsWith("Käsikirjoitukseen:")) {
                let prefix = txt.startsWith("Käsikirjoitus:") ? "Käsikirjoitus: " : "Käsikirjoitukseen: ";
                let suffixMatch = txt.match(/(\(.*)/);
                let suffix = suffixMatch ? suffixMatch[0] : "";
                p.textContent = prefix + title + " " + suffix;
            }
        });
    };

    // --- 5. Kuvitus Logic ---
    window.generateCover = function(num) {
        const box = document.getElementById(`cover${num}-box`);
        box.innerHTML = `<div style="text-align:center; padding:40px;"><span class="sparkle glow-text" style="font-size:24px;">⏳</span><br><p style="color:var(--text-secondary); margin-top:12px;">Maalataan (Midjourney/Dall-e)...</p></div>`;
        setTimeout(() => {
            box.innerHTML = `<img src="cover_${num}.png" style="width:100%; border-radius:12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); animation: fadeIn 0.5s ease;">`;
        }, 1500);
    };

    // --- 6. Global Task Manager ---
    window.startLongTask = function(title, desc, durationSeconds) {
        const overlay = document.getElementById('global-task-overlay');
        const titleEl = document.getElementById('task-title');
        const descEl = document.getElementById('task-desc');
        const barEl = document.getElementById('task-progress-bar');
        const timeEl = document.getElementById('task-time-left');
        const percentEl = document.getElementById('task-percent');
        const closeBtn = document.getElementById('task-close-btn');

        if(!overlay) return;

        overlay.classList.remove('hidden');
        if(closeBtn) closeBtn.classList.add('hidden');
        
        titleEl.textContent = title;
        descEl.textContent = desc;
        barEl.style.width = '0%';
        percentEl.textContent = '0%';
        
        let timeLeft = durationSeconds;
        const total = durationSeconds;
        
        const formatTime = (secs) => {
            const m = Math.floor(secs / 60);
            const s = Math.floor(secs % 60);
            return `${m} min ${s < 10 ? '0' : ''}${s} s`;
        };
        
        timeEl.textContent = `Arvioitu aika: ${formatTime(timeLeft)}`;

        const interval = setInterval(() => {
            timeLeft -= 1;
            if (timeLeft <= 0) {
                clearInterval(interval);
                barEl.style.width = '100%';
                percentEl.textContent = '100%';
                timeEl.textContent = 'Valmis!';
                titleEl.textContent = '✨ Tehtävä suoritettu';
                if(closeBtn) closeBtn.classList.remove('hidden');
            } else {
                const p = Math.floor(((total - timeLeft) / total) * 100);
                barEl.style.width = `${p}%`;
                percentEl.textContent = `${p}%`;
                timeEl.textContent = `Arvioitu aika: ${formatTime(timeLeft)}`;
            }
        }, 1000);
    };

    const refreshBookPreviewBtn = document.getElementById('refresh-book-preview-btn');
    const downloadBookTextBtn = document.getElementById('download-book-text-btn');
    const layoutOfferEbookBtn = document.getElementById('layout-offer-ebook-btn');
    const layoutOfferPrintBtn = document.getElementById('layout-offer-print-btn');
    const bookFontSelect = document.getElementById('book-font-select');
    const bookFontSizeSelect = document.getElementById('book-font-size-select');
    const bookWidthSelect = document.getElementById('book-width-select');
    const saveWritingBtn = document.getElementById('save-writing-btn');
    const addWritingParagraphBtn = document.getElementById('add-writing-paragraph-btn');
    const deleteWritingParagraphBtn = document.getElementById('delete-writing-paragraph-btn');

    if (refreshBookPreviewBtn) refreshBookPreviewBtn.addEventListener('click', renderBookOverview);
    if (downloadBookTextBtn) downloadBookTextBtn.addEventListener('click', downloadCurrentBookText);
    if (layoutOfferEbookBtn) layoutOfferEbookBtn.addEventListener('click', () => requestLayoutOffer('E-kirja'));
    if (layoutOfferPrintBtn) layoutOfferPrintBtn.addEventListener('click', () => requestLayoutOffer('Painovalmis PDF'));
    [bookFontSelect, bookFontSizeSelect, bookWidthSelect].forEach(select => {
        if (select) select.addEventListener('change', applyBookReaderSettings);
    });
    if (saveWritingBtn) saveWritingBtn.addEventListener('click', () => saveWritingText(true));
    if (addWritingParagraphBtn) addWritingParagraphBtn.addEventListener('click', addWritingParagraph);
    if (deleteWritingParagraphBtn) deleteWritingParagraphBtn.addEventListener('click', deleteWritingParagraph);

    function createManuscriptFromText(title, text) {
        let bookData = {
            title: title,
            author: "Tuntematon",
            source_filename: "",
            chapters: [],
            analysis: {}
        };

        const rawLines = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
        let currentChapter = { id: "alku", title: "Alku / Nimiölehti", paragraphs: [] };
        let sisallysFound = false;
        let lukuCount = 0;

        for (let line of rawLines) {
            let lowerLine = line.toLowerCase().trim();
            if (!sisallysFound && lukuCount === 0 && (lowerLine === "sisällys" || lowerLine === "sisällysluettelo" || lowerLine === "table of contents" || lowerLine === "toc")) {
                if (currentChapter.paragraphs.length > 0) bookData.chapters.push(currentChapter);
                currentChapter = { id: "sisallys", title: "Sisällysluettelo", paragraphs: [] };
                sisallysFound = true;
                currentChapter.paragraphs.push(line);
                continue;
            }

            let isChapter = /^luku\s*\d+/i.test(lowerLine)
                         || /^chapter\s*\d+/i.test(lowerLine)
                         || /^osa\s*\d+/i.test(lowerLine)
                         || /^\d+\.\s*$/.test(lowerLine)
                         || /^([IVXLC]+\.)\s*$/.test(lowerLine)
                         || (lowerLine.length > 2 && lowerLine.length < 50 && !/[.!?:]/.test(lowerLine) && currentChapter.paragraphs.length > 2);

            if (isChapter) {
                if (currentChapter.paragraphs.length > 0 || currentChapter.id !== "alku") {
                    bookData.chapters.push(currentChapter);
                }
                lukuCount++;
                currentChapter = { id: `luku_${lukuCount}`, title: line.substring(0, 50), paragraphs: [] };
            } else {
                currentChapter.paragraphs.push(line);
            }
        }
        if (currentChapter.paragraphs.length > 0 || currentChapter.title.toLowerCase().startsWith("luku")) {
            bookData.chapters.push(currentChapter);
        }

        if (!bookData.chapters.find(c => c.id === "alku")) {
            bookData.chapters.unshift({ id: "alku", title: "Alku / Nimiölehti", paragraphs: ["(Ei erillistä alku-osaa havaittu)"] });
        }
        if (!bookData.chapters.find(c => c.id === "sisallys")) {
            bookData.chapters.splice(1, 0, { id: "sisallys", title: "Sisällysluettelo", paragraphs: ["(Ei sisällysluetteloa havaittu)"] });
        }

        return bookData;
    }

    function clearActiveManuscript() {
        window.manuscriptData = null;
        localStorage.removeItem('skriptlab_manuscript');
        localStorage.removeItem('skriptlab_raw_text');
        localStorage.removeItem(ACTIVE_PROJECT_ID_KEY);

        const topBookName = document.getElementById('top-book-name');
        if (topBookName) topBookName.textContent = 'Käsikirjoitus: Valitse projekti...';
        const sidebarCurrentTitle = document.getElementById('sidebar-current-title');
        if (sidebarCurrentTitle) sidebarCurrentTitle.textContent = 'Ei käsikirjoitusta';
        const sidebarStyle = document.getElementById('sidebar-style');
        if (sidebarStyle) {
            sidebarStyle.textContent = 'Odottaa analyysiä...';
            sidebarStyle.style.color = '';
        }
        const sidebarVocab = document.getElementById('sidebar-vocab');
        if (sidebarVocab) {
            sidebarVocab.textContent = '-';
            sidebarVocab.style.color = '';
        }
        renderAnalysisSummary(null);
        renderBookOverview();
        renderWritingView();
        if (window.renderNavList) window.renderNavList();
        updateTranslationProjectSelect();
    }

    function setActiveManuscript(data) {
        if (!data) {
            clearActiveManuscript();
            return;
        }
        window.manuscriptData = data;
        if (!window.manuscriptData.analysis) window.manuscriptData.analysis = {};
        localStorage.setItem('skriptlab_manuscript', JSON.stringify(window.manuscriptData));
        localStorage.setItem('skriptlab_raw_text', getFullManuscriptText(window.manuscriptData));
        if (data.id) localStorage.setItem(ACTIVE_PROJECT_ID_KEY, String(data.id));
        window.updateDynamicTexts();
        renderAnalysisSummary(window.manuscriptData.analysis);
        renderBookOverview();
        renderWritingView();
        if (window.renderNavList) window.renderNavList();
    }

    function emptyProjectMessage() {
        return `<div style="color:var(--text-secondary); font-size:14px; padding:20px;">
            Ohjelmistossa ei ole vielä aktiivisia käsikirjoitushankkeita ladattuna.<br>
            Käytä <strong>Lataa Käsikirjoitus</strong> -painiketta aloittaaksesi uuden hankkeen editoinnin.
        </div>`;
    }

    function projectAccessLevel(data) {
        if (data.access_level) return data.access_level;
        if (!data.owner_user_id || (currentUser && Number(data.owner_user_id) === Number(currentUser.id))) return 'owner';
        return 'shared_edit';
    }

    function canEditProject(data) {
        return ['admin', 'owner', 'shared_edit'].includes(projectAccessLevel(data));
    }

    function canManageProject(data) {
        return ['admin', 'owner'].includes(projectAccessLevel(data));
    }

    function projectAccessLabel(data) {
        const level = projectAccessLevel(data);
        if (level === 'admin') return 'Admin-näkymä';
        if (level === 'owner') return 'Oma käsikirjoitus';
        if (level === 'shared_view') return 'Jaettu sinulle';
        if (level === 'shared_edit') return 'Jaettu sinulle';
        return 'Käsikirjoitus';
    }

    function projectOwnerLine(data) {
        if (!data.owner_email || (currentUser && Number(data.owner_user_id) === Number(currentUser.id))) return '';
        const owner = data.owner_display_name || data.owner_email;
        return `<p class="card-meta">Omistaja: ${escapeHtml(owner)}</p>`;
    }

    function projectSharedLine(data) {
        if (!Array.isArray(data.shared_with) || data.shared_with.length === 0) return '';
        const names = data.shared_with
            .map(share => share.display_name || share.email)
            .filter(Boolean)
            .slice(0, 3)
            .join(', ');
        const suffix = data.shared_with.length > 3 ? ` +${data.shared_with.length - 3}` : '';
        return `<p class="card-meta">Jaettu: ${escapeHtml(names + suffix)}</p>`;
    }

    function projectShareControls(data) {
        if (!data.id || !canManageProject(data)) return '';
        return `
            <div class="project-share-controls" style="margin-top:12px;" onclick="event.stopPropagation();">
                <label style="font-size:11px; color:var(--text-secondary); display:block; margin-bottom:6px;">Jaa käyttäjälle:</label>
                <div style="display:flex; gap:6px;">
                    <input type="email" class="share-email-input" placeholder="sähköposti" style="min-width:0; flex:1; background:rgba(255,255,255,0.06); border:1px solid var(--border-color); color:var(--text-primary); border-radius:6px; padding:7px 8px; font-family:inherit; font-size:12px;">
                    <button class="share-project-btn" style="padding:7px 10px; font-size:12px; border-radius:6px; border:1px solid var(--border-color); background:rgba(255,255,255,0.08); color:var(--text-primary); cursor:pointer;">Jaa</button>
                </div>
            </div>
        `;
    }

    function addManuscriptCard(data, statusText, gridCards) {
        gridCards = gridCards || document.querySelector('#view-kirjani .grid-cards');
        if (!gridCards) return;

        const editable = canEditProject(data);
        const manageable = canManageProject(data);
        const accessLabel = projectAccessLabel(data);
        const newCard = document.createElement('div');
        newCard.className = 'card glass-panel interactive';
        newCard.dataset.projectId = data.id || '';
        newCard.addEventListener('click', () => {
            setActiveManuscript(data);
            openModule('view-kirjoita');
            renderWritingView();
        });
        newCard.innerHTML = `
            <div style="font-size:30px; margin-bottom:4px;">📄</div>
            <input type="text" class="book-title-input" value="${escapeHtml(data.title)}" ${editable ? '' : 'readonly'} style="width:100%; font-size:18px; font-weight:bold; background:transparent; border:none; border-bottom:1px dashed rgba(255,255,255,0.3); color:var(--text-primary); font-family:inherit; outline:none; margin-bottom:8px; padding-bottom:4px;">
            <div style="margin-bottom:12px;" onclick="event.stopPropagation();">
                <label style="font-size:11px; color:var(--text-secondary);">Kirjailija:</label>
                <input type="text" class="book-author-input" value="${escapeHtml(data.author)}" ${editable ? '' : 'readonly'} style="width:100%; background:transparent; border:none; border-bottom:1px solid #333; color:var(--text-primary); font-family:inherit; font-size:13px; outline:none; padding:2px 0;">
            </div>
            <p class="card-meta">${escapeHtml(statusText)}</p>
            ${projectOwnerLine(data)}
            ${projectSharedLine(data)}
            <p class="card-status"><span class="badge">${escapeHtml(accessLabel)}</span></p>
            <p class="card-status"><span class="badge glowing">${analysisStatusLabel(data.analysis)}</span></p>
            ${projectShareControls(data)}
            ${manageable ? '<button class="delete-project-btn" style="margin-top:12px; padding:6px 12px; font-size:12px; background:rgba(255,50,50,0.2); color:var(--text-primary); border:1px solid rgba(255,50,50,0.5); border-radius:6px; cursor:pointer;">Poista teos</button>' : ''}
        `;
        const titleInput = newCard.querySelector('.book-title-input');
        const authorInput = newCard.querySelector('.book-author-input');
        const deleteBtn = newCard.querySelector('.delete-project-btn');
        const shareBtn = newCard.querySelector('.share-project-btn');
        const shareInput = newCard.querySelector('.share-email-input');
        [titleInput, authorInput].forEach(input => input.addEventListener('click', event => event.stopPropagation()));
        if (editable) {
            titleInput.addEventListener('change', () => {
                data.title = titleInput.value.trim() || 'Nimetön';
                if (window.manuscriptData && window.manuscriptData.id === data.id) window.manuscriptData.title = data.title;
                window.saveManuscriptToDB(data);
                window.updateDynamicTexts();
                renderBookOverview();
            });
            authorInput.addEventListener('change', () => {
                data.author = authorInput.value.trim() || 'Tuntematon';
                if (window.manuscriptData && window.manuscriptData.id === data.id) window.manuscriptData.author = data.author;
                window.saveManuscriptToDB(data);
                window.updateDynamicTexts();
                renderBookOverview();
            });
        }
        if (shareBtn && shareInput) {
            shareBtn.addEventListener('click', event => {
                event.stopPropagation();
                window.shareProject(data.id, shareInput.value.trim());
            });
        }
        if (deleteBtn) {
            deleteBtn.addEventListener('click', event => {
                event.stopPropagation();
                window.deleteManuscript(data.id);
            });
        }
        gridCards.appendChild(newCard);
    }

    function renderProjectCards(projects) {
        availableProjects = projects || [];
        const gridCards = document.querySelector('#view-kirjani .grid-cards');
        if (!gridCards) return;
        gridCards.innerHTML = '';
        if (!projects || projects.length === 0) {
            updateTranslationProjectSelect();
            gridCards.innerHTML = emptyProjectMessage();
            clearActiveManuscript();
            return;
        }

        projects.forEach(project => {
            addManuscriptCard(project, `Tallennettu tietokantaan (${getFullManuscriptText(project).length} merkkiä)`, gridCards);
        });

        const activeId = localStorage.getItem(ACTIVE_PROJECT_ID_KEY);
        const selected = activeId
            ? projects.find(project => String(project.id) === activeId)
            : (projects.length === 1 ? projects[0] : null);
        if (selected) {
            setActiveManuscript(selected);
        } else {
            clearActiveManuscript();
        }
        updateTranslationProjectSelect();
    }

    async function loadProjects() {
        const res = await apiFetch('/api/projects');
        if (!res.ok) throw new Error(await apiErrorMessage(res, 'Käsikirjoitusten lataus epäonnistui.'));
        const projects = await res.json();
        renderProjectCards(projects || []);
    }

    function currentTranslationProject() {
        const select = document.getElementById('translation-project-select');
        const selectedId = select?.value || window.manuscriptData?.id;
        if (!selectedId) return null;
        return availableProjects.find(project => String(project.id) === String(selectedId)) || null;
    }

    function projectTextForTranslation(project) {
        return project ? getFullManuscriptText(project) : '';
    }

    function translationStatusLabel(status) {
        const labels = {
            completed: 'Valmis',
            partial: 'Osittainen',
            reviewed: 'Tarkastettu'
        };
        return labels[status] || status || 'Luonnos';
    }

    function translationAnalysisMessage() {
        return 'Käännös vaatii ensin käsikirjoituksen analyysin. Tee analyysi Analyysi-välilehdellä tai paina siellä Lataa tallennettu analyysi.';
    }

    function updateTranslationAnalysisNotice(project = currentTranslationProject()) {
        const notice = document.getElementById('translation-analysis-notice');
        const startBtn = document.getElementById('translation-start-btn');
        const estimateBtn = document.getElementById('translation-estimate-btn');
        const missing = Boolean(project?.id && !hasTranslationAnalysis(project));
        if (notice) {
            notice.classList.toggle('hidden', !missing);
            notice.textContent = missing ? translationAnalysisMessage() : '';
        }
        if (startBtn) startBtn.disabled = missing;
        if (estimateBtn) estimateBtn.disabled = missing;
        return !missing;
    }

    function formatTranslationWarnings(warnings) {
        return String(warnings || '').split('\n').map(line => line.trim()).filter(Boolean).join(' ');
    }

    function translationEstimateKey(payload) {
        return JSON.stringify({
            project_id: payload?.project_id || null,
            source_kind: payload?.source_kind || 'manuscript',
            target_language: payload?.target_language || 'en',
            style: payload?.style || 'faithful',
            model: payload?.model || null,
            chunk_words: payload?.chunk_words || 2000
        });
    }

    function translationProgressText(seconds, estimate) {
        const minutes = Math.floor(seconds / 60);
        const rest = seconds % 60;
        const elapsed = `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
        const chunks = Number(estimate?.chunks_count || 0);
        const estimatedSeconds = Number(estimate?.estimated_seconds || 0);
        if (!chunks) return elapsed;
        const secondsPerChunk = estimatedSeconds > 0 ? Math.max(1, estimatedSeconds / chunks) : 45;
        const currentPart = Math.min(chunks, Math.max(1, Math.floor(seconds / secondsPerChunk) + 1));
        return `${elapsed} · arvioitu etenemä: osa ${currentPart}/${chunks}`;
    }

    function startTranslationTimer(estimate = null) {
        const timer = document.getElementById('translation-timer');
        window.clearInterval(translationTimerInterval);
        let seconds = 0;
        if (timer) {
            timer.textContent = translationProgressText(seconds, estimate);
            timer.classList.remove('hidden');
        }
        translationTimerInterval = window.setInterval(() => {
            seconds++;
            if (timer) timer.textContent = translationProgressText(seconds, estimate);
        }, 1000);
    }

    function stopTranslationTimer() {
        window.clearInterval(translationTimerInterval);
        translationTimerInterval = null;
        const timer = document.getElementById('translation-timer');
        if (timer) timer.classList.add('hidden');
    }

    function showTranslationPanel(panelId) {
        document.querySelectorAll('.translation-panel').forEach(panel => {
            panel.classList.toggle('hidden', panel.id !== panelId);
        });
        document.querySelectorAll('.translation-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.translationPanel === panelId);
        });
    }

    function updateTranslationProjectSelect() {
        const select = document.getElementById('translation-project-select');
        const currentText = document.getElementById('translation-current-project');
        if (!select) return;
        const previousValue = select.value || window.manuscriptData?.id || '';
        select.innerHTML = '';
        availableProjects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = `${project.title || 'Nimetön'}${project.owner_email ? ` (${project.owner_email})` : ''}`;
            select.appendChild(option);
        });
        if (previousValue && availableProjects.some(project => String(project.id) === String(previousValue))) {
            select.value = String(previousValue);
        } else if (window.manuscriptData?.id) {
            select.value = String(window.manuscriptData.id);
        }
        const project = currentTranslationProject();
        if (selectedTranslation && project && String(selectedTranslation.project_id) !== String(project.id)) {
            selectedTranslation = null;
            currentTranslationHistory = [];
        }
        if (currentText) {
            currentText.textContent = project
                ? `Käännettävä teos: ${project.title || 'Nimetön'}`
                : 'Valitse käsikirjoitus ja käännösasetukset.';
        }
        updateTranslationAnalysisNotice(project);
        renderSelectedTranslationForReview();
        renderTranslationHistory();
    }

    async function loadTranslationModels() {
        const select = document.getElementById('translation-model-select');
        if (!select) return;
        try {
            const res = await apiFetch('/api/models/text');
            if (!res.ok) throw new Error(await apiErrorMessage(res, 'Mallien lataus epäonnistui.'));
            translationModels = await res.json();
            select.innerHTML = '';
            translationModels.forEach(model => {
                const option = document.createElement('option');
                option.value = `${model.provider}:${model.model_name}`;
                option.textContent = model.display_name || model.model_name;
                if (model.is_default) option.selected = true;
                select.appendChild(option);
            });
        } catch (err) {
            select.innerHTML = '<option value="">Oletusmalli</option>';
        }
    }

    function translationRequestPayload() {
        const project = currentTranslationProject();
        return {
            project_id: project ? project.id : null,
            source_kind: document.getElementById('translation-source-select')?.value || 'manuscript',
            target_language: document.getElementById('translation-language-select')?.value || 'en',
            style: document.getElementById('translation-style-select')?.value || 'faithful',
            model: document.getElementById('translation-model-select')?.value || null,
            chunk_words: parseInt(document.getElementById('translation-chunk-select')?.value || '2000', 10)
        };
    }

    async function fetchTranslationEstimate(payload) {
        const res = await apiFetch('/api/translations/estimate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Arvion muodostus epäonnistui.');
        latestTranslationEstimate = Object.assign({ payload_key: translationEstimateKey(payload) }, data);
        return latestTranslationEstimate;
    }

    async function updateTranslationEstimate() {
        const estimateEl = document.getElementById('translation-estimate');
        const payload = translationRequestPayload();
        if (!estimateEl || !payload.project_id) {
            if (estimateEl) estimateEl.textContent = 'Valitse ensin käsikirjoitus.';
            latestTranslationEstimate = null;
            return;
        }
        const project = currentTranslationProject();
        if (!updateTranslationAnalysisNotice(project)) {
            estimateEl.textContent = translationAnalysisMessage();
            latestTranslationEstimate = null;
            return;
        }
        estimateEl.textContent = 'Lasketaan arviota...';
        try {
            const data = await fetchTranslationEstimate(payload);
            estimateEl.textContent = `${formatNumber(data.word_count)} sanaa, ${data.chunks_count} osaa, arvioitu kesto noin ${formatDuration(data.estimated_seconds)}.`;
        } catch (err) {
            latestTranslationEstimate = null;
            estimateEl.textContent = err.message;
        }
    }

    async function renderTranslationHistory() {
        const history = document.getElementById('translation-history');
        const project = currentTranslationProject();
        if (!history) return;
        if (!project?.id) {
            currentTranslationHistory = [];
            selectedTranslation = null;
            populateTranslationReviewSelect();
            renderSelectedTranslationForReview();
            history.innerHTML = '<div style="color:var(--text-secondary); font-size:13px;">Ei valittua käsikirjoitusta.</div>';
            return;
        }
        try {
            const res = await apiFetch(`/api/projects/${project.id}/translations`);
            if (!res.ok) throw new Error(await apiErrorMessage(res, 'Käännöshistorian lataus epäonnistui.'));
            const translations = await res.json();
            currentTranslationHistory = translations || [];
            if (selectedTranslation && !currentTranslationHistory.some(item => String(item.id) === String(selectedTranslation.id))) {
                selectedTranslation = null;
            }
            if (!selectedTranslation && currentTranslationHistory.length) {
                selectedTranslation = currentTranslationHistory[0];
            }
            populateTranslationReviewSelect();
            renderSelectedTranslationForReview();
            if (!translations.length) {
                history.innerHTML = '<div style="color:var(--text-secondary); font-size:13px;">Ei tallennettuja käännöksiä.</div>';
                return;
            }
            history.innerHTML = translations.map(item => `
                <button class="translation-history-item" data-translation-id="${item.id}" style="text-align:left; padding:10px 12px; border-radius:8px; border:1px solid var(--border-color); background:rgba(255,255,255,0.05); color:var(--text-primary); cursor:pointer;">
                    <strong>${escapeHtml(item.target_language_label)}</strong> · ${escapeHtml(item.style_label)} · ${item.chunks_count} osaa · ${escapeHtml(translationStatusLabel(item.status))}
                </button>
            `).join('');
            history.querySelectorAll('.translation-history-item').forEach(button => {
                button.addEventListener('click', () => {
                    const selected = translations.find(item => String(item.id) === String(button.dataset.translationId));
                    if (!selected) return;
                    selectTranslationForReview(selected.id);
                    showTranslationPanel('translation-review-panel');
                });
            });
        } catch (err) {
            history.innerHTML = `<div style="color:#ffb4b4; font-size:13px;">${escapeHtml(err.message)}</div>`;
        }
    }

    function populateTranslationReviewSelect() {
        const select = document.getElementById('translation-review-select');
        if (!select) return;
        select.innerHTML = '';
        currentTranslationHistory.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = `${item.target_language_label} · ${item.style_label} · ${translationStatusLabel(item.status)}`;
            select.appendChild(option);
        });
        if (selectedTranslation) select.value = String(selectedTranslation.id);
    }

    function selectTranslationForReview(translationId) {
        const selected = currentTranslationHistory.find(item => String(item.id) === String(translationId));
        if (!selected) return;
        selectedTranslation = selected;
        latestTranslationText = selected.translated_text || '';
        populateTranslationReviewSelect();
        renderSelectedTranslationForReview();
    }

    function renderSelectedTranslationForReview() {
        const project = currentTranslationProject();
        const original = document.getElementById('translation-review-original');
        const textarea = document.getElementById('translation-review-text');
        const status = document.getElementById('translation-review-status');
        const output = document.getElementById('translation-output');
        const outputStatus = document.getElementById('translation-status');
        if (!original || !textarea || !status) return;

        if (!project || !selectedTranslation) {
            original.textContent = project ? 'Valitse käännös.' : 'Valitse käsikirjoitus.';
            textarea.value = '';
            status.textContent = 'Valitse käännös tarkastettavaksi.';
            return;
        }

        latestTranslationText = selectedTranslation.translated_text || '';
        original.textContent = projectTextForTranslation(project);
        textarea.value = latestTranslationText;
        status.textContent = `${selectedTranslation.target_language_label}, ${selectedTranslation.style_label}: ${translationStatusLabel(selectedTranslation.status)}.`;
        if (selectedTranslation.warnings) {
            status.textContent += ` Huomautukset: ${formatTranslationWarnings(selectedTranslation.warnings)}`;
        }
        if (output) output.value = latestTranslationText;
        if (outputStatus) {
            outputStatus.textContent = `${selectedTranslation.target_language_label}, ${selectedTranslation.style_label}: ${translationStatusLabel(selectedTranslation.status)}`;
            if (selectedTranslation.warnings) outputStatus.textContent += ` Huomautukset: ${formatTranslationWarnings(selectedTranslation.warnings)}`;
        }
    }

    async function startTranslation() {
        const payload = translationRequestPayload();
        const status = document.getElementById('translation-status');
        const output = document.getElementById('translation-output');
        const button = document.getElementById('translation-start-btn');
        if (!payload.project_id) {
            alert('Valitse ensin käsikirjoitus.');
            return;
        }
        const project = currentTranslationProject();
        if (!updateTranslationAnalysisNotice(project)) {
            alert(translationAnalysisMessage());
            return;
        }
        if (button) button.disabled = true;
        try {
            if (status) status.textContent = 'Valmistellaan käännöstä ja lasketaan osat...';
            const estimateKey = translationEstimateKey(payload);
            const estimate = latestTranslationEstimate?.payload_key === estimateKey
                ? latestTranslationEstimate
                : await fetchTranslationEstimate(payload);
            startTranslationTimer(estimate);
            if (status) status.textContent = `Käännös käynnissä. ${estimate.chunks_count} osaa, arvioitu kesto noin ${formatDuration(estimate.estimated_seconds)}.`;
            const res = await apiFetch('/api/translations', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Käännös epäonnistui.');
            latestTranslationText = data.translated_text || '';
            if (output) output.value = latestTranslationText;
            if (status) {
                status.textContent = `${data.target_language_label}, ${data.style_label}: ${translationStatusLabel(data.status)}. ${data.chunks_count} osaa, ${formatNumber(data.word_count)} sanaa.`;
                if (data.warnings) status.textContent += ` Huomautukset: ${formatTranslationWarnings(data.warnings)}`;
            }
            await renderTranslationHistory();
            selectTranslationForReview(data.id);
            showTranslationPanel('translation-review-panel');
        } catch (err) {
            if (status) status.textContent = err.message;
            alert('Käännös epäonnistui: ' + err.message);
        } finally {
            stopTranslationTimer();
            if (button) button.disabled = false;
            updateTranslationAnalysisNotice();
        }
    }

    function downloadTranslation() {
        const reviewText = document.getElementById('translation-review-text');
        const text = reviewText && !document.getElementById('translation-review-panel')?.classList.contains('hidden')
            ? reviewText.value
            : latestTranslationText;
        if (!text) {
            alert('Ei ladattavaa käännöstä.');
            return;
        }
        const project = currentTranslationProject();
        const language = document.getElementById('translation-language-select')?.value || 'translation';
        const safeTitle = (project?.title || 'kaannos').toLowerCase().replace(/[^a-z0-9åäö]+/gi, '-').replace(/^-|-$/g, '');
        const blob = new Blob([text], {type: 'text/plain;charset=utf-8'});
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${safeTitle}-${language}.txt`;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    async function saveReviewedTranslation() {
        const textarea = document.getElementById('translation-review-text');
        const status = document.getElementById('translation-review-status');
        const button = document.getElementById('translation-review-save-btn');
        if (!selectedTranslation || !textarea) {
            alert('Valitse ensin tallennettu käännös.');
            return;
        }
        if (button) button.disabled = true;
        if (status) status.textContent = 'Tallennetaan käännöksen muutoksia...';
        try {
            const res = await apiFetch(`/api/translations/${selectedTranslation.id}`, {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ translated_text: textarea.value })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Käännöksen tallennus epäonnistui.');
            latestTranslationText = data.translated_text || '';
            selectedTranslation = data;
            const index = currentTranslationHistory.findIndex(item => String(item.id) === String(data.id));
            if (index >= 0) currentTranslationHistory[index] = data;
            populateTranslationReviewSelect();
            renderSelectedTranslationForReview();
            await renderTranslationHistory();
            if (status) status.textContent = 'Käännöksen muutokset tallennettu.';
        } catch (err) {
            if (status) status.textContent = err.message;
            alert('Tallennus epäonnistui: ' + err.message);
        } finally {
            if (button) button.disabled = false;
        }
    }

    function syncTranslationScroll(source, target) {
        if (!source || !target || syncingTranslationScroll) return;
        syncingTranslationScroll = true;
        const sourceMax = source.scrollHeight - source.clientHeight;
        const targetMax = target.scrollHeight - target.clientHeight;
        const ratio = sourceMax > 0 ? source.scrollTop / sourceMax : 0;
        target.scrollTop = targetMax * ratio;
        requestAnimationFrame(() => {
            syncingTranslationScroll = false;
        });
    }

    window.shareProject = async function(projectId, email) {
        if (!projectId) {
            alert('Tallenna käsikirjoitus ensin ennen jakamista.');
            return;
        }
        if (!email) {
            alert('Anna käyttäjän sähköpostiosoite.');
            return;
        }
        try {
            const res = await apiFetch(`/api/projects/${projectId}/shares`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ email, permission: 'edit' })
            });
            if (!res.ok) throw new Error(await apiErrorMessage(res, 'Jakaminen epäonnistui.'));
            await loadProjects();
            alert('Käsikirjoitus jaettiin käyttäjälle.');
        } catch (err) {
            alert('Jakaminen epäonnistui: ' + err.message);
        }
    };

    window.deleteManuscript = async function(projectId) {
        if (!confirm('Poistetaanko teos pysyvästi?')) return;
        try {
            if (projectId) {
                const res = await apiFetch(`/api/projects/${projectId}`, { method: 'DELETE' });
                if (!res.ok) throw new Error(await apiErrorMessage(res, 'Poisto epäonnistui.'));
            }
            if (window.manuscriptData && String(window.manuscriptData.id) === String(projectId)) {
                clearActiveManuscript();
            }
            await loadProjects();
        } catch (err) {
            alert('Teoksen poisto epäonnistui: ' + err.message);
        }
    }

    const translationProjectSelect = document.getElementById('translation-project-select');
    const translationEstimateBtn = document.getElementById('translation-estimate-btn');
    const translationStartBtn = document.getElementById('translation-start-btn');
    const translationDownloadBtn = document.getElementById('translation-download-btn');
    const translationReviewSelect = document.getElementById('translation-review-select');
    const translationReviewSaveBtn = document.getElementById('translation-review-save-btn');
    const translationReviewDownloadBtn = document.getElementById('translation-review-download-btn');
    const translationReviewOriginal = document.getElementById('translation-review-original');
    const translationReviewText = document.getElementById('translation-review-text');
    document.querySelectorAll('.translation-tab').forEach(tab => {
        tab.addEventListener('click', () => showTranslationPanel(tab.dataset.translationPanel));
    });
    ['translation-source-select', 'translation-language-select', 'translation-style-select', 'translation-model-select', 'translation-chunk-select'].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.addEventListener('change', updateTranslationEstimate);
    });
    if (translationProjectSelect) {
        translationProjectSelect.addEventListener('change', () => {
            const project = currentTranslationProject();
            if (project) setActiveManuscript(project);
            updateTranslationEstimate();
            renderTranslationHistory();
        });
    }
    if (translationEstimateBtn) translationEstimateBtn.addEventListener('click', updateTranslationEstimate);
    if (translationStartBtn) translationStartBtn.addEventListener('click', startTranslation);
    if (translationDownloadBtn) translationDownloadBtn.addEventListener('click', downloadTranslation);
    if (translationReviewSelect) {
        translationReviewSelect.addEventListener('change', () => selectTranslationForReview(translationReviewSelect.value));
    }
    if (translationReviewSaveBtn) translationReviewSaveBtn.addEventListener('click', saveReviewedTranslation);
    if (translationReviewDownloadBtn) translationReviewDownloadBtn.addEventListener('click', downloadTranslation);
    if (translationReviewText) {
        translationReviewText.addEventListener('input', () => {
            latestTranslationText = translationReviewText.value;
        });
    }
    if (translationReviewOriginal && translationReviewText) {
        translationReviewOriginal.addEventListener('scroll', () => syncTranslationScroll(translationReviewOriginal, translationReviewText));
        translationReviewText.addEventListener('scroll', () => syncTranslationScroll(translationReviewText, translationReviewOriginal));
    }

    // --- 7. File Upload ---
    const fileUpload = document.getElementById('manuscript-upload');
    if(fileUpload) {
        fileUpload.addEventListener('click', (e) => {
            e.target.value = null; // Mahdollistaa saman tiedoston valinnan
        });
        fileUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('file', file);

            fileUpload.disabled = true;
            apiFetch('/api/import/text', {
                method: 'POST',
                body: formData
            })
            .then(async res => {
                if (!res.ok) throw new Error(await apiErrorMessage(res, 'Tiedoston lukeminen epäonnistui.'));
                return res.json();
            })
            .then(async data => {
                const text = data.text;
                let bookData = createManuscriptFromText(data.title, text);
                bookData.source_filename = data.filename;
                bookData = await window.saveManuscriptToDB(bookData);
                setActiveManuscript(bookData);
                await loadProjects();
                window.openModule('view-kirjoita');
                renderWritingView();
                alert('Lataus ok! Voit jatkaa kirjoittamista tai siirtyä analyysiin.');
            })
            .catch(err => {
                alert('Virhe ladattaessa tiedostoa: ' + err.message);
            })
            .finally(() => {
                fileUpload.disabled = false;
                fileUpload.value = '';
            });
        });
    }

    function renderEditorParagraphPicker(cIndex, pIndex) {
        const chapterList = document.getElementById('editor-chapter-list');
        if (!chapterList || !window.manuscriptData?.chapters?.length) return;
        renderChapterParagraphNav(chapterList, cIndex, pIndex, {
            onChapterSelect: nextCIndex => {
                const nextPIndex = nextCIndex === cIndex ? pIndex : 0;
                window.loadParagraph(nextCIndex, nextPIndex, null);
            },
            onParagraphSelect: (nextCIndex, nextPIndex) => {
                window.loadParagraph(nextCIndex, nextPIndex, null);
            }
        });
    }

    function setEditorParagraphFromScroll(cIndex, pIndex) {
        const previous = window.currentEditSelection || {};
        if (previous.cIndex === cIndex && previous.pIndex === pIndex) return;
        const chapter = window.manuscriptData?.chapters?.[cIndex];
        if (!chapter) return;
        const previousText = chapter.paragraphs?.[previous.pIndex] || '';
        window.currentEditSelection = { cIndex, pIndex };
        renderEditorParagraphPicker(cIndex, pIndex);

        const chapterLabel = document.getElementById('original-chapter-label');
        if (chapterLabel) chapterLabel.textContent = `- ${chapter.title}`;
        const statusP = document.querySelector('#view-toimitus .header-info p');
        if (statusP) statusP.textContent = `${chapter.title}, Kappale ${pIndex + 1} (Toimitus/Käännöstila)`;

        if (editScopeSelect?.value === 'paragraph' && normalizeText(getEditableText()) === normalizeText(previousText)) {
            setEditableText(chapter.paragraphs[pIndex] || '');
            renderEditedDiffPreview();
        }
    }

    function attachOriginalScrollTracker(originalText, cIndex) {
        if (!originalText) return;
        originalText.onscroll = () => {
            const chapter = window.manuscriptData?.chapters?.[cIndex];
            if (!chapter) return;
            const containerRect = originalText.getBoundingClientRect();
            let bestIndex = null;
            let bestDistance = Infinity;
            originalText.querySelectorAll('[data-pindex]').forEach(node => {
                const rect = node.getBoundingClientRect();
                if (rect.bottom < containerRect.top + 20 || rect.top > containerRect.bottom - 20) return;
                const distance = Math.abs(rect.top - containerRect.top - 18);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestIndex = Number(node.dataset.pindex);
                }
            });
            if (bestIndex !== null) setEditorParagraphFromScroll(cIndex, bestIndex);
        };
    }

    window.renderNavList = function() {
        const chapterList = document.getElementById('editor-chapter-list');
        if (chapterList && (!window.manuscriptData || !window.manuscriptData.chapters)) {
            renderChapterParagraphNav(chapterList, null, null);
            const originalText = document.getElementById('original-text');
            const editedText = document.getElementById('edited-text');
            if (originalText) originalText.textContent = 'Valitse käsikirjoitus ensin Käsikirjoitukseni-näkymässä.';
            if (editedText) setEditableText('');
            return;
        }
        if (chapterList && window.manuscriptData?.chapters?.length) {
            if (window.currentEditSelection.cIndex === null || !window.manuscriptData.chapters[window.currentEditSelection.cIndex]) {
                window.currentEditSelection = { cIndex: firstBodyChapterIndex(window.manuscriptData.chapters), pIndex: 0 };
            }
            renderEditorParagraphPicker(window.currentEditSelection.cIndex, window.currentEditSelection.pIndex || 0);
            window.loadParagraph(window.currentEditSelection.cIndex, window.currentEditSelection.pIndex || 0, null);
        }
    };

    // Tallenna nykyinen valinta globaalisti
    window.currentEditSelection = { cIndex: null, pIndex: null };

    window.loadParagraph = function(cIndex, pIndex, el) {
        if (!window.manuscriptData || !window.manuscriptData.chapters[cIndex]) return;
        
        window.currentEditSelection = { cIndex, pIndex };
        const chapter = window.manuscriptData.chapters[cIndex];
        
        // Näytetään kaikki luvun kappaleet alkuperäispaneelissa, valittu boldataan
        const originalText = document.getElementById('original-text');
        const editedText = document.getElementById('edited-text');
        const chapterLabel = document.getElementById('original-chapter-label');
        
        if (chapterLabel) chapterLabel.textContent = `- ${chapter.title}`;
        
        if (originalText) {
            let html = '';
            chapter.paragraphs.forEach((p, idx) => {
                const isSelected = idx === pIndex;
                html += `<div data-pindex="${idx}" style="
                    padding: 10px 12px;
                    margin-bottom: 8px;
                    border-radius: 8px;
                    cursor: pointer;
                    line-height: 1.7;
                    transition: all 0.2s;
                    ${isSelected 
                        ? 'font-weight: 600; background: rgba(16, 185, 129, 0.12); border-left: 3px solid var(--ai-gradient-start); color: var(--text-primary);' 
                        : 'font-weight: normal; opacity: 0.6; color: var(--text-secondary); border-left: 3px solid transparent;'
                    }
                " onclick="window.loadParagraph(${cIndex}, ${idx}, null)">${escapeHtml(p)}</div>`;
            });
            originalText.innerHTML = html;
            attachOriginalScrollTracker(originalText, cIndex);
            
            // Scrollaa valittu kappale näkyviin
            setTimeout(() => {
                const selectedDiv = originalText.querySelector(`[data-pindex="${pIndex}"]`);
                if (selectedDiv) selectedDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
        
        if (editedText) {
            setEditableText((editScopeSelect && editScopeSelect.value === 'chapter')
                ? (chapter.paragraphs || []).join('\n\n')
                : (chapter.paragraphs[pIndex] || ''));
            renderEditedDiffPreview();
        }
        
        renderEditorParagraphPicker(cIndex, pIndex);
        
        const statusP = document.querySelector('#view-toimitus .header-info p');
        if (statusP) {
            statusP.textContent = `${chapter.title}, Kappale ${pIndex + 1} (Toimitus/Käännöstila)`;
        }
    };

    // Korvaa alkuperäinen -napin logiikka
    const replaceBtn = document.getElementById('replace-original-btn');
    const deleteEditParagraphBtn = document.getElementById('delete-edit-paragraph-btn');
    if (replaceBtn) {
        replaceBtn.addEventListener('click', () => {
            const sel = window.currentEditSelection;
            const editedText = document.getElementById('edited-text');
            if (sel.cIndex === null || sel.pIndex === null || !editedText) {
                alert('Valitse ensin kappale ennen korvaamista!');
                return;
            }
            const newText = getEditableText().trim();
            if (!newText) {
                alert('Muokattu teksti on tyhjä!');
                return;
            }
            
            // Päivitä manuscriptData
            if (editScopeSelect && editScopeSelect.value === 'chapter') {
                window.manuscriptData.chapters[sel.cIndex].paragraphs = newText
                    .split(/\n\s*\n/)
                    .map(part => part.trim())
                    .filter(Boolean);
                sel.pIndex = 0;
            } else {
                window.manuscriptData.chapters[sel.cIndex].paragraphs[sel.pIndex] = newText;
            }
            persistManuscriptEdits();
            
            // Päivitä näkymä
            window.loadParagraph(sel.cIndex, sel.pIndex, null);
            renderWritingView();
            
            // Vihreä välähdys onnistumisesta
            editedText.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
            setTimeout(() => { editedText.style.backgroundColor = 'transparent'; }, 800);
        });
    }

    if (deleteEditParagraphBtn) {
        deleteEditParagraphBtn.addEventListener('click', () => {
            const sel = window.currentEditSelection;
            const chapter = window.manuscriptData?.chapters?.[sel.cIndex];
            if (sel.cIndex === null || sel.pIndex === null || !chapter) {
                alert('Valitse poistettava kappale ensin.');
                return;
            }
            if (!confirm(`Poistetaanko kappale ${sel.pIndex + 1}?`)) return;
            chapter.paragraphs.splice(sel.pIndex, 1);
            if (chapter.paragraphs.length === 0) chapter.paragraphs.push('');
            const nextIndex = Math.min(sel.pIndex, chapter.paragraphs.length - 1);
            window.currentEditSelection = { cIndex: sel.cIndex, pIndex: nextIndex };
            if (writingSelection.cIndex === sel.cIndex) writingSelection.pIndex = nextIndex;
            persistManuscriptEdits();
            window.loadParagraph(sel.cIndex, nextIndex, null);
            renderWritingView();
        });
    }

    {
        loadUsage();
        loadTranslationModels();
        loadProjects().catch(() => {
            const saved = localStorage.getItem('skriptlab_manuscript');
            if (saved) {
                try {
                    const localProject = JSON.parse(saved);
                    renderProjectCards([localProject]);
                    setActiveManuscript(localProject);
                } catch(e) {
                    clearActiveManuscript();
                }
            } else {
                clearActiveManuscript();
            }
        });

    }
});
