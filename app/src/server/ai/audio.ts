/**
 * Voix et transcription via Vercel AI Gateway (API REST des modèles audio).
 */
import { z } from "zod";
import { GATEWAY_BASE } from "@/server/config";
import { UpstreamError } from "@/server/tutor/chatCompletions";

const PROTOCOL = { "ai-gateway-protocol-version": "0.0.1" };

const CharacterAlignment = z.object({
  characters: z.array(z.string().min(1)),
  characterStartTimesSeconds: z.array(z.number().nonnegative()),
  characterEndTimesSeconds: z.array(z.number().nonnegative()),
});

export interface SpeechResult {
  audio: Uint8Array;
  mediaType: string;
  alignment?: z.infer<typeof CharacterAlignment>;
}

/**
 * Pas d'options de vie privée ici (contrairement au modèle et à la transcription) : ElevenLabs,
 * la voix de Nesa, ne figure ni parmi les fournisseurs ZDR ni parmi ceux sans entraînement de la doc
 * AI Gateway (security-and-compliance, novembre 2026), et la doc des voix n'en parle pas. Si le
 * Gateway appliquait ces filtres, il n'y aurait plus aucun fournisseur et la voix tomberait.
 * Le texte envoyé est celui de la leçon (écrit par le modèle), pas les paroles de l'élève.
 */
export async function synthesizeSpeech(options: {
  token: string;
  model: string;
  text: string;
  voice?: string;
  instructions?: string;
  withTimestamps?: boolean;
  /** Speaking rate, 1 = the voice's natural pace (ElevenLabs accepts 0.7 to 1.2). */
  speed?: number;
  /** ElevenLabs only: 0 to 1, higher is a steadier, smoother delivery (fewer jumps in pitch and pace). */
  stability?: number;
  /** ElevenLabs only: 0 to 1, how much the voice's own style is exaggerated (0 = plain and calm). */
  style?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<SpeechResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const google = options.model.startsWith("google/");
  const voiceSettings = {
    ...(options.speed !== undefined ? { speed: options.speed } : {}),
    ...(options.stability !== undefined ? { stability: options.stability } : {}),
    ...(options.style !== undefined ? { style: options.style } : {}),
  };
  const elevenlabs = {
    ...(options.withTimestamps ? { withTimestamps: true } : {}),
    ...(Object.keys(voiceSettings).length ? { voiceSettings } : {}),
  };
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
      ...(options.speed !== undefined ? { speed: options.speed } : {}),
      ...(Object.keys(elevenlabs).length ? { providerOptions: { elevenlabs } } : {}),
    }),
  });
  if (!response.ok) {
    throw new UpstreamError(`Voix : ${response.status} ${(await response.text().catch(() => "")).slice(0, 300)}`, response.status);
  }
  const payload = (await response.json()) as {
    audio?: string;
    providerMetadata?: { elevenlabs?: { alignment?: unknown } };
  };
  if (!payload.audio) throw new UpstreamError("Voix : réponse sans audio");
  const alignment = CharacterAlignment.safeParse(payload.providerMetadata?.elevenlabs?.alignment);
  return {
    audio: Buffer.from(payload.audio, "base64"),
    mediaType: google ? "audio/wav" : "audio/mpeg",
    ...(alignment.success ? { alignment: alignment.data } : {}),
  };
}

interface TranscriptionOptions {
  token: string;
  model: string;
  audioBase64: string;
  mediaType: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/** Transcription models with a ZDR provider on AI Gateway (catalogue read on 9 Nov 2026). */
export const ZDR_TRANSCRIPTION_MODELS: readonly string[] = ["microsoft/mai-transcribe-2", "mistral/voxtral-mini-transcribe-3", "spacexai/grok-stt"];

/**
 * Vie privée de la voix de l'élève. Interdiction d'entraînement toujours (OpenAI, donc Whisper, est
 * sur la liste « sans entraînement » du Gateway : rien ne tombe). Non-conservation (ZDR) seulement
 * pour un modèle qui a un fournisseur ZDR : openai/whisper-1 (défaut actuel) n'en a aucun, la lui
 * demander ferait refuser l'appel et basculer le micro sur la reconnaissance du navigateur (Chrome
 * l'envoie à Google), pire pour la vie privée. NESALIO_ZDR=0 la retire partout. La doc du Gateway
 * ne décrit ces options que pour le texte ; le SDK AI les transmet telles quelles à ce point d'accès.
 * Changer de modèle après l'essai tools/eval/transcription-zdr.test.mjs (TRANSCRIPTION_MODEL).
 */
export function transcriptionPrivacy(model: string, env: NodeJS.ProcessEnv = process.env) {
  const zeroDataRetention = ZDR_TRANSCRIPTION_MODELS.includes(model) && env.NESALIO_ZDR?.trim() !== "0";
  return { gateway: { ...(zeroDataRetention ? { zeroDataRetention: true } : {}), disallowPromptTraining: true } };
}

async function postTranscription(options: TranscriptionOptions, extra: { providerOptions?: Record<string, unknown> } = {}): Promise<Record<string, unknown>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${GATEWAY_BASE}/v4/ai/transcription-model`;
  const providerOptions = { ...extra.providerOptions, ...transcriptionPrivacy(options.model) };
  const response = await fetchImpl(url, {
    method: "POST",
    signal: options.signal,
    headers: {
      Authorization: `Bearer ${options.token}`,
      ...PROTOCOL,
      "ai-transcription-model-specification-version": "4",
      "ai-model-id": options.model,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ audio: options.audioBase64, mediaType: options.mediaType, ...extra, providerOptions }),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    // Refused by the privacy filter (a model wrongly listed as ZDR): treated like a forbidden service.
    const status = response.status === 400 && detail.includes("no_zdr_providers_available") ? 403 : response.status;
    throw new UpstreamError(`Transcription : ${response.status} ${detail}`, status);
  }
  return (await response.json()) as Record<string, unknown>;
}

export async function transcribeAudio(options: TranscriptionOptions): Promise<string> {
  const payload = await postTranscription(options);
  return (typeof payload.text === "string" ? payload.text : "").trim();
}
