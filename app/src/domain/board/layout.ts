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
import { formatNumber, niceStep, sampleCurve } from "./geometry";
import { arcPoints } from "./shapes";
import {
  anchoredTo,
  isVisible,
  moveNodes,
  resolveTargets,
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

/** Unités du monde Manim par unité mathématique, sur chaque axe (même échelle en x et en y). */
export function scales(frame: Frame): { x: number; y: number } {
  const u = Math.min(AXES_BOX.width / (frame.x[1] - frame.x[0]), AXES_BOX.height / (frame.y[1] - frame.y[0]));
  return { x: u, y: u };
}

/** La plus petite des deux échelles (tailles qui doivent rester visibles sur les deux axes). */
export function worldPerMath(frame: Frame): number {
  const s = scales(frame);
  return Math.min(s.x, s.y);
}

/** Une taille donnée en unités du monde (largeur, hauteur), en coordonnées mathématiques. */
export function mathSize(frame: Frame, w: number, h: number): Extent {
  const s = scales(frame);
  return { w: w / s.x, h: h / s.y };
}

export function fontSizeOf(node: TextNode): number {
  return node.role === "calc" ? FONT_SIZE.calc : FONT_SIZE[node.size];
}

/** Taille d'un texte, en coordonnées mathématiques. */
export function textExtent(text: string, fontSize: number, frame: Frame): Extent {
  const chars = Math.max(1, Array.from(text).length);
  return mathSize(frame, chars * fontSize * WIDTH_PER_POINT_PER_CHAR, fontSize * HEIGHT_PER_POINT);
}

/**
 * Taille d'une matrice écrite au tableau (cases + crochets), en unités du
 * monde : partagée par le moteur (placement) et le rendu (dessin).
 */
export function matrixLayout(rows: readonly (readonly string[])[], fontSize: number) {
  const cell = (text: string) => Math.max(1, Array.from(text).length) * fontSize * WIDTH_PER_POINT_PER_CHAR;
  const columns = Math.max(...rows.map((row) => row.length));
  const widths = Array.from({ length: columns }, (_, j) => Math.max(...rows.map((row) => cell(row[j] ?? ""))));
  const gap = fontSize * 0.012;
  const lineHeight = fontSize * HEIGHT_PER_POINT * 1.35;
  const bracket = fontSize * 0.006;
  const width = widths.reduce((a, b) => a + b, 0) + gap * (columns - 1) + 2 * (bracket + gap * 0.6);
  return { widths, gap, lineHeight, bracket, width, height: lineHeight * rows.length };
}

/** Taille d'un texte au tableau (une matrice prend plusieurs lignes). */
export function textNodeExtent(node: TextNode, frame: Frame): Extent {
  if (!node.rows) return textExtent(node.text, fontSizeOf(node), frame);
  const layout = matrixLayout(node.rows, fontSizeOf(node));
  return mathSize(frame, layout.width, layout.height);
}

/* ------------------------------- graduations ------------------------------- */

/** Taille des chiffres des graduations (police du texte courant, pas la manuscrite). */
export const TICK_FONT = 20;
const TICK_HEIGHT = 0.25;
const TICK_WIDTH_PER_CHAR = 0.11;

export interface AxisTicks {
  step: number;
  values: number[];
}

/** Graduations chiffrées du repère (le rendu dessine exactement celles-ci). */
export function axisTicks(frame: Frame): { x: AxisTicks; y: AxisTicks; origin: Vec2 } {
  const along = ([a, b]: [number, number], step: number): number[] => {
    const out: number[] = [];
    for (let v = Math.ceil(a / step) * step; v <= b - step * 0.5; v += step) {
      const rounded = Number((Math.round(v / step) * step).toPrecision(12));
      if (Math.abs(rounded) > 1e-9) out.push(rounded);
    }
    return out;
  };
  const xStep = niceStep(frame.x[1] - frame.x[0]);
  const yStep = niceStep(frame.y[1] - frame.y[0], 7);
  return {
    x: { step: xStep, values: along(frame.x, xStep) },
    y: { step: yStep, values: along(frame.y, yStep) },
    origin: [clamp(0, frame.x), clamp(0, frame.y)],
  };
}

/** Chiffre d'une graduation. */
export const tickText = (value: number) => formatNumber(value);

/** Centre et taille (coordonnées mathématiques) de chaque chiffre des graduations. */
export function tickLabels(frame: Frame): Array<{ axis: "x" | "y"; value: number; text: string; at: Vec2; size: Extent }> {
  const { x, y, origin } = axisTicks(frame);
  const s = scales(frame);
  const size = (text: string) => mathSize(frame, Array.from(text).length * TICK_WIDTH_PER_CHAR, TICK_HEIGHT);
  return [
    ...x.values.map((v) => ({ axis: "x" as const, value: v, text: tickText(v), at: [v, origin[1] - 0.28 / s.y] as Vec2, size: size(tickText(v)) })),
    ...y.values.map((v) => ({ axis: "y" as const, value: v, text: tickText(v), at: [origin[0] - 0.3 / s.x, v] as Vec2, size: size(tickText(v)) })),
  ];
}

const clamp = (v: number, [a, b]: [number, number]) => (v < a ? a : v > b ? b : v);

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
      const size = label(node.label);
      if (size && node.labelAt) box = union([box, boxAround(node.labelAt, size)])!;
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

function sampleLine(a: Vec2, b: Vec2, n: number): Vec2[] {
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as Vec2);
}

/* -------------------------------- étiquettes -------------------------------- */

type Labelled = Exclude<BoardNode, TextNode | { type: "grid" }>;
const hasLabel = (node: BoardNode): node is Labelled & { label: string } => node.type !== "text" && node.type !== "grid" && !!node.label;

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

/* -------------------------------- empreintes -------------------------------- */

/**
 * L'empreinte de ce qui est au tableau : ce que chaque objet occupe.
 * - boîtes : textes, étiquettes, pastilles des points, chiffres des graduations ;
 * - traits : courbes, segments, vecteurs, contours (points échantillonnés) ;
 * - surfaces : polygones remplis (un carré construit sur un côté, le bloc d'un plan incliné).
 * Chaque morceau est rattaché à son objet (`owner`) et à sa partie, pour qu'un
 * objet puisse ignorer sa propre étiquette ou sa propre surface.
 */
export type Part = "body" | "label" | "dot" | "stroke" | "region";
export interface Footprints {
  boxes: Array<{ owner: string; part: Part; box: Box; text?: string }>;
  strokes: Array<{ owner: string; points: Vec2[] }>;
  regions: Array<{ owner: string; points: Vec2[] }>;
}

/** Identifiant de l'empreinte du repère (axes et graduations). */
export const AXES_OWNER = "axes";

/** Échantillonne un trait à peu près tous les 0,1 unité du monde. */
function strokeSamples(frame: Frame, a: Vec2, b: Vec2): Vec2[] {
  const s = scales(frame);
  const n = Math.max(2, Math.min(200, Math.ceil(Math.hypot((b[0] - a[0]) * s.x, (b[1] - a[1]) * s.y) / 0.1)));
  return sampleLine(a, b, n);
}

/** `skip(owner, part)` : morceaux à ne pas compter (l'objet qu'on place, sa cible…). */
export function footprints(state: BoardState, skip: (owner: string, part: Part) => boolean = () => false): Footprints {
  const frame = state.frame;
  const out: Footprints = { boxes: [], strokes: [], regions: [] };
  const box = (owner: string, part: Part, b: Box | null, text?: string) => {
    if (b && !skip(owner, part)) out.boxes.push({ owner, part, box: b, text });
  };
  const stroke = (owner: string, points: Vec2[]) => {
    if (points.length > 0 && !skip(owner, "stroke")) out.strokes.push({ owner, points });
  };
  for (const node of visibleNodes(state)) {
    const move = ([x, y]: Vec2): Vec2 => [x + node.offset[0], y + node.offset[1]];
    switch (node.type) {
      case "grid":
        continue; // le quadrillage est un fond
      case "text":
        box(node.id, "body", nodeBox(node, frame), node.text);
        continue;
      case "point":
        box(node.id, "dot", shift(boxAround(node.at, mathSize(frame, 0.3, 0.3)), node.offset));
        break;
      case "curve":
        for (const piece of sampleCurve(node.fn, frame, node.from, node.to, 160)) stroke(node.id, piece.map(move));
        break;
      case "segment":
      case "vector":
        stroke(node.id, strokeSamples(frame, node.from, node.to).map(move));
        break;
      default: {
        const ring = outline(node);
        stroke(node.id, ring.flatMap((p, i) => (i === 0 ? [] : strokeSamples(frame, ring[i - 1]!, p).slice(1))).map(move));
        if (node.type === "polygon" && node.fill && !node.shade && node.closed && !skip(node.id, "region")) {
          out.regions.push({ owner: node.id, points: node.points.map(move) });
        }
      }
    }
    if (hasLabel(node)) box(node.id, "label", labelBox(node, frame), node.label);
  }
  if (state.axes) {
    const { x, y } = state.axes.frame;
    const { origin } = axisTicks(state.axes.frame);
    stroke(AXES_OWNER, strokeSamples(frame, [x[0], origin[1]], [x[1], origin[1]]));
    stroke(AXES_OWNER, strokeSamples(frame, [origin[0], y[0]], [origin[0], y[1]]));
    for (const tick of tickLabels(state.axes.frame)) box(AXES_OWNER, "label", boxAround(tick.at, tick.size), tick.text);
  }
  return out;
}

/** Le point est-il à l'intérieur du polygone (règle pair-impair) ? */
export function insidePolygon([x, y]: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Part d'une boîte recouverte par un polygone (grille de 5 × 3 points). */
export function regionCover(box: Box, polygon: readonly Vec2[]): number {
  let hits = 0;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 3; j++) {
      const p: Vec2 = [box.x0 + ((box.x1 - box.x0) * (i + 0.5)) / 5, box.y0 + ((box.y1 - box.y0) * (j + 0.5)) / 3];
      if (insidePolygon(p, polygon)) hits++;
    }
  }
  return hits / 15;
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
export function obstacles(state: BoardState, ignore: ReadonlySet<string>): (box: Box) => number {
  const unit = worldPerMath(state.frame);
  const boxes: Box[] = [];
  const traces: Vec2[] = [];
  for (const node of visibleNodes(state)) {
    if (ignore.has(node.id)) continue;
    const move = ([x, y]: Vec2): Vec2 => [x + node.offset[0], y + node.offset[1]];
    if (node.type === "grid") continue; // le quadrillage est un fond, pas un obstacle
    if (node.type === "text" || node.type === "point") boxes.push(nodeBox(node, state.frame));
    else if (node.type === "curve") {
      traces.push(...sampleCurve(node.fn, state.frame, node.from, node.to, 120).flat().map(move));
      // L'étiquette d'une courbe occupe sa place, comme un texte.
      if (node.label && node.labelAt) boxes.push(boxAround(move(node.labelAt), textExtent(node.label, FONT_SIZE.label, state.frame)));
    }
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

/**
 * Positions (bord gauche, milieu) des lignes de la pile, de haut en bas. Une
 * ligne ne s'écrit jamais sur un texte posé dans la figure ou sur un point :
 * elle descend d'un cran tant que la place est prise.
 */
export function calcFlow(state: BoardState, texts: readonly string[]): Vec2[] {
  const column = calcColumn(state);
  const calc = new Set(state.calc);
  const taken = visibleNodes(state)
    .filter((node) => (node.type === "text" && !calc.has(node.id)) || node.type === "point" || (node.type === "polygon" && node.fill))
    .map((node) => nodeBox(node, state.frame));
  const positions: Vec2[] = [];
  let y = column.top;
  for (const text of texts) {
    const extent = textExtent(text, FONT_SIZE.calc, state.frame);
    const lineAt = (cy: number): Box => ({ x0: column.x, x1: column.x + extent.w, y0: cy - extent.h / 2, y1: cy + extent.h / 2 });
    for (let guard = 0; guard < 20 && taken.some((box) => intersects(box, lineAt(y))); guard++) y -= column.spacing;
    positions.push([column.x, y]);
    y -= column.spacing;
  }
  return positions;
}

/** Texte des lignes de la pile, dans l'ordre. */
function calcTexts(state: BoardState): string[] {
  return state.calc.map((id) => {
    const node = state.nodes[id];
    return node?.type === "text" ? node.text : "";
  });
}

/** Où écrire une nouvelle ligne de calcul (sous les autres, sans recouvrir la figure). */
export function nextCalcSlot(state: BoardState, text: string): Vec2 {
  return calcFlow(state, [...calcTexts(state), text]).at(-1)!;
}

/**
 * Remet chaque ligne de la pile à sa place (après un ajout, un effacement ou
 * un changement de repère), en animant celles qui bougent.
 */
export function reflowCalc(state: BoardState, reveal: Reveal): BoardState {
  let next = state;
  const slots = calcFlow(state, calcTexts(state));
  state.calc.forEach((id, index) => {
    const node = next.nodes[id];
    if (!isVisible(node) || node.type !== "text") return;
    const [sx, sy] = slots[index]!;
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

/**
 * Après qu'un objet a changé de forme (matrice appliquée, transformation), les
 * textes qui l'accompagnent reprennent leur place à côté de lui, en glissant.
 */
export function followAnchors(state: BoardState, changed: readonly string[], reveal: Reveal): BoardState {
  let next = state;
  for (const id of anchoredTo(state, changed)) {
    const text = next.nodes[id];
    if (!isVisible(text) || text.type !== "text" || !text.anchor) continue;
    const targets = resolveTargets(next, text.anchor.target);
    if (targets.length === 0) continue;
    const box = union(targets.map((t) => nodeBox(next.nodes[t]!, next.frame)))!;
    const placed = placeBeside(next, textNodeExtent(text, next.frame), box, text.anchor.side, new Set([id, ...targets]));
    const now: Vec2 = [text.at[0] + text.offset[0], text.at[1] + text.offset[1]];
    next = moveNodes(next, [id], [placed.center[0] - now[0], placed.center[1] - now[1]], reveal);
  }
  return next;
}
