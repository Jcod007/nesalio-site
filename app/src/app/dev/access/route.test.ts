import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

afterEach(() => vi.unstubAllEnvs());

const post = (body: string, contentType = "application/x-www-form-urlencoded") =>
  POST(new Request("https://app.nesalio.com/dev/access", { method: "POST", headers: { "content-type": contentType }, body }));

describe("accès privé de développement", () => {
  const key = "a".repeat(48);

  it("affiche un champ et n'accepte plus le secret dans l'adresse", async () => {
    vi.stubEnv("NESALIO_DEV_ACCESS_TOKEN", key);
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    const page = await response.text();
    expect(page).toContain('method="post"');
    expect(page).toContain('type="password"');
  });

  it("refuse un secret invalide, absent, trop long ou mal envoyé", async () => {
    vi.stubEnv("NESALIO_DEV_ACCESS_TOKEN", key);
    for (const response of [
      await post("key=wrong"),
      await post(""),
      await post(`key=${"a".repeat(3000)}`),
      await post(JSON.stringify({ key }), "application/json"),
    ]) {
      expect(response.status).toBe(404);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    vi.stubEnv("NESALIO_DEV_ACCESS_TOKEN", "");
    expect((await post(`key=${key}`)).status).toBe(404);
  });

  it("installe un cookie sécurisé et daté pour un secret valide", async () => {
    vi.stubEnv("NESALIO_DEV_ACCESS_TOKEN", key);
    const response = await post(`key=${key}`);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.nesalio.com/dev");
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*Secure/i);
    expect(cookie).toMatch(/;\s*SameSite=strict/i);
    expect(cookie).toMatch(/;\s*Max-Age=604800/i);
    expect(cookie).not.toContain(key);
  });
});
