#!/usr/bin/env node
/**
 * Joue un scénario contre un déploiement (vrai modèle, élève simulé) et garde
 * tout : le rapport de /api/diagnostic et les événements bruts de chaque tour,
 * au format de rejeu (tools/rejeu/seance.py les rejoue dans un navigateur).
 *
 *   node tools/scenarios/jouer.mjs <url du déploiement> <scenario.json> <sortie.json>
 *   (jeton dans SELFTEST_TOKEN)
 *
 * scenario.json : { "id": "derivee", "ask": "C'est quoi une dérivée ?", "answers": "wrong", "turns": 4 }
 * answers : right | wrong (l'élève simulé se trompe, ce qui déclenche le diagnostic).
 */
import { readFileSync, writeFileSync } from "node:fs";

const [base, scenarioPath, outPath] = process.argv.slice(2);
const token = process.env.SELFTEST_TOKEN;
if (!base || !scenarioPath || !outPath || !token) {
  console.error("usage : SELFTEST_TOKEN=… node jouer.mjs <url> <scenario.json> <sortie.json>");
  process.exit(2);
}
const scenario = JSON.parse(readFileSync(scenarioPath, "utf8"));
const params = new URLSearchParams({
  check: token,
  ask: scenario.ask,
  answers: scenario.answers ?? "wrong",
  turns: String(scenario.turns ?? 4),
  raw: "1",
});
const started = Date.now();
const response = await fetch(`${base.replace(/\/$/, "")}/api/diagnostic?${params}`);
const report = await response.json();
const { raw, ...rest } = report;
writeFileSync(outPath, JSON.stringify({ scenario, ms: Date.now() - started, status: response.status, report: rest, turns: raw ?? [] }));
console.log(`${scenario.id} : HTTP ${response.status}, ${((Date.now() - started) / 1000).toFixed(0)} s, ${(raw ?? []).length} tours`);
