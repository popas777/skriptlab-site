const API_BASE_URL = (window.SKRIPTLAB_CONFIG && window.SKRIPTLAB_CONFIG.API_BASE_URL) || "http://127.0.0.1:8000";
const apiUrl = (path) => `${API_BASE_URL}${path}`;
const apiFetch = (path, options) => window.SkriptLabAuth.fetch(path, options);
const ACTIVE_PROJECT_ID_KEY = "skriptlab_active_project_id";
let manuscriptSaveQueue = Promise.resolve();
let manuscriptSaveRequestId = 0;

function markLocalManuscriptDraft(data, pendingSync = true) {
    if (!data) return;
    data._local_saved_at = Date.now();
    data._db_sync_pending = Boolean(pendingSync);
    if (data.id) localStorage.setItem(ACTIVE_PROJECT_ID_KEY, String(data.id));
    localStorage.setItem('skriptlab_manuscript', JSON.stringify(data));
}

function projectPayloadForSave(data, options = {}) {
    const payload = JSON.parse(JSON.stringify(data || {}));
    delete payload._local_saved_at;
    delete payload._db_sync_pending;
    delete payload._needs_db_sync;
    delete payload._pending_save_kind;
    delete payload._pending_chapter_index;
    payload.replace_chapters = Boolean(options.replaceChapters);
    return payload;
}

function chapterPayloadForSave(chapter) {
    return JSON.parse(JSON.stringify(chapter || { id: '', title: 'Luku', paragraphs: [''] }));
}

function structurePayloadForSave(data) {
    return {
        chapters: (data?.chapters || []).map((chapter, index) => ({
            id: chapter.id || `luku_${index + 1}`,
            title: chapter.title || `Luku ${index + 1}`
        }))
    };
}

function hasAnalysisPayload(value) {
    return value && typeof value === 'object' && Object.keys(value).length > 0;
}

if (!window.SkriptLabAuth.requireLogin()) {
    throw new Error("Login required.");
}

window.saveManuscriptToDB = function(data, options = {}) {
    if (!data) return Promise.resolve(data);
    const requestId = ++manuscriptSaveRequestId;
    if (options.replaceChapters) {
        data._pending_save_kind = 'replace_chapters';
        delete data._pending_chapter_index;
    } else if (!data._pending_save_kind) {
        delete data._pending_chapter_index;
    }
    markLocalManuscriptDraft(data);
    manuscriptSaveQueue = manuscriptSaveQueue.catch(() => null).then(async () => {
        try {
            const res = await apiFetch('/api/projects', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(projectPayloadForSave(data, options))
            });
            const saved = await res.json();
            if (!res.ok) throw new Error(saved.detail || "Tallennus epäonnistui.");
            const currentChapters = options.replaceChapters
                ? (Array.isArray(data.chapters) && data.chapters.length ? data.chapters : saved.chapters)
                : (Array.isArray(saved.chapters) ? saved.chapters : data.chapters);
            const currentTitle = data.title;
            const currentAuthor = data.author;
            const currentAnalysis = data.analysis;
            Object.assign(data, saved);
            if (currentChapters) data.chapters = currentChapters;
            if (currentTitle) data.title = currentTitle;
            if (currentAuthor) data.author = currentAuthor;
            if (hasAnalysisPayload(currentAnalysis)) data.analysis = currentAnalysis;
            delete data._needs_db_sync;
            delete data._pending_save_kind;
            delete data._pending_chapter_index;
            markLocalManuscriptDraft(data, requestId !== manuscriptSaveRequestId);
            return data;
        } catch (e) {
            console.error("DB Save fail", e);
            markLocalManuscriptDraft(data, true);
            return data;
        }
    });
    return manuscriptSaveQueue;
};

window.replaceProjectChaptersInDB = function(data) {
    return window.saveManuscriptToDB(data, { replaceChapters: true });
};

window.flushManuscriptSaveQueue = function() {
    return manuscriptSaveQueue.catch(() => null);
};

window.saveProjectChapterToDB = function(data, chapterIndex) {
    const chapter = data?.chapters?.[chapterIndex];
    if (!data?.id || !chapter) return window.saveManuscriptToDB(data);
    const requestId = ++manuscriptSaveRequestId;
    data._pending_save_kind = 'chapter';
    data._pending_chapter_index = chapterIndex;
    markLocalManuscriptDraft(data);
    manuscriptSaveQueue = manuscriptSaveQueue.catch(() => null).then(async () => {
        try {
            const res = await apiFetch(`/api/projects/${data.id}/chapters/${chapterIndex}`, {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(chapterPayloadForSave(chapter))
            });
            const saved = await res.json();
            if (!res.ok) throw new Error(saved.detail || "Luvun tallennus epäonnistui.");
            const currentChapters = data.chapters;
            const currentTitle = data.title;
            const currentAuthor = data.author;
            const currentAnalysis = data.analysis;
            Object.assign(data, saved);
            data.chapters = currentChapters;
            if (currentTitle) data.title = currentTitle;
            if (currentAuthor) data.author = currentAuthor;
            if (hasAnalysisPayload(currentAnalysis)) data.analysis = currentAnalysis;
            delete data._needs_db_sync;
            delete data._pending_save_kind;
            delete data._pending_chapter_index;
            markLocalManuscriptDraft(data, requestId !== manuscriptSaveRequestId);
            return data;
        } catch (e) {
            console.error("Chapter DB save fail", e);
            markLocalManuscriptDraft(data, true);
            return data;
        }
    });
    return manuscriptSaveQueue;
};

window.saveProjectStructureToDB = function(data) {
    if (!data?.id || !Array.isArray(data.chapters) || data.chapters.length === 0) {
        return window.saveManuscriptToDB(data);
    }
    const requestId = ++manuscriptSaveRequestId;
    data._pending_save_kind = 'structure';
    delete data._pending_chapter_index;
    markLocalManuscriptDraft(data);
    manuscriptSaveQueue = manuscriptSaveQueue.catch(() => null).then(async () => {
        try {
            const res = await apiFetch(`/api/projects/${data.id}/structure`, {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(structurePayloadForSave(data))
            });
            const saved = await res.json();
            if (!res.ok) throw new Error(saved.detail || "Rakenteen tallennus epäonnistui.");
            const currentChapters = data.chapters;
            const currentTitle = data.title;
            const currentAuthor = data.author;
            const currentAnalysis = data.analysis;
            Object.assign(data, saved);
            data.chapters = currentChapters;
            if (currentTitle) data.title = currentTitle;
            if (currentAuthor) data.author = currentAuthor;
            if (hasAnalysisPayload(currentAnalysis)) data.analysis = currentAnalysis;
            delete data._needs_db_sync;
            delete data._pending_save_kind;
            delete data._pending_chapter_index;
            markLocalManuscriptDraft(data, requestId !== manuscriptSaveRequestId);
            return data;
        } catch (e) {
            console.error("Structure DB save fail", e);
            markLocalManuscriptDraft(data, true);
            return data;
        }
    });
    return manuscriptSaveQueue;
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
    let miscModels = [];
    let miscTimerInterval = null;
    let latestMiscText = '';
    let currentMiscAssets = [];
    let imageModels = [];
    let proofreadSuggestions = [];
    let proofreadSelection = { cIndex: null };
    let biographyState = {};
    let biographyTimerInterval = null;
    let biographyDictationRecognition = null;
    let biographyDictationActive = false;
    let learningMaterialState = {};
    let learningMaterialTimerInterval = null;
    let editingLearningTargetIndex = null;
    let undoToastTimer = null;
    let currentViewId = currentUser && currentUser.role === 'oppimateriaali' ? 'view-om-projekti' : 'view-kirjani';
    const fullWorkspaceRoles = new Set(['admin', 'test_user']);
    const learningMaterialViews = new Set([
        'view-om-projekti',
        'view-om-ops',
        'view-om-brief',
        'view-om-runko',
        'view-om-materiaalit',
        'view-om-validointi',
        'view-om-kokonaisuus',
        'view-om-vienti'
    ]);
    const writerViews = new Set(['view-kirjani', 'view-kirjoita', 'view-kirja', 'view-analyysi', 'view-toimitus', 'view-oikoluku', 'view-muut-toiminnot', 'view-kuvitus', 'view-markkinointi']);
    const betaCoreViews = new Set(['view-kirjani', 'view-kirjoita', 'view-kirja', 'view-analyysi', 'view-toimitus', 'view-oikoluku', 'view-muut-toiminnot', 'view-kuvitus', 'view-markkinointi']);
    const translatorViews = new Set([...betaCoreViews, 'view-kaannokset']);
    const biographyViews = new Set(['view-kirjani', 'view-kirjoita', 'view-elamakerta', 'view-toimitus', 'view-oikoluku', 'view-kuvitus', 'view-taitto', 'view-muut-toiminnot', 'view-markkinointi', 'view-kirja']);
    const roleLabels = {
        admin: 'Admin',
        test_user: 'Test user',
        org_admin: 'Org admin',
        toimittaja: 'Toimittaja',
        kaantaja: 'Kääntäjä',
        kirjailija: 'Kirjailija',
        elamakerta: 'Elämäkerta',
        oppimateriaali: 'Oppimateriaali'
    };
    const canSeeAllModules = currentUser && fullWorkspaceRoles.has(currentUser.role);
    const usageEls = {
        box: document.getElementById('usage-box'),
        toggle: document.getElementById('usage-toggle'),
        details: document.getElementById('usage-details'),
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
    const feedbackOpenBtn = document.getElementById('feedback-open-btn');
    const feedbackModal = document.getElementById('feedback-modal');
    const feedbackCloseBtn = document.getElementById('feedback-close-btn');
    const feedbackCancelBtn = document.getElementById('feedback-cancel-btn');
    const feedbackSubmitBtn = document.getElementById('feedback-submit-btn');
    const feedbackMessage = document.getElementById('feedback-message');
    const feedbackStatus = document.getElementById('feedback-status');
    const feedbackModalTitle = document.getElementById('feedback-modal-title');
    const illustrationCurrentProject = document.getElementById('illustration-current-project');
    const illustrationStatus = document.getElementById('illustration-status');
    const coverModelSelect = document.getElementById('cover-model-select');
    const coverSideSelect = document.getElementById('cover-side-select');
    const coverAspectSelect = document.getElementById('cover-aspect-select');
    const coverPrompt = document.getElementById('cover-prompt');
    const coverLoadPromptBtn = document.getElementById('cover-load-prompt-btn');
    const coverGenerateBtn = document.getElementById('cover-generate-btn');
    const coverLatestPreview = document.getElementById('cover-latest-preview');
    const coverGallery = document.getElementById('cover-gallery');
    const coverEmptyState = document.getElementById('cover-empty-state');
    if (logoutLink) {
        logoutLink.addEventListener('click', async (event) => {
            event.preventDefault();
            logoutLink.textContent = 'Kirjaudutaan...';
            logoutLink.style.pointerEvents = 'none';
            await flushPendingManuscriptEdits();
            window.SkriptLabAuth.clearSession();
            window.location.replace('login.html');
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

    function currentModuleTitle() {
        const navItem = document.querySelector(`#nav-menu li[data-view="${currentViewId}"]`);
        if (navItem && !navItem.hidden) return navItem.textContent.trim();
        const view = document.getElementById(currentViewId);
        const heading = view ? view.querySelector('.header-info h2') : null;
        return heading ? heading.textContent.trim() : 'Sovellus';
    }

    function closeFeedbackModal() {
        if (!feedbackModal) return;
        feedbackModal.classList.add('hidden');
        feedbackModal.setAttribute('aria-hidden', 'true');
    }

    function openFeedbackModal() {
        if (!feedbackModal) return;
        const title = currentModuleTitle();
        if (feedbackModalTitle) feedbackModalTitle.textContent = `Palaute: ${title}`;
        if (feedbackStatus) feedbackStatus.textContent = 'Palaute tallennetaan adminin nähtäväksi.';
        feedbackModal.classList.remove('hidden');
        feedbackModal.setAttribute('aria-hidden', 'false');
        if (feedbackMessage) feedbackMessage.focus();
    }

    async function submitFeedback() {
        const message = feedbackMessage ? feedbackMessage.value.trim() : '';
        if (!message) {
            if (feedbackStatus) feedbackStatus.textContent = 'Kirjoita ensin palaute.';
            return;
        }
        const title = currentModuleTitle();
        const payload = {
            module_id: currentViewId,
            module_title: title,
            message,
            project_id: window.manuscriptData && window.manuscriptData.id ? window.manuscriptData.id : null,
            page_path: window.location.pathname
        };
        if (feedbackSubmitBtn) feedbackSubmitBtn.disabled = true;
        const originalSubmitText = feedbackSubmitBtn ? feedbackSubmitBtn.textContent : '';
        if (feedbackStatus) feedbackStatus.textContent = 'Tallennetaan palautetta...';
        try {
            const res = await apiFetch('/api/feedback', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error(await apiErrorMessage(res, 'Palautteen tallennus epäonnistui.'));
            await res.json();
            if (feedbackMessage) feedbackMessage.value = '';
            if (feedbackStatus) feedbackStatus.textContent = 'Palaute lähetetty.';
            if (feedbackSubmitBtn) feedbackSubmitBtn.textContent = 'Lähetetty';
            window.setTimeout(() => {
                closeFeedbackModal();
                if (feedbackSubmitBtn) feedbackSubmitBtn.textContent = originalSubmitText || 'Lähetä palaute';
            }, 1300);
        } catch (err) {
            const message = String(err?.message || err || '');
            if (feedbackStatus) {
                feedbackStatus.textContent = networkFailureMessage(err);
            }
            if (feedbackSubmitBtn) feedbackSubmitBtn.textContent = originalSubmitText || 'Lähetä palaute';
        } finally {
            if (feedbackSubmitBtn) feedbackSubmitBtn.disabled = false;
        }
    }

    if (feedbackOpenBtn) feedbackOpenBtn.addEventListener('click', openFeedbackModal);
    if (feedbackCloseBtn) feedbackCloseBtn.addEventListener('click', closeFeedbackModal);
    if (feedbackCancelBtn) feedbackCancelBtn.addEventListener('click', closeFeedbackModal);
    if (feedbackSubmitBtn) feedbackSubmitBtn.addEventListener('click', submitFeedback);
    if (feedbackModal) {
        feedbackModal.addEventListener('click', (event) => {
            if (event.target === feedbackModal) closeFeedbackModal();
        });
    }
    if (feedbackMessage) {
        feedbackMessage.addEventListener('keydown', (event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                submitFeedback();
            }
        });
    }
    if (usageEls.toggle && usageEls.box && usageEls.details) {
        usageEls.toggle.addEventListener('click', () => {
            const isOpen = usageEls.toggle.getAttribute('aria-expanded') === 'true';
            usageEls.toggle.setAttribute('aria-expanded', String(!isOpen));
            usageEls.box.classList.toggle('collapsed', isOpen);
            usageEls.details.hidden = isOpen;
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

    function formatSaveTimestamp(date = new Date()) {
        return date.toLocaleString('fi-FI', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    function updateSaveTimestamp(elementId, pending = false) {
        const element = document.getElementById(elementId);
        if (!element) return;
        element.textContent = pending
            ? `Paikallinen luonnos ${formatSaveTimestamp()}`
            : `Tallennettu ${formatSaveTimestamp()}`;
        element.classList.toggle('is-pending', pending);
        element.classList.toggle('is-saved', !pending);
    }

    function assetTextContent(asset) {
        const dataUrl = asset?.data_url || '';
        const commaIndex = dataUrl.indexOf(',');
        if (commaIndex < 0) return '';
        const encoded = dataUrl.slice(commaIndex + 1);
        try {
            if (dataUrl.slice(0, commaIndex).includes(';base64')) {
                const binary = window.atob(encoded);
                const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
                return new TextDecoder('utf-8').decode(bytes);
            }
            return decodeURIComponent(encoded);
        } catch (err) {
            try {
                return window.atob(encoded);
            } catch (fallbackErr) {
                return '';
            }
        }
    }

    const frontMatterMaterialKinds = new Set(['title_page', 'copyright_page', 'table_of_contents']);

    function miscAssetKind(asset) {
        const prompt = String(asset?.prompt || '');
        const match = prompt.match(/Oheisaineisto:\s*([a-z_]+)/);
        if (match) return match[1];
        const title = String(asset?.title || '').toLocaleLowerCase('fi-FI');
        if (title.includes('nimiö') || title.includes('nimio')) return 'title_page';
        if (title.includes('copy') || title.includes('copyright')) return 'copyright_page';
        if (title.includes('sisälly') || title.includes('sisally')) return 'table_of_contents';
        if (title.includes('henkilö') || title.includes('henkilo')) return 'character_index';
        if (title.includes('paikka')) return 'place_index';
        if (title.includes('asia')) return 'subject_index';
        if (title.includes('lähde') || title.includes('lahde')) return 'bibliography';
        return 'other';
    }

    function miscAssetBookSection(asset) {
        const content = assetTextContent(asset).trim();
        if (!content) return '';
        return `${asset.title || 'Oheisaineisto'}\n\n${content}`;
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

    function visibleParagraphIndexes(count, activePIndex) {
        if (!count) return [];
        const active = Math.min(Math.max(Number(activePIndex) || 0, 0), count - 1);
        const start = Math.min(Math.max(active - 1, 0), Math.max(count - 3, 0));
        const end = Math.min(count, start + 3);
        return Array.from({ length: end - start }, (_, offset) => start + offset);
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
                    const titleInput = document.createElement('input');
                    titleInput.type = 'text';
                    titleInput.className = 'chapter-title-input';
                    titleInput.value = chapter.title || `Luku ${index + 1}`;
                    titleInput.setAttribute('aria-label', 'Luvun nimi');
                    titleInput.addEventListener('click', event => event.stopPropagation());
                    titleInput.addEventListener('change', () => {
                        if (handlers.onChapterRename) handlers.onChapterRename(index, titleInput.value.trim());
                    });
                    titleInput.addEventListener('keydown', event => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            titleInput.blur();
                        }
                    });
                    item.appendChild(titleInput);

                    if (handlers.showParagraphs === false) {
                        groupEl.appendChild(item);
                        return;
                    }

                    const paragraphList = document.createElement('div');
                    paragraphList.className = 'paragraph-list';
                    const paragraphs = chapter.paragraphs || [];
                    const indexes = visibleParagraphIndexes(paragraphs.length, activePIndex);
                    indexes.forEach((pIndex) => {
                        const paragraphButton = document.createElement('button');
                        paragraphButton.type = 'button';
                        paragraphButton.className = 'paragraph-nav-btn';
                        paragraphButton.classList.toggle('active', pIndex === activePIndex);
                        paragraphButton.dataset.pindex = String(pIndex);
                        paragraphButton.title = paragraphSnippet(paragraphs[pIndex]);
                        paragraphButton.innerHTML = `<span>${pIndex + 1}</span>`;
                        paragraphButton.addEventListener('click', () => {
                            if (handlers.onParagraphSelect) handlers.onParagraphSelect(index, pIndex);
                        });
                        paragraphList.appendChild(paragraphButton);
                    });
                    if (paragraphs.length > 3) {
                        const note = document.createElement('small');
                        note.className = 'paragraph-range-note';
                        note.textContent = `Kappaleet ${indexes[0] + 1}-${indexes[indexes.length - 1] + 1} / ${paragraphs.length}`;
                        paragraphList.appendChild(note);
                    }
                    item.appendChild(paragraphList);
                }

                groupEl.appendChild(item);
            });

            container.appendChild(groupEl);
        });

        const active = container.querySelector('.paragraph-nav-btn.active') || container.querySelector('.chapter-nav-btn.active');
        if (active) active.scrollIntoView({ block: 'nearest' });
    }

    function networkFailureMessage(error, context = 'general') {
        const message = String(error?.message || error || '');
        if (message.includes('Failed to fetch')) {
            const host = window.location.hostname;
            if (['localhost', '127.0.0.1', ''].includes(host)) {
                return (
                    'Yhteys backend-palveluun ei onnistunut paikallisesta esikatselusta. '
                    + 'Paikallinen sovellus käyttää osoitetta http://127.0.0.1:8000, joten backendin pitää olla käynnissä samalla koneella. '
                    + 'Voit myös kokeilla tuotantoversiota osoitteessa https://skriptlab.com/app/.'
                );
            }
            if (host.endsWith('netlify.app')) {
                return (
                    'Tämä väliaikainen Netlify-osoite ei ole backendin sallittu osoite. '
                    + 'Käytä osoitetta https://skriptlab.com/app/ tai lisää testiosoite Renderin ALLOWED_ORIGINS-asetukseen.'
                );
            }
            if (context === 'cover') {
                return (
                    'Kansikuvapyyntö ei saanut vastausta backend-palvelulta. '
                    + 'Jos käytät skriptlab.com/app-osoitetta, kuvamallikutsu todennäköisesti kesti liian kauan tai backend käynnistyi uudelleen. '
                    + 'Kokeile hetken päästä uudelleen.'
                );
            }
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

    let showManuscriptMarkup = localStorage.getItem('skriptlab_show_manuscript_markup') === 'true';

    function markdownLevelForChapter(chapter, index = 0) {
        const label = `${chapter?.id || ''} ${chapter?.title || ''}`.toLowerCase();
        if (label.includes('aliluku') || /^(\d+\.\d+|[ivxlcdm]+\.\d+)\b/i.test(label.trim())) return 2;
        return 1;
    }

    function stripMarkdownHeading(value) {
        return String(value || '').replace(/^#{1,6}\s+/, '').trim();
    }

    function chapterMarkdownHeading(chapter, index = 0) {
        const level = markdownLevelForChapter(chapter, index);
        return `${'#'.repeat(level)} ${stripMarkdownHeading(chapter?.title || `Luku ${index + 1}`)}`;
    }

    function manuscriptToMarkdown(data = window.manuscriptData) {
        if (!data || !Array.isArray(data.chapters)) return '';
        return data.chapters.map((chapter, index) => {
            const parts = [chapterMarkdownHeading(chapter, index)];
            (chapter.paragraphs || []).forEach(paragraph => {
                if (String(paragraph || '').trim()) parts.push(String(paragraph).trim());
            });
            return parts.join('\n\n');
        }).join('\n\n');
    }

    function chapterTextForEditor(chapter, index = 0) {
        const paragraphs = (chapter?.paragraphs || []).join('\n\n');
        return showManuscriptMarkup
            ? [chapterMarkdownHeading(chapter, index), paragraphs].filter(Boolean).join('\n\n')
            : paragraphs;
    }

    function parseChapterEditorText(chapter, text) {
        const parts = splitIntoParagraphs(text);
        if (!parts.length) return { title: chapter?.title || 'Nimetön luku', paragraphs: [''] };
        const first = parts[0] || '';
        const heading = first.match(/^(#{1,6})\s+(.+)$/);
        if (!heading) {
            return { title: chapter?.title || 'Nimetön luku', paragraphs: parts };
        }
        const level = heading[1].length;
        const title = stripMarkdownHeading(heading[2]) || chapter?.title || 'Nimetön luku';
        return {
            title,
            idPrefix: level > 1 ? 'aliluku' : 'luku',
            paragraphs: parts.slice(1).length ? parts.slice(1) : ['']
        };
    }

    function applyParsedChapterText(chapter, text) {
        const parsed = parseChapterEditorText(chapter, text);
        chapter.title = parsed.title;
        if (parsed.idPrefix && !String(chapter.id || '').startsWith(parsed.idPrefix)) {
            chapter.id = `${parsed.idPrefix}_${Date.now()}`;
        }
        chapter.paragraphs = parsed.paragraphs;
    }

    function updateMarkupButtons() {
        const label = showManuscriptMarkup ? 'Piilota merkinnät' : 'Näytä merkinnät';
        ['toggle-writing-markup-btn', 'toggle-editor-markup-btn'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.textContent = label;
        });
    }

    function toggleManuscriptMarkup() {
        saveWritingText(false);
        showManuscriptMarkup = !showManuscriptMarkup;
        localStorage.setItem('skriptlab_show_manuscript_markup', String(showManuscriptMarkup));
        updateMarkupButtons();
        renderWritingView();
        if (window.currentEditSelection?.cIndex !== null && window.loadParagraph) {
            window.loadParagraph(window.currentEditSelection.cIndex, window.currentEditSelection.pIndex || 0, null);
        }
    }

    function viewMarkdownFile() {
        const markdown = manuscriptToMarkdown();
        if (!markdown) {
            alert('Ei katseltavaa markdown-sisältöä.');
            return;
        }
        const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        window.setTimeout(() => URL.revokeObjectURL(url), 15000);
    }

    function showMarkdownHelp() {
        alert([
            'Taittomerkinnät:',
            '',
            '# Luvun otsikko',
            '## Aliluvun otsikko',
            '### Väliotsikko',
            '',
            'Tyhjä rivi erottaa kappaleet.',
            '*kursiivi* merkitsee kursivoitavaa tekstiä.',
            '**lihavointi** kannattaa yleensä poistaa kaunokirjan leipätekstistä ennen taittoa.',
            '',
            'Kirjoita- ja Editointi-osioissa Näytä merkinnät näyttää nämä otsikkomerkit. Piilota merkinnät näyttää tekstin lukumuodossa.'
        ].join('\n'));
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

            const currentChapters = Array.isArray(window.manuscriptData.chapters)
                ? window.manuscriptData.chapters
                : latest.chapters;
            window.manuscriptData = Object.assign({}, window.manuscriptData, latest, { chapters: currentChapters });
            if (!window.manuscriptData.analysis) window.manuscriptData.analysis = {};
            localStorage.setItem('skriptlab_manuscript', JSON.stringify(window.manuscriptData));
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

    function fullBookTextWithMaterials() {
        const baseText = getFullManuscriptText();
        const includedAssets = currentMiscAssets.filter(asset => asset.asset_type === 'book_misc_material');
        const frontMaterials = includedAssets
            .filter(asset => frontMatterMaterialKinds.has(miscAssetKind(asset)))
            .map(miscAssetBookSection)
            .filter(Boolean);
        const backMaterials = includedAssets
            .filter(asset => !frontMatterMaterialKinds.has(miscAssetKind(asset)))
            .map(miscAssetBookSection)
            .filter(Boolean);
        return [...frontMaterials, baseText, ...backMaterials].filter(part => String(part || '').trim()).join('\n\n\n');
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
        textEl.textContent = fullBookTextWithMaterials() || 'Käsikirjoituksessa ei ole vielä tekstiä.';
    }

    function downloadCurrentBookText() {
        if (!window.manuscriptData) {
            alert('Valitse tai lataa käsikirjoitus ensin.');
            return;
        }
        const text = fullBookTextWithMaterials() || getFullManuscriptText();
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
        renderBookOverview();
        if (window.renderNavList) window.renderNavList();
    }

    function syncWritingEditorToManuscript() {
        const textEl = document.getElementById('writing-text');
        if (!textEl || !window.manuscriptData) return false;
        const chapter = window.manuscriptData.chapters?.[writingSelection.cIndex];
        if (!chapter) return false;
        applyParsedChapterText(chapter, textEl.value);
        writingSelection.pIndex = Math.min(writingSelection.pIndex || 0, chapter.paragraphs.length - 1);
        markLocalManuscriptDraft(window.manuscriptData);
        return true;
    }

    let writingAutosaveTimer = null;

    function scheduleWritingAutosave() {
        if (!syncWritingEditorToManuscript()) return;
        window.clearTimeout(writingAutosaveTimer);
        writingAutosaveTimer = window.setTimeout(() => {
            if (syncWritingEditorToManuscript()) {
                window.saveProjectChapterToDB(window.manuscriptData, writingSelection.cIndex)
                    .then(() => updateSaveTimestamp('writing-save-status', Boolean(window.manuscriptData?._db_sync_pending)));
                renderBookOverview();
            }
        }, 1200);
    }

    async function flushPendingManuscriptEdits() {
        window.clearTimeout(writingAutosaveTimer);
        let savePromise = null;
        if (currentViewId === 'view-kirjoita') {
            if (syncWritingEditorToManuscript()) {
                savePromise = window.saveProjectChapterToDB(window.manuscriptData, writingSelection.cIndex);
            }
        }
        if (currentViewId === 'view-toimitus') {
            window.clearTimeout(editingAutosaveTimer);
            if (syncEditedTargetToManuscript({ showAlerts: false })) {
                savePromise = window.saveProjectChapterToDB(window.manuscriptData, window.currentEditSelection?.cIndex);
            }
        }
        if (savePromise) await savePromise;
        await window.flushManuscriptSaveQueue();
        return true;
    }

    function currentWritingParagraphs() {
        const textEl = document.getElementById('writing-text');
        const text = textEl ? textEl.value : '';
        const chapter = window.manuscriptData?.chapters?.[writingSelection.cIndex] || {};
        const parsed = parseChapterEditorText(chapter, text);
        return parsed.paragraphs.length ? parsed.paragraphs : [''];
    }

    function paragraphIndexAtOffset(text, offset) {
        const source = String(text || '');
        const cursor = Math.max(0, offset || 0);
        const matches = Array.from(source.matchAll(/\S[\s\S]*?(?=\n\s*\n|$)/g));
        if (!matches.length) return 0;
        let activeIndex = 0;
        matches.forEach((match, index) => {
            if ((match.index || 0) <= cursor) activeIndex = index;
        });
        const hasHeading = showManuscriptMarkup && /^(#{1,6})\s+/.test(matches[0]?.[0] || '');
        return Math.max(0, activeIndex - (hasHeading ? 1 : 0));
    }

    function paragraphOffsetByIndex(text, targetIndex) {
        const source = String(text || '');
        const matches = Array.from(source.matchAll(/\S[\s\S]*?(?=\n\s*\n|$)/g));
        const hasHeading = showManuscriptMarkup && /^(#{1,6})\s+/.test(matches[0]?.[0] || '');
        const actualIndex = Math.max(0, Math.min(targetIndex + (hasHeading ? 1 : 0), matches.length - 1));
        const match = matches[actualIndex];
        return match ? match.index : 0;
    }

    function updateWritingPositionFromCursor() {
        const textEl = document.getElementById('writing-text');
        if (!textEl || writingSelection.cIndex === null || writingSelection.cIndex === undefined) return;
        const paragraphs = currentWritingParagraphs();
        writingSelection.pIndex = Math.min(paragraphIndexAtOffset(textEl.value, textEl.selectionStart), paragraphs.length - 1);
        updateWritingPositionStatus();
    }

    function updateWritingPositionStatus() {
        const jumpInput = document.getElementById('writing-paragraph-jump');
        const statusEl = document.getElementById('writing-position-status');
        const chapter = window.manuscriptData?.chapters?.[writingSelection.cIndex];
        const chapters = window.manuscriptData?.chapters || [];
        const paragraphs = currentWritingParagraphs();
        const pIndex = Math.min(Math.max(writingSelection.pIndex || 0, 0), Math.max(0, paragraphs.length - 1));
        if (jumpInput) {
            jumpInput.max = String(Math.max(1, paragraphs.length));
            jumpInput.value = String(pIndex + 1);
        }
        if (statusEl) {
            statusEl.textContent = chapter
                ? `Luku ${writingSelection.cIndex + 1}/${chapters.length}: ${chapter.title || 'Nimetön luku'} · kappale ${pIndex + 1}/${Math.max(1, paragraphs.length)}`
                : 'Valitse luku.';
        }
    }

    function jumpToWritingParagraph() {
        const textEl = document.getElementById('writing-text');
        const jumpInput = document.getElementById('writing-paragraph-jump');
        if (!textEl || !jumpInput) return;
        const paragraphs = currentWritingParagraphs();
        const requested = Number.parseInt(jumpInput.value, 10);
        if (!Number.isFinite(requested) || requested < 1 || requested > paragraphs.length) {
            alert(`Anna kappalenumero väliltä 1-${paragraphs.length}.`);
            return;
        }
        const nextIndex = requested - 1;
        const offset = paragraphOffsetByIndex(textEl.value, nextIndex);
        writingSelection.pIndex = nextIndex;
        textEl.focus();
        textEl.setSelectionRange(offset, offset);
        const lineHeight = Number.parseFloat(window.getComputedStyle(textEl).lineHeight) || 28;
        const before = textEl.value.slice(0, offset);
        textEl.scrollTop = Math.max(0, before.split('\n').length * lineHeight - textEl.clientHeight / 3);
        updateWritingPositionStatus();
    }

    function setWritingToolStatus(message) {
        const statusEl = document.getElementById('writing-tool-status');
        if (statusEl) statusEl.textContent = message || '';
    }

    function hideUndoToast() {
        const toast = document.getElementById('app-undo-toast');
        if (!toast) return;
        window.clearTimeout(undoToastTimer);
        undoToastTimer = null;
        toast.classList.add('hidden');
        toast.dataset.active = '';
        const undoBtn = document.getElementById('app-undo-btn');
        if (undoBtn) undoBtn.onclick = null;
    }

    function showUndoToast(message, undoAction) {
        const toast = document.getElementById('app-undo-toast');
        const messageEl = document.getElementById('app-undo-message');
        const undoBtn = document.getElementById('app-undo-btn');
        const closeBtn = document.getElementById('app-undo-close');
        if (!toast || !messageEl || !undoBtn) return;
        const token = String(Date.now());
        window.clearTimeout(undoToastTimer);
        toast.dataset.active = token;
        messageEl.textContent = message;
        undoBtn.disabled = false;
        undoBtn.onclick = async () => {
            if (toast.dataset.active !== token) return;
            undoBtn.disabled = true;
            try {
                await undoAction();
            } finally {
                hideUndoToast();
            }
        };
        if (closeBtn) closeBtn.onclick = hideUndoToast;
        toast.classList.remove('hidden');
        undoToastTimer = window.setTimeout(() => {
            if (toast.dataset.active === token) hideUndoToast();
        }, 9000);
    }

    function cleanManuscriptText(text) {
        const lines = String(text || '')
            .replace(/\r\n?/g, '\n')
            .replace(/\u00a0/g, ' ')
            .replace(/\f/g, '\n\n')
            .replace(/<KAPPALE\d*>/gi, '')
            .replace(/\*\*/g, '')
            .replace(/__/g, '')
            .split('\n')
            .map(line => line
                .replace(/[ \t]+/g, ' ')
                .replace(/^[ \t]*#{1,6}\s+/, '')
                .replace(/^[ \t]*[-*_#=]{3,}[ \t]*$/, '')
                .replace(/^[ \t]*(sivu|page)\s+\d+[ \t]*$/i, '')
                .replace(/^[ \t]*[-–—]?\s*\d+\s*[-–—]?[ \t]*$/, '')
                .replace(/[\u200b-\u200f\u202a-\u202e]/g, '')
                .trim()
            );

        const blocks = [];
        let current = [];
        lines.forEach(line => {
            if (!line) {
                if (current.length) {
                    blocks.push(current);
                    current = [];
                }
                return;
            }
            current.push(line);
        });
        if (current.length) blocks.push(current);

        return blocks
            .map(block => block.join(' ').replace(/\s+([,.!?;:])/g, '$1').trim())
            .filter(Boolean)
            .join('\n\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    async function cleanCurrentWritingChapter() {
        const textEl = document.getElementById('writing-text');
        if (!textEl || !window.manuscriptData?.chapters?.[writingSelection.cIndex]) {
            alert('Valitse puhdistettava luku ensin.');
            return;
        }
        const chapter = window.manuscriptData.chapters[writingSelection.cIndex];
        const parsed = parseChapterEditorText(chapter, textEl.value);
        const cleaned = cleanManuscriptText(parsed.paragraphs.join('\n\n'));
        textEl.value = showManuscriptMarkup
            ? [`${parsed.idPrefix === 'aliluku' ? '##' : '#'} ${parsed.title}`, cleaned].filter(Boolean).join('\n\n')
            : cleaned;
        writingSelection.pIndex = 0;
        await saveWritingText(false);
        renderWritingView();
        setWritingToolStatus('Teksti puhdistettu valitusta luvusta.');
    }

    async function restructureWritingManuscript() {
        if (!window.manuscriptData?.chapters?.length) {
            alert('Lataa tai valitse käsikirjoitus ensin.');
            return;
        }
        await saveWritingText(false);
        const sourceText = cleanManuscriptText(getFullManuscriptText(window.manuscriptData));
        if (!sourceText) {
            alert('Käsikirjoituksesta ei löytynyt jaoteltavaa tekstiä.');
            return;
        }
        const chapters = parseRestructuredChapters(sourceText, window.manuscriptData.title || 'Käsikirjoitus');
        const paragraphCount = chapters.reduce((sum, chapter) => sum + (chapter.paragraphs || []).length, 0);
        const saveNew = confirm(`Uusi jako näyttää sisältävän ${chapters.length} lukua ja ${paragraphCount} kappaletta.\n\nTallennetaanko uusi luku- ja kappalejako?`);
        if (!saveNew) {
            setWritingToolStatus('Uutta jakoa ei tallennettu.');
            return;
        }
        window.manuscriptData.chapters = chapters;
        writingSelection = { cIndex: firstBodyChapterIndex(chapters), pIndex: 0 };
        window.currentEditSelection = { cIndex: writingSelection.cIndex, pIndex: 0 };
        await window.replaceProjectChaptersInDB(window.manuscriptData);
        renderBookOverview();
        if (window.renderNavList) window.renderNavList();
        renderWritingView();
        if (window.loadParagraph) window.loadParagraph(writingSelection.cIndex, 0, null);
        setWritingToolStatus('Uusi luku- ja kappalejako tallennettu.');
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
            updateWritingPositionStatus();
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
            },
            onChapterRename: (cIndex, title) => {
                saveWritingText(false);
                const chapter = window.manuscriptData.chapters[cIndex];
                if (!chapter) return;
                chapter.title = title || `Luku ${cIndex + 1}`;
                window.saveProjectStructureToDB(window.manuscriptData);
                renderWritingView();
            },
            showParagraphs: false
        });

        const selectedChapter = window.manuscriptData.chapters[writingSelection.cIndex];
        titleEl.textContent = selectedChapter
            ? `${selectedChapter.title}, koko luku`
            : 'Valitse luku';
        textEl.value = chapterTextForEditor(selectedChapter, writingSelection.cIndex);
        updateWritingPositionStatus();
        updateMarkupButtons();
    }

    async function saveWritingText(showAlert = true) {
        window.clearTimeout(writingAutosaveTimer);
        if (!syncWritingEditorToManuscript()) return;
        await window.saveProjectChapterToDB(window.manuscriptData, writingSelection.cIndex);
        updateSaveTimestamp('writing-save-status', Boolean(window.manuscriptData._db_sync_pending));
        renderBookOverview();
        if (window.renderNavList) window.renderNavList();
        if (showAlert) {
            if (window.manuscriptData._db_sync_pending) {
                alert('Lukua ei saatu tallennettua tietokantaan. Paikallinen luonnos on tallessa, mutta kokeile tallennusta uudelleen.');
            } else {
                alert('Luku tallennettu tietokantaan ja kappalerakenne päivitetty.');
            }
        }
    }

    async function addWritingParagraph() {
        if (!window.manuscriptData) {
            alert('Lataa tai valitse käsikirjoitus ensin.');
            return;
        }
        syncWritingEditorToManuscript();
        const chapterIndex = writingSelection.cIndex ?? firstBodyChapterIndex(window.manuscriptData.chapters);
        const chapter = window.manuscriptData.chapters[chapterIndex];
        if (!chapter) return;
        chapter.paragraphs.push('');
        writingSelection = { cIndex: chapterIndex, pIndex: chapter.paragraphs.length - 1 };
        renderWritingView();
        await window.saveProjectChapterToDB(window.manuscriptData, chapterIndex);
        renderBookOverview();
    }

    async function deleteWritingParagraph() {
        if (!window.manuscriptData) {
            alert('Lataa tai valitse käsikirjoitus ensin.');
            return;
        }
        syncWritingEditorToManuscript();
        const chapter = window.manuscriptData.chapters?.[writingSelection.cIndex];
        if (!chapter || writingSelection.pIndex === null || writingSelection.pIndex === undefined) {
            alert('Valitse poistettava kappale ensin.');
            return;
        }
        const chapterIndex = writingSelection.cIndex;
        const paragraphIndex = writingSelection.pIndex;
        const removedParagraph = chapter.paragraphs[paragraphIndex];
        chapter.paragraphs.splice(paragraphIndex, 1);
        if (chapter.paragraphs.length === 0) chapter.paragraphs.push('');
        writingSelection.pIndex = Math.min(paragraphIndex, chapter.paragraphs.length - 1);
        await window.saveProjectChapterToDB(window.manuscriptData, chapterIndex);
        renderBookOverview();
        if (window.renderNavList) window.renderNavList();
        renderWritingView();
        showUndoToast(`Kappale ${paragraphIndex + 1} poistettu.`, async () => {
            const targetChapter = window.manuscriptData?.chapters?.[chapterIndex];
            if (!targetChapter) return;
            if (targetChapter.paragraphs.length === 1 && !String(targetChapter.paragraphs[0] || '').trim()) {
                targetChapter.paragraphs.splice(0, 1);
            }
            targetChapter.paragraphs.splice(Math.min(paragraphIndex, targetChapter.paragraphs.length), 0, removedParagraph);
            writingSelection = { cIndex: chapterIndex, pIndex: paragraphIndex };
            await window.saveProjectChapterToDB(window.manuscriptData, chapterIndex);
            renderBookOverview();
            if (window.renderNavList) window.renderNavList();
            renderWritingView();
            setWritingToolStatus('Poisto kumottu.');
        });
    }

    function nextChapterTitle() {
        const bodyCount = (window.manuscriptData?.chapters || [])
            .filter((chapter, index) => chapterPlacement(chapter, index) === 'body')
            .length;
        return `Luku ${bodyCount + 1}`;
    }

    async function addChapterNearSelection(source = 'writing') {
        if (!window.manuscriptData) {
            alert('Lataa tai valitse käsikirjoitus ensin.');
            return;
        }
        if (source === 'writing') await saveWritingText(false);
        const chapters = window.manuscriptData.chapters || [];
        const currentIndex = source === 'editor'
            ? (window.currentEditSelection?.cIndex ?? firstBodyChapterIndex(chapters))
            : (writingSelection.cIndex ?? firstBodyChapterIndex(chapters));
        const title = prompt('Uuden luvun nimi', nextChapterTitle());
        if (title === null) return;
        const cleanTitle = title.trim() || nextChapterTitle();
        const insertIndex = Math.min(Math.max(currentIndex + 1, 0), chapters.length);
        const newChapter = {
            id: `luku_${Date.now()}`,
            title: cleanTitle,
            paragraphs: ['']
        };
        chapters.splice(insertIndex, 0, newChapter);
        writingSelection = { cIndex: insertIndex, pIndex: 0 };
        window.currentEditSelection = { cIndex: insertIndex, pIndex: 0 };
        await window.saveProjectStructureToDB(window.manuscriptData);
        renderWritingView();
        if (window.loadParagraph) window.loadParagraph(insertIndex, 0, null);
    }

    async function deleteSelectedChapter(source = 'writing') {
        if (!window.manuscriptData?.chapters?.length) {
            alert('Lataa tai valitse käsikirjoitus ensin.');
            return;
        }
        if (source === 'writing') await saveWritingText(false);
        const chapters = window.manuscriptData.chapters;
        if (chapters.length <= 1) {
            alert('Viimeistä lukua ei voi poistaa.');
            return;
        }
        const currentIndex = source === 'editor'
            ? (window.currentEditSelection?.cIndex ?? firstBodyChapterIndex(chapters))
            : (writingSelection.cIndex ?? firstBodyChapterIndex(chapters));
        const chapter = chapters[currentIndex];
        if (!chapter) return;
        const removedChapter = JSON.parse(JSON.stringify(chapter));
        const removedTitle = chapter.title || `Luku ${currentIndex + 1}`;
        chapters.splice(currentIndex, 1);
        const nextIndex = Math.min(currentIndex, chapters.length - 1);
        writingSelection = { cIndex: nextIndex, pIndex: 0 };
        window.currentEditSelection = { cIndex: nextIndex, pIndex: 0 };
        await window.saveProjectStructureToDB(window.manuscriptData);
        renderBookOverview();
        if (window.renderNavList) window.renderNavList();
        renderWritingView();
        if (window.loadParagraph) window.loadParagraph(nextIndex, 0, null);
        showUndoToast(`Luku "${removedTitle}" poistettu.`, async () => {
            const targetChapters = window.manuscriptData?.chapters;
            if (!Array.isArray(targetChapters)) return;
            targetChapters.splice(Math.min(currentIndex, targetChapters.length), 0, removedChapter);
            writingSelection = { cIndex: currentIndex, pIndex: 0 };
            window.currentEditSelection = { cIndex: currentIndex, pIndex: 0 };
            await window.saveProjectStructureToDB(window.manuscriptData);
            renderBookOverview();
            if (window.renderNavList) window.renderNavList();
            renderWritingView();
            if (window.loadParagraph) window.loadParagraph(currentIndex, 0, null);
            setWritingToolStatus('Poisto kumottu.');
        });
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
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');
    const appWrapper = document.getElementById('app-wrapper');
    const mobileLayoutQuery = window.matchMedia('(max-width: 860px)');

    function isMobileShell() {
        return mobileLayoutQuery.matches || appWrapper.classList.contains('mobile-simulate');
    }

    function setSidebarDrawer(open) {
        if (!sidebar) return;
        sidebar.classList.remove('hidden');
        appWrapper.classList.toggle('sidebar-open', Boolean(open));
        document.body.classList.toggle('sidebar-drawer-open', Boolean(open));
        if (sidebarBackdrop) sidebarBackdrop.hidden = !open;
        if (toggleSidebarBtn) {
            toggleSidebarBtn.setAttribute('aria-expanded', String(Boolean(open)));
            toggleSidebarBtn.title = open ? 'Sulje valikko' : 'Avaa valikko';
        }
    }

    function syncSidebarMode() {
        if (isMobileShell()) {
            setSidebarDrawer(false);
        } else {
            appWrapper.classList.remove('sidebar-open');
            document.body.classList.remove('sidebar-drawer-open');
            if (sidebarBackdrop) sidebarBackdrop.hidden = true;
            if (toggleSidebarBtn) {
                toggleSidebarBtn.setAttribute('aria-expanded', String(!sidebar.classList.contains('hidden')));
                toggleSidebarBtn.title = sidebar.classList.contains('hidden') ? 'Avaa sivuvalikko' : 'Piilota sivuvalikko';
            }
        }
    }

    toggleSidebarBtn.addEventListener('click', () => {
        if (isMobileShell()) {
            setSidebarDrawer(!appWrapper.classList.contains('sidebar-open'));
            return;
        }
        sidebar.classList.toggle('hidden');
        syncSidebarMode();
    });

    if (sidebarBackdrop) {
        sidebarBackdrop.addEventListener('click', () => setSidebarDrawer(false));
    }

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
    if (toggleLangBtn) {
        toggleLangBtn.disabled = true;
        toggleLangBtn.setAttribute('aria-disabled', 'true');
    }

    const toggleMobileBtn = document.getElementById('toggle-mobile');
    toggleMobileBtn.addEventListener('click', () => {
        appWrapper.classList.toggle('mobile-simulate');
        syncSidebarMode();
    });
    if (mobileLayoutQuery.addEventListener) {
        mobileLayoutQuery.addEventListener('change', syncSidebarMode);
    } else if (mobileLayoutQuery.addListener) {
        mobileLayoutQuery.addListener(syncSidebarMode);
    }
    syncSidebarMode();

    // --- 2. SPA Navigation Logic ---
    const navItems = document.querySelectorAll('#nav-menu li[data-view]');
    const views = document.querySelectorAll('.view-section');

    function isViewAllowed(viewId) {
        if (canSeeAllModules) return true;
        if (currentUser && currentUser.role === 'kirjailija') return writerViews.has(viewId);
        if (currentUser && currentUser.role === 'kaantaja') return translatorViews.has(viewId);
        if (currentUser && currentUser.role === 'elamakerta') return biographyViews.has(viewId);
        if (currentUser && currentUser.role === 'oppimateriaali') return learningMaterialViews.has(viewId);
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
            viewId = currentUser && currentUser.role === 'oppimateriaali' ? 'view-om-projekti' : 'view-kirjani';
        }
        currentViewId = viewId;

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

    function persistPendingModuleEdits(nextViewId) {
        if (currentViewId === 'view-kirjoita' && nextViewId !== 'view-kirjoita') {
            saveWritingText(false);
        }
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const nextViewId = item.getAttribute('data-view');
            persistPendingModuleEdits(nextViewId);
            openModule(nextViewId);
            if (isMobileShell()) setSidebarDrawer(false);
            if (nextViewId === 'view-kirja') {
                loadMiscAssetsForActiveProject(true);
                renderBookOverview();
            }
            if (nextViewId === 'view-kirjoita') {
                renderWritingView();
            }
            if (nextViewId === 'view-analyysi') {
                loadSavedAnalysisForActiveProject(false);
            }
            if (nextViewId === 'view-oikoluku') {
                renderProofreadView();
            }
            if (nextViewId === 'view-markkinointi') {
                renderMarketingMaterialsFromAnalysis(false);
            }
            if (nextViewId === 'view-kaannokset') {
                loadTranslationModels();
                updateTranslationProjectSelect();
                updateTranslationEstimate();
            }
            if (nextViewId === 'view-muut-toiminnot') {
                loadMiscModels();
                updateMiscProjectSelect();
                loadMiscAssetsForActiveProject();
            }
            if (nextViewId === 'view-elamakerta') {
                loadBiographyState(false);
            }
            if (nextViewId === 'view-kuvitus') {
                loadImageModels();
                loadCoverImages();
            }
            if (nextViewId === 'view-taitto') {
                loadLayoutAssets();
            }
            if (learningMaterialViews.has(nextViewId)) {
                loadLearningMaterialState(false);
            }
            if(nextViewId !== 'view-kirjani') {
                document.getElementById('top-book-name').textContent = learningMaterialViews.has(nextViewId)
                    ? `Oppimateriaali: ${activeLearningProject()?.title || 'Valitse projekti...'}`
                    : (window.manuscriptData
                        ? `Käsikirjoitus: ${window.manuscriptData.title}`
                        : 'Käsikirjoitus: Valitse projekti...');
            } else {
                document.getElementById('top-book-name').textContent = 'Käsikirjoitus: Valitse projekti...';
            }
        });
    });
    openModule(currentViewId);
    
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

    function setAnalysisProgress(job) {
        const title = document.getElementById('analysis-loader-title');
        const status = document.getElementById('analysis-loader-status');
        const progressText = document.getElementById('analysis-progress-text');
        const pulse = document.getElementById('analysis-pulse-bar');
        const current = Number(job?.current || 0);
        const total = Number(job?.total || 0);
        if (title) title.textContent = job?.status === 'queued' ? 'Analyysi jonossa...' : 'Analyysi käynnissä...';
        if (status) status.textContent = job?.message || 'Käsikirjoitusta analysoidaan osissa.';
        if (progressText) {
            progressText.textContent = total
                ? `Osa ${Math.min(current, total)} / ${total}${job?.label ? `: ${job.label}` : ''}`
                : 'Valmistellaan pitkän käsikirjoituksen analyysia.';
        }
        if (pulse && total) {
            pulse.style.animation = 'none';
            pulse.style.width = `${Math.max(8, Math.min(100, Math.round((current / total) * 100)))}%`;
        }
    }

    function wait(ms) {
        return new Promise(resolve => window.setTimeout(resolve, ms));
    }

    async function pollAnalysisJob(jobId) {
        while (true) {
            const res = await apiFetch(`/api/analyze/jobs/${jobId}`);
            const job = await res.json().catch(() => null);
            if (!res.ok) throw new Error(job?.detail || 'Analyysin tilan haku epäonnistui.');
            setAnalysisProgress(job);
            if ((job.status === 'completed' || job.status === 'partial') && job.data) return job;
            if (job.status === 'failed') throw new Error(job.message || 'Analyysi epäonnistui.');
            await wait(3000);
        }
    }

    async function applyAnalysisResult(r) {
        if (!r) throw new Error('Analyysin data puuttuu.');
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

        sidebarStyle.textContent = r.style ? "Tyyli valmis" : "Virhe";
        sidebarVocab.textContent = r.glossary ? "Valmis sanasto" : "-";
        sidebarStyle.style.color = "var(--ai-gradient-start)";
        sidebarVocab.style.color = "var(--ai-gradient-start)";
        renderBookOverview();
        renderWritingView();
        if(window.renderNavList) window.renderNavList();
        loadUsage();
    }

    if(runAnalysisBtn) {
        runAnalysisBtn.addEventListener('click', async () => {
            runAnalysisBtn.style.display = 'none';
            analysisLoader.classList.remove('hidden');

            let analysisSeconds = 0;
            const timerEl = document.getElementById('analysis-timer');
            if(timerEl) timerEl.textContent = '0:00';
            const analysisInterval = setInterval(() => {
                analysisSeconds++;
                const m = Math.floor(analysisSeconds / 60);
                const s = analysisSeconds % 60;
                if(timerEl) timerEl.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
            }, 1000);

            try {
                const projectText = getFullManuscriptText(window.manuscriptData);
                if(!projectText) {
                    throw new Error('Käsikirjoitusta ei ole vielä ladattu oikein! Lataa tiedosto Käsikirjoitukseni-näkymästä ensin.');
                }

                let projectId = window.manuscriptData?.id || null;
                if (!projectId && window.manuscriptData) {
                    const savedProject = await window.saveManuscriptToDB(window.manuscriptData);
                    projectId = savedProject?.id || null;
                    if (savedProject?.id) window.manuscriptData = savedProject;
                }
                if (!projectId) throw new Error('Käsikirjoitusta ei saatu tallennettua ennen analyysia.');

                const startRes = await apiFetch('/api/analyze/jobs', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({project_id: projectId})
                });
                const startedJob = await startRes.json().catch(() => null);
                if (!startRes.ok) throw new Error(startedJob?.detail || 'Analyysin käynnistys epäonnistui.');
                setAnalysisProgress(startedJob);
                const finishedJob = await pollAnalysisJob(startedJob.job_id);
                clearInterval(analysisInterval);
                analysisLoader.classList.add('hidden');
                analysisResults.classList.remove('hidden');
                await applyAnalysisResult(finishedJob.data);
                if (finishedJob.status === 'partial') {
                    alert('Analyysi valmistui osittaisena. Osa käsikirjoituksen kohdista voi vaatia uuden ajon tai käsittelyn pienemmissä osissa.');
                }
            } catch(e) {
                clearInterval(analysisInterval);
                alert('Analyysi epäonnistui:\n' + networkFailureMessage(e));
                analysisLoader.classList.add('hidden');
                runAnalysisBtn.style.display = 'block';
                loadUsage();
            }
        });
    }

    // --- 4. Split-Screen Editor Logic ---
    const aiBtn = document.getElementById('ai-improve-btn');
    const editableText = document.getElementById('edited-text');
    const italicSelectionBtn = document.getElementById('italic-selection-btn');
    const editScopeSelect = document.getElementById('edit-scope');
    const editorWorkspace = document.getElementById('editor-workspace');
    const addEditorChapterBtn = document.getElementById('add-editor-chapter-btn');
    const deleteEditorChapterBtn = document.getElementById('delete-editor-chapter-btn');
    const toggleEditorMarkupBtn = document.getElementById('toggle-editor-markup-btn');
    const viewEditorMarkdownBtn = document.getElementById('view-editor-markdown-btn');
    const toggleEditorNavBtn = document.getElementById('toggle-editor-nav-btn');
    const toggleEditorCommentsBtn = document.getElementById('toggle-editor-comments-btn');
    const massEditToggle = document.getElementById('mass-edit-toggle');
    const massEditBody = document.getElementById('mass-edit-body');
    const massEditScope = document.getElementById('mass-edit-scope');
    const massFindInput = document.getElementById('mass-find-input');
    const massReplaceInput = document.getElementById('mass-replace-input');
    const massReplaceBtn = document.getElementById('mass-replace-btn');
    const aiItalicizeBtn = document.getElementById('ai-italicize-btn');
    const aiRestructureBtn = document.getElementById('ai-restructure-btn');
    const massEditStatus = document.getElementById('mass-edit-status');
    let editingAutosaveTimer = null;

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
            return chapterTextForEditor(chapter, sel.cIndex).trim();
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
        columns.push('minmax(0, 1fr)', 'minmax(0, 1fr)', '220px');
        if (!hideComments) columns.push('240px');
        editorWorkspace.style.gridTemplateColumns = columns.join(' ');
    }

    function splitIntoParagraphs(text) {
        return String(text || '')
            .split(/\n\s*\n/)
            .map(part => part.trim())
            .filter(Boolean);
    }

    function massEditSelectionScope() {
        return massEditScope?.value === 'book' ? 'book' : 'chapter';
    }

    function chapterToMassText(chapter) {
        return [chapter?.title || '', ...(chapter?.paragraphs || [])].filter(Boolean).join('\n\n');
    }

    function applyMassTextToChapter(chapter, text) {
        const parts = splitIntoParagraphs(text);
        if (!parts.length) return;
        chapter.title = parts.shift() || chapter.title || 'Nimetön luku';
        chapter.paragraphs = parts.length ? parts : [''];
    }

    function selectedItalicRules() {
        return Array.from(document.querySelectorAll('.italic-rule-option:checked'))
            .map(input => input.value)
            .filter(Boolean);
    }

    function wrapEditableSelectionWithItalics() {
        if (!editableText) return;
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            alert('Valitse ensin kursivoitava teksti kohdeversiosta.');
            return;
        }
        const range = selection.getRangeAt(0);
        if (!editableText.contains(range.commonAncestorContainer)) {
            alert('Valitse kursivoitava teksti kohdeversiosta.');
            return;
        }
        const selected = selection.toString();
        if (!selected.trim()) return;
        range.deleteContents();
        range.insertNode(document.createTextNode(`*${selected}*`));
        selection.removeAllRanges();
        renderEditedDiffPreview();
    }

    async function applyMassTextTransform(transform, statusText) {
        if (!window.manuscriptData?.chapters?.length) {
            alert('Lataa tai valitse käsikirjoitus ensin.');
            return;
        }
        syncEditedTargetToManuscript({ showAlerts: false });
        const scope = massEditSelectionScope();
        const sel = window.currentEditSelection || {};
        if (scope === 'book') {
            window.manuscriptData.chapters.forEach(chapter => {
                chapter.title = transform(chapter.title || '');
                chapter.paragraphs = (chapter.paragraphs || []).map(paragraph => transform(paragraph));
            });
        } else {
            const chapter = window.manuscriptData.chapters[sel.cIndex];
            if (!chapter) {
                alert('Valitse luku ensin.');
                return;
            }
            chapter.title = transform(chapter.title || '');
            chapter.paragraphs = (chapter.paragraphs || []).map(paragraph => transform(paragraph));
        }
        if (scope === 'book') {
            await window.replaceProjectChaptersInDB(window.manuscriptData);
        } else {
            await window.saveProjectChapterToDB(window.manuscriptData, sel.cIndex);
        }
        renderBookOverview();
        if (window.renderNavList) window.renderNavList();
        renderWritingView();
        const nextSel = window.currentEditSelection || { cIndex: firstBodyChapterIndex(), pIndex: 0 };
        if (window.loadParagraph && window.manuscriptData.chapters[nextSel.cIndex]) {
            const pIndex = Math.min(nextSel.pIndex || 0, window.manuscriptData.chapters[nextSel.cIndex].paragraphs.length - 1);
            window.loadParagraph(nextSel.cIndex, pIndex, null);
        }
        if (massEditStatus) massEditStatus.textContent = statusText;
    }

    function parseRestructuredChapters(text, fallbackTitle) {
        const parsed = createManuscriptFromText(fallbackTitle || 'Uusi rakenne', text);
        const chapters = (parsed.chapters || []).filter(chapter => {
            const joined = (chapter.paragraphs || []).join(' ').trim();
            return joined && !/^\(Ei .+ havaittu\)$/i.test(joined);
        });
        if (chapters.length) return chapters;
        return [{
            id: `luku_${Date.now()}`,
            title: fallbackTitle || 'Uusi luku',
            paragraphs: splitIntoParagraphs(text)
        }];
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
                    throw new Error(await apiErrorMessage(res, 'Editointi epäonnistui.'));
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
                alert('Editointi epäonnistui: ' + err.message);
                setAiButtonIdle();
                aiBtn.style.pointerEvents = 'auto';
                loadUsage();
            });
        });
    }

    if (editScopeSelect) {
        editScopeSelect.addEventListener('change', refreshEditableTextForScope);
    }

    if (italicSelectionBtn) italicSelectionBtn.addEventListener('click', wrapEditableSelectionWithItalics);

    if (addEditorChapterBtn) addEditorChapterBtn.addEventListener('click', () => addChapterNearSelection('editor'));
    if (deleteEditorChapterBtn) deleteEditorChapterBtn.addEventListener('click', () => deleteSelectedChapter('editor'));
    if (toggleEditorMarkupBtn) toggleEditorMarkupBtn.addEventListener('click', toggleManuscriptMarkup);
    if (viewEditorMarkdownBtn) viewEditorMarkdownBtn.addEventListener('click', viewMarkdownFile);
    updateMarkupButtons();

    if (massEditToggle && massEditBody) {
        massEditToggle.addEventListener('click', () => {
            const isOpen = massEditToggle.getAttribute('aria-expanded') === 'true';
            massEditToggle.setAttribute('aria-expanded', String(!isOpen));
            massEditBody.classList.toggle('hidden', isOpen);
        });
    }

    if (massReplaceBtn) {
        massReplaceBtn.addEventListener('click', () => {
            const findText = massFindInput?.value || '';
            const replaceText = massReplaceInput?.value || '';
            if (!findText) {
                if (massEditStatus) massEditStatus.textContent = 'Kirjoita ensin etsittävä teksti.';
                return;
            }
            applyMassTextTransform(
                text => text.split(findText).join(replaceText),
                'Etsi ja korvaa tehty.'
            );
        });
    }

    if (aiItalicizeBtn) {
        aiItalicizeBtn.addEventListener('click', async () => {
            if (!window.manuscriptData?.chapters?.length) {
                alert('Lataa tai valitse käsikirjoitus ensin.');
                return;
            }
            const rules = selectedItalicRules();
            if (!rules.length) {
                if (massEditStatus) massEditStatus.textContent = 'Valitse ensin vähintään yksi kursivointiperuste.';
                return;
            }
            const scope = massEditSelectionScope();
            const sel = window.currentEditSelection || {};
            const chapter = window.manuscriptData.chapters[sel.cIndex];
            const targets = scope === 'book'
                ? window.manuscriptData.chapters.map((item, index) => ({ chapter: item, index }))
                : (chapter ? [{ chapter, index: sel.cIndex }] : []);
            if (!targets.length) {
                alert('Valitse luku ensin.');
                return;
            }
            if (!confirm('Lisätäänkö kursivointimerkinnät valittuun tekstiin automaattisesti?')) return;
            aiItalicizeBtn.disabled = true;
            if (massEditStatus) massEditStatus.textContent = 'Haetaan kursivointiehdotusta...';
            try {
                for (const target of targets) {
                    const sourceText = chapterToMassText(target.chapter);
                    const res = await apiFetch('/api/edit', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            text: sourceText,
                            temperature: 0.2,
                            prompt: `Lisää tekstiin kursivointimerkinnät vain tarvittaviin kohtiin. Käytä kursivointiin yksittäisiä tähtiä näin: *kursivoitu teksti*. Älä käytä tuplatähtiä. Säilytä luvun otsikko ensimmäisenä kappaleena ja säilytä kappalejako. Älä lisää selityksiä.\n\nKursivointiperusteet:\n- ${rules.join('\n- ')}`
                        })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.detail || 'Kursivointi epäonnistui.');
                    applyMassTextToChapter(target.chapter, data.edited_text || sourceText);
                }
                if (scope === 'book') {
                    await window.replaceProjectChaptersInDB(window.manuscriptData);
                } else {
                    await window.saveProjectChapterToDB(window.manuscriptData, targets[0].index);
                }
                renderBookOverview();
                if (window.renderNavList) window.renderNavList();
                renderWritingView();
                const next = window.currentEditSelection || { cIndex: firstBodyChapterIndex(), pIndex: 0 };
                if (window.loadParagraph && window.manuscriptData.chapters[next.cIndex]) {
                    window.loadParagraph(next.cIndex, Math.min(next.pIndex || 0, window.manuscriptData.chapters[next.cIndex].paragraphs.length - 1), null);
                }
                loadUsage();
                if (massEditStatus) massEditStatus.textContent = 'Kursivointiehdotus lisätty.';
            } catch (err) {
                if (massEditStatus) massEditStatus.textContent = err.message;
                loadUsage();
            } finally {
                aiItalicizeBtn.disabled = false;
            }
        });
    }

    if (aiRestructureBtn) {
        aiRestructureBtn.addEventListener('click', async () => {
            if (!window.manuscriptData?.chapters?.length) {
                alert('Lataa tai valitse käsikirjoitus ensin.');
                return;
            }
            const scope = massEditSelectionScope();
            const sel = window.currentEditSelection || {};
            const chapter = window.manuscriptData.chapters[sel.cIndex];
            const sourceText = scope === 'book'
                ? getFullManuscriptText(window.manuscriptData)
                : (chapter?.paragraphs || []).join('\n\n');
            if (!sourceText.trim()) {
                if (massEditStatus) massEditStatus.textContent = 'Käsiteltävää tekstiä ei löytynyt.';
                return;
            }
            if (!confirm('Korvataanko nykyinen luku- ja kappalejako ehdotetulla rakenteella?')) return;
            aiRestructureBtn.disabled = true;
            if (massEditStatus) massEditStatus.textContent = 'Haetaan uutta jakoa...';
            try {
                const res = await apiFetch('/api/edit', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        text: sourceText,
                        temperature: 0.2,
                        prompt: 'Jaa teksti uudelleen selkeiksi luvuiksi ja kappaleiksi. Palauta vain valmis käsikirjoitusteksti: luvun otsikko omalle rivilleen, kappaleet tyhjällä rivillä erotettuina. Älä lisää selityksiä.'
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Uuden jaon tekeminen epäonnistui.');
                const chapters = parseRestructuredChapters(data.edited_text || '', chapter?.title || window.manuscriptData.title);
                if (scope === 'book') {
                    window.manuscriptData.chapters = chapters;
                    writingSelection = { cIndex: firstBodyChapterIndex(chapters), pIndex: 0 };
                    window.currentEditSelection = { cIndex: writingSelection.cIndex, pIndex: 0 };
                } else {
                    if (!chapter) throw new Error('Valittua lukua ei löytynyt.');
                    window.manuscriptData.chapters.splice(sel.cIndex, 1, ...chapters);
                    writingSelection = { cIndex: sel.cIndex, pIndex: 0 };
                    window.currentEditSelection = { cIndex: sel.cIndex, pIndex: 0 };
                }
                await window.replaceProjectChaptersInDB(window.manuscriptData);
                renderBookOverview();
                if (window.renderNavList) window.renderNavList();
                renderWritingView();
                if (window.loadParagraph) window.loadParagraph(window.currentEditSelection.cIndex, 0, null);
                loadUsage();
                if (massEditStatus) massEditStatus.textContent = 'Uusi jako tehty.';
            } catch (err) {
                if (massEditStatus) massEditStatus.textContent = err.message;
                loadUsage();
            } finally {
                aiRestructureBtn.disabled = false;
            }
        });
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
    function setIllustrationStatus(message, isError = false) {
        if (!illustrationStatus) return;
        illustrationStatus.textContent = message;
        illustrationStatus.style.color = isError ? '#ffb4b4' : 'var(--text-secondary)';
    }

    function analysisCoverPrompt() {
        const analysis = window.manuscriptData?.analysis || {};
        if (analysis.cover_prompt) return String(analysis.cover_prompt).trim();
        const prompts = analysis.cover_prompts;
        if (Array.isArray(prompts) && prompts.length) return String(prompts[0]).trim();
        if (typeof prompts === 'string') {
            const firstLine = prompts.split('\n').map(line => line.trim()).filter(Boolean)[0] || '';
            return firstLine.replace(/^[\d.)\-\s]+/, '').trim();
        }
        return '';
    }

    function analysisBackCoverText() {
        const analysis = window.manuscriptData?.analysis || {};
        return String(
            analysis.backcover_text ||
            analysis.back_cover_text ||
            analysis.takakansiteksti ||
            analysis.marketing_blurb ||
            analysis.blurb ||
            analysis.synopsis ||
            ''
        ).trim();
    }

    function updateIllustrationProjectText() {
        if (!illustrationCurrentProject) return;
        const title = window.manuscriptData?.title || '[Ei aktiivista teosta]';
        illustrationCurrentProject.textContent = `Käsikirjoitus: ${title}`;
    }

    function setMarketingStatus(message, isError = false) {
        const status = document.getElementById('marketing-status');
        if (!status) return;
        status.textContent = message;
        status.style.color = isError ? '#ffb4b4' : 'var(--text-secondary)';
    }

    function setMarketingFieldValue(id, value, force = false) {
        const element = document.getElementById(id);
        if (!element) return;
        const next = String(value || '').trim();
        if (force || !element.value.trim()) element.value = next;
    }

    function renderMarketingMaterialsFromAnalysis(force = false) {
        const current = document.getElementById('marketing-current-project');
        if (current) {
            current.textContent = window.manuscriptData
                ? `Käsikirjoitus: ${window.manuscriptData.title || 'Nimetön'}`
                : 'Käsikirjoitus: [Ei aktiivista teosta]';
        }
        const analysis = window.manuscriptData?.analysis || {};
        const title = window.manuscriptData?.title || 'Teos';
        const shortText = analysis.marketing_short || analysis.backcover || analysis.synopsis || '';
        const longText = analysis.marketing_long || analysis.backcover || analysis.synopsis || '';
        setMarketingFieldValue('marketing-short', shortText, force);
        setMarketingFieldValue('marketing-long', longText, force);
        setMarketingFieldValue('marketing-instagram', analysis.instagram_post || '', force);
        setMarketingFieldValue('marketing-facebook', analysis.facebook_post || '', force);
        setMarketingFieldValue('marketing-video', analysis.video_script || '', force);
        setMarketingFieldValue('marketing-hashtags', analysis.hashtags || '', force);
        if (!window.manuscriptData) {
            setMarketingStatus('Valitse käsikirjoitus ensin.', true);
        } else if (!hasSavedAnalysis(analysis)) {
            setMarketingStatus('Tee ensin analyysi, jotta aineistot voidaan muodostaa teoksen metatiedoista.', true);
        } else if (!shortText && !longText) {
            setMarketingStatus(`${title}: analyysi löytyi. Voit luoda markkinointiaineistot AI:lla.`);
        } else {
            setMarketingStatus(`${title}: analyysin markkinointitiedot ladattu. Voit luoda uuden kampanjapaketin AI:lla.`);
        }
    }

    async function generateMarketingMaterials() {
        if (!window.manuscriptData) {
            setMarketingStatus('Valitse käsikirjoitus ensin.', true);
            return;
        }
        if (!hasSavedAnalysis(window.manuscriptData.analysis)) {
            setMarketingStatus('Tee analyysi ensin. Markkinointiaineistot hyödyntävät analyysin synopsista, genreä, kohderyhmää ja tyyliä.', true);
            return;
        }
        if (!window.manuscriptData.id) {
            const savedProject = await window.saveManuscriptToDB(window.manuscriptData);
            if (savedProject?.id) window.manuscriptData = savedProject;
        }
        if (!window.manuscriptData?.id) {
            setMarketingStatus('Käsikirjoitusta ei saatu tallennettua ennen markkinointiaineistoja.', true);
            return;
        }

        const button = document.getElementById('marketing-generate-btn');
        if (button) button.disabled = true;
        setMarketingStatus('Luodaan markkinointiaineistoja analyysin ja käsikirjoitustietojen pohjalta...');
        try {
            const res = await apiFetch('/api/marketing/materials', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ project_id: window.manuscriptData.id })
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.detail || 'Markkinointiaineistojen luonti epäonnistui.');
            setMarketingFieldValue('marketing-short', data.short_description, true);
            setMarketingFieldValue('marketing-long', data.long_description, true);
            setMarketingFieldValue('marketing-instagram', data.instagram_post, true);
            setMarketingFieldValue('marketing-facebook', data.facebook_post, true);
            setMarketingFieldValue('marketing-video', data.video_script, true);
            setMarketingFieldValue('marketing-hashtags', data.hashtags, true);
            setMarketingStatus(data.warnings ? `${data.warnings} Lähde: ${data.generated_by}.` : `Markkinointiaineistot luotu. Lähde: ${data.generated_by}.`);
            loadUsage();
        } catch (err) {
            setMarketingStatus(err.message, true);
            alert('Markkinointiaineistojen luonti epäonnistui: ' + networkFailureMessage(err));
            loadUsage();
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function copyMarketingField(targetId) {
        const element = document.getElementById(targetId);
        const text = element?.value || '';
        if (!text.trim()) {
            setMarketingStatus('Ei kopioitavaa tekstiä.', true);
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
            setMarketingStatus('Teksti kopioitu leikepöydälle.');
        } catch (err) {
            setMarketingStatus('Kopiointi epäonnistui. Voit valita tekstin ja kopioida sen käsin.', true);
        }
    }

    async function loadImageModels() {
        if (!coverModelSelect) return;
        try {
            const res = await apiFetch('/api/models/image');
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Kuvamallien lataus epäonnistui.');
            imageModels = data || [];
            if (!imageModels.length) {
                coverModelSelect.innerHTML = '<option value="">Ei käytössä olevia kuvamalleja</option>';
                return;
            }
            coverModelSelect.innerHTML = imageModels
                .map(model => `<option value="${escapeHtml(`${model.provider}:${model.model_name}`)}">${escapeHtml(model.display_name)}</option>`)
                .join('');
            const defaultModel = imageModels.find(model => model.is_default) || imageModels[0];
            if (defaultModel) coverModelSelect.value = `${defaultModel.provider}:${defaultModel.model_name}`;
        } catch (err) {
            coverModelSelect.innerHTML = '<option value="">Kuvamalleja ei saatu ladattua</option>';
            setIllustrationStatus(err.message, true);
        }
    }

    function renderCoverImages(items = []) {
        updateIllustrationProjectText();
        if (!coverGallery || !coverEmptyState || !coverLatestPreview) return;
        coverGallery.innerHTML = '';
        coverEmptyState.hidden = items.length > 0;

        if (!items.length) {
            coverLatestPreview.innerHTML = 'Kansikuva tai takakansi ilmestyy tähän.';
            return;
        }

        coverLatestPreview.innerHTML = `<img src="${items[0].data_url}" alt="Viimeisin kansi" style="width:100%; max-height:520px; object-fit:contain; border-radius:10px;">`;
        items.forEach(item => {
            const typeLabel = item.asset_type === 'back_cover_image' ? 'Takakansi' : 'Etukansi';
            const card = document.createElement('div');
            card.className = 'card glass-panel';
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.gap = '12px';
            card.innerHTML = `
                <img src="${item.data_url}" alt="${escapeHtml(item.title)}" style="width:100%; aspect-ratio:3 / 4; object-fit:cover; border-radius:8px; border:1px solid var(--border-color);">
                <div>
                    <strong style="font-size:14px;">${escapeHtml(item.title)}</strong>
                    <p class="card-meta" style="margin:6px 0 0;">${typeLabel} · ${escapeHtml(item.model || 'Kuvamalli')}</p>
                </div>
                <details style="font-size:12px; color:var(--text-secondary);">
                    <summary>Prompti</summary>
                    <p style="white-space:pre-wrap; margin-top:8px;">${escapeHtml(item.prompt || '')}</p>
                </details>
                <button class="btn btn-secondary btn-danger-soft delete-cover-btn" type="button" data-asset-id="${item.id}">Poista kuva</button>
            `;
            coverGallery.appendChild(card);
        });
        coverGallery.querySelectorAll('.delete-cover-btn').forEach(button => {
            button.addEventListener('click', () => deleteCoverImage(button.dataset.assetId));
        });
    }

    async function loadCoverImages() {
        updateIllustrationProjectText();
        if (!window.manuscriptData?.id) {
            renderCoverImages([]);
            setIllustrationStatus('Valitse tai tallenna käsikirjoitus ennen kansikuvan generointia.');
            return;
        }
        try {
            const res = await apiFetch(`/api/projects/${window.manuscriptData.id}/cover-images`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Kansikuvien lataus epäonnistui.');
            renderCoverImages(data || []);
            if (data?.length) setIllustrationStatus('Kansikuvat ladattu.');
        } catch (err) {
            setIllustrationStatus(err.message, true);
        }
    }

    async function deleteCoverImage(assetId) {
        if (!window.manuscriptData?.id || !assetId) return;
        if (!confirm('Poistetaanko kuva?')) return;
        setIllustrationStatus('Poistetaan kuvaa...');
        try {
            const res = await apiFetch(`/api/projects/${window.manuscriptData.id}/assets/${assetId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(await apiErrorMessage(res, 'Kuvan poisto epäonnistui.'));
            await loadCoverImages();
            setIllustrationStatus('Kuva poistettu.');
        } catch (err) {
            setIllustrationStatus(err.message, true);
        }
    }

    async function generateCoverImage() {
        if (!window.manuscriptData) {
            setIllustrationStatus('Valitse ensin käsikirjoitus.', true);
            return;
        }
        if (!window.manuscriptData.id) {
            const savedProject = await window.saveManuscriptToDB(window.manuscriptData);
            if (savedProject?.id) window.manuscriptData = savedProject;
        }
        if (!window.manuscriptData?.id) {
            setIllustrationStatus('Käsikirjoitusta ei saatu tallennettua ennen kansikuvaa.', true);
            return;
        }

        const coverSide = coverSideSelect?.value === 'back' ? 'back' : 'front';
        const prompt = (coverPrompt?.value || '').trim();
        const fallbackPrompt = coverSide === 'back' ? analysisBackCoverText() : analysisCoverPrompt();
        if (!prompt && fallbackPrompt && coverPrompt) {
            coverPrompt.value = fallbackPrompt;
        }

        if (coverGenerateBtn) coverGenerateBtn.disabled = true;
        if (coverLatestPreview) {
            coverLatestPreview.innerHTML = `<div style="text-align:center; color:var(--text-secondary);">Generoidaan ${coverSide === 'back' ? 'takakantta' : 'kansikuvaa'}...</div>`;
        }
        setIllustrationStatus(`${coverSide === 'back' ? 'Takakantta' : 'Kansikuvaa'} generoidaan. Tässä voi mennä hetki.`);

        try {
            const res = await apiFetch(`/api/projects/${window.manuscriptData.id}/cover-images`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    prompt: (coverPrompt?.value || '').trim(),
                    cover_side: coverSide,
                    model: coverModelSelect?.value || null,
                    aspect_ratio: coverAspectSelect?.value || '3:4',
                    title_text: window.manuscriptData.title || '',
                    author_text: window.manuscriptData.author || ''
                })
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.detail || 'Kansikuvan generointi epäonnistui.');
            setIllustrationStatus(`${coverSide === 'back' ? 'Takakansi' : 'Kansikuva'} tallennettu käsikirjoitukselle.`);
            await loadCoverImages();
            loadUsage();
        } catch (err) {
            if (coverLatestPreview) {
                coverLatestPreview.innerHTML = `${coverSide === 'back' ? 'Takakantta' : 'Kansikuvaa'} ei saatu generoitua.`;
            }
            const message = String(err?.message || err || '');
            setIllustrationStatus(message.includes('Failed to fetch') ? networkFailureMessage(err, 'cover') : message, true);
        } finally {
            if (coverGenerateBtn) coverGenerateBtn.disabled = false;
        }
    }

    if (coverLoadPromptBtn) {
        coverLoadPromptBtn.addEventListener('click', () => {
            const isBackCover = coverSideSelect?.value === 'back';
            const prompt = isBackCover ? analysisBackCoverText() : analysisCoverPrompt();
            if (!prompt) {
                setIllustrationStatus(isBackCover
                    ? 'Analyysista ei löytynyt takakansitekstiä. Voit kirjoittaa sen käsin.'
                    : 'Analyysista ei löytynyt kansikuvapromptia. Voit kirjoittaa promptin käsin.', true);
                return;
            }
            if (coverPrompt) coverPrompt.value = prompt;
            setIllustrationStatus(isBackCover ? 'Takakansiteksti ladattu kenttään.' : 'Analyysin kansikuvaprompti ladattu kenttään.');
        });
    }

    if (coverGenerateBtn) {
        coverGenerateBtn.addEventListener('click', generateCoverImage);
    }

    function layoutFileName(asset) {
        const safeTitle = (window.manuscriptData?.title || 'kasikirjoitus').toLowerCase().replace(/[^a-z0-9åäö]+/gi, '-').replace(/^-|-$/g, '') || 'kasikirjoitus';
        return asset.asset_type === 'layout_pdf' ? `${safeTitle}.pdf` : `${safeTitle}.tex`;
    }

    function downloadAsset(asset) {
        if (!asset?.data_url) return;
        const link = document.createElement('a');
        link.href = asset.data_url;
        link.download = layoutFileName(asset);
        link.click();
    }

    function renderLayoutAssets(items = []) {
        const container = document.getElementById('layout-assets');
        const status = document.getElementById('layout-status');
        if (!container) return;
        container.innerHTML = '';
        if (!items.length) {
            if (status) status.textContent = 'Ei ajettua taittoa vielä.';
            return;
        }
        if (status) status.textContent = 'Taittotiedostot tallennettu käsikirjoitukselle.';
        items.forEach(asset => {
            const card = document.createElement('div');
            card.className = 'card glass-panel';
            card.innerHTML = `
                <strong>${escapeHtml(asset.asset_type === 'layout_pdf' ? 'PDF-taittovedos' : 'LaTeX-lähde')}</strong>
                <p class="card-meta">${escapeHtml(asset.title || '')}</p>
                <p class="card-meta">${escapeHtml(asset.model || 'python:layout-generator')}</p>
                <button class="btn btn-secondary layout-download-btn" type="button">Lataa ${asset.asset_type === 'layout_pdf' ? 'PDF' : 'LaTeX'}</button>
            `;
            card.querySelector('.layout-download-btn')?.addEventListener('click', () => downloadAsset(asset));
            container.appendChild(card);
        });
    }

    async function loadLayoutAssets() {
        if (!window.manuscriptData?.id) {
            renderLayoutAssets([]);
            return;
        }
        const status = document.getElementById('layout-status');
        try {
            const res = await apiFetch(`/api/projects/${window.manuscriptData.id}/layout-assets`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Taittotiedostojen lataus epäonnistui.');
            renderLayoutAssets(data || []);
        } catch (err) {
            if (status) status.textContent = err.message;
        }
    }

    async function runLayout() {
        const button = document.getElementById('layout-run-btn');
        const status = document.getElementById('layout-status');
        if (!window.manuscriptData?.id) {
            alert('Valitse tai tallenna käsikirjoitus ensin.');
            return;
        }
        if (button) button.disabled = true;
        if (status) status.textContent = 'Tallennetaan nykyinen toimitettu versio ja ajetaan taitto...';
        try {
            const savedProject = await window.saveManuscriptToDB(window.manuscriptData);
            if (savedProject?.id) window.manuscriptData = savedProject;
            const res = await apiFetch(`/api/projects/${window.manuscriptData.id}/layout/run`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    layout_style: document.getElementById('layout-size-select')?.value || 'A5',
                    include_markdown_markers: true,
                    hyphenation_level: document.getElementById('layout-hyphenation-select')?.value || 'balanced'
                })
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.detail || 'Taiton ajo epäonnistui.');
            renderLayoutAssets([data.pdf, data.latex].filter(Boolean));
        } catch (err) {
            if (status) status.textContent = err.message;
            alert('Taiton ajo epäonnistui: ' + err.message);
        } finally {
            if (button) button.disabled = false;
        }
    }

    function proofreadChapterText(chapter) {
        return (chapter?.paragraphs || []).filter(Boolean).join('\n\n');
    }

    function updateProofreadProjectText() {
        const current = document.getElementById('proofread-current-project');
        if (!current) return;
        current.textContent = window.manuscriptData
            ? `Käsikirjoitus: ${window.manuscriptData.title || 'Nimetön'}`
            : 'Käsikirjoitus: [Ei aktiivista teosta]';
    }

    function renderProofreadSuggestions() {
        const list = document.getElementById('proofread-suggestions-list');
        const count = document.getElementById('proofread-count');
        if (!list) return;
        const visible = proofreadSuggestions.filter(item => item.status !== 'rejected' && item.status !== 'accepted');
        if (count) count.textContent = `${visible.length} ehdotusta`;
        if (!proofreadSuggestions.length) {
            list.innerHTML = '<p style="color:var(--text-secondary);">Ei ehdotuksia vielä.</p>';
            return;
        }
        list.innerHTML = proofreadSuggestions.map((item, index) => {
            const statusText = item.status === 'accepted' ? 'Hyväksytty' : item.status === 'rejected' ? 'Hylätty' : 'Avoin';
            return `
                <div class="proofread-suggestion" data-proofread-index="${index}" style="${item.status ? 'opacity:0.62;' : ''}">
                    <span class="badge">${escapeHtml(item.type || 'Oikoluku')}</span>
                    <p><strong>Alkuperäinen:</strong><br><del>${escapeHtml(item.original || '')}</del></p>
                    <p><strong>Ehdotus:</strong><br>${escapeHtml(item.replacement || '')}</p>
                    <p><strong>Perustelu:</strong> ${escapeHtml(item.reason || '')}</p>
                    <p class="card-meta">Tila: ${statusText}${Number.isInteger(item.paragraph_index) ? ` · kappale ${item.paragraph_index + 1}` : ''}</p>
                    <div class="proofread-suggestion-actions">
                        <button class="btn btn-secondary accept-proofread-btn" type="button" data-proofread-index="${index}" ${item.status ? 'disabled' : ''}>Hyväksy</button>
                        <button class="btn btn-secondary btn-danger-soft reject-proofread-btn" type="button" data-proofread-index="${index}" ${item.status ? 'disabled' : ''}>Hylkää</button>
                    </div>
                </div>
            `;
        }).join('');
        list.querySelectorAll('.accept-proofread-btn').forEach(button => {
            button.addEventListener('click', () => acceptProofreadSuggestion(Number(button.dataset.proofreadIndex)));
        });
        list.querySelectorAll('.reject-proofread-btn').forEach(button => {
            button.addEventListener('click', () => {
                const suggestion = proofreadSuggestions[Number(button.dataset.proofreadIndex)];
                if (!suggestion) return;
                suggestion.status = 'rejected';
                renderProofreadSuggestions();
            });
        });
    }

    function renderProofreadView() {
        updateProofreadProjectText();
        const select = document.getElementById('proofread-chapter-select');
        const source = document.getElementById('proofread-source-text');
        const title = document.getElementById('proofread-chapter-title');
        const status = document.getElementById('proofread-status');
        if (!select || !source || !title) return;
        const chapters = window.manuscriptData?.chapters || [];
        select.innerHTML = '';
        if (!chapters.length) {
            source.value = '';
            title.textContent = 'Valitse käsikirjoitus';
            if (status) status.textContent = 'Lataa tai valitse käsikirjoitus ensin.';
            proofreadSuggestions = [];
            renderProofreadSuggestions();
            return;
        }
        chapters.forEach((chapter, index) => {
            const option = document.createElement('option');
            option.value = String(index);
            option.textContent = chapter.title || `Luku ${index + 1}`;
            select.appendChild(option);
        });
        if (proofreadSelection.cIndex === null || !chapters[proofreadSelection.cIndex]) {
            proofreadSelection.cIndex = firstBodyChapterIndex(chapters);
        }
        select.value = String(proofreadSelection.cIndex);
        const chapter = chapters[proofreadSelection.cIndex];
        title.textContent = chapter?.title || `Luku ${proofreadSelection.cIndex + 1}`;
        source.value = proofreadChapterText(chapter);
        if (status && !proofreadSuggestions.length) status.textContent = 'Valitse luku ja käynnistä oikoluku.';
        renderProofreadSuggestions();
    }

    async function runProofreadChapter() {
        if (!window.manuscriptData?.id) {
            alert('Valitse tai tallenna käsikirjoitus ensin.');
            return;
        }
        const select = document.getElementById('proofread-chapter-select');
        const button = document.getElementById('proofread-run-btn');
        const status = document.getElementById('proofread-status');
        const chapterIndex = Number(select?.value ?? proofreadSelection.cIndex ?? 0);
        const chapter = window.manuscriptData.chapters?.[chapterIndex];
        if (!chapter) {
            alert('Valitse luku ensin.');
            return;
        }
        if (button) button.disabled = true;
        if (status) status.textContent = 'Tallennetaan nykyinen versio ja oikoluetaan lukua...';
        proofreadSuggestions = [];
        renderProofreadSuggestions();
        try {
            const savedProject = await window.saveManuscriptToDB(window.manuscriptData);
            if (savedProject?.id) window.manuscriptData = savedProject;
            const res = await apiFetch('/api/proofread/chapter', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    project_id: window.manuscriptData.id,
                    chapter_index: chapterIndex
                })
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.detail || 'Oikoluku epäonnistui.');
            proofreadSelection.cIndex = chapterIndex;
            proofreadSuggestions = (data.suggestions || []).map(item => ({ ...item, status: '' }));
            if (status) {
                status.textContent = data.warnings
                    ? `${data.warnings} ${proofreadSuggestions.length} ehdotusta.`
                    : `${proofreadSuggestions.length} korjausehdotusta.`;
            }
            renderProofreadView();
            loadUsage();
        } catch (err) {
            if (status) status.textContent = err.message;
            alert('Oikoluku epäonnistui: ' + err.message);
            loadUsage();
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function acceptProofreadSuggestion(index) {
        const suggestion = proofreadSuggestions[index];
        const chapter = window.manuscriptData?.chapters?.[proofreadSelection.cIndex];
        if (!suggestion || !chapter) return;
        let changed = false;
        const targetIndex = Number.isInteger(suggestion.paragraph_index) ? suggestion.paragraph_index : -1;
        if (targetIndex >= 0 && chapter.paragraphs?.[targetIndex]?.includes(suggestion.original)) {
            chapter.paragraphs[targetIndex] = chapter.paragraphs[targetIndex].replace(suggestion.original, suggestion.replacement);
            changed = true;
        } else {
            for (let i = 0; i < (chapter.paragraphs || []).length; i++) {
                if (chapter.paragraphs[i].includes(suggestion.original)) {
                    chapter.paragraphs[i] = chapter.paragraphs[i].replace(suggestion.original, suggestion.replacement);
                    suggestion.paragraph_index = i;
                    changed = true;
                    break;
                }
            }
        }
        if (!changed) {
            alert('Alkuperäistä kohtaa ei löytynyt enää luvusta. Ehdotus voi olla vanhentunut.');
            return;
        }
        suggestion.status = 'accepted';
        await window.saveProjectChapterToDB(window.manuscriptData, proofreadSelection.cIndex);
        renderBookOverview();
        renderWritingView();
        renderProofreadView();
        renderMarketingMaterialsFromAnalysis(false);
        if (window.renderNavList) window.renderNavList();
    }

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
    const cleanWritingTextBtn = document.getElementById('clean-writing-text-btn');
    const restructureWritingBtn = document.getElementById('restructure-writing-btn');
    const toggleWritingMarkupBtn = document.getElementById('toggle-writing-markup-btn');
    const viewWritingMarkdownBtn = document.getElementById('view-writing-markdown-btn');
    const markdownHelpBtn = document.getElementById('markdown-help-btn');
    const addWritingChapterBtn = document.getElementById('add-writing-chapter-btn');
    const deleteWritingChapterBtn = document.getElementById('delete-writing-chapter-btn');
    const addWritingParagraphBtn = document.getElementById('add-writing-paragraph-btn');
    const deleteWritingParagraphBtn = document.getElementById('delete-writing-paragraph-btn');
    const writingParagraphJumpBtn = document.getElementById('writing-paragraph-jump-btn');
    const writingParagraphJumpInput = document.getElementById('writing-paragraph-jump');
    const writingTextArea = document.getElementById('writing-text');

    if (refreshBookPreviewBtn) refreshBookPreviewBtn.addEventListener('click', renderBookOverview);
    if (downloadBookTextBtn) downloadBookTextBtn.addEventListener('click', downloadCurrentBookText);
    if (layoutOfferEbookBtn) layoutOfferEbookBtn.addEventListener('click', () => requestLayoutOffer('E-kirja'));
    if (layoutOfferPrintBtn) layoutOfferPrintBtn.addEventListener('click', () => requestLayoutOffer('Painovalmis PDF'));
    [bookFontSelect, bookFontSizeSelect, bookWidthSelect].forEach(select => {
        if (select) select.addEventListener('change', applyBookReaderSettings);
    });
    if (saveWritingBtn) saveWritingBtn.addEventListener('click', () => saveWritingText(true));
    if (cleanWritingTextBtn) cleanWritingTextBtn.addEventListener('click', cleanCurrentWritingChapter);
    if (restructureWritingBtn) restructureWritingBtn.addEventListener('click', restructureWritingManuscript);
    if (toggleWritingMarkupBtn) toggleWritingMarkupBtn.addEventListener('click', toggleManuscriptMarkup);
    if (viewWritingMarkdownBtn) viewWritingMarkdownBtn.addEventListener('click', viewMarkdownFile);
    if (markdownHelpBtn) markdownHelpBtn.addEventListener('click', showMarkdownHelp);
    if (addWritingChapterBtn) addWritingChapterBtn.addEventListener('click', () => addChapterNearSelection('writing'));
    if (deleteWritingChapterBtn) deleteWritingChapterBtn.addEventListener('click', () => deleteSelectedChapter('writing'));
    if (addWritingParagraphBtn) addWritingParagraphBtn.addEventListener('click', addWritingParagraph);
    if (deleteWritingParagraphBtn) deleteWritingParagraphBtn.addEventListener('click', deleteWritingParagraph);
    if (writingParagraphJumpBtn) writingParagraphJumpBtn.addEventListener('click', jumpToWritingParagraph);
    if (writingParagraphJumpInput) {
        writingParagraphJumpInput.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                jumpToWritingParagraph();
            }
        });
    }
    if (writingTextArea) {
        ['keyup', 'click', 'input', 'select'].forEach(eventName => {
            writingTextArea.addEventListener(eventName, updateWritingPositionFromCursor);
        });
        writingTextArea.addEventListener('input', scheduleWritingAutosave);
    }
    window.addEventListener('beforeunload', () => {
        if (currentViewId === 'view-kirjoita') {
            syncWritingEditorToManuscript();
        }
        if (currentViewId === 'view-toimitus') {
            syncEditedTargetToManuscript({ showAlerts: false });
        }
    });

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
                         || /^#{1,6}\s+\S+/.test(line.trim())
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
                const headingMatch = line.trim().match(/^(#{1,6})\s+(.+)$/);
                const headingLevel = headingMatch ? headingMatch[1].length : 1;
                const headingTitle = headingMatch ? headingMatch[2].trim() : line.trim();
                currentChapter = { id: `${headingLevel > 1 ? 'aliluku' : 'luku'}_${lukuCount}`, title: headingTitle.substring(0, 80), paragraphs: [] };
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

    async function createEmptyDocument() {
        const timestamp = new Date().toLocaleString('fi-FI', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        const suggestedTitle = `Uusi käsikirjoitus ${timestamp}`;
        const title = window.prompt('Anna tyhjälle dokumentille nimi', suggestedTitle);
        if (title === null) return;
        const cleanTitle = title.trim() || suggestedTitle;
        const bookData = {
            title: cleanTitle,
            author: currentUser?.display_name || 'Tuntematon',
            source_filename: '',
            chapters: [
                {
                    id: 'luku_1',
                    title: 'Luku 1',
                    paragraphs: ['']
                }
            ],
            analysis: {}
        };

        const saved = await window.saveManuscriptToDB(bookData);
        setActiveManuscript(saved);
        await loadProjects();
        window.openModule('view-kirjoita');
        renderWritingView();
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
        biographyState = defaultBiographyState();
        renderBiography();
        renderBookOverview();
        renderWritingView();
        renderProofreadView();
        if (window.renderNavList) window.renderNavList();
        updateTranslationProjectSelect();
        updateMiscProjectSelect();
        renderCoverImages([]);
    }

    function setActiveManuscript(data) {
        if (!data) {
            clearActiveManuscript();
            return;
        }
        window.manuscriptData = data;
        if (!window.manuscriptData.analysis) window.manuscriptData.analysis = {};
        localStorage.setItem('skriptlab_manuscript', JSON.stringify(window.manuscriptData));
        if (data.id) localStorage.setItem(ACTIVE_PROJECT_ID_KEY, String(data.id));
        window.updateDynamicTexts();
        biographyState = normalizeBiographyState(window.manuscriptData.analysis?.biography || {});
        renderBiography();
        renderAnalysisSummary(window.manuscriptData.analysis);
        renderBookOverview();
        renderWritingView();
        if (window.renderNavList) window.renderNavList();
        updateMiscProjectSelect();
        loadMiscAssetsForActiveProject(true);
        if (currentViewId === 'view-kuvitus') loadCoverImages();
    }

    function emptyProjectMessage() {
        return `<div style="color:var(--text-secondary); font-size:14px; padding:20px;">
            Ohjelmistossa ei ole vielä aktiivisia käsikirjoitushankkeita ladattuna.<br>
            Luo <strong>tyhjä dokumentti</strong> tai käytä <strong>Lataa Käsikirjoitus</strong> -painiketta aloittaaksesi uuden hankkeen editoinnin.
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

    async function saveProjectCardMetadata(data, titleInput, authorInput, statusEl) {
        if (!data?.id) return;
        const nextTitle = (titleInput?.value || '').trim() || 'Nimetön';
        const nextAuthor = (authorInput?.value || '').trim() || 'Tuntematon';
        if (statusEl) statusEl.textContent = 'Tallennetaan nimeä...';
        try {
            const res = await apiFetch(`/api/projects/${data.id}/metadata`, {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ title: nextTitle, author: nextAuthor })
            });
            const saved = await res.json().catch(() => null);
            if (!res.ok) throw new Error(saved?.detail || 'Nimen tallennus epäonnistui.');
            const metadata = {
                id: data.id,
                title: saved?.title || nextTitle,
                author: saved?.author || nextAuthor,
                source_filename: saved?.source_filename ?? data.source_filename,
                owner_user_id: saved?.owner_user_id ?? data.owner_user_id,
                owner_email: saved?.owner_email ?? data.owner_email,
                owner_display_name: saved?.owner_display_name ?? data.owner_display_name,
                access_level: saved?.access_level ?? data.access_level,
                shared_with: saved?.shared_with ?? data.shared_with
            };
            Object.assign(data, metadata);
            if (window.manuscriptData && Number(window.manuscriptData.id) === Number(data.id)) {
                window.manuscriptData.title = metadata.title;
                window.manuscriptData.author = metadata.author;
                localStorage.setItem('skriptlab_manuscript', JSON.stringify(window.manuscriptData));
            }
            const projectIndex = availableProjects.findIndex(project => String(project.id) === String(data.id));
            if (projectIndex >= 0) {
                availableProjects[projectIndex] = Object.assign({}, availableProjects[projectIndex], metadata);
            }
            window.updateDynamicTexts();
            renderBookOverview();
            renderWritingView();
            updateTranslationProjectSelect();
            updateMiscProjectSelect();
            if (statusEl) statusEl.textContent = 'Nimi tallennettu.';
        } catch (err) {
            if (statusEl) statusEl.textContent = err.message;
        }
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
            ${editable ? `
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;" onclick="event.stopPropagation();">
                    <button class="save-project-name-btn" style="padding:7px 10px; font-size:12px; border-radius:6px; border:1px solid var(--border-color); background:rgba(255,255,255,0.08); color:var(--text-primary); cursor:pointer;">Tallenna nimi</button>
                    <span class="project-name-status" style="font-size:12px; color:var(--text-secondary);"></span>
                </div>
            ` : ''}
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
        const saveNameBtn = newCard.querySelector('.save-project-name-btn');
        const nameStatus = newCard.querySelector('.project-name-status');
        const deleteBtn = newCard.querySelector('.delete-project-btn');
        const shareBtn = newCard.querySelector('.share-project-btn');
        const shareInput = newCard.querySelector('.share-email-input');
        [titleInput, authorInput].forEach(input => input.addEventListener('click', event => event.stopPropagation()));
        if (editable) {
            titleInput.addEventListener('change', () => {
                data.title = titleInput.value.trim() || 'Nimetön';
                if (window.manuscriptData && window.manuscriptData.id === data.id) window.manuscriptData.title = data.title;
                window.updateDynamicTexts();
                renderBookOverview();
                if (nameStatus) nameStatus.textContent = 'Nimeä ei ole vielä tallennettu.';
            });
            authorInput.addEventListener('change', () => {
                data.author = authorInput.value.trim() || 'Tuntematon';
                if (window.manuscriptData && window.manuscriptData.id === data.id) window.manuscriptData.author = data.author;
                window.updateDynamicTexts();
                renderBookOverview();
                if (nameStatus) nameStatus.textContent = 'Nimeä ei ole vielä tallennettu.';
            });
            if (saveNameBtn) {
                saveNameBtn.addEventListener('click', event => {
                    event.stopPropagation();
                    saveProjectCardMetadata(data, titleInput, authorInput, nameStatus);
                });
            }
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

    function localManuscriptDraft() {
        const saved = localStorage.getItem('skriptlab_manuscript');
        if (!saved) return null;
        try {
            const parsed = JSON.parse(saved);
            return parsed && parsed.id ? parsed : null;
        } catch (err) {
            return null;
        }
    }

    function mergeActiveLocalDraft(projects) {
        const list = projects || [];
        const localDraft = localManuscriptDraft();
        const activeId = localStorage.getItem(ACTIVE_PROJECT_ID_KEY);
        if (!localDraft?._db_sync_pending || !activeId || String(localDraft.id) !== String(activeId)) {
            return list;
        }
        localDraft._needs_db_sync = true;
        const index = list.findIndex(project => String(project.id) === String(localDraft.id));
        if (index >= 0) {
            const merged = list.slice();
            merged[index] = Object.assign({}, merged[index], localDraft);
            return merged;
        }
        return [localDraft, ...list];
    }

    function renderProjectCards(projects) {
        projects = mergeActiveLocalDraft(projects || []);
        availableProjects = projects;
        const gridCards = document.querySelector('#view-kirjani .grid-cards');
        if (!gridCards) return;
        gridCards.innerHTML = '';
        if (!projects || projects.length === 0) {
            updateTranslationProjectSelect();
            updateMiscProjectSelect();
            updateLearningProjectSelect();
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
            if (selected._needs_db_sync) {
                recoverPendingManuscriptSave(window.manuscriptData);
            }
        } else {
            clearActiveManuscript();
        }
        updateTranslationProjectSelect();
        updateMiscProjectSelect();
        updateLearningProjectSelect();
    }

    function recoverPendingManuscriptSave(data) {
        if (!data) return;
        let savePromise;
        if (
            data._pending_save_kind === 'chapter' &&
            Number.isInteger(data._pending_chapter_index) &&
            data.chapters?.[data._pending_chapter_index]
        ) {
            savePromise = window.saveProjectChapterToDB(data, data._pending_chapter_index);
        } else if (data._pending_save_kind === 'structure') {
            savePromise = window.saveProjectStructureToDB(data);
        } else if (data._pending_save_kind === 'replace_chapters') {
            savePromise = window.replaceProjectChaptersInDB(data);
        } else {
            savePromise = window.saveManuscriptToDB(data);
        }
        savePromise.then(saved => {
            if (!saved?.id || !window.manuscriptData || String(saved.id) !== String(window.manuscriptData.id)) return;
            setActiveManuscript(saved);
            updateAvailableProject(saved);
        });
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
        document.querySelectorAll('.translation-tab[data-translation-panel]').forEach(tab => {
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

    function currentMiscProject() {
        const select = document.getElementById('misc-project-select');
        const selectedId = select?.value || window.manuscriptData?.id;
        if (!selectedId) return null;
        if (window.manuscriptData?.id && String(window.manuscriptData.id) === String(selectedId)) {
            return window.manuscriptData;
        }
        return availableProjects.find(project => String(project.id) === String(selectedId)) || null;
    }

    function updateMiscProjectSelect() {
        const select = document.getElementById('misc-project-select');
        const currentText = document.getElementById('misc-current-project');
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
        const project = currentMiscProject();
        if (currentText) {
            currentText.textContent = project
                ? `Käsiteltävä aineisto: ${project.title || 'Nimetön'}`
                : 'Valitse käsikirjoitus ja toiminto.';
        }
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

    async function loadMiscModels() {
        const select = document.getElementById('misc-model-select');
        if (!select) return;
        try {
            const res = await apiFetch('/api/models/text');
            if (!res.ok) throw new Error(await apiErrorMessage(res, 'Mallien lataus epäonnistui.'));
            miscModels = await res.json();
            select.innerHTML = '';
            miscModels.forEach(model => {
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

    function miscToolLabel(value) {
        const labels = {
            title_page: 'Nimiölehti',
            character_index: 'Henkilöhakemisto',
            table_of_contents: 'Sisällysluettelo',
            copyright_page: 'Copysivu',
            bibliography: 'Lähdeluettelo',
            subject_index: 'Asiahakemisto',
            place_index: 'Paikkahakemisto'
        };
        return labels[value] || 'Oheisaineisto';
    }

    function miscRequestPayload() {
        const project = currentMiscProject();
        const payload = {
            project_id: project ? project.id : null,
            tool: document.getElementById('misc-tool-select')?.value || 'character_index',
            model: document.getElementById('misc-model-select')?.value || null,
            instructions: document.getElementById('misc-instructions')?.value || ''
        };
        if (project?.id && window.manuscriptData?.id && String(project.id) === String(window.manuscriptData.id)) {
            payload.title = window.manuscriptData.title || project.title || '';
            payload.author = window.manuscriptData.author || project.author || '';
            payload.chapters = Array.isArray(window.manuscriptData.chapters) ? window.manuscriptData.chapters : [];
        }
        return payload;
    }

    function miscProgressText(seconds) {
        const minutes = Math.floor(seconds / 60);
        const rest = seconds % 60;
        return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
    }

    function startMiscTimer() {
        const timer = document.getElementById('misc-timer');
        window.clearInterval(miscTimerInterval);
        let seconds = 0;
        if (timer) {
            timer.textContent = miscProgressText(seconds);
            timer.classList.remove('hidden');
        }
        miscTimerInterval = window.setInterval(() => {
            seconds++;
            if (timer) timer.textContent = miscProgressText(seconds);
        }, 1000);
    }

    function stopMiscTimer() {
        window.clearInterval(miscTimerInterval);
        miscTimerInterval = null;
        const timer = document.getElementById('misc-timer');
        if (timer) timer.classList.add('hidden');
    }

    async function runMiscTool() {
        const payload = miscRequestPayload();
        const status = document.getElementById('misc-status');
        const output = document.getElementById('misc-output');
        const title = document.getElementById('misc-result-title');
        const button = document.getElementById('misc-run-btn');
        if (!payload.project_id) {
            alert('Valitse ensin käsikirjoitus.');
            return;
        }
        const selectedLabel = miscToolLabel(payload.tool);
        if (button) button.disabled = true;
        if (status) status.textContent = `${selectedLabel} työn alla...`;
        if (title) title.textContent = selectedLabel;
        if (output) output.value = '';
        startMiscTimer();
        try {
            if (window.manuscriptData?.id && String(window.manuscriptData.id) === String(payload.project_id)) {
                if (status) status.textContent = 'Tallennetaan nykyinen toimitettu versio oheisaineistoa varten...';
                const savedProject = await window.saveManuscriptToDB(window.manuscriptData);
                if (savedProject?.id) {
                    window.manuscriptData = savedProject;
                    const projectIndex = availableProjects.findIndex(project => String(project.id) === String(savedProject.id));
                    if (projectIndex >= 0) availableProjects[projectIndex] = savedProject;
                }
            }
            if (status) status.textContent = `${selectedLabel} työn alla...`;
            const res = await apiFetch('/api/misc-tools/run', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Oheisaineiston muodostaminen epäonnistui.');
            latestMiscText = data.result || '';
            if (output) output.value = latestMiscText;
            if (title) title.textContent = data.title || selectedLabel;
            if (status) {
                status.textContent = data.warnings
                    ? `${data.warnings} Lähde: ${data.generated_by}.`
                    : `Valmis. Lähde: ${data.generated_by}.`;
            }
            loadUsage();
        } catch (err) {
            if (status) status.textContent = err.message;
            alert('Oheisaineiston muodostaminen epäonnistui: ' + networkFailureMessage(err));
            loadUsage();
        } finally {
            stopMiscTimer();
            if (button) button.disabled = false;
        }
    }

    async function copyMiscOutput() {
        const output = document.getElementById('misc-output');
        const text = output?.value || latestMiscText;
        if (!text) {
            alert('Ei kopioitavaa tulosta.');
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
            const status = document.getElementById('misc-status');
            if (status) status.textContent = 'Kopioitu leikepöydälle.';
        } catch (err) {
            alert('Kopiointi epäonnistui. Voit valita tekstin ja kopioida sen käsin.');
        }
    }

    function downloadMiscOutput() {
        const output = document.getElementById('misc-output');
        const text = output?.value || latestMiscText;
        if (!text) {
            alert('Ei ladattavaa tulosta.');
            return;
        }
        const project = currentMiscProject();
        const tool = document.getElementById('misc-tool-select')?.value || 'muut-toiminnot';
        const safeTitle = (project?.title || 'kasikirjoitus').toLowerCase().replace(/[^a-z0-9åäö]+/gi, '-').replace(/^-|-$/g, '') || 'kasikirjoitus';
        const blob = new Blob([text], {type: 'text/plain;charset=utf-8'});
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${safeTitle}-${tool}.txt`;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    function renderMiscAssets(items = []) {
        const list = document.getElementById('misc-saved-list');
        const empty = document.getElementById('misc-saved-empty');
        if (!list || !empty) return;
        list.innerHTML = '';
        empty.hidden = items.length > 0;
        items.forEach(item => {
            const included = item.asset_type === 'book_misc_material';
            const text = assetTextContent(item).trim();
            const preview = text.length > 220 ? `${text.slice(0, 220)}...` : text;
            const card = document.createElement('div');
            card.className = 'card glass-panel';
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.gap = '10px';
            card.innerHTML = `
                <div>
                    <strong>${escapeHtml(item.title || 'Oheisaineisto')}</strong>
                    <p class="card-meta" style="margin:6px 0 0;">${included ? 'Näkyy valmiissa kirjassa' : 'Tallessa erillisenä'} · ${new Date(item.created_at).toLocaleDateString('fi-FI')}</p>
                </div>
                <p style="font-size:13px; color:var(--text-secondary); white-space:pre-wrap; max-height:120px; overflow:hidden;">${escapeHtml(preview || 'Ei tekstisisältöä.')}</p>
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:auto;">
                    <button class="btn btn-secondary toggle-misc-asset-btn" type="button" data-asset-id="${item.id}" data-include="${included ? '0' : '1'}">${included ? 'Poista valmiista kirjasta' : 'Näytä valmiissa kirjassa'}</button>
                    <button class="btn btn-secondary btn-danger-soft delete-misc-asset-btn" type="button" data-asset-id="${item.id}">Poista</button>
                </div>
            `;
            list.appendChild(card);
        });
        list.querySelectorAll('.toggle-misc-asset-btn').forEach(button => {
            button.addEventListener('click', () => toggleMiscAssetInBook(button.dataset.assetId, button.dataset.include === '1'));
        });
        list.querySelectorAll('.delete-misc-asset-btn').forEach(button => {
            button.addEventListener('click', () => deleteMiscAsset(button.dataset.assetId));
        });
    }

    async function loadMiscAssetsForActiveProject(useActiveManuscript = false) {
        const project = useActiveManuscript ? window.manuscriptData : (currentMiscProject() || window.manuscriptData);
        if (!project?.id) {
            currentMiscAssets = [];
            renderMiscAssets([]);
            renderBookOverview();
            return [];
        }
        try {
            const res = await apiFetch(`/api/projects/${project.id}/misc-assets`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Oheisaineistojen lataus epäonnistui.');
            if (window.manuscriptData?.id && String(project.id) === String(window.manuscriptData.id)) {
                currentMiscAssets = data || [];
                renderBookOverview();
            }
            renderMiscAssets(data || []);
            return data || [];
        } catch (err) {
            const status = document.getElementById('misc-status');
            if (status) status.textContent = err.message;
            return [];
        }
    }

    async function saveMiscOutput(includeInBook = false) {
        const project = currentMiscProject();
        const output = document.getElementById('misc-output');
        const text = (output?.value || latestMiscText || '').trim();
        if (!project?.id) {
            alert('Valitse ensin käsikirjoitus.');
            return;
        }
        if (!text) {
            alert('Ei tallennettavaa oheisaineistoa.');
            return;
        }
        const status = document.getElementById('misc-status');
        const materialKind = document.getElementById('misc-tool-select')?.value || 'other';
        const title = document.getElementById('misc-result-title')?.textContent || miscToolLabel(materialKind);
        try {
            if (status) status.textContent = 'Tallennetaan oheisaineistoa...';
            const res = await apiFetch(`/api/projects/${project.id}/misc-assets`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    title,
                    content: text,
                    material_kind: materialKind,
                    include_in_book: includeInBook
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Oheisaineiston tallennus epäonnistui.');
            if (status) status.textContent = includeInBook
                ? 'Oheisaineisto tallennettu ja lisätty valmiiseen kirjaan.'
                : 'Oheisaineisto tallennettu.';
            await loadMiscAssetsForActiveProject();
        } catch (err) {
            if (status) status.textContent = err.message;
            alert('Oheisaineiston tallennus epäonnistui: ' + err.message);
        }
    }

    async function toggleMiscAssetInBook(assetId, includeInBook) {
        const project = currentMiscProject();
        if (!project?.id || !assetId) return;
        const status = document.getElementById('misc-status');
        try {
            const res = await apiFetch(`/api/projects/${project.id}/assets/${assetId}`, {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    asset_type: includeInBook ? 'book_misc_material' : 'misc_material'
                })
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.detail || 'Oheisaineiston päivitys epäonnistui.');
            if (status) status.textContent = includeInBook
                ? 'Oheisaineisto näkyy nyt valmiissa kirjassa.'
                : 'Oheisaineisto poistettiin valmiin kirjan näkymästä.';
            await loadMiscAssetsForActiveProject();
        } catch (err) {
            if (status) status.textContent = err.message;
        }
    }

    async function deleteMiscAsset(assetId) {
        const project = currentMiscProject();
        if (!project?.id || !assetId) return;
        if (!confirm('Poistetaanko tallennettu oheisaineisto?')) return;
        const status = document.getElementById('misc-status');
        try {
            const res = await apiFetch(`/api/projects/${project.id}/assets/${assetId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(await apiErrorMessage(res, 'Oheisaineiston poisto epäonnistui.'));
            if (status) status.textContent = 'Oheisaineisto poistettu.';
            await loadMiscAssetsForActiveProject();
        } catch (err) {
            if (status) status.textContent = err.message;
        }
    }

    function defaultBiographyState() {
        return {
            purpose: '',
            style: '',
            target_length: '',
            interpretation_level: '',
            sensitive_handling: '',
            materials: [],
            timeline: '',
            people: '',
            themes: '',
            gaps: '',
            sensitive_topics: '',
            quality_status: '',
            analysis_report: '',
            questions: '',
            answers: '',
            outline: '',
            chapter_title: '',
            chapter_focus: '',
            chapter_plan: '',
            draft: '',
            approval_goal: false,
            approval_timeline: false,
            approval_people: false,
            approval_outline: false,
            approval_sensitive: false,
            approval_final: false,
            approval_notes: '',
            last_generated_action: '',
            last_generated_at: ''
        };
    }

    function normalizeBiographyState(data) {
        const state = Object.assign(defaultBiographyState(), data || {});
        state.materials = Array.isArray(state.materials) ? state.materials : [];
        return state;
    }

    function activeBiographyProjectId() {
        return window.manuscriptData?.id || null;
    }

    function setBiographyStatus(message, isError = false) {
        const status = document.getElementById('bio-status');
        if (!status) return;
        status.textContent = message;
        status.style.color = isError ? '#ffb4b4' : 'var(--text-secondary)';
    }

    function setBiographyDictationStatus(message, isError = false) {
        const status = document.getElementById('bio-dictation-status');
        if (!status) return;
        status.textContent = message;
        status.style.color = isError ? '#ffb4b4' : 'var(--text-secondary)';
    }

    function setBiographyDictationButton(active) {
        const button = document.getElementById('bio-dictation-btn');
        if (!button) return;
        button.textContent = active ? 'Lopeta sanelu' : 'Sanele';
        button.classList.toggle('btn-primary', active);
        button.classList.toggle('btn-secondary', !active);
    }

    function appendDictationText(textarea, text) {
        const cleanText = String(text || '').replace(/\s+/g, ' ').trim();
        if (!textarea || !cleanText) return;
        const start = textarea.selectionStart ?? textarea.value.length;
        const end = textarea.selectionEnd ?? textarea.value.length;
        const before = textarea.value.slice(0, start);
        const after = textarea.value.slice(end);
        const needsSpaceBefore = before && !/[\s\n]$/.test(before);
        const needsSpaceAfter = after && !/^[\s.,!?;:]/.test(after);
        const insert = `${needsSpaceBefore ? ' ' : ''}${cleanText}${needsSpaceAfter ? ' ' : ''}`;
        textarea.value = before + insert + after;
        const cursor = before.length + insert.length;
        textarea.focus();
        textarea.setSelectionRange(cursor, cursor);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function stopBiographyDictation(message = 'Sanelu pysäytetty.') {
        biographyDictationActive = false;
        setBiographyDictationButton(false);
        if (biographyDictationRecognition) {
            try {
                biographyDictationRecognition.stop();
            } catch (err) {
                // Recognition may already be stopped by the browser.
            }
        }
        setBiographyDictationStatus(message);
    }

    function startBiographyDictation() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const textarea = document.getElementById('bio-material-text');
        if (!textarea) return;
        if (!SpeechRecognition) {
            setBiographyDictationStatus('Sanelu ei ole käytettävissä tässä selaimessa.', true);
            return;
        }

        if (biographyDictationRecognition) {
            try {
                biographyDictationRecognition.abort();
            } catch (err) {
                // Safe to ignore; a new recognition instance is created below.
            }
        }

        const language = document.getElementById('bio-dictation-lang')?.value || 'fi-FI';
        const recognition = new SpeechRecognition();
        biographyDictationRecognition = recognition;
        biographyDictationActive = true;
        recognition.lang = language;
        recognition.continuous = true;
        recognition.interimResults = true;
        setBiographyDictationButton(true);
        setBiographyDictationStatus('Kuuntelen...');

        recognition.onresult = event => {
            let finalTranscript = '';
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0]?.transcript || '';
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }
            if (finalTranscript) {
                appendDictationText(textarea, finalTranscript);
                setBiographyDictationStatus('Sanelu lisätty tekstikenttään.');
            } else if (interimTranscript) {
                setBiographyDictationStatus(`Kuuntelen: ${interimTranscript.trim()}`);
            }
        };

        recognition.onerror = event => {
            const message = event.error === 'not-allowed'
                ? 'Mikrofonin käyttöä ei sallittu.'
                : 'Sanelu keskeytyi. Kokeile uudelleen.';
            stopBiographyDictation(message);
            setBiographyDictationStatus(message, true);
        };

        recognition.onend = () => {
            if (!biographyDictationActive) return;
            biographyDictationActive = false;
            setBiographyDictationButton(false);
            setBiographyDictationStatus('Sanelu pysähtyi.');
        };

        try {
            recognition.start();
        } catch (err) {
            stopBiographyDictation('Sanelua ei saatu käynnistettyä.');
            setBiographyDictationStatus('Sanelua ei saatu käynnistettyä.', true);
        }
    }

    function toggleBiographyDictation() {
        if (biographyDictationActive) {
            stopBiographyDictation();
        } else {
            startBiographyDictation();
        }
    }

    function setSelectValue(selectId, value) {
        const select = document.getElementById(selectId);
        if (!select) return;
        const cleanValue = value || '';
        const hasOption = Array.from(select.options).some(option => option.value === cleanValue || option.textContent === cleanValue);
        if (cleanValue && !hasOption) {
            const option = document.createElement('option');
            option.value = cleanValue;
            option.textContent = cleanValue;
            select.appendChild(option);
        }
        select.value = cleanValue;
    }

    function inputValue(id, value = '') {
        const el = document.getElementById(id);
        if (el) el.value = value || '';
    }

    function checkboxValue(id, value = false) {
        const el = document.getElementById(id);
        if (el) el.checked = Boolean(value);
    }

    const learningMaterialTypes = {
        learner_text: 'Oppijan teksti',
        tasks: 'Tehtävät',
        teacher_guide: 'Opettajan ohje',
        assessment: 'Arviointitehtävä tai koeaihio'
    };

    function defaultLearningMaterials() {
        return Object.fromEntries(Object.entries(learningMaterialTypes).map(([key, label]) => [key, {
            title: label,
            content: '',
            targets: [],
            concepts: '',
            level: '',
            status: 'luonnos'
        }]));
    }

    function defaultLearningMaterialState() {
        return {
            project: {
                subject: '',
                grade: '',
                title: '',
                weekly_hours: '',
                duration_weeks: '',
                source_material: '',
                target_group: '',
                difficulty: 'normaali',
                language: 'suomi',
                special_needs: ''
            },
            ops_targets: [],
            brief: {
                period_length: '',
                hours_total: '',
                concepts: '',
                source_summary: '',
                task_types: '',
                material_formats: '',
                assessment_method: '',
                teacher_priorities: ''
            },
            outline: '',
            materials: defaultLearningMaterials(),
            validation: '',
            statuses: {
                project: 'luonnos',
                ops: 'luonnos',
                brief: 'luonnos',
                outline: 'luonnos',
                materials: 'luonnos',
                validation: 'luonnos',
                export: 'luonnos'
            }
        };
    }

    function normalizeLearningMaterialState(data) {
        const state = defaultLearningMaterialState();
        const incoming = data || {};
        if (incoming.project && typeof incoming.project === 'object') Object.assign(state.project, incoming.project);
        if (incoming.brief && typeof incoming.brief === 'object') Object.assign(state.brief, incoming.brief);
        if (incoming.statuses && typeof incoming.statuses === 'object') Object.assign(state.statuses, incoming.statuses);
        state.ops_targets = Array.isArray(incoming.ops_targets) ? incoming.ops_targets : [];
        state.outline = incoming.outline || '';
        state.validation = incoming.validation || '';
        if (incoming.materials && typeof incoming.materials === 'object') {
            Object.entries(learningMaterialTypes).forEach(([key, label]) => {
                const item = incoming.materials[key] || {};
                state.materials[key] = {
                    title: item.title || label,
                    content: item.content || '',
                    targets: Array.isArray(item.targets) ? item.targets : [],
                    concepts: item.concepts || '',
                    level: item.level || '',
                    status: item.status || 'luonnos'
                };
            });
        }
        return state;
    }

    function isLearningMaterialProject(project) {
        return project && project.analysis && project.analysis.project_kind === 'learning_material';
    }

    function learningMaterialProjects() {
        return (availableProjects || []).filter(isLearningMaterialProject);
    }

    function activeLearningProject() {
        const select = document.getElementById('om-project-select');
        const selectedId = select?.value || (isLearningMaterialProject(window.manuscriptData) ? window.manuscriptData.id : null);
        if (!selectedId) return null;
        return learningMaterialProjects().find(project => String(project.id) === String(selectedId)) || null;
    }

    function activeLearningProjectId() {
        return activeLearningProject()?.id || null;
    }

    function setLearningMaterialStatus(message, isError = false) {
        const status = document.getElementById('om-status');
        if (!status) return;
        status.textContent = message;
        status.style.color = isError ? '#ffb4b4' : 'var(--text-secondary)';
    }

    function updateLearningProjectSelect() {
        const select = document.getElementById('om-project-select');
        if (!select) return;
        const projects = learningMaterialProjects();
        const previous = select.value || (isLearningMaterialProject(window.manuscriptData) ? String(window.manuscriptData.id) : '');
        select.innerHTML = projects.length
            ? projects.map(project => `<option value="${project.id}">${escapeHtml(project.title || 'Nimetön oppimateriaali')}</option>`).join('')
            : '<option value="">Ei oppimateriaaliprojekteja</option>';
        if (previous && projects.some(project => String(project.id) === previous)) {
            select.value = previous;
        } else if (projects[0]) {
            select.value = String(projects[0].id);
        }
        const selected = activeLearningProject();
        if (selected && (learningMaterialViews.has(currentViewId) || (currentUser && currentUser.role === 'oppimateriaali'))) {
            setActiveManuscript(selected);
            localStorage.setItem(ACTIVE_PROJECT_ID_KEY, String(selected.id));
        }
    }

    function collectLearningProjectFields(state = normalizeLearningMaterialState(learningMaterialState)) {
        state.project.subject = document.getElementById('om-subject')?.value || state.project.subject || '';
        state.project.grade = document.getElementById('om-grade')?.value || state.project.grade || '';
        state.project.title = document.getElementById('om-title')?.value || state.project.title || '';
        state.project.weekly_hours = document.getElementById('om-weekly-hours')?.value || state.project.weekly_hours || '';
        state.project.duration_weeks = document.getElementById('om-duration-weeks')?.value || state.project.duration_weeks || '';
        state.project.source_material = document.getElementById('om-source-material')?.value || state.project.source_material || '';
        state.project.target_group = document.getElementById('om-target-group')?.value || state.project.target_group || '';
        state.project.difficulty = document.getElementById('om-difficulty')?.value || state.project.difficulty || 'normaali';
        state.project.language = document.getElementById('om-language')?.value || state.project.language || 'suomi';
        state.project.special_needs = document.getElementById('om-special-needs')?.value || state.project.special_needs || '';
        return state;
    }

    function collectLearningBriefFields(state = normalizeLearningMaterialState(learningMaterialState)) {
        state.brief.period_length = document.getElementById('om-period-length')?.value || state.brief.period_length || '';
        state.brief.hours_total = document.getElementById('om-hours-total')?.value || state.brief.hours_total || '';
        state.brief.concepts = document.getElementById('om-concepts')?.value || state.brief.concepts || '';
        state.brief.source_summary = document.getElementById('om-source-summary')?.value || state.brief.source_summary || '';
        state.brief.task_types = document.getElementById('om-task-types')?.value || state.brief.task_types || '';
        state.brief.material_formats = document.getElementById('om-material-formats')?.value || state.brief.material_formats || '';
        state.brief.assessment_method = document.getElementById('om-assessment-method')?.value || state.brief.assessment_method || '';
        state.brief.teacher_priorities = document.getElementById('om-teacher-priorities')?.value || state.brief.teacher_priorities || '';
        return state;
    }

    function saveCurrentLearningMaterialEditor() {
        const select = document.getElementById('om-material-type');
        const key = select?.dataset.previous || select?.value;
        if (!key || !learningMaterialTypes[key]) return;
        learningMaterialState = normalizeLearningMaterialState(learningMaterialState);
        learningMaterialState.materials[key].content = document.getElementById('om-material-content')?.value || learningMaterialState.materials[key].content || '';
        learningMaterialState.materials[key].targets = (document.getElementById('om-material-targets')?.value || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);
        learningMaterialState.materials[key].concepts = document.getElementById('om-material-concepts')?.value || '';
        learningMaterialState.materials[key].level = document.getElementById('om-material-level')?.value || '';
        learningMaterialState.materials[key].status = document.getElementById('om-material-status')?.value || 'luonnos';
    }

    function collectLearningMaterialForm() {
        learningMaterialState = normalizeLearningMaterialState(learningMaterialState);
        collectLearningProjectFields(learningMaterialState);
        collectLearningBriefFields(learningMaterialState);
        const outline = document.getElementById('om-outline');
        if (outline) learningMaterialState.outline = outline.value || '';
        saveCurrentLearningMaterialEditor();
        const validation = document.getElementById('om-validation');
        if (validation) learningMaterialState.validation = validation.value || '';
        return learningMaterialState;
    }

    function renderLearningProjectFields() {
        const project = learningMaterialState.project || {};
        inputValue('om-subject', project.subject);
        inputValue('om-grade', project.grade);
        inputValue('om-title', project.title);
        inputValue('om-weekly-hours', project.weekly_hours);
        inputValue('om-duration-weeks', project.duration_weeks);
        inputValue('om-source-material', project.source_material);
        inputValue('om-target-group', project.target_group);
        setSelectValue('om-difficulty', project.difficulty || 'normaali');
        inputValue('om-language', project.language || 'suomi');
        inputValue('om-special-needs', project.special_needs);
    }

    function renderLearningTargets() {
        const list = document.getElementById('om-target-list');
        if (!list) return;
        const targets = Array.isArray(learningMaterialState.ops_targets) ? learningMaterialState.ops_targets : [];
        if (!targets.length) {
            list.innerHTML = '<div style="color:var(--text-secondary); font-size:13px;">Ei vielä OPS-tavoitteita.</div>';
            return;
        }
        list.innerHTML = targets.map((target, index) => `
            <div class="om-list-item">
                <div style="display:flex; justify-content:space-between; gap:12px; align-items:start;">
                    <div>
                        <h4>${escapeHtml(target.id || `T${index + 1}`)} · ${escapeHtml(target.content_area || 'Sisältöalue puuttuu')}</h4>
                        <p>${escapeHtml(target.text || '')}</p>
                        <p>Arviointi: ${escapeHtml(target.assessment_note || '-')}</p>
                        <p>Painoarvo: ${escapeHtml(target.weight || 'normaali')}</p>
                    </div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
                        <button class="btn btn-secondary om-edit-target-btn" data-index="${index}" type="button" style="font-size:11px; padding:4px 8px;">Muokkaa</button>
                        <button class="btn btn-secondary btn-danger-soft om-delete-target-btn" data-index="${index}" type="button" style="font-size:11px; padding:4px 8px;">Poista</button>
                    </div>
                </div>
            </div>
        `).join('');
        list.querySelectorAll('.om-edit-target-btn').forEach(button => {
            button.addEventListener('click', () => {
                const target = learningMaterialState.ops_targets[Number(button.dataset.index)];
                if (!target) return;
                editingLearningTargetIndex = Number(button.dataset.index);
                inputValue('om-target-id', target.id);
                inputValue('om-target-text', target.text);
                inputValue('om-target-content-area', target.content_area);
                inputValue('om-target-assessment-note', target.assessment_note);
                setSelectValue('om-target-weight', target.weight || 'normaali');
            });
        });
        list.querySelectorAll('.om-delete-target-btn').forEach(button => {
            button.addEventListener('click', () => {
                learningMaterialState.ops_targets.splice(Number(button.dataset.index), 1);
                renderLearningTargets();
                saveLearningMaterialState(false);
            });
        });
    }

    function renderLearningBrief() {
        const brief = learningMaterialState.brief || {};
        inputValue('om-period-length', brief.period_length);
        inputValue('om-hours-total', brief.hours_total);
        inputValue('om-concepts', brief.concepts);
        inputValue('om-source-summary', brief.source_summary);
        inputValue('om-task-types', brief.task_types);
        inputValue('om-material-formats', brief.material_formats);
        inputValue('om-assessment-method', brief.assessment_method);
        inputValue('om-teacher-priorities', brief.teacher_priorities);
        const summary = document.getElementById('om-brief-summary');
        if (summary) {
            const project = learningMaterialState.project || {};
            summary.textContent = [
                `Jakso: ${project.title || '-'}`,
                `Oppiaine ja vuosiluokka: ${project.subject || '-'} ${project.grade || ''}`.trim(),
                `Tuntimäärä: ${brief.hours_total || project.weekly_hours || '-'} / kesto: ${brief.period_length || project.duration_weeks || '-'}`,
                `Kohderyhmä: ${project.target_group || '-'}`,
                `Vaikeustaso: ${project.difficulty || '-'}`,
                `Käsitteet: ${brief.concepts || '-'}`,
                `Tehtävätyypit: ${brief.task_types || '-'}`,
                `Materiaalimuodot: ${brief.material_formats || '-'}`,
                `Arviointitapa: ${brief.assessment_method || '-'}`,
                `Erityistarpeet: ${project.special_needs || '-'}`
            ].join('\n');
        }
    }

    function renderSelectedLearningMaterial() {
        const select = document.getElementById('om-material-type');
        if (!select) return;
        const key = select.value || 'learner_text';
        const item = learningMaterialState.materials?.[key] || defaultLearningMaterials()[key];
        const title = document.getElementById('om-material-editor-title');
        if (title) title.textContent = item.title || learningMaterialTypes[key];
        inputValue('om-material-targets', (item.targets || []).join(', '));
        inputValue('om-material-concepts', item.concepts);
        inputValue('om-material-level', item.level);
        setSelectValue('om-material-status', item.status || 'luonnos');
        inputValue('om-material-content', item.content);
        select.dataset.previous = key;
    }

    function renderLearningOverview() {
        const container = document.getElementById('om-overview');
        if (!container) return;
        const state = normalizeLearningMaterialState(learningMaterialState);
        const materialReadyCount = Object.values(state.materials).filter(item => (item.content || '').trim()).length;
        const cards = [
            ['project', 'Projektin perustiedot', state.project.title ? 'Täytetty' : 'Puuttuu jakson nimi'],
            ['ops', 'OPS-tavoitteet', `${state.ops_targets.length} tavoitetta`],
            ['brief', 'Opetusbrief', state.brief.concepts ? 'Käsitteet lisätty' : 'Käsitteet puuttuvat'],
            ['outline', 'Emomateriaali', state.outline ? 'Runko olemassa' : 'Runko puuttuu'],
            ['materials', 'Materiaalit', `${materialReadyCount}/4 osaa luotu`],
            ['validation', 'Validointi', state.validation ? 'Validointiraportti olemassa' : 'Validointi puuttuu'],
            ['export', 'Katselu ja tulostus', 'Kooste päivittyy projektin tiedoista']
        ];
        container.innerHTML = cards.map(([key, title, note]) => `
            <div class="card glass-panel">
                <h3>${escapeHtml(title)}</h3>
                <p style="color:var(--text-secondary); font-size:13px; line-height:1.5; min-height:38px;">${escapeHtml(note)}</p>
                <select class="om-status-select" data-status-key="${key}">
                    <option value="luonnos" ${state.statuses[key] === 'luonnos' ? 'selected' : ''}>Luonnos</option>
                    <option value="tarkistettava" ${state.statuses[key] === 'tarkistettava' ? 'selected' : ''}>Tarkistettava</option>
                    <option value="valmis" ${state.statuses[key] === 'valmis' ? 'selected' : ''}>Valmis</option>
                </select>
            </div>
        `).join('');
        container.querySelectorAll('.om-status-select').forEach(select => {
            select.addEventListener('change', () => {
                learningMaterialState.statuses[select.dataset.statusKey] = select.value;
            });
        });
    }

    function learningMaterialExportText() {
        const state = normalizeLearningMaterialState(learningMaterialState);
        const project = state.project;
        const brief = state.brief;
        const targetLines = state.ops_targets.map(target => `${target.id}: ${target.text}\nSisältöalue: ${target.content_area || '-'}\nArviointi: ${target.assessment_note || '-'}\nPainoarvo: ${target.weight || 'normaali'}`).join('\n\n') || 'Ei tavoitteita.';
        const materialLines = Object.entries(learningMaterialTypes).map(([key, label]) => {
            const item = state.materials[key] || {};
            return `${label}\nTavoitteet: ${(item.targets || []).join(', ') || '-'}\nKäsitteet: ${item.concepts || '-'}\nTaso: ${item.level || '-'}\nStatus: ${item.status || 'luonnos'}\n\n${item.content || 'Ei sisältöä.'}`;
        }).join('\n\n---\n\n');
        return `${project.title || 'Oppimateriaaliprojekti'}

Oppiaine: ${project.subject || '-'}
Vuosiluokka: ${project.grade || '-'}
Kesto: ${project.duration_weeks || '-'} viikkoa
Viikkotunnit: ${project.weekly_hours || '-'}
Kohderyhmä: ${project.target_group || '-'}
Vaikeustaso: ${project.difficulty || '-'}
Kieli: ${project.language || '-'}
Erityistarpeet: ${project.special_needs || '-'}

OPS-TAVOITEMATRIISI
${targetLines}

OPETUSBRIEF
Jakson pituus: ${brief.period_length || '-'}
Tuntimäärä: ${brief.hours_total || '-'}
Käsitteet: ${brief.concepts || '-'}
Tehtävätyypit: ${brief.task_types || '-'}
Materiaalimuodot: ${brief.material_formats || '-'}
Arviointitapa: ${brief.assessment_method || '-'}
Opettajan painotukset: ${brief.teacher_priorities || '-'}

RUNKO
${state.outline || 'Ei runkoa.'}

MATERIAALIT
${materialLines}

VALIDOINTI
${state.validation || 'Ei validointia.'}`;
    }

    function renderLearningExport() {
        const preview = document.getElementById('om-export-preview');
        if (preview) preview.textContent = learningMaterialExportText();
    }

    function renderLearningMaterial() {
        learningMaterialState = normalizeLearningMaterialState(learningMaterialState);
        const selected = activeLearningProject();
        const topName = document.getElementById('top-book-name');
        if (topName && learningMaterialViews.has(currentViewId)) {
            topName.textContent = selected ? `Oppimateriaali: ${selected.title}` : 'Oppimateriaali: Valitse projekti...';
        }
        const sidebarTitle = document.getElementById('sidebar-current-title');
        const sidebarStyle = document.getElementById('sidebar-style');
        const sidebarVocab = document.getElementById('sidebar-vocab');
        if (currentUser && currentUser.role === 'oppimateriaali') {
            if (sidebarTitle) sidebarTitle.textContent = selected?.title || 'Ei oppimateriaaliprojektia';
            if (sidebarStyle) sidebarStyle.textContent = `${learningMaterialState.ops_targets.length || 0} OPS-tavoitetta`;
            if (sidebarVocab) sidebarVocab.textContent = learningMaterialState.statuses?.materials || 'luonnos';
        }
        const labels = [
            'om-current-project',
            'om-ops-project',
            'om-brief-project',
            'om-outline-project',
            'om-materials-project',
            'om-validation-project',
            'om-overview-project',
            'om-export-project'
        ];
        labels.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = selected ? `Oppimateriaaliprojekti: ${selected.title}` : 'Valitse tai luo oppimateriaaliprojekti.';
        });
        renderLearningProjectFields();
        renderLearningTargets();
        renderLearningBrief();
        inputValue('om-outline', learningMaterialState.outline);
        renderSelectedLearningMaterial();
        inputValue('om-validation', learningMaterialState.validation);
        renderLearningOverview();
        renderLearningExport();
    }

    async function loadLearningMaterialState(showFeedback = true) {
        updateLearningProjectSelect();
        const projectId = activeLearningProjectId();
        if (!projectId) {
            learningMaterialState = defaultLearningMaterialState();
            renderLearningMaterial();
            if (showFeedback) setLearningMaterialStatus('Luo ensin oppimateriaaliprojekti.', true);
            return null;
        }
        try {
            if (showFeedback) setLearningMaterialStatus('Ladataan oppimateriaalitietoja...');
            const res = await apiFetch(`/api/projects/${projectId}/learning-material`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Oppimateriaalitietojen lataus epäonnistui.');
            learningMaterialState = normalizeLearningMaterialState(data.data);
            if (window.manuscriptData) {
                if (!window.manuscriptData.analysis) window.manuscriptData.analysis = {};
                window.manuscriptData.analysis.project_kind = 'learning_material';
                window.manuscriptData.analysis.learning_material = learningMaterialState;
            }
            renderLearningMaterial();
            if (showFeedback) setLearningMaterialStatus('Oppimateriaalitiedot ladattu.');
            return learningMaterialState;
        } catch (err) {
            setLearningMaterialStatus(networkFailureMessage(err), true);
            return null;
        }
    }

    async function saveLearningMaterialState(showFeedback = true) {
        const projectId = activeLearningProjectId();
        if (!projectId) {
            if (showFeedback) setLearningMaterialStatus('Luo tai valitse oppimateriaaliprojekti ensin.', true);
            return null;
        }
        collectLearningMaterialForm();
        try {
            if (showFeedback) setLearningMaterialStatus('Tallennetaan oppimateriaalitietoja...');
            const res = await apiFetch(`/api/projects/${projectId}/learning-material`, {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ data: learningMaterialState })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Oppimateriaalitietojen tallennus epäonnistui.');
            learningMaterialState = normalizeLearningMaterialState(data.data);
            if (window.manuscriptData) {
                window.manuscriptData.title = learningMaterialState.project.title || window.manuscriptData.title;
                window.manuscriptData.author = learningMaterialState.project.subject || window.manuscriptData.author;
                if (!window.manuscriptData.analysis) window.manuscriptData.analysis = {};
                window.manuscriptData.analysis.project_kind = 'learning_material';
                window.manuscriptData.analysis.learning_material = learningMaterialState;
            }
            renderLearningMaterial();
            if (showFeedback) setLearningMaterialStatus('Oppimateriaalitiedot tallennettu.');
            await loadProjects();
            renderLearningMaterial();
            return learningMaterialState;
        } catch (err) {
            setLearningMaterialStatus(networkFailureMessage(err), true);
            return null;
        }
    }

    async function createLearningMaterialProject() {
        const state = collectLearningProjectFields(defaultLearningMaterialState());
        if (!state.project.title.trim()) {
            setLearningMaterialStatus('Anna jakson nimi ennen projektin luontia.', true);
            return;
        }
        try {
            setLearningMaterialStatus('Luodaan oppimateriaaliprojektia...');
            const res = await apiFetch('/api/learning-material/projects', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(state.project)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Oppimateriaaliprojektin luonti epäonnistui.');
            setActiveManuscript(data);
            localStorage.setItem(ACTIVE_PROJECT_ID_KEY, String(data.id));
            learningMaterialState = normalizeLearningMaterialState(data.analysis?.learning_material || state);
            await loadProjects();
            updateLearningProjectSelect();
            renderLearningMaterial();
            setLearningMaterialStatus('Oppimateriaaliprojekti luotu.');
        } catch (err) {
            setLearningMaterialStatus(networkFailureMessage(err), true);
        }
    }

    function addOrUpdateLearningTarget() {
        learningMaterialState = collectLearningMaterialForm();
        const target = {
            id: document.getElementById('om-target-id')?.value.trim() || `T${learningMaterialState.ops_targets.length + 1}`,
            text: document.getElementById('om-target-text')?.value.trim() || '',
            content_area: document.getElementById('om-target-content-area')?.value.trim() || '',
            assessment_note: document.getElementById('om-target-assessment-note')?.value.trim() || '',
            weight: document.getElementById('om-target-weight')?.value || 'normaali'
        };
        if (!target.text) {
            setLearningMaterialStatus('Tavoiteteksti puuttuu.', true);
            return;
        }
        if (editingLearningTargetIndex !== null && learningMaterialState.ops_targets[editingLearningTargetIndex]) {
            learningMaterialState.ops_targets[editingLearningTargetIndex] = target;
            editingLearningTargetIndex = null;
        } else {
            learningMaterialState.ops_targets.push(target);
        }
        inputValue('om-target-id', '');
        inputValue('om-target-text', '');
        inputValue('om-target-content-area', '');
        inputValue('om-target-assessment-note', '');
        setSelectValue('om-target-weight', 'normaali');
        renderLearningTargets();
        saveLearningMaterialState(false);
    }

    function startLearningMaterialTimer() {
        window.clearInterval(learningMaterialTimerInterval);
        let seconds = 0;
        setLearningMaterialStatus('Käsitellään oppimateriaalia... 0:00');
        learningMaterialTimerInterval = window.setInterval(() => {
            seconds++;
            const minutes = Math.floor(seconds / 60);
            const rest = seconds % 60;
            setLearningMaterialStatus(`Käsitellään oppimateriaalia... ${minutes}:${rest < 10 ? '0' : ''}${rest}`);
        }, 1000);
    }

    function stopLearningMaterialTimer() {
        window.clearInterval(learningMaterialTimerInterval);
        learningMaterialTimerInterval = null;
    }

    async function runLearningMaterialAction(action, payload = {}) {
        const projectId = activeLearningProjectId();
        if (!projectId) {
            setLearningMaterialStatus('Luo tai valitse oppimateriaaliprojekti ensin.', true);
            return;
        }
        collectLearningMaterialForm();
        startLearningMaterialTimer();
        try {
            const res = await apiFetch(`/api/projects/${projectId}/learning-material/run`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ action, data: learningMaterialState, payload })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Oppimateriaalitoiminto epäonnistui.');
            learningMaterialState = normalizeLearningMaterialState(data.data);
            renderLearningMaterial();
            setLearningMaterialStatus(data.warnings ? data.warnings : `${data.title || 'Toiminto'} valmis. Lähde: ${data.generated_by}.`);
            loadUsage();
        } catch (err) {
            setLearningMaterialStatus(networkFailureMessage(err), true);
            loadUsage();
        } finally {
            stopLearningMaterialTimer();
        }
    }

    function saveLearningStatuses() {
        document.querySelectorAll('.om-status-select').forEach(select => {
            learningMaterialState.statuses[select.dataset.statusKey] = select.value;
        });
        saveLearningMaterialState(true);
    }

    function downloadLearningMaterialText() {
        const text = learningMaterialExportText();
        const title = (learningMaterialState.project?.title || 'oppimateriaali').toLowerCase().replace(/[^a-z0-9åäö]+/gi, '-').replace(/^-|-$/g, '') || 'oppimateriaali';
        const blob = new Blob([text], {type: 'text/plain;charset=utf-8'});
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${title}.txt`;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    function collectBiographyForm() {
        const state = normalizeBiographyState(biographyState);
        state.purpose = document.getElementById('bio-purpose')?.value || '';
        state.style = document.getElementById('bio-style')?.value || '';
        state.target_length = document.getElementById('bio-target-length')?.value || '';
        state.interpretation_level = document.getElementById('bio-interpretation')?.value || '';
        state.sensitive_handling = document.getElementById('bio-sensitive-handling')?.value || '';
        state.timeline = document.getElementById('bio-timeline')?.value || '';
        state.people = document.getElementById('bio-people')?.value || '';
        state.themes = document.getElementById('bio-themes')?.value || '';
        state.gaps = document.getElementById('bio-gaps')?.value || '';
        state.sensitive_topics = document.getElementById('bio-sensitive-topics')?.value || '';
        state.questions = document.getElementById('bio-questions')?.value || '';
        state.answers = document.getElementById('bio-answers')?.value || '';
        state.outline = document.getElementById('bio-outline')?.value || '';
        state.chapter_title = document.getElementById('bio-chapter-title')?.value || '';
        state.chapter_focus = document.getElementById('bio-chapter-focus')?.value || '';
        state.chapter_plan = document.getElementById('bio-chapter-plan')?.value || '';
        state.draft = document.getElementById('bio-draft')?.value || '';
        state.approval_goal = Boolean(document.getElementById('bio-approval-goal')?.checked);
        state.approval_timeline = Boolean(document.getElementById('bio-approval-timeline')?.checked);
        state.approval_people = Boolean(document.getElementById('bio-approval-people')?.checked);
        state.approval_outline = Boolean(document.getElementById('bio-approval-outline')?.checked);
        state.approval_sensitive = Boolean(document.getElementById('bio-approval-sensitive')?.checked);
        state.approval_final = Boolean(document.getElementById('bio-approval-final')?.checked);
        state.approval_notes = document.getElementById('bio-approval-notes')?.value || '';
        return state;
    }

    function renderBiographyMaterials() {
        const list = document.getElementById('bio-materials-list');
        if (!list) return;
        const materials = Array.isArray(biographyState.materials) ? biographyState.materials : [];
        if (!materials.length) {
            list.innerHTML = '<div style="color:var(--text-secondary); font-size:13px;">Ei vielä kerättyä elämäkerta-aineistoa.</div>';
            return;
        }
        list.innerHTML = materials.map((item, index) => `
            <div style="padding:12px; border:1px solid var(--border-color); border-radius:8px; background:rgba(255,255,255,0.04);">
                <div style="display:flex; justify-content:space-between; gap:10px; align-items:start;">
                    <div>
                        <strong>${escapeHtml(item.title || `Aineisto ${index + 1}`)}</strong>
                        <div style="color:var(--text-secondary); font-size:12px; margin-top:2px;">${escapeHtml(item.kind || 'free_text')}</div>
                    </div>
                    <button class="btn btn-secondary bio-remove-material-btn" data-material-index="${index}" style="font-size:11px; padding:4px 8px;">Poista</button>
                </div>
                <p style="color:var(--text-secondary); font-size:13px; line-height:1.5; margin-top:8px;">${escapeHtml(truncateText(item.text || '', 260))}</p>
            </div>
        `).join('');
        list.querySelectorAll('.bio-remove-material-btn').forEach(button => {
            button.addEventListener('click', () => {
                const index = Number(button.dataset.materialIndex);
                biographyState.materials.splice(index, 1);
                renderBiography();
            });
        });
    }

    function renderBiography() {
        biographyState = normalizeBiographyState(biographyState);
        const currentText = document.getElementById('bio-current-project');
        if (currentText) {
            currentText.textContent = window.manuscriptData
                ? `Elämäkertaprojekti: ${window.manuscriptData.title || 'Nimetön'}`
                : 'Valitse käsikirjoitus tai elämäkertaprojekti.';
        }
        setSelectValue('bio-purpose', biographyState.purpose);
        setSelectValue('bio-style', biographyState.style);
        setSelectValue('bio-target-length', biographyState.target_length);
        setSelectValue('bio-interpretation', biographyState.interpretation_level);
        setSelectValue('bio-sensitive-handling', biographyState.sensitive_handling);
        inputValue('bio-timeline', biographyState.timeline);
        inputValue('bio-people', biographyState.people);
        inputValue('bio-themes', biographyState.themes);
        inputValue('bio-gaps', biographyState.gaps);
        inputValue('bio-sensitive-topics', biographyState.sensitive_topics);
        inputValue('bio-questions', biographyState.questions);
        inputValue('bio-answers', biographyState.answers);
        inputValue('bio-outline', biographyState.outline);
        inputValue('bio-chapter-title', biographyState.chapter_title);
        inputValue('bio-chapter-focus', biographyState.chapter_focus);
        inputValue('bio-chapter-plan', biographyState.chapter_plan);
        inputValue('bio-draft', biographyState.draft);
        checkboxValue('bio-approval-goal', biographyState.approval_goal);
        checkboxValue('bio-approval-timeline', biographyState.approval_timeline);
        checkboxValue('bio-approval-people', biographyState.approval_people);
        checkboxValue('bio-approval-outline', biographyState.approval_outline);
        checkboxValue('bio-approval-sensitive', biographyState.approval_sensitive);
        checkboxValue('bio-approval-final', biographyState.approval_final);
        inputValue('bio-approval-notes', biographyState.approval_notes);
        renderBiographyMaterials();
    }

    function showBiographyPanel(panelId) {
        document.querySelectorAll('.biography-panel').forEach(panel => {
            panel.classList.toggle('hidden', panel.id !== panelId);
        });
        document.querySelectorAll('.biography-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.bioPanel === panelId);
        });
    }

    function startBiographyTimer() {
        const timer = document.getElementById('bio-timer');
        window.clearInterval(biographyTimerInterval);
        let seconds = 0;
        if (timer) {
            timer.textContent = '0:00';
            timer.classList.remove('hidden');
        }
        biographyTimerInterval = window.setInterval(() => {
            seconds++;
            const minutes = Math.floor(seconds / 60);
            const rest = seconds % 60;
            if (timer) timer.textContent = `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
        }, 1000);
    }

    function stopBiographyTimer() {
        window.clearInterval(biographyTimerInterval);
        biographyTimerInterval = null;
        const timer = document.getElementById('bio-timer');
        if (timer) timer.classList.add('hidden');
    }

    async function loadBiographyState(showFeedback = true) {
        if (!activeBiographyProjectId()) {
            biographyState = defaultBiographyState();
            renderBiography();
            if (showFeedback) alert('Valitse ensin käsikirjoitus tai luo elämäkertaprojekti.');
            return;
        }
        try {
            if (showFeedback) setBiographyStatus('Ladataan elämäkertatietoja...');
            const res = await apiFetch(`/api/projects/${activeBiographyProjectId()}/biography`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Elämäkertatietojen lataus epäonnistui.');
            biographyState = normalizeBiographyState(data.data);
            if (window.manuscriptData) {
                if (!window.manuscriptData.analysis) window.manuscriptData.analysis = {};
                window.manuscriptData.analysis.biography = biographyState;
            }
            renderBiography();
            setBiographyStatus(showFeedback ? 'Elämäkertatiedot ladattu.' : 'Elämäkertatyötila valmis.');
        } catch (err) {
            setBiographyStatus(err.message, true);
            if (showFeedback) alert(err.message);
        }
    }

    async function saveBiographyState(showFeedback = true) {
        if (!activeBiographyProjectId()) {
            if (showFeedback) alert('Valitse ensin käsikirjoitus tai elämäkertaprojekti.');
            return null;
        }
        biographyState = collectBiographyForm();
        try {
            if (showFeedback) setBiographyStatus('Tallennetaan elämäkertatietoja...');
            const res = await apiFetch(`/api/projects/${activeBiographyProjectId()}/biography`, {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ data: biographyState })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Elämäkertatietojen tallennus epäonnistui.');
            biographyState = normalizeBiographyState(data.data);
            if (window.manuscriptData) {
                if (!window.manuscriptData.analysis) window.manuscriptData.analysis = {};
                window.manuscriptData.analysis.biography = biographyState;
                localStorage.setItem('skriptlab_manuscript', JSON.stringify(window.manuscriptData));
            }
            renderBiography();
            if (showFeedback) setBiographyStatus('Elämäkertatiedot tallennettu.');
            return biographyState;
        } catch (err) {
            setBiographyStatus(err.message, true);
            if (showFeedback) alert(err.message);
            return null;
        }
    }

    function addBiographyMaterial(title, kind, text) {
        const cleanText = String(text || '').trim();
        if (!cleanText) {
            alert('Kirjoita ensin lisättävä aineisto.');
            return;
        }
        biographyState = collectBiographyForm();
        biographyState.materials.push({
            title: String(title || '').trim() || `Aineisto ${biographyState.materials.length + 1}`,
            kind: kind || 'free_text',
            text: cleanText,
            created_at: new Date().toISOString()
        });
        inputValue('bio-material-title', '');
        inputValue('bio-material-text', '');
        if (biographyDictationActive) stopBiographyDictation('Aineisto lisätty ja sanelu pysäytetty.');
        renderBiography();
        saveBiographyState(false);
        setBiographyStatus('Aineisto lisätty.');
    }

    function addBiographyAnswersToMaterials() {
        const answers = document.getElementById('bio-answers')?.value || '';
        if (!answers.trim()) {
            alert('Kirjoita ensin vastaukset.');
            return;
        }
        addBiographyMaterial('Haastatteluvastaukset', 'interview_answer', answers);
    }

    async function runBiographyAction(action) {
        if (!activeBiographyProjectId()) {
            alert('Valitse ensin käsikirjoitus tai elämäkertaprojekti.');
            return;
        }
        biographyState = collectBiographyForm();
        const payload = {
            chapter_title: biographyState.chapter_title,
            chapter_focus: biographyState.chapter_focus,
            chapter_plan: biographyState.chapter_plan
        };
        const actionLabels = {
            analyze: 'Päivitetään elämäkerta-analyysiä...',
            questions: 'Laaditaan tarkentavia kysymyksiä...',
            outline: 'Ehdotetaan rakennetta...',
            chapter_plan: 'Tehdään lukusuunnitelmaa...',
            draft: 'Kirjoitetaan luvun raakaversiota...'
        };
        startBiographyTimer();
        setBiographyStatus(actionLabels[action] || 'Käsitellään elämäkertaa...');
        try {
            const res = await apiFetch(`/api/projects/${activeBiographyProjectId()}/biography/run`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ action, data: biographyState, payload })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Elämäkertatoiminto epäonnistui.');
            biographyState = normalizeBiographyState(data.data);
            if (window.manuscriptData) {
                if (!window.manuscriptData.analysis) window.manuscriptData.analysis = {};
                window.manuscriptData.analysis.biography = biographyState;
                localStorage.setItem('skriptlab_manuscript', JSON.stringify(window.manuscriptData));
            }
            renderBiography();
            setBiographyStatus(data.warnings ? data.warnings : `${data.title || 'Toiminto'} valmis. Lähde: ${data.generated_by}.`);
            loadUsage();
        } catch (err) {
            setBiographyStatus(err.message, true);
            alert('Elämäkertatoiminto epäonnistui: ' + networkFailureMessage(err));
            loadUsage();
        } finally {
            stopBiographyTimer();
        }
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
    const miscProjectSelect = document.getElementById('misc-project-select');
    const miscToolSelect = document.getElementById('misc-tool-select');
    const miscRunBtn = document.getElementById('misc-run-btn');
    const miscCopyBtn = document.getElementById('misc-copy-btn');
    const miscDownloadBtn = document.getElementById('misc-download-btn');
    const miscSaveBtn = document.getElementById('misc-save-btn');
    const miscSaveBookBtn = document.getElementById('misc-save-book-btn');
    const layoutRunBtn = document.getElementById('layout-run-btn');
    const proofreadRunBtn = document.getElementById('proofread-run-btn');
    const proofreadChapterSelect = document.getElementById('proofread-chapter-select');
    const marketingGenerateBtn = document.getElementById('marketing-generate-btn');
    const bioLoadBtn = document.getElementById('bio-load-btn');
    const bioSaveBtn = document.getElementById('bio-save-btn');
    const bioAddMaterialBtn = document.getElementById('bio-add-material-btn');
    const bioAddAnswersBtn = document.getElementById('bio-add-answers-btn');
    const bioDictationBtn = document.getElementById('bio-dictation-btn');
    const bioRunAnalysisBtn = document.getElementById('bio-run-analysis-btn');
    const bioRunQuestionsBtn = document.getElementById('bio-run-questions-btn');
    const bioRunOutlineBtn = document.getElementById('bio-run-outline-btn');
    const bioRunChapterPlanBtn = document.getElementById('bio-run-chapter-plan-btn');
    const bioRunDraftBtn = document.getElementById('bio-run-draft-btn');
    document.querySelectorAll('.translation-tab').forEach(tab => {
        if (tab.dataset.translationPanel) {
            tab.addEventListener('click', () => showTranslationPanel(tab.dataset.translationPanel));
        }
    });
    document.querySelectorAll('.biography-tab').forEach(tab => {
        tab.addEventListener('click', () => showBiographyPanel(tab.dataset.bioPanel));
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
    if (miscProjectSelect) {
        miscProjectSelect.addEventListener('change', () => {
            const project = currentMiscProject();
            if (project) setActiveManuscript(project);
            updateMiscProjectSelect();
            loadMiscAssetsForActiveProject();
        });
    }
    if (miscToolSelect) {
        miscToolSelect.addEventListener('change', () => {
            const title = document.getElementById('misc-result-title');
            if (title) title.textContent = miscToolLabel(miscToolSelect.value);
        });
    }
    if (miscRunBtn) miscRunBtn.addEventListener('click', runMiscTool);
    if (miscCopyBtn) miscCopyBtn.addEventListener('click', copyMiscOutput);
    if (miscDownloadBtn) miscDownloadBtn.addEventListener('click', downloadMiscOutput);
    if (miscSaveBtn) miscSaveBtn.addEventListener('click', () => saveMiscOutput(false));
    if (miscSaveBookBtn) miscSaveBookBtn.addEventListener('click', () => saveMiscOutput(true));
    if (layoutRunBtn) layoutRunBtn.addEventListener('click', runLayout);
    if (proofreadRunBtn) proofreadRunBtn.addEventListener('click', runProofreadChapter);
    if (marketingGenerateBtn) marketingGenerateBtn.addEventListener('click', generateMarketingMaterials);
    document.querySelectorAll('.marketing-copy-btn').forEach(button => {
        button.addEventListener('click', () => copyMarketingField(button.dataset.copyTarget));
    });
    if (proofreadChapterSelect) {
        proofreadChapterSelect.addEventListener('change', () => {
            proofreadSelection.cIndex = Number(proofreadChapterSelect.value || 0);
            proofreadSuggestions = [];
            renderProofreadView();
        });
    }
    if (bioLoadBtn) bioLoadBtn.addEventListener('click', () => loadBiographyState(true));
    if (bioSaveBtn) bioSaveBtn.addEventListener('click', () => saveBiographyState(true));
    if (bioDictationBtn) {
        if (window.SpeechRecognition || window.webkitSpeechRecognition) {
            bioDictationBtn.addEventListener('click', toggleBiographyDictation);
        } else {
            bioDictationBtn.disabled = true;
            setBiographyDictationStatus('Sanelu ei ole käytettävissä tässä selaimessa.', true);
        }
    }
    if (bioAddMaterialBtn) {
        bioAddMaterialBtn.addEventListener('click', () => {
            addBiographyMaterial(
                document.getElementById('bio-material-title')?.value || '',
                document.getElementById('bio-material-kind')?.value || 'free_text',
                document.getElementById('bio-material-text')?.value || ''
            );
        });
    }
    if (bioAddAnswersBtn) bioAddAnswersBtn.addEventListener('click', addBiographyAnswersToMaterials);
    if (bioRunAnalysisBtn) bioRunAnalysisBtn.addEventListener('click', () => runBiographyAction('analyze'));
    if (bioRunQuestionsBtn) bioRunQuestionsBtn.addEventListener('click', () => runBiographyAction('questions'));
    if (bioRunOutlineBtn) bioRunOutlineBtn.addEventListener('click', () => runBiographyAction('outline'));
    if (bioRunChapterPlanBtn) bioRunChapterPlanBtn.addEventListener('click', () => runBiographyAction('chapter_plan'));
    if (bioRunDraftBtn) bioRunDraftBtn.addEventListener('click', () => runBiographyAction('draft'));

    // --- 7. File Upload ---
    const createEmptyDocBtn = document.getElementById('create-empty-doc-btn');
    if (createEmptyDocBtn) {
        createEmptyDocBtn.addEventListener('click', async () => {
            createEmptyDocBtn.disabled = true;
            try {
                await createEmptyDocument();
            } catch (err) {
                alert('Tyhjän dokumentin luonti epäonnistui: ' + err.message);
            } finally {
                createEmptyDocBtn.disabled = false;
            }
        });
    }

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
                bookData = await window.replaceProjectChaptersInDB(bookData);
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
            },
            onChapterRename: (nextCIndex, title) => {
                const chapter = window.manuscriptData.chapters[nextCIndex];
                if (!chapter) return;
                chapter.title = title || `Luku ${nextCIndex + 1}`;
                window.saveProjectStructureToDB(window.manuscriptData);
                renderWritingView();
                window.loadParagraph(nextCIndex, Math.min(pIndex || 0, chapter.paragraphs.length - 1), null);
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
        if (statusP) statusP.textContent = `${chapter.title}, Kappale ${pIndex + 1} (Editointi/Käännöstila)`;

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
            if (showManuscriptMarkup) {
                html += `<div style="padding:10px 12px; margin-bottom:8px; color:var(--text-primary); font-weight:700; border-left:3px solid var(--border-color);">${escapeHtml(chapterMarkdownHeading(chapter, cIndex))}</div>`;
            }
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
                ? chapterTextForEditor(chapter, cIndex)
                : (chapter.paragraphs[pIndex] || ''));
            renderEditedDiffPreview();
        }
        
        renderEditorParagraphPicker(cIndex, pIndex);
        
        const statusP = document.querySelector('#view-toimitus .header-info p');
        if (statusP) {
            statusP.textContent = `${chapter.title}, Kappale ${pIndex + 1} (Editointi/Käännöstila)`;
        }
    };

    // Korvaa alkuperäinen -napin logiikka
    const replaceBtn = document.getElementById('replace-original-btn');
    const saveEditTargetBtn = document.getElementById('save-edit-target-btn');
    const deleteEditParagraphBtn = document.getElementById('delete-edit-paragraph-btn');

    function syncEditedTargetToManuscript(options = {}) {
        const showAlerts = options.showAlerts !== false;
        const sel = window.currentEditSelection;
        const editedText = document.getElementById('edited-text');
        if (sel.cIndex === null || sel.pIndex === null || !editedText) {
            if (showAlerts) {
                alert('Valitse ensin kappale ennen tallentamista!');
                return false;
            }
            return true;
        }
        const chapter = window.manuscriptData?.chapters?.[sel.cIndex];
        if (!chapter) {
            if (showAlerts) {
                alert('Valitse ensin kappale ennen tallentamista!');
                return false;
            }
            return true;
        }
        const newText = getEditableText().trim();
        if (!newText) {
            if (showAlerts) {
                alert('Muokattu teksti on tyhjä!');
                return false;
            }
            return true;
        }

        if (editScopeSelect && editScopeSelect.value === 'chapter') {
            applyParsedChapterText(chapter, newText);
            sel.pIndex = 0;
        } else {
            chapter.paragraphs[sel.pIndex] = newText;
        }
        markLocalManuscriptDraft(window.manuscriptData);
        return true;
    }

    function scheduleEditedTargetAutosave() {
        if (!syncEditedTargetToManuscript({ showAlerts: false })) return;
        window.clearTimeout(editingAutosaveTimer);
        editingAutosaveTimer = window.setTimeout(() => {
            if (syncEditedTargetToManuscript({ showAlerts: false })) {
                window.saveProjectChapterToDB(window.manuscriptData, window.currentEditSelection?.cIndex)
                    .then(() => updateSaveTimestamp('editor-save-status', Boolean(window.manuscriptData?._db_sync_pending)));
                renderBookOverview();
            }
        }, 1200);
    }

    async function saveEditedTargetText(showSavedText = false) {
        const sel = window.currentEditSelection;
        const editedText = document.getElementById('edited-text');
        window.clearTimeout(editingAutosaveTimer);
        if (!syncEditedTargetToManuscript()) return false;
        const originalText = saveEditTargetBtn?.textContent || 'Tallenna';
        if (showSavedText && saveEditTargetBtn) saveEditTargetBtn.textContent = 'Tallennetaan...';
        await window.saveProjectChapterToDB(window.manuscriptData, sel.cIndex);
        updateSaveTimestamp('editor-save-status', Boolean(window.manuscriptData._db_sync_pending));
        window.loadParagraph(sel.cIndex, sel.pIndex, null);
        renderWritingView();

        editedText.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
        setTimeout(() => { editedText.style.backgroundColor = 'transparent'; }, 800);
        if (showSavedText && saveEditTargetBtn) {
            const saved = !window.manuscriptData._db_sync_pending;
            saveEditTargetBtn.textContent = saved ? 'Tallennettu' : 'Tallennus epäonnistui';
            setTimeout(() => { saveEditTargetBtn.textContent = originalText || 'Tallenna'; }, 1200);
            if (!saved) {
                alert('Muutosta ei saatu tallennettua tietokantaan. Paikallinen luonnos on tallessa, mutta kokeile tallennusta uudelleen.');
            }
        }
        return !window.manuscriptData._db_sync_pending;
    }

    if (replaceBtn) replaceBtn.addEventListener('click', () => saveEditedTargetText(false));
    if (saveEditTargetBtn) saveEditTargetBtn.addEventListener('click', () => saveEditedTargetText(true));
    if (editableText) editableText.addEventListener('input', scheduleEditedTargetAutosave);

    if (deleteEditParagraphBtn) {
        deleteEditParagraphBtn.addEventListener('click', async () => {
            const sel = window.currentEditSelection;
            const chapter = window.manuscriptData?.chapters?.[sel.cIndex];
            if (sel.cIndex === null || sel.pIndex === null || !chapter) {
                alert('Valitse poistettava kappale ensin.');
                return;
            }
            const chapterIndex = sel.cIndex;
            const paragraphIndex = sel.pIndex;
            const removedParagraph = chapter.paragraphs[paragraphIndex];
            chapter.paragraphs.splice(paragraphIndex, 1);
            if (chapter.paragraphs.length === 0) chapter.paragraphs.push('');
            const nextIndex = Math.min(paragraphIndex, chapter.paragraphs.length - 1);
            window.currentEditSelection = { cIndex: chapterIndex, pIndex: nextIndex };
            if (writingSelection.cIndex === chapterIndex) writingSelection.pIndex = nextIndex;
            await window.saveProjectChapterToDB(window.manuscriptData, chapterIndex);
            renderBookOverview();
            if (window.renderNavList) window.renderNavList();
            window.loadParagraph(chapterIndex, nextIndex, null);
            renderWritingView();
            showUndoToast(`Kappale ${paragraphIndex + 1} poistettu.`, async () => {
                const targetChapter = window.manuscriptData?.chapters?.[chapterIndex];
                if (!targetChapter) return;
                if (targetChapter.paragraphs.length === 1 && !String(targetChapter.paragraphs[0] || '').trim()) {
                    targetChapter.paragraphs.splice(0, 1);
                }
                targetChapter.paragraphs.splice(Math.min(paragraphIndex, targetChapter.paragraphs.length), 0, removedParagraph);
                window.currentEditSelection = { cIndex: chapterIndex, pIndex: paragraphIndex };
                if (writingSelection.cIndex === chapterIndex) writingSelection.pIndex = paragraphIndex;
                await window.saveProjectChapterToDB(window.manuscriptData, chapterIndex);
                renderBookOverview();
                if (window.renderNavList) window.renderNavList();
                window.loadParagraph(chapterIndex, paragraphIndex, null);
                renderWritingView();
            });
        });
    }

    document.getElementById('om-refresh-btn')?.addEventListener('click', () => loadProjects().then(() => loadLearningMaterialState(true)));
    document.getElementById('om-create-project-btn')?.addEventListener('click', createLearningMaterialProject);
    document.getElementById('om-save-project-btn')?.addEventListener('click', () => saveLearningMaterialState(true));
    document.getElementById('om-project-select')?.addEventListener('change', () => {
        const selected = activeLearningProject();
        if (selected) {
            setActiveManuscript(selected);
            localStorage.setItem(ACTIVE_PROJECT_ID_KEY, String(selected.id));
        }
        loadLearningMaterialState(true);
    });
    document.getElementById('om-add-target-btn')?.addEventListener('click', addOrUpdateLearningTarget);
    document.getElementById('om-save-ops-btn')?.addEventListener('click', () => saveLearningMaterialState(true));
    document.getElementById('om-save-brief-btn')?.addEventListener('click', () => saveLearningMaterialState(true));
    document.getElementById('om-generate-outline-btn')?.addEventListener('click', () => runLearningMaterialAction('outline'));
    document.getElementById('om-save-outline-btn')?.addEventListener('click', () => saveLearningMaterialState(true));
    document.getElementById('om-generate-materials-btn')?.addEventListener('click', () => runLearningMaterialAction('materials'));
    document.getElementById('om-save-materials-btn')?.addEventListener('click', () => saveLearningMaterialState(true));
    document.getElementById('om-regenerate-material-btn')?.addEventListener('click', () => {
        const materialType = document.getElementById('om-material-type')?.value || 'learner_text';
        runLearningMaterialAction('regenerate', {
            material_type: materialType,
            instructions: document.getElementById('om-regenerate-instructions')?.value || '',
            current_content: document.getElementById('om-material-content')?.value || ''
        });
    });
    document.getElementById('om-run-validation-btn')?.addEventListener('click', () => runLearningMaterialAction('validate'));
    document.getElementById('om-save-validation-btn')?.addEventListener('click', () => saveLearningMaterialState(true));
    document.getElementById('om-save-statuses-btn')?.addEventListener('click', saveLearningStatuses);
    document.getElementById('om-refresh-export-btn')?.addEventListener('click', renderLearningExport);
    document.getElementById('om-download-txt-btn')?.addEventListener('click', downloadLearningMaterialText);
    document.getElementById('om-print-btn')?.addEventListener('click', () => window.print());
    document.getElementById('om-material-type')?.addEventListener('change', () => {
        saveCurrentLearningMaterialEditor();
        renderSelectedLearningMaterial();
    });
    [
        'om-period-length',
        'om-hours-total',
        'om-concepts',
        'om-task-types',
        'om-material-formats',
        'om-assessment-method',
        'om-teacher-priorities'
    ].forEach(id => document.getElementById(id)?.addEventListener('input', () => {
        collectLearningBriefFields(learningMaterialState);
        renderLearningBrief();
    }));

    {
        loadUsage();
        loadTranslationModels();
        loadMiscModels();
        loadProjects().then(() => {
            if (currentUser && currentUser.role === 'oppimateriaali') {
                loadLearningMaterialState(false);
            }
        }).catch(() => {
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
