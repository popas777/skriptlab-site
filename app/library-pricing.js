(function (root, factory) {
  'use strict';
  const pricing = factory();
  if (typeof module === 'object' && module.exports) module.exports = pricing;
  else root.SkriptLabLibraryPricing = pricing;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  // Demonstration catalogue only. No payment or access enforcement lives here.
  const LIMITS = Object.freeze({ minMultiplier: 0.1, maxMultiplier: 20, maxPurchase: 25000 });
  const CATALOGS = Object.freeze({ 'j-murto': Object.freeze({ name: 'J. Murto', multiplier: 10 }) });
  const WORKS = Object.freeze({ '122': Object.freeze({
    workId: '122', title: 'Delfiinin ilta lahdella', author: 'J. Murto', catalogId: 'j-murto',
    durationMs: 1044760, durationSource: 'v002 · tuotannon tarkistettu kesto',
    audioSha256: 'dfd6c5b0165fa45baf79e0011c04590db98d47120859e43b8ee3bd9fbd35a65d',
    multiplier: null, purchaseCredits: 175, revision: 'demo-2026-10-08-1'
  }) });
  function validMultiplier(value) {
    if (!Number.isFinite(value) || value < LIMITS.minMultiplier || value > LIMITS.maxMultiplier || Math.abs(value * 10 - Math.round(value * 10)) > 1e-8) {
      throw new Error('Kerroin 0,1–20,0, yhden desimaalin tarkkuudella.');
    }
    return value;
  }
  function quote(work, catalog = CATALOGS[work.catalogId]) {
    const multiplier = validMultiplier(work.multiplier == null ? catalog?.multiplier : work.multiplier);
    if (!Number.isSafeInteger(work.durationMs) || work.durationMs <= 0) throw new Error('Teoksen kesto puuttuu.');
    if (!Number.isSafeInteger(work.purchaseCredits) || work.purchaseCredits < 1 || work.purchaseCredits > LIMITS.maxPurchase) throw new Error('Kertaostohinta 1–25 000 krediittiä.');
    return { ...work, multiplier, inherited: work.multiplier == null,
      listeningCredits: Math.ceil(Number((work.durationMs / 60000 * multiplier).toFixed(8))) };
  }
  function forWork(work) {
    const saved = WORKS[String(work?.id)];
    // A title check prevents accidentally applying this example to a different database.
    return saved && work.title === saved.title ? quote(saved) : null;
  }
  return { LIMITS, CATALOGS, WORKS, validMultiplier, quote, forWork };
});
