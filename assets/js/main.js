/* Clocklings-laskeutumissivun toiminnallisuus: kello, hahmovalitsin,
   minitehtävät, paikallinen hinta ja pienet animaatiot. Ei riippuvuuksia. */
(() => {
  "use strict";

  /* ================= Asetukset ================= */

  // Google Play -osoite julkaisun jälkeen, esim. "https://play.google.com/store/apps/details?id=fi.clocklings.blender".
  // Tyhjänä painikkeet ohjaavat hintaosioon ja näyttävät "Coming soon".
  const PLAY_URL = "";

  // Oletushinta, kun maalle ei ole omaa hintaa.
  const DEFAULT_PRICE = { currency: "USD", amount: 6.99 };

  // Maakohtaiset hinnat Google Play Consolen paikallishinnoista.
  // Lisää rivejä muodossa  GB: { currency: "GBP", amount: 5.99 },
  const COUNTRY_PRICES = {};

  // Euroalueen maat käyttävät euroa, ellei COUNTRY_PRICES määritä muuta.
  const EUROZONE = ["AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES"];
  const EURO_PRICE = { currency: "EUR", amount: 6.99 };

  const RAINBOW = ["#FF6B6B", "#FF922B", "#FCC419", "#94D82D", "#51CF66", "#20C997", "#22B8CF", "#339AF0", "#5C7CFA", "#845EF7", "#CC5DE8", "#F06595"];
  const CONFETTI = ["#FF6B6B", "#FFA94D", "#FCC419", "#51CF66", "#339AF0", "#845EF7", "#DA77F2"];
  const HOUR_COLOR = "#E64980";
  const MINUTE_COLOR = "#228BE6";
  const INK = "#3A2453";

  // Kuvien mitat ja taustasävyt. Nimet ja esittelytekstit tulevat sivun kielidatasta (i18n/*.json -> js.companions).
  const COMPANIONS = [
    { id: "doll", w: 382, h: 627, tint: "#FFEAF2" },
    { id: "cat", w: 469, h: 720, tint: "#FFF0DB" },
    { id: "dog", w: 490, h: 720, tint: "#FFF6D6" },
    { id: "robot", w: 452, h: 720, tint: "#DDF6F3" },
    { id: "dragon", w: 499, h: 720, tint: "#F2ECFF" },
    { id: "dinosaur", w: 558, h: 720, tint: "#E7F8EA" },
    { id: "bunny", w: 586, h: 720, tint: "#FFEAF2" },
    { id: "unicorn", w: 519, h: 720, tint: "#F2ECFF" },
    { id: "car", w: 713, h: 542, tint: "#E6F3FF" },
  ];

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* yksityinen tila tms. */ } },
  };

  /* ================= Kielidata ================= */

  const T = (() => {
    try { return JSON.parse($("#i18n").textContent); } catch { return {}; }
  })();
  const LANG = T.lang || "en";
  const LOCALE = T.locale || "en";

  /** Korvaa {avain}-paikkamerkit arvoilla. */
  const fill = (text, values) => String(text || "").replace(/\{(\w+)\}/g, (_, k) => (k in values ? values[k] : ""));
  const companionText = (id) => (T.companions && T.companions[id]) || { name: id, line: "" };

  /* ================= Aika sanoina ================= */
  // Säännöt on siirretty sovelluksen tiedostoista domain/*Time.kt (English, Finnish, Swedish, German,
  // French, Spanish, BrazilianPortuguese). Ne käsittelevät vain 12 tunnin analogista lukutapaa.
  // Uudelle kielelle lisätään oma funktio TIME_WORDS-olioon.

  const reading = (total) => {
    const t = ((Math.round(total) % 720) + 720) % 720;
    const hour = Math.floor(t / 60) || 12;
    return { hour, next: (hour % 12) + 1, minute: t % 60 };
  };

  const EN_NUM = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
    "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const enNumber = (n) => (n < 20 ? EN_NUM[n] : "twenty" + (n % 10 ? "-" + EN_NUM[n % 10] : ""));
  const enMinutes = (n) => (n === 1 ? "one minute" : n % 5 === 0 ? enNumber(n) : `${enNumber(n)} minutes`);

  const FI_NUM = ["", "yksi", "kaksi", "kolme", "neljä", "viisi", "kuusi", "seitsemän", "kahdeksan", "yhdeksän", "kymmenen",
    "yksitoista", "kaksitoista", "kolmetoista", "neljätoista", "viisitoista", "kuusitoista", "seitsemäntoista",
    "kahdeksantoista", "yhdeksäntoista", "kaksikymmentä"];
  const FI_PART = { 5: "viittä", 10: "kymmentä", 15: "varttia", 20: "kahtakymmentä" };
  const fiMinutes = (n) => FI_PART[n] || (n === 1 ? "yksi minuutti" : `${FI_NUM[n]} minuuttia`);

  const SV_UNITS = ["noll", "ett", "två", "tre", "fyra", "fem", "sex", "sju", "åtta", "nio"];
  const SV_TEENS = ["tio", "elva", "tolv", "tretton", "fjorton", "femton", "sexton", "sjutton", "arton", "nitton"];
  const svNumber = (n) => (n < 10 ? SV_UNITS[n] : n < 20 ? SV_TEENS[n - 10] : "tjugo" + (n % 10 ? SV_UNITS[n % 10] : ""));
  const svMinutes = (n) => (n === 1 ? "en minut" : n % 5 === 0 ? svNumber(n) : `${svNumber(n)} minuter`);

  const DE_NUM = ["null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf", "zwölf",
    "dreizehn", "vierzehn", "fünfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn"];
  const DE_TENS = ["", "", "zwanzig", "dreißig", "vierzig", "fünfzig"];
  const deNumber = (n) => {
    if (n < 20) return DE_NUM[n];
    const unit = n % 10;
    return (unit ? `${unit === 1 ? "ein" : DE_NUM[unit]}und` : "") + DE_TENS[Math.floor(n / 10)];
  };
  const DE_FIVES = {
    5: (h) => `fünf nach ${h}`, 10: (h) => `zehn nach ${h}`, 15: (h) => `Viertel nach ${h}`, 20: (h) => `zwanzig nach ${h}`,
    25: (h, n) => `fünf vor halb ${n}`, 30: (h, n) => `halb ${n}`, 35: (h, n) => `fünf nach halb ${n}`,
    40: (h, n) => `zwanzig vor ${n}`, 45: (h, n) => `Viertel vor ${n}`, 50: (h, n) => `zehn vor ${n}`, 55: (h, n) => `fünf vor ${n}`,
  };

  const FR_NUM = ["zéro", "une", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze",
    "treize", "quatorze", "quinze", "seize"];
  const FR_TENS = ["", "dix", "vingt", "trente", "quarante", "cinquante"];
  const frNumber = (n) => {
    if (n < FR_NUM.length) return FR_NUM[n];
    const t = FR_TENS[Math.floor(n / 10)];
    return n % 10 === 0 ? t : n % 10 === 1 ? `${t} et une` : `${t}-${FR_NUM[n % 10]}`;
  };
  const frHour = (h) => `${frNumber(h)} ${h <= 1 ? "heure" : "heures"}`;

  const ES_NUM = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce",
    "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós",
    "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
  const ES_TENS = ["", "", "veinte", "treinta", "cuarenta", "cincuenta"];
  const esNumber = (n) => (n < 30 ? ES_NUM[n] : ES_TENS[Math.floor(n / 10)] + (n % 10 ? ` y ${ES_NUM[n % 10]}` : ""));
  const esHour = (h) => (h === 1 ? "la una" : `las ${esNumber(h)}`);

  const PT_NUM = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze",
    "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const PT_TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta"];
  const ptNumber = (n) => (n < 20 ? PT_NUM[n] : PT_TENS[Math.floor(n / 10)] + (n % 10 ? ` e ${PT_NUM[n % 10]}` : ""));
  const ptHour = (h) => (h === 1 ? "uma" : h === 2 ? "duas" : ptNumber(h));
  const ptHourUnit = (h) => `${ptHour(h)} ${h <= 1 ? "hora" : "horas"}`;

  // Minuutit, jotka luetaan seuraavasta tunnista (fr, es, pt): yli puolen ja viidellä jaollinen.
  const usesNextHour = (m) => m > 30 && m % 5 === 0;

  const TIME_WORDS = {
    de(total) {
      const { hour, next, minute: m } = reading(total);
      if (DE_FIVES[m]) return DE_FIVES[m](deNumber(hour), deNumber(next));
      const h = hour === 1 ? "ein" : deNumber(hour);
      return m === 0 ? `${h} Uhr` : `${h} Uhr ${deNumber(m)}`;
    },
    fr(total) {
      const { hour, minute: m } = reading(total);
      const ref = (hour + (usesNextHour(m) ? 1 : 0)) % 12 || 12;
      const h = frHour(ref);
      if (m === 0) return h;
      if (m === 15) return `${h} et quart`;
      if (m === 30) return `${h} et demie`;
      if (m === 45) return `${h} moins le quart`;
      if (usesNextHour(m)) return `${h} moins ${frNumber(60 - m)}`;
      return `${h} ${m === 1 ? "une minute" : frNumber(m)}`;
    },
    es(total) {
      const { hour, next, minute: m } = reading(total);
      if (m === 0) return esHour(hour);
      if (m === 1) return `${esHour(hour)} y un minuto`;
      if (m === 15) return `${esHour(hour)} y cuarto`;
      if (m === 30) return `${esHour(hour)} y media`;
      if (m === 45) return `${esHour(next)} menos cuarto`;
      if (usesNextHour(m)) return `${esHour(next)} menos ${esNumber(60 - m)}`;
      return `${esHour(hour)} y ${esNumber(m)}`;
    },
    "pt-BR"(total) {
      const { hour, next, minute: m } = reading(total);
      if (usesNextHour(m)) return `${ptNumber(60 - m)} para ${next === 1 ? "a uma" : `as ${ptHour(next)}`}`;
      if (m === 0) return ptHourUnit(hour);
      if (m === 30) return `${ptHour(hour)} e meia`;
      if (m % 5 === 0) return `${ptHour(hour)} e ${ptNumber(m)}`;
      return `${ptHourUnit(hour)} e ${ptNumber(m)} ${m === 1 ? "minuto" : "minutos"}`;
    },

    en(total) {
      const { hour, next, minute: m } = reading(total);
      if (m === 0) return `${enNumber(hour)} o'clock`;
      if (m === 15) return `quarter past ${enNumber(hour)}`;
      if (m === 30) return `half past ${enNumber(hour)}`;
      if (m === 45) return `quarter to ${enNumber(next)}`;
      return m < 30 ? `${enMinutes(m)} past ${enNumber(hour)}` : `${enMinutes(60 - m)} to ${enNumber(next)}`;
    },
    fi(total) {
      const { hour, next, minute: m } = reading(total);
      if (m === 0) return `tasan ${FI_NUM[hour]}`;
      if (m === 30) return `puoli ${FI_NUM[next]}`;
      if (m <= 20) return `${fiMinutes(m)} yli ${FI_NUM[hour]}`;
      if (m < 30) return `${fiMinutes(30 - m)} vaille puoli ${FI_NUM[next]}`;
      if (m < 40) return `${fiMinutes(m - 30)} yli puoli ${FI_NUM[next]}`;
      return `${fiMinutes(60 - m)} vaille ${FI_NUM[next]}`;
    },
    sv(total) {
      const { hour, next, minute: m } = reading(total);
      if (m === 0) return svNumber(hour);
      if (m === 15) return `kvart över ${svNumber(hour)}`;
      if (m === 30) return `halv ${svNumber(next)}`;
      if (m === 45) return `kvart i ${svNumber(next)}`;
      if (m <= 20) return `${svMinutes(m)} över ${svNumber(hour)}`;
      if (m < 30) return `${svMinutes(30 - m)} i halv ${svNumber(next)}`;
      if (m < 40) return `${svMinutes(m - 30)} över halv ${svNumber(next)}`;
      return `${svMinutes(60 - m)} i ${svNumber(next)}`;
    },
  };

  const timeWords = TIME_WORDS[LANG] || TIME_WORDS.en;
  const capitalize = (s) => s.charAt(0).toLocaleUpperCase(LOCALE) + s.slice(1);

  /** 24 tunnin numeroaika, esim. 15:30, 15.30 tai 15 h 30. */
  function digital24(total) {
    const t = ((Math.round(total) % 1440) + 1440) % 1440;
    return `${Math.floor(t / 60)}${T.timeSeparator || ":"}${String(t % 60).padStart(2, "0")}`;
  }

  function digital(total) {
    const { hour, minute } = reading(total);
    return `${hour}${T.timeSeparator || ":"}${String(minute).padStart(2, "0")}`;
  }

  /* ================= Kello (SVG) ================= */

  const SVG_NS = "http://www.w3.org/2000/svg";

  function el(name, attrs = {}, parent) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  }

  function polar(r, deg) {
    const a = (deg - 90) * Math.PI / 180;
    return [100 + r * Math.cos(a), 100 + r * Math.sin(a)];
  }

  function arcPath(r, from, to) {
    const [x1, y1] = polar(r, from);
    const [x2, y2] = polar(r, to);
    return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }

  /**
   * Luo sateenkaarikellon. Palauttaa olion, jolla aikaa voi muuttaa.
   * mini: ilman numeroita ja minuuttimerkkejä (polun pikkukellot).
   */
  function createClock(host, { mini = false, label = "", sweep = false } = {}) {
    const svg = el("svg", { viewBox: "0 0 200 200", class: "clock-svg", role: "img" });
    if (label) svg.setAttribute("aria-label", label);

    // Sateenkaarireuna: 12 kaarta, kukin keskitetty tuntinsa kohdalle.
    RAINBOW.forEach((color, i) => {
      el("path", { d: arcPath(92, i * 30 - 15, i * 30 + 15.4), stroke: color, "stroke-width": 13, fill: "none" }, svg);
    });
    el("circle", { cx: 100, cy: 100, r: 85.5, fill: "#FFFFFF" }, svg);
    // Valinnainen sektori, joka näyttää tasatunnista kuluneen ajan (oppimispolun kello).
    const sweepPath = sweep ? el("path", { fill: MINUTE_COLOR, opacity: 0.14, d: "" }, svg) : null;

    if (!mini) {
      for (let i = 0; i < 60; i++) {
        const isHour = i % 5 === 0;
        const [x1, y1] = polar(isHour ? 72 : 77, i * 6);
        const [x2, y2] = polar(81, i * 6);
        el("line", {
          x1, y1, x2, y2, stroke: INK, "stroke-width": isHour ? 2.6 : 1.1,
          "stroke-linecap": "round", opacity: isHour ? 0.9 : 0.35,
        }, svg);
      }
      for (let n = 1; n <= 12; n++) {
        const [x, y] = polar(60, n * 30);
        const text = el("text", { x: x.toFixed(2), y: (y + 1).toFixed(2), class: "num", "aria-hidden": "true" }, svg);
        text.textContent = n;
      }
    } else {
      for (let n = 0; n < 12; n++) {
        const [x1, y1] = polar(70, n * 30);
        const [x2, y2] = polar(80, n * 30);
        el("line", { x1, y1, x2, y2, stroke: INK, "stroke-width": 6, "stroke-linecap": "round", opacity: 0.85 }, svg);
      }
    }

    const hourHand = el("g", { class: "hand hand-hour" }, svg);
    el("line", { x1: 100, y1: 108, x2: 100, y2: mini ? 52 : 56, stroke: HOUR_COLOR, "stroke-width": mini ? 12 : 8, "stroke-linecap": "round" }, hourHand);
    const minuteHand = el("g", { class: "hand hand-minute" }, svg);
    el("line", { x1: 100, y1: 110, x2: 100, y2: mini ? 30 : 30, stroke: MINUTE_COLOR, "stroke-width": mini ? 8 : 5, "stroke-linecap": "round" }, minuteHand);
    el("circle", { cx: 100, cy: 100, r: mini ? 10 : 7, fill: INK }, svg);
    el("circle", { cx: 100, cy: 100, r: mini ? 4 : 2.8, fill: "#FFFFFF" }, svg);

    host.appendChild(svg);

    // Kertyvät kulmat, jotta osoitin kiertää lyhintä reittiä eikä hyppää taaksepäin 12:n kohdalla.
    let hourAngle = 0;
    let minuteAngle = 0;
    let minutes = 0;

    function nearest(current, target) {
      const delta = ((target - current) % 360 + 540) % 360 - 180;
      return current + delta;
    }

    function setTime(total, { animate = true } = {}) {
      minutes = total;
      const t = ((total % 720) + 720) % 720;
      const hTarget = t / 2;              // 720 min = 360°
      const mTarget = (t % 60) * 6;
      svg.classList.toggle("no-anim", !animate || reduceMotion);
      hourAngle = nearest(hourAngle, hTarget);
      minuteAngle = nearest(minuteAngle, mTarget);
      hourHand.style.transform = `rotate(${hourAngle}deg)`;
      minuteHand.style.transform = `rotate(${minuteAngle}deg)`;
      if (sweepPath) sweepPath.setAttribute("d", sectorPath(((t % 60) + 60) % 60 * 6));
    }

    function sectorPath(deg) {
      if (deg < 0.5) return "";
      if (deg > 359.5) return "M100 15 A85 85 0 1 1 99.99 15 Z";
      const [x, y] = polar(85, deg);
      return `M100 100 L100 15 A85 85 0 ${deg > 180 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`;
    }

    // Pehmeä siirtymä aikaan target (minuutteina). onFrame saa jokaisen välivaiheen.
    let raf = 0;
    function tweenTo(target, { duration = 900, onFrame, onDone } = {}) {
      cancelAnimationFrame(raf);
      if (reduceMotion || duration <= 0) {
        setTime(target, { animate: false });
        if (onFrame) onFrame(target);
        if (onDone) onDone();
        return;
      }
      const from = minutes;
      const start = performance.now();
      const frame = (now) => {
        const p = Math.min(1, (now - start) / duration);
        const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        const value = from + (target - from) * e;
        setTime(value, { animate: false });
        if (onFrame) onFrame(value);
        if (p < 1) raf = requestAnimationFrame(frame);
        else if (onDone) onDone();
      };
      raf = requestAnimationFrame(frame);
    }

    return {
      svg,
      setTime,
      tweenTo,
      stop: () => cancelAnimationFrame(raf),
      get minutes() { return minutes; },
      angles: () => ({ hour: hourAngle, minute: minuteAngle }),
    };
  }

  /**
   * Viisarien raahaus hiirellä, kosketuksella tai kynällä. Lähempänä olevaa viisaria raahataan.
   * Minuuttiviisarin kierros = 60 min, tuntiviisarin kierros = 720 min.
   * opts: enabled(), getTime(), onStart(), onMove(raw), onEnd()
   */
  function attachHandDrag(clock, opts) {
    const svg = clock.svg;
    let drag = null;

    function pointerAngle(e) {
      const r = svg.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2);
      const y = e.clientY - (r.top + r.height / 2);
      return (Math.atan2(y, x) * 180 / Math.PI + 90 + 360) % 360;
    }

    svg.addEventListener("pointerdown", (e) => {
      if (!opts.enabled()) return;
      e.preventDefault();
      clock.stop();
      const a = pointerAngle(e);
      const { hour, minute } = clock.angles();
      const dist = (x) => Math.abs(((a - x) % 360 + 540) % 360 - 180);
      const hand = dist(hour) + 8 < dist(minute) ? "hour" : "minute";
      drag = { hand, last: a, raw: opts.getTime() };
      try { svg.setPointerCapture(e.pointerId); } catch { /* synteettinen tapahtuma */ }
      svg.classList.add("dragging");
      if (opts.onStart) opts.onStart();
    });

    svg.addEventListener("pointermove", (e) => {
      if (!drag) return;
      if (!opts.enabled()) {
        drag = null;
        svg.classList.remove("dragging");
        return;
      }
      const a = pointerAngle(e);
      const delta = ((a - drag.last) % 360 + 540) % 360 - 180;
      drag.last = a;
      drag.raw += drag.hand === "minute" ? delta / 6 : delta * 2;
      clock.setTime(drag.raw, { animate: false });
      opts.onMove(drag.raw);
    });

    const end = () => {
      if (!drag) return;
      drag = null;
      svg.classList.remove("dragging");
      if (opts.onEnd) opts.onEnd();
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
  }

  /* ================= Hero: elävä kello ja vuorokaudenaika ================= */

  const DAY = 1440;
  const LOST_TIME = 4 * 60 + 4;  // 404-sivun kello: 4.04
  const INTRO_LOST_MS = 2600;
  const mod = (t, m) => ((t % m) + m) % m;

  function dayPart(t) {
    const h = mod(t, DAY) / 60;
    if (h >= 5 && h < 8) return "dawn";
    if (h >= 8 && h < 17) return "day";
    if (h >= 17 && h < 20.5) return "dusk";
    return "night";
  }

  // Samat rajat kuin sovelluksen tervehdyksillä (EnglishTime.greeting).
  function greetingFor(t) {
    const h = Math.floor(mod(t, DAY) / 60);
    const g = T.greetings || {};
    if (h >= 5 && h < 10) return g.morning;
    if (h >= 10 && h < 18) return g.day;
    if (h >= 18 && h < 22) return g.evening;
    return g.night;
  }

  /** Auringon tai kuun paikka kaarella. from = nousuhetki minuutteina, kaari kestää 12 h. */
  function orb(t, from) {
    const p = mod(t - from, DAY) / 720;
    if (p > 1) return { x: 50, y: 70, o: 0 };
    // Matala kaari vasemmassa yläkulmassa: kaverin pään yläpuolella, puhekuplan vasemmalla puolella.
    return {
      x: 9 + p * 34,
      y: 14 - Math.sin(Math.PI * p) * 7,
      o: Math.max(0, Math.min(1, Math.min(p, 1 - p) * 14)),
    };
  }

  function paintSky(stage, t) {
    const part = dayPart(t);
    if (stage.dataset.daypart !== part) stage.dataset.daypart = part;
    const sun = orb(t, 360);
    const moon = orb(t, 1080);
    stage.style.setProperty("--sun-x", `${sun.x}%`);
    stage.style.setProperty("--sun-y", `${sun.y}%`);
    stage.style.setProperty("--sun-o", sun.o.toFixed(3));
    stage.style.setProperty("--moon-x", `${moon.x}%`);
    stage.style.setProperty("--moon-y", `${moon.y}%`);
    stage.style.setProperty("--moon-o", moon.o.toFixed(3));
  }

  function initHero() {
    const host = $('[data-clock="live"]');
    if (!host) return;
    const stage = host.closest("[data-stage]");
    const words = $("[data-live-words]");
    const hint = $("[data-drag-hint]");
    // 404-sivulla kello on pysähtynyt aikaan 4.04 eikä seuraa nykyhetkeä.
    const lost = T.page === "404";
    const backEl = $("[data-back-to-now]");
    if (lost && backEl) backEl.remove();
    const back = lost ? null : backEl;
    const companion = $(".stage-companion");
    const clock = createClock(host);
    const svg = clock.svg;

    const now = () => {
      const d = new Date();
      return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
    };
    const anchor = () => (lost ? LOST_TIME : now());

    let t = anchor();
    let live = !lost;
    let touched = false;
    let lastHour = Math.floor(t / 60);
    let lastKey = "";

    // Puhekupla: tervehdys omalla rivillään ja aika sanoina.
    const greetEl = document.createElement("span");
    greetEl.className = "bubble-greet";
    const timeEl = document.createElement("span");
    if (words) words.replaceChildren(greetEl, timeEl);
    if (hint) $("[data-drag-hint-text]", hint).textContent = T.dragHint || "";
    if (back) $("[data-back-to-now-text]", back).textContent = T.backToNow || "";

    svg.classList.add("draggable");
    svg.setAttribute("role", "slider");
    svg.setAttribute("tabindex", "0");
    svg.setAttribute("aria-label", T.heroClockLabel || T.clockLabel || "");
    svg.setAttribute("aria-valuemin", "0");
    svg.setAttribute("aria-valuemax", String(DAY - 1));

    function render(time, { animateHop = true } = {}) {
      const whole = Math.round(time);
      const greet = (lost ? T.lostGreeting : greetingFor(whole)) || "";
      const text = capitalize(timeWords(whole));
      if (greet + text !== lastKey) {
        lastKey = greet + text;
        greetEl.textContent = greet;
        timeEl.textContent = text;
      }
      svg.setAttribute("aria-valuenow", String(mod(whole, DAY)));
      svg.setAttribute("aria-valuetext", `${greet} ${timeWords(whole)}`.trim());
      if (stage) paintSky(stage, time);
      const hour = Math.floor(time / 60);
      if (hour !== lastHour) {
        lastHour = hour;
        if (animateHop && !live) hop(companion);
      }
    }

    function leaveLive() {
      live = false;
      if (back) back.hidden = false;
      if (!touched) {
        touched = true;
        if (hint) hint.hidden = true;
      }
    }

    function backToNow() {
      const target = anchor();
      const delta = mod(target - t + 720, DAY) - 720;  // lyhin matka nykyhetkeen
      clock.tweenTo(t + delta, {
        duration: Math.min(1600, 500 + Math.abs(delta) * 1.2),
        onFrame: (v) => { t = v; render(v, { animateHop: false }); },
        onDone: () => { t = anchor(); live = !lost; if (back) back.hidden = true; render(t); },
      });
    }

    attachHandDrag(clock, {
      enabled: () => true,
      getTime: () => t,
      onStart: () => { leaveLive(); if (stage) stage.classList.add("is-dragging"); },
      onMove: (raw) => { t = raw; render(t); },
      onEnd: () => {
        t = Math.round(t);
        clock.setTime(t);
        render(t);
        if (stage) stage.classList.remove("is-dragging");
      },
    });

    svg.addEventListener("keydown", (e) => {
      const steps = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5, PageUp: 60, PageDown: -60 };
      if (e.key === "Home") { e.preventDefault(); backToNow(); return; }
      if (!(e.key in steps)) return;
      e.preventDefault();
      clock.stop();
      leaveLive();
      t = Math.round(t) + steps[e.key];
      clock.setTime(t);
      render(t);
    });

    if (back) back.addEventListener("click", backToNow);

    // Avaus: sanat ja taivas heti, viisarit pyörähtävät kahdestatoista nykyhetkeen.
    // 404-sivulla viisarit kieppuvat eksyneinä kaksi kierrosta lisää, ja kaveri hyppää lopuksi.
    render(t, { animateHop: false });
    clock.setTime(t - mod(t, 720) - (lost ? 1440 : 0), { animate: false });
    requestAnimationFrame(() => clock.tweenTo(t, {
      duration: lost ? INTRO_LOST_MS : 1500,
      onDone: lost ? () => hop(companion) : undefined,
    }));

    setInterval(() => {
      if (!live) return;
      t = now();
      clock.setTime(t);
      render(t);
    }, 1000);

    // Vihje raahaamisesta ja pieni nytkäytys, joka näyttää viisarien liikkuvan.
    if (hint) {
      setTimeout(() => {
        if (touched) return;
        hint.hidden = false;
        if (!reduceMotion) {
          const base = t;
          clock.tweenTo(base + 7, { duration: 520, onDone: () => { if (!touched) clock.tweenTo(base, { duration: 650 }); } });
        }
        setTimeout(() => { hint.hidden = true; }, 9000);
      }, lost ? INTRO_LOST_MS + 600 : 2400);
    }

    initParallax(stage);
  }

  /** Heron kerrokset liikkuvat hiiren mukana eri syvyyksillä (vain tarkka osoitin). */
  function initParallax(stage) {
    if (!stage || reduceMotion || !window.matchMedia("(pointer: fine)").matches) return;
    const hero = stage.closest(".hero") || stage;
    let frame = 0;
    hero.addEventListener("pointermove", (e) => {
      if (stage.classList.contains("is-dragging")) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = stage.getBoundingClientRect();
        const px = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2)));
        const py = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 2)));
        stage.style.setProperty("--px", px.toFixed(3));
        stage.style.setProperty("--py", py.toFixed(3));
      });
    });
    hero.addEventListener("pointerleave", () => {
      stage.style.setProperty("--px", "0");
      stage.style.setProperty("--py", "0");
    });
  }

  function initMiniClocks() {
    $$("[data-mini-clock]").forEach((host) => {
      const t = Number(host.dataset.miniClock);
      const clock = createClock(host, { mini: !("fullClock" in host.dataset) });
      clock.svg.setAttribute("aria-hidden", "true");
      clock.setTime(t, { animate: false });
    });
    $$("[data-time-caption]").forEach((node) => {
      const t = Number(node.dataset.timeCaption);
      const shown = "h24" in node.dataset ? digital24(t) : digital(t);
      node.textContent = "h24" in node.dataset ? shown : `${capitalize(timeWords(t))} (${shown})`;
    });
  }

  /* ================= Hahmot ================= */

  const companionListeners = [];
  let currentCompanion = COMPANIONS[0];

  function companionSrc(c) { return `/assets/img/characters/${c.id}.webp`; }

  /** Hyppy: animaatioluokka poistetaan lopussa, jolloin kaverin oma idle-animaatio jatkuu. */
  function hop(img) {
    if (!img || reduceMotion) return;
    img.classList.remove("hop");
    void img.offsetWidth; // käynnistää animaation uudelleen
    img.classList.add("hop");
    img.addEventListener("animationend", function done(e) {
      if (e.animationName !== "hop") return;
      img.classList.remove("hop");
      img.removeEventListener("animationend", done);
    });
  }

  function setCompanion(id, { announce = true } = {}) {
    const c = COMPANIONS.find((x) => x.id === id) || COMPANIONS[0];
    currentCompanion = c;
    storage.set("clocklings-companion", c.id);
    // Käyttäjän vaihtaessa kaveria kuva vaihtuu View Transitions -siirtymällä, jos selain tukee sitä.
    const useTransition = announce && !reduceMotion && typeof document.startViewTransition === "function";
    const apply = () => applyCompanion(c, { restartPop: !useTransition });
    if (useTransition) document.startViewTransition(apply);
    else apply();
    if (announce) hop($(".stage-companion"));
    companionListeners.forEach((fn) => fn(c));
  }

  function applyCompanion(c, { restartPop }) {
    $$("[data-companion-img]").forEach((img) => {
      img.src = companionSrc(c);
      img.width = c.w;
      img.height = c.h;
    });

    const big = $("[data-companion-big]");
    if (big) {
      big.src = companionSrc(c);
      big.width = c.w;
      big.height = c.h;
      big.alt = companionText(c.id).name;
      if (restartPop) {
        big.style.animation = "none";
        void big.offsetWidth;
        big.style.animation = "";
      }
    }
    const stage = $(".companion-stage");
    if (stage) stage.style.setProperty("--stage-tint", c.tint);
    const name = $("[data-companion-name]");
    if (name) name.textContent = companionText(c.id).name;
    const line = $("[data-companion-line]");
    if (line) line.textContent = companionText(c.id).line;

    $$(".pick").forEach((b) => {
      const on = b.dataset.id === c.id;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
    });
  }

  function initCompanions() {
    const picker = $("[data-companion-picker]");
    if (!picker) {
      setCompanion(storage.get("clocklings-companion") || "doll", { announce: false });
      return;
    }

    COMPANIONS.forEach((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pick";
      b.dataset.id = c.id;
      b.setAttribute("role", "radio");
      const img = document.createElement("img");
      Object.assign(img, { src: companionSrc(c), alt: "", width: c.w, height: c.h, loading: "lazy" });
      const label = document.createElement("span");
      label.textContent = companionText(c.id).name;
      b.append(img, label);
      b.addEventListener("click", () => {
        const r = b.getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height * 0.35, 8);
        setCompanion(c.id);
      });
      picker.appendChild(b);
    });

    // Nuolinäppäimet radiovalitsimessa.
    picker.addEventListener("keydown", (e) => {
      const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      const i = COMPANIONS.findIndex((c) => c.id === currentCompanion.id);
      const next = COMPANIONS[(i + keys[e.key] + COMPANIONS.length) % COMPANIONS.length];
      setCompanion(next.id);
      picker.querySelector(`[data-id="${next.id}"]`).focus();
    });

    setCompanion(storage.get("clocklings-companion") || "doll", { announce: false });
  }

  /* ================= Minitehtävät ================= */

  const STAR_SVG = (on) => `<svg viewBox="0 0 24 24" class="${on ? "on" : ""}"><path d="M12 2.8l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" fill="${on ? "#FCC419" : "#F1E9FA"}" stroke="${on ? "#F59F00" : "#D9C8EA"}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  const CHECK_SVG = '<svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const PRAISE = T.praise && T.praise.length ? T.praise : ["Well done!"];
  const TASKS = 5;
  const STEP = 30;

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  const norm = (t) => ((t % 720) + 720) % 720;

  function makeTasks() {
    const pool = [];
    for (let h = 1; h <= 12; h++) pool.push(norm(h * 60), norm(h * 60 + 30));
    // Kaksi ensimmäistä tehtävää tasatunteja, sitten sekaisin puolikkaita.
    const whole = shuffle(pool.filter((t) => t % 60 === 0));
    const half = shuffle(pool.filter((t) => t % 60 === 30));
    const times = [whole[0], whole[1], half[0], whole[2], half[1]];
    return times.map((t, i) => ({ type: i % 2 === 0 ? "read" : "set", answer: t }));
  }

  /** Uskottavat väärät vastaukset: naapuritunti, peilattu minuutti, vaihdetut osoittimet. */
  function readChoices(answer) {
    const h = Math.floor(answer / 60) || 12;
    const m = answer % 60;
    const candidates = [
      norm(answer + 60),
      norm(answer - 60),
      norm(h * 60 + (m === 0 ? 30 : 0)),
      norm(h * 60 + (m === 0 ? 30 : 0) - 60),
      norm(((h + 6) % 12) * 60 + m),
    ].filter((t, i, a) => t !== answer && a.indexOf(t) === i);
    const wrong = shuffle(candidates).slice(0, 2);
    return shuffle([answer, ...wrong]);
  }

  function initTrainer() {
    const root = $("[data-trainer]");
    if (!root) return;

    const clockHost = $('[data-clock="trainer"]', root);
    const clock = createClock(clockHost, { label: T.practiceClock });
    const svg = clock.svg;
    const body = $(".trainer-body", root);
    const progress = $("[data-progress]", root);
    const progressText = $("[data-progress-text]", root);
    const title = $("[data-task-title]", root);
    const options = $("[data-options]", root);
    const bubble = $("[data-bubble]", root);
    const buddy = $(".buddy-img", root);
    const btnStart = $("[data-start]", root);
    const btnCheck = $("[data-check]", root);
    const btnNext = $("[data-next]", root);
    const setControls = $("[data-set-controls]", root);
    const readout = $("[data-set-readout]", root);
    const result = $("[data-result]", root);

    let tasks = [];
    let index = 0;
    let mistakes = 0;
    let outcomes = [];
    let mistakeCounts = [];
    let locked = false;
    let setTime = 0;
    let advanceTimer = 0;

    clock.setTime(0, { animate: false });
    renderProgress();

    function say(text, mood = "") {
      bubble.textContent = text;
      bubble.className = `bubble ${mood}`.trim();
    }

    function animateBuddy(cls) {
      if (reduceMotion) return;
      buddy.classList.remove("hop", "shake");
      void buddy.offsetWidth;
      buddy.classList.add(cls);
    }

    function renderProgress() {
      progress.innerHTML = "";
      for (let i = 0; i < TASKS; i++) {
        const li = document.createElement("li");
        if (outcomes[i]) li.className = outcomes[i];
        else if (tasks.length && i === index) li.className = "current";
        progress.appendChild(li);
      }
      progressText.textContent = tasks.length ? fill(T.progress, { n: Math.min(index + 1, TASKS), total: TASKS }) : "";
    }

    function start() {
      tasks = makeTasks();
      index = 0;
      outcomes = [];
      mistakeCounts = [];
      result.hidden = true;
      body.hidden = false;
      $(".trainer-top", root).hidden = false;
      btnStart.hidden = true;
      showTask();
    }

    function showTask() {
      clearTimeout(advanceTimer);
      const task = tasks[index];
      mistakes = 0;
      locked = false;
      options.innerHTML = "";
      btnNext.hidden = true;
      renderProgress();

      if (task.type === "read") {
        setDraggable(false);
        setControls.hidden = true;
        btnCheck.hidden = true;
        title.textContent = T.readQuestion;
        clock.setTime(task.answer);
        clock.svg.setAttribute("aria-label", `${T.practiceClock} ${T.clockLabel.replace("{time}", digital(task.answer))}`);
        say(index === 0 ? T.bubbleFirst : T.bubbleRead);
        readChoices(task.answer).forEach((t) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "option";
          b.dataset.time = t;
          const text = document.createElement("span");
          text.textContent = capitalize(timeWords(t));
          b.appendChild(text);
          b.addEventListener("click", () => answerRead(b, t));
          options.appendChild(b);
        });
      } else {
        const target = document.createElement("span");
        target.className = "target";
        target.textContent = timeWords(task.answer);
        title.replaceChildren(`${T.setQuestion} `, target);
        // Aloitusaika eri kuin vastaus, kuten sovelluksessa.
        setTime = task.answer === 720 || task.answer === 0 ? 360 : 0;
        clock.setTime(setTime);
        updateReadout();
        setControls.hidden = false;
        btnCheck.hidden = false;
        setDraggable(true);
        say(T.bubbleSet);
      }
    }

    function finishTask(outcome) {
      outcomes[index] = outcome;
      mistakeCounts[index] = mistakes;
      locked = true;
      setDraggable(false);
      btnCheck.hidden = true;
      renderProgress();
    }

    function next() {
      index += 1;
      if (index >= TASKS) showResult();
      else showTask();
    }

    function correct() {
      const outcome = mistakes === 0 ? "first" : "hinted";
      finishTask(outcome);
      say(PRAISE[Math.floor(Math.random() * PRAISE.length)], "good");
      animateBuddy("hop");
      advanceTimer = setTimeout(next, 1500);
    }

    function reveal(text) {
      finishTask("shown");
      say(text, "try");
      btnNext.hidden = false;
      btnNext.focus({ preventScroll: true });
    }

    function answerRead(button, t) {
      if (locked) return;
      const task = tasks[index];
      if (t === task.answer) {
        button.classList.add("correct");
        button.insertAdjacentHTML("beforeend", CHECK_SVG);
        $$(".option", options).forEach((b) => { b.disabled = true; if (b !== button) b.classList.add("dim"); });
        correct();
        return;
      }
      mistakes += 1;
      button.classList.add("wrong");
      button.disabled = true;
      animateBuddy("shake");
      if (mistakes === 1) {
        say(readHint(task.answer, t), "hint");
      } else {
        $$(".option", options).forEach((b) => {
          b.disabled = true;
          if (Number(b.dataset.time) === task.answer) {
            b.classList.add("correct");
            b.insertAdjacentHTML("beforeend", CHECK_SVG);
          }
        });
        reveal(fill(T.revealRead, { time: timeWords(task.answer) }));
      }
    }

    function readHint(answer, chosen) {
      if (answer % 60 !== chosen % 60) return answer % 60 === 0 ? T.hintReadWhole : T.hintReadHalf;
      return answer % 60 === 30 ? T.hintReadHourHalf : T.hintReadHour;
    }

    function check() {
      if (locked) return;
      const task = tasks[index];
      if (norm(setTime) === norm(task.answer)) {
        correct();
        return;
      }
      mistakes += 1;
      animateBuddy("shake");
      if (mistakes === 1) {
        const minuteRight = norm(setTime) % 60 === task.answer % 60;
        say(minuteRight ? T.hintSetHour : T.hintSetMinute, "hint");
      } else {
        setTime = task.answer;
        clock.setTime(task.answer);
        updateReadout();
        reveal(fill(T.revealSet, { time: timeWords(task.answer) }));
      }
    }

    function showResult() {
      // Sama sääntö kuin sovelluksessa: enintään 1 virhe = 3 tähteä, enintään 3 = 2 tähteä.
      const totalMistakes = mistakeCounts.reduce((sum, n) => sum + n, 0);
      const stars = totalMistakes <= 1 ? 3 : totalMistakes <= 3 ? 2 : 1;
      body.hidden = true;
      $(".trainer-top", root).hidden = true;
      result.hidden = false;
      $("[data-result-stars]", result).innerHTML = [1, 2, 3].map((i) => STAR_SVG(i <= stars)).join("");
      $("[data-result-title]", result).textContent = stars === 3 ? T.result3 : stars === 2 ? T.result2 : T.result1;
      $("[data-result-text]", result).textContent =
        `${fill(stars === 1 ? T.starsOne : T.starsOther, { n: stars })} ${T.resultUnlock}`;
      $("[data-result-title]", result).setAttribute("tabindex", "-1");
      $("[data-result-title]", result).focus({ preventScroll: true });
      if (stars === 3) confetti(root);
    }

    /* ---------- Osoittimien raahaus ---------- */

    function updateReadout() {
      readout.textContent = digital(setTime);
      svg.setAttribute("aria-valuetext", timeWords(setTime));
      svg.setAttribute("aria-valuenow", String(norm(setTime)));
    }

    function nudge(delta) {
      if (locked) return;
      setTime = norm(setTime + delta);
      clock.setTime(setTime);
      updateReadout();
    }

    function setDraggable(on) {
      svg.classList.toggle("draggable", on);
      if (on) {
        svg.setAttribute("role", "slider");
        svg.setAttribute("tabindex", "0");
        svg.setAttribute("aria-label", T.sliderLabel);
        svg.setAttribute("aria-valuemin", "0");
        svg.setAttribute("aria-valuemax", "690");
      } else {
        svg.setAttribute("role", "img");
        svg.removeAttribute("tabindex");
        ["aria-valuetext", "aria-valuenow", "aria-valuemin", "aria-valuemax"].forEach((a) => svg.removeAttribute(a));
      }
    }

    attachHandDrag(clock, {
      enabled: () => svg.classList.contains("draggable") && !locked,
      getTime: () => setTime,
      onMove: (raw) => {
        const snapped = norm(Math.round(raw / STEP) * STEP);
        if (snapped !== norm(setTime)) {
          setTime = snapped;
          updateReadout();
        }
      },
      onEnd: () => clock.setTime(setTime),
    });

    svg.addEventListener("keydown", (e) => {
      if (!svg.classList.contains("draggable")) return;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); nudge(STEP); }
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); nudge(-STEP); }
      if (e.key === "Enter") { e.preventDefault(); check(); }
    });

    $$("[data-step]", root).forEach((b) => b.addEventListener("click", () => nudge(Number(b.dataset.step))));
    btnStart.addEventListener("click", start);
    btnCheck.addEventListener("click", check);
    btnNext.addEventListener("click", next);
    $("[data-restart]", root).addEventListener("click", start);
  }

  function confetti(container) {
    if (reduceMotion) return;
    const layer = document.createElement("div");
    layer.className = "confetti";
    const height = container.offsetHeight + 40;
    for (let i = 0; i < 46; i++) {
      const p = document.createElement("i");
      p.style.left = `${Math.random() * 100}%`;
      p.style.background = CONFETTI[i % CONFETTI.length];
      p.style.animationDelay = `${Math.random() * 0.5}s`;
      p.style.setProperty("--fall", `${height * (0.7 + Math.random() * 0.4)}px`);
      p.style.setProperty("--spin", `${(Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540)}deg`);
      layer.appendChild(p);
    }
    container.appendChild(layer);
    setTimeout(() => layer.remove(), 3200);
  }

  /* ================= Hinta maan mukaan ================= */

  function priceFor(country) {
    if (country && COUNTRY_PRICES[country]) return COUNTRY_PRICES[country];
    if (country && EUROZONE.includes(country)) return EURO_PRICE;
    return DEFAULT_PRICE;
  }

  function format(amount, currency) {
    try {
      return new Intl.NumberFormat(LOCALE, { style: "currency", currency, minimumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
    } catch {
      return `${amount} ${currency}`;
    }
  }

  async function detectCountry() {
    // Cloudflaren /cdn-cgi/trace kertoo kävijän maan (loc=FI). Toimii vain Cloudflaren kautta julkaistuna.
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1500);
      const res = await fetch("/cdn-cgi/trace", { signal: ctrl.signal, cache: "no-store" });
      clearTimeout(timer);
      if (res.ok) {
        const match = (await res.text()).match(/^loc=([A-Z]{2})$/m);
        if (match && match[1] !== "XX") return match[1];
      }
    } catch { /* paikallinen kehitys tai verkkovirhe */ }
    // Varalla selaimen kieliasetuksen alue (esim. fi-FI -> FI).
    for (const lang of navigator.languages || [navigator.language]) {
      const region = (lang || "").split("-")[1];
      if (region && /^[A-Z]{2}$/i.test(region)) return region.toUpperCase();
    }
    return null;
  }

  async function initPrice() {
    if (!$("[data-price], [data-price-zero]")) return;
    const country = await detectCountry();
    const price = priceFor(country);
    $$("[data-price]").forEach((n) => { n.textContent = format(price.amount, price.currency); });
    $$("[data-price-zero]").forEach((n) => { n.textContent = format(0, price.currency); });
    const note = $("[data-price-note]");
    if (!note) return;
    note.textContent = price === DEFAULT_PRICE ? T.priceNoteDefault : T.priceNoteLocal;
  }

  /* ================= Pienet viimeistelyt ================= */

  function initPlayLinks() {
    if (!PLAY_URL) return;
    $$("[data-play-link]").forEach((a) => {
      a.href = PLAY_URL;
      a.rel = "noopener";
    });
    $$("[data-play-eyebrow]").forEach((n) => { n.textContent = T.playGet; });
    $$("[data-soon-pill]").forEach((n) => { n.textContent = T.playPill; });
  }

  /** Kielivalikko ja ehdotus siirtyä selaimen kielelle (ei pakotettua uudelleenohjausta). */
  function initLanguage() {
    $$("[data-lang-link]").forEach((a) => a.addEventListener("click", () => storage.set("clocklings-lang", a.dataset.langLink)));

    const menu = $("[data-lang-menu]");
    if (menu) {
      document.addEventListener("click", (e) => { if (!menu.contains(e.target)) menu.open = false; });
      menu.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && menu.open) { menu.open = false; $("summary", menu).focus(); }
      });
    }

    const banner = $("[data-lang-banner]");
    const options = T.suggest || {};
    if (!banner || storage.get("clocklings-lang")) return;
    const codes = Object.keys(options);
    let preferred = null;
    for (const tag of navigator.languages || [navigator.language]) {
      const t = (tag || "").toLowerCase();
      preferred = codes.find((c) => c.toLowerCase() === t) || codes.find((c) => c.split("-")[0].toLowerCase() === t.split("-")[0]);
      if (preferred) break;
    }
    if (!preferred || preferred === LANG) return;
    const s = options[preferred];
    $("[data-lang-banner-text]", banner).textContent = s.text;
    const link = $("[data-lang-banner-link]", banner);
    link.textContent = s.link;
    link.href = (s.paths && (s.paths[T.page] || s.paths.home)) || "/";
    link.addEventListener("click", () => storage.set("clocklings-lang", preferred));
    $("[data-lang-banner-close]", banner).addEventListener("click", () => {
      storage.set("clocklings-lang", LANG);
      banner.hidden = true;
    });
    banner.hidden = false;
  }

  function initHeader() {
    const header = $(".site-header");
    const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  function initReveal() {
    if (reduceMotion || !("IntersectionObserver" in window)) return;
    const targets = $$(".section-head, .companion-show, .step, .path, .trainer, .tile, .outfit-card, .outfits-copy, .promises li, .plan, .faq-list");
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    targets.forEach((t) => {
      // Ruudukon kortit tulevat porrastetusti.
      const siblings = t.parentElement ? Array.from(t.parentElement.children) : [];
      const pos = siblings.indexOf(t);
      if (pos > 0 && siblings.length > 1) t.style.transitionDelay = `${Math.min(pos, 5) * 70}ms`;
      t.classList.add("reveal");
      io.observe(t);
    });
  }

  /** Oppimispolku: iso kello pysyy paikallaan ja kelaa vieritettäessä kunkin tason esimerkkiaikaan. */
  function initJourney() {
    const root = $("[data-journey]");
    if (!root) return;
    const caption = $("[data-journey-caption]", root);
    const clock = createClock($('[data-clock="journey"]', root), { sweep: true });
    clock.svg.setAttribute("aria-hidden", "true");
    const steps = $$(".journey-step", root);
    let active = null;

    function show(step, animate = true) {
      if (step === active) return;
      active = step;
      steps.forEach((s) => s.classList.toggle("is-active", s === step));
      const t = Number(step.dataset.time);
      const shown = "h24" in step.dataset ? digital24(t) : digital(t);
      caption.textContent = `${capitalize(timeWords(t))} (${shown})`;
      if (animate) clock.tweenTo(t, { duration: 1100 });
      else clock.setTime(t, { animate: false });
    }

    show(steps[0], false);
    root.classList.add("is-live");
    steps.forEach((s) => s.addEventListener("click", () => show(s)));
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) show(entry.target); });
    }, { rootMargin: "-45% 0px -45% 0px" });
    steps.forEach((s) => io.observe(s));
  }

  /** Tilastonauhan luvut lasketaan nollasta, kun nauha tulee näkyviin. */
  function initStats() {
    const nums = $$("[data-count]");
    if (!nums.length || reduceMotion || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        const el = entry.target;
        const end = Number(el.dataset.count);
        const start = performance.now();
        const frame = (now) => {
          const p = Math.min(1, (now - start) / 1300);
          el.textContent = String(Math.round(end * (1 - Math.pow(1 - p, 3))));
          if (p < 1) requestAnimationFrame(frame);
        };
        el.textContent = "0";
        requestAnimationFrame(frame);
      });
    }, { threshold: 0.6 });
    nums.forEach((n) => io.observe(n));
  }

  /** Kelluva minikello: minuuttiviisari näyttää vierityksen etenemisen, napautus vie ylös. */
  function initScrollClock() {
    const btn = $("[data-scroll-clock]");
    if (!btn) return;
    btn.hidden = false;
    const clock = createClock($('[data-clock="scroll"]', btn), { mini: true });
    clock.svg.setAttribute("aria-hidden", "true");
    let pending = false;
    const update = () => {
      pending = false;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      clock.setTime(720 + p * 60, { animate: false });
      btn.classList.toggle("show", window.scrollY > 600);
    };
    window.addEventListener("scroll", () => {
      if (!pending) { pending = true; requestAnimationFrame(update); }
    }, { passive: true });
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
      $("#main").focus({ preventScroll: true });
    });
    update();
  }

  const BURST_SHAPES = [
    "M12 2.8l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z",
    "M12 20.5S3.5 15.2 3.5 9.2A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8.5 2.2c0 6-8.5 11.3-8.5 11.3z",
    "M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z",
  ];

  /** Tähti- ja sydänryöppy kohdasta (x, y) näkymän koordinaateissa. */
  function burst(x, y, count = 12) {
    if (reduceMotion) return;
    let layer = $(".burst-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "burst-layer";
      layer.setAttribute("aria-hidden", "true");
      document.body.appendChild(layer);
    }
    for (let i = 0; i < count; i++) {
      const s = el("svg", { viewBox: "0 0 24 24" });
      el("path", { d: BURST_SHAPES[i % BURST_SHAPES.length], fill: CONFETTI[i % CONFETTI.length] }, s);
      s.style.left = `${x}px`;
      s.style.top = `${y}px`;
      layer.appendChild(s);
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 46 + Math.random() * 54;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist - 24;
      const spin = (Math.random() - 0.5) * 300;
      const anim = s.animate([
        { transform: "translate(-50%, -50%) scale(.2) rotate(0deg)", opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1) rotate(${spin}deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(calc(-50% + ${dx * 1.15}px), calc(-50% + ${dy + 30}px)) scale(.8) rotate(${spin * 1.3}deg)`, opacity: 0 },
      ], { duration: 800 + Math.random() * 300, easing: "cubic-bezier(.2, .8, .3, 1)" });
      anim.onfinish = () => s.remove();
    }
  }

  function initBursts() {
    document.addEventListener("click", (e) => {
      const target = e.target.closest("[data-burst]");
      if (!target) return;
      burst(e.clientX, e.clientY);
      hop(target);
    });
  }

  initHero();
  initMiniClocks();
  initJourney();
  initStats();
  initScrollClock();
  initBursts();
  initCompanions();
  initTrainer();
  initPlayLinks();
  initLanguage();
  initHeader();
  initReveal();
  initPrice();
})();
