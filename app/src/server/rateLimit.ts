import { createHash } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { isSessionId, SESSION_HEADER } from "@/domain/session";
import { redisEnv } from "./dailyQuota";

/**
 * Limite d'usage par session de navigation, avec un plafond plus large par
 * adresse IP (fenêtre glissante, en mémoire).
 *
 * Par session : plusieurs personnes derrière la même adresse (une classe sur
 * le Wi-Fi de l'école) ont chacune leur propre limite. Le plafond par adresse
 * empêche de contourner la limite en changeant de session à chaque requête.
 *
 * En production, `limit()` compte dans Redis (@upstash/ratelimit, le même Redis
 * que le quota journalier) : toutes les instances serverless partagent le même
 * compteur. Sans Redis, ou s'il ne répond pas, `limit()` se replie sur le
 * compteur en mémoire de l'instance (`check()`) : approximatif, mais jamais ouvert.
 */
export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string, now?: number): RateLimitResult;
}

export function createRateLimiter(options: { limit: number; windowMs: number; maxKeys?: number }): RateLimiter {
  const hits = new Map<string, number[]>();
  const maxKeys = options.maxKeys ?? 10_000;

  return {
    check(key, now = Date.now()) {
      const since = now - options.windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > since);
      if (recent.length >= options.limit) {
        hits.set(key, recent);
        const retryAfterSeconds = Math.ceil((recent[0]! + options.windowMs - now) / 1000);
        return { allowed: false, retryAfterSeconds };
      }
      recent.push(now);
      hits.delete(key); // réinsertion : la Map garde les clés les plus récentes à la fin
      hits.set(key, recent);
      if (hits.size > maxKeys) hits.delete(hits.keys().next().value!);
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

/** Adresse du client derrière le proxy de Vercel. */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "anonyme";
}

/** Clés d'une requête : la session si le navigateur l'envoie (sinon l'adresse), et l'adresse. */
export function requestKeys(headers: Headers, accountId?: string): { user: string; ip: string; session: string | null } {
  const ip = clientKey(headers);
  const raw = headers.get(SESSION_HEADER);
  const session = isSessionId(raw) ? raw : null;
  return { user: accountId ? `u:${accountId}` : session ? `s:${session}` : `ip:${ip}`, ip, session };
}

/** Compteur partagé entre les instances. `reason: "timeout"` : Redis n'a pas répondu à temps. */
export interface SharedLimiter {
  limit(key: string): Promise<{ success: boolean; reset: number; reason?: string }>;
}
/** Fabrique d'un compteur partagé, ou null sans magasin partagé configuré. */
export type SharedLimiterFactory = (name: string, limit: number, windowMs: number) => SharedLimiter | null;

let redis: Redis | null | undefined;
/** Fenêtre glissante dans Redis (Upstash). Au-delà de 1,5 s sans réponse, la mémoire prend le relais. */
export const upstashLimiter: SharedLimiterFactory = (name, limit, windowMs) => {
  if (redis === undefined) {
    const credentials = redisEnv();
    redis = credentials ? new Redis(credentials) : null;
  }
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${Math.round(windowMs / 1000)} s`),
    prefix: `nesalio:rate:${name}`,
    timeout: 1500,
    analytics: false,
  });
};

/** Ni l'adresse ni l'identifiant du compte ne sont écrits en clair dans Redis. */
const sharedKey = (key: string) => createHash("sha256").update(key).digest("hex").slice(0, 32);

type SessionLimitResult = RateLimitResult & { session: string | null };

/**
 * Une limite par session et un plafond par adresse (par défaut 12 fois la limite d'une session).
 * `name` : nom de la route, pour que chaque route ait ses propres compteurs dans Redis.
 */
export function createSessionLimits(options: {
  name: string;
  limit: number;
  windowMs: number;
  ipFactor?: number;
  developerAccess?: boolean;
  shared?: SharedLimiterFactory;
}) {
  const ipLimit = options.limit * (options.ipFactor ?? 12);
  const perUser = createRateLimiter({ limit: options.limit, windowMs: options.windowMs });
  const perIp = createRateLimiter({ limit: ipLimit, windowMs: options.windowMs });
  // Créés à la première requête : la configuration n'est pas lue au chargement du module.
  let shared: { user: SharedLimiter; ip: SharedLimiter } | null | undefined;
  function sharedLimiters() {
    if (shared === undefined) {
      const factory = options.shared ?? upstashLimiter;
      const user = factory(`${options.name}:u`, options.limit, options.windowMs);
      const ip = factory(`${options.name}:ip`, ipLimit, options.windowMs);
      shared = user && ip ? { user, ip } : null;
    }
    return shared;
  }
  // Identité attribuée côté serveur après validation du cookie privé.
  const exempt = (accountId?: string) => Boolean(options.developerAccess && accountId === "development-guest");

  /** Compteur en mémoire de cette instance : le repli de `limit()`, et la limite locale sans Redis. */
  function check(headers: Headers, now = Date.now(), accountId?: string): SessionLimitResult {
    const keys = requestKeys(headers, accountId);
    if (exempt(accountId)) return { allowed: true, retryAfterSeconds: 0, session: keys.session };
    const ip = perIp.check(keys.ip, now);
    if (!ip.allowed) return { ...ip, session: keys.session };
    return { ...perUser.check(keys.user, now), session: keys.session };
  }

  return {
    check,
    /** La limite des routes : compteur partagé, ou la mémoire s'il manque ou ne répond pas. */
    async limit(headers: Headers, accountId?: string): Promise<SessionLimitResult> {
      const keys = requestKeys(headers, accountId);
      if (exempt(accountId)) return { allowed: true, retryAfterSeconds: 0, session: keys.session };
      try {
        const limiters = sharedLimiters();
        if (limiters) {
          const refused = (reset: number): SessionLimitResult => ({
            allowed: false,
            retryAfterSeconds: Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
            session: keys.session,
          });
          const ip = await limiters.ip.limit(sharedKey(keys.ip));
          if (ip.reason === "timeout") throw new Error("délai dépassé");
          if (!ip.success) return refused(ip.reset);
          const user = await limiters.user.limit(sharedKey(keys.user));
          if (user.reason === "timeout") throw new Error("délai dépassé");
          return user.success ? { allowed: true, retryAfterSeconds: 0, session: keys.session } : refused(user.reset);
        }
      } catch (error) {
        console.warn("Limite partagée indisponible, repli sur la mémoire de l'instance.", (error as Error).message);
      }
      return check(headers, undefined, accountId);
    },
  };
}
export type SessionLimits = ReturnType<typeof createSessionLimits>;
