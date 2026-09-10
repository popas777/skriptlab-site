const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.join(__dirname, '..');
const repositoryRoot = path.join(appRoot, '..');
const indexHtml = fs.readFileSync(path.join(appRoot, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(appRoot, 'app.js'), 'utf8');
const shellCss = fs.readFileSync(path.join(appRoot, 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(appRoot, 'kaannoksen-viimeistely.html'), 'utf8');
const js = fs.readFileSync(path.join(appRoot, 'kaannoksen-viimeistely.js'), 'utf8');
const css = fs.readFileSync(path.join(appRoot, 'kaannoksen-viimeistely.css'), 'utf8');
const backendPath = path.join(repositoryRoot, 'backend', 'main.py');
const backendMain = fs.existsSync(backendPath) ? fs.readFileSync(backendPath, 'utf8') : null;

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `Missing source marker: ${startMarker}`);
  assert.ok(end > start, `Missing source marker after ${startMarker}: ${endMarker}`);
  return source.slice(start, end);
}

function expectElement(id, tagName) {
  assert.match(
    html,
    new RegExp(`<${tagName}\\b(?=[^>]*\\bid=["']${id}["'])[^>]*>`, 'i'),
    `Missing <${tagName}>#${id}`,
  );
}

test('translator modules use the requested labels and workflow order', () => {
  const nav = sourceBetween(indexHtml, '<ul id="nav-menu">', '</ul>');
  const entries = Array.from(nav.matchAll(
    /<li\b[^>]*data-view=["']([^"']+)["'][^>]*>([^<]+)<\/li>/g,
  )).map((match) => ({ view: match[1], label: match[2].trim() }));
  const translatorViews = new Set([
    'view-kirjani',
    'view-analyysi',
    'view-kaannokset',
    'view-kaannostyotila',
    'view-oikoluku',
    'view-kaannoksen-viimeistely',
  ]);

  assert.deepEqual(
    entries.filter((entry) => translatorViews.has(entry.view)),
    [
      { view: 'view-kirjani', label: 'Tekstini' },
      { view: 'view-analyysi', label: 'Analyysi' },
      { view: 'view-kaannokset', label: 'Räätälöidyt käännökset' },
      { view: 'view-kaannostyotila', label: 'Automaattikäännökset' },
      { view: 'view-oikoluku', label: 'Tekstin parantelu' },
      { view: 'view-kaannoksen-viimeistely', label: 'Tekstin viimeistely ja oikoluku' },
    ],
  );

  const mappings = sourceBetween(appJs, 'const accessModuleViews = {', 'function customAccessViews()');
  assert.match(mappings, /proofread:\s*\[['"]view-oikoluku['"]\]/);
  assert.match(mappings, /translations:\s*\[['"]view-kaannokset['"]\]/);
  assert.match(mappings, /translation_workspace:\s*\[['"]view-kaannostyotila['"]\]/);
  assert.match(mappings, /translation_finishing:\s*\[['"]view-kaannoksen-viimeistely['"]\]/);
  assert.doesNotMatch(mappings, /translations:\s*\[[^\]]*view-oikoluku/);
  assert.doesNotMatch(mappings, /translation_workspace:\s*\[[^\]]*view-oikoluku/);
});

test('translation finishing mounts as a dedicated accessible iframe module', () => {
  assert.match(
    indexHtml,
    /id=["']view-kaannoksen-viimeistely["'][\s\S]*?<iframe\b(?=[^>]*id=["']translation-finishing-frame["'])(?=[^>]*src=["']kaannoksen-viimeistely\.html\?v=\d+["'])(?=[^>]*title=["']Tekstin viimeistely ja oikoluku["'])/,
  );
  assert.match(appJs, /function\s+refreshTranslationFinishingFrame\(\)/);
  assert.match(appJs, /updateEmbeddedModuleFrame\(frame, ['"]kaannoksen-viimeistely\.html['"], params\)/);
  assert.match(appJs, /type:\s*['"]skriptlab:translation-finishing-opened['"]/);
  assert.match(appJs, /viewId === ['"]view-kaannoksen-viimeistely['"][\s\S]{0,120}?refreshTranslationFinishingFrame\(\)/);
  assert.match(appJs, /skipTranslationFinishingFrameRefresh:\s*true/);

  assert.match(html, /<title>Tekstin viimeistely ja oikoluku · SkriptLab<\/title>/);
  assert.match(html, /<h1 id=["']kf-title["']>Tekstin viimeistely ja oikoluku<\/h1>/);
  expectElement('kf-text-project-select', 'select');
  expectElement('kf-project-select', 'select');
  expectElement('kf-translation-select', 'select');
  expectElement('kf-run', 'button');
  expectElement('kf-run-unit', 'button');
  expectElement('kf-keyboard-selection-text', 'textarea');
  expectElement('kf-use-keyboard-selection', 'button');
  expectElement('kf-suggestion-list', 'div');
  expectElement('kf-accept-all', 'button');
  expectElement('kf-download-final', 'button');
  expectElement('kf-download-bilingual', 'button');
  expectElement('kf-download-bilingual-docx', 'button');
  assert.match(html, /id=["']kf-status["'][^>]*role=["']status["'][^>]*aria-live=["']polite["']/);
  assert.match(html, /id=["']kf-summary["'][^>]*aria-live=["']polite["']/);
  assert.match(html, /id=["']kf-unit-progressbar["'][^>]*role=["']progressbar["'][^>]*aria-valuemin=["']0["']/);
  assert.match(html, /id=["']kf-text-reader["'][^>]*aria-describedby=["']kf-selection-help["']/);
  assert.match(html, /id=["']kf-target-reader["'][^>]*aria-describedby=["']kf-selection-help["']/);
  assert.match(html, /Tarkista valittu kohta/);
  assert.match(html, /Tarkista koko luku/);
  assert.match(html, /Lataa lopullinen \(\.md\)/);
  assert.match(html, /Lataa bilingual \(\.md\)/);
  assert.match(html, /Lataa 2-palstainen bilingual \(\.docx\)/);
  assert.match(html, /tekstin-parantelu\.css\?v=2/);
  assert.match(html, /kaannoksen-viimeistely\.css\?v=7/);
  assert.match(html, /kaannoksen-viimeistely\.js\?v=9/);

  assert.match(shellCss, /#view-oikoluku,\s*#view-kaannoksen-viimeistely\s*\{[\s\S]*?min-height:\s*0/);
  assert.match(css, /\.kf-workspace\s*\{[\s\S]*?grid-template-columns:/);
  assert.match(css, /\.kf-download-actions\s*\{[\s\S]*?flex-wrap:\s*wrap/);
  assert.match(css, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media\s*\(max-height:\s*770px\)\s*and\s*\(min-width:\s*1051px\)[\s\S]*?body\s*\{[\s\S]*?overflow:\s*auto/);
  assert.doesNotThrow(() => new vm.Script(js, { filename: 'kaannoksen-viimeistely.js' }));
});

test('finishing workspace has two persisted keyboard-accessible tabs and separate panels', () => {
  assert.match(html, /role=["']tablist["'][^>]*aria-label=["']Viimeistelyn ja oikoluvun tyyppi["']/);
  assert.match(html, /id=["']kf-tab-text["'][\s\S]*?role=["']tab["'][\s\S]*?aria-selected=["']true["'][\s\S]*?aria-controls=["']kf-text-panel["'][\s\S]*?data-kf-mode=["']text["'][\s\S]*?>Tekstin viimeistely ja oikoluku<\/button>/);
  assert.match(html, /id=["']kf-tab-translation["'][\s\S]*?role=["']tab["'][\s\S]*?aria-controls=["']kf-translation-panel["'][\s\S]*?data-kf-mode=["']translation["'][\s\S]*?>Käännöksen viimeistely ja oikoluku<\/button>/);
  assert.match(html, /id=["']kf-text-panel["'][^>]*role=["']tabpanel["'][^>]*aria-labelledby=["']kf-tab-text["']/);
  assert.match(html, /id=["']kf-translation-panel["'][^>]*role=["']tabpanel["'][^>]*aria-labelledby=["']kf-tab-translation["'][^>]*hidden/);
  assert.match(html, /id=["']kf-text-toolbar["']/);
  assert.match(html, /id=["']kf-translation-toolbar["'][^>]*hidden/);

  assert.match(js, /const MODE_KEY = ["']skriptlab_text_translation_finishing_mode["']/);
  assert.match(js, /mode:\s*localStorage\.getItem\(MODE_KEY\) === ["']translation["'] \? ["']translation["'] : ["']text["']/);
  assert.match(js, /localStorage\.setItem\(MODE_KEY, next\)/);
  assert.match(js, /kf-text-toolbar["']\)\.hidden = isTranslation/);
  assert.match(js, /kf-translation-toolbar["']\)\.hidden = !isTranslation/);
  assert.match(js, /kf-text-reader["']\)\.inert = !hasChapter/);
  assert.match(js, /reader\.inert = !hasTranslation/);
  assert.match(js, /state\.textReviews = new Map\(\)/);
  assert.match(js, /state\.translationReviews = new Map\(\)/);
  assert.match(js, /\["ArrowLeft", "ArrowRight", "Home", "End"\]/);
  assert.match(js, /setMode\(buttons\[nextIndex\]\.dataset\.kfMode, true\)/);
  assert.match(js, /button\.addEventListener\("click", \(\) => setMode\(button\.dataset\.kfMode, true\)\)/);
  assert.match(js, /const keyboardParagraph = selection[\s\S]*?: firstReadableParagraph/);
  assert.match(js, /element\.tabIndex = index === keyboardParagraph \? 0 : -1/);
  const readerKeyboard = sourceBetween(
    js,
    'function handleReaderKeyboardSelection(mode, event)',
    'function applyKeyboardSelection()',
  );
  assert.match(readerKeyboard, /event\.target !== reader/);
  assert.match(readerKeyboard, /nextIndex = event\.key === "End" \|\| event\.key === "ArrowUp"/);
  assert.match(js, /if \(requestRevision !== state\.projectLoadRevision\) return;\s*renderAll\(\);\s*setStatus/);
  assert.match(js, /if \(requestRevision !== state\.translationLoadRevision\) return;\s*renderAll\(\);\s*setStatus\("Käännöksen avaaminen epäonnistui"\)/);
});

test('reopening the same project refreshes variants without reloading itself mid-selection', () => {
  const translationSelect = sourceBetween(
    js,
    'function populateTranslationSelect()',
    'function rememberProject(project, notifyParent)',
  );
  assert.match(translationSelect, /translation\.style_label \|\| translation\.style/);
  assert.match(translationSelect, /["']versio #["'] \+ translation\.id/);

  const messageHandler = sourceBetween(
    js,
    'window.addEventListener("message", (event) => {',
    'async function initialize()',
  );
  assert.match(messageHandler, /else loadProject\(projectId, \{/);
  assert.match(messageHandler, /translationId:\s*state\.translation\?\.id \|\| null/);
  assert.doesNotMatch(messageHandler, /state\.project\?\.id[^\n]*!== projectId/);

  const initialize = sourceBetween(
    js,
    'async function initialize()',
    'window.SkriptLabTranslationFinishingTestHooks',
  );
  assert.match(initialize, /window\.parent === window[\s\S]*?localStorage\.getItem\(ACTIVE_PROJECT_KEY\)/);
  assert.match(initialize, /params\.get\(["']project["']\) \|\| standaloneProjectId/);
});

test('finishing mounts the shared demanding-model settings control', () => {
  expectElement('kf-model-settings', 'button');
  const mount = sourceBetween(js, 'const modelSettings =', 'function jsonOptions(method, body)');
  assert.match(mount, /window\.SkriptLabTextModelSettings\.mount\(\{/);
  assert.match(mount, /triggerId:\s*["']kf-model-settings["']/);
  assert.match(mount, /defaultKind:\s*["']demanding["']/);
  assert.match(mount, /getModel:\s*\(\) => null/);

  const settingsScript = html.indexOf('text-model-settings.js');
  const moduleScript = html.indexOf('kaannoksen-viimeistely.js');
  assert.ok(settingsScript >= 0 && moduleScript > settingsScript, 'Model settings must load before the finishing module');
});

test('selected finishing requests send the current model setting', () => {
  const request = sourceBetween(
    js,
    'async function generateFinishingSuggestions(selection, unitRunRequest)',
    'function runSelectedFinishingSuggestions()',
  );
  assert.match(
    request,
    /const requestModel = unitRunRequest[\s\S]*?: modelSettings\.getModel\(\)/,
  );
  assert.match(request, /if \(!unitRunRequest\) \{[\s\S]*?await modelSettings\.load\(false\)/);
  assert.match(
    request,
    /const body = \{[\s\S]*?model:\s*requestModel,[\s\S]*?selection:\s*selectionRequestPayload\(canonicalSelection, canonical\.paragraphs\)/,
  );
  assert.ok(
    request.indexOf('const requestModel =') < request.indexOf('await fetchCanonicalUnit(context)'),
    'The request model must be snapshotted before asynchronous canonical reads',
  );
});

test('whole-unit finishing snapshots one model for every part', () => {
  const unitRun = sourceBetween(
    js,
    'function generateNextUnitReview()',
    'function validateOpenSuggestions(review, text)',
  );
  assert.match(unitRun, /run = \{[\s\S]*?model:\s*modelSettings\.getModel\(\)/);
  assert.match(
    unitRun,
    /generateFinishingSuggestions\(selection, \{[\s\S]*?id:\s*run\.id,[\s\S]*?model:\s*run\.model,[\s\S]*?partNumber:\s*run\.partNumber/,
  );

  const request = sourceBetween(
    js,
    'async function generateFinishingSuggestions(selection, unitRunRequest)',
    'function runSelectedFinishingSuggestions()',
  );
  assert.match(
    request,
    /unitRunRequest\s*\?[\s\S]*?String\(unitRunRequest\.model \|\| ["']{2}\)\.trim\(\) \|\| null/,
  );
});

test('finishing review shows the model reported by the backend when the target exists', () => {
  const render = sourceBetween(
    js,
    'function renderSuggestions()',
    'function keyboardSelectionParagraph()',
  );
  assert.match(render, /const usedModel = \$\(["']kf-used-model["']\)/);
  assert.match(render, /const generatedBy = String\(review\?\.generatedBy \|\| ["']{2}\)\.trim\(\)/);
  assert.match(render, /usedModel\.hidden = !generatedBy/);
  assert.match(
    render,
    /usedModel\.textContent = generatedBy[\s\S]*?\? ["']Käytetty malli: ["'] \+ modelSettings\.labelFor\(generatedBy\)[\s\S]*?: ["']{2}/,
  );
});

test('finishing suggestions send the exact scoped contract and preserve raw chunk indexes', () => {
  const request = sourceBetween(
    js,
    'async function generateFinishingSuggestions(selection, unitRunRequest)',
    'function runSelectedFinishingSuggestions()',
  );
  assert.match(request, /body = \{[\s\S]*?model:\s*requestModel,[\s\S]*?selection:\s*selectionRequestPayload\(canonicalSelection, canonical\.paragraphs\)/);
  assert.match(request, /body\.chunk_index = context\.rawChunkIndex/);
  assert.match(request, /\/translations\/" \+ encodeURIComponent\(context\.translationId\) \+ "\/finishing-suggestions"/);
  assert.match(request, /\/projects\/" \+ encodeURIComponent\(context\.projectId\) \+ "\/chapters\/"[\s\S]*?"\/finishing-suggestions"/);
  assert.match(request, /jsonOptions\(["']POST["'], body\)/);
  const payload = sourceBetween(js, 'function selectionRequestPayload(selection, paragraphs)', 'function requestContext(unitRunRequest)');
  assert.match(payload, /start_paragraph:\s*selection\.startParagraph/);
  assert.match(payload, /end_paragraph:\s*selection\.endParagraph/);
  assert.match(payload, /start_offset:\s*selection\.startOffset/);
  assert.match(payload, /end_offset:\s*selection\.endOffset/);
  assert.match(payload, /expected_text:\s*selectionText\(paragraphs, selection\)/);
  assert.match(js, /function reviewSuggestions\(result\)[\s\S]*?status:\s*["']open["']/);
  assert.match(request, /suggestions\.length === 1[\s\S]*?1 korjausehdotus/);

  const chunkHelpers = sourceBetween(js, 'function translationTextForChunk(chunk)', 'function currentChunk()');
  const context = {};
  vm.runInNewContext(`${chunkHelpers}\nglobalThis.translationChunks = translationChunks;`, context);
  const chunks = context.translationChunks({
    chunk_details: [
      { source_text: 'Piilotettu', translation: '' },
      { source_text: 'Ensimmäinen', translation: 'First' },
      { source_text: 'Toinen', translation: 'Second' },
    ],
  });
  assert.equal(JSON.stringify(chunks.map((chunk) => chunk._kfRawIndex)), '[1,2]');
});

test('acceptance patches canonical translation with an optimistic stale guard', () => {
  const acceptance = sourceBetween(
    js,
    'async function applyTranslationSuggestionIndexes(indexes)',
    'function applySuggestionIndexes(indexes)',
  );
  assert.match(acceptance, /const expectedTranslation = translationTextForChunk\(chunk\)/);
  assert.match(acceptance, /replaceSuggestionRange\(nextTranslation, item, replacement, workingSelection\)/);
  assert.match(acceptance, /\/translations\/" \+ encodeURIComponent\(translationId\) \+ "\/chunks\/" \+ rawIndex/);
  assert.match(acceptance, /jsonOptions\(["']PATCH["'], \{[\s\S]*?translation:\s*nextTranslation,[\s\S]*?expected_translation:\s*expectedTranslation/);
  assert.match(acceptance, /await reconcileTranslationPatchFailure\([\s\S]*?translationId,[\s\S]*?rawIndex,[\s\S]*?expectedTranslation/);

  const patchIndex = acceptance.indexOf('const saved = await api(');
  const acceptedIndex = acceptance.indexOf('.status = "accepted"');
  assert.ok(patchIndex >= 0 && acceptedIndex > patchIndex, 'Suggestion must become accepted only after PATCH succeeds');
  assert.match(acceptance, /validateOpenSuggestions\(review, canonical\)/);
});

test('text finishing checks chapters and applies only scoped optimistic updates', () => {
  const request = sourceBetween(
    js,
    'async function generateFinishingSuggestions(selection, unitRunRequest)',
    'function runSelectedFinishingSuggestions()',
  );
  assert.match(request, /\/projects\/" \+ encodeURIComponent\(context\.projectId\) \+ "\/chapters\/"/);
  assert.match(request, /jsonOptions\(["']POST["'], body\)/);
  assert.match(request, /storeReview\(context, review\)/);

  const acceptance = sourceBetween(
    js,
    'async function applyTextSuggestionIndexes(indexes)',
    'async function applyTranslationSuggestionIndexes(indexes)',
  );
  assert.match(acceptance, /replaceTextSuggestion\(nextParagraphs, item, replacement, workingSelection\)/);
  assert.match(acceptance, /\/projects\/" \+ encodeURIComponent\(projectId\) \+ "\/chapters\/" \+ chapterIndex/);
  assert.match(acceptance, /jsonOptions\(["']PATCH["'], \{[\s\S]*?chapter:\s*nextChapter,[\s\S]*?expected_paragraphs:\s*expectedParagraphs/);
  assert.match(acceptance, /await reconcileTextPatchFailure\([\s\S]*?projectId,[\s\S]*?chapterIndex,[\s\S]*?expectedParagraphs/);
  const patchIndex = acceptance.indexOf('const saved = await api(');
  const acceptedIndex = acceptance.indexOf('.status = "accepted"');
  assert.ok(patchIndex >= 0 && acceptedIndex > patchIndex, 'Text suggestion must become accepted only after PATCH succeeds');

  const sharedHelpers = sourceBetween(js, 'function paragraphModel(value)', 'function wordCount(value)');
  const helper = sourceBetween(js, 'function replaceTextSuggestion(', 'function chunkTitle(');
  const context = {};
  vm.runInNewContext(
    `const REVIEW_PART_MAX_CHARACTERS = 12000;\n${sharedHelpers}\n${helper}\nglobalThis.replaceTextSuggestion = replaceTextSuggestion;`,
    context,
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.replaceTextSuggestion(
      ['Sama kohta.', 'Korjaa sana.'],
      { paragraph_index: 1, original: 'sana' },
      'virke',
    ).paragraphs)),
    ['Sama kohta.', 'Korjaa virke.'],
  );
  assert.match(
    context.replaceTextSuggestion(
      ['sama kohta ja sama kohta'],
      { paragraph_index: 0, original: 'sama kohta' },
      'korjattu',
    ).error,
    /esiintyy kappaleessa useasti/,
  );
});

test('ambiguous finishing PATCH failures reload changed canonical state and release review locks', async () => {
  const reconciliation = sourceBetween(
    js,
    'async function reconcileTextPatchFailure(projectId, chapterIndex, expectedParagraphs)',
    'async function applyTextSuggestionIndexes(indexes)',
  );

  const latestProject = { id: 1, chapters: [{ paragraphs: ['Palvelimen teksti'] }] };
  const textContext = {
    state: {
      mode: 'text',
      project: { id: 1, chapters: [{ paragraphs: ['Vanha teksti'] }] },
      chapterIndex: 0,
      textSelection: { text: 'Vanha' },
      textReviews: new Map([[0, { suggestions: [{}] }]]),
    },
    api: async () => latestProject,
    chapterParagraphs: (chapter) => (chapter?.paragraphs || []).slice(),
    paragraphSnapshotsMatch: (left, right) => JSON.stringify(left) === JSON.stringify(right),
    rememberProject: (project) => { textContext.state.project = project; },
    clampUnitIndex: (index, count) => Math.max(0, Math.min(index, Math.max(0, count - 1))),
    cancelUnitRun: () => { textContext.cancelled = true; },
    populateProjectSelect: () => { textContext.populated = true; },
    renderAll: () => { textContext.rendered = true; },
  };
  vm.runInNewContext(
    `${reconciliation}\nglobalThis.reconcile = reconcileTextPatchFailure;`,
    textContext,
  );
  assert.equal(await textContext.reconcile(1, 0, ['Vanha teksti']), true);
  assert.equal(textContext.state.project, latestProject);
  assert.equal(textContext.state.textSelection, null);
  assert.equal(textContext.state.textReviews.size, 0);
  assert.equal(textContext.cancelled, true);
  assert.equal(textContext.populated, true);
  assert.equal(textContext.rendered, true);

  const latestTranslation = {
    id: 9,
    chunk_details: [{ translation: 'Palvelimen käännös' }],
  };
  const translationContext = {
    state: {
      mode: 'translation',
      translation: { id: 9, chunk_details: [{ translation: 'Vanha käännös' }] },
      segmentIndex: 0,
      translationSelection: { text: 'Vanha' },
      translationReviews: new Map([[0, { suggestions: [{}] }]]),
    },
    api: async () => latestTranslation,
    chapterParagraphs: () => [],
    paragraphSnapshotsMatch: () => true,
    rememberProject: () => {},
    rememberTranslation: (item) => { translationContext.state.translation = item; },
    translationTextForChunk: (chunk) => String(chunk?.translation || ''),
    translationChunks: (item) => (item.chunk_details || [])
      .map((chunk, rawIndex) => Object.assign({ _kfRawIndex: rawIndex }, chunk))
      .filter((chunk) => chunk.translation.trim()),
    clampUnitIndex: (index, count) => Math.max(0, Math.min(index, Math.max(0, count - 1))),
    cancelUnitRun: () => { translationContext.cancelled = true; },
    populateProjectSelect: () => {},
    populateTranslationSelect: () => { translationContext.populated = true; },
    renderAll: () => { translationContext.rendered = true; },
  };
  vm.runInNewContext(
    `${reconciliation}\nglobalThis.reconcile = reconcileTranslationPatchFailure;`,
    translationContext,
  );
  assert.equal(await translationContext.reconcile(9, 0, 'Vanha käännös'), true);
  assert.equal(translationContext.state.translation, latestTranslation);
  assert.equal(translationContext.state.translationSelection, null);
  assert.equal(translationContext.state.translationReviews.size, 0);
  assert.equal(translationContext.cancelled, true);
  assert.equal(translationContext.populated, true);
  assert.equal(translationContext.rendered, true);
});

test('selection scope disambiguates first and last paragraphs and CRLF offsets use the DOM LF model', () => {
  const helperSource = sourceBetween(js, 'function paragraphModel(value)', 'function wordCount(value)');
  const textReplacementSource = sourceBetween(js, 'function replaceTextSuggestion(', 'function chunkTitle(');
  const context = {};
  vm.runInNewContext(
    `const REVIEW_PART_MAX_CHARACTERS = 12000;\n${helperSource}\n${textReplacementSource}\nObject.assign(globalThis, { selectionText, findSuggestionInParagraphs, replaceTextSuggestion });`,
    context,
  );

  const paragraphs = [
    'target outside\r\nprefix | target first',
    'middle\r\nuntouched',
    'last target | target outside',
  ];
  const normalizedFirst = paragraphs[0].replace(/\r\n?/g, '\n');
  const normalizedLast = paragraphs[2].replace(/\r\n?/g, '\n');
  const scope = {
    startParagraph: 0,
    endParagraph: 2,
    startOffset: normalizedFirst.indexOf('|') + 2,
    endOffset: normalizedLast.indexOf('|') - 1,
  };
  scope.text = context.selectionText(paragraphs, scope);

  const firstRange = context.findSuggestionInParagraphs(
    paragraphs,
    { paragraph_index: 0, original: 'target' },
    scope,
  );
  assert.equal(firstRange.start, normalizedFirst.lastIndexOf('target'));
  const lastRange = context.findSuggestionInParagraphs(
    paragraphs,
    { paragraph_index: 2, original: 'target' },
    scope,
  );
  assert.equal(lastRange.start, normalizedLast.indexOf('target'));

  const firstApplied = context.replaceTextSuggestion(
    paragraphs,
    { paragraph_index: 0, original: 'target' },
    'fixed',
    scope,
  );
  assert.equal(firstApplied.error, undefined);
  assert.equal(firstApplied.paragraphs[0], 'target outside\nprefix | fixed first');
  assert.equal(firstApplied.paragraphs[1], 'middle\r\nuntouched');
  const lastApplied = context.replaceTextSuggestion(
    firstApplied.paragraphs,
    { paragraph_index: 2, original: 'target' },
    'fixed',
    scope,
  );
  assert.equal(lastApplied.paragraphs[2], 'last fixed | target outside');

  const rawCasAcceptance = sourceBetween(
    js,
    'async function applyTextSuggestionIndexes(indexes)',
    'async function applyTranslationSuggestionIndexes(indexes)',
  );
  assert.match(rawCasAcceptance, /const expectedParagraphs = chapterParagraphs\(chapter\)/);
  assert.match(rawCasAcceptance, /expected_paragraphs:\s*expectedParagraphs/);
  assert.match(rawCasAcceptance, /replaceTextSuggestion\(nextParagraphs, item, replacement, workingSelection\)/);
});

test('manual fallback starts unchanged and safely replaces cross-paragraph selections in both modes', () => {
  const helperSource = sourceBetween(js, 'function paragraphModel(value)', 'function wordCount(value)');
  const textReplacementSource = sourceBetween(js, 'function replaceTextSuggestion(', 'function chunkTitle(');
  const adjustmentSource = sourceBetween(
    js,
    'function adjustParagraphSelection(selection, range, delta, paragraphs)',
    'function finishResolvedUnitPart(review, paragraphs)',
  );
  const context = {};
  vm.runInNewContext(
    `const REVIEW_PART_MAX_CHARACTERS = 12000;\n${helperSource}\n${textReplacementSource}\n${adjustmentSource}\nObject.assign(globalThis, { manualFallbackSuggestion, replaceTextSuggestion, replaceSuggestionRange, adjustParagraphSelection, adjustStringSelection, selectionText, cursorAfterSelection, paragraphModel });`,
    context,
  );

  const paragraphs = [
    'Header\r\nprefix alpha',
    'middle\r\nline',
    'omega suffix\r\nfooter',
    'untouched\r\nparagraph',
  ];
  const normalizedFirst = paragraphs[0].replace(/\r\n?/g, '\n');
  const normalizedLast = paragraphs[2].replace(/\r\n?/g, '\n');
  const selection = {
    startParagraph: 0,
    endParagraph: 2,
    startOffset: normalizedFirst.indexOf('alpha'),
    endOffset: normalizedLast.indexOf(' suffix'),
  };
  selection.text = context.selectionText(paragraphs, selection);
  assert.equal(selection.text, 'alpha\n\nmiddle\nline\n\nomega');

  const fallback = context.manualFallbackSuggestion(selection);
  assert.equal(fallback.manual_fallback, true);
  assert.equal(fallback.status, 'open');
  assert.equal(fallback.original, selection.text);
  assert.equal(fallback.replacement, selection.text);
  assert.equal(fallback.edited_replacement, selection.text);
  assert.equal(fallback.paragraph_count, 3);

  const replacement = 'ALPHA\n\nmiddle edited\nline\n\nOMEGA';
  const textResult = context.replaceTextSuggestion(paragraphs, fallback, replacement, selection);
  assert.equal(textResult.error, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(textResult.paragraphs)), [
    'Header\nprefix ALPHA',
    'middle edited\nline',
    'OMEGA suffix\nfooter',
    'untouched\r\nparagraph',
  ]);
  const adjustedTextSelection = context.adjustParagraphSelection(
    selection,
    textResult.range,
    textResult.delta,
    textResult.paragraphs,
  );
  assert.equal(adjustedTextSelection.text, replacement);
  assert.equal(adjustedTextSelection.startParagraph, 0);
  assert.equal(adjustedTextSelection.endParagraph, 2);
  assert.equal(adjustedTextSelection.startOffset, selection.startOffset);
  assert.equal(adjustedTextSelection.endOffset, 'OMEGA'.length);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.cursorAfterSelection(textResult.paragraphs, adjustedTextSelection))),
    { paragraph: 2, offset: 'OMEGA'.length },
  );

  const translation = paragraphs.slice(0, 3).join('\r\n\r\n');
  const translationResult = context.replaceSuggestionRange(
    translation,
    fallback,
    replacement,
    selection,
  );
  assert.equal(translationResult.error, undefined);
  assert.equal(
    translationResult.text,
    'Header\nprefix ALPHA\n\nmiddle edited\nline\n\nOMEGA suffix\nfooter',
  );
  const adjustedTranslationSelection = context.adjustStringSelection(
    translation,
    translationResult.text,
    selection,
    translationResult.range,
    translationResult.delta,
  );
  assert.equal(adjustedTranslationSelection.text, replacement);
  assert.equal(adjustedTranslationSelection.endParagraph, 2);
  assert.equal(adjustedTranslationSelection.endOffset, 'OMEGA'.length);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.cursorAfterSelection(
      context.paragraphModel(translationResult.text).paragraphs,
      adjustedTranslationSelection,
    ))),
    { paragraph: 2, offset: 'OMEGA'.length },
  );

  assert.match(
    context.replaceTextSuggestion(paragraphs, fallback, '', selection).error,
    /ei voi olla tyhjä/,
  );
  assert.match(
    context.replaceSuggestionRange(translation, fallback, ' \n ', selection).error,
    /ei voi olla tyhjä/,
  );
  assert.match(
    context.replaceSuggestionRange(translation, fallback, 'one paragraph', selection).error,
    /kappalerajaa/,
  );
  assert.match(
    context.replaceTextSuggestion(
      ['Header\nprefix changed', paragraphs[1], paragraphs[2], paragraphs[3]],
      fallback,
      replacement,
      selection,
    ).error,
    /muuttunut tarkistuksen jälkeen/,
  );

  const emptyParagraphs = ['A', '', 'B'];
  const emptySelection = {
    startParagraph: 0,
    endParagraph: 2,
    startOffset: 0,
    endOffset: 1,
  };
  emptySelection.text = context.selectionText(emptyParagraphs, emptySelection);
  const emptyFallback = context.manualFallbackSuggestion(emptySelection);
  const emptyResult = context.replaceTextSuggestion(
    emptyParagraphs,
    emptyFallback,
    'AA\n\n\n\nBB',
    emptySelection,
  );
  assert.equal(emptyResult.error, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(emptyResult.paragraphs)), ['AA', '', 'BB']);

  const card = sourceBetween(js, 'function suggestionCard(item, index)', 'function renderSuggestions()');
  assert.match(card, /isManualFallback \? "Valittu teksti" : "Nykyinen"/);
  assert.match(card, /isManualFallback \? "Muokkaa tekstiä" : "Ehdotus"/);
  assert.match(card, /replacement\.rows = isManualFallback \? 7 : 2/);
});

test('whole-unit chunking is bounded, paragraph-aware, sentence-aware, and surrogate-safe', () => {
  const helperSource = sourceBetween(js, 'function paragraphModel(value)', 'function wordCount(value)');
  const context = {};
  vm.runInNewContext(
    `const REVIEW_PART_MAX_CHARACTERS = 12000;\n${helperSource}\nObject.assign(globalThis, { selectionText, safeParagraphCut, unitPartSelection, cursorAfterSelection, countUnitParts });`,
    context,
  );

  const exactlyOne = ['a'.repeat(6000), 'b'.repeat(5998)];
  assert.equal(context.countUnitParts(exactlyOne, 12000), 1);
  const oneSelection = context.unitPartSelection(exactlyOne, { paragraph: 0, offset: 0 }, 12000);
  assert.equal(oneSelection.text.length, 12000);
  assert.equal(oneSelection.endParagraph, 1);

  const overLimit = ['a'.repeat(6000), 'b'.repeat(5999)];
  assert.equal(context.countUnitParts(overLimit, 12000), 2);
  const firstParagraphPart = context.unitPartSelection(overLimit, { paragraph: 0, offset: 0 }, 12000);
  assert.equal(firstParagraphPart.endParagraph, 0);

  const sentenceText = 'a'.repeat(9000) + '. ' + 'b'.repeat(4000);
  const sentencePart = context.unitPartSelection([sentenceText], { paragraph: 0, offset: 0 }, 12000);
  assert.equal(sentencePart.endOffset, 9002);

  const surrogateText = 'a'.repeat(11999) + '😀' + 'z';
  const first = context.unitPartSelection([surrogateText], { paragraph: 0, offset: 0 }, 12000);
  assert.equal(first.endOffset, 11999);
  assert.doesNotMatch(first.text, /[\uD800-\uDBFF]$/);
  const secondCursor = context.cursorAfterSelection([surrogateText], first);
  const second = context.unitPartSelection([surrogateText], secondCursor, 12000);
  assert.equal(second.text, '😀z');
  assert.equal(first.text + second.text, surrogateText);
});

test('accepted replacement deltas move the next-part cursor without leaving selection scope', () => {
  const helperSource = sourceBetween(js, 'function paragraphModel(value)', 'function wordCount(value)');
  const textReplacementSource = sourceBetween(js, 'function replaceTextSuggestion(', 'function chunkTitle(');
  const adjustmentSource = sourceBetween(
    js,
    'function adjustParagraphSelection(selection, range, delta, paragraphs)',
    'function finishResolvedUnitPart(review, paragraphs)',
  );
  const context = {};
  vm.runInNewContext(
    `const REVIEW_PART_MAX_CHARACTERS = 12000;\n${helperSource}\n${textReplacementSource}\n${adjustmentSource}\nObject.assign(globalThis, { replaceTextSuggestion, adjustParagraphSelection, replaceSuggestionRange, adjustStringSelection, cursorAfterSelection });`,
    context,
  );

  const textSelection = {
    startParagraph: 0,
    endParagraph: 0,
    startOffset: 7,
    endOffset: 13,
    text: 'target',
  };
  const textResult = context.replaceTextSuggestion(
    ['before target after'],
    { paragraph_index: 0, original: 'target' },
    'longer target',
    textSelection,
  );
  const adjustedTextSelection = context.adjustParagraphSelection(
    textSelection,
    textResult.range,
    textResult.delta,
    textResult.paragraphs,
  );
  assert.equal(adjustedTextSelection.endOffset, 20);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.cursorAfterSelection(textResult.paragraphs, adjustedTextSelection))),
    { paragraph: 0, offset: 20 },
  );

  const beforeTranslation = 'intro\r\n\r\nbefore target after\r\n\r\ntail';
  const translationSelection = {
    startParagraph: 1,
    endParagraph: 1,
    startOffset: 7,
    endOffset: 13,
    text: 'target',
  };
  const translationResult = context.replaceSuggestionRange(
    beforeTranslation,
    { paragraph_index: 1, original: 'target' },
    'longer target',
    translationSelection,
  );
  const adjustedTranslationSelection = context.adjustStringSelection(
    beforeTranslation,
    translationResult.text,
    translationSelection,
    translationResult.range,
    translationResult.delta,
  );
  assert.equal(adjustedTranslationSelection.startParagraph, 1);
  assert.equal(adjustedTranslationSelection.endParagraph, 1);
  assert.equal(adjustedTranslationSelection.startOffset, 7);
  assert.equal(adjustedTranslationSelection.endOffset, 20);
});

test('whole-unit flow waits for every card and zero-suggestion parts become manual reviews', () => {
  const resolver = sourceBetween(
    js,
    'function finishResolvedUnitPart(review, paragraphs)',
    'function resolvedUnitMessage(progress)',
  );
  assert.match(resolver, /openSuggestionCount\(review\)/);
  assert.match(resolver, /return advanceUnitRun\(review, paragraphs\)/);

  const generation = sourceBetween(
    js,
    'async function generateFinishingSuggestions(selection, unitRunRequest)',
    'function runSelectedFinishingSuggestions()',
  );
  assert.ok(
    generation.indexOf('fetchCanonicalUnit(context)') < generation.indexOf('jsonOptions("POST", body)'),
    'Canonical unit must be fetched before each suggestion POST',
  );
  assert.match(generation, /const usesManualFallback = suggestions\.length === 0/);
  assert.match(generation, /suggestions\.push\(manualFallbackSuggestion\(canonicalSelection\)\)/);
  assert.match(generation, /run\.status = "review"/);
  assert.doesNotMatch(generation, /advanceUnitRun\(review, canonical\.paragraphs\)/);
  assert.match(generation, /Korjattavaa ei löytynyt · muokkaa tekstiä itse tai hylkää/);
  assert.match(generation, /if \(focusUnitButton\) \$\("kf-run-unit"\)\?\.focus/);

  const controls = sourceBetween(js, 'function renderUnitControls()', 'function renderHeader()');
  assert.match(controls, /"Jatka osaan " \+ run\.partNumber/);
  assert.match(controls, /run\.status === "review"[\s\S]*?Ratkaise avoimet ehdotukset/);

  const bindings = sourceBetween(js, 'function bindEvents()', 'async function initialize()');
  assert.match(bindings, /kf-run-unit["']\)\.addEventListener\(["']click["'], generateNextUnitReview\)/);

  const actionStates = sourceBetween(js, 'function updateActionStates()', 'function populateProjectSelect()');
  assert.match(actionStates, /const reviewing = openCount > 0/);
  assert.match(actionStates, /querySelectorAll\(["']\[data-kf-mode\]["']\)\.forEach[\s\S]*?button\.disabled = state\.busy \|\| reviewing/);
  assert.match(actionStates, /kf-previous["']\)\.disabled = state\.busy \|\| reviewing/);
  assert.match(actionStates, /kf-run["']\)\.disabled = state\.busy[\s\S]*?\|\| reviewing/);
});

test('same-unit renders preserve aligned scroll while unit changes reset every reader', () => {
  const scrollHelpers = sourceBetween(
    js,
    'function readerScrollRatio(reader)',
    'function renderParagraphs(reader, paragraphs, selection, options)',
  );
  const context = {};
  vm.runInNewContext(
    `${scrollHelpers}\nObject.assign(globalThis, { readerScrollRatio, applyReaderScrollRatio });`,
    context,
  );
  const source = { scrollHeight: 1000, clientHeight: 200, scrollTop: 400 };
  const target = { scrollHeight: 600, clientHeight: 100, scrollTop: 0 };
  assert.equal(context.readerScrollRatio(source), 0.5);
  context.applyReaderScrollRatio(target, 0.5);
  assert.equal(target.scrollTop, 250);
  context.applyReaderScrollRatio(target, 2);
  assert.equal(target.scrollTop, 500);

  const textRender = sourceBetween(js, 'function renderTextDocument()', 'function renderTranslationDocument()');
  assert.match(textRender, /state\.textScrollContextKey === scrollContextKey/);
  assert.match(textRender, /renderParagraphs[\s\S]*?keepScroll/);
  assert.match(textRender, /state\.textScrollContextKey = scrollContextKey/);

  const translationRender = sourceBetween(js, 'function renderTranslationDocument()', 'function suggestionCard(item, index)');
  const clampIndex = translationRender.indexOf('state.segmentIndex = clampUnitIndex');
  const chunkIndex = translationRender.indexOf('const chunk = chunks[state.segmentIndex] || null');
  assert.ok(clampIndex >= 0 && chunkIndex > clampIndex, 'Segment index must be clamped before reading the chunk');
  assert.match(translationRender, /state\.translationScrollContextKey === scrollContextKey/);
  assert.match(translationRender, /restoreAlignedReaderScroll\(sourceReader, targetReader, scrollRatio\)/);
  assert.match(translationRender, /state\.translationSelection = null[\s\S]*?resetReaderScrollContext\("translation"\)/);

  const indexHelper = sourceBetween(js, 'function clampUnitIndex(index, count)', 'function currentChapter()');
  const indexContext = {};
  vm.runInNewContext(`${indexHelper}\nglobalThis.clampUnitIndex = clampUnitIndex;`, indexContext);
  assert.equal(indexContext.clampUnitIndex(4, 2), 1);
  assert.equal(indexContext.clampUnitIndex(-3, 2), 0);
  assert.equal(indexContext.clampUnitIndex(4, 0), 0);

  const movement = sourceBetween(js, 'function moveUnit(direction)', 'function reviewSuggestions(result)');
  assert.match(movement, /cancelUnitRun\(\);\s*resetReaderScrollContext\(state\.mode\)/);
});

test('unparsed empty AI responses retry while trustworthy empty responses open manual editing', () => {
  const resultHelpers = sourceBetween(
    js,
    'function reviewSuggestions(result)',
    'function selectionRequestPayload(selection, paragraphs)',
  );
  const context = {};
  vm.runInNewContext(
    `${resultHelpers}\nObject.assign(globalThis, { reviewSuggestions, hasUnreliableEmptySuggestionResult });`,
    context,
  );
  const parseWarning = {
    suggestions: [],
    warnings: ['Mallin vastausta ei saatu jäsennettyä korjausehdotuksiksi.'],
  };
  assert.equal(
    context.hasUnreliableEmptySuggestionResult(parseWarning, context.reviewSuggestions(parseWarning)),
    true,
  );
  assert.equal(
    context.hasUnreliableEmptySuggestionResult({ suggestions: [], warnings: [] }, []),
    false,
  );
  assert.equal(
    context.hasUnreliableEmptySuggestionResult(
      { suggestions: [{ original: 'a', replacement: 'b' }], warnings: parseWarning.warnings },
      [{ original: 'a', replacement: 'b' }],
    ),
    false,
  );

  const generation = sourceBetween(
    js,
    'async function generateFinishingSuggestions(selection, unitRunRequest)',
    'function runSelectedFinishingSuggestions()',
  );
  const unreliableIndex = generation.indexOf('hasUnreliableEmptySuggestionResult(result, suggestions)');
  const fallbackIndex = generation.indexOf('suggestions.push(manualFallbackSuggestion(canonicalSelection))');
  const storeIndex = generation.indexOf('storeReview(context, review)');
  assert.ok(unreliableIndex >= 0 && fallbackIndex > unreliableIndex && storeIndex > fallbackIndex);
  assert.doesNotMatch(generation, /advanceUnitRun\(review, canonical\.paragraphs\)/);
  assert.match(generation, /if \(run\?\.id === unitRunRequest\?\.id\) run\.status = "retry"/);
  const controls = sourceBetween(js, 'function renderUnitControls()', 'function renderHeader()');
  assert.match(controls, /run\.status === "retry"[\s\S]*?Yritä osaa [\s\S]*?uudelleen/);
});

test('trustworthy empty state holds a whole-unit run on an editable manual fallback', async () => {
  const generation = sourceBetween(
    js,
    'async function generateFinishingSuggestions(selection, unitRunRequest)',
    'function runSelectedFinishingSuggestions()',
  );
  const fallbackFactory = sourceBetween(
    js,
    'function manualFallbackSuggestion(selection)',
    'function findSuggestionInParagraphs(paragraphs, suggestion, scope)',
  );
  const paragraphs = ['Before selected text after'];
  const selection = {
    startParagraph: 0,
    endParagraph: 0,
    startOffset: 7,
    endOffset: 20,
    text: 'selected text',
  };
  const run = { id: 71, status: 'requesting' };
  const context = {
    state: {
      busy: false,
      mode: 'text',
      project: { id: 4 },
      chapterIndex: 0,
    },
    currentChapter: () => ({ paragraphs }),
    currentChunk: () => null,
    currentUnitParagraphs: () => paragraphs,
    currentUnitRun: () => run,
    keepOpenReviewForDecision: () => false,
    requestContext: (unitRun) => ({
      mode: 'text',
      projectId: 4,
      chapterIndex: 0,
      unitRun,
    }),
    requestContextIsCurrent: () => true,
    selectionText: (_paragraphs, scoped) => scoped.text,
    cloneSelection: (scoped) => ({ ...scoped }),
    selectionRequestPayload: (scoped) => ({ expected_text: scoped.text }),
    fetchCanonicalUnit: async () => ({
      paragraphs,
      expectedParagraphs: paragraphs.slice(),
    }),
    api: async () => ({ suggestions: [], warnings: [], generated_by: 'test' }),
    jsonOptions: (_method, body) => body,
    reviewSuggestions: (result) => (result.suggestions || []).map((item) => ({
      ...item,
      status: 'open',
      edited_replacement: String(item.replacement || ''),
    })),
    finishingWarnings: (result) => result.warnings || [],
    hasUnreliableEmptySuggestionResult: () => false,
    storeReview: (_request, review) => { context.storedReview = review; },
    setBusy: (busy) => { context.state.busy = busy; },
    setStatus: (status) => { context.status = status; },
    toast: (message) => { context.toastMessage = message; },
    renderAll: () => { context.renderCount = (context.renderCount || 0) + 1; },
    canonicalChangedError: (message) => new Error(message),
    $: () => ({ focus: () => { context.unitFocus = true; } }),
    document: {
      querySelector: () => ({ focus: () => { context.replacementFocus = true; } }),
    },
    window: { requestAnimationFrame: (callback) => callback() },
  };
  vm.runInNewContext(
    `const REVIEW_PART_MAX_CHARACTERS = 12000;\n${fallbackFactory}\n${generation}\nglobalThis.generate = generateFinishingSuggestions;`,
    context,
  );

  await context.generate(selection, { id: 71, partNumber: 1, totalParts: 2 });

  assert.equal(context.storedReview.suggestions.length, 1);
  assert.equal(context.storedReview.suggestions[0].manual_fallback, true);
  assert.equal(context.storedReview.suggestions[0].original, selection.text);
  assert.equal(context.storedReview.suggestions[0].edited_replacement, selection.text);
  assert.equal(context.storedReview.suggestions[0].status, 'open');
  assert.equal(run.status, 'review');
  assert.equal(context.state.busy, false);
  assert.match(context.status, /muokkaa tekstiä itse tai hylkää/);
  assert.equal(context.replacementFocus, true);
});

test('accepting an unchanged manual fallback verifies canonical state before resolving locally', async () => {
  const helper = sourceBetween(
    js,
    'function unchangedManualSuggestionItems(review, indexes)',
    'function renderUnchangedManualAcceptance(result)',
  );
  const review = {
    expectedParagraphs: ['Text unchanged'],
    suggestions: [{
      manual_fallback: true,
      original: 'Text unchanged',
      replacement: 'Text unchanged',
      edited_replacement: 'Text unchanged',
      status: 'open',
    }],
  };
  let canonicalReads = 0;
  const context = {
    requestContext: () => ({ mode: 'text' }),
    setBusy: (busy) => { context.busy = busy; },
    setStatus: (status) => { context.status = status; },
    fetchCanonicalUnit: async () => {
      canonicalReads += 1;
      return { paragraphs: ['Text unchanged'], expectedParagraphs: ['Text unchanged'] };
    },
    currentReview: () => review,
    requestContextIsCurrent: () => true,
    finishResolvedUnitPart: () => ({ inRun: true, hasMore: true }),
    renderUnchangedManualAcceptance: (result) => { context.renderedResult = result; },
    toast: (message) => { context.toastMessage = message; },
  };
  vm.runInNewContext(
    `${helper}\nObject.assign(globalThis, { unchangedManualSuggestionItems, acceptUnchangedManualSuggestions });`,
    context,
  );
  const handled = await context.acceptUnchangedManualSuggestions(review, [0]);
  assert.equal(handled, true);
  assert.equal(canonicalReads, 1);
  assert.equal(context.renderedResult.count, 1);
  assert.equal(context.renderedResult.progress.hasMore, true);
  assert.equal(review.suggestions[0].status, 'accepted');
  assert.equal(context.busy, false);

  const staleReview = {
    suggestions: [{
      manual_fallback: true,
      original: 'Old',
      replacement: 'Old',
      edited_replacement: 'Old',
      status: 'open',
    }],
  };
  context.currentReview = () => staleReview;
  context.fetchCanonicalUnit = async () => {
    const error = new Error('Luku muuttui');
    error.canonicalChanged = true;
    throw error;
  };
  assert.equal(await context.acceptUnchangedManualSuggestions(staleReview, [0]), true);
  assert.equal(staleReview.suggestions[0].status, 'open');
  assert.equal(context.status, 'Aineisto muuttui');
  assert.match(context.toastMessage, /muuttui/);

  for (const [start, end] of [
    ['async function applyTextSuggestionIndexes(indexes)', 'async function applyTranslationSuggestionIndexes(indexes)'],
    ['async function applyTranslationSuggestionIndexes(indexes)', 'function applySuggestionIndexes(indexes)'],
  ]) {
    const acceptance = sourceBetween(js, start, end);
    const unchangedIndex = acceptance.indexOf('await acceptUnchangedManualSuggestions(');
    const patchIndex = acceptance.indexOf('const saved = await api(');
    assert.ok(unchangedIndex >= 0 && patchIndex > unchangedIndex);
  }

  const canonicalIndex = helper.indexOf('await fetchCanonicalUnit(context)');
  const acceptedIndex = helper.indexOf('item.status = "accepted"');
  assert.ok(canonicalIndex >= 0 && acceptedIndex > canonicalIndex);
});

test('a remotely removed chapter or translation segment clears the stale review lock', async () => {
  const canonical = sourceBetween(js, 'async function fetchCanonicalUnit(context)', 'function storeReview(context, review)');
  const missingChapter = sourceBetween(canonical, 'if (!chapter) {', 'const paragraphs = chapterParagraphs(chapter)');
  assert.match(missingChapter, /rememberProject\(latest, false\)/);
  assert.match(missingChapter, /state\.textSelection = null/);
  assert.match(missingChapter, /state\.textReviews\.delete\(context\.chapterIndex\)/);
  assert.match(missingChapter, /cancelUnitRun\(\)/);
  assert.match(missingChapter, /renderAll\(\)/);

  const missingChunk = sourceBetween(canonical, 'if (!chunk) {', 'const canonicalTranslation = translationTextForChunk(chunk)');
  assert.match(missingChunk, /rememberTranslation\(latest\)/);
  assert.match(missingChunk, /state\.translationSelection = null/);
  assert.match(missingChunk, /state\.translationReviews\.delete\(context\.rawChunkIndex\)/);
  assert.match(missingChunk, /cancelUnitRun\(\)/);
  assert.match(missingChunk, /populateTranslationSelect\(\)/);
  assert.match(missingChunk, /renderAll\(\)/);

  const helper = sourceBetween(js, 'function canonicalChangedError(message)', 'function storeReview(context, review)');
  const state = {
    chapterIndex: 3,
    segmentIndex: 2,
    textSelection: { text: 'old' },
    translationSelection: { text: 'old' },
    textReviews: new Map([[3, { stale: true }]]),
    translationReviews: new Map([[7, { stale: true }]]),
  };
  const context = {
    state,
    api: async (path) => path.startsWith('/projects/')
      ? { id: 'project-1', chapters: [] }
      : { id: 'translation-1', chunk_details: [] },
    requestContextIsCurrent: () => true,
    rememberProject: () => { context.projectRemembered = true; },
    rememberTranslation: () => { context.translationRemembered = true; },
    cancelUnitRun: () => { context.cancelCount = (context.cancelCount || 0) + 1; },
    populateProjectSelect: () => { context.projectSelectRendered = true; },
    populateTranslationSelect: () => { context.translationSelectRendered = true; },
    renderAll: () => { context.renderCount = (context.renderCount || 0) + 1; },
    translationChunks: () => [],
  };
  vm.runInNewContext(
    `${helper}\nObject.assign(globalThis, { fetchCanonicalUnit });`,
    context,
  );

  await assert.rejects(
    context.fetchCanonicalUnit({ mode: 'text', projectId: 'project-1', chapterIndex: 3 }),
    /Valittua lukua ei enää löytynyt/,
  );
  assert.equal(context.projectRemembered, true);
  assert.equal(state.textSelection, null);
  assert.equal(state.textReviews.has(3), false);

  await assert.rejects(
    context.fetchCanonicalUnit({
      mode: 'translation',
      translationId: 'translation-1',
      rawChunkIndex: 7,
      segmentIndex: 2,
    }),
    /Valittua käännössegmenttiä ei enää löytynyt/,
  );
  assert.equal(context.translationRemembered, true);
  assert.equal(state.translationSelection, null);
  assert.equal(state.translationReviews.has(7), false);
  assert.equal(context.cancelCount, 2);
  assert.equal(context.renderCount, 2);
});

test('editable replacements cannot add or remove paragraph boundaries', () => {
  const helperSource = sourceBetween(js, 'function paragraphModel(value)', 'function wordCount(value)');
  const context = {};
  vm.runInNewContext(
    `${helperSource}\nObject.assign(globalThis, { paragraphBoundaryCount, replacementParagraphBoundaryError, editableReplacementError });`,
    context,
  );
  assert.equal(context.paragraphBoundaryCount('alpha\n\nbeta'), 1);
  assert.equal(context.replacementParagraphBoundaryError(
    { original: 'alpha\n\nbeta' },
    'gamma\n\ndelta',
  ), '');
  assert.match(
    context.replacementParagraphBoundaryError({ original: 'alpha' }, 'alpha\n\nbeta'),
    /ei voi lisätä tai poistaa kappalerajaa/,
  );
  assert.match(
    context.replacementParagraphBoundaryError({ original: 'alpha\n\nbeta' }, 'alpha beta'),
    /ei voi lisätä tai poistaa kappalerajaa/,
  );
  assert.equal(context.replacementParagraphBoundaryError({ original: 'alpha\nbeta' }, 'gamma\ndelta'), '');
  assert.match(
    context.editableReplacementError({ manual_fallback: true, original: 'alpha' }, '  \n '),
    /ei voi olla tyhjä/,
  );
  assert.equal(
    context.editableReplacementError({ manual_fallback: true, paragraph_count: 1, original: 'alpha' }, 'beta'),
    '',
  );
  assert.equal(
    context.editableReplacementError(
      { manual_fallback: true, paragraph_count: 3, original: 'A\n\n\n\nB' },
      'AA\n\n\n\nBB',
    ),
    '',
  );

  for (const [start, end, replaceCall] of [
    ['async function applyTextSuggestionIndexes(indexes)', 'async function applyTranslationSuggestionIndexes(indexes)', 'replaceTextSuggestion'],
    ['async function applyTranslationSuggestionIndexes(indexes)', 'function applySuggestionIndexes(indexes)', 'replaceSuggestionRange'],
  ]) {
    const acceptance = sourceBetween(js, start, end);
    const guardIndex = acceptance.indexOf('editableReplacementError(item, replacement)');
    const replaceIndex = acceptance.indexOf(`${replaceCall}(`);
    const patchIndex = acceptance.indexOf('const saved = await api(');
    assert.ok(guardIndex >= 0 && replaceIndex > guardIndex && patchIndex > replaceIndex);
    assert.match(acceptance, /blockedIndexes\.push\(index\)/);
  }
  assert.match(css, /\.kf-reason\.is-error\s*\{[\s\S]*?color:\s*var\(--ti-danger\)/);
});

test('selected rejection is local while whole-unit rejection verifies canonical state first', async () => {
  const rejection = sourceBetween(
    js,
    'async function rejectSuggestion(index)',
    'function contentDispositionFilename(header, fallback)',
  );
  assert.match(rejection, /item\.status = ["']rejected["']/);
  assert.match(rejection, /renderAll\(\)/);
  assert.match(rejection, /käännös säilyi ennallaan/);
  const verifyIndex = rejection.indexOf('await fetchCanonicalUnit(context)');
  const rejectIndex = rejection.indexOf('item.status = "rejected"');
  const advanceIndex = rejection.indexOf('finishResolvedUnitPart(review, paragraphs)');
  assert.ok(verifyIndex >= 0 && rejectIndex > verifyIndex && advanceIndex > rejectIndex);
  assert.doesNotMatch(rejection, /\bapi\s*\(/);
  assert.doesNotMatch(rejection, /authorizedFetch\s*\(/);
  assert.doesNotMatch(rejection, /setCanonicalChunkText\s*\(/);

  const item = { status: 'open' };
  const review = { unitRun: { id: 1 }, suggestions: [item] };
  let advances = 0;
  const context = {
    currentReview: () => review,
    currentUnitParagraphs: () => ['local'],
    requestContext: () => ({ mode: 'text' }),
    setBusy: () => {},
    setStatus: (status) => { context.status = status; },
    fetchCanonicalUnit: async () => {
      const error = new Error('Luku muuttui');
      error.canonicalChanged = true;
      throw error;
    },
    requestContextIsCurrent: () => true,
    toast: (message) => { context.toastMessage = message; },
    finishResolvedUnitPart: () => { advances += 1; return { inRun: true, hasMore: false }; },
    renderAll: () => {},
    resolvedUnitMessage: () => null,
    state: { mode: 'text' },
    window: { requestAnimationFrame: () => {} },
    document: { querySelector: () => null },
    $: () => null,
  };
  vm.runInNewContext(`${rejection}\nglobalThis.rejectSuggestion = rejectSuggestion;`, context);
  await context.rejectSuggestion(0);
  assert.equal(item.status, 'open');
  assert.equal(advances, 0);
  assert.equal(context.status, 'Aineisto muuttui');
});

test('final and bilingual downloads use canonical finishing exports', () => {
  const download = sourceBetween(
    js,
    'async function downloadFinishingExport(format)',
    'function syncScroll(source, target)',
  );
  assert.match(download, /\/finishing-export\?" \+ query/);
  assert.doesNotMatch(download, /review-export/);
  assert.match(download, /"bilingual-docx":\s*\{[\s\S]*?buttonId:\s*["']kf-download-bilingual-docx["']/);
  assert.match(download, /fallback:\s*["']viimeistelty-bilingual-rinnakkain\.docx["']/);

  const actionStates = sourceBetween(
    js,
    'function updateActionStates()',
    'function populateProjectSelect()',
  );
  assert.match(actionStates, /kf-download-bilingual-docx["']\)\.disabled/);

  const bindings = sourceBetween(js, 'function bindEvents()', 'async function initialize()');
  assert.match(bindings, /kf-download-final["']\)\.addEventListener\(["']click["'], \(\) => downloadFinishingExport\(["']final["']\)\)/);
  assert.match(bindings, /kf-download-bilingual["']\)\.addEventListener\(["']click["'], \(\) => downloadFinishingExport\(["']bilingual["']\)\)/);
  assert.match(bindings, /kf-download-bilingual-docx["']\)\.addEventListener\(["']click["'], \(\) => downloadFinishingExport\(["']bilingual-docx["']\)\)/);

});

// The production site mirrors frontend files only; Main runs this backend contract check.
test('backend finishing exports preserve the final manuscript and access guard', { skip: backendMain === null ? 'Frontend-only site repository' : false }, () => {
  const endpoint = sourceBetween(
    backendMain,
    '@app.get("/api/translations/{translation_id}/finishing-export")',
    '@app.patch("/api/translations/{translation_id}"',
  );
  assert.match(endpoint, /\{"final",\s*"bilingual",\s*"bilingual-docx"\}/);
  assert.match(endpoint, /build_parallel_bilingual_docx\(/);
  assert.match(endpoint, /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/);
  assert.match(endpoint, /output\/translated_manuscript\.md/);
  assert.match(endpoint, /output\/bilingual_manuscript\.md/);
  assert.doesNotMatch(endpoint, /reviewed_manuscript|reviewed_bilingual_manuscript/);
  assert.match(endpoint, /require_module_access\(current_user, ["']translation_finishing["']\)/);
});

test('replacement helpers preserve paragraph separators and reject ambiguous matches', () => {
  const helperSource = sourceBetween(js, 'function paragraphModel(value)', 'function wordCount(value)');
  const context = {};
  vm.runInNewContext(
    `${helperSource}\nObject.assign(globalThis, { paragraphModel, findSuggestionRange, replaceSuggestionRange });`,
    context,
  );

  const original = 'Alpha\r\n\r\n \r\nBeta\n\n\nGamma';
  const model = context.paragraphModel(original);
  assert.equal(JSON.stringify(model.paragraphs), '["Alpha","Beta","Gamma"]');
  assert.equal(JSON.stringify(model.separators), '["\\n\\n \\n","\\n\\n\\n",""]');

  const replaced = context.replaceSuggestionRange(
    original,
    { paragraph_index: 1, original: 'Beta' },
    'Delta',
  );
  assert.equal(replaced.error, undefined);
  assert.equal(replaced.text, 'Alpha\n\n \nDelta\n\n\nGamma');

  const ambiguous = context.findSuggestionRange(
    'sama kohta ja sama kohta',
    { paragraph_index: 0, original: 'sama kohta' },
  );
  assert.match(ambiguous.error, /esiintyy kappaleessa useasti/);
  const unchanged = context.replaceSuggestionRange(
    'sama kohta ja sama kohta',
    { paragraph_index: 0, original: 'sama kohta' },
    'korjattu',
  );
  assert.equal(unchanged.text, 'sama kohta ja sama kohta');
  assert.match(unchanged.error, /varmasti/);
});
