/**
 * Géométrie des figures paramétriques : l'IA donne des paramètres (« triangle
 * rectangle, angle 30°, hypoténuse 5 »), on calcule les sommets exacts.
 * Fonctions pures, en coordonnées mathématiques ; angles en degrés.
 */
import type { Vec2 } from "./state";

export const rad = (deg: number) => (deg * Math.PI) / 180;
export const deg = (r: number) => (r * 180) / Math.PI;
export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const scale = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];
export const norm = (a: Vec2) => Math.hypot(a[0], a[1]);
export const unit = (a: Vec2): Vec2 => scale(a, 1 / (norm(a) || 1));
export const centroid = (points: readonly Vec2[]): Vec2 => scale(points.reduce(add, [0, 0]), 1 / Math.max(1, points.length));

/** Rotation de `p` autour de `origin`. */
export function rotate(p: Vec2, origin: Vec2, degrees: number): Vec2 {
  const [dx, dy] = sub(p, origin);
  const c = Math.cos(rad(degrees));
  const s = Math.sin(rad(degrees));
  return [origin[0] + dx * c - dy * s, origin[1] + dx * s + dy * c];
}

export interface RightTriangleSpec {
  base?: number;
  height?: number;
  hyp?: number;
  /** Angle aigu au sommet A (entre la base et l'hypoténuse). */
  angle?: number;
}

/** Base et hauteur d'un triangle rectangle à partir de deux données quelconques ; `null` si impossible. */
export function solveRightTriangle({ base, height, hyp, angle }: RightTriangleSpec): { base: number; height: number } | null {
  const t = angle !== undefined ? rad(angle) : undefined;
  if (base !== undefined && height !== undefined) return { base, height };
  if (t !== undefined && hyp !== undefined) return { base: hyp * Math.cos(t), height: hyp * Math.sin(t) };
  if (t !== undefined && base !== undefined) return { base, height: base * Math.tan(t) };
  if (t !== undefined && height !== undefined) return { base: height / Math.tan(t), height };
  if (base !== undefined && hyp !== undefined && hyp > base) return { base, height: Math.sqrt(hyp * hyp - base * base) };
  if (height !== undefined && hyp !== undefined && hyp > height) return { base: Math.sqrt(hyp * hyp - height * height), height };
  return null;
}

/** Arc qui marque l'angle en `vertex` entre les directions vers `a` et vers `b` (le plus petit des deux). */
export function angleArc(vertex: Vec2, a: Vec2, b: Vec2): { start: number; end: number } {
  let start = deg(Math.atan2(a[1] - vertex[1], a[0] - vertex[0]));
  let end = deg(Math.atan2(b[1] - vertex[1], b[0] - vertex[0]));
  let sweep = end - start;
  while (sweep <= -180) sweep += 360;
  while (sweep > 180) sweep -= 360;
  if (sweep < 0) {
    [start, end] = [start + sweep, start];
    sweep = -sweep;
  }
  return { start, end: start + sweep };
}

/** Marque d'angle droit (petit carré ouvert) en `vertex`, entre les directions vers `a` et vers `b`. */
export function rightAngleMark(vertex: Vec2, a: Vec2, b: Vec2, size: number): Vec2[] {
  const u = scale(unit(sub(a, vertex)), size);
  const v = scale(unit(sub(b, vertex)), size);
  return [add(vertex, u), add(add(vertex, u), v), add(vertex, v)];
}

/** Position d'une étiquette de sommet : un peu à l'extérieur de la figure. */
export function outward(vertex: Vec2, center: Vec2, distance: number): Vec2 {
  return add(vertex, scale(unit(sub(vertex, center)), distance));
}

/** Points d'un arc, pour les boîtes englobantes et les obstacles. */
export function arcPoints(center: Vec2, radius: number, start: number, end: number, samples = 24): Vec2[] {
  return Array.from({ length: samples + 1 }, (_, i) => {
    const t = rad(start + ((end - start) * i) / samples);
    return [center[0] + radius * Math.cos(t), center[1] + radius * Math.sin(t)] as Vec2;
  });
}
