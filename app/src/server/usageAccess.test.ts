import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { session, reserve, generate } = vi.hoisted(() => ({ session: vi.fn(), reserve: vi.fn(), generate: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: session }));
vi.mock("@/server/trial", () => ({ authorizeTrial: reserve }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/server/config", () => ({ readAiConfig: () => ({ chat: null }) }));
vi.mock("@/server/sessionStore", () => ({ recordEnv: () => "development", saveTurn: vi.fn() }));
vi.mock("@/server/tutor/service", () => ({ tutorEvents: generate }));

import { POST } from "@/app/api/tutor/route";

function request(body = JSON.stringify({ mode: "question", question: "Les zéros d'une parabole" }), origin = "https://app.nesalio.com") {
  return new Request("https://app.nesalio.com/api/tutor", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json", "x-nesalio-session": crypto.randomUUID() },
    body,
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_placeholder");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_placeholder");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.nesalio.com");
  vi.stubEnv("TRIAL_COOKIE_SECRET", "trial-test-secret-with-at-least-thirty-two-characters");
  vi.stubEnv("NESALIO_LOCAL_DEMO", "0");
  session.mockReset().mockResolvedValue({ userId: null });
  reserve.mockReset();
  generate.mockReset().mockImplementation(async function* () {
    yield { kind: "source", source: "demo" };
    yield { kind: "end", summary: [] };
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("guest trial at the tutor API boundary", () => {
  it("allows three reserved replies and rejects the fourth before generation, retaining cookie and quota headers", async () => {
    let count = 0;
    reserve.mockImplementation(async () => {
      count++;
      if (count > 3)
        return {
          ok: false,
          response: Response.json(
            { error: "Crée ton compte pour continuer." },
            {
              status: 401,
              headers: { "X-Nesalio-Account-Required": "1", "Cache-Control": "no-store" },
            },
          ),
        };
      return {
        ok: true,
        guestId: "guest",
        remaining: 3 - count,
        headers: new Headers({ "Set-Cookie": "trial=signed; HttpOnly; Secure; SameSite=Lax; Path=/" }),
      };
    });
    for (let index = 0; index < 3; index++) {
      const response = await POST(request());
      expect(response.status).toBe(200);
      expect(response.headers.get("x-nesalio-trial-remaining")).toBe(String(2 - index));
      expect(response.headers.get("set-cookie")).toContain("HttpOnly");
      expect(response.headers.get("vary")).toContain("Cookie");
      await response.text();
    }
    const fourth = await POST(request());
    expect(fourth.status).toBe(401);
    expect(fourth.headers.get("x-nesalio-account-required")).toBe("1");
    expect(fourth.headers.get("content-type")).toContain("application/x-ndjson");
    expect(JSON.parse((await fourth.text()).trim())).toMatchObject({ kind: "error", message: "Crée ton compte pour continuer." });
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it("does not spend a trial reply on malformed input or a rejected origin", async () => {
    expect((await POST(request("{"))).status).toBe(400);
    const foreign = request("{}", "https://foreign.example");
    expect((await POST(foreign)).status).toBe(403);
    expect(foreign.bodyUsed).toBe(false);
    expect(reserve).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("never treats an auth outage as guest access", async () => {
    session.mockRejectedValue(new Error("authentication unavailable"));
    const input = request();
    expect((await POST(input)).status).toBe(503);
    expect(input.bodyUsed).toBe(false);
    expect(reserve).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("allows a verified account to continue without consulting guest counters", async () => {
    session.mockResolvedValue({ userId: "verified-user" });
    const response = await POST(request());
    expect(response.status).toBe(200);
    await response.text();
    expect(reserve).not.toHaveBeenCalled();
    expect(generate).toHaveBeenCalledOnce();
  });

  it("refuses generation during a trial-store outage", async () => {
    reserve.mockResolvedValue({ ok: false, response: Response.json({ error: "Essai indisponible." }, { status: 503 }) });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(generate).not.toHaveBeenCalled();
  });
});
