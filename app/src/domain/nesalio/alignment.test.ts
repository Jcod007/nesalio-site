import { describe, expect, it } from "vitest";
import { alignBeatCues, cueOffset } from "./alignment";

/** Fake provider alignment: one character every 50 ms, as ElevenLabs reports them. */
function evenAlignment(say: string) {
  const characters = [...say];
  return {
    characters,
    characterStartTimesSeconds: characters.map((_, i) => i * 0.05),
    characterEndTimesSeconds: characters.map((_, i) => (i + 1) * 0.05),
  };
}

describe("cueOffset", () => {
  it("ne retient que des mots entiers", () => {
    const say = "Prenons un triangle rectangle. Appelons ses côtés a, b et c.";
    expect(cueOffset(say, "a", 1)).toBe(say.indexOf("a,"));
    expect(cueOffset(say, "b", 1)).toBe(say.indexOf("b et"));
    expect(cueOffset(say, "angle", 1)).toBe(-1);
  });

  it("compte les occurrences parmi les mots entiers", () => {
    const say = "Vingt-cinq moins cinq, puis encore cinq.";
    expect(cueOffset(say, "cinq", 1)).toBe(say.indexOf("cinq,"));
    expect(cueOffset(say, "cinq", 2)).toBe(say.lastIndexOf("cinq"));
    expect(cueOffset(say, "cinq", 3)).toBe(-1);
    expect(cueOffset(say, "Vingt-cinq", 1)).toBe(0);
  });

  it("traite l'apostrophe droite ou courbe comme une frontière", () => {
    expect(cueOffset("Regardons l'hypoténuse.", "hypoténuse", 1)).toBe(12);
    expect(cueOffset("Regardons l’hypoténuse.", "hypoténuse", 1)).toBe(12);
    expect(cueOffset("Regardons l'hypoténuse.", "l'hypoténuse", 1)).toBe(10);
  });

  it("garde les nombres décimaux et les exposants entiers", () => {
    expect(cueOffset("π vaut environ 3,14.", "3", 1)).toBe(-1);
    expect(cueOffset("π vaut environ 3,14.", "3,14", 1)).toBe(15);
    expect(cueOffset("On a 3, puis 4.", "3", 1)).toBe(5);
    expect(cueOffset("f(x) = x².", "x", 1)).toBe(2);
    expect(cueOffset("f(x) = x².", "x", 2)).toBe(-1);
    expect(cueOffset("f(x) = x².", "x²", 1)).toBe(7);
  });

  it("accepte les repères bordés de symboles", () => {
    const say = "Trace (AB), la pente −2 et 50 %.";
    expect(cueOffset(say, "(AB)", 1)).toBe(6);
    expect(cueOffset(say, "AB", 1)).toBe(7);
    expect(cueOffset(say, "−2", 1)).toBe(say.indexOf("−2"));
    expect(cueOffset(say, "50 %", 1)).toBe(say.indexOf("50 %"));
  });

  it("gère les lettres hors du plan de base", () => {
    expect(cueOffset("Soit 𝑥 et 𝑥𝑦.", "𝑥", 1)).toBe(5);
    expect(cueOffset("Soit 𝑥 et 𝑥𝑦.", "𝑥", 2)).toBe(-1);
  });
});

describe("alignBeatCues", () => {
  it("donne à la lettre a et à la lettre b leurs propres heures, dans l'ordre", () => {
    const say = "Prenons un triangle rectangle. Appelons ses côtés a, b et c.";
    const timings = alignBeatCues({
      say,
      cues: [{ id: "sides", text: "côtés" }, { id: "a", text: "a" }, { id: "b", text: "b" }],
    }, evenAlignment(say));
    const at = (index: number) => Math.round(index * 50);
    expect(timings.get("a")).toEqual({ start: at(say.indexOf("a,")), end: at(say.indexOf("a,") + 1) });
    expect(timings.get("b")).toEqual({ start: at(say.indexOf("b et")), end: at(say.indexOf("b et") + 1) });
    expect(timings.get("sides")!.start).toBeLessThan(timings.get("a")!.start);
    expect(timings.get("a")!.start).toBeLessThan(timings.get("b")!.start);
  });

  it("ne renvoie rien si le texte horodaté diffère de la narration", () => {
    const timings = alignBeatCues({ say: "Voici a.", cues: [{ id: "a", text: "a" }] }, evenAlignment("Voici b."));
    expect(timings.size).toBe(0);
  });
});
