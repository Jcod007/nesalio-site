import { describe, expect, it } from "vitest";
import { emptyBoard, resolveTargets, type PolygonNode, type SegmentNode } from "@/domain/board/state";
import { applyAction } from "./index";

const t = { start: 0, duration: 1000 };
const len = (s: SegmentNode) => Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]);
const edges = (board: ReturnType<typeof emptyBoard>, id: string) =>
  resolveTargets(board, id)
    .filter((k) => k.startsWith(`${id}-arete-`))
    .map((k) => board.nodes[k] as SegmentNode);

describe("solides en perspective", () => {
  it("pavé droit : 12 arêtes dont 3 cachées (celles du coin arrière), cotes posées", () => {
    const board = applyAction(emptyBoard(), { type: "prism", id: "p", base: "rectangle", length: 5, width: 3, height: 4, labels: { length: "5 cm", width: "3 cm", height: "4 cm" } }, t);
    const all = edges(board, "p");
    expect(all.length).toBe(12);
    expect(all.filter((e) => e.dashed).length).toBe(3);
    expect(board.nodes["p-hauteur-l"]).toMatchObject({ type: "text", text: "4 cm" });
    expect(board.nodes["p-base"]).toMatchObject({ type: "polygon", fill: true });
  });

  it("prisme à base hexagonale et pyramide à base carrée : nombre d'arêtes du programme", () => {
    const hex = applyAction(emptyBoard(), { type: "prism", id: "h", base: "regular", sides: 6, length: 2, height: 3 }, t);
    expect(edges(hex, "h").length).toBe(18);
    const py = applyAction(emptyBoard(), { type: "pyramid", id: "py", base: "square", length: 4, height: 6, labels: { height: "6 cm", slant: "a" } }, t);
    expect(edges(py, "py").length).toBe(8);
    expect(edges(py, "py").some((e) => e.dashed)).toBe(true);
    expect(py.nodes["py-hauteur"]).toMatchObject({ type: "segment", dashed: true });
    expect(py.nodes["py-apotheme"]).toBeDefined();
  });

  it("cône et boule", () => {
    const co = applyAction(emptyBoard(), { type: "cone", id: "co", radius: 3, height: 4, labels: { slant: "5" } }, t);
    expect(len(co.nodes["co-generatrice"] as SegmentNode)).toBeCloseTo(5, 9);
    const b = applyAction(emptyBoard(), { type: "sphere", id: "b", radius: 3, labels: { radius: "3 cm" } }, t);
    expect(len(b.nodes["b-rayon"] as SegmentNode)).toBeCloseTo(3, 9);
  });

  it("polygone régulier exact, apothème et découpage en triangles", () => {
    const board = applyAction(emptyBoard(), { type: "regularPolygon", id: "hex", sides: 6, side: 2, apothem: true, triangles: true }, t);
    const pts = (board.nodes["hex-contour"] as PolygonNode).points;
    for (let k = 0; k < 6; k++) {
      const [a, b] = [pts[k]!, pts[(k + 1) % 6]!];
      expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(2, 9);
    }
    expect(len(board.nodes["hex-apotheme"] as SegmentNode)).toBeCloseTo(Math.sqrt(3), 9);
    expect(resolveTargets(board, "hex-triangles").length).toBe(6);
  });
});
