/**
 * Consignes propres au domaine : Algèbre et arithmétique (équations, divisions, sommes, fractions).
 * Rédigées à partir de séances jouées et rejouées (voir app/tools/scenarios) :
 * 2(x − 3) + 5 = 3x − 4, 1 + 2 + … + 100, diviser par une fraction.
 * Rendues au modèle dans la section « PAR DOMAINE » de la consigne.
 */
import type { DomainGuide } from "./types";

export const algebre: DomainGuide = {
  id: "algebre",
  title: "Algèbre et arithmétique (équations, divisions, sommes, fractions)",
  rules: [
    // Séance 2(x − 3) + 5 = 3x − 4 : l'équation passait de « 2x − 1 = 3x − 4 » à « −x − 1 = −4 » sans qu'on voie l'opération.
    "Équation : écris-la UNE fois (\"note\", id \"eq\") et fais-la évoluer par \"transform\". Chaque opération en deux temps : " +
      "d'abord l'opération écrite des DEUX côtés (\"2x − 1 − 2x = 3x − 4 − 2x\"), puis le résultat simplifié (\"−1 = x − 4\").",
    // Des textes posés à droite ou à gauche de l'équation se faisaient recouvrir quand elle s'allongeait.
    "Rien à côté d'une ligne de calcul (pas de \"text\" avec \"near\":\"eq\") : elle s'allonge en se transformant et la colonne " +
      "bouge. Un calcul d'appoint (\"2 × (−3) = −6\", \"−6 + 5 = −1\") est une \"note\" à part, sous l'équation.",
    "Une ligne « −6 + 5 = ? » se complète par \"transform\" (\"−6 + 5 = −1\") quand la réponse vient ; estompe (\"dim\") les " +
      "calculs d'appoint terminés.",
    "Distributivité : le facteur multiplie chaque terme AVEC son signe. Dis et écris « 2 fois moins 3 » (\"2 × (−3) = −6\"), " +
      "jamais « le x et le 3 ».",
    // Le modèle enlevait 3x et obtenait −x = −3, puis sautait le changement de signe.
    "Regroupe les x du côté où leur coefficient reste positif (2x − 1 = 3x − 4 : on enlève 2x des deux côtés). Si tu " +
      "arrives à −x = −3, montre l'étape « on multiplie les deux côtés par −1 ».",
    "Vérification : remplace x dans l'équation de DÉPART, une note par côté (\"gauche : 2(3 − 3) + 5 = 5\", \"droite : 3 × 3 − 4 = 5\").",
    "Pas de balance dessinée en segments ni de traits décoratifs : un dessin porte la quantité (une aire, une longueur, des " +
      "morceaux qu'on compte). Une « paire » de nombres n'a pas de longueur.",
    "Signes (addition d'entiers) : droite des nombres = \"axes\" avec \"y\":[-1,1], un point au départ, une flèche " +
      "(\"vector\" avec \"by\":[5,0]) pour le saut, un point à l'arrivée.",
    // Séance 1 + … + 100 : des segments de longueur 1 étiquetés « 1 + 100 », sans rapport avec la quantité.
    "Somme 1 + 2 + … + n : sur un petit n (4), escalier de carrés \"polygon\" ([[0,0],[4,0],[4,4],[3,4],[3,3],[2,3],[2,2]," +
      "[1,2],[1,1],[0,1]], dans des axes x:[-1,7], y:[-1,6]), puis \"copy\" (\"by\":[0,0]) et \"rotate\" de la copie de 180° autour " +
      "de [2,2.5] : les deux escaliers forment un rectangle 4 × 5, donc 2S = 4 × 5. Ensuite seulement, 100 × 101 ÷ 2.",
    "Fractions : une unité = un rectangle (\"polygon\" de 2 sur 1) coupé en parts égales par des segments pointillés ; " +
      "jamais un cercle entier pour « une demie ».",
    // Séance diviser par une fraction : 6 pizzas en cercles entiers, aucune moitié visible.
    "Diviser par une fraction = « combien de morceaux de cette taille dans … ». 2 ÷ 1/3 : deux barres coupées en tiers, on " +
      "compte 6 (× 3). 2 ÷ 2/3 : on regroupe ces tiers par 2, il en reste 3 (÷ 2). Ensemble : × 3/2, l'inverse.",
    // Essai x/3 + x/4 = 7 : un choix « 3 × 4 = 12, mais sans réfléchir plus loin ».
    "Choix de réponse : même forme que la bonne réponse (un nombre, une expression), et chaque mauvais choix est le " +
      "résultat d'une erreur précise (signe oublié, un seul terme multiplié, dénominateurs additionnés…) écrite dans " +
      "\"why\". Jamais une phrase vague ni un choix « sans réfléchir ».",
    "Une erreur de calcul (signe, zéro perdu) est d'abord \"suspected\" : vérifie-la par une question isolée avant " +
      "\"confirmed\", et ne la marque \"repaired\" qu'après une bonne réponse de l'élève sur cette notion.",
    "« Ce que j'ai remarqué » : des forces tirées de SES réponses (la part juste d'une réponse fausse compte : « tu as " +
      "bien doublé le x »), jamais « tu as accepté de… » ni une réussite qu'il n'a pas eue ; à travailler : l'erreur exacte " +
      "avec un mini-exemple (« −6 + 5 = −1, pas 11 »).",
  ],
};
