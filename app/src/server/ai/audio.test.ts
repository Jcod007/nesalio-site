import { describe, expect, it } from "vitest";
import { parseTimedWords, transcribeWords, wavDurationMs } from "./audio";

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
    expect(sent.providerOptions).toEqual({ openai: { timestampGranularities: ["word"] } });
    expect(result.words).toEqual([{ text: "a", startMs: 0, endMs: 200 }]);
  });
});
