import { describe, expect, it } from "vitest";
import { createTrialService, TRIAL_COOKIE_NAME, type TrialAccess } from "./trial";
import type { TrialEntry, TrialStore } from "./trialStore";

class MemoryStore implements TrialStore {
  entries = new Map<string, TrialEntry>();
  writes = 0;
  removals: Array<{ prefix: string; before: Date }> = [];
  async read(path: string) {
    return structuredClone(this.entries.get(path) ?? null);
  }
  async create(path: string, value: unknown) {
    if (this.entries.has(path)) return false;
    this.entries.set(path, { etag: String(++this.writes), value: structuredClone(value) });
    return true;
  }
  async replace(path: string, value: unknown, etag: string) {
    if (this.entries.get(path)?.etag !== etag) return false;
    this.entries.set(path, { etag: String(++this.writes), value: structuredClone(value) });
    return true;
  }
  async removeOlder(prefix: string, before: Date) {
    this.removals.push({ prefix, before });
    return 0;
  }
}

const baseline = Date.UTC(2026, 10, 4, 18);
const env = (): NodeJS.ProcessEnv => ({
  TRIAL_COOKIE_SECRET: "a-dedicated-long-test-secret-at-least-32-bytes",
  BLOB_READ_WRITE_TOKEN: "a-private-storage-token",
  VERCEL: "1",
  VERCEL_ENV: "production",
  NODE_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://app.nesalio.com",
});
const request = (cookie?: string, ip = "198.51.100.42", more: Record<string, string> = {}) =>
  new Request("https://app.nesalio.com/api/tutor", {
    method: "POST",
    headers: { origin: "https://app.nesalio.com", "x-vercel-forwarded-for": ip, ...(cookie ? { cookie } : {}), ...more },
  });
function cookieOf(result: TrialAccess): string {
  if (!result.ok) throw new Error(`Trial denied: ${result.response.status}`);
  const cookie = result.headers.get("set-cookie");
  if (!cookie) throw new Error("No trial cookie");
  return cookie.split(";")[0]!;
}
function fixture() {
  const store = new MemoryStore();
  const configuration = env();
  let now = baseline;
  const service = createTrialService({ store, env: configuration, now: () => now });
  return {
    store,
    configuration,
    service,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
  };
}

describe("durable anonymous trial", () => {
  it("reads a fresh status without allocating a cookie, quota or record", async () => {
    const { store, service } = fixture();
    expect(await service.getTrialStatus(request())).toEqual({ enabled: true, hasTrial: false, remaining: 3, exhausted: false });
    expect(store.entries.size).toBe(0);
    expect(store.writes).toBe(0);
  });

  it("initializes a signed host-only cookie without consuming a tutor turn", async () => {
    const { service } = fixture();
    const initialized = await service.initializeTrial(request());
    expect(initialized.ok).toBe(true);
    if (!initialized.ok) return;
    expect(initialized.remaining).toBe(3);
    const header = initialized.headers.get("set-cookie")!;
    expect(header).toContain(`${TRIAL_COOKIE_NAME}=v1.`);
    expect(header).toContain("Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000");
    expect(header).not.toContain("Domain=");
    expect(await service.getTrialStatus(request(cookieOf(initialized)))).toEqual({ enabled: true, hasTrial: true, remaining: 3, exhausted: false });
  });

  it("automatically initializes the first tutor call and permits exactly three reservations", async () => {
    const { service } = fixture();
    const first = await service.authorizeTrial(request(), "tutor");
    const cookie = cookieOf(first);
    expect(first.ok && first.remaining).toBe(2);
    expect((await service.authorizeTrial(request(cookie), "tutor")).ok).toBe(true);
    const third = await service.authorizeTrial(request(cookie), "tutor");
    expect(third.ok && third.remaining).toBe(0);
    const denied = await service.authorizeTrial(request(cookie), "tutor");
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.response.status).toBe(401);
      expect(denied.response.headers.get("x-nesalio-account-required")).toBe("1");
      expect(denied.response.headers.get("cache-control")).toBe("no-store");
      expect(await denied.response.json()).toMatchObject({ code: "trial_exhausted" });
    }
  });

  it("shares the quota across service instances and rejects concurrent replay beyond three turns", async () => {
    const { service, store, configuration } = fixture();
    const cookie = cookieOf(await service.initializeTrial(request()));
    const another = createTrialService({ store, env: configuration, now: () => baseline });
    const results = await Promise.all(Array.from({ length: 12 }, (_, index) => (index % 2 ? another : service).authorizeTrial(request(cookie), "tutor")));
    expect(results.filter((result) => result.ok)).toHaveLength(3);
    expect((await another.getTrialStatus(request(cookie))).remaining).toBe(0);
  });

  it("does not refund a reserved turn when downstream processing fails or a client retries", async () => {
    const { service } = fixture();
    const first = await service.authorizeTrial(request(), "tutor");
    const cookie = cookieOf(first);
    // The caller has not reported any success. Paid reservations still count.
    expect((await service.getTrialStatus(request(cookie))).remaining).toBe(2);
    await service.authorizeTrial(request(cookie), "tutor");
    expect((await service.getTrialStatus(request(cookie))).remaining).toBe(1);
  });

  it("bounds microphone calls before the initial question without granting unlimited voice calls", async () => {
    const { service } = fixture();
    const transcribed = await service.authorizeTrial(request(), "transcribe");
    const cookie = cookieOf(transcribed);
    expect(transcribed.ok && transcribed.remaining).toBe(3);
    expect((await service.authorizeTrial(request(cookie), "voice")).ok).toBe(false);
    await service.authorizeTrial(request(cookie), "transcribe");
    await service.authorizeTrial(request(cookie), "transcribe");
    expect((await service.authorizeTrial(request(cookie), "transcribe")).ok).toBe(false);
    expect((await service.getTrialStatus(request(cookie))).remaining).toBe(3);
  });

  it("allows bounded audio for the third response then expires its short playback grace", async () => {
    const { service, advance } = fixture();
    const cookie = cookieOf(await service.authorizeTrial(request(), "tutor"));
    await service.authorizeTrial(request(cookie), "tutor");
    await service.authorizeTrial(request(cookie), "tutor");
    expect((await service.authorizeTrial(request(cookie), "voice")).ok).toBe(true);
    expect((await service.authorizeTrial(request(cookie), "transcribe")).ok).toBe(false);
    advance(10 * 60_000 + 1);
    expect((await service.authorizeTrial(request(cookie), "voice")).ok).toBe(false);
  });

  it("permits only 48 voice calls per trial even during the playback grace", async () => {
    const { service } = fixture();
    const cookie = cookieOf(await service.authorizeTrial(request(), "tutor"));
    for (let i = 0; i < 48; i++) expect((await service.authorizeTrial(request(cookie), "voice")).ok).toBe(true);
    expect((await service.authorizeTrial(request(cookie), "voice")).ok).toBe(false);
    expect((await service.authorizeTrial(request(), "voice")).ok).toBe(false);
  });

  it("allows four feedback submissions with an issued cookie after the third response", async () => {
    const { service } = fixture();
    expect((await service.authorizeTrial(request(), "feedback")).ok).toBe(false);
    const cookie = cookieOf(await service.authorizeTrial(request(), "tutor"));
    await service.authorizeTrial(request(cookie), "tutor");
    await service.authorizeTrial(request(cookie), "tutor");
    for (let i = 0; i < 4; i++) expect((await service.authorizeTrial(request(cookie), "feedback")).ok).toBe(true);
    expect((await service.authorizeTrial(request(cookie), "feedback")).ok).toBe(false);
  });

  it("limits cookie clearing on the same platform-provided IP and stores no raw IP", async () => {
    const { service, store } = fixture();
    for (let i = 0; i < 20; i++) {
      const cookie = cookieOf(await service.initializeTrial(request()));
      for (let j = 0; j < 3; j++) expect((await service.authorizeTrial(request(cookie), "tutor")).ok).toBe(true);
    }
    expect((await service.initializeTrial(request())).ok).toBe(false);
    expect(JSON.stringify([...store.entries])).not.toContain("198.51.100.42");
  });

  it("ignores client spoofed forwarding headers on Vercel and shares the unknown-IP bucket", async () => {
    const { service } = fixture();
    for (let i = 0; i < 20; i++) {
      const input = request(undefined, "", { "x-forwarded-for": `203.0.113.${i}`, "x-real-ip": `203.0.113.${i}` });
      expect((await service.initializeTrial(input)).ok).toBe(true);
    }
    expect((await service.initializeTrial(request(undefined, "", { "x-forwarded-for": "192.0.2.234" }))).ok).toBe(false);
  });

  it("enforces a global daily limit of 100 tutor requests despite distinct IPs and cookies", async () => {
    const { service } = fixture();
    let allowed = 0;
    for (let i = 0; i < 35; i++) {
      const ip = `203.0.113.${i}`;
      const cookie = cookieOf(await service.initializeTrial(request(undefined, ip)));
      for (let j = 0; j < 3; j++) if ((await service.authorizeTrial(request(cookie, ip), "tutor")).ok) allowed++;
    }
    expect(allowed).toBe(100);
  });

  it("separates preview and production quotas even when the store and signing key are shared", async () => {
    const { service, store, configuration } = fixture();
    const cookie = cookieOf(await service.authorizeTrial(request(), "tutor"));
    const preview = createTrialService({ store, env: { ...configuration, VERCEL_ENV: "preview" }, now: () => baseline });
    expect((await preview.authorizeTrial(request(cookie), "tutor")).ok).toBe(false);
    const previewCookie = cookieOf(await preview.authorizeTrial(request(), "tutor"));
    expect((await preview.getTrialStatus(request(previewCookie))).remaining).toBe(2);
    expect((await service.getTrialStatus(request(cookie))).remaining).toBe(2);
    expect([...store.entries.keys()].some((path) => path.includes("/preview/"))).toBe(true);
    expect([...store.entries.keys()].some((path) => path.includes("/production/"))).toBe(true);
  });

  it("rejects foreign origins before performing storage operations", async () => {
    const { service, store } = fixture();
    const result = await service.authorizeTrial(request(undefined, "198.51.100.42", { origin: "https://evil.example" }), "tutor");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(store.writes).toBe(0);
  });

  it("fails closed on short/missing configuration and storage errors, ignoring RECORD_SESSIONS", async () => {
    const { service, configuration, store } = fixture();
    configuration.RECORD_SESSIONS = "0";
    expect((await service.initializeTrial(request())).ok).toBe(true);
    configuration.TRIAL_COOKIE_SECRET = "short";
    const missing = await service.authorizeTrial(request(), "tutor");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.response.status).toBe(503);
    configuration.TRIAL_COOKIE_SECRET = env().TRIAL_COOKIE_SECRET;
    store.read = async () => {
      throw new Error("storage outage with sensitive detail");
    };
    const broken = await service.authorizeTrial(request(), "tutor");
    expect(broken.ok).toBe(false);
    if (!broken.ok) {
      expect(broken.response.status).toBe(503);
      expect(await broken.response.text()).not.toContain("sensitive detail");
    }
  });

  it("expires guest identity after 30 days and never recreates a deleted durable identity", async () => {
    const { service, store, advance } = fixture();
    const cookie = cookieOf(await service.initializeTrial(request()));
    const path = [...store.entries.keys()].find((key) => key.includes("/guests/"))!;
    store.entries.delete(path);
    expect((await service.authorizeTrial(request(cookie), "tutor")).ok).toBe(false);
    expect(store.entries.has(path)).toBe(false);
    advance(31 * 86_400_000);
    expect((await service.authorizeTrial(request(cookie), "voice")).ok).toBe(false);
  });

  it("rejects corrupt durable records and bounded compare-and-swap contention", async () => {
    const { service, store } = fixture();
    const cookie = cookieOf(await service.initializeTrial(request()));
    const path = [...store.entries.keys()].find((key) => key.includes("/guests/"))!;
    store.entries.get(path)!.value = { kind: "guest", tutor: -9000 };
    const corrupt = await service.authorizeTrial(request(cookie), "tutor");
    expect(corrupt.ok).toBe(false);
    if (!corrupt.ok) expect(corrupt.response.status).toBe(503);
    const other = fixture();
    other.store.replace = async () => false;
    const first = await other.service.initializeTrial(request());
    expect(first.ok).toBe(true);
    const busy = await other.service.authorizeTrial(request(cookieOf(first)), "tutor");
    expect(busy.ok).toBe(false);
    if (!busy.ok) expect(busy.response.status).toBe(503);
  });

  it("keeps quota cleanup separate from transcript retention and limited to its namespace", async () => {
    const { service, store } = fixture();
    await service.purgeExpiredTrials(new Date(baseline));
    expect(store.removals).toEqual([
      { prefix: "nesalio-trials/v1/production/guests/", before: new Date(baseline - 31 * 86_400_000) },
      { prefix: "nesalio-trials/v1/production/daily/", before: new Date(baseline - 7 * 86_400_000) },
    ]);
  });
});
