const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(appRoot, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(appRoot, 'app.js'), 'utf8');
const manuscriptHtml = fs.readFileSync(path.join(appRoot, 'manuskripti.html'), 'utf8');
const manuscriptJs = fs.readFileSync(path.join(appRoot, 'manuskripti.js'), 'utf8');

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `Missing source marker: ${startMarker}`);
  assert.ok(end > start, `Missing source marker after ${startMarker}: ${endMarker}`);
  return source.slice(start, end);
}

function inputTag(source, id) {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`<input\\b(?=[^>]*\\bid="${escapedId}")[^>]*>`, 'i'));
  assert.ok(match, `${id} must remain an input.`);
  return match[0];
}

function evaluateAppAuthorHelpers(project) {
  const helperSource = sourceBetween(
    appJs,
    'const MISSING_PROJECT_AUTHORS',
    'function markLocalManuscriptDraft'
  );
  const coverSource = sourceBetween(
    appJs,
    'function coverAuthorFromProject()',
    'function refreshCoverTextFields'
  );
  const context = { window: { manuscriptData: project } };
  vm.runInNewContext(`
    ${helperSource}
    ${coverSource}
    globalThis.isMissingProjectAuthor = isMissingProjectAuthor;
    globalThis.meaningfulProjectAuthor = meaningfulProjectAuthor;
    globalThis.coverAuthorFromProject = coverAuthorFromProject;
  `, context);
  return context;
}

test('the active Texts iframe exposes an author field before creating or importing a project', () => {
  assert.match(
    indexHtml,
    /<iframe\b(?=[^>]*id="manuskripti-frame-kirjani")(?=[^>]*src="manuskripti\.html\?v=\d+")[^>]*>/
  );

  const library = sourceBetween(manuscriptHtml, '<main id="view-library"', '</main>');
  const authorInput = inputTag(library, 'new-project-author');
  assert.doesNotMatch(authorInput, /\b(?:hidden|disabled)\b/i);
  assert.match(authorInput, /\bautocomplete="name"/i);
  assert.ok(
    library.indexOf('id="new-project-author"') < library.indexOf('id="btn-upload"'),
    'The author field must be available before either creation action.'
  );
  assert.match(library, /<label\b[^>]*>[\s\S]*?Tekijä[\s\S]*?id="new-project-author"/);
});

test('the same optional author is forwarded by both file import and empty-project creation', () => {
  const importProject = sourceBetween(
    manuscriptJs,
    'async function apiImportFile',
    'async function apiPatchChapter'
  );
  assert.match(importProject, /async function apiImportFile\(file, author = ""\)/);
  assert.match(importProject, /form\.append\("author", author\.trim\(\)\)/);
  assert.match(importProject, /author:\s*author\.trim\(\) \|\| "Tuntematon"/);

  const bindings = sourceBetween(
    manuscriptJs,
    'function bindEvents()',
    'document.addEventListener("DOMContentLoaded"'
  );
  assert.match(bindings, /apiImportFile\(file, \$\("new-project-author"\)\?\.value \|\| ""\)/);
  assert.match(
    bindings,
    /apiSaveProject\(\{[\s\S]*?author:\s*\$\("new-project-author"\)\?\.value\.trim\(\) \|\| "Tuntematon"[\s\S]*?chapters:/
  );
});

test('visible project metadata editing PATCHes title and author through the metadata endpoint', () => {
  const metadataApi = sourceBetween(
    manuscriptJs,
    'async function apiUpdateProjectMetadata',
    'async function apiPatchMetadata'
  );
  assert.match(metadataApi, /\/projects\/" \+ projectId \+ "\/metadata"/);
  assert.match(metadataApi, /jsonOptions\("PATCH", metadata\)/);

  const editFlow = sourceBetween(
    manuscriptJs,
    'async function renameProjectFromLibrary',
    'async function deleteProjectFromLibrary'
  );
  assert.match(editFlow, /querySelector\("\.project-title-edit"\)/);
  assert.match(editFlow, /querySelector\("\.project-author-edit"\)/);
  assert.match(editFlow, /if \(title !== String\(item\.title \|\| ""\)\.trim\(\)\) metadata\.title = title/);
  assert.match(editFlow, /if \(author !== projectAuthorValue\(item\.author\)\) metadata\.author = author/);
  assert.match(editFlow, /apiUpdateProjectMetadata\(item\.id, metadata\)/);

  const renderedCard = sourceBetween(
    manuscriptJs,
    'function renderLibrary()',
    'function projectHasText'
  );
  assert.match(renderedCard, /project-rename-toggle";[\s\S]*?textContent = "Muokkaa tietoja"/);
  assert.match(renderedCard, /class="project-author-edit"/);
  assert.match(renderedCard, /projectAuthorValue\(item\.author\)/);
  assert.match(renderedCard, /value="' \+ escapeAttribute\(item\.title \|\| ""\)/);
  assert.match(renderedCard, /value="' \+ escapeAttribute\(projectAuthorValue\(item\.author\)\)/);

  const escapingHelpers = sourceBetween(
    manuscriptJs,
    'function escapeHtml',
    'let toastTimer'
  );
  assert.match(escapingHelpers, /function escapeAttribute\(text\)/);
  assert.match(escapingHelpers, /replace\(\/"\/g, "&quot;"\)\.replace\(\/\'\/g, "&#39;"\)/);
});

test('author metadata changes are synchronized from the iframe into parent project state', () => {
  const editFlow = sourceBetween(
    manuscriptJs,
    'async function renameProjectFromLibrary',
    'async function deleteProjectFromLibrary'
  );
  assert.match(
    editFlow,
    /notifyParent\("skriptlab:project-renamed", \{[\s\S]*?author:\s*item\.author,[\s\S]*?project:\s*updated/
  );

  const detailSave = sourceBetween(
    manuscriptJs,
    'function scheduleProjectInfoSave()',
    '/* ------------------------------------------------------------ analyysi */'
  );
  assert.match(detailSave, /if \(title !== String\(project\.title \|\| ""\)\.trim\(\)\) metadata\.title = title/);
  assert.match(detailSave, /if \(author !== projectAuthorValue\(project\.author\)\) metadata\.author = author/);
  assert.match(detailSave, /apiUpdateProjectMetadata\(project\.id, metadata\)/);
  assert.match(detailSave, /rememberActiveProject\(project\)/);
  assert.match(detailSave, /notifyParent\("skriptlab:project-renamed", \{[\s\S]*?author:\s*project\.author/);

  const parentHandler = sourceBetween(
    appJs,
    "if (message.type === 'skriptlab:project-renamed')",
    "if (message.type === 'skriptlab:open-library-publish')"
  );
  assert.match(parentHandler, /message\.author \?\? message\.project\?\.author/);
  assert.match(parentHandler, /Object\.assign\(\{\}, project, \{ title, author \}\)/);
  assert.match(parentHandler, /window\.manuscriptData\.author = author/);
});

test('placeholder detection accepts inferred authors but never replaces a canonical author', () => {
  const context = evaluateAppAuthorHelpers({
    author: 'Kanoninen Tekijä',
    analysis: { product_info: { author: 'Analyysin ehdotus' } }
  });

  for (const placeholder of [
    '',
    '  TUNTEMATON  ',
    'Tuntematon.',
    'Tuntematon kirjailija',
    '[tekijä]',
    'Ei tiedossa',
    'Ei tiedossa.',
    'N/A',
    '—',
    'Ei ilmene käsikirjoituksesta',
    'UNKNOWN AUTHOR'
  ]) {
    assert.equal(context.isMissingProjectAuthor(placeholder), true, `${placeholder} must be treated as missing`);
    assert.equal(context.meaningfulProjectAuthor(placeholder), '');
  }
  assert.equal(context.isMissingProjectAuthor('Kanoninen Tekijä'), false);
  assert.equal(context.meaningfulProjectAuthor('  Kanoninen   Tekijä  '), 'Kanoninen Tekijä');
  assert.equal(context.coverAuthorFromProject(), 'Kanoninen Tekijä');

  context.window.manuscriptData.author = 'Tuntematon';
  assert.equal(context.coverAuthorFromProject(), 'Analyysin ehdotus');

  const productInfo = sourceBetween(
    appJs,
    'function productInfoFromAnalysis()',
    'function setProductFields'
  );
  assert.match(
    productInfo,
    /info\.author = meaningfulProjectAuthor\(window\.manuscriptData\?\.author\)\s*\|\| meaningfulProjectAuthor\(info\.author\)/
  );
});

test('only the backend promotes analyzed authors and save responses can replace placeholders', () => {
  const applyAnalysis = sourceBetween(
    appJs,
    'async function applyAnalysisResult',
    'if(runAnalysisBtn)'
  );
  assert.doesNotMatch(applyAnalysis, /window\.manuscriptData\.author\s*=\s*.*r\.(?:author|product_info)/);
  assert.match(applyAnalysis, /const savedProject = await window\.saveManuscriptToDB\(window\.manuscriptData\)/);

  const generatedProductInfo = sourceBetween(
    appJs,
    'async function generateProductInfo',
    'function marketingAnalysisText'
  );
  assert.doesNotMatch(generatedProductInfo, /window\.manuscriptData\.author\s*=\s*meaningfulProjectAuthor\(data\.author\)/);

  const saveProject = sourceBetween(
    appJs,
    'window.saveManuscriptToDB = function',
    'window.replaceProjectChaptersInDB = function'
  );
  assert.match(saveProject, /if \(meaningfulProjectAuthor\(currentAuthor\)\) data\.author = currentAuthor/);
  assert.doesNotMatch(saveProject, /if \(currentAuthor\) data\.author = currentAuthor/);
});

test('manual product-info author synchronization reports failures without an unhandled rejection', () => {
  const saveProductInfo = sourceBetween(
    appJs,
    'async function saveProductInfo()',
    'function renderProductInfo'
  );
  assert.match(saveProductInfo, /if \(button\?\.disabled\) return null/);
  assert.match(saveProductInfo, /info\.author = canonicalAuthor/);
  assert.match(saveProductInfo, /info\.missing_fields = productMissingFieldKeys\(info\)/);
  assert.match(saveProductInfo, /if \(canonicalAuthor !== currentAuthor\)/);
  assert.match(saveProductInfo, /body: JSON\.stringify\(\{ author: canonicalAuthor \}\)/);
  assert.match(saveProductInfo, /catch \(error\) \{[\s\S]*?setProductStatus\([^;]+, true\);[\s\S]*?return null/);
  assert.match(saveProductInfo, /finally \{\s*if \(button\) button\.disabled = false/);

  const missingFields = sourceBetween(
    appJs,
    'function productFieldHasValue',
    'function currentProductBookMetrics'
  );
  assert.match(missingFields, /key === 'author'[\s\S]*?meaningfulProjectAuthor\(value\)/);
  assert.match(missingFields, /productFieldHasValue\(key, info\?\.\[key\]\)/);
});

test('author-flow assets use one current cache-busted manuscript bundle', () => {
  const manuscriptSources = Array.from(
    indexHtml.matchAll(/src="(manuskripti\.html[^"]*)"/g),
    (match) => match[1]
  );
  assert.equal(manuscriptSources.length, 3);
  assert.ok(manuscriptSources.every((source) => (
    new URL(source, 'https://example.test/').searchParams.get('v') === '31'
  )));
  assert.match(indexHtml, /<script src="app\.js\?v=224"><\/script>/);
  assert.match(manuscriptHtml, /href="manuskripti\.css\?v=14"/);
  assert.match(manuscriptHtml, /src="manuskripti\.js\?v=36"/);

  const refreshFlow = sourceBetween(
    appJs,
    'function refreshManuskriptiFrame',
    'function refreshMobileEditorFrame'
  );
  assert.match(refreshFlow, /params\.set\('v', '31'\)/);
});
