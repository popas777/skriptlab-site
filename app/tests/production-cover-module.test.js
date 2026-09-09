const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(appRoot, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(appRoot, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(appRoot, 'tuotanto.html'), 'utf8');
const js = fs.readFileSync(path.join(appRoot, 'tuotanto.js'), 'utf8');

test('Taitto exposes an explicit optional front-cover selection', () => {
  assert.match(
    html,
    /<label[^>]*for="layout-cover-select"[^>]*>Kansikuva PDF- ja EPUB-tiedostoihin<\/label>/,
  );
  assert.match(
    html,
    /<select[^>]*id="layout-cover-select"[^>]*>[\s\S]*?<option value="">Ei kansikuvaa<\/option>/,
  );
  assert.match(html, /id="layout-cover-help"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(js, /\/projects\/" \+ activeId \+ "\/layout-cover-options"/);
  assert.match(js, /select\.replaceChildren\(new Option\("Ei kansikuvaa", ""\)\)/);
  assert.doesNotMatch(js, /select\.value\s*=\s*String\(layoutCoverOptions\[0\]/);
});

test('cover id is sent only for PDF or EPUB and other exports use null', () => {
  assert.match(js, /return outputFormats\.includes\("pdf"\) \|\| outputFormats\.includes\("epub"\)/);
  assert.match(js, /if \(!coverFormatsSelected\(outputFormats\)\) return null/);
  assert.match(js, /cover_asset_id:\s*coverAssetId/);
  assert.match(js, /select\.disabled\s*=\s*layoutCoverLoadState !== "ready" \|\| !hasOptions \|\| !supportsCover/);
  assert.match(js, /Valitse PDF tai EPUB käyttääksesi kansikuvaa/);
});

test('returning to Taitto refreshes covers while boot avoids a duplicate request', () => {
  assert.match(js, /function switchTab\(next, refresh = true, refreshCovers = true\)/);
  assert.match(js, /if \(refreshCovers\) refreshLayoutCoverOptions\(\)/);
  assert.match(js, /switchTab\(tab, true, false\)/);
  assert.match(js, /layoutCoverLoadState = "error"/);
});

test('main workspace cache versions expose the new embedded Taitto code', () => {
  assert.match(indexHtml, /tuotanto\.html\?module=aineistot&tab=aineistot&v=18/);
  assert.match(indexHtml, /tuotanto\.html\?module=taitto&tab=taitto&v=18/);
  assert.match(indexHtml, /<script src="app\.js\?v=224"><\/script>/);
  assert.match(appJs, /params\.set\('v', '18'\);\s*updateEmbeddedModuleFrame\(frame, 'tuotanto\.html', params\)/);
});
