/**
 * Cas observés dans les séances réelles, rejoués à la main : chaque objet posé
 * occupe son empreinte, et ce qui arrive ensuite se place en l'évitant, en
 * bougeant le moins possible.
 */
import { describe, expect, it } from "vitest";
import { applyAction, type Action } from "@/domain/scene/commands";
import { collisions, type CollisionKind } from "./collisions";
import { axisTicks, boxCenter, nodeBox, scales, tickLabels } from "./layout";
import { emptyBoard, type BoardState, type TextNode } from "./state";

const t = (start: number) => ({ start, duration: 100 });
const run = (actions: Action[], board: BoardState = emptyBoard()) => actions.reduce((state, action, i) => applyAction(state, action, t(i * 10)), board);
const kinds = (board: BoardState, ...only: CollisionKind[]) => collisions(board).filter((c) => only.length === 0 || only.includes(c.kind));
/** Distance à l'écran (unités du monde) entre deux points mathématiques. */
const screenDistance = (board: BoardState, a: readonly [number, number], b: readonly [number, number]) => {
  const s = scales(board.frame);
  return Math.hypot((a[0] - b[0]) * s.x, (a[1] - b[1]) * s.y);
};

describe("chevauchements observés", () => {
  it("deux textes demandés au même endroit : le second se pose juste à côté", () => {
    const board = run([
      { type: "axes", x: [-6, 6], y: [-4, 4] },
      { type: "curve", id: "f", fn: "1/x", color: "blue" },
      { type: "text", id: "t1", text: "1 ÷ 0 : impossible", at: [2, 2] },
      { type: "text", id: "t2", text: "pas de valeur en x = 0", at: [2, 2] },
    ]);
    expect(kinds(board, "texte")).toEqual([]);
    const t2 = board.nodes.t2 as TextNode;
    // Poussé juste assez : à moins de deux hauteurs de ligne de l'endroit demandé.
    expect(screenDistance(board, boxCenter(nodeBox(t2, board.frame)), [2, 2])).toBeLessThan(1.1);
  });

  it("graphique de proportionnalité : étiquettes de points lisibles, hors des points et des traits", () => {
    const board = run([
      { type: "axes", x: [0, 10], y: [0, 25], xLabel: "kg", yLabel: "$" },
      { type: "curve", id: "f", fn: "2.5*x", from: 0, to: 10, label: "y = 2,5x" },
      { type: "point", id: "p1", at: [2, 5], label: "(2, 5)" },
      { type: "point", id: "p2", at: [4, 10], label: "(4, 10)" },
      { type: "point", id: "p3", at: [6, 15], label: "(6, 15)" },
      { type: "text", id: "tB", text: "×2", near: "p1", side: "right" },
      { type: "text", id: "s6", text: "même rapport", near: "p2", side: "right" },
    ]);
    expect(kinds(board, "texte", "point", "trait", "surface")).toEqual([]);
  });

  it("deux points au même endroit ou presque : leurs étiquettes ne se superposent pas", () => {
    const board = run([
      { type: "axes", x: [-1, 8], y: [-1, 14] },
      { type: "point", id: "g2", at: [2, 6], label: "(2, 6)" },
      { type: "point", id: "m", at: [3, 6], label: "P" },
      { type: "point", id: "S", at: [3, 6.2], label: "(3, 6)" },
    ]);
    expect(kinds(board, "texte", "point")).toEqual([]);
  });

  it("composantes d'un vecteur (projectile) : vx et vy ne tombent ni sur un trait ni sur les chiffres des axes", () => {
    const board = run([
      { type: "axes", x: [-2, 44], y: [-3, 12], xLabel: "x (m)", yLabel: "y (m)" },
      { type: "vector", id: "v0", from: [0, 0], to: [6.4, 4.8], label: "v₀" },
      { type: "vector", id: "vx", from: [0, 0], to: [6.4, 0], label: "vx" },
      { type: "vector", id: "vy", from: [0, 0], to: [0, 4.8], label: "vy" },
      { type: "segment", id: "p1", from: [6.4, 0], to: [6.4, 4.8], dashed: true },
      { type: "segment", id: "p2", from: [0, 4.8], to: [6.4, 4.8], dashed: true },
    ]);
    expect(kinds(board, "texte", "point", "trait")).toEqual([]);
  });

  it("Pythagore : les étiquettes des côtés restent hors des carrés construits ensuite, près de leur côté", () => {
    const board = run([
      { type: "triangle", id: "tri", base: 4, height: 3, at: [-1, -1], names: ["A", "B", "C"], sides: { base: "4", height: "3", hyp: "5" } },
      { type: "polygon", id: "c4", points: [[-1, -1], [3, -1], [3, -5], [-1, -5]], fill: true, label: "16" },
      { type: "polygon", id: "c3", points: [[3, -1], [6, -1], [6, 2], [3, 2]], fill: true, label: "9" },
      { type: "polygon", id: "c5", points: [[-1, -1], [3, 2], [0, 6], [-4, 3]], fill: true, label: "25" },
    ]);
    expect(kinds(board, "texte", "surface", "point")).toEqual([]);
    // L'étiquette « 4 » reste près du milieu de la base (pas exilée sous le carré).
    const base = board.nodes["tri-base-l"] as TextNode;
    expect(screenDistance(board, boxCenter(nodeBox(base, board.frame)), [1, -1])).toBeLessThan(1.2);
  });

  it("aires écrites sur des polygones voisins : elles ne se superposent pas", () => {
    const board = run([
      { type: "polygon", id: "a", points: [[0, 0], [1, 0], [1, 1], [0, 1]], fill: true, label: "aire = 1 cm²" },
      { type: "polygon", id: "b", points: [[1, 0], [2, 0], [2, 1], [1, 1]], fill: true, label: "aire = 1 cm²" },
    ]);
    expect(kinds(board, "texte")).toEqual([]);
  });
});

describe("graduations lisibles", () => {
  it("bornes très différentes en x et en y : chaque axe garde sa place et ses chiffres ne se touchent pas", () => {
    const board = run([{ type: "axes", x: [0, 2000], y: [0, 50000], xLabel: "billets", yLabel: "revenu $" }]);
    expect(kinds(board, "graduations")).toEqual([]);
    const s = scales(board.frame);
    expect(2000 * s.x).toBeGreaterThan(8); // l'axe des x n'est plus écrasé
    expect(tickLabels(board.frame).map((l) => l.text)).toContain("25 000");
  });

  it("le pas demandé est respecté quand il reste lisible, élargi sinon", () => {
    let board = run([{ type: "axes", x: [0, 100], y: [0, 10], xStep: 10 } as Action]);
    expect(axisTicks(board.frame).x.step).toBe(10);
    board = run([{ type: "axes", x: [0, 5000], y: [0, 10], xStep: 10 } as Action]);
    expect(axisTicks(board.frame).x.step).toBeGreaterThan(10);
    expect(kinds(board, "graduations")).toEqual([]);
  });

  it("un repère ordinaire garde la même échelle en x et en y (les angles et les cercles restent justes)", () => {
    const board = run([{ type: "axes", x: [-1, 8], y: [-1, 14] }]);
    const s = scales(board.frame);
    expect(s.x).toBeCloseTo(s.y, 9);
  });

  it("un texte posé avant le repère ne reste pas sur les chiffres des axes", () => {
    const board = run([
      { type: "text", id: "b", text: "1 billet = 25 $", at: [0, 0], size: "large" },
      { type: "axes", x: [0, 2000], y: [0, 50000] },
    ]);
    expect(kinds(board, "texte", "trait")).toEqual([]);
  });
});

describe("ce qui est déjà au tableau ne saute pas", () => {
  it("ajouter un objet loin des autres ne déplace rien", () => {
    const before = run([
      { type: "axes", x: [-6, 6], y: [-4, 4] },
      { type: "point", id: "A", at: [-3, 2], label: "A" },
      { type: "text", id: "t", text: "un point", near: "A", side: "right" },
    ]);
    const after = applyAction(before, { type: "point", id: "B", at: [4, -3], label: "B" }, t(100));
    for (const id of ["A", "t"]) {
      expect(after.nodes[id]!.offset).toEqual(before.nodes[id]!.offset);
      expect(JSON.stringify(after.nodes[id])).toBe(JSON.stringify(before.nodes[id]));
    }
  });
});
