import { describe, expect, it } from "vitest";
import { formatNumber, niceStep, sampleCurve, ticks } from "./geometry";

describe("sampleCurve", () => {
  it("coupe la courbe aux asymptotes", () => {
    const pieces = sampleCurve("1/x", { x: [-4, 4], y: [-4, 4] });
    expect(pieces.length).toBe(2);
    for (const piece of pieces) for (const [, y] of piece) expect(Math.abs(y)).toBeLessThanOrEqual(4.5);
  });

  it("respecte les bornes from/to et refuse une expression invalide", () => {
    const [piece] = sampleCurve("x^2", { x: [-1, 3], y: [-1, 5] }, 0, 2);
    expect(piece![0]![0]).toBe(0);
    expect(piece!.at(-1)![0]).toBe(2);
    expect(sampleCurve("nope(", { x: [0, 1], y: [0, 1] })).toEqual([]);
  });
});

describe("graduations", () => {
  it("choisit des pas ronds sans le zéro", () => {
    expect(niceStep(10)).toBe(1);
    expect(niceStep(46)).toBe(5);
    expect(ticks([-1, 5])).toEqual([-1, 1, 2, 3, 4, 5]);
    expect(ticks([-2, 44])).toEqual([5, 10, 15, 20, 25, 30, 35, 40]);
    expect(formatNumber(0.5)).toBe("0,5");
  });
});
