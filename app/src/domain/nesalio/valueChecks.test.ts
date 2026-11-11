import { describe, expect, it } from "vitest";
import { checkCoherence, type CoherenceAlert } from "./coherence";
import { MathContext, Slice } from "./contract";
import { cellNumber, checkAtomTable, checkConstraintPolygon, checkPhTable, checkValueTable, linearInequalities, regionVertices } from "./valueChecks";

// Each case comes from a lesson of the Alloprof bench (analyses/banc/ap-*) graded with a grave error
// (analyste-erreurs-graves.md § 1), next to the correct writing the same rule must leave alone.

const noMath = MathContext.parse({ symbols: {}, expressions: {} });
type Item = Record<string, unknown>;
const slice = (id: string, introduces: Item[]) =>
  Slice.parse({
    slice_id: id,
    introduces,
    beats: [
      { id: `${id}_b`, say: "Regarde.", cues: [], do: introduces.map((item, i) => ({ id: `${id}_a${i}`, verb: "show", target: item.id, at: "beat:start" })) },
    ],
  });
const run = (...slices: Item[][]) =>
  checkCoherence(
    slices.map((items, i) => slice(`s${i + 1}`, items)),
    noMath,
  );
const rules = (alerts: CoherenceAlert[]) => alerts.map((alert) => `${alert.outcome}/${alert.rule}`);
const math = (id: string, content: string) => ({ id, type: "math", content });
const matrix = (id: string, params: Item) => ({ id, type: "matrix", params });

describe("tableau d'atomes et équation chimique", () => {
  const acetic = String.raw`\ce{CH3COOH + HCO3- -> CH3COO- + H2O + CO2}`;
  it("refuse le comptage faux de bicarbonate-vinaigre et donne les bons nombres", () => {
    const issue = checkAtomTable(
      "tab",
      {
        rows: [
          [2, 4, 3],
          [2, 4, 3],
        ],
        row_labels: ["réactifs", "produits"],
        column_labels: ["C", "H", "O"],
      },
      [acetic],
    );
    expect(issue?.message).toContain("réactifs : C 3, H 5, O 5");
    const result = run(
      [math("eq", acetic)],
      [
        matrix("tab", {
          rows: [
            [2, 4, 3],
            [2, 4, 3],
          ],
          row_labels: ["réactifs", "produits"],
          column_labels: ["C", "H", "O"],
        }),
      ],
    );
    expect(rules(result.alerts)).toEqual(["refused/atom_table"]);
  });
  it("refuse le bilan « H à gauche | H à droite » de masse-moles", () => {
    const issue = checkAtomTable(
      "bilan",
      {
        rows: [
          [4, 2],
          [2, 1],
          [2, 2],
        ],
        row_labels: ["H à gauche | H à droite", "O à gauche | O à droite", "molécules à gauche | molécules à droite"],
      },
      [String.raw`2\,\ce{H2} + \ce{O2} -> 2\,\ce{H2O}`],
    );
    expect(issue?.message).toContain("il faut réactifs : H 4, O 2 ; produits : H 4, O 2");
  });
  it("accepte le tableau de départ (équation squelette), le tableau final et la forme transposée", () => {
    const formulas = [String.raw`\ce{C3H8 + O2 -> CO2 + H2O}`, String.raw`\ce{C3H8 + 5O2 -> 3CO2 + 4H2O}`];
    expect(
      checkAtomTable(
        "tab",
        {
          rows: [
            [3, 8, 2],
            [1, 2, 3],
          ],
          row_labels: ["réactifs", "produits"],
          column_labels: ["C", "H", "O"],
        },
        formulas,
      ),
    ).toBeNull();
    expect(
      checkAtomTable(
        "verif",
        {
          rows: [
            ["3", "8", "10"],
            ["3", "8", "10"],
          ],
          row_labels: ["réactifs", "produits"],
          column_labels: ["C", "H", "O"],
        },
        formulas,
      ),
    ).toBeNull();
    expect(
      checkAtomTable(
        "verif",
        {
          rows: [
            ["1", "1"],
            ["2", "2"],
            ["2", "2"],
          ],
          row_labels: ["Zn", "H", "Cl"],
          column_labels: ["à gauche", "à droite"],
        },
        [String.raw`\ce{Zn + 2HCl -> ZnCl2 + H2}`],
      ),
    ).toBeNull();
  });
  it("ne dit rien sans équation dans la leçon, ni sur un tableau sans côtés", () => {
    expect(
      checkAtomTable(
        "tab",
        {
          rows: [
            [2, 4, 3],
            [2, 4, 3],
          ],
          row_labels: ["réactifs", "produits"],
          column_labels: ["C", "H", "O"],
        },
        [],
      ),
    ).toBeNull();
    expect(
      checkAtomTable(
        "masse",
        {
          rows: [
            [2, 1.01],
            [1, 16],
          ],
          row_labels: ["H", "O"],
          column_labels: ["nombre d'atomes", "masse atomique (g/mol)"],
        },
        [String.raw`\ce{2H2 + O2 -> 2H2O}`],
      ),
    ).toBeNull();
  });
});

describe("table de valeurs et règle", () => {
  it("refuse la table de quadratique-table (x + 1)² sous la règle f(x) = x²", () => {
    const result = run([
      matrix("tab", {
        rows: [
          [0, 1, 2, 3, 4],
          [1, 4, 9, 16, 25],
        ],
        row_labels: ["x", "f(x)"],
      }),
      math("regle", "f(x) = x^2"),
    ]);
    expect(rules(result.alerts)).toEqual(["refused/value_table"]);
    expect(result.alerts[0]!.message).toContain("en x = 0, elle donne 0, pas 1");
  });
  it("refuse la table de zeros-partie-entiere : son en-tête « f(x) = [x] » donne f(−1) = −1", () => {
    const issue = checkValueTable(
      "tab",
      {
        rows: [
          [-1, 0, 1.5, 2.3, "adequacy"],
          [0, 0, 1, 2, 2],
        ],
        row_labels: ["x", "f(x) = [x]"],
      },
      [],
      [],
    );
    expect(issue?.message).toContain("en x = −1, elle donne −1, pas 0");
  });
  it("accepte une table juste, en colonnes, arrondie, ou qui suit une autre règle de la leçon", () => {
    expect(
      checkValueTable(
        "tab",
        {
          rows: [
            [-2, 9],
            [-1, 4],
            [0, 1],
            [1, 0],
            [2, 1],
          ],
          column_labels: ["x", "f(x)"],
        },
        ["f(x) = x^2", "f(x) = (x - 1)^2"],
        [],
      ),
    ).toBeNull();
    expect(
      checkValueTable(
        "t",
        {
          rows: [
            [0, 1, 2],
            [1, 1.41, 1.73],
          ],
          row_labels: ["x", "g(x)"],
        },
        [String.raw`g(x) = \sqrt{x + 1}`],
        [],
      ),
    ).toBeNull();
    expect(
      checkValueTable(
        "t",
        {
          rows: [
            ["entrée", "10", "100"],
            ["log", "1", "2"],
          ],
          row_labels: ["x", "log(x)"],
        },
        [],
        [],
      ),
    ).toBeNull();
    expect(
      checkValueTable(
        "tab",
        {
          rows: [
            [0, 0, 0],
            [4, 0, 12],
            [4, 2, 16],
            [0, 6, 12],
          ],
          column_labels: ["x", "y", "3x + 2y"],
        },
        [],
        [],
      ),
    ).toBeNull();
  });
  it("ne dit rien quand la règle n'est pas écrite ou a des paramètres", () => {
    expect(
      checkValueTable(
        "tab",
        {
          rows: [
            [0, 1],
            [1, 4],
          ],
          row_labels: ["x", "f(x)"],
        },
        ["f(x) = a(x - h)^2 + k"],
        [],
      ),
    ).toBeNull();
    expect(
      checkValueTable(
        "tab",
        {
          rows: [
            [0, 1],
            [1, 4],
          ],
          row_labels: ["x", "f(x)"],
        },
        [],
        [],
      ),
    ).toBeNull();
  });
});

describe("pH et [H⁺]", () => {
  it("refuse la table de ph-log où [H⁺] vaut 10, 100, 1000", () => {
    const issue = checkPhTable("tab", {
      rows: [
        [1, 2, 3],
        [10, 100, 1000],
      ],
      row_labels: ["pH", "[H⁺] (mol/L)"],
    });
    expect(issue?.message).toContain("10^(−pH) = 0,1 mol/L");
  });
  it("accepte 10⁻², 0,001 et un pH arrondi", () => {
    expect(
      checkPhTable("tab", {
        rows: [
          [2, 3, 3.5],
          ["10⁻²", "0,001", "3,2 × 10⁻⁴"],
        ],
        row_labels: ["pH", "[H₃O⁺]"],
      }),
    ).toBeNull();
    expect(cellNumber("1 × 10^-3")?.value).toBeCloseTo(0.001);
  });
});

describe("points nommés sur une courbe", () => {
  const axes = { id: "rep", type: "axes", params: { x: [0, 12], y: [0, 3] } };
  const wave = { id: "vague", type: "function_graph", params: { expression: "1.5+1*cos(3.14159265*x/3)", domain: [0, 12] } };
  it("refuse le creux et le sommet de periodique-periode posés hors de la courbe", () => {
    const result = run([axes, wave, { id: "sommet1", type: "point", params: { at: [3, 2.5] } }, { id: "creux1", type: "point", params: { at: [0, 0.5] } }]);
    expect(rules(result.alerts)).toEqual(["refused/named_point", "refused/named_point"]);
    expect(result.alerts[1]!.message).toContain("en x = 0, elle vaut 2,5");
  });
  it("laisse un sommet juste, un « zéro » de corrélation, un sommet au-dessus du sol plat", () => {
    expect(run([axes, wave, { id: "creux1", type: "point", params: { at: [3, 0.5] } }]).alerts).toEqual([]);
    const line = { id: "droite", type: "function_graph", params: { expression: "-0.64*x+8.14" } };
    expect(run([{ id: "ax", type: "axes", params: { x: [0, 8], y: [0, 10] } }, line, { id: "p_zero", type: "point", params: { at: [1, 4] } }]).alerts).toEqual(
      [],
    );
    const ground = { id: "sol", type: "function_graph", params: { expression: "0", domain: [0, 35] } };
    expect(
      run([{ id: "ax", type: "axes", params: { x: [0, 40], y: [-1, 7] } }, ground, { id: "sommet", type: "point", params: { at: [17.6, 5.1] } }]).alerts,
    ).toEqual([]);
  });
});

describe("polygone de contraintes", () => {
  it("refuse le triangle de polygone-contraintes : il manque le sommet (6 ; 0)", () => {
    const result = run([
      { id: "axes", type: "axes", params: { x: [0, 8], y: [0, 6] } },
      {
        id: "poly",
        type: "polygon",
        params: {
          vertices: [
            [0, 0],
            [0, 1],
            [5, 1],
          ],
        },
      },
      { id: "c1", type: "callout", content: "x + y ≤ 6" },
      { id: "c2", type: "callout", content: "y ≤ 1" },
      { id: "c3", type: "callout", content: "et x ≥ 0, y ≥ 0" },
    ]);
    expect(rules(result.alerts)).toEqual(["refused/constraint_polygon"]);
    expect(result.alerts[0]!.message).toContain("Il manque (6 ; 0)");
  });
  it("accepte la bonne région, même avec un point posé au milieu d'un côté", () => {
    const planes = linearInequalities(String.raw`x \ge 0, \; y \ge 0, \; x + y \le 6, \; x \le 4`);
    expect(planes).toHaveLength(4);
    expect(regionVertices(planes)).toHaveLength(4);
    expect(
      checkConstraintPolygon(
        "zone",
        [
          [0, 0],
          [4, 0],
          [4, 2],
          [2, 4],
          [0, 6],
        ],
        planes,
      ),
    ).toBeNull();
  });
  it("ne dit rien sur une région non bornée ou une seule inégalité", () => {
    expect(
      checkConstraintPolygon(
        "p",
        [
          [0, 0],
          [1, 0],
          [0, 1],
        ],
        linearInequalities("x ≥ 0, y ≥ 0"),
      ),
    ).toBeNull();
    expect(
      checkConstraintPolygon(
        "p",
        [
          [0, 0],
          [1, 0],
          [0, 1],
        ],
        linearInequalities("x + y ≤ 6"),
      ),
    ).toBeNull();
  });
});

describe("valeurs écrites dans une autre formule", () => {
  it("refuse x ≈ 2,17 d'exponentielle-bases après x = 3 log 7 / (2 log 7 − log 5)", () => {
    const result = run([math("isoler", String.raw`x = \frac{3\log 7}{2\log 7 - \log 5}`), math("valeur", String.raw`x \approx 2{,}17`)]);
    expect(rules(result.alerts)).toEqual(["refused/named_value"]);
    expect(result.alerts[0]!.message).toContain("vaut 2,56");
  });
  it("accepte les deux solutions d'une équation, et un nouvel exemple après une autre équation en x", () => {
    expect(
      run([
        math("e5", String.raw`x = 2 + \sqrt{3} \quad \text{ou} \quad x = 2 - \sqrt{3}`),
        math("e6", String.raw`x \approx 3{,}732 \quad \text{ou} \quad x \approx 0{,}268`),
      ]).alerts,
    ).toEqual([]);
    expect(run([math("a", String.raw`x = \frac{12}{4}`), math("b", "2x = 9"), math("c", String.raw`x = 4{,}5`)]).alerts).toEqual([]);
  });
});

describe("partie entière entre crochets (zeros-partie-entiere, coupée par un faux refus)", () => {
  it("ne refuse plus « [3{,}7] = 3 »", () => {
    expect(run([math("ex", String.raw`[3{,}7] = 3`), math("ex2", String.raw`[-1{,}2] = -2`)]).alerts).toEqual([]);
  });
});

describe("inégalités numériques", () => {
  it("refuse 10 ≤ 7 et 2 < 2, accepte 1 ≤ 6, 1 ≤ 1 et une inégalité fausse montrée exprès", () => {
    expect(rules(run([math("v", String.raw`3 + 7 \le 7`)]).alerts)).toEqual(["refused/false_inequality"]);
    expect(rules(run([math("v", "2 < 2")]).alerts)).toEqual(["refused/false_inequality"]);
    expect(
      run([
        math("v", String.raw`0 + 1 = 1 \le 6`),
        math("w", String.raw`1 \le 1`),
        math("faux", String.raw`10 \le 7`),
        math("x", String.raw`3{,}14 > 3{,}1416`),
      ]).alerts,
    ).toEqual([]);
  });
});

describe("cas limites du relecteur (2026-11-09) : rien à refuser", () => {
  const axes = { id: "ax", type: "axes", params: { x: [0, 8], y: [0, 8] } };
  it("une inéquation en x résolue dans la tranche n'est pas une contrainte du polygone", () => {
    expect(
      run([
        axes,
        {
          id: "poly",
          type: "polygon",
          params: {
            vertices: [
              [0, 0],
              [6, 0],
              [2, 4],
            ],
          },
        },
        math("i1", String.raw`x + y \le 6`),
        math("i2", String.raw`y \le 2x`),
        math("i3", String.raw`x \ge 0`),
        math("i4", String.raw`y \ge 0`),
        math("ex", String.raw`3x - 4 > 2x + 1`),
      ]).alerts,
    ).toEqual([]);
  });
  it("un rappel qui ne redit qu'une partie des contraintes garde le polygone de la leçon", () => {
    expect(
      run(
        [axes, math("i1", String.raw`x \ge 1`), math("i2", String.raw`y \ge 1`), math("i3", String.raw`x + y \le 6`), math("i4", String.raw`y \le 3`)],
        [
          axes,
          {
            id: "poly",
            type: "polygon",
            params: {
              vertices: [
                [1, 1],
                [5, 1],
                [3, 3],
                [1, 3],
              ],
            },
          },
          math("r1", String.raw`x \ge 1`),
          math("r2", String.raw`y \ge 1`),
          math("r3", String.raw`x + y \le 6`),
        ],
      ).alerts,
    ).toEqual([]);
  });
  it("un « max » ou un « sommet » posé hors d'une droite n'est pas un point de cette droite", () => {
    expect(
      run([axes, { id: "f", type: "function_graph", params: { expression: "3*x" } }, { id: "max", type: "point", params: { at: [6, 0] } }]).alerts,
    ).toEqual([]);
  });
  it("[H⁺] relative ou en mmol/L n'est pas comparée à 10^(−pH) ; le message écrit 1 × 10⁻⁷", () => {
    expect(
      checkPhTable("t", {
        rows: [
          [7, 6, 5],
          [1, 10, 100],
        ],
        row_labels: ["pH", "[H⁺] comparée à l'eau pure (fois)"],
      }),
    ).toBeNull();
    expect(checkPhTable("t", { rows: [[3], [1]], row_labels: ["pH", "[H⁺] (mmol/L)"] })).toBeNull();
    expect(checkPhTable("t", { rows: [[7], [1]], row_labels: ["pH", "[H⁺] (mol/L)"] })?.message).toContain("= 1 × 10⁻⁷ mol/L");
  });
});
