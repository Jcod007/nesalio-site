import { describe, expect, it } from "vitest";
import { axisNumbers, measureSceneObject } from "./measurement";

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
