import { niceStep } from "@/domain/board/geometry";
import { FONT_SIZE, matrixLayout, textWorldExtent } from "@/domain/board/layout";
import { compileNamedExpression } from "@/domain/math/expr";
import type { MathContext, MatrixParams, SceneObject } from "./contract";
import { union, type Box, type Point } from "./placement";
import type { MeasureObject, Measurement } from "./sceneState";

function centered(width: number, height: number): Box {
  return { x0: -width / 2, y0: -height / 2, x1: width / 2, y1: height / 2 };
}

function enclosing(points: readonly Point[], padding: number): Box {
  const box = union(points.map(([x, y]) => ({ x0: x, y0: y, x1: x, y1: y })));
  if (!box) throw new Error("Aucune géométrie définie dans le domaine demandé.");
  return { x0: box.x0 - padding, y0: box.y0 - padding, x1: box.x1 + padding, y1: box.y1 + padding };
}

/** Where a segment from `a` (inside) towards `b` leaves the window. */
function exitPoint(a: Point, b: Point, window: Box): Point {
  let t = 1;
  const [ax, ay] = a;
  const [dx, dy] = [b[0] - ax, b[1] - ay];
  if (dx > 0 && ax + dx > window.x1) t = Math.min(t, (window.x1 - ax) / dx);
  if (dx < 0 && ax + dx < window.x0) t = Math.min(t, (window.x0 - ax) / dx);
  if (dy > 0 && ay + dy > window.y1) t = Math.min(t, (window.y1 - ay) / dy);
  if (dy < 0 && ay + dy < window.y0) t = Math.min(t, (window.y0 - ay) / dy);
  return [ax + dx * t, ay + dy * t];
}

const within = ([x, y]: Point, w: Box) => x >= w.x0 && x <= w.x1 && y >= w.y0 && y <= w.y1;

/**
 * A curve drawn on axes stops at their edges (`window`, in the frame's coordinates):
 * the pieces outside are cut, and each cut ends exactly on the edge.
 */
function clipToWindow(pieces: Point[][], window: Box): Point[][] {
  const result: Point[][] = [];
  for (const piece of pieces) {
    let current: Point[] = [];
    piece.forEach((point, index) => {
      const previous = piece[index - 1];
      const inside = within(point, window);
      if (inside) {
        if (previous && !within(previous, window)) current.push(exitPoint(point, previous, window));
        current.push(point);
      } else if (previous && within(previous, window)) {
        current.push(exitPoint(previous, point, window));
        result.push(current);
        current = [];
      }
    });
    result.push(current);
  }
  return result.filter((piece) => piece.length > 1);
}

export function sampleSceneCurve(
  object: Extract<SceneObject, { type: "function_graph" | "parametric_curve" }>, values: ReadonlyMap<string, number>, window?: Box,
): Point[][] {
  const isGraph = object.type === "function_graph";
  const independent = isGraph ? "x" : "t";
  const names = new Set([...values.keys(), independent]);
  const inputs = new Map(values);
  const y = compileNamedExpression(isGraph ? object.params.expression : object.params.y, names);
  const x = isGraph ? undefined : compileNamedExpression(object.params.x, names);
  const [min, max] = object.params.domain ?? [-6, 6];
  const pieces: Point[][] = [[]];
  for (let i = 0; i <= 160; i++) {
    const parameter = min + (max - min) * (i / 160);
    inputs.set(independent, parameter);
    const px = x ? x(inputs) : parameter;
    const py = y(inputs);
    if (px !== null && py !== null) pieces.at(-1)!.push([px, py]);
    else if (pieces.at(-1)!.length) pieces.push([]);
  }
  const drawn = pieces.filter((piece) => piece.length > 1);
  if (!window) return drawn;
  // Entirely off its axes is the lesson's mistake: the curve is kept whole rather than losing the tranche.
  const clipped = clipToWindow(drawn, window);
  return clipped.length ? clipped : drawn;
}

/** Declared parameters (math_context, kind "parameter") that an object's geometry depends on. */
export function parametersOf(object: SceneObject, math: MathContext): string[] {
  const parameters = Object.entries(math.symbols).filter(([, symbol]) => symbol.kind === "parameter").map(([name]) => name);
  if (object.type === "triangle_right") {
    return [object.params.leg_a, object.params.leg_b].flatMap((leg) => typeof leg !== "number" && "parameter" in leg ? [leg.parameter] : []);
  }
  if (object.type !== "function_graph" && object.type !== "parametric_curve") return [];
  const sources = object.type === "function_graph" ? [object.params.expression] : [object.params.x, object.params.y];
  return parameters.filter((name) => sources.some((source) => new RegExp(`(^|[^A-Za-z0-9_])${name}($|[^A-Za-z0-9_])`).test(source)));
}

/** Union of a curve's box over a grid of its parameters' values (current values included). */
function parameterReserve(
  object: Extract<SceneObject, { type: "function_graph" | "parametric_curve" }>,
  values: ReadonlyMap<string, number>, math: MathContext, window: Box | undefined, body: Box,
): Box | undefined {
  const parameters = parametersOf(object, math);
  if (!parameters.length) return undefined;
  const steps = parameters.length > 1 ? 4 : 8;
  let grids: Map<string, number>[] = [new Map(values)];
  for (const name of parameters) {
    const symbol = math.symbols[name];
    if (symbol?.kind !== "parameter") continue;
    grids = grids.flatMap((grid) => Array.from({ length: steps + 1 }, (_, i) =>
      new Map(grid).set(name, symbol.min + (symbol.max - symbol.min) * (i / steps))));
  }
  const boxes = grids.map((grid) => {
    const points = sampleSceneCurve(object, grid, window).flat();
    return points.length ? enclosing(points, 0.03) : null;
  });
  return union([body, ...boxes]) ?? undefined;
}

export function triangleMeasurement(
  object: Extract<SceneObject, { type: "triangle_right" }>, values: ReadonlyMap<string, number>, math: MathContext,
): Measurement {
  function length(value: typeof object.params.leg_a): number {
    if (typeof value === "number") return value;
    const name = "symbol" in value ? value.symbol : value.parameter;
    const resolved = values.get(name);
    if (resolved === undefined || resolved <= 0) throw new Error(`Longueur indisponible pour « ${name} ».`);
    return resolved;
  }
  function largest(value: typeof object.params.leg_a): number {
    const parameter = typeof value !== "number" && "parameter" in value && Object.hasOwn(math.symbols, value.parameter)
      ? math.symbols[value.parameter] : undefined;
    return parameter && parameter.kind === "parameter" ? parameter.max : length(value);
  }
  const { leg_a, leg_b } = object.params;
  const a = length(leg_a);
  const b = length(leg_b);
  return {
    body: { x0: 0, y0: 0, x1: a, y1: b },
    reserve: { x0: 0, y0: 0, x1: largest(leg_a), y1: largest(leg_b) },
    anchors: {
      side_a: { point: [a / 2, 0], outward: "down" },
      side_b: { point: [0, b / 2], outward: "left" },
      hypotenuse: { point: [a / 2, b / 2], outward: "up" },
    },
  };
}

export function sceneText(object: Extract<SceneObject, { type: "text" | "label" | "callout" | "math" }>, values: ReadonlyMap<string, number>, math: MathContext): string {
  if (typeof object.content === "string") return object.content;
  const { expression_ref: id, template, precision } = object.content;
  if (!Object.hasOwn(math.expressions, id)) throw new Error(`Expression indisponible « ${id} ».`);
  const value = compileNamedExpression(math.expressions[id]!, new Set(values.keys()))(values);
  if (value === null) return template.replaceAll("{value}", "—");
  // French writing: decimal comma, minus sign, no "−0". The board draws a computed value as plain
  // text (NesalioProjection prepares only fixed formulas), so no LaTeX such as {,} here.
  const fixed = value.toFixed(precision).replace(/^-(?=[0.]+$)/, "");
  return template.replaceAll("{value}", fixed.replace(".", ",").replace("-", "−"));
}

/** Thin boxes along a path: what a text must avoid, instead of the path's whole rectangle. */
function strokeBoxes(points: readonly Point[], closed = false, thickness = 0.06): Box[] {
  const path = closed && points.length > 2 ? [...points, points[0]!] : points;
  const boxes: Box[] = [];
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1]!;
    const [bx, by] = path[i]!;
    // Long diagonal segments are cut so that their boxes stay close to the stroke.
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.5));
    for (let s = 0; s < steps; s++) {
      const p = [ax + (bx - ax) * (s / steps), ay + (by - ay) * (s / steps)] as const;
      const q = [ax + (bx - ax) * ((s + 1) / steps), ay + (by - ay) * ((s + 1) / steps)] as const;
      boxes.push(enclosing([p, q], thickness));
    }
  }
  return boxes;
}

/** A matrix is drawn as a grid table as soon as it has titles or a non-numeric cell. */
export function isTable(params: MatrixParams): boolean {
  return params.row_labels !== undefined || params.column_labels !== undefined
    || params.rows.some((row) => row.some((cell) => typeof cell !== "number"));
}

/** Header row (if any), then each row: its title first, numbers in French, blank cells empty. */
export function tableRows(params: MatrixParams): string[][] {
  const write = (value: number | string | null) => typeof value === "number"
    ? String(value).replace(".", ",").replace("-", "−") : value ?? "";
  const titled = params.row_labels !== undefined;
  const columns = params.rows[0]?.length ?? 0;
  const header = params.column_labels
    ? [[...titled && params.column_labels.length === columns ? [""] : [], ...params.column_labels]] : [];
  return [...header, ...params.rows.map((row, i) => [...titled ? [params.row_labels![i] ?? ""] : [], ...row.map(write)])];
}

/**
 * Parts (contract `matrixParts`) a cell of the drawn table belongs to, by its
 * position in `tableRows`: a data cell, its row and its column; a row title its
 * row; a column header its column; the corner none.
 */
export function tableCellParts(params: MatrixParams, row: number, column: number): string[] {
  const i = row - (params.column_labels ? 1 : 0) + 1;
  const j = column - (params.row_labels ? 1 : 0) + 1;
  if (i >= 1 && j >= 1) return [`r${i}c${j}`, `r${i}`, `c${j}`];
  if (i >= 1) return [`r${i}`];
  if (j >= 1) return [`c${j}`];
  return [];
}

/**
 * A table of values drawn as a grid, centred on its position: where each cell's
 * text stands and the grid's lines, in world units. Shared by placement and drawing.
 */
export function tableLayout(rows: readonly (readonly string[])[], fontSize: number) {
  const { widths, lineHeight } = matrixLayout(rows, fontSize);
  const pad = 0.3;
  const columns = widths.map((w) => w + 2 * pad);
  const rowHeight = lineHeight + 0.25;
  const width = columns.reduce((a, b) => a + b, 0);
  const height = rowHeight * rows.length;
  const left = -width / 2, top = height / 2;
  const starts = columns.map((_, j) => left + columns.slice(0, j).reduce((a, b) => a + b, 0));
  const cells = rows.flatMap((row, i) => row.map((text, j) => ({ text, row: i, column: j,
    at: [starts[j]! + columns[j]! / 2, top - (i + 0.5) * rowHeight] as Point,
    box: { x0: starts[j]!, y0: top - (i + 1) * rowHeight, x1: starts[j]! + columns[j]!, y1: top - i * rowHeight } as Box })));
  const lines: [Point, Point][] = [
    [[left, top], [-left, top]], [[left, -top], [-left, -top]], [[left, top], [left, -top]], [[-left, top], [-left, -top]],
    ...rows.slice(1).map((_, i): [Point, Point] => [[left, top - (i + 1) * rowHeight], [-left, top - (i + 1) * rowHeight]]),
    ...starts.slice(1).map((x): [Point, Point] => [[x, top], [x, -top]]),
  ];
  return { cells, lines, width, height };
}

/** How far a number stands from its axis, and the room it takes. */
const NUMBER_GAP = 0.35;
const NUMBER_ROOM = 0.6;

/**
 * The numbers written on the ticks of axes, in axis units from the origin:
 * under the x axis, left of the y axis, zero left out (both axes cross there).
 * French writing: decimal comma, minus sign.
 */
export function axisNumbers(params: { x: readonly [number, number]; y: readonly [number, number] } | undefined): { axis: "x" | "y"; text: string; at: Point }[] {
  const { x, y } = params ?? { x: [-6, 6] as const, y: [-4, 4] as const };
  const write = (value: number) => String(Number(value.toFixed(6))).replace(".", ",").replace("-", "−");
  const ticks = ([a, b]: readonly [number, number]) => {
    const step = niceStep(b - a);
    const values: number[] = [];
    for (let k = Math.ceil(a / step - 1e-9); k * step <= b + 1e-9; k++) if (k !== 0) values.push(Number((k * step).toFixed(9)));
    return values;
  };
  const oy = Math.min(Math.max(0, y[0]), y[1]);
  const ox = Math.min(Math.max(0, x[0]), x[1]);
  return [
    ...ticks(x).map((value) => ({ axis: "x" as const, text: write(value), at: [value, oy - NUMBER_GAP] as Point })),
    ...ticks(y).map((value) => ({ axis: "y" as const, text: write(value), at: [ox - NUMBER_GAP, value] as Point })),
  ];
}

/** Default world-space estimates. A renderer may supply its measured text and geometry instead. */
export const measureSceneObject: MeasureObject = (object, values, math, window) => {
  const fontSize = FONT_SIZE[object.size === "medium" || object.size === undefined ? "normal" : object.size];
  switch (object.type) {
    case "point": return { body: enclosing([object.params.at], 0.08) };
    case "line":
    case "arrow":
    case "vector": {
      const ends = [object.params.from, object.params.to];
      return { body: enclosing(ends, 0.04), collision: strokeBoxes(ends) };
    }
    case "polygon": return { body: enclosing(object.params.vertices, 0.03), collision: strokeBoxes(object.params.vertices, true) };
    case "circle": {
      const { center: [x, y], radius } = object.params;
      const ring = Array.from({ length: 33 }, (_, i): Point => [x + radius * Math.cos((i / 32) * 2 * Math.PI), y + radius * Math.sin((i / 32) * 2 * Math.PI)]);
      return { body: { x0: x - radius, y0: y - radius, x1: x + radius, y1: y + radius }, collision: strokeBoxes(ring) };
    }
    case "number_line": {
      const [x0, x1] = object.params.domain;
      return { body: { x0, y0: -0.2, x1, y1: 0.2 }, allowOverlap: true, collision: [{ x0, y0: -0.2, x1, y1: 0.2 }] };
    }
    case "axes": {
      const { x: [x0, x1], y: [y0, y1] } = object.params ?? { x: [-6, 6], y: [-4, 4] };
      // The two axis lines and their ticks; the empty quadrants stay free for labels.
      // Each axis keeps the strip where its numbers are written (axisNumbers).
      const oy = Math.min(Math.max(0, y0), y1), ox = Math.min(Math.max(0, x0), x1);
      const collision: Box[] = [
        { x0: x0 - 0.2, y0: oy - NUMBER_GAP - NUMBER_ROOM / 2, x1: x1 + 0.2, y1: oy + 0.12 },
        { x0: ox - NUMBER_GAP - NUMBER_ROOM / 2, y0: y0 - 0.2, x1: ox + 0.12, y1: y1 + 0.2 },
      ];
      return { body: union([{ x0, y0, x1, y1 }, ...collision])!, allowOverlap: true, collision };
    }
    case "function_graph":
    case "parametric_curve": {
      const pieces = sampleSceneCurve(object, values, window);
      const body = enclosing(pieces.flat(), 0.03);
      // A curve that follows a parameter reserves the area it covers over the parameter's whole range:
      // placement keeps that space free and the camera can frame it before the animation (spec §12).
      const reserve = parameterReserve(object, values, math, window, body);
      return { body, ...(reserve ? { reserve } : {}), allowOverlap: true, collision: pieces.flatMap((piece) => strokeBoxes(piece)) };
    }
    case "triangle_right": return triangleMeasurement(object, values, math);
    case "matrix": {
      if (isTable(object.params)) {
        const { width, height } = tableLayout(tableRows(object.params), fontSize);
        return { body: centered(width, height) };
      }
      const { width, height } = matrixLayout(object.params.rows.map((row) => row.map(String)), fontSize);
      return { body: centered(width, height) };
    }
    case "text":
    case "label":
    case "callout":
    case "math": {
      const content = sceneText(object, values, math);
      const size = textWorldExtent(object.type === "math" ? `$${content}$` : content, fontSize);
      return { body: centered(size.w, size.h) };
    }
  }
};
