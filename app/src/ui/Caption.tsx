"use client";

import type { Caption as CaptionT } from "@/engine/player";
import type { Clock } from "@/engine/ports";
import { useFrameClock } from "./hooks/useFrameClock";
import styles from "./Dock.module.css";

/**
 * Sous-titre de Nesa : la phrase entière est visible, la partie déjà dite
 * s'assombrit au rythme de la voix (estimé).
 */
export function Caption({ caption, speaking, clock, paused }: { caption: CaptionT; speaking: boolean; clock?: Clock; paused?: boolean }) {
  const end = caption.startedAt + caption.durationMs;
  const now = useFrameClock(speaking ? end : 0, clock, paused);
  const progress = speaking ? Math.min(1, Math.max(0, (now - caption.startedAt) / caption.durationMs)) : 1;

  const words = caption.text.split(/(\s+)/);
  const spokenCount = Math.ceil(words.length * progress);

  return (
    <p className={styles.caption} aria-live="polite">
      {words.map((word, i) => (
        <span key={i} className={i < spokenCount ? styles.spoken : styles.upcoming}>
          {word}
        </span>
      ))}
      {speaking && !paused && now < end ? <SoundBars /> : null}
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
