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

interface TranscriptionOptions {
  token: string;
  model: string;
  audioBase64: string;
  mediaType: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

async function postTranscription(options: TranscriptionOptions, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
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
    body: JSON.stringify({ audio: options.audioBase64, mediaType: options.mediaType, ...extra }),
  });
  if (!response.ok) {
    throw new UpstreamError(
      `Transcription : ${response.status} ${(await response.text().catch(() => "")).slice(0, 300)}`,
      response.status,
    );
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

/** Durée d'un fichier WAV PCM, lue dans son en-tête (null si ce n'est pas un WAV lisible). */
export function wavDurationMs(bytes: Uint8Array): number | null {
  if (bytes.byteLength < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let byteRate = 0;
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt " && offset + 16 <= bytes.byteLength) byteRate = view.getUint32(offset + 16, true);
    if (id === "data") {
      if (!byteRate) return null;
      // Certaines voix écrivent une taille de données nulle ou fausse en flux : on prend ce qui est vraiment là.
      const available = bytes.byteLength - (offset + 8);
      const dataBytes = size > 0 && size <= available ? size : available;
      return Math.round((dataBytes / byteRate) * 1000);
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}
