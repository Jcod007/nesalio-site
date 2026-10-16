"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MAX_QUESTION_LENGTH } from "@/domain/tutor/request";
import { createSpeechListener, type SpeechListener } from "@/services/voice/speechListener";
import styles from "./QuestionInput.module.css";

interface Props {
  placeholder: string;
  onSubmit(text: string): void;
  /** Appelé juste avant d'ouvrir le micro (pour faire taire Nesa). */
  onMicStart?(): void;
  onListeningChange?(listening: boolean): void;
  autoFocus?: boolean;
  size?: "large" | "normal";
  submitLabel?: string;
}

/** Champ de question : clavier ou micro. Au micro, la question part dès que l'élève a fini de parler. */
export function QuestionInput({
  placeholder,
  onSubmit,
  onMicStart,
  onListeningChange,
  autoFocus,
  size = "normal",
  submitLabel = "Envoyer",
}: Props) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const listener = useRef<SpeechListener | null>(null);
  const [micSupported, setMicSupported] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    listener.current = createSpeechListener("fr-CA");
    setMicSupported(listener.current.supported);
    return () => listener.current?.stop();
  }, []);

  useEffect(() => onListeningChange?.(listening), [listening, onListeningChange]);

  const submit = (value: string) => {
    const question = value.trim();
    if (!question) return;
    onSubmit(question.slice(0, MAX_QUESTION_LENGTH));
    setText("");
  };

  const toggleMic = () => {
    const mic = listener.current;
    if (!mic) return;
    if (listening) {
      mic.stop();
      return;
    }
    onMicStart?.();
    setMicError(null);
    setListening(true);
    let heard = "";
    mic.start({
      onText(value) {
        heard = value;
        setText(value);
      },
      onEnd() {
        setListening(false);
        if (heard.trim()) submit(heard);
      },
      onError(code) {
        setListening(false);
        setMicError(code === "not-allowed" ? "Autorise le micro pour parler à Nesa." : "Je n'ai pas bien entendu. Réessaie ?");
      },
    });
  };

  return (
    <form
      className={styles.form}
      data-size={size}
      onSubmit={(event) => {
        event.preventDefault();
        submit(text);
      }}
    >
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <div className={styles.field} data-listening={listening}>
        <input
          ref={inputRef}
          id={id}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={listening ? "Je t'écoute…" : placeholder}
          maxLength={MAX_QUESTION_LENGTH}
          autoFocus={autoFocus}
          autoComplete="off"
          enterKeyHint="send"
        />
        {micSupported ? (
          <button
            type="button"
            className={styles.mic}
            onClick={toggleMic}
            aria-pressed={listening}
            aria-label={listening ? "Arrêter le micro" : "Poser ma question à voix haute"}
          >
            <MicIcon />
            {listening ? <span className={styles.wave} aria-hidden="true" /> : null}
          </button>
        ) : null}
      </div>
      <button type="submit" className="cta" disabled={!text.trim()}>
        {submitLabel}
      </button>
      {micError ? <p className={styles.error}>{micError}</p> : null}
    </form>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  );
}
