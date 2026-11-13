"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { playNesalioStream } from "@/engine/nesalioPlayback";
import { INITIAL_SESSION, NesalioSession, type SessionDeps } from "@/engine/nesalioSession";
import { openNesalioStream } from "@/services/nesalio/stream";
import { ACCOUNT_READY } from "@/services/trialEvents";
import { openNesalioClip } from "@/services/voice/nesalioClip";
import type { ManimRenderer } from "./board/manim/ManimRenderer";
import { AfterTrialQuestions } from "./AfterTrial";
import { FeedbackButton } from "./Feedback";
import { NesalioDock, type NesalioDockActions } from "./NesalioDock";
import { StartScreen } from "./StartScreen";
import { TopBar } from "./TopBar";
import { TrialGateProvider, useTrialAccess } from "./TrialGate";
import boardStyles from "./board/ManimBoard.module.css";

const TOP_BAR = 60;
/** Left on a finished lesson this long (no replay, no new question), the after-trial questions open. */
const AFTER_TRIAL_DELAY = 60_000;
/**
 * Questions suggested on the start screen: within what Nesa explains (maths and chemistry, sec 4-5).
 * The former tutor's list offered « la portée d'un projectile » (physics), seen in the real trial of 2026-11-09.
 */
const NESALIO_SUGGESTIONS = [
  "Comment je trouve les zéros de f(x) = −(x − 2)² + 3 ?",
  "C'est quoi le réactif limitant, avec un exemple ?",
  "Comment on utilise PV = nRT pour trouver une pression ?",
] as const;
/** The lesson's design frame (16:9), as on /dev/nesalio: the engine's camera works in it. */
const VIEWPORT = { x0: -8, y0: -4.5, x1: 8, y1: 4.5 };

/** The board: one renderer per explanation, loaded on demand (WebGL, browser only). */
function createBoard(host: () => HTMLElement | null) {
  let renderer: ManimRenderer | null = null;
  let loading: Promise<typeof import("./board/manim/ManimRenderer")> | null = null;
  const load = () =>
    (loading ??= (async () => {
      // Handwritten labels use Caveat: the fonts are waited for before anything is measured.
      await Promise.allSettled([document.fonts.load('700 40px "Caveat"'), document.fonts.load('400 20px "Atkinson Hyperlegible"')]);
      return import("./board/manim/ManimRenderer");
    })());
  return {
    load,
    async ensure(): Promise<ManimRenderer> {
      const { ManimRenderer } = await load();
      const element = host();
      if (!element) throw new Error("Tableau indisponible.");
      // biome-ignore lint/suspicious/noAssignInExpressions: un seul tableau, créé à la première demande
      return (renderer ??= new ManimRenderer(element));
    },
    current: () => renderer,
    reset() {
      renderer?.dispose();
      renderer = null;
    },
  };
}

/**
 * Page élève avec Nesalio : l'élève pose sa question, Nesa l'explique au
 * tableau avec sa voix (format v3.3). Sans compte, l'essai borné de main
 * (TrialGate) s'applique : chaque leçon passe par trial.run, la connexion
 * se fait sur place et la leçon demandée part ensuite.
 */
export function NesalioApp() {
  return (
    <TrialGateProvider>
      <NesalioScreen />
    </TrialGateProvider>
  );
}

function NesalioScreen() {
  const trial = useTrialAccess();
  const host = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLElement>(null);
  const [listening, setListening] = useState(false);
  const [dockHeight, setDockHeight] = useState(0);
  const [failed, setFailed] = useState(false);

  const [{ session, board }] = useState(() => {
    const board = createBoard(() => host.current);
    const deps: SessionDeps = {
      open: (question, signal) => openNesalioStream(question, signal),
      async play(header, slices, options) {
        let renderer: ManimRenderer;
        try {
          renderer = await board.ensure();
        } catch (error) {
          setFailed(true);
          throw error;
        }
        const projection = renderer.nesalioProjection();
        await playNesalioStream(header, slices, {
          ...options,
          viewport: VIEWPORT,
          openClip: openNesalioClip,
          prepareSlice: (slice, signal, math, values) => projection.prepareSlice(slice, signal, math, values),
          measure: projection.measure,
          onFrame: (frame, beat) => options.onFrame(frame, beat),
          afterSlice: options.afterSlice,
        });
      },
      board: { reset: () => board.reset(), draw: (frame) => board.current()?.drawNesalio(frame) },
    };
    return { session: new NesalioSession(deps), board };
  });

  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, () => INITIAL_SESSION);
  const idle = snapshot.status === "idle";

  // Loads the board while the student types, and frees it when the page closes.
  useEffect(() => {
    void board.load().catch(() => setFailed(true));
    return () => session.stop();
  }, [board, session]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: le dock change d'élément avec `idle` ; il faut l'observer de nouveau.
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

  // Opening the account panel pauses the lesson; signing in resumes it (as the tutor did on main).
  useEffect(() => {
    if (trial.accountOpen && session.getSnapshot().status === "playing") session.setPaused(true);
  }, [trial.accountOpen, session]);
  useEffect(() => {
    const resume = () => {
      if (session.getSnapshot().status === "playing") session.setPaused(false);
    };
    window.addEventListener(ACCOUNT_READY, resume);
    return () => window.removeEventListener(ACCOUNT_READY, resume);
  }, [session]);

  const ask = useCallback(
    (question: string) =>
      trial.run(() => {
        void session.ask(question);
      }),
    [session, trial.run],
  );
  const actions = useMemo<NesalioDockActions>(
    () => ({
      ask,
      replay: () => void session.replay(),
      retry: () => {
        const question = session.getSnapshot().question;
        if (question) ask(question);
      },
      setPaused: (paused) => session.setPaused(paused),
      answer: (choice) => session.answer(choice),
      continueLesson: () => session.continueLesson(),
      seek: (index) => void session.seek(index),
      newTopic: () => {
        trial.cancelPending();
        setListening(false);
        session.stop();
      },
      setListening: (value) => {
        // Speaking during the explanation pauses Nesa's voice.
        if (value && session.getSnapshot().status === "playing") session.setPaused(true);
        setListening(value);
      },
    }),
    [ask, session, trial.cancelPending],
  );

  return (
    <main style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      <div className={boardStyles.wrap}>
        <div
          ref={host}
          className={boardStyles.board}
          aria-label="Tableau de Nesa"
          role="img"
          style={{ top: TOP_BAR, bottom: idle ? 0 : dockHeight + 24, height: "auto", cursor: "default" }}
        />
        {failed ? (
          <p className={boardStyles.failed}>Ton navigateur ne peut pas afficher le tableau (WebGL désactivé). Essaie avec Chrome, Edge ou Safari à jour.</p>
        ) : null}
      </div>
      <TopBar
        title={snapshot.title}
        topic={null}
        demo={false}
        muted={snapshot.muted}
        onToggleMute={() => session.setMuted(!snapshot.muted)}
        onHome={idle ? null : actions.newTopic}
        feedback={<FeedbackButton player={session} />}
      />
      {/* Never over Nesa's card right after the lesson: « Revoir l'explication » stays reachable. */}
      {trial.authenticated || !trial.enabled ? (
        <AfterTrialQuestions
          sessionDone={snapshot.status === "done"}
          atHome={idle && snapshot.lastFinished !== null}
          delayMs={AFTER_TRIAL_DELAY}
          question={snapshot.question ?? snapshot.lastFinished}
        />
      ) : null}
      {idle ? (
        <StartScreen
          onAsk={ask}
          listening={listening}
          onListeningChange={setListening}
          suggestions={NESALIO_SUGGESTIONS}
          lede="Écris ta question, ajoute une photo d'exercice ou de cours, ou parle à Nesa."
        />
      ) : (
        <NesalioDock ref={dockRef} snapshot={snapshot} listening={listening} actions={actions} />
      )}
    </main>
  );
}
