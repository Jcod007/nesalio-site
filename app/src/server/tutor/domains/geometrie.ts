/**
 * Consignes propres au domaine : Géométrie et trigonométrie.
 * Rédigées à partir de séances jouées et rejouées (voir app/tools/scenarios) :
 * Pythagore (carrés mal construits, étiquettes dans les carrés, aires en double),
 * SOH CAH TOA (côtés mal nommés, figure à 35° pour un calcul à 37°, sin(0,6)),
 * cercle trigonométrique (étiquette « (1, 0) » restée sur un point qui a tourné).
 * Rendues au modèle dans la section « PAR DOMAINE » de la consigne.
 */
import type { DomainGuide } from "./types";

export const geometrie: DomainGuide = {
  id: "geometrie",
  title: "Géométrie et trigonométrie",
  rules: [
    // Pythagore : le moteur construit les carrés ; à la main, ils sortaient tordus ou à côté du triangle.
    'Pythagore : un SEUL "triangle" (base, height) avec "sides" pour les longueurs, puis, à l\'étape suivante, le même triangle (même id) avec "squares" pour les carrés et leurs aires ({"base":"16","height":"9","hyp":"25"}). Ne dessine jamais ces carrés toi-même en "polygon", et n\'écris pas l\'aire une deuxième fois en "text" : elle est déjà au centre du carré.',
    'Triangle rectangle : A porte l\'angle aigu étudié, B l\'angle droit. tri-base est le côté adjacent à A (aussi tri-adjacent), tri-haut l\'opposé (aussi tri-oppose), tri-hyp l\'hypoténuse ; nomme-les avec "sides" ({"height":"opposé : 3"}) ou un "text" près de ces parties.',
    '"angleLabel" : θ ou la mesure (« 37° »), jamais le nom du sommet (le A est déjà écrit au sommet).',
    'La figure dit les mêmes nombres que toi : construis le triangle avec les côtés de l\'exemple (base 4, height 3 donne hyp 5 et un angle de 36,9° en A). N\'invente jamais un angle dessiné (35°) différent de celui qu\'on calcule (37°). Prends des triplets entiers (3-4-5, 6-8-10, 5-12-13).',
    'Trouver un angle : écris d\'abord le rapport avec les côtés (sin θ = 3/5), puis sa valeur (0,6), puis θ = sin⁻¹(0,6) ≈ 36,9° ; dis « sinus inverse, la touche 2nd de la calculatrice, en mode degrés ». sin⁻¹ n\'est pas 1 ÷ sin. N\'écris jamais sin(0,6) quand 0,6 est un rapport de côtés. Mauvais choix utiles : rapport inversé (hyp/opposé), opposé et adjacent échangés, 1 ÷ sin, mode radians.',
    'Pour montrer d\'où vient un nombre, fais un "copy" de son étiquette (tri-haut-l), pas du côté lui-même : un segment copié dans la colonne n\'est qu\'un trait.',
    'Un nouveau dessin (2e triangle, carré à paver) ne doit pas chevaucher la figure : estompe-la ("dim") ou efface-la, et pose le nouveau à au moins 2 unités d\'elle ("at"), dans les bornes du tableau.',
    'Cercle trigonométrique : "axes" de -1.5 à 1.5, "circle" de rayon 1, le rayon OP ("segment" de [0,0] à [1,0]) et le point P dans un "group", qu\'on fait tourner ("rotate" avec "about":[0,0]) ; marque l\'angle θ ("angle"). Les coordonnées de P vont dans un "text" près de P, que tu transformes après chaque rotation : jamais dans le "label" du point, qui resterait faux une fois P déplacé.',
    'cos θ et sin θ sur le cercle : dessine le triangle rectangle O, (cos θ, 0), P. cos θ = le segment SUR l\'axe des x, de [0,0] à [cos θ, 0] ; sin θ = le segment vertical, de [cos θ, 0] jusqu\'à P. Chaque étiquette va sur le segment dont la LONGUEUR vaut ce nombre (à 30° : cos θ ≈ 0,87 est le plus long, à l\'horizontale). Ces segments ne suivent pas la rotation : efface-les et retrace-les après chaque "rotate". De 0° à 90°, P monte ET va vers la gauche : x (cos) diminue de 1 à 0, y (sin) augmente de 0 à 1.',
    'Lacunes d\'avant fréquentes ici : aire d\'un carré (côté × côté, pas côté + côté), carré et racine carrée d\'un nombre, repérer opposé et adjacent selon l\'angle choisi, isoler x dans x/5 = 0,6. Vérifie-les hors du problème avec des nombres simples (« Aire d\'un carré de côté 3 ? »).',
  ],
};
