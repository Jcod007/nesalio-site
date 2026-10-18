/**
 * GET /api/diagnostic?check=<SELFTEST_TOKEN>&ask=<question>
 *     [&voice=1][&model=<id>][&effort=low][&answers=right|wrong][&turns=4]
 *
 * Joue une séance complète côté serveur, pour vérifier un déploiement (ou
 * comparer des modèles) sans navigateur :
 *   voice=1 : la question est d'abord dite par la voix de Nesa puis
 *             transcrite (micro simulé : voix → texte) ;
 *   ensuite : séance complète du modèle, validée comme dans l'application ;
 *   enfin   : la première phrase de Nesa est synthétisée (texte → voix).
 * Sans le bon jeton : 404, aucun appel payant.
 */
import { synthesizeSpeech, transcribeAudio } from "@/server/ai/audio";
import type { Check } from "@/domain/scene/schema";
import type { TutorRequest } from "@/domain/tutor/request";
import { emptyBoard, resolveTargets, summarizeBoard } from "@/domain/board/state";
import { applyAction } from "@/domain/scene/commands";
import { GATEWAY_BASE, parseEffort, readAiConfig, type ChatProvider } from "@/server/config";
import { streamChatCompletion } from "@/server/tutor/chatCompletions";
import { tutorEvents } from "@/server/tutor/service";
import type { Step } from "@/domain/scene/schema";
import { reviewNotes, reviewTurn } from "@/domain/tutor/turnReview";
import type { StudentAnswer } from "@/domain/tutor/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request): Promise<Response> {
  const token = process.env.SELFTEST_TOKEN?.trim();
  const params = new URL(request.url).searchParams;
  if (!token || params.get("check") !== token) return new Response("Not found", { status: 404 });

  const config = readAiConfig(request.headers);
  const started = Date.now();
  const ms = () => Date.now() - started;
  const report: Record<string, unknown> = {};

  let question = (params.get("ask") ?? "C'est quoi une fonction ?").slice(0, 300);

  // 1. Micro simulé : voix → texte.
  if (params.get("voice") === "1" && config.gatewayToken) {
    try {
      const spoken = await synthesizeSpeech({
        token: config.gatewayToken,
        model: config.voice.model,
        voice: config.voice.voice,
        text: question,
      });
      const heard = await transcribeAudio({
        token: config.gatewayToken,
        model: config.transcription.model,
        audioBase64: Buffer.from(spoken.audio).toString("base64"),
        mediaType: spoken.mediaType,
      });
      report.microphone = { said: question, heard, ms: ms() };
      if (heard) question = heard;
    } catch (error) {
      report.microphone = { error: (error as Error).message.slice(0, 300) };
    }
  }

  // 2. Séance complète, tour par tour : l'élève simulé répond à chaque question
  //    (answers=right : bonne réponse ; answers=wrong, par défaut : une erreur).
  const override = params.get("model")?.trim();
  const effort = parseEffort(params.get("effort")) ?? `${config.chat?.firstTurnEffort} puis ${config.chat?.reasoningEffort}`;
  const base: ChatProvider | null =
    override && config.gatewayToken
      ? { name: "gateway", protocol: "openai", endpoint: `${GATEWAY_BASE}/v1/chat/completions`, apiKey: config.gatewayToken, model: override }
      : config.chat;
  const forced = parseEffort(params.get("effort"));
  const provider = base ? { ...base, ...(forced ? { reasoningEffort: forced, firstTurnEffort: forced } : {}) } : null;
  const answerRight = params.get("answers") === "right";
  const maxTurns = Math.min(Number(params.get("turns") ?? 4) || 4, 6);

  const steps: { turn: number; say: string; mood?: string; do: string[]; check?: string }[] = [];
  const turns: Record<string, unknown>[] = [];
  const lesson: Record<string, unknown> = { provider: provider?.name ?? "demo", model: provider?.model ?? null, effort };
  let turnRequest: TutorRequest = { mode: "question", question };
  const spoken: string[] = [];
  // Le tableau est tenu comme dans le navigateur : le modèle reçoit son vrai état à chaque tour.
  let board = emptyBoard();
  const usage: Record<string, number> = {};
  const unknownTargets: string[] = [];
  /** Ce que le validateur a écarté (commandes ou lignes invalides) : mesure l'intérêt d'un format imposé. */
  const rejected: Array<{ line: string; reason: string }> = [];
  /** raw=1 : les événements bruts de chaque tour, pour rejouer la séance dans un navigateur. */
  const raw: unknown[][] = [];
  let cueable = 0;
  let cued = 0;
  let goals: string[] | undefined;
  const answerLog: Array<Omit<StudentAnswer, "choices">> = [];
  let review: string[] = [];
  let unshownTotal = 0;
  for (let turn = 1; turn <= maxTurns; turn++) {
    const turnStart = Date.now();
    const info: Record<string, unknown> = { turn, mode: turnRequest.mode };
    let lastCheck: Check | undefined;
    let awaiting = false;
    const log = (_message: string, detail?: unknown) => {
      if (Array.isArray(detail)) rejected.push(...(detail as Array<{ line: string; reason: string }>));
    };
    const turnEvents: unknown[] = [];
    const turnSteps: Step[] = [];
    let turnRejected: string[] = [];
    raw.push(turnEvents);
    for await (const event of tutorEvents(turnRequest, { provider, completion: streamChatCompletion, log })) {
      turnEvents.push(event);
      if (event.kind === "source") lesson.source = event.source;
      if (event.kind === "lesson") {
        lesson.title = event.title;
        if (event.goals) goals = lesson.goals = event.goals;
      }
      if (event.kind === "step") {
        const { kind: _kind, ...step } = event;
        turnSteps.push(step);
        if (info.firstStepMs === undefined) info.firstStepMs = Date.now() - turnStart;
        spoken.push(event.say);
        lastCheck = event.check;
        for (const action of event.do ?? []) {
          usage[action.type] = (usage[action.type] ?? 0) + 1;
          const key = "id" in action ? action.id : "target" in action ? action.target : undefined;
          if (typeof key === "string") {
            cueable++;
            if (event.cues && key in event.cues) cued++;
          }
          if ("target" in action && resolveTargets(board, action.target).length === 0) unknownTargets.push(`${action.type} ${action.target}`);
          board = applyAction(board, action, { start: 0, duration: 0 });
        }
        steps.push({
          turn,
          say: event.say,
          mood: event.mood,
          do: (event.do ?? []).map((a) => describe(a as Record<string, unknown>)),
          check: event.check ? `${event.check.prompt} [${event.check.choices.join(" | ")}]${event.check.answer === undefined ? " (situer)" : ` (bonne : ${event.check.choices[event.check.answer]})`}` : undefined,
        });
      }
      if (event.kind === "await") {
        awaiting = true;
        turnRejected = event.rejected ?? [];
      }
      if (event.kind === "end") lesson.summary = event.summary;
      if (event.kind === "error") lesson.error = `${event.code} : ${event.message}`;
    }
    info.totalMs = Date.now() - turnStart;
    // Même relecture que dans l'application : mesurée ici, rendue au modèle au tour suivant.
    const turnReview = reviewTurn(turnSteps, board);
    info.gestures = turnReview.gestures;
    if (turnReview.unshown.length > 0) info.unshown = turnReview.unshown.map((u) => `${u.word} : ${u.say}`);
    unshownTotal += turnReview.unshown.length;
    review = reviewNotes(turnReview, turnRejected);
    if (!awaiting || !lastCheck) {
      turns.push(info);
      break;
    }
    const picked = pickAnswer(lastCheck, answerRight);
    const correct = lastCheck.answer === undefined ? null : picked === lastCheck.answer;
    const misconception = correct === false ? lastCheck.why?.[picked]?.trim() || undefined : undefined;
    info.studentAnswer = `${lastCheck.choices[picked]} (${correct === null ? "situer" : correct ? "juste" : "faux"})${misconception ? ` — erreur visée : ${misconception}` : ""}`;
    turns.push(info);
    spoken.push(lastCheck.prompt);
    turnRequest = {
      mode: "continue",
      question,
      context: {
        title: typeof lesson.title === "string" ? lesson.title : undefined,
        originalQuestion: question,
        spoken: spoken.slice(-12).map((x) => x.slice(0, 320)),
        board: summarizeBoard(board).slice(0, 40),
        answered: turn,
        goals,
        answers: answerLog.length > 0 ? [...answerLog] : undefined,
        review: review.length > 0 ? review : undefined,
      },
      answer: { prompt: lastCheck.prompt, choices: lastCheck.choices, picked: lastCheck.choices[picked]!, correct, misconception },
    };
    answerLog.push({ prompt: lastCheck.prompt, picked: lastCheck.choices[picked]!, correct, misconception });
  }
  lesson.stepCount = steps.length;
  lesson.actionCount = steps.reduce((n, s) => n + s.do.length, 0);
  lesson.commands = usage;
  /** Gestes : ce qui bouge ou se transforme sous les yeux de l'élève (au moins un par tour attendu). */
  /** Phrases qui annoncent une action sans la montrer (« les bosses s'annulent » sans aire). */
  lesson.unshown = unshownTotal;
  lesson.gestures = ["move", "copy", "transform", "rotate", "applyMatrix"].reduce((n, type) => n + (usage[type] ?? 0), 0);
  /** Part des objets synchronisés sur la parole (repères {id}). */
  lesson.cueCoverage = cueable > 0 ? `${cued}/${cueable}` : "—";
  lesson.unknownTargets = unknownTargets;
  lesson.rejected = { count: rejected.length, examples: rejected.slice(0, 6).map((r) => `${r.reason} : ${r.line.slice(0, 120)}`) };
  report.lesson = lesson;
  report.turns = turns;
  report.steps = steps;
  if (params.get("raw") === "1") report.raw = raw;

  // 3. Voix de Nesa sur sa première phrase.
  const firstSay = steps[0]?.say;
  if (firstSay && config.gatewayToken) {
    try {
      const t = Date.now();
      const voice = await synthesizeSpeech({
        token: config.gatewayToken,
        model: config.voice.model,
        voice: config.voice.voice,
        instructions: config.voice.instructions,
        text: firstSay.slice(0, 400),
      });
      report.voice = { model: config.voice.model, bytes: voice.audio.byteLength, mediaType: voice.mediaType, ms: Date.now() - t };
    } catch (error) {
      report.voice = { error: (error as Error).message.slice(0, 300) };
    }
  }

  report.totalMs = ms();
  return Response.json(report, { headers: { "Cache-Control": "no-store" } });
}

/** Réponse de l'élève simulé : la bonne, ou une erreur ; pour une question pour le situer, « un peu ». */
function pickAnswer(check: Check, right: boolean): number {
  if (check.answer === undefined) return Math.min(1, check.choices.length - 1);
  if (right) return check.answer;
  return check.answer === 0 ? 1 : 0;
}

/** Résumé lisible d'une commande de scène : « curve sin(x) », « point (1, 0) »… */
function describe(action: Record<string, unknown>): string {
  const type = String(action.type);
  const detail =
    action.fn ?? action.expr ?? action.text ?? action.label ?? action.at ?? action.from ?? action.target ?? action.id ?? "";
  return `${type} ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.trim().slice(0, 80);
}
