"use client";

import { useEffect, useRef, useState } from "react";
import { emptyBoard } from "@/domain/board/state";
import type { StudioScript } from "@/domain/studio/script";
import type { Timeline } from "@/domain/studio/timeline";
import type { StudioSnapshot } from "@/engine/studioPlayer";
import type { ManimRenderer } from "@/ui/board/manim/ManimRenderer";
import { BOARD_INSETS, drawFrame, STAGE_H, STAGE_W, VIDEO_H, VIDEO_W } from "./compositor";
import styles from "./Studio.module.css";

interface Props {
  script: StudioScript;
  timeline: Timeline;
  snapshot: StudioSnapshot;
  /** Reçoit le canevas de la vidéo (pour l'enregistrer). */
  onCanvas?: (canvas: HTMLCanvasElement | null) => void;
}

/**
 * L'écran de la vidéo : le tableau manim-web en 540 × 960 (densité 2), et par
 * dessus le canevas 1080 × 1920 de la vidéo, redessiné à chaque image. Le tout
 * est réduit à la place disponible sans changer la taille réelle du tableau :
 * l'aperçu est pixel pour pixel la vidéo exportée.
 */
export function StudioStage({ script, timeline, snapshot, onCanvas }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ManimRenderer | null>(null);
  const latest = useRef({ script, timeline, snapshot });
  latest.current = { script, timeline, snapshot };
  const [scale, setScale] = useState(0.5);
  const [failed, setFailed] = useState(false);

  // Réduction à la largeur disponible.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(() => setScale(frame.clientWidth / STAGE_W));
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  // Le tableau : chargé à la demande (WebGL), en densité 2 pour une vidéo 1080 × 1920.
  useEffect(() => {
    let disposed = false;
    let renderer: ManimRenderer | null = null;
    (async () => {
      try {
        await Promise.allSettled([
          document.fonts.load('600 40px "Caveat"'),
          document.fonts.load('400 20px "Atkinson Hyperlegible"'),
          document.fonts.load('700 54px "Atkinson Hyperlegible"'),
          document.fonts.load('800 76px "Bricolage Grotesque Variable"'),
        ]);
        const { ManimRenderer } = await import("@/ui/board/manim/ManimRenderer");
        if (disposed || !boardRef.current) return;
        renderer = new ManimRenderer(boardRef.current, {}, { pixelRatio: VIDEO_W / STAGE_W });
        renderer.setInsets(BOARD_INSETS);
        renderer.sync(latest.current.snapshot.board, performance.now());
        rendererRef.current = renderer;
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

  // Nouvelle lecture (ou reprise à un autre plan) : le tableau repart de zéro avant le nouvel état.
  const playedFrom = useRef<number | null>(null);
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    if (snapshot.videoStart !== null && snapshot.videoStart !== playedFrom.current) renderer.sync(emptyBoard(), performance.now());
    if (snapshot.videoStart !== null) playedFrom.current = snapshot.videoStart;
    renderer.sync(snapshot.board, performance.now());
  }, [snapshot.board, snapshot.videoStart]);

  useEffect(() => {
    onCanvas?.(canvasRef.current);
    return () => onCanvas?.(null);
  }, [onCanvas]);

  // L'image de la vidéo, redessinée à chaque image de l'écran.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const tick = () => {
      const { script, timeline, snapshot } = latest.current;
      const t = snapshot.videoStart === null ? null : performance.now() - snapshot.videoStart;
      drawFrame(ctx, { board: rendererRef.current?.canvas ?? null, script, timeline, t: snapshot.status === "done" ? timeline.totalMs - 1 : t });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={frameRef} className={styles.stageFrame} style={{ height: STAGE_H * scale }}>
      <div className={styles.stageInner} style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})` }}>
        <div ref={boardRef} className={styles.stageBoard} />
        <canvas ref={canvasRef} className={styles.stageCanvas} width={VIDEO_W} height={VIDEO_H} aria-label="Aperçu de la vidéo" role="img" />
      </div>
      {failed ? <p className={styles.stageFailed}>WebGL indisponible : ouvre le studio dans Chrome ou Edge à jour.</p> : null}
    </div>
  );
}
