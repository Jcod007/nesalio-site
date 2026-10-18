"use client";

import { forwardRef } from "react";
import type { PlayerSnapshot } from "@/engine/player";
import { Caption } from "./Caption";
import { useVoiceInput } from "./hooks/useVoiceInput";
import { MicButton } from "./MicButton";
import { Nesa } from "./Nesa";
import { QuestionInput } from "./QuestionInput";
import { nesaStateFor } from "./theme";
import styles from "./Dock.module.css";

export interface DockActions {
  interrupt(): void;
  resume(): void;
  followUp(text: string): void;
  answer(choice: number): void;
  retry(): void;
  newTopic(): void;
  setListening(listening: boolean): void;
}

interface Props {
  snapshot: PlayerSnapshot;
  lastAsked: string | null;
  listening: boolean;
  actions: DockActions;
}

/**
 * La carte de Nesa, posée sur le tableau : sa phrase, et ce que l'élève peut
 * faire à ce moment-là (l'interrompre, répondre, poser une autre question).
 */
export const Dock = forwardRef<HTMLElement, Props>(function Dock({ snapshot, lastAsked, listening, actions }, ref) {
  const { status, caption, check } = snapshot;
  // Micro de la carte : parler à Nesa pendant qu'elle explique, c'est l'interrompre.
  const voice = useVoiceInput((state) => actions.setListening(state !== "idle"));
  const voiceBusy = voice.state !== "idle";
  const nesa = nesaStateFor(status, caption?.mood, listening);
  const speaking = status === "playing" || status === "checking";

  return (
    <section ref={ref} className={styles.dock} aria-label="Nesa">
      {lastAsked ? (
        <p className={styles.asked}>
          <span className="sr-only">Ta question : </span>
          {lastAsked}
        </p>
      ) : null}

      <div className={styles.card}>
        <div className={styles.row}>
          <Nesa state={nesa} size={60} className={styles.nesa} />
          <div className={styles.text}>
            {status === "thinking" && !caption ? (
              <p className={styles.caption}>
                {snapshot.answeringFollowUp ? "Bonne question, je regarde ça" : "Je prépare ton explication"}
                <span className={styles.dots} aria-hidden="true" />
              </p>
            ) : status === "error" ? (
              <p className={styles.caption}>{snapshot.error}</p>
            ) : status === "done" ? (
              <p className={styles.caption}>
                {snapshot.summary.length > 0 ? "Bien travaillé ! Voici ce qu'il faut retenir." : "Tu as une autre question ? Je suis là."}
              </p>
            ) : status === "paused" ? (
              <p className={styles.caption}>
                {voice.state === "transcribing" ? "Je note ce que tu m'as dit…" : "Je t'écoute. Qu'est-ce qui n'est pas clair ?"}
              </p>
            ) : caption ? (
              <Caption key={`${caption.startedAt}`} caption={caption} speaking={speaking} />
            ) : null}
            {status === "thinking" && caption ? <span className={styles.dots} aria-label="Nesa réfléchit" /> : null}
            {snapshot.error && status !== "error" ? <p className={styles.notice}>{snapshot.error}</p> : null}
            {voice.error ? <p className={styles.notice}>{voice.error}</p> : null}
          </div>
        </div>

        {status === "checking" && check ? (
          <div className={styles.choices} role="group" aria-label={check.prompt}>
            {check.choices.map((choice, i) => (
              <button key={i} type="button" className={styles.choice} onClick={() => actions.answer(i)}>
                {choice}
              </button>
            ))}
          </div>
        ) : null}

        {check && check.picked !== null && (status === "playing" || status === "thinking") ? (
          <div className={styles.choices} aria-hidden="true">
            {check.choices.map((choice, i) => (
              <span
                key={i}
                className={styles.choice}
                data-state={choiceState(i, check.picked, check.answer)}
              >
                {choice}
              </span>
            ))}
          </div>
        ) : null}

        {status === "done" && snapshot.summary.length > 0 ? (
          <div className={styles.summary}>
            <h3>Séance terminée</h3>
            <ul>
              {snapshot.summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className={styles.controls}>
          {status === "playing" || status === "checking" || (status === "thinking" && caption) ? (
            <>
              <button type="button" className="btn-line" onClick={actions.interrupt}>
                <PauseIcon /> Attends, je comprends pas
              </button>
              <MicButton voice={voice} variant="pill" onStart={actions.interrupt} onResult={actions.followUp} />
            </>
          ) : null}

          {status === "paused" && voiceBusy ? (
            <MicButton voice={voice} variant="pill" onResult={actions.followUp} />
          ) : null}

          {status === "paused" && !voiceBusy ? (
            <>
              <QuestionInput
                placeholder="Dis-moi ce qui bloque…"
                onSubmit={actions.followUp}
                onListeningChange={actions.setListening}
                submitLabel="Demander"
                autoFocus
              />
              <button type="button" className="btn-line" onClick={actions.resume}>
                <PlayIcon /> Continuer l&apos;explication
              </button>
            </>
          ) : null}

          {status === "done" ? (
            <>
              <QuestionInput
                placeholder="Une autre question sur cette notion ?"
                onSubmit={actions.followUp}
                onListeningChange={actions.setListening}
                submitLabel="Demander"
              />
              <button type="button" className="btn-line" onClick={actions.newTopic}>
                Nouvelle notion
              </button>
            </>
          ) : null}

          {status === "error" ? (
            <>
              <button type="button" className="cta" onClick={actions.retry}>
                Réessayer
              </button>
              <button type="button" className="btn-line" onClick={actions.newTopic}>
                Autre question
              </button>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
});

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M7 5v14l12-7z" fill="currentColor" />
    </svg>
  );
}

/** État d'un choix une fois la réponse donnée. Sans bonne réponse (question pour situer l'élève), on montre seulement son choix. */
function choiceState(index: number, picked: number | null, answer: number | undefined): "right" | "wrong" | "picked" | "idle" {
  if (answer === undefined) return index === picked ? "picked" : "idle";
  if (index === answer) return "right";
  return index === picked ? "wrong" : "idle";
}
