import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { session } = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: session }));

import { requireAccount } from "./account";
import { accountOrigins, localAccountDemo } from "./authConfig";
import { devCookieValue } from "./devAccess";
import { createSessionLimits } from "./rateLimit";

const request = (headers: Record<string, string> = {}) =>
  new Request("https://app.nesalio.com/api/tutor", {
    method: "POST",
    headers: { origin: "https://app.nesalio.com", ...headers },
    body: "{}",
  });

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_placeholder");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_placeholder");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.nesalio.com");
  vi.stubEnv("NESALIO_LOCAL_DEMO", "0");
  session.mockReset();
  session.mockResolvedValue({ userId: "user_alice" });
});
afterEach(() => vi.unstubAllEnvs());

describe("API account boundary", () => {
  it("refuses anonymous requests before consuming the body, including forged identity headers", async () => {
    session.mockResolvedValue({ userId: null });
    const input = request({ "x-nesalio-account": "user_alice", "x-nesalio-session": crypto.randomUUID() });
    const result = await requireAccount(input, true);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Anonymous access allowed");
    expect(result.response.status).toBe(401);
    expect(result.response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(result.response.headers.get("cache-control")).toBe("no-store");
    expect(input.bodyUsed).toBe(false);
  });

  it("denies cross-origin and cross-site requests before consulting authentication", async () => {
    const cases: Record<string, string>[] = [{ origin: "https://untrusted.example" }, { origin: "null" }, { "sec-fetch-site": "cross-site" }];
    for (const headers of cases) {
      const result = await requireAccount(request(headers));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(403);
    }
    expect(session).not.toHaveBeenCalled();
  });

  it("fails closed if keys are missing or authentication is unavailable", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "");
    const missing = await requireAccount(request());
    if (missing.ok) throw new Error("Unconfigured access allowed");
    expect(missing.response.status).toBe(503);
    expect(session).not.toHaveBeenCalled();
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_placeholder");
    session.mockRejectedValue(new Error("provider unavailable with sensitive details"));
    const failed = await requireAccount(request());
    if (failed.ok) throw new Error("Failed authentication allowed");
    expect(failed.response.status).toBe(503);
    expect(await failed.response.text()).not.toContain("sensitive details");
  });

  it("uses the verified session identity, accepting only session tokens", async () => {
    expect(await requireAccount(request())).toEqual({ ok: true, userId: "user_alice" });
    expect(session).toHaveBeenCalledWith({ acceptsToken: "session_token" });
  });

  it("does not reset an account quota when the client changes its navigation ID", () => {
    const limits = createSessionLimits({ name: "test", limit: 1, windowMs: 60_000 });
    expect(limits.check(new Headers({ "x-nesalio-session": "session-one" }), 10, "user_alice").allowed).toBe(true);
    expect(limits.check(new Headers({ "x-nesalio-session": "session-two" }), 11, "user_alice").allowed).toBe(false);
    expect(limits.check(new Headers({ "x-nesalio-session": "session-two" }), 12, "user_bob").allowed).toBe(true);
  });

  it("cannot enable local bypass on Vercel, in production, or with live AI", () => {
    const demo = { NESALIO_LOCAL_DEMO: "1", DISABLE_AI: "1", NODE_ENV: "development" } as NodeJS.ProcessEnv;
    expect(localAccountDemo(demo)).toBe(true);
    expect(localAccountDemo({ ...demo, VERCEL: "1" })).toBe(false);
    expect(localAccountDemo({ ...demo, NODE_ENV: "production" })).toBe(false);
    expect(localAccountDemo({ ...demo, DISABLE_AI: "0" })).toBe(false);
  });

  it("permet l'accès de développement avec le cookie privé uniquement", async () => {
    vi.stubEnv("NESALIO_DEV_ACCESS_TOKEN", "a".repeat(48));
    expect(await requireAccount(request({ cookie: `nesalio_dev=${devCookieValue()}` }))).toEqual({ ok: true, userId: "development-guest" });
    expect(session).not.toHaveBeenCalled();
    session.mockResolvedValue({ userId: null });
    expect((await requireAccount(request({ cookie: "nesalio_dev=invalid" }))).ok).toBe(false);
  });

  it("does not trust wildcard or malformed origin settings", () => {
    expect(
      accountOrigins({ NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "https://*.vercel.app", VERCEL_URL: "preview.vercel.app" } as NodeJS.ProcessEnv),
    ).toEqual(["https://preview.vercel.app"]);
    expect(accountOrigins({ NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "not a URL" } as NodeJS.ProcessEnv)).toEqual([]);
  });
});
