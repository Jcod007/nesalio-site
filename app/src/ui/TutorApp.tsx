"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ManimBoard } from "./board/ManimBoard";
import { DiagnosticTag } from "./board/DiagnosticTag";
import { Dock, type DockActions } from "./Dock";
import { useTutor } from "./hooks/useTutor";
import { StartScreen } from "./StartScreen";
import { AfterTrialQuestions } from "./AfterTrial";
import { FeedbackButton } from "./Feedback";
import { TopBar } from "./TopBar";
import { InspectionReplay } from "./InspectionReplay";
import inspectionStyles from "./TutorInspection.module.css";

const TOP_BAR = 60;
const WIDE = 900;

/**
 * Composition de l'écran : barre du haut, tableau infini (figure et calculs),
 * étiquette de diagnostic, et la carte de Nesa. Toute la logique de séance vit dans le
 * lecteur (engine/player.ts) ; ce composant ne fait que la brancher.
 */
export function TutorApp({ inspection = false, inspectionAvailable = false }: { inspection?: boolean; inspectionAvailable?: boolean }) {
  const { player, speaker, snapshot, clock, playback, inspectionHistory, setInspectionHistory } = useTutor(inspection);
  const [lastAsked, setLastAsked] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState(false);
  const [playbackPaused, setPlaybackPaused] = useState(false);
  const [review, setReview] = useState<{ index: number; run: number; play: boolean } | null>(null);
  const [reviewPaused, setReviewPaused] = useState(false);
  const dockRef = useRef<HTMLElement>(null);
  const [dockHeight, setDockHeight] = useState(0);
  const [viewport, setViewport] = useState({ width: 1200, height: 900 });
  const [tagBottom, setTagBottom] = useState(0);

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const idle = snapshot.status === "idle";
  const lastStep = inspectionHistory.length - 1;
  const selectedStep = review?.index ?? lastStep;
  const activeInspection = inspectionHistory[selectedStep];

  const pausePlayback = useCallback((paused: boolean) => {
    playback?.setPaused(paused);
    speaker.setPaused(paused);
    setPlaybackPaused(paused);
  }, [playback, speaker]);

  const selectInspection = (index: number, play: boolean) => {
    if (listening || !inspectionHistory[index]) return;
    if (!review && !playbackPaused && ["thinking", "playing", "checking"].includes(snapshot.status)) pausePlayback(true);
    setReviewPaused(false);
    setReview((previous) => ({ index, play, run: (previous?.run ?? 0) + 1 }));
  };

  useEffect(() => {
    speaker.setMuted(muted || listening);
  }, [speaker, muted, listening]);

  useEffect(() => {
    const dock = dockRef.current;
    if (!dock) {
      setDockHeight(0);
      return;
    }
    const observer = new ResizeObserver(() => setDockHeight(dock.getBoundingClientRect().height));
    observer.observe(dock);
    return () => observer.disconnect();
  }, [idle]);

  const ask = useCallback(
    (question: string) => {
      setLastAsked(question);
      setInspectionHistory([]);
      setReview(null);
      player.ask(question);
    },
    [player, setInspectionHistory],
  );

  const actions = useMemo<DockActions>(
    () => ({
      interrupt: () => player.interrupt(),
      resume: () => player.resume(),
      followUp: (text) => {
        setLastAsked(text);
        player.followUp(text);
      },
      answer: (choice) => player.answer(choice),
      answerText: (text) => player.answerText(text),
      retry: () => {
        const question = player.getSnapshot().question;
        if (question) ask(question);
      },
      newTopic: () => {
        setLastAsked(null);
        setListening(false);
        player.stop();
        setInspectionHistory([]);
        setReview(null);
        pausePlayback(false);
      },
      setListening: (value) => {
        // Parler à Nesa pendant qu'elle explique, c'est l'interrompre ; pendant une question, c'est répondre.
        if (value && player.getSnapshot().status !== "checking") player.interrupt();
        setListening(value);
      },
    }),
    [player, ask, setInspectionHistory, pausePlayback],
  );

  const wide = viewport.width >= WIDE;
  const inspect = inspection && !idle;
  const panelWidth = Math.min(560, Math.floor(viewport.width * 0.44));
  const panelHeight = Math.min(viewport.height * 0.32, 280);
  const dockBottom = idle ? 16 : dockHeight + 36;
  // Les calculs sont dans la scène : seule l'étiquette de diagnostic réserve un peu de place en haut.
  const hasTag = snapshot.board.tag !== null;
  const insets = useMemo(
    () => ({
      top: hasTag ? Math.max(TOP_BAR + 12, tagBottom + 8) : TOP_BAR + 12,
      right: inspect && wide ? panelWidth + 28 : 16,
      bottom: inspect && !wide ? dockBottom + panelHeight + 12 : dockBottom,
      left: 16,
    }),
    [hasTag, inspect, wide, panelWidth, panelHeight, dockBottom, tagBottom],
  );

  return (
    <main style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      <div style={{ visibility: review ? "hidden" : undefined }} aria-hidden={review ? true : undefined}>
        <ManimBoard board={snapshot.board} insets={insets} clock={clock} paused={playbackPaused} />
        <DiagnosticTag board={snapshot.board} compact={!wide} onBottomChange={setTagBottom} clock={clock} paused={playbackPaused} />
      </div>
      {review && activeInspection ? (
        <InspectionReplay key={review.run} entry={activeInspection} insets={insets} play={review.play} paused={reviewPaused} muted={muted} liveSpeaker={speaker} />
      ) : null}
      <TopBar
        title={snapshot.title}
        topic={snapshot.topic}
        demo={snapshot.source === "demo"}
        muted={muted}
        onToggleMute={() => setMuted((value) => !value)}
        onHome={idle ? null : actions.newTopic}
        feedback={<FeedbackButton player={player} />}
      />
      <AfterTrialQuestions sessionDone={!inspection && snapshot.status === "done" && snapshot.summary.length > 0} question={snapshot.question} />
      {inspect ? (
        <aside aria-label="Inspection du JSON" className={inspectionStyles.panel} style={{ bottom: dockBottom, width: wide ? panelWidth : undefined }}>
          <div className={inspectionStyles.heading}>
            <h2>{review ? `Étape ${selectedStep + 1} / ${lastStep + 1} · Rejeu`
              : activeInspection ? `Segment ${activeInspection.part} / ${activeInspection.parts} de l’étape` : "En attente d’une étape"}</h2>
            {review ? (
              <button type="button" className="btn-line" disabled={!review.play} onClick={() => setReviewPaused((value) => !value)}>
                {reviewPaused ? "Reprendre" : "Pause"}
              </button>
            ) : (
              <button type="button" className="btn-line" onClick={() => pausePlayback(!playbackPaused)}
                disabled={listening || snapshot.status === "done" || snapshot.status === "error" || snapshot.status === "paused"}>
                {playbackPaused ? "Reprendre" : "Pause"}
              </button>
            )}
          </div>
          {activeInspection ? (
            <div className={inspectionStyles.navigation}>
              <button type="button" className="btn-line" disabled={listening || selectedStep <= 0}
                onClick={() => selectInspection(selectedStep - 1, false)}>Étape précédente</button>
              <input type="range" aria-label="Choisir l’étape" aria-valuetext={`Étape ${selectedStep + 1} sur ${lastStep + 1}`}
                min={1} max={lastStep + 1} value={selectedStep + 1} disabled={listening || lastStep < 1}
                onChange={(event) => selectInspection(Number(event.target.value) - 1, false)} />
              <button type="button" className="btn-line" disabled={listening || selectedStep >= lastStep}
                onClick={() => selectInspection(selectedStep + 1, false)}>Étape suivante</button>
              <button type="button" className="btn-line" disabled={listening}
                onClick={() => selectInspection(selectedStep, true)}>Rejouer l’étape</button>
              {review ? <button type="button" className="btn-line" onClick={() => setReview(null)}>Retour au direct</button> : null}
            </div>
          ) : null}
          <div className={inspectionStyles.sources}>
            <section aria-labelledby="modele-brut">
              <h3 id="modele-brut">Modèle brut</h3>
              <pre tabIndex={0}>{activeInspection?.raw ?? (snapshot.source === "demo" ? "Séance de démonstration, sans sortie du modèle." : "Le texte brut de l’étape apparaîtra ici.")}</pre>
            </section>
            <section aria-labelledby="json-serveur">
              <h3 id="json-serveur">JSON traité par le serveur</h3>
              <pre tabIndex={0}>{activeInspection?.server ?? "L’étape envoyée au tableau apparaîtra ici."}</pre>
            </section>
          </div>
        </aside>
      ) : null}
      {idle ? (
        <StartScreen onAsk={ask} listening={listening} onListeningChange={setListening} inspection={inspectionAvailable ? inspection : undefined} />
      ) : (
        <div style={{ visibility: review ? "hidden" : undefined }} aria-hidden={review ? true : undefined}>
          <Dock ref={dockRef} snapshot={snapshot} lastAsked={lastAsked} listening={listening} actions={actions} clock={clock} playbackPaused={playbackPaused} />
        </div>
      )}
    </main>
  );
}
