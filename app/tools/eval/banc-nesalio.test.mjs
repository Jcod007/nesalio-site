/**
 * Banc de mesure Nesalio : chaque question du corpus (corpus-nesalio.json) est
 * générée TIRAGES fois par le vrai chemin de la route (/api/nesalio →
 * generateNesalio, même fournisseur que readAiConfig, corrections comprises),
 * puis un rapport compte les leçons intactes, les causes des échecs, les délais,
 * les refus, les réparations et un coût approximatif. Un fichier lisible par
 * leçon sert à la notation à la main (app/docs/grille-explication-nesalio.md).
 *
 * Ignoré par la suite normale ; dans app/ :
 *   BANC=1 npx vitest run tools/eval/banc-nesalio.test.mjs
 * Variables :
 *   TUTOR_MODEL       modèle (défaut : celui de la route, DEFAULTS.gatewayModel) ; ex. anthropic/claude-sonnet-4.5
 *   TIRAGES           tirages par question (défaut 2)
 *   PARALLELE         générations en même temps (défaut 4)
 *   QUESTIONS         ids séparés par des virgules (défaut : tout le périmètre)
 *   DISCIPLINE        mathematiques | chimie (défaut : les deux)
 *   HORS_PERIMETRE=1  ajoute les questions de physique
 *   SORTIE            nom du dossier de sortie (défaut : date-modèle)
 *   CORPUS            autre fichier de corpus, relatif à app/ (défaut : corpus-nesalio.json)
 *   PRIX_ENTREE, PRIX_SORTIE  prix en $ par million de jetons, pour le coût approximatif
 *   NESALIO_DEUX_ETAPES=1     comme la route : enseignant puis metteur en page
 * Écrit analyses/banc/<SORTIE>/ : rapport.md, rapport.json, et par leçon
 * <id>-t<n>.json (jouable), .journal.txt (refus, réparations) et .lisible.txt (dit / montré).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import shell from "@/domain/nesalio/engineShell.json";
import { validateLesson } from "@/domain/nesalio/validate";
import { readAiConfig } from "@/server/config";
import { generateNesalio } from "@/server/nesalio/generator";
import { guidesFor } from "@/server/nesalio/pedagogy";
import { streamChatCompletion } from "@/server/tutor/chatCompletions";
import { checkAnswer, isIntact, lessonText, lostSlices, outcomeOf, readCorpus, reportMarkdown, summarize } from "./banc-outils.mjs";

const LISIBLE = fileURLToPath(new URL("../../../analyses/outils/lisible.mjs", import.meta.url));

/** The route's provider, with the local token from .env.local when the shell has none (as lecon-reelle). */
function provider() {
  const env = { ...process.env };
  delete env.DISABLE_AI;
  if (!env.AI_GATEWAY_API_KEY && !env.VERCEL_OIDC_TOKEN && !env.ANTHROPIC_API_KEY && !env.OPENROUTER_API_KEY) {
    try {
      const file = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
      const token = file.match(/^(?:AI_GATEWAY_API_KEY|VERCEL_OIDC_TOKEN)="?([^"\r\n]+)/m)?.[1];
      if (token) env.AI_GATEWAY_API_KEY = token;
    } catch { /* No local file: readAiConfig reports the missing model below. */ }
  }
  const chat = readAiConfig(new Headers(), env).chat;
  if (!chat) throw new Error("Aucun modèle configuré (AI_GATEWAY_API_KEY, VERCEL_OIDC_TOKEN, OPENROUTER_API_KEY ou ANTHROPIC_API_KEY).");
  return chat;
}

function selectQuestions(corpus) {
  const only = process.env.QUESTIONS?.split(",").map((s) => s.trim()).filter(Boolean);
  const discipline = process.env.DISCIPLINE?.trim();
  return corpus.questions.filter((q) =>
    (only ? only.includes(q.id) : !q.horsPerimetre || process.env.HORS_PERIMETRE === "1")
    && (!discipline || q.discipline === discipline));
}

function chars(messages) {
  return messages.reduce((sum, m) => sum + (typeof m.content === "string" ? m.content.length : JSON.stringify(m.content).length), 0);
}

async function generate(question, round, chat) {
  const logs = [];
  const events = [];
  const counters = { calls: 0, inputChars: 0, outputChars: 0 };
  const completion = (options) => {
    counters.calls++;
    counters.inputChars += chars(options.messages);
    return (async function* () {
      for await (const chunk of streamChatCompletion(options)) { counters.outputChars += chunk.length; yield chunk; }
    })();
  };
  const started = Date.now();
  let firstSliceMs = null;
  let headerMs = null;
  let header;
  const slices = [];
  let thrown;
  try {
    for await (const event of generateNesalio(question.question, {
      provider: chat, completion, twoStage: process.env.NESALIO_DEUX_ETAPES === "1",
      log: (message, detail) => logs.push(`${message} ${typeof detail === "string" ? detail : detail instanceof Error ? `${detail.name}: ${detail.message}` : JSON.stringify(detail)}`),
    })) {
      if (event.kind === "lesson") { header = event; headerMs ??= Date.now() - started; events.push({ kind: "lesson" }); }
      else if (event.kind === "slice") { slices.push(event.slice); firstSliceMs ??= Date.now() - started; events.push({ kind: "slice", id: event.slice.slice_id }); }
      else events.push(event);
    }
  } catch (error) { thrown = String(error); }
  const lesson = { ...shell, lesson: header?.lesson ?? shell.lesson,
    scene: { ...shell.scene, math_context: header?.math_context ?? { symbols: {}, expressions: {} } }, slices };
  const validation = slices.length ? validateLesson(lesson) : { ok: false, issues: [{ message: "aucune tranche" }] };
  const text = lessonText(lesson);
  const result = {
    id: question.id, discipline: question.discipline, niveau: question.niveau, round,
    outcome: outcomeOf({ events, logs, thrown }),
    slices: slices.length,
    lost: lostSlices(logs, slices.map((s) => s.slice_id)),
    valid: validation.ok,
    invalidity: validation.ok ? [] : (validation.issues ?? []).slice(0, 5).map((i) => i.message),
    refusals: logs.filter((l) => l.startsWith("nesalio: tranche refusée")),
    unreadable: logs.filter((l) => l.startsWith("nesalio: ligne JSON illisible")),
    repairs: logs.filter((l) => / réparée? sans appel/.test(l)),
    headerMs, firstSliceMs, ms: Date.now() - started,
    ...counters,
    answer: slices.length ? checkAnswer(question, lesson) : null,
    neverShown: text.neverShown,
    words: text.words,
    guides: guidesFor(question.question).map((g) => g.id),
    ending: events.at(-1) ?? null,
    thrown: thrown ?? null,
  };
  return { result, lesson, logs };
}

function writeLesson(out, question, { result, lesson, logs }) {
  const base = join(out, `${question.id}-t${result.round}`);
  writeFileSync(`${base}.json`, JSON.stringify(lesson, null, 1));
  writeFileSync(`${base}.journal.txt`, [
    `Question : ${question.question}`,
    `Issue : ${result.outcome}${result.lost.length ? ` — tranches perdues : ${result.lost.join(", ")}` : ""} — intacte : ${isIntact(result) ? "oui" : "non"}`,
    `Fin : ${JSON.stringify(result.ending)}${result.thrown ? ` — exception : ${result.thrown}` : ""}`,
    `Tranches : ${result.slices} — en-tête après ${result.headerMs} ms, première tranche après ${result.firstSliceMs} ms, total ${result.ms} ms — ${result.calls} appel(s)`,
    `Validation de la leçon entière : ${result.valid ? "ok" : result.invalidity.join(" | ")}`,
    ...logs,
  ].join("\n"));
  // The graded file: question, reference and expectations, then what is said and shown. No model name (blind grading).
  let readable = "(aucune tranche jouable)";
  if (result.slices) {
    execFileSync(process.execPath, [LISIBLE, `${base}.json`, `${base}.lisible.tmp`]);
    readable = readFileSync(`${base}.lisible.tmp`, "utf8");
  }
  writeFileSync(`${base}.lisible.txt`, [
    `QUESTION (${question.id}, ${question.discipline}, ${question.niveau}, ${question.type}) : ${question.question}`,
    `RÉPONSE DE RÉFÉRENCE : ${question.reponse?.texte ?? "—"}`,
    "ATTENDUS À COCHER (présent / partiel / absent, avec citation) :",
    ...question.attendus.map((a, i) => `  ${i + 1}. ${a}`),
    `ERREURS GRAVES À CHERCHER : ${(question.erreursGravesPrevues ?? []).join(" ; ") || "—"}`,
    `CONTRÔLE AUTOMATIQUE : réponse ${result.answer == null ? "non vérifiée" : result.answer.ok ? "trouvée" : `absente (${result.answer.missing.join(", ")})${result.answer.saidOnly ? ", dite mais pas écrite" : ""}`} ; issue ${result.outcome}${result.lost.length ? `, tranches perdues : ${result.lost.join(", ")}` : ""}`,
    "",
    readable,
  ].join("\n"));
  rmSync(`${base}.lisible.tmp`, { force: true });
}

describe.runIf(process.env.BANC === "1")("banc de mesure Nesalio", () => {
  it("génère le corpus et écrit le rapport", { timeout: 6 * 3_600_000 }, async () => {
    // CORPUS: path of another corpus file (for example the Alloprof questions), relative to app/.
    const corpus = process.env.CORPUS ? JSON.parse(readFileSync(process.env.CORPUS, "utf8")) : readCorpus();
    const questions = selectQuestions(corpus);
    expect(questions.length).toBeGreaterThan(0);
    const chat = provider();
    const rounds = Number(process.env.TIRAGES ?? 2);
    const parallel = Math.max(1, Number(process.env.PARALLELE ?? 4));
    const startedAt = new Date().toISOString();
    const label = process.env.SORTIE?.trim() || `${startedAt.slice(0, 10)}-${chat.model.replace(/[^\w.-]+/g, "_")}`;
    const out = join(process.cwd(), "../analyses/banc", label);
    mkdirSync(out, { recursive: true });

    const jobs = [];
    for (let round = 1; round <= rounds; round++) for (const q of questions) jobs.push([q, round]);
    const results = [];
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(parallel, jobs.length) }, async () => {
      while (next < jobs.length) {
        const [q, round] = jobs[next++];
        const generated = await generate(q, round, chat);
        writeLesson(out, q, generated);
        const r = generated.result;
        results.push(r);
        console.log(`${q.id}#${round} : ${r.outcome}${r.lost.length ? " (tranche perdue)" : ""}, ${r.slices} tranches, 1re après ${r.firstSliceMs} ms, ${r.refusals.length} refus, ${r.repairs.length} réparées, réponse ${r.answer?.ok ? "écrite" : "absente"}`);
      }
    }));
    results.sort((a, b) => a.discipline.localeCompare(b.discipline) || a.id.localeCompare(b.id) || a.round - b.round);
    const prices = { input: Number(process.env.PRIX_ENTREE), output: Number(process.env.PRIX_SORTIE) };
    const summary = summarize(results, prices);
    const byDiscipline = Object.fromEntries([...new Set(results.map((r) => r.discipline))]
      .map((d) => [d, summarize(results.filter((r) => r.discipline === d), prices)]));
    const report = { label, model: chat.model, provider: chat.name, rounds, startedAt, corpusVersion: corpus.version, summary, byDiscipline, results };
    writeFileSync(join(out, "rapport.json"), JSON.stringify(report, null, 2));
    writeFileSync(join(out, "rapport.md"), reportMarkdown(report));
    console.log(`Rapport : ${join(out, "rapport.md")}\n${JSON.stringify(summary, null, 2)}`);
  });
});
