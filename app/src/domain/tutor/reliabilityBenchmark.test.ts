/**
 * Banc de fiabilité reproductible (sans API IA) : cas normaux et défaillants.
 * Ce banc mesure la couverture des garde-fous, pas l'exactitude d'un LLM réel.
 */
import { describe, expect, it } from "vitest";
import { createModelOutputParser } from "./modelOutput";
import { validateStep } from "./qualityGate";
import type { Step } from "@/domain/scene/schema";

const cases: { name: string; step: Step; valid: boolean }[] = [
  { name: "addition juste", step: { say: "2 + 3 = 5", do: [] }, valid: true },
  { name: "addition fausse", step: { say: "2 + 3 = 6", do: [] }, valid: false },
  { name: "soustraction juste", step: { say: "9 - 4 = 5", do: [] }, valid: true },
  { name: "soustraction fausse", step: { say: "9 - 4 = 4", do: [] }, valid: false },
  { name: "produit juste", step: { say: "3 × 7 = 21", do: [] }, valid: true },
  { name: "produit faux", step: { say: "3 × 7 = 22", do: [] }, valid: false },
  { name: "division juste", step: { say: "12 ÷ 4 = 3", do: [] }, valid: true },
  { name: "division fausse", step: { say: "12 ÷ 4 = 2", do: [] }, valid: false },
  { name: "création point", step: { say: "Voici A", do: [{ type: "point", id: "A", at: [0, 0] }] }, valid: true },
  { name: "cible manquante", step: { say: "Voici A", do: [{ type: "highlight", target: "A" }] }, valid: false },
  { name: "énoncé symbolique", step: { say: "x + 2 = 5", do: [] }, valid: true },
  { name: "texte neutre", step: { say: "On commence par observer.", do: [] }, valid: true },
];

describe("reliability benchmark (déterministe)", () => {
  it("classe tous les scénarios de référence sans faux rejet", () => {
    const results = cases.map(({ step, valid, name }) => ({
      name, expected: valid, actual: validateStep(step, { ids: new Set() }).ok,
    }));
    const correct = results.filter((r) => r.expected === r.actual).length;
    expect(correct).toBe(cases.length);
    expect(results.filter((r) => !r.expected).length).toBe(5);
  });
  it("compte les rejets du parseur sans perdre les étapes valides", () => {
    const parser = createModelOutputParser();
    const bad = parser.parseLine(JSON.stringify({ kind: "step", say: "Une figure", do: [{ type: "teleport" }] }));
    const good = parser.parseLine(JSON.stringify({ kind: "step", say: "Une figure", do: [{ type: "point", id: "P", at: [1, 2] }] }));
    expect(bad).toBeNull();
    expect(good?.kind).toBe("step");
    expect(parser.metrics).toMatchObject({ acceptedSteps: 1, rejectedSteps: 1, rejectedActions: 1 });
  });
});
