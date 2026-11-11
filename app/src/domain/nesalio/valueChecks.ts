import { orderOf, readLatexFunction, splitLatexChains } from "@/domain/math/expr";
import { MASSES, parseFormula, readChemicalEquation, type Equation } from "./chemistry";
import type { MatrixParams } from "./contract";

/**
 * Checks of the values a lesson shows outside its formulas' own equalities (backlog M1, analyst P2-P3):
 * tables (atoms against the chemical equation, values against the declared rule, pH against [H⁺])
 * and the constraint polygon of a system of inequalities. Each one only speaks when the lesson states
 * the rule itself and the table or figure contradicts every reading of it: in doubt, nothing.
 */

export interface ValueIssue {
  /** Part of the table concerned (r2, c3), when there is one. */
  part?: string;
  /** In French, for the model: what is wrong and the right value. */
  message: string;
}

type Cell = number | string | null;
interface Line {
  label: string;
  cells: readonly Cell[];
  part: string;
}

/** French writing of a number: decimal comma, at most 6 significant digits. */
const french = (value: number) =>
  String(Number(value.toPrecision(6)))
    .replace("-", "−")
    .replace(".", ",");
const SUPERSCRIPT: Record<string, string> = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
/** A small concentration in French scientific notation (« 1 × 10⁻⁷ », never « 1e−7 »). */
const tiny = (value: number) => {
  if (value >= 1e-4) return french(value);
  const [mantissa, exponent] = value.toExponential(2).split("e");
  return `${french(Number(mantissa))} × 10${[...String(Number(exponent))].map((ch) => SUPERSCRIPT[ch] ?? ch).join("")}`;
};

/** Rows (with their titles) and columns (with their headers) of a table. */
function tableLines(params: MatrixParams): { rows: Line[]; columns: Line[] } {
  const width = params.rows[0]?.length ?? 0;
  const rows =
    params.row_labels?.length === params.rows.length ? params.rows.map((cells, i) => ({ label: params.row_labels![i]!, cells, part: `r${i + 1}` })) : [];
  const headers =
    params.column_labels?.length === width
      ? params.column_labels
      : params.row_labels && params.column_labels?.length === width + 1
        ? params.column_labels.slice(1)
        : undefined;
  const columns = headers ? headers.map((label, j) => ({ label, cells: params.rows.map((row) => row[j] ?? null), part: `c${j + 1}` })) : [];
  return { rows, columns };
}

const SUPERSCRIPTS: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
  "⁻": "-",
  "⁺": "+",
};

/** A cell read as a number (12, "1,5", "10⁻³", "2 × 10^-4"), with half a unit of its last written digit; null if it is not one. */
export function cellNumber(cell: Cell): { value: number; half: number } | null {
  const halfOf = (digits: string, power = 0) => 0.5 * 10 ** (power - (digits.split(".")[1]?.length ?? 0));
  if (typeof cell === "number") {
    if (!Number.isFinite(cell)) return null;
    const text = String(cell);
    return { value: cell, half: /e/i.test(text) ? 1e-9 * Math.abs(cell) : halfOf(text) };
  }
  if (typeof cell !== "string") return null;
  const s = cell
    .trim()
    .replace(/[⁻⁺]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (power) => `^${[...power].map((c) => SUPERSCRIPTS[c]).join("")}`)
    .replace(/[−–]/g, "-")
    .replace(/\{,\}/g, ".")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/\\times|\\cdot|[×·*]/g, "*")
    .replace(/[\s{}()]/g, "");
  let m = /^(-?\d+(?:\.\d+)?)$/.exec(s);
  if (m) return { value: Number(m[1]), half: halfOf(m[1]!) };
  m = /^(-?\d+(?:\.\d+)?)(?:\*10\^|e)(-?\d+)$/i.exec(s);
  if (m) return { value: Number(m[1]) * 10 ** Number(m[2]), half: halfOf(m[1]!, Number(m[2])) };
  m = /^10\^(-?\d+)$/.exec(s);
  if (m) return { value: 10 ** Number(m[1]), half: 1e-9 * 10 ** Number(m[1]) };
  return null;
}

const within = (computed: number, written: { value: number; half: number }) =>
  Math.abs(computed - written.value) <= written.half * (1 + 1e-6) + 1e-9 * Math.max(1, Math.abs(written.value));

/** A table or figure that shows the student's mistake on purpose. */
const SHOWN_WRONG = /faux|fausse|erreur|wrong|incorrect|pi[eè]ge|[ée]l[eè]ve|contre/i;

// ---------------------------------------------------------------------------
// Atoms of each side against the chemical equations of the lesson.
// ---------------------------------------------------------------------------

const LEFT = /r[ée]actifs?|gauche|avant|d[ée]part/i;
const RIGHT = /produits?|droite|apr[èe]s|arriv[ée]e/i;

/** « C », « C (carbone) », « carbone (C) »: the element a header names. */
function elementOf(label: string): string | null {
  const text = label.trim();
  const m = /^([A-Z][a-z]?)(?:\s*\([^()]*\))?$/.exec(text) ?? /^[^()]*\(\s*([A-Z][a-z]?)\s*\)$/.exec(text);
  return m && m[1]! in MASSES ? m[1]! : null;
}

function sideOf(label: string): "left" | "right" | null {
  const left = LEFT.test(label),
    right = RIGHT.test(label);
  return left === right ? null : left ? "left" : "right";
}

interface AtomLine {
  side: "left" | "right";
  counts: Map<string, number>;
  part: string;
}

/** The lines of a table that count the atoms of one side: element headers one way, sides the other way. */
function atomLines(params: MatrixParams): AtomLine[] {
  const { rows, columns } = tableLines(params);
  const lines: AtomLine[] = [];
  const read = (sides: Line[], elements: Line[]) => {
    for (const [i, line] of sides.entries()) {
      const side = sideOf(line.label);
      if (!side) continue;
      const counts = new Map<string, number>();
      for (const element of elements) {
        const symbol = elementOf(element.label),
          value = cellNumber(element.cells[i] ?? null);
        if (symbol && value && Number.isInteger(value.value) && value.value >= 0) counts.set(symbol, value.value);
      }
      if (counts.size >= 2) lines.push({ side, counts, part: line.part });
    }
  };
  if (rows.length && columns.length) {
    if (columns.filter((c) => elementOf(c.label)).length >= 2) read(rows, columns);
    if (rows.filter((r) => elementOf(r.label)).length >= 2) read(columns, rows);
  }
  // « H à gauche | H à droite »: one row per element, its two cells are the two sides.
  const left = new Map<string, number>(),
    right = new Map<string, number>();
  for (const row of rows) {
    const [first, second] = row.label.split("|");
    const symbol = /^\s*([A-Z][a-z]?)\b/.exec(first ?? "")?.[1];
    if (!symbol || !(symbol in MASSES) || second === undefined || sideOf(first!) !== "left" || sideOf(second) !== "right" || row.cells.length !== 2) continue;
    const a = cellNumber(row.cells[0]!),
      b = cellNumber(row.cells[1]!);
    if (a && b) {
      left.set(symbol, a.value);
      right.set(symbol, b.value);
    }
  }
  if (left.size >= 2) lines.push({ side: "left", counts: left, part: "r1" }, { side: "right", counts: right, part: "r1" });
  return lines;
}

function sideAtoms(equation: Equation, side: "left" | "right"): Map<string, number> {
  const atoms = new Map<string, number>();
  for (const term of side === "left" ? equation.left : equation.right) {
    for (const [element, count] of parseFormula(term.formula).atoms) atoms.set(element, (atoms.get(element) ?? 0) + count * term.coefficient);
  }
  return atoms;
}

/** The chemical equations written in these formulas, each also without its coefficients (the skeleton being balanced). */
export function equationsIn(formulas: readonly string[]): { text: string; equation: Equation }[] {
  return formulas.flatMap((text) => {
    const equation = readChemicalEquation(text);
    if (!equation) return [];
    const skeleton = { left: equation.left.map((t) => ({ ...t, coefficient: 1 })), right: equation.right.map((t) => ({ ...t, coefficient: 1 })) };
    return [
      { text, equation },
      { text, equation: skeleton },
    ];
  });
}

const atomText = (counts: ReadonlyMap<string, number>, elements: readonly string[]) => elements.map((e) => `${e} ${counts.get(e) ?? 0}`).join(", ");
const sideName = (side: "left" | "right") => (side === "left" ? "réactifs" : "produits");

/** A table that counts atoms side by side must agree with one of the equations of the lesson (balanced or not). */
export function checkAtomTable(id: string, params: MatrixParams, formulas: readonly string[]): ValueIssue | null {
  if (SHOWN_WRONG.test(id)) return null;
  const lines = atomLines(params);
  const candidates = equationsIn(formulas);
  if (!lines.length || !candidates.length) return null;
  const agrees = (line: AtomLine, equation: Equation) => {
    const atoms = sideAtoms(equation, line.side);
    return [...line.counts].every(([element, count]) => (atoms.get(element) ?? 0) === count);
  };
  // One line per side: both sides are counted for the same equation (a balanced table is not half skeleton).
  const lefts = lines.filter((line) => line.side === "left"),
    rights = lines.filter((line) => line.side === "right");
  const paired = lefts.length === 1 && rights.length === 1;
  const wrong = paired
    ? candidates.some(({ equation }) => agrees(lefts[0]!, equation) && agrees(rights[0]!, equation))
      ? []
      : lines
    : lines.filter((line) => !candidates.some(({ equation }) => agrees(line, equation)));
  if (!wrong.length) return null;
  // The right counts of the equation closest to the table (fewest wrong counts; the latest one on a tie).
  const errors = (equation: Equation) =>
    lines.reduce((sum, line) => {
      const atoms = sideAtoms(equation, line.side);
      return sum + [...line.counts].filter(([element, count]) => (atoms.get(element) ?? 0) !== count).length;
    }, 0);
  const written = candidates.filter((_, i) => i % 2 === 0);
  const reference = written.reduce((best, candidate) => (errors(candidate.equation) <= errors(best.equation) ? candidate : best));
  const elements = [...new Set(lines.flatMap((line) => [...line.counts.keys()]))];
  const said = wrong.map((line) => `${sideName(line.side)} : ${atomText(line.counts, elements)}`).join(" ; ");
  const right = (["left", "right"] as const).map((side) => `${sideName(side)} : ${atomText(sideAtoms(reference.equation, side), elements)}`).join(" ; ");
  return {
    part: wrong[0]!.part,
    message: `Le tableau « ${id} » compte ${said}, ce qui ne correspond à aucune équation de la leçon. D'après « ${reference.text} », il faut ${right}. Recompte chaque atome : coefficient × indice, pour chaque espèce.`,
  };
}

// ---------------------------------------------------------------------------
// Table of values against its rule.
// ---------------------------------------------------------------------------

const unwrap = (label: string) =>
  label
    .trim()
    .replace(/^\$+|\$+$/g, "")
    .replace(/\\(?:left|right)(?![a-zA-Z])/g, "")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/[−–]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
const VARIABLE = /^([xy])$/;
const FUNCTION_NAME = /^([a-wz])\s*\(\s*x\s*\)$/;

type Reading = (values: ReadonlyMap<string, number>) => number | null;
interface Rule {
  text: string;
  readings: Reading[];
}

/** The rules « f(x) = … » written in these formulas, by function name. */
function writtenRules(formulas: readonly string[]): Map<string, Rule[]> {
  const rules = new Map<string, Rule[]>();
  for (const formula of formulas) {
    for (const chain of splitLatexChains(formula)) {
      const name = FUNCTION_NAME.exec(unwrap(chain.members[0]!.tex))?.[1];
      if (!name || chain.relations[0]?.symbol !== "=") continue;
      for (const [i, member] of chain.members.slice(1).entries()) {
        if (chain.relations[i]?.symbol !== "=") break;
        const readings = readLatexFunction(unwrap(member.tex), ["x"]);
        if (readings) (rules.get(name) ?? rules.set(name, []).get(name)!).push({ text: `${name}(x) = ${member.tex.trim()}`, readings });
      }
    }
  }
  return rules;
}

/** A table « x | f(x) » must follow the rule f(x) = … that the lesson writes (or that its header writes). */
export function checkValueTable(
  id: string,
  params: MatrixParams,
  formulas: readonly string[],
  curves: readonly ((x: number) => number | null)[],
): ValueIssue | null {
  if (SHOWN_WRONG.test(id)) return null;
  const { rows, columns } = tableLines(params);
  const rules = writtenRules(formulas);
  for (const lines of [rows, columns]) {
    const inputs = new Map<string, Line>();
    for (const line of lines) {
      const name = VARIABLE.exec(unwrap(line.label))?.[1];
      if (name && !inputs.has(name)) inputs.set(name, line);
    }
    const x = inputs.get("x");
    if (!x) continue;
    for (const line of lines) {
      const label = unwrap(line.label);
      if (inputs.get(label) === line || SHOWN_WRONG.test(label)) continue;
      // The header writes the rule (« f(x) = [x] », « 3x + 2y », « log(x) »), or names a function written in the lesson.
      const [head, ...rest] = label.split("=");
      const ownRule =
        rest.length === 1 && (FUNCTION_NAME.test(head!.trim()) || head!.trim() === "y")
          ? rest[0]!
          : rest.length === 0 && !FUNCTION_NAME.test(label)
            ? label
            : null;
      let candidates: Rule[] = [];
      let variables = ["x"];
      if (ownRule !== null) {
        variables = inputs.has("y") ? ["x", "y"] : ["x"];
        const readings = readLatexFunction(ownRule, variables);
        if (!readings) continue;
        candidates = [{ text: label, readings }];
      } else {
        const name = FUNCTION_NAME.exec(label)?.[1];
        candidates = name ? (rules.get(name) ?? []) : [];
        if (!candidates.length) continue;
        // A curve of the lesson may be the function of the table too: one more possible rule, never a reason to refuse.
        candidates = [...candidates, ...curves.map((curve) => ({ text: "", readings: [(values: ReadonlyMap<string, number>) => curve(values.get("x")!)] }))];
      }
      const pairs = line.cells.flatMap((cell, k) => {
        const output = cellNumber(cell);
        const values = new Map<string, number>();
        for (const name of variables) {
          const input = cellNumber(inputs.get(name)!.cells[k] ?? null);
          if (!input) return [];
          values.set(name, input.value);
        }
        return output ? [{ values, output, k }] : [];
      });
      if (pairs.length < 2) continue;
      const fits = (reading: Reading) =>
        pairs.every(({ values, output }) => {
          const value = reading(values);
          return value !== null && within(value, output);
        });
      if (candidates.some((rule) => rule.readings.some(fits))) continue;
      const rule = candidates[0]!;
      const wrong = pairs.find(({ values, output }) => {
        const value = rule.readings[0]!(values);
        return value === null || !within(value, output);
      })!;
      const value = rule.readings[0]!(wrong.values);
      const at = variables.map((name) => `${name} = ${french(wrong.values.get(name)!)}`).join(" et ");
      return {
        part: `${line.part}`,
        message: `Le tableau « ${id} » ne suit pas la règle « ${rule.text} » : en ${at}, elle donne ${value === null ? "une valeur non définie" : french(value)}, pas ${french(wrong.output.value)}. Recalcule chaque case avec la règle.`,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// pH against [H⁺] (and pOH against [OH⁻]).
// ---------------------------------------------------------------------------

const PAIRS = [
  { power: /^\s*pH\b/i, concentration: /\[\s*H\s*(?:₃\s*O|3\s*O|_\s*\{?3\}?\s*O)?\s*(?:⁺|\^?\s*\{?\s*\+\s*\}?)\s*\]/, name: "pH", ion: "[H⁺]" },
  { power: /^\s*pOH\b/i, concentration: /\[\s*OH\s*(?:⁻|\^?\s*\{?\s*[-−]\s*\}?)\s*\]/, name: "pOH", ion: "[OH⁻]" },
];

/** A table with a pH line and a [H⁺] line: [H⁺] = 10^(−pH) in every column. */
export function checkPhTable(id: string, params: MatrixParams): ValueIssue | null {
  if (SHOWN_WRONG.test(id)) return null;
  const { rows, columns } = tableLines(params);
  for (const lines of [rows, columns]) {
    for (const pair of PAIRS) {
      const power = lines.find((line) => pair.power.test(line.label));
      const concentration = lines.find((line) => pair.concentration.test(line.label));
      // A ratio (« [H⁺] comparée à l'eau pure, fois ») or another unit than mol/L is not 10^(−pH) (relecteur, 2026-11-09).
      if (!power || !concentration || /fois|compar|relati|rapport|×|mmol|[µμu]mol|mg|g\s*\/\s*L/i.test(concentration.label)) continue;
      for (const [k, cell] of power.cells.entries()) {
        const p = cellNumber(cell),
          c = cellNumber(concentration.cells[k] ?? null);
        if (!p || !c || c.value <= 0) continue;
        const expected = 10 ** -p.value;
        if (Math.abs(-Math.log10(c.value) - p.value) <= 0.05 + p.half || within(expected, c)) continue;
        return {
          part: concentration.part,
          message: `Le tableau « ${id} » donne ${pair.ion} = ${french(c.value)} pour un ${pair.name} de ${french(p.value)}, mais ${pair.ion} = 10^(−${pair.name}) = ${tiny(expected)} mol/L. Recalcule cette ligne.`,
        };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Constraint polygon: the region of the inequalities shown with it.
// ---------------------------------------------------------------------------

/** a x + b y + c ≤ 0 (strictness does not change the vertices). */
export interface HalfPlane {
  a: number;
  b: number;
  c: number;
  text: string;
}
type Point = readonly [number, number];

/** Linear inequalities in x and y written in a text or a formula (« x + y ≤ 6 », « 0 \le x \le 4 », « x ≥ 0, y ≥ 0 »). */
export function linearInequalities(content: string): HalfPlane[] {
  const statements = content
    .replace(/≤|⩽/g, " \\le ")
    .replace(/≥|⩾/g, " \\ge ")
    .split(/,\s+|(?:^|\s)et\s+|\\text\s*\{\s*et\s*\}/);
  const planes: HalfPlane[] = [];
  for (const statement of statements) {
    for (const chain of splitLatexChains(statement)) {
      chain.relations.forEach((relation, i) => {
        const order = orderOf(relation.written);
        if (!order) return;
        const left = readLatexFunction(chain.members[i]!.tex, ["x", "y"]) ?? constantOf(chain.members[i]!.tex);
        const right = readLatexFunction(chain.members[i + 1]!.tex, ["x", "y"]) ?? constantOf(chain.members[i + 1]!.tex);
        if (!left || !right || left.length !== 1 || right.length !== 1) return;
        const f = (x: number, y: number) => {
          const values = new Map([
            ["x", x],
            ["y", y],
          ]);
          const l = left[0]!(values),
            r = right[0]!(values);
          return l === null || r === null ? NaN : order.direction * (r - l);
        };
        // « L ≤ R » is R − L ≥ 0, that is L − R ≤ 0; written as a x + b y + c ≤ 0.
        const c = f(0, 0),
          a = f(1, 0) - c,
          b = f(0, 1) - c;
        if (![a, b, c].every(Number.isFinite) || (a === 0 && b === 0)) return;
        // In one variable, only a bound written « x ≥ 0 », « y ≤ 1 », « 0 \le x \le 4 »: « 3x − 4 > 2x + 1 » is an
        // inequation solved in the same tranche, not a constraint (relecteur, 2026-11-09).
        if (a === 0 || b === 0) {
          const bare = (tex: string) => /^[xy]$/.test(tex.replace(/\\(?:q?quad|[,;:! ])|~|\s+/g, ""));
          const [l, r] = [chain.members[i]!.tex, chain.members[i + 1]!.tex];
          if (!((bare(l) && constantOf(r)) || (bare(r) && constantOf(l)))) return;
        }
        const linear = [
          [2, 3],
          [-1.5, 0.7],
          [4.2, -2.9],
        ].every(([x, y]) => Math.abs(f(x!, y!) - (a * x! + b * y! + c)) <= 1e-9 * (1 + Math.abs(a) + Math.abs(b) + Math.abs(c)) * 10);
        if (linear) planes.push({ a, b, c, text: `${chain.members[i]!.tex.trim()} ${relation.written} ${chain.members[i + 1]!.tex.trim()}` });
      });
    }
  }
  return planes;
}

function constantOf(tex: string): Reading[] | null {
  const value = cellNumber(tex.trim().replace(/\{,\}/g, ","));
  return value ? [() => value.value] : null;
}

/** Vertices of the region where every half-plane holds (clipping a large square), or null when it is unbounded or empty. */
export function regionVertices(planes: readonly HalfPlane[]): Point[] | null {
  const big = 1e4;
  let polygon: Point[] = [
    [-big, -big],
    [big, -big],
    [big, big],
    [-big, big],
  ];
  for (const { a, b, c } of planes) {
    const value = ([x, y]: Point) => a * x + b * y + c;
    const next: Point[] = [];
    polygon.forEach((current, i) => {
      const previous = polygon[(i + polygon.length - 1) % polygon.length]!;
      const vc = value(current),
        vp = value(previous);
      if (vc <= 1e-9) {
        if (vp > 1e-9) next.push(cut(previous, current, vp, vc));
        next.push(current);
      } else if (vp <= 1e-9) next.push(cut(previous, current, vp, vc));
    });
    polygon = next;
    if (polygon.length < 3) return null;
  }
  if (polygon.some(([x, y]) => Math.abs(x) >= big / 2 || Math.abs(y) >= big / 2)) return null;
  // Merge repeated vertices and drop those in the middle of a side.
  const unique = polygon.filter((p, i) => Math.hypot(p[0] - polygon[(i + 1) % polygon.length]![0], p[1] - polygon[(i + 1) % polygon.length]![1]) > 1e-7);
  const corners = unique.filter((p, i) => {
    const before = unique[(i + unique.length - 1) % unique.length]!,
      after = unique[(i + 1) % unique.length]!;
    return Math.abs((p[0] - before[0]) * (after[1] - before[1]) - (p[1] - before[1]) * (after[0] - before[0])) > 1e-7;
  });
  return corners.length >= 3 ? corners.map(([x, y]) => [clean(x), clean(y)] as const) : null;
}

const clean = (v: number) => (Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) + 0 : v);
function cut(p: Point, q: Point, vp: number, vq: number): Point {
  const t = vp / (vp - vq);
  return [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
}

const pointText = ([x, y]: Point) => `(${french(x)} ; ${french(y)})`;

/** A polygon drawn with the inequalities of its tranche must be their region: same vertices. */
export function checkConstraintPolygon(id: string, vertices: readonly Point[], planes: readonly HalfPlane[]): ValueIssue | null {
  if (SHOWN_WRONG.test(id) || planes.length < 2 || !planes.some((p) => p.b !== 0) || !planes.some((p) => p.a !== 0)) return null;
  const region = regionVertices(planes);
  if (!region) return null;
  const xs = region.map((p) => p[0]),
    ys = region.map((p) => p[1]);
  const tolerance = 0.01 * Math.max(1e-9, Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)));
  const near = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= tolerance;
  const missing = region.filter((p) => !vertices.some((q) => near(p, q)));
  // A vertex in the middle of a side (D on x + y = 6) draws the same region.
  const onSide = (q: Point) =>
    region.some((p, i) => {
      const r = region[(i + 1) % region.length]!,
        dx = r[0] - p[0],
        dy = r[1] - p[1],
        length = Math.hypot(dx, dy);
      const t = ((q[0] - p[0]) * dx + (q[1] - p[1]) * dy) / (length * length);
      return t >= 0 && t <= 1 && Math.abs((q[0] - p[0]) * dy - (q[1] - p[1]) * dx) / length <= tolerance;
    });
  const extra = vertices.filter((q) => !region.some((p) => near(p, q)) && !onSide(q));
  if (!missing.length && !extra.length) return null;
  const outside = extra
    .map((q) => ({ q, broken: planes.find(({ a, b, c }) => a * q[0] + b * q[1] + c > tolerance * Math.hypot(a, b)) }))
    .find((entry) => entry.broken);
  return {
    message: `Le polygone « ${id} » ne correspond pas à la région de ${planes.map((p) => `« ${p.text} »`).join(", ")} : ses sommets sont ${region.map(pointText).join(", ")} (les intersections des frontières qui respectent toutes les contraintes).${missing.length ? ` Il manque ${missing.map(pointText).join(", ")}.` : ""}${outside ? ` ${pointText(outside.q)} ne respecte pas « ${outside.broken!.text} ».` : ""} Calcule chaque sommet comme l'intersection de deux frontières.`,
  };
}
