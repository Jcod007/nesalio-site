import { describe, expect, it } from "vitest";
import { checkViolation, completionViolation, constructionViolation, decideTeaching } from "./controller";
import type { TutorRequest } from "./request";
import { emptyLearning, recordPresentation } from "./learning";
import { CONCEPTS, conceptSequence } from "./curriculum";

const q = (question: string): TutorRequest => ({ mode: "question", question });
const candidate = { say: "À toi.", do: [], check: { prompt: "Quel rapport ?", choices: ["1/3", "3"], answer: 0 } };

describe("contrôleur pédagogique", () => {
  it("refuse une question malgré une sortie de modèle valide", () => {
    const request = q("Explique-moi Thalès depuis zéro.");
    expect(checkViolation(candidate, decideTeaching(request), request)).toContain("sans demander de réponse");
  });

  it("prévoit le passage par la configuration avant les rapports de Thalès", () => {
    const request = q("Explique Thalès.");
    const decision = decideTeaching(request);
    expect(decision.sequence.map((c) => c.id)).toEqual(["thales.configuration", "thales.ratios"]);
    const learning = recordPresentation(recordPresentation(emptyLearning(), { concept: "thales.configuration", role: "explanation", completes: true }), { concept: "thales.configuration", role: "worked-example", completes: true });
    expect(decideTeaching({ ...request, context: { spoken: [], board: [], learning } }).toPresent.map((c) => c.id)).toEqual(["thales.ratios"]);
  });

  it.each([false, null])("répare une erreur ou un besoin d'aide sans imposer une nouvelle question (%s)", (correct) => {
    const request: TutorRequest = { mode: "continue", question: "Thalès", answer: { prompt: "?", choices: ["1", "2"], picked: correct === null ? "Je ne sais pas" : "2", correct } };
    expect(decideTeaching(request)).toMatchObject({ action: "remediate", allowCheck: false, policy: { scaffolding: "high" } });
  });

  it("autorise une pratique demandée sans convertir un prérequis en lacune", () => {
    const request = q("Donne-moi un exercice sur Thalès.");
    const decision = decideTeaching(request);
    expect(decision.allowCheck).toBe(true);
    expect(checkViolation({ ...candidate, teaching: { concept: "thales.ratios", role: "guided-practice" } }, decision, request)).toBeNull();
    expect(checkViolation({ ...candidate, teaching: { concept: "derivatives.local", role: "guided-practice" } }, decision, request)).not.toBeNull();
    expect(checkViolation({ ...candidate, teaching: { concept: "thales.ratios", role: "explanation" } }, decision, request)).not.toBeNull();
  });

  it("ne fait pas semblant d'avoir un catalogue pour tout le programme", () => {
    expect(decideTeaching(q("Explique les orbitales atomiques.")).sequence).toEqual([]);
  });

  it("ne transporte pas Thalès dans un changement de sujet", () => {
    const request: TutorRequest = { mode: "followUp", question: "Explique les orbitales atomiques.", context: { originalQuestion: "Thalès", spoken: [], board: [] } };
    expect(decideTeaching(request).target).toBeUndefined();
  });

  it("refuse une fin sans exemple annoncé sur les notions du catalogue", () => {
    const request = q("Explique une fraction.");
    const decision = decideTeaching(request);
    const explained = { say: "On partage en parts égales.", do: [], teaching: { concept: "fractions.parts", role: "explanation" as const, completes: true } };
    expect(completionViolation([explained], decision, request)).toContain("worked-example");
    expect(completionViolation([explained, { ...explained, teaching: { concept: "fractions.parts", role: "worked-example", completes: true } }], decision, request)).toBeNull();
  });

  it("détecte la référence au triangle tri jamais créé dans la séance rivière", () => {
    const construction = { say: "Une parallèle coupe le triangle.", do: [{ type: "construct" as const, id: "E", kind: "parallel" as const, of: ["A", "B"] as [string, string], through: "D", within: "tri", meets: "E" }] };
    expect(constructionViolation(construction, new Set(["A", "B", "S", "D"]))).toContain("tri");
    expect(constructionViolation(construction, new Set(["tri"]))).toBeNull();
  });

  it("accepte un exemple intégré à Thalès sans exiger un second exemple de configuration", () => {
    const request = q("Explique Thalès depuis zéro.");
    const decision = decideTeaching(request);
    const steps = [
      { say: "Les points sont alignés et les segments parallèles.", do: [], teaching: { concept: "thales.configuration", role: "explanation" as const, completes: true } },
      { say: "SD/SA = 2/6 = 1/3, donc DE = 9/3 = 3.", do: [], teaching: { concept: "thales.ratios", role: "worked-example" as const, completes: true } },
    ];
    expect(completionViolation(steps, decision, request)).toBeNull();
  });

  it("tous les prérequis existent et précèdent leur notion", () => {
    for (const target of CONCEPTS) {
      const sequence = conceptSequence(target).map((c) => c.id);
      for (const concept of conceptSequence(target)) for (const id of concept.prerequisites) {
        expect(CONCEPTS.some((c) => c.id === id)).toBe(true);
        expect(sequence.indexOf(id)).toBeLessThan(sequence.indexOf(concept.id));
      }
    }
  });
});
