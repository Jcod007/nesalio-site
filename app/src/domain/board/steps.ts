/**
 * Fonction partie entière, forme du programme de SN 4 : f(x) = a[b(x − h)] + k.
 *
 * Calcul exact des marches, sans échantillonnage : chaque marche est un
 * segment horizontal, avec un point plein au bout où la valeur est atteinte et
 * un point vide à l'autre bout.
 *   - b > 0 : la marche n va de x = h + n/b (inclus, point plein) à
 *     x = h + (n + 1)/b (exclu, point vide) ;
 *   - b < 0 : l'intervalle se retourne, le point plein passe à DROITE.
 * Longueur d'une marche : 1/|b| ; écart vertical entre deux marches : |a|.
 */
import type { Vec2 } from "./state";

export interface StepParams {
  a: number;
  b: number;
  h: number;
  k: number;
}

export interface Step {
  /** Indice n de la marche : [b(x − h)] = n sur la marche. */
  n: number;
  /** Ordonnée de la marche : a·n + k. */
  y: number;
  /** Bout gauche et bout droit, rognés aux bornes demandées. */
  from: Vec2;
  to: Vec2;
  /** Bout où la valeur est atteinte (point plein), s'il est dans les bornes. */
  closed: Vec2 | null;
  /** Bout exclu (point vide), s'il est dans les bornes. */
  open: Vec2 | null;
}

/** Nombre maximal de marches dessinées (au-delà, le tableau devient illisible). */
export const MAX_STEPS = 40;

const EPS = 1e-9;
const clean = (v: number) => (Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : v);

/** Valeur exacte de a[b(x − h)] + k (la partie entière d'un entier reste cet entier, malgré les arrondis). */
export function stepValue(p: StepParams, x: number): number {
  return p.a * Math.floor(clean(p.b * (x - p.h))) + p.k;
}

/** Nombre de marches entre from et to (pour refuser un escalier illisible avant de le calculer). */
export function stepCount(p: StepParams, from: number, to: number): number {
  if (p.b === 0 || !(to > from)) return 0;
  return Math.ceil(Math.abs(p.b) * (to - from)) + 1;
}

/** Les marches de a[b(x − h)] + k sur [from, to], de gauche à droite. */
export function stepsOf(p: StepParams, from: number, to: number): Step[] {
  if (p.b === 0 || !(to > from) || stepCount(p, from, to) > MAX_STEPS + 1) return [];
  const u1 = p.b * (from - p.h);
  const u2 = p.b * (to - p.h);
  const lo = Math.floor(clean(Math.min(u1, u2)));
  const hi = Math.floor(clean(Math.max(u1, u2)));
  const steps: Step[] = [];
  for (let n = lo; n <= hi; n++) {
    const xClosed = clean(p.h + n / p.b);
    const xOpen = clean(p.h + (n + 1) / p.b);
    const left = Math.max(from, Math.min(xClosed, xOpen));
    const right = Math.min(to, Math.max(xClosed, xOpen));
    if (!(right - left > EPS)) continue;
    const y = clean(p.a * n + p.k);
    const inside = (x: number) => x >= from - EPS && x <= to + EPS;
    steps.push({
      n,
      y,
      from: [left, y],
      to: [right, y],
      closed: inside(xClosed) ? [xClosed, y] : null,
      open: inside(xOpen) ? [xOpen, y] : null,
    });
  }
  return steps.sort((s, t) => s.from[0] - t.from[0]);
}

const sign = (v: number) => (v < 0 ? "−" : "+");
const num = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return String(Math.abs(r)).replace(".", ",");
};

/** La règle écrite comme en classe : f(x) = 2[3(x − 1)] + 4, sans les paramètres neutres. */
export function stepRule(p: StepParams, name = "f"): string {
  const a = p.a === 1 ? "" : p.a === -1 ? "−" : `${p.a < 0 ? "−" : ""}${num(p.a)}`;
  const inner = p.h === 0 ? "x" : `x ${sign(-p.h)} ${num(p.h)}`;
  const bx = p.b === 1 ? inner : p.b === -1 ? (p.h === 0 ? "−x" : `−(${inner})`) : `${p.b < 0 ? "−" : ""}${num(p.b)}${p.h === 0 ? "x" : `(${inner})`}`;
  const k = p.k === 0 ? "" : ` ${sign(p.k)} ${num(p.k)}`;
  return `${name}(x) = ${a}[${bx}]${k}`;
}
