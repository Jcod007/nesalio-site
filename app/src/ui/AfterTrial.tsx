"use client";

/**
 * Questions d'après essai : proposées une fois, quand la première séance se
 * termine (la personne vient de vivre l'outil). Facultatives, en une fenêtre.
 */
import { useEffect, useRef, useState } from "react";
import { HELPED, SPENDING, URGENCY, USEFUL, refFromSearch, type AfterTrial } from "@/domain/afterTrial";
import { sessionHeaders } from "@/services/session";
import styles from "./Feedback.module.css";

const SPENDING_LABELS: Record<(typeof SPENDING)[number], string> = {
  "0 $": "Rien",
  "Moins de 50 $": "Moins de 50 $",
  "50 à 150 $": "50 à 150 $",
  "Plus de 150 $": "Plus de 150 $",
  "Je ne sais pas": "Je ne sais pas",
};

export function AfterTrialQuestions({ sessionDone, question }: { sessionDone: boolean; question: string | null }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [asked, setAsked] = useState(false);
  const [answers, setAnswers] = useState<Partial<AfterTrial>>({});
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  // Une seule fois par visite, un peu après la fin de la première séance (le temps de lire le résumé).
  useEffect(() => {
    if (!sessionDone || asked) return;
    const timer = setTimeout(() => {
      setAsked(true);
      dialog.current?.showModal();
    }, 4000);
    return () => clearTimeout(timer);
  }, [sessionDone, asked]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!answers.helped) return;
    setState("sending");
    const body: AfterTrial = {
      ...answers,
      helped: answers.helped,
      ref: refFromSearch(window.location.search),
      question: question?.slice(0, 500) ?? undefined,
    };
    try {
      const response = await fetch("/api/apres-essai", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...sessionHeaders() },
        body: JSON.stringify(body),
      });
      setState(response.ok ? "sent" : "error");
      if (response.ok) setTimeout(() => dialog.current?.close(), 1800);
    } catch {
      setState("error");
    }
  }

  const toggleUseful = (value: (typeof USEFUL)[number]) =>
    setAnswers((a) => {
      const current = a.useful ?? [];
      return { ...a, useful: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] };
    });

  const radio = <K extends keyof AfterTrial>(key: K, value: AfterTrial[K], label: string) => (
    <label key={String(value)}>
      <input type="radio" name={`apres-${String(key)}`} checked={answers[key] === value} onChange={() => setAnswers((a) => ({ ...a, [key]: value }))} />
      <span>{label}</span>
    </label>
  );

  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="apres-title">
      {state === "sent" ? (
        <div className={styles.thanks} role="status">
          <strong>Merci !</strong>
          <p>Tes réponses nous aident à décider quoi améliorer en premier.</p>
        </div>
      ) : (
        <form className={styles.form} onSubmit={send}>
          <div className={styles.head}>
            <h2 id="apres-title">Une minute pour nous aider ?</h2>
            <button type="button" className={styles.close} onClick={() => dialog.current?.close()} aria-label="Fermer">
              ×
            </button>
          </div>
          <fieldset className={styles.kinds}>
            <legend>La dernière fois que tu as bloqué (ou ton enfant), est-ce que Nesalio t&apos;aurait aidé ?</legend>
            {HELPED.map((value) => radio("helped", value, value))}
          </fieldset>
          <label className={styles.field} htmlFor="apres-why">
            Pourquoi ? <span className={styles.opt}>(facultatif)</span>
            <textarea id="apres-why" rows={2} maxLength={600} value={answers.why ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, why: e.target.value }))} />
          </label>
          <fieldset className={styles.kinds}>
            <legend>
              Qu&apos;est-ce qui t&apos;a été le plus utile ? <span className={styles.opt}>(plusieurs choix possibles)</span>
            </legend>
            {USEFUL.map((value) => (
              <label key={value}>
                <input type="checkbox" name="apres-useful" checked={answers.useful?.includes(value) ?? false} onChange={() => toggleUseful(value)} />
                <span>{value}</span>
              </label>
            ))}
          </fieldset>
          <label className={styles.field} htmlFor="apres-missing">
            Qu&apos;est-ce qui t&apos;a manqué ? <span className={styles.opt}>(facultatif)</span>
            <textarea
              id="apres-missing"
              rows={2}
              maxLength={600}
              value={answers.missing ?? ""}
              onChange={(e) => setAnswers((a) => ({ ...a, missing: e.target.value }))}
              placeholder="Ex. : un exemple de plus, aller moins vite, un exercice à la fin."
            />
          </label>
          <label className={styles.field} htmlFor="apres-did">
            Ce jour-là, qu&apos;as-tu fait pour t&apos;en sortir ? Est-ce que ça a marché ? <span className={styles.opt}>(facultatif)</span>
            <textarea
              id="apres-did"
              rows={2}
              maxLength={600}
              value={answers.whatYouDid ?? ""}
              onChange={(e) => setAnswers((a) => ({ ...a, whatYouDid: e.target.value }))}
              placeholder="Ex. : j'ai demandé à ChatGPT, mais je n'ai pas compris la démarche."
            />
          </label>
          <fieldset className={styles.kinds}>
            <legend>Cette année, combien ta famille dépense-t-elle en aide scolaire, par mois ?</legend>
            {SPENDING.map((value) => radio("spending", value, SPENDING_LABELS[value]))}
          </fieldset>
          <fieldset className={styles.kinds}>
            <legend>Ton prochain examen important dans cette matière, c&apos;est quand ?</legend>
            {URGENCY.map((value) => radio("urgency", value, value))}
          </fieldset>
          {state === "error" ? (
            <p className={styles.error} role="alert">
              L&apos;envoi n&apos;a pas fonctionné. Réessaie dans un instant.
            </p>
          ) : null}
          <button className="cta" type="submit" disabled={!answers.helped || state === "sending"}>
            {state === "sending" ? "Envoi…" : "Envoyer"}
          </button>
        </form>
      )}
    </dialog>
  );
}
