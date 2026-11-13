import { describe, expect, it } from "vitest";
import { BONUS_LIMIT, CODE_OWNER_DAYS, createDailyQuota, DAILY_LIMIT, hashCode, quotaDay, type QuotaStore, validCodeHashes } from "./dailyQuota";

function memoryStore(): QuotaStore {
  const data = new Map<string, string>();
  return {
    get: async (key) => data.get(key) ?? null,
    incr: async (key) => {
      const n = Number(data.get(key) ?? 0) + 1;
      data.set(key, String(n));
      return n;
    },
    decr: async (key) => {
      data.set(key, String(Number(data.get(key) ?? 0) - 1));
    },
    setOnce: async (key, value) => {
      if (data.has(key)) return false;
      data.set(key, value);
      return true;
    },
    set: async (key, value) => {
      data.set(key, value);
    },
  };
}

const CODES = ["ATEL-IER1", "ATEL-IER2"];
const quota = () => createDailyQuota(memoryStore(), { codeHashes: () => new Set(CODES.map(hashCode)) });
const NOON = new Date("2026-11-12T17:00:00Z");

describe("limite journalière", () => {
  it("accepte 10 questions puis refuse la 11e sans la compter", async () => {
    const q = quota();
    for (let i = 0; i < DAILY_LIMIT; i++) expect((await q.consume("a", NOON)).allowed).toBe(true);
    expect(await q.consume("a", NOON)).toEqual({ allowed: false, limit: DAILY_LIMIT, remaining: 0 });
    expect((await q.status("a", NOON)).used).toBe(DAILY_LIMIT);
    expect((await q.consume("b", NOON)).allowed).toBe(true);
  });

  it("repart à zéro à minuit, heure de Montréal", async () => {
    const q = quota();
    for (let i = 0; i < DAILY_LIMIT; i++) await q.consume("a", NOON);
    // 04:30 UTC le 13 = 23:30 à Montréal le 12 : encore le même jour.
    expect((await q.consume("a", new Date("2026-11-13T04:30:00Z"))).allowed).toBe(false);
    expect((await q.consume("a", new Date("2026-11-13T05:30:00Z"))).allowed).toBe(true);
    expect(quotaDay(new Date("2026-11-13T04:30:00Z"))).toBe("2026-11-12");
  });
});

describe("codes crédit", () => {
  it("un code passe le compte à 20 questions par jour pendant 30 jours", async () => {
    const q = quota();
    const result = await q.redeem("a", "atel ier1", NOON);
    expect(result.ok).toBe(true);
    for (let i = 0; i < BONUS_LIMIT; i++) expect((await q.consume("a", NOON)).allowed).toBe(true);
    expect((await q.consume("a", NOON)).allowed).toBe(false);
    const later = new Date(NOON.getTime() + 31 * 24 * 3600 * 1000);
    expect((await q.status("a", later)).limit).toBe(DAILY_LIMIT);
  });

  it("un code ne sert qu'une seule fois, même pour un autre compte", async () => {
    const q = quota();
    expect((await q.redeem("a", "ATEL-IER1", NOON)).ok).toBe(true);
    expect(await q.redeem("b", "ATELIER1", NOON)).toEqual({ ok: false, reason: "used" });
  });

  it("deux validations simultanées du même code : une seule réussit", async () => {
    const q = quota();
    const results = await Promise.all([q.redeem("a", "ATEL-IER2", NOON), q.redeem("b", "ATEL-IER2", NOON)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("refuse un code inconnu et ne brûle pas un 2e code sur un compte déjà crédité", async () => {
    const q = quota();
    expect(await q.redeem("a", "NIMPORTE", NOON)).toEqual({ ok: false, reason: "invalid" });
    await q.redeem("a", "ATEL-IER1", NOON);
    expect((await q.redeem("a", "ATEL-IER2", NOON)).ok).toBe(false);
    expect((await q.redeem("b", "ATEL-IER2", NOON)).ok).toBe(true);
  });

  it("une panne après la réservation ne perd pas le code : le même compte réessaie, un autre non", async () => {
    const store = memoryStore();
    const set = store.set;
    store.set = async () => {
      throw new Error("Redis indisponible");
    };
    const q = createDailyQuota(store, { codeHashes: () => new Set(CODES.map(hashCode)) });
    await expect(q.redeem("a", "ATEL-IER1", NOON)).rejects.toThrow();
    store.set = set;
    expect(await q.redeem("b", "ATEL-IER1", NOON)).toEqual({ ok: false, reason: "used" });
    const hourLater = new Date(NOON.getTime() + 3600 * 1000);
    const again = await q.redeem("a", "ATEL-IER1", hourLater);
    // Les 30 jours partent de la première tentative.
    expect(again).toEqual({ ok: true, bonusUntil: new Date(NOON.getTime() + 30 * 24 * 3600 * 1000).toISOString() });
    expect((await q.status("a", hourLater)).limit).toBe(BONUS_LIMIT);
  });

  it("oublie après 12 mois quel compte a utilisé un code, sans le rendre réutilisable", async () => {
    const store = memoryStore();
    const lifetimes = new Map<string, number | undefined>();
    const setOnce = store.setOnce;
    store.setOnce = async (key, value, ttl) => {
      const written = await setOnce(key, value, ttl);
      if (written) lifetimes.set(key, ttl);
      return written;
    };
    const q = createDailyQuota(store, { codeHashes: () => new Set(CODES.map(hashCode)) });
    expect((await q.redeem("compte-a", "ATEL-IER1", NOON)).ok).toBe(true);

    const permanent = [...lifetimes].filter(([, ttl]) => ttl === undefined).map(([key]) => key);
    const temporary = [...lifetimes].filter(([, ttl]) => ttl !== undefined);
    expect(permanent).toHaveLength(1);
    expect(await store.get(permanent[0]!)).toBe(NOON.toISOString());
    expect(temporary.map(([, ttl]) => ttl)).toEqual([CODE_OWNER_DAYS * 24 * 3600]);

    // Redis a effacé la clé à durée de vie : il ne reste que la date d'utilisation.
    const get = store.get;
    store.get = async (key) => (temporary.some(([expired]) => expired === key) ? null : get(key));
    const nextYear = new Date(NOON.getTime() + (CODE_OWNER_DAYS + 1) * 24 * 3600 * 1000);
    expect(await q.redeem("compte-b", "ATEL-IER1", nextYear)).toEqual({ ok: false, reason: "used" });
  });

  it("respecte les réservations écrites avant le découpage (compte et date dans la même clé)", async () => {
    const store = memoryStore();
    await store.setOnce(`nesalio:quota:code:${hashCode("ATEL-IER1")}`, `a ${NOON.toISOString()}`);
    const q = createDailyQuota(store, { codeHashes: () => new Set(CODES.map(hashCode)) });
    const hourLater = new Date(NOON.getTime() + 3600 * 1000);
    expect(await q.redeem("b", "ATEL-IER1", hourLater)).toEqual({ ok: false, reason: "used" });
    expect(await q.redeem("a", "ATEL-IER1", hourLater)).toEqual({ ok: true, bonusUntil: new Date(NOON.getTime() + 30 * 24 * 3600 * 1000).toISOString() });
  });

  it("lit les empreintes de l'environnement et ignore le reste", () => {
    const h = hashCode("X");
    expect(validCodeHashes(`${h}, pas-une-empreinte ,`)).toEqual(new Set([h]));
  });
});
