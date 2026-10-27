import { describe, expect, it } from "vitest";
import type { TutorRequest } from "./request";
import { resolveTeachingPolicy } from "./teachingPolicy";

const question = (text: string): TutorRequest => ({ mode: "question", question: text });
const followUp = (text: string, originalQuestion = "Explique-moi les dérivées."): TutorRequest => ({
  mode: "followUp", question: text, context: { spoken: [], board: [], originalQuestion },
});
const continuation = (picked: string, correct: boolean | null = null, originalQuestion = "Explique-moi les dérivées."): TutorRequest => ({
  mode: "continue", question: originalQuestion, context: { spoken: [], board: [], originalQuestion },
  answer: { prompt: "Que représente la pente ?", choices: ["Une variation", "Une hauteur"], picked, correct },
});

describe("politique pédagogique", () => {
  it("traite une déclaration de débutant dans une réponse comme un besoin d'explication", () => {
    expect(resolveTeachingPolicy(continuation("Je ne connais rien à ce concept."))).toMatchObject({ intent: "remediation", scaffolding: "high", questions: "defer" });
  });
  it("enseigne d'abord quand le niveau est inconnu", () => {
    expect(resolveTeachingPolicy(question("C'est quoi une dérivée ?"))).toMatchObject({ intent: "explanation", scaffolding: "standard", questions: "defer" });
  });

  it.each([
    "Je débute, explique-moi la dérivée.",
    "Je ne connais rien aux vecteurs.",
    "Je pars de zéro en électricité.",
    "Je n'ai aucune connaissance de cette notion.",
    "J'y connais rien, montre-moi.",
    "Je n'y connais rien en physique.",
    "Je ne maîtrise pas les bases.",
  ])("étaye un débutant déclaré : %s", (text) => {
    expect(resolveTeachingPolicy(question(text))).toMatchObject({ intent: "explanation", scaffolding: "high", questions: "defer" });
  });

  it.each(["Je maîtrise déjà les bases, explique la suite.", "Je suis expert en électronique.", "J'ai un niveau avancé."])("allège seulement sur déclaration explicite : %s", (text) => {
    expect(resolveTeachingPolicy(question(text))).toMatchObject({ scaffolding: "light", questions: "defer" });
  });

  it("ne confond pas une expérience niée avec une maîtrise", () => {
    expect(resolveTeachingPolicy(question("Je ne connais pas les bases."))).toMatchObject({ scaffolding: "high" });
    expect(resolveTeachingPolicy(question("Je ne suis pas expert."))).toMatchObject({ scaffolding: "standard" });
  });

  it.each(["Teste-moi sur les vecteurs.", "Pose-moi des questions.", "Entraîne-moi.", "Donne-moi un exercice.", "Un exercice sur les dérivées.", "Je voudrais faire des exercices."])("reconnaît une pratique demandée : %s", (text) => {
    expect(resolveTeachingPolicy(question(text))).toMatchObject({ intent: "practice", questions: "requested" });
  });

  it.each([
    "Fais-moi un quiz sur les dérivées.",
    "Je veux un QCM pour m'entraîner.",
    "Propose-moi un quiz sur les vecteurs.",
    "Donne-moi un QCM.",
    "Je voudrais faire un questionnaire.",
  ])("reconnaît les demandes explicites de quiz ou QCM : %s", (text) => {
    expect(resolveTeachingPolicy(question(text))).toMatchObject({ intent: "practice", questions: "requested" });
    expect(resolveTeachingPolicy(followUp(text, "Explique sans quiz."))).toMatchObject({ intent: "practice", questions: "requested" });
  });

  it.each([
    "Ne me fais pas de quiz.",
    "Je ne veux pas de QCM.",
    "Je ne veux pas un QCM.",
    "Ne me propose pas un quiz.",
    "Explique sans questionnaire.",
  ])("respecte les négations de quiz et QCM : %s", (text) => {
    expect(resolveTeachingPolicy(question(text))).toMatchObject({ intent: "explanation", questions: "defer" });
    expect(resolveTeachingPolicy(continuation("Une variation", true, text))).toMatchObject({ questions: "defer" });
  });

  it("le refus actuel de quiz est prioritaire sur une demande de pratique", () => {
    expect(resolveTeachingPolicy(question("Fais-moi un QCM, mais sans questions."))).toMatchObject({ questions: "defer" });
  });

  it.each(["Ne me pose pas de questions.", "Ne me teste pas.", "Je ne veux pas d'exercice.", "Explique la correction de cet exercice."])("ne transforme pas une négation ou une simple mention en invitation : %s", (text) => {
    expect(resolveTeachingPolicy(question(text)).questions).toBe("defer");
    expect(resolveTeachingPolicy(question(text)).intent).toBe("explanation");
  });

  it("donne priorité à une demande sans quiz dans le même message", () => {
    expect(resolveTeachingPolicy(question("Donne-moi un exercice, mais sans questions."))).toMatchObject({ questions: "defer" });
  });

  it("conserve une préférence sans questions au tour suivant", () => {
    expect(resolveTeachingPolicy(continuation("Une variation", true, "Explique sans quiz."))).toMatchObject({ questions: "defer" });
    expect(resolveTeachingPolicy(followUp("Explique encore la pente.", "Explique sans questions."))).toMatchObject({ questions: "defer" });
    expect(resolveTeachingPolicy(continuation("Une variation", true, "Ne me pose plus de questions."))).toMatchObject({ questions: "defer" });
    expect(resolveTeachingPolicy(continuation("Une variation", true, "Explique sans me poser de questions."))).toMatchObject({ questions: "defer" });
  });

  it("une nouvelle demande explicite de pratique remplace la préférence initiale", () => {
    expect(resolveTeachingPolicy(followUp("Maintenant, teste-moi.", "Explique sans quiz."))).toMatchObject({ intent: "practice", questions: "requested" });
    expect(resolveTeachingPolicy(continuation("Donne-moi un exercice.", null, "Explique sans questions."))).toMatchObject({ intent: "practice", questions: "requested" });
  });

  it.each([
    "Donne-moi un exercice corrigé.",
    "Donne-moi un exercice résolu.",
    "Je voudrais un exemple travaillé.",
    "Un exercice entièrement corrigé sur les dérivées.",
  ])("traite un exemple résolu comme une explication : %s", (text) => {
    expect(resolveTeachingPolicy(question(text))).toMatchObject({ intent: "explanation", questions: "defer" });
    expect(resolveTeachingPolicy(followUp(text))).toMatchObject({ intent: "explanation", questions: "defer" });
    expect(resolveTeachingPolicy(continuation(text))).toMatchObject({ intent: "explanation", questions: "defer" });
  });

  it.each([
    "Donne-moi un exercice corrigé, puis laisse-moi essayer.",
    "Montre un exemple travaillé puis pose-moi ensuite une question.",
    "Donne-moi un exercice résolu. Ensuite, teste-moi.",
  ])("respecte une demande explicite de pratique après la démonstration : %s", (text) => {
    expect(resolveTeachingPolicy(question(text))).toMatchObject({ intent: "practice", questions: "requested" });
  });

  it("un exemple corrigé seul ne révoque pas la préférence sans quiz", () => {
    expect(resolveTeachingPolicy(followUp("Donne-moi un exercice corrigé.", "Explique sans questions.")))
      .toMatchObject({ intent: "explanation", questions: "defer" });
    expect(resolveTeachingPolicy(followUp("Donne-moi un exercice corrigé, puis laisse-moi essayer.", "Explique sans questions.")))
      .toMatchObject({ intent: "practice", questions: "requested" });
    expect(resolveTeachingPolicy(question("Donne-moi un exercice corrigé puis pose-moi une question, mais sans quiz.")))
      .toMatchObject({ questions: "defer" });
  });

  it.each(["Je ne sais pas.", "Aucune idée.", "J'ai pas compris.", "Je comprends pas."])("réenseigne sans interrogation supplémentaire : %s", (text) => {
    expect(resolveTeachingPolicy(continuation(text))).toMatchObject({ intent: "remediation", scaffolding: "high", questions: "defer" });
  });

  it("une réponse fausse appelle une remédiation et une question facultative", () => {
    expect(resolveTeachingPolicy(continuation("Une hauteur", false))).toMatchObject({ intent: "remediation", scaffolding: "high", questions: "optional" });
  });

  it("une bonne réponse isolée ne prouve pas la maîtrise du concept", () => {
    expect(resolveTeachingPolicy(continuation("Une variation", true))).toMatchObject({ intent: "practice", scaffolding: "standard", questions: "optional" });
  });

  it("répond à une clarification sans ajouter automatiquement une question", () => {
    expect(resolveTeachingPolicy(followUp("Pourquoi on divise par deux ?"))).toMatchObject({ intent: "explanation", questions: "defer" });
  });

  it("fournit une justification exploitable sans inventer de score de maîtrise", () => {
    expect(resolveTeachingPolicy(question("Explique-moi." )).reason.length).toBeGreaterThan(0);
  });
});
