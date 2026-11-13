"use client";

import { forwardRef, useEffect, useState } from "react";
import type { SessionSnapshot } from "@/engine/nesalioSession";
import { CreditCode } from "./CreditCode";
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
  /** Back (or forward) to a passage already received. */
  seek(index: number): void;
  newTopic(): void;
  setListening(listening: boolean): void;
}

function nesaState({ status, paused, waiting, asking, resting }: SessionSnapshot, listening: boolean): NesaState {
  if (listening) return "ecoute";
  if (resting) return "repos";
  // A question on screen: Nesa waits for the answer, then is pleased with a right one.
  if (asking) return asking.right ? "content" : "repos";
  if (status === "preparing" || waiting) return "reflechit";
  if (status === "playing") return paused ? "repos" : "parle";
  return status === "done" ? "content" : "repos";
}

/**
 * La carte de Nesa pendant une explication Nesalio : la phrase dite, la pause,
 * l'avancement (un cran par phrase, pour revenir en arrière), l'arrêt en fin de
 * tranche (« Continuer ») et à la fin une autre question, « Revoir l'explication » ou une nouvelle notion.
 */
export const NesalioDock = forwardRef<HTMLElement, { snapshot: SessionSnapshot; listening: boolean; actions: NesalioDockActions }>(function NesalioDock(
  { snapshot, listening, actions },
  ref,
) {
  const { status, caption, paused, waiting, error, errorCode, question, canReplay, asking, resting, steps, position } = snapshot;
  // The day's questions are used up: the code field is offered here, and asking again only makes sense once a code is in.
  const limited = status === "error" && errorCode === "daily_limit";
  const [redeemed, setRedeemed] = useState(false);
  useEffect(() => {
    if (!limited) setRedeemed(false);
  }, [limited]);
  const tracked = (status === "playing" || status === "done") && steps.length > 1;
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
                {asking.feedback ? (
                  <p className={styles.notice} data-right={asking.right === true}>
                    {asking.feedback}
                  </p>
                ) : null}
              </>
            ) : status === "preparing" ? (
              <p className={styles.caption}>
                Je prépare l&apos;explication
                <span className={styles.dots} aria-hidden="true" />
              </p>
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
                {resting ? (
                  <p className={styles.notice} data-right="true">
                    Prends le temps de lire le tableau.
                  </p>
                ) : paused ? (
                  <p className={styles.notice}>En pause.</p>
                ) : null}
                {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: points d'attente, nommés pour les lecteurs d'écran */}
                {waiting && !paused && !resting ? <span className={styles.dots} aria-label="Nesa écrit la suite" /> : null}
              </>
            )}
          </div>
        </div>

        {asking ? (
          // biome-ignore lint/a11y/useSemanticElements: groupe de boutons de réponse, pas un formulaire
          <div className={styles.choices} role="group" aria-label="Choisis ta réponse">
            {asking.choices.map((choice, index) => {
              const state = asking.solved === index ? "right" : asking.wrong.includes(index) ? "wrong" : asking.solved !== null ? "idle" : undefined;
              return (
                <button
                  // biome-ignore lint/suspicious/noArrayIndexKey: les choix d'une question ne changent pas d'ordre
                  key={index}
                  type="button"
                  className={styles.choice}
                  data-state={state}
                  disabled={asking.solved !== null || asking.wrong.includes(index)}
                  onClick={() => actions.answer(index)}
                >
                  {choice}
                </button>
              );
            })}
          </div>
        ) : null}

        {limited ? <CreditCode variant="limit" onRedeemed={() => setRedeemed(true)} /> : null}
        {tracked ? <LessonTrack steps={steps} position={position} onSeek={actions.seek} /> : null}

        <div className={styles.controls}>
          {(asking && asking.solved !== null) || resting ? (
            <button type="button" className="cta" onClick={actions.continueLesson}>
              Continuer
            </button>
          ) : null}
          {tracked && status === "playing" ? (
            <button type="button" className="btn-line" disabled={!position} onClick={() => actions.seek((position ?? 0) - 1)}>
              <BackIcon /> Phrase précédente
            </button>
          ) : null}
          {status === "playing" && !asking && !resting ? (
            <button type="button" className="btn-line" onClick={() => actions.setPaused(!paused)}>
              {paused ? (
                <>
                  <PlayIcon /> Reprendre
                </>
              ) : (
                <>
                  <PauseIcon /> Pause
                </>
              )}
            </button>
          ) : null}
          {/* « Nouvelle question » during the explanation is in the top bar: not repeated here. */}

          {status === "done" ? (
            <>
              <QuestionInput placeholder="Une autre question ?" onSubmit={actions.ask} onListeningChange={actions.setListening} submitLabel="Demander" />
              {canReplay ? (
                <button type="button" className="btn-line" onClick={actions.replay}>
                  <PlayIcon /> Revoir l&apos;explication
                </button>
              ) : null}
              <button type="button" className="btn-line" onClick={actions.newTopic}>
                Nouvelle notion
              </button>
            </>
          ) : null}

          {status === "error" ? (
            <>
              {!limited || redeemed ? (
                <button type="button" className="cta" onClick={actions.retry}>
                  {redeemed ? "Poser ma question" : "Réessayer"}
                </button>
              ) : null}
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

/**
 * L'avancement de l'explication : un cran par phrase de Nesa, regroupés par tranche. Un cran déjà reçu ramène le
 * tableau et la voix à cette phrase (retour d'atelier du 2026-11-12 : pouvoir revenir en arrière).
 */
function LessonTrack({ steps, position, onSeek }: { steps: readonly string[]; position: number | null; onSeek(index: number): void }) {
  const tranches: number[][] = [];
  steps.forEach((slice, index) => {
    if (index > 0 && steps[index - 1] === slice) tranches.at(-1)!.push(index);
    else tranches.push([index]);
  });
  const at = position ?? -1;
  return (
    // biome-ignore lint/a11y/useSemanticElements: groupe de boutons de navigation, pas un formulaire
    <div className={styles.track} role="group" aria-label="Avancement de l'explication">
      {tranches.map((passages) => (
        <span key={passages[0]} className={styles.tranche}>
          {passages.map((index) => (
            <button
              key={index}
              type="button"
              className={styles.step}
              data-state={index < at ? "heard" : index === at ? "current" : "ahead"}
              aria-current={index === at ? "step" : undefined}
              aria-label={`Phrase ${index + 1} sur ${steps.length}`}
              title={index === at ? "Réécouter cette phrase" : "Aller à cette phrase"}
              onClick={() => onSeek(index)}
            />
          ))}
        </span>
      ))}
    </div>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M11 5v14l-9-7zM21 5v14l-9-7z" fill="currentColor" />
    </svg>
  );
}

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
