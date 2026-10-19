import { describe, expect, it } from "vitest";
import { emptyBoard } from "@/domain/board/state";
import { applyAction } from "@/domain/scene/commands";
import { ModelEvent } from "@/domain/scene/schema";
import { buildMessages, buildSystemPrompt } from "./prompt";

describe("consigne du modèle", () => {
  it("ne montre que des exemples valides, qui produisent bien le geste annoncé", () => {
    const lines = buildSystemPrompt()
      .split("\n")
      .filter((line) => line.startsWith('{"kind":'));
    expect(lines.length).toBeGreaterThan(10);
    for (const line of lines) expect(ModelEvent.safeParse(JSON.parse(line)).success, line).toBe(true);

    // L'exemple de geste : la copie de w finit au bout de v.
    const gesture = lines.filter((line) => line.includes('"w2"') || line.includes('"id":"v"'));
    let board = emptyBoard();
    for (const line of gesture) {
      const event = ModelEvent.parse(JSON.parse(line));
      if (event.kind !== "step") continue;
      for (const action of event.do ?? []) board = applyAction(board, action, { start: 0, duration: 0 });
    }
    expect(board.nodes.w2?.offset).toEqual([1, 2]);
  });
});

describe("mémoire de la séance", () => {
  it("rend au modèle les objectifs, les réponses passées, l'erreur visée et la relecture du tour", async () => {
    const { buildMessages } = await import("./prompt");
    const [, user] = buildMessages({
      mode: "continue",
      question: "C'est quoi la transformée de Fourier ?",
      context: {
        spoken: ["Voici un signal."],
        board: [],
        answered: 2,
        goals: ["Une onde = fréquence et amplitude", "L'enroulement et le pic de fréquence"],
        answers: [{ prompt: "Que fait-on ?", picked: "La pente", correct: false, misconception: "confond pente et fréquence" }],
        review: ["Tu as dit « les bosses s'annulent » sans le montrer."],
      },
      answer: { prompt: "Quelle onde ?", choices: ["a", "b"], picked: "a", correct: false, misconception: "confond hauteur et fréquence" },
    });
    const text = user!.content;
    expect(text).toContain("L'enroulement et le pic de fréquence");
    expect(text).toContain("erreur visée : confond pente et fréquence");
    expect(text).toContain("Erreur visée par ce choix (prévue quand tu as écrit la question) : confond hauteur et fréquence");
    expect(text).toContain("Retour sur ton tour précédent");
  });
});

describe("consignes tirées des séances enregistrées", () => {
  it("refuse la biologie, sépare un nouveau sujet, gère les au revoir et nomme les axes", () => {
    const system = buildMessages({ mode: "question", question: "?" })[0]!.content;
    expect(system).toMatch(/biologie n'est pas couverte/);
    expect(system).toMatch(/"xLabel"/);
    expect(system).toMatch(/N'efface pas ce que l'élève/);
    const followUp = buildMessages({
      mode: "followUp",
      question: "Et les atomes ?",
      context: { spoken: [], board: [], goals: ["La mitose"] },
    } as never)[1]!.content;
    expect(followUp).toMatch(/CHANGE DE SUJET/);
    expect(followUp).toMatch(/au revoir/);
  });
});
