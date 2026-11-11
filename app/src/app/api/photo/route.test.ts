import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "./route";

const access = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/server/account", () => ({
  requireAccount: async () => (access.allowed ? { ok: true, userId: "photo-test" } : { ok: false, response: new Response(null, { status: 401 }) }),
}));

const image = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 100, 0, 100, 1, 1, 0x11, 0, 0xff, 0xd9]).toString("base64");
const request = (body: unknown = { image }) => new Request("http://localhost/api/photo", { method: "POST", body: JSON.stringify(body) });
const modelFetch = vi.fn<typeof fetch>();

beforeEach(() => {
  access.allowed = true;
  vi.stubEnv("AI_GATEWAY_API_KEY", "test");
  vi.stubEnv("DISABLE_AI", "0");
  modelFetch.mockReset().mockResolvedValue(
    Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({ readable: true, text: "Calcule la masse de 2 mol de NaCl.", uncertainties: ["Unité à vérifier"] }),
          },
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", modelFetch);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("renvoie l'énoncé et ses incertitudes, sans cache", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ text: "Calcule la masse de 2 mol de NaCl.", uncertainties: ["Unité à vérifier"] });
});

it("refuse un compte absent avant tout appel payant", async () => {
  access.allowed = false;
  expect((await POST(request())).status).toBe(401);
  expect(modelFetch).not.toHaveBeenCalled();
});

it("respecte la désactivation de l'IA", async () => {
  vi.stubEnv("DISABLE_AI", "1");
  expect((await POST(request())).status).toBe(503);
  expect(modelFetch).not.toHaveBeenCalled();
});

it("refuse les fichiers invalides et les corps trop lourds avant le modèle", async () => {
  expect((await POST(request({ image: "https://example.com/photo.jpg" }))).status).toBe(400);
  expect((await POST(request({ image: "A".repeat(2_100_000) }))).status).toBe(413);
  expect(modelFetch).not.toHaveBeenCalled();
});

it("demande une meilleure photo quand des données sont illisibles", async () => {
  modelFetch.mockResolvedValue(
    Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({ readable: false, text: "", uncertainties: ["Exposant illisible"] }),
          },
        },
      ],
    }),
  );
  const response = await POST(request());
  expect(response.status).toBe(422);
  expect((await response.json()).error).toContain("photo plus nette");
});
