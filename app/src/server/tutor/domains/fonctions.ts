/**
 * Consignes propres au domaine : Fonctions et analyse (fonctions, dérivées, exponentielles, logarithmes).
 * Rédigées à partir de séances jouées et rejouées (voir app/tools/scenarios).
 * Rendues au modèle dans la section « PAR DOMAINE » de la consigne.
 */
import type { DomainGuide } from "./types";

export const fonctions: DomainGuide = {
  id: "fonctions",
  title: "Fonctions et analyse (fonctions, dérivées, exponentielles, logarithmes)",
  rules: [
    // Repère : le moteur garde la même échelle en x et en y (un y très étendu écrase le graphique en une colonne).
    'Repère : même échelle en x et en y. Garde l\'étendue en y au plus 2 fois celle en x (x [0,5] → y au plus [0,10]) ; ' +
      "une courbe qui « explose » sort par le haut du repère, et ses grandes valeurs vont dans un tableau (\"note\"), pas en points hors cadre.",
    'Étiquette de courbe = sa règle, courte ("label":"2ˣ", "2x + 1", "x²"), jamais une phrase ; chaque axe dit ce qu\'il compte ("heures", "bactéries").',
    "Chaque point posé sur une courbe : calcule son y avec la règle exacte avant de l'écrire (f(3) = 3² = 9). Choisis des règles " +
      "et des x qui donnent des valeurs entières.",
    // Fonction : relation entrée-sortie, pas une formule.
    "Fonction = relation entrée → sortie. Machine : entrée à gauche, boîte au centre (\"polygon\", son nom dans \"label\"), sortie à " +
      'droite, flèches ("vector") entrée → boîte → sortie. Nouvelle entrée = "transform" des textes d\'entrée et de sortie à leur place ; ' +
      "ne pose jamais un nombre sur l'étiquette de la boîte.",
    "Puis relie la machine au graphique : d'abord efface la machine (\"erase\" de ses objets, la règle reste en \"note\") — dessinée " +
      "sans axes, elle se retrouverait au milieu du repère — puis chaque couple (entrée, sortie) devient un point, et les points forment la courbe. " +
      "« Une seule sortie » : montre une entrée qui en aurait deux (deux points l'un au-dessus de l'autre) et dis que ce n'est plus une fonction.",
    // Dérivée : la pente de la sécante qui tourne jusqu'à la tangente.
    'Pente = montée ÷ avancée : dessine le triangle de pente (segment horizontal "avancée", puis vertical "montée", nombres à côté).',
    'Dérivée : f(x) = x² (x [-1,4], y [-1,9]), A(1, 1) fixe et P(3, 9) sur la courbe (pente de la sécante 4, puis P(2, 4) : 3, ' +
      'P(1,5 ; 2,25) : 2,5, tangente en A : 2) ; la sécante est une droite ' +
      'entière ("curve" avec "fn":"m*(x-a)+f(a)") ; P glisse vers A ("transform" "at") PENDANT que la sécante tourne ("transform" "fn") et ' +
      "que sa pente écrite change ; à la fin, c'est la tangente. N'écris la formule de f′ qu'après avoir montré d'où elle vient.",
    "Un nom = un seul objet : ne réutilise pas A ou B pour un deuxième point ; efface (\"erase\") le dessin d'introduction avant d'en faire un autre.",
    // Exponentielle : multiplier vs additionner.
    "Exponentielle : compare ×2 et +2 côte à côte (deux courbes nommées et un tableau de valeurs). L'augmentation d'un pas est une " +
      'flèche VERTICALE ("vector" avec "by":[0,Δy]) posée au bout du pas, jamais une flèche le long de la courbe. ' +
      '"copy" d\'une flèche : toujours avec sa destination ("by":[1,4]), sinon elle est refusée.',
    // Logarithme : lire l'exponentielle à l'envers.
    "Logarithme = l'exposant qu'il faut : dessine 2ˣ, pars de 8 sur l'axe des y, va à l'horizontale jusqu'à la courbe puis descends à x = 3 " +
      '(segments pointillés) : log₂(8) = 3. Ou compte les sauts ×2 de 1 à 8 sur une droite graduée. Pas de séance de logarithme sans dessin.',
    'Écris les bases avec des chiffres en indice (log₂, log₃, log₁₀), jamais « log_b ». Dans "fn", log est en base 10 : log₂(x) s\'écrit "ln(x)/ln(2)".',
    // Diagnostic : les notions d'avant typiques du domaine.
    "Notions d'avant typiques : f(4) lu comme « f fois 4 » ; exposant pris pour un produit (2⁵ = 2 × 5) ; règles des signes ; " +
      "pente d'une droite (montée ÷ avancée). Soupçon → la question suivante porte sur cette notion SEULE (« Que vaut 2⁴ ? »).",
    "Chaque mauvais choix d'une question est vraiment faux, et la réponse n'est pas déjà écrite au tableau (pas d'étiquette « pente 3 » avant de demander la pente).",
    '"noticed" : seulement ce que ses réponses montrent (une bonne réponse, une erreur corrigée à la question suivante) ; jamais une réussite qu\'il n\'a pas eue.',
  ],
};
