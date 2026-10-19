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
    // Plan incliné : séances « bloc qui glisse » (décomposition affirmée sans justification, angle changé sans effet visible).
    'Plan incliné : toujours "incline" (jamais de segments à la main). Les forces une à une : le poids, puis "components":true, puis "normal":true.',
    'L\'étape qui écrit "P∥ = P sin θ" redemande la figure avec "weightAngle":true et dit POURQUOI : « l\'angle entre P et P⊥ est aussi θ ; P∥ est le côté opposé à θ, P l\'hypoténuse, donc P∥ = P sin θ ».',
    'Effet de l\'angle : redemande la même figure avec un autre "angle" (le plan pivote, P∥ s\'allonge sous les yeux de l\'élève). Avant un calcul à un angle donné, la figure doit montrer CET angle : redemande-le.',
    'Accélération : note la 2e loi de Newton le long de la pente ("m·a = m·g·sin θ"), puis "transform" en "a = g·sin θ" (la masse se simplifie), puis le calcul avec unités ("a = 9,8 m/s² × 0,5 = 4,9 m/s²").',
    'Une formule déjà au tableau ne se réécrit pas : "highlight" ou "transform" de la même note.',
    'Frottements ou air négligés : dis-le dans "say" au moment où tu le fais (pas dans un "tag").',
    // Diagnostic : la vraie lacune derrière « tout le poids » est souvent la trigonométrie, jamais vérifiée seule.
    'Erreur sur une composante (P∥, vx, vy) : soupçonne la trigonométrie du triangle rectangle (sin = opposé / hypoténuse) et vérifie-la SEULE au tour suivant : "triangle" d\'hypoténuse 2 et d\'angle 30°, « que vaut le côté opposé ? ».',
    // Projectile : séance « balle lancée » (erreur de physique, points hors de la courbe, aucune vitesse dessinée).
    'La gravité est CONSTANTE (P = m·g) : dis « la gravité tire toujours aussi fort ; c\'est la vitesse vers le bas qui grandit », jamais « de plus en plus fort ».',
    'Projectile : dessine la vitesse en composantes à 2 ou 3 positions de la balle, espacées d\'au moins 2 unités : "vx" (vert, même longueur partout) et "vy" (vers le bas, de plus en plus long), depuis la balle. Flèches de 1,5 unité au plus.',
    'Trajectoire : choisis la courbe y = y0 − k(x − x0)², puis calcule chaque position avec elle (les points sont SUR la courbe, le départ aussi). À pas égaux en x, les chutes successives sont dans le rapport 1, 3, 5.',
    'Unités partout, dites et écrites (N, kg, m, m/s, m/s²) ; g = 9,8 m/s².',
    // Fin de séance : des forces inventées (« tu vois bien que… » sans réponse de l'élève) ne l'aident pas.
    '"noticed.strengths" : seulement ce que ses RÉPONSES ont montré, jamais ce que tu as expliqué toi-même. S\'il s\'est trompé partout, nomme ce que ses choix révèlent de juste (« tu sens qu\'une chose accélère »).',
  ],
};
