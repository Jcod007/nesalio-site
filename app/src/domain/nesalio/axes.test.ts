import { describe, expect, it } from "vitest";
import { BOARD_LINE_CHARS, axisNumbers, boardLines, measureSceneObject } from "./measurement";

const axes = (x: [number, number], y: [number, number]) => ({ id: "a", type: "axes" as const, params: { x, y } });

describe("nombres sur les axes", () => {
  // Seen in real generations: a parabola on axes with ticks but no numbers, its vertex impossible to read.
  it("chiffre les graduations des deux axes, sans le zéro, en écriture française", () => {
    const numbers = axisNumbers(axes([-4, 4], [-1.5, 2]).params);
    const x = numbers.filter((n) => n.axis === "x").map((n) => n.text);
    const y = numbers.filter((n) => n.axis === "y").map((n) => n.text);
    expect(x).toEqual(["−4", "−3", "−2", "−1", "1", "2", "3", "4"]);
    expect(y).toEqual(["−1,5", "−1", "−0,5", "0,5", "1", "1,5", "2"]);
    // Under the x axis, left of the y axis.
    for (const n of numbers) expect(n.axis === "x" ? n.at[1] : n.at[0]).toBeLessThan(0);
  });

  it("réserve la place des nombres pour que rien ne se pose dessus", () => {
    const measured = measureSceneObject(axes([0, 6], [0, 4]), new Map(), { symbols: {}, expressions: {} });
    // Axes starting at 0: the numbers stand outside the range, the reserved area includes them.
    for (const n of axisNumbers(axes([0, 6], [0, 4]).params)) {
      expect(measured.body.x0).toBeLessThanOrEqual(n.at[0] - 0.1);
      expect(measured.body.y0).toBeLessThanOrEqual(n.at[1] - 0.1);
    }
  });
});

describe("phrases longues au tableau", () => {
  // Audit caméra 2026-11-10 : une phrase de 140 caractères sur une ligne faisait 23 unités ; la caméra reculait.
  it("coupe la prose en lignes d'au plus ~48 caractères, sans toucher aux formules", () => {
    const long = "Les rapports trigonométriques se lisent dans un triangle rectangle ; pour tout autre triangle, on le coupe en deux triangles rectangles.";
    const lines = boardLines(long).split("\n");
    expect(lines.length).toBe(3);
    for (const line of lines) expect(Array.from(line).length).toBeLessThanOrEqual(BOARD_LINE_CHARS + 6);
    expect(lines.join(" ")).toBe(long);
    expect(boardLines("Court.")).toBe("Court.");
    const latex = `Aire $\frac{b h}{2}$ ${"x".repeat(60)}`;
    expect(boardLines(latex)).toBe(latex);
  });

  it("ne commence jamais une ligne par « : », « ; », « ? » ou « ! »", () => {
    const text = "Pour diluer une solution on garde la quantité : la dilution ne change que le volume ; et alors ?";
    for (const line of boardLines(text).split("\n")) expect(line).not.toMatch(/^[:;?!]/);
    const exact = `${"a".repeat(47)} : ${"b".repeat(30)}`;
    expect(boardLines(exact).split("\n")[1]).not.toMatch(/^:/);
  });

  it("ne sépare jamais une donnée de sa valeur (vraie fenêtre : « T » seul, « = 298,15 K » dessous)", () => {
    const text = "n = 0,204 mol    V = 5,0 L    T = 298,15 K (25 °C)";
    for (const line of boardLines(text).split("\n")) {
      expect(line.trim()).not.toMatch(/^[=≈]/);
      expect(line.trim()).not.toMatch(/[=≈]$/);
    }
    expect(boardLines(text).split("\n").some((line) => line.includes("T = 298,15"))).toBe(true);
  });

  it("mesure un texte coupé sur plusieurs lignes, moins large et plus haut", () => {
    const text = { id: "t", type: "text" as const, content: "mot ".repeat(30).trim() };
    const box = measureSceneObject(text, new Map(), { symbols: {}, expressions: {} }).body;
    const one = measureSceneObject({ ...text, content: "mot" }, new Map(), { symbols: {}, expressions: {} }).body;
    expect(box.x1 - box.x0).toBeLessThan(9);
    expect(box.y1 - box.y0).toBeCloseTo(3 * (one.y1 - one.y0), 5);
  });
});
