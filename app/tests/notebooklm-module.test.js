const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(appRoot, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(appRoot, 'app.js'), 'utf8');
const appCss = fs.readFileSync(path.join(appRoot, 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(appRoot, 'notebooklm.html'), 'utf8');
const css = fs.readFileSync(path.join(appRoot, 'notebooklm.css'), 'utf8');
const js = fs.readFileSync(path.join(appRoot, 'notebooklm.js'), 'utf8');

function expectId(id) {
  assert.match(html, new RegExp(`\\bid=["']${id}["']`), `Missing #${id}`);
}

function numericAssetVersion(source, assetName) {
  const escaped = assetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escaped}\\?v=(\\d+)`));
  assert.ok(match, `${assetName} must use a numeric cache version`);
  return Number(match[1]);
}

test('NotebookLM standalone view is Finnish, accessible and loads shared config and auth first', () => {
  assert.match(html, /<html\b[^>]*\blang=["']fi["']/);
  assert.match(html, /<main\b[^>]*aria-labelledby=["']notebooklm-title["']/);
  assert.match(html, /Käsikirjoitus käsitellään ulkoisessa palvelussa/);
  assert.match(html, /Googlen NotebookLM-palveluun/);

  for (const id of [
    'notebooklm-title', 'notebooklm-project-name', 'notebooklm-connection-badge',
    'notebooklm-notice', 'notebooklm-overview', 'notebooklm-notebook-status',
    'notebooklm-sync', 'notebooklm-stale', 'notebooklm-consent-panel',
    'notebooklm-consent', 'notebooklm-artifact-form', 'notebooklm-artifact-fieldset',
    'notebooklm-artifact-types', 'notebooklm-instructions', 'notebooklm-generate',
    'notebooklm-refresh', 'notebooklm-jobs', 'notebooklm-artifacts',
  ]) expectId(id);

  assert.match(html, /id=["']notebooklm-notice["'][^>]*role=["']status["'][^>]*aria-live=["']polite["']/);
  assert.match(html, /id=["']notebooklm-jobs["'][^>]*aria-live=["']polite["']/);
  assert.match(html, /id=["']notebooklm-artifacts["'][^>]*aria-live=["']polite["']/);
  assert.match(html, /<label\b[^>]*for=["']notebooklm-consent["']/);
  assert.match(html, /<label\b[^>]*for=["']notebooklm-instructions["']/);
  assert.match(html, /<fieldset\b[^>]*id=["']notebooklm-artifact-fieldset["']/);

  const configIndex = html.indexOf('src="config.js?v=');
  const authIndex = html.indexOf('src="auth.js?v=');
  const moduleIndex = html.indexOf('src="notebooklm.js?v=');
  assert.ok(configIndex >= 0 && configIndex < authIndex && authIndex < moduleIndex);
  numericAssetVersion(html, 'notebooklm.css');
  numericAssetVersion(html, 'notebooklm.js');
});

test('NotebookLM exposes the exact 11 canonical artifact types and download matrix', () => {
  const block = js.match(/const\s+FALLBACK_ARTIFACT_TYPES\s*=\s*Object\.freeze\(\[([\s\S]*?)\n\s*\]\);/);
  assert.ok(block, 'Missing fallback artifact catalog');
  const types = Array.from(block[1].matchAll(/Object\.freeze\(\{\s*type:\s*'([^']+)'/g), (match) => match[1]);
  assert.deepEqual(types, [
    'audio', 'video', 'cinematic', 'slides', 'report', 'study-guide',
    'quiz', 'flashcards', 'mind-map', 'infographic', 'data-table',
  ]);

  const expectedFormats = {
    audio: ['m4a'],
    video: ['mp4'],
    cinematic: ['mp4'],
    slides: ['pdf', 'pptx'],
    report: ['md'],
    'study-guide': ['md'],
    quiz: ['json', 'markdown', 'html'],
    flashcards: ['json', 'markdown', 'html'],
    'mind-map': ['json'],
    infographic: ['png'],
    'data-table': ['csv'],
  };
  for (const [type, formats] of Object.entries(expectedFormats)) {
    const entry = block[1].match(new RegExp(`type:\\s*'${type}'[^\\n]+download_formats:\\s*\\[([^\\]]+)\\]`));
    assert.ok(entry, `Missing download formats for ${type}`);
    for (const format of formats) assert.match(entry[1], new RegExp(`['"]${format}['"]`));
  }

  assert.match(js, /normalizeArtifactTypes\(root\.artifact_types\)/);
  assert.match(js, /raw\.download_formats\s*\|\|\s*raw\.formats/);
  assert.match(js, /direct\s*\|\|\s*spec\.download_formats/);
  assert.match(js, /state\.artifactTypes\.forEach/);
});

test('NotebookLM implements the authenticated project sync, generation and download API contract', () => {
  assert.match(js, /window\.SkriptLabAuth\.fetch\(path, options\)/);
  assert.match(js, /\/api\/projects\/\$\{encodeURIComponent\(state\.projectId\)\}\/notebooklm/);
  assert.match(js, /endpoint\(`\?include_remote=\$\{includeRemote \? 'true' : 'false'\}`\)/);

  assert.match(js, /jsonRequest\(endpoint\('\/sync'\),\s*\{[\s\S]*?method:\s*'POST'[\s\S]*?confirmed_external_processing:\s*true/);
  assert.match(js, /jsonRequest\(endpoint\('\/artifacts'\),\s*\{[\s\S]*?method:\s*'POST'/);
  assert.match(js, /artifact_type:\s*artifactTypeValue/);
  assert.match(js, /language:\s*'fi'/);
  assert.match(js, /instructions,/);
  assert.match(js, /options:\s*\{\}/);

  assert.match(js, /endpoint\(`\/artifacts\/\$\{encodeURIComponent\(artifactId\)\}\/download`\)/);
  assert.match(js, /params\.set\('type', safeType\)/);
  assert.match(js, /params\.set\('format', safeFormat\)/);
  assert.match(js, /await window\.SkriptLabAuth\.fetch\(/);
  assert.match(js, /await response\.blob\(\)/);
  assert.match(js, /URL\.createObjectURL\(blob\)/);
  assert.match(js, /URL\.revokeObjectURL\(objectUrl\)/);
});

test('first sync requires explicit external-processing consent', () => {
  assert.match(html, /id=["']notebooklm-consent["'][^>]*type=["']checkbox["']/);
  assert.match(html, /Hyväksyn käsikirjoituksen lähettämisen NotebookLM:ään/);
  assert.match(js, /if\s*\(!state\.notebook\s*&&\s*!elements\[['"]notebooklm-consent['"]\]\.checked\)/);
  assert.match(js, /elements\[['"]notebooklm-consent['"]\]\.focus\(\)/);
  assert.match(js, /const\s+consentGiven\s*=\s*elements\[['"]notebooklm-consent['"]\]\.checked/);
  assert.match(js, /!firstSync\s*\|\|\s*consentGiven/);
  assert.match(js, /confirmed_external_processing:\s*true/);
});

test('connection, notebook, stale, active job, ready and error states are represented', () => {
  assert.match(js, /configured:\s*Boolean\(connection\.configured\)/);
  assert.match(js, /authenticated:\s*Boolean\(connection\.authenticated\)/);
  assert.match(js, /experimental:\s*Boolean\(connection\.experimental\)/);
  assert.match(js, /if\s*\(!state\.projectId\)/);
  assert.match(js, /API-asetukset puuttuvat/);
  assert.match(js, /Luo käsikirjoitukselle notebook/);
  assert.match(js, /notebook\.stale/);
  assert.match(js, /isActive\(state\.notebook\)\s*\|\|\s*state\.jobs\.some\(isActive\)/);
  assert.match(js, /const\s+ACTIVE_STATES\s*=\s*new Set\(/);
  assert.match(js, /const\s+READY_STATES\s*=\s*new Set\(/);
  assert.match(js, /const\s+ERROR_STATES\s*=\s*new Set\(/);
  assert.match(js, /state\.pollTimer\s*=\s*window\.setTimeout\(\(\)\s*=>\s*loadNotebook\(\{\s*quiet:\s*true,\s*includeRemote:\s*false\s*\}\)/);
  assert.match(js, /state\.artifacts\.filter\(\(artifact\)\s*=>\s*isReady\(artifact\)\)/);
  assert.match(html, /id=["']notebooklm-stale["'][^>]*role=["']status["']/);
});

test('dynamic server data is rendered with DOM nodes and external URLs are restricted', () => {
  assert.match(js, /document\.createElement\('(?:label|input|strong|small|article|button|a)'\)/);
  assert.match(js, /document\.createTextNode|\.textContent\s*=/);
  assert.match(js, /\.replaceChildren\(\)/);
  assert.doesNotMatch(js, /\.innerHTML\s*=/);
  assert.match(js, /function\s+safeExternalUrl\(value\)/);
  assert.match(js, /url\.protocol\s*===\s*'https:'/);
  assert.match(js, /url\.hostname\s*===\s*'notebooklm\.google\.com'/);
  assert.match(html, /rel=["']noopener noreferrer["']/);
});

test('NotebookLM follows same-origin active-project messages and resets project-local UI state', () => {
  assert.match(js, /event\.origin\s*!==\s*window\.location\.origin/);
  assert.match(js, /event\.data\?\.type\s*!==\s*'skriptlab:notebooklm-project-changed'/);
  assert.match(js, /url\.searchParams\.set\('project', String\(nextId\)\)/);
  assert.match(js, /elements\[['"]notebooklm-consent['"]\]\.checked\s*=\s*false/);
  assert.match(js, /state\.requestRevision\s*\+=\s*1/);
  assert.match(js, /loadWorkspace\(\)/);
});

test('NotebookLM layout has keyboard focus, responsive and reduced-motion styles', () => {
  assert.match(css, /button:focus-visible/);
  assert.match(css, /input:focus-visible/);
  assert.match(css, /textarea:focus-visible/);
  assert.match(css, /@media \(max-width: 650px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.artifact-type-grid\s*\{/);
  assert.match(css, /\.workspace-grid\s*\{/);
});

test('main workspace mounts NotebookLM after Grafiikka and refreshes its iframe', () => {
  const coverNav = indexHtml.indexOf('data-view="view-kuvitus"');
  const notebookNav = indexHtml.indexOf('data-view="view-notebooklm"');
  const supportNav = indexHtml.indexOf('data-view="view-oheisaineistot"');
  assert.ok(coverNav >= 0 && coverNav < notebookNav && notebookNav < supportNav);
  assert.match(indexHtml, /<li\b[^>]*data-view=["']view-notebooklm["'][^>]*>\s*NotebookLM\s*<\/li>/);
  assert.match(
    indexHtml,
    /id=["']view-notebooklm["'][\s\S]*?<iframe\b(?=[^>]*id=["']notebooklm-frame["'])(?=[^>]*class=["']notebooklm-frame["'])(?=[^>]*title=["']NotebookLM["'])(?=[^>]*src=["']notebooklm\.html\?v=\d+["'])/,
  );
  numericAssetVersion(indexHtml, 'notebooklm.html');
  numericAssetVersion(indexHtml, 'styles.css');
  numericAssetVersion(indexHtml, 'app.js');

  assert.match(appCss, /\.notebooklm-frame/);
  assert.match(appJs, /notebooklm:\s*\[\s*['"]view-notebooklm['"]\s*\]/);
  assert.match(appJs, /function\s+refreshNotebookLMFrame\(\)/);
  assert.match(appJs, /type:\s*['"]skriptlab:notebooklm-project-changed['"]/);
  assert.match(appJs, /if\s*\(viewId\s*===\s*['"]view-notebooklm['"]\)\s*\{\s*refreshNotebookLMFrame\(\);\s*\}/);
});
