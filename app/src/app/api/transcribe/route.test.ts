import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpstreamError } from "@/server/tutor/chatCompletions";

const transcribeAudio = vi.fn();
vi.mock("@/server/ai/audio", () => ({ transcribeAudio: (options: unknown) => transcribeAudio(options) }));
vi.mock("@/server/account", () => ({ requireAccount: async () => ({ ok: true, userId: "eleve" }) }));

const { POST } = await import("./route");

const request = () =>
  new Request("https://app.nesalio.com/api/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audio: "A".repeat(200), mediaType: "audio/webm;codecs=opus" }),
  });

beforeEach(() => {
  vi.stubEnv("AI_GATEWAY_API_KEY", "cle");
  vi.stubEnv("DISABLE_AI", "");
  transcribeAudio.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/transcribe", () => {
  it("renvoie le texte transcrit", async () => {
    transcribeAudio.mockResolvedValue("bonjour");
    const response = await POST(request());
    expect(await response.json()).toEqual({ text: "bonjour" });
  });

  it.each([
    ["non-conservation refusée", new UpstreamError("Transcription : 400 no_zdr_providers_available", 403)],
    ["compte refusé", new UpstreamError("Transcription : 401", 401)],
    ["erreur du fournisseur", new UpstreamError("Transcription : 500", 500)],
  ])("%s : 502 avec un message clair, sans repli vers le navigateur", async (_case, error) => {
    transcribeAudio.mockRejectedValue(error);
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect((await response.json()).error).toBe("Micro indisponible pour le moment : écris ta question.");
  });
});
