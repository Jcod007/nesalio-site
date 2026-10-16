import { describe, expect, it } from "vitest";
import type { Action } from "@/domain/scene/schema";
import { estimateSpeechMs, planStep } from "./plan";

describe("planStep", () => {
  const actions: Action[] = [
    { type: "axes", x: [-1, 5], y: [-3, 4] },
    { type: "curve", id: "f", fn: "x^2" },
    { type: "point", id: "A", at: [1, 1] },
  ];

  it("étale les tracés sur la durée de la phrase", () => {
    const plan = planStep(actions, 6000);
    const offsets = plan.actions.map((a) => a.offset);
    expect(offsets[0]).toBe(0);
    expect(offsets[2]).toBeCloseTo(6000 * 0.8, -1);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
  });

  it("enchaîne naturellement quand la phrase est courte", () => {
    const plan = planStep(actions, 500);
    expect(plan.actions.map((a) => a.offset)).toEqual([0, 540, 1560]);
    expect(plan.drawingMs).toBe(540 + 1700);
  });

  it("ne réserve pas de créneau aux commandes instantanées", () => {
    const plan = planStep(
      [
        { type: "highlight", target: "A" },
        { type: "point", id: "B", at: [0, 0] },
      ],
      0,
    );
    expect(plan.actions.map((a) => a.offset)).toEqual([0, 0]);
  });

  it("gère une étape sans dessin", () => {
    expect(planStep([], 3000)).toEqual({ actions: [], drawingMs: 0 });
  });
});

describe("estimateSpeechMs", () => {
  it("croît avec la longueur de la phrase", () => {
    expect(estimateSpeechMs("Bonjour.")).toBeLessThan(estimateSpeechMs("Bonjour, on va regarder la pente de cette courbe ensemble."));
  });
});
