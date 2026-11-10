"use client";

import { forwardRef } from "react";
import type { SessionSnapshot } from "@/engine/nesalioSession";
import { Nesa } from "./Nesa";
import { QuestionInput } from "./QuestionInput";
import type { NesaState } from "./theme";
import styles from "./Dock.module.css";

export interface NesalioDockActions {
  ask(question: string): void;
  replay(): void;
  retry(): void;
  setPaused(paused: boolean): void;
  answer(choice: number): void;
  continueLesson(): void;
  newTopic(): void;
  setListening(listening: boolean): void;
}

function nesaState({ status, paused, waiting, asking }: SessionSnapshot, listening: boolean): NesaState {
  if (listening) return "ecoute";
  // A question on screen: Nesa waits for the answer, then is pleased with a right one.
  if (asking) return asking.right ? "content" : "repos";
  if (status === "preparing" || waiting) return "reflechit";
  if (status === "playing") return paused ? "repos" : "parle";
  return status === "done" ? "content" : "repos";
}

/**
 * La carte de Nesa pendant une explication Nesalio : la phrase dite, la pause,
 * et à la fin une autre question, « Revoir l'explication » ou une nouvelle notion.
 */
export const NesalioDock = forwardRef<HTMLElement, { snapshot: SessionSnapshot; listening: boolean; actions: NesalioDockActions }>(
  function NesalioDock({ snapshot, listening, actions }, ref) {
    const { status, caption, paused, waiting, error, question, canReplay, asking } = snapshot;
    return (
      <section ref={ref} className={styles.dock} aria-label="Nesa">
        {question ? (
          <p className={styles.asked}>
            <span className="sr-only">Ta question : </span>
            {question}
          </p>
        ) : null}

        <div className={styles.card}>
          <div className={styles.row}>
            <Nesa state={nesaState(snapshot, listening)} size={60} className={styles.nesa} />
            <div className={styles.text} aria-live="polite">
              {asking ? (
                <>
                  <p className={styles.caption}>{asking.prompt}</p>
                  {asking.feedback ? <p className={styles.notice} data-right={asking.right === true}>{asking.feedback}</p> : null}
                </>
              ) : status === "preparing" ? (
                <p className={styles.caption}>Je prépare l&apos;explication<span className={styles.dots} aria-hidden="true" /></p>
              ) : status === "error" ? (
                <p className={styles.caption}>{error}</p>
              ) : status === "done" ? (
                <>
                  <p className={styles.caption}>{error ? "Voilà ce que j'ai pu t'expliquer." : "Voilà pour l'explication. Tu as une autre question ?"}</p>
                  {error ? <p className={styles.notice}>{error}</p> : null}
                </>
              ) : (
                <>
                  <p className={styles.caption}>{caption}</p>
                  {paused ? <p className={styles.notice}>En pause.</p> : null}
                  {waiting && !paused ? <span className={styles.dots} aria-label="Nesa écrit la suite" /> : null}
                </>
              )}
            </div>
          </div>

          {asking ? (
            <div className={styles.choices} role="group" aria-label="Choisis ta réponse">
              {asking.choices.map((choice, index) => {
                const state = asking.solved === index ? "right" : asking.wrong.includes(index) ? "wrong" : asking.solved !== null ? "idle" : undefined;
                return (
                  <button key={index} type="button" className={styles.choice} data-state={state}
                    disabled={asking.solved !== null || asking.wrong.includes(index)} onClick={() => actions.answer(index)}>
                    {choice}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className={styles.controls}>
            {asking && asking.solved !== null ? (
              <button type="button" className="cta" onClick={actions.continueLesson}>Continuer</button>
            ) : null}
            {status === "playing" && !asking ? (
              <button type="button" className="btn-line" onClick={() => actions.setPaused(!paused)}>
                {paused ? <><PlayIcon /> Reprendre</> : <><PauseIcon /> Pause</>}
              </button>
            ) : null}
            {/* « Nouvelle question » during the explanation is in the top bar: not repeated here. */}

            {status === "done" ? (
              <>
                <QuestionInput placeholder="Une autre question ?" onSubmit={actions.ask} onListeningChange={actions.setListening} submitLabel="Demander" />
                {canReplay ? <button type="button" className="btn-line" onClick={actions.replay}><PlayIcon /> Revoir l&apos;explication</button> : null}
                <button type="button" className="btn-line" onClick={actions.newTopic}>Nouvelle notion</button>
              </>
            ) : null}

            {status === "error" ? (
              <>
                <button type="button" className="cta" onClick={actions.retry}>Réessayer</button>
                <button type="button" className="btn-line" onClick={actions.newTopic}>Autre question</button>
              </>
            ) : null}
          </div>
        </div>
      </section>
    );
  },
);

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
