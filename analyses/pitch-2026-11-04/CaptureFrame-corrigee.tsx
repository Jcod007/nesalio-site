"use client";

import { useMemo } from "react";
import { emptyBoard } from "@/domain/board/state";
import { applyAction } from "@/domain/scene/commands";
import type { Action, StreamEvent } from "@/domain/scene/schema";
import { INITIAL_SNAPSHOT } from "@/engine/player";
import { ManimBoard } from "@/ui/board/ManimBoard";
import { Dock, type DockActions } from "@/ui/Dock";
import { TopBar } from "@/ui/TopBar";

interface Props { initial: StreamEvent[]; followup: StreamEvent[]; message: string; }
const noop = () => {};
const controls: DockActions = { interrupt: noop, resume: noop, followUp: noop, answer: noop,
  answerText: noop, retry: noop, newTopic: noop, setListening: noop };

/** Rejeu de la réponse enregistrée, composé pour la projection. */
export function CaptureFrame({ initial, followup, message }: Props) {
  const step = followup.find((event) => event.kind === "step");
  const board = useMemo(() => {
    let state = emptyBoard();
    const initialSteps = initial.filter((event) => event.kind === "step").slice(0, 3);
    const actions = [...initialSteps.flatMap((event) => event.do), ...(step?.kind === "step" ? step.do : [])];
    const apply = (action: Action) => { state = applyAction(state, action, { start: 0, duration: 0 }); };
    for (const action of actions) {
      if (action.type === "axes") {
        apply({ ...action, y: [-1.4, 4] });
      } else if (action.type === "segment" && action.id === "axe_sym") {
        // Laisser une interruption autour de la graduation 2, sous l'axe horizontal.
        apply({ ...action, from: [2, -0.12], to: [2, 4] });
        apply({ ...action, id: "axe_sym_bas", from: [2, -1.4], to: [2, -0.6] });
      } else if (action.type === "curve") {
        // Fenêtre montrant le sommet et les deux zéros, avec les mêmes données mathématiques.
        apply({ ...action, from: 0, to: 4 });
      } else {
        apply(action);
      }
    }
    return state;
  }, [initial, step]);
  const snapshot = { ...INITIAL_SNAPSHOT, status: "playing" as const, source: "model" as const,
    title: "Les zéros d’une parabole", topic: "Fonctions · sec 4", board,
    caption: { text: step?.kind === "step" ? step.say.replace("(2, 3)", "(2,\u00a03)").replace(/f\(x\)=−\(x−2\)²\+3/g,
      (formula) => formula.split("").join("\u2060")) : "", mood: "explique" as const, startedAt: -10000, durationMs: 1 } };
  return <main style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
    <ManimBoard board={board} insets={{ top: 92, right: 475, bottom: 40, left: 28 }} />
    <TopBar title={snapshot.title} topic={snapshot.topic} demo={false} muted={false}
      onToggleMute={noop} onHome={noop}
      feedback={<span className="joyce-profile"><span className="joyce-avatar">J</span>Joyce</span>} />
    <Dock snapshot={snapshot} lastAsked={message} listening={false} actions={controls} />
  </main>;
}
