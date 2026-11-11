/** Client-only notifications. The server remains the authority for trial access. */
export const TRIAL_UPDATED = "nesalio:trial-updated";
export const ACCOUNT_REQUIRED = "nesalio:account-required";
export const ACCOUNT_READY = "nesalio:account-ready";
export const ACCOUNT_CANCELLED = "nesalio:account-cancelled";

export function updateTrialFromResponse(response: Response): void {
  const raw = response.headers.get("X-Nesalio-Trial-Remaining");
  if (raw === null || raw.trim() === "" || typeof window === "undefined") return;
  const remaining = Number(raw);
  if (Number.isInteger(remaining) && remaining >= 0 && remaining <= 3) {
    window.dispatchEvent(new CustomEvent(TRIAL_UPDATED, { detail: { remaining } }));
  }
}

export function requestAccount(pendingRequest = false): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ACCOUNT_REQUIRED, { detail: { pendingRequest } }));
  }
}

/** Suspend the already requested turn. Only an explicit continue action resumes it. */
export function waitForAccount(signal: AbortSignal): Promise<boolean> {
  if (signal.aborted || typeof window === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    const finish = (allowed: boolean) => {
      signal.removeEventListener("abort", cancel);
      window.removeEventListener(ACCOUNT_READY, ready);
      window.removeEventListener(ACCOUNT_CANCELLED, cancel);
      resolve(allowed);
    };
    const ready = () => finish(true);
    const cancel = () => finish(false);
    window.addEventListener(ACCOUNT_READY, ready, { once: true });
    window.addEventListener(ACCOUNT_CANCELLED, cancel, { once: true });
    signal.addEventListener("abort", cancel, { once: true });
    requestAccount(true);
  });
}
