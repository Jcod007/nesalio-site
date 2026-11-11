import { describe, expect, it } from "vitest";
import { drawableAccents } from "./mathAccents";

describe("lettres accentuées dans une formule", () => {
  // Leçons réelles du 2026-11-10 : « à TPN », « entités » dans une formule → « MathJax retry », formule non rendue.
  it("écrit la lettre accentuée d'un texte avec l'accent de la police de base", () => {
    expect(drawableAccents(String.raw`V_m = 22{,}4\ \text{L/mol} \text{ à TPN}`)).toBe(
      String.raw`V_m = 22{,}4\ \text{L/mol} \text{ }\grave{\text{a}}\text{ TPN}`,
    );
    expect(drawableAccents(String.raw`\text{entités}`)).toBe(String.raw`\text{entit}\acute{\text{e}}\text{s}`);
    expect(drawableAccents(String.raw`\mathrm{Énergie}`)).toBe(String.raw`\mathrm{}\acute{\mathrm{E}}\mathrm{nergie}`);
  });

  it("lit aussi les accents écrits en commandes de texte (« entit\\'es » affiché brut)", () => {
    expect(drawableAccents(String.raw`\text{entit\'es}`)).toBe(String.raw`\text{entit}\acute{\text{e}}\text{s}`);
    expect(drawableAccents("\\text{\\`a c\\^ot\\'e}")).toBe(drawableAccents(String.raw`\text{à côté}`));
  });

  it("traite une lettre accentuée hors d'un texte, et laisse le reste intact", () => {
    expect(drawableAccents("é = 2")).toBe(String.raw`\acute{\text{e}} = 2`);
    const plain = String.raw`n = \frac{m}{M} \approx 2{,}0\ \text{mol}`;
    expect(drawableAccents(plain)).toBe(plain);
    // No accent of the base font for these: left as written (the formula falls back to plain text, as before).
    expect(drawableAccents(String.raw`\text{façon}`)).toBe(String.raw`\text{façon}`);
  });
});
