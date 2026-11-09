/**
 * Voix et transcription via Vercel AI Gateway (API REST des modèles audio).
 */
import { z } from "zod";
import { GATEWAY_BASE } from "@/server/config";
import { UpstreamError } from "@/server/tutor/chatCompletions";
import { detectSpeechSpan } from "@/domain/audio/speechSpan";
import type { SpeechSpan } from "@/domain/timeline/spokenTime";

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
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<SpeechResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const google = options.model.startsWith("google/");
  const elevenlabs = {
    ...(options.withTimestamps ? { withTimestamps: true } : {}),
    ...(options.speed !== undefined ? { voiceSettings: { speed: options.speed } } : {}),
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

export interface TimedWord {
  text: string;
  startMs: number;
  endMs: number;
}

/**
 * Mots horodatés d'une réponse de transcription : « segments » (format de la
 * passerelle, en secondes) ou « words » (format brut de Whisper).
 */
export function parseTimedWords(payload: Record<string, unknown>): TimedWord[] {
  const ms = (seconds: unknown) => Math.round(Number(seconds) * 1000);
  const clean = (text: unknown) => String(text ?? "").trim();
  if (Array.isArray(payload.segments)) {
    return (payload.segments as Array<Record<string, unknown>>)
      .filter((s) => clean(s.text) && Number.isFinite(Number(s.startSecond)))
      .map((s) => ({ text: clean(s.text), startMs: ms(s.startSecond), endMs: ms(s.endSecond) }));
  }
  if (Array.isArray(payload.words)) {
    return (payload.words as Array<Record<string, unknown>>)
      .filter((w) => clean(w.word) && Number.isFinite(Number(w.start)))
      .map((w) => ({ text: clean(w.word), startMs: ms(w.start), endMs: ms(w.end) }));
  }
  return [];
}

/** Transcription avec l'heure de chaque mot (sert à mesurer la synchronisation voix-dessin). */
export async function transcribeWords(options: TranscriptionOptions): Promise<{ text: string; words: TimedWord[]; keys: string[] }> {
  const payload = await postTranscription(options, { providerOptions: { openai: { timestampGranularities: ["word"] } } });
  return {
    text: (typeof payload.text === "string" ? payload.text : "").trim(),
    words: parseTimedWords(payload),
    keys: Object.keys(payload),
  };
}

interface WavLayout {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  byteRate: number;
  dataOffset: number;
  dataBytes: number;
}

/** Lit l'en-tête d'un WAV PCM (null si ce n'en est pas un, ou s'il est illisible). */
function readWav(bytes: Uint8Array): WavLayout | null {
  if (bytes.byteLength < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let format: Omit<WavLayout, "dataOffset" | "dataBytes"> | null = null;
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt " && offset + 24 <= bytes.byteLength) {
      format = {
        channels: view.getUint16(offset + 10, true),
        sampleRate: view.getUint32(offset + 12, true),
        byteRate: view.getUint32(offset + 16, true),
        bitsPerSample: view.getUint16(offset + 22, true),
      };
    }
    if (id === "data") {
      if (!format || !format.byteRate) return null;
      // Certaines voix écrivent une taille de données nulle ou fausse en flux : on prend ce qui est vraiment là.
      const available = bytes.byteLength - (offset + 8);
      return { ...format, dataOffset: offset + 8, dataBytes: size > 0 && size <= available ? size : available };
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}

/** Durée d'un fichier WAV PCM, lue dans son en-tête (null si ce n'est pas un WAV lisible). */
export function wavDurationMs(bytes: Uint8Array): number | null {
  const wav = readWav(bytes);
  return wav ? Math.round((wav.dataBytes / wav.byteRate) * 1000) : null;
}

/** Échantillons d'un WAV PCM 16 bits (premier canal), entre -1 et 1. */
export function wavSamples(bytes: Uint8Array): { samples: Float32Array; sampleRate: number } | null {
  const wav = readWav(bytes);
  if (!wav || wav.bitsPerSample !== 16 || wav.channels < 1) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const stride = 2 * wav.channels;
  const count = Math.floor(wav.dataBytes / stride);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) samples[i] = view.getInt16(wav.dataOffset + i * stride, true) / 32768;
  return { samples, sampleRate: wav.sampleRate };
}

/** Partie vraiment parlée d'un audio généré (WAV seulement ; null sinon). */
export function speechSpanOf(audio: Uint8Array, mediaType: string): SpeechSpan | null {
  if (!mediaType.includes("wav")) return null;
  const decoded = wavSamples(audio);
  return decoded ? detectSpeechSpan(decoded.samples, decoded.sampleRate) : null;
}
