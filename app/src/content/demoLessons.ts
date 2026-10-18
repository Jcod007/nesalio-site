/**
 * Séances de démonstration, écrites à la main dans le langage de scène.
 *
 * Elles servent à trois choses :
 * - jouer une séance quand aucune clé de modèle n'est configurée ;
 * - montrer au modèle un exemple concret du format attendu (voir prompt.ts) ;
 * - tester le moteur et le rendu avec des données réalistes.
 *
 * Ce sont les trois notions des vidéos du site : zéros d'une quadratique,
 * portée d'un projectile, dérivée comme pente.
 */
import type { Lesson } from "@/domain/scene/schema";

export const quadraticLesson: Lesson = {
  header: { kind: "lesson", title: "Les zéros d'une fonction quadratique", topic: "Fonctions · sec 4" },
  steps: [
    {
      say: "On va trouver les zéros de f de x {n1} égale moins x moins 2, le tout au carré, plus 3. D'abord, la forme canonique nous donne le sommet directement.",
      mood: "explique",
      do: [
        { type: "axes", x: [-1, 5], y: [-3, 4], xLabel: "x", yLabel: "y" },
        { type: "note", id: "n1", text: "f(x) = −(x − 2)² + 3" },
      ],
    },
    {
      say: "Le sommet {sommet} est au point 2, 3. Et le a est négatif, donc la parabole ouvre vers le bas, symétrique autour de cet axe {axe}.",
      mood: "dessine",
      do: [
        { type: "point", id: "sommet", at: [2, 3], label: "(2, 3)", color: "violet", ring: true },
        { type: "segment", id: "axe", from: [2, -3], to: [2, 4], color: "violet", dashed: true },
      ],
    },
    {
      say: "Imagine une colline {f} : le sommet est au-dessus de l'axe des x, et les deux côtés descendent. Chaque côté finit par croiser l'axe {q1} {q2}, donc il y a deux zéros.",
      mood: "dessine",
      do: [
        { type: "curve", id: "f", fn: "-(x-2)^2+3", color: "blue" },
        { type: "text", id: "q1", at: [0.15, -0.6], text: "?", color: "green" },
        { type: "text", id: "q2", at: [3.65, -0.6], text: "?", color: "green" },
      ],
    },
    {
      say: "Pour les trouver, on pose f de x égale zéro {n2}.",
      mood: "explique",
      do: [
        { type: "note", id: "n2", text: "−(x − 2)² + 3 = 0" },
        { type: "tag", text: "Ce qui bloque souvent : isoler une expression (sec 3)", tone: "warn" },
      ],
    },
    {
      say: "On isole le carré {n2}, puis on prend la racine carrée des deux côtés, sans oublier le plus ou moins. Donc x égale 2 plus ou moins racine de 3 {n4}.",
      mood: "idee",
      do: [
        { type: "transform", target: "n2", text: "(x − 2)² = 3" },
        { type: "note", id: "n4", text: "x = 2 ± √3", color: "green" },
      ],
    },
    {
      say: "Ça donne environ 3,73 {z2} et 0,27 {z1}. Regarde le graphique : ce sont exactement les deux points où la courbe coupe l'axe.",
      mood: "dessine",
      do: [
        { type: "erase", target: "q1" },
        { type: "erase", target: "q2" },
        { type: "point", id: "z1", at: [0.268, 0], label: "0,27", color: "green" },
        { type: "point", id: "z2", at: [3.732, 0], label: "3,73", color: "green" },
        { type: "group", id: "zeros", members: ["z1", "z2"] },
        { type: "dim", target: "axe" },
        { type: "highlight", target: "n4" },
      ],
    },
    {
      say: "À toi maintenant. Même ouverture vers le bas, mais cette fois le sommet est en 2, moins 1 {g}.",
      mood: "question",
      do: [{ type: "curve", id: "g", fn: "-(x-2)^2-1", color: "muted", style: "dashed" }],
      check: {
        prompt: "Combien de zéros aurait cette parabole ?",
        choices: ["0", "1", "2"],
        answer: 0,
        ifRight: "Bravo ! Le sommet est sous l'axe et la courbe ne fait que descendre : elle ne touche jamais l'axe des x. Tu viens de raisonner sans calculer.",
        ifWrong: "Presque. Le sommet est déjà sous l'axe, et la courbe descend des deux côtés : elle ne peut jamais remonter jusqu'à l'axe des x. Il n'y a donc aucun zéro.",
      },
    },
  ],
  end: {
    kind: "end",
    summary: [
      "Forme canonique : lire le sommet (2, 3)",
      "Isoler le carré, puis prendre la racine avec ± (notion de sec 3)",
      "Le nombre de zéros dépend de la position du sommet",
    ],
  },
};

export const projectileLesson: Lesson = {
  header: { kind: "lesson", title: "La portée d'un projectile", topic: "Mécanique · sec 5" },
  steps: [
    {
      say: "Une balle est lancée à 20 mètres par seconde, avec un angle de 37 degrés. On veut savoir à quelle distance elle retombe : c'est la portée.",
      mood: "explique",
      do: [
        { type: "axes", x: [-2, 44], y: [-3, 12], xLabel: "x (m)", yLabel: "y (m)" },
        { type: "vector", id: "v0", from: [0, 0], to: [6.4, 4.8], label: "v₀", color: "violet" },
        { type: "note", id: "n1", text: "v₀ = 20 m/s, à 37°" },
      ],
    },
    {
      say: "Le truc, c'est de séparer la vitesse en deux : une partie horizontale et une partie verticale.",
      mood: "dessine",
      do: [
        { type: "vector", id: "vx", from: [0, 0], to: [6.4, 0], label: "vx", color: "blue" },
        { type: "vector", id: "vy", from: [0, 0], to: [0, 4.8], label: "vy", color: "green" },
        { type: "segment", id: "p1", from: [6.4, 0], to: [6.4, 4.8], color: "muted", dashed: true },
        { type: "segment", id: "p2", from: [0, 4.8], to: [6.4, 4.8], color: "muted", dashed: true },
      ],
    },
    {
      say: "vx égale 20 fois cosinus de 37 degrés, environ 16 mètres par seconde. Et vy égale 20 fois sinus de 37 degrés, environ 12.",
      mood: "explique",
      do: [
        { type: "note", id: "n2", text: "vx = 20 cos 37° ≈ 16 m/s" },
        { type: "note", id: "n3", text: "vy = 20 sin 37° ≈ 12 m/s" },
      ],
    },
    {
      say: "À l'horizontale, rien ne freine la balle : vx reste à 16 pendant tout le vol. À la verticale, la gravité la ralentit, puis la fait redescendre.",
      mood: "dessine",
      do: [
        { type: "curve", id: "traj", fn: "0.75x - 4.9x^2/256", from: 0, to: 39.18, color: "blue", style: "dotted" },
        { type: "highlight", target: "vx" },
      ],
    },
    {
      say: "Petite question avant de calculer.",
      mood: "question",
      do: [{ type: "point", id: "haut", at: [19.6, 7.35], label: "sommet", color: "orange", ring: true }],
      check: {
        prompt: "Au sommet de la trajectoire, combien vaut vy ?",
        choices: ["0 m/s", "12 m/s", "16 m/s"],
        answer: 0,
        ifRight: "Exactement ! Au sommet, la balle arrête de monter : sa vitesse verticale est nulle. Seule vx continue.",
        ifWrong: "Pas tout à fait. Au sommet, la balle arrête de monter avant de redescendre : sa vitesse verticale est nulle à cet instant. Seule vx reste à 16.",
      },
    },
    {
      say: "Le temps de montée, c'est vy divisé par g : 12 divisé par 9,8, environ 1,22 seconde. La descente prend le même temps, donc le vol dure environ 2,45 secondes.",
      mood: "explique",
      do: [{ type: "note", id: "n4", text: "t = 2 × 12 ÷ 9,8 ≈ 2,45 s" }],
    },
    {
      say: "La portée, c'est la vitesse horizontale fois le temps de vol : 16 fois 2,45, environ 39 mètres.",
      mood: "bravo",
      do: [
        { type: "point", id: "chute", at: [39.18, 0], color: "green", ring: true },
        { type: "segment", id: "portee", from: [0, -1.8], to: [39.18, -1.8], label: "portée ≈ 39 m", color: "green" },
        { type: "note", id: "n5", text: "portée = 16 × 2,45 ≈ 39 m" },
      ],
    },
  ],
  end: {
    kind: "end",
    summary: [
      "Décomposer la vitesse : vx = v₀ cos θ, vy = v₀ sin θ",
      "vx reste constante ; vy s'annule au sommet",
      "Portée = vx × temps de vol",
    ],
  },
};

export const derivativeLesson: Lesson = {
  header: { kind: "lesson", title: "La dérivée, c'est une pente", topic: "Calcul différentiel · cégep" },
  steps: [
    {
      say: "Une dérivée, c'est une pente. Mais pas n'importe laquelle : la pente de la courbe à un point précis. Prenons f de x égale x au carré, et le point P de coordonnées 1, 1.",
      mood: "explique",
      do: [
        { type: "axes", x: [-1, 3], y: [-1, 5], xLabel: "x", yLabel: "y" },
        { type: "curve", id: "f", fn: "x^2", color: "blue" },
        { type: "point", id: "P", at: [1, 1], label: "P(1, 1)", color: "violet", ring: true },
        { type: "note", id: "n1", text: "f(x) = x²" },
      ],
    },
    {
      say: "Une courbe n'a pas une seule pente : elle change partout. Alors on prend un deuxième point Q, plus loin, et on trace la droite qui passe par les deux.",
      mood: "dessine",
      do: [
        { type: "point", id: "Q", at: [2, 4], label: "Q(2, 4)", color: "orange" },
        { type: "curve", id: "sec", fn: "3x - 2", from: 0.2, to: 2.3, color: "orange", style: "dashed" },
        { type: "note", id: "n2", text: "pente PQ = (4 − 1) ÷ (2 − 1) = 3" },
      ],
    },
    {
      say: "Maintenant, rapprochons Q de P. Avec Q en x égale 1,5, la pente tombe à 2,5.",
      mood: "dessine",
      do: [
        { type: "erase", target: "Q" },
        { type: "erase", target: "sec" },
        { type: "point", id: "Q2", at: [1.5, 2.25], label: "Q", color: "orange" },
        { type: "curve", id: "sec2", fn: "2.5x - 1.5", from: 0.3, to: 2.4, color: "orange", style: "dashed" },
        { type: "note", id: "n3", text: "Q en 1,5 : pente = 2,5" },
        { type: "focus", x: [0, 2.6], y: [-0.5, 4.2] },
      ],
    },
    {
      say: "Plus Q est proche de P, plus la droite colle à la courbe. À la limite, elle ne la touche plus qu'en P : c'est la tangente.",
      mood: "idee",
      do: [
        { type: "erase", target: "Q2" },
        { type: "erase", target: "sec2" },
        { type: "curve", id: "tan", fn: "2x - 1", from: 0, to: 2.5, color: "violet", label: "tangente" },
        { type: "highlight", target: "P" },
      ],
    },
    {
      say: "D'après toi, quelle est la pente de cette tangente ?",
      mood: "question",
      do: [],
      check: {
        prompt: "La pente de la tangente en P vaut…",
        choices: ["1", "2", "3"],
        answer: 1,
        ifRight: "Oui ! La pente vaut 2 : c'est la dérivée de x au carré en x égale 1. On écrit f prime de 1 égale 2.",
        ifWrong: "Regarde la suite : 3, puis 2,5… En rapprochant Q, la pente s'approche de 2. La dérivée de x au carré en x égale 1 vaut 2.",
      },
    },
    {
      say: "Et c'est la règle que tu verras en classe : la dérivée de x au carré, c'est 2x. En x égale 1, ça donne bien 2.",
      mood: "bravo",
      do: [
        { type: "note", id: "n4", text: "f′(x) = 2x, donc f′(1) = 2" },
        { type: "resetView" },
      ],
    },
  ],
  end: {
    kind: "end",
    summary: [
      "La dérivée en un point = la pente de la tangente",
      "On l'approche par des sécantes PQ de plus en plus courtes",
      "Pour f(x) = x² : f′(x) = 2x",
    ],
  },
};

export const DEMO_LESSONS = [quadraticLesson, projectileLesson, derivativeLesson] as const;

/** Suggestions affichées sur l'écran d'accueil (une par séance de démonstration). */
export const SUGGESTED_QUESTIONS = [
  "Comment je trouve les zéros de f(x) = −(x − 2)² + 3 ?",
  "Comment calculer la portée d'un projectile ?",
  "C'est quoi une dérivée, concrètement ?",
] as const;

const KEYWORDS: ReadonlyArray<[RegExp, Lesson]> = [
  [/z[ée]ro|quadrati|parabol|sommet|canonique|second degr|2e degr/i, quadraticLesson],
  [/projectile|port[ée]e|balle|lanc|trajectoire|cin[ée]matique/i, projectileLesson],
  [/d[ée]riv|tangente|pente|limite/i, derivativeLesson],
];

/** Séance de démonstration la plus proche de la question, ou `null`. */
export function matchDemoLesson(question: string): Lesson | null {
  return KEYWORDS.find(([pattern]) => pattern.test(question))?.[1] ?? null;
}
