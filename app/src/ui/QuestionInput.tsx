"use client";

import { useEffect, useId, useState } from "react";
import { MAX_QUESTION_LENGTH } from "@/domain/tutor/request";
import { useVoiceInput } from "./hooks/useVoiceInput";
import { MicButton } from "./MicButton";
import styles from "./QuestionInput.module.css";

interface Props {
  placeholder: string;
  onSubmit(text: string): void;
  onListeningChange?(listening: boolean): void;
  autoFocus?: boolean;
  size?: "large" | "normal";
  submitLabel?: string;
}

/** Champ de question : clavier ou micro. Au micro, la question part dès que l'élève a fini de parler. */
export function QuestionInput({ placeholder, onSubmit, onListeningChange, autoFocus, size = "normal", submitLabel = "Envoyer" }: Props) {
  const [text, setText] = useState("");
  const voice = useVoiceInput((state) => onListeningChange?.(state !== "idle"));
  const id = useId();

  // Pendant la reconnaissance du navigateur, le texte apparaît au fur et à mesure.
  useEffect(() => {
    if (voice.partial) setText(voice.partial);
  }, [voice.partial]);

  const submit = (value: string) => {
    const question = value.trim();
    if (!question) return;
    onSubmit(question.slice(0, MAX_QUESTION_LENGTH));
    setText("");
  };

  const listening = voice.state === "recording";
  const placeholderNow = listening ? "Je t'écoute…" : voice.state === "transcribing" ? "Je transcris ce que tu as dit…" : placeholder;

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
      <div className={styles.field} data-listening={voice.state !== "idle"}>
        <input
          id={id}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={placeholderNow}
          maxLength={MAX_QUESTION_LENGTH}
          autoFocus={autoFocus}
          autoComplete="off"
          enterKeyHint="send"
        />
        <MicButton voice={voice} onResult={submit} />
      </div>
      <button type="submit" className="cta" disabled={!text.trim()}>
        {submitLabel}
      </button>
      {voice.error ? <p className={styles.error}>{voice.error}</p> : null}
    </form>
  );
}
