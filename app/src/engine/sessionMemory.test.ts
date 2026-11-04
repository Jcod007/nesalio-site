import { describe, expect, it } from "vitest";
import { SessionMemory } from "./sessionMemory";

const base = { title: "Pythagore", originalQuestion: "c'est quoi Pythagore ?", board: [], interrupted: false };

describe("SessionMemory", () => {
  it("ne garde que les 16 dernières phrases, et en rend 12 au modèle", () => {
    const memory = new SessionMemory();
    for (let i = 1; i <= 20; i++) memory.remember(`phrase ${i}`);
    expect(memory.recent(100)).toHaveLength(16);
    expect(memory.recent(1)).toEqual(["phrase 20"]);
    expect(memory.context(base).spoken).toEqual(Array.from({ length: 12 }, (_, i) => `phrase ${i + 9}`));
  });

  it("coupe les phrases trop longues", () => {
    const memory = new SessionMemory();
    memory.remember("x".repeat(1000));
    expect(memory.recent(1)[0]).toHaveLength(320);
  });

  it("sans objectifs ni réponses, ne les envoie pas", () => {
    const context = new SessionMemory().context(base);
    expect(context.goals).toBeUndefined();
    expect(context.answers).toBeUndefined();
    expect(context.diagnosis).toBeUndefined();
    expect(context.answered).toBe(0);
  });

  it("garde 4 objectifs et en propose 3 en bilan de repli", () => {
    const memory = new SessionMemory();
    memory.setGoals(["a", "b", "c", "d", "e"]);
    expect(memory.context(base).goals).toEqual(["a", "b", "c", "d"]);
    expect(memory.summaryFallback()).toEqual(["a", "b", "c"]);
  });

  it("garde les 8 dernières réponses, coupées, sans les choix", () => {
    const memory = new SessionMemory();
    for (let i = 1; i <= 10; i++) {
      memory.logAnswer({ prompt: `q${i}`, choices: ["1", "2"], picked: "y".repeat(400), correct: true });
      memory.countAnswer();
    }
    const context = memory.context(base);
    expect(context.answered).toBe(10);
    expect(context.answers).toHaveLength(8);
    expect(context.answers![0]!.prompt).toBe("q3");
    expect(context.answers![0]!.picked).toHaveLength(300);
    expect(context.answers![0]).not.toHaveProperty("choices");
  });

  it("reset efface tout", () => {
    const memory = new SessionMemory();
    memory.remember("bonjour");
    memory.setGoals(["a"]);
    memory.countAnswer();
    memory.reset();
    expect(memory.context(base)).toMatchObject({ spoken: [], answered: 0, goals: undefined });
  });
});
