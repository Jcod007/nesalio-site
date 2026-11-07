import { createHash, timingSafeEqual } from "node:crypto";

/** Administrative secrets are accepted only as credentials, never as URL parameters. */
export function hasSelfTestAccess(request: Request, env: NodeJS.ProcessEnv = process.env): boolean {
  const expected = env.SELFTEST_TOKEN?.trim();
  if (!expected) return false;
  const actual = request.headers.get("authorization");
  if (!actual?.startsWith("Bearer ")) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(actual.slice(7)), digest(expected));
}
