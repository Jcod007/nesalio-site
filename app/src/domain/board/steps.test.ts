import { describe, expect, it } from "vitest";
import { sampleCurve } from "./geometry";
import { emptyBoard, resolveTargets, summarizeBoard, type PointNode, type SegmentNode } from "./state";
import { stepRule, stepsOf, stepValue } from "./steps";
import { applyAction } from "@/domain/scene/commands";
import { Action } from "@/domain/scene/commands";

const t = { start: 0, duration: 1000 };

describe("partie entière : marches exactes", () => {
  it("f(x) = [x] : marches de longueur 1, point plein à gauche, point vide à droite", () => {
    const steps = stepsOf({ a: 1, b: 1, h: 0, k: 0 }, -2, 2);
    // La marche y = 2 commence à x = 2, la borne : rien à tracer.
    expect(steps.map((s) => s.y)).toEqual([-2, -1, 0, 1]);
    const zero = steps.find((s) => s.y === 0)!;
    expect(zero.from).toEqual([0, 0]);
    expect(zero.to).toEqual([1, 0]);
    expect(zero.closed).toEqual([0, 0]);
    expect(zero.open).toEqual([1, 0]);
  });

  it("b < 0 : le point plein passe à droite (f(x) = [−x])", () => {
    const steps = stepsOf({ a: 1, b: -1, h: 0, k: 0 }, -2, 2);
    const zero = steps.find((s) => s.y === 0)!;
    // [−x] = 0 pour −1 < x ≤ 0 : x = 0 atteint, x = −1 exclu.
    expect(zero.closed).toEqual([0, 0]);
    expect(zero.open).toEqual([-1, 0]);
    expect(stepValue({ a: 1, b: -1, h: 0, k: 0 }, 0)).toBe(0);
    expect(stepValue({ a: 1, b: -1, h: 0, k: 0 }, -1)).toBe(1);
  });

  it("f(x) = 2[3(x − 1)] + 4 : marches de 1/3, sauts de 2, la valeur à x = h vaut k", () => {
    const p = { a: 2, b: 3, h: 1, k: 4 };
    const steps = stepsOf(p, 0, 2);
    for (const s of steps) {
      if (s.closed && s.open) expect(Math.abs(s.open[0] - s.closed[0])).toBeCloseTo(1 / 3, 9);
    }
    const ys = steps.map((s) => s.y);
    for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBe(2);
    expect(stepValue(p, 1)).toBe(4);
    expect(stepValue(p, 1 + 1 / 3)).toBe(6); // arrondis : 3 × (1/3) = 1 exactement
  });

  it("la règle s'écrit comme en classe", () => {
    expect(stepRule({ a: 1, b: 1, h: 0, k: 0 })).toBe("f(x) = [x]");
    expect(stepRule({ a: 2, b: 3, h: 1, k: 4 })).toBe("f(x) = 2[3(x − 1)] + 4");
    expect(stepRule({ a: -1, b: 0.5, h: -2, k: -3 }, "g")).toBe("g(x) = −[0,5(x + 2)] − 3");
    expect(stepRule({ a: 3, b: -1, h: 0, k: 0 })).toBe("f(x) = 3[−x]");
  });
});

describe("commande stepFunction", () => {
  it("dessine marches, points pleins et points vides, avec le repère s'il manque", () => {
    const board = applyAction(emptyBoard(), { type: "stepFunction", id: "f", a: 1, b: 1, h: 0, k: 0, from: -2, to: 2, rule: true }, t);
    expect(board.axes).not.toBeNull();
    const parts = resolveTargets(board, "f");
    const marches = parts.filter((p) => p.startsWith("f-m")).map((p) => board.nodes[p] as SegmentNode);
    const vides = parts.filter((p) => p.startsWith("f-v")).map((p) => board.nodes[p] as PointNode);
    const pleins = parts.filter((p) => p.startsWith("f-p")).map((p) => board.nodes[p] as PointNode);
    expect(marches.length).toBe(4);
    expect(marches.every((m) => m.from[1] === m.to[1])).toBe(true); // aucune marche verticale
    expect(vides.every((v) => v.open)).toBe(true);
    expect(pleins.every((p) => !p.open)).toBe(true);
    expect(marches.at(-1)!.label).toBe("f(x) = [x]");
    // Le modèle retrouve la règle dans le résumé du tableau.
    expect(summarizeBoard(board).find((i) => i.id === "f")?.detail).toContain("escalier f(x) = [x]");
    expect(summarizeBoard(board).some((i) => i.detail.includes("(point vide)"))).toBe(true);
  });

  it("redemandé avec un autre k : les marches montent (même nombre de parties, elles se transforment)", () => {
    const first = applyAction(emptyBoard(), { type: "stepFunction", id: "f", from: -2, to: 2 }, t);
    const before = first.nodes["f-m1"] as SegmentNode;
    const second = applyAction(first, { type: "stepFunction", id: "f", k: 1, from: -2, to: 2 }, { start: 2000, duration: 1000 });
    const after = second.nodes["f-m1"] as SegmentNode;
    expect(after.from[1]).toBe(before.from[1] + 1);
    expect(after.morph).toBeDefined();
  });

  it("la règle déjà écrite reste au tableau et suit le nouveau paramètre", () => {
    const first = applyAction(emptyBoard(), { type: "stepFunction", id: "f", from: -2, to: 2, rule: true }, t);
    const second = applyAction(first, { type: "stepFunction", id: "f", k: 1, from: -2, to: 2 }, { start: 2000, duration: 1000 });
    const labels = resolveTargets(second, "f").map((id) => (second.nodes[id] as SegmentNode).label).filter(Boolean);
    expect(labels).toEqual(["f(x) = [x] + 1"]);
  });

  it("redemandé avec moins de marches : les marches en trop s'effacent", () => {
    const first = applyAction(emptyBoard(), { type: "stepFunction", id: "f", b: 2, from: -2, to: 2 }, t);
    const second = applyAction(first, { type: "stepFunction", id: "f", b: 1, from: -2, to: 2 }, { start: 2000, duration: 1000 });
    expect(second.nodes["f-m8"]?.erased).toBeDefined();
    expect(resolveTargets(second, "f").some((id) => id === "f-m8")).toBe(false);
  });

  it("refuse un escalier illisible et b = 0 ; accepte les noms que les modèles emploient", () => {
    expect(Action.safeParse({ type: "stepFunction", id: "f", b: 50, from: -5, to: 5 }).success).toBe(false);
    expect(Action.safeParse({ type: "stepFunction", id: "f", b: 0 }).success).toBe(false);
    expect(Action.safeParse({ type: "stepFunction", id: "f", a: -2, b: 0.5, h: 1, k: 3, from: -4, to: 6 }).success).toBe(true);
  });
});

describe("courbe avec un saut", () => {
  it("floor(x) est coupée à chaque saut au lieu d'être reliée par des traits verticaux", () => {
    const pieces = sampleCurve("floor(x)", { x: [-3, 3], y: [-4, 4] }, -3, 3);
    expect(pieces.length).toBe(6);
    for (const piece of pieces) {
      const ys = piece.map((p) => p[1]);
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1e-6);
    }
  });

  it("une courbe raide mais continue reste d'un seul tenant", () => {
    expect(sampleCurve("10*x^3", { x: [-1, 1], y: [-10, 10] }).length).toBe(1);
    expect(sampleCurve("abs(x)", { x: [-3, 3], y: [-1, 4] }).length).toBe(1);
  });
});
