import { describe, expect, it } from "vitest";
import { DEMO_LESSONS } from "@/content/demoLessons";
import { ModelEvent } from "@/domain/scene/schema";
import { applyAction, emptyBoard, MAX_NOTES, pruneErased, summarizeBoard } from "./state";

const t = (start: number) => ({ start, duration: 100 });

describe("applyAction", () => {
  it("dessine, met en évidence puis efface un objet", () => {
    let board = emptyBoard();
    board = applyAction(board, { type: "axes", x: [-1, 5], y: [-3, 4] }, t(0));
    board = applyAction(board, { type: "point", id: "A", at: [2, 3], label: "(2, 3)" }, t(10));
    board = applyAction(board, { type: "highlight", target: "A" }, t(20));
    expect(board.frame.x).toEqual([-1, 5]);
    expect(board.order).toEqual(["A"]);
    expect(board.highlights.A).toBe(20);

    board = applyAction(board, { type: "erase", target: "A" }, t(30));
    expect(board.items.A?.erased).toEqual(t(30));
    expect(pruneErased(board, 100).order).toEqual(["A"]);
    expect(pruneErased(board, 200).order).toEqual([]);
  });

  it("remplace un objet redessiné sans changer l'ordre", () => {
    let board = emptyBoard();
    board = applyAction(board, { type: "point", id: "A", at: [0, 0] }, t(0));
    board = applyAction(board, { type: "point", id: "B", at: [1, 1] }, t(0));
    board = applyAction(board, { type: "point", id: "A", at: [2, 2] }, t(5));
    expect(board.order).toEqual(["A", "B"]);
    expect(board.items.A).toMatchObject({ at: [2, 2] });
  });

  it("ignore les cibles inconnues et limite la colonne de notes", () => {
    let board = emptyBoard();
    board = applyAction(board, { type: "highlight", target: "nope" }, t(0));
    board = applyAction(board, { type: "erase", target: "nope" }, t(0));
    expect(board).toEqual(emptyBoard());
    for (let i = 0; i < MAX_NOTES + 3; i++) board = applyAction(board, { type: "note", text: `ligne ${i}` }, t(i));
    expect(board.notes).toHaveLength(MAX_NOTES);
  });

  it("résume le tableau pour le modèle", () => {
    let board = emptyBoard();
    board = applyAction(board, { type: "axes", x: [-1, 5], y: [-3, 4] }, t(0));
    board = applyAction(board, { type: "curve", id: "f", fn: "x^2" }, t(0));
    board = applyAction(board, { type: "note", id: "n1", text: "x = 2 ± √3" }, t(0));
    expect(summarizeBoard(board)).toEqual([
      { id: "axes", type: "axes", detail: "x de -1 à 5, y de -3 à 4" },
      { id: "f", type: "curve", detail: "y = x^2" },
      { id: "n1", type: "note", detail: "x = 2 ± √3" },
    ]);
  });
});

describe("séances de démonstration", () => {
  it("respectent le langage de scène et ne ciblent que des objets existants", () => {
    for (const lesson of DEMO_LESSONS) {
      const events = [lesson.header, ...lesson.steps.map((s) => ({ kind: "step", ...s })), lesson.end];
      for (const event of events) expect(ModelEvent.safeParse(event).success).toBe(true);

      let board = emptyBoard();
      for (const step of lesson.steps) {
        for (const action of step.do) {
          if (action.type === "highlight" || action.type === "erase") {
            const known = action.target in board.items || board.notes.some((n) => n.id === action.target);
            expect(known, `${lesson.header.title} : ${action.type} ${action.target}`).toBe(true);
          }
          board = applyAction(board, action, t(0));
        }
      }
    }
  });
});
