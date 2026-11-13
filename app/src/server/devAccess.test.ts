import { describe, expect, it } from "vitest";
import { DEV_COOKIE_DAYS, devCookieValue, validDevCookie, validDevKey } from "./devAccess";

describe("accès privé de développement", () => {
  const env = { NODE_ENV: "test", NESALIO_DEV_ACCESS_TOKEN: "x".repeat(48) } as NodeJS.ProcessEnv;
  const NOW = 1_800_000_000_000;
  const DAY = 24 * 60 * 60 * 1000;
  it("exige un secret configuré suffisamment long", () => {
    expect(validDevKey("x".repeat(48), env)).toBe(true);
    expect(validDevKey("incorrect", env)).toBe(false);
    expect(validDevKey("short", { NODE_ENV: "test", NESALIO_DEV_ACCESS_TOKEN: "short" })).toBe(false);
    expect(validDevCookie("nesalio_dev=anything", { NODE_ENV: "test" })).toBe(false);
  });
  it("valide le cookie et le révoque quand le secret change", () => {
    const cookie = `nesalio_dev=${devCookieValue(env, NOW)}`;
    expect(validDevCookie(cookie, env, NOW)).toBe(true);
    expect(validDevCookie(cookie, { ...env, NESALIO_DEV_ACCESS_TOKEN: "y".repeat(48) }, NOW)).toBe(false);
    expect(validDevCookie("nesalio_dev=wrong", env, NOW)).toBe(false);
  });
  it("refuse le cookie après sa date de fin, et une date de fin repoussée à la main", () => {
    const value = devCookieValue(env, NOW)!;
    expect(validDevCookie(`nesalio_dev=${value}`, env, NOW + DEV_COOKIE_DAYS * DAY - 1)).toBe(true);
    expect(validDevCookie(`nesalio_dev=${value}`, env, NOW + DEV_COOKIE_DAYS * DAY)).toBe(false);
    const [version, expires, signature] = value.split(".");
    expect(validDevCookie(`nesalio_dev=${version}.${Number(expires) + 365 * DAY}.${signature}`, env, NOW)).toBe(false);
  });
  it("ne contient pas le secret", () => {
    expect(devCookieValue(env, NOW)).not.toContain("x".repeat(8));
  });
});
