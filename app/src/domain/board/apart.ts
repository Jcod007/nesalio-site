/**
 * Où poser l'axe, le centre ou le vecteur d'une transformation pour que l'image se lise À CÔTÉ
 * de l'original (séances du 21 octobre : un axe de réflexion à travers le triangle, une
 * homothétie dont l'image recouvrait la figure). Sans repère, la position n'a pas de sens
 * mathématique : le modèle dit l'intention (« réflexion d'axe vertical »), le moteur choisit la
 * place. Fonctions pures : la boîte de la figure (étiquettes comprises) et un écart.
 */
import type { Box } from "./layout";
import type { Vec2 } from "./state";

/** Le côté de la figure : 1 (à droite, ou dessous pour un axe horizontal), −1 (à gauche, ou dessus). */
export type Side = 1 | -1;

/**
 * Le premier placement dont l'image ne touche aucune figure déjà au tableau (`others`, boîtes) ;
 * le premier de la liste si tous en touchent une. Les placements sont donnés du préféré au moins bon.
 */
export function firstFree<T>(candidates: readonly T[], imageBox: (candidate: T) => Box, others: readonly Box[], margin = 0.2): T {
  const touches = (a: Box, b: Box) => a.x0 < b.x1 + margin && b.x0 < a.x1 + margin && a.y0 < b.y1 + margin && b.y0 < a.y1 + margin;
  return candidates.find((c) => !others.some((o) => touches(imageBox(c), o))) ?? candidates[0]!;
}

/** L'écart entre la figure et son image : lisible sans éloigner l'image de son original. */
export function gapFor(box: Box): number {
  return Math.max(0.6, 0.2 * Math.max(box.x1 - box.x0, box.y1 - box.y0));
}

/**
 * L'axe d'une réflexion posé à côté de la figure : vertical à droite (l'image se forme à droite,
 * à 2 × écart), horizontal dessous. Un peu plus long que la figure, pour qu'on le voie comme une droite.
 */
export function axisBeside(box: Box, orientation: "vertical" | "horizontal", gap = gapFor(box), side: Side = 1): [Vec2, Vec2] {
  if (orientation === "vertical") {
    const x = side > 0 ? box.x1 + gap : box.x0 - gap;
    const pad = 0.25 * (box.y1 - box.y0) + 0.4;
    return [[x, box.y0 - pad], [x, box.y1 + pad]];
  }
  const y = side > 0 ? box.y0 - gap : box.y1 + gap;
  const pad = 0.25 * (box.x1 - box.x0) + 0.4;
  return [[box.x0 - pad, y], [box.x1 + pad, y]];
}

/** Le vecteur d'une translation qui pose l'image juste à côté : à droite, à gauche, dessous ou dessus. */
export function translationBeside(box: Box, gap = gapFor(box), toward: "right" | "left" | "down" | "up" = "right"): Vec2 {
  const w = box.x1 - box.x0 + 2 * gap;
  const h = box.y1 - box.y0 + 2 * gap;
  return toward === "right" ? [w, 0] : toward === "left" ? [-w, 0] : toward === "down" ? [0, -h] : [0, h];
}

/**
 * Le centre d'une homothétie de rapport k qui sépare l'image de la figure, à mi-hauteur :
 * - k > 1, centre à gauche à la distance D : l'image commence en c + k·D, après la figure si
 *   (k − 1)·D ≥ w + écart ;
 * - 0 < k < 1, centre à gauche : l'image finit en c + k·(D + w), avant la figure si
 *   (1 − k)·D ≥ k·w + écart ;
 * - k < 0, centre à droite : l'image passe de l'autre côté du centre ;
 * - k = 1 (l'image est la figure) : centre à gauche, à l'écart.
 */
export function homothetyCenter(box: Box, k: number, gap = gapFor(box), side: Side = -1): Vec2 {
  // À droite : le même calcul sur la figure vue dans un miroir.
  if (side > 0) {
    const [x, y] = homothetyCenter({ x0: -box.x1, x1: -box.x0, y0: box.y0, y1: box.y1 }, k, gap, -1);
    return [-x, y];
  }
  const w = box.x1 - box.x0;
  const y = (box.y0 + box.y1) / 2;
  if (k < 0) return [box.x1 + gap, y];
  if (Math.abs(k - 1) < 1e-9) return [box.x0 - gap, y];
  const D = k > 1 ? (w + gap) / (k - 1) : (k * w + gap) / (1 - k);
  return [box.x0 - D, y];
}
