import { describe, expect, it } from "vitest";
import { emptyBoard } from "@/domain/board/state";
import { applyAction } from "@/domain/scene/commands";
import { resolvePoint } from "@/domain/scene/commands/points";
import { StreamEvent, type Check } from "@/domain/scene/schema";
import type { TutorRequest } from "@/domain/tutor/request";
import { solveThales, thalesLesson, thalesProgramEvents, THALES_EXERCISES } from "./thales";

const question: TutorRequest = { mode: "question", question: "Explique-moi le théorème de Thalès depuis zéro." };
const practice = (index = 0): TutorRequest => ({ mode: "followUp", question: "Maintenant, propose-moi un exercice guidé sur cette notion et laisse-moi essayer une étape.", context: { originalQuestion: question.question, spoken: [], board: [], program: { id: "thales-v1", exercise: index, phase: "explanation" } } });
const norm = (v: number[]) => Math.hypot(v[0]!, v[1]!);
const difference = (a: number[], b: number[]) => [a[0]! - b[0]!, a[1]! - b[1]!];

describe("parcours vérifiable de Thalès", () => {
  it("enseigne la configuration et résout un exemple sans quiz initial", () => {
    const events = thalesProgramEvents(question)!;
    expect(events[0]).toEqual({ kind: "source", source: "curriculum" });
    expect(events.every((event) => StreamEvent.safeParse(event).success)).toBe(true);
    expect(events.some((e) => e.kind === "step" && e.check)).toBe(false);
    expect(events.at(-1)).toMatchObject({ kind: "end", summary: expect.arrayContaining(["Ici : DE = 9 × 2 ÷ 6 = 3 cm"]) });
  });

  it.each(THALES_EXERCISES.map((e, i) => ({ ...e, index: i })))
    ("la géométrie respecte les mêmes rapports que le calcul ($index)", ({ sa, sd, ab, index }) => {
      const events = index === 0 ? thalesProgramEvents(question)! : thalesProgramEvents(practice(index - 1))!;
      let board = emptyBoard();
      for (const event of events) if (event.kind === "step") for (const action of event.do) board = applyAction(board, action, { start: 0, duration: 0 });
      const [s, a, b, d, e] = ["S", "A", "B", "D", "E"].map((name) => resolvePoint(board, name));
      expect([s, a, b, d, e].every(Boolean)).toBe(true);
      expect(resolvePoint(board, "dot-S")).toEqual(s);
      expect(resolvePoint(board, "dot-A")).toEqual(a);
      expect(resolvePoint(board, "dot-B")).toEqual(b);
      expect(norm(difference(d!, s!)) / norm(difference(a!, s!))).toBeCloseTo(sd / sa);
      expect(norm(difference(e!, s!)) / norm(difference(b!, s!))).toBeCloseTo(sd / sa);
      expect(norm(difference(e!, d!)) / norm(difference(b!, a!))).toBeCloseTo(sd / sa);
      expect(norm(difference(a!, s!)) / norm(difference(b!, a!))).toBeCloseTo(sa / ab);
      const de = difference(e!, d!), abVector = difference(b!, a!);
      expect(de[0]! * abVector[1]! - de[1]! * abVector[0]!).toBeCloseTo(0);
    });

  it.each([0, 1, 2, 3])("calcule le QCM et son corrigé à partir des données communes (%i)", (index) => {
    const events = thalesProgramEvents(practice(index))!;
    const check = events.find((e) => e.kind === "step" && e.check);
    expect(check?.kind).toBe("step");
    const q = (check as { check: Check }).check;
    const exercise = THALES_EXERCISES[(index + 1) % 4]!;
    expect(new Set(q.choices).size).toBe(q.choices.length);
    expect(q.choices[q.answer!]).toBe(`${String(solveThales(exercise)).replace(".", ",")} cm`);
    expect(q.prompt).toContain(`SA = ${exercise.sa} cm`);
  });

  it.each(["Je ne sais toujours pas", "27 cm"])("montre la résolution sans nouvelle interrogation après %s", (picked) => {
    const request: TutorRequest = { mode: "continue", question: question.question,
      context: { spoken: [], board: [], program: { id: "thales-v1", exercise: 0, phase: "practice" } },
      answer: { prompt: "Que vaut DE ?", choices: ["3 cm", "27 cm"], picked, correct: true, concept: "thales.ratios" } };
    const events = thalesProgramEvents(request)!;
    expect(events.some((e) => e.kind === "step" && e.check)).toBe(false);
    expect(events.filter((e) => e.kind === "step").map((e) => e.say).join(" ")).not.toContain("Ton résultat est juste");
    expect(events.at(-1)).toMatchObject({ kind: "end", summary: expect.arrayContaining(["DE = 9 × 2 ÷ 6 = 3 cm"]) });
  });

  it.each(["Explique la réciproque de Thalès.", "Avec SA=12, SD=4 et AB=5, calcule DE.", "Démontre le théorème de Thalès.", "Explique comment mesurer une rivière avec Thalès.", "Résume rapidement Thalès."])("ne remplace pas une demande spécialisée : %s", (text) => {
    expect(thalesProgramEvents({ mode: "question", question: text })).toBeNull();
  });

  it("laisse une nouvelle notion et une clarification libre au modèle", () => {
    expect(thalesProgramEvents({ ...practice(), question: "Donne-moi un exercice de chimie." })).toBeNull();
    expect(thalesProgramEvents({ ...practice(), question: "Pourquoi cet angle est-il égal ?" })).toBeNull();
    expect(thalesProgramEvents({ ...practice(), question: "Je ne comprends pas pourquoi cet angle est égal." })).toBeNull();
    expect(thalesProgramEvents({ ...practice(), question: "Je ne connais rien à la chimie." })).toBeNull();
  });

  it("change de représentation après deux besoins d'aide, en gardant les mêmes mesures", () => {
    const request = practice();
    request.question = "Je ne comprends toujours pas.";
    request.context!.learning = { v: 1, concepts: [{ id: "thales.ratios", presented: ["explanation", "worked-example"], observations: [
      { task: "Un rapport", outcome: "incorrect", format: "choice", support: "guided" },
      { task: "De l'aide", outcome: "help-requested", format: "free", support: "guided" },
    ] }] };
    const events = thalesProgramEvents(request)!;
    const words = events.filter((e) => e.kind === "step").map((e) => e.say).join(" ");
    expect(words).toContain("Changeons de chemin");
    expect(words).toContain("coefficient d'agrandissement 3");
    expect(words).toContain("DE mesure 3 cm");
    expect(events.some((e) => e.kind === "step" && e.check)).toBe(false);
  });

  it("rejette des mesures incompatibles plutôt que fabriquer un résultat", () => {
    expect(() => solveThales({ sa: 0, sd: 2, ab: 9 })).toThrow();
    expect(() => solveThales({ sa: 6, sd: 8, ab: 9 })).toThrow();
    expect(() => solveThales({ sa: 6, sd: 2, ab: 20, sb: 6 })).toThrow();
    // Sans SB, la proportion peut être résolue ; on ne peut pas déclarer le triangle impossible.
    expect(solveThales({ sa: 6, sd: 2, ab: 20 })).toBeCloseTo(20 / 3);
  });

  it("chaque étape de la leçon passe le même contrat que le transport HTTP", () => {
    for (const step of thalesLesson().steps) expect(StreamEvent.safeParse({ kind: "step", ...step }).success).toBe(true);
  });
});
