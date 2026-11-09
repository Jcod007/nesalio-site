"use client";

import { useEffect, useState } from "react";
import { realClock, type Clock } from "@/engine/ports";

/**
 * Renvoie `performance.now()`, rafraîchi à chaque image jusqu'à l'heure
 * `until` (incluse). Les animations en HTML (calculs, sous-titres) en dérivent ;
 * au-delà, plus aucun rendu inutile.
 */
export function useFrameClock(until: number, clock: Clock = realClock, paused = false): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = clock.now();
      setNow(t);
      if (!paused && t <= until) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [until, clock, paused]);
  return now;
}
