/** Explicit configuration: never provision a development identity service implicitly. */
export function accountAuthConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() && env.CLERK_SECRET_KEY?.trim());
}

/** A local demonstration can never spend AI credits or bypass deployed authentication. */
export function localAccountDemo(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NESALIO_LOCAL_DEMO === "1" && env.DISABLE_AI === "1" && !env.VERCEL && env.NODE_ENV !== "production";
}

export function accountOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const candidates = [env.NEXT_PUBLIC_APP_URL];
  for (const host of [env.VERCEL_URL, env.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (host) candidates.push(`https://${host}`);
  }
  if (!env.VERCEL && env.NODE_ENV !== "production") candidates.push("http://localhost:3000", "http://127.0.0.1:3000");
  const origins = new Set<string>();
  for (const value of candidates) {
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.hostname.includes("*") || url.username || url.password) continue;
      if (url.protocol === "https:" || (!env.VERCEL && env.NODE_ENV !== "production" && url.protocol === "http:")) origins.add(url.origin);
    } catch {
      /* Invalid configuration does not create an allowed origin. */
    }
  }
  return [...origins];
}
