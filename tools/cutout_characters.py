"""Leikkaa Clocklings-hahmot gallerian renderöinneistä läpinäkyviksi WebP-kuviksi.

Lähdekuvissa tausta on tasainen #FFF5FA. Taustaan yhteydessä olevat pikselit
(myös pehmeä varjo) erotetaan taustaväristä, jolloin reunat ja varjo saavat
osittaisen läpinäkyvyyden. Hahmon sisäosat säilyvät läpinäkymättöminä.

Käyttö: python tools/cutout_characters.py <illustrations-kansio> <tulos-kansio>
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

BG = np.array([255, 245, 250], dtype=np.float32)
FG_THRESHOLD = 28      # tätä kauempana taustasta = hahmoa (segmentointiin)
SHADOW_THRESHOLD = 75  # taustan ja varjon suurin etäisyys taustaväristä
TARGET_HEIGHT = 720

# (lähdetiedosto, blobin indeksi lukujärjestyksessä, tulosnimi)
PICKS = [
    ("doll", 0, "doll"),
    ("doll", 1, "doll-overalls"),
    ("doll", 2, "doll-fairy"),
    ("cat", 0, "cat"),
    ("cat", 1, "cat-blue"),
    ("dog", 0, "dog"),
    ("robot", 0, "robot"),
    ("robot", 1, "robot-hero"),
    ("dragon", 0, "dragon"),
    ("dinosaur", 0, "dinosaur"),
    ("dinosaur", 1, "dinosaur-blue"),
    ("bunny", 0, "bunny"),
    ("unicorn", 1, "unicorn"),
    ("car", 0, "car"),
]


def spans(profile, min_gap=24, min_len=40):
    """Palauttaa (alku, loppu) -välit, joissa profiili on tosi, yhdistäen lyhyet aukot."""
    out, start, gap = [], None, 0
    for i, v in enumerate(profile):
        if v:
            if start is None:
                start = i
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                end = i - gap + 1
                if end - start >= min_len:
                    out.append((start, end))
                start, gap = None, 0
    if start is not None and len(profile) - start >= min_len:
        out.append((start, len(profile)))
    return out


def blobs(fg):
    """XY-leikkaus: rivikaistat, sitten sarakkeet kaistan sisällä."""
    found = []
    for y0, y1 in spans(fg.any(axis=1)):
        band = fg[y0:y1]
        for x0, x1 in spans(band.any(axis=0)):
            rows = np.where(band[:, x0:x1].any(axis=1))[0]
            found.append((x0, y0 + rows[0], x1, y0 + rows[-1] + 1))
    # suodatetaan pienet esikatselukuvat (robotin minihahmot)
    big = max((b[3] - b[1]) for b in found)
    return [b for b in found if (b[3] - b[1]) > big * 0.6]


def cutout(img, box, pad=40):
    w, h = img.size
    x0, y0, x1, y1 = box
    crop = img.crop((max(0, x0 - pad), max(0, y0 - pad), min(w, x1 + pad), min(h, y1 + pad + 30)))
    rgb = np.asarray(crop, dtype=np.float32)
    dist = np.sqrt(((rgb - BG) ** 2).sum(axis=2))

    # Taustaan kuuluva alue: taustan sävyiset pikselit (myös violetinharmaa varjo),
    # jotka ovat yhteydessä kuvan reunaan. Lämpimät valkoiset (kengät, kaulukset)
    # rajautuvat pois, koska niissä sininen kanava on suhteessa punaista heikompi.
    ratio = rgb / BG
    bg_like = (dist < SHADOW_THRESHOLD) & (ratio[..., 2] >= ratio[..., 0] - 0.015)
    labels, _ = ndimage.label(bg_like)
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    region = np.isin(labels, edge[edge > 0])
    # suljetut taustataskut (esim. hännän ja vartalon väli) ovat lähes tarkalleen taustaväriä
    pockets, count = ndimage.label(dist < 6)
    sizes = ndimage.sum(np.ones_like(dist), pockets, range(1, count + 1))
    region |= np.isin(pockets, np.where(sizes > 20)[0] + 1)
    band = ndimage.binary_dilation(region, iterations=2)

    # värin erotus taustasta: alpha = suurin suhteellinen poikkeama taustasta
    diff = np.clip(BG - rgb, 0, None) / BG
    alpha_unmix = np.clip(diff.max(axis=2) * 1.0, 0, 1)
    # vaaleammat kanavat (esim. sininen yli taustan) eivät ole mahdollisia valkoista taustaa vasten
    over = np.clip(rgb - BG, 0, None) / np.maximum(255 - BG, 1)
    alpha_unmix = np.maximum(alpha_unmix, np.clip(over.max(axis=2), 0, 1))
    alpha = np.where(band, alpha_unmix, 1.0)
    a = np.maximum(alpha, 1e-4)[..., None]
    color = np.clip((rgb - (1 - a) * BG) / a, 0, 255)
    rgba = np.dstack([color, alpha * 255]).astype(np.uint8)
    out = Image.fromarray(rgba, "RGBA")
    out = out.crop(out.getbbox())
    scale = TARGET_HEIGHT / out.height
    if scale < 1:
        out = out.resize((round(out.width * scale), TARGET_HEIGHT), Image.LANCZOS)
    return out


def main(src, dst):
    src, dst = Path(src), Path(dst)
    dst.mkdir(parents=True, exist_ok=True)
    cache = {}
    for name, idx, out_name in PICKS:
        if name not in cache:
            img = Image.open(src / f"{name}-large.png").convert("RGB")
            rgb = np.asarray(img, dtype=np.float32)
            fg = np.sqrt(((rgb - BG) ** 2).sum(axis=2)) > FG_THRESHOLD
            cache[name] = (img, blobs(fg))
        img, found = cache[name]
        result = cutout(img, found[idx])
        result.save(dst / f"{out_name}.webp", "WEBP", quality=88, method=6)
        print(out_name, result.size, f"({len(found)} blobs in {name})")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
