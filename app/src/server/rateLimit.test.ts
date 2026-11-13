import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSION_HEADER } from "@/domain/session";
import { createSessionLimits, type SharedLimiterFactory } from "./rateLimit";

const headers = (ip: string, session?: string) => new Headers({ "x-forwarded-for": ip, ...(session ? { [SESSION_HEADER]: session } : {}) });

afterEach(() => vi.unstubAllEnvs());

describe("limites par session", () => {
  it("réserve l'accès de développement illimité au projet et aux routes configurés", () => {
    const limits = createSessionLimits({ name: "test", limit: 1, windowMs: 60_000, ipFactor: 1, developerAccess: true });
    const h = headers("10.0.0.1", "aaaaaaaa-1111");
    for (let i = 0; i < 10; i++) expect(limits.check(h, i, "development-guest")).toMatchObject({ allowed: true, session: "aaaaaaaa-1111" });
    expect(limits.check(h, 20, "user_other").allowed).toBe(true);
    expect(limits.check(h, 21, "user_other").allowed).toBe(false);
    const ordinary = createSessionLimits({ name: "test", limit: 1, windowMs: 60_000 });
    expect(ordinary.check(h, 0, "development-guest").allowed).toBe(true);
    expect(ordinary.check(h, 1, "development-guest").allowed).toBe(false);
    const production = createSessionLimits({ name: "test", limit: 1, windowMs: 60_000, developerAccess: true });
    expect(production.check(h, 0, "user_other").allowed).toBe(true);
    expect(production.check(h, 1, "user_other").allowed).toBe(false);
  });
  it("deux élèves sur le même Wi-Fi ont chacun leur limite", () => {
    const limits = createSessionLimits({ name: "test", limit: 2, windowMs: 60_000 });
    const a = headers("10.0.0.1", "aaaaaaaa-1111");
    const b = headers("10.0.0.1", "bbbbbbbb-2222");
    expect(limits.check(a, 0).allowed).toBe(true);
    expect(limits.check(a, 1).allowed).toBe(true);
    expect(limits.check(a, 2).allowed).toBe(false);
    // A a épuisé sa limite : B, sur la même adresse, n'est pas touché.
    expect(limits.check(b, 3).allowed).toBe(true);
    expect(limits.check(b, 3).session).toBe("bbbbbbbb-2222");
  });

  it("plafonne une adresse qui changerait de session à chaque requête", () => {
    const limits = createSessionLimits({ name: "test", limit: 1, windowMs: 60_000, ipFactor: 3 });
    const results = Array.from({ length: 5 }, (_, i) => limits.check(headers("10.0.0.9", `session-${i}-xyz`), i).allowed);
    expect(results).toEqual([true, true, true, false, false]);
  });

  it("sans session (ou session mal formée), la limite se compte par adresse", () => {
    const limits = createSessionLimits({ name: "test", limit: 1, windowMs: 60_000 });
    expect(limits.check(headers("10.0.0.5", "x"), 0).session).toBeNull();
    expect(limits.check(headers("10.0.0.5"), 1).allowed).toBe(false);
  });
});

describe("limite partagée entre les instances", () => {
  /** Faux Redis : un compteur par nom, partagé par toutes les « instances » qui reçoivent cette fabrique. */
  function sharedStore(behaviour: "ok" | "timeout" | "down" = "ok") {
    const counts = new Map<string, number>();
    const keys: string[] = [];
    const factory: SharedLimiterFactory = (name, limit) => ({
      async limit(key) {
        if (behaviour === "down") throw new Error("ECONNREFUSED");
        if (behaviour === "timeout") return { success: true, reset: 0, reason: "timeout" };
        keys.push(key);
        const count = (counts.get(`${name}:${key}`) ?? 0) + 1;
        counts.set(`${name}:${key}`, count);
        return { success: count <= limit, reset: Date.now() + 30_000 };
      },
    });
    return { factory, keys };
  }

  it("deux instances comptent ensemble le même élève", async () => {
    const { factory } = sharedStore();
    const one = createSessionLimits({ name: "test", limit: 2, windowMs: 60_000, shared: factory });
    const two = createSessionLimits({ name: "test", limit: 2, windowMs: 60_000, shared: factory });
    const h = headers("10.0.0.1", "aaaaaaaa-1111");
    expect((await one.limit(h, "user_a")).allowed).toBe(true);
    expect((await two.limit(h, "user_a")).allowed).toBe(true);
    const refused = await one.limit(h, "user_a");
    expect(refused).toMatchObject({ allowed: false, session: "aaaaaaaa-1111" });
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    expect((await two.limit(h, "user_b")).allowed).toBe(true);
  });

  it("n'écrit ni l'adresse ni le compte en clair dans le magasin partagé", async () => {
    const { factory, keys } = sharedStore();
    await createSessionLimits({ name: "test", limit: 2, windowMs: 60_000, shared: factory }).limit(headers("10.0.0.1"), "user_alice");
    expect(keys).toHaveLength(2);
    for (const key of keys) expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it.each(["down", "timeout"] as const)("magasin partagé %s : la mémoire de l'instance limite quand même", async (behaviour) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const limits = createSessionLimits({ name: "test", limit: 1, windowMs: 60_000, shared: sharedStore(behaviour).factory });
    const h = headers("10.0.0.1");
    expect((await limits.limit(h, "user_a")).allowed).toBe(true);
    expect((await limits.limit(h, "user_a")).allowed).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("sans magasin partagé, limit() applique la limite en mémoire", async () => {
    const limits = createSessionLimits({ name: "test", limit: 1, windowMs: 60_000, shared: () => null });
    const h = headers("10.0.0.1");
    expect((await limits.limit(h, "user_a")).allowed).toBe(true);
    expect((await limits.limit(h, "user_a")).allowed).toBe(false);
  });

  it("l'accès de développement ne touche pas le magasin partagé", async () => {
    const { factory, keys } = sharedStore();
    const limits = createSessionLimits({ name: "test", limit: 1, windowMs: 60_000, developerAccess: true, shared: factory });
    for (let i = 0; i < 5; i++) expect((await limits.limit(headers("10.0.0.1"), "development-guest")).allowed).toBe(true);
    expect(keys).toHaveLength(0);
  });
});
