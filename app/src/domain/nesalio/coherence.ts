import { compileNamedExpression, orderOf, readLatexNumber, sameRational, splitLatexChains, type LatexNumber } from "@/domain/math/expr";
import { balanceIssues, missingElements, readChemicalEquation } from "./chemistry";
import { FIGURE_TYPES, type MathContext, type SceneObject, type Slice } from "./contract";
import { checkSayShow, emptyBoardMemory, type BoardMemory } from "./sayShow";
import { checkAtomTable, checkConstraintPolygon, checkPhTable, checkValueTable, linearInequalities } from "./valueChecks";

/**
 * Correctness checks of a validated tranche (backlog M1, M12): what the figures
 * draw and the formulas write must agree with the numbers of the lesson.
 * What can be computed is corrected; what cannot is refused with the right value,
 * so that the model repairs the tranche. Zero false positive matters more than
 * catching everything: each rule only fires on what the lesson states explicitly.
 */

export type CoherenceRule =
  | "point_on_curve" | "line_endpoint" | "slope" | "perpendicular" | "outside_axes"
  | "false_equality" | "rounded_equality" | "math_context" | "chemical_balance"
  | "unused_parameter" | "repeated_write" | "highlight_hidden"
  | "false_inequality" | "named_value" | "atom_table" | "value_table" | "ph_table" | "named_point" | "constraint_polygon";

/**
 * corrected: fixed in the returned tranche (the student sees the fixed version);
 * refused: the tranche goes back to the model with `message`;
 * noted: kept as is, worth a repair note (lot 3).
 */
export type CoherenceOutcome = "corrected" | "refused" | "noted";

export interface CoherenceAlert {
  rule: CoherenceRule;
  outcome: CoherenceOutcome;
  /** Where in the output (["slices", i, ...]). */
  path: readonly PropertyKey[];
  /** The object concerned, when there is one. */
  object?: string;
  /** In French, for the model: what is wrong and the right value. */
  message: string;
}

interface FigureRecord { readonly definition: SceneObject; readonly frame: string }

export interface CoherenceState {
  /** Declared figures and the frame whose coordinates they use. */
  readonly figures: ReadonlyMap<string, FigureRecord>;
  readonly board: BoardMemory;
  /** Formulas (math contents) of the previous tranches, in order: equations and rules a table must follow. */
  readonly formulas?: readonly string[];
}

export const emptyCoherence: CoherenceState = { figures: new Map(), board: emptyBoardMemory, formulas: [] };

type Point = readonly [number, number];
const DEFAULT_AXES = { x: [-6, 6] as const, y: [-4, 4] as const };

/** French writing of a number: decimal comma, at most 6 significant digits. */
export function frenchNumber(value: number, decimals?: number): string {
  const rounded = decimals !== undefined ? value.toFixed(Math.max(0, decimals)) : String(Number(value.toPrecision(6)));
  return rounded.replace("-", "−").replace(".", ",");
}

const close = (a: number, b: number, scale = 1) => Math.abs(a - b) <= 1e-6 * Math.max(scale, Math.abs(a), Math.abs(b));

/** The frame a figure draws in, as the scene engine resolves it (sceneState.ts, frameOf). */
function frameOf(definition: SceneObject, sliceId: string, known: ReadonlyMap<string, FigureRecord>, added: ReadonlyMap<string, SceneObject>, depth = 0): string {
  if (definition.layout || definition.attachment) return definition.id;
  if (definition.frame && depth < 16) {
    const joined = added.get(definition.frame);
    if (joined) return frameOf(joined, sliceId, known, added, depth + 1);
    return known.get(definition.frame)?.frame ?? definition.frame;
  }
  return `slice:${sliceId}`;
}

/** f(x) of a curve whose expression only uses constants, or null (parameters move it). */
function curveFunction(definition: SceneObject, math: MathContext): ((x: number) => number | null) | null {
  if (definition.type !== "function_graph") return null;
  const constants = new Map<string, number>();
  for (const [name, symbol] of Object.entries(math.symbols)) if (symbol.kind === "constant") constants.set(name, symbol.value);
  try {
    const evaluate = compileNamedExpression(definition.params.expression, new Set([...constants.keys(), "x"]));
    return (x) => evaluate(new Map(constants).set("x", x));
  } catch {
    return null;
  }
}

/** Slope of a straight figure: a line segment, or a curve whose expression is linear. */
function slopeOf(definition: SceneObject, math: MathContext): number | null {
  if (definition.type === "line") {
    const [[x1, y1], [x2, y2]] = [definition.params.from, definition.params.to];
    return x1 === x2 ? (y1 === y2 ? null : Infinity) : (y2 - y1) / (x2 - x1);
  }
  const f = curveFunction(definition, math);
  if (!f) return null;
  const values = [0, 1, 2, -1.37, 3.11].map((x) => f(x));
  if (values.some((v) => v === null)) return null;
  const [y0, y1] = values as number[];
  const slope = y1! - y0!;
  const linear = [0, 1, 2, -1.37, 3.11].every((x, i) => close(values[i]!, y0! + slope * x, Math.abs(y0!) + Math.abs(slope) + 1));
  return linear ? slope : null;
}

const slopeText = (slope: number) => slope === Infinity ? "verticale" : `de pente ${frenchNumber(slope)}`;

/** Points of a figure that must lie inside the axes it is drawn on. */
function extentPoints(definition: SceneObject): Point[] {
  switch (definition.type) {
    case "point": return [definition.params.at];
    case "line": case "arrow": case "vector": return [definition.params.from, definition.params.to];
    case "polygon": return definition.params.vertices;
    case "circle": {
      const [x, y] = definition.params.center, r = definition.params.radius;
      return [[x - r, y], [x + r, y], [x, y - r], [x, y + r]];
    }
    default: return [];
  }
}

/** Text of the labels attached to an object. */
function labelsOf(id: string, all: readonly SceneObject[]): string[] {
  return all.filter((item) => item.attachment?.parent === id && (item.type === "label" || item.type === "text" || item.type === "math"))
    .map((item) => "content" in item && typeof item.content === "string" ? item.content : "");
}

/** « pente 2 », « pente = −1/2 », « pente : 0,5 » written in a label: the slope it announces. */
function announcedSlope(text: string): { value: number; halfUnit: number } | null {
  const m = /pente\s*(?:de|=|:|vaut)?\s*([−-])?\s*(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+))?(?![\d.,])/i.exec(text);
  if (!m) return null;
  const numerator = Number(m[2]!.replace(",", "."));
  const value = (m[1] ? -1 : 1) * numerator / (m[3] ? Number(m[3]) : 1);
  const decimals = m[3] ? 12 : (m[2]!.split(/[.,]/)[1]?.length ?? 0);
  return { value, halfUnit: decimals > 0 && decimals < 12 ? 0.5 * 10 ** -decimals * (1 + 1e-6) : 1e-6 * Math.max(1, Math.abs(value)) };
}

// Not a bare « a »: it is also the parameter of canonical forms (a(x − h)² + k).
const SLOPE_NAME = /^\s*(?:\\(?:text|mathrm)\s*\{\s*(?:pente|taux)[^{}]*\}|m(?:_\s*(?:\{[^{}]*\}|\\?[a-zA-Z]+|\d))?)\s*$/;
const PERPENDICULAR = /perp|médiatrice|mediatrice|orthogonal|normale/i;
/** A point named or labelled as wrong, or as off the curve: shown so on purpose. */
const REFUTED_POINT = /faux|fausse|erreur|wrong|incorrect|piege|piège|eleve|élève|hors|pas_sur|pas sur|contre/i;
const FITTED = /ajust|r[ée]gress|tendance|fit/i;

function segmentDistance([px, py]: Point, [ax, ay]: Point, [bx, by]: Point, infinite: boolean): number {
  const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
  if (length === 0) return Math.hypot(px - ax, py - ay);
  const t = ((px - ax) * dx + (py - ay) * dy) / length;
  const u = infinite ? t : Math.min(1, Math.max(0, t));
  return Math.hypot(px - (ax + u * dx), py - (ay + u * dy));
}

/** Whether a point lies on a straight figure, a polygon side or a circle, within `tolerance`. */
function onFigure(point: Point, figure: SceneObject, tolerance: number): boolean {
  switch (figure.type) {
    case "line": case "arrow": case "vector": return segmentDistance(point, figure.params.from, figure.params.to, true) <= tolerance;
    case "polygon": return figure.params.vertices.some((vertex, i, all) => segmentDistance(point, vertex, all[(i + 1) % all.length]!, false) <= tolerance);
    case "circle": return Math.abs(Math.hypot(point[0] - figure.params.center[0], point[1] - figure.params.center[1]) - figure.params.radius) <= tolerance;
    default: return false;
  }
}

/** Final numeric value of a formula whose first member names a slope (« \text{pente} = … = 4 », « m_{\perp} = −1 »). */
function writtenSlope(content: string): { value: number; halfUnit: number } | null {
  const chains = splitLatexChains(content);
  if (chains.length !== 1) return null;
  const [chain] = chains;
  if (!SLOPE_NAME.test(chain!.members[0]!.tex) || chain!.relations.some((r) => r.symbol === "other")) return null;
  const last = readLatexNumber(chain!.members.at(-1)!.tex);
  if (!last || last.degrees || last.unit) return null;
  // A whole number is a slope given exactly (« = 1 »); a decimal one may be rounded.
  return { value: last.value, halfUnit: last.halfUnit !== null && last.halfUnit < 0.5 ? last.halfUnit * (1 + 1e-6) : 1e-6 * Math.max(1, Math.abs(last.value)) };
}

function equal(a: LatexNumber, b: LatexNumber): boolean {
  if (a.exact && b.exact) return sameRational(a.exact, b.exact);
  return close(a.value, b.value, 1e-3);
}

/** Every number written in a text, read with a decimal point. */
function numbersIn(text: string): number[] {
  return (text.replace(/(\d)\s*\{,\}\s*(\d)/g, "$1.$2").replace(/(\d),(\d)/g, "$1.$2").match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

/** A number specific enough to tie a formula to an expression: not 0, 1, 2 or 10. */
const telling = (n: number) => !Number.isInteger(n) || n >= 3 && n !== 10;

export function checkCoherence(
  slices: readonly Slice[], math: MathContext, before: CoherenceState = emptyCoherence, removed: ReadonlySet<string> = new Set(),
): { slices: Slice[]; alerts: CoherenceAlert[]; state: CoherenceState } {
  const alerts: CoherenceAlert[] = [];
  const figures = new Map(before.figures);
  const output: Slice[] = slices.map((slice) => structuredClone(slice));
  const contextValues = contextNumbers(math);

  output.forEach((slice, s) => {
    const added = new Map(slice.introduces.filter((item) => FIGURE_TYPES.has(item.type)).map((item) => [item.id, item] as const));
    for (const item of added.values()) figures.set(item.id, { definition: item, frame: frameOf(item, slice.slice_id, before.figures, added) });
    const at = (id: string) => ["slices", s, "introduces", slice.introduces.findIndex((item) => item.id === id)];
    const alive = (frame: string) => [...figures].filter(([id, record]) => record.frame === frame && !removed.has(id)).map(([, record]) => record.definition);
    const allObjects = [...slice.introduces];

    // Line endpoints a hair away from a declared point: the line connects that point.
    for (const item of added.values()) {
      // Not arrows nor vectors: they often stop just before a point so as not to hide it.
      if (item.type !== "line") continue;
      const frame = figures.get(item.id)!.frame;
      const points = alive(frame).filter((other) => other.type === "point" && other.id !== item.id) as Extract<SceneObject, { type: "point" }>[];
      const span = frameSpan(alive(frame));
      for (const end of ["from", "to"] as const) {
        const [x, y] = item.params[end];
        const near = points.map((p) => ({ p, d: Math.hypot(p.params.at[0] - x, p.params.at[1] - y) }))
          .filter(({ d }) => d > 1e-9 && d <= 0.02 * span);
        if (near.length !== 1 || points.some((p) => Math.hypot(p.params.at[0] - x, p.params.at[1] - y) <= 1e-9)) continue;
        const target = near[0]!.p;
        item.params[end] = [target.params.at[0], target.params.at[1]];
        alerts.push({
          rule: "line_endpoint", outcome: "corrected", path: [...at(item.id), "params", end], object: item.id,
          message: `« ${item.id} » part de (${frenchNumber(x)} ; ${frenchNumber(y)}) à côté du point « ${target.id} » : son extrémité est placée sur ce point (${frenchNumber(target.params.at[0])} ; ${frenchNumber(target.params.at[1])}).`,
        });
      }
    }

    // A point a hair away from a curve of its frame is on it: its y is computed.
    for (const item of added.values()) {
      if (item.type !== "point") continue;
      const record = figures.get(item.id)!;
      const [x, y] = item.params.at;
      // The student's wrong point, shown on purpose, stays where it is.
      const labelItems = allObjects.filter((other) => other.attachment?.parent === item.id);
      if (REFUTED_POINT.test(item.id) || labelItems.some((label) => REFUTED_POINT.test(label.id)
        || ("content" in label && typeof label.content === "string" && REFUTED_POINT.test(label.content)))) continue;
      const curves = alive(record.frame).filter((other) => other.type === "function_graph");
      const span = frameSpan(alive(record.frame), "y");
      // Already on another figure of the frame (a tangent, a side, a circle): it belongs to that one.
      if (alive(record.frame).some((other) => other.id !== item.id && onFigure([x, y], other, 0.01 * frameSpan(alive(record.frame))))) continue;
      const values = curves.flatMap((curve) => {
        if (curve.type !== "function_graph") return [];
        const domain = curve.params.domain;
        if (domain && (x < domain[0] - 1e-9 || x > domain[1] + 1e-9)) return [];
        const f = curveFunction(curve, math)?.(x);
        return f === null || f === undefined ? [] : [{ curve, f }];
      });
      // Closer than 1 % of the height: on the curve for the eye (a root drawn at x = 0,27 for 2 − √3).
      if (values.some(({ f }) => Math.abs(f - y) <= 0.01 * span)) continue;
      const near = values.filter(({ f }) => Math.abs(f - y) <= 0.05 * span);
      if (near.length !== 1) continue;
      const { curve, f } = near[0]!;
      // Other points near this curve and not on it: a scatter plot around its line, drawn so on purpose.
      const g = curveFunction(curve, math)!;
      const scattered = alive(record.frame).filter((other) => {
        if (other.type !== "point" || other.id === item.id) return false;
        const v = g(other.params.at[0]);
        const gap = v === null ? Infinity : Math.abs(v - other.params.at[1]);
        return gap > 0.01 * span && gap <= 0.1 * span;
      });
      if (scattered.length >= 2) continue;
      // A fitted line with its points: a scatter plot even when a single point strays.
      const fitted = FITTED.test(curve.id) || labelsOf(curve.id, allObjects).some((label) => FITTED.test(label));
      if (fitted && alive(record.frame).filter((other) => other.type === "point").length >= 3) continue;
      // Labels that write the old coordinates: the point may be off the curve on purpose. Only noted.
      const labels = labelsOf(item.id, [...allObjects]);
      const writesY = labels.some((label) => numbersIn(label).some((n) => close(n, Math.abs(y))));
      const fixed = Number(f.toPrecision(12));
      if (writesY) {
        alerts.push({
          rule: "point_on_curve", outcome: "noted", path: [...at(item.id), "params", "at"], object: item.id,
          message: `Le point « ${item.id} » (${frenchNumber(x)} ; ${frenchNumber(y)}) n'est pas sur la courbe « ${curve.id} » : en x = ${frenchNumber(x)}, elle vaut ${frenchNumber(fixed)}. S'il doit être sur la courbe, corrige le point et son étiquette.`,
        });
        continue;
      }
      item.params.at = [x, fixed];
      alerts.push({
        rule: "point_on_curve", outcome: "corrected", path: [...at(item.id), "params", "at"], object: item.id,
        message: `Le point « ${item.id} » est placé sur la courbe « ${curve.id} » : y = ${frenchNumber(fixed)} en x = ${frenchNumber(x)} (au lieu de ${frenchNumber(y)}).`,
      });
    }

    // A point named a vertex, a trough, a maximum or a zero belongs on the curve of its frame.
    for (const item of added.values()) {
      if (item.type !== "point") continue;
      const labelItems = allObjects.filter((other) => other.attachment?.parent === item.id);
      const texts = [item.id, ...labelItems.map((label) => label.id), ...labelsOf(item.id, allObjects)];
      if (!texts.some((text) => namesCurvePoint(text)) || texts.some((text) => REFUTED_POINT.test(text))) continue;
      const record = figures.get(item.id)!;
      const [x, y] = item.params.at;
      const members = alive(record.frame);
      // Already on another figure (a polygon's vertex, a line): it belongs to that one.
      if (members.some((other) => other.id !== item.id && other.type !== "function_graph" && onFigure([x, y], other, 0.01 * frameSpan(members)))) continue;
      const span = frameSpan(members, "y");
      // A zero lies on the x-axis: « p_zero » at (1 ; 4) is another meaning (a zero correlation).
      if (!texts.some((text) => namesCurvePoint(text, false)) && Math.abs(y) > 0.01 * span) continue;
      const extremumOnly = !texts.some((text) => text.toLowerCase().split(/[^a-zà-ÿ]+/).some((word) => ZERO.has(word)));
      const values = members.flatMap((curve) => {
        if (curve.type !== "function_graph") return [];
        const domain = curve.params.domain;
        if (domain && (x < domain[0] - 1e-9 || x > domain[1] + 1e-9)) return [];
        const g = curveFunction(curve, math);
        const f = g?.(x);
        // A flat curve (« 0 », the ground under a trajectory) has no vertex nor trough to be on.
        if (!g || f === null || f === undefined || [x + 1, x - 1.37, x + 2.71].every((other) => g(other) === f)) return [];
        // A straight line has no vertex nor maximum: « max » or « sommet_A » there is a vertex of a region or a
        // polygon not drawn yet (relecteur, 2026-11-09). A zero of a line stays checked.
        if (extremumOnly && isStraight(g, x, f)) return [];
        return [{ curve, f }];
      });
      // Within 5 % of the height, the rule above already places it (or notes it).
      if (!values.length || values.some(({ f }) => Math.abs(f - y) <= 0.05 * span)) continue;
      const curvesInFrame = members.filter((other) => other.type === "function_graph").length;
      const { curve, f } = values[0]!;
      alerts.push({
        rule: "named_point", outcome: curvesInFrame === 1 ? "refused" : "noted", path: [...at(item.id), "params", "at"], object: item.id,
        message: `Le point « ${item.id} » (${frenchNumber(x)} ; ${frenchNumber(y)}) est nommé comme un point de la courbe, mais il n'est pas sur « ${curve.id} » : en x = ${frenchNumber(x)}, elle vaut ${frenchNumber(Number(f.toPrecision(12)))}. Calcule ses coordonnées avec l'expression de la courbe (et corrige son étiquette).`,
      });
    }

    // Tables: atoms against the equation, values against the rule, pH against [H⁺].
    const formulasSoFar = [...(before.formulas ?? []), ...formulasOf(output.slice(0, s + 1))];
    const curves = [...figures.values()].flatMap(({ definition }) => {
      const f = curveFunction(definition, math);
      return f ? [f] : [];
    });
    slice.introduces.forEach((item, i) => {
      if (item.type !== "matrix") return;
      const path = ["slices", s, "introduces", i, "params"];
      const checks: [CoherenceRule, ReturnType<typeof checkPhTable>][] = [
        ["atom_table", checkAtomTable(item.id, item.params, formulasSoFar)],
        ["value_table", checkValueTable(item.id, item.params, formulasSoFar, curves)],
        ["ph_table", checkPhTable(item.id, item.params)],
      ];
      for (const [rule, issue] of checks) {
        if (issue) alerts.push({ rule, outcome: "refused", path, object: item.id, message: issue.message });
      }
    });

    // A polygon drawn on axes with the inequalities of its tranche: the region of those inequalities.
    const planes = slice.introduces.flatMap((item) => "content" in item && typeof item.content === "string"
      && !REFUTED_ID.test(item.id) ? linearInequalities(item.content) : []);
    for (const item of added.values()) {
      if (item.type !== "polygon" || !alive(figures.get(item.id)!.frame).some((other) => other.type === "axes")) continue;
      if (labelsOf(item.id, allObjects).some((label) => REFUTED_POINT.test(label))) continue;
      const issue = checkConstraintPolygon(item.id, item.params.vertices, planes);
      // A recap may repeat only some constraints (relecteur, 2026-11-09): the region of all the lesson's
      // inequalities so far is accepted too.
      if (issue && !checkConstraintPolygon(item.id, item.params.vertices, [...planes, ...formulasSoFar.flatMap(linearInequalities)])) continue;
      if (issue) alerts.push({ rule: "constraint_polygon", outcome: "refused", path: [...at(item.id), "params", "vertices"], object: item.id, message: issue.message });
    }

    // Slope announced by a label attached to the line or curve.
    for (const item of added.values()) {
      const slope = slopeOf(item, math);
      if (slope === null) continue;
      for (const label of labelsOf(item.id, allObjects)) {
        const announced = announcedSlope(label);
        if (!announced || (slope !== Infinity && Math.abs(slope - announced.value) <= announced.halfUnit)) continue;
        alerts.push({
          rule: "slope", outcome: "refused", path: [...at(item.id), "params"], object: item.id,
          message: `L'étiquette « ${label} » annonce une pente de ${frenchNumber(announced.value)}, mais « ${item.id} » est tracée ${slopeText(slope)}. Recalcule la droite à partir des points de la leçon.`,
        });
      }
    }

    // Slopes written in the tranche's formulas: each new slanted line must have one of them.
    const written = slice.introduces.flatMap((item) => item.type === "math" && typeof item.content === "string" ? [writtenSlope(item.content)] : [])
      .filter((value): value is { value: number; halfUnit: number } => value !== null);
    if (written.length) {
      for (const item of added.values()) {
        if (item.type !== "line" && item.type !== "function_graph") continue;
        const slope = slopeOf(item, math);
        if (slope === null || slope === 0 || slope === Infinity) continue;
        if (written.some((w) => Math.abs(w.value - slope) <= w.halfUnit)) continue;
        if (labelsOf(item.id, allObjects).some((label) => announcedSlope(label))) continue;
        alerts.push({
          rule: "slope", outcome: "refused", path: [...at(item.id), "params"], object: item.id,
          message: `« ${item.id} » est tracée ${slopeText(slope)}, alors que les pentes écrites dans cette tranche sont ${written.map((w) => frenchNumber(w.value)).join(" et ")}. Trace la droite avec la pente calculée, à partir des points de la leçon.`,
        });
      }
    }

    // A line called perpendicular must be perpendicular to some line of its figure.
    for (const item of added.values()) {
      if (item.type !== "line" && item.type !== "function_graph") continue;
      if (!PERPENDICULAR.test(item.id) && !labelsOf(item.id, allObjects).some((label) => PERPENDICULAR.test(label))) continue;
      const slope = slopeOf(item, math);
      if (slope === null) continue;
      const others = alive(figures.get(item.id)!.frame)
        .filter((other) => other.id !== item.id && (other.type === "line" || other.type === "function_graph") && !PERPENDICULAR.test(other.id))
        .map((other) => ({ other, m: slopeOf(other, math) }))
        .filter((entry): entry is { other: SceneObject; m: number } => entry.m !== null);
      if (!others.length) continue;
      const perpendicular = (m: number) => (slope === Infinity ? m === 0 : m === Infinity ? slope === 0 : close(slope * m, -1));
      if (others.some(({ m }) => perpendicular(m))) continue;
      // The axes are lines too: a vertical line is perpendicular to the x-axis.
      if ((slope === 0 || slope === Infinity) && alive(figures.get(item.id)!.frame).some((other) => other.type === "axes")) continue;
      const hint = others.length === 1 && others[0]!.m !== 0 && others[0]!.m !== Infinity
        ? ` Pour être perpendiculaire à « ${others[0]!.other.id} » (pente ${frenchNumber(others[0]!.m)}), sa pente doit être ${frenchNumber(-1 / others[0]!.m)}.` : "";
      alerts.push({
        rule: "perpendicular", outcome: "refused", path: [...at(item.id), "params"], object: item.id,
        message: `« ${item.id} » est dite perpendiculaire, mais elle est tracée ${slopeText(slope)} et n'est perpendiculaire à aucune droite de la figure.${hint}`,
      });
    }

    // Figures drawn on axes stay inside them (curves are clipped by the engine).
    const frames = new Set([...added.keys()].map((id) => figures.get(id)!.frame));
    for (const frame of frames) {
      const members = alive(frame);
      for (const axes of members) {
        if (axes.type !== "axes") continue;
        const { x, y } = axes.params ?? DEFAULT_AXES;
        const mx = (x[1] - x[0]) * 0.03, my = (y[1] - y[0]) * 0.03;
        for (const item of members) {
          if (!added.has(item.id) && !added.has(axes.id)) continue;
          const outside = extentPoints(item).find(([px, py]) => px < x[0] - mx || px > x[1] + mx || py < y[0] - my || py > y[1] + my);
          if (!outside) continue;
          const id = added.has(item.id) ? item.id : axes.id;
          alerts.push({
            rule: "outside_axes", outcome: "refused", path: at(id), object: item.id,
            message: `« ${item.id} » sort des axes « ${axes.id} » : (${frenchNumber(outside[0])} ; ${frenchNumber(outside[1])}) alors que x va de ${frenchNumber(x[0])} à ${frenchNumber(x[1])} et y de ${frenchNumber(y[0])} à ${frenchNumber(y[1])}. Élargis les axes ou recalcule la figure.`,
          });
        }
      }
    }

    // Formulas: numeric equalities, final values against math_context, chemical equations.
    slice.introduces.forEach((item, i) => {
      if (item.type !== "math" || typeof item.content !== "string") return;
      const path = ["slices", s, "introduces", i, "content"];
      const fixed = checkFormula(item.content, item.id, !!item.parts, path, alerts);
      if (fixed !== item.content) item.content = fixed;
      checkContext(item.content, item.id, contextValues, path, alerts);
      checkChemistry(item, path, alerts);
    });
    checkNamedValues(slice, s, alerts);
  });

  const sayShow = checkSayShow(output, math.expressions, before.board);
  alerts.push(...sayShow.alerts);
  return { slices: output, alerts, state: { figures, board: sayShow.memory, formulas: [...(before.formulas ?? []), ...formulasOf(output)] } };
}

const formulasOf = (slices: readonly Slice[]) => slices.flatMap((slice) => slice.introduces
  .flatMap((item) => item.type === "math" && typeof item.content === "string" ? [item.content] : []));

/** g is a straight line around x (same rise per unit on both sides, at two distances). */
function isStraight(g: (x: number) => number | null, x: number, f: number): boolean {
  const a = g(x + 1), b = g(x - 1), c = g(x + 2.5);
  if (a === null || b === null || c === null) return false;
  const slope = a - f, tolerance = 1e-9 * (1 + Math.abs(f) + Math.abs(slope));
  return Math.abs((f - b) - slope) <= tolerance && Math.abs((c - f) - 2.5 * slope) <= tolerance * 2.5;
}

const EXTREMUM = new Set(["sommet", "creux", "maximum", "minimum", "max", "min"]);
const ZERO = new Set(["zero", "zéro", "zeros", "zéros", "racine"]);
/** An id or a label that names a point of a curve: « sommet1 », « p_creux », « zéro », « sommet (0 ; 0) » (`zeros`: also a zero). */
const namesCurvePoint = (text: string, zeros = true) => text.toLowerCase().split(/[^a-zà-ÿ]+/)
  .some((word) => EXTREMUM.has(word) || (zeros && ZERO.has(word)));

const NAME = /^\s*([a-zA-Z](?:_\s*(?:\{[a-zA-Z0-9]+\}|[a-zA-Z0-9]))?)\s*$/;

/**
 * A value computed in one formula (« x = \frac{3\log 7}{2\log 7 - \log 5} ») and written rounded in the next
 * one that names it (« x \approx 2{,}17 ») must agree. Only within a tranche, and only until the name is used
 * otherwise (a new equation in x starts another computation).
 */
function checkNamedValues(slice: Slice, s: number, alerts: CoherenceAlert[]): void {
  // Several computations of one name in a row are its several solutions (x = 2 + √3, x = 2 − √3).
  const computed = new Map<string, { value: number; id: string; tex: string }[]>();
  slice.introduces.forEach((item, i) => {
    if (item.type !== "math" || typeof item.content !== "string") return;
    if (REFUTED_ID.test(item.id) || REFUTATION.test(item.content)) { computed.clear(); return; }
    const chains = splitLatexChains(item.content);
    const named = new Set<string>();
    for (const chain of chains) {
      const name = NAME.exec(chain.members[0]!.tex)?.[1]?.replace(/\s+/g, "");
      if (!name || chain.relations.some((r) => r.symbol === "other")) continue;
      named.add(name);
      const values = chain.members.slice(1).map((member) => ({ tex: member.tex.trim(), number: readLatexNumber(member.tex) }));
      if (values.some((v) => !v.number)) { computed.delete(name); continue; }
      const calculation = values.find((v) => v.number!.halfUnit === null);
      // A whole number alone (« x = 5 ») may start another example: only a rounded value (≈, decimals) is compared.
      const rounded = (v: (typeof values)[number], index: number) => chain.relations[index]?.symbol === "≈" || v.number!.halfUnit! < 0.5;
      if (calculation) {
        computed.set(name, [...(computed.get(name) ?? []), { value: calculation.number!.value, id: item.id, tex: calculation.tex }]);
        continue;
      }
      const solutions = computed.get(name);
      if (!solutions?.length) continue;
      for (const [index, v] of values.entries()) {
        const { value, halfUnit, unit, degrees } = v.number!;
        if (unit || degrees || halfUnit === null || !rounded(v, index)
          || solutions.some((solution) => Math.abs(value - solution.value) <= halfUnit * (1 + 1e-6) + 1e-12)) continue;
        const before = solutions.at(-1)!;
        const decimals = Math.max(0, Math.round(-Math.log10(halfUnit * 2)));
        alerts.push({
          rule: "named_value", outcome: "refused", path: ["slices", s, "introduces", i, "content"], object: item.id,
          message: `« ${item.content} » contredit « ${before.id} » : ${name} = ${before.tex} vaut ${frenchNumber(before.value, decimals)}, pas ${v.tex}. Écris le calcul et sa valeur dans la même formule (${name} = … ≈ ${frenchNumber(before.value, decimals)}).`,
        });
        break;
      }
    }
    // Any other use of a name (an equation in x) closes its computation.
    for (const name of [...computed.keys()]) {
      if (!named.has(name) && new RegExp(`(^|[^a-zA-Z\\\\])${name.replace(/[_{}]/g, "\\$&")}(?![a-zA-Z])`).test(item.content)) computed.delete(name);
    }
  });
}

/** Width (or height) of what a frame draws: the axes when there are, else the figures. */
function frameSpan(members: readonly SceneObject[], direction: "x" | "y" | "both" = "both"): number {
  const axes = members.find((item) => item.type === "axes");
  if (axes?.type === "axes") {
    const { x, y } = axes.params ?? DEFAULT_AXES;
    return direction === "x" ? x[1] - x[0] : direction === "y" ? y[1] - y[0] : Math.max(x[1] - x[0], y[1] - y[0]);
  }
  const points = members.flatMap(extentPoints);
  if (points.length < 2) return 1;
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  return Math.max(1e-9, direction === "x" ? w : direction === "y" ? h || w : Math.max(w, h));
}

/** A member ending with « % » (`84{,}3 \%`). */
const PERCENT_END = /\\%\s*\}*\s*$/;
/** « × 100 » written in a member (`\times 100`, `\cdot 100`, `× 100`), the school way of turning a ratio into a percent. */
const TIMES_HUNDRED = /(?:\\times|\\cdot|×|\*)\s*\{?\s*100(?![\d,.{])/;

/**
 * Both members read as numbers. When only one ends with « % », the school writing
 * « \frac{35}{41,5} \times 100 ≈ 84,3 % » is also read with the percent as its number
 * (84,3, not 0,843): seen on the Alloprof bench, a right rounding refused three times and the
 * lesson stopped. The closer of the two readings is kept, so « 0,843 = 84,3 % » still passes.
 */
function percentReading(leftTex: string, rightTex: string): { a: LatexNumber; b: LatexNumber } | null {
  const a = readLatexNumber(leftTex), b = readLatexNumber(rightTex);
  if (!a || !b) return null;
  const leftPercent = PERCENT_END.test(leftTex), rightPercent = PERCENT_END.test(rightTex);
  // Only when the other member multiplies by 100 itself: « 25 = 25 % » or « 0,25 = 0,25 % » stay errors.
  if (leftPercent === rightPercent || !TIMES_HUNDRED.test(leftPercent ? rightTex : leftTex)) return { a, b };
  const hundred = (n: LatexNumber): LatexNumber => ({ ...n, value: n.value * 100, exact: null, halfUnit: n.halfUnit === null ? null : n.halfUnit * 100 });
  const scaled = rightPercent ? { a, b: hundred(b) } : { a: hundred(a), b };
  return Math.abs(scaled.a.value - scaled.b.value) < Math.abs(a.value - b.value) ? scaled : { a, b };
}

/** Checks the « = » and « ≈ » between numeric members; returns the formula, « = » turned into « ≈ » for a mere rounding. */
function checkFormula(content: string, id: string, hasParts: boolean, path: readonly PropertyKey[], alerts: CoherenceAlert[]): string {
  const roundings: { start: number; end: number }[] = [];
  // A false statement shown on purpose (the student's mistake, a check that fails) is not an error.
  const refuting = REFUTED_ID.test(id) || REFUTATION.test(content);
  for (const chain of splitLatexChains(content)) {
    for (let i = 0; i < chain.relations.length; i++) {
      const relation = chain.relations[i]!;
      if (relation.symbol === "other") {
        checkInequality(chain.members[i]!.tex.trim(), relation.written, chain.members[i + 1]!.tex.trim(), id, refuting, path, alerts);
        continue;
      }
      const leftTex = chain.members[i]!.tex.trim(), rightTex = chain.members[i + 1]!.tex.trim();
      const read = percentReading(leftTex, rightTex);
      if (!read) continue;
      const { a, b } = read;
      if (a.degrees !== b.degrees || refuting) continue;
      // A conversion or a definition between units (« 1 mol = 6,02 × 10^23 », « 250 mL = 0,250 L »).
      if (a.unit !== b.unit && ((a.unit && b.unit) || (a.halfUnit !== null && b.halfUnit !== null))) continue;
      const half = Math.max(a.halfUnit ?? 0, b.halfUnit ?? 0);
      const gap = Math.abs(a.value - b.value);
      const written = `${leftTex} ${relation.symbol === "=" ? "=" : "≈"} ${rightTex}`;
      if (relation.symbol === "=") {
        if (equal(a, b)) continue;
        if (half > 0 && gap < half * (1 - 1e-6)) {
          if (hasParts) {
            alerts.push({ rule: "rounded_equality", outcome: "refused", path, object: id,
              message: `« ${written} » est un arrondi : écris ≈ (\\approx) au lieu de =.` });
          } else roundings.push(relation);
          continue;
        }
        // Two computations, neither a written result: only a clear gap is an error (not 5,096 written 5,1 within a step).
        if (a.halfUnit === null && b.halfUnit === null && gap <= 0.01 * Math.max(Math.abs(a.value), Math.abs(b.value))) continue;
        alerts.push({ rule: "false_equality", outcome: "refused", path, object: id,
          message: `« ${written} » est faux : ${leftTex} vaut ${frenchNumber(a.value)}${b.halfUnit !== null && a.halfUnit === null ? "" : ` et ${rightTex} vaut ${frenchNumber(b.value)}`}. Corrige le calcul.` });
      } else {
        if (!half || gap <= half * (1 + 1e-6) + 1e-12) continue;
        alerts.push({ rule: "false_equality", outcome: "refused", path, object: id,
          message: `« ${written} » est faux : ${leftTex} vaut ${frenchNumber(a.value)}, ${rightTex} vaut ${frenchNumber(b.value)}. Corrige l'arrondi.` });
      }
    }
  }
  if (!roundings.length) return content;
  let fixed = content;
  for (const { start, end } of roundings.sort((x, y) => y.start - x.start)) fixed = `${fixed.slice(0, start)}\\approx${fixed.slice(end)}`;
  alerts.push({ rule: "rounded_equality", outcome: "corrected", path, object: id,
    message: `Arrondi écrit avec = dans « ${id} » : remplacé par ≈ (« ${fixed} »).` });
  return fixed;
}

/** « 10 \le 7 » between two numeric members: refused, unless the formula shows a false statement on purpose. */
function checkInequality(
  leftTex: string, written: string, rightTex: string, id: string, refuting: boolean, path: readonly PropertyKey[], alerts: CoherenceAlert[],
): void {
  const order = orderOf(written);
  if (!order || refuting) return;
  const read = percentReading(leftTex, rightTex);
  if (!read) return;
  const { a, b } = read;
  if (a.degrees !== b.degrees || a.unit !== b.unit) return;
  // Rounded members: only a gap larger than the rounding counts. Equal members only break a strict inequality.
  const slack = Math.max(a.halfUnit ?? 0, b.halfUnit ?? 0) * (1 + 1e-6) + 1e-9 * Math.max(1, Math.abs(a.value), Math.abs(b.value));
  const gap = order.direction * (a.value - b.value);
  const equalExactly = a.exact !== null && b.exact !== null && sameRational(a.exact, b.exact);
  if (gap > slack || (!order.strict && gap > -slack) || (order.strict && gap > -slack && !equalExactly)) return;
  const symbol = order.direction < 0 ? (order.strict ? "<" : "≤") : (order.strict ? ">" : "≥");
  alerts.push({ rule: "false_inequality", outcome: "refused", path, object: id,
    message: `« ${leftTex} ${symbol} ${rightTex} » est faux : ${leftTex} vaut ${frenchNumber(a.value)} et ${rightTex} vaut ${frenchNumber(b.value)}. Corrige l'inégalité ou le calcul.` });
}

const REFUTED_ID = /faux|fausse|erreur|wrong|incorrect|piege|piège|eleve|élève|contre/i;
const REFUTATION = /\\times(?:\s|\\[,;:! ]|~)*$|✗|✘|\\xmark|\\neq|≠|\\lightning|\\text\s*\{[^{}]*\b(?:faux|fausse|non|impossible|incorrect)\b[^{}]*\}/;

interface ContextValue { name: string; source: string; value: number; numbers: number[] }

/** Values of the math_context expressions that only use constants. */
function contextNumbers(math: MathContext): ContextValue[] {
  const constants = new Map<string, number>();
  for (const [name, symbol] of Object.entries(math.symbols)) if (symbol.kind === "constant") constants.set(name, symbol.value);
  return Object.entries(math.expressions).flatMap(([name, source]) => {
    try {
      const value = compileNamedExpression(source, new Set(constants.keys()))(constants);
      if (value === null) return [];
      const numbers = [...numbersIn(source), ...[...constants].filter(([symbol]) => new RegExp(`\\b${symbol}\\b`).test(source)).map(([, v]) => v)];
      return [{ name, source, value, numbers }];
    } catch {
      return [];
    }
  });
}

/** The final number of a formula must agree with the math_context expression it computes. */
function checkContext(content: string, id: string, context: readonly ContextValue[], path: readonly PropertyKey[], alerts: CoherenceAlert[]): void {
  // An error shown on purpose (the rounding trap) or marked wrong is not compared.
  if (!context.length || REFUTED_ID.test(id) || REFUTATION.test(content)) return;
  const chains = splitLatexChains(content);
  const chain = chains.at(-1);
  if (!chain || chain.relations.at(-1)?.symbol === "other") return;
  const final = readLatexNumber(chain.members.at(-1)!.tex);
  if (!final || final.halfUnit === null || final.degrees) return;
  const tolerance = final.halfUnit * (1 + 1e-6) + 1e-12;
  if (context.some((c) => Math.abs(c.value - final.value) <= tolerance)) return;
  const written = numbersIn(content).filter(telling);
  // The same quantity only: the formula writes every telling number of the expression (1,04 and 5 for
  // 2000*1.04^5), or it shares one and lands within 0,1 % (a rounding made too early). The simple
  // interest 2000 + 5 × 80 = 2400, another method, is not compared.
  const shares = (c: ContextValue) => c.numbers.filter(telling).filter((n) => written.some((w) => close(w, n)));
  const suspect = context.find((c) => {
    const gap = Math.abs(c.value - final.value), shared = shares(c).length, all = c.numbers.filter(telling).length;
    return (all > 0 && shared === all && gap <= 0.02 * Math.abs(c.value)) || (shared > 0 && gap <= 0.001 * Math.abs(c.value));
  });
  if (!suspect) return;
  const decimals = Math.max(0, Math.round(-Math.log10(final.halfUnit * 2)));
  alerts.push({
    rule: "math_context", outcome: "refused", path, object: id,
    message: `« ${id} » donne ${frenchNumber(final.value, decimals)}, mais ${suspect.name} = ${suspect.source} vaut ${frenchNumber(suspect.value, decimals)}. N'arrondis pas avant le résultat final : écris ${frenchNumber(suspect.value, decimals)}.`,
  });
}

const FINAL_EQUATION = /final|equilibr|équilibr|balanced|bilan|result|reponse|réponse|answer/i;
const NOT_FINAL = /faux|erreur|wrong|depart|départ|squelette|brut|non_equilibr|eleve|élève/i;

/** A chemical equation presented as balanced must be; an element present on one side only is always wrong. */
function checkChemistry(item: Extract<SceneObject, { type: "math" }>, path: readonly PropertyKey[], alerts: CoherenceAlert[]): void {
  if (typeof item.content !== "string") return;
  const equation = readChemicalEquation(item.content);
  if (!equation || NOT_FINAL.test(item.id)) return;
  const missing = missingElements(equation);
  if (missing.length) {
    alerts.push({ rule: "chemical_balance", outcome: "refused", path, object: item.id,
      message: `Dans « ${item.content} », ${missing.join(", ")} n'apparaît que d'un côté de la flèche : les espèces ne correspondent pas. Vérifie les formules.` });
    return;
  }
  const presentedBalanced = !NOT_FINAL.test(item.id) && (item.style?.role === "result" || FINAL_EQUATION.test(item.id)
    || /\\checkmark|✓|équilibrée/.test(item.content));
  if (!presentedBalanced) return;
  const issues = balanceIssues(equation);
  if (!issues.length) return;
  alerts.push({ rule: "chemical_balance", outcome: "refused", path, object: item.id,
    message: `L'équation « ${item.content} » est présentée comme équilibrée, mais elle ne l'est pas (${issues.join(" ; ")}). Corrige les coefficients.` });
}
