const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appRoot = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(appRoot, 'index.html'), 'utf8');
const timelineJs = fs.readFileSync(path.join(appRoot, 'timeline.js'), 'utf8');
const timelineCss = fs.readFileSync(path.join(appRoot, 'timeline.css'), 'utf8');
const appJs = fs.readFileSync(path.join(appRoot, 'app.js'), 'utf8');

function loadTimelineTestApi() {
  const documentListeners = new Map();
  const sandbox = {
    window: {
      addEventListener() {},
      dispatchEvent() {},
      setTimeout,
    },
    document: {
      readyState: 'loading',
      addEventListener(name, callback) {
        documentListeners.set(name, callback);
      },
    },
    localStorage: {
      getItem() { return null; },
      setItem() {},
    },
    CustomEvent: class CustomEvent {},
    console,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(timelineJs, sandbox, { filename: 'timeline.js' });
  assert.ok(documentListeners.has('DOMContentLoaded'), 'timeline module must wait for its DOM mount point');
  return sandbox.window.SkriptLabTimeline._test;
}

test('timeline workspace exposes every requested scheduling field and independent assets', () => {
  assert.match(indexHtml, /timeline\.css\?v=1/);
  assert.match(indexHtml, /timeline\.js\?v=1/);
  assert.match(indexHtml, /id="timeline-add-task-btn"[^>]*>\+ Lisää oma tehtävä</);
  assert.match(indexHtml, /id="timeline-task-title"[^>]*maxlength="160"/);
  assert.match(indexHtml, /<span>Työ alkaa<\/span>[\s\S]*?id="timeline-task-start" type="date"/);
  assert.match(indexHtml, /<span>DL<\/span>[\s\S]*?id="timeline-task-deadline" type="date"/);
  assert.match(indexHtml, /<span>Tekijä<\/span>[\s\S]*?id="timeline-task-assignee"/);
  assert.match(indexHtml, /id="timeline-task-details" maxlength="50000"/);
  assert.match(indexHtml, /pääaikajanalla näytetään vain tekstin alku/);
  assert.match(indexHtml, /id="timeline-delete-task-btn"[^>]*hidden>Poista oma tehtävä</);
});

test('default timeline covers the book, publication, campaigns and translation lifecycle', () => {
  const api = loadTimelineTestApi();
  const titles = api.defaultTasks.map((task) => task.title);

  assert.equal(api.scheduleKey, 'publishing_timeline');
  assert.ok(titles.includes('Käsikirjoitus valmis'));
  assert.ok(titles.includes('Markkinointimateriaalien teko'));
  assert.ok(titles.includes('Ilmestyminen'));
  assert.ok(titles.includes('Ilmestymisen jälkeiset kampanjat'));
  assert.ok(titles.includes('Käännösprojekti alkaa'));
  assert.equal(api.defaultTasks.length, 12);
  assert.ok(api.defaultTasks.every((task) => (
    task.status === 'not_started'
    && task.start_date === ''
    && task.deadline_date === ''
    && task.assignee === ''
  )));
});

test('normalization retains edited defaults, long details and removable custom tasks', () => {
  const api = loadTimelineTestApi();
  const longDetails = `Brief: ${'pitkä lisätieto '.repeat(1800)}`;
  const schedule = api.normalizeSchedule({
    schema_version: 1,
    tasks: [
      {
        id: 'saved-publication',
        template_key: 'publication',
        title: 'Kirja ilmestyy',
        phase: 'launch',
        status: 'in_progress',
        start_date: '2026-09-01',
        deadline_date: '2026-10-15',
        assignee: 'Julkaisutiimi',
        details: longDetails,
      },
      {
        id: 'timeline-custom-review-copies',
        template_key: null,
        title: 'Arvostelukappaleet medialle',
        phase: 'launch',
        status: 'not_started',
        start_date: '2026-08-01',
        deadline_date: '2026-08-20',
        assignee: 'Viestintä',
        details: 'Postituslista ja saateviesti.',
        custom: true,
        sort_order: 500,
      },
    ],
  });

  const publication = schedule.tasks.find((task) => task.template_key === 'publication');
  const custom = schedule.tasks.find((task) => task.id === 'timeline-custom-review-copies');
  assert.equal(schedule.tasks.length, 13);
  assert.equal(publication.title, 'Kirja ilmestyy');
  assert.equal(publication.assignee, 'Julkaisutiimi');
  assert.equal(publication.details, longDetails);
  assert.equal(custom.custom, true);
  assert.equal(custom.template_key, null);
});

test('main-card preview is bounded without shortening stored details', () => {
  const api = loadTimelineTestApi();
  const details = `Ensimmäinen tärkeä ohje. ${'Lisätietoa julkaisusta ja hyväksynnöistä. '.repeat(20)}`;
  const preview = api.truncateDetails(details);

  assert.ok(preview.startsWith('Ensimmäinen tärkeä ohje.'));
  assert.ok(preview.endsWith('…'));
  assert.ok(preview.length <= 190);
  assert.ok(details.length > preview.length);
  assert.doesNotMatch(timelineJs, /\.innerHTML\s*=/, 'user-entered timeline text must be rendered with DOM text nodes');
  assert.match(timelineJs, /node\.textContent = text/);
});

test('date validation rejects a deadline before work starts', () => {
  const api = loadTimelineTestApi();
  assert.equal(api.validateTaskDates('2026-09-01', '2026-08-31'), 'Deadline ei voi olla ennen työn aloitusta.');
  assert.equal(api.validateTaskDates('2026-09-01', '2026-09-01'), '');
  assert.equal(api.validateTaskDates('', '2026-09-01'), '');
  assert.match(api.formatDate('2026-09-01'), /2026/);
});

test('timeline persists one project-scoped snapshot and only deletes custom tasks', () => {
  assert.match(timelineJs, /async function fetchLatestProject\(projectId\)/);
  assert.match(timelineJs, /cache: 'no-store'/);
  assert.match(timelineJs, /\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/metadata/);
  assert.match(timelineJs, /analysis: \{ \[SCHEDULE_KEY\]: schedule \}/);
  assert.match(timelineJs, /publishing_timeline_revision: saveContext\.revision/);
  assert.match(timelineJs, /latestSignature !== saveContext\.sourceSignature/);
  assert.match(timelineJs, /applyScheduleToActiveProject\(projectId, latestSchedule, \{ refreshState: true \}\)/);
  assert.match(timelineJs, /response\.status === 409/);
  assert.match(timelineJs, /applyScheduleToActiveProject\(projectId, conflictSchedule, \{ refreshState: true \}\)/);
  assert.match(timelineJs, /Uusin versio ladattiin; sulje editori/);
  assert.match(timelineJs, /state\.editingSourceSignature = state\.sourceSignature/);
  assert.match(timelineJs, /if \(state\.saving && !options\.force\) return/);
  assert.equal((timelineJs.match(/state\.sourceRevision = saved\.revision;\s*render\(\);/g) || []).length, 2);
  assert.match(timelineJs, /if \(!task\?\.custom\) return/);
  assert.match(timelineJs, /state\.tasks\.filter\(item => item\.id !== task\.id\)/);
  assert.match(timelineJs, /Aktiivinen kirjaprojekti vaihtui/);
});

test('timeline conflict signature is deterministic across JSON key order', () => {
  const api = loadTimelineTestApi();
  const first = api.scheduleSignature({ schema_version: 1, tasks: [{ id: 'a', title: 'A' }] });
  const second = api.scheduleSignature({ tasks: [{ title: 'A', id: 'a' }], schema_version: 1 });

  assert.equal(first, second);
  assert.equal(api.scheduleSignature(null), 'null');
  assert.equal(api.scheduleRevision({ updated_at: '2026-08-28T10:00:00.000Z' }), '2026-08-28T10:00:00.000Z');
  assert.equal(api.scheduleRevision(null), '');
});

test('view-only task details stay focusable and saving locks every close control', () => {
  assert.match(timelineJs, /field\.readOnly = !editable/);
  assert.match(timelineJs, /elements\.closeButton\.disabled = saving/);
  assert.match(timelineJs, /elements\.cancelButton\.disabled = saving/);
  assert.match(timelineJs, /elements\.dialog\.setAttribute\('aria-busy', String\(saving\)\)/);
  assert.match(timelineJs, /focusTarget\.focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(timelineJs, /window\.setTimeout\(\(\) => \{\s*elements\.dialog\.scrollTop/);
});

test('cross-tab synchronization merges only timeline data into the active manuscript', () => {
  assert.match(timelineJs, /Object\.prototype\.hasOwnProperty\.call\(storedAnalysis, SCHEDULE_KEY\)/);
  assert.match(timelineJs, /window\.manuscriptData\.analysis = \{/);
  assert.doesNotMatch(timelineJs, /window\.manuscriptData = storedProject/);
});

test('whole-project saves keep the server timeline authoritative in local state', () => {
  assert.match(indexHtml, /app\.js\?v=223/);
  assert.match(appJs, /Object\.prototype\.hasOwnProperty\.call\(savedAnalysis, 'publishing_timeline'\)/);
  assert.match(appJs, /mergedAnalysis\.publishing_timeline = savedAnalysis\.publishing_timeline/);
  assert.match(appJs, /delete mergedAnalysis\.publishing_timeline/);
});

test('timeline layout supports mobile, simulated mobile and reduced motion', () => {
  assert.match(timelineCss, /@media \(max-width: 640px\)/);
  assert.match(timelineCss, /\.app-wrapper\.mobile-simulate \.timeline-overview/);
  assert.match(timelineCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(timelineCss, /\.timeline-task-dialog::backdrop/);
  assert.match(timelineCss, /\.timeline-task-meta\s*\{[\s\S]*?grid-template-columns: repeat\(3/);
  assert.match(timelineCss, /html\[data-theme="light"\] \.timeline-filter\.is-active,[\s\S]*?color: #047857/);
  assert.match(timelineCss, /html\[data-theme="light"\] \.timeline-form-error,[\s\S]*?color: #b42318/);
  assert.doesNotMatch(timelineCss, /content:\s*"◷"/);
});
