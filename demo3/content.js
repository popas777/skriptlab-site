/* Curated examples from demo/story-data.js and the Ovi muurissa project.
   Quotes are source text; directions and interpretations are marked as such.
   This module makes no model calls and never sends manuscript text anywhere. */

const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

export const contexts = {
  wallace: {
    name: 'Lionel Wallace', kind: 'HENKILÖ & ÄÄNI', part: 'I',
    quote: 'Jokin, mikä vie elämästä valon, täyttää minut kaipauksella …',
    description: 'Menestynyt, 39-vuotias poliitikko kertoo lapsuuden kokemuksesta. Julkisen menestyksen rinnalla kulkee muisto onnen paikasta, johon hän haluaisi palata.',
    carry: 'Aikuisen muisteleva ääni. Lapsuuden kokemus. Ura ja kaipaus rinnakkain.',
    nuance: 'Ääniohjeen tulkinta: harkittu puhe saa murtua taukoihin. Lapsuusmuisto ei muuta kertojaa lapseksi.',
  },
  redmond: {
    name: 'Redmond', kind: 'KERTOJA & NÄKÖKULMA', part: 'I',
    quote: 'Ja silloin ajattelin, että ainakin hänelle itselleen se oli tosi.',
    description: 'Wallacen ystävä ja entinen koulutoveri välittää kertomuksen lukijalle. Hän pohtii omaa uskoaan siihen, mitä Wallace koki.',
    carry: 'Kehyskertoja erillään Wallacesta. Harkittu sävy. Tiedon ja uskomuksen ero.',
    nuance: 'Käännöksessä ja äänessä on säilytettävä varaus: kertoja ei vahvista puutarhan todellisuutta.',
  },
  door: {
    name: 'Vihreä ovi', kind: 'PAIKKA & MOTIIVI', part: 'I',
    quote: 'Mutta valkoinen muuri ja vihreä ovi erottuivat aivan selvinä.',
    description: 'Valkoisessa muurissa oleva ovi yhdistää arjen ja lumotun puutarhan. Sama näky palaa Wallacen elämän eri vaiheissa.',
    carry: 'Vihreä väri. Valkoinen muuri. Oven toistuminen valintojen hetkillä.',
    nuance: 'Tulkinta: ovi toimii myös mahdollisuuden ja kaipauksen kuvana.',
  },
  garden: {
    name: 'Lumottu puutarha', kind: 'PAIKKA & TUNNELMA', part: 'I',
    quote: 'Tunsin vahvasti tulleeni kotiin',
    description: 'Puutarhan pitkä käytävä, marmorireunaiset kukkapenkit, lempeä valo ja kaksi täplikästä pantteria muodostavat oman maailmansa.',
    carry: 'Kotiintulon tunne. Kesyt, ystävälliset eläimet. Valoisa vastakohta harmaalle arjelle.',
    nuance: 'Kuvassa ja tilassa pantterien tehtävä on viestiä turvallisuutta. Uhkaava petokohtaus muuttaisi tekstin merkitystä.',
  },
  longing: {
    name: 'Kaipaus', kind: 'TEEMA · TULKINTA', part: 'I',
    quote: 'Oi, vie minut takaisin puutarhaani! Vie minut takaisin puutarhaani!',
    description: 'Lapsuuden onni asettuu vastakkain koulun, uran ja velvollisuuksien kanssa. Toistuva halu palata puutarhaan sitoo elämänvaiheita yhteen.',
    carry: 'Menetetyn mahdollisuuden tuntu. Toistuva paluun toive. Hillitty surumielisyys.',
    nuance: 'Teemallinen tulkinta voi ohjata kampanjan ydinviestiä ilman, että tarinan loppua paljastetaan.',
  },
  memory: {
    name: 'Muisti & epävarmuus', kind: 'AIKATASOT · TULKINTA', part: 'I',
    quote: 'Olen saattanut lisätä siihen jotakin, olen saattanut muuttaa sitä; en tiedä …',
    description: 'Redmond kertoo Wallacen kertomaa muistoa. Lapsen kokemus, aikuisen muisti ja kehyskertojan arvio ovat eri tasoja.',
    carry: 'Muiston kerroksellisuus. Epävarmat yksityiskohdat. Avoin suhde todellisuuteen.',
    nuance: 'Yhteinen tulkintasääntö: puutarhaa ei selitetä varmasti uneksi, kuolemaksi tai toiseksi todellisuudeksi.',
  },
};

export const translations = {
  fi: {
    name: 'Suomi', label: 'TARKISTETTU SUOMENNOS',
    text: 'Mutta valkoinen muuri ja vihreä ovi erottuivat aivan selvinä.',
    note: 'Katkelma projektin tarkistetusta suomennoksesta.',
  },
  sv: {
    name: 'Ruotsi', label: 'KÄÄNNÖSLUONNOS',
    text: 'Men den vita muren och den gröna dörren framträdde alldeles tydligt.',
    note: 'Tätä demoa varten valmisteltu ruotsinnoksen luonnos.',
  },
  de: {
    name: 'Saksa', label: 'KÄÄNNÖSLUONNOS',
    text: 'Doch die weiße Mauer und die grüne Tür hoben sich ganz deutlich ab.',
    note: 'Tätä demoa varten valmisteltu saksannoksen luonnos.',
  },
};

export const voices = {
  fi: {
    name: 'Suomi', src: '/demo/assets/narrator-fi.m4a', lang: 'fi',
    label: 'Ovi muurissa, suomenkielinen koneääninäyte',
    transcript: 'Eräänä luottamuksellisena iltana, vajaat kolme kuukautta sitten, Lionel Wallace kertoi minulle tämän tarinan muurissa olevasta ovesta. Ja silloin ajattelin, että ainakin hänelle itselleen se oli tosi.',
  },
  en: {
    name: 'Englanti', src: '/demo/assets/narrator-en.m4a', lang: 'en',
    label: 'The Door in the Wall, englanninkielinen koneääninäyte',
    transcript: 'One confidential evening, not three months ago, Lionel Wallace told me this story of the Door in the Wall. And at the time I thought that so far as he was concerned it was a true story.',
  },
};

export const campaigns = {
  social: {
    label: 'Some', title: 'Entä jos olisit avannut oven?',
    text: 'Yksi lapsuuden muisto. Elämän mittainen kaipaus. Astu H. G. Wellsin arvoituksellisen novellin maailmaan.',
  },
  backcover: {
    label: 'Takakansi', title: 'Yksi ovi. Kaksi maailmaa.',
    text: 'Lionel Wallace on menestynyt mies, jota lapsuudessa nähty puutarha ei jätä rauhaan. Valkoinen muuri ja vihreä ovi palaavat hänen elämäänsä, mutta aina jokin velvollisuus vie toisaalle. H. G. Wellsin novelli kysyy, mitä jätämme taaksemme, kun valitsemme tutun tien.',
  },
  newsletter: {
    label: 'Uutiskirje', title: 'Tällä viikolla: oven toisella puolella.',
    text: 'Mikä muisto kutsuu sinua takaisin? Ovi muurissa johdattaa harmaasta Lontoosta paikkaan, jossa kaikki tuntuu olevan niin kuin pitää. Tutustu H. G. Wellsin novelliin ja sen suomennokseen.',
  },
};

export const hotspots = {
  path: {
    label: 'Käytävä', title: 'Marmorireunainen käytävä',
    description: 'Lähteen pitkä, leveä käytävä ja marmorireunaiset kukkapenkit antavat tilalle muodon. Pelimaailmassa ne voisivat ohjata liikkumista.',
  },
  panthers: {
    label: 'Pantterit', title: 'Kaksi täplikästä pantteria',
    description: 'Tekstissä eläimet leikkivät pallolla ja ottavat lapsen lempeästi vastaan. Vuorovaikutuksen lähtökohta olisi luottamus, ei uhka.',
  },
  light: {
    label: 'Valo', title: 'Puutarhan valo',
    description: 'Lämpimämpi, lempeämpi valo ja puhtaat värit ovat tekstin havaintoja. Tilassa ne voisivat välittää keveyttä ja kotiintulon tunnetta.',
  },
};

export const outputs = {
  translation: { label: 'Kielet', title: 'Merkitys kulkee mukana.', contexts: ['door', 'memory'] },
  audio: { label: 'Ääni', title: 'Kertojan ääni herää.', contexts: ['redmond', 'wallace', 'memory'] },
  illustration: { label: 'Kuvitus', title: 'Maailma saa kasvot.', contexts: ['door', 'garden'] },
  book: { label: 'Kirja', title: 'Tarina löytää muotonsa.', contexts: ['redmond', 'door'] },
  video: { label: 'Video', title: 'Yksi hetki liikkeessä.', contexts: ['door', 'garden'] },
  campaign: { label: 'Kampanja', title: 'Sama tarina. Uusi yleisö.', contexts: ['wallace', 'longing'] },
  world: { label: '3D-maailma', title: 'Entä jos astuisit sisään?', contexts: ['garden', 'memory'] },
};

export function contextFooter(ids) {
  return `<div class="context-links" aria-label="Tämän version taustalla oleva konteksti"><span>Perustuu kontekstiin</span>${ids.filter((id) => Object.hasOwn(contexts, id)).map((id) => `<button type="button" data-context="${escapeHTML(id)}">${escapeHTML(contexts[id].name)} <span aria-hidden="true">↗</span></button>`).join('')}</div>`;
}

function heading(caption, title) {
  return `<p class="output-caption">${escapeHTML(caption)}</p><h3 class="output-title">${escapeHTML(title)}</h3>`;
}

function choices(data, selected, attribute, label) {
  return `<div class="language-tabs" role="group" aria-label="${escapeHTML(label)}">${Object.entries(data).map(([id, item]) => `<button type="button" class="output-control${id === selected ? ' is-active' : ''}" data-${attribute}="${escapeHTML(id)}" aria-pressed="${id === selected}">${escapeHTML(item.name || item.label)}</button>`).join('')}</div>`;
}

export function renderOutput(id, { language = 'fi', audioLanguage = 'fi', campaign = 'social', hotspot = 'path' } = {}) {
  if (!Object.hasOwn(outputs, id)) return '';
  const meta = outputs[id];
  const footer = contextFooter(meta.contexts);

  if (id === 'translation') {
    const lang = Object.hasOwn(translations, language) ? language : 'fi';
    const item = translations[lang];
    return `${heading('KIELET / VALMISTELTU ESIMERKKI', meta.title)}
      ${choices(translations, lang, 'language', 'Käännöksen kieli')}
      <p class="output-caption translation-status">${escapeHTML(item.label)}</p>
      <p class="translation-text" lang="${lang}">${escapeHTML(item.text)}</p>
      <p class="output-note">Sama paikka. Samat värit. Sama merkitys. ${escapeHTML(item.note)}</p>${footer}`;
  }

  if (id === 'audio') {
    const lang = Object.hasOwn(voices, audioLanguage) ? audioLanguage : 'fi';
    const voice = voices[lang];
    return `${heading('ÄÄNI / VALMISTELTU KONEÄÄNINÄYTE', meta.title)}
      ${choices(voices, lang, 'audio-language', 'Ääninäytteen kieli')}
      <p class="output-body">Redmond kertoo Wallacen muistosta. Ääni säilyttää kertojan harkinnan ja tarinan epävarmuuden.</p>
      <audio class="output-audio" controls preload="none" src="${escapeHTML(voice.src)}" aria-label="${escapeHTML(voice.label)}">Selaimesi ei tue äänisoitinta. <a href="${escapeHTML(voice.src)}">Avaa ääninäyte</a>.</audio>
      <details class="output-details"><summary>Ääninäytteen teksti</summary><p class="output-body audio-transcript" lang="${voice.lang}">${escapeHTML(voice.transcript)}</p></details>${footer}`;
  }

  if (id === 'illustration') {
    return `${heading('KUVITUS / VALMISTELTU ESIMERKKI', meta.title)}
      <img class="output-media illustration-preview" src="/demo/assets/door-landscape.webp" alt="Valmisteltu kuvitustulkinta vihreästä ovesta valkoisessa muurissa" width="1672" height="941" loading="lazy">
      <details class="output-details"><summary>Mikä kontekstissa ohjaa kuvaa?</summary><p class="output-body">Valkoinen muuri ja vihreä ovi tulevat tekstistä. Taiteellinen suunta: lempeä valo ja kutsuva puutarha välittävät kotiintuloa. Pantterien tulee tuntua turvallisilta. Nämä ovat kuvituksen ohjeita, eivät väite kuvan jokaisesta yksityiskohdasta.</p></details>${footer}`;
  }

  if (id === 'book') {
    return `${heading('KIRJA / TAITTOKONSEPTI', meta.title)}
      <div class="book-preview"><div class="book-cover"><span>H. G. WELLS</span><strong>Ovi<br>muurissa</strong><span>NOVELLI</span></div><div class="book-page"><span class="output-caption">I</span><p>Eräänä luottamuksellisena iltana, vajaat kolme kuukautta sitten, Lionel Wallace kertoi minulle tämän tarinan muurissa olevasta ovesta.</p></div></div>
      <a class="output-control output-download" href="/demo/assets/ovi-muurissa-katkelma.txt" download="ovi-muurissa-katkelma.txt">Lataa tekstikatkelma <span aria-hidden="true">↓</span></a>${footer}`;
  }

  if (id === 'video') {
    return `${heading('VIDEO / KOKEELLINEN ESIMERKKI', meta.title)}
      <video class="output-media output-video" controls playsinline preload="metadata" poster="/demo/assets/door-landscape.webp" aria-label="Vihreä ovi, kahdeksan sekunnin äänetön kuva-animaatio"><source src="/demo/assets/door-scene.mp4" type="video/mp4"><track kind="captions" src="/demo/assets/door-scene.vtt" srclang="fi" label="Suomi" default>Selaimesi ei tue videosoitinta. <a href="/demo/assets/door-scene.mp4">Avaa video</a>.</video>
      <p class="output-note">8 sekunnin äänetön kuva-animaatio. Valmisteltu kokeilu: kuvan liike rakentuu oven ja puutarhan motiiville.</p>${footer}`;
  }

  if (id === 'campaign') {
    const key = Object.hasOwn(campaigns, campaign) ? campaign : 'social';
    const item = campaigns[key];
    return `${heading('KAMPANJA / VALMISTELLUT LUONNOKSET', meta.title)}
      ${choices(campaigns, key, 'campaign', 'Kampanjatekstin muoto')}
      <div class="campaign-copy" aria-live="polite"><h4>${escapeHTML(item.title)}</h4><p class="output-body">${escapeHTML(item.text)}</p></div>${footer}`;
  }

  const key = Object.hasOwn(hotspots, hotspot) ? hotspot : 'path';
  const point = hotspots[key];
  return `${heading('3D-MAAILMA / TULEVAISUUDEN KONSEPTI', meta.title)}
    <div class="world-preview"><img class="output-media" src="/demo/assets/garden.webp" alt="Valmisteltu kuvitustulkinta lumotusta puutarhasta" width="1536" height="1024" loading="lazy"></div>
    ${choices(hotspots, key, 'world', 'Tutki puutarhan kontekstia')}
    <p class="output-body world-description" aria-live="polite"><strong>${escapeHTML(point.title)}.</strong> ${escapeHTML(point.description)}</p>
    <p class="output-note">Visio: sama konteksti voisi ohjata kokonaisen tutkittavan maailman generointia.</p>${footer}`;
}
