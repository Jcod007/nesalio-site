import { describe, expect, it } from "vitest";
import type { Step } from "@/domain/scene/schema";
import { stepVisual, talkShow } from "./talkShow";

describe("parle-t-elle plus qu'elle ne montre ?", () => {
  it("classe chaque phrase selon ce que fait le tableau", () => {
    expect(stepVisual({ say: "Voici la courbe.", do: [{ type: "curve", id: "f", fn: "x^2" }] })).toBe("montre");
    expect(stepVisual({ say: "Elle glisse.", do: [{ type: "move", target: "f", by: [1, 0] }] })).toBe("montre");
    expect(stepVisual({ say: "On écrit.", do: [{ type: "note", text: "x = 2" }] })).toBe("ecrit");
    expect(stepVisual({ say: "On simplifie.", do: [{ type: "transform", target: "n1", text: "x = 3" }] })).toBe("ecrit");
    expect(stepVisual({ say: "Regarde.", do: [{ type: "highlight", target: "f" }] })).toBe("souligne");
    expect(stepVisual({ say: "Bonne question.", do: [] })).toBe("rien");
  });

  it("mesure la part de parole avec quelque chose de nouveau à voir, et le plus long passage sans rien voir", () => {
    const steps: Step[] = [
      { say: "Imagine un son qui monte et qui descend avec le temps.", do: [] },
      { say: "Il est fait de deux ondes simples additionnées.", do: [] },
      { say: "Voici la première onde.", do: [{ type: "curve", id: "a", fn: "sin(x)" }] },
      { say: "Regarde bien sa forme.", do: [{ type: "highlight", target: "a" }] },
    ];
    const report = talkShow(steps);
    expect(report.shownShare).toBeGreaterThan(0);
    expect(report.shownShare).toBeLessThan(0.4);
    expect(report.untilFirstVisualMs).toBe(report.byVisual.rien);
    expect(report.longestBlindMs).toBe(report.byVisual.rien);
  });
});
