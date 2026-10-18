/**
 * Commandes de mouvement : déplacer un objet (ou un groupe) et transformer un
 * objet en un autre (une équation devient la suivante, une courbe change de
 * fonction…). C'est ce qui donne l'effet « vidéo » : on voit que c'est la même
 * chose qui évolue, au lieu de tout réécrire.
 */
import { z } from "zod";
import { boxCenter, boxExtent, nodeBox, placeBeside, reflowCalc, union } from "@/domain/board/layout";
import {
  anchoredTo,
  isVisible,
  moveNodes,
  putNode,
  resolveTargets,
  type BoardNode,
  type BoardState,
  type Vec2,
} from "@/domain/board/state";
import { ColorName, Coord, Expression, Id, Side } from "../primitives";
import { defineCommand } from "./define";

export const moveCommand = defineCommand({
  schema: z
    .object({
      type: z.literal("move"),
      target: Id,
      to: Coord.optional(),
      by: Coord.optional(),
      near: Id.optional(),
      side: Side.optional(),
    })
    .refine((a) => [a.to, a.by, a.near].filter((v) => v !== undefined).length === 1, {
      message: "move : indiquer exactement un de to, by ou near",
    }),
  doc:
    '{"type":"move","target":"tri","to":[x,y]} ou "by":[dx,dy] ou "near":"B","side":"left" : déplace un objet ou un groupe\n' +
    '  (ses textes ancrés suivent) pour faire de la place, rapprocher deux idées ou comparer.',
  duration: 900,
  aliases: ["shift", "translate"],
  apply(state, action, reveal) {
    const targets = resolveTargets(state, action.target);
    if (targets.length === 0) return state;
    const followers = anchoredTo(state, targets);
    const box = union(targets.map((id) => nodeBox(state.nodes[id]!, state.frame)))!;
    const center = boxCenter(box);

    let delta: Vec2;
    if (action.by) {
      delta = action.by;
    } else if (action.to) {
      delta = [action.to[0] - center[0], action.to[1] - center[1]];
    } else {
      const others = resolveTargets(state, action.near!);
      if (others.length === 0) return state;
      const otherBox = union(others.map((id) => nodeBox(state.nodes[id]!, state.frame)))!;
      const placed = placeBeside(state, boxExtent(box), otherBox, action.side, new Set([...targets, ...followers, ...others]));
      delta = [placed.center[0] - center[0], placed.center[1] - center[1]];
    }

    // Une ligne de calcul déplacée quitte la pile ; les autres se resserrent.
    const moved = [...targets, ...followers];
    const leaving = state.calc.filter((id) => moved.includes(id));
    let next = moveNodes(state, moved, delta, reveal);
    if (leaving.length > 0) next = reflowCalc({ ...next, calc: next.calc.filter((id) => !leaving.includes(id)) }, reveal);
    return next;
  },
});

const TransformSchema = z
  .object({
    type: z.literal("transform"),
    target: Id,
    text: z.string().trim().min(1).max(60).optional(),
    fn: Expression.optional(),
    at: Coord.optional(),
    from: Coord.optional(),
    to: Coord.optional(),
    label: z.string().max(40).optional(),
    color: ColorName.optional(),
  })
  .refine((a) => [a.text, a.fn, a.at, a.from, a.to, a.label, a.color].some((v) => v !== undefined), {
    message: "transform : indiquer au moins une propriété à changer",
  });

/** Applique les changements compatibles avec le type du nœud (positions absolues, déplacement cumulé déduit). */
function morphed(node: BoardNode, a: z.infer<typeof TransformSchema>): BoardNode {
  const local = (p: Vec2): Vec2 => [p[0] - node.offset[0], p[1] - node.offset[1]];
  const color = a.color ?? node.color;
  switch (node.type) {
    case "text":
      return { ...node, color, text: a.text ?? node.text };
    case "curve":
      return { ...node, color, fn: a.fn ?? node.fn, label: a.label ?? node.label };
    case "point":
      return { ...node, color, at: a.at ? local(a.at) : node.at, label: a.label ?? node.label };
    case "segment":
    case "vector":
      return { ...node, color, from: a.from ? local(a.from) : node.from, to: a.to ? local(a.to) : node.to, label: a.label ?? node.label };
  }
}

export const transformCommand = defineCommand({
  schema: TransformSchema,
  doc:
    '{"type":"transform","target":"eq1","text":"x² = 4"} : l\'objet se transforme sous les yeux de l\'élève (morphing).\n' +
    '  Texte → nouveau texte (étape de calcul suivante), courbe → "fn", point → "at", segment/vecteur → "from"/"to", ou "color".',
  duration: 1200,
  aliases: ["morph", "becomes"],
  apply(state, action, reveal) {
    const node = state.nodes[action.target];
    if (!isVisible(node)) return state;
    return putNode(state, { ...morphed(node, action), morph: reveal });
  },
});
