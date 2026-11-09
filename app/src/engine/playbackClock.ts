import { realClock, type Clock } from "./ports";

/** Une pause conserve le temps restant des délais de lecture. Le réseau continue. */
export function createPlaybackClock(base: Clock = realClock) {
  let pausedAt: number | null = null;
  let offset = 0;
  const changed = new Set<() => void>();
  const now = () => (pausedAt ?? base.now()) - offset;

  function wait(ms: number, signal?: AbortSignal): Promise<void> {
    const end = now() + ms;
    return new Promise((resolve) => {
      let timer: AbortController | undefined;
      function finish() {
        timer?.abort();
        changed.delete(schedule);
        signal?.removeEventListener("abort", finish);
        resolve();
      }
      function schedule() {
        timer?.abort();
        if (signal?.aborted) return finish();
        if (pausedAt !== null) return;
        const remaining = end - now();
        if (remaining <= 0) return finish();
        const active = new AbortController();
        timer = active;
        void base.sleep(remaining, active.signal).then(() => {
          if (!active.signal.aborted) finish();
        });
      }
      changed.add(schedule);
      signal?.addEventListener("abort", finish, { once: true });
      schedule();
    });
  }

  return {
    now,
    sleep: wait,
    waitUntilPlaying: (signal?: AbortSignal) => pausedAt === null ? undefined : wait(0, signal),
    setPaused(paused: boolean) {
      if (paused === (pausedAt !== null)) return;
      const time = base.now();
      if (pausedAt !== null) offset += time - pausedAt;
      pausedAt = paused ? time : null;
      for (const notify of changed) notify();
    },
  } satisfies Clock & { setPaused(paused: boolean): void };
}
