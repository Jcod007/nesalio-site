import type { Action, Beat } from "./contract";

/** All times are milliseconds on the same audio clip. */
export interface CueTiming {
  start: number;
  end: number;
}
export interface ScheduledAction {
  action: Action;
  start: number;
  end: number;
}
/** A gesture without a reliable time: never shown as synchronised, applied once the clip has ended. */
export interface DeferredAction {
  action: Action;
  reason: string;
}
export interface BeatSchedule {
  timeline: ScheduledAction[];
  deferred: DeferredAction[];
}

/**
 * The provider's duration and the duration the browser decodes can differ by a
 * few frames. A cue that overruns the clip by less than this is clamped to its end.
 */
export const CLIP_END_TOLERANCE_MS = 150;

/**
 * Converts aligned audio boundaries into a timeline, independently of timers or rendering.
 * Timing problems never throw: the affected gestures, and those that wait for them, are deferred.
 * Structural errors (duplicate ids, cycles) are the validator's job and still throw.
 */
export function scheduleBeat(
  beat: Beat,
  alignment: ReadonlyMap<string, CueTiming>,
  clipDuration: number,
  durationOf: (action: Action) => number,
): BeatSchedule {
  if (!Number.isFinite(clipDuration) || clipDuration < 0) throw new Error("Durée audio invalide.");
  const cueIds = new Set(beat.cues.map((cue) => cue.id));
  const actions = new Map(beat.do.map((action) => [action.id, action]));
  const saves = new Map(
    beat.do.flatMap((action) => (action.verb === "camera.focus" && action.save_as !== undefined ? ([[action.save_as, action]] as const) : [])),
  );
  if (actions.size !== beat.do.length) throw new Error("Identifiant d’action en double.");
  const pending = new Set<string>();
  const resolved = new Map<string, ScheduledAction | DeferredAction>();

  type Time = { ok: true; at: number } | { ok: false; reason: string };
  function cueTime(id: string, boundary: "start" | "end"): Time {
    const cue = alignment.get(id);
    if (!cueIds.has(id) || !cue || !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.end <= cue.start) {
      return { ok: false, reason: `Aucune heure fiable pour le repère « ${id} ».` };
    }
    const at = cue[boundary];
    if (at <= clipDuration) return { ok: true, at };
    if (at - clipDuration <= CLIP_END_TOLERANCE_MS) return { ok: true, at: clipDuration };
    return { ok: false, reason: `Le repère « ${id} » dépasse la fin du clip.` };
  }
  function time(trigger: string): Time {
    if (trigger === "beat:start") return { ok: true, at: 0 };
    const [kind, id] = trigger.split(":") as [string, string];
    if (kind !== "after") return cueTime(id, kind === "cue_end" ? "end" : "start");
    const predecessor = actions.get(id);
    if (!predecessor) throw new Error(`Action absente « ${id} ».`);
    const before = resolve(predecessor);
    return "reason" in before ? { ok: false, reason: `Attend « ${id} », reporté.` } : { ok: true, at: before.end };
  }

  function resolve(action: Action): ScheduledAction | DeferredAction {
    const existing = resolved.get(action.id);
    if (existing) return existing;
    if (pending.has(action.id)) throw new Error(`Dépendance cyclique autour de « ${action.id} ».`);
    pending.add(action.id);
    const trigger = action.at ?? action.start;
    if (!trigger || (!action.at && !action.end)) throw new Error(`Minutage manquant pour « ${action.id} ».`);
    let result: ScheduledAction | DeferredAction;
    const start = time(trigger);
    const end = start.ok && action.end ? time(action.end) : undefined;
    const save = action.verb === "camera.restore" ? saves.get(action.frame) : undefined;
    const saved = save ? resolve(save) : undefined;
    if (!start.ok) result = { action, reason: start.reason };
    else if (end && !end.ok) result = { action, reason: end.reason };
    else if (end && end.at <= start.at) result = { action, reason: `Intervalle vide pour « ${action.id} ».` };
    else if (save && saved && ("reason" in saved || start.at < saved.start)) {
      result = { action, reason: `Attend la sauvegarde du cadrage « ${save.save_as} ».` };
    } else {
      // A gesture may not outlast its clip: the audio clock stops at the end.
      const finish = Math.min(clipDuration, end ? end.at : start.at + durationOf(action));
      result = { action, start: start.at, end: Math.max(start.at, finish) };
    }
    pending.delete(action.id);
    resolved.set(action.id, result);
    return result;
  }

  for (const action of beat.do) resolve(action);
  const timeline: ScheduledAction[] = [];
  const deferred: DeferredAction[] = [];
  for (const entry of resolved.values()) {
    if ("reason" in entry) deferred.push(entry);
    else timeline.push(entry);
  }
  return { timeline: timeline.sort((a, b) => a.start - b.start), deferred };
}

/** Stateless sampling lets playback freeze with the playhead and rebuild after a seek. */
export function sampleBeat(timeline: readonly ScheduledAction[], playhead: number) {
  return timeline
    .filter((entry) => entry.start <= playhead)
    .map((entry) => ({
      action: entry.action,
      progress: entry.start === entry.end ? 1 : Math.min(1, (playhead - entry.start) / (entry.end - entry.start)),
    }));
}
