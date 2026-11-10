/**
 * A silent voice for judging the board without paying for speech: each passage lasts as long as Nesa
 * would take to say it (WORDS_PER_MINUTE, the real voice at speed 0.75), and each cue starts at the share
 * of the sentence where its words are. Used by /dev/nesalio?voix=simulee and the camera audit; never by
 * the student's page.
 */
import { cueOffset } from "@/domain/nesalio/alignment";
import type { Beat } from "@/domain/nesalio/contract";
import type { CueTiming } from "@/domain/nesalio/scheduler";
import type { NesalioClip } from "@/engine/nesalioPlayback";

export const SIMULATED_WORDS_PER_MINUTE = 115;

export function simulatedTimings(beat: Pick<Beat, "say" | "cues">): { durationMs: number; cues: Map<string, CueTiming> } {
  const words = beat.say.split(/\s+/).filter(Boolean).length;
  const durationMs = Math.max(1_000, (words / SIMULATED_WORDS_PER_MINUTE) * 60_000);
  const cues = new Map<string, CueTiming>();
  for (const cue of beat.cues) {
    const start = cueOffset(beat.say, cue.text, cue.occurrence ?? 1);
    if (start < 0) continue;
    cues.set(cue.id, { start: (start / beat.say.length) * durationMs, end: ((start + cue.text.length) / beat.say.length) * durationMs });
  }
  return { durationMs, cues };
}

/** Real time: the playhead follows the clock, one frame per animation frame of the page. */
export async function openSimulatedClip(beat: Beat): Promise<NesalioClip> {
  const { durationMs, cues } = simulatedTimings(beat);
  return {
    durationMs, cues, dispose() {},
    play(draw, signal) {
      return new Promise((resolve, reject) => {
        const begin = performance.now();
        const tick = () => {
          if (signal.aborted) { reject(signal.reason ?? new Error("arrêté")); return; }
          const playhead = Math.min(durationMs, performance.now() - begin);
          draw(playhead);
          if (playhead >= durationMs) resolve();
          else requestAnimationFrame(tick);
        };
        tick();
      });
    },
  };
}
