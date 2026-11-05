"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ACCOUNT_CANCELLED, ACCOUNT_READY, ACCOUNT_REQUIRED, TRIAL_UPDATED } from "@/services/trialEvents";
import { Nesa } from "./Nesa";
import styles from "./TrialGate.module.css";

type TrialState = { authenticated: boolean; remaining: number | null; limit: number };
type TrialAccess = {
  authenticated: boolean;
  remaining: number;
  enabled: boolean;
  hasPending: boolean;
  run(action: () => void): void;
  cancelPending(): void;
  openAccount(): void;
};

const TrialContext = createContext<TrialAccess>({
  authenticated: false,
  remaining: 3,
  enabled: false,
  hasPending: false,
  run: (action) => action(),
  cancelPending: () => {},
  openAccount: () => {},
});

export const useTrialAccess = () => useContext(TrialContext);

/** Keep the player below one stable provider during the entire account flow. */
export function TrialGateProvider({ children }: { children: ReactNode }) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return children;
  return <ConfiguredTrialGate>{children}</ConfiguredTrialGate>;
}

function ConfiguredTrialGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();
  const clerk = useClerk();
  const [trial, setTrial] = useState<TrialState>({ authenticated: false, remaining: 3, limit: 3 });
  const [open, setOpen] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<(() => void) | null>(null);
  const waitingForAccount = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const authenticated = Boolean(isSignedIn || trial.authenticated);

  const refresh = useCallback(async (): Promise<TrialState | null> => {
    try {
      const response = await fetch("/api/trial", { cache: "no-store" });
      if (!response.ok) return null;
      const state: unknown = await response.json();
      if (!state || typeof state !== "object" || !("authenticated" in state) || typeof state.authenticated !== "boolean") return null;
      const next = state as TrialState;
      if (next.authenticated) {
        setTrial({ authenticated: true, remaining: null, limit: 3 });
      } else if (Number.isInteger(next.remaining) && next.remaining! >= 0 && next.remaining! <= 3) {
        setTrial({ authenticated: false, remaining: next.remaining, limit: 3 });
      } else return null;
      return next;
    } catch {
      return null;
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: un changement de session doit recharger le quota, même si refresh ne lit pas isSignedIn.
  useEffect(() => {
    if (isLoaded) void refresh();
  }, [isLoaded, isSignedIn, refresh]);

  useEffect(() => {
    const updated = (event: Event) => {
      const remaining: unknown = (event as CustomEvent).detail?.remaining;
      if (typeof remaining === "number" && Number.isInteger(remaining) && remaining >= 0 && remaining <= 3) {
        setTrial((current) => ({ ...current, remaining }));
      }
    };
    const required = (event: Event) => {
      if ((event as CustomEvent).detail?.pendingRequest === true) {
        waitingForAccount.current = true;
        setHasPending(true);
      }
      setError(null);
      setOpen(true);
    };
    window.addEventListener(TRIAL_UPDATED, updated);
    window.addEventListener(ACCOUNT_REQUIRED, required);
    return () => {
      window.removeEventListener(TRIAL_UPDATED, updated);
      window.removeEventListener(ACCOUNT_REQUIRED, required);
    };
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();
  }, [open]);

  // Clerk owns its authentication dialog; reopen our continuation prompt after it closes.
  useEffect(() => {
    if (!authenticated || !hasPending) return;
    const timer = setTimeout(() => setOpen(true), 250);
    return () => clearTimeout(timer);
  }, [authenticated, hasPending]);

  const cancelPending = useCallback(() => {
    pending.current = null;
    waitingForAccount.current = false;
    setHasPending(false);
    window.dispatchEvent(new Event(ACCOUNT_CANCELLED));
  }, []);

  const run = useCallback(
    (action: () => void) => {
      if (authenticated || trial.remaining !== 0) {
        cancelPending();
        action();
        return;
      }
      pending.current = action;
      setHasPending(true);
      setError(null);
      setOpen(true);
    },
    [authenticated, trial.remaining, cancelPending],
  );

  const openAccount = useCallback(() => {
    setError(null);
    setOpen(true);
  }, []);
  const value = useMemo<TrialAccess>(
    () => ({
      authenticated,
      remaining: trial.remaining ?? 3,
      enabled: true,
      hasPending,
      run,
      cancelPending,
      openAccount,
    }),
    [authenticated, trial.remaining, hasPending, run, cancelPending, openAccount],
  );

  const openAuthentication = (mode: "signup" | "signin") => {
    dialog.current?.close();
    setOpen(false);
    const options = { forceRedirectUrl: "/", signUpForceRedirectUrl: "/", signInForceRedirectUrl: "/" };
    if (mode === "signup") clerk.openSignUp(options);
    else clerk.openSignIn(options);
  };

  const resume = async () => {
    setConfirming(true);
    setError(null);
    const state = await refresh();
    setConfirming(false);
    if (!state?.authenticated) {
      setError("Ta connexion n’est pas encore prête. Réessaie dans un instant.");
      return;
    }
    const action = pending.current;
    const release = waitingForAccount.current;
    pending.current = null;
    waitingForAccount.current = false;
    setHasPending(false);
    setOpen(false);
    if (release) window.dispatchEvent(new Event(ACCOUNT_READY));
    else action?.();
  };

  return (
    <TrialContext.Provider value={value}>
      {children}
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="trial-title"
        aria-describedby="trial-description"
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
      >
        <button type="button" className={styles.close} aria-label="Revenir au tableau" onClick={() => setOpen(false)}>
          ×
        </button>
        <Nesa state="clin" size={74} className={styles.nesa} />
        <h2 id="trial-title">{authenticated ? "On reprend ?" : hasPending || trial.remaining === 0 ? "On continue ensemble ?" : "Ton espace Nesalio"}</h2>
        <p id="trial-description">
          {authenticated
            ? "Ton compte est prêt et ton tableau est resté ouvert. Reprends là où tu en étais."
            : hasPending || trial.remaining === 0
              ? "Crée ton compte pour poursuivre ta séance. Ton tableau reste ici."
              : "Tu peux découvrir Nesa sans compte, puis te connecter quand tu veux."}
        </p>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.actions}>
          {authenticated ? (
            <button type="button" className="cta" disabled={confirming} onClick={() => void resume()}>
              {confirming ? "Un instant…" : hasPending ? "Continuer ma séance" : "Retour au tableau"}
            </button>
          ) : (
            <>
              <button type="button" className="cta" onClick={() => openAuthentication("signup")}>
                Créer mon compte
              </button>
              <button type="button" className="btn-line" onClick={() => openAuthentication("signin")}>
                J’ai déjà un compte
              </button>
            </>
          )}
          <button type="button" className={styles.back} onClick={() => setOpen(false)}>
            Revenir au tableau
          </button>
        </div>
        {!authenticated ? <p className={styles.note}>Un code par courriel. Aucun mot de passe à retenir.</p> : null}
      </dialog>
    </TrialContext.Provider>
  );
}

export function TrialHint() {
  const { authenticated, enabled, remaining } = useTrialAccess();
  if (!enabled || authenticated) return null;
  return (
    <p className={styles.hint}>
      {remaining === 3
        ? "Tes 3 premières réponses pour découvrir Nesa, sans compte."
        : remaining > 0
          ? `Encore ${remaining} réponse${remaining > 1 ? "s" : ""} pour découvrir Nesa, sans compte.`
          : "Ton compte te permettra de continuer avec Nesa."}
    </p>
  );
}
