(() => {
  'use strict';
  const data = window.SkriptLabDemo;
  if (!data) return;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function moveTo(id) {
    const element = document.getElementById(id);
    element.scrollIntoView({ behavior: reduceMotion.matches ? 'instant' : 'smooth', block: 'start' });
  }

  // Insert exact excerpts as text nodes; highlighting never changes the wording.
  function renderQuote(text, highlights) {
    const quote = $('#context-quote');
    quote.replaceChildren();
    let cursor = 0;
    while (cursor < text.length) {
      const match = highlights.map((term) => ({ term, index: text.indexOf(term, cursor) }))
        .filter((item) => item.index >= 0).sort((a, b) => a.index - b.index)[0];
      if (!match) { quote.append(document.createTextNode(text.slice(cursor))); break; }
      quote.append(document.createTextNode(text.slice(cursor, match.index)));
      const mark = document.createElement('mark');
      mark.textContent = match.term;
      quote.append(mark);
      cursor = match.index + match.term.length;
    }
  }

  function selectContext(key) {
    const context = data.contexts[key];
    if (!context) return;
    $$('[data-context]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.context === key)));
    $$('[data-edge]').forEach((edge) => edge.classList.toggle('selected', edge.dataset.edge === key));
    $('#context-image').alt = context.imageAlt;
    $('#context-image').src = context.image;
    $('#context-name').textContent = context.name;
    $('#context-kind').textContent = context.kind;
    $('#context-description').textContent = context.description;
    $('#context-carry').textContent = context.carry;
    $('#context-nuance').textContent = context.nuance;
    $('#quote-part').textContent = context.part;
    renderQuote(context.quote, context.highlights);
  }

  $('#load-story').addEventListener('click', () => {
    document.body.classList.add('source-open');
    $('#import-status').textContent = '✓ Ovi muurissa · esimerkkiteksti avattu. Neljä osaa, kaksi kieltä, yksi tarinan maailma.';
    $('#continue-context').hidden = false;
    $('#load-story').textContent = 'Esimerkkikäsikirjoitus ladattu';
    $('#load-story').disabled = true;
  });

  $$('[data-context]').forEach((button) => button.addEventListener('click', () => selectContext(button.dataset.context)));
  $$('[data-select-context]').forEach((link) => link.addEventListener('click', () => selectContext(link.dataset.selectContext)));

  function pauseMedia() { $$('audio,video').forEach((media) => media.pause()); }
  function selectOutput(key, focus = false) {
    const selected = $(`[data-output="${key}"]`);
    if (!selected) return;
    pauseMedia();
    $$('[data-output]').forEach((tab) => {
      const active = tab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
    });
    // Only scroll the tab rail; selecting a tab must not pull the page vertically.
    const rail = $('.output-tabs');
    const tabBounds = selected.getBoundingClientRect();
    const railBounds = rail.getBoundingClientRect();
    if (tabBounds.left < railBounds.left || tabBounds.right > railBounds.right) {
      rail.scrollTo({ left: selected.offsetLeft - rail.offsetLeft - 12, behavior: reduceMotion.matches ? 'instant' : 'smooth' });
    }
    if (focus) selected.focus({ preventScroll: true });
  }

  const outputTabs = $$('[data-output]');
  outputTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectOutput(tab.dataset.output));
    tab.addEventListener('keydown', (event) => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % outputTabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + outputTabs.length) % outputTabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = outputTabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      selectOutput(outputTabs[next].dataset.output, true);
    });
  });

  $('#translation-language').addEventListener('change', (event) => {
    const language = event.target.value;
    const translation = data.translations[language];
    $('#translation-label').textContent = translation.label;
    $('#translation-text').textContent = translation.text;
    $('#translation-text').lang = language;
    $('#translation-note').textContent = translation.note;
  });

  $$('[data-voice]').forEach((button) => button.addEventListener('click', () => {
    const voice = data.voices[button.dataset.voice];
    const player = $('#story-audio');
    player.pause();
    player.src = voice.src;
    player.setAttribute('aria-label', voice.label);
    player.load();
    $('#audio-transcript').textContent = voice.transcript;
    $('#audio-transcript').lang = voice.lang;
    $$('[data-voice]').forEach((option) => option.setAttribute('aria-pressed', String(option === button)));
  }));

  $$('[data-campaign]').forEach((button) => button.addEventListener('click', () => {
    const campaign = data.campaigns[button.dataset.campaign];
    $('#campaign-headline').textContent = campaign.title;
    $('#campaign-text').textContent = campaign.text;
    $$('[data-campaign]').forEach((option) => option.setAttribute('aria-pressed', String(option === button)));
  }));

  $$('[data-hotspot]').forEach((button) => button.addEventListener('click', () => {
    const hotspot = data.hotspots[button.dataset.hotspot];
    $('#hotspot-title').textContent = hotspot.title;
    $('#hotspot-description').textContent = hotspot.description;
    $$('[data-hotspot]').forEach((option) => option.setAttribute('aria-pressed', String(option === button)));
  }));

  $('#explore-future').addEventListener('click', () => {
    selectOutput('world', true);
    moveTo('mahdollisuudet');
  });

  // Pause sound and motion whenever their examples are left behind.
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (!entry.isIntersecting) entry.target.pause(); });
    }, { threshold: 0 });
    $$('audio,video').forEach((media) => observer.observe(media));
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseMedia(); });
  $$('audio,video').forEach((media) => media.addEventListener('error', () => {
    if (media.parentElement.querySelector('.media-error')) return;
    const error = document.createElement('p');
    error.className = 'micro media-error';
    error.setAttribute('role', 'status');
    error.textContent = 'Median lataaminen ei onnistunut. Lataa sivu uudelleen ja kokeile toistoa vielä kerran.';
    media.after(error);
  }));
})();
