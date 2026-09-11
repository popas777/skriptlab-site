const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function between(start, end) {
    const from = app.indexOf(start), to = app.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from, `Source boundary missing: ${start}`);
    return app.slice(from, to);
}
function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}
function response(data) { return { ok: true, json: async () => data }; }
function harness() {
    const elements = new Map(), requests = [], persisted = [];
    const document = {
        activeElement: null,
        getElementById(id) {
            if (!elements.has(id)) {
                const classes = new Set();
                elements.set(id, {
                    value: '', disabled: false, textContent: '', listeners: {},
                    classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name), add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
                    addEventListener(type, callback) { this.listeners[type] = callback; },
                    focus() { document.activeElement = this; },
                    play: async () => {}, pause() {}, load() {}, removeAttribute(name) { delete this[name]; }
                });
            }
            return elements.get(id);
        }
    };
    const project = id => ({ id, title: `Book ${id}`, analysis: {} });
    const state = {
        document, window: { manuscriptData: project(1) },
        model: { provider: 'gemini', model_id: 'gemini-test-tts', supports_production_prompt: true },
        voice: { provider: 'gemini', voice_id: 'Kore' }, active: false,
        audioProductionCurrent: null,
        audioProductionOptionsPayload: { production_prompt: 'Valmistelusta saatu ohje' },
        audioProductionDraftSegments: [], audioProductionDraftKey: '', availableProjects: [],
        audioDataFromAnalysis() { return state.window.manuscriptData?.analysis?.audio || {}; },
        currentAudioProductionModel: () => state.model,
        currentAudioProductionVoice: () => state.voice,
        audioProductionIsActive: () => state.active,
        audioProductionScriptPreparationState: () => ({ current: false }),
        firstAudioSampleText: () => 'Pikku karhu katseli kuuta.',
        audioProductionLanguageData: () => ({ code: 'fi' }),
        apiFetch: async (url, options) => { requests.push({ url, ...options, body: JSON.parse(options.body) }); return state.nextResponse ? state.nextResponse(url, options) : response({}); },
        loadUsage() {},
        markLocalManuscriptDraft: (value, pending) => persisted.push({ value, pending }),
        URL: { createObjectURL: () => 'blob:audio-test', revokeObjectURL() {} }
    };
    vm.runInNewContext(`
        ${between('const audioNarrationDrafts =', '    let audioProductionVoices =')}
        ${between('function audioProductionPayload(', '    function audioProductionPreferredModelKey(')}
        ${between("document.getElementById('audio-production-prompt')?.addEventListener", '    if (audioProductionStartBtn)')}
    `, state);
    const input = (id, value) => { const element = document.getElementById(id); element.value = value; element.listeners.input({ target: element }); };
    const click = id => document.getElementById(id).listeners.click();
    return { state, elements, requests, persisted, input, click, project, document };
}

test('manual guidance survives a generated suggestion until the user applies it', async () => {
    const h = harness();
    h.input('audio-production-prompt', 'Oma tarkka lukutapa.');
    h.input('audio-narration-style', 'bedtime');
    h.input('audio-narration-instructions', 'Turvallinen tunnelma 4-vuotiaalle.');
    h.state.nextResponse = async () => response({ production_prompt: 'Lue rauhallinen iltasatu.' });
    await h.click('audio-narration-suggest-btn');
    assert.equal(h.state.audioNarrationPromptValue(), 'Oma tarkka lukutapa.');
    assert.equal(h.document.getElementById('audio-narration-suggestion').value, 'Lue rauhallinen iltasatu.');
    assert.deepEqual(h.requests[0].body, { project_id: 1, style: 'bedtime', instructions: 'Turvallinen tunnelma 4-vuotiaalle.' });
    h.input('audio-narration-suggestion', 'Lue rauhallisesti ja lämpimästi.');
    h.click('audio-narration-apply-btn');
    assert.equal(h.state.audioNarrationPromptValue(), 'Lue rauhallisesti ja lämpimästi.');
    assert.equal(h.state.currentAudioNarrationDraft().dirty, true);
});

test('clearing a prompt overrides prepared guidance and survives saving', async () => {
    const h = harness();
    assert.equal(h.state.audioNarrationPromptValue(), 'Valmistelusta saatu ohje');
    h.input('audio-production-prompt', '');
    assert.equal(h.state.audioProductionPayload().production_prompt, '');
    h.state.nextResponse = async () => response({ analysis: { audio: { narration: { production_prompt: '', style: 'auto' } } } });
    await h.click('audio-narration-save-btn');
    assert.equal(h.requests[0].body.analysis.audio.narration.production_prompt, '');
    assert.equal(h.state.currentAudioNarrationDraft().dirty, false);
    assert.equal(h.state.window.manuscriptData.analysis.audio.narration.production_prompt, '');
    assert.equal(h.persisted[0].pending, false);
});

test('unsupported models keep the draft but do not send guidance or enable testing', () => {
    const h = harness();
    h.input('audio-production-prompt', 'Säilyvä ohje.');
    h.state.model = { provider: 'elevenlabs', model_id: 'eleven_multilingual_v2', supports_production_prompt: false };
    h.state.voice = { provider: 'elevenlabs', voice_id: 'voice' };
    h.state.renderAudioNarration();
    assert.equal(h.document.getElementById('audio-narration-test-btn').disabled, true);
    assert.equal('production_prompt' in h.state.audioProductionPayload(), false);
    assert.match(h.document.getElementById('audio-narration-support').textContent, /ei tue/);
    h.state.model = { provider: 'gemini', model_id: 'gemini-test-tts', supports_production_prompt: true };
    h.state.voice = { provider: 'gemini', voice_id: 'Kore' };
    h.state.renderAudioNarration();
    assert.equal(h.state.audioProductionPayload().production_prompt, 'Säilyvä ohje.');
    assert.equal(h.document.getElementById('audio-narration-test-btn').disabled, false);
});

test('preview and whole-book production use the same exact custom guidance', async () => {
    const h = harness();
    h.input('audio-production-prompt', '  Lue läheisesti.\nSäilytä hiljaiset tauot.  ');
    const production = h.state.audioProductionPayload();
    h.state.nextResponse = async () => ({ ok: true, blob: async () => ({ size: 50, type: 'audio/wav' }) });
    await h.click('audio-narration-test-btn');
    assert.equal(h.requests[0].url, '/api/audio/gemini-tts-preview');
    assert.equal(h.requests[0].body.production_prompt, production.production_prompt);
    assert.equal(h.requests[0].body.voice_name, production.voice_id);
    assert.equal(h.requests[0].body.text, 'Pikku karhu katseli kuuta.');
    assert.equal(h.document.getElementById('audio-production-voice-preview').src, 'blob:audio-test');
});

test('late suggestions remain with their original project and do not replace another draft', async () => {
    const h = harness(), pending = deferred();
    h.input('audio-production-prompt', 'Ensimmäisen kirjan ohje.');
    h.state.nextResponse = () => pending.promise;
    const run = h.click('audio-narration-suggest-btn');
    h.state.window.manuscriptData = h.project(2);
    h.input('audio-production-prompt', 'Toisen kirjan ohje.');
    pending.resolve(response({ production_prompt: 'Ensimmäisen kirjan ehdotus.' }));
    await run;
    assert.equal(h.state.audioNarrationPromptValue(), 'Toisen kirjan ohje.');
    assert.equal(h.state.currentAudioNarrationDraft().suggestion, '');
    h.state.window.manuscriptData = h.project(1);
    h.state.renderAudioNarration();
    assert.equal(h.state.audioNarrationPromptValue(), 'Ensimmäisen kirjan ohje.');
    assert.equal(h.state.currentAudioNarrationDraft().suggestion, 'Ensimmäisen kirjan ehdotus.');
});

test('late saving updates the original project without persisting over the current project', async () => {
    const h = harness(), pending = deferred();
    const original = h.state.window.manuscriptData;
    h.input('audio-production-prompt', 'Ensimmäisen kirjan tallennettu ohje.');
    h.state.nextResponse = () => pending.promise;
    const run = h.click('audio-narration-save-btn');
    const second = h.project(2); h.state.window.manuscriptData = second;
    h.input('audio-production-prompt', 'Toisen kirjan ohje.');
    pending.resolve(response({ analysis: { audio: { narration: { production_prompt: 'Ensimmäisen kirjan tallennettu ohje.' } } } }));
    await run;
    assert.equal(original.analysis.audio.narration.production_prompt, 'Ensimmäisen kirjan tallennettu ohje.');
    assert.equal(second.analysis.audio, undefined);
    assert.equal(h.state.audioNarrationPromptValue(), 'Toisen kirjan ohje.');
    assert.equal(h.persisted.length, 0);
});

test('late audio preview does not attach the prior project audio to the current project', async () => {
    const h = harness(), pending = deferred();
    h.state.nextResponse = () => pending.promise;
    const run = h.click('audio-narration-test-btn');
    h.state.window.manuscriptData = h.project(2);
    pending.resolve({ ok: true, blob: async () => ({ size: 50, type: 'audio/wav' }) });
    await run;
    assert.equal(h.document.getElementById('audio-production-voice-preview').src, undefined);
    assert.equal(h.state.currentAudioNarrationDraft().testing, false);
});

test('edits made during saving remain marked as unsaved', async () => {
    const h = harness(), pending = deferred();
    h.input('audio-production-prompt', 'Tallennettava ohje.');
    h.state.nextResponse = () => pending.promise;
    const run = h.click('audio-narration-save-btn');
    h.input('audio-production-prompt', 'Uudempi ohje.');
    pending.resolve(response({}));
    await run;
    assert.equal(h.state.audioNarrationPromptValue(), 'Uudempi ohje.');
    assert.equal(h.state.currentAudioNarrationDraft().dirty, true);
});

test('an active production locks changes and blocks new suggestion and preview requests', async () => {
    const h = harness();
    h.state.active = true; h.state.renderAudioNarration();
    for (const id of ['audio-production-prompt', 'audio-narration-save-btn', 'audio-narration-test-btn', 'audio-narration-suggest-btn']) {
        assert.equal(h.document.getElementById(id).disabled, true, id);
    }
    await h.click('audio-narration-suggest-btn');
    await h.click('audio-narration-save-btn');
    await h.click('audio-narration-test-btn');
    assert.equal(h.requests.length, 0);
});

test('saving narration does not clear a pending manuscript synchronization', async () => {
    const h = harness();
    h.state.window.manuscriptData._db_sync_pending = true;
    h.input('audio-production-prompt', 'Ohje muokatulle käsikirjoitukselle.');
    h.state.nextResponse = async () => response({});
    await h.click('audio-narration-save-btn');
    assert.equal(h.persisted[0].pending, true);
    assert.equal(h.state.window.manuscriptData._db_sync_pending, true);
});

test('basic audio sample uses the selected voice and exact narration prompt', async () => {
    const workflow = fs.readFileSync(path.join(__dirname, '..', 'book-workflow.js'), 'utf8');
    const start = workflow.indexOf('    on("book-audio-test", () =>');
    const end = workflow.indexOf('// Repairs are part', start);
    assert.ok(start >= 0 && end > start);
    const calls = [], elements = new Map();
    let callback;
    const state = {
        window: { SkriptLabBasicHooks: { audioPayload: () => ({ provider: 'gemini', model_id: 'test-tts', voice_id: 'Kore', production_prompt: 'Lue pehmeästi.\nSäilytä tauot.' }) } },
        $: id => { if (!elements.has(id)) elements.set(id, { value: '  Pikku karhu nukkui.  ' }); return elements.get(id); },
        on: (id, handler) => { callback = handler; },
        work: async (id, status, message, task) => task(),
        A: { projectId: () => 7, request: async (url, options) => { calls.push({ url, ...options }); return {}; } },
        previewUrl: null, URL: { createObjectURL: () => 'blob:sample', revokeObjectURL() {} }, tell() {}
    };
    vm.runInNewContext(workflow.slice(start, end), state);
    await callback();
    assert.equal(calls[0].url, '/audio/gemini-tts-preview');
    assert.equal(calls[0].body.voice_name, 'Kore');
    assert.equal(calls[0].body.production_prompt, 'Lue pehmeästi.\nSäilytä tauot.');
    assert.equal(calls[0].body.text, 'Pikku karhu nukkui.');
    state.window.SkriptLabBasicHooks.audioPayload = () => ({ provider: 'elevenlabs', model_id: 'eleven_multilingual_v2', voice_id: 'voice-el' });
    await callback();
    assert.equal(calls[1].url, '/audio/tts-preview');
    assert.equal(calls[1].body.voice_id, 'voice-el');
    assert.equal(Object.hasOwn(calls[1].body, 'production_prompt'), false);
});


test('active production displays its saved guidance without replacing the editable draft', () => {
    const h = harness();
    h.input('audio-production-prompt', 'Seuraavan tuotannon ohje.');
    h.state.active = true;
    h.state.audioProductionCurrent = { production_prompt: 'Käynnissä olevan tuotannon ohje.' };
    h.state.renderAudioNarration();
    assert.equal(h.document.getElementById('audio-production-prompt').value, 'Käynnissä olevan tuotannon ohje.');
    assert.equal(h.state.currentAudioNarrationDraft().prompt, 'Seuraavan tuotannon ohje.');
    h.state.active = false;
    h.state.renderAudioNarration();
    assert.equal(h.document.getElementById('audio-production-prompt').value, 'Seuraavan tuotannon ohje.');
});
