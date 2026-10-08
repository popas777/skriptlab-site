(function (root, factory) {
  'use strict';
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.SkriptLabSubscriptionsDemo = model;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const CAP = 25000;
  const SHARES = Object.freeze({ listening: 75, purchase: 80 });
  const TOPUP = Object.freeze({ id: 'small', name: 'Lisäpaketti', credits: 600, cents: 250 });
  const TOPUPS = Object.freeze([TOPUP, Object.freeze({ id: 'large', name: 'Iso lisäpaketti', credits: 25000, cents: 10000 })]);
  const NO_PLAN = Object.freeze({ id: 'none', name: 'Ilman tilausta', cents: 0, credits: 0, users: 1 });
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
    const plan = id === 'none' ? NO_PLAN : PLANS.find(p => p.id === id);
    if (!plan) throw new Error('Tuntematon tilaustaso.');
    return plan;
  }
  function offerFor(id, billingCycle = 'monthly') {
    const plan = planFor(id);
    if (!['monthly', 'annual'].includes(billingCycle) || (id === 'none' && billingCycle === 'annual')) throw new Error('Tuntematon maksukausi.');
    const annual = billingCycle === 'annual';
    return { ...plan, billingCycle, name: annual ? `${plan.name} · vuosi` : plan.name,
      // A prepaid year funds 12 monthly credit grants, each at the discounted value.
      cents: annual ? plan.cents * 10 / 12 : plan.cents,
      upfrontCents: annual ? plan.cents * 10 : plan.cents, months: annual ? 12 : 1 };
  }
  function subscriptionOffers() {
    return PLANS.flatMap(plan => [offerFor(plan.id), offerFor(plan.id, 'annual')]);
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
  function grant(state, requested, label, cents, chargedCents = cents) {
    const accepted = Math.min(requested, CAP - balance(state));
    if (accepted) state.lots.push({ id: state.lots.length + 1, created: state.today, expires: addMonths(state.today, 3), remaining: accepted, issued: accepted, unitCents: cents / requested, label });
    state.paidCents += chargedCents;
    record(state, label, accepted, accepted < requested ? `${requested - accepted} krediittiä jäi saldorajan vuoksi hyvittämättä.` : '');
    return { accepted, overflow: requested - accepted };
  }
  function create(planId, today, billingCycle = 'monthly') {
    const plan = offerFor(planId, billingCycle);
    const state = { planId, billingCycle, today: date(today), start: today, month: 0, lots: [], events: [], royalties: [], paidCents: 0,
      paidThrough: billingCycle === 'annual' ? addMonths(today, 12) : null };
    if (billingCycle === 'annual') {
      state.paidCents = plan.upfrontCents;
      record(state, `${plan.name} · vuosimaksu`, 0, '12 kuukautta maksettu etukäteen. Krediitit lisätään kuukausittain.');
    }
    if (plan.credits) grant(state, plan.credits, `${plan.name} · kuukausierä`, plan.cents, billingCycle === 'annual' ? 0 : plan.cents);
    return state;
  }
  function topup(state, packageId = 'small') {
    const pack = TOPUPS.find(item => item.id === packageId);
    if (!pack) throw new Error('Tuntematon krediittipaketti.');
    expire(state);
    if (balance(state) + pack.credits > CAP) throw new Error('Paketti ei mahdu saldoon. Käytä ensin krediittejä.');
    return grant(state, pack.credits, `${pack.name} · ${pack.credits} krediittiä`, pack.cents);
  }
  function spend(state, credits, label = 'Käytetty lukuaika') {
    integer(credits, 1);
    expire(state);
    if (credits > balance(state)) throw new Error('Krediitit eivät riitä. Kokeile pienempää määrää tai lisää lukuaikaa.');
    let remaining = credits;
    const allocations = [];
    [...state.lots].sort((a, b) => a.expires.localeCompare(b.expires)).forEach(lot => {
      const take = Math.min(lot.remaining, remaining);
      if (take) allocations.push({ lotId: lot.id, credits: take, cents: take * lot.unitCents });
      lot.remaining -= take;
      remaining -= take;
    });
    record(state, label, -credits);
    return { allocations, cents: allocations.reduce((sum, item) => sum + item.cents, 0) };
  }
  function nextMonth(state) {
    state.month += 1;
    state.today = addMonths(state.start, state.month);
    const expired = expire(state);
    const plan = offerFor(state.planId, state.billingCycle);
    if (!plan.credits || (state.billingCycle === 'annual' && state.month >= 12)) return { expired, accepted: 0, overflow: 0 };
    return { expired, ...grant(state, plan.credits, `${plan.name} · kuukausierä`, plan.cents, state.billingCycle === 'annual' ? 0 : plan.cents) };
  }
  function bookQuote({ mode, minutes, rate, fixed }) {
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 60000) throw new Error('Anna kelvollinen kesto.');
    if (mode === 'fixed') return integer(fixed, 1, CAP);
    if (mode !== 'time' || !Number.isFinite(rate) || rate < 0.1 || rate > 20 || Math.abs(rate * 10 - Math.round(rate * 10)) > 1e-8) throw new Error('Anna kelvollinen krediittihinta.');
    // Round only the total so a decimal per-minute rate does not compound rounding.
    return Math.ceil(Number((minutes * rate).toFixed(8)));
  }
  function createBook({ title, minutes, rate, fixed }) {
    bookQuote({ mode: 'time', minutes, rate });
    bookQuote({ mode: 'fixed', minutes, fixed });
    return { title: String(title).trim() || 'Omakustanteen esimerkkikirja', minutes, rate, fixed, listened: 0, listeningCredits: 0, owned: false, acquiredBy: null, acquiredOn: null };
  }
  function listenBook(state, book, minutes) {
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 60000) throw new Error('Anna kelvollinen kesto.');
    // An acquired book can be replayed without another charge.
    if (book.owned) return { credits: 0, minutes, acquired: false, replay: true };
    const played = Math.min(Math.round(minutes * 60000), Math.round((book.minutes - book.listened) * 60000)) / 60000;
    const cumulative = bookQuote({ mode: 'time', minutes: book.listened + played, rate: book.rate });
    const credits = cumulative - book.listeningCredits;
    if (credits > 0) settle(state, book, 'listening', spend(state, credits, `${book.title} · kuuntelu ${played} min`));
    else record(state, `${book.title} · kuuntelu ${played} min`, 0);
    book.listened = Math.min(book.minutes, Math.round((book.listened + played) * 60000) / 60000);
    book.listeningCredits = cumulative;
    const acquired = Math.round(book.listened * 60000) >= Math.round(book.minutes * 60000);
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
    settle(state, book, 'purchase', spend(state, book.fixed, `${book.title} · kertaosto`));
    book.owned = true;
    book.acquiredBy = 'purchase';
    book.acquiredOn = state.today;
    record(state, `${book.title} · lukuoikeus ja oma hylly`, 0, 'Kertaosto.');
    return { credits: book.fixed, acquired: true };
  }
  function settle(state, book, mode, payment) {
    const publisherCents = payment.cents * SHARES[mode] / 100;
    state.royalties.push({ title: book.title, mode, date: state.today, share: SHARES[mode],
      ...payment, publisherCents, platformCents: payment.cents - publisherCents });
  }
  function economics({ cents, credits, publisherPercent, usePercent, classicPercent = 0, monthlyCostCents, hourlyCostCents }) {
    for (const value of [cents, credits, publisherPercent, usePercent, classicPercent, monthlyCostCents, hourlyCostCents]) {
      if (!Number.isFinite(value) || value < 0) throw new Error('Anna kelvolliset laskennan lähtöarvot.');
    }
    if (credits <= 0 || publisherPercent > 100 || usePercent > 100 || classicPercent > 100) throw new Error('Prosentin pitää olla välillä 0–100.');
    const consumedRevenue = cents * (usePercent / 100);
    const classicRevenue = consumedRevenue * (classicPercent / 100);
    const publisher = consumedRevenue * (1 - classicPercent / 100) * publisherPercent / 100;
    const platformUsage = consumedRevenue - publisher;
    const expiredRevenue = cents * (1 - usePercent / 100);
    const costs = monthlyCostCents + credits / 60 * usePercent / 100 * hourlyCostCents;
    return { publisher, classicRevenue, platformUsage, expiredRevenue, costs, remainder: platformUsage + expiredRevenue - costs };
  }
  return { CAP, SHARES, TOPUP, TOPUPS, PLANS, addMonths, planFor, offerFor, subscriptionOffers, balance, create, topup, spend, nextMonth, bookQuote, createBook, listenBook, buyBook, economics };
});
