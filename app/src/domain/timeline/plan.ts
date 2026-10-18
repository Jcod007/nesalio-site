/**
 * Planification d'une étape : à quel moment chaque commande commence à se
 * dessiner pendant que Nesa parle.
 *
 * L'idée (effet « Manim ») : les tracés s'étalent sur la durée de la phrase
 * au lieu d'apparaître d'un coup. Si la phrase est courte et le dessin
 * chargé, le dessin dépasse simplement la voix ; le lecteur attend la fin
 * des deux avant de passer à l'étape suivante.
 */
import { actionDuration, isQuick, type Action } from "@/domain/scene/commands";

export { actionDuration };

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

/** Part de la phrase sur laquelle on étale les tracés (on garde la fin pour respirer). */
const SPREAD = 0.8;
/** Recouvrement naturel : la commande suivante démarre avant la fin de la précédente. */
const OVERLAP = 0.6;

/** L'objet apparaît un peu avant le mot qui le désigne : l'œil le trouve quand l'oreille l'entend. */
const CUE_LEAD_MS = 150;

/** Identifiant de l'objet concerné par une commande (créé ou ciblé), s'il y en a un. */
function cueKey(action: Action): string | undefined {
  if ("id" in action && typeof action.id === "string") return action.id;
  if ("target" in action && typeof action.target === "string") return action.target;
  return undefined;
}

/**
 * Horaire des commandes d'une étape.
 * - Avec des repères ({id} dans la phrase) : chaque objet repéré apparaît au
 *   moment où Nesa en parle ; les autres s'enchaînent naturellement autour.
 * - Sans repère : les tracés s'étalent sur la durée de la phrase.
 */
export function planStep(actions: readonly Action[], speechMs: number, cues?: Readonly<Record<string, number>>): StepPlan {
  if (actions.length === 0) return { actions: [], drawingMs: 0 };

  const durations = actions.map(actionDuration);
  const cueOf = (action: Action) => {
    const key = cueKey(action);
    return key !== undefined && cues && key in cues ? cues[key]! : undefined;
  };

  if (cues && actions.some((action) => cueOf(action) !== undefined)) {
    // Un objet sans repère suit celui qui le précède dans la liste (le rayon vient avec son point,
    // jamais avant) ; avant le premier repère, il ouvre la phrase (le repère du graphique, par exemple).
    let follow = 0;
    const planned = actions.map((action, i) => {
      const cue = cueOf(action);
      const offset = cue !== undefined ? Math.max(0, Math.round(cue * speechMs - CUE_LEAD_MS)) : follow;
      follow = isQuick(action.type) ? offset : offset + Math.round(durations[i]! * OVERLAP);
      return { action, offset, duration: durations[i]! };
    });
    return finish(planned);
  }

  // 1. Enchaînement naturel, sans tenir compte de la voix.
  const natural: number[] = [];
  let cursor = 0;
  actions.forEach((action, i) => {
    natural.push(cursor);
    if (!isQuick(action.type)) cursor += durations[i]! * OVERLAP;
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
  return finish(planned);
}

/**
 * Deux commandes sur le même objet ne se jouent jamais en même temps : la
 * seconde attend la fin de la première (« on le déplace, puis on le ramène »).
 * Les commandes suivantes de la liste gardent leur horaire.
 */
function finish(planned: PlannedAction[]): StepPlan {
  const busyUntil = new Map<string, number>();
  const actions = planned.map((p) => {
    const key = cueKey(p.action);
    let offset = p.offset;
    if (key !== undefined && busyUntil.has(key)) offset = Math.max(offset, busyUntil.get(key)!);
    if (key !== undefined) busyUntil.set(key, offset + p.duration);
    return offset === p.offset ? p : { ...p, offset };
  });
  return { actions, drawingMs: Math.max(...actions.map((p) => p.offset + p.duration)) };
}

/** Estimation de la durée d'une phrase lue à vitesse normale (≈ 165 mots par minute en français). */
export function estimateSpeechMs(text: string, rate = 1): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const pauses = (text.match(/[.,;:!?]/g) ?? []).length;
  return Math.round((words * 360 + pauses * 120 + 250) / rate);
}
