/**
 * Opérations sur les vecteurs (TS et SN 5) : somme par la relation de Chasles
 * (bout à bout) ou par le parallélogramme, différence, multiplication par un
 * scalaire, composantes. Le modèle nomme les vecteurs déjà au tableau ; le
 * moteur calcule et trace le résultat et sa construction (copies en
 * pointillés, côtés du parallélogramme, projections sur les axes).
 *
 * Le résultat est un vecteur du tableau portant l'id de l'opération ; la
 * construction est réunie dans le groupe `<id>-construction`.
 */
import { z } from "zod";
import { formatNumber } from "@/domain/board/geometry";
import { worldPerMath } from "@/domain/board/layout";
import { add, scale, sub } from "@/domain/board/shapes";
import { isVisible, type BoardNode, type BoardState, type Vec2 } from "@/domain/board/state";
import { ColorName, finite, Id } from "../primitives";
import { defineCommand } from "./define";
import { drawFigure, label, segment, ShapeId, vector } from "./parts";

/** Queue et pointe d'un vecteur du tableau (décalage compris). */
function vectorOf(state: BoardState, id: string): { tail: Vec2; tip: Vec2; label?: string } | null {
  const node = state.nodes[id];
  if (!isVisible(node) || node.type !== "vector") return null;
  return { tail: add(node.from, node.offset), tip: add(node.to, node.offset), label: node.label };
}

const KINDS = ["sum", "difference", "scale", "components"] as const;

export const vectorOpCommand = defineCommand({
  schema: z.object({
    type: z.literal("vectorOp"),
    id: ShapeId,
    kind: z.enum(KINDS),
    of: z.array(Id).min(1).max(2),
    method: z.enum(["chain", "parallelogram"]).optional(),
    k: finite.refine((k) => Math.abs(k) <= 10).optional(),
    label: z.string().trim().max(24).optional(),
    color: ColorName.optional(),
  }),
  doc:
    '{"type":"vectorOp","id":"s","kind":"sum","of":["u","v"],"method":"parallelogram","label":"u + v"} : opération sur des\n' +
    '  vecteurs du tableau, calculée par le moteur (les copies en gris). "sum" : "method" "chain" (v recopié au bout de u,\n' +
    '  Chasles) ou\n' +
    '  "parallelogram" (v recopié à la queue de u, côtés en pointillés, la somme sur la diagonale) ; "difference" : u − v\n' +
    '  (u + l\'opposé de v) ; "scale" avec "k" : k·u depuis la même queue ; "components" : les projections sur les axes et\n' +
    '  leurs valeurs. Le résultat est le vecteur "s" ; la construction, le groupe s-construction.',
  duration: 2000,
  aliases: ["vectorSum", "vectors"],
  apply(state, action, reveal) {
    const unit = worldPerMath(state.frame);
    const u = vectorOf(state, action.of[0]!);
    if (!u) return state;
    const du = sub(u.tip, u.tail);
    const color = action.color ?? "green";
    const id = action.id;
    const parts: BoardNode[] = [];
    let result: BoardNode | null = null;

    switch (action.kind) {
      case "sum":
      case "difference": {
        const v = action.of[1] ? vectorOf(state, action.of[1]) : null;
        if (!v) return state;
        const sign = action.kind === "difference" ? -1 : 1;
        const dv = scale(sub(v.tip, v.tail), sign);
        const name = (v.label ?? action.of[1]!) as string;
        const copyLabel = sign < 0 ? `−${name}` : name;
        if ((action.method ?? "chain") === "chain") {
          parts.push(vector(`${id}-copie`, u.tip, add(u.tip, dv), copyLabel, reveal, "muted"));
        } else {
          parts.push(vector(`${id}-copie`, u.tail, add(u.tail, dv), copyLabel, reveal, "muted"));
          parts.push(segment(`${id}-cote1`, u.tip, add(u.tip, dv), reveal, "muted", true));
          parts.push(segment(`${id}-cote2`, add(u.tail, dv), add(u.tail, add(du, dv)), reveal, "muted", true));
        }
        result = vector(id, u.tail, add(u.tail, add(du, dv)), action.label ?? "", reveal, color);
        break;
      }
      case "scale": {
        if (action.k === undefined) return state;
        result = vector(id, u.tail, add(u.tail, scale(du, action.k)), action.label ?? `${formatNumber(action.k)}${u.label ?? action.of[0]}`, reveal, color);
        break;
      }
      case "components": {
        const corner: Vec2 = [u.tip[0], u.tail[1]];
        parts.push(segment(`${id}-x`, u.tail, corner, reveal, "orange", true));
        parts.push(segment(`${id}-y`, corner, u.tip, reveal, "blue", true));
        parts.push(label(`${id}-x-l`, formatNumber(du[0]), add(scale(add(u.tail, corner), 0.5), [0, -0.35 / unit]), `${id}-x`, reveal, "orange"));
        parts.push(label(`${id}-y-l`, formatNumber(du[1]), add(scale(add(corner, u.tip), 0.5), [0.4 / unit, 0]), `${id}-y`, reveal, "blue"));
        return drawFigure(state, id, parts, reveal);
      }
    }
    const next = drawFigure(state, `${id}-construction`, parts, reveal);
    return drawFigure(next, `${id}-resultat`, [result!], { start: reveal.start + reveal.duration * 0.45, duration: reveal.duration * 0.55 });
  },
});
