import { describe, expect, it } from "vitest";
import { partsWithSpacing } from "./partSpacing";

describe("espacement des formules écrites par parties", () => {
  it("garde le \\quad écrit entre deux parties (leçon réelle : « 3,73oux »)", () => {
    const content = String.raw`x = 2 + \sqrt{3} \approx 3{,}73 \quad \text{ou} \quad x = 2 - \sqrt{3} \approx 0{,}27`;
    const parts = [String.raw`x = 2 + \sqrt{3} \approx 3{,}73`, String.raw`\text{ou}`, String.raw`x = 2 - \sqrt{3} \approx 0{,}27`];
    expect(partsWithSpacing(content, parts)).toEqual([
      String.raw`x = 2 + \sqrt{3} \approx 3{,}73 \quad`, String.raw`\text{ou} \quad`, parts[2],
    ]);
  });

  it("met un espace autour d'un mot en texte même sans \\quad écrit", () => {
    const parts = ["x = 1", String.raw`\text{ou}`, "x = 2"];
    expect(partsWithSpacing(String.raw`x = 1 \text{ou} x = 2`, parts)).toEqual(["x = 1 \\ ", "\\text{ou} \\ ", "x = 2"]);
  });

  it("ne change rien aux parties d'une formule ordinaire", () => {
    const parts = ["f(x) =", "-(x - 2)^2", "+ 3"];
    expect(partsWithSpacing("f(x) = -(x - 2)^2 + 3", parts)).toEqual(parts);
  });
});
