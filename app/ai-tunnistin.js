(() => {
  'use strict';
  const formArea = document.getElementById('detector');
  formArea.innerHTML = `
    <form autocomplete="off">
      <div class="form-heading"><h2>Pika-arvio</h2><span>Maksuton</span></div>
      <p class="hint">Tilastollinen arvio on suuntaa antava. Jos haluat selvittää, miten teksti on syntynyt, tarkista myös luonnokset ja versiohistoria.</p>
      <label for="sample">Arvioitava teksti</label>
      <p class="hint" id="requirements">Liitä vähintään 1 000 sanaa suomenkielistä tekstiä. Enimmäiskoko on 500 kt.</p>
      <textarea id="sample" rows="9" spellcheck="false" aria-describedby="requirements word-count" placeholder="Liitä teksti tähän…"></textarea>
      <div class="form-meta"><span id="word-count">0 sanaa</span><button type="button" class="clear" disabled>Tyhjennä</button></div>
      <div class="actions"><button type="submit" aria-describedby="sample-privacy" disabled>Arvioi teksti</button>
        <small id="sample-privacy">Pika-arviossa tekstisi käsitellään SkriptLabin Euroopassa sijaitsevan palvelimen muistissa. Tekstiä ei tallenneta.</small></div>
      <p class="status" role="status"></p>
    </form>
    <section id="assessment" aria-labelledby="assessment-title" hidden tabindex="-1"></section>`;

  const form = formArea.querySelector('form');
  const sample = form.querySelector('textarea');
  const count = form.querySelector('#word-count');
  const send = form.querySelector('[type=submit]');
  const clear = form.querySelector('.clear');
  const status = form.querySelector('[role=status]');
  const result = formArea.querySelector('#assessment');
  const format = new Intl.NumberFormat('fi-FI');
  const words = /[A-Za-zÅÄÖåäöÜüÉéÕõŠšŽž]+(?:[-’'][A-Za-zÅÄÖåäöÜüÉéÕõŠšŽž]+|:[a-zåäö]{1,5}(?![\p{L}\p{N}_]))*/gu;
  const levels = {sana: 'Sanavalinnat', lause: 'Lauserakenteet', teksti: 'Kieli ja rakenne',
    raja: 'Heikkoja piirteitä', ei: 'Ei selviä piirteitä', lyhyt: 'Lyhyt jakso'};
  let controller = null;

  function update() {
    const normalized = sample.value.normalize('NFC').replace(/[\u00ad\u200b\ufeff]/g, '');
    const total = (normalized.match(words) || []).length;
    const tooLarge = new Blob([sample.value]).size > 512000;
    count.textContent = format.format(total) + (total === 1 ? ' sana' : ' sanaa');
    send.disabled = Boolean(controller) || total < 1000 || tooLarge;
    clear.disabled = !sample.value;
    if (tooLarge) status.textContent = 'Näyte ylittää 500 kt. Lyhennä tekstiä ennen arviointia.';
  }

  function invalidate() {
    controller?.abort();
    controller = null;
    send.textContent = 'Arvioi teksti';
    status.textContent = '';
    result.replaceChildren();
    result.hidden = true;
    update();
  }

  function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }

  function showReport(report) {
    const heading = element('h2', 'Tekstin pika-arvio');
    heading.id = 'assessment-title';
    result.replaceChildren(heading, element('p', report.summary));
    result.append(element('small', 'Sääntöpohjainen arvio · ' + format.format(report.words) + ' sanaa.'));
    result.append(element('p', 'Tilastollinen arvio on suuntaa antava. Pelkästä tekstistä ei voi varmuudella päätellä, onko tekoälyä käytetty tai miten sitä on käytetty.'));
    if (report.translation) result.append(element('p', 'Mukana on englannista kääntämiseen sopivia rakenteita. Käännöksen tekotapa jää avoimeksi.'));
    if (report.observations.length) {
      result.append(element('h3', 'Mihin arvio perustuu?'));
      const list = document.createElement('ul');
      for (const item of report.observations) {
        const row = document.createElement('li');
        row.append(element('strong', item.name), element('span', item.value));
        if (item.example) row.append(element('blockquote', item.example));
        row.append(element('small', item.context));
        list.append(row);
      }
      result.append(list);
    }
    result.append(element('h3', 'Havaintojen sijainti'));
    const marked = report.sections.filter(s => ['sana', 'lause', 'teksti'].includes(s.level));
    const markedWords = marked.reduce((total, s) => total + s.end - s.start + 1, 0);
    const share = new Intl.NumberFormat('fi-FI', {style: 'percent', maximumFractionDigits: 1});
    result.append(element('p', 'Erottuvia sana-, lause- tai rakennepiirteitä löytyi ' +
      marked.length + ' jaksosta. Näissä jaksoissa on ' + share.format(markedWords / report.words) +
      ' näytteen sanoista. Osuus kuvaa kokonaisten jaksojen pituutta.'));
    const details = document.createElement('details');
    details.append(element('summary', 'Näytä jaksot (' + report.sections.length + ')'));
    const lines = document.createElement('ol');
    for (const section of report.sections) {
      const row = document.createElement('li');
      row.append(element('strong', 'Sanat ' + format.format(section.start) + '–' + format.format(section.end)),
        element('span', levels[section.level]), element('small', section.opening + '…'));
      lines.append(row);
    }
    details.append(lines);
    result.append(details);
    result.append(element('h3', 'Miten voit selvittää tekstin kirjoitustapaa?'),
      element('p', 'Vertaa raportissa esiin nousseita kohtia päivättyihin luonnoksiin ja asiakirjan versiohistoriaan. Niistä voit nähdä, milloin kohta lisättiin ja miten se muuttui. Jos muutoksen syy jää avoimeksi, pyydä kirjoittajaa kertomaan, mitä työkaluja hän käytti siinä työvaiheessa.'));
    result.hidden = false;
    result.focus();
  }

  sample.addEventListener('input', invalidate);
  clear.addEventListener('click', () => { sample.value = ''; invalidate(); sample.focus(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (send.disabled) return;
    const request = new AbortController();
    controller = request;
    send.disabled = true;
    send.textContent = 'Arvioidaan…';
    result.hidden = true;
    status.textContent = 'Tekstiä analysoidaan.';
    try {
      const response = await fetch(window.SKRIPTLAB_CONFIG.API_BASE_URL + '/api/ai-tunnistin/pika-arvio', {
        method: 'POST', headers: {'Content-Type': 'text/plain;charset=UTF-8'},
        body: sample.value, cache: 'no-store', credentials: 'omit', signal: request.signal
      });
      const report = await response.json().catch(() => null);
      if (controller !== request) return;
      if (!response.ok || !report?.sections) {
        const detail = response.status !== 404 && typeof report?.detail === 'string' && report.detail;
        throw new Error(detail || 'Pika-arvio ei ole juuri nyt käytettävissä. Yritä myöhemmin uudelleen.');
      }
      showReport(report);
      status.textContent = 'Arvio valmistui.';
    } catch (error) {
      if (controller === request) status.textContent = error instanceof TypeError
        ? 'Yhteys tunnistimeen katkesi. Yritä uudelleen.' : error.message;
    } finally {
      if (controller === request) {
        controller = null;
        send.textContent = 'Arvioi teksti';
        update();
      }
    }
  });
  window.addEventListener('pagehide', () => { form.reset(); invalidate(); });
  update();
})();
