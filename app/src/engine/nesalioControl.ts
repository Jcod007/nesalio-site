/**
 * Commande de lecture partagée entre la page et le lecteur Nesalio : pause et
 * son coupé. La voix suit la commande (l'audio s'arrête et repart), les
 * silences entre passages ne s'écoulent pas pendant la pause, et le passage
 * suivant attend la reprise.
 */
export interface PlaybackControl {
  readonly paused: boolean;
  readonly muted: boolean;
  setPaused(paused: boolean): void;
  setMuted(muted: boolean): void;
  /** Called after each change; returns the function that stops listening. */
  subscribe(listener: () => void): () => void;
}

export function createPlaybackControl(): PlaybackControl {
  let paused = false;
  let muted = false;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  return {
    get paused() {
      return paused;
    },
    get muted() {
      return muted;
    },
    setPaused(value) {
      if (value !== paused) {
        paused = value;
        notify();
      }
    },
    setMuted(value) {
      if (value !== muted) {
        muted = value;
        notify();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Resolves at once when playing, or when the lesson is resumed; rejects if it is stopped. */
export function whenRunning(control: PlaybackControl | undefined, signal: AbortSignal): Promise<void> {
  if (!control?.paused) return signal.aborted ? Promise.reject(signal.reason) : Promise.resolve();
  return new Promise((resolve, reject) => {
    const stop = control.subscribe(() => {
      if (!control.paused) {
        finish();
        resolve();
      }
    });
    const abort = () => {
      finish();
      reject(signal.reason);
    };
    function finish() {
      stop();
      signal.removeEventListener("abort", abort);
    }
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** A silence of `ms` that only elapses while the lesson plays. */
export function pausableSleep(ms: number, signal: AbortSignal, control?: PlaybackControl): Promise<void> {
  return new Promise((resolve, reject) => {
    let left = ms;
    let startedAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      if (timer !== undefined || control?.paused) return;
      startedAt = Date.now();
      timer = setTimeout(() => {
        finish();
        resolve();
      }, left);
    };
    const hold = () => {
      if (timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
      left = Math.max(0, left - (Date.now() - startedAt));
    };
    const stop = control?.subscribe(() => {
      if (control.paused) hold();
      else run();
    });
    const abort = () => {
      finish();
      reject(signal.reason);
    };
    function finish() {
      if (timer !== undefined) clearTimeout(timer);
      stop?.();
      signal.removeEventListener("abort", abort);
    }
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    run();
  });
}
