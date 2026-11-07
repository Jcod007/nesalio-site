import { describe, expect, it } from "vitest";
import { StreamEvent } from "./schema";
import { createModelOutputParser } from "@/domain/tutor/modelOutput";

const valid = { kind: "step", zone: "example", segments: [
  { say: "Voici un triangle.", do: [{ type: "triangle", id: "tri", base: 4, height: 3 }] },
  { say: "Voici son hypoténuse.", do: [{ type: "highlight", target: "tri-hyp" }] },
] };

describe("étapes segmentées", () => {
  it("valide les deux formats et rejette le mélange et les repères dans les segments", () => {
    expect(StreamEvent.safeParse(valid).success).toBe(true);
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
});
