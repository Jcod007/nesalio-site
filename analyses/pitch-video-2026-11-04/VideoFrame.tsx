"use client";

import { useMemo, useState } from "react";
import { emptyBoard } from "@/domain/board/state";
import { applyAction } from "@/domain/scene/commands";
import type { Action } from "@/domain/scene/schema";
import { scales } from "@/domain/board/layout";
import { INITIAL_SNAPSHOT } from "@/engine/player";
import { ManimBoard } from "@/ui/board/ManimBoard";
import { Dock, type DockActions } from "@/ui/Dock";
import { TopBar } from "@/ui/TopBar";
import { fitView } from "@/ui/board/manim/camera";

const noop = () => {};
const controls: DockActions = { interrupt: noop, resume: noop, followUp: noop,
  answer: noop, answerText: noop, retry: noop, newTopic: noop, setListening: noop };
const insets = { top: 100, right: 460, bottom: 45, left: 25 };
const frame = { x: [-1, 5] as [number, number], y: [-1.4, 4] as [number, number] };
const u = scales(frame).x;
const view = fitView({ x: 0, y: 0, width: 6 * u + 0.6, height: 5.4 * u + 0.6 },
  { width: 1280, height: 720, insets }, 0.85);
function at(x: number, y: number) {
  return { x: 640 + ((x - 2) * u - view.cx) * view.s,
    y: 360 - ((y - 1.3) * u - view.cy) * view.s };
}
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Timeline de démonstration préparée pour le pitch, rendue avec les composants du produit. */
export function VideoFrame() {
  const [index, setIndex] = useState(0);
  const time = index / 15;
  const paused = time >= 2.5 && time < 4;
  const explaining = time >= 4;
  const initialProgress = clamp((time - 0.4) / 3);
  const responseProgress = clamp((time - 4) / 2);
  const lineProgress = clamp((time - 5.2) / 2.1);
  const arrowProgress = clamp((time - 4) / 1.2);
  const board = useMemo(() => {
    let state = emptyBoard();
    const draw = (action: Action) => { state = applyAction(state, action, { start: index + 1, duration: 0 }); };
    draw({ type: "axes", ...frame, xLabel: "x", yLabel: "y" });
    if (time >= 0.2) draw({ type: "point", id: "sommet", at: [2, 3], label: "(2, 3)", color: "violet", ring: true });
    if (time >= 0.4) {
      const right = explaining ? 3.4 + 0.6 * responseProgress : 2 + 1.4 * Math.min(initialProgress, 0.7) / 0.7;
      draw({ type: "curve", id: "droite", fn: "-(x-2)^2+3", from: 2, to: Math.max(2.001, right), color: "blue" });
    }
    if (explaining && responseProgress > 0) draw({ type: "curve", id: "gauche", fn: "-(x-2)^2+3",
      from: Math.min(1.999, 2 - 2 * responseProgress), to: 2, color: "blue" });
    if (lineProgress > 0) draw({ type: "segment", id: "axe_sym", from: [2, 0.12], to: [2, 0.12 + 2.88 * lineProgress], color: "violet", dashed: true });
    draw({ type: "focus", ...frame });
    state.camera = { kind: "fit", ...frame, at: 0, duration: 0 };
    state.restoredAt = index + 1;
    return state;
  }, [index, time, initialProgress, explaining, responseProgress, lineProgress]);
  const subtitle = explaining
    ? "Regarde, x moins deux vaut zéro pour x égal deux. Le sommet est donc là."
    : "Le sommet est en (2,\u00a03).";
  const snapshot = { ...INITIAL_SNAPSHOT, status: paused ? "paused" as const : "playing" as const,
    source: "demo" as const, board, caption: { text: subtitle, mood: "explique" as const, startedAt: -10000, durationMs: 1 } };
  const vertex = at(2, 3);
  const axis = at(2, 0);
  const pulse = explaining && time < 9.5 ? 1 + 0.12 * Math.sin(time * Math.PI * 3) : 1;
  return <>
    <div className="video-frame">
      <main style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
        <ManimBoard board={board} insets={insets}/>
        <TopBar title="Tracer" topic={null} demo={false} muted={false} onToggleMute={noop} onHome={noop}
          feedback={<span className="joyce-profile"><span className="joyce-avatar">J</span>Joyce</span>}/>
        <div className="formula">f(x) = −(<span className={explaining ? "violet" : ""}>x − 2</span>)² + 3</div>
        {explaining ? <svg className="explanation" viewBox="0 0 1280 720" aria-label="La parenthèse s’annule pour x égal deux">
          <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 Z" fill="#5A45D6"/></marker></defs>
          <path d={`M 345 53 C 580 100, 700 240, ${axis.x + 8} ${axis.y - 12}`}
            fill="none" stroke="#5A45D6" strokeWidth="2.4" markerEnd="url(#arrow)"
            pathLength="1" strokeDasharray="1" strokeDashoffset={1 - arrowProgress}/>
          <rect x="535" y="108" width="172" height="84" rx="13" fill="#fff" stroke="#5A45D6" strokeWidth="1.8" opacity={arrowProgress}/>
          <text x="621" y="141" textAnchor="middle" fontSize="23" fill="#4532B8" fontWeight="700" opacity={arrowProgress}>x − 2 = 0</text>
          <text x="621" y="174" textAnchor="middle" fontSize="23" fill="#4532B8" fontWeight="700" opacity={arrowProgress}>x = 2</text>
          <circle cx={vertex.x} cy={vertex.y} r={19 * pulse} stroke="#5A45D6" strokeWidth="2.2" fill="none" opacity="0.75"/>
        </svg> : null}
        {time >= 2.25 && time < 2.65 ? <svg className="explanation" viewBox="0 0 1280 720" aria-label="Joyce interrompt Nesa">
          {time >= 2.5 ? <circle cx="904" cy="355" r="17" fill="#5A45D6" opacity="0.2"/> : null}
          <path d="M900 350 L900 375 L907 367 L913 380 L919 377 L913 364 L924 364 Z" fill="white" stroke="#18223A" strokeWidth="2"/>
        </svg> : null}
        <Dock snapshot={snapshot} lastAsked={time >= 2.5 ? "Attends, pourquoi 2 ?" : null} listening={false} actions={controls}/>
        {paused ? <div className="pause-label">Ⅱ Nesa en pause</div> : null}
      </main>
    </div>
    <div className="export-controls"><label>Image <input type="number" aria-label="Image" min="0" max="149" value={index} onChange={(event) => setIndex(Math.max(0, Math.min(149, Number(event.target.value))))}/></label><span>/ 149</span><button onClick={() => setIndex((value) => Math.min(149, value + 1))}>Image suivante</button><button onClick={() => setIndex(0)}>Recommencer</button></div>
  </>;
}
