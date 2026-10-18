import { describe, expect, it } from "vitest";
import { emptyBoard } from "@/domain/board/state";
import { applyAction } from "@/domain/scene/commands";
import type { Step } from "@/domain/scene/schema";
import { reviewNotes, reviewTurn } from "./turnReview";

const board = () => {
  let b = emptyBoard();
  b = applyAction(b, { type: "axes", x: [0, 6.3], y: [-2, 2] }, { start: 0, duration: 0 });
  return applyAction(b, { type: "curve", id: "p", fn: "sin(x)*sin(5*x)" }, { start: 0, duration: 0 });
};

describe("relecture d'un tour", () => {
  it("repère une action annoncée sans être montrée, et un objet absent", () => {
    const steps: Step[] = [
      { say: "Voici le produit des deux ondes.", do: [] },
      { say: "Les bosses positives et négatives s'annulent.", do: [{ type: "highlight", target: "n2" }] },
      { say: "Donc la moyenne est nulle.", do: [] },
    ];
    const review = reviewTurn(steps, board());
    expect(review.gestures).toBe(0);
    expect(review.missingTargets).toEqual(["n2"]);
    const notes = reviewNotes(review);
    expect(notes.some((n) => n.includes("Aucun objet n'a bougé"))).toBe(true);
    expect(notes.some((n) => n.includes("n2"))).toBe(true);
  });

  it("ne reproche rien quand le geste est fait, ou commenté juste après", () => {
    const steps: Step[] = [
      { say: "Les bosses vertes et orange s'annulent.", do: [{ type: "area", id: "A", of: "p", from: 0, to: 6.28 }] },
      { say: "Tu vois : elles s'annulent exactement.", do: [] },
      { say: "Le vecteur glisse au bout de l'autre.", do: [{ type: "move", target: "p", by: [1, 0] }] },
    ];
    const review = reviewTurn(steps, board());
    expect(review.unshown).toEqual([]);
    expect(review.gestures).toBe(1);
    expect(reviewNotes(review)).toEqual([]);
  });
});
