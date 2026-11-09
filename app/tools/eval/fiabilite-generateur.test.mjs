/**
 * Banc de fiabilité du générateur Nesalio : les mêmes questions passent par le
 * vrai chemin de la route (/api/nesalio → generateNesalio, avec correction des
 * tranches refusées), et on compte les leçons complètes et les refus par cause.
 * Ignoré par la suite normale ; à lancer dans app/ avec :
 *   FIABILITE=1 SORTIE=avant npx vitest run tools/eval/fiabilite-generateur.test.mjs
 * Options : TOURS (passages par question, 2 par défaut), PARALLELE (4 par défaut).
 * Écrit analyses/fiabilite/<SORTIE>.json (résumé + détail) et un .brut.txt par appel au modèle.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { DEFAULTS, GATEWAY_BASE } from "@/server/config";
import { generateNesalio } from "@/server/nesalio/generator";
import { streamChatCompletion } from "@/server/tutor/chatCompletions";
import { cause } from "./banc-outils.mjs";

const QUESTIONS = [
  { id: "sommet", ask: "Comment trouver le sommet d'une parabole ?" },
  { id: "equation", ask: "Comment je résous 3x + 5 = 17 ?" },
  { id: "proportion", ask: "Comment savoir si un tableau est un tableau de proportionnalité ?" },
  { id: "image", ask: "Comment lire l'image d'un nombre sur un graphique ?" },
  { id: "pythagore", ask: "Comment calculer l'hypoténuse d'un triangle rectangle ?" },
  { id: "logarithme", ask: "Explique-moi une fonction logarithme" },
  { id: "developper", ask: "Comment je développe (2x − 3)(x + 4) ?" },
  { id: "fractions", ask: "Comment additionner deux fractions qui n'ont pas le même dénominateur ?" },
  { id: "coefficient", ask: "À quoi sert le coefficient a dans y = ax² ?" },
  { id: "derivee", ask: "C'est quoi le nombre dérivé, sur un graphique ?" },
];

function gatewayToken() {
  const fromEnv = process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const file = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  return file.match(/^(?:AI_GATEWAY_API_KEY|VERCEL_OIDC_TOKEN)="?([^"\r\n]+)/m)?.[1] ?? null;
}

// Shared with the Nesalio bench (banc-nesalio.test.mjs).
export { cause } from "./banc-outils.mjs";

async function run(question, round, out, label) {
  const logs = [];
  const calls = [];
  const events = [];
  const started = Date.now();
  const completion = (options) => {
    const index = calls.push("") - 1;
    return (async function* () {
      for await (const chunk of streamChatCompletion(options)) { calls[index] += chunk; yield chunk; }
    })();
  };
  const provider = {
    name: "gateway", protocol: "openai", endpoint: `${GATEWAY_BASE}/v1/chat/completions`,
    apiKey: gatewayToken(), model: process.env.TUTOR_MODEL?.trim() || DEFAULTS.gatewayModel,
    reasoningEffort: "low", firstTurnEffort: DEFAULTS.firstTurnEffort,
  };
  let thrown;
  try {
    for await (const event of generateNesalio(question.ask, {
      provider, completion,
      log: (message, detail) => logs.push(`${message} ${typeof detail === "string" ? detail : detail instanceof Error ? `${detail.name}: ${detail.message}` : JSON.stringify(detail)}`),
    })) events.push(event.kind === "slice" ? { kind: "slice", id: event.slice.slice_id } : event.kind === "lesson" ? { kind: "lesson" } : event);
  } catch (error) { thrown = String(error); }
  calls.forEach((raw, i) => writeFileSync(join(out, `${label}-${question.id}-${round}-appel${i + 1}.brut.txt`), raw));
  const last = events.at(-1);
  const slices = events.filter((e) => e.kind === "slice").length;
  const refusals = logs.filter((l) => l.startsWith("nesalio: tranche refusée"));
  const unreadable = logs.filter((l) => l.startsWith("nesalio: ligne JSON illisible"));
  const normalized = logs.filter((l) => l.startsWith("nesalio: tranche réparée sans appel"));
  // The generator logs when it gives up. (The « avant » run predates that log: there, two refusals meant a stop.)
  const stoppedOnRefusal = logs.some((l) => l.startsWith("nesalio: leçon arrêtée"));
  const outcome = thrown ? "exception" : last?.kind === "error" ? `erreur ${last.code}` : stoppedOnRefusal ? "arrêtée sur refus" : last?.kind === "end" ? "complète" : "sans fin";
  return { id: question.id, round, outcome, slices, calls: calls.length, ms: Date.now() - started, refusals, unreadable, normalized, logs, events, thrown };
}

describe.runIf(process.env.FIABILITE === "1")("fiabilité du générateur Nesalio", () => {
  it("mesure les leçons complètes sur les questions du banc", { timeout: 1_800_000 }, async () => {
    const label = process.env.SORTIE ?? "mesure";
    const rounds = Number(process.env.TOURS ?? 2);
    const parallel = Number(process.env.PARALLELE ?? 4);
    const only = process.env.QUESTIONS?.split(",");
    const out = join(process.cwd(), "../analyses/fiabilite");
    mkdirSync(out, { recursive: true });
    const jobs = [];
    for (let round = 1; round <= rounds; round++) for (const q of QUESTIONS) if (!only || only.includes(q.id)) jobs.push([q, round]);
    const results = [];
    let next = 0;
    await Promise.all(Array.from({ length: parallel }, async () => {
      while (next < jobs.length) {
        const [q, round] = jobs[next++];
        const result = await run(q, round, out, label);
        results.push(result);
        console.log(`${q.id}#${round} : ${result.outcome}, ${result.slices} tranches, ${result.refusals.length} refus, ${result.unreadable.length} illisibles, ${result.normalized.length} réparées sans appel`);
      }
    }));
    results.sort((a, b) => a.id.localeCompare(b.id) || a.round - b.round);
    const outcomes = {};
    const causes = {};
    for (const r of results) {
      outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;
      for (const line of [...r.refusals, ...r.unreadable]) {
        // A refusal line can carry several reasons: count each cause once per refusal.
        for (const c of new Set(line.split(" | ").map(cause))) causes[c] = (causes[c] ?? 0) + 1;
      }
    }
    const summary = { label, model: process.env.TUTOR_MODEL?.trim() || DEFAULTS.gatewayModel, total: results.length,
      complete: outcomes["complète"] ?? 0, outcomes, causes };
    writeFileSync(join(out, `${label}.json`), JSON.stringify({ summary, results }, null, 2));
    console.log(JSON.stringify(summary, null, 2));
  });
});
