import { describe, expect, it } from "vitest";
import { LearningState, emptyLearning, recordObservation, recordPresentation } from "./learning";

describe("observations par notion", () => {
  it("sépare une présentation d'une preuve d'apprentissage, sans changer l'état initial", () => {
    const initial = emptyLearning();
    const next = recordPresentation(initial, { concept: "thales.configuration", role: "worked-example", completes: true });
    expect(initial.concepts).toEqual([]);
    expect(next.concepts[0]).toEqual({ id: "thales.configuration", presented: ["worked-example"], observations: [] });
    expect(recordPresentation(next, { concept: "thales.configuration", role: "worked-example", completes: true })).toEqual(next);
  });

  it("ne compte pas une question comme une explication ou un exemple", () => {
    const initial = emptyLearning();
    expect(recordPresentation(initial, { concept: "fractions.parts", role: "guided-practice" })).toBe(initial);
  });

  it("ne compte pas le début d'un exemple comme sa résolution complète", () => {
    const initial = emptyLearning();
    expect(recordPresentation(initial, { concept: "thales.ratios", role: "worked-example", completes: false })).toBe(initial);
  });

  it("garde le format et l'aide des réponses ; un QCM correct ne crée aucun statut de maîtrise", () => {
    const next = recordObservation(emptyLearning(), "fractions.parts", { task: "Que représente le 4 ?", outcome: "correct", format: "choice", support: "guided" });
    expect(next.concepts[0]).toEqual({ id: "fractions.parts", presented: [], observations: [{ task: "Que représente le 4 ?", outcome: "correct", format: "choice", support: "guided" }] });
    expect(LearningState.safeParse(next).success).toBe(true);
  });

  it("borne la mémoire sans mélanger les notions", () => {
    let state = emptyLearning();
    for (let c = 0; c < 20; c++) for (let i = 0; i < 10; i++) state = recordObservation(state, `notion-${c}`, { task: `${i}`, outcome: "ungraded", format: "free", support: "independent" });
    expect(state.concepts).toHaveLength(16);
    expect(state.concepts[0]?.id).toBe("notion-4");
    expect(state.concepts.every((c) => c.observations.length === 8)).toBe(true);
  });
});
