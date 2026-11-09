import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const synthesizeSpeech = vi.fn();
const transcribeAudio = vi.fn();
vi.mock("@/server/ai/audio", () => ({
  synthesizeSpeech: (options: unknown) => synthesizeSpeech(options),
  transcribeAudio: (options: unknown) => transcribeAudio(options),
  transcriptionPrivacy: () => ({ gateway: { disallowPromptTraining: true } }),
}));
vi.mock("@/server/tutor/chatCompletions", () => ({
  streamChatCompletion: async function* () { yield "bonjour"; },
}));

const { GET } = await import("./route");
const { DEFAULTS } = await import("@/server/config");

const request = (token?: string) => new Request("https://app.nesalio.com/api/status", token ? { headers: { authorization: `Bearer ${token}` } } : {});

beforeEach(() => {
  vi.stubEnv("SELFTEST_TOKEN", "secret-de-test");
  vi.stubEnv("AI_GATEWAY_API_KEY", "cle");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("OPENROUTER_API_KEY", "");
  vi.stubEnv("DISABLE_AI", "");
  vi.stubEnv("NESALIO_EXPLICATION", "");
  synthesizeSpeech.mockReset();
  transcribeAudio.mockReset();
  transcribeAudio.mockResolvedValue("Bonjour, je suis Nesa.");
  synthesizeSpeech.mockResolvedValue({ audio: new Uint8Array(1200), mediaType: "audio/mpeg", alignment: { characters: [] } });
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/status", () => {
  it("annonce la voix de Nesalio (ElevenLabs) quand Nesalio explique, sans rien appeler sans jeton", async () => {
    const body = await (await GET(request())).json();
    expect(body.voice).toMatchObject({ system: "nesalio", model: DEFAULTS.nesalioVoiceModel, speed: DEFAULTS.nesalioVoiceSpeed });
    expect(synthesizeSpeech).not.toHaveBeenCalled();
  });

  it("vérifie la voix réellement utilisée par Nesalio, en un seul court appel", async () => {
    const body = await (await GET(request("secret-de-test"))).json();
    expect(synthesizeSpeech).toHaveBeenCalledTimes(1);
    expect(synthesizeSpeech.mock.calls[0]![0]).toMatchObject({ model: DEFAULTS.nesalioVoiceModel, speed: DEFAULTS.nesalioVoiceSpeed, withTimestamps: true });
    expect(synthesizeSpeech.mock.calls[0]![0].text.length).toBeLessThan(40);
    expect(body.check.voice).toMatch(/^ok .*horodatage : oui/);
  });

  it("vérifie la transcription réelle sur le son de la voix, sans nouvelle synthèse", async () => {
    const body = await (await GET(request("secret-de-test"))).json();
    expect(synthesizeSpeech).toHaveBeenCalledTimes(1);
    expect(transcribeAudio).toHaveBeenCalledTimes(1);
    expect(transcribeAudio.mock.calls[0]![0]).toMatchObject({ model: DEFAULTS.transcriptionModel, mediaType: "audio/mpeg", audioBase64: Buffer.from(new Uint8Array(1200)).toString("base64") });
    expect(body.transcription).toMatchObject({ model: DEFAULTS.transcriptionModel, privacy: { disallowPromptTraining: true } });
    expect(body.check.transcription).toBe("ok : Bonjour, je suis Nesa.");
  });

  it("dit pourquoi la transcription échoue, et ne l'essaie pas sans son", async () => {
    transcribeAudio.mockRejectedValue(new Error("Transcription : 400 no_zdr_providers_available"));
    expect((await (await GET(request("secret-de-test"))).json()).check.transcription).toMatch(/^erreur : .*no_zdr/);
    synthesizeSpeech.mockRejectedValue(new Error("Voix : 500"));
    transcribeAudio.mockClear();
    expect((await (await GET(request("secret-de-test"))).json()).check.transcription).toMatch(/pas de son/);
    expect(transcribeAudio).not.toHaveBeenCalled();
  });

  it("vérifie la voix de l'ancien tuteur quand c'est lui qui explique", async () => {
    vi.stubEnv("NESALIO_EXPLICATION", "0");
    const body = await (await GET(request("secret-de-test"))).json();
    expect(body.voice).toMatchObject({ system: "tuteur", model: DEFAULTS.voiceModel });
    expect(synthesizeSpeech.mock.calls[0]![0]).toMatchObject({ model: DEFAULTS.voiceModel, voice: DEFAULTS.voiceName });
    expect(synthesizeSpeech.mock.calls[0]![0]).not.toHaveProperty("withTimestamps");
  });
});
