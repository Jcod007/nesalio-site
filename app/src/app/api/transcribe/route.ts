/**
 * POST /api/transcribe — ce que l'élève a dit au micro :
 * { audio: base64, mediaType } → { text }.
 */
import { z } from "zod";
import { transcribeAudio } from "@/server/ai/audio";
import { readAiConfig } from "@/server/config";
import { checkRate, jsonError, readJson } from "@/server/http";
import { createRateLimiter } from "@/server/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Environ 45 secondes d'audio compressé, encodé en base64. */
const MAX_BODY_BYTES = 3_000_000;
const MEDIA_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-m4a"];

const Body = z.object({
  audio: z.string().min(100),
  mediaType: z.string().refine((type) => MEDIA_TYPES.some((allowed) => type.startsWith(allowed)), "Format audio non pris en charge"),
});
const limiter = createRateLimiter({ limit: 40, windowMs: 10 * 60_000 });

export async function POST(request: Request): Promise<Response> {
  const read = await readJson(request, MAX_BODY_BYTES);
  if (!read.ok) return read.response;
  const parsed = Body.safeParse(read.body);
  if (!parsed.success) return jsonError(400, "Audio invalide.");

  const limited = checkRate(limiter, request);
  if (limited) return limited;

  const config = readAiConfig(request.headers);
  if (!config.gatewayToken) return jsonError(503, "Transcription non configurée.");

  try {
    const text = await transcribeAudio({
      token: config.gatewayToken,
      model: config.transcription.model,
      audioBase64: parsed.data.audio,
      // Le paramètre « codecs » (audio/webm;codecs=opus) n'est pas utile au modèle.
      mediaType: parsed.data.mediaType.split(";")[0]!,
      signal: request.signal,
    });
    return Response.json({ text }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.warn("transcribe: échec", error);
    return jsonError(502, "Je n'ai pas réussi à comprendre l'enregistrement.");
  }
}
