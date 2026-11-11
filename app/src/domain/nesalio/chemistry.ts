/**
 * Chemical formulas and equations of secondary 4-5 chemistry: atoms, charges,
 * molar masses and the balance of an equation. Written for the correctness
 * checks of Nesalio lessons; it reads, it never balances an equation itself.
 */

export type Atoms = Map<string, number>;

/** Atomic masses with two decimals, as in school tables. */
export const MASSES: Readonly<Record<string, number>> = {
  H: 1.01,
  He: 4.0,
  Li: 6.94,
  Be: 9.01,
  B: 10.81,
  C: 12.01,
  N: 14.01,
  O: 16.0,
  F: 19.0,
  Ne: 20.18,
  Na: 22.99,
  Mg: 24.31,
  Al: 26.98,
  Si: 28.09,
  P: 30.97,
  S: 32.07,
  Cl: 35.45,
  Ar: 39.95,
  K: 39.1,
  Ca: 40.08,
  Sc: 44.96,
  Ti: 47.87,
  V: 50.94,
  Cr: 52.0,
  Mn: 54.94,
  Fe: 55.85,
  Co: 58.93,
  Ni: 58.69,
  Cu: 63.55,
  Zn: 65.38,
  Ga: 69.72,
  Ge: 72.63,
  As: 74.92,
  Se: 78.97,
  Br: 79.9,
  Kr: 83.8,
  Rb: 85.47,
  Sr: 87.62,
  Ag: 107.87,
  Cd: 112.41,
  Sn: 118.71,
  Sb: 121.76,
  I: 126.9,
  Xe: 131.29,
  Cs: 132.91,
  Ba: 137.33,
  Pt: 195.08,
  Au: 196.97,
  Hg: 200.59,
  Pb: 207.2,
  U: 238.03,
};

export interface Formula {
  atoms: Atoms;
  charge: number;
}
export interface Term {
  coefficient: number;
  formula: string;
}
export interface Equation {
  left: Term[];
  right: Term[];
}

function add(into: Atoms, from: Atoms, factor: number): void {
  for (const [element, count] of from) into.set(element, (into.get(element) ?? 0) + count * factor);
}

function group(text: string): Atoms {
  const stack: Atoms[] = [new Map()];
  let i = 0;
  const number = () => {
    const m = /^\d+/.exec(text.slice(i));
    if (!m) return 1;
    i += m[0].length;
    return Number(m[0]);
  };
  while (i < text.length) {
    const char = text[i]!;
    if (char === "(" || char === "[") {
      stack.push(new Map());
      i++;
    } else if (char === ")" || char === "]") {
      i++;
      const inner = stack.pop();
      if (!inner || stack.length === 0) throw new Error(`Parenthèse fermante en trop dans « ${text} »`);
      add(stack.at(-1)!, inner, number());
    } else {
      const m = /^[A-Z][a-z]?/.exec(text.slice(i));
      if (!m || !(m[0] in MASSES)) throw new Error(`Élément inconnu « ${text.slice(i, i + 2)} » dans « ${text} »`);
      i += m[0].length;
      add(stack.at(-1)!, new Map([[m[0], 1]]), number());
    }
  }
  if (stack.length !== 1) throw new Error(`Parenthèse non fermée dans « ${text} »`);
  return stack[0]!;
}

/** « Ca(OH)2 », « CuSO4·5H2O », « SO4^{2-} », « NH4+ » → atoms and charge. Throws when unreadable. */
export function parseFormula(text: string): Formula {
  let s = text
    .replace(/\s+/g, "")
    .replace(/\\mathrm\{([^{}]*)\}|\\text\{([^{}]*)\}/g, (_m, a?: string, b?: string) => a ?? b ?? "")
    .replace(/_\{?(\d+)\}?/g, "$1")
    .replace(/\((?:aq|s|l|g)\)$/, "");
  let charge = 0;
  // mhchem convention: a charge with a digit needs « ^ » (Fe^3+); « NH4+ » is NH₄ with charge +1.
  const c = /(?:\^\{?(\d*)([+-])\}?|\^\{?([+-])(\d*)\}?|([+-]))$/.exec(s);
  if (c && !/^[+-]$/.test(s)) {
    const sign = (c[2] ?? c[3] ?? c[5]) === "+" ? 1 : -1;
    charge = sign * Number(c[1] || c[4] || 1);
    s = s.slice(0, c.index);
  }
  // The electron, written e or e^-.
  if (s === "e" && charge === -1) return { atoms: new Map(), charge };
  if (!s) throw new Error("Formule vide.");
  const atoms: Atoms = new Map();
  for (const [index, part] of s.split(/[·•*]|\.(?=\d|\()/).entries()) {
    const m = /^(\d+)(.*)$/.exec(part);
    const factor = index > 0 && m ? Number(m[1]) : 1;
    add(atoms, group(index > 0 && m ? m[2]! : part), factor);
  }
  return { atoms, charge };
}

export function molarMass(formula: string): number {
  let mass = 0;
  for (const [element, count] of parseFormula(formula).atoms) mass += MASSES[element]! * count;
  return Math.round(mass * 100) / 100;
}

const ARROW = /\s*(?:<=>|<->|->|→|⇌|⟶|\\(?:long)?rightarrow|\\(?:long)?rightleftharpoons|\\rightleftarrows|\\to(?![a-zA-Z]))\s*/;

/**
 * The chemical equation written in a formula (plain, LaTeX or \ce{}), or null
 * when the text is not one: one arrow, and every term a readable formula.
 */
export function readChemicalEquation(text: string): Equation | null {
  let trimmed = text.trim();
  // Several \ce{} pieces (« 2\,\ce{H2} + \ce{O2} -> 2\,\ce{H2O} »): each one unwrapped, the whole read as mhchem.
  const pieces = trimmed.match(/\\ce\s*\{[^{}]*\}/g)?.length ?? 0;
  const several = pieces > 1 || (pieces === 1 && !/^\\ce\s*\{[\s\S]*\}$/.test(trimmed));
  if (several) trimmed = `\\ce{${trimmed.replace(/\\ce\s*\{([^{}]*)\}/g, "$1")}}`;
  const mhchem = /^\\ce\s*\{[\s\S]*\}$/.test(trimmed);
  const source = trimmed
    .replace(/^\\ce\s*\{([\s\S]*)\}$/, "$1")
    // A condition written over the arrow (->[H2O], <=>[Fe][450 °C], \xrightarrow{chaleur}) is not a species.
    .replace(/\\x(?:long)?(?:rightarrow|rightleftharpoons)\s*(?:\[[^\]]*\])?\s*(?:\{[^{}]*\})?/g, " -> ")
    .replace(/(<=>>?|<<=>|<->|->|→|⇌)\s*(?:\[[^\]]*\]\s*){1,2}/g, "$1 ")
    .replace(/\\[,;: !]|~|\\q?quad/g, " ")
    .replace(/\\(?:mathrm|text)\s*\{\s*\}/g, "")
    .replace(/\\(?:left|right)(?![a-zA-Z])/g, "");
  const sides = source.split(ARROW);
  if (sides.length !== 2) return null;
  try {
    const [left, right] = sides.map((side) => {
      // An addition « + » stands between spaces or before a coefficient; « Na+ » stays a charge.
      const terms = side
        .trim()
        .split(/\s+\+\s+|(?<=[A-Za-z0-9)\]}])\s*\+\s+(?=\d*\s*[A-Z([])/)
        // mhchem marks a gas (^) or a precipitate (v) after a space: not part of the formula.
        .map((term) => term.replace(/\s+[v^](?=\s|$)/g, "").trim())
        .filter((term) => term && term !== "^" && term !== "v");
      return terms.map((term) => {
        const m = /^(\d+)\s*(.+)$/.exec(term.trim());
        const formula = (m ? m[2]! : term).trim();
        parseFormula(formula);
        return { coefficient: m ? Number(m[1]) : 1, formula };
      });
    }) as [Term[], Term[]];
    const elements = new Set([...left, ...right].flatMap((t) => [...parseFormula(t.formula).atoms.keys()]));
    // A single element (« 2 H -> H2 ») is chemistry too; nothing at all is not.
    if (elements.size === 0 || left.length === 0 || right.length === 0) return null;
    // Outside \ce{}, « B → C » is a path or a probability tree: each side must hold a real formula
    // (a subscript, a charge or two symbols), not a lone capital letter.
    const molecular = (formula: string) => /\d|[+-]$|\^/.test(formula) || (formula.match(/[A-Z]/g)?.length ?? 0) >= 2;
    if (!mhchem && ![left, right].every((side) => side.some((term) => molecular(term.formula)))) return null;
    return { left, right };
  } catch {
    return null;
  }
}

function total(side: readonly Term[]): Formula {
  const atoms: Atoms = new Map();
  let charge = 0;
  for (const term of side) {
    const formula = parseFormula(term.formula);
    add(atoms, formula.atoms, term.coefficient);
    charge += formula.charge * term.coefficient;
  }
  return { atoms, charge };
}

/** Differences of atoms and charge between the two sides; empty when the equation is balanced. */
export function balanceIssues(equation: Equation): string[] {
  const a = total(equation.left),
    b = total(equation.right);
  const issues: string[] = [];
  for (const element of new Set([...a.atoms.keys(), ...b.atoms.keys()])) {
    const x = a.atoms.get(element) ?? 0,
      y = b.atoms.get(element) ?? 0;
    if (x !== y) issues.push(`${element} : ${x} à gauche, ${y} à droite`);
  }
  if (a.charge !== b.charge) issues.push(`charge : ${a.charge} à gauche, ${b.charge} à droite`);
  return issues;
}

/** Elements present on one side only: wrong species, whatever the coefficients. */
export function missingElements(equation: Equation): string[] {
  const a = total(equation.left).atoms,
    b = total(equation.right).atoms;
  return [...new Set([...a.keys(), ...b.keys()])].filter((element) => !a.has(element) || !b.has(element));
}
