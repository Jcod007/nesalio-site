"use client";

import { useEffect, useRef, useState } from "react";
import type { BoardState } from "@/domain/board/state";
import type { Viewport } from "./manim/camera";
import type { ManimRenderer } from "./manim/ManimRenderer";
import { boardRendered } from "@/engine/renderBarrier";
import styles from "./ManimBoard.module.css";

interface Props {
  board: BoardState;
  insets: Viewport["insets"];
}

/**
 * Le tableau infini. manim-web (WebGL) n'existe que dans le navigateur : il
 * est chargé à la demande, puis chaque nouvel état du tableau lui est transmis.
 */
export function ManimBoard({ board, insets }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ManimRenderer | null>(null);
  const latest = useRef({ board, insets });
  latest.current = { board, insets };
  const [ready, setReady] = useState(false);
  const [moved, setMoved] = useState(false);
  const [failed, setFailed] = useState(false);
  const readFrom = board.readFrom;
  const hasTraces = readFrom !== undefined && board.order.some((id) => {
    const node = board.nodes[id];
    return node && !node.erased && node.reveal.start < readFrom;
  });

  useEffect(() => {
    let disposed = false;
    let renderer: ManimRenderer | null = null;
    (async () => {
      try {
        // Les étiquettes manuscrites utilisent Caveat : on attend la police avant de dessiner.
        await Promise.allSettled([document.fonts.load('600 40px "Caveat"'), document.fonts.load('400 20px "Atkinson Hyperlegible"')]);
        const { ManimRenderer } = await import("./manim/ManimRenderer");
        if (disposed || !containerRef.current) return;
        renderer = new ManimRenderer(containerRef.current, { onViewChange: (_view, userMoved) => setMoved(userMoved) });
        rendererRef.current = renderer;
        renderer.setInsets(latest.current.insets);
        const initial = latest.current.board;
        void renderer.sync(initial, performance.now()).finally(() => boardRendered(initial));
        setReady(true);
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
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (renderer) void renderer.sync(board, performance.now()).finally(() => boardRendered(board));
  }, [board]);

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
      {moved || (ready && hasTraces) ? (
        <button
          type="button"
          className={`btn-line ${styles.recenter}`}
          style={{ bottom: insets.bottom + 12 }}
          onClick={() => rendererRef.current?.recenter()}
        >
          {moved ? "Recentrer" : "Voir les traces"}
        </button>
      ) : null}
    </div>
  );
}
