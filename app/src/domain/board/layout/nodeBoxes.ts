/**
 * Ce qu'occupe chaque objet au tableau : boîte du corps, contour, place et
 * boîte de l'étiquette, boîte de la figure et de tout le contenu.
 */
import { sampleCurve } from "../geometry";
import { arcPoints } from "../shapes";
import { visibleNodes, type ArcNode, type BoardNode, type BoardState, type CircleNode, type Frame, type PolygonNode, type TextNode, type Vec2 } from "../state";
import { boxAround, frameBox, fromPoints, sampleLine, shift, union } from "./boxes";
import { FONT_SIZE, mathSize, scales, textExtent, textNodeExtent, type Box } from "./measure";

/** Boîte englobante d'un nœud, étiquette comprise, à sa position actuelle. */
export function nodeBox(node: BoardNode, frame: Frame): Box {
  const moved = bodyBox(node, frame);
  // L'étiquette fait partie de l'objet : exactement là où le rendu la dessine.
  const label = labelBox(node, frame);
  return label ? union([moved, label])! : moved;
}

/** Boîte de l'objet seul, sans son étiquette (à sa position actuelle) : ce à côté de quoi on pose un texte. */
export function bodyBox(node: BoardNode, frame: Frame): Box {
  let box: Box;
  switch (node.type) {
    case "point":
      box = boxAround(node.at, mathSize(frame, 0.3, 0.3));
      break;
    case "segment":
    case "vector":
      box = fromPoints([node.from, node.to]);
      break;
    case "curve": {
      const points = sampleCurve(node.fn, frame, node.from, node.to, 80).flat();
      box = points.length > 0 ? fromPoints(points) : frameBox(frame);
      break;
    }
    case "arc":
    case "circle":
    case "polygon":
      box = fromPoints(outline(node));
      break;
    case "grid":
      box = { x0: node.x[0], y0: node.y[0], x1: node.x[1], y1: node.y[1] };
      break;
    case "text": {
      const size = textNodeExtent(node, frame);
      const center: Vec2 = node.align === "left" ? [node.at[0] + size.w / 2, node.at[1]] : node.at;
      box = boxAround(center, size);
      break;
    }
  }
  return shift(box, node.offset);
}

/** Contour d'une forme (sans déplacement), pour les boîtes et les obstacles. */
export function outline(node: ArcNode | CircleNode | PolygonNode): Vec2[] {
  switch (node.type) {
    case "arc":
      return arcPoints(node.center, node.radius, node.start, node.end, 16);
    case "circle":
      return arcPoints(node.center, node.radius, 0, 360, 32);
    case "polygon": {
      const ring = node.closed ? [...node.points, node.points[0]!] : node.points;
      // Une ligne brisée déjà fine (courbe paramétrée, aire) n'a pas besoin d'être subdivisée.
      const steps = node.points.length > 12 ? 1 : 8;
      return ring.flatMap((p, i) => (i === 0 ? [p] : sampleLine(ring[i - 1]!, p, steps).slice(1)));
    }
  }
}


/* -------------------------------- étiquettes -------------------------------- */

export type Labelled = Exclude<BoardNode, TextNode | { type: "grid" }>;
export const hasLabel = (node: BoardNode): node is Labelled & { label: string } => node.type !== "text" && node.type !== "grid" && !!node.label;

/**
 * Normale unitaire (à l'écran) d'un trait, du côté opposé à l'origine du
 * repère : l'étiquette ne tombe pas sur les axes. À défaut, vers le haut.
 */
function awayNormal(frame: Frame, a: Vec2, b: Vec2): Vec2 {
  const s = scales(frame);
  const dx = (b[0] - a[0]) * s.x;
  const dy = (b[1] - a[1]) * s.y;
  const length = Math.hypot(dx, dy) || 1;
  let n: Vec2 = [-dy / length, dx / length];
  const away = n[0] * ((a[0] + b[0]) / 2) * s.x + n[1] * ((a[1] + b[1]) / 2) * s.y;
  if (Math.abs(away) > 1e-6) {
    if (away < 0) n = [-n[0], -n[1]];
  } else if (n[1] < 0 || (n[1] === 0 && n[0] < 0)) n = [-n[0], -n[1]];
  return n;
}

/**
 * Place habituelle de l'étiquette d'un objet (centre, coordonnées mathématiques,
 * sans le déplacement cumulé) : au-dessus à droite d'un point, à côté du milieu
 * d'un segment, au bout d'un vecteur, au centre d'un polygone…
 */
export function defaultLabelCenter(node: Labelled & { label: string }, frame: Frame): Vec2 | null {
  const s = scales(frame);
  const size = textExtent(node.label, FONT_SIZE.label, frame);
  const at = (p: Vec2, wx: number, wy: number): Vec2 => [p[0] + wx / s.x, p[1] + wy / s.y];
  switch (node.type) {
    case "point":
      return [node.at[0] + 0.25 / s.x + size.w / 2, node.at[1] + 0.42 / s.y];
    case "segment":
    case "vector": {
      const anchor: Vec2 = node.type === "vector" ? node.to : [(node.from[0] + node.to[0]) / 2, (node.from[1] + node.to[1]) / 2];
      const n = awayNormal(frame, node.from, node.to);
      return at(anchor, n[0] * 0.38, n[1] * 0.38);
    }
    case "arc": {
      const middle = ((node.start + node.end) / 2) * (Math.PI / 180);
      const radius = node.radius * s.x + 0.32;
      return at(node.center, Math.cos(middle) * radius, Math.sin(middle) * radius);
    }
    case "circle": {
      const r = node.radius * s.x;
      return [node.center[0] + (r * 0.72 + 0.2) / s.x + size.w / 2, node.center[1] + (r * 0.72 + 0.25) / s.y];
    }
    case "polygon": {
      if (node.param) return at(node.points.at(-1)!, 0.3, 0.3);
      const n = node.points.length;
      return [node.points.reduce((a, p) => a + p[0], 0) / n, node.points.reduce((a, p) => a + p[1], 0) / n];
    }
    case "curve": {
      const last = sampleCurve(node.fn, frame, node.from, node.to).at(-1)?.at(-1);
      return last ? at(last, 0.3, 0.3) : null;
    }
  }
}

/** Centre de l'étiquette d'un objet (choisi par le moteur, sinon la place habituelle), sans le déplacement cumulé. */
export function labelCenter(node: BoardNode, frame: Frame): Vec2 | null {
  if (!hasLabel(node)) return null;
  return node.labelAt ?? defaultLabelCenter(node, frame);
}

/** Boîte de l'étiquette d'un objet, à sa position actuelle (déplacement compris). */
export function labelBox(node: BoardNode, frame: Frame): Box | null {
  const center = labelCenter(node, frame);
  if (!center || !hasLabel(node)) return null;
  return shift(boxAround(center, textExtent(node.label, FONT_SIZE.label, frame)), node.offset);
}

/** La figure : le repère s'il y en a un, sinon les dessins (hors textes), sinon le cadre par défaut. */
export function figureBox(state: BoardState): Box {
  if (state.axes) return frameBox(state.axes.frame);
  const drawn = visibleNodes(state)
    .filter((node) => node.type !== "text")
    .map((node) => nodeBox(node, state.frame));
  return union(drawn) ?? frameBox(state.frame);
}

/** Tout ce qui est au tableau : la caméra cadre cette zone. */
export function contentBox(state: BoardState): Box {
  const parts = [figureBox(state), ...visibleNodes(state).map((node) => nodeBox(node, state.frame))];
  return union(parts)!;
}
