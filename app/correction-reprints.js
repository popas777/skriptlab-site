(function () {
    'use strict';

    const VIEW_ID = 'view-korjaukset';
    const POLL_INTERVAL_MS = 3000;
    const CASE_BUILDING_STATUSES = new Set(['building', 'retrying', 'processing', 'queued', 'generating', 'running']);
    const AUDIO_BUILDING_STATUSES = new Set([...CASE_BUILDING_STATUSES, 'pending']);
    const READY_AUDIO_STATUSES = new Set(['ready', 'completed', 'complete', 'done', 'succeeded']);
    const CLOSED_CASE_STATUSES = new Set(['ready', 'completed', 'complete', 'done', 'failed', 'error', 'cancelled', 'expired']);

    const state = {
        initialized: false,
        projectId: null,
        data: null,
        loading: false,
        loadPromise: null,
        loadError: '',
        action: '',
        requestSequence: 0,
        pollTimer: null,
        alert: null,
        lastThreadKey: '',
        replacementDrafts: new Map(),
        downloadSequence: 0,
        downloads: new Map()
    };

    const $ = id => document.getElementById(id);
    const asArray = value => Array.isArray(value) ? value : [];
    const textValue = value => value === null || value === undefined ? '' : String(value);

    function createElement(tagName, className, text) {
        const element = document.createElement(tagName);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = textValue(text);
        return element;
    }

    function clearElement(element) {
        if (element) element.replaceChildren();
    }

    function activeProjectId() {
        const id = window.manuscriptData?.id;
        return id === null || id === undefined || id === '' ? null : String(id);
    }

    function viewIsActive() {
        const view = $(VIEW_ID);
        return Boolean(view && !view.classList.contains('hidden'));
    }

    function endpoint(projectId, suffix = '') {
        return `/api/projects/${encodeURIComponent(projectId)}/correction-reprints${suffix}`;
    }

    function formatDate(value, includeTime = false) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const options = includeTime
            ? { dateStyle: 'medium', timeStyle: 'short' }
            : { dateStyle: 'medium' };
        return new Intl.DateTimeFormat('fi-FI', options).format(date);
    }

    function slugify(value, fallback = 'uusintapainos') {
        const slug = textValue(value)
            .toLocaleLowerCase('fi-FI')
            .replace(/[åä]/g, 'a')
            .replace(/ö/g, 'o')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        return slug || fallback;
    }

    function safeDownloadFilename(value, fallback) {
        const candidate = textValue(value)
            .replace(/\\/g, '/')
            .split('/')
            .pop()
            .replace(/[\u0000-\u001f\u007f]/g, '')
            .trim();
        return candidate || fallback;
    }

    function audioDownloadFilename(audio, suffix) {
        const mimeType = textValue(audio?.audio_mime_type).toLowerCase();
        const extension = mimeType.includes('wav')
            ? 'wav'
            : mimeType.includes('flac')
                ? 'flac'
                : mimeType.includes('ogg')
                    ? 'ogg'
                    : mimeType.includes('mp4') || mimeType.includes('m4a')
                        ? 'm4a'
                        : 'mp3';
        return safeDownloadFilename(audio?.audio_filename, resultFilename(suffix, extension));
    }

    function numberValue(value, fallback = 0) {
        if (value === null || value === undefined || value === '') return fallback;
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function responseErrorText(payload, fallback) {
        const detail = payload?.detail || payload?.error || payload?.message;
        if (typeof detail === 'string' && detail.trim()) return detail.trim();
        if (Array.isArray(detail)) {
            const joined = detail.map(item => item?.msg || item?.message || textValue(item)).filter(Boolean).join(' ');
            if (joined) return joined;
        }
        return fallback;
    }

    async function apiRequest(path, options = {}, fallbackMessage = 'Pyyntö epäonnistui.') {
        const requestOptions = { ...options };
        if (requestOptions.body && !(requestOptions.body instanceof FormData)) {
            requestOptions.headers = { 'Content-Type': 'application/json', ...(requestOptions.headers || {}) };
        }
        const response = await window.SkriptLabAuth.fetch(path, requestOptions);
        const contentType = response.headers.get('content-type') || '';
        let payload = null;
        if (contentType.includes('application/json')) {
            payload = await response.json().catch(() => null);
        } else {
            const responseText = await response.text().catch(() => '');
            payload = responseText ? { detail: responseText } : null;
        }
        if (!response.ok) {
            const error = new Error(responseErrorText(payload, fallbackMessage));
            error.status = response.status;
            throw error;
        }
        if (!payload || typeof payload !== 'object') {
            throw new Error(fallbackMessage);
        }
        return { payload, status: response.status };
    }

    function setAlert(message = '', tone = '') {
        state.alert = message ? { message: textValue(message), tone } : null;
        renderAlert();
    }

    function renderAlert() {
        const alert = $('correction-reprints-alert');
        if (!alert) return;
        alert.classList.toggle('hidden', !state.alert);
        alert.classList.toggle('is-error', state.alert?.tone === 'error');
        alert.classList.toggle('is-success', state.alert?.tone === 'success');
        alert.textContent = state.alert?.message || '';
    }

    function renderRefreshButton() {
        const button = $('correction-reprints-refresh');
        if (!button) return;
        button.disabled = Boolean(state.loading || state.action);
        button.textContent = state.loading ? 'Päivitetään…' : 'Päivitä';
    }

    function stopPolling() {
        if (state.pollTimer) window.clearTimeout(state.pollTimer);
        state.pollTimer = null;
    }

    function statusValue(value) {
        return textValue(value).trim().toLowerCase();
    }

    function isBuilding(data = state.data) {
        const correctionCase = data?.case;
        if (!correctionCase) return false;
        const caseStatus = statusValue(correctionCase.status);
        const audioStatus = statusValue(correctionCase.result_audio?.status);
        const packageReady = Boolean(assetDownloadUrl(correctionCase.result_package));
        const audioHasOutput = Boolean(correctionCase.result_audio?.audio_url || correctionCase.result_audio?.package_url);
        return CASE_BUILDING_STATUSES.has(caseStatus)
            || (AUDIO_BUILDING_STATUSES.has(audioStatus) && !(packageReady && audioHasOutput));
    }

    function caseIsEditable(correctionCase = state.data?.case) {
        if (!correctionCase) return false;
        const status = statusValue(correctionCase.status);
        return !CASE_BUILDING_STATUSES.has(status) && !CLOSED_CASE_STATUSES.has(status);
    }

    function schedulePolling() {
        stopPolling();
        if (!isBuilding() || !state.projectId || !viewIsActive()) return;
        const projectId = state.projectId;
        state.pollTimer = window.setTimeout(() => {
            state.pollTimer = null;
            if (!viewIsActive() || state.projectId !== projectId) return;
            void load({ force: true, silent: true });
        }, POLL_INTERVAL_MS);
    }

    function sourceFiles(sourcePackage = state.data?.source_package) {
        if (Array.isArray(sourcePackage?.files)) return sourcePackage.files;
        if (sourcePackage?.files && typeof sourcePackage.files === 'object') return Object.values(sourcePackage.files);
        return [];
    }

    function fileLabel(file, index = 0) {
        if (typeof file === 'string') return file.split('/').pop() || `Tiedosto ${index + 1}`;
        return textValue(file?.title || file?.filename || file?.name || file?.path || file?.format || `Tiedosto ${index + 1}`);
    }

    function changeCategory(change) {
        const mediaType = statusValue(change?.media_type);
        const targetType = statusValue(change?.target_type);
        if (mediaType === 'audio' || targetType.includes('audio')) return 'audio';
        if (mediaType === 'metadata' || targetType.includes('metadata') || targetType.includes('meta')) return 'metadata';
        return 'text';
    }

    function changeStatus(change) {
        const status = statusValue(change?.status || 'pending');
        return status === 'approved' || status === 'rejected' ? status : 'pending';
    }

    function caseSummary(correctionCase = state.data?.case) {
        const changes = asArray(correctionCase?.changes);
        const supplied = correctionCase?.summary || {};
        const byStatus = status => changes.filter(change => changeStatus(change) === status).length;
        const byCategory = category => changes.filter(change => changeCategory(change) === category).length;
        return {
            total: numberValue(supplied.total, changes.length),
            pending: numberValue(supplied.pending, byStatus('pending')),
            approved: numberValue(supplied.approved, byStatus('approved')),
            rejected: numberValue(supplied.rejected, byStatus('rejected')),
            text: numberValue(supplied.text, byCategory('text') + byCategory('metadata')),
            audio: numberValue(supplied.audio, byCategory('audio'))
        };
    }

    function editionLabel(correctionCase = state.data?.case) {
        const edition = textValue(correctionCase?.edition_number).trim();
        return [
            edition ? (/painos/i.test(edition) ? edition : `${edition}. painos`) : '',
            correctionCase?.publication_year || ''
        ].filter(Boolean).join(' · ');
    }

    function reconcileReplacementDrafts(data) {
        const currentIds = new Set(asArray(data?.case?.changes).map(change => String(change?.id)));
        state.replacementDrafts.forEach((_value, changeId) => {
            if (!currentIds.has(changeId)) state.replacementDrafts.delete(changeId);
        });
    }

    function statusLabel(status) {
        const normalized = statusValue(status || 'pending');
        if (normalized === 'approved') return 'Hyväksytty';
        if (normalized === 'rejected') return 'Hylätty';
        return 'Tarkistamatta';
    }

    function audioStatusLabel(audio) {
        if (!audio) return 'Audio ei sisälly lähteeseen';
        const status = statusValue(audio.status);
        if (READY_AUDIO_STATUSES.has(status)) return 'Audio valmis';
        if (AUDIO_BUILDING_STATUSES.has(status)) return 'Audio tuotannossa';
        if (status === 'failed' || status === 'error') return 'Audiossa virhe';
        return audio.status ? `Audio: ${audio.status}` : 'Audio saatavilla';
    }

    function registerDownload(url, filename) {
        if (!url) return '';
        const key = `correction-download-${++state.downloadSequence}`;
        state.downloads.set(key, { url: textValue(url), filename: textValue(filename || 'lataus') });
        return key;
    }

    function assetDownloadUrl(asset) {
        return textValue(asset?.download_url || asset?.data_url).trim();
    }

    function makeButton(label, className = 'btn btn-secondary') {
        const button = createElement('button', className, label);
        button.type = 'button';
        return button;
    }

    function makeDownloadButton(label, url, filename, primary = false) {
        const key = registerDownload(url, filename);
        if (!key) return null;
        const button = makeButton(label, `btn ${primary ? 'btn-primary' : 'btn-secondary'}`);
        button.dataset.downloadKey = key;
        return button;
    }

    function triggerBrowserDownload(url, filename) {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    function authenticatedDownloadPath(url) {
        if (url.startsWith('/')) return url;
        const apiBase = textValue(window.SKRIPTLAB_CONFIG?.API_BASE_URL).replace(/\/$/, '');
        if (apiBase && url.startsWith(`${apiBase}/`)) return url.slice(apiBase.length);
        return '';
    }

    async function downloadRegisteredAsset(key, button) {
        const target = state.downloads.get(key);
        if (!target) return;
        const originalText = button?.textContent || '';
        if (button) {
            button.disabled = true;
            button.textContent = 'Valmistellaan…';
        }
        try {
            const authenticatedPath = authenticatedDownloadPath(target.url);
            if (/^(data:|blob:)/i.test(target.url)) {
                triggerBrowserDownload(target.url, target.filename);
            } else if (authenticatedPath) {
                const response = await window.SkriptLabAuth.fetch(authenticatedPath);
                if (!response.ok) {
                    const payload = await response.json().catch(() => null);
                    throw new Error(responseErrorText(payload, 'Tiedoston lataus epäonnistui.'));
                }
                const blob = await response.blob();
                const objectUrl = URL.createObjectURL(blob);
                triggerBrowserDownload(objectUrl, target.filename);
                window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
            } else {
                triggerBrowserDownload(target.url, target.filename);
            }
            setAlert('Lataus käynnistyi.', 'success');
        } catch (error) {
            setAlert(error?.message || 'Tiedoston lataus epäonnistui.', 'error');
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = originalText;
            }
        }
    }

    function renderSource() {
        const band = document.querySelector('.correction-source-band');
        const title = $('correction-source-title');
        const detail = $('correction-source-detail');
        const meta = $('correction-source-meta');
        const actions = $('correction-source-actions');
        if (!band || !title || !detail || !meta || !actions) return;
        clearElement(meta);
        clearElement(actions);
        band.classList.remove('is-ready', 'is-blocked');

        if (!state.projectId) {
            band.classList.add('is-blocked');
            title.textContent = 'Valitse teos ennen korjauskierrosta';
            detail.textContent = 'Moduuli tarvitsee aktiivisen teoksen ja siitä aiemmin muodostetun valmiin tiedostopaketin.';
            return;
        }

        if (state.loading && !state.data) {
            title.textContent = 'Tarkistetaan julkaistua tiedostopakettia…';
            detail.textContent = 'Haetaan viimeisin valmis paketti ja mahdollinen audiotuotanto.';
            return;
        }

        if (state.loadError && !state.data) {
            band.classList.add('is-blocked');
            title.textContent = 'Lähdepaketin valmiutta ei voitu tarkistaa';
            detail.textContent = state.loadError;
            const retryButton = makeButton('Yritä uudelleen');
            retryButton.dataset.retryLoad = 'true';
            actions.appendChild(retryButton);
            return;
        }

        const sourcePackage = state.data?.source_package;
        if (!sourcePackage) {
            band.classList.add('is-blocked');
            title.textContent = 'Valmis tiedostopaketti puuttuu';
            detail.textContent = 'Korjaukset ja uusintapainokset tehdään julkaistusta paketista. Muodosta tiedostopaketti ensin.';
            const openButton = makeButton('Avaa Tiedostopaketti');
            openButton.dataset.openView = 'view-julkaisupaketti';
            actions.appendChild(openButton);
            return;
        }

        band.classList.add('is-ready');
        const version = numberValue(sourcePackage.source_version_number);
        const projectTitle = state.data?.title || window.manuscriptData?.title || sourcePackage.title || 'Valittu teos';
        title.textContent = `${projectTitle} · ${version ? `lähdeversio V${version}` : 'valmis lähdepaketti'}`;
        const created = formatDate(sourcePackage.created_at);
        detail.textContent = created
            ? `Paketti on muodostettu ${created}. Kaikki hyväksytyt muutokset kohdistetaan tähän lukittuun lähteeseen.`
            : 'Kaikki hyväksytyt muutokset kohdistetaan tähän lukittuun lähteeseen.';

        const chips = [
            version ? `V${version}` : 'Valmis paketti',
            `${sourceFiles(sourcePackage).length} tiedostoa`,
            audioStatusLabel(state.data?.source_audio)
        ];
        if (state.data?.can_edit === false) chips.push('Vain katselu');
        chips.forEach(label => meta.appendChild(createElement('span', 'correction-meta-chip', label)));

        const projectSlug = slugify(projectTitle, 'teos');
        const sourceDownload = makeDownloadButton(
            'Lataa lähdepaketti',
            assetDownloadUrl(sourcePackage),
            `${projectSlug}${version ? `-v${version}` : ''}-lahdepaketti.zip`
        );
        if (sourceDownload) actions.appendChild(sourceDownload);
    }

    function renderProgress() {
        const sourceReady = Boolean(state.data?.source_package);
        const correctionCase = state.data?.case;
        const messages = asArray(correctionCase?.messages);
        const changes = asArray(correctionCase?.changes);
        const summary = caseSummary(correctionCase);
        const requestReady = Boolean(correctionCase && (messages.length || changes.length));
        const approvalReady = Boolean(changes.length && summary.pending === 0);
        const editionReady = Boolean(assetDownloadUrl(correctionCase?.result_package) && !isBuilding() && !correctionCase?.error);
        const building = isBuilding();
        const steps = {
            source: { complete: sourceReady, active: !sourceReady },
            request: { complete: requestReady, active: sourceReady && !requestReady },
            approval: { complete: approvalReady, active: requestReady && !approvalReady && !building },
            edition: { complete: editionReady, active: building || (approvalReady && !editionReady) }
        };
        document.querySelectorAll('#correction-reprints-progress [data-step]').forEach(item => {
            const step = steps[item.dataset.step] || {};
            item.classList.toggle('is-complete', Boolean(step.complete));
            item.classList.toggle('is-active', Boolean(step.active));
            if (step.active) item.setAttribute('aria-current', 'step');
            else item.removeAttribute('aria-current');
        });
    }

    function createChatMessage(message) {
        const role = statusValue(message?.role) === 'user' ? 'user' : 'assistant';
        const bubble = createElement('div', `correction-chat-message${role === 'user' ? ' is-user' : ''}`);
        bubble.appendChild(createElement('span', 'correction-chat-role', role === 'user' ? 'Sinä' : 'SkriptLab'));
        bubble.appendChild(createElement('div', '', message?.content || ''));
        const time = formatDate(message?.created_at, true);
        if (time) bubble.appendChild(createElement('span', 'correction-chat-time', time));
        return bubble;
    }

    function createChatEmpty(sourceReady) {
        const empty = createElement('div', 'correction-chat-message is-empty');
        empty.appendChild(createElement('span', 'correction-chat-role', 'Näin aloitat'));
        empty.appendChild(createElement(
            'div',
            '',
            sourceReady
                ? 'Kuvaile muutos ja sen sijainti. Voit viitata painosnumeroon, painovuoteen, sivuun, lukuun, tekstikatkelmaan tai audion aikakohtaan.'
                : 'Kun valmis tiedostopaketti on saatavilla, voit kuvata muutoksen tähän keskusteluun.'
        ));
        return empty;
    }

    function renderChat() {
        const thread = $('correction-chat-thread');
        const input = $('correction-message-input');
        const submit = $('correction-message-submit');
        const chatState = $('correction-chat-state');
        const quickPrompts = $('correction-quick-prompts');
        if (!thread || !input || !submit || !chatState) return;

        const correctionCase = state.data?.case;
        const messages = asArray(correctionCase?.messages);
        const changes = asArray(correctionCase?.changes);
        const sourceReady = Boolean(state.data?.source_package);
        const readOnly = state.data?.can_edit === false;
        const building = isBuilding();
        const audioRetryRequired = statusValue(correctionCase?.status) === 'failed'
            && Boolean(correctionCase?.audio_retry_url);
        const busy = Boolean(state.loading || state.action);
        const locked = !state.projectId || !sourceReady || readOnly || building || audioRetryRequired || busy;
        input.disabled = locked;
        submit.disabled = locked || !input.value.trim();
        quickPrompts?.querySelectorAll('button').forEach(button => { button.disabled = locked; });

        if (!state.projectId) chatState.textContent = 'Ei teosta';
        else if (!sourceReady) chatState.textContent = 'Lähde puuttuu';
        else if (readOnly) chatState.textContent = 'Vain katselu';
        else if (building) chatState.textContent = 'Muodostetaan';
        else if (audioRetryRequired) chatState.textContent = 'Audio vaatii uudelleenajon';
        else if (changes.length) chatState.textContent = `${changes.length} löydetty`;
        else chatState.textContent = 'Valmis pyyntöön';

        clearElement(thread);
        if (messages.length) messages.forEach(message => thread.appendChild(createChatMessage(message)));
        else thread.appendChild(createChatEmpty(sourceReady));
        if (state.action === 'message') {
            const typing = createElement('div', 'correction-chat-message');
            typing.appendChild(createElement('span', 'correction-chat-role', 'SkriptLab etsii kohteita'));
            const dots = createElement('span', 'correction-loading-dots');
            dots.setAttribute('aria-label', 'Käsitellään');
            dots.append(createElement('span'), createElement('span'), createElement('span'));
            typing.appendChild(dots);
            thread.appendChild(typing);
        }

        const threadKey = `${state.projectId || ''}:${messages.map(message => message.id || message.created_at || message.content).join('|')}:${state.action === 'message'}`;
        if (threadKey !== state.lastThreadKey) {
            state.lastThreadKey = threadKey;
            window.requestAnimationFrame(() => { thread.scrollTop = thread.scrollHeight; });
        }
    }

    function summaryStat(value, label) {
        const stat = createElement('div', 'correction-summary-stat');
        stat.appendChild(createElement('strong', '', value));
        stat.appendChild(createElement('span', '', label));
        return stat;
    }

    function changeIcon(category) {
        const icon = createElement('span', `correction-change-icon${category === 'audio' ? ' is-audio' : ''}`);
        if (category === 'audio') {
            icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M9 18V5l10-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="16" cy="16" r="3"></circle></svg>';
        } else if (category === 'metadata') {
            icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 4h10l4 4v12H5z"></path><path d="M15 4v5h4M8 13h8M8 16h6"></path></svg>';
        } else {
            icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"></path></svg>';
        }
        return icon;
    }

    function categoryLabel(category, targetType) {
        const target = textValue(targetType).replace(/[_-]+/g, ' ').trim();
        if (category === 'audio') return target ? `Audio · ${target}` : 'Audio';
        if (category === 'metadata') return target ? `Metatieto · ${target}` : 'Metatieto';
        return target ? `Teksti · ${target}` : 'Teksti';
    }

    function comparisonBlock(label, value, after = false) {
        const block = createElement('div', `correction-comparison${after ? ' is-after' : ''}`);
        block.appendChild(createElement('span', 'correction-comparison-label', label));
        block.appendChild(createElement('div', 'correction-comparison-text', value || '—'));
        return block;
    }

    function confidenceLabel(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return '';
        const percent = Math.round(number <= 1 ? number * 100 : number);
        return `Osumavarmuus ${Math.max(0, Math.min(100, percent))} %`;
    }

    function createChangeCard(change) {
        const category = changeCategory(change);
        const status = changeStatus(change);
        const locked = state.loading || state.data?.can_edit === false || !caseIsEditable() || Boolean(state.data?.case?.result_package);
        const card = createElement('article', `correction-change-card is-${status}`);
        card.dataset.changeId = textValue(change?.id);
        if (state.action === `change:${change?.id}`) card.classList.add('is-busy');

        const head = createElement('header', 'correction-change-head');
        const identity = createElement('div', 'correction-change-identity');
        identity.appendChild(changeIcon(category));
        const titleWrap = createElement('div');
        titleWrap.appendChild(createElement('div', 'correction-change-title', change?.location_label || (category === 'audio' ? 'Audiokohta' : 'Julkaistu tiedosto')));
        titleWrap.appendChild(createElement('div', 'correction-change-kind', categoryLabel(category, change?.target_type)));
        identity.appendChild(titleWrap);
        head.appendChild(identity);
        head.appendChild(createElement('span', `correction-change-status is-${status}`, statusLabel(status)));
        card.appendChild(head);

        const body = createElement('div', 'correction-change-body');
        if (change?.context) body.appendChild(createElement('p', 'correction-change-context', change.context));
        const comparison = createElement('div', 'correction-before-after');
        comparison.appendChild(comparisonBlock(category === 'audio' ? 'Nykyinen lausuttava teksti' : 'Ennen', change?.original));
        comparison.appendChild(comparisonBlock(category === 'audio' ? 'Ehdotettu lausuttava teksti' : 'Jälkeen', change?.replacement, true));
        body.appendChild(comparison);

        const replacementWrap = createElement('div', 'correction-replacement-wrap');
        const replacementId = `correction-replacement-${change?.id}`;
        const replacementLabel = createElement('label', '', 'Muokkaa korvaavaa sisältöä');
        replacementLabel.htmlFor = replacementId;
        const replacement = createElement('textarea', 'correction-replacement-field');
        replacement.id = replacementId;
        replacement.rows = category === 'metadata' ? 2 : 3;
        replacement.maxLength = 20000;
        const draftKey = textValue(change?.id);
        replacement.value = state.replacementDrafts.has(draftKey)
            ? state.replacementDrafts.get(draftKey)
            : textValue(change?.replacement);
        replacement.disabled = locked || state.action === `change:${change?.id}`;
        replacementWrap.append(replacementLabel, replacement);
        body.appendChild(replacementWrap);

        const files = asArray(change?.affected_files);
        if (files.length) {
            const filesWrap = createElement('div', 'correction-change-files');
            files.forEach((file, index) => filesWrap.appendChild(createElement('span', 'correction-file-chip', fileLabel(file, index))));
            body.appendChild(filesWrap);
        }

        const footer = createElement('div', 'correction-change-footer');
        footer.appendChild(createElement('span', 'correction-confidence', confidenceLabel(change?.confidence) || 'Tarkista ehdotus ennen hyväksyntää'));
        const actions = createElement('div', 'correction-change-actions');
        const reject = makeButton('Hylkää', `btn btn-secondary correction-reject-button${status === 'rejected' ? ' is-selected' : ''}`);
        reject.dataset.changeAction = 'rejected';
        reject.setAttribute('aria-pressed', String(status === 'rejected'));
        reject.disabled = locked || Boolean(state.action);
        const approve = makeButton('Hyväksy', `btn btn-secondary correction-approve-button${status === 'approved' ? ' is-selected' : ''}`);
        approve.dataset.changeAction = 'approved';
        approve.setAttribute('aria-pressed', String(status === 'approved'));
        approve.disabled = locked || Boolean(state.action);
        actions.append(reject, approve);
        footer.appendChild(actions);
        body.appendChild(footer);
        card.appendChild(body);
        return card;
    }

    function emptyReviewState(title, description) {
        const empty = createElement('div', 'correction-empty-state');
        const content = createElement('div');
        content.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 19.5V5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2Z"></path><path d="M8 7h6M8 11h7"></path></svg>';
        content.appendChild(createElement('strong', '', title));
        content.appendChild(createElement('p', '', description));
        empty.appendChild(content);
        return empty;
    }

    function renderReview() {
        const count = $('correction-review-count');
        const summaryElement = $('correction-review-summary');
        const list = $('correction-changes-list');
        if (!count || !summaryElement || !list) return;
        const correctionCase = state.data?.case;
        const changes = asArray(correctionCase?.changes);
        const summary = caseSummary(correctionCase);
        count.textContent = `${changes.length} ${changes.length === 1 ? 'muutos' : 'muutosta'}`;
        clearElement(summaryElement);
        clearElement(list);

        if (changes.length) {
            [
                [summary.total, 'Yhteensä'],
                [summary.pending, 'Avoinna'],
                [summary.approved, 'Hyväksytty'],
                [summary.rejected, 'Hylätty'],
                [summary.text, 'Teksti / metadata'],
                [summary.audio, 'Audio']
            ].forEach(([value, label]) => summaryElement.appendChild(summaryStat(value, label)));
            changes.forEach(change => list.appendChild(createChangeCard(change)));
            return;
        }

        if (!state.projectId) {
            list.appendChild(emptyReviewState('Valitse ensin teos', 'Löydetyt tekstin, metatiedon ja audion muutokset tulevat tähän hyväksyttäviksi.'));
        } else if (state.loadError && !state.data) {
            list.appendChild(emptyReviewState('Tietoja ei voitu ladata', 'Yritä päivittää näkymä. Aiempi sisältö säilyy palvelimella muuttumattomana.'));
        } else if (!state.data?.source_package) {
            list.appendChild(emptyReviewState('Valmis lähdepaketti tarvitaan', 'Moduuli ei etsi kohteita keskeneräisistä työversioista.'));
        } else if (state.action === 'message') {
            list.appendChild(emptyReviewState('Etsitään muutettavia kohtia', 'SkriptLab käy läpi lähdepaketin tiedostot ja mahdollisen audion.'));
        } else if (correctionCase) {
            list.appendChild(emptyReviewState('Muutettavia kohtia ei löytynyt', 'Tarkenna keskustelussa sijaintia, alkuperäistä sisältöä tai haluttua korvausta.'));
        } else {
            list.appendChild(emptyReviewState('Ei vielä korjauspyyntöä', 'Kuvaile muutos keskustelussa. Sama semanttinen muutos yhdistetään kaikkien siihen liittyvien tiedostojen yli.'));
        }
    }

    function buildProgressPercent(correctionCase) {
        const candidates = [
            correctionCase?.result_audio?.progress_percent,
            correctionCase?.progress_percent,
            correctionCase?.progress
        ];
        const found = candidates.map(Number).find(Number.isFinite);
        return found === undefined ? null : Math.max(0, Math.min(100, Math.round(found)));
    }

    function renderBuild() {
        const panel = $('correction-build-panel');
        const detail = $('correction-build-detail');
        const progress = $('correction-build-progress');
        const button = $('correction-build-button');
        if (!panel || !detail || !progress || !button) return;
        const correctionCase = state.data?.case;
        const changes = asArray(correctionCase?.changes);
        const summary = caseSummary(correctionCase);
        const sourceReady = Boolean(state.data?.source_package);
        const building = isBuilding();
        const resultReady = Boolean(assetDownloadUrl(correctionCase?.result_package) && !building);
        const canBuild = Boolean(
            state.projectId
            && sourceReady
            && state.data?.can_edit !== false
            && correctionCase?.id
            && caseIsEditable(correctionCase)
            && changes.length
            && summary.pending === 0
            && summary.approved > 0
            && state.replacementDrafts.size === 0
            && !state.loading
            && !building
            && !resultReady
            && !state.action
        );

        panel.classList.toggle('is-ready', canBuild);
        panel.classList.toggle('is-building', building || state.action === 'build');
        button.disabled = !canBuild;
        progress.classList.toggle('hidden', !(building || state.action === 'build'));
        clearElement(progress);

        if (!state.projectId) {
            detail.textContent = 'Valitse teos ja valmis tiedostopaketti aloittaaksesi.';
            button.textContent = 'Hyväksy muutokset ja muodosta uusi painos';
        } else if (state.loadError && !state.data) {
            detail.textContent = 'Lähtötietoja ei voitu ladata. Päivitä näkymä ja yritä uudelleen.';
            button.textContent = 'Hyväksy muutokset ja muodosta uusi painos';
        } else if (!sourceReady) {
            detail.textContent = 'Muodosta ensin valmis tiedostopaketti.';
            button.textContent = 'Hyväksy muutokset ja muodosta uusi painos';
        } else if (state.data?.can_edit === false) {
            detail.textContent = 'Sinulla on tähän teokseen vain katseluoikeus.';
            button.textContent = 'Hyväksy muutokset ja muodosta uusi painos';
        } else if (correctionCase?.error) {
            detail.textContent = correctionCase.error;
            button.textContent = 'Muodostus epäonnistui';
        } else if (building || state.action === 'build') {
            const percent = buildProgressPercent(correctionCase);
            detail.textContent = 'Uutta tiedostopakettia ja tarvittavia audio-osia muodostetaan. Voit jättää näkymän auki.';
            button.textContent = 'Uutta painosta muodostetaan…';
            progress.appendChild(createElement('span', '', 'Muodostus käynnissä'));
            progress.appendChild(createElement('strong', '', percent === null ? 'Työstetään' : `${percent} %`));
            const track = createElement('div', 'correction-progress-track');
            const fill = createElement('div', `correction-progress-fill${percent === null ? ' is-indeterminate' : ''}`);
            fill.style.width = `${percent ?? 38}%`;
            track.appendChild(fill);
            progress.appendChild(track);
        } else if (resultReady) {
            detail.textContent = 'Hyväksytyt muutokset on muodostettu uudeksi, ladattavaksi painokseksi.';
            button.textContent = 'Uusi painos muodostettu';
        } else if (!changes.length) {
            detail.textContent = 'Lähetä korjauspyyntö ja tarkista löydetyt kohdat ennen muodostamista.';
            button.textContent = 'Hyväksy muutokset ja muodosta uusi painos';
        } else if (state.replacementDrafts.size > 0) {
            detail.textContent = 'Yhdessä tai useammassa kortissa on tallentamaton korvaava sisältö. Vahvista muutos kortin Hyväksy- tai Hylkää-painikkeella.';
            button.textContent = 'Hyväksy muutokset ja muodosta uusi painos';
        } else if (summary.pending > 0) {
            detail.textContent = `${summary.pending} ${summary.pending === 1 ? 'muutos odottaa' : 'muutosta odottaa'} hyväksyntää tai hylkäystä.`;
            button.textContent = 'Hyväksy muutokset ja muodosta uusi painos';
        } else if (summary.approved === 0) {
            detail.textContent = 'Vähintään yksi muutos täytyy hyväksyä uuden painoksen muodostamiseksi.';
            button.textContent = 'Hyväksy muutokset ja muodosta uusi painos';
        } else {
            const edition = editionLabel(correctionCase);
            detail.textContent = `${edition ? `${edition}. ` : ''}${summary.approved} hyväksyttyä ja ${summary.rejected} hylättyä muutosta. Lähdepaketti säilyy muuttumattomana.`;
            button.textContent = 'Hyväksy muutokset ja muodosta uusi painos';
        }
    }

    function resultCheckIcon() {
        const mark = createElement('span', 'correction-result-mark');
        mark.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
        return mark;
    }

    function resultFilename(suffix, extension) {
        const title = state.data?.title || window.manuscriptData?.title || 'teos';
        return `${slugify(title, 'teos')}-${suffix}.${extension}`;
    }

    function renderResult() {
        const panel = $('correction-result-panel');
        const content = $('correction-result-content');
        if (!panel || !content) return;
        clearElement(content);
        const correctionCase = state.data?.case;
        const resultPackage = correctionCase?.result_package;
        const resultAudio = correctionCase?.result_audio;
        const report = correctionCase?.report;
        const resultError = textValue(correctionCase?.error).trim();
        if (!resultPackage && !resultAudio?.audio_url && !resultAudio?.package_url && !assetDownloadUrl(report)) {
            panel.classList.add('hidden');
            return;
        }
        panel.classList.remove('hidden');
        const shell = createElement('div', 'correction-result-shell');
        const resultMark = resultCheckIcon();
        resultMark.classList.toggle('is-warning', Boolean(resultError));
        shell.appendChild(resultMark);
        const copy = createElement('div', 'correction-result-copy');
        copy.appendChild(createElement(
            'p',
            'correction-section-label',
            resultError ? 'Tiedostopaketti valmis · audio vaatii huomiota' : (isBuilding() ? 'Tuloksia valmistuu' : 'Uusintapainos valmis')
        ));
        const title = createElement('h3', '', resultPackage?.title || 'Uusi tiedostoversio');
        title.id = 'correction-result-title';
        copy.appendChild(title);
        const sourceVersion = numberValue(correctionCase?.source_version_number);
        const resultDate = formatDate(resultPackage?.created_at || correctionCase?.created_at);
        const detailParts = [editionLabel(correctionCase), sourceVersion ? `Lähde V${sourceVersion}` : '', resultDate, audioStatusLabel(resultAudio)].filter(Boolean);
        copy.appendChild(createElement('p', '', [detailParts.join(' · '), resultError].filter(Boolean).join(' · ')));
        shell.appendChild(copy);

        const actions = createElement('div', 'correction-result-actions');
        const packageButton = makeDownloadButton('Lataa uusi tiedostopaketti', assetDownloadUrl(resultPackage), resultFilename('uusintapainos', 'zip'), true);
        const audioButton = makeDownloadButton('Lataa uusi audio', resultAudio?.audio_url, audioDownloadFilename(resultAudio, 'uusintapainos-audio'));
        const audioPackageButton = makeDownloadButton(
            'Lataa audiopaketti',
            resultAudio?.package_url,
            safeDownloadFilename(resultAudio?.package_filename, resultFilename('uusintapainos-audio', 'zip'))
        );
        const reportButton = makeDownloadButton('Lataa muutosraportti', assetDownloadUrl(report), resultFilename('muutosraportti', 'txt'));
        [packageButton, audioButton, audioPackageButton, reportButton].filter(Boolean).forEach(button => actions.appendChild(button));
        if (correctionCase?.audio_retry_url && state.data?.can_edit !== false) {
            const retryAudioButton = makeButton('Yritä audioajoa uudelleen', 'btn btn-secondary');
            retryAudioButton.dataset.retryAudio = 'true';
            retryAudioButton.disabled = Boolean(state.loading || state.action);
            actions.appendChild(retryAudioButton);
        }
        shell.appendChild(actions);
        content.appendChild(shell);
    }

    function historyEntryData(entry) {
        const value = entry?.case && typeof entry.case === 'object' ? entry.case : entry || {};
        const resultPackage = value.result_package || value.package || (assetDownloadUrl(value) ? value : null);
        return {
            value,
            resultPackage,
            resultAudio: value.result_audio || value.audio || null,
            report: value.report || null
        };
    }

    function renderHistory() {
        const panel = $('correction-history-panel');
        const list = $('correction-history-list');
        if (!panel || !list) return;
        clearElement(list);
        const currentCaseId = state.data?.case?.id;
        const history = asArray(state.data?.history).filter(entry => {
            const entryId = entry?.case?.id ?? entry?.id;
            return currentCaseId === null || currentCaseId === undefined || String(entryId) !== String(currentCaseId);
        });
        if (!history.length) {
            panel.classList.add('hidden');
            return;
        }
        panel.classList.remove('hidden');
        history.forEach((entry, index) => {
            const { value, resultPackage, resultAudio, report } = historyEntryData(entry);
            const row = createElement('article', 'correction-history-row');
            const copy = createElement('div');
            const editionLabel = value?.edition_number ? `${value.edition_number}. painos` : '';
            const yearLabel = value?.publication_year ? textValue(value.publication_year) : '';
            copy.appendChild(createElement(
                'strong',
                '',
                resultPackage?.title || value?.title || [editionLabel, yearLabel].filter(Boolean).join(' · ') || `Uusintapainos ${history.length - index}`
            ));
            const date = formatDate(resultPackage?.created_at || value?.created_at);
            const sourceVersion = numberValue(value?.source_version_number || value?.source_package_version);
            const historyStatus = statusValue(value?.status);
            const historyStatusLabel = historyStatus === 'ready'
                ? 'Valmis'
                : historyStatus === 'building'
                    ? 'Muodostetaan'
                    : historyStatus === 'failed'
                        ? 'Virhe'
                        : 'Tarkistuksessa';
            copy.appendChild(createElement('small', '', [historyStatusLabel, sourceVersion ? `Lähde V${sourceVersion}` : '', date].filter(Boolean).join(' · ')));
            row.appendChild(copy);
            const actions = createElement('div', 'correction-history-actions');
            const packageButton = makeDownloadButton('Paketti', assetDownloadUrl(resultPackage), resultFilename(`uusintapainos-${index + 1}`, 'zip'));
            const audioButton = makeDownloadButton(
                'Audio',
                resultAudio?.audio_url || resultAudio?.package_url,
                resultAudio?.audio_url
                    ? audioDownloadFilename(resultAudio, `uusintapainos-audio-${index + 1}`)
                    : safeDownloadFilename(
                        resultAudio?.package_filename,
                        resultFilename(`uusintapainos-audio-${index + 1}`, 'zip')
                    )
            );
            const reportButton = makeDownloadButton('Raportti', assetDownloadUrl(report), resultFilename(`muutosraportti-${index + 1}`, 'txt'));
            [packageButton, audioButton, reportButton].filter(Boolean).forEach(button => actions.appendChild(button));
            row.appendChild(actions);
            list.appendChild(row);
        });
    }

    function renderSubtitle() {
        const subtitle = $('correction-reprints-subtitle');
        if (!subtitle) return;
        const title = state.data?.title || window.manuscriptData?.title;
        subtitle.textContent = title
            ? `${title} · Kuvaile muutokset, hyväksy löydetyt kohdat ja muodosta uusi ladattava painos.`
            : 'Valitse valmis tiedostopaketti, kuvaile muutokset ja hyväksy uusi painos hallitusti.';
    }

    function renderAll() {
        if (!state.initialized) return;
        state.downloads.clear();
        state.downloadSequence = 0;
        renderAlert();
        renderRefreshButton();
        renderSubtitle();
        renderSource();
        renderProgress();
        renderChat();
        renderReview();
        renderBuild();
        renderResult();
        renderHistory();
    }

    async function load(options = {}) {
        initialize();
        if (state.action) return state.data;
        const projectId = activeProjectId();
        if (!projectId) {
            stopPolling();
            state.requestSequence += 1;
            state.projectId = null;
            state.data = null;
            state.loading = false;
            state.loadPromise = null;
            state.action = '';
            state.lastThreadKey = '';
            state.replacementDrafts.clear();
            state.loadError = '';
            setAlert('Valitse teos, jonka julkaistua pakettia haluat korjata.');
            renderAll();
            return null;
        }
        if (state.loading && state.projectId === projectId && !options.force) return state.loadPromise;

        stopPolling();
        const projectChanged = state.projectId !== projectId;
        state.projectId = projectId;
        if (projectChanged) {
            state.data = null;
            state.replacementDrafts.clear();
            state.lastThreadKey = '';
        }
        state.loading = true;
        const sequence = ++state.requestSequence;
        if (!options.silent) {
            state.alert = null;
            state.loadError = '';
        }
        renderAll();

        state.loadPromise = (async () => {
            try {
                const { payload } = await apiRequest(
                    endpoint(projectId, '/readiness'),
                    {},
                    'Korjausten lähtötietoja ei saatu ladattua.'
                );
                if (sequence !== state.requestSequence || state.projectId !== projectId) return null;
                state.data = payload;
                reconcileReplacementDrafts(payload);
                state.loading = false;
                state.loadError = '';
                state.action = '';
                state.alert = payload?.case?.error ? { message: payload.case.error, tone: 'error' } : null;
                renderAll();
                schedulePolling();
                return payload;
            } catch (error) {
                if (sequence !== state.requestSequence || state.projectId !== projectId) return null;
                state.loading = false;
                state.loadError = error?.message || 'Korjausten lähtötietoja ei saatu ladattua.';
                state.action = '';
                state.alert = { message: state.loadError, tone: 'error' };
                renderAll();
                return null;
            } finally {
                if (sequence === state.requestSequence) state.loadPromise = null;
            }
        })();
        return state.loadPromise;
    }

    async function sendMessage() {
        const input = $('correction-message-input');
        const message = input?.value.trim();
        if (!message || !state.projectId || !state.data?.source_package || state.data?.can_edit === false || state.loading || state.action) return;
        const projectId = state.projectId;
        const sequence = ++state.requestSequence;
        state.action = 'message';
        state.alert = null;
        renderAll();
        try {
            const { payload } = await apiRequest(
                endpoint(projectId, '/messages'),
                { method: 'POST', body: JSON.stringify({ message }) },
                'Korjauspyyntöä ei saatu käsiteltyä.'
            );
            if (sequence !== state.requestSequence || state.projectId !== projectId) return;
            state.data = payload;
            state.action = '';
            state.replacementDrafts.clear();
            if (input) input.value = '';
            state.alert = { message: 'Muutospyyntö käsiteltiin. Tarkista löydetyt kohdat.', tone: 'success' };
            renderAll();
            schedulePolling();
        } catch (error) {
            if (sequence !== state.requestSequence || state.projectId !== projectId) return;
            state.action = '';
            state.alert = { message: error?.message || 'Korjauspyyntöä ei saatu käsiteltyä.', tone: 'error' };
            renderAll();
        }
    }

    async function updateChange(card, status) {
        const caseId = state.data?.case?.id;
        const changeId = card?.dataset.changeId;
        const replacementField = card?.querySelector('.correction-replacement-field');
        if (!caseId || !changeId || state.data?.can_edit === false || !caseIsEditable() || state.loading || state.action) return;
        const replacement = replacementField ? replacementField.value : '';
        if (status === 'approved' && !replacement.trim()) {
            setAlert('Korvaava sisältö ei voi olla tyhjä.', 'error');
            replacementField?.focus();
            return;
        }
        state.replacementDrafts.set(String(changeId), replacement);
        const localChange = asArray(state.data?.case?.changes).find(change => String(change?.id) === String(changeId));
        if (localChange && status === 'approved') localChange.replacement = replacement;
        const projectId = state.projectId;
        const sequence = ++state.requestSequence;
        state.action = `change:${changeId}`;
        state.alert = null;
        renderAll();
        try {
            const requestBody = { status };
            if (status === 'approved') requestBody.replacement = replacement;
            const { payload } = await apiRequest(
                endpoint(projectId, `/${encodeURIComponent(caseId)}/changes/${encodeURIComponent(changeId)}`),
                { method: 'PATCH', body: JSON.stringify(requestBody) },
                'Muutoksen tilaa ei saatu tallennettua.'
            );
            if (sequence !== state.requestSequence || state.projectId !== projectId) return;
            state.data = payload;
            state.action = '';
            state.replacementDrafts.delete(String(changeId));
            state.alert = { message: status === 'approved' ? 'Muutos hyväksyttiin.' : 'Muutos hylättiin.', tone: 'success' };
            renderAll();
        } catch (error) {
            if (sequence !== state.requestSequence || state.projectId !== projectId) return;
            state.action = '';
            state.alert = { message: error?.message || 'Muutoksen tilaa ei saatu tallennettua.', tone: 'error' };
            renderAll();
        }
    }

    async function buildEdition() {
        const correctionCase = state.data?.case;
        if (!state.projectId || !correctionCase?.id || !caseIsEditable(correctionCase) || state.loading || state.action || isBuilding()) return;
        const summary = caseSummary(correctionCase);
        if (summary.pending > 0 || summary.approved < 1) return;
        const projectId = state.projectId;
        const sequence = ++state.requestSequence;
        state.action = 'build';
        state.alert = null;
        renderAll();
        try {
            const { payload } = await apiRequest(
                endpoint(projectId, `/${encodeURIComponent(correctionCase.id)}/build`),
                { method: 'POST' },
                'Uutta painosta ei saatu käynnistettyä.'
            );
            if (sequence !== state.requestSequence || state.projectId !== projectId) return;
            state.data = payload;
            state.action = '';
            state.alert = {
                message: isBuilding(payload)
                    ? 'Uuden painoksen muodostus käynnistyi.'
                    : 'Uusi painos muodostettiin.',
                tone: 'success'
            };
            renderAll();
            schedulePolling();
        } catch (error) {
            if (sequence !== state.requestSequence || state.projectId !== projectId) return;
            state.action = '';
            state.alert = { message: error?.message || 'Uutta painosta ei saatu käynnistettyä.', tone: 'error' };
            renderAll();
        }
    }

    async function retryAudio() {
        const retryUrl = textValue(state.data?.case?.audio_retry_url).trim();
        if (!retryUrl || !state.projectId || state.data?.can_edit === false || state.loading || state.action) return;
        const projectId = state.projectId;
        const sequence = ++state.requestSequence;
        state.action = 'retry-audio';
        state.alert = null;
        renderAll();
        try {
            const { payload } = await apiRequest(
                retryUrl,
                { method: 'POST' },
                'Audioajoa ei saatu käynnistettyä uudelleen.'
            );
            if (sequence !== state.requestSequence || state.projectId !== projectId) return;
            state.data = payload;
            state.action = '';
            state.alert = { message: 'Audioajo käynnistettiin uudelleen.', tone: 'success' };
            renderAll();
            schedulePolling();
        } catch (error) {
            if (sequence !== state.requestSequence || state.projectId !== projectId) return;
            state.action = '';
            state.alert = { message: error?.message || 'Audioajoa ei saatu käynnistettyä uudelleen.', tone: 'error' };
            renderAll();
        }
    }

    function handleRootClick(event) {
        const promptButton = event.target.closest('[data-correction-prompt]');
        if (promptButton) {
            const input = $('correction-message-input');
            if (!input || input.disabled) return;
            input.value = promptButton.dataset.correctionPrompt || '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
            return;
        }

        const downloadButton = event.target.closest('[data-download-key]');
        if (downloadButton) {
            void downloadRegisteredAsset(downloadButton.dataset.downloadKey, downloadButton);
            return;
        }

        const openViewButton = event.target.closest('[data-open-view]');
        if (openViewButton) {
            window.openModule?.(openViewButton.dataset.openView);
            return;
        }

        const retryButton = event.target.closest('[data-retry-load]');
        if (retryButton) {
            void load({ force: true });
            return;
        }

        const retryAudioButton = event.target.closest('[data-retry-audio]');
        if (retryAudioButton) {
            void retryAudio();
            return;
        }

        const changeButton = event.target.closest('[data-change-action]');
        if (changeButton) {
            const card = changeButton.closest('[data-change-id]');
            void updateChange(card, changeButton.dataset.changeAction);
        }
    }

    function initialize() {
        if (state.initialized) return;
        const view = $(VIEW_ID);
        if (!view) return;
        state.initialized = true;
        view.addEventListener('click', handleRootClick);
        $('correction-reprints-refresh')?.addEventListener('click', () => void load({ force: true }));
        $('correction-message-form')?.addEventListener('submit', event => {
            event.preventDefault();
            void sendMessage();
        });
        $('correction-message-input')?.addEventListener('input', event => {
            const submit = $('correction-message-submit');
            if (submit) submit.disabled = event.target.disabled || !event.target.value.trim() || Boolean(state.action);
        });
        $('correction-message-input')?.addEventListener('keydown', event => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void sendMessage();
            }
        });
        view.addEventListener('input', event => {
            if (!event.target.matches('.correction-replacement-field')) return;
            const card = event.target.closest('[data-change-id]');
            if (!card?.dataset.changeId) return;
            const changeId = String(card.dataset.changeId);
            const savedChange = asArray(state.data?.case?.changes).find(change => String(change?.id) === changeId);
            if (event.target.value === textValue(savedChange?.replacement)) state.replacementDrafts.delete(changeId);
            else state.replacementDrafts.set(changeId, event.target.value);
            renderBuild();
        });
        $('correction-build-button')?.addEventListener('click', () => void buildEdition());
    }

    function projectChanged() {
        initialize();
        const nextProjectId = activeProjectId();
        if (state.projectId === nextProjectId) {
            renderAll();
            if (viewIsActive() && !state.loading && !state.action) void load({ force: true });
            return;
        }
        stopPolling();
        state.requestSequence += 1;
        state.projectId = nextProjectId;
        state.data = null;
        state.loading = false;
        state.loadPromise = null;
        state.loadError = '';
        state.action = '';
        state.alert = null;
        state.lastThreadKey = '';
        state.replacementDrafts.clear();
        renderAll();
        if (viewIsActive()) void load({ force: true });
    }

    window.SkriptLabCorrectionReprints = Object.freeze({
        load,
        projectChanged
    });
})();
