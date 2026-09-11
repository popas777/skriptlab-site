# SkriptLab website

Staattinen markkinointisivu osoitteelle `skriptlab.com`.

## Rakenne

- `index.html` - etusivun tuote/hero-näkymä
- `kenelle.html`, `ominaisuudet.html`, `prosessi.html`, `luottamus.html`, `hinnat.html`, `yhteys.html` - erilliset sisältöosiot
- `ominaisuudet/*/index.html` - ominaisuuksien kaksikieliset alasivut; sivukohtainen copy on `data-fi`- ja `data-en`-attribuuteissa
  - Jokaisella alasivulla on piilotettu `feature-media-slot`. Poista `hidden` ja lisää siihen kuva tai video, kun esimerkkimedia on valmis.
- `assets/styles.css` - visuaalinen tyyli ja responsiivisuus
- `assets/main.js` - mobiilivalikko
- `app/` - SkriptLab-sovellus osoitteessa `https://skriptlab.com/app/`
- `netlify.toml` - Netlify-julkaisun perusasetukset ja tietoturvaheaderit

## Paikallinen tarkistus

Avaa `index.html` selaimessa tai aja kevyt palvelin:

```sh
python3 -m http.server 8080
```

Sen jälkeen sivu löytyy osoitteesta `http://localhost:8080`.

## Julkaisu Netlifyyn

1. Luo GitHubiin uusi repo, esimerkiksi `skriptlab-site`.
2. Lisää tämän kansion sisältö repoon.
3. Netlifyssä: Add new site -> Import an existing project -> valitse repo.
4. Build command jätetään tyhjäksi.
5. Publish directory on `.`.
6. Lisää domainiksi `skriptlab.com`.
7. Lisää DNS-tietueet Spaceshipissä Netlifyn antamien ohjeiden mukaan.

## DNS-suositus Spaceshipissä

Pidä sähköpostin MX/TXT-tietueet ennallaan, jotta SpaceMail ei katkea.

Netlify external DNS -asetuksella tyypillinen perusmalli on:

- `@` A -> `75.2.60.5`
- `www` CNAME -> oma Netlify-osoite, esimerkiksi `skriptlab-site.netlify.app`
- `api` CNAME tai A-tietue -> backend-palvelun julkaisualustan osoite, esimerkiksi Renderin antama kohde

Varmista lopulliset arvot aina Netlifyn Domain management -näkymästä ennen tallennusta.

## Sovelluspolku

Sovellus julkaistaan saman domainin alla osoitteessa `https://skriptlab.com/app/`.

Yläpalkin `Kirjaudu`-painikkeet ohjaavat osoitteeseen `/app/login.html`. Backendin julkinen osoite on `https://api.skriptlab.com`.


## Yritysten BYOK-hinnoittelu (valmis, piilossa)

`hinnat.html` sisältää kaksikielisen yritysosion inertissä `#enterprise-byok-pricing-template`-elementissä. Sitä ei lisätä sivun näkyvään sisältöön, navigaatioon tai metatietoihin oletuksena. Template ja sen tekstit ovat kuitenkin luettavissa julkisesta lähdekoodista; tämä ei ole salaus tai pääsynhallinta.

Ota osio näkyviin muuttamalla `assets/main.js`-tiedoston `SITE_FEATURES.enterpriseByokPricing` arvoksi `true` ja julkaisemalla sivusto normaalisti. URL-parametri tai selaimen tallennettu asetus ei ohita tätä kytkintä. Tarkista ennen julkaisua hinnat, sopimusehdot sekä suomen- ja englanninkielinen mobiilinäkymä (`hinnat.html?lang=en`).

Valmisteltu sopimushinnoittelu on alkaen 149 €/kk viidelle käyttäjälle ja 19 €/lisäkäyttäjä/kk. Tekoälypalvelun kulutus maksetaan suoraan palveluntarjoajalle, ja soveltuva arvonlisävero lisätään hintoihin. Tämä sivun osio ei käynnistä laskutusta eikä ota sovelluksen BYOK-toimintoa käyttöön. Asiakaskohtainen käyttöönotto ja mallien rajaus tehdään sovelluksen ylläpidossa erikseen.
