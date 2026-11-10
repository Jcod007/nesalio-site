/**
 * Générateur Nesalio : une question → des tranches au format Nesalio, validées
 * une à une dès qu'elles arrivent. Les fautes de forme sûres sont réparées sans
 * appel (`normalizeSlice`) ; une tranche refusée est renvoyée une fois au modèle
 * avec les erreurs exactes, dans la limite de MAX_REPAIRS corrections par leçon ;
 * une tranche invalide n'est jamais transmise au lecteur.
 */
import { LessonMetadata, MathContext, type Slice } from "@/domain/nesalio/contract";
import { negotiateCapabilities } from "@/domain/nesalio/capabilities";
import { escapeLatex, normalizeMathContext, normalizeSlice } from "@/domain/nesalio/normalize";
import { validateMathContext, validateModelOutput, type ContractIssue, type ValidationState } from "@/domain/nesalio/validate";
import { LineSplitter } from "@/domain/tutor/ndjson";
import { PLAYABLE } from "@/engine/nesalioPlayback";
import type { ChatProvider } from "@/server/config";
import { UpstreamError, type CompletionStream } from "@/server/tutor/chatCompletions";
import { jsonrepair } from "jsonrepair";
import type { ChatMessage } from "@/server/tutor/prompt";
import { buildNesalioMessages, continueMessage, repairHeaderMessage, repairMessage, reviewFixMessage, simplifyMessage } from "./prompt";
import type { ReviewAlert, SliceReviewer } from "./review";
import { buildTeacherMessages, layoutRequest } from "./script";

export type NesalioEvent =
  | { kind: "lesson"; lesson: Lesson; math_context?: MathSpec }
  | { kind: "slice"; slice: Slice }
  | { kind: "error"; code: "upstream" | "empty" | "invalid" | "incomplete"; message: string }
  | { kind: "end" };

export interface GeneratorConfig {
  provider: ChatProvider;
  completion: CompletionStream;
  signal?: AbortSignal;
  log?(message: string, detail?: unknown): void;
  /** Two calls: the teacher writes the lesson as plain text, the layout writer puts it in the Nesalio format (script.ts). */
  twoStage?: boolean;
  /** Silence after which a call is stopped (IDLE_TIMEOUT_MS); shorter in tests. */
  idleTimeoutMs?: number;
  /** Wait for a call's first byte (FIRST_BYTE_TIMEOUT_MS); defaults to idleTimeoutMs when only that one is given (tests). */
  firstByteTimeoutMs?: number;
  /**
   * Reviewer of substance (review.ts): each tranche but the first is read before it is
   * shown, while the previous one plays; an error it is sure of sends the tranche back to
   * the model once. Off when absent (route: on unless NESALIO_RELECTEUR=0).
   */
  review?: SliceReviewer;
  /** Longest wait for one review (REVIEW_TIMEOUT_MS); past it the tranche is shown unreviewed. */
  reviewTimeoutMs?: number;
}

/** Above this, a lesson exceeds the 1 to 2 minute target by far: the rest is dropped. */
export const MAX_SLICES = 6;
/**
 * Corrections asked of the model in one lesson. Measured on real generations:
 * refusals hit different tranches of the same lesson, and one repair per
 * lesson stopped a third of them early.
 */
export const MAX_REPAIRS = 3;
/**
 * Corrections asked for the same tranche. Seen in real generations: a
 * correction fixing one error and bringing in another, the lesson then stopping.
 */
export const MAX_ATTEMPTS = 2;
/**
 * Fewest tranches of a lesson (the prompt asks for 3 to 5). Measured on real
 * generations: after correcting an early tranche, the model often rewrote it
 * alone and stopped, leaving a one-tranche lesson; after a correction it is asked once to go on.
 */
export const MIN_SLICES = 3;
/** The lesson written for a question outside what Nesa explains: one tranche by design (pedagogy.ts, REFUSAL_EXAMPLE). */
export const OUT_OF_SCOPE_LESSON = "hors_perimetre";
/**
 * A call that sends nothing for this long is stopped and the lesson resumed as for
 * a missing tranche, within the same correction budget. Seen on the DeepSeek bench:
 * first tranches after 42 s, calls failing with no byte.
 */
export const IDLE_TIMEOUT_MS = 20_000;
/**
 * Wait for the first byte of a call, longer than IDLE_TIMEOUT_MS: before it, the
 * gateway queues the call and the model reads a 37 000-character prompt. Measured
 * on the DeepSeek bench (64 lessons, healthy calls): header line complete after up
 * to 24.9 s, 4 lessons above 20 s; at 20 s they would have been cut and restarted.
 */
export const FIRST_BYTE_TIMEOUT_MS = 45_000;
/**
 * Longest wait for the reviewer on one tranche. Measured offline: 2.5 s median, 7.7 s at
 * most for a whole lesson; the previous tranche plays 20 s or more meanwhile.
 */
export const REVIEW_TIMEOUT_MS = 12_000;
/**
 * Tranches of one lesson sent back after a review. Each correction is a new call (the
 * 37 000-character prompt read again): two keeps the student's wait bounded.
 */
export const MAX_REVIEW_FIXES = 2;
/** Longest refused line written in the server log. */
const MAX_LOGGED_LINE = 4_000;
/** Longest received value quoted back in a refusal. */
const RECEIVED_LENGTH = 80;
const HEADER = "en-tête";
/** Id under which a silent call is counted in the correction budget. */
const STALLED = "flux interrompu";
const MAX_TOKENS = 16_000;

type Lesson = ReturnType<typeof LessonMetadata.parse>;
/** A tranche the contract accepted, before it is shown (held while the reviewer reads it). */
interface Candidate {
  id: string;
  line: string;
  lenient: boolean;
  normalized: unknown;
  fixes: readonly string[];
  result: Extract<ReturnType<typeof check>, { ok: true }>;
}
type MathSpec = ReturnType<typeof MathContext.parse>;

/** Slices also have to be playable by this player, not only valid for the contract. */
function check(slice: unknown, mathContext: MathSpec | undefined, state: ValidationState | undefined) {
  const result = validateModelOutput({ ...(state ? {} : { math_context: mathContext }), slices: [slice] }, state);
  if (!result.ok) return result;
  const unplayable: ContractIssue[] = negotiateCapabilities(slice, PLAYABLE)
    .map(({ path, name }) => ({ path: ["slices", 0, ...path], message: `Capacité non exécutable « ${name} » : utilise seulement le langage décrit.` }));
  return unplayable.length ? { ok: false as const, issues: unplayable } : result;
}

/**
 * The line completed with the closing braces and brackets it lacks, when that is
 * its only defect: it ends on a closed value (`}` or `]`), outside any string,
 * and every closer it has matches. Seen in real generations: the header line
 * ends with `"expressions": {}}`, one `}` short. Anything else stays unreadable,
 * and the completed line is still fully validated by the contract.
 */
export function closeJsonLine(line: string): string | undefined {
  if (!/[}\]]$/.test(line)) return;
  const open: string[] = [];
  let inString = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (inString) {
      if (char === "\\") index++;
      else if (char === "\"") inString = false;
    } else if (char === "\"") inString = true;
    else if (char === "{") open.push("}");
    else if (char === "[") open.push("]");
    else if ((char === "}" || char === "]") && open.pop() !== char) return;
  }
  if (inString || !open.length) return;
  return line + open.reverse().join("");
}

/** The complete top-level JSON objects a line holds, in order; the rest (an unfinished object) stays with the last one. */
export function topLevelObjects(line: string): string[] {
  const objects: string[] = [];
  let depth = 0;
  let inString = false;
  let start = 0;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (inString) {
      if (char === "\\") index++;
      else if (char === "\"") inString = false;
    } else if (char === "\"") inString = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) {
      objects.push(line.slice(start, index + 1).trim());
      start = index + 1;
    }
  }
  const rest = line.slice(start).trim();
  if (rest) {
    if (objects.length) objects[objects.length - 1] += rest;
    else objects.push(rest);
  }
  return objects;
}

/**
 * The line with the straight quotes that cannot end their string escaped: a
 * sentence quoting a word (« en mode "radians" : elle… », seen on the DeepSeek
 * bench). `jsonrepair` handles a quote followed by a letter, not one followed by
 * `:` or `,`, which it reads as a key or a next element. Here a quote ends a
 * string only when what follows fits: `}` or `]`; `:` after a key; a comma
 * followed by a JSON value or a closer. Used only on a line that does not parse,
 * and the result is still fully validated by the contract.
 */
function escapeInnerQuotes(line: string): string {
  let out = "";
  let inString = false;
  let key = false;
  /** Last character outside strings, spaces aside: `{` or `,` before a string makes it a key. */
  let last = "";
  for (let index = 0; index < line.length; index++) {
    const char = line[index]!;
    if (!inString) {
      if (char === "\"") {
        inString = true;
        key = last === "{" || last === ",";
      }
      if (!/\s/.test(char)) last = char;
      out += char;
    } else if (char === "\\") {
      out += char + (line[index + 1] ?? "");
      index++;
    } else if (char !== "\"") out += char;
    else {
      const rest = line.slice(index + 1).trimStart();
      const next = rest[0];
      const closes = next === undefined || next === "}" || next === "]" || (next === ":" && key)
        || (next === "," && /^,\s*(?:["{[\]}\d-]|true|false|null)/.test(rest));
      if (closes) {
        inString = false;
        last = char;
        out += char;
      } else out += "\\\"";
    }
  }
  return out;
}

/**
 * Last resort for an unreadable line: the `jsonrepair` library (trailing commas,
 * closers in excess, unescaped quotes in a sentence, a missing colon or comma; all
 * seen on the DeepSeek bench). Only on a line that ends on a closed value: a line
 * cut in the middle of a sentence would be completed with half its text.
 */
function leniently(line: string): string | undefined {
  if (!/[}\]][\s,]*$/.test(line)) return;
  try { return jsonrepair(line); } catch { return; }
}

/**
 * `lenient` (the parser's first error) marks a value read by `jsonrepair` only: if
 * the contract refuses it, the line is sent back as unreadable, as the model wrote
 * it, not as the library's guess.
 */
type Parsed = { value: Record<string, unknown>; lenient?: unknown } | { error: unknown };

function parseLine(line: string): Parsed {
  try { return { value: JSON.parse(line) as Record<string, unknown> }; }
  catch (error) {
    // Safe repairs only, each still fully validated: closing braces, a comma or bracket left after the object
    // (tranches written as a JSON array), then lone LaTeX backslashes.
    const escaped = escapeLatex(line);
    for (const candidate of [closeJsonLine(line), line.replace(/\}[\s,\]]+$/, "}"), escaped, closeJsonLine(escaped)]) {
      if (candidate === undefined || candidate === line) continue;
      try { return { value: JSON.parse(candidate) as Record<string, unknown> }; } catch { /* reported below */ }
    }
    // Straight quotes in a sentence escaped first, then the LaTeX-escaped line: `\frac` would otherwise stay a form feed.
    const quoted = escapeLatex(escapeInnerQuotes(line));
    for (const candidate of new Set([quoted === escaped ? undefined : quoted, leniently(quoted), leniently(escaped), leniently(line)])) {
      if (candidate === undefined) continue;
      try {
        const value = JSON.parse(candidate) as unknown;
        if (value && typeof value === "object" && !Array.isArray(value)) return { value: value as Record<string, unknown>, lenient: error };
      } catch { /* reported below */ }
    }
    return { error };
  }
}

/** A value of the tranche, quoted back in a refusal (truncated). */
function received(value: unknown): string | undefined {
  if (value === undefined) return;
  const text = JSON.stringify(value) ?? String(value);
  return text.length > RECEIVED_LENGTH ? `${text.slice(0, RECEIVED_LENGTH)}…` : text;
}

/**
 * Each issue with the value found at its path in the tranche, when it can be read:
 * the bare Zod messages (« Invalid input ») did not say what was wrong, and the
 * model repeated the same fault.
 */
function withReceived(issues: readonly ContractIssue[], slice: unknown): ContractIssue[] {
  return issues.map((issue) => {
    if (issue.path[0] !== "slices" || issue.path[1] !== 0) return issue;
    let value: unknown = slice;
    for (const key of issue.path.slice(2)) value = value !== null && typeof value === "object" ? (value as Record<PropertyKey, unknown>)[key] : undefined;
    const text = received(value);
    return text === undefined ? issue : { ...issue, message: `${issue.message} (valeur reçue : ${text})` };
  });
}

/** Depth of open braces and brackets at the end of a text, outside strings. */
function jsonDepth(text: string): number {
  let depth = 0;
  let inString = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (char === "\\") index++;
      else if (char === "\"") inString = false;
    } else if (char === "\"") inString = true;
    else if (char === "{" || char === "[") depth++;
    else if (char === "}" || char === "]") depth--;
  }
  return depth;
}

/** Most lines one object spread out is waited for: a pretty-printed tranche stays well under. */
const MAX_SPREAD_LINES = 400;

/**
 * An object written over several lines, as pretty-printed JSON (« { » alone, then `"lesson": {`
 * on the next line; seen on the Alloprof bench: header lost, then a tranche). The lines from a
 * lone « { » are gathered until the braces close, then go on as one line, read with the usual
 * repairs. If they never close (a new object starts, too long, end of the stream), they go on
 * one by one, as before, and are refused with the « one line » advice.
 */
class SpreadObject {
  private lines: string[] | undefined;
  constructor(private readonly log?: GeneratorConfig["log"]) {}

  push(line: string): string[] {
    if (!this.lines) {
      if (line !== "{") return [line];
      this.lines = [line];
      return [];
    }
    // A whole object on one line: the spread one was abandoned.
    if (/^\{\s*"/.test(line) && jsonDepth(line) === 0) return [...this.flush(), line];
    this.lines.push(line);
    const text = this.lines.join(" ");
    if (jsonDepth(text) > 0) return this.lines.length < MAX_SPREAD_LINES ? [] : this.flush();
    // Closed: one line, read like any other (LaTeX escapes, jsonrepair) and refused as one if still unreadable.
    this.log?.("nesalio: objet JSON sur plusieurs lignes recollé", `${this.lines.length} lignes`);
    this.lines = undefined;
    return [text];
  }

  /** The lines gathered so far, as they came. */
  flush(): string[] {
    const lines = this.lines ?? [];
    this.lines = undefined;
    return lines;
  }
}

/** The call sent nothing for `idleTimeoutMs`. */
class StreamIdle extends Error {}

/** The chunks of a stream, stopped by `StreamIdle` when none comes for `ms` (`firstMs` before the first text). */
async function* untilIdle(stream: AsyncIterable<string>, ms: number, firstMs = ms): AsyncGenerator<string> {
  const iterator = stream[Symbol.asyncIterator]();
  let idle = false;
  let first = true;
  try {
    for (;;) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const next = iterator.next();
      const wait = first ? firstMs : ms;
      const silence = new Promise<"idle">((resolve) => { timer = setTimeout(() => resolve("idle"), wait); });
      const result = await Promise.race([next, silence]).finally(() => clearTimeout(timer));
      if (result === "idle") {
        idle = true;
        // The caller aborts the call; the pending read may still reject.
        next.catch(() => undefined);
        throw new StreamIdle(`aucun octet reçu pendant ${Math.round(wait / 1000)} s`);
      }
      if (result.done) return;
      if (result.value) first = false;
      yield result.value;
    }
  } finally {
    // A silent source is not awaited: its `return` would wait for the read that hangs.
    if (!idle) await iterator.return?.();
  }
}

/** An error that the same call would only repeat (a refused key, a bad request). */
function permanent(error: unknown): boolean {
  return error instanceof UpstreamError && error.status !== undefined && error.status >= 400 && error.status < 500
    && error.status !== 408 && error.status !== 429;
}

/** Sent when a call went silent in the middle of a lesson: the model goes on after the last accepted tranche. */
function resumeMessage(acceptedIds: readonly string[], seconds: number): string {
  return [
    `Ta réponse s'est arrêtée en route (plus rien reçu pendant ${seconds} s). Tranches déjà acceptées : ${acceptedIds.join(", ") || "aucune"}.`,
    "Continue : écris les tranches suivantes, une par ligne {\"slice\": …}, jusqu'au récapitulatif, sans réécrire celles-ci ;",
    "si la leçon était déjà finie, n'écris rien.",
  ].join("\n");
}

/** Read as the tranche's id in the refusal sent back: « La tranche « identifiant illisible » a été refusée ». */
const UNKNOWN_ID = "identifiant illisible";

function sliceId(value: unknown): string {
  const id = (value as { slice_id?: unknown } | null)?.slice_id;
  return typeof id === "string" ? id : UNKNOWN_ID;
}

/** What an unreadable line was meant to be: a tranche (with its id when it can be read) or the header. */
function unreadableKind(line: string): { slice: string } | "header" | undefined {
  if (/"slice"\s*:/.test(line)) return { slice: /"slice_id"\s*:\s*"([^"\\]+)"/.exec(line)?.[1] ?? UNKNOWN_ID };
  if (/"lesson"\s*:/.test(line)) return "header";
}

/** A line that opens with a tranche's or the header's key: JSON spread over several lines. */
const SPREAD = /^"(?:slice|lesson)"\s*:/;

/** The refusal sent back for an unreadable line: the parser's message gives the position, the start and end of the line usually show the cause. */
function unreadableIssue(line: string, error: unknown): ContractIssue {
  const reason = error instanceof Error ? error.message : String(error);
  const advice = SPREAD.test(line)
    ? "une tranche = un objet JSON complet sur UNE seule ligne, sans retour à la ligne"
    : "vérifie que chaque { a son }, chaque [ son ], et que chaque élément est suivi d'une virgule";
  return { path: ["ligne"], message: `Ligne JSON illisible (${reason}) : ${advice}. Début de la ligne : ${line.slice(0, 160)} … Fin de la ligne : ${line.slice(-240)}` };
}

/** The teacher's script: the whole lesson as plain text, before any syntax. */
async function writeScript(question: string, { provider, completion, signal }: GeneratorConfig): Promise<string> {
  let script = "";
  for await (const chunk of completion({
    protocol: provider.protocol, endpoint: provider.endpoint, apiKey: provider.apiKey, model: provider.model,
    extraHeaders: provider.extraHeaders, messages: buildTeacherMessages(question), signal, maxTokens: MAX_TOKENS,
    reasoningEffort: provider.firstTurnEffort ?? provider.reasoningEffort,
  })) script += chunk;
  return script.trim();
}

export async function* generateNesalio(question: string, config: GeneratorConfig): AsyncGenerator<NesalioEvent> {
  const { provider, completion, signal, log } = config;
  const idleMs = config.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
  const firstByteMs = config.firstByteTimeoutMs ?? config.idleTimeoutMs ?? FIRST_BYTE_TIMEOUT_MS;
  let messages: ChatMessage[] = buildNesalioMessages(question);
  if (config.twoStage) {
    let script: string;
    try { script = await writeScript(question, config); }
    catch (error) {
      if (signal?.aborted) return;
      log?.("nesalio: échec de l'appel à l'enseignant", error);
      script = "";
    }
    if (!script) {
      yield { kind: "error", code: "upstream", message: "Nesa n'arrive pas à répondre pour le moment. Réessaie dans un instant." };
      return;
    }
    log?.("nesalio: script de l'enseignant", script);
    messages = [messages[0]!, { role: "user", content: layoutRequest(question, script) }];
  }
  /** Lines the engine accepted, replayed to the model when it has to repair a tranche. */
  const accepted: string[] = [];
  const acceptedIds = new Set<string>();
  let header: { lesson: Lesson; math_context?: MathSpec } | undefined;
  let state: ValidationState | undefined;
  let slices = 0;
  let repairs = 0;
  /** How many times each tranche (and the header) was sent back: past MAX_ATTEMPTS, a refusal stops the lesson. */
  const repaired = new Map<string, number>();
  /** Tranches refused and not yet accepted: the lesson is never announced as finished while one is missing. */
  const missing = new Set<string>();
  let continued = false;
  /** The one automatic new call, when a call fails before sending anything (« fetch failed »). */
  let retried = false;
  /** Each refused tranche as last refused (repaired form, or the raw line if unreadable): shown back to the model. */
  const refusedLines = new Map<string, string>();
  /** The one simplified rewrite asked when a tranche is refused past its budget. */
  let lastChanceUsed = false;
  /** Tranches already read by the reviewer: a corrected tranche is not read again. */
  const reviewed = new Set<string>();
  let reviewFixes = 0;
  /** Tranches shown, as played: the context the reviewer reads before the new one. */
  const shown: Slice[] = [];
  const reviewTimeoutMs = config.reviewTimeoutMs ?? REVIEW_TIMEOUT_MS;

  /** The reviewer's alerts on a tranche; none when it fails or is too slow (the tranche is then shown unreviewed). */
  const reviewOf = async (candidate: Candidate): Promise<ReviewAlert[]> => {
    const timer = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        timer.abort();
        reject(new Error(`pas de réponse après ${Math.round(reviewTimeoutMs / 1000)} s`));
      }, reviewTimeoutMs);
    });
    try {
      const review = await Promise.race([config.review!({
        question, previous: [...shown], slice: candidate.result.value.slices[0]!, math: header?.math_context,
        signal: signal ? AbortSignal.any([signal, timer.signal]) : timer.signal,
      }), late]);
      for (const { alert, reason } of review.dropped) log?.("nesalio: alerte du relecteur écartée", `${candidate.id} — ${reason} : « ${alert.citation} » → ${alert.correction}`);
      log?.("nesalio: relecture", `${candidate.id} — ${review.alerts.length} alerte(s) gardée(s), ${review.dropped.length} écartée(s), ${review.ms} ms`);
      for (const { citation, correction } of review.alerts) log?.("nesalio: alerte du relecteur", `${candidate.id} — « ${citation} » → ${correction}`);
      return review.alerts;
    } catch (error) {
      if (!signal?.aborted) log?.("nesalio: relecture impossible, tranche montrée sans relecture", `${candidate.id} — ${error instanceof Error ? error.message : String(error)}`);
      return [];
    } finally {
      clearTimeout(timeout);
    }
  };
  /** A lesson stopped with a tranche missing: what was played stays, the student is told the rest is missing. */
  const stopped = (): NesalioEvent => slices
    ? { kind: "error", code: "incomplete", message: "L'explication s'est arrêtée en route : Nesa n'a pas réussi à écrire la suite. Tu peux réessayer ou poser une autre question." }
    : { kind: "error", code: "invalid", message: "Nesa n'a pas réussi à construire une explication valide. Reformule ta question ?" };

  for (;;) {
    const call = new AbortController();
    const callSignal = signal ? AbortSignal.any([signal, call.signal]) : call.signal;
    const splitter = new LineSplitter();
    const spread = new SpreadObject(log);
    let refused: { id: string; issues: ContractIssue[]; header?: "invalid" | "missing"; review?: ReviewAlert[] } | undefined;
    /** A tranche held for the reviewer, and what followed it on the same line. */
    let pending: Candidate | undefined;
    const afterReview: string[] = [];
    let finished = false;
    /** Whether this call sent anything: before that, a failed call is tried once more. */
    let receivedAny = false;

    /**
     * An unreadable line meant as a tranche or as the header is a refusal like any
     * other, sent back to the model within the same limits: dropped, it left a
     * lesson announced as finished without one of its tranches.
     */
    /**
     * A tranche written while a refused one is still missing: played, it would come
     * before the one it follows (the student saw s1 s3 s2). It is refused under the
     * missing tranche's id, so a skipped or renamed correction is asked again within
     * the same limits instead of ending the lesson.
     */
    const waitFor = (id: string): boolean => {
      const waiting = [...missing].find((other) => other !== UNKNOWN_ID && other !== id);
      if (waiting === undefined) return false;
      refused = { id: waiting, issues: [{ path: ["slice_id"], message:
        `Tranche « ${id} » écrite avant la tranche refusée « ${waiting} » : réécris d'abord « ${waiting} » corrigée, avec le même slice_id, puis la suite.` }] };
      return true;
    };

    const refuseUnreadable = (line: string, error: unknown) => {
      const kind = unreadableKind(line);
      log?.("nesalio: ligne JSON illisible", `${error instanceof Error ? error.message : String(error)} — début : ${line.slice(0, 160)} — fin : ${line.slice(-240)}`);
      if (kind === undefined || (kind === "header" && header)) return;
      if (kind === "header" || !header) {
        refused = { id: HEADER, header: "missing", issues: [
          ...(kind === "header" ? [] : [{ path: [], message: `La ligne lesson doit venir avant la première tranche (« ${kind.slice} »).` }]),
          unreadableIssue(line, error)] };
        return;
      }
      // After a repair the model may rewrite tranches already played: skip them, as when they are readable.
      if (acceptedIds.has(kind.slice) || waitFor(kind.slice)) return;
      refused = { id: kind.slice, issues: [unreadableIssue(line, error)] };
      refusedLines.set(kind.slice, line);
      missing.add(kind.slice);
    };

    const handle = function* (line: string): Generator<NesalioEvent> {
      // Models sometimes add fences or a sentence: only JSON objects count, a sentence before a tranche is dropped.
      if (!line.startsWith("{")) {
        const start = line.search(/\{\s*"(?:slice|lesson)"\s*:/);
        if (start > 0) yield* handle(line.slice(start));
        // A tranche spread over several lines is refused; a sentence that merely quotes "slice": is not.
        else if (SPREAD.test(line)) refuseUnreadable(line, new Error("la ligne ne commence pas par {"));
        else if (/"(?:slice|lesson)"\s*:/.test(line)) log?.("nesalio: ligne ignorée", line.slice(0, 160));
        return;
      }
      // Two objects written on one line (seen: a tranche followed by the next): each is read on its own,
      // and none after a refusal (it would be played before the refused one).
      const objects = topLevelObjects(line);
      if (objects.length > 1) {
        for (const [index, object] of objects.entries()) {
          yield* handle(object);
          if (refused || finished) return;
          if (pending) {
            afterReview.push(...objects.slice(index + 1));
            return;
          }
        }
        return;
      }
      const parsed = parseLine(line);
      if ("error" in parsed) {
        refuseUnreadable(line, parsed.error);
        return;
      }
      const { value } = parsed;
      // Read by jsonrepair as neither a tranche nor an awaited header: the line stays unreadable.
      if ("lenient" in parsed && value.slice === undefined && (header || value.lesson === undefined)) {
        refuseUnreadable(line, parsed.lenient);
        return;
      }
      if (!header && value.lesson !== undefined) {
        const lesson = LessonMetadata.safeParse(value.lesson);
        const tidied = normalizeMathContext(value.math_context);
        if (tidied.fixes.length) log?.("nesalio: en-tête réparé sans appel", tidied.fixes.join(" | "));
        const math = tidied.math === undefined ? undefined : MathContext.safeParse(tidied.math);
        const issues = [...(lesson.error?.issues ?? []), ...(math?.error?.issues ?? []),
          ...(math?.success ? validateMathContext(math.data) : [])];
        if (!lesson.success || (math && !math.success) || issues.length) {
          if ("lenient" in parsed) refuseUnreadable(line, parsed.lenient);
          else refused = { id: HEADER, issues, header: "invalid" };
          return;
        }
        header = { lesson: lesson.data, ...(math ? { math_context: math.data } : {}) };
        // Replayed as accepted: braces may have been added, expressions removed.
        accepted.push(JSON.stringify({ ...value, ...(math ? { math_context: math.data } : {}) }));
        yield { kind: "lesson", ...header };
        return;
      }
      if (value.slice === undefined) return;
      // After a repair the model may rewrite tranches already played: skip them, do not refuse them.
      if (acceptedIds.has(sliceId(value.slice))) return;
      if (!header) {
        refused = { id: HEADER, header: "missing", issues: [{ path: [], message: `La ligne lesson doit venir avant la première tranche (« ${sliceId(value.slice)} »).` }] };
        return;
      }
      if (waitFor(sliceId(value.slice))) return;
      const { slice: normalized, fixes } = normalizeSlice(value.slice, state);
      const result = check(normalized, header.math_context, state);
      if (!result.ok) {
        // Read by jsonrepair only: its guess is not what the model wrote, the line is sent back as unreadable.
        if ("lenient" in parsed) {
          refuseUnreadable(line, parsed.lenient);
          return;
        }
        refused = { id: sliceId(value.slice), issues: withReceived(result.issues, normalized) };
        refusedLines.set(refused.id, JSON.stringify({ slice: normalized }));
        missing.add(refused.id);
        return;
      }
      const candidate: Candidate = { id: sliceId(value.slice), line, lenient: "lenient" in parsed, normalized, fixes, result };
      // The first tranche (the hook) is shown at once: the student is waiting for it.
      if (config.review && slices > 0 && !reviewed.has(candidate.id) && reviewFixes < MAX_REVIEW_FIXES
        && header.lesson.id !== OUT_OF_SCOPE_LESSON) {
        pending = candidate;
        return;
      }
      yield* accept(candidate);
    };

    /** Shows a tranche: from here on it is played and replayed to the model as accepted. */
    const accept = function* ({ id, line, lenient, normalized, fixes, result }: Candidate): Generator<NesalioEvent> {
      if (lenient) log?.("nesalio: ligne JSON réparée par jsonrepair", id);
      missing.delete(id);
      // Known limit: an unreadable tranche whose id could not be read; the next accepted tranche is taken as its correction.
      if (missing.delete(UNKNOWN_ID)) log?.("nesalio: tranche illisible sans identifiant tenue pour corrigée", id);
      if (fixes.length) log?.("nesalio: tranche réparée sans appel", `${id} — ${fixes.join(" | ")}`);
      // Correctness checks (validate.ts, coherence.ts): corrections are already in the validated tranche;
      // notes never block, they are kept in the server log.
      const corrected = result.alerts.filter((alert) => alert.outcome === "corrected");
      for (const { outcome, rule, message } of result.alerts) {
        if (outcome === "corrected") log?.("nesalio: tranche corrigée par la justesse", `${id} — ${rule} : ${message}`);
        else if (outcome === "noted") log?.("nesalio: alerte de justesse notée", `${id} — ${rule} : ${message}`);
      }
      state = result.state;
      // The repaired and corrected form, the one played, is what the model sees again if a later tranche has to be corrected.
      accepted.push(corrected.length ? JSON.stringify({ slice: result.value.slices[0] })
        : fixes.length || lenient ? JSON.stringify({ slice: normalized }) : line);
      acceptedIds.add(id);
      slices++;
      shown.push(result.value.slices[0]!);
      yield { kind: "slice", slice: result.value.slices[0]! };
      if (slices >= MAX_SLICES) finished = true;
    };

    /**
     * A line, then the tranche it held if the reviewer has to read it first. The reviewer
     * reads while the previous tranche plays; an alert sends the tranche back to the model
     * (the call is stopped: what it wrote after the tranche followed from the error).
     */
    const processLine = async function* (line: string): AsyncGenerator<NesalioEvent> {
      // The student left during a review: nothing more is read or shown.
      if (signal?.aborted) return;
      yield* handle(line);
      const candidate = pending as Candidate | undefined;
      if (!candidate) return;
      pending = undefined;
      const rest = afterReview.splice(0);
      reviewed.add(candidate.id);
      const alerts = await reviewOf(candidate);
      if (signal?.aborted) return;
      if (alerts.length) {
        reviewFixes++;
        refused = { id: candidate.id, review: alerts, issues: alerts.map(({ citation, correction, type }) =>
          ({ path: ["relecteur", type || "fond"], message: `« ${citation} » → ${correction}` })) };
        refusedLines.set(candidate.id, JSON.stringify({ slice: candidate.result.value.slices[0] }));
        missing.add(candidate.id);
        return;
      }
      yield* accept(candidate);
      for (const object of rest) {
        if (refused || finished) return;
        yield* processLine(object);
      }
    };

    try {
      const stream = completion({
        protocol: provider.protocol, endpoint: provider.endpoint, apiKey: provider.apiKey, model: provider.model,
        extraHeaders: provider.extraHeaders, messages: [...messages], signal: callSignal, maxTokens: MAX_TOKENS,
        // The student is waiting for the first sentence: no hidden reasoning before it, as for the tutor's first turn.
        reasoningEffort: provider.firstTurnEffort ?? provider.reasoningEffort,
      });
      outer: for await (const chunk of untilIdle(stream, idleMs, firstByteMs)) {
        if (chunk) receivedAny = true;
        for (const line of splitter.push(chunk)) {
          for (const whole of spread.push(line)) {
            yield* processLine(whole);
            if (refused || finished) break outer;
          }
        }
      }
      if (!refused && !finished) for (const whole of [...splitter.flush().flatMap((line) => spread.push(line)), ...spread.flush()]) {
        yield* processLine(whole);
        if (refused || finished) break;
      }
    } catch (error) {
      if (signal?.aborted) return;
      log?.("nesalio: échec de l'appel au modèle", error);
      // Nothing came from this call, the student saw nothing of it: the same call is tried once more
      // (seen on the bench: « TypeError: fetch failed » after 10 s, a whole lesson lost).
      if (!receivedAny && !retried && !permanent(error)) {
        retried = true;
        log?.("nesalio: nouvelle tentative après un appel sans réponse");
        continue;
      }
      if (!(error instanceof StreamIdle)) {
        yield slices
          ? { kind: "error", code: "upstream", message: "L’explication a été interrompue. Tu peux réessayer." }
          : { kind: "error", code: "upstream", message: "Nesa n'arrive pas à répondre pour le moment. Réessaie dans un instant." };
        return;
      }
      // A silent call is resumed as a missing tranche, within the same correction budget.
      const stall: ContractIssue = { path: [], message: `Ta réponse s'est arrêtée en route (${error.message}).` };
      const waiting = [...missing][0];
      refused = !header ? { id: HEADER, header: "missing", issues: [stall] }
        : waiting !== undefined ? { id: waiting, issues: [stall] }
        : { id: STALLED, issues: [stall] };
    } finally {
      call.abort();
    }

    if (refused) {
      // As text: the server log drops object contents, and the reasons are what a refusal is diagnosed from.
      log?.("nesalio: tranche refusée", `${refused.id} — ${refused.issues.slice(0, 8)
        .map(({ path, message }) => `${path.map(String).join(".")} : ${message}`).join(" | ")}`);
      // The refused tranche itself, as sent back: the reasons alone did not show why a refusal came back (diagnosis
      // of the lessons stopped on the Alloprof bench).
      const shownLine = refused.header ? undefined : refusedLines.get(refused.id);
      if (shownLine) log?.("nesalio: ligne refusée", `${refused.id} — ${shownLine.length > MAX_LOGGED_LINE ? `${shownLine.slice(0, MAX_LOGGED_LINE)}…` : shownLine}`);
      // A review correction has its own budget (MAX_REVIEW_FIXES): it never stops the lesson.
      let simplify = false;
      if (!refused.review && ((repaired.get(refused.id) ?? 0) >= MAX_ATTEMPTS || repairs >= MAX_REPAIRS)) {
        // Once per lesson, a tranche refused past its budget is asked simpler (without the faulty object or gesture)
        // instead of stopping the lesson: seen on the bench, the same fault repeated three times in a row.
        if (!lastChanceUsed && !refused.header && refused.id !== STALLED && refused.id !== UNKNOWN_ID) {
          lastChanceUsed = true;
          simplify = true;
          log?.("nesalio: dernière chance, tranche demandée simplifiée", refused.id);
        } else {
          // A refused tranche is never played; what was already valid stays playable.
          log?.("nesalio: leçon arrêtée sur un refus", `${refused.id} — ${slices} tranche(s) jouable(s), ${repairs} correction(s) demandée(s)`);
          yield stopped();
          return;
        }
      }
      if (!refused.review) {
        repairs++;
        repaired.set(refused.id, (repaired.get(refused.id) ?? 0) + 1);
      }
      // The refused line goes after the accepted ones, in its repaired form: the model edits that line instead of
      // rewriting the tranche from memory, which brought a new fault 11 times out of 15 on the bench.
      const refusedLine = refused.header ? undefined : refusedLines.get(refused.id);
      messages.push({ role: "assistant", content: [...accepted, ...(refusedLine ? [refusedLine] : [])].join("\n") || "(rien)" }, {
        role: "user",
        content: simplify ? simplifyMessage(refused.id, refused.issues)
          : refused.review ? reviewFixMessage(refused.id, refused.review)
          : refused.header ? repairHeaderMessage(refused.header, refused.issues)
          : refused.id === STALLED ? resumeMessage([...acceptedIds], Math.round(idleMs / 1000))
          : repairMessage(refused.id, refused.issues, refusedLine !== undefined),
      });
      continue;
    }
    if (missing.size) {
      // The correction skipped a refused tranche: the lesson has a hole, never announced as finished.
      log?.("nesalio: leçon arrêtée sur une tranche manquante", `${[...missing].join(", ")} — ${slices} tranche(s) jouable(s)`);
      yield stopped();
      return;
    }
    if ((repairs || reviewFixes) && slices && slices < MIN_SLICES && !finished && !continued && header?.lesson.id !== OUT_OF_SCOPE_LESSON) {
      continued = true;
      messages.push({ role: "assistant", content: accepted.join("\n") }, { role: "user", content: continueMessage([...acceptedIds]) });
      continue;
    }
    if (!slices) {
      yield { kind: "error", code: "empty", message: "Nesa n'a pas réussi à construire une explication. Reformule ta question ?" };
      return;
    }
    yield { kind: "end" };
    return;
  }
}
