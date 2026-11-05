import { identifyUsage } from "@/server/usageAccess";
import { getTrialStatus, initializeTrial } from "@/server/trial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store", Vary: "Cookie, Origin" };

export async function GET(request: Request): Promise<Response> {
  const identity = await identifyUsage(request);
  if (!identity.ok) return identity.response;
  if (identity.userId) return Response.json({ authenticated: true, remaining: null, limit: 3 }, { headers });
  try {
    return Response.json({ authenticated: false, limit: 3, ...(await getTrialStatus(request)) }, { headers });
  } catch {
    return Response.json({ error: "L'essai est temporairement indisponible. Réessaie dans un instant." }, { status: 503, headers });
  }
}

export async function POST(request: Request): Promise<Response> {
  const identity = await identifyUsage(request);
  if (!identity.ok) return identity.response;
  if (identity.userId) return Response.json({ authenticated: true, remaining: null, limit: 3 }, { headers });
  const trial = await initializeTrial(request);
  if (!trial.ok) return trial.response;
  const resultHeaders = new Headers(headers);
  for (const [key, value] of trial.headers) resultHeaders.set(key, value);
  return Response.json({ authenticated: false, remaining: trial.remaining, limit: 3 }, { headers: resultHeaders });
}
