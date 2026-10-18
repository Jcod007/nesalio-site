import { describe, expect, it } from "vitest";
import { emptyBoard, resolveTargets, type ArcNode, type PolygonNode, type SegmentNode, type VectorNode } from "@/domain/board/state";
import { solveRightTriangle } from "@/domain/board/shapes";
import { Action, applyAction } from "./index";

const t = { start: 0, duration: 1000 };
const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6));

describe("figures paramétriques", () => {
  it("résout un triangle rectangle à partir de deux mesures quelconques", () => {
    const expected = { base: Math.sqrt(3), height: 1 };
    for (const spec of [{ angle: 30, hyp: 2 }, { angle: 30, base: Math.sqrt(3) }, { angle: 30, height: 1 }, { base: Math.sqrt(3), hyp: 2 }, { height: 1, hyp: 2 }]) {
      const solved = solveRightTriangle(spec)!;
      expect(solved.base).toBeCloseTo(expected.base, 9);
      expect(solved.height).toBeCloseTo(expected.height, 9);
    }
    expect(solveRightTriangle({ angle: 30 })).toBeNull();
    expect(Action.safeParse({ type: "triangle", id: "tri", hyp: 5 }).success).toBe(false);
  });

  it("dessine le triangle exact, ses parties nommées et son groupe", () => {
    const board = applyAction(emptyBoard(), { type: "triangle", id: "tri", angle: 30, hyp: 2, at: [0, 0], names: ["A", "B", "C"], sides: { hyp: "2" } }, t);
    const hyp = board.nodes["tri-hyp"] as SegmentNode;
    close([...hyp.from, ...hyp.to], [0, 0, Math.sqrt(3), 1]);
    expect(board.nodes["tri-droit"]).toMatchObject({ type: "polygon", closed: false });
    expect((board.nodes["tri-angle"] as ArcNode).end - (board.nodes["tri-angle"] as ArcNode).start).toBeCloseTo(30, 6);
    expect(resolveTargets(board, "tri")).toEqual(expect.arrayContaining(["tri-base", "tri-haut", "tri-hyp", "tri-hyp-l", "tri-A", "tri-B", "tri-C"]));
    // Les parties apparaissent l'une après l'autre.
    expect(board.nodes["tri-haut"]!.reveal.start).toBeGreaterThan(board.nodes["tri-base"]!.reveal.start);
  });

  it("marque un angle entre deux points nommés", () => {
    let board = emptyBoard();
    for (const [id, at] of [["A", [0, 0]], ["B", [2, 0]], ["C", [0, 2]]] as const) board = applyAction(board, { type: "point", id, at: [...at] }, t);
    board = applyAction(board, { type: "angle", id: "a", at: "A", from: "B", to: "C", label: "90°" }, t);
    const arc = board.nodes.a as ArcNode;
    expect(arc.end - arc.start).toBeCloseTo(90, 6);
    expect(applyAction(board, { type: "angle", id: "b", at: "Z", from: "B", to: "C" }, t).nodes.b).toBeUndefined();
  });

  it("dessine un plan incliné avec le poids et ses composantes justes", () => {
    const board = applyAction(emptyBoard(), { type: "incline", id: "plan", angle: 30, length: 4, at: [0, 0], components: true, normal: true }, t);
    const slope = board.nodes["plan-pente"] as PolygonNode;
    close(slope.points[2]!, [4 * Math.cos(Math.PI / 6), 4 * Math.sin(Math.PI / 6)]);
    const P = board.nodes["plan-P"] as VectorNode;
    const Px = board.nodes["plan-Px"] as VectorNode;
    const Py = board.nodes["plan-Py"] as VectorNode;
    const length = (v: VectorNode) => Math.hypot(v.to[0] - v.from[0], v.to[1] - v.from[1]);
    // P∥ = P sin θ, P⊥ = P cos θ, et P∥ descend la pente.
    expect(length(Px)).toBeCloseTo(length(P) * 0.5, 6);
    expect(length(Py)).toBeCloseTo(length(P) * Math.cos(Math.PI / 6), 6);
    expect(Px.to[0]).toBeLessThan(Px.from[0]);
    expect(resolveTargets(board, "plan")).toEqual(expect.arrayContaining(["plan-bloc", "plan-N", "plan-angle"]));
  });

  it("trace un vecteur à partir de ses composantes", () => {
    const board = applyAction(emptyBoard(), { type: "vector", id: "v", from: [1, 1], by: [3, 2] }, t);
    expect(board.nodes.v).toMatchObject({ from: [1, 1], to: [4, 3] });
  });
});
