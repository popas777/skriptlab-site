# SkriptLab website

Staattinen markkinointisivu osoitteelle `skriptlab.com`.

## Rakenne

- `index.html` - etusivun tuote/hero-näkymä
- `kenelle.html`, `ominaisuudet.html`, `prosessi.html`, `luottamus.html`, `hinnat.html`, `yhteys.html` - erilliset sisältöosiot
- `assets/styles.css` - visuaalinen tyyli ja responsiivisuus
- `assets/main.js` - mobiilivalikko
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
- `app` CNAME -> sovelluksen julkaisualustan osoite, kun sovellus julkaistaan

Varmista lopulliset arvot aina Netlifyn Domain management -näkymästä ennen tallennusta.

## Sovelluksen linkki

Yläpalkin `Kirjaudu`-painike osoittaa nyt osoitteeseen:

```txt
https://app.skriptlab.com
```

Kun lokaalilla palvelimella oleva sovellus julkaistaan, sille kannattaa tehdä oma subdomain `app.skriptlab.com`.
