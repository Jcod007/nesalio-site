import { describe, expect, it } from "vitest";
import { emptyBoard, resolveTargets, type ArcNode, type PolygonNode, type SegmentNode, type VectorNode } from "@/domain/board/state";
import { solveRightTriangle } from "@/domain/board/shapes";
import { collisions } from "@/domain/board/collisions";
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

  it("redemander le plan avec un autre angle le fait pivoter sous les yeux de l'élève (forces comprises)", () => {
    let board = applyAction(emptyBoard(), { type: "incline", id: "plan", angle: 30, length: 4, at: [0, 0], components: true, normal: true }, t);
    const later = { start: 5000, duration: 1000 };
    // L'IA ne redit pas "normal" : la normale déjà au tableau doit suivre le nouvel angle, pas rester à 30°.
    board = applyAction(board, { type: "incline", id: "plan", angle: 60, length: 4, at: [0, 0], components: true }, later);
    const slope = board.nodes["plan-pente"] as PolygonNode;
    close(slope.points[2]!, [4 * Math.cos(Math.PI / 3), 4 * Math.sin(Math.PI / 3)]);
    expect(slope.morph).toEqual(later);
    const P = board.nodes["plan-P"] as VectorNode;
    const Px = board.nodes["plan-Px"] as VectorNode;
    const N = board.nodes["plan-N"] as VectorNode;
    const length = (v: VectorNode) => Math.hypot(v.to[0] - v.from[0], v.to[1] - v.from[1]);
    expect(length(Px)).toBeCloseTo(length(P) * Math.sin(Math.PI / 3), 6);
    expect(length(N)).toBeCloseTo(length(P) * 0.5, 6);
    expect(Px.morph).toEqual(later);
    // Ce qui n'a pas changé (le poids reste vertical, même longueur) n'est pas rejoué.
    expect((board.nodes["plan-angle"] as ArcNode).end - (board.nodes["plan-angle"] as ArcNode).start).toBeCloseTo(60, 6);
  });

  it("garde la pointe du poids au-dessus du sol, pour que P et son nom ne tombent pas sur la ligne du sol", () => {
    for (const angle of [15, 30, 45, 60]) {
      const board = applyAction(emptyBoard(), { type: "incline", id: "plan", angle, length: 4, at: [0, 0] }, t);
      const P = board.nodes["plan-P"] as VectorNode;
      const height = P.from[1]; // le sol est à y = 0
      expect(P.to[1]).toBeGreaterThan(height * 0.2);
    }
  });

  it("marque sur demande l'angle θ entre le poids et P⊥ (le même que celui du plan)", () => {
    const board = applyAction(emptyBoard(), { type: "incline", id: "plan", angle: 30, length: 4, at: [0, 0], components: true, weightAngle: true }, t);
    const arc = board.nodes["plan-angleP"] as ArcNode;
    expect(arc.end - arc.start).toBeCloseTo(30, 6);
    const P = board.nodes["plan-P"] as VectorNode;
    close(arc.center, P.from);
    expect(arc.label).toBe("θ");
    expect(resolveTargets(board, "plan")).toContain("plan-angleP");
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

describe("géométrie des séances du 19 octobre", () => {
  it("trace la hauteur issue de l'angle droit, exactement perpendiculaire à l'hypoténuse", () => {
    // Séance observée : la « hauteur » tombait à la verticale sur la base, pas sur l'hypoténuse.
    const board = applyAction(
      emptyBoard(),
      { type: "triangle", id: "tri", base: 4, height: 3, at: [0, 0], names: ["A", "B", "C"], altitude: { from: "B", label: "h", parts: ["m", "n"] } },
      t,
    );
    const h = board.nodes["tri-hauteur"] as SegmentNode;
    // A(0,0), B(4,0), C(4,3) : le pied de la hauteur issue de B sur AC est (2,56 ; 1,92).
    close([...h.from, ...h.to], [4, 0, 2.56, 1.92]);
    const along = [4, 3];
    const dir = [h.to[0] - h.from[0], h.to[1] - h.from[1]];
    expect(dir[0]! * along[0]! + dir[1]! * along[1]!).toBeCloseTo(0, 9);
    // Les morceaux de l'hypoténuse : AH = 3,2 (16/5) et HC = 1,8 (9/5).
    const p1 = board.nodes["tri-proj1"] as SegmentNode;
    const p2 = board.nodes["tri-proj2"] as SegmentNode;
    expect(Math.hypot(p1.to[0] - p1.from[0], p1.to[1] - p1.from[1])).toBeCloseTo(3.2, 9);
    expect(Math.hypot(p2.to[0] - p2.from[0], p2.to[1] - p2.from[1])).toBeCloseTo(1.8, 9);
    expect(board.nodes["tri-proj1-l"]).toMatchObject({ type: "text", text: "m" });
    expect(board.nodes["tri-H"]).toMatchObject({ type: "text", text: "H" });
    expect(board.nodes["tri-hauteur-l"]).toMatchObject({ type: "text", text: "h" });
    expect(board.nodes["tri-pied"]).toMatchObject({ type: "polygon", closed: false });
  });

  it("prolonge le côté quand le pied de la hauteur tombe en dehors (triangle obtus)", () => {
    const board = applyAction(emptyBoard(), { type: "triangle", id: "tri", points: [[0, 0], [2, 0], [4, 2]], altitude: "C" }, t);
    const h = board.nodes["tri-hauteur"] as SegmentNode;
    close([...h.from, ...h.to], [4, 2, 4, 0]);
    expect(board.nodes["tri-prolongement"]).toMatchObject({ type: "segment", dashed: true });
  });

  it("vise les sommets d'un triangle par leur nom, même sans points nommés", () => {
    // Séance observée : angle "at":"A" sur un triangle donné par ses points ne dessinait rien.
    let board = applyAction(emptyBoard(), { type: "triangle", id: "tri", points: [[0, 0], [5, 0], [1.5, 3]] }, t);
    board = applyAction(board, { type: "angle", id: "a1", at: "A", from: "B", to: "C", label: "1" }, t);
    expect((board.nodes["a1"] as ArcNode).center).toEqual([0, 0]);
    board = applyAction(board, { type: "triangle", id: "r", base: 4, height: 3, at: [10, 0], names: ["P", "Q", "R"], altitude: "Q" }, t);
    board = applyAction(board, { type: "segment", id: "s", from: "P", to: "H" }, t);
    close([...(board.nodes["s"] as SegmentNode).from, ...(board.nodes["s"] as SegmentNode).to], [10, 0, 12.56, 1.92]);
    // Le triangle déplacé : ses sommets suivent.
    board = applyAction(board, { type: "move", target: "tri", by: [1, 1] }, t);
    board = applyAction(board, { type: "angle", id: "a2", at: "A", from: "B", to: "C" }, t);
    expect((board.nodes["a2"] as ArcNode).center).toEqual([1, 1]);
  });

  it("écrit « 90° » sur l'angle droit, pas sur l'angle aigu", () => {
    const board = applyAction(emptyBoard(), { type: "triangle", id: "tri", base: 4, height: 3, angleLabel: "90°" }, t);
    expect((board.nodes["tri-droit"] as PolygonNode).label).toBe("90°");
    expect(board.nodes["tri-angle"]).toBeUndefined();
  });

  it("copie sur place quand aucune destination n'est donnée", () => {
    // Séance observée : la copie refusée laissait « 90° » écrit à côté de rien.
    let board = applyAction(emptyBoard(), { type: "segment", id: "r", from: [0, 0], to: [5, 0] }, t);
    expect(Action.safeParse({ type: "copy", target: "r", id: "r2" }).success).toBe(true);
    board = applyAction(board, { type: "copy", target: "r", id: "r2" }, t);
    board = applyAction(board, { type: "rotate", target: "r2", about: [0, 0], angle: 90 }, t);
    expect(board.nodes["r2"]).toBeDefined();
    expect(board.nodes["r2"]!.spins?.length).toBe(1);
  });
});

describe("tableau sans repère (séances du 19 octobre)", () => {
  it("agrandit le cadre pour une grande figure, sans repère : le texte reste lisible", () => {
    let board = applyAction(emptyBoard(), { type: "triangle", id: "tri", base: 6, height: 8, at: [0, 0], names: ["A", "B", "C"], sides: { base: "6", height: "8" } }, t);
    expect(board.frame.y[1]).toBeGreaterThan(8);
    board = applyAction(board, { type: "triangle", id: "tri", base: 6, height: 8, names: ["A", "B", "C"], squares: { base: "36", height: "64", hyp: "?" } }, t);
    // Les carrés débordent de partout : le cadre les contient tous.
    const hyp = board.nodes["tri-carre-hyp"] as PolygonNode;
    for (const [x, y] of hyp.points) {
      expect(x).toBeGreaterThanOrEqual(board.frame.x[0]);
      expect(x).toBeLessThanOrEqual(board.frame.x[1]);
      expect(y).toBeGreaterThanOrEqual(board.frame.y[0]);
      expect(y).toBeLessThanOrEqual(board.frame.y[1]);
    }
    // "clear" remet le cadre par défaut.
    board = applyAction(board, { type: "clear" }, t);
    expect(board.frame).toEqual(emptyBoard().frame);
  });

  it("ne touche pas au cadre d'un repère", () => {
    let board = applyAction(emptyBoard(), { type: "axes", x: [-2, 2], y: [-2, 2] }, t);
    board = applyAction(board, { type: "circle", id: "c", center: [0, 0], radius: 5 }, t);
    expect(board.frame.x).toEqual([-2, 2]);
  });

  it("pose à côté un exemple dessiné par-dessus la figure", () => {
    // Séance observée : un carré de côté 3 tombé sur le carré de l'hypoténuse.
    let board = applyAction(emptyBoard(), { type: "triangle", id: "tri", base: 6, height: 8, at: [0, 0], squares: { base: "36", height: "64", hyp: "100" } }, t);
    board = applyAction(board, { type: "polygon", id: "sq3", points: [[-6, -3], [-3, -3], [-3, 0], [-6, 0]], label: "9" }, t);
    expect(collisions(board).filter((c) => c.kind === "dessins")).toEqual([]);
    // Il grandit plus tard avec les coordonnées du modèle : il reste à l'écart.
    board = applyAction(board, { type: "transform", target: "sq3", points: [[-8, -5], [-3, -5], [-3, 0], [-8, 0]] }, t);
    expect(collisions(board).filter((c) => c.kind === "dessins")).toEqual([]);
    // Une partie coloriée dans la figure, elle, reste où elle est.
    board = applyAction(board, { type: "polygon", id: "part", points: [[0, 0], [3, 0], [3, 4]], fill: true }, t);
    expect((board.nodes["part"] as PolygonNode).points[0]).toEqual([0, 0]);
  });

  it("efface une figure sans repère quand un premier repère arrive, garde les calculs", () => {
    let board = applyAction(emptyBoard(), { type: "polygon", id: "para", points: [[4, 2], [10, 2], [12, -2], [6, -2]] }, t);
    board = applyAction(board, { type: "note", id: "n", text: "aire = 24" }, t);
    board = applyAction(board, { type: "axes", x: [-1, 11], y: [-1, 7] }, t);
    expect(board.nodes["para"]!.erased).toBeDefined();
    expect(board.nodes["n"]!.erased).toBeUndefined();
  });

  it("dessine un secteur de disque (et pas un triangle) et un cylindre en perspective", () => {
    let board = applyAction(emptyBoard(), { type: "sector", id: "s", center: [0, 0], radius: 5, from: 0, to: 60, label: "60°", arcLabel: "≈ 5,2" }, t);
    const arc = board.nodes["s-arc"] as PolygonNode;
    for (const [x, y] of arc.points) expect(Math.hypot(x, y)).toBeCloseTo(5, 9);
    expect(resolveTargets(board, "s")).toEqual(expect.arrayContaining(["s-surface", "s-arc", "s-r1", "s-r2", "s-arc-l"]));
    board = applyAction(board, { type: "rotate", target: "s", about: [0, 0], angle: 60 }, t);
    expect(board.nodes["s-surface"]!.spins?.length).toBe(1);

    board = applyAction(emptyBoard(), { type: "cylinder", id: "cyl", radius: 2, height: 3, slices: 4, labels: { radius: "r", height: "h" } }, t);
    expect(resolveTargets(board, "cyl-tranches")).toEqual(["cyl-tranche-1", "cyl-tranche-2", "cyl-tranche-3"]);
    const left = board.nodes["cyl-gauche"] as SegmentNode;
    expect(left.to[1] - left.from[1]).toBeCloseTo(3, 9);
    expect(board.nodes["cyl-rayon-l"]).toMatchObject({ type: "text", text: "r" });
  });
});
