/**
 * Chronologie d'une vidéo du studio, calée sur la musique.
 *
 * Chaque plan commence sur le premier temps d'une mesure : la coupe tombe
 * sur le temps fort, comme dans un montage fait à la main. La durée d'un plan
 * est un nombre entier de mesures, assez long pour que le dessin se termine et
 * que le texte se lise. Les tracés « vedettes » (une courbe qui se dessine,
 * une figure qui se transforme) sont ralentis pour occuper le plan : c'est le
 * moment que le spectateur regarde jusqu'au bout.
 *
 * Pur : aucune dépendance au navigateur ni au son (testé dans timeline.test.ts).
 */
import type { Action, ActionType } from "@/domain/scene/schema";
import { planStep, type PlannedAction } from "@/domain/timeline/plan";
import { MAX_BARS, type StudioScript } from "./script";

export const BEATS_PER_BAR = 4;
/** Durée maximale d'une vidéo (au-delà, les plans en trop sont retirés). */
export const MAX_VIDEO_MS = 60_000;
/** Plage de tempo acceptée (un morceau importé hors plage est replié par octave). */
export const MIN_BPM = 70;
export const MAX_BPM = 160;

/** Commandes qui méritent d'être ralenties : on veut voir la figure se construire. */
const HERO: ReadonlySet<ActionType> = new Set<ActionType>([
  "parametric",
  "curve",
  "conic",
  "area",
  "transform",
  "applyMatrix",
  "unitCircle",
  "rotate",
  "triangle",
  "regularPolygon",
]);
/** Un tracé vedette dure au plus ceci (au-delà, l'œil décroche). */
const HERO_MAX_MS = 6500;
/** Marge en fin de plan : le dessin finit avant la coupe. */
const TAIL_MS = 250;

export interface TimelineShot {
  index: number;
  text: string;
  startMs: number;
  durationMs: number;
  bars: number;
  reveal: boolean;
  /** Décalages relatifs au début du plan. */
  actions: PlannedAction[];
}

export type AccentKind = "shot" | "reveal" | "end";

export interface Accent {
  ms: number;
  bar: number;
  kind: AccentKind;
}

export interface Timeline {
  bpm: number;
  barMs: number;
  /** L'accroche reste en grand jusqu'à cette heure. */
  hookUntilMs: number;
  shots: TimelineShot[];
  outro: { startMs: number; durationMs: number; bar: number; bars: number };
  totalMs: number;
  totalBars: number;
  accents: Accent[];
}

export function barDuration(bpm: number): number {
  return (60_000 / bpm) * BEATS_PER_BAR;
}

/** Ramène un tempo détecté dans la plage utile (un 180 devient 90, un 60 devient 120). */
export function foldBpm(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) return 100;
  let value = bpm;
  while (value > MAX_BPM) value /= 2;
  while (value < MIN_BPM) value *= 2;
  return Math.round(value * 10) / 10;
}

/** Temps de lecture d'un texte affiché (≈ 4 mots par seconde, plus le temps de le trouver). */
export function readingMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words === 0 ? 0 : 700 + words * 260;
}

/** Durée naturelle des tracés d'un plan, sans étirement. */
function naturalDrawingMs(actions: readonly Action[]): number {
  return planStep(actions, 0).drawingMs;
}

/** Mesures nécessaires pour qu'un plan se lise et se dessine. */
export function barsNeeded(text: string, actions: readonly Action[], barMs: number): number {
  const need = Math.max(naturalDrawingMs(actions), readingMs(text)) + TAIL_MS;
  return Math.min(MAX_BARS, Math.max(1, Math.ceil(need / barMs)));
}

/**
 * Horaire des tracés d'un plan : les départs s'étalent sur le plan, et le
 * tracé vedette (s'il y en a un seul, ou si le plan est une révélation) est
 * ralenti pour occuper l'essentiel du plan.
 */
export function planShot(actions: readonly Action[], shotMs: number, reveal: boolean): PlannedAction[] {
  if (actions.length === 0) return [];
  // Un tracé qui déborderait sur le plan suivant démarre plus tôt (jamais avant le début du plan).
  const plan = planStep(actions, shotMs * 0.7).actions.map((p) => {
    const latest = Math.max(0, shotMs - TAIL_MS - p.duration);
    return p.offset > latest ? { ...p, offset: Math.round(latest) } : p;
  });
  const heroes = plan.filter((p) => HERO.has(p.action.type));
  const slowDown = heroes.length > 0 && (reveal || heroes.length === 1);
  return plan.map((p) => {
    let duration = p.duration;
    if (slowDown && HERO.has(p.action.type)) {
      const room = shotMs - TAIL_MS - p.offset;
      const target = Math.min(HERO_MAX_MS, reveal ? shotMs * 0.75 : shotMs * 0.55);
      duration = Math.max(p.duration, Math.min(target, room));
    }
    return duration === p.duration ? p : { ...p, duration: Math.round(duration) };
  });
}

export interface TimelineOptions {
  bpm: number;
  /** Plafond de durée (tests ; par défaut 60 s). */
  maxMs?: number;
}

export function buildTimeline(script: StudioScript, options: TimelineOptions): Timeline {
  const bpm = foldBpm(options.bpm);
  const barMs = barDuration(bpm);
  const maxMs = options.maxMs ?? MAX_VIDEO_MS;
  const outroBars = Math.max(1, Math.ceil(2600 / barMs));

  const shots: TimelineShot[] = [];
  let bar = 0;
  for (const [index, shot] of script.shots.entries()) {
    const bars = Math.max(shot.bars ?? 1, barsNeeded(shot.text, shot.do, barMs));
    // On garde toujours au moins un plan ; les suivants seulement s'ils tiennent avec la fin.
    if (shots.length > 0 && (bar + bars + outroBars) * barMs > maxMs) break;
    const durationMs = bars * barMs;
    shots.push({
      index,
      text: shot.text,
      startMs: bar * barMs,
      durationMs,
      bars,
      reveal: shot.reveal === true,
      actions: planShot(shot.do, durationMs, shot.reveal === true),
    });
    bar += bars;
  }

  const outro = { startMs: bar * barMs, durationMs: outroBars * barMs, bar, bars: outroBars };
  const totalBars = bar + outroBars;
  const first = shots[0];
  // L'accroche reste lisible au moins 2,5 s, et jamais au-delà du premier plan.
  const hookUntilMs = first ? Math.min(first.durationMs, Math.max(2500, Math.min(barMs * 2, 3500))) : 0;

  const accents: Accent[] = shots.map((shot) => ({
    ms: shot.startMs,
    bar: Math.round(shot.startMs / barMs),
    kind: shot.reveal ? "reveal" : "shot",
  }));
  accents.push({ ms: outro.startMs, bar: outro.bar, kind: "end" });

  return { bpm, barMs, hookUntilMs, shots, outro, totalMs: totalBars * barMs, totalBars, accents };
}

/** Le plan à l'écran à l'heure `ms` (depuis le début de la vidéo), ou `null` pendant la fin. */
export function shotAt(timeline: Timeline, ms: number): TimelineShot | null {
  if (ms < 0 || ms >= timeline.outro.startMs) return null;
  for (let i = timeline.shots.length - 1; i >= 0; i--) {
    if (ms >= timeline.shots[i]!.startMs) return timeline.shots[i]!;
  }
  return null;
}
