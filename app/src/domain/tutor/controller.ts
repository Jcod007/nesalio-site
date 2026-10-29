import type { Step } from "@/domain/scene/schema";
import type { TutorRequest } from "./request";
import { planSequence, type PlanConcept, type TeachingPlan } from "./plan";
import { isHelpRequest, resolveTeachingPolicy, type TeachingPolicy } from "./teachingPolicy";

export interface TeachingDecision {
  policy: TeachingPolicy;
  action: "explain-and-model" | "guided-practice" | "remediate";
  strategy: "worked-example" | "decompose" | "alternate-representation" | "guided-step";
  difficultyStreak: number;
  plan?: TeachingPlan;
  target?: PlanConcept;
  sequence: PlanConcept[];
  toPresent: PlanConcept[];
  allowCheck: boolean;
}

/** Les règles agissent sur des observations et un graphe proposé, jamais sur un nom de matière. */
export function decideTeaching(request: TutorRequest): TeachingDecision {
  const policy = resolveTeachingPolicy(request);
  const current = request.mode === "continue" ? request.answer?.picked ?? "" : request.question;
  const needsHelp = isHelpRequest(current);
  const action = policy.intent === "remediation" || (request.mode === "followUp" && needsHelp) ? "remediate"
    : policy.intent === "practice" ? "guided-practice" : "explain-and-model";
  const plan = request.context?.plan;
  const requestedTarget = request.mode === "continue" ? request.answer?.concept ?? plan?.target : plan?.target;
  const target = plan?.concepts.find((c) => c.id === requestedTarget) ?? plan?.concepts.find((c) => c.id === plan.target);
  const targetId = target?.id;
  const sequence = plan ? planSequence(plan, target?.id) : [];
  const toPresent = sequence.filter((concept) => {
    const seen = request.context?.learning?.concepts.find((c) => c.id === concept.id);
    return !seen?.presented.includes("explanation") || (concept.id === target?.id && !seen.presented.includes("worked-example"));
  });
  const recent = request.context?.learning?.recent;
  const observations = recent?.filter((o) => !targetId || !o.concept || o.concept === targetId)
    ?? request.context?.learning?.concepts.find((c) => c.id === targetId)?.observations ?? [];
  let difficultyStreak = 0;
  for (const observation of observations.toReversed()) {
    if (observation.outcome !== "incorrect" && observation.outcome !== "help-requested") break;
    difficultyStreak++;
  }
  // Ancien client ou mémoire manquante : la réponse courante reste utilisable, sans inventer un historique.
  if (!observations.length && (needsHelp || request.answer?.correct === false)) difficultyStreak = 1;
  const strategy = action === "remediate" ? difficultyStreak >= 2 ? "alternate-representation" : "decompose"
    : action === "guided-practice" ? "guided-step" : "worked-example";
  return { policy, action, strategy, difficultyStreak, plan, target, sequence, toPresent,
    allowCheck: policy.questions !== "defer" && action !== "remediate" };
}

export function checkViolation(step: Step, decision: TeachingDecision, _request: TutorRequest): string | null {
  if (!step.check) return null;
  if (!decision.allowCheck) return "Ce tour doit expliquer et montrer, sans demander de réponse. Remplace la question par un exemple entièrement résolu, puis termine.";
  if (step.teaching && !["guided-practice", "independent-practice"].includes(step.teaching.role))
    return "Une question est une activité de pratique ; corrige son rôle pédagogique ou montre un exemple sans check.";
  if (step.teaching && decision.plan && !decision.plan.concepts.some((c) => c.id === step.teaching!.concept))
    return "La question vise une notion absente du plan courant. Déclare un plan cohérent avant de changer d'objectif, ou reste sur l'objectif enseigné.";
  return null;
}

/** Couverture déclarée seulement ; aucune notion ni résolution particulière n'est écrite dans le moteur. */
export function completionViolation(steps: readonly Step[], decision: TeachingDecision, request: TutorRequest): string | null {
  if (!decision.target || steps.some((step) => !step.teaching)) return null;
  if (decision.action === "remediate") {
    return steps.some((s) => s.teaching?.concept === decision.target!.id && s.teaching.role === "worked-example" && s.teaching.completes) ? null
      : "La remédiation annoncée doit aboutir à un exemple résolu. Complète le raisonnement manquant avec l'objectif courant, sans poser une nouvelle question.";
  }
  if (request.mode !== "question" || decision.action !== "explain-and-model" || decision.policy.scaffolding === "light") return null;
  // Les prérequis peuvent être expliqués au sein du même exemple. Une annotation
  // non clôturée pour chacun ne justifie pas une leçon supplémentaire par nœud.
  const needsExample = decision.toPresent.some((c) => c.id === decision.target!.id);
  const completedExample = steps.some((s) => s.teaching?.concept === decision.target!.id && s.teaching.role === "worked-example" && s.teaching.completes);
  return needsExample && !completedExample
    ? `L'exemple de l'objectif ${decision.target.id} n'est pas déclaré terminé. Complète sa résolution sans répéter les étapes déjà présentées.` : null;
}

/** Vérification d'une référence de construction, commune à toutes les scènes. */
export function constructionViolation(step: Step, existing: ReadonlySet<string>): string | null {
  const ids = new Set(existing);
  for (const action of step.do) {
    if (action.type === "clear") ids.clear();
    if (action.type === "construct" && "within" in action && action.within && !ids.has(action.within))
      return `La construction vise la figure absente « ${action.within} ». Crée cette figure avant de l'utiliser et explique le lien avec les objets déjà montrés.`;
    if ("id" in action && typeof action.id === "string") ids.add(action.id);
  }
  return null;
}
