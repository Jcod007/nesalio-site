/**
 * Couleurs et polices de Nesalio pour le canevas (Konva ne lit pas les
 * variables CSS). Les mêmes valeurs sont déclarées dans globals.css.
 */

export const BRAND = {
  paper: "#F6F8FC",
  grid: "#DFE6F3",
  ink: "#18223A",
  muted: "#56617A",
  violet: "#5A45D6",
  violetDeep: "#4532B8",
  blue: "#2E6BE6",
  green: "#23936A",
  orange: "#E07A2E",
  warn: "#A84F0E",
} as const;

export const FONTS = {
  hand: "Caveat, cursive",
  body: '"Atkinson Hyperlegible", system-ui, sans-serif',
  display: '"Bricolage Grotesque Variable", system-ui, sans-serif',
} as const;

/** Forme de Nesa (états de nesa.js) selon ce qu'elle fait. */
export type NesaState = "repos" | "ecoute" | "parle" | "reflechit" | "stylo" | "idee" | "bravo" | "content" | "clin";
