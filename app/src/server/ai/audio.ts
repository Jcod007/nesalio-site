/**
 * Voix et transcription via Vercel AI Gateway (API REST des modèles audio).
 */
import { GATEWAY_BASE } from "@/server/config";
import { UpstreamError } from "@/server/tutor/chatCompletions";

const PROTOCOL = { "ai-gateway-protocol-version": "0.0.1" };

export interface SpeechResult {
  audio: Uint8Array;
  mediaType: string;
}

export async function synthesizeSpeech(options: {
  token: string;
  model: string;
  text: string;
  voice?: string;
  instructions?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<SpeechResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const google = options.model.startsWith("google/");
  const response = await fetchImpl(`${GATEWAY_BASE}/v4/ai/speech-model`, {
    method: "POST",
    signal: options.signal,
    headers: {
      Authorization: `Bearer ${options.token}`,
      ...PROTOCOL,
      "ai-speech-model-specification-version": "4",
      "ai-model-id": options.model,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: options.text,
      voice: options.voice,
      instructions: options.instructions,
      // Les voix Google ne produisent que du WAV (ou du PCM brut).
      outputFormat: google ? "wav" : "mp3",
      ...(google ? {} : { language: "fr" }),
    }),
  });
  if (!response.ok) {
    throw new UpstreamError(`Voix : ${response.status} ${(await response.text().catch(() => "")).slice(0, 300)}`, response.status);
  }
  const payload = (await response.json()) as { audio?: string };
  if (!payload.audio) throw new UpstreamError("Voix : réponse sans audio");
  return { audio: Buffer.from(payload.audio, "base64"), mediaType: google ? "audio/wav" : "audio/mpeg" };
}

export async function transcribeAudio(options: {
  token: string;
  model: string;
  audioBase64: string;
  mediaType: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${GATEWAY_BASE}/v4/ai/transcription-model`, {
    method: "POST",
    signal: options.signal,
    headers: {
      Authorization: `Bearer ${options.token}`,
      ...PROTOCOL,
      "ai-transcription-model-specification-version": "4",
      "ai-model-id": options.model,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ audio: options.audioBase64, mediaType: options.mediaType }),
  });
  if (!response.ok) {
    throw new UpstreamError(
      `Transcription : ${response.status} ${(await response.text().catch(() => "")).slice(0, 300)}`,
      response.status,
    );
  }
  const payload = (await response.json()) as { text?: string };
  return (payload.text ?? "").trim();
}
