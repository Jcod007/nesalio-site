import { describe, expect, it } from "vitest";
import type { TutorRequest } from "@/domain/tutor/request";
import { createTurnRecorder, isOlderThan, summarizeSessions, turnPath, type TurnRecord } from "./sessionLog";

const question: TutorRequest = { mode: "question", question: "C'est quoi une somme ?" };

function recorder(request: TutorRequest = question) {
  let t = 1_000;
  const clock = { now: () => t, advance: (ms: number) => (t += ms) };
  const rec = createTurnRecorder({
    request,
    session: "3f9c2e1a-7b44-4c1d-9e0f-aa11bb22cc33",
    env: "production",
    source: "model",
    model: "deepseek/deepseek-v4.1-flash",
    startedAt: new Date("2026-10-18T14:12:05.123Z"),
    clock,
  });
  return { rec, clock };
}

describe("createTurnRecorder", () => {
  it("conserve une copie du plan dynamique utilisé pour le tour", () => {
    const plan = { goal: "Comprendre", target: "nouveau", concepts: [{ id: "nouveau", label: "Objectif", prerequisites: [] }] };
    const { rec } = recorder({ ...question, context: { spoken: [], board: [], plan } });
    const recorded = rec.record();
    expect(recorded.plan).toEqual(plan);
    recorded.plan!.concepts[0]!.label = "Autre";
    expect(plan.concepts[0]!.label).toBe("Objectif");
    expect(recorder().rec.record()).not.toHaveProperty("plan");
  });
  it("enregistre la provenance réelle d'un repli, sans lui attribuer un modèle", () => {
    const { rec } = recorder();
    rec.event({ kind: "source", source: "demo" });
    expect(rec.record().source).toBe("demo");
    expect(rec.record()).not.toHaveProperty("model");
  });
  it("conserve les observations pédagogiques pour rejouer les décisions sans réécrire les anciens tours", () => {
    const learning = { v: 1 as const, concepts: [{ id: "fractions.parts", presented: ["worked-example" as const], observations: [] }] };
    const { rec } = recorder({ mode: "continue", question: "Fractions", context: { spoken: [], board: [], learning },
      answer: { prompt: "Le 4 ?", choices: ["Partage", "Prises"], picked: "Je ne sais pas", correct: null, concept: "fractions.parts", support: "guided" } });
    const record = rec.record();
    expect(record.learning).toEqual(learning);
    expect(record.answer).toMatchObject({ correct: null, concept: "fractions.parts", support: "guided" });
    record.learning!.concepts[0]!.presented.length = 0;
    expect(learning.concepts[0]!.presented).toEqual(["worked-example"]);
    expect(recorder().rec.record()).not.toHaveProperty("learning");
  });
  it("garde exactement les événements envoyés à l'élève, dans l'ordre (format de rejeu)", () => {
    const { rec, clock } = recorder();
    rec.event({ kind: "source", source: "model" });
    clock.advance(800);
    rec.event({ kind: "lesson", title: "La somme" });
    clock.advance(400);
    rec.event({ kind: "step", say: "Voici 3 pommes.", do: [] });
    clock.advance(300);
    rec.finish("complete");
    const record = rec.record();
    expect(record.events.map((e) => e.kind)).toEqual(["source", "lesson", "step"]);
    // Attente de la première étape (ce que l'élève vit), pas du premier événement technique.
    expect(record.latencyMs).toEqual({ firstStep: 1200, total: 1500 });
    expect(record).toMatchObject({
      v: 1,
      env: "production",
      session: "3f9c2e1a-7b44-4c1d-9e0f-aa11bb22cc33",
      at: "2026-10-18T14:12:05.123Z",
      mode: "question",
      question: "C'est quoi une somme ?",
      source: "model",
      model: "deepseek/deepseek-v4.1-flash",
      outcome: "complete",
    });
  });

  it("garde la réponse de l'élève sans le contexte complet de la séance", () => {
    const { rec } = recorder({
      mode: "continue",
      question: "C'est quoi une somme ?",
      answer: { prompt: "Combien de pommes ?", choices: ["4", "5"], picked: "4", correct: false, misconception: "oublie une pomme" },
      context: { spoken: ["Voici 3 pommes."], board: [], goals: ["Réunir"], answered: 1 },
    });
    rec.finish("complete");
    const record = rec.record();
    expect(record.answer).toEqual({ prompt: "Combien de pommes ?", picked: "4", correct: false, misconception: "oublie une pomme" });
    expect(record.goals).toEqual(["Réunir"]);
    expect(JSON.stringify(record)).not.toContain("spoken");
  });

  it("considère un tour non terminé comme interrompu", () => {
    const { rec } = recorder();
    rec.event({ kind: "step", say: "Voici", do: [] });
    expect(rec.record().outcome).toBe("cancelled");
  });

  it("ne change plus d'issue une fois le tour fini", () => {
    const { rec } = recorder();
    rec.finish("error");
    rec.finish("complete");
    expect(rec.record().outcome).toBe("error");
  });
});

describe("turnPath", () => {
  it("range par environnement, jour et session courte, dans l'ordre chronologique", () => {
    const { rec } = recorder();
    rec.finish("complete");
    expect(turnPath(rec.record())).toBe("production/2026-10-18/3f9c2e1a/141205123-question.json");
  });

  it("range à part les tours sans session", () => {
    const { rec } = recorder();
    const record = { ...rec.record(), session: null };
    expect(turnPath(record)).toBe("production/2026-10-18/sans-session/141205123-question.json");
  });
});

describe("isOlderThan", () => {
  it("dit si un enregistrement dépasse la durée de conservation", () => {
    const now = new Date("2026-10-18T00:00:00Z");
    expect(isOlderThan(new Date("2025-10-17T00:00:00Z"), 365, now)).toBe(true);
    expect(isOlderThan(new Date("2025-10-19T00:00:00Z"), 365, now)).toBe(false);
  });
});

describe("référence d'inscription et résumé par séance", () => {
  const base = { v: 1, env: "production", source: "model", latencyMs: { total: 10 }, events: [] } as const;
  const turn = (over: Partial<TurnRecord>): TurnRecord => ({ ...base, session: "aaaa1111-0000", at: "2026-10-18T14:00:00.000Z", mode: "question", question: "", outcome: "complete", ...over }) as TurnRecord;

  it("garde la référence de l'inscription dans le tour, et rien sans inscription", () => {
    const make = (ref: string | null) =>
      createTurnRecorder({ request: question, session: "s-12345678", ref, env: "production", source: "model", startedAt: new Date(), clock: { now: () => 0 } }).record();
    expect(make("k3x9a1b2c3d4").ref).toBe("k3x9a1b2c3d4");
    expect(make(null)).not.toHaveProperty("ref");
  });

  it("regroupe les tours par séance : questions posées, vérifications réussies, tours interrompus", () => {
    const summaries = summarizeSessions([
      turn({ question: "C'est quoi une dérivée ?", ref: "k3x9a1b2c3d4" }),
      turn({ mode: "continue", answer: { prompt: "Pente ?", picked: "2", correct: true } }),
      turn({ mode: "followUp", question: "Et pour x² ?", outcome: "cancelled" }),
      turn({ session: "bbbb2222-0000", question: "Un vecteur ?" }),
    ]);
    expect(summaries).toEqual([
      { session: "aaaa1111", ref: "k3x9a1b2c3d4", debut: "2026-10-18T14:00:00.000Z", tours: 3, questions: ["C'est quoi une dérivée ?", "Et pour x² ?"], verifications: { bonnes: 1, total: 1 }, interrompus: 1 },
      { session: "bbbb2222", ref: null, debut: "2026-10-18T14:00:00.000Z", tours: 1, questions: ["Un vecteur ?"], verifications: { bonnes: 0, total: 0 }, interrompus: 0 },
    ]);
  });
});
