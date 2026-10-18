/**
 * POST /api/apres-essai — réponses aux questions posées après un premier essai.
 * Transmises au formulaire du site avec etape = « 3-apres-essai » et la
 * référence de l'inscription (ref), pour les relier aux réponses d'avant l'essai.
 */
import { AfterTrialSchema } from "@/domain/afterTrial";
import { refFromHeaders, shortSession } from "@/domain/session";
import { forwardToForm } from "@/server/forms";
import { jsonError, readJson } from "@/server/http";
import { createSessionLimits } from "@/server/rateLimit";

export const runtime = "nodejs";

const limiter = createSessionLimits({ limit: 3, windowMs: 60 * 60_000, ipFactor: 10 });

export async function POST(request: Request): Promise<Response> {
  const read = await readJson(request, 8_000);
  if (!read.ok) return read.response;
  const parsed = AfterTrialSchema.safeParse(read.body);
  if (!parsed.success) return jsonError(400, "Réponses invalides.");
  const limit = limiter.check(request.headers);
  if (!limit.allowed) return jsonError(429, "Merci, tes réponses sont déjà arrivées.");

  const a = parsed.data;
  const ok = await forwardToForm({
    etape: "3-apres-essai",
    _subject: "Nesalio · réponses après essai",
    ref: a.ref ?? refFromHeaders(request.headers) ?? "sans inscription",
    aurait_aide: a.helped,
    pourquoi: a.why ?? "",
    plus_utile: a.useful?.length ? a.useful.join(" · ") : "non répondu",
    ce_qui_manque: a.missing ?? "",
    derniere_fois: a.whatYouDid ?? "",
    depense_mensuelle: a.spending ?? "non répondu",
    urgence: a.urgency ?? "non répondu",
    question_posee: a.question ?? "",
    session: limit.session ? shortSession(limit.session) : "inconnue",
  });
  return ok ? Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } }) : jsonError(502, "L'envoi n'a pas fonctionné. Réessaie dans un instant.");
}
