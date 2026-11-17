"""Koostaa sivuston kaikki kieliversiot.

Sivut (PAGES) ja kielet (LANGS):
  etusivu  src/page.html   ->  /index.html, /fi/index.html, ...
  opas     src/guide.html  ->  /<opas-slug>/index.html, /fi/<opas-slug>/index.html, ...

Mallissa:
  {{avain.polku}}   HTML-turvallinen teksti kielitiedostosta i18n/<kieli>.json
  {{{avain}}}       sellaisenaan (koostimen tuottamat lohkot)
  {{> nimi}}        jaettu osa tiedostosta src/partials/<nimi>.html

Domain: site.config.json -> "domain". Tyhjänä linkit ovat suhteellisia eikä sitemapia tehdä.
Kun domain on asetettu, tulee canonical-linkit, täydet hreflang-osoitteet, og:image-osoite ja sitemap.xml.
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LANGS = ["en", "fi", "sv", "de", "fr", "es", "pt-BR"]  # sovelluksen kielet
DEFAULT = "en"
PAGES = [
    {"id": "home", "template": "page.html", "slug": None},
    {"id": "guide", "template": "guide.html", "slug": "guide.slug"},
]
PLACEHOLDER = re.compile(r"\{\{(\{?)\s*([\w.-]+)\s*\}?\}\}")
PARTIAL = re.compile(r"\{\{>\s*([\w-]+)\s*\}\}")
FRENCH_SPACE = re.compile(r" ([?!:;»])|(«) ")


def lookup(data, path):
    node = data
    for part in path.split("."):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node


def merge(base, override):
    """Täydentää käännöksen puuttuvat avaimet oletuskielestä."""
    out = dict(base)
    for key, value in override.items():
        out[key] = merge(base[key], value) if isinstance(value, dict) and isinstance(base.get(key), dict) else value
    return out


def typography(code, node):
    """Ranskassa ? ! : ; ja lainausmerkkien eteen kapea sitova välilyönti, jottei merkki rivity yksin."""
    if code != "fr":
        return node
    if isinstance(node, dict):
        return {k: typography(code, v) for k, v in node.items()}
    if isinstance(node, list):
        return [typography(code, v) for v in node]
    if isinstance(node, str):
        return FRENCH_SPACE.sub(lambda m: f" {m.group(1)}" if m.group(1) else f"{m.group(2)} ", node)
    return node


def missing_keys(base, other, prefix=""):
    for key, value in base.items():
        path = f"{prefix}{key}"
        if key not in other:
            yield path
        elif isinstance(value, dict) and isinstance(other[key], dict):
            yield from missing_keys(value, other[key], path + ".")


def lang_root(code):
    return "/" if code == DEFAULT else f"/{code.lower()}/"


def page_path(code, page, data):
    slug = lookup(data, page["slug"]) if page["slug"] else ""
    return lang_root(code) + (f"{slug}/" if slug else "")


def load_languages():
    raw = {}
    for code in LANGS:
        f = ROOT / "i18n" / f"{code}.json"
        if f.exists():
            raw[code] = json.loads(f.read_text(encoding="utf-8"))
            # Oppaan ja harjoitusarkkien tekstit ovat omassa tiedostossaan.
            g = ROOT / "i18n" / "guide" / f"{code}.json"
            if g.exists():
                raw[code] = merge(raw[code], json.loads(g.read_text(encoding="utf-8")))
    base = raw[DEFAULT]
    problems = 0
    data = {}
    for code, values in raw.items():
        for key in missing_keys(base, values):
            print(f"[{code}] puuttuu: {key} (käytetään englantia)")
            problems += 1
        data[code] = merge(base, typography(code, values))
    return data, problems


def json_ld(page, code, data, url, origin):
    meta = data["meta"]
    image = f"{origin}/assets/img/og-image.png"
    graph = []
    if page["id"] == "home":
        app = {
            "@type": "MobileApplication",
            "name": "Clocklings",
            "alternateName": meta["title"],
            "description": meta["description"],
            "operatingSystem": "Android 8.0+",
            "applicationCategory": "EducationalApplication",
            "inLanguage": [d["meta"]["htmlLang"] for d in ALL.values()],
            "image": image,
            "offers": {"@type": "Offer", "price": "6.99", "priceCurrency": "USD", "category": "one-time purchase"},
        }
        if url:
            app["url"] = url
        graph.append(app)
        faq = data["faq"]
        graph.append({
            "@type": "FAQPage",
            "inLanguage": meta["htmlLang"],
            "mainEntity": [
                {"@type": "Question", "name": faq[f"q{i}"], "acceptedAnswer": {"@type": "Answer", "text": faq[f"a{i}"]}}
                for i in range(1, 7)
            ],
        })
    else:
        article = {
            "@type": "Article",
            "headline": data["guide"]["h1"],
            "description": data["guide"]["description"],
            "inLanguage": meta["htmlLang"],
            "image": image,
            "author": {"@type": "Organization", "name": "Clocklings"},
            "publisher": {"@type": "Organization", "name": "Clocklings"},
            "datePublished": "2026-11-17",
        }
        if url:
            article["url"] = url
        graph.append(article)
    return json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False, indent=1).replace("</", "<\\/")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    global ALL
    config = json.loads((ROOT / "site.config.json").read_text(encoding="utf-8"))
    domain = config.get("domain", "").strip().rstrip("/")
    origin = f"https://{domain}" if domain and not domain.startswith("http") else domain
    ALL, problems = load_languages()
    langs = list(ALL)

    partials = {p.stem: p.read_text(encoding="utf-8") for p in (ROOT / "src" / "partials").glob("*.html")}
    suggest = {}
    for code in langs:
        meta = ALL[code]["meta"]
        suggest[code] = {"text": meta["suggestText"], "link": meta["suggestLink"],
                         "paths": {p["id"]: page_path(code, p, ALL[code]) for p in PAGES}}

    sitemap_rows = []
    for page in PAGES:
        template = (ROOT / "src" / page["template"]).read_text(encoding="utf-8")
        template = PARTIAL.sub(lambda m: partials[m.group(1)], template)
        paths = {code: page_path(code, page, ALL[code]) for code in langs}
        absolute = {code: f"{origin}{p}" for code, p in paths.items()}
        alternates = "\n".join(
            f'  <link rel="alternate" hreflang="{ALL[c]["meta"]["htmlLang"]}" href="{absolute[c]}">' for c in langs
        ) + f'\n  <link rel="alternate" hreflang="x-default" href="{absolute[DEFAULT]}">'

        for code in langs:
            data = dict(ALL[code])
            data["paths"] = {"home": lang_root(code), "guide": page_path(code, PAGES[1], ALL[code])}
            # Sivukohtaiset otsikko- ja kuvaustiedot head-osalle.
            source = data["meta"] if page["id"] == "home" else data["guide"]
            data["doc"] = {
                "title": source["title"],
                "description": source["description"],
                "ogDescription": source.get("ogDescription", source["description"]),
            }

            def links(indent, current=code):
                rows = []
                for c in langs:
                    meta = ALL[c]["meta"]
                    cur = ' aria-current="page"' if c == current else ""
                    rows.append(
                        f'{indent}<li><a href="{paths[c]}" hreflang="{meta["htmlLang"]}" lang="{meta["htmlLang"]}"'
                        f' data-lang-link="{c}"{cur}>{html.escape(meta["native"])}</a></li>'
                    )
                return "\n".join(rows)

            js = dict(data["js"])
            js.update({"lang": code, "locale": data["meta"]["htmlLang"], "page": page["id"], "suggest": suggest})
            url = absolute[code] if origin else ""
            extra = {
                "alternates": alternates,
                "canonical": f'  <link rel="canonical" href="{url}">' if url else "",
                "ogUrl": f'  <meta property="og:url" content="{url}">' if url else "",
                "ogImage": f"{origin}/assets/img/og-image.png",
                "jsonLd": json_ld(page, code, data, url, origin),
                "languageLinks": links("            "),
                "footerLanguageLinks": links("        "),
                "jsData": json.dumps(js, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/"),
            }

            def replace(match):
                nonlocal problems
                raw_mode, key = match.group(1) == "{", match.group(2)
                if key in extra:
                    return extra[key]
                value = lookup(data, key)
                if value is None or isinstance(value, (dict, list)):
                    print(f"[{code}] tuntematon avain mallissa {page['template']}: {key}")
                    problems += 1
                    return ""
                return str(value) if raw_mode else html.escape(str(value), quote=True)

            result = PLACEHOLDER.sub(replace, template)
            target = ROOT / paths[code].lstrip("/") / "index.html"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(result, encoding="utf-8", newline="\n")
            print(f"{code:6} {page['id']:6} -> {target.relative_to(ROOT)}")

        if origin:
            for code in langs:
                alts = "".join(
                    f'\n    <xhtml:link rel="alternate" hreflang="{ALL[c]["meta"]["htmlLang"]}" href="{absolute[c]}"/>'
                    for c in langs
                )
                sitemap_rows.append(f"  <url>\n    <loc>{absolute[code]}</loc>{alts}\n  </url>")

    robots = "User-agent: *\nAllow: /\n"
    sitemap_file = ROOT / "sitemap.xml"
    if origin:
        sitemap_file.write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
            + "\n".join(sitemap_rows) + "\n</urlset>\n",
            encoding="utf-8", newline="\n",
        )
        robots += f"\nSitemap: {origin}/sitemap.xml\n"
        print("sitemap.xml kirjoitettu")
    else:
        if sitemap_file.exists():
            sitemap_file.unlink()
        print("Domainia ei ole asetettu (site.config.json): sitemapia ja canonical-linkkejä ei tehty.")
    (ROOT / "robots.txt").write_text(robots, encoding="utf-8", newline="\n")

    if problems:
        print(f"{problems} huomautusta")
        if "--strict" in sys.argv:
            sys.exit(1)


ALL = {}

if __name__ == "__main__":
    main()
