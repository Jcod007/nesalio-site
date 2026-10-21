/**
 * Constructions géométriques, comme au compas et à la règle : le modèle dit
 * « le milieu de AC », « la parallèle à AB passant par C », « la bissectrice
 * de l'angle B » ; le moteur calcule. Les points visés sont nommés (un point
 * du tableau, un sommet de triangle, un point déjà construit) ou donnés par
 * leurs coordonnées. Plus de coordonnées calculées à la main par le modèle.
 *
 * Un point construit devient un « point » du tableau (son id est son nom) :
 * on peut le viser ensuite partout ("at":"M", "from":"M").
 * Une droite construite est un segment qui traverse la figure ; ses parties
 * (point, angle droit, marques) sont réunies dans un groupe portant son id.
 */
import { z } from "zod";
import { figureBox, worldPerMath, type Box } from "@/domain/board/layout";
import { outline } from "@/domain/board/collisions";
import { add, angleArc, chordThrough, footOnLine, intersectLines, norm, rightAngleMark, scale, sub, unit } from "@/domain/board/shapes";
import { isVisible, type BoardNode, type BoardState, type Reveal, type Vec2 } from "@/domain/board/state";
import { ColorName, finite } from "../primitives";
import { base, drawNode } from "./figure";
import { defineCommand } from "./define";
import { drawFigure, equalTicks, point, segment, ShapeId, type Color } from "./parts";
import { LineRef, PointRef, resolveLine, resolvePoint } from "./points";

const len = (u: Vec2) => Math.hypot(u[0], u[1]);
const dir = (p: Vec2, q: Vec2): Vec2 => unit(sub(q, p));

/**
 * La droite passant par P de direction u, coupée aux bords de la figure (un peu au-delà) :
 * une « droite » au tableau traverse la figure, sans partir à l'infini.
 */
function across(state: BoardState, P: Vec2, u: Vec2, extra: Vec2[] = []): [Vec2, Vec2] {
  const fig = figureBox(state);
  const pad = 0.15 * Math.max(fig.x1 - fig.x0, fig.y1 - fig.y0, 2);
  const xs = [fig.x0, fig.x1, P[0], ...extra.map((p) => p[0])];
  const ys = [fig.y0, fig.y1, P[1], ...extra.map((p) => p[1])];
  const box: Box = { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad };
  let lo = -Infinity;
  let hi = Infinity;
  for (const [p, d, a, b] of [
    [P[0], u[0], box.x0, box.x1],
    [P[1], u[1], box.y0, box.y1],
  ] as const) {
    if (Math.abs(d) < 1e-12) continue;
    const t1 = (a - p) / d;
    const t2 = (b - p) / d;
    lo = Math.max(lo, Math.min(t1, t2));
    hi = Math.min(hi, Math.max(t1, t2));
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [P, add(P, u)];
  return [add(P, scale(u, lo)), add(P, scale(u, hi))];
}

/**
 * Le contour d'une figure du tableau, ou null : une surface fermée (polygone, cercle), ou les
 * sommets ordonnés d'une figure tracée côté par côté (@0, @1, @2 d'un triangle).
 */
function figureOutline(state: BoardState, id: string): Vec2[] | null {
  const group = state.groups[id];
  const ids = state.nodes[id] ? [id] : (group?.members ?? []);
  for (const member of ids) {
    const node = state.nodes[member];
    const ring = isVisible(node) ? outline(node) : null;
    if (ring) return ring;
  }
  const shown = ids.map((member) => state.nodes[member]).find(isVisible);
  const ordered = Array.from({ length: 12 }, (_, i) => group?.vertices?.[`@${i}`]).filter((p): p is Vec2 => p !== undefined);
  return shown && ordered.length >= 3 ? ordered.map((p) => add(p, shown.offset)) : null;
}

/**
 * Le tracé d'une droite construite : à travers la figure, ou arrêté aux côtés de "within"
 * (une parallèle dans un triangle). Avec "meets", les points où elle rencontre les côtés
 * sont nommés (sauf celui par lequel elle passe déjà) et se visent ensuite par leur nom.
 */
function lineThrough(state: BoardState, id: string, P: Vec2, u: Vec2, within: string | undefined, meets: Meets | undefined, reveal: Reveal, color: Color | undefined, label?: string): { ends: [Vec2, Vec2]; parts: BoardNode[]; vertices: Record<string, Vec2> } {
  const ring = within ? figureOutline(state, within) : null;
  const chord = ring ? chordThrough(P, u, ring) : null;
  const [a, b] = chord ?? across(state, P, u);
  const parts: BoardNode[] = [segment(id, a, b, reveal, color ?? "orange", false, label)];
  const vertices: Record<string, Vec2> = {};
  if (chord && meets) {
    // Un nom : l'extrémité la plus loin du point de passage ; deux noms : les deux, dans le sens de la droite.
    const ends = typeof meets === "string" ? [[norm(sub(a, P)) > norm(sub(b, P)) ? a : b, meets] as const] : ([[a, meets[0]], [b, meets[1]]] as const);
    for (const [at, name] of ends) {
      if (!name || norm(sub(at, P)) < 1e-6) continue;
      parts.push(point(`${id}-${name}`, at, name, reveal, color ?? "orange"));
      vertices[name] = at;
    }
  }
  return { ends: [a, b], parts, vertices };
}

const Meets = z.union([z.string().trim().min(1).max(4), z.tuple([z.string().trim().max(4), z.string().trim().max(4)])]);
type Meets = z.infer<typeof Meets>;

/** Une construction : ses parties apparaissent l'une après l'autre, réunies sous son id (un point seul garde son id). */
function draw(state: BoardState, id: string, parts: BoardNode[], reveal: Reveal): BoardState {
  return parts.length === 1 && parts[0]!.id === id ? drawFigure(state, `${id}-construction`, parts, reveal) : drawFigure(state, id, parts, reveal);
}

const KINDS = ["midpoint", "divide", "foot", "intersection", "line", "parallel", "perpendicular", "perpBisector", "angleBisector", "median"] as const;

export const constructCommand = defineCommand({
  schema: z.object({
    type: z.literal("construct"),
    id: ShapeId,
    kind: z.enum(KINDS),
    /** Les points (ou les droites) de la construction, selon "kind". */
    of: z.array(z.union([PointRef, LineRef])).min(1).max(3),
    /** Point par lequel passe la droite (parallèle, perpendiculaire) ou sommet (bissectrice, médiane, pied). */
    through: PointRef.optional(),
    /** Partage d'un segment : "2:1" ou une fraction de 0 à 1, à partir du premier point. */
    ratio: z.union([z.string().regex(/^\s*\d+(\.\d+)?\s*:\s*\d+(\.\d+)?\s*$/), finite.min(0).max(1)]).optional(),
    label: z.string().trim().max(24).optional(),
    marks: z.boolean().optional(),
    /** Droite, parallèle, perpendiculaire : arrêtée aux côtés de cette figure (un triangle) au lieu de la traverser. */
    within: z.string().trim().min(1).max(40).optional(),
    /** Avec "within" : le nom du point où la droite rencontre l'autre côté ("E"), ou des deux extrémités. */
    meets: Meets.optional(),
    color: ColorName.optional(),
  }),
  doc:
    '{"type":"construct","id":"M","kind":"midpoint","of":["A","C"]} : construction calculée par le moteur, à partir de points\n' +
    '  nommés (point du tableau, sommet de triangle, point déjà construit) ou de coordonnées. Le point construit porte\n' +
    '  son id comme nom ("label" pour en changer) et se vise ensuite partout ("at":"M"). Sortes ("kind") :\n' +
    '  - "midpoint" "of":[P,Q] : milieu (avec "marks":true, les deux moitiés marquées égales) ;\n' +
    '  - "divide" "of":[P,Q],"ratio":"2:1" : point qui partage PQ dans ce rapport (à partir de P) ;\n' +
    '  - "foot" "through":P,"of":[Q,R] : pied de la perpendiculaire abaissée de P sur (QR), trait pointillé et angle droit ;\n' +
    '  - "intersection" "of":[d1,d2] : point d\'intersection de deux droites (un id de segment, ou ["A","B"]) ;\n' +
    '  - "line" "of":[P,Q] : la droite (PQ), qui traverse la figure ;\n' +
    '  - "parallel" "through":P,"of":[Q,R] : parallèle à (QR) passant par P ; "perpendicular" : perpendiculaire ;\n' +
    '    avec "within":"tri" elle s\'arrête aux côtés du triangle, et "meets":"E" nomme le point où elle coupe l\'autre côté\n' +
    '    (Thalès : "divide" pour D sur [AC], puis la parallèle à (AB) par D "within" le triangle, "meets":"E") ;\n' +
    '  - "perpBisector" "of":[P,Q] : médiatrice de [PQ] (milieu marqué, angle droit) ;\n' +
    '  - "angleBisector" "through":B,"of":[A,C] : bissectrice de l\'angle ABC, jusqu\'au côté [AC] (angles égaux marqués) ;\n' +
    '  - "median" "through":A,"of":[B,C] : médiane issue de A, jusqu\'au milieu de [BC] (moitiés marquées).\n' +
    '  Ne calcule jamais toi-même un milieu, un pied ou une intersection : construis-les.',
  duration: 1100,
  aliases: ["construction", "build"],
  apply(state, action, reveal) {
    const unit = worldPerMath(state.frame);
    const color = action.color;
    const pts = action.of.map((ref) => (Array.isArray(ref) && ref.length === 2 && typeof ref[0] !== "number" ? null : resolvePoint(state, ref as PointRef)));
    const P = (i: number) => pts[i] ?? null;
    const through = action.through !== undefined ? resolvePoint(state, action.through) : null;
    /** La droite visée : deux points ("of":["A","B"]) ou un segment par son id ("of":["d"]). */
    const lineOf = () => resolveLine(state, (action.of.length >= 2 ? [action.of[0], action.of[1]] : action.of[0]) as LineRef);
    const name = action.label ?? action.id;
    const { id } = action;

    switch (action.kind) {
      case "midpoint": {
        const [a, b] = [P(0), P(1)];
        if (!a || !b) return state;
        const M = scale(add(a, b), 0.5);
        const parts = [point(id, M, name, reveal, color)];
        if (action.marks) parts.push(...equalTicks(`${id}-moitie1`, a, M, 1, unit, reveal, color), ...equalTicks(`${id}-moitie2`, M, b, 1, unit, reveal, color));
        return draw(state, id, parts, reveal);
      }
      case "divide": {
        const [a, b] = [P(0), P(1)];
        if (!a || !b) return state;
        let t = 0.5;
        if (typeof action.ratio === "number") t = action.ratio;
        else if (action.ratio) {
          const [m, n] = action.ratio.split(":").map(Number) as [number, number];
          t = m + n > 0 ? m / (m + n) : 0.5;
        }
        return draw(state, id, [point(id, add(a, scale(sub(b, a), t)), name, reveal, color)], reveal);
      }
      case "foot": {
        const line = lineOf();
        if (!through || !line) return state;
        const [q, r] = line;
        const H = footOnLine(through, q, r);
        if (len(sub(through, H)) < 1e-9) return state;
        return draw(
          state,
          id,
          [
            segment(`${id}-trait`, through, H, reveal, color ?? "violet", true),
            { ...base(`${id}-droit`, reveal, "muted"), type: "polygon", points: rightAngleMark(H, through, len(sub(r, H)) > 1e-9 ? r : q, 0.24 / unit), closed: false },
            point(id, H, name, reveal, color ?? "violet"),
          ],
          reveal,
        );
      }
      case "intersection": {
        const lines = action.of.slice(0, 2).map((ref) => resolveLine(state, ref as LineRef));
        if (lines.length < 2 || !lines[0] || !lines[1]) return state;
        const X = intersectLines(...lines[0], ...lines[1]);
        if (!X) return state;
        return draw(state, id, [point(id, X, name, reveal, color)], reveal);
      }
      case "line": {
        const line = lineOf();
        if (!line) return state;
        if (action.within) {
          const { parts, vertices } = lineThrough(state, id, line[0], dir(line[0], line[1]), action.within, action.meets, reveal, color, action.label);
          return parts.length === 1 ? drawNode(state, parts[0]!, reveal) : drawFigure(state, `${id}-construction`, parts, reveal, {}, vertices);
        }
        const [a, b] = across(state, line[0], dir(line[0], line[1]), line);
        return draw(state, id, [segment(id, a, b, reveal, color, false, action.label)], reveal);
      }
      case "parallel":
      case "perpendicular": {
        const line = lineOf();
        if (!through || !line) return state;
        const u = dir(line[0], line[1]);
        const d: Vec2 = action.kind === "parallel" ? u : [-u[1], u[0]];
        const { ends: [a, b], parts, vertices } = lineThrough(state, id, through, d, action.within, action.meets, reveal, color, action.label);
        if (action.kind === "perpendicular") {
          const X = intersectLines(a, b, ...line);
          if (X) parts.push({ ...base(`${id}-droit`, reveal, "muted"), type: "polygon", points: rightAngleMark(X, add(X, d), add(X, u), 0.24 / unit), closed: false });
        }
        return parts.length === 1 ? drawNode(state, parts[0]!, reveal) : drawFigure(state, `${id}-construction`, parts, reveal, {}, vertices);
      }
      case "perpBisector": {
        const [a, b] = [P(0), P(1)];
        if (!a || !b) return state;
        const M = scale(add(a, b), 0.5);
        const u = dir(a, b);
        const n: Vec2 = [-u[1], u[0]];
        const [e1, e2] = across(state, M, n);
        return draw(
          state,
          id,
          [
            segment(`${id}-droite`, e1, e2, reveal, color ?? "orange", false, action.label),
            { ...base(`${id}-droit`, reveal, "muted"), type: "polygon", points: rightAngleMark(M, add(M, n), b, 0.24 / unit), closed: false },
            ...equalTicks(`${id}-moitie1`, a, M, 1, unit, reveal, color),
            ...equalTicks(`${id}-moitie2`, M, b, 1, unit, reveal, color),
          ],
          reveal,
        );
      }
      case "angleBisector": {
        const [a, c] = [P(0), P(1)];
        if (!through || !a || !c) return state;
        const B = through;
        // Le pied de la bissectrice partage [AC] dans le rapport BA : BC.
        const ba = len(sub(a, B));
        const bc = len(sub(c, B));
        const D = add(a, scale(sub(c, a), ba / (ba + bc)));
        const first = angleArc(B, a, D);
        const second = angleArc(B, D, c);
        const arc = (aid: string, span: { start: number; end: number }): BoardNode => ({ ...base(aid, reveal, "violet"), type: "arc", center: B, radius: 0.55 / unit, ...span });
        return draw(state, id, [segment(`${id}-trait`, B, D, reveal, color ?? "orange"), arc(`${id}-angle1`, first), arc(`${id}-angle2`, second), point(`${id}-pied`, D, action.label, reveal, color ?? "orange")], reveal);
      }
      case "median": {
        const [b, c] = [P(0), P(1)];
        if (!through || !b || !c) return state;
        const M = scale(add(b, c), 0.5);
        return draw(
          state,
          id,
          [
            segment(`${id}-trait`, through, M, reveal, color ?? "orange"),
            point(`${id}-milieu`, M, action.label, reveal, color ?? "orange"),
            ...equalTicks(`${id}-moitie1`, b, M, 1, unit, reveal, color),
            ...equalTicks(`${id}-moitie2`, M, c, 1, unit, reveal, color),
          ],
          reveal,
        );
      }
    }
  },
});
