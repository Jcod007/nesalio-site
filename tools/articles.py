# Génère la section Articles : articles/index.html et une page par article.
# Usage : python3 tools/articles.py   (le contenu est dans tools/articles_content.py)
import html, json, pathlib, re, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from articles_content import ARTICLES

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'articles'; OUT.mkdir(exist_ok=True)
DATE, DATE_TXT, AUTHOR = '2026-10-14', '14 octobre 2026', 'Etonam Ekoue'
LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3 28 10 16 17 4 10Z" fill="#5A45D6"/><path d="M4 10 16 17v12L4 22Z" fill="#2E6BE6"/><path d="M28 10 16 17v12l12-7Z" fill="#23936A"/></svg>'

CSS = """
:root{--paper:#F6F8FC;--grid:#DFE6F3;--ink:#18223A;--muted:#56617A;--violet:#5A45D6;--violet-deep:#4532B8;--violet-soft:#EEEAFF;--line:#D5DCEA;--sheet:#fff;--night:#16203A;
--display:"Bricolage Grotesque",system-ui,sans-serif;--body:"Atkinson Hyperlegible",system-ui,sans-serif;--hand:"Caveat",cursive}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--body);font-size:1.0625rem;line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:var(--violet-deep)}
.wrap{max-width:1320px;margin:0 auto;padding:0 32px}
.nav{position:sticky;top:0;z-index:5;background:rgba(246,248,252,.94);backdrop-filter:blur(6px);border-bottom:1px solid var(--line)}
.nav .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;height:68px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--ink);font-family:var(--display);font-weight:800;font-size:1.4rem}
.brand svg{width:30px;height:30px;flex:none}
.nav-links{display:flex;align-items:center;gap:22px}
.nav-links a.txt{color:var(--ink);text-decoration:none;font-weight:700}
.cta{display:inline-flex;align-items:center;justify-content:center;background:var(--violet);color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:14px;box-shadow:0 5px 0 #33248C}
.cta:active{transform:translateY(4px);box-shadow:0 1px 0 #33248C}
.cta.small{padding:9px 16px;font-size:.96rem;white-space:nowrap}
main{padding:56px 0 80px}
.col{max-width:720px;margin:0 auto;padding:0 20px}
.kicker{font-family:var(--hand);font-size:1.6rem;color:var(--violet);margin:0 0 6px;line-height:1.1}
h1{font-family:var(--display);font-weight:800;font-size:clamp(2rem,4.4vw,2.9rem);line-height:1.08;letter-spacing:-.02em;margin:0 0 14px}
.meta{color:var(--muted);font-size:.95rem;margin:0 0 30px}
.lead{font-size:1.2rem;line-height:1.6;color:var(--ink)}
article h2{font-family:var(--display);font-size:1.5rem;line-height:1.2;margin:38px 0 10px}
article p,article li{font-size:1.1rem;line-height:1.7}
article ul,article ol{padding-left:1.3em}
article li{margin-bottom:8px}
.cta-box{margin:44px 0 0;background:#fff;border:2px solid var(--ink);border-radius:24px;padding:26px;box-shadow:6px 6px 0 var(--violet)}
.cta-box p{margin:0 0 16px}
.cta-box strong{font-family:var(--display);font-size:1.35rem;display:block;margin-bottom:6px}
.sources{margin:44px 0 0;padding-top:22px;border-top:1px solid var(--line)}
.sources h2{font-size:1.15rem;margin:0 0 10px}
.sources ol{padding-left:1.2em;margin:0}
.sources li{font-size:.95rem;line-height:1.5;color:var(--muted);margin-bottom:10px;word-break:break-word}
.more{margin:48px 0 0}
.more h2{font-family:var(--display);font-size:1.3rem;margin:0 0 14px}
.cards{display:grid;gap:18px}
.card{display:block;text-decoration:none;color:var(--ink);background:#fff;border:2px solid var(--ink);border-radius:22px;padding:22px 24px;box-shadow:0 5px 0 var(--ink);transition:transform .08s,box-shadow .08s}
.card:hover{background:#FBFAFF}
.card:active{transform:translateY(4px);box-shadow:0 1px 0 var(--ink)}
.card .k{font-family:var(--hand);font-size:1.35rem;color:var(--violet);line-height:1}
.card h3{font-family:var(--display);font-size:1.35rem;line-height:1.2;margin:6px 0 8px}
.card p{margin:0;color:var(--muted)}
.card .r{display:block;margin-top:10px;font-weight:700;color:var(--violet-deep);font-size:.95rem}
.intro{color:var(--muted);font-size:1.15rem;margin:0 0 34px}
footer{border-top:1px solid var(--line);padding:26px 0;color:var(--muted);font-size:.95rem}
footer .wrap{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
@media (max-width:560px){.wrap{padding:0 16px}.nav-links a.txt{display:none}main{padding:36px 0 60px}.cta-box{padding:20px}}
"""

def head(title, desc, url, kind, extra_ld):
    ld = json.dumps(extra_ld, ensure_ascii=False, indent=1)
    return f"""<!doctype html>
<html lang="fr-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<link rel="canonical" href="{url}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta property="og:type" content="{kind}">
<meta property="og:site_name" content="Nesalio">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:image" content="https://nesalio.com/og-image.png">
<meta property="og:locale" content="fr_CA">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#18223A">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Caveat:wght@600&display=swap" rel="stylesheet">
<script type="application/ld+json">
{ld}
</script>
<style>{CSS}</style>
</head>
<body>
<header class="nav"><div class="wrap">
  <a class="brand" href="/" aria-label="Nesalio, accueil">{LOGO}Nesalio</a>
  <nav class="nav-links" aria-label="Navigation"><a class="txt" href="/articles">Articles</a><a class="cta small" href="/?src={{SRC}}#inscription">Réserver une démo</a></nav>
</div></header>
"""

FOOT = """<footer><div class="wrap"><span>© 2026 Nesalio, Montréal</span><span><a href="/articles">Articles</a> &nbsp; <a href="/confidentialite">Confidentialité</a> &nbsp; <a href="mailto:contact@nesalio.com">contact@nesalio.com</a></span></div></footer>
</body>
</html>
"""

def card(a):
    return (f'<a class="card" href="/articles/{a["slug"]}"><span class="k">{a["kicker"]}</span>'
            f'<h3>{a["title"]}</h3><p>{a["desc"]}</p><span class="r">Lire · {a["read"]} min</span></a>')

ORG = {"@type": "Organization", "name": "Nesalio", "url": "https://nesalio.com/", "logo": "https://nesalio.com/icon-512.png"}

for a in ARTICLES:
    url = f'https://nesalio.com/articles/{a["slug"]}'
    ld = {"@context": "https://schema.org", "@type": "Article", "headline": a['title'], "description": a['desc'],
          "datePublished": DATE, "dateModified": DATE, "inLanguage": "fr-CA", "mainEntityOfPage": url,
          "author": {"@type": "Person", "name": AUTHOR}, "publisher": ORG, "image": "https://nesalio.com/og-image.png",
          "citation": [re.sub(r'<[^>]+>', '', s) for s, _ in a['sources']]}
    src_items = ''.join('<li>%s%s</li>' % (s, (' <a href="%s" rel="noopener">%s</a>' % (u, html.escape(u))) if u else '') for s, u in a['sources'])
    others = ''.join(card(o) for o in ARTICLES if o is not a)
    page = head(a['title'] + ' | Nesalio', a['desc'], url, 'article', ld).replace('{SRC}', 'article-' + a['slug'])
    page += f"""<main><div class="col">
<article>
  <p class="kicker">{a['kicker']}</p>
  <h1>{a['title']}</h1>
  <p class="meta">Par {AUTHOR} · {DATE_TXT} · {a['read']} min de lecture</p>
  {a['body'].strip()}
  <div class="cta-box"><strong>Essaie Nesalio sur ta notion</strong><p>Une démo de 15 minutes en ligne, gratuite et sans engagement. Tu choisis la notion qui te bloque, Nesalio te l'explique en dessinant.</p><a class="cta" href="/?src=article-{a['slug']}#inscription">Réserver une démo</a></div>
  <section class="sources" aria-labelledby="src-h"><h2 id="src-h">Sources</h2><ol>{src_items}</ol></section>
</article>
<section class="more" aria-labelledby="more-h"><h2 id="more-h">À lire aussi</h2><div class="cards">{others}</div></section>
</div></main>
""" + FOOT
    (OUT / f'{a["slug"]}.html').write_text(page, encoding='utf-8')

# page d'accueil des articles
url = 'https://nesalio.com/articles'
ld = {"@context": "https://schema.org", "@type": "Blog", "name": "Articles Nesalio", "url": url, "inLanguage": "fr-CA", "publisher": ORG,
      "blogPost": [{"@type": "BlogPosting", "headline": a['title'], "url": f'https://nesalio.com/articles/{a["slug"]}', "datePublished": DATE} for a in ARTICLES]}
desc = "Des articles courts, basés sur la recherche, pour aider les élèves du secondaire et du cégep à mieux apprendre, et les parents à les accompagner."
page = head('Articles | Nesalio', desc, url, 'website', ld).replace('{SRC}', 'articles')
page += f"""<main><div class="col">
  <p class="kicker">Apprendre mieux</p>
  <h1>Articles</h1>
  <p class="intro">Des articles courts, appuyés sur la recherche, pour aider les élèves à mieux apprendre et les parents à les accompagner. Chaque chiffre est sourcé.</p>
  <div class="cards">{''.join(card(a) for a in ARTICLES)}</div>
</div></main>
""" + FOOT
(OUT / 'index.html').write_text(page, encoding='utf-8')
print('articles écrits :', ', '.join(a['slug'] for a in ARTICLES))
