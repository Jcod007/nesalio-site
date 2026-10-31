import { describe, expect, it } from "vitest";
import { musicVideo, roseVideo } from "@/content/studioDemos";
import { buildTimeline } from "@/domain/studio/timeline";
import type { Clock } from "./ports";
import { StudioPlayer } from "./studioPlayer";

/** Horloge virtuelle : le temps n'avance que quand on l'avance. */
function virtualClock() {
  let now = 1000;
  let waiting: Array<{ at: number; resolve: () => void }> = [];
  const clock: Clock = {
    now: () => now,
    sleep: (ms, signal) =>
      new Promise<void>((resolve) => {
        if (ms <= 0 || signal?.aborted) return resolve();
        waiting.push({ at: now + ms, resolve });
        signal?.addEventListener("abort", () => resolve(), { once: true });
      }),
  };
  async function advance(ms: number) {
    const target = now + ms;
    for (;;) {
      await new Promise((r) => setTimeout(r, 0));
      const due = waiting.filter((w) => w.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      now = due.at;
      waiting = waiting.filter((w) => w !== due);
      due.resolve();
    }
    now = target;
    await new Promise((r) => setTimeout(r, 0));
  }
  return { clock, advance };
}

describe("lecteur du studio", () => {
  it("pose chaque plan à son heure, puis termine", async () => {
    const { clock, advance } = virtualClock();
    const player = new StudioPlayer(clock);
    const timeline = buildTimeline(roseVideo, { bpm: 90 });
    const start = player.play(timeline, 0, 100);
    expect(start).toBe(1100);
    await advance(100);
    expect(player.getSnapshot().position).toBe(0);
    expect(player.getSnapshot().board.nodes.eq).toBeDefined();
    expect(player.getSnapshot().board.nodes.rose).toBeUndefined();
    await advance(timeline.shots[1]!.startMs);
    expect(player.getSnapshot().board.nodes.rose).toBeDefined();
    await advance(timeline.totalMs);
    expect(player.getSnapshot().status).toBe("done");
  });

  it("reprend au plan demandé avec le tableau d'avant déjà en place", async () => {
    const { clock, advance } = virtualClock();
    const player = new StudioPlayer(clock);
    const timeline = buildTimeline(musicVideo, { bpm: 120 });
    const start = player.play(timeline, 4, 0);
    // Le plan 4 commence maintenant : la vidéo a « commencé » il y a shots[4].startMs.
    expect(start).toBe(1000 - timeline.shots[4]!.startMs);
    expect(player.getSnapshot().board.nodes.son).toBeDefined();
    await advance(1);
    expect(player.getSnapshot().position).toBe(4);
  });

  it("s'arrête net", async () => {
    const { clock, advance } = virtualClock();
    const player = new StudioPlayer(clock);
    const timeline = buildTimeline(roseVideo, { bpm: 90 });
    player.play(timeline);
    await advance(200);
    player.stop();
    expect(player.getSnapshot().status).toBe("idle");
    await advance(timeline.totalMs);
    expect(player.getSnapshot().status).toBe("idle");
    expect(player.getSnapshot().board.nodes.rose).toBeUndefined();
  });
});
