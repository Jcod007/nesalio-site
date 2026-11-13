import { createHash, timingSafeEqual } from "node:crypto";

/** Compares the bearer credential in constant time; an unset secret never matches. */
function hasBearer(request: Request, secret: string | undefined): boolean {
  const expected = secret?.trim();
  if (!expected) return false;
  const actual = request.headers.get("authorization");
  if (!actual?.startsWith("Bearer ")) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(actual.slice(7)), digest(expected));
}

/** Administrative secrets are accepted only as credentials, never as URL parameters. */
export function hasSelfTestAccess(request: Request, env: NodeJS.ProcessEnv = process.env): boolean {
  return hasBearer(request, env.SELFTEST_TOKEN);
}

/** The scheduled task of Vercel sends « Authorization: Bearer <CRON_SECRET> ». */
export function hasCronAccess(request: Request, env: NodeJS.ProcessEnv = process.env): boolean {
  return hasBearer(request, env.CRON_SECRET);
}
