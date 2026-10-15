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
def line(x0, y0, x1, y1, c=INK, w=2.4, dash=None):
    d = ' stroke-dasharray="%s"' % dash if dash else ''
    return '<path d="M%s %sL%s %s" stroke="%s" stroke-width="%s" stroke-linecap="round" fill="none"%s/>' % (f(x0), f(y0), f(x1), f(y1), c, w, d)
def curve(pts, c=BLUE, w=4, dash=None):
    d = ' stroke-dasharray="%s"' % dash if dash else ''
    return '<path d="%s" stroke="%s" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round" fill="none"%s/>' % (path(pts), c, w, d)
def dot(x, y, c=BLUE, r=6): return '<circle cx="%s" cy="%s" r="%s" fill="%s"/>' % (f(x), f(y), r, c)
def hand(x, y, s, c=INK, size=22, anchor='start'):
    return '<text x="%s" y="%s" fill="%s" font-size="%s" text-anchor="%s" %s>%s</text>' % (f(x), f(y), c, size, anchor, HAND, s)
def small(x, y, s, c=MUTED, size=14, anchor='start'):
    return '<text x="%s" y="%s" fill="%s" font-size="%s" text-anchor="%s" %s>%s</text>' % (f(x), f(y), c, size, anchor, BODY, s)
def arrow(x0, y0, x1, y1, c=INK, w=3):
    a = math.atan2(y1 - y0, x1 - x0); h = 12
    p1 = (x1 - h * math.cos(a - .45), y1 - h * math.sin(a - .45)); p2 = (x1 - h * math.cos(a + .45), y1 - h * math.sin(a + .45))
    return line(x0, y0, x1, y1, c, w) + '<path d="M%s %sL%s %sL%s %sZ" fill="%s"/>' % (f(x1), f(y1), f(p1[0]), f(p1[1]), f(p2[0]), f(p2[1]), c)
def notes(items, x=500, y=34):
    out = ''
    for i, (s, c) in enumerate(items):
        out += hand(x, y + i * 27, s, c, 21, 'end')
    return out
def board(key, label, body):
    gid = 'gr-' + key
    return ('<svg class="board" viewBox="0 0 520 340" role="img" aria-label="%s">'
            '<defs><pattern id="%s" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="%s" stroke-width="1"/></pattern></defs>'
            '<rect width="520" height="340" fill="#fff"/><rect width="520" height="340" fill="url(#%s)"/>%s</svg>') % (label, gid, GRID, gid, body)

# ---------- 1. Fonctions ----------
def svg_fonctions(L):
    X = lambda x: 70 + 72 * x; Y = lambda y: 240 - 46 * y
    b = line(X(-0.6), Y(0), X(5.6), Y(0)) + line(X(0), Y(-1.8), X(0), Y(4.3))
    b += small(X(5.6) - 4, Y(0) + 20, 'x', anchor='end') + small(X(0) + 8, Y(4.3) + 10, 'y')
    fx = lambda x: -(x - 2) ** 2 + 3
    b += curve([(X(x), Y(fx(x))) for x in [i / 20 for i in range(-6, 92)] if fx(x) > -1.9])
    b += line(X(2), Y(3.6), X(2), Y(-1.7), VIOLET, 2, '6 6')
    b += '<circle cx="%s" cy="%s" r="12" fill="none" stroke="%s" stroke-width="2.5"/>' % (f(X(2)), f(Y(3)), VIOLET) + dot(X(2), Y(3), VIOLET, 6)
    b += hand(X(2) + 16, Y(3) - 10, L['sommet'] + ' (2, 3)', VIOLET)
    for z, s in ((2 - 3 ** .5, '0,27' if L['fr'] else '0.27'), (2 + 3 ** .5, '3,73' if L['fr'] else '3.73')):
        b += dot(X(z), Y(0), GREEN, 7) + hand(X(z) + 8, Y(0) + 26, s, GREEN)
    b += notes([('f(x) = −(x − 2)² + 3', VIOLET), ('x = 2 ± √3', INK)])
    return board('fonctions', L['a_fonctions'], b)

# ---------- 2. Calcul ----------
def svg_calcul(L):
    X = lambda x: 70 + 120 * x; Y = lambda y: 300 - 25 * y
    b = line(X(-0.3), Y(0), X(3.6), Y(0)) + line(X(0), Y(-0.4), X(0), Y(10.8))
    b += small(X(3.6) - 4, Y(0) + 20, 'x', anchor='end') + small(X(0) + 8, Y(10.8) + 10, 'y')
    area = [(X(1), Y(0))] + [(X(x), Y(x * x)) for x in [1 + i / 20 for i in range(21)]] + [(X(2), Y(0))]
    b += '<path d="%sZ" fill="#EEEAFF" stroke="none"/>' % path(area)
    b += curve([(X(x), Y(x * x)) for x in [i / 20 for i in range(0, 56)]])
    b += curve([(X(x), Y(2 * x - 1)) for x in (0.25, 2.75)], WARN, 3)
    b += dot(X(1), Y(1), WARN, 7) + hand(X(1) - 64, Y(1) - 12, 'P(1, 1)', WARN)
    b += hand(X(2.8), Y(2 * 2.75 - 1) + 6, L['tangente'], WARN)
    b += hand(X(1.32), Y(0.6), L['aire'], VIOLET)
    b += notes([('f(x) = x²', VIOLET), ('f′(1) = 2', WARN), ('∫₁² x² dx = 7/3', VIOLET)])
    return board('calcul', L['a_calcul'], b)

# ---------- 3. Mécanique (plan incliné) ----------
def svg_meca(L):
    A = (50, 300); B = (430, 300); C = (430, 120)
    a = math.atan2(B[1] - C[1], B[0] - A[0])  # angle de la pente
    b = '<path d="M%s %sL%s %sL%s %sZ" fill="#F6F8FC" stroke="%s" stroke-width="2.4" stroke-linejoin="round"/>' % (A[0], A[1], B[0], B[1], C[0], C[1], INK)
    b += '<path d="M%s %s A 46 46 0 0 0 %s %s" fill="none" stroke="%s" stroke-width="2"/>' % (f(A[0] + 46), A[1], f(A[0] + 46 * math.cos(a)), f(A[1] - 46 * math.sin(a)), INK) + hand(A[0] + 54, A[1] - 8, 'θ', INK)
    d = 225; ux, uy = math.cos(a), -math.sin(a); nx, ny = -math.sin(a), -math.cos(a)
    cx, cy = A[0] + d * ux + 30 * nx, A[1] + d * uy + 30 * ny
    b += '<rect x="%s" y="%s" width="72" height="60" rx="6" fill="%s" stroke="%s" stroke-width="2.4" transform="rotate(%s %s %s)"/>' % (f(cx - 36), f(cy - 30), '#EEEAFF', INK, f(-math.degrees(a)), f(cx), f(cy))
    g = 92
    b += arrow(cx, cy, cx, cy + g, INK, 3.2) + hand(cx - 8, cy + g - 4, L['poids'], INK, 21, 'end')
    # composantes du poids : le long de la pente (vers le bas) et vers la pente
    b += line(cx, cy, cx - g * math.sin(a) * ux, cy - g * math.sin(a) * uy, MUTED, 2, '5 5')
    b += line(cx, cy, cx - g * math.cos(a) * nx, cy - g * math.cos(a) * ny, MUTED, 2, '5 5')
    N = 105
    b += arrow(cx, cy, cx + N * nx, cy + N * ny, BLUE, 3.2) + hand(cx + N * nx - 6, cy + N * ny - 10, L['normale'], BLUE, 21, 'end')
    fr = 70
    b += arrow(cx + 36 * ux, cy + 36 * uy, cx + (36 + fr) * ux, cy + (36 + fr) * uy, WARN, 3.2) + hand(cx + (36 + fr) * ux + 6, cy + (36 + fr) * uy - 8, L['frottement'], WARN)
    b += notes([('ΣF = m a', VIOLET), ('mg sin θ − f = m a', INK)], 500, 30)
    return board('meca', L['a_meca'], b)

# ---------- 4. Électricité ----------
def svg_elec(L):
    x0, y0, x1, y1 = 90, 90, 410, 270
    b = ''
    # fils
    b += line(x0, y0, 190, y0, INK, 3) + line(290, y0, x1, y0, INK, 3) + line(x1, y0, x1, 140, INK, 3) + line(x1, 220, x1, y1, INK, 3)
    b += line(x1, y1, x0, y1, INK, 3) + line(x0, y1, x0, 200, INK, 3) + line(x0, 160, x0, y0, INK, 3)
    # pile
    b += line(x0 - 22, 160, x0 + 22, 160, INK, 4) + line(x0 - 12, 200, x0 + 12, 200, INK, 6)
    b += hand(x0 + 28, 188, 'U = 12 V', VIOLET, 22)
    # résistances (zigzag)
    zz = [(190, y0)] + [(200 + 10 * i, y0 + (-12 if i % 2 == 0 else 12)) for i in range(9)] + [(290, y0)]
    b += curve(zz, INK, 3) + hand(240, y0 - 22, 'R₁ = 4 Ω', INK, 22, 'middle')
    zz2 = [(x1, 140)] + [(x1 + (-12 if i % 2 == 0 else 12), 148 + 8 * i) for i in range(9)] + [(x1, 220)]
    b += curve(zz2, INK, 3) + hand(x1 + 22, 186, 'R₂ = 2 Ω', INK)
    # ampèremètre
    b += '<circle cx="250" cy="%s" r="18" fill="#fff" stroke="%s" stroke-width="3"/>' % (y1, INK) + small(250, y1 + 5, 'A', INK, 16, 'middle')
    # courant
    b += arrow(130, y0 - 14, 170, y0 - 14, WARN, 2.6) + arrow(x1 - 70, y1 + 16, x1 - 110, y1 + 16, WARN, 2.6)
    b += hand(150, y0 - 24, 'I', WARN, 24, 'middle')
    b += hand(250, y1 + 50, 'I = 2 A', WARN, 22, 'middle')
    b += notes([('Réq = R₁ + R₂ = 6 Ω' if L['fr'] else 'Req = R₁ + R₂ = 6 Ω', VIOLET), ('I = U ÷ R = 2 A', INK)], 505, 34)
    return board('elec', L['a_elec'], b)

# ---------- 5. Optique ----------
def svg_optique(L):
    ay = 190; lx = 250; F = 85; do = 140; ho = 62
    di = 1 / (1 / F - 1 / do); hi = -ho * di / do
    b = line(30, ay, 505, ay, MUTED, 1.6)
    b += '<ellipse cx="%s" cy="%s" rx="12" ry="110" fill="#EAF2FF" stroke="%s" stroke-width="2.4"/>' % (lx, ay, BLUE)
    for xf in (lx - F, lx + F):
        b += dot(xf, ay, INK, 4) + hand(xf, ay + 24, 'F', INK, 22, 'middle')
    ox = lx - do; ix = lx + di
    b += arrow(ox, ay, ox, ay - ho, INK, 3.2) + hand(ox, ay + 24, L['objet'], INK, 21, 'middle')
    b += arrow(ix, ay, ix, ay - hi, VIOLET, 3.2) + hand(ix, ay - hi + 26, 'image', VIOLET, 21, 'middle')
    # rayons
    b += line(ox, ay - ho, lx, ay - ho, WARN, 2.2) + line(lx, ay - ho, ix, ay - hi, WARN, 2.2)
    b += line(ox, ay - ho, ix, ay - hi, GREEN, 2.2)
    # rayon qui passe par le foyer côté objet, puis ressort parallèle
    s = (ay - (ay - ho)) / ((lx - F) - ox); ylens = (ay - ho) + s * (lx - ox)
    b += line(ox, ay - ho, lx, ylens, BLUE, 2.2) + line(lx, ylens, ix, ylens, BLUE, 2.2)
    b += notes([('1/f = 1/dₒ + 1/dᵢ', VIOLET), (L['inversee'], INK)], 505, 34)
    return board('optique', L['a_optique'], b)

# ---------- 6. Chimie (lois des gaz) ----------
def svg_chimie(L):
    b = '<rect x="50" y="80" width="150" height="220" rx="8" fill="#fff" stroke="%s" stroke-width="2.6"/>' % INK
    py = 160
    b += '<rect x="52" y="%s" width="146" height="12" fill="%s"/>' % (py - 12, MUTED) + line(125, py - 12, 125, 60, INK, 5)
    b += arrow(160, 46, 160, 86, WARN, 3) + hand(168, 66, L['comprime'], WARN, 21)
    import random
    rnd = random.Random(4)
    for _ in range(30):
        b += dot(rnd.uniform(64, 186), rnd.uniform(py + 10, 288), BLUE, 5)
    gx0, gy0 = 270, 290
    b += arrow(gx0, gy0, 495, gy0, INK, 2.4) + arrow(gx0, gy0, gx0, 70, INK, 2.4)
    b += small(492, gy0 + 22, 'V', INK, 15, 'end') + small(gx0 - 10, 82, 'P', INK, 15, 'end')
    X = lambda v: gx0 + 34 * v; Y = lambda p: gy0 - 30 * p
    b += curve([(X(v), Y(6 / v)) for v in [0.85 + i / 20 for i in range(0, 100)] if X(v) < 485])
    for v, c in ((2, BLUE), (4, VIOLET)):
        b += dot(X(v), Y(6 / v), c, 6)
    b += line(X(4), Y(1.5), X(2), Y(3), WARN, 2, '5 5')
    b += hand(X(2) + 10, Y(3) - 10, L['pdouble'], WARN, 21)
    b += notes([('PV = ' + L['constante'], VIOLET)], 505, 34)
    return board('chimie', L['a_chimie'], b)

LANG = {
 'fr': dict(fr=True, sommet='sommet', tangente='tangente', aire='aire', poids='poids', normale='normale', frottement='frottement',
           objet='objet', inversee='image réelle, inversée', comprime='on comprime', pdouble='V ÷ 2 → P × 2', constante='constante',
           a_fonctions="Tableau de Nesa : parabole, sommet et zéros", a_calcul="Tableau de Nesa : tangente et aire sous la courbe",
           a_meca="Tableau de Nesa : forces sur un bloc sur un plan incliné", a_elec="Tableau de Nesa : circuit en série et loi d'Ohm",
           a_optique="Tableau de Nesa : rayons à travers une lentille convergente", a_chimie="Tableau de Nesa : gaz comprimé et loi de Boyle-Mariotte"),
 'en': dict(fr=False, sommet='vertex', tangente='tangent', aire='area', poids='weight', normale='normal', frottement='friction',
           objet='object', inversee='real, inverted image', comprime='compress', pdouble='V ÷ 2 → P × 2', constante='constant',
           a_fonctions="Nesa's board: parabola, vertex and zeros", a_calcul="Nesa's board: tangent and area under the curve",
           a_meca="Nesa's board: forces on a block on a ramp", a_elec="Nesa's board: series circuit and Ohm's law",
           a_optique="Nesa's board: rays through a converging lens", a_chimie="Nesa's board: compressed gas and Boyle's law"),
}

TABS = [
 ('fonctions', svg_fonctions,
  dict(fr=('Fonctions', 'Maths · sec 4-5 (CST, TS, SN)', 'Nesa trace la courbe, place le sommet et te fait trouver les zéros.',
           ['Fonction quadratique', 'Exponentielle et logarithme', 'Fonctions trigonométriques', 'Fonctions en escalier et périodiques', 'Factorisation', 'Équations et inéquations']),
       en=('Functions', 'Math · Sec 4-5 (CST, TS, SN)', 'Nesa draws the curve, marks the vertex and has you find the zeros.',
           ['Quadratic functions', 'Exponentials and logarithms', 'Trigonometric functions', 'Step and periodic functions', 'Factoring', 'Equations and inequalities']))),
 ('calcul', svg_calcul,
  dict(fr=('Calcul', 'Maths · cégep', "La tangente et l'aire sous la courbe se dessinent pendant qu'il explique.",
           ['Limites', 'Dérivées', 'Optimisation', 'Intégrales', 'Séries', 'Algèbre linéaire']),
       en=('Calculus', 'Math · CEGEP', 'The tangent and the area under the curve appear while it explains.',
           ['Limits', 'Derivatives', 'Optimization', 'Integrals', 'Series', 'Linear algebra']))),
 ('meca', svg_meca,
  dict(fr=('Mécanique', 'Physique · sec 5 et cégep', 'Chaque force devient une flèche : tu vois pourquoi le bloc glisse.',
           ['MRU et MRUA', 'Projectiles', 'Lois de Newton', 'Plan incliné', 'Vecteurs', 'Énergie']),
       en=('Mechanics', 'Physics · Sec 5 and CEGEP', 'Each force becomes an arrow: you see why the block slides.',
           ['Uniform and accelerated motion', 'Projectiles', "Newton's laws", 'Ramps', 'Vectors', 'Energy']))),
 ('elec', svg_elec,
  dict(fr=('Électricité', 'Physique · sec 4 (ST, STE) et cégep', "Le courant suit le circuit, et la loi d'Ohm se construit sous tes yeux.",
           ["Circuits et loi d'Ohm", 'Série et parallèle', 'Puissance électrique', 'Électricité et magnétisme']),
       en=('Electricity', 'Physics · Sec 4 (ST, STE) and CEGEP', "The current follows the circuit and Ohm's law builds up in front of you.",
           ["Circuits and Ohm's law", 'Series and parallel', 'Electric power', 'Electricity and magnetism']))),
 ('optique', svg_optique,
  dict(fr=('Optique', 'Physique · sec 5 et cégep', "Les rayons se tracent un à un, jusqu'à l'image.",
           ['Réflexion', 'Réfraction', 'Lentilles', 'Ondes et physique moderne']),
       en=('Optics', 'Physics · Sec 5 and CEGEP', 'The rays are drawn one by one, all the way to the image.',
           ['Reflection', 'Refraction', 'Lenses', 'Waves and modern physics']))),
 ('chimie', svg_chimie,
  dict(fr=('Chimie', 'Chimie · sec 4-5 et cégep', 'On comprime le gaz : les particules se serrent et la pression monte.',
           ['Lois des gaz', 'Stœchiométrie', 'Vitesse de réaction', 'Équilibre chimique', 'Chimie des solutions']),
       en=('Chemistry', 'Chemistry · Sec 4-5 and CEGEP', 'Compress the gas: the particles squeeze together and the pressure rises.',
           ['Gas laws', 'Stoichiometry', 'Reaction rate', 'Chemical equilibrium', 'Solution chemistry']))),
]

TXT = {
 'fr': dict(h2='Les notions de ton cours', intro='Pas « les maths » en général : les notions précises où les élèves bloquent le plus. Choisis une matière.',
            tablist='Matières', missing='Ta notion n\'est pas là ? <a href="#" data-open="notion_manquante">Dis-nous laquelle</a>.'),
 'en': dict(h2='The concepts in your course', intro='Not "math" in general: the specific concepts where students get stuck the most. Pick a subject.',
            tablist='Subjects', missing='Your concept is not here? <a href="#" data-open="notion_manquante">Tell us which one</a>.'),
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
