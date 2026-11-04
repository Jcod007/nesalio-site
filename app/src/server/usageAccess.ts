import { encodeLine } from "@/domain/tutor/ndjson";
import { requireAccount } from "./account";
import { authorizeTrial } from "./trial";

export type UsageIdentity = { ok: true; userId?: string } | { ok: false; response: Response };
export type UsagePermit = { ok: true; userId: string; headers: Headers } | { ok: false; response: Response };
export type UsageOperation = "tutor" | "voice" | "feedback";

/** Verify Clerk and the request origin before accepting even a bounded body. */
export async function identifyUsage(request: Request, ndjson = false): Promise<UsageIdentity> {
  const account = await requireAccount(request, ndjson);
  if (account.ok) return account;
  // Explicitly configured trials may supplement signed-out access only. An
  // origin rejection, missing Clerk configuration or auth outage stays closed.
  if (account.response.status === 401 && (process.env.TRIAL_COOKIE_SECRET?.trim().length ?? 0) >= 32) {
    return { ok: true };
  }
  return account;
}

/** Reserve shared trial usage only after validating the request, before paid work. */
export async function reserveUsage(
  request: Request, identity: UsageIdentity & { ok: true }, operation: UsageOperation, ndjson = false,
): Promise<UsagePermit> {
  if (identity.userId) return { ok: true, userId: identity.userId, headers: new Headers() };
  const trial = await authorizeTrial(request, operation);
  if (trial.ok) {
    const headers = new Headers(trial.headers);
    headers.set("X-Nesalio-Trial-Remaining", String(trial.remaining));
    return { ok: true, userId: `trial:${trial.guestId}`, headers };
  }
  if (!ndjson) return trial;
  const headers = new Headers(trial.response.headers);
  headers.set("Content-Type", "application/x-ndjson; charset=utf-8");
  const body = await trial.response.json().catch(() => ({})) as { error?: string };
  return {
    ok: false,
    response: new Response(encodeLine({ kind: "error", code: "upstream", message: body.error ?? "Connecte-toi pour continuer." }), {
      status: trial.response.status, headers,
    }),
  };
}

export function usageResponse(response: Response, permit: UsagePermit & { ok: true }): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of permit.headers) headers.set(key, value);
  headers.set("Vary", "Cookie, Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
