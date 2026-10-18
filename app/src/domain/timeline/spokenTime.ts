/**
 * Temps de parole estimé d'une phrase de Nesa, et heure de chaque repère {id}.
 *
 * Le lecteur s'en sert pour caler les tracés sur la voix : un repère tombe à
 * la part du TEMPS DE PAROLE écoulée (syllabes, nombres dits en mots, symboles,
 * pauses), et non à la part des caractères. Si l'on connaît la partie
 * vraiment parlée de l'audio (sans les silences du début et de la fin), les
 * repères sont répartis sur elle seule.
 *
 * Mesuré le 18 octobre 2026 (voix Gemini, 13 repères des démos, Whisper) :
 * au prorata des caractères, écart moyen 340 ms et jusqu'à 1,25 s sur les nombres.
 */

export interface Token {
  text: string;
  /** Position du premier caractère dans la phrase. */
  start: number;
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

export function spellNumber(token: string): string {
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

/** Partie vraiment parlée de l'audio, en ms depuis son début. */
export interface SpeechSpan {
  startMs: number;
  endMs: number;
}

/**
 * Heure (ms depuis le début de l'audio) de chaque repère, au prorata du temps
 * de parole estimé, sur la partie parlée de l'audio si on la connaît.
 */
export function cueOffsetsMs(
  say: string,
  cues: Readonly<Record<string, number>>,
  durationMs: number,
  span?: SpeechSpan,
): Record<string, number> {
  const usable = span && span.endMs > span.startMs && span.endMs <= durationMs + 1 ? span : { startMs: 0, endMs: durationMs };
  const total = Math.max(1e-6, spokenWeight(say));
  const out: Record<string, number> = {};
  for (const [id, fraction] of Object.entries(cues)) {
    const at = Math.round(Math.min(1, Math.max(0, fraction)) * say.length);
    const share = Math.min(1, spokenWeight(say.slice(0, at)) / total);
    out[id] = Math.round(usable.startMs + share * (usable.endMs - usable.startMs));
  }
  return out;
}

/** Les mêmes repères, exprimés en part de la durée (format attendu par planStep). */
export function retimeCues(
  say: string,
  cues: Readonly<Record<string, number>>,
  durationMs: number,
  span?: SpeechSpan,
): Record<string, number> {
  if (durationMs <= 0) return { ...cues };
  const offsets = cueOffsetsMs(say, cues, durationMs, span);
  return Object.fromEntries(Object.entries(offsets).map(([id, ms]) => [id, Math.min(1, ms / durationMs)]));
}
