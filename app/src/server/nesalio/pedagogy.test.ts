import { describe, expect, it } from "vitest";
import { buildNesalioMessages, buildNesalioSystemPrompt } from "./prompt";
import { LessonMetadata } from "@/domain/nesalio/contract";
import { validateModelOutput } from "@/domain/nesalio/validate";
import { EXAMPLE_LESSON, exampleLessonText, guidesFor } from "./pedagogy";

const ids = (question: string) => guidesFor(question).map((guide) => guide.id);

describe("pédagogie du générateur Nesalio", () => {
  // Measured on 2026-11-08: without the tutor's teaching rules and guides, Nesalio explained worse (3.3/5 vs 4.0/5).
  it("rend au modèle les règles d'enseignement du tuteur, pour le public québécois", () => {
    const prompt = buildNesalioSystemPrompt();
    for (const rule of ["IDÉE CENTRALE", "JUSTIFIE", "conditions d'application d'une règle AVANT sa formule",
      "CHOISIS DES EXEMPLES OÙ ÇA SE VOIT", "programme québécois", "dollars et non euros", "LE TABLEAU EXPLIQUE",
      "UNE SEULE tranche de conclusion", "ce passage dit POURQUOI"]) {
      expect(prompt, rule).toContain(rule);
    }
  });

  it("joint à la question le guide de sa notion, et seulement lui", () => {
    expect(ids("C'est quoi une dérivée, concrètement ?")).toEqual(["derivee"]);
    expect(ids("C'est quoi le nombre dérivé, sur un graphique ?")[0]).toBe("derivee");
    expect(ids("Pourquoi (x + 5)² ce n'est pas x² + 25 ?")).toEqual(["polynomes"]);
    expect(ids("Comment je résous 3x + 5 = 17 ?")).toEqual(["algebre"]);
    expect(ids("Comment calculer l'hypoténuse d'un triangle rectangle ?")).toEqual(["geometrie"]);
    expect(ids("Comment calculer la portée d'un projectile ?")).toEqual(["physique"]);
    expect(ids("Raconte-moi une blague")).toEqual([]);
    const [, user] = buildNesalioMessages("C'est quoi une dérivée, concrètement ?");
    expect(user!.content).toContain("GUIDE POUR CETTE NOTION");
    expect(user!.content).toContain("sécante");
    expect(user!.content).not.toContain("modèle d'aire");
    // The system prompt is the same for every question (cacheable); the guide travels with the question.
    expect(buildNesalioMessages("Comment je résous 3x + 5 = 17 ?")[0]!.content).toBe(buildNesalioMessages("C'est quoi une dérivée ?")[0]!.content);
  });

  it("montre une leçon complète que le moteur accepte, tranche après tranche", () => {
    let state: Parameters<typeof validateModelOutput>[1];
    EXAMPLE_LESSON.slices.forEach((slice, index) => {
      const input = JSON.parse(JSON.stringify({ ...(index ? {} : { math_context: EXAMPLE_LESSON.header.math_context }), slices: [slice] }));
      const result = validateModelOutput(input, state);
      expect(result.ok ? [] : result.issues.map(({ path, message }) => `${path.join(".")} : ${message}`), slice.slice_id).toEqual([]);
      if (result.ok) state = result.state;
    });
    expect(LessonMetadata.safeParse(EXAMPLE_LESSON.header.lesson).success).toBe(true);
    // A real lesson in the system prompt, not only fragments: it shows the thread and the justification.
    expect(buildNesalioSystemPrompt()).toContain(exampleLessonText());
  });

  it("donne pour la dérivée des nombres justes", () => {
    const [, user] = buildNesalioMessages("C'est quoi une dérivée ?");
    // Seen in a real generation: the derivative of x² at 2 announced as « deux ». The guide states it.
    expect(user!.content).toContain("en 2 il est 4");
    expect(user!.content).toContain("(q+1)*(x-1)+1");
  });
});
