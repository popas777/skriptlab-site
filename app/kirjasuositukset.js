const apiUrl = path => window.SKRIPTLAB_CONFIG.API_BASE_URL + path;

(() => {
  'use strict';
  const auth = window.SkriptLabAuth;
  if (!auth.requireLogin()) return;
  const token = auth.getToken();
  const root = window.parent.document.documentElement;
  function syncTheme() {
    document.body.dataset.shellTheme = root.dataset.theme === 'dark' ? 'dark' : 'light';
  }
  syncTheme();
  const observer = new MutationObserver(syncTheme);
  observer.observe(root, {attributes: true, attributeFilter: ['data-theme']});

  const form = document.getElementById('recommendation-form');
  const fields = document.getElementById('preferences');
  const wish = document.getElementById('wish');
  const button = form.querySelector('button');
  const feedback = document.getElementById('feedback');
  const results = document.getElementById('results');
  const selfExample = wish.placeholder;
  form.addEventListener('change', event => {
    if (event.target.name !== 'recipient') return;
    const gift = event.target.value === 'gift';
    document.getElementById('wish-label').textContent = gift
      ? 'Millaisista kirjoista lahjansaaja pitää?' : 'Millaista kirjaa haluaisit lukea tai kuunnella?';
    wish.placeholder = gift
      ? 'Etsin lahjaa 12-vuotiaalle, joka pitää eläimistä ja seikkailuista. Kirjassa saisi olla huumoria.'
      : selfExample;
  });
  wish.addEventListener('input', () => wish.setCustomValidity(''));

  function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }

  function showGroup(title, books, start, inLibrary) {
    if (!books.length) return;
    const section = document.createElement('section');
    const list = document.createElement('ol');
    list.start = start;
    for (const book of books) {
      const item = document.createElement('li');
      const heading = element('h3', book.title);
      if (inLibrary) {
        const link = element('a', book.title);
        link.href = 'kirjasto.html?' + new URLSearchParams({q: book.title});
        link.addEventListener('click', event => {
          if (window.parent === window || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          window.parent.postMessage({type: 'skriptlab:recommendation-open-work', id: book.id}, location.origin);
        });
        heading.replaceChildren(link);
      }
      const author = element('p', book.author);
      author.className = 'author';
      item.append(heading, author, element('p', book.reason));
      list.append(item);
    }
    section.append(element('h2', title), list);
    results.append(section);
  }

  window.addEventListener('storage', () => {
    if (auth.getToken() !== token) location.reload();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;
    if (!wish.value.trim()) {
      wish.setCustomValidity('Kerro lyhyesti, millaista kirjaa etsit.');
      wish.reportValidity();
      return;
    }
    const request = {recipient: form.elements.recipient.value, wish: wish.value.trim()};
    button.disabled = fields.disabled = true;
    results.replaceChildren();
    feedback.textContent = 'Etsitään toiveeseesi sopivia kirjoja…';
    try {
      const response = await auth.fetch('/api/library/recommendations', {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(request)
      });
      if (auth.getToken() !== token) return;
      if (!response.ok) {
        const detail = (await response.json().catch(() => ({}))).detail;
        throw new Error(typeof detail === 'string' ? detail : detail?.message || 'Suositusten haku epäonnistui. Yritä uudelleen.');
      }
      const {library, external} = await response.json();
      showGroup('Kirjaston valikoimasta', library, 1, true);
      showGroup('Valikoiman ulkopuolelta', external, library.length + 1, false);
      const count = library.length + external.length;
      feedback.textContent = !count ? 'Sopivia kirjoja ei löytynyt. Kokeile kuvailla toivettasi toisella tavalla.'
        : !library.length ? 'Kirjaston valikoimasta ei löytynyt toivettasi vastaavaa teosta.'
        : count === 1 ? 'Löytyi yksi suositus.' : 'Löytyi ' + count + ' suositusta.';
      const firstHeading = results.querySelector('h2');
      if (firstHeading) {
        firstHeading.tabIndex = -1;
        firstHeading.focus({preventScroll: true});
        firstHeading.scrollIntoView({block: 'start'});
      }
    } catch (error) {
      feedback.textContent = error.message || 'Yhteys katkesi. Yritä uudelleen.';
    } finally {
      button.disabled = fields.disabled = false;
    }
  });
})();
