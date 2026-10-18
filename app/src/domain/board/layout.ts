/**
 * Moteur de placement : l'IA dit « quoi » (« ce calcul, à droite du point A »),
 * le moteur décide « où ». Fonctions pures, en coordonnées mathématiques.
 *
 * Il connaît la taille des objets au tableau (boîtes englobantes), place un
 * texte à côté d'un objet sans chevaucher ce qui est déjà écrit, et range les
 * lignes de calcul en colonne à côté de la figure, en faisant de la place
 * quand la colonne est pleine (les anciennes lignes remontent et s'effacent).
 *
 * Les tailles de texte sont fixes à l'écran (unités du monde Manim) : on les
 * convertit avec l'échelle du repère courant.
 */
import { sampleCurve } from "./geometry";
import { arcPoints } from "./shapes";
import {
  isVisible,
  moveNodes,
  updateNodes,
  visibleNodes,
  type ArcNode,
  type BoardNode,
  type BoardState,
  type CircleNode,
  type PolygonNode,
  type Frame,
  type Reveal,
  type TextNode,
  type Vec2,
} from "./state";
import type { Side } from "@/domain/scene/primitives";

/** Taille du repère dans le monde de Manim (cadre standard : 14 × 8). Partagée avec le rendu. */
export const AXES_BOX = { width: 11.5, height: 6.4 } as const;

/** Tailles de police (points Manim) selon le rôle du texte. */
export const FONT_SIZE = { small: 30, normal: 40, large: 52, calc: 36, label: 34 } as const;

/**
 * Mesures de la police manuscrite (Caveat) dans manim-web, relevées dans le
 * navigateur : hauteur = taille / 80, largeur ≈ 0,0039 × taille par caractère.
 * On garde une petite marge pour ne jamais sous-estimer.
 */
const HEIGHT_PER_POINT = 1 / 80;
const WIDTH_PER_POINT_PER_CHAR = 0.0042;

/** Écart entre un objet et le texte qui l'accompagne (unités du monde). */
const GAP = 0.18;
/** Marge entre la figure et la pile de calculs (unités du monde). */
const CALC_MARGIN = 0.7;
const CALC_LINE_SPACING = 1.5;

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface Extent {
  w: number;
  h: number;
}

/* -------------------------------- échelle -------------------------------- */

/** Unités du monde Manim par unité mathématique (même échelle en x et en y). */
export function worldPerMath(frame: Frame): number {
  return Math.min(AXES_BOX.width / (frame.x[1] - frame.x[0]), AXES_BOX.height / (frame.y[1] - frame.y[0]));
}

export function fontSizeOf(node: TextNode): number {
  return node.role === "calc" ? FONT_SIZE.calc : FONT_SIZE[node.size];
}

/** Taille d'un texte, en coordonnées mathématiques. */
export function textExtent(text: string, fontSize: number, frame: Frame): Extent {
  const unit = worldPerMath(frame);
  const chars = Math.max(1, Array.from(text).length);
  return { w: (chars * fontSize * WIDTH_PER_POINT_PER_CHAR) / unit, h: (fontSize * HEIGHT_PER_POINT) / unit };
}

/* --------------------------------- boîtes --------------------------------- */

export const boxAround = ([x, y]: Vec2, { w, h }: Extent): Box => ({ x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 });
export const boxCenter = (b: Box): Vec2 => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
export const boxExtent = (b: Box): Extent => ({ w: b.x1 - b.x0, h: b.y1 - b.y0 });
export const intersects = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
export function union(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  return boxes.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }));
}
const frameBox = (frame: Frame): Box => ({ x0: frame.x[0], y0: frame.y[0], x1: frame.x[1], y1: frame.y[1] });
const fromPoints = (points: Vec2[]): Box =>
  union(points.map(([x, y]) => ({ x0: x, y0: y, x1: x, y1: y })))!;
const shift = (b: Box, [dx, dy]: Vec2): Box => ({ x0: b.x0 + dx, y0: b.y0 + dy, x1: b.x1 + dx, y1: b.y1 + dy });

/** Boîte englobante d'un nœud, étiquette comprise, à sa position actuelle. */
export function nodeBox(node: BoardNode, frame: Frame): Box {
  const unit = worldPerMath(frame);
  const label = (text: string | undefined) => (text ? textExtent(text, FONT_SIZE.label, frame) : null);
  let box: Box;
  switch (node.type) {
    case "point": {
      const r = 0.15 / unit;
      box = boxAround(node.at, { w: 2 * r, h: 2 * r });
      const size = label(node.label);
      // Même placement que le rendu : au-dessus à droite du point.
      if (size) box = union([box, { x0: node.at[0] + 0.25 / unit, y0: node.at[1] + 0.42 / unit - size.h / 2, x1: node.at[0] + 0.25 / unit + size.w, y1: node.at[1] + 0.42 / unit + size.h / 2 }])!;
      break;
    }
    case "segment":
    case "vector": {
      box = fromPoints([node.from, node.to]);
      const size = label(node.label);
      if (size) box = union([box, boxAround(boxCenter(box), { w: size.w + 0.76 / unit, h: size.h + 0.76 / unit })])!;
      break;
    }
    case "curve": {
      const points = sampleCurve(node.fn, frame, node.from, node.to, 80).flat();
      box = points.length > 0 ? fromPoints(points) : frameBox(frame);
      break;
    }
    case "arc":
    case "circle":
    case "polygon": {
      box = fromPoints(outline(node));
      const size = label(node.label);
      if (size) box = union([box, boxAround(boxCenter(box), { w: size.w, h: size.h })])!;
      break;
    }
    case "text": {
      const size = textExtent(node.text, fontSizeOf(node), frame);
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
      return ring.flatMap((p, i) => (i === 0 ? [p] : sampleLine(ring[i - 1]!, p, 8).slice(1)));
    }
  }
}

function sampleLine(a: Vec2, b: Vec2, n: number): Vec2[] {
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as Vec2);
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

/* -------------------------------- placement -------------------------------- */

const SIDES: Side[] = ["right", "above", "below", "left"];

/** Centre d'une boîte de taille `size` posée du côté `side` de `target`. */
function besideCenter(target: Box, size: Extent, side: Side, gap: number): Vec2 {
  const [cx, cy] = boxCenter(target);
  switch (side) {
    case "right":
      return [target.x1 + gap + size.w / 2, cy];
    case "left":
      return [target.x0 - gap - size.w / 2, cy];
    case "above":
      return [cx, target.y1 + gap + size.h / 2];
    case "below":
      return [cx, target.y0 - gap - size.h / 2];
  }
}

/**
 * Où poser une boîte de taille `size` à côté de `target` : le côté demandé
 * s'il est libre, sinon le premier côté libre, sinon le côté demandé quand même.
 * `ignore` : nœuds à ne pas considérer comme des obstacles (la cible, ce qui bouge avec).
 */
export function placeBeside(state: BoardState, size: Extent, target: Box, side: Side | undefined, ignore: ReadonlySet<string>): { center: Vec2; side: Side } {
  const gap = GAP / worldPerMath(state.frame);
  const clutter = obstacles(state, ignore);
  const order = side ? [side, ...SIDES.filter((s) => s !== side)] : SIDES;
  // Le côté demandé s'il est libre ; sinon le premier côté libre ; sinon un peu plus loin ;
  // en dernier recours, l'emplacement le moins encombré.
  let best: { center: Vec2; side: Side; score: number } | null = null;
  const candidates = (distance: number): Array<{ side: Side; center: Vec2 }> => {
    const away = gap * distance + (distance > 1 ? size.h * (distance - 1) * 0.5 : 0);
    const sides = order.map((candidate) => ({ side: candidate, center: besideCenter(target, size, candidate, away) }));
    // Les coins (en diagonale de l'objet), après les quatre côtés.
    const corners = (["right", "left"] as const).flatMap((horizontal) =>
      (["above", "below"] as const).map((vertical) => {
        const [x] = besideCenter(target, size, horizontal, away);
        const [, y] = besideCenter(target, size, vertical, away);
        return { side: horizontal as Side, center: [x, y] as Vec2 };
      }),
    );
    return [...sides, ...corners];
  };
  for (const distance of [1, 2.5, 4.5]) {
    for (const { side: candidate, center } of candidates(distance)) {
      const crowd = clutter(boxAround(center, size));
      if (crowd === 0) return { center, side: candidate };
      const score = crowd + (distance - 1) * 0.01;
      if (!best || score < best.score) best = { center, side: candidate, score };
    }
  }
  return { center: best!.center, side: best!.side };
}

const inside = ([x, y]: Vec2, b: Box) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1;

/**
 * Mesure de l'encombrement d'une zone (0 = libre). Ce qu'un texte ne doit pas recouvrir : les autres textes et points (leur
 * boîte), les traits des courbes et des segments (points échantillonnés), et
 * les axes avec leurs graduations chiffrées.
 */
function obstacles(state: BoardState, ignore: ReadonlySet<string>): (box: Box) => number {
  const unit = worldPerMath(state.frame);
  const boxes: Box[] = [];
  const traces: Vec2[] = [];
  for (const node of visibleNodes(state)) {
    if (ignore.has(node.id)) continue;
    const move = ([x, y]: Vec2): Vec2 => [x + node.offset[0], y + node.offset[1]];
    if (node.type === "text" || node.type === "point") boxes.push(nodeBox(node, state.frame));
    else if (node.type === "curve") traces.push(...sampleCurve(node.fn, state.frame, node.from, node.to, 120).flat().map(move));
    else if (node.type === "segment" || node.type === "vector") traces.push(...sampleLine(node.from, node.to, 16).map(move));
    else {
      traces.push(...outline(node).map(move));
      // Une forme remplie (le bloc d'un plan incliné) se contourne entièrement.
      if (node.type === "polygon" && node.fill) boxes.push(nodeBox(node, state.frame));
    }
  }
  if (state.axes) {
    const { x, y } = state.axes.frame;
    // Axe des x et ses chiffres (en dessous), axe des y et ses chiffres (à gauche).
    if (y[0] <= 0 && y[1] >= 0) boxes.push({ x0: x[0], x1: x[1], y0: -0.45 / unit, y1: 0.08 / unit });
    if (x[0] <= 0 && x[1] >= 0) boxes.push({ x0: -0.55 / unit, x1: 0.08 / unit, y0: y[0], y1: y[1] });
  }
  /** Encombrement : surface recouverte (relative à la boîte) plus la part de traits qui la traversent. */
  return (box) => {
    const area = (box.x1 - box.x0) * (box.y1 - box.y0) || 1;
    let score = 0;
    for (const b of boxes) {
      if (!intersects(b, box)) continue;
      score += ((Math.min(b.x1, box.x1) - Math.max(b.x0, box.x0)) * (Math.min(b.y1, box.y1) - Math.max(b.y0, box.y0))) / area;
    }
    for (const p of traces) if (inside(p, box)) score += 0.05;
    return score;
  };
}

/* ----------------------------- pile de calculs ----------------------------- */

interface CalcColumn {
  /** Bord gauche des lignes. */
  x: number;
  /** Milieu de la première ligne. */
  top: number;
  spacing: number;
  capacity: number;
}

/** La colonne de calculs, écrite sur le tableau à droite de la figure. */
export function calcColumn(state: BoardState): CalcColumn {
  const unit = worldPerMath(state.frame);
  const figure = figureBox(state);
  const lineHeight = (FONT_SIZE.calc * HEIGHT_PER_POINT) / unit;
  const spacing = lineHeight * CALC_LINE_SPACING;
  const height = figure.y1 - figure.y0;
  return {
    x: figure.x1 + CALC_MARGIN / unit,
    top: figure.y1 - lineHeight / 2,
    spacing,
    capacity: Math.max(4, Math.min(9, Math.floor(height / spacing))),
  };
}

/** Position (bord gauche, milieu) de la ligne `index` de la pile. */
export function calcSlot(state: BoardState, index: number): Vec2 {
  const column = calcColumn(state);
  return [column.x, column.top - index * column.spacing];
}

/**
 * Remet chaque ligne de la pile à sa place (après un ajout, un effacement ou
 * un changement de repère), en animant celles qui bougent.
 */
export function reflowCalc(state: BoardState, reveal: Reveal): BoardState {
  let next = state;
  state.calc.forEach((id, index) => {
    const node = next.nodes[id];
    if (!isVisible(node) || node.type !== "text") return;
    const [sx, sy] = calcSlot(next, index);
    const current: Vec2 = [node.at[0] + node.offset[0], node.at[1] + node.offset[1]];
    const delta: Vec2 = [sx - current[0], sy - current[1]];
    if (Math.abs(delta[0]) > 1e-9 || Math.abs(delta[1]) > 1e-9) next = moveNodes(next, [id], delta, reveal);
  });
  return next;
}

/** Fait de la place dans la pile pleine : la plus ancienne ligne s'efface, les autres remontent. */
export function makeRoomInCalc(state: BoardState, reveal: Reveal): BoardState {
  const { capacity } = calcColumn(state);
  if (state.calc.length < capacity) return state;
  const drop = state.calc.slice(0, state.calc.length - capacity + 1);
  let next = updateNodes(state, drop, (node) => ({ ...node, erased: reveal }));
  next = { ...next, calc: state.calc.filter((id) => !drop.includes(id)) };
  return reflowCalc(next, reveal);
}
