# Génère la section « Les notions de ton cours » (onglets par matière + images du tableau de Nesa).
# Usage : python3 tools/notions.py   puis   python3 tools/make_en.py
# Écrit le fragment français dans index.html (entre les marqueurs NOTIONS) et le fragment
# anglais dans tools/notions_en.html, que make_en.py utilise.
import math, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
INK, MUTED, BLUE, VIOLET, GREEN, WARN, GRID = '#18223A', '#56617A', '#2E6BE6', '#5A45D6', '#23936A', '#B5560F', '#DFE6F3'
HAND = 'font-family="Caveat, cursive" font-weight="600"'
BODY = 'font-family="Atkinson Hyperlegible, system-ui, sans-serif"'

def f(n): return ('%.1f' % n).rstrip('0').rstrip('.')
def path(pts): return 'M' + 'L'.join(f(x) + ' ' + f(y) for x, y in pts)
def _plen(dash): return ' stroke-dasharray="%s"' % dash if dash else ' pathLength="1" class="ln"'
def line(x0, y0, x1, y1, c=INK, w=2.4, dash=None):
    return '<path d="M%s %sL%s %s" stroke="%s" stroke-width="%s" stroke-linecap="round" fill="none"%s/>' % (f(x0), f(y0), f(x1), f(y1), c, w, _plen(dash))
def curve(pts, c=BLUE, w=4, dash=None):
    return '<path d="%s" stroke="%s" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round" fill="none"%s/>' % (path(pts), c, w, _plen(dash))
def dot(x, y, c=BLUE, r=6, cls=''): return '<circle cx="%s" cy="%s" r="%s" fill="%s"%s/>' % (f(x), f(y), r, c, ' class="%s"' % cls if cls else '')
def hand(x, y, s, c=INK, size=22, anchor='start'):
    return '<text x="%s" y="%s" fill="%s" font-size="%s" text-anchor="%s" %s>%s</text>' % (f(x), f(y), c, size, anchor, HAND, s)
def small(x, y, s, c=MUTED, size=14, anchor='start'):
    return '<text x="%s" y="%s" fill="%s" font-size="%s" text-anchor="%s" %s>%s</text>' % (f(x), f(y), c, size, anchor, BODY, s)
def arrow(x0, y0, x1, y1, c=INK, w=3):
    a = math.atan2(y1 - y0, x1 - x0); h = 12
    p1 = (x1 - h * math.cos(a - .45), y1 - h * math.sin(a - .45)); p2 = (x1 - h * math.cos(a + .45), y1 - h * math.sin(a + .45))
    return line(x0, y0, x1, y1, c, w) + '<path class="hd" d="M%s %sL%s %sL%s %sZ" fill="%s"/>' % (f(x1), f(y1), f(p1[0]), f(p1[1]), f(p2[0]), f(p2[1]), c)
# Animation : chaque groupe a un type (dr = tracé qui se dessine, fd = apparition, pop = surgit, sl = glisse)
# et un départ t (secondes). Tout tient en moins de 5 secondes.
def W(inner, kind, t, d=None, sx=0, sy=0):
    st = '--t:%ss' % f(t)
    if d is not None: st += ';--d:%ss' % f(d)
    if kind == 'sl': st += ';--sx:%spx;--sy:%spx' % (f(sx), f(sy))
    return '<g class="a-%s" style="%s">%s</g>' % (kind, st, inner)
def notes(items, x=500, y=34, t=0):
    out = ''
    for i, (s, c) in enumerate(items):
        out += W(hand(x, y + i * 27, s, c, 21, 'end'), 'fd', t + i * 0.45)
    return out
def board(key, label, body):
    gid = 'gr-' + key
    return ('<svg class="board" viewBox="0 0 520 340" role="img" aria-label="%s">'
            '<defs><pattern id="%s" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="%s" stroke-width="1"/></pattern></defs>'
            '<rect width="520" height="340" fill="#fff"/><rect width="520" height="340" fill="url(#%s)"/>%s</svg>') % (label, gid, GRID, gid, body)

# ---------- 1. Fonctions ----------
def svg_fonctions(L):
    X = lambda x: 70 + 72 * x; Y = lambda y: 240 - 46 * y
    b = W(line(X(-0.6), Y(0), X(5.6), Y(0)) + line(X(0), Y(-1.8), X(0), Y(4.3)), 'dr', 0, .6)
    b += W(small(X(5.6) - 4, Y(0) + 20, 'x', anchor='end') + small(X(0) + 8, Y(4.3) + 10, 'y'), 'fd', .4)
    fx = lambda x: -(x - 2) ** 2 + 3
    b += W(curve([(X(x), Y(fx(x))) for x in [i / 20 for i in range(-6, 92)] if fx(x) > -1.9]), 'dr', .6, 1.4)
    b += W(line(X(2), Y(3.6), X(2), Y(-1.7), VIOLET, 2, '6 6'), 'fd', 2.0)
    b += W('<circle cx="%s" cy="%s" r="12" fill="none" stroke="%s" stroke-width="2.5"/>' % (f(X(2)), f(Y(3)), VIOLET) + dot(X(2), Y(3), VIOLET, 6), 'pop', 2.2)
    b += W(hand(X(2) + 16, Y(3) - 10, L['sommet'] + ' (2, 3)', VIOLET), 'fd', 2.4)
    for i, (z, s) in enumerate(((2 - 3 ** .5, '0,27' if L['fr'] else '0.27'), (2 + 3 ** .5, '3,73' if L['fr'] else '3.73'))):
        b += W(dot(X(z), Y(0), GREEN, 7), 'pop', 3.0 + i * .35) + W(hand(X(z) + 8, Y(0) + 26, s, GREEN), 'fd', 3.1 + i * .35)
    b += notes([('f(x) = −(x − 2)² + 3', VIOLET), ('x = 2 ± √3', INK)], t=.3)
    return board('fonctions', L['a_fonctions'], b)

# ---------- 2. Algèbre ----------
def svg_algebre(L):
    b = W('<rect x="70" y="105" width="360" height="180" rx="8" fill="#EEEAFF" stroke="%s" stroke-width="2.4"/>' % INK, 'fd', 0)
    b += W(line(310, 105, 310, 285, VIOLET) + line(70, 225, 430, 225, VIOLET), 'dr', .5, .8)
    for x, y, label in [(190, 90, 'x'), (370, 90, '3'), (48, 170, 'x'), (48, 263, '2')]:
        b += W(hand(x, y, label, INK, 25, 'middle'), 'fd', .3)
    for i, (x, y, label) in enumerate([(190, 170, 'x²'), (370, 170, '3x'), (190, 263, '2x'), (370, 263, '6')]):
        b += W(hand(x, y, label, BLUE, 29, 'middle'), 'pop', 1 + i * .5)
    b += notes([('(x + 2)(x + 3)', VIOLET), ('= x² + 5x + 6', INK)], t=3)
    return board('algebre', L['a_algebre'], b)

# ---------- 3. Géométrie et trigonométrie ----------
def svg_geometrie(L):
    b = W(curve([(90, 275), (410, 275), (410, 95), (90, 275)], INK, 3), 'dr', 0, 1.3)
    b += W(line(392, 275, 392, 257, MUTED) + line(392, 257, 410, 257, MUTED), 'fd', 1.3)
    for x, y, label in [(250, 305, '4'), (435, 192, '3'), (235, 165, '5')]:
        b += W(hand(x, y, label, BLUE, 28, 'middle'), 'pop', 1.6)
    b += W('<path d="M142 275 A52 52 0 0 0 135.3 249.5" fill="none" stroke="%s" stroke-width="2.4"/>' % VIOLET + hand(155, 260, 'θ', VIOLET, 25), 'dr', 2, .7)
    b += notes([('sin θ = 3/5', VIOLET), ('cos θ = 4/5', BLUE)], t=3)
    return board('geometrie', L['a_geometrie'], b)

# ---------- 4. Statistiques ----------
def svg_statistiques(L):
    b = W(line(80, 285, 460, 285) + line(80, 285, 80, 85), 'dr', 0, .6)
    for i, (label, count) in enumerate([('60', 2), ('70', 5), ('80', 3)]):
        x, h = 125 + 105 * i, 30 * count
        b += W('<rect x="%s" y="%s" width="60" height="%s" rx="5" fill="%s"/>' % (x, 285-h, h, BLUE), 'pop', .7 + .5*i)
        b += W(small(x+30, 308, label, anchor='middle') + hand(x+30, 273-h, str(count), VIOLET, 24, 'middle'), 'fd', 1 + .5*i)
    b += W(small(90, 65, L['effectif'], INK, 16), 'fd', .4)
    b += notes([(L['moyenne'] + ' = 71', VIOLET), (L['mediane'] + ' = 70', INK)], t=3)
    return board('statistiques', L['a_statistiques'], b)

LANG = {
 'fr': dict(fr=True, sommet='sommet', effectif='Effectif', moyenne='Moyenne', mediane='Médiane',
           a_fonctions='Tableau de Nesa : parabole, sommet et zéros',
           a_algebre='Tableau de Nesa : factorisation et modèle des aires',
           a_geometrie='Tableau de Nesa : triangle rectangle et rapports trigonométriques',
           a_statistiques='Tableau de Nesa : diagramme à bandes, moyenne et médiane'),
 'en': dict(fr=False, sommet='vertex', effectif='Frequency', moyenne='Mean', mediane='Median',
           a_fonctions="Nesa's board: parabola, vertex and zeros",
           a_algebre="Nesa's board: factoring and area model",
           a_geometrie="Nesa's board: right triangle and trigonometric ratios",
           a_statistiques="Nesa's board: bar chart, mean and median"),
}

TABS = [
 ('fonctions', svg_fonctions,
  dict(fr=('Fonctions', 'Maths · secondaire 4 et 5 · selon ta séquence', 'Nesa trace la courbe, place le sommet et te fait trouver les zéros.',
           ['Fonction quadratique', 'Exponentielle et logarithme', 'Fonctions trigonométriques', 'Fonctions en escalier et périodiques']),
       en=('Functions', 'Math · Secondary 4 and 5 · for your course sequence', 'Nesa draws the curve, marks the vertex and has you find the zeros.',
           ['Quadratic functions', 'Exponentials and logarithms', 'Trigonometric functions', 'Step and periodic functions']))),
 ('algebre', svg_algebre,
  dict(fr=('Algèbre', 'Maths · secondaire 4 et 5 · CST, TS, SN', 'Nesa décompose les expressions et te guide pour résoudre ton équation.',
           ['Factorisation', 'Équations du second degré', 'Inéquations', "Systèmes d'équations"]),
       en=('Algebra', 'Math · Secondary 4 and 5 · CST, TS, SN', 'Nesa breaks down expressions and guides you through solving your equation.',
           ['Factoring', 'Quadratic equations', 'Inequalities', 'Systems of equations']))),
 ('geometrie', svg_geometrie,
  dict(fr=('Géométrie', 'Maths · secondaire 4 et 5 · selon ta séquence', 'Nesa dessine la figure et te fait choisir la bonne relation.',
           ['Géométrie analytique', 'Trigonométrie', 'Loi des sinus et des cosinus', 'Triangles et relations métriques']),
       en=('Geometry', 'Math · Secondary 4 and 5 · for your course sequence', 'Nesa draws the figure and helps you choose the right relationship.',
           ['Analytic geometry', 'Trigonometry', 'Law of sines and cosines', 'Triangles and metric relations']))),
 ('statistiques', svg_statistiques,
  dict(fr=('Statistiques', 'Maths · secondaire 4 et 5 · selon ta séquence', 'Nesa représente les données pour t’aider à les interpréter.',
           ['Moyenne et médiane', 'Mesures de dispersion', 'Probabilités', 'Interprétation de données']),
       en=('Statistics', 'Math · Secondary 4 and 5 · for your course sequence', 'Nesa displays the data to help you interpret it.',
           ['Mean and median', 'Measures of spread', 'Probability', 'Data interpretation']))),
]

TXT = {
 'fr': dict(h2='Les notions de ton cours de maths', intro='Des notions de secondaire 4 et 5, selon ta séquence CST, TS ou SN. Choisis une catégorie.',
            tablist='Notions de mathématiques', missing='Ta notion n’est pas là ? <a href="https://app.nesalio.com/" data-track="essayer_notion_manquante">Pose ta question au tuteur</a>.'),
 'en': dict(h2='The concepts in your math course', intro='Secondary 4 and 5 concepts, for your CST, TS or SN course sequence. Pick a category.',
            tablist='Math concepts', missing='Your concept is not here? <a href="https://app.nesalio.com/" data-track="essayer_notion_manquante">Ask the tutor your question</a>.'),
}

def section(lang):
    L, T = LANG[lang], TXT[lang]
    tabs, panels = '', ''
    for i, (key, fn, data) in enumerate(TABS):
        title, level, cap, chips = data[lang]
        sel = 'true' if i == 0 else 'false'
        tabs += '<button type="button" role="tab" id="tab-%s" aria-controls="pan-%s" aria-selected="%s" data-subj="%s"%s>%s</button>' % (key, key, sel, key, '' if i == 0 else ' tabindex="-1"', title)
        panels += ('\n        <div class="subj-panel" role="tabpanel" id="pan-%s" aria-labelledby="tab-%s"%s>'
                   '<div class="board-wrap">%s</div>'
                   '<div class="subj-text"><p class="subj-level">%s</p><h3>%s</h3><p class="subj-cap">%s</p><div class="nchips">%s</div></div></div>') % (
            key, key, '' if i == 0 else ' hidden', fn(L), level, title, cap, ''.join('<span>%s</span>' % c for c in chips))
    return ('<!-- NOTIONS:START -->\n'
            '  <section class="notions2 grid-paper" id="notions" aria-labelledby="t-notions">\n    <div class="wrap">\n'
            '      <h2 id="t-notions" class="squig">%s</h2>\n      <p class="intro">%s</p>\n'
            '      <div class="subj-tabs" role="tablist" aria-label="%s">%s</div>\n'
            '      <div class="subj-panels">%s\n      </div>\n'
            '      <p class="missing">%s</p>\n    </div>\n  </section>\n'
            '<!-- NOTIONS:END -->') % (T['h2'], T['intro'], T['tablist'], tabs, panels, T['missing'])

fr, en = section('fr'), section('en')
idx = ROOT / 'index.html'
s = idx.read_text(encoding='utf-8')
if '<!-- NOTIONS:START -->' in s:
    a = s.index('<!-- NOTIONS:START -->'); b = s.index('<!-- NOTIONS:END -->') + len('<!-- NOTIONS:END -->')
else:
    a = s.index('  <section class="notions2 grid-paper" id="notions"'); b = s.index('  </section>', a) + len('  </section>')
s = s[:a] + fr + s[b:]
idx.write_text(s, encoding='utf-8')
(ROOT / 'tools' / 'notions_en.html').write_text(en, encoding='utf-8')
(ROOT / 'tools' / 'notions_fr.html').write_text(fr, encoding='utf-8')
print('section notions écrite (fr + en)')
