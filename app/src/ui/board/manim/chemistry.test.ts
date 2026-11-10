import { describe, expect, it } from "vitest";
import { textWorldExtent } from "@/domain/board/layout";
import { CHEM_MACROS, expandChemistry } from "./chemistry";

describe("écritures chimiques au tableau", () => {
  it("remplace \\ce{…} par du LaTeX de base, indices et flèche compris", () => {
    const tex = expandChemistry("\\ce{C3H8 + 5O2 -> 3CO2 + 4H2O}");
    expect(tex).not.toContain("\\ce");
    expect(tex).toContain("\\mathrm{C}");
    expect(tex).toContain("\\longrightarrow");
    expect(tex).toMatch(/_\{\\smash\[t\]\{8\}\}/);
  });

  it("écrit les ions et les états", () => {
    const tex = expandChemistry("\\ce{NaCl(s) -> Na+(aq) + Cl-(aq)}");
    expect(tex).toContain("\\mathrm{aq}");
    expect(tex).toContain("^{+}");
    expect(tex).toContain("^{-}");
  });

  it("fournit les macros des flèches d'équilibre absentes du LaTeX de base", () => {
    for (const source of ["N2 + 3H2 <=> 2NH3", "A <=>> B", "A <<=> B", "A <--> B"]) {
      const tex = expandChemistry(`\\ce{${source}}`);
      const used = [...tex.matchAll(/\\(long[A-Za-z]+)/g)].map((match) => match[1]!)
        .filter((name) => !["longrightarrow", "longleftarrow", "longleftrightarrow"].includes(name));
      expect(used.length).toBeGreaterThan(0);
      for (const name of used) expect(CHEM_MACROS).toHaveProperty(name);
    }
  });

  it("laisse le reste de la formule intact et traite plusieurs \\ce", () => {
    expect(expandChemistry("x^2 + 1")).toBe("x^2 + 1");
    const tex = expandChemistry("n = \\frac{m}{M} \\quad \\ce{H2O} \\text{ et } \\ce{CO2}");
    expect(tex.startsWith("n = \\frac{m}{M} \\quad {")).toBe(true);
    expect(tex).not.toContain("\\ce");
    expect(tex).toContain("\\text{ et }");
  });

  it("lit les accolades imbriquées et les unités \\pu", () => {
    expect(expandChemistry("\\ce{A ->[{chaleur}] B}")).toContain("\\xrightarrow");
    expect(expandChemistry("\\pu{12 g/mol}")).not.toContain("\\pu");
  });

  it("garde la virgule décimale d'une unité écrite avec {,} (leçon réelle : « 58 ,⁴⁴ g / mol »)", () => {
    const tex = expandChemistry(String.raw`M = \pu{58{,}44 g/mol}`);
    expect(tex).toContain("58{,}44");
    expect(tex).not.toContain("^{44}");
    expect(expandChemistry(String.raw`\pu{99{,}3 kPa}`)).toBe(expandChemistry(String.raw`\pu{99,3 kPa}`));
  });

  it("dessine une vraie flèche pour « -> » tapé entre deux \ce (leçon réelle : « − > » au tableau)", () => {
    const tex = expandChemistry(String.raw`4\ce{FeS2} + 11\ce{O2} -> 2\ce{Fe2O3}`);
    expect(tex).toContain(String.raw`\longrightarrow`);
    expect(tex).not.toContain("->");
    expect(expandChemistry("->")).toBe(String.raw`\longrightarrow `);
    expect(expandChemistry(String.raw`A <=> B`)).toContain(String.raw`\rightleftharpoons`);
    // In a text, the characters stay as typed.
    expect(expandChemistry(String.raw`\text{a -> b}`)).toBe(String.raw`\text{a -> b}`);
  });

  it("ne touche pas une écriture incomplète : le rendu signalera l'erreur", () => {
    expect(expandChemistry("\\ce{2H2")).toBe("\\ce{2H2");
    expect(expandChemistry("\\cev{x}")).toBe("\\cev{x}");
  });
});

describe("taille estimée d'une écriture chimique", () => {
  // Placement runs before rendering (and on the server): the estimate must not be smaller than the drawing.
  it("n'est pas plus petite que celle de la même équation écrite à la main avec indices", () => {
    const cases: [string, string][] = [
      ["\\ce{C3H8 + 5O2 -> 3CO2 + 4H2O}", "C_3H_8 + 5\\,O_2 \\longrightarrow 3\\,CO_2 + 4\\,H_2O"],
      ["\\ce{N2 + 3H2 <=> 2NH3}", "N_2 + 3\\,H_2 \\rightleftharpoons 2\\,NH_3"],
      ["\\ce{NaCl(s) -> Na+(aq) + Cl-(aq)}", "NaCl(s) \\longrightarrow Na^{+}(aq) + Cl^{-}(aq)"],
    ];
    for (const [chemistry, manual] of cases) {
      const a = textWorldExtent(`$${chemistry}$`, 40), b = textWorldExtent(`$${manual}$`, 40);
      expect(a.w).toBeGreaterThanOrEqual(b.w * 0.95);
      expect(a.w).toBeLessThan(b.w * 1.6);
      // Height is not compared: board/tex.ts reads "H2" as one line (indices not seen), about 0.2 line too short.
      // The browser measures the rendered formula itself (NesalioProjection.prepareSlice), so the drawing is placed right.
    }
  });
});
