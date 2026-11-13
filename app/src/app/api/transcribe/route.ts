/**
 * POST /api/transcribe — ce que l'élève a dit au micro :
 * { audio: base64, mediaType } → { text }.
 * En cas d'échec (non-conservation refusée, compte, fournisseur), 502 avec un message
 * pour l'élève, sans repli : le navigateur n'utilise plus sa propre reconnaissance
 * vocale (elle enverrait la voix de l'élève à Google, Apple ou Microsoft).
 */
import { z } from "zod";
import { transcribeAudio } from "@/server/ai/audio";
import { readAiConfig } from "@/server/config";
import { extraLimitReached } from "@/server/dailyQuota";
import { checkRate, jsonError, readJson } from "@/server/http";
import { createSessionLimits } from "@/server/rateLimit";
import { requireAccount } from "@/server/account";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Environ 45 secondes d'audio compressé, encodé en base64. */
const MAX_BODY_BYTES = 3_000_000;
const MEDIA_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-m4a"];

const Body = z.object({
  audio: z.string().min(100),
  mediaType: z.string().refine((type) => MEDIA_TYPES.some((allowed) => type.startsWith(allowed)), "Format audio non pris en charge"),
});
const MIC_UNAVAILABLE = "Micro indisponible pour le moment : écris ta question.";
const limiter = createSessionLimits({ name: "transcribe", limit: 40, windowMs: 10 * 60_000, developerAccess: true });

export async function POST(request: Request): Promise<Response> {
  const access = await requireAccount(request);
  if (!access.ok) return access.response;
  const limited = await checkRate(limiter, request, access.userId);
  if (limited) return limited;
  const read = await readJson(request, MAX_BODY_BYTES);
  if (!read.ok) return read.response;
  const parsed = Body.safeParse(read.body);
  if (!parsed.success) return jsonError(400, "Audio invalide.");

  const config = readAiConfig(request.headers);
  if (!config.gatewayToken) return jsonError(503, MIC_UNAVAILABLE);
  // Counted only for valid audio the server can transcribe (dailyQuota.ts).
  if (await extraLimitReached(access.userId, "transcribe")) {
    return jsonError(429, "Tu as beaucoup utilisé le micro aujourd'hui : écris ta question, ou reviens demain.");
  }

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
    if (request.signal.aborted) return new Response(null, { status: 499 });
    console.warn("transcribe: échec", error);
    return jsonError(502, MIC_UNAVAILABLE);
  }
}
