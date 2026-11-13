/** Photo JPEG bornée → énoncé vérifiable avant la demande d'explication. */
import { z } from "zod";
import { PHOTO_MAX_BYTES } from "@/domain/photo";
import { requireAccount } from "@/server/account";
import { readAiConfig } from "@/server/config";
import { EXTRA_DAILY_LIMITS, extraLimitReached } from "@/server/dailyQuota";
import { checkRate, jsonError, readJson } from "@/server/http";
import { createSessionLimits } from "@/server/rateLimit";
import { DEFAULT_PHOTO_MODEL, readExercisePhoto, UnreadablePhoto, validPhoto } from "@/server/ai/photo";

export const runtime = "nodejs";
export const maxDuration = 45;

const MAX_BODY_BYTES = Math.ceil(PHOTO_MAX_BYTES / 3) * 4 + 1000;
const Body = z.object({
  image: z
    .string()
    .min(16)
    .max(MAX_BODY_BYTES - 1000),
});
const limiter = createSessionLimits({ name: "photo", limit: 20, windowMs: 10 * 60_000, developerAccess: true });

export async function POST(request: Request): Promise<Response> {
  const access = await requireAccount(request);
  if (!access.ok) return access.response;
  const limited = await checkRate(limiter, request, access.userId);
  if (limited) return limited;
  const config = readAiConfig(request.headers);
  if (!config.gatewayToken) return jsonError(503, "La lecture des photos est indisponible pour le moment.");
  const read = await readJson(request, MAX_BODY_BYTES);
  if (!read.ok) return read.response;
  const parsed = Body.safeParse(read.body);
  if (!parsed.success || !validPhoto(parsed.data.image)) return jsonError(400, "Photo invalide. Essaie une autre photo.");
  // Counted only for a valid photo the server can read (dailyQuota.ts).
  if (await extraLimitReached(access.userId, "photo")) {
    return jsonError(429, `Tu as déjà fait lire ${EXTRA_DAILY_LIMITS.photo} photos aujourd'hui. Écris ta question, ou reviens demain.`);
  }
  const timeout = AbortSignal.timeout(35_000);
  try {
    const reading = await readExercisePhoto({
      token: config.gatewayToken,
      model: process.env.PHOTO_MODEL?.trim() || DEFAULT_PHOTO_MODEL,
      image: parsed.data.image,
      signal: AbortSignal.any([request.signal, timeout]),
    });
    return Response.json(reading, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    if (error instanceof UnreadablePhoto) return jsonError(422, "Je n'arrive pas à lire tout l'exercice. Recadre-le et reprends une photo plus nette.");
    if (timeout.aborted) return jsonError(504, "La lecture de la photo a pris trop de temps. Réessaie.");
    // Neither the image nor the provider's response belongs in the session logs.
    console.warn("photo: lecture échouée");
    return jsonError(502, "Je n'ai pas réussi à lire la photo. Réessaie dans un instant.");
  }
}
