const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(appRoot, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(appRoot, 'app.js'), 'utf8');
const appCss = fs.readFileSync(path.join(appRoot, 'styles.css'), 'utf8');

function numericAssetVersion(source, assetName) {
  const escaped = assetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escaped}\\?v=(\\d+)`));
  assert.ok(match, `${assetName} must use a numeric cache version`);
  return Number(match[1]);
}

test('Library is the last module after corrections and is mounted in an accessible iframe', () => {
  const correctionsNav = indexHtml.indexOf('data-view="view-korjaukset"');
  const libraryNav = indexHtml.indexOf('data-view="view-kirjasto"');
  const navEnd = indexHtml.indexOf('</ul>', libraryNav);
  const libraryNavEnd = indexHtml.indexOf('</li>', libraryNav) + '</li>'.length;
  assert.ok(correctionsNav >= 0 && correctionsNav < libraryNav && libraryNav < navEnd);
  assert.doesNotMatch(indexHtml.slice(libraryNavEnd, navEnd), /data-view=/);

  assert.match(
    indexHtml,
    /id=["']view-kirjasto["'][^>]*class=["'][^"']*view-section[^"']*hidden[^"']*["'][\s\S]*?<iframe\b(?=[^>]*id=["']kirjasto-frame["'])(?=[^>]*class=["']kirjasto-frame["'])(?=[^>]*src=["']kirjasto\.html\?v=3["'])(?=[^>]*title=["']Julkaistujen teosten kirjasto["'])/
  );
  assert.match(indexHtml, /id=["']kirjasto-frame["'][\s\S]*?loading=["']lazy["']/);
});

test('Library access is limited to full-workspace roles or an explicitly allowed access module', () => {
  assert.match(appJs, /const\s+fullWorkspaceRoles\s*=\s*new Set\(\[['"]admin['"],\s*['"]test_user['"]\]\)/);
  assert.match(appJs, /published_library:\s*\[['"]view-kirjasto['"]\]/);

  const writerViews = appJs.match(/const\s+writerViews\s*=\s*new Set\(\[([^\]]+)\]\)/);
  const biographyViews = appJs.match(/const\s+biographyViews\s*=\s*new Set\(\[([^\]]+)\]\)/);
  assert.ok(writerViews && biographyViews, 'Role view declarations must remain inspectable');
  assert.doesNotMatch(writerViews[1], /view-kirjasto/);
  assert.doesNotMatch(biographyViews[1], /view-kirjasto/);
  assert.match(appJs, /!allowedModules\.has\(['"]manuscripts['"]\)\s*&&\s*allowedModules\.has\(['"]published_library['"]\)[\s\S]*?return ['"]view-kirjasto['"]/);
});

test('A biography-only access group lands directly in the biography workspace', () => {
  assert.match(
    appJs,
    /const biographyWorkspaceOnly = allowedModules\.has\(['"]biography['"]\)[\s\S]*?moduleKey === ['"]manuscripts['"] \|\| moduleKey === ['"]biography['"]/
  );
  assert.match(
    appJs,
    /if \(biographyWorkspaceOnly\) \{\s*return ['"]view-elamakerta['"];\s*\}/
  );
});

test('Full-workspace roles pin the allowed Library nav item in the collapsed module menu', () => {
  assert.match(
    appJs,
    /const pinnedLibraryItem = canSeeAllModules\s*\?\s*availableItems\.find\(item => item\.dataset\.view === ['"]view-kirjasto['"]\)\s*:\s*null/
  );
  assert.match(appJs, /reserveCollapsedItem\(pinnedLibraryItem\)/);
  assert.match(appJs, /reserveCollapsedItem\(activeItem, pinnedLibraryItem\)/);

  const accessFiltering = appJs.indexOf("if (!isViewAllowed(viewId))");
  const overflowFiltering = appJs.indexOf("const availableItems = Array.from(navMenu.querySelectorAll('li[data-view]'))");
  assert.ok(accessFiltering >= 0 && accessFiltering < overflowFiltering, 'Access filtering must run before overflow pinning');
  assert.match(appJs, /const availableItems =[\s\S]{0,180}\.filter\(item => !item\.hidden\)/);
});

test('Library shell exchanges active-project and theme context without requiring a project', () => {
  assert.match(appJs, /function\s+refreshLibraryFrame\s*\(/);
  assert.match(appJs, /type:\s*['"]skriptlab:library-context-changed['"]/);
  assert.match(appJs, /projectId[\s\S]*?\|\|\s*null/);
  assert.match(appJs, /theme:\s*document\.documentElement\.getAttribute\(['"]data-theme['"]\)\s*===\s*['"]dark['"]\s*\?\s*['"]dark['"]\s*:\s*['"]light['"]/);
  assert.match(appJs, /themaClasses/);
  assert.match(appJs, /toggleThemeBtn\.addEventListener\(['"]click['"][\s\S]*?refreshLibraryFrame\(\)/);
  assert.match(appJs, /function\s+clearActiveManuscript\s*\([\s\S]*?refreshLibraryFrame\(\)/);
  assert.match(appJs, /function\s+setActiveManuscript\s*\([\s\S]*?refreshLibraryFrame\(\)/);
  assert.match(appJs, /if\s*\(viewId\s*===\s*['"]view-kirjasto['"]\)\s*\{\s*refreshLibraryFrame\(\);\s*\}/);
});

test('Production and correction flows can open the Library publish form through a same-origin message', () => {
  assert.match(appJs, /event\.origin\s*!==\s*window\.location\.origin/);
  assert.match(appJs, /message\.type\s*===\s*['"]skriptlab:open-library-publish['"]/);
  assert.match(appJs, /type:\s*['"]skriptlab:library-open-publish['"]/);
  assert.match(appJs, /source:\s*normalizedLibraryPublishSource/);
  assert.match(appJs, /publicationId:\s*safeLibraryMessageId/);
  assert.match(appJs, /packageId:\s*safeLibraryMessageId/);
  assert.match(appJs, /window\.openLibraryPublishFlow\s*=\s*openLibraryPublishFlow/);
  assert.match(appJs, /if\s*\(!isViewAllowed\(['"]view-kirjasto['"]\)\)\s*return false/);
});

test('Library gets an independent top-bar context and a responsive full-height frame', () => {
  assert.match(appJs, /canonicalViewId\(viewId\)\s*===\s*['"]view-kirjasto['"][\s\S]*?Kirjasto: julkaistut teokset/);
  assert.match(appJs, /button\.hidden\s*=\s*currentViewId\s*===\s*['"]view-kirjasto['"]/);
  assert.match(appCss, /\.kirjasto-frame,/);
  assert.match(appCss, /\.kirjasto-frame\s*\{[\s\S]*?height:\s*calc\(100dvh\s*-\s*var\(--topbar-height\)/);
  assert.match(appCss, /@media\s*\(max-width:\s*860px\)[\s\S]*?\.kirjasto-frame\s*\{/);
  assert.match(appCss, /\.app-wrapper\.mobile-simulate\s+\.kirjasto-frame\s*\{/);
});

test('Shell assets use the current cache versions', () => {
  assert.equal(numericAssetVersion(indexHtml, 'styles.css'), 122);
  assert.equal(numericAssetVersion(indexHtml, 'app.js'), 225);
  assert.equal(numericAssetVersion(indexHtml, 'kirjasto.html'), 3);
});
