const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../tilaukset-model.js');

test('subscription quantities and the top-up reference value agree with the proposed prices', () => {
  assert.deepEqual(M.PLANS.map(p => [p.cents, p.credits / 60, p.users]), [[590, 30, 1], [990, 60, 2], [1890, 120, 5]]);
  assert.equal(M.TOPUP.cents, 250);
  assert.equal(M.TOPUPS[1].credits, M.CAP);
  assert.equal(M.TOPUPS[1].cents, 10000);
});
test('credits carry over, then expire exactly three calendar months after each grant', () => {
  const state = M.create('basic', '2026-10-08');
  M.nextMonth(state);
  M.nextMonth(state);
  assert.equal(M.balance(state), 5400);
  assert.deepEqual(M.nextMonth(state), { expired: 1800, accepted: 1800, overflow: 0 });
  assert.equal(M.balance(state), 5400);
  assert.equal(state.lots[0].remaining, 0);
  assert.equal(state.lots[1].remaining, 1800);
});
test('calendar month arithmetic clamps month ends and renewal keeps its original anchor', () => {
  assert.equal(M.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(M.addMonths('2027-11-30', 3), '2028-02-29');
  const state = M.create('pro', '2026-01-31');
  M.nextMonth(state);
  M.nextMonth(state);
  assert.equal(state.today, '2026-03-31');
  assert.equal(state.lots[0].expires, '2026-04-30');
});
test('spending uses the earliest expiry first and new top-ups do not renew older credits', () => {
  const state = M.create('basic', '2026-10-08');
  M.nextMonth(state);
  M.topup(state);
  M.spend(state, 2000);
  assert.deepEqual(state.lots.map(lot => lot.remaining), [0, 1600, 600]);
  assert.equal(state.lots[0].expires, '2027-01-08');
  assert.equal(state.lots[2].expires, '2027-02-08');
  assert.equal(M.balance(state), 2200);
});
test('three family grants fit and top-ups never partially charge above the new cap', () => {
  const state = M.create('family', '2026-10-08');
  M.nextMonth(state);
  assert.deepEqual(M.nextMonth(state), { expired: 0, accepted: 7200, overflow: 0 });
  assert.equal(M.balance(state), 21600);
  for (let i = 0; i < 5; i++) M.topup(state);
  const before = JSON.stringify(state);
  assert.throws(() => M.topup(state), /ei mahdu/);
  assert.equal(JSON.stringify(state), before);
  assert.equal(M.balance(state), 24600);
});
test('large package fills an empty wallet, keeps its acquisition value and expires after three months', () => {
  const state = M.create('none', '2026-10-08');
  M.topup(state, 'large');
  assert.equal(M.balance(state), 25000);
  assert.equal(state.paidCents, 10000);
  assert.equal(state.lots[0].unitCents, .4);
  assert.throws(() => M.topup(state, 'large'), /ei mahdu/);
  M.nextMonth(state); M.nextMonth(state);
  assert.equal(M.balance(state), 25000);
  assert.equal(M.nextMonth(state).expired, 25000);
  assert.equal(M.balance(state), 0);
  assert.throws(() => M.topup(state, 'invalid'));
});
test('monthly overflow is explicit and unit value remains tied to the original package', () => {
  const state = M.create('family', '2026-10-08');
  for (let i = 0; i < 25; i++) M.topup(state);
  assert.deepEqual(M.nextMonth(state), { expired: 0, accepted: 2800, overflow: 4400 });
  assert.equal(M.balance(state), 25000);
  assert.match(state.events[0].detail, /4400/);
  assert.equal(state.lots.at(-1).unitCents, 1890 / 7200);
});
test('insufficient or invalid spending leaves the wallet unchanged', () => {
  const state = M.create('basic', '2026-10-08');
  const before = JSON.stringify(state);
  for (const amount of [-1, 0, 1.5, NaN, Infinity, 1801]) assert.throws(() => M.spend(state, amount));
  assert.equal(JSON.stringify(state), before);
});
test('publisher quotes distinguish the whole-book price from a per-minute rate', () => {
  assert.equal(M.bookQuote({ mode: 'time', minutes: 360, rate: 3 }), 1080);
  assert.equal(M.bookQuote({ mode: 'time', minutes: 3, rate: 1.1 }), 4);
  assert.equal(M.bookQuote({ mode: 'time', minutes: 100, rate: 1.1 }), 110);
  assert.equal(M.bookQuote({ mode: 'fixed', minutes: 360, fixed: 1200 }), 1200);
  for (const rate of [0, -1, NaN, 101]) assert.throws(() => M.bookQuote({ mode: 'time', minutes: 360, rate }));
  assert.throws(() => M.bookQuote({ mode: 'fixed', minutes: 360, fixed: 25001 }));
});
test('a new scenario starts from its own first grant with no shared state', () => {
  const first = M.create('basic', '2026-10-08');
  M.topup(first);
  const second = M.create('family', '2026-10-08');
  assert.equal(M.balance(second), 7200);
  assert.equal(second.events.length, 1);
  assert.throws(() => M.create('unknown', '2026-10-08'));
  assert.throws(() => M.create('basic', '2026-02-30'));
});

const sampleBook = () => M.createBook({ title: 'Esimerkkiteos', minutes: 360, rate: 3, fixed: 1200 });
test('a one-off purchase grants reading and shelf rights immediately and cannot charge twice', () => {
  const state = M.create('basic', '2026-10-08');
  const book = sampleBook();
  assert.deepEqual(M.buyBook(state, book), { credits: 1200, acquired: true });
  assert.equal(book.owned, true);
  assert.equal(book.listened, 0);
  assert.equal(M.balance(state), 600);
  assert.deepEqual(M.buyBook(state, book), { credits: 0, acquired: false });
  assert.equal(M.listenBook(state, book, 60).credits, 0);
  assert.equal(M.balance(state), 600);
});
test('listening grants rights only at completion; last session is capped to remaining duration', () => {
  const state = M.create('basic', '2026-10-08');
  const book = sampleBook();
  M.listenBook(state, book, 359);
  assert.equal(book.owned, false);
  assert.equal(book.listened, 359);
  assert.deepEqual(M.listenBook(state, book, 60), { credits: 3, minutes: 1, acquired: true, replay: false });
  assert.equal(book.owned, true);
  assert.equal(book.acquiredBy, 'listening');
  assert.equal(M.balance(state), 720);
  assert.equal(M.listenBook(state, book, 360).credits, 0);
});
test('an insufficient balance cannot advance listening or grant a book', () => {
  const state = M.create('basic', '2026-10-08');
  M.spend(state, 1799);
  const book = sampleBook();
  const before = JSON.stringify(book);
  assert.throws(() => M.listenBook(state, book, 60), /eivät riitä/);
  assert.throws(() => M.buyBook(state, book), /eivät riitä/);
  assert.equal(JSON.stringify(book), before);
});
test('partial listening followed by purchase uses the explicit full purchase price assumption', () => {
  const state = M.create('basic', '2026-10-08');
  const book = sampleBook();
  M.listenBook(state, book, 60);
  M.buyBook(state, book);
  assert.equal(M.balance(state), 420);
  assert.equal(book.owned, true);
});
test('owned rights survive expiry and fractional rates cost the same across session splits', () => {
  const state = M.create('basic', '2026-10-08');
  const book = M.createBook({ title: 'Lyhyt', minutes: 10, rate: 0.1, fixed: 1 });
  for (let i = 0; i < 10; i += 1) M.listenBook(state, book, 1);
  assert.equal(book.listeningCredits, 1);
  assert.equal(M.balance(state), 1799);
  for (let i = 0; i < 4; i += 1) M.nextMonth(state);
  assert.equal(book.owned, true);
  assert.equal(M.buyBook(state, book).credits, 0);
});

test('80/20 at full use pays rightsholders from each plan actual acquisition price', () => {
  const result = M.economics({ ...M.planFor('family'), publisherPercent: 80, usePercent: 100, monthlyCostCents: 0, hourlyCostCents: 0 });
  assert.equal(result.publisher, 1512);
  assert.equal(result.platformUsage, 378);
  assert.equal(result.expiredRevenue, 0);
  assert.equal(result.remainder, 378);
  assert.equal(1000 * M.planFor('family').cents / M.planFor('family').credits * .8, 210);
  assert.ok(Math.abs(1000 * M.TOPUP.cents / M.TOPUP.credits * .8 - 333.3333333333) < 1e-6);
});
test('expiry and costs are separate from the platform share of actual consumption', () => {
  const result = M.economics({ ...M.planFor('family'), publisherPercent: 80, usePercent: 50, monthlyCostCents: 100, hourlyCostCents: 2 });
  assert.equal(result.publisher, 756);
  assert.equal(result.platformUsage, 189);
  assert.equal(result.expiredRevenue, 945);
  assert.equal(result.costs, 220);
  assert.equal(result.remainder, 914);
  assert.equal(result.publisher + result.costs + result.remainder, 1890);
});
test('the calculator exposes losses without assuming expiry and rejects invalid rates', () => {
  const inputs = { ...M.planFor('family'), publisherPercent: 80, usePercent: 100, monthlyCostCents: 400, hourlyCostCents: 1 };
  assert.equal(M.economics(inputs).remainder, -142);
  assert.throws(() => M.economics({ ...inputs, usePercent: 101 }));
  assert.throws(() => M.economics({ ...inputs, monthlyCostCents: -1 }));
  assert.throws(() => M.economics({ ...inputs, publisherPercent: NaN }));
});

test('mixed credit lots settle listening at 75 percent and purchases at 80 percent', () => {
  const state = M.create('basic', '2026-10-08');
  M.topup(state);
  M.spend(state, 1700);
  const book = M.createBook({ title: 'Sekasaldo', minutes: 175 / 10, rate: 10, fixed: 175 });
  M.listenBook(state, book, 60);
  const royalty = state.royalties[0];
  assert.deepEqual(royalty.allocations.map(a => a.credits), [100, 75]);
  assert.equal(royalty.share, 75);
  assert.equal(royalty.cents, 100 * 590 / 1800 + 75 * 250 / 600);
  assert.equal(royalty.publisherCents, royalty.cents * .75);
  M.buyBook(state, M.createBook({ title: 'Osto', minutes: 1, rate: 1, fixed: 100 }));
  assert.equal(state.royalties[1].share, 80);
  assert.ok(Math.abs(state.royalties[1].publisherCents - state.royalties[1].cents * .8) < 1e-9);
});
test('Delfiini fractional duration and 1.3 multiplier retain split-session rounding and grant completion', () => {
  for (const rate of [1.3, 10]) {
    const state = M.create('basic', '2026-10-08');
    const book = M.createBook({title: 'Delfiini', minutes: 1044.76 / 60, rate, fixed: 175});
    for (let i = 0; i < 17; i++) M.listenBook(state, book, 1);
    assert.equal(book.owned, false);
    M.listenBook(state, book, 1);
    assert.equal(book.owned, true);
    assert.equal(book.listeningCredits, Math.ceil(1044.76 / 60 * rate));
    assert.equal(M.listenBook(state, book, 60).credits, 0);
  }
});

test('annual offers charge ten monthly prices and allocate that payment across twelve grants', () => {
  assert.deepEqual(M.PLANS.map(p => M.offerFor(p.id, 'annual').upfrontCents), [5900, 9900, 18900]);
  assert.equal(M.subscriptionOffers().length, 6);
  for (const plan of M.PLANS) {
    const offer = M.offerFor(plan.id, 'annual');
    assert.equal(offer.credits, plan.credits);
    assert.equal(offer.users, plan.users);
    assert.ok(Math.abs(offer.cents * 12 - offer.upfrontCents) < 1e-9);
  }
  assert.throws(() => M.create('none', '2026-10-08', 'annual'));
  assert.throws(() => M.create('basic', '2026-10-08', 'invalid'));
});
test('a prepaid year grants monthly credits without charging again and stops after twelve grants', () => {
  for (const plan of M.PLANS) {
    const state = M.create(plan.id, '2026-10-08', 'annual');
    assert.equal(M.balance(state), plan.credits);
    assert.equal(state.paidCents, plan.cents * 10);
    assert.equal(state.paidThrough, '2027-10-08');
    for (let i = 1; i < 12; i++) {
      assert.equal(M.nextMonth(state).accepted, plan.credits);
      assert.equal(state.paidCents, plan.cents * 10);
    }
    assert.equal(state.lots.length, 12);
    assert.equal(state.lots.reduce((sum, lot) => sum + lot.issued, 0), plan.credits * 12);
    assert.equal(M.nextMonth(state).accepted, 0);
    assert.equal(state.lots.length, 12);
    assert.equal(state.paidCents, plan.cents * 10);
    assert.equal(M.balance(state), plan.credits * 2);
    M.nextMonth(state); M.nextMonth(state);
    assert.equal(M.balance(state), 0);
  }
});
test('annual credit expiry starts at each monthly grant and keeps the month-end anchor', () => {
  const state = M.create('basic', '2026-01-31', 'annual');
  M.nextMonth(state); M.nextMonth(state);
  assert.equal(state.lots[0].created, '2026-01-31');
  assert.equal(state.lots[1].created, '2026-02-28');
  assert.equal(state.lots[1].expires, '2026-05-28');
  assert.equal(state.lots[2].created, '2026-03-31');
  assert.equal(state.lots[2].expires, '2026-06-30');
  assert.equal(state.paidThrough, '2027-01-31');
});
test('annual royalties use the discounted unit price while extra credits keep their own price', () => {
  const state = M.create('family', '2026-10-08', 'annual');
  const unit = 18900 / (12 * 7200);
  assert.equal(state.lots[0].unitCents, unit);
  const book = M.createBook({ title: 'Vuosi', minutes: 17.5, rate: 10, fixed: 175 });
  M.listenBook(state, book, 60);
  assert.ok(Math.abs(state.royalties[0].publisherCents - 175 * unit * .75) < 1e-9);
  M.buyBook(state, M.createBook({ title: 'Osto', minutes: 1, rate: 1, fixed: 175 }));
  assert.ok(Math.abs(state.royalties[1].publisherCents - 175 * unit * .8) < 1e-9);
  M.topup(state);
  assert.equal(state.paidCents, 19150);
  assert.equal(state.lots[1].unitCents, 250 / 600);
  const result = M.economics({ ...M.offerFor('family', 'annual'), publisherPercent: 75, usePercent: 100, monthlyCostCents: 0, hourlyCostCents: 0 });
  assert.equal(result.platformUsage, 393.75);
});
