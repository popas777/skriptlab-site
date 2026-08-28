(function () {
    'use strict';

    const SCHEDULE_KEY = 'publishing_timeline';
    const SCHEMA_VERSION = 1;
    const DETAILS_LIMIT = 50000;
    const DETAILS_PREVIEW_LIMIT = 190;
    const EDIT_ACCESS_LEVELS = new Set(['admin', 'owner', 'shared_edit']);
    const PHASES = Object.freeze({
        book: { label: 'Kirjaprojekti', description: 'Teksti, sopimukset ja toimitustyö' },
        production: { label: 'Julkaisutuotanto', description: 'Aineistot, formaatit ja jakeluvalmius' },
        launch: { label: 'Lanseeraus', description: 'Markkinointi ja ilmestyminen' },
        aftercare: { label: 'Julkaisun jälkeen', description: 'Kampanjat, oikeudet ja uudet kieliversiot' },
    });
    const PHASE_ORDER = Object.freeze(Object.keys(PHASES));
    const STATUS_LABELS = Object.freeze({
        not_started: 'Ei aloitettu',
        in_progress: 'Työn alla',
        blocked: 'Estynyt',
        done: 'Valmis',
    });

    const DEFAULT_TASKS = Object.freeze([
        {
            id: 'timeline-project-start',
            template_key: 'project_start',
            title: 'Sopimus ja projektin käynnistys',
            phase: 'book',
            details: 'Varmista sopimus, projektin tavoitteet, budjetti, keskeiset oikeudet ja päätöksentekijät ennen varsinaisen tuotannon käynnistämistä.',
        },
        {
            id: 'timeline-manuscript-ready',
            template_key: 'manuscript_ready',
            title: 'Käsikirjoitus valmis',
            phase: 'book',
            details: 'Lukitse toimitukseen menevä käsikirjoitusversio ja kirjaa avoimet sisällölliset päätökset.',
        },
        {
            id: 'timeline-proofread-ready',
            template_key: 'proofread_ready',
            title: 'Editointi, kielenhuolto ja oikoluku valmiit',
            phase: 'book',
            details: 'Sovi editointi- ja oikolukukierrokset, hyväksyjät sekä viimeisten korjausten toimintatapa.',
        },
        {
            id: 'timeline-cover-ready',
            template_key: 'cover_ready',
            title: 'Kansi valmis',
            phase: 'production',
            details: 'Hyväksy etu- ja takakansi, selkä, kansitekstit sekä paino- ja digitaalisten formaattien tiedostot.',
        },
        {
            id: 'timeline-product-info-ready',
            template_key: 'product_info_ready',
            title: 'Tuotetiedot valmiit',
            phase: 'production',
            details: 'Viimeistele ISBN-, ONIX-, hinta-, kategoria-, kuvaus-, tekijä- ja oikeustiedot jakelua varten.',
        },
        {
            id: 'timeline-layout-ready',
            template_key: 'layout_ready',
            title: 'Taitto ja julkaisutiedostot valmiit',
            phase: 'production',
            details: 'Tarkista paino-PDF, EPUB ja muut sovitut formaatit sekä niiden tekninen hyväksyntä.',
        },
        {
            id: 'timeline-audio-ready',
            template_key: 'audio_ready',
            title: 'Äänikirja valmis',
            phase: 'production',
            details: 'Aikatauluta lukukäsikirjoitus, äänitys, editointi, masterointi ja jakelukumppanin tekninen tarkastus.',
        },
        {
            id: 'timeline-marketing-materials',
            template_key: 'marketing_materials',
            title: 'Markkinointimateriaalien teko',
            phase: 'launch',
            details: 'Valmista kampanjakonsepti, myyntiesittelyt, mediapitch, someaineistot, mainoskuvat ja ennakkomateriaalit.',
        },
        {
            id: 'timeline-release-preparation',
            template_key: 'release_preparation',
            title: 'Jakelu ja julkaisupaketti valmiit',
            phase: 'launch',
            details: 'Varmista aineistojen toimitus jakeluun, ennakkomyynti, saatavuus, kanavakohtaiset hyväksynnät ja julkaisupäivän valmius.',
        },
        {
            id: 'timeline-publication',
            template_key: 'publication',
            title: 'Ilmestyminen',
            phase: 'launch',
            details: 'Koordinoi julkaisupäivä, kanavien päivitykset, viestintä, tapahtumat ja mahdolliset lanseeraustilaisuudet.',
        },
        {
            id: 'timeline-post-release-campaigns',
            template_key: 'post_release_campaigns',
            title: 'Ilmestymisen jälkeiset kampanjat',
            phase: 'aftercare',
            details: 'Suunnittele jatkokampanjat, arvostelunostot, tapahtumat, sesongit, yhteisötyö ja kampanjoiden tulosten seuranta.',
        },
        {
            id: 'timeline-translation-start',
            template_key: 'translation_start',
            title: 'Käännösprojekti alkaa',
            phase: 'aftercare',
            details: 'Määritä kohdekieli, oikeudet, kääntäjä, lähdeversio, tyyliopas, tarkastuskierrokset ja käännöksen julkaisutavoite.',
        },
    ]);

    const state = {
        initialized: false,
        projectId: '',
        sourceSignature: '',
        tasks: [],
        filter: 'all',
        canEdit: false,
        editingTaskId: '',
        editingProjectId: '',
        editingSourceSignature: '',
        editingRevision: '',
        sourceRevision: '',
        saving: false,
        pendingProjectChange: false,
    };
    const elements = {};

    function stringValue(value, maxLength = DETAILS_LIMIT) {
        return String(value == null ? '' : value).slice(0, maxLength);
    }

    function validDateValue(value) {
        const text = stringValue(value, 10);
        const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return '';
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const date = new Date(Date.UTC(year, month - 1, day));
        return (
            date.getUTCFullYear() === year
            && date.getUTCMonth() === month - 1
            && date.getUTCDate() === day
        ) ? text : '';
    }

    function defaultTask(task, index) {
        return {
            id: task.id,
            template_key: task.template_key,
            title: task.title,
            phase: task.phase,
            status: 'not_started',
            start_date: '',
            deadline_date: '',
            assignee: '',
            details: task.details,
            custom: false,
            sort_order: (index + 1) * 10,
            created_at: '',
            updated_at: '',
        };
    }

    function normalizeTask(value, fallback, index) {
        const source = value && typeof value === 'object' ? value : {};
        const base = fallback && typeof fallback === 'object' ? fallback : {};
        const phase = PHASES[source.phase] ? source.phase : (PHASES[base.phase] ? base.phase : 'book');
        const status = STATUS_LABELS[source.status] ? source.status : (STATUS_LABELS[base.status] ? base.status : 'not_started');
        const templateKey = stringValue(source.template_key || base.template_key, 120).trim();
        const custom = templateKey ? false : Boolean(source.custom ?? base.custom ?? true);
        const fallbackId = templateKey ? `timeline-${templateKey.replace(/[^a-z0-9_-]+/gi, '-')}` : `timeline-custom-${index + 1}`;
        const rawSortOrder = Number(source.sort_order ?? base.sort_order ?? ((index + 1) * 10));
        return {
            id: stringValue(source.id || base.id || fallbackId, 180).trim() || fallbackId,
            template_key: templateKey || null,
            title: stringValue(source.title ?? base.title, 160).trim() || 'Nimetön tehtävä',
            phase,
            status,
            start_date: validDateValue(source.start_date ?? base.start_date),
            deadline_date: validDateValue(source.deadline_date ?? base.deadline_date),
            assignee: stringValue(source.assignee ?? base.assignee, 160).trim(),
            details: stringValue(source.details ?? base.details, DETAILS_LIMIT),
            custom,
            sort_order: Number.isFinite(rawSortOrder) ? rawSortOrder : ((index + 1) * 10),
            created_at: stringValue(source.created_at ?? base.created_at, 40),
            updated_at: stringValue(source.updated_at ?? base.updated_at, 40),
        };
    }

    function normalizeSchedule(value) {
        const rawTasks = Array.isArray(value?.tasks) ? value.tasks : [];
        const consumed = new Set();
        const tasks = DEFAULT_TASKS.map((template, index) => {
            const fallback = defaultTask(template, index);
            const storedIndex = rawTasks.findIndex((item, itemIndex) => (
                !consumed.has(itemIndex)
                && item
                && String(item.template_key || '') === template.template_key
            ));
            if (storedIndex < 0) return fallback;
            consumed.add(storedIndex);
            return normalizeTask(rawTasks[storedIndex], fallback, index);
        });
        const customTasks = rawTasks
            .map((item, index) => ({ item, index }))
            .filter(({ item, index }) => !consumed.has(index) && item && typeof item === 'object')
            .map(({ item, index }) => normalizeTask({ ...item, template_key: null, custom: true }, null, DEFAULT_TASKS.length + index))
            .sort((left, right) => left.sort_order - right.sort_order);
        return {
            schema_version: SCHEMA_VERSION,
            tasks: [...tasks, ...customTasks],
            updated_at: stringValue(value?.updated_at, 40),
        };
    }

    function canonicalJson(value) {
        if (Array.isArray(value)) return value.map(canonicalJson);
        if (value && typeof value === 'object') {
            return Object.keys(value)
                .sort()
                .reduce((result, key) => {
                    result[key] = canonicalJson(value[key]);
                    return result;
                }, {});
        }
        return value;
    }

    function scheduleSignature(value) {
        return JSON.stringify(canonicalJson(value || null));
    }

    function scheduleRevision(value) {
        return value && typeof value === 'object' ? stringValue(value.updated_at, 80) : '';
    }

    function compactDetails(value) {
        return stringValue(value).replace(/\s+/g, ' ').trim();
    }

    function truncateDetails(value, limit = DETAILS_PREVIEW_LIMIT) {
        const compact = compactDetails(value);
        if (compact.length <= limit) return compact;
        const candidate = compact.slice(0, Math.max(1, limit - 1));
        const wordBoundary = candidate.lastIndexOf(' ');
        const clipped = wordBoundary > Math.floor(limit * 0.58) ? candidate.slice(0, wordBoundary) : candidate;
        return `${clipped.trimEnd()}…`;
    }

    function validateTaskDates(startDate, deadlineDate) {
        const start = startDate ? validDateValue(startDate) : '';
        const deadline = deadlineDate ? validDateValue(deadlineDate) : '';
        if (startDate && !start) return 'Työn aloituspäivä ei ole kelvollinen.';
        if (deadlineDate && !deadline) return 'Deadline ei ole kelvollinen.';
        if (start && deadline && deadline < start) return 'Deadline ei voi olla ennen työn aloitusta.';
        return '';
    }

    function todayDateKey() {
        const now = new Date();
        const year = String(now.getFullYear()).padStart(4, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function formatDate(value) {
        const valid = validDateValue(value);
        if (!valid) return 'Ei asetettu';
        const [year, month, day] = valid.split('-').map(Number);
        return new Intl.DateTimeFormat('fi-FI', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        }).format(new Date(year, month - 1, day));
    }

    function uniqueTaskId() {
        if (globalThis.crypto?.randomUUID) return `timeline-custom-${globalThis.crypto.randomUUID()}`;
        return `timeline-custom-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function currentProject() {
        try {
            const activeId = localStorage.getItem('skriptlab_active_project_id');
            if (window.manuscriptData?.id && (!activeId || String(window.manuscriptData.id) === String(activeId))) {
                return window.manuscriptData;
            }
            const local = JSON.parse(localStorage.getItem('skriptlab_manuscript') || 'null');
            if (local?.id && (!activeId || String(local.id) === String(activeId))) return local;
        } catch (error) {
            // A malformed local draft must not prevent the empty state from rendering.
        }
        return null;
    }

    function canEditProject(project) {
        const accessLevel = stringValue(project?.access_level, 40);
        return !accessLevel || EDIT_ACCESS_LEVELS.has(accessLevel);
    }

    function isVisible() {
        return Boolean(elements.view && !elements.view.classList.contains('hidden'));
    }

    function setSaveStatus(message, tone = '') {
        if (!elements.saveStatus) return;
        elements.saveStatus.textContent = message;
        elements.saveStatus.dataset.tone = tone;
    }

    function applyScheduleToActiveProject(projectId, schedule, options = {}) {
        const activeProject = currentProject();
        if (String(activeProject?.id || '') !== String(projectId)) return false;
        activeProject.analysis = { ...(activeProject.analysis || {}), [SCHEDULE_KEY]: schedule };
        if (window.manuscriptData?.id && String(window.manuscriptData.id) === String(projectId)) {
            window.manuscriptData.analysis = activeProject.analysis;
        }
        try {
            localStorage.setItem('skriptlab_manuscript', JSON.stringify(activeProject));
        } catch (error) {
            console.warn('Aikajanan paikallisen projektikopion päivitys epäonnistui.', error);
        }
        if (options.refreshState) {
            state.sourceSignature = scheduleSignature(schedule);
            state.sourceRevision = scheduleRevision(schedule);
            state.tasks = normalizeSchedule(schedule).tasks;
            render();
        }
        return true;
    }

    function element(tagName, className, text) {
        const node = document.createElement(tagName);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function renderOverview() {
        const tasks = state.tasks;
        const completed = tasks.filter(task => task.status === 'done').length;
        const percentage = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
        const today = todayDateKey();
        const overdue = tasks.filter(task => task.status !== 'done' && task.deadline_date && task.deadline_date < today);
        const upcoming = tasks
            .filter(task => task.status !== 'done' && task.deadline_date && task.deadline_date >= today)
            .sort((left, right) => left.deadline_date.localeCompare(right.deadline_date));
        const next = upcoming[0] || null;

        elements.completedCount.textContent = `${completed} / ${tasks.length}`;
        elements.progressBar.style.width = `${percentage}%`;
        elements.nextDeadline.textContent = next ? formatDate(next.deadline_date) : 'Ei asetettu';
        elements.nextDeadlineTask.textContent = next ? next.title : 'Täydennä avoimien tehtävien päivämäärät';
        elements.overdueCount.textContent = String(overdue.length);
    }

    function filteredTasks() {
        if (state.filter === 'done') return state.tasks.filter(task => task.status === 'done');
        if (state.filter === 'active') return state.tasks.filter(task => task.status === 'in_progress');
        if (state.filter === 'open') return state.tasks.filter(task => task.status !== 'done');
        return state.tasks;
    }

    function taskUrgency(task) {
        if (!task.deadline_date || task.status === 'done') return '';
        const today = todayDateKey();
        if (task.deadline_date < today) return 'overdue';
        const todayDate = new Date(`${today}T12:00:00`);
        const deadlineDate = new Date(`${task.deadline_date}T12:00:00`);
        const days = Math.round((deadlineDate - todayDate) / 86400000);
        return days <= 7 ? 'soon' : '';
    }

    function buildMeta(label, value, modifier = '') {
        const item = element('div', `timeline-task-meta-item${modifier ? ` ${modifier}` : ''}`);
        item.append(element('span', '', label), element('strong', '', value));
        return item;
    }

    function buildTaskCard(task) {
        const urgency = taskUrgency(task);
        const card = element('article', `timeline-task-card glass-panel status-${task.status}${urgency ? ` is-${urgency}` : ''}`);
        card.dataset.taskId = task.id;

        const rail = element('div', 'timeline-task-rail');
        rail.append(element('span', 'timeline-task-marker'));

        const body = element('div', 'timeline-task-body');
        const heading = element('div', 'timeline-task-heading');
        const titleBlock = element('div');
        const badgeRow = element('div', 'timeline-task-badges');
        badgeRow.append(element('span', `timeline-status-badge status-${task.status}`, STATUS_LABELS[task.status]));
        if (task.custom) badgeRow.append(element('span', 'timeline-custom-badge', 'Oma tehtävä'));
        if (urgency === 'overdue') badgeRow.append(element('span', 'timeline-urgency-badge is-overdue', 'DL ylitetty'));
        if (urgency === 'soon') badgeRow.append(element('span', 'timeline-urgency-badge is-soon', 'DL lähestyy'));
        titleBlock.append(badgeRow, element('h4', '', task.title));

        const openButton = element('button', 'timeline-open-task-btn', state.canEdit ? 'Muokkaa' : 'Näytä tiedot');
        openButton.type = 'button';
        openButton.setAttribute('aria-label', `${state.canEdit ? 'Muokkaa tehtävää' : 'Näytä tehtävän tiedot'}: ${task.title}`);
        openButton.addEventListener('click', () => openTaskDialog(task.id));
        heading.append(titleBlock, openButton);

        const preview = truncateDetails(task.details);
        const previewNode = element(
            'p',
            `timeline-task-preview${preview ? '' : ' is-empty'}`,
            preview || 'Ei lisätietoja. Avaa tehtävä täydentääksesi tiedot.'
        );

        const meta = element('div', 'timeline-task-meta');
        meta.append(
            buildMeta('Työ alkaa', formatDate(task.start_date)),
            buildMeta('DL', formatDate(task.deadline_date), urgency === 'overdue' ? 'is-overdue' : ''),
            buildMeta('Tekijä', task.assignee || 'Ei nimetty')
        );
        body.append(heading, previewNode, meta);
        card.append(rail, body);
        return card;
    }

    function renderTaskList() {
        const visibleTasks = filteredTasks();
        elements.taskList.replaceChildren();
        if (!visibleTasks.length) {
            const empty = element('div', 'timeline-filter-empty glass-panel');
            empty.append(
                element('strong', '', 'Ei tehtäviä tällä suodattimella'),
                element('p', '', 'Vaihda suodatinta tai lisää uusi oma tehtävä.')
            );
            elements.taskList.append(empty);
            return;
        }

        PHASE_ORDER.forEach((phaseKey, phaseIndex) => {
            const phaseTasks = visibleTasks.filter(task => task.phase === phaseKey);
            if (!phaseTasks.length) return;
            const section = element('section', 'timeline-phase');
            section.dataset.phase = phaseKey;
            const header = element('div', 'timeline-phase-header');
            const number = element('span', 'timeline-phase-number', String(phaseIndex + 1).padStart(2, '0'));
            const copy = element('div');
            copy.append(
                element('h3', '', PHASES[phaseKey].label),
                element('p', '', PHASES[phaseKey].description)
            );
            const count = element('span', 'timeline-phase-count', `${phaseTasks.length} ${phaseTasks.length === 1 ? 'tehtävä' : 'tehtävää'}`);
            header.append(number, copy, count);
            const cards = element('div', 'timeline-phase-tasks');
            phaseTasks.forEach(task => cards.append(buildTaskCard(task)));
            section.append(header, cards);
            elements.taskList.append(section);
        });
    }

    function render(options = {}) {
        if (!state.initialized) return;
        const project = currentProject();
        if (!project?.id) {
            state.projectId = '';
            state.sourceSignature = '';
            state.sourceRevision = '';
            state.tasks = [];
            state.canEdit = false;
            elements.empty.hidden = false;
            elements.content.hidden = true;
            elements.addButton.disabled = true;
            elements.context.textContent = 'Valitse käsikirjoitus, niin voit suunnitella työn julkaisusta jatkokampanjoihin.';
            return;
        }

        const projectId = String(project.id);
        const rawSchedule = project.analysis?.[SCHEDULE_KEY];
        const sourceSignature = scheduleSignature(rawSchedule);
        if (options.force || state.projectId !== projectId || state.sourceSignature !== sourceSignature) {
            state.projectId = projectId;
            state.sourceSignature = sourceSignature;
            state.sourceRevision = scheduleRevision(rawSchedule);
            state.tasks = normalizeSchedule(rawSchedule).tasks;
        }
        state.canEdit = canEditProject(project);
        elements.empty.hidden = true;
        elements.content.hidden = false;
        elements.addButton.disabled = !state.canEdit;
        elements.addButton.title = state.canEdit ? '' : 'Sinulla on tähän projektiin vain katseluoikeus.';
        elements.context.textContent = `${project.title || 'Nimetön kirjaprojekti'} · ${state.tasks.length} tehtävää julkaisun suunnitteluun ja seurantaan`;
        const actionHint = elements.addButton.nextElementSibling;
        if (actionHint) actionHint.textContent = state.canEdit
            ? 'Tehtävät tallentuvat valittuun projektiin.'
            : 'Sinulla on tähän aikajanaan katseluoikeus.';
        renderOverview();
        renderTaskList();
    }

    function setFormError(message = '') {
        elements.formError.textContent = message;
        elements.formError.hidden = !message;
    }

    function updateDetailsCount() {
        elements.detailsCount.textContent = new Intl.NumberFormat('fi-FI').format(elements.details.value.length);
    }

    function setDialogEditable(editable) {
        [elements.title, elements.start, elements.deadline, elements.assignee, elements.details]
            .forEach(field => {
                field.readOnly = !editable;
                field.setAttribute('aria-readonly', String(!editable));
            });
        [elements.phase, elements.status].forEach(field => {
            field.disabled = !editable;
            field.setAttribute('aria-readonly', String(!editable));
        });
        elements.saveButton.hidden = !editable;
        elements.cancelButton.textContent = editable ? 'Peruuta' : 'Sulje';
    }

    function setDialogSaving(saving) {
        elements.dialog.setAttribute('aria-busy', String(saving));
        elements.closeButton.disabled = saving;
        elements.cancelButton.disabled = saving;
        elements.deleteButton.disabled = saving;
        elements.saveButton.disabled = saving;
        elements.saveButton.textContent = saving ? 'Tallennetaan…' : 'Tallenna tehtävä';
    }

    function showDialog() {
        if (typeof elements.dialog.showModal === 'function') elements.dialog.showModal();
        else elements.dialog.setAttribute('open', '');
    }

    function closeDialog(options = {}) {
        if (state.saving && !options.force) return;
        state.editingTaskId = '';
        state.editingProjectId = '';
        state.editingSourceSignature = '';
        state.editingRevision = '';
        setFormError('');
        if (typeof elements.dialog.close === 'function' && elements.dialog.open) elements.dialog.close();
        else elements.dialog.removeAttribute('open');
    }

    function openTaskDialog(taskId = '') {
        const project = currentProject();
        if (!project?.id) return;
        const existing = taskId ? state.tasks.find(task => task.id === taskId) : null;
        if (taskId && !existing) return;
        if (!existing && !state.canEdit) return;

        const task = existing || {
            id: '',
            template_key: null,
            title: '',
            phase: 'book',
            status: 'not_started',
            start_date: '',
            deadline_date: '',
            assignee: '',
            details: '',
            custom: true,
        };
        state.editingTaskId = task.id;
        state.editingProjectId = String(project.id);
        state.editingSourceSignature = state.sourceSignature;
        state.editingRevision = state.sourceRevision;
        elements.taskId.value = task.id;
        elements.title.value = task.title;
        elements.phase.value = task.phase;
        elements.status.value = task.status;
        elements.start.value = task.start_date;
        elements.deadline.value = task.deadline_date;
        elements.assignee.value = task.assignee;
        elements.details.value = task.details;
        elements.dialogKicker.textContent = existing ? PHASES[task.phase].label.toUpperCase() : 'UUSI OMA TEHTÄVÄ';
        elements.dialogTitle.textContent = existing ? task.title : 'Lisää tehtävä aikajanalle';
        elements.deleteButton.hidden = !existing?.custom || !state.canEdit;
        setDialogEditable(state.canEdit);
        setFormError('');
        updateDetailsCount();
        showDialog();
        elements.dialog.scrollTop = 0;
        const focusTarget = state.canEdit ? elements.title : elements.closeButton;
        focusTarget.focus({ preventScroll: true });
    }

    function taskPayloadFromForm(existing) {
        const now = new Date().toISOString();
        const maxSortOrder = state.tasks.reduce((largest, task) => Math.max(largest, Number(task.sort_order) || 0), 0);
        return normalizeTask({
            ...existing,
            id: existing?.id || uniqueTaskId(),
            template_key: existing?.template_key || null,
            title: elements.title.value,
            phase: elements.phase.value,
            status: elements.status.value,
            start_date: elements.start.value,
            deadline_date: elements.deadline.value,
            assignee: elements.assignee.value,
            details: elements.details.value,
            custom: existing ? existing.custom : true,
            sort_order: existing?.sort_order ?? (maxSortOrder + 10),
            created_at: existing?.created_at || now,
            updated_at: now,
        }, existing || null, state.tasks.length);
    }

    function serializedSchedule(tasks) {
        return {
            schema_version: SCHEMA_VERSION,
            tasks: tasks.map(task => ({
                id: task.id,
                template_key: task.template_key,
                title: task.title,
                phase: task.phase,
                status: task.status,
                start_date: task.start_date,
                deadline_date: task.deadline_date,
                assignee: task.assignee,
                details: task.details,
                custom: task.custom,
                sort_order: task.sort_order,
                created_at: task.created_at,
                updated_at: task.updated_at,
            })),
            updated_at: new Date().toISOString(),
        };
    }

    async function fetchLatestProject(projectId) {
        const response = await window.SkriptLabAuth.fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
            cache: 'no-store',
        });
        const project = await response.json().catch(() => null);
        if (!response.ok) throw new Error(project?.detail || 'Aikajanan ajantasaisuutta ei voitu tarkistaa.');
        return project;
    }

    async function persistTasks(tasks, saveContext) {
        const projectId = String(saveContext?.projectId || '');
        const project = currentProject();
        if (!projectId || String(project?.id || '') !== projectId) {
            throw new Error('Aktiivinen kirjaprojekti vaihtui. Avaa tehtävä uudelleen.');
        }
        if (!canEditProject(project)) throw new Error('Sinulla ei ole muokkausoikeutta tähän aikajanaan.');
        if (!window.SkriptLabAuth?.fetch) throw new Error('Tallennusyhteys ei ole käytettävissä.');

        const latestProject = await fetchLatestProject(projectId);
        const latestSchedule = latestProject?.analysis?.[SCHEDULE_KEY];
        const latestSignature = scheduleSignature(latestSchedule);
        if (latestSignature !== saveContext.sourceSignature) {
            applyScheduleToActiveProject(projectId, latestSchedule, { refreshState: true });
            throw new Error('Aikajanaa muutettiin toisessa näkymässä. Uusin versio ladattiin; sulje editori ja avaa tehtävä uudelleen.');
        }
        if (String(currentProject()?.id || '') !== projectId) {
            throw new Error('Aktiivinen kirjaprojekti vaihtui. Avaa tehtävä uudelleen.');
        }

        const schedule = serializedSchedule(tasks);
        const response = await window.SkriptLabAuth.fetch(`/api/projects/${encodeURIComponent(projectId)}/metadata`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                analysis: { [SCHEDULE_KEY]: schedule },
                publishing_timeline_revision: saveContext.revision,
            }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
            let detail = data?.detail || 'Aikajanan tallennus epäonnistui.';
            if (response.status === 409) {
                try {
                    const conflictProject = await fetchLatestProject(projectId);
                    const conflictSchedule = conflictProject?.analysis?.[SCHEDULE_KEY];
                    const scheduleChanged = scheduleSignature(conflictSchedule) !== saveContext.sourceSignature;
                    if (scheduleChanged && applyScheduleToActiveProject(projectId, conflictSchedule, { refreshState: true })) {
                        detail = 'Aikajanaa muutettiin juuri toisessa näkymässä. Uusin versio ladattiin; sulje editori ja avaa tehtävä uudelleen.';
                    }
                } catch (refreshError) {
                    // Keep the server conflict message if refreshing the latest snapshot also fails.
                }
            }
            throw new Error(detail);
        }

        const activeProject = currentProject();
        if (String(activeProject?.id || '') === projectId) {
            const savedSchedule = data?.analysis?.[SCHEDULE_KEY] || schedule;
            applyScheduleToActiveProject(projectId, savedSchedule);
            window.dispatchEvent(new CustomEvent('skriptlab:timeline-saved', {
                detail: { projectId, taskCount: tasks.length },
            }));
        }
        const savedSchedule = data?.analysis?.[SCHEDULE_KEY] || schedule;
        return {
            projectId,
            schedule: savedSchedule,
            signature: scheduleSignature(savedSchedule),
            revision: scheduleRevision(savedSchedule),
        };
    }

    async function submitTask(event) {
        event.preventDefault();
        if (state.saving || !state.canEdit) return;
        const title = elements.title.value.trim();
        if (!title) {
            setFormError('Anna tehtävälle nimi.');
            elements.title.focus();
            return;
        }
        const dateError = validateTaskDates(elements.start.value, elements.deadline.value);
        if (dateError) {
            setFormError(dateError);
            elements.deadline.focus();
            return;
        }
        const existingIndex = state.tasks.findIndex(task => task.id === state.editingTaskId);
        const existing = existingIndex >= 0 ? state.tasks[existingIndex] : null;
        const task = taskPayloadFromForm(existing);
        const nextTasks = state.tasks.slice();
        if (existingIndex >= 0) nextTasks.splice(existingIndex, 1, task);
        else nextTasks.push(task);

        const saveContext = {
            projectId: state.editingProjectId,
            sourceSignature: state.editingSourceSignature,
            revision: state.editingRevision,
        };
        let shouldClose = false;
        let shouldRefresh = false;
        state.saving = true;
        setDialogSaving(true);
        setFormError('');
        setSaveStatus('Tallennetaan aikajanaa…', 'working');
        try {
            const saved = await persistTasks(nextTasks, saveContext);
            shouldClose = true;
            if (String(currentProject()?.id || '') === saved.projectId) {
                state.tasks = nextTasks;
                state.sourceSignature = saved.signature;
                state.sourceRevision = saved.revision;
                render();
                setSaveStatus(`Tallennettu ${new Date().toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}.`, 'success');
            } else {
                shouldRefresh = true;
            }
        } catch (error) {
            if (String(currentProject()?.id || '') !== saveContext.projectId) {
                shouldClose = true;
                shouldRefresh = true;
                setSaveStatus('Tallennus keskeytettiin, koska aktiivinen projekti vaihtui.', 'error');
            } else {
                setFormError(error.message || 'Aikajanan tallennus epäonnistui.');
                setSaveStatus('Tallennus epäonnistui. Tehtävän tiedot ovat yhä editorissa.', 'error');
            }
        } finally {
            state.saving = false;
            setDialogSaving(false);
            shouldRefresh = shouldRefresh || state.pendingProjectChange;
            state.pendingProjectChange = false;
            if (shouldClose || shouldRefresh) closeDialog({ force: true });
            if (shouldRefresh) {
                render({ force: true });
                setSaveStatus('Muutokset tallennetaan tehtäväeditorista.');
            }
        }
    }

    async function deleteTask() {
        if (state.saving || !state.canEdit) return;
        const task = state.tasks.find(item => item.id === state.editingTaskId);
        if (!task?.custom) return;
        if (!window.confirm(`Poistetaanko oma tehtävä “${task.title}”?`)) return;
        const nextTasks = state.tasks.filter(item => item.id !== task.id);
        const saveContext = {
            projectId: state.editingProjectId,
            sourceSignature: state.editingSourceSignature,
            revision: state.editingRevision,
        };
        let shouldClose = false;
        let shouldRefresh = false;
        state.saving = true;
        setDialogSaving(true);
        setSaveStatus('Poistetaan tehtävää…', 'working');
        try {
            const saved = await persistTasks(nextTasks, saveContext);
            shouldClose = true;
            if (String(currentProject()?.id || '') === saved.projectId) {
                state.tasks = nextTasks;
                state.sourceSignature = saved.signature;
                state.sourceRevision = saved.revision;
                render();
                setSaveStatus('Oma tehtävä poistettiin.', 'success');
            } else {
                shouldRefresh = true;
            }
        } catch (error) {
            if (String(currentProject()?.id || '') !== saveContext.projectId) {
                shouldClose = true;
                shouldRefresh = true;
                setSaveStatus('Poisto keskeytettiin, koska aktiivinen projekti vaihtui.', 'error');
            } else {
                setFormError(error.message || 'Tehtävän poistaminen epäonnistui.');
                setSaveStatus('Poisto epäonnistui. Tehtävää ei poistettu.', 'error');
            }
        } finally {
            state.saving = false;
            setDialogSaving(false);
            shouldRefresh = shouldRefresh || state.pendingProjectChange;
            state.pendingProjectChange = false;
            if (shouldClose || shouldRefresh) closeDialog({ force: true });
            if (shouldRefresh) {
                render({ force: true });
                setSaveStatus('Muutokset tallennetaan tehtäväeditorista.');
            }
        }
    }

    function setFilter(filter) {
        state.filter = ['all', 'open', 'active', 'done'].includes(filter) ? filter : 'all';
        elements.filters.forEach(button => {
            const active = button.dataset.timelineFilter === state.filter;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        renderTaskList();
    }

    function projectChanged() {
        if (!state.initialized) return;
        if (elements.dialog?.open && String(currentProject()?.id || '') !== state.editingProjectId) {
            if (state.saving) state.pendingProjectChange = true;
            else closeDialog();
        }
        render({ force: true });
    }

    function cacheElements() {
        Object.assign(elements, {
            view: document.getElementById('view-aikajana'),
            context: document.getElementById('timeline-project-context'),
            addButton: document.getElementById('timeline-add-task-btn'),
            openProjectsButton: document.getElementById('timeline-open-projects-btn'),
            empty: document.getElementById('timeline-project-empty'),
            content: document.getElementById('timeline-workspace-content'),
            completedCount: document.getElementById('timeline-completed-count'),
            progressBar: document.getElementById('timeline-progress-bar'),
            nextDeadline: document.getElementById('timeline-next-deadline'),
            nextDeadlineTask: document.getElementById('timeline-next-deadline-task'),
            overdueCount: document.getElementById('timeline-overdue-count'),
            taskList: document.getElementById('timeline-task-list'),
            saveStatus: document.getElementById('timeline-save-status'),
            filters: Array.from(document.querySelectorAll('[data-timeline-filter]')),
            dialog: document.getElementById('timeline-task-dialog'),
            form: document.getElementById('timeline-task-form'),
            dialogKicker: document.getElementById('timeline-dialog-kicker'),
            dialogTitle: document.getElementById('timeline-dialog-title'),
            closeButton: document.getElementById('timeline-dialog-close-btn'),
            cancelButton: document.getElementById('timeline-dialog-cancel-btn'),
            deleteButton: document.getElementById('timeline-delete-task-btn'),
            saveButton: document.getElementById('timeline-save-task-btn'),
            formError: document.getElementById('timeline-form-error'),
            taskId: document.getElementById('timeline-task-id'),
            title: document.getElementById('timeline-task-title'),
            phase: document.getElementById('timeline-task-phase'),
            status: document.getElementById('timeline-task-status'),
            start: document.getElementById('timeline-task-start'),
            deadline: document.getElementById('timeline-task-deadline'),
            assignee: document.getElementById('timeline-task-assignee'),
            details: document.getElementById('timeline-task-details'),
            detailsCount: document.getElementById('timeline-details-count'),
        });
        return Boolean(elements.view && elements.dialog && elements.taskList);
    }

    function bindEvents() {
        elements.addButton.addEventListener('click', () => openTaskDialog());
        elements.openProjectsButton.addEventListener('click', () => {
            if (typeof window.openModule === 'function') window.openModule('view-kirjani');
            else document.querySelector('[data-view="view-kirjani"]')?.click();
        });
        elements.form.addEventListener('submit', submitTask);
        elements.closeButton.addEventListener('click', closeDialog);
        elements.cancelButton.addEventListener('click', closeDialog);
        elements.deleteButton.addEventListener('click', deleteTask);
        elements.details.addEventListener('input', updateDetailsCount);
        elements.dialog.addEventListener('cancel', event => {
            if (state.saving) event.preventDefault();
            else closeDialog();
        });
        elements.dialog.addEventListener('click', event => {
            if (event.target === elements.dialog && !state.saving) closeDialog();
        });
        elements.filters.forEach(button => {
            button.addEventListener('click', () => setFilter(button.dataset.timelineFilter));
        });
        document.querySelectorAll('[data-view="view-aikajana"]').forEach(button => {
            button.addEventListener('click', () => window.setTimeout(() => render(), 0));
        });
        const viewObserver = new MutationObserver(() => {
            if (isVisible()) render();
        });
        viewObserver.observe(elements.view, { attributes: true, attributeFilter: ['class'] });
        const projectTitle = document.getElementById('sidebar-current-title');
        if (projectTitle) {
            const projectObserver = new MutationObserver(() => {
                if (isVisible()) render({ force: true });
            });
            projectObserver.observe(projectTitle, { childList: true, subtree: true, characterData: true });
        }
        window.addEventListener('storage', event => {
            if (!['skriptlab_manuscript', 'skriptlab_active_project_id'].includes(event.key)) return;
            if (event.key === 'skriptlab_manuscript' && event.newValue) {
                try {
                    const storedProject = JSON.parse(event.newValue);
                    const activeId = localStorage.getItem('skriptlab_active_project_id');
                    const storedAnalysis = storedProject?.analysis;
                    const hasTimeline = storedAnalysis && Object.prototype.hasOwnProperty.call(storedAnalysis, SCHEDULE_KEY);
                    if (
                        hasTimeline
                        && storedProject?.id
                        && String(window.manuscriptData?.id || '') === String(storedProject.id)
                        && (!activeId || String(storedProject.id) === String(activeId))
                    ) {
                        window.manuscriptData.analysis = {
                            ...(window.manuscriptData.analysis || {}),
                            [SCHEDULE_KEY]: storedAnalysis[SCHEDULE_KEY],
                        };
                    }
                } catch (error) {
                    // Ignore an incomplete cross-tab storage write and keep the current project intact.
                }
            }
            if (isVisible()) projectChanged();
        });
    }

    function initialize() {
        if (state.initialized || !cacheElements()) return;
        state.initialized = true;
        bindEvents();
        render({ force: true });
    }

    window.SkriptLabTimeline = {
        render,
        projectChanged,
        openTask: openTaskDialog,
        _test: {
            scheduleKey: SCHEDULE_KEY,
            defaultTasks: DEFAULT_TASKS.map((task, index) => defaultTask(task, index)),
            normalizeSchedule,
            scheduleSignature,
            scheduleRevision,
            truncateDetails,
            validateTaskDates,
            formatDate,
        },
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
    else initialize();
})();
