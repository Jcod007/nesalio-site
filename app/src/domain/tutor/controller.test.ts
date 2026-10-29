import { describe, expect, it } from "vitest";
import type { Step } from "@/domain/scene/schema";
import { checkViolation, completionViolation, constructionViolation, decideTeaching } from "./controller";
import { emptyLearning, recordObservation, recordPresentation } from "./learning";
import type { TutorRequest } from "./request";

const plan = { goal: "Comprendre une idée", target: "nouveau", concepts: [
  { id: "base", label: "Prérequis", prerequisites: [] },
  { id: "nouveau", label: "Idée demandée", prerequisites: ["base"] },
] };
const request: TutorRequest = { mode: "question", question: "Explique cette idée depuis zéro, sans quiz.", context: { spoken: [], board: [], plan } };
const step = (concept: string, role: "explanation" | "worked-example", completes = true): Step =>
  ({ say: "Une étape expliquée.", do: [], teaching: { concept, role, completes } });
const check: Step = { say: "À toi.", do: [], teaching: { concept: "nouveau", role: "guided-practice" },
  check: { prompt: "Quelle réponse ?", choices: ["A", "B"], answer: 0 } };

describe("contrôleur pédagogique générique", () => {
  it("requiert une participation après une explication et après une erreur, même sans annotations", () => {
    const tutoring: TutorRequest = { ...request, question: "C'est quoi un exposant ?" };
    const decision = decideTeaching(tutoring);
    expect(decision.requireCheck).toBe(true);
    expect(completionViolation([{ say: "Une définition.", do: [] }], decision, tutoring)).toBeTruthy();
    expect(checkViolation(check, decision, tutoring)).toBeTruthy();
    expect(checkViolation(check, decision, tutoring, [{ say: "Voici une explication.", do: [] }])).toBeNull();
    const wrong: TutorRequest = { ...tutoring, mode: "continue", answer: { prompt: "?", choices: ["A", "B"], picked: "B", correct: false } };
    expect(decideTeaching(wrong).requireCheck).toBe(true);
    expect(decideTeaching({ ...tutoring, question: "Merci, on arrête." }).requireCheck).toBe(false);
  });

  it("fait évoluer le guidage sur des tâches distinctes sans imposer l'autonomie ni un quiz", () => {
    let learning = emptyLearning();
    for (const task of ["Premier item", "Deuxième item"]) learning = recordObservation(learning, "nouveau", {
      task, outcome: "correct", support: "guided", format: "choice", method: "answer-key",
    });
    const practice: TutorRequest = { ...request, question: "Teste-moi.", context: { ...request.context!, learning } };
    const decision = decideTeaching(practice, 1000);
    expect(decision.action).toBe("independent-practice");
    expect(checkViolation(check, decision, practice)).toBeTruthy();
    const independent: Step = { ...check, teaching: { concept: "nouveau", role: "independent-practice", activityId: "item-3" } };
    expect(checkViolation(independent, decision, practice)).toBeNull();
    expect(checkViolation({ ...independent, check: { ...independent.check!, prompt: "Premier item" } }, decision, practice)).toContain("déjà");
    expect(decideTeaching({ ...practice, question: "Propose-moi un exercice guidé." }).action).toBe("guided-practice");
    expect(decideTeaching({ ...practice, question: "Explique sans quiz." }).allowCheck).toBe(false);
  });

  it("exige l'annotation de transfert puis de rappel lorsque ces activités sont choisies", () => {
    let learning = emptyLearning();
    for (const task of ["A", "B"]) learning = recordObservation(learning, "nouveau", {
      task, outcome: "correct", support: "independent", format: "choice", method: "answer-key", at: 1000,
    });
    const practice: TutorRequest = { ...request, question: "Teste-moi.", context: { ...request.context!, learning } };
    const transfer = decideTeaching(practice, 2000);
    expect(transfer.action).toBe("transfer-practice");
    const independent: Step = { ...check, teaching: { concept: "nouveau", role: "independent-practice" } };
    expect(checkViolation(independent, transfer, practice)).toContain("purpose:transfer");
    expect(checkViolation({ ...independent, teaching: { ...independent.teaching!, purpose: "transfer" } }, transfer, practice)).toBeNull();
    const retrieval = decideTeaching(practice, 1000 + 24 * 60 * 60 * 1000);
    expect(retrieval.action).toBe("retrieval-practice");
    expect(checkViolation(independent, retrieval, practice)).toContain("purpose:retrieval");
  });

  it("reste utilisable sans plan et ne déduit pas la matière depuis les mots de la demande", () => {
    const decision = decideTeaching({ mode: "question", question: "Explique Thalès." });
    expect(decision.target).toBeUndefined();
    expect(decision.sequence).toEqual([]);
    expect(decision.strategy).toBe("worked-example");
    expect(checkViolation(check, decision, request)).toBeTruthy();
    expect(completionViolation([step("inconnu", "explanation")], decision, request)).toBeTruthy();
  });

  it.each(["bascule-D", "principe-inédit", "grammaire", "énergie"])("applique les mêmes décisions à un identifiant arbitraire %s", (id) => {
    const generic = { ...request, context: { ...request.context!, plan: { ...plan, target: id, concepts: [{ id, label: id, prerequisites: [] }] } } };
    const decision = decideTeaching(generic);
    expect(decision.target?.id).toBe(id);
    expect(completionViolation([step(id, "explanation")], decision, generic)).toContain(id);
    expect(completionViolation([step(id, "worked-example")], decision, generic)).toBeNull();
  });

  it("suit les présentations terminées sans les transformer en acquis", () => {
    const learning = recordPresentation(emptyLearning(), { concept: "base", role: "explanation", completes: true });
    const decision = decideTeaching({ ...request, context: { ...request.context!, learning } });
    expect(decision.sequence.map((c) => c.id)).toEqual(["base", "nouveau"]);
    expect(decision.toPresent.map((c) => c.id)).toEqual(["nouveau"]);
    expect(decision.policy.scaffolding).not.toBe("light");
    expect(completionViolation([step("nouveau", "worked-example", false)], decision, request)).toContain("nouveau");
    expect(completionViolation([step("nouveau", "worked-example")], decision, request)).toBeNull();
    expect(completionViolation([{ say: "Sans annotation.", do: [] }], decision, request)).toBeNull();
  });

  it("n'impose pas une leçon par prérequis lorsqu'un exemple commun est terminé", () => {
    const decision = decideTeaching(request);
    expect(completionViolation([step("base", "explanation", false), step("nouveau", "worked-example")], decision, request)).toBeNull();
    expect(completionViolation([step("nouveau", "worked-example")], decision, request)).toBeNull();
    expect(completionViolation([step("base", "explanation"), step("nouveau", "worked-example", false)], decision, request)).toContain("nouveau");
  });

  it("change de stratégie après deux difficultés, sans confondre une autre notion avec la cible", () => {
    let learning = recordObservation(emptyLearning(), undefined, { task: "Aide", outcome: "help-requested", format: "free", support: "guided" });
    const followUp = (state = learning): TutorRequest => ({ ...request, mode: "followUp", question: "Je ne comprends toujours pas.", context: { ...request.context!, learning: state } });
    expect(decideTeaching(followUp()).strategy).toBe("decompose");
    learning = recordObservation(learning, "ailleurs", { task: "Autre", outcome: "incorrect", format: "choice", support: "guided" });
    expect(decideTeaching(followUp()).difficultyStreak).toBe(1);
    learning = recordObservation(learning, "nouveau", { task: "Aide", outcome: "help-requested", format: "free", support: "guided" });
    const decision = decideTeaching(followUp());
    expect(decision.strategy).toBe("alternate-representation");
    expect(decision.allowCheck).toBe(true);
    expect(decision.requireCheck).toBe(true);
    expect(completionViolation([step("nouveau", "explanation")], decision, followUp())).toBeTruthy();
    expect(completionViolation([step("nouveau", "worked-example")], decision, followUp())).toContain("accompagnement");
    learning = recordObservation(learning, "nouveau", { task: "Réponse", outcome: "correct", format: "free", support: "independent" });
    expect(decideTeaching(followUp()).difficultyStreak).toBe(0);
  });

  it("permet une pratique demandée, refuse un objectif inconnu et conserve le choix sans quiz", () => {
    const practice = { ...request, question: "Teste-moi." };
    const decision = decideTeaching(practice);
    expect(checkViolation(check, decision, practice)).toBeNull();
    expect(checkViolation({ ...check, teaching: { concept: "absent", role: "guided-practice" } }, decision, practice)).toBeTruthy();
    const noQuiz = { ...practice, question: "Teste-moi sans quiz." };
    expect(checkViolation(check, decideTeaching(noQuiz), noQuiz)).toBeTruthy();
    const stale: TutorRequest = { ...request, mode: "continue", answer: { prompt: "?", choices: [], picked: "Je ne sais pas", correct: null, concept: "ancien-plan" } };
    expect(decideTeaching(stale).target?.id).toBe("nouveau");
  });

  it("refuse une construction dans une figure absente, y compris après effacement", () => {
    const construction: Step = { say: "Construction.", do: [{ type: "construct", id: "p", kind: "parallel", through: [0, 0], of: [[[0, 0], [1, 0]]], within: "figure" }] };
    expect(constructionViolation(construction, new Set())).toContain("figure");
    expect(constructionViolation(construction, new Set(["figure"]))).toBeNull();
    expect(constructionViolation({ ...construction, do: [{ type: "clear" }, ...construction.do] }, new Set(["figure"]))).toBeTruthy();
  });
});
