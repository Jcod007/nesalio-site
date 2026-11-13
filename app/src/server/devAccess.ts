import { createHmac, timingSafeEqual } from "node:crypto";

export const DEV_COOKIE = "nesalio_dev";
/** Le cookie porte sa date de fin : passé ce délai, il faut redonner le secret. */
export const DEV_COOKIE_DAYS = 7;
const LIFETIME = DEV_COOKIE_DAYS * 24 * 60 * 60 * 1000;

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

const sign = (secret: string, expires: string) => createHmac("sha256", secret).update(`nesalio-development-access-v2:${expires}`).digest("hex");

/** « v2.<fin en millisecondes>.<signature> » : la date de fin est signée, on ne peut pas la repousser. */
export function devCookieValue(env: NodeJS.ProcessEnv = process.env, now = Date.now()): string | undefined {
  const secret = token(env);
  if (!secret) return undefined;
  const expires = String(now + LIFETIME);
  return `v2.${expires}.${sign(secret, expires)}`;
}

export function validDevCookie(cookie: string | null, env: NodeJS.ProcessEnv = process.env, now = Date.now()): boolean {
  const secret = token(env);
  const value = cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${DEV_COOKIE}=`))
    ?.slice(DEV_COOKIE.length + 1);
  if (!secret || !value) return false;
  const [version, expires, signature, ...extra] = value.split(".");
  if (version !== "v2" || !expires || !signature || extra.length || !/^\d{13}$/.test(expires)) return false;
  return equals(signature, sign(secret, expires)) && Number(expires) > now;
}
