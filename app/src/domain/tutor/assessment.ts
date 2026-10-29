import { z } from "zod";
import { normalizeExpression, parseExpression, type ExprNode } from "@/domain/math/expr";

/** Vérifie un calcul déclaré, pas la pertinence de ce calcul pour l'énoncé. */
export const ArithmeticVerification = z.object({
  kind: z.literal("arithmetic"),
  expression: z.string().trim().min(1).max(160),
});
export type ArithmeticVerification = z.infer<typeof ArithmeticVerification>;

export const AssessmentPurpose = z.enum(["practice", "transfer", "retrieval"]);
export const AssessmentMethod = z.enum(["answer-key", "arithmetic", "ungraded"]);

interface AssessableCheck {
  choices: readonly string[];
  answer?: number;
  verification?: ArithmeticVerification;
}

interface Rational { numerator: bigint; denominator: bigint }

/** Fractions exactes bornées : l'arrondi IEEE-754 ne doit pas transformer une erreur en réussite. */
function fraction(numerator: bigint, denominator: bigint): Rational | null {
  if (denominator === 0n || numerator.toString(2).length > 512 || denominator.toString(2).length > 512) return null;
  if (denominator < 0n) { numerator = -numerator; denominator = -denominator; }
  let a = numerator < 0n ? -numerator : numerator;
  let b = denominator;
  while (b) { const remainder = a % b; a = b; b = remainder; }
  return { numerator: numerator / a, denominator: denominator / a };
}

function evaluate(node: ExprNode): Rational | null {
  if (node.kind === "var" || node.kind === "call") return null;
  if (node.kind === "num") {
    if (!Number.isFinite(node.value)) return null;
    const [mantissa, exponent = "0"] = node.value.toString().split("e");
    const [integer, decimal = ""] = mantissa!.split(".");
    const shift = Number(exponent) - decimal.length;
    const digits = BigInt(`${integer}${decimal}`);
    return shift >= 0 ? fraction(digits * 10n ** BigInt(shift), 1n) : fraction(digits, 10n ** BigInt(-shift));
  }
  if (node.kind === "neg") {
    const arg = evaluate(node.arg);
    return arg ? { ...arg, numerator: -arg.numerator } : null;
  }
  const left = evaluate(node.left);
  const right = evaluate(node.right);
  if (!left || !right) return null;
  const a = left.numerator, b = left.denominator, c = right.numerator, d = right.denominator;
  switch (node.op) {
    case "+": return fraction(a * d + c * b, b * d);
    case "-": return fraction(a * d - c * b, b * d);
    case "*": return fraction(a * c, b * d);
    case "/": return fraction(a * d, b * c);
    case "^": {
      if (d !== 1n || c < -128n || c > 128n || a === 0n && c <= 0n) return null;
      const exponent = c < 0n ? -c : c;
      // Borne avant l'exponentiation, y compris pour les données hostiles.
      if (Math.max(a.toString(2).length, b.toString(2).length) * Number(exponent) > 512) return null;
      return c < 0n ? fraction(b ** exponent, a ** exponent) : fraction(a ** exponent, b ** exponent);
    }
  }
}

/** Syntaxe arithmétique bornée, sans variable, unité, JavaScript ni comparaison approchée d'identités. */
function numericFraction(text: string): Rational | null {
  if (text.length > 160) return null;
  const source = normalizeExpression(text.trim().replace(/,/g, "."));
  if (!/^[\d\s.+*/^()-]+$/.test(source)) return null;
  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)|[^\s\d.]/g) ?? [];
  let previousNumber = false;
  for (const token of tokens) {
    const number = /^[\d.]/.test(token);
    // Ni nombres adjacents (« 1 000 »), ni précision perdue au passage dans l'AST existant.
    if (number && (previousNumber || token.replace(/\D/g, "").replace(/^0+/, "").length > 15)) return null;
    previousNumber = number;
  }
  if (tokens.join("") !== source.replace(/\s/g, "")) return null;
  try {
    return evaluate(parseExpression(source));
  } catch { return null; }
}

export function numericValue(text: string): number | null {
  const result = numericFraction(text);
  return result ? Number(result.numerator) / Number(result.denominator) : null;
}

const equal = (a: Rational, b: Rational) => a.numerator === b.numerator && a.denominator === b.denominator;

export function arithmeticCheckViolation(check: AssessableCheck): string | null {
  if (!check.verification) return null;
  const expected = numericFraction(check.verification.expression);
  const values = check.choices.map(numericFraction);
  if (expected === null || values.some((value) => value === null))
    return "La vérification arithmétique exige un calcul constant fini et des choix numériques exacts. Corrige le calcul ou utilise une question sans ce contrat si elle porte sur autre chose.";
  const matching = values.flatMap((value, index) => value !== null && equal(value, expected) ? [index] : []);
  if (matching.length !== 1 || matching[0] !== check.answer)
    return "Le calcul vérifié ne correspond pas à une unique bonne réponse du QCM. Recalcule les choix et leur index avant de poser cette question.";
  return null;
}

export interface AnswerAssessment {
  correct: boolean | null;
  method: z.infer<typeof AssessmentMethod>;
}

/** Une réponse libre non interprétable reste non notée ; jamais fausse par défaut. */
export function assessAnswer(check: AssessableCheck, reply: number | string): AnswerAssessment {
  if (check.verification) {
    if (arithmeticCheckViolation(check)) return { correct: null, method: "ungraded" };
    const actual = numericFraction(typeof reply === "number" ? check.choices[reply] ?? "" : reply);
    const expected = numericFraction(check.verification.expression);
    return actual === null || expected === null ? { correct: null, method: "ungraded" }
      : { correct: equal(actual, expected), method: "arithmetic" };
  }
  if (typeof reply !== "number" || check.answer === undefined || !Number.isInteger(reply) || !check.choices[reply])
    return { correct: null, method: "ungraded" };
  return { correct: reply === check.answer, method: "answer-key" };
}
