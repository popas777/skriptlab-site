(function () {
  'use strict';
  if (!window.SkriptLabAuth?.requireLogin()) return;
  if (window.SkriptLabAuth.getUser()?.role !== 'admin') return;
  const $ = id => document.getElementById(id);
  const P = window.SkriptLabLibraryPricing;
  const M = window.SkriptLabSubscriptionsDemo;
  const saved = P.WORKS['122'];
  const euro = cents => new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR' }).format(cents / 100);
  $('pricing-content').hidden = false;
  try {
    const root = window.parent.document.documentElement;
    const sync = () => { document.body.dataset.shellTheme = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  } catch (_) { /* Standalone preview. */ }
  function draft() {
    if (!$('pricing-form').checkValidity()) throw new Error('Tarkista kerroin ja kertaostohinta.');
    const catalog = { ...P.CATALOGS[saved.catalogId], multiplier: P.validMultiplier(Number($('catalog-rate').value)) };
    const work = { ...saved, multiplier: $('work-rate').value === '' ? null : Number($('work-rate').value), purchaseCredits: Number($('purchase-credits').value) };
    return { catalog, work, resolved: P.quote(work, catalog) };
  }
  function render() {
    $('pricing-rows').replaceChildren();
    try {
      const { resolved } = draft();
      $('pricing-summary').textContent = `${resolved.inherited ? 'Katalogista peritty' : 'Teoskohtainen'} kerroin ${resolved.multiplier.toLocaleString('fi-FI')}×. Koko kuuntelu ${resolved.listeningCredits} krediittiä · kertaosto ${resolved.purchaseCredits} krediittiä.`;
      $('pricing-summary').classList.remove('error');
      $('download-draft').disabled = false;
      for (const pack of [...M.PLANS, ...M.TOPUPS]) {
        const listen = resolved.listeningCredits * pack.cents / pack.credits;
        const purchase = resolved.purchaseCredits * pack.cents / pack.credits;
        const row = document.createElement('tr');
        const name = document.createElement('th');
        name.scope = 'row'; name.textContent = pack.name; row.append(name);
        for (const amount of [listen, listen * .75, listen * .25, purchase, purchase * .8, purchase * .2]) {
          const cell = document.createElement('td'); cell.textContent = euro(amount); row.append(cell);
        }
        $('pricing-rows').append(row);
      }
    } catch (error) {
      $('pricing-summary').textContent = error.message;
      $('pricing-summary').classList.add('error');
      $('download-draft').disabled = true;
    }
  }
  $('pricing-form').addEventListener('input', render);
  $('pricing-form').addEventListener('reset', () => setTimeout(render, 0));
  $('pricing-form').addEventListener('submit', event => {
    event.preventDefault();
    const value = { status: 'draft-only', createdAt: new Date().toISOString(), shares: M.SHARES, limits: P.LIMITS, ...draft() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'kirjan-hinnoitteluluonnos.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  render();
})();
