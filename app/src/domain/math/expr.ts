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

function tokenize(source: string): Token[] {
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
      const match = /^[a-zA-Z]+/.exec(source.slice(i))!;
      tokens.push(...splitIdentifier(match[0], i));
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
  const names = [...Object.keys(FUNCTIONS), ...Object.keys(CONSTANTS), "x", "t"].sort(
    (a, b) => b.length - a.length,
  );
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
  constructor(private readonly tokens: Token[]) {}

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

function build(node: ExprNode): (x: number) => number {
  switch (node.kind) {
    case "num": {
      const value = node.value;
      return () => value;
    }
    case "var":
      return (x) => x;
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
          return (x) => Math.pow(left(x), right(x));
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
