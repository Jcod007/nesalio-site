import { describe, expect, it } from "vitest";
import { compileExpression, ExprError, parseExpression } from "./expr";

const at = (source: string, x: number) => compileExpression(source)(x);

describe("compileExpression", () => {
  it("respecte les priorités et le moins unaire devant une puissance", () => {
    expect(at("-(x-2)^2+3", 2)).toBe(3);
    expect(at("-(x-2)^2+3", 0)).toBe(-1);
    expect(at("-x^2", 3)).toBe(-9);
    expect(at("2^3^2", 0)).toBe(512);
    expect(at("1+2*3", 0)).toBe(7);
    expect(at("(1+2)*3", 0)).toBe(9);
  });

  it("accepte la multiplication implicite", () => {
    expect(at("2x", 4)).toBe(8);
    expect(at("3(x+1)", 1)).toBe(6);
    expect(at("(x-1)(x+1)", 3)).toBe(8);
    expect(at("2pi", 0)).toBeCloseTo(2 * Math.PI);
    expect(at("2xsin(x)", Math.PI / 2)).toBeCloseTo(Math.PI);
  });

  it("gère les fonctions et les constantes", () => {
    expect(at("sqrt(x)", 9)).toBe(3);
    expect(at("cos(37*pi/180)", 0)).toBeCloseTo(0.7986, 4);
    expect(at("ln(e)", 0)).toBe(1);
    expect(at("log(1000)", 0)).toBe(3);
    expect(at("sin x", Math.PI / 2)).toBeCloseTo(1);
  });

  it("normalise les symboles Unicode", () => {
    expect(at("x² − 1", 3)).toBe(8);
    expect(at("2·π", 0)).toBeCloseTo(2 * Math.PI);
    expect(at("√(x)", 16)).toBe(4);
  });

  it("refuse le code arbitraire et les erreurs de syntaxe", () => {
    expect(() => parseExpression("alert(1)")).toThrow(ExprError);
    expect(() => parseExpression("x+")).toThrow(ExprError);
    expect(() => parseExpression("(x+1")).toThrow(ExprError);
    expect(() => parseExpression("x;1")).toThrow(ExprError);
    expect(() => parseExpression("")).toThrow(ExprError);
    expect(() => parseExpression("x".repeat(300))).toThrow(ExprError);
  });
});

describe("variable t", () => {
  it("accepte t comme synonyme de x (axe du temps), sans casser tan ni sqrt", async () => {
    const { compileExpression } = await import("./expr");
    expect(compileExpression("sin(t)+0.5*sin(3*t)")(Math.PI / 2)).toBeCloseTo(1 - 0.5);
    expect(compileExpression("tan(t)")(0)).toBe(0);
    expect(compileExpression("sqrt(t)")(4)).toBe(2);
    expect(compileExpression("2t")(3)).toBe(6);
  });
});
