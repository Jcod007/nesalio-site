/**
 * Lit le flux de /api/nesalio : l'en-tête de la leçon d'abord, puis les tranches
 * au fur et à mesure, pour que la lecture commence avant la fin de la génération.
 */
import { z } from "zod";
import { LessonMetadata, MathContext, Slice } from "@/domain/nesalio/contract";
import { lessonHeader, type LessonHeader } from "@/domain/nesalio/lesson";
import { readLines } from "@/domain/tutor/ndjson";
import { sessionHeaders } from "@/services/session";

const Event = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("lesson"), lesson: LessonMetadata, math_context: MathContext.optional() }),
  z.object({ kind: z.literal("slice"), slice: Slice }),
  z.object({ kind: z.literal("error"), code: z.string(), message: z.string() }),
  z.object({ kind: z.literal("end") }),
]);
type Event = z.infer<typeof Event>;

async function* events(response: Response): AsyncGenerator<Event> {
  if (!response.body || !response.headers.get("content-type")?.includes("application/x-ndjson")) {
    throw new Error(`Réponse inattendue du serveur (${response.status}).`);
  }
  for await (const line of readLines(response.body)) {
    const parsed = Event.safeParse(JSON.parse(line));
    if (parsed.success) yield parsed.data;
  }
}

export interface NesalioStream {
  header: LessonHeader;
  slices: AsyncIterable<Slice>;
}

/** Resolves once the lesson header has arrived; the tranches then follow as they are validated. */
export async function openNesalioStream(question: string, signal: AbortSignal, endpoint = "/api/nesalio"): Promise<NesalioStream> {
  const response = await fetch(endpoint, {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", ...sessionHeaders() },
    body: JSON.stringify({ question }),
  });
  const source = events(response);
  for (;;) {
    const { value, done } = await source.next();
    if (done) throw new Error("Le serveur n'a envoyé aucune explication.");
    if (value.kind === "error") throw new Error(value.message);
    if (value.kind === "lesson") {
      return {
        header: lessonHeader(value.lesson, value.math_context),
        slices: (async function* () {
          for await (const event of source) {
            if (event.kind === "slice") yield event.slice;
            else if (event.kind === "error") throw new Error(event.message);
            else if (event.kind === "end") return;
          }
        })(),
      };
    }
  }
}
