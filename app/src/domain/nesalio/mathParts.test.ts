import { describe, expect, it } from "vitest";
import { RuntimeState, Slice } from "./contract";
import { createScene, introduceSlice, partVisible, revealPart, runtimeState, setVisibility } from "./sceneState";
import { validateModelOutput } from "./validate";

/** A one-beat slice whose formula is written part by part on the given words. */
function formulaSlice(content: string, parts: { id: string; text: string }[], say: string, words: string[]) {
  return {
    slice_id: "s_formula",
    introduces: [{ id: "formula", type: "math", content, parts }],
    beats: [{
      id: "beat", say,
      cues: words.map((text, i) => ({ id: `w${i}`, text })),
      do: parts.map((part, i) => ({ id: `write_${part.id}`, verb: "write", target: "formula", part: part.id, at: `cue:w${i}` })),
    }],
  };
}

const issues = (input: unknown) => {
  const result = validateModelOutput(input);
  return result.ok ? [] : result.issues.map(({ message }) => message);
};

describe("formules découpées en parties", () => {
  it("accepte des formules variées écrites morceau par morceau", () => {
    const cases = [
      formulaSlice("9 + 16 = 25", [{ id: "p9", text: "9" }, { id: "p16", text: "+ 16" }, { id: "p25", text: "= 25" }],
        "Neuf plus seize donne vingt-cinq.", ["Neuf", "seize", "vingt-cinq"]),
      formulaSlice("2x + 3 = 7", [{ id: "left", text: "2x + 3" }, { id: "right", text: "= 7" }],
        "Deux x plus trois vaut sept.", ["Deux", "sept"]),
      formulaSlice("x^2 + 2x + 1", [{ id: "square", text: "x^2" }, { id: "double", text: "+ 2x" }, { id: "one", text: "+ 1" }],
        "Le carré, le double produit, puis un.", ["carré", "double", "un"]),
      formulaSlice("\\frac{1}{2} + \\frac{1}{3} = \\frac{5}{6}", [
        { id: "half", text: "\\frac{1}{2}" }, { id: "third", text: "+ \\frac{1}{3}" }, { id: "sum", text: "= \\frac{5}{6}" },
      ], "Un demi plus un tiers font cinq sixièmes.", ["demi", "tiers", "sixièmes"]),
    ];
    for (const slice of cases) expect(issues({ slices: [slice] }), slice.introduces[0]!.content).toEqual([]);
  });

  it("refuse des parties qui ne redonnent pas la formule", () => {
    const slice = formulaSlice("9 + 16 = 25", [{ id: "a", text: "9" }, { id: "b", text: "+ 61" }, { id: "c", text: "= 25" }],
      "Neuf plus seize donne vingt-cinq.", ["Neuf", "seize", "vingt-cinq"]);
    expect(issues({ slices: [slice] })).toEqual([expect.stringContaining("bout à bout")]);
  });

  it("refuse une partie qui coupe une structure LaTeX ou sépare un exposant de sa base", () => {
    const fraction = formulaSlice("\\frac{1}{2}", [{ id: "a", text: "\\frac{1}" }, { id: "b", text: "{2}" }],
      "Un sur deux.", ["Un", "deux"]);
    expect(issues({ slices: [fraction] })).toEqual([expect.stringContaining("formule complète")]);
    const power = formulaSlice("x^2", [{ id: "a", text: "x" }, { id: "b", text: "^2" }], "x au carré.", ["x", "carré"]);
    expect(issues({ slices: [power] })).toEqual([expect.stringContaining("formule complète")]);
    const delimiters = formulaSlice("\\left( x \\right)", [{ id: "a", text: "\\left( x" }, { id: "b", text: "\\right)" }],
      "Entre parenthèses x.", ["parenthèses", "x"]);
    expect(issues({ slices: [delimiters] })).toHaveLength(2);
  });

  it("refuse des parties sur une valeur calculée", () => {
    const input = {
      math_context: { symbols: { k: { kind: "constant", value: 2 } }, expressions: { double: "k * 2" } },
      slices: [{
        slice_id: "s", beats: [{ id: "b", say: "Voici.", cues: [], do: [] }],
        introduces: [{
          id: "value", type: "math", content: { kind: "computed", expression_ref: "double", template: "{value}", precision: 0 },
          parts: [{ id: "a", text: "4" }, { id: "b", text: "0" }],
        }],
      }],
    };
    expect(issues(input)).toEqual([expect.stringContaining("formule fixe")]);
  });

  it("refuse une partie absente, une cible non découpée et une partie écrite deux fois", () => {
    const slice = formulaSlice("a + b", [{ id: "a", text: "a" }, { id: "b", text: "+ b" }], "Voici a plus b.", ["a", "b"]);
    slice.introduces.push({ id: "plain", type: "math", content: "c", parts: undefined as never });
    slice.beats[0]!.do.push(
      { id: "missing", verb: "write", target: "formula", part: "zzz", at: "cue:w0" },
      { id: "plain_part", verb: "write", target: "plain", part: "a", at: "cue:w0" },
      { id: "again", verb: "write", target: "formula", part: "a", at: "cue:w1" },
    );
    expect(issues({ slices: [JSON.parse(JSON.stringify(slice))] })).toEqual([
      expect.stringContaining("Partie absente"),
      expect.stringContaining("n’est pas une formule découpée"),
      expect.stringContaining("déjà écrite"),
    ]);
  });

  it("garde une formule sans parties identique à aujourd’hui", () => {
    const slice = {
      slice_id: "s", introduces: [{ id: "f", type: "math", content: "a = b" }],
      beats: [{ id: "b", say: "Voici.", cues: [], do: [{ id: "w", verb: "write", target: "f", at: "beat:start" }] }],
    };
    expect(issues({ slices: [slice] })).toEqual([]);
  });

  it("suit les parties écrites et les renvoie au modèle pour reprendre au bon endroit", () => {
    const slice = Slice.parse(formulaSlice("9 + 16 = 25", [{ id: "p9", text: "9" }, { id: "p16", text: "+ 16" }, { id: "p25", text: "= 25" }],
      "Neuf plus seize donne vingt-cinq.", ["Neuf", "seize", "vingt-cinq"]));
    const scene = introduceSlice(createScene({ x0: -8, y0: -4.5, x1: 8, y1: 4.5 }), slice);
    const first = revealPart(scene, "formula", "p9");
    const formula = first.objects.get("formula")!;
    expect(partVisible(formula, "p9")).toBe(true);
    expect(partVisible(formula, "p16")).toBe(false);
    expect(RuntimeState.parse(runtimeState(first)).objects).toEqual([
      { id: "formula", type: "math", visible: true, visible_parts: ["p9"] },
    ]);
    expect(revealPart(first, "formula", "p9")).toBe(first);
    const complete = revealPart(revealPart(first, "formula", "p16"), "formula", "p25").objects.get("formula")!;
    expect(complete.visible).toBe(true);
    expect(complete.revealedParts).toBeUndefined();
    const whole = setVisibility(first, "formula", true).objects.get("formula")!;
    expect(partVisible(whole, "p25")).toBe(true);
    expect(() => revealPart(scene, "formula", "zzz")).toThrow("Partie absente");
    expect(scene.objects.get("formula")!.visible).toBe(false);
  });
});

describe("surlignage d’une partie de formule", () => {
  const slice = (extra: unknown[]) => ({
    slice_id: "s", introduces: [{ id: "eq", type: "math", content: "3x + 5 = 17", parts: [{ id: "x", text: "3x" }, { id: "rest", text: "+ 5 = 17" }] },
      { id: "plain", type: "math", content: "y" }],
    beats: [{ id: "b", say: "On met en évidence x.", cues: [{ id: "c", text: "x" }], do: [
      { id: "w", verb: "write", target: "eq", at: "beat:start" }, ...extra] }],
  });
  it("surligne seulement une partie, autant de fois que nécessaire", () => {
    expect(issues({ slices: [slice([
      { id: "h1", verb: "highlight", target: "eq", part: "x", at: "cue:c" },
      { id: "h2", verb: "highlight", target: "eq", part: "x", role: "result", at: "after:h1" },
    ])] })).toEqual([]);
  });
  it("refuse une partie inconnue ou une formule non découpée", () => {
    expect(issues({ slices: [slice([{ id: "h", verb: "highlight", target: "eq", part: "zzz", at: "cue:c" }])] }))
      .toEqual([expect.stringContaining("Partie absente")]);
    expect(issues({ slices: [slice([{ id: "h", verb: "highlight", target: "plain", part: "x", at: "cue:c" }])] }))
      .toEqual([expect.stringContaining("n’est pas une formule découpée")]);
  });
});

describe("parties et formule : écritures équivalentes", () => {
  it("accepte x^{2} pour x^2, le signe moins Unicode et les espaces, et cite les deux textes sinon", async () => {
    const { sameFormula } = await import("./validate");
    expect(sameFormula("y = x^{2} − 4x + 1", "y=x^2-4x+1")).toBe(true);
    expect(sameFormula("\\left(x+1\\right)^{2}", "(x+1)^2")).toBe(true);
    expect(sameFormula("x^{12}", "x^12")).toBe(false);
    expect(sameFormula("y = x^2 - 4x + 1", "y = x^2 - 4x - 1")).toBe(false);
  });
});
