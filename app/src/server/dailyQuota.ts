/**
 * Limite journalière de questions par compte, et codes crédit à usage unique.
 *
 * - 10 questions par jour et par compte (jour de Montréal, remis à zéro à minuit).
 * - Un code crédit fait passer le compte à 20 questions par jour pendant 30 jours.
 * - Chaque code ne sert qu'une seule fois, tous comptes confondus : la réservation
 *   passe par `SET … NX` dans Redis, atomique même si deux élèves valident le même
 *   code à la même seconde.
 *
 * Les codes eux-mêmes ne sont jamais stockés : seule leur empreinte SHA-256 est
 * listée dans `NESALIO_CODES_CREDIT` (voir tools/codes-credit.mjs).
 *
 * La lecture de photo et la transcription ont chacune leur plafond journalier
 * (`EXTRA_DAILY_LIMITS`), pour qu'un compte ne dépense pas sans fin hors questions.
 *
 * Sans Redis configuré (développement local), aucune limite journalière n'est
 * appliquée et les codes sont indisponibles ; la limite courte par session
 * (rateLimit.ts) reste en place.
 */
import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";

export const DAILY_LIMIT = 10;
export const BONUS_LIMIT = 20;
export const BONUS_DAYS = 30;
/** Plafonds journaliers des appels payants hors questions (par compte, même jour de Montréal). */
export const EXTRA_DAILY_LIMITS = { photo: 20, transcribe: 40 } as const;
export type ExtraUsage = keyof typeof EXTRA_DAILY_LIMITS;
const TIME_ZONE = "America/Toronto";
const PREFIX = "nesalio:quota";

/** Ce dont le quota a besoin d'un magasin clé-valeur partagé (Redis en production, Map en test). */
export interface QuotaStore {
  get(key: string): Promise<string | null>;
  /** Incrémente et pose la durée de vie ; renvoie la nouvelle valeur. */
  incr(key: string, ttlSeconds: number): Promise<number>;
  decr(key: string): Promise<void>;
  /** Pose la valeur seulement si la clé n'existe pas ; vrai si posée. */
  setOnce(key: string, value: string): Promise<boolean>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export interface QuotaStatus {
  used: number;
  limit: number;
  remaining: number;
  /** Fin du bonus de code crédit (ISO), ou null. */
  bonusUntil: string | null;
}

export type RedeemResult = { ok: true; bonusUntil: string } | { ok: false; reason: "invalid" | "used" | "already_active"; bonusUntil?: string };

/** Majuscules, sans espaces ni tirets : « abcd-efgh » et « ABCDEFGH » sont le même code. */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, "");
}

export function hashCode(code: string): string {
  return createHash("sha256").update(normalizeCode(code)).digest("hex");
}

/** Empreintes valides, lues dans NESALIO_CODES_CREDIT (séparées par virgules ou espaces). */
export function validCodeHashes(raw = process.env.NESALIO_CODES_CREDIT): Set<string> {
  return new Set(
    (raw ?? "")
      .split(/[\s,]+/)
      .map((h) => h.trim().toLowerCase())
      .filter((h) => /^[0-9a-f]{64}$/.test(h)),
  );
}

/** Date du jour à Montréal, AAAA-MM-JJ. */
export function quotaDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function createDailyQuota(store: QuotaStore, options: { codeHashes?: () => Set<string> } = {}) {
  const codeHashes = options.codeHashes ?? (() => validCodeHashes());
  const countKey = (user: string, now: Date) => `${PREFIX}:count:${user}:${quotaDay(now)}`;
  const bonusKey = (user: string) => `${PREFIX}:bonus:${user}`;

  async function bonusUntil(user: string, now: Date): Promise<string | null> {
    const value = await store.get(bonusKey(user));
    return value && Date.parse(value) > now.getTime() ? value : null;
  }

  return {
    async status(user: string, now = new Date()): Promise<QuotaStatus> {
      const [raw, bonus] = await Promise.all([store.get(countKey(user, now)), bonusUntil(user, now)]);
      const limit = bonus ? BONUS_LIMIT : DAILY_LIMIT;
      const used = Math.min(Number(raw) || 0, limit);
      return { used, limit, remaining: limit - used, bonusUntil: bonus };
    },

    /** Compte une question ; refuse (sans la compter) si la limite du jour est atteinte. */
    async consume(user: string, now = new Date()): Promise<{ allowed: boolean; limit: number; remaining: number }> {
      const bonus = await bonusUntil(user, now);
      const limit = bonus ? BONUS_LIMIT : DAILY_LIMIT;
      const key = countKey(user, now);
      const count = await store.incr(key, 2 * 24 * 3600);
      if (count > limit) {
        await store.decr(key);
        return { allowed: false, limit, remaining: 0 };
      }
      return { allowed: true, limit, remaining: limit - count };
    },

    /** Compte une photo lue ou une transcription ; refuse (sans la compter) au-delà du plafond du jour. */
    async consumeExtra(user: string, usage: ExtraUsage, now = new Date()): Promise<{ allowed: boolean; limit: number }> {
      const limit = EXTRA_DAILY_LIMITS[usage];
      const key = `${PREFIX}:${usage}:${user}:${quotaDay(now)}`;
      const count = await store.incr(key, 2 * 24 * 3600);
      if (count > limit) {
        await store.decr(key);
        return { allowed: false, limit };
      }
      return { allowed: true, limit };
    },

    async redeem(user: string, code: string, now = new Date()): Promise<RedeemResult> {
      const hash = hashCode(code);
      if (!normalizeCode(code) || !codeHashes().has(hash)) return { ok: false, reason: "invalid" };
      // Un compte déjà crédité ne brûle pas un second code.
      const active = await bonusUntil(user, now);
      if (active) return { ok: false, reason: "already_active", bonusUntil: active };
      const codeKey = `${PREFIX}:code:${hash}`;
      let reservedAt = now;
      if (!(await store.setOnce(codeKey, `${user} ${now.toISOString()}`))) {
        // Réservé par ce même compte sans que le bonus ait été écrit (panne entre les deux écritures) :
        // l'élève qui réessaie reprend là où ça s'est arrêté, le code n'est pas perdu.
        const [owner, at] = ((await store.get(codeKey)) ?? "").split(" ");
        const time = Date.parse(at ?? "");
        if (owner !== user || Number.isNaN(time)) return { ok: false, reason: "used" };
        reservedAt = new Date(time);
      }
      const end = reservedAt.getTime() + BONUS_DAYS * 24 * 3600 * 1000;
      const ttl = Math.floor((end - now.getTime()) / 1000);
      if (ttl <= 0) return { ok: false, reason: "used" };
      const until = new Date(end).toISOString();
      await store.set(bonusKey(user), until, ttl);
      return { ok: true, bonusUntil: until };
    },
  };
}
export type DailyQuota = ReturnType<typeof createDailyQuota>;

/** Adresse et jeton du Redis (Upstash via le Marketplace Vercel), ou null s'il n'est pas configuré. */
export function redisEnv(env: NodeJS.ProcessEnv = process.env): { url: string; token: string } | null {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

/** Magasin Redis du quota, ou null s'il n'est pas configuré. */
export function redisQuotaStore(env: NodeJS.ProcessEnv = process.env): QuotaStore | null {
  const credentials = redisEnv(env);
  if (!credentials) return null;
  const redis = new Redis({ ...credentials, automaticDeserialization: false });
  return {
    get: async (key) => {
      const value = await redis.get<string>(key);
      return value === null || value === undefined ? null : String(value);
    },
    incr: async (key, ttl) => {
      const [count] = await redis.pipeline().incr(key).expire(key, ttl).exec<[number, number]>();
      return Number(count);
    },
    decr: async (key) => {
      await redis.decr(key);
    },
    setOnce: async (key, value) => (await redis.set(key, value, { nx: true })) === "OK",
    set: async (key, value, ttl) => {
      await redis.set(key, value, { ex: ttl });
    },
  };
}

let shared: DailyQuota | null | undefined;
/** Quota partagé par les routes, ou null sans Redis. */
export function dailyQuota(): DailyQuota | null {
  if (shared === undefined) {
    const store = redisQuotaStore();
    shared = store ? createDailyQuota(store) : null;
    if (!shared) console.warn("Limite journalière désactivée : Redis (UPSTASH_REDIS_REST_URL / KV_REST_API_URL) non configuré.");
  }
  return shared;
}

/**
 * Vrai si le compte a atteint son plafond du jour pour cet usage. Redis absent ou illisible :
 * la demande passe, la limite courte (rateLimit.ts) reste en place.
 */
export async function extraLimitReached(userId: string, usage: ExtraUsage): Promise<boolean> {
  const quota = exemptFromQuota(userId) ? null : dailyQuota();
  if (!quota) return false;
  try {
    return !(await quota.consumeExtra(userId, usage)).allowed;
  } catch (error) {
    console.warn(`Plafond journalier (${usage}) illisible, demande acceptée.`, error);
    return false;
  }
}

/** Identités qui ne sont pas des élèves : jamais limitées par jour. */
export function exemptFromQuota(userId: string): boolean {
  return userId === "development-guest" || userId === "local-demo";
}
