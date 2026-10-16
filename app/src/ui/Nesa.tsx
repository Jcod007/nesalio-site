"use client";

import { createElement } from "react";
import type { NesaState } from "./theme";

/**
 * Nesa, la mascotte : l'élément <nesa-mascot> du site (public/nesa.js).
 * L'élément dessine lui-même son contenu ; React ne fait que changer l'état.
 */
export function Nesa({ state, size, className }: { state: NesaState; size: number; className?: string }) {
  return createElement("nesa-mascot", {
    state,
    size: String(size),
    className,
    style: { width: size, height: size },
    "aria-hidden": "true",
  });
}
