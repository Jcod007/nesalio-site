import { createHmac, timingSafeEqual } from "node:crypto";

export const DEV_COOKIE = "nesalio_dev";

function token(env: NodeJS.ProcessEnv): string | undefined {
  const value = env.NESALIO_DEV_ACCESS_TOKEN?.trim();
  return value && value.length >= 32 ? value : undefined;
}

function equals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function validDevKey(key: string | null, env: NodeJS.ProcessEnv = process.env): boolean {
  const expected = token(env);
  return Boolean(expected && key && equals(key, expected));
}

export function devCookieValue(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const secret = token(env);
  return secret ? createHmac("sha256", secret).update("nesalio-development-access-v1").digest("hex") : undefined;
}

export function validDevCookie(cookie: string | null, env: NodeJS.ProcessEnv = process.env): boolean {
  const expected = devCookieValue(env);
  const value = cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${DEV_COOKIE}=`))?.slice(DEV_COOKIE.length + 1);
  return Boolean(expected && value && equals(value, expected));
}

