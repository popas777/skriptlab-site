(function () {
    'use strict';
    const drafts = new Map();
    const $ = id => document.getElementById(id);
    const active = new Set(['queued', 'running', 'assembling']);
    let currentId = '', pollTimer = null;
    const example = '# Ensimmäinen kohtaus\nKERTOJA: Ilta laskeutuu puutarhaan.\nANNA [hiljaa]: Kuulitko tuon?\nELIAS: Se oli vain tuuli.\nANNA: Ehkä. Mutta portti oli äsken kiinni.\n[TAUKO 800]\n[Anna kääntyy katsomaan porttia.]';
    const names = script => [...new Map(script.split('\n').map(line => line.match(/^\s*([^#:\[\]]{1,120}?)(?:\s*\[[^\[\]]+\])?\s*:\s*\S/)).filter(Boolean).map(match => [match[1].trim().toLocaleLowerCase('fi'), match[1].trim()])).values()];
    const draft = () => drafts.get(currentId);
    const visible = () => !$('audio-plays-panel')?.classList.contains('hidden') && !$('view-audio')?.classList.contains('hidden');
    const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
    const isCurrent = d => d === draft();
    function message(d, text, error = false) { d.message = text; d.error = error; if (isCurrent(d)) { $('play-status').textContent = text; $('play-status').classList.toggle('is-error', error); } }
    function dirty(d) { d.dirty = true; d.edit += 1; d.estimate = ''; message(d, 'Luonnoksessa on tallentamattomia muutoksia.'); if (isCurrent(d)) $('play-estimate-result').textContent = 'Asetukset muuttuivat. Laske tuotantoarvio uudelleen.'; }
    async function request(path, body, method = 'POST') {
        const response = await window.SkriptLabAuth.fetch(path, body === undefined ? {} : {method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
        const data = await response.json().catch(() => null);
        if (!response.ok) {
            const error = new Error(typeof data?.detail === 'string' ? data.detail : Array.isArray(data?.detail) ? data.detail.map(item => item.msg).join(' ') : 'Pyyntö epäonnistui. Päivitä tila ja yritä uudelleen.');
            error.status = response.status; throw error;
        }
        return data;
    }
    function syncCast(d) {
        const byName = new Map(d.cast.map(character => [character.name.toLocaleLowerCase('fi'), character]));
        d.cast = names(d.script).map(name => byName.get(name.toLocaleLowerCase('fi')) || {name, voice_id:'', style:'', tags:''});
    }
    function scenes(script) {
        const result = []; let name = 'Kohtaus 1', lines = [];
        const flush = () => { if (names(lines.join('\n')).length) result.push({name, script:lines.join('\n')}); };
        for (const line of script.split('\n')) {
            if (/^\s*#/.test(line)) { flush(); name = line.replace(/^\s*#+\s*/, '') || 'Kohtaus'; lines = [line]; }
            else lines.push(line);
        }
        flush(); return result;
    }
    function model(d) { return d.options?.models?.find(item => `${item.provider}:${item.model_id}` === d.model); }
    function roleVoices(d) { return (d.options?.voices || []).filter(item => item.provider === model(d)?.provider); }
    function controls(d) {
        const locked = !d || !d.loaded || !d.canEdit || !!d.busy;
        for (const id of ['play-save','play-script','play-model','play-sync-cast','play-import','play-import-manuscript','play-example','play-estimate','play-test-scene','play-produce']) $(id).disabled = locked;
        $('play-reload').disabled = !d || !!d.busy || d.loading;
        if (d) {
            $('play-example').disabled = locked || !!d.script.trim();
            $('play-import-manuscript').disabled = locked || !!d.script.trim();
            for (const input of $('play-cast').querySelectorAll('input, textarea, select, button')) input.disabled = locked;
            for (const id of ['play-estimate','play-test-scene','play-produce']) $(id).disabled = locked || !d.script.trim() || !model(d) || model(d)?.configured === false;
        }
    }
    function renderCast(d) {
        const container = $('play-cast'); container.replaceChildren();
        const voices = roleVoices(d);
        d.cast.forEach((character, i) => {
            const card = el('div', undefined, 'play-character'); card.append(el('strong', character.name));
            const add = (labelText, field, tag, choices) => {
                const id = `play-role-${i}-${field}`;
                const label = el('label', labelText); label.htmlFor = id;
                const input = el(tag); input.id = id;
                if (tag === 'select') {
                    input.append(new Option('Valitse ääni', ''));
                    for (const voice of choices) input.append(new Option(voice.name || voice.voice_id, voice.voice_id));
                    if (character[field] && !choices.some(voice => voice.voice_id === character[field])) input.append(new Option(`${character[field]} · tallennettu ääni`, character[field]));
                } else { input.maxLength = field === 'style' ? 2000 : 200; if (tag === 'textarea') input.rows = 2; }
                input.value = character[field] || '';
                input.addEventListener(tag === 'select' ? 'change' : 'input', () => { character[field] = input.value; dirty(d); });
                card.append(label, input);
            };
            add('Hahmon ääni', 'voice_id', 'select', voices);
            if (model(d)?.provider === 'elevenlabs') {
                add('Esitystagi, esim. [calm] tai [whispering]', 'tags', 'input');
            } else add('Hahmon ääni ja pysyvä tyyli', 'style', 'textarea');
            const button = el('button', 'Testaa hahmon ääntä', 'btn btn-secondary'); button.type = 'button';
            button.addEventListener('click', () => void produce('character', character.name)); card.append(button); container.append(card);
        });
        if (!d.cast.length) container.append(el('p','Kirjoita repliikit ja päivitä hahmot.','card-meta'));
        const old = $('play-scene').value; $('play-scene').replaceChildren();
        scenes(d.script).forEach((scene, index) => $('play-scene').append(new Option(scene.name, String(index))));
        if ([...$('play-scene').options].some(option => option.value === old)) $('play-scene').value = old;
        $('play-summary').textContent = `${d.cast.length} hahmoa · ${scenes(d.script).length} kohtausta`;
        $('play-model-help').textContent = model(d)?.provider === 'elevenlabs'
            ? 'ElevenLabs v3: valittu ääni ja lyhyet audiotagit ohjaavat esitystä. Vapaamuotoisia esitysohjeita ei välitetä palveluun.'
            : 'Gemini: hahmon tyyli ja repliikkikohtainen esitysohje ohjaavat ääntä yhdessä.';
    }
    function render(d) {
        if (!d) { controls(null); return; }
        $('play-script').value = d.script;
        $('play-model').replaceChildren(new Option('Valitse malli', ''));
        for (const item of d.options?.models || []) {
            if (item.provider !== 'gemini' && item.model_id !== 'eleven_v3') continue;
            const option = new Option(`${item.display_name}${item.configured === false ? ' · ei käytettävissä' : ''}`, `${item.provider}:${item.model_id}`);
            option.disabled = item.configured === false; $('play-model').append(option);
        }
        $('play-model').value = d.model;
        renderCast(d); renderProductions(d); controls(d);
        message(d, d.message || (d.loaded ? 'Näytelmä on valmis muokattavaksi.' : 'Ladataan näytelmän tietoja…'), d.error);
    }
    function renderProductions(d) {
        if (!isCurrent(d)) return;
        const container = $('play-productions'); container.replaceChildren();
        const labels = {queued:'Odottaa', running:'Tuotetaan', assembling:'Yhdistetään', completed:'Valmis', cancelled:'Pysäytetty', partial:'Osittain valmis', failed:'Epäonnistui', interrupted:'Keskeytynyt'};
        for (const take of d.productions || []) {
            const row = el('div', undefined, 'play-take'), copy = el('div'), actions = el('div', undefined, 'play-actions');
            copy.append(el('strong', `${take.play_label || 'Näytelmä'} · otto ${take.id}`), el('p', `${labels[take.status] || take.status} · ${take.completed_segments}/${take.total_segments} osaa · ${take.provider === 'gemini' ? 'Gemini' : 'ElevenLabs'}`, 'card-meta'));
            if (take.error) copy.append(el('p', take.error, 'card-meta'));
            const button = (label, action) => { const node = el('button', label, 'btn btn-secondary'); node.type = 'button'; node.disabled = !!d.busy; node.addEventListener('click', action); actions.append(node); };
            if (take.status === 'completed') {
                button('Kuuntele', () => void asset(d, take, 'audio', false));
                button('Lataa audio', () => void asset(d, take, 'audio', true));
                button('Lataa tuotantopaketti', () => void asset(d, take, 'package', true));
            } else if (d.canEdit && active.has(take.status)) button('Pysäytä', () => void changeProduction(d, take, 'cancel'));
            else if (d.canEdit) button('Jatka tuotantoa', () => void changeProduction(d, take, 'resume'));
            row.append(copy, actions); container.append(row);
        }
        if (!d.productions?.length) container.append(el('p', 'Äänikokeet ja tuotannot säilyvät tässä omina ottoinaan.', 'card-meta'));
    }
    async function asset(d, take, kind, download) {
        try {
            const data = await request(`/api/audio/productions/${take.id}/asset-link?kind=${kind}`, {});
            if (!isCurrent(d)) return;
            const url = new URL(data.url, window.SKRIPTLAB_CONFIG.API_BASE_URL);
            if (download) { const a = el('a'); a.href = url.href; a.download = ''; a.rel = 'noopener'; a.click(); }
            else { $('play-player').src = url.href; $('play-player').classList.remove('hidden'); $('play-player').play().catch(() => {}); }
        } catch (error) { message(d, error.message, true); }
    }
    async function refresh(d) {
        const data = await request(`/api/audio/plays/${d.id}`);
        d.productions = data.productions || [];
        renderProductions(d); schedulePoll();
    }
    function schedulePoll() {
        clearTimeout(pollTimer);
        const d = draft();
        if (d && visible() && d.productions?.some(item => active.has(item.status))) pollTimer = setTimeout(async () => {
            try { await refresh(d); } catch (error) { message(d, `${error.message} Päivitä tila jatkaaksesi seurantaa.`, true); }
        }, 3000);
    }
    async function save(d) {
        syncCast(d);
        const edit = d.edit;
        const selected = model(d);
        const saved = await request(`/api/audio/plays/${d.id}`, {revision:d.revision, provider:selected?.provider || 'gemini', model_id:selected?.model_id || '', play:{script:d.script, cast:d.cast, label:'Koko näytelmä'}}, 'PUT');
        d.revision = saved.revision;
        d.dirty = d.edit !== edit;
        // Keep the shell's metadata in sync without writing unrelated project state.
        if (isCurrent(d) && String(window.manuscriptData?.id) === d.id) {
            window.manuscriptData.analysis = {...window.manuscriptData.analysis, audio_play:saved};
        }
        message(d, 'Näytelmä ja roolitus tallennettu.');
    }
    function payload(d, selection = 'full', name = '') {
        const selected = model(d);
        if (!selected || selected.configured === false) throw new Error('Valitse käytettävissä oleva äänipalvelu ja malli.');
        syncCast(d);
        let script = d.script, label = 'Koko näytelmä';
        if (selection === 'character') {
            const lines = script.split('\n').filter(line => names(line).some(speaker => speaker.toLocaleLowerCase('fi') === name.toLocaleLowerCase('fi'))).slice(0,2);
            if ((lines[0] || '').length > 2000) throw new Error('Hahmon ensimmäinen repliikki on liian pitkä ääninäytteeksi. Jaa se alle 2 000 merkin repliikeiksi.');
            script = lines.join('\n').length <= 2000 ? lines.join('\n') : lines[0];
            label = `Roolinäyte: ${name}`;
        } else if (selection === 'scene') {
            const scene = scenes(script)[Number($('play-scene').value) || 0];
            if (!scene) throw new Error('Kirjoita ensin testattava kohtaus.');
            // A bounded continuous sample uses complete lines, never truncated words.
            const lines = scene.script.split('\n'); const sample = []; let count = 0, chars = 0;
            for (const line of lines) {
                if (names(line).length && (count >= 8 || chars + line.length > 4000)) break;
                sample.push(line); if (names(line).length) { count++; chars += line.length; }
            }
            script = sample.join('\n'); label = `Dialoginäyte: ${scene.name}`;
        }
        if (!names(script).length) throw new Error('Näytteessä ei ole repliikkejä. Tarkista käsikirjoituksen merkinnät.');
        const used = new Set(names(script).map(value => value.toLocaleLowerCase('fi')));
        const cast = d.cast.filter(character => used.has(character.name.toLocaleLowerCase('fi')));
        for (const character of cast) if (!character.voice_id) throw new Error(`Valitse ääni hahmolle ${character.name}.`);
        return {project_id:Number(d.id), provider:selected.provider, model_id:selected.model_id,
            voice_id:cast[0]?.voice_id || '', voice_name:'Näytelmän roolitus', execution_mode:'interactive',
            play:{script, cast, label}};
    }
    async function action(fn) {
        const d = draft(); if (!d || d.busy || !d.loaded || !d.canEdit) return;
        d.busy = true; controls(d); renderProductions(d);
        try { await fn(d); } catch (error) { message(d, error.message, true); }
        finally { d.busy = false; if (isCurrent(d)) { controls(d); renderProductions(d); } }
    }
    async function produce(selection, name) {
        await action(async d => {
            const body = payload(d, selection, name);
            await save(d);
            message(d, selection === 'full' ? 'Käynnistetään koko näytelmän tuotanto…' : 'Käynnistetään ääninäyte…');
            // Retry identity survives an uncertain response. A changed payload gets a new key.
            const signature = JSON.stringify(body);
            if (d.intent?.signature !== signature) d.intent = {signature, key:crypto.randomUUID()};
            body.idempotency_key = d.intent.key;
            try {
                const take = await request('/api/audio/productions', body);
                d.intent = null;
                d.productions = [take, ...d.productions.filter(item => item.id !== take.id)];
                message(d, `${body.play.label} on tuotannossa. Voit seurata etenemistä alta.`);
                renderProductions(d); schedulePoll();
            } catch (error) {
                await refresh(d).catch(() => {});
                throw error;
            }
        });
    }
    async function changeProduction(d, take, operation) {
        if (!isCurrent(d)) return;
        await action(async () => {
            const result = await request(`/api/audio/productions/${take.id}/${operation}`, {});
            d.productions = d.productions.map(item => item.id === take.id ? result : item);
            message(d, operation === 'cancel' ? 'Tuotanto pysäytettiin. Valmiit osat säilyvät.' : 'Tuotanto jatkuu valmiista osista.'); schedulePoll();
        });
    }
    function projectChanged() {
        const id = String(window.manuscriptData?.id || '');
        if (id === currentId) return;
        currentId = id; clearTimeout(pollTimer);
        const player = $('play-player'); if (player) { player.pause(); player.removeAttribute('src'); player.load(); player.classList.add('hidden'); }
        if (id && !drafts.has(id)) drafts.set(id, {id, script:'', cast:[], model:'', revision:0, edit:0, dirty:false, busy:false, loaded:false, loading:false, canEdit:false, productions:[]});
        render(draft()); if (!id) { $('play-script').value = ''; $('play-cast').replaceChildren(); $('play-productions').replaceChildren(); $('play-status').textContent = 'Valitse tallennettu käsikirjoitus.'; }
        if (visible() && id) void open();
    }
    async function open() {
        projectChanged();
        const d = draft(); if (!d || d.loading) return;
        if (d.loaded) { render(d); schedulePoll(); return; }
        d.loading = true; message(d, 'Ladataan näytelmää ja ääniä…'); controls(d);
        try {
            const [data, options, eleven] = await Promise.all([
                request(`/api/audio/plays/${d.id}`), request(`/api/audio/productions/options?project_id=${d.id}`),
                request('/api/audio/voices').catch(() => ({voices:[]}))
            ]);
            const saved = data.draft || {};
            d.script = saved.play?.script || ''; d.cast = saved.play?.cast || []; d.revision = saved.revision || 0;
            d.options = options; d.productions = data.productions || []; d.canEdit = data.can_edit;
            for (const voice of eleven.voices || []) if (!options.voices.some(item => item.provider === 'elevenlabs' && item.voice_id === voice.voice_id)) options.voices.push({...voice, provider:'elevenlabs'});
            const fallback = options.models.find(item => item.configured !== false && (item.provider === 'gemini' || item.model_id === 'eleven_v3'));
            d.model = saved.model_id ? `${saved.provider}:${saved.model_id}` : fallback ? `${fallback.provider}:${fallback.model_id}` : '';
            d.loaded = true;
            message(d, d.canEdit ? 'Kirjoita näytelmä tai tuo teksti. Valitse sitten hahmoille äänet.' : 'Näytelmä on katselutilassa.');
            if (isCurrent(d)) render(d); schedulePoll();
        } catch (error) { message(d, error.message, true); }
        finally { d.loading = false; if (isCurrent(d)) controls(d); }
    }
    function downloadDraft(d) {
        const blob = new Blob([JSON.stringify({provider:model(d)?.provider, model_id:model(d)?.model_id, play:{script:d.script,cast:d.cast}}, null, 2)], {type:'application/json'});
        const url = URL.createObjectURL(blob), a = el('a'); a.href = url; a.download = 'naytelma-luonnos.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function initialize() {
        if (!$('play-script')) return;
        $('play-script').addEventListener('input', event => { const d = draft(); if (!d) return; d.script = event.target.value; dirty(d); controls(d); });
        $('play-model').addEventListener('change', event => {
            const d = draft(); const previous = model(d)?.provider; d.model = event.target.value;
            if (previous !== model(d)?.provider) for (const character of d.cast) {
                if (previous) character.voices = {...character.voices, [previous]:character.voice_id};
                character.voice_id = character.voices[model(d)?.provider] || '';
            }
            dirty(d); renderCast(d); controls(d);
        });
        $('play-sync-cast').addEventListener('click', () => { const d = draft(); syncCast(d); dirty(d); renderCast(d); controls(d); });
        $('play-reload').addEventListener('click', async () => {
            const d = draft(); if (!d || d.busy) return;
            if (d.dirty && !window.confirm('Ladataanko tallennettu näytelmä? Tallentamattomat muutokset korvautuvat. Voit ensin viedä luonnoksen talteen.')) return;
            d.loaded = false; d.dirty = false; await open();
        });
        $('play-save').addEventListener('click', () => void action(save));
        $('play-example').addEventListener('click', () => { const d = draft(); if (d.script.trim()) return; d.script = example; syncCast(d); dirty(d); render(d); });
        $('play-import-manuscript').addEventListener('click', () => {
            const d = draft(); if (d.script.trim()) return;
            d.script = (window.manuscriptData.chapters || []).map(chapter => `# ${chapter.title || chapter.toc_title || 'Kohtaus'}\n${(chapter.paragraphs || []).map(p => typeof p === 'string' ? p : p.content || p.text || '').join('\n')}`).join('\n\n');
            syncCast(d); dirty(d); render(d); message(d, 'Teksti tuotu muokattavaksi. Tarkista HAHMO: repliikki -merkinnät ja erottele näyttämöohjeet.');
        });
        $('play-export').addEventListener('click', () => { if (draft()) downloadDraft(draft()); });
        $('play-import').addEventListener('click', () => $('play-file').click());
        $('play-file').addEventListener('change', async event => {
            const d = draft(), file = event.target.files[0]; event.target.value = ''; if (!d || !file) return;
            if (file.size > 3000000) { message(d, 'Tiedosto on liian suuri (enintään 3 Mt).', true); return; }
            try {
                const text = await file.text();
                if (!isCurrent(d)) return;
                if (d.script.trim() && !window.confirm('Korvataanko nykyinen näytelmä tuodulla tiedostolla? Vie luonnos ensin, jos haluat säilyttää sen.')) return;
                const value = file.name.endsWith('.json') ? JSON.parse(text) : {play:{script:text,cast:[]}};
                if (typeof value.play?.script !== 'string' || !Array.isArray(value.play.cast)) throw new Error('JSON-tiedostossa pitää olla play.script ja play.cast.');
                d.script = value.play.script; d.cast = value.play.cast.map(item => ({name:String(item.name || ''), voice_id:String(item.voice_id || ''), style:String(item.style || ''), tags:String(item.tags || ''), voices:item.voices || {}}));
                if (value.provider && value.model_id) d.model = `${value.provider}:${value.model_id}`;
                syncCast(d); dirty(d); render(d);
            } catch (error) { message(d, error.message, true); }
        });
        $('play-estimate').addEventListener('click', () => void action(async d => {
            const data = await request('/api/audio/productions/estimate', payload(d));
            if (!isCurrent(d)) return;
            $('play-estimate-result').textContent = `${data.total_segments} osaa · noin ${Math.ceil(data.estimated_audio_seconds/60)} min · arvio ${Number(data.estimated_cost_eur).toLocaleString('fi-FI', {style:'currency',currency:'EUR'})}. ${data.cost_disclaimer}`;
            message(d, 'Tuotantoarvio laskettu. Ääntä ei tuotettu.');
        }));
        $('play-produce').addEventListener('click', () => void produce('full'));
        $('play-test-scene').addEventListener('click', () => void produce('scene'));
        $('play-refresh').addEventListener('click', async () => { const d = draft(); if (!d) return; try { if (d.loaded) await refresh(d); else await open(); } catch (error) { message(d, error.message, true); } });
        window.addEventListener('beforeunload', event => { if ([...drafts.values()].some(d => d.dirty)) { event.preventDefault(); event.returnValue = ''; } });
    }
    initialize();
    window.SkriptLabAudioPlays = Object.freeze({open, projectChanged});
    if (typeof module !== 'undefined') module.exports = {names, scenes};
})();
