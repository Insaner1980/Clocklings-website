// Tulostaa kaikkien kielten kellonajat sanoina JSONina (5 minuutin välein, 12 tunnin kello).
// Säännöt luetaan suoraan sivun tiedostosta assets/js/main.js, jotta PDF-arkit ja sivu käyttävät samoja sanoja.
// Käyttö: node tools/timewords.cjs > aikasanat.json
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "assets", "js", "main.js"), "utf8");
const start = src.indexOf("  const reading =");
const end = src.indexOf("  const timeWords =");
if (start < 0 || end < 0) throw new Error("Aikasanojen lohkoa ei löytynyt main.js-tiedostosta");
// Lohko on tämän projektin oma koodi, ei ulkoista syötettä.
const TIME_WORDS = new Function(`${src.slice(start, end)}\nreturn TIME_WORDS;`)();

const out = {};
for (const [lang, fn] of Object.entries(TIME_WORDS)) {
  out[lang] = {};
  for (let t = 0; t < 720; t += 5) out[lang][t] = fn(t);
}
process.stdout.write(JSON.stringify(out));
