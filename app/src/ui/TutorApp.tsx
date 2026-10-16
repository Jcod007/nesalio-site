"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ManimBoard } from "./board/ManimBoard";
import { NotesColumn } from "./board/NotesColumn";
import { Dock, type DockActions } from "./Dock";
import { useTutor } from "./hooks/useTutor";
import { StartScreen } from "./StartScreen";
import { TopBar } from "./TopBar";

const TOP_BAR = 60;
const WIDE = 900;

/**
 * Composition de l'écran : barre du haut, tableau infini, colonne de
 * calculs, et la carte de Nesa. Toute la logique de séance vit dans le
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
  const [notesBottom, setNotesBottom] = useState(0);

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
      retry: () => {
        const question = player.getSnapshot().question;
        if (question) player.ask(question);
      },
      newTopic: () => {
        setLastAsked(null);
        player.stop();
      },
      setListening: (value) => {
        // Parler à Nesa pendant qu'elle explique, c'est l'interrompre.
        if (value) player.interrupt();
        setListening(value);
      },
    }),
    [player],
  );

  const wide = width >= WIDE;
  const hasNotes = snapshot.board.notes.length > 0 || snapshot.board.tag !== null;
  const insets = useMemo(
    () => ({
      top: wide || !hasNotes ? TOP_BAR + 12 : Math.max(TOP_BAR + 12, notesBottom + 8),
      right: wide && hasNotes ? 330 : 16,
      bottom: idle ? 16 : dockHeight + 36,
      left: 16,
    }),
    [wide, hasNotes, idle, dockHeight, notesBottom],
  );

  return (
    <main style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      <ManimBoard board={snapshot.board} insets={insets} />
      <NotesColumn board={snapshot.board} compact={!wide} onHeightChange={setNotesBottom} />
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
