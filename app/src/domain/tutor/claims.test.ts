import { describe, expect, it } from "vitest";
import { emptyBoard, type BoardState } from "@/domain/board/state";
import { applyAction } from "@/domain/scene/commands";
import { Action, type Step } from "@/domain/scene/schema";
import { boardAfter, claimNotes, verifyStep, verifyText } from "./claims";

const t = { start: 0, duration: 0 };
const play = (board: BoardState, raw: unknown) => {
  const parsed = Action.safeParse(raw);
  expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  return applyAction(board, parsed.data!, t);
};

/** Configuration de Thalès : triangle ABC, D au milieu de [CA], E au milieu de [CB], donc (DE) // (AB). */
function thales(): BoardState {
  let board = play(emptyBoard(), { type: "triangle", id: "tri", points: [[0, 0], [4, 0], [2, 4]], names: ["A", "B", "C"] });
  board = play(board, { type: "point", id: "D", at: [1, 2], label: "D" });
  board = play(board, { type: "point", id: "p2", at: [3, 2], label: "E" });
  return board;
}
const claims = (text: string) => verifyText(thales(), text, "phrase").map((i) => i.claim);

describe("vérificateur géométrique : ce que Nesa affirme, recalculé sur la figure", () => {
  it.each([
    "Les rapports CD/CA = CE/CB = DE/AB.",
    "$\\frac{CD}{CA} = \\frac{CE}{CB} = \\frac{DE}{AB} = \\frac{1}{2}$",
    "CD sur CA égale CE sur CB.",
    "Ici \\frac{CD}{CA} = 0{,}5.",
    "Le triangle CDE est une réduction de CAB : même forme.",
    "Les triangles CDE et CAB ont les mêmes angles.",
    "DE est parallèle à AB.",
    "(DE) // (AB)",
  ])("vrai sur la figure, rien à signaler : %s", (text) => {
    expect(claims(text)).toEqual([]);
  });

  it.each([
    // Séance « Démontre-moi le théorème de Thalès » du 21 octobre : E est sur [CB], pas sur [AB].
    ["Thalès dit que les rapports AD sur AC et AE sur AB sont égaux.", "AD/AC = AE/AB"],
    ["Mais AE sur AB garde le même rapport que CD sur CA.", "AE/AB = CD/CA"],
    ["$\\frac{CD}{CA} = 0{,}4$", "CD/CA = 0,4"],
    ["Le triangle A D E est une réduction de A C B : même forme.", "ADE semblable à ACB"],
    ["Parce que DE est parallèle à AB : les triangles ADE et ABC ont les mêmes angles", "ADE semblable à ABC"],
    ["DE est parallèle à AC.", "(DE) // (AC)"],
  ])("faux sur la figure, signalé : %s", (text, claim) => {
    expect(claims(text)).toContain(claim);
  });

  it("dit ce que mesure la figure", () => {
    const [issue] = verifyText(thales(), "AD/AC = AE/AB", "phrase");
    expect(issue!.measured).toMatch(/AD\/AC ≈ 0,5 ; AE\/AB ≈ 0,9/);
  });

  it.each([
    "Si D était au tiers de CA, CD/CA = 1/3 et DE/AB = 1/3.",
    "Imagine que AD/AC = AE/AB.",
    "Attention, AD/AC n'est pas égal à AE/AB.",
    "Autre triangle, autres nombres : CD/CA = 0,4.",
    "XY/ZW = PQ/RS",
    "CD vaut 3 et CA vaut 7,5.",
  ])("ignoré (hypothèse, négation, autre exemple, points absents, pas d'égalité) : %s", (text) => {
    expect(claims(text)).toEqual([]);
  });

  it("lit la phrase, les lignes de calcul, les textes, la question et sa bonne réponse ; pas les mauvais choix", () => {
    const step: Step = {
      say: "Thalès dit que AD/AC = AE/AB.",
      do: [
        { type: "note", text: "$\\frac{CD}{CA} = \\frac{CE}{CB}$" },
        { type: "note", text: "$\\frac{AE}{AB} = \\frac{CD}{CA}$" },
      ],
      check: {
        prompt: "D'où vient AD/AC = AE/AB ?",
        choices: ["Les triangles ADE et ABC ont les mêmes angles", "Les triangles CDE et CAB ont les mêmes angles"],
        answer: 0,
      },
    } as Step;
    const board = boardAfter(thales(), step, (b, a) => applyAction(b, a, t));
    const issues = verifyStep(step, board);
    // La phrase et la question disent la même chose : comptée une fois.
    expect(issues.map((i) => [i.source, i.claim, i.action])).toEqual([
      ["phrase", "AD/AC = AE/AB", undefined],
      ["calcul", "AE/AB = CD/CA", 1],
      ["réponse", "ADE semblable à ABC", undefined],
    ]);
    expect(claimNotes(issues)[0]).toMatch(/Affirmation fausse.*AD\/AC = AE\/AB.*Corrige-toi/);
  });

  it("les repères {id} de la phrase ne gênent pas la lecture", () => {
    expect(claims("Le petit triangle {CDE} est une réduction de {CAB}.")).toEqual([]);
    expect(claims("Le triangle {ADE} est une réduction de ACB.")).toEqual(["ADE semblable à ACB"]);
  });
});
