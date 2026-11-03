/** Petits utilitaires partagés par les routes de l'API. */
import type { SessionLimits } from "./rateLimit";

export function jsonError(status: number, message: string, extra: Record<string, string> = {}) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store", ...extra } });
}

/** Coupe la lecture à la limite réelle en octets, même sans Content-Length. */
export async function readBoundedText(request: Request, maxBytes: number): Promise<
  { ok: true; text: string } | { ok: false; status: 400 | 413 }
> {
  if (!request.body) return { ok: true, text: "" };
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, status: 413 };
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return { ok: true, text: text + decoder.decode() };
  } catch {
    await reader.cancel().catch(() => undefined);
    return { ok: false, status: 400 };
  } finally { reader.releaseLock(); }
}

/** Lit un corps JSON en refusant ce qui dépasse `maxBytes`. */
export async function readJson(request: Request, maxBytes: number): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const raw = await readBoundedText(request, maxBytes);
  if (!raw.ok) return { ok: false, response: jsonError(raw.status, raw.status === 413 ? "Requête trop volumineuse." : "Requête illisible.") };
  try {
    return { ok: true, body: JSON.parse(raw.text) };
  } catch {
    return { ok: false, response: jsonError(400, "Requête illisible.") };
  }
}

export function checkRate(limits: SessionLimits, request: Request): Response | null {
  const limit = limits.check(request.headers);
  if (limit.allowed) return null;
  return jsonError(429, "Trop de demandes d'un coup. Réessaie dans quelques minutes.", {
    "Retry-After": String(limit.retryAfterSeconds),
  });
}
