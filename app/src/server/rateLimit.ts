/**
 * Limite d'usage par adresse IP (fenêtre glissante, en mémoire).
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
