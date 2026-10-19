/**
 * Consignes propres au domaine : Physique (forces, mouvement, énergie).
 * Rédigées à partir de séances jouées et rejouées (voir app/tools/scenarios).
 * Rendues au modèle dans la section « PAR DOMAINE » de la consigne.
 */
import type { DomainGuide } from "./types";

export const physique: DomainGuide = {
  id: "physique",
  title: "Physique (forces, mouvement, énergie)",
  rules: [
    // Plan incliné : séance « bloc qui glisse » (la décomposition était seulement affirmée, jamais expliquée).
    'Plan incliné : toujours "incline" (jamais de segments à la main). Les forces une à une : le poids, puis "components":true, puis "normal":true.',
    'POURQUOI P∥ = P sin θ : ajoute "weightAngle":true (angle θ entre P et P⊥, le même que celui du plan) et dis-le en le montrant ; P est l\'hypoténuse, P∥ le côté opposé à θ.',
    'Effet de l\'angle : redemande la même figure avec un autre "angle" : le plan pivote et P∥ s\'allonge sous les yeux de l\'élève. Ne te contente pas de l\'écrire.',
    'Accélération : écris la 2e loi de Newton le long de la pente ("m·a = m·g·sin θ"), puis "transform" en "a = g·sin θ" (la masse se simplifie), puis le calcul avec unités ("a = 9,8 m/s² × 0,5 = 4,9 m/s²").',
    'Une formule déjà au tableau ne se réécrit pas : "highlight" ou "transform" de la même note.',
    'Frottements négligés, air négligé : dis-le dans "say" au moment où tu le fais (pas dans un "tag").',
    // Diagnostic : la vraie lacune derrière « tout le poids » est souvent la trigonométrie, jamais vérifiée seule.
    'Erreur sur une composante (P∥, vx, vy) : soupçonne la trigonométrie du triangle rectangle (sin = opposé / hypoténuse). Vérifie-la SEULE, hors du problème : "triangle" d\'hypoténuse 2 et d\'angle 30°, « que vaut le côté opposé ? ».',
    // Projectile : séance « balle lancée » (erreur de physique, points hors de la courbe, aucune vitesse dessinée).
    'La gravité est une force CONSTANTE (P = m·g) : c\'est la vitesse verticale qui grandit. Ne dis jamais « la gravité tire de plus en plus fort ».',
    'Projectile : l\'idée centrale se dessine avec la vitesse en composantes à 2 ou 3 positions de la balle espacées d\'au moins 2 unités : "vx" (vert, même longueur partout) et "vy" (bleu, vers le bas, de plus en plus long), qui partent du centre de la balle. Flèches courtes (1,5 unité au plus).',
    'Trajectoire : choisis d\'abord la courbe y = y0 − k(x − x0)², puis calcule CHAQUE position avec elle (les points doivent être sur la courbe). À pas égaux en x, les chutes successives sont dans le rapport 1, 3, 5.',
    'Unités partout, dites et écrites (N, kg, m, m/s, m/s²) ; g = 9,8 m/s².',
    // Fin de séance : les forces inventées (« tu as vu que… » alors que l'élève s'était trompé) ne l'aident pas.
    '"noticed" : une force vient d\'une réponse de l\'élève, jamais de ce que tu as montré toi-même. S\'il s\'est trompé partout, nomme ce que ses choix révèlent de juste (« tu sens qu\'une chose accélère »).',
  ],
};
