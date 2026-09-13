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
    name: 'Teemat', kind: 'AIKATASOT · TULKINTA', part: 'I',
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
    transcript: 'Eräänä iltana vajaat kolme kuukautta sitten Lionel Wallace uskoutui minulle ja kertoi tämän tarinan muurissa olevasta ovesta. Ja silloin ajattelin, että ainakin hänelle itselleen se oli tosi.',
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
    panthers: {
      title: 'Pantterien luona',
      description: 'Kaksi täplikästä pantteria leikkii pallolla käytävän varrella. Läheltäkin ne ovat lempeitä: tähän maailmaan tulija saa tuntea olevansa tervetullut.',
      image: '/demo/assets/world-panthers.webp',
      imageAlt: 'Kaksi rauhallista täplikästä pantteria lähietäisyydeltä, ruskea pallo tassujen vieressä. Taustalla kukkia, vanhoja puita ja puutarhan vaaleat marmorireunukset.'
    },
    vegetation: {
      title: 'Kasvillisuuden keskellä',
      description: 'Siniset kukkavarret, vaaleat ruusut ja saniaiset ympäröivät kulkijaa. Puiden lomasta siivilöityvä valo johdattaa syvemmälle puutarhaan.',
      image: '/demo/assets/world-vegetation.webp',
      imageAlt: 'Näkymä rehevän puutarhan sisältä: sinisiä kukkavarsia, valkoisia ja vaaleanpunaisia ruusuja, saniaisia ja kapea polku vanhojen puiden katveessa.'
    },
    mountain: {
      title: 'Vuorimetsän näköalapaikalla',
      description: 'Metsäiseltä rinteeltä katse palaa alas puutarhaan. Puiden ja kukkapenkkien lomassa erottuva käytävä johtaa valkoiselle muurille ja vihreälle ovelle. Näkymä laajentaa tarinan maailmaa kuvallisena tulkintana.',
      image: '/demo/assets/world-mountain.webp',
      imageAlt: 'Metsäisen vuoririnteen näköalapaikalta näkyy laakson puutarha, sen puut ja marmorireunainen käytävä sekä kauempana valkoinen muuri ja pieni vihreä ovi.'
    }
  };

export const outputs = {
  translation: { label: 'Kielet', title: 'Merkitys kulkee mukana.', contexts: ['door', 'memory'] },
  audio: { label: 'Äänet', title: 'Kertojan ääni herää.', contexts: ['redmond', 'wallace', 'memory'] },
  illustration: { label: 'Kuvat', title: 'Maailma saa kasvot.', contexts: ['door', 'garden'] },
  book: { label: 'Taitto', title: 'Tarina löytää muotonsa.', contexts: ['redmond', 'door'] },
  video: { label: 'Videot', title: 'Yksi hetki liikkeessä.', contexts: ['door', 'garden'] },
  campaign: { label: 'Kampanjat', title: 'Sama tarina. Uusi yleisö.', contexts: ['wallace', 'longing'] },
  world: { label: 'Virtuaalimaailma', title: 'Entä jos astuisit sisään?', contexts: ['garden', 'memory'] },
};

export function contextFooter(ids) {
  return `<div class="context-links" aria-label="Tämän version taustalla oleva konteksti"><span>Perustuu kontekstiin</span>${ids.filter((id) => Object.hasOwn(contexts, id)).map((id) => `<button type="button" data-context="${escapeHTML(id)}">${escapeHTML(contexts[id].name)} <span aria-hidden="true">↗</span></button>`).join('')}</div>`;
}

function choices(data, selected, attribute, label) {
  return `<div class="language-tabs" role="group" aria-label="${escapeHTML(label)}">${Object.entries(data).map(([id, item]) => `<button type="button" class="output-control${id === selected ? ' is-active' : ''}" data-${attribute}="${escapeHTML(id)}" aria-pressed="${id === selected}">${escapeHTML(item.name || item.label)}</button>`).join('')}</div>`;
}

export function renderOutput(id, { language = 'fi', audioLanguage = 'fi', campaign = 'social' } = {}) {
  if (!Object.hasOwn(outputs, id)) return '';
  const meta = outputs[id];
  const footer = contextFooter(meta.contexts);

  if (id === 'translation') {
    const lang = Object.hasOwn(translations, language) ? language : 'fi';
    const item = translations[lang];
    return `<h3 class="sample-title">Vertaa kieliversioita</h3>
      ${choices(translations, lang, 'language', 'Käännöksen kieli')}
      <p class="output-caption translation-status">${escapeHTML(item.label)}</p>
      <p class="translation-text" lang="${lang}">${escapeHTML(item.text)}</p>
      <p class="output-note">Sama paikka. Samat värit. Sama merkitys. ${escapeHTML(item.note)}</p>${footer}`;
  }

  if (id === 'audio') {
    const lang = Object.hasOwn(voices, audioLanguage) ? audioLanguage : 'fi';
    const voice = voices[lang];
    return `<h3 class="sample-title">Kuuntele esimerkki</h3>
      ${choices(voices, lang, 'audio-language', 'Ääninäytteen kieli')}
      <audio class="output-audio" controls preload="none" src="${escapeHTML(voice.src)}" aria-label="${escapeHTML(voice.label)}">Selaimesi ei tue äänisoitinta. <a href="${escapeHTML(voice.src)}">Avaa ääninäyte</a>.</audio>
      <details class="output-details"><summary>Ääninäytteen teksti</summary><p class="output-body audio-transcript" lang="${voice.lang}">${escapeHTML(voice.transcript)}</p></details>${footer}`;
  }

  if (id === 'illustration') {
    return `<h3 class="sample-title">Katso kuvitusesimerkki</h3>
      <figure class="sample-figure"><img class="output-media illustration-preview" src="/demo/assets/door-landscape.webp" alt="Vihreä ovi valkoisessa muurissa, tarinan maailma visualisoituna" width="1672" height="941" loading="lazy"><figcaption>Tarinan maailma visualisoituna</figcaption></figure>
      <details class="output-details"><summary>Mikä kontekstissa ohjaa kuvaa?</summary><p class="output-body">Valkoinen muuri ja vihreä ovi tulevat tekstistä. Taiteellinen suunta: lempeä valo ja kutsuva puutarha välittävät kotiintuloa. Pantterien tulee tuntua turvallisilta. Nämä ovat kuvituksen ohjeita, eivät väite kuvan jokaisesta yksityiskohdasta.</p></details>${footer}`;
  }

  if (id === 'book') {
    return `<h3 class="sample-title">Tutustu taittoesimerkkiin</h3>
      <div class="book-visual"><article class="book-page" lang="fi" aria-label="Taittoesimerkki, Ovi muurissa, ensimmäinen sivu"><span>H. G. WELLS</span><h4>Ovi muurissa</h4><div class="gold-rule"></div><small>I</small><p>Eräänä iltana vajaat kolme kuu&shy;kautta sitten Lionel Wallace uskou&shy;tui minulle ja kertoi tämän tari&shy;nan muu&shy;rissa ole&shy;vasta ovesta. Ja sil&shy;loin ajat&shy;te&shy;lin, että aina&shy;kin hänelle itsel&shy;leen se oli tosi.</p><p>Hän kertoi sen niin suo&shy;raan ja mut&shy;katto&shy;man vakuut&shy;tuneesti, etten voinut muuta kuin uskoa häntä. Mutta aamulla herä&shy;sin omassa asun&shy;nos&shy;sani toisen&shy;laiseen tun&shy;nel&shy;maan. Kun maka&shy;sin vuo&shy;teessa ja muis&shy;telin hänen ker&shy;to&shy;maansa, kaikki tuntui minusta kerta kaik&shy;kiaan usko&shy;matto&shy;malta. Poissa oli hänen vaka&shy;van, verk&shy;kai&shy;sen äänensä lumo, poissa var&shy;joste&shy;tun pöytä&shy;lampun valo&shy;keila ja hämärä, joka oli ympä&shy;röi&shy;nyt häntä ja illallis&shy;pöytämme kau&shy;nista, valossa hoh&shy;tavaa kat&shy;tausta – jälki&shy;ruokaa, laseja ja lii&shy;noja – ja sul&shy;kenut kaiken het&shy;keksi pie&shy;neen valoi&shy;saan maail&shy;maan, aivan eril&shy;leen arki&shy;todel&shy;lisuu&shy;desta. ”Hän nar&shy;rasi minua!” sanoin ja sitten: ”Ja miten taita&shy;vasti! … Juuri häneltä en olisi odot&shy;tanut sel&shy;laista taitoa.”</p><span class="page-number">1</span></article></div>
      <a class="output-control output-download" href="/demo/assets/ovi-muurissa-katkelma.txt" download="ovi-muurissa-katkelma.txt">Lataa tekstikatkelma <span aria-hidden="true">↓</span></a>${footer}`;
  }

  if (id === 'video') {
    return `<h3 class="sample-title">Katso videonäyte</h3>
      <video class="output-media output-video" controls playsinline preload="metadata" poster="/demo/assets/door-scene-poster.webp" aria-label="Kahdeksan sekunnin videonäyte: vihreä ovi avautuu puutarhaan"><source src="/demo/assets/door-scene.mp4" type="video/mp4"><track kind="captions" src="/demo/assets/door-scene.vtt" srclang="fi" label="Suomi" default>Selaimesi ei tue videosoitinta. <a href="/demo/assets/door-scene.mp4">Avaa video</a>.</video>
      <p class="output-note">Kontekstin ja kuvituksen perusteella tuotettu videonäyte.</p>${footer}`;
  }

  if (id === 'campaign') {
    const key = Object.hasOwn(campaigns, campaign) ? campaign : 'social';
    const item = campaigns[key];
    return `<h3 class="sample-title">Kokeile kampanjatekstejä</h3>
      ${choices(campaigns, key, 'campaign', 'Kampanjatekstin muoto')}
      <div class="campaign-copy" aria-live="polite"><h4>${escapeHTML(item.title)}</h4><p class="output-body">${escapeHTML(item.text)}</p></div>${footer}`;
  }


  return `<h3 class="sample-title">Astu kuvaan.</h3>
    <p class="output-body">Valitse kuvan numero tai avaa näkymä alta: pantterien luo, kasvillisuuden keskelle tai vuorimetsään katsomaan takaisin puutarhaan.</p>
    <div class="world-view-links" role="group" aria-label="Puutarhan näkymät">${Object.entries(hotspots).map(([key, point], index) => `<button type="button" class="output-control" data-hotspot="${key}" aria-haspopup="dialog" aria-controls="world-dialog">${index + 1}. ${escapeHTML(point.title)}</button>`).join('')}</div>
    <p class="output-note">Visio: sama konteksti voisi ohjata kokonaisen tutkittavan maailman generointia.</p>${footer}`;
}

export function renderWorldHotspots() {
  return Object.entries(hotspots).map(([key, point], index) => `<button class="hotspot hotspot-${key}" type="button" data-hotspot="${key}" aria-label="Avaa näkymä ${index + 1}: ${escapeHTML(point.title)}" aria-haspopup="dialog" aria-controls="world-dialog">${index + 1}</button>`).join('');
}
