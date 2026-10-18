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

/** Point d'un objet qui sert d'accroche : la queue ou la pointe d'un vecteur, le centre d'une figure. */
const Part = z.enum(["tail", "tip", "center"]);
type Part = z.infer<typeof Part>;

/** Où va l'objet : exactement une destination parmi to, by, near (+ side) ou onto. */
const Destination = {
  to: Coord.optional(),
  by: Coord.optional(),
  near: Id.optional(),
  side: Side.optional(),
  onto: Id.optional(),
  ontoPart: Part.optional(),
};
type DestinationSpec = { to?: Vec2; by?: Vec2; near?: string; side?: z.infer<typeof Side>; onto?: string; ontoPart?: Part };
const oneDestination = (a: DestinationSpec) => [a.to, a.by, a.near, a.onto].filter((v) => v !== undefined).length === 1;

/** Point d'accroche d'un ensemble de nœuds (coordonnées mathématiques, déplacement compris). */
function partOf(state: BoardState, ids: readonly string[], part: Part): Vec2 {
  const node = ids.length === 1 ? state.nodes[ids[0]!] : undefined;
  const shift = (p: Vec2): Vec2 => [p[0] + node!.offset[0], p[1] + node!.offset[1]];
  if (node && (node.type === "vector" || node.type === "segment") && part !== "center") return shift(part === "tail" ? node.from : node.to);
  if (node?.type === "point") return shift(node.at);
  return boxCenter(union(ids.map((id) => nodeBox(state.nodes[id]!, state.frame)))!);
}

/**
 * Déplacement (coordonnées mathématiques) qui amène `targets` à destination,
 * ou null si la destination désigne un objet absent.
 * - onto : la queue d'un vecteur (ou un point, ou le centre) se pose sur la
 *   pointe du vecteur visé (ou sur le point, ou sur le centre de la figure) ;
 *   c'est le geste « bout à bout » de l'addition de vecteurs, sans calcul.
 */
function destinationDelta(state: BoardState, targets: readonly string[], spec: DestinationSpec, ignore: readonly string[]): Vec2 | null {
  if (spec.by) return spec.by;
  const box = union(targets.map((id) => nodeBox(state.nodes[id]!, state.frame)))!;
  const center = boxCenter(box);
  if (spec.to) return [spec.to[0] - center[0], spec.to[1] - center[1]];
  if (spec.onto) {
    const others = resolveTargets(state, spec.onto);
    if (others.length === 0) return null;
    const from = partOf(state, targets, "tail");
    const onto = partOf(state, others, spec.ontoPart ?? "tip");
    return [onto[0] - from[0], onto[1] - from[1]];
  }
  const others = resolveTargets(state, spec.near!);
  if (others.length === 0) return null;
  const otherBox = union(others.map((id) => nodeBox(state.nodes[id]!, state.frame)))!;
  const placed = placeBeside(state, boxExtent(box), otherBox, spec.side, new Set([...targets, ...ignore, ...others]));
  return [placed.center[0] - center[0], placed.center[1] - center[1]];
}

export const moveCommand = defineCommand({
  schema: z
    .object({ type: z.literal("move"), target: Id, ...Destination })
    .refine(oneDestination, { message: "move : indiquer exactement un de to, by, near ou onto" }),
  doc:
    '{"type":"move","target":"w","onto":"v"} : la queue de w glisse sur la pointe de v (bout à bout, sans calcul ;\n' +
    '  "ontoPart":"tail|tip|center" pour viser la queue ou le centre). Ou "by":[dx,dy], "to":[x,y] (nouveau centre),\n' +
    '  "near":"B","side":"left". Marche pour un objet ou un groupe ; ses textes ancrés suivent.\n' +
    '  Plusieurs move du même objet dans une étape s\'enchaînent (aller, puis retour).',
  duration: 900,
  aliases: ["shift", "translate", "slide"],
  apply(state, action, reveal) {
    const targets = resolveTargets(state, action.target);
    if (targets.length === 0) return state;
    const followers = anchoredTo(state, targets);
    const delta = destinationDelta(state, targets, action, followers);
    if (!delta) return state;

    // Une ligne de calcul déplacée quitte la pile ; les autres se resserrent.
    const moved = [...targets, ...followers];
    const leaving = state.calc.filter((id) => moved.includes(id));
    let next = moveNodes(state, moved, delta, reveal);
    if (leaving.length > 0) next = reflowCalc({ ...next, calc: next.calc.filter((id) => !leaving.includes(id)) }, reveal);
    return next;
  },
});

export const copyCommand = defineCommand({
  schema: z
    .object({ type: z.literal("copy"), target: Id, id: Id, color: ColorName.optional(), ...Destination })
    .refine(oneDestination, { message: "copy : indiquer exactement un de to, by, near ou onto" }),
  doc:
    '{"type":"copy","target":"lx","id":"lx2","near":"eq","side":"left"} : une copie se détache de l\'objet et glisse\n' +
    '  jusqu\'à sa destination (mêmes destinations que move) ; l\'original reste. Pour faire voir d\'où vient un nombre\n' +
    '  (la composante −2 part dans l\'équation) ou dupliquer un vecteur avant de le déplacer.',
  duration: 900,
  aliases: ["duplicate", "clone"],
  apply(state, action, reveal) {
    if (isVisible(state.nodes[action.id])) return state; // identifiant déjà pris
    const sources = resolveTargets(state, action.target);
    if (sources.length === 0) return state;
    const delta = destinationDelta(state, sources, action, []);
    if (!delta) return state;

    // La copie apparaît d'un coup sur l'original (invisible), puis s'en détache.
    const single = sources.length === 1;
    const copyId = (source: string) => (single ? action.id : `${action.id}-${source}`);
    let next = state;
    for (const source of sources) {
      const node = state.nodes[source]!;
      const copy = {
        ...node,
        id: copyId(source),
        reveal: { start: reveal.start, duration: 1 },
        color: action.color ?? node.color,
        motions: undefined,
        morph: undefined,
        dim: undefined,
        erased: undefined,
        ...(node.type === "text" ? { role: "free" as const, anchor: undefined } : {}),
      } as BoardNode;
      next = putNode(next, copy);
    }
    const ids = sources.map(copyId);
    next = moveNodes(next, ids, delta, reveal);
    if (!single) next = { ...next, groups: { ...next.groups, [action.id]: { id: action.id, members: ids } } };
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
    case "arc":
    case "circle":
    case "polygon":
      return { ...node, color, label: a.label ?? node.label };
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
