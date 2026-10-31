/**
 * Vidéos d'exemple du studio, écrites à la main dans le langage de scène.
 *
 * Elles servent à trois choses : produire une vidéo sans service d'IA, montrer
 * au modèle le format attendu (voir server/studio/prompt.ts), et tester la
 * chronologie et le rendu avec des données réalistes.
 */
import type { StudioScript } from "@/domain/studio/script";

/** « Devine ce que l'équation dessine » : une rose polaire. */
export const roseVideo: StudioScript = {
  title: "L'équation qui dessine une fleur",
  hook: "Cette équation dessine… quoi ?",
  music: "lofi",
  cta: "Abonne-toi : une équation qui dessine chaque semaine",
  shots: [
    {
      text: "Une seule équation. Aucun dessin à la main.",
      bars: 2,
      do: [{ type: "text", id: "eq", text: "$r = 3\\sin(4\\theta)$", at: [0, 4.2], size: "large", color: "ink" }],
    },
    {
      text: "On fait tourner θ de 0 à 2π…",
      bars: 3,
      reveal: true,
      do: [{ type: "parametric", id: "rose", x: "3*sin(4*t)*cos(t)", y: "3*sin(4*t)*sin(t)", t: [0, 6.2832], color: "violet" }],
    },
    {
      text: "8 pétales ! Et si on remplace 4 par 5 ?",
      bars: 2,
      do: [
        { type: "transform", target: "rose", x: "3*sin(5*t)*cos(t)", y: "3*sin(5*t)*sin(t)" },
        { type: "transform", target: "eq", text: "$r = 3\\sin(5\\theta)$" },
      ],
    },
    {
      text: "Impair : 5 pétales. Pair : le double. Essaie avec 7 !",
      bars: 2,
      do: [{ type: "highlight", target: "rose" }],
    },
  ],
};

/** Un cœur tracé par deux fonctions du temps. */
export const heartVideo: StudioScript = {
  title: "Un cœur avec des sinus",
  hook: "Ton prof de maths peut dessiner ça ?",
  music: "electro",
  cta: "Envoie ça à quelqu'un qui dit que les maths, c'est froid",
  shots: [
    {
      text: "x(t) : un sinus au cube",
      bars: 2,
      do: [{ type: "text", id: "nx", text: "$x(t) = 16\\sin^3 t$", at: [0, 4.4] }],
    },
    {
      text: "y(t) : quatre cosinus empilés",
      bars: 2,
      do: [{ type: "text", id: "ny", text: "$y(t) = 13\\cos t - 5\\cos 2t - 2\\cos 3t - \\cos 4t$", at: [0, 3.5], size: "small" }],
    },
    {
      text: "On relie tous les points (x(t), y(t))…",
      bars: 3,
      reveal: true,
      do: [
        {
          type: "parametric",
          id: "coeur",
          x: "0.2*16*sin(t)^3",
          y: "0.2*(13*cos(t)-5*cos(2*t)-2*cos(3*t)-cos(4*t))",
          t: [0, 6.2832],
          color: "orange",
        },
      ],
    },
    {
      text: "Les maths, c'est aussi de l'amour ❤",
      bars: 2,
      do: [{ type: "highlight", target: "coeur" }],
    },
  ],
};

/** Physique du sport : la trajectoire d'un lancer franc. */
export const basketVideo: StudioScript = {
  title: "Le lancer parfait est une parabole",
  hook: "Pourquoi ce lancer rentre à tous les coups",
  music: "epic",
  cta: "La physique de ton sport préféré : nesalio.com",
  shots: [
    {
      text: "Le ballon part de la main du joueur",
      bars: 2,
      do: [
        { type: "axes", x: [0, 8], y: [0, 5], xLabel: "distance (m)", yLabel: "hauteur (m)" },
        { type: "point", id: "main", at: [0.5, 1.8], label: "départ", color: "orange", ring: true },
      ],
    },
    {
      text: "La gravité le tire vers le bas, toujours aussi fort",
      bars: 3,
      reveal: true,
      do: [{ type: "curve", id: "tir", fn: "-0.24*(x-4)^2+4.74", from: 0.5, to: 7.2, color: "orange" }],
    },
    {
      text: "Résultat : une parabole parfaite",
      bars: 2,
      do: [
        { type: "point", id: "sommet", at: [4, 4.74], label: "sommet", color: "violet", ring: true },
        { type: "text", id: "eqtir", text: "$y = -0{,}24(x-4)^2 + 4{,}74$", near: "sommet", side: "above" },
      ],
    },
    {
      text: "Il redescend pile dans le panier",
      bars: 2,
      do: [
        { type: "point", id: "panier", at: [7.2, 2.28], label: "panier", color: "green", ring: true },
        { type: "highlight", target: "tir" },
      ],
    },
  ],
};

/** Physique de la musique : trouver la note cachée dans un son en l'enroulant autour d'un cercle (Fourier). */
export const musicVideo: StudioScript = {
  title: "Trouver une note avec un cercle",
  hook: "Comment trouver la note cachée dans un son",
  music: "electro",
  cta: "La physique cachée de la musique : nesalio.com",
  shots: [
    {
      text: "Un son : une onde qui monte et descend",
      bars: 2,
      do: [
        { type: "axes", x: [0, 6.3], y: [-1, 3], xLabel: "temps", yLabel: "pression" },
        { type: "curve", id: "onde", fn: "1+cos(3*x)", from: 0, to: 6.283, color: "blue" },
      ],
    },
    {
      text: "On l'enroule autour d'un cercle…",
      bars: 2,
      do: [
        { type: "clear", axes: true },
        { type: "parametric", id: "son", x: "(1+cos(3*t))*cos(1*t)", y: "(1+cos(3*t))*sin(1*t)", t: [0, 12.566], color: "blue", mass: true },
      ],
    },
    {
      text: "Le point orange : le centre de masse du dessin",
      bars: 2,
      do: [{ type: "highlight", target: "son-masse" }],
    },
    {
      text: "On enroule plus vite : il reste au centre",
      bars: 2,
      do: [{ type: "transform", target: "son", x: "(1+cos(3*t))*cos(2*t)", y: "(1+cos(3*t))*sin(2*t)" }],
    },
    {
      text: "À la bonne vitesse… il s'échappe du centre !",
      bars: 3,
      reveal: true,
      do: [{ type: "transform", target: "son", x: "(1+cos(3*t))*cos(3*t)", y: "(1+cos(3*t))*sin(3*t)" }],
    },
    {
      text: "Cette vitesse, c'est la fréquence cachée dans le son",
      bars: 2,
      do: [{ type: "highlight", target: "son" }],
    },
  ],
};

export const STUDIO_DEMOS: readonly StudioScript[] = [roseVideo, heartVideo, basketVideo, musicVideo];
