const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../library-pricing.js');
test('the real example is matched by identity and inherits the catalogue rate', () => {
  const saved = P.WORKS['122'];
  const q = P.forWork({ id: 122, title: saved.title });
  assert.equal(q.multiplier, 10);
  assert.equal(q.inherited, true);
  assert.equal(q.listeningCredits, 175);
  assert.equal(q.purchaseCredits, 175);
  assert.equal(P.forWork({ id: 121, title: saved.title }), null);
  assert.equal(P.forWork({ id: 122, title: 'Toinen kirja' }), null);
});
test('fractional work overrides win over catalogue defaults, with explicit limits', () => {
  const saved = P.WORKS['122'];
  const q = P.quote({ ...saved, multiplier: 1.3 }, { multiplier: 10 });
  assert.equal(q.listeningCredits, 23);
  assert.equal(q.inherited, false);
  assert.equal(P.quote(saved, { multiplier: 2 }).listeningCredits, 35);
  for (const multiplier of [0, 20.1, 1.33, Infinity, NaN]) assert.throws(() => P.quote({ ...saved, multiplier }));
  for (const purchaseCredits of [0, 25001, 1.2]) assert.throws(() => P.quote({ ...saved, purchaseCredits }));
  assert.throws(() => P.quote({ ...saved, durationMs: 0 }));
});
