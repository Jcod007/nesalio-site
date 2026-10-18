import { describe, expect, it } from "vitest";
import { extractCues } from "@/domain/tutor/cues";
import { cueOffsetsMs, retimeCues, spokenWeight } from "./spokenTime";

describe("cueOffsetsMs", () => {
  const { say, cues } = extractCues("{a} Le sommet {s} est en 2, 3 {p}.");

  it("répartit les repères sur toute la durée quand la partie parlée est inconnue", () => {
    const at = cueOffsetsMs(say, cues, 4000);
    expect(at.a).toBe(0);
    expect(at.p).toBeGreaterThan(3600);
    expect(at.s).toBeGreaterThan(0);
    expect(at.s).toBeLessThan(at.p!);
  });

  it("répartit les repères sur la seule partie parlée, sans les silences", () => {
    const at = cueOffsetsMs(say, cues, 4000, { startMs: 300, endMs: 3500 });
    expect(at.a).toBe(300);
    expect(at.p).toBeLessThanOrEqual(3500);
    expect(at.p).toBeGreaterThan(3200);
  });

  it("place le repère au prorata du temps de parole, pas des caractères", () => {
    // « 3,73 » est court à l'écrit mais long à dire : le repère qui le suit arrive plus tard qu'au prorata des caractères.
    const { say: s, cues: c } = extractCues("Ça donne 3,73 {z} et un peu plus.");
    const byChars = c.z! * 3000;
    const bySpeech = cueOffsetsMs(s, c, 3000).z!;
    expect(bySpeech).toBeGreaterThan(byChars);
    expect(spokenWeight("3,73")).toBeGreaterThan(spokenWeight("et un peu"));
  });

  it("ignore une partie parlée incohérente", () => {
    expect(cueOffsetsMs(say, cues, 4000, { startMs: 3000, endMs: 1000 })).toEqual(cueOffsetsMs(say, cues, 4000));
  });
});

describe("retimeCues", () => {
  it("rend des parts de la durée, entre 0 et 1", () => {
    const { say, cues } = extractCues("Le point {A} est là {B}.");
    const parts = retimeCues(say, cues, 2000, { startMs: 200, endMs: 1800 });
    expect(parts.A).toBeGreaterThan(0.1);
    expect(parts.B).toBeLessThanOrEqual(0.9);
  });
});
