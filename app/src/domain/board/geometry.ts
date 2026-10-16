/**
 * Géométrie du tableau : échantillonnage des courbes et graduations.
 * Fonctions pures, indépendantes du moteur de rendu.
 */
import { tryCompileExpression } from "@/domain/math/expr";
import type { Frame } from "./state";

/**
 * Échantillonne y = f(x) en morceaux continus (coordonnées mathématiques).
 * On coupe la courbe là où elle n'est pas définie ou sort largement du cadre.
 */
export function sampleCurve(
  fn: string,
  frame: Frame,
  from?: number,
  to?: number,
  samples = 260,
): Array<Array<[number, number]>> {
  const f = tryCompileExpression(fn);
  if (!f) return [];
  const [xmin, xmax] = frame.x;
  const [ymin, ymax] = frame.y;
  const margin = (ymax - ymin) * 0.06;
  const a = Math.max(from ?? xmin, xmin - (xmax - xmin) * 0.02);
  const b = Math.min(to ?? xmax, xmax + (xmax - xmin) * 0.02);
  if (!(b > a)) return [];

  const pieces: Array<Array<[number, number]>> = [];
  let current: Array<[number, number]> = [];
  for (let i = 0; i <= samples; i++) {
    const x = a + ((b - a) * i) / samples;
    const y = f(x);
    const inside = Number.isFinite(y) && y >= ymin - margin && y <= ymax + margin;
    if (inside) current.push([x, y]);
    else if (current.length > 0) {
      pieces.push(current);
      current = [];
    }
  }
  if (current.length > 1) pieces.push(current);
  return pieces.filter((piece) => piece.length > 1);
}

/** Pas de graduation « rond » (1, 2, 5 × 10ⁿ) pour environ `target` graduations. */
export function niceStep(span: number, target = 8): number {
  const raw = span / target;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const unit = raw / power;
  const nice = unit < 1.5 ? 1 : unit < 3.5 ? 2 : unit < 7.5 ? 5 : 10;
  return nice * power;
}

export function ticks(range: [number, number], target = 8): number[] {
  const step = niceStep(range[1] - range[0], target);
  const out: number[] = [];
  for (let v = Math.ceil(range[0] / step) * step; v <= range[1] + 1e-9; v += step) {
    const rounded = Math.round(v / step) * step;
    if (Math.abs(rounded) > 1e-9) out.push(Number(rounded.toPrecision(12)));
  }
  return out;
}

/** Nombre formaté à la québécoise (virgule décimale). */
export function formatNumber(value: number): string {
  return String(Number(value.toPrecision(6))).replace(".", ",");
}
