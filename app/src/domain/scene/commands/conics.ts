/**
 * Coniques (SN 5) dans le plan cartésien : cercle, ellipse, hyperbole et
 * parabole, avec leurs éléments (centre, sommets, foyers, asymptotes,
 * directrice). Le modèle donne les paramètres de l'équation ; le moteur trace
 * la courbe exacte et place les foyers (c² = a² − b² pour l'ellipse,
 * c² = a² + b² pour l'hyperbole), au lieu que le modèle les calcule.
 *
 * Équations (forme canonique) :
 * - ellipse : (x − h)²/a² + (y − k)²/b² = 1 ;
 * - hyperbole : (x − h)²/a² − (y − k)²/b² = 1 (« horizontal ») ou l'inverse (« vertical ») ;
 * - parabole : (x − h)² = 4c(y − k) (ouverte vers le haut si c > 0), ou (y − k)² = 4c(x − h) (« horizontal »).
 */
import { z } from "zod";
import { type BoardNode, type BoardState, type Reveal, type Vec2 } from "@/domain/board/state";
import { formatNumber } from "@/domain/board/geometry";
import { norm, sub } from "@/domain/board/shapes";
import { ColorName, Coord, finite } from "../primitives";
import { base } from "./figure";
import { defineCommand } from "./define";
import { drawFigure, point, segment, ShapeId, type Color } from "./parts";

const curve = (id: string, points: Vec2[], reveal: Reveal, color: Color, closed = false): BoardNode => ({
  ...base(id, reveal, color),
  type: "polygon",
  points,
  closed,
});

/** Les bornes visibles : le repère s'il y en a un, sinon le cadre. */
const bounds = (state: BoardState) => state.axes?.frame ?? state.frame;

/** Une droite y = y0 + m(x − x0) (ou verticale x = x0) coupée aux bords du repère. */
function lineAcross(state: BoardState, x0: number, y0: number, m: number | "vertical"): [Vec2, Vec2] {
  const f = bounds(state);
  if (m === "vertical") return [[x0, f.y[0]], [x0, f.y[1]]];
  return [[f.x[0], y0 + m * (f.x[0] - x0)], [f.x[1], y0 + m * (f.x[1] - x0)]];
}

export const conicCommand = defineCommand({
  schema: z.object({
    type: z.literal("conic"),
    id: ShapeId,
    kind: z.enum(["circle", "ellipse", "hyperbola", "parabola"]),
    center: Coord.optional(),
    a: finite.positive().optional(),
    b: finite.positive().optional(),
    r: finite.positive().optional(),
    c: finite.refine((v) => v !== 0).optional(),
    orientation: z.enum(["horizontal", "vertical"]).optional(),
    foci: z.boolean().optional(),
    elements: z.boolean().optional(),
    /** Des points de la courbe, donnés par leur abscisse (le moteur calcule l'ordonnée ; "below" pour l'autre moitié). */
    points: z.array(z.object({ name: z.string().trim().min(1).max(4), x: finite, below: z.boolean().optional() })).max(3).optional(),
    /** Avec "points" : les distances de chaque point aux foyers (et à la directrice d'une parabole), mesurées. */
    distances: z.boolean().optional(),
    color: ColorName.optional(),
  }),
  doc:
    '{"type":"conic","id":"e","kind":"ellipse","center":[0,0],"a":5,"b":3,"foci":true} : conique exacte dans le repère\n' +
    '  (trace "axes" d\'abord). "circle" ("r") ; "ellipse" (x−h)²/a² + (y−k)²/b² = 1 ; "hyperbola" (x−h)²/a² − (y−k)²/b² = 1,\n' +
    '  "orientation":"vertical" pour (y−k)²/b² − (x−h)²/a² = 1 ; "parabola" de sommet "center" et de paramètre "c" :\n' +
    '  (x−h)² = 4c(y−k), "orientation":"horizontal" pour (y−k)² = 4c(x−h). Le moteur place les foyers ("foci", calculés),\n' +
    '  et avec "elements" : sommets, asymptotes (hyperbole), directrice (parabole). Parties : e-courbe, e-F1, e-F2, e-centre,\n' +
    '  e-asymptote-1, e-directrice ; les foyers se visent par leur nom (F1, F2, F).\n' +
    '  "points":[{"name":"P","x":3}] place P sur la courbe (le moteur calcule y ; "below":true pour la moitié du bas) et,\n' +
    '  avec "distances":true, trace PF₁ et PF₂ avec leurs longueurs (parabole : PF et la distance à la directrice).\n' +
    '  Redemande la conique avec un autre "x" pour promener P : les distances changent, leur somme non.',
  duration: 2400,
  aliases: ["ellipse", "hyperbola", "parabola"],
  apply(state, action, reveal) {
    const [h, k] = action.center ?? [0, 0];
    const color = action.color ?? "blue";
    const id = action.id;
    const parts: BoardNode[] = [];
    const vertices: Record<string, Vec2> = { centre: [h, k] };
    const f = bounds(state);
    const vertical = action.orientation === "vertical";
    /** Ce qu'il faut pour placer des points sur la courbe : ses foyers, y en fonction de x, la directrice. */
    let foci: Vec2[] = [];
    let yAt: (x: number, below: boolean) => number | null = () => null;
    let directrixFoot: ((p: Vec2) => Vec2) | null = null;
    const root = (v: number) => (v >= -1e-12 ? Math.sqrt(Math.max(0, v)) : null);
    const side = (below: boolean, r: number | null, center: number) => (r === null ? null : center + (below ? -r : r));

    switch (action.kind) {
      case "circle": {
        const r = action.r ?? action.a;
        if (r === undefined) return state;
        parts.push({ ...base(`${id}-courbe`, reveal, color), type: "circle", center: [h, k], radius: r });
        parts.push(point(`${id}-centre`, [h, k], undefined, reveal, "ink"));
        if (action.elements) parts.push(segment(`${id}-rayon`, [h, k], [h + r, k], reveal, "violet"));
        foci = [[h, k]];
        yAt = (x, below) => side(below, root(r * r - (x - h) ** 2), k);
        break;
      }
      case "ellipse": {
        const { a, b } = action;
        if (a === undefined || b === undefined) return state;
        const pts = Array.from({ length: 96 }, (_, i) => {
          const t = (2 * Math.PI * i) / 96;
          return [h + a * Math.cos(t), k + b * Math.sin(t)] as Vec2;
        });
        parts.push(curve(`${id}-courbe`, pts, reveal, color, true));
        const c = Math.sqrt(Math.abs(a * a - b * b));
        const [F1, F2]: [Vec2, Vec2] = a >= b ? [[h - c, k], [h + c, k]] : [[h, k - c], [h, k + c]];
        if (action.foci && c > 1e-9) {
          parts.push(point(`${id}-F1`, F1, "F₁", reveal, "orange"), point(`${id}-F2`, F2, "F₂", reveal, "orange"));
          Object.assign(vertices, { F1, F2 });
        }
        if (action.elements) {
          parts.push(point(`${id}-centre`, [h, k], undefined, reveal, "ink"));
          parts.push(segment(`${id}-grand-axe`, [h - a, k], [h + a, k], reveal, "muted", true), segment(`${id}-petit-axe`, [h, k - b], [h, k + b], reveal, "muted", true));
        }
        foci = [F1, F2];
        yAt = (x, below) => {
          const r = root(1 - ((x - h) / a) ** 2);
          return side(below, r === null ? null : b * r, k);
        };
        break;
      }
      case "hyperbola": {
        const { a, b } = action;
        if (a === undefined || b === undefined) return state;
        // Les deux branches, jusqu'aux bords du repère.
        const reach = vertical ? Math.max(Math.abs(f.x[0] - h), Math.abs(f.x[1] - h)) / a : Math.max(Math.abs(f.y[0] - k), Math.abs(f.y[1] - k)) / b;
        const T = Math.min(4, Math.asinh(reach) + 0.05);
        const branch = (sign: 1 | -1) =>
          Array.from({ length: 61 }, (_, i) => {
            const t = -T + (2 * T * i) / 60;
            return (vertical ? [h + a * Math.sinh(t), k + sign * b * Math.cosh(t)] : [h + sign * a * Math.cosh(t), k + b * Math.sinh(t)]) as Vec2;
          });
        parts.push(curve(`${id}-courbe`, branch(1), reveal, color), curve(`${id}-courbe-2`, branch(-1), reveal, color));
        const c = Math.sqrt(a * a + b * b);
        const [F1, F2]: [Vec2, Vec2] = vertical ? [[h, k - c], [h, k + c]] : [[h - c, k], [h + c, k]];
        if (action.foci) {
          parts.push(point(`${id}-F1`, F1, "F₁", reveal, "orange"), point(`${id}-F2`, F2, "F₂", reveal, "orange"));
          Object.assign(vertices, { F1, F2 });
        }
        if (action.elements) {
          const m = b / a;
          const [p1, q1] = lineAcross(state, h, k, m);
          const [p2, q2] = lineAcross(state, h, k, -m);
          parts.push(segment(`${id}-asymptote-1`, p1, q1, reveal, "muted", true), segment(`${id}-asymptote-2`, p2, q2, reveal, "muted", true));
          parts.push(point(`${id}-centre`, [h, k], undefined, reveal, "ink"));
        }
        foci = [F1, F2];
        yAt = (x, below) => {
          const r = vertical ? root(1 + ((x - h) / a) ** 2) : root(((x - h) / a) ** 2 - 1);
          return side(below, r === null ? null : b * r, k);
        };
        break;
      }
      case "parabola": {
        const c = action.c;
        if (c === undefined) return state;
        const horizontal = action.orientation === "horizontal";
        // Assez loin pour remplir le repère du côté où la parabole s'ouvre.
        const span = horizontal ? Math.max(Math.abs(f.y[0] - k), Math.abs(f.y[1] - k)) : Math.max(Math.abs(f.x[0] - h), Math.abs(f.x[1] - h));
        const pts = Array.from({ length: 81 }, (_, i) => {
          const u = -span + (2 * span * i) / 80;
          return (horizontal ? [h + (u * u) / (4 * c), k + u] : [h + u, k + (u * u) / (4 * c)]) as Vec2;
        });
        parts.push(curve(`${id}-courbe`, pts, reveal, color));
        const F: Vec2 = horizontal ? [h + c, k] : [h, k + c];
        if (action.foci) {
          parts.push(point(`${id}-F1`, F, "F", reveal, "orange"));
          vertices.F = F;
        }
        if (action.elements) {
          const [p, q] = horizontal ? lineAcross(state, h - c, 0, "vertical") : lineAcross(state, 0, k - c, 0);
          parts.push(segment(`${id}-directrice`, p, q, reveal, "muted", true), point(`${id}-sommet`, [h, k], "S", reveal, "ink"));
          vertices.S = [h, k];
        }
        foci = [F];
        yAt = (x, below) => (horizontal ? side(below, root(4 * c * (x - h)), k) : k + (x - h) ** 2 / (4 * c));
        directrixFoot = ([x, y]) => (horizontal ? [h - c, y] : [x, k - c]);
        break;
      }
    }
    // Les points de la courbe, et leurs distances mesurées par le moteur.
    const length = (p: Vec2, q: Vec2) => {
      const d = norm(sub(q, p));
      const rounded = Math.round(d * 10) / 10;
      return `${Math.abs(d - rounded) < 1e-6 ? "" : "≈ "}${formatNumber(rounded)}`;
    };
    for (const { name, x, below } of action.points ?? []) {
      const y = yAt(x, below ?? false);
      if (y === null) continue;
      const P: Vec2 = [x, y];
      parts.push(point(`${id}-${name}`, P, name, reveal, "violet"));
      vertices[name] = P;
      if (!action.distances || action.kind === "circle") continue;
      foci.forEach((F, i) => parts.push(segment(`${id}-${name}-F${i + 1}`, P, F, reveal, "green", false, length(P, F))));
      if (directrixFoot) parts.push(segment(`${id}-${name}-d`, P, directrixFoot(P), reveal, "green", true, length(P, directrixFoot(P))));
    }
    return drawFigure(state, id, parts, reveal, {}, vertices);
  },
});
