import type { LearningState, Observation } from "./learning";

/** Règles de produit à évaluer, pas paramètres universels d'apprentissage. */
export const PRACTICE_SUCCESSES = 2;
export const REVIEW_DELAY_MS = 24 * 60 * 60 * 1000;

export interface LearningEvidence {
  guidedSuccesses: number;
  independentSuccesses: number;
  transferObserved: boolean;
  retrievalObserved: boolean;
  nextPractice: "guided" | "independent" | "transfer" | "retrieval";
  reviewAt?: number;
}

/** Égalité textuelle prudente seulement ; ne prétend pas reconnaître un transfert sémantique. */
export const taskKey = (task: string): string => task.normalize("NFKC").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim();

export function learningEvidence(state: LearningState | undefined, concept: string | undefined, now: number): LearningEvidence {
  const result: LearningEvidence = { guidedSuccesses: 0, independentSuccesses: 0,
    transferObserved: false, retrievalObserved: false, nextPractice: "guided" };
  const observations = state?.concepts.find((entry) => entry.id === concept)?.observations ?? [];
  const tasks = new Set<string>();
  const activities = new Set<string>();
  let latestIndependent: number | undefined;
  const unassignedDifficulty = state?.recent?.findLast((observation) => !observation.concept
    && (observation.outcome === "incorrect" || observation.outcome === "help-requested"));
  // Une difficulté récente remet le guidage au premier plan. Les réponses non notées n'ajoutent aucune réussite.
  const sinceDifficulty: Observation[] = [];
  for (const observation of observations) {
    if (observation.outcome === "incorrect" || observation.outcome === "help-requested") sinceDifficulty.length = 0;
    else sinceDifficulty.push(observation);
  }
  for (const observation of sinceDifficulty) {
    if (observation.at !== undefined && observation.at > now) continue;
    if (unassignedDifficulty && (unassignedDifficulty.at === undefined || observation.at === undefined
      || observation.at <= unassignedDifficulty.at)) continue;
    if (observation.outcome !== "correct" || !observation.method || observation.method === "ungraded") continue;
    const key = taskKey(observation.task);
    if (!key || tasks.has(key) || observation.activityId && activities.has(observation.activityId)) continue;
    tasks.add(key);
    if (observation.activityId) activities.add(observation.activityId);
    if (observation.support === "guided") result.guidedSuccesses++;
    else {
      result.independentSuccesses++;
      if (observation.purpose === "retrieval" && observation.at !== undefined && observation.at <= now
        && latestIndependent !== undefined && observation.at >= latestIndependent + REVIEW_DELAY_MS) result.retrievalObserved = true;
      if (observation.at !== undefined && observation.at <= now) latestIndependent = Math.max(latestIndependent ?? 0, observation.at);
      if (observation.purpose === "transfer") result.transferObserved = true;
    }
  }
  if (result.independentSuccesses >= PRACTICE_SUCCESSES) {
    result.nextPractice = "transfer";
    if (latestIndependent !== undefined) {
      result.reviewAt = latestIndependent + REVIEW_DELAY_MS;
      if (now >= result.reviewAt) result.nextPractice = "retrieval";
    }
  } else if (result.guidedSuccesses >= PRACTICE_SUCCESSES || result.independentSuccesses > 0) result.nextPractice = "independent";
  return result;
}
