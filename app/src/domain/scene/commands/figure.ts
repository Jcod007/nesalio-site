/**
 * Commandes qui dessinent la figure : repère, courbe, point, vecteur, segment.
 */
import { z } from "zod";
import { reflowCalc } from "@/domain/board/layout";
import { putNode, type BoardNode, type BoardState, type Frame, type Reveal } from "@/domain/board/state";
import { ColorName, Coord, Expression, finite, Id, Range } from "../primitives";
import { defineCommand } from "./define";

/** Ajoute un nœud de la figure ; la pile de calculs suit si la figure s'agrandit. */
function drawNode(state: BoardState, node: BoardNode, reveal: Reveal): BoardState {
  const next = putNode(state, node);
  return next.axes || next.calc.length === 0 ? next : reflowCalc(next, reveal);
}

const base = (id: string, reveal: Reveal, color?: z.infer<typeof ColorName>) => ({ id, reveal, color, offset: [0, 0] as [number, number] });

export const axesCommand = defineCommand({
  schema: z.object({
    type: z.literal("axes"),
    x: Range,
    y: Range,
    xLabel: z.string().max(12).optional(),
    yLabel: z.string().max(12).optional(),
  }),
  doc: '{"type":"axes","x":[min,max],"y":[min,max],"xLabel":"x","yLabel":"y"} : repère, à tracer en premier si tu fais un graphique.',
  duration: 900,
  apply(state, action, reveal) {
    const frame: Frame = { x: action.x, y: action.y, xLabel: action.xLabel, yLabel: action.yLabel };
    // La pile de calculs se range à côté du nouveau repère.
    return reflowCalc({ ...state, frame, axes: { frame, reveal }, axesCleared: null }, reveal);
  },
});

export const curveCommand = defineCommand({
  schema: z.object({
    type: z.literal("curve"),
    id: Id,
    fn: Expression,
    from: finite.optional(),
    to: finite.optional(),
    color: ColorName.optional(),
    style: z.enum(["solid", "dashed", "dotted"]).optional(),
    label: z.string().max(40).optional(),
  }),
  doc:
    '{"type":"curve","id":"f","fn":"-(x-2)^2+3","from":a,"to":b,"color":"blue","style":"solid|dashed|dotted","label":"…"}\n' +
    '  "fn" est une expression en x : + - * / ^, parenthèses, sin cos tan sqrt abs exp ln log, pi. Pas de « y = ».',
  duration: 1700,
  aliases: ["graph", "plot", "function"],
  apply(state, action, reveal) {
    const { type, id, color, ...rest } = action;
    return drawNode(state, { ...base(id, reveal, color), type, ...rest }, reveal);
  },
});

export const pointCommand = defineCommand({
  schema: z.object({
    type: z.literal("point"),
    id: Id,
    at: Coord,
    label: z.string().max(40).optional(),
    color: ColorName.optional(),
    ring: z.boolean().optional(),
  }),
  doc: '{"type":"point","id":"A","at":[x,y],"label":"(2, 3)","color":"violet","ring":true}',
  duration: 450,
  aliases: ["dot"],
  apply(state, action, reveal) {
    const { type, id, color, ...rest } = action;
    return drawNode(state, { ...base(id, reveal, color), type, ...rest }, reveal);
  },
});

export const vectorCommand = defineCommand({
  schema: z.object({
    type: z.literal("vector"),
    id: Id,
    from: Coord,
    to: Coord,
    label: z.string().max(24).optional(),
    color: ColorName.optional(),
  }),
  doc: '{"type":"vector","id":"v","from":[x,y],"to":[x,y],"label":"v₀","color":"violet"}',
  duration: 750,
  aliases: ["arrow"],
  apply(state, action, reveal) {
    const { type, id, color, ...rest } = action;
    return drawNode(state, { ...base(id, reveal, color), type, ...rest }, reveal);
  },
});

export const segmentCommand = defineCommand({
  schema: z.object({
    type: z.literal("segment"),
    id: Id,
    from: Coord,
    to: Coord,
    label: z.string().max(24).optional(),
    color: ColorName.optional(),
    dashed: z.boolean().optional(),
  }),
  doc: '{"type":"segment","id":"s","from":[x,y],"to":[x,y],"label":"…","dashed":true}',
  duration: 650,
  aliases: ["line"],
  apply(state, action, reveal) {
    const { type, id, color, ...rest } = action;
    return drawNode(state, { ...base(id, reveal, color), type, ...rest }, reveal);
  },
});
