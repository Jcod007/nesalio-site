/**
 * Mesure de la synchronisation voix-dessin.
 *
 * Un repère {id} écrit dans la phrase de Nesa doit faire apparaître l'objet au
 * moment où le mot qui le désigne est prononcé. Ce module compare l'heure
 * réelle des mots (transcription horodatée de l'audio) à deux prévisions :
 * l'ancienne, au prorata des CARACTÈRES de la phrase, et celle du lecteur,
 * au prorata du TEMPS DE PAROLE estimé sur la partie parlée de l'audio
 * (voir spokenTime.ts).
 *
 * Tout est pur : l'audio et sa transcription arrivent de l'extérieur.
 */

import { cueOffsetsMs, spellNumber, tokenize, type SpeechSpan } from "./spokenTime";

export { frenchNumber, spokenWeight, tokenize, type Token } from "./spokenTime";

export interface HeardWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface CueSync {
  id: string;
  /** Mot qui désigne l'objet (celui qui précède le repère). */
  word: string;
  /** Fin réelle de ce mot dans l'audio. */
  actualMs: number;
  /** Ancienne prévision : position du repère en caractères × durée. */
  linearMs: number;
  /** Prévision du lecteur : temps de parole estimé, sur la partie parlée de l'audio si elle est connue. */
  weightedMs: number;
}

/* -------------------------------- alignement -------------------------------- */

function normalize(word: string): string {
  const spelled = /^\d+(?:[,.]\d+)?$/.test(word) ? spellNumber(word) : word;
  return spelled.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Pour chaque mot prévu, l'indice du mot entendu qui lui correspond (ou null
 * s'il n'a pas été entendu). Distance d'édition : un mot remplacé (« 20 » dit
 * « vingt », mal transcrit) reste apparié à sa place.
 */
export function alignWords(expected: readonly string[], heard: readonly string[]): (number | null)[] {
  const a = expected.map(normalize);
  const b = heard.map(normalize);
  const n = a.length;
  const m = b.length;
  const cost: number[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => i + j));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const same = a[i - 1] === b[j - 1] ? 0 : 1;
      cost[i]![j] = Math.min(cost[i - 1]![j - 1]! + same, cost[i - 1]![j]! + 1, cost[i]![j - 1]! + 1);
    }
  }
  const result: (number | null)[] = new Array(n).fill(null);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const same = a[i - 1] === b[j - 1] ? 0 : 1;
    if (cost[i]![j] === cost[i - 1]![j - 1]! + same) {
      result[i - 1] = j - 1;
      i--;
      j--;
    } else if (cost[i]![j] === cost[i - 1]![j]! + 1) {
      i--;
    } else {
      j--;
    }
  }
  return result;
}

/* --------------------------------- mesure ---------------------------------- */

export function measureCues(input: {
  say: string;
  cues: Readonly<Record<string, number>>;
  audioMs: number;
  words: readonly HeardWord[];
  span?: SpeechSpan;
}): CueSync[] {
  const { say, cues, audioMs, words, span } = input;
  if (words.length === 0) return [];
  const tokens = tokenize(say);
  const alignment = alignWords(tokens.map((t) => t.text), words.map((w) => w.text));
  const predicted = cueOffsetsMs(say, cues, audioMs, span);
  const rows: CueSync[] = [];

  for (const [id, fraction] of Object.entries(cues)) {
    const at = Math.round(fraction * say.length);
    const linearMs = Math.round(fraction * audioMs);
    const weightedMs = predicted[id]!;
    let k = -1;
    tokens.forEach((token, index) => {
      if (token.start + token.text.length <= at) k = index;
    });
    if (k < 0) {
      rows.push({ id, word: "(début)", actualMs: words[0]!.startMs, linearMs, weightedMs });
      continue;
    }
    const heard = alignment[k];
    if (heard === null || heard === undefined) continue;
    rows.push({ id, word: tokens[k]!.text, actualMs: words[heard]!.endMs, linearMs, weightedMs });
  }
  return rows;
}

export interface ErrorStats {
  meanAbsMs: number;
  p90AbsMs: number;
  maxAbsMs: number;
}

function stats(errors: number[]): ErrorStats {
  if (errors.length === 0) return { meanAbsMs: 0, p90AbsMs: 0, maxAbsMs: 0 };
  const sorted = errors.map(Math.abs).sort((x, y) => x - y);
  return {
    meanAbsMs: Math.round(sorted.reduce((s, e) => s + e, 0) / sorted.length),
    maxAbsMs: sorted[sorted.length - 1]!,
    p90AbsMs: sorted[Math.ceil(sorted.length * 0.9) - 1]!,
  };
}

export function summarizeSync(rows: readonly CueSync[]): { count: number; linear: ErrorStats; weighted: ErrorStats } {
  return {
    count: rows.length,
    linear: stats(rows.map((r) => r.linearMs - r.actualMs)),
    weighted: stats(rows.map((r) => r.weightedMs - r.actualMs)),
  };
}
