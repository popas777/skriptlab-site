const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(appRoot, 'kirjasto.html'), 'utf8');
const css = fs.readFileSync(path.join(appRoot, 'kirjasto.css'), 'utf8');
const js = fs.readFileSync(path.join(appRoot, 'kirjasto.js'), 'utf8');

test('screen-sized pages overlap, clamp to boundaries and handle short chapters', () => {
  const context = {window: {}, document: {readyState: 'loading', addEventListener() {}}};
  require('node:vm').runInNewContext(js, context);
  const metrics = context.window.SkriptLabLibrary.readerPageMetrics;
  let p = metrics(600, 2000, 0, 30);
  assert.equal(p.step, 540);
  assert.equal(p.page, 1);
  assert.equal(p.count, 4);
  assert.equal(p.next, 540);
  assert.equal(p.previous, 0);
  assert.equal(p.atStart, true);
  p = metrics(600, 2000, 1400, 30);
  assert.equal(p.page, 4);
  assert.equal(p.previous, 1080);
  assert.equal(p.next, 1400);
  assert.equal(p.atEnd, true);
  p = metrics(600, 300, 0);
  assert.equal(p.count, 1);
  assert.equal(p.atStart && p.atEnd, true);
  assert.equal(metrics(900, 2000, 500, 30).next, 840);
});

test('swipes ignore taps, vertical scrolling, diagonal movements and long selection gestures', () => {
  const context = {window: {}, document: {readyState: 'loading', addEventListener() {}}};
  require('node:vm').runInNewContext(js, context);
  const swipe = context.window.SkriptLabLibrary.swipePageDirection;
  const start = {x: 200, y: 100, time: 0};
  assert.equal(swipe(start, {x: 90, y: 110, time: 200}), 1);
  assert.equal(swipe(start, {x: 310, y: 90, time: 200}), -1);
  for (const end of [{x:190,y:100,time:200}, {x:190,y:300,time:200},
    {x:90,y:200,time:200}, {x:90,y:100,time:1000}]) assert.equal(swipe(start,end), 0);
});

test('catalog pages and facets come from the server and load-more preserves results', () => {
  for (const id of ['library-load-more', 'library-language-filter', 'library-length-filter', 'library-sort', 'library-reset-filters']) expectId(id);
  assert.match(js, /params\.set\("catalog", "true"\)/);
  assert.match(js, /params\.set\("after", state\.nextCursor\)/);
  assert.match(js, /payload\?\.total/);
  assert.match(js, /payload\.facets\.themes/);
  assert.match(js, /requestJson\(`\$\{API_ROOT\}\/works\?scope=continue&limit=6`/);
  assert.match(js, /\.\.\.state\.works, \.\.\.works\.filter/);
  assert.match(js, /append: error\.status !== 422/);
});

test('cards expose descriptions and primary actions, and the reader can search and change chapters', () => {
  assert.match(js, /description\.textContent = work\.description/);
  assert.match(js, /title\.append\(createWorkPrimaryAction\(work\)\)/);
  for (const id of ['reader-search-form', 'reader-search-results', 'reader-next-chapter', 'reader-previous-chapter']) expectId(id);
  assert.match(js, /renderChapter\(chapterIndex, \{ paragraphIndex, focus: true \}\)/);
  assert.match(js, /sequence !== state\.readerSequence/);
});

test('fractional API percentages remain percentages, not fractions', () => {
  const vm = require('node:vm');
  const context = {window: {}, document: {readyState: 'loading', addEventListener() {}}};
  vm.runInNewContext(js, context);
  for (const value of [0, 0.5, 1, 10, 100]) {
    assert.equal(context.window.SkriptLabLibrary.normalizeProgress({progress_percent: value}).percent, value);
  }
});

test('PDF-only work and format-specific locations normalize without losing text progress', () => {
  const vm = require('node:vm');
  const context = {window: {}, document: {readyState: 'loading', addEventListener() {}}};
  vm.runInNewContext(js, context);
  const api = context.window.SkriptLabLibrary;
  assert.equal(api.normalizeWork({id: 1, has_pdf: true, has_text: false}).hasText, true);
  const progress = api.normalizeProgress({media: 'pdf', pdf_page: 15, audio_track_id: 'track-0002', chapter_id: 'chapter-1'});
  assert.equal(progress.pdfPage, 15);
  assert.equal(progress.audioTrackId, 'track-0002');
  assert.equal(progress.chapterId, 'chapter-1');
  assert.equal(progress.media, 'pdf');
  assert.match(js, /"audio_track_id", "pdf_page"\]\.forEach/);
});

test('PDF is lazy and private; rich EPUB nodes never execute imported HTML', () => {
  const pdf = fs.readFileSync(path.join(appRoot, 'library-pdf.mjs'), 'utf8');
  assert.match(js, /await import\("\.\/library-pdf\.mjs\?v=2"\)/);
  assert.match(js, /READING_TAGS\.has\(block\.tag\)/);
  assert.match(js, /document\.createTextNode\(block\)/);
  assert.match(pdf, /\.\/vendor\/pdfjs-6\.3\.289\/pdf\.mjs/);
  assert.match(pdf, /signal\?\.addEventListener\("abort", destroy/);
  assert.doesNotMatch(pdf, /innerHTML|eval\(|https?:\/\//);
});

function expectId(id) {
  assert.match(html, new RegExp(`\\bid=["']${id}["']`), `Missing #${id}`);
}

test('Kirjasto is a cache-versioned, semantic Finnish iframe module', () => {
  assert.match(html, /<html\b[^>]*\blang=["']fi["']/);
  assert.match(html, /<meta\b[^>]*name=["']viewport["'][^>]*viewport-fit=cover/);
  assert.match(html, /<main\b[^>]*id=["']library-app["'][^>]*aria-labelledby=["']library-title["']/);
  assert.match(html, /config\.js\?v=\d+/);
  assert.match(html, /auth\.js\?v=\d+/);
  assert.match(html, /kirjasto\.css\?v=\d+/);
  assert.match(html, /kirjasto\.js\?v=\d+/);
  assert.match(html, /@phosphor-icons\/web/);
  assert.match(html, /Fraunces/);

  [
    'library-title',
    'library-add-work',
    'library-search-input',
    'library-media-filters',
    'library-theme-filter',
    'library-work-grid',
    'library-empty',
    'library-detail',
    'detail-unpublish',
    'library-reader',
    'library-add-dialog',
    'library-audio',
    'library-audio-dock',
    'mobile-library-nav',
  ].forEach(expectId);

  for (const label of ['Kirjasto', 'Jaetut', 'Jatka', 'Omat teokset', 'Luettavat', 'Kuunneltavat', 'Lisää teos']) {
    assert.match(html, new RegExp(label));
  }
});

test('catalog browsing follows the agreed authenticated snake_case API contract', () => {
  assert.match(js, /window\.SkriptLabAuth\.fetch\(path, requestOptions\)/);
  assert.match(js, /new URLSearchParams\(\{ scope: state\.scope \}\)/);
  assert.match(js, /params\.set\(["']q["'], state\.query\)/);
  assert.match(js, /params\.set\(["']media["'], state\.media\)/);
  assert.match(js, /params\.set\(["']theme["'], state\.theme\)/);
  assert.match(js, /`\$\{API_ROOT\}\/works\?\$\{params\.toString\(\)\}`/);
  assert.match(js, /`\$\{API_ROOT\}\/works\/\$\{encodeURIComponent\(id\)\}`/);
  assert.match(js, /`\$\{API_ROOT\}\/works\/\$\{encodeURIComponent\(work\.id\)\}\/content`/);
  assert.match(js, /`\$\{API_ROOT\}\/works\/\$\{encodeURIComponent\(workId\)\}\/progress`/);
  assert.match(js, /method:\s*["']PATCH["']/);
  assert.match(js, /method:\s*["']DELETE["']/);
});

test('backend work payloads normalize cover, content, Thema, ownership and signed audio correctly', () => {
  assert.match(js, /["']cover_data_url["']/);
  assert.match(js, /["']chapter_count["']/);
  assert.match(js, /hasText:\s*hasText \|\| chapterCount > 0/);
  assert.match(js, /["']owner_user_id["']/);
  assert.match(js, /["']can_manage["']/);
  assert.match(js, /["']audio_url["']/);
  assert.match(js, /return mediaUrl\(audioTracks\(work\)\[state\.audioTrackIndex\]\?\.url \|\| work\?\.audioUrl/);
  assert.match(js, /Array\.isArray\(value\.subjects\)/);
  assert.match(js, /["']theme_labels["']/);
  assert.match(js, /primary:\s*booleanValue\(value\.primary\)/);

  assert.doesNotMatch(js, /audio\?token=\$\{encodeURIComponent\(token\)\}/);
  assert.doesNotMatch(js, /SkriptLabAuth\?\.getToken[\s\S]{0,400}\/audio\?token/);
});

test('Shared scope presents managed examples without exposing management actions', () => {
  assert.match(html, /data-scope=["']shared["'][^>]*>Jaetut</);
  assert.match(html, /data-mobile-action=["']shared["'][^>]*>[\s\S]{0,120}<span>Jaetut<\/span>/);
  assert.match(js, /\[["']all["'], ["']shared["'], ["']continue["'], ["']mine["']\]\.includes\(scope\)/);
  assert.match(js, /const managedExample = booleanValue\(firstValue\(source, \[["']managed_example["']/);
  assert.match(js, /const shared = managedExample \|\| booleanValue\(firstValue\(source, \[["']shared["']/);
  assert.match(js, /if \(work\.managedExample \|\| work\.shared\) return false/);
  assert.match(js, /if \(work\?\.managedExample\) return ["']SkriptLab-esimerkki["']/);
  assert.match(js, /if \(work\?\.shared\) return ["']Jaettu["']/);
  assert.match(js, /scope === ["']shared["'][\s\S]{0,180}["']Jaetut teokset["']/);
  assert.match(js, /state\.scope === ["']shared["'][\s\S]{0,180}Ei vielä jaettuja teoksia/);
  assert.match(js, /state\.scope === ["']shared["'] \? ["']Ladataan jaettuja teoksia…["']/);
  assert.match(js, /sharedError \? ["']Jaettuja teoksia ei voitu ladata["']/);
  assert.match(css, /grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.work-status\.is-managed-example/);
});

test('read-only groups never see or invoke publication management', () => {
  assert.match(html, /id=["']library-add-work["'][^>]*\bhidden\b/);
  assert.match(html, /id=["']library-empty-add["'][^>]*\bhidden\b/);
  assert.match(js, /user\.allowed_modules === null/);
  assert.match(js, /user\.allowed_modules\.includes\(["']published_library_publish["']\)/);
  assert.match(js, /function openAddDialog\(options = \{\}\) \{\s*if \(!canPublish\(\)\)/);
  assert.match(js, /function canManageWork\(work\) \{\s*if \(!work \|\| !canPublish\(\)\) return false/);
  assert.match(js, /requestJson\(["']\/api\/auth\/me["']\)/);
});

test('owners and admins can withdraw a published work back to a draft', () => {
  assert.match(html, /id=["']detail-unpublish["'][^>]*\bhidden\b/);
  assert.match(html, /Poista julkaisusta/);
  assert.match(js, /detail-unpublish["']\]\.hidden = !\(manageable && work\.status === ["']published["']\)/);
  assert.match(js, /function unpublishSelectedWork\(\)/);
  assert.match(js, /work\.status !== ["']published["'] \|\| !canManageWork\(work\)/);
  assert.match(js, /Teos säilyy luonnoksena eikä ole enää lukijoiden nähtävissä/);
  assert.match(js, /body:\s*JSON\.stringify\(\{ status: ["']draft["'] \}\)/);
  assert.match(js, /state\.selectedWork = mergeWork\(work, unwrapWork\(payload\)\)/);
  assert.match(js, /await loadWorks\(\{ silent: true \}\)/);
});

test('import and project publication use a draft-first rights and Thema review flow', () => {
  assert.match(js, /`\$\{API_ROOT\}\/works\/import`/);
  assert.match(js, /`\$\{API_ROOT\}\/works\/from-project`/);
  assert.match(js, /form\.append\(["']file["'], blob, draftFileName/);
  assert.match(js, /form\.append\(["']status["'], ["']draft["']\)/);
  assert.match(js, /form\.append\(["']rights_confirmed["'], ["']false["']\)/);
  assert.match(js, /project_id:\s*projectId/);
  assert.match(js, /status:\s*["']draft["']/);
  assert.match(js, /rights_confirmed:\s*false/);

  assert.match(html, /Vakuutan, että minulla on oikeus jakaa tämä teos palvelussa\./);
  assert.match(js, /elements\[["']add-work-rights["']\]\.reportValidity\(\)/);
  assert.match(js, /rights_confirmed:\s*true/);
  assert.match(js, /thema_subjects:\s*themaSubjects/);
  assert.match(js, /theme_labels:\s*themeLabels/);
  assert.match(js, /return \{ code: theme\.code, label: theme\.label, primary \}/);
  assert.match(js, /function mergeThemes\(\.\.\.inputs\)/);
  assert.match(js, /const themes = mergeThemes\(themaSubjects, themeLabels\)/);
  assert.match(js, /const reviewItems = mergeThemes\(work\.suggestions, work\.themes\)/);
  assert.match(js, /filter\(\(theme\) => !\/\^\[A-Z\]\[A-Z0-9\]\{2,6\}\$\/\.test\(theme\.code\)\)/);
  assert.match(js, /FX-teemakoodi ei voi olla ainoa luokka/);
  assert.doesNotMatch(js, /thema_suggestions_reviewed\s*:/);
});

test('manual imports advertise only the backend-supported document formats', () => {
  for (const extension of ['.epub', '.txt', '.md', '.docx', '.pdf', '.rtf', '.odt', '.html', '.htm']) {
    assert.match(html, new RegExp(extension.replace('.', '\\.')));
  }
  assert.match(html, /EPUB suositeltu/);
  assert.doesNotMatch(html, /application\/msword/);
  assert.doesNotMatch(html, /accept=["'][^"']*\.doc(?:,|["'])/i);
});

test('the project snapshot copy is honest and project-only unsupported uploads are disabled', () => {
  assert.match(html, /projektin tämänhetkisestä tekstistä muuttumaton julkaisuversio/);
  assert.match(html, /Uusin kansi ja valmis äänite liitetään mukaan, jos ne löytyvät/);
  assert.doesNotMatch(html, /uusin lukittu julkaisupaketti/);
  assert.match(js, /\[elements\[["']add-work-cover["']\], elements\[["']add-work-audio["']\], elements\[["']add-work-pdf["']\]\][\s\S]*input\.disabled = !importSelected/);
});

test('draft metadata PATCH omits empty constrained title, author and language fields', () => {
  const updateDraft = js.slice(js.indexOf('async function updateExistingDraft'), js.indexOf('async function handleAddSubmit'));
  assert.match(updateDraft, /if \(metadata\.title\) update\.title = metadata\.title/);
  assert.match(updateDraft, /if \(metadata\.author\) update\.author = metadata\.author/);
  assert.match(updateDraft, /if \(metadata\.language\) update\.language = metadata\.language/);
  assert.doesNotMatch(updateDraft, /JSON\.stringify\(\{ \.\.\.metadata/);
});

test('reader persists exact backend progress fields and complete bookmark arrays', () => {
  assert.match(js, /["']paragraph_index["']/);
  assert.match(js, /bookmarks:\s*asArray\(source\.bookmarks\)/);
  assert.match(js, /requestPayload\.bookmarks = payload\.bookmarks/);
  assert.match(js, /chapter_id:\s*chapter\.id/);
  assert.match(js, /const paragraphIndex = currentParagraphIndex\(\)[\s\S]{0,500}paragraph_index:\s*paragraphIndex/);
  assert.match(js, /audio_position_seconds:/);
  assert.match(js, /label:\s*chapter\.title/);
  assert.match(js, /note:\s*["']["']/);
  assert.match(js, /data-paragraph-index/);
  assert.match(js, /PROGRESS_KEY_PREFIX/);
  assert.match(js, /localStorage\.setItem\(storageKey/);
  assert.match(js, /progressUpdatedTime\(local\) > progressUpdatedTime\(normalized\)/);
  assert.match(js, /existingBookmarks\.filter\(\(bookmark\) => !bookmarkMatches/);
  assert.match(js, /\.\.\.existingBookmarks\.slice\(-99\)/);
  assert.match(js, /function purgeLocalProgress\(exceptUserId = null\)/);
  assert.match(js, /key\?\.startsWith\(prefix\)/);
  assert.match(js, /auth\.clearWorkspaceData = function/);
  assert.match(js, /addEventListener\(["']storage["'], handleAuthStorageChange\)/);
  assert.match(js, /purgeLocalProgress\(viewerId\)/);
});

test('immersive reader exposes contents and accessible typography, spacing, width and theme controls', () => {
  for (const id of [
    'reader-chapter-list',
    'reader-bookmark',
    'reader-font-decrease',
    'reader-font-increase',
    'reader-line-height-options',
    'reader-width-options',
    'reader-theme-options',
    'reader-follow-audio',
  ]) expectId(id);

  for (const theme of ['light', 'sepia', 'dark']) {
    assert.match(html, new RegExp(`data-reader-theme=["']${theme}["']`));
  }
  for (const spacing of ['compact', 'comfortable', 'relaxed']) {
    assert.match(html, new RegExp(`data-line-height=["']${spacing}["']`));
  }
  for (const width of ['narrow', 'medium', 'wide']) {
    assert.match(html, new RegExp(`data-column-width=["']${width}["']`));
  }
  assert.match(js, /READER_SETTINGS_KEY/);
  assert.match(js, /localStorage\.setItem\(READER_SETTINGS_KEY/);
});

test('timing-dependent controls stay unavailable without an audio timing manifest', () => {
  assert.match(js, /const AUDIO_TIMING_FEATURE_ENABLED = false/);
  assert.match(html, /id=["']reader-follow-audio-setting["'][^>]*\bhidden\b/);
  assert.match(html, /id=["']reader-follow-audio["'][^>]*\bdisabled\b/);
  assert.match(html, /id=["']audio-previous["'][^>]*\bhidden\b[^>]*\bdisabled\b/);
  assert.match(html, /id=["']audio-next["'][^>]*\bhidden\b[^>]*\bdisabled\b/);
  assert.match(js, /const trackCount = audioTracks\(state\.audioWork\)\.length/);
  assert.match(js, /state\.readerSettings\.followAudio = false/);
  assert.match(js, /if \(hasAudioTimingManifest\(state\.audioWork\)\) elements\[["']audio-chapter["']\]\.textContent = chapter\.title/);
});

test('HTML audio player supports seek, speed, volume, 15-second jumps and a compact dock', () => {
  assert.match(html, /<audio\b[^>]*id=["']library-audio["'][^>]*playsinline/);
  for (const id of ['audio-play', 'audio-back-15', 'audio-forward-15', 'audio-seek', 'audio-speed', 'audio-volume', 'audio-collapse']) {
    expectId(id);
  }
  assert.match(js, /seekAudio\(-15\)/);
  assert.match(js, /seekAudio\(15\)/);
  assert.match(js, /\.playbackRate =/);
  assert.match(js, /\.volume = clamp/);
  assert.match(js, /classList\.toggle\(["']is-collapsed["']\)/);
  assert.match(js, /addEventListener\(["']timeupdate["'], handleAudioTimeUpdate\)/);
  assert.match(js, /addEventListener\(["']error["'], handleAudioError\)/);
  assert.match(js, /audioRefreshWorkId === work\.id/);
  assert.match(js, /audioRefreshAttemptedAt < 60_000/);
  assert.match(js, /state\.pendingAudioPosition = position/);
  assert.match(js, /state\.audioResumeAfterLoad = shouldResume/);
  assert.match(js, /const freshSource = workAudioUrl\(freshWork\)/);

  const startAudio = js.slice(js.indexOf('async function startAudio'), js.indexOf('async function toggleAudio'));
  assert.ok(startAudio.indexOf('await loadProgress(work.id)') < startAudio.indexOf('elements["library-audio"].src = source'), 'audio progress must be loaded before src/load to avoid a loadedmetadata race');
  assert.match(js, /media:\s*["']audio["'][\s\S]{0,180}audio_duration_seconds:/);
  assert.match(js, /\[[^\]]*["']media["'][^\]]*["']audio_duration_seconds["'][^\]]*\]\.forEach/);
  assert.match(js, /progress_percent:\s*100,[\s\S]{0,180}audio_duration_seconds:\s*duration/);
});

test('shell messages are same-origin, project-aware and can open the publish flow', () => {
  assert.match(js, /skriptlab:library-context-changed/);
  assert.match(js, /skriptlab:library-open-publish/);
  assert.match(js, /event\.origin !== window\.location\.origin/);
  assert.match(js, /event\.source !== window\.parent/);
  for (const field of ['projectId', 'projectTitle', 'projectAuthor', 'publicationId', 'packageId', 'editionId']) {
    assert.match(js, new RegExp(field));
  }
  assert.match(js, /sourceTab:\s*["']project["']/);
  assert.match(js, /skriptlab:library-ready/);
});

test('UI is safe, keyboard-operable and responsive without production demo data', () => {
  assert.match(html, /role=["']status["'][^>]*aria-live=["']polite["']/);
  assert.match(html, /role=["']search["']/);
  assert.match(html, /<dialog\b[^>]*id=["']library-add-dialog["']/);
  assert.match(js, /event\.key === ["']Escape["']/);
  assert.match(js, /event\.key === ["']\/["']/);
  assert.match(js, /document\.createTextNode/);
  assert.match(js, /\.textContent =/);
  assert.doesNotMatch(js, /\.innerHTML\s*=/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(max-width: 860px\)/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);

  for (const demoTitle of ['Seitsemän veljestä', 'Kalevala', 'Työmiehen vaimo', 'Rautatie']) {
    assert.doesNotMatch(html, new RegExp(demoTitle));
    assert.doesNotMatch(js, new RegExp(demoTitle));
  }
  assert.match(html, /Kirjasto odottaa ensimmäistä teosta/);
});

test('Library can shrink into the shell mobile simulator at a 300px iframe width', () => {
  assert.match(css, /html\s*{[^}]*min-width:\s*0/);
  assert.match(css, /body\s*{[^}]*min-width:\s*0/);
  assert.doesNotMatch(css, /(?:html|body)\s*{[^}]*min-width:\s*320px/);
  assert.match(css, /\.mobile-library-nav\s*{[^}]*grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/);
});


test('book cards open unread and draft details, but resume the saved reading or audio mode', () => {
  const context = {window: {}, document: {readyState: 'loading', addEventListener() {}}};
  require('node:vm').runInNewContext(js, context);
  const {workPrimaryAction, normalizeWork} = context.window.SkriptLabLibrary;
  const work = normalizeWork({id: 7, status: 'published', has_text: true, has_audio: true});
  assert.equal(workPrimaryAction(work), 'detail');
  work.progress.percent = 0.5;
  assert.equal(workPrimaryAction(work), 'read');
  work.progress.media = 'audio';
  assert.equal(workPrimaryAction(work), 'audio');
  work.status = 'draft';
  assert.equal(workPrimaryAction(work), 'detail');
  work.status = 'published';
  work.progress.percent = 0;
  work.progress.updatedAt = '2026-09-21T12:00:00Z';
  work.progress.media = 'pdf';
  assert.equal(workPrimaryAction(work), 'read');
  work.hasText = false;
  assert.equal(workPrimaryAction(work), 'audio');
  work.hasAudio = false;
  assert.equal(workPrimaryAction(work), 'detail');
});
