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

export const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];

/** Pied de la perpendiculaire abaissée de `p` sur la droite (a, b). */
export function footOnLine(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const d = sub(b, a);
  return add(a, scale(d, dot(sub(p, a), d) / dot(d, d)));
}

/** Position du pied de `p` sur (a, b) : 0 en a, 1 en b (hors de [0, 1] : sur le prolongement). */
export function footParameter(p: Vec2, a: Vec2, b: Vec2): number {
  const d = sub(b, a);
  return dot(sub(p, a), d) / dot(d, d);
}

/** Intersection des droites (p1, p2) et (q1, q2) ; null si elles sont parallèles. */
export function intersectLines(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2): Vec2 | null {
  const r = sub(p2, p1);
  const s = sub(q2, q1);
  const cross = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(cross) < 1e-12) return null;
  const t = ((q1[0] - p1[0]) * s[1] - (q1[1] - p1[1]) * s[0]) / cross;
  return add(p1, scale(r, t));
}

/** Le point est-il à l'intérieur du polygone (règle pair-impair) ? */
export function insidePolygon([x, y]: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * La corde de la droite passant par `p` (direction `u`) dans le polygone : le morceau de droite
 * intérieur qui contient `p` (ou qui part de `p` s'il est sur un côté). null si la droite ne
 * traverse pas le polygone. Sert à arrêter une parallèle aux côtés d'un triangle (Thalès).
 */
export function chordThrough(p: Vec2, u: Vec2, polygon: readonly Vec2[]): [Vec2, Vec2] | null {
  const ts: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const e = sub(b, a);
    const cross = u[0] * e[1] - u[1] * e[0];
    if (Math.abs(cross) < 1e-12) continue;
    const w = sub(a, p);
    const t = (w[0] * e[1] - w[1] * e[0]) / cross;
    const s = (w[0] * u[1] - w[1] * u[0]) / cross;
    if (s >= -1e-9 && s <= 1 + 1e-9) ts.push(t);
  }
  const cuts = [...new Set(ts.map((t) => Math.round(t * 1e9) / 1e9))].sort((a, b) => a - b);
  const at = (t: number) => add(p, scale(u, t));
  // Les morceaux intérieurs qui touchent p ; s'il y en a deux (p sur un côté), le plus long.
  let best: [number, number] | null = null;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const [t0, t1] = [cuts[i]!, cuts[i + 1]!];
    if (t0 > 1e-9 || t1 < -1e-9 || !insidePolygon(at((t0 + t1) / 2), polygon)) continue;
    if (!best || t1 - t0 > best[1] - best[0]) best = [t0, t1];
  }
  return best ? [at(best[0]), at(best[1])] : null;
}

/** Symétrique de `p` par rapport à la droite (a, b). */
export function reflectAcross(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  return sub(scale(footOnLine(p, a, b), 2), p);
}

/**
 * Sommets d'un polygone régulier à `n` côtés de longueur `side`, centré en `center`, dans le sens
 * antihoraire, posé sur un côté horizontal en bas.
 */
export function regularPolygon(n: number, side: number, center: Vec2 = [0, 0]): Vec2[] {
  const R = side / (2 * Math.sin(Math.PI / n));
  return Array.from({ length: n }, (_, k) => {
    const t = -Math.PI / 2 - Math.PI / n + (2 * Math.PI * k) / n;
    return [center[0] + R * Math.cos(t), center[1] + R * Math.sin(t)] as Vec2;
  });
}

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

/**
 * Triangle quelconque ABC à partir de trois mesures, comme en classe : a = BC, b = CA, c = AB,
 * angles A, B, C en degrés. Cas CCC, CAC, ACA, AAC, et CCA (le cas ambigu donne l'angle aigu ;
 * "obtuse" choisit l'autre solution). `null` si les mesures ne forment pas de triangle.
 */
export interface TriangleMeasures {
  a?: number;
  b?: number;
  c?: number;
  A?: number;
  B?: number;
  C?: number;
}
export interface SolvedTriangle {
  a: number;
  b: number;
  c: number;
  A: number;
  B: number;
  C: number;
}
export function solveTriangle(given: TriangleMeasures, obtuse = false): SolvedTriangle | null {
  let { a, b, c, A, B, C } = given;
  const angles = [A, B, C].filter((x) => x !== undefined).length;
  if (angles === 2) {
    A ??= 180 - B! - C!;
    B ??= 180 - A - C!;
    C ??= 180 - A - B;
  }
  if ([A, B, C].some((x) => x !== undefined && (x <= 0 || x >= 180))) return null;
  const sides = [a, b, c].filter((x) => x !== undefined).length;
  if (sides === 0) return null;
  const law = (side: number, opposite: number, angle: number) => (side * Math.sin(rad(angle))) / Math.sin(rad(opposite));
  if (A !== undefined && B !== undefined && C !== undefined) {
    if (Math.abs(A + B + C - 180) > 1e-6) return null;
    // Loi des sinus à partir du côté connu.
    const [side, opp] = a !== undefined ? [a, A] : b !== undefined ? [b, B] : [c!, C];
    a ??= law(side, opp, A);
    b ??= law(side, opp, B);
    c ??= law(side, opp, C);
    return { a, b, c, A, B, C };
  }
  const cosLaw = (x: number, y: number, angle: number) => Math.sqrt(x * x + y * y - 2 * x * y * Math.cos(rad(angle)));
  const angleFrom = (opp: number, x: number, y: number) => {
    const v = (x * x + y * y - opp * opp) / (2 * x * y);
    return v < -1 || v > 1 ? NaN : deg(Math.acos(v));
  };
  if (sides === 3) {
    if (a! + b! <= c! || b! + c! <= a! || a! + c! <= b!) return null;
    return { a: a!, b: b!, c: c!, A: angleFrom(a!, b!, c!), B: angleFrom(b!, a!, c!), C: angleFrom(c!, a!, b!) };
  }
  if (sides === 2 && angles === 1) {
    // CAC : l'angle est entre les deux côtés connus.
    if (A !== undefined && b !== undefined && c !== undefined) a = cosLaw(b, c, A);
    else if (B !== undefined && a !== undefined && c !== undefined) b = cosLaw(a, c, B);
    else if (C !== undefined && a !== undefined && b !== undefined) c = cosLaw(a, b, C);
    else {
      // CCA : un angle opposé à un côté connu.
      const pairs: Array<["a" | "b" | "c", "A" | "B" | "C"]> = [["a", "A"], ["b", "B"], ["c", "C"]];
      const known = { a, b, c, A, B, C } as Record<string, number | undefined>;
      const pair = pairs.find(([s, ang]) => known[s] !== undefined && known[ang] !== undefined);
      if (!pair) return null;
      const other = pairs.find(([s]) => s !== pair[0] && known[s] !== undefined)!;
      const sine = (known[other[0]]! * Math.sin(rad(known[pair[1]]!))) / known[pair[0]]!;
      if (sine > 1) return null;
      let otherAngle = deg(Math.asin(sine));
      if (obtuse) otherAngle = 180 - otherAngle;
      known[other[1]] = otherAngle;
      if (known[pair[1]]! + otherAngle >= 180) return null;
      const rest = pairs.find(([s]) => s !== pair[0] && s !== other[0])!;
      known[rest[1]] = 180 - known[pair[1]]! - otherAngle;
      known[rest[0]] = law(known[pair[0]]!, known[pair[1]]!, known[rest[1]]!);
      return { a: known.a!, b: known.b!, c: known.c!, A: known.A!, B: known.B!, C: known.C! };
    }
    return solveTriangle({ a, b, c });
  }
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
