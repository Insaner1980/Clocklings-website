"""Tuottaa tulostettavat kellotehtäväarkit (PDF) kaikille kielille.

Jokaisella kielellä on neljä tasoa: tasatunnit, puolet tunnit, vartit ja viiden minuutin välit.
Jokaisessa PDF:ssä on kolme sivua:
  1. Lue kello ja kirjoita aika
  2. Piirrä viisarit
  3. Vastaukset

Tekstit tulevat i18n-tiedostoista (worksheets.pdf.*). Aikasanat tulevat sivun säännöistä
(tools/timewords.cjs lukee ne main.js-tiedostosta). Tulostiedostot menevät oppaan kansioon,
esim. /fi/<oppaan-slug>/<fileBase>-1.pdf.

Käyttö: uv run --with reportlab==5.1.0 --with pillow python tools/worksheets.py
"""
import io
import json
import math
import random
import subprocess
import sys
from pathlib import Path

from PIL import Image
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader, simpleSplit
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parent
sys.path.insert(0, str(TOOLS))
import build  # noqa: E402  (kielidata ja polut samasta paikasta kuin sivuilla)

INK = HexColor("#3A2453")
INK_SOFT = HexColor("#625075")
LINE = HexColor("#D9C8EA")
HOUR = HexColor("#E64980")
MINUTE = HexColor("#228BE6")
RAINBOW = ["#FF6B6B", "#FF922B", "#FCC419", "#94D82D", "#51CF66", "#20C997",
           "#22B8CF", "#339AF0", "#5C7CFA", "#845EF7", "#CC5DE8", "#F06595"]
LOGO = ["#F03E3E", "#F76707", "#E8A200", "#2F9E44", "#1C7ED6", "#7048E8", "#C2255C"]
LEVEL_COMPANION = {1: "cat", 2: "dog", 3: "dragon", 4: "robot"}

W, H = A4
MARGIN = 42

for name, file in [("Fredoka", "fredoka_bold.ttf"), ("FredokaSemi", "fredoka_semibold.ttf"),
                   ("Nunito", "nunito_semibold.ttf"), ("NunitoBold", "nunito_bold.ttf")]:
    pdfmetrics.registerFont(TTFont(name, str(TOOLS / "fonts" / file)))


def clean(text):
    """Kapea sitova välilyönti tavalliseksi sitovaksi, jotta fontti piirtää sen."""
    return text.replace(" ", " ")


def level_times(level, seed):
    rng = random.Random(seed * 31 + level)
    hours = list(range(1, 13))
    rng.shuffle(hours)
    if level == 1:
        times = [h * 60 for h in hours]
    elif level == 2:
        times = [h * 60 + 30 for h in hours[:8]] + [h * 60 for h in hours[8:]]
    elif level == 3:
        times = ([h * 60 + 15 for h in hours[:4]] + [h * 60 + 45 for h in hours[4:8]]
                 + [h * 60 + 30 for h in hours[8:10]] + [h * 60 for h in hours[10:]])
    else:
        minutes = [m for m in range(5, 60, 5) if m not in (15, 30, 45)]
        times = [h * 60 + rng.choice(minutes) for h in hours]
    rng.shuffle(times)
    return [t % 720 for t in times]


def digital(t, sep):
    h = (t // 60) % 12 or 12
    return f"{h}{sep}{t % 60:02d}"


def draw_clock(c, cx, cy, r, t=None):
    """Sateenkaarikello. t=None piirtää kellon ilman viisareita."""
    ring = r * 0.12
    c.setLineCap(0)
    for i, color in enumerate(RAINBOW):
        c.setStrokeColor(HexColor(color))
        c.setLineWidth(ring)
        start = 90 - i * 30 - 15.3
        p = c.beginPath()
        p.arc(cx - r + ring / 2, cy - r + ring / 2, cx + r - ring / 2, cy + r - ring / 2, start, 30.6)
        c.drawPath(p, stroke=1, fill=0)
    inner = r - ring
    c.setFillColor(white)
    c.circle(cx, cy, inner, stroke=0, fill=1)
    c.setStrokeColor(INK)
    c.setLineCap(1)
    for i in range(60):
        a = math.radians(90 - i * 6)
        major = i % 5 == 0
        r1 = inner * (0.82 if major else 0.89)
        r2 = inner * 0.95
        c.setLineWidth(r * (0.035 if major else 0.014))
        c.line(cx + r1 * math.cos(a), cy + r1 * math.sin(a), cx + r2 * math.cos(a), cy + r2 * math.sin(a))
    c.setFillColor(INK)
    size = r * 0.24
    c.setFont("Fredoka", size)
    for n in range(1, 13):
        a = math.radians(90 - n * 30)
        x = cx + inner * 0.64 * math.cos(a)
        y = cy + inner * 0.64 * math.sin(a) - size * 0.35
        c.drawCentredString(x, y, str(n))
    if t is not None:
        hour_angle = math.radians(90 - (t % 720) / 2)
        minute_angle = math.radians(90 - (t % 60) * 6)
        c.setStrokeColor(HOUR)
        c.setLineWidth(r * 0.085)
        c.line(cx, cy, cx + inner * 0.5 * math.cos(hour_angle), cy + inner * 0.5 * math.sin(hour_angle))
        c.setStrokeColor(MINUTE)
        c.setLineWidth(r * 0.055)
        c.line(cx, cy, cx + inner * 0.8 * math.cos(minute_angle), cy + inner * 0.8 * math.sin(minute_angle))
    c.setFillColor(INK)
    c.circle(cx, cy, r * 0.07, stroke=0, fill=1)
    c.setFillColor(white)
    c.circle(cx, cy, r * 0.028, stroke=0, fill=1)


def companion_image(name, cache={}):
    if name not in cache:
        img = Image.open(ROOT / "assets" / "img" / "characters" / f"{name}.webp").convert("RGBA")
        img.thumbnail((300, 300), Image.LANCZOS)  # riittää tulostukseen n. 3 cm korkeudella
        buf = io.BytesIO()
        img.save(buf, "PNG")
        buf.seek(0)
        cache[name] = (ImageReader(buf), img.width / img.height)
    return cache[name]


def header(c, text, level_name, title, instruction):
    # sanamerkki
    x = MARGIN
    c.setFont("Fredoka", 24)
    for i, ch in enumerate("Clocklings"):
        c.setFillColor(HexColor(LOGO[i % len(LOGO)]))
        c.drawString(x, H - MARGIN - 18, ch)
        x += pdfmetrics.stringWidth(ch, "Fredoka", 24)
    # nimi-rivi
    c.setFillColor(INK)
    c.setFont("NunitoBold", 12)
    label = clean(text["name"]) + ":"
    lx = W - MARGIN - 190
    c.drawString(lx, H - MARGIN - 16, label)
    c.setStrokeColor(LINE)
    c.setLineWidth(1.2)
    c.line(lx + pdfmetrics.stringWidth(label, "NunitoBold", 12) + 6, H - MARGIN - 18, W - MARGIN, H - MARGIN - 18)
    # otsikko
    c.setFillColor(HexColor("#6741D9"))
    c.setFont("FredokaSemi", 12)
    c.drawString(MARGIN, H - MARGIN - 48, clean(f"{text['sheet']}{text['_colon']} {level_name}"))
    c.setFillColor(INK)
    c.setFont("Fredoka", 26)
    c.drawString(MARGIN, H - MARGIN - 80, clean(title))
    c.setFont("Nunito", 13)
    c.setFillColor(INK_SOFT)
    c.drawString(MARGIN, H - MARGIN - 102, clean(instruction))


def footer(c, text, page, companion=None):
    c.setFont("Nunito", 9.5)
    c.setFillColor(INK_SOFT)
    c.drawString(MARGIN, 26, clean(text["footer"]))
    c.drawRightString(W - MARGIN, 26, str(page))
    if companion:
        img, ratio = companion_image(companion)
        h = 92
        c.drawImage(img, W - MARGIN - h * ratio - 20, 38, width=h * ratio, height=h, mask="auto")


def grid_positions():
    cols, rows = 3, 4
    cell_w = (W - 2 * MARGIN) / cols
    top = H - MARGIN - 128
    cell_h = (top - 120) / rows
    for row in range(rows):
        for col in range(cols):
            yield MARGIN + cell_w * (col + 0.5), top - cell_h * row, cell_w, cell_h


def read_page(c, text, level_name, times, sep):
    header(c, text, level_name, text["readTitle"], text["readInstr"])
    for n, ((cx, top, cw, ch), t) in enumerate(zip(grid_positions(), times), 1):
        r = min(cw, ch) * 0.34
        cy = top - r - 8
        draw_clock(c, cx, cy, r, t)
        c.setFillColor(INK)
        c.setFont("Fredoka", 11)
        c.drawString(cx - cw / 2 + 6, top - 10, f"{n}.")
        c.setStrokeColor(LINE)
        c.setLineWidth(1.2)
        c.line(cx - cw * 0.38, cy - r - 30, cx + cw * 0.38, cy - r - 30)


def draw_page(c, text, level_name, times, words, sep):
    header(c, text, level_name, text["drawTitle"], text["drawInstr"])
    for n, ((cx, top, cw, ch), t) in enumerate(zip(grid_positions(), times), 1):
        r = min(cw, ch) * 0.29  # pienempi kuin lukusivulla, jotta kaksiriviselle tekstille jää tilaa
        cy = top - r - 8
        draw_clock(c, cx, cy, r, None)
        c.setFillColor(INK)
        c.setFont("Fredoka", 11)
        c.drawString(cx - cw / 2 + 6, top - 10, f"{n}.")
        label = clean(words[t][0].upper() + words[t][1:])
        lines = simpleSplit(label, "NunitoBold", 11, cw * 0.86)
        y = cy - r - 18
        c.setFont("NunitoBold", 11)
        for line in lines[:2]:
            c.drawCentredString(cx, y, line)
            y -= 13
        c.setFont("Nunito", 10)
        c.setFillColor(INK_SOFT)
        c.drawCentredString(cx, y, f"({digital(t, sep)})")


def key_page(c, text, level_name, read_times, draw_times, words, sep):
    header(c, text, level_name, text["keyTitle"], "")
    y = H - MARGIN - 128
    c.setFont("FredokaSemi", 14)
    c.setFillColor(INK)
    c.drawString(MARGIN, y, clean(f"1. {text['readTitle']}"))
    y -= 22
    col_w = (W - 2 * MARGIN) / 2
    for i, t in enumerate(read_times):
        x = MARGIN + (i % 2) * col_w
        row_y = y - (i // 2) * 18
        c.setFont("NunitoBold", 11)
        c.setFillColor(INK)
        answer = clean(f"{i + 1}. {words[t][0].upper() + words[t][1:]} ({digital(t, sep)})")
        c.drawString(x, row_y, simpleSplit(answer, "NunitoBold", 11, col_w - 12)[0])
    y -= 6 * 18 + 26
    c.setFont("FredokaSemi", 14)
    c.drawString(MARGIN, y, clean(f"2. {text['drawTitle']}"))
    y -= 14
    cols = 6
    cell = (W - 2 * MARGIN) / cols
    for i, t in enumerate(draw_times):
        cx = MARGIN + cell * (i % cols + 0.5)
        cy = y - 42 - (i // cols) * 112
        draw_clock(c, cx, cy, 34, t)
        c.setFont("Fredoka", 10)
        c.setFillColor(INK)
        c.drawCentredString(cx, cy - 48, f"{i + 1}. ({digital(t, sep)})")


def main():
    words_all = json.loads(subprocess.run(["node", str(TOOLS / "timewords.cjs")], capture_output=True,
                                          text=True, encoding="utf-8", check=True).stdout)
    data, _ = build.load_languages()
    count = 0
    for code, lang in data.items():
        words = {int(k): v for k, v in words_all.get(code, words_all["en"]).items()}
        text = dict(lang["worksheets"]["pdf"])
        text["_colon"] = " :" if code == "fr" else ":"  # ranskassa välilyönti ennen kaksoispistettä
        sep = lang["js"]["timeSeparator"]
        folder = ROOT / build.page_path(code, build.PAGES[1], lang).lstrip("/")
        folder.mkdir(parents=True, exist_ok=True)
        levels = {1: lang["path"]["whole"], 2: lang["path"]["half"], 3: lang["path"]["quarter"], 4: lang["path"]["five"]}
        for level, level_name in levels.items():
            read_times = level_times(level, 1)
            draw_times = level_times(level, 2)
            target = folder / f"{lang['worksheets']['fileBase']}-{level}.pdf"
            c = canvas.Canvas(str(target), pagesize=A4)
            c.setTitle(clean(f"{text['sheet']}{text['_colon']} {level_name}"))
            c.setAuthor("Clocklings")
            c.setSubject(clean(lang["worksheets"]["title"]))
            c.setKeywords(clean(f"{lang['worksheets']['title']}, {level_name}, Clocklings"))
            read_page(c, text, level_name, read_times, sep)
            footer(c, text, 1, LEVEL_COMPANION[level])
            c.showPage()
            draw_page(c, text, level_name, draw_times, words, sep)
            footer(c, text, 2)
            c.showPage()
            key_page(c, text, level_name, read_times, draw_times, words, sep)
            footer(c, text, 3)
            c.showPage()
            c.save()
            count += 1
            print(f"{code:6} {target.relative_to(ROOT)} ({target.stat().st_size // 1024} kt)")
    print(f"{count} arkkia")


if __name__ == "__main__":
    main()
