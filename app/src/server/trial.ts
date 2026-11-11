import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { accountOrigins } from "./authConfig";
import { privateTrialStore, type TrialStore } from "./trialStore";

export const TRIAL_COOKIE_NAME = "__Host-nesalio_trial";
export const FREE_TRIAL_TURNS = 3;
export type TrialOperation = "tutor" | "voice" | "transcribe" | "feedback";
export type TrialAccess = { ok: true; guestId: string; remaining: number; headers: Headers } | { ok: false; response: Response };
export interface TrialStatus {
  enabled: boolean;
  hasTrial: boolean;
  remaining: number;
  exhausted: boolean;
}

const DAY = 86_400_000;
const LIFETIME = 30 * DAY;
const PREFIX = "nesalio-trials/v1/";
const MAX_RETRIES = 8;
const VOICE_GRACE = 10 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CAPS = {
  tutor: { guest: FREE_TRIAL_TURNS, ip: 60, global: 100 },
  voice: { guest: 48, ip: 960, global: 1600 },
  transcribe: { guest: 3, ip: 60, global: 100 },
  feedback: { guest: 4, ip: 12, global: 100 },
  initialize: { ip: 20, global: 100 },
} as const;

interface Identity {
  id: string;
  issued: number;
  expires: number;
}
interface Guest extends Identity {
  kind: "guest";
  tutor: number;
  voice: number;
  transcribe: number;
  feedback: number;
  voiceUntil: number;
}
interface Counter {
  kind: "counter";
  count: number;
}
type State = Guest | Counter;

class QuotaReached extends Error {}

function unavailable(): TrialAccess {
  return {
    ok: false,
    response: Response.json(
      { code: "trial_unavailable", error: "L’essai est temporairement indisponible. Connecte-toi pour continuer." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", Vary: "Cookie, Origin" },
      },
    ),
  };
}

function exhausted(headers?: Headers): TrialAccess {
  const output = new Headers(headers);
  output.set("Cache-Control", "no-store");
  output.set("Vary", "Cookie, Origin");
  output.set("X-Nesalio-Account-Required", "1");
  return {
    ok: false,
    response: Response.json(
      { code: "trial_exhausted", error: "Crée ton compte gratuit pour continuer sans perdre ta séance." },
      { status: 401, headers: output },
    ),
  };
}

function isGuest(value: unknown): value is Guest {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<Guest>;
  return (
    record.kind === "guest" &&
    typeof record.id === "string" &&
    UUID.test(record.id) &&
    [record.issued, record.expires, record.voiceUntil, record.tutor, record.voice, record.transcribe, record.feedback].every(
      (n) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0,
    ) &&
    record.expires === record.issued! + LIFETIME
  );
}

function isCounter(value: unknown): value is Counter {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<Counter>;
  return record.kind === "counter" && typeof record.count === "number" && Number.isSafeInteger(record.count) && record.count >= 0;
}

/** Injectable storage makes concurrent requests testable without weakening production checks. */
export function createTrialService(options: { store?: TrialStore; env?: NodeJS.ProcessEnv; now?: () => number } = {}) {
  const store = options.store ?? privateTrialStore;
  const env = options.env ?? process.env;
  const clock = options.now ?? Date.now;
  const namespace = env.VERCEL_ENV === "production" ? "production" : env.VERCEL_ENV === "preview" ? "preview" : "development";
  const prefix = `${PREFIX}${namespace}/`;
  const secret = () => env.TRIAL_COOKIE_SECRET?.trim() ?? "";
  const enabled = () => Buffer.byteLength(secret(), "utf8") >= 32 && Boolean(env.BLOB_READ_WRITE_TOKEN?.trim());
  const mac = (value: string) => createHmac("sha256", secret()).update(value).digest("base64url");
  const guestPath = (identity: Identity) => `${prefix}guests/${new Date(identity.issued).toISOString().slice(0, 10)}/${identity.id}.json`;

  function parseIdentity(request: Request, now: number): Identity | null {
    const cookie = request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${TRIAL_COOKIE_NAME}=`));
    if (!cookie) return null;
    const [version, id, issuedText, expiresText, signature, ...extra] = cookie.slice(TRIAL_COOKIE_NAME.length + 1).split(".");
    if (version !== "v1" || !id || !UUID.test(id) || !issuedText || !expiresText || !signature || extra.length) return null;
    if (!/^\d{13}$/.test(issuedText) || !/^\d{13}$/.test(expiresText) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
    const issued = Number(issuedText),
      expires = Number(expiresText);
    if (issued > now || expires <= now || expires !== issued + LIFETIME) return null;
    const signed = `v1.${id}.${issuedText}.${expiresText}`;
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(mac(`cookie:${signed}`)))) return null;
    return { id, issued, expires };
  }

  function cookieHeader(identity: Identity): Headers {
    const data = `v1.${identity.id}.${identity.issued}.${identity.expires}`;
    return new Headers({
      "Set-Cookie": `${TRIAL_COOKIE_NAME}=${data}.${mac(`cookie:${data}`)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${LIFETIME / 1000}`,
      "Cache-Control": "no-store",
      Vary: "Cookie, Origin",
    });
  }

  function originError(request: Request): TrialAccess | null {
    const origin = request.headers.get("origin");
    if (request.headers.get("sec-fetch-site") === "cross-site" || (origin !== null && !accountOrigins(env).includes(origin))) {
      return {
        ok: false,
        response: Response.json({ error: "Cette requête ne vient pas de Nesalio." }, { status: 403, headers: { "Cache-Control": "no-store" } }),
      };
    }
    return null;
  }

  async function update(path: string, validate: (value: unknown) => value is State, change: (current: State | null) => State): Promise<State> {
    for (let retry = 0; retry < MAX_RETRIES; retry++) {
      const entry = await store.read(path);
      if (entry && !validate(entry.value)) throw new Error("Invalid trial state");
      const next = change(entry ? (entry.value as State) : null);
      const saved = entry ? await store.replace(path, next, entry.etag) : await store.create(path, next);
      if (saved) return next;
    }
    throw new Error("Trial quota contention");
  }

  async function reserveDaily(request: Request, operation: TrialOperation | "initialize", now: number) {
    const day = new Date(now).toISOString().slice(0, 10);
    // Vercel supplies the trusted forwarding header. HMAC, not a plain IP hash,
    // prevents offline recovery of addresses; rotate the pseudonym every UTC day.
    const forwarded = env.VERCEL ? request.headers.get("x-vercel-forwarded-for") : request.headers.get("x-forwarded-for");
    const address = forwarded?.split(",")[0]?.trim() || "unknown";
    const ip = mac(`ip:${namespace}:${day}:${address}`);
    // Global first: after its cap, rotated/spoofed client identities cannot
    // create unbounded per-IP quota files. Partial failures may spend a slot.
    for (const [scope, cap] of [
      ["global", CAPS[operation].global],
      [`ip/${ip}`, CAPS[operation].ip],
    ] as const) {
      const path = `${prefix}daily/${day}/${operation}/${scope}.json`;
      await update(path, isCounter, (state) => {
        const count = (state as Counter | null)?.count ?? 0;
        if (count >= cap) throw new QuotaReached();
        return { kind: "counter", count: count + 1 };
      });
    }
  }

  async function existingGuest(identity: Identity): Promise<Guest | null> {
    const entry = await store.read(guestPath(identity));
    if (!entry) return null;
    if (!isGuest(entry.value) || entry.value.id !== identity.id || entry.value.issued !== identity.issued || entry.value.expires !== identity.expires)
      throw new Error("Invalid trial identity");
    return entry.value;
  }

  async function identify(request: Request, now: number, create: boolean): Promise<{ guest: Guest; headers: Headers } | null> {
    const identity = parseIdentity(request, now);
    if (identity) {
      const guest = await existingGuest(identity);
      // Never recreate a consumed/deleted durable record from a valid old cookie.
      return guest ? { guest, headers: new Headers() } : null;
    }
    if (!create) return null;
    await reserveDaily(request, "initialize", now);
    const guest: Guest = {
      kind: "guest",
      id: randomUUID(),
      issued: now,
      expires: now + LIFETIME,
      tutor: 0,
      voice: 0,
      transcribe: 0,
      feedback: 0,
      voiceUntil: 0,
    };
    if (!(await store.create(guestPath(guest), guest))) throw new Error("Trial creation collision");
    return { guest, headers: cookieHeader(guest) };
  }

  async function initializeTrial(request: Request): Promise<TrialAccess> {
    const forbidden = originError(request);
    if (forbidden) return forbidden;
    if (!enabled()) return unavailable();
    try {
      const found = await identify(request, clock(), true);
      return found ? { ok: true, guestId: found.guest.id, remaining: Math.max(0, FREE_TRIAL_TURNS - found.guest.tutor), headers: found.headers } : exhausted();
    } catch (error) {
      return error instanceof QuotaReached ? exhausted() : unavailable();
    }
  }

  async function authorizeTrial(request: Request, operation: TrialOperation): Promise<TrialAccess> {
    const forbidden = originError(request);
    if (forbidden) return forbidden;
    if (!enabled()) return unavailable();
    let headers = new Headers();
    try {
      const now = clock();
      const found = await identify(request, now, operation === "tutor" || operation === "transcribe");
      if (!found) return exhausted();
      headers = found.headers;
      const allowed = (guest: Guest) =>
        guest.expires > now &&
        guest[operation] < CAPS[operation].guest &&
        (operation === "voice" ? guest.tutor > 0 && guest.voiceUntil > now : operation === "feedback" || guest.tutor < FREE_TRIAL_TURNS);
      if (!allowed(found.guest)) return exhausted(headers);
      // Separate durable reservations deliberately never refund on partial
      // failure: an outage may overcount, but cannot grant extra paid operations.
      await reserveDaily(request, operation, now);
      const next = (await update(guestPath(found.guest), isGuest, (state) => {
        if (!state || !isGuest(state) || !allowed(state)) throw new QuotaReached();
        return { ...state, [operation]: state[operation] + 1, ...(operation === "tutor" ? { voiceUntil: now + VOICE_GRACE } : {}) };
      })) as Guest;
      return { ok: true, guestId: next.id, remaining: Math.max(0, FREE_TRIAL_TURNS - next.tutor), headers };
    } catch (error) {
      return error instanceof QuotaReached ? exhausted(headers) : unavailable();
    }
  }

  async function getTrialStatus(request: Request): Promise<TrialStatus> {
    if (!enabled()) return { enabled: false, hasTrial: false, remaining: 0, exhausted: true };
    try {
      const identity = parseIdentity(request, clock());
      if (!identity) return { enabled: true, hasTrial: false, remaining: FREE_TRIAL_TURNS, exhausted: false };
      const guest = await existingGuest(identity);
      const remaining = guest ? Math.max(0, FREE_TRIAL_TURNS - guest.tutor) : 0;
      return { enabled: true, hasTrial: true, remaining, exhausted: remaining === 0 };
    } catch {
      return { enabled: false, hasTrial: false, remaining: 0, exhausted: true };
    }
  }

  async function purgeExpiredTrials(now: Date = new Date(clock())): Promise<number> {
    if (!env.BLOB_READ_WRITE_TOKEN) return 0;
    const guests = await store.removeOlder(`${prefix}guests/`, new Date(now.getTime() - 31 * DAY));
    const daily = await store.removeOlder(`${prefix}daily/`, new Date(now.getTime() - 7 * DAY));
    return guests + daily;
  }

  return { initializeTrial, authorizeTrial, getTrialStatus, purgeExpiredTrials };
}

const trialService = createTrialService();
export const initializeTrial = trialService.initializeTrial;
export const authorizeTrial = trialService.authorizeTrial;
export const getTrialStatus = trialService.getTrialStatus;
export const purgeExpiredTrials = trialService.purgeExpiredTrials;
