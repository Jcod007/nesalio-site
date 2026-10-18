import { describe, expect, it } from "vitest";
import { DEMO_LESSONS } from "@/content/demoLessons";
import { applyAction, type Action } from "@/domain/scene/commands";
import { ModelEvent } from "@/domain/scene/schema";
import { calcColumn, nodeBox, intersects } from "./layout";
import { emptyBoard, lastMotion, pruneErased, resolveTargets, summarizeBoard, type BoardState, type TextNode } from "./state";

const t = (start: number) => ({ start, duration: 100 });
const run = (actions: Action[], board: BoardState = emptyBoard()) =>
  actions.reduce((state, action, i) => applyAction(state, action, t(i * 10)), board);
const text = (board: BoardState, id: string) => board.nodes[id] as TextNode;
const position = (board: BoardState, id: string) => {
  const node = board.nodes[id]!;
  const at: [number, number] =
    node.type === "point" || node.type === "text" ? node.at : node.type === "segment" || node.type === "vector" ? node.from : [0, 0];
  return [at[0] + node.offset[0], at[1] + node.offset[1]] as const;
};

describe("graphe de scène", () => {
  it("dessine, met en évidence puis efface un objet", () => {
    let board = run([
      { type: "axes", x: [-1, 5], y: [-3, 4] },
      { type: "point", id: "A", at: [2, 3], label: "(2, 3)" },
      { type: "highlight", target: "A" },
    ]);
    expect(board.frame.x).toEqual([-1, 5]);
    expect(board.order).toEqual(["A"]);
    expect(board.highlights.A).toBe(20);

    board = applyAction(board, { type: "erase", target: "A" }, t(30));
    expect(board.nodes.A?.erased).toEqual(t(30));
    expect(pruneErased(board, 100).order).toEqual(["A"]);
    expect(pruneErased(board, 200).order).toEqual([]);
  });

  it("remplace un objet redessiné sans changer l'ordre", () => {
    const board = run([
      { type: "point", id: "A", at: [0, 0] },
      { type: "point", id: "B", at: [1, 1] },
      { type: "point", id: "A", at: [2, 2] },
    ]);
    expect(board.order).toEqual(["A", "B"]);
    expect(board.nodes.A).toMatchObject({ at: [2, 2] });
  });

  it("ignore les cibles inconnues", () => {
    const board = run([
      { type: "highlight", target: "nope" },
      { type: "erase", target: "nope" },
      { type: "move", target: "nope", by: [1, 1] },
      { type: "transform", target: "nope", text: "x" },
      { type: "dim", target: "nope" },
    ]);
    expect(board).toEqual(emptyBoard());
  });

  it("regroupe des objets : le groupe se cible comme un seul objet", () => {
    let board = run([
      { type: "segment", id: "a", from: [0, 0], to: [3, 0] },
      { type: "segment", id: "b", from: [3, 0], to: [3, 2] },
      { type: "segment", id: "h", from: [0, 0], to: [3, 2] },
      { type: "group", id: "tri", members: ["a", "b", "h"] },
    ]);
    expect(resolveTargets(board, "tri")).toEqual(["a", "b", "h"]);

    board = applyAction(board, { type: "move", target: "tri", by: [-2, 1] }, t(100));
    for (const id of ["a", "b", "h"]) expect(board.nodes[id]!.offset).toEqual([-2, 1]);
    expect(lastMotion(board.nodes.a!)).toEqual({ from: [0, 0], to: [-2, 1], start: 100, duration: 100 });

    board = applyAction(board, { type: "dim", target: "tri" }, t(200));
    expect(board.nodes.h!.dim).toMatchObject({ on: true, start: 200 });

    board = applyAction(board, { type: "erase", target: "tri" }, t(300));
    expect(["a", "b", "h"].every((id) => board.nodes[id]!.erased)).toBe(true);
  });

  it("un texte ancré à un objet le suit quand il bouge, et disparaît avec lui", () => {
    let board = run([
      { type: "axes", x: [-5, 5], y: [-4, 4] },
      { type: "point", id: "A", at: [1, 2] },
      { type: "text", id: "eq", text: "A(1, 2)", near: "A", side: "right" },
    ]);
    const eq = text(board, "eq");
    expect(eq.anchor).toEqual({ target: "A", side: "right" });
    expect(eq.at[0]).toBeGreaterThan(1);
    expect(eq.at[1]).toBeCloseTo(2, 0);

    board = applyAction(board, { type: "move", target: "A", to: [2, 1] }, t(100));
    // « to » désigne le nouveau centre de l'objet : de (1, 2) à (2, 1).
    expect(board.nodes.A!.offset).toEqual([1, -1]);
    expect(board.nodes.eq!.offset).toEqual([1, -1]);

    board = applyAction(board, { type: "erase", target: "A" }, t(200));
    expect(board.nodes.eq!.erased).toBeDefined();
  });

  it("place le texte du côté libre quand le côté demandé est occupé", () => {
    const board = run([
      { type: "axes", x: [-5, 5], y: [-4, 4] },
      { type: "point", id: "A", at: [2, 2] },
      { type: "text", id: "t1", text: "premier texte", near: "A", side: "right" },
      { type: "text", id: "t2", text: "second texte", near: "A", side: "right" },
    ]);
    expect(text(board, "t2").anchor?.side).not.toBe("right");
    expect(intersects(nodeBox(board.nodes.t1!, board.frame), nodeBox(board.nodes.t2!, board.frame))).toBe(false);
  });

  it("transforme un objet sur place : le texte change, la courbe aussi", () => {
    let board = run([
      { type: "note", id: "eq1", text: "x² − 4 = 0" },
      { type: "curve", id: "f", fn: "x^2" },
    ]);
    board = applyAction(board, { type: "transform", target: "eq1", text: "x² = 4" }, t(100));
    board = applyAction(board, { type: "transform", target: "f", fn: "x^2-4", color: "green" }, t(110));
    expect(board.nodes.eq1).toMatchObject({ text: "x² = 4", morph: t(100) });
    expect(board.nodes.f).toMatchObject({ fn: "x^2-4", color: "green", morph: t(110) });
  });

  it("transforme un point déplacé vers une position absolue", () => {
    let board = run([{ type: "point", id: "P", at: [1, 1] }, { type: "move", target: "P", by: [1, 0] }]);
    board = applyAction(board, { type: "transform", target: "P", at: [4, 4] }, t(100));
    expect(position(board, "P")).toEqual([4, 4]);
  });

  it("écrit les calculs sur le tableau, en colonne à droite de la figure", () => {
    const board = run([
      { type: "axes", x: [-1, 5], y: [-3, 4] },
      { type: "note", id: "n1", text: "f(x) = 0" },
      { type: "note", id: "n2", text: "x = 2 ± √3" },
    ]);
    expect(board.calc).toEqual(["n1", "n2"]);
    const [x1, y1] = position(board, "n1");
    const [x2, y2] = position(board, "n2");
    expect(x1).toBeGreaterThan(5);
    expect(x2).toBeCloseTo(x1!);
    expect(y2).toBeLessThan(y1!);
  });

  it("fait de la place quand la colonne de calculs est pleine : la plus ancienne s'efface, les autres remontent", () => {
    let board = run([{ type: "axes", x: [-1, 5], y: [-3, 4] }]);
    const { capacity } = calcColumn(board);
    for (let i = 0; i < capacity; i++) board = applyAction(board, { type: "note", id: `n${i}`, text: `ligne ${i}` }, t(10 + i));
    const secondBefore = position(board, "n1");
    board = applyAction(board, { type: "note", id: "last", text: "nouvelle ligne" }, t(500));
    expect(board.nodes.n0!.erased).toEqual(t(500));
    expect(board.calc).toHaveLength(capacity);
    expect(position(board, "n1")[1]).toBeGreaterThan(secondBefore[1]!);
    expect(lastMotion(board.nodes.n1!)?.start).toBe(500);
  });

  it("n'écrit jamais une ligne de calcul sur un texte posé dans la figure", () => {
    let board = run([
      { type: "axes", x: [-1, 5], y: [-3, 4] },
      { type: "note", id: "n1", text: "x = 2 ± √3" },
      { type: "text", id: "t", text: "√3 ≈ 1,73 environ", near: "n1", side: "below" },
      { type: "note", id: "n2", text: "(x − 2)² = (x − 2) × (x − 2)" },
    ]);
    expect(intersects(nodeBox(board.nodes.t!, board.frame), nodeBox(board.nodes.n2!, board.frame))).toBe(false);
    // Un texte demandé à une position déjà prise se décale.
    board = applyAction(board, { type: "text", id: "u", text: "ici", at: position(board, "n1") as [number, number] }, t(500));
    expect(intersects(nodeBox(board.nodes.u!, board.frame), nodeBox(board.nodes.n1!, board.frame))).toBe(false);
  });

  it("range la colonne de calculs à côté du nouveau repère quand il change", () => {
    let board = run([{ type: "note", id: "n1", text: "a" }]);
    const before = position(board, "n1");
    board = applyAction(board, { type: "axes", x: [0, 40], y: [0, 12] }, t(100));
    expect(position(board, "n1")[0]).toBeGreaterThan(before[0]!);
    expect(lastMotion(board.nodes.n1!)?.start).toBe(100);
  });

  it("vide le tableau, avec ou sans le repère", () => {
    const drawn = run([
      { type: "axes", x: [-1, 5], y: [-3, 4] },
      { type: "point", id: "A", at: [1, 1] },
      { type: "note", text: "a" },
    ]);
    const cleared = applyAction(drawn, { type: "clear" }, t(100));
    expect(Object.values(cleared.nodes).every((node) => node.erased)).toBe(true);
    expect(cleared.calc).toEqual([]);
    expect(cleared.axes).not.toBeNull();
    const all = applyAction(drawn, { type: "clear", axes: true }, t(100));
    expect(all.axes).toBeNull();
    expect(all.axesCleared).toEqual(t(100));
  });

  it("résume le tableau pour le modèle, groupes et estompage compris", () => {
    const board = run([
      { type: "axes", x: [-1, 5], y: [-3, 4] },
      { type: "curve", id: "f", fn: "x^2" },
      { type: "note", id: "n1", text: "x = 2 ± √3" },
      { type: "point", id: "A", at: [1, 1] },
      { type: "group", id: "g", members: ["f", "A"] },
      { type: "dim", target: "f" },
    ]);
    expect(summarizeBoard(board)).toEqual([
      { id: "axes", type: "axes", detail: "x de -1 à 5, y de -3 à 4" },
      { id: "f", type: "curve", detail: "y = x^2 (estompé)" },
      { id: "n1", type: "note", detail: "x = 2 ± √3" },
      { id: "A", type: "point", detail: "(1, 1)" },
      { id: "g", type: "group", detail: "f, A" },
    ]);
  });
});

describe("séances de démonstration", () => {
  it("respectent le langage de scène et ne ciblent que des objets existants", () => {
    for (const lesson of DEMO_LESSONS) {
      const events = [lesson.header, ...lesson.steps.map((s) => ({ kind: "step", ...s })), lesson.end];
      for (const event of events) expect(ModelEvent.safeParse(event).success).toBe(true);

      let board = emptyBoard();
      for (const step of lesson.steps) {
        for (const action of step.do) {
          if ("target" in action) {
            expect(resolveTargets(board, action.target).length, `${lesson.header.title} : ${action.type} ${action.target}`).toBeGreaterThan(0);
          }
          board = applyAction(board, action, t(0));
        }
      }
    }
  });
});

describe("mouvements", () => {
  const vectors: Action[] = [
    { type: "axes", x: [-6, 6], y: [-4, 4] },
    { type: "vector", id: "v", from: [0, 0], by: [1, 2] },
    { type: "vector", id: "w", from: [0, 0], by: [3, -1] },
  ];

  it("enchaîne deux déplacements du même objet dans une étape (aller, puis retour)", () => {
    let board = run(vectors);
    board = applyAction(board, { type: "move", target: "v", by: [4, -1] }, t(100));
    board = applyAction(board, { type: "move", target: "v", by: [-4, 1] }, t(200));
    expect(board.nodes.v!.offset).toEqual([0, 0]);
    expect(board.nodes.v!.motions).toEqual([
      { from: [0, 0], to: [4, -1], start: 100, duration: 100 },
      { from: [4, -1], to: [0, 0], start: 200, duration: 100 },
    ]);
  });

  it("pose la queue d'un vecteur sur la pointe d'un autre, sans calcul (onto)", () => {
    const board = applyAction(run(vectors), { type: "move", target: "w", onto: "v" }, t(100));
    expect(position(board, "w")).toEqual([1, 2]);
    // Visée sur la queue : les deux vecteurs repartent du même point.
    const back = applyAction(board, { type: "move", target: "w", onto: "v", ontoPart: "tail" }, t(200));
    expect(position(back, "w")).toEqual([0, 0]);
  });

  it("détache une copie qui glisse, l'original reste en place", () => {
    const board = applyAction(run(vectors), { type: "copy", target: "w", id: "w2", onto: "v", color: "orange" }, t(100));
    expect(position(board, "w")).toEqual([0, 0]);
    expect(position(board, "w2")).toEqual([1, 2]);
    const copy = board.nodes.w2!;
    expect(copy.color).toBe("orange");
    expect(copy.reveal.start).toBe(100);
    expect(copy.motions).toEqual([{ from: [0, 0], to: [1, 2], start: 100, duration: 100 }]);
  });

  it("copie un groupe membre par membre, et nomme la copie comme un groupe", () => {
    let board = run([...vectors, { type: "group", id: "vw", members: ["v", "w"] }]);
    board = applyAction(board, { type: "copy", target: "vw", id: "c", by: [0, -3] }, t(100));
    expect(resolveTargets(board, "c")).toEqual(["c-v", "c-w"]);
    expect(position(board, "c-v")).toEqual([0, -3]);
  });

  it("une copie de ligne de calcul devient un texte libre", () => {
    let board = run([{ type: "note", id: "n1", text: "−2" }, { type: "point", id: "A", at: [2, 2] }]);
    board = applyAction(board, { type: "copy", target: "n1", id: "k", near: "A", side: "right" }, t(100));
    expect(text(board, "k").role).toBe("free");
    expect(board.calc).toEqual(["n1"]);
  });
});

describe("outils des notions poussées", () => {
  const close = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!));

  it("applique une matrice à tout le plan : quadrillage, vecteurs, polygones", () => {
    let board = run([
      { type: "axes", x: [-6, 6], y: [-4, 4] },
      { type: "grid", id: "g" },
      { type: "vector", id: "v", from: [0, 0], by: [-1, 2] },
      { type: "polygon", id: "sq", points: [[0, 0], [1, 0], [1, 1], [0, 1]] },
      { type: "segment", id: "span", from: [-3, 3], to: [3, -3] },
    ]);
    expect(board.order[0]).toBe("g"); // le quadrillage passe derrière
    board = applyAction(board, { type: "applyMatrix", matrix: [[1, 3], [-2, 0]], targets: ["g", "v", "sq"] }, t(100));
    const v = board.nodes.v!;
    if (v.type === "vector") close(v.to, [5, 2]);
    const g = board.nodes.g!;
    if (g.type === "grid") expect(g.matrix).toEqual([[1, 3], [-2, 0]]);
    const sq = board.nodes.sq!;
    if (sq.type === "polygon") close(sq.points[2]!, [4, -2]);
    expect(v.morph?.start).toBe(100);
    // Exclu des cibles : la droite reste en place.
    const span = board.nodes.span!;
    if (span.type === "segment") expect(span.to).toEqual([3, -3]);
  });

  it("un texte qui accompagne un objet le suit quand la matrice le déforme", () => {
    let board = run([
      { type: "axes", x: [-1, 6], y: [-1, 5] },
      { type: "polygon", id: "sq", points: [[0, 0], [1, 0], [1, 1], [0, 1]], fill: true },
      { type: "text", id: "u", text: "aire = 1", near: "sq", side: "above" },
    ]);
    const before = position(board, "u");
    board = applyAction(board, { type: "applyMatrix", matrix: [[3, 1], [0, 2]] }, t(100));
    expect(position(board, "u")[0]).toBeGreaterThan(before[0] + 2);
    expect(intersects(nodeBox(board.nodes.u!, board.frame), nodeBox(board.nodes.sq!, board.frame))).toBe(false);
  });

  it("transforme un polygone sommet par sommet (le carré devient rectangle)", () => {
    let board = run([{ type: "polygon", id: "sq", points: [[0, 0], [1, 0], [1, 1], [0, 1]] }]);
    board = applyAction(board, { type: "transform", target: "sq", points: [[0, 0], [3, 0], [3, 2], [0, 2]] }, t(100));
    const sq = board.nodes.sq!;
    if (sq.type === "polygon") expect(sq.points[2]).toEqual([3, 2]);
  });

  it("fait osciller un groupe autour d'un point : les rotations s'enchaînent", () => {
    let board = run([
      { type: "point", id: "O", at: [0, 2] },
      { type: "segment", id: "rope", from: [0, 2], to: [0, -2] },
      { type: "circle", id: "bob", center: [0, -2], radius: 0.3 },
      { type: "group", id: "pend", members: ["rope", "bob"] },
    ]);
    board = applyAction(board, { type: "rotate", target: "pend", about: "O", angle: 90 }, t(100));
    board = applyAction(board, { type: "rotate", target: "pend", about: "O", angle: -90 }, t(200));
    const rope = board.nodes.rope!;
    if (rope.type === "segment") close(rope.to, [0, -2]);
    expect(rope.spins?.map((s) => s.angle)).toEqual([90, -90]);
    const bob = board.nodes.bob!;
    if (bob.type === "circle") close(bob.center, [0, -2]);
  });

  it("colorie l'aire au-dessus et en dessous de l'axe en deux parties", () => {
    let board = run([{ type: "axes", x: [0, 6.3], y: [-2, 2] }, { type: "curve", id: "f", fn: "sin(x)" }]);
    board = applyAction(board, { type: "area", id: "A", of: "f", from: 0, to: 6.28 }, t(100));
    expect(resolveTargets(board, "A")).toEqual(["A-plus", "A-moins"]);
    const plus = board.nodes["A-plus"]!;
    if (plus.type === "polygon") expect(Math.max(...plus.points.map((p) => p[1]))).toBeCloseTo(1, 1);
  });

  it("décrit une courbe paramétrée au modèle par ses équations, pour qu'il puisse la transformer", () => {
    const board = run([{ type: "parametric", id: "c", x: "cos(t)", y: "sin(t)", t: [0, 6.28] }]);
    expect(summarizeBoard(board)[0]!.detail).toBe("courbe paramétrée x(t) = cos(t), y(t) = sin(t), t de 0 à 6.28");
  });

  it("calcule le centre de masse d'un enroulement et le déplace quand la fréquence change", () => {
    let board = run([{ type: "parametric", id: "w", x: "(1+sin(2*t))*cos(2*t)", y: "(1+sin(2*t))*sin(2*t)", t: [0, 6.2832], mass: true }]);
    const at = (b: BoardState) => position(b, "w-masse");
    // Enroulé à sa propre fréquence, le signal penche vers le haut : centre en (0 ; 0,5).
    expect(at(board)[0]).toBeCloseTo(0, 2);
    expect(at(board)[1]).toBeCloseTo(0.5, 2);
    board = applyAction(board, { type: "text", id: "lbl", text: "fréquence 2", near: "w-masse", side: "right" }, t(50));
    const label = position(board, "lbl");
    board = applyAction(board, { type: "transform", target: "w", x: "(1+sin(2*t))*cos(3*t)", y: "(1+sin(2*t))*sin(3*t)" }, t(100));
    expect(Math.hypot(...at(board))).toBeLessThan(0.02);
    // Le texte attaché au centre de masse le suit.
    expect(position(board, "lbl")[1]).toBeLessThan(label[1] - 0.3);
    expect(board.nodes["w-masse"]!.morph?.start).toBe(100);
  });

  it("déforme une courbe paramétrée en gardant le même nombre de points", () => {
    let board = run([{ type: "parametric", id: "c", x: "cos(t)", y: "sin(t)", t: [0, 6.28] }]);
    const before = board.nodes.c!;
    board = applyAction(board, { type: "transform", target: "c", x: "2*cos(t)" }, t(100));
    const after = board.nodes.c!;
    if (before.type === "polygon" && after.type === "polygon") {
      expect(after.points).toHaveLength(before.points.length);
      close(after.points[0]!, [2, 0]);
    }
  });

  it("écrit une matrice en colonnes, à côté d'un objet, sans le chevaucher", () => {
    const board = run([
      { type: "axes", x: [-6, 6], y: [-4, 4] },
      { type: "vector", id: "v", from: [0, 0], by: [2, 1] },
      { type: "matrix", id: "M", rows: [["2", "1"], ["1", "3"]], near: "v", side: "right" },
    ]);
    const m = text(board, "M");
    expect(m.rows).toEqual([["2", "1"], ["1", "3"]]);
    expect(intersects(nodeBox(m, board.frame), nodeBox(board.nodes.v!, board.frame))).toBe(false);
    expect(nodeBox(m, board.frame).y1 - nodeBox(m, board.frame).y0).toBeGreaterThan(0.8);
  });

  it("place les étiquettes de deux courbes qui finissent au même endroit sans les superposer", () => {
    const board = run([
      { type: "axes", x: [0, 6.3], y: [-3, 3] },
      { type: "curve", id: "a", fn: "sin(x)", from: 0, to: 6.28, label: "note grave" },
      { type: "curve", id: "s", fn: "sin(x)+0.8*sin(3*x)", from: 0, to: 6.28, label: "signal total" },
    ]);
    const a = board.nodes.a!;
    const s = board.nodes.s!;
    if (a.type === "curve" && s.type === "curve") {
      expect(a.labelAt).toBeDefined();
      expect(s.labelAt).toBeDefined();
      expect(Math.hypot(a.labelAt![0] - s.labelAt![0], a.labelAt![1] - s.labelAt![1])).toBeGreaterThan(0.3);
    }
  });
});
