"use client";

import type { CSSProperties } from "react";
import { Nesa } from "@/ui/Nesa";
import styles from "@/ui/Dock.module.css";
import timing from "./communication-timing.json";

const noop = () => {};
export interface Utterance {
  id: number;
  speaker: string;
  start: number;
  end: number;
  activeStart: number;
  activeEnd: number;
  tokens: Array<{ text: string; from: number }>;
}

export function voiceActive(utterance: Utterance | undefined, time: number) {
  return !!utterance && time >= utterance.activeStart && time < utterance.activeEnd;
}

export function MicIcon() {
  return <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <rect x="7" y="2" width="6" height="10" rx="3"/><path d="M4 9a6 6 0 0 0 12 0M10 15v3M7 18h6"/>
  </svg>;
}

export function KeyboardIcon() {
  return <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    <rect x="2" y="4" width="16" height="12" rx="2"/><path d="M5 7h1m3 0h1m3 0h1M5 10h1m3 0h1m3 0h1M6 13h8"/>
  </svg>;
}

function SpeakerIcon() {
  return <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <path d="M2 8h3l4-4v12l-4-4H2zM12 7a4 4 0 0 1 0 6M15 4a8 8 0 0 1 0 12"/>
  </svg>;
}

function PencilIcon() {
  return <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    <path d="m4 12 8-8 4 4-8 8-5 1zM11 5l4 4"/>
  </svg>;
}

function Waves({ time, level }: { time: number; level: number }) {
  return <span className="voice-waves" aria-label="Voix active">
    {[0, 1, 2].map((bar) => <i key={bar} style={{ height: 3 + level * (5 + 6 * Math.abs(Math.sin(time * 18 + bar * 1.7))) }}/>) }
  </span>;
}

function Transcription({ utterance, time }: { utterance: Utterance; time: number }) {
  return <>{utterance.tokens.map((token, index) => <span key={index}
    aria-hidden={time < token.from}
    style={{ visibility: time >= token.from ? "visible" : "hidden" }}>
    {index > 0 ? " " : ""}{token.text}
  </span>)}</>;
}

/** Présentation des seules modalités de la conversation, sans modifier la leçon. */
export function Conversation({ time, index }: { time: number; index: number }) {
  const oralStudent = timing.utterances.find((item) => item.speaker === "joyce");
  const teacher = timing.utterances.filter((item) => item.speaker === "nesalio" && time >= item.start).at(-1);
  const studentActive = voiceActive(oralStudent, time);
  const teacherActive = voiceActive(teacher, time);
  const typing = time >= 9.8 && time < 10.85;
  const writtenAnswer = time >= 9.8;
  const confirmation = time >= 10.95;
  const showStudent = writtenAnswer || (time >= 0.05 && time < 8);
  const answer = "Le maximum est 5 !";
  const typedLength = Math.min(answer.length, Math.floor(Math.max(0, time - 9.8) / 1.05 * answer.length) + 1);
  const level = timing.envelope[index] ?? 0;
  const cursorStyle: CSSProperties = { opacity: Math.floor(time * 6) % 2 === 0 ? 1 : 0.15 };

  return <section className={`${styles.dock} modality-dock`} aria-label="Conversation entre Joyce et Nesalio">
    {showStudent ? <div className={`${styles.asked} student-message`} data-mode={writtenAnswer ? "text" : "voice"}>
      <div className="message-byline">
        <strong>Joyce</strong>
        {writtenAnswer ? <><KeyboardIcon/><span>{typing ? "Écrit…" : "Message écrit"}</span></>
          : <>{studentActive ? <MicIcon/> : null}<span>Transcription vocale</span></>}
      </div>
      <p className="student-content">
        {writtenAnswer ? <>{answer.slice(0, typedLength)}{typing ? <span className="typing-caret" style={cursorStyle}>│</span> : null}</>
          : oralStudent ? <Transcription utterance={oralStudent} time={time}/> : null}
      </p>
    </div> : null}

    <div className={styles.card}>
      <div className={styles.row}>
        <Nesa state={teacherActive ? "parle" : confirmation ? "bravo" : "repos"} size={60} className={styles.nesa}/>
        <div className={styles.text}>
          <div className="message-byline teacher-byline">
            <strong>Nesalio</strong>
            {teacher ? <>{teacherActive ? <SpeakerIcon/> : null}<span>{teacherActive ? "Voix" : "Transcription vocale"}</span>
              {teacherActive ? <Waves time={time} level={level}/> : null}</>
              : <><PencilIcon/><span>Message écrit</span></>}
          </div>
          <p className={styles.caption} aria-live="polite">
            {teacher ? <Transcription utterance={teacher} time={time}/> : "Quel est le maximum de cette parabole ?"}
          </p>
          {time >= 8 && time < 9.8 ? <p className="written-note"><PencilIcon/><span>Note écrite · Même parabole, déplacée.</span></p> : null}
        </div>
      </div>
      <div className={styles.controls}>
        <button type="button" className="btn-line" onClick={noop}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M3 2h3v12H3zM10 2h3v12h-3z"/></svg>
          Attends, je comprends pas
        </button>
        <button type="button" className={`btn-line ${studentActive ? "microphone-on" : ""}`} aria-pressed={studentActive} onClick={noop}>
          <MicIcon/>{studentActive ? "Micro actif" : "Parler à Nesa"}
        </button>
      </div>
    </div>
  </section>;
}
