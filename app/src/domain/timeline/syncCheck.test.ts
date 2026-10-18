import { describe, expect, it } from "vitest";
import { extractCues } from "@/domain/tutor/cues";
import { alignWords, measureCues, spokenWeight, summarizeSync, tokenize, type HeardWord } from "./syncCheck";

describe("tokenize", () => {
  it("garde les mots, les nombres et les élisions avec leur position", () => {
    expect(tokenize("Le sommet de l'axe : 2,5 m.")).toEqual([
      { text: "Le", start: 0 },
      { text: "sommet", start: 3 },
      { text: "de", start: 10 },
      { text: "l'axe", start: 13 },
      { text: "2,5", start: 21 },
      { text: "m", start: 25 },
    ]);
  });
});

describe("spokenWeight", () => {
  it("pèse un nombre écrit en chiffres comme sa forme prononcée", () => {
    expect(spokenWeight("20")).toBe(spokenWeight("vingt"));
    expect(spokenWeight("1,73")).toBe(spokenWeight("un virgule soixante-treize"));
    const digits = spokenWeight("37°");
    const spoken = spokenWeight("trente-sept degrés");
    expect(digits).toBeGreaterThan(spoken * 0.7);
    expect(digits).toBeLessThan(spoken * 1.3);
  });

  it("compte une pause pour la ponctuation", () => {
    expect(spokenWeight("un, deux")).toBeGreaterThan(spokenWeight("un deux"));
  });

  it("donne au moins une syllabe à chaque mot", () => {
    expect(spokenWeight("x y z")).toBeGreaterThanOrEqual(3);
  });
});

describe("alignWords", () => {
  it("retrouve chaque mot prévu malgré une substitution et un mot en trop", () => {
    const expected = ["la", "pente", "vaut", "20", "ici"];
    const heard = ["la", "pente", "euh", "vaut", "vingt", "ici"];
    expect(alignWords(expected, heard)).toEqual([0, 1, 3, 4, 5]);
  });

  it("ignore les accents, la casse et la ponctuation", () => {
    expect(alignWords(["Égale", "zéro"], ["egale", "zero."])).toEqual([0, 1]);
  });

  it("renvoie null pour un mot prévu qui n'a pas été entendu", () => {
    expect(alignWords(["a", "b", "c"], ["a", "c"])).toEqual([0, null, 1]);
  });
});

/** Mots entendus : chaque syllabe dure 200 ms, une virgule ajoute une pause de 300 ms. */
function heardFrom(spoken: string): { words: HeardWord[]; audioMs: number } {
  let t = 0;
  const words: HeardWord[] = [];
  for (const raw of spoken.split(" ")) {
    const word = raw.replace(/[,.]/g, "");
    const ms = spokenWeight(word) * 200;
    words.push({ text: word, startMs: t, endMs: t + ms });
    t += ms + (raw.endsWith(",") ? 300 : 0);
  }
  return { words, audioMs: t };
}

describe("measureCues", () => {
  it("compare l'heure prévue de chaque repère à la fin réelle du mot qui désigne l'objet", () => {
    const { say, cues } = extractCues("Le point {A} est ici.");
    const { words, audioMs } = heardFrom("Le point est ici.");
    const [row] = measureCues({ say, cues, audioMs, words });
    expect(row!.id).toBe("A");
    expect(row!.word).toBe("point");
    expect(row!.actualMs).toBe(words[1]!.endMs);
    expect(row!.linearMs).toBe(Math.round(cues.A! * audioMs));
  });

  it("prévoit mieux en temps de parole qu'en caractères quand la phrase contient des nombres", () => {
    const { say, cues } = extractCues("La vitesse vaut 20 m/s à 37°, et la portée {R} arrive au bout.");
    const { words, audioMs } = heardFrom(
      "La vitesse vaut vingt mètres par seconde à trente-sept degrés, et la portée arrive au bout.",
    );
    const [row] = measureCues({ say, cues, audioMs, words });
    expect(row!.word).toBe("portée");
    expect(Math.abs(row!.weightedMs - row!.actualMs)).toBeLessThan(Math.abs(row!.linearMs - row!.actualMs));
  });

  it("prend le début de la phrase pour un repère placé avant tout mot", () => {
    const { say, cues } = extractCues("{f} Voici la courbe.");
    const { words, audioMs } = heardFrom("Voici la courbe.");
    const [row] = measureCues({ say, cues, audioMs, words });
    expect(row!.word).toBe("(début)");
    expect(row!.actualMs).toBe(words[0]!.startMs);
  });

  it("passe un repère dont le mot n'a pas été entendu", () => {
    const { say, cues } = extractCues("Le point {A} est ici.");
    const { words, audioMs } = heardFrom("Le est ici.");
    expect(measureCues({ say, cues, audioMs, words })).toEqual([]);
  });
});

describe("summarizeSync", () => {
  it("résume les écarts absolus des deux méthodes", () => {
    const summary = summarizeSync([
      { id: "a", word: "x", actualMs: 1000, linearMs: 1400, weightedMs: 1100 },
      { id: "b", word: "y", actualMs: 2000, linearMs: 1800, weightedMs: 2050 },
    ]);
    expect(summary.count).toBe(2);
    expect(summary.linear).toEqual({ meanAbsMs: 300, maxAbsMs: 400, p90AbsMs: 400 });
    expect(summary.weighted).toEqual({ meanAbsMs: 75, maxAbsMs: 100, p90AbsMs: 100 });
  });
});
