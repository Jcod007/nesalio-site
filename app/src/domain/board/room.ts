/**
 * Place libre pour un nouveau dessin, sans repère : un exemple à part (un carré de côté 3,
 * une autre figure) que le modèle pose par-dessus la figure (séances du 19 octobre : petit
 * carré sur le carré de l'hypoténuse, rectangle sur le parallélogramme) glisse juste à côté.
 *
 * Seulement quand les deux surfaces se recouvrent EN PARTIE (de 10 % à 90 % de la plus petite)
 * et que l'une est remplie : une partie coloriée dans sa figure, un carré posé sur un côté ou
 * deux cercles d'un diagramme (non remplis) restent où le modèle les a mis. Une figure tracée
 * côté par côté (un triangle) compte comme une surface. Avec un repère, les
 * coordonnées ont un sens : rien ne bouge.
 */
import { bounds, closedShapes, covered } from "./collisions";
import { union, type Box } from "./layout";
import type { BoardState, Vec2 } from "./state";

const GAP = 1;

function clashes(state: BoardState, poly: Vec2[], filled: boolean, ignore: ReadonlySet<string>): boolean {
  const box = bounds(poly);
  return closedShapes(state).some(({ id, poly: other, filled: otherFilled }) => {
    if (ignore.has(id)) return false;
    if (!filled && !otherFilled) return false;
    const b = bounds(other);
    if (!(box.x0 < b.x1 && b.x0 < box.x1 && box.y0 < b.y1 && b.y0 < box.y1)) return false;
    const area = (x: Box) => (x.x1 - x.x0) * (x.y1 - x.y0);
    const ratio = area(box) <= area(b) ? covered(poly, other) : covered(other, poly);
    return ratio >= 0.1 && ratio <= 0.9;
  });
}

/** Décalage à appliquer au nouveau dessin (contour `poly`) : [0, 0] s'il ne gêne rien. */
export function roomFor(state: BoardState, poly: Vec2[], filled: boolean, ignore: ReadonlySet<string> = new Set()): Vec2 {
  if (state.axes || poly.length < 3 || !clashes(state, poly, filled, ignore)) return [0, 0];
  const shapes = closedShapes(state)
    .filter(({ id }) => !ignore.has(id))
    .map(({ poly: p }) => bounds(p));
  const content = union(shapes);
  if (!content) return [0, 0];
  const b = bounds(poly);
  // Juste à côté de ce qui est dessiné, à la même hauteur (ou dans le même alignement) : le plus court.
  const candidates: Vec2[] = [
    [content.x1 + GAP - b.x0, 0],
    [content.x0 - GAP - b.x1, 0],
    [0, content.y0 - GAP - b.y1],
    [0, content.y1 + GAP - b.y0],
  ];
  const shifted = (d: Vec2) => poly.map(([x, y]) => [x + d[0], y + d[1]] as Vec2);
  const free = candidates.filter((d) => !clashes(state, shifted(d), filled, ignore));
  const pool = free.length > 0 ? free : candidates;
  return pool.reduce((best, d) => (Math.hypot(d[0], d[1]) < Math.hypot(best[0], best[1]) ? d : best));
}
