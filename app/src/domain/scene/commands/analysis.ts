/**
 * Analyse au tableau : l'aire sous une courbe (au-dessus et en dessous de
 * l'axe, en deux couleurs, pour voir les « bosses » qui s'annulent) et les
 * courbes paramétrées (enroulement de Fourier, trajectoires, cercle).
 */
import { z } from "zod";
import { areaRegions, centerOfMass, sampleParametric } from "@/domain/board/geometry";
import { placeLabel } from "@/domain/board/layout";
import { isVisible, putNode, type BoardNode, type BoardState, type Reveal } from "@/domain/board/state";
import { ColorName, Expression, finite, Id, Range } from "../primitives";
import { base, drawNode } from "./figure";
import { defineCommand } from "./define";

/** Expression en t (sin, cos, exp, pi… comme pour "fn"). */
const TExpression = z
  .string()
  .min(1)
  .max(200)
  .refine((source) => sampleParametric(source, "0", [0, 1], 2).length > 0, { message: "Expression en t invalide" });

export const areaCommand = defineCommand({
  schema: z.object({
    type: z.literal("area"),
    id: Id,
    of: Id.optional(),
    fn: Expression.optional(),
    from: finite,
    to: finite,
    color: ColorName.optional(),
  }),
  doc:
    '{"type":"area","id":"A","of":"f","from":0,"to":3} : colorie l\'aire entre la courbe "of" (ou "fn") et l\'axe des x,\n' +
    '  de from à to : la partie au-dessus de l\'axe en vert, celle en dessous en orange (groupe "A" ; parties A-plus\n' +
    '  et A-moins). Pour une intégrale, une moyenne, des « bosses » positives et négatives qui s\'annulent.',
  duration: 1300,
  aliases: ["integral", "shade"],
  apply(state, action, reveal) {
    const curve = action.of ? state.nodes[action.of] : undefined;
    const fn = action.fn ?? (isVisible(curve) && curve.type === "curve" ? curve.fn : undefined);
    if (!fn || !(action.to > action.from)) return state;
    const { above, below } = areaRegions(fn, action.from, action.to);
    const parts: BoardNode[] = [];
    if (above.length > 2) parts.push(region(`${action.id}-plus`, above, action.color ?? "green", reveal));
    if (below.length > 2) parts.push(region(`${action.id}-moins`, below, action.color ?? "orange", reveal));
    if (parts.length === 0) return state;
    let next: BoardState = state;
    for (const part of parts) next = putNode(next, part);
    // L'aire passe sous la courbe.
    const ids = parts.map((p) => p.id);
    next = { ...next, order: [...ids, ...next.order.filter((id) => !ids.includes(id))] };
    return { ...next, groups: { ...next.groups, [action.id]: { id: action.id, members: ids } } };
  },
});

function region(id: string, points: Array<[number, number]>, color: z.infer<typeof ColorName>, reveal: Reveal): BoardNode {
  return { ...base(id, reveal, color), type: "polygon", points, closed: true, fill: true, shade: true };
}

export const parametricCommand = defineCommand({
  schema: z.object({
    type: z.literal("parametric"),
    id: Id,
    x: TExpression,
    y: TExpression,
    t: Range,
    color: ColorName.optional(),
    label: z.string().max(40).optional(),
    mass: z.boolean().optional(),
  }),
  doc:
    '{"type":"parametric","id":"c","x":"cos(t)","y":"sin(t)","t":[0,6.28],"mass":true} : courbe paramétrée (x(t), y(t)).\n' +
    '  Se déforme en continu avec "transform" ("x", "y" ou "t") : enroulement de Fourier quand la fréquence change,\n' +
    '  trajectoire, cercle trigonométrique parcouru. "mass":true : le moteur calcule et place le centre de masse\n' +
    '  (point "<id>-masse"), qui suit la courbe quand elle se transforme. Ne le calcule pas toi-même.',
  duration: 1800,
  aliases: ["parametriccurve", "path"],
  apply(state, action, reveal) {
    const points = sampleParametric(action.x, action.y, action.t);
    if (points.length < 2) return state;
    const node: BoardNode = {
      ...base(action.id, reveal, action.color ?? "violet"),
      type: "polygon",
      points,
      closed: false,
      label: action.label,
      param: { x: action.x, y: action.y, t: action.t },
    };
    const next = drawNode(state, node, reveal);
    return action.mass ? putMassPoint(next, action.id, points, reveal) : next;
  },
});

/** Identifiant du centre de masse d'une courbe paramétrée. */
export const massId = (curveId: string) => `${curveId}-masse`;

/** Pose (ou déplace, en glissant) le centre de masse calculé d'une courbe paramétrée. */
export function putMassPoint(state: BoardState, curveId: string, points: ReadonlyArray<readonly [number, number]>, reveal: Reveal): BoardState {
  const at = centerOfMass(points);
  const id = massId(curveId);
  const existing = state.nodes[id];
  if (isVisible(existing) && existing.type === "point") {
    return putNode(state, { ...existing, at: [at[0] - existing.offset[0], at[1] - existing.offset[1]], morph: reveal });
  }
  const point: BoardNode = { ...base(id, { start: reveal.start + reveal.duration * 0.8, duration: 500 }, "orange"), type: "point", at, label: "centre de masse", ring: true };
  return placeLabel(putNode(state, point), id);
}
