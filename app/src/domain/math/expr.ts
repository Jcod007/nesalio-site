/**
 * Parseur d'expressions mathématiques sûr (aucun `eval`).
 *
 * Le modèle décrit les courbes par une expression en x, par exemple
 * "-(x-2)^2+3" ou "16*x/(20*cos(37*pi/180))". On la transforme en arbre
 * syntaxique (analyse de Pratt), puis en fonction JavaScript.
 *
 * Grammaire acceptée :
 *   nombres (3, 2.5, 1e-3), variable x (ou t, son synonyme : un axe du temps), constantes pi et e,
 *   + - * / ^ (puissance associative à droite, prioritaire sur le moins unaire),
 *   multiplication implicite (2x, 3(x+1), (x-1)(x+1), 2pi),
 *   fonctions : sin cos tan asin acos atan sqrt abs exp ln log floor ceil.
 */

export class ExprError extends Error {
  constructor(
    message: string,
    readonly position: number,
  ) {
    super(message);
    this.name = "ExprError";
  }
}

export type ExprNode =
  | { kind: "num"; value: number }
  | { kind: "var" }
  | { kind: "symbol"; name: string }
  | { kind: "neg"; arg: ExprNode }
  | { kind: "bin"; op: "+" | "-" | "*" | "/" | "^"; left: ExprNode; right: ExprNode }
  | { kind: "call"; fn: FunctionName; arg: ExprNode };

const FUNCTIONS = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  floor: Math.floor,
  ceil: Math.ceil,
} as const;

type FunctionName = keyof typeof FUNCTIONS;

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

const MAX_LENGTH = 200;

type Token =
  | { type: "num"; value: number; pos: number }
  | { type: "id"; value: string; pos: number }
  | { type: "op"; value: "+" | "-" | "*" | "/" | "^"; pos: number }
  | { type: "lparen"; pos: number }
  | { type: "rparen"; pos: number }
  | { type: "end"; pos: number };

/** Ramène les symboles que le modèle écrit parfois en Unicode vers la syntaxe ASCII. */
export function normalizeExpression(source: string): string {
  return source
    .replace(/[−–]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/π/g, "pi")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/√/g, "sqrt");
}

function tokenize(source: string, namedSymbols = false): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const match = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(i));
      if (!match) throw new ExprError(`Nombre invalide à la position ${i}`, i);
      tokens.push({ type: "num", value: Number(match[0]), pos: i });
      i += match[0].length;
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      const match = (namedSymbols ? /^[a-zA-Z][a-zA-Z0-9_]*/ : /^[a-zA-Z]+/).exec(source.slice(i))!;
      if (namedSymbols) tokens.push({ type: "id", value: match[0], pos: i });
      else tokens.push(...splitIdentifier(match[0], i));
      i += match[0].length;
      continue;
    }
    if ("+-*/^".includes(ch)) {
      tokens.push({ type: "op", value: ch as "+" | "-" | "*" | "/" | "^", pos: i });
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "lparen", pos: i });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen", pos: i });
      i++;
      continue;
    }
    throw new ExprError(`Caractère inattendu « ${ch} » à la position ${i}`, i);
  }
  tokens.push({ type: "end", pos: source.length });
  return tokens;
}

/**
 * Découpe une suite de lettres en identifiants connus, pour accepter
 * « 2xsin(x) » ou « pix » sans espaces. Le plus long nom connu gagne.
 */
function splitIdentifier(word: string, start: number): Token[] {
  const names = [...Object.keys(FUNCTIONS), ...Object.keys(CONSTANTS), "x", "t"].sort((a, b) => b.length - a.length);
  const out: Token[] = [];
  let rest = word.toLowerCase();
  let offset = 0;
  while (rest.length > 0) {
    const name = names.find((n) => rest.startsWith(n));
    if (!name) throw new ExprError(`Nom inconnu « ${word} » à la position ${start}`, start);
    out.push({ type: "id", value: name, pos: start + offset });
    rest = rest.slice(name.length);
    offset += name.length;
  }
  return out;
}

const BINDING: Record<"+" | "-" | "*" | "/" | "^", number> = { "+": 10, "-": 10, "*": 20, "/": 20, "^": 40 };
const UNARY_MINUS = 30;
const IMPLICIT_MUL = 20;

class Parser {
  private index = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly symbols?: ReadonlySet<string>,
  ) {}

  parse(): ExprNode {
    const node = this.expression(0);
    const next = this.peek();
    if (next.type !== "end") throw new ExprError(`Symbole en trop à la position ${next.pos}`, next.pos);
    return node;
  }

  private peek(): Token {
    return this.tokens[this.index]!;
  }

  private next(): Token {
    return this.tokens[this.index++]!;
  }

  private expression(minBinding: number): ExprNode {
    let left = this.prefix();
    for (;;) {
      const token = this.peek();
      if (token.type === "op") {
        const binding = BINDING[token.value];
        if (binding <= minBinding) break;
        this.next();
        // La puissance est associative à droite : 2^3^2 = 2^(3^2).
        const right = this.expression(token.value === "^" ? binding - 1 : binding);
        left = { kind: "bin", op: token.value, left, right };
        continue;
      }
      // Multiplication implicite : un nombre, x, une constante, une fonction ou une parenthèse qui suit.
      if (token.type === "num" || token.type === "id" || token.type === "lparen") {
        if (IMPLICIT_MUL <= minBinding) break;
        const right = this.expression(IMPLICIT_MUL);
        left = { kind: "bin", op: "*", left, right };
        continue;
      }
      break;
    }
    return left;
  }

  private prefix(): ExprNode {
    const token = this.next();
    switch (token.type) {
      case "num":
        return { kind: "num", value: token.value };
      case "op":
        if (token.value === "-") return { kind: "neg", arg: this.expression(UNARY_MINUS) };
        if (token.value === "+") return this.expression(UNARY_MINUS);
        throw new ExprError(`Opérateur « ${token.value} » mal placé à la position ${token.pos}`, token.pos);
      case "lparen": {
        const inner = this.expression(0);
        const close = this.next();
        if (close.type !== "rparen") throw new ExprError(`Parenthèse fermante manquante à la position ${close.pos}`, close.pos);
        return inner;
      }
      case "id": {
        if (this.symbols) {
          if (this.symbols.has(token.value)) return { kind: "symbol", name: token.value };
          // pi is a constant everywhere; a symbol declared with that name still wins.
          if (token.value === "pi") return { kind: "num", value: Math.PI };
          if (!restrictedFunctions.has(token.value)) throw new ExprError(`Nom inconnu « ${token.value} »`, token.pos);
          if (this.peek().type !== "lparen") throw new ExprError("Argument de fonction attendu", token.pos);
          return { kind: "call", fn: token.value as FunctionName, arg: this.prefix() };
        }
        // t est un synonyme de x : le modèle écrit sin(t) quand l'axe est celui du temps.
        if (token.value === "x" || token.value === "t") return { kind: "var" };
        const constant = CONSTANTS[token.value];
        if (constant !== undefined) return { kind: "num", value: constant };
        const fn = token.value as FunctionName;
        const open = this.peek();
        // sin x est accepté comme sin(x) ; l'argument lie plus fort qu'un produit.
        const arg = open.type === "lparen" ? this.prefix() : this.expression(BINDING["^"] - 1);
        return { kind: "call", fn, arg };
      }
      case "rparen":
      case "end":
        throw new ExprError(`Expression incomplète à la position ${token.pos}`, token.pos);
    }
  }
}

export function parseExpression(source: string): ExprNode {
  const normalized = normalizeExpression(source);
  if (normalized.length > MAX_LENGTH) throw new ExprError("Expression trop longue", MAX_LENGTH);
  if (normalized.trim() === "") throw new ExprError("Expression vide", 0);
  return new Parser(tokenize(normalized)).parse();
}

// floor and ceil: the integer part [x] (partie entière), announced by the prompt.
const restrictedFunctions: ReadonlySet<string> = new Set(["sqrt", "abs", "sin", "cos", "tan", "exp", "log", "floor", "ceil"]);

/**
 * Limits of a named expression (engineShell.json, `max_abs_constant` and `max_abs_exponent`).
 * Raised on 2026-11-09 from 1e9 and 32: the Alloprof bench lost lessons on the Avogadro number
 * (6,022 × 10^23) and on monthly compound interest over ten years (exponent 120). A result too
 * large for a number still becomes « no value » (`null`), as before.
 */
export const MAX_ABS_CONSTANT = 1e30;
export const MAX_ABS_EXPONENT = 400;

/** Expressions v3.3, avec des symboles déclarés et des limites indépendantes du moteur de rendu. */
export function compileNamedExpression(source: string, symbols: ReadonlySet<string>): (values: ReadonlyMap<string, number>) => number | null {
  if (source.length > 256) throw new ExprError("Expression trop longue", 256);
  const root = new Parser(tokenize(source, true), symbols).parse();
  let count = 0;
  type Evaluate = (values: ReadonlyMap<string, number>) => number;
  function binary(operator: Extract<ExprNode, { kind: "bin" }>["op"], left: number, right: number): number {
    if (!Number.isFinite(left) || !Number.isFinite(right)) return NaN;
    switch (operator) {
      case "+":
        return left + right;
      case "-":
        return left - right;
      case "*":
        return left * right;
      case "/":
        return left / right;
      case "^":
        return Math.abs(right) <= MAX_ABS_EXPONENT ? left ** right : NaN;
    }
  }
  function compile(node: ExprNode, depth: number): Evaluate {
    if (++count > 64 || depth > 12) throw new ExprError("Expression trop complexe", 0);
    switch (node.kind) {
      case "num":
        if (Math.abs(node.value) > MAX_ABS_CONSTANT) throw new ExprError("Constante hors limite", 0);
        return () => node.value;
      case "symbol":
        return (values) => values.get(node.name) ?? NaN;
      case "var":
        throw new ExprError("Variable non déclarée", 0);
      case "neg": {
        const arg = compile(node.arg, depth + 1);
        return (values) => -arg(values);
      }
      case "call": {
        const arg = compile(node.arg, depth + 1);
        return (values) => {
          const value = arg(values);
          return Number.isFinite(value) ? FUNCTIONS[node.fn](value) : NaN;
        };
      }
      case "bin": {
        const left = compile(node.left, depth + 1);
        const right = compile(node.right, depth + 1);
        const exponent = node.right.kind === "neg" ? node.right.arg : node.right;
        if (node.op === "^" && exponent.kind === "num" && Math.abs(exponent.value) > MAX_ABS_EXPONENT) {
          throw new ExprError("Exposant hors limite", 0);
        }
        return (values) => binary(node.op, left(values), right(values));
      }
    }
  }
  const evaluate = compile(root, 1);
  return (values) => {
    const result = evaluate(values);
    return Number.isFinite(result) ? result : null;
  };
}

function build(node: ExprNode): (x: number) => number {
  switch (node.kind) {
    case "num": {
      const value = node.value;
      return () => value;
    }
    case "var":
      return (x) => x;
    case "symbol":
      throw new ExprError("Variable non déclarée", 0);
    case "neg": {
      const arg = build(node.arg);
      return (x) => -arg(x);
    }
    case "call": {
      const fn = FUNCTIONS[node.fn];
      const arg = build(node.arg);
      return (x) => fn(arg(x));
    }
    case "bin": {
      const left = build(node.left);
      const right = build(node.right);
      switch (node.op) {
        case "+":
          return (x) => left(x) + right(x);
        case "-":
          return (x) => left(x) - right(x);
        case "*":
          return (x) => left(x) * right(x);
        case "/":
          return (x) => left(x) / right(x);
        case "^":
          return (x) => left(x) ** right(x);
      }
    }
  }
}

/** Compile une expression en fonction de x. Lève `ExprError` si elle est invalide. */
export function compileExpression(source: string): (x: number) => number {
  return build(parseExpression(source));
}

/** Variante sans exception, pratique pour la validation. */
export function tryCompileExpression(source: string): ((x: number) => number) | null {
  try {
    return compileExpression(source);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Exact fractions (ported from domain/tutor/assessment.ts) and a reader for the
// numeric members of a simple LaTeX formula. Used by the correctness checks.
// ---------------------------------------------------------------------------

export interface Rational {
  numerator: bigint;
  denominator: bigint;
}

/** Bounded exact fraction: IEEE-754 rounding must not turn an error into a success. */
function fraction(numerator: bigint, denominator: bigint): Rational | null {
  if (denominator === 0n || numerator.toString(2).length > 512 || denominator.toString(2).length > 512) return null;
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  let a = numerator < 0n ? -numerator : numerator;
  let b = denominator;
  while (b) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a === 0n ? { numerator: 0n, denominator: 1n } : { numerator: numerator / a, denominator: denominator / a };
}

/** Exact value of an expression made of numbers and + - * / ^ (integer exponent); null otherwise. */
export function exactValue(node: ExprNode): Rational | null {
  if (node.kind === "var" || node.kind === "symbol" || node.kind === "call") return null;
  if (node.kind === "num") {
    // Constants such as pi arrive as numbers: only decimal literals are exact.
    if (!Number.isFinite(node.value) || node.value === Math.PI || node.value === Math.E) return null;
    const [mantissa, exponent = "0"] = node.value.toString().split("e");
    const [integer, decimal = ""] = mantissa!.split(".");
    const shift = Number(exponent) - decimal.length;
    const digits = BigInt(`${integer}${decimal}`);
    return shift >= 0 ? fraction(digits * 10n ** BigInt(shift), 1n) : fraction(digits, 10n ** BigInt(-shift));
  }
  if (node.kind === "neg") {
    const arg = exactValue(node.arg);
    return arg ? { ...arg, numerator: -arg.numerator } : null;
  }
  const left = exactValue(node.left);
  const right = exactValue(node.right);
  if (!left || !right) return null;
  const a = left.numerator,
    b = left.denominator,
    c = right.numerator,
    d = right.denominator;
  switch (node.op) {
    case "+":
      return fraction(a * d + c * b, b * d);
    case "-":
      return fraction(a * d - c * b, b * d);
    case "*":
      return fraction(a * c, b * d);
    case "/":
      return fraction(a * d, b * c);
    case "^": {
      if (d !== 1n || c < -128n || c > 128n || (a === 0n && c <= 0n)) return null;
      const exponent = c < 0n ? -c : c;
      if (Math.max(a.toString(2).length, b.toString(2).length) * Number(exponent) > 512) return null;
      return c < 0n ? fraction(b ** exponent, a ** exponent) : fraction(a ** exponent, b ** exponent);
    }
  }
}

export function sameRational(a: Rational, b: Rational): boolean {
  return a.numerator === b.numerator && a.denominator === b.denominator;
}

export interface LatexNumber {
  value: number;
  /** Exact value when the member only uses rational arithmetic. */
  exact: Rational | null;
  /** For a single written number (13,47 or 6,02 × 10^23): half a unit of its last digit. */
  halfUnit: number | null;
  /** Degrees written outside a sine, cosine or tangent: an angle, not comparable to radians. */
  degrees: boolean;
  /** Unit written after the value (« cm », « $ »), spaces removed; null if none. */
  unit: string | null;
}

/** Argument of a LaTeX command from `index`: a braced group or one character. */
function texArgument(text: string, index: number): [string, number] {
  while (text[index] === " ") index++;
  if (text[index] !== "{") {
    if (index >= text.length) throw new ExprError("Argument manquant", index);
    return [text[index]!, index + 1];
  }
  for (let depth = 0, j = index; j < text.length; j++) {
    if (text[j] === "{") depth++;
    else if (text[j] === "}" && --depth === 0) return [text.slice(index + 1, j), j + 1];
  }
  throw new ExprError("Accolade non fermée", index);
}

const UNIT_TEXT = /\\(?:text|mathrm|textrm|mbox)\s*\{[^{}]*\}/;
const TRAILING_UNIT = /(?:\\[,;: !]|~|\s)*(?:\\\$|\$|€|\\euro|\\(?:text|mathrm|textrm|mbox)\s*\{[^{}]*\})\s*$/;

interface LatexSource {
  source: string;
  /** The same member with its square brackets read as an integer part ([3,7] → floor(3.7)); null without brackets. */
  floorSource: string | null;
  degrees: boolean;
  literal: string | null;
  unit: string | null;
}

/**
 * Restricted LaTeX → expression syntax of this module, or null if the member is not purely numeric
 * (with `variables`: if it uses another name than these variables).
 */
function latexToSource(tex: string, variables: readonly string[] = []): LatexSource | null {
  let s = tex
    .trim()
    .replace(/[.;:]$/, "")
    .trim();
  // A unit written at the end (« 13,47 cm », « 2080 $ ») is not part of the value; elsewhere it is not numeric.
  const unitMatch = TRAILING_UNIT.exec(s);
  const unit = unitMatch ? unitMatch[0].replace(/\\(?:text|mathrm|textrm|mbox)|[\\{}\s~,;:!]/g, "") || null : null;
  s = s.replace(TRAILING_UNIT, "");
  if (UNIT_TEXT.test(s)) return null;
  s = s
    .replace(/\\(?:displaystyle|left|right|big|Big)(?![a-zA-Z])/g, "")
    .replace(/\\[,;:! ]|~|\\q?quad/g, " ")
    .replace(/(\d)\s*\{,\}\s*(\d)/g, "$1.$2")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/[−–]/g, "-")
    .replace(/\\times|\\cdot|×|·/g, "*")
    .replace(/\\div|÷/g, "/")
    .replace(/\\%/g, " PCT ")
    .replace(/\^\s*(?:\{\s*\\circ\s*\}|\\circ)|°/g, " DEG ")
    .replace(/\\pi\b/g, " pi ")
    .replace(/\\(sin|cos|tan|ln|log|exp)\b/g, " $1 ");
  // Thousands written with a space: 2 433.40.
  s = s.replace(/(^|[^\d.])(\d{1,3})((?: \d{3})+)(?![\d])/g, (_m, before: string, head: string, groups: string) => before + head + groups.replace(/ /g, ""));
  // \frac and \sqrt rewritten with parentheses, from the outside in.
  for (let guard = 0; guard < 64; guard++) {
    const command = /\\([dt]?frac|sqrt)/.exec(s);
    if (!command) break;
    let next = command.index + command[0].length;
    if (command[1] === "sqrt") {
      let root: string | null = null;
      while (s[next] === " ") next++;
      if (s[next] === "[") {
        const close = s.indexOf("]", next);
        if (close < 0) return null;
        root = s.slice(next + 1, close);
        next = close + 1;
      }
      const [radicand, after] = texArgument(s, next);
      s = s.slice(0, command.index) + (root === null ? ` sqrt((${radicand}))` : ` ((${radicand})^(1/(${root})))`) + s.slice(after);
    } else {
      const [numerator, middle] = texArgument(s, next);
      const [denominator, after] = texArgument(s, middle);
      s = `${s.slice(0, command.index)} ((${numerator})/(${denominator}))${s.slice(after)}`;
    }
  }
  // Square brackets are parentheses or an integer part [x]: both readings are kept.
  let floorSource = /\[/.test(s) ? s.replace(/\[/g, " floor(").replace(/\]/g, ")").replace(/\{/g, "(").replace(/\}/g, ")") : null;
  s = s.replace(/[{[]/g, "(").replace(/[}\]]/g, ")");
  // Degrees inside a trigonometric function become radians; elsewhere they mark an angle.
  s = s.replace(/(sin|cos|tan)\s*\(\s*([\d.]+)\s*DEG\s*\)/g, "$1(($2)*pi/180)").replace(/(sin|cos|tan)\s*([\d.]+)\s*DEG/g, "$1(($2)*pi/180)");
  if (floorSource !== null) {
    floorSource = floorSource
      .replace(/(sin|cos|tan)\s*\(\s*([\d.]+)\s*DEG\s*\)/g, "$1(($2)*pi/180)")
      .replace(/(sin|cos|tan)\s*([\d.]+)\s*DEG/g, "$1(($2)*pi/180)")
      .replace(/DEG/g, " ")
      .replace(/PCT/g, "*0.01")
      .trim();
  }
  let degrees = false;
  if (/DEG/.test(s)) {
    degrees = true;
    s = s.replace(/DEG/g, " ");
  }
  s = s.replace(/PCT/g, "*0.01").trim();
  if (/\\|[^\d\s.+\-*/^()a-z]/.test(s)) return null;
  // Only known function names, pi and the given variables: no other name, no Euler e (it would read as a variable).
  const words = s.match(/[a-z]+/g) ?? [];
  if (words.some((word) => !["sin", "cos", "tan", "ln", "log", "exp", "sqrt", "pi", ...variables].includes(word))) return null;
  if (/(sin|cos|tan|ln|log|exp|sqrt)\s*\^/.test(s)) return null;
  // Two numbers side by side (« 2 3 ») are not a product anyone wrote.
  if (/[\d.]\s+[\d.]/.test(s) || /\)\s*[\d.]/.test(s)) return null;
  if (!variables.length && !/\d/.test(s)) return null;
  const literal = /^-?\s*\d+(?:\.\d+)?\s*(?:\*\s*10\s*\^\s*\(?\s*-?\d+\s*\)?)?\s*(?:\*0\.01)?$/.test(s) ? s : null;
  return { source: s, floorSource, degrees, literal, unit };
}

/** Half a unit of the last digit of a single written number, scaled by its power of ten and percent. */
function halfUnitOf(source: string): number {
  const percent = /\*0\.01$/.test(source) ? 0.01 : 1;
  const m = /(\d+)(?:\.(\d+))?\s*(?:\*\s*10\s*\^\s*\(?\s*(-?\d+)\s*\)?)?/.exec(source)!;
  const decimals = m[2]?.length ?? 0;
  return 0.5 * 10 ** (Number(m[3] ?? 0) - decimals) * percent;
}

/** Value of one member of a LaTeX formula (« \frac{8}{2} », « 2\,433{,}40\ \$ »), or null if not numeric. */
export function readLatexNumber(tex: string): LatexNumber | null {
  if (tex.length > 400) return null;
  try {
    const converted = latexToSource(tex);
    if (!converted || converted.source.length > MAX_LENGTH) return null;
    const node = parseExpression(converted.source);
    const exact = exactValue(node);
    const value = exact ? Number(exact.numerator) / Number(exact.denominator) : compileExpression(converted.source)(0);
    if (!Number.isFinite(value)) return null;
    // [3,7] is 3,7 between brackets, or the integer part 3: when the two readings differ, the member is not read.
    if (converted.floorSource !== null) {
      const floor = compileExpression(converted.floorSource)(0);
      if (!(Math.abs(floor - value) <= 1e-9 * Math.max(1, Math.abs(value)))) return null;
    }
    return { value, exact, halfUnit: converted.literal ? halfUnitOf(converted.literal) : null, degrees: converted.degrees, unit: converted.unit };
  } catch {
    return null;
  }
}

export type LatexRelation = "=" | "≈" | "other";
export interface LatexChain {
  /** Members between relations, with their offsets in the formula. */
  members: { tex: string; start: number }[];
  /** Relation between member i and member i + 1, with its offsets in the formula. */
  relations: { symbol: LatexRelation; start: number; end: number; written: string }[];
}

const RELATION =
  /^(?:=|≈|\\approx(?![a-zA-Z])|\\simeq(?![a-zA-Z])|\\neq?(?![a-zA-Z])|\\leq?(?![a-zA-Z])|\\geq?(?![a-zA-Z])|\\leqslant|\\geqslant|\\[lg]t(?![a-zA-Z])|<|>|≤|≥|⩽|⩾|≠)/;
const STATEMENT_BREAK =
  /^(?:\\q?quad(?![a-zA-Z])|\\\\|\\(?:Long)?[Rr]ightarrow|\\(?:Long)?[Ll]eftrightarrow|\\implies|\\iff|\\Leftarrow|\\to(?![a-zA-Z])|\\longrightarrow|→|⇒|\\text\s*\{\s*(?:et|donc|ou|soit|car|alors|puis)\s*\}|;|&)/;

const RELATION_KINDS: readonly (readonly [RegExp, LatexRelation])[] = [
  [/^=$/, "="],
  [/^(?:≈|\\approx|\\simeq)$/, "≈"],
];
function relationOf(written: string): LatexRelation {
  return RELATION_KINDS.find(([pattern]) => pattern.test(written))?.[1] ?? "other";
}

/** Splits a formula into statements, each a chain of members joined by relations at brace depth 0. */
export function splitLatexChains(formula: string): LatexChain[] {
  const chains: LatexChain[] = [];
  let chain: LatexChain = { members: [], relations: [] };
  let memberStart = 0;
  let depth = 0;
  const closeMember = (end: number) => chain.members.push({ tex: formula.slice(memberStart, end), start: memberStart });
  for (let i = 0; i < formula.length; ) {
    const char = formula[i]!;
    if (char === "\\" && /[{}[\]()]/.test(formula[i + 1] ?? "")) {
      i += 2;
      continue;
    }
    if (char === "{" || char === "(" || char === "[") {
      depth++;
      i++;
      continue;
    }
    if (char === "}" || char === ")" || char === "]") {
      depth = Math.max(0, depth - 1);
      i++;
      continue;
    }
    const rest = formula.slice(i);
    // Inside braces or parentheses (coordinates « (3 ; 4) », a fraction) nothing splits.
    const brk = depth === 0 ? STATEMENT_BREAK.exec(rest) : null;
    if (brk) {
      closeMember(i);
      if (chain.relations.length) chains.push(chain);
      chain = { members: [], relations: [] };
      i += brk[0].length;
      memberStart = i;
      continue;
    }
    const relation = depth === 0 ? RELATION.exec(rest) : null;
    if (relation) {
      closeMember(i);
      const symbol = relationOf(relation[0]);
      chain.relations.push({ symbol, start: i, end: i + relation[0].length, written: relation[0] });
      i += relation[0].length;
      memberStart = i;
      continue;
    }
    i += char === "\\" ? (/^\\[a-zA-Z]+/.exec(rest)?.[0].length ?? 2) : 1;
  }
  closeMember(formula.length);
  if (chain.relations.length) chains.push(chain);
  return chains;
}

/** Direction of an order relation as written (\le, ≤, <, \geqslant…): -1 for « less », 1 for « greater », null otherwise. */
export function orderOf(written: string): { direction: -1 | 1; strict: boolean } | null {
  if (/^(?:<|\\lt)$/.test(written)) return { direction: -1, strict: true };
  if (/^(?:>|\\gt)$/.test(written)) return { direction: 1, strict: true };
  if (/^(?:≤|⩽|\\leq?|\\leqslant)$/.test(written)) return { direction: -1, strict: false };
  if (/^(?:≥|⩾|\\geq?|\\geqslant)$/.test(written)) return { direction: 1, strict: false };
  return null;
}

/**
 * A member of a LaTeX formula read as a function of `variables` (« x^2 - 4x + 3 », « \frac{1}{2}x », « [x + 2] »),
 * or null when it uses anything else or none of them. Square brackets give two readings (parentheses, then integer
 * part): both are returned.
 */
export function readLatexFunction(tex: string, variables: readonly string[]): ((values: ReadonlyMap<string, number>) => number | null)[] | null {
  if (tex.length > 400 || !variables.length || variables.some((name) => !/^[a-z]$/.test(name))) return null;
  try {
    const converted = latexToSource(tex, variables);
    if (!converted || converted.unit || converted.degrees) return null;
    const names = new Set(variables);
    // « xy » is the product x × y.
    const split = (source: string) => source.replace(/[a-z]+/g, (word) => ([...word].every((letter) => names.has(letter)) ? [...word].join(" ") : word));
    const sources = [converted.source, ...(converted.floorSource === null ? [] : [converted.floorSource])].map(split);
    if (!sources.every((source) => (source.match(/[a-z]+/g) ?? []).some((word) => names.has(word)))) return null;
    return sources.map((source) => compileNamedExpression(source, names));
  } catch {
    return null;
  }
}
