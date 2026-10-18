/**
 * Le registre des commandes du langage de scène.
 *
 * Source unique de vérité : la validation (`Action`), l'effet sur le graphe
 * (`applyAction`), la durée d'animation et la documentation donnée au modèle
 * sont tous dérivés de cette liste. Pour ajouter une commande : écrire son
 * module, l'ajouter ici. Le rendu, lui, ne dessine que des nœuds.
 */
import { z } from "zod";
import type { BoardState, Reveal } from "@/domain/board/state";
import { focusCommand, resetViewCommand } from "./camera";
import type { CommandSpec } from "./define";
import { dimCommand, highlightCommand, undimCommand } from "./emphasis";
import { axesCommand, curveCommand, pointCommand, segmentCommand, vectorCommand } from "./figure";
import { moveCommand, transformCommand } from "./motion";
import { clearCommand, eraseCommand, groupCommand } from "./structure";
import { noteCommand, tagCommand, textCommand } from "./text";

/** Dans l'ordre où elles sont présentées au modèle. */
export const COMMANDS = {
  axes: axesCommand,
  curve: curveCommand,
  point: pointCommand,
  vector: vectorCommand,
  segment: segmentCommand,
  text: textCommand,
  note: noteCommand,
  tag: tagCommand,
  group: groupCommand,
  move: moveCommand,
  transform: transformCommand,
  highlight: highlightCommand,
  dim: dimCommand,
  undim: undimCommand,
  erase: eraseCommand,
  clear: clearCommand,
  focus: focusCommand,
  resetView: resetViewCommand,
} as const;

export const Action = z.discriminatedUnion("type", [
  axesCommand.schema,
  curveCommand.schema,
  pointCommand.schema,
  vectorCommand.schema,
  segmentCommand.schema,
  textCommand.schema,
  noteCommand.schema,
  tagCommand.schema,
  groupCommand.schema,
  moveCommand.schema,
  transformCommand.schema,
  highlightCommand.schema,
  dimCommand.schema,
  undimCommand.schema,
  eraseCommand.schema,
  clearCommand.schema,
  focusCommand.schema,
  resetViewCommand.schema,
]);
export type Action = z.infer<typeof Action>;
export type ActionType = Action["type"];

type AnySpec = CommandSpec<z.ZodType<{ type: string }>>;
const spec = (type: ActionType): AnySpec => COMMANDS[type] as unknown as AnySpec;

/** Effet d'une commande sur le graphe de scène. */
export function applyAction(state: BoardState, action: Action, reveal: Reveal): BoardState {
  return spec(action.type).apply(state, action, reveal);
}

/** Durée d'animation d'une commande, en ms. */
export function actionDuration(action: Action): number {
  const { duration } = spec(action.type);
  return typeof duration === "function" ? duration(action) : duration;
}

/** Commande instantanée : elle ne réserve pas de créneau dans la phrase. */
export function isQuick(type: ActionType): boolean {
  return spec(type).quick === true;
}

/** Noms que les modèles emploient parfois, et la commande correspondante. */
export const ACTION_ALIASES: Readonly<Record<string, ActionType>> = Object.fromEntries(
  (Object.keys(COMMANDS) as ActionType[]).flatMap((type) => (spec(type).aliases ?? []).map((alias) => [alias.toLowerCase(), type])),
);

/** Commandes qui créent un nœud identifié (un identifiant est ajouté s'il manque). */
export const NODE_COMMANDS: ReadonlySet<ActionType> = new Set(["curve", "point", "vector", "segment", "text"]);

/** Documentation de toutes les commandes, pour les consignes du modèle. */
export function commandReference(): string {
  return (Object.keys(COMMANDS) as ActionType[]).map((type) => `- ${spec(type).doc}`).join("\n");
}
