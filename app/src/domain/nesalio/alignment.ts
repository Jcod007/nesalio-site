import type { Beat } from "./contract";
import type { CueTiming } from "./scheduler";

export const CUE_TIMINGS_HEADER = "X-Nesalio-Cue-Timings";

const WORD = /^[\p{L}\p{N}\p{M}]$/u;
const DIGIT = /^\p{N}$/u;
const HYPHENS = new Set(["-", "‐", "‑"]);

/** Code point ending just before `index`, or starting at it. */
function before(text: string, index: number): string {
  if (index <= 0) return "";
  const low = text.charCodeAt(index - 1);
  return low >= 0xdc00 && low <= 0xdfff && index >= 2 ? text.slice(index - 2, index) : text.slice(index - 1, index);
}
function after(text: string, index: number): string {
  const point = text.codePointAt(index);
  return point === undefined ? "" : String.fromCodePoint(point);
}

/**
 * Whether the word continues past the cue edge: a letter or digit, a hyphen
 * between letters (« vingt-cinq »), or a decimal separator between digits
 * (« 3,14 »). Spaces, punctuation and apostrophes (« l'hypoténuse ») end it.
 */
function continues(edge: string, next: string, beyond: string): boolean {
  if (!WORD.test(edge) || !next) return false;
  if (WORD.test(next)) return true;
  if (HYPHENS.has(next)) return WORD.test(beyond);
  return (next === "," || next === ".") && DIGIT.test(edge) && DIGIT.test(beyond);
}

/** Offset of the n-th occurrence of `text` as whole words in `say`, or -1. */
export function cueOffset(say: string, text: string, occurrence: number): number {
  if (!text) return -1;
  let count = 0;
  for (let start = say.indexOf(text); start >= 0; start = say.indexOf(text, start + 1)) {
    const end = start + text.length;
    const previous = before(say, start);
    const next = after(say, end);
    if (continues(after(text, 0), previous, before(say, start - previous.length))) continue;
    if (continues(before(text, text.length), next, after(say, end + next.length))) continue;
    if (++count === occurrence) return start;
  }
  return -1;
}

interface CharacterAlignment {
  characters: readonly string[];
  characterStartTimesSeconds: readonly number[];
  characterEndTimesSeconds: readonly number[];
}

/** Read the native timing of the selected occurrence in the source text. */
export function alignBeatCues(beat: Pick<Beat, "say" | "cues">, alignment: CharacterAlignment): ReadonlyMap<string, CueTiming> {
  const { characters, characterStartTimesSeconds: starts, characterEndTimesSeconds: ends } = alignment;
  const cues = new Map<string, CueTiming>();
  if (characters.length !== starts.length || characters.length !== ends.length || characters.join("") !== beat.say) return cues;

  // Source offsets are UTF-16 indices. A provider character can span multiple code units.
  const byOffset = new Map<number, number>();
  let offset = 0;
  for (const [index, character] of characters.entries()) {
    byOffset.set(offset, index);
    offset += character.length;
  }
  byOffset.set(offset, characters.length);

  for (const cue of beat.cues) {
    const start = cueOffset(beat.say, cue.text, cue.occurrence ?? 1);
    if (start < 0) continue;
    const first = byOffset.get(start);
    const afterLast = byOffset.get(start + cue.text.length);
    if (first === undefined || afterLast === undefined) continue;
    const startMs = Math.round(starts[first]! * 1000);
    const endMs = Math.round(ends[afterLast - 1]! * 1000);
    if (endMs > startMs) cues.set(cue.id, { start: startMs, end: endMs });
  }
  return cues;
}
