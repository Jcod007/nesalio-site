/**
 * GET /api/status — quels services sont branchés (sans rien appeler).
 *
 * Avec ?check=<SELFTEST_TOKEN>, fait aussi un petit appel réel à chaque
 * service, pour vérifier un déploiement. Sans le bon jeton, aucun appel payant.
 */
import { synthesizeSpeech } from "@/server/ai/audio";
import { GATEWAY_BASE, readAiConfig } from "@/server/config";
import { streamChatCompletion } from "@/server/tutor/chatCompletions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request): Promise<Response> {
  const config = readAiConfig(request.headers);
  const status = {
    tutor: config.chat ? { provider: config.chat.name, model: config.chat.model } : { provider: "demo" },
    voice: config.gatewayToken ? { model: config.voice.model, voice: config.voice.voice } : null,
    transcription: config.gatewayToken ? { model: config.transcription.model } : null,
  };

  const token = process.env.SELFTEST_TOKEN?.trim();
  const check = new URL(request.url).searchParams.get("check");
  if (!token || check !== token) return Response.json(status, { headers: { "Cache-Control": "no-store" } });

  const results: Record<string, string> = {};
  if (config.chat) {
    try {
      let text = "";
      for await (const chunk of streamChatCompletion({
        protocol: config.chat.protocol,
        endpoint: config.chat.endpoint,
        apiKey: config.chat.apiKey,
        model: config.chat.model,
        extraHeaders: config.chat.extraHeaders,
        maxTokens: 300,
        messages: [{ role: "user", content: "Réponds seulement : bonjour" }],
      })) {
        text += chunk;
      }
      results.tutor = `ok : ${text.trim().slice(0, 40)}`;
    } catch (error) {
      results.tutor = `erreur : ${(error as Error).message.slice(0, 300)}`;
    }
  }
  // ?models=a,b,c : essaie d'autres modèles sur AI Gateway (5 au plus).
  const models = (new URL(request.url).searchParams.get("models") ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean)
    .slice(0, 5);
  if (config.gatewayToken && models.length > 0) {
    await Promise.all(
      models.map(async (model) => {
        try {
          let text = "";
          for await (const chunk of streamChatCompletion({
            protocol: "openai",
            endpoint: `${GATEWAY_BASE}/v1/chat/completions`,
            apiKey: config.gatewayToken!,
            model,
            maxTokens: 300,
            messages: [{ role: "user", content: "Réponds seulement : bonjour" }],
          })) {
            text += chunk;
          }
          results[`model:${model}`] = `ok : ${text.trim().slice(0, 40)}`;
        } catch (error) {
          results[`model:${model}`] = `erreur : ${(error as Error).message.slice(0, 160)}`;
        }
      }),
    );
  }
  if (config.gatewayToken) {
    try {
      const { audio, mediaType } = await synthesizeSpeech({
        token: config.gatewayToken,
        model: config.voice.model,
        voice: config.voice.voice,
        instructions: config.voice.instructions,
        text: "Bonjour, je suis Nesa.",
      });
      results.voice = `ok : ${audio.byteLength} octets (${mediaType})`;
    } catch (error) {
      results.voice = `erreur : ${(error as Error).message.slice(0, 300)}`;
    }
  }
  return Response.json({ ...status, check: results }, { headers: { "Cache-Control": "no-store" } });
}
