# SkriptLab website

Staattinen markkinointisivu osoitteelle `skriptlab.com`.

## Rakenne

- `index.html` - etusivun tuote/hero-näkymä
- `kenelle.html`, `ominaisuudet.html`, `prosessi.html`, `luottamus.html`, `hinnat.html`, `yhteys.html` - erilliset sisältöosiot
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
