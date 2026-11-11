import { describe, expect, it } from "vitest";
import { validateModelOutput } from "./validate";

const table = {
  id: "tab",
  type: "matrix",
  params: {
    rows: [
      [1, 16, 18],
      ["2 g", "?", null],
    ],
    row_labels: ["M (g/mol)", "masse"],
    column_labels: ["espèce", "H", "O", "H₂O"],
  },
};
const output = (action: Record<string, unknown>) => ({
  slices: [
    {
      slice_id: "s1",
      introduces: [table],
      beats: [
        {
          id: "b1",
          say: "Regarde la case.",
          cues: [],
          do: [
            { id: "a0", verb: "show", target: "tab", at: "beat:start" },
            { id: "a1", at: "after:a0", ...action },
          ],
        },
      ],
    },
  ],
});

describe("parties d'un tableau", () => {
  it("accepte highlight sur une case, une ligne ou une colonne du tableau", () => {
    for (const part of ["r2c3", "r2", "c3", "r1c1"]) {
      const result = validateModelOutput(output({ verb: "highlight", target: "tab", part }));
      expect(result.ok, part).toBe(true);
    }
  });

  it("refuse une case hors du tableau, et write.part sur un tableau", () => {
    const outside = validateModelOutput(output({ verb: "highlight", target: "tab", part: "r3c1" }));
    expect(outside.ok).toBe(false);
    if (!outside.ok) expect(outside.issues[0]!.message).toContain("r3c1");
    const written = validateModelOutput(output({ verb: "write", target: "tab", part: "r1" }));
    expect(written.ok).toBe(false);
  });
});
