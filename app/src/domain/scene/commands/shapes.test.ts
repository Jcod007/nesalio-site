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

  it("comprend les noms de côtés ab, bc, ca, opposé et adjacent sur un triangle rectangle", () => {
    // Séance observée : « opposé » écrit près de tri-bc partait dans la colonne de calculs.
    let board = applyAction(emptyBoard(), { type: "triangle", id: "tri", base: 4, height: 3, names: ["A", "B", "C"] }, t);
    expect(resolveTargets(board, "tri-ab")).toEqual(["tri-base"]);
    expect(resolveTargets(board, "tri-bc")).toEqual(["tri-haut"]);
    expect(resolveTargets(board, "tri-ca")).toEqual(["tri-hyp"]);
    expect(resolveTargets(board, "tri-oppose")).toEqual(["tri-haut"]);
    expect(resolveTargets(board, "tri-adjacent")).toEqual(["tri-base"]);
    board = applyAction(board, { type: "text", id: "op", text: "opposé", near: "tri-bc", side: "right" }, t);
    expect(board.nodes.op).toMatchObject({ role: "free", anchor: { target: "tri-bc" } });
    expect(board.calc).not.toContain("op");
  });

  it("construit les carrés de Pythagore sur les côtés, à l'extérieur, avec l'aire au centre", () => {
    const board = applyAction(
      emptyBoard(),
      { type: "triangle", id: "tri", base: 4, height: 3, at: [0, 0], sides: { base: "4", height: "3", hyp: "5" }, squares: { base: "16", height: "9", hyp: "25" } },
      t,
    );
    const base = board.nodes["tri-carre-base"] as PolygonNode;
    const haut = board.nodes["tri-carre-haut"] as PolygonNode;
    const hyp = board.nodes["tri-carre-hyp"] as PolygonNode;
    // Base A(0,0)–B(4,0) : le carré est dessous ; hauteur B(4,0)–C(4,3) : à droite.
    close(base.points.flat(), [0, 0, 4, 0, 4, -4, 0, -4]);
    close(haut.points.flat(), [4, 0, 4, 3, 7, 3, 7, 0]);
    // Hypoténuse A(0,0)–C(4,3) : vers le haut à gauche, côté 5.
    close(hyp.points.flat(), [0, 0, 4, 3, 1, 7, -3, 4]);
    expect(base).toMatchObject({ fill: true, closed: true, label: "16" });
    expect(hyp.label).toBe("25");
    // Les longueurs ne tombent pas dans les carrés : elles passent à l'intérieur du triangle.
    const inside = (p: number[], q: PolygonNode) => {
      const xs = q.points.map((v) => v[0]);
      const ys = q.points.map((v) => v[1]);
      return p[0]! > Math.min(...xs) && p[0]! < Math.max(...xs) && p[1]! > Math.min(...ys) && p[1]! < Math.max(...ys);
    };
    const at = (id: string) => (board.nodes[id] as { at: number[] }).at;
    expect(inside(at("tri-base-l"), base)).toBe(false);
    expect(inside(at("tri-haut-l"), haut)).toBe(false);
    expect(at("tri-base-l")[1]).toBeGreaterThan(0);
    expect(resolveTargets(board, "tri-carres")).toEqual(["tri-carre-base", "tri-carre-haut", "tri-carre-hyp"]);
    expect(resolveTargets(board, "tri")).toContain("tri-carre-hyp");
  });

  it("fait glisser les longueurs déjà écrites à l'intérieur quand on ajoute les carrés sans redonner \"sides\"", () => {
    // Séance observée : le modèle redemande le triangle avec "squares" seulement ; les longueurs restaient dans les carrés.
    const spec = { type: "triangle" as const, id: "tri", base: 4, height: 3, at: [0, 0] as [number, number] };
    let board = applyAction(emptyBoard(), { ...spec, sides: { base: "4", height: "3", hyp: "5" } }, t);
    const before = board.nodes["tri-base-l"] as { at: number[]; offset: number[] };
    expect(before.at[1]!).toBeLessThan(0);
    board = applyAction(board, { ...spec, squares: { base: "16", height: "9", hyp: "25" } }, { start: 3000, duration: 1000 });
    const after = board.nodes["tri-base-l"] as { at: number[]; offset: number[]; text: string };
    expect(after.text).toBe("4");
    expect(after.at[1]! + after.offset[1]!).toBeGreaterThan(0);
    const haut = board.nodes["tri-haut-l"] as { at: number[]; offset: number[] };
    expect(haut.at[0]! + haut.offset[0]!).toBeLessThan(4);
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

  it("complète une figure redemandée avec plus d'options sans redessiner ce qui est déjà là", () => {
    let board = applyAction(emptyBoard(), { type: "incline", id: "plan", angle: 30, weight: false }, t);
    expect(board.nodes["plan-P"]).toBeUndefined();
    const blockReveal = board.nodes["plan-bloc"]!.reveal;
    board = applyAction(board, { type: "incline", id: "plan", angle: 30, weight: true }, { start: 5000, duration: 1000 });
    expect(board.nodes["plan-bloc"]!.reveal).toEqual(blockReveal);
    expect(board.nodes["plan-P"]!.reveal.start).toBe(5000);
    expect(resolveTargets(board, "plan")).toContain("plan-P");
  });
});
