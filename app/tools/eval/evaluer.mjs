#!/usr/bin/env node
/**
 * Banc d'évaluation : joue chaque question de questions.json contre /api/diagnostic
 * (séance complète, élève simulé) et enregistre les mesures dans resultats/<date>.json.
 *
 *   NESALIO_URL=https://app.nesalio.com SELFTEST_TOKEN=… node tools/eval/evaluer.mjs [--answers=wrong] [--turns=3]
 *
 * Chaque séance coûte des appels au modèle : à lancer avant/après un changement de consigne ou du moteur,
 * pour comparer les chiffres (gestes, phrases « dites sans montrer », rejets, latence).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const base = process.env.NESALIO_URL ?? "https://app.nesalio.com";
const token = process.env.SELFTEST_TOKEN;
if (!token) {
  console.error("SELFTEST_TOKEN manquant (variable d'environnement).");
  process.exit(1);
}
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const answers = arg("answers", "wrong");
const turns = arg("turns", "3");
const questions = JSON.parse(readFileSync(join(here, "questions.json"), "utf8"));

const rows = [];
for (const q of questions) {
  const url = `${base}/api/diagnostic?check=${encodeURIComponent(token)}&ask=${encodeURIComponent(q.ask)}&answers=${answers}&turns=${turns}`;
  const started = Date.now();
  const report = await fetch(url).then((r) => r.json());
  const lesson = report.lesson ?? {};
  const row = {
    id: q.id,
    gestures: lesson.gestures,
    unshown: lesson.unshown,
    rejected: lesson.rejected?.count,
    unknownTargets: lesson.unknownTargets?.length,
    cueCoverage: lesson.cueCoverage,
    goals: lesson.goals?.length ?? 0,
    firstStepMs: (report.turns ?? []).map((t) => t.firstStepMs),
    totalMs: Date.now() - started,
    error: lesson.error,
  };
  rows.push(row);
  console.log(JSON.stringify(row));
}
const total = (key) => rows.reduce((n, r) => n + (Number(r[key]) || 0), 0);
console.log(`\nGestes : ${total("gestures")} · dit sans montrer : ${total("unshown")} · rejets : ${total("rejected")} · cibles absentes : ${total("unknownTargets")}`);
mkdirSync(join(here, "resultats"), { recursive: true });
writeFileSync(join(here, "resultats", `${new Date().toISOString().slice(0, 16).replace(":", "h")}.json`), JSON.stringify({ answers, turns, rows }, null, 2));
