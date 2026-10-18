import { afterEach, describe, expect, it, vi } from "vitest";
import { REF_HEADER, SESSION_HEADER } from "@/domain/session";
import { POST } from "./route";

const request = (body: unknown, session: string, ref?: string) =>
  new Request("http://localhost/api/apres-essai", {
    method: "POST",
    headers: { "Content-Type": "application/json", [SESSION_HEADER]: session, "x-forwarded-for": "10.2.2.2", ...(ref ? { [REF_HEADER]: ref } : {}) },
    body: JSON.stringify(body),
  });

afterEach(() => vi.unstubAllGlobals());

describe("POST /api/apres-essai", () => {
  it("transmet ce qui a été le plus utile, ce qui a manqué et la référence de l'inscription", async () => {
    const sent: Array<Record<string, string>> = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response("{}", { status: 200 });
    });
    const response = await POST(
      request(
        { helped: "Oui, beaucoup", useful: ["L'explication à voix haute", "Les dessins qui se construisent au tableau"], missing: "Un exercice à la fin" },
        "apres111-1",
        "k3x9a1b2c3d4",
      ),
    );
    expect(response.status).toBe(200);
    expect(sent[0]).toMatchObject({
      etape: "3-apres-essai",
      ref: "k3x9a1b2c3d4",
      plus_utile: "L'explication à voix haute · Les dessins qui se construisent au tableau",
      ce_qui_manque: "Un exercice à la fin",
    });
  });

  it("refuse un choix « plus utile » inconnu", async () => {
    expect((await POST(request({ helped: "Un peu", useful: ["Autre chose"] }, "apres222-1"))).status).toBe(400);
  });
});
