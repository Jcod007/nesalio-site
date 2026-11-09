import { describe, expect, it } from "vitest";
import { Action, SceneObject } from "@/domain/nesalio/contract";
import { validateModelOutput } from "@/domain/nesalio/validate";
import { PLAYABLE } from "@/engine/nesalioPlayback";
import { PROMPT_EXAMPLES, buildNesalioMessages, buildNesalioSystemPrompt, describeSchema, languageReference, repairMessage } from "./prompt";

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

  it("demande seulement l’explication, sans boucle pédagogique", () => {
    const prompt = buildNesalioSystemPrompt();
    expect(prompt).toContain("Tu ne poses aucune question à l’élève".replace("’", "'"));
    for (const loop of ["ifRight", "ifWrong", "await", "diagnosis", "remédiation", "quiz avant"]) expect(prompt).not.toContain(loop);
    expect(prompt).not.toMatch(/kairos/i);
  });

  it("porte les règles apprises sur la synchronisation et les mathématiques", () => {
    const prompt = buildNesalioSystemPrompt();
    for (const rule of ["MOTS ENTIERS", "NOMME ce qu'il montre", "parts", "cue_end", "log est le logarithme en base 10"]) {
      expect(prompt).toContain(rule);
    }
    expect(prompt).toContain("n'ont JAMAIS de coordonnées");
    // The readable zoom (0.6) shows about 26 × 15 units: larger axes can never be framed whole.
    expect(prompt).toContain("au plus 24 unités de large (x) et 13 de haut (y)");
  });

  it("prépare un récapitulatif court et libère sa place dans la tranche précédente", () => {
    const prompt = buildNesalioSystemPrompt();
    const rule = prompt.match(/^- RÉCAPITULATIF FINAL[^\n]*(?:\n  [^\n]*)*/m)?.[0] ?? "";
    expect(rule).toMatch(/composition courte\b/);
    expect(rule).toContain("visible jusqu'à la fin");
    expect(rule).toMatch(/camera\.focus[\s\S]*objets du\s+récapitulatif/);
    expect(rule).toMatch(/DERNIER passage de la tranche qui précède le récapitulatif[\s\S]*fade_out ou\s+remove/);
  });

  it("écrit une notation compacte et lisible", () => {
    expect(describeSchema({ type: "object", properties: { a: { type: "number" }, b: { enum: ["x", "y"] } }, required: ["a"] }))
      .toBe('{ a: nombre, b?: "x" | "y" }');
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
