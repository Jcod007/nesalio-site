/**
 * POST /api/tutor — reçoit la question de l'élève et renvoie l'explication
 * en flux NDJSON (un événement par ligne), au fur et à mesure que le modèle
 * la génère. La clé OpenRouter ne quitte jamais le serveur.
 */
import type { StreamEvent } from "@/domain/scene/schema";
import { encodeLine } from "@/domain/tutor/ndjson";
import { TutorRequestSchema } from "@/domain/tutor/request";
import { readServerConfig } from "@/server/config";
import { clientKey, createRateLimiter } from "@/server/rateLimit";
import { streamOpenRouter } from "@/server/tutor/openrouter";
import { tutorEvents } from "@/server/tutor/service";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BODY_BYTES = 24_000;
const limiter = createRateLimiter({ limit: 20, windowMs: 10 * 60_000 });

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

  const limit = limiter.check(clientKey(request.headers));
  if (!limit.allowed) {
    return single(
      { kind: "error", code: "rate_limited", message: "Tu as posé beaucoup de questions d'un coup. Réessaie dans quelques minutes." },
      429,
      { "Retry-After": String(limit.retryAfterSeconds) },
    );
  }

  const config = readServerConfig();
  const signal = request.signal;
  const events = tutorEvents(parsed.data, {
    apiKey: config.openRouterApiKey,
    model: config.model,
    appUrl: config.appUrl,
    completion: streamOpenRouter,
    signal,
    log: (message, detail) => console.warn(message, detail),
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await events.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(encodeLine(value)));
      } catch (error) {
        console.error("tutor: flux interrompu", error);
        controller.close();
      }
    },
    async cancel() {
      await events.return(undefined);
    },
  });

  return new Response(stream, { status: 200, headers: NDJSON_HEADERS });
}
