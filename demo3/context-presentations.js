/* Dedicated presentations for the six story contexts.
   Story observations follow content.js. Images and creative directions are
   explicitly presented as interpretations, not additional source facts. */

export const contextPresentations = {
  wallace: {
    image: '/demo3/assets/context-wallace.webp',
    alt: 'Kuvitustulkinta aikuisesta Lionel Wallacesta mietteliäänä lontoolaisen työhuoneen ikkunan äärellä.',
    caption: 'Kuvallinen tulkinta. Wallacen kasvot, vaatetus ja työhuone on kuviteltu tätä esittelyä varten.',
    lead: 'Julkinen menestys ja yksityinen kaipaus elävät samassa ihmisessä.',
    sections: [
      {
        title: 'Aikuinen, joka muistaa lapsuutensa',
        text: 'Tarinassa 39-vuotias poliitikko Lionel Wallace kertoo ystävälleen lapsena löytämästään puutarhasta. Hänen uransa on menestynyt, mutta muisto paikasta, jossa kaikki tuntui oikealta, seuraa häntä edelleen.',
      },
      {
        title: 'Tunne kulkee puheen alla',
        text: 'Esityksen tulkinta: Wallacen harkittu aikuisen ääni voi välillä hidastua tai katketa taukoon. Lapsuusmuisto saa kuulostaa läheiseltä ja kipeältä. Tämä antaa lukijalle ja näyttelijälle yhteisen suunnan ilman, että henkilölle keksitään uusia tapahtumia.',
      },
    ],
    applications: [
      { id: 'audio', label: 'Äänen sävy', reason: 'Aikuisen puhe, harkitut tauot ja muistoon palaava lämpö.' },
      { id: 'campaign', label: 'Kampanjan ydin', reason: 'Menestyksen rinnalla kulkeva kaipaus herättää uteliaisuuden.' },
      { id: 'video', label: 'Näyttelijän suunta', reason: 'Pieni ele voi näyttää ristiriidan ilman selittävää repliikkiä.' },
    ],
  },
  redmond: {
    image: '/demo3/assets/context-redmond.webp',
    alt: 'Kuvitustulkinta Redmondista kirjoituspöydän äärellä, lämpimän lampun valossa ja yöllinen Lontoo ikkunan takana.',
    caption: 'Kuvallinen tulkinta. Redmondin ulkomuoto ja kirjoitushetken lavastus ovat kuviteltuja.',
    lead: 'Wallace kokee. Redmond kuuntelee, muistaa ja kertoo meille.',
    sections: [
      {
        title: 'Kuka puhuu kenelle?',
        text: 'Redmond on Wallacen ystävä ja entinen koulutoveri. Hän välittää kuulemansa kertomuksen lukijalle ja pohtii samalla omaa suhtautumistaan siihen. Siksi Redmondin arvio ja Wallacen kokemus ovat eri asioita.',
      },
      {
        title: 'Varaus kuuluu merkitykseen',
        text: 'Kun Redmond pitää kertomusta Wallacelle totena, hän ei vahvista puutarhan olemassaoloa. Tulkinnallinen esitysohje: ääneen sopii rauhallinen, myötäelävä harkinta. Käännöksen ja taiton tulee auttaa erottamaan puhujat ja säilyttää kertojan varaus.',
      },
    ],
    applications: [
      { id: 'audio', label: 'Kertojan ääni', reason: 'Kuulija tunnistaa, milloin Redmond kertoo ja milloin Wallace muistelee.' },
      { id: 'translation', label: 'Näkökulma kielissä', reason: 'Kertojan epäily ja Wallacen varmuus säilyvät erillisinä.' },
      { id: 'book', label: 'Lukemisen rytmi', reason: 'Kappalejako ja puheen merkit tukevat kertomuksen tasoja.' },
    ],
  },
  door: {
    image: '/demo3/assets/context-door.webp',
    alt: 'Suorakulmainen vihreä puuovi valkoisessa kivimuurissa, punaisia köynnöksiä ja raosta näkyvä lämmin puutarha.',
    caption: 'Kuvallinen tulkinta tarinan vihreästä ovesta. Sommittelu, pintojen yksityiskohdat ja raollaan oleva ovi ovat kuvitusvalintoja.',
    lead: 'Pieni, tunnistettava näky kantaa koko kertomuksen kysymystä.',
    sections: [
      {
        title: 'Sama ovi palaa',
        text: 'Vihreä ovi ja valkoinen muuri ovat tekstin konkreettisia tuntomerkkejä. Näky palaa Wallacen elämän eri vaiheissa, jolloin mahdollisuus pysähtyä kohtaa koulun, uran tai muun velvollisuuden.',
      },
      {
        title: 'Tunnistettava kaikissa muodoissa',
        text: 'Tulkinta: ovi voi kuvata mahdollisuutta, jonka ohi kuljemme. Kuvassa vihreän ja valkoisen suhde tekee motiivista tunnistettavan. Videossa oven eteen pysähtyvä hetki voi kantaa jännitteen, vaikka tarinan arvoitusta ei ratkaista.',
      },
    ],
    applications: [
      { id: 'illustration', label: 'Kuvituksen tunnus', reason: 'Vihreä ovi ja valkoinen muuri säilyvät kuvasta toiseen.' },
      { id: 'video', label: 'Kohtauksen jännite', reason: 'Lähestyminen, pysähtyminen ja raosta tuleva valo rakentavat hetken.' },
      { id: 'translation', label: 'Tarkat sanat', reason: 'Toistuvan motiivin värit ja nimitykset pysyvät johdonmukaisina.' },
    ],
  },
  garden: {
    image: '/demo3/assets/context-garden.webp',
    alt: 'Valoisa puutarha, pitkä marmorireunainen käytävä ja kaksi rauhallisesti lepäävää täplikästä pantteria.',
    caption: 'Kuvallinen tulkinta. Käytävä, marmorireunukset ja ystävälliset pantterit pohjautuvat tekstiin; tarkka sommittelu on kuviteltu.',
    lead: 'Tämän paikan tärkein ominaisuus on tunne: olen tullut kotiin.',
    sections: [
      {
        title: 'Maailma tuntuu turvalliselta',
        text: 'Tekstin puutarhassa on pitkä käytävä, marmorireunaisia kukkapenkkejä, lempeää valoa ja kaksi täplikästä pantteria. Eläimet ottavat lapsen ystävällisesti vastaan. Kauneus ja turvallisuus erottavat paikan arkisesta Lontoosta.',
      },
      {
        title: 'Tunnelmasta yhteinen ohje',
        text: 'Taiteellinen tulkinta: valo, värit, liike ja äänet voivat kaikki tukea kotiintulon tunnetta. Pantterit liikkuisivat rauhallisesti ja tilaan olisi helppo astua. Näin kuvitus, video ja tutkittava maailma säilyttävät saman emotionaalisen merkityksen.',
      },
    ],
    applications: [
      { id: 'illustration', label: 'Valo ja värit', reason: 'Lempeä valo ja levolliset eläimet tekevät tunnelman näkyväksi.' },
      { id: 'world', label: 'Tutkittava tila', reason: 'Käytävä ohjaa kulkua; kohtaamisten lähtökohta on luottamus.' },
      { id: 'video', label: 'Liikkeen rytmi', reason: 'Hidas liike ja rauhallinen kuvakerronta antavat puutarhan hengittää.' },
    ],
  },
  longing: {
    image: '/demo3/assets/context-longing.webp',
    alt: 'Yksinäinen aikuinen hahmo Lontoon katujen haarautumiskohdassa ja kultainen puutarhan häivähdys harmaan kaupungin laidalla.',
    caption: 'Kuvallinen tulkinta kaipauksen teemasta. Kadun risteys ja puutarhan häivähdys ovat vertauskuvallinen sommitelma.',
    lead: 'Mitä jää kaipaamaan, kun valitsee aina seuraavan velvollisuuden?',
    sections: [
      {
        title: 'Paluun toive yhdistää elämänvaiheet',
        text: 'Wallacen toistuva halu palata puutarhaan on tarinassa lausuttu tunne. Lapsuuden onni asettuu koulun, uran ja velvollisuuksien rinnalle. Kaipaus tekee eri aikoina nähdyistä ovista osan samaa henkilökohtaista kertomusta.',
      },
      {
        title: 'Teema antaa suunnan',
        text: 'Tulkinta: tarinaa voi lähestyä menetetyn mahdollisuuden ja valintojen kautta. Kampanjassa tämä kutsuu lukijan omaan pohdintaan; musiikissa ja kuvassa se voi näkyä hillittynä surumielisyytenä. Lopputuloksen ei tarvitse paljastaa loppua tai kertoa, mitä lukijan pitäisi tuntea.',
      },
    ],
    applications: [
      { id: 'campaign', label: 'Kutsu lukijalle', reason: 'Valintoihin liittyvä kysymys herättää kiinnostuksen ilman juonipaljastuksia.' },
      { id: 'audio', label: 'Tunteen kaari', reason: 'Paluun toive saa tunnistettavan rytmin ja tilaa hiljaisuudelle.' },
      { id: 'video', label: 'Visuaalinen vastakohta', reason: 'Kaupungin etäisyys ja puutarhan lämpö kertovat samasta kaipauksesta.' },
    ],
  },
  memory: {
    image: '/demo3/assets/context-memory.webp',
    alt: 'Läpikuultavien paperikerrosten päälle limittyviä Lontoon, puutarhan ja vihreän oven kuvafragmentteja.',
    caption: 'Kuvallinen tulkinta muistin kerroksista. Paperit ja päällekkäiset näkymät ovat visuaalinen vertauskuva.',
    lead: 'Lapsen kokemus, aikuisen muisto ja ystävän kertomus muodostavat kolme tasoa.',
    sections: [
      {
        title: 'Muisto kulkee kertojalta toiselle',
        text: 'Wallace tunnustaa voineensa muuttaa tai täydentää muistoaan. Redmond puolestaan kertoo sen, mitä kuuli Wallacelta. Näiden tasojen erottaminen auttaa näkemään, kuka tietää mitä ja mihin kertomuksen epävarmuus liittyy.',
      },
      {
        title: 'Arvoitukselle jää tilaa',
        text: 'Jalostuksen tulkintasääntö: puutarhaa ei lukita varmasti uneksi, kuolemaksi tai toiseksi todellisuudeksi. Käännös säilyttää epäröivät ilmaukset, ääni niiden sävyn ja kuvallinen maailma avoimuuden. Myös epävarmuus on merkitystä, joka kulkee mukana.',
      },
    ],
    applications: [
      { id: 'translation', label: 'Epävarmuuden sanat', reason: 'Saattaa, muistaa ja uskoa eivät vaihdu vahingossa varmoiksi väitteiksi.' },
      { id: 'audio', label: 'Kerronnan tasot', reason: 'Ääni ja tauot auttavat kuulemaan kokemuksen ja sen arvioinnin eron.' },
      { id: 'world', label: 'Avoin maailma', reason: 'Tila kutsuu tutkimaan antamatta arvoitukselle yhtä lopullista selitystä.' },
    ],
  },
};
