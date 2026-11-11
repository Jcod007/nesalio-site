import { plainMath } from "@/domain/nesalio/tex";

/**
 * What the student sees when a formula cannot be rendered (MathJax error):
 * plain text, without backslashes or braces, chemistry arrows as symbols.
 */
export function readableFormula(tex: string): string {
  const plain = plainMath(tex)
    .replace(/<=>|<->|<-->/g, "⇌")
    .replace(/->/g, "→")
    .replace(/<-/g, "←")
    .replace(/[\\{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain || "?";
}
