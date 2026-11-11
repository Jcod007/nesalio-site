import { describe, expect, it } from "vitest";
import type { Box, Point } from "@/domain/nesalio/placement";
import { TableMarks, type MarkHandle } from "./tableMarks";

class FakeMark implements MarkHandle {
  opacity = 1;
  disposed = false;
  constructor(
    public box: Box,
    public color: string,
  ) {}
  shift([x, y]: [number, number, number]) {
    this.box = { x0: this.box.x0 + x, y0: this.box.y0 + y, x1: this.box.x1 + x, y1: this.box.y1 + y };
  }
  dispose() {
    this.disposed = true;
  }
}

function setup() {
  const onBoard = new Set<FakeMark>();
  const marks = new TableMarks<FakeMark>({
    create: (box, color) => new FakeMark(box, color),
    add: (mark) => onBoard.add(mark),
    remove: (mark) => onBoard.delete(mark),
  });
  return { marks, onBoard };
}

// Two cells side by side in the table's own coordinates; outlines sit slightly inside (inset).
const cells = [
  { parts: ["r1c1", "r1", "c1"], box: { x0: 0, y0: 0, x1: 1, y1: 1 } },
  { parts: ["r1c2", "r1", "c2"], box: { x0: 1, y0: 0, x1: 2, y1: 1 } },
];
const at = (x: number, y: number): Point => [x, y];

describe("contour d'une case surlignée", () => {
  it("entoure la case, la ligne entière, et part quand le surlignage finit", () => {
    const { marks, onBoard } = setup();
    marks.update(cells, new Map([["r1c2", "violet"]]), at(10, 0), 1);
    expect([...onBoard][0]!.box.x0).toBeCloseTo(11, 1);
    marks.update(cells, new Map([["r1", "violet"]]), at(10, 0), 1);
    expect(onBoard.size).toBe(1);
    const [row] = [...onBoard];
    // The whole row (two cells), less the inset on each side.
    expect(row!.box.x1 - row!.box.x0).toBeGreaterThan(1.8);
    expect(row!.box.x1 - row!.box.x0).toBeLessThanOrEqual(2);
    marks.update(cells, new Map(), at(10, 0), 1);
    expect(onBoard.size).toBe(0);
    expect(row!.disposed).toBe(true);
  });

  // Review: a move or a dim during a highlight left the outline behind, fully opaque.
  it("suit le tableau qui bouge et prend son opacité à chaque image", () => {
    const { marks, onBoard } = setup();
    marks.update(cells, new Map([["c1", "violet"]]), at(0, 0), 1);
    const [mark] = [...onBoard];
    marks.update(cells, new Map([["c1", "violet"]]), at(3, -2), 0.35);
    expect(onBoard.size).toBe(1);
    expect([...onBoard][0]).toBe(mark);
    expect(mark!.box.x0).toBeCloseTo(3, 1);
    expect(mark!.box.y0).toBeCloseTo(-2, 1);
    expect(mark!.opacity).toBe(0.35);
    marks.update(cells, new Map([["c1", "violet"]]), at(3, -2), 0);
    expect(mark!.opacity).toBe(0);
  });

  it("change de couleur quand le rôle change, et clear retire tout", () => {
    const { marks, onBoard } = setup();
    marks.update(cells, new Map([["r1c1", "violet"]]), at(0, 0), 1);
    marks.update(cells, new Map([["r1c1", "green"]]), at(0, 0), 1);
    expect([...onBoard].map((mark) => mark.color)).toEqual(["green"]);
    marks.update(cells, new Map([["r9c9", "green"]]), at(0, 0), 1);
    expect(onBoard.size).toBe(0);
    marks.update(cells, new Map([["r1c1", "green"]]), at(0, 0), 1);
    marks.clear();
    expect(onBoard.size).toBe(0);
  });
});
