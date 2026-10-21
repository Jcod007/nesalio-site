import { describe, expect, it } from "vitest";
import { emptyBoard, resolveTargets, type SegmentNode, type TextNode } from "@/domain/board/state";
import { applyAction } from "./index";
import { Action } from "../schema";
import { collisions } from "@/domain/board/collisions";

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

// Séances du 21 octobre : un axe de réflexion à travers le triangle, une homothétie sur la figure.
describe("le moteur place l'image à côté de l'original", () => {
  const play = (board: ReturnType<typeof triangle>, raw: unknown) => {
    const parsed = Action.safeParse(raw);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    return applyAction(board, parsed.data!, t);
  };
  /** Les chevauchements entre l'original (tri) et l'image (img). */
  const clashes = (board: ReturnType<typeof triangle>) =>
    collisions(board).filter((c) => [c.a, c.b].some((id) => id.startsWith("tri")) && [c.a, c.b].some((id) => id.startsWith("img")));

  it.each([
    ["réflexion d'axe vertical", { kind: "reflection", axis: "vertical" }],
    ["réflexion sans axe donné", { kind: "reflection" }],
    ["réflexion d'axe horizontal", { kind: "reflection", axis: "horizontal" }],
    ["translation", { kind: "translation", by: "auto" }],
    ["homothétie de rapport 2", { kind: "homothety", ratio: 2 }],
    ["homothétie de rapport 0,5", { kind: "homothety", center: "auto", ratio: 0.5 }],
    ["homothétie de rapport −1", { kind: "homothety", ratio: -1 }],
  ])("%s : aucune image sur la figure", (_, spec) => {
    const board = play(triangle(), { type: "image", id: "img", target: "tri", ...spec });
    expect(Object.keys(board.nodes).some((id) => id.startsWith("img-tri"))).toBe(true);
    expect(clashes(board)).toEqual([]);
  });

  it("évite aussi les autres figures du tableau : l'image passe de l'autre côté", () => {
    // Une autre figure juste à droite du triangle (là où l'image irait d'abord).
    let board = applyAction(triangle(), { type: "triangle", id: "autre", points: [[4.2, 0], [6.2, 0], [4.2, 2]] }, t);
    for (const spec of [{ kind: "reflection", axis: "vertical" }, { kind: "translation" }, { kind: "homothety", ratio: 0.5 }]) {
      const next = play(board, { type: "image", id: "img", target: "tri", ...spec });
      const hits = collisions(next).filter((c) => [c.a, c.b].some((id) => id.startsWith("img")) && [c.a, c.b].some((id) => id.startsWith("autre") || id.startsWith("tri")));
      expect(hits, JSON.stringify(spec)).toEqual([]);
    }
  });

  it("le détecteur voit bien une image posée sur la figure (contrôle du test)", () => {
    const board = play(triangle(), { type: "image", id: "img", target: "tri", kind: "reflection", axis: [[2, -1], [2, 3]] });
    expect(clashes(board).map((c) => c.kind)).toContain("dessins");
  });

  it("dessine l'axe posé par le moteur, nommé, et garde l'axe donné par l'énoncé", () => {
    let board = play(triangle(), { type: "image", id: "img", target: "tri", kind: "reflection", axis: "vertical", axisLabel: "d" });
    expect(board.nodes["img-axe"]).toMatchObject({ type: "segment", label: "d" });
    // Axe de symétrie voulu (sur la figure) : gardé tel quel.
    board = play(triangle(), { type: "image", id: "img", target: "tri", kind: "reflection", axis: [[1, -1], [1, 3]] });
    close(ends(board.nodes["img-tri-ab"] as SegmentNode), [1, 0, -1, 0]);
    expect(board.nodes["img-axe"]).toBeUndefined();
  });
});
