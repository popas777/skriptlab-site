/* Curated demo evidence from Ovi muurissa, translated_manuscript.md, parts I–IV.
   Quotes are verbatim; descriptions and carry-forward notes are editorial examples.
   No live model calls or manuscript uploads are made by this public page. */
window.SkriptLabDemo = Object.freeze({
  contexts: {
    door: {
      name: 'Vihreä ovi', kind: 'PAIKKA & MOTIIVI', part: 'I',
      quote: 'Mutta valkoinen muuri ja vihreä ovi erottuivat aivan selvinä.',
      highlights: ['valkoinen muuri', 'vihreä ovi'],
      description: 'Valkoisessa muurissa oleva ovi yhdistää arjen ja lumotun puutarhan. Sama näky palaa Wallacen elämän eri vaiheissa.',
      carry: 'Vihreä väri. Valkoinen muuri. Oven toistuminen valintojen hetkillä.',
      nuance: 'Tulkinta: ovi toimii myös mahdollisuuden ja kaipauksen kuvana.'
    },
    wallace: {
      name: 'Lionel Wallace', kind: 'HENKILÖ & ÄÄNI', part: 'I',
      quote: 'Jokin, mikä vie elämästä valon, täyttää minut kaipauksella …',
      highlights: ['kaipauksella'],
      description: 'Menestynyt, 39-vuotias poliitikko kertoo lapsuuden kokemuksesta. Julkisen menestyksen rinnalla kulkee muisto onnen paikasta, johon hän haluaisi palata.',
      carry: 'Aikuisen muisteleva ääni. Lapsuuden kokemus. Ura ja kaipaus rinnakkain.',
      nuance: 'Ääniohjeen tulkinta: harkittu puhe saa murtua taukoihin. Lapsuusmuisto ei muuta kertojaa lapseksi.'
    },
    redmond: {
      name: 'Redmond', kind: 'KERTOJA & NÄKÖKULMA', part: 'I',
      quote: 'Ja silloin ajattelin, että ainakin hänelle itselleen se oli tosi.',
      highlights: ['ainakin hänelle itselleen'],
      description: 'Wallacen ystävä ja entinen koulutoveri välittää kertomuksen lukijalle. Hän pohtii omaa uskoaan siihen, mitä Wallace koki.',
      carry: 'Kehyskertoja erillään Wallacesta. Harkittu sävy. Tiedon ja uskomuksen ero.',
      nuance: 'Käännöksessä ja äänessä on säilytettävä varaus: kertoja ei vahvista puutarhan todellisuutta.'
    },
    garden: {
      name: 'Lumottu puutarha', kind: 'PAIKKA & TUNNELMA', part: 'I',
      quote: 'Tunsin vahvasti tulleeni kotiin',
      highlights: ['tulleeni kotiin'],
      description: 'Puutarhan pitkä käytävä, marmorireunaiset kukkapenkit, lempeä valo ja kaksi täplikästä pantteria muodostavat oman maailmansa.',
      carry: 'Kotiintulon tunne. Kesyt, ystävälliset eläimet. Valoisa vastakohta harmaalle arjelle.',
      nuance: 'Kuvassa ja tilassa pantterien tehtävä on viestiä turvallisuutta. Uhkaava petokohtaus muuttaisi tekstin merkitystä.'
    },
    longing: {
      name: 'Kaipaus', kind: 'TEEMA · TULKINTA', part: 'I',
      quote: 'Oi, vie minut takaisin puutarhaani! Vie minut takaisin puutarhaani!',
      highlights: ['takaisin puutarhaani'],
      description: 'Lapsuuden onni asettuu vastakkain koulun, uran ja velvollisuuksien kanssa. Toistuva halu palata puutarhaan sitoo elämänvaiheita yhteen.',
      carry: 'Menetetyn mahdollisuuden tuntu. Toistuva paluun toive. Hillitty surumielisyys.',
      nuance: 'Tämä on teemallinen tulkinta. Se voi ohjata kampanjan ydinviestiä ilman, että tarinan loppua paljastetaan.'
    },
    memory: {
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
    fi: { src: '/demo/assets/narrator-fi.m4a', lang: 'fi', label: 'Ovi muurissa, suomenkielinen koneääninäyte', transcript: 'Eräänä luottamuksellisena iltana, vajaat kolme kuukautta sitten, Lionel Wallace kertoi minulle tämän tarinan muurissa olevasta ovesta. Ja silloin ajattelin, että ainakin hänelle itselleen se oli tosi.' },
    en: { src: '/demo/assets/narrator-en.m4a', lang: 'en', label: 'The Door in the Wall, englanninkielinen koneääninäyte', transcript: 'One confidential evening, not three months ago, Lionel Wallace told me this story of the Door in the Wall. And at the time I thought that so far as he was concerned it was a true story.' }
  },
  campaigns: {
    social: { title: 'Entä jos olisit avannut oven?', text: 'Yksi lapsuuden muisto. Elämän mittainen kaipaus. Astu H. G. Wellsin arvoituksellisen novellin maailmaan.' },
    backcover: { title: 'Yksi ovi. Kaksi maailmaa.', text: 'Lionel Wallace on menestynyt mies, jota lapsuudessa nähty puutarha ei jätä rauhaan. Valkoinen muuri ja vihreä ovi palaavat hänen elämäänsä, mutta aina jokin velvollisuus vie toisaalle. H. G. Wellsin novelli kysyy, mitä jätämme taaksemme, kun valitsemme tutun tien.' },
    newsletter: { title: 'Tällä viikolla: oven toisella puolella.', text: 'Mikä muisto kutsuu sinua takaisin? Ovi muurissa johdattaa harmaasta Lontoosta paikkaan, jossa kaikki tuntuu olevan niin kuin pitää. Tutustu H. G. Wellsin novelliin ja sen suomennokseen.' }
  },
  hotspots: {
    path: { title: '1 · Marmorireunainen käytävä', description: 'Lähteen pitkä, leveä käytävä muuttuu tilan kulkureitiksi. Kukkapenkkien reunat ohjaavat katsetta ja liikkumista.' },
    panthers: { title: '2 · Kaksi täplikästä pantteria', description: 'Tekstissä eläimet leikkivät pallolla ja ottavat lapsen lempeästi vastaan. Vuorovaikutuksen lähtökohta olisi luottamus, ei uhka.' },
    light: { title: '3 · Puutarhan valo', description: 'Lämpimämpi, lempeämpi valo ja puhtaat värit ovat tekstin havaintoja. Tilassa ne voisivat välittää samaa keveyttä ja kotiintulon tunnetta.' }
  }
});
