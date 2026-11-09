import { describe, expect, it } from "vitest";
import { StreamEvent } from "./schema";
import { createModelOutputParser } from "@/domain/tutor/modelOutput";

const valid = { kind: "step", segments: [
  { say: "Voici un triangle.", do: [{ type: "triangle", id: "tri", base: 4, height: 3 }] },
  { say: "Voici son hypoténuse.", do: [{ type: "highlight", target: "tri-hyp" }] },
] };

describe("étapes segmentées", () => {
  it("valide les deux formats et rejette le mélange et les repères dans les segments", () => {
    expect(StreamEvent.parse({ ...valid, zone: "example", practiceBoard: "attempt" })).toEqual(valid);
    expect(StreamEvent.safeParse({ kind: "step", say: "Ancien {A}", do: [] }).success).toBe(true);
    expect(StreamEvent.safeParse({ ...valid, say: "mélange" }).success).toBe(false);
    expect(StreamEvent.safeParse({ kind: "step", segments: [{ say: "Point {A}." }] }).success).toBe(false);
    expect(StreamEvent.safeParse({ kind: "step", segments: [] }).success).toBe(false);
    expect(StreamEvent.safeParse({ kind: "step", segments: Array.from({ length: 7 }, () => ({ say: "a" })) }).success).toBe(false);
  });

  it("rejette toute une étape si une commande segmentée est invalide", () => {
    const parser = createModelOutputParser();
    const bad = { kind: "step", segments: [{ say: "Un triangle.", do: [{ type: "triangle", id: "tri", base: -1, height: 3 }] }] };
    expect(parser.parseLine(JSON.stringify(bad))).toBeNull();
    expect(parser.issues.at(-1)?.reason).toContain("Étape segmentée invalide");
    expect(parser.parseLine(JSON.stringify(valid))).toMatchObject(valid);
  });

  it("répare les commandes LaTeX dans les formules sans toucher aux échappements JSON du texte", () => {
    const parser = createModelOutputParser({ segmentedOnly: true });
    const event = parser.parseLine(String.raw`{
      "kind":"step","segments":[{"say":"Observe la formule.","do":[
        {"type":"note","text":"1 $ et du \text clair"},
        {"type":"note","text":"\"Aire\" : $\frac{b \times h}{2}$ et $\sqrt{25} = 5$, $\pi$ et $\\theta$."}
      ]}]
    }`);
    expect(event).toMatchObject({ segments: [{ do: [
      { text: "1 $ et du \text clair" },
      { text: String.raw`"Aire" : $\frac{b \times h}{2}$ et $\sqrt{25} = 5$, $\pi$ et $\theta$.` },
    ] }] });
    expect(parser.issues).toEqual([]);
  });
});
