/**
 * Commandes d'attention : faire pulser un objet, estomper le contexte, le
 * rendre à pleine intensité. Elles guident le regard sans rien redessiner.
 */
import { z } from "zod";
import { resolveTargets, updateNodes, type BoardState, type Reveal } from "@/domain/board/state";
import { Id } from "../primitives";
import { defineCommand } from "./define";

function setDim(state: BoardState, target: string, on: boolean, reveal: Reveal): BoardState {
  return updateNodes(state, resolveTargets(state, target), (node) => ({ ...node, dim: { ...reveal, on } }));
}

export const highlightCommand = defineCommand({
  schema: z.object({ type: z.literal("highlight"), target: Id }),
  doc: '{"type":"highlight","target":"id"} : fait pulser un objet ou un groupe déjà au tableau.',
  duration: 1400,
  quick: true,
  apply(state, action, reveal) {
    const targets = resolveTargets(state, action.target);
    if (targets.length === 0) return state;
    const highlights = { ...state.highlights };
    for (const id of targets) highlights[id] = reveal.start;
    return { ...state, highlights };
  },
});

export const dimCommand = defineCommand({
  schema: z.object({ type: z.literal("dim"), target: Id }),
  doc: '{"type":"dim","target":"id"} : estompe un objet qui n\'est plus au centre de l\'explication (il reste visible comme repère).',
  duration: 600,
  quick: true,
  aliases: ["fade"],
  apply: (state, action, reveal) => setDim(state, action.target, true, reveal),
});

export const undimCommand = defineCommand({
  schema: z.object({ type: z.literal("undim"), target: Id }),
  doc: '{"type":"undim","target":"id"} : rend un objet estompé à pleine intensité.',
  duration: 600,
  quick: true,
  aliases: ["restore"],
  apply: (state, action, reveal) => setDim(state, action.target, false, reveal),
});
