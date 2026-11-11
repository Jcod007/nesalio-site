/**
 * GET /api/status — quels services sont branchés (sans rien appeler).
 *
 * Avec Authorization: Bearer <SELFTEST_TOKEN>, fait aussi un petit appel réel à chaque
 * service, pour vérifier un déploiement. Sans le bon jeton, aucun appel payant.
 * La voix vérifiée est celle de la page élève : ElevenLabs, avec horodatage des mots.
 * Un seul appel, phrase courte.
 * La transcription est essayée sur ce même son (pas de synthèse de plus), avec les options
 * de vie privée qu'elle envoie vraiment : un refus de la non-conservation s'y voit.
 */
import { synthesizeSpeech, transcribeAudio, transcriptionPrivacy } from "@/server/ai/audio";
import { DEFAULTS, GATEWAY_BASE, readAiConfig } from "@/server/config";
import { streamChatCompletion } from "@/server/tutor/chatCompletions";
import { hasSelfTestAccess } from "@/server/adminAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request): Promise<Response> {
  const config = readAiConfig(request.headers);
  // Same voice settings as /api/voice.
  const voice = { system: "nesalio", model: DEFAULTS.nesalioVoiceModel, speed: DEFAULTS.nesalioVoiceSpeed };
  const status = {
    tutor: config.chat ? { provider: config.chat.name, model: config.chat.model } : { provider: "demo" },
    voice: config.gatewayToken ? voice : null,
    transcription: config.gatewayToken ? { model: config.transcription.model, privacy: transcriptionPrivacy(config.transcription.model).gateway } : null,
  };

  if (!hasSelfTestAccess(request)) return Response.json(status, { headers: { "Cache-Control": "no-store" } });

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
    let sample: { audio: Uint8Array; mediaType: string } | null = null;
    try {
      const { audio, mediaType, alignment } = await synthesizeSpeech({
        token: config.gatewayToken,
        model: voice.model,
        speed: DEFAULTS.nesalioVoiceSpeed,
        withTimestamps: true,
        text: "Bonjour, je suis Nesa.",
      });
      // Nesalio times its gestures on the word timings: a voice without them plays, but late.
      results.voice = `ok : ${audio.byteLength} octets (${mediaType}), horodatage : ${alignment ? "oui" : "non"}`;
      sample = { audio, mediaType };
    } catch (error) {
      results.voice = `erreur : ${(error as Error).message.slice(0, 300)}`;
    }
    if (!sample) results.transcription = "non essayée : pas de son (la voix a échoué)";
    else {
      try {
        const text = await transcribeAudio({
          token: config.gatewayToken,
          model: config.transcription.model,
          audioBase64: Buffer.from(sample.audio).toString("base64"),
          mediaType: sample.mediaType,
        });
        results.transcription = `ok : ${text.slice(0, 60)}`;
      } catch (error) {
        results.transcription = `erreur : ${(error as Error).message.slice(0, 300)}`;
      }
    }
  }
  return Response.json({ ...status, check: results }, { headers: { "Cache-Control": "no-store" } });
}
