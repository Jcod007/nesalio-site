import { describe, expect, it } from "vitest";
import { emptyBoard, resolveTargets, type BoardState, type PointNode, type SegmentNode } from "@/domain/board/state";
import { applyAction } from "./index";

const t = { start: 0, duration: 1000 };
const at = (board: BoardState, id: string) => {
  const p = board.nodes[id] as PointNode;
  return [p.at[0] + p.offset[0], p.at[1] + p.offset[1]];
};
const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6));
const triangle = () => applyAction(emptyBoard(), { type: "triangle", id: "tri", points: [[0, 0], [6, 0], [2, 4]] }, t);
const direction = (s: SegmentNode) => {
  const d = [s.to[0] - s.from[0], s.to[1] - s.from[1]];
  const n = Math.hypot(d[0]!, d[1]!);
  return [d[0]! / n, d[1]! / n];
};

describe("constructions géométriques", () => {
  it("construit le milieu, un point de partage et un pied, visés ensuite par leur nom", () => {
    let board = triangle();
    board = applyAction(board, { type: "construct", id: "M", kind: "midpoint", of: ["A", "C"], marks: true }, t);
    close(at(board, "M"), [1, 2]);
    expect(resolveTargets(board, "M")).toEqual(["M"]);
    board = applyAction(board, { type: "construct", id: "P", kind: "divide", of: ["A", "B"], ratio: "2:1" }, t);
    close(at(board, "P"), [4, 0]);
    board = applyAction(board, { type: "construct", id: "H", kind: "foot", through: "C", of: ["A", "B"] }, t);
    close(at(board, "H"), [2, 0]);
    board = applyAction(board, { type: "segment", id: "s", from: "M", to: "H" }, t);
    close([...(board.nodes["s"] as SegmentNode).from, ...(board.nodes["s"] as SegmentNode).to], [1, 2, 2, 0]);
  });

  it("trace parallèle et perpendiculaire passant par un point, et leur intersection", () => {
    let board = triangle();
    board = applyAction(board, { type: "construct", id: "d", kind: "parallel", through: "C", of: ["A", "B"] }, t);
    close(direction(board.nodes["d"] as SegmentNode).map(Math.abs), [1, 0]);
    board = applyAction(board, { type: "construct", id: "p", kind: "perpendicular", through: "B", of: ["A", "B"] }, t);
    close(direction(board.nodes["p"] as SegmentNode).map(Math.abs), [0, 1]);
    board = applyAction(board, { type: "construct", id: "X", kind: "intersection", of: ["d", "p"] }, t);
    close(at(board, "X"), [6, 4]);
  });

  it("trace la médiatrice, la bissectrice et la médiane exactes", () => {
    let board = applyAction(emptyBoard(), { type: "triangle", id: "tri", points: [[0, 0], [4, 0], [0, 3]] }, t);
    board = applyAction(board, { type: "construct", id: "med", kind: "perpBisector", of: ["A", "B"] }, t);
    const m = board.nodes["med-droite"] as SegmentNode;
    expect(m.from[0]).toBeCloseTo(2, 9);
    expect(m.to[0]).toBeCloseTo(2, 9);
    // Bissectrice de l'angle en A (droit) : elle coupe [BC] en D, avec BD/DC = AB/AC = 4/3.
    board = applyAction(board, { type: "construct", id: "bis", kind: "angleBisector", through: "A", of: ["B", "C"] }, t);
    close(at(board, "bis-pied"), [4 - (4 / 7) * 4, (4 / 7) * 3]);
    board = applyAction(board, { type: "construct", id: "mc", kind: "median", through: "C", of: ["A", "B"] }, t);
    close(at(board, "mc-milieu"), [2, 0]);
    // Une construction sert de droite pour une autre.
    board = applyAction(board, { type: "construct", id: "Y", kind: "intersection", of: ["med", "mc"] }, t);
    close(at(board, "Y"), [2, 0]);
  });
});

describe("objets visés par des points nommés", () => {
  it("polygone, vecteur, cercle et pivot de rotation par leurs noms", () => {
    let board = applyAction(emptyBoard(), { type: "triangle", id: "tri", base: 4, height: 3, at: [0, 0], altitude: "B" }, t);
    board = applyAction(board, { type: "polygon", id: "petit", points: ["A", "B", "H"], fill: true }, t);
    const poly = board.nodes["petit"] as { points: number[][] };
    close(poly.points.flat(), [0, 0, 4, 0, 2.56, 1.92]);
    board = applyAction(board, { type: "vector", id: "v", from: "C", to: "A" }, t);
    close([...(board.nodes["v"] as SegmentNode).from, ...(board.nodes["v"] as SegmentNode).to], [4, 3, 0, 0]);
    board = applyAction(board, { type: "circle", id: "c", center: "H", radius: 1 }, t);
    close((board.nodes["c"] as { center: number[] }).center, [2.56, 1.92]);
    board = applyAction(board, { type: "rotate", target: "petit", about: "A", angle: 90 }, t);
    expect(board.nodes["petit"]!.spins?.[0]?.about).toEqual([0, 0]);
  });
});
