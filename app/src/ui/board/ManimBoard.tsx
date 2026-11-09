"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BoardState } from "@/domain/board/state";
import type { Viewport } from "./manim/camera";
import type { ManimRenderer } from "./manim/ManimRenderer";
import { boardRendered } from "@/engine/renderBarrier";
import { realClock, type Clock } from "@/engine/ports";
import styles from "./ManimBoard.module.css";

interface Props {
  board: BoardState;
  insets: Viewport["insets"];
  clock?: Clock;
  paused?: boolean;
  restore?: BoardState;
  onReady?(): void;
}

/**
 * Le tableau infini. manim-web (WebGL) n'existe que dans le navigateur : il
 * est chargé à la demande, puis chaque nouvel état du tableau lui est transmis.
 */
export function ManimBoard({ board, insets, clock = realClock, paused = false, restore, onReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ManimRenderer | null>(null);
  const latest = useRef({ board, insets, paused, restore, onReady });
  latest.current = { board, insets, paused, restore, onReady };
  const [ready, setReady] = useState(false);
  const [moved, setMoved] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let disposed = false;
    let renderer: ManimRenderer | null = null;
    (async () => {
      try {
        // Les étiquettes manuscrites utilisent Caveat : on attend la police avant de dessiner.
        await Promise.allSettled([document.fonts.load('600 40px "Caveat"'), document.fonts.load('400 20px "Atkinson Hyperlegible"')]);
        const { ManimRenderer } = await import("./manim/ManimRenderer");
        if (disposed || !containerRef.current) return;
        renderer = new ManimRenderer(containerRef.current, { onViewChange: (_view, userMoved) => setMoved(userMoved) }, clock);
        rendererRef.current = renderer;
        renderer.setInsets(latest.current.insets);
        const initial = latest.current.board;
        renderer.setPaused(latest.current.paused);
        if (latest.current.restore) renderer.restore(latest.current.restore);
        void renderer.sync(initial, clock.now()).finally(() => boardRendered(initial));
        setReady(true);
        latest.current.onReady?.();
      } catch (error) {
        console.error("Tableau indisponible", error);
        setFailed(true);
      }
    })();
    return () => {
      disposed = true;
      renderer?.dispose();
      rendererRef.current = null;
    };
  }, [clock]);

  useLayoutEffect(() => {
    rendererRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (renderer) void renderer.sync(board, clock.now()).finally(() => boardRendered(board));
  }, [board, clock]);

  useEffect(() => {
    rendererRef.current?.setInsets(insets);
  }, [insets]);

  return (
    <div className={styles.wrap}>
      <div ref={containerRef} className={styles.board} data-ready={ready} aria-label="Tableau de Nesa" role="img" />
      {failed ? (
        <p className={styles.failed}>
          Ton navigateur ne peut pas afficher le tableau (WebGL désactivé). Essaie avec Chrome, Edge ou Safari à jour.
        </p>
      ) : null}
      {moved ? (
        <button
          type="button"
          className={`btn-line ${styles.recenter}`}
          style={{ bottom: insets.bottom + 12 }}
          onClick={() => rendererRef.current?.recenter()}
        >
          Recentrer
        </button>
      ) : null}
    </div>
  );
}
