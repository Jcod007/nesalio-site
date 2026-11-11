import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("lien privé de développement", () => {
  it("refuse un lien invalide et installe un cookie sécurisé pour un lien valide", () => {
    const key = "a".repeat(48);
    vi.stubEnv("NESALIO_DEV_ACCESS_TOKEN", key);
    expect(GET(new NextRequest("https://app.nesalio.com/dev/access?key=wrong")).status).toBe(404);
    const response = GET(new NextRequest(`https://app.nesalio.com/dev/access?key=${key}`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.nesalio.com/dev");
    expect(response.headers.get("set-cookie")).toMatch(/;\s*HttpOnly/i);
    expect(response.headers.get("set-cookie")).toMatch(/;\s*Secure/i);
    expect(response.headers.get("set-cookie")).toMatch(/;\s*SameSite=strict/i);
    expect(response.headers.get("set-cookie")).not.toContain(key);
  });
});
