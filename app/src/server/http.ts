/** Petits utilitaires partagés par les routes de l'API. */
import { clientKey, type RateLimiter } from "./rateLimit";

export function jsonError(status: number, message: string, extra: Record<string, string> = {}) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store", ...extra } });
}

/** Lit un corps JSON en refusant ce qui dépasse `maxBytes`. */
export async function readJson(request: Request, maxBytes: number): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const raw = await request.text();
  if (raw.length > maxBytes) return { ok: false, response: jsonError(413, "Requête trop volumineuse.") };
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return { ok: false, response: jsonError(400, "Requête illisible.") };
  }
}

export function checkRate(limiter: RateLimiter, request: Request): Response | null {
  const limit = limiter.check(clientKey(request.headers));
  if (limit.allowed) return null;
  return jsonError(429, "Trop de demandes d'un coup. Réessaie dans quelques minutes.", {
    "Retry-After": String(limit.retryAfterSeconds),
  });
}
