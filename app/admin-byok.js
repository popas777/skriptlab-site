(function () {
    'use strict';

    const panel = document.getElementById('admin-panel-byok');
    const auth = window.SkriptLabAuth;
    if (!panel || !auth?.getToken() || auth.getUser()?.role !== 'admin') return;

    const state = { config: null, profiles: [], groups: [], selectedId: null, dirty: false, busy: false, loaded: false };
    const get = id => panel.querySelector(`#byok-${id}`);
    const labels = { draft: 'Luonnos', active: 'Aktiivinen', suspended: 'Keskeytetty' };
    const scopeLabels = { text: 'teksti', image: 'kuva', audio: 'ääni', video: 'video', long_ai: 'pitkä tekstikäsittely', short_ai: 'lyhyt tekstikäsittely', translation_check: 'käännösten tarkistus' };
    const envPattern = /^SKRIPTLAB_BYOK_[A-Z0-9_]{2,100}_API_KEY$/;

    function message(text, error = false) {
        get('status-message').textContent = text;
        get('status-message').dataset.error = String(error);
    }

    function markDirty(value) {
        state.dirty = value;
        get('pending').textContent = value ? 'Tallentamattomia muutoksia' : '';
    }

    function mayDiscard() {
        return !state.dirty || window.confirm('Lomakkeessa on tallentamattomia muutoksia. Hylätäänkö ne?');
    }

    function setBusy(value) {
        state.busy = value;
        get('editor-fields').disabled = value || !state.config;
        get('save').disabled = value || !state.config;
        get('new').disabled = value || !state.config;
        get('profile').disabled = value || !state.config;
        get('refresh').disabled = value;
        panel.setAttribute('aria-busy', String(value));
    }

    async function api(path, options) {
        const response = await auth.fetch(`/api/admin/byok${path}`, options);
        const data = await response.json().catch(() => null);
        if (!response.ok) {
            const detail = typeof data?.detail === 'string' ? data.detail
                : typeof data?.detail?.message === 'string'
                    ? [data.detail.message, ...(data.detail.issues || []).filter(issue => typeof issue === 'string')].join(' ')
                    : '';
            throw new Error(detail || (response.status === 404 ? 'BYOK-palvelinpäivitys ei ole vielä käytettävissä.' : `Pyyntö epäonnistui (${response.status}).`));
        }
        return data;
    }

    function option(value, label) {
        const element = document.createElement('option');
        element.value = value;
        element.textContent = label;
        return element;
    }

    function profileOptions() {
        get('profile').replaceChildren(option('', 'Uusi asiakasprofiili'));
        state.profiles.forEach(profile => get('profile').append(option(profile.id, `${profile.customer_name} · ${labels[profile.status] || profile.status}`)));
        get('profile').value = state.selectedId ?? '';
    }

    function groupOptions(profile) {
        const assigned = new Set(state.profiles.filter(item => item.id !== profile?.id).map(item => Number(item.access_group_id)));
        get('group').replaceChildren(option('', 'Valitse asiakkaan käyttöoikeusryhmä'));
        state.groups.forEach(group => {
            const current = Number(profile?.access_group_id) === Number(group.id);
            if ((!group.is_active || group.system_key || assigned.has(Number(group.id))) && !current) return;
            get('group').append(option(group.id, `${group.name} · ${group.user_count || 0} käyttäjää${group.is_active ? '' : ' (pois käytöstä)'}`));
        });
        get('group').value = profile?.access_group_id ?? '';
        get('group').disabled = Boolean(profile);
    }

    function envField(refKey, label, refs, advanced = false) {
        const row = document.createElement('div');
        row.className = 'settings-row';
        const id = `byok-env-${refKey.replace(/[^a-z0-9_-]/gi, '-')}`;
        const title = document.createElement('label');
        title.htmlFor = id;
        title.textContent = label;
        const input = document.createElement('input');
        Object.assign(input, { id, type: 'text', className: 'byok-env-input', autocomplete: 'off', spellcheck: false, maxLength: 200, value: refs[refKey] || '', placeholder: `SKRIPTLAB_BYOK_ASIAKAS_${refKey.replace(':', '_').toUpperCase()}_API_KEY` });
        input.dataset.byokEnv = refKey;
        input.pattern = 'SKRIPTLAB_BYOK_[A-Z0-9_]{2,100}_API_KEY';
        input.title = 'Vain Render-muuttujan nimi, joka alkaa SKRIPTLAB_BYOK_ ja päättyy _API_KEY. Älä syötä API-avainta.';
        row.append(title, input);
        if (advanced) {
            const help = document.createElement('small');
            help.textContent = 'Valinnainen: korvaa tämän toiminnon osalta palveluntarjoajan yhteisen muuttujan.';
            row.append(help);
        }
        return row;
    }

    function renderRefs(profile) {
        const refs = profile?.provider_key_refs || {};
        get('provider-refs').replaceChildren();
        get('scoped-refs').replaceChildren();
        const seen = new Set();
        (state.config.providers || []).forEach(provider => {
            get('provider-refs').append(envField(provider.id, provider.label, refs));
            seen.add(provider.id);
            (provider.scopes || []).forEach(scope => {
                const key = `${provider.id}:${scope}`;
                get('scoped-refs').append(envField(key, `${provider.label} · ${scopeLabels[scope] || scope}`, refs, true));
                seen.add(key);
            });
        });
        Object.keys(refs).filter(key => !seen.has(key)).forEach(key => get('scoped-refs').append(envField(key, `${key} (tarkista tuki)`, refs, true)));
    }

    function renderModels(profile) {
        const selected = new Set(profile?.allowed_models || []);
        const models = [...(state.config.models || [])];
        selected.forEach(key => {
            if (!models.some(model => model.key === key)) models.push({ key, display_name: key, task_type: 'Ei mallirekisterissä' });
        });
        get('models').replaceChildren();
        models.forEach(model => {
            const label = document.createElement('label');
            label.className = 'byok-model-option';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.value = model.key;
            input.checked = selected.has(model.key);
            input.dataset.byokModel = '';
            const name = document.createElement('span');
            name.textContent = model.display_name || model.model_name || model.key;
            const meta = document.createElement('small');
            meta.textContent = `${scopeLabels[model.task_type] || model.task_type || ''} · ${model.key}`;
            name.append(meta);
            label.append(input, name);
            get('models').append(label);
        });
        if (!models.length) get('models').textContent = 'Tuettuja malleja ei ole mallirekisterissä. Lisää ne Tekoälymallit-välilehdellä.';
    }

    function readiness(profile) {
        get('readiness').hidden = !profile;
        if (!profile) return;
        get('readiness-title').textContent = profile.readiness?.ready ? 'Tallennetun profiilin asetukset ovat valmiit' : 'Tallennettu profiili vaatii tarkistuksia';
        const list = get('readiness-list');
        list.replaceChildren();
        (profile.readiness?.issues || []).forEach(issue => {
            const item = document.createElement('li');
            item.textContent = typeof issue === 'string' ? issue : issue.message || issue.code || 'Tarkista profiilin asetukset.';
            list.append(item);
        });
        (profile.readiness?.credentials || []).forEach(credential => {
            const item = document.createElement('li');
            item.textContent = `${credential.provider} · ${credential.env_ref || 'Muuttujaa ei valittu'} · ${credential.configured ? 'Muuttuja löytyy palvelimelta' : 'Muuttuja puuttuu palvelimelta'}`;
            list.append(item);
        });
    }

    async function loadAudit(id) {
        get('audit-list').replaceChildren();
        get('audit-status').textContent = id ? 'Ladataan tapahtumia…' : 'Tapahtumat näkyvät tallennetulle profiilille.';
        if (!id) return;
        try {
            const events = await api(`/profiles/${encodeURIComponent(id)}/audit`);
            if (String(state.selectedId) !== String(id)) return;
            (events || []).forEach(event => {
                const item = document.createElement('li');
                const date = event.created_at ? new Date(event.created_at).toLocaleString('fi-FI') : '';
                item.textContent = [date, event.action || event.event_type || 'Profiilin päivitys', event.actor_email || (event.actor_user_id ? `Käyttäjä ${event.actor_user_id}` : '')].filter(Boolean).join(' · ');
                get('audit-list').append(item);
            });
            get('audit-status').textContent = events?.length ? 'Tapahtumat sisältävät hallinnan metatietoja.' : 'Ei tallennettuja tapahtumia.';
        } catch (error) {
            if (String(state.selectedId) === String(id)) get('audit-status').textContent = error.message;
        }
    }

    function fill(profile) {
        state.selectedId = profile?.id ?? null;
        const defaults = state.config.defaults || {};
        profileOptions();
        groupOptions(profile);
        get('customer').value = profile?.customer_name || '';
        get('profile-status').value = profile?.status || 'draft';
        get('monthly-fee').value = ((profile?.monthly_fee_cents ?? defaults.monthly_fee_cents ?? 14900) / 100).toFixed(2);
        get('included-seats').value = profile?.included_seats ?? defaults.included_seats ?? 5;
        get('extra-fee').value = ((profile?.extra_seat_fee_cents ?? defaults.extra_seat_fee_cents ?? 1900) / 100).toFixed(2);
        get('notes').value = profile?.notes || '';
        get('profile-summary').textContent = profile ? `${profile.access_group_name || 'Käyttöoikeusryhmä'} · ${profile.user_count || 0} käyttäjää · ${labels[profile.status] || profile.status}` : 'Luo asiakkaalle oma käyttöoikeusryhmä Käyttöoikeudet-välilehdellä ennen profiilin tallennusta.';
        renderRefs(profile);
        renderModels(profile);
        readiness(profile);
        markDirty(false);
        loadAudit(state.selectedId);
    }

    async function load() {
        if (state.busy) return;
        setBusy(true);
        message('Ladataan BYOK-asetuksia…');
        try {
            const [config, profiles, groupsResponse] = await Promise.all([
                api('/config'), api('/profiles'), auth.fetch('/api/admin/access-groups')
            ]);
            if (!groupsResponse.ok) throw new Error('Käyttöoikeusryhmien lataus epäonnistui.');
            const groups = await groupsResponse.json();
            if (!Array.isArray(profiles) || !Array.isArray(groups) || !Array.isArray(config?.providers) || !Array.isArray(config?.models)) throw new Error('Palvelin palautti puutteelliset BYOK-asetukset.');
            Object.assign(state, { config, profiles, groups, loaded: true });
            get('global').textContent = config.enabled ? 'BYOK on sallittu palvelimen asetuksissa. Asiakaskohtainen tila ja mallit määräävät käytön.' : 'BYOK on pois käytöstä palvelimella. Profiileja voi valmistella, mutta aktivointi edellyttää Renderin BYOK-kytkintä.';
            get('global').classList.toggle('byok-warning', !config.enabled);
            fill(profiles.find(profile => String(profile.id) === String(state.selectedId)));
            message('BYOK-asetukset ladattu.');
        } catch (error) {
            message(error.message, true);
        } finally {
            setBusy(false);
        }
    }

    function payload() {
        const provider_key_refs = {};
        panel.querySelectorAll('[data-byok-env]').forEach(input => {
            const value = input.value.trim();
            if (!value) return;
            if (!envPattern.test(value)) throw new Error('Syötä vain SKRIPTLAB_BYOK_-alkuisia Render-muuttujien nimiä. Varsinaisia API-avaimia ei tallenneta tähän lomakkeeseen.');
            provider_key_refs[input.dataset.byokEnv] = value;
        });
        const customer_name = get('customer').value.trim();
        if (!customer_name || !get('group').value) throw new Error('Anna asiakkaan nimi ja valitse käyttöoikeusryhmä.');
        const fee = id => {
            const value = Number(get(id).value);
            if (get(id).value === '' || !Number.isFinite(value) || value < 0) throw new Error('Anna sopimusmaksut euroina, vähintään 0.');
            return Math.round(value * 100);
        };
        const included_seats = Number(get('included-seats').value);
        if (!Number.isInteger(included_seats) || included_seats < 1) throw new Error('Sisältyviä käyttäjiä on oltava vähintään yksi.');
        const allowed_models = [...panel.querySelectorAll('[data-byok-model]:checked')].map(input => input.value);
        if (get('profile-status').value === 'active' && !state.config.enabled) throw new Error('Ota BYOK ensin käyttöön Renderin backend-palvelun asetuksissa.');
        if (get('profile-status').value === 'active' && (!allowed_models.length || !Object.keys(provider_key_refs).length)) throw new Error('Valitse vähintään yksi malli ja sen avainmuuttuja ennen aktivointia.');
        return { access_group_id: Number(get('group').value), customer_name, status: get('profile-status').value, provider_key_refs, allowed_models, monthly_fee_cents: fee('monthly-fee'), included_seats, extra_seat_fee_cents: fee('extra-fee'), currency: 'EUR', notes: get('notes').value.trim() };
    }

    get('form').addEventListener('input', () => markDirty(true));
    get('form').addEventListener('change', () => markDirty(true));
    get('form').addEventListener('submit', async event => {
        event.preventDefault();
        if (state.busy || !state.config) return;
        let body;
        try { body = payload(); } catch (error) { message(error.message, true); return; }
        const id = state.selectedId;
        setBusy(true);
        message('Tallennetaan asiakasprofiilia…');
        try {
            const profile = await api(id ? `/profiles/${encodeURIComponent(id)}` : '/profiles', { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const index = state.profiles.findIndex(item => item.id === profile.id);
            if (index === -1) state.profiles.push(profile); else state.profiles[index] = profile;
            fill(profile);
            message('Asiakasprofiili tallennettu. Sopimustiedot eivät käynnistä automaattista laskutusta.');
        } catch (error) {
            message(error.message, true);
        } finally {
            setBusy(false);
        }
    });
    get('profile').addEventListener('change', () => {
        const value = get('profile').value;
        if (!mayDiscard()) { get('profile').value = state.selectedId ?? ''; return; }
        fill(state.profiles.find(profile => String(profile.id) === value));
        message('');
    });
    get('new').addEventListener('click', () => { if (mayDiscard()) { fill(); message(''); get('customer').focus(); } });
    get('refresh').addEventListener('click', () => { if (mayDiscard()) load(); });
    window.addEventListener('beforeunload', event => {
        if (state.dirty) { event.preventDefault(); event.returnValue = ''; }
    });
    const observer = new MutationObserver(() => {
        if (!panel.hidden && !state.loaded && !state.busy) load();
    });
    observer.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
    setBusy(false);
    if (!panel.hidden) load();
})();
