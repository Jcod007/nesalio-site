/**
 * La musique d'une vidéo, composée pour elle : une partition simple (batterie,
 * basse, nappe, arpège) dont les temps forts tombent sur les coupes.
 *
 * Composée ici, jouée par un synthétiseur du navigateur (services/studio/synth.ts) :
 * aucun échantillon d'un tiers, donc aucun droit à payer ni à vérifier.
 * Trois ambiances : lo-fi (calme), électro (rapide), épique (montée et impact).
 *
 * Pur et déterministe (même script, même musique) : testé dans score.test.ts.
 */
import type { MusicStyle } from "./script";
import type { Timeline } from "./timeline";

export type Voice = "kick" | "snare" | "clap" | "hat" | "crash" | "riser" | "bass" | "sub" | "pad" | "pluck";

export interface Note {
  voice: Voice;
  /** Début, en secondes depuis le début de la vidéo. */
  t: number;
  /** Durée, en secondes. */
  dur: number;
  /** Fréquence en Hz (instruments mélodiques). */
  freq?: number;
  /** 0 à 1. */
  vel: number;
}

export interface Score {
  notes: Note[];
  durationSec: number;
  style: MusicStyle;
  bpm: number;
}

const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Accords en demi-tons depuis la tonique (une progression de 4 mesures, en boucle). */
const PROGRESSIONS: Record<MusicStyle, number[][]> = {
  // vi – IV – I – V, accords enrichis (septièmes) pour la couleur lo-fi.
  lofi: [
    [9, 12, 16, 19],
    [5, 9, 12, 16],
    [0, 4, 7, 11],
    [7, 11, 14, 17],
  ],
  electro: [
    [9, 12, 16],
    [5, 9, 12],
    [0, 4, 7],
    [7, 11, 14],
  ],
  // i – VI – III – VII en mineur : la couleur « bande-annonce ».
  epic: [
    [0, 3, 7],
    [8, 12, 15],
    [3, 7, 10],
    [10, 14, 17],
  ],
};

/** Tonalités possibles (note MIDI de la tonique, octave de la nappe). */
const KEYS = [57, 60, 62, 55, 59];

/** Petit générateur pseudo-aléatoire déterministe (variations des motifs). */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10_000) / 10_000;
  };
}

export function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface ComposeOptions {
  style: MusicStyle;
  seed?: number;
}

export function composeScore(timeline: Timeline, options: ComposeOptions): Score {
  const { style } = options;
  const random = rng(options.seed ?? 7);
  const beat = 60 / timeline.bpm;
  const bar = beat * 4;
  const root = KEYS[(options.seed ?? 0) % KEYS.length]!;
  const progression = PROGRESSIONS[style];
  const notes: Note[] = [];
  const add = (note: Note) => notes.push({ ...note, t: round(note.t), dur: round(note.dur), vel: round(note.vel) });

  const revealBars = new Set(timeline.accents.filter((a) => a.kind === "reveal").map((a) => a.bar));
  const shotBars = new Set(timeline.accents.filter((a) => a.kind === "shot").map((a) => a.bar));
  const endBar = timeline.outro.bar;

  for (let b = 0; b < timeline.totalBars; b++) {
    const t0 = b * bar;
    const chord = progression[b % progression.length]!;
    const isEnd = b >= endBar;
    const lastBar = b === timeline.totalBars - 1;
    // Mesure qui précède une révélation : on retient (moins de batterie) et la montée se prépare.
    const beforeReveal = revealBars.has(b + 1);
    const intro = b === 0;
    const fade = lastBar ? 0.55 : 1;

    // Accents : impact sur une révélation et sur la fin, petit coup sur chaque nouveau plan.
    if (revealBars.has(b) || (b === endBar && b > 0)) {
      add({ voice: "crash", t: t0, dur: 1.8, vel: 0.75 });
      add({ voice: "sub", t: t0, dur: Math.min(1.6, bar), vel: 0.9 });
    } else if (shotBars.has(b) && b > 0) {
      add({ voice: "crash", t: t0, dur: 0.9, vel: 0.28 });
    }
    if (beforeReveal) add({ voice: "riser", t: t0, dur: bar, vel: 0.6 });

    // Nappe : l'accord tenu toute la mesure.
    for (const interval of chord) {
      add({ voice: "pad", t: t0, dur: bar * 1.02, freq: midiToHz(root + interval), vel: (style === "epic" ? 0.5 : 0.36) * fade });
    }

    // Basse : la tonique de l'accord.
    const bassHz = midiToHz(root + chord[0]! - 24);
    if (style === "electro") {
      for (let i = 0; i < 8; i++) {
        if (i % 2 === 1 || isEnd) add({ voice: "bass", t: t0 + (i * beat) / 2, dur: beat / 2 - 0.02, freq: bassHz, vel: 0.62 * fade });
      }
    } else if (style === "lofi") {
      add({ voice: "bass", t: t0, dur: beat * 1.5, freq: bassHz, vel: 0.6 * fade });
      add({ voice: "bass", t: t0 + beat * 2.5, dur: beat, freq: bassHz, vel: 0.5 * fade });
    } else {
      add({ voice: "bass", t: t0, dur: bar * 0.95, freq: bassHz, vel: 0.55 * fade });
    }

    // Arpège : notes de l'accord, une octave au-dessus.
    const arpNotes = chord.map((i) => root + i + 12);
    if (style === "electro" && !intro) {
      for (let i = 0; i < 16; i++) {
        const midi = arpNotes[(i * 3 + b) % arpNotes.length]!;
        add({ voice: "pluck", t: t0 + (i * beat) / 4, dur: beat / 4, freq: midiToHz(midi), vel: (i % 4 === 0 ? 0.42 : 0.26) * fade });
      }
    } else if (style === "lofi") {
      for (let i = 0; i < 4; i++) {
        if (random() < 0.35 && !intro) continue;
        const midi = arpNotes[(i + b) % arpNotes.length]! + (random() < 0.2 ? 12 : 0);
        add({ voice: "pluck", t: t0 + i * beat + (i % 2 === 1 ? beat * 0.12 : 0), dur: beat, freq: midiToHz(midi), vel: 0.3 * fade });
      }
    } else if (!intro) {
      // Épique : ostinato en croches.
      for (let i = 0; i < 8; i++) {
        const midi = arpNotes[i % 2 === 0 ? 0 : (i >> 1) % arpNotes.length]!;
        add({ voice: "pluck", t: t0 + (i * beat) / 2, dur: beat / 2, freq: midiToHz(midi), vel: 0.28 * fade });
      }
    }

    // Batterie (pas dans la dernière demi-mesure, qui résonne).
    if (intro && style !== "electro") continue;
    const drumsOff = beforeReveal ? 2 : 4; // avant une révélation : seulement la première moitié
    for (let i = 0; i < 4; i++) {
      if (i >= drumsOff || (lastBar && i >= 2)) break;
      const t = t0 + i * beat;
      if (style === "electro") {
        add({ voice: "kick", t, dur: 0.4, vel: 0.95 * fade });
        if (i % 2 === 1) add({ voice: "clap", t, dur: 0.25, vel: 0.6 * fade });
        add({ voice: "hat", t: t + beat / 2, dur: 0.06, vel: 0.4 * fade });
        add({ voice: "hat", t: t + beat / 4, dur: 0.04, vel: 0.15 * fade });
      } else if (style === "lofi") {
        if (i === 0 || (i === 2 && random() < 0.6)) add({ voice: "kick", t, dur: 0.4, vel: 0.8 * fade });
        if (i === 1 || i === 3) add({ voice: "snare", t, dur: 0.2, vel: 0.45 * fade });
        add({ voice: "hat", t, dur: 0.05, vel: 0.22 * fade });
        add({ voice: "hat", t: t + beat * 0.58, dur: 0.05, vel: 0.14 * fade }); // croche « swinguée »
      } else {
        if (i === 0 || i === 2) add({ voice: "kick", t, dur: 0.5, vel: 0.9 * fade });
        if (i === 3 && b % 2 === 1) add({ voice: "snare", t, dur: 0.35, vel: 0.7 * fade });
        if (i % 2 === 1) add({ voice: "hat", t, dur: 0.08, vel: 0.2 * fade });
      }
    }
  }

  notes.sort((a, b) => a.t - b.t);
  return { notes, durationSec: round(timeline.totalMs / 1000), style, bpm: timeline.bpm };
}

/** Tempo par défaut de chaque ambiance. */
export const STYLE_BPM: Record<MusicStyle, number> = { lofi: 84, electro: 124, epic: 96 };

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
