/**
 * Figures paramétriques : l'IA décrit la figure par ses paramètres
 * (« triangle rectangle d'angle 30° et d'hypoténuse 5 », « plan incliné à
 * 25° avec le poids décomposé »), le moteur calcule une géométrie exacte.
 *
 * Une figure composée crée des sous-objets nommés `<id>-<partie>` (côtés,
 * angle, bloc, forces…) réunis dans un groupe `<id>` : on peut ensuite mettre
 * en évidence l'hypoténuse, estomper le bloc ou déplacer toute la figure.
 */
import { z } from "zod";
import { worldPerMath } from "@/domain/board/layout";
import {
  add,
  angleArc,
  centroid,
  outward,
  rightAngleMark,
  rotate,
  scale,
  solveRightTriangle,
  sub,
  rad,
} from "@/domain/board/shapes";
import { isVisible, moveNodes, type BoardNode, type BoardState, type Group, type Reveal, type TextNode, type Vec2 } from "@/domain/board/state";
import { ColorName, Coord, finite, Id } from "../primitives";
import { base, drawNode } from "./figure";
import { defineCommand } from "./define";

type Color = z.infer<typeof ColorName>;

/** Identifiant de figure composée : assez court pour laisser la place aux suffixes. */
const ShapeId = Id.refine((id) => id.length <= 24, { message: "Identifiant de figure : 24 caractères au plus" });
const Name = z.string().trim().min(1).max(24);

/** Un point donné par ses coordonnées, ou par le nom d'un point déjà au tableau. */
const PointRef = z.union([Coord, Id]);
function resolvePoint(state: BoardState, ref: z.infer<typeof PointRef>): Vec2 | null {
  if (typeof ref !== "string") return ref;
  const node = state.nodes[ref];
  if (!isVisible(node) || node.type !== "point") return null;
  return add(node.at, node.offset);
}

/** Les parties d'une figure apparaissent l'une après l'autre dans le temps de la commande. */
function stagger(reveal: Reveal, index: number, count: number): Reveal {
  const slot = reveal.duration / (count * 0.6 + 0.4);
  return { start: reveal.start + index * slot * 0.6, duration: slot };
}

/**
 * Dessine les parties d'une figure et les réunit dans un groupe portant le nom
 * de la figure. Redemander la même figure avec plus d'options la complète :
 * les parties déjà au tableau restent en place, seules les nouvelles
 * apparaissent (on présente les forces une à une, par exemple).
 */
function drawFigure(state: BoardState, id: string, parts: BoardNode[], reveal: Reveal, extraGroups: Record<string, string[]> = {}): BoardState {
  const fresh = parts.filter((part) => {
    const existing = state.nodes[part.id];
    return !isVisible(existing) || existing.type !== part.type;
  });
  let next = state;
  fresh.forEach((part, i) => {
    next = drawNode(next, { ...part, reveal: stagger(reveal, i, fresh.length) }, reveal);
  });
  // Une étiquette déjà au tableau dont la place calculée change (on ajoute les carrés, par exemple)
  // glisse vers sa nouvelle place au lieu de rester sous la nouvelle partie.
  for (const part of parts) {
    const existing = next.nodes[part.id];
    if (part.type !== "text" || fresh.includes(part) || !isVisible(existing) || existing.type !== "text") continue;
    const delta: Vec2 = [part.at[0] - existing.at[0] - existing.offset[0], part.at[1] - existing.at[1] - existing.offset[1]];
    if (Math.hypot(delta[0], delta[1]) > 1e-9) next = moveNodes(next, [part.id], delta, reveal);
  }
  const members = [...new Set([...(state.groups[id]?.members ?? []), ...parts.map((p) => p.id)])];
  const groups: Record<string, Group> = { ...next.groups, [id]: { id, members } };
  for (const [gid, ids] of Object.entries(extraGroups)) {
    if (ids.length > 0) groups[gid] = { id: gid, members: [...new Set([...(next.groups[gid]?.members ?? []), ...ids])] };
  }
  return { ...next, groups };
}

/** Texte posé à une position calculée, attaché à une partie de la figure (il la suit). */
function label(id: string, text: string, at: Vec2, target: string, reveal: Reveal, color?: Color): TextNode {
  return { ...base(id, reveal, color), type: "text", text, at, align: "center", size: "normal", role: "free", anchor: { target, side: "above" } };
}

const segment = (id: string, from: Vec2, to: Vec2, reveal: Reveal, color?: Color, dashed?: boolean): BoardNode => ({
  ...base(id, reveal, color),
  type: "segment",
  from,
  to,
  dashed,
});

const vector = (id: string, from: Vec2, to: Vec2, text: string, reveal: Reveal, color: Color): BoardNode => ({
  ...base(id, reveal, color),
  type: "vector",
  from,
  to,
  label: text,
});

/** Marque d'angle : arc avec étiquette, ou petit carré pour un angle droit. */
function angleMark(state: BoardState, id: string, vertex: Vec2, a: Vec2, b: Vec2, text: string | undefined, right: boolean, reveal: Reveal, color?: Color): BoardNode {
  const unit = worldPerMath(state.frame);
  if (right) {
    return { ...base(id, reveal, color ?? "muted"), type: "polygon", points: rightAngleMark(vertex, a, b, 0.24 / unit), closed: false, label: text };
  }
  const { start, end } = angleArc(vertex, a, b);
  return { ...base(id, reveal, color ?? "violet"), type: "arc", center: vertex, radius: 0.5 / unit, start, end, label: text };
}

/* --------------------------------- formes --------------------------------- */

export const circleCommand = defineCommand({
  schema: z.object({
    type: z.literal("circle"),
    id: Id,
    center: Coord,
    radius: finite.positive().max(10_000),
    dashed: z.boolean().optional(),
    label: z.string().max(24).optional(),
    color: ColorName.optional(),
  }),
  doc: '{"type":"circle","id":"c","center":[0,0],"radius":1,"label":"cercle trigonométrique","dashed":false}',
  duration: 1200,
  apply(state, action, reveal) {
    const { type, id, color, ...rest } = action;
    return drawNode(state, { ...base(id, reveal, color), type, ...rest }, reveal);
  },
});

export const polygonCommand = defineCommand({
  schema: z.object({
    type: z.literal("polygon"),
    id: Id,
    points: z.array(Coord).min(3).max(10),
    fill: z.boolean().optional(),
    label: z.string().max(24).optional(),
    color: ColorName.optional(),
  }),
  doc: '{"type":"polygon","id":"p","points":[[0,0],[4,0],[4,3]],"fill":true,"label":"…"} : polygone fermé (rempli si "fill").',
  duration: 1200,
  apply(state, action, reveal) {
    const { type, id, color, ...rest } = action;
    return drawNode(state, { ...base(id, reveal, color), type, ...rest, closed: true }, reveal);
  },
});

export const angleCommand = defineCommand({
  schema: z.object({
    type: z.literal("angle"),
    id: Id,
    at: PointRef,
    from: PointRef,
    to: PointRef,
    label: z.string().max(12).optional(),
    right: z.boolean().optional(),
    color: ColorName.optional(),
  }),
  doc:
    '{"type":"angle","id":"t","at":"A","from":"B","to":"C","label":"θ"} : marque l\'angle en A entre AB et AC\n' +
    '  (points par leur nom ou [x,y] ; "right":true pour un angle droit).',
  duration: 700,
  apply(state, action, reveal) {
    const vertex = resolvePoint(state, action.at);
    const a = resolvePoint(state, action.from);
    const b = resolvePoint(state, action.to);
    if (!vertex || !a || !b) return state;
    return drawNode(state, angleMark(state, action.id, vertex, a, b, action.label, action.right ?? false, reveal, action.color), reveal);
  },
});

/* -------------------------------- triangle -------------------------------- */

/** Texte écrit au centre d'un carré de Pythagore (son aire) ; "" = carré sans texte. */
const SquareText = z.string().trim().max(24);

const TriangleSchema = z
  .object({
    type: z.literal("triangle"),
    id: ShapeId,
    base: finite.positive().optional(),
    height: finite.positive().optional(),
    hyp: finite.positive().optional(),
    angle: finite.gt(0).lt(90).optional(),
    points: z.tuple([Coord, Coord, Coord]).optional(),
    at: Coord.optional(),
    rotate: finite.optional(),
    names: z.tuple([Name, Name, Name]).optional(),
    sides: z
      .object({ base: Name, height: Name, hyp: Name, ab: Name, bc: Name, ca: Name })
      .partial()
      .optional(),
    angleLabel: z.string().max(12).optional(),
    squares: z
      .union([z.literal(true), z.object({ base: SquareText, height: SquareText, hyp: SquareText, ab: SquareText, bc: SquareText, ca: SquareText }).partial()])
      .optional(),
    color: ColorName.optional(),
  })
  .refine((a) => a.points !== undefined || solveRightTriangle(a) !== null, {
    message: "triangle : donner deux mesures parmi base, height, hyp, angle (ou les trois points)",
  });

export const triangleCommand = defineCommand({
  schema: TriangleSchema,
  doc:
    '{"type":"triangle","id":"tri","angle":30,"hyp":5,"names":["A","B","C"],"sides":{"hyp":"5 m","height":"h"},"angleLabel":"30°"}\n' +
    '  Triangle rectangle en B à partir de DEUX mesures parmi base, height, hyp, angle (angle aigu en A, en degrés) :\n' +
    '  le moteur calcule les sommets exacts. Options : "at":[x,y] (position de A), "rotate" (degrés).\n' +
    '  Parties : tri-base (= tri-adjacent, côté adjacent à A), tri-haut (= tri-oppose, opposé à A), tri-hyp,\n' +
    '  tri-droit (angle droit), tri-angle. Triangle quelconque : "points":[[x,y],[x,y],[x,y]], côtés tri-ab, tri-bc, tri-ca\n' +
    '  ("sides" : ab, bc, ca).\n' +
    '  "squares":{"base":"16","height":"9","hyp":"25"} : le moteur construit le carré sur chaque côté nommé, à l\'extérieur,\n' +
    '  avec ce texte (son aire) au centre ; "squares":true pour les trois sans texte. Parties tri-carre-base,\n' +
    '  tri-carre-haut, tri-carre-hyp, groupe tri-carres. Les longueurs ("sides") passent alors à l\'intérieur du triangle.',
  duration: 2400,
  apply(state, action, reveal) {
    const unit = worldPerMath(state.frame);
    const color = action.color;
    let A: Vec2;
    let B: Vec2;
    let C: Vec2;
    const right = action.points === undefined;
    if (action.points) {
      [A, B, C] = action.points;
    } else {
      const { base: b, height: h } = solveRightTriangle(action)!;
      A = action.at ?? [-b / 2, -h / 2];
      B = add(A, [b, 0]);
      C = add(B, [0, h]);
      if (action.rotate) {
        B = rotate(B, A, action.rotate);
        C = rotate(C, A, action.rotate);
      }
    }
    const center = centroid([A, B, C]);
    const id = action.id;
    const sides: Array<[string, Vec2, Vec2, string | undefined]> = right
      ? [
          [`${id}-base`, A, B, action.sides?.base],
          [`${id}-haut`, B, C, action.sides?.height],
          [`${id}-hyp`, A, C, action.sides?.hyp],
        ]
      : [
          [`${id}-ab`, A, B, action.sides?.ab],
          [`${id}-bc`, B, C, action.sides?.bc],
          [`${id}-ca`, C, A, action.sides?.ca],
        ];

    // Carrés construits sur les côtés (Pythagore), vers l'extérieur du triangle.
    const squareKeys = right ? (["base", "height", "hyp"] as const) : (["ab", "bc", "ca"] as const);
    const squareText = (i: number): string | undefined => {
      if (action.squares === undefined) return undefined;
      if (action.squares === true) return "";
      return action.squares[squareKeys[i]!];
    };
    const SQUARE_COLORS: Color[] = ["green", "orange", "violet"];
    const squares: BoardNode[] = [];
    sides.forEach(([sid, from, to], i) => {
      const text = squareText(i);
      if (text === undefined) return;
      const [dx, dy] = sub(to, from);
      let normal: Vec2 = [-dy, dx];
      const middle = scale(add(from, to), 0.5);
      if ((center[0] - middle[0]) * normal[0] + (center[1] - middle[1]) * normal[1] > 0) normal = [dy, -dx];
      squares.push({
        ...base(`${id}-carre-${sid.slice(id.length + 1)}`, reveal, SQUARE_COLORS[i]),
        type: "polygon",
        points: [from, to, add(to, normal), add(from, normal)],
        closed: true,
        fill: true,
        label: text || undefined,
      });
    });
    const hasSquare = (i: number) => squareText(i) !== undefined;

    const parts: BoardNode[] = sides.map(([sid, from, to]) => segment(sid, from, to, reveal, color));
    parts.push(...squares);
    if (right) parts.push(angleMark(state, `${id}-droit`, B, A, C, undefined, true, reveal));
    if (right && (action.angleLabel !== undefined || action.angle !== undefined)) {
      parts.push(angleMark(state, `${id}-angle`, A, B, C, action.angleLabel ?? `${action.angle}°`, false, reveal));
    }
    sides.forEach(([sid, from, to, text], i) => {
      // Un carré occupe l'extérieur du côté : la longueur s'écrit alors du côté intérieur.
      const distance = (hasSquare(i) ? -0.36 : 0.42) / unit;
      if (text) parts.push(label(`${sid}-l`, text, outward(scale(add(from, to), 0.5), center, distance), sid, reveal, color));
    });
    if (action.names) {
      [A, B, C].forEach((vertex, i) => parts.push(label(`${id}-${action.names![i]!.replace(/[^\w-]/g, "") || i}`, action.names![i]!, outward(vertex, center, 0.36 / unit), sides[0]![0], reveal)));
    }
    // Autres noms des côtés d'un triangle rectangle (le modèle les emploie souvent) : ab, bc, ca, opposé, adjacent.
    const aliases: Record<string, string[]> = right
      ? { [`${id}-ab`]: [`${id}-base`], [`${id}-bc`]: [`${id}-haut`], [`${id}-ca`]: [`${id}-hyp`], [`${id}-oppose`]: [`${id}-haut`], [`${id}-adjacent`]: [`${id}-base`] }
      : {};
    return drawFigure(state, id, parts, reveal, { ...aliases, [`${id}-carres`]: squares.map((s) => s.id) });
  },
});

/* ------------------------------ plan incliné ------------------------------ */

export const inclineCommand = defineCommand({
  schema: z.object({
    type: z.literal("incline"),
    id: ShapeId,
    angle: finite.min(5).max(80),
    length: finite.positive().max(10_000).optional(),
    at: Coord.optional(),
    block: z.boolean().optional(),
    weight: z.boolean().optional(),
    components: z.boolean().optional(),
    normal: z.boolean().optional(),
    angleLabel: z.string().max(12).optional(),
  }),
  doc:
    '{"type":"incline","id":"plan","angle":25,"block":true,"weight":true,"components":true,"normal":false}\n' +
    '  Plan incliné (angle en degrés) avec un bloc, son poids P et, si demandé, ses composantes P∥ et P⊥ et la normale N.\n' +
    '  Parties : plan-pente, plan-sol, plan-angle, plan-bloc, plan-P, plan-Px, plan-Py, plan-N.\n' +
    '  Pour présenter les forces une à une, redemande la même figure (même id) avec une option de plus : seules les\n' +
    '  nouvelles parties apparaissent (d\'abord "weight":false, puis "weight":true, puis "components":true…).',
  duration: 3000,
  aliases: ["plan", "ramp", "slope"],
  apply(state, action, reveal) {
    const L = action.length ?? Math.min(state.frame.x[1] - state.frame.x[0], (state.frame.y[1] - state.frame.y[0]) * 1.6) * 0.55;
    const t = rad(action.angle);
    const A: Vec2 = action.at ?? [(-L * Math.cos(t)) / 2, (-L * Math.sin(t)) / 2];
    const B = add(A, [L * Math.cos(t), 0]);
    const C = add(B, [0, L * Math.sin(t)]);
    const u: Vec2 = [Math.cos(t), Math.sin(t)];
    const n: Vec2 = [-Math.sin(t), Math.cos(t)];
    const id = action.id;

    const parts: BoardNode[] = [
      { ...base(`${id}-pente`, reveal, "muted"), type: "polygon", points: [A, B, C], closed: true, fill: true },
      segment(`${id}-sol`, sub(A, [L * 0.12, 0]), add(B, [L * 0.12, 0]), reveal, "ink"),
      angleMark(state, `${id}-angle`, A, B, C, action.angleLabel ?? "θ", false, reveal),
    ];
    if (action.block ?? true) {
      const side = L * 0.17;
      const center = add(add(A, scale(u, L * 0.58)), scale(n, side / 2));
      const corner = (du: number, dn: number) => add(center, add(scale(u, du * side), scale(n, dn * side)));
      parts.push({
        ...base(`${id}-bloc`, reveal, "violet"),
        type: "polygon",
        points: [corner(-0.5, -0.5), corner(0.5, -0.5), corner(0.5, 0.5), corner(-0.5, 0.5)],
        closed: true,
        fill: true,
      });
      const w = L * 0.34;
      if (action.weight ?? true) parts.push(vector(`${id}-P`, center, add(center, [0, -w]), "P", reveal, "orange"));
      if (action.components) {
        parts.push(vector(`${id}-Px`, center, add(center, scale(u, -w * Math.sin(t))), "P∥", reveal, "green"));
        parts.push(vector(`${id}-Py`, center, add(center, scale(n, -w * Math.cos(t))), "P⊥", reveal, "blue"));
      }
      if (action.normal) parts.push(vector(`${id}-N`, center, add(center, scale(n, w * Math.cos(t))), "N", reveal, "violet"));
    }
    return drawFigure(state, id, parts, reveal);
  },
});
