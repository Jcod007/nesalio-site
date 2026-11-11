import { afterEach, describe, expect, it, vi } from "vitest";
import { synthesizeSpeech, transcribeAudio, ZDR_TRANSCRIPTION_MODELS } from "./audio";

/** Sends one request through a fake fetch and returns the JSON body. */
function capture(reply: unknown) {
  const sent: Record<string, unknown>[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify(reply));
  }) as unknown as typeof fetch;
  return { sent, fetchImpl };
}

describe("vie privée de la transcription (voix de l'élève)", () => {
  afterEach(() => vi.unstubAllEnvs());
  const audio = { token: "t", audioBase64: "AAAA", mediaType: "audio/webm" };

  it("whisper (sans fournisseur ZDR) : seulement l'interdiction d'entraînement, pour ne pas faire tomber le micro", async () => {
    vi.stubEnv("NESALIO_ZDR", "");
    const { sent, fetchImpl } = capture({ text: "a" });
    await transcribeAudio({ ...audio, model: "openai/whisper-1", fetchImpl });
    expect(sent[0]!.providerOptions).toEqual({ gateway: { disallowPromptTraining: true } });
  });

  it.each(ZDR_TRANSCRIPTION_MODELS)("%s (fournisseur ZDR) : non-conservation et interdiction d'entraînement", async (model) => {
    vi.stubEnv("NESALIO_ZDR", "");
    const { sent, fetchImpl } = capture({ text: "a" });
    await transcribeAudio({ ...audio, model, fetchImpl });
    expect(sent[0]!.providerOptions).toEqual({ gateway: { zeroDataRetention: true, disallowPromptTraining: true } });
  });

  it("suit NESALIO_ZDR=0 comme le modèle : l'interdiction d'entraînement reste", async () => {
    vi.stubEnv("NESALIO_ZDR", "0");
    const { sent, fetchImpl } = capture({ text: "a" });
    await transcribeAudio({ ...audio, model: "microsoft/mai-transcribe-2", fetchImpl });
    expect(sent[0]!.providerOptions).toEqual({ gateway: { disallowPromptTraining: true } });
  });
});

describe("transcription refusée faute de fournisseur ZDR", () => {
  it("devient « indisponible » (403) pour que le micro passe à la reconnaissance du navigateur", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: "No ZDR providers…", type: "no_zdr_providers_available", statusCode: 400 }), {
        status: 400,
      })) as unknown as typeof fetch;
    await expect(transcribeAudio({ token: "t", model: "openai/whisper-1", audioBase64: "AAAA", mediaType: "audio/webm", fetchImpl })).rejects.toMatchObject({
      status: 403,
    });
    const other = (async () => new Response("format invalide", { status: 400 })) as unknown as typeof fetch;
    await expect(
      transcribeAudio({ token: "t", model: "openai/whisper-1", audioBase64: "AAAA", mediaType: "audio/webm", fetchImpl: other }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("vie privée de la voix de Nesa", () => {
  it("n'envoie pas ces options à la synthèse : ElevenLabs n'est sur aucune liste du Gateway, la voix tomberait", async () => {
    const { sent, fetchImpl } = capture({ audio: "AAAA" });
    await synthesizeSpeech({ token: "t", model: "elevenlabs/eleven-flash-v2.5", text: "Bonjour.", speed: 0.85, fetchImpl });
    await synthesizeSpeech({ token: "t", model: "elevenlabs/eleven-flash-v2.5", text: "Bonjour.", speed: 0.75, stability: 0.7, style: 0, fetchImpl });
    expect(sent[0]!.providerOptions).toEqual({ elevenlabs: { voiceSettings: { speed: 0.85 } } });
    expect(sent[1]!.providerOptions).toEqual({ elevenlabs: { voiceSettings: { speed: 0.75, stability: 0.7, style: 0 } } });
  });
});
