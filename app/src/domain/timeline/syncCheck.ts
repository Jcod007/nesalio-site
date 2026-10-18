/**
 * Mesure de la synchronisation voix-dessin.
 *
 * Un repère {id} écrit dans la phrase de Nesa doit faire apparaître l'objet au
 * moment où le mot qui le désigne est prononcé. Aujourd'hui, le lecteur place
 * le repère au prorata des CARACTÈRES de la phrase (plan.ts). Ce module compare
 * cette prévision à l'heure réelle des mots, telle qu'une transcription
 * horodatée de l'audio la donne, et à une prévision au prorata du TEMPS DE
 * PAROLE estimé (syllabes, nombres prononcés, pauses).
 *
 * Tout est pur : l'audio et sa transcription arrivent de l'extérieur.
 */

export interface Token {
  text: string;
  /** Position du premier caractère dans la phrase. */
  start: number;
}

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
  /** Prévision actuelle : position du repère en caractères × durée. */
  linearMs: number;
  /** Prévision candidate : position du repère en temps de parole estimé × durée. */
  weightedMs: number;
}

const TOKEN = /[\p{L}\p{N}]+(?:['’,.-][\p{L}\p{N}]+)*/gu;

export function tokenize(text: string): Token[] {
  return [...text.matchAll(TOKEN)].map((m) => ({ text: m[0], start: m.index! }));
}

/* ----------------------------- nombres en mots ----------------------------- */

const UNITS = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf",
];
const TENS: Record<number, string> = { 2: "vingt", 3: "trente", 4: "quarante", 5: "cinquante", 6: "soixante" };

function below100(n: number): string {
  if (n < 20) return UNITS[n]!;
  const tens = Math.floor(n / 10);
  const unit = n % 10;
  if (tens === 7 || tens === 9) {
    const base = tens === 7 ? "soixante" : "quatre-vingt";
    return `${base}-${tens === 7 && unit === 1 ? "et-onze" : UNITS[10 + unit]}`;
  }
  if (tens === 8) return unit === 0 ? "quatre-vingts" : `quatre-vingt-${UNITS[unit]}`;
  if (unit === 0) return TENS[tens]!;
  return `${TENS[tens]}-${unit === 1 ? "et-un" : UNITS[unit]}`;
}

function below1000(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds === 0) return below100(rest);
  const head = hundreds === 1 ? "cent" : `${UNITS[hundreds]}-cent${rest === 0 ? "s" : ""}`;
  return rest === 0 ? head : `${head}-${below100(rest)}`;
}

/** Un entier (jusqu'à 999 999) en mots, comme Nesa le prononce. */
export function frenchNumber(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999) return String(n);
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  if (thousands === 0) return below1000(rest);
  const head = thousands === 1 ? "mille" : `${below1000(thousands)}-mille`;
  return rest === 0 ? head : `${head}-${below1000(rest)}`;
}

function spellNumber(token: string): string {
  const [whole, decimals] = token.split(/[,.]/);
  const words = frenchNumber(Number(whole));
  return decimals ? `${words} virgule ${frenchNumber(Number(decimals))}` : words;
}

/* ------------------------------ temps de parole ----------------------------- */

const VOWELS = /[aeiouyàâäéèêëîïôöùûüœæ]+/gi;

/** Syllabes approximatives d'un mot écrit (groupes de voyelles, e muet final). */
function syllables(word: string): number {
  const lower = word.toLowerCase();
  let count = (lower.match(VOWELS) ?? []).length;
  if (count > 1 && /[^aeiouyéèêë]e?s?$/.test(lower) && /e$|es$/.test(lower)) count--;
  return Math.max(1, count);
}

/** Symboles qui se prononcent, avec leur poids en syllabes. */
const SYMBOLS: Record<string, number> = {
  "°": 2, "=": 2, "+": 1, "−": 1, "×": 1, "/": 1, "²": 3, "³": 2, "√": 3, "≈": 3, "%": 2, "π": 1,
};
/** Pauses, en équivalent syllabes. */
const SHORT_PAUSE = 1.2;
const LONG_PAUSE = 2;

/**
 * Durée relative d'un texte dit à voix haute, en « syllabes » : les nombres
 * comptent comme leur forme prononcée, les symboles comme leur nom, et la
 * ponctuation comme une pause. Seul le rapport entre deux textes compte.
 */
export function spokenWeight(text: string): number {
  let weight = 0;
  for (const { text: token } of tokenize(text)) {
    if (/^\d+(?:[,.]\d+)?$/.test(token)) {
      weight += spellNumber(token).split(/[\s-]+/).reduce((sum, w) => sum + syllables(w), 0);
    } else {
      weight += token.split("-").reduce((sum, w) => sum + syllables(w), 0);
    }
  }
  for (const char of text) weight += SYMBOLS[char] ?? 0;
  // Un tiret isolé entre deux espaces se lit « moins ».
  weight += (text.match(/\s-\s/g) ?? []).length;
  const inner = text.trimEnd().replace(/[.;:!?,]+$/, "");
  weight += (inner.match(/,(?!\d)/g) ?? []).length * SHORT_PAUSE;
  weight += (inner.match(/[.;:!?](?!\d)/g) ?? []).length * LONG_PAUSE;
  return weight;
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
}): CueSync[] {
  const { say, cues, audioMs, words } = input;
  if (words.length === 0) return [];
  const tokens = tokenize(say);
  const alignment = alignWords(tokens.map((t) => t.text), words.map((w) => w.text));
  const total = Math.max(1e-6, spokenWeight(say));
  const rows: CueSync[] = [];

  for (const [id, fraction] of Object.entries(cues)) {
    const at = Math.round(fraction * say.length);
    const linearMs = Math.round(fraction * audioMs);
    const weightedMs = Math.round((spokenWeight(say.slice(0, at)) / total) * audioMs);
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
