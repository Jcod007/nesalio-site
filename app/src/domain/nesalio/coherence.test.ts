import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkCoherence, emptyCoherence, type CoherenceAlert } from "./coherence";
import { MathContext, Slice } from "./contract";
import { lessonHeader } from "./lesson";
import { validateLesson, validateModelOutput } from "./validate";

const noMath = { symbols: {}, expressions: {} };
type Item = Record<string, unknown>;
const slice = (id: string, introduces: Item[], actions: Item[] = []) =>
  Slice.parse({
    slice_id: id,
    introduces,
    beats: [
      {
        id: `${id}_b`,
        say: "Regarde.",
        cues: [],
        do: [
          ...introduces.map((item, i) => ({ id: `${id}_a${i}`, verb: "show", target: item.id, at: "beat:start" })),
          ...actions.map((action, i) => ({ id: `${id}_x${i}`, at: "beat:start", ...action })),
        ],
      },
    ],
  });
const check = (introduces: Item[], math = noMath, actions: Item[] = []) => checkCoherence([slice("s1", introduces, actions)], MathContext.parse(math));
const rules = (alerts: CoherenceAlert[]) => alerts.map((alert) => `${alert.outcome}/${alert.rule}`);
const axes = (x: [number, number], y: [number, number]) => ({ id: "ax", type: "axes", params: { x, y } });
const math = (id: string, content: string, extra: Item = {}) => ({ id, type: "math", content, ...extra });

describe("point sur une courbe", () => {
  const parabola = { id: "courbe", type: "function_graph", params: { expression: "x^2", domain: [-1, 3] } };
  it("calcule le y d'un point posé à côté de sa courbe", () => {
    const result = check([axes([-1, 4], [-1, 10]), parabola, { id: "P", type: "point", params: { at: [3, 8.6] } }]);
    expect(rules(result.alerts)).toEqual(["corrected/point_on_curve"]);
    expect(result.slices[0]!.introduces[2]).toMatchObject({ params: { at: [3, 9] } });
  });
  it("signale seulement (sans corriger) quand une étiquette écrit l'ancien y", () => {
    const result = check([
      axes([-1, 4], [-1, 10]),
      parabola,
      { id: "P", type: "point", params: { at: [3, 8.6] } },
      { id: "lP", type: "label", content: "P (3 ; 8,6)", attachment: { parent: "P", anchor: "right" } },
    ]);
    expect(rules(result.alerts)).toEqual(["noted/point_on_curve"]);
    expect(result.slices[0]!.introduces[2]).toMatchObject({ params: { at: [3, 8.6] } });
    expect(result.alerts[0]!.message).toContain("vaut 9");
  });
  it("laisse un point exact, une racine arrondie et un nuage de points", () => {
    expect(check([axes([-1, 4], [-1, 10]), parabola, { id: "P", type: "point", params: { at: [3, 9] } }]).alerts).toEqual([]);
    const roots = { id: "c", type: "function_graph", params: { expression: "x^2-4*x+1" } };
    expect(check([axes([-1, 5], [-4, 6]), roots, { id: "z", type: "point", params: { at: [0.27, 0] } }]).alerts).toEqual([]);
    const line = { id: "d", type: "function_graph", params: { expression: "-1.2*x+10.4" } };
    const cloud = [
      [1, 9.4],
      [2, 7.7],
      [3, 6.9],
      [4, 5.3],
    ].map((at, i) => ({ id: `p${i}`, type: "point", params: { at } }));
    expect(check([axes([0, 7], [0, 11]), line, ...cloud]).alerts).toEqual([]);
  });
});

describe("droites", () => {
  it("pose l'extrémité d'un segment sur le point qu'il relie", () => {
    const result = check([
      axes([0, 10], [0, 10]),
      { id: "A", type: "point", params: { at: [1, 2] } },
      { id: "seg", type: "line", params: { from: [1.05, 2], to: [5, 6] } },
    ]);
    expect(rules(result.alerts)).toEqual(["corrected/line_endpoint"]);
    expect(result.slices[0]!.introduces[2]).toMatchObject({ params: { from: [1, 2] } });
  });

  it("refuse une pente annoncée par l'étiquette qui ne correspond pas au tracé", () => {
    const tangent = (expression: string, text: string) =>
      check([
        { id: "t", type: "function_graph", params: { expression } },
        { id: "lt", type: "label", content: text, attachment: { parent: "t", anchor: "right" } },
      ]);
    expect(tangent("2*x-1", "tangente : pente 2").alerts).toEqual([]);
    expect(rules(tangent("2.4*x-1", "tangente : pente 2").alerts)).toEqual(["refused/slope"]);
  });

  // base-nombre-derive: the secant AP drawn with slope 3, said to have slope 4.
  it("refuse une sécante dont la pente contredit la formule de la tranche", () => {
    const tranche = (expression: string) =>
      check([
        { id: "secante", type: "function_graph", params: { expression, domain: [-1, 3.2] } },
        { id: "montee", type: "line", params: { from: [3, 1], to: [3, 9] } },
        { id: "avancee", type: "line", params: { from: [1, 1], to: [3, 1] } },
        math("frac_pente", String.raw`\text{pente} = \frac{9 - 1}{3 - 1} = \frac{8}{2} = 4`),
      ]);
    const wrong = tranche("3*(x-1)+1");
    expect(rules(wrong.alerts)).toEqual(["refused/slope"]);
    expect(wrong.alerts[0]!.message).toContain("pente 3");
    expect(tranche("4*(x-1)+1").alerts).toEqual([]);
  });

  // base-mediatrice: the « perpendicular » bisector drawn with slope 1/2.
  it("refuse une droite dite perpendiculaire qui ne l'est pas, et donne la pente attendue", () => {
    const figure = (to: [number, number]) =>
      check([
        axes([-1, 9], [-1, 9]),
        { id: "seg", type: "line", params: { from: [1, 2], to: [5, 6] } },
        { id: "ligne_perp", type: "line", params: { from: [3, 4], to } },
      ]);
    const wrong = figure([5, 5]);
    expect(rules(wrong.alerts)).toEqual(["refused/perpendicular"]);
    expect(wrong.alerts[0]!.message).toContain("−1");
    expect(figure([5, 2]).alerts).toEqual([]);
  });

  it("refuse une pente écrite (m_⊥ = −1) que la droite tracée n'a pas", () => {
    const result = check([math("rule", String.raw`m_{\perp} = -\frac{1}{1} = -1`), { id: "d", type: "line", params: { from: [3, 4], to: [5, 5] } }]);
    expect(rules(result.alerts)).toEqual(["refused/slope"]);
  });
});

describe("axes", () => {
  // base-portee: landing point at x = 18 on axes going to 14.
  it("refuse un objet tracé hors des axes, pas une courbe (coupée par le moteur)", () => {
    const result = check([
      axes([0, 14], [0, 3]),
      { id: "arc", type: "function_graph", params: { expression: "x*(18-x)/10" } },
      { id: "arrivee", type: "point", params: { at: [18, 0] } },
    ]);
    expect(rules(result.alerts)).toEqual(["refused/outside_axes"]);
    expect(result.alerts[0]!.message).toContain("x va de 0 à 14");
  });
});

describe("formules", () => {
  it("refuse une égalité numérique fausse et donne la bonne valeur", () => {
    for (const [content, value] of [
      [String.raw`\frac{8}{2} = 3`, "4"],
      [String.raw`B = \frac{6}{24} = 0{,}3`, "0,25"],
    ] as const) {
      const result = check([math("f", content)]);
      expect(rules(result.alerts), content).toEqual(["refused/false_equality"]);
      expect(result.alerts[0]!.message).toContain(`vaut ${value}`);
    }
    expect(rules(check([math("f", String.raw`1{,}04^{5} \approx 1{,}3`)]).alerts)).toEqual(["refused/false_equality"]);
  });

  it("lit « × 100 ≈ 84,3 % » comme l'écrit l'école, et refuse encore un pourcentage faux", () => {
    // Banc Alloprof (rendement-theorique) : refusé trois fois, la leçon s'arrêtait.
    for (const content of [
      String.raw`\frac{35{,}0}{41{,}5} \times 100 \approx 84{,}3 \%`,
      String.raw`\frac{35{,}0}{41{,}5} \approx 84{,}3 \%`,
      String.raw`0{,}843 = 84{,}3\%`,
    ])
      expect(rules(check([math("f", content)]).alerts), content).toEqual([]);
    expect(rules(check([math("f", String.raw`\frac{35}{41{,}5} \times 100 < 90 \%`)]).alerts)).toEqual([]);
    expect(rules(check([math("f", String.raw`\frac{35}{41{,}5} \times 100 > 90 \%`)]).alerts)).toEqual(["refused/false_inequality"]);
    // Without « × 100 », the percent keeps its value: these are still errors (relecture du code).
    for (const content of [
      String.raw`\frac{35{,}0}{41{,}5} \times 100 \approx 80 \%`,
      String.raw`25 = 25\%`,
      String.raw`0{,}25 = 0{,}25\%`,
      String.raw`\frac{1}{4} = 0{,}25 \%`,
      String.raw`\frac{35}{41{,}5} \approx 0{,}843 \%`,
    ]) {
      expect(rules(check([math("f", content)]).alerts), content).toEqual(["refused/false_equality"]);
    }
  });

  it("remplace = par ≈ pour un simple arrondi", () => {
    const result = check([math("f", String.raw`\frac{1}{3} = 0{,}333`)]);
    expect(rules(result.alerts)).toEqual(["corrected/rounded_equality"]);
    expect(result.slices[0]!.introduces[0]).toMatchObject({ content: String.raw`\frac{1}{3} \approx 0{,}333` });
  });

  it("laisse les égalités justes, les conversions d'unités et les erreurs montrées exprès", () => {
    for (const content of [
      String.raw`\text{pente} = \frac{9 - 1}{3 - 1} = \frac{8}{2} = 4`,
      String.raw`C_5 = 2000 \times 1{,}2167 = 2433{,}40\ \$`,
      String.raw`1\ \text{mol} = 6{,}02 \times 10^{23}`,
      String.raw`90^\circ = \frac{\pi}{2}`,
      String.raw`b \approx 13{,}47\ \text{cm}`,
      String.raw`A : \; y = -x + 7 \Rightarrow 2 = -1 + 7 = 6 \;\times`,
      String.raw`M(3 ; 4) = M(3 ; 4)`,
      "x = 4",
    ])
      expect(check([math("f", content)]).alerts, content).toEqual([]);
    expect(check([math("faux", String.raw`\frac{8}{2} = 3`)]).alerts).toEqual([]);
  });

  // base-interets-composes: 2433,40 $ written while math_context computes 2000*1.04^5 = 2433,31.
  it("refuse une valeur finale qui contredit l'expression du math_context", () => {
    const context = { symbols: {}, expressions: { expr5: "2000*1.04^5" } };
    const wrong = check([math("valeur", String.raw`C_5 = 2000 \times 1{,}2167 = 2433{,}40\ \$`)], context);
    expect(rules(wrong.alerts)).toEqual(["refused/math_context"]);
    expect(wrong.alerts[0]!.message).toContain("2433,31");
    expect(check([math("valeur", String.raw`C_5 = 2000 \times 1{,}04^{5} \approx 2433{,}31\ \$`)], context).alerts).toEqual([]);
    // Another quantity of the lesson, far from the expression: not compared.
    expect(check([math("taux", String.raw`1{,}04^{5} \approx 1{,}2167`)], context).alerts).toEqual([]);
  });
});

describe("chimie", () => {
  it("refuse une équation présentée comme équilibrée qui ne l'est pas", () => {
    const result = check([math("eq_finale", String.raw`C_3H_8 + 5\,O_2 \rightarrow 3\,CO_2 + 3\,H_2O`)]);
    expect(rules(result.alerts)).toEqual(["refused/chemical_balance"]);
    expect(result.alerts[0]!.message).toContain("H : 8 à gauche, 6 à droite");
    expect(check([math("eq_finale", String.raw`\ce{C3H8 + 5O2 -> 3CO2 + 4H2O}`)]).alerts).toEqual([]);
  });

  it("laisse les étapes intermédiaires d'un équilibrage, refuse un élément d'un seul côté", () => {
    expect(check([math("step2", String.raw`C_3H_8 + O_2 \rightarrow 3\,CO_2 + 4\,H_2O`)]).alerts).toEqual([]);
    expect(check([math("eq_dep", String.raw`C_3H_8 + O_2 \rightarrow CO_2 + H_2O`)]).alerts).toEqual([]);
    expect(rules(check([math("step", String.raw`C_3H_8 + O_2 \rightarrow CO_2`)]).alerts)).toEqual(["refused/chemical_balance"]);
  });
});

describe("dit sans montrer", () => {
  const params = { symbols: { q: { kind: "parameter", initial: 3, min: 1, max: 3 } }, expressions: {} };
  // base-derivee: « the secant pivots » while no object reads q.
  it("refuse d'animer un paramètre qu'aucun objet ne lit", () => {
    const animate = { verb: "animate_parameter", parameter: "q", from: 3, to: 1 };
    const still = check([{ id: "s", type: "function_graph", params: { expression: "3*(x-1)+1" } }], params, [animate]);
    expect(rules(still.alerts)).toEqual(["refused/unused_parameter"]);
    expect(check([{ id: "s", type: "function_graph", params: { expression: "(q+1)*(x-1)+1" } }], params, [animate]).alerts).toEqual([]);
  });

  it("signale une formule réécrite et un surlignage sur un objet effacé", () => {
    const repeated = check([math("formule", "I = U/R")], noMath, [
      { verb: "write", target: "formule" },
      { verb: "write", target: "formule" },
    ]);
    expect(rules(repeated.alerts)).toEqual(["noted/repeated_write", "noted/repeated_write"]);
    const faded = check([{ id: "d", type: "line", params: { from: [0, 0], to: [1, 1] } }], noMath, [
      { verb: "fade_out", target: "d" },
      { verb: "highlight", target: "d" },
    ]);
    expect(rules(faded.alerts)).toEqual(["noted/highlight_hidden"]);
  });
});

describe("branché dans validate.ts", () => {
  const output = (introduces: Item[]) => ({ slices: [slice("s2", introduces)] });
  it("rend la tranche corrigée et ses alertes", () => {
    const result = validateModelOutput(
      output([
        axes([-1, 4], [-1, 10]),
        { id: "c", type: "function_graph", params: { expression: "x^2" } },
        { id: "P", type: "point", params: { at: [3, 8.6] } },
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.slices[0]!.introduces[2]).toMatchObject({ params: { at: [3, 9] } });
    expect(rules(result.alerts)).toEqual(["corrected/point_on_curve"]);
  });

  it("refuse avec un message qui donne la bonne valeur", () => {
    const result = validateModelOutput(output([math("f", String.raw`\frac{8}{2} = 3`)]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([{ path: ["slices", 0, "introduces", 0, "content"], message: expect.stringContaining("vaut 4") }]);
    expect(rules(result.alerts ?? [])).toEqual(["refused/false_equality"]);
  });

  it("garde les figures d'une tranche à l'autre (repère rejoint avec frame)", () => {
    const first = validateModelOutput(output([axes([-1, 4], [-1, 10]), { id: "c", type: "function_graph", params: { expression: "x^2" } }]));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const next = validateModelOutput({ slices: [slice("s3", [{ id: "P", type: "point", params: { at: [2, 3.8] }, frame: "c" }])] }, first.state);
    expect(next.ok).toBe(true);
    if (next.ok) expect(next.value.slices[0]!.introduces[0]).toMatchObject({ params: { at: [2, 4] } });
  });
});

// Real lessons generated by Nesalio (analyses/generations, outside the app): what a correct lesson
// writes must pass; the known errors of the tester must be found.
const corpus = path.resolve(__dirname, "../../../../analyses/generations");
describe.skipIf(!fs.existsSync(corpus))("leçons réelles", () => {
  const refusals: string[] = [];
  let lessons = 0;
  for (const file of fs
    .readdirSync(fs.existsSync(corpus) ? corpus : ".")
    .filter((name) => name.endsWith(".json") && !name.endsWith(".rapport.json"))
    .sort()) {
    const document = JSON.parse(fs.readFileSync(path.join(corpus, file), "utf8"));
    if (!Array.isArray(document.slices)) continue;
    lessons++;
    const mathContext = MathContext.safeParse(document.scene?.math_context ?? noMath);
    let state = emptyCoherence;
    for (const raw of document.slices) {
      const parsed = Slice.safeParse(raw);
      if (!parsed.success) continue;
      const result = checkCoherence([parsed.data], mathContext.success ? mathContext.data : noMath, state);
      state = result.state;
      for (const alert of result.alerts) if (alert.outcome === "refused") refusals.push(`${file} ${raw.slice_id} ${alert.rule} ${alert.object}`);
    }
  }

  it("ne refuse que les erreurs connues (aucune leçon juste refusée)", () => {
    expect(lessons).toBeGreaterThan(100);
    expect(refusals).toEqual([
      "base-derivee.json s_rapproche unused_parameter q",
      "base-interets-composes.json s_calcul math_context valeur",
      "base-mediatrice.json s_pente slope ligne_perp",
      "base-nombre-derive.json s_secante slope secante",
      "base-portee.json s_idee outside_axes arrivee",
    ]);
  });
});

// Relecture du lot 2 (relecture-lot2.md) : faux positifs à ne plus produire.
describe("relecture : aucune fausse alerte", () => {
  const capital = { symbols: {}, expressions: { capital: "2000*1.04^5" } };
  it("1. math_context : laisse l'intérêt simple comparé et le piège d'arrondi montré exprès", () => {
    expect(check([math("simple", String.raw`2000 + 5 \times 80 = 2400`)], capital).alerts).toEqual([]);
    expect(check([math("erreur_arrondi", String.raw`2000 \times 1{,}2167 = 2433{,}40`)], capital).alerts).toEqual([]);
    expect(check([math("piege", String.raw`2000 \times 1{,}2167 = 2433{,}40 \quad \text{faux}`)], capital).alerts).toEqual([]);
  });

  it("2. ne déplace pas sur la parabole un point juste posé sur la tangente", () => {
    const result = check([
      axes([-1, 4], [-2, 10]),
      { id: "f", type: "function_graph", params: { expression: "x^2" } },
      { id: "tan", type: "line", params: { from: [1, 0], to: [3, 8] } },
      { id: "q", type: "point", params: { at: [2.5, 6] } },
    ]);
    expect(result.alerts).toEqual([]);
    expect(result.slices[0]!.introduces[3]).toMatchObject({ params: { at: [2.5, 6] } });
  });

  it("3. lit le texte au-dessus d'une flèche de réaction comme une condition, pas un produit", () => {
    for (const content of [
      String.raw`\ce{NaCl(s) ->[H2O] Na+(aq) + Cl-(aq)}`,
      String.raw`\ce{CaCO3 ->[chaleur] CaO + CO2 ^}`,
      String.raw`\ce{N2 + 3H2 <=>[Fe][450 °C] 2NH3}`,
      String.raw`NaCl \xrightarrow{H_2O} Na^+ + Cl^-`,
      String.raw`\ce{Ag+ + Cl- -> AgCl v}`,
    ]) {
      expect(check([math("eq_finale", content)]).alerts, content).toEqual([]);
    }
  });

  it("4. ne corrige pas le point faux de l'élève montré exprès", () => {
    const parabola = { id: "c", type: "function_graph", params: { expression: "x^2" } };
    expect(check([axes([-1, 4], [-1, 10]), parabola, { id: "p_eleve", type: "point", params: { at: [2, 4.4] } }]).alerts).toEqual([]);
    expect(
      check([
        axes([-1, 4], [-1, 10]),
        parabola,
        { id: "p", type: "point", params: { at: [2, 4.4] } },
        { id: "lab_faux", type: "label", content: "P (2 ; 4,4)", attachment: { parent: "p", anchor: "right" } },
      ]).alerts,
    ).toEqual([]);
  });

  it("5. a = 2 d'une forme canonique n'est pas une pente", () => {
    expect(
      check([
        { id: "par", type: "function_graph", params: { expression: "2*x^2" } },
        math("coef", "a = 2"),
        { id: "sec", type: "function_graph", params: { expression: "4*x-2" } },
      ]).alerts,
    ).toEqual([]);
  });

  it("6. une flèche entre deux lettres n'est pas une équation chimique", () => {
    for (const content of [String.raw`B \rightarrow C`, String.raw`C \rightarrow O`, "A -> B"]) {
      expect(check([math("chemin", content)]).alerts, content).toEqual([]);
    }
  });

  it("8. compte les axes comme droites pour la perpendicularité", () => {
    expect(
      check([
        axes([-1, 9], [-1, 9]),
        { id: "seg", type: "line", params: { from: [1, 2], to: [5, 6] } },
        { id: "perp_x", type: "line", params: { from: [3, 0], to: [3, 8] } },
      ]).alerts,
    ).toEqual([]);
  });

  it("9. une flèche qui s'arrête juste avant un point n'y est pas recollée", () => {
    expect(
      check([axes([0, 10], [0, 10]), { id: "A", type: "point", params: { at: [1, 2] } }, { id: "fl", type: "arrow", params: { from: [5, 6], to: [1.1, 2.1] } }])
        .alerts,
    ).toEqual([]);
  });

  it("10. ne corrige pas un point d'un petit nuage autour d'une droite d'ajustement", () => {
    const fit = { id: "ajustement", type: "function_graph", params: { expression: "x+1" } };
    const cloud = [
      [1, 2],
      [2, 3],
      [3, 4.3],
    ].map((at, i) => ({ id: `n${i}`, type: "point", params: { at } }));
    expect(check([axes([0, 6], [0, 7]), fit, ...cloud]).alerts).toEqual([]);
  });
});

describe("relecture : leçons enregistrées", () => {
  it("7. validateLesson charge une leçon enregistrée et rend ses alertes en signalement", () => {
    const header = lessonHeader(
      { id: "l", title: "Intérêts", language: "fr", learning_goal: "Calculer." },
      { symbols: {}, expressions: { expr5: "2000*1.04^5" } },
    );
    const result = validateLesson({ ...header, slices: [slice("s1", [math("valeur", String.raw`C_5 = 2000 \times 1{,}2167 = 2433{,}40\ \$`)])] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(rules(result.alerts)).toEqual(["noted/math_context"]);
  });
});
