/**
 * Générateur Nesalio : une question → des tranches au format Nesalio, validées
 * une à une dès qu'elles arrivent. Les fautes de forme sûres sont réparées sans
 * appel (`normalizeSlice`) ; une tranche refusée est renvoyée une fois au modèle
 * avec les erreurs exactes, dans la limite de MAX_REPAIRS corrections par leçon ;
 * une tranche invalide n'est jamais transmise au lecteur.
 */
import { LessonMetadata, MathContext, type Slice } from "@/domain/nesalio/contract";
import { negotiateCapabilities } from "@/domain/nesalio/capabilities";
import { normalizeMathContext, normalizeSlice } from "@/domain/nesalio/normalize";
import { validateMathContext, validateModelOutput, type ContractIssue, type ValidationState } from "@/domain/nesalio/validate";
import { LineSplitter } from "@/domain/tutor/ndjson";
import { PLAYABLE } from "@/engine/nesalioPlayback";
import type { ChatProvider } from "@/server/config";
import type { CompletionStream } from "@/server/tutor/chatCompletions";
import type { ChatMessage } from "@/server/tutor/prompt";
import { buildNesalioMessages, continueMessage, repairHeaderMessage, repairMessage } from "./prompt";

export type NesalioEvent =
  | { kind: "lesson"; lesson: Lesson; math_context?: MathSpec }
  | { kind: "slice"; slice: Slice }
  | { kind: "error"; code: "upstream" | "empty" | "invalid"; message: string }
  | { kind: "end" };

export interface GeneratorConfig {
  provider: ChatProvider;
  completion: CompletionStream;
  signal?: AbortSignal;
  log?(message: string, detail?: unknown): void;
}

/** Above this, a lesson exceeds the 1 to 2 minute target by far: the rest is dropped. */
export const MAX_SLICES = 6;
/**
 * Corrections asked of the model in one lesson, each tranche being sent back
 * at most once. Measured on real generations: refusals hit different tranches
 * of the same lesson, and one repair per lesson stopped a third of them early.
 */
export const MAX_REPAIRS = 3;
/**
 * Fewest tranches of a lesson (the prompt asks for 3 to 5). Measured on real
 * generations: after correcting an early tranche, the model often rewrote it
 * alone and stopped, leaving a one-tranche lesson; after a correction it is asked once to go on.
 */
export const MIN_SLICES = 3;
const HEADER = "en-tête";
const MAX_TOKENS = 16_000;

type Lesson = ReturnType<typeof LessonMetadata.parse>;
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

function parseLine(line: string): { value: Record<string, unknown> } | { error: unknown } {
  try { return { value: JSON.parse(line) as Record<string, unknown> }; }
  catch (error) {
    const closed = closeJsonLine(line);
    if (closed !== undefined) {
      try { return { value: JSON.parse(closed) as Record<string, unknown> }; } catch { /* reported below */ }
    }
    return { error };
  }
}

function sliceId(value: unknown): string {
  const id = (value as { slice_id?: unknown } | null)?.slice_id;
  return typeof id === "string" ? id : "sans identifiant";
}

export async function* generateNesalio(question: string, config: GeneratorConfig): AsyncGenerator<NesalioEvent> {
  const { provider, completion, signal, log } = config;
  const messages: ChatMessage[] = buildNesalioMessages(question);
  /** Lines the engine accepted, replayed to the model when it has to repair a tranche. */
  const accepted: string[] = [];
  const acceptedIds = new Set<string>();
  let header: { lesson: Lesson; math_context?: MathSpec } | undefined;
  let state: ValidationState | undefined;
  let slices = 0;
  let repairs = 0;
  /** Tranches (and the header) already sent back once: a second refusal stops the lesson. */
  const repaired = new Set<string>();
  let continued = false;

  for (;;) {
    const call = new AbortController();
    const callSignal = signal ? AbortSignal.any([signal, call.signal]) : call.signal;
    const splitter = new LineSplitter();
    let refused: { id: string; issues: ContractIssue[]; header?: "invalid" | "missing" } | undefined;
    let finished = false;

    const handle = function* (line: string): Generator<NesalioEvent> {
      // Models sometimes add fences or a sentence: only JSON objects count.
      if (!line.startsWith("{")) return;
      const parsed = parseLine(line);
      if ("error" in parsed) {
        const { error } = parsed;
        // The parser's message gives the position; the start and end of the line usually show the cause.
        log?.("nesalio: ligne JSON illisible", `${error instanceof Error ? error.message : String(error)} — début : ${line.slice(0, 160)} — fin : ${line.slice(-240)}`);
        return;
      }
      const { value } = parsed;
      if (!header && value.lesson !== undefined) {
        const lesson = LessonMetadata.safeParse(value.lesson);
        const tidied = normalizeMathContext(value.math_context);
        if (tidied.fixes.length) log?.("nesalio: en-tête réparé sans appel", tidied.fixes.join(" | "));
        const math = tidied.math === undefined ? undefined : MathContext.safeParse(tidied.math);
        const issues = [...(lesson.error?.issues ?? []), ...(math?.error?.issues ?? []),
          ...(math?.success ? validateMathContext(math.data) : [])];
        if (!lesson.success || (math && !math.success) || issues.length) {
          refused = { id: HEADER, issues, header: "invalid" };
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
      const { slice: normalized, fixes } = normalizeSlice(value.slice, state);
      const result = check(normalized, header.math_context, state);
      if (!result.ok) {
        refused = { id: sliceId(value.slice), issues: result.issues };
        return;
      }
      if (fixes.length) log?.("nesalio: tranche réparée sans appel", `${sliceId(value.slice)} — ${fixes.join(" | ")}`);
      state = result.state;
      // The repaired form is what the model sees again if a later tranche has to be corrected.
      accepted.push(fixes.length ? JSON.stringify({ slice: normalized }) : line);
      acceptedIds.add(sliceId(value.slice));
      slices++;
      yield { kind: "slice", slice: result.value.slices[0]! };
      if (slices >= MAX_SLICES) finished = true;
    };

    try {
      const stream = completion({
        protocol: provider.protocol, endpoint: provider.endpoint, apiKey: provider.apiKey, model: provider.model,
        extraHeaders: provider.extraHeaders, messages: [...messages], signal: callSignal, maxTokens: MAX_TOKENS,
        // The student is waiting for the first sentence: no hidden reasoning before it, as for the tutor's first turn.
        reasoningEffort: provider.firstTurnEffort ?? provider.reasoningEffort,
      });
      outer: for await (const chunk of stream) {
        for (const line of splitter.push(chunk)) {
          yield* handle(line);
          if (refused || finished) break outer;
        }
      }
      if (!refused && !finished) for (const line of splitter.flush()) yield* handle(line);
    } catch (error) {
      if (signal?.aborted) return;
      log?.("nesalio: échec de l'appel au modèle", error);
      yield slices
        ? { kind: "error", code: "upstream", message: "L’explication a été interrompue. Tu peux réessayer." }
        : { kind: "error", code: "upstream", message: "Nesa n'arrive pas à répondre pour le moment. Réessaie dans un instant." };
      return;
    } finally {
      call.abort();
    }

    if (refused) {
      // As text: the server log drops object contents, and the reasons are what a refusal is diagnosed from.
      log?.("nesalio: tranche refusée", `${refused.id} — ${refused.issues.slice(0, 8)
        .map(({ path, message }) => `${path.map(String).join(".")} : ${message}`).join(" | ")}`);
      if (repaired.has(refused.id) || repairs >= MAX_REPAIRS) {
        // A refused tranche is never played; what was already valid stays playable.
        log?.("nesalio: leçon arrêtée sur un refus", `${refused.id} — ${slices} tranche(s) jouable(s), ${repairs} correction(s) demandée(s)`);
        yield slices
          ? { kind: "end" }
          : { kind: "error", code: "invalid", message: "Nesa n'a pas réussi à construire une explication valide. Reformule ta question ?" };
        return;
      }
      repairs++;
      repaired.add(refused.id);
      messages.push({ role: "assistant", content: accepted.join("\n") || "(rien)" }, {
        role: "user",
        content: refused.header ? repairHeaderMessage(refused.header, refused.issues) : repairMessage(refused.id, refused.issues),
      });
      continue;
    }
    if (repairs && slices && slices < MIN_SLICES && !finished && !continued) {
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
