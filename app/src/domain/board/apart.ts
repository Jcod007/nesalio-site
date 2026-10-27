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

/**
 * Le centre d'une rotation d'angle θ (degrés) qui sépare l'image de la figure : à la distance D du
 * milieu de la figure, l'image se forme à 2·D·|sin(θ/2)| de l'original ; D est choisi pour que cet
 * écart dépasse la diagonale de la figure plus l'écart. `toward` : du côté où poser le centre.
 * null pour une petite rotation (moins de 20°) : le centre serait trop loin pour rester au tableau.
 */
export function rotationCenter(box: Box, angle: number, gap = gapFor(box), toward: "down" | "left" | "right" | "up" = "down"): Vec2 | null {
  const half = Math.abs(Math.sin((angle * Math.PI) / 360));
  if (half < Math.sin((20 * Math.PI) / 360)) return null;
  const diag = Math.hypot(box.x1 - box.x0, box.y1 - box.y0);
  const D = (diag + gap) / (2 * half);
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const [ux, uy] = toward === "down" ? [0, -1] : toward === "up" ? [0, 1] : toward === "left" ? [-1, 0] : [1, 0];
  return [cx + D * ux, cy + D * uy];
}

/**
 * Un axe de réflexion de direction quelconque, glissé parallèlement à lui-même juste à côté de la
 * figure (ses points `outline`) : l'image se forme de l'autre côté, sans toucher l'original.
 * `side` : 1 du côté où pointe la normale, −1 de l'autre. Renvoie le décalage à appliquer à l'axe.
 */
export function axisShift(axis: readonly [Vec2, Vec2], outline: readonly Vec2[], side: Side, gap: number): Vec2 {
  const [p, q] = axis;
  const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const n: Vec2 = [-(q[1] - p[1]) / len, (q[0] - p[0]) / len];
  const proj = outline.map((v) => v[0] * n[0] + v[1] * n[1]);
  const target = side > 0 ? Math.max(...proj) + gap : Math.min(...proj) - gap;
  const c = p[0] * n[0] + p[1] * n[1];
  return [(target - c) * n[0], (target - c) * n[1]];
}
