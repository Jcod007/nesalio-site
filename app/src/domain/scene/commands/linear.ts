/**
 * Algèbre linéaire au tableau : le quadrillage du plan, une matrice appliquée
 * à tout ce qui est dessiné (le plan se déforme sous les yeux de l'élève,
 * comme chez 3Blue1Brown), et l'écriture d'une matrice en colonnes.
 */
import { z } from "zod";
import { figureBox, followAnchors, nodeBox, placeBeside, textNodeExtent, union } from "@/domain/board/layout";
import {
  applyMat,
  IDENTITY,
  isVisible,
  mulMat,
  putNode,
  resolveTargets,
  visibleNodes,
  type BoardNode,
  type BoardState,
  type Mat2,
  type TextNode,
  type Vec2,
} from "@/domain/board/state";
import { ColorName, Coord, finite, Id, Side } from "../primitives";
import { base } from "./figure";
import { defineCommand } from "./define";

const Matrix2 = z.tuple([z.tuple([finite, finite]), z.tuple([finite, finite])]);
const Cell = z.union([z.string().trim().min(1).max(12), finite.transform(String)]);
const Rows = z.array(z.array(Cell).min(1).max(4)).min(1).max(4);

export const gridCommand = defineCommand({
  schema: z.object({ type: z.literal("grid"), id: Id, color: ColorName.optional() }),
  doc:
    '{"type":"grid","id":"g"} : quadrillage du plan (une ligne par unité), en fond. À poser avant "applyMatrix" :\n' +
    '  c\'est lui qui montre que tout le plan se transforme.',
  duration: 1200,
  aliases: ["plane", "numberplane"],
  apply(state, action, reveal) {
    const frame = state.axes?.frame ?? state.frame;
    const node: BoardNode = { ...base(action.id, reveal, action.color ?? "blue"), type: "grid", x: frame.x, y: frame.y, matrix: IDENTITY };
    const next = putNode(state, node);
    // Le quadrillage passe derrière tout le reste.
    return { ...next, order: [action.id, ...next.order.filter((id) => id !== action.id)] };
  },
});

/** Image d'un nœud par la matrice (positions absolues ; le déplacement cumulé est conservé). */
function mapped(node: BoardNode, m: Mat2): BoardNode | null {
  const map = (p: Vec2): Vec2 => {
    const image = applyMat(m, [p[0] + node.offset[0], p[1] + node.offset[1]]);
    return [image[0] - node.offset[0], image[1] - node.offset[1]];
  };
  switch (node.type) {
    case "grid":
      return { ...node, matrix: mulMat(m, node.matrix) };
    case "vector":
    case "segment":
      return { ...node, from: map(node.from), to: map(node.to) };
    case "point":
      return { ...node, at: map(node.at) };
    case "polygon":
      return { ...node, points: node.points.map(map), param: undefined };
    default:
      return null; // textes, courbes y = f(x), cercles et arcs ne suivent pas la transformation
  }
}

export const applyMatrixCommand = defineCommand({
  schema: z.object({
    type: z.literal("applyMatrix"),
    matrix: Matrix2,
    targets: z.array(Id).min(1).max(16).optional(),
  }),
  doc:
    '{"type":"applyMatrix","matrix":[[3,1],[0,2]]} : applique la matrice (en lignes) à tout le plan : le quadrillage,\n' +
    '  les vecteurs, les points et les polygones se déforment ensemble, en continu. "targets":["v","sq"] pour n\'en\n' +
    '  transformer que certains. C\'est LE geste de l\'algèbre linéaire : montre la transformation, puis lis la matrice.',
  duration: 2200,
  aliases: ["applymatrix", "lineartransform", "matrixtransform"],
  apply(state, action, reveal) {
    const ids = action.targets ? action.targets.flatMap((t) => resolveTargets(state, t)) : visibleNodes(state).map((n) => n.id);
    let next = state;
    const changed: string[] = [];
    for (const id of new Set(ids)) {
      const node = next.nodes[id];
      if (!isVisible(node)) continue;
      const image = mapped(node, action.matrix);
      if (image) {
        next = putNode(next, { ...image, morph: reveal });
        changed.push(id);
      }
    }
    return followAnchors(next, changed, reveal);
  },
});

export const matrixCommand = defineCommand({
  schema: z.object({
    type: z.literal("matrix"),
    id: Id,
    rows: Rows,
    near: Id.optional(),
    side: Side.optional(),
    at: Coord.optional(),
    color: ColorName.optional(),
  }),
  doc:
    '{"type":"matrix","id":"M","rows":[[3,1],[0,2]],"near":"v","side":"right"} : matrice (ou vecteur colonne\n' +
    '  "rows":[["x"],["y"]]) écrite entre crochets, à côté d\'un objet ("near"), à une position ("at"), sinon à droite\n' +
    '  de la figure. Les cases peuvent être des nombres ou de courts textes ("2λ", "3−λ"). Se transforme avec "rows".',
  duration: (action) => 600 + 120 * action.rows.flat().length,
  aliases: ["mat", "columnvector"],
  apply(state, action, reveal) {
    const rows = action.rows.map((row) => row.map(String));
    const node: TextNode = {
      ...base(action.id, reveal, action.color),
      type: "text",
      text: rows.map((r) => r.join(" ")).join(" ; "),
      rows,
      at: [0, 0],
      align: "center",
      size: "normal",
      role: "free",
    };
    const extent = textNodeExtent(node, state.frame);
    const ignore = new Set([action.id]);
    const targets = action.near ? resolveTargets(state, action.near) : [];
    let at: Vec2;
    let anchor: TextNode["anchor"];
    if (targets.length > 0) {
      const box = union(targets.map((id) => nodeBox(state.nodes[id]!, state.frame)))!;
      const placed = placeBeside(state, extent, box, action.side, new Set([...ignore, ...targets]));
      at = placed.center;
      anchor = { target: action.near!, side: placed.side };
    } else if (action.at) {
      at = action.at;
    } else {
      at = placeBeside(state, extent, figureBox(state), action.side ?? "right", ignore).center;
    }
    return putNode({ ...state, calc: state.calc.filter((c) => c !== action.id) }, { ...node, at, anchor });
  },
});
