import { describe, expect, it } from "vitest";
import { hasMath, mathSize, plainMath, plainText, toLatex } from "./tex";
import { textExtent, FONT_SIZE } from "./layout";
import { DEFAULT_FRAME } from "./state";
import { Action } from "@/domain/scene/commands";

describe("formules au tableau", () => {
  it("repère les formules entre dollars et les met en LaTeX, le reste en texte", () => {
    expect(hasMath("36 + 64 = 100")).toBe(false);
    expect(hasMath("aire = $\\frac{b \\times h}{2}$")).toBe(true);
    expect(toLatex("aire = $\\frac{b \\times h}{2}$")).toBe("\\text{aire = }\\frac{b \\times h}{2}");
    expect(toLatex("50 % de $x^2$")).toBe("\\text{50 \\% de }x^2");
  });

  it("donne une version lisible en texte simple (voix, résumés)", () => {
    expect(plainMath("\\frac{3}{5}")).toBe("3/5");
    expect(plainMath("\\frac{b \\times h}{2}")).toBe("(b × h)/2");
    expect(plainMath("\\sqrt{25} = 5")).toBe("√25 = 5");
    expect(plainMath("a^2 + b^2 = c^2")).toBe("a² + b² = c²");
    expect(plainMath("60^\\circ")).toBe("60°");
    expect(plainMath("\\sin\\theta \\leq 1")).toBe("sinθ ≤ 1");
    expect(plainText("Donc $x = \\frac{1}{2}$.")).toBe("Donc x = 1/2.");
  });

  it("réserve la place d'une formule : une fraction est plus haute qu'une ligne", () => {
    const line = textExtent("x = 10", FONT_SIZE.calc, DEFAULT_FRAME);
    const fraction = textExtent("$x = \\frac{3}{5}$", FONT_SIZE.calc, DEFAULT_FRAME);
    expect(fraction.h).toBeGreaterThan(line.h * 1.6);
    expect(mathSize("$\\sqrt{25}$").w).toBeGreaterThan(mathSize("$25$").w);
    // Le texte hors formule compte toujours.
    expect(mathSize("aire du triangle = $\\frac{1}{2}$").w).toBeGreaterThan(mathSize("$\\frac{1}{2}$").w * 3);
  });

  it("compte la longueur d'un texte pour ce qu'il affiche", () => {
    const long = "$\\frac{a}{b} + \\frac{c}{d} = \\frac{ad + bc}{bd}$";
    expect(Action.safeParse({ type: "note", id: "n", text: long }).success).toBe(true);
    expect(Action.safeParse({ type: "note", id: "n", text: "x".repeat(61) }).success).toBe(false);
  });
});
