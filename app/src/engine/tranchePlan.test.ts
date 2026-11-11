import { describe, expect, it } from "vitest";
import { Slice } from "@/domain/nesalio/contract";
import { createScene, introduceSlice } from "@/domain/nesalio/sceneState";
import { planTranche } from "./tranchePlan";

const viewport = { x0: -8, y0: -4.5, x1: 8, y1: 4.5 };
const beat = (id: string, todo: unknown[]) => ({ id, say: "Voici la suite.", cues: [], do: todo });

function planned(introduces: unknown[], beats: unknown[]) {
  const slice = Slice.parse({ slice_id: "s", introduces, beats });
  const scene = introduceSlice(createScene(viewport), slice);
  return planTranche(scene, slice, 0.9, 1);
}

describe("cadrage planifié sur toute la tranche", () => {
  it("garde la caméra immobile quand tout ce que la tranche montre tient dans la vue de départ", () => {
    const plan = planned(
      [
        { id: "a", type: "math", content: "x = 2" },
        { id: "b", type: "math", content: "y = 3", layout: { next_to: "a", direction: "down" } },
      ],
      [beat("b1", [{ id: "w1", verb: "write", target: "a", at: "beat:start" }]), beat("b2", [{ id: "w2", verb: "write", target: "b", at: "beat:start" }])],
    );
    expect([...plan.values()]).toEqual(["hold", "hold"]);
  });

  it("bouge une fois pour toute la colonne plutôt qu'à chaque ligne qui sort du cadre", () => {
    const steps = Array.from({ length: 6 }, (_, i) => ({
      id: `e${i}`,
      type: "text",
      content: `Étape numéro ${i} du calcul`,
      size: "large",
      ...(i ? { layout: { next_to: `e${i - 1}`, direction: "down", gap: "lg" } } : {}),
    }));
    const plan = planned(
      steps,
      steps.map(({ id }, i) => beat(`b${i}`, [{ id: `w${i}`, verb: "write", target: id, at: "beat:start" }])),
    );
    const moves = [...plan.values()].filter((framing) => framing !== "hold");
    expect(moves.length).toBeLessThanOrEqual(2);
    expect(moves.length).toBeGreaterThan(0);
  });

  it("laisse la leçon décider à partir d'un passage qui bouge la caméra elle-même", () => {
    const plan = planned(
      [
        { id: "a", type: "math", content: "x = 2" },
        { id: "b", type: "math", content: "y = 3", layout: { next_to: "a", direction: "right" } },
      ],
      [
        beat("b1", [{ id: "w1", verb: "write", target: "a", at: "beat:start" }]),
        beat("b2", [
          { id: "c", verb: "camera.focus", targets: ["a"], at: "beat:start" },
          { id: "w2", verb: "write", target: "b", at: "beat:start" },
        ]),
      ],
    );
    expect(plan.has("b1")).toBe(true);
    expect(plan.has("b2")).toBe(false);
  });
});
