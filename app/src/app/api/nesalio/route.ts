/**
 * POST /api/nesalio — { question } → l'explication au format Nesalio, en flux
 * NDJSON : une ligne « lesson », puis une ligne par tranche validée, puis
 * « end » ou « error ». Les identifiants du modèle ne quittent jamais le serveur.
 * La leçon est enregistrée après la réponse, pour améliorer Nesalio (domain/sessionLog.ts).
 */
import { after } from "next/server";
import { z } from "zod";
import { createLessonRecorder } from "@/domain/sessionLog";
import { refFromHeaders } from "@/domain/session";
import { recordEnv, saveTurn } from "@/server/sessionStore";
import { encodeLine } from "@/domain/tutor/ndjson";
import { readAiConfig, readReviewer } from "@/server/config";
import { readBoundedText } from "@/server/http";
import { requireAccount } from "@/server/account";
import { createSessionLimits } from "@/server/rateLimit";
import { generateNesalio, type NesalioEvent } from "@/server/nesalio/generator";
import { createSliceReviewer } from "@/server/nesalio/review";
import { createLessonKeeper, keptLessonsDir } from "@/server/nesalio/keepLesson";
import { streamChatCompletion } from "@/server/tutor/chatCompletions";

export const runtime = "nodejs";
// A long explanation with one repair stays well under this.
export const maxDuration = 180;

const Body = z.object({ question: z.string().trim().min(1).max(500) });
// Same pace as the tutor: about eight explanations per ten minutes for one student.
const limiter = createSessionLimits({ limit: 40, windowMs: 10 * 60_000, developerAccess: true });

const NDJSON_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Accel-Buffering": "no",
};

function single(event: NesalioEvent | { kind: "error"; code: string; message: string }, status: number, extra: Record<string, string> = {}) {
  return new Response(encodeLine(event), { status, headers: { ...NDJSON_HEADERS, ...extra } });
}

export async function POST(request: Request): Promise<Response> {
  const access = await requireAccount(request, true);
  if (!access.ok) return access.response;
  const limit = limiter.check(request.headers, undefined, access.userId);
  if (!limit.allowed) {
    return single({ kind: "error", code: "rate_limited", message: "Tu as posé beaucoup de questions d'un coup. Réessaie dans quelques minutes." },
      429, { "Retry-After": String(limit.retryAfterSeconds) });
  }
  const raw = await readBoundedText(request, 4_000);
  if (!raw.ok) return single({ kind: "error", code: "bad_request", message: "Question trop longue ou illisible." }, raw.status);
  let body: unknown;
  try { body = JSON.parse(raw.text); } catch { body = null; }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return single({ kind: "error", code: "bad_request", message: "Question invalide." }, 400);

  const config = readAiConfig(request.headers);
  if (!config.chat) return single({ kind: "error", code: "upstream", message: "Le modèle n'est pas configuré." }, 503);

  // Reviewer of substance (review.ts): on by default, NESALIO_RELECTEUR=0 turns it off.
  const reviewer = readReviewer(request.headers);
  // Every lesson kept with its log for checking the board afterwards (keepLesson.ts): local only, NESALIO_GARDER_LECONS.
  const keepDir = keptLessonsDir();
  const keeper = keepDir ? createLessonKeeper(parsed.data.question, keepDir) : undefined;
  // Every lesson recorded in the private session store (sessionStore.ts), after the response: never in the student's way.
  const recorder = createLessonRecorder({
    question: parsed.data.question,
    session: limit.session,
    ref: refFromHeaders(request.headers),
    env: recordEnv(),
    model: config.chat.model,
    ...(reviewer ? { reviewer: reviewer.model } : {}),
    startedAt: new Date(),
    clock: Date,
  });
  after(() => saveTurn(recorder.record()));
  const events = generateNesalio(parsed.data.question, {
    provider: config.chat,
    completion: streamChatCompletion,
    signal: request.signal,
    log: (message, detail) => {
      console.warn(message, detail);
      keeper?.log(message, detail);
    },
    // Teacher then layout writer (script.ts): off until measured better than one call.
    twoStage: process.env.NESALIO_DEUX_ETAPES === "1",
    ...(reviewer ? { review: createSliceReviewer({ provider: reviewer, completion: streamChatCompletion }) } : {}),
  });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await events.next();
        if (done) {
          recorder.finish("complete");
          await keeper?.finish();
          controller.close();
        } else {
          keeper?.event(value);
          recorder.event(value);
          controller.enqueue(encoder.encode(encodeLine(value)));
        }
      } catch (error) {
        console.error("nesalio: flux interrompu", error);
        recorder.finish("error");
        await keeper?.finish(`flux interrompu : ${error instanceof Error ? error.message : String(error)}`);
        controller.close();
      }
    },
    async cancel() {
      recorder.finish("cancelled");
      await events.return(undefined);
      await keeper?.finish("élève parti avant la fin");
    },
  });
  return new Response(stream, { status: 200, headers: NDJSON_HEADERS });
}
