"use client";

import { useEffect, useMemo, useState } from "react";
import { emptyBoard } from "@/domain/board/state";
import { applyAction } from "@/domain/scene/commands";
import type { Action } from "@/domain/scene/schema";
import { scales } from "@/domain/board/layout";
import { ManimBoard } from "@/ui/board/ManimBoard";
import { Conversation, MicIcon, KeyboardIcon, voiceActive } from "./Conversation";
import timing from "./communication-timing.json";
import { TopBar } from "@/ui/TopBar";
import { fitView } from "@/ui/board/manim/camera";

const noop = () => {};
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

/** Version scénarisée de la démo existante, pour le pitch de douze secondes. */
export function VideoFrame() {
  const [index, setIndex] = useState(0);
  const [readyIndex, setReadyIndex] = useState(-1);
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setReadyIndex(index));
    });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [index]);
  const time = index / 15;
  const diagnosis = time >= 1 && time < 3;
  const verifying = time >= 8 && time < 9.8;
  const answered = time >= 9.8;
  const confirmed = time >= 10.95;
  const progress = clamp((time - 3.1) / 2.1);
  const verticalProgress = clamp((time - 3.7) / 1.5);
  const heightProgress = clamp((time - 4.6) / 1.3);
  const board = useMemo(() => {
    let state = emptyBoard();
    const draw = (action: Action) => { state = applyAction(state, action, { start: index + 1, duration: 0 }); };
    draw({ type: "axes", ...frame, xLabel: "x", yLabel: "y" });
    draw({ type: "point", id: "sommet", at: [2, 3], color: "violet", ring: true });
    if (progress > 0) draw({ type: "curve", id: "parabole", fn: "-(x-2)^2+3",
      from: 2 - 2 * progress, to: 2 + 2 * progress, color: "blue" });
    if (verticalProgress > 0) draw({ type: "segment", id: "position", from: [2, 0.12],
      to: [2, 0.12 + 2.88 * verticalProgress], color: "violet", dashed: true });
    if (heightProgress > 0) draw({ type: "segment", id: "maximum", from: [0.12, 3],
      to: [0.12 + 1.88 * heightProgress, 3], color: "green", dashed: true });
    draw({ type: "focus", ...frame });
    state.camera = { kind: "fit", ...frame, at: 0, duration: 0 };
    state.restoredAt = index + 1;
    return state;
  }, [index, progress, verticalProgress, heightProgress]);
  const oralStudent = timing.utterances.find((item) => item.speaker === "joyce");
  const studentActive = voiceActive(oralStudent, time);
  const typing = time >= 9.8 && time < 10.85;
  const vertex = at(2, 3);
  const xAxis = at(2, 0);
  const yAxis = at(0, 3);
  const pulse = time >= 4.8 && time < 7 ? 1 + 0.08 * Math.sin(time * Math.PI * 2) : 1;
  const stage = confirmed ? "success" : answered ? "answered" : verifying ? "verify" : diagnosis ? "diagnosis" : "lesson";
  return <>
    <div className="video-frame" data-stage={stage}>
      <main style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
        <ManimBoard board={board} insets={insets}/>
        <TopBar title="Tracer" topic={null} demo={false} muted={false} onToggleMute={noop} onHome={noop}
          feedback={<span className="joyce-profile"><span className="joyce-avatar">J
            {studentActive ? <span className="profile-signal" aria-label="Microphone de Joyce actif"><MicIcon/></span>
              : typing ? <span className="profile-signal profile-keyboard" aria-label="Joyce écrit"><KeyboardIcon/></span> : null}
          </span>Joyce</span>}/>
        <div className="formula">f(x) = −(x − 2)² + <span className={heightProgress > 0.6 ? "maximum" : ""}>3</span></div>
        <svg className="explanation" viewBox="0 0 1280 720" aria-label="Sommet (2, 3), position horizontale 2 et hauteur maximale 3">
          {diagnosis ? <rect x={vertex.x + 22} y={vertex.y - 42} width="21" height="30" rx="5" fill="#FFF3E7" stroke="#AD5B14" strokeWidth="1.5"/> : null}
          <text x={vertex.x + 20} y={vertex.y - 20} fontSize="26" fontFamily="Caveat" fill="#18223A">
            (<tspan fill={diagnosis ? "#AD5B14" : "#18223A"}>2</tspan>, <tspan fill={heightProgress > 0.6 ? "#23936A" : "#18223A"}>3</tspan>)
          </text>
          {verticalProgress > 0.8 ? <text x={xAxis.x} y={xAxis.y + 55} textAnchor="middle" fontSize="23" fontFamily="Caveat" fill="#5A45D6">x = 2</text> : null}
          {heightProgress > 0.6 ? <>
            <rect x={yAxis.x - 34} y={yAxis.y - 13} width="24" height="26" rx="5" fill="none" stroke="#23936A" strokeWidth="2"/>
            <text x={at(0.9, 3).x} y={vertex.y - 16} fontSize="23" fontFamily="Caveat" fill="#23936A">y = 3</text>
            <circle cx={vertex.x} cy={vertex.y} r={18 * pulse} fill="none" stroke="#23936A" strokeWidth="2" opacity="0.75"/>
          </> : null}
        </svg>
        <Conversation time={time} index={index}/>
        {confirmed ? <div className="confirmation">✓ Bonne réponse</div> : null}
      </main>
    </div>
    <div className="export-controls"><label>Image <input type="number" aria-label="Image" min="0" max="179" value={index} onChange={(event) => setIndex(Math.max(0, Math.min(179, Number(event.target.value))))}/></label><span>/ 179</span><span role="status">Image prête {readyIndex}</span><button onClick={() => setIndex(0)}>Recommencer</button></div>
  </>;
}
