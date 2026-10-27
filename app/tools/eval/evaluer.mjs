#!/usr/bin/env node
/**
 * Banc d'évaluation : joue chaque question de questions.json contre /api/diagnostic
 * (séance complète, élève simulé) et enregistre les mesures dans resultats/<date>.json.
 *
 *   NESALIO_URL=https://app.nesalio.com SELFTEST_TOKEN=… node tools/eval/evaluer.mjs [--answers=wrong] [--turns=3] [--set=sn4]
 *
 * --set=sn4 joue questions-sn4.json (1re étape de SN 4 : factorisation, division de polynômes,
 * expressions rationnelles, partie entière). Une question peut exiger du contenu du programme :
 *   "mustUse": commandes de dessin attendues ("stepFunction"),
 *   "mustMention" / "mustNotMention": expressions régulières cherchées dans ce que Nesa dit, écrit
 *   et demande (méthode de la classe, bon résultat, notation québécoise).
 * Le rapport donne alors « programme : 3/4 » et ce qui manque.
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
const set = arg("set", "");
const questions = JSON.parse(readFileSync(join(here, set ? `questions-${set}.json` : "questions.json"), "utf8"));

/** Tout ce que l'élève voit et entend : paroles, dessins (avec leur texte), questions, résumé. */
function sessionText(report) {
  const steps = (report.steps ?? []).map((s) => [s.say, ...(s.do ?? []), s.check ?? ""].join(" "));
  return [...steps, ...(report.lesson?.summary ?? [])].join("\n").normalize("NFC");
}

/** Contenu du programme attendu : commandes, mentions exigées, mentions interdites. */
function programCheck(q, report) {
  const text = sessionText(report);
  const used = report.lesson?.commands ?? {};
  const misses = [];
  let total = 0;
  for (const type of q.mustUse ?? []) {
    total++;
    if (!used[type]) misses.push(`commande absente : ${type}`);
  }
  for (const pattern of q.mustMention ?? []) {
    total++;
    if (!new RegExp(pattern, "iu").test(text)) misses.push(`non mentionné : ${pattern}`);
  }
  for (const pattern of q.mustNotMention ?? []) {
    total++;
    if (new RegExp(pattern, "iu").test(text)) misses.push(`interdit : ${pattern}`);
  }
  return total === 0 ? null : { score: `${total - misses.length}/${total}`, ok: total - misses.length, total, misses };
}

const rows = [];
const maxCases = Number(arg("limit", String(questions.length)));
if (!Number.isInteger(maxCases) || maxCases < 1) throw new Error("--limit doit être un entier positif");
const selected = questions.slice(0, maxCases);
for (const q of selected) {
  const url = `${base}/api/diagnostic?check=${encodeURIComponent(token)}&ask=${encodeURIComponent(q.ask)}&answers=${answers}&turns=${turns}`;
  const started = Date.now();
  let report;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(300_000) });
    if (!response.ok) throw new Error("HTTP " + response.status);
    report = await response.json();
    if (report.error && !report.lesson) throw new Error(String(report.error));
  } catch (error) {
    const failure = { id: q.id, failed: true, error: String(error), totalMs: Date.now() - started };
    rows.push(failure);
    console.log(JSON.stringify(failure));
    continue;
  }
  const lesson = report.lesson ?? {};
  const row = {
    id: q.id,
    failed: Boolean(lesson.error),
    provider: lesson.provider,
    model: lesson.model,
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
  const program = programCheck(q, report);
  if (program) {
    row.program = program.score;
    if (program.misses.length > 0) row.programMisses = program.misses;
    row._ok = program.ok;
    row._total = program.total;
  }
  rows.push(row);
  console.log(JSON.stringify(row));
}
const total = (key) => rows.reduce((n, r) => n + (Number(r[key]) || 0), 0);
const count = rows.length;
const failures = rows.filter((row) => row.failed).length;
const average = (key) => count ? total(key) / count : 0;
const latency = rows.flatMap((row) => row.firstStepMs ?? []).filter((ms) => Number.isFinite(ms)).sort((a, b) => a - b);
const percentile = (p) => latency.length ? latency[Math.ceil(latency.length * p) - 1] : null;
const metrics = {
  attempted: count, failures, successRate: count ? (count - failures) / count : null,
  totalRejected: total("rejected"), averageRejectedPerCase: average("rejected"),
  totalUnknownTargets: total("unknownTargets"), totalUnshown: total("unshown"),
  averageGesturesPerCase: average("gestures"), firstStepP50Ms: percentile(0.5), firstStepP95Ms: percentile(0.95),
  programPassed: total("_ok"), programTotal: total("_total"),
  programRate: total("_total") ? total("_ok") / total("_total") : null,
};
console.log("Métriques : " + JSON.stringify(metrics));
if (total("_total") > 0) console.log(`Programme : ${total("_ok")}/${total("_total")} critères respectés`);
mkdirSync(join(here, "resultats"), { recursive: true });
writeFileSync(join(here, "resultats", `${set ? `${set}-` : ""}${new Date().toISOString().slice(0, 16).replace(":", "h")}.json`), JSON.stringify({ evaluatedAt: new Date().toISOString(), url: base, set: set || "general", answers, turns, metrics, rows }, null, 2));
