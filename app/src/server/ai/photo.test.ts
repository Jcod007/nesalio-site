import { afterEach, describe, expect, it, vi } from "vitest";
import { PHOTO_MAX_BYTES } from "@/domain/photo";
import { readExercisePhoto, UnreadablePhoto, validPhoto } from "./photo";

// Only the JPEG header is parsed here. The provider decodes the complete image.
function jpegHeader(width = 800, height = 600): string {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 0, 0, 0, 1, 1, 0x11, 0, 0xff, 0xd9]);
  bytes.writeUInt16BE(height, 7);
  bytes.writeUInt16BE(width, 9);
  return bytes.toString("base64");
}

afterEach(() => vi.unstubAllEnvs());

describe("photo JPEG bornée", () => {
  it("accepte une image aux dimensions permises", () => {
    expect(validPhoto(jpegHeader())).toBe(true);
    expect(validPhoto(jpegHeader(1600, 1200))).toBe(true);
  });
  it("refuse les images immenses, vides, tronquées et le faux base64", () => {
    expect(validPhoto(jpegHeader(1601, 1200))).toBe(false);
    expect(validPhoto(jpegHeader(0, 600))).toBe(false);
    expect(validPhoto(Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 50]).toString("base64"))).toBe(false);
    expect(validPhoto("https://example.com/photo.jpg")).toBe(false);
    expect(validPhoto(jpegHeader() + "=")).toBe(false);
    expect(validPhoto(Buffer.alloc(PHOTO_MAX_BYTES + 1).toString("base64"))).toBe(false);
  });
});

describe("lecture visuelle", () => {
  const reading = { readable: true, text: "Résous 3x − 5 = 10.", uncertainties: [] };
  const response = (data: unknown, finishReason = "stop") => Response.json({
    choices: [{ finish_reason: finishReason, message: { content: JSON.stringify(data) } }],
  });

  it("joint la photo, les protections existantes et valide la réponse", async () => {
    vi.stubEnv("NESALIO_ZDR", "1");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(reading));
    const result = await readExercisePhoto({ token: "test", model: "anthropic/claude-haiku-5.5", image: jpegHeader(), signal: new AbortController().signal, fetchImpl });
    expect(result).toEqual({ text: reading.text, uncertainties: [] });
    const body = JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string);
    expect(body.messages[1].content[0].image_url.url).toBe(`data:image/jpeg;base64,${jpegHeader()}`);
    expect(body.providerOptions.gateway).toEqual({ zeroDataRetention: true, disallowPromptTraining: true });
    expect(body.response_format.json_schema.strict).toBe(true);
  });

  it("refuse un énoncé illisible au lieu d'inventer les données", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({ ...reading, readable: false }));
    await expect(readExercisePhoto({ token: "test", model: "test", image: jpegHeader(), signal: new AbortController().signal, fetchImpl })).rejects.toBeInstanceOf(UnreadablePhoto);
  });

  it("refuse une extraction coupée par la limite de jetons", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(reading, "length"));
    await expect(readExercisePhoto({ token: "test", model: "test", image: jpegHeader(), signal: new AbortController().signal, fetchImpl })).rejects.toThrow("incomplète");
  });
});
