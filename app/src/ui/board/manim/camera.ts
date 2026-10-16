/**
 * Caméra du tableau infini : calculs purs (aucune dépendance à manim-web).
 *
 * Une vue est décrite par son centre dans le monde (unités de Manim, y vers
 * le haut) et son échelle `s` en pixels par unité. Les « marges » sont les
 * zones de l'écran couvertes par l'interface (carte de Nesa en bas, colonne
 * de calculs à droite) : on cadre le contenu dans la partie qui reste visible.
 */

export interface View {
  cx: number;
  cy: number;
  /** Pixels d'écran par unité du monde. */
  s: number;
}

export interface Viewport {
  width: number;
  height: number;
  insets: { top: number; right: number; bottom: number; left: number };
}

export interface WorldBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MIN_SCALE = 8;
export const MAX_SCALE = 1200;

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/** Vue qui fait tenir la boîte (centre `x`, `y`) dans la zone visible, avec une marge. */
export function fitView(box: WorldBox, viewport: Viewport, padding = 0.9): View {
  const { width, height, insets } = viewport;
  const availW = Math.max(80, width - insets.left - insets.right);
  const availH = Math.max(80, height - insets.top - insets.bottom);
  const s = clampScale(Math.min(availW / box.width, availH / box.height) * padding);
  // Centre de la zone visible, en pixels, par rapport au centre de l'écran.
  const offsetX = insets.left + availW / 2 - width / 2;
  const offsetY = insets.top + availH / 2 - height / 2;
  return { cx: box.x - offsetX / s, cy: box.y + offsetY / s, s };
}

/** Zoom autour d'un point de l'écran (le point sous le curseur ne bouge pas). */
export function zoomAt(view: View, viewport: Viewport, factor: number, screenX: number, screenY: number): View {
  const s = clampScale(view.s * factor);
  const [wx, wy] = screenToWorld(view, viewport, screenX, screenY);
  return {
    s,
    cx: wx - (screenX - viewport.width / 2) / s,
    cy: wy + (screenY - viewport.height / 2) / s,
  };
}

export function panBy(view: View, dxPixels: number, dyPixels: number): View {
  return { ...view, cx: view.cx - dxPixels / view.s, cy: view.cy + dyPixels / view.s };
}

export function screenToWorld(view: View, viewport: Viewport, x: number, y: number): [number, number] {
  return [view.cx + (x - viewport.width / 2) / view.s, view.cy - (y - viewport.height / 2) / view.s];
}

/** Interpolation douce entre deux vues (zoom géométrique, plus naturel). */
export function lerpView(a: View, b: View, t: number): View {
  const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  return {
    cx: a.cx + (b.cx - a.cx) * e,
    cy: a.cy + (b.cy - a.cy) * e,
    s: a.s * Math.pow(b.s / a.s, e),
  };
}

/** Quadrillage CSS aligné sur la caméra : taille d'une case et décalage en pixels. */
export function gridFor(view: View, viewport: Viewport, worldStep = 0.5): { size: number; x: number; y: number } {
  let size = worldStep * view.s;
  while (size < 14) size *= 2;
  while (size > 48) size /= 2;
  const originX = viewport.width / 2 - view.cx * view.s;
  const originY = viewport.height / 2 + view.cy * view.s;
  const mod = (v: number) => ((v % size) + size) % size;
  return { size, x: mod(originX), y: mod(originY) };
}
