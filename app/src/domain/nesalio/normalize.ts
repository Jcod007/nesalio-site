/**
 * Réparations sûres d'une tranche écrite par le modèle, avant sa validation.
 * Chacune corrige une faute de forme vue en vraie génération, sans rien changer
 * à ce que l'élève voit d'exact : la formule affichée reste celle déclarée, la
 * cible reste celle nommée. Tout ce qui demanderait de deviner une intention
 * (repère ambigu, nombre manquant dans une formule) est laissé à la validation,
 * qui refuse la tranche.
 */
import { compileNamedExpression } from "@/domain/math/expr";
import { cueOffset } from "./alignment";
import type { MathContext } from "./contract";
import { normalFormula, sameFormula, standaloneTex, type ValidationState } from "./validate";

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const objects = (value: unknown): Json[] => Array.isArray(value) ? value.filter(isObject) : [];

/** Operators a model forgets between the parts of a formula; text stripped of spaces, as `normalFormula` gives. */
const OPERATORS = /^(?:[+\-=<>,;:]|\\(?:times|cdot|div|pm|leq?|geq?|neq|approx|Rightarrow|iff))*$/;

const ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
/** One character for one character (so positions stay the same): lower case, no accent, one apostrophe. */
const fold = (text: string) => Array.from(text, (char) => char.normalize("NFD")[0]!.toLowerCase().replace(/[’ʼ`]/, "'")).join("");
const slug = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/**
 * A cue id with an accent or another character the contract refuses (« c_libère », seen on
 * the Alloprof bench and refused until the lesson stopped): written without it, the same
 * name in every reference of the passage. A name already taken gets a number.
 */
function renameCueIds(cues: Json[], actions: Json[], fixes: string[]): void {
  const taken = new Set(cues.map(({ id }) => id));
  for (const cue of cues) {
    if (typeof cue.id !== "string" || ID.test(cue.id)) continue;
    const base = slug(cue.id);
    let id = /^[a-z]/.test(base) ? base : `c_${base || "repere"}`;
    for (let n = 2; taken.has(id); n++) id = `${/^[a-z]/.test(base) ? base : `c_${base || "repere"}`}_${n}`;
    if (!ID.test(id)) continue;
    const old = cue.id;
    taken.add(id);
    cue.id = id;
    for (const action of actions) for (const field of ["at", "start", "end"] as const) {
      if (action[field] === `cue:${old}`) action[field] = `cue:${id}`;
      if (action[field] === `cue_end:${old}`) action[field] = `cue_end:${id}`;
    }
    fixes.push(`repère « ${old} » renommé « ${id} »`);
  }
}

/**
 * An interval whose end comes before its start in the sentence (start on « cosinus », end after
 * « sinus » said before it): its two words are swapped, so the gesture covers both. Seen on the
 * Alloprof bench, refused three times in a row until the lesson stopped.
 */
function orderInterval(action: Json, say: string, cues: Json[], fixes: string[]): void {
  const at = (time: unknown) => {
    const match = typeof time === "string" ? /^(cue|cue_end):(.+)$/.exec(time) : null;
    const cue = match && cues.find(({ id }) => id === match[2]);
    if (!match || !cue || typeof cue.text !== "string") return;
    const start = cueOffset(say, cue.text, typeof cue.occurrence === "number" ? cue.occurrence : 1);
    return start < 0 ? undefined : { id: match[2]!, start, end: start + cue.text.length, kind: match[1]! };
  };
  // With `at`, the interval is not what times the gesture: nothing to put in order.
  if (action.at !== undefined) return;
  const start = at(action.start), end = at(action.end);
  if (!start || !end) return;
  const from = start.kind === "cue" ? start.start : start.end, to = end.kind === "cue" ? end.start : end.end;
  // In order, or the same words named twice (`cue_end:x` to `cue:x`): left to the validation.
  if (to > from || end.start >= start.start) return;
  action.start = `cue:${end.id}`;
  action.end = `cue_end:${start.id}`;
  fixes.push(`${String(action.id)} : début et fin d'intervalle inversés, remis dans l'ordre de la phrase`);
}

/**
 * The cue a reference names without its exact id, when exactly one cue of the
 * passage fits: `cue:isoler` for the cue `c_isoler` (prefix left out) or for the
 * cue whose text is « isoler ».
 */
function resolveCue(reference: string, cues: Json[]): string | undefined {
  // `slug(id)`: a cue already renamed without its accent (renameCueIds), cited with it (`{"cue": "c_libère"}`).
  const matches = cues.filter(({ id, text }) => typeof id === "string"
    && (id.endsWith(`_${reference}`) || id === slug(reference) || (typeof text === "string" && slug(text) === slug(reference))));
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
 * A JSON line whose lone backslashes are doubled where they cannot be a JSON
 * escape: a model writes `\sqrt`, `\cdot`, `\pi`, `\,` in a formula with one
 * backslash, and the whole line becomes unreadable. Taken from the former
 * tutor's `escapeLatex` (domain/tutor/modelOutput.ts), made safe without its
 * list of commands: only invalid escapes are touched, so a line that already
 * parses is returned unchanged. Valid escapes (`\frac` read as a form feed) are
 * restored after parsing, in formulas only (`restoreLatex`).
 */
export function escapeLatex(line: string): string {
  let out = "";
  let inString = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index]!;
    if (!inString) {
      if (char === "\"") inString = true;
      out += char;
    } else if (char === "\"") {
      inString = false;
      out += char;
    } else if (char === "\\") {
      const next = line[index + 1] ?? "";
      if (/["\\/bfnrt]/.test(next) || (next === "u" && /^[0-9a-fA-F]{4}$/.test(line.slice(index + 2, index + 6)))) {
        out += char + next;
        index++;
      } else out += "\\\\";
    } else out += char;
  }
  return out;
}

const CONTROLS: Record<string, string> = { "\f": "f", "\b": "b", "\t": "t", "\r": "r", "\n": "n" };

/**
 * A formula whose LaTeX commands lost their backslash to a JSON escape: `\frac`
 * written with one backslash is read as a form feed then « rac », `\times` as a
 * tab, `\neq` as a line break. A formula never holds a form feed, backspace,
 * tab or carriage return, so each one followed by a letter is the backslash it
 * stood for. A line break may be real (a system written on two lines): it is
 * restored only before the rest of a command that starts with n (`\neq` read
 * as a line break then « eq »).
 */
export function restoreLatex(text: unknown): string | undefined {
  if (typeof text !== "string") return;
  const fixed = text.replace(/[\f\b\t\r](?=[a-zA-Z])|\n(?=(?:eq?|abla|otin|ot|u|i|eg|ewline)(?![a-zA-Z]))/g,
    (char) => `\\${CONTROLS[char]}`);
  return fixed === text ? undefined : fixed;
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

/** Whether the parts are, in order, the braced arguments of the formula's fractions (\frac{3}{4} cut into 3 and 4). */
function fractionArguments(content: string, parts: Json[]): boolean {
  if (!/\\[dt]?frac/.test(content)) return false;
  const whole = normalFormula(content);
  let at = 0;
  for (const part of parts) {
    if (typeof part.text !== "string") return false;
    const found = whole.indexOf(`{${normalFormula(part.text)}}`, at);
    if (found < 0) return false;
    at = found + normalFormula(part.text).length + 2;
  }
  return true;
}

/**
 * Parts removed from a formula: the first write of a part writes it whole, the
 * later writes of parts highlight it, the other gestures aim at the whole formula.
 */
function writeWhole(item: Json, partIds: ReadonlySet<unknown>, actions: readonly Json[]): void {
  let written = false;
  for (const action of actions) {
    if (action.target !== item.id || !partIds.has(action.part)) continue;
    delete action.part;
    if (action.verb === "write") {
      if (written) Object.assign(action, { verb: "highlight", role: "accent" });
      written = true;
    }
  }
}

const LAYOUT_REFERENCES = ["next_to", "align_to", "center_on"] as const;
/** Gestures that act on an object already on the board: placed before a redeclared object appears, they aim at the old one. */
const OLD_OBJECT_VERBS = new Set(["dim", "fade_out", "remove", "move"]);
const APPEARING_VERBS = new Set(["show", "draw", "write"]);

/**
 * An object of this tranche declared with the id of an object of an earlier
 * tranche: it gets a free id (`eq2` → `eq2_2`), and the tranche's references
 * follow it, except those that can only mean the old object: the source of a
 * transform, and a dim, fade_out, remove or move placed before the new object
 * appears.
 */
function renameRedeclared(slice: Json, beats: readonly Json[], before: ValidationState, fixes: string[]): void {
  const holders = [...objects(slice.introduces), ...objects(slice.groups)];
  const declared = holders.map(({ id }) => id);
  const taken = new Set<unknown>([...before.objects, ...declared]);
  for (const holder of holders) {
    const old = holder.id;
    // Declared twice in this tranche too: which declaration a reference means cannot be told.
    if (typeof old !== "string" || !before.objects.has(old) || declared.filter((id) => id === old).length !== 1) continue;
    let n = 2;
    while (taken.has(`${old}_${n}`)) n++;
    const fresh = `${old}_${n}`;
    if (!ID.test(fresh)) continue;
    taken.add(fresh);
    holder.id = fresh;
    const swap = (container: Json, field: string) => { if (container[field] === old) container[field] = fresh; };
    for (const other of holders) {
      if (isObject(other.layout)) for (const field of LAYOUT_REFERENCES) swap(other.layout, field);
      if (isObject(other.attachment)) swap(other.attachment, "parent");
      swap(other, "frame");
      if (Array.isArray(other.items)) other.items = other.items.map((id) => id === old ? fresh : id);
    }
    const located = beats.flatMap((beat, beatIndex) => objects(beat.do).map((action) => ({ action, beatIndex })));
    const appears = located.findIndex(({ action }) => action.target === old
      && (APPEARING_VERBS.has(action.verb as string) || action.verb === "transform"));
    located.forEach(({ action, beatIndex }, index) => {
      // Array order is not time order inside a passage: a gesture at beat:start of the passage where the new
      // object appears (or of an earlier one) comes before it, wherever it is written (relecteur, cycle 2).
      const atStart = action.at === "beat:start" || action.start === "beat:start";
      const precedes = appears < 0 || index < appears || (atStart && beatIndex <= located[appears]!.beatIndex);
      if (OLD_OBJECT_VERBS.has(action.verb as string) && precedes) return;
      swap(action, "target");
      if (Array.isArray(action.targets)) action.targets = action.targets.map((id) => id === old ? fresh : id);
      if (isObject(action.to)) for (const field of LAYOUT_REFERENCES) swap(action.to, field);
    });
    fixes.push(`« ${old} » déjà déclaré dans une tranche précédente : l'objet de cette tranche renommé « ${fresh} »`);
  }
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

  for (const item of objects(slice.introduces)) {
    if (item.type !== "math") continue;
    const restored = [item, ...objects(item.parts)].map((holder) => {
      const field = holder === item ? "content" : "text";
      const fixed = restoreLatex(holder[field]);
      if (fixed !== undefined) holder[field] = fixed;
      return fixed !== undefined;
    });
    if (restored.some(Boolean)) fixes.push(`${String(item.id)} : barre oblique LaTeX rendue à la formule`);
  }

  if (before) renameRedeclared(slice, beats, before, fixes);

  for (const item of objects(slice.introduces)) {
    if (item.type !== "matrix" || !isObject(item.params)) continue;
    const params = item.params;
    for (const [key, value] of Object.entries(params)) {
      if (value !== null) continue;
      delete params[key];
      fixes.push(`${String(item.id)} : ${key} à null retiré du tableau`);
    }
    const blank = (label: unknown) => typeof label === "string" && label.trim() === "";
    // Row titles written, even all blank: one more column header may stand above them (the corner).
    const titled = Array.isArray(params.row_labels);
    // An empty list (`"row_labels": []`), or a list of blank titles only: the same table without it.
    for (const key of ["row_labels", "column_labels"] as const) {
      const list = params[key];
      if (!Array.isArray(list) || (list.length > 0 && !list.every(blank))) continue;
      delete params[key];
      fixes.push(`${String(item.id)} : ${key} vide retiré du tableau`);
    }
    const labels = params.column_labels;
    const columns = Array.isArray(params.rows) && Array.isArray(params.rows[0]) ? params.rows[0].length : undefined;
    if (Array.isArray(labels) && titled && columns !== undefined && labels.length === columns + 1 && blank(labels[0])
      && (!Array.isArray(params.row_labels) || labels.slice(1).every((label) => typeof label === "string" && !blank(label)))) {
      // The empty corner above the row titles: the contract places the titles' column without a header.
      params.column_labels = labels.slice(1);
      fixes.push(`${String(item.id)} : en-tête vide du coin du tableau retiré`);
    }
  }

  // Placed next to a formula a transform replaced in an earlier tranche: the formula standing there now.
  if (before) for (const holder of [...objects(slice.introduces), ...objects(slice.groups)]) {
    if (!isObject(holder.layout)) continue;
    for (const field of LAYOUT_REFERENCES) {
      const reference = holder.layout[field];
      if (typeof reference !== "string" || !before.replacedBy.has(reference)) continue;
      let now = reference;
      for (let i = 0; i < 64 && before.replacedBy.has(now); i++) now = before.replacedBy.get(now)!;
      if (!before.objects.has(now) || before.removed.has(now)) continue;
      holder.layout[field] = now;
      fixes.push(`${String(holder.id)} : placé par rapport à « ${reference} », remplacée par transform, donc à « ${now} »`);
    }
  }

  // Parts belong to a fixed formula: a computed value is written whole.
  for (const item of objects(slice.introduces)) {
    if (item.type !== "math" || !isObject(item.content) || !Array.isArray(item.parts)) continue;
    const ids = new Set(objects(item.parts).map((part) => part.id));
    delete item.parts;
    writeWhole(item, ids, actions);
    fixes.push(`${String(item.id)} : parties d'une valeur calculée retirées, formule écrite d'un coup`);
  }

  /** Tables (matrix): write draws them whole. */
  const tables = new Set<unknown>(before?.tableParts?.keys() ?? []);
  for (const item of objects(slice.introduces)) if (item.type === "matrix") tables.add(item.id);

  /** Formulas written whole: declared here without parts, or earlier without parts. */
  const unsplit = new Set<unknown>(before ? [...before.formulas].filter((id) => !before.parts.has(id)) : []);
  for (const item of objects(slice.introduces)) if (item.type === "math" && !Array.isArray(item.parts)) unsplit.add(item.id);

  for (const item of objects(slice.introduces)) {
    if (item.type !== "math" || typeof item.content !== "string" || !Array.isArray(item.parts)) continue;
    const parts = objects(item.parts);
    const joined = parts.map((part) => part.text).join("");
    const texts = parts.length > 1 && !sameFormula(joined, item.content) ? joinOperators(item.content, parts) : undefined;
    if (texts) {
      parts.forEach((part, i) => { part.text = texts[i]; });
      fixes.push(`${String(item.id)} : opérateurs rattachés aux parties`);
    } else if (parts.length < 2 || !sameFormula(joined, item.content)
      || parts.some((part) => typeof part.text !== "string" || !standaloneTex(part.text))) {
      // Parts that cannot be written one by one: the declared formula is written whole on the first part's word,
      // the later steps highlight it. What the student sees is the declared formula; only the piece-by-piece writing is lost.
      delete item.parts;
      writeWhole(item, new Set(parts.map((part) => part.id)), actions);
      fixes.push(parts.length === 1 && typeof parts[0]!.text === "string" && sameFormula(parts[0]!.text, item.content)
        ? `${String(item.id)} : découpe en une seule partie retirée`
        : fractionArguments(item.content, parts)
          ? `${String(item.id)} : fraction découpée en numérateur et dénominateur, écrite d'un coup`
          : `${String(item.id)} : parties qui ne redonnent pas la formule, formule écrite d'un coup`);
    }
  }

  /** Actions of the passages already played in this tranche: done by the time a later passage starts. */
  const earlier = new Set<unknown>();
  for (const beat of beats) {
    const cues = objects(beat.cues);
    renameCueIds(cues, objects(beat.do), fixes);
    const cueIds = new Set(cues.map(({ id }) => id));
    const own = new Set(objects(beat.do).map(({ id }) => id));
    // A cue copied with another case, accent or apostrophe: the words of the sentence, exactly as said.
    if (typeof beat.say === "string") {
      const say = beat.say;
      for (const cue of cues) {
        if (typeof cue.text !== "string" || say.includes(cue.text)) continue;
        const found = fold(say).indexOf(fold(cue.text));
        if (found >= 0 && fold(say).indexOf(fold(cue.text), found + 1) < 0) {
          const exact = say.slice(found, found + cue.text.length);
          fixes.push(`repère « ${cue.text} » lu « ${exact} »`);
          cue.text = exact;
        }
      }
    }
    for (const action of objects(beat.do)) {
      // null stands for « absent » in what models write; the contract only knows absent fields.
      for (const [key, value] of Object.entries(action)) if (value === null) delete action[key];
      if (action.target === undefined && typeof action.target_id === "string") {
        action.target = action.target_id;
        delete action.target_id;
        fixes.push(`${String(action.id)} : target_id lu comme target`);
      }
      // `"after": "w1"`: the waiting written as its own key; the contract only knows `"at": "after:w1"`.
      if (typeof action.after === "string" && action.at === undefined && action.start === undefined && action.end === undefined) {
        action.at = action.after.startsWith("after:") ? action.after : `after:${action.after}`;
        delete action.after;
        fixes.push(`${String(action.id)} : clé after écrite at « ${String(action.at)} »`);
      }
      for (const field of ["at", "start", "end"] as const) {
        const time = timeString(action[field]);
        if (time !== action[field]) {
          action[field] = time;
          fixes.push(`${String(action.id)} : heure ${field} écrite en objet`);
        }
      }
      // An interval bound waiting for an action: only at can wait; the gesture starts when that action ends.
      const waits = (time: unknown) => typeof time === "string" && time.startsWith("after:");
      if (action.at === undefined && (waits(action.start) || (action.start === undefined && waits(action.end)))) {
        action.at = waits(action.start) ? action.start : action.end;
        delete action.start;
        delete action.end;
        fixes.push(`${String(action.id)} : intervalle en after: écrit at « ${String(action.at)} »`);
      }
      if (action.verb === "write" && action.part !== undefined && tables.has(action.target)) {
        delete action.part;
        fixes.push(`${String(action.id)} : tableau écrit en entier, part retiré`);
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
        const waited = typeof time === "string" ? /^after:(.+)$/.exec(time)?.[1] : undefined;
        if (waited !== undefined && !own.has(waited) && earlier.has(waited)) {
          // Waiting for an action of an earlier passage: it is done, the gesture starts with its own passage.
          action[field] = "beat:start";
          fixes.push(`${String(action.id)} : attendait « ${waited} » d'un passage précédent, part au début du sien`);
          continue;
        }
        const match = typeof time === "string" ? /^(cue|cue_end):(.+)$/.exec(time) : null;
        if (!match || cueIds.has(match[2])) continue;
        const resolved = resolveCue(match[2]!, cues);
        if (resolved) {
          action[field] = `${match[1]}:${resolved}`;
          fixes.push(`${String(action.id)} : repère « ${match[2]} » lu comme « ${resolved} »`);
        }
      }
      if (typeof beat.say === "string") orderInterval(action, beat.say, cues, fixes);
    }
    for (const id of own) earlier.add(id);
  }

  // A return to a frame saved nowhere, neither before nor in this tranche: the camera simply goes on following.
  const saved = new Set<unknown>(before?.cameraFrames ?? []);
  const awaited = new Set<string>();
  for (const action of beats.flatMap((beat) => objects(beat.do))) {
    if (action.verb === "camera.focus") saved.add(action.save_as);
    for (const field of ["at", "start", "end"]) {
      const time = action[field];
      if (typeof time === "string" && time.startsWith("after:")) awaited.add(time.slice(6));
    }
  }
  for (const beat of beats) {
    if (!Array.isArray(beat.do)) continue;
    beat.do = beat.do.filter((action) => {
      if (!isObject(action) || action.verb !== "camera.restore" || typeof action.frame !== "string"
        || saved.has(action.frame) || awaited.has(action.id as string)) return true;
      fixes.push(`${String(action.id)} : retour au cadrage « ${action.frame} », jamais sauvegardé, retiré`);
      return false;
    });
  }
  revealTargeted(slice, beats, fixes);
  highlightResultOnly(slice, beats, fixes);
  return fixes.length ? { slice, fixes } : { slice: raw, fixes };
}

/** The last relation at the top level of a formula (outside braces): `=`, `≈` or `\approx`. */
function lastRelation(content: string): number {
  let depth = 0;
  let last = -1;
  for (let i = 0; i < content.length; i++) {
    const char = content[i]!;
    if (char === "{") depth++;
    else if (char === "}") depth--;
    else if (depth === 0 && (char === "=" || char === "≈" || content.startsWith("\\approx", i))) {
      // `\leq`, `\geq`, `\neq` contain no `=`; `==` does not occur in school formulas.
      last = i;
    }
  }
  return last;
}

/**
 * A result highlighted on a formula without parts coloured the whole calculation (« p = (0,204 × 8,314 × 298,15)/5,0
 * ≈ 101 kPa » all in green): seen by the user, 2026-11-09 ; 519 of the bench's highlights were on a long formula with
 * « = ». A formula of this tranche highlighted with the role result is split at its last relation into two parts,
 * and the highlight goes to the last one (« ≈ 101 kPa »). Parts the model wrote but that did not give back the
 * formula were removed earlier (the formula is written whole): the result keeps its own colour this way too.
 */
function highlightResultOnly(slice: Json, beats: Json[], fixes: string[]): void {
  const formulas = new Map(objects(slice.introduces).filter((item) => item.type === "math" && typeof item.content === "string" && item.parts === undefined)
    .map((item) => [item.id, item]));
  for (const action of beats.flatMap((beat) => objects(beat.do))) {
    if (action.verb !== "highlight" || action.role !== "result" || action.part !== undefined) continue;
    const formula = formulas.get(action.target);
    if (!formula) continue;
    const content = formula.content as string;
    const at = lastRelation(content);
    const left = content.slice(0, at).trim(), right = content.slice(at).trim();
    if (at <= 0 || !left || right.length < 2 || normalFormula(left + right) !== normalFormula(content)) continue;
    if (formula.parts === undefined) {
      formula.parts = [{ id: "membre_calcul", text: left }, { id: "membre_resultat", text: right }];
      fixes.push(`${String(formula.id)} : découpée au dernier « = » pour surligner le résultat seul`);
    }
    action.part = "membre_resultat";
  }
}

/** Verbs that make an object appear on the board. */
const REVEALING = new Set(["show", "write", "draw"]);

/**
 * An object this tranche introduces, then highlights or frames, but never shows: shown when it is
 * first aimed at. Seen in a real lesson (2026-11-09, « zéros de f(x) = −(x − 2)² + 3 »): the final
 * summary introduced its sentence and formula, highlighted them and turned the camera to them
 * without a show; the student saw an empty board for the whole summary. An object introduced and
 * aimed at nowhere is left alone (it may be shown in a later tranche).
 */
function revealTargeted(slice: Json, beats: Json[], fixes: string[]): void {
  const introduced = new Map(objects(slice.introduces).filter(({ id }) => typeof id === "string").map((item) => [item.id as string, item]));
  const members = new Map(objects(slice.groups).map(({ id, items }) => [id, Array.isArray(items) ? items : []]));
  const revealed = new Set<unknown>();
  const reveal = (id: unknown) => {
    if (revealed.has(id)) return;
    revealed.add(id);
    for (const member of members.get(id) ?? []) reveal(member);
  };
  for (const action of beats.flatMap((beat) => objects(beat.do))) {
    if (REVEALING.has(String(action.verb))) reveal(action.target);
    // A transform makes its target appear in place of its source.
    if (action.verb === "transform") reveal(action.target);
  }
  const taken = new Set(beats.flatMap((beat) => objects(beat.do).map(({ id }) => id)));
  for (const [id, item] of introduced) {
    // An attached label comes with its own reveal; an unrevealed one stays the model's choice.
    if (revealed.has(id) || item.attachment !== undefined) continue;
    for (const beat of beats) {
      const list = Array.isArray(beat.do) ? beat.do : [];
      const index = list.findIndex((action) => isObject(action) && (action.target === id || (Array.isArray(action.targets) && action.targets.includes(id))));
      if (index < 0) continue;
      const first = list[index] as Json;
      let actionId = `auto_show_${id}`;
      for (let n = 2; taken.has(actionId); n++) actionId = `auto_show_${id}_${n}`;
      taken.add(actionId);
      const at = typeof first.at === "string" ? first.at : typeof first.start === "string" ? first.start : "beat:start";
      list.splice(index, 0, { id: actionId, verb: item.type === "math" && item.parts === undefined ? "write" : "show", target: id, at });
      reveal(id);
      fixes.push(`${id} : visé par ${String(first.verb)} mais jamais montré, montré à ce moment`);
      break;
    }
  }
}
