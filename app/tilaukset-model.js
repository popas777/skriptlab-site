(function (root, factory) {
  'use strict';
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.SkriptLabSubscriptionsDemo = model;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const CAP = 20000;
  const TOPUP = Object.freeze({ credits: 600, cents: 300 });
  const PLANS = Object.freeze([
    Object.freeze({ id: 'basic', name: 'Perustilaus', cents: 590, credits: 1800, users: 1 }),
    Object.freeze({ id: 'pro', name: 'Pro', cents: 990, credits: 3600, users: 2 }),
    Object.freeze({ id: 'family', name: 'Perhe', cents: 1890, credits: 7200, users: 5 })
  ]);
  function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('Anna kelvollinen kokonaisluku.');
    return value;
  }
  function date(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
      throw new Error('Anna kelvollinen päivämäärä.');
    }
    return value;
  }
  function addMonths(value, months) {
    const d = new Date(date(value) + 'T00:00:00Z');
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + integer(months));
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
    return d.toISOString().slice(0, 10);
  }
  function planFor(id) {
    const plan = PLANS.find(p => p.id === id);
    if (!plan) throw new Error('Tuntematon tilaustaso.');
    return plan;
  }
  function balance(state) {
    return state.lots.filter(lot => lot.expires > state.today).reduce((total, lot) => total + lot.remaining, 0);
  }
  function record(state, label, delta, detail = '') {
    state.events.unshift({ date: state.today, label, delta, detail });
  }
  function expire(state) {
    let expired = 0;
    state.lots.forEach(lot => {
      if (lot.expires <= state.today) { expired += lot.remaining; lot.remaining = 0; }
    });
    if (expired) record(state, 'Krediittejä vanheni', -expired);
    return expired;
  }
  function grant(state, requested, label, cents) {
    const accepted = Math.min(requested, CAP - balance(state));
    if (accepted) state.lots.push({ created: state.today, expires: addMonths(state.today, 3), remaining: accepted, label });
    state.paidCents += cents;
    record(state, label, accepted, accepted < requested ? `${requested - accepted} krediittiä jäi saldorajan vuoksi hyvittämättä.` : '');
    return { accepted, overflow: requested - accepted };
  }
  function create(planId, today) {
    const plan = planFor(planId);
    const state = { planId, today: date(today), start: today, month: 0, lots: [], events: [], paidCents: 0 };
    grant(state, plan.credits, `${plan.name} · kuukausierä`, plan.cents);
    return state;
  }
  function topup(state) {
    expire(state);
    if (balance(state) + TOPUP.credits > CAP) throw new Error('600 krediitin paketti ei mahdu saldoon. Käytä ensin krediittejä.');
    return grant(state, TOPUP.credits, 'Lisäaika · 10 klassikkotuntia', TOPUP.cents);
  }
  function spend(state, credits, label = 'Käytetty lukuaika') {
    integer(credits, 1);
    expire(state);
    if (credits > balance(state)) throw new Error('Krediitit eivät riitä. Kokeile pienempää määrää tai lisää lukuaikaa.');
    let remaining = credits;
    [...state.lots].sort((a, b) => a.expires.localeCompare(b.expires)).forEach(lot => {
      const take = Math.min(lot.remaining, remaining);
      lot.remaining -= take;
      remaining -= take;
    });
    record(state, label, -credits);
  }
  function nextMonth(state) {
    state.month += 1;
    state.today = addMonths(state.start, state.month);
    const expired = expire(state);
    const plan = planFor(state.planId);
    return { expired, ...grant(state, plan.credits, `${plan.name} · kuukausierä`, plan.cents) };
  }
  function bookQuote({ mode, minutes, rate, fixed }) {
    integer(minutes, 1, 60000);
    if (mode === 'fixed') return integer(fixed, 1, CAP);
    if (mode !== 'time' || !Number.isFinite(rate) || rate < 0.1 || rate > 100) throw new Error('Anna kelvollinen krediittihinta.');
    // Round only the total so a decimal per-minute rate does not compound rounding.
    return Math.ceil(Number((minutes * rate).toFixed(8)));
  }
  function createBook({ title, minutes, rate, fixed }) {
    bookQuote({ mode: 'time', minutes, rate });
    bookQuote({ mode: 'fixed', minutes, fixed });
    return { title: String(title).trim() || 'Omakustanteen esimerkkikirja', minutes, rate, fixed, listened: 0, listeningCredits: 0, owned: false, acquiredBy: null, acquiredOn: null };
  }
  function listenBook(state, book, minutes) {
    integer(minutes, 1, 60000);
    // An acquired book can be replayed without another charge.
    if (book.owned) return { credits: 0, minutes, acquired: false, replay: true };
    const played = Math.min(minutes, book.minutes - book.listened);
    const cumulative = bookQuote({ mode: 'time', minutes: book.listened + played, rate: book.rate });
    const credits = cumulative - book.listeningCredits;
    if (credits > 0) spend(state, credits, `${book.title} · kuuntelu ${played} min`);
    else record(state, `${book.title} · kuuntelu ${played} min`, 0);
    book.listened += played;
    book.listeningCredits = cumulative;
    const acquired = book.listened === book.minutes;
    if (acquired) {
      book.owned = true;
      book.acquiredBy = 'listening';
      book.acquiredOn = state.today;
      record(state, `${book.title} · lukuoikeus ja oma hylly`, 0, 'Koko kirja kuunneltu.');
    }
    return { credits, minutes: played, acquired, replay: false };
  }
  function buyBook(state, book) {
    if (book.owned) return { credits: 0, acquired: false };
    spend(state, book.fixed, `${book.title} · kertaosto`);
    book.owned = true;
    book.acquiredBy = 'purchase';
    book.acquiredOn = state.today;
    record(state, `${book.title} · lukuoikeus ja oma hylly`, 0, 'Kertaosto.');
    return { credits: book.fixed, acquired: true };
  }
  return { CAP, TOPUP, PLANS, addMonths, planFor, balance, create, topup, spend, nextMonth, bookQuote, createBook, listenBook, buyBook };
});
