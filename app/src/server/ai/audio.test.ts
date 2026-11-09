import { afterEach, describe, expect, it, vi } from "vitest";
import { parseTimedWords, speechSpanOf, synthesizeSpeech, transcribeAudio, transcribeWords, ZDR_TRANSCRIPTION_MODELS, wavDurationMs, wavSamples } from "./audio";

/** En-tête WAV PCM minimal suivi de `dataBytes` octets de silence. */
function wav(sampleRate: number, channels: number, bitsPerSample: number, dataBytes: number): Uint8Array {
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, (sampleRate * channels * bitsPerSample) / 8, true);
  view.setUint16(32, (channels * bitsPerSample) / 8, true);
  view.setUint16(34, bitsPerSample, true);
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);
  return new Uint8Array(buffer);
}

describe("wavDurationMs", () => {
  it("calcule la durée à partir de l'en-tête", () => {
    expect(wavDurationMs(wav(24_000, 1, 16, 48_000))).toBe(1000);
  });

  it("renvoie null pour un fichier qui n'est pas un WAV", () => {
    expect(wavDurationMs(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("parseTimedWords", () => {
  it("lit les segments horodatés de la passerelle", () => {
    expect(
      parseTimedWords({
        text: "la pente",
        segments: [
          { text: "la", startSecond: 0.1, endSecond: 0.25 },
          { text: " pente", startSecond: 0.25, endSecond: 0.6 },
        ],
      }),
    ).toEqual([
      { text: "la", startMs: 100, endMs: 250 },
      { text: "pente", startMs: 250, endMs: 600 },
    ]);
  });

  it("accepte aussi le format « words » de Whisper", () => {
    expect(parseTimedWords({ words: [{ word: "vingt", start: 1, end: 1.4 }] })).toEqual([{ text: "vingt", startMs: 1000, endMs: 1400 }]);
  });

  it("renvoie une liste vide sans horodatage", () => {
    expect(parseTimedWords({ text: "bonjour" })).toEqual([]);
  });
});

describe("transcribeWords", () => {
  it("demande l'horodatage par mot à la passerelle", async () => {
    let sent: Record<string, unknown> = {};
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ text: "a", segments: [{ text: "a", startSecond: 0, endSecond: 0.2 }] }));
    }) as unknown as typeof fetch;
    const result = await transcribeWords({ token: "t", model: "openai/whisper-1", audioBase64: "AAAA", mediaType: "audio/wav", fetchImpl });
    expect(sent.providerOptions).toMatchObject({ openai: { timestampGranularities: ["word"] } });
    expect(result.words).toEqual([{ text: "a", startMs: 0, endMs: 200 }]);
  });
});

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
    await transcribeWords({ ...audio, model: "openai/whisper-1", fetchImpl });
    expect(sent[0]!.providerOptions).toEqual({ gateway: { disallowPromptTraining: true } });
    expect(sent[1]!.providerOptions).toEqual({ openai: { timestampGranularities: ["word"] }, gateway: { disallowPromptTraining: true } });
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
    const fetchImpl = (async () => new Response(JSON.stringify({ error: "No ZDR providers…", type: "no_zdr_providers_available", statusCode: 400 }), { status: 400 })) as unknown as typeof fetch;
    await expect(transcribeAudio({ token: "t", model: "openai/whisper-1", audioBase64: "AAAA", mediaType: "audio/webm", fetchImpl }))
      .rejects.toMatchObject({ status: 403 });
    const other = (async () => new Response("format invalide", { status: 400 })) as unknown as typeof fetch;
    await expect(transcribeAudio({ token: "t", model: "openai/whisper-1", audioBase64: "AAAA", mediaType: "audio/webm", fetchImpl: other }))
      .rejects.toMatchObject({ status: 400 });
  });
});

describe("vie privée de la voix de Nesa", () => {
  it("n'envoie pas ces options à la synthèse : ElevenLabs n'est sur aucune liste du Gateway, la voix tomberait", async () => {
    const { sent, fetchImpl } = capture({ audio: "AAAA" });
    await synthesizeSpeech({ token: "t", model: "elevenlabs/eleven-flash-v2.5", text: "Bonjour.", speed: 0.85, fetchImpl });
    expect(sent[0]!.providerOptions).toEqual({ elevenlabs: { voiceSettings: { speed: 0.85 } } });
  });
});

/** WAV 16 bits mono : `before` ms de silence, `voice` ms de son, `after` ms de silence. */
function voiceWav(rate: number, before: number, voice: number, after: number): Uint8Array {
  const n = (ms: number) => Math.round((ms / 1000) * rate);
  const total = n(before) + n(voice) + n(after);
  const bytes = wav(rate, 1, 16, total * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < n(voice); i++) view.setInt16(44 + (n(before) + i) * 2, Math.round(12000 * Math.sin((2 * Math.PI * 200 * i) / rate)), true);
  return bytes;
}

describe("wavSamples", () => {
  it("lit les échantillons 16 bits entre -1 et 1", () => {
    const decoded = wavSamples(voiceWav(16_000, 0, 100, 0))!;
    expect(decoded.sampleRate).toBe(16_000);
    expect(decoded.samples.length).toBe(1600);
    expect(Math.max(...decoded.samples)).toBeCloseTo(12000 / 32768, 2);
  });

  it("renvoie null pour un format qu'il ne sait pas lire", () => {
    expect(wavSamples(wav(16_000, 1, 8, 100))).toBeNull();
    expect(wavSamples(new Uint8Array([0, 1, 2]))).toBeNull();
  });
});

describe("speechSpanOf", () => {
  it("trouve la partie parlée d'un WAV", () => {
    const span = speechSpanOf(voiceWav(24_000, 300, 2000, 400), "audio/wav")!;
    expect(Math.abs(span.startMs - 300)).toBeLessThanOrEqual(20);
    expect(Math.abs(span.endMs - 2300)).toBeLessThanOrEqual(20);
  });

  it("ne devine rien pour un autre format (MP3)", () => {
    expect(speechSpanOf(new Uint8Array(100), "audio/mpeg")).toBeNull();
  });
});
