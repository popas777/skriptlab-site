import { demo, media } from './demo-data.js';

const mount = document.querySelector('#demo2');
const { ui, context, branches } = demo;
const fields = Object.entries(context);
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const highlight = (text, phrase) => escape(text).replace(escape(phrase), `<mark>${escape(phrase)}</mark>`);
const options = (items) => items.map(({ id, label }) => `<option value="${id}">${escape(label)}</option>`).join('');
const icon = (kind) => `<svg viewBox="0 0 24 24" aria-hidden="true">${kind === 'pause' ? '<path d="M8 5v14M16 5v14"/>' : '<path d="m8 5 11 7-11 7Z"/>'}</svg>`;

function contentPanel(branch) {
  if (branch.id === 'translation') return `
    <label class="d2-control">${escape(ui.languageLabel)}<select data-language>${options(Object.entries(demo.translations).map(([id, value]) => ({ id, label: value.label })))}</select></label>
    <div class="d2-translations">
      <div><span class="d2-caption">${escape(ui.sourceLanguage)}</span><p lang="en">${highlight(demo.source, demo.sourceHighlight)}</p></div>
      <div><span class="d2-caption" data-language-name>${escape(demo.translations.fi.label)}</span><p lang="fi" data-translation>${highlight(demo.translations.fi.text, demo.translations.fi.highlight)}</p></div>
    </div><p class="d2-caveat">${escape(ui.translationCaveat)}</p>`;
  if (branch.id === 'audio') return `
    <label class="d2-control">${escape(ui.voiceLabel)}<select data-voice>${options(demo.voices)}</select></label>
    <div class="d2-audio"><p>${escape(ui.audioChapter)}</p>
      <div class="d2-player"><button type="button" data-play aria-label="${escape(ui.play)}">${icon('play')}</button><div><span data-play-label>${escape(ui.play)}</span><div class="d2-time"><time data-elapsed>0:00</time><span>/</span><time data-duration>0:00</time></div></div></div>
      <progress data-progress max="1" value="0" aria-label="${escape(ui.audioTime)}"></progress>
      <audio preload="auto" data-audio></audio>
    </div><p class="d2-caption">${escape(ui.transcript)}</p><p class="d2-transcript" lang="fi" data-transcript>${escape(demo.translations.fi.text)}</p>
    <p class="d2-caveat">${escape(ui.audioCaveat)}</p><p class="d2-audio-error" data-audio-error role="status"></p>`;
  if (branch.id === 'illustration') return `
    <figure class="d2-illustration"><img src="${media.illustration}" width="1672" height="941" alt="${escape(ui.imageAlt)}"><figcaption>${escape(ui.imageCaption)}</figcaption></figure>
    <p class="d2-caption">${escape(ui.imagePrompt)}</p><p class="d2-prompt">${escape(demo.illustration)}</p><p class="d2-caveat">${escape(ui.illustrationCaveat)}</p>`;
  if (branch.id === 'layout') return `
    <label class="d2-control">${escape(ui.formatLabel)}<select data-format>${options(demo.formats)}</select></label>
    <div class="d2-book-stage"><article class="d2-book" data-book data-format="epub"><p class="d2-book-author">${escape(demo.work.author)}</p><h4>${escape(demo.work.title)}</h4><p class="d2-book-chapter">${escape(ui.chapter)}</p><p>${escape(demo.translations.fi.text)}</p><footer>${escape(ui.pageNumber)}</footer></article></div>
    <p class="d2-caption" data-format-detail>${escape(demo.formats[0].detail)}</p><p class="d2-caveat">${escape(ui.layoutCaveat)}</p>`;
  return `<p class="d2-caption">${escape(ui.videoLength)}</p><ol class="d2-timeline">${demo.timeline.map((shot) => `<li><time>${escape(shot.time)}</time><div><h4>${escape(shot.title)}</h4><p>${escape(shot.action)}</p><blockquote>${escape(shot.caption)}</blockquote></div></li>`).join('')}</ol><p class="d2-caveat">${escape(ui.videoCaveat)}</p>`;
}

mount.innerHTML = `
  <div class="pause-notice">${escape(ui.paused)}</div>
  <header class="site-header"><nav class="nav" aria-label="${escape(ui.nav)}"><a class="logo" href="/" aria-label="${escape(ui.logo)}">Skript<span>Lab</span></a><div class="d2-nav-links"><a href="/">${escape(ui.home)}</a><a href="/demo/">${escape(ui.firstDemo)}</a></div></nav></header>
  <main id="main" class="d2-main"><section class="d2-demo" aria-labelledby="d2-title">
    <div class="d2-intro"><h1 id="d2-title">${escape(ui.title)} <em>${escape(ui.titleEmphasis)}</em></h1><p>${escape(ui.intro)}</p></div>
    <div class="d2-steps" role="group" aria-label="${escape(ui.stepsLabel)}">${ui.steps.map((label, i) => `<button type="button" data-step="${i + 1}" aria-pressed="false"><span>0${i + 1}</span>${escape(label)}</button>`).join('')}</div>
    <div class="d2-source" data-source>
      <div class="d2-file"><svg viewBox="0 0 40 48" aria-hidden="true"><path d="M5 1h20l10 11v35H5ZM25 1v12h10M12 23h16M12 29h16M12 35h10"/></svg><div><span class="d2-file-status" data-file-status>${escape(ui.fileEmpty)}</span><strong>${escape(ui.fileName)}</strong><ul>${ui.fileMeta.map((text) => `<li>${escape(text)}</li>`).join('')}</ul></div></div>
      <div class="d2-source-excerpt"><span class="d2-caption">${escape(ui.sourceLabel)}</span><p lang="en">${highlight(demo.source, 'Lionel Wallace')}</p></div>
    </div>
    <div class="d2-workspace">
      <svg class="d2-connections" aria-hidden="true">${branches.map((branch) => `<path data-connection="${branch.id}"/>`).join('')}</svg>
      <section class="d2-context" id="d2-context" aria-labelledby="d2-context-title" tabindex="-1">
        <header><div><h2 id="d2-context-title">${escape(ui.contextTitle)}</h2><p>${escape(ui.contextSubtitle)}</p></div><span class="d2-origin" aria-hidden="true"></span></header>
        <dl>${fields.map(([key, field], i) => `<div class="d2-field" data-field="${key}"><dt><span class="d2-row-number" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>${escape(field.label)}<span class="d2-used-symbol" aria-hidden="true">●</span></dt><dd><p>${escape(field.value)}</p><small>${escape(field.detail)}</small></dd></div>`).join('')}</dl>
        <footer><span><b data-field-count>0</b> / ${fields.length} ${escape(ui.contextCount)}</span><span>${escape(ui.contextExplanation)}</span></footer>
      </section>
      <div class="d2-branches" role="group" aria-label="${escape(ui.branchesLabel)}">${branches.map((branch, i) => `<button class="d2-branch" type="button" id="d2-${branch.id}-button" data-branch="${branch.id}" aria-pressed="false" aria-controls="d2-${branch.id}-panel"><span class="d2-branch-index" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><strong>${escape(branch.label)}</strong><span class="d2-branch-sample">${escape(branch.sample)}</span></button>`).join('')}</div>
      <div class="d2-output-stack">${branches.map((branch) => `<section class="d2-output" id="d2-${branch.id}-panel" data-panel="${branch.id}" aria-labelledby="d2-${branch.id}-button" aria-hidden="true" inert>
        <div class="d2-output-heading"><span class="d2-caption">${escape(branch.label)} / ${escape(ui.resultLabel)}</span><h3>${escape(branch.title)}</h3></div>
        ${contentPanel(branch)}
        <div class="d2-shared"><p>${escape(ui.fieldsUsed)}</p><ul>${branch.fields.map((key) => `<li>${escape(context[key].label)}</li>`).join('')}</ul><p class="d2-note">${escape(branch.note)}</p><a href="#d2-context" class="d2-context-link">${escape(ui.showContext)}</a></div>
      </section>`).join('')}</div>
    </div>
    <p class="d2-status" data-status role="status" aria-live="polite" aria-atomic="true">${escape(ui.statusWaiting)}</p>
    <p class="d2-demo-note">${escape(ui.demoNote)}</p>
  </section>
  <div class="d2-ending"><h2>${escape(ui.finish)}</h2><p>${escape(ui.finishText)}</p></div>
  </main><footer class="d2-footer"><span>${escape(ui.footer)}</span><a href="/luottamus.html">${escape(ui.privacy)}</a><a href="${demo.work.sourceUrl}">${escape(ui.sourceCredit)}</a></footer>`;

const root = mount.querySelector('.d2-demo');
const q = (selector) => root.querySelector(selector);
const qa = (selector) => [...root.querySelectorAll(selector)];
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const state = { phase: 0, count: 0, selected: 'translation', manual: false, started: false };
const timers = new Set();
const audio = q('[data-audio]');
audio.src = media.voices.fi;

function stopAutomation() {
  state.manual = true;
  timers.forEach(clearTimeout);
  timers.clear();
  observer?.disconnect();
}

function update(announce = false) {
  root.dataset.phase = String(state.phase);
  q('[data-source]').classList.toggle('is-loaded', state.phase > 0);
  q('[data-file-status]').textContent = state.phase > 0 ? ui.fileLoaded : ui.fileEmpty;
  q('[data-field-count]').textContent = String(state.count);
  qa('[data-step]').forEach((button) => button.setAttribute('aria-pressed', String(Number(button.dataset.step) === state.phase)));
  const selected = branches.find((branch) => branch.id === state.selected);
  qa('[data-field]').forEach((row, i) => {
    const revealed = i < state.count;
    const used = state.phase === 3 && selected.fields.includes(row.dataset.field);
    row.classList.toggle('is-revealed', revealed);
    row.classList.toggle('is-used', used);
    row.querySelector('dd').setAttribute('aria-hidden', String(!revealed));
  });
  qa('[data-branch]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.branch === state.selected && state.phase === 3)));
  qa('[data-connection]').forEach((path) => path.classList.toggle('is-active', path.dataset.connection === state.selected && state.phase === 3));
  qa('[data-panel]').forEach((panel) => {
    const active = panel.dataset.panel === state.selected;
    panel.classList.toggle('is-visible', active);
    panel.setAttribute('aria-hidden', String(!active));
    panel.inert = !active;
  });
  if (announce) q('[data-status]').textContent = state.phase === 3
    ? `${ui.statusSelected} ${selected.label}. ${ui.statusFields} ${selected.fields.map((key) => context[key].label.toLocaleLowerCase('fi')).join(', ')}.`
    : state.manual ? ui.statusManual : state.phase === 1 ? ui.statusSource : ui.statusContext;
}

function selectBranch(id) {
  state.selected = id;
  state.phase = 3;
  state.count = fields.length;
  if (id !== 'audio') audio.pause();
  update(true);
}

function later(delay, action) {
  const timer = setTimeout(() => { timers.delete(timer); if (!state.manual) action(); }, delay);
  timers.add(timer);
}

function start() {
  if (state.started || state.manual || motion.matches) return;
  state.started = true;
  state.phase = 1;
  update(true);
  later(1500, () => { state.phase = 2; update(true); });
  fields.forEach((_, i) => later(2100 + i * 850, () => { state.count = i + 1; update(); }));
  later(10800, () => { state.phase = 3; state.count = fields.length; update(true); });
}

let observer;
root.addEventListener('pointerdown', stopAutomation, { capture: true });
root.addEventListener('keydown', stopAutomation, { capture: true });
root.addEventListener('click', (event) => {
  stopAutomation();
  const branch = event.target.closest('[data-branch]');
  if (branch) selectBranch(branch.dataset.branch);
  const step = event.target.closest('[data-step]');
  if (step) {
    state.phase = Number(step.dataset.step);
    state.count = state.phase === 1 ? 0 : fields.length;
    audio.pause();
    update(true);
  }
});

q('[data-language]').addEventListener('change', (event) => {
  stopAutomation();
  selectBranch('translation');
  const language = event.target.value;
  const translation = demo.translations[language];
  q('[data-translation]').innerHTML = highlight(translation.text, translation.highlight);
  q('[data-translation]').lang = language;
  q('[data-language-name]').textContent = translation.label;
});
q('select[data-format]').addEventListener('change', (event) => {
  stopAutomation();
  selectBranch('layout');
  q('[data-book]').dataset.format = event.target.value;
  q('[data-format-detail]').textContent = demo.formats.find((format) => format.id === event.target.value).detail;
});

const time = (value) => { const seconds = Number.isFinite(value) ? Math.floor(value) : 0; return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };
function updateAudio() {
  const playing = !audio.paused && !audio.ended;
  q('[data-play]').innerHTML = icon(playing ? 'pause' : 'play');
  q('[data-play]').setAttribute('aria-label', playing ? ui.pause : ui.play);
  q('[data-play-label]').textContent = playing ? ui.pause : ui.play;
  q('[data-elapsed]').textContent = time(audio.currentTime);
  q('[data-duration]').textContent = time(audio.duration);
  q('[data-progress]').value = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.currentTime / audio.duration : 0;
}
['loadedmetadata', 'timeupdate', 'play', 'pause', 'ended', 'emptied'].forEach((name) => audio.addEventListener(name, updateAudio));
audio.addEventListener('error', () => { q('[data-audio-error]').textContent = ui.audioError; });
q('[data-play]').addEventListener('click', async () => {
  selectBranch('audio');
  if (!audio.paused) audio.pause();
  else {
    if (audio.ended) audio.currentTime = 0;
    try { await audio.play(); } catch { q('[data-audio-error]').textContent = ui.audioError; }
  }
});
q('[data-voice]').addEventListener('change', (event) => {
  stopAutomation();
  audio.pause();
  const lang = event.target.value;
  audio.src = media.voices[lang];
  q('[data-transcript]').textContent = lang === 'fi' ? demo.translations.fi.text : demo.source;
  q('[data-transcript]').lang = lang;
  q('[data-audio-error]').textContent = '';
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { audio.pause(); if (state.started) { stopAutomation(); state.phase = 3; state.count = fields.length; update(); } }
});
window.addEventListener('pagehide', () => { audio.pause(); stopAutomation(); });

function drawConnections() {
  const bounds = q('.d2-workspace').getBoundingClientRect();
  const origin = q('.d2-origin').getBoundingClientRect();
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  const svg = q('.d2-connections');
  svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
  const contextBounds = q('.d2-context').getBoundingClientRect();
  const x = mobile ? 10 : origin.x + origin.width / 2 - bounds.x;
  const y = mobile ? contextBounds.bottom - bounds.y : origin.y + origin.height / 2 - bounds.y;
  qa('[data-branch]').forEach((button, i) => {
    const target = button.getBoundingClientRect();
    const tx = target.x - bounds.x;
    const ty = target.y + target.height / 2 - bounds.y;
    q(`[data-connection="${button.dataset.branch}"]`).setAttribute('d', mobile
      ? `M ${x} ${y} V ${ty} H ${tx}`
      : `M ${x} ${y} H ${x + 12 + i * 4} V ${ty} H ${tx}`);
  });
}
const resize = new ResizeObserver(drawConnections);
resize.observe(q('.d2-workspace'));
document.fonts.ready.then(drawConnections);

function finalState() { stopAutomation(); state.phase = 3; state.count = fields.length; update(true); }
motion.addEventListener('change', (event) => { if (event.matches) finalState(); });
if (motion.matches || !('IntersectionObserver' in window)) finalState();
else {
  observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); start(); } }, { threshold: 0.25 });
  observer.observe(q('.d2-steps'));
  update();
}
