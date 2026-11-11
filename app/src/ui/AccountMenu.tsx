"use client";

import { UserButton } from "@clerk/nextjs";
import { useTrialAccess } from "./TrialGate";
import styles from "./TrialGate.module.css";

export function AccountMenu() {
  const trial = useTrialAccess();
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return null;
  if (trial.authenticated && !trial.hasPending) return <UserButton />;
  return (
    <button type="button" className={styles.account} onClick={trial.openAccount} aria-label={trial.authenticated ? "Reprendre ma séance" : "Ouvrir mon compte"}>
      {trial.authenticated ? "Reprendre" : "Mon compte"}
    </button>
  );
}
