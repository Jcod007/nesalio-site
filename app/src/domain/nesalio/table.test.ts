import { describe, expect, it } from "vitest";
import { measureSceneObject, tableLayout, tableRows } from "./measurement";
import { validateModelOutput } from "./validate";

const table = (params: unknown) => ({
  slice_id: "s", introduces: [{ id: "t", type: "matrix", params }],
  beats: [{ id: "b", say: "Voici le tableau.", cues: [], do: [{ id: "s1", verb: "show", target: "t", at: "beat:start" }] }],
});

describe("tableau de valeurs", () => {
  // Seen in real generations: a table of values drawn as loose numbers, its row titles placed anywhere.
  it("accepte un intitulé par ligne, et seulement un par ligne", () => {
    expect(validateModelOutput({ slices: [table({ rows: [[2, 5], [6, 15]], row_labels: ["durée (h)", "distance (km)"] })] }).ok).toBe(true);
    expect(validateModelOutput({ slices: [table({ rows: [[2, 5], [6, 15]], row_labels: ["durée (h)"] })] }).ok).toBe(false);
  });

  it("met les intitulés en première colonne et écrit les nombres à la française", () => {
    expect(tableRows({ rows: [[2, 2.5]], row_labels: ["x"] })).toEqual([["x", "2", "2,5"]]);
    expect(tableRows({ rows: [[-1, 3]] })).toEqual([["−1", "3"]]);
  });

  it("place chaque case dans sa colonne et sa ligne, quadrillage compris dans la taille", () => {
    const layout = tableLayout([["durée (h)", "2", "5"], ["distance (km)", "6", "15"]], 40);
    expect(layout.cells).toHaveLength(6);
    const [first, second] = [layout.cells[0]!, layout.cells[1]!];
    expect(second.at[0]).toBeGreaterThan(first.at[0]);
    expect(layout.cells[3]!.at[1]).toBeLessThan(first.at[1]);
    for (const cell of layout.cells) {
      expect(Math.abs(cell.at[0])).toBeLessThan(layout.width / 2);
      expect(Math.abs(cell.at[1])).toBeLessThan(layout.height / 2);
    }
    // Outer border, one line between the two rows, one after each column but the last.
    expect(layout.lines).toHaveLength(4 + 1 + 2);
    const measured = measureSceneObject({ id: "t", type: "matrix", params: { rows: [[2, 5], [6, 15]], row_labels: ["durée (h)", "distance (km)"] } },
      new Map(), { symbols: {}, expressions: {} });
    expect(measured.body.x1 - measured.body.x0).toBeCloseTo(layout.width, 6);
  });
});
