import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

function request(body: unknown, token?: string): Request {
  return new Request("http://localhost/api/diagnostic", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });
}

describe("diagnostic du contrat Nesalio", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("protège le diagnostic et retourne des erreurs de validation localisées", async () => {
    vi.stubEnv("SELFTEST_TOKEN", "test-nesalio");
    expect((await POST(request({}))).status).toBe(404);
    const invalid = await POST(
      request(
        {
          slices: [
            {
              slice_id: "s_compare",
              introduces: [],
              beats: [
                {
                  id: "intro",
                  say: "Comparons les deux vecteurs.",
                  cues: [],
                  do: [{ id: "focus", verb: "camera.focus", targets: ["unknown"], at: "beat:start" }],
                },
              ],
            },
          ],
        },
        "test-nesalio",
      ),
    );
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toMatchObject({ ok: false, issues: [{ path: ["slices", 0, "beats", 0, "do", 0, "targets", 0] }] });
  });

  it("accepte une tranche de comparaison sans appeler les fournisseurs", async () => {
    vi.stubEnv("SELFTEST_TOKEN", "test-nesalio");
    const response = await POST(
      request(
        {
          slices: [
            {
              slice_id: "s_compare",
              introduces: [
                { id: "v", type: "vector", params: { from: [0, 0], to: [1, 3] } },
                { id: "w", type: "vector", params: { from: [0, 0], to: [2, 2] } },
              ],
              beats: [
                {
                  id: "intro",
                  say: "Comparons les deux vecteurs.",
                  cues: [],
                  do: [{ id: "focus", verb: "camera.focus", targets: ["v", "w"], at: "beat:start" }],
                },
              ],
            },
          ],
        },
        "test-nesalio",
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, slices: 1 });
  });
});
