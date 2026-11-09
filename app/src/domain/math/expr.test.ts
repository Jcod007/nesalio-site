import { describe, expect, it } from "vitest";
import { compileExpression, compileNamedExpression, ExprError, parseExpression } from "./expr";

const at = (source: string, x: number) => compileExpression(source)(x);

describe("compileExpression", () => {
  it("respecte les priorités et le moins unaire devant une puissance", () => {
    expect(at("-(x-2)^2+3", 2)).toBe(3);
    expect(at("-(x-2)^2+3", 0)).toBe(-1);
    expect(at("-x^2", 3)).toBe(-9);
    expect(at("2^3^2", 0)).toBe(512);
    expect(at("1+2*3", 0)).toBe(7);
    expect(at("(1+2)*3", 0)).toBe(9);
  });

  it("accepte la multiplication implicite", () => {
    expect(at("2x", 4)).toBe(8);
    expect(at("3(x+1)", 1)).toBe(6);
    expect(at("(x-1)(x+1)", 3)).toBe(8);
    expect(at("2pi", 0)).toBeCloseTo(2 * Math.PI);
    expect(at("2xsin(x)", Math.PI / 2)).toBeCloseTo(Math.PI);
  });

  it("gère les fonctions et les constantes", () => {
    expect(at("sqrt(x)", 9)).toBe(3);
    expect(at("cos(37*pi/180)", 0)).toBeCloseTo(0.7986, 4);
    expect(at("ln(e)", 0)).toBe(1);
    expect(at("log(1000)", 0)).toBe(3);
    expect(at("sin x", Math.PI / 2)).toBeCloseTo(1);
  });

  it("normalise les symboles Unicode", () => {
    expect(at("x² − 1", 3)).toBe(8);
    expect(at("2·π", 0)).toBeCloseTo(2 * Math.PI);
    expect(at("√(x)", 16)).toBe(4);
  });

  it("refuse le code arbitraire et les erreurs de syntaxe", () => {
    expect(() => parseExpression("alert(1)")).toThrow(ExprError);
    expect(() => parseExpression("x+")).toThrow(ExprError);
    expect(() => parseExpression("(x+1")).toThrow(ExprError);
    expect(() => parseExpression("x;1")).toThrow(ExprError);
    expect(() => parseExpression("")).toThrow(ExprError);
    expect(() => parseExpression("x".repeat(300))).toThrow(ExprError);
  });
});

describe("variable t", () => {
  it("accepte t comme synonyme de x (axe du temps), sans casser tan ni sqrt", async () => {
    const { compileExpression } = await import("./expr");
    expect(compileExpression("sin(t)+0.5*sin(3*t)")(Math.PI / 2)).toBeCloseTo(1 - 0.5);
    expect(compileExpression("tan(t)")(0)).toBe(0);
    expect(compileExpression("sqrt(t)")(4)).toBe(2);
    expect(compileExpression("2t")(3)).toBe(6);
  });
});

describe("fractions exactes", () => {
  it("calcule sans arrondi IEEE-754 et refuse ce qui n'est pas rationnel", async () => {
    const { exactValue, parseExpression: parse } = await import("./expr");
    expect(exactValue(parse("0.1+0.2"))).toEqual({ numerator: 3n, denominator: 10n });
    expect(exactValue(parse("6/24"))).toEqual({ numerator: 1n, denominator: 4n });
    expect(exactValue(parse("2^-2"))).toEqual({ numerator: 1n, denominator: 4n });
    expect(exactValue(parse("sqrt(2)"))).toBeNull();
    expect(exactValue(parse("1/0"))).toBeNull();
    expect(exactValue(parse("x+1"))).toBeNull();
  });
});

describe("readLatexNumber", () => {
  it("lit les fractions, puissances, racines et la virgule décimale française", async () => {
    const { readLatexNumber } = await import("./expr");
    expect(readLatexNumber(String.raw`\frac{8}{2}`)?.value).toBe(4);
    expect(readLatexNumber(String.raw`\dfrac{9 - 1}{3 - 1}`)?.value).toBe(4);
    expect(readLatexNumber(String.raw`0{,}3`)?.value).toBe(0.3);
    expect(readLatexNumber(String.raw`2\,433{,}40\ \$`)?.value).toBeCloseTo(2433.4);
    expect(readLatexNumber(String.raw`1{,}04^{5}`)?.value).toBeCloseTo(1.2166529);
    expect(readLatexNumber(String.raw`\sqrt{16}`)?.value).toBe(4);
    expect(readLatexNumber(String.raw`\sqrt[3]{27}`)?.value).toBeCloseTo(3);
    expect(readLatexNumber(String.raw`2000 \times 1{,}2167`)?.value).toBeCloseTo(2433.4);
    expect(readLatexNumber(String.raw`\left(\frac{6}{2}\right)^2`)?.value).toBe(9);
    expect(readLatexNumber(String.raw`25\,\%`)?.value).toBe(0.25);
    expect(readLatexNumber(String.raw`\dfrac{10 \times \sin 60^\circ}{\sin 40^\circ}`)?.value).toBeCloseTo(13.473, 3);
  });

  it("donne le demi-écart du dernier chiffre écrit d'un nombre seul", async () => {
    const { readLatexNumber } = await import("./expr");
    expect(readLatexNumber(String.raw`13{,}47\ \text{cm}`)).toMatchObject({ unit: "cm" });
    expect(readLatexNumber(String.raw`2080\ \$`)).toMatchObject({ unit: "$" });
    expect(readLatexNumber("4")).toMatchObject({ unit: null });
    expect(readLatexNumber(String.raw`13{,}47\ \text{cm}`)?.halfUnit).toBeCloseTo(0.005);
    expect(readLatexNumber("13")?.halfUnit).toBe(0.5);
    expect(readLatexNumber(String.raw`6{,}02 \times 10^{23}`)?.halfUnit).toBeCloseTo(0.005e23, -18);
    expect(readLatexNumber(String.raw`\frac{1}{3}`)?.halfUnit).toBeNull();
  });

  it("ne lit pas ce qui n'est pas purement numérique", async () => {
    const { readLatexNumber } = await import("./expr");
    for (const tex of ["x + 1", "C_5", String.raw`\text{pente}`, "M(3 ; 4)", String.raw`a \sin B`, "2 3", String.raw`\pm 2`, "f(2)", String.raw`3\text{ cm} + 2`, "e^2", ""]) {
      expect(readLatexNumber(tex), tex).toBeNull();
    }
  });

  it("marque les degrés hors trigonométrie, pour ne pas comparer 90° à π/2", async () => {
    const { readLatexNumber } = await import("./expr");
    expect(readLatexNumber(String.raw`90^\circ`)).toMatchObject({ value: 90, degrees: true });
    expect(readLatexNumber(String.raw`\frac{\pi}{2}`)).toMatchObject({ degrees: false });
  });
});

describe("splitLatexChains", () => {
  it("découpe aux relations de premier niveau et sépare les énoncés", async () => {
    const { splitLatexChains } = await import("./expr");
    const [chain] = splitLatexChains(String.raw`\text{pente} = \frac{9 - 1}{3 - 1} = \frac{8}{2} = 4`);
    expect(chain!.members.map((m) => m.tex.trim())).toEqual([String.raw`\text{pente}`, String.raw`\frac{9 - 1}{3 - 1}`, String.raw`\frac{8}{2}`, "4"]);
    expect(chain!.relations.map((r) => r.symbol)).toEqual(["=", "=", "="]);
    expect(splitLatexChains(String.raw`a = 1 \quad b \approx 2`)).toHaveLength(2);
    expect(splitLatexChains(String.raw`\frac{a=b}{2} < 3 \Rightarrow x = 4`).map((c) => c.relations.map((r) => r.symbol)))
      .toEqual([["other"], ["="]]);
    // Coordinates keep their semicolon.
    expect(splitLatexChains("M(3 ; 4) = M(3 ; 4)")).toHaveLength(1);
  });
});

describe("compileNamedExpression", () => {
  it("connaît pi, comme les expressions en x", () => {
    // Vu en vraie génération (trigo#1, en-tête) : « Nom inconnu « pi » » dans math_context.
    expect(compileNamedExpression("2*pi*r", new Set(["r"]))(new Map([["r", 1]]))).toBeCloseTo(2 * Math.PI);
    expect(compileNamedExpression("angle*pi/180", new Set(["angle"]))(new Map([["angle", 180]]))).toBeCloseTo(Math.PI);
    // Un symbole déclaré sous ce nom garde la priorité.
    expect(compileNamedExpression("pi", new Set(["pi"]))(new Map([["pi", 3]]))).toBe(3);
    expect(() => compileNamedExpression("tau*2", new Set())).toThrow("Nom inconnu");
  });
});

describe("crochets : parenthèses ou partie entière (P5)", () => {
  it("ne lit pas un membre dont les deux lectures diffèrent, garde celui où elles concordent", async () => {
    const { readLatexNumber } = await import("./expr");
    // « [3{,}7] = 3 » est juste en partie entière : ne plus le lire 3,7.
    expect(readLatexNumber(String.raw`[3{,}7]`)).toBeNull();
    expect(readLatexNumber(String.raw`2[3 + 4]`)?.value).toBe(14);
  });
  it("lit une règle en x, avec la partie entière comme seconde lecture", async () => {
    const { readLatexFunction, orderOf } = await import("./expr");
    const at = (x: number) => new Map([["x", x]]);
    const [plain, floor] = readLatexFunction("[x + 2]", ["x"])!;
    expect(plain!(at(-1.5))).toBe(0.5);
    expect(floor!(at(-1.5))).toBe(0);
    expect(readLatexFunction(String.raw`\frac{1}{2}x^2 - 4x + 3`, ["x"])![0]!(at(2))).toBe(-3);
    expect(readLatexFunction("3x + 2y", ["x", "y"])![0]!(new Map([["x", 4], ["y", 2]]))).toBe(16);
    expect(readLatexFunction("a(x - h)^2", ["x"])).toBeNull();
    expect(orderOf(String.raw`\leq`)).toEqual({ direction: -1, strict: false });
    expect(orderOf("=")).toBeNull();
  });
});
