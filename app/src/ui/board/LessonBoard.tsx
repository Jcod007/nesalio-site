"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { BOARD_TRANSITION_MS, BOARD_ZONES, type BoardZone } from "@/domain/board/zones";
import type { PlayerSnapshot } from "@/engine/player";
import { ManimBoard } from "./ManimBoard";
import type { Viewport } from "./manim/camera";
import styles from "./LessonBoard.module.css";

const PANEL_INSETS = { top: 4, right: 12, bottom: 12, left: 12 };
const ZOOM_MS = 360;
type View = BoardZone | "overview";

export function LessonBoard({ layout, insets }: {
  layout: NonNullable<PlayerSnapshot["lessonBoard"]>;
  insets: Viewport["insets"];
}) {
  const [view, setView] = useState<View>(layout.active);
  const currentView = useRef<View>(layout.active);
  const timer = useRef<number | undefined>(undefined);

  const select = useCallback((next: View) => {
    window.clearTimeout(timer.current);
    const show = (target: View) => {
      currentView.current = target;
      setView(target);
    };
    if (currentView.current === next) return;
    if (next === "overview" || currentView.current === "overview" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      show(next);
      return;
    }
    show("overview");
    timer.current = window.setTimeout(() => show(next), BOARD_TRANSITION_MS - ZOOM_MS);
  }, []);

  useEffect(() => {
    select(layout.active);
    return () => window.clearTimeout(timer.current);
  }, [layout.active, select]);

  const panelIndex = BOARD_ZONES.findIndex(({ id }) => id === view);
  return (
    <section className={styles.lessonBoard} aria-label="Tableau de la leçon" style={insets}>
      <nav className={styles.navigation} aria-label="Zones du tableau">
        {BOARD_ZONES.map(({ id, label }) => (
          <button key={id} type="button" aria-pressed={view === id} onClick={() => select(id)}>
            {label}
          </button>
        ))}
        <button type="button" aria-pressed={view === "overview"} onClick={() => select("overview")}>
          Vue d’ensemble
        </button>
      </nav>
      <div className={styles.viewport}>
        <div className={styles.stage} data-overview={view === "overview"} style={{
          "--offset": `${-100 * Math.max(0, panelIndex)}%`,
          "--duration": `${ZOOM_MS}ms`,
        } as CSSProperties}>
          {BOARD_ZONES.map(({ id, label }, index) => {
            const board = layout.zones[id];
            const hasContent = Boolean(board.axes || board.order.length);
            return (
              <section key={id} className={styles.panel} style={{ left: `${100 * index}%` }}
                aria-label={label} inert={view !== id}>
                <h2 className={styles.label}>{label}</h2>
                <div className={styles.surface}>
                  {hasContent
                    ? <ManimBoard board={board} insets={PANEL_INSETS} />
                    : <p className={styles.empty}>Les étapes de cette zone s’afficheront ici.</p>}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}
