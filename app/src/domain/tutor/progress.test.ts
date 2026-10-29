import { describe, expect, it } from "vitest";
import { emptyLearning, recordObservation, recordPresentation, type Observation } from "./learning";
import { learningEvidence, REVIEW_DELAY_MS } from "./progress";

const success = (task: string, extra: Partial<Observation> = {}): Observation => ({
  task, outcome: "correct", format: "choice", support: "guided", method: "answer-key", at: 1000, ...extra,
});
const stateFor = (...observations: Observation[]) => observations.reduce((state, observation) => recordObservation(state, "idee", observation), emptyLearning());

describe("progression à partir des observations", () => {
  it("n'invente pas une maîtrise depuis une présentation, une réponse non notée ou un ancien verdict sans provenance", () => {
    const presented = recordPresentation(emptyLearning(), { concept: "idee", role: "worked-example", completes: true });
    expect(learningEvidence(presented, "idee", 2000).nextPractice).toBe("guided");
    const state = stateFor(success("A", { method: undefined }), success("B", { outcome: "ungraded" }));
    expect(learningEvidence(state, "idee", 2000).guidedSuccesses).toBe(0);
  });

  it("propose une tentative autonome après deux tâches guidées distinctes", () => {
    const evidence = learningEvidence(stateFor(success("A"), success("B")), "idee", 2000);
    expect(evidence).toMatchObject({ guidedSuccesses: 2, independentSuccesses: 0, nextPractice: "independent" });
    expect(evidence).not.toHaveProperty("mastery");
  });

  it("ne compte pas plusieurs fois le même énoncé ou le même identifiant d'activité", () => {
    expect(learningEvidence(stateFor(success(" A "), success("a")), "idee", 2000).guidedSuccesses).toBe(1);
    expect(learningEvidence(stateFor(success("A", { activityId: "item" }), success("B", { activityId: "item" })), "idee", 2000).guidedSuccesses).toBe(1);
  });

  it("réduit l'aide, puis propose un transfert et un rappel à échéance sans fabriquer de rétention", () => {
    const state = stateFor(success("A", { support: "independent", at: 1000 }), success("B", { support: "independent", at: 2000 }));
    expect(learningEvidence(state, "idee", 3000)).toMatchObject({ nextPractice: "transfer", reviewAt: 2000 + REVIEW_DELAY_MS, retrievalObserved: false });
    expect(learningEvidence(state, "idee", 2000 + REVIEW_DELAY_MS).nextPractice).toBe("retrieval");
    const immediate = recordObservation(state, "idee", success("C", { support: "independent", purpose: "retrieval", at: 3000 }));
    expect(learningEvidence(immediate, "idee", 4000).retrievalObserved).toBe(false);
    const delayed = recordObservation(state, "idee", success("C", { support: "independent", purpose: "retrieval", at: 2000 + REVIEW_DELAY_MS }));
    expect(learningEvidence(delayed, "idee", 3000 + REVIEW_DELAY_MS).retrievalObserved).toBe(true);
  });

  it("revient au guidage après une erreur, une demande d'aide non attribuée ou un changement de notion", () => {
    const state = stateFor(success("A"), success("B"), success("C", { outcome: "incorrect" }));
    expect(learningEvidence(state, "idee", 3000).nextPractice).toBe("guided");
    const helped = recordObservation(stateFor(success("A"), success("B")), undefined,
      success("Aide", { outcome: "help-requested", at: 1500 }));
    expect(learningEvidence(helped, "idee", 3000).nextPractice).toBe("guided");
    expect(learningEvidence(helped, "autre", 3000).guidedSuccesses).toBe(0);
  });

  it("une date future ne déclenche pas une révision ni une preuve de rappel", () => {
    const state = stateFor(success("A", { support: "independent", at: 9000 }), success("B", { support: "independent", at: 10_000, purpose: "retrieval" }));
    expect(learningEvidence(state, "idee", 2000).reviewAt).toBeUndefined();
    expect(learningEvidence(state, "idee", 2000).retrievalObserved).toBe(false);
    expect(learningEvidence(state, "idee", 2000).independentSuccesses).toBe(0);
  });
});
