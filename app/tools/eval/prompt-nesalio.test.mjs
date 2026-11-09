/**
 * Exporte le prompt système Nesalio tel que le modèle le reçoit, pour le relire.
 * Ignoré par la suite normale ; à lancer avec :
 *   PROMPT_EXPORT=1 npx vitest run tools/eval/prompt-nesalio.test.mjs
 * Écrit dans PROMPT_EXPORT_SORTIE (sinon ../analyses/prompt-nesalio.md).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { buildNesalioSystemPrompt } from "@/server/nesalio/prompt";

describe.runIf(process.env.PROMPT_EXPORT === "1")("export du prompt Nesalio", () => {
  it("écrit le prompt complet", () => {
    const prompt = buildNesalioSystemPrompt();
    const out = process.env.PROMPT_EXPORT_SORTIE ?? join(process.cwd(), "../analyses/prompt-nesalio.md");
    const words = prompt.split(/\s+/).length;
    writeFileSync(out, `<!-- Généré depuis app/src/server/nesalio/prompt.ts — ${prompt.length} caractères, ${words} mots, environ ${Math.round(prompt.length / 3.5)} tokens -->\n\n${prompt}\n`);
    console.log(out, prompt.length, words);
  });
});
