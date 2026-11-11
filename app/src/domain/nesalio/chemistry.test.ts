import { describe, expect, it } from "vitest";
import { balanceIssues, molarMass, parseFormula, readChemicalEquation } from "./chemistry";

describe("parseFormula", () => {
  it("compte les atomes avec indices, parenthèses, hydrates et charges", () => {
    expect(Object.fromEntries(parseFormula("Ca(OH)2").atoms)).toEqual({ Ca: 1, O: 2, H: 2 });
    expect(Object.fromEntries(parseFormula("C_3H_8").atoms)).toEqual({ C: 3, H: 8 });
    expect(Object.fromEntries(parseFormula("CuSO4·5H2O").atoms)).toEqual({ Cu: 1, S: 1, O: 9, H: 10 });
    expect(parseFormula("SO4^{2-}").charge).toBe(-2);
    expect(parseFormula("NH4+").charge).toBe(1);
    expect(parseFormula("Fe^{3+}").charge).toBe(3);
    expect(parseFormula("NaCl(aq)").charge).toBe(0);
  });

  it("refuse un élément inconnu ou une parenthèse mal fermée", () => {
    expect(() => parseFormula("Xy2O")).toThrow();
    expect(() => parseFormula("Ca(OH2")).toThrow();
    expect(() => parseFormula("x")).toThrow();
  });

  it("donne la masse molaire des tableaux scolaires", () => {
    expect(molarMass("H2O")).toBeCloseTo(18.02, 2);
    expect(molarMass("NaCl")).toBeCloseTo(58.44, 2);
  });
});

describe("équations", () => {
  it("lit une équation écrite en LaTeX ou avec \\ce", () => {
    const equation = readChemicalEquation(String.raw`C_3H_8 + 5\,O_2 \rightarrow 3\,CO_2 + 4\,H_2O`);
    expect(equation?.left.map((t) => t.coefficient)).toEqual([1, 5]);
    expect(readChemicalEquation(String.raw`\ce{2 H2 + O2 -> 2 H2O}`)?.right).toEqual([{ coefficient: 2, formula: "H2O" }]);
  });

  it("ignore ce qui n'est pas une équation chimique", () => {
    expect(readChemicalEquation(String.raw`3x + 5 = 17 \rightarrow x = 4`)).toBeNull();
    expect(readChemicalEquation(String.raw`\text{sur le dé pair : } 2, 4, 6 \rightarrow \frac{2}{3}`)).toBeNull();
    expect(readChemicalEquation(String.raw`F = m \times a \Leftrightarrow a = \frac{F}{m}`)).toBeNull();
  });

  it("donne les écarts d'atomes et de charge, rien pour une équation équilibrée", () => {
    expect(balanceIssues(readChemicalEquation(String.raw`C_3H_8 + 5\,O_2 \rightarrow 3\,CO_2 + 4\,H_2O`)!)).toEqual([]);
    expect(balanceIssues(readChemicalEquation("C3H8 + O2 -> 3 CO2 + H2O")!)).toEqual(["H : 8 à gauche, 2 à droite", "O : 2 à gauche, 7 à droite"]);
    expect(balanceIssues(readChemicalEquation(String.raw`\ce{Fe^{3+} + e^- -> Fe}`)!)).toEqual(["charge : 2 à gauche, 0 à droite"]);
    expect(balanceIssues(readChemicalEquation("NaCl -> Na+ + Cl-")!)).toEqual([]);
  });
});
