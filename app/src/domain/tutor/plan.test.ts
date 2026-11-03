import { describe, expect, it } from "vitest";
import { planSequence, TeachingPlan } from "./plan";

const plan = {
  goal: "Comprendre une idée nouvelle", target: "objectif-inédit",
  concepts: [
    { id: "objectif-inédit", label: "Objectif", prerequisites: ["outil"] },
    { id: "hors-parcours", label: "Autre idée", prerequisites: [] },
    { id: "outil", label: "Outil utile", prerequisites: ["base"] },
    { id: "base", label: "Point de départ", prerequisites: [] },
  ],
};

describe("plan de séance construit à la demande", () => {
  it("ordonne les dépendances sans catalogue et sans inclure une notion hors objectif", () => {
    const parsed = TeachingPlan.parse(plan);
    expect(planSequence(parsed).map((c) => c.id)).toEqual(["base", "outil", "objectif-inédit"]);
    expect(planSequence(parsed, "outil").map((c) => c.id)).toEqual(["base", "outil"]);
  });

  it.each([
    { ...plan, target: "absent" },
    { ...plan, concepts: [...plan.concepts, plan.concepts[0]] },
    { ...plan, concepts: [{ id: "objectif-inédit", label: "Objectif", prerequisites: ["absent"] }] },
    { ...plan, concepts: [{ id: "objectif-inédit", label: "Objectif", prerequisites: ["objectif-inédit"] }] },
    { ...plan, concepts: [plan.concepts[0], { id: "outil", label: "Outil", prerequisites: ["objectif-inédit"] }] },
  ])("refuse un graphe incohérent : %j", (invalid) => {
    expect(TeachingPlan.safeParse(invalid).success).toBe(false);
  });

  it("partage un prérequis sans le présenter deux fois et borne le graphe", () => {
    const diamond = TeachingPlan.parse({ goal: "Relier", target: "fin", concepts: [
      { id: "fin", label: "Fin", prerequisites: ["a", "b"] },
      { id: "a", label: "A", prerequisites: ["base"] },
      { id: "b", label: "B", prerequisites: ["base"] },
      { id: "base", label: "Base" },
    ] });
    expect(planSequence(diamond).map((c) => c.id)).toEqual(["base", "a", "b", "fin"]);
    expect(TeachingPlan.safeParse({ ...plan, concepts: Array.from({ length: 17 }, (_, i) => ({ id: `${i}`, label: `${i}` })) }).success).toBe(false);
  });
});
