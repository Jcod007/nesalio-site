import { describe, expect, it } from "vitest";
import { emptyBoard, type ArcNode, type PointNode, type PolygonNode, type SegmentNode, type VectorNode } from "@/domain/board/state";
import { applyAction } from "./index";

const t = { start: 0, duration: 1000 };
const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6));

describe("vecteurs, cercle trigonométrique, coniques", () => {
  it("somme de vecteurs (Chasles et parallélogramme), produit par un scalaire, composantes", () => {
    let board = applyAction(emptyBoard(), { type: "axes", x: [-1, 8], y: [-1, 6] }, t);
    board = applyAction(board, { type: "vector", id: "u", from: [0, 0], by: [3, 1], label: "u" }, t);
    board = applyAction(board, { type: "vector", id: "v", from: [1, 3], by: [1, 2], label: "v" }, t);
    board = applyAction(board, { type: "vectorOp", id: "s", kind: "sum", of: ["u", "v"] }, t);
    close([...(board.nodes["s"] as VectorNode).to], [4, 3]);
    close([...(board.nodes["s-copie"] as VectorNode).from], [3, 1]);
    board = applyAction(board, { type: "vectorOp", id: "p", kind: "sum", of: ["u", "v"], method: "parallelogram" }, t);
    close([...(board.nodes["s-copie"] as VectorNode).from, ...(board.nodes["p-copie"] as VectorNode).from], [3, 1, 0, 0]);
    board = applyAction(board, { type: "vectorOp", id: "d", kind: "difference", of: ["u", "v"] }, t);
    close([...(board.nodes["d"] as VectorNode).to], [2, -1]);
    board = applyAction(board, { type: "vectorOp", id: "k", kind: "scale", of: ["u"], k: 2 }, t);
    expect((board.nodes["k"] as VectorNode).label).toBe("2u");
    board = applyAction(board, { type: "vectorOp", id: "c", kind: "components", of: ["u"] }, t);
    expect(board.nodes["c-x-l"]).toMatchObject({ text: "3" });
  });

  it("cercle trigonométrique : cos et sin sont les longueurs des bons segments, et l'angle est orienté", () => {
    let board = applyAction(emptyBoard(), { type: "unitCircle", id: "uc", angle: 30, values: true }, t);
    expect(board.axes).not.toBeNull();
    const cos = board.nodes["uc-cos"] as SegmentNode;
    close([...cos.from, ...cos.to], [0, 0, Math.sqrt(3) / 2, 0]);
    expect(board.nodes["uc-sin-l"]).toMatchObject({ text: "sin θ = 0,5" });
    board = applyAction(board, { type: "unitCircle", id: "uc", angle: 210 }, t);
    close((board.nodes["uc-P"] as PointNode).at, [-Math.sqrt(3) / 2, -0.5]);
    const arc = board.nodes["uc-angle"] as ArcNode;
    expect(arc.end - arc.start).toBeCloseTo(210, 9);
  });

  it("coniques : foyers calculés par le moteur", () => {
    let board = applyAction(emptyBoard(), { type: "axes", x: [-6, 6], y: [-6, 6] }, t);
    board = applyAction(board, { type: "conic", id: "e", kind: "ellipse", a: 5, b: 3, foci: true }, t);
    close((board.nodes["e-F2"] as PointNode).at, [4, 0]);
    board = applyAction(board, { type: "conic", id: "hy", kind: "hyperbola", a: 3, b: 4, foci: true, elements: true }, t);
    close((board.nodes["hy-F1"] as PointNode).at, [-5, 0]);
    const branch = (board.nodes["hy-courbe"] as PolygonNode).points;
    for (const [x, y] of branch) expect((x * x) / 9 - (y * y) / 16).toBeCloseTo(1, 6);
    board = applyAction(board, { type: "conic", id: "pa", kind: "parabola", center: [0, -2], c: 1, foci: true, elements: true }, t);
    close((board.nodes["pa-F1"] as PointNode).at, [0, -1]);
    const d = board.nodes["pa-directrice"] as SegmentNode;
    expect(d.from[1]).toBeCloseTo(-3, 9);
    // Un foyer se vise par son nom.
    board = applyAction(board, { type: "segment", id: "s", from: "F1", to: "F2" }, t);
    expect(board.nodes["s"]).toBeDefined();
  });
});
