import { describe, expect, it } from "vitest";
import { matrixParts } from "./contract";
import { isTable, measureSceneObject, tableCellParts, tableLayout, tableRows } from "./measurement";
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

describe("tableau : en-têtes de colonnes, cases texte ou vides, parties surlignables", () => {
  const valid = (params: unknown) => validateModelOutput({ slices: [table(params)] }).ok;

  // Seen in real generations: chemistry tables with units, "?" and blank cells, and columns without titles.
  it("accepte des cases texte courtes, vides ou null, et refuse un texte trop long", () => {
    expect(valid({ rows: [["10 g", "?"], ["", null]], row_labels: ["masse", "volume"] })).toBe(true);
    expect(valid({ rows: [[1, "x"]] })).toBe(true);
    expect(valid({ rows: [["une phrase entière qui n'a rien à faire dans une case"]] })).toBe(false);
  });

  it("accepte un en-tête par colonne, ou un de plus pour la colonne des intitulés", () => {
    expect(valid({ rows: [[1, 16, 18]], column_labels: ["H", "O", "H₂O"] })).toBe(true);
    expect(valid({ rows: [[1, 16, 18]], row_labels: ["M (g/mol)"], column_labels: ["H", "O", "H₂O"] })).toBe(true);
    expect(valid({ rows: [[1, 16, 18]], row_labels: ["M (g/mol)"], column_labels: ["", "H", "O", "H₂O"] })).toBe(false);
    expect(valid({ rows: [[1, 16, 18]], row_labels: ["M (g/mol)"], column_labels: ["espèce", "H", "O", "H₂O"] })).toBe(true);
    expect(valid({ rows: [[1, 16, 18]], column_labels: ["espèce", "H", "O", "H₂O"] })).toBe(false);
    expect(valid({ rows: [[1, 16, 18]], column_labels: ["H", "O"] })).toBe(false);
  });

  it("garde valides les tableaux de nombres d'avant", () => {
    expect(valid({ rows: [[3, 2, 1], [8, 4, 2]], row_labels: ["exposant", "puissance de 2"] })).toBe(true);
    expect(valid({ rows: [[1, 0], [0, 1]] })).toBe(true);
  });

  it("écrit la ligne d'en-têtes, laisse le coin vide et les cases vides blanches", () => {
    expect(tableRows({ rows: [[1, null], ["?", 2.5]], row_labels: ["a", "b"], column_labels: ["x", "y"] }))
      .toEqual([["", "x", "y"], ["a", "1", ""], ["b", "?", "2,5"]]);
    expect(tableRows({ rows: [[1, 2]], row_labels: ["a"], column_labels: ["coin", "x", "y"] }))
      .toEqual([["coin", "x", "y"], ["a", "1", "2"]]);
    expect(tableRows({ rows: [[1, 2]], column_labels: ["x", "y"] })).toEqual([["x", "y"], ["1", "2"]]);
  });

  it("dessine en tableau quadrillé dès qu'il y a un intitulé ou une case texte", () => {
    expect(isTable({ rows: [[1, 2]] })).toBe(false);
    expect(isTable({ rows: [[1, 2]], column_labels: ["x", "y"] })).toBe(true);
    expect(isTable({ rows: [[1, "?"]] })).toBe(true);
    expect(isTable({ rows: [[1, null]] })).toBe(true);
  });

  it("nomme les cases, les lignes et les colonnes de données (comptées à partir de 1)", () => {
    expect(matrixParts({ rows: [[1, 2], [3, 4]] })).toEqual(["r1c1", "r1c2", "r2c1", "r2c2", "r1", "r2", "c1", "c2"]);
    const params = { rows: [[1, 2], [3, 4]], row_labels: ["a", "b"], column_labels: ["x", "y"] };
    // Layout row 0 is the header row, layout column 0 the row titles.
    expect(tableCellParts(params, 0, 0)).toEqual([]);
    expect(tableCellParts(params, 0, 2)).toEqual(["c2"]);
    expect(tableCellParts(params, 2, 0)).toEqual(["r2"]);
    expect(tableCellParts(params, 2, 1)).toEqual(["r2c1", "r2", "c1"]);
    expect(tableCellParts({ rows: [[1, 2]] }, 0, 1)).toEqual(["r1c2", "r1", "c2"]);
  });

  it("mesure la ligne d'en-têtes et donne à chaque case sa boîte dans le quadrillage", () => {
    const params = { rows: [[1, 16, 18]], row_labels: ["M (g/mol)"], column_labels: ["H", "O", "H₂O"] };
    const rows = tableRows(params);
    const layout = tableLayout(rows, 40);
    const single = tableLayout(rows.slice(1), 40);
    expect(layout.height).toBeCloseTo(single.height * 2, 6);
    const measured = measureSceneObject({ id: "t", type: "matrix", params }, new Map(), { symbols: {}, expressions: {} });
    expect(measured.body.y1 - measured.body.y0).toBeCloseTo(layout.height, 6);
    expect(measured.body.x1 - measured.body.x0).toBeCloseTo(layout.width, 6);
    for (const cell of layout.cells) {
      expect(cell.box.x0).toBeGreaterThanOrEqual(-layout.width / 2 - 1e-9);
      expect(cell.box.x1).toBeLessThanOrEqual(layout.width / 2 + 1e-9);
      expect(cell.at[0]).toBeCloseTo((cell.box.x0 + cell.box.x1) / 2, 9);
      expect(cell.at[1]).toBeCloseTo((cell.box.y0 + cell.box.y1) / 2, 9);
    }
    const firstRow = layout.cells.filter((cell) => cell.row === 0);
    expect(firstRow.reduce((sum, cell) => sum + cell.box.x1 - cell.box.x0, 0)).toBeCloseTo(layout.width, 6);
  });
});
