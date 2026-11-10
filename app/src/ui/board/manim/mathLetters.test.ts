import { describe, expect, it } from "vitest";
import { drawableMathLetters } from "./mathLetters";

describe("lettres que manim-web ne dessine pas en mode math", () => {
  it("écrit le p isolé \\mathit{p} (leçon réelle « PV = nRT » arrêtée : dimensions NaN)", () => {
    expect(drawableMathLetters("pV = nRT")).toBe("\\mathit{p}V = nRT");
    expect(drawableMathLetters("p = \\frac{nRT}{V}")).toBe("\\mathit{p} = \\frac{nRT}{V}");
    expect(drawableMathLetters("2p + 1")).toBe("2\\mathit{p} + 1");
  });

  it("ne touche ni les noms de commandes ni le texte", () => {
    for (const latex of ["\\pi r^2", "x \\approx 3{,}73", "\\pm\\sqrt{3}", "101\\ \\text{kPa}", "\\text{pression}", "\\mathrm{pH} = 7", "\\operatorname{sup}"]) {
      expect(drawableMathLetters(latex), latex).toBe(latex);
    }
  });

  it("laisse une formule sans p telle quelle", () => {
    expect(drawableMathLetters("f(x) = -(x - 2)^2 + 3")).toBe("f(x) = -(x - 2)^2 + 3");
  });
});
