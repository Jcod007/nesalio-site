"use client";

import { useMemo, useState } from "react";
import { quadraticLesson } from "@/content/demoLessons";
import { emptyBoard } from "@/domain/board/state";
import { applyAction } from "@/domain/scene/commands";
import { INITIAL_SNAPSHOT, type PlayerSnapshot } from "@/engine/player";
import { ManimBoard } from "@/ui/board/ManimBoard";
import { DiagnosticTag } from "@/ui/board/DiagnosticTag";
import { Dock, type DockActions } from "@/ui/Dock";
import { TopBar } from "@/ui/TopBar";

// Arrêt sur image de la séance déjà livrée dans demoLessons.ts.
// Aucun appel à un modèle, aucun compte créé et aucune donnée d'élève.
export function PitchFrame() {
  const [paused, setPaused] = useState(false);
  const board = useMemo(() => {
    let state = emptyBoard();
    for (const step of quadraticLesson.steps.slice(0, 10)) {
      for (const action of step.do) state = applyAction(state, action, { start: 0, duration: 0 });
    }
    return state;
  }, []);
  const snapshot: PlayerSnapshot = {
    ...INITIAL_SNAPSHOT,
    status: paused ? "paused" : "playing",
    source: "demo",
    board,
    title: quadraticLesson.header.title,
    topic: quadraticLesson.header.topic ?? null,
    question: "Comment je trouve les zéros de f(x) = −(x − 2)² + 3 ?",
    caption: {
      text: "Ce sont exactement les points où la courbe coupe l’axe des x. Pour les trouver, on pose f(x) = 0.",
      mood: "dessine", startedAt: -10000, durationMs: 1,
    },
  };
  const actions: DockActions = {
    interrupt: () => setPaused(true), resume: () => setPaused(false),
    followUp: () => setPaused(false), answer: () => {}, answerText: () => {},
    retry: () => setPaused(false), newTopic: () => setPaused(false), setListening: () => {},
  };
  return <main style={{ position:"fixed", inset:0, overflow:"hidden" }}>
    <ManimBoard board={board} insets={{top:125,right:24,bottom:205,left:24}} />
    <DiagnosticTag board={board} compact={false} />
    <TopBar title={snapshot.title} topic={snapshot.topic} demo={true} muted={false} onToggleMute={() => {}} onHome={() => setPaused(false)} />
    <Dock snapshot={snapshot} lastAsked={snapshot.question} listening={false} actions={actions} />
  </main>;
}
