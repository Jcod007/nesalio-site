import { describe, expect, it } from "vitest";
import { planStep } from "@/domain/timeline/plan";
import { extractCues, inferCues } from "./cues";

describe("repères de synchronisation", () => {
  it("retire les repères du texte dit et garde leur position dans la phrase", () => {
    const { say, cues } = extractCues("Le sommet {S} est en haut, et la courbe {f} descend.");
    expect(say).toBe("Le sommet est en haut, et la courbe descend.");
    expect(cues.S).toBeCloseTo("Le sommet".length / say.length);
    expect(cues.f!).toBeGreaterThan(cues.S!);
  });

  it("laisse une phrase sans repère intacte", () => {
    expect(extractCues("Bonjour, x au carré.")).toEqual({ say: "Bonjour, x au carré.", cues: {} });
  });

  it("fait apparaître chaque objet repéré quand Nesa en parle, pas au début de la phrase", () => {
    const plan = planStep(
      [
        { type: "axes", x: [-1, 5], y: [-3, 4] },
        { type: "point", id: "S", at: [2, 3] },
        { type: "curve", id: "f", fn: "x^2" },
      ],
      8000,
      { S: 0.5, f: 0.75 },
    );
    const [axes, point, curve] = plan.actions;
    expect(axes!.offset).toBe(0);
    expect(point!.offset).toBe(4000 - 150);
    expect(curve!.offset).toBe(6000 - 150);
  });

  it("déduit le moment d'apparition des mots de la phrase quand le modèle n'a pas mis de repère", () => {
    const say = "Place le point A, puis trace la courbe : la montée vaut 3.";
    const cues = inferCues(say, [
      { type: "point", id: "A" },
      { type: "curve", id: "g" },
      { type: "note", id: "n1", text: "montée = 3" },
      { type: "axes" },
    ]);
    expect(cues.A).toBeCloseTo(say.indexOf("A,") / say.length);
    expect(cues.g).toBeCloseTo(say.indexOf("courbe") / say.length);
    expect(cues.n1).toBeCloseTo(say.indexOf("montée") / say.length);
  });

  it("garde la priorité aux repères écrits par le modèle et ne confond pas « a » et « A »", () => {
    const cues = inferCues("Le a est négatif, et A est ici.", [{ type: "point", id: "A" }], {});
    expect(cues.A).toBeCloseTo("Le a est négatif, et ".length / "Le a est négatif, et A est ici.".length);
    expect(inferCues("Le point A.", [{ type: "point", id: "A" }], { A: 0.9 }).A).toBe(0.9);
  });

  it("un objet sans repère vient avec l'objet qui le précède, jamais avant lui", () => {
    const plan = planStep(
      [
        { type: "point", id: "P", at: [0.87, 0.5] },
        { type: "segment", id: "r", from: [0, 0], to: [0.87, 0.5] },
      ],
      6000,
      { P: 0.95 },
    );
    const [point, radius] = plan.actions;
    expect(radius!.offset).toBeGreaterThanOrEqual(point!.offset);
  });
});
