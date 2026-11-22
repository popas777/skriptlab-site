const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(appRoot, 'elamakerta.html'), 'utf8');
const js = fs.readFileSync(path.join(appRoot, 'elamakerta.js'), 'utf8');
const shellJs = fs.readFileSync(path.join(appRoot, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(appRoot, 'elamakerta.css'), 'utf8');
const shellHtml = fs.readFileSync(path.join(appRoot, 'index.html'), 'utf8');

function loadWorkspaceInternals() {
  const storage = new Map();
  const window = {
    ELAMAKERTA_CONFIG: {},
    crypto: { randomUUID: () => 'test-uuid' },
    addEventListener() {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    scrollTo() {},
    location: { href: 'https://example.test/elamakerta.html', origin: 'https://example.test' },
    history: { replaceState() {} },
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
  };
  window.parent = window;
  const document = {
    activeElement: null,
    visibilityState: 'visible',
    addEventListener() {},
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    contains() { return false; },
  };
  const context = {
    window,
    document,
    navigator: {},
    console,
    URL,
    Intl,
    TextEncoder,
    AbortController,
    Blob,
    FormData,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  vm.runInNewContext(js, context, { filename: 'elamakerta.js' });
  return window.ElamakertaModule.__test;
}

function expectId(id) {
  assert.match(html, new RegExp(`\\bid=["']${id}["']`), `Missing #${id}`);
}

function assetVersion(assetName) {
  const escaped = assetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`${escaped}\\?v=(\\d+)`));
  assert.ok(match, `${assetName} must use a numeric cache version`);
  return Number(match[1]);
}

function contrastRatio(firstHex, secondHex) {
  const luminance = (hex) => {
    const channels = hex.replace('#', '').match(/.{2}/g).map((value) => parseInt(value, 16) / 255);
    const linear = channels.map((value) => (
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    ));
    return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
  };
  const first = luminance(firstHex);
  const second = luminance(secondHex);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function cssToken(block, name) {
  const match = block.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'));
  assert.ok(match, `Missing ${name}`);
  return match[1];
}

test('biography materials expose an accessible recording and audio-file transcription pilot', () => {
  [
    'm-text',
    'transcription-panel',
    'transcription-privacy',
    'btn-record-audio',
    'record-audio-label',
    'btn-upload-audio',
    'audio-file-input',
    'transcription-feedback',
    'transcription-status',
    'recording-timer',
    'transcription-progress',
    'transcription-error',
    'btn-cancel-transcription',
  ].forEach(expectId);

  assert.match(html, /id=["']transcription-status["'][^>]*role=["']status["'][^>]*aria-live=["']polite["']/);
  assert.match(html, /id=["']transcription-error["'][^>]*role=["']alert["']/);
  assert.match(html, /id=["']btn-record-audio["'][^>]*aria-pressed=["']false["']/);
  assert.match(html, /id=["']transcription-feedback["'][^>]*aria-busy=["']false["']/);
  assert.match(html, /id=["']transcription-progress["'][^>]*aria-label=/);
  assert.match(html, /Puheesta tekstiksi\s*<span[^>]*>Kokeilu<\/span>/);
  assert.match(css, /\.transcription-panel\s*\{/);
  assert.match(css, /data-transcription-state=["']recording["']/);
  assert.match(css, /\.transcription-panel\s+:focus-visible/);
  assert.ok(assetVersion('elamakerta.css') >= 3);
  assert.ok(assetVersion('elamakerta.js') >= 3);
});

test('privacy and review copy make temporary processing and explicit material save clear', () => {
  assert.match(html, /SkriptLab ei tallenna äänitiedostoa/);
  assert.match(html, /Geminiin ladattu tiedosto poistetaan heti litteroinnin jälkeen/);
  assert.match(html, /Jos välitön poisto epäonnistuu, Gemini poistaa sen automaattisesti viimeistään 48 tunnin kuluttua/);
  assert.match(html, /Litterointi lisätään muokattavaan luonnokseen/);
  assert.match(html, /Tarkista teksti ennen muiston tallentamista/);
  assert.match(html, /enintään 25 Mt/);
  assert.match(html, /10 minuutin kohdalla/);
});

test('supported upload picker is limited to the agreed audio formats', () => {
  const input = html.match(/<input\b(?=[^>]*id=["']audio-file-input["'])[^>]*>/s);
  assert.ok(input, 'Missing audio file input');
  for (const extension of ['wav', 'mp3', 'aiff', 'aif', 'aac', 'ogg', 'flac']) {
    assert.match(input[0], new RegExp(`\\.${extension}(?:,|["'])`));
  }
  assert.doesNotMatch(input[0], /\.mp4|\.m4a|video\//);
  assert.match(js, /const\s+MAX_AUDIO_FILE_BYTES\s*=\s*25\s*\*\s*1024\s*\*\s*1024/);
  assert.match(js, /file\.size\s*>\s*MAX_AUDIO_FILE_BYTES/);
  assert.match(js, /enintään 25 Mt:n tiedosto/);
});

test('document and image import is accessible from the notebook with a review step', () => {
  for (const id of [
    'materials-import-files',
    'material-file-input',
    'material-import-panel',
    'material-import-status',
    'material-import-progress',
    'material-import-error',
    'material-import-review',
    'confirm-material-import',
    'cancel-material-import',
  ]) expectId(id);
  const picker = html.match(/<input\b(?=[^>]*id=["']material-file-input["'])[^>]*>/s);
  assert.ok(picker, 'Missing material file input');
  assert.match(picker[0], /\bmultiple\b/);
  assert.match(picker[0], /aria-label=["']Valitse elämäkerran aineistotiedostot["']/);
  for (const extension of ['txt', 'md', 'html', 'pdf', 'docx', 'rtf', 'odt', 'png', 'jpg', 'jpeg', 'webp']) {
    assert.match(picker[0], new RegExp(`\\.${extension}(?:,|["'])`));
  }
  assert.match(html, /id=["']material-import-panel["'][^>]*role=["']dialog["'][^>]*aria-modal=["']true["']/);
  assert.match(html, /id=["']material-import-panel["'][^>]*tabindex=["']-1["']/);
  assert.match(html, /id=["']material-import-status["'][^>]*role=["']status["'][^>]*aria-live=["']polite["']/);
  assert.match(html, /id=["']material-import-error["'][^>]*role=["']alert["']/);
  assert.match(css, /\.material-import-panel\s*\{/);
  assert.match(css, /\.import-review-item\s*\{/);
});

test('material picker always returns focus to the visible modal and traps outside Tab focus', () => {
  const openStart = js.indexOf('function openMaterialImport');
  const openEnd = js.indexOf('function closeMaterialImport', openStart);
  const open = js.slice(openStart, openEnd);
  assert.ok(openStart >= 0 && openEnd > openStart, 'material import opener must be inspectable');
  assert.ok(
    open.indexOf('$("close-material-import").focus({ preventScroll: true })')
      < open.indexOf('$("material-file-input").click()'),
    'a visible dialog control receives focus before the native chooser opens',
  );

  const selectionStart = js.indexOf('async function handleMaterialFileSelection');
  const selectionEnd = js.indexOf('async function waitForMaterialImportOperation', selectionStart);
  const selection = js.slice(selectionStart, selectionEnd);
  assert.match(selection, /focusMaterialImportDialog\(false\)/, 'chooser return and empty selection restore dialog focus');
  assert.match(selection, /focusMaterialImportDialog\(Boolean\(pendingMaterialImports\.length\)\)/, 'completed import focuses its review');
  assert.match(js, /\$\(["']material-file-input["']\)\.addEventListener\(["']cancel["'],\s*\(\)\s*=>\s*focusMaterialImportDialog\(false\)\)/);
  const focusStart = js.indexOf('function focusMaterialImportDialog');
  const focusEnd = js.indexOf('function closeMaterialImport', focusStart);
  const focus = js.slice(focusStart, focusEnd);
  assert.match(focus, /materialImportController\s*&&\s*!\$\(["']cancel-material-import["']\)\.disabled/);
  assert.match(focus, /abortControl\s*\|\|\s*reviewControl\s*\|\|\s*\$\(["']close-material-import["']\)/);

  const renderStart = js.indexOf('function renderPendingMaterialImports');
  const renderEnd = js.indexOf('async function addPendingImportPreview', renderStart);
  const render = js.slice(renderStart, renderEnd);
  assert.match(render, /cancel-material-import["']\)\.disabled\s*=\s*confirmationLocked\s*\|\|\s*cleanupLocked/);
  assert.doesNotMatch(render, /cancel-material-import["']\)\.disabled\s*=\s*importLocked/);
  assert.match(render, /importLocked\s*&&\s*!panel\.hidden/);
  assert.match(render, /!panel\.contains\(activeElement\)\s*\|\|\s*activeElement\?\.disabled/);
  assert.match(render, /panel\.focus\(\{\s*preventScroll:\s*true\s*\}\)/);

  const trapStart = js.indexOf('function trapModalFocus');
  const trapEnd = js.indexOf('function bindEvents', trapStart);
  const trap = js.slice(trapStart, trapEnd);
  assert.match(trap, /!dialog\.contains\(document\.activeElement\)/);
  assert.match(trap, /if\s*\(document\.activeElement\s*===\s*dialog\)\s*\{\s*event\.preventDefault\(\);\s*\(event\.shiftKey\s*\?\s*last\s*:\s*first\)\.focus\(\)/);
  assert.match(trap, /\(event\.shiftKey\s*\?\s*last\s*:\s*first\)\.focus\(\)/);
  assert.match(trap, /if\s*\(!focusable\.length\)\s*\{\s*event\.preventDefault\(\);\s*dialog\.focus\(\{\s*preventScroll:\s*true\s*\}\);\s*return;/);
});

test('material import uses the project endpoint sequentially and never stores base64 image data', () => {
  assert.match(js, /\/projects\/\$\{encodeURIComponent\(projectId\)\}\/biography\/materials\/import/);
  assert.match(js, /formData\.append\(["']file["'],\s*file,\s*file\.name\)/);
  const handlerStart = js.indexOf('async function handleMaterialFileSelection');
  const handlerEnd = js.indexOf('async function waitForMaterialImportOperation', handlerStart);
  const handler = js.slice(handlerStart, handlerEnd);
  assert.match(handler, /for\s*\(let\s+index\s*=\s*0;[\s\S]*?await\s+apiImportMaterial\(file,\s*projectId,/);
  assert.match(handler, /material\.kind\s*!==\s*["']photo_note["']/);
  assert.match(handler, /payload\.asset\?\.content_url/);
  assert.doesNotMatch(js, /FileReader|readAsDataURL|data:image\//);
  assert.match(js, /showStep\(["']materials["'],\s*\{\s*save:\s*false\s*\}\)/);
});

test('imported material normalization preserves canonical source and durable asset metadata', () => {
  const internals = loadWorkspaceInternals();
  const material = internals.normalizeMaterial({
    id: 'material-image',
    title: 'Vanha kuva',
    kind: 'photo_note',
    text: 'Kesäpäivä rannalla.',
    source_filename: 'ranta.webp',
    mime_type: 'image/webp',
    size_bytes: 1234,
    asset_id: 42,
    image_width: 1200,
    image_height: 800,
  }, 0);
  assert.equal(material.asset_id, 42);
  assert.equal(material.size_bytes, 1234);
  assert.equal(material.image_width, 1200);
  assert.equal(material.image_height, 800);
  assert.equal(material.source_filename, 'ranta.webp');
  assert.equal(material.mime_type, 'image/webp');
});

test('microphone flow captures Web Audio PCM and emits a capped 16 kHz mono WAV', () => {
  assert.doesNotMatch(js, /SpeechRecognition|webkitSpeechRecognition/);
  assert.match(js, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(js, /window\.AudioContext\s*\|\|\s*window\.webkitAudioContext/);
  assert.match(js, /createMediaStreamSource/);
  assert.match(js, /createScriptProcessor\(4096,\s*1,\s*1\)/);
  assert.match(js, /getChannelData\(0\)/);
  assert.match(js, /const\s+TRANSCRIPTION_SAMPLE_RATE\s*=\s*16000/);
  assert.match(js, /const\s+MAX_RECORDING_SECONDS\s*=\s*10\s*\*\s*60/);
  assert.match(js, /MAX_RECORDING_SAMPLES\s*=\s*TRANSCRIPTION_SAMPLE_RATE\s*\*\s*MAX_RECORDING_SECONDS/);
  for (const waveMarker of ['RIFF', 'WAVE', 'fmt ', 'data']) {
    assert.match(js, new RegExp(`["']${waveMarker.replace(' ', '\\s')}["']`));
  }
  assert.match(js, /view\.setUint16\(22,\s*1,\s*true\)/, 'WAV must be mono');
  assert.match(js, /view\.setUint16\(34,\s*16,\s*true\)/, 'WAV must be PCM16');
  assert.match(js, /recordingPcmLength\s*>=\s*MAX_RECORDING_SAMPLES/);
  assert.match(js, /finishAudioRecording\(true\)/);
});

test('transcription POST uses the project endpoint and only fills the review editor', () => {
  assert.match(js, /new\s+FormData\(\)/);
  assert.match(js, /formData\.append\(["']file["'],\s*file/);
  assert.match(js, /formData\.append\(["']language_code["'],\s*TRANSCRIPTION_LANGUAGE_CODE\)/);
  assert.match(js, /\/projects\/\$\{encodeURIComponent\(projectId\)\}\/biography\/transcribe/);
  assert.match(js, /method:\s*["']POST["']/);
  assert.match(js, /payload\.text\s*\|\|\s*payload\.transcript/);
  assert.match(js, /const\s+textarea\s*=\s*\$\(["']m-text["']\)/);
  assert.match(js, /appendTranscriptToEditor\(transcript\)/);

  const start = js.indexOf('async function transcribeAudioFile');
  const end = js.indexOf('function microphoneErrorMessage', start);
  assert.ok(start >= 0 && end > start, 'Transcription function must be inspectable');
  const transcribeBlock = js.slice(start, end);
  assert.doesNotMatch(transcribeBlock, /biographyState\.materials|addMaterial\(/);
  assert.match(transcribeBlock, /Tarkista Muistosi-kenttä/);
});

test('only the separate, same-origin recorder can return audio to the waiting editor', () => {
  const recorder = fs.readFileSync(path.join(appRoot, 'elamakerta-aanitys.html'), 'utf8');
  assert.match(recorder, /id="recorder-page"/);
  assert.ok(!recorder.includes('auth.js'));
  const start = js.indexOf('function receiveRecording(');
  const handler = js.slice(start, js.indexOf('function setupRecorderPage', start));
  const accepted = [];
  const context = {
    recorderWindow: {}, window: { location: { origin: 'https://example.test' }, focus() {} },
    File, MAX_AUDIO_FILE_BYTES: 4096, transcriptionPhase: 'requesting',
    closeRecorderWindow() { context.recorderWindow = null; },
    transcribeAudioFile: file => accepted.push(file),
  };
  vm.runInNewContext(handler, context);
  const file = new File(['wav'], 'test.wav', { type: 'audio/wav' });
  const event = { source: context.recorderWindow, origin: 'https://example.test', data: { type: 'skriptlab:biography-recording', file } };
  context.receiveRecording({ ...event, origin: 'https://different.test' });
  context.receiveRecording({ ...event, source: {} });
  context.receiveRecording({ ...event, data: { ...event.data, file: new File(['x'], 'x.txt') } });
  assert.equal(accepted.length, 0);
  context.receiveRecording(event);
  context.receiveRecording(event);
  assert.deepEqual(accepted, [file]);
});

test('recording, progress, cancellation, success and error states are represented', () => {
  for (const phase of ['requesting', 'recording', 'preparing', 'transcribing', 'success', 'error']) {
    assert.match(js, new RegExp(`["']${phase}["']`));
  }
  assert.match(js, /setAttribute\(["']aria-busy["'],\s*String\(indeterminate\)\)/);
  assert.match(js, /setAttribute\(["']aria-pressed["'],\s*String\(recording\)\)/);
  assert.match(js, /progress\.removeAttribute\(["']value["']\)/);
  assert.match(js, /new\s+AbortController\(\)/);
  assert.match(js, /transcriptionController\.abort\(\)/);
  assert.match(js, /track\.stop\(\)/);
  assert.match(js, /window\.addEventListener\(["']pagehide["'],\s*disposeTranscription\)/);
});

test('shell navigation deactivates biography audio before hiding its iframe', () => {
  assert.match(js, /deactivate:\s*async\s*\(\)\s*=>\s*\{[\s\S]*?await\s+cancelActiveTranscription\(\)[\s\S]*?abandonPendingMaterialImports\(\{\s*silent:\s*true\s*\}\)/);
  const helperStart = shellJs.indexOf('function deactivateElamakertaFrame');
  const openStart = shellJs.indexOf('function openModule', helperStart);
  assert.ok(helperStart >= 0 && openStart > helperStart, 'shell lifecycle helper must precede openModule');
  const helper = shellJs.slice(helperStart, openStart);
  assert.match(helper, /currentViewId\s*!==\s*["']view-elamakerta["']/);
  assert.match(helper, /nextViewId\s*===\s*["']view-elamakerta["']/);
  assert.match(helper, /ElamakertaModule\?\.deactivate\?\.\(\)/);

  const openEnd = shellJs.indexOf('function persistPendingModuleEdits', openStart);
  const openBlock = shellJs.slice(openStart, openEnd);
  assert.ok(openBlock.indexOf('deactivateElamakertaFrame(activeNavViewId)') < openBlock.indexOf("views.forEach(v => v.classList.add('hidden'))"), 'audio is cancelled before views are hidden');
});

test('capture and notebook are the two main views and old start opens capture', () => {
  for (const id of ['project-trigger', 'project-menu', 'new-project-form', 'path-list', 'open-settings',
    'view-interview', 'view-materials', 'view-outline', 'view-chapters', 'view-manuscript',
    'refresh-question', 'own-topic', 'm-text', 'note-search', 'note-reader', 'book-nav']) expectId(id);
  const nav = html.match(/<nav[^>]*id="path-list"[^>]*>([\s\S]*?)<\/nav>/)[1];
  assert.deepEqual([...nav.matchAll(/data-step-link="([^"]+)"/g)].map(match => match[1]), ['interview', 'materials']);
  const { normalizeBiographyState } = loadWorkspaceInternals();
  for (const step of ['start', 'aloitus', 'interview', 'haastattelu']) {
    assert.equal(normalizeBiographyState({ active_step: step }).active_step, 'interview');
  }
  for (const step of ['materials', 'outline', 'chapters', 'manuscript']) {
    assert.equal(normalizeBiographyState({ active_step: step }).active_step, step);
  }
  assert.match(html, /<details class="book-tools">/);
});

test('theme bridge accepts same-origin shell tokens and supports standalone light and dark modes', () => {
  assert.match(js, /SHELL_THEME_EVENT\s*=\s*["']skriptlab:theme-changed["']/);
  assert.match(js, /event\.origin\s*!==\s*window\.location\.origin/);
  assert.match(js, /event\.source\s*!==\s*window\.parent/);
  assert.match(js, /tokens\?\.\[["']--bg-color["']\]/);
  assert.match(js, /setProperty\(["']--canvas["'],\s*canvas\)/);
  assert.match(js, /setProperty\(["']--chrome["'],\s*canvas\)/);
  assert.match(js, /SkriptLabElamakertaShell\?\.getContext/);
  assert.match(js, /setTheme,/);
  assert.match(js, /prefers-color-scheme:\s*light/);
  assert.match(css, /html\[data-theme=["']light["']\][\s\S]*?--canvas:\s*#ffffff/);
});

test('faint small text keeps WCAG AA contrast on exact dark and light canvases', () => {
  const rootBlock = css.match(/:root\s*\{([\s\S]*?)\}/)?.[1] || '';
  const lightBlock = css.match(/html\[data-theme=["']light["']\]\s*\{([\s\S]*?)\}/)?.[1] || '';
  assert.ok(contrastRatio(cssToken(rootBlock, '--faint'), '#0d1117') >= 4.5);
  assert.ok(contrastRatio(cssToken(lightBlock, '--faint'), '#ffffff') >= 4.5);
});

test('two visible formats preserve three backward-compatible internal modes', () => {
  for (const mode of ['life_story', 'first_person_guide']) {
    assert.match(html, new RegExp(`<option value=["']${mode}["']`));
  }
  assert.doesNotMatch(html, /data-mode=["'](?:biography|autobiography)["']/);
  for (const internalMode of ['biography', 'autobiography', 'first_person_guide']) {
    assert.match(js, new RegExp(`${internalMode}:\\s*\\[`));
  }
  assert.match(js, /project_mode:\s*["']autobiography["']/);
  assert.match(js, /narrative_perspective:\s*["']first_person["']/);
  assert.match(js, /function\s+internalLifeStoryMode/);
  assert.match(js, /perspective\s*===\s*["']third_person["']\s*\?\s*["']biography["']\s*:\s*["']autobiography["']/);
  assert.match(js, /MODE_PRESETS\s*=\s*\{/);
  assert.match(html, /Minämuotoinen opas/);
});

test('project selection is query-first, module-local and creates tagged unique biography projects', () => {
  assert.match(js, /const\s+MODULE_PROJECT_KEY\s*=\s*["']skriptlab_biography_project_id["']/);
  const chooserStart = js.indexOf('async function chooseInitialProject');
  const chooserEnd = js.indexOf('async function selectProject', chooserStart);
  assert.ok(chooserStart >= 0 && chooserEnd > chooserStart);
  const chooser = js.slice(chooserStart, chooserEnd);
  assert.match(chooser, /const\s+explicitId\s*=\s*requestedProjectId\(\)/);
  assert.match(chooser, /const\s+moduleId\s*=\s*localStorage\.getItem\(MODULE_PROJECT_KEY\)/);
  assert.match(chooser, /resolveInitialProject\(projects,\s*explicitId,\s*moduleId,\s*legacyId\)/);
  assert.match(js, /return\s+find\(explicitId\)\s*\|\|\s*find\(moduleId\)/);
  assert.match(js, /project_kind:\s*["']biography["']/);
  assert.match(js, /function\s+uniqueProjectTitle/);
  assert.match(js, /method:\s*["']POST["']/);
  assert.match(js, /`\$\{API_BASE\}\/projects\?summary=true`/);
});

test('startup project resolution is silent and explicit selection notifies only after load and migration save', () => {
  const chooserStart = js.indexOf('async function chooseInitialProject');
  const chooserEnd = js.indexOf('async function selectProject', chooserStart);
  const chooser = js.slice(chooserStart, chooserEnd);
  assert.match(chooser, /rememberProject\(initial,\s*Boolean\(/);
  assert.doesNotMatch(chooser, /notifyParentOfProject|postMessage/);

  const selectStart = chooserEnd;
  const selectEnd = js.indexOf('async function createProject', selectStart);
  const selectBlock = js.slice(selectStart, selectEnd);
  assert.ok(selectBlock.indexOf('apiGetState(String(project.id))') < selectBlock.indexOf('rememberProject(project'), 'target is loaded before activation');
  assert.match(selectBlock, /rememberProject\(project,\s*Boolean\(/);
  assert.ok(selectBlock.indexOf('await flushPendingSave()') < selectBlock.lastIndexOf('notifyParentOfProject(project)'), 'migration save finishes before parent notification');
  assert.ok(selectBlock.lastIndexOf('selectionRevision !== projectSelectionRevision') < selectBlock.lastIndexOf('notifyParentOfProject(project)'), 'stale selections cannot notify the parent');
  assert.match(selectBlock, /if\s*\(options\?\.notifyParent\)\s*notifyParentOfProject\(project\)/);
  assert.match(js, /button\.addEventListener\(["']click["'],\s*\(\)\s*=>\s*selectProject\(project,\s*\{\s*notifyParent:\s*true\s*\}\)/);
  assert.match(js, /selectProject\(project,\s*\{\s*notifyParent:\s*false\s*\}\)\s*:\s*Promise\.reject/);

  const createStart = selectEnd;
  const createEnd = js.indexOf('function setSaveStatus', createStart);
  const createBlock = js.slice(createStart, createEnd);
  assert.ok(createBlock.indexOf('apiSaveState(initialState, String(project.id))') < createBlock.indexOf('selectProject(project'), 'new state is saved before selection notifies the shell');
  assert.doesNotMatch(createBlock, /rememberProject\(/);
});

test('loadState coalesces duplicate loads and rejects stale project or locally edited responses', () => {
  const loadStart = js.indexOf('function loadState');
  const loadEnd = js.indexOf('function showStep', loadStart);
  const loadBlock = js.slice(loadStart, loadEnd);
  assert.match(loadBlock, /activeLoad\?\.projectId\s*===\s*projectId/);
  assert.match(loadBlock, /return\s+activeLoad\.promise/);
  assert.match(loadBlock, /const\s+requestRevision\s*=\s*stateRevision/);
  assert.match(loadBlock, /const\s+requestState\s*=\s*JSON\.parse\(JSON\.stringify\(biographyState\)\)/);
  assert.match(loadBlock, /projectId\s*===\s*String\(getProjectId\(\)\s*\|\|\s*["']["']\)/);
  assert.match(loadBlock, /requestRevision\s*===\s*stateRevision/);
  assert.match(loadBlock, /!hasPendingPersistence\(\)/);
  assert.match(loadBlock, /stateValuesEqual\(biographyState,\s*requestState\)/);
  assert.ok(loadBlock.indexOf('if (!responseIsCurrent)') < loadBlock.indexOf('biographyState = loaded.state'), 'stale guard precedes state replacement');
  assert.match(loadBlock, /if\s*\(loaded\.migrated\)\s*\{\s*scheduleSave\(\)/);
});

test('new state contract drives interviews, materials, multiple chapters and manuscript export', () => {
  for (const field of [
    'project_mode',
    'narrative_perspective',
    'active_step',
    'current_question',
    'interview_sessions',
    'chapters',
    'manuscript_title',
    'manuscript_text',
  ]) {
    assert.match(js, new RegExp(`${field}:`), `Missing ${field} state field`);
  }
  assert.match(js, /normalizeSession/);
  assert.match(js, /normalizeChapter/);
  const capture = js.slice(js.indexOf("async function saveMemory"), js.indexOf("async function saveMaterialEdit"));
  assert.doesNotMatch(capture, /runAction|apiRunAction/);
  assert.match(capture, /await saveNow\(\)/);
  assert.match(html, /data-run=["']compile_manuscript["']/);
  assert.match(js, /chapter_id:\s*chapter\.id/);
  assert.match(js, /function\s+addChapter/);
  assert.match(js, /function\s+deleteChapter/);
  assert.match(js, /function\s+compileLocally/);
  for (const id of ['preview-manuscript', 'copy-manuscript', 'download-manuscript']) expectId(id);
});

test('controls use the established icon library and cache-busted module assets', () => {
  assert.match(html, /@phosphor-icons\/web@2\.1\.1/);
  assert.match(html, /class=["'][^"']*\bph\s+ph-/);
  assert.doesNotMatch(html, /<svg\b/i);
  assert.ok(assetVersion('elamakerta.css') >= 5);
  assert.ok(assetVersion('elamakerta.js') >= 5);
  assert.match(shellHtml, /src=["']elamakerta\.html\?v=5["']/);
});

test('state helpers enforce project priority and mode-specific first questions', () => {
  const internals = loadWorkspaceInternals();
  const projects = [
    { id: 1, title: 'Tavallinen', analysis: {} },
    { id: 2, title: 'Elämäkerta', analysis: { project_kind: 'biography' } },
    { id: 3, title: 'Vanha', analysis: { biography: {} } },
  ];
  assert.equal(internals.resolveInitialProject(projects, '1', '2', '3').id, 1, 'explicit query wins');
  assert.equal(internals.resolveInitialProject(projects, '', '2', '3').id, 2, 'module-local project is second');
  assert.equal(internals.resolveInitialProject(projects, '', '', '3').id, 3, 'validated legacy project is third');

  const state = internals.defaultBiographyState();
  internals.applyProjectMode(state, 'biography');
  assert.equal(state.narrative_perspective, 'third_person');
  assert.match(state.current_question, /päähenkilöä/);
  assert.equal(internals.visibleProjectMode(state), 'life_story');
  internals.applyNarrativePerspective(state, 'first_person');
  assert.equal(state.project_mode, 'autobiography');
  assert.equal(state.narrative_perspective, 'first_person');
  assert.match(state.current_question, /et koskaan unohda/);
  internals.applyNarrativePerspective(state, 'third_person');
  assert.equal(state.project_mode, 'biography');
  assert.equal(state.narrative_perspective, 'third_person');
  assert.match(state.current_question, /päähenkilöä/);
  internals.applyProjectMode(state, 'first_person_guide');
  assert.equal(state.narrative_perspective, 'first_person');
  assert.match(state.current_question, /oppaan/);
  assert.equal(internals.visibleProjectMode(state), 'first_person_guide');
  internals.applyNarrativePerspective(state, 'third_person');
  assert.equal(state.project_mode, 'first_person_guide');
  assert.equal(state.narrative_perspective, 'first_person');
  const coerced = internals.normalizeBiographyState({
    project_mode: 'first_person_guide',
    narrative_perspective: 'third_person',
  });
  assert.equal(coerced.narrative_perspective, 'first_person');
  for (const mode of ['biography', 'autobiography', 'first_person_guide']) {
    const pages = [0, 1, 2].map(page => Array.from(internals.promptChoices({ project_mode: mode }, page)));
    assert.ok(pages.every(choices => choices.length === 3));
    assert.equal(new Set(pages.flat()).size, 9);
    assert.deepEqual(Array.from(internals.promptChoices({ project_mode: mode }, 3)), pages[0]);
  }
});

test('linked interview material edit and delete update the canonical session answer', () => {
  const internals = loadWorkspaceInternals();
  const state = internals.defaultBiographyState();
  internals.appendInterviewAnswerToState(state, {
    session_id: 'session-1',
    material_id: 'material-1',
    question: 'Mistä kaikki alkoi?',
    answer: 'Vanhasta asemarakennuksesta.',
    created_at: '2026-08-29T10:00:00Z',
  });
  assert.equal(state.interview_sessions[0].answers.length, 1);
  assert.equal(state.materials.length, 1);
  assert.match(state.answers, /asemarakennuksesta/);

  internals.updateMaterialInState(state, 'material-1', {
    title: 'Alku',
    kind: 'free_text',
    text: 'Vanhasta punaisesta asemarakennuksesta.',
  });
  assert.equal(state.materials[0].kind, 'interview_answer', 'linked material keeps its interview kind');
  assert.equal(state.interview_sessions[0].answers[0].text, 'Vanhasta punaisesta asemarakennuksesta.');
  assert.match(state.answers, /punaisesta/);

  internals.removeMaterialFromState(state, 'material-1');
  assert.equal(state.materials.length, 0);
  assert.equal(state.interview_sessions[0].answers.length, 0);
  assert.equal(state.answers, '');
  for (const id of ['btn-cancel-material-edit', 'save-material-label']) expectId(id);
  assert.match(html, /id="edit-note"><i class="ph ph-pencil-simple"/);
});

test('material deletion confirms linked-answer impact and restores keyboard focus', () => {
  const removeStart = js.indexOf('function removeMaterial(id, trigger)');
  const removeEnd = js.indexOf('function startMaterialEdit', removeStart);
  const removeBlock = js.slice(removeStart, removeEnd);
  assert.match(removeBlock, /window\.confirm\(/);
  assert.match(removeBlock, /Myös haastatteluistunnon vastaus poistetaan/);
  assert.ok(removeBlock.indexOf('window.confirm(') < removeBlock.indexOf('removeMaterialFromState('), 'confirmation precedes deletion');
  assert.ok(removeBlock.indexOf('removeMaterialFromState(') < removeBlock.indexOf('await saveNow()'), 'material reference is removed before state persistence');
  assert.ok(removeBlock.indexOf('await saveNow()') < removeBlock.indexOf('deleteBiographyAssetWithRetry('), 'asset is deleted only after the state PATCH succeeds');
  assert.match(removeBlock, /biographyState\s*=\s*serverState\s*\|\|\s*previousState/);
  assert.match(removeBlock, /trigger\?\.focus\(\)/);
  assert.match(removeBlock, /nextAction\.focus\(\)/);
  assert.match(removeBlock, /\$\(["']first-note["']\)\.focus\(\)/);
  assert.match(js, /removeMaterial\(selectedNoteId,\s*event\.currentTarget\)/);
  assert.match(js, /dataset\.materialAssetPreview\s*=\s*String\(selected\.asset_id\)/);
  assert.match(js, /apiFetchBiographyAsset\(projectId,\s*assetId/);
  assert.match(js, /window\.URL\?\.revokeObjectURL\?\.\(url\)/);
});

test('pending image assets are cleaned on cancel and pagehide with visible cancel errors', () => {
  const abandonStart = js.indexOf('async function performPendingMaterialAbandon');
  const disposeStart = js.indexOf('function disposeMaterialImports', abandonStart);
  const abandon = js.slice(abandonStart, disposeStart);
  assert.match(abandon, /await\s+apiDeleteBiographyAsset\(entry\.projectId,\s*entry\.material\.asset_id\)/);
  assert.match(abandon, /failed\.push\(\{\s*entry,\s*error\s*\}\)/);
  assert.match(abandon, /Tuontia ei voitu perua kokonaan/);
  const disposalStart = js.indexOf('async function performMaterialImportDisposal', disposeStart);
  const disposalEnd = js.indexOf('async function waitForActiveMaterialImportConfirmation', disposalStart);
  const dispose = js.slice(disposalStart, disposalEnd);
  assert.match(dispose, /keepalive:\s*true/);
  assert.match(dispose, /await\s+Promise\.all\(/, 'page cleanup lock remains held until its DELETE requests settle');
  assert.match(js, /window\.addEventListener\(["']pagehide["'],\s*\(\)\s*=>\s*\{\s*disposeMaterialImports\(\)\.catch\(\(\)\s*=>\s*null\);\s*\}\)/);
});

test('material confirmation and cleanup use one first-operation-wins lock without a circular wait', () => {
  assert.match(js, /let\s+activeMaterialImportConfirmation\s*=\s*null/);
  assert.match(js, /let\s+activeMaterialImportCleanup\s*=\s*null/);

  const cleanupQueueStart = js.indexOf('function queueMaterialImportCleanup');
  const discardStart = js.indexOf('function discardPendingMaterialImport', cleanupQueueStart);
  const cleanupQueue = js.slice(cleanupQueueStart, discardStart);
  assert.match(cleanupQueue, /const\s+previousCleanup\s*=\s*activeMaterialImportCleanup/);
  assert.match(cleanupQueue, /const\s+confirmationToWaitFor\s*=\s*activeMaterialImportConfirmation/);
  assert.ok(
    cleanupQueue.indexOf('waitForMaterialImportOperation(previousCleanup)')
      < cleanupQueue.indexOf('waitForMaterialImportOperation(confirmationToWaitFor)'),
    'cleanup queue preserves earlier cleanup order before the confirmation snapshot',
  );
  assert.match(cleanupQueue, /activeMaterialImportCleanup\s*=\s*cleanup/);
  assert.match(cleanupQueue, /cleanup\.finally\(/);
  assert.match(cleanupQueue, /activeMaterialImportCleanup\s*=\s*null/);

  const discardEnd = js.indexOf('async function performPendingMaterialDiscard', discardStart);
  assert.match(js.slice(discardStart, discardEnd), /queueMaterialImportCleanup\(/);
  const abandonStart = js.indexOf('function abandonPendingMaterialImports');
  const abandonEnd = js.indexOf('async function performPendingMaterialAbandon', abandonStart);
  assert.match(js.slice(abandonStart, abandonEnd), /queueMaterialImportCleanup\(/);
  const disposeStart = js.indexOf('function disposeMaterialImports');
  const disposeEnd = js.indexOf('async function performMaterialImportDisposal', disposeStart);
  assert.match(js.slice(disposeStart, disposeEnd), /queueMaterialImportCleanup\(/);

  const wrapperStart = js.indexOf('function confirmPendingMaterialImports');
  const helperStart = js.indexOf('function unreferencedPendingAssetEntries', wrapperStart);
  const performStart = js.indexOf('async function performMaterialImportConfirmation', helperStart);
  const wrapper = js.slice(wrapperStart, performStart);
  assert.match(wrapper, /if\s*\(activeMaterialImportConfirmation\)\s*return\s+activeMaterialImportConfirmation/);
  assert.match(wrapper, /const\s+cleanupToWaitFor\s*=\s*activeMaterialImportCleanup/);
  assert.match(wrapper, /performMaterialImportConfirmation\(cleanupToWaitFor\)/);
  assert.match(wrapper, /activeMaterialImportConfirmation\s*=\s*confirmation/);
  assert.match(wrapper, /confirmation\.finally\(/);
  assert.match(wrapper, /activeMaterialImportConfirmation\s*=\s*null/);

  const performEnd = js.indexOf('function render()', performStart);
  const perform = js.slice(performStart, performEnd);
  assert.ok(
    perform.indexOf('await waitForMaterialImportOperation(cleanupToWaitFor)')
      < perform.indexOf('await flushPendingSave()'),
    'confirmation waits for the cleanup snapshot before reading or adopting pending assets',
  );

  const assertWaitBefore = (block, cleanup, label) => {
    const waitIndex = block.indexOf('await waitForActiveMaterialImportConfirmation()');
    const cleanupIndex = block.indexOf(cleanup);
    assert.ok(waitIndex >= 0, `${label} must await the active confirmation`);
    assert.ok(cleanupIndex > waitIndex, `${label} must wait before ${cleanup}`);
  };

  const selectStart = js.indexOf('async function selectProject');
  const createStart = js.indexOf('async function createProject', selectStart);
  const statusStart = js.indexOf('function setSaveStatus', createStart);
  assertWaitBefore(js.slice(selectStart, createStart), 'await abandonPendingMaterialImports()', 'project selection');
  assertWaitBefore(js.slice(createStart, statusStart), 'await abandonPendingMaterialImports()', 'project creation');

  const deactivateStart = js.indexOf('deactivate: async () =>');
  const deactivateEnd = js.indexOf('setTheme,', deactivateStart);
  assertWaitBefore(js.slice(deactivateStart, deactivateEnd), 'await abandonPendingMaterialImports({ silent: true })', 'module deactivation');

  assert.ok(
    perform.indexOf('await saveNow()') < perform.lastIndexOf('pendingMaterialImports = []'),
    'successful state persistence transfers asset ownership before the pending queue is cleared',
  );
  assert.match(js, /const\s+importLocked\s*=\s*uploadActive\s*\|\|\s*confirmationLocked\s*\|\|\s*cleanupLocked/);
});

test('ambiguous import save failures defer asset deletion until reconciliation proves it safe', () => {
  const internals = loadWorkspaceInternals();
  const entries = [
    { id: 'referenced', material: { asset_id: 11 } },
    { id: 'orphan', material: { asset_id: 22 } },
    { id: 'document', material: { asset_id: 0 } },
  ];
  assert.deepEqual(
    Array.from(internals.unreferencedPendingAssetEntries(entries, null), (entry) => entry.id),
    [],
    'unknown reconciliation never authorizes a DELETE',
  );
  const reconciled = internals.normalizeBiographyState({
    materials: [{ id: 'saved-image', kind: 'photo_note', title: 'Kuva', asset_id: 11 }],
  });
  assert.deepEqual(
    Array.from(internals.unreferencedPendingAssetEntries(entries, reconciled), (entry) => entry.id),
    ['orphan'],
    'a successful GET only authorizes assets absent from canonical state',
  );

  const performStart = js.indexOf('async function performMaterialImportConfirmation');
  const performEnd = js.indexOf('function render()', performStart);
  const perform = js.slice(performStart, performEnd);
  assert.match(js, /apiGetState[\s\S]*?cache:\s*["']no-store["']/);
  assert.match(perform, /if\s*\(!response\?\.data\s*\|\|\s*typeof\s+response\.data\s*!==\s*["']object["']\)\s*throw/);
  assert.match(perform, /const\s+cleanupEntries\s*=\s*unreferencedPendingAssetEntries\(entries,\s*serverState\)/);
  assert.match(perform, /reconciliationUnknown\s*=\s*!serverState/);
  assert.match(perform, /Lähdekuvia ei poistettu varmuuden vuoksi/);
  assert.match(perform, /24 tunnin jälkeen/);
  assert.match(perform, /Tallennuksen tila epäselvä/);
  assert.doesNotMatch(perform, /entry\.material\.asset_id\s*&&\s*!serverState\?\./);
});

test('legacy answers migrate once into visible linked interview data and stay deleted', () => {
  const internals = loadWorkspaceInternals();
  const loaded = internals.normalizeLoadedBiographyState({
    answers: 'Lapsuuden koti oli punainen puutalo.',
    updated_at: '2026-08-29T09:00:00Z',
  });
  assert.equal(loaded.migrated, true);
  assert.equal(loaded.state.interview_sessions.length, 1);
  assert.equal(loaded.state.interview_sessions[0].id, 'legacy_answers_session_v1');
  assert.equal(loaded.state.interview_sessions[0].answers.length, 1);
  assert.equal(loaded.state.materials.length, 1);
  assert.equal(loaded.state.materials[0].id, 'legacy_answers_material_v1');
  assert.equal(loaded.state.materials[0].session_id, 'legacy_answers_session_v1');

  assert.equal(internals.migrateLegacyAnswersToInterview(loaded.state, 'Lapsuuden koti oli punainen puutalo.'), false);
  internals.updateMaterialInState(loaded.state, 'legacy_answers_material_v1', {
    title: 'Lapsuuden koti',
    kind: 'free_text',
    text: 'Lapsuuden koti oli punainen hirsitalo.',
  });
  assert.equal(loaded.state.interview_sessions[0].answers[0].text, 'Lapsuuden koti oli punainen hirsitalo.');
  internals.removeMaterialFromState(loaded.state, 'legacy_answers_material_v1');
  assert.equal(loaded.state.materials.length, 0);
  assert.equal(loaded.state.interview_sessions[0].answers.length, 0);
  assert.equal(loaded.state.answers, '');
  assert.equal(internals.migrateLegacyAnswersToInterview(loaded.state, 'Palvelimen vanha arvo'), false, 'sentinel prevents resurrection after deletion');

  const existingMaterial = internals.normalizeBiographyState({
    materials: [{ id: 'old-note', title: 'Vanha vastaus', kind: 'free_text', text: 'Jo näkyvä vastaus' }],
  });
  assert.equal(internals.migrateLegacyAnswersToInterview(existingMaterial, 'Jo näkyvä vastaus'), true);
  assert.equal(existingMaterial.materials.length, 1, 'existing visible material is reused');
  assert.equal(existingMaterial.materials[0].id, 'old-note');

  const modern = internals.normalizeBiographyState({
    answers: 'Kysymys\nVastaus',
    interview_sessions: [{ id: 'modern', questions: ['Kysymys'], answers: [{ question: 'Kysymys', text: 'Vastaus' }] }],
  });
  assert.equal(internals.migrateLegacyAnswersToInterview(modern), false, 'modern compatibility mirror is not duplicated');
});

test('chapter helpers support multiple ordered chapters and the UI exposes reorder controls', () => {
  const internals = loadWorkspaceInternals();
  const state = internals.defaultBiographyState();
  internals.appendChapterToState(state, 'chapter-1', '2026-08-29T10:00:00Z');
  internals.appendChapterToState(state, 'chapter-2', '2026-08-29T10:01:00Z');
  assert.deepEqual(Array.from(state.chapters, chapter => chapter.order), [0, 1]);
  internals.removeChapterFromState(state, 'chapter-1');
  assert.equal(state.chapters[0].id, 'chapter-2');
  assert.equal(state.chapters[0].order, 0);
  for (const id of ['move-chapter-up', 'move-chapter-down', 'delete-chapter']) expectId(id);
  assert.match(js, /function\s+moveChapter\(direction\)/);
  assert.match(js, /window\.confirm\(/);
});

test('serialized save queue never starts a newer write before the prior write completes', async () => {
  const internals = loadWorkspaceInternals();
  const queue = internals.createSerialQueue();
  const order = [];
  let releaseFirst;
  const firstGate = new Promise(resolve => { releaseFirst = resolve; });
  const first = queue.add(async () => {
    order.push('first:start');
    await firstGate;
    order.push('first:end');
  });
  const second = queue.add(async () => { order.push('second'); });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(order, ['first:start']);
  releaseFirst();
  await Promise.all([first, second, queue.flush()]);
  assert.deepEqual(order, ['first:start', 'first:end', 'second']);

  assert.match(js, /serializedSaveQueue\.add\(/);
  assert.match(js, /await\s+flushPendingSave\(\)/);
  assert.match(js, /visibilitychange/);
  assert.match(js, /pagehide["'],\s*\(\)\s*=>\s*\{\s*flushPendingSave\(\{\s*bestEffort:\s*true,\s*keepalive:\s*true/);
  assert.match(js, /byteLength\s*<=\s*60\s*\*\s*1024/);
});

test('beforeunload warns only while a local save is dirty, queued or in flight', () => {
  const internals = loadWorkspaceInternals();
  assert.equal(internals.shouldWarnBeforeUnload(false, null, 0), false);
  assert.equal(internals.shouldWarnBeforeUnload(true, null, 0), true);
  assert.equal(internals.shouldWarnBeforeUnload(false, 42, 0), true);
  assert.equal(internals.shouldWarnBeforeUnload(false, null, 1), true);
  assert.match(js, /window\.addEventListener\(["']beforeunload["'],\s*handleBeforeUnload\)/);
  assert.match(js, /event\.preventDefault\(\)/);
  assert.match(js, /event\.returnValue\s*=\s*["']["']/);
  assert.match(js, /pendingSaveCount\s*\+=\s*1/);
  assert.match(js, /pendingSaveCount\s*=\s*Math\.max\(0,\s*pendingSaveCount\s*-\s*1\)/);
});

test('interview draft and cross-project guards keep prose in the correct project', () => {
  const internals = loadWorkspaceInternals();
  const state = internals.normalizeBiographyState({ interview_draft: 'Keskeneräinen mutta tärkeä muisto.' });
  assert.equal(state.interview_draft, 'Keskeneräinen mutta tärkeä muisto.');
  assert.match(js, /biographyState\.interview_draft\s*=\s*event\.currentTarget\.value/);
  assert.match(js, /String\(projectId\)\s*!==\s*String\(getProjectId\(\)\)/);
  assert.match(js, /actionProjectId\s*!==\s*String\(getProjectId\(\)\s*\|\|\s*["']["']\)/);
  assert.match(js, /\["requesting",\s*"recording",\s*"preparing",\s*"transcribing"\]/);
  const selectStart = js.indexOf('async function selectProject');
  const selectEnd = js.indexOf('async function createProject', selectStart);
  const selectBlock = js.slice(selectStart, selectEnd);
  assert.ok(selectBlock.indexOf('apiGetState(String(project.id))') < selectBlock.indexOf('rememberProject(project'), 'new project state loads before active id changes');
});

test('chapter generation trusts canonical response chapters without fallback result overwrite', () => {
  const runStart = js.indexOf('async function runAction');
  const runEnd = js.indexOf('function openProjectMenu', runStart);
  const runBlock = js.slice(runStart, runEnd);
  assert.doesNotMatch(runBlock, /updated\.(?:plan|draft)\s*=\s*biographyState/);
  assert.doesNotMatch(runBlock, /updated\.(?:plan|draft)\s*=\s*response\.result/);
  assert.match(runBlock, /const\s+responseState\s*=\s*normalizeBiographyState\(response\.data\)/);
  assert.match(runBlock, /mergeActionResponseState\(biographyState,\s*requestState,\s*responseState,\s*action,\s*payload\)/);
});

test('AI response merge preserves live edits and applies only action-owned fields', () => {
  const internals = loadWorkspaceInternals();
  const makeState = value => internals.normalizeBiographyState(JSON.parse(JSON.stringify(value)));

  const analysisRequest = makeState({
    project_mode: 'autobiography',
    active_step: 'outline',
    purpose: 'Alkuperäinen tarkoitus',
    themes: '',
    timeline: '',
  });
  const analysisLive = makeState(analysisRequest);
  analysisLive.purpose = 'Käyttäjän uusi tarkoitus';
  analysisLive.themes = 'Käyttäjän oma teema';
  const analysisResponse = makeState({
    ...analysisRequest,
    purpose: 'Alkuperäinen tarkoitus',
    analysis_report: 'Valmis analyysi',
    themes: 'Tekoälyn teema',
    timeline: 'Tekoälyn aikajana',
    active_step: 'materials',
    last_generated_action: 'analyze',
  });
  internals.mergeActionResponseState(analysisLive, analysisRequest, analysisResponse, 'analyze', {});
  assert.equal(analysisLive.purpose, 'Käyttäjän uusi tarkoitus', 'non-owned purpose remains live');
  assert.equal(analysisLive.themes, 'Käyttäjän oma teema', 'edited owned field remains live');
  assert.equal(analysisLive.timeline, 'Tekoälyn aikajana', 'unchanged owned field receives result');
  assert.equal(analysisLive.analysis_report, 'Valmis analyysi');
  assert.equal(analysisLive.active_step, 'outline', 'user navigation remains live');

  const outlineRequest = makeState({ outline: 'Vanha rakenne' });
  const outlineLive = makeState(outlineRequest);
  outlineLive.outline = 'Kirjoitin rakenteen uusiksi ajon aikana';
  const outlineResponse = makeState({ ...outlineRequest, outline: 'Tekoälyn rakenne' });
  internals.mergeActionResponseState(outlineLive, outlineRequest, outlineResponse, 'outline', {});
  assert.equal(outlineLive.outline, 'Kirjoitin rakenteen uusiksi ajon aikana');

  const chapterRequest = makeState({
    chapters: [
      { id: 'one', title: 'Ensimmäinen', focus: 'Alku', plan: 'Vanha suunnitelma', draft: '', order: 0 },
      { id: 'two', title: 'Toinen', focus: '', plan: '', draft: 'Toisen teksti', order: 1 },
    ],
    chapter_plan: 'Vanha suunnitelma',
  });
  const chapterLive = makeState(chapterRequest);
  chapterLive.chapters[0].title = 'Käyttäjän uusi otsikko';
  chapterLive.chapters[1].draft = 'Toisen luvun uusi teksti';
  const chapterResponse = makeState(chapterRequest);
  chapterResponse.chapters[0].plan = 'Tekoälyn suunnitelma';
  chapterResponse.chapters[0].status = 'planned';
  chapterResponse.chapter_plan = 'Tekoälyn suunnitelma';
  internals.mergeActionResponseState(
    chapterLive,
    chapterRequest,
    chapterResponse,
    'chapter_plan',
    { chapter_id: 'one' },
  );
  assert.equal(chapterLive.chapters[0].plan, 'Tekoälyn suunnitelma');
  assert.equal(chapterLive.chapters[0].title, 'Käyttäjän uusi otsikko');
  assert.equal(chapterLive.chapters[1].draft, 'Toisen luvun uusi teksti');

  const editedPlanLive = makeState(chapterRequest);
  editedPlanLive.chapters[0].plan = 'Käyttäjän suunnitelma';
  editedPlanLive.chapter_plan = 'Käyttäjän suunnitelma';
  internals.mergeActionResponseState(
    editedPlanLive,
    chapterRequest,
    chapterResponse,
    'chapter_plan',
    { chapter_id: 'one' },
  );
  assert.equal(editedPlanLive.chapters[0].plan, 'Käyttäjän suunnitelma');
  assert.equal(editedPlanLive.chapter_plan, 'Käyttäjän suunnitelma');

  const draftRequest = makeState({
    chapters: [{ id: 'draft-one', title: 'Luonnos', focus: '', plan: 'Suunnitelma', draft: '', status: 'planned', order: 0 }],
    draft: '',
  });
  const draftLive = makeState(draftRequest);
  draftLive.chapters[0].title = 'Käyttäjän vaihtama otsikko';
  draftLive.chapters[0].updated_at = 'käyttäjän-aikaleima';
  const draftResponse = makeState(draftRequest);
  draftResponse.chapters[0].draft = 'Tekoälyn lukuluonnos';
  draftResponse.chapters[0].status = 'draft';
  draftResponse.chapters[0].updated_at = 'palvelimen-aikaleima';
  draftResponse.draft = 'Tekoälyn lukuluonnos';
  internals.mergeActionResponseState(
    draftLive,
    draftRequest,
    draftResponse,
    'draft',
    { chapter_id: 'draft-one' },
  );
  assert.equal(draftLive.chapters[0].draft, 'Tekoälyn lukuluonnos');
  assert.equal(draftLive.chapters[0].title, 'Käyttäjän vaihtama otsikko');
  assert.equal(draftLive.chapters[0].updated_at, 'käyttäjän-aikaleima');

  const editedDraftLive = makeState(draftRequest);
  editedDraftLive.chapters[0].draft = 'Käyttäjän oma luonnos';
  editedDraftLive.draft = 'Käyttäjän oma luonnos';
  internals.mergeActionResponseState(
    editedDraftLive,
    draftRequest,
    draftResponse,
    'draft',
    { chapter_id: 'draft-one' },
  );
  assert.equal(editedDraftLive.chapters[0].draft, 'Käyttäjän oma luonnos');

  const questionsRequest = makeState({ questions: '' });
  const questionsResponse = makeState({ questions: 'Tekoälyn tarkentavat kysymykset' });
  const questionsLive = makeState(questionsRequest);
  internals.mergeActionResponseState(questionsLive, questionsRequest, questionsResponse, 'questions', {});
  assert.equal(questionsLive.questions, 'Tekoälyn tarkentavat kysymykset');
  const editedQuestionsLive = makeState(questionsRequest);
  editedQuestionsLive.questions = 'Käyttäjän omat kysymykset';
  internals.mergeActionResponseState(editedQuestionsLive, questionsRequest, questionsResponse, 'questions', {});
  assert.equal(editedQuestionsLive.questions, 'Käyttäjän omat kysymykset');

  const compileRequest = makeState({ manuscript_title: 'Minun tarinani', manuscript_text: 'Vanha teksti' });
  const compileLive = makeState(compileRequest);
  compileLive.manuscript_text = 'Käyttäjän ajon aikana kirjoittama teksti';
  compileLive.manuscript_title = 'Uusi nimi';
  const compileResponse = makeState({ manuscript_title: 'Minun tarinani', manuscript_text: 'Koostettu teksti' });
  internals.mergeActionResponseState(
    compileLive,
    compileRequest,
    compileResponse,
    'compile_manuscript',
    {},
  );
  assert.equal(compileLive.manuscript_text, 'Käyttäjän ajon aikana kirjoittama teksti');
  assert.equal(compileLive.manuscript_title, 'Uusi nimi');
});

test('interview response merge adds the follow-up without replacing newer answers', () => {
  const internals = loadWorkspaceInternals();
  const request = internals.normalizeBiographyState({
    current_question: 'Ensimmäinen kysymys?',
    interview_sessions: [{
      id: 'session-1',
      title: 'Istunto 1',
      questions: ['Ensimmäinen kysymys?'],
      answers: [{ question: 'Ensimmäinen kysymys?', text: 'Ensimmäinen vastaus', created_at: '2026-01-01' }],
    }],
  });
  const live = internals.normalizeBiographyState(JSON.parse(JSON.stringify(request)));
  live.interview_sessions[0].answers.push({
    question: 'Oma lisäkysymys?',
    text: 'Ajon aikana lisätty vastaus',
    created_at: '2026-01-02',
  });
  const response = internals.normalizeBiographyState(JSON.parse(JSON.stringify(request)));
  response.current_question = 'Seuraava kysymys?';
  response.interview_sessions[0].questions.push('Seuraava kysymys?');
  internals.mergeActionResponseState(
    live,
    request,
    response,
    'interview_followup',
    { session_id: 'session-1' },
  );
  assert.equal(live.current_question, 'Seuraava kysymys?');
  assert.equal(live.interview_sessions[0].answers.length, 2);
  assert.equal(live.interview_sessions[0].answers[1].text, 'Ajon aikana lisätty vastaus');
  assert.ok(live.interview_sessions[0].questions.includes('Seuraava kysymys?'));

  const changedQuestionLive = internals.normalizeBiographyState(JSON.parse(JSON.stringify(request)));
  changedQuestionLive.current_question = 'Käyttäjän valitsema kysymys?';
  internals.mergeActionResponseState(
    changedQuestionLive,
    request,
    response,
    'interview_followup',
    { session_id: 'session-1' },
  );
  assert.equal(changedQuestionLive.current_question, 'Käyttäjän valitsema kysymys?');
});

test('runAction snapshots revisions and queues the merged state when live edits occur', () => {
  const runStart = js.indexOf('async function runAction');
  const runEnd = js.indexOf('function openProjectMenu', runStart);
  const runBlock = js.slice(runStart, runEnd);
  assert.match(runBlock, /const\s+requestRevision\s*=\s*stateRevision/);
  assert.match(runBlock, /const\s+requestState\s*=\s*JSON\.parse\(JSON\.stringify\(biographyState\)\)/);
  assert.match(runBlock, /const\s+liveChangedDuringRun\s*=\s*stateRevision\s*!==\s*requestRevision/);
  assert.match(runBlock, /\|\|\s*!stateValuesEqual\(biographyState,\s*requestState\)/);
  assert.match(runBlock, /if\s*\(liveChangedDuringRun\)\s*\{\s*scheduleSave\(\)/);
  assert.doesNotMatch(runBlock, /biographyState\s*=\s*normalizeBiographyState\(response\.data\)/);
  assert.ok(runBlock.indexOf('await flushPendingSave()') < runBlock.indexOf('const requestRevision = stateRevision'), 'pending PATCH writes finish before the action snapshot');
  assert.ok(runBlock.indexOf('await flushPendingSave()') < runBlock.indexOf('apiRunAction(action'), 'pending PATCH writes finish before the action request');
});

test('settings remain staged until save and forced-first-person modes lock perspective', () => {
  assert.match(js, /function\s+saveSettings\(\)/);
  assert.match(js, /document\.querySelectorAll\(["']\[data-state-field\]["']\)/);
  assert.match(js, /perspective\.disabled\s*=\s*visibleProjectMode\(biographyState\)\s*!==\s*["']life_story["']/);
  assert.match(js, /applyNarrativePerspective\(biographyState,\s*selectedPerspective\)/);
  assert.match(js, /else\s+biographyState\.narrative_perspective\s*=\s*["']first_person["']/);
  const bindStart = js.indexOf('function bindEvents');
  const bindEnd = js.indexOf('window.ElamakertaModule', bindStart);
  assert.doesNotMatch(js.slice(bindStart, bindEnd), /data-state-field[\s\S]{0,200}addEventListener\(["']input/);
});


test('notebook searches the complete text, questions and filenames and sorts by saved date', () => {
  const { notebookMatches } = loadWorkspaceInternals();
  const notes = [
    { id: 'a', title: 'Syksy', text: 'x'.repeat(400) + ' järven rannalla', created_at: '2025-06-01' },
    { id: 'b', title: 'Rannalla', source_filename: 'Mökki.pdf', question: 'Kenen kanssa kuljit?', created_at: '2026-06-01' },
  ];
  const ids = query => Array.from(notebookMatches(notes, query), note => note.id);
  assert.deepEqual(ids(''), ['b', 'a']);
  assert.deepEqual(ids(' SYKSY  JÄRVEN '), ['a']);
  assert.deepEqual(ids('MÖKKI kuljit'), ['b']);
  assert.deepEqual(ids('järven mökki'), []);
  assert.equal(notes[0].id, 'a');
});

test('older sessions appear in the notebook once and remain editable through the existing session', () => {
  const { normalizeLoadedBiographyState, updateMaterialInState } = loadWorkspaceInternals();
  const { state, migrated } = normalizeLoadedBiographyState({
    interview_sessions: [{ id: 's1', answers: [{ question: 'Missä?', text: 'Kotona.', created_at: '2026-01-01' }] }],
  });
  assert.equal(migrated, true);
  assert.equal(state.materials.length, 1);
  assert.equal(state.materials[0].created_at, '2026-01-01');
  updateMaterialInState(state, state.materials[0].id, { title: 'Koti', text: 'Mummolassa.' });
  assert.equal(state.interview_sessions[0].answers[0].text, 'Mummolassa.');
  const reload = normalizeLoadedBiographyState(state);
  assert.equal(reload.migrated, false);
  assert.equal(reload.state.materials.length, 1);
  assert.equal(reload.state.materials[0].title, 'Koti');
});
