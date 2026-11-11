import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { describe, expect, it, vi } from "vitest";
import shell from "@/domain/nesalio/engineShell.json";
import { validateLesson } from "@/domain/nesalio/validate";
import { DEFAULTS, readAiConfig } from "@/server/config";
import { generateNesalio } from "@/server/nesalio/generator";
import { TEACHING, guideSection } from "@/server/nesalio/pedagogy";
import { buildNesalioSystemPrompt } from "@/server/nesalio/prompt";
import { buildTeacherMessages } from "@/server/nesalio/script";
import { streamChatCompletion } from "@/server/tutor/chatCompletions";
import { isIntact, lostSlices, outcomeOf } from "./banc-outils.mjs";

const questions = [
  { id: "equation", text: "Comment je résous (3x − 2)/4 = (x + 6)/2 sans me mêler dans les dénominateurs ?" },
  { id: "tangente", text: "Pour f(x) = x² − 4x + 1, comment je trouve la pente et l’équation de la tangente à x = 3 ?" },
  { id: "urne", text: "Dans un sac, il y a 5 boules rouges et 3 bleues. J’en tire 2 sans remise. Quelle est la probabilité d’avoir exactement une rouge ?" },
  { id: "sommet", text: "Peux-tu compléter le carré de x² + 6x − 7 et me montrer comment lire le sommet de la parabole ?" },
  { id: "aluminium", text: "Comment j’équilibre l’équation Al + O₂ → Al₂O₃ ? Je ne comprends pas pourquoi on change les chiffres devant." },
  {
    id: "dilution",
    text: "Je prends 25 mL d’une solution à 0,60 mol/L et j’ajoute de l’eau jusqu’à un volume total de 150 mL. Quelle est la nouvelle concentration, et pourquoi ?",
  },
];

const variants = ["complet", "allege", "deux-appels"];
const prompts = { complet: buildNesalioSystemPrompt("completes"), allege: buildNesalioSystemPrompt("allegees") };
const teacherPrompt = buildTeacherMessages(questions[0].text)[0].content;
const formatterPrompt = prompts.allege
  .replace(TEACHING, "Tu mets au format Nesalio un script déjà écrit. Conserve sa parole, son ordre, ses calculs et ses résultats.")
  .replace(/\n\nEXEMPLE DE LEÇON COMPLÈTE[^\n]*\n\n[\s\S]*?(?=\n\nEXEMPLE DE LEÇON OÙ LA FIGURE BOUGE)/u, "")
  .replace(/^- ce passage dit POURQUOI .*\n/m, "");

function provider() {
  const { AI_GATEWAY_API_KEY } = parseEnv(readFileSync(".env.local", "utf8"));
  if (!AI_GATEWAY_API_KEY) throw new Error("Ce banc exige la clé AI Gateway dédiée dans .env.local.");
  return readAiConfig(new Headers(), {
    AI_GATEWAY_API_KEY,
    TUTOR_MODEL: process.env.FOND_FORME_MODELE ?? DEFAULTS.gatewayModel,
    TUTOR_FIRST_TURN_EFFORT: "none",
  }).chat;
}

function messagesFor(options, variant, question, teacher) {
  if (teacher) return options.messages;
  const system = { role: "system", content: variant === "deux-appels" ? formatterPrompt : prompts[variant] };
  const [user, ...rest] = options.messages.slice(1);
  if (variant !== "deux-appels") return [system, user, ...rest];
  const guide = guideSection(question);
  const content = (guide ? user.content.replace(`\n\n${guide}\n\n`, "\n\n") : user.content).replace(
    "SCRIPT DE L'ENSEIGNANT (déjà vérifié) :",
    "SCRIPT DE L'ENSEIGNANT :",
  );
  return [system, { ...user, content }, ...rest];
}

function compareSpeech(script, lesson) {
  const clean = (text) => text.normalize("NFC").trim().replace(/\s+/gu, " ");
  const expected = Array.from(script.matchAll(/^\s*(?:\*\*)?DIT\s*:(?:\*\*)?\s*([^\r\n]+)/gim), (m) => clean(m[1]));
  const actual = lesson.slices.flatMap((slice) => slice.beats.map((beat) => clean(beat.say)));
  let lastMatch = -1;
  let matchedInOrder = 0;
  for (const say of expected) {
    const index = actual.indexOf(say, lastMatch + 1);
    if (index >= 0) {
      matchedInOrder++;
      lastMatch = index;
    }
  }
  return {
    expected: expected.length,
    actual: actual.length,
    matchedInOrder,
    exact: expected.length > 0 && expected.length === actual.length && matchedInOrder === expected.length,
  };
}

async function run(question, variant, round, chat) {
  const twoStage = variant === "deux-appels";
  const calls = [],
    logs = [],
    events = [],
    slices = [];
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  let script = "",
    header,
    firstSliceMs = null,
    teacherMs = null,
    thrown,
    upstreamStatus;
  async function* completion(options) {
    const teacher = twoStage && calls.length === 0;
    const messages = messagesFor(options, variant, question.text, teacher);
    const call = {
      role: teacher ? "fond" : twoStage ? "forme" : "ensemble",
      promptChars: messages.reduce((n, m) => n + m.content.length, 0),
      ms: 0,
      output: "",
    };
    const begin = elapsed();
    calls.push(call);
    try {
      for await (const chunk of streamChatCompletion({ ...options, messages, reasoningEffort: "none" })) {
        call.output += chunk;
        yield chunk;
      }
    } catch (error) {
      upstreamStatus = error?.status ?? upstreamStatus;
      throw error;
    } finally {
      call.ms = elapsed() - begin;
      if (teacher) {
        script = call.output;
        teacherMs = elapsed();
      }
    }
  }
  try {
    for await (const event of generateNesalio(question.text, {
      provider: chat,
      completion,
      twoStage,
      signal: AbortSignal.timeout(170_000),
      log: (message, detail) => {
        if (message !== "nesalio: script de l'enseignant") {
          logs.push(`${message} ${detail instanceof Error ? detail.message : typeof detail === "string" ? detail : JSON.stringify(detail)}`);
        }
      },
    })) {
      if (event.kind === "lesson") {
        header = event;
        events.push({ kind: "lesson" });
      } else if (event.kind === "slice") {
        firstSliceMs ??= elapsed();
        slices.push(event.slice);
        events.push({ kind: "slice", id: event.slice.slice_id });
      } else events.push(event);
    }
  } catch (error) {
    thrown = String(error);
  }
  const lesson = {
    ...shell,
    lesson: header?.lesson ?? shell.lesson,
    scene: { ...shell.scene, math_context: header?.math_context ?? { symbols: {}, expressions: {} } },
    slices,
  };
  const validation = slices.length > 0 && validateLesson(lesson).ok;
  const result = {
    question: question.id,
    variant,
    round,
    outcome: outcomeOf({ events, logs, thrown }),
    slices: slices.length,
    lost: lostSlices(
      logs,
      slices.map((slice) => slice.slice_id),
    ),
    valid: validation,
    firstSliceMs,
    teacherMs,
    ms: elapsed(),
    upstreamStatus,
    calls: calls.length,
    refusals: logs.filter((line) => line.startsWith("nesalio: tranche refusée")).length,
    repairs: logs.filter((line) => / réparée? sans appel/.test(line)).length,
    speech: twoStage ? compareSpeech(script, lesson) : null,
  };
  return { result: { ...result, intact: isIntact(result) }, lesson, script, calls, events, logs };
}

describe.runIf(process.env.FOND_FORME === "1")("banc fond et forme", () => {
  it("compare les trois variantes sur le même corpus", { timeout: 45 * 60_000 }, async () => {
    vi.stubEnv("NESALIO_ZDR", "1");
    try {
      expect(formatterPrompt).not.toContain(TEACHING);
      expect(formatterPrompt).not.toContain("EXEMPLE DE LEÇON COMPLÈTE");
      const chat = provider();
      const selected = process.env.FOND_FORME_QUESTIONS?.split(",");
      const corpus = selected ? questions.filter((q) => selected.includes(q.id)) : questions;
      const rounds = Number(process.env.FOND_FORME_TIRAGES ?? 2);
      expect(corpus.length).toBeGreaterThan(0);
      expect(rounds).toBeGreaterThan(0);
      const out = join(process.cwd(), "../analyses/banc", process.env.FOND_FORME_SORTIE ?? "fond-forme-2026-11-09");
      mkdirSync(out, { recursive: true });
      writeFileSync(
        join(out, "protocole.json"),
        JSON.stringify({ model: chat.model, rounds, corpus, prompts: { ...prompts, enseignant: teacherPrompt, metteurEnForme: formatterPrompt } }, null, 2),
      );
      const results = [];
      const jobs = Array.from({ length: rounds }, (_, i) =>
        corpus.flatMap((question, j) => variants.map((_, k) => ({ question, round: i + 1, variant: variants[(i + j + k) % variants.length] }))),
      ).flat();
      let next = 0,
        stop = false;
      await Promise.all(
        Array.from({ length: 3 }, async () => {
          while (!stop && next < jobs.length) {
            const { question, round, variant } = jobs[next++];
            const output = await run(question, variant, round, chat);
            const result = output.result;
            results.push(result);
            writeFileSync(join(out, `${question.id}-${round}-${variant}.json`), JSON.stringify(output));
            console.log(`${question.id}#${round} ${variant} : ${result.outcome}, ${result.slices} tranches, ${result.calls} appels`);
            stop ||= [401, 402, 403].includes(result.upstreamStatus);
          }
        }),
      );
      writeFileSync(join(out, "resultats.json"), JSON.stringify({ model: chat.model, rounds, planned: jobs.length, results }, null, 2));
      expect(stop, "Le Gateway a refusé la clé, le quota ou la politique de données.").toBe(false);
      expect(results).toHaveLength(jobs.length);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
