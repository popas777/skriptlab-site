/* Curated demo evidence from Vihreä ovi, translated_manuscript.md, parts I–IV.
   Quotes are verbatim; descriptions and carry-forward notes are editorial examples.
   No live model calls or manuscript uploads are made by this public page. */
window.SkriptLabDemo = Object.freeze({
  contexts: {
    door: {
      image: "/demo/assets/context-door.webp",
      imageAlt: "Suorakulmainen vihreä puuovi valkoisessa kivimuurissa, punaisia köynnöksiä ja raosta näkyvä lämmin puutarha.",
      name: 'Vihreä ovi', kind: 'PAIKKA & MOTIIVI', part: 'I',
      quote: 'Mutta valkoinen muuri ja vihreä ovi erottuivat aivan selvinä.',
      highlights: ['valkoinen muuri', 'vihreä ovi'],
      description: 'Valkoisessa muurissa oleva ovi yhdistää arjen ja lumotun puutarhan. Sama näky palaa Wallacen elämän eri vaiheissa.',
      carry: 'Vihreä väri. Valkoinen muuri. Oven toistuminen valintojen hetkillä.',
      nuance: 'Tulkinta: ovi toimii myös mahdollisuuden ja kaipauksen kuvana.'
    },
    wallace: {
      image: "/demo/assets/context-wallace.webp",
      imageAlt: "Kuvitustulkinta aikuisesta Lionel Wallacesta mietteliäänä lontoolaisen työhuoneen ikkunan äärellä.",
      name: 'Lionel Wallace', kind: 'HENKILÖ & ÄÄNI', part: 'I',
      quote: 'Jokin, mikä vie elämästä valon, täyttää minut kaipauksella …',
      highlights: ['kaipauksella'],
      description: 'Menestynyt, 39-vuotias poliitikko kertoo lapsuuden kokemuksesta. Julkisen menestyksen rinnalla kulkee muisto onnen paikasta, johon hän haluaisi palata.',
      carry: 'Aikuisen muisteleva ääni. Lapsuuden kokemus. Ura ja kaipaus rinnakkain.',
      nuance: 'Ääniohjeen tulkinta: harkittu puhe saa murtua taukoihin. Lapsuusmuisto ei muuta kertojaa lapseksi.'
    },
    redmond: {
      image: "/demo/assets/context-redmond.webp",
      imageAlt: "Kuvitustulkinta Redmondista kirjoituspöydän äärellä, lämpimän lampun valossa ja yöllinen Lontoo ikkunan takana.",
      name: 'Redmond', kind: 'KERTOJA & NÄKÖKULMA', part: 'I',
      quote: 'Ja silloin ajattelin, että ainakin hänelle itselleen se oli tosi.',
      highlights: ['ainakin hänelle itselleen'],
      description: 'Wallacen ystävä ja entinen koulutoveri välittää kertomuksen lukijalle. Hän pohtii omaa uskoaan siihen, mitä Wallace koki.',
      carry: 'Kehyskertoja erillään Wallacesta. Harkittu sävy. Tiedon ja uskomuksen ero.',
      nuance: 'Käännöksessä ja äänessä on säilytettävä varaus: kertoja ei vahvista puutarhan todellisuutta.'
    },
    garden: {
      image: "/demo/assets/context-garden.webp",
      imageAlt: "Valoisa puutarha, pitkä marmorireunainen käytävä ja kaksi rauhallisesti lepäävää täplikästä pantteria.",
      name: 'Lumottu puutarha', kind: 'PAIKKA & TUNNELMA', part: 'I',
      quote: 'Tunsin vahvasti tulleeni kotiin',
      highlights: ['tulleeni kotiin'],
      description: 'Puutarhan pitkä käytävä, marmorireunaiset kukkapenkit, lempeä valo ja kaksi täplikästä pantteria muodostavat oman maailmansa.',
      carry: 'Kotiintulon tunne. Kesyt, ystävälliset eläimet. Valoisa vastakohta harmaalle arjelle.',
      nuance: 'Kuvassa ja tilassa pantterien tehtävä on viestiä turvallisuutta. Uhkaava petokohtaus muuttaisi tekstin merkitystä.'
    },
    longing: {
      image: "/demo/assets/context-longing.webp",
      imageAlt: "Yksinäinen aikuinen hahmo Lontoon katujen haarautumiskohdassa ja kultainen puutarhan häivähdys harmaan kaupungin laidalla.",
      name: 'Kaipaus', kind: 'TEEMA · TULKINTA', part: 'I',
      quote: 'Oi, vie minut takaisin puutarhaani! Vie minut takaisin puutarhaani!',
      highlights: ['takaisin puutarhaani'],
      description: 'Lapsuuden onni asettuu vastakkain koulun, uran ja velvollisuuksien kanssa. Toistuva halu palata puutarhaan sitoo elämänvaiheita yhteen.',
      carry: 'Menetetyn mahdollisuuden tuntu. Toistuva paluun toive. Hillitty surumielisyys.',
      nuance: 'Tämä on teemallinen tulkinta. Se voi ohjata kampanjan ydinviestiä ilman, että tarinan loppua paljastetaan.'
    },
    memory: {
      image: "/demo/assets/context-memory.webp",
      imageAlt: "Läpikuultavien paperikerrosten päälle limittyviä Lontoon, puutarhan ja vihreän oven kuvafragmentteja.",
      name: 'Muisti & epävarmuus', kind: 'AIKATASOT · TULKINTA', part: 'I',
      quote: 'Olen saattanut lisätä siihen jotakin, olen saattanut muuttaa sitä; en tiedä …',
      highlights: ['en tiedä'],
      description: 'Redmond kertoo Wallacen kertomaa muistoa. Lapsen kokemus, aikuisen muisti ja kehyskertojan arvio ovat eri tasoja.',
      carry: 'Muiston kerroksellisuus. Epävarmat yksityiskohdat. Avoin suhde todellisuuteen.',
      nuance: 'Yhteinen tulkintasääntö kaikille muodoille: puutarhaa ei selitetä varmasti uneksi, kuolemaksi tai toiseksi todellisuudeksi.'
    }
  },
  translations: {
    fi: { label: 'SUOMENNOS · PROJEKTIN TEKSTI', text: 'Mutta valkoinen muuri ja vihreä ovi erottuivat aivan selvinä.', note: 'Katkelma paikallisen käännösprojektin tarkistetusta suomennoksesta.' },
    sv: { label: 'RUOTSI · DEMON KÄÄNNÖSLUONNOS', text: 'Men den vita muren och den gröna dörren framträdde alldeles tydligt.', note: 'Tätä demoa varten laadittu ruotsinnos. Havainnollistaa kontekstin säilymistä, ei tarkistettua kokonaiskäännöstä.' },
    de: { label: 'SAKSA · DEMON KÄÄNNÖSLUONNOS', text: 'Doch die weiße Mauer und die grüne Tür hoben sich ganz deutlich ab.', note: 'Tätä demoa varten laadittu saksannos. Havainnollistaa kontekstin säilymistä, ei tarkistettua kokonaiskäännöstä.' }
  },
  voices: {
    fi: { src: '/demo/assets/narrator-fi.m4a', lang: 'fi', label: 'Vihreä ovi, suomenkielinen koneääninäyte', transcript: 'Eräänä iltana vajaat kolme kuukautta sitten Lionel Wallace uskoutui minulle ja kertoi tämän tarinan muurissa olevasta ovesta. Ja silloin ajattelin, että ainakin hänelle itselleen se oli tosi.' },
    en: { src: '/demo/assets/narrator-en.m4a', lang: 'en', label: 'The Door In The Wall, englanninkielinen koneääninäyte', transcript: 'One confidential evening, not three months ago, Lionel Wallace told me this story of the Door in the Wall. And at the time I thought that so far as he was concerned it was a true story.' }
  },
  campaigns: {
    social: { title: 'Entä jos olisit avannut oven?', text: 'Yksi lapsuuden muisto. Elämän mittainen kaipaus. Astu H. G. Wellsin arvoituksellisen novellin maailmaan.' },
    backcover: { title: 'Yksi ovi. Kaksi maailmaa.', text: 'Lionel Wallace on menestynyt mies, jota lapsuudessa nähty puutarha ei jätä rauhaan. Valkoinen muuri ja vihreä ovi palaavat hänen elämäänsä, mutta aina jokin velvollisuus vie toisaalle. H. G. Wellsin novelli kysyy, mitä jätämme taaksemme, kun valitsemme tutun tien.' },
    newsletter: { title: 'Tällä viikolla: oven toisella puolella.', text: 'Mikä muisto kutsuu sinua takaisin? The Door In The Wall johdattaa harmaasta Lontoosta paikkaan, jossa kaikki tuntuu olevan niin kuin pitää. Tutustu H. G. Wellsin novelliin ja sen suomennokseen Vihreä ovi.' }
  },
  hotspots: {
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
  }
});
