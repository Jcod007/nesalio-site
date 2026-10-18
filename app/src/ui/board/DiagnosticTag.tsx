"use client";

import { useEffect, useRef } from "react";
import type { BoardState } from "@/domain/board/state";
import { useFrameClock } from "@/ui/hooks/useFrameClock";
import styles from "./DiagnosticTag.module.css";

interface Props {
  board: BoardState;
  compact: boolean;
  /** Bas de l'étiquette (sur petit écran, la caméra cadre le tableau en dessous). */
  onBottomChange?(bottom: number): void;
}

/**
 * Étiquette de diagnostic (« Ce qui bloque souvent : … »), en haut à droite.
 * C'est un commentaire pédagogique sur la séance, pas un élément du tableau :
 * les calculs, eux, sont écrits dans la scène par le moteur de placement.
 */
export function DiagnosticTag({ board, compact, onBottomChange }: Props) {
  const ref = useRef<HTMLElement>(null);
  const tag = board.tag;
  const clock = useFrameClock(tag ? tag.reveal.start + tag.reveal.duration : 0);
  const shown = tag !== null && clock >= tag.reveal.start;

  useEffect(() => {
    const el = ref.current;
    if (!el || !onBottomChange) {
      onBottomChange?.(0);
      return;
    }
    const observer = new ResizeObserver(() => onBottomChange(el.getBoundingClientRect().bottom));
    observer.observe(el);
    return () => observer.disconnect();
  }, [shown, onBottomChange]);

  if (!tag || !shown) return null;
  return (
    <aside ref={ref} className={styles.column} data-compact={compact} aria-label="Diagnostic">
      <p className={styles.tag} data-tone={tag.tone}>
        {tag.text}
      </p>
    </aside>
  );
}
