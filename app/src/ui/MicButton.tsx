"use client";

import type { VoiceInputControls } from "./hooks/useVoiceInput";
import styles from "./MicButton.module.css";

interface Props {
  voice: VoiceInputControls;
  onResult(text: string): void;
  /** Appelé juste avant d'ouvrir le micro (pour faire taire Nesa). */
  onStart?(): void;
  label?: string;
  variant?: "icon" | "pill";
}

/**
 * Bouton micro : un clic pour parler, la phrase part toute seule quand
 * l'élève se tait (ou au second clic). L'anneau suit le volume de la voix.
 */
export function MicButton({ voice, onResult, onStart, label = "Parler à Nesa", variant = "icon" }: Props) {
  if (!voice.supported) return null;
  const { state, level } = voice;
  const busy = state !== "idle";

  const toggle = () => {
    if (state === "recording") voice.stop();
    else if (state === "idle") {
      onStart?.();
      voice.start(onResult);
    }
  };

  const text = state === "recording" ? "J'écoute… (clique pour envoyer)" : state === "transcribing" ? "Je transcris…" : label;

  return (
    <button
      type="button"
      className={variant === "pill" ? `btn-line ${styles.pill}` : styles.icon}
      data-state={state}
      onClick={toggle}
      disabled={state === "transcribing"}
      aria-pressed={busy}
      aria-label={text}
      title={text}
      style={{ ["--level" as string]: level.toFixed(2) }}
    >
      <span className={styles.glyph}>
        <MicIcon />
        {state === "recording" ? <span className={styles.ring} aria-hidden="true" /> : null}
      </span>
      {variant === "pill" ? <span>{text}</span> : null}
    </button>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  );
}
