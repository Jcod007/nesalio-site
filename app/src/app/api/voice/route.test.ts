import { afterEach, expect, it, vi } from "vitest";
import { CUE_TIMINGS_HEADER } from "@/domain/nesalio/alignment";
import { POST } from "./route";

vi.mock("@/server/account", () => ({ requireAccount: async () => ({ ok: true, userId: "audio-test" }) }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("renvoie les repères natifs du clip sans retranscrire la voix", async () => {
  vi.stubEnv("DISABLE_AI", "0");
  vi.stubEnv("AI_GATEWAY_API_KEY", "test");
  const characters = [..."L’étoile brille."];
  const fetchGateway = vi.fn<typeof fetch>().mockImplementation(async () =>
    Response.json({
      audio: "AQID",
      providerMetadata: {
        elevenlabs: {
          alignment: {
            characters,
            characterStartTimesSeconds: characters.map((_, index) => index / 10),
            characterEndTimesSeconds: characters.map((_, index) => (index + 1) / 10),
          },
        },
      },
    }),
  );
  vi.stubGlobal("fetch", fetchGateway);
  const response = await POST(
    new Request("http://localhost/api/voice", {
      method: "POST",
      body: JSON.stringify({ text: "L’étoile brille.", cues: [{ id: "star", text: "étoile" }] }),
    }),
  );
  expect(response.status).toBe(200);
  expect(fetchGateway).toHaveBeenCalledTimes(1);
  const [url, options] = fetchGateway.mock.calls[0]!;
  expect(url).toBe("https://ai-gateway.vercel.sh/v4/ai/speech-model");
  expect(new Headers(options?.headers).get("ai-model-id")).toBe("elevenlabs/eleven-flash-v2.5");
  expect(JSON.parse(String(options?.body))).toMatchObject({ providerOptions: { elevenlabs: { withTimestamps: true } } });
  expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
  expect(JSON.parse(response.headers.get(CUE_TIMINGS_HEADER)!)).toEqual({ star: { start: 200, end: 800 } });
  expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
});

it("livre le clip même quand un repère n’a pas d’heure, pour que la voix ne soit jamais perdue", async () => {
  vi.stubEnv("DISABLE_AI", "0");
  vi.stubEnv("AI_GATEWAY_API_KEY", "test");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ audio: "AQID" })),
  );
  const response = await POST(
    new Request("http://localhost/api/voice", {
      method: "POST",
      body: JSON.stringify({ text: "L’étoile brille.", cues: [{ id: "star", text: "étoile" }] }),
    }),
  );
  expect(response.status).toBe(200);
  expect(JSON.parse(response.headers.get(CUE_TIMINGS_HEADER)!)).toEqual({});
  expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
});
