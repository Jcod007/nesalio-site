import { z } from "zod";
import { CUE_TIMINGS_HEADER } from "@/domain/nesalio/alignment";
import { Id, type Beat } from "@/domain/nesalio/contract";
import type { NesalioClip } from "@/engine/nesalioPlayback";
import { fetchVoiceClip, readClipDuration } from "./voiceClip";

const Timing = z.record(Id, z.strictObject({ start: z.number().nonnegative(), end: z.number().positive() }));

/** A valid voice is never lost over its timings: unreadable ones leave every cue untimed, and the player defers. */
export function readTimings(header: string | null): z.infer<typeof Timing> {
  try {
    const parsed = Timing.safeParse(JSON.parse(header ?? "{}"));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export async function openNesalioClip(beat: Beat, signal: AbortSignal): Promise<NesalioClip> {
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
  const { response, blob } = await fetchVoiceClip("/api/voice", beat.say, requestSignal, beat.cues);
  if (!blob) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Audio indisponible (${response.status}).`);
  }
  const cues = readTimings(response.headers.get(CUE_TIMINGS_HEADER));
  const url = URL.createObjectURL(blob);
  const audio = new Audio();
  const dispose = () => {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    URL.revokeObjectURL(url);
  };
  try {
    const durationMs = await readClipDuration(audio, url, requestSignal);
    return {
      durationMs,
      cues: new Map(Object.entries(cues)),
      dispose,
      play(draw, playSignal, control) {
        return new Promise<void>((resolve, reject) => {
          const events = new AbortController();
          let raf = 0;
          let last = -1;
          let stopFollowing: (() => void) | undefined;
          function finish(error?: unknown) {
            if (events.signal.aborted) return;
            events.abort();
            stopFollowing?.();
            cancelAnimationFrame(raf);
            audio.pause();
            if (error) reject(error);
            else resolve();
          }
          function sample(time: number) {
            if (time !== last) {
              draw(time);
              last = time;
            }
          }
          function tick() {
            try {
              if (!audio.paused) sample(Math.min(durationMs, audio.currentTime * 1000));
              raf = requestAnimationFrame(tick);
            } catch (error) {
              finish(error);
            }
          }
          audio.addEventListener(
            "pause",
            () => {
              try {
                if (last >= 0) sample(Math.min(durationMs, audio.currentTime * 1000));
              } catch (error) {
                finish(error);
              }
            },
            { signal: events.signal },
          );
          audio.addEventListener(
            "ended",
            () => {
              try {
                sample(durationMs);
                finish();
              } catch (error) {
                finish(error);
              }
            },
            { once: true, signal: events.signal },
          );
          audio.addEventListener("error", () => finish(new Error("Lecture audio interrompue.")), { signal: events.signal });
          playSignal.addEventListener("abort", () => finish(playSignal.reason), { once: true, signal: events.signal });
          if (playSignal.aborted) {
            finish(playSignal.reason);
            return;
          }
          // Pause and mute from the page: the playhead follows the audio, so the board stops with the voice.
          const start = () =>
            audio.play().then(
              () => {
                if (!events.signal.aborted && !raf) tick();
              },
              (error: unknown) => {
                // A pause right after a resume interrupts play(): that is the student's choice, not a failure.
                if (!control?.paused) finish(error);
              },
            );
          const follow = () => {
            if (!control || events.signal.aborted) return;
            audio.muted = control.muted;
            if (control.paused && !audio.paused) audio.pause();
            else if (!control.paused && audio.paused && !audio.ended) void start();
          };
          stopFollowing = control?.subscribe(follow);
          if (control) audio.muted = control.muted;
          if (!control?.paused) void start();
        });
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
