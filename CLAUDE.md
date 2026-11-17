# Clocklings-verkkosivu

Monikielinen laskeutumissivu Clocklings-sovellukselle (Android, Google Play). Julkaistaan Cloudflare Pagesiin staattisena sivuna. Sovelluksen koodi on kansiossa `C:\Dev\Clocklings-Blender-version`.

## Kieliversiot

- Sivut koostetaan komennolla `npm run build` (`tools/build.py`). Mallit: `src/page.html` (etusivu), `src/guide.html` (opas "How to teach a child to tell time" ja tulostettavat arkit) ja `src/404.html`. Yhteiset osat ovat kansiossa `src/partials/` (head, header, footer ja stage), ja niihin viitataan merkinnällä `{{> nimi}}`. Sivut on lueteltu `build.py`:n `PAGES`-listassa, ja otsikon lähde on `DOC_SOURCE`-sanakirjassa.
- **404-sivut:** `404.html` sekä `fi/404.html`, `sv/404.html` jne. (tekstit `notFound.*` ja `js.lostGreeting`). Cloudflare Pages näyttää lähimmän 404-sivun hakemistopuussa ylöspäin, ja juuren `404.html` estää samalla SPA-tilan, jossa tuntemattomat osoitteet palauttaisivat etusivun. Sivut ovat `noindex`, eikä niille tule hreflang-, canonical-, JSON-LD- tai sitemap-merkintöjä (`"listed": False`). Linkkien ja resurssien polkujen pitää olla absoluuttisia, koska sivu näytetään missä tahansa osoitteessa. Paikallinen `http.server` ei näytä 404-sivua automaattisesti, joten testaa osoitteella `/404.html`.
- Käännökset: `i18n/<kieli>.json` (etusivu, yhteiset tekstit) ja `i18n/guide/<kieli>.json` (opas ja arkit). Koostin yhdistää ne.
- Tulokset: `index.html` (en) sekä `fi/`, `sv/`, `de/`, `fr/`, `es/` ja `pt-br/`. Oppaan osoite on kielikohtainen (`guide.slug`, esim. `/fi/miten-opettaa-lapselle-kello/`). **Älä muokkaa koostettuja index.html-tiedostoja käsin.**
- Mallin `{{avain.polku}}` lisätään HTML-turvallisena tekstinä, `{{{avain}}}` sellaisenaan. Puuttuvat avaimet otetaan englannista, ja niistä tulee varoitus. `--strict` päättyy virheeseen.
- JSON-tiedoston `js`-osio upotetaan sivulle elementtiin `<script id="i18n" type="application/json">`. `main.js` lukee siitä tehtävien, vinkkien ja hahmojen tekstit.
- Kellonajat sanoina ovat `main.js`:n `TIME_WORDS`-oliossa kaikille seitsemälle kielelle. Säännöt on siirretty sovelluksen tiedostoista `domain/*Time.kt`. Jos sovelluksen sanamuoto muuttuu, päivitä myös tämä.
- Puhuttelu: vanhemmille teititellen (de Sie, fr vous), lapselle sinutellen kuten sovelluksessa. Ranskan ? ! : ; -merkkien eteen `build.py` lisää kapean sitovan välilyönnin.
- Termit (tasot, kaverien nimet, kehut, Minuuttihaaste jne.) on otettu sovelluksen `values-*/strings.xml`- ja `personalization.xml`-tiedostoista.
- **Uusi kieli:** kopioi `i18n/en.json` ja `i18n/guide/en.json` uuden kielen nimelle ja käännä ne. Lisää `TIME_WORDS`-olioon kielen funktio vastaavasta `*Time.kt`-tiedostosta. Lisää kielitunnus `build.py`:n `LANGS`-listaan. Kielivalikko, hreflang-linkit ja kielibanneri päivittyvät koostettaessa.
- Kielibanneri ehdottaa selaimen kieltä, eikä sivu ohjaa kävijää automaattisesti. Valinta tallennetaan localStorageen avaimella `clocklings-lang`.

## Animaatiot ja vuorovaikutus (main.js)

- **Hero (`initHero`, `paintSky`):** taivas seuraa todellista vuorokaudenaikaa (`data-daypart`: dawn, day, dusk tai night). Aurinko ja kuu kulkevat kaarella (`orb`), ja tervehdykset `js.greetings` ovat sovelluksen `intro_greeting_*`-tekstit. Kello on raahattava (`role="slider"`, nuolinäppäimet ±5 min ja PageUp/PageDown ±1 h). Kun aikaa raahataan, taivas vaihtuu, kaveri hyppää jokaisella tasatunnilla ja "Back to now" kelaa takaisin. Näyttämön merkintä on osassa `src/partials/stage.html`. 404-sivulla (`T.page === "404"`) sama näyttämö käynnistyy pysähtyneenä aikaan 4.04 (`LOST_TIME`): viisarit kieppuvat kaksi lisäkierrosta, "Back to now" poistetaan, Home palauttaa ajan 4.04 ja kaveri katselee ympärilleen (`look-around`).
- **Parallaksi (`initParallax`):** vain tarkalla osoittimella. Kerrokset käyttävät CSS:n `translate`-ominaisuutta muuttujilla `--px` ja `--py`, joten ne eivät riko `transform`-animaatioita.
- **Viisarien raahaus:** yhteinen `attachHandDrag(clock, opts)`, jota käyttävät sekä hero että harjoitukset. `createClock` tukee asetusta `sweep` (kulunut aika sektorina) sekä metodeja `tweenTo` ja `stop`.
- **Oppimispolku (`initJourney`):** sticky-kello ja IntersectionObserver. Kunkin vaiheen aika on `data-time`-attribuutissa, ja tekstit ovat `journey.*`-avaimissa.
- **Muut:** tilastonauhan laskuri (`initStats`, `data-count`), kelluva vierityskello (`initScrollClock`), tähtiryöppy (`burst`, `[data-burst]`) ja kaverinvaihto View Transitions -siirtymällä (`setCompanion`).
- Kaikki liike kunnioittaa asetusta `prefers-reduced-motion`.

## Hakukoneoptimointi

- `site.config.json` → `domain`. Kun domain on asetettu, `build.py` tuottaa canonical-linkit, täydet hreflang- ja og:image-osoitteet, `og:url`:n ja `sitemap.xml`:n (kaikki sivut ja kielivaihtoehdot). `robots.txt` syntyy aina, ja sitemap-rivi lisätään vain domainin kanssa.
- JSON-LD tuotetaan koostimessa: etusivulle `MobileApplication` ja `FAQPage`, oppaalle `Article`. Head-osassa ovat myös Twitter-kortit.
- Otsikot ja kuvaukset (`meta.title`, `meta.description`, `guide.title`) sisältävät hakusanat kullakin kielellä.

## Tulostettavat arkit (PDF)

- `npm run worksheets` (`tools/worksheets.py`, reportlab 5.1.0 uv:n kautta). Tuottaa jokaiselle kielelle 4 tasoa: tasatunnit, puolet, vartit ja viiden minuutin välit. Jokaisessa PDF:ssä on 3 sivua: lue kello, piirrä viisarit ja vastaukset. Tiedostot tallentuvat oppaan kansioon nimellä `<worksheets.fileBase>-<taso>.pdf`.
- Aikasanat haetaan `tools/timewords.cjs`:llä suoraan `main.js`:n `TIME_WORDS`-säännöistä, joten sivu ja PDF:t käyttävät samoja sanoja. Fontit ovat kansiossa `tools/fonts/` (Fredoka ja Nunito sovelluksesta).
- Aja `npm run worksheets` uudelleen, jos käännökset, aikasanat tai oppaan slug muuttuvat.

## Muut tiedostot

- `assets/css/styles.css`: värit `:root`-muuttujina, vastaavat sovelluksen `SkColors.kt`:tä. Fonttina Fredoka ja Nunito.
- `assets/js/main.js`: ei riippuvuuksia. Sisältää SVG-sateenkaarikellon (`createClock`), hahmovalitsimen (localStorage `clocklings-companion`), viiden tehtävän minikierroksen ja maakohtaisen hinnan.
- `assets/img/characters/*.webp`: tuotetaan skriptillä `tools/cutout_characters.py` sovelluksen gallerian kuvista.
- `_headers`: Cloudflare Pagesin turvaotsakkeet (CSP vain oma alkuperä) ja välimuistiasetukset. Polut ovat absoluuttisia (`/assets/...`).

## Hinta ja Play-linkki

- Asetukset ovat `main.js`:n alussa: `PLAY_URL`, `DEFAULT_PRICE` (USD 6,99), `COUNTRY_PRICES` ja euroalueen `EURO_PRICE`. Hinta muotoillaan sivun kielellä (`Intl`).
- Maa luetaan Cloudflaren osoitteesta `/cdn-cgi/trace`, varalla selaimen kielialueesta. Paikallisesti trace palauttaa 404, mikä on odotettua.

## Kehitys

- `npm run dev` koostaa sivut ja käynnistää palvelimen osoitteeseen http://localhost:8787. Toinen tapa on `.claude/launch.json`.
- Cloudflare Pages: build-komento `python tools/build.py` tai koostetut tiedostot mukaan sellaisenaan. Julkaisukansio on juuri.
- Domainin ostamisen jälkeen: aseta `site.config.json`, aja `npm run build` ja lähetä sitemap Search Consoleen ja Bing Webmaster Toolsiin.
- Tekemättä: tietosuojaseloste (Play vaatii), oma domain, Play-linkki julkaisun jälkeen sekä äidinkielisten tarkistus käännöksille.
