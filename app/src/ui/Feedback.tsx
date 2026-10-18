"use client";

/**
 * « Signaler un problème » : un testeur décrit un bogue, une explication
 * fausse ou une idée. Le contexte de la séance (question, dernières phrases,
 * tableau) est joint s'il le laisse coché : c'est ce qui permet de rejouer le
 * problème. Rien n'est envoyé sans clic sur « Envoyer ».
 */
import { useEffect, useRef, useState } from "react";
import { FEEDBACK_KINDS, FEEDBACK_LABELS, type Feedback } from "@/domain/feedback";
import type { Player } from "@/engine/player";
import { sessionHeaders } from "@/services/session";
import styles from "./Feedback.module.css";

type Kind = Feedback["kind"];

export function FeedbackButton({ player }: { player: Player }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<Kind>("bug");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [withContext, setWithContext] = useState(true);
  const [state, setState] = useState<{ status: "idle" | "sending" | "sent" | "error"; error?: string }>({ status: "idle" });

  useEffect(() => {
    if (state.status !== "sent") return;
    const timer = setTimeout(() => {
      dialog.current?.close();
      setState({ status: "idle" });
    }, 1800);
    return () => clearTimeout(timer);
  }, [state.status]);

  const open = () => {
    setState({ status: "idle" });
    dialog.current?.showModal();
  };

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (message.trim().length < 3) {
      setState({ status: "error", error: "Décris le problème en quelques mots." });
      return;
    }
    setState({ status: "sending" });
    const body: Feedback = {
      kind,
      message: message.trim(),
      email: email.trim(),
      context: withContext
        ? {
            ...player.recentContext(),
            screen: `${window.innerWidth}×${window.innerHeight}`,
            browser: navigator.userAgent.slice(0, 300),
          }
        : undefined,
    };
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...sessionHeaders() },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setState({ status: "error", error: data.error ?? "L'envoi n'a pas fonctionné. Réessaie dans un instant." });
        return;
      }
      setMessage("");
      setState({ status: "sent" });
    } catch {
      setState({ status: "error", error: "Impossible d'envoyer : vérifie ta connexion." });
    }
  }

  return (
    <>
      <button type="button" className={styles.trigger} onClick={open} title="Signaler un problème ou donner une idée">
        <BugIcon />
        <span>Signaler un problème</span>
      </button>
      <dialog ref={dialog} className={styles.dialog} aria-labelledby="feedback-title" onClose={() => setState({ status: "idle" })}>
        {state.status === "sent" ? (
          <div className={styles.thanks} role="status">
            <strong>Merci !</strong>
            <p>Ton retour est bien arrivé. Il sert directement à améliorer Nesa.</p>
          </div>
        ) : (
          <form className={styles.form} onSubmit={send}>
            <div className={styles.head}>
              <h2 id="feedback-title">Signaler un problème</h2>
              <button type="button" className={styles.close} onClick={() => dialog.current?.close()} aria-label="Fermer">
                ×
              </button>
            </div>
            <fieldset className={styles.kinds}>
              <legend>C'est plutôt…</legend>
              {FEEDBACK_KINDS.map((value) => (
                <label key={value}>
                  <input type="radio" name="feedback-kind" value={value} checked={kind === value} onChange={() => setKind(value)} />
                  <span>{FEEDBACK_LABELS[value]}</span>
                </label>
              ))}
            </fieldset>
            <label className={styles.field} htmlFor="feedback-message">
              Qu'est-ce qui s'est passé ?
              <textarea
                id="feedback-message"
                rows={4}
                maxLength={2000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ex. : le cercle n'était pas au bon endroit quand Nesa a parlé de l'enroulement."
                required
              />
            </label>
            <label className={styles.field} htmlFor="feedback-email">
              Ton courriel <span className={styles.opt}>(facultatif, si on peut te poser une question)</span>
              <input id="feedback-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="toi@exemple.com" />
            </label>
            <label className={styles.check}>
              <input type="checkbox" checked={withContext} onChange={(e) => setWithContext(e.target.checked)} />
              Joindre la séance en cours (ta question, les dernières phrases de Nesa, ce qui est au tableau) pour qu'on puisse la rejouer.
            </label>
            {state.status === "error" ? (
              <p className={styles.error} role="alert">
                {state.error}
              </p>
            ) : null}
            <button className="cta" type="submit" disabled={state.status === "sending"}>
              {state.status === "sending" ? "Envoi…" : "Envoyer"}
            </button>
          </form>
        )}
      </dialog>
    </>
  );
}

function BugIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M8 9a4 4 0 0 1 8 0v5a4 4 0 0 1-8 0Z" />
      <path d="M12 9v9M4 13h4M16 13h4M5 8l3 2M19 8l-3 2M5 19l3-2M19 19l-3-2M10 5 9 3M14 5l1-2" />
    </svg>
  );
}
