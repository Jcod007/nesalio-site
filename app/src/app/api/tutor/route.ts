/**
 * POST /api/tutor — reçoit la question de l'élève et renvoie l'explication
 * en flux NDJSON (un événement par ligne), au fur et à mesure que le modèle
 * la génère. Les identifiants du modèle ne quittent jamais le serveur.
 */
import type { StreamEvent } from "@/domain/scene/schema";
import { encodeLine } from "@/domain/tutor/ndjson";
import { TutorRequestSchema } from "@/domain/tutor/request";
import { readAiConfig } from "@/server/config";
import { createSessionLimits } from "@/server/rateLimit";
import { shortSession } from "@/domain/session";
import { streamChatCompletion } from "@/server/tutor/chatCompletions";
import { tutorEvents } from "@/server/tutor/service";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BODY_BYTES = 24_000;
// Par session de navigation : une séance compte plusieurs tours (un appel par réponse de l'élève),
// soit environ 8 séances par 10 minutes ; une même adresse (une classe) peut en ouvrir 12 fois plus.
const limiter = createSessionLimits({ limit: 40, windowMs: 10 * 60_000 });

const NDJSON_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Accel-Buffering": "no",
};

function single(event: StreamEvent, status: number, extra: Record<string, string> = {}) {
  return new Response(encodeLine(event), { status, headers: { ...NDJSON_HEADERS, ...extra } });
}

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return single({ kind: "error", code: "bad_request", message: "Question trop longue." }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return single({ kind: "error", code: "bad_request", message: "Requête illisible." }, 400);
  }
  const parsed = TutorRequestSchema.safeParse(body);
  if (!parsed.success) {
    return single({ kind: "error", code: "bad_request", message: "Requête invalide." }, 400);
  }

  const limit = limiter.check(request.headers);
  const tag = limit.session ? `[session ${shortSession(limit.session)}]` : "[sans session]";
  if (!limit.allowed) {
    return single(
      { kind: "error", code: "rate_limited", message: "Tu as posé beaucoup de questions d'un coup. Réessaie dans quelques minutes." },
      429,
      { "Retry-After": String(limit.retryAfterSeconds) },
    );
  }

  const config = readAiConfig(request.headers);
  const events = tutorEvents(parsed.data, {
    provider: config.chat,
    completion: streamChatCompletion,
    signal: request.signal,
    log: (message, detail) => console.warn(tag, message, detail),
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await events.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(encodeLine(value)));
      } catch (error) {
        console.error(tag, "tutor: flux interrompu", error);
        controller.close();
      }
    },
    async cancel() {
      await events.return(undefined);
    },
  });

  return new Response(stream, { status: 200, headers: NDJSON_HEADERS });
}
