/**
 * POST /api/voice — la voix de Nesa : { text } → audio (WAV ou MP3).
 * Réponse 503 si aucune voix n'est configurée : le navigateur se rabat alors
 * sur sa propre synthèse vocale.
 */
import { z } from "zod";
import { synthesizeSpeech } from "@/server/ai/audio";
import { readAiConfig } from "@/server/config";
import { checkRate, jsonError, readJson } from "@/server/http";
import { createRateLimiter } from "@/server/rateLimit";
import { isUnavailable } from "@/server/tutor/service";

export const runtime = "nodejs";
export const maxDuration = 30;

const Body = z.object({ text: z.string().trim().min(1).max(400) });
// Une séance compte une dizaine de phrases : la limite est large mais réelle.
const limiter = createRateLimiter({ limit: 160, windowMs: 10 * 60_000 });

export async function POST(request: Request): Promise<Response> {
  const read = await readJson(request, 4_000);
  if (!read.ok) return read.response;
  const parsed = Body.safeParse(read.body);
  if (!parsed.success) return jsonError(400, "Texte invalide.");

  const limited = checkRate(limiter, request);
  if (limited) return limited;

  const config = readAiConfig(request.headers);
  if (!config.gatewayToken) return jsonError(503, "Voix non configurée.");

  try {
    const { audio, mediaType } = await synthesizeSpeech({
      token: config.gatewayToken,
      model: config.voice.model,
      voice: config.voice.voice,
      instructions: config.voice.instructions,
      text: parsed.data.text,
      signal: request.signal,
    });
    return new Response(audio as unknown as BodyInit, {
      headers: { "Content-Type": mediaType, "Cache-Control": "private, max-age=3600" },
    });
  } catch (error) {
    console.warn("voice: échec de la synthèse", error);
    // 503 : le navigateur passe tout de suite à sa propre voix.
    if (isUnavailable(error)) return jsonError(503, "Voix indisponible pour le moment.");
    return jsonError(502, "La voix n'a pas pu être générée.");
  }
}
