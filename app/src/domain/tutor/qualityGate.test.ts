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
  it("vérifie les références de destination et les identifiants dupliqués", () => {
    expect(validateStep({ say: "Déplacement.", do: [{ type: "point", id: "A", at: [0, 0] }, { type: "move", target: "A", near: "B", side: "left" }] }, { ids: new Set() }).ok).toBe(false);
    expect(validateStep({ say: "Deux points.", do: [{ type: "point", id: "A", at: [0, 0] }, { type: "point", id: "A", at: [1, 0] }] }, { ids: new Set() }).ok).toBe(false);
  });
  it("suit les groupes, l'effacement et la remise à zéro", () => {
    const state = { ids: new Set(["A", "B"]) };
    const grouped = validateStep({ say: "Groupe.", do: [{ type: "group", id: "G", members: ["A", "B"] }] }, state);
    expect(grouped.ok).toBe(true);
    const moved = validateStep({ say: "G bouge.", do: [{ type: "highlight", target: "G" }] }, grouped.next);
    expect(moved.ok).toBe(true);
    const erased = validateStep({ say: "On efface.", do: [{ type: "erase", target: "G" }] }, moved.next);
    expect(erased.ok).toBe(true);
    expect(validateStep({ say: "G bouge.", do: [{ type: "highlight", target: "G" }] }, erased.next).ok).toBe(false);
    const cleared = validateStep({ say: "Tableau vierge.", do: [{ type: "clear" }] }, grouped.next);
    expect(cleared.next.ids.size).toBe(0);
    expect(validateStep({ say: "G bouge.", do: [{ type: "highlight", target: "G" }] }, cleared.next).ok).toBe(false);
    expect(state.ids.size).toBe(2);
  });
  it("rejette un groupe avec membre inexistant", () => {
    expect(validateStep({ say: "Groupe.", do: [{ type: "group", id: "G", members: ["absent"] }] }, { ids: new Set() }).ok).toBe(false);
  });
  it("valide les références de points et les cibles de matrices", () => {
    const state = { ids: new Set(["A"]) };
    expect(validateStep({ say: "Segment.", do: [{ type: "segment", id: "s", from: "A", to: "B" }] }, state).ok).toBe(false);
    expect(validateStep({ say: "Vecteur.", do: [{ type: "vector", id: "v", from: "B", by: [1, 0] }] }, state).ok).toBe(false);
    expect(validateStep({ say: "Matrice.", do: [{ type: "applyMatrix", matrix: [[1, 0], [0, 1]], targets: ["B"] }] }, state).ok).toBe(false);
    expect(validateStep({ say: "Segment.", do: [{ type: "segment", id: "s", from: "A", to: [1, 2] }] }, state).ok).toBe(true);
  });
  it("conserve les objets des tours précédents", () => {
    expect(validateStep({ say: "A bouge.", do: [{ type: "highlight", target: "A" }] }, { ids: new Set(["A"]) }).ok).toBe(true);
  });
});
