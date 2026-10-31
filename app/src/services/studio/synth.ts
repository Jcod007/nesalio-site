/**
 * Le synthétiseur du studio : joue une partition (domain/studio/score.ts) dans
 * un contexte audio hors ligne et rend un AudioBuffer prêt à être mixé à la vidéo.
 *
 * Tous les sons sont fabriqués ici (oscillateurs et bruit filtré) : aucun
 * échantillon d'un tiers, donc une musique libre de droits par construction.
 *
 * Gère aussi les morceaux importés : décodage, tempo, découpe à la durée de la
 * vidéo à partir du premier temps fort, avec un fondu à la fin.
 */
import { estimateTempo, type TempoEstimate } from "@/domain/studio/beats";
import type { Note, Score } from "@/domain/studio/score";

const SAMPLE_RATE = 44_100;

type Ctx = OfflineAudioContext;

function noiseBuffer(ctx: Ctx, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (seed / 0x7fffffff) * 2 - 1;
  }
  return buffer;
}

/** Enveloppe attaque-déclin sur un gain. */
function envelope(gain: GainNode, t: number, peak: number, attack: number, dur: number, release = 0.08) {
  const g = gain.gain;
  g.setValueAtTime(0.0001, t);
  g.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.setValueAtTime(Math.max(0.0002, peak), t + Math.max(attack, dur - release));
  g.exponentialRampToValueAtTime(0.0001, t + dur + release);
}

function play(ctx: Ctx, note: Note, out: AudioNode, noise: AudioBuffer) {
  const t = note.t;
  const v = note.vel;
  const gain = ctx.createGain();
  gain.connect(out);

  const noiseSource = (filterType: BiquadFilterType, freq: number, q = 0.7) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = q;
    src.connect(filter).connect(gain);
    src.start(t, (t * 7.919) % 0.5); // départ dans le bruit qui varie d'une note à l'autre, mais déterministe
    src.stop(t + note.dur + 0.3);
    return filter;
  };
  const osc = (type: OscillatorType, freq: number, detune = 0) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.start(t);
    o.stop(t + note.dur + 0.6);
    return o;
  };

  switch (note.voice) {
    case "kick": {
      const o = osc("sine", 150);
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      o.connect(gain);
      envelope(gain, t, 0.95 * v, 0.003, 0.32, 0.12);
      break;
    }
    case "snare": {
      noiseSource("highpass", 1600);
      const body = osc("triangle", 190);
      body.connect(gain);
      envelope(gain, t, 0.5 * v, 0.002, 0.16, 0.08);
      break;
    }
    case "clap": {
      noiseSource("bandpass", 1300, 1.2);
      const g = gain.gain;
      g.setValueAtTime(0.0001, t);
      for (const [i, d] of [0, 0.012, 0.024].entries()) {
        g.linearRampToValueAtTime((0.55 - i * 0.1) * v, t + d + 0.002);
        g.linearRampToValueAtTime(0.05 * v, t + d + 0.01);
      }
      g.exponentialRampToValueAtTime(0.0001, t + 0.22);
      break;
    }
    case "hat":
      noiseSource("highpass", 7500);
      envelope(gain, t, 0.28 * v, 0.001, note.dur, 0.03);
      break;
    case "crash":
      noiseSource("highpass", 4200);
      envelope(gain, t, 0.3 * v, 0.004, 0.05, note.dur);
      break;
    case "riser": {
      const filter = noiseSource("bandpass", 400, 2.5);
      filter.frequency.setValueAtTime(400, t);
      filter.frequency.exponentialRampToValueAtTime(7000, t + note.dur);
      const g = gain.gain;
      g.setValueAtTime(0.0001, t);
      g.exponentialRampToValueAtTime(0.45 * v, t + note.dur * 0.98);
      g.linearRampToValueAtTime(0.0001, t + note.dur + 0.02);
      break;
    }
    case "sub": {
      const o = osc("sine", 70);
      o.frequency.setValueAtTime(70, t);
      o.frequency.exponentialRampToValueAtTime(34, t + note.dur);
      o.connect(gain);
      envelope(gain, t, 0.8 * v, 0.005, note.dur, 0.2);
      break;
    }
    case "bass": {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 320;
      osc("sawtooth", note.freq ?? 55).connect(filter);
      osc("sine", note.freq ?? 55).connect(filter);
      filter.connect(gain);
      envelope(gain, t, 0.42 * v, 0.008, note.dur, 0.06);
      break;
    }
    case "pad": {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1400;
      osc("sawtooth", note.freq ?? 220, -7).connect(filter);
      osc("sawtooth", note.freq ?? 220, 7).connect(filter);
      osc("triangle", (note.freq ?? 220) / 2).connect(filter);
      filter.connect(gain);
      envelope(gain, t, 0.07 * v, Math.min(0.35, note.dur / 3), note.dur, 0.3);
      break;
    }
    case "pluck": {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(3800, t);
      filter.frequency.exponentialRampToValueAtTime(700, t + 0.3);
      osc("triangle", note.freq ?? 440).connect(filter);
      osc("square", note.freq ?? 440, 5).connect(filter);
      filter.connect(gain);
      envelope(gain, t, 0.16 * v, 0.003, Math.min(0.45, note.dur), 0.25);
      break;
    }
  }
}

/** Rend la partition en son (quelques secondes de calcul pour une vidéo d'une minute). */
export async function renderScore(score: Score): Promise<AudioBuffer> {
  const seconds = score.durationSec + 0.5;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SAMPLE_RATE), SAMPLE_RATE);
  const noise = noiseBuffer(ctx, 2.5);

  const master = ctx.createGain();
  master.gain.value = 0.55;
  // Compresseur réglé en limiteur doux : pas de saturation sur les impacts (révélation, fin).
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 6;
  compressor.ratio.value = 12;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.2;
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  // Lo-fi : un son plus feutré.
  tone.frequency.value = score.style === "lofi" ? 5200 : 16_000;
  master.connect(tone).connect(compressor).connect(ctx.destination);

  // Fondu final : la dernière mesure s'éteint.
  const fade = ctx.createGain();
  fade.connect(master);
  fade.gain.setValueAtTime(1, Math.max(0, score.durationSec - 1.2));
  fade.gain.linearRampToValueAtTime(0.0001, score.durationSec + 0.4);

  for (const note of score.notes) play(ctx, note, fade, noise);
  return ctx.startRendering();
}

export interface ImportedTrack {
  name: string;
  buffer: AudioBuffer;
  tempo: TempoEstimate;
}

/** Décode un fichier audio et trouve son tempo et son premier temps fort. */
export async function importTrack(file: File): Promise<ImportedTrack> {
  const bytes = await file.arrayBuffer();
  const ctx = new OfflineAudioContext(2, SAMPLE_RATE, SAMPLE_RATE);
  const buffer = await ctx.decodeAudioData(bytes);
  // Mono, et seulement ce qu'il faut pour l'analyse.
  const length = Math.min(buffer.length, buffer.sampleRate * 45);
  const mono = new Float32Array(length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] = mono[i]! + data[i]! / buffer.numberOfChannels;
  }
  return { name: file.name, buffer, tempo: estimateTempo(mono, buffer.sampleRate) };
}

/** Le morceau importé à partir de `startSec`, coupé à la durée de la vidéo, avec un fondu final. */
export async function trimTrack(track: AudioBuffer, startSec: number, durationSec: number): Promise<AudioBuffer> {
  const seconds = durationSec + 0.5;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SAMPLE_RATE), SAMPLE_RATE);
  const src = ctx.createBufferSource();
  src.buffer = track;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(1, Math.max(0, durationSec - 1.5));
  gain.gain.linearRampToValueAtTime(0.0001, durationSec + 0.3);
  src.connect(gain).connect(ctx.destination);
  src.start(0, Math.max(0, startSec));
  return ctx.startRendering();
}
