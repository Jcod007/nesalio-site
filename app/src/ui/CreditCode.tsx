"use client";

import { type FormEvent, useEffect, useId, useState } from "react";
import { sessionHeaders } from "@/services/session";
import styles from "./CreditCode.module.css";

interface Quota {
  remaining: number;
  limit: number;
  bonusUntil: string | null;
}

/** From this many questions left, the home screen says how many remain; above it, nothing is said. */
export const LOW_QUOTA = 3;

/**
 * Code crédit (api/credit), là où il sert.
 *
 * - `home` (accueil) : un simple lien « J'ai un code » qui ouvre le champ sur place ; le nombre de questions restantes
 *   n'apparaît qu'à partir de LOW_QUOTA, pour ne pas annoncer un rationnement avant la première question.
 * - `limit` (carte de Nesa, limite du jour atteinte) : le champ est ouvert d'emblée, c'est le seul moment où il sert ;
 *   `onRedeemed` permet alors de reposer la question.
 */
export function CreditCode({ variant = "home", onRedeemed }: { variant?: "home" | "limit"; onRedeemed?: () => void }) {
  const [quota, setQuota] = useState<Quota | null>(null);
  const [open, setOpen] = useState(variant === "limit");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const fieldId = useId();
  const formId = useId();

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/credit", { signal: controller.signal, headers: sessionHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.available) setQuota(data);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  if (!quota) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/credit", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...sessionHeaders() },
        body: JSON.stringify({ code }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setQuota(data);
        setCode("");
        setOpen(false);
        setMessage({ text: data.message, ok: true });
        onRedeemed?.();
      } else {
        setMessage({ text: typeof data.error === "string" ? data.error : "Le code n'a pas pu être vérifié. Réessaie.", ok: false });
      }
    } catch {
      setMessage({ text: "Le code n'a pas pu être vérifié. Réessaie.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  const canRedeem = !quota.bonusUntil;
  // A code already active: nothing more to enter, Nesa's message says to come back tomorrow.
  if (variant === "limit" && !canRedeem && !message) return null;
  const plural = quota.remaining > 1 ? "s" : "";
  const count =
    variant === "home" && quota.remaining <= LOW_QUOTA
      ? quota.remaining > 0
        ? `Plus que ${quota.remaining} question${plural} aujourd'hui.`
        : `Tu as utilisé tes ${quota.limit} questions d'aujourd'hui. Reviens demain !`
      : null;
  // The link stays on the home screen (open or closed); in Nesa's card the field is already there.
  const toggle =
    variant === "home" && canRedeem ? (
      <button
        type="button"
        className={styles.link}
        aria-expanded={open}
        aria-controls={formId}
        onClick={() => {
          setOpen(!open);
          setMessage(null);
        }}
      >
        J'ai un code
      </button>
    ) : null;

  if (!count && !toggle && !open && !message) return null;
  return (
    <div className={styles.credit} data-variant={variant}>
      {count || toggle ? (
        <p>
          {count}
          {count && toggle ? " " : null}
          {toggle}
        </p>
      ) : null}
      {open && canRedeem ? (
        <form id={formId} className={styles.form} onSubmit={submit}>
          <label htmlFor={fieldId}>{variant === "limit" ? "Ton code crédit" : "Code crédit"}</label>
          <input
            id={fieldId}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={40}
          />
          <button type="submit" disabled={busy || !code.trim()}>
            {busy ? "Vérification…" : "Valider"}
          </button>
        </form>
      ) : null}
      {message ? (
        <p role="status" className={message.ok ? styles.ok : styles.error}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
