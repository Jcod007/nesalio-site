/**
 * Consignes propres au domaine : Géométrie et trigonométrie.
 * Rédigées à partir de séances jouées et rejouées (voir app/tools/scenarios) :
 * Pythagore (carrés mal construits, étiquettes dans les carrés, aires en double),
 * SOH CAH TOA (côtés mal nommés, figure à 35° pour un calcul à 37°, sin(0,6)),
 * cercle trigonométrique (étiquette « (1, 0) » restée sur un point qui a tourné) ;
 * puis dix questions du 19 octobre : hauteur tombée à côté de l'hypoténuse, « 90° » sur un
 * angle aigu, secteur dessiné en triangle, cylindre en cercles empilés à plat, aire du carré
 * réécrite en dehors du carré, exemple dessiné par-dessus la figure ; 83 commandes sur 223
 * donnaient des coordonnées calculées à la main. D'où la règle d'or : sans repère, le modèle
 * nomme et construit, le moteur calcule (triangle par ses mesures, constructions, images,
 * solides, polygones réguliers, cercle trigonométrique, coniques).
 * Rendues au modèle dans la section « PAR DOMAINE » de la consigne.
 */
import type { DomainGuide } from "./types";

export const geometrie: DomainGuide = {
  id: "geometrie",
  title: "Géométrie et trigonométrie",
  rules: [
    // La règle d'or : l'IA donne l'intention, le moteur dessine.
    'RÈGLE D\'OR : sans repère, ne calcule JAMAIS de coordonnées (sommet, milieu, pied, intersection, image). Décris la figure par ses mesures, construis le reste ("construct", "image") et vise les points par leur nom ("A", "H", "M", "A\'"). Des coordonnées seulement pour placer une figure ("at") ou dans un repère, où elles sont le contenu même (A(1, 2)).',
    'Triangle quelconque : "triangle" avec "lengths" (ab, bc, ca) et "angles" (A, B, C) : trois mesures dont une longueur. Loi des sinus et loi des cosinus : construis-le avec les mesures de l\'énoncé, écris l\'inconnue avec "angleLabels" ({"C":"?"}) ou "sides" ({"bc":"x"}).',
    'Triangles isométriques ou semblables : marque les côtés égaux ("marks":{"ab":1,"ca":2}) et les angles égaux ("angleMarks":{"A":1,"B":2}) sur les DEUX triangles, avec les mêmes nombres de traits pour les éléments homologues. Un triangle semblable s\'obtient par "image" "homothety" (centre, rapport) ; un triangle isométrique par réflexion, translation ou rotation.',
    // Pythagore : le moteur construit les carrés ; à la main, ils sortaient tordus ou à côté du triangle.
    'Pythagore : un SEUL "triangle" (base, height) avec "sides" pour les longueurs, puis, à l\'étape suivante, le même triangle (même id, sans redonner les mesures) avec "squares" ({"base":"16","height":"9","hyp":"25"}). Ne dessine jamais ces carrés en "polygon" ; pour changer un nombre dans un carré, redemande "squares" ({"hyp":"100"}), pas un "text" à côté.',
    'Triangle rectangle : A porte l\'angle aigu étudié, B l\'angle droit. tri-base est le côté adjacent à A (aussi tri-adjacent), tri-haut l\'opposé (aussi tri-oppose), tri-hyp l\'hypoténuse ; nomme-les avec "sides" ({"height":"opposé : 3"}). "angleLabel" : θ ou la mesure (« 37° »), jamais le nom du sommet.',
    'La figure dit les mêmes nombres que toi : construis le triangle avec les mesures de l\'exemple (base 4, height 3 donne hyp 5 et un angle de 36,9° en A). Prends des triplets entiers (3-4-5, 6-8-10, 5-12-13).',
    'Trouver un angle : écris d\'abord le rapport avec les côtés ($\\sin\\theta = \\frac{3}{5}$), puis sa valeur (0,6), puis $\\theta = \\sin^{-1}(0{,}6) \\approx 36{,}9^\\circ$ ; dis « sinus inverse, la touche 2nd de la calculatrice, en mode degrés ». sin⁻¹ n\'est pas 1 ÷ sin. Mauvais choix utiles : rapport inversé, opposé et adjacent échangés, 1 ÷ sin, mode radians.',
    'Constructions ("construct") : milieu, point de partage, pied d\'une perpendiculaire, intersection, droite, parallèle, perpendiculaire, médiatrice, bissectrice, médiane. Hauteur d\'un triangle (aire, relations métriques) : "altitude" sur le triangle ({"from":"B","label":"h","parts":["m","n"]}). Les petits triangles d\'une figure : "polygon" sur les sommets nommés (["A","B","H"]).',
    'Thalès, droite parallèle à un côté : "construct" "divide" place D sur [AC], puis "construct" "parallel" par D, parallèle à (AB), avec "within":"tri" et "meets":"E" : le moteur l\'arrête aux côtés et place E. Ne calcule jamais toi-même les extrémités de DE.',
    'Transformations ("image") : réflexion par rapport à un axe nommé, translation par un vecteur, rotation, homothétie ; l\'image apparaît avec ses traits de construction et ses sommets A\', B\', C\'. Pour faire tourner une figure sous les yeux, "rotate" avec "about" sur un point nommé. Place l\'axe, le centre ou le vecteur À CÔTÉ de la figure (jamais à travers elle) : l\'image doit se lire séparément de l\'original.',
    'Arc et secteur : "sector" (centre, rayon, angles "from" et "to"), jamais un "polygon". Pour montrer qu\'un angle de 60° fait 1/6 du tour : "parts":6 sur le secteur (le moteur découpe le cercle), jamais des "copy" tournés.',
    'Solides et volumes : "prism" (pavé droit, cube, prisme à base triangulaire ou régulière), "pyramid", "cylinder" ("slices" pour la pile de tranches), "cone", "sphere", avec leurs cotes ("labels"). Jamais de solide à plat (cercles empilés, rectangles).',
    'Polygone régulier, aire avec l\'apothème : "regularPolygon" ("apothem", "triangles" pour le découpage en triangles depuis le centre).',
    'Vecteurs : "vector" (nommé, "label"), puis "vectorOp" pour la somme (Chasles ou parallélogramme), la différence, k·u, les composantes. Ne recopie pas un vecteur à la main pour l\'additionner.',
    'Cercle trigonométrique : "unitCircle" avec "angle" (et "values" pour cos θ et sin θ) ; redemande-le avec un autre angle pour le faire tourner. Pour comparer deux angles (60° et 120°), un second "unitCircle" (autre id, autre "color"). Jamais de cercle, de rayon ni de segments cos/sin tracés à la main.',
    'Coniques : "axes" puis "conic" (cercle, ellipse, hyperbole, parabole) avec "foci" et "elements" : le moteur place foyers, asymptotes et directrice. N\'écris pas toi-même les coordonnées d\'un foyer : vise-le par son nom (F1, F2, F). Un point de la courbe et ses distances aux foyers : "points" ([{"name":"P","x":3}]) avec "distances", jamais calculés à la main ; redemande la conique avec un autre x pour promener P.',
    'Pour montrer d\'où vient un nombre, fais un "copy" de son étiquette (tri-haut-l), pas du côté lui-même.',
    'Un petit exemple à part (un carré de côté 3 pour la racine carrée) : pose-le loin de la figure ("at"), ou estompe ("dim") la figure avant. Un repère ("axes") ne se trace jamais par-dessus une figure sans repère : efface-la d\'abord ("clear").',
    'Lacunes d\'avant fréquentes ici : aire d\'un carré (côté × côté, pas côté + côté), carré et racine carrée d\'un nombre, repérer opposé et adjacent selon l\'angle choisi, isoler x dans x/5 = 0,6, multiplier par un rapport (0,6 × 4, pas 4 + 0,6). Vérifie-les hors du problème avec des nombres simples.',
  ],
};
