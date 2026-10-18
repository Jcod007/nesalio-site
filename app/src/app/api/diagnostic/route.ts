/**
 * GET /api/diagnostic?check=<SELFTEST_TOKEN>&ask=<question>[&voice=1][&model=<id>]
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
import { GATEWAY_BASE, readAiConfig, type ChatProvider } from "@/server/config";
import { streamChatCompletion } from "@/server/tutor/chatCompletions";
import { tutorEvents } from "@/server/tutor/service";

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

  // 2. Séance complète.
  const override = params.get("model")?.trim();
  const provider: ChatProvider | null =
    override && config.gatewayToken
      ? { name: "gateway", protocol: "openai", endpoint: `${GATEWAY_BASE}/v1/chat/completions`, apiKey: config.gatewayToken, model: override }
      : config.chat;
  const steps: { say: string; mood?: string; do: string[]; check?: string }[] = [];
  const lesson: Record<string, unknown> = { provider: provider?.name ?? "demo", model: provider?.model ?? null };
  const tutorStart = Date.now();
  for await (const event of tutorEvents({ mode: "question", question }, { provider, completion: streamChatCompletion })) {
    if (event.kind === "source") lesson.source = event.source;
    if (event.kind === "lesson") lesson.title = event.title;
    if (event.kind === "step") {
      if (steps.length === 0) lesson.firstStepMs = Date.now() - tutorStart;
      steps.push({
        say: event.say,
        mood: event.mood,
        do: (event.do ?? []).map((a) => describe(a as Record<string, unknown>)),
        check: event.check?.prompt,
      });
    }
    if (event.kind === "end") lesson.summary = event.summary;
    if (event.kind === "error") lesson.error = `${event.code} : ${event.message}`;
  }
  lesson.totalMs = Date.now() - tutorStart;
  lesson.stepCount = steps.length;
  lesson.actionCount = steps.reduce((n, s) => n + s.do.length, 0);
  report.lesson = lesson;
  report.steps = steps;

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

/** Résumé lisible d'une commande de scène : « curve sin(x) », « point (1, 0) »… */
function describe(action: Record<string, unknown>): string {
  const type = String(action.type);
  const detail =
    action.fn ?? action.expr ?? action.text ?? action.label ?? action.at ?? action.from ?? action.target ?? action.id ?? "";
  return `${type} ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.trim().slice(0, 80);
}
