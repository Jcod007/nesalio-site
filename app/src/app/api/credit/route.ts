/**
 * GET  /api/credit           → questions restantes aujourd'hui ({ used, limit, remaining, bonusUntil }), ou { available: false }.
 * POST /api/credit { code }  → valide un code crédit à usage unique (dailyQuota.ts).
 */
import { z } from "zod";
import { requireAccount } from "@/server/account";
import { dailyQuota, exemptFromQuota } from "@/server/dailyQuota";
import { checkRate, jsonError, readJson } from "@/server/http";
import { createSessionLimits } from "@/server/rateLimit";

export const runtime = "nodejs";

const Body = z.object({ code: z.string().trim().min(1).max(40) });
// Few attempts: a code cannot be guessed by trying many.
const attempts = createSessionLimits({ limit: 5, windowMs: 10 * 60_000, ipFactor: 6 });
const NO_STORE = { "Cache-Control": "no-store" };

const until = (iso: string) => new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", timeZone: "America/Toronto" }).format(new Date(iso));

export async function GET(request: Request): Promise<Response> {
  const access = await requireAccount(request);
  if (!access.ok) return access.response;
  const quota = exemptFromQuota(access.userId) ? null : dailyQuota();
  if (!quota) return Response.json({ available: false }, { headers: NO_STORE });
  try {
    return Response.json({ available: true, ...(await quota.status(access.userId)) }, { headers: NO_STORE });
  } catch (error) {
    console.warn("Limite journalière illisible.", error);
    return Response.json({ available: false }, { headers: NO_STORE });
  }
}

export async function POST(request: Request): Promise<Response> {
  const access = await requireAccount(request);
  if (!access.ok) return access.response;
  const limited = checkRate(attempts, request, access.userId);
  if (limited) return limited;
  const quota = dailyQuota();
  if (!quota) return jsonError(503, "Les codes crédit sont indisponibles pour le moment.");
  const read = await readJson(request, 2_000);
  if (!read.ok) return read.response;
  const parsed = Body.safeParse(read.body);
  if (!parsed.success) return jsonError(400, "Entre ton code crédit.");
  try {
    const result = await quota.redeem(access.userId, parsed.data.code);
    if (result.ok) {
      return Response.json({ message: `Code accepté : 20 questions par jour jusqu'au ${until(result.bonusUntil)}.`, ...(await quota.status(access.userId)) }, { headers: NO_STORE });
    }
    if (result.reason === "used") return jsonError(409, "Ce code a déjà été utilisé.");
    if (result.reason === "already_active") return jsonError(409, `Ton compte a déjà un code actif jusqu'au ${until(result.bonusUntil!)}.`);
    return jsonError(400, "Ce code n'existe pas. Vérifie les lettres et les chiffres.");
  } catch (error) {
    console.warn("Code crédit : Redis indisponible.", error);
    return jsonError(503, "Les codes crédit sont indisponibles pour le moment. Réessaie plus tard.");
  }
}
