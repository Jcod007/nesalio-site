/**
 * Fonction partie entière (SN 4) : le modèle donne a, b, h et k, le moteur
 * dessine l'escalier exact de f(x) = a[b(x − h)] + k, marche par marche, avec
 * le point plein au bout atteint et le point vide au bout exclu.
 * Une courbe "fn" échantillonnée relierait les marches par des traits
 * verticaux et ne saurait pas quel bout est fermé.
 * Redemander le même escalier avec d'autres paramètres le fait évoluer sous
 * les yeux de l'élève (rôle de a, b, h, k).
 */
import { z } from "zod";
import { stepCount, stepRule, stepsOf, MAX_STEPS, type StepParams } from "@/domain/board/steps";
import { isVisible, updateNodes, type BoardNode, type BoardState } from "@/domain/board/state";
import { ColorName, finite } from "../primitives";
import { axesCommand } from "./figure";
import { defineCommand } from "./define";
import { drawFigure, point, segment, ShapeId } from "./parts";

const Param = finite.min(-100).max(100);

export const stepFunctionCommand = defineCommand({
  schema: z
    .object({
      type: z.literal("stepFunction"),
      id: ShapeId,
      a: Param.optional(),
      b: Param.refine((b) => b !== 0, { message: "b ne peut pas valoir 0" }).optional(),
      h: Param.optional(),
      k: Param.optional(),
      from: finite.optional(),
      to: finite.optional(),
      name: z.string().trim().min(1).max(3).optional(),
      rule: z.boolean().optional(),
      color: ColorName.optional(),
    })
    .refine((s) => s.from === undefined || s.to === undefined || s.to > s.from, { message: "stepFunction : from < to" })
    .refine((s) => s.from === undefined || s.to === undefined || stepCount(params(s), s.from, s.to) <= MAX_STEPS, {
      message: `stepFunction : ${MAX_STEPS} marches au plus (réduis l'intervalle ou |b|)`,
    }),
  doc:
    '{"type":"stepFunction","id":"f","a":2,"b":1,"h":0,"k":1,"from":-3,"to":3,"rule":true} : fonction PARTIE ENTIÈRE\n' +
    '  f(x) = a[b(x − h)] + k (forme du programme de SN 4), tracée exactement : chaque marche avec son point plein (bout\n' +
    '  atteint) et son point vide (bout exclu), qui changent de côté quand b < 0 ; longueur d\'une marche 1/|b|, écart\n' +
    '  entre deux marches |a|. Repère tracé s\'il manque. "rule":true écrit la règle au bout. Redemande le même id avec\n' +
    '  un autre a, b, h ou k : l\'escalier se transforme (rôle des paramètres). Parties : f-m1… (marches), f-p1… (points\n' +
    '  pleins), f-v1… (points vides), numérotées de gauche à droite. Jamais "curve" avec floor pour une partie entière.',
  duration: 2000,
  aliases: ["partieEntiere", "partie_entiere", "floor", "floorFunction", "escalier", "greatestInteger"],
  apply(state, action, reveal) {
    const p = params(action);
    let next: BoardState = state;
    if (!next.axes) {
      const from = action.from ?? -4;
      const to = action.to ?? 4;
      const ys = stepsOf(p, from, to).map((s) => s.y);
      const y0 = Math.min(-1, ...ys) - 1;
      const y1 = Math.max(1, ...ys) + 1;
      next = axesCommand.apply(next, { type: "axes", x: [Math.min(-1, from - 1), Math.max(1, to + 1)], y: [Math.floor(y0), Math.ceil(y1)], xLabel: "x", yLabel: "y" }, reveal);
    }
    const frame = next.frame;
    const from = Math.max(action.from ?? frame.x[0], frame.x[0]);
    const to = Math.min(action.to ?? frame.x[1], frame.x[1]);
    // Les marches hors du repère ne sont pas dessinées (elles déborderaient du tableau).
    const steps = stepsOf(p, from, to).filter((s) => s.y >= frame.y[0] && s.y <= frame.y[1]);
    if (steps.length === 0) return next;

    const id = action.id;
    const color = action.color ?? "blue";
    // Redemandé sans "rule" : la règle déjà écrite reste au tableau, mise à jour.
    const ruleShown = (next.groups[id]?.members ?? []).some((m) => {
      const node = next.nodes[m];
      return isVisible(node) && node.type === "segment" && Boolean(node.label);
    });
    const showRule = action.rule ?? ruleShown;
    const parts: BoardNode[] = [];
    steps.forEach((step, i) => {
      const n = i + 1;
      const last = i === steps.length - 1;
      parts.push(segment(`${id}-m${n}`, step.from, step.to, reveal, color, false, last && showRule ? stepRule(p, action.name) : undefined));
      if (step.closed) parts.push(point(`${id}-p${n}`, step.closed, undefined, reveal, color));
      if (step.open) parts.push({ ...point(`${id}-v${n}`, step.open, undefined, reveal, color), open: true } as BoardNode);
    });

    // Redemandé avec d'autres paramètres : les parties qui n'existent plus s'effacent.
    const keep = new Set(parts.map((part) => part.id));
    const stale = (next.groups[id]?.members ?? []).filter((m) => !keep.has(m) && isVisible(next.nodes[m]));
    if (stale.length > 0) next = updateNodes(next, stale, (node) => ({ ...node, erased: reveal }));
    if (next.groups[id]) next = { ...next, groups: { ...next.groups, [id]: { ...next.groups[id]!, members: next.groups[id]!.members.filter((m) => keep.has(m)) } } };

    next = drawFigure(next, id, parts, reveal);
    const group = next.groups[id]!;
    return { ...next, groups: { ...next.groups, [id]: { ...group, rule: `escalier ${stepRule(p, action.name)}` } } };
  },
});

function params(action: { a?: number; b?: number; h?: number; k?: number }): StepParams {
  return { a: action.a ?? 1, b: action.b ?? 1, h: action.h ?? 0, k: action.k ?? 0 };
}
