/**
 * Planification d'une étape : à quel moment chaque commande commence à se
 * dessiner pendant que Nesa parle.
 *
 * L'idée (effet « Manim ») : les tracés s'étalent sur la durée de la phrase
 * au lieu d'apparaître d'un coup. Si la phrase est courte et le dessin
 * chargé, le dessin dépasse simplement la voix ; le lecteur attend la fin
 * des deux avant de passer à l'étape suivante.
 */
import type { Action, ActionType } from "@/domain/scene/schema";

export interface PlannedAction {
  action: Action;
  /** Décalage depuis le début de l'étape, en ms. */
  offset: number;
  duration: number;
}

export interface StepPlan {
  actions: PlannedAction[];
  /** Fin du dernier tracé, en ms depuis le début de l'étape. */
  drawingMs: number;
}

const BASE_DURATION: Record<ActionType, number> = {
  axes: 900,
  curve: 1700,
  point: 450,
  vector: 750,
  segment: 650,
  text: 500,
  note: 450,
  tag: 400,
  highlight: 1400,
  erase: 450,
  focus: 1000,
  resetView: 1000,
};

/** Durée d'apparition d'une commande ; l'écriture à la main dépend de la longueur du texte. */
export function actionDuration(action: Action): number {
  const base = BASE_DURATION[action.type];
  if (action.type === "text" || action.type === "note") return base + 32 * action.text.length;
  return base;
}

/** Commandes instantanées qui ne méritent pas leur propre créneau dans la phrase. */
const QUICK: ReadonlySet<ActionType> = new Set(["highlight", "erase", "tag"]);

/** Part de la phrase sur laquelle on étale les tracés (on garde la fin pour respirer). */
const SPREAD = 0.8;
/** Recouvrement naturel : la commande suivante démarre avant la fin de la précédente. */
const OVERLAP = 0.6;

export function planStep(actions: readonly Action[], speechMs: number): StepPlan {
  if (actions.length === 0) return { actions: [], drawingMs: 0 };

  const durations = actions.map(actionDuration);

  // 1. Enchaînement naturel, sans tenir compte de la voix.
  const natural: number[] = [];
  let cursor = 0;
  actions.forEach((action, i) => {
    natural.push(cursor);
    if (!QUICK.has(action.type)) cursor += durations[i]! * OVERLAP;
  });

  // 2. Si la voix dure plus longtemps, on étire les intervalles pour suivre la phrase.
  const lastStart = natural[natural.length - 1]!;
  const window = speechMs * SPREAD;
  const stretch = lastStart > 0 && window > lastStart ? window / lastStart : 1;

  const planned = actions.map((action, i) => ({
    action,
    offset: Math.round(natural[i]! * stretch),
    duration: durations[i]!,
  }));
  const drawingMs = Math.max(...planned.map((p) => p.offset + p.duration));
  return { actions: planned, drawingMs };
}

/** Estimation de la durée d'une phrase lue à vitesse normale (≈ 165 mots par minute en français). */
export function estimateSpeechMs(text: string, rate = 1): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const pauses = (text.match(/[.,;:!?]/g) ?? []).length;
  return Math.round((words * 360 + pauses * 120 + 250) / rate);
}
