import { describe, expect, it } from "vitest";
import { emptyBoard, resolveTargets, visibleNodes, type BoardState } from "@/domain/board/state";
import { applyAction } from "@/domain/scene/commands";
import { ModelEvent } from "@/domain/scene/schema";
import { buildSystemPrompt } from "../prompt";

/** Joue des lignes telles que le modèle les écrirait, après la même validation que le serveur. */
function play(lines: object[], board: BoardState = emptyBoard()): BoardState {
  let next = board;
  lines.forEach((line, i) => {
    const event = ModelEvent.parse(line);
    if (event.kind !== "step") return;
    for (const action of event.do ?? []) next = applyAction(next, action, { start: i * 3000, duration: 1500 });
  });
  return next;
}

describe("SN 4, 1re étape : consignes", () => {
  it("la consigne donne les méthodes de la classe et la commande de partie entière", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("PRODUIT-SOMME");
    expect(prompt).toContain("mise en évidence double");
    expect(prompt).toContain("RESTRICTIONS avant de simplifier");
    expect(prompt).toContain("dividende = diviseur × quotient + reste");
    expect(prompt).toContain('{"type":"stepFunction"');
    expect(prompt).toContain("f(x) = a[b(x − h)] + k");
    expect(prompt).toContain('"open":true = point vide');
    expect(prompt).toContain('{"type":"areaModel"');
  });

  it("modèle d'aire : (x + 2)(x + 3), les produits sont calculés par le moteur et écrits dans les pièces", () => {
    const board = play([{ kind: "step", say: "Le rectangle x plus 2 sur x plus 3 {am}.", mood: "dessine", do: [{ type: "areaModel", id: "am", rows: ["x", "2"], cols: ["x", "3"] }] }]);
    const text = (id: string) => (board.nodes[id] as { text?: string; label?: string } | undefined)?.text ?? (board.nodes[id] as { label?: string } | undefined)?.label;
    expect([text("am-p00"), text("am-p01"), text("am-p10"), text("am-p11")]).toEqual(["x²", "3x", "2x", "6"]);
    expect([text("am-r0"), text("am-r1"), text("am-c0"), text("am-c1")]).toEqual(["x", "2", "x", "3"]);
    // Chaque produit est DANS sa pièce.
    const piece = board.nodes["am-p11"] as { points: number[][] };
    const at = (board.nodes["am-p11"] as { labelAt: number[] }).labelAt;
    const xs = piece.points.map((p) => p[0]!);
    const ys = piece.points.map((p) => p[1]!);
    expect(at[0]! > Math.min(...xs) && at[0]! < Math.max(...xs) && at[1]! > Math.min(...ys) && at[1]! < Math.max(...ys)).toBe(true);
  });

  it("modèle d'aire : signes et coefficients (x + 4)(3x − 2), puis complétion du carré", () => {
    const board = play([{ kind: "step", say: "Les pièces {am}.", mood: "dessine", do: [{ type: "areaModel", id: "am", rows: ["x", "4"], cols: ["3x", "−2"] }] }]);
    const text = (id: string) => (board.nodes[id] as { label?: string } | undefined)?.label;
    expect([text("am-p00"), text("am-p01"), text("am-p10"), text("am-p11")]).toEqual(["3x²", "−2x", "12x", "−8"]);
    let square = play([{ kind: "step", say: "Il manque un coin {c}.", mood: "question", do: [{ type: "areaModel", id: "c", rows: ["x", "3"], cols: ["x", "3"], empty: [[1, 1]] }] }]);
    expect((square.nodes["c-p11"] as { label: string; dashed?: boolean })).toMatchObject({ label: "?", dashed: true });
    square = play([{ kind: "step", say: "Le coin vaut 9 {c}.", mood: "idee", do: [{ type: "areaModel", id: "c", rows: ["x", "3"], cols: ["x", "3"] }] }], square);
    expect(square.nodes["c-p11"]).toMatchObject({ label: "9", fill: true });
  });

  it("une séance de partie entière : l'escalier, puis k qui change, puis b négatif", () => {
    let board = play([
      { kind: "step", say: "Voici f de x égale partie entière de x {f}.", mood: "dessine", do: [{ type: "stepFunction", id: "f", from: -3, to: 3, rule: true }] },
    ]);
    const steps = () => resolveTargets(board, "f").filter((id) => id.startsWith("f-m"));
    expect(steps().length).toBe(6);
    board = play([{ kind: "step", say: "Avec k égale 2, l'escalier {f} monte.", mood: "explique", do: [{ type: "stepFunction", id: "f", k: 2, from: -3, to: 3 }] }], board);
    expect(board.groups["f"]?.rule).toBe("escalier f(x) = [x] + 2");
    board = play([{ kind: "step", say: "Avec b négatif {f}, les points pleins passent à droite.", mood: "idee", do: [{ type: "stepFunction", id: "f", b: -1, k: 2, from: -3, to: 3 }] }], board);
    const full = visibleNodes(board).filter((n) => n.type === "point" && !n.open && n.id.startsWith("f-p"));
    const empty = visibleNodes(board).filter((n) => n.type === "point" && n.open);
    // b < 0 : chaque marche a son point plein à sa droite.
    for (const p of full) if (p.type === "point") expect(empty.some((e) => e.type === "point" && e.at[1] === p.at[1] && e.at[0] < p.at[0])).toBe(true);
  });

  it("les noms que les modèles emploient pour la partie entière mènent à stepFunction", async () => {
    const { ACTION_ALIASES } = await import("@/domain/scene/commands");
    expect(ACTION_ALIASES["partieentiere"]).toBe("stepFunction");
    expect(ACTION_ALIASES["floor"]).toBe("stepFunction");
  });
});
