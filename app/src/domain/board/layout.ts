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
import { hasMath, mathSize as texSize } from "./tex";
import { arcPoints, insidePolygon } from "./shapes";
import {
  anchoredTo,
  isVisible,
  moveNodes,
  putNode,
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

/**
 * Au-delà de ce rapport entre les échelles naturelles des deux axes, chaque axe
 * prend sa propre échelle : un repère de 0 à 2000 billets et de 0 à 50 000 $
 * n'est plus écrasé en une colonne illisible. En deçà, même échelle en x et
 * en y (angles, cercles et figures restent justes).
 */
export const UNIFORM_RATIO = 3;

/** Unités du monde Manim par unité mathématique, sur chaque axe. */
export function scales(frame: Frame): { x: number; y: number } {
  const x = AXES_BOX.width / (frame.x[1] - frame.x[0]);
  const y = AXES_BOX.height / (frame.y[1] - frame.y[0]);
  if (Math.max(x, y) / Math.min(x, y) > UNIFORM_RATIO) return { x, y };
  const u = Math.min(x, y);
  return { x: u, y: u };
}

/** Le repère a-t-il la même échelle sur les deux axes ? */
export function isUniform(frame: Frame): boolean {
  const s = scales(frame);
  return Math.abs(s.x - s.y) <= 1e-12 * Math.max(s.x, s.y);
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
  const world = textWorldExtent(text, fontSize);
  return mathSize(frame, world.w, world.h);
}

/**
 * Taille d'un texte dans le monde de Manim (indépendante du repère). Une formule entre dollars
 * (board/tex.ts) prend la place estimée de la formule rendue : plus large, plus haute pour une
 * fraction. Le rendu fait tenir la formule dans cette boîte.
 */
export function textWorldExtent(text: string, fontSize: number): Extent {
  if (hasMath(text)) {
    const size = texSize(text);
    return { w: size.w * fontSize * WIDTH_PER_POINT_PER_CHAR, h: size.h * fontSize * HEIGHT_PER_POINT };
  }
  const chars = Math.max(1, Array.from(text).length);
  return { w: chars * fontSize * WIDTH_PER_POINT_PER_CHAR, h: fontSize * HEIGHT_PER_POINT };
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
  const s = scales(frame);
  const along = ([a, b]: [number, number], step: number): number[] => {
    const out: number[] = [];
    for (let v = Math.ceil(a / step - 1e-9) * step; v <= b - step * 0.5; v += step) {
      const rounded = Number((Math.round(v / step) * step).toPrecision(12));
      if (Math.abs(rounded) > 1e-9) out.push(rounded);
    }
    return out;
  };
  /**
   * Pas lisible : le pas demandé (ou un pas rond), élargi tant que deux chiffres
   * voisins se toucheraient. Sur l'axe des x, la largeur du plus long chiffre
   * plus un blanc ; sur l'axe des y, la hauteur d'un chiffre plus un blanc.
   */
  const readable = (range: [number, number], unit: number, requested: number | undefined, target: number, room: (step: number) => number) => {
    const span = range[1] - range[0];
    let step = requested && requested > 0 ? requested : niceStep(span, target);
    // Pas plus de 60 graduations, quel que soit le pas demandé.
    while (span / step > 60) step = nextStep(step, requested);
    for (let guard = 0; guard < 40 && step * unit < room(step); guard++) step = nextStep(step, requested);
    return step;
  };
  const widest = (range: [number, number], step: number) =>
    Math.max(1, ...along(range, step).map((v) => Array.from(tickText(v)).length)) * TICK_WIDTH_PER_CHAR;
  const xStep = readable(frame.x, s.x, frame.xStep, 8, (step) => widest(frame.x, step) + 0.12);
  const yStep = readable(frame.y, s.y, frame.yStep, 7, () => TICK_HEIGHT + 0.16);
  return {
    x: { step: xStep, values: along(frame.x, xStep) },
    y: { step: yStep, values: along(frame.y, yStep) },
    origin: [clamp(0, frame.x), clamp(0, frame.y)],
  };
}

/**
 * Pas suivant, plus large : un multiple du pas demandé (10 → 20 → 50 → 100…),
 * sinon le pas rond suivant (1, 2, 5 × 10ⁿ).
 */
function nextStep(step: number, requested: number | undefined): number {
  if (requested && requested > 0) {
    const k = step / requested;
    const power = Math.pow(10, Math.floor(Math.log10(k) + 1e-9));
    const unit = k / power;
    const next = unit < 1.5 ? 2 : unit < 3.5 ? 5 : 10;
    return requested * next * power;
  }
  return niceStep(step * 1.5, 1);
}

/** Chiffre d'une graduation, à la québécoise : virgule décimale, espace entre les milliers (25 000). */
export function tickText(value: number): string {
  const text = formatNumber(value);
  const [whole, decimals] = text.split(",");
  const sign = whole!.startsWith("-") ? "-" : "";
  const digits = whole!.replace("-", "");
  const grouped = digits.length > 4 ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ") : digits;
  return sign + grouped + (decimals ? `,${decimals}` : "");
}

/** Centre et taille (coordonnées mathématiques) de chaque chiffre des graduations. */
export function tickLabels(frame: Frame): Array<{ axis: "x" | "y"; value: number; text: string; at: Vec2; size: Extent }> {
  const { x, y, origin } = axisTicks(frame);
  const s = scales(frame);
  const size = (text: string) => mathSize(frame, Array.from(text).length * TICK_WIDTH_PER_CHAR, TICK_HEIGHT);
  return [
    ...x.values.map((v) => ({ axis: "x" as const, value: v, text: tickText(v), at: [v, origin[1] - 0.28 / s.y] as Vec2, size: size(tickText(v)) })),
    // Chiffres de l'axe des y alignés à droite, à distance fixe de l'axe (« 45 000 » ne mord pas sur l'axe).
    ...y.values.map((v) => {
      const extent = size(tickText(v));
      return { axis: "y" as const, value: v, text: tickText(v), at: [origin[0] - 0.18 / s.x - extent.w / 2, v] as Vec2, size: extent };
    }),
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

/**
 * Sans repère, le cadre s'agrandit pour contenir une figure qui en déborde (Pythagore 6-8 avec
 * ses carrés, un cercle de rayon 5). Sinon la caméra dézoome pour tout montrer et le texte,
 * de taille fixe dans le monde, devient illisible (séances du 19 octobre). Le cadre ne
 * rapetisse jamais (sauf "clear") ; les étiquettes déjà posées reprennent leur place.
 * `box` : la figure qui arrive, en coordonnées mathématiques.
 */
export function fitFrame(state: BoardState, box: Box): BoardState {
  if (state.axes) return state;
  const f = state.frame;
  const margin = Math.max(box.x1 - box.x0, box.y1 - box.y0) * 0.1 + 0.6;
  const x0 = box.x0 < f.x[0] ? box.x0 - margin : f.x[0];
  const x1 = box.x1 > f.x[1] ? box.x1 + margin : f.x[1];
  const y0 = box.y0 < f.y[0] ? box.y0 - margin : f.y[0];
  const y1 = box.y1 > f.y[1] ? box.y1 + margin : f.y[1];
  if (x0 === f.x[0] && x1 === f.x[1] && y0 === f.y[0] && y1 === f.y[1]) return state;
  let next: BoardState = { ...state, frame: { ...f, x: [x0, x1], y: [y0, y1] } };
  for (const node of visibleNodes(next)) if (hasLabel(node)) next = placeLabel(next, node.id);
  return next;
}

/** Tout ce qui est au tableau : la caméra cadre cette zone. */
export function contentBox(state: BoardState): Box {
  const parts = [figureBox(state), ...visibleNodes(state).map((node) => nodeBox(node, state.frame))];
  return union(parts)!;
}

/* -------------------------------- placement -------------------------------- */

const SIDES: Side[] = ["right", "above", "below", "left"];

/** Centre d'une boîte de taille `size` posée du côté `side` de `target`. */
function besideCenter(target: Box, size: Extent, side: Side, gap: Extent): Vec2 {
  const [cx, cy] = boxCenter(target);
  switch (side) {
    case "right":
      return [target.x1 + gap.w + size.w / 2, cy];
    case "left":
      return [target.x0 - gap.w - size.w / 2, cy];
    case "above":
      return [cx, target.y1 + gap.h + size.h / 2];
    case "below":
      return [cx, target.y0 - gap.h - size.h / 2];
  }
}

/**
 * Où poser une boîte de taille `size` à côté de `target` : le côté demandé
 * s'il est libre, sinon le premier côté libre, sinon le côté demandé quand même.
 * `ignore` : nœuds à ne pas considérer comme des obstacles (la cible, ce qui bouge avec).
 */
export function placeBeside(
  state: BoardState,
  size: Extent,
  target: Box,
  side: Side | undefined,
  ignore: ReadonlySet<string>,
  keep: ReadonlySet<string> = new Set(),
): { center: Vec2; side: Side } {
  const s = scales(state.frame);
  // Les objets ignorés (la cible) ne gênent pas, sauf leurs étiquettes (`keep`) : un texte posé
  // à côté d'un point ne recouvre pas le nom du point.
  const clutter = obstacles(state, new Set(), (owner, part) => ignore.has(owner) && !(part === "label" && keep.has(owner)));
  const order = side ? [side, ...SIDES.filter((s) => s !== side)] : SIDES;
  // Le côté demandé s'il est libre ; sinon le premier côté libre ; sinon un peu plus loin ;
  // en dernier recours, l'emplacement le moins encombré.
  let best: { center: Vec2; side: Side; score: number } | null = null;
  const candidates = (distance: number): Array<{ side: Side; center: Vec2 }> => {
    // Écart en unités du monde (le même à l'écran sur les deux axes), puis en coordonnées mathématiques.
    const world = GAP * distance + (distance > 1 ? size.h * s.y * (distance - 1) * 0.5 : 0);
    const away = mathSize(state.frame, world, world);
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
  for (const distance of [1, 2.5]) {
    for (const { side: candidate, center } of candidates(distance)) {
      const crowd = clutter(padded(state.frame, boxAround(center, size)));
      if (crowd < FREE) return { center, side: candidate };
      const score = crowd + (distance - 1) * 0.01;
      if (!best || score < best.score) best = { center, side: candidate, score };
    }
  }
  // Aucun côté libre : la place libre la plus proche du côté demandé.
  const preferred = candidates(1)[0]!;
  return { center: placeNear(state, size, preferred.center, clutter), side: preferred.side };
}

const inside = ([x, y]: Vec2, b: Box) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1;

/** En dessous de ce score, une place est libre. */
const FREE = 0.02;

/**
 * Mesure de l'encombrement d'une zone (0 = libre), sur les empreintes de ce qui
 * est au tableau : boîtes recouvertes (textes, étiquettes, pastilles des
 * points, chiffres des axes), traits qui la traversent, surfaces remplies.
 * `ignore` : objets à ne pas compter du tout ; `skip` : morceaux précis à ne
 * pas compter (l'étiquette ou la surface d'un objet qui place sa propre étiquette).
 */
export function obstacles(state: BoardState, ignore: ReadonlySet<string>, skip?: (owner: string, part: Part) => boolean): (box: Box) => number {
  return crowding(footprints(state, (owner, part) => ignore.has(owner) || (skip?.(owner, part) ?? false)));
}

/** Encombrement d'une boîte par des empreintes données. */
export function crowding(prints: Footprints): (box: Box) => number {
  return (box) => {
    const area = (box.x1 - box.x0) * (box.y1 - box.y0) || 1;
    let score = 0;
    for (const { box: b } of prints.boxes) {
      if (!intersects(b, box)) continue;
      // Part recouverte de la plus petite des deux boîtes : un chiffre entièrement caché sous un long texte compte plein.
      const inter = (Math.min(b.x1, box.x1) - Math.max(b.x0, box.x0)) * (Math.min(b.y1, box.y1) - Math.max(b.y0, box.y0));
      score += inter / Math.min(area, (b.x1 - b.x0) * (b.y1 - b.y0) || area);
    }
    for (const { points } of prints.strokes) for (const p of points) if (inside(p, box)) score += 0.05;
    for (const { points } of prints.regions) score += regionCover(box, points);
    return score;
  };
}

/** La boîte, agrandie d'un petit blanc tout autour (unités du monde) : deux textes ne se collent pas. */
function padded(frame: Frame, box: Box, margin = 0.06): Box {
  const pad = mathSize(frame, margin, margin);
  return { x0: box.x0 - pad.w, x1: box.x1 + pad.w, y0: box.y0 - pad.h, y1: box.y1 + pad.h };
}

/**
 * La place libre la plus proche de `desired` pour une boîte de taille `size` :
 * l'endroit demandé s'il est libre, sinon on s'en éloigne par petits pas (anneaux
 * de 0,12 unité du monde), et l'on garde la première place libre trouvée, la plus
 * proche. Faute de place libre à moins de 4 unités, la moins encombrée.
 */
export function placeNear(state: BoardState, size: Extent, desired: Vec2, score: (box: Box) => number): Vec2 {
  const frame = state.frame;
  const s = scales(frame);
  const cost = (center: Vec2) => score(padded(frame, boxAround(center, size)));
  const here = cost(desired);
  if (here < FREE) return desired;
  let best = { center: desired, value: here };
  const STEP = 0.12;
  for (let k = 1; k <= 34; k++) {
    const r = k * STEP;
    const n = Math.min(48, Math.max(8, Math.round((2 * Math.PI * r) / STEP)));
    let found: Vec2 | null = null;
    for (let i = 0; i < n; i++) {
      // Tour de l'anneau en partant du haut, alternativement à droite et à gauche.
      const turn = Math.ceil(i / 2) * (i % 2 === 0 ? -1 : 1);
      const a = Math.PI / 2 + (turn * 2 * Math.PI) / n;
      const center: Vec2 = [desired[0] + (Math.cos(a) * r) / s.x, desired[1] + (Math.sin(a) * r) / s.y];
      const value = cost(center);
      if (value < FREE) {
        found = center;
        break;
      }
      if (value + r * 0.02 < best.value) best = { center, value: value + r * 0.02 };
    }
    if (found) return found;
  }
  return best.center;
}

/* --------------------------- place des étiquettes --------------------------- */

/**
 * Surfaces remplies qui recouvrent déjà les objets donnés (le milieu d'un côté
 * sous un carré, un point dans un polygone) : un texte qui nomme ces objets
 * peut s'y poser, sinon il serait exilé loin de ce qu'il désigne.
 */
function regionsOver(state: BoardState, ids: readonly string[]): Set<string> {
  const centers = ids.flatMap((id) => {
    const node = state.nodes[id];
    return isVisible(node) ? [boxCenter(bodyBox(node, state.frame))] : [];
  });
  const over = new Set<string>();
  for (const node of visibleNodes(state)) {
    if (node.type !== "polygon" || !node.fill || node.shade || !node.closed || ids.includes(node.id)) continue;
    const ring = node.points.map(([x, y]) => [x + node.offset[0], y + node.offset[1]] as Vec2);
    // Franchement à l'intérieur : un côté qui borde le carré (le milieu sur son bord) n'est pas recouvert.
    const e = mathSize(state.frame, 0.02, 0.02);
    const within = (c: Vec2) => [[0, 0], [e.w, 0], [-e.w, 0], [0, e.h], [0, -e.h]].every(([dx, dy]) => insidePolygon([c[0] + dx!, c[1] + dy!], ring));
    if (centers.some(within)) over.add(node.id);
  }
  return over;
}

/**
 * Surfaces sur lesquelles le texte (ou l'étiquette) de `owner` a le droit de se
 * poser : celles qui recouvrent déjà ce qu'il nomme. Partagé avec la mesure.
 */
export function namingRegions(state: BoardState, owner: string): Set<string> {
  const node = state.nodes[owner];
  if (!isVisible(node)) return new Set();
  if (node.type === "text") return node.anchor ? regionsOver(state, resolveTargets(state, node.anchor.target)) : new Set();
  return regionsOver(state, [owner]);
}

/** Ce que l'on ne compte pas comme obstacle pour un texte qui nomme `targets` (`self` : le texte, ou l'objet de l'étiquette). */
function namingSkip(state: BoardState, self: string, targets: readonly string[], ownBody: boolean): (owner: string, part: Part) => boolean {
  const over = regionsOver(state, targets);
  return (owner, part) =>
    (owner === self && (ownBody ? part === "body" || part === "label" || part === "region" : part === "label" || part === "region")) ||
    (part === "region" && over.has(owner));
}

/** Ce qu'un objet ne compte pas comme obstacle pour sa propre étiquette : l'étiquette elle-même, sa surface, et les surfaces qui le recouvrent. */
const ownLabel = (state: BoardState, id: string) => namingSkip(state, id, [id], false);

/** Ce qu'un texte ne compte pas : lui-même, et les surfaces qui recouvrent déjà l'objet qu'il accompagne. */
const ownText = (state: BoardState, node: TextNode) => {
  const targets = node.anchor ? resolveTargets(state, node.anchor.target) : [];
  return namingSkip(state, node.id, targets, true);
};

/**
 * Pose l'étiquette d'un objet (déjà au tableau) à la place libre la plus proche
 * de sa place habituelle : à côté du point, du milieu du segment, du bout du
 * vecteur… Elle évite les textes, les autres étiquettes, les points, les traits
 * (y compris celui de l'objet) et les surfaces remplies.
 */
export function placeLabel(state: BoardState, id: string): BoardState {
  const node = state.nodes[id];
  if (!isVisible(node) || !hasLabel(node)) return state;
  const desired = defaultLabelCenter(node, state.frame);
  if (!desired) return state;
  const size = textExtent(node.label, FONT_SIZE.label, state.frame);
  const [dx, dy] = node.offset;
  const at = placeNear(state, size, [desired[0] + dx, desired[1] + dy], obstacles(state, new Set(), ownLabel(state, id)));
  return putNode(state, { ...node, labelAt: [at[0] - dx, at[1] - dy] });
}

/** Un texte libre (posé avec "at", ou étiquette d'une figure) : à la place libre la plus proche de celle demandée. */
export function placeText(state: BoardState, node: TextNode): TextNode {
  const box = nodeBox(node, state.frame);
  const center = boxCenter(box);
  const to = placeNear(state, boxExtent(box), center, obstacles(state, new Set(), ownText(state, node)));
  if (to === center) return node;
  return { ...node, at: [node.at[0] + to[0] - center[0], node.at[1] + to[1] - center[1]] };
}

/**
 * Fait de la place à des objets qui viennent d'arriver (`arrived` : leurs
 * identifiants, ou AXES_OWNER pour un nouveau repère). Les textes libres et les
 * étiquettes déjà au tableau qu'ils recouvrent glissent jusqu'à la place libre
 * la plus proche ; rien d'autre ne bouge. Les objets eux-mêmes gardent leur
 * place (elle a un sens mathématique) et la pile de calculs se range seule.
 */
export function makeWay(state: BoardState, arrived: readonly string[], reveal: Reveal): BoardState {
  const fresh = new Set(arrived);
  const calc = new Set(state.calc);
  let next = state;
  /** Les nouveaux venus gênent-ils cette boîte (hors ce que `skip` permet) ? */
  const hit = (box: Box, skip: (owner: string, part: Part) => boolean) => crowding(footprints(next, (owner, part) => !fresh.has(owner) || skip(owner, part)))(box) >= FREE;
  for (const id of state.order) {
    const node = next.nodes[id];
    if (!isVisible(node) || fresh.has(id) || calc.has(id)) continue;
    if (node.type === "text") {
      const box = nodeBox(node, next.frame);
      const skip = ownText(next, node);
      if (!hit(box, skip)) continue;
      const center = boxCenter(box);
      const to = placeNear(next, boxExtent(box), center, obstacles(next, new Set(), skip));
      next = moveNodes(next, [id], [to[0] - center[0], to[1] - center[1]], reveal);
    } else if (hasLabel(node)) {
      const box = labelBox(node, next.frame);
      const skip = ownLabel(next, id);
      if (!box || !hit(box, skip)) continue;
      const center = boxCenter(box);
      const to = placeNear(next, boxExtent(box), center, obstacles(next, new Set(), skip));
      // L'étiquette change de place : le rendu la fait glisser (transformation de l'objet).
      next = putNode(next, { ...node, labelAt: [to[0] - node.offset[0], to[1] - node.offset[1]], morph: reveal });
    }
  }
  return next;
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
  const s = scales(state.frame);
  const figure = figureBox(state);
  const lineHeight = (FONT_SIZE.calc * HEIGHT_PER_POINT) / s.y;
  const spacing = lineHeight * CALC_LINE_SPACING;
  const height = figure.y1 - figure.y0;
  return {
    x: figure.x1 + CALC_MARGIN / s.x,
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
    const box = union(targets.map((t) => bodyBox(next.nodes[t]!, next.frame)))!;
    const placed = placeBeside(next, textNodeExtent(text, next.frame), box, text.anchor.side, new Set([id, ...targets]), new Set(targets));
    const now: Vec2 = [text.at[0] + text.offset[0], text.at[1] + text.offset[1]];
    next = moveNodes(next, [id], [placed.center[0] - now[0], placed.center[1] - now[1]], reveal);
  }
  return next;
}
