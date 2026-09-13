const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const navViews = [...html.slice(html.indexOf('<ul id="nav-menu">'), html.indexOf('</ul>', html.indexOf('<ul id="nav-menu">'))).matchAll(/data-view="([^"]+)"/g)].map(match => match[1]);
const demoViews = ['view-kirjani', 'view-analyysi', 'view-kirjoita-editoi', 'view-kaannokset', 'view-kuvitus', 'view-audio', 'view-video', 'view-3d-studio'];

function navigation(showcaseDemoMode, planKey = '') {
  const context = vm.createContext({
    showcaseDemoMode,
    currentUser: { access_plan_key: planKey, allowed_modules: ['skill', 'biography', 'published_library'] },
    window: { SkriptLabBookAccess: { getSnapshot: () => ({ plan_key: planKey }) } },
  });
  vm.runInContext(source.slice(source.indexOf('    const basicHiddenViews ='), source.indexOf('    function customAccessViews()')) +
    source.slice(source.indexOf('    const showcaseDemoNavOrder ='), source.indexOf('    function decorateModuleNavigation()')), context);
  return view => vm.runInContext(`isViewAllowed(${JSON.stringify(view)})`, context);
}

test('demo navigation exposes exactly the eight requested modules despite old broad account grants', () => {
  const allowed = navigation(true);
  assert.deepEqual(navViews.filter(allowed).sort(), [...demoViews].sort());
  assert.equal(allowed('view-suomentaja'), true, 'the translation workspace alias remains usable');
  assert.equal(allowed('view-rakenne'), true, 'analysis structure remains usable');
  assert.equal(allowed('view-kirjoita'), false, 'the separate mobile editor stays outside the demo');
  assert.equal(allowed('view-muut-toiminnot'), false);
  assert.equal(allowed('view-unknown'), false);
});

test('demo scope survives a stale basic-plan snapshot and other plans keep module discovery', () => {
  assert.deepEqual(navViews.filter(navigation(true, 'writer_basic')).sort(), [...demoViews].sort());
  assert.deepEqual(navViews.filter(navigation(false)), navViews);
  assert.deepEqual(navViews.filter(navigation(false, 'writer_basic')), navViews.filter(view => !['view-skill', 'view-notebooklm'].includes(view)));
});
