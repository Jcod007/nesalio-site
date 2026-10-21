/**
 * Commandes de structure : regrouper des objets, effacer, vider le tableau.
 */
import { z } from "zod";
import { reflowCalc } from "@/domain/board/layout";
import { anchoredTo, DEFAULT_FRAME, isVisible, resolveTargets, updateNodes, visibleNodes } from "@/domain/board/state";
import { Id } from "../primitives";
import { defineCommand } from "./define";

export const groupCommand = defineCommand({
  schema: z.object({ type: z.literal("group"), id: Id, members: z.array(Id).min(1).max(16) }),
  doc: '{"type":"group","id":"tri","members":["a","b","h"]} : nomme un ensemble d\'objets (« le triangle ») pour le déplacer, l\'estomper ou l\'effacer d\'un coup.',
  duration: 0,
  quick: true,
  apply(state, action) {
    if (isVisible(state.nodes[action.id])) return state; // le nom est déjà pris par un objet
    const members = [...new Set(action.members.flatMap((m) => resolveTargets(state, m)))];
    if (members.length === 0) return state;
    return { ...state, groups: { ...state.groups, [action.id]: { id: action.id, members } } };
  },
});

export const eraseCommand = defineCommand({
  schema: z.object({ type: z.literal("erase"), target: Id }),
  doc: '{"type":"erase","target":"id"} : efface un objet ou un groupe (et les textes qui l\'accompagnent).',
  duration: 450,
  quick: true,
  apply(state, action, reveal) {
    const targets = resolveTargets(state, action.target);
    if (targets.length === 0) return state;
    const gone = [...targets, ...anchoredTo(state, targets)];
    let next = updateNodes(state, gone, (node) => ({ ...node, erased: reveal }));
    if (state.calc.some((id) => gone.includes(id))) {
      next = reflowCalc({ ...next, calc: next.calc.filter((id) => !gone.includes(id)) }, reveal);
    }
    return next;
  },
});

export const clearCommand = defineCommand({
  schema: z.object({ type: z.literal("clear"), axes: z.boolean().optional() }),
  doc:
    '{"type":"clear"} : efface tout le tableau pour passer à une autre idée ("axes":true efface aussi le repère).\n' +
    '  Ne l\'utilise que si ce qui est dessiné ne sert plus ; sinon, réutilise-le.',
  duration: 600,
  aliases: ["clearboard", "reset"],
  apply(state, action, reveal) {
    const ids = visibleNodes(state).map((node) => node.id);
    const next = updateNodes(state, ids, (node) => ({ ...node, erased: reveal }));
    // Sans repère, le cadre agrandi pour la figure d'avant (fitFrame) reprend sa taille.
    const cleared = { ...next, calc: [], groups: {}, highlights: {}, tag: null, ...(state.axes ? {} : { frame: DEFAULT_FRAME }) };
    return action.axes && state.axes ? { ...cleared, axes: null, axesCleared: reveal } : cleared;
  },
});
