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

/** Une expression en t, compilée (la variable s'écrit t ; le compilateur ne connaît que x). */
export function compileInT(source: string): ((t: number) => number) | null {
  return tryCompileExpression(source.replace(/\bt\b/g, "x"));
}

/** Points d'une courbe paramétrée (x(t), y(t)), t de t0 à t1 ; les valeurs non définies sont sautées. */
export function sampleParametric(x: string, y: string, [t0, t1]: [number, number], samples = 480): Array<[number, number]> {
  const fx = compileInT(x);
  const fy = compileInT(y);
  if (!fx || !fy) return [];
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= samples; i++) {
    const t = t0 + ((t1 - t0) * i) / samples;
    const p: [number, number] = [fx(t), fy(t)];
    if (Number.isFinite(p[0]) && Number.isFinite(p[1])) out.push(p);
  }
  return out;
}

/**
 * Région entre y = f(x) et l'axe des x, de a à b : la partie au-dessus de
 * l'axe et la partie en dessous, chacune fermée le long de l'axe.
 */
export function areaRegions(fn: string, a: number, b: number, samples = 120): { above: Array<[number, number]>; below: Array<[number, number]> } {
  const f = tryCompileExpression(fn);
  if (!f || !(b > a)) return { above: [], below: [] };
  const xs = Array.from({ length: samples + 1 }, (_, i) => a + ((b - a) * i) / samples);
  const ys = xs.map((x) => (Number.isFinite(f(x)) ? f(x) : 0));
  const region = (clip: (y: number) => number) => {
    const edge = xs.map((x, i) => [x, clip(ys[i]!)] as [number, number]);
    if (edge.every(([, y]) => Math.abs(y) < 1e-9)) return [];
    return [[a, 0] as [number, number], ...edge, [b, 0] as [number, number]];
  };
  return { above: region((y) => Math.max(0, y)), below: region((y) => Math.min(0, y)) };
}

/**
 * Centre de masse d'une courbe paramétrée parcourue à vitesse régulière en t :
 * la moyenne des points (le dernier, qui referme souvent la boucle, n'est pas compté deux fois).
 */
export function centerOfMass(points: ReadonlyArray<readonly [number, number]>): [number, number] {
  const used = points.length > 1 ? points.slice(0, -1) : points;
  const n = Math.max(1, used.length);
  return [used.reduce((a, p) => a + p[0], 0) / n, used.reduce((a, p) => a + p[1], 0) / n];
}
