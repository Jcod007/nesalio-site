"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ManimBoard } from "./board/ManimBoard";
import { DiagnosticTag } from "./board/DiagnosticTag";
import { Dock, type DockActions } from "./Dock";
import { useTutor } from "./hooks/useTutor";
import { StartScreen } from "./StartScreen";
import { TopBar } from "./TopBar";

const TOP_BAR = 60;
const WIDE = 900;

/**
 * Composition de l'écran : barre du haut, tableau infini (figure et calculs),
 * étiquette de diagnostic, et la carte de Nesa. Toute la logique de séance vit dans le
 * lecteur (engine/player.ts) ; ce composant ne fait que la brancher.
 */
export function TutorApp() {
  const { player, speaker, snapshot } = useTutor();
  const [lastAsked, setLastAsked] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState(false);
  const dockRef = useRef<HTMLElement>(null);
  const [dockHeight, setDockHeight] = useState(0);
  const [width, setWidth] = useState(1200);
  const [tagBottom, setTagBottom] = useState(0);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const idle = snapshot.status === "idle";

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
      player.ask(question);
    },
    [player],
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
        if (question) player.ask(question);
      },
      newTopic: () => {
        setLastAsked(null);
        player.stop();
      },
      setListening: (value) => {
        // Parler à Nesa pendant qu'elle explique, c'est l'interrompre ; pendant une question, c'est répondre.
        if (value && player.getSnapshot().status !== "checking") player.interrupt();
        setListening(value);
      },
    }),
    [player],
  );

  const wide = width >= WIDE;
  // Les calculs sont dans la scène : seule l'étiquette de diagnostic réserve un peu de place en haut.
  const hasTag = snapshot.board.tag !== null;
  const insets = useMemo(
    () => ({
      top: hasTag ? Math.max(TOP_BAR + 12, tagBottom + 8) : TOP_BAR + 12,
      right: 16,
      bottom: idle ? 16 : dockHeight + 36,
      left: 16,
    }),
    [hasTag, idle, dockHeight, tagBottom],
  );

  return (
    <main style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      <ManimBoard board={snapshot.board} insets={insets} />
      <DiagnosticTag board={snapshot.board} compact={!wide} onBottomChange={setTagBottom} />
      <TopBar
        title={snapshot.title}
        topic={snapshot.topic}
        demo={snapshot.source === "demo"}
        muted={muted}
        onToggleMute={() => {
          speaker.setMuted(!muted);
          setMuted(!muted);
        }}
        onHome={idle ? null : actions.newTopic}
      />
      {idle ? (
        <StartScreen onAsk={ask} listening={listening} onListeningChange={setListening} />
      ) : (
        <Dock ref={dockRef} snapshot={snapshot} lastAsked={lastAsked} listening={listening} actions={actions} />
      )}
    </main>
  );
}
