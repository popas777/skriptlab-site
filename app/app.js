const API_BASE_URL = (window.SKRIPTLAB_CONFIG && window.SKRIPTLAB_CONFIG.API_BASE_URL) || "http://127.0.0.1:8000";
const apiUrl = (path) => `${API_BASE_URL}${path}`;
const apiFetch = (path, options) => window.SkriptLabAuth.fetch(path, options);
const ACTIVE_PROJECT_ID_KEY = "skriptlab_active_project_id";
const WRITER_DESK_STRUCTURE_VISIBLE_KEY = "skriptlab_writer_desk_structure_visible";
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
            title: chapter.title || '',
            toc_title: chapter.toc_title || chapter.tocTitle || chapter.structure_title || chapter.title || `Luku ${index + 1}`
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
    let selectedTranslationPartIndex = 0;
    let latestFinnishTranslationText = '';
    let currentFinnishTranslationHistory = [];
    let selectedFinnishTranslation = null;
    let selectedFinnishTranslationPartIndex = 0;
    let syncingTranslationScroll = false;
    let translationTimerInterval = null;
    let finnishTranslationTimerInterval = null;
    let latestTranslationEstimate = null;
    let latestFinnishTranslationEstimate = null;
	    let miscModels = [];
	    let miscTimerInterval = null;
	    let latestMiscText = '';
	    let currentMiscAssets = [];
	    let currentLayoutAssets = [];
	    let imageModels = [];
    let proofreadSuggestions = [];
    let proofreadSelection = { cIndex: null };
    let proofreadExtraFindings = [];
    let proofreadPanel = 'proofread-panel-chapter';
    const EXTRA_PROOFREAD_RULES_KEY = 'skriptlab_extra_proofread_rules';
    const DEFAULT_EXTRA_PROOFREAD_RULES = `Tarkista teksti kustannustoimituksen ja taittovedoksen viimeistelyn näkökulmasta. Älä käytä Python-heuristiikkaa, vaan arvioi kohdat kielellisesti ja kontekstin perusteella.

Tarkistettavia asioita:
- tuplavälilyönnit ja ylimääräiset välit
- välilyönti ennen välimerkkiä ja puuttuva välilyönti välimerkin jälkeen
- peräkkäin toistuvat sanat, mutta vältä vääriä hälytyksiä tarkoituksellisista tehokeinoista
- tavuviivan tai rivinvaihdon jäänteet keskellä virkettä
- suorat ja typografiset lainausmerkit sekaisin
- neljä tai useampi peräkkäinen piste
- pieni kirjain virkkeen alussa, kun edellä ei ole lyhennettä
- merkistöhäiriöt, korvausmerkit ja hajonneet skandit
- desimaalierotin: suomessa käytetään pilkkua, ei pistettä, kun kyse on desimaalista
- kellonaika: suomen yleiskielessä käytä muotoa klo 14.30, ei klo 14:30
- mittayksiköt ja prosentit: välilyönti numeron ja yksikön/merkin väliin, esimerkiksi 5 kg ja 15 %
- pilkulliset tuhaterottimet: suomen tekstissä käytä välilyöntiä, esimerkiksi 1 000
- huono tavutus tai tavutuksen jäljet, jos kohta näyttää tekstissä rikkoutuneelta
- mahdolliset leski- ja orporivien kaltaiset taittoriskit, jos teksti näyttää katkeavan oudosti

Raportoi vain kohdat, jotka kannattaa ihmisen tarkistaa. Älä keksi ongelmia. Älä korjaa tyyliä, henkilöääntä tai kirjailijan tarkoituksellista rytmiä ilman selvää virhettä.`;
    let biographyState = {};
    let biographyTimerInterval = null;
    let biographyDictationRecognition = null;
    let biographyDictationActive = false;
    let learningMaterialState = {};
    let learningMaterialTimerInterval = null;
    let editingLearningTargetIndex = null;
    let undoToastTimer = null;
    let writerDeskSelection = { cIndex: null, pIndex: 0 };
    let writerDeskAutosaveTimer = null;
    let writerDeskAssistantDraftKind = '';
    let writerDeskStructureVisible = localStorage.getItem(WRITER_DESK_STRUCTURE_VISIBLE_KEY) === 'true';
    function defaultViewForUser() {
        if (currentUser?.role === 'oppimateriaali') return 'view-om-projekti';
        if (currentUser?.role === 'kirjailija') {
            return localStorage.getItem('skriptlab_manuscript') ? 'view-kirjoita' : 'view-kirjani';
        }
        return 'view-kirjani';
    }
    function primaryWritingView() {
        return 'view-kirjoita';
    }
    let currentViewId = defaultViewForUser();
    let workflowRunning = false;
    let workflowSteps = [];
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
    const writerViews = new Set(['view-kirjani', 'view-kirjoita', 'view-analyysi', 'view-rakenne', 'view-toimitus', 'view-tyopoyta', 'view-ai-tyonkulku', 'view-kirja', 'view-julkaise', 'view-oikoluku', 'view-muut-toiminnot', 'view-kuvitus', 'view-elamakerta']);
    const betaCoreViews = new Set(['view-kirjani', 'view-kirjoita', 'view-analyysi', 'view-rakenne', 'view-toimitus', 'view-tyopoyta', 'view-ai-tyonkulku', 'view-kirja', 'view-julkaise', 'view-oikoluku', 'view-muut-toiminnot', 'view-kuvitus', 'view-tuotetiedot', 'view-markkinointi', 'view-audio']);
    const translatorViews = new Set([...betaCoreViews, 'view-kaannokset', 'view-suomentaja']);
    const biographyViews = new Set(['view-kirjani', 'view-rakenne', 'view-kirjoita', 'view-ai-tyonkulku', 'view-elamakerta', 'view-toimitus', 'view-oikoluku', 'view-kuvitus', 'view-tuotetiedot', 'view-taitto', 'view-muut-toiminnot', 'view-markkinointi', 'view-audio', 'view-kirja', 'view-julkaise']);
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
	    const writerStageConfig = {
	        writing: {
	            label: 'Käsikirjoittaminen',
	            assistantHint: 'Keskity ideaan, kohtauksen tarkoitukseen, jatkamiseen ja tekstin suuntaan.'
	        },
	        editing: {
	            label: 'Editointi',
	            assistantHint: 'Keskity kohtakohtaiseen selkeyteen, rytmiin, toistoon, jatkuvuuteen ja kirjailijan äänen säilyttämiseen.'
	        },
	        finishing: {
	            label: 'Viimeistely',
	            assistantHint: 'Keskity kielen viimeisiin korjauksiin, oikolukuun, kappaleen tiiviyteen ja julkaisuvalmiuteen.'
	        },
	        layout: {
	            label: 'Taitto',
	            assistantHint: 'Keskity taittoon, otsikoihin, oheisaineistoihin, sisällysluetteloon ja lopullisiin tiedostoihin.'
	        }
	    };
	    const writerStageLegacyMap = {
	        draft: 'writing',
	        manuscript: 'editing',
	        production: 'finishing'
	    };
	    const writerAssistantActionsByStage = {
	        writing: [
	            { value: 'develop_section', label: 'Kehitä kohtaa' },
	            { value: 'continue_section', label: 'Jatka tekstiä' },
	            { value: 'next_step', label: 'Seuraava askel' }
	        ],
	        editing: [
	            { value: 'rewrite_section', label: 'Ehdota muokkausta' },
	            { value: 'clarify_section', label: 'Selkeytä' },
	            { value: 'tighten_section', label: 'Tiivistä' }
	        ],
	        finishing: [
	            { value: 'proof_section', label: 'Oikolue kohta' },
	            { value: 'polish_section', label: 'Viimeistele' },
	            { value: 'production_checklist', label: 'Tarkista valmius' }
	        ],
	        layout: [
	            { value: 'layout_note', label: 'Taittohuomio' },
	            { value: 'misc_frontmatter', label: 'Alkusivut' },
	            { value: 'layout_run', label: 'Aja taitto' }
	        ]
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
    const coverFormatSelect = document.getElementById('cover-format-select');
    const coverFormatNote = document.getElementById('cover-format-note');
    const coverTitleInput = document.getElementById('cover-title-input');
    const coverAuthorInput = document.getElementById('cover-author-input');
    const coverSpineFields = document.getElementById('cover-spine-fields');
    const coverSpineWidthInput = document.getElementById('cover-spine-width-input');
    const coverPageCountInput = document.getElementById('cover-page-count-input');
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
        const navItem = document.querySelector(`#nav-menu li[data-view="${navViewFor(currentViewId)}"]`);
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

    function countWords(value) {
        return String(value || '').trim().split(/\s+/).filter(Boolean).length;
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
        const kind = miscAssetKind(asset);
        let content = assetTextContent(asset).trim();
        if (kind === 'title_page') {
            content = content.replace(/^\s*Nimiölehti\s*\n+/i, '').trim();
        } else if (kind === 'copyright_page') {
            content = content.replace(/^\s*Copysivu\s*\/\s*oikeussivu\s*\n+/i, '').trim();
        }
        if (!content) return '';
        return content;
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

    const BOOK_FRONT_SECTION_RULES = [
        { kind: 'cover', keywords: ['kansi', 'etusivu', 'cover'] },
        { kind: 'title_page', keywords: ['nimiölehti', 'nimiolehti', 'nimilehti', 'nimiösivu', 'nimiosivu', 'title page'] },
        { kind: 'half_title', keywords: ['välinimilehti', 'valinimilehti', 'välinimisivu', 'valinimisivu', 'half title'] },
        { kind: 'copyright_page', keywords: ['tekijänoikeus', 'tekijanoikeus', 'copyright', 'copy-sivu', 'copysivu'] },
        { kind: 'dedication', keywords: ['omistuskirjoitus', 'omistus', 'dedication'] },
        { kind: 'epigraph', keywords: ['epigrafi', 'epigraph'] },
        { kind: 'table_of_contents', keywords: ['sisällysluettelo', 'sisallysluettelo', 'sisällys', 'sisallys', 'table of contents', 'toc'] },
        { kind: 'author_preface', keywords: ['kirjailijan esipuhe', 'tekijän esipuhe', 'tekijan esipuhe', "author's preface"] },
        { kind: 'preface', keywords: ['esipuhe', 'alkusanat', 'preface', 'foreword'] },
        { kind: 'introduction', keywords: ['johdanto', 'introduction'] },
    ];

    const BOOK_BACK_SECTION_RULES = [
        { kind: 'afterword', keywords: ['jälkisanat', 'jalkisanat', 'afterword'] },
        { kind: 'appendix', keywords: ['liitteet', 'liite', 'appendix', 'appendices'] },
        { kind: 'glossary', keywords: ['sanasto', 'glossary'] },
        { kind: 'bibliography', keywords: ['bibliografia', 'lähdeluettelo', 'lahdeluettelo', 'kirjallisuusluettelo', 'lähteet', 'lahteet', 'bibliography', 'references'] },
        { kind: 'acknowledgements', keywords: ['kiitokset', 'acknowledgements', 'acknowledgments'] },
        { kind: 'about_author', keywords: ['tietoja kirjailijasta', 'tietoa kirjailijasta', 'tietoja kirjoittajasta', 'tietoja tekijästä', 'tietoja tekijasta', 'about the author'] },
        { kind: 'notes', keywords: ['huomautukset', 'viitteet', 'notes', 'endnotes'] },
        { kind: 'index', keywords: ['hakemisto', 'index'] },
        { kind: 'colophon', keywords: ['kolofoni', 'colophon'] },
    ];

    const STRUCTURE_KIND_TITLES = {
        cover: 'Kansi',
        title_page: 'Nimiölehti',
        half_title: 'Välinimilehti',
        copyright_page: 'Tekijänoikeus',
        dedication: 'Omistuskirjoitus',
        epigraph: 'Epigrafi',
        table_of_contents: 'Sisällysluettelo',
        author_preface: 'Kirjailijan esipuhe',
        preface: 'Esipuhe',
        introduction: 'Johdanto',
        front: 'Etusivu',
        prologue: 'Prologi',
        part: 'Osa',
        chapter: 'Luku',
        subchapter: 'Aliluku',
        epilogue: 'Epilogi',
        afterword: 'Jälkisanat',
        appendix: 'Liitteet',
        glossary: 'Sanasto',
        bibliography: 'Bibliografia',
        acknowledgements: 'Kiitokset',
        about_author: 'Tietoja kirjailijasta',
        notes: 'Huomautukset',
        index: 'Hakemisto',
        colophon: 'Kolofoni',
        back: 'Lopputeksti'
    };

    const STRUCTURE_KIND_PREFIXES = {
        cover: 'kansi',
        title_page: 'nimiolehti',
        half_title: 'valinimilehti',
        copyright_page: 'tekijanoikeus',
        dedication: 'omistus',
        epigraph: 'epigrafi',
        table_of_contents: 'sisallys',
        author_preface: 'kirjailijan_esipuhe',
        preface: 'esipuhe',
        introduction: 'johdanto',
        front: 'alku',
        prologue: 'prologi',
        part: 'osa',
        chapter: 'luku',
        subchapter: 'aliluku',
        epilogue: 'epilogi',
        afterword: 'jalkisanat',
        appendix: 'liite',
        glossary: 'sanasto',
        bibliography: 'bibliografia',
        acknowledgements: 'kiitokset',
        about_author: 'tietoja_kirjailijasta',
        notes: 'huomautukset',
        index: 'hakemisto',
        colophon: 'kolofoni',
        back: 'loppu'
    };

    const FRONT_STRUCTURE_KINDS = new Set(BOOK_FRONT_SECTION_RULES.map(rule => rule.kind).concat(['front']));
    const BACK_STRUCTURE_KINDS = new Set(BOOK_BACK_SECTION_RULES.map(rule => rule.kind).concat(['back']));
    const BODY_TEXT_STRUCTURE_KINDS = new Set(['chapter', 'subchapter', 'prologue', 'epilogue']);

    function normalizeBookSectionTitle(value) {
        return String(value || '')
            .trim()
            .replace(/^#{1,6}\s+/, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function keywordPrefixMatch(title, keywords) {
        const lower = normalizeBookSectionTitle(title).toLocaleLowerCase('fi-FI');
        return keywords.some(keyword => {
            const key = String(keyword).toLocaleLowerCase('fi-FI');
            return lower === key || lower.startsWith(`${key}:`) || lower.startsWith(`${key} -`) || lower.startsWith(`${key} –`);
        });
    }

    function matchesNumberedBookHeading(title, labels) {
        const text = normalizeBookSectionTitle(title);
        const numberWords = 'yksi|yhden|kaksi|kahden|kolme|kolmen|neljä|neljan|neljän|viisi|viiden|kuusi|kuuden|seitsemän|seitseman|kahdeksan|yhdeksän|yhdeksan|kymmenen|yksitoista|kaksitoista|thirteen|fourteen|fifteen';
        const ordinalWords = 'ensimmäinen|toinen|kolmas|neljäs|viides|kuudes|seitsemäs|kahdeksas|yhdeksäs|kymmenes|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth';
        const token = `(?:\\d+|[ivxlcdm]+|${numberWords}|${ordinalWords})`;
        return new RegExp(`^(?:${labels.join('|')})\\s+${token}\\b`, 'i').test(text);
    }

    function classifyBookSectionTitle(value) {
        const title = normalizeBookSectionTitle(value);
        if (!title) return null;
        for (const rule of BOOK_FRONT_SECTION_RULES) {
            if (keywordPrefixMatch(title, rule.keywords)) return { placement: 'front', kind: rule.kind, title };
        }
        for (const rule of BOOK_BACK_SECTION_RULES) {
            if (keywordPrefixMatch(title, rule.keywords)) return { placement: 'back', kind: rule.kind, title };
        }
        const lower = title.toLocaleLowerCase('fi-FI');
        if (lower === 'prologi' || lower === 'prologue' || lower.startsWith('prologi:') || lower.startsWith('prologue:')) {
            return { placement: 'body', kind: 'prologue', title };
        }
        if (lower === 'epilogi' || lower === 'epilogue' || lower.startsWith('epilogi:') || lower.startsWith('epilogue:')) {
            return { placement: 'body', kind: 'epilogue', title };
        }
        if (
            matchesNumberedBookHeading(title, ['osa', 'part'])
            || /^(ensimmäinen|toinen|kolmas|neljäs|viides|kuudes|seitsemäs|kahdeksas|yhdeksäs|kymmenes|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+osa\b/i.test(lower)
            || /^[ivxlcdm]+\.?\s+osa\b/i.test(lower)
            || /^(osa|part)\s*[:\-–]\s+\S/i.test(title)
        ) {
            return { placement: 'body', kind: 'part', title };
        }
        if (
            matchesNumberedBookHeading(title, ['aliluku', 'subchapter'])
            || /^(\d+\.\d+(?:\.\d+)*|[ivxlcdm]+\.\d+)\.?\s+\S/i.test(title)
        ) {
            return { placement: 'body', kind: 'subchapter', title };
        }
        if (
            matchesNumberedBookHeading(title, ['luku', 'chapter'])
            || (/^(\d+|[ivxlcdm]+)\.\s+\S.{0,90}$/i.test(title) && !/[.!?]$/.test(title))
        ) {
            return { placement: 'body', kind: 'chapter', title };
        }
        return null;
    }

    function isBookSectionHeadingLine(value) {
        const raw = String(value || '').trim();
        const title = normalizeBookSectionTitle(raw);
        if (!raw || raw.includes('\n') || !title || title.length > 180) return false;
        return Boolean(classifyBookSectionTitle(title)) || /^#{1,6}\s+\S/.test(raw);
    }

    function chapterPlacement(chapter, index) {
        const title = `${chapter?.title || ''} ${chapter?.toc_title || ''} ${chapter?.tocTitle || ''}`.trim();
        const id = String(chapter?.id || '').toLocaleLowerCase('fi-FI');
        const section = classifyBookSectionTitle(title);
        if (section) return section.placement;
        const kind = structureChapterKind(chapter);
        if (FRONT_STRUCTURE_KINDS.has(kind)) return 'front';
        if (BACK_STRUCTURE_KINDS.has(kind)) return 'back';
        if (id.startsWith('alku_') || id.startsWith('nimiolehti_') || id.startsWith('sisallys_')) return 'front';
        if (id.startsWith('loppu_')) return 'back';
        return 'body';
    }

    function chapterGroupLabel(key) {
        if (key === 'front') return 'Etusivut';
        if (key === 'back') return 'Lopputekstit';
        return 'Pääteksti';
    }

    function firstBodyChapterIndex(chapters = window.manuscriptData?.chapters || []) {
        const bodyIndex = chapters.findIndex((chapter, index) => chapterPlacement(chapter, index) === 'body');
        return bodyIndex >= 0 ? bodyIndex : 0;
    }

    function isSubchapterTitle(chapter) {
        const title = `${chapter?.id || ''} ${chapter?.title || ''} ${chapter?.toc_title || ''} ${chapter?.tocTitle || ''}`.trim();
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
                const displayTitle = structureDisplayTitle(chapter, index) || `Osio ${index + 1}`;
                chapterButton.innerHTML = `
                    <span class="chapter-nav-title">${escapeHtml(displayTitle)}</span>
                    ${handlers.showParagraphMeta === false ? '' : `<span class="chapter-nav-meta">${paragraphCount} tekstikappaletta</span>`}
                `;
                chapterButton.addEventListener('click', () => {
                    if (handlers.onChapterSelect) handlers.onChapterSelect(index);
                });
                item.appendChild(chapterButton);

                if (index === activeCIndex) {
                    const titleInput = document.createElement('input');
                    titleInput.type = 'text';
                    titleInput.className = 'chapter-title-input';
                    titleInput.value = displayTitle;
                    titleInput.setAttribute('aria-label', 'Osion nimi');
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
        return data.chapters.map((chapter, index) => {
            const title = isRawWritingDraftChapter(chapter) ? explicitChapterTitle(chapter) : structureDisplayTitle(chapter, index);
            const paragraphs = Array.isArray(chapter.paragraphs)
                ? chapter.paragraphs.map(p => String(p || '').trim()).filter(Boolean).join('\n\n')
                : '';
            return [title, paragraphs].filter(Boolean).join('\n\n');
        }).filter(Boolean).join('\n\n\n');
    }

    let showManuscriptMarkup = localStorage.getItem('skriptlab_show_manuscript_markup') === 'true';

    function markdownLevelForChapter(chapter, index = 0) {
        const kind = structureChapterKind(chapter);
        if (kind === 'part' || structureKindPlacement(kind) === 'front' || structureKindPlacement(kind) === 'back') return 1;
        if (kind === 'subchapter') return 3;
        const label = `${chapter?.id || ''} ${chapter?.title || ''}`.toLowerCase();
        if (label.includes('aliluku') || /^(\d+\.\d+|[ivxlcdm]+\.\d+)\b/i.test(label.trim())) return 3;
        return 2;
    }

    function stripMarkdownHeading(value) {
        return String(value || '').replace(/^#{1,6}\s+/, '').trim();
    }

    function chapterMarkdownHeading(chapter, index = 0) {
        const level = markdownLevelForChapter(chapter, index);
        return `${'#'.repeat(level)} ${stripMarkdownHeading(structureDisplayTitle(chapter, index) || `Luku ${index + 1}`)}`;
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

    function explicitChapterTitle(chapter) {
        return String(
            chapter?.toc_title
            || chapter?.tocTitle
            || chapter?.structure_title
            || chapter?.title
            || ''
        ).trim();
    }

    function isRawWritingDraftChapter(chapter) {
        const id = String(chapter?.id || '');
        return id.startsWith('raakateksti_') || id.startsWith('raw_draft_');
    }

    function isProjectStructureCompleted(data = window.manuscriptData) {
        const analysis = data?.analysis || {};
        return Boolean(
            analysis.structure_completed_at
            || analysis.structure_completed === true
            || analysis.structure_status === 'accepted'
        );
    }

    function writingTextForProject(data = window.manuscriptData) {
        if (!data || !Array.isArray(data.chapters)) return '';
        return data.chapters.map((chapter, index) => {
            const title = explicitChapterTitle(chapter);
            const includeTitle = title && !isRawWritingDraftChapter(chapter);
            const paragraphs = Array.isArray(chapter.paragraphs)
                ? chapter.paragraphs.map(paragraph => String(paragraph || '').trim()).filter(Boolean)
                : [];
            return [
                includeTitle ? chapterMarkdownHeading(chapter, index) : '',
                ...paragraphs
            ].filter(Boolean).join('\n\n');
        }).filter(Boolean).join('\n\n\n');
    }

    function currentWritingChapterIndex() {
        const chapters = window.manuscriptData?.chapters || [];
        if (!chapters.length) return 0;
        const firstWritable = chapters.findIndex(chapter => structureChapterHasText(chapter) || isBodyTextStructureKind(structureChapterKind(chapter)));
        let index = Number.isInteger(writingSelection.cIndex) ? writingSelection.cIndex : firstWritable;
        if (!chapters[index] || (!structureChapterHasText(chapters[index]) && !isBodyTextStructureKind(structureChapterKind(chapters[index])))) {
            index = firstWritable >= 0 ? firstWritable : firstBodyChapterIndex(chapters);
        }
        if (!chapters[index]) index = 0;
        writingSelection.cIndex = index;
        if (!Number.isInteger(writingSelection.pIndex)) writingSelection.pIndex = 0;
        return index;
    }

    function writingTextForCurrentChapter() {
        const index = currentWritingChapterIndex();
        const chapter = window.manuscriptData?.chapters?.[index];
        return chapter ? chapterTextForEditor(chapter, index) : '';
    }

    function replaceProjectWithRawWritingText(text) {
        if (!window.manuscriptData) return false;
        const paragraphs = splitIntoParagraphs(text);
        window.manuscriptData.chapters = [{
            id: 'raakateksti_1',
            title: '',
            toc_title: '',
            paragraphs: paragraphs.length ? paragraphs : ['']
        }];
        writingSelection = { cIndex: 0, pIndex: 0 };
        markLocalManuscriptDraft(window.manuscriptData);
        return true;
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

    function writingTextHasStructureHeadings(text) {
        return /^#{1,4}\s+\S/m.test(String(text || ''));
    }

    function setTextareaSelection(textEl, start, end) {
        textEl.focus();
        textEl.setSelectionRange(Math.max(0, start), Math.max(0, end));
        updateWritingPositionFromCursor();
        scheduleWritingAutosave();
    }

    function applyWritingBlockFormat(levelValue) {
        const textEl = document.getElementById('writing-text');
        if (!textEl) return;
        const value = textEl.value || '';
        const start = textEl.selectionStart ?? 0;
        const end = textEl.selectionEnd ?? start;
        const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
        let lineEnd = value.indexOf('\n', end);
        if (lineEnd < 0) lineEnd = value.length;
        const selected = value.slice(lineStart, lineEnd);
        const level = Number(levelValue);
        const prefix = Number.isFinite(level) && level >= 1 && level <= 4 ? `${'#'.repeat(level)} ` : '';
        const formatted = selected.split('\n').map(line => {
            if (!line.trim()) return line;
            const content = line.replace(/^\s*#{1,6}\s+/, '').trim();
            return prefix ? `${prefix}${content}` : content;
        }).join('\n');
        textEl.value = value.slice(0, lineStart) + formatted + value.slice(lineEnd);
        setTextareaSelection(textEl, lineStart, lineStart + formatted.length);
        setWritingToolStatus(prefix ? `Otsikkotaso ${level} asetettu.` : 'Muutettu leipätekstiksi.');
    }

    function wrapWritingSelection(before, after = before, placeholder = 'teksti') {
        const textEl = document.getElementById('writing-text');
        if (!textEl) return;
        const value = textEl.value || '';
        const start = textEl.selectionStart ?? 0;
        const end = textEl.selectionEnd ?? start;
        const selected = value.slice(start, end) || placeholder;
        const wrapped = `${before}${selected}${after}`;
        textEl.value = value.slice(0, start) + wrapped + value.slice(end);
        const selectionStart = start + before.length;
        const selectionEnd = selectionStart + selected.length;
        setTextareaSelection(textEl, selectionStart, selectionEnd);
        setWritingToolStatus('Muotoilu lisätty.');
    }

    function updateMarkupButtons() {
        const label = showManuscriptMarkup ? 'Piilota merkinnät' : 'Näytä merkinnät';
        ['toggle-writing-markup-btn', 'toggle-editor-markup-btn', 'writer-desk-toggle-markup-btn'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.textContent = label;
        });
    }

    function toggleManuscriptMarkup() {
        if (currentViewId === 'view-tyopoyta') saveWriterDeskText(false);
        else saveWritingText(false);
        showManuscriptMarkup = !showManuscriptMarkup;
        localStorage.setItem('skriptlab_show_manuscript_markup', String(showManuscriptMarkup));
        updateMarkupButtons();
        renderWritingView();
        renderWriterDeskView();
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
            'Rakenne ja otsikkotasot viimeistellään Rakenne- ja Editointi-osioissa. Kirjoita-osio on raakatekstin kirjoittamista varten.'
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
            updateFinnishTranslationProjectSelect();

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

    function renderPublishView() {
        const currentEl = document.getElementById('publish-current-project');
        const statusEl = document.getElementById('publish-status');
        if (currentEl) currentEl.textContent = window.manuscriptData
            ? `Käsikirjoitus: ${window.manuscriptData.title || 'Nimetön'}`
            : 'Valitse käsikirjoitus, jos haluat hakemukseen teoksen tiedot mukaan.';
        if (statusEl && !document.getElementById('publish-application-output')?.value.trim()) {
            statusEl.textContent = window.manuscriptData
                ? 'Muodosta hakemuspohja käsikirjoituksen ja omien tietojesi pohjalta.'
                : 'Voit täyttää hakemuspohjan myös ilman valittua käsikirjoitusta.';
        }
    }

    function analysisFieldText(keys) {
        const analysis = window.manuscriptData?.analysis || {};
        for (const key of keys) {
            const value = analysis[key];
            if (typeof value === 'string' && value.trim()) return value.trim();
            if (value && typeof value === 'object') {
                const asText = JSON.stringify(value, null, 2);
                if (asText.trim() && asText !== '{}') return asText;
            }
        }
        return '';
    }

    function buildPublishingApplicationText() {
        const title = window.manuscriptData?.title || 'Nimetön käsikirjoitus';
        const author = window.manuscriptData?.author || currentUser?.display_name || '';
        const publisher = document.getElementById('publish-target-publisher')?.value.trim() || 'Vastaanottaja';
        const stage = document.getElementById('publish-manuscript-stage')?.value || 'Valmis käsikirjoitus';
        const bio = document.getElementById('publish-author-bio')?.value.trim() || '[Lisää tähän lyhyt kirjailijaesittely ja olennainen tausta.]';
        const note = document.getElementById('publish-cover-note')?.value.trim() || '[Lisää tähän saate: miksi lähetät teoksen ja miksi se sopisi vastaanottajalle.]';
        const synopsis = analysisFieldText(['synopsis', 'synopsis_short', 'tiivistelma', 'summary']);
        const genre = analysisFieldText(['genre', 'genres', 'lajityyppi']);
        const audience = analysisFieldText(['target_audience', 'kohderyhma', 'audience']);
        const text = getFullManuscriptText();
        const characterCount = text.length;
        const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
        const metadataLines = [
            `Teos: ${title}`,
            author ? `Tekijä: ${author}` : '',
            `Valmiusaste: ${stage}`,
            wordCount ? `Laajuus: noin ${wordCount.toLocaleString('fi-FI')} sanaa / ${characterCount.toLocaleString('fi-FI')} merkkiä` : '',
            genre ? `Lajityyppi: ${genre}` : '',
            audience ? `Kohderyhmä: ${audience}` : ''
        ].filter(Boolean);
        return [
            `Hei ${publisher},`,
            '',
            note,
            '',
            ...metadataLines,
            '',
            'Lyhyt kuvaus:',
            synopsis || '[Lisää tähän 1-3 kappaleen tiivis kuvaus teoksesta.]',
            '',
            'Kirjailijaesittely:',
            bio,
            '',
            'Liitteet ja seuraavat aineistot:',
            '- käsikirjoitus tai näyteluvut vastaanottajan ohjeen mukaan',
            '- synopsis tai pidempi tiivistelmä',
            '- tekijän yhteystiedot',
            '- mahdolliset aiemmat julkaisut, palautteet tai muu olennainen tausta',
            '',
            'Ystävällisin terveisin,',
            author || '[Nimesi]'
        ].join('\n');
    }

    function buildPublishApplication() {
        const output = document.getElementById('publish-application-output');
        const status = document.getElementById('publish-status');
        if (!output) return;
        output.value = buildPublishingApplicationText();
        if (status) status.textContent = 'Hakemuspohja muodostettu. Tarkista sävy, vastaanottajan ohjeet ja liitteet ennen lähettämistä.';
    }

    async function copyPublishApplication() {
        const output = document.getElementById('publish-application-output');
        const status = document.getElementById('publish-status');
        if (!output) return;
        if (!output.value.trim()) buildPublishApplication();
        try {
            await navigator.clipboard.writeText(output.value);
            if (status) status.textContent = 'Hakemuspohja kopioitu leikepöydälle.';
        } catch (err) {
            if (status) status.textContent = 'Kopiointi ei onnistunut. Voit valita tekstin ja kopioida sen käsin.';
        }
    }

    function requestPrintOffer() {
        const title = window.manuscriptData?.title || 'käsikirjoitus';
        const quantity = document.getElementById('publish-print-quantity')?.value || '';
        const format = document.getElementById('publish-print-format')?.value || '';
        const color = document.getElementById('publish-print-color')?.value || '';
        const cover = document.getElementById('publish-print-cover')?.value || '';
        const notes = document.getElementById('publish-print-notes')?.value || '';
        const detailLines = [
            `Käsikirjoitus: ${title}`,
            quantity ? `Painosmäärä: ${quantity}` : '',
            format ? `Formaatti: ${format}` : '',
            color ? `Sisäsivut: ${color}` : '',
            cover ? `Kansi: ${cover}` : ''
        ].filter(Boolean);
        const subject = encodeURIComponent(`Painatustarjous: ${title}`);
        const body = encodeURIComponent([
            'Hei,',
            '',
            'Haluaisin pyytää painatustarjouksen.',
            ...detailLines,
            '',
            'Lisätiedot:',
            notes,
            '',
            'Voitteko kertoa arvion hinnasta, aikataulusta ja siitä, mitä aineistoja tarvitaan seuraavaksi?'
        ].join('\n'));
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
        const chapterIndex = currentWritingChapterIndex();
        const chapter = window.manuscriptData.chapters?.[chapterIndex];
        if (!chapter) return false;
        const text = textEl.value || '';
        const hasStructureHeadings = writingTextHasStructureHeadings(text);
        if (showManuscriptMarkup || hasStructureHeadings) {
            applyParsedChapterText(chapter, text);
            if (hasStructureHeadings && !window.manuscriptData.analysis?.structure_completed) {
                window.manuscriptData.analysis = window.manuscriptData.analysis || {};
                window.manuscriptData.analysis.structure_status = 'draft_from_headings';
            }
        } else {
            const paragraphs = splitIntoParagraphs(text);
            chapter.paragraphs = paragraphs.length ? paragraphs : [''];
        }
        const paragraphs = Array.isArray(chapter.paragraphs) && chapter.paragraphs.length ? chapter.paragraphs : [''];
        writingSelection = {
            cIndex: chapterIndex,
            pIndex: Math.min(Math.max(writingSelection.pIndex || 0, 0), Math.max(0, paragraphs.length - 1))
        };
        window.currentEditSelection = { cIndex: writingSelection.cIndex, pIndex: writingSelection.pIndex };
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
        if (currentViewId === 'view-tyopoyta') {
            window.clearTimeout(writerDeskAutosaveTimer);
            if (syncWriterDeskEditorToManuscript()) {
                savePromise = window.saveProjectChapterToDB(window.manuscriptData, writerDeskSelection.cIndex);
            }
        }
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
        const parts = splitIntoParagraphs(text);
        if (showManuscriptMarkup && parts.length && /^#{1,6}\s+/.test(parts[0])) {
            return parts.slice(1).length ? parts.slice(1) : [''];
        }
        return parts.length ? parts : [''];
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
        const paragraphs = currentWritingParagraphs();
        const pIndex = Math.min(Math.max(writingSelection.pIndex || 0, 0), Math.max(0, paragraphs.length - 1));
        if (jumpInput) {
            jumpInput.max = String(Math.max(1, paragraphs.length));
            jumpInput.value = String(pIndex + 1);
        }
        if (statusEl) {
            const chapterIndex = currentWritingChapterIndex();
            const chapters = window.manuscriptData?.chapters || [];
            const title = chapters[chapterIndex] ? structureDisplayTitle(chapters[chapterIndex], chapterIndex) : 'Osio';
            statusEl.textContent = `${title} · kappale ${pIndex + 1}/${Math.max(1, paragraphs.length)}`;
        }
    }

    function jumpToWritingParagraph() {
        const textEl = document.getElementById('writing-text');
        const jumpInput = document.getElementById('writing-paragraph-jump');
        if (!textEl || !jumpInput) return;
        const paragraphs = currentWritingParagraphs();
        const requested = Number.parseInt(jumpInput.value, 10);
        if (!Number.isFinite(requested) || requested < 1 || requested > paragraphs.length) {
            alert(`Anna kohdan numero väliltä 1-${paragraphs.length}.`);
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

    function cleanManuscriptText(text, options = {}) {
        const preserveStructure = options.preserveStructure === true;
        const lines = String(text || '')
            .replace(/\r\n?/g, '\n')
            .replace(/\u00a0/g, ' ')
            .replace(/\f/g, '\n\n')
            .replace(/<KAPPALE\d*>/gi, '')
            .replace(/\*\*/g, '')
            .replace(/__/g, '')
            .split('\n')
            .map(line => {
                let cleaned = line
                    .replace(/[ \t]+/g, ' ')
                    .replace(/^[ \t]*[-*_#=]{3,}[ \t]*$/, '')
                    .replace(/^[ \t]*(sivu|page)\s+\d+[ \t]*$/i, '')
                    .replace(/[\u200b-\u200f\u202a-\u202e]/g, '')
                    .trim();
                if (!preserveStructure) {
                    cleaned = cleaned
                        .replace(/^[ \t]*#{1,6}\s+/, '')
                        .replace(/^[ \t]*[-–—]?\s*\d+\s*[-–—]?[ \t]*$/, '')
                        .trim();
                }
                return cleaned;
            });

        const blocks = [];
        let current = [];
        const pushCurrent = () => {
            if (current.length) {
                blocks.push(current);
                current = [];
            }
        };
        lines.forEach(line => {
            if (!line) {
                pushCurrent();
                return;
            }
            if (preserveStructure && isExplicitStructureHeadingLine(line)) {
                pushCurrent();
                blocks.push([line]);
                return;
            }
            current.push(line);
        });
        pushCurrent();

        return blocks
            .map(block => block.join(' ').replace(/\s+([,.!?;:])/g, '$1').trim())
            .filter(Boolean)
            .join('\n\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    async function cleanCurrentWritingChapter() {
        const textEl = document.getElementById('writing-text');
        if (!textEl || !window.manuscriptData) {
            alert('Valitse tai lataa käsikirjoitus ensin.');
            return;
        }
        const cleaned = cleanManuscriptText(textEl.value, { preserveStructure: isProjectStructureCompleted(window.manuscriptData) });
        textEl.value = cleaned;
        writingSelection.pIndex = 0;
        await saveWritingText(false);
        renderWritingView();
        setWritingToolStatus('Raakateksti puhdistettu.');
    }

    async function restructureWritingManuscript() {
        if (!window.manuscriptData?.chapters?.length) {
            alert('Lataa tai valitse käsikirjoitus ensin.');
            return;
        }
        await saveWritingText(false);
        const repairedChapters = repairMisplacedStructureHeadings(window.manuscriptData.chapters);
        const sourceText = cleanManuscriptText(getFullManuscriptText({ ...window.manuscriptData, chapters: repairedChapters }), { preserveStructure: true });
        if (!sourceText) {
            alert('Käsikirjoituksesta ei löytynyt jaoteltavaa tekstiä.');
            return;
        }
        const chapters = sanitizeChaptersForTextStorage(parseRestructuredChapters(sourceText, '', { useFallbackTitle: false }));
        const paragraphCount = chapters.reduce((sum, chapter) => sum + (chapter.paragraphs || []).length, 0);
        const saveNew = confirm(`Uusi jako näyttää sisältävän ${chapters.length} lukua ja ${paragraphCount} tekstikohtaa.\n\nTallennetaanko uusi rakenne?`);
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
        setWritingToolStatus('Uusi rakenne tallennettu.');
    }

    function renderWritingView() {
        const titleEl = document.getElementById('writing-selection-title');
        const textEl = document.getElementById('writing-text');
        if (!titleEl || !textEl) return;

        if (!window.manuscriptData || !Array.isArray(window.manuscriptData.chapters) || window.manuscriptData.chapters.length === 0) {
            titleEl.textContent = 'Ei käsikirjoitusta';
            textEl.value = '';
            updateWritingPositionStatus();
            return;
        }

        const chapterIndex = currentWritingChapterIndex();
        const chapter = window.manuscriptData.chapters[chapterIndex];
        const chapterTitle = chapter ? structureDisplayTitle(chapter, chapterIndex) : 'Osio';
        titleEl.textContent = chapterTitle;
        const nextText = writingTextForCurrentChapter();
        const renderKey = [
            window.manuscriptData.id || window.manuscriptData.title || 'local',
            chapterIndex,
            window.manuscriptData.chapters.length,
            showManuscriptMarkup ? 'markup' : 'plain',
            chapter?.title || '',
            chapter?.toc_title || '',
            chapter?.paragraphs?.length || 0,
            isProjectStructureCompleted(window.manuscriptData) ? 'structured' : 'draft'
        ].join(':');
        if (textEl.dataset.writingRenderKey !== renderKey || document.activeElement !== textEl) {
            textEl.value = nextText;
            textEl.dataset.writingRenderKey = renderKey;
        }
        const statusEl = document.getElementById('writing-chapter-status');
        if (statusEl) statusEl.textContent = `Osio ${chapterIndex + 1}/${window.manuscriptData.chapters.length}`;
        const prevBtn = document.getElementById('writing-prev-chapter-btn');
        const nextBtn = document.getElementById('writing-next-chapter-btn');
        if (prevBtn) prevBtn.disabled = nextWritingChapterIndex(-1) === chapterIndex;
        if (nextBtn) nextBtn.disabled = nextWritingChapterIndex(1) === chapterIndex;
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
                alert('Tekstiä ei saatu tallennettua tietokantaan. Paikallinen luonnos on tallessa, mutta kokeile tallennusta uudelleen.');
            } else {
                alert('Teksti tallennettu.');
            }
        }
    }

    function nextWritingChapterIndex(direction) {
        const chapters = window.manuscriptData?.chapters || [];
        if (!chapters.length) return 0;
        const current = currentWritingChapterIndex();
        const step = direction < 0 ? -1 : 1;
        let index = current + step;
        while (index >= 0 && index < chapters.length) {
            if (structureChapterHasText(chapters[index]) || isBodyTextStructureKind(structureChapterKind(chapters[index]))) {
                return index;
            }
            index += step;
        }
        return current;
    }

    async function moveWritingChapter(direction) {
        if (!window.manuscriptData?.chapters?.length) return;
        await saveWritingText(false);
        const nextIndex = nextWritingChapterIndex(direction);
        if (nextIndex === writingSelection.cIndex) return;
        writingSelection = { cIndex: nextIndex, pIndex: 0 };
        window.currentEditSelection = { cIndex: nextIndex, pIndex: 0 };
        const textEl = document.getElementById('writing-text');
        if (textEl) delete textEl.dataset.writingRenderKey;
        renderWritingView();
        if (textEl) {
            textEl.focus();
            textEl.setSelectionRange(0, 0);
        }
    }

	    function normalizeWriterStage(stage) {
	        if (writerStageConfig[stage]) return stage;
	        return writerStageLegacyMap[stage] || 'writing';
	    }

	    function currentWriterStage() {
	        const stage = normalizeWriterStage(window.manuscriptData?.analysis?.writer_stage || 'writing');
	        return writerStageConfig[stage] ? stage : 'writing';
	    }

	    function writerStageProgressState() {
	        if (!window.manuscriptData) return {};
	        window.manuscriptData.analysis = window.manuscriptData.analysis || {};
	        if (!window.manuscriptData.analysis.writer_stage_progress || typeof window.manuscriptData.analysis.writer_stage_progress !== 'object') {
	            window.manuscriptData.analysis.writer_stage_progress = {};
	        }
	        return window.manuscriptData.analysis.writer_stage_progress;
	    }

	    function writerDeskParagraphEntries(data = window.manuscriptData) {
	        const chapters = Array.isArray(data?.chapters) ? data.chapters : [];
	        const entries = [];
	        chapters.forEach((chapter, cIndex) => {
	            const paragraphs = Array.isArray(chapter.paragraphs) && chapter.paragraphs.length ? chapter.paragraphs : [''];
	            paragraphs.forEach((paragraph, pIndex) => {
	                entries.push({ cIndex, pIndex, paragraph });
	            });
	        });
	        return entries;
	    }

	    function writerDeskGlobalIndex(selection = writerDeskSelection) {
	        const entries = writerDeskParagraphEntries();
	        const index = entries.findIndex(entry => entry.cIndex === selection.cIndex && entry.pIndex === selection.pIndex);
	        return index >= 0 ? index : 0;
	    }

	    function rememberWriterStageSelection(stage = currentWriterStage(), options = {}) {
	        if (!window.manuscriptData) return;
	        const progress = writerStageProgressState();
	        progress[stage] = {
	            cIndex: Number.isInteger(writerDeskSelection.cIndex) ? writerDeskSelection.cIndex : 0,
	            pIndex: Number.isInteger(writerDeskSelection.pIndex) ? writerDeskSelection.pIndex : 0
	        };
	        if (options.markDraft !== false) {
	            markLocalManuscriptDraft(window.manuscriptData);
	        }
	    }

	    function restoreWriterStageSelection(stage = currentWriterStage(), options = {}) {
	        if (!window.manuscriptData?.chapters?.length) return;
	        const saved = writerStageProgressState()[stage];
	        if (saved && window.manuscriptData.chapters[saved.cIndex]) {
	            const paragraphs = window.manuscriptData.chapters[saved.cIndex].paragraphs || [];
	            writerDeskSelection = {
	                cIndex: saved.cIndex,
	                pIndex: Math.min(Math.max(saved.pIndex || 0, 0), Math.max(0, paragraphs.length - 1))
	            };
	        } else if (options.resetIfMissing) {
	            writerDeskSelection = {
	                cIndex: firstBodyChapterIndex(window.manuscriptData.chapters),
	                pIndex: 0
	            };
	        }
	    }

	    function writerDeskProgressPercent(stage = currentWriterStage()) {
	        if (!window.manuscriptData) return 0;
	        const entries = writerDeskParagraphEntries();
	        if (!entries.length) return 0;
	        const saved = writerStageProgressState()[stage];
	        const selection = saved && window.manuscriptData.chapters?.[saved.cIndex]
	            ? saved
	            : writerDeskSelection;
	        const index = writerDeskGlobalIndex(selection);
	        return Math.max(0, Math.min(100, Math.round(((index + 1) / entries.length) * 100)));
	    }

	    async function setWriterStage(stage) {
	        stage = normalizeWriterStage(stage);
	        if (!writerStageConfig[stage]) return;
	        if (!window.manuscriptData) {
	            setWriterDeskToolStatus('Valitse käsikirjoitus ennen työvaiheen vaihtoa.');
	            return;
	        }
	        rememberWriterStageSelection();
	        window.manuscriptData.analysis = window.manuscriptData.analysis || {};
	        window.manuscriptData.analysis.writer_stage = stage;
	        restoreWriterStageSelection(stage, { resetIfMissing: true });
	        markLocalManuscriptDraft(window.manuscriptData);
	        renderWriterDeskView();
	        await window.saveManuscriptToDB(window.manuscriptData);
	        updateSaveTimestamp('writer-desk-save-status', Boolean(window.manuscriptData._db_sync_pending));
	    }

	    function renderWriterStage() {
	        const stage = currentWriterStage();
	        const config = writerStageConfig[stage] || writerStageConfig.writing;
	        const currentEl = document.getElementById('writer-stage-current');
	        const progressPercentEl = document.getElementById('writer-stage-progress-percent');
	        const progressBarEl = document.getElementById('writer-stage-progress-bar');
	        if (currentEl) currentEl.textContent = config.label;
	        const percent = writerDeskProgressPercent(stage);
	        if (progressPercentEl) progressPercentEl.textContent = `${percent}%`;
	        if (progressBarEl) progressBarEl.style.width = `${percent}%`;
	        document.querySelectorAll('[data-writer-stage]').forEach(button => {
	            const active = button.dataset.writerStage === stage;
	            button.classList.toggle('active', active);
	            button.disabled = !window.manuscriptData;
	        });
	    }

	    function renderWriterAssistantActionChips(actions = []) {
	        const container = document.getElementById('writer-assistant-quick-actions');
	        const select = document.getElementById('writer-assistant-action');
	        if (!container || !select) return;
	        const selected = select.value;
	        const visibleActions = actions.slice(0, Math.min(actions.length, 3));
	        container.innerHTML = '';
	        visibleActions.forEach(action => {
	            const button = document.createElement('button');
	            button.type = 'button';
	            button.className = 'writer-action-chip';
	            button.dataset.writerAssistantAction = action.value;
	            button.textContent = action.label;
	            button.classList.toggle('active', action.value === selected);
	            button.addEventListener('click', () => {
	                select.value = action.value;
	                writerDeskAssistantDraftKind = '';
	                document.querySelector('.writer-action-more')?.removeAttribute('open');
	                document.getElementById('writer-assistant-apply-btn')?.setAttribute('disabled', 'disabled');
	                setWriterAssistantStatus('');
	                renderWriterAssistantActionChips(actions);
	            });
	            container.appendChild(button);
	        });
	    }

	    function renderWriterAssistantActions() {
	        const select = document.getElementById('writer-assistant-action');
	        const promptEl = document.getElementById('writer-assistant-prompt');
	        const outputEl = document.getElementById('writer-assistant-output');
	        const commandLabelEl = document.getElementById('writer-command-stage-label');
	        if (!select) return;
	        const previous = select.value;
	        const stage = currentWriterStage();
	        const config = writerStageConfig[stage] || writerStageConfig.writing;
	        const actions = writerAssistantActionsByStage[stage] || writerAssistantActionsByStage.writing;
	        select.innerHTML = actions.map(action => `<option value="${escapeHtml(action.value)}">${escapeHtml(action.label)}</option>`).join('');
	        select.value = actions.some(action => action.value === previous) ? previous : actions[0].value;
	        if (commandLabelEl) commandLabelEl.textContent = `${config.label}:`;
	        renderWriterAssistantActionChips(actions);
	        const placeholderByStage = {
	            writing: 'Esimerkiksi: lisää tunnetta, keksi jatko, tee kohdasta kiinnostavampi.',
	            editing: 'Esimerkiksi: selkeytä mutta säilytä ääni, vähennä toistoa, vahvista rytmiä.',
	            finishing: 'Esimerkiksi: korjaa vain selvät virheet, tiivistä varovasti, tarkista sujuvuus.',
	            layout: 'Esimerkiksi: huomioi A5-taitto, tee sisällysluettelo, tarkista otsikkotaso.'
	        };
	        if (promptEl) promptEl.placeholder = placeholderByStage[stage] || placeholderByStage.writing;
	        if (outputEl && !outputEl.value.trim()) {
	            outputEl.placeholder = stage === 'layout'
	                ? 'Taitto- tai oheisaineistoehdotus näkyy tässä.'
	                : 'Avustajan yksi ehdotus näkyy tässä.';
	        }
	    }

    function setWriterDeskToolStatus(message) {
        const statusEl = document.getElementById('writer-desk-tool-status');
        if (statusEl) statusEl.textContent = message || '';
    }

    function setWriterDeskStructureVisible(visible, options = {}) {
        writerDeskStructureVisible = Boolean(visible);
        localStorage.setItem(WRITER_DESK_STRUCTURE_VISIBLE_KEY, String(writerDeskStructureVisible));
        updateWriterDeskStructureVisibility();
        if (options.scrollIntoView && writerDeskStructureVisible) {
            const panel = document.getElementById('writer-desk-structure-panel');
            window.requestAnimationFrame(() => panel?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        }
    }

    function toggleWriterDeskStructure() {
        document.querySelector('.writer-desk-more-menu')?.removeAttribute('open');
        setWriterDeskStructureVisible(!writerDeskStructureVisible, { scrollIntoView: true });
    }

    function updateWriterDeskStructureVisibility() {
        const workspace = document.querySelector('#view-tyopoyta .writer-desk-workspace');
        const panel = document.getElementById('writer-desk-structure-panel');
        const toggleBtn = document.getElementById('writer-desk-toggle-structure-btn');
        const mobileJumpBtn = document.querySelector('[data-writer-scroll="writer-desk-structure-panel"]');
        if (workspace) workspace.classList.toggle('structure-hidden', !writerDeskStructureVisible);
        if (panel) panel.classList.toggle('hidden', !writerDeskStructureVisible);
        if (toggleBtn) toggleBtn.textContent = writerDeskStructureVisible ? 'Piilota luvut' : 'Näytä luvut';
        if (mobileJumpBtn) mobileJumpBtn.textContent = writerDeskStructureVisible ? 'Luvut' : 'Näytä luvut';
    }

    function setWriterAssistantStatus(message, isError = false) {
        const statusEl = document.getElementById('writer-assistant-status');
        if (!statusEl) return;
        statusEl.textContent = message || '';
        statusEl.style.color = isError ? '#f87171' : '';
    }

    function syncWriterDeskEditorToManuscript() {
        const textEl = document.getElementById('writer-desk-text');
        if (!textEl || !window.manuscriptData) return false;
        const chapter = window.manuscriptData.chapters?.[writerDeskSelection.cIndex];
        if (!chapter) return false;
        applyParsedChapterText(chapter, textEl.value);
        writerDeskSelection.pIndex = Math.min(writerDeskSelection.pIndex || 0, chapter.paragraphs.length - 1);
        markLocalManuscriptDraft(window.manuscriptData);
        return true;
    }

    function currentWriterDeskParagraphs() {
        const textEl = document.getElementById('writer-desk-text');
        const text = textEl ? textEl.value : '';
        const chapter = window.manuscriptData?.chapters?.[writerDeskSelection.cIndex] || {};
        const parsed = parseChapterEditorText(chapter, text);
        return parsed.paragraphs.length ? parsed.paragraphs : [''];
    }

	    function updateWriterDeskPositionStatus() {
	        const jumpInput = document.getElementById('writer-desk-paragraph-jump');
	        const statusEl = document.getElementById('writer-desk-position-status');
	        const sectionStatusEl = document.getElementById('writer-desk-section-status');
	        const chapter = window.manuscriptData?.chapters?.[writerDeskSelection.cIndex];
	        const chapters = window.manuscriptData?.chapters || [];
	        const paragraphs = currentWriterDeskParagraphs();
	        const pIndex = Math.min(Math.max(writerDeskSelection.pIndex || 0, 0), Math.max(0, paragraphs.length - 1));
	        writerDeskSelection.pIndex = pIndex;
	        if (jumpInput) {
	            jumpInput.max = String(Math.max(1, paragraphs.length));
	            jumpInput.value = String(pIndex + 1);
	        }
	        const text = chapter
	            ? `Luku ${writerDeskSelection.cIndex + 1}/${chapters.length}: ${chapter.title || 'Nimetön luku'} · kappale ${pIndex + 1}/${Math.max(1, paragraphs.length)}`
	            : 'Valitse luku.';
	        if (statusEl) {
	            statusEl.textContent = text;
	        }
	        if (sectionStatusEl) sectionStatusEl.textContent = text;
	        rememberWriterStageSelection(currentWriterStage(), { markDraft: false });
	        renderWriterStage();
	    }

	    function updateWriterDeskPositionFromCursor() {
	        const textEl = document.getElementById('writer-desk-text');
	        if (!textEl || writerDeskSelection.cIndex === null || writerDeskSelection.cIndex === undefined) return;
        const paragraphs = currentWriterDeskParagraphs();
        writerDeskSelection.pIndex = Math.min(paragraphIndexAtOffset(textEl.value, textEl.selectionStart), paragraphs.length - 1);
        updateWriterDeskPositionStatus();
	        renderWriterDeskStructureOnly();
	    }

	    function focusWriterDeskParagraph(pIndex = writerDeskSelection.pIndex) {
	        const textEl = document.getElementById('writer-desk-text');
	        if (!textEl) return;
	        const paragraphs = currentWriterDeskParagraphs();
	        const nextIndex = Math.min(Math.max(pIndex || 0, 0), Math.max(0, paragraphs.length - 1));
	        const offset = paragraphOffsetByIndex(textEl.value, nextIndex);
	        writerDeskSelection.pIndex = nextIndex;
	        textEl.focus();
	        textEl.setSelectionRange(offset, offset);
	        const lineHeight = Number.parseFloat(window.getComputedStyle(textEl).lineHeight) || 28;
	        const before = textEl.value.slice(0, offset);
	        textEl.scrollTop = Math.max(0, before.split('\n').length * lineHeight - textEl.clientHeight / 3);
	        updateWriterDeskPositionStatus();
	        renderWriterDeskStructureOnly();
	    }

	    function jumpToWriterDeskParagraph() {
	        const textEl = document.getElementById('writer-desk-text');
	        const jumpInput = document.getElementById('writer-desk-paragraph-jump');
	        if (!textEl || !jumpInput) return;
	        const paragraphs = currentWriterDeskParagraphs();
        const requested = Number.parseInt(jumpInput.value, 10);
        if (!Number.isFinite(requested) || requested < 1 || requested > paragraphs.length) {
	            setWriterDeskToolStatus(`Anna kappalenumero väliltä 1-${paragraphs.length}.`);
	            return;
	        }
	        focusWriterDeskParagraph(requested - 1);
	    }

	    async function moveWriterDeskSection(delta) {
	        if (!window.manuscriptData?.chapters?.length) return;
	        syncWriterDeskEditorToManuscript();
	        const entries = writerDeskParagraphEntries();
	        if (!entries.length) return;
	        const current = writerDeskGlobalIndex();
	        const next = entries[Math.min(Math.max(current + delta, 0), entries.length - 1)];
	        if (!next) return;
	        writerDeskSelection = { cIndex: next.cIndex, pIndex: next.pIndex };
	        rememberWriterStageSelection();
	        renderWriterDeskView();
	        window.requestAnimationFrame(() => focusWriterDeskParagraph(next.pIndex));
	        window.saveManuscriptToDB(window.manuscriptData)
	            .then(() => updateSaveTimestamp('writer-desk-save-status', Boolean(window.manuscriptData?._db_sync_pending)));
	        setWriterDeskToolStatus('');
	    }

	    async function addWriterDeskSection() {
	        if (!window.manuscriptData?.chapters?.length) return;
	        syncWriterDeskEditorToManuscript();
	        const chapter = window.manuscriptData.chapters[writerDeskSelection.cIndex];
	        if (!chapter) return;
	        if (!Array.isArray(chapter.paragraphs)) chapter.paragraphs = [''];
	        const insertAt = Math.min(Math.max((writerDeskSelection.pIndex || 0) + 1, 0), chapter.paragraphs.length);
	        chapter.paragraphs.splice(insertAt, 0, '');
	        writerDeskSelection.pIndex = insertAt;
	        rememberWriterStageSelection();
	        await window.saveProjectChapterToDB(window.manuscriptData, writerDeskSelection.cIndex);
	        updateSaveTimestamp('writer-desk-save-status', Boolean(window.manuscriptData._db_sync_pending));
	        renderWriterDeskView();
	        window.requestAnimationFrame(() => focusWriterDeskParagraph(insertAt));
	        setWriterDeskToolStatus('Uusi kappale lisätty.');
	    }

	    function scheduleWriterDeskAutosave() {
	        if (!syncWriterDeskEditorToManuscript()) return;
	        renderWriterStage();
	        window.clearTimeout(writerDeskAutosaveTimer);
	        writerDeskAutosaveTimer = window.setTimeout(() => {
	            if (syncWriterDeskEditorToManuscript()) {
                window.saveProjectChapterToDB(window.manuscriptData, writerDeskSelection.cIndex)
                    .then(() => updateSaveTimestamp('writer-desk-save-status', Boolean(window.manuscriptData?._db_sync_pending)));
                renderBookOverview();
                renderWriterDeskAssistantContext();
            }
        }, 1200);
    }

    function renderWriterDeskStructureOnly() {
        const chapterList = document.getElementById('writer-desk-chapter-list');
        if (!chapterList) return;
        updateWriterDeskStructureVisibility();
	        renderChapterParagraphNav(chapterList, writerDeskSelection.cIndex, writerDeskSelection.pIndex, {
	            onChapterSelect: cIndex => {
	                saveWriterDeskText(false);
	                writerDeskSelection = { cIndex, pIndex: 0 };
	                rememberWriterStageSelection();
	                renderWriterDeskView();
	            },
	            onParagraphSelect: (cIndex, pIndex) => {
	                saveWriterDeskText(false);
	                writerDeskSelection = { cIndex, pIndex };
	                rememberWriterStageSelection();
	                renderWriterDeskView();
	            },
            onChapterRename: (cIndex, title) => {
                saveWriterDeskText(false);
                const chapter = window.manuscriptData?.chapters?.[cIndex];
                if (!chapter) return;
                chapter.title = title || `Luku ${cIndex + 1}`;
                window.saveProjectStructureToDB(window.manuscriptData);
                renderWriterDeskView();
                renderWritingView();
            }
        });
    }

	    function renderWriterDeskAssistantContext() {
	        const contextEl = document.getElementById('writer-assistant-context');
	        if (!contextEl) return;
	        const stage = currentWriterStage();
	        const config = writerStageConfig[stage] || writerStageConfig.writing;
	        const chapter = window.manuscriptData?.chapters?.[writerDeskSelection.cIndex];
	        const paragraphCount = Array.isArray(chapter?.paragraphs) ? chapter.paragraphs.length : 0;
	        const pIndex = Math.min(Math.max(writerDeskSelection.pIndex || 0, 0), Math.max(0, paragraphCount - 1));
	        contextEl.textContent = chapter
	            ? `${config.label}: ${config.assistantHint} Valittuna ${chapter.title || 'luku'}, kappale ${pIndex + 1}/${Math.max(1, paragraphCount)}.`
	            : 'Valitse käsikirjoitus ja luku, niin avustaja osaa rajata ehdotukset oikeaan kohtaan.';
	    }

    function renderWriterDeskView() {
        const titleEl = document.getElementById('writer-desk-selection-title');
        const textEl = document.getElementById('writer-desk-text');
        const currentProjectEl = document.getElementById('writer-desk-current-project');
        if (!titleEl || !textEl) return;

        renderWriterStage();
        renderWriterAssistantActions();
        updateWriterDeskStructureVisibility();
        if (!window.manuscriptData || !Array.isArray(window.manuscriptData.chapters) || window.manuscriptData.chapters.length === 0) {
            if (currentProjectEl) currentProjectEl.textContent = 'Valitse käsikirjoitus tai luo tyhjä dokumentti Käsikirjoitukseni-näkymässä.';
            titleEl.textContent = 'Ei käsikirjoitusta';
            textEl.value = '';
            renderChapterParagraphNav(document.getElementById('writer-desk-chapter-list'), null, null);
            updateWriterDeskPositionStatus();
            renderWriterDeskAssistantContext();
            return;
	        }

	        if (currentProjectEl) currentProjectEl.textContent = `Käsikirjoitus: ${window.manuscriptData.title || 'Nimetön'}`;
	        restoreWriterStageSelection();
	        if (writerDeskSelection.cIndex === null || !window.manuscriptData.chapters[writerDeskSelection.cIndex]) {
	            writerDeskSelection = { cIndex: firstBodyChapterIndex(window.manuscriptData.chapters), pIndex: 0 };
	        }
        const activeChapter = window.manuscriptData.chapters[writerDeskSelection.cIndex];
        if (!Array.isArray(activeChapter.paragraphs)) activeChapter.paragraphs = [];
        if (activeChapter.paragraphs.length === 0) activeChapter.paragraphs.push('');
        if (
            writerDeskSelection.pIndex === null ||
            writerDeskSelection.pIndex === undefined ||
            writerDeskSelection.pIndex < 0 ||
            writerDeskSelection.pIndex >= activeChapter.paragraphs.length
        ) {
            writerDeskSelection.pIndex = 0;
        }

	        renderWriterDeskStructureOnly();
	        titleEl.textContent = activeChapter.title || 'Nimetön luku';
        if (document.activeElement !== textEl) textEl.value = chapterTextForEditor(activeChapter, writerDeskSelection.cIndex);
        updateWriterDeskPositionStatus();
        updateMarkupButtons();
        renderWriterDeskAssistantContext();
    }

	    async function saveWriterDeskText(showStatus = true) {
	        window.clearTimeout(writerDeskAutosaveTimer);
	        if (!syncWriterDeskEditorToManuscript()) return;
	        await window.saveProjectChapterToDB(window.manuscriptData, writerDeskSelection.cIndex);
	        updateSaveTimestamp('writer-desk-save-status', Boolean(window.manuscriptData._db_sync_pending));
	        renderWriterStage();
	        renderBookOverview();
        renderWritingView();
        if (window.renderNavList) window.renderNavList();
        if (showStatus) {
            setWriterDeskToolStatus(window.manuscriptData._db_sync_pending
                ? 'Paikallinen luonnos on tallessa. Tietokantatallennus jäi odottamaan yhteyttä.'
                : 'Tallennettu.');
        }
    }

	    function writerAssistantPrompt(action, userPrompt, scope = {}) {
	        const stage = currentWriterStage();
	        const config = writerStageConfig[stage] || writerStageConfig.writing;
	        const analysis = window.manuscriptData?.analysis || {};
	        const style = truncateText(analysis.style || analysis.tyyli || '', 700);
	        const glossary = truncateText(analysis.glossary || analysis.sanasto || '', 700);
	        const sharedContext = [
	            `Työvaihe: ${config.label}.`,
	            `Valittu kohta: ${scope.chapterTitle || 'luku'}, kappale ${scope.paragraphNumber || 1}/${scope.paragraphTotal || 1}.`,
	            scope.previousParagraph ? `Edellinen kappale kontekstiksi: ${truncateText(scope.previousParagraph, 900)}` : '',
	            scope.nextParagraph ? `Seuraava kappale kontekstiksi: ${truncateText(scope.nextParagraph, 900)}` : '',
	            `Vaiheen ohje: ${config.assistantHint}`,
	            style ? `Tyylianalyysin tiivistelmä: ${style}` : '',
	            glossary ? `Sanaston tai termien tiivistelmä: ${glossary}` : '',
	            userPrompt ? `Käyttäjän tarkennus: ${userPrompt}` : ''
	        ].filter(Boolean).join('\n');
	        const actions = {
	            develop_section: 'Anna yksi konkreettinen kehitysehdotus tälle kappaleelle. Älä kirjoita koko lukua uudelleen.',
	            continue_section: 'Kirjoita yksi mahdollinen seuraava kappale, joka jatkaa nykyisestä kohdasta luontevasti. Palauta vain kappaleen teksti.',
	            next_step: 'Anna yksi paras seuraava työaskel tälle kappaleelle. Vastaa lyhyesti ja käytännöllisesti.',
	            rewrite_section: 'Muokkaa nykyinen kappale paremmaksi. Säilytä kirjailijan tyyli ja merkitys. Palauta vain valmis muokattu kappale ilman selityksiä.',
	            clarify_section: 'Selkeytä nykyinen kappale varovaisesti. Säilytä tyyli ja merkitys. Palauta vain valmis muokattu kappale ilman selityksiä.',
	            tighten_section: 'Tiivistä nykyinen kappale varovaisesti. Poista turha toisto, säilytä ääni. Palauta vain valmis muokattu kappale ilman selityksiä.',
	            proof_section: 'Oikolue nykyinen kappale. Korjaa vain selvät virheet ja sujuvuuden pienet ongelmat. Palauta vain valmis korjattu kappale ilman selityksiä.',
	            polish_section: 'Viimeistele nykyinen kappale julkaisuvalmiimmaksi varovaisesti. Palauta vain valmis kappale ilman selityksiä.',
	            production_checklist: 'Anna yksi tarkistettava viimeistelyhuomio tästä kappaleesta tuotantovalmiutta varten.',
	            layout_note: 'Anna yksi taittoon liittyvä huomio tästä kohdasta: otsikkotaso, kappalejako, typografia, sisällysluettelo tai taittoriski.'
	        };
	        return `${sharedContext}\n\nTehtävä: ${actions[action] || actions.next_step}`;
	    }

	    function writerAssistantActionReplacesText(action) {
	        return ['continue_section', 'rewrite_section', 'clarify_section', 'tighten_section', 'proof_section', 'polish_section'].includes(action);
	    }

    function isWriterProductionAction(action) {
        return ['misc_frontmatter', 'misc_toc', 'misc_indexes', 'layout_run'].includes(action);
    }

    function writerProductionToolsForAction(action) {
        if (action === 'misc_toc') return ['table_of_contents'];
        if (action === 'misc_indexes') return ['character_index', 'place_index', 'subject_index'];
        if (action === 'misc_frontmatter') return ['title_page', 'copyright_page', 'table_of_contents'];
        return [];
    }

    async function ensureWriterDeskProjectSaved(message = 'Tallennetaan nykyinen käsikirjoitus ennen tuotantotoimea...') {
        setWriterAssistantStatus(message);
        syncWriterDeskEditorToManuscript();
        const savedProject = await window.saveManuscriptToDB(window.manuscriptData);
        if (savedProject?.id) {
            window.manuscriptData = savedProject;
            const projectIndex = availableProjects.findIndex(project => String(project.id) === String(savedProject.id));
            if (projectIndex >= 0) availableProjects[projectIndex] = savedProject;
        }
        if (!window.manuscriptData?.id) throw new Error('Käsikirjoitusta ei saatu tallennettua ennen tuotantotoimea.');
        updateSaveTimestamp('writer-desk-save-status', Boolean(window.manuscriptData._db_sync_pending));
        return window.manuscriptData;
    }

    async function createWriterMiscAsset(tool, instructions = '') {
        const title = miscToolLabel(tool);
        setWriterAssistantStatus(`${title} työn alla...`);
        const res = await apiFetch('/api/misc-tools/run', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                project_id: window.manuscriptData.id,
                tool,
                title: window.manuscriptData.title || '',
                author: window.manuscriptData.author || '',
                chapters: window.manuscriptData.chapters || [],
                instructions
            })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.detail || `${title} epäonnistui.`);
        const content = data?.result || '';
        const saveRes = await apiFetch(`/api/projects/${window.manuscriptData.id}/misc-assets`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                title: data?.title || title,
                content,
                material_kind: tool,
                include_in_book: true
            })
        });
        const saved = await saveRes.json().catch(() => null);
        if (!saveRes.ok) throw new Error(saved?.detail || `${title} tallennus epäonnistui.`);
        return { tool, title: data?.title || title, content, generatedBy: data?.generated_by || '', warnings: data?.warnings || '' };
    }

    async function runWriterMiscProductionAction(action, instructions, outputEl) {
        await ensureWriterDeskProjectSaved();
        const tools = writerProductionToolsForAction(action);
        if (!tools.length) throw new Error('Tuotantotoimintoa ei tunnistettu.');
        const results = [];
        for (const tool of tools) {
            results.push(await createWriterMiscAsset(tool, instructions));
        }
        const assets = await loadMiscAssetsForActiveProject(true);
        renderBookOverview();
        renderWriterDeskView();
        const summary = results.map(item => {
            const warning = item.warnings ? `\nHuomio: ${item.warnings}` : '';
            return `## ${item.title}${warning}\n\n${item.content}`.trim();
        }).join('\n\n---\n\n');
        if (outputEl) outputEl.value = summary;
        const includedTitles = assets
            .filter(asset => asset.asset_type === 'book_misc_material')
            .map(asset => asset.title)
            .filter(Boolean);
        setWriterAssistantStatus(`${results.length} oheisaineistoa luotu ja lisätty valmiiseen kirjaan. Mukana nyt: ${includedTitles.slice(0, 5).join(', ')}${includedTitles.length > 5 ? '...' : ''}`);
        loadUsage();
    }

    async function runWriterLayoutProductionAction(outputEl) {
        await ensureWriterDeskProjectSaved('Tallennetaan nykyinen käsikirjoitus ennen taittoa...');
        setWriterAssistantStatus('Ajetaan taittoa ja e-kirjatiedostoja...');
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
        const assets = [data.pdf, data.epub, data.latex].filter(Boolean);
        renderLayoutAssets(assets);
        if (outputEl) {
            outputEl.value = [
                'Taitto ajettu ja tiedostot tallennettu Taitto-moduuliin.',
                '',
                ...assets.map(asset => `- ${layoutAssetLabel(asset)}: ${asset.title || layoutFileName(asset)}`)
            ].join('\n');
        }
        setWriterAssistantStatus('Taitto valmis. PDF, LaTeX ja EPUB löytyvät Taitto-moduulista.');
    }

    async function runWriterProductionAction(action, userPrompt, controls = {}) {
        const { outputEl, runBtn, applyBtn } = controls;
        if (runBtn) runBtn.disabled = true;
        if (applyBtn) applyBtn.disabled = true;
        writerDeskAssistantDraftKind = '';
        if (outputEl) outputEl.value = '';
        try {
            if (action === 'layout_run') {
                await runWriterLayoutProductionAction(outputEl);
            } else {
                await runWriterMiscProductionAction(action, userPrompt, outputEl);
            }
        } catch (err) {
            setWriterAssistantStatus(networkFailureMessage(err), true);
        } finally {
            if (runBtn) runBtn.disabled = false;
        }
    }

    async function runWriterAssistant() {
        if (!window.manuscriptData?.chapters?.length) {
            setWriterAssistantStatus('Valitse käsikirjoitus ensin.', true);
            return;
        }
        syncWriterDeskEditorToManuscript();
        const chapter = window.manuscriptData.chapters[writerDeskSelection.cIndex];
        if (!chapter) {
            setWriterAssistantStatus('Valitse luku ensin.', true);
            return;
        }
        const action = document.getElementById('writer-assistant-action')?.value || 'next';
        const userPrompt = document.getElementById('writer-assistant-prompt')?.value || '';
        const outputEl = document.getElementById('writer-assistant-output');
        const runBtn = document.getElementById('writer-assistant-run-btn');
        const applyBtn = document.getElementById('writer-assistant-apply-btn');
        if (isWriterProductionAction(action)) {
            await runWriterProductionAction(action, userPrompt, { outputEl, runBtn, applyBtn });
            return;
        }
	        const paragraphs = currentWriterDeskParagraphs();
	        const pIndex = Math.min(Math.max(writerDeskSelection.pIndex || 0, 0), Math.max(0, paragraphs.length - 1));
	        const sourceText = String(paragraphs[pIndex] || '');
	        if (!sourceText.trim()) {
	            if (action !== 'continue_section' && action !== 'develop_section' && action !== 'next_step') {
	                setWriterAssistantStatus('Valitussa kappaleessa ei ole vielä käsiteltävää tekstiä.', true);
	                return;
	            }
	        }
	        if (sourceText.length > 12000) {
	            setWriterAssistantStatus('Valittu kappale on yli 12 000 merkkiä. Jaa kohta pienemmäksi ennen avustajan käyttöä.', true);
	            return;
	        }

	        if (runBtn) runBtn.disabled = true;
	        if (applyBtn) applyBtn.disabled = true;
	        writerDeskAssistantDraftKind = '';
	        setWriterAssistantStatus('Avustaja käsittelee valittua kappaletta...');
	        if (outputEl) outputEl.value = '';
	        try {
	            const res = await apiFetch('/api/edit', {
	                method: 'POST',
	                headers: {'Content-Type': 'application/json'},
	                body: JSON.stringify({
	                    text: sourceText || '(tyhjä kappale)',
	                    temperature: ['develop_section', 'continue_section', 'next_step'].includes(action) ? 0.55 : 0.25,
	                    prompt: writerAssistantPrompt(action, userPrompt, {
	                        chapterTitle: chapter.title || `Luku ${writerDeskSelection.cIndex + 1}`,
	                        paragraphNumber: pIndex + 1,
	                        paragraphTotal: Math.max(1, paragraphs.length),
	                        previousParagraph: paragraphs[pIndex - 1] || '',
	                        nextParagraph: paragraphs[pIndex + 1] || ''
	                    })
	                })
	            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.detail || 'Avustajan pyyntö epäonnistui.');
            const responseText = data?.edited_text || data?.result || data?.text || '';
	            if (!responseText.trim()) throw new Error('Avustaja ei palauttanut tekstiä.');
	            if (outputEl) outputEl.value = responseText.trim();
	            writerDeskAssistantDraftKind = action;
	            if (applyBtn) applyBtn.disabled = false;
	            setWriterAssistantStatus(writerAssistantActionReplacesText(action)
	                ? 'Muokkausehdotus valmis. Hyväksy korvaa nykyisen kappaleen tai lisää jatkokappaleen.'
	                : 'Ehdotus valmis. Hyväksy merkitsee kohdan käsitellyksi ja siirtyy eteenpäin.');
	            loadUsage();
        } catch (err) {
            setWriterAssistantStatus(networkFailureMessage(err), true);
            loadUsage();
        } finally {
            if (runBtn) runBtn.disabled = false;
        }
    }

	    async function applyWriterAssistantDraft() {
	        const outputEl = document.getElementById('writer-assistant-output');
	        const nextText = outputEl?.value || '';
	        const chapter = window.manuscriptData?.chapters?.[writerDeskSelection.cIndex];
	        if (!chapter || !nextText.trim()) return;
	        const chapterIndex = writerDeskSelection.cIndex;
	        const paragraphIndex = Math.min(Math.max(writerDeskSelection.pIndex || 0, 0), Math.max(0, (chapter.paragraphs || []).length - 1));
	        const previous = JSON.parse(JSON.stringify(chapter));
	        const replacesText = writerAssistantActionReplacesText(writerDeskAssistantDraftKind);
	        if (!Array.isArray(chapter.paragraphs)) chapter.paragraphs = [''];
	        if (replacesText) {
	            if (writerDeskAssistantDraftKind === 'continue_section') {
	                chapter.paragraphs.splice(paragraphIndex + 1, 0, nextText.trim());
	                writerDeskSelection.pIndex = paragraphIndex + 1;
	            } else {
	                chapter.paragraphs[paragraphIndex] = nextText.trim();
	                writerDeskSelection.pIndex = paragraphIndex;
	            }
	        }
	        rememberWriterStageSelection();
	        if (outputEl) outputEl.value = '';
	        writerDeskAssistantDraftKind = '';
	        if (!replacesText) {
	            setWriterAssistantStatus('Kohta merkitty käsitellyksi.');
	            await moveWriterDeskSection(1);
	            return;
	        }
	        await window.saveProjectChapterToDB(window.manuscriptData, chapterIndex);
	        updateSaveTimestamp('writer-desk-save-status', Boolean(window.manuscriptData._db_sync_pending));
	        renderWriterDeskView();
	        renderWritingView();
	        renderBookOverview();
	        setWriterAssistantStatus('Ehdotus hyväksytty.');
	        showUndoToast('Avustajan ehdotus hyväksytty.', async () => {
	            window.manuscriptData.chapters[chapterIndex] = previous;
	            await window.saveProjectChapterToDB(window.manuscriptData, chapterIndex);
	            renderWriterDeskView();
	            renderWritingView();
	            renderBookOverview();
	            setWriterAssistantStatus('Muutos peruttu.');
	        });
	        await moveWriterDeskSection(1);
	    }

	    async function rejectWriterAssistantDraft() {
	        const outputEl = document.getElementById('writer-assistant-output');
	        if (outputEl) outputEl.value = '';
	        writerDeskAssistantDraftKind = '';
	        setWriterAssistantStatus('Ehdotus hylätty.');
	        await moveWriterDeskSection(1);
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

    function nextSectionTitle(kind = 'chapter') {
        const bodyCount = (window.manuscriptData?.chapters || [])
            .filter((chapter, index) => chapterPlacement(chapter, index) === 'body')
            .length;
        if (kind === 'part') {
            const partCount = (window.manuscriptData?.chapters || []).filter(chapter => structureChapterKind(chapter) === 'part').length;
            return `Osa ${partCount + 1}`;
        }
        if (kind === 'chapter') return `Luku ${bodyCount + 1}`;
        return STRUCTURE_KIND_TITLES[kind] || `Osio ${bodyCount + 1}`;
    }

    function structureKindFromUserType(value) {
        const text = String(value || '').toLocaleLowerCase('fi-FI').trim();
        if (!text) return 'chapter';
        const section = classifyBookSectionTitle(text);
        if (section?.kind) return section.kind;
        if (/(etusivu|alkuosa|front)/.test(text)) return 'front';
        if (/(lopputeksti|loppuosa|back)/.test(text)) return 'back';
        if (/(osa|part)/.test(text) && !/(osio|osiot)/.test(text)) return 'part';
        if (/(aliluku|väliotsikko|valiotsikko|subchapter)/.test(text)) return 'subchapter';
        if (/(prologi|prologue)/.test(text)) return 'prologue';
        if (/(epilogi|epilogue)/.test(text)) return 'epilogue';
        return 'chapter';
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
        const type = prompt('Uuden osion tyyppi: etusivu, osa, luku, aliluku, prologi, epilogi tai lopputeksti', 'luku');
        if (type === null) return;
        const kind = structureKindFromUserType(type);
        const title = prompt('Uuden osion nimi', nextSectionTitle(kind));
        if (title === null) return;
        const cleanTitle = title.trim() || nextSectionTitle(kind);
        const insertIndex = Math.min(Math.max(currentIndex + 1, 0), chapters.length);
        const newChapter = makeStructureMetaRow(kind, cleanTitle, Date.now());
        if (isBodyTextStructureKind(kind)) {
            newChapter.title = cleanTitle;
            newChapter.paragraphs = [''];
        }
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
            alert('Viimeistä osiota ei voi poistaa.');
            return;
        }
        const currentIndex = source === 'editor'
            ? (window.currentEditSelection?.cIndex ?? firstBodyChapterIndex(chapters))
            : (writingSelection.cIndex ?? firstBodyChapterIndex(chapters));
        const chapter = chapters[currentIndex];
        if (!chapter) return;
        const removedChapter = JSON.parse(JSON.stringify(chapter));
        const removedTitle = structureDisplayTitle(chapter, currentIndex) || `Osio ${currentIndex + 1}`;
        chapters.splice(currentIndex, 1);
        const nextIndex = Math.min(currentIndex, chapters.length - 1);
        writingSelection = { cIndex: nextIndex, pIndex: 0 };
        window.currentEditSelection = { cIndex: nextIndex, pIndex: 0 };
        await window.saveProjectStructureToDB(window.manuscriptData);
        renderBookOverview();
        if (window.renderNavList) window.renderNavList();
        renderWritingView();
        if (window.loadParagraph) window.loadParagraph(nextIndex, 0, null);
        showUndoToast(`Osio "${removedTitle}" poistettu.`, async () => {
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

    function navViewFor(viewId) {
        if (viewId === 'view-rakenne') return 'view-analyysi';
        if (viewId === 'view-taitto') return 'view-kirja';
        return viewId;
    }

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

    function setBookTab(panelId = 'book-preview-tab') {
        document.querySelectorAll('.book-tab').forEach(button => {
            button.classList.toggle('active', button.dataset.bookPanel === panelId);
        });
        document.querySelectorAll('.book-tab-panel').forEach(panel => {
            panel.classList.toggle('hidden', panel.id !== panelId);
        });
        if (panelId === 'book-layout-tab') {
            loadLayoutAssets();
        } else {
            renderBookOverview();
        }
    }

    function openModule(viewId) {
        const requestedViewId = viewId;
        if (viewId === 'view-taitto') {
            viewId = 'view-kirja';
        }
        if (!isViewAllowed(viewId)) {
            viewId = defaultViewForUser();
        }
        currentViewId = viewId;

        views.forEach(v => v.classList.add('hidden'));
        const targetView = document.getElementById(viewId);
        if(targetView) targetView.classList.remove('hidden');

        navItems.forEach(item => {
            if(item.getAttribute('data-view') === navViewFor(viewId)) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
        if (viewId === 'view-kirja') {
            setBookTab(requestedViewId === 'view-taitto' ? 'book-layout-tab' : 'book-preview-tab');
        }
    }

    function persistPendingModuleEdits(nextViewId) {
        if (currentViewId === 'view-kirjoita' && nextViewId !== 'view-kirjoita') {
            saveWritingText(false);
        }
        if (currentViewId === 'view-tyopoyta' && nextViewId !== 'view-tyopoyta') {
            saveWriterDeskText(false);
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
            if (nextViewId === 'view-julkaise') {
                renderPublishView();
            }
            if (nextViewId === 'view-kirjoita') {
                renderWritingView();
            }
            if (nextViewId === 'view-rakenne') {
                renderStructureModule();
            }
            if (nextViewId === 'view-tyopoyta') {
                renderWriterDeskView();
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
            if (nextViewId === 'view-suomentaja') {
                loadTranslationModels();
                updateFinnishTranslationProjectSelect();
                updateFinnishTranslationEstimate();
            }
            if (nextViewId === 'view-muut-toiminnot') {
                loadMiscModels();
                updateMiscProjectSelect();
                loadMiscAssetsForActiveProject();
            }
            if (nextViewId === 'view-elamakerta') {
                refreshElamakertaFrame();
            }
            if (nextViewId === 'view-kuvitus') {
                loadImageModels();
                loadCoverImages();
            }
            if (nextViewId === 'view-tuotetiedot') {
                renderProductInfo();
            }
            if (nextViewId === 'view-markkinointi') {
                renderMarketingMaterialsFromAnalysis(false);
            }
            if (nextViewId === 'view-audio') {
                renderAudioView();
            }
            if (nextViewId === 'view-taitto') {
                loadLayoutAssets();
            }
            if (nextViewId === 'view-ai-tyonkulku') {
                renderWorkflowView();
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
    const openStructureFromAnalysisBtn = document.getElementById('open-structure-from-analysis-btn');
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
    if (openStructureFromAnalysisBtn) {
        openStructureFromAnalysisBtn.addEventListener('click', () => {
            openModule('view-rakenne');
            renderStructureModule();
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

    function splitIntoStructureBlocks(text) {
        const blocks = [];
        let current = [];
        const pushCurrent = () => {
            if (!current.length) return;
            const block = current.join(' ').replace(/\s+([,.!?;:])/g, '$1').trim();
            if (block) blocks.push(block);
            current = [];
        };
        String(text || '')
            .replace(/\r\n?/g, '\n')
            .replace(/\u00a0/g, ' ')
            .split('\n')
            .forEach(rawLine => {
                const line = rawLine.replace(/[ \t]+/g, ' ').trim();
                if (!line) {
                    pushCurrent();
                    return;
                }
                if (isExplicitStructureHeadingLine(line)) {
                    pushCurrent();
                    blocks.push(line);
                    return;
                }
                current.push(line);
            });
        pushCurrent();
        return blocks;
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

    function stripHeadingLine(value) {
        return String(value || '').replace(/^#{1,6}\s+/, '').trim();
    }

    function normalizedHeadingLine(value) {
        return stripHeadingLine(value).replace(/\s+/g, ' ').trim();
    }

    function isTableOfContentsHeading(value) {
        const lower = normalizedHeadingLine(value).toLocaleLowerCase('fi-FI');
        return ['sisällys', 'sisallys', 'sisällysluettelo', 'sisallysluettelo', 'table of contents', 'toc'].includes(lower);
    }

    function isLikelyTableOfContentsEntry(value) {
        const text = normalizedHeadingLine(value);
        if (!text) return false;
        if (/\.{2,}\s*\d{1,4}$/.test(text)) return true;
        if (/^(luku|chapter|osa|part)\b.+\s+\d{1,4}$/i.test(text)) return true;
        if (/^\d+(\.\d+)*\.?\s+.{2,90}\s+\d{1,4}$/.test(text)) return true;
        return false;
    }

    function isPartHeadingTitle(value) {
        return classifyBookSectionTitle(value)?.kind === 'part';
    }

    function isChapterHeadingTitle(value) {
        const kind = classifyBookSectionTitle(value)?.kind;
        return ['chapter', 'prologue', 'epilogue'].includes(kind);
    }

    function isSubchapterHeadingTitle(value) {
        return classifyBookSectionTitle(value)?.kind === 'subchapter';
    }

    function isGenericNumberedHeading(value) {
        return /^(luku|chapter|osa|part)\s+([\divxlcdm]+|[a-zåäö]+)\.?$/i.test(normalizedHeadingLine(value));
    }

    function isExplicitStructureHeadingLine(value) {
        const raw = String(value || '').trim();
        const title = normalizedHeadingLine(raw);
        if (!title) return false;
        if (isBookSectionHeadingLine(raw)) return true;
        if (/^#{1,6}\s+\S/.test(raw)) return true;
        if (isTableOfContentsHeading(title) || isSubchapterHeadingTitle(title)) return true;
        const numberWords = 'yksi|yhden|kaksi|kahden|kolme|kolmen|neljä|neljan|neljän|viisi|viiden|kuusi|kuuden|seitsemän|seitseman|kahdeksan|yhdeksän|yhdeksan|kymmenen|yksitoista|kaksitoista';
        const ordinalWords = 'ensimmäinen|toinen|kolmas|neljäs|viides|kuudes|seitsemäs|kahdeksas|yhdeksäs|kymmenes';
        const numberToken = `(?:\\d+|[ivxlcdm]+|${numberWords}|${ordinalWords})`;
        if (new RegExp(`^(?:luku|chapter)\\s+${numberToken}\\b`, 'i').test(title)) return true;
        if (new RegExp(`^(?:osa|part)\\s+${numberToken}\\b`, 'i').test(title)) return true;
        if (new RegExp(`^(?:${ordinalWords})\\s+osa\\b`, 'i').test(title)) return true;
        if (/^[ivxlcdm]+\.?\s+osa\b/i.test(title)) return true;
        return /^(\d+|[ivxlcdm]+)\.\s+\S.{0,90}$/i.test(title) && !/[.!?]$/.test(title);
    }

    function isLikelyImplicitHeading(value, index, blocks, currentChapter, options = {}) {
        if (!options.allowImplicitHeadings) return false;
        const title = normalizedHeadingLine(value);
        if (!title || title.length < 3 || title.length > 90) return false;
        if (/[.!?;:]$/.test(title) || /^["“”'’]/.test(title)) return false;
        if ((title.match(/\s+/g) || []).length > 8) return false;
        if (!blocks[index + 1]) return false;
        if (!currentChapter?.paragraphs?.length) return false;
        const minParagraphs = options.allowAfterOneParagraph ? 1 : 2;
        if (currentChapter.paragraphs.length < minParagraphs) return false;
        return true;
    }

    function classifyRestructureHeading(value, index, blocks, currentChapter) {
        const raw = String(value || '').trim();
        const title = normalizedHeadingLine(raw);
        if (!title) return null;
        const markdown = raw.match(/^(#{1,6})\s+(.+)$/);
        const section = classifyBookSectionTitle(title);
        if (section?.kind === 'table_of_contents') return { kind: 'toc', title };
        if (section?.placement === 'front') return { kind: section.kind || 'front', title };
        if (section?.placement === 'back') return { kind: section.kind || 'back', title };
        if (['prologue', 'epilogue'].includes(section?.kind)) return { kind: section.kind, title };
        if (markdown) {
            const level = markdown[1].length;
            const markdownTitle = normalizedHeadingLine(markdown[2]);
            const markdownSection = classifyBookSectionTitle(markdownTitle);
            if (markdownSection?.kind === 'table_of_contents') return { kind: 'toc', title: markdownTitle };
            if (markdownSection?.placement === 'front') return { kind: markdownSection.kind || 'front', title: markdownTitle };
            if (markdownSection?.placement === 'back') return { kind: markdownSection.kind || 'back', title: markdownTitle };
            if (markdownSection?.kind === 'part') return { kind: 'part', title: markdownTitle };
            if (markdownSection?.kind === 'subchapter') return { kind: 'subchapter', title: markdownTitle };
            if (['prologue', 'epilogue'].includes(markdownSection?.kind)) return { kind: markdownSection.kind, title: markdownTitle };
            return { kind: level >= 3 ? 'subchapter' : 'chapter', title: markdownTitle || title };
        }
        if (isPartHeadingTitle(title)) return { kind: 'part', title };
        if (isSubchapterHeadingTitle(title)) return { kind: 'subchapter', title };
        if (isChapterHeadingTitle(title)) return { kind: 'chapter', title };
        if (isLikelyImplicitHeading(title, index, blocks, currentChapter, { allowImplicitHeadings: false })) return { kind: 'chapter', title };
        return null;
    }

    function chapterHasContent(chapter) {
        if (!chapter) return false;
        if (/^osa_/.test(String(chapter.id || ''))) return true;
        if (/^(alku|loppu)_/.test(String(chapter.id || ''))) return true;
        const section = classifyBookSectionTitle(structureDisplayTitle(chapter));
        if (section?.placement === 'front' || section?.placement === 'back' || section?.kind === 'part') return true;
        return (chapter.paragraphs || []).some(paragraph => String(paragraph || '').trim());
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
                alert('Valitse osio ensin.');
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

    function parseRestructuredChapters(text, fallbackTitle, options = {}) {
        const skipTableOfContents = options.skipTableOfContents !== false;
        const useFallbackTitle = options.useFallbackTitle !== false;
        const resolvedFallbackTitle = useFallbackTitle
            ? (String(fallbackTitle || '').trim() || 'Käsikirjoitus')
            : '';
        const blocks = splitIntoStructureBlocks(text);
        const chapters = [];
        let currentChapter = {
            id: 'luku_1',
            title: resolvedFallbackTitle,
            paragraphs: []
        };
        let chapterCount = 0;
        let partCount = 0;
        let subchapterCount = 0;
        let skippingToc = false;

        const pushCurrent = () => {
            if (chapterHasContent(currentChapter)) chapters.push(currentChapter);
        };
        const startSection = (kind, title) => {
            pushCurrent();
            const placement = structureKindPlacement(kind);
            if (kind === 'part') {
                partCount++;
                currentChapter = { id: `osa_${partCount}`, title, paragraphs: [] };
                return;
            }
            if (kind === 'subchapter') {
                subchapterCount++;
                currentChapter = { id: `aliluku_${subchapterCount}`, title, paragraphs: [] };
                return;
            }
            if (placement === 'front') {
                const prefix = STRUCTURE_KIND_PREFIXES[kind] || 'alku';
                currentChapter = { id: `${prefix}_${chapters.length + 1}`, title, paragraphs: [] };
                return;
            }
            if (placement === 'back') {
                const prefix = STRUCTURE_KIND_PREFIXES[kind] || 'loppu';
                currentChapter = { id: `${prefix}_${chapters.length + 1}`, title, paragraphs: [] };
                return;
            }
            if (kind === 'prologue' || kind === 'epilogue') {
                const prefix = STRUCTURE_KIND_PREFIXES[kind] || 'luku';
                currentChapter = { id: `${prefix}_${chapters.length + 1}`, title, paragraphs: [] };
                return;
            }
            chapterCount++;
            currentChapter = { id: `luku_${chapterCount}`, title, paragraphs: [] };
        };

        blocks.forEach((block, index) => {
            let heading = classifyRestructureHeading(block, index, blocks, currentChapter);
            if (skippingToc) {
                if (!heading && isLikelyTableOfContentsEntry(block)) return;
                skippingToc = false;
                if (!heading) {
                    currentChapter.paragraphs.push(block);
                    return;
                }
            }
            if (heading?.kind === 'toc') {
                if (skipTableOfContents) {
                    skippingToc = true;
                    return;
                }
                startSection('front', heading.title);
                return;
            }
            if (heading) {
                startSection(heading.kind, heading.title);
                return;
            }
            currentChapter.paragraphs.push(block);
        });

        pushCurrent();
        if (chapters.length) return cleanupGeneratedPlaceholderChapters({
            title: resolvedFallbackTitle || String(fallbackTitle || '').trim() || 'Käsikirjoitus',
            chapters
        }).chapters;
        return [{
            id: `luku_${Date.now()}`,
            title: resolvedFallbackTitle || (useFallbackTitle ? 'Uusi luku' : ''),
            paragraphs: blocks
        }];
    }

    function extractedStandaloneStructureHeading(value) {
        const text = String(value || '').replace(/\s+/g, ' ').trim();
        if (!text || text.length > 160) return '';
        return isExplicitStructureHeadingLine(text) ? normalizedHeadingLine(text) : '';
    }

    function comparableStructureHeading(value) {
        return normalizedHeadingLine(value)
            .replace(/[.:;,\-–—]+$/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLocaleLowerCase('fi-FI');
    }

    function sanitizeChapterTextParagraphs(chapter, index = 0) {
        const next = {
            ...chapter,
            paragraphs: Array.isArray(chapter?.paragraphs) ? [...chapter.paragraphs] : []
        };
        const titleCandidates = new Set([
            chapter?.title,
            chapter?.toc_title,
            chapter?.tocTitle,
            chapter?.structure_title,
            structureDisplayTitle(chapter, index)
        ].map(comparableStructureHeading).filter(Boolean));

        while (next.paragraphs.length) {
            const raw = String(next.paragraphs[0] || '').trim();
            const markdown = raw.match(/^#{1,6}\s+(.+)$/);
            const heading = extractedStandaloneStructureHeading(raw) || (markdown ? normalizedHeadingLine(markdown[1]) : '');
            if (!heading) break;
            const comparable = comparableStructureHeading(heading);
            const isOwnHeading = titleCandidates.has(comparable);
            const isBookStructureHeading = Boolean(classifyBookSectionTitle(heading));
            if (!isOwnHeading && !isBookStructureHeading) break;
            if (!explicitChapterTitle(next)) applyDetectedHeadingToChapter(next, heading);
            next.paragraphs.shift();
        }
        return next;
    }

    function sanitizeChaptersForTextStorage(chapters) {
        return (chapters || []).map((chapter, index) => sanitizeChapterTextParagraphs(chapter, index));
    }

    function extractTrailingStructureHeading(value) {
        const text = String(value || '').replace(/\s+/g, ' ').trim();
        if (!text || text.length < 8) return null;
        const headingPattern = /\b(?:LUKU|Luku|CHAPTER|Chapter|OSA|Osa|PART|Part)\s+(?:(?:\d+|[IVXLC]+)\.?\s*|[A-ZÅÄÖ][\p{L}\p{N}'’_-]*\s*)[^\n!?]{0,120}$/u;
        const match = text.match(headingPattern);
        if (!match || match.index === undefined || match.index <= 0) return null;
        const before = text.slice(0, match.index).trim();
        const heading = normalizedHeadingLine(match[0]);
        if (!before || !heading || !isExplicitStructureHeadingLine(heading)) return null;
        const beforeLooksComplete = /[.!?…:;)"”’]$/.test(before) || match[0] === match[0].toLocaleUpperCase('fi-FI');
        if (!beforeLooksComplete) return null;
        return { before, heading };
    }

    function chapterKindFromHeadingTitle(title) {
        const section = classifyBookSectionTitle(title);
        if (section?.kind === 'part') return 'part';
        if (section?.kind === 'subchapter') return 'subchapter';
        if (section?.placement === 'front') return section.kind || 'front';
        if (section?.placement === 'back') return section.kind || 'back';
        if (['prologue', 'epilogue'].includes(section?.kind)) return section.kind;
        return 'chapter';
    }

    function applyDetectedHeadingToChapter(chapter, heading) {
        if (!chapter || !heading) return;
        const kind = chapterKindFromHeadingTitle(heading);
        chapter.title = heading;
        chapter.toc_title = heading;
        if (kind === 'part') {
            chapter.id = String(chapter.id || '').startsWith('osa_') ? chapter.id : `osa_${Date.now()}`;
        } else if (kind === 'subchapter') {
            chapter.id = String(chapter.id || '').startsWith('aliluku_') ? chapter.id : `aliluku_${Date.now()}`;
        } else if (structureKindPlacement(kind) === 'front') {
            const prefix = STRUCTURE_KIND_PREFIXES[kind] || 'alku';
            chapter.id = String(chapter.id || '').startsWith(`${prefix}_`) ? chapter.id : `${prefix}_${Date.now()}`;
        } else if (structureKindPlacement(kind) === 'back') {
            const prefix = STRUCTURE_KIND_PREFIXES[kind] || 'loppu';
            chapter.id = String(chapter.id || '').startsWith(`${prefix}_`) ? chapter.id : `${prefix}_${Date.now()}`;
        } else {
            const prefix = STRUCTURE_KIND_PREFIXES[kind] || 'luku';
            chapter.id = String(chapter.id || '').startsWith(`${prefix}_`) ? chapter.id : `${prefix}_${Date.now()}`;
        }
    }

    function repairMisplacedStructureHeadings(chapters) {
        const rows = (chapters || []).map((chapter, index) => cloneChapterWithStructureTitle(chapter, structureDisplayTitle(chapter, index), index));
        rows.forEach(chapter => {
            while (chapter.paragraphs?.length) {
                const heading = extractedStandaloneStructureHeading(chapter.paragraphs[0]);
                if (!heading) break;
                applyDetectedHeadingToChapter(chapter, heading);
                chapter.paragraphs.shift();
            }
        });
        for (let index = 0; index < rows.length; index++) {
            const chapter = rows[index];
            if (!chapter?.paragraphs?.length) continue;
            const lastIndex = chapter.paragraphs.length - 1;
            const lastParagraph = chapter.paragraphs[lastIndex];
            const standaloneHeading = extractedStandaloneStructureHeading(lastParagraph);
            const trailingHeading = standaloneHeading
                ? { before: '', heading: standaloneHeading }
                : extractTrailingStructureHeading(lastParagraph);
            if (!trailingHeading?.heading) continue;
            if (trailingHeading.before) {
                chapter.paragraphs[lastIndex] = trailingHeading.before;
            } else {
                chapter.paragraphs.splice(lastIndex, 1);
            }
            let nextChapter = rows[index + 1];
            if (!nextChapter) {
                nextChapter = { id: `luku_${rows.length + 1}`, title: '', toc_title: '', paragraphs: [] };
                rows.splice(index + 1, 0, nextChapter);
            }
            applyDetectedHeadingToChapter(nextChapter, trailingHeading.heading);
        }
        return normalizeStructureProposalChapters(sanitizeChaptersForTextStorage(rows));
    }

    let structureProposalChapters = null;

    function structureDisplayTitle(chapter, index = 0) {
        return String(
            chapter?.toc_title
            || chapter?.tocTitle
            || chapter?.structure_title
            || chapter?.title
            || `Luku ${index + 1}`
        ).trim();
    }

    function structureChapterKind(chapter) {
        const id = String(chapter?.id || '');
        const title = structureDisplayTitle(chapter);
        const section = classifyBookSectionTitle(title);
        if (section?.kind) return section.kind;
        if (id.startsWith('kansi_')) return 'cover';
        if (id.startsWith('nimiolehti_') || id.startsWith('title_page_')) return 'title_page';
        if (id.startsWith('valinimilehti_')) return 'half_title';
        if (id.startsWith('tekijanoikeus_')) return 'copyright_page';
        if (id.startsWith('omistus_')) return 'dedication';
        if (id.startsWith('epigrafi_')) return 'epigraph';
        if (id.startsWith('sisallys_') || id.startsWith('toc_')) return 'table_of_contents';
        if (id.startsWith('kirjailijan_esipuhe_')) return 'author_preface';
        if (id.startsWith('esipuhe_')) return 'preface';
        if (id.startsWith('johdanto_')) return 'introduction';
        if (id.startsWith('alku_')) return 'front';
        if (id.startsWith('prologi_')) return 'prologue';
        if (id.startsWith('epilogi_')) return 'epilogue';
        if (id.startsWith('loppu_')) return 'back';
        if (id.startsWith('jalkisanat_')) return 'afterword';
        if (id.startsWith('liite_')) return 'appendix';
        if (id.startsWith('sanasto_')) return 'glossary';
        if (id.startsWith('bibliografia_')) return 'bibliography';
        if (id.startsWith('kiitokset_')) return 'acknowledgements';
        if (id.startsWith('tietoja_kirjailijasta_')) return 'about_author';
        if (id.startsWith('huomautukset_')) return 'notes';
        if (id.startsWith('hakemisto_')) return 'index';
        if (id.startsWith('kolofoni_')) return 'colophon';
        if (id.startsWith('osa_') || isPartHeadingTitle(title)) return 'part';
        if (id.startsWith('aliluku_') || isSubchapterHeadingTitle(title)) return 'subchapter';
        return 'chapter';
    }

    function structureKindPlacement(kind) {
        if (FRONT_STRUCTURE_KINDS.has(kind)) return 'front';
        if (BACK_STRUCTURE_KINDS.has(kind)) return 'back';
        return 'body';
    }

    function isBodyTextStructureKind(kind) {
        return BODY_TEXT_STRUCTURE_KINDS.has(kind);
    }

    function structureChapterHasText(chapter) {
        return (chapter?.paragraphs || []).some(paragraph => String(paragraph || '').trim());
    }

    function makeStructureMetaRow(kind, title, index) {
        const prefix = STRUCTURE_KIND_PREFIXES[kind] || STRUCTURE_KIND_PREFIXES.chapter;
        const fallbackTitle = kind === 'part'
            ? `Osa ${index}`
            : kind === 'chapter'
                ? `Luku ${index}`
                : kind === 'subchapter'
                    ? `Aliluku ${index}`
                    : STRUCTURE_KIND_TITLES[kind] || STRUCTURE_KIND_TITLES.chapter;
        return {
            id: `${prefix}_${index}`,
            title: '',
            toc_title: String(title || fallbackTitle).trim(),
            paragraphs: [],
        };
    }

    function structureSelectedOptions() {
        const onlyChapters = Boolean(document.getElementById('structure-only-chapters')?.checked);
        return {
            onlyChapters,
            parts: !onlyChapters && Boolean(document.getElementById('structure-include-parts')?.checked),
            intertitles: !onlyChapters && Boolean(document.getElementById('structure-include-intertitles')?.checked),
            subchapters: !onlyChapters && Boolean(document.getElementById('structure-include-subchapters')?.checked),
            titlePage: Boolean(document.getElementById('structure-include-title-page')?.checked),
            tableOfContents: Boolean(document.getElementById('structure-include-toc')?.checked),
            opening: Boolean(document.getElementById('structure-include-opening')?.checked),
        };
    }

    function structureExtraInstructions() {
        return document.getElementById('structure-extra-instructions')?.value?.trim() || '';
    }

    function structureFinnishNumber(value) {
        const normalized = String(value || '').toLocaleLowerCase('fi-FI').trim();
        const words = {
            yksi: 1,
            yhden: 1,
            yhteen: 1,
            kaksi: 2,
            kahden: 2,
            kahteen: 2,
            kolme: 3,
            kolmen: 3,
            kolmeen: 3,
            neljä: 4,
            neljan: 4,
            neljän: 4,
            neljään: 4,
            viisi: 5,
            viiden: 5,
            viiteen: 5,
            kuusi: 6,
            kuuden: 6,
            kuuteen: 6,
            seitsemän: 7,
            seitseman: 7,
            seitsemään: 7,
            kahdeksan: 8,
            kahdeksaan: 8,
            yhdeksän: 9,
            yhdeksan: 9,
            yhdeksään: 9,
            kymmenen: 10,
            kymmeneen: 10,
            yksitoista: 11,
            yhdentoista: 11,
            kaksitoista: 12,
            kahdentoista: 12,
            kolmetoista: 13,
            kolmentoista: 13,
            neljätoista: 14,
            neljatoista: 14,
            neljäntoista: 14,
            neljantoista: 14,
            viisitoista: 15,
            viidentoista: 15,
            kuusitoista: 16,
            kuudentoista: 16,
            seitsemäntoista: 17,
            seitsemantoista: 17,
            kahdeksantoista: 18,
            yhdeksäntoista: 19,
            yhdeksantoista: 19,
            kaksikymmentä: 20,
            kaksikymmenta: 20,
        };
        return words[normalized] || null;
    }

    function structureNumberFromToken(value) {
        const token = String(value || '').trim();
        if (!token) return null;
        const numeric = Number(token);
        if (Number.isFinite(numeric) && numeric > 0) return numeric;
        return structureFinnishNumber(token);
    }

    function structureTargetChapterCountFromText(text) {
        const patterns = [
            /(\d+)\s+(?:lukua|lukuun|luvuksi|p[aä][aä]tekstin\s+osiota|p[aä][aä]tekstin\s+osioon|tekstiosiota|tekstiosioon)/i,
            /(?:jaa|jaetaan|jako|muodosta|tee|rakenna)[^\n.]{0,80}?(\d+)\s+(?:osaan|osioon|osioksi|lukuun)/i,
            /(yksi|yhden|yhteen|kaksi|kahden|kahteen|kolme|kolmen|kolmeen|neljä|neljan|neljän|neljään|viisi|viiden|viiteen|kuusi|kuuden|kuuteen|seitsemän|seitseman|seitsemään|kahdeksan|kahdeksaan|yhdeksän|yhdeksan|yhdeksään|kymmenen|kymmeneen|yksitoista|yhdentoista|kaksitoista|kahdentoista|kolmetoista|kolmentoista|neljätoista|neljatoista|neljäntoista|neljantoista|viisitoista|viidentoista|kuusitoista|kuudentoista|seitsemäntoista|seitsemantoista|kahdeksantoista|yhdeksäntoista|yhdeksantoista|kaksikymmentä|kaksikymmenta)\s+(?:lukua|lukuun|luvuksi|osaan|osioon|osioksi)/i
        ];
        for (const pattern of patterns) {
            const match = String(text || '').match(pattern);
            const count = match ? structureNumberFromToken(match[1]) : null;
            if (count && count >= 1 && count <= 80) return count;
        }
        if (/kolmi\s*osainen|kolmiosainen/i.test(String(text || ''))) return 3;
        return null;
    }

    function structureKindsMentionedInText(text, rules) {
        const lower = String(text || '').toLocaleLowerCase('fi-FI');
        const result = [];
        rules.forEach(rule => {
            const mentioned = rule.keywords.some(keyword => lower.includes(String(keyword).toLocaleLowerCase('fi-FI')));
            if (mentioned && !result.some(item => item.kind === rule.kind)) {
                result.push({ kind: rule.kind, title: STRUCTURE_KIND_TITLES[rule.kind] || rule.keywords[0] });
            }
        });
        return result;
    }

    function inferredStructureTargetFromAnalysis() {
        const currentBodyCount = structureBodyChapterCount(window.manuscriptData?.chapters || []);
        if (currentBodyCount > 1) return null;
        const analysis = window.manuscriptData?.analysis || {};
        const text = [
            analysis.chapter_analysis,
            analysis.structure,
            analysis.rakenne,
            analysis.editorial_assessment
        ].map(value => analysisValue(value)).join('\n');
        if (!text.trim()) return null;
        const explicit = structureTargetChapterCountFromText(text);
        if (explicit && explicit >= 2) return explicit;
        const matches = text.match(/(?:^|\n)\s*(?:[-*]\s*)?(?:luku|chapter)\s+\d+\b/gim) || [];
        const unique = new Set(matches.map(item => item.toLocaleLowerCase('fi-FI').replace(/\s+/g, ' ').trim()));
        if (unique.size >= 2 && unique.size <= 80) return unique.size;
        const phaseMatches = text.match(/(?:^|\n)\s*(?:[-*]\s*)?(?:alku|keskiosa|loppu)\b/gim) || [];
        if (phaseMatches.length >= 3) return 3;
        return null;
    }

    function structureInstructionTargets(extra = structureExtraInstructions(), options = structureSelectedOptions()) {
        const text = String(extra || '').toLocaleLowerCase('fi-FI');
        const explicitTargetChapters = structureTargetChapterCountFromText(text);
        const inferredTargetChapters = explicitTargetChapters ? null : inferredStructureTargetFromAnalysis();
        const frontKinds = structureKindsMentionedInText(text, BOOK_FRONT_SECTION_RULES);
        const backKinds = structureKindsMentionedInText(text, BOOK_BACK_SECTION_RULES);
        const wantsTitlePage = Boolean(options.titlePage)
            || /\b(nimi[oö]lehti|nimi[oö]sivu|nimiolehti|nimiosivu|title page)\b/i.test(text);
        const wantsTableOfContents = Boolean(options.tableOfContents)
            || /\b(sis[aä]llys|sis[aä]llysluettelo|sisallys|sisallysluettelo|table of contents|toc)\b/i.test(text);
        const wantsOpening = Boolean(options.opening) || (
            /\b(sisältää|sisaltaa|mukana|mukaan|rakenne)\b.{0,50}\b(alku|alun|alkuosa|alkuosat|alkuosia|prologi|prologin|esipuhe|esipuheen|alkusanat)\b/i.test(text)
            || /\b(alku|alun|prologi|prologin|esipuhe|esipuheen|alkusanat)\b\s*(?:\+|ja|sekä|seka)\b/i.test(text)
            || /\b(alkuosa|alkuosat|alkuosia|prologi|prologin|esipuhe|esipuheen)\b/i.test(text)
        );
        return {
            raw: extra,
            targetChapters: explicitTargetChapters || inferredTargetChapters || null,
            targetChaptersSource: explicitTargetChapters ? 'lisäohje' : inferredTargetChapters ? 'analyysi' : '',
            frontKinds,
            backKinds,
            wantsTitlePage,
            wantsTableOfContents,
            wantsOpening,
            hasExplicitTarget: Boolean(wantsTitlePage || wantsTableOfContents || wantsOpening || frontKinds.length || backKinds.length || explicitTargetChapters || inferredTargetChapters),
        };
    }

    function syncStructureOptionState(changedInput = null) {
        const only = document.getElementById('structure-only-chapters');
        const extras = [
            document.getElementById('structure-include-parts'),
            document.getElementById('structure-include-intertitles'),
            document.getElementById('structure-include-subchapters')
        ].filter(Boolean);
        if (!only) return;
        if (changedInput === only && only.checked) {
            extras.forEach(input => { input.checked = false; });
            return;
        }
        if (extras.some(input => input.checked)) {
            only.checked = false;
        } else {
            only.checked = true;
        }
    }

    function normalizeStructureProposalChapters(chapters, options = structureSelectedOptions()) {
        const kindCounts = {};
        return (chapters || []).map(chapter => {
            const kind = structureChapterKind(chapter);
            const paragraphs = Array.isArray(chapter?.paragraphs) ? chapter.paragraphs : [];
            const hasExplicitSourceTitle = Boolean(String(chapter?.title || chapter?.toc_title || chapter?.tocTitle || chapter?.structure_title || '').trim());
            if (kind === 'title_page' && !options.titlePage && !paragraphs.some(paragraph => String(paragraph || '').trim()) && !hasExplicitSourceTitle) {
                return null;
            }
            if (kind === 'table_of_contents' && !options.tableOfContents && !paragraphs.some(paragraph => String(paragraph || '').trim()) && !hasExplicitSourceTitle) {
                return null;
            }
            if (kind === 'part' && !options.parts && !paragraphs.some(paragraph => String(paragraph || '').trim()) && !hasExplicitSourceTitle) {
                return null;
            }
            const next = {
                id: chapter?.id || '',
                title: chapter?.title || '',
                toc_title: structureDisplayTitle(chapter),
                paragraphs
            };
            kindCounts[kind] = (kindCounts[kind] || 0) + 1;
            const prefix = STRUCTURE_KIND_PREFIXES[kind] || STRUCTURE_KIND_PREFIXES.chapter;
            next.id = `${prefix}_${kindCounts[kind]}`;
            next.toc_title = String(next.toc_title || next.title || STRUCTURE_KIND_TITLES[kind] || `Osio ${kindCounts[kind]}`).trim();
            return next;
        }).filter(Boolean);
    }

    function structureTocLines(chapters) {
        let frontCount = 0;
        let bodyTextCount = 0;
        let partCount = 0;
        let backCount = 0;
        let subchapterCount = 0;
        return (chapters || []).map(chapter => {
            const kind = structureChapterKind(chapter);
            const title = structureDisplayTitle(chapter) || 'Nimetön';
            const placement = structureKindPlacement(kind);
            if (placement === 'front') {
                frontCount++;
                return { kind, title, label: `Etusivut ${frontCount}`, text: `Etusivut: ${title}` };
            }
            if (placement === 'back') {
                backCount++;
                return { kind, title, label: `Lopputekstit ${backCount}`, text: `Lopputekstit: ${title}` };
            }
            if (kind === 'part') {
                partCount++;
                subchapterCount = 0;
                return { kind, title, label: `Osa ${partCount}`, text: `Osa ${partCount}: ${title}` };
            }
            if (kind === 'subchapter') {
                subchapterCount++;
                const number = bodyTextCount ? `${bodyTextCount}.${subchapterCount}` : String(subchapterCount);
                return { kind, title, label: `Aliluku ${number}`, text: `  ${number} ${title}` };
            }
            bodyTextCount++;
            subchapterCount = 0;
            const label = kind === 'prologue' ? 'Prologi' : kind === 'epilogue' ? 'Epilogi' : `Luku ${bodyTextCount}`;
            const prefix = kind === 'chapter' ? `${bodyTextCount}.` : `${label}:`;
            return { kind, title, label, text: `${prefix} ${title}` };
        });
    }

    function structureProposalText(chapters) {
        const lines = structureTocLines(chapters);
        const paragraphCount = (chapters || []).reduce((sum, chapter) => sum + (chapter.paragraphs || []).length, 0);
        return [
            `Ehdotettu rakenne: ${chapters.length} osiota, ${paragraphCount} tekstikappaletta`,
            '',
            ...lines.map(line => line.text)
        ].join('\n');
    }

    function structureBodyChapterCount(chapters) {
        return (chapters || []).filter(chapter => isBodyTextStructureKind(structureChapterKind(chapter))).length;
    }

    function structureChapterGroupRanges(total, target) {
        if (!Number.isFinite(total) || !Number.isFinite(target) || total <= 0 || target <= 0) return [];
        if (target >= total) {
            return Array.from({ length: target }, (_, index) => (
                index < total
                    ? { start: index, end: index + 1 }
                    : { start: total, end: total }
            ));
        }
        return Array.from({ length: target }, (_, index) => {
            const start = Math.floor(index * total / target);
            const end = index === target - 1 ? total : Math.floor((index + 1) * total / target);
            return { start, end: Math.max(start + 1, end) };
        });
    }

    function mergeStructureChapterGroup(group, tocTitle, fallbackIndex) {
        const chapters = (group || []).filter(Boolean);
        const first = chapters[0] || {};
        const paragraphs = chapters.flatMap(chapter => Array.isArray(chapter.paragraphs) ? chapter.paragraphs : []);
        const merged = {
            id: chapters.length === 1 ? (first.id || `luku_${fallbackIndex + 1}`) : `luku_${fallbackIndex + 1}`,
            title: String(first.title || '').trim(),
            toc_title: String(tocTitle || first.toc_title || first.tocTitle || first.structure_title || first.title || `Luku ${fallbackIndex + 1}`).trim(),
            paragraphs,
        };
        return merged;
    }

    function structureParagraphUnits(chapters) {
        const units = [];
        (chapters || []).forEach((chapter, chapterIndex) => {
            const paragraphs = Array.isArray(chapter?.paragraphs) ? chapter.paragraphs : [];
            paragraphs.forEach((paragraph, paragraphIndex) => {
                const text = String(paragraph || '');
                if (!text.trim()) return;
                units.push({ paragraph: text, chapter, chapterIndex, paragraphIndex });
            });
        });
        return units;
    }

    function structureParagraphGroups(chapters, targetChapters) {
        const units = structureParagraphUnits(chapters);
        if (!targetChapters || !units.length) return [];
        return structureChapterGroupRanges(units.length, targetChapters)
            .map(range => units.slice(range.start, range.end));
    }

    function mergeStructureParagraphGroup(group, tocTitle, fallbackIndex) {
        const units = (group || []).filter(Boolean);
        const first = units[0]?.chapter || {};
        return {
            id: `luku_${fallbackIndex + 1}`,
            title: String(first.title || '').trim(),
            toc_title: String(tocTitle || first.toc_title || first.tocTitle || first.structure_title || first.title || `Luku ${fallbackIndex + 1}`).trim(),
            paragraphs: units.map(unit => unit.paragraph),
        };
    }

    function expandedStructureBodyChapters(rows, targetChapters, preferredTitles = []) {
        const sourceRows = [...(rows || [])];
        const bodyRows = sourceRows.filter(chapter => structureChapterKind(chapter) === 'chapter');
        if (!targetChapters || bodyRows.length >= targetChapters) return sourceRows;
        const paragraphGroups = structureParagraphGroups(bodyRows, targetChapters);
        if (!paragraphGroups.length || paragraphGroups.every(group => !group.length)) return sourceRows;
        const expanded = paragraphGroups.map((group, index) => mergeStructureParagraphGroup(group, preferredTitles[index], index));
        const firstBodyIndex = sourceRows.findIndex(chapter => structureChapterKind(chapter) === 'chapter');
        if (firstBodyIndex < 0) return sourceRows;
        const result = [];
        let inserted = false;
        sourceRows.forEach((row, index) => {
            if (structureChapterKind(row) !== 'chapter') {
                if (!inserted || index < firstBodyIndex) result.push(row);
                return;
            }
            if (!inserted) {
                result.push(...expanded);
                inserted = true;
            }
        });
        return result;
    }

    function rebalanceStructureBodyChapters(rows, targetChapters, preferredTitles = []) {
        const sourceRows = [...(rows || [])];
        const bodyRows = sourceRows.filter(chapter => structureChapterKind(chapter) === 'chapter');
        if (!targetChapters) return sourceRows;
        if (bodyRows.length < targetChapters) {
            return expandedStructureBodyChapters(sourceRows, targetChapters, preferredTitles);
        }
        if (bodyRows.length <= targetChapters) return sourceRows;
        const ranges = structureChapterGroupRanges(bodyRows.length, targetChapters);
        const bodyIndexToGroup = new Map();
        ranges.forEach((range, groupIndex) => {
            for (let index = range.start; index < range.end; index++) {
                bodyIndexToGroup.set(index, groupIndex);
            }
        });
        const groups = ranges.map(range => bodyRows.slice(range.start, range.end));
        let bodyIndex = 0;
        const emittedGroups = new Set();
        const result = [];
        sourceRows.forEach(row => {
            if (structureChapterKind(row) !== 'chapter') {
                result.push(row);
                return;
            }
            const groupIndex = bodyIndexToGroup.get(bodyIndex);
            bodyIndex++;
            if (groupIndex === undefined || emittedGroups.has(groupIndex)) return;
            emittedGroups.add(groupIndex);
            result.push(mergeStructureChapterGroup(groups[groupIndex], preferredTitles[groupIndex], groupIndex));
        });
        return result;
    }

    function applyStructureInstructionTargets(chapters, targets = structureInstructionTargets()) {
        let rows = [...(chapters || [])];
        const leadingRows = [];
        const ensureLeadingKind = (kind, title) => {
            if (!rows.some(chapter => structureChapterKind(chapter) === kind) && !leadingRows.some(chapter => structureChapterKind(chapter) === kind)) {
                leadingRows.push(makeStructureMetaRow(kind, title || STRUCTURE_KIND_TITLES[kind], leadingRows.length + 1));
            }
        };
        (targets.frontKinds || []).forEach(item => ensureLeadingKind(item.kind, item.title));
        if (targets.wantsTitlePage && !rows.some(chapter => structureChapterKind(chapter) === 'title_page')) {
            ensureLeadingKind('title_page', 'Nimiölehti');
        }
        if (targets.wantsTableOfContents && !rows.some(chapter => structureChapterKind(chapter) === 'table_of_contents')) {
            ensureLeadingKind('table_of_contents', 'Sisällysluettelo');
        }
        if (targets.wantsOpening && !rows.some(chapter => structureChapterKind(chapter) === 'front')) {
            ensureLeadingKind('front', 'Alku');
        }
        if (leadingRows.length) {
            rows = [...leadingRows, ...rows];
        }
        (targets.backKinds || []).forEach((item, index) => {
            if (!rows.some(chapter => structureChapterKind(chapter) === item.kind)) {
                rows.push(makeStructureMetaRow(item.kind, item.title, index + 1));
            }
        });
        if (targets.targetChapters) {
            const preferredTitles = rows
                .filter(chapter => structureChapterKind(chapter) === 'chapter')
                .map((chapter, index) => structureDisplayTitle(chapter) || `Luku ${index + 1}`);
            rows = rebalanceStructureBodyChapters(rows, targets.targetChapters, preferredTitles);
            let chapterIndexes = rows
                .map((chapter, index) => ({ chapter, index }))
                .filter(item => structureChapterKind(item.chapter) === 'chapter');
            let chapterCount = chapterIndexes.length;
            for (let i = chapterIndexes.length - 1; i >= 0 && chapterCount > targets.targetChapters; i--) {
                const item = chapterIndexes[i];
                if (structureChapterHasText(item.chapter)) continue;
                rows.splice(item.index, 1);
                chapterCount--;
                chapterIndexes = rows
                    .map((chapter, index) => ({ chapter, index }))
                    .filter(nextItem => structureChapterKind(nextItem.chapter) === 'chapter');
            }
            while (chapterCount < targets.targetChapters) {
                chapterCount++;
                rows.push(makeStructureMetaRow('chapter', `Luku ${chapterCount}`, chapterCount));
            }
        }
        return normalizeStructureProposalChapters(rows);
    }

    function structureInstructionStatusNote(chapters, targets = structureInstructionTargets()) {
        if (!targets.hasExplicitTarget) return '';
        const parts = [];
        if (targets.wantsTitlePage) {
            parts.push('nimiölehti huomioitu metatason rivinä');
        }
        if (targets.wantsTableOfContents) {
            parts.push('sisällysluettelo huomioitu metatason rivinä');
        }
        if (targets.wantsOpening) {
            parts.push('lisäohjeen alkuosa huomioitu metatason rivinä');
        }
        if (targets.frontKinds?.length) {
            parts.push(`etusivut: ${targets.frontKinds.map(item => item.title).join(', ')}`);
        }
        if (targets.backKinds?.length) {
            parts.push(`lopputekstit: ${targets.backKinds.map(item => item.title).join(', ')}`);
        }
        if (targets.targetChapters) {
            const actual = structureBodyChapterCount(chapters);
            if (actual === targets.targetChapters) {
                parts.push(`${actual} päätekstin osiota`);
            } else {
                parts.push(`${actual}/${targets.targetChapters} päätekstin osiota; sisältöä sisältäviä osioita ei poistettu automaattisesti`);
            }
        }
        return parts.length ? ` Lisäohje huomioitu: ${parts.join(', ')}.` : '';
    }

    const STRUCTURE_AI_BRIEF_MAX_CHARS = 12000;
    const STRUCTURE_AI_EXTRA_MAX_CHARS = 1800;

    function compactStructureMiddle(value, maxChars) {
        const text = String(value || '').replace(/\s+/g, ' ').trim();
        if (text.length <= maxChars) return text;
        if (maxChars <= 12) return text.slice(0, maxChars).trim();
        const headLength = Math.max(1, Math.floor(maxChars * 0.58));
        const tailLength = Math.max(1, maxChars - headLength - 14);
        return `${text.slice(0, headLength).trim()} ... ${text.slice(-tailLength).trim()}`;
    }

    function compactStructureExcerpt(value, maxChars) {
        const text = String(value || '').replace(/\s+/g, ' ').trim();
        if (text.length <= maxChars) return text;
        return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
    }

    function structureTextWindows(text, windowCount = 12, excerptChars = 360) {
        const paragraphs = splitIntoParagraphs(text).filter(paragraph => paragraph.trim());
        if (!paragraphs.length) return [];
        const count = Math.min(windowCount, paragraphs.length);
        const indexes = Array.from({ length: count }, (_, index) => {
            if (count === 1) return 0;
            return Math.round(index * (paragraphs.length - 1) / (count - 1));
        });
        return indexes.map((paragraphIndex, index) => {
            const paragraph = paragraphs[paragraphIndex] || '';
            return [
                `NÄYTE ${index + 1}/${count}`,
                `Sijainti: noin kappale ${paragraphIndex + 1}/${paragraphs.length}`,
                `Teksti: ${compactStructureExcerpt(paragraph, excerptChars)}`
            ].join('\n');
        });
    }

    function estimatedStructureTargetFromLength(project = window.manuscriptData) {
        const words = countWords(getFullManuscriptText(project));
        if (words < 2500) return null;
        return Math.max(3, Math.min(48, Math.round(words / 2200)));
    }

    function structureBriefForAi(project, maxChars = STRUCTURE_AI_BRIEF_MAX_CHARS) {
        const chapters = project?.chapters || [];
        const analysis = project?.analysis || {};
        const synopsis = compactStructureMiddle(analysis.synopsis || analysis.backcover || '', 700);
        const style = compactStructureMiddle(analysis.style || '', 350);
        const chapterAnalysis = compactStructureMiddle(analysis.chapter_analysis || analysis.structure || analysis.rakenne || '', 900);
        const fullText = getFullManuscriptText(project);
        const sourceWordCount = countWords(fullText);
        const longSingleSection = chapters.length <= 2 && sourceWordCount > 6000;
        const lines = [
            `Teos: ${project?.title || 'Nimetön'}`,
            project?.author ? `Tekijä: ${project.author}` : '',
            `Nykyisiä otsikkotasoja: ${chapters.length}`,
            `Koko tekstin sanamäärä: noin ${formatNumber(sourceWordCount)}`,
            longSingleSection ? `Arvioitu sopiva päätekstin osiomäärä: noin ${estimatedStructureTargetFromLength(project) || 'ei pääteltävissä'}` : '',
            synopsis ? `Synopsis: ${synopsis}` : '',
            style ? `Tyylianalyysin tiivistelmä: ${style}` : '',
            chapterAnalysis ? `Tallennettu luku-/rakenneanalyysi: ${chapterAnalysis}` : '',
            '',
            longSingleSection ? 'Pitkän yhtenäisen tekstin sijaintinäytteet:' : 'Nykyinen rakenne ja lyhyet näytteet:',
        ].filter(Boolean);
        const headerLines = [...lines];

        if (longSingleSection) {
            lines.push(...structureTextWindows(fullText, 14, 380));
            const brief = lines.join('\n\n');
            return brief.length <= maxChars ? brief : compactStructureMiddle(brief, maxChars);
        }

        const headerLength = lines.join('\n').length + 200;
        const chapterBudget = Math.max(0, maxChars - headerLength);
        const perChapterChars = Math.max(0, Math.min(280, Math.floor(chapterBudget / Math.max(1, chapters.length)) - 150));
        chapters.forEach((chapter, index) => {
            const paragraphs = chapter.paragraphs || [];
            const full = paragraphs.join('\n\n');
            const first = perChapterChars >= 80
                ? compactStructureExcerpt(paragraphs[0] || '', Math.floor(perChapterChars * 0.62))
                : '';
            const last = perChapterChars >= 120
                ? compactStructureExcerpt(paragraphs.length > 1 ? paragraphs[paragraphs.length - 1] : '', Math.floor(perChapterChars * 0.38))
                : '';
            lines.push([
                `OSIO ${index + 1}`,
                `Otsikko: ${chapter.title || `Luku ${index + 1}`}`,
                chapter.toc_title ? `Sisällysluettelo-otsikko: ${chapter.toc_title}` : '',
                `Tyyppi: ${structureChapterKind(chapter)}`,
                `Kappaleita: ${paragraphs.length}`,
                `Sanoja: noin ${formatNumber(countWords(full))}`,
                first ? `Alku: ${first}` : '',
                last ? `Loppu: ${last}` : '',
            ].filter(Boolean).join('\n'));
        });
        let brief = lines.join('\n\n');
        if (brief.length <= maxChars) return brief;
        const minimalLines = [...headerLines];
        chapters.forEach((chapter, index) => {
            const paragraphs = chapter.paragraphs || [];
            const full = paragraphs.join('\n\n');
            minimalLines.push([
                `OSIO ${index + 1}`,
                `Otsikko: ${chapter.title || `Luku ${index + 1}`}`,
                chapter.toc_title ? `Sisällysluettelo-otsikko: ${chapter.toc_title}` : '',
                `Tyyppi: ${structureChapterKind(chapter)}`,
                `Kappaleita: ${paragraphs.length}`,
                `Sanoja: noin ${formatNumber(countWords(full))}`,
            ].filter(Boolean).join('\n'));
        });
        brief = minimalLines.join('\n\n');
        return brief.length <= maxChars ? brief : compactStructureMiddle(brief, maxChars);
    }

    function renderStructureModule() {
        const currentEl = document.getElementById('structure-current-project');
        const summaryEl = document.getElementById('structure-summary');
        const tocEl = document.getElementById('structure-toc');
        const proposalEl = document.getElementById('structure-proposal');
        const acceptBtn = document.getElementById('structure-accept-btn');
        const rejectBtn = document.getElementById('structure-reject-btn');
        if (!tocEl || !summaryEl) return;

        const project = window.manuscriptData;
        if (currentEl) {
            currentEl.textContent = project
                ? `Käsikirjoitus: ${project.title || 'Nimetön'}`
                : 'Valitse käsikirjoitus ja tarkastele sisällysluetteloa.';
        }
        tocEl.innerHTML = '';
        if (!project?.chapters?.length) {
            summaryEl.textContent = 'Ei valittua käsikirjoitusta.';
            tocEl.innerHTML = '<div style="color:var(--text-secondary); font-size:13px;">Valitse käsikirjoitus Käsikirjoitukseni-näkymässä.</div>';
            if (acceptBtn) acceptBtn.disabled = true;
            if (rejectBtn) rejectBtn.disabled = true;
            return;
        }

        const chapters = project.chapters || [];
        const paragraphCount = chapters.reduce((sum, chapter) => sum + (chapter.paragraphs || []).length, 0);
        const wordCountValue = countWords(getFullManuscriptText(project));
        summaryEl.textContent = `${chapters.length} osiota, ${paragraphCount} tekstikappaletta, noin ${formatNumber(wordCountValue)} sanaa.`;
        const lines = structureTocLines(chapters);
        tocEl.innerHTML = lines.map((line, index) => {
            const chapter = chapters[index] || {};
            const paragraphMeta = (chapter.paragraphs || []).length;
            const className = line.kind === 'subchapter' ? 'chapter-nav-btn subchapter' : 'chapter-nav-btn';
            const placement = structureKindPlacement(line.kind);
            const prefix = placement === 'front'
                ? 'Etusivut'
                : placement === 'back'
                    ? 'Lopputekstit'
                    : line.kind === 'part'
                        ? 'Osa'
                        : line.kind === 'subchapter'
                            ? 'Aliluku'
                            : line.kind === 'prologue'
                                ? 'Prologi'
                                : line.kind === 'epilogue'
                                    ? 'Epilogi'
                                    : 'Pääteksti';
            return `
                <button class="${className}" data-structure-chapter-index="${index}" type="button">
                    <span class="chapter-nav-title">${escapeHtml(line.text)}</span>
                    <small>${escapeHtml(prefix)} · ${paragraphMeta} tekstikappaletta</small>
                </button>
            `;
        }).join('');
        tocEl.querySelectorAll('[data-structure-chapter-index]').forEach(button => {
            button.addEventListener('click', () => {
                const index = Number(button.dataset.structureChapterIndex || 0);
                writingSelection = { cIndex: index, pIndex: 0 };
                window.currentEditSelection = { cIndex: index, pIndex: 0 };
                window.openModule('view-kirjoita');
                renderWritingView();
            });
        });
        if (proposalEl && structureProposalChapters) {
            proposalEl.value = structureProposalText(structureProposalChapters);
        }
        if (acceptBtn) acceptBtn.disabled = !structureProposalChapters;
        if (rejectBtn) rejectBtn.disabled = !structureProposalChapters;
    }

    function setStructureStatus(message, isError = false) {
        const status = document.getElementById('structure-status');
        if (!status) return;
        status.textContent = message || '';
        status.style.color = isError ? '#ffb4b4' : '';
    }

    function setStructureProposal(chapters, message, targets = structureInstructionTargets()) {
        structureProposalChapters = sanitizeChaptersForTextStorage(applyStructureInstructionTargets(normalizeStructureProposalChapters(chapters), targets));
        const proposalEl = document.getElementById('structure-proposal');
        if (proposalEl) proposalEl.value = structureProposalText(structureProposalChapters);
        const acceptBtn = document.getElementById('structure-accept-btn');
        const rejectBtn = document.getElementById('structure-reject-btn');
        if (acceptBtn) acceptBtn.disabled = !structureProposalChapters?.length;
        if (rejectBtn) rejectBtn.disabled = !structureProposalChapters?.length;
        setStructureStatus(`${message || 'Ehdotus valmis tarkistettavaksi.'}${structureInstructionStatusNote(structureProposalChapters, targets)}`);
    }

    function localStructureFallbackProposal() {
        const repaired = currentStructureAsProposal();
        const targets = structureInstructionTargets();
        if (!targets.targetChapters) {
            const estimated = estimatedStructureTargetFromLength({ ...window.manuscriptData, chapters: repaired });
            if (estimated) {
                targets.targetChapters = estimated;
                targets.targetChaptersSource = 'pituusarvio';
                targets.hasExplicitTarget = true;
            }
        }
        return { chapters: repaired, targets };
    }

    function rejectStructureProposal() {
        structureProposalChapters = null;
        const proposalEl = document.getElementById('structure-proposal');
        if (proposalEl) proposalEl.value = '';
        const acceptBtn = document.getElementById('structure-accept-btn');
        const rejectBtn = document.getElementById('structure-reject-btn');
        if (acceptBtn) acceptBtn.disabled = true;
        if (rejectBtn) rejectBtn.disabled = true;
        setStructureStatus('Ehdotus hylätty.');
    }

    async function createRuleBasedStructureProposal() {
        if (!window.manuscriptData?.chapters?.length) {
            alert('Lataa tai valitse käsikirjoitus ensin.');
            return;
        }
        await flushPendingManuscriptEdits();
        const repairedChapters = repairMisplacedStructureHeadings(window.manuscriptData.chapters);
        const sourceText = cleanManuscriptText(getFullManuscriptText({ ...window.manuscriptData, chapters: repairedChapters }), { preserveStructure: true });
        if (!sourceText.trim()) {
            alert('Käsikirjoituksesta ei löytynyt jaoteltavaa tekstiä.');
            return;
        }
        const chapters = sanitizeChaptersForTextStorage(parseRestructuredChapters(sourceText, '', { useFallbackTitle: false }));
        setStructureProposal(chapters, 'Sääntöpohjainen jako valmis tarkistettavaksi.');
    }

    function buildStructureAiPrompt() {
        const options = structureSelectedOptions();
        const extra = structureExtraInstructions();
        const targets = structureInstructionTargets(extra, options);
        const constraints = [];
        if (targets.targetChapters) constraints.push(`Päätekstin tavoitemäärä: ${targets.targetChapters} tekstillistä osiota (${targets.targetChaptersSource || 'ohje'}).`);
        if (targets.frontKinds?.length) constraints.push(`Etusivuihin pyydetyt metarivit: ${targets.frontKinds.map(item => item.title).join(', ')}.`);
        if (targets.backKinds?.length) constraints.push(`Lopputeksteihin pyydetyt metarivit: ${targets.backKinds.map(item => item.title).join(', ')}.`);
        if (targets.wantsTitlePage) constraints.push('Sisällytä Nimiölehti etusivujen metariviksi, jos se sopii kokonaisuuteen.');
        if (targets.wantsTableOfContents) constraints.push('Sisällytä Sisällysluettelo etusivujen metariviksi, jos se sopii kokonaisuuteen.');
        if (targets.wantsOpening) constraints.push('Huomioi alkuosa/prologi etusivu- tai päätekstirakenteessa käsikirjoituksen sisällön mukaan.');
        if (options.onlyChapters) constraints.push('Jos tämä ei ole ristiriidassa lisäohjeen kanssa, keskity päätekstin tekstillisiin lukuihin.');
        if (options.parts) constraints.push('Saat käyttää päätekstissä osia, esimerkiksi Osa 1, Osa 2, jos rakenne hyötyy siitä.');
        if (options.subchapters || options.intertitles) constraints.push('Saat käyttää alilukuja tai väliotsikoita, jos nykyinen teksti selvästi tukee niitä.');
        if (extra) constraints.push(`Käyttäjän lisäohje: ${compactStructureMiddle(extra, STRUCTURE_AI_EXTRA_MAX_CHARS)}`);
        return `STRUCTURE_MODULE:proposal

	Ehdota käsikirjoitukselle kirjarakenne metatietona. Päättele analyysin, synopsiksen, nykyisten osioiden ja käyttäjän lisäohjeen perusteella, moneenko päätekstin osioon teksti kannattaa jakaa.

	Periaatteet:
	- Ehdottamasi rivit ovat vain rakenteen metatietoa. Älä lisää otsikoita leipätekstiin.
	- Etusivujen ja lopputekstien rivit ovat metarivejä, ellei niille ole nykyisessä tekstissä selvä oma tekstisisältö.
	- Päätekstin tekstillisten osioiden pitää kattaa nykyinen käsikirjoitusteksti järjestyksessä.
	- Älä keksi uusia kohtauksia, kappaleita tai sisältöä.
	- Jos ehdotat uutta jakoa, anna jokaiselle tekstilliselle päätekstin osiolle lähdealue nykyisistä OSIO-numeroista muodossa [LÄHDE: 1-3] tai [LÄHDE: 4].
	- Jos nykyinen käsikirjoitus on yhtenä pitkänä osiona, voit ehdottaa useita LUKU-rivejä ilman lähdealuetta; sovellus jakaa tekstin kappalerajoista.
	- Palauta vain rakennerivejä, ei perusteluja.
	- Käytä vain näitä rivimuotoja:
	  ETUSIVUT: Nimiölehti
	  ETUSIVUT: Sisällysluettelo
	  PÄÄTEKSTI: Prologi [LÄHDE: 1]
	  OSA 1: Osan nimi
	  LUKU 1: Luvun nimi [LÄHDE: 1-2]
	  ALILUKU 1.1: Aliluvun nimi [LÄHDE: 2]
	  PÄÄTEKSTI: Epilogi [LÄHDE: 12]
	  LOPPUTEKSTIT: Kiitokset
	  LOPPUTEKSTIT: Tietoja kirjailijasta

	Rakennevalinnat:
	${constraints.map(item => `- ${item}`).join('\n')}`;
    }

    function parseAiStructureOutline(rawText) {
        const entries = [];
        String(rawText || '').split(/\n+/).forEach(line => {
            let text = line.trim();
            if (!text) return;
            text = text.replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '').trim();
            text = text.replace(/^#{1,6}\s*/, '').trim();
            const sourceMatch = text.match(/\[\s*l[aä]hde\s*:\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*\]\s*$/i);
            let sourceStart = null;
            let sourceEnd = null;
            if (sourceMatch) {
                sourceStart = Number(sourceMatch[1]);
                sourceEnd = Number(sourceMatch[2] || sourceMatch[1]);
                text = text.slice(0, sourceMatch.index).trim();
            }
            const addEntry = entry => {
                entries.push({
                    ...entry,
                    sourceStart: Number.isFinite(sourceStart) ? sourceStart : null,
                    sourceEnd: Number.isFinite(sourceEnd) ? sourceEnd : null
                });
            };
            const frontMeta = text.match(/^(?:etusivut|etusivu|front matter|front)\s*:\s*(.+)$/i);
            if (frontMeta) {
                const title = normalizedHeadingLine(frontMeta[1]);
                const section = classifyBookSectionTitle(title);
                addEntry({
                    kind: FRONT_STRUCTURE_KINDS.has(section?.kind) ? section.kind : 'front',
                    title: section?.title || title
                });
                return;
            }
            const backMeta = text.match(/^(?:lopputekstit|loppuosa|back matter|back)\s*:\s*(.+)$/i);
            if (backMeta) {
                const title = normalizedHeadingLine(backMeta[1]);
                const section = classifyBookSectionTitle(title);
                addEntry({
                    kind: BACK_STRUCTURE_KINDS.has(section?.kind) ? section.kind : 'back',
                    title: section?.title || title
                });
                return;
            }
            const bodyMeta = text.match(/^(?:p[aä][aä]teksti|body)\s*:\s*(.+)$/i);
            if (bodyMeta) {
                text = normalizedHeadingLine(bodyMeta[1]);
            }
            const directPart = text.match(/^(?:osa|part)\s+([\divxlcdm]+)\s*[:.\-–)]\s*(.+)$/i);
            if (directPart) {
                addEntry({ kind: 'part', title: normalizedHeadingLine(`Osa ${directPart[1]}: ${directPart[2]}`) });
                return;
            }
            const directChapter = text.match(/^(?:luku|chapter)\s+(\d+)\s*[:.\-–)]\s*(.+)$/i);
            if (directChapter) {
                addEntry({
                    kind: 'chapter',
                    sourceIndex: Math.max(0, Number(directChapter[1]) - 1),
                    title: normalizedHeadingLine(directChapter[2]) || directChapter[2].trim()
                });
                return;
            }
            const directSubchapter = text.match(/^(?:aliluku|subchapter|v[aä]liotsikko|valiotsikko)\s+([\d.]+)\s*[:.\-–)]\s*(.+)$/i);
            if (directSubchapter) {
                addEntry({ kind: 'subchapter', title: normalizedHeadingLine(directSubchapter[2]) || directSubchapter[2].trim() });
                return;
            }
            const section = classifyBookSectionTitle(text);
            if (section?.kind === 'title_page') {
                addEntry({ kind: 'title_page', title: section.title || 'Nimiölehti' });
                return;
            }
            if (section?.kind === 'table_of_contents') {
                addEntry({ kind: 'table_of_contents', title: section.title || 'Sisällysluettelo' });
                return;
            }
            if (section?.placement === 'front') {
                addEntry({ kind: section.kind || 'front', title: section.title });
                return;
            }
            if (section?.placement === 'back') {
                addEntry({ kind: section.kind || 'back', title: section.title });
                return;
            }
            if (section?.kind === 'part') {
                addEntry({ kind: 'part', title: section.title });
                return;
            }
            if (section?.kind === 'subchapter') {
                addEntry({ kind: 'subchapter', title: section.title });
                return;
            }
            if (['prologue', 'epilogue'].includes(section?.kind)) {
                addEntry({ kind: section.kind, title: section.title });
                return;
            }
            const titlePage = text.match(/^(nimi[oö]lehti|nimi[oö]sivu|nimiolehti|nimiosivu|title page)\s*:?\s*(.*)$/i);
            if (titlePage) {
                addEntry({ kind: 'title_page', title: normalizedHeadingLine(titlePage[2]) || 'Nimiölehti' });
                return;
            }
            const toc = text.match(/^(sis[aä]llys|sis[aä]llysluettelo|sisallys|sisallysluettelo|table of contents|toc)\s*:?\s*(.*)$/i);
            if (toc) {
                addEntry({ kind: 'table_of_contents', title: normalizedHeadingLine(toc[2]) || 'Sisällysluettelo' });
                return;
            }
            const front = text.match(/^(alku|esipuhe|alkusanat)\s*:?\s*(.*)$/i);
            if (front) {
                addEntry({ kind: 'front', title: normalizedHeadingLine(front[2]) || front[1].trim() });
                return;
            }
            const back = text.match(/^(loppu|loppuosa|j[aä]lkisanat|liitteet|liite|sanasto|bibliografia|kiitokset|huomautukset|hakemisto|kolofoni)\s*:?\s*(.*)$/i);
            if (back) {
                const title = normalizedHeadingLine(back[2]) || back[1].trim();
                const backSection = classifyBookSectionTitle(title);
                addEntry({ kind: backSection?.kind || 'back', title: backSection?.title || title });
                return;
            }
            const part = text.match(/^osa\s*:?\s*(.+)$/i);
            if (part) {
                addEntry({ kind: 'part', title: normalizedHeadingLine(part[1]) || part[1].trim() });
                return;
            }
            const subchapter = text.match(/^(aliluku|väliotsikko|valiotsikko)\s*:?\s*(.+)$/i);
            if (subchapter) {
                addEntry({ kind: 'subchapter', title: normalizedHeadingLine(subchapter[2]) || subchapter[2].trim() });
                return;
            }
            const chapter = text.match(/^luku\s+(\d+)\s*[:.\-)]\s*(.+)$/i) || text.match(/^(\d+)\s*[:.\-)]\s*(.+)$/);
            if (chapter) {
                addEntry({
                    kind: 'chapter',
                    sourceIndex: Math.max(0, Number(chapter[1]) - 1),
                    title: normalizedHeadingLine(chapter[2]) || chapter[2].trim(),
                });
            }
        });
        return entries;
    }

    function cloneChapterWithStructureTitle(chapter, tocTitle, fallbackIndex) {
        return {
            id: chapter?.id || `luku_${fallbackIndex + 1}`,
            title: String(chapter?.title || '').trim(),
            toc_title: String(tocTitle || chapter?.toc_title || chapter?.title || `Luku ${fallbackIndex + 1}`).trim(),
            paragraphs: Array.isArray(chapter?.paragraphs) ? [...chapter.paragraphs] : [],
        };
    }

    function prependMissingSourceMetaRows(result, sourceRows) {
        const preserved = [];
        sourceRows.forEach(row => {
            const kind = structureChapterKind(row);
            if (kind === 'chapter') return;
            if (!structureChapterHasText(row)) return;
            if (result.some(item => structureChapterKind(item) === kind && structureDisplayTitle(item) === structureDisplayTitle(row))) return;
            preserved.push(row);
        });
        return preserved.length ? [...preserved, ...result] : result;
    }

    function textBearingStructureRows(rows) {
        return (rows || []).filter(chapter => {
            const kind = structureChapterKind(chapter);
            return structureKindPlacement(kind) === 'body' && kind !== 'part' && structureChapterHasText(chapter);
        });
    }

    function mergeSourceRowsForEntry(sourceRows, entry, fallbackIndex) {
        const sourceStart = Number(entry?.sourceStart || 0);
        const sourceEnd = Number(entry?.sourceEnd || sourceStart);
        const hasRange = sourceStart >= 1 && sourceEnd >= sourceStart;
        const range = hasRange
            ? sourceRows.slice(sourceStart - 1, sourceEnd)
            : [sourceRows[fallbackIndex]].filter(Boolean);
        if (!range.length) {
            return makeStructureMetaRow(entry?.kind || 'chapter', entry?.title || `Luku ${fallbackIndex + 1}`, fallbackIndex + 1);
        }
        const first = range[0] || {};
        return {
            id: first.id || `${STRUCTURE_KIND_PREFIXES[entry?.kind || 'chapter'] || 'luku'}_${fallbackIndex + 1}`,
            title: String(first.title || '').trim(),
            toc_title: String(entry?.title || structureDisplayTitle(first, fallbackIndex) || `Luku ${fallbackIndex + 1}`).trim(),
            paragraphs: range.flatMap(chapter => Array.isArray(chapter.paragraphs) ? chapter.paragraphs : [])
        };
    }

    function chaptersFromAiStructureOutline(rawText) {
        const sourceChapters = repairMisplacedStructureHeadings(window.manuscriptData?.chapters || []);
        const entries = parseAiStructureOutline(rawText);
        if (!sourceChapters.length) return [];
        if (!entries.length) return sourceChapters;

        const sourceTextRows = textBearingStructureRows(sourceChapters);
        const bodyTextEntries = entries.filter(entry => isBodyTextStructureKind(entry.kind));
        const paragraphGroups = bodyTextEntries.length
            ? structureParagraphGroups(sourceTextRows, bodyTextEntries.length)
            : [];
        let bodyTextIndex = 0;
        const rows = entries.map((entry, index) => {
            const placement = structureKindPlacement(entry.kind);
            if (placement !== 'body' || entry.kind === 'part') {
                return makeStructureMetaRow(entry.kind, entry.title || STRUCTURE_KIND_TITLES[entry.kind], index + 1);
            }
            let row;
            if (entry.sourceStart) {
                row = mergeSourceRowsForEntry(sourceTextRows, entry, bodyTextIndex);
            } else if (bodyTextEntries.length !== sourceTextRows.length && paragraphGroups[bodyTextIndex]) {
                row = mergeStructureParagraphGroup(paragraphGroups[bodyTextIndex], entry.title, bodyTextIndex);
            } else {
                row = mergeSourceRowsForEntry(sourceTextRows, entry, bodyTextIndex);
            }
            bodyTextIndex++;
            return {
                ...row,
                toc_title: String(entry.title || row.toc_title || row.title || `Luku ${bodyTextIndex}`).trim()
            };
        });
        return sanitizeChaptersForTextStorage(prependMissingSourceMetaRows(rows, sourceChapters));
    }

    function currentStructureAsProposal() {
        return repairMisplacedStructureHeadings(window.manuscriptData?.chapters || []);
    }

    async function createAiStructureProposal() {
        if (!window.manuscriptData?.chapters?.length) {
            alert('Lataa tai valitse käsikirjoitus ensin.');
            return;
        }
        await flushPendingManuscriptEdits();
        const repairedChapters = repairMisplacedStructureHeadings(window.manuscriptData.chapters);
        const structureBrief = structureBriefForAi({ ...window.manuscriptData, chapters: repairedChapters });
        if (!structureBrief.trim()) {
            alert('Käsikirjoituksesta ei löytynyt käsiteltävää tekstiä.');
            return;
        }
        const button = document.getElementById('structure-ai-btn');
        if (button) button.disabled = true;
        setStructureStatus('Haetaan rakenne-ehdotusta...');
        try {
            const res = await apiFetch('/api/edit', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    text: structureBrief,
                    temperature: 0.2,
                    prompt: buildStructureAiPrompt()
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Rakenne-ehdotuksen luonti epäonnistui.');
            const chapters = chaptersFromAiStructureOutline(data.edited_text || '');
            if (!chapters.length) throw new Error('AI ei palauttanut tunnistettavaa rakennetta.');
            setStructureProposal(chapters, 'AI-ehdotus valmis tarkistettavaksi. Nykyiset jakokohdat on säilytetty.');
            loadUsage();
        } catch (err) {
            const fallback = localStructureFallbackProposal();
            const fallbackChapters = fallback.chapters;
            if (fallbackChapters.length) {
                setStructureProposal(
                    fallbackChapters,
                    `AI-ehdotus ei onnistunut (${networkFailureMessage(err)}). Tein sääntöpohjaisen ehdotuksen nykyisestä rakenteesta.`,
                    fallback.targets
                );
            } else {
                setStructureStatus(err.message, true);
                alert('Rakenne-ehdotuksen luonti epäonnistui: ' + networkFailureMessage(err));
            }
            loadUsage();
        } finally {
            if (button) button.disabled = false;
        }
    }

    function sameStructureParagraphs(left, right) {
        const leftParagraphs = Array.isArray(left?.paragraphs) ? left.paragraphs : [];
        const rightParagraphs = Array.isArray(right?.paragraphs) ? right.paragraphs : [];
        if (leftParagraphs.length !== rightParagraphs.length) return false;
        return leftParagraphs.every((paragraph, index) => String(paragraph || '') === String(rightParagraphs[index] || ''));
    }

    function structureProposalRequiresChapterReplacement(proposalChapters, currentChapters) {
        const proposalById = new Map((proposalChapters || []).map(chapter => [String(chapter?.id || ''), chapter]));
        const currentById = new Map((currentChapters || []).map(chapter => [String(chapter?.id || ''), chapter]));
        for (const chapter of currentChapters || []) {
            if (!structureChapterHasText(chapter)) continue;
            const next = proposalById.get(String(chapter?.id || ''));
            if (!next || !sameStructureParagraphs(chapter, next)) return true;
        }
        for (const chapter of proposalChapters || []) {
            if (!structureChapterHasText(chapter)) continue;
            const current = currentById.get(String(chapter?.id || ''));
            if (!current || !sameStructureParagraphs(chapter, current)) return true;
        }
        return false;
    }

    function refreshViewsAfterStructureChange() {
        renderBookOverview();
        renderWriterDeskView();
        renderWritingView();
        renderStructureModule();
        if (window.renderNavList) window.renderNavList();
        const sel = window.currentEditSelection || {};
        if (
            window.loadParagraph &&
            sel.cIndex !== null &&
            sel.cIndex !== undefined &&
            window.manuscriptData?.chapters?.[sel.cIndex]
        ) {
            const chapter = window.manuscriptData.chapters[sel.cIndex];
            const nextPIndex = Math.min(Math.max(sel.pIndex || 0, 0), Math.max(0, (chapter.paragraphs || []).length - 1));
            window.loadParagraph(sel.cIndex, nextPIndex, null);
        }
    }

    async function acceptStructureProposal() {
        if (!structureProposalChapters?.length || !window.manuscriptData) return;
        const cleanProposalChapters = sanitizeChaptersForTextStorage(structureProposalChapters);
        const paragraphCount = cleanProposalChapters.reduce((sum, chapter) => sum + (chapter.paragraphs || []).length, 0);
        if (!confirm(`Hyväksytäänkö ehdotettu rakenne?\n\n${cleanProposalChapters.length} osiota, ${paragraphCount} tekstikappaletta.`)) {
            return;
        }
        const currentChapters = window.manuscriptData.chapters || [];
        const replaceChapterLayout = structureProposalRequiresChapterReplacement(cleanProposalChapters, currentChapters);
        window.manuscriptData.chapters = cleanProposalChapters;
        window.manuscriptData.analysis = window.manuscriptData.analysis || {};
        window.manuscriptData.analysis.structure_completed = true;
        window.manuscriptData.analysis.structure_status = 'accepted';
        window.manuscriptData.analysis.structure_completed_at = new Date().toISOString();
        writingSelection = { cIndex: firstBodyChapterIndex(structureProposalChapters), pIndex: 0 };
        window.currentEditSelection = { cIndex: writingSelection.cIndex, pIndex: 0 };
        if (replaceChapterLayout) {
            await window.replaceProjectChaptersInDB(window.manuscriptData);
        } else {
            await window.saveProjectStructureToDB(window.manuscriptData);
        }
        structureProposalChapters = null;
        const proposalEl = document.getElementById('structure-proposal');
        if (proposalEl) proposalEl.value = '';
        refreshViewsAfterStructureChange();
        setStructureStatus('Rakenne hyväksytty ja tallennettu.');
    }

    const geminiMagicText = `Musta pimeys kietoi ikiaikaisen varjometsän syliinsä, ja puut piirtyivät taivasta vasten kuin sysimustat kynnet. Jokin liikkui äänettömästi aluskasvillisuuden seassa – askeleet olivat huomaamattomat, mutta ilmassa lepäsi odottava jännite. Hahmo oli epäilemättä taikaolennon kaltainen; ehkäpä matkalainen etsimässä loistavaa kiveä.
    
"Totisesti, täällä noitien pimeys on valtaisa," hahmo lausui, ja sen ääni muistutti kuivien lehtien rapinaa.`;

    if(aiBtn) {
        aiBtn.addEventListener('click', () => {
            const sourceText = selectedEditText();
            if (!sourceText || sourceText.length < 5) {
                alert('Valitse ensin luku rakenteesta ennen muokkausta.');
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
                alert('Valitse osio ensin.');
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
                ? getFullManuscriptText({ ...window.manuscriptData, chapters: repairMisplacedStructureHeadings(window.manuscriptData.chapters) })
                : (chapter?.paragraphs || []).join('\n\n');
            if (!sourceText.trim()) {
                if (massEditStatus) massEditStatus.textContent = 'Käsiteltävää tekstiä ei löytynyt.';
                return;
            }
            if (!confirm('Korvataanko nykyinen rakenne ehdotetulla rakenteella?')) return;
            aiRestructureBtn.disabled = true;
            if (massEditStatus) massEditStatus.textContent = 'Haetaan uutta jakoa...';
            try {
                const res = await apiFetch('/api/edit', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        text: sourceText,
                        temperature: 0.2,
                        prompt: 'Jaa teksti uudelleen selkeiksi osiksi, luvuiksi ja kappaleiksi. Tunnista kirjan osat muodossa Osa 1 / Osa I ja jätä ne omiksi otsikoikseen. Palauta vain valmis käsikirjoitusteksti: osan otsikko omalle rivilleen, luvun otsikko omalle rivilleen, ja jätä tyhjä rivi sekä ennen että jälkeen jokaisen osa- tai lukuotsikon. Älä koskaan sijoita osa- tai lukuotsikkoa edellisen luvun viimeisen kappaleen loppuun. Kappaleet erotetaan tyhjällä rivillä. Älä lisää sisällysluetteloa, nimiölehteä, copysivua, sivunumeroita tai selityksiä.'
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Uuden jaon tekeminen epäonnistui.');
                const chapters = sanitizeChaptersForTextStorage(parseRestructuredChapters(data.edited_text || '', '', { useFallbackTitle: false }));
                if (scope === 'book') {
                    window.manuscriptData.chapters = chapters;
                    writingSelection = { cIndex: firstBodyChapterIndex(chapters), pIndex: 0 };
                    window.currentEditSelection = { cIndex: writingSelection.cIndex, pIndex: 0 };
                } else {
                    if (!chapter) throw new Error('Valittua osiota ei löytynyt.');
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
    const coverFormatDefinitions = [
        {
            key: 'print_a5',
            label: 'Painettu kirja A5, 148 x 210 mm',
            detail: 'Yksittäinen etu- tai takakansi. Tekninen kuvasuhde 3:4, jätä reilu leikkausvara ja turvalliset marginaalit.',
            aspectRatio: '3:4',
            kind: 'single',
            widthMm: 148,
            heightMm: 210,
        },
        {
            key: 'print_b_format',
            label: 'Painettu kirja B-format, 130 x 198 mm',
            detail: 'Romaani- ja yleiskirjakoko. Tekninen kuvasuhde 3:4, sommittelu tehdään painokannen pystymuotoon.',
            aspectRatio: '3:4',
            kind: 'single',
            widthMm: 130,
            heightMm: 198,
        },
        {
            key: 'print_5x8',
            label: 'Painettu kirja 5 x 8 tuumaa',
            detail: 'Kompakti kaunokirjallinen pystykansi. Tekninen kuvasuhde 3:4.',
            aspectRatio: '3:4',
            kind: 'single',
            widthMm: 127,
            heightMm: 203,
        },
        {
            key: 'print_6x9',
            label: 'Painettu kirja 6 x 9 tuumaa',
            detail: 'Yleinen trade paperback -koko. Tekninen kuvasuhde 3:4, runsaasti tilaa otsikkotypografialle.',
            aspectRatio: '3:4',
            kind: 'single',
            widthMm: 152,
            heightMm: 229,
        },
        {
            key: 'ebook_epub',
            label: 'E-kirjan kansi / EPUB, 1600 x 2560 px',
            detail: 'Digitaalisiin kauppoihin sopiva pystykansi. Tekninen kuvasuhde 9:16.',
            aspectRatio: '9:16',
            kind: 'single',
            widthPx: 1600,
            heightPx: 2560,
        },
        {
            key: 'audio_square',
            label: 'Äänikirja ja markkinointikuva, neliö',
            detail: 'Neliökuva palveluihin ja kampanjoihin. Ei painokannen mitoitus.',
            aspectRatio: '1:1',
            kind: 'single',
        },
        {
            key: 'full_a5',
            label: 'Koko kansi A5: takakansi + selkä + etukansi',
            detail: 'Täysi kansiaukeama painoa varten. Vasemmalta oikealle: takakansi, selkä, etukansi. Tekninen kuvasuhde 4:3.',
            aspectRatio: '4:3',
            kind: 'full',
            widthMm: 148,
            heightMm: 210,
        },
        {
            key: 'full_b_format',
            label: 'Koko kansi B-format: takakansi + selkä + etukansi',
            detail: 'Täysi kansiaukeama painoa varten. Vasemmalta oikealle: takakansi, selkä, etukansi. Tekninen kuvasuhde 4:3.',
            aspectRatio: '4:3',
            kind: 'full',
            widthMm: 130,
            heightMm: 198,
        },
        {
            key: 'full_6x9',
            label: 'Koko kansi 6 x 9 tuumaa: takakansi + selkä + etukansi',
            detail: 'Täysi kansiaukeama painoa varten. Vasemmalta oikealle: takakansi, selkä, etukansi. Tekninen kuvasuhde 4:3.',
            aspectRatio: '4:3',
            kind: 'full',
            widthMm: 152,
            heightMm: 229,
        },
    ];

    function coverFormatByKey(key) {
        return coverFormatDefinitions.find(format => format.key === key) || coverFormatDefinitions[0];
    }

    function coverSideValue() {
        const value = coverSideSelect?.value || 'front';
        return value === 'back' || value === 'full' ? value : 'front';
    }

    function coverSideLabel(side = coverSideValue()) {
        if (side === 'back') return 'Takakansi';
        if (side === 'full') return 'Koko kansi';
        return 'Etukansi';
    }

    function activeCoverFormat() {
        return coverFormatByKey(coverFormatSelect?.value);
    }

    function renderCoverFormatOptions() {
        if (!coverFormatSelect) return;
        const side = coverSideValue();
        const desiredKind = side === 'full' ? 'full' : 'single';
        const currentValue = coverFormatSelect.value;
        const formats = coverFormatDefinitions.filter(format => format.kind === desiredKind);
        coverFormatSelect.innerHTML = formats
            .map(format => `<option value="${escapeHtml(format.key)}">${escapeHtml(format.label)}</option>`)
            .join('');
        if (formats.some(format => format.key === currentValue)) {
            coverFormatSelect.value = currentValue;
        } else if (desiredKind === 'full') {
            coverFormatSelect.value = 'full_a5';
        } else {
            coverFormatSelect.value = 'print_a5';
        }
        updateCoverFormatNote();
    }

    function updateCoverFormatNote() {
        const format = activeCoverFormat();
        if (coverFormatNote) coverFormatNote.textContent = `${format.detail} Mallille lähetettävä kuvasuhde: ${format.aspectRatio}.`;
        if (coverSpineFields) coverSpineFields.style.display = coverSideValue() === 'full' ? 'grid' : 'none';
    }

    function coverTitleFromProject() {
        return String(window.manuscriptData?.analysis?.product_info?.title || window.manuscriptData?.title || '').trim();
    }

    function coverAuthorFromProject() {
        return String(window.manuscriptData?.analysis?.product_info?.author || window.manuscriptData?.author || '').trim();
    }

    function refreshCoverTextFields(force = false) {
        if (coverTitleInput && (force || !coverTitleInput.value.trim())) coverTitleInput.value = coverTitleFromProject();
        if (coverAuthorInput && (force || !coverAuthorInput.value.trim())) coverAuthorInput.value = coverAuthorFromProject();
        if (coverPageCountInput && !coverPageCountInput.value.trim()) {
            const pageCount = String(window.manuscriptData?.analysis?.product_info?.page_count || '').trim();
            if (pageCount) coverPageCountInput.value = pageCount.replace(/[^\d]/g, '');
        }
    }

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
        renderCoverFormatOptions();
        refreshCoverTextFields();
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

    const productFieldMap = {
        contact_person: 'product-contact-person',
        company: 'product-company',
        address: 'product-address',
        postal_code: 'product-postal-code',
        city: 'product-city',
        phone: 'product-phone',
        email: 'product-email',
        business_id: 'product-business-id',
        product_identifier: 'product-identifier',
        publisher: 'product-publisher',
        publisher_product_id: 'product-publisher-product-id',
        title: 'product-title',
        original_title: 'product-original-title',
        subtitle: 'product-subtitle',
        series_name: 'product-series-name',
        series_number: 'product-series-number',
        author: 'product-author',
        author_role: 'product-author-role',
        author_isni: 'product-author-isni',
        original_author: 'product-original-author',
        contributors: 'product-contributors',
        author_bio: 'product-author-bio',
        master_brand: 'product-master-brand',
        rights_status: 'product-rights-status',
        rights_confirmation: 'product-rights-confirmation',
        isbn_assignment_strategy: 'product-isbn-strategy',
        own_isbns: 'product-own-isbns',
        publisher_logo_note: 'product-publisher-logo-note',
        ai_written: 'product-ai-written',
        ai_interior_images: 'product-ai-interior-images',
        ai_assistance_note: 'product-ai-assistance-note',
        availability: 'product-availability',
        publication_date: 'product-publication-date',
        new_edition_date: 'product-new-edition-date',
        public_date: 'product-public-date',
        publication_year: 'product-publication-year',
        edition_number: 'product-edition-number',
        product_format: 'product-format',
        product_composition: 'product-composition',
        file_format: 'product-file-format',
        epub_version: 'product-epub-version',
        ebook_embargo: 'product-ebook-embargo',
        reading_service_embargo: 'product-reading-service-embargo',
        language: 'product-language',
        original_language: 'product-original-language',
        is_translation: 'product-is-translation',
        translation_note: 'product-translation-note',
        page_count: 'product-page-count',
        illustrations: 'product-illustrations',
        main_content: 'product-main-content',
        other_content: 'product-other-content',
        accessibility: 'product-accessibility',
        accessibility_description: 'product-accessibility-description',
        library_class_letter: 'product-library-class-letter',
        library_class: 'product-library-class',
        product_group: 'product-product-group',
        genre: 'product-genre',
        main_subject: 'product-main-subject',
        additional_subjects: 'product-additional-subjects',
        thema_classes: 'product-thema',
        keywords: 'product-keywords',
        audience: 'product-audience',
        age_recommendation: 'product-age',
        protection_method: 'product-protection-method',
        protection_type: 'product-protection-type',
        short_description: 'product-short',
        long_description: 'product-long',
        backcover: 'product-backcover',
        sales_points: 'product-sales-points',
        cover_image_note: 'product-cover-image-note',
        onix_summary: 'product-onix',
        vat_status: 'product-vat-status',
        price_type: 'product-price-type',
        price: 'product-price',
        discount: 'product-discount',
        price_group: 'product-price-group',
        vat_rate: 'product-vat-rate',
        self_publish_price: 'product-self-publish-price',
        customs_code: 'product-customs-code',
        manufacturing_country: 'product-manufacturing-country',
        free_message: 'product-free-message'
    };

    const productRequiredFieldKeys = new Set([
        'contact_person',
        'company',
        'address',
        'postal_code',
        'city',
        'phone',
        'email',
        'isbn_assignment_strategy',
        'publisher',
        'title',
        'author',
        'rights_status',
        'availability',
        'publication_year',
        'product_format',
        'language',
        'short_description'
    ]);

    const productManualFieldKeys = new Set([
        'contact_person',
        'company',
        'address',
        'postal_code',
        'city',
        'phone',
        'email',
        'business_id',
        'product_identifier',
        'publisher',
        'publisher_product_id',
        'rights_status',
        'rights_confirmation',
        'isbn_assignment_strategy',
        'own_isbns',
        'publisher_logo_note',
        'ai_written',
        'ai_interior_images',
        'ai_assistance_note',
        'availability',
        'publication_date',
        'new_edition_date',
        'public_date',
        'publication_year',
        'edition_number',
        'price',
        'discount',
        'price_group',
        'vat_status',
        'vat_rate',
        'self_publish_price',
        'customs_code',
        'manufacturing_country'
    ]);

    function setProductStatus(message, isError = false) {
        const status = document.getElementById('product-status');
        if (!status) return;
        status.textContent = message;
        status.style.color = isError ? '#ffb4b4' : 'var(--text-secondary)';
    }

    function collectProductFields() {
        const info = {};
        Object.entries(productFieldMap).forEach(([key, id]) => {
            const element = document.getElementById(id);
            info[key] = String(element?.value || '').trim();
        });
        info.missing_fields = productMissingFieldKeys(info);
        return info;
    }

    function productMissingFieldKeys(info = collectProductFields()) {
        const existing = new Set(Array.isArray(info?.missing_fields) ? info.missing_fields : []);
        Object.keys(productFieldMap).forEach(key => {
            if (String(info?.[key] || '').trim()) existing.delete(key);
        });
        productRequiredFieldKeys.forEach(key => {
            if (!String(info?.[key] || '').trim()) existing.add(key);
            else existing.delete(key);
        });
        return Array.from(existing).sort();
    }

    function markProductMissingFields(info = collectProductFields()) {
        const missing = new Set(productMissingFieldKeys(info));
        document.querySelectorAll('.product-field-row').forEach(row => {
            const key = row.dataset.productKey;
            row.classList.toggle('product-missing', Boolean(key && missing.has(key)));
        });
        return missing.size;
    }

    function productInfoFromAnalysis() {
        const analysis = window.manuscriptData?.analysis || {};
        const saved = analysis.product_info && typeof analysis.product_info === 'object' ? analysis.product_info : {};
        const info = {};
        Object.keys(productFieldMap).forEach(key => {
            info[key] = String(saved[key] || '').trim();
        });
        info.title = info.title || window.manuscriptData?.title || '';
        info.author = info.author || window.manuscriptData?.author || '';
        info.author_role = info.author_role || (info.author ? 'Tekijä, kirjoittaja' : '');
        info.contributors = info.contributors || (info.author ? `Kirjailija: ${info.author}` : '');
        info.product_format = info.product_format || 'Painettu kirja / e-kirja';
        info.language = info.language || 'suomi';
        info.is_translation = info.is_translation || 'Ei';
        info.ai_written = info.ai_written || 'Ei';
        info.ai_interior_images = info.ai_interior_images || 'Ei';
        info.main_content = info.main_content || 'Tekstiä';
        info.audience = info.audience || analysis.audience || '';
        info.genre = info.genre || analysis.genre || '';
        info.product_group = info.product_group || info.genre || '';
        info.thema_classes = info.thema_classes || analysis.thema_classes || '';
        info.main_subject = info.main_subject || analysis.main_subject || info.thema_classes || info.genre || '';
        info.additional_subjects = info.additional_subjects || analysis.additional_subjects || '';
        info.library_class = info.library_class || analysis.library_class || '';
        info.keywords = info.keywords || analysis.keywords || '';
        info.short_description = info.short_description || analysis.marketing_short || '';
        info.long_description = info.long_description || analysis.marketing_long || '';
        info.backcover = info.backcover || analysis.backcover || analysis.backcover_text || '';
        info.onix_summary = info.onix_summary || analysis.onix || '';
        info.missing_fields = Array.isArray(saved.missing_fields) ? saved.missing_fields : [];
        info.missing_fields = productMissingFieldKeys(info);
        return info;
    }

    function setProductFields(info, force = false) {
        Object.entries(productFieldMap).forEach(([key, id]) => {
            setMarketingFieldValue(id, info?.[key] || '', force);
        });
        markProductMissingFields();
    }

    function mergeProductInfo(existing, generated) {
        const merged = {};
        Object.keys(productFieldMap).forEach(key => {
            const currentValue = String(existing?.[key] || '').trim();
            const generatedValue = String(generated?.[key] || '').trim();
            if (currentValue && productManualFieldKeys.has(key)) {
                merged[key] = currentValue;
            } else if (generatedValue) {
                merged[key] = generatedValue;
            } else {
                merged[key] = currentValue;
            }
        });
        merged.missing_fields = productMissingFieldKeys({
            ...merged,
            missing_fields: Array.isArray(generated?.missing_fields) ? generated.missing_fields : []
        });
        return merged;
    }

    function applyProductInfoToAnalysis(info) {
        if (!window.manuscriptData) return;
        if (!window.manuscriptData.analysis) window.manuscriptData.analysis = {};
        window.manuscriptData.analysis.product_info = info;
        window.manuscriptData.analysis.onix = info.onix_summary || '';
        if (info.audience) window.manuscriptData.analysis.audience = info.audience;
        if (info.genre) window.manuscriptData.analysis.genre = info.genre;
        if (info.main_subject) window.manuscriptData.analysis.main_subject = info.main_subject;
        if (info.additional_subjects) window.manuscriptData.analysis.additional_subjects = info.additional_subjects;
        if (info.thema_classes) window.manuscriptData.analysis.thema_classes = info.thema_classes;
        if (info.library_class) window.manuscriptData.analysis.library_class = info.library_class;
        if (info.keywords) window.manuscriptData.analysis.keywords = info.keywords;
        if (info.short_description) window.manuscriptData.analysis.marketing_short = info.short_description;
        if (info.long_description) window.manuscriptData.analysis.marketing_long = info.long_description;
        if (info.backcover) window.manuscriptData.analysis.backcover = info.backcover;
    }

    async function saveProductInfo() {
        if (!window.manuscriptData) {
            setProductStatus('Valitse käsikirjoitus ensin.', true);
            return null;
        }
        const info = collectProductFields();
        applyProductInfoToAnalysis(info);
        const savedProject = await window.saveManuscriptToDB(window.manuscriptData);
        if (savedProject?.id) window.manuscriptData = savedProject;
        setProductFields(info, true);
        renderAnalysisSummary(window.manuscriptData.analysis);
        renderMarketingMaterialsFromAnalysis(false);
        const missingCount = markProductMissingFields(info);
        const syncPending = Boolean(window.manuscriptData?._db_sync_pending);
        const suffix = missingCount ? `${missingCount} tärkeää kenttää odottaa täydennystä.` : 'Tärkeät kentät ovat täytettynä.';
        setProductStatus(syncPending ? `Tuotetiedot tallennettu paikallisesti, tietokantasynkronointi odottaa. ${suffix}` : `Tuotetiedot tallennettu. ${suffix}`, syncPending);
        return info;
    }

    function renderProductInfo(force = false) {
        const current = document.getElementById('product-current-project');
        if (current) {
            current.textContent = window.manuscriptData
                ? `Käsikirjoitus: ${window.manuscriptData.title || 'Nimetön'}`
                : 'Käsikirjoitus: [Ei aktiivista teosta]';
        }
        if (!window.manuscriptData) {
            setProductFields({}, true);
            setProductStatus('Valitse käsikirjoitus ensin.', true);
            return;
        }
        const info = productInfoFromAnalysis();
        setProductFields(info, force);
        const missingCount = markProductMissingFields();
        if (!hasSavedAnalysis(window.manuscriptData.analysis)) {
            setProductStatus('Tee ensin analyysi, jotta tuotetiedot voidaan muodostaa teoksen metatiedoista.', true);
        } else if (window.manuscriptData.analysis?.product_info) {
            setProductStatus(missingCount ? `Tallennetut tuotetiedot ladattu. ${missingCount} tärkeää kenttää odottaa täydennystä.` : 'Tallennetut tuotetiedot ladattu.');
        } else {
            setProductStatus('Analyysi löytyi. Voit generoida tuotetietoluonnoksen AI:lla.');
        }
    }

    async function generateProductInfo() {
        if (!window.manuscriptData) {
            setProductStatus('Valitse käsikirjoitus ensin.', true);
            return null;
        }
        if (!hasSavedAnalysis(window.manuscriptData.analysis)) {
            setProductStatus('Tee analyysi ensin. Tuotetiedot hyödyntävät analyysin genreä, kohderyhmää, synopsista ja metatietoja.', true);
            return null;
        }
        if (!window.manuscriptData.id) {
            const savedProject = await window.saveManuscriptToDB(window.manuscriptData);
            if (savedProject?.id) window.manuscriptData = savedProject;
        }
        if (!window.manuscriptData?.id) {
            setProductStatus('Käsikirjoitusta ei saatu tallennettua ennen tuotetietojen generointia.', true);
            return null;
        }

        const button = document.getElementById('product-generate-btn');
        if (button) button.disabled = true;
        setProductStatus('Generoidaan tuotetietoja analyysin ja käsikirjoitustietojen pohjalta...');
        try {
            const res = await apiFetch('/api/product-info/generate', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ project_id: window.manuscriptData.id })
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.detail || 'Tuotetietojen generointi epäonnistui.');
            const merged = mergeProductInfo(collectProductFields(), data);
            applyProductInfoToAnalysis(merged);
            const savedProject = await window.saveManuscriptToDB(window.manuscriptData);
            if (savedProject?.id) window.manuscriptData = savedProject;
            setProductFields(merged, true);
            renderAnalysisSummary(window.manuscriptData.analysis);
            renderMarketingMaterialsFromAnalysis(false);
            const missingCount = markProductMissingFields(merged);
            const missingText = missingCount ? ` ${missingCount} tärkeää kenttää jäi käsin täydennettäväksi.` : '';
            setProductStatus(data.warnings ? `${data.warnings}${missingText} Lähde: ${data.generated_by}.` : `Tuotetiedot generoitu ja tallennettu.${missingText} Lähde: ${data.generated_by}.`);
            loadUsage();
            return merged;
        } catch (err) {
            setProductStatus(err.message, true);
            alert('Tuotetietojen generointi epäonnistui: ' + networkFailureMessage(err));
            loadUsage();
            return null;
        } finally {
            if (button) button.disabled = false;
        }
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
            if (!window.manuscriptData.analysis) window.manuscriptData.analysis = {};
            window.manuscriptData.analysis.marketing_short = data.short_description || '';
            window.manuscriptData.analysis.marketing_long = data.long_description || '';
            window.manuscriptData.analysis.instagram_post = data.instagram_post || '';
            window.manuscriptData.analysis.facebook_post = data.facebook_post || '';
            window.manuscriptData.analysis.video_script = data.video_script || '';
            window.manuscriptData.analysis.hashtags = data.hashtags || '';
            await window.saveManuscriptToDB(window.manuscriptData);
            renderProductInfo(false);
            setMarketingStatus(data.warnings ? `${data.warnings} Lähde: ${data.generated_by}.` : `Markkinointiaineistot luotu. Lähde: ${data.generated_by}.`);
            loadUsage();
            return data;
        } catch (err) {
            setMarketingStatus(err.message, true);
            alert('Markkinointiaineistojen luonti epäonnistui: ' + networkFailureMessage(err));
            loadUsage();
            return null;
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
            const typeLabel = item.asset_type === 'full_cover_image'
                ? 'Koko kansi'
                : item.asset_type === 'back_cover_image'
                    ? 'Takakansi'
                    : 'Etukansi';
            const imageShape = item.asset_type === 'full_cover_image'
                ? 'aspect-ratio:4 / 3; object-fit:contain;'
                : 'aspect-ratio:3 / 4; object-fit:cover;';
            const card = document.createElement('div');
            card.className = 'card glass-panel';
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.gap = '12px';
            card.innerHTML = `
                <img src="${item.data_url}" alt="${escapeHtml(item.title)}" style="width:100%; ${imageShape} border-radius:8px; border:1px solid var(--border-color); background:rgba(0,0,0,0.16);">
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

        const coverSide = coverSideValue();
        const format = activeCoverFormat();
        const titleText = coverTitleInput?.value.trim() || coverTitleFromProject();
        const authorText = coverAuthorInput?.value.trim() || coverAuthorFromProject();
        const prompt = (coverPrompt?.value || '').trim();
        const fallbackPrompt = coverSide === 'back'
            ? analysisBackCoverText()
            : coverSide === 'full'
                ? [analysisCoverPrompt(), analysisBackCoverText()].filter(Boolean).join('\n\nTakakansiteksti:\n')
                : analysisCoverPrompt();
        if (!prompt && fallbackPrompt && coverPrompt) {
            coverPrompt.value = fallbackPrompt;
        }

        if (coverGenerateBtn) coverGenerateBtn.disabled = true;
        if (coverLatestPreview) {
            coverLatestPreview.innerHTML = `<div style="text-align:center; color:var(--text-secondary);">Generoidaan: ${coverSideLabel(coverSide)}...</div>`;
        }
        setIllustrationStatus(`${coverSideLabel(coverSide)} generoidaan formaattiin ${format.label}. Tässä voi mennä hetki.`);

        try {
            const res = await apiFetch(`/api/projects/${window.manuscriptData.id}/cover-images`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    prompt: (coverPrompt?.value || '').trim(),
                    cover_side: coverSide,
                    model: coverModelSelect?.value || null,
                    cover_format: format.key,
                    aspect_ratio: format.aspectRatio,
                    title_text: titleText,
                    author_text: authorText,
                    spine_width_mm: coverSpineWidthInput?.value ? Number(coverSpineWidthInput.value) : null,
                    page_count: coverPageCountInput?.value ? Number(coverPageCountInput.value) : null,
                })
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.detail || 'Kansikuvan generointi epäonnistui.');
            setIllustrationStatus(`${coverSideLabel(coverSide)} tallennettu käsikirjoitukselle.`);
            await loadCoverImages();
            loadUsage();
        } catch (err) {
            if (coverLatestPreview) {
                coverLatestPreview.innerHTML = `${coverSideLabel(coverSide)} ei saatu generoitua.`;
            }
            const message = String(err?.message || err || '');
            setIllustrationStatus(message.includes('Failed to fetch') ? networkFailureMessage(err, 'cover') : message, true);
        } finally {
            if (coverGenerateBtn) coverGenerateBtn.disabled = false;
        }
    }

    if (coverLoadPromptBtn) {
        coverLoadPromptBtn.addEventListener('click', () => {
            const side = coverSideValue();
            const isBackCover = side === 'back';
            const isFullCover = side === 'full';
            const prompt = isFullCover
                ? [analysisCoverPrompt(), analysisBackCoverText()].filter(Boolean).join('\n\nTakakansiteksti:\n')
                : isBackCover ? analysisBackCoverText() : analysisCoverPrompt();
            if (!prompt) {
                setIllustrationStatus(isFullCover
                    ? 'Analyysista ei löytynyt etukannen promptia tai takakansitekstiä. Voit kirjoittaa täyden kannen ohjeen käsin.'
                    : isBackCover
                    ? 'Analyysista ei löytynyt takakansitekstiä. Voit kirjoittaa sen käsin.'
                    : 'Analyysista ei löytynyt kansikuvapromptia. Voit kirjoittaa promptin käsin.', true);
                return;
            }
            if (coverPrompt) coverPrompt.value = prompt;
            setIllustrationStatus(isFullCover ? 'Etukannen prompti ja takakansiteksti ladattu kenttään.' : isBackCover ? 'Takakansiteksti ladattu kenttään.' : 'Analyysin kansikuvaprompti ladattu kenttään.');
        });
    }

    if (coverSideSelect) {
        coverSideSelect.addEventListener('change', renderCoverFormatOptions);
    }
    if (coverFormatSelect) {
        coverFormatSelect.addEventListener('change', updateCoverFormatNote);
        renderCoverFormatOptions();
    }

    if (coverGenerateBtn) {
        coverGenerateBtn.addEventListener('click', generateCoverImage);
    }

    function layoutFileName(asset) {
        const safeTitle = (window.manuscriptData?.title || 'kasikirjoitus').toLowerCase().replace(/[^a-z0-9åäö]+/gi, '-').replace(/^-|-$/g, '') || 'kasikirjoitus';
        if (asset.asset_type === 'layout_pdf') return `${safeTitle}.pdf`;
        if (asset.asset_type === 'layout_epub') return `${safeTitle}.epub`;
        return `${safeTitle}.tex`;
    }

    function layoutAssetLabel(asset) {
        if (asset.asset_type === 'layout_pdf') return 'PDF-taittovedos';
        if (asset.asset_type === 'layout_epub') return 'EPUB-e-kirja';
        return 'LaTeX-lähde';
    }

    function downloadAsset(asset) {
        if (!asset?.data_url) return;
        const link = document.createElement('a');
        link.href = asset.data_url;
        link.download = layoutFileName(asset);
        link.click();
    }

	    function renderLayoutAssets(items = []) {
	        currentLayoutAssets = Array.isArray(items) ? items : [];
	        const container = document.getElementById('layout-assets');
	        const status = document.getElementById('layout-status');
	        if (!container) return;
	        container.innerHTML = '';
	        if (!items.length) {
	            if (status) status.textContent = 'Ei ajettua taittoa vielä.';
	            renderWriterStage();
	            return;
	        }
	        if (status) status.textContent = 'Taittotiedostot tallennettu käsikirjoitukselle.';
	        renderWriterStage();
	        items.forEach(asset => {
            const card = document.createElement('div');
            card.className = 'card glass-panel';
            card.innerHTML = `
                <strong>${escapeHtml(layoutAssetLabel(asset))}</strong>
                <p class="card-meta">${escapeHtml(asset.title || '')}</p>
                <p class="card-meta">${escapeHtml(asset.model || 'python:layout-generator')}</p>
                <button class="btn btn-secondary layout-download-btn" type="button">Lataa ${asset.asset_type === 'layout_pdf' ? 'PDF' : asset.asset_type === 'layout_epub' ? 'EPUB' : 'LaTeX'}</button>
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
            renderLayoutAssets([data.pdf, data.epub, data.latex].filter(Boolean));
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

    function proofreadExtraRulesValue() {
        return localStorage.getItem(EXTRA_PROOFREAD_RULES_KEY) || DEFAULT_EXTRA_PROOFREAD_RULES;
    }

    function renderProofreadExtraRules(force = false) {
        const textarea = document.getElementById('proofread-extra-rules');
        if (!textarea) return;
        if (force || !textarea.value.trim()) {
            textarea.value = proofreadExtraRulesValue();
        }
    }

    function saveProofreadExtraRules() {
        const textarea = document.getElementById('proofread-extra-rules');
        const status = document.getElementById('proofread-extra-rules-status');
        if (!textarea) return;
        localStorage.setItem(EXTRA_PROOFREAD_RULES_KEY, textarea.value.trim() || DEFAULT_EXTRA_PROOFREAD_RULES);
        if (status) status.textContent = `Sääntöprompti tallennettu ${formatSaveTimestamp()}.`;
    }

    function resetProofreadExtraRules() {
        const textarea = document.getElementById('proofread-extra-rules');
        const status = document.getElementById('proofread-extra-rules-status');
        localStorage.removeItem(EXTRA_PROOFREAD_RULES_KEY);
        if (textarea) textarea.value = DEFAULT_EXTRA_PROOFREAD_RULES;
        if (status) status.textContent = 'Oletussäännöt palautettu.';
    }

    function updateProofreadExtraScopeUi() {
        const scope = document.getElementById('proofread-extra-scope')?.value || 'pdf';
        const uploadRow = document.getElementById('proofread-pdf-upload-row');
        const fileInput = document.getElementById('proofread-pdf-file');
        const fileStatus = document.getElementById('proofread-pdf-file-status');
        if (uploadRow) uploadRow.classList.toggle('hidden', scope !== 'pdf');
        if (fileStatus) {
            if (scope === 'pdf') {
                const fileName = fileInput?.files?.[0]?.name;
                fileStatus.textContent = fileName
                    ? `Valittu tiedosto: ${fileName}`
                    : 'Valitse PDF-tiedosto, jonka teksti tarkistetaan erillisenä aineistona.';
            } else {
                fileStatus.textContent = '';
            }
        }
    }

    function showProofreadPanel(panelId = 'proofread-panel-chapter') {
        proofreadPanel = panelId;
        document.querySelectorAll('.proofread-panel').forEach(panel => {
            panel.classList.toggle('hidden', panel.id !== panelId);
        });
        document.querySelectorAll('.proofread-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.proofreadPanel === panelId);
        });
        const runButton = document.getElementById('proofread-run-btn');
        if (runButton) runButton.classList.toggle('hidden', panelId !== 'proofread-panel-chapter');
        if (panelId === 'proofread-panel-pdf') {
            renderProofreadExtraRules();
            updateProofreadExtraScopeUi();
        }
    }

    function renderProofreadExtraFindings(summary = '') {
        const list = document.getElementById('proofread-extra-list');
        const count = document.getElementById('proofread-extra-count');
        const status = document.getElementById('proofread-extra-status');
        if (!list) return;
        if (count) count.textContent = `${proofreadExtraFindings.length} löydöstä`;
        if (status && summary) status.textContent = summary;
        if (!proofreadExtraFindings.length) {
            list.innerHTML = '<p style="color:var(--text-secondary);">Ei löydöksiä vielä.</p>';
            return;
        }
        list.innerHTML = proofreadExtraFindings.map(item => `
            <div class="proofread-suggestion">
                <span class="badge">${escapeHtml(item.category || 'Tarkistus')}</span>
                <p><strong>Sijainti:</strong> ${escapeHtml(item.location || 'Ei tarkkaa sijaintia')}</p>
                <p><strong>Kohta:</strong><br>${escapeHtml(item.excerpt || '')}</p>
                <p><strong>Havainto:</strong> ${escapeHtml(item.issue || '')}</p>
                <p><strong>Ehdotus:</strong> ${escapeHtml(item.suggestion || 'Tarkista kohta käsin.')}</p>
                <p class="card-meta">Vakavuus: ${escapeHtml(item.severity || 'tarkista')}</p>
            </div>
        `).join('');
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
        renderProofreadExtraRules();
        showProofreadPanel(proofreadPanel);
        updateProofreadExtraScopeUi();
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

    async function runProofreadExtraCheck() {
        const button = document.getElementById('proofread-extra-run-btn');
        const status = document.getElementById('proofread-extra-status');
        const scope = document.getElementById('proofread-extra-scope')?.value || 'pdf';
        const rules = document.getElementById('proofread-extra-rules')?.value?.trim() || DEFAULT_EXTRA_PROOFREAD_RULES;
        const chapterIndex = Number(document.getElementById('proofread-chapter-select')?.value ?? proofreadSelection.cIndex ?? 0);
        const pdfFile = document.getElementById('proofread-pdf-file')?.files?.[0] || null;

        if (scope === 'pdf') {
            if (!pdfFile) {
                alert('Valitse PDF-tiedosto ensin.');
                return;
            }
            if (!pdfFile.name.toLowerCase().endsWith('.pdf')) {
                alert('Pdf-tarkistin ottaa tässä vaiheessa vastaan PDF-tiedoston.');
                return;
            }
        } else {
            if (!window.manuscriptData?.id) {
                alert('Valitse tai tallenna käsikirjoitus ensin.');
                return;
            }
            if (scope === 'chapter' && !window.manuscriptData.chapters?.[chapterIndex]) {
                alert('Valitse luku ensin.');
                return;
            }
        }

        if (button) button.disabled = true;
        if (status) {
            if (scope === 'pdf') {
                status.textContent = 'Luetaan PDF-tiedosto ja ajetaan Pdf-tarkistus...';
            } else {
                status.textContent = scope === 'book'
                    ? 'Tallennetaan nykyinen versio ja tarkistetaan käsikirjoitusta...'
                    : 'Tallennetaan nykyinen versio ja tarkistetaan valittua lukua...';
            }
        }
        proofreadExtraFindings = [];
        renderProofreadExtraFindings();
        try {
            saveProofreadExtraRules();
            let res;
            if (scope === 'pdf') {
                const formData = new FormData();
                formData.append('file', pdfFile);
                formData.append('rules_prompt', rules);
                if (window.manuscriptData?.id) formData.append('project_id', String(window.manuscriptData.id));
                res = await apiFetch('/api/proofread/pdf-check', {
                    method: 'POST',
                    body: formData
                });
            } else {
                const savedProject = await window.saveManuscriptToDB(window.manuscriptData);
                if (savedProject?.id) window.manuscriptData = savedProject;
                res = await apiFetch('/api/proofread/extra-check', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        project_id: window.manuscriptData.id,
                        scope,
                        chapter_index: chapterIndex,
                        rules_prompt: rules
                    })
                });
            }
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.detail || 'Pdf-tarkistus epäonnistui.');
            proofreadExtraFindings = Array.isArray(data.findings) ? data.findings : [];
            const summary = [
                data.summary || `${proofreadExtraFindings.length} löydöstä.`,
                data.warnings || ''
            ].filter(Boolean).join(' ');
            renderProofreadExtraFindings(summary);
            loadUsage();
        } catch (err) {
            if (status) status.textContent = err.message;
            alert('Pdf-tarkistus epäonnistui: ' + err.message);
            loadUsage();
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function acceptProofreadSuggestion(index) {
        const suggestion = proofreadSuggestions[index];
        const chapter = window.manuscriptData?.chapters?.[proofreadSelection.cIndex];
        if (!suggestion || !chapter) return;
        const changed = applyProofreadSuggestionToChapter(chapter, suggestion);
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

    function applyProofreadSuggestionToChapter(chapter, suggestion) {
        if (!chapter || !suggestion?.original || !suggestion?.replacement) return false;
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
        return changed;
    }

    function bodyChapterEntries() {
        return (window.manuscriptData?.chapters || [])
            .map((chapter, index) => ({ chapter, index }))
            .filter(({ chapter, index }) => chapterPlacement(chapter, index) === 'body' && (chapter.paragraphs || []).join('').trim());
    }

    function defaultWorkflowSteps(mode = 'light') {
        const steps = [
            { id: 'analysis', title: 'Rakenne ja analyysi', detail: 'Muodostetaan kokonaiskuva, tyyli, synopsis ja metatiedot.', status: 'pending' },
            { id: 'structure', title: 'Kirjan osiot', detail: 'Tarkistetaan ja tallennetaan etusivut, päätekstin osiot ja lopputekstit.', status: 'pending' },
            { id: 'misc', title: 'Oheisaineistot', detail: 'Luodaan nimiölehti, copysivu, sisällysluettelo ja tarvittavat hakemistot.', status: 'pending' },
            { id: 'layout', title: 'Taitto ja e-kirja', detail: 'Luodaan PDF-taittovedos, LaTeX-lähde ja EPUB-luonnos.', status: 'pending' }
        ];
        if (mode === 'heavy') {
            steps.splice(2, 0,
                { id: 'edit', title: 'Editointi luvuittain', detail: 'Käydään luvut läpi ja sujuvoitetaan teksti varovaisesti.', status: 'pending' },
                { id: 'proofread', title: 'Oikoluku ja viimeistely luvuittain', detail: 'Haetaan selkeät virheet ja hyväksytään suorat korjaukset.', status: 'pending' },
                { id: 'product', title: 'Tuotetiedot', detail: 'Päätellään kohderyhmä, luokitukset, kuvaukset ja ONIX-kooste.', status: 'pending' },
                { id: 'marketing', title: 'Markkinointiaineistot', detail: 'Luodaan lyhyt ja pitkä kuvaus, some-tekstit, videokäsikirjoitus ja hashtagit.', status: 'pending' },
                { id: 'covers', title: 'Kansi ja kuvitus', detail: 'Luodaan etukannen ja takakannen luonnokset analyysin perusteella.', status: 'pending' }
            );
            steps.push({ id: 'audio', title: 'Audio (Äänikirja)', detail: 'Äänikirja on raskaan työnkulun viimeinen tuotantovaihe ja edellyttää äänen valintaa.', status: 'pending' });
        }
        return steps;
    }

    function renderWorkflowSteps() {
        const container = document.getElementById('workflow-steps');
        if (!container) return;
        container.innerHTML = workflowSteps.map((step, index) => {
            const icon = step.status === 'done' ? '✓' : step.status === 'error' ? '!' : step.status === 'running' ? '…' : String(index + 1);
            return `
                <div class="workflow-step ${escapeHtml(step.status || 'pending')}">
                    <div class="workflow-step-icon">${escapeHtml(icon)}</div>
                    <div>
                        <strong>${escapeHtml(step.title)}</strong>
                        <p>${escapeHtml(step.detail || '')}</p>
                    </div>
                </div>
            `;
        }).join('');
    }

    function setWorkflowStep(id, status, detail) {
        const step = workflowSteps.find(item => item.id === id);
        if (!step) return;
        step.status = status;
        if (detail) step.detail = detail;
        renderWorkflowSteps();
    }

    function setWorkflowStatus(message, isError = false) {
        const status = document.getElementById('workflow-status');
        if (!status) return;
        status.textContent = message;
        status.style.color = isError ? '#ffb4b4' : 'var(--text-secondary)';
    }

    function renderWorkflowView() {
        const mode = document.getElementById('workflow-mode')?.value || 'light';
        const project = window.manuscriptData;
        const current = document.getElementById('workflow-current-project');
        const desc = document.getElementById('workflow-mode-description');
        const startButton = document.getElementById('workflow-start-btn');
        const chapterCount = document.getElementById('workflow-chapter-count');
        const charCount = document.getElementById('workflow-char-count');
        const estimate = document.getElementById('workflow-estimate');
        const bodyCount = bodyChapterEntries().length;
        const chars = getFullManuscriptText(project).length;
        const heavyLocked = currentUser?.role === 'kirjailija' && mode === 'heavy';
        if (!workflowSteps.length) workflowSteps = defaultWorkflowSteps(mode);
        if (current) current.textContent = project ? `Käsikirjoitus: ${project.title || 'Nimetön'}` : 'Valitse käsikirjoitus ja käynnistä koko tuotantopolku yhdellä napilla.';
        if (desc) {
            desc.textContent = heavyLocked
                ? 'Raskas versio kuuluu laajempaan tilaukseen. Kirjailijan perusnäkymässä käytössä on kevyt työnkulku.'
                : mode === 'heavy'
                ? 'Raskas versio analysoi, editoi ja oikolukee luvut, luo tuotetiedot, markkinointiaineistot, oheisaineistot, kannet, taittotiedostot, EPUB-luonnoksen ja lisää audion valmisteluvaiheeksi.'
                : 'Kevyt versio analysoi tekstin, tarkistaa luvutuksen, tekee oheisaineistot ja ajaa taiton.';
        }
        if (chapterCount) chapterCount.textContent = formatNumber(bodyCount || (project?.chapters || []).length);
        if (charCount) charCount.textContent = formatNumber(chars);
        if (estimate) estimate.textContent = mode === 'heavy'
            ? `${Math.max(8, bodyCount * 2)}+ min`
            : `${Math.max(3, Math.ceil(chars / 180000))}+ min`;
        if (startButton && !workflowRunning) {
            startButton.disabled = heavyLocked;
            startButton.textContent = heavyLocked ? 'Päivitä tilauksesi' : 'Käynnistä työnkulku';
        }
        if (heavyLocked) setWorkflowStatus('Päivitä tilauksesi', true);
        else if (!project) setWorkflowStatus('Valitse käsikirjoitus ensin.');
        else if (!workflowRunning) setWorkflowStatus('Valmis käynnistämään työnkulku.');
        renderWorkflowSteps();
    }

    async function ensureWorkflowProject() {
        if (!window.manuscriptData?.chapters?.length) throw new Error('Valitse tai lataa käsikirjoitus ensin.');
        const saved = await window.saveManuscriptToDB(window.manuscriptData);
        if (saved?.id) {
            window.manuscriptData = saved;
            updateAvailableProject(saved);
        }
        if (!window.manuscriptData?.id) throw new Error('Käsikirjoitusta ei saatu tallennettua ennen työnkulkua.');
        return window.manuscriptData;
    }

    async function runWorkflowAnalysis() {
        setWorkflowStep('analysis', 'running', 'Analyysi käynnistyy taustatyönä.');
        const startRes = await apiFetch('/api/analyze/jobs', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ project_id: window.manuscriptData.id })
        });
        const startedJob = await startRes.json().catch(() => null);
        if (!startRes.ok) throw new Error(startedJob?.detail || 'Analyysin käynnistys epäonnistui.');
        const finishedJob = await pollAnalysisJob(startedJob.job_id);
        await applyAnalysisResult(finishedJob.data);
        setWorkflowStep('analysis', finishedJob.status === 'partial' ? 'error' : 'done', finishedJob.status === 'partial' ? 'Analyysi valmistui osittaisena. Työnkulku jatkuu saatavilla olevilla tiedoilla.' : 'Analyysi valmis ja tallennettu.');
    }

    async function runWorkflowStructure() {
        setWorkflowStep('structure', 'running', 'Tallennetaan nykyinen osiorakenne.');
        const text = cleanManuscriptText(getFullManuscriptText(window.manuscriptData), { preserveStructure: true });
        if (!text) throw new Error('Käsikirjoituksesta ei löytynyt tekstiä.');
        if (!window.manuscriptData.chapters?.length || window.manuscriptData.chapters.length <= 2) {
            window.manuscriptData.chapters = sanitizeChaptersForTextStorage(parseRestructuredChapters(text, '', { useFallbackTitle: false }));
        }
        await window.replaceProjectChaptersInDB(window.manuscriptData);
        renderBookOverview();
        renderWritingView();
        if (window.renderNavList) window.renderNavList();
        setWorkflowStep('structure', 'done', `${window.manuscriptData.chapters.length} osaa tallennettu.`);
    }

    async function runWorkflowEditChapters() {
        const entries = bodyChapterEntries();
        setWorkflowStep('edit', 'running', `Editoidaan ${entries.length} lukua.`);
        let edited = 0;
        for (const { chapter, index } of entries) {
            const sourceText = (chapter.paragraphs || []).join('\n\n').trim();
            if (!sourceText) continue;
            if (sourceText.length > 60000) {
                setWorkflowStep('edit', 'running', `${chapter.title}: pitkä luku käsitellään kappaleittain.`);
            } else {
                setWorkflowStep('edit', 'running', `${chapter.title}: editointi käynnissä.`);
            }
            if (sourceText.length <= 60000) {
                const res = await apiFetch('/api/edit', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        text: sourceText,
                        temperature: 0.25,
                        prompt: 'Editoi luku varovaisesti. Korjaa selvät kieli- ja rytmiongelmat, poista turhaa toistoa ja säilytä kirjailijan ääni. Säilytä kappalejako mahdollisimman hyvin. Palauta vain valmis luku.'
                    })
                });
                const data = await res.json().catch(() => null);
                if (!res.ok) throw new Error(data?.detail || `${chapter.title}: editointi epäonnistui.`);
                chapter.paragraphs = splitIntoParagraphs(data.edited_text || sourceText);
            } else {
                for (let pIndex = 0; pIndex < chapter.paragraphs.length; pIndex++) {
                    const paragraph = String(chapter.paragraphs[pIndex] || '').trim();
                    if (!paragraph || paragraph.length > 60000) continue;
                    const res = await apiFetch('/api/edit', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            text: paragraph,
                            temperature: 0.2,
                            prompt: 'Korjaa selvät kieli-, rytmi- ja toisto-ongelmat varovaisesti. Säilytä kirjailijan ääni. Palauta vain korjattu kappale.'
                        })
                    });
                    const data = await res.json().catch(() => null);
                    if (res.ok && data?.edited_text) chapter.paragraphs[pIndex] = data.edited_text.trim();
                }
            }
            await window.saveProjectChapterToDB(window.manuscriptData, index);
            edited++;
        }
        renderBookOverview();
        renderWritingView();
        setWorkflowStep('edit', 'done', `${edited} lukua editoitu ja tallennettu.`);
    }

    async function runWorkflowProofreadChapters() {
        const entries = bodyChapterEntries();
        setWorkflowStep('proofread', 'running', `Oikoluetaan ${entries.length} lukua.`);
        let applied = 0;
        const failed = [];
        for (const { chapter, index } of entries) {
            setWorkflowStep('proofread', 'running', `${chapter.title}: oikoluku käynnissä.`);
            try {
                const res = await apiFetch('/api/proofread/chapter', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ project_id: window.manuscriptData.id, chapter_index: index })
                });
                const data = await res.json().catch(() => null);
                if (!res.ok) throw new Error(data?.detail || 'Oikoluku epäonnistui.');
                (data.suggestions || []).forEach(suggestion => {
                    if (applyProofreadSuggestionToChapter(chapter, suggestion)) applied++;
                });
                await window.saveProjectChapterToDB(window.manuscriptData, index);
            } catch (err) {
                failed.push(chapter.title || `Luku ${index + 1}`);
            }
        }
        renderBookOverview();
        renderWritingView();
        setWorkflowStep('proofread', failed.length ? 'error' : 'done', failed.length
            ? `${applied} korjausta hyväksytty. Epäonnistui: ${failed.join(', ')}.`
            : `${applied} selkeää korjausta hyväksytty.`);
    }

    async function runWorkflowMisc(mode) {
        const tools = mode === 'heavy'
            ? ['title_page', 'copyright_page', 'table_of_contents', 'character_index', 'place_index', 'subject_index', 'bibliography']
            : ['title_page', 'copyright_page', 'table_of_contents', 'character_index'];
        setWorkflowStep('misc', 'running', `Luodaan ${tools.length} oheisaineistoa.`);
        for (const tool of tools) {
            const title = miscToolLabel(tool);
            setWorkflowStep('misc', 'running', `${title} työn alla.`);
            const res = await apiFetch('/api/misc-tools/run', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    project_id: window.manuscriptData.id,
                    tool,
                    title: window.manuscriptData.title || '',
                    author: window.manuscriptData.author || '',
                    chapters: window.manuscriptData.chapters || []
                })
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.detail || `${title} epäonnistui.`);
            const saveRes = await apiFetch(`/api/projects/${window.manuscriptData.id}/misc-assets`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    title,
                    content: data.result || '',
                    material_kind: tool,
                    include_in_book: true
                })
            });
            const saved = await saveRes.json().catch(() => null);
            if (!saveRes.ok) throw new Error(saved?.detail || `${title} tallennus epäonnistui.`);
        }
        await loadMiscAssetsForActiveProject(true);
        setWorkflowStep('misc', 'done', 'Oheisaineistot luotu ja lisätty valmiiseen kirjaan.');
    }

    async function runWorkflowCovers() {
        setWorkflowStep('covers', 'running', 'Luodaan etukansi ja takakansi.');
        for (const side of ['front', 'back']) {
            const prompt = side === 'back' ? analysisBackCoverText() : analysisCoverPrompt();
            const res = await apiFetch(`/api/projects/${window.manuscriptData.id}/cover-images`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    prompt,
                    cover_side: side,
                    aspect_ratio: '3:4',
                    cover_format: 'print_a5',
                    title_text: window.manuscriptData.title || '',
                    author_text: window.manuscriptData.author || ''
                })
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.detail || `${side === 'back' ? 'Takakansi' : 'Kansikuva'} epäonnistui.`);
        }
        await loadCoverImages();
        setWorkflowStep('covers', 'done', 'Etukansi ja takakansi tallennettu kuvituksiin.');
    }

    async function runWorkflowProductInfo() {
        setWorkflowStep('product', 'running', 'Generoidaan tuotetietoja.');
        const data = await generateProductInfo();
        if (!data) throw new Error('Tuotetietoja ei saatu generoitua.');
        setWorkflowStep('product', 'done', 'Tuotetiedot ja ONIX-kooste tallennettu.');
    }

    async function runWorkflowMarketingMaterials() {
        setWorkflowStep('marketing', 'running', 'Luodaan markkinointiaineistoja.');
        const data = await generateMarketingMaterials();
        if (!data) throw new Error('Markkinointiaineistoja ei saatu generoitua.');
        setWorkflowStep('marketing', 'done', 'Markkinointiaineistot luotu ja tallennettu analyysitietoihin.');
    }

    async function runWorkflowLayout() {
        setWorkflowStep('layout', 'running', 'Luodaan PDF, LaTeX ja EPUB.');
        const savedProject = await window.saveManuscriptToDB(window.manuscriptData);
        if (savedProject?.id) window.manuscriptData = savedProject;
        const res = await apiFetch(`/api/projects/${window.manuscriptData.id}/layout/run`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                layout_style: 'A5',
                include_markdown_markers: true,
                hyphenation_level: 'balanced'
            })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.detail || 'Taiton ajo epäonnistui.');
        renderLayoutAssets([data.pdf, data.epub, data.latex].filter(Boolean));
        setWorkflowStep('layout', 'done', 'PDF-taittovedos, LaTeX-lähde ja EPUB-luonnos tallennettu.');
    }

    function runWorkflowAudioPlaceholder() {
        setWorkflowStep('audio', 'running', 'Audio (Äänikirja) merkitään viimeiseksi tuotantovaiheeksi.');
        renderAudioView();
        setWorkflowStep('audio', 'done', 'Audio (Äänikirja) edellyttää äänen valintaa. Sanaston, ääntämisohjeet sekä alku- ja loppusanat voi valmistella Audio-osiossa.');
    }

    function setAudioStatus(message, isError = false) {
        const status = document.getElementById('audio-status');
        if (!status) return;
        status.textContent = message;
        status.style.color = isError ? '#ffb4b4' : 'var(--text-secondary)';
    }

    function audioDataFromAnalysis() {
        const audio = window.manuscriptData?.analysis?.audio;
        return audio && typeof audio === 'object' ? audio : {};
    }

    function audioGuideFromAnalysis() {
        return String(audioDataFromAnalysis().pronunciation_guide || '');
    }

    function audioOpeningFromAnalysis() {
        return String(audioDataFromAnalysis().opening_words || '');
    }

    function audioClosingFromAnalysis() {
        return String(audioDataFromAnalysis().closing_words || '');
    }

    function defaultAudioOpeningWords() {
        const title = String(window.manuscriptData?.title || '').trim() || 'Teoksen nimi';
        const author = String(window.manuscriptData?.author || '').trim();
        const lines = [title];
        if (author && author.toLowerCase() !== 'tuntematon') lines.push(`Kirjoittanut ${author}.`);
        return lines.join('\n');
    }

    function defaultAudioClosingWords() {
        const title = String(window.manuscriptData?.title || '').trim() || 'Teos';
        return `${title} päättyy tähän.`;
    }

    function fillDefaultAudioScript(force = false) {
        const opening = document.getElementById('audio-opening-words');
        const closing = document.getElementById('audio-closing-words');
        if (opening && (force || !opening.value.trim())) opening.value = defaultAudioOpeningWords();
        if (closing && (force || !closing.value.trim())) closing.value = defaultAudioClosingWords();
    }

    function populateAudioVoices() {
        const select = document.getElementById('audio-voice-select');
        if (!select || !window.speechSynthesis) return;
        const currentValue = select.value;
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices
            .filter(voice => /^fi|^sv|^en/i.test(voice.lang || ''))
            .concat(voices.filter(voice => !/^fi|^sv|^en/i.test(voice.lang || '')));
        select.innerHTML = '<option value="">Selaimen oletusääni</option>' + preferred
            .map((voice, index) => `<option value="${index}">${escapeHtml(voice.name)} (${escapeHtml(voice.lang || 'kieli ei tiedossa')})</option>`)
            .join('');
        if (currentValue && Array.from(select.options).some(option => option.value === currentValue)) {
            select.value = currentValue;
        }
    }

    function renderAudioView(force = false) {
        const current = document.getElementById('audio-current-project');
        const guide = document.getElementById('audio-pronunciation-guide');
        const opening = document.getElementById('audio-opening-words');
        const closing = document.getElementById('audio-closing-words');
        if (current) {
            current.textContent = window.manuscriptData
                ? `Käsikirjoitus: ${window.manuscriptData.title || 'Nimetön'}`
                : 'Käsikirjoitus: [Ei aktiivista teosta]';
        }
        populateAudioVoices();
        if (!window.manuscriptData) {
            if (guide) guide.value = '';
            if (opening) opening.value = '';
            if (closing) closing.value = '';
            setAudioStatus('Valitse käsikirjoitus ensin.', true);
            return;
        }
        const savedGuide = audioGuideFromAnalysis();
        if (guide && (force || !guide.value.trim())) guide.value = savedGuide;
        const savedOpening = audioOpeningFromAnalysis();
        const savedClosing = audioClosingFromAnalysis();
        if (opening && (force || !opening.value.trim())) opening.value = savedOpening || defaultAudioOpeningWords();
        if (closing && (force || !closing.value.trim())) closing.value = savedClosing || defaultAudioClosingWords();
        setAudioStatus(savedGuide
            ? 'Tallennetut ääntämisohjeet ladattu. Voit muokata ja tallentaa ne.'
            : 'Voit luoda sanaston ja ääntämisohjeet koko kirjasta.');
    }

    async function generateAudioGuide() {
        if (!window.manuscriptData) {
            setAudioStatus('Valitse käsikirjoitus ensin.', true);
            return null;
        }
        if (!window.manuscriptData.id) {
            const savedProject = await window.saveManuscriptToDB(window.manuscriptData);
            if (savedProject?.id) window.manuscriptData = savedProject;
        }
        if (!window.manuscriptData?.id) {
            setAudioStatus('Käsikirjoitusta ei saatu tallennettua ennen ääntämisohjeita.', true);
            return null;
        }
        const button = document.getElementById('audio-guide-btn');
        if (button) button.disabled = true;
        setAudioStatus('Luodaan sanastoa ja ääntämisohjeita koko kirjasta...');
        try {
            const res = await apiFetch('/api/audio/pronunciation-guide', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ project_id: window.manuscriptData.id })
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.detail || 'Ääntämisohjeiden luonti epäonnistui.');
            if (!window.manuscriptData.analysis) window.manuscriptData.analysis = {};
            window.manuscriptData.analysis.audio = {
                ...(window.manuscriptData.analysis.audio || {}),
                pronunciation_guide: data.pronunciation_guide || ''
            };
            const guide = document.getElementById('audio-pronunciation-guide');
            if (guide) guide.value = data.pronunciation_guide || '';
            setAudioStatus(data.warnings ? `${data.warnings} Lähde: ${data.generated_by}.` : `Sanasto ja ääntämisohjeet luotu. Lähde: ${data.generated_by}.`);
            loadUsage();
            return data;
        } catch (err) {
            setAudioStatus(err.message, true);
            alert('Ääntämisohjeiden luonti epäonnistui: ' + networkFailureMessage(err));
            loadUsage();
            return null;
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function saveAudioGuideEdits() {
        if (!window.manuscriptData) {
            setAudioStatus('Valitse käsikirjoitus ensin.', true);
            return;
        }
        const guide = document.getElementById('audio-pronunciation-guide')?.value || '';
        if (!window.manuscriptData.analysis) window.manuscriptData.analysis = {};
        window.manuscriptData.analysis.audio = {
            ...(window.manuscriptData.analysis.audio || {}),
            pronunciation_guide: guide,
            updated_at: new Date().toISOString()
        };
        await window.saveManuscriptToDB(window.manuscriptData);
        setAudioStatus('Ääntämisohjeiden muokkaukset tallennettu.');
    }

    async function saveAudioScriptEdits() {
        if (!window.manuscriptData) {
            setAudioStatus('Valitse käsikirjoitus ensin.', true);
            return;
        }
        const opening = document.getElementById('audio-opening-words')?.value || '';
        const closing = document.getElementById('audio-closing-words')?.value || '';
        if (!window.manuscriptData.analysis) window.manuscriptData.analysis = {};
        window.manuscriptData.analysis.audio = {
            ...(window.manuscriptData.analysis.audio || {}),
            opening_words: opening,
            closing_words: closing,
            updated_at: new Date().toISOString()
        };
        await window.saveManuscriptToDB(window.manuscriptData);
        setAudioStatus('Äänikirjan alku- ja loppusanat tallennettu.');
    }

    function firstAudioSampleText() {
        const entry = bodyChapterEntries()[0];
        if (!entry) return '';
        const chapterText = (entry.chapter.paragraphs || []).filter(Boolean).join('\n\n').trim();
        return chapterText.slice(0, 1200);
    }

    function testAudioVoice() {
        if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
            setAudioStatus('Selaimen puhesynteesi ei ole käytettävissä.', true);
            return;
        }
        const text = firstAudioSampleText();
        if (!text) {
            setAudioStatus('Ensimmäisestä luvusta ei löytynyt kuunneltavaa tekstiä.', true);
            return;
        }
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'fi-FI';
        utterance.rate = Number(document.getElementById('audio-rate-select')?.value || 1);
        const voices = window.speechSynthesis.getVoices();
        const selected = document.getElementById('audio-voice-select')?.value || '';
        if (selected !== '' && voices[Number(selected)]) utterance.voice = voices[Number(selected)];
        utterance.onend = () => setAudioStatus('Äänitesti päättyi.');
        utterance.onerror = () => setAudioStatus('Äänitesti ei onnistunut tällä selaimen äänellä.', true);
        setAudioStatus('Toistetaan ensimmäisen luvun lyhyt näyte selaimen puhesynteesillä...');
        window.speechSynthesis.speak(utterance);
    }

    function stopAudioVoice() {
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        setAudioStatus('Äänitesti pysäytetty.');
    }

    async function runAiWorkflow() {
        if (workflowRunning) return;
        const mode = document.getElementById('workflow-mode')?.value || 'light';
        if (currentUser?.role === 'kirjailija' && mode === 'heavy') {
            setWorkflowStatus('Päivitä tilauksesi', true);
            return;
        }
        const button = document.getElementById('workflow-start-btn');
        workflowRunning = true;
        workflowSteps = defaultWorkflowSteps(mode);
        if (button) button.disabled = true;
        renderWorkflowView();
        setWorkflowStatus('Työnkulku käynnissä. Voit seurata vaiheita tässä näkymässä.');
        try {
            await ensureWorkflowProject();
            await runWorkflowAnalysis();
            await runWorkflowStructure();
            if (mode === 'heavy') {
                await runWorkflowEditChapters();
                await runWorkflowProofreadChapters();
                await runWorkflowProductInfo();
                await runWorkflowMarketingMaterials();
                await runWorkflowCovers();
            }
            await runWorkflowMisc(mode);
            await runWorkflowLayout();
            if (mode === 'heavy') {
                runWorkflowAudioPlaceholder();
            }
            await loadUsage();
            setWorkflowStatus(mode === 'heavy'
                ? 'Raskas työnkulku valmis. Tarkista vielä editointi, oikoluku, kannet ja taittotiedostot.'
                : 'Kevyt työnkulku valmis. Valmis kirja, oheisaineistot, PDF, LaTeX ja EPUB ovat tarkistettavissa.');
        } catch (err) {
            const runningStep = workflowSteps.find(step => step.status === 'running');
            if (runningStep) setWorkflowStep(runningStep.id, 'error', err.message || 'Vaihe epäonnistui.');
            setWorkflowStatus(networkFailureMessage(err), true);
            alert('AI-työnkulku keskeytyi: ' + networkFailureMessage(err));
        } finally {
            workflowRunning = false;
            if (button) button.disabled = false;
            renderWorkflowView();
        }
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
    const bookTabButtons = document.querySelectorAll('.book-tab');
    const layoutOpenCoverBtn = document.getElementById('layout-open-cover-btn');
    const layoutOpenMaterialsBtn = document.getElementById('layout-open-materials-btn');
    const layoutOfferEbookBtn = document.getElementById('layout-offer-ebook-btn');
    const layoutOfferPrintBtn = document.getElementById('layout-offer-print-btn');
    const publishBuildApplicationBtn = document.getElementById('publish-build-application-btn');
    const publishCopyApplicationBtn = document.getElementById('publish-copy-application-btn');
    const publishPrintOfferBtn = document.getElementById('publish-print-offer-btn');
    const bookFontSelect = document.getElementById('book-font-select');
    const bookFontSizeSelect = document.getElementById('book-font-size-select');
    const bookWidthSelect = document.getElementById('book-width-select');
    const saveWritingBtn = document.getElementById('save-writing-btn');
    const writerDeskSaveBtn = document.getElementById('writer-desk-save-btn');
    const writerDeskToggleStructureBtn = document.getElementById('writer-desk-toggle-structure-btn');
    const writerDeskOpenProjectsBtn = document.getElementById('writer-desk-open-projects-btn');
    const writerDeskToggleMarkupBtn = document.getElementById('writer-desk-toggle-markup-btn');
    const writerDeskMarkdownHelpBtn = document.getElementById('writer-desk-markdown-help-btn');
	    const writerDeskParagraphJumpBtn = document.getElementById('writer-desk-paragraph-jump-btn');
	    const writerDeskParagraphJumpInput = document.getElementById('writer-desk-paragraph-jump');
	    const writerDeskPrevSectionBtn = document.getElementById('writer-desk-prev-section-btn');
	    const writerDeskNextSectionBtn = document.getElementById('writer-desk-next-section-btn');
	    const writerDeskAddSectionBtn = document.getElementById('writer-desk-add-section-btn');
	    const writerDeskTextArea = document.getElementById('writer-desk-text');
	    const writerAssistantActionSelect = document.getElementById('writer-assistant-action');
	    const writerAssistantRunBtn = document.getElementById('writer-assistant-run-btn');
    const writerAssistantApplyBtn = document.getElementById('writer-assistant-apply-btn');
    const writerAssistantRejectBtn = document.getElementById('writer-assistant-reject-btn');
    const writerAssistantNextBtn = document.getElementById('writer-assistant-next-btn');
    const writerMobileJumpButtons = document.querySelectorAll('[data-writer-scroll]');
    const structureRefreshBtn = document.getElementById('structure-refresh-btn');
    const structureBackToAnalysisBtn = document.getElementById('structure-back-to-analysis-btn');
    const structureReparseBtn = document.getElementById('structure-reparse-btn');
    const structureAiBtn = document.getElementById('structure-ai-btn');
    const structureAcceptBtn = document.getElementById('structure-accept-btn');
    const structureRejectBtn = document.getElementById('structure-reject-btn');
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
    const writingBlockFormatSelect = document.getElementById('writing-block-format');
    const writingPrevChapterBtn = document.getElementById('writing-prev-chapter-btn');
    const writingNextChapterBtn = document.getElementById('writing-next-chapter-btn');
    const writingBoldBtn = document.getElementById('writing-bold-btn');
    const writingItalicBtn = document.getElementById('writing-italic-btn');
    const writingUnderlineBtn = document.getElementById('writing-underline-btn');

    if (refreshBookPreviewBtn) refreshBookPreviewBtn.addEventListener('click', renderBookOverview);
    if (downloadBookTextBtn) downloadBookTextBtn.addEventListener('click', downloadCurrentBookText);
    bookTabButtons.forEach(button => {
        button.addEventListener('click', () => setBookTab(button.dataset.bookPanel || 'book-preview-tab'));
    });
    if (layoutOpenCoverBtn) layoutOpenCoverBtn.addEventListener('click', () => {
        window.openModule('view-kuvitus');
        loadImageModels();
        loadCoverImages();
    });
    if (layoutOpenMaterialsBtn) layoutOpenMaterialsBtn.addEventListener('click', () => {
        window.openModule('view-muut-toiminnot');
        loadMiscModels();
        updateMiscProjectSelect();
        loadMiscAssetsForActiveProject();
    });
    if (layoutOfferEbookBtn) layoutOfferEbookBtn.addEventListener('click', () => requestLayoutOffer('E-kirja'));
    if (layoutOfferPrintBtn) layoutOfferPrintBtn.addEventListener('click', () => requestLayoutOffer('Painovalmis PDF'));
    if (publishBuildApplicationBtn) publishBuildApplicationBtn.addEventListener('click', buildPublishApplication);
    if (publishCopyApplicationBtn) publishCopyApplicationBtn.addEventListener('click', copyPublishApplication);
    if (publishPrintOfferBtn) publishPrintOfferBtn.addEventListener('click', requestPrintOffer);
    [bookFontSelect, bookFontSizeSelect, bookWidthSelect].forEach(select => {
        if (select) select.addEventListener('change', applyBookReaderSettings);
    });
    if (saveWritingBtn) saveWritingBtn.addEventListener('click', () => saveWritingText(true));
    if (writerDeskSaveBtn) writerDeskSaveBtn.addEventListener('click', () => saveWriterDeskText(true));
    if (writerDeskToggleStructureBtn) writerDeskToggleStructureBtn.addEventListener('click', toggleWriterDeskStructure);
    if (writerDeskOpenProjectsBtn) writerDeskOpenProjectsBtn.addEventListener('click', event => {
        event.currentTarget.closest('details')?.removeAttribute('open');
        window.openModule('view-kirjani');
    });
    if (writerDeskToggleMarkupBtn) writerDeskToggleMarkupBtn.addEventListener('click', event => {
        event.currentTarget.closest('details')?.removeAttribute('open');
        toggleManuscriptMarkup();
    });
    if (writerDeskMarkdownHelpBtn) writerDeskMarkdownHelpBtn.addEventListener('click', event => {
        event.currentTarget.closest('details')?.removeAttribute('open');
        showMarkdownHelp();
    });
	    if (writerDeskParagraphJumpBtn) writerDeskParagraphJumpBtn.addEventListener('click', jumpToWriterDeskParagraph);
	    if (writerDeskPrevSectionBtn) writerDeskPrevSectionBtn.addEventListener('click', () => moveWriterDeskSection(-1));
	    if (writerDeskNextSectionBtn) writerDeskNextSectionBtn.addEventListener('click', () => moveWriterDeskSection(1));
	    if (writerDeskAddSectionBtn) writerDeskAddSectionBtn.addEventListener('click', addWriterDeskSection);
    if (writerDeskParagraphJumpInput) {
        writerDeskParagraphJumpInput.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                jumpToWriterDeskParagraph();
            }
        });
    }
    if (writerDeskTextArea) {
        ['keyup', 'click', 'input', 'select'].forEach(eventName => {
            writerDeskTextArea.addEventListener(eventName, updateWriterDeskPositionFromCursor);
        });
        writerDeskTextArea.addEventListener('input', scheduleWriterDeskAutosave);
    }
    document.querySelectorAll('[data-writer-stage]').forEach(button => {
        button.addEventListener('click', () => setWriterStage(button.dataset.writerStage));
    });
	    if (writerAssistantActionSelect) {
	        writerAssistantActionSelect.addEventListener('change', () => {
	            writerDeskAssistantDraftKind = '';
	            if (writerAssistantApplyBtn) writerAssistantApplyBtn.disabled = true;
	            setWriterAssistantStatus('');
		            renderWriterAssistantActionChips(writerAssistantActionsByStage[currentWriterStage()] || writerAssistantActionsByStage.writing);
		        });
		    }
    writerMobileJumpButtons.forEach(button => {
        button.addEventListener('click', () => {
            const target = document.getElementById(button.dataset.writerScroll);
            if (button.dataset.writerScroll === 'writer-desk-structure-panel' && !writerDeskStructureVisible) {
                setWriterDeskStructureVisible(true, { scrollIntoView: true });
                return;
            }
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
	    if (writerAssistantRunBtn) writerAssistantRunBtn.addEventListener('click', runWriterAssistant);
	    if (writerAssistantApplyBtn) writerAssistantApplyBtn.addEventListener('click', applyWriterAssistantDraft);
	    if (writerAssistantRejectBtn) writerAssistantRejectBtn.addEventListener('click', rejectWriterAssistantDraft);
	    if (writerAssistantNextBtn) writerAssistantNextBtn.addEventListener('click', () => moveWriterDeskSection(1));
    if (structureRefreshBtn) structureRefreshBtn.addEventListener('click', renderStructureModule);
    if (structureBackToAnalysisBtn) structureBackToAnalysisBtn.addEventListener('click', () => {
        openModule('view-analyysi');
        loadSavedAnalysisForActiveProject(false);
    });
    if (structureReparseBtn) structureReparseBtn.addEventListener('click', createRuleBasedStructureProposal);
    if (structureAiBtn) structureAiBtn.addEventListener('click', createAiStructureProposal);
    if (structureAcceptBtn) structureAcceptBtn.addEventListener('click', acceptStructureProposal);
    if (structureRejectBtn) structureRejectBtn.addEventListener('click', rejectStructureProposal);
    document.querySelectorAll('.structure-option, .structure-front-option').forEach(input => {
        input.addEventListener('change', () => syncStructureOptionState(input));
    });
    syncStructureOptionState();
    if (cleanWritingTextBtn) cleanWritingTextBtn.addEventListener('click', cleanCurrentWritingChapter);
    if (restructureWritingBtn) restructureWritingBtn.addEventListener('click', restructureWritingManuscript);
    if (toggleWritingMarkupBtn) toggleWritingMarkupBtn.addEventListener('click', toggleManuscriptMarkup);
    if (viewWritingMarkdownBtn) viewWritingMarkdownBtn.addEventListener('click', viewMarkdownFile);
    if (markdownHelpBtn) markdownHelpBtn.addEventListener('click', showMarkdownHelp);
    if (writingBlockFormatSelect) writingBlockFormatSelect.addEventListener('change', () => {
        applyWritingBlockFormat(writingBlockFormatSelect.value);
        writingBlockFormatSelect.value = 'body';
    });
    if (writingPrevChapterBtn) writingPrevChapterBtn.addEventListener('click', () => moveWritingChapter(-1));
    if (writingNextChapterBtn) writingNextChapterBtn.addEventListener('click', () => moveWritingChapter(1));
    if (writingBoldBtn) writingBoldBtn.addEventListener('click', () => wrapWritingSelection('**', '**', 'lihavoitu teksti'));
    if (writingItalicBtn) writingItalicBtn.addEventListener('click', () => wrapWritingSelection('*', '*', 'kursivoitu teksti'));
    if (writingUnderlineBtn) writingUnderlineBtn.addEventListener('click', () => wrapWritingSelection('<u>', '</u>', 'alleviivattu teksti'));
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
        if (currentViewId === 'view-tyopoyta') {
            syncWriterDeskEditorToManuscript();
        }
        if (currentViewId === 'view-kirjoita') {
            syncWritingEditorToManuscript();
        }
        if (currentViewId === 'view-toimitus') {
            syncEditedTargetToManuscript({ showAlerts: false });
        }
    });

    function stripImportedFilenamePrefix(text, sourceFilename = '') {
        const raw = String(text || '').replace(/^\uFEFF/, '');
        const filename = String(sourceFilename || '').split(/[\\/]/).pop().trim();
        if (!filename || !/\.[a-z0-9]{2,8}$/i.test(filename)) return raw;
        const lines = raw.split(/\r?\n/);
        const firstContentIndex = lines.findIndex(line => line.trim());
        if (firstContentIndex < 0) return raw;
        if (lines[firstContentIndex].trim().toLocaleLowerCase('fi-FI') !== filename.toLocaleLowerCase('fi-FI')) return raw;
        lines.splice(firstContentIndex, 1);
        while (lines[firstContentIndex] !== undefined && !lines[firstContentIndex].trim()) {
            lines.splice(firstContentIndex, 1);
        }
        return lines.join('\n').replace(/^\s+/, '');
    }

    function createManuscriptFromText(title, text, sourceFilename = '') {
        const cleanText = stripImportedFilenamePrefix(text, sourceFilename);
        const parsedChapters = sanitizeChaptersForTextStorage(parseRestructuredChapters(cleanText, '', {
            skipTableOfContents: false,
            useFallbackTitle: false
        }));
        const hasDetectedStructure = parsedChapters.some(chapter => explicitChapterTitle(chapter));
        const chapters = hasDetectedStructure
            ? parsedChapters
            : [{
                id: 'raakateksti_1',
                title: '',
                toc_title: '',
                paragraphs: splitIntoParagraphs(cleanText)
            }];
        let bookData = {
            title: title,
            author: "Tuntematon",
            source_filename: "",
            chapters: chapters.length ? chapters : [{
                id: 'raakateksti_1',
                title: '',
                toc_title: '',
                paragraphs: splitIntoParagraphs(cleanText)
            }],
            analysis: {}
        };
        cleanupGeneratedPlaceholderChapters(bookData);
        if (!bookData.chapters.length) {
            bookData.chapters.push({
                id: "raakateksti_1",
                title: "",
                toc_title: "",
                paragraphs: splitIntoParagraphs(cleanText)
            });
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
        window.openModule(primaryWritingView());
        renderWriterDeskView();
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
        renderWriterDeskView();
        renderStructureModule();
        renderWritingView();
        renderProofreadView();
        renderProductInfo(true);
        renderAudioView(true);
        if (window.renderNavList) window.renderNavList();
        updateTranslationProjectSelect();
        updateFinnishTranslationProjectSelect();
        updateMiscProjectSelect();
        renderCoverImages([]);
    }

    function isGeneratedPlaceholderChapter(chapter) {
        const text = Array.isArray(chapter?.paragraphs)
            ? chapter.paragraphs.join('\n').trim().toLowerCase()
            : '';
        return (
            (chapter?.id === 'sisallys' && text === '(ei sisällysluetteloa havaittu)') ||
            (chapter?.id === 'alku' && text === '(ei erillistä alku-osaa havaittu)')
        );
    }

    function cleanupGeneratedPlaceholderChapters(data) {
        if (!data || !Array.isArray(data.chapters)) return data;
        data.chapters = data.chapters.filter(chapter => !isGeneratedPlaceholderChapter(chapter));
        if (!data.chapters.length) {
            data.chapters = [{
                id: 'luku_1',
                title: data.title || 'Käsikirjoitus',
                paragraphs: ['']
            }];
        }
        return data;
    }

    function normalizeImportedFallbackChapter(data) {
        if (!data || !Array.isArray(data.chapters)) return data;
        const filename = String(data.source_filename || '').split(/[\\/]/).pop().trim();
        if (filename) {
            data.chapters.forEach(chapter => {
                if (!Array.isArray(chapter.paragraphs) || !chapter.paragraphs.length) return;
                const first = String(chapter.paragraphs[0] || '').trim();
                if (first.toLocaleLowerCase('fi-FI') === filename.toLocaleLowerCase('fi-FI')) {
                    chapter.paragraphs.shift();
                }
            });
        }
        if (isProjectStructureCompleted(data) || data.chapters.length !== 1) return data;
        const chapter = data.chapters[0];
        const title = explicitChapterTitle(chapter);
        const sourceStem = filename ? filename.replace(/\.[^.]+$/, '') : '';
        const fallbackTitles = [data.title, filename, sourceStem]
            .map(value => String(value || '').trim().toLocaleLowerCase('fi-FI'))
            .filter(Boolean);
        if (title && fallbackTitles.includes(title.toLocaleLowerCase('fi-FI')) && structureChapterHasText(chapter)) {
            chapter.id = 'raakateksti_1';
            chapter.title = '';
            chapter.toc_title = '';
        }
        return data;
    }

    function setActiveManuscript(data) {
        if (!data) {
            clearActiveManuscript();
            return;
        }
        cleanupGeneratedPlaceholderChapters(data);
        normalizeImportedFallbackChapter(data);
        window.manuscriptData = data;
        if (!window.manuscriptData.analysis) window.manuscriptData.analysis = {};
        localStorage.setItem('skriptlab_manuscript', JSON.stringify(window.manuscriptData));
        if (data.id) localStorage.setItem(ACTIVE_PROJECT_ID_KEY, String(data.id));
        window.updateDynamicTexts();
        biographyState = normalizeBiographyState(window.manuscriptData.analysis?.biography || {});
        renderBiography();
        if (currentViewId === 'view-elamakerta') refreshElamakertaFrame();
        renderAnalysisSummary(window.manuscriptData.analysis);
        renderProductInfo(true);
        renderAudioView(true);
        renderBookOverview();
        renderWriterDeskView();
        renderStructureModule();
        renderWritingView();
        if (window.renderNavList) window.renderNavList();
        updateTranslationProjectSelect();
        updateFinnishTranslationProjectSelect();
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
            updateFinnishTranslationProjectSelect();
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
            openModule(primaryWritingView());
            renderWriterDeskView();
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
            updateFinnishTranslationProjectSelect();
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
        updateFinnishTranslationProjectSelect();
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

    function currentFinnishTranslationProject() {
        const select = document.getElementById('finnish-translation-project-select');
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

    function finnishTranslationAnalysisMessage() {
        return 'Suomennos vaatii ensin käsikirjoituksen analyysin. Tee analyysi Analyysi-välilehdellä tai paina siellä Lataa tallennettu analyysi.';
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

    function updateFinnishTranslationAnalysisNotice(project = currentFinnishTranslationProject()) {
        const notice = document.getElementById('finnish-translation-analysis-notice');
        const startBtn = document.getElementById('finnish-translation-start-btn');
        const estimateBtn = document.getElementById('finnish-translation-estimate-btn');
        const missing = Boolean(project?.id && !hasTranslationAnalysis(project));
        if (notice) {
            notice.classList.toggle('hidden', !missing);
            notice.textContent = missing ? finnishTranslationAnalysisMessage() : '';
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
            chunk_words: payload?.chunk_words || 2000,
            instructions: payload?.instructions || ''
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

    function translationParallelLabel(estimate) {
        const workers = Number(estimate?.parallel_workers || 0);
        return workers > 1 ? `, ${workers} rinnakkaista kutsua` : '';
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

    function startFinnishTranslationTimer(estimate = null) {
        const timer = document.getElementById('finnish-translation-timer');
        window.clearInterval(finnishTranslationTimerInterval);
        let seconds = 0;
        if (timer) {
            timer.textContent = translationProgressText(seconds, estimate);
            timer.classList.remove('hidden');
        }
        finnishTranslationTimerInterval = window.setInterval(() => {
            seconds++;
            if (timer) timer.textContent = translationProgressText(seconds, estimate);
        }, 1000);
    }

    function stopFinnishTranslationTimer() {
        window.clearInterval(finnishTranslationTimerInterval);
        finnishTranslationTimerInterval = null;
        const timer = document.getElementById('finnish-translation-timer');
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

    function showFinnishTranslationPanel(panelId) {
        document.querySelectorAll('.suomentaja-panel').forEach(panel => {
            panel.classList.toggle('hidden', panel.id !== panelId);
        });
        document.querySelectorAll('.suomentaja-tab[data-suomentaja-panel]').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.suomentajaPanel === panelId);
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
        renderTranslationParts();
        renderTranslationHistory();
    }

    function updateFinnishTranslationProjectSelect() {
        const select = document.getElementById('finnish-translation-project-select');
        const currentText = document.getElementById('finnish-translation-current-project');
        const promptProjectText = document.getElementById('finnish-translation-prompt-project');
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
        const project = currentFinnishTranslationProject();
        if (selectedFinnishTranslation && project && String(selectedFinnishTranslation.project_id) !== String(project.id)) {
            selectedFinnishTranslation = null;
            currentFinnishTranslationHistory = [];
        }
        if (currentText) {
            currentText.textContent = project
                ? `Suomennettava teos: ${project.title || 'Nimetön'}`
                : 'Valitse vieraskielinen käsikirjoitus ja suomennosasetukset.';
        }
        if (promptProjectText) {
            promptProjectText.textContent = project
                ? `Prompti kohdistuu teokseen: ${project.title || 'Nimetön'}`
                : 'Valitse vieraskielinen käsikirjoitus.';
        }
        updateFinnishTranslationAnalysisNotice(project);
        renderSelectedFinnishTranslationForReview();
        renderFinnishTranslationParts();
        renderFinnishTranslationHistory();
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
        const selects = ['translation-model-select', 'finnish-translation-model-select']
            .map(id => document.getElementById(id))
            .filter(Boolean);
        if (!selects.length) return;
        try {
            const res = await apiFetch('/api/models/text?purpose=translation');
            if (!res.ok) throw new Error(await apiErrorMessage(res, 'Mallien lataus epäonnistui.'));
            translationModels = await res.json();
            selects.forEach(select => {
                select.innerHTML = '';
                translationModels.forEach(model => {
                    const option = document.createElement('option');
                    option.value = `${model.provider}:${model.model_name}`;
                    option.textContent = `${model.display_name || model.model_name}${model.model_tier === 'pro' ? ' · pro' : ''}`;
                    if (model.is_default) option.selected = true;
                    select.appendChild(option);
                });
            });
        } catch (err) {
            selects.forEach(select => {
                select.innerHTML = '<option value="">Oletusmalli</option>';
            });
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

    function finnishTranslationRequestPayload(options = {}) {
        const includeInstructions = options.includeInstructions === true;
        const project = currentFinnishTranslationProject();
        const payload = {
            project_id: project ? project.id : null,
            source_kind: document.getElementById('finnish-translation-source-select')?.value || 'manuscript',
            target_language: 'fi',
            style: document.getElementById('finnish-translation-style-select')?.value || 'fi_author_modern',
            model: document.getElementById('finnish-translation-model-select')?.value || null,
            chunk_words: parseInt(document.getElementById('finnish-translation-chunk-select')?.value || '2000', 10)
        };
        if (includeInstructions) {
            payload.instructions = document.getElementById('finnish-translation-instructions')?.value || '';
        }
        return payload;
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

    async function fetchFinnishTranslationEstimate(payload) {
        const res = await apiFetch('/api/translations/estimate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Suomennosarvion muodostus epäonnistui.');
        latestFinnishTranslationEstimate = Object.assign({ payload_key: translationEstimateKey(payload) }, data);
        return latestFinnishTranslationEstimate;
    }

    async function createFinnishTranslationGuidelines() {
        const payload = finnishTranslationRequestPayload({ includeInstructions: true });
        const project = currentFinnishTranslationProject();
        const textarea = document.getElementById('finnish-translation-instructions');
        const button = document.getElementById('finnish-translation-guidelines-btn');
        const status = document.getElementById('finnish-translation-guidelines-status');
        if (!payload.project_id || !project) {
            alert('Valitse ensin vieraskielinen käsikirjoitus.');
            return;
        }
        if (textarea?.value?.trim() && !confirm('Korvataanko nykyinen hienosäätö luoduilla käännösohjeilla?')) {
            return;
        }
        if (button) button.disabled = true;
        if (status) {
            status.textContent = hasTranslationAnalysis(project)
                ? 'Luodaan käännösohjeita...'
                : 'Luodaan käännösohjeita alkutekstin pohjalta...';
        }
        try {
            const res = await apiFetch('/api/translations/guidelines', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Käännösohjeiden luonti epäonnistui.');
            if (!data.guidelines) throw new Error('Käännösohjeet jäivät tyhjiksi.');
            if (textarea) {
                textarea.value = data.guidelines;
            }
            latestFinnishTranslationEstimate = null;
            if (status) {
                status.textContent = data.warnings
                    ? `Käännösohjeet luotu. ${data.warnings}`
                    : 'Käännösohjeet luotu.';
            }
            if (hasTranslationAnalysis(project)) {
                await updateFinnishTranslationEstimate();
            }
            loadUsage();
        } catch (err) {
            if (status) status.textContent = err.message;
            alert('Käännösohjeiden luonti epäonnistui: ' + networkFailureMessage(err));
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function clearFinnishTranslationInstructions() {
        const textarea = document.getElementById('finnish-translation-instructions');
        const status = document.getElementById('finnish-translation-guidelines-status');
        if (!textarea) return;
        if (textarea.value.trim() && !confirm('Tyhjennetäänkö räätälöity käännösprompti?')) {
            return;
        }
        textarea.value = '';
        latestFinnishTranslationEstimate = null;
        if (status) status.textContent = 'Käännösprompti tyhjennetty.';
        const project = currentFinnishTranslationProject();
        if (project && hasTranslationAnalysis(project)) {
            await updateFinnishTranslationEstimate();
        }
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
            estimateEl.textContent = `${formatNumber(data.word_count)} sanaa, ${data.chunks_count} osaa${translationParallelLabel(data)}, arvioitu kesto noin ${formatDuration(data.estimated_seconds)}.`;
        } catch (err) {
            latestTranslationEstimate = null;
            estimateEl.textContent = err.message;
        }
    }

    async function updateFinnishTranslationEstimate() {
        const estimateEl = document.getElementById('finnish-translation-estimate');
        const payload = finnishTranslationRequestPayload();
        if (!estimateEl || !payload.project_id) {
            if (estimateEl) estimateEl.textContent = 'Valitse ensin vieraskielinen käsikirjoitus.';
            latestFinnishTranslationEstimate = null;
            return;
        }
        const project = currentFinnishTranslationProject();
        if (!updateFinnishTranslationAnalysisNotice(project)) {
            estimateEl.textContent = finnishTranslationAnalysisMessage();
            latestFinnishTranslationEstimate = null;
            return;
        }
        estimateEl.textContent = 'Lasketaan suomennoksen osia...';
        try {
            const data = await fetchFinnishTranslationEstimate(payload);
            estimateEl.textContent = `${formatNumber(data.word_count)} sanaa, ${data.chunks_count} osaa${translationParallelLabel(data)}, arvioitu kesto noin ${formatDuration(data.estimated_seconds)}.`;
        } catch (err) {
            latestFinnishTranslationEstimate = null;
            estimateEl.textContent = err.message;
        }
    }

    function translationHistoryCard(item, options = {}) {
        const isFinnish = options.isFinnish === true;
        const idAttr = isFinnish ? 'data-finnish-translation-id' : 'data-translation-id';
        const exportAttr = isFinnish ? 'data-finnish-translation-export-id' : 'data-translation-export-id';
        const deleteAttr = isFinnish ? 'data-finnish-translation-delete-id' : 'data-translation-delete-id';
        const label = isFinnish ? 'Suomi' : item.target_language_label;
        return `
            <div class="translation-history-card" style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:10px 12px; border-radius:8px; border:1px solid var(--border-color); background:rgba(255,255,255,0.05);">
                <button class="translation-history-open" ${idAttr}="${item.id}" type="button" style="flex:1 1 240px; min-width:180px; text-align:left; border:0; background:transparent; color:var(--text-primary); cursor:pointer; padding:0;">
                    <strong>${escapeHtml(label)}</strong> · ${escapeHtml(item.style_label)} · ${item.chunks_count} osaa · ${escapeHtml(translationStatusLabel(item.status))}
                </button>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="btn btn-secondary" ${exportAttr}="${item.id}" type="button" style="padding:6px 10px; font-size:12px;">Vie käsikirjoitukseksi</button>
                    <button class="btn btn-secondary btn-danger-soft" ${deleteAttr}="${item.id}" type="button" style="padding:6px 10px; font-size:12px;">Poista</button>
                </div>
            </div>
        `;
    }

    async function exportTranslationAsProject(translationId, options = {}) {
        const isFinnish = options.isFinnish === true;
        const status = document.getElementById(isFinnish ? 'finnish-translation-status' : 'translation-status');
        const label = isFinnish ? 'Suomennos' : 'Käännös';
        const genitiveLabel = isFinnish ? 'Suomennoksen' : 'Käännöksen';
        if (!translationId) return;
        try {
            if (status) status.textContent = `${label} viedään uudeksi käsikirjoitukseksi...`;
            const res = await apiFetch(`/api/translations/${translationId}/export-project`, { method: 'POST' });
            if (!res.ok) throw new Error(await apiErrorMessage(res, 'Käännöksen vienti epäonnistui.'));
            const project = await res.json();
            updateAvailableProject(project);
            setActiveManuscript(project);
            await loadProjects();
            if (status) status.textContent = `Uusi käsikirjoitus luotu: ${project.title || 'Nimetön'}.`;
            alert(`Uusi käsikirjoitus luotu: ${project.title || 'Nimetön'}`);
        } catch (err) {
            if (status) status.textContent = err.message;
            alert(`${genitiveLabel} vienti epäonnistui: ${err.message}`);
        }
    }

    async function deleteSavedTranslation(translationId, options = {}) {
        const isFinnish = options.isFinnish === true;
        const status = document.getElementById(isFinnish ? 'finnish-translation-status' : 'translation-status');
        const label = isFinnish ? 'suomennos' : 'käännös';
        const genitiveLabel = isFinnish ? 'Suomennoksen' : 'Käännöksen';
        const partitiveLabel = isFinnish ? 'suomennosta' : 'käännöstä';
        if (!translationId) return;
        if (!confirm(`Poistetaanko tallennettu ${label}?`)) return;
        try {
            if (status) status.textContent = `Poistetaan tallennettua ${partitiveLabel}...`;
            const res = await apiFetch(`/api/translations/${translationId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(await apiErrorMessage(res, 'Käännöksen poisto epäonnistui.'));
            if (isFinnish) {
                if (selectedFinnishTranslation && String(selectedFinnishTranslation.id) === String(translationId)) {
                    selectedFinnishTranslation = null;
                    latestFinnishTranslationText = '';
                }
                currentFinnishTranslationHistory = currentFinnishTranslationHistory.filter(item => String(item.id) !== String(translationId));
                await renderFinnishTranslationHistory();
            } else {
                if (selectedTranslation && String(selectedTranslation.id) === String(translationId)) {
                    selectedTranslation = null;
                    latestTranslationText = '';
                }
                currentTranslationHistory = currentTranslationHistory.filter(item => String(item.id) !== String(translationId));
                await renderTranslationHistory();
            }
            if (status) status.textContent = `Tallennettu ${label} poistettu.`;
        } catch (err) {
            if (status) status.textContent = err.message;
            alert(`${genitiveLabel} poisto epäonnistui: ${err.message}`);
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
            renderTranslationParts();
            history.innerHTML = '<div style="color:var(--text-secondary); font-size:13px;">Ei valittua käsikirjoitusta.</div>';
            return;
        }
        try {
            const res = await apiFetch(`/api/projects/${project.id}/translations`);
            if (!res.ok) throw new Error(await apiErrorMessage(res, 'Käännöshistorian lataus epäonnistui.'));
            const translations = await res.json();
            currentTranslationHistory = (translations || []).filter(item => item.target_language !== 'fi');
            if (selectedTranslation && !currentTranslationHistory.some(item => String(item.id) === String(selectedTranslation.id))) {
                selectedTranslation = null;
            }
            if (!selectedTranslation && currentTranslationHistory.length) {
                selectedTranslation = currentTranslationHistory[0];
            }
            populateTranslationReviewSelect();
            renderSelectedTranslationForReview();
            renderTranslationParts();
            if (!currentTranslationHistory.length) {
                history.innerHTML = '<div style="color:var(--text-secondary); font-size:13px;">Ei tallennettuja käännöksiä.</div>';
                return;
            }
            history.innerHTML = currentTranslationHistory.map(item => translationHistoryCard(item)).join('');
            history.querySelectorAll('[data-translation-id]').forEach(button => {
                button.addEventListener('click', () => {
                    const selected = currentTranslationHistory.find(item => String(item.id) === String(button.dataset.translationId));
                    if (!selected) return;
                    selectTranslationForReview(selected.id);
                    showTranslationPanel('translation-review-panel');
                });
            });
            history.querySelectorAll('[data-translation-export-id]').forEach(button => {
                button.addEventListener('click', event => {
                    event.stopPropagation();
                    exportTranslationAsProject(button.dataset.translationExportId);
                });
            });
            history.querySelectorAll('[data-translation-delete-id]').forEach(button => {
                button.addEventListener('click', event => {
                    event.stopPropagation();
                    deleteSavedTranslation(button.dataset.translationDeleteId);
                });
            });
        } catch (err) {
            history.innerHTML = `<div style="color:#ffb4b4; font-size:13px;">${escapeHtml(err.message)}</div>`;
        }
    }

    async function renderFinnishTranslationHistory() {
        const history = document.getElementById('finnish-translation-history');
        const project = currentFinnishTranslationProject();
        if (!history) return;
        if (!project?.id) {
            currentFinnishTranslationHistory = [];
            selectedFinnishTranslation = null;
            populateFinnishTranslationReviewSelect();
            renderSelectedFinnishTranslationForReview();
            renderFinnishTranslationParts();
            history.innerHTML = '<div style="color:var(--text-secondary); font-size:13px;">Ei valittua käsikirjoitusta.</div>';
            return;
        }
        try {
            const res = await apiFetch(`/api/projects/${project.id}/translations`);
            if (!res.ok) throw new Error(await apiErrorMessage(res, 'Suomennoshistorian lataus epäonnistui.'));
            const translations = await res.json();
            currentFinnishTranslationHistory = (translations || []).filter(item => item.target_language === 'fi');
            if (selectedFinnishTranslation && !currentFinnishTranslationHistory.some(item => String(item.id) === String(selectedFinnishTranslation.id))) {
                selectedFinnishTranslation = null;
            }
            if (!selectedFinnishTranslation && currentFinnishTranslationHistory.length) {
                selectedFinnishTranslation = currentFinnishTranslationHistory[0];
            }
            populateFinnishTranslationReviewSelect();
            renderSelectedFinnishTranslationForReview();
            renderFinnishTranslationParts();
            if (!currentFinnishTranslationHistory.length) {
                history.innerHTML = '<div style="color:var(--text-secondary); font-size:13px;">Ei tallennettuja suomennoksia.</div>';
                return;
            }
            history.innerHTML = currentFinnishTranslationHistory.map(item => translationHistoryCard(item, { isFinnish: true })).join('');
            history.querySelectorAll('[data-finnish-translation-id]').forEach(button => {
                button.addEventListener('click', () => {
                    const selected = currentFinnishTranslationHistory.find(item => String(item.id) === String(button.dataset.finnishTranslationId));
                    if (!selected) return;
                    selectFinnishTranslationForReview(selected.id);
                    showFinnishTranslationPanel('suomentaja-review-panel');
                });
            });
            history.querySelectorAll('[data-finnish-translation-export-id]').forEach(button => {
                button.addEventListener('click', event => {
                    event.stopPropagation();
                    exportTranslationAsProject(button.dataset.finnishTranslationExportId, { isFinnish: true });
                });
            });
            history.querySelectorAll('[data-finnish-translation-delete-id]').forEach(button => {
                button.addEventListener('click', event => {
                    event.stopPropagation();
                    deleteSavedTranslation(button.dataset.finnishTranslationDeleteId, { isFinnish: true });
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

    function populateFinnishTranslationReviewSelect() {
        const select = document.getElementById('finnish-translation-review-select');
        if (!select) return;
        select.innerHTML = '';
        currentFinnishTranslationHistory.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = `Suomi · ${item.style_label} · ${translationStatusLabel(item.status)}`;
            select.appendChild(option);
        });
        if (selectedFinnishTranslation) select.value = String(selectedFinnishTranslation.id);
    }

    function translationChunkDetails(item) {
        return Array.isArray(item?.chunk_details) ? item.chunk_details : [];
    }

    function translationPartLabel(chunk, fallbackIndex) {
        const index = Number(chunk?.index || fallbackIndex + 1);
        const total = Number(chunk?.total || 0);
        const words = Number(chunk?.source_word_count || 0);
        const status = chunk?.status && chunk.status !== 'completed' ? ` · ${chunk.status}` : '';
        const location = chunk?.book_location && typeof chunk.book_location === 'object' ? chunk.book_location : {};
        const primary = location.primary_chapter && typeof location.primary_chapter === 'object' ? location.primary_chapter : {};
        const chapterLabel = location.chapter_span || primary.title || primary.id || '';
        const locationLabel = chapterLabel ? ` · ${chapterLabel}` : '';
        return {
            title: total ? `Osa ${index}/${total}` : `Osa ${index}`,
            meta: `${words ? `${formatNumber(words)} sanaa` : 'Ei sanamäärää'}${locationLabel}${status}`
        };
    }

    function translationPartModelValue(chunk, item) {
        return chunk?.model
            || (chunk?.model_provider && chunk?.model_name ? `${chunk.model_provider}:${chunk.model_name}` : '')
            || item?.model
            || '';
    }

    function translationModelLabel(value) {
        if (!value) return 'Ei mallia tiedossa';
        const model = translationModels.find(item => `${item.provider}:${item.model_name}` === value);
        return model ? `${model.display_name || model.model_name}${model.model_tier === 'pro' ? ' · pro' : ''}` : value;
    }

    function populateTranslationPartModelSelect(prefix, chunk, item) {
        const select = document.getElementById(`${prefix}-part-rerun-model`);
        const used = document.getElementById(`${prefix}-part-model-used`);
        const button = document.getElementById(`${prefix}-part-rerun-btn`);
        const modelValue = translationPartModelValue(chunk, item);
        if (used) used.textContent = translationModelLabel(modelValue);
        if (!select) return;
        select.innerHTML = '';
        translationModels.forEach(model => {
            const option = document.createElement('option');
            option.value = `${model.provider}:${model.model_name}`;
            option.textContent = `${model.display_name || model.model_name}${model.model_tier === 'pro' ? ' · pro' : ''}`;
            select.appendChild(option);
        });
        if (modelValue && translationModels.some(model => `${model.provider}:${model.model_name}` === modelValue)) {
            select.value = modelValue;
        } else if (translationModels.length) {
            const defaultModel = translationModels.find(model => model.is_default) || translationModels[0];
            select.value = `${defaultModel.provider}:${defaultModel.model_name}`;
        }
        if (button) button.disabled = !chunk || !translationModels.length;
    }

    function stripPromptSectionLabel(value, labels) {
        const text = String(value || '').trim();
        if (!text) return '';
        const pattern = new RegExp(`^(${labels.map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*:?\\s*\\n+`, 'i');
        return text.replace(pattern, '').trim();
    }

    function translationPartSections(chunk) {
        const sections = chunk?.prompt_sections && typeof chunk.prompt_sections === 'object'
            ? chunk.prompt_sections
            : {};
        const contextFallback = [
            chunk?.pre_context ? `EDELTÄVÄ KONTEKSTI:\n${chunk.pre_context}` : '',
            chunk?.post_context ? `SEURAAVA KONTEKSTI:\n${chunk.post_context}` : ''
        ].filter(Boolean).join('\n\n');
        return {
            instructions: sections.instructions || '',
            analysis: sections.analysis_context || '',
            context: sections.context || contextFallback,
            source: stripPromptSectionLabel(sections.source_text || chunk?.source_text || '', ['KÄÄNNETTÄVÄ TEKSTI']),
            prompt: chunk?.prompt || '',
            response: chunk?.translation || chunk?.response || ''
        };
    }

    function setTranslationPartText(prefix, key, value) {
        const element = document.getElementById(`${prefix}-part-${key}`);
        if (!element) return;
        if ('value' in element) {
            element.value = value || 'Ei tietoa.';
        } else {
            element.textContent = value || 'Ei tietoa.';
        }
    }

    function syncTranslationPartScrollPosition(from, to) {
        if (!from || !to || from.dataset.scrollSyncing === 'true' || to.dataset.scrollSyncing === 'true') return;
        const fromMax = from.scrollHeight - from.clientHeight;
        const toMax = to.scrollHeight - to.clientHeight;
        if (fromMax <= 0 || toMax <= 0) return;
        const ratio = from.scrollTop / fromMax;
        from.dataset.scrollSyncing = 'true';
        to.dataset.scrollSyncing = 'true';
        to.scrollTop = ratio * toMax;
        requestAnimationFrame(() => {
            from.dataset.scrollSyncing = 'false';
            to.dataset.scrollSyncing = 'false';
        });
    }

    function bindTranslationPartScrollSync(prefix, reset = false) {
        const source = document.getElementById(`${prefix}-part-source`);
        const response = document.getElementById(`${prefix}-part-response`);
        if (!source || !response) return;
        if (reset) {
            source.scrollTop = 0;
            response.scrollTop = 0;
        }
        const syncKey = `${source.id}:${response.id}`;
        if (source.dataset.translationScrollSync === syncKey && response.dataset.translationScrollSync === syncKey) return;
        source.dataset.translationScrollSync = syncKey;
        response.dataset.translationScrollSync = syncKey;
        source.addEventListener('scroll', () => syncTranslationPartScrollPosition(source, response));
        response.addEventListener('scroll', () => syncTranslationPartScrollPosition(response, source));
    }

    function translationReviewElements(prefix) {
        const isFinnish = prefix === 'finnish-translation';
        return {
            original: document.getElementById(isFinnish ? 'finnish-translation-review-original' : 'translation-review-original'),
            chunks: document.getElementById(isFinnish ? 'finnish-translation-review-chunks' : 'translation-review-chunks'),
            hidden: document.getElementById(isFinnish ? 'finnish-translation-review-text' : 'translation-review-text'),
        };
    }

    function translationReviewChunkValues(prefix) {
        const { chunks } = translationReviewElements(prefix);
        if (!chunks) return [];
        const sections = Array.from(chunks.querySelectorAll('[data-translation-review-chunk-section]'));
        if (sections.length) {
            return sections.map(section => {
                const paragraphs = Array.from(section.querySelectorAll('[data-translation-review-paragraph]'));
                if (paragraphs.length) {
                    return paragraphs.map(input => input.value.trim()).join('\n\n').trim();
                }
                const chunkInput = section.querySelector('[data-translation-review-chunk]');
                return chunkInput ? chunkInput.value : '';
            });
        }
        return Array.from(chunks.querySelectorAll('[data-translation-review-chunk]')).map(input => input.value);
    }

    function syncTranslationReviewText(prefix) {
        const { hidden } = translationReviewElements(prefix);
        if (!hidden) return '';
        const values = translationReviewChunkValues(prefix);
        const text = values.length ? values.map(value => value.trim()).filter(Boolean).join('\n\n') : hidden.value;
        hidden.value = text;
        if (prefix === 'finnish-translation') {
            latestFinnishTranslationText = text;
        } else {
            latestTranslationText = text;
        }
        return text;
    }

    function translationReviewTextValue(prefix) {
        const { hidden } = translationReviewElements(prefix);
        return syncTranslationReviewText(prefix) || hidden?.value || '';
    }

    function translationReviewBlockLabel(chunk, fallbackIndex) {
        const label = translationPartLabel(chunk || {}, fallbackIndex);
        return `${label.title}${label.meta ? ` · ${label.meta}` : ''}`;
    }

    function splitTranslationReviewParagraphs(value) {
        return String(value || '').split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);
    }

    function sourceParagraphsForReview(chunk) {
        if (Array.isArray(chunk?.source_paragraphs) && chunk.source_paragraphs.length) {
            return chunk.source_paragraphs
                .map(item => String(item?.text || '').trim())
                .filter(Boolean);
        }
        return splitTranslationReviewParagraphs(chunk?.source_text || '');
    }

    function renderReviewSourceBody(chunk) {
        const paragraphs = sourceParagraphsForReview(chunk);
        if (paragraphs.length <= 1) {
            return `<div class="translation-review-chunk-body">${escapeHtml(paragraphs[0] || chunk?.source_text || '')}</div>`;
        }
        return `
            <div class="translation-review-paragraph-list">
                ${paragraphs.map((paragraph, index) => `
                    <div class="translation-review-chunk-body" style="margin-bottom:10px;">
                        <strong>Kappale ${index + 1}</strong><br>
                        ${escapeHtml(paragraph)}
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderReviewTranslationBody(chunk, index) {
        const sourceParagraphs = sourceParagraphsForReview(chunk);
        const translatedParagraphs = splitTranslationReviewParagraphs(chunk?.translation || '');
        if (sourceParagraphs.length > 1 && sourceParagraphs.length === translatedParagraphs.length) {
            return `
                <div class="translation-review-paragraph-list">
                    ${translatedParagraphs.map((paragraph, paragraphIndex) => `
                        <label class="card-meta" style="display:block; margin-bottom:4px;">Kappale ${paragraphIndex + 1}</label>
                        <textarea class="translation-review-chunk-text" data-translation-review-paragraph="${paragraphIndex}" style="margin-bottom:10px;">${escapeHtml(paragraph)}</textarea>
                    `).join('')}
                </div>
            `;
        }
        return `<textarea class="translation-review-chunk-text" data-translation-review-chunk="${index}">${escapeHtml(chunk?.translation || '')}</textarea>`;
    }

    function renderAlignedTranslationReview(prefix, project, item, emptyMessage) {
        const { original, chunks, hidden } = translationReviewElements(prefix);
        if (!original || !chunks || !hidden) return;
        const sourceText = project ? projectTextForTranslation(project) : '';
        const translatedText = item?.translated_text || '';
        hidden.value = translatedText;

        if (!project || !item) {
            original.textContent = emptyMessage;
            chunks.textContent = emptyMessage;
            return;
        }

        const details = translationChunkDetails(item);
        if (!details.length) {
            original.innerHTML = `
                <section class="translation-review-chunk">
                    <h5>Alkuperäinen teksti</h5>
                    <div class="translation-review-chunk-body">${escapeHtml(sourceText || 'Alkuperäistä tekstiä ei ole.')}</div>
                </section>
            `;
            chunks.innerHTML = `
                <section class="translation-review-chunk">
                    <h5>Käännös</h5>
                    <textarea class="translation-review-chunk-text" data-translation-review-chunk="0">${escapeHtml(translatedText)}</textarea>
                </section>
            `;
            chunks.querySelector('[data-translation-review-chunk]')?.addEventListener('input', () => syncTranslationReviewText(prefix));
            syncTranslationReviewText(prefix);
            return;
        }

        original.innerHTML = details.map((chunk, index) => `
            <section class="translation-review-chunk">
                <h5>${escapeHtml(translationReviewBlockLabel(chunk, index))}</h5>
                ${renderReviewSourceBody(chunk)}
            </section>
        `).join('');
        chunks.innerHTML = details.map((chunk, index) => `
            <section class="translation-review-chunk" data-translation-review-chunk-section="${index}">
                <h5>${escapeHtml(translationReviewBlockLabel(chunk, index))}</h5>
                ${renderReviewTranslationBody(chunk, index)}
            </section>
        `).join('');
        chunks.querySelectorAll('[data-translation-review-chunk], [data-translation-review-paragraph]').forEach(input => {
            input.addEventListener('input', () => syncTranslationReviewText(prefix));
        });
        syncTranslationReviewText(prefix);
    }

    function renderTranslationPartDetail(prefix, chunk, emptyMessage) {
        const item = prefix === 'finnish-translation' ? selectedFinnishTranslation : selectedTranslation;
        if (!chunk) {
            ['instructions', 'analysis', 'context', 'source', 'prompt', 'response'].forEach(key => {
                setTranslationPartText(prefix, key, emptyMessage);
            });
            populateTranslationPartModelSelect(prefix, null, item);
            bindTranslationPartScrollSync(prefix, true);
            return;
        }
        const sections = translationPartSections(chunk);
        setTranslationPartText(prefix, 'instructions', sections.instructions);
        setTranslationPartText(prefix, 'analysis', sections.analysis);
        setTranslationPartText(prefix, 'context', sections.context);
        setTranslationPartText(prefix, 'source', sections.source);
        setTranslationPartText(prefix, 'prompt', sections.prompt);
        setTranslationPartText(prefix, 'response', sections.response);
        populateTranslationPartModelSelect(prefix, chunk, item);
        bindTranslationPartScrollSync(prefix, true);
    }

    function renderTranslationParts() {
        const list = document.getElementById('translation-part-list');
        const status = document.getElementById('translation-parts-status');
        if (!list || !status) return;

        const chunks = translationChunkDetails(selectedTranslation);
        if (!selectedTranslation) {
            list.innerHTML = '';
            renderTranslationPartDetail('translation', null, 'Valitse käännös.');
            status.textContent = 'Valitse käännös ja tarkastele käännöspalakohtainen kutsu ja vastaus.';
            return;
        }
        if (!chunks.length) {
            list.innerHTML = '<div style="color:var(--text-secondary); font-size:13px;">Tällä käännöksellä ei ole osalokia. Luo käännös uudelleen, niin kutsut ja vastaukset tallentuvat.</div>';
            renderTranslationPartDetail('translation', {
                prompt: 'Osakohtainen prompti ei ole tallessa tälle vanhalle käännökselle.',
                response: selectedTranslation.translated_text || 'Vastausta ei ole.'
            }, '');
            status.textContent = 'Osaloki puuttuu tältä käännökseltä.';
            return;
        }

        selectedTranslationPartIndex = Math.max(0, Math.min(selectedTranslationPartIndex, chunks.length - 1));
        list.innerHTML = chunks.map((chunk, index) => {
            const label = translationPartLabel(chunk, index);
            return `
                <button class="translation-part-item ${index === selectedTranslationPartIndex ? 'active' : ''}" data-translation-part-index="${index}">
                    ${escapeHtml(label.title)}
                    <small>${escapeHtml(label.meta)}</small>
                </button>
            `;
        }).join('');
        list.querySelectorAll('[data-translation-part-index]').forEach(button => {
            button.addEventListener('click', () => {
                selectedTranslationPartIndex = Number(button.dataset.translationPartIndex || 0);
                renderTranslationParts();
            });
        });
        const selected = chunks[selectedTranslationPartIndex] || {};
        renderTranslationPartDetail('translation', selected, 'Valitse käännösosa.');
        const label = translationPartLabel(selected, selectedTranslationPartIndex);
        status.textContent = `${label.title}: ${label.meta}.`;
    }

    function renderFinnishTranslationParts() {
        const list = document.getElementById('finnish-translation-part-list');
        const status = document.getElementById('finnish-translation-parts-status');
        if (!list || !status) return;

        const chunks = translationChunkDetails(selectedFinnishTranslation);
        if (!selectedFinnishTranslation) {
            list.innerHTML = '';
            renderTranslationPartDetail('finnish-translation', null, 'Valitse suomennos.');
            status.textContent = 'Valitse suomennos ja tarkastele käännöspalakohtainen kutsu ja vastaus.';
            return;
        }
        if (!chunks.length) {
            list.innerHTML = '<div style="color:var(--text-secondary); font-size:13px;">Tällä suomennoksella ei ole osalokia. Luo suomennos uudelleen, niin kutsut ja vastaukset tallentuvat.</div>';
            renderTranslationPartDetail('finnish-translation', {
                prompt: 'Osakohtainen prompti ei ole tallessa tälle vanhalle suomennokselle.',
                response: selectedFinnishTranslation.translated_text || 'Vastausta ei ole.'
            }, '');
            status.textContent = 'Osaloki puuttuu tältä suomennokselta.';
            return;
        }

        selectedFinnishTranslationPartIndex = Math.max(0, Math.min(selectedFinnishTranslationPartIndex, chunks.length - 1));
        list.innerHTML = chunks.map((chunk, index) => {
            const label = translationPartLabel(chunk, index);
            return `
                <button class="translation-part-item ${index === selectedFinnishTranslationPartIndex ? 'active' : ''}" data-finnish-translation-part-index="${index}">
                    ${escapeHtml(label.title)}
                    <small>${escapeHtml(label.meta)}</small>
                </button>
            `;
        }).join('');
        list.querySelectorAll('[data-finnish-translation-part-index]').forEach(button => {
            button.addEventListener('click', () => {
                selectedFinnishTranslationPartIndex = Number(button.dataset.finnishTranslationPartIndex || 0);
                renderFinnishTranslationParts();
            });
        });
        const selected = chunks[selectedFinnishTranslationPartIndex] || {};
        renderTranslationPartDetail('finnish-translation', selected, 'Valitse suomennososa.');
        const label = translationPartLabel(selected, selectedFinnishTranslationPartIndex);
        status.textContent = `${label.title}: ${label.meta}.`;
    }

    async function rerunTranslationPart(prefix) {
        const isFinnish = prefix === 'finnish-translation';
        const item = isFinnish ? selectedFinnishTranslation : selectedTranslation;
        const index = isFinnish ? selectedFinnishTranslationPartIndex : selectedTranslationPartIndex;
        const promptEl = document.getElementById(`${prefix}-part-prompt`);
        const modelEl = document.getElementById(`${prefix}-part-rerun-model`);
        const statusEl = document.getElementById(`${prefix}-part-rerun-status`);
        const button = document.getElementById(`${prefix}-part-rerun-btn`);
        if (!item) {
            alert(isFinnish ? 'Valitse ensin suomennos.' : 'Valitse ensin käännös.');
            return;
        }
        const chunks = translationChunkDetails(item);
        if (!chunks.length || !chunks[index]) {
            alert('Valitse ensin käännöspala.');
            return;
        }
        const prompt = promptEl?.value?.trim() || '';
        if (!prompt) {
            alert('Kutsu ei voi olla tyhjä.');
            return;
        }
        if (button) button.disabled = true;
        if (statusEl) statusEl.textContent = 'Ajetaan valittu osa uudelleen...';
        try {
            const res = await apiFetch(`/api/translations/${item.id}/chunks/${index}/rerun`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    model: modelEl?.value || null,
                    prompt
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Käännöspalan uudelleenajo epäonnistui.');

            if (isFinnish) {
                selectedFinnishTranslation = data;
                latestFinnishTranslationText = data.translated_text || '';
                const itemIndex = currentFinnishTranslationHistory.findIndex(historyItem => String(historyItem.id) === String(data.id));
                if (itemIndex >= 0) currentFinnishTranslationHistory[itemIndex] = data;
                populateFinnishTranslationReviewSelect();
                renderSelectedFinnishTranslationForReview();
                renderFinnishTranslationParts();
                await renderFinnishTranslationHistory();
            } else {
                selectedTranslation = data;
                latestTranslationText = data.translated_text || '';
                const itemIndex = currentTranslationHistory.findIndex(historyItem => String(historyItem.id) === String(data.id));
                if (itemIndex >= 0) currentTranslationHistory[itemIndex] = data;
                populateTranslationReviewSelect();
                renderSelectedTranslationForReview();
                renderTranslationParts();
                await renderTranslationHistory();
            }
            if (statusEl) statusEl.textContent = 'Osa ajettu uudelleen ja käännös päivitetty.';
        } catch (err) {
            if (statusEl) statusEl.textContent = err.message;
            alert('Uudelleenajo epäonnistui: ' + err.message);
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function saveTranslationPartCorrection(prefix) {
        const isFinnish = prefix === 'finnish-translation';
        const item = isFinnish ? selectedFinnishTranslation : selectedTranslation;
        const index = isFinnish ? selectedFinnishTranslationPartIndex : selectedTranslationPartIndex;
        const responseEl = document.getElementById(`${prefix}-part-response`);
        const statusEl = document.getElementById(`${prefix}-part-rerun-status`);
        const button = document.getElementById(`${prefix}-part-save-btn`);
        if (!item) {
            alert(isFinnish ? 'Valitse ensin suomennos.' : 'Valitse ensin käännös.');
            return;
        }
        const chunks = translationChunkDetails(item);
        if (!chunks.length || !chunks[index]) {
            alert('Valitse ensin käännöspala.');
            return;
        }
        if (!responseEl) return;
        if (button) button.disabled = true;
        if (statusEl) statusEl.textContent = 'Tallennetaan palan korjausta...';
        try {
            const res = await apiFetch(`/api/translations/${item.id}/chunks/${index}`, {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ translation: responseEl.value })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Käännöspalan tallennus epäonnistui.');

            if (isFinnish) {
                selectedFinnishTranslation = data;
                latestFinnishTranslationText = data.translated_text || '';
                const itemIndex = currentFinnishTranslationHistory.findIndex(historyItem => String(historyItem.id) === String(data.id));
                if (itemIndex >= 0) currentFinnishTranslationHistory[itemIndex] = data;
                populateFinnishTranslationReviewSelect();
                renderSelectedFinnishTranslationForReview();
                renderFinnishTranslationParts();
                await renderFinnishTranslationHistory();
            } else {
                selectedTranslation = data;
                latestTranslationText = data.translated_text || '';
                const itemIndex = currentTranslationHistory.findIndex(historyItem => String(historyItem.id) === String(data.id));
                if (itemIndex >= 0) currentTranslationHistory[itemIndex] = data;
                populateTranslationReviewSelect();
                renderSelectedTranslationForReview();
                renderTranslationParts();
                await renderTranslationHistory();
            }
            if (statusEl) statusEl.textContent = 'Palan korjaus tallennettu.';
        } catch (err) {
            if (statusEl) statusEl.textContent = err.message;
            alert('Tallennus epäonnistui: ' + err.message);
        } finally {
            if (button) button.disabled = false;
        }
    }

    function selectTranslationForReview(translationId) {
        const selected = currentTranslationHistory.find(item => String(item.id) === String(translationId));
        if (!selected) return;
        selectedTranslation = selected;
        selectedTranslationPartIndex = 0;
        latestTranslationText = selected.translated_text || '';
        populateTranslationReviewSelect();
        renderSelectedTranslationForReview();
        renderTranslationParts();
    }

    function selectFinnishTranslationForReview(translationId) {
        const selected = currentFinnishTranslationHistory.find(item => String(item.id) === String(translationId));
        if (!selected) return;
        selectedFinnishTranslation = selected;
        selectedFinnishTranslationPartIndex = 0;
        latestFinnishTranslationText = selected.translated_text || '';
        populateFinnishTranslationReviewSelect();
        renderSelectedFinnishTranslationForReview();
        renderFinnishTranslationParts();
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
            renderAlignedTranslationReview('translation', project, null, project ? 'Valitse käännös.' : 'Valitse käsikirjoitus.');
            status.textContent = 'Valitse käännös tarkastettavaksi.';
            if (output) output.value = '';
            if (outputStatus) outputStatus.textContent = project ? 'Valitse käännös.' : 'Valitse käsikirjoitus.';
            return;
        }

        latestTranslationText = selectedTranslation.translated_text || '';
        renderAlignedTranslationReview('translation', project, selectedTranslation, 'Valitse käännös.');
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

    function renderSelectedFinnishTranslationForReview() {
        const project = currentFinnishTranslationProject();
        const original = document.getElementById('finnish-translation-review-original');
        const textarea = document.getElementById('finnish-translation-review-text');
        const status = document.getElementById('finnish-translation-review-status');
        const output = document.getElementById('finnish-translation-output');
        const outputStatus = document.getElementById('finnish-translation-status');
        if (!original || !textarea || !status) return;

        if (!project || !selectedFinnishTranslation) {
            renderAlignedTranslationReview('finnish-translation', project, null, project ? 'Valitse suomennos.' : 'Valitse käsikirjoitus.');
            status.textContent = 'Valitse suomennos tarkastettavaksi.';
            if (output) output.value = '';
            if (outputStatus) outputStatus.textContent = project ? 'Valitse suomennos.' : 'Valitse käsikirjoitus.';
            return;
        }

        latestFinnishTranslationText = selectedFinnishTranslation.translated_text || '';
        renderAlignedTranslationReview('finnish-translation', project, selectedFinnishTranslation, 'Valitse suomennos.');
        status.textContent = `Suomi, ${selectedFinnishTranslation.style_label}: ${translationStatusLabel(selectedFinnishTranslation.status)}.`;
        if (selectedFinnishTranslation.warnings) {
            status.textContent += ` Huomautukset: ${formatTranslationWarnings(selectedFinnishTranslation.warnings)}`;
        }
        if (output) output.value = latestFinnishTranslationText;
        if (outputStatus) {
            outputStatus.textContent = `Suomi, ${selectedFinnishTranslation.style_label}: ${translationStatusLabel(selectedFinnishTranslation.status)}`;
            if (selectedFinnishTranslation.warnings) outputStatus.textContent += ` Huomautukset: ${formatTranslationWarnings(selectedFinnishTranslation.warnings)}`;
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
            if (status) status.textContent = `Käännös käynnissä. ${estimate.chunks_count} osaa${translationParallelLabel(estimate)}, arvioitu kesto noin ${formatDuration(estimate.estimated_seconds)}.`;
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

    async function startFinnishTranslation(options = {}) {
        const useCustomInstructions = options.useCustomInstructions === true;
        const payload = finnishTranslationRequestPayload({ includeInstructions: useCustomInstructions });
        const status = document.getElementById('finnish-translation-status');
        const output = document.getElementById('finnish-translation-output');
        const button = document.getElementById(useCustomInstructions ? 'finnish-translation-custom-start-btn' : 'finnish-translation-start-btn');
        const alternateButton = document.getElementById(useCustomInstructions ? 'finnish-translation-start-btn' : 'finnish-translation-custom-start-btn');
        if (!payload.project_id) {
            alert('Valitse ensin vieraskielinen käsikirjoitus.');
            return;
        }
        if (useCustomInstructions && !String(payload.instructions || '').trim()) {
            alert('Luo tai kirjoita ensin räätälöity käännösprompti.');
            return;
        }
        const project = currentFinnishTranslationProject();
        if (!updateFinnishTranslationAnalysisNotice(project)) {
            alert(finnishTranslationAnalysisMessage());
            return;
        }
        if (button) button.disabled = true;
        if (alternateButton) alternateButton.disabled = true;
        try {
            if (status) status.textContent = useCustomInstructions
                ? 'Valmistellaan räätälöityä suomennosta ja lasketaan osat...'
                : 'Valmistellaan suomennosta ja lasketaan osat...';
            const estimateKey = translationEstimateKey(payload);
            const estimate = latestFinnishTranslationEstimate?.payload_key === estimateKey
                ? latestFinnishTranslationEstimate
                : await fetchFinnishTranslationEstimate(payload);
            startFinnishTranslationTimer(estimate);
            if (status) {
                const runLabel = useCustomInstructions ? 'Räätälöity suomennos' : 'Suomennos';
                status.textContent = `${runLabel} käynnissä. ${estimate.chunks_count} osaa${translationParallelLabel(estimate)}, arvioitu kesto noin ${formatDuration(estimate.estimated_seconds)}.`;
            }
            const res = await apiFetch('/api/translations', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Suomennos epäonnistui.');
            latestFinnishTranslationText = data.translated_text || '';
            if (output) output.value = latestFinnishTranslationText;
            if (status) {
                status.textContent = `Suomi, ${data.style_label}: ${translationStatusLabel(data.status)}. ${data.chunks_count} osaa, ${formatNumber(data.word_count)} sanaa.`;
                if (data.warnings) status.textContent += ` Huomautukset: ${formatTranslationWarnings(data.warnings)}`;
            }
            await renderFinnishTranslationHistory();
            selectFinnishTranslationForReview(data.id);
            showFinnishTranslationPanel('suomentaja-review-panel');
            loadUsage();
        } catch (err) {
            if (status) status.textContent = err.message;
            alert('Suomennos epäonnistui: ' + networkFailureMessage(err));
            loadUsage();
        } finally {
            stopFinnishTranslationTimer();
            if (button) button.disabled = false;
            if (alternateButton) alternateButton.disabled = false;
            updateFinnishTranslationAnalysisNotice();
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

    function downloadFinnishTranslation() {
        const reviewText = document.getElementById('finnish-translation-review-text');
        const text = reviewText && !document.getElementById('suomentaja-review-panel')?.classList.contains('hidden')
            ? reviewText.value
            : latestFinnishTranslationText;
        if (!text) {
            alert('Ei ladattavaa suomennosta.');
            return;
        }
        const project = currentFinnishTranslationProject();
        const safeTitle = (project?.title || 'suomennos').toLowerCase().replace(/[^a-z0-9åäö]+/gi, '-').replace(/^-|-$/g, '');
        const blob = new Blob([text], {type: 'text/plain;charset=utf-8'});
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${safeTitle}-fi.txt`;
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
	            renderWriterStage();
	            return [];
	        }
        try {
            const res = await apiFetch(`/api/projects/${project.id}/misc-assets`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Oheisaineistojen lataus epäonnistui.');
	            if (window.manuscriptData?.id && String(project.id) === String(window.manuscriptData.id)) {
	                currentMiscAssets = data || [];
	                renderBookOverview();
	                renderWriterStage();
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

    function refreshElamakertaFrame() {
        const frame = document.getElementById('elamakerta-frame');
        if (!frame) {
            loadBiographyState(false);
            return;
        }
        try {
            if (frame.contentWindow?.ElamakertaModule) {
                frame.contentWindow.ElamakertaModule.loadState();
                return;
            }
        } catch (err) {
            // If the iframe is still loading, refresh the src below.
        }
        const projectId = activeBiographyProjectId() || '';
        frame.src = `elamakerta.html?project=${encodeURIComponent(projectId)}&t=${Date.now()}`;
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
            const chunkTranslations = translationReviewChunkValues('translation');
            const translatedText = translationReviewTextValue('translation');
            const res = await apiFetch(`/api/translations/${selectedTranslation.id}`, {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    translated_text: translatedText,
                    chunk_translations: chunkTranslations.length ? chunkTranslations : null
                })
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

    async function saveReviewedFinnishTranslation() {
        const textarea = document.getElementById('finnish-translation-review-text');
        const status = document.getElementById('finnish-translation-review-status');
        const button = document.getElementById('finnish-translation-review-save-btn');
        if (!selectedFinnishTranslation || !textarea) {
            alert('Valitse ensin tallennettu suomennos.');
            return;
        }
        if (button) button.disabled = true;
        if (status) status.textContent = 'Tallennetaan suomennoksen muutoksia...';
        try {
            const chunkTranslations = translationReviewChunkValues('finnish-translation');
            const translatedText = translationReviewTextValue('finnish-translation');
            const res = await apiFetch(`/api/translations/${selectedFinnishTranslation.id}`, {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    translated_text: translatedText,
                    chunk_translations: chunkTranslations.length ? chunkTranslations : null
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Suomennoksen tallennus epäonnistui.');
            latestFinnishTranslationText = data.translated_text || '';
            selectedFinnishTranslation = data;
            const index = currentFinnishTranslationHistory.findIndex(item => String(item.id) === String(data.id));
            if (index >= 0) currentFinnishTranslationHistory[index] = data;
            populateFinnishTranslationReviewSelect();
            renderSelectedFinnishTranslationForReview();
            await renderFinnishTranslationHistory();
            if (status) status.textContent = 'Suomennoksen muutokset tallennettu.';
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
    const finnishTranslationProjectSelect = document.getElementById('finnish-translation-project-select');
    const finnishTranslationEstimateBtn = document.getElementById('finnish-translation-estimate-btn');
    const finnishTranslationGuidelinesBtn = document.getElementById('finnish-translation-guidelines-btn');
    const finnishTranslationClearInstructionsBtn = document.getElementById('finnish-translation-clear-instructions-btn');
    const finnishTranslationStartBtn = document.getElementById('finnish-translation-start-btn');
    const finnishTranslationCustomStartBtn = document.getElementById('finnish-translation-custom-start-btn');
    const finnishTranslationDownloadBtn = document.getElementById('finnish-translation-download-btn');
    const finnishTranslationReviewSelect = document.getElementById('finnish-translation-review-select');
    const finnishTranslationReviewSaveBtn = document.getElementById('finnish-translation-review-save-btn');
    const finnishTranslationReviewDownloadBtn = document.getElementById('finnish-translation-review-download-btn');
    const finnishTranslationReviewOriginal = document.getElementById('finnish-translation-review-original');
    const finnishTranslationReviewText = document.getElementById('finnish-translation-review-text');
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
    const proofreadExtraRunBtn = document.getElementById('proofread-extra-run-btn');
    const proofreadExtraScopeSelect = document.getElementById('proofread-extra-scope');
    const proofreadPdfFileInput = document.getElementById('proofread-pdf-file');
    const proofreadExtraSaveRulesBtn = document.getElementById('proofread-extra-save-rules-btn');
    const proofreadExtraResetRulesBtn = document.getElementById('proofread-extra-reset-rules-btn');
    const workflowModeSelect = document.getElementById('workflow-mode');
    const workflowStartBtn = document.getElementById('workflow-start-btn');
	    const workflowRefreshBtn = document.getElementById('workflow-refresh-btn');
	    const productGenerateBtn = document.getElementById('product-generate-btn');
	    const productRefreshBtn = document.getElementById('product-refresh-btn');
	    const productSaveBtn = document.getElementById('product-save-btn');
	    const audioGuideBtn = document.getElementById('audio-guide-btn');
    const audioSaveGuideBtn = document.getElementById('audio-save-guide-btn');
    const audioSaveScriptBtn = document.getElementById('audio-save-script-btn');
    const audioScriptDefaultsBtn = document.getElementById('audio-script-defaults-btn');
    const audioTestVoiceBtn = document.getElementById('audio-test-voice-btn');
    const audioStopVoiceBtn = document.getElementById('audio-stop-voice-btn');
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
    document.querySelectorAll('.suomentaja-tab').forEach(tab => {
        if (tab.dataset.suomentajaPanel) {
            tab.addEventListener('click', () => showFinnishTranslationPanel(tab.dataset.suomentajaPanel));
        }
    });
    document.querySelectorAll('.biography-tab').forEach(tab => {
        tab.addEventListener('click', () => showBiographyPanel(tab.dataset.bioPanel));
    });
    document.querySelectorAll('.proofread-tab').forEach(tab => {
        tab.addEventListener('click', () => showProofreadPanel(tab.dataset.proofreadPanel || 'proofread-panel-chapter'));
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
    document.getElementById('translation-part-rerun-btn')?.addEventListener('click', () => rerunTranslationPart('translation'));
    document.getElementById('translation-part-save-btn')?.addEventListener('click', () => saveTranslationPartCorrection('translation'));
    if (translationReviewText) {
        translationReviewText.addEventListener('input', () => {
            latestTranslationText = translationReviewText.value;
        });
    }
    if (translationReviewOriginal && translationReviewText) {
        translationReviewOriginal.addEventListener('scroll', () => syncTranslationScroll(translationReviewOriginal, translationReviewText));
        translationReviewText.addEventListener('scroll', () => syncTranslationScroll(translationReviewText, translationReviewOriginal));
    }
    ['finnish-translation-source-select', 'finnish-translation-style-select', 'finnish-translation-model-select', 'finnish-translation-chunk-select', 'finnish-translation-instructions'].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.addEventListener('change', updateFinnishTranslationEstimate);
    });
    if (finnishTranslationProjectSelect) {
        finnishTranslationProjectSelect.addEventListener('change', () => {
            const project = currentFinnishTranslationProject();
            if (project) setActiveManuscript(project);
            updateFinnishTranslationEstimate();
            renderFinnishTranslationHistory();
        });
    }
    if (finnishTranslationEstimateBtn) finnishTranslationEstimateBtn.addEventListener('click', updateFinnishTranslationEstimate);
    if (finnishTranslationGuidelinesBtn) finnishTranslationGuidelinesBtn.addEventListener('click', createFinnishTranslationGuidelines);
    if (finnishTranslationClearInstructionsBtn) finnishTranslationClearInstructionsBtn.addEventListener('click', clearFinnishTranslationInstructions);
    if (finnishTranslationStartBtn) finnishTranslationStartBtn.addEventListener('click', () => startFinnishTranslation());
    if (finnishTranslationCustomStartBtn) {
        finnishTranslationCustomStartBtn.addEventListener('click', () => startFinnishTranslation({ useCustomInstructions: true }));
    }
    if (finnishTranslationDownloadBtn) finnishTranslationDownloadBtn.addEventListener('click', downloadFinnishTranslation);
    if (finnishTranslationReviewSelect) {
        finnishTranslationReviewSelect.addEventListener('change', () => selectFinnishTranslationForReview(finnishTranslationReviewSelect.value));
    }
    if (finnishTranslationReviewSaveBtn) finnishTranslationReviewSaveBtn.addEventListener('click', saveReviewedFinnishTranslation);
    if (finnishTranslationReviewDownloadBtn) finnishTranslationReviewDownloadBtn.addEventListener('click', downloadFinnishTranslation);
    document.getElementById('finnish-translation-part-rerun-btn')?.addEventListener('click', () => rerunTranslationPart('finnish-translation'));
    document.getElementById('finnish-translation-part-save-btn')?.addEventListener('click', () => saveTranslationPartCorrection('finnish-translation'));
    if (finnishTranslationReviewText) {
        finnishTranslationReviewText.addEventListener('input', () => {
            latestFinnishTranslationText = finnishTranslationReviewText.value;
        });
    }
    if (finnishTranslationReviewOriginal && finnishTranslationReviewText) {
        finnishTranslationReviewOriginal.addEventListener('scroll', () => syncTranslationScroll(finnishTranslationReviewOriginal, finnishTranslationReviewText));
        finnishTranslationReviewText.addEventListener('scroll', () => syncTranslationScroll(finnishTranslationReviewText, finnishTranslationReviewOriginal));
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
    if (proofreadExtraRunBtn) proofreadExtraRunBtn.addEventListener('click', runProofreadExtraCheck);
    if (proofreadExtraScopeSelect) proofreadExtraScopeSelect.addEventListener('change', updateProofreadExtraScopeUi);
    if (proofreadPdfFileInput) proofreadPdfFileInput.addEventListener('change', updateProofreadExtraScopeUi);
    if (proofreadExtraSaveRulesBtn) proofreadExtraSaveRulesBtn.addEventListener('click', saveProofreadExtraRules);
    if (proofreadExtraResetRulesBtn) proofreadExtraResetRulesBtn.addEventListener('click', resetProofreadExtraRules);
    if (workflowModeSelect) {
        workflowModeSelect.addEventListener('change', () => {
            if (!workflowRunning) workflowSteps = defaultWorkflowSteps(workflowModeSelect.value || 'light');
            renderWorkflowView();
        });
    }
    if (workflowStartBtn) workflowStartBtn.addEventListener('click', runAiWorkflow);
	    if (workflowRefreshBtn) workflowRefreshBtn.addEventListener('click', renderWorkflowView);
	    if (productGenerateBtn) productGenerateBtn.addEventListener('click', generateProductInfo);
	    if (productRefreshBtn) productRefreshBtn.addEventListener('click', () => renderProductInfo(true));
	    if (productSaveBtn) productSaveBtn.addEventListener('click', saveProductInfo);
	    document.querySelectorAll('.product-field-row input, .product-field-row textarea').forEach(field => {
	        field.addEventListener('input', () => markProductMissingFields());
	    });
	    if (audioGuideBtn) audioGuideBtn.addEventListener('click', generateAudioGuide);
    if (audioSaveGuideBtn) audioSaveGuideBtn.addEventListener('click', saveAudioGuideEdits);
    if (audioSaveScriptBtn) audioSaveScriptBtn.addEventListener('click', saveAudioScriptEdits);
    if (audioScriptDefaultsBtn) audioScriptDefaultsBtn.addEventListener('click', () => {
        fillDefaultAudioScript(true);
        setAudioStatus('Alku- ja loppusanojen ehdotus täytetty. Tarkista teksti ja tallenna.');
    });
    if (audioTestVoiceBtn) audioTestVoiceBtn.addEventListener('click', testAudioVoice);
    if (audioStopVoiceBtn) audioStopVoiceBtn.addEventListener('click', stopAudioVoice);
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = populateAudioVoices;
    if (marketingGenerateBtn) marketingGenerateBtn.addEventListener('click', generateMarketingMaterials);
    document.querySelectorAll('.marketing-copy-btn').forEach(button => {
        button.addEventListener('click', () => copyMarketingField(button.dataset.copyTarget));
    });
    if (proofreadChapterSelect) {
        proofreadChapterSelect.addEventListener('change', () => {
            proofreadSelection.cIndex = Number(proofreadChapterSelect.value || 0);
            proofreadSuggestions = [];
            proofreadExtraFindings = [];
            renderProofreadView();
            renderProofreadExtraFindings('Aja ylimääräinen tarkistus valitulle luvulle.');
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
                let bookData = createManuscriptFromText(data.title, text, data.filename || file.name);
                bookData.source_filename = data.filename;
                bookData = await window.replaceProjectChaptersInDB(bookData);
                setActiveManuscript(bookData);
                await loadProjects();
                window.openModule(primaryWritingView());
                renderWriterDeskView();
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
                chapter.title = title || structureDisplayTitle(chapter, nextCIndex) || `Osio ${nextCIndex + 1}`;
                chapter.toc_title = chapter.title;
                window.saveProjectStructureToDB(window.manuscriptData);
                renderWritingView();
                window.loadParagraph(nextCIndex, Math.min(pIndex || 0, chapter.paragraphs.length - 1), null);
            },
            showParagraphs: false,
            showParagraphMeta: false
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
        const displayTitle = structureDisplayTitle(chapter, cIndex) || `Luku ${cIndex + 1}`;
        if (chapterLabel) chapterLabel.textContent = `- ${displayTitle}`;
        const statusP = document.querySelector('#view-toimitus .header-info p');
        if (statusP) statusP.textContent = `${displayTitle} · editointi`;

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
        
        const displayTitle = structureDisplayTitle(chapter, cIndex) || `Luku ${cIndex + 1}`;
        if (chapterLabel) chapterLabel.textContent = `- ${displayTitle}`;
        
        if (originalText) {
            let html = '';
            if (showManuscriptMarkup) {
                html += `<div style="padding:10px 12px; margin-bottom:8px; color:var(--text-primary); font-weight:700; border-left:3px solid var(--border-color);">${escapeHtml(chapterMarkdownHeading(chapter, cIndex))}</div>`;
            }
            chapter.paragraphs.forEach((p, idx) => {
                html += `<p data-pindex="${idx}" style="
                    margin: 0 0 1.05em;
                    padding: 0 2px;
                    line-height: 1.7;
                    color: var(--text-primary);
                " onclick="window.loadParagraph(${cIndex}, ${idx}, null)">${escapeHtml(p)}</p>`;
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
            statusP.textContent = `${displayTitle} · editointi`;
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
                alert('Valitse ensin kohta ennen tallentamista.');
                return false;
            }
            return true;
        }
        const chapter = window.manuscriptData?.chapters?.[sel.cIndex];
        if (!chapter) {
            if (showAlerts) {
                alert('Valitse ensin kohta ennen tallentamista.');
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
                alert('Valitse poistettava kohta ensin.');
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
            showUndoToast(`Kohta poistettu.`, async () => {
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
