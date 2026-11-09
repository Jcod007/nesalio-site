/**
 * Réparations sûres d'une tranche écrite par le modèle, avant sa validation.
 * Chacune corrige une faute de forme vue en vraie génération, sans rien changer
 * à ce que l'élève voit d'exact : la formule affichée reste celle déclarée, la
 * cible reste celle nommée. Tout ce qui demanderait de deviner une intention
 * (repère ambigu, nombre manquant dans une formule) est laissé à la validation,
 * qui refuse la tranche.
 */
import { compileNamedExpression } from "@/domain/math/expr";
import type { MathContext } from "./contract";
import { normalFormula, sameFormula, type ValidationState } from "./validate";

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const objects = (value: unknown): Json[] => Array.isArray(value) ? value.filter(isObject) : [];

/** Operators a model forgets between the parts of a formula; text stripped of spaces, as `normalFormula` gives. */
const OPERATORS = /^(?:[+\-=<>,;:]|\\(?:times|cdot|div|pm|leq?|geq?|neq|approx|Rightarrow|iff))*$/;

const ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const slug = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/**
 * The cue a reference names without its exact id, when exactly one cue of the
 * passage fits: `cue:isoler` for the cue `c_isoler` (prefix left out) or for the
 * cue whose text is « isoler ».
 */
function resolveCue(reference: string, cues: Json[]): string | undefined {
  const matches = cues.filter(({ id, text }) => typeof id === "string"
    && (id.endsWith(`_${reference}`) || (typeof text === "string" && slug(text) === slug(reference))));
  return matches.length === 1 ? matches[0]!.id as string : undefined;
}

/** Parts whose only defect is operators left out between them, completed so that they give back the formula. */
function joinOperators(content: string, parts: Json[]): string[] | undefined {
  const texts = parts.map((part) => part.text);
  if (!texts.every((text): text is string => typeof text === "string" && normalFormula(text).length > 0)) return;
  const whole = normalFormula(content);
  const gaps: string[] = [];
  let at = 0;
  for (const text of texts) {
    const piece = normalFormula(text);
    const found = whole.indexOf(piece, at);
    if (found < 0) return;
    gaps.push(whole.slice(at, found));
    at = found + piece.length;
  }
  const trailing = whole.slice(at);
  if (![...gaps, trailing].every((gap) => OPERATORS.test(gap))) return;
  const fixed = texts.map((text, i) => gaps[i] ? `${gaps[i]} ${text}` : text);
  if (trailing) fixed[fixed.length - 1] = `${fixed.at(-1)} ${trailing}`;
  return fixed;
}

/** An id the contract accepts, from one it refuses for its accents or spaces (`b_monté` → `b_monte`). */
function readableId(id: unknown): string | undefined {
  if (typeof id !== "string" || ID.test(id)) return;
  const fixed = slug(id);
  return ID.test(fixed) ? fixed : ID.test(`b_${fixed}`) ? `b_${fixed}` : undefined;
}

/** `{"cue": "c_x"}` → `"cue:c_x"`: the same reference, written as an object. */
function timeString(time: unknown): unknown {
  if (!isObject(time)) return time;
  const entries = Object.entries(time);
  if (entries.length !== 1) return time;
  const [kind, ref] = entries[0]!;
  return ["cue", "cue_end", "after"].includes(kind) && typeof ref === "string" ? `${kind}:${ref}` : time;
}

/**
 * The header's math context without the expressions written in x or t: those
 * are curves put in the wrong place, and only declared symbols exist there.
 * A tranche that refers to a removed expression is still refused.
 */
export function normalizeMathContext(math: unknown): { math: unknown; fixes: string[] } {
  if (!isObject(math) || !isObject(math.expressions)) return { math, fixes: [] };
  const names = new Set(isObject(math.symbols) ? Object.keys(math.symbols) : []);
  const fixes: string[] = [];
  const expressions: Json = {};
  for (const [name, source] of Object.entries(math.expressions)) {
    try {
      if (typeof source === "string") compileNamedExpression(source, names);
    } catch (error) {
      if (error instanceof Error && /« [xt] »/.test(error.message)) {
        fixes.push(`expression « ${name} » en x ou t retirée de math_context`);
        continue;
      }
    }
    expressions[name] = source;
  }
  return fixes.length ? { math: { ...math, expressions }, fixes } : { math, fixes };
}

export function normalizeSlice(raw: unknown, before?: ValidationState): { slice: unknown; fixes: string[] } {
  if (!isObject(raw)) return { slice: raw, fixes: [] };
  const slice = structuredClone(raw);
  const fixes: string[] = [];
  const beats = objects(slice.beats);
  const actions = beats.flatMap((beat) => objects(beat.do));

  // A pause belongs to a passage: on the tranche it means nothing the engine can play.
  if ("pause_after" in slice) {
    delete slice.pause_after;
    fixes.push("pause_after de la tranche retiré");
  }
  for (const [holder, field] of [[slice, "slice_id"], ...beats.map((beat) => [beat, "id"] as const)] as const) {
    const fixed = readableId(holder[field]);
    if (fixed) {
      fixes.push(`identifiant « ${String(holder[field])} » écrit « ${fixed} »`);
      holder[field] = fixed;
    }
  }

  /** Formulas written whole: declared here without parts, or earlier without parts. */
  const unsplit = new Set<unknown>(before ? [...before.formulas].filter((id) => !before.parts.has(id)) : []);
  for (const item of objects(slice.introduces)) if (item.type === "math" && !Array.isArray(item.parts)) unsplit.add(item.id);

  for (const item of objects(slice.introduces)) {
    if (item.type !== "math" || typeof item.content !== "string" || !Array.isArray(item.parts)) continue;
    const parts = objects(item.parts);
    const joined = parts.map((part) => part.text).join("");
    if (parts.length === 1 && typeof parts[0]!.text === "string" && sameFormula(parts[0]!.text, item.content)) {
      // One part equal to the whole formula: it is simply written at once.
      delete item.parts;
      for (const action of actions) if (action.target === item.id && action.part === parts[0]!.id) delete action.part;
      fixes.push(`${String(item.id)} : découpe en une seule partie retirée`);
    } else if (parts.length > 1 && !sameFormula(joined, item.content)) {
      const texts = joinOperators(item.content, parts);
      if (texts) {
        parts.forEach((part, i) => { part.text = texts[i]; });
        fixes.push(`${String(item.id)} : opérateurs rattachés aux parties`);
      }
    }
  }

  for (const beat of beats) {
    const cues = objects(beat.cues);
    const cueIds = new Set(cues.map(({ id }) => id));
    for (const action of objects(beat.do)) {
      // null stands for « absent » in what models write; the contract only knows absent fields.
      for (const [key, value] of Object.entries(action)) if (value === null) delete action[key];
      for (const field of ["at", "start", "end"] as const) {
        const time = timeString(action[field]);
        if (time !== action[field]) {
          action[field] = time;
          fixes.push(`${String(action.id)} : heure ${field} écrite en objet`);
        }
      }
      if ("pause_after" in action) {
        if (beat.pause_after === undefined) beat.pause_after = action.pause_after;
        delete action.pause_after;
        fixes.push(`${String(action.id)} : pause_after rangé dans son passage`);
      }
      if (action.part !== undefined && unsplit.has(action.target) && (action.verb === "write" || action.verb === "highlight")) {
        delete action.part;
        fixes.push(`${String(action.id)} : formule non découpée, écrite en entier`);
      }
      if (action.at === undefined && action.start === undefined && action.end === undefined) {
        action.at = "beat:start";
        fixes.push(`${String(action.id)} : sans heure, placé au début du passage`);
      } else if (action.at === undefined && (action.start === undefined) !== (action.end === undefined)) {
        // Half an interval: a start alone is a moment; an end alone is « done by this word », from the passage's start.
        if (action.start !== undefined) {
          action.at = action.start;
          delete action.start;
        } else action.start = "beat:start";
        fixes.push(`${String(action.id)} : intervalle incomplet complété`);
      }
      for (const field of ["at", "start", "end"] as const) {
        const time = action[field];
        const match = typeof time === "string" ? /^(cue|cue_end):(.+)$/.exec(time) : null;
        if (!match || cueIds.has(match[2])) continue;
        const resolved = resolveCue(match[2]!, cues);
        if (resolved) {
          action[field] = `${match[1]}:${resolved}`;
          fixes.push(`${String(action.id)} : repère « ${match[2]} » lu comme « ${resolved} »`);
        }
      }
    }
  }
  return fixes.length ? { slice, fixes } : { slice: raw, fixes };
}
