/**
 * Tempo et premier temps fort d'un morceau importé.
 *
 * Méthode classique et légère, suffisante pour caler des coupes :
 * 1. enveloppe d'attaques : hausse de l'énergie (en log) d'une fenêtre à la suivante ;
 * 2. autocorrélation de l'enveloppe sur les tempos plausibles, pondérée autour
 *    de 120 BPM pour choisir entre un tempo et son double ;
 * 3. phase : le décalage dont les temps tombent sur les attaques les plus fortes,
 *    puis, parmi les 4 temps de la mesure, celui où l'énergie est la plus forte
 *    (le premier temps est souvent le plus appuyé).
 *
 * Pur (des échantillons en entrée) : testé avec des pistes de clics synthétiques.
 */
import { foldBpm } from "./timeline";

export interface TempoEstimate {
  bpm: number;
  /** Heure du premier temps fort dans le morceau, en ms : la vidéo démarre là. */
  offsetMs: number;
  /** 0 à 1 : à quel point le rythme est net (sous 0,2, le calage est approximatif). */
  confidence: number;
}

const HOP = 512;
const ANALYSIS_SECONDS = 40;

/** Enveloppe d'attaques (une valeur par fenêtre de HOP échantillons). */
export function onsetEnvelope(samples: Float32Array, sampleRate: number): { envelope: Float32Array; energy: Float32Array; frameRate: number } {
  const limit = Math.min(samples.length, Math.floor(sampleRate * ANALYSIS_SECONDS));
  const frames = Math.floor(limit / HOP);
  const energy = new Float32Array(frames);
  const loudness = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const start = f * HOP;
    for (let i = 0; i < HOP; i++) {
      const v = samples[start + i]!;
      sum += v * v;
    }
    loudness[f] = sum / HOP;
    energy[f] = Math.log(1e-6 + sum / HOP);
  }
  const envelope = new Float32Array(frames);
  for (let f = 1; f < frames; f++) envelope[f] = Math.max(0, energy[f]! - energy[f - 1]!);
  // On retire la moyenne glissante : seules les attaques franches comptent.
  const smoothed = new Float32Array(frames);
  const radius = 8;
  let acc = 0;
  for (let f = 0; f < frames; f++) {
    acc += envelope[f]!;
    if (f - 2 * radius - 1 >= 0) acc -= envelope[f - 2 * radius - 1]!;
    const center = f - radius;
    if (center >= 0) smoothed[center] = Math.max(0, envelope[center]! - acc / (2 * radius + 1));
  }
  return { envelope: smoothed, energy: loudness, frameRate: sampleRate / HOP };
}

export function estimateTempo(samples: Float32Array, sampleRate: number): TempoEstimate {
  const { envelope, energy, frameRate } = onsetEnvelope(samples, sampleRate);
  const n = envelope.length;
  if (n < frameRate * 3) return { bpm: 100, offsetMs: 0, confidence: 0 };

  let mean = 0;
  for (const v of envelope) mean += v;
  mean /= n;
  const centered = Float32Array.from(envelope, (v) => v - mean);
  let zeroLag = 0;
  for (const v of centered) zeroLag += v * v;
  if (zeroLag <= 0) return { bpm: 100, offsetMs: 0, confidence: 0 };

  // Autocorrélation sur 60 à 200 BPM.
  const minLag = Math.floor((60 * frameRate) / 200);
  const maxLag = Math.ceil((60 * frameRate) / 60);
  const corr = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1 && lag < n; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < n; i++) sum += centered[i]! * centered[i + lag]!;
    corr[lag] = sum / (n - lag);
  }

  let bestLag = minLag;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * frameRate) / lag;
    // Préférence douce pour 120 BPM (une octave d'écart-type) : départage un tempo et son double.
    const weight = Math.exp(-0.5 * Math.log2(bpm / 120) ** 2);
    const score = corr[lag]! * weight;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  // Affinage entre deux fenêtres (interpolation parabolique).
  const a = corr[bestLag - 1] ?? 0;
  const b = corr[bestLag]!;
  const c = corr[bestLag + 1] ?? 0;
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom)) : 0;
  const period = bestLag + shift;
  const bpm = foldBpm((60 * frameRate) / period);
  const beatFrames = (60 * frameRate) / bpm;

  // Phase du temps : le décalage qui accumule le plus d'attaques.
  const steps = Math.max(1, Math.round(beatFrames));
  let bestPhase = 0;
  let bestPhaseScore = -Infinity;
  for (let phase = 0; phase < steps; phase++) {
    let sum = 0;
    for (let t = phase; t < n; t += beatFrames) sum += peakNear(envelope, t, 2);
    if (sum > bestPhaseScore) {
      bestPhaseScore = sum;
      bestPhase = phase;
    }
  }

  // Premier temps de la mesure : celui des 4 où le son est le plus fort (énergie, pas son logarithme).
  let bestBeat = 0;
  let bestBeatScore = -Infinity;
  for (let beat = 0; beat < 4; beat++) {
    let sum = 0;
    for (let t = bestPhase + beat * beatFrames; t < n; t += 4 * beatFrames) sum += peakNear(energy, t, 2);
    if (sum > bestBeatScore) {
      bestBeatScore = sum;
      bestBeat = beat;
    }
  }

  // Calé sur l'attaque réelle la plus proche (un tempo arrondi décale un peu la grille).
  const predicted = bestPhase + bestBeat * beatFrames;
  let offsetFrames = Math.round(predicted);
  for (let f = Math.max(0, Math.round(predicted) - 3); f <= Math.min(n - 1, Math.round(predicted) + 3); f++) {
    if (envelope[f]! > envelope[offsetFrames]!) offsetFrames = f;
  }
  const confidence = Math.max(0, Math.min(1, corr[bestLag]! / (zeroLag / n)));
  return { bpm, offsetMs: Math.round((offsetFrames / frameRate) * 1000), confidence: Math.round(confidence * 100) / 100 };
}

/** Le maximum autour de `t` (± `radius` fenêtres) : tolère une grille un peu décalée. */
function peakNear(values: Float32Array, t: number, radius: number): number {
  const center = Math.round(t);
  let best = 0;
  for (let i = Math.max(0, center - radius); i <= Math.min(values.length - 1, center + radius); i++) best = Math.max(best, values[i]!);
  return best;
}
