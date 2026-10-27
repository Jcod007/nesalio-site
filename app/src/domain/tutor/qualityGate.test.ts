import { describe, expect, it } from "vitest";
import { arithmeticError, validateStep } from "./qualityGate";

describe("quality gate", () => {
  it("accepte les calculs élémentaires corrects et rejette les faux", () => {
    expect(arithmeticError("On calcule : 3 × 4 = 12.")).toBeUndefined();
    expect(arithmeticError("On calcule : 3 × 4 = 13.")).toBeDefined();
    expect(arithmeticError("4 ÷ 0 = 0")).toBeDefined();
    expect(arithmeticError("x + 3 = 5")).toBeUndefined();
  });
  it("refuse les cibles inexistantes sans modifier l'état", () => {
    const initial = { ids: new Set<string>() };
    const result = validateStep({ say: "Déplaçons A.", do: [{ type: "move", target: "A", by: [1, 0] }] }, initial);
    expect(result.ok).toBe(false);
    expect(initial.ids.size).toBe(0);
  });
  it("accepte une cible créée plus tôt dans la même étape", () => {
    const result = validateStep({ say: "Voici A.", do: [
      { type: "point", id: "A", at: [0, 0] },
      { type: "highlight", target: "A" },
    ] }, { ids: new Set() });
    expect(result.ok).toBe(true);
    expect(result.next.ids.has("A")).toBe(true);
  });
  it("détecte les erreurs arithmétiques sans confondre les variables", () => {
    expect(arithmeticError("7 - 2 = 4")).toBeDefined();
    expect(arithmeticError("1.5 + 2.5 = 4")).toBeUndefined();
    expect(arithmeticError("2 × 3 = 6")).toBeUndefined();
  });
  it("conserve les objets des tours précédents", () => {
    expect(validateStep({ say: "A bouge.", do: [{ type: "highlight", target: "A" }] }, { ids: new Set(["A"]) }).ok).toBe(true);
  });
});
