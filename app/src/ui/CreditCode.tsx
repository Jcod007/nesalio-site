"use client";

import { useEffect, useState, type FormEvent } from "react";
import { sessionHeaders } from "@/services/session";
import styles from "./CreditCode.module.css";

interface Quota {
  remaining: number;
  limit: number;
  bonusUntil: string | null;
}

/** Questions restantes aujourd'hui, et le champ pour entrer un code crédit (api/credit). */
export function CreditCode() {
  const [quota, setQuota] = useState<Quota | null>(null);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

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
      } else {
        setMessage({ text: typeof data.error === "string" ? data.error : "Le code n'a pas pu être vérifié. Réessaie.", ok: false });
      }
    } catch {
      setMessage({ text: "Le code n'a pas pu être vérifié. Réessaie.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  const plural = quota.remaining > 1 ? "s" : "";
  return (
    <div className={styles.credit}>
      <p>
        {quota.remaining > 0
          ? `Il te reste ${quota.remaining} question${plural} aujourd'hui sur ${quota.limit}.`
          : `Tu as utilisé tes ${quota.limit} questions d'aujourd'hui. Reviens demain !`}
        {!quota.bonusUntil && !open ? (
          <>
            {" "}
            <button
              type="button"
              className={styles.link}
              onClick={() => {
                setOpen(true);
                setMessage(null);
              }}
            >
              J'ai un code crédit
            </button>
          </>
        ) : null}
      </p>
      {open ? (
        <form className={styles.form} onSubmit={submit}>
          <label htmlFor="credit-code">Code crédit</label>
          <input
            id="credit-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={40}
            placeholder="XXXX-XXXX-XX"
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
