"use client";

import { useEffect, useState } from "react";

/**
 * Renvoie `performance.now()`, rafraîchi à chaque image jusqu'à l'heure
 * `until` (incluse). Les animations en HTML (calculs, sous-titres) en dérivent ;
 * au-delà, plus aucun rendu inutile.
 */
export function useFrameClock(until: number): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = performance.now();
      setNow(t);
      if (t <= until) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [until]);
  return now;
}
