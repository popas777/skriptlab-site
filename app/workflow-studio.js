(function initSkriptLabWorkflowStudio(global) {
    'use strict';

    const STORAGE_VERSION = 2;
    const STORAGE_PREFIX = 'skriptlab.workflow-studio.v2';
    const VALID_STATUSES = new Set(['pending', 'queued', 'waiting', 'running', 'done', 'error']);
    const LANGUAGE_CODES = new Set(['auto', 'fi', 'en', 'sv', 'de', 'fr', 'es']);
    const STRATEGIES = new Set(['balanced', 'fast', 'economy']);
    const CHUNK_SIZES = new Set([1000, 2000, 3000]);

    const CATEGORY_ORDER = ['core', 'text', 'production', 'visual', 'marketing', 'audio'];
    const CATEGORIES = Object.freeze({
        all: { label: 'Kaikki' },
        core: { label: 'Ydin ja muisti' },
        text: { label: 'Tekstityö' },
        production: { label: 'Tuotanto' },
        visual: { label: 'Visuaalit' },
        marketing: { label: 'Markkinointi' },
        audio: { label: 'Audio' }
    });

    const MODULES = Object.freeze({
        analysis: {
            id: 'analysis',
            label: 'Käsikirjoituksen analyysi',
            shortLabel: 'Analyysi',
            description: 'Tunnistaa rakenteen, tyylin, lajityypin ja teoksen keskeiset piirteet.',
            category: 'core',
            modelType: 'text',
            defaultProfile: 'demanding',
            dependencies: [],
            supportsBatch: false,
            viewId: 'view-analyysi',
            icon: '◎',
            inputs: 'Käsikirjoitus',
            outputs: 'Analyysi ja synopsis',
            inputFactor: 1,
            outputFactor: 0.08,
            baseSeconds: 100,
            charsPerSecond: 700
        },
        project_memory: {
            id: 'project_memory',
            label: 'Kontekstimuisti',
            shortLabel: 'Kontekstimuisti',
            description: 'Kokoaa nimet, termit, henkilöt, paikat ja tyylipäätökset myöhempien vaiheiden käyttöön.',
            category: 'core',
            modelType: 'text',
            defaultProfile: 'demanding',
            dependencies: ['analysis'],
            supportsBatch: false,
            viewId: 'view-analyysi',
            icon: '◫',
            inputs: 'Analyysi ja käsikirjoitus',
            outputs: 'Kontekstimuisti',
            inputFactor: 1.05,
            outputFactor: 0.1,
            baseSeconds: 130,
            charsPerSecond: 600
        },
        structure: {
            id: 'structure',
            label: 'Kirjan rakenne',
            shortLabel: 'Rakenne',
            description: 'Tallentaa nykyiset osat, luvut sekä alku- ja lopputekstien paikat tuotantoa varten.',
            category: 'production',
            modelType: 'none',
            dependencies: ['analysis'],
            supportsBatch: false,
            viewId: 'view-kirjoita-editoi',
            icon: '☷',
            inputs: 'Analyysi ja käsikirjoitus',
            outputs: 'Hyväksytty osiorakenne',
            inputFactor: 0.4,
            outputFactor: 0.04,
            baseSeconds: 70,
            charsPerSecond: 1000
        },
        development_feedback: {
            id: 'development_feedback',
            label: 'Kehityspalaute',
            shortLabel: 'Kehityspalaute',
            description: 'Arvioi kokonaisuuden, henkilöt, jännitteen ja tärkeimmät kehityskohteet.',
            category: 'text',
            modelType: 'text',
            defaultProfile: 'demanding',
            dependencies: ['analysis', 'project_memory'],
            supportsBatch: false,
            viewId: 'view-kehityseditointi',
            icon: '◇',
            inputs: 'Analyysi, muisti ja käsikirjoitus',
            outputs: 'Palaute ja korjaussuunnitelma',
            inputFactor: 0.9,
            outputFactor: 0.14,
            baseSeconds: 150,
            charsPerSecond: 520
        },
        edit: {
            id: 'edit',
            label: 'Editointi',
            shortLabel: 'Editointi',
            description: 'Sujuvoittaa tekstiä luvuittain ja säilyttää kirjailijan oman äänen.',
            category: 'text',
            modelType: 'text',
            dependencies: ['analysis', 'project_memory'],
            supportsBatch: false,
            viewId: 'view-kirjoita-editoi',
            icon: '✎',
            inputs: 'Käsikirjoitus ja kontekstimuisti',
            outputs: 'Editointiehdotukset',
            inputFactor: 1,
            outputFactor: 0.82,
            baseSeconds: 180,
            charsPerSecond: 380
        },
        proofread: {
            id: 'proofread',
            label: 'Oikoluku ja viimeistely',
            shortLabel: 'Oikoluku',
            description: 'Etsii kieli-, kirjoitus- ja jatkuvuusvirheet hyväksyttävinä ehdotuksina.',
            category: 'text',
            modelType: 'text',
            defaultProfile: 'demanding',
            dependencies: ['analysis', 'project_memory'],
            supportsBatch: false,
            viewId: 'view-oikoluku',
            icon: '✓',
            inputs: 'Käsikirjoitus ja kontekstimuisti',
            outputs: 'Oikolukuehdotukset',
            inputFactor: 1,
            outputFactor: 0.22,
            baseSeconds: 120,
            charsPerSecond: 480
        },
        translation: {
            id: 'translation',
            label: 'Käännös',
            shortLabel: 'Käännös',
            description: 'Kääntää teoksen osissa ja käyttää kontekstimuistia termien sekä tyylin säilyttämiseen.',
            category: 'text',
            modelType: 'translation',
            dependencies: ['analysis', 'project_memory'],
            supportsBatch: true,
            viewId: 'view-kaannostyotila',
            icon: '文',
            inputs: 'Käsikirjoitus, kielet ja kontekstimuisti',
            outputs: 'Kieliversio',
            inputFactor: 1,
            outputFactor: 0.95,
            baseSeconds: 160,
            charsPerSecond: 360
        },
        translation_review: {
            id: 'translation_review',
            label: 'Käännöksen AI-tarkastus',
            shortLabel: 'Käännöstarkastus',
            description: 'Vertaa lähdettä ja käännöstä, korjaa poikkeamat sekä tarkistaa termien jatkuvuuden.',
            category: 'text',
            modelType: 'translation',
            dependencies: ['translation'],
            supportsBatch: true,
            viewId: 'view-kaannostyotila',
            icon: '◉',
            inputs: 'Lähdeteksti ja käännös',
            outputs: 'Tarkastettu kieliversio',
            inputFactor: 1.9,
            outputFactor: 0.28,
            baseSeconds: 140,
            charsPerSecond: 330
        },
        product: {
            id: 'product',
            label: 'Tuotetiedot',
            shortLabel: 'Tuotetiedot',
            description: 'Muodostaa kirjan kuvauksen, avainsanat ja kaupalliset metatiedot.',
            category: 'production',
            modelType: 'text',
            defaultProfile: 'demanding',
            dependencies: ['analysis', 'project_memory'],
            supportsBatch: false,
            viewId: 'view-tuotetiedot',
            icon: '▤',
            inputs: 'Analyysi ja kontekstimuisti',
            outputs: 'Julkaisun tuotetiedot',
            inputFactor: 0.16,
            outputFactor: 0.035,
            baseSeconds: 55,
            charsPerSecond: 1500
        },
        marketing: {
            id: 'marketing',
            label: 'Markkinointipaketti',
            shortLabel: 'Markkinointi',
            description: 'Luo kuvaukset, kampanjaideat, some-tekstit ja julkaisun sisältösuunnitelman.',
            category: 'marketing',
            modelType: 'text',
            defaultProfile: 'demanding',
            dependencies: ['analysis', 'project_memory', 'product'],
            supportsBatch: false,
            viewId: 'view-markkinointi',
            icon: '↗',
            inputs: 'Analyysi, muisti ja tuotetiedot',
            outputs: 'Markkinointiaineistot',
            inputFactor: 0.2,
            outputFactor: 0.1,
            baseSeconds: 80,
            charsPerSecond: 1250
        },
        covers: {
            id: 'covers',
            label: 'Kansi ja kuvitus',
            shortLabel: 'Kansikuvat',
            description: 'Muodostaa visuaalisen suunnan sekä etu- ja takakannen jatkotyöstöä varten.',
            category: 'visual',
            modelType: 'image',
            dependencies: ['analysis', 'project_memory'],
            supportsBatch: false,
            viewId: 'view-kuvitus',
            icon: '▧',
            inputs: 'Analyysi, kontekstimuisti ja visuaalinen brief',
            outputs: 'Etu- ja takakansi',
            imageCount: 2,
            baseSeconds: 180,
            charsPerSecond: 1000
        },
        misc: {
            id: 'misc',
            label: 'Oheisaineistot',
            shortLabel: 'Oheisaineistot',
            description: 'Tekee nimiölehden, copysivun, sisällysluettelon ja muut kirjan oheistekstit.',
            category: 'production',
            modelType: 'text',
            defaultProfile: 'demanding',
            dependencies: ['analysis'],
            supportsBatch: false,
            viewId: 'view-oheisaineistot',
            icon: '≡',
            inputs: 'Analyysi ja kirjan rakenne',
            outputs: 'Kirjan oheisaineistot',
            inputFactor: 0.1,
            outputFactor: 0.05,
            baseSeconds: 50,
            charsPerSecond: 1800
        },
        layout: {
            id: 'layout',
            label: 'Taitto ja e-kirja',
            shortLabel: 'Taitto',
            description: 'Kokoaa tekstin ja oheisaineistot PDF-, LaTeX- ja EPUB-luonnoksiksi.',
            category: 'production',
            modelType: 'none',
            dependencies: ['misc'],
            supportsBatch: false,
            viewId: 'view-taitto',
            icon: '▥',
            inputs: 'Viimeistelty teksti ja oheisaineistot',
            outputs: 'PDF-, LaTeX- ja EPUB-luonnokset',
            baseSeconds: 45,
            charsPerSecond: 3000
        },
        audio: {
            id: 'audio',
            label: 'Äänikirjatuotanto',
            shortLabel: 'Audio',
            description: 'Paloittelee tekstin, käyttää valittua lukijaääntä ja tuottaa äänikirjan osat.',
            category: 'audio',
            modelType: 'audio',
            dependencies: ['analysis', 'project_memory'],
            supportsBatch: true,
            viewId: 'view-audio',
            icon: '◖',
            inputs: 'Viimeistelty käsikirjoitus ja ääni',
            outputs: 'Äänikirjan osat',
            baseSeconds: 300,
            charsPerSecond: 100
        }
    });

    const MODULE_ORDER = Object.freeze([
        'analysis', 'project_memory', 'structure', 'development_feedback', 'edit', 'proofread',
        'translation', 'translation_review', 'product', 'marketing', 'covers', 'misc', 'layout', 'audio'
    ]);

    const TEMPLATES = Object.freeze({
        translator: {
            id: 'translator',
            label: 'Kääntäjä',
            description: 'Analyysi, kontekstimuisti, käännös ja sen AI-tarkastus kahdessa eräaallossa.',
            icon: '文',
            modules: [
                ['analysis', 'direct'],
                ['project_memory', 'direct'],
                ['translation', 'batch'],
                ['translation_review', 'batch']
            ]
        },
        writer: {
            id: 'writer',
            label: 'Kirjailija',
            description: 'Viimeistelee käsikirjoituksen ja kokoaa kannet, oheisaineistot sekä taiton.',
            icon: '✎',
            modules: [
                ['analysis', 'direct'],
                ['project_memory', 'direct'],
                ['proofread', 'direct'],
                ['covers', 'direct'],
                ['misc', 'direct'],
                ['layout', 'direct']
            ]
        },
        publisher: {
            id: 'publisher',
            label: 'Kustantaja',
            description: 'Koko tuotantopolku metatiedoista markkinointiin, taittoon ja audiotuotantoon.',
            icon: '▦',
            modules: [
                ['analysis', 'direct'],
                ['project_memory', 'direct'],
                ['product', 'direct'],
                ['marketing', 'direct'],
                ['covers', 'direct'],
                ['misc', 'direct'],
                ['layout', 'direct'],
                ['audio', 'batch']
            ]
        },
        custom: {
            id: 'custom',
            label: 'Oma',
            description: 'Aloita tyhjästä ja kokoa juuri tälle projektille sopiva työnkulku.',
            icon: '＋',
            modules: []
        }
    });

    const TEMPLATE_ORDER = Object.freeze(['translator', 'writer', 'publisher', 'custom']);

    const DEFAULT_SETTINGS = Object.freeze({
        textModel: '',
        translationModel: '',
        imageModel: '',
        audioModel: '',
        sourceLanguage: 'auto',
        targetLanguage: 'en',
        chunkWords: 2000,
        strategy: 'balanced'
    });

    const STATUS_META = Object.freeze({
        pending: { label: 'Valmis jonoon', icon: '◇' },
        queued: { label: 'Jonossa', icon: '↗' },
        waiting: { label: 'Odottaa riippuvuutta', icon: '◷' },
        running: { label: 'Käynnissä', icon: '↻' },
        done: { label: 'Valmis', icon: '✓' },
        error: { label: 'Virhe', icon: '!' }
    });

    function escapeHtml(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function clone(value) {
        if (value === undefined) return undefined;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (error) {
            return null;
        }
    }

    function finiteNumber(value) {
        if (value === null || value === undefined || value === '') return null;
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    function safeString(value, maximum = 300) {
        return String(value === null || value === undefined ? '' : value).slice(0, maximum);
    }

    function create(options = {}) {
        const getProject = typeof options.getProject === 'function' ? options.getProject : () => null;
        const getUser = typeof options.getUser === 'function' ? options.getUser : () => null;
        const apiFetch = typeof options.apiFetch === 'function'
            ? options.apiFetch
            : (...args) => global.fetch(...args);
        const onStart = typeof options.onStart === 'function' ? options.onStart : null;
        const onPlanChange = typeof options.onPlanChange === 'function' ? options.onPlanChange : null;
        const onOpenModule = typeof options.onOpenModule === 'function' ? options.onOpenModule : null;
        const hidePricing = options.hidePricing === true;
        const priceInformationPattern = /[€$£¥]|\b(?:EUR|USD|GBP|CAD|CHF|SEK|NOK|DKK|AUD|JPY|price|prices|pricing|cost|costs|charge|charges|fee|fees|billing|payment|payments|credit|credits|quota|subscription)\b|hinn|kustann|maksu|veloit|laskut|saldo|budjet|edulli|sääst|tilaus|merkkikiinti/iu;

        function pricingSafeText(value, fallback = '') {
            const text = safeString(value, 1500);
            return hidePricing && priceInformationPattern.test(text) ? fallback : text;
        }

        let initialized = false;
        let listenersBound = false;
        let contextStorageKey = '';
        let plan = makeTemplatePlan('writer');
        let runState = null;
        let running = false;
        let activeFilter = 'all';
        let activeDialog = '';
        let dialogReturnFocus = null;
        let settingsDraft = null;
        let statusMessage = '';
        let statusIsError = false;
        let refreshTimer = null;
        let estimateGeneration = 0;
        let catalogGeneration = 0;
        let lastEstimate = emptyEstimate();
        let estimateLoading = false;
        let estimateErrors = [];

        const modelCatalogs = {
            text: [],
            translation: [],
            image: [],
            audio: []
        };
        const catalogLoaded = {
            text: false,
            translation: false,
            image: false,
            audio: false,
            audioProjectId: ''
        };
        const catalogErrors = {};
        const remoteEstimates = {
            translation: null,
            image: null,
            imageDirect: null,
            audio: null,
            audioDirect: null
        };

        function makeTemplatePlan(templateId) {
            const template = TEMPLATES[templateId] || TEMPLATES.writer;
            return {
                version: STORAGE_VERSION,
                templateId: template.id,
                customized: false,
                modules: template.modules.map(([id, runMode]) => ({
                    id,
                    runMode: MODULES[id]?.supportsBatch && runMode === 'batch' ? 'batch' : 'direct',
                    runModeOverride: false,
                    modelOverride: '',
                    status: 'pending',
                    detail: ''
                })),
                settings: { ...DEFAULT_SETTINGS },
                updatedAt: new Date().toISOString()
            };
        }

        function emptyEstimate() {
            return {
                totalCost: 0,
                lowerCost: 0,
                upperCost: 0,
                costKnown: false,
                pricedCount: 0,
                priceRelevantCount: 0,
                unpricedIds: [],
                activeSeconds: 0,
                calendarSeconds: 0,
                batchSavings: 0,
                readyAt: null,
                schedule: [],
                modules: []
            };
        }

        function currentProject() {
            try {
                return getProject() || null;
            } catch (error) {
                return null;
            }
        }

        function currentUser() {
            try {
                return getUser() || null;
            } catch (error) {
                return null;
            }
        }

        function identityPart(record, fallbacks, emptyValue) {
            for (const key of fallbacks) {
                const value = record?.[key];
                if (value !== null && value !== undefined && String(value).trim()) {
                    return encodeURIComponent(String(value).trim().slice(0, 160));
                }
            }
            return emptyValue;
        }

        function storageBase() {
            const user = currentUser();
            const project = currentProject();
            const userPart = identityPart(user, ['id', 'email', 'username'], 'anonymous');
            const projectPart = identityPart(project, ['id', 'project_id', 'title'], 'no-project');
            return `${STORAGE_PREFIX}.${userPart}.${projectPart}`;
        }

        function storageRead(key) {
            try {
                const raw = global.localStorage?.getItem(key);
                return raw ? JSON.parse(raw) : null;
            } catch (error) {
                return null;
            }
        }

        function storageWrite(key, value) {
            try {
                global.localStorage?.setItem(key, JSON.stringify(value));
            } catch (error) {
                // Työnkulku toimii myös, jos selaimen tallennustila ei ole käytettävissä.
            }
        }

        function storageRemove(key) {
            try {
                global.localStorage?.removeItem(key);
            } catch (error) {
                // Ei estä käyttöä.
            }
        }

        function sanitizeSettings(value) {
            const source = value && typeof value === 'object' ? value : {};
            const chunkWords = Number(source.chunkWords ?? source.chunk_words);
            return {
                textModel: safeString(source.textModel ?? source.text_model),
                translationModel: safeString(source.translationModel ?? source.translation_model),
                imageModel: safeString(source.imageModel ?? source.image_model),
                audioModel: safeString(source.audioModel ?? source.audio_model),
                sourceLanguage: LANGUAGE_CODES.has(source.sourceLanguage ?? source.source_language)
                    ? (source.sourceLanguage ?? source.source_language)
                    : DEFAULT_SETTINGS.sourceLanguage,
                targetLanguage: LANGUAGE_CODES.has(source.targetLanguage ?? source.target_language)
                    && (source.targetLanguage ?? source.target_language) !== 'auto'
                    ? (source.targetLanguage ?? source.target_language)
                    : DEFAULT_SETTINGS.targetLanguage,
                chunkWords: CHUNK_SIZES.has(chunkWords) ? chunkWords : DEFAULT_SETTINGS.chunkWords,
                strategy: STRATEGIES.has(source.strategy) ? source.strategy : DEFAULT_SETTINGS.strategy
            };
        }

        function sanitizePlan(value) {
            if (!value || typeof value !== 'object') return makeTemplatePlan('writer');
            const requestedTemplateId = safeString(value.templateId ?? value.template_id, 80);
            const templateId = TEMPLATES[requestedTemplateId] ? requestedTemplateId : 'custom';
            const seen = new Set();
            const modules = Array.isArray(value.modules) ? value.modules.reduce((result, item) => {
                const id = safeString(item?.id, 80);
                const definition = MODULES[id];
                if (!definition || seen.has(id)) return result;
                seen.add(id);
                const requestedModeValue = item?.runMode ?? item?.executionMode ?? item?.execution_mode;
                const requestedMode = requestedModeValue === 'batch' ? 'batch' : 'direct';
                result.push({
                    id,
                    runMode: definition.supportsBatch ? requestedMode : 'direct',
                    runModeOverride: Boolean(item?.runModeOverride ?? item?.run_mode_override),
                    modelOverride: safeString(item?.modelOverride ?? item?.model),
                    status: VALID_STATUSES.has(item?.status) ? item.status : 'pending',
                    detail: safeString(item?.detail, 1000)
                });
                return result;
            }, []) : [];
            return {
                version: STORAGE_VERSION,
                templateId,
                customized: value.customized === undefined ? templateId === 'custom' : Boolean(value.customized),
                modules,
                settings: sanitizeSettings(value.settings),
                updatedAt: safeString(value.updatedAt ?? value.updated_at, 80) || new Date().toISOString()
            };
        }

        function planUpdatedAt(value) {
            const timestamp = Date.parse(value?.updatedAt || value?.updated_at || '');
            return Number.isFinite(timestamp) ? timestamp : 0;
        }

        function preferredPlan(localPlan, serverPlan) {
            if (!localPlan) return serverPlan || null;
            if (!serverPlan) return localPlan;
            return planUpdatedAt(serverPlan) > planUpdatedAt(localPlan) ? serverPlan : localPlan;
        }

        function ensureContext() {
            const nextKey = storageBase();
            if (nextKey === contextStorageKey) return false;
            contextStorageKey = nextKey;
            const localPlan = storageRead(`${contextStorageKey}.plan`);
            const serverPlan = currentProject()?.analysis?.workflow_config;
            plan = sanitizePlan(preferredPlan(localPlan, serverPlan) || makeTemplatePlan('writer'));
            storageWrite(`${contextStorageKey}.plan`, plan);
            runState = clone(storageRead(`${contextStorageKey}.run`));
            running = Boolean(runState?.running);
            remoteEstimates.translation = null;
            remoteEstimates.image = null;
            remoteEstimates.imageDirect = null;
            remoteEstimates.audio = null;
            remoteEstimates.audioDirect = null;
            estimateErrors = [];
            statusMessage = '';
            statusIsError = false;
            return true;
        }

        function persistPlan() {
            plan.updatedAt = new Date().toISOString();
            storageWrite(`${contextStorageKey}.plan`, plan);
        }

        function persistRunState() {
            if (runState === null || runState === undefined) {
                storageRemove(`${contextStorageKey}.run`);
                return;
            }
            storageWrite(`${contextStorageKey}.run`, runState);
        }

        function getElement(id) {
            return global.document?.getElementById(id) || null;
        }

        function formatInteger(value) {
            const number = Math.max(0, Math.round(Number(value) || 0));
            if (typeof options.formatNumber === 'function') {
                try {
                    return options.formatNumber(number);
                } catch (error) {
                    // Käytetään selaimen muotoilua.
                }
            }
            return number.toLocaleString('fi-FI');
        }

        function formatSeconds(value) {
            const seconds = Math.max(0, Math.round(Number(value) || 0));
            if (typeof options.formatDuration === 'function') {
                try {
                    return options.formatDuration(seconds);
                } catch (error) {
                    // Käytetään tämän moduulin muotoilua.
                }
            }
            if (seconds < 60) return `${seconds} s`;
            if (seconds < 3600) return `${Math.ceil(seconds / 60)} min`;
            if (seconds < 86400) {
                const hours = seconds / 3600;
                return `${hours < 10 ? hours.toFixed(1).replace('.', ',') : Math.ceil(hours)} h`;
            }
            const days = seconds / 86400;
            return `${days % 1 ? days.toFixed(1).replace('.', ',') : days} vrk`;
        }

        function formatCurrency(value, minimumDigits = 2) {
            const number = Number(value);
            if (!Number.isFinite(number)) return '—';
            try {
                return new Intl.NumberFormat('fi-FI', {
                    style: 'currency',
                    currency: 'EUR',
                    minimumFractionDigits: minimumDigits,
                    maximumFractionDigits: number < 1 ? 3 : 2
                }).format(number);
            } catch (error) {
                return `${number.toFixed(2).replace('.', ',')} €`;
            }
        }

        function projectText(project = currentProject()) {
            if (!project) return '';
            if (typeof project.text === 'string' && project.text.trim()) return project.text;
            if (typeof project.content === 'string' && project.content.trim()) return project.content;
            if (!Array.isArray(project.chapters)) return '';
            return project.chapters.map(chapter => {
                const title = chapter?.title || chapter?.toc_title || chapter?.structure_title || '';
                const paragraphs = Array.isArray(chapter?.paragraphs)
                    ? chapter.paragraphs.map(paragraph => {
                        if (typeof paragraph === 'string') return paragraph;
                        return paragraph?.text || paragraph?.content || '';
                    }).join('\n\n')
                    : (chapter?.text || chapter?.content || '');
                return [title, paragraphs].filter(Boolean).join('\n\n');
            }).filter(Boolean).join('\n\n\n');
        }

        function projectMetrics(project = currentProject()) {
            if (!project) return { characters: 0, words: 0, chapters: 0 };
            const text = projectText(project);
            const characterCandidates = [project.char_count, project.character_count, project.characters];
            const wordCandidates = [project.word_count, project.words];
            const explicitCharacters = characterCandidates.map(finiteNumber).find(value => value !== null);
            const explicitWords = wordCandidates.map(finiteNumber).find(value => value !== null);
            const chapterCount = Array.isArray(project.chapters)
                ? project.chapters.length
                : (finiteNumber(project.chapter_count) || 0);
            return {
                characters: Math.max(0, Math.round(explicitCharacters === undefined ? text.length : explicitCharacters)),
                words: Math.max(0, Math.round(explicitWords === undefined
                    ? (text.trim() ? text.trim().split(/\s+/u).length : 0)
                    : explicitWords)),
                chapters: Math.max(0, Math.round(chapterCount || 0))
            };
        }

        function selectedTemplate() {
            return TEMPLATES[plan.templateId] || TEMPLATES.custom;
        }

        function modelListForType(type) {
            if (type === 'translation') return modelCatalogs.translation.length
                ? modelCatalogs.translation
                : modelCatalogs.text;
            return modelCatalogs[type] || [];
        }

        function settingKeyForModelType(type) {
            return {
                text: 'textModel',
                translation: 'translationModel',
                image: 'imageModel',
                audio: 'audioModel'
            }[type] || '';
        }

        function effectiveModelForStep(step, definition = MODULES[step?.id]) {
            if (!definition || definition.modelType === 'none') return null;
            const list = modelListForType(definition.modelType);
            const settingKey = settingKeyForModelType(definition.modelType);
            const requested = safeString(step?.modelOverride || plan.settings?.[settingKey]);
            return list.find(model => model.value === requested && model.available !== false)
                || (!requested && definition.defaultProfile === 'demanding'
                    ? list.find(model => model.isDemandingDefault && model.available !== false)
                    : null)
                || list.find(model => model.isDefault && model.available !== false)
                || list.find(model => model.recommended && model.available !== false)
                || list.find(model => model.available !== false)
                || null;
        }

        function requestedModelForStep(step, definition = MODULES[step?.id]) {
            if (!definition || definition.modelType === 'none') return '';
            const settingKey = settingKeyForModelType(definition.modelType);
            return safeString(step?.modelOverride || plan.settings?.[settingKey]);
        }

        function translationModelSupportsBatch(provider, modelName) {
            if (provider !== 'gemini') return false;
            const normalized = String(modelName || '').trim().toLowerCase();
            return ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.7-flash']
                .some(prefix => normalized.startsWith(prefix));
        }

        function audioModelSupportsBatch(provider, modelName) {
            if (provider !== 'gemini') return false;
            return ['gemini-3.1-flash-tts-preview', 'gemini-2.5-pro-preview-tts']
                .includes(String(modelName || '').trim().toLowerCase());
        }

        function normalizeRegistryModel(model, type = '') {
            const provider = safeString(model?.provider, 80);
            const modelName = safeString(model?.model_name || model?.modelName, 240);
            if (!modelName) return null;
            return {
                provider,
                modelName,
                value: provider ? `${provider}:${modelName}` : modelName,
                label: safeString(model?.display_name || model?.displayName || modelName, 300),
                tier: safeString(model?.model_tier || model?.tier, 80),
                isDefault: Boolean(model?.is_default || model?.isDefault),
                isDemandingDefault: Boolean(model?.is_demanding_default || model?.isDemandingDefault),
                recommended: Boolean(model?.recommended),
                supportsBatch: Boolean(model?.supports_batch || model?.supportsBatch)
                    || (type === 'translation' && translationModelSupportsBatch(provider, modelName)),
                costInput: finiteNumber(model?.cost_input_per_million),
                costOutput: finiteNumber(model?.cost_output_per_million),
                available: model?.is_enabled !== false,
                raw: clone(model)
            };
        }

        function normalizeAudioModel(model) {
            const provider = safeString(model?.provider, 80);
            const modelName = safeString(model?.model_id || model?.model_name, 240);
            if (!provider || !modelName) return null;
            return {
                provider,
                modelName,
                value: `${provider}:${modelName}`,
                label: safeString(model?.display_name || modelName, 300),
                tier: '',
                isDefault: false,
                recommended: Boolean(model?.recommended),
                supportsBatch: audioModelSupportsBatch(provider, modelName),
                costInput: null,
                costOutput: null,
                available: model?.configured !== false,
                configured: Boolean(model?.configured),
                raw: clone(model)
            };
        }

        function modelOptionLabel(model) {
            const suffixes = [];
            if (model.tier) suffixes.push(model.tier);
            if (model.supportsBatch) suffixes.push('eräajo');
            if (model.available === false) suffixes.push('ei määritetty');
            return `${model.label}${suffixes.length ? ` · ${suffixes.join(' · ')}` : ''}`;
        }

        function optionMarkup(value, label, selected, disabled = false) {
            return `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}>${escapeHtml(label)}</option>`;
        }

        function modelOptionsMarkup(type, selectedValue, inheritedLabel, preferredDefault = undefined) {
            const models = modelListForType(type);
            const effectiveDefault = preferredDefault === null
                ? null
                : preferredDefault
                    || models.find(model => model.isDefault && model.available !== false)
                    || models.find(model => model.recommended && model.available !== false)
                    || models.find(model => model.available !== false);
            let html = optionMarkup('', effectiveDefault
                ? `${inheritedLabel} (${effectiveDefault.label})`
                : inheritedLabel, !selectedValue);
            if (selectedValue && !models.some(model => model.value === selectedValue)) {
                html += optionMarkup(selectedValue, `${selectedValue} · ei saatavilla`, true, true);
            }
            models.forEach(model => {
                html += optionMarkup(model.value, modelOptionLabel(model), selectedValue === model.value, model.available === false);
            });
            return html;
        }

        function strategyMode(definition, strategy = plan.settings.strategy) {
            if (!definition?.supportsBatch) return 'direct';
            if (strategy === 'fast') return 'direct';
            if (strategy === 'economy') return 'batch';
            return ['translation', 'translation_review', 'audio'].includes(definition.id) ? 'batch' : 'direct';
        }

        function dependencyIssues() {
            const positions = new Map(plan.modules.map((step, index) => [step.id, index]));
            const issues = [];
            plan.modules.forEach((step, index) => {
                const definition = MODULES[step.id];
                (definition?.dependencies || []).forEach(dependencyId => {
                    const dependency = MODULES[dependencyId];
                    if (!positions.has(dependencyId)) {
                        issues.push({
                            severity: 'error',
                            stepId: step.id,
                            message: `${definition.label} tarvitsee ensin moduulin ${dependency?.shortLabel || dependencyId}.`
                        });
                    } else if (positions.get(dependencyId) > index) {
                        issues.push({
                            severity: 'error',
                            stepId: step.id,
                            message: `${dependency?.shortLabel || dependencyId} pitää siirtää ennen moduulia ${definition.label}.`
                        });
                    }
                });
                if (step.runMode === 'batch' && definition?.supportsBatch) {
                    const model = effectiveModelForStep(step, definition);
                    if (model && model.supportsBatch === false) {
                        issues.push({
                            severity: 'error',
                            stepId: step.id,
                            message: `${definition.label}: valittu malli ei tue eräajoa. Vaihda mallia tai valitse suora ajo.`
                        });
                    }
                }
                if (definition?.modelType !== 'none') {
                    const requestedModel = requestedModelForStep(step, definition);
                    const models = modelListForType(definition.modelType);
                    const requestedEntry = requestedModel
                        ? models.find(model => model.value === requestedModel)
                        : null;
                    if (requestedModel && !requestedEntry) {
                        issues.push({
                            severity: 'error',
                            stepId: step.id,
                            message: `${definition.label}: valittua mallia ei enää löydy. Valitse käytettävissä oleva malli.`
                        });
                    } else if (requestedEntry?.available === false) {
                        issues.push({
                            severity: 'error',
                            stepId: step.id,
                            message: `${definition.label}: valittu malli ei ole määritetty käyttöön.`
                        });
                    } else if (!effectiveModelForStep(step, definition) && catalogLoaded[definition.modelType]) {
                        issues.push({
                            severity: 'error',
                            stepId: step.id,
                            message: `${definition.label}: yhtään käytettävissä olevaa mallia ei löytynyt.`
                        });
                    }
                }
            });
            if (plan.modules.some(step => ['translation', 'translation_review'].includes(step.id))
                && plan.settings.sourceLanguage !== 'auto'
                && plan.settings.sourceLanguage === plan.settings.targetLanguage) {
                issues.push({
                    severity: 'warning',
                    stepId: 'translation',
                    message: 'Käännöksen lähtö- ja kohdekieli ovat samat.'
                });
            }
            return issues;
        }

        function canUseBatchPrice(step, definition, model) {
            if (step.runMode !== 'batch' || !definition.supportsBatch) return false;
            return Boolean(model?.supportsBatch);
        }

        function registryTextCost(step, definition, metrics) {
            const model = effectiveModelForStep(step, definition);
            const inputTokens = Math.max(0, metrics.characters / 4 * Number(definition.inputFactor || 0));
            const outputTokens = Math.max(0, metrics.characters / 4 * Number(definition.outputFactor || 0));
            const needsInputPrice = inputTokens > 0;
            const needsOutputPrice = outputTokens > 0;
            const complete = Boolean(model)
                && (!needsInputPrice || model.costInput !== null)
                && (!needsOutputPrice || model.costOutput !== null);
            if (!complete) {
                return { known: false, cost: 0, directCost: 0, saving: 0, model, inputTokens, outputTokens };
            }
            const directCost = (inputTokens / 1000000 * Number(model.costInput || 0))
                + (outputTokens / 1000000 * Number(model.costOutput || 0));
            const batchPriced = canUseBatchPrice(step, definition, model);
            const cost = directCost * (batchPriced ? 0.5 : 1);
            return {
                known: true,
                cost,
                directCost,
                saving: Math.max(0, directCost - cost),
                model,
                inputTokens,
                outputTokens
            };
        }

        function estimateKeyPrefix(project = currentProject()) {
            return String(project?.id || project?.project_id || '');
        }

        function translationEstimateKey(step) {
            const model = effectiveModelForStep(step, MODULES[step.id]);
            return [
                estimateKeyPrefix(),
                model?.value || '',
                plan.settings.sourceLanguage,
                plan.settings.targetLanguage,
                plan.settings.chunkWords
            ].join('|');
        }

        function imageEstimateKey(step, mode = step.runMode) {
            const model = effectiveModelForStep(step, MODULES[step.id]);
            return [estimateKeyPrefix(), model?.modelName || '', mode, MODULES[step.id]?.imageCount || 1].join('|');
        }

        function audioEstimateKey(step, mode = step.runMode) {
            const model = effectiveModelForStep(step, MODULES[step.id]);
            return [estimateKeyPrefix(), model?.value || '', mode].join('|');
        }

        function fallbackSeconds(definition, metrics) {
            const base = Number(definition?.baseSeconds || 45);
            const throughput = Math.max(1, Number(definition?.charsPerSecond || 800));
            return Math.max(1, Math.ceil(base + metrics.characters / throughput));
        }

        function estimateModule(step, metrics) {
            const definition = MODULES[step.id];
            const result = {
                id: step.id,
                label: definition.label,
                runMode: step.runMode,
                activeSeconds: fallbackSeconds(definition, metrics),
                cost: 0,
                directCost: 0,
                batchSaving: 0,
                costKnown: definition.modelType === 'none',
                priceRelevant: definition.modelType !== 'none',
                model: null,
                note: definition.modelType === 'none' ? 'Ei erillistä AI-kustannusta' : ''
            };

            if (definition.modelType === 'text' || definition.modelType === 'translation') {
                const priced = registryTextCost(step, definition, metrics);
                Object.assign(result, {
                    runMode: canUseBatchPrice(step, definition, priced.model) ? 'batch' : 'direct',
                    cost: priced.cost,
                    directCost: priced.directCost,
                    batchSaving: priced.saving,
                    costKnown: priced.known,
                    model: priced.model?.value || '',
                    note: priced.known ? 'Mallirekisterin tokenihinta' : 'Tekstimallin hinta puuttuu mallirekisteristä'
                });
                if (definition.modelType === 'translation'
                    && remoteEstimates.translation?.key === translationEstimateKey(step)) {
                    const seconds = finiteNumber(remoteEstimates.translation.data?.estimated_seconds);
                    if (seconds !== null) {
                        result.activeSeconds = step.id === 'translation_review'
                            ? Math.max(60, Math.ceil(seconds * 0.8))
                            : Math.max(60, Math.ceil(seconds));
                    }
                }
            } else if (definition.modelType === 'image') {
                const selectedModel = effectiveModelForStep(step, definition);
                const effectiveMode = step.runMode === 'batch' && selectedModel?.supportsBatch ? 'batch' : 'direct';
                const expectedKey = imageEstimateKey(step, effectiveMode);
                const cached = effectiveMode === 'batch' ? remoteEstimates.image : (remoteEstimates.imageDirect || remoteEstimates.image);
                const cost = cached?.key === expectedKey ? finiteNumber(cached.data?.estimated_cost_eur) : null;
                const directKey = imageEstimateKey(step, 'direct');
                const direct = remoteEstimates.imageDirect?.key === directKey
                    ? finiteNumber(remoteEstimates.imageDirect.data?.estimated_cost_eur)
                    : (effectiveMode === 'direct' ? cost : null);
                result.model = selectedModel?.value || '';
                result.runMode = effectiveMode;
                result.costKnown = cost !== null;
                result.cost = cost || 0;
                result.directCost = direct === null ? result.cost : direct;
                result.batchSaving = direct === null ? 0 : Math.max(0, direct - result.cost);
                result.note = result.costKnown ? 'Kuvapalvelun ajantasainen arvio' : 'Kuvahinta ei ole saatavilla';
            } else if (definition.modelType === 'audio') {
                const selectedModel = effectiveModelForStep(step, definition);
                const effectiveMode = step.runMode === 'batch' && selectedModel?.supportsBatch ? 'batch' : 'direct';
                const expectedKey = audioEstimateKey(step, effectiveMode);
                const cached = effectiveMode === 'batch' ? remoteEstimates.audio : (remoteEstimates.audioDirect || remoteEstimates.audio);
                const cost = cached?.key === expectedKey ? finiteNumber(cached.data?.estimated_cost_eur) : null;
                const seconds = cached?.key === expectedKey
                    ? finiteNumber(cached.data?.estimated_processing_seconds)
                    : null;
                const directKey = audioEstimateKey(step, 'direct');
                const direct = remoteEstimates.audioDirect?.key === directKey
                    ? finiteNumber(remoteEstimates.audioDirect.data?.estimated_cost_eur)
                    : (effectiveMode === 'direct' ? cost : null);
                result.model = selectedModel?.value || '';
                result.runMode = effectiveMode;
                result.costKnown = cost !== null;
                result.cost = cost || 0;
                result.directCost = direct === null ? result.cost : direct;
                result.batchSaving = direct === null ? 0 : Math.max(0, direct - result.cost);
                result.activeSeconds = seconds === null ? result.activeSeconds : Math.max(1, Math.ceil(seconds));
                result.note = result.costKnown ? 'Audiopalvelun ajantasainen arvio' : 'Audiohinta ei ole saatavilla';
            }
            return result;
        }

        function calculateSchedule(moduleEstimates) {
            let cursor = 0;
            let batchWave = 0;
            const assignments = new Map([[0, []]]);
            moduleEstimates.forEach(item => {
                const definition = MODULES[item.id];
                if (item.runMode === 'batch' && definition.supportsBatch) {
                    batchWave += 1;
                    cursor += 86400;
                } else {
                    cursor += item.activeSeconds;
                }
                const hour = batchWave * 24;
                if (!assignments.has(hour)) assignments.set(hour, []);
                assignments.get(hour).push(item.label);
            });
            const visibleWaves = Math.max(2, batchWave);
            const groups = Array.from({ length: visibleWaves + 1 }, (_, index) => ({
                hour: index * 24,
                items: assignments.get(index * 24) || []
            }));
            return { groups, calendarSeconds: cursor };
        }

        function calculateEstimate() {
            const project = currentProject();
            const metrics = projectMetrics(project);
            if (!project) {
                return { ...emptyEstimate(), schedule: calculateSchedule([]).groups };
            }
            const modules = plan.modules.map(step => estimateModule(step, metrics));
            const priceRelevant = modules.filter(item => item.priceRelevant);
            const priced = priceRelevant.filter(item => item.costKnown);
            const totalCost = priced.reduce((sum, item) => sum + item.cost, 0);
            const batchSavings = priced.reduce((sum, item) => sum + item.batchSaving, 0);
            const activeSeconds = modules.reduce((sum, item) => sum + item.activeSeconds, 0);
            const schedule = calculateSchedule(modules);
            const readyAt = new Date(Date.now() + schedule.calendarSeconds * 1000).toISOString();
            return {
                totalCost,
                lowerCost: totalCost * 0.9,
                upperCost: totalCost * 1.15,
                costKnown: priced.length === priceRelevant.length,
                pricedCount: priced.length,
                priceRelevantCount: priceRelevant.length,
                unpricedIds: priceRelevant.filter(item => !item.costKnown).map(item => item.id),
                activeSeconds,
                calendarSeconds: schedule.calendarSeconds,
                batchSavings,
                readyAt,
                schedule: schedule.groups,
                modules
            };
        }

        function readyDateLabel(isoValue, compact = false) {
            const date = new Date(isoValue || '');
            if (Number.isNaN(date.getTime())) return '—';
            try {
                return new Intl.DateTimeFormat('fi-FI', compact
                    ? { weekday: 'short', hour: '2-digit', minute: '2-digit' }
                    : { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
                ).format(date);
            } catch (error) {
                return date.toLocaleString('fi-FI');
            }
        }

        function renderTemplates() {
            const container = getElement('workflow-template-list');
            if (!container) return;
            container.innerHTML = TEMPLATE_ORDER.map(templateId => {
                const template = TEMPLATES[templateId];
                const active = plan.templateId === templateId;
                const count = template.modules.length;
                return `
                    <button class="workflow-template-card${active ? ' is-active' : ''}" type="button"
                        data-workflow-template="${escapeHtml(templateId)}" aria-pressed="${active ? 'true' : 'false'}"
                        aria-label="${escapeHtml(`${template.label}: ${template.description}`)}" title="${escapeHtml(template.description)}"${running ? ' disabled' : ''}>
                        <span class="workflow-template-icon" aria-hidden="true">${escapeHtml(template.icon)}</span>
                        <span class="workflow-template-copy">
                            <strong>${escapeHtml(template.label)}</strong>
                        </span>
                        <span class="workflow-template-count">${count ? `${count} moduulia` : 'Tyhjä pohja'}</span>
                    </button>`;
            }).join('');
            const selection = getElement('workflow-template-selection');
            if (selection) {
                selection.textContent = `${selectedTemplate().label}${plan.customized ? ' · muokattu' : ''}`;
            }
        }

        function statusMarkup(step) {
            const meta = STATUS_META[step.status] || STATUS_META.pending;
            const detail = pricingSafeText(step.detail || meta.label, meta.label);
            return `<span class="workflow-step-state workflow-step-state-${escapeHtml(step.status)}">
                <span aria-hidden="true">${escapeHtml(meta.icon)}</span>
                <span>${escapeHtml(detail)}</span>
            </span>`;
        }

        function moduleModelSelect(step, definition) {
            if (definition.modelType === 'none') {
                return `<span class="workflow-step-static-value">Ei erillistä AI-mallia</span>`;
            }
            const inheritedModel = effectiveModelForStep(
                { ...step, modelOverride: '' },
                definition
            );
            return `<select class="workflow-model-override-select" data-workflow-step-id="${escapeHtml(step.id)}"
                aria-label="${escapeHtml(definition.label)}: malliohitus"${running ? ' disabled' : ''}>
                ${modelOptionsMarkup(definition.modelType, step.modelOverride, 'Perii työnkulun oletuksen', inheritedModel)}
            </select>`;
        }

        function moduleEstimateLabel(stepId) {
            const estimate = lastEstimate.modules.find(item => item.id === stepId);
            if (!estimate || !currentProject()) return 'Arvio tarkentuu projektista';
            if (hidePricing) return formatSeconds(estimate.activeSeconds);
            const price = estimate.priceRelevant
                ? (estimate.costKnown ? formatCurrency(estimate.cost) : 'Hinta avoin')
                : 'Ei AI-kustannusta';
            return `${formatSeconds(estimate.activeSeconds)} · ${price}`;
        }

        function renderSteps() {
            const container = getElement('workflow-steps');
            const empty = getElement('workflow-empty-state');
            if (!container) return;
            const openStepIds = new Set(Array.from(container.querySelectorAll('details.workflow-step-details[open]'))
                .map(details => details.closest('[data-workflow-step]')?.dataset.workflowStep)
                .filter(Boolean));
            container.classList.toggle('hidden', !plan.modules.length);
            if (empty) empty.classList.toggle('hidden', Boolean(plan.modules.length));
            container.innerHTML = plan.modules.map((step, index) => {
                const definition = MODULES[step.id];
                const modeOptions = definition.supportsBatch
                    ? `${optionMarkup('direct', 'Suora ajo', step.runMode === 'direct')}${optionMarkup('batch', 'Eräajo · enintään 24 h', step.runMode === 'batch')}`
                    : optionMarkup('direct', 'Suora ajo', true);
                const open = openStepIds.has(step.id) || ['running', 'queued', 'error'].includes(step.status);
                const modeLabel = step.runMode === 'batch' ? 'Eräajo · enintään 24 h' : 'Suora ajo';
                return `
                    <article class="workflow-step ${escapeHtml(step.status)}" data-workflow-step="${escapeHtml(step.id)}">
                        <span class="workflow-step-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
                        <div class="workflow-step-main">
                            <div class="workflow-step-heading">
                                <div class="workflow-step-title">
                                    <span class="workflow-step-module-icon" aria-hidden="true">${escapeHtml(definition.icon)}</span>
                                    <div><strong>${escapeHtml(definition.label)}</strong><small>${escapeHtml(moduleEstimateLabel(step.id))}</small></div>
                                </div>
                                ${statusMarkup(step)}
                            </div>
                            <details class="workflow-step-details"${open ? ' open' : ''}>
                                <summary><span>Asetukset ja toiminnot</span><small>${escapeHtml(modeLabel)}</small></summary>
                                <div class="workflow-step-details-body">
                                    <p class="workflow-step-description">${escapeHtml(definition.description)}</p>
                                    <div class="workflow-step-controls">
                                        <label><span>Ajotapa</span><select class="workflow-run-mode-select" data-workflow-step-id="${escapeHtml(step.id)}"${running ? ' disabled' : ''}>${modeOptions}</select></label>
                                        <label><span>Malli</span>${moduleModelSelect(step, definition)}</label>
                                    </div>
                                    <div class="workflow-step-actions">
                                        <button type="button" data-workflow-action="open" data-workflow-step-id="${escapeHtml(step.id)}">Avaa osio</button>
                                        <button type="button" data-workflow-action="up" data-workflow-step-id="${escapeHtml(step.id)}" aria-label="Siirrä ${escapeHtml(definition.label)} ylöspäin"${running || index === 0 ? ' disabled' : ''}>↑ Ylös</button>
                                        <button type="button" data-workflow-action="down" data-workflow-step-id="${escapeHtml(step.id)}" aria-label="Siirrä ${escapeHtml(definition.label)} alaspäin"${running || index === plan.modules.length - 1 ? ' disabled' : ''}>↓ Alas</button>
                                        <button class="workflow-step-remove" type="button" data-workflow-action="remove" data-workflow-step-id="${escapeHtml(step.id)}"${running ? ' disabled' : ''}>Poista</button>
                                    </div>
                                </div>
                            </details>
                        </div>
                    </article>`;
            }).join('');
        }

        function renderDependencyNotice() {
            const notice = getElement('workflow-dependency-notice');
            if (!notice) return;
            const issues = dependencyIssues();
            notice.classList.toggle('hidden', !issues.length);
            notice.classList.toggle('is-error', issues.some(issue => issue.severity === 'error'));
            notice.innerHTML = issues.length
                ? `<strong>Tarkista työnkulun riippuvuudet</strong><ul class="workflow-dependency-list">${issues.map(issue => `<li class="is-${escapeHtml(issue.severity)}">${escapeHtml(issue.message)}</li>`).join('')}</ul>`
                : '';
        }

        function renderEstimator() {
            lastEstimate = calculateEstimate();
            const project = currentProject();
            const metrics = projectMetrics(project);
            const allKnown = lastEstimate.costKnown;
            const anyPriced = lastEstimate.pricedCount > 0;
            const costText = hidePricing ? '' : !project
                ? '—'
                : (!lastEstimate.priceRelevantCount
                    ? formatCurrency(0)
                    : (anyPriced ? `${allKnown ? '' : '≥ '}${formatCurrency(lastEstimate.totalCost)}` : 'Hinnoittelu avoin'));
            const rangeText = hidePricing ? '' : !project
                ? 'Valitse käsikirjoitus, jotta arvio voidaan laskea.'
                : (!lastEstimate.priceRelevantCount
                    ? 'Valitut vaiheet eivät aiheuta erillistä AI-kustannusta.'
                    : (allKnown
                        ? `Arviohaarukka ${formatCurrency(lastEstimate.lowerCost)}–${formatCurrency(lastEstimate.upperCost)}.`
                        : `${lastEstimate.pricedCount}/${lastEstimate.priceRelevantCount} maksullisesta moduulista hinnoiteltu. Avoimet: ${lastEstimate.unpricedIds.map(id => MODULES[id]?.shortLabel || id).join(', ')}.`));

            const assignments = {
                'workflow-cost-estimate': costText,
                'workflow-cost-range': rangeText,
                'workflow-active-time': project ? formatSeconds(lastEstimate.activeSeconds) : '—',
                'workflow-total-time': project ? formatSeconds(lastEstimate.calendarSeconds) : '—',
                'workflow-batch-savings': hidePricing ? '' : project ? formatCurrency(lastEstimate.batchSavings) : '0 €',
                'workflow-chapter-count': formatInteger(metrics.chapters),
                'workflow-char-count': formatInteger(metrics.characters),
                'workflow-ready-date': project ? readyDateLabel(lastEstimate.readyAt) : '—',
                'workflow-mobile-cost': costText,
                'workflow-mobile-ready': project ? readyDateLabel(lastEstimate.readyAt, true) : '—',
                'workflow-hero-cost': costText,
                'workflow-hero-ready': project ? readyDateLabel(lastEstimate.readyAt, true) : '—',
                'workflow-hero-modules': String(plan.modules.length)
            };
            Object.entries(assignments).forEach(([id, text]) => {
                const element = getElement(id);
                if (element) element.textContent = text;
            });

            const badge = getElement('workflow-estimate-badge');
            if (badge) {
                badge.textContent = estimateLoading
                    ? 'Päivitetään…'
                    : (!project
                        ? 'Odottaa projektia'
                        : hidePricing
                            ? 'Arvio valmis'
                            : (allKnown ? 'Hinnoiteltu' : `${lastEstimate.pricedCount}/${lastEstimate.priceRelevantCount} hinnoiteltu`));
                badge.classList.toggle('is-loading', estimateLoading);
                badge.classList.toggle('is-partial', Boolean(project && !hidePricing && !allKnown));
            }

            const schedule = getElement('workflow-schedule-list');
            if (schedule) {
                schedule.innerHTML = lastEstimate.schedule.map(group => {
                    const title = group.hour === 0 ? 'Käynnistys' : `${group.hour} h`;
                    const detail = group.items.length
                        ? group.items.join(' · ')
                        : (group.hour === 0 ? 'Suorat vaiheet käynnistyvät tässä.' : 'Ei tähän aaltoon ajoitettuja vaiheita.');
                    return `<div class="workflow-schedule-item${group.hour === 0 ? ' is-now' : ' is-batch'}">
                        <span class="workflow-schedule-time">${escapeHtml(title)}</span>
                        <div><strong>${group.hour === 0 ? 'Nyt' : `Eräaalto ${group.hour / 24}`}</strong><p>${escapeHtml(detail)}</p></div>
                    </div>`;
                }).join('');
            }

            const disclaimer = getElement('workflow-estimator-disclaimer');
            if (disclaimer) {
                const errorText = estimateErrors.length ? ` Kaikkia palveluarvioita ei saatu: ${estimateErrors.join(' ')}` : '';
                disclaimer.textContent = hidePricing
                    ? ''
                    : 'Tekstihinta näytetään vain, kun valitulla mallilla on sekä syöte- että tuotoshinta mallirekisterissä. Kuva- ja audioarviot tulevat palveluiden omista laskureista. Eräajosäästö huomioidaan vain tuetulle mallille.' + errorText;
            }
        }

        function renderModuleFilters() {
            const filters = getElement('workflow-module-filters');
            if (!filters) return;
            filters.innerHTML = ['all', ...CATEGORY_ORDER].map(category => {
                const count = category === 'all'
                    ? MODULE_ORDER.length
                    : MODULE_ORDER.filter(id => MODULES[id].category === category).length;
                return `<button type="button" class="workflow-module-filter${activeFilter === category ? ' is-active' : ''}"
                    data-workflow-filter="${escapeHtml(category)}" aria-pressed="${activeFilter === category ? 'true' : 'false'}">
                    ${escapeHtml(CATEGORIES[category].label)} <span>${count}</span>
                </button>`;
            }).join('');
        }

        function renderModuleLibrary() {
            renderModuleFilters();
            const container = getElement('workflow-module-list');
            if (!container) return;
            const selectedIds = new Set(plan.modules.map(step => step.id));
            const visibleIds = MODULE_ORDER.filter(id => activeFilter === 'all' || MODULES[id].category === activeFilter);
            container.innerHTML = visibleIds.map(id => {
                const definition = MODULES[id];
                const selected = selectedIds.has(id);
                return `<article class="workflow-module-card${selected ? ' is-selected' : ''}" data-workflow-module="${escapeHtml(id)}">
                    <div class="workflow-module-card-main">
                        <span class="workflow-module-card-icon" aria-hidden="true">${escapeHtml(definition.icon)}</span>
                        <div><strong>${escapeHtml(definition.label)}</strong><p>${escapeHtml(definition.description)}</p></div>
                    </div>
                    <button class="workflow-module-add" type="button" data-workflow-toggle-module="${escapeHtml(id)}"
                        aria-pressed="${selected ? 'true' : 'false'}"${running ? ' disabled' : ''}>${selected ? '✓ Lisätty' : '＋ Lisää'}</button>
                </article>`;
            }).join('');
            const count = getElement('workflow-library-selection-count');
            if (count) count.textContent = `${plan.modules.length} ${plan.modules.length === 1 ? 'moduuli' : 'moduulia'} valittu`;
        }

        function setSelectValue(id, value) {
            const select = getElement(id);
            if (!select) return;
            select.value = String(value ?? '');
        }

        function renderSettingsForm() {
            const source = settingsDraft || plan.settings;
            const modelFields = [
                ['workflow-text-model', 'text', 'Tehtäväkohtainen oletus', null],
                ['workflow-translation-model', 'translation', 'Järjestelmän oletus', undefined],
                ['workflow-image-model', 'image', 'Järjestelmän oletus', undefined],
                ['workflow-audio-model', 'audio', currentProject() ? 'Järjestelmän oletus' : 'Valitse käsikirjoitus', undefined]
            ];
            modelFields.forEach(([id, type, label, preferredDefault]) => {
                const select = getElement(id);
                if (!select) return;
                const settingKey = settingKeyForModelType(type);
                select.innerHTML = modelOptionsMarkup(type, source[settingKey], label, preferredDefault);
                select.value = source[settingKey] || '';
            });
            setSelectValue('workflow-source-language', source.sourceLanguage);
            setSelectValue('workflow-target-language', source.targetLanguage);
            setSelectValue('workflow-chunk-words', source.chunkWords);
            global.document?.querySelectorAll('input[name="workflow-strategy"]').forEach(input => {
                input.checked = input.value === source.strategy;
            });
            const status = getElement('workflow-settings-status');
            if (status && activeDialog === 'settings') {
                const errors = Object.values(catalogErrors).filter(Boolean);
                status.textContent = errors.length
                    ? `Osa mallilistoista ei latautunut. ${pricingSafeText(errors.join(' '), 'Kaikkia mallilistoja ei saatu ladattua.')}`
                    : 'Asetukset tallennetaan tälle käsikirjoitukselle ja synkronoidaan palvelimelle.';
                status.classList.toggle('is-error', Boolean(errors.length));
            }
        }

        function renderHeaderAndStatus() {
            const project = currentProject();
            const projectTextElement = getElement('workflow-current-project');
            if (projectTextElement) {
                projectTextElement.textContent = project
                    ? `${project.title || project.name || 'Nimetön käsikirjoitus'} · kokoa työnkulku ja tarkista arvio ennen käynnistystä.`
                    : hidePricing
                        ? 'Valitse käsikirjoitus, kokoa tarvittavat työvaiheet ja näe aika-arvio ennen käynnistystä.'
                        : 'Valitse käsikirjoitus, kokoa tarvittavat työvaiheet ja näe aika- sekä kustannusarvio ennen käynnistystä.';
            }
            const issues = dependencyIssues();
            const hasBlockingIssues = issues.some(issue => issue.severity === 'error');
            ['workflow-start-btn', 'workflow-mobile-start-btn'].forEach(id => {
                const startButton = getElement(id);
                if (!startButton) return;
                startButton.disabled = running || !project || !plan.modules.length || hasBlockingIssues;
                startButton.textContent = running ? 'Käynnissä…' : (id === 'workflow-mobile-start-btn' ? 'Käynnistä' : 'Käynnistä työnkulku');
            });
            ['workflow-refresh-btn', 'workflow-settings-btn', 'workflow-estimator-settings-btn', 'workflow-add-module-btn', 'workflow-empty-add-btn'].forEach(id => {
                const button = getElement(id);
                if (button) button.disabled = running && id !== 'workflow-refresh-btn';
            });

            if (!statusMessage) {
                if (!project) setStatusElement('Valitse käsikirjoitus ensin.', false);
                else if (!plan.modules.length) setStatusElement('Lisää vähintään yksi moduuli työnkulkuun.', false);
                else if (hasBlockingIssues) setStatusElement('Korjaa työnkulun riippuvuudet ennen käynnistystä.', true);
                else if (running) setStatusElement('Työnkulku on käynnissä. Voit seurata vaiheiden tilaa tästä näkymästä.', false);
                else setStatusElement('Suunnitelma on valmis käynnistettäväksi.', false);
            } else {
                setStatusElement(statusMessage, statusIsError);
            }
        }

        function render() {
            ensureContext();
            renderTemplates();
            renderEstimator();
            renderSteps();
            renderDependencyNotice();
            renderModuleLibrary();
            if (activeDialog === 'settings') renderSettingsForm();
            renderHeaderAndStatus();
            return controller;
        }

        function setStatusElement(message, isError) {
            const element = getElement('workflow-status');
            if (!element) return;
            element.textContent = pricingSafeText(message, isError ? 'Työnkulkua ei voitu käsitellä.' : 'Työnkulun tila päivittyi.');
            element.classList.toggle('is-error', Boolean(isError));
        }

        function setStatus(message, isError = false) {
            statusMessage = safeString(message, 1500);
            statusIsError = Boolean(isError);
            setStatusElement(statusMessage, statusIsError);
            return controller;
        }

        function notifyPlanChange() {
            if (!onPlanChange) return;
            try {
                onPlanChange(getPlan());
            } catch (error) {
                global.console?.warn?.('Työnkulkusuunnitelman muutoskäsittelijä epäonnistui:', error);
            }
        }

        function changed({ customize = true, refresh = true } = {}) {
            if (customize) plan.customized = true;
            statusMessage = '';
            persistPlan();
            lastEstimate = calculateEstimate();
            render();
            notifyPlanChange();
            if (refresh) scheduleEstimateRefresh();
        }

        function selectTemplate(templateId) {
            if (running || !TEMPLATES[templateId]) return;
            const previousSettings = sanitizeSettings(plan.settings);
            plan = makeTemplatePlan(templateId);
            plan.settings = previousSettings;
            plan.modules.forEach(step => {
                if (!step.runModeOverride) {
                    const templateMode = TEMPLATES[templateId].modules.find(item => item[0] === step.id)?.[1];
                    step.runMode = templateMode || strategyMode(MODULES[step.id], previousSettings.strategy);
                }
            });
            changed({ customize: false, refresh: true });
        }

        function addModule(id) {
            const definition = MODULES[id];
            if (running || !definition || plan.modules.some(step => step.id === id)) return false;
            const step = {
                id,
                runMode: strategyMode(definition),
                runModeOverride: false,
                modelOverride: '',
                status: 'pending',
                detail: ''
            };
            const moduleRank = MODULE_ORDER.indexOf(id);
            const insertionIndex = plan.modules.findIndex(item => MODULE_ORDER.indexOf(item.id) > moduleRank);
            if (insertionIndex < 0) plan.modules.push(step);
            else plan.modules.splice(insertionIndex, 0, step);
            changed();
            return true;
        }

        function removeModule(id) {
            if (running) return false;
            const index = plan.modules.findIndex(step => step.id === id);
            if (index < 0) return false;
            plan.modules.splice(index, 1);
            changed();
            return true;
        }

        function moveModule(id, offset) {
            if (running) return false;
            const index = plan.modules.findIndex(step => step.id === id);
            const target = index + offset;
            if (index < 0 || target < 0 || target >= plan.modules.length) return false;
            const [step] = plan.modules.splice(index, 1);
            plan.modules.splice(target, 0, step);
            changed();
            return true;
        }

        function updateStepMode(id, mode) {
            if (running) return;
            const step = plan.modules.find(item => item.id === id);
            const definition = MODULES[id];
            if (!step || !definition) return;
            step.runMode = definition.supportsBatch && mode === 'batch' ? 'batch' : 'direct';
            step.runModeOverride = true;
            changed();
        }

        function updateStepModel(id, value) {
            if (running) return;
            const step = plan.modules.find(item => item.id === id);
            if (!step) return;
            step.modelOverride = safeString(value);
            changed();
        }

        function toggleLibraryModule(id) {
            if (plan.modules.some(step => step.id === id)) removeModule(id);
            else addModule(id);
        }

        function firstFocusable(dialog) {
            return dialog?.querySelector(
                'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            ) || null;
        }

        function closeDialog({ restoreFocus = true } = {}) {
            if (!activeDialog) return;
            const dialogId = activeDialog === 'library' ? 'workflow-module-library' : 'workflow-settings-dialog';
            const backdropId = activeDialog === 'library' ? 'workflow-module-library-backdrop' : 'workflow-settings-backdrop';
            const dialog = getElement(dialogId);
            const backdrop = getElement(backdropId);
            dialog?.classList.add('hidden');
            dialog?.setAttribute('aria-hidden', 'true');
            backdrop?.classList.add('hidden');
            backdrop?.setAttribute('aria-hidden', 'true');
            global.document?.body?.classList.remove('workflow-dialog-open');
            activeDialog = '';
            settingsDraft = null;
            if (restoreFocus && dialogReturnFocus && global.document?.contains(dialogReturnFocus)) {
                dialogReturnFocus.focus();
            }
            dialogReturnFocus = null;
        }

        function openDialog(kind, opener) {
            if (kind !== 'library' && kind !== 'settings') return;
            if (activeDialog) closeDialog({ restoreFocus: false });
            activeDialog = kind;
            dialogReturnFocus = opener || global.document?.activeElement || null;
            if (kind === 'settings') settingsDraft = sanitizeSettings(plan.settings);
            const dialogId = kind === 'library' ? 'workflow-module-library' : 'workflow-settings-dialog';
            const backdropId = kind === 'library' ? 'workflow-module-library-backdrop' : 'workflow-settings-backdrop';
            const dialog = getElement(dialogId);
            const backdrop = getElement(backdropId);
            if (!dialog || !backdrop) {
                activeDialog = '';
                settingsDraft = null;
                return;
            }
            if (kind === 'library') renderModuleLibrary();
            else renderSettingsForm();
            dialog.classList.remove('hidden');
            dialog.setAttribute('aria-hidden', 'false');
            backdrop.classList.remove('hidden');
            backdrop.setAttribute('aria-hidden', 'false');
            global.document?.body?.classList.add('workflow-dialog-open');
            global.requestAnimationFrame?.(() => firstFocusable(dialog)?.focus());
        }

        function trapDialogFocus(event) {
            if (!activeDialog || event.key !== 'Tab') return;
            const dialog = getElement(activeDialog === 'library' ? 'workflow-module-library' : 'workflow-settings-dialog');
            if (!dialog) return;
            const focusable = Array.from(dialog.querySelectorAll(
                'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )).filter(element => !element.closest('[hidden]') && element.offsetParent !== null);
            if (!focusable.length) {
                event.preventDefault();
                dialog.focus();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && global.document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && global.document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }

        function readSettingsForm() {
            const strategy = Array.from(global.document?.querySelectorAll('input[name="workflow-strategy"]') || [])
                .find(input => input.checked)?.value;
            return sanitizeSettings({
                textModel: getElement('workflow-text-model')?.value,
                translationModel: getElement('workflow-translation-model')?.value,
                imageModel: getElement('workflow-image-model')?.value,
                audioModel: getElement('workflow-audio-model')?.value,
                sourceLanguage: getElement('workflow-source-language')?.value,
                targetLanguage: getElement('workflow-target-language')?.value,
                chunkWords: getElement('workflow-chunk-words')?.value,
                strategy
            });
        }

        function saveSettings() {
            if (running) return;
            const previousStrategy = plan.settings.strategy;
            plan.settings = readSettingsForm();
            if (previousStrategy !== plan.settings.strategy) {
                plan.modules.forEach(step => {
                    if (!step.runModeOverride) step.runMode = strategyMode(MODULES[step.id], plan.settings.strategy);
                });
            }
            changed({ customize: true, refresh: true });
            closeDialog();
            setStatus('Asetukset tallennettu ja arvio päivitetään.', false);
        }

        function resetSettingsDraft() {
            settingsDraft = { ...DEFAULT_SETTINGS };
            renderSettingsForm();
            const status = getElement('workflow-settings-status');
            if (status) {
                status.textContent = 'Pohjan oletukset palautettu lomakkeelle. Hyväksy muutos painamalla Tallenna asetukset.';
                status.classList.remove('is-error');
            }
        }

        async function requestJson(url, init) {
            const response = await apiFetch(url, init);
            if (response && typeof response.json === 'function') {
                const data = await response.json().catch(() => null);
                if (response.ok === false) {
                    throw new Error(safeString(data?.detail || data?.message || `Pyyntö epäonnistui (${response.status || ''}).`, 500));
                }
                return data;
            }
            if (response?.ok === false) {
                throw new Error(safeString(response?.detail || response?.message || 'Pyyntö epäonnistui.', 500));
            }
            return response?.data !== undefined ? response.data : response;
        }

        async function loadRegistryCatalog(type, url, force, generation) {
            if (catalogLoaded[type] && !force) return modelCatalogs[type];
            try {
                const payload = await requestJson(url);
                if (generation !== catalogGeneration) return modelCatalogs[type];
                const list = Array.isArray(payload) ? payload : [];
                modelCatalogs[type] = list.map(model => normalizeRegistryModel(model, type)).filter(Boolean);
                catalogLoaded[type] = true;
                delete catalogErrors[type];
            } catch (error) {
                if (generation !== catalogGeneration) return modelCatalogs[type];
                catalogErrors[type] = `${type === 'image' ? 'Kuvamallit' : type === 'translation' ? 'Käännösmallit' : 'Tekstimallit'}: ${safeString(error?.message || error, 300)}`;
                if (!catalogLoaded[type]) modelCatalogs[type] = [];
            }
            return modelCatalogs[type];
        }

        async function loadAudioCatalog(force, generation) {
            const project = currentProject();
            const projectId = String(project?.id || project?.project_id || '');
            if (!projectId) {
                modelCatalogs.audio = [];
                catalogLoaded.audio = false;
                catalogLoaded.audioProjectId = '';
                delete catalogErrors.audio;
                return [];
            }
            if (catalogLoaded.audio && catalogLoaded.audioProjectId === projectId && !force) return modelCatalogs.audio;
            try {
                const payload = await requestJson(`/api/audio/productions/options?project_id=${encodeURIComponent(projectId)}`);
                if (generation !== catalogGeneration) return modelCatalogs.audio;
                modelCatalogs.audio = (Array.isArray(payload?.models) ? payload.models : [])
                    .map(normalizeAudioModel)
                    .filter(Boolean);
                modelCatalogs.audioVoices = Array.isArray(payload?.voices) ? clone(payload.voices) : [];
                catalogLoaded.audio = true;
                catalogLoaded.audioProjectId = projectId;
                const warnings = Array.isArray(payload?.warnings) ? payload.warnings.filter(Boolean).join(' ') : '';
                if (warnings) catalogErrors.audio = `Audio: ${safeString(warnings, 500)}`;
                else delete catalogErrors.audio;
            } catch (error) {
                if (generation !== catalogGeneration) return modelCatalogs.audio;
                catalogErrors.audio = `Audiomallit: ${safeString(error?.message || error, 300)}`;
                if (!catalogLoaded.audio || catalogLoaded.audioProjectId !== projectId) {
                    modelCatalogs.audio = [];
                    modelCatalogs.audioVoices = [];
                }
            }
            return modelCatalogs.audio;
        }

        async function loadModels(force = false) {
            const generation = ++catalogGeneration;
            await Promise.all([
                loadRegistryCatalog('text', '/api/models/text', force, generation),
                loadRegistryCatalog('translation', '/api/models/text?purpose=translation', force, generation),
                loadRegistryCatalog('image', '/api/models/image', force, generation),
                loadAudioCatalog(force, generation)
            ]);
            if (generation === catalogGeneration) render();
            return clone(modelCatalogs);
        }

        function jsonRequest(body) {
            return {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            };
        }

        async function fetchTranslationEstimate(step, generation) {
            const project = currentProject();
            if (!project?.id) return;
            const model = effectiveModelForStep(step, MODULES[step.id]);
            const key = translationEstimateKey(step);
            const data = await requestJson('/api/translations/estimate', jsonRequest({
                project_id: Number(project.id),
                source_kind: 'manuscript',
                source_language: plan.settings.sourceLanguage,
                target_language: plan.settings.targetLanguage,
                style: 'faithful',
                model: model?.value || null,
                chunk_words: plan.settings.chunkWords
            }));
            if (generation === estimateGeneration) remoteEstimates.translation = { key, data };
        }

        async function fetchImageEstimate(step, mode, generation, target) {
            const project = currentProject();
            if (!project?.id) return;
            const definition = MODULES[step.id];
            const model = effectiveModelForStep(step, definition);
            const effectiveMode = mode === 'batch' && model?.supportsBatch ? 'batch' : 'direct';
            const key = imageEstimateKey(step, effectiveMode);
            const data = await requestJson(
                `/api/projects/${encodeURIComponent(project.id)}/visual-image-jobs/estimate`,
                jsonRequest({
                    model_name: model?.modelName || null,
                    execution_mode: effectiveMode,
                    image_size: '1K',
                    image_count: definition.imageCount || 1
                })
            );
            if (generation === estimateGeneration) remoteEstimates[target] = { key, data };
        }

        function audioVoiceForProvider(provider) {
            const voices = Array.isArray(modelCatalogs.audioVoices) ? modelCatalogs.audioVoices : [];
            return voices.find(voice => voice?.provider === provider && voice?.verified_language)
                || voices.find(voice => voice?.provider === provider)
                || null;
        }

        async function fetchAudioEstimate(step, mode, generation, target) {
            const project = currentProject();
            if (!project?.id) return;
            const model = effectiveModelForStep(step, MODULES[step.id]);
            const voice = audioVoiceForProvider(model?.provider);
            if (!model || !voice?.voice_id) throw new Error('Audiomallille ei löytynyt lukijaääntä.');
            const key = audioEstimateKey(step, mode);
            const data = await requestJson('/api/audio/productions/estimate', jsonRequest({
                project_id: Number(project.id),
                provider: model.provider,
                model_id: model.modelName,
                voice_id: voice.voice_id,
                voice_name: voice.name || voice.voice_id,
                delivery: 'natural',
                speed: 1,
                execution_mode: mode === 'batch' ? 'batch' : 'interactive'
            }));
            if (generation === estimateGeneration) remoteEstimates[target] = { key, data };
        }

        function estimateErrorLabel(kind, error) {
            const label = { translation: 'Käännösarvio', image: 'Kuva-arvio', audio: 'Audioarvio' }[kind] || 'Arvio';
            return `${label}: ${safeString(error?.message || error, 300)}`;
        }

        async function refreshEstimates(forceModels = false) {
            ensureContext();
            const generation = ++estimateGeneration;
            estimateLoading = true;
            estimateErrors = [];
            renderEstimator();
            await loadModels(Boolean(forceModels));
            if (generation !== estimateGeneration) return getPlan().estimate;
            const project = currentProject();
            if (!project?.id) {
                estimateLoading = false;
                lastEstimate = calculateEstimate();
                render();
                return clone(lastEstimate);
            }

            const tasks = [];
            const translationStep = plan.modules.find(step => step.id === 'translation')
                || plan.modules.find(step => step.id === 'translation_review');
            if (translationStep) {
                tasks.push(fetchTranslationEstimate(translationStep, generation)
                    .catch(error => estimateErrors.push(estimateErrorLabel('translation', error))));
            }
            const imageStep = plan.modules.find(step => step.id === 'covers');
            if (imageStep) {
                const imageModel = effectiveModelForStep(imageStep, MODULES.covers);
                const mode = imageStep.runMode === 'batch' && imageModel?.supportsBatch ? 'batch' : 'direct';
                tasks.push(fetchImageEstimate(imageStep, mode, generation, mode === 'batch' ? 'image' : 'imageDirect')
                    .catch(error => estimateErrors.push(estimateErrorLabel('image', error))));
                if (mode === 'batch') {
                    tasks.push(fetchImageEstimate(imageStep, 'direct', generation, 'imageDirect')
                        .catch(error => estimateErrors.push(estimateErrorLabel('image', error))));
                }
            }
            const audioStep = plan.modules.find(step => step.id === 'audio');
            if (audioStep) {
                const audioModel = effectiveModelForStep(audioStep, MODULES.audio);
                const mode = audioStep.runMode === 'batch' && audioModel?.supportsBatch ? 'batch' : 'direct';
                tasks.push(fetchAudioEstimate(audioStep, mode, generation, mode === 'batch' ? 'audio' : 'audioDirect')
                    .catch(error => estimateErrors.push(estimateErrorLabel('audio', error))));
                if (mode === 'batch') {
                    tasks.push(fetchAudioEstimate(audioStep, 'direct', generation, 'audioDirect')
                        .catch(error => estimateErrors.push(estimateErrorLabel('audio', error))));
                }
            }
            await Promise.all(tasks);
            if (generation !== estimateGeneration) return getPlan().estimate;
            estimateErrors = Array.from(new Set(estimateErrors));
            estimateLoading = false;
            lastEstimate = calculateEstimate();
            render();
            return clone(lastEstimate);
        }

        function scheduleEstimateRefresh() {
            if (refreshTimer) global.clearTimeout(refreshTimer);
            refreshTimer = global.setTimeout(() => {
                refreshTimer = null;
                refreshEstimates(false).catch(error => {
                    estimateLoading = false;
                    estimateErrors = [estimateErrorLabel('estimate', error)];
                    render();
                });
            }, 180);
        }

        async function handleStart() {
            if (running) return;
            const project = currentProject();
            if (!project?.id) {
                setStatus('Valitse käsikirjoitus ennen työnkulun käynnistystä.', true);
                return;
            }
            if (!plan.modules.length) {
                setStatus('Lisää työnkulkuun vähintään yksi moduuli.', true);
                return;
            }
            if (dependencyIssues().some(issue => issue.severity === 'error')) {
                setStatus('Korjaa työnkulun riippuvuudet ennen käynnistystä.', true);
                return;
            }
            if (!onStart) {
                setStatus('Työnkulun suorittajaa ei ole kytketty tähän näkymään.', true);
                return;
            }
            setRunning(true);
            setStatus('Työnkulku käynnistyy…', false);
            try {
                await onStart(getPlan(), controller);
            } catch (error) {
                setRunning(false);
                setStatus(error?.message || 'Työnkulun käynnistys epäonnistui.', true);
            }
        }

        function handleStaticClick(event) {
            const templateButton = event.target.closest('[data-workflow-template]');
            if (templateButton) {
                selectTemplate(templateButton.dataset.workflowTemplate);
                return;
            }
            const filterButton = event.target.closest('[data-workflow-filter]');
            if (filterButton) {
                activeFilter = CATEGORIES[filterButton.dataset.workflowFilter] ? filterButton.dataset.workflowFilter : 'all';
                renderModuleLibrary();
                return;
            }
            const moduleButton = event.target.closest('[data-workflow-toggle-module]');
            if (moduleButton) {
                toggleLibraryModule(moduleButton.dataset.workflowToggleModule);
                return;
            }
            const stepAction = event.target.closest('[data-workflow-action]');
            if (stepAction) {
                const id = stepAction.dataset.workflowStepId;
                if (stepAction.dataset.workflowAction === 'remove') removeModule(id);
                if (stepAction.dataset.workflowAction === 'up') moveModule(id, -1);
                if (stepAction.dataset.workflowAction === 'down') moveModule(id, 1);
                if (stepAction.dataset.workflowAction === 'open') {
                    const definition = MODULES[id];
                    if (definition && onOpenModule) onOpenModule(definition.viewId);
                }
            }
        }

        function handleDynamicChange(event) {
            if (event.target.matches('.workflow-run-mode-select')) {
                updateStepMode(event.target.dataset.workflowStepId, event.target.value);
            } else if (event.target.matches('.workflow-model-override-select')) {
                updateStepModel(event.target.dataset.workflowStepId, event.target.value);
            }
        }

        function bindListeners() {
            if (listenersBound || !global.document) return;
            listenersBound = true;
            getElement('workflow-template-list')?.addEventListener('click', handleStaticClick);
            getElement('workflow-module-filters')?.addEventListener('click', handleStaticClick);
            getElement('workflow-module-list')?.addEventListener('click', handleStaticClick);
            getElement('workflow-steps')?.addEventListener('click', handleStaticClick);
            getElement('workflow-steps')?.addEventListener('change', handleDynamicChange);
            getElement('workflow-start-btn')?.addEventListener('click', handleStart);
            getElement('workflow-mobile-start-btn')?.addEventListener('click', handleStart);
            getElement('workflow-refresh-btn')?.addEventListener('click', () => refreshEstimates(true));
            getElement('workflow-add-module-btn')?.addEventListener('click', event => openDialog('library', event.currentTarget));
            getElement('workflow-empty-add-btn')?.addEventListener('click', event => openDialog('library', event.currentTarget));
            getElement('workflow-settings-btn')?.addEventListener('click', event => openDialog('settings', event.currentTarget));
            getElement('workflow-estimator-settings-btn')?.addEventListener('click', event => openDialog('settings', event.currentTarget));
            getElement('workflow-module-library-close')?.addEventListener('click', () => closeDialog());
            getElement('workflow-module-library-done')?.addEventListener('click', () => closeDialog());
            getElement('workflow-settings-close')?.addEventListener('click', () => closeDialog());
            getElement('workflow-settings-save')?.addEventListener('click', saveSettings);
            getElement('workflow-settings-reset')?.addEventListener('click', resetSettingsDraft);
            getElement('workflow-module-library-backdrop')?.addEventListener('click', () => closeDialog());
            getElement('workflow-settings-backdrop')?.addEventListener('click', () => closeDialog());
            global.document.addEventListener('keydown', event => {
                if (event.key === 'Escape' && activeDialog) {
                    event.preventDefault();
                    closeDialog();
                    return;
                }
                trapDialogFocus(event);
            });
        }

        async function init() {
            ensureContext();
            if (!initialized) {
                initialized = true;
                bindListeners();
            }
            render();
            await refreshEstimates(false);
            return controller;
        }

        function getPlan() {
            ensureContext();
            lastEstimate = calculateEstimate();
            return clone({
                ...plan,
                modules: plan.modules.map(step => {
                    const definition = MODULES[step.id];
                    const requestedModel = requestedModelForStep(step, definition);
                    return {
                        ...step,
                        executionMode: step.runMode,
                        execution_mode: step.runMode,
                        model: step.modelOverride || '',
                        resolvedModel: requestedModel
                            ? effectiveModelForStep(step, definition)?.value || ''
                            : ''
                    };
                }),
                projectId: currentProject()?.id || currentProject()?.project_id || null,
                estimate: lastEstimate,
                dependencyIssues: dependencyIssues()
            });
        }

        function setRunning(value) {
            running = Boolean(value);
            const current = runState && typeof runState === 'object' ? runState : {};
            runState = { ...current, running };
            persistRunState();
            render();
            return controller;
        }

        function resetStepStatuses() {
            plan.modules.forEach(step => {
                step.status = 'pending';
                step.detail = '';
            });
            persistPlan();
            render();
            notifyPlanChange();
            return controller;
        }

        function setStepStatus(id, status, detail = '') {
            const step = plan.modules.find(item => item.id === id);
            if (!step || !VALID_STATUSES.has(status)) return false;
            step.status = status;
            step.detail = safeString(detail, 1000);
            persistPlan();
            render();
            notifyPlanChange();
            return true;
        }

        function getRunState() {
            ensureContext();
            return clone(runState);
        }

        function setRunState(value) {
            ensureContext();
            runState = value === undefined ? null : clone(value);
            if (runState && typeof runState === 'object') {
                if (['completed', 'error', 'cancelled', 'canceled'].includes(runState.status)) {
                    runState.running = false;
                } else if (typeof runState.running !== 'boolean') {
                    runState.running = ['running', 'queued'].includes(runState.status);
                }
                running = Boolean(runState.running);
            }
            persistRunState();
            render();
            return controller;
        }

        function clearRunState() {
            ensureContext();
            runState = null;
            running = false;
            persistRunState();
            render();
            return controller;
        }

        const controller = Object.freeze({
            init,
            render,
            refreshEstimates,
            getPlan,
            setRunning,
            resetStepStatuses,
            setStepStatus,
            setStatus,
            getRunState,
            setRunState,
            clearRunState
        });

        return controller;
    }

    global.SkriptLabWorkflowStudio = Object.assign({}, global.SkriptLabWorkflowStudio, { create });
}(window));
