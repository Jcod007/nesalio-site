import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNT_CANCELLED, ACCOUNT_READY, ACCOUNT_REQUIRED, TRIAL_UPDATED } from "@/services/trialEvents";
import { createHttpSource } from "./httpSource";

vi.mock("@/services/session", () => ({ sessionHeaders: () => ({ "x-nesalio-session": "test-session" }) }));

const request = { mode: "question" as const, question: "Comment trouver les zéros ?" };
const end = { kind: "end", summary: [] };
const denied = () => new Response(JSON.stringify({ kind: "error", code: "upstream", message: "Connecte-toi pour continuer." }) + "\n", {
  status: 401, headers: { "X-Nesalio-Account-Required": "1", "X-Nesalio-Trial-Remaining": "0" },
});
const accepted = (remaining?: string) => new Response(JSON.stringify(end) + "\n", {
  headers: remaining === undefined ? {} : { "X-Nesalio-Trial-Remaining": remaining },
});

beforeEach(() => vi.stubGlobal("window", new EventTarget()));
afterEach(() => vi.unstubAllGlobals());

describe("limited trial HTTP source", () => {
  it("announces the server count while still playing the complete third response", async () => {
    const counts: number[] = [];
    window.addEventListener(TRIAL_UPDATED, (event) => counts.push((event as CustomEvent).detail.remaining));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(accepted("0")));
    const events = [];
    for await (const event of createHttpSource().open(request, new AbortController().signal)) events.push(event);
    expect(events).toEqual([end]);
    expect(counts).toEqual([0]);
  });

  it("holds a denied fourth turn without resending until explicit continuation", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(denied()).mockResolvedValueOnce(accepted());
    vi.stubGlobal("fetch", fetch);
    const prompted = new Promise<void>((resolve) => window.addEventListener(ACCOUNT_REQUIRED, () => resolve(), { once: true }));
    const iterator = createHttpSource().open(request, new AbortController().signal)[Symbol.asyncIterator]();
    let settled = false;
    const next = iterator.next().then((value) => { settled = true; return value; });
    await prompted;
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event(ACCOUNT_READY));
    expect((await next).value).toEqual(end);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]![1].body).toBe(fetch.mock.calls[0]![1].body);
    await iterator.return?.();
  });

  it.each(["abort", "new-topic"])("releases a waiting turn on %s without another request", async (reason) => {
    const fetch = vi.fn().mockResolvedValueOnce(denied());
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    const prompted = new Promise<void>((resolve) => window.addEventListener(ACCOUNT_REQUIRED, () => resolve(), { once: true }));
    const next = createHttpSource().open(request, controller.signal)[Symbol.asyncIterator]().next();
    await prompted;
    if (reason === "abort") controller.abort();
    else window.dispatchEvent(new Event(ACCOUNT_CANCELLED));
    expect((await next).done).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps unrelated authentication failures as errors instead of opening a trial gate", async () => {
    const prompt = vi.fn();
    window.addEventListener(ACCOUNT_REQUIRED, prompt);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ kind: "error", code: "upstream", message: "Connexion indisponible" }) + "\n", { status: 503 })));
    const iterator = createHttpSource().open(request, new AbortController().signal)[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toMatchObject({ kind: "error", message: "Connexion indisponible" });
    expect(prompt).not.toHaveBeenCalled();
    await iterator.return?.();
  });
});
