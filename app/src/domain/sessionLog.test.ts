import { describe, expect, it } from "vitest";
import type { TutorRequest } from "@/domain/tutor/request";
import { createTurnRecorder, isOlderThan, turnPath } from "./sessionLog";

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
