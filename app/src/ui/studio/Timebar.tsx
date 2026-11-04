"use client";

import { useEffect, useRef } from "react";
import type { Finding } from "@/domain/studio/check";
import type { Timeline } from "@/domain/studio/timeline";
import type { StudioSnapshot } from "@/engine/studioPlayer";
import styles from "./Studio.module.css";

interface Props {
  timeline: Timeline;
  snapshot: StudioSnapshot;
  findings: Finding[];
  selected: number | null;
  /** Rang du plan cliqué dans la chronologie. */
  onPick(position: number): void;
}

/** La frise de la vidéo : un bloc par plan (largeur = durée), la révélation en violet ; un clic rejoue ce plan. */
export function Timebar({ timeline, snapshot, findings, selected, onPick }: Props) {
  const head = useRef<HTMLDivElement>(null);
  const latest = useRef(snapshot);
  latest.current = snapshot;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const { videoStart, status } = latest.current;
      const el = head.current;
      if (el) {
        const t = videoStart === null ? null : performance.now() - videoStart;
        el.style.display = t === null || status !== "playing" ? "none" : "block";
        if (t !== null) el.style.left = `${Math.min(100, Math.max(0, (t / timeline.totalMs) * 100))}%`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [timeline]);

  const errorShots = new Set(findings.filter((f) => f.severity === "error").map((f) => f.shot));
  return (
    <div className={styles.track} role="group" aria-label="Plans de la vidéo">
      {timeline.shots.map((shot, position) => (
        <button
          key={position}
          type="button"
          className={styles.trackShot}
          style={{ flexGrow: shot.durationMs }}
          data-reveal={shot.reveal}
          data-level={errorShots.has(shot.index) ? "error" : undefined}
          data-active={selected === shot.index}
          title={`Plan ${shot.index + 1} : ${shot.text}`}
          onClick={() => onPick(position)}
        >
          {shot.index + 1}
        </button>
      ))}
      <span className={styles.trackOutro} style={{ flexGrow: timeline.outro.durationMs }} aria-hidden />
      <div ref={head} className={styles.playhead} />
    </div>
  );
}
