(function () {
  'use strict';
  if (!window.SkriptLabAuth?.requireLogin()) return;
  const user = window.SkriptLabAuth.getUser();
  const reader = user?.role === 'library_reader' || user?.access_plan_key === 'library_reader';
  if ((reader && !user?.allowed_modules?.includes('published_library')) || window.SkriptLabAuth.isShowcaseDemoUser(user)) return;
  document.getElementById('content').hidden = false;
  const M = window.SkriptLabSubscriptionsDemo;
  const $ = id => document.getElementById(id);
  const number = value => new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 2 }).format(value);
  const euro = cents => new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR' }).format(cents / 100);
  const displayDate = value => new Intl.DateTimeFormat('fi-FI', { timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z'));
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const duration = credits => `${number(Math.floor(credits / 60))} h ${credits % 60 ? number(credits % 60) + ' min' : ''}`.trim();
  let state = M.create('basic', today);
  let bookState = null;

  try {
    const root = window.parent.document.documentElement;
    const sync = () => { document.body.dataset.shellTheme = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  } catch (_) { /* Standalone view uses its default theme. */ }

  function status(message, error = false) {
    $('status').textContent = message;
    $('status').classList.toggle('error', error);
  }
  function act(action, message) {
    try { const result = action(); render(); status(typeof message === 'function' ? message(result) : message); }
    catch (error) { status(error.message, true); }
  }
  function reset(planId) {
    state = M.create(planId, today);
    bookState = null;
    $('book-status').textContent = '';
    render();
    status(`${M.planFor(planId).name}: uusi kokeilu aloitettu. Aiemman kokeilun tapahtumat nollattiin.`);
  }
  for (const plan of M.PLANS) {
    const article = document.createElement('article');
    article.className = 'plan';
    article.dataset.plan = plan.id;
    article.innerHTML = `<h3>${plan.name}</h3><p class="plan-price"><strong>${euro(plan.cents)}</strong> / kk</p><p class="plan-hours">${number(plan.credits / 60)} tuntia / kk</p><p class="plan-credits">${number(plan.credits)} krediittiä kuukaudessa</p><p class="plan-users">${plan.users === 1 ? 'Yksi käyttäjä' : `Enintään ${plan.users} käyttäjää · yhteinen saldo`}</p><button type="button" class="secondary-button" aria-pressed="false"></button>`;
    article.querySelector('button').addEventListener('click', () => reset(plan.id));
    $('plans').append(article);
  }
  function listItem(main, detail, amount) {
    const li = document.createElement('li');
    const text = document.createElement('span');
    text.textContent = main;
    const small = document.createElement('small');
    small.textContent = detail;
    text.append(small);
    const strong = document.createElement('strong');
    strong.textContent = amount;
    li.append(text, strong);
    return li;
  }
  function editorBook() {
    return M.createBook({ title: $('book-name').value, minutes: Number($('book-minutes').value), rate: Number($('book-rate').value), fixed: Number($('book-fixed').value) });
  }
  function actionCost(book) {
    if (book.owned) return 0;
    if ($('book-mode').value === 'fixed') return book.fixed;
    const minutes = Math.min(Number($('listen-minutes').value), book.minutes - book.listened);
    return M.bookQuote({ mode: 'time', minutes: book.listened + minutes, rate: book.rate }) - book.listeningCredits;
  }
  function renderBook() {
    const fixed = $('book-mode').value === 'fixed';
    $('listen-field').hidden = fixed;
    $('listen-minutes').disabled = fixed;
    for (const id of ['book-name', 'book-minutes', 'book-rate', 'book-fixed']) $(id).readOnly = Boolean(bookState);
    $('book-assumption').textContent = fixed
      ? 'Kertaosto antaa lukuoikeuden heti. Mahdollista aiempaa kuuntelukuluasi ei hyvitetä tässä demossa.'
      : 'Krediittejä kuluu kuunnellun ajan mukaan. Lukuoikeus ja paikka omassa hyllyssä syntyvät, kun koko kirja on kuunneltu.';
    $('quote-name').textContent = $('book-name').value.trim() || 'Omakustanteen esimerkkikirja';
    const valid = [...$('book-form').querySelectorAll('input')].every(input => input.disabled || input.validity.valid);
    try {
      if (!valid) throw new Error('Tarkista kirjan kesto, kuunteluaika ja krediittihinnat.');
      const book = bookState || editorBook();
      const credits = M.bookQuote({ mode: fixed ? 'fixed' : 'time', minutes: book.minutes, rate: book.rate, fixed: book.fixed });
      $('book-credits').textContent = number(credits);
      $('classic-comparison').textContent = `Saman mittainen klassikko: ${number(book.minutes)} krediittiä (${duration(book.minutes)}).`;
      $('book-values').replaceChildren();
      [...M.PLANS, { name: 'Lisäaikana', ...M.TOPUP }].forEach(plan => {
        const row = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = plan.name;
        dd.textContent = euro(credits * plan.cents / plan.credits);
        if ($('publisher-share').validity.valid) {
          const value = credits * plan.cents / plan.credits;
          const share = Number($('publisher-share').value) / 100;
          const split = document.createElement('small');
          split.textContent = `Oikeudenhaltijalle ${euro(value * share)} · alustalle ${euro(value * (1 - share))}`;
          dd.append(split);
        }
        row.append(dt, dd);
        $('book-values').append(row);
      });
      const cost = actionCost(book);
      const enough = cost <= M.balance(state);
      $('book-affordability').textContent = book.owned
        ? 'Lukuoikeus on jo hankittu. Uusintakuuntelu ei kuluta krediittejä.'
        : enough ? `Seuraava ${fixed ? 'kertaosto' : 'kuuntelujakso'}: ${number(cost)} krediittiä. Saldoon jäisi ${number(M.balance(state) - cost)}.` : `Seuraavaan ${fixed ? 'kertaostoon' : 'kuuntelujaksoon'} tarvitaan ${number(cost)} krediittiä. Saldosta puuttuu ${number(cost - M.balance(state))}.`;
      $('use-book').disabled = !enough || (fixed && book.owned);
      $('use-book').textContent = book.owned ? (fixed ? 'Lukuoikeus on jo hankittu' : 'Kokeile maksutonta uusintakuuntelua') : (fixed ? 'Osta kirja demossa' : 'Kuuntele demossa');
      $('book-progress').value = book.listened / book.minutes * 100;
      $('book-progress-text').textContent = `Kuunneltu ${number(book.listened)} / ${number(book.minutes)} min · ${number(book.listened / book.minutes * 100)} %`;
      $('ownership-title').textContent = book.owned ? 'Kirja on omassa hyllyssäsi' : 'Kuuntelu ja oma hylly';
      $('ownership-status').textContent = book.owned
        ? `Lukuoikeus hankittu ${book.acquiredBy === 'purchase' ? 'kertaostolla' : 'kuuntelemalla koko kirja'} ${displayDate(book.acquiredOn)}. Oikeus säilyy krediittien vanhentuessa.`
        : 'Ei vielä lukuoikeutta tai kirjaa omassa hyllyssä. Voit jatkaa kuuntelua tai tehdä kertaoston.';
      $('owned-book').hidden = !book.owned;
      $('owned-book').textContent = book.owned ? `Demon oma hylly: ${book.title}. Oikeita kirjastotietoja ei muuteta.` : '';
      $('ownership-title').parentElement.classList.toggle('is-owned', book.owned);
    } catch (error) {
      $('book-credits').textContent = '—';
      $('classic-comparison').textContent = error.message;
      $('book-values').replaceChildren();
      $('book-affordability').textContent = '';
      $('use-book').disabled = true;
    }
  }
  function renderEconomics() {
    const inputs = [...$('economics-controls').querySelectorAll('input')];
    if (!inputs.every(input => input.validity.valid)) {
      $('economics-rows').replaceChildren();
      $('economics-status').textContent = 'Tarkista prosentit (0–100) ja kulut (vähintään 0 €).';
      return;
    }
    const publisherPercent = Number($('publisher-share').value);
    const usePercent = Number($('credit-use').value);
    const monthlyCostCents = Number($('monthly-cost').value) * 100;
    const hourlyCostCents = Number($('hourly-cost').value) * 100;
    const results = M.PLANS.map(plan => ({ plan, ...M.economics({ ...plan, publisherPercent, usePercent, monthlyCostCents, hourlyCostCents }) }));
    $('economics-rows').replaceChildren(...results.map(result => {
      const row = document.createElement('tr');
      const label = document.createElement('th');
      label.scope = 'row';
      label.textContent = `${result.plan.name} · ${euro(result.plan.cents)}`;
      row.append(label);
      for (const key of ['publisher', 'platformUsage', 'expiredRevenue', 'costs', 'remainder']) {
        const cell = document.createElement('td');
        cell.textContent = euro(result[key]);
        if (key === 'remainder' && result[key] < 0) cell.className = 'negative';
        row.append(cell);
      }
      return row;
    }));
    const family = results.find(result => result.plan.id === 'family');
    const fullyUsed = M.economics({ ...family.plan, publisherPercent, usePercent: 100, monthlyCostCents: 0, hourlyCostCents: 0 });
    $('economics-status').textContent = `Perhe, 100 % käytöllä: alustalle ${euro(fullyUsed.platformUsage)} ennen muita kuluja. Syötetyllä ${number(usePercent)} % käyttöasteella jäämä kulujen jälkeen ${euro(family.remainder)}.${usePercent < 100 ? ` Tästä laskelmasta ${euro(family.expiredRevenue)} perustuu käyttämättä vanhenevaan osuuteen.` : ''}`;
  }
  function render() {
    const plan = M.planFor(state.planId);
    const balance = M.balance(state);
    document.querySelectorAll('.plan').forEach(article => {
      const selected = article.dataset.plan === state.planId;
      article.classList.toggle('selected', selected);
      const button = article.querySelector('button');
      button.setAttribute('aria-pressed', String(selected));
      button.textContent = selected ? 'Valittu demoon' : `Kokeile: ${M.planFor(article.dataset.plan).name}`;
      button.className = selected ? 'primary-button' : 'secondary-button';
    });
    $('wallet-plan').textContent = `${plan.name} · ${plan.users === 1 ? 'oma demosaldo' : 'yhteinen demosaldo'}`;
    $('balance').textContent = number(balance);
    $('balance-hours').textContent = `${duration(balance)} klassikkojen luku- ja kuunteluaikaa`;
    $('balance-meter').value = balance;
    $('demo-date').textContent = displayDate(state.today);
    $('demo-total').textContent = `Demon laskennalliset maksut yhteensä ${euro(state.paidCents)}. Oikeita maksuja ei tehdä.`;
    const lots = state.lots.filter(lot => lot.remaining > 0 && lot.expires > state.today).sort((a, b) => a.expires.localeCompare(b.expires));
    const expiring = lots.length ? lots.filter(lot => lot.expires === lots[0].expires).reduce((sum, lot) => sum + lot.remaining, 0) : 0;
    $('next-expiry').textContent = lots.length ? `Seuraavaksi vanhenee ${number(expiring)} krediittiä ${displayDate(lots[0].expires)}.` : 'Ei voimassa olevia krediittejä.';
    $('lots').replaceChildren(...lots.map(lot => listItem(lot.label, `Hankittu ${displayDate(lot.created)} · vanhenee ${displayDate(lot.expires)}`, `${number(lot.remaining)} kr`)));
    if (!lots.length) $('lots').append(listItem('Ei voimassa olevia eriä.', '', ''));
    $('events').replaceChildren(...state.events.map(event => listItem(event.label, `${displayDate(event.date)}${event.detail ? ' · ' + event.detail : ''}`, `${event.delta > 0 ? '+' : ''}${number(event.delta)} kr`)));
    $('topup').disabled = balance + M.TOPUP.credits > M.CAP;
    $('topup').textContent = $('topup').disabled ? 'Paketti ei mahdu 20 000 krediitin saldoon' : 'Lisää 600 krediittiä demoon';
    renderBook();
    renderEconomics();
  }
  $('reset').addEventListener('click', () => reset(state.planId));
  $('topup').addEventListener('click', () => act(() => M.topup(state), 'Demoon lisättiin 600 krediittiä (3 €). Oikeaa maksua ei tehty.'));
  $('next-month').addEventListener('click', () => act(() => M.nextMonth(state), result => `Kuukausi vaihtui. Lisätty ${number(result.accepted)} krediittiä.${result.expired ? ` Vanhentui ${number(result.expired)} krediittiä.` : ''}${result.overflow ? ` Saldorajan vuoksi ${number(result.overflow)} krediittiä jäi hyvittämättä.` : ''}`));
  $('use-form').addEventListener('submit', event => {
    event.preventDefault();
    act(() => M.spend(state, Number($('use-minutes').value), 'Klassikon luku- tai kuunteluaika'), 'Klassikkoaika vähennettiin demosaldosta.');
  });
  $('book-form').addEventListener('input', renderBook);
  $('book-form').addEventListener('change', renderBook);
  $('economics-controls').addEventListener('input', () => { renderEconomics(); renderBook(); });
  $('reset-book').addEventListener('click', () => {
    bookState = null;
    renderBook();
    $('book-status').textContent = 'Kirjan kokeilu nollattiin. Jo käytetyt krediitit pysyvät kulutettuina; Aloita alusta nollaa koko demon.';
  });
  $('book-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const book = bookState || editorBook();
      const fixed = $('book-mode').value === 'fixed';
      const result = fixed ? M.buyBook(state, book) : M.listenBook(state, book, Number($('listen-minutes').value));
      bookState = book;
      render();
      $('book-status').textContent = result.replay ? 'Uusintakuuntelu: 0 krediittiä. Kirja säilyy omassa hyllyssä.'
        : `${fixed ? 'Kertaosto' : `Kuunneltu ${number(result.minutes)} min`}: ${number(result.credits)} krediittiä.${result.acquired ? ' Lukuoikeus hankittu ja kirja lisätty demon omaan hyllyyn.' : ' Voit jatkaa kuuntelua seuraavalla kerralla.'}`;
      $('book-status').classList.remove('error');
    } catch (error) {
      $('book-status').textContent = error.message;
      $('book-status').classList.add('error');
    }
  });
  render();
})();
