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
    'Étiquette de courbe = sa règle, courte ("label":"2ˣ", "2x + 1", "x²"), jamais une phrase ; chaque axe dit ce qu\'il compte ("heures", "bactéries"). ' +
      'Une droite tracée avec "curve" : "from"/"to" qui la gardent dans le repère (l\'étiquette se pose à son bout).',
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
      "que sa pente écrite change ; à la fin, c'est la tangente. N'écris la formule de f′ qu'après avoir montré d'où elle vient. " +
      'Le "transform" d\'une droite ou d\'une courbe ne change que "fn" (pas de "from"/"to" : refusé).',
    "Pour f(x) = x², point fixe (1,1) et point mobile (q,q²), la pente sécante vaut q + 1 : quand q passe de 3 à 1, " +
      "elle DIMINUE de 4 vers 2. La limite n'est ni une verticale ni une horizontale : c'est la tangente y = 2x − 1. " +
      "Ne propose pas de QCM dont tous les choix sont faux. Une piste qui descend ne peut pas être représentée par x² croissante sans expliquer le changement d'orientation.",
    "Un nom = un seul objet : ne réutilise pas A ou B pour un deuxième point ; explique la correspondance entre les deux supports avant d'effacer le dessin d'introduction.",
    // Exponentielle : multiplier vs additionner.
    "Exponentielle 2ˣ : repère x [0,4], y [0,8] (1, 2, 4, 8 visibles ; la courbe sort par le haut : c'est l'explosion). " +
      "16, 32, 1024 vont dans le tableau (\"note\"), jamais un y de 20 ou 35. " +
      "Compare ×2 et +2 côte à côte (deux courbes nommées et un tableau de valeurs). L'augmentation d'un pas est une " +
      'flèche VERTICALE ("vector" avec "by":[0,Δy]) posée au bout du pas, jamais une flèche le long de la courbe. ' +
      '"copy" d\'une flèche : toujours avec sa destination ("by":[1,4]), sinon elle est refusée.',
    // Logarithme : lire l'exponentielle à l'envers.
    "Logarithme = l'exposant qu'il faut : dessine 2ˣ, pars de 8 sur l'axe des y, va à l'horizontale jusqu'à la courbe puis descends à x = 3 " +
      '(segments pointillés) : log₂(8) = 3. Ou compte les sauts ×2 de 1 à 8 sur une droite graduée. Pas de séance de logarithme sans dessin.',
    'Écris les bases avec des chiffres en indice (log₂, log₃, log₁₀), jamais « log_b ». Dans "fn", log est en base 10 : log₂(x) s\'écrit "ln(x)/ln(2)".',
    // Partie entière (SN 4, 1re étape) : notation, forme canonique et lecture du graphique comme en classe.
    'PARTIE ENTIÈRE : toujours "stepFunction" (jamais "curve" avec floor). Notation de la classe : [x], « le plus grand entier ' +
      "inférieur ou égal à x » : [3,7] = 3, [5] = 5, [−2,3] = −3 (piège classique : −2). Forme canonique f(x) = a[b(x − h)] + k, " +
      "écrite telle quelle au tableau.",
    "Rôle des paramètres (pose les nombres comme en classe) : |a| = écart vertical entre deux marches ; 1/|b| = longueur d'une " +
      "marche ; (h, k) = un point plein, le début d'une marche ; a et b de même signe → escalier croissant, de signes contraires → " +
      "décroissant ; b > 0 → point plein à gauche de chaque marche, b < 0 → à droite. Montre chaque rôle en redemandant le même " +
      'escalier avec un seul paramètre changé (k : il monte ; b : les marches s\'allongent ou raccourcissent ; signe de b : les points se retournent).',
    "Règle à partir du graphique : (h, k) lu sur un point plein, |a| sur l'écart entre deux marches, 1/|b| sur la longueur d'une " +
      "marche, puis les signes (croissante ou non, côté du point plein). Vérifie en calculant f(h) = k.",
    "Zéros : a[b(x − h)] + k = 0 → [b(x − h)] = −k/a ; si −k/a n'est pas entier, aucun zéro ; sinon les zéros forment un " +
      "INTERVALLE (toute une marche sur l'axe des x), écrit comme en classe : [2, 3[ (le crochet tourné vers l'extérieur exclut " +
      "la borne). Domaine ℝ ; image : les valeurs atteintes {…, k − |a|, k, k + |a|, …}.",
    "Situation-problème de partie entière (stationnement, appels, livraison facturés par tranche) : fais d'abord un tableau de " +
      "valeurs (\"note\"), puis l'escalier ; demande ce que vaut le prix pile à la fin d'une tranche (point plein ou vide ?).",
    // Diagnostic : les notions d'avant typiques du domaine.
    "Notions d'avant typiques : f(4) lu comme « f fois 4 » ; exposant pris pour un produit (2⁵ = 2 × 5) ; règles des signes ; " +
      "pente d'une droite (montée ÷ avancée). Soupçon → la question suivante porte sur cette notion SEULE (« Que vaut 2⁴ ? »).",
    "Chaque mauvais choix d'une question est vraiment faux, et la réponse n'est pas déjà écrite au tableau : pas d'étiquette " +
      "« tangente (pente 2) » dans l'étape qui demande la pente ; écris « tangente », et la pente après sa réponse.",
    '"noticed" : seulement ce que ses réponses montrent (une bonne réponse, une erreur corrigée à la question suivante). ' +
      "S'il n'a eu aucune réponse juste, pas de réussite inventée : une démarche vraie (« tu as répondu à chaque question ») ou rien.",
  ],
};
