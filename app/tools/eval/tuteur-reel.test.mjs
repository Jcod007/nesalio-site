/**
 * Premier tour de l'ANCIEN tuteur sur des questions, en vrais appels, pour comparer
 * ses explications à celles de Nesalio (même modèle). On garde tout ce que Nesa dit
 * et dessine jusqu'à sa première question à l'élève (« await »), ou jusqu'à la fin.
 * Ignoré par la suite normale ; dans app/ :
 *   TUTEUR_REEL=1 LECONS="nom=question;..." npx vitest run tools/eval/tuteur-reel.test.mjs
 * Écrit analyses/generations/<nom>.txt (lisible) et <nom>.events.json (événements bruts).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { DEFAULTS, GATEWAY_BASE } from "@/server/config";
import { tutorEvents } from "@/server/tutor/service";
import { streamChatCompletion } from "@/server/tutor/chatCompletions";

function gatewayToken() {
  const fromEnv = process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const file = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
  return file.match(/^(?:AI_GATEWAY_API_KEY|VERCEL_OIDC_TOKEN)="?([^"\r\n]+)/m)?.[1] ?? null;
}

describe.runIf(process.env.TUTEUR_REEL === "1")("premier tour réel de l'ancien tuteur", () => {
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
    const events = [];
    const journal = [];
    const lines = [`Question : ${question}`, ""];
    for await (const event of tutorEvents({ mode: "question", question }, {
      provider, completion: streamChatCompletion, log: (m, d) => journal.push(`${m} ${typeof d === "string" ? d : JSON.stringify(d)}`),
    })) {
      events.push(event);
      if (event.kind === "step") {
        lines.push(`--- Étape ${events.filter((e) => e.kind === "step").length}${event.mood ? ` (${event.mood})` : ""}`);
        for (const part of event.segments ?? [{ say: event.say, do: event.do ?? [] }]) {
          lines.push(`DIT : ${part.say}`);
          for (const action of part.do ?? []) lines.push(`  TABLEAU : ${JSON.stringify(action)}`);
        }
        if (event.check) lines.push(`QUESTION : ${JSON.stringify(event.check)}`);
      } else lines.push(`[${event.kind}] ${JSON.stringify(event)}`);
      if (event.kind === "await" || event.kind === "end" || event.kind === "error") break;
    }
    const out = join(process.cwd(), "../analyses/generations");
    writeFileSync(join(out, `${name}.txt`), [...lines, "", "Journal :", ...journal].join("\n"));
    writeFileSync(join(out, `${name}.events.json`), JSON.stringify(events, null, 1));
    console.log(`${name} : ${events.filter((e) => e.kind === "step").length} étapes, fin ${events.at(-1)?.kind}`);
  });
});
