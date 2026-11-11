import { describe, expect, it } from "vitest";
import { Action, SceneObject } from "@/domain/nesalio/contract";
import { validateModelOutput } from "@/domain/nesalio/validate";
import { PLAYABLE } from "@/engine/nesalioPlayback";
import { measureSceneObject } from "@/domain/nesalio/measurement";
import { PROMPT_EXAMPLES, buildNesalioMessages, buildNesalioSystemPrompt, continueMessage, describeSchema, languageReference, repairMessage } from "./prompt";

describe("prompt système Nesalio", () => {
  it("ne montre au modèle que des exemples que le moteur accepte", () => {
    for (const { title, slice } of PROMPT_EXAMPLES) {
      const result = validateModelOutput(JSON.parse(JSON.stringify({ slices: [slice] })));
      expect(result.ok ? [] : result.issues, title).toEqual([]);
    }
  });

  it("montre une vue d'ensemble nommée et le retour sur le mot revenons", () => {
    const prompt = buildNesalioSystemPrompt();
    expect(prompt).toContain('"save_as":"vue_courbe"');
    expect(prompt).toContain('"text":"revenons"');
    expect(prompt).toContain('"verb":"camera.restore","frame":"vue_courbe","at":"cue:retour"');
  });

  it("décrit chaque objet et chaque verbe que le lecteur exécute, et seulement eux", () => {
    const reference = languageReference();
    for (const option of SceneObject.options) expect(reference).toContain(`- ${option.shape.type.value} {`);
    for (const option of Action.options) {
      const verb = option.shape.verb.value;
      if (PLAYABLE.actions.has(verb)) expect(reference).toContain(`- ${verb} {`);
      else expect(reference).not.toContain(`- ${verb} {`);
    }
    expect(reference).not.toContain("- layout.reflow {");
    expect(reference).toMatch(/- math \{[^\n]*parts\?: \{ id: id, text: texte \}\[\] \(2 à 16\) « morceaux de la formule/);
    expect(reference).toMatch(/- write \{ target: id, part\?: id « écrit seulement cette partie de la formule » \}/);
    expect(reference).not.toContain("priority");
    expect(reference).toMatch(/- point \{ params: \{ at: \[nombre, nombre\] \} \}/);
  });

  it("demande l’explication et au plus deux questions de vérification, sans autre boucle pédagogique", () => {
    // Questions à l'élève depuis le 2026-11-10 (demande de l'utilisateur) : une ligne {"question"} vérifiée sur place.
    const prompt = buildNesalioSystemPrompt();
    expect(prompt).toContain("au plus deux questions à");
    expect(prompt).toContain('{"question": {"id", "prompt"');
    for (const loop of ["diagnosis", "remédiation", "quiz avant"]) expect(prompt).not.toContain(loop);
    expect(prompt).not.toMatch(/kairos/i);
  });

  it("porte les règles apprises sur la synchronisation et les mathématiques", () => {
    // « n'ont JAMAIS de coordonnées » : version complète seulement (la version allégée, défaut, laisse ce cas au code).
    const prompt = buildNesalioSystemPrompt("completes");
    for (const rule of ["MOTS ENTIERS", "NOMME ce qu'il montre", "parts", "cue_end", "log est le logarithme en base 10"]) {
      expect(prompt).toContain(rule);
    }
    expect(prompt).toContain("n'ont JAMAIS de coordonnées");
    // The readable zoom (0.6) shows about 26 × 15 units: larger axes can never be framed whole.
    expect(prompt).toContain("au plus 24 unités de large (x) et 13 de haut (y)");
  });

  it("prépare un récapitulatif court et libère sa place dans la tranche précédente", () => {
    const prompt = buildNesalioSystemPrompt();
    const rule = prompt.match(/^- RÉCAPITULATIF FINAL[^\n]*(?:\n {2}[^\n]*)*/m)?.[0] ?? "";
    expect(rule).toMatch(/composition courte\b/);
    expect(rule).toContain("visible jusqu'à la fin");
    expect(rule).toMatch(/camera\.focus[\s\S]*objets du\s+récapitulatif/);
    expect(rule).toMatch(/DERNIER passage de la tranche qui précède le récapitulatif[\s\S]*fade_out ou\s+remove/);
  });

  it("demande d’aller jusqu’au résultat écrit au tableau, sur un seul exemple", () => {
    // Seen in real generations: « x = 4 » said but never written, a vertex without its ordinate,
    // a graph of one parabola and calculations on another.
    const prompt = buildNesalioSystemPrompt();
    expect(prompt).toMatch(/réponds COMPLÈTEMENT[\s\S]*résultat est ÉCRIT au tableau/);
    expect(prompt).toContain("UN seul exemple du début à la fin");
  });

  it("interdit de découper une fraction en numérateur et dénominateur", () => {
    // Seen in real generations: « C'est quoi une fraction ? » failed three times on parts 3 | 4 for \frac{3}{4}.
    // Version complète seulement : la version allégée (défaut) laisse ce cas à normalize.ts, qui écrit la fraction d'un coup.
    expect(buildNesalioSystemPrompt("completes")).toContain("Une fraction ne se découpe JAMAIS en numérateur et dénominateur");
  });

  it("demande un tableau de valeurs avec ses intitulés de lignes, pas des étiquettes séparées", () => {
    const prompt = buildNesalioSystemPrompt();
    expect(prompt).toContain("UN objet matrix avec row_labels");
    expect(prompt).toContain("row_labels?:");
  });

  it("annonce les ancres nommées de triangle_right, celles que le moteur mesure", () => {
    // Visual judge V7: « 4 cm » hung along the hypotenuse because the prompt only offered top/bottom/left/right/center.
    const triangle = SceneObject.parse({ id: "t", type: "triangle_right", params: { leg_a: 3, leg_b: 4 } });
    const anchors = Object.keys(measureSceneObject(triangle, new Map(), { symbols: {}, expressions: {} }).anchors ?? {});
    expect(anchors.length).toBeGreaterThan(0);
    const prompt = buildNesalioSystemPrompt();
    for (const anchor of anchors) expect(prompt, anchor).toContain(`"${anchor}"`);
    expect(prompt).toMatch(/polygon n'a pas d'ancre de sommet[^\n]*point/);
  });

  it("fait tenir un surlignage pendant qu'on en parle et dire les symboles en mots", () => {
    // Visual judge V2: a highlight with only `at` is a flash; M18: symbols and chemical formulas read aloud.
    const prompt = buildNesalioSystemPrompt();
    expect(prompt).toMatch(/highlight[^\n]*start et end/);
    expect(prompt).toContain("« H deux O »");
  });

  it("ne demande pas 3 à 5 tranches à la leçon de refus", () => {
    // 2nd review of lot 1: the out-of-scope lesson has one tranche by design (pedagogy.ts, REFUSAL_EXAMPLE).
    const issues = [{ path: ["slices", 0], message: "Occurrence introuvable." }];
    const refusal = repairMessage("s_hors_perimetre", issues);
    expect(refusal).not.toContain("3 à 5");
    expect(refusal).toContain("seule tranche");
    expect(repairMessage("s_courbe", issues)).toContain("3 à 5 tranches");
    expect(continueMessage(["s_hors_perimetre"])).not.toContain("3 à 5");
    expect(continueMessage(["s_un"])).toContain("3 à 5");
  });

  it("écrit une notation compacte et lisible", () => {
    expect(describeSchema({ type: "object", properties: { a: { type: "number" }, b: { enum: ["x", "y"] } }, required: ["a"] })).toBe(
      '{ a: nombre, b?: "x" | "y" }',
    );
    expect(describeSchema({ type: "array", items: { type: "string", pattern: "^a" }, minItems: 1, maxItems: 4 })).toBe("id[] (1 à 4)");
  });

  it("pose la question de l’élève et renvoie les erreurs précises d’une tranche refusée", () => {
    const [system, user] = buildNesalioMessages("  Explique-moi une fonction logarithme ");
    expect(system!.role).toBe("system");
    expect(user!.content).toContain("« Explique-moi une fonction logarithme »");
    const repair = repairMessage("s_courbe", [{ path: ["slices", 0, "beats", 1, "cues", 0, "text"], message: "Occurrence introuvable." }]);
    expect(repair).toContain("« s_courbe »");
    expect(repair).toContain("slices.0.beats.1.cues.0.text : Occurrence introuvable.");
  });
});
