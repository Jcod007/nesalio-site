/**
 * Construction des objets Manim de chaque nœud du tableau, à sa position
 * dessinée, avec ses animations d'apparition.
 *
 * Une fonction par type de nœud, rangées dans une table : ajouter un type de
 * nœud, c'est écrire sa fonction et l'inscrire dans BUILDERS (le compilateur
 * signale un type oublié).
 */
import {
  Arc,
  Arrow,
  Circle,
  Create,
  DashedLine,
  DashedVMobject,
  Dot,
  FadeIn,
  GrowArrow,
  GrowFromCenter,
  Line,
  Polygon,
  type Animation,
  type Axes,
  type Mobject,
  type VMobject,
} from "manim-web";
import { sampleCurve } from "@/domain/board/geometry";
import { fontSizeOf, isUniform, matrixLayout, textWorldExtent } from "@/domain/board/layout";
import { arcPoints } from "@/domain/board/shapes";
import { applyMat, type BoardNode, type Frame, type TextNode, type Vec2 } from "@/domain/board/state";
import { hasMath } from "@/domain/board/tex";
import { compileExpression } from "@/domain/math/expr";
import { BRAND, STROKE } from "@/ui/theme";
import { rad, sub3, type Built, type PlannedAnimation, type Vec3 } from "./world";

/** Ce que le rendu prête aux constructeurs : le repère courant et ses conversions. */
export interface Pen {
  readonly frame: Frame;
  readonly axes: Axes;
  /** Point mathématique → point du monde. */
  p(x: number, y: number): Vec3;
  /** Longueur mathématique → longueur du monde. */
  worldLength(length: number): number;
  label(text: string, at: Vec3, color: string, size?: number, font?: "hand" | "body"): Mobject;
  /** Centre de l'étiquette d'un nœud, à l'écran. */
  labelPoint(node: BoardNode): Vec3 | null;
}

type NodeOf<T extends BoardNode["type"]> = Extract<BoardNode, { type: T }>;
type Builder<T extends BoardNode["type"]> = (node: NodeOf<T>, pen: Pen, color: string) => Built;

/** Les mobjects d'un nœud à sa position dessinée (sans le déplacement cumulé). */
export function buildNode(node: BoardNode, pen: Pen): Built {
  const color = STROKE[node.color ?? (node.type === "curve" ? "blue" : node.type === "vector" ? "violet" : "ink")];
  const build = BUILDERS[node.type] as Builder<BoardNode["type"]>;
  return build(node as never, pen, color);
}

/** Courbe : un tracé par morceau continu, puis son nom. */
function curve(node: NodeOf<"curve">, pen: Pen, color: string): Built {
  const f = compileExpression(node.fn);
  const pieces = sampleCurve(node.fn, pen.frame, node.from, node.to);
  const graphs = pieces.map((piece) => {
    const graph = pen.axes.plot(f, { xRange: [piece[0]![0], piece.at(-1)![0]], color, strokeWidth: node.style === "dotted" ? 7 : 4.5, numSamples: 160 });
    if (node.style === "dashed" || node.style === "dotted") {
      const length = Math.abs(piece.at(-1)![0] - piece[0]![0]);
      return new DashedVMobject({ vmobject: graph as unknown as VMobject, numDashes: Math.max(8, Math.round(length * 6)), dashRatio: node.style === "dotted" ? 0.08 : 0.55 });
    }
    return graph;
  });
  const mobjects: Mobject[] = [...graphs];
  const animations: PlannedAnimation[] = graphs.map((graph, i) => ({
    delay: i / Math.max(1, graphs.length),
    share: 1 / Math.max(1, graphs.length),
    make: (s: number) => new Create(graph, { duration: s }) as Animation,
  }));
  const last = pieces.at(-1)?.at(-1);
  if (node.label && last) {
    const text = pen.label(node.label, pen.labelPoint(node)!, color);
    mobjects.push(text);
    animations.push({ delay: 0.85, share: 0.15, make: (s) => new FadeIn(text, { duration: s }) });
  }
  return { mobjects, animations };
}

/** Point (plein ou vide), avec son anneau et son nom. */
function point(node: NodeOf<"point">, pen: Pen, color: string): Built {
  const center = pen.p(node.at[0], node.at[1]);
  // Point vide : un disque couleur du tableau masque le bout du segment, puis un cercle non rempli
  // par-dessus (c'est lui que la mise en évidence fait pulser : il reste vide).
  const disc = node.open ? new Dot({ point: center, radius: 0.085, color: BRAND.paper }) : null;
  const dot = node.open ? new Circle({ radius: 0.085, color, strokeWidth: 3.5, center }) : new Dot({ point: center, radius: 0.085, color });
  const mobjects: Mobject[] = disc ? [disc, dot] : [dot];
  const animations: PlannedAnimation[] = mobjects.map((m) => ({ delay: 0, share: 0.6, make: (s: number) => new GrowFromCenter(m, { duration: s }) as Animation }));
  if (node.ring) {
    const ring = new Circle({ radius: 0.2, color, strokeWidth: 3, center });
    mobjects.push(ring);
    animations.push({ delay: 0.2, share: 0.8, make: (s) => new Create(ring, { duration: s }) });
  }
  if (node.label) {
    const text = pen.label(node.label, pen.labelPoint(node)!, BRAND.ink);
    mobjects.push(text);
    animations.push({ delay: 0.4, share: 0.6, make: (s) => new FadeIn(text, { duration: s }) });
  }
  return { mobjects, animations };
}

/** Segment (plein ou pointillé) ou vecteur (flèche), avec son nom. */
function line(node: NodeOf<"vector" | "segment">, pen: Pen, color: string): Built {
  const from = pen.p(node.from[0], node.from[1]);
  const to = pen.p(node.to[0], node.to[1]);
  const mobjects: Mobject[] = [];
  const animations: PlannedAnimation[] = [];
  if (node.type === "vector") {
    const arrow = new Arrow({ start: from, end: to, color, strokeWidth: 5, tipLength: 0.22, tipWidth: 0.2 });
    mobjects.push(arrow);
    animations.push({ delay: 0, share: 1, make: (s) => new GrowArrow(arrow, { duration: s }) });
  } else {
    const line = node.dashed
      ? new DashedLine({ start: from, end: to, color, strokeWidth: 3, dashLength: 0.12 })
      : new Line({ start: from, end: to, color, strokeWidth: 3.5 });
    mobjects.push(line);
    animations.push({ delay: 0, share: 1, make: (s) => new Create(line, { duration: s }) });
  }
  if (node.label) {
    const text = pen.label(node.label, pen.labelPoint(node)!, color);
    mobjects.push(text);
    animations.push({ delay: 0.6, share: 0.4, make: (s) => new FadeIn(text, { duration: s }) });
  }
  return { mobjects, animations };
}

/** Arc (marque d'angle), avec son nom. */
function arc(node: NodeOf<"arc">, pen: Pen, color: string): Built {
  const center = pen.p(node.center[0], node.center[1]);
  const radius = pen.worldLength(node.radius);
  // Échelles différentes en x et en y : l'arc se dessine point par point (comme le moteur le voit).
  const arc = isUniform(pen.frame)
    ? new Arc({ center, radius, startAngle: rad(node.start), angle: rad(node.end - node.start), color, strokeWidth: 3 })
    : new Polygon({ vertices: arcPoints(node.center, node.radius, node.start, node.end, 32).map(([x, y]) => pen.p(x, y)), color, strokeWidth: 3, closed: false });
  const mobjects: Mobject[] = [arc];
  const animations: PlannedAnimation[] = [{ delay: 0, share: 0.7, make: (s) => new Create(arc, { duration: s }) }];
  if (node.label) {
    // Étiquette sur la bissectrice, juste à l'extérieur de l'arc (place choisie par le moteur).
    const text = pen.label(node.label, pen.labelPoint(node)!, color);
    mobjects.push(text);
    animations.push({ delay: 0.5, share: 0.5, make: (s) => new FadeIn(text, { duration: s }) });
  }
  return { mobjects, animations };
}

/** Cercle (ou ellipse si les échelles diffèrent), plein ou pointillé. */
function circle(node: NodeOf<"circle">, pen: Pen, color: string): Built {
  const center = pen.p(node.center[0], node.center[1]);
  const radius = pen.worldLength(node.radius);
  // Le pointillé se calcule sur le cercle centré à l'origine du monde, puis on le place :
  // DashedVMobject ignore la position d'un cercle déjà centré ailleurs (cercle décalé sinon).
  // Échelles différentes en x et en y : le cercle devient l'ellipse que montre le repère.
  const uniform = isUniform(pen.frame);
  const circle = uniform
    ? new Circle({ radius, color, strokeWidth: 3.5 })
    : new Polygon({ vertices: arcPoints([0, 0], node.radius, 0, 360, 72).map(([x, y]) => sub3(pen.p(x, y), pen.p(0, 0))), color, strokeWidth: 3.5, closed: true });
  const shape = node.dashed ? new DashedVMobject({ vmobject: circle as unknown as VMobject, numDashes: Math.max(16, Math.round(radius * 12)), dashRatio: 0.55 }) : circle;
  shape.shift(center);
  const mobjects: Mobject[] = [shape];
  const animations: PlannedAnimation[] = [{ delay: 0, share: 0.85, make: (s) => new Create(shape, { duration: s }) as Animation }];
  if (node.label) {
    const text = pen.label(node.label, pen.labelPoint(node)!, color);
    mobjects.push(text);
    animations.push({ delay: 0.7, share: 0.3, make: (s) => new FadeIn(text, { duration: s }) });
  }
  return { mobjects, animations };
}

/** Polygone ou ligne brisée, rempli ou non, avec son nom. */
function polygon(node: NodeOf<"polygon">, pen: Pen, color: string): Built {
  const vertices = node.points.map(([x, y]) => pen.p(x, y));
  const polygon = new Polygon({
    vertices,
    color,
    fillOpacity: node.shade ? 0.38 : node.fill ? 0.16 : 0,
    strokeWidth: node.shade ? 1.5 : node.param ? 3.5 : 3.2,
    closed: node.closed,
  });
  const outline = node.dashed
    ? new DashedVMobject({ vmobject: polygon as unknown as VMobject, numDashes: Math.max(12, node.points.length * 6), dashRatio: 0.55 })
    : polygon;
  const mobjects: Mobject[] = [outline];
  const animations: PlannedAnimation[] = [{ delay: 0, share: 0.85, make: (s) => new Create(outline, { duration: s }) }];
  if (node.label) {
    // Une courbe paramétrée porte son nom au bout ; un polygone, en son centre (place choisie par le moteur).
    const text = pen.label(node.label, pen.labelPoint(node)!, color);
    mobjects.push(text);
    animations.push({ delay: 0.7, share: 0.3, make: (s) => new FadeIn(text, { duration: s }) });
  }
  return { mobjects, animations };
}

/** Quadrillage, image du quadrillage unité par une matrice. */
function grid(node: NodeOf<"grid">, pen: Pen, _color: string): Built {
  // Une ligne par unité, image du quadrillage par la matrice ; en fond, discrète.
  const lines: Mobject[] = [];
  const segment = (a: Vec2, b: Vec2) => {
    const line = new Line({ start: pen.p(...applyMat(node.matrix, a)), end: pen.p(...applyMat(node.matrix, b)), color: STROKE[node.color ?? "blue"], strokeWidth: 1.6 });
    line.opacity = 0.45;
    lines.push(line);
  };
  for (let x = Math.ceil(node.x[0]); x <= Math.floor(node.x[1]); x++) segment([x, node.y[0]], [x, node.y[1]]);
  for (let y = Math.ceil(node.y[0]); y <= Math.floor(node.y[1]); y++) segment([node.x[0], y], [node.x[1], y]);
  return {
    mobjects: lines,
    animations: lines.map((line, i) => ({ delay: (i / lines.length) * 0.5, share: 0.5, make: (s: number) => new Create(line, { duration: s }) })),
  };
}

/** Texte, formule ou ligne de calcul (alignée à gauche). */
function text(node: NodeOf<"text">, pen: Pen, color: string): Built {
  if (node.rows) return buildMatrix({ ...node, rows: node.rows }, pen, color);
  const at = pen.p(node.at[0], node.at[1]);
  const math = hasMath(node.text);
  // Ligne de calcul : alignée à gauche sur sa colonne (une formule, d'après sa boîte : elle se rend plus tard).
  const half = math && node.align === "left" ? textWorldExtent(node.text, fontSizeOf(node)).w / 2 : 0;
  const text = pen.label(node.text, [at[0] + half, at[1], at[2]], color, fontSizeOf(node));
  if (node.align === "left" && !math) text.shift([textHalfWidth(text), 0, 0]);
  return {
    mobjects: [text],
    animations: [{ delay: 0, share: 1, make: (s) => new FadeIn(text, { duration: s, shift: [0, -0.12, 0] }) }],
  };
}

/** Matrice ou vecteur colonne : les cases en grille, entre deux crochets. */
function buildMatrix(node: TextNode & { rows: string[][] }, pen: Pen, color: string): Built {
  const size = fontSizeOf(node);
  const layout = matrixLayout(node.rows, size);
  const center = pen.p(node.at[0], node.at[1]);
  const left = center[0] - layout.width / 2;
  const top = center[1] + layout.height / 2;
  const inner = left + layout.bracket + layout.gap * 0.6;
  const mobjects: Mobject[] = [];
  node.rows.forEach((row, i) => {
    let x = inner;
    row.forEach((cell, j) => {
      const width = layout.widths[j]!;
      mobjects.push(pen.label(cell, [x + width / 2, top - layout.lineHeight * (i + 0.5), 0], color, size));
      x += width + layout.gap;
    });
  });
  const bottom = top - layout.height;
  const right = left + layout.width;
  const tick = layout.bracket;
  const bracket = (x: number, dir: 1 | -1) =>
    new Polygon({ vertices: [[x + dir * tick, top, 0], [x, top, 0], [x, bottom, 0], [x + dir * tick, bottom, 0]], color, strokeWidth: 2.6, closed: false });
  const brackets = [bracket(left, 1), bracket(right, -1)];
  const all = [...mobjects, ...brackets];
  return {
    mobjects: all,
    animations: [
      ...brackets.map((b) => ({ delay: 0, share: 0.4, make: (s: number) => new Create(b, { duration: s }) as Animation })),
      ...mobjects.map((m, i) => ({ delay: 0.3 + (0.5 * i) / Math.max(1, mobjects.length), share: 0.3, make: (s: number) => new FadeIn(m, { duration: s }) as Animation })),
    ],
  };
}

const BUILDERS: { [T in BoardNode["type"]]: Builder<T> } = {
  curve,
  point,
  vector: line,
  segment: line,
  arc,
  circle,
  polygon,
  grid,
  text,
};

function textHalfWidth(mobject: Mobject): number {
  try {
    return mobject.getWidth() / 2;
  } catch {
    return 0;
  }
}
