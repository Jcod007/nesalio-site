/**
 * Boîtes englobantes : opérations élémentaires, en coordonnées mathématiques.
 */
import type { Frame, Vec2 } from "../state";
import type { Box, Extent } from "./measure";

export const boxAround = ([x, y]: Vec2, { w, h }: Extent): Box => ({ x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 });
export const boxCenter = (b: Box): Vec2 => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
export const boxExtent = (b: Box): Extent => ({ w: b.x1 - b.x0, h: b.y1 - b.y0 });
export const intersects = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
export function union(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  return boxes.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }));
}
export const frameBox = (frame: Frame): Box => ({ x0: frame.x[0], y0: frame.y[0], x1: frame.x[1], y1: frame.y[1] });
export const fromPoints = (points: Vec2[]): Box =>
  union(points.map(([x, y]) => ({ x0: x, y0: y, x1: x, y1: y })))!;
export const shift = (b: Box, [dx, dy]: Vec2): Box => ({ x0: b.x0 + dx, y0: b.y0 + dy, x1: b.x1 + dx, y1: b.y1 + dy });

/** Points régulièrement espacés de `a` à `b` (n intervalles). */
export function sampleLine(a: Vec2, b: Vec2, n: number): Vec2[] {
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as Vec2);
}
