import { afterEach, describe, expect, it, vi } from "vitest";
import shell from "@/domain/nesalio/engineShell.json";
import { validateLesson } from "@/domain/nesalio/validate";
import { createPlaybackControl, pausableSleep } from "./nesalioControl";
import { playNesalioLesson, type NesalioClip } from "./nesalioPlayback";

const viewport = { x0: -8, y0: -4.5, x1: 8, y1: 4.5 };
const lesson = () => {
  const parsed = validateLesson({
    ...shell,
    slices: [
      {
        slice_id: "s",
        introduces: [{ id: "t", type: "text", content: "Bonjour" }],
        beats: [
          { id: "b1", say: "Premier passage.", cues: [], do: [{ id: "w", verb: "write", target: "t", at: "beat:start" }] },
          { id: "b2", say: "Deuxième passage.", cues: [], do: [] },
        ],
      },
    ],
  });
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  return parsed.value;
};

afterEach(() => vi.useRealTimers());

describe("pause et son coupé du lecteur Nesalio", () => {
  it("un silence ne s’écoule pas pendant la pause", async () => {
    vi.useFakeTimers();
    const control = createPlaybackControl();
    let done = false;
    void pausableSleep(1_000, new AbortController().signal, control).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(400);
    control.setPaused(true);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(done).toBe(false);
    control.setPaused(false);
    await vi.advanceTimersByTimeAsync(599);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(done).toBe(true);
  });

  it("ne commence pas le passage suivant tant que la leçon est en pause, et donne la commande à la voix", async () => {
    const control = createPlaybackControl();
    const started: string[] = [];
    const controls: unknown[] = [];
    const clip = (id: string): NesalioClip => ({
      durationMs: 1_000,
      cues: new Map(),
      dispose() {},
      async play(draw, _signal, given) {
        started.push(id);
        controls.push(given);
        draw(1_000);
        // The student pauses at the end of the first passage.
        if (id === "b1") control.setPaused(true);
      },
    });
    const playing = playNesalioLesson(lesson(), {
      viewport,
      signal: new AbortController().signal,
      control,
      wait: async () => {},
      openClip: async (beat) => clip(beat.id),
      onFrame() {},
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(started).toEqual(["b1"]);
    control.setPaused(false);
    await playing;
    expect(started).toEqual(["b1", "b2"]);
    expect(controls).toEqual([control, control]);
  });

  it("garde l’état du son coupé et prévient ceux qui l’écoutent", () => {
    const control = createPlaybackControl();
    const seen: boolean[] = [];
    const stop = control.subscribe(() => seen.push(control.muted));
    control.setMuted(true);
    control.setMuted(true);
    stop();
    control.setMuted(false);
    expect(seen).toEqual([true]);
    expect(control.muted).toBe(false);
  });
});
