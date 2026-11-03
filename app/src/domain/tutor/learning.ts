import { z } from "zod";
import { AssessmentMethod, AssessmentPurpose } from "./assessment";

/** Observations de séance, sans score de maîtrise ni profil psychologique. */
export const TeachingAnnotation = z.object({
  concept: z.string().trim().min(1).max(80),
  role: z.enum(["explanation", "worked-example", "guided-practice", "independent-practice"]),
  /** Dernière étape de cette explication ou résolution, déclarée par le modèle. */
  completes: z.boolean().optional(),
  activityId: z.string().trim().min(1).max(60).optional(),
  purpose: AssessmentPurpose.optional(),
});
export type TeachingAnnotation = z.infer<typeof TeachingAnnotation>;

const Observation = z.object({
  task: z.string().max(300),
  outcome: z.enum(["correct", "incorrect", "ungraded", "help-requested"]),
  format: z.enum(["choice", "free"]),
  support: z.enum(["guided", "independent"]),
  /** Provenance du verdict, pas certification : la mémoire vient du navigateur. */
  method: AssessmentMethod.optional(),
  activityId: z.string().trim().min(1).max(60).optional(),
  purpose: AssessmentPurpose.optional(),
  at: z.number().int().min(0).max(8_640_000_000_000_000).optional(),
});
export type Observation = z.infer<typeof Observation>;

export const LearningState = z.object({
  v: z.literal(1),
  /** Observations récentes, y compris lorsqu'aucune notion n'a pu être identifiée. */
  recent: z.array(Observation.extend({ concept: z.string().trim().min(1).max(80).optional() })).max(12).optional(),
  concepts: z.array(z.object({
    id: z.string().trim().min(1).max(80),
    /** Le modèle a déclaré ce rôle et la lecture s'est terminée : pas une preuve de compréhension. */
    presented: z.array(z.enum(["explanation", "worked-example"])).max(2),
    observations: z.array(Observation).max(8),
  })).max(16),
});
export type LearningState = z.infer<typeof LearningState>;
export const emptyLearning = (): LearningState => ({ v: 1, concepts: [] });

function updateConcept(state: LearningState, id: string, update: (entry: LearningState["concepts"][number]) => void): LearningState {
  const current = state.concepts.find((c) => c.id === id);
  const entry = current ? { ...current, presented: [...current.presented], observations: [...current.observations] }
    : { id, presented: [], observations: [] };
  update(entry);
  return { ...state, concepts: [...state.concepts.filter((c) => c.id !== id), entry].slice(-16) };
}

/** Appelé après la lecture complète, jamais à la réception du flux. Rejouer est idempotent. */
export function recordPresentation(state: LearningState, teaching?: TeachingAnnotation): LearningState {
  if (!teaching?.completes || (teaching.role !== "explanation" && teaching.role !== "worked-example")) return state;
  const role = teaching.role;
  return updateConcept(state, teaching.concept, (entry) => {
    // Une résolution expliquée jusqu'au résultat clôt aussi l'explication de cette notion.
    if (role === "worked-example" && !entry.presented.includes("explanation")) entry.presented.push("explanation");
    if (!entry.presented.includes(role)) entry.presented.push(role);
  });
}

export function recordObservation(state: LearningState, concept: string | undefined, observation: Observation): LearningState {
  const next = concept ? updateConcept(state, concept, (entry) => {
    entry.observations = [...entry.observations, observation].slice(-8);
  }) : state;
  return { ...next, recent: [...(state.recent ?? []), { ...observation, ...(concept ? { concept } : {}) }].slice(-12) };
}
