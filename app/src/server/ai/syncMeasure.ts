/**
 * Mesure de la synchronisation voix-dessin sur de vraies phrases : chaque
 * phrase est dite par la voix de Nesa, puis transcrite avec l'heure de chaque
 * mot. On compare l'heure prévue des repères {id} à l'heure réelle des mots
 * (voir domain/timeline/syncCheck.ts).
 */
import { extractCues } from "@/domain/tutor/cues";
import { measureCues, summarizeSync, type CueSync } from "@/domain/timeline/syncCheck";
import type { TimedWord } from "./audio";

export interface SyncPorts {
  synthesize(text: string): Promise<{ audio: Uint8Array; mediaType: string; durationMs: number | null }>;
  transcribe(audio: Uint8Array, mediaType: string): Promise<{ text: string; words: TimedWord[]; keys: string[] }>;
}

export interface SyncReport {
  summary: ReturnType<typeof summarizeSync>;
  rows: Array<CueSync & { say: string }>;
  problems: string[];
}

export async function measureSync(rawSentences: readonly string[], ports: SyncPorts): Promise<SyncReport> {
  const rows: SyncReport["rows"] = [];
  const problems: string[] = [];
  for (const raw of rawSentences) {
    const { say, cues } = extractCues(raw);
    if (Object.keys(cues).length === 0) continue;
    try {
      const speech = await ports.synthesize(say);
      const heard = await ports.transcribe(speech.audio, speech.mediaType);
      if (heard.words.length === 0) {
        problems.push(`aucun horodatage par mot dans la transcription (champs reçus : ${heard.keys.join(", ")})`);
        continue;
      }
      const audioMs = speech.durationMs ?? heard.words[heard.words.length - 1]!.endMs;
      for (const row of measureCues({ say, cues, audioMs, words: heard.words })) rows.push({ say, ...row });
    } catch (error) {
      problems.push(`« ${say.slice(0, 60)} » : ${(error as Error).message.slice(0, 200)}`);
    }
  }
  return { summary: summarizeSync(rows), rows, problems };
}
