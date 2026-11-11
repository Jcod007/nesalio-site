import { describe, expect, it } from "vitest";
import type { SceneObject } from "./contract";
import { computedFormula, sceneText } from "./measurement";

const math = { symbols: {}, expressions: { e: "a / 4", n: "-a" } };
const computed = (type: "math" | "text" | "label" | "callout", expression: string, precision: number) =>
  ({
    id: "v",
    type,
    content: { kind: "computed", expression_ref: expression, template: "y = {value}", precision },
  }) as Extract<SceneObject, { type: typeof type }>;

describe("valeur calculée écrite au tableau", () => {
  it("écrit la virgule décimale et le signe moins à la française dans un texte", () => {
    expect(sceneText(computed("text", "e", 1), new Map([["a", 16]]), math)).toBe("y = 4,0");
    expect(sceneText(computed("label", "n", 2), new Map([["a", 2.5]]), math)).toBe("y = −2,50");
  });

  // Seen on /dev/nesalio: a computed formula is drawn as plain text, so LaTeX like {,} would show raw.
  it("écrit de même une formule calculée, sans LaTeX", () => {
    expect(sceneText(computed("math", "e", 2), new Map([["a", 5]]), math)).toBe("y = 1,25");
    expect(sceneText(computed("math", "n", 0), new Map([["a", 3]]), math)).toBe("y = −3");
  });

  it("n'écrit pas « −0 » pour une valeur arrondie à zéro", () => {
    expect(sceneText(computed("text", "n", 1), new Map([["a", 0.01]]), math)).toBe("y = 0,0");
  });

  // Essais du 2026-11-10 : le gabarit d'une formule calculée s'affichait en LaTeX brut sur 4 leçons sur 20.
  it("donne le LaTeX d'une formule calculée, virgule {,} et signe moins simple", () => {
    const zinc = {
      id: "v",
      type: "math",
      content: { kind: "computed", expression_ref: "e", template: String.raw`n = \frac{a}{4} = {value}\ \text{mol}`, precision: 3 },
    } as never;
    expect(computedFormula(zinc, new Map([["a", 9.176]]), math)).toBe(String.raw`n = \frac{a}{4} = 2{,}294\ \text{mol}`);
    expect(computedFormula(computed("math", "n", 1), new Map([["a", 2.5]]), math)).toBe("y = -2{,}5");
  });

  it("laisse en texte une formule qui suit un paramètre, et ce qui n'est pas une formule calculée", () => {
    const moving = { symbols: { a: { kind: "parameter" as const, min: 0, max: 5, initial: 1 } }, expressions: { e: "a / 4" } };
    expect(computedFormula(computed("math", "e", 1), new Map([["a", 1]]), moving as never)).toBeNull();
    expect(computedFormula(computed("text", "e", 1), new Map([["a", 1]]), math)).toBeNull();
    expect(computedFormula({ id: "f", type: "math", content: "x = 2" } as never, new Map(), math)).toBeNull();
  });
});
