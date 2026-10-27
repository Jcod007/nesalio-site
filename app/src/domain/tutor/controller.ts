import type { Step } from "@/domain/scene/schema";
import type { TutorRequest } from "./request";
import { CONCEPTS, conceptSequence, findConcept, type ConceptPlan } from "./curriculum";
import { resolveTeachingPolicy, type TeachingPolicy } from "./teachingPolicy";

export interface TeachingDecision {
  policy: TeachingPolicy;
  action: "explain-and-model" | "guided-practice" | "remediate";
  target?: ConceptPlan;
  sequence: ConceptPlan[];
  /** Ce qui n'a pas encore été présenté, pas ce que l'élève ignore. */
  toPresent: ConceptPlan[];
  allowCheck: boolean;
}

/** La décision appartient au programme ; le modèle propose son contenu à l'intérieur de ce cadre. */
export function decideTeaching(request: TutorRequest): TeachingDecision {
  const policy = resolveTeachingPolicy(request);
  // Une réponse fausse impose un détour enseigné ; aucune nouvelle interrogation dans ce même tour.
  const action = policy.intent === "remediation" ? "remediate"
    : policy.intent === "practice" ? "guided-practice" : "explain-and-model";
  const current = request.question.toLowerCase();
  const refersBack = request.mode === "continue" || /cette notion|ce concept|ce dessin|je ne comprends pas|la suite/.test(current);
  const target = (request.mode === "continue" ? CONCEPTS.find((c) => c.id === request.answer?.concept) : undefined)
    ?? findConcept(request.question) ?? (refersBack ? findConcept(request.context?.originalQuestion ?? "") : undefined);
  const sequence = target ? conceptSequence(target) : [];
  const toPresent = sequence.filter((concept) => {
    const seen = request.context?.learning?.concepts.find((c) => c.id === concept.id);
    return !seen?.presented.includes("explanation") || !seen.presented.includes("worked-example");
  });
  return { policy, action, target, sequence, toPresent,
    allowCheck: policy.questions !== "defer" && action !== "remediate" };
}

/** Ne transmet jamais une consigne interrogative interdite, y compris sa phrase dite à voix haute. */
export function checkViolation(step: Step, decision: TeachingDecision, request: TutorRequest): string | null {
  if (!step.check) return null;
  if (!decision.allowCheck) return "Ce tour doit expliquer et montrer, sans demander de réponse. Remplace la question par un exemple entièrement résolu, puis termine.";
  if (!decision.target) return null;
  const concept = step.teaching?.concept;
  if (!concept || !decision.sequence.some((c) => c.id === concept)
    || !["guided-practice", "independent-practice"].includes(step.teaching?.role ?? "")) {
    return "La question doit indiquer teaching.concept parmi les notions prévues et teaching.role=guided-practice. Ne teste pas une nouvelle notion non prévue.";
  }
  if (request.context?.learning) {
    const observed = request.context.learning.concepts.find((c) => c.id === concept)?.observations.at(-1);
    if (observed?.outcome === "help-requested" || observed?.outcome === "incorrect") {
      // Une demande explicite de nouvel exercice peut ouvrir la pratique après un détour présenté.
      const seen = request.context.learning.concepts.find((c) => c.id === concept);
      if (decision.policy.questions !== "requested" || !seen?.presented.includes("worked-example"))
        return "Un besoin d'aide reste observé sur cette notion : réexplique avec un exemple résolu avant de proposer une nouvelle question.";
    }
  }
  return null;
}

/** Contrôle de couverture déclaré : il ne certifie pas la justesse de l'explication. */
export function completionViolation(steps: readonly Step[], decision: TeachingDecision, request: TutorRequest): string | null {
  if (decision.action === "remediate" && decision.target) {
    const target = decision.target.id;
    return steps.some((s) => s.teaching?.concept === target && s.teaching.role === "worked-example" && s.teaching.completes) ? null
      : `Le besoin d'aide sur ${target} exige un nouvel exemple entièrement résolu dans ce tour, annoté teaching.role=worked-example et completes=true sur sa dernière étape. Change de représentation ou explicite la raison de l'étape manquée, puis termine sans interrogation.`;
  }
  if (request.mode !== "question" || decision.action !== "explain-and-model" || decision.policy.scaffolding === "light") return null;
  const missing = decision.toPresent.flatMap((concept) => {
    const already = request.context?.learning?.concepts.find((c) => c.id === concept.id)?.presented ?? [];
    return (["explanation", "worked-example"] as const)
      .filter((role) => !already.includes(role) && !steps.some((s) => s.teaching?.concept === concept.id && s.teaching.role === role && s.teaching.completes))
      .map((role) => `${concept.id} : ${role}`);
  });
  return missing.length ? `Le bloc n'a pas encore présenté les rôles suivants : ${missing.join(" ; ")}. Ajoute les explications et exemples entièrement résolus nécessaires, avec leurs annotations teaching et completes=true sur la dernière étape de chaque explication ou exemple, puis termine. Ne pose pas de question.` : null;
}

/** Défaut observé dans une séance réelle : une parallèle demandée à l'intérieur d'une figure absente. */
export function constructionViolation(step: Step, existing: ReadonlySet<string>): string | null {
  const ids = new Set(existing);
  for (const action of step.do) {
    if (action.type === "clear") ids.clear();
    if (action.type === "construct" && "within" in action && action.within && !ids.has(action.within))
      return `La construction vise la figure absente « ${action.within} ». Crée et explique cette figure avant de construire sa parallèle ; conserve les points déjà montrés.`;
    if ("id" in action && typeof action.id === "string") ids.add(action.id);
  }
  return null;
}
