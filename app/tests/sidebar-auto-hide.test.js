const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(appRoot, 'app.js'), 'utf8');
const appCss = fs.readFileSync(path.join(appRoot, 'styles.css'), 'utf8');

test('space-intensive modules automatically hide the desktop module sidebar', () => {
  const configuredViews = appJs.match(
    /const\s+SIDEBAR_AUTO_HIDE_VIEWS\s*=\s*new Set\(\[([\s\S]*?)\]\);/
  );
  assert.ok(configuredViews, 'Auto-hide module configuration must remain explicit');
  for (const viewId of ['view-kirjoita-editoi', 'view-kuvitus', 'view-kaannokset']) {
    assert.match(configuredViews[1], new RegExp(`['"]${viewId}['"]`));
  }

  assert.match(
    appJs,
    /function\s+autoHideSidebarForView\s*\(viewId\)\s*\{[\s\S]*?SIDEBAR_AUTO_HIDE_VIEWS\.has\(navViewFor\(viewId\)\)[\s\S]*?sidebar\.classList\.add\(['"]hidden['"]\)[\s\S]*?syncSidebarMode\(\)/
  );
  assert.match(
    appJs,
    /currentViewId\s*=\s*activeNavViewId;[\s\S]{0,500}?autoHideSidebarForView\(currentViewId\);/
  );
});

test('mobile drawer closing and the manual desktop toggle remain available', () => {
  assert.match(
    appJs,
    /function\s+autoHideSidebarForView[\s\S]*?if\s*\(isMobileShell\(\)\)\s*\{\s*setSidebarDrawer\(false\);/
  );
  assert.match(
    appJs,
    /toggleSidebarBtn\.addEventListener\(['"]click['"][\s\S]*?sidebar\.classList\.toggle\(['"]hidden['"]\)/
  );
  assert.match(
    appJs,
    /function\s+syncSidebarAfterLayoutChange\s*\(\)\s*\{\s*syncSidebarMode\(\);[\s\S]*?if\s*\(!isMobileShell\(\)\)\s*autoHideSidebarForView\(currentViewId\);/
  );
  assert.match(
    appJs,
    /mobileLayoutQuery\.addEventListener\(['"]change['"],\s*syncSidebarAfterLayoutChange\)/
  );
});

test('biography gets the full workspace and restores the prior desktop sidebar state', () => {
  assert.match(
    appJs,
    /function\s+syncElamakertaWorkspace\s*\(nextViewId\)[\s\S]*?nextIsElamakerta\s*&&\s*elamakertaSidebarRestoreState\s*===\s*null[\s\S]*?expanded:[\s\S]*?!sidebar\.classList\.contains\(['"]hidden['"]\)[\s\S]*?collapseSidebarForElamakerta\(\)/
  );
  assert.match(
    appJs,
    /currentIsElamakerta\s*&&\s*!nextIsElamakerta[\s\S]*?sidebar\.classList\.toggle\(['"]hidden['"],\s*!restoreExpanded\)/
  );
  assert.match(
    appJs,
    /deactivateElamakertaFrame\(activeNavViewId\);\s*syncElamakertaWorkspace\(activeNavViewId\);\s*currentViewId\s*=\s*activeNavViewId;/
  );
  assert.match(appCss, /\.app-wrapper\.elamakerta-workspace-active\s+\.main-content\s*\{[\s\S]*?padding:\s*0;[\s\S]*?overflow:\s*hidden;/);
  assert.match(appCss, /\.app-wrapper\.elamakerta-workspace-active\s+\.elamakerta-frame\s*\{[\s\S]*?height:\s*100%;[\s\S]*?border-radius:\s*0;/);
});

test('biography receives the exact shell theme on load, open and theme toggle', () => {
  assert.match(appJs, /type:\s*['"]skriptlab:theme-changed['"]/);
  for (const token of [
    '--bg-color',
    '--sidebar-bg',
    '--panel-bg',
    '--text-primary',
    '--text-secondary',
    '--accent-color',
    '--border-color',
  ]) assert.match(appJs, new RegExp(`['"]${token}['"]`));
  assert.match(appJs, /frame\.contentWindow\.ElamakertaModule\?\.setTheme\?\.\(context\.theme,\s*context\.tokens\)/);
  assert.match(appJs, /frame\.contentWindow\.postMessage\(context,\s*window\.location\.origin\)/);
  assert.match(appJs, /frame\.addEventListener\(['"]load['"],\s*syncElamakertaTheme\)/);
  assert.match(appJs, /event\.data\?\.type\s*===\s*['"]skriptlab:elamakerta-ready['"]/);
  assert.match(appJs, /toggleThemeBtn\.addEventListener\(['"]click['"][\s\S]*?syncElamakertaTheme\(\);[\s\S]*?refreshLibraryFrame\(\)/);
  assert.match(appJs, /if\s*\(viewId\s*===\s*['"]view-elamakerta['"]\)\s*\{\s*syncElamakertaTheme\(\);\s*\}/);
});
