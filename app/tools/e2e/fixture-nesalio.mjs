#!/usr/bin/env node
/**
 * Convertit une leçon Nesalio enregistrée (analyses/generations/*.json, écrite
 * par tools/eval/lecon-reelle.test.mjs) en flux NDJSON tel que /api/nesalio
 * l'envoie : une ligne « lesson », une ligne par tranche, puis « end ».
 * Le résultat sert de réponse simulée au test de bout en bout (nesalio.mjs).
 *
 *   node tools/e2e/fixture-nesalio.mjs ../analyses/generations/r-equation.json tools/e2e/fixtures/lecon-equation.ndjson
 */
import { readFileSync, writeFileSync } from "node:fs";

export function lessonToNdjson(lesson) {
  const header = { kind: "lesson", lesson: lesson.lesson };
  const context = lesson.scene?.math_context;
  if (context && (Object.keys(context.symbols ?? {}).length || Object.keys(context.expressions ?? {}).length)) header.math_context = context;
  return [header, ...lesson.slices.map((slice) => ({ kind: "slice", slice })), { kind: "end" }].map((event) => JSON.stringify(event)).join("\n") + "\n";
}

if (process.argv[1]?.endsWith("fixture-nesalio.mjs")) {
  const [, , input, output] = process.argv;
  if (!input || !output) {
    console.error("Usage : node tools/e2e/fixture-nesalio.mjs <leçon.json> <sortie.ndjson>");
    process.exit(2);
  }
  writeFileSync(output, lessonToNdjson(JSON.parse(readFileSync(input, "utf8"))));
  console.log(`Flux écrit : ${output}`);
}
