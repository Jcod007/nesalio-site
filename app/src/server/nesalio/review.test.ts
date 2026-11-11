import { describe, expect, it } from "vitest";
import type { Slice } from "@/domain/nesalio/contract";
import { DEFAULT_REVIEWER_MODEL, readReviewer, type ChatProvider } from "@/server/config";
import type { CompletionOptions } from "@/server/tutor/chatCompletions";
import { comparable, createSliceReviewer, isPlainOpening, parseReview, reviewMessages, screenAlerts, sliceText } from "./review";

const slice = {
  slice_id: "s2",
  introduces: [
    { id: "eq", type: "math", content: "x = \\frac{3\\log 7}{2\\log 7 - \\log 5} \\approx 2{,}17" },
    {
      id: "t",
      type: "matrix",
      params: {
        rows: [
          [1, 4],
          [2, 9],
        ],
        column_labels: ["x", "f(x)"],
      },
    },
    { id: "n", type: "label", content: "l’égalité tient", attachment: { parent: "eq" } },
  ],
  beats: [
    {
      id: "b",
      say: "Ce quotient vaut environ deux virgule dix-sept.",
      cues: [],
      do: [
        { id: "a1", verb: "show", target: "eq", at: "beat:start" },
        { id: "a2", verb: "transform", target: "eq", at: "beat:start", to: "x \\approx 2{,}56" },
      ],
    },
  ],
} as unknown as Slice;

describe("relecteur de fond", () => {
  it("rend la tranche lisible : objets, étiquettes attachées, voix, gestes qui changent le tableau seulement", () => {
    const text = sliceText(slice);
    expect(text).toContain("OBJET eq [math] x = \\frac{3\\log 7}");
    expect(text).toContain('OBJET t [matrix] {"rows":[[1,4],[2,9]]');
    expect(text).toContain("attaché à eq");
    expect(text).toContain("DIT : Ce quotient vaut environ deux virgule dix-sept.");
    expect(text).toContain('transform eq {"to":"x \\\\approx 2{,}56"}');
    expect(text).not.toContain("show eq");
  });

  it("met le contexte avant la nouvelle tranche, sans math_context", () => {
    const [system, user] = reviewMessages({ question: "7^(2x−3) = 5^x ?", previous: [{ ...slice, slice_id: "s1" } as Slice], slice });
    expect(system!.content).toContain("ERREURS DE FOND CERTAINES");
    expect(user!.content).toContain("QUESTION DE L'ÉLÈVE :\n7^(2x−3) = 5^x ?");
    expect(user!.content.indexOf("=== Tranche s1")).toBeLessThan(user!.content.indexOf("NOUVELLE TRANCHE"));
    expect(user!.content).not.toContain("math_context");
  });

  it("lit le DERNIER objet JSON quand le relecteur se dédit", () => {
    const raw = '{"erreurs":[{"citation":"2{,}17","correction":"c\'est 2,56","type":"calcul"}]}\nAprès vérification, je retire.\n{"erreurs":[]}';
    expect(parseReview(raw)).toEqual([]);
    expect(parseReview('```json\n{"erreurs":[{"citation":"a","correction":"b","type":"fait"}]}\n```')).toEqual([
      { citation: "a", correction: "b", type: "fait" },
    ]);
    expect(parseReview("je ne sais pas")).toBeUndefined();
  });

  it("garde une alerte seulement si sa citation est dans la tranche, mot pour mot", () => {
    const { alerts, dropped } = screenAlerts(
      [
        { citation: "environ deux virgule dix-sept", correction: "c'est 2,56", type: "calcul" },
        { citation: "\\approx 2{,}17", correction: "2,56", type: "calcul" },
        { citation: "l'égalité tient", correction: "elle ne tient pas", type: "raisonnement" },
        { citation: "vaut environ trois", correction: "inventé", type: "calcul" },
        { citation: "deux virgule", correction: "Pas d'erreur ici.", type: "calcul" },
      ],
      slice,
    );
    expect(alerts.map((a) => a.citation)).toEqual(["environ deux virgule dix-sept", "\\approx 2{,}17", "l'égalité tient"]);
    expect(dropped.map((d) => d.reason)).toEqual(["citation introuvable dans la tranche", "correction qui se dédit"]);
  });

  it("ne prend pas pour un dédit une correction qui dit ce qui est juste", () => {
    const { alerts } = screenAlerts([{ citation: "dix-sept", correction: "La valeur 2,56 est correcte, pas 2,17.", type: "calcul" }], slice);
    expect(alerts).toHaveLength(1);
  });

  it("lit une réponse dont le LaTeX n'a qu'une barre oblique", () => {
    // `\sqrt` rend le JSON illisible ; `\frac` et `\times` sont lus comme des caractères de contrôle.
    expect(parseReview('{"erreurs":[{"citation":"\\sqrt{48}","correction":"\\frac{1}{2} \\times 3","type":"calcul"}]}')).toEqual([
      { citation: "\\sqrt{48}", correction: "\\frac{1}{2} \\times 3", type: "calcul" },
    ]);
  });

  it("garde une vraie alerte dont la correction commence par un dédit partiel", () => {
    const { alerts, dropped } = screenAlerts(
      [
        { citation: "dix-sept", correction: "Il n'y a pas d'erreur de signe, mais le quotient vaut 2,56.", type: "calcul" },
        { citation: "quotient vaut", correction: "Déjà correcte pour le log, mais 2,17 doit être 2,56.", type: "calcul" },
        { citation: "deux virgule", correction: "En fait c'est correct.", type: "calcul" },
      ],
      slice,
    );
    expect(alerts).toHaveLength(2);
    expect(dropped.map((d) => d.reason)).toEqual(["correction qui se dédit"]);
  });

  it("retrouve une citation malgré les guillemets français et la virgule {,}, refuse une citation trop courte ou prise au JSON", () => {
    const quoted = { ...slice, beats: [{ ...slice.beats[0]!, say: "Elle dit « trois quarts » et 2,17." }] } as Slice;
    const { alerts, dropped } = screenAlerts(
      [
        { citation: '"trois quarts"', correction: "c'est deux tiers", type: "calcul" },
        { citation: "2,17", correction: "2,56", type: "calcul" },
        { citation: "0,", correction: "x", type: "calcul" },
        { citation: "expression_ref", correction: "x", type: "calcul" },
      ],
      quoted,
    );
    expect(alerts.map((a) => a.citation)).toEqual(['"trois quarts"', "2,17"]);
    expect(dropped).toHaveLength(2);
  });

  it("montre au relecteur la valeur calculée telle que l'élève la voit, pas le modèle {value}", () => {
    const computed = {
      ...slice,
      introduces: [{ id: "c", type: "math", content: { kind: "computed", expression_ref: "aire", template: "A = {value}", precision: 2 } }],
    } as unknown as Slice;
    const math = { symbols: {}, expressions: { aire: "3*4.5" } } as never;
    expect(sliceText(computed, math)).toContain("A = 13,50 (valeur calculée)");
    expect(sliceText(computed)).toContain("A = {value}");
  });

  it("garde au plus 4 alertes", () => {
    const many = Array.from({ length: 6 }, () => ({ citation: "quotient", correction: "faux", type: "calcul" }));
    expect(screenAlerts(many, slice).alerts).toHaveLength(4);
  });

  it("compare sans tenir compte des espaces, des apostrophes et de la casse", () => {
    expect(comparable("L’égalité   Tient")).toBe(comparable("l'égalité tient"));
  });

  it("appelle le modèle relecteur sans réflexion et rejette une réponse illisible", async () => {
    const calls: CompletionOptions[] = [];
    const answer = (text: string) => (options: CompletionOptions) => {
      calls.push(options);
      return (async function* () {
        yield text;
      })();
    };
    const provider: ChatProvider = {
      name: "gateway",
      protocol: "openai",
      endpoint: "https://ai-gateway.vercel.sh/v1/chat/completions",
      apiKey: "k",
      model: DEFAULT_REVIEWER_MODEL,
    };
    const ok = await createSliceReviewer({ provider, completion: answer('{"erreurs":[{"citation":"dix-sept","correction":"2,56","type":"calcul"}]}') })({
      question: "q",
      previous: [],
      slice,
    });
    expect(ok.alerts).toHaveLength(1);
    expect(calls[0]).toMatchObject({ model: "anthropic/claude-sonnet-5.5", endpoint: "https://ai-gateway.vercel.sh/v1/chat/completions" });
    expect(calls[0]!.reasoningEffort).toBeUndefined();
    await expect(createSliceReviewer({ provider, completion: answer("Désolé.") })({ question: "q", previous: [], slice })).rejects.toThrow(/illisible/);
  });

  it("est activé par défaut sur AI Gateway, et NESALIO_RELECTEUR=0 le coupe", () => {
    const headers = new Headers();
    const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;
    expect(readReviewer(headers, env({ AI_GATEWAY_API_KEY: "k" }))).toMatchObject({ model: DEFAULT_REVIEWER_MODEL });
    expect(readReviewer(headers, env({ NESALIO_RELECTEUR: "0", AI_GATEWAY_API_KEY: "k" }))).toBeNull();
    expect(readReviewer(headers, env({ NESALIO_RELECTEUR: "1" }))).toBeNull();
    expect(readReviewer(headers, env({ NESALIO_RELECTEUR: "1", AI_GATEWAY_API_KEY: "k", DISABLE_AI: "1" }))).toBeNull();
    expect(readReviewer(headers, env({ NESALIO_RELECTEUR: "1", AI_GATEWAY_API_KEY: "k" }))).toMatchObject({
      endpoint: "https://ai-gateway.vercel.sh/v1/chat/completions",
      model: DEFAULT_REVIEWER_MODEL,
      apiKey: "k",
    });
    expect(
      readReviewer(
        headers,
        env({ NESALIO_RELECTEUR: "1", AI_GATEWAY_API_KEY: "k", NESALIO_RELECTEUR_MODELE: "deepseek/deepseek-v4.1-flash", NESALIO_RELECTEUR_EFFORT: "low" }),
      ),
    ).toMatchObject({ model: "deepseek/deepseek-v4.1-flash", reasoningEffort: "low" });
  });
});

describe("ouverture montrée sans relecture (isPlainOpening)", () => {
  const opening = (say: string, introduces: unknown[] = [{ id: "t", type: "text", content: "Le réactif limitant" }]) =>
    ({ slice_id: "s1", introduces, beats: [{ id: "b", say, cues: [], do: [] }] }) as unknown as Slice;

  it("reconnaît une ouverture faite de mots : reformuler la question, annoncer la suite", () => {
    expect(isPlainOpening(opening("Tu veux savoir ce qu'est le réactif limitant, avec un exemple. On va le voir sur une vraie réaction."))).toBe(true);
    expect(isPlainOpening(opening("Bonne question : on regarde ensemble.", []))).toBe(true);
  });

  it("fait relire une première tranche qui porte des données : nombres, formule, tableau, figure", () => {
    expect(isPlainOpening(opening("Les coefficients trois et un sont un rapport de moles."))).toBe(false);
    expect(isPlainOpening(opening("On part de 2 moles."))).toBe(false);
    expect(isPlainOpening(opening("Voici l'équation.", [{ id: "e", type: "text", content: "N₂ + H₂" }]))).toBe(false);
    expect(isPlainOpening(opening("Voici l'équation.", [{ id: "e", type: "math", content: "pV = nRT" }]))).toBe(false);
    expect(isPlainOpening(opening("Regarde ce tableau.", [{ id: "m", type: "matrix", params: { rows: [[1]] } }]))).toBe(false);
    expect(isPlainOpening(opening("Regarde ce point.", [{ id: "p", type: "point", params: { at: [0, 0] } }]))).toBe(false);
  });
});
