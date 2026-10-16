/**
 * Couleurs et polices de Nesalio pour le canevas (Konva ne lit pas les
 * variables CSS). Les mêmes valeurs sont déclarées dans globals.css.
 */
import type { ColorName } from "@/domain/scene/schema";
import type { Mood } from "@/domain/scene/schema";
import type { PlayerStatus } from "@/engine/player";

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
  warn: "#B5560F",
} as const;

export const STROKE: Record<ColorName, string> = {
  violet: BRAND.violet,
  blue: BRAND.blue,
  green: BRAND.green,
  orange: BRAND.orange,
  ink: BRAND.ink,
  muted: "#8A94AA",
};

export const FONTS = {
  hand: "Caveat, cursive",
  body: '"Atkinson Hyperlegible", system-ui, sans-serif',
  display: '"Bricolage Grotesque Variable", system-ui, sans-serif',
} as const;

/** Forme de Nesa (états de nesa.js) selon ce qu'elle fait. */
export type NesaState = "repos" | "ecoute" | "parle" | "reflechit" | "stylo" | "idee" | "bravo" | "content" | "clin";

const BY_MOOD: Record<Mood, NesaState> = {
  explique: "parle",
  dessine: "stylo",
  question: "reflechit",
  idee: "idee",
  bravo: "bravo",
};

export function nesaStateFor(status: PlayerStatus, mood: Mood | undefined, listening: boolean): NesaState {
  if (listening) return "ecoute";
  switch (status) {
    case "idle":
      return "repos";
    case "thinking":
      return "reflechit";
    case "paused":
      return "ecoute";
    case "checking":
      return "reflechit";
    case "done":
      return "content";
    case "error":
      return "repos";
    case "playing":
      return mood ? BY_MOOD[mood] : "parle";
  }
}
