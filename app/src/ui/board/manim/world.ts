/**
 * Types et petits calculs partagés par le rendu (coordonnées du monde Manim).
 */
import type { Animation, Mobject } from "manim-web";

export type Vec3 = [number, number, number];

export interface TimedAnimation {
  animation: Animation;
  /** Secondes depuis le moment où le lot est lancé. */
  start: number;
  end: number;
}

export interface PlannedAnimation {
  delay: number;
  share: number;
  make: (seconds: number) => Animation;
}

/** Les mobjects d'un nœud et leurs animations d'apparition (`delay`, `share` : fractions de la durée prévue). */
export interface Built {
  mobjects: Mobject[];
  animations: PlannedAnimation[];
}

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const rad = (degrees: number) => (degrees * Math.PI) / 180;
