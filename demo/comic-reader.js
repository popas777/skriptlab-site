// Two pages rendered from the user's original PDF. The PDF remains unchanged.
const pages = [
  { src: '/demo/assets/vihrea-ovi-sarjakuva-1.webp', alt: 'Vihreä ovi, sarjakuvan sivu 1: Wallace kertoo lapsuudestaan, vihreästä ovesta ja ystävällisten pantterien puutarhasta.' },
  { src: '/demo/assets/vihrea-ovi-sarjakuva-2.webp', alt: 'Vihreä ovi, sarjakuvan sivu 2: Wallace kohtaa oven elämänsä valintojen hetkellä; Redmond pohtii kertomuksen arvoitusta.' },
];
const pdf = '/demo/assets/vihrea-ovi-sarjakuva.pdf';
const pageText = ["VIHREÄ OVI\nH. G. WELLS · SARJAKUVASOVITUS\nEräänä iltana ystäväni Lionel Wallace kertoi minulle\nlapsuutensa salaisuuden. Vieläkään en tiedä, mitä uskoa.\n”Olin viisivuotias ja kuljin yksin\nkaupungilla, kun löysin\nvihreän oven.”\n”Puutarhassa en pelännyt mitään.\nTuntui kuin olisin tullut kotiin.”\n”Siellä minut otettiin heti mukaan leikkiin.\nEn ollut enää yksin.”\n”Kirjan sivuilla näin\nkoko elämäni.\nKaikki eli ja liikkui.”\nMitä sitten\ntapahtuu?\n”Käänsin sivua ja olin taas kadulla. Kun kerroin puutarhasta\nkotona, isä antoi selkään.”\n”Vuosia myöhemmin löysin oven\nkoulumatkalla. Juoksin ohi, etten myöhästyisi.”\n”Vein muut pojat katsomaan, mutta ovea ei\nlöytynyt. Yksinkin etsin turhaan.”\n", "”Seitsemäntoistavuotiaana näin oven taas,\nmatkalla Oxfordin stipendikokeeseen.”\n”Jatkoin matkaa ja sain stipendin.\nSilloin uskoin valinneeni oikein.”\n”Viime aikoina olen nähnyt oven kolmesti.\nEnsin kiirehdin parlamenttiin äänestämään.”\n”Toisella kerralla olin matkalla isän luo.\nHän teki kuolemaa.”\n”Kolmannella kerralla halusin ministeriksi.\nEn malttanut jättää keskustelua kesken.”\nKunpa olisin mennyt sisään.\nNyt en enää löydä ovea.\n”Öisin kuljen taas yksin kaupungilla. Etsin yhä\nsitä ovea.”\nMyöhemmin luin\nlehdestä, että Wallace\noli kuollut. Hänet oli\nlöydetty työmaan\nkaivannosta.\nTyömaa-aidan ovi oli jäänyt salpaamatta,\nja Wallace oli kulkenut siitä sisään.\nMe näemme vain työmaa-aidan ja kuopan.\nMutta mitä Wallace näki?\n"];
const escapeHTML = (text) => text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

class ComicReader extends HTMLElement {
  connectedCallback() {
    if (this.initialized) return;
    this.initialized = true;
    this.page = 0;
    this.innerHTML = `
      <div class="comic-controls" role="group" aria-label="Sarjakuvan sivut">
        <button type="button" data-comic-page="0" aria-pressed="true">Sivu 1</button>
        <button type="button" data-comic-page="1" aria-pressed="false">Sivu 2</button>
        <span data-comic-count role="status" aria-live="polite">1 / 2</span>
      </div>
      <button type="button" class="comic-page-button" data-comic-open aria-haspopup="dialog" aria-label="Suurenna sarjakuvasivu 1">
        <img data-comic-preview width="1199" height="1696" loading="lazy" decoding="async" alt="">
        <span class="comic-enlarge">Avaa suurempana ↗</span>
      </button>
      <div class="comic-links"><a href="${pdf}" target="_blank" rel="noopener">Avaa koko sarjakuva PDF:nä ↗</a><a href="${pdf}" download="Vihrea-ovi-tussi-ja-akvarelli.pdf">Lataa PDF · 2 sivua ↓</a></div>
      <details class="comic-transcript"><summary>Sivun teksti</summary><p data-comic-transcript></p></details>
      <dialog class="comic-reader-dialog" aria-label="Vihreä ovi, sarjakuvan lukutila">
        <div class="comic-dialog-toolbar">
          <span data-comic-count role="status" aria-live="polite">1 / 2</span>
          <button type="button" data-comic-zoom aria-pressed="false">Suurenna</button>
          <button type="button" data-comic-close autofocus>Takaisin sarjakuvaan</button>
          <nav aria-label="Lukutilan sivut"><button type="button" data-comic-step="-1">← Edellinen sivu</button><button type="button" data-comic-step="1">Seuraava sivu →</button></nav>
        </div>
        <div class="comic-page-scroll" tabindex="0" aria-label="Sarjakuvasivu; suurennettua kuvaa voi vierittää">
          <img class="comic-fullpage" data-comic-full width="1199" height="1696" decoding="async" alt="">
        </div>
      </dialog>`;
    this.dialog = this.querySelector('dialog');
    this.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || !this.contains(button)) return;
      if (button.dataset.comicPage !== undefined) this.showPage(Number(button.dataset.comicPage));
      if (button.dataset.comicStep) this.showPage(this.page + Number(button.dataset.comicStep));
      if (button.hasAttribute('data-comic-open')) this.openReader();
      if (button.hasAttribute('data-comic-close')) this.dialog.close();
      if (button.hasAttribute('data-comic-zoom')) {
        const zoomed = this.dialog.dataset.zoom !== 'true';
        this.dialog.dataset.zoom = String(zoomed);
        button.setAttribute('aria-pressed', String(zoomed));
        button.textContent = zoomed ? 'Palauta koko' : 'Suurenna';
      }
    });
    this.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      // Preserve horizontal scrolling while the enlarged page has keyboard focus.
      if (event.target.classList.contains('comic-page-scroll') && this.dialog.dataset.zoom === 'true') return;
      event.preventDefault();
      this.showPage(this.page + (event.key === 'ArrowRight' ? 1 : -1));
    });
    this.dialog.addEventListener('click', event => {
      if (event.target !== this.dialog) return;
      const r = this.dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) this.dialog.close();
    });
    this.dialog.addEventListener('close', () => {
      document.body.classList.remove('comic-reader-open');
      this.dispatchEvent(new Event('comic-view-close', { bubbles: true }));
      this.querySelector('[data-comic-open]')?.focus({ preventScroll: true });
    });
    this.querySelector('[data-comic-preview]').addEventListener('error', () => {
      this.querySelector('.comic-enlarge').textContent = 'Esikatselu ei latautunut. Avaa PDF alla olevasta linkistä.';
    });
    this.showPage(0);
  }
  showPage(index) {
    this.page = Math.max(0, Math.min(pages.length - 1, index));
    const item = pages[this.page];
    const preview = this.querySelector('[data-comic-preview]');
    preview.src = item.src;
    preview.alt = item.alt;
    this.querySelector('[data-comic-open]').setAttribute('aria-label', `Suurenna sarjakuvasivu ${this.page + 1}`);
    this.querySelectorAll('[data-comic-count]').forEach(el => { el.textContent = `Sivu ${this.page + 1} / ${pages.length}`; });
    this.querySelectorAll('[data-comic-page]').forEach(el => el.setAttribute('aria-pressed', String(Number(el.dataset.comicPage) === this.page)));
    this.querySelectorAll('[data-comic-step]').forEach(el => { el.disabled = Number(el.dataset.comicStep) < 0 ? this.page === 0 : this.page === pages.length - 1; });
    this.querySelector('[data-comic-transcript]').innerHTML = escapeHTML(pageText[this.page]).replace(/\n/g, '<br>');
    if (this.dialog.open) this.loadFullPage();
  }
  loadFullPage() {
    const full = this.querySelector('[data-comic-full]');
    full.src = pages[this.page].src;
    full.alt = pages[this.page].alt;
    this.querySelector('.comic-page-scroll').scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }
  openReader() {
    this.dispatchEvent(new Event('comic-view-open', { bubbles: true }));
    this.dialog.showModal();
    document.body.classList.add('comic-reader-open');
    this.loadFullPage();
  }
  disconnectedCallback() {
    if (this.dialog?.open) this.dialog.close();
  }
}
customElements.define('comic-reader', ComicReader);
