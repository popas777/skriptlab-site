const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../tilaukset-model.js');

test('subscription quantities and the top-up reference value agree with the proposed prices', () => {
  assert.deepEqual(M.PLANS.map(p => [p.cents, p.credits / 60, p.users]), [[590, 30, 1], [990, 60, 2], [1890, 120, 5]]);
  assert.equal(M.CAP * M.TOPUP.cents / M.TOPUP.credits, 10000);
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
test('family balance never exceeds cap and overflow is recorded instead of silently hidden', () => {
  const state = M.create('family', '2026-10-08');
  M.nextMonth(state);
  assert.deepEqual(M.nextMonth(state), { expired: 0, accepted: 5600, overflow: 1600 });
  assert.equal(M.balance(state), 20000);
  assert.match(state.events[0].detail, /1600/);
  assert.equal(state.paidCents, 5670);
  const before = JSON.stringify(state);
  assert.throws(() => M.topup(state), /ei mahdu/);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(M.nextMonth(state), { expired: 7200, accepted: 7200, overflow: 0 });
  assert.equal(M.balance(state), 20000);
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
  assert.throws(() => M.bookQuote({ mode: 'fixed', minutes: 360, fixed: 20001 }));
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
