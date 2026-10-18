/**
 * POST /api/feedback — un testeur signale un problème ou donne une idée.
 *
 * Le retour est transmis au même formulaire Formspree que les inscriptions du
 * site (champ « etape » = « retour-outil », pour les trier), ou à
 * FEEDBACK_ENDPOINT s'il est défini. Rien n'est conservé par l'application.
 */
import { refFromHeaders, shortSession } from "@/domain/session";
import { FEEDBACK_LABELS, FeedbackSchema } from "@/domain/feedback";
import { jsonError, readJson } from "@/server/http";
import { forwardToForm } from "@/server/forms";
import { createSessionLimits } from "@/server/rateLimit";

export const runtime = "nodejs";

// Assez pour signaler plusieurs problèmes pendant un essai, pas assez pour inonder le formulaire.
const limiter = createSessionLimits({ limit: 8, windowMs: 30 * 60_000, ipFactor: 6 });

export async function POST(request: Request): Promise<Response> {
  const read = await readJson(request, 40_000);
  if (!read.ok) return read.response;
  const parsed = FeedbackSchema.safeParse(read.body);
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Retour invalide.");

  const limit = limiter.check(request.headers);
  if (!limit.allowed) return jsonError(429, "Merci ! Tu as déjà envoyé plusieurs retours ; réessaie un peu plus tard.");

  const { kind, message, email, context } = parsed.data;
  const payload = {
    etape: "retour-outil",
    _subject: `Nesalio · retour de testeur : ${FEEDBACK_LABELS[kind]}`,
    type: FEEDBACK_LABELS[kind],
    message,
    ...(email ? { email } : {}),
    session: limit.session ? shortSession(limit.session) : "inconnue",
    ref: refFromHeaders(request.headers) ?? "sans inscription",
    ...(context
      ? {
          question: context.question ?? "",
          seance: context.title ?? "",
          etat: context.status,
          dernieres_phrases: context.recent.join("\n"),
          tableau: context.board.join("\n"),
          ecran: context.screen,
          navigateur: context.browser,
          rejeu: context.replay ?? "",
        }
      : { contexte: "non joint" }),
  };

  if (!(await forwardToForm(payload))) return jsonError(502, "L'envoi n'a pas fonctionné. Réessaie dans un instant.");
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
