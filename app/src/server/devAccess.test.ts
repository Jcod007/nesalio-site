import { describe, expect, it } from "vitest";
import { devCookieValue, validDevCookie, validDevKey } from "./devAccess";

describe("accès privé de développement", () => {
  const env = { NODE_ENV: "test", NESALIO_DEV_ACCESS_TOKEN: "x".repeat(48) } as NodeJS.ProcessEnv;
  it("exige un secret configuré suffisamment long", () => {
    expect(validDevKey("x".repeat(48), env)).toBe(true);
    expect(validDevKey("incorrect", env)).toBe(false);
    expect(validDevKey("short", { NODE_ENV: "test", NESALIO_DEV_ACCESS_TOKEN: "short" })).toBe(false);
    expect(validDevCookie("nesalio_dev=anything", { NODE_ENV: "test" })).toBe(false);
  });
  it("valide le cookie et le révoque quand le secret change", () => {
    const cookie = `nesalio_dev=${devCookieValue(env)}`;
    expect(validDevCookie(cookie, env)).toBe(true);
    expect(validDevCookie(cookie, { ...env, NESALIO_DEV_ACCESS_TOKEN: "y".repeat(48) })).toBe(false);
    expect(validDevCookie("nesalio_dev=wrong", env)).toBe(false);
  });
});
