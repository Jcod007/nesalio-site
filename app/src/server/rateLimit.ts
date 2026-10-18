import { isSessionId, SESSION_HEADER } from "@/domain/session";

/**
 * Limite d'usage par session de navigation, avec un plafond plus large par
 * adresse IP (fenêtre glissante, en mémoire).
 *
 * Par session : plusieurs personnes derrière la même adresse (une classe sur
 * le Wi-Fi de l'école) ont chacune leur propre limite. Le plafond par adresse
 * empêche de contourner la limite en changeant de session à chaque requête.
 *
 * Suffisant pour un prototype : chaque instance serverless garde son propre
 * compteur, donc la limite réelle est approximative. Pour la production,
 * remplacer le magasin par un stockage partagé (Upstash Redis, Vercel KV…)
 * sans toucher aux appelants.
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
export function requestKeys(headers: Headers): { user: string; ip: string; session: string | null } {
  const ip = clientKey(headers);
  const raw = headers.get(SESSION_HEADER);
  const session = isSessionId(raw) ? raw : null;
  return { user: session ? `s:${session}` : `ip:${ip}`, ip, session };
}

/** Une limite par session et un plafond par adresse (par défaut 12 fois la limite d'une session). */
export function createSessionLimits(options: { limit: number; windowMs: number; ipFactor?: number }) {
  const perUser = createRateLimiter({ limit: options.limit, windowMs: options.windowMs });
  const perIp = createRateLimiter({ limit: options.limit * (options.ipFactor ?? 12), windowMs: options.windowMs });
  return {
    check(headers: Headers, now = Date.now()): RateLimitResult & { session: string | null } {
      const keys = requestKeys(headers);
      const ip = perIp.check(keys.ip, now);
      if (!ip.allowed) return { ...ip, session: keys.session };
      return { ...perUser.check(keys.user, now), session: keys.session };
    },
  };
}
export type SessionLimits = ReturnType<typeof createSessionLimits>;
