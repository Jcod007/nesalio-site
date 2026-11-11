/**
 * POST /api/voice — la voix de Nesa (ElevenLabs) : { text, cues } → audio, avec l'heure de chaque repère dans
 * l'en-tête des repères (CUE_TIMINGS_HEADER). Réponse 503 si aucune voix n'est configurée : Nesalio montre alors
 * le passage en sous-titres.
 */
import { z } from "zod";
import { synthesizeSpeech } from "@/server/ai/audio";
import { DEFAULTS, readAiConfig } from "@/server/config";
import { checkRate, jsonError, readJson } from "@/server/http";
import { createSessionLimits } from "@/server/rateLimit";
import { isUnavailable } from "@/server/tutor/chatCompletions";
import { requireAccount } from "@/server/account";
import { Cue } from "@/domain/nesalio/contract";
import { alignBeatCues, CUE_TIMINGS_HEADER } from "@/domain/nesalio/alignment";

export const runtime = "nodejs";
export const maxDuration = 30;

const Body = z.object({ text: z.string().trim().min(1).max(400), cues: z.array(Cue).max(32).default([]) });
// Une séance compte une dizaine de phrases : la limite est large mais réelle.
const limiter = createSessionLimits({ limit: 160, windowMs: 10 * 60_000, developerAccess: true });

export async function POST(request: Request): Promise<Response> {
  const access = await requireAccount(request);
  if (!access.ok) return access.response;
  const limited = checkRate(limiter, request, access.userId);
  if (limited) return limited;
  const read = await readJson(request, 24_000);
  if (!read.ok) return read.response;
  const parsed = Body.safeParse(read.body);
  if (!parsed.success) return jsonError(400, "Texte invalide.");

  const config = readAiConfig(request.headers);
  if (!config.gatewayToken) return jsonError(503, "Voix non configurée.");

  const { text, cues } = parsed.data;
  const voice = {
    model: DEFAULTS.nesalioVoiceModel, speed: DEFAULTS.nesalioVoiceSpeed,
    stability: DEFAULTS.nesalioVoiceStability, style: DEFAULTS.nesalioVoiceStyle,
  };
  const timeout = AbortSignal.timeout(13_000);
  const signal = AbortSignal.any([request.signal, timeout]);
  try {
    const { audio, mediaType, alignment } = await synthesizeSpeech({
      token: config.gatewayToken,
      ...voice,
      text,
      withTimestamps: cues.length > 0,
      signal,
    });
    const timings = cues.length ? (alignment ? alignBeatCues({ say: text, cues }, alignment) : new Map()) : null;
    // The clip is delivered anyway: the player defers the gestures whose cue has no time.
    const missing = cues.filter((cue) => !timings?.has(cue.id)).map((cue) => cue.text);
    if (missing.length) console.warn("voice: repères sans horodatage", { alignment: Boolean(alignment), missing });
    return new Response(audio as unknown as BodyInit, {
      headers: {
        "Content-Type": mediaType,
        "Cache-Control": "private, max-age=3600",
        ...(timings ? { [CUE_TIMINGS_HEADER]: JSON.stringify(Object.fromEntries(timings)) } : {}),
      },
    });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    if (timeout.aborted) return jsonError(504, "La voix a dépassé le délai de synthèse.");
    console.warn("voice: échec de la synthèse", error);
    // 503 : Nesalio passe tout de suite aux sous-titres.
    if (isUnavailable(error)) return jsonError(503, "Voix indisponible pour le moment.");
    return jsonError(502, "La voix n'a pas pu être générée.");
  }
}
