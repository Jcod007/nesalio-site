/**
 * Suite normale : forme du corpus de mesure, outils du banc (sans modèle) et
 * flux enregistré du test de bout en bout, qui doit rester valide pour le contrat.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateLesson } from "@/domain/nesalio/validate";
import shell from "@/domain/nesalio/engineShell.json";
import { checkAnswer, isIntact, lessonText, lostSlices, normalizeText, outcomeOf, readCorpus, summarize } from "./banc-outils.mjs";

const corpus = readCorpus();
const FIXTURE = new URL("../e2e/fixtures/lecon-equation.ndjson", import.meta.url);

function fixtureLesson() {
  const events = readFileSync(FIXTURE, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const header = events.find((e) => e.kind === "lesson");
  return {
    events,
    lesson: {
      ...shell,
      lesson: header.lesson,
      scene: { ...shell.scene, math_context: header.math_context ?? { symbols: {}, expressions: {} } },
      slices: events.filter((e) => e.kind === "slice").map((e) => e.slice),
    },
  };
}

describe("corpus de mesure Nesalio", () => {
  const inScope = corpus.questions.filter((q) => !q.horsPerimetre);

  it("couvre au moins 30 questions de maths et de chimie de sec 4-5", () => {
    expect(inScope.length).toBeGreaterThanOrEqual(30);
    const chem = inScope.filter((q) => q.discipline === "chimie");
    expect(chem.filter((q) => q.niveau === "sec 4").length).toBeGreaterThanOrEqual(5);
    expect(chem.filter((q) => q.niveau === "sec 5").length).toBeGreaterThanOrEqual(5);
    expect(inScope.filter((q) => q.discipline === "mathematiques").length).toBeGreaterThanOrEqual(20);
    expect(inScope.every((q) => ["sec 4", "sec 5"].includes(q.niveau) && ["mathematiques", "chimie"].includes(q.discipline))).toBe(true);
  });

  it("donne à chaque question un id unique, des attendus, une réponse vérifiable et le drapeau de guide", () => {
    const ids = corpus.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const q of corpus.questions) {
      expect(q.id, q.id).toMatch(/^[a-z0-9-]+$/);
      expect(q.question.length, q.id).toBeGreaterThan(10);
      expect(q.attendus.length, q.id).toBeGreaterThanOrEqual(5);
      expect(typeof q.avecGuide, q.id).toBe("boolean");
      expect(["sens", "methode", "erreur"], q.id).toContain(q.type);
      expect(q.reponse.texte.length, q.id).toBeGreaterThan(0);
      expect(q.reponse.motifs.length, q.id).toBeGreaterThan(0);
      expect(["tableau", "parole_ou_tableau"], q.id).toContain(q.reponse.ou);
      for (const pattern of q.reponse.motifs) expect(() => new RegExp(pattern, "iu"), `${q.id} : ${pattern}`).not.toThrow();
    }
    expect(corpus.questions.filter((q) => q.type === "erreur" && q.discipline === "chimie").length).toBeGreaterThanOrEqual(2);
  });

  it("reconnaît chaque réponse de référence écrite telle quelle", () => {
    // The reference text, written on the board, must satisfy its own patterns.
    for (const q of corpus.questions) {
      const lesson = {
        slices: [
          {
            slice_id: "s",
            introduces: [{ id: "r", type: "math", content: q.reponse.texte }],
            beats: [{ id: "b", say: "", do: [{ id: "w", verb: "write", target: "r" }] }],
          },
        ],
      };
      expect(checkAnswer(q, lesson), q.id).toMatchObject({ ok: true });
    }
  });
});

describe("outils du banc", () => {
  it("simplifie LaTeX et unicode pour que les motifs s'appliquent", () => {
    expect(normalizeText("P = \\frac{1}{6}")).toBe("P = 1/6");
    expect(normalizeText("\\mathrm{C_3H_8} + 5\\,\\mathrm{O_2}")).toBe("C_3H_8 + 5 O_2");
    expect(normalizeText("C₃H₈ → 3 CO₂")).toBe("C3H8 → 3 CO2");
    expect(normalizeText("2433{,}31 \\$")).toContain("2433,31");
    expect(normalizeText("x = 2 \\pm \\sqrt{3}")).toBe("x = 2 ± √3");
    expect(normalizeText("(x + 3)² − 16")).toBe("(x + 3)^2 - 16");
    expect(normalizeText("90^{\\circ} = \\frac{\\pi}{2}")).toBe("90° = π/2");
  });

  it("lit la leçon enregistrée du test de bout en bout : valide, réponse écrite, rien de caché", () => {
    const { lesson } = fixtureLesson();
    expect(validateLesson(lesson).ok).toBe(true);
    const equation = corpus.questions.find((q) => q.id === "equation");
    expect(checkAnswer(equation, lesson)).toMatchObject({ ok: true });
    const text = lessonText(lesson);
    expect(text.said).toContain("x égale quatre");
    expect(text.words).toBeGreaterThan(20);
  });

  it("distingue une réponse seulement dite d'une réponse écrite", () => {
    const q = { reponse: { texte: "x = 4", motifs: ["x\\s*=\\s*4"], ou: "tableau" } };
    const said = { slices: [{ slice_id: "s", introduces: [{ id: "a", type: "math", content: "x = 4" }], beats: [{ id: "b", say: "x = 4", do: [] }] }] };
    expect(checkAnswer(q, said)).toEqual({ ok: false, missing: ["x\\s*=\\s*4"], saidOnly: true });
    expect(lessonText(said).neverShown).toEqual(["a"]);
  });

  it("repère une tranche annoncée en ligne illisible et jamais jouée", () => {
    const logs = ['nesalio: ligne JSON illisible Unexpected token — début : {"kind":"slice","slice":{"slice_id":"s_racines"'];
    expect(lostSlices(logs, ["s_intro"])).toEqual(["s_racines"]);
    expect(lostSlices(logs, ["s_intro", "s_racines"])).toEqual([]);
  });

  it("compte comme intacte seulement une leçon finie, complète et valide", () => {
    const base = { outcome: "complète", lost: [], valid: true };
    expect(isIntact(base)).toBe(true);
    expect(isIntact({ ...base, lost: ["s"] })).toBe(false);
    expect(isIntact({ ...base, valid: false })).toBe(false);
    expect(outcomeOf({ events: [{ kind: "lesson" }, { kind: "end" }], logs: [] })).toBe("complète");
    expect(outcomeOf({ events: [{ kind: "error", code: "invalid" }], logs: [] })).toBe("erreur invalid");
    expect(outcomeOf({ events: [{ kind: "end" }], logs: ["nesalio: leçon arrêtée sur un refus x"] })).toBe("arrêtée sur refus");
  });

  it("résume délais, refus, causes et coût", () => {
    const r = (over) => ({
      outcome: "complète",
      lost: [],
      valid: true,
      refusals: [],
      unreadable: [],
      repairs: [],
      calls: 1,
      firstSliceMs: 2000,
      ms: 8000,
      inputChars: 7000,
      outputChars: 3500,
      answer: { ok: true, saidOnly: false },
      ...over,
    });
    const summary = summarize(
      [
        r({}),
        r({ firstSliceMs: 4000, refusals: ["nesalio: tranche refusée s1 — Repère absent | Unrecognized key"] }),
        r({ outcome: "erreur invalid", firstSliceMs: null, answer: null }),
      ],
      { input: 1, output: 2 },
    );
    expect(summary).toMatchObject({
      lessons: 3,
      intact: 2,
      refusals: 1,
      firstSlice: { medianMs: 3000, maxMs: 4000 },
      causes: { "repère absent": 1, "clé inconnue": 1 },
      answers: { checked: 2, written: 2 },
    });
    expect(summary.costUsd).toBeCloseTo((6000 * 1 + 3000 * 2) / 1e6);
  });
});
