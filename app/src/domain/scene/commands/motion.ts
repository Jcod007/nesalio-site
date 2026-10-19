/**
 * Commandes de mouvement : déplacer un objet (ou un groupe) et transformer un
 * objet en un autre (une équation devient la suivante, une courbe change de
 * fonction…). C'est ce qui donne l'effet « vidéo » : on voit que c'est la même
 * chose qui évolue, au lieu de tout réécrire.
 */
import { z } from "zod";
import { bodyBox, boxCenter, boxExtent, followAnchors, makeWay, nodeBox, placeBeside, placeLabel, placeText, reflowCalc, union } from "@/domain/board/layout";
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
import { ColorName, Coord, Expression, finite, Id, Range, Side } from "../primitives";
import { sampleParametric } from "@/domain/board/geometry";
import { rotate } from "@/domain/board/shapes";
import { massId, putMassPoint } from "./analysis";
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
  const otherBox = union(others.map((id) => bodyBox(state.nodes[id]!, state.frame)))!;
  const placed = placeBeside(state, boxExtent(box), otherBox, spec.side, new Set([...targets, ...ignore, ...others]), new Set(others));
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

/** Un point d'appui : des coordonnées, ou un objet du tableau (un point, la queue d'un vecteur). */
const Pivot = z.union([Coord, Id]);

/** Fait tourner la géométrie d'un nœud autour de `about` (coordonnées absolues). */
function rotated(node: BoardNode, about: Vec2, degrees: number): BoardNode | null {
  const turn = (p: Vec2): Vec2 => {
    const abs: Vec2 = [p[0] + node.offset[0], p[1] + node.offset[1]];
    const r = rotate(abs, about, degrees);
    return [r[0] - node.offset[0], r[1] - node.offset[1]];
  };
  const shape = rotatedShape(node, turn, degrees);
  // L'étiquette glisse sur l'arc avec l'objet (le rendu la fait tourner autour du pivot).
  if (shape && "labelAt" in shape && shape.labelAt) return { ...shape, labelAt: turn(shape.labelAt) };
  return shape;
}

function rotatedShape(node: BoardNode, turn: (p: Vec2) => Vec2, degrees: number): BoardNode | null {
  switch (node.type) {
    case "point":
      return { ...node, at: turn(node.at) };
    case "text":
      return { ...node, at: turn(node.at) };
    case "vector":
    case "segment":
      return { ...node, from: turn(node.from), to: turn(node.to) };
    case "polygon":
      return { ...node, points: node.points.map(turn), param: undefined };
    case "circle":
      return { ...node, center: turn(node.center) };
    case "arc":
      return { ...node, center: turn(node.center), start: node.start + degrees, end: node.end + degrees };
    case "curve":
    case "grid":
      return null; // une courbe y = f(x) ou le quadrillage ne tournent pas
  }
}

export const rotateCommand = defineCommand({
  schema: z.object({ type: z.literal("rotate"), target: Id, about: Pivot, angle: finite.refine((a) => Math.abs(a) <= 720) }),
  doc:
    '{"type":"rotate","target":"corde","about":"O","angle":-30} : fait tourner un objet ou un groupe autour d\'un point\n' +
    '  (nom d\'un point, ou [x,y]) ; angle en degrés, positif = sens antihoraire. Plusieurs rotate du même objet dans une\n' +
    '  étape s\'enchaînent : un pendule qui oscille, un vecteur qui tourne, une figure qu\'on retourne.',
  duration: (action) => Math.min(2200, 500 + Math.abs(action.angle) * 8),
  aliases: ["turn", "spin", "swing"],
  apply(state, action, reveal) {
    const targets = resolveTargets(state, action.target);
    if (targets.length === 0) return state;
    let about: Vec2;
    if (typeof action.about === "string") {
      const pivot = resolveTargets(state, action.about);
      if (pivot.length === 0) return state;
      about = partOf(state, pivot, "tail");
    } else about = action.about;

    const followers = anchoredTo(state, targets);
    let next = state;
    for (const id of targets) {
      const node = next.nodes[id]!;
      const turned = rotated(node, about, action.angle);
      if (!turned) continue;
      const spin = { about, angle: action.angle, start: reveal.start, duration: reveal.duration };
      next = putNode(next, { ...turned, spins: [...(node.spins ?? []), spin].slice(-8) });
    }
    // Les textes qui accompagnent l'objet le suivent (ils glissent, sans tourner sur eux-mêmes).
    for (const id of followers) {
      const node = next.nodes[id]!;
      if (node.type !== "text") continue;
      const abs: Vec2 = [node.at[0] + node.offset[0], node.at[1] + node.offset[1]];
      const to = rotate(abs, about, action.angle);
      next = moveNodes(next, [id], [to[0] - abs[0], to[1] - abs[1]], reveal);
    }
    return next;
  },
});

const TransformSchema = z
  .object({
    type: z.literal("transform"),
    target: Id,
    text: z.string().trim().min(1).max(60).optional(),
    rows: z.array(z.array(z.string().trim().min(1).max(12)).min(1).max(4)).min(1).max(4).optional(),
    fn: Expression.optional(),
    at: Coord.optional(),
    from: Coord.optional(),
    to: Coord.optional(),
    points: z.array(Coord).min(3).max(10).optional(),
    center: Coord.optional(),
    radius: finite.positive().optional(),
    x: z.string().min(1).max(200).optional(),
    y: z.string().min(1).max(200).optional(),
    t: Range.optional(),
    label: z.string().max(40).optional(),
    color: ColorName.optional(),
  })
  .refine((a) => Object.entries(a).some(([key, v]) => key !== "type" && key !== "target" && v !== undefined), {
    message: "transform : indiquer au moins une propriété à changer",
  });

/** Applique les changements compatibles avec le type du nœud (positions absolues, déplacement cumulé déduit). */
function morphed(node: BoardNode, a: z.infer<typeof TransformSchema>): BoardNode {
  const local = (p: Vec2): Vec2 => [p[0] - node.offset[0], p[1] - node.offset[1]];
  const color = a.color ?? node.color;
  switch (node.type) {
    case "text":
      return { ...node, color, text: a.text ?? (a.rows ? a.rows.map((r) => r.join(" ")).join(" ; ") : node.text), rows: a.rows ?? node.rows };
    case "curve":
      return { ...node, color, fn: a.fn ?? node.fn, label: a.label ?? node.label };
    case "point":
      return { ...node, color, at: a.at ? local(a.at) : node.at, label: a.label ?? node.label };
    case "segment":
    case "vector":
      return { ...node, color, from: a.from ? local(a.from) : node.from, to: a.to ? local(a.to) : node.to, label: a.label ?? node.label };
    case "circle":
      return { ...node, color, center: a.center ? local(a.center) : node.center, radius: a.radius ?? node.radius, label: a.label ?? node.label };
    case "polygon": {
      if (node.param && (a.x || a.y || a.t)) {
        // Courbe paramétrée : nouvelles équations, même nombre de points (la courbe se déforme en continu).
        const param = { x: a.x ?? node.param.x, y: a.y ?? node.param.y, t: a.t ?? node.param.t };
        const points = sampleParametric(param.x, param.y, param.t);
        if (points.length > 1) return { ...node, color, param, points: points.map(local), label: a.label ?? node.label };
      }
      if (a.points && !node.param) {
        // Même nombre de sommets : chaque sommet glisse vers sa nouvelle place (le carré devient rectangle).
        return { ...node, color, points: a.points.map(local), label: a.label ?? node.label };
      }
      return { ...node, color, label: a.label ?? node.label };
    }
    case "arc":
    case "grid":
      return { ...node, color, ...("label" in node ? { label: a.label ?? node.label } : {}) } as BoardNode;
  }
}

export const transformCommand = defineCommand({
  schema: TransformSchema,
  doc:
    '{"type":"transform","target":"eq1","text":"x² = 4"} : l\'objet se transforme sous les yeux de l\'élève (morphing).\n' +
    '  Texte → "text" (étape de calcul suivante), matrice → "rows", courbe → "fn", point → "at", segment/vecteur →\n' +
    '  "from"/"to", polygone → "points" (mêmes sommets, nouvelles places : le carré devient rectangle), cercle →\n' +
    '  "center"/"radius", courbe paramétrée → "x"/"y"/"t", ou "color".',
  duration: 1200,
  aliases: ["morph", "becomes"],
  apply(state, action, reveal) {
    const node = state.nodes[action.target];
    if (!isVisible(node)) return state;
    const changed = morphed(node, action);
    let next = putNode(state, { ...changed, morph: reveal });
    if (changed.type === "text" && changed.role === "free" && !changed.anchor) {
      // Un texte qui s'allonge ne déborde pas sur ses voisins : il se décale juste assez.
      next = putNode(next, placeText(next, next.nodes[action.target] as typeof changed));
    }
    // L'étiquette d'un objet qui change de forme ou de place reprend sa place à côté de lui.

    // Le centre de masse d'une courbe paramétrée suit sa nouvelle forme.
    const moved = [action.target];
    if (changed.type === "polygon" && changed.param && isVisible(state.nodes[massId(action.target)])) {
      const absolute = changed.points.map((p) => [p[0] + changed.offset[0], p[1] + changed.offset[1]] as [number, number]);
      next = putMassPoint(next, action.target, absolute, reveal);
      moved.push(massId(action.target));
    }
    if (node.type !== "text") {
      // L'étiquette d'un objet qui change de forme ou de place reprend sa place à côté de lui,
      // et ce qu'il recouvre maintenant glisse juste assez.
      for (const id of moved) next = placeLabel(next, id);
      next = makeWay(next, moved, reveal);
    }
    return node.type === "text" ? next : followAnchors(next, moved, reveal);
  },
});
