/**
 * Génère des leçons par le vrai chemin de la route (generateNesalio, corrections
 * comprises) et les enregistre jouables, pour les rejouer et les filmer avec
 * video-nesalio.mjs. Ignoré par la suite normale ; dans app/ :
 *   LECONS_REELLES=1 LECONS="sommet=Comment trouver le sommet d'une parabole ?;equation=Comment je résous 3x + 5 = 17 ?" npx vitest run tools/eval/lecon-reelle.test.mjs
 * DEUX_ETAPES=1 : l'enseignant écrit le script, puis le metteur en page (script.ts).
 * Écrit analyses/generations/<nom>.json (leçon) et <nom>.journal.txt (refus, réparations).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import shell from "@/domain/nesalio/engineShell.json";
import { validateLesson } from "@/domain/nesalio/validate";
import { DEFAULTS, GATEWAY_BASE } from "@/server/config";
import { generateNesalio } from "@/server/nesalio/generator";
import { streamChatCompletion } from "@/server/tutor/chatCompletions";

function gatewayToken() {
  const fromEnv = process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const file = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  return file.match(/^(?:AI_GATEWAY_API_KEY|VERCEL_OIDC_TOKEN)="?([^"\r\n]+)/m)?.[1] ?? null;
}

describe.runIf(process.env.LECONS_REELLES === "1")("leçons réelles Nesalio", () => {
  const lessons = (process.env.LECONS ?? "").split(";").filter(Boolean).map((entry) => {
    const at = entry.indexOf("=");
    return { name: entry.slice(0, at).trim(), question: entry.slice(at + 1).trim() };
  });
  it.each(lessons)("$name", { timeout: 300_000 }, async ({ name, question }) => {
    const provider = {
      name: "gateway", protocol: "openai", endpoint: `${GATEWAY_BASE}/v1/chat/completions`,
      apiKey: gatewayToken(), model: process.env.TUTOR_MODEL?.trim() || DEFAULTS.gatewayModel,
      reasoningEffort: "low", firstTurnEffort: DEFAULTS.firstTurnEffort,
    };
    const journal = [];
    let header;
    const slices = [];
    let ending;
    const started = Date.now();
    let firstSliceMs = null;
    const twoStage = process.env.DEUX_ETAPES === "1";
    for await (const event of generateNesalio(question, { provider, completion: streamChatCompletion, twoStage, log: (m, d) => journal.push(`${m} ${typeof d === "string" ? d : String(d)}`) })) {
      if (event.kind === "lesson") header = event;
      else if (event.kind === "slice") { slices.push(event.slice); firstSliceMs ??= Date.now() - started; }
      else ending = event;
    }
    const lesson = { ...shell, lesson: header?.lesson ?? shell.lesson,
      scene: { ...shell.scene, math_context: header?.math_context ?? { symbols: {}, expressions: {} } }, slices };
    const out = join(process.cwd(), "../analyses/generations");
    writeFileSync(join(out, `${name}.json`), JSON.stringify(lesson, null, 1));
    writeFileSync(join(out, `${name}.journal.txt`), [`Question : ${question}`, `Fin : ${JSON.stringify(ending)}`, `Tranches : ${slices.length}`,
      `Mode : ${twoStage ? "deux temps" : "un appel"} — première tranche après ${firstSliceMs} ms, total ${Date.now() - started} ms`, ...journal].join("\n"));
    console.log(`${name} : ${slices.length} tranches, ${JSON.stringify(ending)}`);
    expect(validateLesson(lesson).ok).toBe(true);
  });
});
