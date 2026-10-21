import { describe, expect, it } from "vitest";
import { emptyBoard, resolveTargets, type PointNode, type SegmentNode, type TextNode } from "@/domain/board/state";
import { applyAction } from "./index";
import { Action } from "../schema";
import { collisions, covered, figureOutline } from "@/domain/board/collisions";

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
    // Avec un repère, l'axe x = 2 fait partie du problème : le moteur le garde, même à travers la figure.
    const withAxes = applyAction(emptyBoard(), { type: "axes", x: [-6, 6], y: [-4, 4] }, t);
    let board = applyAction(withAxes, { type: "triangle", id: "tri", points: [[1, 0], [3, 0], [1, 2]], names: ["A", "B", "C"] }, t);
    board = play(board, { type: "image", id: "img", target: "tri", kind: "reflection", axis: [[2, -1], [2, 3]] });
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

// Séances du 21 octobre (après la PR #11) : 9 homothéties sur 10 avec un point O posé à la main,
// souvent dans le triangle. Sans repère, cette position est libre : le moteur la déplace si l'image
// tombe sur une figure, et garde les relations (sommet, construction) et tout ce qui est dans un repère.
describe("positions libres : le moteur déplace ce qui gêne, garde les relations", () => {
  const play = (board: ReturnType<typeof triangle>, raw: unknown) => {
    const parsed = Action.safeParse(raw);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    return applyAction(board, parsed.data!, t);
  };
  const clashes = (board: ReturnType<typeof triangle>) =>
    collisions(board).filter((c) => c.kind === "dessins" && [c.a, c.b].some((id) => id.startsWith("img")));
  const pointAt = (board: ReturnType<typeof triangle>, id: string) => {
    const node = board.nodes[id] as PointNode;
    return [node.at[0] + node.offset[0], node.at[1] + node.offset[1]];
  };
  const withO = (at: [number, number]) => play(triangle(), { type: "point", id: "O", at, label: "O" });

  it("homothétie de centre O posé dans le triangle : O glisse à côté, l'image ne recouvre plus la figure", () => {
    const board = play(withO([1.5, 0.5]), { type: "image", id: "img", target: "tri", kind: "homothety", center: "O", ratio: 2 });
    expect(covered(figureOutline(board, "tri")!, figureOutline(board, "img")!)).toBeLessThan(0.05);
    const o = pointAt(board, "O");
    expect(o[0]).toBeLessThan(1);
    // Le rayon issu du centre part bien du nouveau O.
    close((board.nodes["img-trace-1"] as SegmentNode).from, o);
    expect((board.nodes["O"] as PointNode).motions?.length).toBe(1);
  });

  it("centre donné en coordonnées : le point O dessiné à cette place suit", () => {
    const board = play(withO([2, 0.5]), { type: "image", id: "img", target: "tri", kind: "homothety", center: [2, 0.5], ratio: 2 });
    expect(clashes(board)).toEqual([]);
    expect(pointAt(board, "O")).not.toEqual([2, 0.5]);
  });

  it("un trait tiré depuis O avant l'image suit son bout", () => {
    let board = withO([1.5, 0.5]);
    board = play(board, { type: "segment", id: "ray", from: "O", to: [6, 0.5] });
    board = play(board, { type: "image", id: "img", target: "tri", kind: "homothety", center: "O", ratio: 2 });
    close((board.nodes["ray"] as SegmentNode).from, pointAt(board, "O"));
    close((board.nodes["ray"] as SegmentNode).to, [6, 0.5]);
  });

  it("O posé loin de la figure, l'image ne gêne pas : rien ne bouge", () => {
    const board = play(withO([-4, 1]), { type: "image", id: "img", target: "tri", kind: "homothety", center: "O", ratio: 2 });
    expect(pointAt(board, "O")).toEqual([-4, 1]);
    expect((board.nodes["O"] as PointNode).motions).toBeUndefined();
  });

  it("une relation est gardée : homothétie centrée sur le sommet C", () => {
    const board = play(triangle(), { type: "image", id: "img", target: "tri", kind: "homothety", center: "C", ratio: 2 });
    close((board.nodes["img-trace-1"] as SegmentNode).from, [1, 2]);
  });

  it("un point posé exactement sur un sommet est une relation : gardé", () => {
    const board = play(withO([1, 2]), { type: "image", id: "img", target: "tri", kind: "homothety", center: "O", ratio: 2 });
    expect(pointAt(board, "O")).toEqual([1, 2]);
  });

  it("avec un repère, O(1,5 ; 0,5) fait partie du problème : gardé", () => {
    let board = applyAction(emptyBoard(), { type: "axes", x: [-6, 6], y: [-4, 4] }, t);
    board = applyAction(board, { type: "triangle", id: "tri", points: [[1, 0], [3, 0], [1, 2]], names: ["A", "B", "C"] }, t);
    board = play(board, { type: "point", id: "O", at: [1.5, 0.5], label: "O" });
    board = play(board, { type: "image", id: "img", target: "tri", kind: "homothety", center: "O", ratio: 2 });
    expect(pointAt(board, "O")).toEqual([1.5, 0.5]);
  });

  it("réflexion par un axe tracé seul à travers la figure : l'axe glisse parallèlement, à côté", () => {
    let board = play(triangle(), { type: "segment", id: "axe", from: [1.5, -1], to: [2.5, 3] });
    board = play(board, { type: "image", id: "img", target: "tri", kind: "reflection", axis: "axe" });
    expect(clashes(board)).toEqual([]);
    const s = board.nodes["axe"] as SegmentNode;
    // Même direction, déplacé en bloc.
    close([s.to[0] - s.from[0], s.to[1] - s.from[1]], [1, 4]);
    expect(Math.hypot(...s.offset)).toBeGreaterThan(0);
  });

  it("axe de symétrie de la figure (l'image est la figure elle-même) : gardé", () => {
    let board = applyAction(emptyBoard(), { type: "triangle", id: "tri", points: [[0, 0], [2, 0], [1, 2]], names: ["A", "B", "C"] }, t);
    board = play(board, { type: "image", id: "img", target: "tri", kind: "reflection", axis: [[1, -1], [1, 3]] });
    close(ends(board.nodes["img-tri-ab"] as SegmentNode), [2, 0, 0, 0]);
  });

  it("rotation autour d'un O posé dans la figure : O glisse, l'image est à côté", () => {
    const board = play(withO([1.5, 0.5]), { type: "image", id: "img", target: "tri", kind: "rotation", center: "O", angle: 90 });
    expect(clashes(board)).toEqual([]);
    expect(pointAt(board, "O")).not.toEqual([1.5, 0.5]);
  });

  it.each([2, 3, 0.5, -1])("homothétie de rapport %s, O au hasard dans la figure : jamais d'image sur l'original", (k) => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 25; i++) {
      // Un point au hasard dans le triangle (1,0) (3,0) (1,2).
      let [u, v] = [rand(), rand()];
      if (u + v > 1) [u, v] = [1 - u, 1 - v];
      const at: [number, number] = [1 + 2 * u, 2 * v];
      const board = play(withO(at), { type: "image", id: "img", target: "tri", kind: "homothety", center: "O", ratio: k });
      // Le détecteur tolère une figure entièrement dans une autre ; ici, on mesure le recouvrement lui-même.
      const tri = figureOutline(board, "tri")!;
      const img = figureOutline(board, "img")!;
      expect(Math.max(covered(tri, img), covered(img, tri)), JSON.stringify({ k, at })).toBeLessThan(0.05);
    }
  });
});
