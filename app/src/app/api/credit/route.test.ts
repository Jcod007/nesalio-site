import { beforeEach, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

vi.mock("@/server/account", () => ({ requireAccount: async () => ({ ok: true, userId: "eleve" }) }));
const state = vi.hoisted(() => ({ result: { ok: true, bonusUntil: "2026-12-12T17:00:00.000Z" } as Record<string, unknown> }));
vi.mock("@/server/dailyQuota", () => ({
  exemptFromQuota: () => false,
  dailyQuota: () => ({
    redeem: async () => state.result,
    status: async () => ({ used: 3, limit: 20, remaining: 17, bonusUntil: "2026-12-12T17:00:00.000Z" }),
  }),
}));
beforeEach(() => { state.result = { ok: true, bonusUntil: "2026-12-12T17:00:00.000Z" }; });

const post = (code: string, ip: string) => POST(new Request("http://localhost/api/credit", {
  method: "POST", body: JSON.stringify({ code }), headers: { "x-forwarded-for": ip },
}));

it("donne les questions restantes", async () => {
  const response = await GET(new Request("http://localhost/api/credit"));
  expect(await response.json()).toMatchObject({ available: true, remaining: 17, limit: 20 });
});

it("accepte un code et annonce la date de fin", async () => {
  const response = await post("ABCD-EFGH", "1.1.1.1");
  expect(response.status).toBe(200);
  expect((await response.json()).message).toContain("20 questions par jour jusqu'au 12 décembre");
});

it("dit clairement qu'un code a déjà servi", async () => {
  state.result = { ok: false, reason: "used" };
  const response = await post("ABCD-EFGH", "2.2.2.2");
  expect(response.status).toBe(409);
  expect((await response.json()).error).toBe("Ce code a déjà été utilisé.");
});
