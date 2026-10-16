"use client";

import { useEffect, useRef } from "react";
import type { BoardState } from "@/domain/board/state";
import { useFrameClock } from "@/ui/hooks/useFrameClock";
import styles from "./NotesColumn.module.css";

const HIGHLIGHT_MS = 1400;

/**
 * Colonne de calculs écrits à la main, en haut à droite du tableau (comme
 * dans les vidéos du site). Chaque ligne s'écrit lettre par lettre.
 */
interface Props {
  board: BoardState;
  compact: boolean;
  /** Hauteur occupée (sur petit écran, la caméra cadre le tableau en dessous). */
  onHeightChange?(height: number): void;
}

export function NotesColumn({ board, compact, onHeightChange }: Props) {
  const ref = useRef<HTMLElement>(null);
  const visible = board.notes.length > 0 || board.tag !== null;
  useEffect(() => {
    const el = ref.current;
    if (!el || !onHeightChange) {
      onHeightChange?.(0);
      return;
    }
    const observer = new ResizeObserver(() => onHeightChange(el.getBoundingClientRect().bottom));
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, onHeightChange]);

  const until = Math.max(
    0,
    ...board.notes.map((n) => n.reveal.start + n.reveal.duration),
    ...Object.values(board.highlights).map((start) => start + HIGHLIGHT_MS),
    board.tag ? board.tag.reveal.start + board.tag.reveal.duration : 0,
  );
  const clock = useFrameClock(until);

  if (!visible) return null;

  return (
    <aside ref={ref} className={styles.column} data-compact={compact} aria-label="Calculs au tableau">
      <ol className={styles.notes}>
        {board.notes.map((note) => {
          if (clock < note.reveal.start) return null;
          const progress = Math.min(1, (clock - note.reveal.start) / Math.max(1, note.reveal.duration));
          const chars = Array.from(note.text);
          const shown = chars.slice(0, Math.ceil(chars.length * progress)).join("");
          const highlight = board.highlights[note.id];
          const glowing = highlight !== undefined && clock >= highlight && clock < highlight + HIGHLIGHT_MS;
          return (
            <li key={note.id} className={glowing ? styles.glow : undefined}>
              <span aria-hidden="true">{shown}</span>
              <span className="sr-only">{note.text}</span>
            </li>
          );
        })}
      </ol>
      {board.tag && clock >= board.tag.reveal.start ? (
        <p className={styles.tag} data-tone={board.tag.tone}>
          {board.tag.text}
        </p>
      ) : null}
    </aside>
  );
}
