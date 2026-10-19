/**
 * Commandes qui dessinent la figure : repère, courbe, point, vecteur, segment.
 */
import { z } from "zod";
import { AXES_OWNER, makeWay, placeLabel, placeText, reflowCalc } from "@/domain/board/layout";
import { putNode, visibleNodes, type BoardNode, type BoardState, type CurveNode, type Frame, type Reveal } from "@/domain/board/state";
import { ColorName, Coord, Expression, finite, Id, Range } from "../primitives";
import { defineCommand } from "./define";

/**
 * Ajoute un nœud de la figure. Il occupe son empreinte : un texte se pose à la
 * place libre la plus proche de celle demandée, l'étiquette de l'objet évite ce
 * qui est déjà au tableau, et les textes ou étiquettes que l'objet recouvre
 * glissent juste assez pour lui faire place. La pile de calculs suit si la
 * figure s'agrandit.
 */
export function drawNode(state: BoardState, node: BoardNode, reveal: Reveal): BoardState {
  let next = putNode(state, node.type === "text" && node.role === "free" ? placeText(state, node) : node);
  next = makeWay(placeLabel(next, node.id), [node.id], reveal);
  return next.axes || next.calc.length === 0 ? next : reflowCalc(next, reveal);
}

export const base = (id: string, reveal: Reveal, color?: z.infer<typeof ColorName>) => ({ id, reveal, color, offset: [0, 0] as [number, number] });

export const axesCommand = defineCommand({
  schema: z.object({
    type: z.literal("axes"),
    x: Range,
    y: Range,
    // Un nom d'axe trop long ne doit pas faire perdre tout le graphique : on le raccourcit.
    xLabel: z.string().transform((t) => t.slice(0, 20)).optional(),
    yLabel: z.string().transform((t) => t.slice(0, 20)).optional(),
    xStep: finite.positive().optional(),
    yStep: finite.positive().optional(),
  }),
  doc:
    '{"type":"axes","x":[min,max],"y":[min,max],"xLabel":"x","yLabel":"y","xStep":10} : repère, à tracer en premier si tu fais\n' +
    '  un graphique. "xStep"/"yStep" (facultatifs) : écart entre deux graduations (élargi s\'il rendrait les chiffres illisibles).',
  duration: 900,
  apply(state, action, reveal) {
    const frame: Frame = { x: action.x, y: action.y, xLabel: action.xLabel, yLabel: action.yLabel, xStep: action.xStep, yStep: action.yStep };
    let next: BoardState = { ...state, frame, axes: { frame, reveal }, axesCleared: null };
    const changed = state.frame.x.join() !== frame.x.join() || state.frame.y.join() !== frame.y.join();
    if (changed) {
      // Nouvelle échelle : les étiquettes reprennent leur place près de leur objet, et les textes
      // déjà écrits qui tomberaient sur les axes ou leurs chiffres glissent juste à côté.
      for (const node of visibleNodes(next)) if ("label" in node && node.label) next = placeLabel(next, node.id);
      next = makeWay(next, [AXES_OWNER], reveal);
    }
    // La pile de calculs se range à côté du nouveau repère.
    return reflowCalc(next, reveal);
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
    '  "fn" est une expression en x (ou en t pour un axe du temps) : + - * / ^, parenthèses, sin cos tan sqrt abs exp ln log, pi. Pas de « y = ».',
  duration: 1700,
  aliases: ["graph", "plot", "function"],
  apply(state, action, reveal) {
    const { type, id, color, ...rest } = action;
    const node: CurveNode = { ...base(id, reveal, color), type, ...rest };
    return drawNode(state, node, reveal);
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
  schema: z
    .object({
      type: z.literal("vector"),
      id: Id,
      from: Coord,
      to: Coord.optional(),
      by: Coord.optional(),
      label: z.string().max(24).optional(),
      color: ColorName.optional(),
    })
    .refine((a) => (a.to === undefined) !== (a.by === undefined), { message: "vector : indiquer to ou by (composantes)" }),
  doc: '{"type":"vector","id":"v","from":[x,y],"by":[3,2],"label":"v₀","color":"violet"} : "by" = composantes (ou "to":[x,y] = pointe).',
  duration: 750,
  aliases: ["arrow"],
  apply(state, action, reveal) {
    const { type, id, color, by, to, ...rest } = action;
    const tip: [number, number] = to ?? [action.from[0] + by![0], action.from[1] + by![1]];
    return drawNode(state, { ...base(id, reveal, color), type, ...rest, to: tip }, reveal);
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
