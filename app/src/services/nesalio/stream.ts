/**
 * Lit le flux de /api/nesalio : l'en-tête de la leçon d'abord, puis les tranches
 * au fur et à mesure, pour que la lecture commence avant la fin de la génération.
 */
import { z } from "zod";
import { LessonMetadata, MathContext, Slice } from "@/domain/nesalio/contract";
import { lessonHeader, type LessonHeader } from "@/domain/nesalio/lesson";
import { LessonQuestion } from "@/domain/nesalio/question";
import { NesalioServerError } from "@/domain/nesalio/serverError";
import { readLines } from "@/domain/tutor/ndjson";
import { sessionHeaders } from "@/services/session";

const Event = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("lesson"), lesson: LessonMetadata, math_context: MathContext.optional() }),
  z.object({ kind: z.literal("slice"), slice: Slice }),
  LessonQuestion.extend({ kind: z.literal("question") }),
  z.object({ kind: z.literal("error"), code: z.string(), message: z.string() }),
  z.object({ kind: z.literal("end") }),
]);
type Event = z.infer<typeof Event>;

const CUT_SHORT = "L'explication s'est arrêtée en route. Tu peux réessayer ou poser une autre question.";

async function* events(response: Response): AsyncGenerator<Event> {
  if (!response.body || !response.headers.get("content-type")?.includes("application/x-ndjson")) {
    throw new Error(`Réponse inattendue du serveur (${response.status}).`);
  }
  for await (const line of readLines(response.body)) {
    let value: unknown;
    // A line cut short means the stream was cut: the parser's own message is not for a student.
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(CUT_SHORT);
    }
    const parsed = Event.safeParse(value);
    if (parsed.success) yield parsed.data;
  }
}

export interface NesalioStream {
  header: LessonHeader;
  slices: AsyncIterable<Slice>;
  /**
   * Questions to the student, by the tranche they follow. Filled as the stream is read: a question arrives right
   * after its tranche, so it is known by the time the next tranche (or the end) has arrived.
   */
  questions: Map<string, LessonQuestion>;
}

/** Resolves once the lesson header has arrived; the tranches then follow as they are validated. */
export async function openNesalioStream(question: string, signal: AbortSignal, endpoint = "/api/nesalio"): Promise<NesalioStream> {
  const response = await fetch(endpoint, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", ...sessionHeaders() },
    body: JSON.stringify({ question }),
  });
  const source = events(response);
  for (;;) {
    const { value, done } = await source.next();
    if (done) throw new Error("Le serveur n'a envoyé aucune explication.");
    if (value.kind === "error") throw new NesalioServerError(value.code, value.message);
    if (value.kind === "lesson") {
      const questions = new Map<string, LessonQuestion>();
      return {
        header: lessonHeader(value.lesson, value.math_context),
        questions,
        slices: (async function* () {
          for await (const event of source) {
            if (event.kind === "slice") yield event.slice;
            else if (event.kind === "question") questions.set(event.after, { id: event.id, after: event.after, check: event.check });
            else if (event.kind === "error") throw new NesalioServerError(event.code, event.message);
            else if (event.kind === "end") return;
          }
          // Closed without « end »: the server stopped on the way. The lesson is not complete and is not offered again as if it were.
          throw new Error(CUT_SHORT);
        })(),
      };
    }
  }
}
