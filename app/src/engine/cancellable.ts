/**
 * Attente annulable, utilitaire du lecteur : `true` si la promesse se termine
 * avant l'annulation, `false` sinon (annulée, ou promesse rejetée).
 */
export function untilAborted(promise: Promise<unknown>, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const onAbort = () => resolve(false);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      () => {
        signal.removeEventListener("abort", onAbort);
        resolve(!signal.aborted);
      },
      () => {
        signal.removeEventListener("abort", onAbort);
        resolve(false);
      },
    );
  });
}
