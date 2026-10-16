"use client";

import type { Caption as CaptionT } from "@/engine/player";
import { useFrameClock } from "./hooks/useFrameClock";
import styles from "./Dock.module.css";

/**
 * Sous-titre de Nesa : la phrase entière est visible, la partie déjà dite
 * s'assombrit au rythme de la voix (estimé).
 */
export function Caption({ caption, speaking }: { caption: CaptionT; speaking: boolean }) {
  const end = caption.startedAt + caption.durationMs;
  const clock = useFrameClock(speaking ? end : 0);
  const progress = speaking ? Math.min(1, Math.max(0, (clock - caption.startedAt) / caption.durationMs)) : 1;

  const words = caption.text.split(/(\s+)/);
  const spokenCount = Math.ceil(words.length * progress);

  return (
    <p className={styles.caption} aria-live="polite">
      {words.map((word, i) => (
        <span key={i} className={i < spokenCount ? styles.spoken : styles.upcoming}>
          {word}
        </span>
      ))}
      {speaking && clock < end ? <SoundBars /> : null}
    </p>
  );
}

function SoundBars() {
  return (
    <span className={styles.bars} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
