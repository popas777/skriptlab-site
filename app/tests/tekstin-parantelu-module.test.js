const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(appRoot, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(appRoot, 'app.js'), 'utf8');
const shellCss = fs.readFileSync(path.join(appRoot, 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(appRoot, 'tekstin-parantelu.html'), 'utf8');
const js = fs.readFileSync(path.join(appRoot, 'tekstin-parantelu.js'), 'utf8');
const css = fs.readFileSync(path.join(appRoot, 'tekstin-parantelu.css'), 'utf8');

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

test('Tekstin parantelu mounts as an accessible two-tab workspace', () => {
  assert.match(indexHtml, /<li\b[^>]*data-view=["']view-oikoluku["'][^>]*>Tekstin parantelu<\/li>/);
  assert.match(
    indexHtml,
    /id=["']view-oikoluku["'][\s\S]*?<iframe\b(?=[^>]*id=["']text-improvement-frame["'])(?=[^>]*src=["']tekstin-parantelu\.html\?v=\d+["'])(?=[^>]*title=["']Tekstin parantelu["'])/,
  );
  assert.match(html, /<title>Tekstin parantelu · SkriptLab<\/title>/);
  assert.match(html, /<h1\b[^>]*id=["']ti-title["'][^>]*>Tekstin parantelu<\/h1>/);
  assert.match(appJs, /function\s+refreshTextImprovementFrame\(\)/);
  assert.match(appJs, /updateEmbeddedModuleFrame\(frame, ['"]tekstin-parantelu\.html['"], params\)/);
  assert.match(appJs, /type:\s*['"]skriptlab:text-improvement-opened['"]/);

  assert.match(html, /class=["']ti-tabs["'][^>]*role=["']tablist["']/);
  assert.equal((html.match(/\bdata-ti-mode=/g) || []).length, 2);
  assert.match(html, /id=["']ti-tab-normal["'][\s\S]{0,260}?role=["']tab["'][\s\S]{0,260}?data-ti-mode=["']normal["']/);
  assert.match(html, /id=["']ti-tab-translation["'][\s\S]{0,300}?role=["']tab["'][\s\S]{0,300}?data-ti-mode=["']translation["']/);
  assert.match(html, /id=["']ti-normal-docs["'][^>]*role=["']tabpanel["'][^>]*aria-labelledby=["']ti-tab-normal["']/);
  assert.match(html, /id=["']ti-translation-docs["'][^>]*role=["']tabpanel["'][^>]*aria-labelledby=["']ti-tab-translation["']/);
  assert.match(js, /document\.querySelectorAll\(["']\[data-ti-mode\]["']\)/);
  assert.match(js, /button\.addEventListener\(["']click["'], \(\) => setMode\(button\.dataset\.tiMode\)\)/);
});

test('normal files and bilingual manuscripts can both be imported or selected', () => {
  expectElement('ti-project-select', 'select');
  expectElement('ti-translation-select', 'select');
  assert.match(html, /<input\b(?=[^>]*id=["']ti-import-file["'])(?=[^>]*type=["']file["'])(?=[^>]*accept=["'][^"']*\.docx[^"']*\.pdf[^"']*["'])[^>]*>/i);
  assert.match(html, /<input\b(?=[^>]*id=["']ti-bilingual-file["'])(?=[^>]*type=["']file["'])(?=[^>]*accept=["'][^"']*\.md[^"']*\.txt[^"']*["'])[^>]*>/i);

  const projectImport = sourceBetween(js, 'async function importProjectFile(file)', 'async function importBilingualFile(file)');
  assert.match(projectImport, /const form = new FormData\(\)/);
  assert.match(projectImport, /form\.append\(["']file["'], file\)/);
  assert.match(projectImport, /api\(["']\/projects\/import["'], \{ method: ["']POST["'], body: form \}\)/);
  assert.match(projectImport, /await refreshProjects\(\)/);
  assert.match(projectImport, /await loadTranslations\(\)/);

  const bilingualImport = sourceBetween(js, 'async function importBilingualFile(file)', 'function syncScroll(source, target)');
  assert.match(bilingualImport, /form\.append\(["']file["'], file\)/);
  assert.match(bilingualImport, /form\.append\(["']source_language["'], ["']auto["']\)/);
  assert.match(bilingualImport, /form\.append\(["']target_language["'], ["']fi["']\)/);
  assert.match(bilingualImport, /api\(["']\/translations\/import-bilingual["'], \{ method: ["']POST["'], body: form \}\)/);
  assert.match(bilingualImport, /await setMode\(["']translation["']\)/);
  assert.match(js, /const canImportBilingual = allowedModules === null[\s\S]{0,120}?allowedModules\.includes\(["']translation_workspace["']\)/);
  assert.match(bilingualImport, /if \(!state\.canImportBilingual\)/);
  assert.match(js, /\$\(["']ti-bilingual-button["']\)\.disabled = state\.busy \|\| reviewing \|\| !state\.canImportBilingual/);

  assert.match(js, /\$\(["']ti-import-file["']\)\.addEventListener\(["']change["'], \(event\) => importProjectFile\(event\.target\.files\?\.\[0\]\)\)/);
  assert.match(js, /\$\(["']ti-bilingual-file["']\)\.addEventListener\(["']change["'], \(event\) => importBilingualFile\(event\.target\.files\?\.\[0\]\)\)/);
});

test('selection, additional instructions and editable accept/reject controls stay wired', () => {
  expectElement('ti-instructions', 'textarea');
  expectElement('ti-suggestion-text', 'textarea');
  expectElement('ti-generate', 'button');
  expectElement('ti-reject', 'button');
  expectElement('ti-accept', 'button');
  assert.match(html, /id=["']ti-instructions["'][\s\S]{0,180}?maxlength=["']4000["']/);

  const selection = sourceBetween(js, 'function selectionFromReader(reader, paragraphs)', 'function appendHighlightedText');
  assert.match(selection, /window\.getSelection\(\)/);
  assert.match(selection, /browserSelection\.getRangeAt\(0\)/);
  assert.match(selection, /normalized\.text = selectionText\(paragraphs, normalized\)/);
  assert.match(js, /handleReaderSelection\(["']normal["'], event\)/);
  assert.match(js, /handleReaderSelection\(["']translation["'], event\)/);

  const generate = sourceBetween(js, 'async function generateSuggestion(options)', 'async function acceptNormalSuggestion');
  assert.match(generate, /instructions:\s*\$\(["']ti-instructions["']\)\.value\.trim\(\)/);
  assert.match(js, /\$\(["']ti-suggestion-text["']\)\.addEventListener\(["']input["'][\s\S]{0,180}?state\.suggestion\.edited = event\.target\.value[\s\S]{0,100}?state\.suggestion\.manualEdited = true/);
  assert.match(js, /\$\(["']ti-accept["']\)\.addEventListener\(["']click["'], acceptSuggestion\)/);
  assert.match(js, /\$\(["']ti-reject["']\)\.addEventListener\(["']click["'], rejectSuggestion\)/);

  const accept = sourceBetween(js, 'async function acceptSuggestion()', 'async function rejectSuggestion()');
  assert.match(accept, /state\.suggestion\.manualFallback && !state\.suggestion\.manualEdited[\s\S]{0,100}?state\.suggestion\.original/);
  assert.match(accept, /edited,\s*\}/);
  assert.match(accept, /suggestion\.mode === ["']translation["']/);
  const reject = sourceBetween(js, 'async function rejectSuggestion()', 'async function importProjectFile(file)');
  assert.match(reject, /clearSuggestion\(\)/);
  assert.match(reject, /alkuperäinen teksti säilyi/);
  assert.match(reject, /const latest = await api\(["']\/projects\//);
  assert.doesNotMatch(reject, /jsonOptions\(["']PATCH["']|replaceSelectionInParagraphModel|applyReplacement/);
});

test('shared model settings drive selected and whole-chapter improvement requests', () => {
  expectElement('ti-model-settings', 'button');
  expectElement('ti-used-model', 'p');
  assert.match(html, /text-model-settings\.css\?v=\d+/);
  assert.match(html, /text-model-settings\.js\?v=\d+/);
  assert.match(js, /SkriptLabTextModelSettings\.mount\(\{[\s\S]{0,180}?triggerId:\s*["']ti-model-settings["'][\s\S]{0,180}?defaultKind:\s*["']demanding["']/);

  const chapter = sourceBetween(js, 'async function generateNextChapterSuggestion()', 'async function generateSuggestion(options)');
  assert.match(chapter, /await textModelSettings\.load\(false\)/);
  assert.match(chapter, /model:\s*textModelSettings\.getModel\(\)/);
  assert.match(chapter, /chapterRun:\s*\{[\s\S]{0,180}?model:\s*run\.model/);

  const generate = sourceBetween(js, 'async function generateSuggestion(options)', 'async function acceptNormalSuggestion');
  assert.match(generate, /if \(!chapterRunRequest\) await textModelSettings\.load\(false\)/);
  assert.match(generate, /const requestModel = chapterRunRequest[\s\S]{0,160}?chapterRunRequest\.model \|\| null[\s\S]{0,160}?textModelSettings\.getModel\(\)/);
  assert.match(generate, /model:\s*requestModel/);
  assert.match(generate, /generatedBy:\s*String\(result\?\.generated_by \|\| ["']{2}\)/);

  const inspector = sourceBetween(js, 'function renderInspector()', 'function renderNormal()');
  assert.match(inspector, /textModelSettings\.labelFor\(generatedBy\)/);
});

test('an unchanged model edit is offered exactly while empty output remains an error', () => {
  const generate = sourceBetween(js, 'async function generateSuggestion(options)', 'async function acceptNormalSuggestion');
  assert.match(generate, /const returnedEdit = String\(result\?\.edited_text \?\? ["']{2}\)/);
  assert.match(generate, /if \(!returnedEditTrimmed\) throw new Error\(["']Mallilta ei saatu tekstiehdotusta\./);
  assert.match(generate, /const offersOriginalForManualEditing = returnedEdit === requestSelection\.text/);
  assert.match(generate, /const edited = offersOriginalForManualEditing[\s\S]{0,100}?requestSelection\.text/);
  assert.match(generate, /Automaattinen tarkistus ei löytänyt muutettavaa\. Voit muokata ehdotusta itse ennen hyväksymistä\./);
  assert.match(generate, /Valittu teksti valmis muokattavaksi · hyväksy tai hylkää/);
});

test('accepting an unchanged improvement is a canonical-checked no-op in both modes', () => {
  const normal = sourceBetween(js, 'async function acceptNormalSuggestion(suggestion)', 'async function acceptTranslationSuggestion(suggestion)');
  const normalNoop = normal.indexOf('if (replacement === suggestion.original)');
  const normalReplacement = normal.indexOf('applyReplacement(');
  const normalPatch = normal.indexOf('const saved = await api(');
  assert.ok(normalNoop >= 0 && normalReplacement > normalNoop && normalPatch > normalReplacement);
  assert.match(normal, /cursorAfterSelection\(paragraphs, suggestion\.selection\)/);
  assert.match(normal, /unchanged:\s*true/);

  const translation = sourceBetween(js, 'async function acceptTranslationSuggestion(suggestion)', 'async function acceptSuggestion()');
  const translationNoop = translation.indexOf('if (replacement === suggestion.original)');
  const translationReplacement = translation.indexOf('replaceSelectionInParagraphModel(');
  const translationPatch = translation.indexOf('const saved = await api(');
  assert.ok(translationNoop >= 0 && translationReplacement > translationNoop && translationPatch > translationReplacement);
  assert.match(translation, /unchanged:\s*true/);

  const accept = sourceBetween(js, 'async function acceptSuggestion()', 'async function rejectSuggestion()');
  assert.match(accept, /Teksti hyväksytty ilman muutoksia/);
  assert.match(accept, /Luvun osa hyväksyttiin ilman muutoksia/);
});

test('whole-chapter improvement exposes an accessible sequential action', () => {
  expectElement('ti-chapter-generate', 'button');
  assert.match(html, /id=["']ti-chapter-controls["'][^>]*aria-labelledby=["']ti-chapter-controls-title["']/);
  assert.match(html, /id=["']ti-chapter-progress["'][^>]*role=["']status["'][^>]*aria-live=["']polite["']/);
  assert.match(html, /id=["']ti-chapter-progressbar["'][^>]*role=["']progressbar["'][^>]*aria-valuemin=["']0["'][^>]*aria-valuemax=["']1["']/);
  assert.match(html, /Enintään 12 000 merkin luku käsitellään kerralla/);
  assert.match(html, /id=["']ti-chapter-generate["'][^>]*aria-describedby=["']ti-chapter-progress["']/);
  assert.match(css, /\.ti-chapter-controls\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  assert.match(css, /\.ti-chapter-progressbar span\s*\{[\s\S]*?background:\s*var\(--ti-violet\)/);

  const controls = sourceBetween(js, 'function renderChapterControls()', 'function updateActionStates()');
  assert.match(controls, /controls\.hidden = !available/);
  assert.match(controls, /state\.mode === ["']normal["']/);
  assert.match(controls, /updateChapterProgressBar\(run\)/);
  assert.match(controls, /chapterHasImprovementText\(\)/);
  assert.match(controls, /Jatka osaan/);
  assert.match(controls, /odottaa hyväksyntää tai hylkäystä/);

  const bindings = sourceBetween(js, 'function bindEvents()', 'async function initialize()');
  assert.match(bindings, /\$\(["']ti-chapter-generate["']\)\.addEventListener\(["']click["'], generateNextChapterSuggestion\)/);
});

test('chapter parts use the 12,000-character backend limit and prefer paragraph boundaries', () => {
  const helperSource = [
    sourceBetween(js, 'function paragraphModel(value)', 'function replaceSelectionInParagraphModel(model, selection, replacement)'),
    sourceBetween(js, 'function selectionText(paragraphs, selection)', 'function selectionForWholeParagraph(paragraphs, index)'),
    sourceBetween(js, 'function normalizedChapterCursor(paragraphs, cursor)', 'function firstUsefulSelection(paragraphs)'),
  ].join('\n');
  const context = {};
  vm.runInNewContext(
    `${helperSource}\nObject.assign(globalThis, { chapterPartSelection, cursorAfterSelection, cursorAfterReplacement, countChapterParts });`,
    context,
  );

  const exactlyAtLimit = ['x'.repeat(12000)];
  const exactSelection = context.chapterPartSelection(exactlyAtLimit, { paragraph: 0, offset: 0 }, 12000);
  assert.equal(exactSelection.text.length, 12000);
  assert.equal(exactSelection.endOffset, 12000);
  assert.equal(context.countChapterParts(exactlyAtLimit, 12000), 1);

  const oneOverLimit = ['x'.repeat(12001)];
  const firstLongSelection = context.chapterPartSelection(oneOverLimit, { paragraph: 0, offset: 0 }, 12000);
  assert.equal(firstLongSelection.text.length, 12000);
  assert.equal(context.countChapterParts(oneOverLimit, 12000), 2);

  const sentenceBoundary = ['a'.repeat(8500) + '. ' + 'b'.repeat(4000)];
  const sentencePart = context.chapterPartSelection(sentenceBoundary, { paragraph: 0, offset: 0 }, 12000);
  assert.equal(sentencePart.endOffset, 8502);

  const surrogateBoundary = ['a'.repeat(11999) + '😀' + 'loput'];
  const unicodePart = context.chapterPartSelection(surrogateBoundary, { paragraph: 0, offset: 0 }, 12000);
  assert.equal(unicodePart.endOffset, 11999);
  assert.doesNotMatch(unicodePart.text, /[\uD800-\uDBFF]$/);

  const paragraphs = ['a'.repeat(7000), 'b'.repeat(3000), 'c'.repeat(3000)];
  const firstPart = context.chapterPartSelection(paragraphs, { paragraph: 0, offset: 0 }, 12000);
  assert.equal(firstPart.endParagraph, 1);
  assert.equal(firstPart.endOffset, 3000);
  assert.equal(firstPart.text.length, 10002);
  const nextCursor = context.cursorAfterSelection(paragraphs, firstPart);
  assert.equal(JSON.stringify(nextCursor), JSON.stringify({ paragraph: 2, offset: 0 }));
  assert.equal(context.countChapterParts(paragraphs, 12000), 2);
  assert.equal(context.countChapterParts(paragraphs, 12000, { paragraph: 2, offset: 0 }), 1);

  assert.equal(context.chapterPartSelection(['   ', '\t'], { paragraph: 0, offset: 0 }, 12000), null);
  assert.equal(context.countChapterParts(['   ', '\t'], 12000), 0);
});

test('chapter continuation maps accepted rewrites to the first untouched character', () => {
  const helperSource = [
    sourceBetween(js, 'function paragraphModel(value)', 'function replaceSelectionInParagraphModel(model, selection, replacement)'),
    sourceBetween(js, 'function normalizedChapterCursor(paragraphs, cursor)', 'function firstUsefulSelection(paragraphs)'),
  ].join('\n');
  const context = {};
  vm.runInNewContext(
    `${helperSource}\nObject.assign(globalThis, { cursorAfterReplacement });`,
    context,
  );

  const paragraphs = ['Prefix selected suffix', 'Untouched'];
  const selection = { startParagraph: 0, endParagraph: 0, startOffset: 7, endOffset: 15 };
  const oneParagraph = context.cursorAfterReplacement(paragraphs, selection, 'short');
  assert.equal(JSON.stringify(oneParagraph), JSON.stringify({ paragraph: 0, offset: 12 }));
  const splitReplacement = context.cursorAfterReplacement(paragraphs, selection, 'New first\n\nNew last');
  assert.equal(JSON.stringify(splitReplacement), JSON.stringify({ paragraph: 1, offset: 8 }));

  const accept = sourceBetween(js, 'async function acceptNormalSuggestion(suggestion)', 'async function acceptTranslationSuggestion(suggestion)');
  const patchRequest = accept.indexOf('const saved = await api(');
  const advance = accept.indexOf('return advanceChapterRun(suggestion, savedParagraphs, chapterContinuationCursor)');
  assert.ok(patchRequest >= 0 && advance > patchRequest, 'continuation must advance only after the guarded PATCH succeeds');
  assert.match(accept, /cursorAfterReplacement\([\s\S]*?paragraphs,[\s\S]*?suggestion\.selection,[\s\S]*?replacement,[\s\S]*?preserveParagraphSlots/);

  const reject = sourceBetween(js, 'async function rejectSuggestion()', 'async function importProjectFile(file)');
  assert.match(reject, /cursorAfterSelection\(paragraphs, suggestion\.selection\)/);
  assert.match(reject, /advanceChapterRun\(/);
});

test('manual unchanged improvements preserve empty paragraph slots when edited', () => {
  const helperSource = [
    sourceBetween(js, 'function paragraphModel(value)', 'function replaceSelectionInParagraphModel(model, selection, replacement)'),
    sourceBetween(js, 'function exactReplacementParagraphs(replacement, selection)', 'function replacementWithBoundaryWhitespace(original, replacement)'),
  ].join('\n');
  const context = {};
  vm.runInNewContext(
    `${helperSource}\nObject.assign(globalThis, { exactReplacementParagraphs, cursorAfterReplacement, applyReplacement });`,
    context,
  );
  const paragraphs = ['A', '', 'B', 'tail'];
  const selection = { startParagraph: 0, endParagraph: 2, startOffset: 0, endOffset: 1 };
  const replacement = 'AA\n\n\n\nBB';
  assert.equal(JSON.stringify(context.exactReplacementParagraphs(replacement, selection)), '["AA","","BB"]');
  assert.equal(
    JSON.stringify(context.applyReplacement(paragraphs, selection, replacement, true)),
    '["AA","","BB","tail"]',
  );
  assert.equal(
    JSON.stringify(context.cursorAfterReplacement(paragraphs, selection, replacement, true)),
    '{"paragraph":2,"offset":2}',
  );
  assert.throws(
    () => context.applyReplacement(paragraphs, selection, 'AA\n\nBB', true),
    /ei voi lisätä tai poistaa kappalerajoja/,
  );

  const generate = sourceBetween(js, 'async function generateSuggestion(options)', 'async function acceptNormalSuggestion');
  assert.match(generate, /manualFallback:\s*offersOriginalForManualEditing/);
  assert.match(generate, /manualEdited:\s*false/);
  const accept = sourceBetween(js, 'async function acceptNormalSuggestion(suggestion)', 'async function acceptTranslationSuggestion(suggestion)');
  assert.match(accept, /const preserveParagraphSlots = Boolean\(suggestion\.manualFallback\)/);
});

test('untouched manual fallback keeps the exact original value despite textarea normalization', () => {
  const accept = sourceBetween(js, 'async function acceptSuggestion()', 'async function rejectSuggestion()');
  assert.match(accept, /const edited = state\.suggestion\.manualFallback && !state\.suggestion\.manualEdited/);
  assert.match(accept, /\? state\.suggestion\.original[\s\S]{0,100}?: \$\(["']ti-suggestion-text["']\)\.value/);

  const normal = sourceBetween(js, 'async function acceptNormalSuggestion(suggestion)', 'async function acceptTranslationSuggestion(suggestion)');
  const translation = sourceBetween(js, 'async function acceptTranslationSuggestion(suggestion)', 'async function acceptSuggestion()');
  assert.match(normal, /const editedReplacement = suggestion\.edited/);
  assert.match(translation, /const editedReplacement = suggestion\.edited/);
});

test('chapter run retries the same part after API errors and cancels on context changes', () => {
  assert.match(js, /const CHAPTER_PART_MAX_CHARACTERS = 12000/);
  const next = sourceBetween(js, 'async function generateNextChapterSuggestion()', 'async function generateSuggestion(options)');
  assert.match(next, /countChapterParts\(paragraphs, CHAPTER_PART_MAX_CHARACTERS\)/);
  assert.match(next, /chapterPartSelection\([\s\S]*?run\.nextCursor,[\s\S]*?CHAPTER_PART_MAX_CHARACTERS/);
  assert.match(next, /if \(!totalParts \|\| !nextCursor\)[\s\S]*?return/);
  const canonicalRead = next.indexOf('await api("/projects/"');
  const partSelection = next.lastIndexOf('const selection = chapterPartSelection(');
  assert.ok(canonicalRead >= 0 && canonicalRead < partSelection, 'the canonical chapter must be reloaded before every part');
  assert.match(next, /paragraphSnapshotsMatch\(normalParagraphs\(\), paragraphs\)/);
  assert.match(next, /Luku muuttui toisessa näkymässä/);
  assert.match(next, /await generateSuggestion\(\{[\s\S]*?chapterRun:/);

  const generate = sourceBetween(js, 'async function generateSuggestion(options)', 'async function acceptNormalSuggestion');
  const apiCall = generate.indexOf('await api("/proofread/improve-selection"');
  const retryReset = generate.indexOf('activeRun.status = "ready"', apiCall);
  assert.ok(apiCall >= 0 && retryReset > apiCall, 'failed generation must reset to ready without advancing nextCursor');
  assert.doesNotMatch(generate.slice(apiCall, retryReset), /nextCursor\s*=/);
  assert.match(generate, /currentChapterRun\(\)\?\.id !== chapterRunRequest\.id/);
  assert.match(generate, /activeRun\?\.id === chapterRunRequest\?\.id/);

  const loadProject = sourceBetween(js, 'async function loadProject(projectId, options)', 'async function chooseTranslation(translationId)');
  const setMode = sourceBetween(js, 'async function setMode(mode, focusTab)', 'function canMove(direction)');
  const move = sourceBetween(js, 'function moveUnit(direction)', 'function handleReaderSelection');
  assert.match(loadProject, /cancelChapterRun\(\)/);
  assert.match(setMode, /cancelChapterRun\(\)/);
  assert.match(move, /cancelChapterRun\(\)/);
});

test('an open editable suggestion cannot be discarded by local navigation or a new selection', () => {
  const actions = sourceBetween(js, 'function updateActionStates()', 'function keyboardSelectionParagraph()');
  assert.match(actions, /const reviewing = Boolean\(state\.suggestion\)/);
  assert.match(actions, /\$\(["']ti-previous["']\)\.disabled = state\.busy \|\| reviewing/);
  assert.match(actions, /\$\(["']ti-project-select["']\)\.disabled = state\.busy \|\| reviewing/);
  assert.match(actions, /button\.disabled = state\.busy[\s\S]{0,100}?\|\| reviewing/);

  const mode = sourceBetween(js, 'async function setMode(mode, focusTab)', 'function canMove(direction)');
  const move = sourceBetween(js, 'function moveUnit(direction)', 'function handleReaderSelection');
  const pointer = sourceBetween(js, 'function handleReaderSelection(mode, event)', 'function handleReaderKeyboardSelection');
  const keyboard = sourceBetween(js, 'function handleReaderKeyboardSelection(mode, event)', 'function applyKeyboardSelection()');
  const generate = sourceBetween(js, 'async function generateSuggestion(options)', 'async function acceptNormalSuggestion');
  assert.match(mode, /keepOpenSuggestionForReview\(\)/);
  assert.match(move, /keepOpenSuggestionForReview\(\)/);
  assert.match(pointer, /keepOpenSuggestionForReview\(\)/);
  assert.match(keyboard, /keepOpenSuggestionForReview\(\)/);
  assert.match(generate, /if \(state\.suggestion\) \{[\s\S]{0,120}?keepOpenSuggestionForReview\(\)[\s\S]{0,80}?return/);
});

test('keyboard focus stays bounded and returns after asynchronous actions', () => {
  const paragraphs = sourceBetween(js, 'function renderParagraphs(reader, paragraphs, selection, options)', 'function renderReaderMessage');
  assert.match(paragraphs, /paragraph\.tabIndex = selected && index === selection\.startParagraph \? 0 : -1/);
  assert.match(paragraphs, /paragraph\.setAttribute\(["']role["'], ["']button["']\)/);
  assert.match(paragraphs, /paragraph\.setAttribute\(["']aria-pressed["'], selected \? ["']true["'] : ["']false["']\)/);
  assert.doesNotMatch(paragraphs, /setAttribute\(["']aria-label["']/);

  const keyboard = sourceBetween(js, 'function handleReaderKeyboardSelection(mode, event)', 'function contextForNormalSelection()');
  assert.match(keyboard, /["']ArrowUp["']/);
  assert.match(keyboard, /["']ArrowDown["']/);
  assert.match(keyboard, /nextIndex = Math\.min\(paragraphs\.length - 1, currentIndex \+ 1\)/);

  const busy = sourceBetween(js, 'function setBusy(show, label)', 'function wordCount(value)');
  assert.match(busy, /state\.busyReturnFocus/);
  assert.match(busy, /state\.focusAfterBusy/);
  assert.match(busy, /target\?\.focus\(\{ preventScroll: true \}\)/);
  const generate = sourceBetween(js, 'async function generateSuggestion(options)', 'async function acceptNormalSuggestion');
  assert.match(generate, /state\.focusAfterBusy = \$\(["']ti-suggestion-text["']\)/);
  const reject = sourceBetween(js, 'async function rejectSuggestion()', 'async function importProjectFile(file)');
  assert.match(reject, /\$\(["']ti-generate["']\)\.focus\(\{ preventScroll: true \}\)/);
});

test('keyboard users can make an exact word or sentence selection without a paragraph tab maze', () => {
  assert.match(html, /id=["']ti-selection-help["'][^>]*role=["']status["'][^>]*aria-live=["']polite["']/);
  assert.match(html, /<textarea\b(?=[^>]*id=["']ti-keyboard-selection-text["'])(?=[^>]*readonly)[^>]*>/i);
  expectElement('ti-use-keyboard-selection', 'button');
  assert.match(html, /id=["']ti-keyboard-selection-status["'][^>]*role=["']status["'][^>]*aria-live=["']polite["']/);
  assert.match(html, /Vaihto \+ nuolinäppäimillä/);

  const exact = sourceBetween(js, 'function keyboardSelectionParagraph()', 'function contextForNormalSelection()');
  assert.match(exact, /textarea\.selectionStart/);
  assert.match(exact, /textarea\.selectionEnd/);
  assert.match(exact, /startParagraph:\s*paragraphIndex/);
  assert.match(exact, /endParagraph:\s*paragraphIndex/);
  assert.match(exact, /selectionTextFromParagraphModel\(/);
  assert.match(exact, /selectionText\(paragraphs, selection\)/);
  assert.match(exact, /updatedTextarea\.setSelectionRange\(startOffset, endOffset\)/);

  const bindings = sourceBetween(js, 'function bindEvents()', 'async function initialize()');
  assert.match(bindings, /\$\(["']ti-keyboard-selection-text["']\)\.addEventListener\(["']select["'], updateKeyboardSelectionStatus\)/);
  assert.match(bindings, /\(event\.ctrlKey \|\| event\.metaKey\) && event\.key === ["']Enter["']/);
  assert.match(bindings, /\$\(["']ti-use-keyboard-selection["']\)\.addEventListener\(["']click["'], applyKeyboardSelection\)/);
});

test('collapsed shell navigation is inert and short viewports do not force a clipped iframe', () => {
  const sidebar = sourceBetween(appJs, 'function setSidebarAccessibility(hidden)', 'function setSidebarDrawer(open)');
  assert.match(sidebar, /sidebar\.inert = inaccessible/);
  assert.match(sidebar, /sidebar\.setAttribute\(["']aria-hidden["'], ["']true["']\)/);
  assert.match(sidebar, /toggleSidebarBtn\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(appJs, /setSidebarAccessibility\(!open\)/);
  assert.match(appJs, /setSidebarAccessibility\(sidebar\.classList\.contains\(["']hidden["']\)\)/);

  const frameRules = sourceBetween(shellCss, '.text-improvement-frame {', '#view-video {');
  assert.match(frameRules, /min-height:\s*0/);
  assert.doesNotMatch(frameRules, /min-height:\s*max\(620px/);
});

test('improvement requests include source text only for translation-aware suggestions', () => {
  const generate = sourceBetween(js, 'async function generateSuggestion(options)', 'async function acceptNormalSuggestion');
  assert.match(generate, /const requestMode = state\.mode/);
  assert.match(generate, /const isTranslation = requestMode === ["']translation["']/);
  assert.match(generate, /const requestChunk = isTranslation \? currentChunk\(\) : null/);
  assert.match(generate, /const context = isTranslation \? contextForTranslationSelection\(\) : contextForNormalSelection\(\)/);
  assert.match(generate, /const sourceText = isTranslation \? sourceTextForChunk\(requestChunk\)\.slice\(0, 30000\) : ["']["']/);
  assert.match(generate, /api\(["']\/proofread\/improve-selection["'], jsonOptions\(["']POST["'], \{/);
  assert.match(generate, /text:\s*requestSelection\.text/);
  assert.match(generate, /source_text:\s*sourceText/);
  assert.match(generate, /context_before:\s*context\.before/);
  assert.match(generate, /context_after:\s*context\.after/);
  assert.match(generate, /state\.mode !== requestMode/);
  assert.match(generate, /const requestChapterSnapshot = isTranslation \? null : normalParagraphs\(\)/);
  assert.match(generate, /chapterSnapshot:\s*requestChapterSnapshot/);
});

test('partial selections send surrounding target text from the same paragraph in both modes', () => {
  const helperSource = sourceBetween(js, 'function paragraphModel(value)', 'function chapterTitle(chapter, index)');
  const context = {};
  vm.runInNewContext(
    `${helperSource}\nObject.assign(globalThis, { paragraphModel, paragraphModelFromParagraphs, contextAroundSelection });`,
    context,
  );

  const normalModel = context.paragraphModelFromParagraphs([
    'Edellinen.',
    'Ennen valittu jälkeen.',
    'Seuraava.',
  ]);
  const normalContext = context.contextAroundSelection(
    normalModel,
    { startParagraph: 1, endParagraph: 1, startOffset: 6, endOffset: 13 },
    3000,
  );
  assert.equal(normalContext.before, 'Edellinen.\n\nEnnen ');
  assert.equal(normalContext.after, ' jälkeen.\n\nSeuraava.');

  const translationModel = context.paragraphModel('First.\n\n\nBefore chosen after.\n\nLast.');
  const translationContext = context.contextAroundSelection(
    translationModel,
    { startParagraph: 1, endParagraph: 1, startOffset: 7, endOffset: 13 },
    3000,
  );
  assert.equal(translationContext.before, 'First.\n\n\nBefore ');
  assert.equal(translationContext.after, ' after.\n\nLast.');

  const normalContextSource = sourceBetween(js, 'function contextForNormalSelection()', 'async function generateSuggestion(options)');
  assert.match(normalContextSource, /paragraphModelFromParagraphs\(normalParagraphs\(\)\)/);
  assert.match(normalContextSource, /function contextForTranslationSelection\(\)/);
  assert.match(normalContextSource, /paragraphModel\(translationTextForChunk\(currentChunk\(\)\)\)/);
});

test('project and translation responses cannot cross project boundaries', () => {
  const translations = sourceBetween(js, 'async function loadTranslations(preferredId)', 'async function loadProject(projectId, options)');
  assert.match(translations, /const requestRevision = \+\+state\.translationLoadRevision/);
  assert.match(translations, /const requestedProjectId = String\(state\.project\?\.id \|\| ["']["']\)/);
  assert.match(translations, /requestRevision !== state\.translationLoadRevision/);
  assert.match(translations, /String\(state\.project\?\.id \|\| ["']["']\) !== requestedProjectId/);

  const project = sourceBetween(js, 'async function loadProject(projectId, options)', 'async function chooseTranslation(translationId)');
  assert.match(project, /const requestRevision = \+\+state\.projectLoadRevision/);
  assert.match(project, /if \(requestRevision !== state\.projectLoadRevision\) return/);
  assert.match(project, /state\.translationLoadRevision \+= 1/);

  const messages = sourceBetween(js, 'window.addEventListener("message"', 'async function initialize()');
  assert.match(messages, /if \(!projectId\) \{[\s\S]{0,100}?loadProject\(["']["'], \{ notifyParent: false \}\)/);
});

test('acceptance performs stale checks before chapter and translation PATCH requests', () => {
  const normal = sourceBetween(js, 'async function acceptNormalSuggestion(suggestion)', 'async function acceptTranslationSuggestion(suggestion)');
  const normalRead = normal.indexOf('const latest = await api("/projects/"');
  const normalCheck = normal.indexOf('current !== suggestion.original');
  const normalPatch = normal.indexOf('jsonOptions("PATCH", {');
  assert.ok(normalRead >= 0 && normalRead < normalCheck && normalCheck < normalPatch);
  assert.match(normal, /\/projects\/" \+ encodeURIComponent\(latest\.id\) \+ "\/chapters\/" \+ suggestion\.chapterIndex/);
  assert.match(normal, /applyReplacement\([\s\S]*?paragraphs,[\s\S]*?suggestion\.selection,[\s\S]*?replacement,[\s\S]*?preserveParagraphSlots/);
  assert.match(normal, /expected_paragraphs:\s*paragraphs/);
  assert.match(normal, /paragraphSnapshotsMatch\(paragraphs, suggestion\.chapterSnapshot\)/);

  const translation = sourceBetween(js, 'async function acceptTranslationSuggestion(suggestion)', 'async function acceptSuggestion()');
  const translationRead = translation.indexOf('const latest = await api("/translations/"');
  const translationCheck = translation.indexOf('current !== suggestion.original');
  const translationPatch = translation.indexOf('jsonOptions("PATCH", {');
  assert.ok(translationRead >= 0 && translationRead < translationCheck && translationCheck < translationPatch);
  assert.match(translation, /\/translations\/" \+ encodeURIComponent\(suggestion\.translationId\) \+ "\/chunks\/" \+ rawChunkIndex/);
  assert.match(translation, /replaceSelectionInParagraphModel\(model, suggestion\.selection, replacement\)/);
  assert.match(translation, /expected_translation:\s*String\(chunk\?\.translation \|\| ["']["']\)/);
});

test('filtered bilingual segments preserve their raw backend chunk indexes', () => {
  const helpers = sourceBetween(js, 'function translationChunks(item)', 'function selectionText(paragraphs, selection)');
  const context = {};
  vm.runInNewContext(`${helpers}\nglobalThis.translationChunks = translationChunks;`, context);
  const chunks = context.translationChunks({
    chunk_details: [
      { source_text: 'Piilotettu', translation: '' },
      { source_text: 'Ensimmäinen', translation: 'First' },
      { prompt_sections: { source_text: 'Toinen' }, translation: 'Second' },
    ],
  });
  assert.equal(JSON.stringify(chunks.map((chunk) => chunk._tiRawIndex)), '[1,2]');

  const generate = sourceBetween(js, 'async function generateSuggestion(options)', 'async function acceptNormalSuggestion');
  assert.match(generate, /rawChunkIndex:\s*requestChunk\?\._tiRawIndex \?\? requestSegmentIndex/);
  const translation = sourceBetween(js, 'async function acceptTranslationSuggestion(suggestion)', 'async function acceptSuggestion()');
  assert.match(translation, /const chunk = rawChunks\[rawChunkIndex\]/);
  assert.match(translation, /\/chunks\/" \+ rawChunkIndex/);
});

test('selection boundaries and translation spacing survive exact-range replacement', () => {
  const helperSource = [
    sourceBetween(js, 'function splitParagraphs(value)', 'function paragraphModel(value)'),
    sourceBetween(js, 'function paragraphModel(value)', 'function replaceSelectionInParagraphModel(model, selection, replacement)'),
    sourceBetween(js, 'function replaceSelectionInParagraphModel(model, selection, replacement)', 'function chapterTitle(chapter, index)'),
    sourceBetween(js, 'function selectionText(paragraphs, selection)', 'function selectionForWholeParagraph(paragraphs, index)'),
    sourceBetween(js, 'function applyReplacement(paragraphs, selection, replacement, preserveParagraphSlots)', 'function replacementWithBoundaryWhitespace(original, replacement)'),
    sourceBetween(js, 'function replacementWithBoundaryWhitespace(original, replacement)', 'function textOffsetInside(paragraph, node, offset)'),
  ].join('\n');
  const context = {};
  vm.runInNewContext(`${helperSource}\nObject.assign(globalThis, { splitParagraphs, paragraphModel, selectionTextFromParagraphModel, replaceSelectionInParagraphModel, selectionText, applyReplacement, replacementWithBoundaryWhitespace });`, context);

  const selection = { startParagraph: 0, endParagraph: 0, startOffset: 3, endOffset: 8 };
  const original = context.selectionText(['foo bar baz'], selection);
  assert.equal(original, ' bar ');
  const replacement = context.replacementWithBoundaryWhitespace(original, 'qux');
  assert.equal(replacement, ' qux ');
  assert.equal(JSON.stringify(context.applyReplacement(['foo bar baz'], selection, replacement)), '["foo qux baz"]');

  const model = context.paragraphModel('Alpha\n\n\nBeta');
  const crossParagraphSelection = { startParagraph: 0, endParagraph: 1, startOffset: 0, endOffset: 4 };
  assert.equal(context.selectionTextFromParagraphModel(model, crossParagraphSelection), 'Alpha\n\n\nBeta');
  const exact = context.replaceSelectionInParagraphModel(
    model,
    { startParagraph: 1, endParagraph: 1, startOffset: 0, endOffset: 4 },
    'Gamma',
  );
  assert.equal(exact, 'Alpha\n\n\nGamma');
});

test('source and target advance together and keep guarded bidirectional scroll sync', () => {
  const render = sourceBetween(js, 'function renderTranslation()', 'function renderMode()');
  assert.match(render, /const chunk = chunks\[state\.segmentIndex\]/);
  assert.match(render, /sourceTextForChunk\(chunk\)/);
  assert.match(render, /translationTextForChunk\(chunk\)/);
  const navigation = sourceBetween(js, 'function moveUnit(direction)', 'function handleReaderSelection');
  assert.match(navigation, /state\.segmentIndex \+= direction/);
  assert.match(navigation, /renderMode\(\)/);

  const scroll = sourceBetween(js, 'function syncScroll(source, target)', 'function bindEvents()');
  assert.match(scroll, /if \(state\.scrollSyncing\) return/);
  assert.match(scroll, /const sourceMax = source\.scrollHeight - source\.clientHeight/);
  assert.match(scroll, /target\.scrollTop = \(source\.scrollTop \/ sourceMax\) \* targetMax/);
  assert.match(scroll, /window\.requestAnimationFrame\(\(\) =>/);
  assert.match(js, /\$\(["']ti-source-reader["']\)\.addEventListener\(["']scroll["'], \(\) => syncScroll\(\$\(["']ti-source-reader["']\), \$\(["']ti-target-reader["']\)\)\)/);
  assert.match(js, /\$\(["']ti-target-reader["']\)\.addEventListener\(["']scroll["'], \(\) => syncScroll\(\$\(["']ti-target-reader["']\), \$\(["']ti-source-reader["']\)\)\)/);
});

test('workspace collapses responsively without losing the aligned translation columns', () => {
  const tablet = sourceBetween(css, '@media (max-width: 1050px)', '@media (max-width: 720px)');
  assert.match(tablet, /\.ti-editor-grid,[\s\S]*?\.ti-editor-grid\[data-mode=["']translation["']\][\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(tablet, /\.ti-inspector-actions\s*\{[\s\S]*?position:\s*sticky/);
  assert.match(tablet, /\.ti-toolbar\s*\{[\s\S]*?flex-wrap:\s*wrap/);
  assert.match(css, /\.ti-prose p\s*\{[\s\S]*?white-space:\s*pre-wrap/);

  const mobile = sourceBetween(css, '@media (max-width: 720px)', '@media (max-width: 430px)');
  assert.match(mobile, /\.ti-tab\s*\{[\s\S]*?flex:\s*1 1 50%/);
  assert.match(mobile, /\.ti-translation-region\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(mobile, /\.ti-target-column\s*\{[\s\S]*?border-top:/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
