/**
 * Essai réel du prompt Nesalio : une question → le vrai modèle → chaque tranche
 * validée par le moteur → une leçon assemblée, jouable sur /dev/nesalio.
 * Pas de correction automatique : on mesure ce que le modèle produit du premier coup.
 * Ignoré par la suite normale ; à lancer avec :
 *   GENERATION_REELLE=1 QUESTION="Explique-moi une fonction logarithme" npx vitest run tools/eval/generation-reelle.test.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import shell from "@/domain/nesalio/engineShell.json";
import { validateLesson, validateModelOutput } from "@/domain/nesalio/validate";
import { GATEWAY_BASE, DEFAULTS } from "@/server/config";
import { buildNesalioMessages } from "@/server/nesalio/prompt";
import { streamChatCompletion } from "@/server/tutor/chatCompletions";

function gatewayToken() {
  const fromEnv = process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const file = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  return file.match(/^(?:AI_GATEWAY_API_KEY|VERCEL_OIDC_TOKEN)="?([^"\r\n]+)/m)?.[1] ?? null;
}

describe.runIf(process.env.GENERATION_REELLE === "1")("génération réelle Nesalio", () => {
  it("génère, valide et assemble une leçon", { timeout: 300_000 }, async () => {
    const question = process.env.QUESTION ?? "Explique-moi une fonction logarithme";
    const model = process.env.TUTOR_MODEL?.trim() || DEFAULTS.gatewayModel;
    const slug = process.env.SORTIE ?? question.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    const out = join(process.cwd(), "../analyses/generations");
    const started = Date.now();
    let raw = "";
    let firstSliceMs = null;
    for await (const chunk of streamChatCompletion({
      endpoint: `${GATEWAY_BASE}/v1/chat/completions`, apiKey: gatewayToken(), model,
      messages: buildNesalioMessages(question), maxTokens: 16_000, reasoningEffort: "low",
    })) {
      raw += chunk;
      if (firstSliceMs === null && /\n\s*\{\s*"slice"[^\n]*\n/.test(raw)) firstSliceMs = Date.now() - started;
    }
    const totalMs = Date.now() - started;

    const report = { question, model, firstSliceMs, totalMs, lines: [] };
    let header = null;
    let state;
    const slices = [];
    for (const [index, line] of raw.split("\n").map((l) => l.trim()).filter(Boolean).entries()) {
      let parsed;
      try { parsed = JSON.parse(line); } catch { report.lines.push({ index, ok: false, issue: "JSON illisible", line: line.slice(0, 160) }); continue; }
      if (parsed.lesson) { header = parsed; report.lines.push({ index, kind: "lesson", ok: true }); continue; }
      if (!parsed.slice) { report.lines.push({ index, ok: false, issue: "ligne inattendue", line: line.slice(0, 160) }); continue; }
      const result = validateModelOutput({ ...(state ? {} : { math_context: header?.math_context }), slices: [parsed.slice] }, state);
      if (result.ok) { state = result.state; slices.push(parsed.slice); }
      report.lines.push({ index, kind: "slice", id: parsed.slice.slice_id, ok: result.ok, issues: result.ok ? [] : result.issues.slice(0, 8).map((i) => `${i.path.join(".")} : ${i.message}`) });
      if (!result.ok) break; // les tranches suivantes dépendent de celle-ci
    }

    const lesson = { ...shell, lesson: header?.lesson ?? shell.lesson, scene: { ...shell.scene, math_context: header?.math_context ?? { symbols: {}, expressions: {} } }, slices };
    const assembled = slices.length ? validateLesson(lesson) : { ok: false, issues: [{ path: [], message: "aucune tranche valide" }] };
    report.assembled = assembled.ok ? "ok" : assembled.issues.slice(0, 5).map((i) => `${i.path.join(".")} : ${i.message}`);
    report.validSlices = slices.length;
    writeFileSync(join(out, `${slug}.brut.txt`), raw);
    writeFileSync(join(out, `${slug}.json`), JSON.stringify(lesson, null, 1));
    writeFileSync(join(out, `${slug}.rapport.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  });
});
