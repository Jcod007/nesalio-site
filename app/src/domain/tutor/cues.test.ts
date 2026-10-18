import { describe, expect, it } from "vitest";
import { planStep } from "@/domain/timeline/plan";
import { extractCues } from "./cues";

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
});
