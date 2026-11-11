import { describe, expect, it } from "vitest";
import { readableFormula } from "./formulaFallback";

describe("formule qui ne se rend pas", () => {
  // Seen in review: a MathJax error showed the raw LaTeX (backslashes, braces) to the student.
  it("s'écrit en texte simple, sans barre oblique ni accolade", () => {
    for (const tex of ["\\frac{3}{4} + \\sqrt{x}", "\\undefinedmacro{a} = 2", "x^{2} - \\left( y_{1} \\right)", "\\{1, 2\\}"]) {
      const plain = readableFormula(tex);
      expect(plain).not.toMatch(/[\\{}]/);
      expect(plain.trim().length).toBeGreaterThan(0);
    }
    expect(readableFormula("\\frac{3}{4} + \\sqrt{x}")).toBe("3/4 + √x");
    expect(readableFormula("x^{2}")).toBe("x²");
  });

  it("garde une équation chimique lisible, flèches comprises", () => {
    expect(readableFormula("\\ce{C3H8 + 5O2 -> 3CO2 + 4H2O}")).toBe("C3H8 + 5O2 → 3CO2 + 4H2O");
    expect(readableFormula("\\ce{N2 + 3H2 <=> 2NH3}")).toBe("N2 + 3H2 ⇌ 2NH3");
  });

  it("n'est jamais vide", () => {
    expect(readableFormula("\\,")).toBe("?");
  });
});
