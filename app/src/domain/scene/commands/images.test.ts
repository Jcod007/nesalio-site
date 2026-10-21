import { describe, expect, it } from "vitest";
import { emptyBoard, resolveTargets, type SegmentNode, type TextNode } from "@/domain/board/state";
import { applyAction } from "./index";

const t = { start: 0, duration: 1000 };
const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6));
const ends = (s: SegmentNode) => [...s.from, ...s.to];
const triangle = () => applyAction(emptyBoard(), { type: "triangle", id: "tri", points: [[1, 0], [3, 0], [1, 2]], names: ["A", "B", "C"] }, t);

describe("transformations géométriques", () => {
  it("réflexion par rapport à une droite : image A'B'C', traits perpendiculaires à l'axe", () => {
    let board = triangle();
    board = applyAction(board, { type: "image", id: "img", target: "tri", kind: "reflection", axis: [[0, -1], [0, 1]] }, t);
    close(ends(board.nodes["img-tri-ab"] as SegmentNode), [-1, 0, -3, 0]);
    expect((board.nodes["img-tri-A"] as TextNode).text).toBe("A'");
    expect(resolveTargets(board, "img-traces").length).toBe(3);
    // Les sommets de l'image se visent par leur nom prime.
    board = applyAction(board, { type: "segment", id: "s", from: "A", to: "A'" }, t);
    close(ends(board.nodes["s"] as SegmentNode), [1, 0, -1, 0]);
  });

  it("homothétie de centre et de rapport donnés : figure semblable, rayons depuis le centre", () => {
    let board = triangle();
    board = applyAction(board, { type: "construct", id: "O", kind: "divide", of: [[0, 0], [1, 0]], ratio: 0 }, t);
    board = applyAction(board, { type: "image", id: "h", target: "tri", kind: "homothety", center: "O", ratio: 2 }, t);
    close(ends(board.nodes["h-tri-ab"] as SegmentNode), [2, 0, 6, 0]);
    close(ends(board.nodes["h-trace-3"] as SegmentNode), [0, 0, 2, 4]);
  });

  it("translation par un vecteur du tableau, et rotation autour d'un sommet", () => {
    let board = triangle();
    board = applyAction(board, { type: "vector", id: "u", from: [0, 0], by: [2, 1] }, t);
    board = applyAction(board, { type: "image", id: "tr", target: "tri", kind: "translation", by: "u" }, t);
    close(ends(board.nodes["tr-tri-ca"] as SegmentNode), [3, 3, 3, 1]);
    board = applyAction(board, { type: "image", id: "ro", target: "tri", kind: "rotation", center: "A", angle: 90 }, t);
    close(ends(board.nodes["ro-tri-ab"] as SegmentNode), [1, 0, 1, 2]);
  });
});
