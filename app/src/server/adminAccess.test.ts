import { describe, expect, it } from "vitest";
import { hasCronAccess, hasSelfTestAccess } from "./adminAccess";

describe("administrative access", () => {
  const env = { NODE_ENV: "test", SELFTEST_TOKEN: "a-private-test-token" } as NodeJS.ProcessEnv;
  it("rejects URL secrets, missing configuration and incorrect bearer credentials", () => {
    expect(hasSelfTestAccess(new Request("https://app.nesalio.com/api/seances?check=a-private-test-token"), env)).toBe(false);
    expect(hasSelfTestAccess(new Request("https://app.nesalio.com/api/seances"), env)).toBe(false);
    expect(hasSelfTestAccess(new Request("https://app.nesalio.com/api/seances", { headers: { authorization: "Bearer wrong" } }), env)).toBe(false);
    expect(
      hasSelfTestAccess(
        new Request("https://app.nesalio.com/api/seances", { headers: { authorization: "Bearer a-private-test-token" } }),
        {} as NodeJS.ProcessEnv,
      ),
    ).toBe(false);
  });
  it("accepts the correct credential in the Authorization header", () => {
    expect(hasSelfTestAccess(new Request("https://app.nesalio.com/api/seances", { headers: { authorization: "Bearer a-private-test-token" } }), env)).toBe(
      true,
    );
  });
  it("accepts the scheduled task only with its own secret", () => {
    const cron = { NODE_ENV: "test", CRON_SECRET: "a-private-cron-secret", SELFTEST_TOKEN: "a-private-test-token" } as NodeJS.ProcessEnv;
    const call = (authorization?: string) => new Request("https://app.nesalio.com/api/seances/purge", authorization ? { headers: { authorization } } : {});
    expect(hasCronAccess(call("Bearer a-private-cron-secret"), cron)).toBe(true);
    expect(hasCronAccess(call("Bearer a-private-test-token"), cron)).toBe(false);
    expect(hasCronAccess(call(), cron)).toBe(false);
    expect(hasCronAccess(call("Bearer "), { NODE_ENV: "test" } as NodeJS.ProcessEnv)).toBe(false);
  });
});
