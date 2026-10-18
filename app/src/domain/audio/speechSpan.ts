/**
 * Partie vraiment parlée d'un audio : où la voix commence et où elle finit,
 * sans les silences que la synthèse vocale ajoute au début et à la fin
 * (environ 0,3 s mesurés sur la voix de Nesa). Les repères {id} sont répartis
 * sur cette partie seulement (voir timeline/spokenTime.ts).
 */
import type { SpeechSpan } from "@/domain/timeline/spokenTime";

/** En-tête HTTP qui transmet la partie parlée de l'audio de /api/voice (« début,fin » en ms). */
export const SPEECH_SPAN_HEADER = "X-Speech-Span";

/** Lit la valeur de l'en-tête ; null si elle est absente ou incohérente. */
export function parseSpeechSpan(value: string | null): SpeechSpan | null {
  const match = /^\s*(\d+)\s*,\s*(\d+)\s*$/.exec(value ?? "");
  if (!match) return null;
  const startMs = Number(match[1]);
  const endMs = Number(match[2]);
  return endMs > startMs ? { startMs, endMs } : null;
}

/** Fenêtre d'analyse, en ms. */
const FRAME_MS = 10;
/** Seuil relatif au passage le plus fort (−26 dB) : un souffle ou un bruit de fond reste en dessous. */
const RELATIVE_THRESHOLD = 0.05;
/** En dessous de ce niveau absolu, il n'y a pas de voix du tout. */
const ABSOLUTE_THRESHOLD = 0.005;

export function detectSpeechSpan(samples: ArrayLike<number>, sampleRate: number): SpeechSpan | null {
  const frame = Math.max(1, Math.round((sampleRate * FRAME_MS) / 1000));
  const frames = Math.floor(samples.length / frame);
  if (frames === 0) return null;

  const levels = new Float64Array(frames);
  let peak = 0;
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * frame; i < (f + 1) * frame; i++) sum += samples[i]! * samples[i]!;
    levels[f] = Math.sqrt(sum / frame);
    if (levels[f]! > peak) peak = levels[f]!;
  }
  if (peak < ABSOLUTE_THRESHOLD) return null;

  const threshold = Math.max(ABSOLUTE_THRESHOLD, peak * RELATIVE_THRESHOLD);
  let first = -1;
  let last = -1;
  for (let f = 0; f < frames; f++) {
    if (levels[f]! >= threshold) {
      if (first < 0) first = f;
      last = f;
    }
  }
  const ms = (f: number) => Math.round((f * frame * 1000) / sampleRate);
  return { startMs: ms(first), endMs: ms(last + 1) };
}
